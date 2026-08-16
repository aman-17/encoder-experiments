"""Probe heads: linear (scikit-learn) and 2-layer MLP (torch), fit on cached features.

Both heads standardize inputs with train-split statistics only. The MLP also
standardizes regression targets internally (and un-scales predictions) so the
same hyperparameters work across probe families with different label scales.

Capacity matching: cross-arm score comparisons are confounded when arms differ
in feature dim (a wider X buys the head more parameters). capacity_match_projection
builds the seeded Gaussian random projection to a common dim D that every arm's
X passes through BEFORE standardize+heads; with MLP hidden fixed, total head
params are then equal across arms by construction.
"""

from __future__ import annotations

import numpy as np


def standardize(X_train: np.ndarray, X_test: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Train-statistics z-scoring; constant dims pass through unscaled."""
    mu = X_train.mean(axis=0)
    sd = X_train.std(axis=0)
    sd = np.where(sd < 1e-8, 1.0, sd)
    return (X_train - mu) / sd, (X_test - mu) / sd


def capacity_match_projection(raw_dim: int, target_dim: int, seed: int) -> np.ndarray:
    """[raw_dim, target_dim] seeded Gaussian random projection.

    Deterministic in (seed, raw_dim, target_dim) alone — the same seed gives
    the same matrix per source dim, across processes. Columns are
    QR-orthonormalized (signs pinned to the R diagonal, so the LAPACK sign
    ambiguity cannot flip them) and scaled by sqrt(raw_dim/target_dim) so
    expected squared norms are preserved for isotropic inputs.
    """
    if target_dim <= 0:
        raise ValueError(f"capacity-match dim must be positive, got {target_dim}")
    if target_dim > raw_dim:
        raise ValueError(
            f"capacity-match dim {target_dim} exceeds raw feature dim {raw_dim}: "
            "an orthonormal projection cannot widen — pick D <= the smallest arm dim"
        )
    rng = np.random.default_rng(np.random.SeedSequence([seed, raw_dim, target_dim]))
    g = rng.standard_normal((raw_dim, target_dim))
    q, r = np.linalg.qr(g)
    q = q * np.where(np.diag(r) >= 0.0, 1.0, -1.0)
    return q * np.sqrt(raw_dim / target_dim)


def project_features(X: np.ndarray, target_dim: int, seed: int) -> np.ndarray:
    """X [n, raw_dim] float -> [n, target_dim] float32 via capacity_match_projection."""
    P = capacity_match_projection(X.shape[1], target_dim, seed)
    return (X.astype(np.float64) @ P).astype(np.float32)


def fit_predict_linear(
    task_type: str,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    seed: int = 0,
) -> np.ndarray:
    """LogisticRegression for classification, Ridge for regression/bbox targets."""
    from sklearn.linear_model import LogisticRegression, Ridge

    Xtr, Xte = standardize(X_train.astype(np.float64), X_test.astype(np.float64))
    if task_type == "classification":
        if len(np.unique(y_train)) < 2:  # degenerate (can happen on tiny slices)
            return np.full(len(X_test), y_train[0], dtype=y_train.dtype)
        clf = LogisticRegression(max_iter=2000, random_state=seed)
        clf.fit(Xtr, y_train)
        return clf.predict(Xte)
    reg = Ridge(alpha=1.0, random_state=seed)
    reg.fit(Xtr, y_train)
    return reg.predict(Xte)


def fit_predict_mlp(
    task_type: str,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    *,
    n_classes: int | None = None,
    hidden: int = 512,
    epochs: int = 30,
    lr: float = 1e-3,
    batch_size: int = 256,
    early_stop: bool = False,
    val_fraction: float = 0.15,
    patience: int = 10,
    seed: int = 0,
    device: str = "cpu",
) -> np.ndarray:
    """2-layer torch head (Linear -> ReLU -> Linear), Adam.

    Classification: y_train is int class codes, returns predicted codes.
    Regression/bbox: y_train is [n] or [n, k] float, returns same shape.

    early_stop=True carves a seeded row-level val_fraction split out of the
    train rows, treats `epochs` as a maximum, stops after `patience` epochs
    without a val-loss improvement, and restores the best-val-epoch weights.
    Deterministic given seed; with early_stop=False the fit is bit-identical
    to the fixed-epoch-budget behavior (val_fraction/patience unused).
    """
    import torch
    from torch import nn

    torch.manual_seed(seed)
    Xtr, Xte = standardize(X_train.astype(np.float32), X_test.astype(np.float32))
    xtr = torch.from_numpy(np.ascontiguousarray(Xtr, dtype=np.float32)).to(device)
    xte = torch.from_numpy(np.ascontiguousarray(Xte, dtype=np.float32)).to(device)

    if task_type == "classification":
        if n_classes is None:
            n_classes = int(np.max(y_train)) + 1
        out_dim = n_classes
        ytr = torch.from_numpy(np.asarray(y_train, dtype=np.int64)).to(device)
        loss_fn = nn.CrossEntropyLoss()
        y_mu = y_sd = None
        squeeze_out = False
    else:
        y = np.asarray(y_train, dtype=np.float64)
        squeeze_out = y.ndim == 1
        y2 = y.reshape(len(y), -1)
        y_mu = y2.mean(axis=0)
        y_sd = np.where(y2.std(axis=0) < 1e-8, 1.0, y2.std(axis=0))
        out_dim = y2.shape[1]
        ytr = torch.from_numpy(((y2 - y_mu) / y_sd).astype(np.float32)).to(device)
        loss_fn = nn.MSELoss()

    model = nn.Sequential(
        nn.Linear(xtr.shape[1], hidden), nn.ReLU(), nn.Linear(hidden, out_dim)
    ).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    gen = torch.Generator().manual_seed(seed)
    fit_idx = None
    if early_stop:
        n_all = len(xtr)
        n_val = int(round(n_all * val_fraction))
        if not 0 < n_val < n_all:
            raise ValueError(
                f"early_stop val split is degenerate: n={n_all}, val_fraction={val_fraction}"
            )
        split = torch.randperm(n_all, generator=torch.Generator().manual_seed(seed))
        val_idx, fit_idx = split[:n_val], split[n_val:]

    n = len(xtr) if fit_idx is None else len(fit_idx)
    best_val = float("inf")
    best_state = None
    stale = 0
    model.train()
    for _ in range(epochs):
        perm = torch.randperm(n, generator=gen)
        if fit_idx is not None:
            perm = fit_idx[perm]
        for start in range(0, n, batch_size):
            idx = perm[start : start + batch_size]
            opt.zero_grad()
            loss = loss_fn(model(xtr[idx]), ytr[idx])
            loss.backward()
            opt.step()
        if early_stop:
            model.eval()
            with torch.no_grad():
                val = float(loss_fn(model(xtr[val_idx]), ytr[val_idx]))
            model.train()
            if val < best_val:
                best_val, stale = val, 0
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            else:
                stale += 1
                if stale >= patience:
                    break

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        out = model(xte).cpu().numpy()
    if task_type == "classification":
        return out.argmax(axis=1)
    pred = out.astype(np.float64) * y_sd + y_mu
    return pred[:, 0] if squeeze_out else pred
