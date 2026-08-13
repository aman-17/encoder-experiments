"""Feature-extraction CLI: manifest of images -> cached features per encoder.

    uv run python -m encoder_experiments.extract \
        --manifest data/probe_v1/manifest.jsonl \
        --encoder siglip2_naflex --adapter-arg max_num_patches=1024 \
        --out features/

Manifest contract (the only thing the data side owes us): JSONL, one image per
line, with at least {"image_id": str, "image_path": str}. Extra fields (labels,
difficulty bins, marked points) ride along untouched — probes join on image_id.

Output: features/<encoder>[__rand]/<image_id>.safetensors holding
    tokens [N, D] fp16, pooled [D] fp16
with metadata {grid_h, grid_w, num_tokens, checkpoint, pooled_kind, ...}.
Re-running skips existing files (resume-safe); per-image failures append to
errors.jsonl and never kill the run. A finiteness guard runs before the fp16
storage cast is written: NaN/Inf tokens or pooled vectors (including fp16
overflow) raise NonFiniteFeaturesError — the image lands in errors.jsonl with
per-tensor nan/inf/absmax counts and NO feature file is cached (MPS has
produced NaN CLIP grids while reporting success; this makes that loud).
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
    check is explicit against the SOURCE because some backends (MPS) saturate
    the fp16 cast to +-65504 instead of producing Inf — the absmax-pinned-at-
    the-fp16-ceiling signature. MPS has produced NaN/1e9-magnitude CLIP grids
    while reporting success; this makes that loud instead of silently caching
    corrupt features."""
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
    }
    tmp = path.with_suffix(".tmp")
    save_file(tensors, tmp, metadata=metadata)
    tmp.rename(path)  # atomic-ish: resume never sees a half-written file


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
    args = ap.parse_args(argv)

    device = resolve_device(args.device)
    dtype = resolve_dtype(args.dtype, device)
    adapter = build(
        args.encoder, device, dtype,
        random_init=args.random_init,
        adapter_args=parse_adapter_args(args.adapter_arg),
    )

    tag = adapter.name + ("__rand" if args.random_init else "")
    out_dir = args.out / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    errors_path = out_dir / "errors.jsonl"

    rows = read_manifest(args.manifest, args.limit)
    print(f"[extract] {tag}: {len(rows)} images -> {out_dir}  (device={device}, dtype={dtype})")
    adapter.load()

    meta = {
        "encoder": adapter.name,
        "checkpoint": adapter.checkpoint,
        "pooled_kind": adapter.pooled_kind,
        "random_init": str(args.random_init),
        "compute_dtype": str(dtype),
    }

    done = skipped = failed = 0
    with torch.inference_mode():
        for row in tqdm(rows, unit="img"):
            path = out_dir / f"{safe_image_id(row['image_id'])}.safetensors"
            if path.exists() and not args.overwrite:
                skipped += 1
                continue
            try:
                image = Image.open(row["image_path"]).convert("RGB")
                feats = adapter.encode(image)
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

    print(f"[extract] {tag}: done={done} skipped={skipped} failed={failed}")
    if failed:
        print(f"[extract] failures logged to {errors_path}", file=sys.stderr)
    return 1 if failed and not done else 0


if __name__ == "__main__":
    raise SystemExit(main())
