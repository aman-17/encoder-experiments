"""P2 — released DeepSeek-OCR DeepEncoder (unmatched probe-only reference).

Honest status: the checkpoint ships as remote code, and the exact attribute
path to the SAM->conv16x->CLIP encode path varies by release. This adapter
tries the known entry points and otherwise FAILS LOUDLY with the module list,
so wiring it up is a five-minute edit on the box that has the checkpoint —
not a silent wrong-features run.

P2 is a reference point, not a trained arm (its training data confounds
everything); nothing downstream blocks on it.
"""

from __future__ import annotations

import math

import torch
from PIL import Image

from .base import EncoderAdapter, EncoderFeatures

# Method names seen across DeepSeek-OCR releases for image->vision-tokens.
_ENCODE_FNS = ("encode_images", "get_image_features", "encode_image")


class DeepSeekOcrDeepEncoder(EncoderAdapter):
    name = "deepseek_ocr"
    checkpoint = "deepseek-ai/DeepSeek-OCR"  # override: --adapter-arg checkpoint=...
    pooled_kind = "mean"
    supports_random_init = False

    def load(self) -> None:
        from transformers import AutoModel

        self.checkpoint = self._arg("checkpoint", self.checkpoint)
        self.model = AutoModel.from_pretrained(
            self.checkpoint, trust_remote_code=True, torch_dtype=self.dtype
        ).eval().to(self.device)

        self._encode_fn = None
        for fn_name in _ENCODE_FNS:
            fn = getattr(self.model, fn_name, None)
            if callable(fn):
                self._encode_fn = fn
                break

        try:
            from transformers import AutoImageProcessor

            self.processor = AutoImageProcessor.from_pretrained(
                self.checkpoint, trust_remote_code=True
            )
        except Exception:
            self.processor = None  # encode() raises with instructions below

        if self._encode_fn is None or self.processor is None:
            modules = [n for n, _ in self.model.named_children()]
            raise RuntimeError(
                f"{self.checkpoint}: could not auto-wire the DeepEncoder path "
                f"(encode fn found: {self._encode_fn is not None}, "
                f"processor found: {self.processor is not None}).\n"
                f"Top-level modules: {modules}\n"
                f"Fix: point _ENCODE_FNS / the preprocessing in adapters/deepseek_ocr.py "
                f"at this release's image-encode entry point (see its modeling_*.py)."
            )

    def encode(self, image: Image.Image) -> EncoderFeatures:
        inputs = self.processor(images=[image], return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device, self.dtype)
        tokens = self._encode_fn(pixel_values)
        if isinstance(tokens, (tuple, list)):
            tokens = tokens[0]
        tokens = tokens[0] if tokens.dim() == 3 else tokens  # [N, D]
        side = math.isqrt(tokens.shape[0])
        grid_hw = (side, side) if side * side == tokens.shape[0] else None
        return EncoderFeatures(tokens=tokens, grid_hw=grid_hw, pooled=tokens.mean(dim=0))
