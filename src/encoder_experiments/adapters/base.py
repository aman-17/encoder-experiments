"""Adapter interface every encoder tower implements.

The contract the probe harness depends on:

- `tokens` are the encoder's final-hidden patch embeddings, padding already
  stripped, laid out row-major so that `tokens.view(H, W, D)` is the spatial
  grid whenever `grid_hw` is set (`None` only for encoders whose token layout
  is not a rectangle, e.g. an unwired composite).
- `pooled` is the encoder's own notion of a global summary (CLS, attention
  pool, or masked mean — recorded per-adapter in `pooled_kind`, because the
  finding-3 probe-gap comparison must not silently mix pooling semantics).
- Adapters import transformers only inside `load()`, so the CLI and tests stay
  importable without the heavy deps resolved.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import torch
from PIL import Image


@dataclass
class EncoderFeatures:
    tokens: torch.Tensor  # [N, D] final hidden states, row-major over the grid
    grid_hw: tuple[int, int] | None  # (H, W) with H*W == N, or None
    pooled: torch.Tensor  # [D]


class EncoderAdapter(ABC):
    """One frozen tower. Subclasses set `name`, `checkpoint`, `pooled_kind`."""

    name: str
    checkpoint: str
    pooled_kind: str  # "cls" | "attn_pool" | "mean"
    supports_random_init: bool = True

    def __init__(
        self,
        device: torch.device,
        dtype: torch.dtype,
        random_init: bool = False,
        **adapter_args,
    ) -> None:
        if random_init and not self.supports_random_init:
            raise ValueError(
                f"{self.name}: random-init control is not supported for this tower "
                "(remote-code / composite checkpoint). Use the four public towers "
                "(clip, siglip2 fixed/naflex, sam) for the floor control."
            )
        self.device = device
        self.dtype = dtype
        self.random_init = random_init
        self.adapter_args = adapter_args

    @abstractmethod
    def load(self) -> None:
        """Instantiate processor + weights (or config-only init when random_init)."""

    @abstractmethod
    def encode(self, image: Image.Image) -> EncoderFeatures:
        """One forward pass. Caller wraps in torch.inference_mode()."""

    # -- cache identity -------------------------------------------------------

    @property
    def cache_tag(self) -> str:
        """Feature-directory tag. `name` by default; adapters whose
        adapter_args change the emitted feature space (e.g. a capture site)
        extend it so caches never collide."""
        return self.name

    @property
    def extra_meta(self) -> dict[str, str]:
        """Adapter-specific metadata stored with every feature file."""
        return {}

    @property
    def budget_multiplier(self) -> int:
        """Realized tokens allowed per nominal budget token (valid after
        load()). 1 whenever the emitted tokens ARE the budgeted tokens; a
        pre-merge capture site emits merge^2 tokens per budgeted merged one."""
        return 1

    # -- shared helpers -------------------------------------------------------

    def _arg(self, key: str, default):
        """Typed adapter_args lookup: cast to the default's type when present."""
        val = self.adapter_args.get(key, default)
        if val is not None and default is not None and not isinstance(val, type(default)):
            val = type(default)(val)
        return val
