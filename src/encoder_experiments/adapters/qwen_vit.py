"""A3 — the native-resolution ViT pulled out of the production Qwen3.5 stack.

Loads the full VLM once, grabs the vision tower, and frees the LM so a 4B
checkpoint costs ~670M resident params. Random-init is unsupported here on
purpose: the tower ships inside a remote-code VLM checkpoint, and a
config-only rebuild would not be the architecture we serve.

Budget knob: --adapter-arg max_pixels=N (optionally min_pixels=N) caps the
processor's pixel area; merged vision tokens ~= pixels / 784 (14px patch,
2x2 merge), so max_pixels = target_tokens * 784 realizes a token budget
from above. encode() asserts the realized count never exceeds it.
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
        self.max_pixels = self._arg("max_pixels", 0)  # 0 -> processor default
        self.min_pixels = self._arg("min_pixels", 0)
        self.processor = AutoProcessor.from_pretrained(self.checkpoint, trust_remote_code=True)
        self._budget_kwargs: dict[str, int] = {}
        if self.max_pixels or self.min_pixels:
            self._budget_kwargs = self._apply_pixel_budget(
                self.processor.image_processor, self.min_pixels, self.max_pixels
            )
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

    @staticmethod
    def _apply_pixel_budget(image_processor, min_pixels: int, max_pixels: int) -> dict[str, int]:
        """Point every knob this processor generation exposes at the budget.

        Qwen2-VL-lineage processors variously read bare `min_pixels`/`max_pixels`
        attributes, a `size={"shortest_edge", "longest_edge"}` dict (pixel AREAS
        for smart_resize), or per-call min/max_pixels kwargs. We set ALL of them:
        instance attrs unconditionally (variants that don't read them ignore
        them), the size dict when present, and return per-call kwargs for
        encode() to pass at preprocessing time — the path every release reads.
        Correctness is enforced downstream, not here: encode() asserts realized
        merged tokens <= budget, so a knob that failed to take effect fails
        loudly per image instead of silently caching over-budget features.
        (A previous hasattr-gated version raised on Modal's Qwen2VLImageProcessor,
        which exposes no pixel attrs — every sweep job crashed at load.)
        """
        size = getattr(image_processor, "size", None)
        call_kwargs: dict = {}
        for attr, val in (("min_pixels", min_pixels), ("max_pixels", max_pixels)):
            if not val:
                continue
            setattr(image_processor, attr, val)
            call_kwargs[attr] = val
            if isinstance(size, dict):
                size_key = "shortest_edge" if attr == "min_pixels" else "longest_edge"
                if size_key in size:
                    size[size_key] = val
                if attr in size:  # some releases keyed size by min/max_pixels
                    size[attr] = val
        if max_pixels:
            # transformers 5.x Qwen2VL processors are driven by the `size` dict
            # (shortest/longest_edge as pixel AREAS -> smart_resize min/max_pixels)
            # and IGNORE bare attrs and bare per-call min/max kwargs — observed on
            # Modal: full-res 3796 tokens under a 49-token budget, caught by the
            # realized-token guard. A per-call `size` override is the channel
            # every HF processor honors. Misinterpretation (edge-px vs area)
            # cannot slip through: edge-px semantics would upscale and trip the
            # guard immediately.
            call_kwargs["size"] = {
                "shortest_edge": min_pixels or min(3136, max_pixels),
                "longest_edge": max_pixels,
            }
        return call_kwargs

    def encode(self, image: Image.Image) -> EncoderFeatures:
        budget_kwargs = dict(getattr(self, "_budget_kwargs", {}))
        while True:
            try:
                inputs = self.processor.image_processor(
                    images=[image], return_tensors="pt", **budget_kwargs
                )
                break
            except TypeError:
                # Strip rejected kwargs one channel at a time (size -> bare pixel
                # kwargs -> none). The realized-token guard below fails loudly if
                # no surviving channel carried the budget.
                if "size" in budget_kwargs:
                    budget_kwargs.pop("size")
                elif budget_kwargs:
                    budget_kwargs = {}
                else:
                    raise
        pixel_values = inputs["pixel_values"].to(self.device, self.dtype)
        grid_thw = inputs["image_grid_thw"].to(self.device)
        out = self.visual(pixel_values, grid_thw=grid_thw)
        t, h, w = (int(x) for x in grid_thw[0])
        grid_hw = (h // self.merge, w // self.merge)
        tokens = self._merged_tokens(out, grid_hw[0] * grid_hw[1])  # [n_merged, D]
        assert t == 1 and grid_hw[0] * grid_hw[1] == tokens.shape[0], (
            f"token/grid mismatch: thw={(t, h, w)} merge={self.merge} tokens={tokens.shape}"
        )
        if self.max_pixels:
            # Realized-budget guard: merged tokens x (patch*merge)^2 px each.
            patch = int(getattr(self.processor.image_processor, "patch_size", 14))
            max_tokens = self.max_pixels // ((patch * self.merge) ** 2)
            assert tokens.shape[0] <= max_tokens, (
                f"budget overrun: {tokens.shape[0]} merged tokens > "
                f"{max_tokens} allowed by max_pixels={self.max_pixels} "
                "(pixel-budget knob did not take)"
            )
        return EncoderFeatures(tokens=tokens, grid_hw=grid_hw, pooled=tokens.mean(dim=0))

    @staticmethod
    def _merged_tokens(out, n_merged: int) -> torch.Tensor:
        """Unwrap the vision tower's return into [n_merged, D].

        Transformers <5 returned the merged tokens as a bare tensor; 5.x wraps
        them in a ModelOutput (pooler_output = post-merger embeds, and
        last_hidden_state = pre-merger patch states on some releases). Pick the
        tensor whose leading dim matches the merged grid — self-checking, so a
        layout change fails loudly instead of caching wrong features.
        """
        if isinstance(out, torch.Tensor):
            candidates = [out]
        elif isinstance(out, (tuple, list)):
            candidates = [t for t in out if isinstance(t, torch.Tensor)]
        else:  # ModelOutput
            candidates = [
                t for t in (getattr(out, "pooler_output", None), getattr(out, "last_hidden_state", None))
                if isinstance(t, torch.Tensor)
            ]
        for cand in candidates:
            t = cand[0] if cand.dim() == 3 else cand
            if t.dim() == 2 and t.shape[0] == n_merged:
                return t
        raise RuntimeError(
            f"qwen35_vit: no candidate tensor with {n_merged} merged tokens; "
            f"got shapes {[tuple(c.shape) for c in candidates]}"
        )


class Qwen3VlVit(Qwen35Vit):
    """The official DEDICATED-VL generation's tower: Qwen3-VL-4B-Instruct.

    Qwen3.5 is natively multimodal (no separate -VL release), so qwen35_vit
    already carries that generation. This arm loads the PREVIOUS generation's
    dedicated VL checkpoint — the pair isolates generation + VL-specific
    encoder training (and Qwen3-VL-8B is the Goodfire/Silico reference stack).
    """

    name = "qwen3_vl_vit"
    checkpoint = "Qwen/Qwen3-VL-4B-Instruct"  # override: --adapter-arg checkpoint=...
