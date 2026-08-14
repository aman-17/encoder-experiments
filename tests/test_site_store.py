"""SITE-MODE storage: manifest determinism, the transparent probe_fit reader,
the exact-6dp match contract, the sweep metadata contract — and the
load-bearing parity test: on real images with a real probes.jsonl slice and
the real CLIP tower, site-mode vectors must be BIT-IDENTICAL to features_at
on the loaded full grid (same fp16 rounding path). If site mode drifts from
full-grid by even one bit, every budget-sweep comparison is quietly
apples-to-oranges."""

import json
import random
from pathlib import Path

import numpy as np
import pytest
import torch
from safetensors import safe_open

from encoder_experiments.adapters.base import EncoderFeatures
from encoder_experiments.extract import safe_image_id, save_features, save_sites
from encoder_experiments.probe_fit import assemble_features, load_probes
from encoder_experiments.site_store import (
    SITES_SUFFIX,
    build_site_manifest,
    load_site_manifest,
    round6,
    write_site_manifest,
)
from encoder_experiments.sites import features_at

REPO = Path(__file__).resolve().parent.parent
PILOT = REPO / "data" / "pilot_1k"


def _write_jsonl(path, rows):
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    return path


# --------------------------------------------------------------------------- #
# manifest: determinism, uniqueness, pooled handling
# --------------------------------------------------------------------------- #

PROBE_ROWS = [
    {"probe": "cell_row", "image_id": "b/img2", "point_xy": [0.5, 0.25], "label": 1},
    {"probe": "series_id", "image_id": "a/img1", "point_xy": [0.1234564, 0.75], "label": 0},
    {"probe": "cell_col", "image_id": "b/img2", "point_xy": [0.5, 0.25], "label": 2},
    # same 6dp point as the series_id row above -> must merge, probes unioned
    {"probe": "point_value", "image_id": "a/img1", "point_xy": [0.12345641, 0.75], "label": 3.5},
    {"probe": "pl3_summary", "image_id": "a/img1", "label": [1.0, 0.0]},
    {"probe": "glyph_id", "image_id": "a/img1", "point_xy": [0.1, 0.9], "label": "x"},
    {"probe": "doc_cls", "image_id": "b/img2", "site": "pooled", "label": "k"},
]


def test_manifest_deterministic_regardless_of_row_order(tmp_path):
    m1 = build_site_manifest(_write_jsonl(tmp_path / "a.jsonl", PROBE_ROWS))
    shuffled = list(PROBE_ROWS)
    random.Random(3).shuffle(shuffled)
    m2 = build_site_manifest(_write_jsonl(tmp_path / "b.jsonl", shuffled))
    assert json.dumps(m1, sort_keys=True) == json.dumps(m2, sort_keys=True)
    # insertion order itself is deterministic too (image keys sorted)
    assert list(m1["images"]) == list(m2["images"]) == ["a/img1", "b/img2"]


def test_manifest_points_sorted_unique_6dp_with_probe_usage(tmp_path):
    m = build_site_manifest(_write_jsonl(tmp_path / "p.jsonl", PROBE_ROWS))
    img1 = m["images"]["a/img1"]
    # 0.1234564 and 0.12345641 collapse to one 6dp point; sorted by (x, y)
    assert img1["points"] == [[0.1, 0.9], [0.123456, 0.75]]
    assert img1["point_probes"] == [["glyph_id"], ["point_value", "series_id"]]
    assert img1["pooled_probes"] == ["pl3_summary"]
    img2 = m["images"]["b/img2"]
    assert img2["points"] == [[0.5, 0.25]]
    assert img2["point_probes"] == [["cell_col", "cell_row"]]  # shared point, unioned
    assert img2["pooled_probes"] == ["doc_cls"]  # explicit site: "pooled"


def test_manifest_rejects_site_row_without_point(tmp_path):
    rows = [{"probe": "series_id", "image_id": "a", "label": 0}]
    with pytest.raises(ValueError, match="point_xy"):
        build_site_manifest(_write_jsonl(tmp_path / "bad.jsonl", rows))


def test_load_site_manifest_sniffs_both_formats(tmp_path):
    probes = _write_jsonl(tmp_path / "probes.jsonl", PROBE_ROWS)
    built = build_site_manifest(probes)
    # raw probes.jsonl -> built on the fly
    assert load_site_manifest(probes) == built
    # precomputed manifest -> loaded verbatim
    mpath = tmp_path / "sites.json"
    write_site_manifest(built, mpath)
    assert load_site_manifest(mpath) == built
    # future version -> loud
    bad = dict(built, version=999)
    write_site_manifest(bad, tmp_path / "v999.json")
    with pytest.raises(ValueError, match="version"):
        load_site_manifest(tmp_path / "v999.json")


# --------------------------------------------------------------------------- #
# reader: transparent lookup, exact-6dp contract, sweep metadata
# --------------------------------------------------------------------------- #

GRID, DIM = 8, 16


def _fake_feats(seed: int) -> EncoderFeatures:
    rng = np.random.default_rng(seed)
    return EncoderFeatures(
        tokens=torch.from_numpy(rng.normal(size=(GRID * GRID, DIM))).float(),
        grid_hw=(GRID, GRID),
        pooled=torch.from_numpy(rng.normal(size=DIM)).float(),
    )


def _probe_rows(image_id, points, with_pooled=True):
    rows = [
        {"probe": "series_id", "image_id": image_id, "point_xy": [x, y], "label": 0}
        for x, y in points
    ]
    if with_pooled:
        rows.append({"probe": "pl3_summary", "image_id": image_id, "label": [1.0]})
    return rows


def _load_family_rows(tmp_path, rows):
    probes = _write_jsonl(tmp_path / "rows.jsonl", rows)
    fams = load_probes(probes)
    return [r for fam in fams.values() for r in fam]


def test_reader_sites_file_matches_full_grid_bitwise(tmp_path):
    # off-center points so interpolation actually happens: the site vector must
    # equal the full-grid features_at result pushed through the fp16 storage
    # cast — the SAME rounding path, nothing more.
    points = [[0.123457, 0.654321], [0.5, 0.5], [round6((3 + 0.5) / GRID), 0.9]]
    feats = _fake_feats(0)
    meta = {"encoder": "fake", "mechanism": "resolution", "knob": "image_size=336"}

    full_dir = tmp_path / "full" / "enc"
    sites_dir = tmp_path / "sites" / "enc"
    full_dir.mkdir(parents=True)
    sites_dir.mkdir(parents=True)
    save_features(full_dir / "img.safetensors", feats, meta)
    save_sites(sites_dir / f"img{SITES_SUFFIX}", feats, points, meta)

    rows = _load_family_rows(tmp_path, _probe_rows("img", points))
    X_full, kept_f, miss_f, meta_f = assemble_features(rows, full_dir)
    X_site, kept_s, miss_s, meta_s = assemble_features(rows, sites_dir)
    assert miss_f == miss_s == 0
    assert [r.probe for r in kept_f] == [r.probe for r in kept_s]
    # pooled rows: identical bits in both layouts
    pooled_rows = [i for i, r in enumerate(kept_f) if r.pooled]
    assert np.array_equal(X_full[pooled_rows], X_site[pooled_rows])
    # site rows: sites == fp16(features_at(full grid)) exactly
    site_rows = [i for i, r in enumerate(kept_f) if not r.pooled]
    expected = X_full[site_rows].astype(np.float16).astype(np.float32)
    assert np.array_equal(X_site[site_rows], expected)
    # sweep metadata read identically from both layouts
    for m in (meta_f, meta_s):
        assert m["mechanism"] == "resolution"
        assert m["knob"] == "image_size=336"
        assert m["budget_tokens"] == GRID * GRID


def test_reader_missing_point_is_hard_error_naming_nearest(tmp_path):
    points = [[0.25, 0.25], [0.75, 0.75]]
    enc_dir = tmp_path / "enc"
    enc_dir.mkdir()
    save_sites(enc_dir / f"img{SITES_SUFFIX}", _fake_feats(1), points, {"encoder": "fake"})

    rows = _load_family_rows(
        tmp_path, _probe_rows("img", [[0.26, 0.25]], with_pooled=False)
    )
    with pytest.raises(ValueError) as ei:
        assemble_features(rows, enc_dir)
    msg = str(ei.value)
    assert "(0.260000, 0.250000)" in msg          # the requested point
    assert "(0.250000, 0.250000)" in msg          # the nearest stored point
    assert "different probes.jsonl" in msg


def test_reader_pooled_only_sites_file_rejects_site_rows(tmp_path):
    enc_dir = tmp_path / "enc"
    enc_dir.mkdir()
    save_sites(enc_dir / f"img{SITES_SUFFIX}", _fake_feats(2), [], {"encoder": "fake"})
    # pooled row reads fine
    pooled_rows = _load_family_rows(tmp_path, _probe_rows("img", [], with_pooled=True))
    X, kept, miss, _ = assemble_features(pooled_rows, enc_dir)
    assert len(kept) == 1 and miss == 0 and X.shape == (1, DIM)
    # a site row against a 0-point file is loud
    rows = _load_family_rows(tmp_path, _probe_rows("img", [[0.5, 0.5]], with_pooled=False))
    with pytest.raises(ValueError, match="0 site points"):
        assemble_features(rows, enc_dir)


def test_probe_fit_main_on_sites_copies_sweep_metadata(tmp_path):
    """End-to-end probe_fit.main over a sites-only cache: same downstream code
    paths (a planted linear class comes back out), and the results JSON carries
    {budget_tokens, mechanism, knob} copied from the feature files."""
    from encoder_experiments.probe_fit import main

    rng = np.random.default_rng(5)
    enc_dir = tmp_path / "features" / "enc"
    enc_dir.mkdir(parents=True)
    meta = {"encoder": "enc", "mechanism": "merge", "knob": "merge_ratio=4"}
    probe_rows = []
    for d in range(12):
        image_id = f"doc{d:02d}"
        tokens = rng.normal(0.0, 0.05, size=(GRID * GRID, DIM))
        points = []
        for p in range(6):
            i, j = divmod(p, GRID)
            cls = (d + p) % 2
            tokens[p, cls] = 4.0
            pt = [round6((j + 0.5) / GRID), round6((i + 0.5) / GRID)]
            points.append(pt)
            probe_rows.append({
                "probe": "cls", "image_id": image_id, "doc_id": image_id,
                "point_xy": pt, "label": f"c{cls}",
            })
        feats = EncoderFeatures(
            tokens=torch.from_numpy(tokens).float(),
            grid_hw=(GRID, GRID),
            pooled=torch.from_numpy(rng.normal(size=DIM)).float(),
        )
        save_sites(enc_dir / f"{image_id}{SITES_SUFFIX}", feats, points, meta)

    probes = _write_jsonl(tmp_path / "probes.jsonl", probe_rows)
    out = tmp_path / "results"
    rc = main([
        "--features", str(tmp_path / "features"),
        "--probes", str(probes),
        "--encoders", "enc",
        "--out", str(out),
        "--heads", "linear",
        "--bootstrap", "10",
        "--min-samples", "2",
    ])
    assert rc == 0
    res = json.loads((out / "cls__enc.json").read_text())
    assert res["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.95
    assert res["budget_tokens"] == GRID * GRID   # actual token count
    assert res["mechanism"] == "merge"
    assert res["knob"] == "merge_ratio=4"


# --------------------------------------------------------------------------- #
# THE parity test: real images, real probes slice, real CLIP, cpu
# --------------------------------------------------------------------------- #

def _clip_cached() -> bool:
    try:
        from huggingface_hub.constants import HF_HUB_CACHE
    except ImportError:
        return False
    return (Path(HF_HUB_CACHE) / "models--openai--clip-vit-large-patch14-336").exists()


requires_real_assets = pytest.mark.skipif(
    not (PILOT / "probes.jsonl").exists() or not _clip_cached(),
    reason="needs data/pilot_1k + the CLIP checkpoint in the local HF cache",
)


@pytest.fixture(scope="module")
def clip_parity_run(tmp_path_factory):
    """Extract 3 real pilot images full-grid AND site-mode with the real CLIP
    tower on cpu/fp32, from a real probes.jsonl slice."""
    from encoder_experiments.extract import main as extract_main

    root = tmp_path_factory.mktemp("parity")

    # 3 real images that exist on disk
    images = []
    with open(PILOT / "images.jsonl") as f:
        for line in f:
            row = json.loads(line)
            if Path(row["image_path"]).exists():
                images.append({"image_id": row["image_id"], "image_path": row["image_path"]})
            if len(images) == 3:
                break
    assert len(images) == 3, "pilot corpus images missing on disk"
    ids = {r["image_id"] for r in images}
    manifest = _write_jsonl(root / "manifest.jsonl", images)

    # a real probes.jsonl slice for those images: up to 15 site rows + every
    # pooled (pl3) row per image
    per_image_sites: dict[str, int] = {i: 0 for i in ids}
    slice_rows = []
    with open(PILOT / "probes.jsonl") as f:
        for line in f:
            row = json.loads(line)
            iid = row["image_id"]
            if iid not in ids:
                continue
            pooled = row.get("site") == "pooled" or row["probe"].startswith("pl3")
            if pooled:
                slice_rows.append(row)
            elif per_image_sites[iid] < 15:
                per_image_sites[iid] += 1
                slice_rows.append(row)
    assert slice_rows and all(n > 0 for n in per_image_sites.values())
    probes = _write_jsonl(root / "probes_slice.jsonl", slice_rows)

    common = [
        "--manifest", str(manifest), "--encoder", "clip_vit_l_336",
        "--device", "cpu", "--dtype", "fp32",
        "--mechanism", "native", "--knob", "image_size=336",
    ]
    assert extract_main([*common, "--out", str(root / "full")]) == 0
    assert extract_main([
        *common, "--out", str(root / "sites"), "--sites-from", str(probes),
    ]) == 0
    return {
        "root": root,
        "images": images,
        "probes": probes,
        "full": root / "full" / "clip_vit_l_336",
        "sites": root / "sites" / "clip_vit_l_336",
    }


@requires_real_assets
def test_clip_site_vectors_bit_identical_to_full_grid(clip_parity_run):
    r = clip_parity_run
    for img in r["images"]:
        stem = safe_image_id(img["image_id"])
        with safe_open(r["full"] / f"{stem}.safetensors", framework="pt") as f:
            tokens = f.get_tensor("tokens")            # fp16, as a reader loads it
            full_pooled = f.get_tensor("pooled")
            grid_hw = (int(f.metadata()["grid_h"]), int(f.metadata()["grid_w"]))
        with safe_open(r["sites"] / f"{stem}{SITES_SUFFIX}", framework="pt") as f:
            sites = f.get_tensor("sites")
            points = f.get_tensor("points")
            site_pooled = f.get_tensor("pooled")
            smeta = f.metadata()
        assert points.shape[0] > 0 and sites.shape == (points.shape[0], tokens.shape[1])
        # THE invariant: features_at on the loaded full grid, through the same
        # fp16 storage cast, is bit-identical to the stored site vectors.
        expected = features_at(tokens, grid_hw, points).to(torch.float16)
        assert torch.equal(sites, expected)
        assert torch.equal(site_pooled, full_pooled)
        assert sites.dtype == torch.float16 and points.dtype == torch.float32
        # sweep contract on the stored file: actual budget, not nominal
        assert int(smeta["budget_tokens"]) == int(smeta["num_tokens"]) == tokens.shape[0]
        assert smeta["mechanism"] == "native" and smeta["knob"] == "image_size=336"


@requires_real_assets
def test_clip_assembled_X_matches_across_layouts(clip_parity_run):
    """probe_fit's transparent reader, on the real probe slice: the assembled
    design matrix from the sites cache equals the full-grid one pushed through
    the fp16 storage cast (site rows) / exactly (pooled rows)."""
    r = clip_parity_run
    fams = load_probes(r["probes"])
    for fam, rows in fams.items():
        X_full, kept_f, miss_f, _ = assemble_features(rows, r["full"])
        X_site, kept_s, miss_s, _ = assemble_features(rows, r["sites"])
        assert miss_f == miss_s == 0 and len(kept_f) == len(kept_s) == len(rows)
        pooled_mask = np.array([row.pooled for row in kept_f])
        if pooled_mask.any():
            assert np.array_equal(X_full[pooled_mask], X_site[pooled_mask])
        if (~pooled_mask).any():
            expected = X_full[~pooled_mask].astype(np.float16).astype(np.float32)
            assert np.array_equal(X_site[~pooled_mask], expected)
