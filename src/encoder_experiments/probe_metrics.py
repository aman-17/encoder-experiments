"""Probe metrics + document-level bootstrap CIs.

Task types and their metrics (primary metric first — it drives summary.md):
    classification -> accuracy, macro_f1
    regression     -> r2, mae
    bbox           -> mean_iou, iou_at_50   (boxes are [x, y, w, h], normalized)

Bootstrap resamples DOCUMENTS (not samples) with replacement: probe samples
within one page/document are correlated, so per-sample bootstrap would give
overconfident intervals.
"""

from __future__ import annotations

import numpy as np

PRIMARY_METRIC = {
    "classification": "accuracy",
    "regression": "r2",
    "bbox": "mean_iou",
}


def bbox_iou(pred: np.ndarray, gold: np.ndarray) -> np.ndarray:
    """Per-row IoU of [x, y, w, h] boxes. pred/gold: [n, 4]. Negative pred w/h -> 0."""
    pred = np.asarray(pred, dtype=np.float64).reshape(-1, 4)
    gold = np.asarray(gold, dtype=np.float64).reshape(-1, 4)
    pw = np.clip(pred[:, 2], 0.0, None)
    ph = np.clip(pred[:, 3], 0.0, None)
    gw = np.clip(gold[:, 2], 0.0, None)
    gh = np.clip(gold[:, 3], 0.0, None)
    ix = np.minimum(pred[:, 0] + pw, gold[:, 0] + gw) - np.maximum(pred[:, 0], gold[:, 0])
    iy = np.minimum(pred[:, 1] + ph, gold[:, 1] + gh) - np.maximum(pred[:, 1], gold[:, 1])
    inter = np.clip(ix, 0.0, None) * np.clip(iy, 0.0, None)
    union = pw * ph + gw * gh - inter
    return np.where(union > 0, inter / np.maximum(union, 1e-12), 0.0)


def compute_metrics(task_type: str, y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    if task_type == "classification":
        from sklearn.metrics import f1_score

        y_true = np.asarray(y_true)
        y_pred = np.asarray(y_pred)
        return {
            "accuracy": float(np.mean(y_true == y_pred)),
            "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        }
    if task_type == "regression":
        from sklearn.metrics import r2_score

        yt = np.asarray(y_true, dtype=np.float64)
        yp = np.asarray(y_pred, dtype=np.float64)
        return {
            "r2": float(r2_score(yt, yp)),
            "mae": float(np.mean(np.abs(yt - yp))),
        }
    if task_type == "bbox":
        iou = bbox_iou(y_pred, y_true)
        return {
            "mean_iou": float(iou.mean()),
            "iou_at_50": float(np.mean(iou >= 0.5)),
        }
    raise ValueError(f"unknown task_type {task_type!r}")


def bootstrap_ci(
    task_type: str,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    doc_ids: np.ndarray,
    n_boot: int = 1000,
    seed: int = 0,
    alpha: float = 0.05,
) -> dict[str, list[float]]:
    """Percentile CIs over document resamples of frozen test-set predictions."""
    docs = np.asarray(doc_ids)
    uniq = np.unique(docs)
    idx_by_doc = [np.flatnonzero(docs == d) for d in uniq]
    rng = np.random.default_rng(seed)
    per_metric: dict[str, list[float]] = {}
    for _ in range(n_boot):
        pick = rng.integers(0, len(uniq), size=len(uniq))
        idx = np.concatenate([idx_by_doc[i] for i in pick])
        m = compute_metrics(task_type, np.asarray(y_true)[idx], np.asarray(y_pred)[idx])
        for k, v in m.items():
            per_metric.setdefault(k, []).append(v)
    lo, hi = 100 * alpha / 2, 100 * (1 - alpha / 2)
    return {
        k: [float(np.nanpercentile(v, lo)), float(np.nanpercentile(v, hi))]
        for k, v in per_metric.items()
    }
