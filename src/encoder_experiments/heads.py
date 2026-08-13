"""Probe heads: linear (scikit-learn) and 2-layer MLP (torch), fit on cached features.

Both heads standardize inputs with train-split statistics only. The MLP also
standardizes regression targets internally (and un-scales predictions) so the
same hyperparameters work across probe families with different label scales.
"""

from __future__ import annotations

import numpy as np


def standardize(X_train: np.ndarray, X_test: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Train-statistics z-scoring; constant dims pass through unscaled."""
    mu = X_train.mean(axis=0)
    sd = X_train.std(axis=0)
    sd = np.where(sd < 1e-8, 1.0, sd)
    return (X_train - mu) / sd, (X_test - mu) / sd


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
    seed: int = 0,
    device: str = "cpu",
) -> np.ndarray:
    """2-layer torch head (Linear -> ReLU -> Linear), Adam, fixed epoch budget.

    Classification: y_train is int class codes, returns predicted codes.
    Regression/bbox: y_train is [n] or [n, k] float, returns same shape.
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
    n = len(xtr)
    model.train()
    for _ in range(epochs):
        perm = torch.randperm(n, generator=gen)
        for start in range(0, n, batch_size):
            idx = perm[start : start + batch_size]
            opt.zero_grad()
            loss = loss_fn(model(xtr[idx]), ytr[idx])
            loss.backward()
            opt.step()

    model.eval()
    with torch.no_grad():
        out = model(xte).cpu().numpy()
    if task_type == "classification":
        return out.argmax(axis=1)
    pred = out.astype(np.float64) * y_sd + y_mu
    return pred[:, 0] if squeeze_out else pred
