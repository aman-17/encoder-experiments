"""Reconstruction probe (Exp 2a): destruction vs re-encoding at the bridge.

    uv run python -m encoder_experiments.reconstruct \
        --probes probes.jsonl \
        --s1 features/qwen35_vit__premerge --s2 features/qwen35_vit \
        --families pl2_extent,glyph_id --out results/recon

Trains BOTH inverse maps S2 -> S1 (ridge linear and MLP) on cached site
features for MATCHED probe points (same probes.jsonl, both directories,
full-grid or .sites layout — probe_fit.assemble_features reads either),
then reports per inverse kind:

  (a) feature-space residual R^2 of the reconstruction on held-out documents
      (uniform and variance-weighted over S1 dims), and
  (b) the FUNCTIONAL residual per probe family: heads fit on TRUE-S1 train
      features (probe_fit's own heads), evaluated on true-S1 test features vs
      on reconstructed-S1 test features; gap = true - reconstructed on the
      family's primary metric, with a paired document-bootstrap CI.

Only (b) licenses "information lost at the bridge" wording — a probe delta
alone licenses "not recoverable at probe capacity" (exp2a-bridge-localization
pre-registration). Discipline matches probe_fit: the SAME deterministic
document-level split (doc_is_train) governs the inverse map's training pairs
and every family's head fit, so reconstructed test features are out-of-sample
for both the inverse map and the heads; a doc on both sides is a hard error.

Point identity between the two caches is the site_store 6dp contract; a
point present in one cache but not the other is a hard error from
assemble_features (it means the caches were built from different
probes.jsonl), while images missing entirely from one cache are dropped from
the pairing and counted.
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .probe_fit import (
    FitConfig,
    ProbeRow,
    _fit_predict,
    assemble_features,
    doc_is_train,
    encode_labels,
    infer_task_type,
    load_probes,
)
from .probe_metrics import PRIMARY_METRIC, compute_metrics
from .site_store import round6

INVERSE_KINDS = ("mlp", "linear")


# --------------------------------------------------------------------------- #
# matched-pair assembly
# --------------------------------------------------------------------------- #

def pair_rows(families: dict[str, list[ProbeRow]]) -> list[ProbeRow]:
    """One synthetic row per unique (image_id, 6dp point) across all site
    rows — the training/eval set for the inverse map. Deterministic order
    (sorted by key); doc_id inherited from the source rows."""
    seen: dict[tuple[str, float, float], str] = {}
    for rows in families.values():
        for r in rows:
            if r.pooled:
                continue
            key = (r.image_id, round6(r.point_xy[0]), round6(r.point_xy[1]))
            seen.setdefault(key, r.doc_id)
    return [
        ProbeRow(
            probe="__recon_pair__", image_id=image_id, doc_id=seen[(image_id, x, y)],
            label=0, point_xy=[x, y], pooled=False, task_type=None, meta={},
        )
        for image_id, x, y in sorted(seen)
    ]


def assemble_matched(
    rows: list[ProbeRow], s1_dir: Path, s2_dir: Path
) -> tuple[np.ndarray, np.ndarray, list[ProbeRow], dict[str, int]]:
    """-> (X1, X2, matched rows in original order, missing counts). A row is
    kept only when BOTH caches have its image; a stored file that lacks the
    row's point is a hard error inside assemble_features (6dp contract)."""
    X1, kept1, miss1, _ = assemble_features(rows, s1_dir)
    X2, kept2, miss2, _ = assemble_features(rows, s2_dir)
    pos = {id(r): i for i, r in enumerate(rows)}
    in1 = {pos[id(r)]: k for k, r in enumerate(kept1)}
    in2 = {pos[id(r)]: k for k, r in enumerate(kept2)}
    common = sorted(set(in1) & set(in2))
    if not common:
        raise RuntimeError(
            f"no matched rows between {s1_dir} and {s2_dir} "
            f"({miss1} missing S1, {miss2} missing S2 of {len(rows)} rows)"
        )
    X1m = X1[[in1[p] for p in common]]
    X2m = X2[[in2[p] for p in common]]
    return X1m, X2m, [rows[p] for p in common], {"s1": miss1, "s2": miss2}


# --------------------------------------------------------------------------- #
# inverse map
# --------------------------------------------------------------------------- #

@dataclass
class InverseConfig:
    kind: str = "mlp"
    hidden: int = 512
    epochs: int = 200
    lr: float = 1e-3
    batch: int = 256
    early_stop: bool = False
    val_fraction: float = 0.15
    patience: int = 10
    seed: int = 0
    device: str = "cpu"

    def described(self) -> dict:
        if self.kind == "linear":
            return {"kind": self.kind, "alpha": 1.0, "seed": self.seed}
        return {
            "kind": self.kind, "hidden": self.hidden, "epochs": self.epochs,
            "lr": self.lr, "batch": self.batch, "early_stop": self.early_stop,
            "val_fraction": self.val_fraction, "patience": self.patience,
            "seed": self.seed,
        }


def fit_inverse(X_train: np.ndarray, Y_train: np.ndarray, cfg: InverseConfig):
    """-> predict(X) -> Y_hat. Standardization (inputs AND targets) uses
    train statistics only; the returned callable applies to any X, so family
    features reconstruct through the same frozen map.

    MLP kind honors cfg.early_stop the same way heads.fit_predict_mlp does:
    seeded row-level val split, `epochs` as a maximum, best-val-epoch weights
    restored; deterministic given cfg.seed."""
    if cfg.kind not in INVERSE_KINDS:
        raise ValueError(f"unknown inverse kind {cfg.kind!r}; choose from {INVERSE_KINDS}")
    x_mu = X_train.mean(axis=0)
    x_sd = np.where(X_train.std(axis=0) < 1e-8, 1.0, X_train.std(axis=0))
    y_mu = Y_train.mean(axis=0)
    y_sd = np.where(Y_train.std(axis=0) < 1e-8, 1.0, Y_train.std(axis=0))
    Xs = ((X_train - x_mu) / x_sd).astype(np.float32)
    Ys = ((Y_train - y_mu) / y_sd).astype(np.float32)

    if cfg.kind == "linear":
        from sklearn.linear_model import Ridge

        reg = Ridge(alpha=1.0, random_state=cfg.seed)
        reg.fit(Xs, Ys)

        def predict(X: np.ndarray) -> np.ndarray:
            out = reg.predict(((X - x_mu) / x_sd).astype(np.float32))
            return out.astype(np.float64) * y_sd + y_mu

        return predict

    import torch
    from torch import nn

    torch.manual_seed(cfg.seed)
    model = nn.Sequential(
        nn.Linear(Xs.shape[1], cfg.hidden), nn.ReLU(), nn.Linear(cfg.hidden, Ys.shape[1])
    ).to(cfg.device)
    opt = torch.optim.Adam(model.parameters(), lr=cfg.lr)
    loss_fn = nn.MSELoss()
    xtr = torch.from_numpy(np.ascontiguousarray(Xs)).to(cfg.device)
    ytr = torch.from_numpy(np.ascontiguousarray(Ys)).to(cfg.device)
    gen = torch.Generator().manual_seed(cfg.seed)
    fit_idx = None
    if cfg.early_stop:
        n_all = len(xtr)
        n_val = int(round(n_all * cfg.val_fraction))
        if not 0 < n_val < n_all:
            raise ValueError(
                f"early_stop val split is degenerate: n={n_all}, val_fraction={cfg.val_fraction}"
            )
        split = torch.randperm(n_all, generator=torch.Generator().manual_seed(cfg.seed))
        val_idx, fit_idx = split[:n_val], split[n_val:]

    n = len(xtr) if fit_idx is None else len(fit_idx)
    best_val = float("inf")
    best_state = None
    stale = 0
    model.train()
    for _ in range(cfg.epochs):
        perm = torch.randperm(n, generator=gen)
        if fit_idx is not None:
            perm = fit_idx[perm]
        for start in range(0, n, cfg.batch):
            idx = perm[start : start + cfg.batch]
            opt.zero_grad()
            loss = loss_fn(model(xtr[idx]), ytr[idx])
            loss.backward()
            opt.step()
        if cfg.early_stop:
            model.eval()
            with torch.no_grad():
                val = float(loss_fn(model(xtr[val_idx]), ytr[val_idx]))
            model.train()
            if val < best_val:
                best_val, stale = val, 0
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
            else:
                stale += 1
                if stale >= cfg.patience:
                    break
    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()

    def predict(X: np.ndarray) -> np.ndarray:
        xs = torch.from_numpy(
            np.ascontiguousarray((X - x_mu) / x_sd, dtype=np.float32)
        ).to(cfg.device)
        with torch.no_grad():
            out = model(xs).cpu().numpy()
        return out.astype(np.float64) * y_sd + y_mu

    return predict


def feature_r2(Y_true: np.ndarray, Y_pred: np.ndarray) -> dict[str, float]:
    from sklearn.metrics import r2_score

    yt = Y_true.astype(np.float64)
    yp = Y_pred.astype(np.float64)
    return {
        "uniform": float(r2_score(yt, yp, multioutput="uniform_average")),
        "variance_weighted": float(r2_score(yt, yp, multioutput="variance_weighted")),
    }


# --------------------------------------------------------------------------- #
# split
# --------------------------------------------------------------------------- #

def split_masks(
    rows: list[ProbeRow], train_frac: float, split_seed: int, what: str
) -> tuple[np.ndarray, np.ndarray]:
    docs = np.array([r.doc_id for r in rows])
    train = np.array([doc_is_train(d, train_frac, split_seed) for d in docs], dtype=bool)
    if train.all() or not train.any():
        raise RuntimeError(
            f"{what}: document split left one side empty "
            f"({len(set(docs))} docs, train_frac={train_frac})"
        )
    straddlers = set(docs[train]) & set(docs[~train])
    if straddlers:  # hard invariant — leakage would silently inflate metrics
        raise AssertionError(f"{what}: doc_id(s) on BOTH split sides: {sorted(straddlers)[:10]}")
    return train, docs


def paired_gap_ci(
    task_type: str,
    y_true: np.ndarray,
    pred_a: np.ndarray,
    pred_b: np.ndarray,
    doc_ids: np.ndarray,
    metric: str,
    n_boot: int,
    seed: int,
) -> list[float]:
    """95% CI of metric(pred_a) - metric(pred_b) under joint document
    resampling — the paired design the site-gap thresholds need."""
    docs = np.asarray(doc_ids)
    uniq = np.unique(docs)
    idx_by_doc = [np.flatnonzero(docs == d) for d in uniq]
    rng = np.random.default_rng(seed)
    gaps = []
    for _ in range(n_boot):
        pick = rng.integers(0, len(uniq), size=len(uniq))
        idx = np.concatenate([idx_by_doc[i] for i in pick])
        a = compute_metrics(task_type, y_true[idx], pred_a[idx])[metric]
        b = compute_metrics(task_type, y_true[idx], pred_b[idx])[metric]
        gaps.append(a - b)
    return [float(np.nanpercentile(gaps, 2.5)), float(np.nanpercentile(gaps, 97.5))]


# --------------------------------------------------------------------------- #
# functional residual per family
# --------------------------------------------------------------------------- #

def run_family(
    probe: str,
    rows: list[ProbeRow],
    s1_dir: Path,
    s2_dir: Path,
    predicts: dict[str, "callable"],
    cfg: FitConfig,
) -> dict:
    site_rows = [r for r in rows if not r.pooled]
    if not site_rows:
        raise ValueError(f"{probe}: pooled-only family — reconstruction reads site points")
    X1, X2, kept, missing = assemble_matched(site_rows, s1_dir, s2_dir)
    if len(kept) < cfg.min_samples:
        raise RuntimeError(f"{probe}: only {len(kept)} matched samples (missing={missing})")
    task_type = infer_task_type(probe, kept)
    y, class_names = encode_labels(task_type, kept)
    n_classes = len(class_names) if class_names is not None else None
    train, docs = split_masks(kept, cfg.train_frac, cfg.split_seed, probe)
    test = ~train
    y_test = y[test]
    recon_test = {
        kind: predict(X2[test]).astype(np.float32) for kind, predict in predicts.items()
    }
    primary = PRIMARY_METRIC[task_type]

    heads_out: dict[str, dict] = {}
    for head in cfg.heads:
        pred_true = _fit_predict(head, task_type, X1[train], y[train], X1[test], cfg, n_classes)
        m_true = compute_metrics(task_type, y_test, pred_true)
        recon_out: dict[str, dict] = {}
        for kind, X1_recon_test in recon_test.items():
            pred_recon = _fit_predict(
                head, task_type, X1[train], y[train], X1_recon_test, cfg, n_classes
            )
            m_recon = compute_metrics(task_type, y_test, pred_recon)
            recon_out[kind] = {
                "inverse_kind": kind,
                "metrics": m_recon,
                "gap": m_true[primary] - m_recon[primary],
                "gap_ci95": paired_gap_ci(
                    task_type, y_test, pred_true, pred_recon, docs[test],
                    primary, cfg.n_boot, cfg.seed,
                ),
            }
        heads_out[head] = {"true_s1": {"metrics": m_true}, "recon_s1": recon_out}
    return {
        "probe": probe,
        "task_type": task_type,
        "primary_metric": primary,
        "n_samples": int(len(kept)),
        "n_train": int(train.sum()),
        "n_test": int(test.sum()),
        "n_missing": missing,
        "class_names": class_names,
        "heads": heads_out,
    }


# --------------------------------------------------------------------------- #
# pipeline
# --------------------------------------------------------------------------- #

def run(
    probes: Path,
    s1_dir: Path,
    s2_dir: Path,
    families: list[str] | None,
    inv_cfgs: dict[str, InverseConfig],
    fit_cfg: FitConfig,
) -> dict:
    all_families = load_probes(probes)
    if families:
        unknown = set(families) - set(all_families)
        if unknown:
            raise ValueError(f"families not in {probes}: {sorted(unknown)}")
        selected = {k: all_families[k] for k in families}
    else:
        selected = {
            k: v for k, v in all_families.items() if any(not r.pooled for r in v)
        }

    pairs = pair_rows(selected)
    if not pairs:
        raise ValueError(f"{probes}: no site rows in the selected families")
    X1, X2, kept_pairs, missing = assemble_matched(pairs, s1_dir, s2_dir)
    train, docs = split_masks(kept_pairs, fit_cfg.train_frac, fit_cfg.split_seed, "recon pairs")
    test = ~train

    predicts: dict[str, "callable"] = {}
    inverses_out: dict[str, dict] = {}
    for kind, inv_cfg in inv_cfgs.items():
        if inv_cfg.kind != kind:
            raise ValueError(f"inverse config keyed {kind!r} has kind={inv_cfg.kind!r}")
        predict = fit_inverse(X2[train], X1[train], inv_cfg)
        predicts[kind] = predict
        inverses_out[kind] = {
            "inverse_kind": kind,
            "config": inv_cfg.described(),
            "feature_r2": feature_r2(X1[test], predict(X2[test])),
        }

    families_out: dict[str, dict] = {}
    for probe in sorted(selected):
        try:
            families_out[probe] = run_family(
                probe, selected[probe], s1_dir, s2_dir, predicts, fit_cfg
            )
        except Exception as exc:  # noqa: BLE001 — per-family isolation, as in probe_fit
            families_out[probe] = {
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc(),
            }
            print(f"[reconstruct] ERROR {probe}: {exc} (recorded; continuing)", file=sys.stderr)

    return {
        "s1": s1_dir.name,
        "s2": s2_dir.name,
        "inverses": inverses_out,
        "split": {
            "by": "document", "train_frac": fit_cfg.train_frac, "seed": fit_cfg.split_seed,
        },
        "pairs": {
            "n_train": int(train.sum()),
            "n_test": int(test.sum()),
            "n_docs_train": int(len(set(docs[train]))),
            "n_docs_test": int(len(set(docs[test]))),
            "d_s1": int(X1.shape[1]),
            "d_s2": int(X2.shape[1]),
            "n_missing": missing,
        },
        "families": families_out,
    }


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--probes", type=Path, required=True, help="probes.jsonl")
    ap.add_argument("--s1", type=Path, required=True, help="target site feature dir (pre-merge)")
    ap.add_argument("--s2", type=Path, required=True, help="source site feature dir (post-merge)")
    ap.add_argument("--out", type=Path, default=Path("results/recon"))
    ap.add_argument("--families", default=None, help="comma-separated probe-family filter")
    ap.add_argument("--heads", default="linear,mlp")
    ap.add_argument("--inv-hidden", type=int, default=InverseConfig.hidden)
    ap.add_argument("--inv-epochs", type=int, default=InverseConfig.epochs)
    ap.add_argument("--inv-lr", type=float, default=InverseConfig.lr)
    ap.add_argument("--inv-batch", type=int, default=InverseConfig.batch)
    ap.add_argument("--inv-early-stop", action="store_true")
    ap.add_argument("--inv-val-fraction", type=float, default=InverseConfig.val_fraction)
    ap.add_argument("--inv-patience", type=int, default=InverseConfig.patience)
    ap.add_argument("--train-frac", type=float, default=0.8)
    ap.add_argument("--split-seed", type=int, default=0)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--bootstrap", type=int, default=1000)
    ap.add_argument("--mlp-hidden", type=int, default=512)
    ap.add_argument("--mlp-epochs", type=int, default=30)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--min-samples", type=int, default=FitConfig.min_samples)
    args = ap.parse_args(argv)

    heads = [h.strip() for h in args.heads.split(",") if h.strip()]
    for h in heads:
        if h not in ("linear", "mlp"):
            ap.error(f"unknown head {h!r} (choose from linear, mlp)")
    families = (
        [f.strip() for f in args.families.split(",") if f.strip()] if args.families else None
    )
    inv_cfgs = {
        "linear": InverseConfig(kind="linear", seed=args.seed),
        "mlp": InverseConfig(
            kind="mlp", hidden=args.inv_hidden, epochs=args.inv_epochs,
            lr=args.inv_lr, batch=args.inv_batch, early_stop=args.inv_early_stop,
            val_fraction=args.inv_val_fraction, patience=args.inv_patience,
            seed=args.seed, device=args.device,
        ),
    }
    fit_cfg = FitConfig(
        heads=heads, train_frac=args.train_frac, split_seed=args.split_seed,
        seed=args.seed, n_boot=args.bootstrap, mlp_hidden=args.mlp_hidden,
        mlp_epochs=args.mlp_epochs, device=args.device, min_samples=args.min_samples,
    )

    result = run(args.probes, args.s1, args.s2, families, inv_cfgs, fit_cfg)

    args.out.mkdir(parents=True, exist_ok=True)
    out_path = args.out / f"recon__{args.s2.name}__to__{args.s1.name}.json"
    out_path.write_text(json.dumps(result, indent=2))

    r2s = " ".join(
        f"{kind}: uniform={inv['feature_r2']['uniform']:.3f} "
        f"var-weighted={inv['feature_r2']['variance_weighted']:.3f}"
        for kind, inv in result["inverses"].items()
    )
    print(
        f"[reconstruct] {result['s2']} -> {result['s1']}: "
        f"pairs train={result['pairs']['n_train']} test={result['pairs']['n_test']} "
        f"R2 {r2s}"
    )
    errored = 0
    for probe, fam in sorted(result["families"].items()):
        if "error" in fam:
            errored += 1
            print(f"[reconstruct] {probe}: ERROR {fam['error']}", file=sys.stderr)
            continue
        primary = fam["primary_metric"]
        for h, d in fam["heads"].items():
            shown = " ".join(
                f"{kind}->{r['metrics'][primary]:.3f}"
                f"(gap {r['gap']:+.3f} ci [{r['gap_ci95'][0]:+.3f}, {r['gap_ci95'][1]:+.3f}])"
                for kind, r in d["recon_s1"].items()
            )
            print(
                f"[reconstruct] {probe} ({primary}) {h}: "
                f"true={d['true_s1']['metrics'][primary]:.3f} {shown}"
            )
    print(f"[reconstruct] wrote {out_path}")
    return 1 if errored == len(result["families"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
