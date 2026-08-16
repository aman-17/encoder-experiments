"""Dual pre-merge readouts: concat4/mean4 over the children of the merged
cell containing the probe point. Geometry pinned against a hand-built 4x4
grid; storage pinned so the sites layout serves bit-identical vectors to a
full-grid read; readout is part of the arm identity end to end."""

import json

import numpy as np
import pytest
import torch
from safetensors import safe_open

from encoder_experiments.adapters.base import EncoderFeatures
from encoder_experiments.extract import save_features, save_sites
from encoder_experiments.probe_fit import assemble_features, load_probes
from encoder_experiments.site_store import SITES_SUFFIX
from encoder_experiments.sites import children_at, combine_children

# hand-built 4x4 pre-merge grid (merged grid 2x2): token at flat index p is
# [p, -p], so every child vector is identifiable by value
H = W = 4
D = 2
TOKENS = torch.stack(
    [torch.tensor([float(p), float(-p)]) for p in range(H * W)]
)  # [16, 2]

# merged cell (mi, mj) -> its children's flat indices in raster order
CHILDREN = {
    (0, 0): [0, 1, 4, 5],
    (0, 1): [2, 3, 6, 7],
    (1, 0): [8, 9, 12, 13],
    (1, 1): [10, 11, 14, 15],
}


@pytest.mark.parametrize(
    "point,cell",
    [
        ([0.0, 0.0], (0, 0)),     # top-left corner
        ([0.25, 0.25], (0, 0)),   # inside merged cell (0,0)
        ([0.6, 0.3], (0, 1)),     # x in right half, y in top half
        ([0.3, 0.6], (1, 0)),
        ([0.75, 0.75], (1, 1)),
        ([1.0, 1.0], (1, 1)),     # boundary clamps into the last cell
        ([0.499999, 0.499999], (0, 0)),
        ([0.5, 0.5], (1, 1)),     # half-open cells: 0.5 belongs to the second
    ],
)
def test_children_geometry(point, cell):
    out = children_at(TOKENS, (H, W), torch.tensor([point]))
    assert out.shape == (1, 4, D)
    expected = TOKENS[CHILDREN[cell]].float()
    assert torch.equal(out[0], expected)
    # concat4 = raster-order concatenation; mean4 = plain mean of the 4
    assert torch.equal(combine_children(out, "concat4")[0], expected.reshape(-1))
    assert torch.equal(combine_children(out, "mean4")[0], expected.mean(dim=0))


def test_children_at_rejects_indivisible_grid():
    with pytest.raises(ValueError, match="not divisible"):
        children_at(torch.zeros(15, D), (3, 5), torch.tensor([[0.5, 0.5]]))


def test_combine_children_rejects_bad_shapes_and_modes():
    with pytest.raises(ValueError, match="4, D"):
        combine_children(torch.zeros(1, 9, D), "concat4")
    with pytest.raises(ValueError, match="concat4 or mean4"):
        combine_children(torch.zeros(1, 4, D), "bilinear")


# --------------------------------------------------------------------------- #
# storage + reader
# --------------------------------------------------------------------------- #

GRID, DIM = 8, 16


def _premerge_feats(seed: int) -> EncoderFeatures:
    rng = np.random.default_rng(seed)
    return EncoderFeatures(
        tokens=torch.from_numpy(rng.normal(size=(GRID * GRID, DIM))).float(),
        grid_hw=(GRID, GRID),
        pooled=torch.from_numpy(rng.normal(size=DIM)).float(),
    )


def _rows_for(tmp_path, image_id, points):
    rows = [
        {"probe": "glyph_id", "image_id": image_id, "point_xy": [x, y], "label": "g"}
        for x, y in points
    ]
    path = tmp_path / "rows.jsonl"
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    fams = load_probes(path)
    return [r for fam in fams.values() for r in fam]


PREMERGE_META = {"encoder": "fake", "site": "premerge", "mechanism": "native", "knob": "native"}


@pytest.mark.parametrize("readout", ["concat4", "mean4"])
def test_sites_layout_matches_full_grid(tmp_path, readout):
    """save_sites(child_merge=2) stores children [K, 4, D] fp16; the reader
    serves the identical vectors from either layout (children are exact fp16
    token copies, so parity is bit-for-bit)."""
    points = [[0.123457, 0.654321], [0.5, 0.5], [0.9, 0.1]]
    feats = _premerge_feats(0)
    full_dir, sites_dir = tmp_path / "full", tmp_path / "sites"
    full_dir.mkdir()
    sites_dir.mkdir()
    save_features(full_dir / "img.safetensors", feats, PREMERGE_META)
    save_sites(sites_dir / f"img{SITES_SUFFIX}", feats, points, PREMERGE_META, child_merge=2)

    with safe_open(sites_dir / f"img{SITES_SUFFIX}", framework="pt") as f:
        children = f.get_tensor("children")
        assert children.shape == (3, 4, DIM) and children.dtype == torch.float16
        assert f.metadata()["child_merge"] == "2"

    rows = _rows_for(tmp_path, "img", points)
    X_full, kept_f, miss_f, meta_f = assemble_features(rows, full_dir, readout=readout)
    X_site, kept_s, miss_s, meta_s = assemble_features(rows, sites_dir, readout=readout)
    assert miss_f == miss_s == 0 and len(kept_f) == len(kept_s) == 3
    assert np.array_equal(X_full, X_site)
    assert X_full.shape[1] == (4 * DIM if readout == "concat4" else DIM)
    assert meta_f["site"] == meta_s["site"] == "premerge"

    # ground truth from the fp16-loaded grid, same as a full-grid reader sees
    tok16 = feats.tokens.to(torch.float16).float()
    expected = combine_children(
        children_at(tok16, (GRID, GRID), torch.tensor(points)), readout
    ).numpy()
    assert np.array_equal(X_full, expected)


def test_readout_requires_premerge_tag(tmp_path):
    enc_dir = tmp_path / "enc"
    enc_dir.mkdir()
    save_features(enc_dir / "img.safetensors", _premerge_feats(1), {"encoder": "fake"})
    rows = _rows_for(tmp_path, "img", [[0.5, 0.5]])
    with pytest.raises(ValueError, match="site=premerge"):
        assemble_features(rows, enc_dir, readout="concat4")


def test_sites_file_without_children_is_loud(tmp_path):
    enc_dir = tmp_path / "enc"
    enc_dir.mkdir()
    save_sites(
        enc_dir / f"img{SITES_SUFFIX}", _premerge_feats(2), [[0.5, 0.5]], PREMERGE_META
    )
    rows = _rows_for(tmp_path, "img", [[0.5, 0.5]])
    with pytest.raises(ValueError, match="re-extract"):
        assemble_features(rows, enc_dir, readout="mean4")


def test_point_readout_unchanged_on_premerge_cache(tmp_path):
    enc_dir = tmp_path / "enc"
    enc_dir.mkdir()
    feats = _premerge_feats(3)
    save_sites(
        enc_dir / f"img{SITES_SUFFIX}", feats, [[0.25, 0.75]], PREMERGE_META, child_merge=2
    )
    rows = _rows_for(tmp_path, "img", [[0.25, 0.75]])
    X, kept, miss, _ = assemble_features(rows, enc_dir)  # default readout
    assert miss == 0 and X.shape == (1, DIM)


# --------------------------------------------------------------------------- #
# end to end: readout in the arm identity
# --------------------------------------------------------------------------- #

def test_probe_fit_readout_arm_identity(tmp_path):
    """--readout concat4 on a premerge cache: a class planted in ONE child of
    each merged cell survives concatenation, results carry
    site/readout/arm, and the readout gets its own result file."""
    from encoder_experiments.probe_fit import main

    rng = np.random.default_rng(9)
    enc_dir = tmp_path / "features" / "qenc"
    enc_dir.mkdir(parents=True)
    probe_rows = []
    for d in range(12):
        image_id = f"doc{d:02d}"
        tokens = rng.normal(0.0, 0.05, size=(GRID * GRID, DIM))
        grid = tokens.reshape(GRID, GRID, DIM)
        hm = GRID // 2  # merged grid is (GRID/2, GRID/2)
        for m in range(4):  # 4 merged cells per image get labeled points
            mi, mj = divmod(m, 2)
            cls = (d + m) % 2
            # signal ONLY in the top-left child of the merged cell
            grid[2 * mi, 2 * mj, cls] = 4.0
            probe_rows.append({
                "probe": "child_cls", "image_id": image_id, "doc_id": image_id,
                "point_xy": [(mj + 0.5) / hm, (mi + 0.5) / hm], "label": f"c{cls}",
            })
        feats = EncoderFeatures(
            tokens=torch.from_numpy(grid.reshape(GRID * GRID, DIM)).float(),
            grid_hw=(GRID, GRID),
            pooled=torch.from_numpy(rng.normal(size=DIM)).float(),
        )
        save_features(
            enc_dir / f"{image_id}.safetensors", feats,
            {**PREMERGE_META, "encoder": "qenc"},
        )

    probes = tmp_path / "probes.jsonl"
    probes.write_text("".join(json.dumps(r) + "\n" for r in probe_rows))
    out = tmp_path / "results"
    rc = main([
        "--features", str(tmp_path / "features"),
        "--probes", str(probes),
        "--encoders", "qenc",
        "--out", str(out),
        "--heads", "linear",
        "--bootstrap", "10",
        "--min-samples", "2",
        "--readout", "concat4",
    ])
    assert rc == 0
    res = json.loads((out / "child_cls__qenc__concat4.json").read_text())
    assert res["site"] == "premerge"
    assert res["readout"] == "concat4"
    assert res["arm"] == f"qenc@{GRID * GRID}#premerge/concat4"
    assert res["raw_dim"] == 4 * DIM
    assert res["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.95
