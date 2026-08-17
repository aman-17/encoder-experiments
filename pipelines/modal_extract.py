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

(--derive-pooled also reads variable-grid caches; --out-tower renames the
output dirs when <tower>@<rung> is taken by the resolution sweep, e.g. the
B3 pixel control: --encoders qwen35_vit --out-tower qwen35_vit_pooled.)

S3 decoder-mid site (Exp 2a): the FULL Qwen3.5-4B forward (no generation)
with a fixed transcription prompt; hidden states at the image-token
positions, layer floor(n_layers/2), mapped back to the merged grid and
stored as .sites.safetensors under
/vol/features[_sweep]/qwen35_decoder_mid[@<budget>]/ (sites-mode is
mandatory — 4096-d full grids would not fit the volume):

    uv run modal run --detach modal_extract.py --decoder-mid \
        --encoders qwen35_decoder_mid \
        --budget 144,400,1024 --shards 4 --probes-subpath probes.jsonl

(omit --budget for the native rung; --encoders takes
qwen35_decoder_mid@checkpoint=... to override the checkpoint).
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

    probes_subpath WITHOUT a budget = native sites-mode (the decoder_mid
    native precedent): .sites.safetensors under /vol/features/<tag>/ with
    mechanism=native, knob=native. Full-grid native extraction (empty
    probes_subpath, no budget) is byte-unchanged.
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
    if budget and not probes_subpath:
        raise ValueError(
            "sweep runs (budget > 0) require sites-mode: pass probes_subpath "
            "so site features can be sampled instead of caching full grids"
        )
    if probes_subpath:
        probes_path = corpus / probes_subpath
        if not probes_path.exists():
            raise FileNotFoundError(f"{probes_path} not found (sites source)")
        site_specs = load_site_manifest(probes_path)["images"]

    device = resolve_device("auto")
    # "auto" -> bf16 on CUDA, and these ViTs amplify bf16 compute noise over
    # layers (per-token min cosine ~0.25 vs fp32 on low-norm patches), so the
    # default computes in fp32 (storage stays fp16 in save_features). Pass
    # dtype="auto" to opt into bf16 speed for throwaway runs.
    dtype = resolve_dtype(dtype, device)
    merged_args = {**DEFAULT_ADAPTER_ARGS.get(encoder, {}), **(adapter_args or {})}
    if budget:
        merged_args.update(budget_knobs(encoder, budget))  # the knob always wins
    adapter = build(encoder, device, dtype, random_init=random_init, adapter_args=merged_args)

    tag = adapter.cache_tag + ("__rand" if random_init else "")
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
        **adapter.extra_meta,
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
    elif site_specs is not None:
        # native sites-mode: same contract fields the decoder_mid native writes
        meta.update({"mechanism": "native", "knob": "native"})
    # pre-merge captures store per-point child vectors (concat4/mean4 readouts)
    child_merge = (
        int(getattr(adapter, "merge", 2)) if meta.get("site") == "premerge" else None
    )

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
                    allowed = budget * adapter.budget_multiplier
                    assert n_tokens <= allowed, (
                        f"budget overrun: {row['image_id']} realized {n_tokens} "
                        f"tokens > {allowed} allowed — knob did not take"
                    )
                    realized_tokens.append(n_tokens)
                if site_specs is not None:
                    save_sites(out_path, feats, spec["points"], meta, child_merge=child_merge)
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
        "no_sites": no_sites if site_specs is not None else None,
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


DECODER_MID_TAG = "qwen35_decoder_mid"
DECODER_MID_PROMPT = "Transcribe this document to markdown."


@app.function(
    image=image,
    gpu="L40S",
    timeout=3600 * 8,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def extract_decoder_mid(
    checkpoint: str = "Qwen/Qwen3.5-4B",
    images_subpath: str = "images.jsonl",
    probes_subpath: str = "probes.jsonl",
    shard: int = 0,
    nshards: int = 1,
    budget: int = 0,
    overwrite: bool = False,
) -> dict:
    """S3 site: full-model fp32 forward (NO generation) with the fixed prompt
    DECODER_MID_PROMPT; capture layer floor(n_layers/2) hidden states at the
    image-token positions and store them as site features on the merged grid.

    The image tokens' sequence order IS the merged grid's row-major order
    (the tower's merged output is scattered into the placeholder positions in
    order), so tokens[mask] reshaped to (h/merge, w/merge) is a grid like any
    other and save_sites bilinear-reads the same probe points. Sites-mode is
    mandatory (4096-d full grids would blow the volume); budget > 0 sets
    max_pixels = budget * 784 on the processor (same knob as qwen35_vit) and
    output goes to /vol/features_sweep/<tag>@<budget>/, else to
    /vol/features/<tag>/. Metadata: site=decoder_mid, decoder_layer (index
    into hidden_states; 0 = embeddings), n_layers, prompt.
    """
    import json
    import time
    import traceback
    from pathlib import Path

    import torch
    from PIL import Image
    from transformers import AutoModel, AutoProcessor

    from encoder_experiments.adapters.base import EncoderFeatures
    from encoder_experiments.adapters.qwen_vit import Qwen35Vit
    from encoder_experiments.budgets import QWEN_PIXELS_PER_TOKEN
    from encoder_experiments.extract import read_manifest, safe_image_id, save_sites
    from encoder_experiments.site_store import SITES_SUFFIX, load_site_manifest

    data_volume.reload()

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / images_subpath
    if not manifest.exists():
        raise FileNotFoundError(
            f"{manifest} not found — upload with: "
            f"modal volume put {APP_NAME} <local corpus dir> /corpus"
        )
    probes_path = corpus / probes_subpath
    if not probes_path.exists():
        raise FileNotFoundError(f"{probes_path} not found (decoder-mid is sites-only)")
    site_specs = load_site_manifest(probes_path)["images"]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    processor = AutoProcessor.from_pretrained(checkpoint, trust_remote_code=True)
    budget_kwargs: dict = {}
    if budget:
        budget_kwargs = Qwen35Vit._apply_pixel_budget(
            processor.image_processor, 0, budget * QWEN_PIXELS_PER_TOKEN
        )
    # fp32 on purpose: same rationale as extract_encoder — bf16 compute noise
    # would contaminate site comparisons across S1/S2/S3.
    model = AutoModel.from_pretrained(
        checkpoint, trust_remote_code=True, torch_dtype=torch.float32
    ).eval().to(device)

    deepstack = list(getattr(model.config.vision_config, "deepstack_visual_indexes", []) or [])
    if deepstack:
        raise RuntimeError(
            f"{checkpoint}: deepstack_visual_indexes={deepstack} — plural bridges; "
            "the single-site S3 capture does not cover DeepStack paths (Exp 2a "
            "excludes such checkpoints)"
        )
    image_token_id = getattr(model.config, "image_token_id", None)
    if image_token_id is None:
        raise RuntimeError(f"{checkpoint}: config has no image_token_id")
    merge = int(model.config.vision_config.spatial_merge_size)
    n_layers = int(model.config.text_config.num_hidden_layers)
    layer = n_layers // 2

    messages = [{
        "role": "user",
        "content": [{"type": "image"}, {"type": "text", "text": DECODER_MID_PROMPT}],
    }]
    prompt_text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    tag = DECODER_MID_TAG
    if budget:
        out_dir = Path(VOL_PATH) / "features_sweep" / f"{tag}@{budget}"
    else:
        out_dir = Path(VOL_PATH) / "features" / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    errors_path = out_dir / f"errors.shard{shard}.jsonl"

    meta = {
        "encoder": tag,
        "checkpoint": checkpoint,
        "pooled_kind": "mean",
        "random_init": "False",
        "compute_dtype": "torch.float32",
        "site": "decoder_mid",
        "decoder_layer": str(layer),
        "n_layers": str(n_layers),
        "prompt": DECODER_MID_PROMPT,
        "mechanism": "resolution" if budget else "native",
        "knob": (
            f"max_pixels={budget * QWEN_PIXELS_PER_TOKEN}" if budget else "native"
        ),
    }
    if budget:
        meta["budget_nominal"] = str(budget)

    rows = read_manifest(manifest, limit=None)
    rows = rows[shard::nshards]
    print(f"[decoder_mid] {tag}{f'@{budget}' if budget else ''} shard {shard}/{nshards}: "
          f"{len(rows)} images -> {out_dir} (layer={layer}/{n_layers}, device={device})")
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats()

    done = skipped = failed = no_sites = 0
    per_image_s: list[float] = []
    realized_tokens: list[int] = []
    first_shape: dict | None = None
    since_commit = 0
    with torch.inference_mode():
        for row in rows:
            sid = safe_image_id(row["image_id"])
            spec = site_specs.get(row["image_id"]) or site_specs.get(sid)
            if spec is None:
                no_sites += 1
                continue
            out_path = out_dir / f"{sid}{SITES_SUFFIX}"
            if out_path.exists() and not overwrite:
                skipped += 1
                continue
            try:
                t0 = time.monotonic()
                image_pil = Image.open(corpus / row["image_path"]).convert("RGB")
                call_kwargs = dict(budget_kwargs)
                while True:
                    try:
                        inputs = processor(
                            text=[prompt_text], images=[image_pil],
                            return_tensors="pt", **call_kwargs,
                        )
                        break
                    except TypeError:
                        # same channel-stripping ladder as Qwen35Vit.encode();
                        # the realized-token guard below fails loudly if no
                        # surviving channel carried the budget
                        if "size" in call_kwargs:
                            call_kwargs.pop("size")
                        elif call_kwargs:
                            call_kwargs = {}
                        else:
                            raise
                inputs = inputs.to(device)
                out = model(**inputs, output_hidden_states=True, return_dict=True)
                hs = out.hidden_states
                assert len(hs) == n_layers + 1, (
                    f"expected {n_layers + 1} hidden states, got {len(hs)}"
                )
                mask = inputs["input_ids"][0] == image_token_id
                t, h, w = (int(x) for x in inputs["image_grid_thw"][0])
                hm, wm = h // merge, w // merge
                n_img = int(mask.sum())
                assert t == 1 and n_img == hm * wm, (
                    f"image-token/grid mismatch: {n_img} image tokens vs "
                    f"thw={(t, h, w)} merge={merge}"
                )
                if budget:
                    assert n_img <= budget, (
                        f"budget overrun: {row['image_id']} realized {n_img} "
                        f"merged tokens > {budget} (pixel-budget knob did not take)"
                    )
                    realized_tokens.append(n_img)
                tokens = hs[layer][0][mask].float().cpu()  # [hm*wm, D] merged row-major
                feats = EncoderFeatures(
                    tokens=tokens, grid_hw=(hm, wm), pooled=tokens.mean(dim=0)
                )
                save_sites(out_path, feats, spec["points"], meta)
                per_image_s.append(time.monotonic() - t0)
                if first_shape is None:
                    first_shape = {
                        "image_id": row["image_id"],
                        "num_tokens": int(tokens.shape[0]),
                        "feat_dim": int(tokens.shape[1]),
                        "grid_hw": [hm, wm],
                        "seq_len": int(inputs["input_ids"].shape[1]),
                    }
                done += 1
            except Exception as exc:  # noqa: BLE001 — per-image isolation
                failed += 1
                record = {
                    "image_id": row["image_id"],
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                }
                details = getattr(exc, "details", None)
                if details:
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
        "decoder_layer": layer,
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
        "no_sites": no_sites,
        "mean_image_s": round(sum(per_image_s) / len(per_image_s), 3) if per_image_s else None,
        "first_image": first_shape,
        "peak_gpu_mem_gib": (
            round(torch.cuda.max_memory_allocated() / 2**30, 2) if device.type == "cuda" else None
        ),
    }
    print(f"[decoder_mid] {json.dumps(stats)}")
    return stats


@app.function(
    image=image,
    # CPU on purpose: the linear heads are sklearn (CPU-bound), the MLP heads
    # are small, and CPU containers schedule instantly instead of queueing for
    # the shared workspace's GPUs.
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
    {"train_frac": 0.5, "split_seed": 1, "min_samples": 5, "heads": "linear",
    "append_coords": True, "split_by": "font",
    "meta_filter": ["difficulty == easy", "scan_severity >= 1"]} — booleans
    emit bare store_true flags (False/absent emits nothing), lists repeat the
    flag once per element. Imports probe_fit's own main() — no forked pipeline
    logic here.
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
        flag = f"--{key.replace('_', '-')}"
        if isinstance(val, bool):
            if val:
                argv.append(flag)
        elif isinstance(val, (list, tuple)):
            for v in val:
                argv += [flag, str(v)]
        else:
            argv += [flag, str(val)]

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
    # bandwidth work, not GPU work (see fit_probes).
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
    out_tower: str = "",
) -> dict:
    """Merge-mechanism budget rungs for one tower: read the EXISTING full
    grids under /vol/features/<tower> (fixed OR variable per-image grids —
    qwen35_vit natives included), pool to each rung, write
    /vol/features_sweep/<out_tower or tower>@<rung>/<id>.sites.safetensors
    (mechanism="merge"). `rungs` empty -> the full LADDER (rungs above an
    image's native grid are skipped per image). `out_tower` renames the
    output dirs — required when <tower>@<rung> is already taken by the
    resolution sweep (B3: tower=qwen35_vit, out_tower=qwen35_vit_pooled)."""
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
        out_tower=out_tower or None,
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
    out_tower: str = "",
    decoder_mid: bool = False,
    sites: bool = False,
):
    """Fan out extract_encoder over (encoder x shard) — or, with --fit, run
    the probe_fit pipeline on already-extracted features instead (extraction
    functions are NOT invoked in that mode).

    --budget "64,100,..." runs the sweep: (encoder x budget x shard) jobs
    with each knob tower's budget knob set and .sites.safetensors output
    under /vol/features_sweep/<encoder>@<budget>/ (needs --probes-subpath).
    --derive-pooled runs the CPU merge-mechanism derivation instead, over
    the fixed-resolution towers' EXISTING full grids (--rungs to restrict).
    --decoder-mid runs the S3 extract_decoder_mid function instead
    (--encoders must be qwen35_decoder_mid[@checkpoint=...]; --budget is the
    merged-token ladder, empty = native).
    --sites stores native extractions as .sites.safetensors against
    --probes-subpath instead of full grids (sweep rungs are sites-mode
    regardless).
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

    if decoder_mid:
        name, random_init, adapter_args = parse_encoder_spec(encoders)
        if name != DECODER_MID_TAG or random_init:
            raise ValueError(
                f"--decoder-mid takes --encoders {DECODER_MID_TAG}"
                f"[@checkpoint=...], got {encoders!r}"
            )
        unknown = set(adapter_args) - {"checkpoint"}
        if unknown:
            raise ValueError(f"--decoder-mid spec args must be checkpoint=..., got {sorted(unknown)}")
        checkpoint = adapter_args.get("checkpoint", "Qwen/Qwen3.5-4B")
        budgets = [int(b) for b in budget.split(",") if b.strip()] or [0]
        jobs = [
            (checkpoint, images_subpath, probes_subpath, shard, shards, b, overwrite)
            for b in budgets
            for shard in range(shards)
        ]
        print(f"[modal_extract] decoder_mid: {len(jobs)} jobs "
              f"({len(budgets)} budgets x {shards} shards, checkpoint={checkpoint})")
        results = list(extract_decoder_mid.starmap(jobs, return_exceptions=True))
        ok = 0
        for job, res in zip(jobs, results):
            label = f"{DECODER_MID_TAG}{f'@{job[5]}' if job[5] else ''} shard {job[3]}"
            if isinstance(res, Exception):
                print(f"[FAIL] {label}: {type(res).__name__}: {res}")
            else:
                ok += 1
                print(f"[ok]   {label}: done={res['done']} skipped={res['skipped']} "
                      f"failed={res['failed']} no_sites={res['no_sites']} "
                      f"realized={res['realized_tokens']} first={res['first_image']} "
                      f"peak_gib={res['peak_gpu_mem_gib']}")
        print(f"[modal_extract] {ok}/{len(jobs)} jobs succeeded")
        return

    if derive_pooled:
        towers = [t.strip() for t in encoders.split(",") if t.strip()]
        if out_tower and len(towers) != 1:
            raise ValueError("--out-tower renames ONE tower's output dirs; pass a single --encoders")
        jobs = [(tower, probes_subpath, rungs, overwrite, out_tower) for tower in towers]
        print(f"[modal_extract] derive_pooled over {towers} (rungs={rungs or 'LADDER'}"
              f"{f', out_tower={out_tower}' if out_tower else ''})")
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
                             probes_subpath if (b or sites) else ""))

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
