"""Volume-bypass variant of modal_frontier generation: generate markdown for an
explicit list of image_ids and RETURN {image_id: {md, realized, gen_s}} to the
client instead of writing /vol/frontier (the shared volume's frontier dirs are
being concurrently rewritten by another full-corpus run, so volume outputs are
unreliable right now). Corpus images are read-only from /vol/corpus.

Same stacks/knobs as modal_frontier.py (see its docstring): qwen3_vl budget via
processor pixel budget; deepseek_ocr global view via DEEPSEEK_BASE_SIZE.
"""
from __future__ import annotations

import os

import modal

APP_NAME = "encoder-anatomy-frontier-ret"
VOL_PATH = "/vol"
HF_CACHE_PATH = "/hf_cache"
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
        "torch", "torchvision", "transformers>=5.14,<5.15", "accelerate",
        "safetensors", "pillow", "numpy", "tqdm",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)
dsocr_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.6.0", "torchvision==0.21.0", "transformers==4.46.3",
        "tokenizers==0.20.3", "safetensors", "pillow", "numpy", "tqdm",
        "einops", "easydict", "addict", "matplotlib", "requests",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)


def _strip_md_fence(text: str) -> str:  # same rule as modal_frontier.py
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    first_nl = stripped.find("\n")
    if first_nl == -1:
        return stripped
    tag = stripped[3:first_nl].strip().lower()
    if tag not in ("", "markdown", "md"):
        return stripped
    body = stripped[first_nl + 1:]
    if body.rstrip().endswith("```"):
        return body.rstrip()[:-3].strip()
    if tag:
        return body.strip()
    return stripped


def _emit_payload(cfg: str, image_id: str, md: str, realized: int, gen_s: float) -> None:
    """Stream the result into Modal's server-side logs as base64 chunks —
    retrievable later via `modal app logs` regardless of client fate."""
    import base64
    import json as _json

    b64 = base64.b64encode(md.encode("utf-8")).decode("ascii")
    chunks = [b64[i:i + 3000] for i in range(0, len(b64), 3000)] or [""]
    for seq, chunk in enumerate(chunks):
        print(f"PAYB64\t{cfg}\t{image_id}\t{seq}\t{chunk}", flush=True)
    print("PAYEND\t" + _json.dumps({"cfg": cfg, "image_id": image_id,
                                    "nchunks": len(chunks), "realized": realized,
                                    "gen_s": round(gen_s, 3)}), flush=True)


def _rows_for(image_ids: list[str]) -> list[dict]:
    import json
    from pathlib import Path

    data_volume.reload()
    manifest = Path(VOL_PATH) / "corpus" / "images_modal.jsonl"
    rows = {r["image_id"]: r for r in
            (json.loads(l) for l in manifest.read_text().splitlines() if l.strip())}
    return [rows[i] for i in image_ids]


@app.function(image=qwen_image, gpu=GPU, timeout=3600 * 2,
              volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume})
def gen_qwen(budget: int, image_ids: list[str]) -> dict:
    import time
    from pathlib import Path

    import torch
    from PIL import Image
    from transformers import AutoModelForImageTextToText, AutoProcessor

    from encoder_experiments.adapters.qwen_vit import Qwen35Vit
    from encoder_experiments.budgets import budget_knobs

    rows = _rows_for(image_ids)
    max_pixels = int(budget_knobs("qwen3_vl_vit", budget)["max_pixels"])
    processor = AutoProcessor.from_pretrained(QWEN_CHECKPOINT)
    budget_kwargs = Qwen35Vit._apply_pixel_budget(processor.image_processor, 0, max_pixels)
    model = AutoModelForImageTextToText.from_pretrained(
        QWEN_CHECKPOINT, dtype=torch.bfloat16, device_map="cuda").eval()
    merge = int(getattr(model.config.vision_config, "spatial_merge_size", 2))
    messages = [{"role": "user", "content": [
        {"type": "image"}, {"type": "text", "text": QWEN_PROMPT}]}]
    chat_text = processor.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=False)

    out: dict[str, dict] = {}
    for row in rows:
        image = Image.open(Path(VOL_PATH) / "corpus" / row["image_path"]).convert("RGB")
        kwargs = dict(budget_kwargs)
        while True:
            try:
                inputs = processor(text=[chat_text], images=[image],
                                   return_tensors="pt", **kwargs)
                break
            except TypeError:
                if "size" in kwargs:
                    kwargs.pop("size")
                elif kwargs:
                    kwargs = {}
                else:
                    raise
        t, h, w = (int(x) for x in inputs["image_grid_thw"][0])
        realized = t * (h // merge) * (w // merge)
        if realized > budget:
            raise RuntimeError(f"budget overrun: {realized} > {budget}")
        inputs = inputs.to("cuda")
        t0 = time.monotonic()
        with torch.inference_mode():
            gen = model.generate(**inputs, do_sample=False,
                                 max_new_tokens=QWEN_MAX_NEW_TOKENS)
        gen_s = time.monotonic() - t0
        new_tokens = gen[0][inputs["input_ids"].shape[1]:]
        md = processor.decode(new_tokens, skip_special_tokens=True).strip()
        md = _strip_md_fence(md)
        out[row["image_id"]] = {"md": md,
                                "realized": realized, "gen_s": round(gen_s, 3)}
        _emit_payload(f"qwen3_vl@{budget}", row["image_id"], md, realized, gen_s)
    return out


@app.function(image=dsocr_image, gpu=GPU, timeout=3600 * 2,
              volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume})
def gen_dsocr(budget: int, image_ids: list[str]) -> dict:
    import time
    from pathlib import Path

    import torch
    from transformers import AutoModel, AutoTokenizer

    from encoder_experiments.budgets import DEEPSEEK_BASE_SIZE

    rows = _rows_for(image_ids)
    base_size = DEEPSEEK_BASE_SIZE[budget]
    tokenizer = AutoTokenizer.from_pretrained(DSOCR_CHECKPOINT, trust_remote_code=True)
    model = AutoModel.from_pretrained(DSOCR_CHECKPOINT, trust_remote_code=True,
                                      use_safetensors=True, _attn_implementation="eager")
    model = model.eval().cuda().to(torch.bfloat16)
    out: dict[str, dict] = {}
    for row in rows:
        t0 = time.monotonic()
        md = model.infer(tokenizer, prompt=DSOCR_PROMPT,
                         image_file=str(Path(VOL_PATH) / "corpus" / row["image_path"]),
                         output_path="/root/dsocr_out", base_size=base_size,
                         image_size=base_size, crop_mode=False, eval_mode=True)
        gen_s = time.monotonic() - t0
        md = md.strip()
        out[row["image_id"]] = {"md": md,
                                "realized": (base_size // 64) ** 2,
                                "gen_s": round(gen_s, 3)}
        _emit_payload(f"deepseek_ocr@{budget}", row["image_id"], md,
                      (base_size // 64) ** 2, gen_s)
    return out


@app.local_entrypoint()
def main(missing_json: str, dest: str):
    """missing_json: {"qwen3_vl@196": [ids...], "qwen3_vl@784": [...],
    "deepseek_ocr@256": [...]}; writes <dest>/<config>/<id>.md + meta."""
    import json
    from pathlib import Path

    missing = json.loads(Path(missing_json).read_text())
    calls = []
    for cfg, ids in missing.items():
        if not ids:
            continue
        stack, budget = cfg.split("@")
        fn = gen_qwen if stack == "qwen3_vl" else gen_dsocr
        calls.append((cfg, fn.spawn(int(budget), ids)))
    root = Path(dest).resolve()
    print(f"[gen_return] dest resolved to {root}")
    payload = {}
    for cfg, handle in calls:
        res = handle.get()
        payload[cfg] = res
        d = root / cfg
        d.mkdir(parents=True, exist_ok=True)
        meta = []
        for image_id, r in res.items():
            (d / f"{image_id}.md").write_text(r["md"], encoding="utf-8")
            meta.append({"image_id": image_id, "realized_tokens": r["realized"],
                         "gen_s": r["gen_s"]})
        with (d / "meta.ret.jsonl").open("w") as f:
            for m in meta:
                f.write(json.dumps(m) + "\n")
        print(f"[gen_return] {cfg}: wrote {len(res)} files")
    # Belt-and-suspenders: also emit everything to stdout so the caller can
    # reconstruct the files from the captured log if dest evaporates.
    print("===GEN_RETURN_PAYLOAD_BEGIN===")
    print(json.dumps(payload, ensure_ascii=False))
    print("===GEN_RETURN_PAYLOAD_END===")
