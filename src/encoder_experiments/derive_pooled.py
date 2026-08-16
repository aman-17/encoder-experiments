"""Derive DOWN-BUDGET site features for fixed-resolution towers by pooling.

The knob towers (naflex / qwen / deepseek) realize a token budget in
preprocessing; the fixed-resolution towers (clip 24x24, siglip2 27x27,
sam 64x64) cannot. For those, this module reads the EXISTING full-grid
.safetensors caches (extract.py output), adaptive-average-pools each token
grid down to the rung's HxW, then does the bilinear site readout at the
probes' marked points — so the probe harness sees "what would this tower's
features look like at K tokens" without re-running the tower.

    uv run python -m encoder_experiments.derive_pooled \
        --features-in features/clip_vit_l_336 \
        --probes probes.jsonl \
        --rungs 64,100,144,196,256,400,576 \
        --out features_sweep/

Pooling is fp32 (same rule as extraction compute; the input is the fp16
grid a full-grid reader would load), storage fp16. A rung above the tower's
native grid is skipped (you cannot up-budget by pooling); a rung equal to
it is an identity pool — the native point on the curve.

Variable-grid caches (qwen35_vit natives) need no special casing: grid_hw is
read per image, so each image pools to its own aspect-preserving target and
over-budget rungs skip per image. --out-tower renames the output dirs (e.g.
qwen35_vit -> qwen35_vit_pooled, the B3 pixel-information control) so pooled-
native rungs never collide with the resolution-mechanism sweep's dirs.

Output files follow the site_store contract EXACTLY (this module reuses
site_store.build_site_manifest for point identity/ordering and
extract.save_sites for the writer — no forked layout):

    <out>/<tower>@<rung>/<safe_image_id>.sites.safetensors
        sites [K, D] fp16, points [K, 2] fp32, pooled [D] fp16
    sweep metadata: budget_tokens = ACTUAL pooled token count (th*tw),
    mechanism = "merge", knob = "adaptive_avg_pool:HxW-><th>x<tw>",
    plus budget_nominal (the rung label), the realized grid_h/grid_w, and
    source_grid_h/w + source_pooled_kind provenance. `pooled_kind` becomes
    "mean" — an attention/CLS pool cannot be re-derived at a reduced budget,
    so the merged-grid mean is the budgeted global summary.

Images with no probe rows at all are skipped (nothing to store — same rule
as extract --sites-from); pooled-only images (pl3 rows only) get a
zero-site file with just the pooled vector.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import traceback
from pathlib import Path

import torch
import torch.nn.functional as F

from .adapters.base import EncoderFeatures
from .budgets import LADDER
from .extract import safe_image_id, save_sites
from .site_store import SITES_SUFFIX, load_site_manifest


# --------------------------------------------------------------------------- #
# pooled-grid derivation
# --------------------------------------------------------------------------- #

def derive_target_grid(
    source_hw: tuple[int, int], budget: int
) -> tuple[int, int] | None:
    """Largest (th, tw) grid with th*tw <= budget, shaped like the source.

    Returns None when the rung exceeds the native token count (pooling can
    only go DOWN); budget == native returns the identity grid. Square
    sources with perfect-square budgets (the whole ladder) land exactly on
    sqrt(budget) x sqrt(budget).
    """
    h, w = source_hw
    if budget > h * w:
        return None
    if budget == h * w:
        return (h, w)
    side = math.isqrt(budget)
    if h == w and side * side == budget:
        return (side, side)
    # Non-square source or non-square budget: aspect-preserving floor + trim.
    scale = math.sqrt(budget / (h * w))
    th = max(1, int(h * scale + 1e-9))
    tw = max(1, int(w * scale + 1e-9))
    while th * tw > budget:  # floating-point safety net
        if th >= tw:
            th -= 1
        else:
            tw -= 1
    return (th, tw)


def pool_grid(
    tokens: torch.Tensor, source_hw: tuple[int, int], target_hw: tuple[int, int]
) -> torch.Tensor:
    """Adaptive-average-pool a row-major [N, D] token grid to target HxW.

    Returns [th*tw, D] fp32, row-major — each output token is the exact mean
    of its (contiguous) source-patch bin, matching what a merge/pixel-shuffle
    stage would feed a decoder at that budget.
    """
    h, w = source_hw
    th, tw = target_hw
    if tokens.shape[0] != h * w:
        raise ValueError(f"{tokens.shape[0]} tokens cannot fill a {h}x{w} grid")
    grid = tokens.view(h, w, -1).permute(2, 0, 1).unsqueeze(0).float()  # [1, D, H, W]
    merged = F.adaptive_avg_pool2d(grid, (th, tw))                      # [1, D, th, tw]
    return merged[0].permute(1, 2, 0).reshape(th * tw, -1)              # [th*tw, D]


# --------------------------------------------------------------------------- #
# batch derivation over a full-grid feature dir
# --------------------------------------------------------------------------- #

def derive_for_dir(
    features_in: Path,
    probes: Path,
    rungs: list[int],
    out: Path,
    overwrite: bool = False,
    limit: int | None = None,
    out_tower: str | None = None,
) -> dict:
    """Pool every full-grid file in `features_in` down each rung, write
    <out>/<tower>@<rung>/<id>.sites.safetensors. Resume-safe; per-image
    failures go to <out>/<tower>.derive_errors.jsonl and never kill the run.

    Grids are read per image (grid_hw metadata), so variable-grid caches
    (qwen35_vit natives) work the same as fixed-resolution ones — a rung an
    image cannot reach counts as over_budget for that image only. out_tower
    renames the output dirs (default: the source dir name); the pixel-
    information control needs it because qwen35_vit@<rung> is already taken
    by the resolution-mechanism sweep.
    """
    from safetensors import safe_open

    tower = out_tower or features_in.name  # e.g. clip_vit_l_336 or clip_vit_l_336__rand
    manifest = load_site_manifest(probes)["images"]
    # feature files are named by safe_image_id; key the manifest the same way
    by_sid = {safe_image_id(image_id): spec for image_id, spec in manifest.items()}
    files = sorted(
        p for p in features_in.glob("*.safetensors") if not p.name.endswith(SITES_SUFFIX)
    )
    if limit:
        files = files[:limit]
    if not files:
        raise FileNotFoundError(f"no full-grid .safetensors under {features_in}")

    errors_path = out / f"{tower}.derive_errors.jsonl"
    stats = {
        "tower": tower,
        "images": len(files),
        "rungs": {str(r): {"written": 0, "skipped_existing": 0, "over_budget": 0} for r in rungs},
        "failed": 0,
        "no_probe_rows": 0,
    }
    out_dirs = {}
    for rung in rungs:
        out_dirs[rung] = out / f"{tower}@{rung}"
        out_dirs[rung].mkdir(parents=True, exist_ok=True)

    for fpath in files:
        stem = fpath.name[: -len(".safetensors")]
        spec = by_sid.get(stem)
        if spec is None:  # image has no probe rows at all — nothing to store
            stats["no_probe_rows"] += 1
            continue
        try:
            with safe_open(fpath, framework="pt") as f:
                meta = f.metadata() or {}
                grid_h, grid_w = int(meta.get("grid_h", -1)), int(meta.get("grid_w", -1))
                if grid_h < 0 or grid_w < 0:
                    raise ValueError(f"{fpath.name}: no spatial grid (grid_h/w = -1)")
                # fp16 on disk -> fp32 for pooling: the same grid a full-grid
                # reader would load, pooled in full precision.
                tokens = f.get_tensor("tokens").float()
            for rung in rungs:
                out_path = out_dirs[rung] / f"{stem}{SITES_SUFFIX}"
                if out_path.exists() and not overwrite:
                    stats["rungs"][str(rung)]["skipped_existing"] += 1
                    continue
                target = derive_target_grid((grid_h, grid_w), rung)
                if target is None:
                    stats["rungs"][str(rung)]["over_budget"] += 1
                    continue
                merged = pool_grid(tokens, (grid_h, grid_w), target)
                feats = EncoderFeatures(
                    tokens=merged, grid_hw=target, pooled=merged.mean(dim=0)
                )
                save_sites(
                    out_path,
                    feats,
                    spec["points"],
                    {
                        "encoder": meta.get("encoder", tower),
                        "checkpoint": meta.get("checkpoint", ""),
                        "random_init": meta.get("random_init", ""),
                        "compute_dtype": meta.get("compute_dtype", ""),
                        # sweep contract (budget_tokens/grid_h/grid_w/num_tokens
                        # are written by save_sites from the ACTUAL merged grid)
                        "mechanism": "merge",
                        "knob": f"adaptive_avg_pool:{grid_h}x{grid_w}->{target[0]}x{target[1]}",
                        "budget_nominal": str(rung),
                        # the budgeted global summary is the merged-grid mean;
                        # the tower's own pool is not re-derivable down-budget
                        "pooled_kind": "mean",
                        "source_pooled_kind": meta.get("pooled_kind", ""),
                        "source_grid_h": str(grid_h),
                        "source_grid_w": str(grid_w),
                    },
                )
                stats["rungs"][str(rung)]["written"] += 1
        except Exception as exc:  # noqa: BLE001 — per-image isolation, as in extract.py
            stats["failed"] += 1
            with open(errors_path, "a") as ef:
                ef.write(json.dumps({
                    "image": fpath.name,
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                }) + "\n")
    return stats


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--features-in", type=Path, required=True,
                    help="ONE tower's full-grid feature dir, e.g. features/clip_vit_l_336")
    ap.add_argument("--probes", type=Path, required=True,
                    help="probes.jsonl or a precomputed sites manifest (site_store)")
    ap.add_argument("--rungs", default=",".join(str(r) for r in LADDER),
                    help="comma-separated target token budgets")
    ap.add_argument("--out", type=Path, required=True,
                    help="sweep root; writes <out>/<tower>@<rung>/")
    ap.add_argument("--out-tower", default=None,
                    help="output dir name override (default: the --features-in "
                         "dir name), e.g. qwen35_vit_pooled")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args(argv)

    rungs = [int(r) for r in args.rungs.split(",") if r.strip()]
    stats = derive_for_dir(
        args.features_in, args.probes, rungs, args.out,
        overwrite=args.overwrite, limit=args.limit, out_tower=args.out_tower,
    )
    print(f"[derive_pooled] {json.dumps(stats)}")
    if stats["failed"]:
        print(f"[derive_pooled] failures logged to {args.out}/{stats['tower']}.derive_errors.jsonl",
              file=sys.stderr)
    return 1 if stats["failed"] and not any(
        r["written"] for r in stats["rungs"].values()
    ) else 0


if __name__ == "__main__":
    raise SystemExit(main())
