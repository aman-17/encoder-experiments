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
  - point_xy is (x, y) normalized to [0, 1] over the image (sites.py
    convention); the site feature is sites.features_at(tokens, grid,
    point_xy). "pl3*" families (or site == "pooled") read the pooled vector
    instead and need no point.
  - task_type inference: "pl2*" -> bbox (label is [x, y, w, h], IoU-scored);
    float labels or float lists -> regression; int/str/bool labels ->
    classification. dict labels are rejected with a hard error: split
    multi-target probes into one sub-probe per target (cell_rc -> cell_row +
    cell_col) or flatten to a vector (pl3_summary) at the sampler level.
  - doc_id: the row's own doc_id wins. The derive fallback strips trailing
    __sev<key> (e.g. __sev2b), __p<N> and _s<NNN> suffixes from image_id, so
    severity/page variants of one document never straddle the train/test
    split; a hard assert after splitting certifies no doc_id appears on both
    sides. Emit doc_id explicitly when ids don't follow that shape.
  - error isolation: a (probe family x encoder) pair that raises records the
    error in its results JSON and the run continues; summary.md is always
    written with the successful families plus an errors section.

Feature layouts, read transparently per image: full-grid <id>.safetensors
(tokens + pooled; sites sampled here via sites.features_at) OR site-mode
<id>.sites.safetensors from extract.py --sites-from (pre-sampled sites +
points + pooled; a row's point_xy must match a stored point EXACTLY at 6dp —
a miss is a hard error naming the nearest stored point, because it means the
sites cache was built from a different probes.jsonl). The budget-sweep
metadata fields {budget_tokens, mechanism, knob} are copied from the feature
files into every results JSON.

Per (probe family x encoder): linear + 2-layer-MLP heads on a fixed
document-level train/test split, a shuffled-train-label control per head,
bootstrap CIs over test documents, and test metrics sliced by
meta.scan_severity, meta.difficulty, and per-class for pl1. Feature files
are opened lazily one image at a time — never all grids at once.

--capacity-match D: every X (train+test, every arm) passes through a seeded
Gaussian random projection to common dim D (orthonormalized, norm-preserving;
one matrix per (seed, raw_dim)) BEFORE standardize+heads — with MLP hidden
fixed, total head params are equal across arms by construction. Results
record {capacity_match: D, raw_dim}. Default off; cross-dim arm comparisons
(e.g. concat4 vs mean4) are confounded without it.

--readout {point,concat4,mean4}: site readout, part of the arm identity
(encoder@budget#site/readout, the `arm` field). point = bilinear features_at;
concat4/mean4 read the 4 children (raster order) of the merged cell containing
the probe point — site=premerge features only.

--append-coords / --coords-only (mutually exclusive; point probes only —
pooled rows hard-error): append raw (x, y) to every assembled X, or replace X
with (x, y) alone — the coordinate-shortcut baseline arm, on the same
split/CI machinery as the feature arms. Under --capacity-match the projection
applies to the FEATURE block only; the 2 raw coord dims are appended after it
(results record coords_appended_after_projection: true); --coords-only skips
the projection. The arm gains suffix +coords / coordsonly and result files
gain __coords / __coordsonly.

--meta-filter 'KEY OP VALUE' (repeatable, ANDed; OP in ==,!=,>,<,>=,<=;
optional meta. prefix on KEY): rows whose meta fails the comparison are
dropped before splitting; both sides compare as floats when both parse as
float, else as strings; a missing key fails. Results record meta_filter +
n_filter_dropped.

--split-by META_KEY (optional meta. prefix): replaces the doc-hash split with
a group split on that key — groups hash to sides exactly like documents, a
doc whose rows straddle groups goes wholly to its majority group's side, and
rows whose own group hashed to the other side are dropped, so group- AND
doc-disjointness both hold and are both hard-asserted. Results record
n_groups_train / n_groups_test / n_split_dropped.

Outputs: results/<probe>__<encoder>[__<readout>][__coords|__coordsonly].json
+ consolidated results/summary.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import operator
import re
import sys
import traceback
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from safetensors import safe_open

from .extract import safe_image_id
from .heads import fit_predict_linear, fit_predict_mlp, project_features
from .probe_metrics import PRIMARY_METRIC, bootstrap_ci, compute_metrics
from .site_store import SITES_SUFFIX, SWEEP_META_FIELDS, round6
from .sites import READOUTS, children_at, combine_children, features_at

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

    Strips, in order: a degrade suffix (__sev<key>, e.g. __sev2b), a page
    suffix (__p<N>), and a generator seed suffix (_s<NNN>) — without the
    __sev strip, clean and degraded variants of one document would get
    different doc_ids and could straddle the train/test split.
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

def _lookup_site_vectors(
    f, path: Path, rows: list[ProbeRow], site_idxs: list[int], readout: str = "point"
) -> dict[int, np.ndarray]:
    """Read pre-sampled site vectors from a .sites.safetensors file.

    Each probe row's point_xy must match a stored point EXACTLY at 6dp (the
    site_store identity contract — fp32 storage round-trips 6dp decimals in
    [0, 1] exactly). A miss means the sites cache was built from a different
    probes.jsonl: hard error listing the nearest stored point, never a silent
    nearest-neighbor substitution.

    readout "point" serves the `sites` tensor; "concat4"/"mean4" combine the
    stored `children` tensor (pre-merge caches only — absent children is a
    hard error, never a silent fallback to the bilinear vector).
    """
    points = f.get_tensor("points")  # [K, 2] fp32, manifest order
    key_to_idx = {
        (round6(x), round6(y)): k for k, (x, y) in enumerate(points.tolist())
    }
    if readout == "point":
        sites = f.get_tensor("sites").float().numpy()  # [K, D]
    else:
        if "children" not in f.keys():
            raise ValueError(
                f"{path}: readout {readout!r} needs stored child vectors but the "
                "file has none — re-extract this cache from a site=premerge tower"
            )
        children = f.get_tensor("children").float()  # [K, 4, D]
        sites = combine_children(children, readout).numpy()
    out: dict[int, np.ndarray] = {}
    for i in site_idxs:
        x, y = rows[i].point_xy
        k = key_to_idx.get((round6(x), round6(y)))
        if k is None:
            if points.shape[0] == 0:
                raise ValueError(
                    f"{path}: probe {rows[i].probe!r} needs a site at "
                    f"({x:.6f}, {y:.6f}) but the file stores 0 site points "
                    "(pooled-only) — re-extract with --sites-from the probes "
                    "file that contains this row"
                )
            d = ((points - torch.tensor([x, y], dtype=points.dtype)) ** 2).sum(1)
            k_near = int(d.argmin())
            nx, ny = (float(v) for v in points[k_near])
            raise ValueError(
                f"{path}: probe {rows[i].probe!r} point ({x:.6f}, {y:.6f}) has "
                f"no exact 6dp match among the {points.shape[0]} stored sites; "
                f"nearest stored point is ({nx:.6f}, {ny:.6f}) at distance "
                f"{float(d[k_near]) ** 0.5:.3g} — the sites cache was built "
                "from a different probes.jsonl; re-extract with --sites-from "
                "this probes file"
            )
        out[i] = sites[k]
    return out


def assemble_features(
    rows: list[ProbeRow], enc_dir: Path, readout: str = "point"
) -> tuple[np.ndarray, list[ProbeRow], int, dict]:
    """-> (X [n_kept, D] float32, kept rows in original order, n_missing,
    sweep_meta).

    Opens each image's safetensors lazily, reads only the tensors it needs,
    samples every site of that image in one features_at call, and drops the
    grid before moving on — full grids are never held for more than one image.
    Reads full-grid <id>.safetensors and site-mode <id>.sites.safetensors
    transparently (per image; full grid wins when both exist): sites files
    were pre-sampled through the identical fp16 rounding path (extract.
    save_sites), so downstream code cannot tell the layouts apart.

    readout: "point" (bilinear features_at / stored sites) or, on features
    tagged site=premerge, "concat4"/"mean4" over the children of the merged
    cell containing each point (sites.children_at; stored `children` in the
    sites layout). A non-point readout against a file not tagged
    site=premerge is a hard error. Pooled rows are readout-independent.

    sweep_meta collects {budget_tokens, mechanism, knob, site} from the
    opened files' metadata: the unique value per field, a sorted list when
    files disagree, None when absent (pre-contract caches / default site).
    """
    if readout not in READOUTS:
        raise ValueError(f"unknown readout {readout!r}; expected one of {READOUTS}")
    by_image: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        by_image[r.image_id].append(i)

    feats: dict[int, np.ndarray] = {}
    n_missing = 0
    sweep_vals: dict[str, set] = {k: set() for k in (*SWEEP_META_FIELDS, "site")}
    for image_id, idxs in by_image.items():
        stem = safe_image_id(image_id)
        path = enc_dir / f"{stem}.safetensors"
        is_sites = False
        if not path.exists():
            path = enc_dir / f"{stem}{SITES_SUFFIX}"
            is_sites = True
            if not path.exists():
                n_missing += len(idxs)
                continue
        with safe_open(path, framework="pt", device="cpu") as f:
            meta = f.metadata() or {}
            for key in (*SWEEP_META_FIELDS, "site"):
                if key in meta:
                    val = int(meta[key]) if key == "budget_tokens" else meta[key]
                    sweep_vals[key].add(val)
            pooled_idxs = [i for i in idxs if rows[i].pooled]
            site_idxs = [i for i in idxs if not rows[i].pooled]
            if site_idxs and readout != "point" and meta.get("site") != "premerge":
                raise ValueError(
                    f"{path}: readout {readout!r} needs features tagged "
                    f"site=premerge (file has site={meta.get('site')!r})"
                )
            if pooled_idxs:
                vec = f.get_tensor("pooled").float().numpy()
                for i in pooled_idxs:
                    feats[i] = vec
            if site_idxs:
                if is_sites:
                    feats.update(
                        _lookup_site_vectors(f, path, rows, site_idxs, readout)
                    )
                else:
                    grid_hw = (int(meta["grid_h"]), int(meta["grid_w"]))
                    if grid_hw[0] <= 0:
                        raise ValueError(
                            f"{path}: encoder cached no spatial grid; site probes need one"
                        )
                    tokens = f.get_tensor("tokens")
                    pts = torch.tensor(
                        [rows[i].point_xy for i in site_idxs], dtype=torch.float32
                    )
                    if readout == "point":
                        sampled = features_at(tokens, grid_hw, pts).numpy()
                    else:
                        merge = int(meta.get("child_merge", 2))
                        sampled = combine_children(
                            children_at(tokens, grid_hw, pts, merge=merge), readout
                        ).numpy()
                    for k, i in enumerate(site_idxs):
                        feats[i] = sampled[k]

    sweep_meta = {
        k: (next(iter(v)) if len(v) == 1 else sorted(v) if v else None)
        for k, v in sweep_vals.items()
    }
    kept = [i for i in range(len(rows)) if i in feats]
    if not kept:
        return np.zeros((0, 0), dtype=np.float32), [], n_missing, sweep_meta
    X = np.stack([feats[i] for i in kept]).astype(np.float32)
    return X, [rows[i] for i in kept], n_missing, sweep_meta


# --------------------------------------------------------------------------- #
# meta filters
# --------------------------------------------------------------------------- #

_FILTER_OPS = {
    "==": operator.eq, "!=": operator.ne,
    ">=": operator.ge, "<=": operator.le,
    ">": operator.gt, "<": operator.lt,
}
_FILTER_RE = re.compile(r"^\s*(\S+?)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$")


def parse_meta_filter(expr: str) -> tuple[str, str, str]:
    """'KEY OP VALUE' -> (meta key sans optional 'meta.' prefix, op, value)."""
    m = _FILTER_RE.match(expr)
    if not m:
        raise ValueError(
            f"--meta-filter {expr!r}: expected 'KEY OP VALUE' with OP in "
            f"{sorted(_FILTER_OPS)}"
        )
    key, op, value = m.groups()
    return key.removeprefix("meta."), op, value


def meta_passes(meta: dict, key: str, op: str, value: str) -> bool:
    """Float comparison when BOTH sides parse as float, else string; a row
    missing the key fails the filter (no op, != included, can pass on absence)."""
    if key not in meta:
        return False
    left = meta[key]
    try:
        return _FILTER_OPS[op](float(left), float(value))
    except (TypeError, ValueError):
        return _FILTER_OPS[op](str(left), value)


# --------------------------------------------------------------------------- #
# document-level split
# --------------------------------------------------------------------------- #

def doc_is_train(doc_id: str, train_frac: float, split_seed: int) -> bool:
    """Deterministic hash split: a document lands on exactly one side, always."""
    h = hashlib.sha1(f"{split_seed}:{doc_id}".encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64 < train_frac


def group_split(
    docs: np.ndarray, groups: np.ndarray, train_frac: float, split_seed: int
) -> tuple[np.ndarray, np.ndarray]:
    """--split-by assignment -> (train mask, keep mask) over the input rows.

    Groups hash to sides exactly like documents; every doc goes WHOLLY to the
    side of its majority group (ties -> lexicographically first), and rows
    whose own group hashed to the other side are dropped — the only assignment
    under which group-disjointness and doc-disjointness can both hold exactly.
    """
    group_side = {g: doc_is_train(g, train_frac, split_seed) for g in set(groups)}
    per_doc: dict[str, Counter] = defaultdict(Counter)
    for d, g in zip(docs, groups):
        per_doc[d][g] += 1
    doc_side = {
        d: group_side[min(cnt, key=lambda g: (-cnt[g], g))]
        for d, cnt in per_doc.items()
    }
    train = np.array([doc_side[d] for d in docs], dtype=bool)
    keep = np.array(
        [group_side[g] == doc_side[d] for d, g in zip(docs, groups)], dtype=bool
    )
    return train, keep


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
    capacity_match: int | None = None  # project every X to this dim before heads
    readout: str = "point"  # site readout: point | concat4 | mean4
    append_coords: bool = False  # X -> [X ⊕ point_xy]
    coords_only: bool = False  # X -> point_xy alone (shortcut baseline arm)
    meta_filters: tuple[str, ...] = ()  # 'KEY OP VALUE' exprs, ANDed
    split_by: str | None = None  # meta key replacing the doc-hash split
    mlp_early_stop: bool = False


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
        # early_stop is omitted entirely when off, so the call stays valid
        # against heads builds that predate the kwarg
        extra = {"early_stop": True} if cfg.mlp_early_stop else {}
        return fit_predict_mlp(
            task_type, X_train, y_train, X_test,
            n_classes=n_classes, hidden=cfg.mlp_hidden, epochs=cfg.mlp_epochs,
            lr=cfg.mlp_lr, batch_size=cfg.mlp_batch, seed=cfg.seed, device=cfg.device,
            **extra,
        )
    raise ValueError(f"unknown head {head!r}")


def run_pair(probe: str, rows: list[ProbeRow], enc_dir: Path, cfg: FitConfig) -> dict | None:
    filters = [parse_meta_filter(f) for f in cfg.meta_filters]
    if filters:
        n_before = len(rows)
        rows = [r for r in rows if all(meta_passes(r.meta, *f) for f in filters)]
        n_filter_dropped = n_before - len(rows)
    else:
        n_filter_dropped = 0

    X, kept, n_missing, sweep_meta = assemble_features(rows, enc_dir, readout=cfg.readout)
    if len(kept) < cfg.min_samples:
        print(
            f"[probe_fit] SKIP {probe} x {enc_dir.name}: only {len(kept)} samples "
            f"with features ({n_missing} missing, {n_filter_dropped} filtered)",
            file=sys.stderr,
        )
        return None

    coords = None
    if cfg.append_coords or cfg.coords_only:
        n_pooled = sum(r.pooled for r in kept)
        if n_pooled:
            flag = "--coords-only" if cfg.coords_only else "--append-coords"
            raise ValueError(
                f"{probe} x {enc_dir.name}: {flag} needs point_xy on every row "
                f"but {n_pooled}/{len(kept)} rows are pooled"
            )
        coords = np.asarray([r.point_xy for r in kept], dtype=np.float32)

    if cfg.coords_only:
        X = coords  # the shortcut arm: capacity-match projection does not apply
        raw_dim = 2
    else:
        raw_dim = int(X.shape[1])
        if cfg.capacity_match is not None:
            # one seeded matrix per (seed, raw_dim, D): every arm reaches the heads
            # at the same dim, so head capacity is equal across arms by construction
            X = project_features(X, cfg.capacity_match, cfg.seed)
        if coords is not None:
            # capacity-match projects the FEATURE block only; the 2 raw coord
            # dims ride outside the projection
            X = np.concatenate([X, coords], axis=1)

    task_type = infer_task_type(probe, kept)
    docs = np.array([r.doc_id for r in kept])
    groups = None
    n_split_dropped = 0
    if cfg.split_by is not None:
        n_no_key = sum(cfg.split_by not in r.meta for r in kept)
        if n_no_key:
            raise ValueError(
                f"{probe} x {enc_dir.name}: --split-by needs meta[{cfg.split_by!r}] "
                f"on every row but {n_no_key}/{len(kept)} rows lack it"
            )
        groups = np.array([str(r.meta[cfg.split_by]) for r in kept])
        train_mask, keep_mask = group_split(docs, groups, cfg.train_frac, cfg.split_seed)
        n_split_dropped = int((~keep_mask).sum())
        kept = [r for r, k in zip(kept, keep_mask) if k]
        X, docs = X[keep_mask], docs[keep_mask]
        groups, train_mask = groups[keep_mask], train_mask[keep_mask]
    else:
        train_mask = np.array(
            [doc_is_train(d, cfg.train_frac, cfg.split_seed) for d in docs], dtype=bool
        )
    y, class_names = encode_labels(task_type, kept)
    if train_mask.all() or not train_mask.any():
        raise RuntimeError(
            f"{probe} x {enc_dir.name}: {cfg.split_by or 'document'} split left "
            f"one side empty ({len(set(docs))} docs, train_frac={cfg.train_frac}); "
            "adjust --train-frac / --split-seed or add documents"
        )
    test_mask = ~train_mask
    # doc lists come from the per-sample assignment, so the output itself
    # certifies no document straddles the split
    train_docs = sorted(set(docs[train_mask]))
    test_docs = sorted(set(docs[test_mask]))
    straddlers = set(train_docs) & set(test_docs)
    if straddlers:  # hard invariant — leakage would silently inflate metrics
        raise AssertionError(
            f"{probe} x {enc_dir.name}: doc_id(s) on BOTH split sides: "
            f"{sorted(straddlers)[:10]}"
        )
    n_groups_train = n_groups_test = None
    if groups is not None:
        groups_train = set(groups[train_mask])
        groups_test = set(groups[test_mask])
        overlap = groups_train & groups_test
        if overlap:  # second hard invariant under --split-by
            raise AssertionError(
                f"{probe} x {enc_dir.name}: --split-by group(s) on BOTH split "
                f"sides: {sorted(overlap)[:10]}"
            )
        n_groups_train, n_groups_test = len(groups_train), len(groups_test)

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

    site = sweep_meta.get("site") or "default"
    budget = sweep_meta["budget_tokens"]
    coords_suffix = "+coords" if cfg.append_coords else "coordsonly" if cfg.coords_only else ""
    result = {
        "probe": probe,
        "encoder": enc_dir.name,
        # sweep contract, copied verbatim from the feature files' metadata
        # (None on pre-contract caches; a sorted list if files disagree)
        "budget_tokens": budget,
        "mechanism": sweep_meta["mechanism"],
        "knob": sweep_meta["knob"],
        "site": sweep_meta.get("site"),
        "readout": cfg.readout,
        "arm": f"{enc_dir.name}@{budget if budget is not None else 'na'}"
               f"#{site}/{cfg.readout}{coords_suffix}",
        "capacity_match": cfg.capacity_match,
        "raw_dim": raw_dim,
        "append_coords": cfg.append_coords,
        "coords_only": cfg.coords_only,
        "meta_filter": list(cfg.meta_filters),
        "n_filter_dropped": n_filter_dropped,
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
        "split": {
            "by": cfg.split_by or "document",
            "train_frac": cfg.train_frac,
            "seed": cfg.split_seed,
        },
        "mlp": {"epochs": cfg.mlp_epochs, "lr": cfg.mlp_lr, "early_stop": cfg.mlp_early_stop},
        "bootstrap": {"n_resamples": cfg.n_boot, "unit": "document"},
        "heads": heads_out,
    }
    if cfg.append_coords and cfg.capacity_match is not None:
        result["coords_appended_after_projection"] = True
    if cfg.split_by is not None:
        result["n_groups_train"] = n_groups_train
        result["n_groups_test"] = n_groups_test
        result["n_split_dropped"] = n_split_dropped
    return result


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
    ap.add_argument(
        "--capacity-match", type=int, default=None, metavar="D",
        help="project every X (train+test, every arm) through a seeded Gaussian "
             "random projection to dim D before standardize+heads, so head "
             "capacity is equal across arms; results record {capacity_match, raw_dim}",
    )
    ap.add_argument(
        "--readout", default="point", choices=list(READOUTS),
        help="site readout: point (bilinear) | concat4 | mean4 (children of the "
             "containing merged cell; site=premerge features only)",
    )
    coords_group = ap.add_mutually_exclusive_group()
    coords_group.add_argument(
        "--append-coords", action="store_true",
        help="append raw (x, y) to every assembled X; under --capacity-match "
             "only the feature block is projected, coords are appended after it",
    )
    coords_group.add_argument(
        "--coords-only", action="store_true",
        help="fit on (x, y) alone — the coordinate-shortcut baseline arm on "
             "the same split/CI machinery as the feature arms",
    )
    ap.add_argument(
        "--meta-filter", action="append", default=[], metavar="'KEY OP VALUE'",
        help="drop rows whose meta fails the comparison, before splitting "
             "(repeatable, ANDed; OP in ==,!=,>,<,>=,<=; float compare when "
             "both sides parse as float; a missing key fails)",
    )
    ap.add_argument(
        "--split-by", default=None, metavar="META_KEY",
        help="replace the doc-hash split with a group split on this meta key "
             "(a doc straddling groups goes wholly to its majority group's "
             "side; minority-group rows are dropped; group- and doc-"
             "disjointness both hard-asserted)",
    )
    ap.add_argument(
        "--mlp-early-stop", action="store_true",
        help="forward early_stop=True to the MLP head (validation-split early "
             "stopping; off = the fixed-epoch budget, bit-for-bit unchanged)",
    )
    args = ap.parse_args(argv)

    heads = [h.strip() for h in args.heads.split(",") if h.strip()]
    for h in heads:
        if h not in ("linear", "mlp"):
            ap.error(f"unknown head {h!r} (choose from linear, mlp)")
    for expr in args.meta_filter:
        try:
            parse_meta_filter(expr)
        except ValueError as exc:
            ap.error(str(exc))
    cfg = FitConfig(
        heads=heads, train_frac=args.train_frac, split_seed=args.split_seed,
        seed=args.seed, n_boot=args.bootstrap, mlp_hidden=args.mlp_hidden,
        mlp_epochs=args.mlp_epochs, mlp_lr=args.mlp_lr, mlp_batch=args.mlp_batch,
        device=args.device, min_samples=args.min_samples,
        capacity_match=args.capacity_match, readout=args.readout,
        append_coords=args.append_coords, coords_only=args.coords_only,
        meta_filters=tuple(args.meta_filter),
        split_by=args.split_by.removeprefix("meta.") if args.split_by else None,
        mlp_early_stop=args.mlp_early_stop,
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
        # readout and the coords flags are part of the arm identity, so those
        # arms get their own result files instead of clobbering the plain arm's
        readout_tag = "" if cfg.readout == "point" else f"__{cfg.readout}"
        coords_tag = (
            "__coords" if cfg.append_coords
            else "__coordsonly" if cfg.coords_only else ""
        )
        for probe in sorted(families):
            out_path = args.out / (
                f"{safe_image_id(probe)}__{encoder}{readout_tag}{coords_tag}.json"
            )
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
