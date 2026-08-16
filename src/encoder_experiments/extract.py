"""Feature-extraction CLI: manifest of images -> cached features per encoder.

    uv run python -m encoder_experiments.extract \
        --manifest data/probe_v1/manifest.jsonl \
        --encoder siglip2_naflex --adapter-arg max_num_patches=1024 \
        --out features/

Manifest contract (the only thing the data side owes us): JSONL, one image per
line, with at least {"image_id": str, "image_path": str}. Extra fields (labels,
difficulty bins, marked points) ride along untouched — probes join on image_id.

Output: features/<cache_tag>[__rand]/<image_id>.safetensors (cache_tag =
encoder name, extended by adapter args that change the feature space, e.g.
qwen35_vit__premerge) holding
    tokens [N, D] fp16, pooled [D] fp16
with metadata {grid_h, grid_w, num_tokens, checkpoint, pooled_kind, ...}.
Re-running skips existing files (resume-safe); per-image failures append to
errors.jsonl and never kill the run. A finiteness guard runs before the fp16
storage cast is written: NaN/Inf tokens or pooled vectors (including fp16
overflow) raise NonFiniteFeaturesError — the image lands in errors.jsonl with
per-tensor nan/inf/absmax counts and NO feature file is cached.

SITE MODE (--sites-from <probes.jsonl | sites manifest>): for the budget
sweep, where full grids cost ~1.5-2 MB/image. Since every probe row's read
location is known up front, extraction pre-samples exactly those sites: per
image it computes sites = sites.features_at over the image's manifest points
— on the fp16-roundtripped grid, so the vectors go through the SAME rounding
path a full-grid cache read would — and stores
<image_id>.sites.safetensors holding
    sites [K, D] fp16, points [K, 2] fp32, pooled [D] fp16
(~50 KB/image). probe_fit reads either layout transparently. Full-grid mode
is unchanged and remains the exploratory default.

SWEEP METADATA CONTRACT: every stored file (both layouts) carries
    budget_tokens  actual token count of THIS image's encode (never the
                   nominal knob setting — NaFlex et al. round)
    mechanism      how the budget was reached: resolution | res-mode |
                   merge | native   (--mechanism)
    knob           the knob setting that produced it, free string
                   (--knob, e.g. "max_num_patches=1024")
probe_fit copies these into its results JSONs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch
from PIL import Image
from safetensors.torch import save_file
from tqdm import tqdm

from .adapters.base import EncoderFeatures
from .registry import ADAPTERS, build, resolve_device, resolve_dtype
from .site_store import MECHANISMS, SITES_SUFFIX, load_site_manifest
from .sites import children_at, features_at


def safe_image_id(image_id: str) -> str:
    return image_id.replace("/", "__").replace("\\", "__")


class NonFiniteFeaturesError(RuntimeError):
    """Encoder produced NaN/Inf tokens or pooled vector (or values that
    overflow the fp16 storage cast). Raised BEFORE anything is written, so a
    corrupt feature file is never cached. `details` carries per-tensor
    {nan, inf, absmax} counts for errors.jsonl."""

    def __init__(self, message: str, details: dict):
        super().__init__(message)
        self.details = details


FP16_MAX = 65504.0


def _check_finite(tensors: dict[str, torch.Tensor], source: EncoderFeatures) -> None:
    """Guard the fp16 storage cast: NaN/Inf in the cast tensors, or source
    values past fp16's 65504 ceiling, fail the image loudly. The overflow
    check runs against the SOURCE because some backends (MPS) saturate the
    fp16 cast to +-65504 instead of producing Inf, which a cast-side check
    would miss."""
    details: dict[str, dict] = {}
    bad = False
    for name, t in tensors.items():
        src = getattr(source, name).detach().float()
        n_nan = int(torch.isnan(t).sum())
        n_inf = int(torch.isinf(t).sum())
        n_overflow = int((src.abs() > FP16_MAX).sum())
        absmax = float(src.abs().max()) if src.numel() else 0.0
        details[name] = {"nan": n_nan, "inf": n_inf, "overflow": n_overflow, "absmax": absmax}
        bad = bad or n_nan > 0 or n_inf > 0 or n_overflow > 0
    if bad:
        raise NonFiniteFeaturesError(
            "non-finite features at fp16 storage: "
            + ", ".join(
                f"{k}(nan={v['nan']}, inf={v['inf']}, overflow={v['overflow']}, "
                f"absmax={v['absmax']:.4g})"
                for k, v in details.items()
            ),
            details,
        )


def save_features(path: Path, feats: EncoderFeatures, meta: dict[str, str]) -> None:
    grid_h, grid_w = feats.grid_hw if feats.grid_hw is not None else (-1, -1)
    tensors = {
        "tokens": feats.tokens.detach().to("cpu", torch.float16).contiguous(),
        "pooled": feats.pooled.detach().to("cpu", torch.float16).contiguous(),
    }
    _check_finite(tensors, feats)  # never cache corrupt features
    metadata = {
        **meta,
        "grid_h": str(grid_h),
        "grid_w": str(grid_w),
        "num_tokens": str(feats.tokens.shape[0]),
        "feat_dim": str(feats.tokens.shape[1]),
        # sweep contract: budget is the ACTUAL token count, never the nominal knob
        "budget_tokens": str(feats.tokens.shape[0]),
    }
    tmp = path.with_suffix(".tmp")
    save_file(tensors, tmp, metadata=metadata)
    tmp.rename(path)  # atomic-ish: resume never sees a half-written file


def save_sites(
    path: Path,
    feats: EncoderFeatures,
    points: list[list[float]],
    meta: dict[str, str],
    child_merge: int | None = None,
) -> None:
    """Site-mode storage: pre-sampled site vectors instead of the full grid.

    The parity contract (pinned by tests/test_site_store.py): the stored
    `sites` must be BIT-IDENTICAL to what probe_fit would compute from a
    full-grid cache of the same encode — features_at on the fp16-stored-then-
    floated grid — followed by the same fp16 storage cast. So the grid is
    roundtripped through fp16 BEFORE sampling; sampling the raw fp32 grid
    would produce vectors that differ in the last bits from a full-grid read.

    child_merge (pre-merge captures, meta site=premerge): additionally store
    `children` [K, merge**2, D] fp16 — the raster-order children of each
    point's containing merged cell — so probe_fit can serve the concat4/mean4
    readouts from the sites layout. Children are exact fp16 token copies, so
    the same parity holds bit-for-bit.
    """
    grid_h, grid_w = feats.grid_hw if feats.grid_hw is not None else (-1, -1)
    tokens16 = feats.tokens.detach().to("cpu", torch.float16).contiguous()
    pooled16 = feats.pooled.detach().to("cpu", torch.float16).contiguous()
    # same guard as full-grid: never cache corrupt features (sites are convex
    # combinations of tokens, so finite tokens => finite sites)
    _check_finite({"tokens": tokens16, "pooled": pooled16}, feats)
    pts = torch.tensor(points, dtype=torch.float32).reshape(-1, 2).contiguous()
    children16: torch.Tensor | None = None
    if len(points) == 0:
        sites16 = torch.zeros((0, tokens16.shape[1]), dtype=torch.float16)
        if child_merge is not None:
            children16 = torch.zeros(
                (0, child_merge**2, tokens16.shape[1]), dtype=torch.float16
            )
    else:
        if feats.grid_hw is None:
            raise ValueError("encoder produced no spatial grid; site mode needs grid_hw")
        # fp16 roundtrip first = the exact tensor a full-grid reader would load
        sites16 = features_at(tokens16.float(), feats.grid_hw, pts).to(torch.float16)
        if child_merge is not None:
            children16 = children_at(
                tokens16.float(), feats.grid_hw, pts, merge=child_merge
            ).to(torch.float16)
    tensors = {
        "sites": sites16.contiguous(),
        "points": pts,
        "pooled": pooled16,
    }
    if children16 is not None:
        tensors["children"] = children16.contiguous()
    metadata = {
        **meta,
        "grid_h": str(grid_h),
        "grid_w": str(grid_w),
        "num_tokens": str(feats.tokens.shape[0]),
        "feat_dim": str(feats.tokens.shape[1]),
        "num_sites": str(pts.shape[0]),
        "budget_tokens": str(feats.tokens.shape[0]),
    }
    if child_merge is not None:
        metadata["child_merge"] = str(child_merge)
    tmp = path.with_suffix(".tmp")
    save_file(tensors, tmp, metadata=metadata)
    tmp.rename(path)


def read_manifest(path: Path, limit: int | None) -> list[dict]:
    rows = []
    with open(path) as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if "image_id" not in row or "image_path" not in row:
                raise ValueError(f"{path}:{line_no}: manifest row needs image_id + image_path")
            rows.append(row)
            if limit and len(rows) >= limit:
                break
    return rows


def parse_adapter_args(pairs: list[str]) -> dict:
    out = {}
    for pair in pairs:
        if "=" not in pair:
            raise ValueError(f"--adapter-arg expects key=value, got {pair!r}")
        key, val = pair.split("=", 1)
        out[key] = val
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--encoder", required=True, choices=sorted(ADAPTERS))
    ap.add_argument("--out", type=Path, default=Path("features"))
    ap.add_argument("--device", default="auto")
    ap.add_argument("--dtype", default="auto", choices=["auto", "fp32", "fp16", "bf16"])
    ap.add_argument("--random-init", action="store_true", help="architecture floor control")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--adapter-arg", action="append", default=[], metavar="KEY=VALUE")
    ap.add_argument(
        "--sites-from", type=Path, default=None, metavar="PROBES_OR_MANIFEST",
        help="site mode: probes.jsonl or a precomputed sites manifest; stores "
             "pre-sampled <image_id>.sites.safetensors instead of full grids",
    )
    ap.add_argument(
        "--mechanism", default="native", choices=list(MECHANISMS),
        help="sweep metadata: how the token budget was reached",
    )
    ap.add_argument(
        "--knob", default="native",
        help="sweep metadata: the knob setting that produced the budget "
             '(e.g. "max_num_patches=1024")',
    )
    args = ap.parse_args(argv)

    site_manifest: dict | None = None
    if args.sites_from is not None:
        site_manifest = load_site_manifest(args.sites_from)["images"]

    device = resolve_device(args.device)
    dtype = resolve_dtype(args.dtype, device)
    adapter = build(
        args.encoder, device, dtype,
        random_init=args.random_init,
        adapter_args=parse_adapter_args(args.adapter_arg),
    )

    tag = adapter.cache_tag + ("__rand" if args.random_init else "")
    out_dir = args.out / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    errors_path = out_dir / "errors.jsonl"

    rows = read_manifest(args.manifest, args.limit)
    mode = "sites" if site_manifest is not None else "full-grid"
    print(
        f"[extract] {tag}: {len(rows)} images -> {out_dir}  "
        f"(device={device}, dtype={dtype}, mode={mode})"
    )
    adapter.load()

    meta = {
        "encoder": adapter.name,
        "checkpoint": adapter.checkpoint,
        "pooled_kind": adapter.pooled_kind,
        "random_init": str(args.random_init),
        "compute_dtype": str(dtype),
        "mechanism": args.mechanism,
        "knob": args.knob,
        **adapter.extra_meta,
    }
    # pre-merge captures store per-point child vectors so the concat4/mean4
    # readouts are servable from the sites layout
    child_merge = (
        int(getattr(adapter, "merge", 2)) if meta.get("site") == "premerge" else None
    )

    done = skipped = failed = no_sites = 0
    with torch.inference_mode():
        for row in tqdm(rows, unit="img"):
            sid = safe_image_id(row["image_id"])
            if site_manifest is not None:
                spec = site_manifest.get(row["image_id"]) or site_manifest.get(sid)
                if spec is None:  # image has no probe rows at all — nothing to store
                    no_sites += 1
                    continue
                path = out_dir / f"{sid}{SITES_SUFFIX}"
            else:
                path = out_dir / f"{sid}.safetensors"
            if path.exists() and not args.overwrite:
                skipped += 1
                continue
            try:
                image = Image.open(row["image_path"]).convert("RGB")
                feats = adapter.encode(image)
                if site_manifest is not None:
                    save_sites(path, feats, spec["points"], meta, child_merge=child_merge)
                else:
                    save_features(path, feats, meta)
                done += 1
            except Exception as exc:  # noqa: BLE001 — per-image isolation is the point
                failed += 1
                record = {"image_id": row["image_id"], "error": repr(exc)}
                details = getattr(exc, "details", None)
                if details:  # NonFiniteFeaturesError: per-tensor nan/inf/absmax
                    record["counts"] = details
                with open(errors_path, "a") as ef:
                    ef.write(json.dumps(record) + "\n")

    tail = f" no_sites={no_sites}" if site_manifest is not None else ""
    print(f"[extract] {tag}: done={done} skipped={skipped} failed={failed}{tail}")
    if failed:
        print(f"[extract] failures logged to {errors_path}", file=sys.stderr)
    return 1 if failed and not done else 0


if __name__ == "__main__":
    raise SystemExit(main())
