"""Exp 2a gate — GPU site sanity on 5 pilot images (one-shot Modal check).

Checks, per exp2a gate spec:
  (a) site=premerge emits merge^2 = 4x the merged token count, on the 2x
      pre-merge grid, and the tensors are genuinely distinct (children within
      a merged cell differ from each other; not constant copies);
  (b) site=postmerge re-encode is BYTE-IDENTICAL to the existing caches
      (native full-grid /vol/features/qwen35_vit AND the @<budget> sites
      cache under /vol/features_sweep) — the site knob must not perturb the
      default path;
  (c) decoder_mid produces finite features at every image-token position with
      the correct grid mapping — spot-checked by grid-neighborhood cosine
      consistency at one probe point (neighbors of the point's cell must be
      more similar than random far-away tokens).

    uv run modal run gate2a_sanity.py --n-images 5 --budget 400
"""

from __future__ import annotations

import modal

# Self-contained mirror of modal_extract.py's app plumbing: that module is a
# local entrypoint script, not part of the shipped `encoder_experiments`
# source, so importing it inside the container crash-loops.
VOL_PATH = "/vol"
HF_CACHE_PATH = "/hf_cache"
DECODER_MID_PROMPT = "Transcribe this document to markdown."  # = modal_extract.DECODER_MID_PROMPT

app = modal.App("encoder-anatomy-gate2a")

data_volume = modal.Volume.from_name("encoder-anatomy-pilot", create_if_missing=False)
hf_cache_volume = modal.Volume.from_name("ocr-rl-trainer-hf-cache-0", create_if_missing=False)

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "torch",
        "torchvision",
        "transformers>=5.14,<5.15",  # pinned to the cache-writing runs' pin
        "safetensors",
        "pymupdf",
        "pillow",
        "numpy",
        "scikit-learn",
        "tqdm",
        "accelerate",
        "einops",
        "easydict",
    )
    .env({"HF_HOME": HF_CACHE_PATH})
    .add_local_python_source("encoder_experiments")
)


@app.function(
    image=image,
    gpu="L40S",
    timeout=3600,
    volumes={VOL_PATH: data_volume, HF_CACHE_PATH: hf_cache_volume},
)
def site_sanity(
    images_subpath: str = "images_smoke2a.jsonl",
    probes_subpath: str = "probes_smoke2a.jsonl",
    n_images: int = 5,
    budget: int = 400,
    n_decoder_images: int = 2,
) -> dict:
    import gc
    import json
    from pathlib import Path

    import torch
    from PIL import Image
    from safetensors import safe_open

    from encoder_experiments.budgets import QWEN_PIXELS_PER_TOKEN
    from encoder_experiments.extract import read_manifest, safe_image_id
    from encoder_experiments.registry import build
    from encoder_experiments.site_store import SITES_SUFFIX, load_site_manifest
    from encoder_experiments.sites import features_at

    data_volume.reload()
    corpus = Path(VOL_PATH) / "corpus"
    rows = read_manifest(corpus / images_subpath, limit=n_images)
    site_specs = load_site_manifest(corpus / probes_subpath)["images"]
    device = torch.device("cuda")
    dtype = torch.float32  # cache parity requires the cache's compute dtype
    report: dict = {"images": [r["image_id"] for r in rows], "budget": budget}

    def encode_all(adapter_args):
        adapter = build("qwen35_vit", device, dtype, adapter_args=adapter_args)
        adapter.load()
        out = {}
        with torch.inference_mode():
            for r in rows:
                img = Image.open(corpus / r["image_path"]).convert("RGB")
                out[r["image_id"]] = adapter.encode(img)
        merge = adapter.merge
        del adapter
        gc.collect()
        torch.cuda.empty_cache()
        return out, merge

    # ---- postmerge native: byte parity vs /vol/features/qwen35_vit ---------
    native, _ = encode_all({})
    parity_native = []
    for r in rows:
        iid = r["image_id"]
        stored = Path(VOL_PATH) / "features" / "qwen35_vit" / (
            safe_image_id(iid) + ".safetensors"
        )
        feats = native[iid]
        fresh16 = feats.tokens.detach().to("cpu", torch.float16)
        with safe_open(stored, framework="pt", device="cpu") as f:
            cached = f.get_tensor("tokens")
            meta = f.metadata()
        entry = {
            "image_id": iid,
            "fresh_shape": list(fresh16.shape),
            "cached_shape": list(cached.shape),
            "grid_fresh": list(feats.grid_hw),
            "grid_cached": [int(meta["grid_h"]), int(meta["grid_w"])],
        }
        if fresh16.shape == cached.shape:
            entry["byte_identical"] = bool(torch.equal(fresh16, cached))
            if not entry["byte_identical"]:
                entry["max_abs_diff"] = float(
                    (fresh16.float() - cached.float()).abs().max()
                )
        else:
            entry["byte_identical"] = False
        parity_native.append(entry)
    del native
    gc.collect()

    # ---- premerge vs postmerge at the smoke budget -------------------------
    knob = {"max_pixels": str(budget * QWEN_PIXELS_PER_TOKEN)}
    post, merge = encode_all(knob)
    pre, _ = encode_all({**knob, "site": "premerge"})
    site_pairs = []
    for r in rows:
        iid = r["image_id"]
        fp, fq = pre[iid], post[iid]
        hp, wp = fp.grid_hw
        hq, wq = fq.grid_hw
        d = fp.tokens.shape[1]
        grid = fp.tokens.reshape(hp // merge, merge, wp // merge, merge, d).permute(
            0, 2, 1, 3, 4
        ).reshape(hq, wq, merge * merge, d)  # children per merged cell
        # distinctness of the 4 children within each merged cell
        c = grid.reshape(-1, merge * merge, d)
        pair_eq = 0
        for a in range(merge * merge):
            for b in range(a + 1, merge * merge):
                pair_eq += int(torch.isclose(c[:, a], c[:, b]).all(dim=1).sum())
        site_pairs.append({
            "image_id": iid,
            "premerge_tokens": int(fp.tokens.shape[0]),
            "postmerge_tokens": int(fq.tokens.shape[0]),
            "ratio": fp.tokens.shape[0] / fq.tokens.shape[0],
            "grid_premerge": [hp, wp],
            "grid_postmerge": [hq, wq],
            "d_premerge": int(d),
            "d_postmerge": int(fq.tokens.shape[1]),
            "n_merged_cells": int(c.shape[0]),
            "n_cells_with_identical_child_pair": pair_eq,
            "premerge_token_std_over_grid": float(fp.tokens.float().std()),
        })
        # ---- postmerge@budget sites byte parity vs the sweep cache ---------
        stored = Path(VOL_PATH) / "features_sweep" / f"qwen35_vit@{budget}" / (
            safe_image_id(iid) + SITES_SUFFIX
        )
        with safe_open(stored, framework="pt", device="cpu") as f:
            cached_sites = f.get_tensor("sites")
            cached_points = f.get_tensor("points")
        tokens16 = fq.tokens.detach().to("cpu", torch.float16)
        fresh_sites = features_at(
            tokens16.float(), fq.grid_hw, cached_points
        ).to(torch.float16)
        site_pairs[-1]["sweep_sites_byte_identical"] = bool(
            torch.equal(fresh_sites, cached_sites)
        )
        if not site_pairs[-1]["sweep_sites_byte_identical"]:
            site_pairs[-1]["sweep_sites_max_abs_diff"] = float(
                (fresh_sites.float() - cached_sites.float()).abs().max()
            )
    del pre, post
    gc.collect()
    torch.cuda.empty_cache()

    # ---- decoder_mid: finiteness + grid-neighborhood consistency -----------
    from transformers import AutoModel, AutoProcessor

    checkpoint = "Qwen/Qwen3.5-4B"
    processor = AutoProcessor.from_pretrained(checkpoint, trust_remote_code=True)
    from encoder_experiments.adapters.qwen_vit import Qwen35Vit

    budget_kwargs = Qwen35Vit._apply_pixel_budget(
        processor.image_processor, 0, budget * QWEN_PIXELS_PER_TOKEN
    )
    model = AutoModel.from_pretrained(
        checkpoint, trust_remote_code=True, torch_dtype=torch.float32
    ).eval().to(device)
    image_token_id = model.config.image_token_id
    merge_d = int(model.config.vision_config.spatial_merge_size)
    n_layers = int(model.config.text_config.num_hidden_layers)
    layer = n_layers // 2
    messages = [{
        "role": "user",
        "content": [{"type": "image"}, {"type": "text", "text": DECODER_MID_PROMPT}],
    }]
    prompt_text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    decoder_checks = []
    gen = torch.Generator().manual_seed(0)
    with torch.inference_mode():
        for r in rows[:n_decoder_images]:
            iid = r["image_id"]
            img = Image.open(corpus / r["image_path"]).convert("RGB")
            call_kwargs = dict(budget_kwargs)
            while True:
                try:
                    inputs = processor(
                        text=[prompt_text], images=[img],
                        return_tensors="pt", **call_kwargs,
                    )
                    break
                except TypeError:
                    if "size" in call_kwargs:
                        call_kwargs.pop("size")
                    elif call_kwargs:
                        call_kwargs = {}
                    else:
                        raise
            inputs = inputs.to(device)
            out = model(**inputs, output_hidden_states=True, return_dict=True)
            mask = inputs["input_ids"][0] == image_token_id
            t, h, w = (int(x) for x in inputs["image_grid_thw"][0])
            hm, wm = h // merge_d, w // merge_d
            toks = out.hidden_states[layer][0][mask].float().cpu()
            spec = site_specs.get(iid) or site_specs.get(safe_image_id(iid))
            x, y = spec["points"][0]
            i = min(int(y * hm), hm - 1)
            j = min(int(x * wm), wm - 1)
            g = toks.reshape(hm, wm, -1)
            center = g[i, j]
            neigh = [
                g[ii, jj]
                for ii, jj in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1))
                if 0 <= ii < hm and 0 <= jj < wm
            ]
            cos = torch.nn.functional.cosine_similarity
            neigh_cos = [float(cos(center, v, dim=0)) for v in neigh]
            far_cos = []
            for _ in range(200):
                ii = int(torch.randint(hm, (1,), generator=gen))
                jj = int(torch.randint(wm, (1,), generator=gen))
                if abs(ii - i) + abs(jj - j) > 5:
                    far_cos.append(float(cos(center, g[ii, jj], dim=0)))
            decoder_checks.append({
                "image_id": iid,
                "n_image_tokens": int(mask.sum()),
                "grid": [hm, wm],
                "grid_matches_tokens": int(mask.sum()) == hm * wm,
                "layer": layer,
                "n_layers": n_layers,
                "feat_dim": int(toks.shape[1]),
                "finite_fraction": float(torch.isfinite(toks).float().mean()),
                "within_budget": int(mask.sum()) <= budget,
                "point_xy": [x, y],
                "cell_ij": [i, j],
                "neighbor_cos": neigh_cos,
                "mean_neighbor_cos": sum(neigh_cos) / len(neigh_cos),
                "mean_far_cos": sum(far_cos) / len(far_cos),
                "n_far": len(far_cos),
            })

    report["postmerge_native_byte_parity"] = parity_native
    report["premerge_vs_postmerge"] = site_pairs
    report["decoder_mid"] = decoder_checks
    print(json.dumps(report, indent=2))
    return report


@app.local_entrypoint()
def main(
    images_subpath: str = "images_smoke2a.jsonl",
    probes_subpath: str = "probes_smoke2a.jsonl",
    n_images: int = 5,
    budget: int = 400,
):
    import json

    rep = site_sanity.remote(
        images_subpath=images_subpath,
        probes_subpath=probes_subpath,
        n_images=n_images,
        budget=budget,
    )
    print("[gate2a_sanity] final report:")
    print(json.dumps(rep, indent=2))
