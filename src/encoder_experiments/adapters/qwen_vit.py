"""A3 — the native-resolution ViT pulled out of the production Qwen3.5 stack.

Loads the full VLM once, grabs the vision tower, and frees the LM so a 4B
checkpoint costs ~670M resident params. Random-init is unsupported here on
purpose: the tower ships inside a remote-code VLM checkpoint, and a
config-only rebuild would not be the architecture we serve.
"""

from __future__ import annotations

import gc

import torch
from PIL import Image

from .base import EncoderAdapter, EncoderFeatures

_VISUAL_ATTRS = ("visual", "model.visual", "vision_tower", "model.vision_tower")


def _resolve_attr(obj, dotted: str):
    for part in dotted.split("."):
        obj = getattr(obj, part, None)
        if obj is None:
            return None
    return obj


class Qwen35Vit(EncoderAdapter):
    name = "qwen35_vit"
    checkpoint = "Qwen/Qwen3.5-4B"  # override: --adapter-arg checkpoint=...
    pooled_kind = "mean"
    supports_random_init = False

    def load(self) -> None:
        from transformers import AutoModel, AutoProcessor

        self.checkpoint = self._arg("checkpoint", self.checkpoint)
        self.processor = AutoProcessor.from_pretrained(self.checkpoint, trust_remote_code=True)
        model = AutoModel.from_pretrained(
            self.checkpoint, trust_remote_code=True, torch_dtype=self.dtype
        )
        for attr in _VISUAL_ATTRS:
            visual = _resolve_attr(model, attr)
            if visual is not None:
                break
        else:
            raise RuntimeError(
                f"{self.checkpoint}: no vision tower under any of {_VISUAL_ATTRS}. "
                f"Top-level modules: {[n for n, _ in model.named_children()]}"
            )
        self.visual = visual.eval().to(self.device)
        self.merge = int(
            getattr(visual, "spatial_merge_size", None)
            or getattr(getattr(visual, "config", None), "spatial_merge_size", 2)
        )
        del model, visual
        gc.collect()
        if self.device.type == "cuda":
            torch.cuda.empty_cache()

    def encode(self, image: Image.Image) -> EncoderFeatures:
        inputs = self.processor.image_processor(images=[image], return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device, self.dtype)
        grid_thw = inputs["image_grid_thw"].to(self.device)
        tokens = self.visual(pixel_values, grid_thw=grid_thw)  # [n_merged, D]
        t, h, w = (int(x) for x in grid_thw[0])
        grid_hw = (h // self.merge, w // self.merge)
        assert t == 1 and grid_hw[0] * grid_hw[1] == tokens.shape[0], (
            f"token/grid mismatch: thw={(t, h, w)} merge={self.merge} tokens={tokens.shape}"
        )
        return EncoderFeatures(tokens=tokens, grid_hw=grid_hw, pooled=tokens.mean(dim=0))
