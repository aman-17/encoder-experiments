"""Validity-battery flags: --coords-only must reproduce a positional label
(and fail a position-independent one), --append-coords must close the gap on
a planted positional target, --meta-filter must drop and account rows,
--split-by must keep groups AND documents disjoint across the split (whole
docs follow their majority group), and every flag must land in the results
JSONs and the arm identity."""

import json

import numpy as np
import pytest
import torch

import encoder_experiments.probe_fit as pf
from encoder_experiments.adapters.base import EncoderFeatures
from encoder_experiments.extract import safe_image_id, save_features
from encoder_experiments.probe_fit import (
    FitConfig,
    doc_is_train,
    group_split,
    main,
    meta_passes,
    parse_meta_filter,
)

GRID = 8
DIM = 16
ENCODER = "fake_enc"
N_DOCS = 24
POINTS_PER_DOC = 8


def _center(i: int, j: int) -> list[float]:
    return [(j + 0.5) / GRID, (i + 0.5) / GRID]


def _quadrant(x: float, y: float) -> str:
    return f"q{int(x >= 0.5)}{int(y >= 0.5)}"


def _build_dataset(root):
    """24 docs x 1 page, 8 marked patches each. pos_quadrant's label is a pure
    function of point position over noise features; feat_class's label is
    planted in the features and independent of position; pl3_gist is pooled.
    Every doc carries one font except doc23, whose last 2 rows straddle into
    font_minority (the --split-by majority-assignment case)."""
    rng = np.random.default_rng(11)
    feat_dir = root / "features" / ENCODER
    feat_dir.mkdir(parents=True)
    probe_rows = []
    for d in range(N_DOCS):
        doc_id = f"doc{d:02d}"
        image_id = f"{doc_id}__p1"
        tokens = rng.normal(0.0, 0.05, size=(GRID * GRID, DIM))
        patches = rng.choice(GRID * GRID, size=POINTS_PER_DOC, replace=False)
        for k, p in enumerate(patches):
            i, j = divmod(int(p), GRID)
            x, y = _center(i, j)
            cls = int(rng.integers(4))
            tokens[p, cls] = 4.0
            meta = {
                "difficulty": ["easy", "hard"][k % 2],
                "sev": k % 3,
                "font": "font_minority" if d == 23 and k >= 6 else f"font{d % 6}",
            }
            common = {"image_id": image_id, "doc_id": doc_id, "meta": meta}
            probe_rows += [
                {"probe": "pos_quadrant", "point_xy": [x, y],
                 "label": _quadrant(x, y), **common},
                {"probe": "feat_class", "point_xy": [x, y],
                 "label": f"class_{cls}", **common},
            ]
        pooled = rng.normal(0.0, 0.05, size=DIM)
        pooled[d % 4] = 3.0
        probe_rows.append({
            "probe": "pl3_gist", "label": f"class_{d % 4}",
            "image_id": image_id, "doc_id": doc_id, "meta": {},
        })
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
def root(tmp_path_factory):
    root = tmp_path_factory.mktemp("validity_flags")
    _build_dataset(root)
    return root


def _run(root, out_name, *extra):
    out = root / out_name
    rc = main([
        "--features", str(root / "features"),
        "--probes", str(root / "probes.jsonl"),
        "--encoders", ENCODER,
        "--out", str(out),
        "--heads", "linear",
        "--bootstrap", "25",
        *extra,
    ])
    return rc, out


def _load(out, probe, tag=""):
    return json.loads((out / f"{probe}__{ENCODER}{tag}.json").read_text())


# --------------------------------------------------------------------------- #
# --coords-only / --append-coords
# --------------------------------------------------------------------------- #

def test_coords_only_reproduces_positional_label_and_fails_nonpositional(root):
    rc, out = _run(root, "coordsonly", "--coords-only",
                   "--probe", "pos_quadrant,feat_class")
    assert rc == 0
    pos = _load(out, "pos_quadrant", "__coordsonly")
    assert pos["coords_only"] is True and pos["append_coords"] is False
    assert pos["arm"].endswith("coordsonly")
    assert pos["raw_dim"] == 2
    assert pos["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.95
    feat = _load(out, "feat_class", "__coordsonly")
    # a position-independent label must NOT be recoverable from coordinates
    assert feat["heads"]["linear"]["real"]["metrics"]["accuracy"] < 0.5


def test_append_coords_beats_features_alone_on_positional_target(root):
    rc0, plain_out = _run(root, "plain", "--probe", "pos_quadrant")
    rc1, ac_out = _run(root, "appendcoords", "--append-coords",
                       "--probe", "pos_quadrant")
    assert rc0 == 0 and rc1 == 0
    plain = _load(plain_out, "pos_quadrant")
    ac = _load(ac_out, "pos_quadrant", "__coords")
    acc_plain = plain["heads"]["linear"]["real"]["metrics"]["accuracy"]
    acc_ac = ac["heads"]["linear"]["real"]["metrics"]["accuracy"]
    assert acc_plain < 0.5  # features are noise w.r.t. position
    # L2 on the 16 noise dims costs a little vs the pure-coords arm, so the
    # bar is 0.85 here (coords-only holds 0.95)
    assert acc_ac >= 0.85 and acc_ac > acc_plain + 0.4
    assert ac["append_coords"] is True and ac["coords_only"] is False
    assert ac["arm"].endswith("+coords")
    assert "coords_appended_after_projection" not in ac  # no capacity-match
    # default arm records the flags off and stays suffix-free
    assert plain["append_coords"] is False and plain["coords_only"] is False
    assert plain["arm"].endswith("/point")
    assert plain["meta_filter"] == [] and plain["n_filter_dropped"] == 0
    assert plain["split"]["by"] == "document"
    assert plain["mlp"] == {"epochs": 30, "lr": 1e-3, "early_stop": False}
    assert "n_groups_train" not in plain


def test_capacity_match_projects_feature_block_only(root):
    rc, out = _run(root, "cm_coords", "--append-coords", "--capacity-match", "8",
                   "--probe", "pos_quadrant")
    assert rc == 0
    res = _load(out, "pos_quadrant", "__coords")
    assert res["coords_appended_after_projection"] is True
    assert res["capacity_match"] == 8 and res["raw_dim"] == DIM
    # raw coords ride outside the projection, so the label survives it
    assert res["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.95


def test_coords_flags_reject_pooled_rows(root):
    fams = pf.load_probes(root / "probes.jsonl")
    cfg = FitConfig(heads=["linear"], n_boot=10, coords_only=True)
    with pytest.raises(ValueError, match="pooled"):
        pf.run_pair("pl3_gist", fams["pl3_gist"], root / "features" / ENCODER, cfg)


def test_coords_flags_mutually_exclusive(root):
    with pytest.raises(SystemExit):
        _run(root, "conflict", "--append-coords", "--coords-only")


# --------------------------------------------------------------------------- #
# --meta-filter
# --------------------------------------------------------------------------- #

def test_meta_filter_parse_and_coercion():
    assert parse_meta_filter("meta.sev>=2") == ("sev", ">=", "2")
    assert parse_meta_filter("difficulty == easy") == ("difficulty", "==", "easy")
    assert meta_passes({"sev": 2}, "sev", ">=", "2")
    assert not meta_passes({"sev": 0}, "sev", ">=", "2")
    assert meta_passes({"sev": "10"}, "sev", ">", "9")  # numeric, not lexicographic
    assert meta_passes({"difficulty": "easy"}, "difficulty", "==", "easy")
    assert not meta_passes({}, "sev", "!=", "1")  # missing key always fails
    with pytest.raises(ValueError, match="KEY OP VALUE"):
        parse_meta_filter("sev ~ 2")


def test_meta_filter_row_accounting(root):
    # per doc: difficulty easy at k even (4 rows), sev = k % 3; easy AND
    # sev>=1 leaves k in {2, 4} -> 2 rows/doc
    rc, out = _run(root, "filtered",
                   "--meta-filter", "difficulty == easy",
                   "--meta-filter", "sev >= 1",
                   "--probe", "pos_quadrant")
    assert rc == 0
    res = _load(out, "pos_quadrant")
    assert res["meta_filter"] == ["difficulty == easy", "sev >= 1"]
    total = N_DOCS * POINTS_PER_DOC
    assert res["n_samples"] == N_DOCS * 2
    assert res["n_filter_dropped"] == total - N_DOCS * 2
    assert res["n_samples"] + res["n_filter_dropped"] == total


def test_meta_filter_bad_expr_is_cli_error(root):
    with pytest.raises(SystemExit):
        _run(root, "badfilter", "--meta-filter", "sev ~ 2")


# --------------------------------------------------------------------------- #
# --split-by
# --------------------------------------------------------------------------- #

def _group_on(side: bool, frac: float = 0.5, seed: int = 0) -> str:
    return next(
        g for g in (f"g{i}" for i in range(1000))
        if doc_is_train(g, frac, seed) is side
    )


def test_group_split_straddling_doc_goes_wholly_to_majority_side():
    g_tr, g_te = _group_on(True), _group_on(False)
    docs = np.array(["a", "a", "a", "b", "b", "b", "c", "c", "c", "c"])
    groups = np.array([g_tr, g_tr, g_tr, g_te, g_te, g_te, g_tr, g_tr, g_tr, g_te])
    train, keep = group_split(docs, groups, 0.5, 0)
    # doc c majority g_tr -> ALL its rows on the train side
    assert train[docs == "c"].all()
    # its minority-group row is dropped; every other row survives
    assert not keep[9] and keep[:9].all()
    # both invariants on the surviving rows
    tr, te = keep & train, keep & ~train
    assert not set(groups[tr]) & set(groups[te])
    assert not set(docs[tr]) & set(docs[te])
    assert set(docs[te]) == {"b"}


def test_group_split_tie_breaks_to_lexicographically_first_group():
    g_tr, g_te = _group_on(True), _group_on(False)
    docs = np.array(["t", "t"])
    groups = np.array([g_tr, g_te])
    train, keep = group_split(docs, groups, 0.5, 0)
    expect = doc_is_train(min(g_tr, g_te), 0.5, 0)
    assert train[0] == train[1] == expect
    assert keep.sum() == 1  # the other group's row is dropped


def test_split_by_end_to_end_records_groups_and_holds_invariants(root):
    # fonts hash 50/50 at train_frac 0.5; doc23's 2 font_minority rows sit on
    # the other side of its majority font -> exactly 2 dropped per family
    rc, out = _run(root, "splitby", "--split-by", "meta.font",
                   "--train-frac", "0.5", "--probe", "pos_quadrant")
    assert rc == 0
    res = _load(out, "pos_quadrant")
    assert res["split"]["by"] == "font"  # meta. prefix stripped
    assert res["n_groups_train"] >= 1 and res["n_groups_test"] >= 1
    assert res["n_groups_train"] + res["n_groups_test"] == 6
    assert res["n_split_dropped"] == 2
    assert res["n_samples"] == N_DOCS * POINTS_PER_DOC - 2
    train, test = set(res["train_docs"]), set(res["test_docs"])
    assert train and test and not train & test
    assert "doc23" in train | test  # the straddler went wholly to one side


def test_split_by_missing_key_is_hard_error(root):
    fams = pf.load_probes(root / "probes.jsonl")
    cfg = FitConfig(heads=["linear"], n_boot=10, split_by="font")
    with pytest.raises(ValueError, match="--split-by"):
        # pl3_gist rows carry empty meta
        pf.run_pair("pl3_gist", fams["pl3_gist"], root / "features" / ENCODER, cfg)


# --------------------------------------------------------------------------- #
# MLP kwarg forwarding
# --------------------------------------------------------------------------- #

def test_mlp_early_stop_kwarg_omitted_unless_enabled(root, monkeypatch):
    seen: dict = {}

    def fake_mlp(task_type, X_train, y_train, X_test, **kwargs):
        seen.clear()
        seen.update(kwargs)
        return np.zeros(len(X_test), dtype=np.int64)

    monkeypatch.setattr(pf, "fit_predict_mlp", fake_mlp)
    fams = pf.load_probes(root / "probes.jsonl")
    enc_dir = root / "features" / ENCODER

    cfg = FitConfig(heads=["mlp"], n_boot=10)
    pf.run_pair("pos_quadrant", fams["pos_quadrant"], enc_dir, cfg)
    assert "early_stop" not in seen  # back-compat with pre-kwarg heads builds
    assert seen["epochs"] == 30 and seen["lr"] == 1e-3

    cfg = FitConfig(heads=["mlp"], n_boot=10, mlp_early_stop=True,
                    mlp_epochs=50, mlp_lr=5e-4)
    res = pf.run_pair("pos_quadrant", fams["pos_quadrant"], enc_dir, cfg)
    assert seen["early_stop"] is True
    assert seen["epochs"] == 50 and seen["lr"] == 5e-4
    assert res["mlp"] == {"epochs": 50, "lr": 5e-4, "early_stop": True}
