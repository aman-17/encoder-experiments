"""Arm -> adapter registry. One place that knows which towers exist.

| key                 | arm  | tower                                   |
|---------------------|------|-----------------------------------------|
| clip_vit_l_336      | P1   | CLIP-ViT-L/336 (HKUST anchor, A4 global)|
| siglip2_so400m_384  | A1   | SigLIP2 fixed-res                       |
| siglip2_naflex      | A2   | SigLIP2 NaFlex                          |
| qwen35_vit          | A3   | Qwen3.5 production ViT                  |
| sam_vit_b           | A4/5 | SAM-ViT-B backbone (pre-neck)           |
| deepseek_ocr        | P2   | released DeepEncoder (reference only)   |

A5's global stage (Qwen2-0.5B) is a text LM — it has no image-only probe pass;
its vision side at Exp 1 *is* sam_vit_b.
"""

from __future__ import annotations

import torch

from .adapters.base import EncoderAdapter
from .adapters.clip import ClipVitL336
from .adapters.deepseek_ocr import DeepSeekOcrDeepEncoder
from .adapters.qwen_vit import Qwen35Vit, Qwen3VlVit
from .adapters.sam import SamVitB
from .adapters.siglip2 import Siglip2NaFlex, Siglip2So400m384

ADAPTERS: dict[str, type[EncoderAdapter]] = {
    cls.name: cls
    for cls in (
        ClipVitL336,
        Siglip2So400m384,
        Siglip2NaFlex,
        Qwen35Vit,
        Qwen3VlVit,
        SamVitB,
        DeepSeekOcrDeepEncoder,
    )
}


def resolve_device(spec: str) -> torch.device:
    if spec != "auto":
        return torch.device(spec)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def resolve_dtype(spec: str, device: torch.device) -> torch.dtype:
    if spec != "auto":
        return {"fp32": torch.float32, "fp16": torch.float16, "bf16": torch.bfloat16}[spec]
    return torch.bfloat16 if device.type == "cuda" else torch.float32


def build(
    name: str,
    device: torch.device,
    dtype: torch.dtype,
    random_init: bool = False,
    adapter_args: dict | None = None,
) -> EncoderAdapter:
    if name not in ADAPTERS:
        raise KeyError(f"unknown encoder {name!r}; available: {sorted(ADAPTERS)}")
    return ADAPTERS[name](device, dtype, random_init=random_init, **(adapter_args or {}))
