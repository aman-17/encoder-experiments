"""B1 activation patching on Modal (phase-b-causal.md §B1): causal localization
of the degradation reading loss in the Qwen3.5-4B stack, inference-only.

Per twin pair (clean/degraded at IDENTICAL pixel dims -> identical token
grids; built by src/data/make_b1_twins.py), six greedy full-stack
transcriptions with the fixed prompt below:

    anchor             clean forward
    floor              degraded forward
    patch_s2           degraded + clean inputs_embeds at the image positions
                       (forward pre-hook on decoder layer 0's input) during
                       prefill; the KV cache carries the patch into generation
    patch_s3           degraded + clean layer-floor(n/2) input hidden states at
                       the image positions during prefill (same tensor
                       modal_extract.extract_decoder_mid captures for S3)
    control_mismatch   degraded + a MISMATCHED same-dims page's clean S2 patch
                       (pre-registered: must NOT restore)
    control_selfpatch  clean + its own clean S2 patch (pre-registered: must be
                       a no-op; raw output compared token-for-token, recorded
                       as selfpatch_identical)

Model loading follows modal_extract.extract_decoder_mid (Qwen/Qwen3.5-4B,
trust_remote_code, AutoProcessor + the generation-capable auto class, same
deepstack/image_token_id guards); generation is bf16 like modal_frontier
(served regime — the fp32 contract only binds probe-feature extraction).

Outputs, resume-safe (existing .md files are skipped):
    /vol/patch_b1/<condition>/<image_id>.md
    /vol/patch_b1/<condition>/meta.shard<k>.jsonl
    /vol/patch_b1/errors.shard<k>.jsonl

Prereqs on the encoder-anatomy-pilot volume (see make_b1_twins.py docstring):
    /corpus/images_twins_b1_modal.jsonl, /corpus/images/degraded_b1/, and the
    clean images already at /corpus/images/clean/.

Run (100 pairs x 6 conditions; ~4 shards keeps a shard well under the
timeout even at worst-case gen times):

    uv run modal run --detach modal_patch.py --shards 4

Smoke:

    uv run modal run modal_patch.py --limit 2

Fetch for scoring (run_b1_patching.py):

    uv run modal volume get encoder-anatomy-pilot /patch_b1 <local dir>
"""

from __future__ import annotations

import os

import modal

APP_NAME = "encoder-anatomy-patch"
VOL_PATH = "/vol"
HF_CACHE_PATH = "/hf_cache"
GPU = os.environ.get("PATCH_GPU", "L40S")
OUT_SUBDIR = "patch_b1"

CHECKPOINT = "Qwen/Qwen3.5-4B"
PROMPT = "Transcribe this document to markdown."  # = modal_extract.DECODER_MID_PROMPT
MAX_NEW_TOKENS = 4096

app = modal.App(APP_NAME)

data_volume = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "torch",
        "torchvision",
        "transformers>=5.14,<5.15",  # same pin as modal_extract.py / modal_frontier.py
        "accelerate",
        "safetensors",
        "pillow",
        "numpy",
        "tqdm",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)


@app.function(
    image=image,
    gpu=GPU,
    timeout=3600 * 12,  # 25 pairs/shard x 6 gens x worst ~200 s/gen << 12 h
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def patch_shard(
    shard: int = 0,
    nshards: int = 1,
    twins_subpath: str = "images_twins_b1_modal.jsonl",
    checkpoint: str = CHECKPOINT,
    limit: int = 0,
    overwrite: bool = False,
) -> dict:
    import json
    import time
    import traceback
    from pathlib import Path

    import torch
    from PIL import Image
    from transformers import AutoModelForImageTextToText, AutoProcessor

    from encoder_experiments.extract import safe_image_id
    from encoder_experiments.patching import (
        CONDITIONS,
        PrefillCapture,
        PrefillPatch,
        find_decoder_layers,
        image_token_positions,
        partner_map,
        strip_md_fence,
    )

    data_volume.reload()

    corpus = Path(VOL_PATH) / "corpus"
    manifest = corpus / twins_subpath
    if not manifest.exists():
        raise FileNotFoundError(
            f"{manifest} not found — build with src/data/make_b1_twins.py and "
            f"`modal volume put` it (see make_b1_twins.py docstring)"
        )
    rows = [json.loads(ln) for ln in manifest.read_text().splitlines() if ln.strip()]
    if limit:
        rows = rows[:limit]
    rows = rows[shard::nshards]
    partners = partner_map(
        [(r["image_id"], (int(r["page_w_px"]), int(r["page_h_px"]))) for r in rows]
    )
    by_id = {r["image_id"]: r for r in rows}

    out_root = Path(VOL_PATH) / OUT_SUBDIR
    for cond in CONDITIONS:
        (out_root / cond).mkdir(parents=True, exist_ok=True)
    errors_path = out_root / f"errors.shard{shard}.jsonl"

    t_load = time.monotonic()
    processor = AutoProcessor.from_pretrained(checkpoint, trust_remote_code=True)
    model = AutoModelForImageTextToText.from_pretrained(
        checkpoint, trust_remote_code=True, dtype=torch.bfloat16, device_map="cuda"
    ).eval()
    # Same stack guards as extract_decoder_mid: a DeepStack checkpoint injects
    # vision features at several layers, so a single-site patch would be
    # incomplete; and the patch needs the image placeholder id to find its
    # target positions.
    deepstack = list(getattr(model.config.vision_config, "deepstack_visual_indexes", []) or [])
    if deepstack:
        raise RuntimeError(
            f"{checkpoint}: deepstack_visual_indexes={deepstack} — plural bridges; "
            "single-site S2/S3 patching does not cover DeepStack paths"
        )
    image_token_id = getattr(model.config, "image_token_id", None)
    if image_token_id is None:
        raise RuntimeError(f"{checkpoint}: config has no image_token_id")
    merge = int(model.config.vision_config.spatial_merge_size)
    n_layers = int(model.config.text_config.num_hidden_layers)
    layers = find_decoder_layers(model, n_layers)
    mid = n_layers // 2
    print(f"[patch] loaded {checkpoint} in {time.monotonic() - t_load:.1f}s "
          f"(layers={n_layers}, sites: S2=layer0-input, S3=layer{mid}-input)")

    chat_text = processor.apply_chat_template(
        [{"role": "user",
          "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}],
        add_generation_prompt=True, tokenize=False,
    )

    def encode(image_rel: str):
        img = Image.open(corpus / image_rel).convert("RGB")
        inputs = processor(text=[chat_text], images=[img], return_tensors="pt")
        t, h, w = (int(x) for x in inputs["image_grid_thw"][0])
        pos = image_token_positions(inputs["input_ids"][0], image_token_id)
        n_img = pos.numel()
        assert t == 1 and n_img == (h // merge) * (w // merge), (
            f"{image_rel}: {n_img} image tokens vs thw={(t, h, w)} merge={merge}"
        )
        return inputs.to("cuda"), pos, n_img

    def generate(inputs, hooked=()) -> tuple[str, str, int]:
        """(raw_decoded, fence_stripped, n_prefill_patches). `hooked` is
        [(layer, payload)]; hooks are removed even on failure."""
        handles = [layer.register_forward_pre_hook(p.hook, with_kwargs=True)
                   for layer, p in hooked]
        try:
            with torch.inference_mode():
                out = model.generate(**inputs, do_sample=False,
                                     max_new_tokens=MAX_NEW_TOKENS)
        finally:
            for h in handles:
                h.remove()
        raw = processor.decode(
            out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
        ).strip()
        applied = sum(p.n_applied for _, p in hooked if isinstance(p, PrefillPatch))
        return raw, strip_md_fence(raw), applied

    def capture_clean(inputs, pos):
        """Prefill-only forward with capture hooks -> (s2, s3) at image positions."""
        c2, c3 = PrefillCapture(pos), PrefillCapture(pos)
        handles = [layers[0].register_forward_pre_hook(c2.hook, with_kwargs=True),
                   layers[mid].register_forward_pre_hook(c3.hook, with_kwargs=True)]
        try:
            with torch.inference_mode():
                model(**inputs)
        finally:
            for h in handles:
                h.remove()
        assert c2.value is not None and c3.value is not None, "capture hooks never fired"
        return c2.value, c3.value

    def write_result(cond, sid, image_id, md, extra):
        (out_root / cond / f"{sid}.md").write_text(md, encoding="utf-8")
        with open(out_root / cond / f"meta.shard{shard}.jsonl", "a") as mf:
            mf.write(json.dumps({"image_id": image_id, "condition": cond, **extra}) + "\n")

    def n_out(text: str) -> int:
        return len(processor.tokenizer(text, add_special_tokens=False)["input_ids"])

    done = skipped = failed = 0
    since_commit = 0
    for row in rows:
        sid = safe_image_id(row["image_id"])
        need = [c for c in CONDITIONS
                if overwrite or not (out_root / c / f"{sid}.md").exists()]
        if not need:
            skipped += 1
            continue
        try:
            inputs_clean, pos, n_img = encode(row["clean_path"])
            inputs_deg, pos_d, n_img_d = encode(row["degraded_path"])
            assert torch.equal(inputs_clean["input_ids"], inputs_deg["input_ids"]), (
                f"{row['image_id']}: clean/degraded token sequences differ — twins "
                "are not grid-aligned"
            )
            assert torch.equal(pos, pos_d) and n_img == n_img_d

            s2 = s3 = None
            raws: dict[str, str] = {}
            if {"patch_s2", "patch_s3", "control_selfpatch"} & set(need) or "anchor" in need:
                s2, s3 = capture_clean(inputs_clean, pos)

            for cond in need:
                t0 = time.monotonic()
                extra: dict = {"realized_tokens": n_img}
                if cond == "anchor":
                    raw, md, _ = generate(inputs_clean)
                elif cond == "floor":
                    raw, md, _ = generate(inputs_deg)
                elif cond == "patch_s2":
                    raw, md, n_ap = generate(
                        inputs_deg, [(layers[0], PrefillPatch(pos, s2))])
                    extra["n_patches_applied"] = n_ap
                elif cond == "patch_s3":
                    raw, md, n_ap = generate(
                        inputs_deg, [(layers[mid], PrefillPatch(pos, s3))])
                    extra["n_patches_applied"] = n_ap
                elif cond == "control_selfpatch":
                    raw, md, n_ap = generate(
                        inputs_clean, [(layers[0], PrefillPatch(pos, s2))])
                    extra["n_patches_applied"] = n_ap
                    anchor_raw = raws.get("anchor")
                    extra["selfpatch_identical"] = (
                        None if anchor_raw is None else raw == anchor_raw
                    )
                elif cond == "control_mismatch":
                    partner_id = partners.get(row["image_id"])
                    if partner_id is None:
                        with open(out_root / cond / f"meta.shard{shard}.jsonl", "a") as mf:
                            mf.write(json.dumps({
                                "image_id": row["image_id"], "condition": cond,
                                "skipped": "no_same_dims_partner"}) + "\n")
                        continue
                    p_inputs, p_pos, p_n = encode(by_id[partner_id]["clean_path"])
                    assert p_n == n_img and torch.equal(p_pos, pos), (
                        f"{row['image_id']}: partner {partner_id} grid mismatch"
                    )
                    p_s2, _ = capture_clean(p_inputs, p_pos)
                    raw, md, n_ap = generate(
                        inputs_deg, [(layers[0], PrefillPatch(pos, p_s2))])
                    extra["n_patches_applied"] = n_ap
                    extra["partner_id"] = partner_id
                raws[cond] = raw
                extra["gen_s"] = round(time.monotonic() - t0, 3)
                extra["n_output_tokens"] = n_out(md)
                write_result(cond, sid, row["image_id"], md, extra)
                print(f"[patch] {sid} {cond}: gen_s={extra['gen_s']} "
                      f"n_out={extra['n_output_tokens']}")
            done += 1
        except Exception as exc:  # noqa: BLE001 — per-pair isolation
            failed += 1
            with open(errors_path, "a") as ef:
                ef.write(json.dumps({
                    "image_id": row["image_id"],
                    "error": repr(exc),
                    "traceback": traceback.format_exc(),
                }) + "\n")
            print(f"[patch] FAIL {sid}: {exc!r}")
        since_commit += 1
        if since_commit >= 2:
            data_volume.commit()
            since_commit = 0

    data_volume.commit()
    stats = {"shard": shard, "nshards": nshards, "pairs": len(rows),
             "done": done, "skipped": skipped, "failed": failed}
    print(f"[patch] {json.dumps(stats)}")
    return stats


@app.local_entrypoint()
def main(
    shards: int = 1,
    twins_subpath: str = "images_twins_b1_modal.jsonl",
    checkpoint: str = CHECKPOINT,
    limit: int = 0,
    overwrite: bool = False,
):
    handles = [
        patch_shard.spawn(
            shard=s, nshards=shards, twins_subpath=twins_subpath,
            checkpoint=checkpoint, limit=limit, overwrite=overwrite,
        )
        for s in range(shards)
    ]
    print(f"[modal_patch] launched {len(handles)} shard(s) (gpu={GPU})")
    ok = 0
    for s, h in enumerate(handles):
        try:
            res = h.get()
        except Exception as exc:  # noqa: BLE001 — report per-shard
            print(f"[FAIL] shard {s}: {type(exc).__name__}: {exc}")
            continue
        ok += 1
        print(f"[ok]   shard {s}: {res}")
    print(f"[modal_patch] {ok}/{len(handles)} shards succeeded")
