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

Budget sweep (Exp 2 token-frontier). --budget selects each knob tower's
preprocessing knob per encoder_experiments.budgets.BUDGET_KNOBS
(siglip2_naflex -> max_num_patches, qwen35_vit -> max_pixels = budget*784,
deepseek_ocr -> base_size map); output goes to
/vol/features_sweep/<encoder>@<budget>/ as .sites.safetensors (sites-mode is
REQUIRED for sweep runs — 9 rungs x towers of full grids would not fit the
volume), so /vol/corpus/<probes_subpath> must exist:

    uv run modal run --detach modal_extract.py \
        --encoders siglip2_naflex,qwen35_vit,deepseek_ocr \
        --budget 64,100,144,196,256,400,576,784,1024 \
        --shards 4 --probes-subpath probes.jsonl

(rungs a tower cannot realize — e.g. deepseek_ocr above 400 — are skipped at
job-build time with a note). The fixed-resolution towers get their
down-budget points from the CPU derive_pooled function instead, which reads
the EXISTING full grids under /vol/features/<tower>:

    uv run modal run --detach modal_extract.py --derive-pooled \
        --encoders clip_vit_l_336,siglip2_so400m_384,sam_vit_b \
        --probes-subpath probes.jsonl
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
    budget: int = 0,
    probes_subpath: str = "",
) -> dict:
    """Extract features for one (encoder, shard). Same loop as extract.py, reused.

    budget > 0 switches to SWEEP mode: the tower's preprocessing knob is set
    per budgets.budget_knobs, output goes to
    /vol/features_sweep/<encoder>@<budget>/<id>.sites.safetensors written by
    extract.save_sites per the site_store contract (mechanism =
    budgets.KNOB_MECHANISMS[tower], budget_tokens = ACTUAL realized count),
    and sites-mode is mandatory — probes_subpath must name the probes.jsonl
    (or sites manifest) whose marked points define the site readouts (full
    grids at 9 rungs x towers would blow the volume).
    """
    import json
    import time
    import traceback
    from pathlib import Path

    import torch
    from PIL import Image

    from encoder_experiments.budgets import KNOB_MECHANISMS, budget_knobs
    from encoder_experiments.extract import (
        read_manifest,
        safe_image_id,
        save_features,
        save_sites,
    )
    from encoder_experiments.registry import build, resolve_device, resolve_dtype
    from encoder_experiments.site_store import SITES_SUFFIX, load_site_manifest

    data_volume.reload()  # see corpus uploads / other shards' commits

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / images_subpath
    if not manifest.exists():
        raise FileNotFoundError(
            f"{manifest} not found — upload with: "
            f"modal volume put {APP_NAME} <local corpus dir> /corpus"
        )

    site_specs: dict | None = None
    if budget:
        if not probes_subpath:
            raise ValueError(
                "sweep runs (budget > 0) require sites-mode: pass probes_subpath "
                "so site features can be sampled instead of caching full grids"
            )
        probes_path = corpus / probes_subpath
        if not probes_path.exists():
            raise FileNotFoundError(f"{probes_path} not found (sweep sites source)")
        site_specs = load_site_manifest(probes_path)["images"]

    device = resolve_device("auto")
    # Parity finding (verified): "auto" -> bf16 on CUDA, and these ViTs amplify
    # bf16 compute noise over layers (per-token min cosine ~0.25 vs fp32 on
    # low-norm patches). Features must be box-independent, so the pilot computes
    # in fp32 (storage stays fp16 in save_features). Pass dtype="auto" to opt
    # back into bf16 speed for throwaway runs.
    dtype = resolve_dtype(dtype, device)
    merged_args = {**DEFAULT_ADAPTER_ARGS.get(encoder, {}), **(adapter_args or {})}
    if budget:
        merged_args.update(budget_knobs(encoder, budget))  # the knob always wins
    adapter = build(encoder, device, dtype, random_init=random_init, adapter_args=merged_args)

    tag = adapter.name + ("__rand" if random_init else "")
    if budget:
        out_dir = Path(VOL_PATH) / "features_sweep" / f"{tag}@{budget}"
    else:
        out_dir = Path(VOL_PATH) / "features" / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    errors_path = out_dir / f"errors.shard{shard}.jsonl"

    rows = read_manifest(manifest, limit=None)
    rows = rows[shard::nshards]
    print(f"[extract] {tag}{f'@{budget}' if budget else ''} shard {shard}/{nshards}: "
          f"{len(rows)} images -> {out_dir} "
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
    if budget:
        knob_args = budget_knobs(encoder, budget)
        meta.update({
            # site_store sweep contract; budget_tokens/grid_h/grid_w are
            # written by save_sites from the ACTUAL realized encode.
            "mechanism": KNOB_MECHANISMS[encoder],
            "knob": ";".join(f"{k}={v}" for k, v in sorted(knob_args.items())),
            "budget_nominal": str(budget),
        })

    done = skipped = failed = no_sites = 0
    per_image_s: list[float] = []
    realized_tokens: list[int] = []
    first_shape: dict | None = None
    since_commit = 0
    with torch.inference_mode():
        for row in rows:
            sid = safe_image_id(row["image_id"])
            if site_specs is not None:
                spec = site_specs.get(row["image_id"]) or site_specs.get(sid)
                if spec is None:  # image has no probe rows at all — nothing to store
                    no_sites += 1
                    continue
                out_path = out_dir / f"{sid}{SITES_SUFFIX}"
            else:
                out_path = out_dir / f"{sid}.safetensors"
            if out_path.exists() and not overwrite:
                skipped += 1
                continue
            try:
                t0 = time.monotonic()
                image_pil = Image.open(corpus / row["image_path"]).convert("RGB")
                feats = adapter.encode(image_pil)
                if budget:
                    n_tokens = int(feats.tokens.shape[0])
                    assert n_tokens <= budget, (
                        f"budget overrun: {row['image_id']} realized {n_tokens} "
                        f"tokens > budget {budget} — knob did not take"
                    )
                    realized_tokens.append(n_tokens)
                    save_sites(out_path, feats, spec["points"], meta)
                else:
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
    realized = sorted(realized_tokens)
    stats = {
        "encoder": tag,
        "budget": budget or None,
        "realized_tokens": (
            {
                "min": realized[0],
                "median": realized[len(realized) // 2],
                "max": realized[-1],
            }
            if realized
            else None
        ),
        "shard": shard,
        "nshards": nshards,
        "done": done,
        "skipped": skipped,
        "failed": failed,
        "no_sites": no_sites if budget else None,
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
    # CPU on purpose: the linear heads are sklearn (CPU-bound) and the MLP heads
    # are small; L40S queueing in the shared workspace got our pending apps
    # CLI-stopped twice during a capacity crunch. CPU containers schedule
    # instantly and dodge the contention entirely.
    cpu=16.0,
    memory=65536,
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


@app.function(
    image=image,
    # CPU on purpose: adaptive-average-pooling cached fp16 grids is memory-
    # bandwidth work, not GPU work, and CPU containers dodge the shared-
    # workspace L40S queue (see fit_probes).
    cpu=8.0,
    memory=32768,
    timeout=3600 * 4,
    volumes={VOL_PATH: data_volume},
)
def derive_pooled_features(
    tower: str,
    probes_subpath: str = "probes.jsonl",
    rungs: str = "",
    overwrite: bool = False,
) -> dict:
    """Merge-mechanism budget rungs for one fixed-resolution tower: read the
    EXISTING full grids under /vol/features/<tower>, pool to each rung, write
    /vol/features_sweep/<tower>@<rung>/<id>.sites.safetensors
    (mechanism="merge"). `rungs` empty -> the full LADDER (rungs above the
    tower's native grid are skipped inside)."""
    import json
    from pathlib import Path

    from encoder_experiments.budgets import LADDER
    from encoder_experiments.derive_pooled import derive_for_dir

    data_volume.reload()

    features_in = Path(VOL_PATH) / "features" / tower
    if not features_in.is_dir():
        raise FileNotFoundError(
            f"{features_in} not found — derive_pooled reads full grids written "
            "by a previous extract run"
        )
    probes = Path(VOL_PATH) / "corpus" / probes_subpath
    if not probes.exists():
        raise FileNotFoundError(f"{probes} not found (site points source)")

    rung_list = [int(r) for r in rungs.split(",") if r.strip()] if rungs else list(LADDER)
    stats = derive_for_dir(
        features_in=features_in,
        probes=probes,
        rungs=rung_list,
        out=Path(VOL_PATH) / "features_sweep",
        overwrite=overwrite,
    )
    data_volume.commit()
    print(f"[derive_pooled] {json.dumps(stats)}")
    return stats


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
    budget: str = "",
    derive_pooled: bool = False,
    rungs: str = "",
):
    """Fan out extract_encoder over (encoder x shard) — or, with --fit, run
    the probe_fit pipeline on already-extracted features instead (extraction
    functions are NOT invoked in that mode).

    --budget "64,100,..." runs the sweep: (encoder x budget x shard) jobs
    with each knob tower's budget knob set and .sites.safetensors output
    under /vol/features_sweep/<encoder>@<budget>/ (needs --probes-subpath).
    --derive-pooled runs the CPU merge-mechanism derivation instead, over
    the fixed-resolution towers' EXISTING full grids (--rungs to restrict).
    """
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

    if derive_pooled:
        towers = [t.strip() for t in encoders.split(",") if t.strip()]
        jobs = [(tower, probes_subpath, rungs, overwrite) for tower in towers]
        print(f"[modal_extract] derive_pooled over {towers} (rungs={rungs or 'LADDER'})")
        results = list(derive_pooled_features.starmap(jobs, return_exceptions=True))
        ok = 0
        for tower, res in zip(towers, results):
            if isinstance(res, Exception):
                print(f"[FAIL] {tower}: {type(res).__name__}: {res}")
            else:
                ok += 1
                print(f"[ok]   {tower}: {res}")
        print(f"[modal_extract] {ok}/{len(towers)} towers derived")
        return

    budgets = [int(b) for b in budget.split(",") if b.strip()] if budget else [0]
    if budget:
        from encoder_experiments.budgets import budget_knobs  # local venv has the pkg

    jobs = []
    for spec in encoders.split(","):
        name, random_init, adapter_args = parse_encoder_spec(spec)
        for b in budgets:
            if b:
                try:  # validate the (tower, rung) pair before spending a GPU on it
                    budget_knobs(name, b)
                except ValueError as exc:
                    print(f"[skip] {name}@{b}: {exc}")
                    continue
            for shard in range(shards):
                jobs.append((name, random_init, images_subpath, shard, shards,
                             adapter_args, overwrite, dtype, b,
                             probes_subpath if b else ""))

    print(f"[modal_extract] launching {len(jobs)} jobs "
          f"({len(encoders.split(','))} encoders x {len(budgets)} budgets x {shards} shards)")
    results = list(extract_encoder.starmap(jobs, return_exceptions=True))
    ok = 0
    for job, res in zip(jobs, results):
        label = f"{job[0]}{'__rand' if job[1] else ''}{f'@{job[8]}' if job[8] else ''} shard {job[3]}"
        if isinstance(res, Exception):
            print(f"[FAIL] {label}: {type(res).__name__}: {res}")
        else:
            ok += 1
            print(f"[ok]   {label}: done={res['done']} skipped={res['skipped']} "
                  f"failed={res['failed']} mean_s={res['mean_image_s']} "
                  f"realized={res['realized_tokens']} first={res['first_image']} "
                  f"peak_gib={res['peak_gpu_mem_gib']}")
    print(f"[modal_extract] {ok}/{len(jobs)} jobs succeeded")
