"""A1 + A2 — SigLIP2-So400m in both resolution regimes.

A1 (fixed 384px) vs A2 (NaFlex) is the paper's cleanest internal contrast:
same pretraining lineage, only the resolution handling differs. Keep both
adapters here so a divergence in preprocessing is visible in one diff.
"""

from __future__ import annotations

import math

import torch
from PIL import Image

from .base import EncoderAdapter, EncoderFeatures


class Siglip2So400m384(EncoderAdapter):
    """A1 — fixed-resolution tower (tiling happens downstream in the VLM, not here)."""

    name = "siglip2_so400m_384"
    checkpoint = "google/siglip2-so400m-patch14-384"
    pooled_kind = "attn_pool"

    def load(self) -> None:
        from transformers import AutoImageProcessor, SiglipVisionConfig, SiglipVisionModel

        self.processor = AutoImageProcessor.from_pretrained(self.checkpoint)
        if self.random_init:
            config = SiglipVisionConfig.from_pretrained(self.checkpoint)
            self.model = SiglipVisionModel(config).to(self.dtype)
        else:
            self.model = SiglipVisionModel.from_pretrained(self.checkpoint, torch_dtype=self.dtype)
        self.model.eval().to(self.device)

    def encode(self, image: Image.Image) -> EncoderFeatures:
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs.pixel_values.to(self.device, self.dtype)
        out = self.model(pixel_values=pixel_values)
        tokens = out.last_hidden_state[0]  # [729, 1152] at 384/14 — no CLS in SigLIP
        side = math.isqrt(tokens.shape[0])
        assert side * side == tokens.shape[0], f"non-square SigLIP grid: {tokens.shape[0]}"
        return EncoderFeatures(tokens=tokens, grid_hw=(side, side), pooled=out.pooler_output[0])


class Siglip2NaFlex(EncoderAdapter):
    """A2 — native-resolution patch packing.

    `max_num_patches` is the vision-token budget knob (also the Exp 2 dial);
    pass it as an adapter arg: --adapter-arg max_num_patches=1024.
    Padding tokens are stripped before return, so `tokens` is exactly h*w.
    """

    name = "siglip2_naflex"
    checkpoint = "google/siglip2-so400m-patch16-naflex"
    pooled_kind = "attn_pool"

    def load(self) -> None:
        from transformers import AutoProcessor, Siglip2VisionConfig, Siglip2VisionModel

        max_patches = self._arg("max_num_patches", 0)  # 0 -> processor default (256)
        proc_kwargs = {"max_num_patches": max_patches} if max_patches else {}
        self.processor = AutoProcessor.from_pretrained(self.checkpoint, **proc_kwargs)
        if self.random_init:
            config = Siglip2VisionConfig.from_pretrained(self.checkpoint)
            self.model = Siglip2VisionModel(config).to(self.dtype)
        else:
            self.model = Siglip2VisionModel.from_pretrained(self.checkpoint, torch_dtype=self.dtype)
        self.model.eval().to(self.device)

    def encode(self, image: Image.Image) -> EncoderFeatures:
        inputs = self.processor(images=[image], return_tensors="pt")
        out = self.model(
            pixel_values=inputs.pixel_values.to(self.device, self.dtype),
            pixel_attention_mask=inputs.pixel_attention_mask.to(self.device),
            spatial_shapes=inputs.spatial_shapes,
        )
        h, w = (int(x) for x in inputs.spatial_shapes[0])
        tokens = out.last_hidden_state[0, : h * w]  # strip padding
        return EncoderFeatures(tokens=tokens, grid_hw=(h, w), pooled=out.pooler_output[0])
