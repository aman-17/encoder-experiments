"""A4/A5 local stage — SAM-ViT-B image encoder.

We probe the *pre-neck* backbone features (final transformer hidden state,
64x64x768 at 1024px input), not the 256-d neck output: the neck is a learned
projection trained for mask decoding, and the paper's question is what the
backbone representation carries before any task-specific compression.

Exp-1 caveat (also in README): at this stage A4/A5's distinctive parts — the
16x conv compressor and the reordering queries — do not exist yet; probing SAM
here answers "does the raw backbone carry the information", not "does the
assembled hybrid".
"""

from __future__ import annotations

import torch
from PIL import Image

from .base import EncoderAdapter, EncoderFeatures


class SamVitB(EncoderAdapter):
    name = "sam_vit_b"
    checkpoint = "facebook/sam-vit-base"
    pooled_kind = "mean"

    def load(self) -> None:
        from transformers import SamConfig, SamModel, SamProcessor

        self.processor = SamProcessor.from_pretrained(self.checkpoint)
        if self.random_init:
            model = SamModel(SamConfig.from_pretrained(self.checkpoint)).to(self.dtype)
        else:
            model = SamModel.from_pretrained(self.checkpoint, torch_dtype=self.dtype)
        # Keep only the vision encoder; drop prompt/mask decoder weights.
        self.encoder = model.vision_encoder.eval().to(self.device)
        del model

    def encode(self, image: Image.Image) -> EncoderFeatures:
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs.pixel_values.to(self.device, self.dtype)
        out = self.encoder(pixel_values, output_hidden_states=True)
        pre_neck = out.hidden_states[-1][0]  # [64, 64, 768], channels-last
        h, w, d = pre_neck.shape
        tokens = pre_neck.reshape(h * w, d)
        return EncoderFeatures(tokens=tokens, grid_hw=(h, w), pooled=tokens.mean(dim=0))
