"""Probe-FIT harness, no real encoders: synthetic feature files whose tokens
ENCODE the label in a linear subspace at the labeled point (plus distractor
dims). A working harness must read those labels back out (~100% linear probe),
the shuffled control must sit at chance, and the train/test split must keep
every document on exactly one side."""

import json

import numpy as np
import pytest
import torch

from encoder_experiments.adapters.base import EncoderFeatures
from encoder_experiments.extract import safe_image_id, save_features
from encoder_experiments.probe_fit import derive_doc_id, doc_is_train, main
from encoder_experiments.probe_metrics import bbox_iou

GRID = 8
DIM = 32
N_CLASSES = 4
ENCODER = "fake_enc"

# planted linear subspaces (disjoint dims so one token serves every probe family)
CLS_DIMS = slice(0, N_CLASSES)   # one-hot * 4 at the labeled patch
REG_DIM = 10                     # scalar value * 2
BOX_DIMS = slice(12, 16)         # [x, y, w, h] * 4


def _center(i: int, j: int) -> list[float]:
    return [(j + 0.5) / GRID, (i + 0.5) / GRID]


def _build_dataset(root):
    """24 docs x 2 pages; per page 8 marked patches carrying class/value/bbox
    labels, plus a pooled vector carrying a doc-level class for the pl3 probe."""
    rng = np.random.default_rng(7)
    feat_dir = root / "features" / ENCODER
    feat_dir.mkdir(parents=True)
    probe_rows = []

    for d in range(24):
        doc_id = f"doc{d:02d}"
        doc_cls = d % N_CLASSES
        for page in (1, 2):
            image_id = f"{doc_id}__p{page}"
            tokens = rng.normal(0.0, 0.05, size=(GRID * GRID, DIM))
            patches = rng.choice(GRID * GRID, size=8, replace=False)
            for p in patches:
                i, j = divmod(int(p), GRID)
                cls = int(rng.integers(N_CLASSES))
                val = float(rng.uniform(0.0, 3.0))
                w, h = rng.uniform(0.05, 0.3, size=2)
                x = float(np.clip((j + 0.5) / GRID - w / 2, 0.0, 1.0 - w))
                y = float(np.clip((i + 0.5) / GRID - h / 2, 0.0, 1.0 - h))
                box = [x, float(y), float(w), float(h)]
                tokens[p, CLS_DIMS] = 0.0
                tokens[p, cls] = 4.0
                tokens[p, REG_DIM] = val * 2.0
                tokens[p, BOX_DIMS] = np.asarray(box) * 4.0
                meta = {"scan_severity": d % 3, "difficulty": ["easy", "hard"][d % 2]}
                common = {"image_id": image_id, "doc_id": doc_id, "meta": meta}
                probe_rows += [
                    {"probe": "pl1_patch_class", "point_xy": _center(i, j),
                     "label": f"class_{cls}", **common},
                    {"probe": "reg_value", "point_xy": _center(i, j),
                     "label": val, **common},
                    {"probe": "pl2_extent", "point_xy": _center(i, j),
                     "label": box, **common},
                ]
            pooled = rng.normal(0.0, 0.05, size=DIM)
            pooled[doc_cls] = 3.0
            probe_rows.append(
                {"probe": "pl3_summary", "label": f"class_{doc_cls}", **common}
            )
            feats = EncoderFeatures(
                tokens=torch.from_numpy(tokens).float(),
                grid_hw=(GRID, GRID),
                pooled=torch.from_numpy(pooled).float(),
            )
            save_features(
                feat_dir / f"{safe_image_id(image_id)}.safetensors",
                feats,
                {"encoder": ENCODER},
            )

    probes = root / "probes.jsonl"
    with open(probes, "w") as f:
        for row in probe_rows:
            f.write(json.dumps(row) + "\n")
    return probes


@pytest.fixture(scope="module")
def results_dir(tmp_path_factory):
    root = tmp_path_factory.mktemp("probe_fit")
    probes = _build_dataset(root)
    out = root / "results"
    rc = main([
        "--features", str(root / "features"),
        "--probes", str(probes),
        "--encoders", ENCODER,
        "--out", str(out),
        "--heads", "linear,mlp",
        "--bootstrap", "50",
        "--mlp-epochs", "20",
    ])
    assert rc == 0
    return out


def _load(results_dir, probe):
    return json.loads((results_dir / f"{probe}__{ENCODER}.json").read_text())


def test_linear_probe_recovers_planted_classes(results_dir):
    res = _load(results_dir, "pl1_patch_class")
    assert res["task_type"] == "classification"
    assert res["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.95
    assert res["heads"]["linear"]["real"]["metrics"]["macro_f1"] >= 0.95


def test_mlp_probe_recovers_planted_classes(results_dir):
    res = _load(results_dir, "pl1_patch_class")
    assert res["heads"]["mlp"]["real"]["metrics"]["accuracy"] >= 0.9


def test_shuffled_control_sits_at_chance(results_dir):
    res = _load(results_dir, "pl1_patch_class")
    for head in ("linear", "mlp"):
        shuf = res["heads"][head]["shuffled"]["metrics"]["accuracy"]
        assert shuf < 0.5  # chance for 4 balanced classes is 0.25


def test_doc_level_split_honored(results_dir):
    # train/test doc lists are derived from the per-sample assignment, so
    # disjointness certifies no document straddles the split
    for probe in ("pl1_patch_class", "reg_value", "pl2_extent", "pl3_summary"):
        res = _load(results_dir, probe)
        train, test = set(res["train_docs"]), set(res["test_docs"])
        assert train and test
        assert not train & test
    # every doc has 2 pages; both must land on the same side by construction
    assert doc_is_train("doc00", 0.8, 0) == doc_is_train("doc00", 0.8, 0)


def test_derived_doc_id_strips_page_and_severity():
    assert derive_doc_id("docs/foo_s203__p1") == "docs/foo"
    assert derive_doc_id("docs/foo__p2") == "docs/foo"
    assert derive_doc_id("docs/foo") == "docs/foo"


def test_regression_probe(results_dir):
    res = _load(results_dir, "reg_value")
    assert res["task_type"] == "regression"
    m = res["heads"]["linear"]["real"]["metrics"]
    assert m["r2"] >= 0.9
    assert m["mae"] <= 0.3
    assert res["heads"]["linear"]["shuffled"]["metrics"]["r2"] < 0.2


def test_bbox_probe_iou(results_dir):
    res = _load(results_dir, "pl2_extent")
    assert res["task_type"] == "bbox"
    assert res["heads"]["linear"]["real"]["metrics"]["mean_iou"] >= 0.7
    assert res["heads"]["linear"]["shuffled"]["metrics"]["mean_iou"] < 0.4


def test_pooled_probe(results_dir):
    res = _load(results_dir, "pl3_summary")
    assert res["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.9


def test_slices_and_summary_exist(results_dir):
    res = _load(results_dir, "pl1_patch_class")
    slices = res["heads"]["linear"]["slices"]
    assert set(slices) >= {"scan_severity", "difficulty", "class"}
    assert all(v["n"] > 0 for v in slices["scan_severity"].values())
    summary = (results_dir / "summary.md").read_text()
    assert "pl1_patch_class" in summary and ENCODER in summary
    assert "shuf" in summary and "95% CI" in summary


def test_bootstrap_ci_brackets_point_estimate(results_dir):
    res = _load(results_dir, "pl1_patch_class")
    acc = res["heads"]["linear"]["real"]["metrics"]["accuracy"]
    lo, hi = res["heads"]["linear"]["real"]["ci95"]["accuracy"]
    assert lo <= acc <= hi or acc >= 0.99  # degenerate all-1.0 CI allowed


def test_iou_sanity():
    same = np.array([[0.1, 0.2, 0.4, 0.3]])
    assert bbox_iou(same, same)[0] == pytest.approx(1.0)
    disjoint = np.array([[0.6, 0.6, 0.2, 0.2]])
    assert bbox_iou(same, disjoint)[0] == 0.0
    a = np.array([[0.0, 0.0, 2.0, 2.0]])
    b = np.array([[1.0, 1.0, 2.0, 2.0]])
    assert bbox_iou(a, b)[0] == pytest.approx(1.0 / 7.0)
    neg = np.array([[0.0, 0.0, -1.0, 2.0]])  # negative width clamps to empty
    assert bbox_iou(neg, a)[0] == 0.0


def test_derived_doc_id_strips_degrade_suffix():
    # regression: clean + degraded variants of ONE document derived different
    # doc_ids and straddled the train/test split (math__math_6sk_0001 in test,
    # math__math_6sk_0001__sev2b in train)
    assert derive_doc_id("math__math_6sk_0001__sev2b") == "math__math_6sk_0001"
    assert derive_doc_id("math__math_6sk_0001") == "math__math_6sk_0001"
    assert derive_doc_id("tables__synth_70w_0003__sev3") == "tables__synth_70w_0003"
    assert derive_doc_id("docs/foo__p2__sev3b") == "docs/foo"
    for sev in ("1", "2", "3", "4", "1b", "2b", "3b"):
        assert derive_doc_id(f"x__sev{sev}") == "x"


def test_row_doc_id_wins_over_derivation(tmp_path):
    from encoder_experiments.probe_fit import load_probes

    rows = [
        {"probe": "p", "image_id": "a__sev2b", "label": 0,
         "point_xy": [0.5, 0.5], "doc_id": "explicit"},
        {"probe": "p", "image_id": "a__sev2b", "label": 1, "point_xy": [0.5, 0.5]},
    ]
    path = tmp_path / "probes.jsonl"
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    fams = load_probes(path)
    assert fams["p"][0].doc_id == "explicit"   # row doc_id preferred
    assert fams["p"][1].doc_id == "a"          # fallback strips __sev2b


def test_split_straddle_assert_fires(monkeypatch, tmp_path):
    """The hard invariant after splitting: if per-sample assignment ever put
    one doc_id on both sides (here forced by an inconsistent doc_is_train),
    run_pair must refuse to fit rather than leak."""
    import encoder_experiments.probe_fit as pf

    root = tmp_path
    probes = _build_dataset(root)
    fams = pf.load_probes(probes)
    calls = iter(range(10_000))
    monkeypatch.setattr(pf, "doc_is_train", lambda d, f, s: next(calls) % 2 == 0)
    cfg = pf.FitConfig(heads=["linear"], n_boot=10, min_samples=2)
    with pytest.raises(AssertionError, match="BOTH split sides"):
        pf.run_pair("pl1_patch_class", fams["pl1_patch_class"], root / "features" / ENCODER, cfg)


def _isolation_dataset(root):
    """Two families: 'good_cls' over many docs (fits), 'single_doc' whose rows
    all come from one document (split leaves one side empty -> raises)."""
    rng = np.random.default_rng(3)
    feat_dir = root / "features" / ENCODER
    feat_dir.mkdir(parents=True)
    probe_rows = []
    for d in range(8):
        image_id = f"iso{d:02d}"
        tokens = rng.normal(0.0, 0.05, size=(GRID * GRID, DIM))
        for p in range(6):
            i, j = divmod(p, GRID)
            cls = d % 2
            tokens[p, cls] = 4.0
            probe_rows.append({
                "probe": "good_cls", "image_id": image_id, "doc_id": image_id,
                "point_xy": _center(i, j), "label": f"class_{cls}", "meta": {},
            })
            if d == 0:
                probe_rows.append({
                    "probe": "single_doc", "image_id": image_id, "doc_id": image_id,
                    "point_xy": _center(i, j), "label": f"class_{cls}", "meta": {},
                })
        feats = EncoderFeatures(
            tokens=torch.from_numpy(tokens).float(),
            grid_hw=(GRID, GRID),
            pooled=torch.from_numpy(rng.normal(size=DIM)).float(),
        )
        save_features(feat_dir / f"{image_id}.safetensors", feats, {"encoder": ENCODER})
    probes = root / "probes.jsonl"
    with open(probes, "w") as f:
        for row in probe_rows:
            f.write(json.dumps(row) + "\n")
    return probes


def test_family_error_is_isolated_and_summary_always_written(tmp_path):
    # regression: the series_id empty-split RuntimeError used to abort the
    # whole run AFTER other families had succeeded — exit 1, no summary.md
    probes = _isolation_dataset(tmp_path)
    out = tmp_path / "results"
    rc = main([
        "--features", str(tmp_path / "features"),
        "--probes", str(probes),
        "--encoders", ENCODER,
        "--out", str(out),
        "--heads", "linear",
        "--bootstrap", "10",
        "--min-samples", "2",
    ])
    assert rc == 0  # a successful family exists -> success exit
    good = json.loads((out / f"good_cls__{ENCODER}.json").read_text())
    assert good["probe"] == "good_cls" and "heads" in good
    # the raising family recorded its error in its results JSON
    bad = json.loads((out / f"single_doc__{ENCODER}.json").read_text())
    assert bad["probe"] == "single_doc" and "split left one side empty" in bad["error"]
    # summary.md always written: successful families + an errors section
    summary = (out / "summary.md").read_text()
    assert "good_cls" in summary
    assert "## Errors" in summary and "single_doc" in summary


def test_min_samples_cli_exposed(tmp_path):
    probes = _isolation_dataset(tmp_path)
    out = tmp_path / "strict"
    rc = main([
        "--features", str(tmp_path / "features"),
        "--probes", str(probes),
        "--encoders", ENCODER,
        "--out", str(out),
        "--heads", "linear",
        "--bootstrap", "10",
        "--min-samples", "100",  # above both families' sample counts
    ])
    assert rc == 1  # everything skipped -> no results
    assert not (out / f"good_cls__{ENCODER}.json").exists()
    assert (out / "summary.md").exists()  # still written
