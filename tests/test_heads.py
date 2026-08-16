"""fit_predict_mlp early-stopping contract: opt-in, deterministic given seed,
inert when off (val_fraction/patience unused), degenerate splits are hard
errors, and best-val-epoch restore protects against overfitting a long budget.
"""

from __future__ import annotations

import numpy as np
import pytest

from encoder_experiments.heads import fit_predict_mlp


@pytest.fixture(scope="module")
def data():
    rng = np.random.default_rng(11)
    Xtr = rng.normal(size=(300, 24)).astype(np.float32)
    Xte = rng.normal(size=(150, 24)).astype(np.float32)
    w = rng.normal(size=24)
    flip = rng.random(len(Xtr)) < 0.25  # label noise: long budgets overfit
    y_cls = np.where(flip, 1 - (Xtr @ w > 0), (Xtr @ w > 0)).astype(np.int64)
    y_te = (Xte @ w > 0).astype(np.int64)
    return Xtr, y_cls, Xte, y_te


def test_early_stop_off_ignores_early_stop_knobs(data):
    Xtr, y, Xte, _ = data
    plain = fit_predict_mlp("classification", Xtr, y, Xte, n_classes=2, seed=0)
    knobs = fit_predict_mlp(
        "classification", Xtr, y, Xte, n_classes=2, seed=0,
        early_stop=False, val_fraction=0.9, patience=0,
    )
    assert plain.tobytes() == knobs.tobytes()


def test_early_stop_deterministic_given_seed(data):
    Xtr, y, Xte, _ = data
    kw = dict(n_classes=2, epochs=200, early_stop=True, patience=5, seed=4)
    a = fit_predict_mlp("classification", Xtr, y, Xte, **kw)
    b = fit_predict_mlp("classification", Xtr, y, Xte, **kw)
    assert a.tobytes() == b.tobytes()
    c = fit_predict_mlp("classification", Xtr, y, Xte, **{**kw, "seed": 5})
    assert c.shape == a.shape  # different seed still valid predictions


def test_early_stop_not_worse_than_overfit_budget(data):
    Xtr, y, Xte, y_te = data
    long = fit_predict_mlp("classification", Xtr, y, Xte, n_classes=2, epochs=400, seed=0)
    stopped = fit_predict_mlp(
        "classification", Xtr, y, Xte, n_classes=2, epochs=400,
        early_stop=True, patience=10, seed=0,
    )
    assert (stopped == y_te).mean() >= (long == y_te).mean()


def test_early_stop_regression_returns_shape_and_scale(data):
    Xtr, _, Xte, _ = data
    rng = np.random.default_rng(3)
    w = rng.normal(size=Xtr.shape[1])
    y = (Xtr @ w) * 40.0 + 7.0  # un-scaled targets: internal target z-scoring
    pred = fit_predict_mlp(
        "regression", Xtr, y, Xte, epochs=300, early_stop=True, patience=10, seed=0
    )
    assert pred.shape == (len(Xte),)
    true = (Xte @ w) * 40.0 + 7.0
    assert np.corrcoef(pred, true)[0, 1] > 0.95


def test_degenerate_val_split_raises(data):
    Xtr, y, Xte, _ = data
    with pytest.raises(ValueError, match="degenerate"):
        fit_predict_mlp(
            "classification", Xtr, y, Xte, n_classes=2, early_stop=True, val_fraction=0.0
        )
