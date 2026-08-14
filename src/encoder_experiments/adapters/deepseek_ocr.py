"""P2 — released DeepSeek-OCR DeepEncoder (unmatched probe-only reference).

Wired directly against the checkpoint's own `deepencoder.py` instead of the
full remote-code VLM: `AutoModel.from_pretrained(..., trust_remote_code=True)`
pulls in `modeling_deepseekocr.py`, which needs addict/matplotlib/requests and
instantiates the whole DeepseekV2 MoE LM we would immediately throw away.

The encode path, read straight out of `modeling_deepseekocr.DeepseekOCRModel.
forward` (global view, no crops):

    f1 = sam_model(pixels)                 # SAM-ViT-B + 16x conv compressor -> [B, 1024, 16, 16]
    f2 = vision_model(pixels, f1)          # CLIP-L, patch embeds REPLACED by f1 -> [B, 1+256, 1024]
    tokens = projector(cat(f2[:, 1:], f1.flatten(2).permute(0, 2, 1)))  # [B, 256, 1280]

Preprocessing (from `infer()`): pad to base_size x base_size (1024) with mean
color, normalize mean=std=(0.5, 0.5, 0.5).  We take the global view only —
crop mode is the VLM's tiling policy, not part of the encoder anatomy probe.

Weights come from the checkpoint safetensors filtered to the three module
prefixes; `load()` fails loudly on missing/unexpected keys.

P2 is a reference point, not a trained arm (its training data confounds
everything); nothing downstream blocks on it.

Extra deps beyond the base stack: einops, easydict (imported by deepencoder.py).
"""

from __future__ import annotations

import math

import torch
from PIL import Image, ImageOps

from .base import EncoderAdapter, EncoderFeatures

_PREFIXES = ("model.sam_model.", "model.vision_model.", "model.projector.")


class DeepSeekOcrDeepEncoder(EncoderAdapter):
    name = "deepseek_ocr"
    checkpoint = "deepseek-ai/DeepSeek-OCR"  # override: --adapter-arg checkpoint=...
    pooled_kind = "mean"
    supports_random_init = False

    def load(self) -> None:
        import importlib.util
        import json

        from easydict import EasyDict
        from huggingface_hub import hf_hub_download
        from safetensors import safe_open

        self.checkpoint = self._arg("checkpoint", self.checkpoint)
        self.base_size = self._arg("base_size", 1024)
        if self.base_size % 64 != 0:
            # Grid side is base_size/16 (SAM patches) further /4 by the conv
            # compressor — non-multiples of 64 cannot form a clean token grid.
            raise ValueError(f"base_size must be a multiple of 64, got {self.base_size}")

        # 1) Import the checkpoint's own deepencoder module (torch-only code).
        enc_py = hf_hub_download(self.checkpoint, "deepencoder.py")
        spec = importlib.util.spec_from_file_location("dsocr_deepencoder", enc_py)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        self.sam = mod.build_sam_vit_b()
        self.clip = mod.build_clip_l()
        self.projector = mod.MlpProjector(
            EasyDict(projector_type="linear", input_dim=2048, n_embed=1280)
        )

        # 2) Pull the three submodules' weights out of the checkpoint shards.
        try:
            index = json.load(open(hf_hub_download(self.checkpoint, "model.safetensors.index.json")))
            shards = sorted({
                shard for key, shard in index["weight_map"].items()
                if key.startswith(_PREFIXES)
            })
        except Exception:
            shards = ["model.safetensors"]  # unsharded fallback
        state: dict[str, dict[str, torch.Tensor]] = {"sam": {}, "clip": {}, "projector": {}}
        for shard in shards:
            with safe_open(hf_hub_download(self.checkpoint, shard), framework="pt") as f:
                for key in f.keys():
                    if not key.startswith(_PREFIXES):
                        continue
                    _, module_name, sub = key.split(".", 2)
                    bucket = {"sam_model": "sam", "vision_model": "clip", "projector": "projector"}[module_name]
                    state[bucket][sub] = f.get_tensor(key)

        for module, sd in (
            (self.sam, state["sam"]),
            (self.clip, state["clip"]),
            (self.projector, state["projector"]),
        ):
            missing, unexpected = module.load_state_dict(sd, strict=False)
            # position_ids buffers are registered but not saved; anything else is a wiring bug.
            real_missing = [k for k in missing if not k.endswith("position_ids")]
            if real_missing or unexpected:
                raise RuntimeError(
                    f"{self.checkpoint}: DeepEncoder weight wiring mismatch for "
                    f"{type(module).__name__}: missing={real_missing[:5]} unexpected={list(unexpected)[:5]}"
                )

        for module in (self.sam, self.clip, self.projector):
            module.eval().to(self.device, self.dtype)

    def encode(self, image: Image.Image) -> EncoderFeatures:
        # Global view: pad to square on the mean color, normalize to [-1, 1].
        global_view = ImageOps.pad(
            image.convert("RGB"), (self.base_size, self.base_size), color=(127, 127, 127)
        )
        import numpy as np

        arr = np.asarray(global_view, dtype=np.float32) / 255.0
        pixels = torch.from_numpy(arr).permute(2, 0, 1)
        pixels = ((pixels - 0.5) / 0.5).unsqueeze(0).to(self.device, self.dtype)

        f1 = self.sam(pixels)  # [1, 1024, h, w]
        f2 = self.clip(pixels, f1)  # [1, 1 + h*w, 1024], CLS first
        feats = torch.cat((f2[:, 1:], f1.flatten(2).permute(0, 2, 1)), dim=-1)  # [1, h*w, 2048]
        tokens = self.projector(feats)[0]  # [h*w, 1280]

        side = math.isqrt(tokens.shape[0])
        grid_hw = (side, side) if side * side == tokens.shape[0] else None
        # Budget contract: base_size maps to an exact (base_size/64)^2 grid
        # (512->8x8=64, 640->10x10=100, ..., 1280->20x20=400 tokens).
        expected_side = self.base_size // 64
        assert grid_hw == (expected_side, expected_side), (
            f"deepseek_ocr grid mismatch: base_size={self.base_size} expects "
            f"{expected_side}x{expected_side}, got {tokens.shape[0]} tokens"
        )
        return EncoderFeatures(tokens=tokens, grid_hw=grid_hw, pooled=tokens.mean(dim=0))
