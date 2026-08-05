"""P1 — CLIP-ViT-L/336, the HKUST anchor and A4's global stage."""

from __future__ import annotations

import math

import torch
from PIL import Image

from .base import EncoderAdapter, EncoderFeatures


class ClipVitL336(EncoderAdapter):
    name = "clip_vit_l_336"
    checkpoint = "openai/clip-vit-large-patch14-336"
    pooled_kind = "cls"

    def load(self) -> None:
        from transformers import CLIPImageProcessor, CLIPVisionConfig, CLIPVisionModel

        self.processor = CLIPImageProcessor.from_pretrained(self.checkpoint)
        if self.random_init:
            config = CLIPVisionConfig.from_pretrained(self.checkpoint)
            self.model = CLIPVisionModel(config).to(self.dtype)
        else:
            self.model = CLIPVisionModel.from_pretrained(self.checkpoint, torch_dtype=self.dtype)
        self.model.eval().to(self.device)

    def encode(self, image: Image.Image) -> EncoderFeatures:
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs.pixel_values.to(self.device, self.dtype)
        out = self.model(pixel_values=pixel_values)
        hs = out.last_hidden_state[0]  # [1 + H*W, 1024], CLS first
        cls, patches = hs[0], hs[1:]
        side = math.isqrt(patches.shape[0])
        assert side * side == patches.shape[0], f"non-square CLIP grid: {patches.shape[0]}"
        return EncoderFeatures(tokens=patches, grid_hw=(side, side), pooled=cls)
