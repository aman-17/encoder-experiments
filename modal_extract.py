"""Modal GPU extraction app for the encoder-anatomy pilot (Exp 1).

Runs the exact per-image loop from encoder_experiments/extract.py on an L40S,
against a corpus stored on the "encoder-anatomy-pilot" Modal volume.

Upload a corpus (images + images.jsonl manifest) before running:

    modal volume put encoder-anatomy-pilot <local corpus dir> /corpus

The manifest (default /vol/corpus/images.jsonl) is JSONL with rows
{"image_id": str, "image_path": str} where image_path is RELATIVE to
/vol/corpus. Features land in /vol/features/<encoder>[__rand]/<image_id>.safetensors
(existing files are skipped — resume-safe), results/errors under /vol/features/.

Fan out over (encoder x shard):

    uv run modal run modal_extract.py --encoders clip_vit_l_336,sam_vit_b --shards 4

Encoder spec grammar (comma-separated in --encoders):
    name                      e.g. sam_vit_b
    name__rand                random-init floor control, e.g. clip_vit_l_336__rand
    name@key=val;key=val      adapter args, e.g. siglip2_naflex@max_num_patches=1024
(siglip2_naflex defaults to max_num_patches=1024 unless overridden.)

Probe fitting on the same app (does NOT touch extraction outputs):

    uv run modal run modal_extract.py --fit \
        --encoders clip_vit_l_336,siglip2_so400m_384 \
        --probes-subpath probes.jsonl \
        --fit-kwargs '{"train_frac": 0.5, "split_seed": 1}'

reads /vol/corpus/<probes_subpath> + /vol/features, imports the probe_fit
pipeline (no fork), writes /vol/results/<run>/ (per-pair JSONs + summary.md)
and prints the summary text.
"""

from __future__ import annotations

import modal

APP_NAME = "encoder-anatomy-pilot"
VOL_PATH = "/vol"
HF_CACHE_PATH = "/hf_cache"  # same mount path as ocr_postraining trainers -> cache hits

app = modal.App(APP_NAME)

data_volume = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=True)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "torch",  # CUDA wheels by default on linux
        "torchvision",
        "transformers>=5.14,<5.15",  # pinned to local venv's major.minor (5.14.1)
        "safetensors",
        "pymupdf",
        "pillow",
        "numpy",
        "scikit-learn",  # probe_fit linear heads (fit_probes)
        "tqdm",
        "accelerate",
        "einops",  # deepseek_ocr deepencoder.py
        "easydict",  # deepseek_ocr deepencoder.py
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)

# Per-encoder default adapter args (overridable via the @k=v spec suffix).
DEFAULT_ADAPTER_ARGS: dict[str, dict] = {
    "siglip2_naflex": {"max_num_patches": "1024"},
}


@app.function(
    image=image,
    gpu="L40S",
    timeout=3600 * 4,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def extract_encoder(
    encoder: str,
    random_init: bool = False,
    images_subpath: str = "images.jsonl",
    shard: int = 0,
    nshards: int = 1,
    adapter_args: dict | None = None,
    overwrite: bool = False,
    dtype: str = "fp32",
) -> dict:
    """Extract features for one (encoder, shard). Same loop as extract.py, reused."""
    import json
    import time
    import traceback
    from pathlib import Path

    import torch
    from PIL import Image

    from encoder_experiments.extract import read_manifest, safe_image_id, save_features
    from encoder_experiments.registry import build, resolve_device, resolve_dtype

    data_volume.reload()  # see corpus uploads / other shards' commits

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / images_subpath
    if not manifest.exists():
        raise FileNotFoundError(
            f"{manifest} not found — upload with: "
            f"modal volume put {APP_NAME} <local corpus dir> /corpus"
        )

    device = resolve_device("auto")
    # Parity finding (verified): "auto" -> bf16 on CUDA, and these ViTs amplify
    # bf16 compute noise over layers (per-token min cosine ~0.25 vs fp32 on
    # low-norm patches). Features must be box-independent, so the pilot computes
    # in fp32 (storage stays fp16 in save_features). Pass dtype="auto" to opt
    # back into bf16 speed for throwaway runs.
    dtype = resolve_dtype(dtype, device)
    merged_args = {**DEFAULT_ADAPTER_ARGS.get(encoder, {}), **(adapter_args or {})}
    adapter = build(encoder, device, dtype, random_init=random_init, adapter_args=merged_args)

    tag = adapter.name + ("__rand" if random_init else "")
    out_dir = Path(VOL_PATH) / "features" / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    errors_path = out_dir / f"errors.shard{shard}.jsonl"

    rows = read_manifest(manifest, limit=None)
    rows = rows[shard::nshards]
    print(f"[extract] {tag} shard {shard}/{nshards}: {len(rows)} images -> {out_dir} "
          f"(device={device}, dtype={dtype}, adapter_args={merged_args})")

    t_load = time.monotonic()
    adapter.load()
    load_s = time.monotonic() - t_load
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats()

    meta = {
        "encoder": adapter.name,
        "checkpoint": adapter.checkpoint,
        "pooled_kind": adapter.pooled_kind,
        "random_init": str(random_init),
        "compute_dtype": str(dtype),
    }

    done = skipped = failed = 0
    per_image_s: list[float] = []
    first_shape: dict | None = None
    since_commit = 0
    with torch.inference_mode():
        for row in rows:
            out_path = out_dir / f"{safe_image_id(row['image_id'])}.safetensors"
            if out_path.exists() and not overwrite:
                skipped += 1
                continue
            try:
                t0 = time.monotonic()
                image_pil = Image.open(corpus / row["image_path"]).convert("RGB")
                feats = adapter.encode(image_pil)
                save_features(out_path, feats, meta)
                per_image_s.append(time.monotonic() - t0)
                if first_shape is None:
                    first_shape = {
                        "image_id": row["image_id"],
                        "num_tokens": int(feats.tokens.shape[0]),
                        "feat_dim": int(feats.tokens.shape[1]),
                        "grid_hw": list(feats.grid_hw) if feats.grid_hw else None,
                    }
                done += 1
            except Exception as exc:  # noqa: BLE001 — per-image isolation, as in extract.py
                failed += 1
                record = {
                    "image_id": row["image_id"],
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                }
                details = getattr(exc, "details", None)
                if details:  # NonFiniteFeaturesError: per-tensor nan/inf/absmax
                    record["counts"] = details
                with open(errors_path, "a") as ef:
                    ef.write(json.dumps(record) + "\n")
            since_commit += 1
            if since_commit >= 25:
                data_volume.commit()
                since_commit = 0

    data_volume.commit()
    stats = {
        "encoder": tag,
        "shard": shard,
        "nshards": nshards,
        "done": done,
        "skipped": skipped,
        "failed": failed,
        "load_s": round(load_s, 2),
        "mean_image_s": round(sum(per_image_s) / len(per_image_s), 3) if per_image_s else None,
        "first_image": first_shape,
        "peak_gpu_mem_gib": (
            round(torch.cuda.max_memory_allocated() / 2**30, 2) if device.type == "cuda" else None
        ),
        "adapter_args": merged_args,
    }
    print(f"[extract] {json.dumps(stats)}")
    return stats


@app.function(
    image=image,
    gpu="L40S",  # MLP heads train on GPU; probe_fit falls back to CPU cleanly
    timeout=3600 * 4,
    volumes={VOL_PATH: data_volume},
)
def fit_probes(
    probes_subpath: str = "probes.jsonl",
    encoders: str = "",
    fit_kwargs: dict | None = None,
    run: str | None = None,
) -> str:
    """Run the probe_fit pipeline on the volume: /vol/corpus/<probes_subpath>
    joined to /vol/features/<encoder>/, results to /vol/results/<run>/
    (per-pair JSONs + summary.md). Returns the summary text.

    `encoders` is a comma-separated list of feature subdir names (as written
    by extract_encoder, e.g. "clip_vit_l_336,clip_vit_l_336__rand").
    `fit_kwargs` maps probe_fit CLI flags (underscored) to values, e.g.
    {"train_frac": 0.5, "split_seed": 1, "min_samples": 5, "heads": "linear"}.
    Imports probe_fit's own main() — no forked pipeline logic here.
    """
    from datetime import datetime, timezone
    from pathlib import Path

    import torch

    from encoder_experiments.probe_fit import main as probe_fit_main

    data_volume.reload()  # see the freshest probes.jsonl + features

    if not encoders:
        raise ValueError("fit_probes needs a comma-separated `encoders` list")
    probes = Path(VOL_PATH) / "corpus" / probes_subpath
    if not probes.exists():
        raise FileNotFoundError(
            f"{probes} not found — upload with: "
            f"modal volume put {APP_NAME} <probes.jsonl> /corpus/{probes_subpath}"
        )
    features = Path(VOL_PATH) / "features"
    run = run or (
        f"{Path(probes_subpath).stem}-"
        f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    )
    out_dir = Path(VOL_PATH) / "results" / run
    out_dir.mkdir(parents=True, exist_ok=True)

    kwargs = dict(fit_kwargs or {})
    device = kwargs.pop("device", "cuda" if torch.cuda.is_available() else "cpu")
    argv = [
        "--features", str(features),
        "--probes", str(probes),
        "--encoders", encoders,
        "--out", str(out_dir),
        "--device", str(device),
    ]
    for key, val in kwargs.items():
        argv += [f"--{key.replace('_', '-')}", str(val)]

    print(f"[fit_probes] run={run} argv={argv}")
    rc = probe_fit_main(argv)
    data_volume.commit()

    summary = out_dir / "summary.md"
    text = (
        summary.read_text()
        if summary.exists()
        else f"(no summary.md written; probe_fit exit code {rc})"
    )
    print(f"[fit_probes] exit={rc} results -> {out_dir}")
    return text


def parse_encoder_spec(spec: str) -> tuple[str, bool, dict]:
    """'name[__rand][@k=v;k=v]' -> (name, random_init, adapter_args)."""
    spec = spec.strip()
    adapter_args: dict = {}
    if "@" in spec:
        spec, argstr = spec.split("@", 1)
        for pair in argstr.split(";"):
            if pair:
                key, val = pair.split("=", 1)
                adapter_args[key] = val
    random_init = spec.endswith("__rand")
    if random_init:
        spec = spec[: -len("__rand")]
    return spec, random_init, adapter_args


@app.local_entrypoint()
def main(
    encoders: str,
    shards: int = 1,
    images_subpath: str = "images.jsonl",
    overwrite: bool = False,
    dtype: str = "fp32",
    fit: bool = False,
    probes_subpath: str = "probes.jsonl",
    fit_kwargs: str = "",
    run: str = "",
):
    """Fan out extract_encoder over (encoder x shard) — or, with --fit, run
    the probe_fit pipeline on already-extracted features instead (extraction
    functions are NOT invoked in that mode)."""
    if fit:
        import json as _json

        kwargs = _json.loads(fit_kwargs) if fit_kwargs else {}
        print(f"[modal_extract] fit_probes(probes_subpath={probes_subpath!r}, "
              f"encoders={encoders!r}, fit_kwargs={kwargs}, run={run or None!r})")
        summary = fit_probes.remote(
            probes_subpath=probes_subpath,
            encoders=encoders,
            fit_kwargs=kwargs,
            run=run or None,
        )
        print(summary)
        return

    jobs = []
    for spec in encoders.split(","):
        name, random_init, adapter_args = parse_encoder_spec(spec)
        for shard in range(shards):
            jobs.append((name, random_init, images_subpath, shard, shards, adapter_args, overwrite, dtype))

    print(f"[modal_extract] launching {len(jobs)} jobs "
          f"({len(encoders.split(','))} encoders x {shards} shards)")
    results = list(extract_encoder.starmap(jobs, return_exceptions=True))
    ok = 0
    for job, res in zip(jobs, results):
        label = f"{job[0]}{'__rand' if job[1] else ''} shard {job[3]}"
        if isinstance(res, Exception):
            print(f"[FAIL] {label}: {type(res).__name__}: {res}")
        else:
            ok += 1
            print(f"[ok]   {label}: done={res['done']} skipped={res['skipped']} "
                  f"failed={res['failed']} mean_s={res['mean_image_s']} "
                  f"first={res['first_image']} peak_gib={res['peak_gpu_mem_gib']}")
    print(f"[modal_extract] {ok}/{len(jobs)} jobs succeeded")
