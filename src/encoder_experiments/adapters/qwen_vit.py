"""A3 — the native-resolution ViT pulled out of the production Qwen3.5 stack.

Loads the full VLM once, grabs the vision tower, and frees the LM so a 4B
checkpoint costs ~670M resident params. Random-init is unsupported here on
purpose: the tower ships inside a remote-code VLM checkpoint, and a
config-only rebuild would not be the architecture we serve.

Budget knob: --adapter-arg max_pixels=N (optionally min_pixels=N) caps the
processor's pixel area; merged vision tokens ~= pixels / 784 (14px patch,
2x2 merge), so max_pixels = target_tokens * 784 realizes a token budget
from above. encode() asserts the realized count never exceeds it.

Site knob: --adapter-arg site=premerge captures the patch states BEFORE the
tower's 2x2 spatial merge + projector MLP — [h*w, D_pre] on the full patch
grid (h, w), i.e. merge^2 = 4x the merged token count — instead of the
default site=postmerge merged tokens. The budget guard scales by merge^2
accordingly, and cache_tag/extra_meta carry the site so feature caches never
collide with postmerge ones.

Bridge knob (B2 additional readout): --adapter-arg bridge_weights=<path>
loads a trained merger state_dict (modal_phaseb_train arm A's
bridge.safetensors) into the tower's merger after model load, strict key
match — the repaired-S2 feature space. cache_tag gains __<bridge_tag>
(bridge_tag defaults to "bridgeA"; set it per weights file) the same way
__premerge separates sites, so stock caches are never touched. premerge +
bridge_weights is refused: the capture sits upstream of the merger and the
cache would duplicate stock premerge.
"""

from __future__ import annotations

import gc

import torch
from PIL import Image

from .base import EncoderAdapter, EncoderFeatures

_VISUAL_ATTRS = ("visual", "model.visual", "vision_tower", "model.vision_tower")
_SITES = ("postmerge", "premerge")


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

    @property
    def site(self) -> str:
        site = str(self.adapter_args.get("site", "postmerge"))
        if site not in _SITES:
            raise ValueError(f"{self.name}: unknown site={site!r}; expected one of {_SITES}")
        return site

    @property
    def bridge_weights(self) -> str:
        path = str(self.adapter_args.get("bridge_weights", "") or "")
        if path and self.site == "premerge":
            raise ValueError(
                f"{self.name}: bridge_weights with site=premerge is refused — the "
                "premerge capture sits upstream of the merger, so the cache would "
                "duplicate stock premerge features"
            )
        return path

    @property
    def bridge_tag(self) -> str:
        return str(self.adapter_args.get("bridge_tag", "bridgeA"))

    @property
    def cache_tag(self) -> str:
        tag = self.name if self.site == "postmerge" else f"{self.name}__{self.site}"
        if self.bridge_weights:
            tag = f"{tag}__{self.bridge_tag}"
        return tag

    @property
    def extra_meta(self) -> dict[str, str]:
        meta = {} if self.site == "postmerge" else {"site": self.site}
        if self.bridge_weights:
            meta["bridge_weights"] = self.bridge_weights
        return meta

    @property
    def budget_multiplier(self) -> int:
        return self.merge**2 if self.site == "premerge" else 1

    def load(self) -> None:
        from transformers import AutoModel, AutoProcessor

        site = self.site  # validate the knobs before paying for the checkpoint
        bridge_weights = self.bridge_weights
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
        if bridge_weights:
            self._load_bridge_weights(bridge_weights)
        if site == "premerge":
            self._install_premerge_capture()

    def _load_bridge_weights(self, path: str) -> None:
        """Load a trained merger state_dict (fp32 safetensors from
        modal_phaseb_train.save_weights) into the tower's merger, strict key
        match — a saved file that does not exactly describe THIS merger fails
        loudly instead of silently repairing nothing. load_state_dict's copy_
        casts into the module's resident dtype."""
        from safetensors.torch import load_file

        merger = getattr(self.visual, "merger", None)
        if merger is None:
            raise RuntimeError(
                f"{self.name}: bridge_weights={path!r} but the vision tower has no "
                f"`merger` module; children: "
                f"{[n for n, _ in self.visual.named_children()]}"
            )
        try:
            merger.load_state_dict(load_file(path), strict=True)
        except RuntimeError as exc:
            raise RuntimeError(
                f"{self.name}: bridge_weights={path!r} does not match the merger's "
                f"state_dict: {exc}"
            ) from exc

    def _install_premerge_capture(self) -> None:
        """Forward pre-hook on the merger module: captures its input — the
        pre-merge patch states — for releases whose return carries only merged
        tokens. Releases without a `merger` attribute still work when their
        ModelOutput exposes pre-merger last_hidden_state; encode() picks the
        pre-merge tensor by shape either way."""
        self._premerge_cache: list[torch.Tensor] = []
        merger = getattr(self.visual, "merger", None)
        if merger is not None:

            def capture(_module, args, kwargs):
                self._premerge_cache.extend(
                    t for t in (*args, *kwargs.values()) if isinstance(t, torch.Tensor)
                )

            merger.register_forward_pre_hook(capture, with_kwargs=True)

    @staticmethod
    def _apply_pixel_budget(image_processor, min_pixels: int, max_pixels: int) -> dict[str, int]:
        """Point every knob this processor generation exposes at the budget.

        Qwen2-VL-lineage processors variously read bare `min_pixels`/`max_pixels`
        attributes, a `size={"shortest_edge", "longest_edge"}` dict (pixel AREAS
        for smart_resize), or per-call min/max_pixels kwargs. Set ALL of them:
        instance attrs unconditionally (variants that don't read them ignore
        them), the size dict when present, plus per-call kwargs returned for
        encode() to pass at preprocessing time. Correctness is enforced
        downstream, not here: encode() asserts realized merged tokens <= budget,
        so a knob that failed to take effect fails loudly per image instead of
        silently caching over-budget features.
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
            # and IGNORE bare attrs and bare per-call min/max kwargs, so pass a
            # per-call `size` override too — the channel every HF processor
            # honors. An edge-px (vs area) misread cannot slip through: it would
            # upscale and trip the realized-token guard immediately.
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
        premerge = self.site == "premerge"
        if premerge:
            self._premerge_cache.clear()
        out = self.visual(pixel_values, grid_thw=grid_thw)
        t, h, w = (int(x) for x in grid_thw[0])
        if premerge:
            tokens = self._pick_tokens(
                [*self._premerge_cache, *self._out_tensors(out)], h * w, "pre-merge"
            )  # [h*w, D_pre]
            tokens = self._to_row_major(tokens, h, w, self.merge)
            grid_hw = (h, w)
        else:
            grid_hw = (h // self.merge, w // self.merge)
            tokens = self._pick_tokens(
                self._out_tensors(out), grid_hw[0] * grid_hw[1], "merged"
            )  # [n_merged, D]
        assert t == 1 and grid_hw[0] * grid_hw[1] == tokens.shape[0], (
            f"token/grid mismatch: thw={(t, h, w)} merge={self.merge} tokens={tokens.shape}"
        )
        if self.max_pixels:
            # Realized-budget guard: (patch*merge)^2 px per merged token;
            # premerge emits merge^2 tokens per merged one (budget_multiplier).
            patch = int(getattr(self.processor.image_processor, "patch_size", 14))
            max_tokens = (self.max_pixels // ((patch * self.merge) ** 2)) * self.budget_multiplier
            assert tokens.shape[0] <= max_tokens, (
                f"budget overrun: {tokens.shape[0]} {self.site} tokens > "
                f"{max_tokens} allowed by max_pixels={self.max_pixels} "
                "(pixel-budget knob did not take)"
            )
        return EncoderFeatures(tokens=tokens, grid_hw=grid_hw, pooled=tokens.mean(dim=0))

    @staticmethod
    def _out_tensors(out) -> list[torch.Tensor]:
        """The vision tower's return, flattened to candidate tensors.

        Transformers <5 returned the merged tokens as a bare tensor; 5.x wraps
        them in a ModelOutput (pooler_output = post-merger embeds, and
        last_hidden_state = pre-merger patch states on some releases).
        """
        if isinstance(out, torch.Tensor):
            return [out]
        if isinstance(out, (tuple, list)):
            return [t for t in out if isinstance(t, torch.Tensor)]
        return [  # ModelOutput
            t
            for t in (getattr(out, "pooler_output", None), getattr(out, "last_hidden_state", None))
            if isinstance(t, torch.Tensor)
        ]

    @staticmethod
    def _pick_tokens(candidates: list[torch.Tensor], n: int, what: str) -> torch.Tensor:
        """Pick the candidate whose leading dim matches the expected grid —
        self-checking, so a layout change fails loudly instead of caching
        wrong features."""
        for cand in candidates:
            t = cand[0] if cand.dim() == 3 else cand
            if t.dim() == 2 and t.shape[0] == n:
                return t
        raise RuntimeError(
            f"qwen35_vit: no candidate tensor with {n} {what} tokens; "
            f"got shapes {[tuple(c.shape) for c in candidates]}"
        )

    @staticmethod
    def _to_row_major(tokens: torch.Tensor, h: int, w: int, merge: int) -> torch.Tensor:
        """Pre-merge sequence order is block-major over merge x merge windows
        (the lineage's get_vision_position_ids layout: (h/m, w/m, m, m));
        EncoderFeatures requires row-major over (h, w)."""
        d = tokens.shape[1]
        return (
            tokens.reshape(h // merge, w // merge, merge, merge, d)
            .permute(0, 2, 1, 3, 4)
            .reshape(h * w, d)
        )


class Qwen3VlVit(Qwen35Vit):
    """The official DEDICATED-VL generation's tower: Qwen3-VL-4B-Instruct.

    Qwen3.5 is natively multimodal (no separate -VL release), so qwen35_vit
    already carries that generation. This arm loads the PREVIOUS generation's
    dedicated VL checkpoint — the pair isolates generation + VL-specific
    encoder training.
    """

    name = "qwen3_vl_vit"
    checkpoint = "Qwen/Qwen3-VL-4B-Instruct"  # override: --adapter-arg checkpoint=...
