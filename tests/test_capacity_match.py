"""Capacity matching: the seeded Gaussian projection to a common dim that
every arm's X passes through before standardize+heads.

THE CONFOUND TEST: a feature set padded with pure-noise dims to 4x the width
is the same information, but the wider X buys the head more parameters (and
standardize inflates the junk dims to unit variance). With capacity-match ON
the two arms must score the same within noise; with it OFF the width alone
moves the score — the gap this flag exists to remove."""

import hashlib
import json
import subprocess
import sys

import numpy as np
import pytest

from encoder_experiments.heads import (
    capacity_match_projection,
    fit_predict_linear,
    fit_predict_mlp,
    project_features,
)

# confound-test regime (pinned): high-margin 4-class signal in DIM dims, padded
# with tiny-variance noise to 4x width. Tiny raw variance keeps the pad
# negligible after projection (which runs BEFORE standardize, on raw scale)
# while standardize inside the heads still inflates it to unit variance in the
# unprojected arm — the realistic version of the confound.
N_TRAIN, N_TEST = 96, 2000
DIM, WIDE_DIM, D = 64, 256, 48
SEP, PAD_STD = 0.8, 0.02
DATA_SEED = 3
PROJ_SEEDS = (0, 1, 2, 3, 4)


def _planted(seed):
    rng = np.random.default_rng(seed)
    means = rng.normal(0.0, SEP, size=(4, DIM))
    y = rng.integers(4, size=N_TRAIN + N_TEST)
    X = (means[y] + rng.normal(0.0, 1.0, size=(len(y), DIM))).astype(np.float32)
    pad = rng.normal(0.0, PAD_STD, size=(len(y), WIDE_DIM - DIM)).astype(np.float32)
    return X, np.concatenate([X, pad], axis=1), y


def _acc(head, Xtr, ytr, Xte, yte):
    if head == "linear":
        pred = fit_predict_linear("classification", Xtr, ytr, Xte, seed=0)
    else:
        pred = fit_predict_mlp("classification", Xtr, ytr, Xte, n_classes=4, seed=0)
    return float((pred == yte).mean())


@pytest.mark.parametrize("head", ["linear", "mlp"])
def test_confound_noise_padding(head):
    X, Xw, y = _planted(DATA_SEED)
    tr, te = slice(0, N_TRAIN), slice(N_TRAIN, None)

    # OFF: the observed confound — identical information, different score
    off_real = _acc(head, X[tr], y[tr], X[te], y[te])
    off_wide = _acc(head, Xw[tr], y[tr], Xw[te], y[te])
    off_gap = off_real - off_wide

    # ON: averaged over projection seeds (one matrix per (seed, raw_dim))
    on_real, on_wide = [], []
    for ps in PROJ_SEEDS:
        Xp, Xwp = project_features(X, D, ps), project_features(Xw, D, ps)
        on_real.append(_acc(head, Xp[tr], y[tr], Xp[te], y[te]))
        on_wide.append(_acc(head, Xwp[tr], y[tr], Xwp[te], y[te]))
    on_gap = abs(float(np.mean(on_real)) - float(np.mean(on_wide)))

    assert on_gap < 0.02, f"capacity-matched arms disagree: {on_gap=:.4f}"
    if head == "mlp":  # the head whose parameter count scales 4x with width
        assert off_gap > 0.02, (
            f"expected the width confound without the flag, got {off_gap=:.4f}"
        )
        assert off_gap > on_gap
    # document the observed gaps in the test log
    print(f"[confound:{head}] off_gap={off_gap:+.4f} on_gap={on_gap:.4f} "
          f"(off real={off_real:.4f} wide={off_wide:.4f})")


def test_projection_deterministic_across_processes():
    P = capacity_match_projection(96, 32, seed=7)
    digest = hashlib.sha256(np.ascontiguousarray(P).tobytes()).hexdigest()
    code = (
        "import hashlib, numpy as np\n"
        "from encoder_experiments.heads import capacity_match_projection\n"
        "P = capacity_match_projection(96, 32, seed=7)\n"
        "print(hashlib.sha256(np.ascontiguousarray(P).tobytes()).hexdigest())\n"
    )
    out = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True
    )
    assert out.stdout.strip() == digest
    # different seed / different source dim -> different matrix
    assert not np.array_equal(P, capacity_match_projection(96, 32, seed=8))
    assert capacity_match_projection(128, 32, seed=7).shape == (128, 32)


def test_projection_orthonormal_scaled():
    raw, target = 96, 32
    P = capacity_match_projection(raw, target, seed=0)
    # orthonormal columns scaled by sqrt(raw/target): P.T P = (raw/target) I
    assert np.allclose(P.T @ P, (raw / target) * np.eye(target), atol=1e-10)
    # expected squared norm preserved for isotropic inputs
    X = np.random.default_rng(0).standard_normal((4000, raw))
    ratio = np.mean(np.sum((X @ P) ** 2, axis=1)) / np.mean(np.sum(X**2, axis=1))
    assert abs(ratio - 1.0) < 0.05


def test_projection_rejects_widening():
    with pytest.raises(ValueError, match="cannot widen"):
        capacity_match_projection(32, 64, seed=0)
    with pytest.raises(ValueError, match="positive"):
        capacity_match_projection(32, 0, seed=0)


def test_probe_fit_records_capacity_match(tmp_path):
    """--capacity-match D projects before the heads and records
    {capacity_match: D, raw_dim} in every results JSON; default stays off."""
    from test_probe_fit import ENCODER, _build_dataset

    from encoder_experiments.probe_fit import main

    probes = _build_dataset(tmp_path)
    common = [
        "--features", str(tmp_path / "features"), "--probes", str(probes),
        "--encoders", ENCODER, "--heads", "linear", "--bootstrap", "10",
        "--probe", "pl1_patch_class",
    ]
    out_on = tmp_path / "on"
    assert main([*common, "--out", str(out_on), "--capacity-match", "16"]) == 0
    res = json.loads((out_on / f"pl1_patch_class__{ENCODER}.json").read_text())
    assert res["capacity_match"] == 16
    assert res["raw_dim"] == 32  # test fixture feature dim
    # the planted signal survives a 32 -> 16 projection
    assert res["heads"]["linear"]["real"]["metrics"]["accuracy"] >= 0.9

    out_off = tmp_path / "off"
    assert main([*common, "--out", str(out_off)]) == 0
    res = json.loads((out_off / f"pl1_patch_class__{ENCODER}.json").read_text())
    assert res["capacity_match"] is None
    assert res["raw_dim"] == 32
