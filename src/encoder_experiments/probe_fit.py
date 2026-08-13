"""Probe-FIT harness: cached features + probes.jsonl -> the Exp 1 results table.

    uv run python -m encoder_experiments.probe_fit \
        --features features/ --probes probes.jsonl \
        --encoders clip_vit_l_336,siglip2_so400m_384 --out results/

probes.jsonl contract — one probe SAMPLE per line, joined to the feature cache
on image_id (features/<encoder>/<image_id>.safetensors from extract.py):

    {"probe": "pl1_patch_class", "image_id": "docs/foo_s202__p1",
     "point_xy": [0.41, 0.62], "label": "table",
     "doc_id": "docs/foo",                 # optional; derived from image_id otherwise
     "task_type": "classification",        # optional; inferred otherwise
     "site": "point",                      # "pooled" for pooled-input probes
     "meta": {"scan_severity": 2, "difficulty": "hard"}}

Conventions:
  - point_xy is (x, y) normalized to [0, 1] over the image (sites.py convention);
    the site feature is sites.features_at(tokens, grid, point_xy). Probes whose
    family name starts with "pl3" (or with site == "pooled") read the pooled
    vector instead and need no point.
  - task_type inference: probe name starting with "pl2" -> bbox (label is
    [x, y, w, h], IoU-scored); float labels (or float lists, e.g.
    pl3_summary's presence+n_boxes vector) -> regression; int/str/bool labels
    -> classification (e.g. the cell_row / cell_col sub-probes, whose int
    labels are fitted independently and reported side by side).
  - dict labels are NOT part of the contract and are rejected with a hard
    error: multi-target probes must be split into one sub-probe per target
    (cell_rc -> cell_row + cell_col) or flattened to a vector (pl3_summary)
    at the sampler level.
  - doc_id: the row's own doc_id wins (probe_sampler copies it from the
    manifest). The derive fallback strips a trailing degrade suffix
    (__sev<key>, e.g. __sev2b), a page suffix (__p<N>) and a seed suffix
    (_s<NNN>) from image_id, so severity variants of one document never
    straddle the train/test split; a hard assert after splitting certifies no
    doc_id appears on both sides. Emit doc_id explicitly when ids don't
    follow that shape.
  - error isolation: a (probe family x encoder) pair that raises records the
    error in its results JSON (results/<probe>__<encoder>.json with an
    "error" field) and the run continues; summary.md is always written with
    the successful families plus an errors section.

Per (probe family x encoder) it fits linear + 2-layer-MLP heads on a fixed
document-level train/test split (never samples of one doc on both sides), runs
a shuffled-train-label control per head, bootstraps CIs over test documents,
and slices test metrics by meta.scan_severity, meta.difficulty, and per-class
for pl1. Feature files are opened lazily one image at a time via safetensors —
only the sampled site vectors are kept, never all grids at once.

Outputs: results/<probe>__<encoder>.json + consolidated results/summary.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import traceback
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from safetensors import safe_open

from .extract import safe_image_id
from .heads import fit_predict_linear, fit_predict_mlp
from .probe_metrics import PRIMARY_METRIC, bootstrap_ci, compute_metrics
from .sites import features_at

TASK_TYPES = {"classification", "regression", "bbox"}


# --------------------------------------------------------------------------- #
# probes.jsonl loading
# --------------------------------------------------------------------------- #

@dataclass
class ProbeRow:
    probe: str
    image_id: str
    doc_id: str
    label: object
    point_xy: list[float] | None
    pooled: bool
    task_type: str | None
    meta: dict


def derive_doc_id(image_id: str) -> str:
    """Fallback when a probe row carries no doc_id (prefer the row's own).

    Strips, in order: a trailing degrade suffix (__sev<key>, e.g. __sev3 /
    __sev2b — without this, clean and degraded variants of ONE document get
    different doc_ids and can straddle the train/test split), a page suffix
    (__p<N>), and a generator seed suffix (_s<NNN>).
    """
    stem = re.sub(r"__sev\d+b?$", "", image_id)
    stem = re.sub(r"__p\d+$", "", stem)
    return re.sub(r"_s\d+$", "", stem)


def load_probes(path: Path) -> dict[str, list[ProbeRow]]:
    families: dict[str, list[ProbeRow]] = defaultdict(list)
    with open(path) as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            for key in ("probe", "image_id", "label"):
                if key not in row:
                    raise ValueError(f"{path}:{line_no}: probe row needs {key!r}")
            probe = row["probe"]
            pooled = row.get("site") == "pooled" or probe.startswith("pl3")
            point_xy = row.get("point_xy")
            if not pooled and point_xy is None:
                raise ValueError(
                    f"{path}:{line_no}: site probe {probe!r} needs point_xy "
                    "(or site: 'pooled')"
                )
            task_type = row.get("task_type")
            if task_type is not None and task_type not in TASK_TYPES:
                raise ValueError(f"{path}:{line_no}: task_type must be one of {sorted(TASK_TYPES)}")
            families[probe].append(
                ProbeRow(
                    probe=probe,
                    image_id=row["image_id"],
                    doc_id=row.get("doc_id") or derive_doc_id(row["image_id"]),
                    label=row["label"],
                    point_xy=point_xy,
                    pooled=pooled,
                    task_type=task_type,
                    meta=row.get("meta") or {},
                )
            )
    return dict(families)


def infer_task_type(probe: str, rows: list[ProbeRow]) -> str:
    explicit = {r.task_type for r in rows if r.task_type is not None}
    if len(explicit) > 1:
        raise ValueError(f"probe {probe!r}: conflicting task_type values {sorted(explicit)}")
    if explicit:
        return explicit.pop()
    if probe.startswith("pl2"):
        return "bbox"
    label = rows[0].label
    if isinstance(label, dict):
        raise ValueError(
            f"probe {probe!r}: dict labels are not part of the probes.jsonl "
            "contract — split multi-target probes into one sub-probe per "
            "target (e.g. cell_row / cell_col) or flatten to a vector at the "
            "sampler level"
        )
    if isinstance(label, (list, tuple)):
        return "regression"
    if isinstance(label, bool) or isinstance(label, (int, str)):
        return "classification"
    if isinstance(label, float):
        return "regression"
    raise ValueError(f"probe {probe!r}: cannot infer task_type from label {label!r}")


def encode_labels(task_type: str, rows: list[ProbeRow]) -> tuple[np.ndarray, list[str] | None]:
    """-> (y, class names or None). Classification y is int codes into names."""
    if task_type == "classification":
        names = sorted({str(r.label) for r in rows})
        code = {n: i for i, n in enumerate(names)}
        return np.array([code[str(r.label)] for r in rows], dtype=np.int64), names
    y = np.array([r.label for r in rows], dtype=np.float64)
    if task_type == "bbox" and (y.ndim != 2 or y.shape[1] != 4):
        raise ValueError(f"bbox probe labels must be [x, y, w, h], got shape {y.shape}")
    return y, None


# --------------------------------------------------------------------------- #
# feature assembly (lazy, one image at a time)
# --------------------------------------------------------------------------- #

def assemble_features(
    rows: list[ProbeRow], enc_dir: Path
) -> tuple[np.ndarray, list[ProbeRow], int]:
    """-> (X [n_kept, D] float32, kept rows in original order, n_missing).

    Opens each image's safetensors lazily (safe_open), reads only the tensor it
    needs, samples every site of that image in one features_at call, and drops
    the grid before moving on — full grids are never held for more than one
    image.
    """
    by_image: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        by_image[r.image_id].append(i)

    feats: dict[int, np.ndarray] = {}
    n_missing = 0
    for image_id, idxs in by_image.items():
        path = enc_dir / f"{safe_image_id(image_id)}.safetensors"
        if not path.exists():
            n_missing += len(idxs)
            continue
        with safe_open(path, framework="pt", device="cpu") as f:
            pooled_idxs = [i for i in idxs if rows[i].pooled]
            site_idxs = [i for i in idxs if not rows[i].pooled]
            if pooled_idxs:
                vec = f.get_tensor("pooled").float().numpy()
                for i in pooled_idxs:
                    feats[i] = vec
            if site_idxs:
                meta = f.metadata()
                grid_hw = (int(meta["grid_h"]), int(meta["grid_w"]))
                if grid_hw[0] <= 0:
                    raise ValueError(
                        f"{path}: encoder cached no spatial grid; site probes need one"
                    )
                tokens = f.get_tensor("tokens")
                pts = torch.tensor([rows[i].point_xy for i in site_idxs], dtype=torch.float32)
                sampled = features_at(tokens, grid_hw, pts).numpy()  # [K, D] float32
                for k, i in enumerate(site_idxs):
                    feats[i] = sampled[k]

    kept = [i for i in range(len(rows)) if i in feats]
    if not kept:
        return np.zeros((0, 0), dtype=np.float32), [], n_missing
    X = np.stack([feats[i] for i in kept]).astype(np.float32)
    return X, [rows[i] for i in kept], n_missing


# --------------------------------------------------------------------------- #
# document-level split
# --------------------------------------------------------------------------- #

def doc_is_train(doc_id: str, train_frac: float, split_seed: int) -> bool:
    """Deterministic hash split: a document lands on exactly one side, always."""
    h = hashlib.sha1(f"{split_seed}:{doc_id}".encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64 < train_frac


# --------------------------------------------------------------------------- #
# slices
# --------------------------------------------------------------------------- #

def _slice_axes(probe: str, task_type: str, rows: list[ProbeRow], names: list[str] | None):
    """-> {axis_name: per-sample slice values (None = unsliced sample)}."""
    axes: dict[str, list] = {
        "scan_severity": [r.meta.get("scan_severity") for r in rows],
        "difficulty": [r.meta.get("difficulty", r.meta.get("difficulty_bin")) for r in rows],
    }
    if probe.startswith("pl1"):
        if task_type == "classification" and names is not None:
            axes["class"] = [str(r.label) for r in rows]
        else:
            axes["class"] = [r.meta.get("class") for r in rows]
    return axes


def slice_metrics(
    task_type: str,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    axes: dict[str, list],
    test_mask: np.ndarray,
) -> dict:
    out: dict[str, dict] = {}
    test_idx = np.flatnonzero(test_mask)
    for axis, values in axes.items():
        groups: dict[str, list[int]] = defaultdict(list)
        for pos, i in enumerate(test_idx):
            v = values[i]
            if v is not None:
                groups[str(v)].append(pos)
        if not groups:
            continue
        out[axis] = {}
        for key in sorted(groups):
            pos = np.array(groups[key])
            out[axis][key] = {
                "n": int(len(pos)),
                **compute_metrics(task_type, y_true[pos], y_pred[pos]),
            }
    return out


# --------------------------------------------------------------------------- #
# per (probe x encoder) run
# --------------------------------------------------------------------------- #

@dataclass
class FitConfig:
    heads: list[str]
    train_frac: float = 0.8
    split_seed: int = 0
    seed: int = 0
    n_boot: int = 1000
    mlp_hidden: int = 512
    mlp_epochs: int = 30
    mlp_lr: float = 1e-3
    mlp_batch: int = 256
    device: str = "cpu"
    min_samples: int = 10


def _fit_predict(
    head: str,
    task_type: str,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    cfg: FitConfig,
    n_classes: int | None,
) -> np.ndarray:
    if head == "linear":
        return fit_predict_linear(task_type, X_train, y_train, X_test, seed=cfg.seed)
    if head == "mlp":
        return fit_predict_mlp(
            task_type, X_train, y_train, X_test,
            n_classes=n_classes, hidden=cfg.mlp_hidden, epochs=cfg.mlp_epochs,
            lr=cfg.mlp_lr, batch_size=cfg.mlp_batch, seed=cfg.seed, device=cfg.device,
        )
    raise ValueError(f"unknown head {head!r}")


def run_pair(probe: str, rows: list[ProbeRow], enc_dir: Path, cfg: FitConfig) -> dict | None:
    X, kept, n_missing = assemble_features(rows, enc_dir)
    if len(kept) < cfg.min_samples:
        print(
            f"[probe_fit] SKIP {probe} x {enc_dir.name}: only {len(kept)} samples "
            f"with features ({n_missing} missing)",
            file=sys.stderr,
        )
        return None

    task_type = infer_task_type(probe, kept)
    y, class_names = encode_labels(task_type, kept)
    docs = np.array([r.doc_id for r in kept])
    train_mask = np.array(
        [doc_is_train(d, cfg.train_frac, cfg.split_seed) for d in docs], dtype=bool
    )
    if train_mask.all() or not train_mask.any():
        raise RuntimeError(
            f"{probe} x {enc_dir.name}: document split left one side empty "
            f"({len(set(docs))} docs, train_frac={cfg.train_frac}); "
            "adjust --train-frac / --split-seed or add documents"
        )
    test_mask = ~train_mask
    # doc lists derived from the actual per-sample assignment, so the output
    # itself certifies no document straddles the split
    train_docs = sorted(set(docs[train_mask]))
    test_docs = sorted(set(docs[test_mask]))
    straddlers = set(train_docs) & set(test_docs)
    if straddlers:  # hard invariant — leakage would silently inflate metrics
        raise AssertionError(
            f"{probe} x {enc_dir.name}: doc_id(s) on BOTH split sides: "
            f"{sorted(straddlers)[:10]}"
        )

    n_classes = len(class_names) if class_names is not None else None
    axes = _slice_axes(probe, task_type, kept, class_names)
    rng = np.random.default_rng(cfg.seed)
    y_test = y[test_mask]
    docs_test = docs[test_mask]

    heads_out: dict[str, dict] = {}
    for head in cfg.heads:
        pred = _fit_predict(head, task_type, X[train_mask], y[train_mask], X[test_mask], cfg, n_classes)
        real = {
            "metrics": compute_metrics(task_type, y_test, pred),
            "ci95": bootstrap_ci(
                task_type, y_test, pred, docs_test, n_boot=cfg.n_boot, seed=cfg.seed
            ),
        }
        y_shuf = y[train_mask].copy()
        y_shuf = y_shuf[rng.permutation(len(y_shuf))]
        pred_shuf = _fit_predict(head, task_type, X[train_mask], y_shuf, X[test_mask], cfg, n_classes)
        heads_out[head] = {
            "real": real,
            "shuffled": {"metrics": compute_metrics(task_type, y_test, pred_shuf)},
            "slices": slice_metrics(task_type, y_test, pred, axes, test_mask),
        }

    return {
        "probe": probe,
        "encoder": enc_dir.name,
        "task_type": task_type,
        "primary_metric": PRIMARY_METRIC[task_type],
        "n_samples": int(len(kept)),
        "n_train": int(train_mask.sum()),
        "n_test": int(test_mask.sum()),
        "n_missing_features": int(n_missing),
        "n_docs": int(len(train_docs) + len(test_docs)),
        "train_docs": train_docs,
        "test_docs": test_docs,
        "class_names": class_names,
        "split": {"by": "document", "train_frac": cfg.train_frac, "seed": cfg.split_seed},
        "bootstrap": {"n_resamples": cfg.n_boot, "unit": "document"},
        "heads": heads_out,
    }


# --------------------------------------------------------------------------- #
# summary.md
# --------------------------------------------------------------------------- #

def _fmt(v: float) -> str:
    return f"{v:.3f}"


def write_summary(
    results: list[dict], out_dir: Path, cfg: FitConfig,
    errors: list[dict] | None = None,
) -> Path:
    lines = [
        "# Probe-FIT results",
        "",
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}. "
        f"Fixed document-level split (train_frac={cfg.train_frac}, seed={cfg.split_seed}); "
        f"95% CIs from {cfg.n_boot} bootstrap resamples over test documents; "
        "shuf = shuffled-train-label control, delta = real - shuf on the primary metric.",
        "",
    ]
    by_probe: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        by_probe[r["probe"]].append(r)

    for probe in sorted(by_probe):
        rs = by_probe[probe]
        task = rs[0]["task_type"]
        primary = rs[0]["primary_metric"]
        secondary = [m for m in rs[0]["heads"][cfg.heads[0]]["real"]["metrics"] if m != primary]
        lines += [f"## {probe} — {task} (primary: {primary})", ""]
        header = ["encoder", "n_test"]
        for head in cfg.heads:
            header += [f"{head} {primary}", "95% CI", "shuf", "delta"]
            header += [f"{head} {m}" for m in secondary]
        lines.append("| " + " | ".join(header) + " |")
        lines.append("|" + "---|" * len(header))
        for r in sorted(rs, key=lambda x: x["encoder"]):
            cells = [r["encoder"], str(r["n_test"])]
            for head in cfg.heads:
                h = r["heads"][head]
                real = h["real"]["metrics"][primary]
                lo, hi = h["real"]["ci95"][primary]
                shuf = h["shuffled"]["metrics"][primary]
                cells += [
                    _fmt(real),
                    f"[{_fmt(lo)}, {_fmt(hi)}]",
                    _fmt(shuf),
                    f"{real - shuf:+.3f}",
                ]
                cells += [_fmt(h["real"]["metrics"][m]) for m in secondary]
            lines.append("| " + " | ".join(cells) + " |")
        lines.append("")

    if not results:
        lines += ["_No (probe x encoder) pair produced results._", ""]
    if errors:
        lines += ["## Errors", ""]
        lines.append("| probe | encoder | error |")
        lines.append("|---|---|---|")
        for e in errors:
            msg = str(e.get("error", "")).replace("|", "\\|").replace("\n", " ")
            lines.append(f"| {e.get('probe')} | {e.get('encoder')} | {msg} |")
        lines.append("")

    path = out_dir / "summary.md"
    path.write_text("\n".join(lines))
    return path


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--features", type=Path, required=True, help="root with <encoder>/ subdirs")
    ap.add_argument("--probes", type=Path, required=True, help="probes.jsonl")
    ap.add_argument("--encoders", required=True, help="comma-separated feature subdir names")
    ap.add_argument("--out", type=Path, default=Path("results"))
    ap.add_argument("--heads", default="linear,mlp")
    ap.add_argument("--probe", default=None, help="comma-separated probe-family filter")
    ap.add_argument("--train-frac", type=float, default=0.8)
    ap.add_argument("--split-seed", type=int, default=0)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--bootstrap", type=int, default=1000)
    ap.add_argument("--mlp-hidden", type=int, default=512)
    ap.add_argument("--mlp-epochs", type=int, default=30)
    ap.add_argument("--mlp-lr", type=float, default=1e-3)
    ap.add_argument("--mlp-batch", type=int, default=256)
    ap.add_argument("--device", default="cpu", help="device for the MLP head")
    ap.add_argument(
        "--min-samples", type=int, default=FitConfig.min_samples,
        help="skip a (probe x encoder) pair with fewer joined samples than this",
    )
    args = ap.parse_args(argv)

    heads = [h.strip() for h in args.heads.split(",") if h.strip()]
    for h in heads:
        if h not in ("linear", "mlp"):
            ap.error(f"unknown head {h!r} (choose from linear, mlp)")
    cfg = FitConfig(
        heads=heads, train_frac=args.train_frac, split_seed=args.split_seed,
        seed=args.seed, n_boot=args.bootstrap, mlp_hidden=args.mlp_hidden,
        mlp_epochs=args.mlp_epochs, mlp_lr=args.mlp_lr, mlp_batch=args.mlp_batch,
        device=args.device, min_samples=args.min_samples,
    )

    families = load_probes(args.probes)
    if args.probe:
        want = {p.strip() for p in args.probe.split(",")}
        unknown = want - set(families)
        if unknown:
            ap.error(f"--probe families not in {args.probes}: {sorted(unknown)}")
        families = {k: v for k, v in families.items() if k in want}
    encoders = [e.strip() for e in args.encoders.split(",") if e.strip()]

    args.out.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    errors: list[dict] = []
    for encoder in encoders:
        enc_dir = args.features / encoder
        if not enc_dir.is_dir():
            print(f"[probe_fit] SKIP encoder {encoder}: {enc_dir} not found", file=sys.stderr)
            continue
        for probe in sorted(families):
            out_path = args.out / f"{safe_image_id(probe)}__{encoder}.json"
            try:
                res = run_pair(probe, families[probe], enc_dir, cfg)
            except Exception as exc:  # noqa: BLE001 — per-(probe x encoder) isolation
                err = {
                    "probe": probe,
                    "encoder": encoder,
                    "error": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(),
                }
                errors.append(err)
                out_path.write_text(json.dumps(err, indent=2))
                print(
                    f"[probe_fit] ERROR {probe} x {encoder}: {err['error']} "
                    "(recorded; continuing)",
                    file=sys.stderr,
                )
                continue
            if res is None:
                continue
            out_path.write_text(json.dumps(res, indent=2))
            primary = res["primary_metric"]
            shown = " ".join(
                f"{h}={res['heads'][h]['real']['metrics'][primary]:.3f}"
                f"(shuf {res['heads'][h]['shuffled']['metrics'][primary]:.3f})"
                for h in heads
            )
            print(
                f"[probe_fit] {probe} x {encoder}: n={res['n_samples']} "
                f"(train {res['n_train']} / test {res['n_test']}, "
                f"{res['n_missing_features']} missing) {primary}: {shown}"
            )
            results.append(res)

    # summary.md is ALWAYS written: successful families + an errors section.
    summary = write_summary(results, args.out, cfg, errors=errors)
    print(
        f"[probe_fit] wrote {len(results)} result files "
        f"({len(errors)} errored pairs) + {summary}"
    )
    if not results:
        print("[probe_fit] no (probe x encoder) pair produced results", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
