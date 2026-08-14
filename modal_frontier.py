"""Exp 3 GENERATION side: full VLM stacks -> markdown at token budgets, on Modal.

Separate app ("encoder-anatomy-frontier") from the probe-pass pilot app, but
sharing BOTH of its volumes: the "encoder-anatomy-pilot" data volume at /vol
(corpus manifests + images live under /vol/corpus, per modal_extract.py) and
the ocr-rl-trainer HF cache at /hf_cache.

Two stacks, dispatched by name:

    qwen3_vl      Qwen/Qwen3-VL-4B-Instruct via transformers 5.14
                  AutoModelForImageTextToText + chat template. Budget knob =
                  the processor pixel budget from encoder_experiments.budgets
                  (max_pixels = budget * 784), applied through the qwen_vit
                  adapter's _apply_pixel_budget — the per-call `size` dict is
                  the only channel transformers 5.14 honors (bare
                  min/max_pixels attrs are ignored; verified on the Exp 2
                  sweep). Realized merged-token count is read back from
                  image_grid_thw per image and guarded <= budget.
    deepseek_ocr  deepseek-ai/DeepSeek-OCR through its own remote-code
                  infer() path (modeling_deepseekocr), GLOBAL VIEW ONLY:
                  crop_mode=False with base_size = image_size =
                  budgets.DEEPSEEK_BASE_SIZE[budget], so the vision grid is
                  exactly (base_size/64)^2 = budget tokens. Budgets without a
                  base_size (576+, e.g. 784) are skipped at job-build time.
                  Prompt is the checkpoint's native idiom
                  "<image>\\nConvert the document to markdown. " (the
                  <|grounding|> variant would interleave <|ref|>/<|det|> box
                  tags into the markdown). infer() hardcodes its own
                  generation knobs (temperature=0.0, max_new_tokens=8192,
                  no_repeat_ngram_size=35 in eval_mode) — we take them as-is:
                  this stack is "the checkpoint's own serving path", not ours.

The two stacks need INCOMPATIBLE transformers pins (Qwen3-VL needs 5.x;
DeepSeek-OCR's remote code imports LlamaFlashAttention2, removed after 4.47,
so it pins the model card's 4.46.3), hence generate_markdown is one loop
shared by two same-signature Modal functions on different images — the local
entrypoint is the single dispatch point.

dtype: bf16 generation is FINE here — this is the served regime (generation
quality, not the probe pass's feature-parity contract, which is what forced
fp32 in modal_extract.py). DeepSeek-OCR is not installable with flash-attn
here; it runs eager attention (slower, same math).

Decoding: greedy (do_sample=False / temperature 0), max_new_tokens 4096 for
qwen3_vl (deepseek's infer() hardcodes 8192).

Outputs, resume-safe (existing .md files are skipped):

    /vol/frontier/<stack>@<budget>/<image_id>.md
    /vol/frontier/<stack>@<budget>/meta.shard<k>.jsonl   one row per generated
        page: {image_id, realized_tokens, gen_s, n_output_tokens}
    /vol/frontier/<stack>@<budget>/errors.shard<k>.jsonl per-image failures

Run (full corpus is /vol/corpus/images_modal.jsonl, 1420 pages):

    uv run modal run --detach modal_frontier.py \
        --stacks qwen3_vl,deepseek_ocr --budget 196,400,784 --shards 4

Smoke run:

    uv run modal run modal_frontier.py \
        --stacks qwen3_vl,deepseek_ocr --budget 196 --limit 3

GPU: L40S. If a shard OOMs, rerun it with FRONTIER_GPU=A100-80GB in the
LOCAL environment (the gpu spec is resolved client-side at import time);
resume skips every finished page, so only the OOMed pages are redone.
"""

from __future__ import annotations

import os

import modal

APP_NAME = "encoder-anatomy-frontier"
VOL_PATH = "/vol"
HF_CACHE_PATH = "/hf_cache"  # same mount path as the pilot + trainers -> cache hits
GPU = os.environ.get("FRONTIER_GPU", "L40S")

app = modal.App(APP_NAME)

data_volume = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

QWEN_CHECKPOINT = "Qwen/Qwen3-VL-4B-Instruct"
QWEN_PROMPT = (
    "Convert this document page to markdown. Preserve tables as HTML tables, "
    "headings, and reading order. Output only the markdown."
)
QWEN_MAX_NEW_TOKENS = 4096

DSOCR_CHECKPOINT = "deepseek-ai/DeepSeek-OCR"
DSOCR_PROMPT = "<image>\nConvert the document to markdown. "

qwen_image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "torch",
        "torchvision",
        "transformers>=5.14,<5.15",  # same pin as modal_extract.py
        "accelerate",
        "safetensors",
        "pillow",
        "numpy",
        "tqdm",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)

# DeepSeek-OCR model-card stack: transformers 4.46.3 (its remote code imports
# LlamaFlashAttention2, gone in modern transformers) + the remote-code deps
# (addict/matplotlib/requests for modeling_deepseekocr, einops/easydict for
# deepencoder). No flash-attn: the import is availability-guarded and
# ATTENTION_CLASSES has eager entries for both mla and mha.
dsocr_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.6.0",
        "torchvision==0.21.0",
        "transformers==4.46.3",
        "tokenizers==0.20.3",
        "safetensors",
        "pillow",
        "numpy",
        "tqdm",
        "einops",
        "easydict",
        "addict",
        "matplotlib",
        "requests",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)


def _run_generation_loop(
    stack: str,
    budget: int,
    shard: int,
    nshards: int,
    images_subpath: str,
    limit: int,
    load_stack,
) -> dict:
    """The shared generate_markdown loop: manifest -> per-image generate ->
    /vol/frontier/<stack>@<budget>/. `load_stack()` returns
    generate_one(abs_image_path) -> (markdown, realized_tokens); everything
    else (resume, meta.jsonl, errors.jsonl, commits, timing) is common."""
    import json
    import time
    import traceback
    from pathlib import Path

    from encoder_experiments.extract import read_manifest, safe_image_id

    data_volume.reload()  # see corpus uploads / other shards' commits

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / images_subpath
    if not manifest.exists():
        raise FileNotFoundError(
            f"{manifest} not found — upload with: "
            f"modal volume put encoder-anatomy-pilot <local corpus dir> /corpus"
        )

    out_dir = Path(VOL_PATH) / "frontier" / f"{stack}@{budget}"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path = out_dir / f"meta.shard{shard}.jsonl"
    errors_path = out_dir / f"errors.shard{shard}.jsonl"

    rows = read_manifest(manifest, limit or None)
    rows = rows[shard::nshards]
    print(f"[frontier] {stack}@{budget} shard {shard}/{nshards}: "
          f"{len(rows)} images -> {out_dir}")

    t_load = time.monotonic()
    generate_one, count_output_tokens = load_stack()
    load_s = time.monotonic() - t_load
    print(f"[frontier] {stack} loaded in {load_s:.1f}s")

    done = skipped = failed = 0
    gen_times: list[float] = []
    realized_all: list[int] = []
    since_commit = 0
    for row in rows:
        sid = safe_image_id(row["image_id"])
        md_path = out_dir / f"{sid}.md"
        if md_path.exists():
            skipped += 1
            continue
        try:
            t0 = time.monotonic()
            markdown, realized = generate_one(corpus / row["image_path"])
            gen_s = time.monotonic() - t0
            n_out = count_output_tokens(markdown)
            md_path.write_text(markdown, encoding="utf-8")
            with open(meta_path, "a") as mf:
                mf.write(json.dumps({
                    "image_id": row["image_id"],
                    "realized_tokens": realized,
                    "gen_s": round(gen_s, 3),
                    "n_output_tokens": n_out,
                }) + "\n")
            gen_times.append(gen_s)
            realized_all.append(realized)
            done += 1
            print(f"[frontier] {sid}: realized={realized} gen_s={gen_s:.1f} "
                  f"n_out={n_out}")
        except Exception as exc:  # noqa: BLE001 — per-image isolation, as in the pilot
            failed += 1
            with open(errors_path, "a") as ef:
                ef.write(json.dumps({
                    "image_id": row["image_id"],
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                }) + "\n")
            print(f"[frontier] FAIL {sid}: {exc!r}")
        since_commit += 1
        if since_commit >= 10:
            data_volume.commit()
            since_commit = 0

    data_volume.commit()
    realized_sorted = sorted(realized_all)
    stats = {
        "stack": stack,
        "budget": budget,
        "shard": shard,
        "nshards": nshards,
        "done": done,
        "skipped": skipped,
        "failed": failed,
        "load_s": round(load_s, 1),
        "mean_gen_s": round(sum(gen_times) / len(gen_times), 2) if gen_times else None,
        "realized_tokens": (
            {
                "min": realized_sorted[0],
                "median": realized_sorted[len(realized_sorted) // 2],
                "max": realized_sorted[-1],
            }
            if realized_sorted
            else None
        ),
    }
    print(f"[frontier] {json.dumps(stats)}")
    return stats


@app.function(
    image=qwen_image,
    gpu=GPU,
    timeout=3600 * 4,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def generate_markdown_qwen3_vl(
    stack: str = "qwen3_vl",
    budget: int = 0,
    shard: int = 0,
    nshards: int = 1,
    images_subpath: str = "images_modal.jsonl",
    limit: int = 0,
) -> dict:
    """qwen3_vl arm of generate_markdown (see module docstring for the split)."""
    assert stack == "qwen3_vl", f"this function serves qwen3_vl, got {stack!r}"
    assert budget > 0, "budget (target vision tokens) is required"

    def load_stack():
        import torch
        from PIL import Image
        from transformers import AutoModelForImageTextToText, AutoProcessor

        from encoder_experiments.adapters.qwen_vit import Qwen35Vit
        from encoder_experiments.budgets import budget_knobs

        max_pixels = int(budget_knobs("qwen3_vl_vit", budget)["max_pixels"])
        processor = AutoProcessor.from_pretrained(QWEN_CHECKPOINT)
        # The Exp 2 lesson, reused verbatim: sets every pixel knob the
        # processor generation exposes and returns the per-call kwargs
        # (including the `size` dict — the channel transformers 5.14 honors).
        budget_kwargs = Qwen35Vit._apply_pixel_budget(
            processor.image_processor, 0, max_pixels
        )
        model = AutoModelForImageTextToText.from_pretrained(
            QWEN_CHECKPOINT, dtype=torch.bfloat16, device_map="cuda"
        ).eval()
        merge = int(getattr(model.config.vision_config, "spatial_merge_size", 2))

        messages = [{
            "role": "user",
            "content": [{"type": "image"}, {"type": "text", "text": QWEN_PROMPT}],
        }]
        chat_text = processor.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )

        def generate_one(image_path) -> tuple[str, int]:
            image = Image.open(image_path).convert("RGB")
            kwargs = dict(budget_kwargs)
            while True:
                try:
                    inputs = processor(
                        text=[chat_text], images=[image], return_tensors="pt", **kwargs
                    )
                    break
                except TypeError:
                    # Strip rejected kwargs one channel at a time (size -> bare
                    # pixel kwargs -> none); the realized guard below fails
                    # loudly if no surviving channel carried the budget.
                    if "size" in kwargs:
                        kwargs.pop("size")
                    elif kwargs:
                        kwargs = {}
                    else:
                        raise
            t, h, w = (int(x) for x in inputs["image_grid_thw"][0])
            realized = t * (h // merge) * (w // merge)
            if realized > budget:
                raise RuntimeError(
                    f"budget overrun: realized {realized} merged tokens > "
                    f"budget {budget} — pixel knob did not take"
                )
            inputs = inputs.to("cuda")
            with torch.inference_mode():
                out = model.generate(
                    **inputs, do_sample=False, max_new_tokens=QWEN_MAX_NEW_TOKENS
                )
            new_tokens = out[0][inputs["input_ids"].shape[1]:]
            markdown = processor.decode(new_tokens, skip_special_tokens=True).strip()
            return markdown, realized

        def count_output_tokens(text: str) -> int:
            return len(processor.tokenizer(text, add_special_tokens=False)["input_ids"])

        return generate_one, count_output_tokens

    return _run_generation_loop(
        stack, budget, shard, nshards, images_subpath, limit, load_stack
    )


@app.function(
    image=dsocr_image,
    gpu=GPU,
    timeout=3600 * 4,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def generate_markdown_deepseek_ocr(
    stack: str = "deepseek_ocr",
    budget: int = 0,
    shard: int = 0,
    nshards: int = 1,
    images_subpath: str = "images_modal.jsonl",
    limit: int = 0,
) -> dict:
    """deepseek_ocr arm of generate_markdown (see module docstring for the split)."""
    assert stack == "deepseek_ocr", f"this function serves deepseek_ocr, got {stack!r}"
    assert budget > 0, "budget (target vision tokens) is required"

    def load_stack():
        import torch
        from transformers import AutoModel, AutoTokenizer

        from encoder_experiments.budgets import DEEPSEEK_BASE_SIZE

        base_size = DEEPSEEK_BASE_SIZE[budget]  # entrypoint validated the rung
        tokenizer = AutoTokenizer.from_pretrained(DSOCR_CHECKPOINT, trust_remote_code=True)
        model = AutoModel.from_pretrained(
            DSOCR_CHECKPOINT,
            trust_remote_code=True,
            use_safetensors=True,
            _attn_implementation="eager",  # no flash-attn in this image
        )
        model = model.eval().cuda().to(torch.bfloat16)
        scratch = "/root/dsocr_out"  # infer() makedirs it; eval_mode writes nothing

        def generate_one(image_path) -> tuple[str, int]:
            # Global view only: crop_mode=False, image_size == base_size, so the
            # vision grid is exactly (base_size/64)^2 == budget content tokens
            # (infer() adds one row-separator image token per row on top; the
            # content grid is what we log as realized).
            markdown = model.infer(
                tokenizer,
                prompt=DSOCR_PROMPT,
                image_file=str(image_path),
                output_path=scratch,
                base_size=base_size,
                image_size=base_size,
                crop_mode=False,
                eval_mode=True,  # returns the decoded text, no streamer
            )
            return markdown.strip(), (base_size // 64) ** 2

        def count_output_tokens(text: str) -> int:
            return len(tokenizer.encode(text, add_special_tokens=False))

        return generate_one, count_output_tokens

    return _run_generation_loop(
        stack, budget, shard, nshards, images_subpath, limit, load_stack
    )


STACK_FUNCTIONS = {
    "qwen3_vl": generate_markdown_qwen3_vl,
    "deepseek_ocr": generate_markdown_deepseek_ocr,
}
# Budget validation reuses budgets.budget_knobs via the tower each stack serves.
STACK_TOWER = {"qwen3_vl": "qwen3_vl_vit", "deepseek_ocr": "deepseek_ocr"}


@app.local_entrypoint()
def main(
    stacks: str = "qwen3_vl,deepseek_ocr",
    budget: str = "196,400,784",
    shards: int = 1,
    images_subpath: str = "images_modal.jsonl",
    limit: int = 0,
):
    """Fan generate_markdown out over (stack x budget x shard). Rungs a stack
    cannot realize (deepseek_ocr above 400) are skipped with a note. --limit N
    caps the manifest for smoke runs."""
    from encoder_experiments.budgets import budget_knobs  # local venv has the pkg

    budgets = [int(b) for b in budget.split(",") if b.strip()]
    if not budgets:
        raise SystemExit("--budget needs at least one target token count")

    jobs = []  # (label, function_call handle)
    for stack in [s.strip() for s in stacks.split(",") if s.strip()]:
        if stack not in STACK_FUNCTIONS:
            raise SystemExit(f"unknown stack {stack!r}; known: {sorted(STACK_FUNCTIONS)}")
        for b in budgets:
            try:  # validate the (stack, rung) pair before spending a GPU on it
                budget_knobs(STACK_TOWER[stack], b)
            except ValueError as exc:
                print(f"[skip] {stack}@{b}: {exc}")
                continue
            for shard in range(shards):
                handle = STACK_FUNCTIONS[stack].spawn(
                    stack=stack,
                    budget=b,
                    shard=shard,
                    nshards=shards,
                    images_subpath=images_subpath,
                    limit=limit,
                )
                jobs.append((f"{stack}@{b} shard {shard}", handle))

    print(f"[modal_frontier] launched {len(jobs)} jobs (gpu={GPU})")
    ok = 0
    for label, handle in jobs:
        try:
            res = handle.get()
        except Exception as exc:  # noqa: BLE001 — report per-job, keep collecting
            print(f"[FAIL] {label}: {type(exc).__name__}: {exc}")
            continue
        ok += 1
        print(f"[ok]   {label}: done={res['done']} skipped={res['skipped']} "
              f"failed={res['failed']} load_s={res['load_s']} "
              f"mean_gen_s={res['mean_gen_s']} realized={res['realized_tokens']}")
    print(f"[modal_frontier] {ok}/{len(jobs)} jobs succeeded")
