"""Per-tower BUDGET KNOBS for the token-budget sweep (Exp 2's dial).

One ladder of TARGET vision-token counts, and one table mapping each
knob-bearing tower to the preprocessing argument that realizes a rung:

    siglip2_naflex   max_num_patches = budget          (processor guarantees <=)
    qwen35_vit       max_pixels      = budget * 784    (14px patch x 2x2 merge
                                                        -> 784 px per merged
                                                        token; smart_resize
                                                        keeps pixels <= max)
    deepseek_ocr     base_size       = DEEPSEEK_BASE_SIZE[budget]
                                                       (grid is exactly
                                                        (base_size/64)^2: SAM/16
                                                        then the 16x conv
                                                        compressor's /4)

The fixed-resolution towers (clip_vit_l_336 24x24, siglip2_so400m_384 27x27,
sam_vit_b 64x64) have NO preprocessing knob — their down-budget points come
from `derive_pooled` (adaptive-average-pool of the cached full grid,
mechanism="merge"), never from a resize.

Realized counts are approximations of the target from above only for the
knob towers (naflex/qwen realize <= budget, deepseek realizes it exactly);
whatever count is realized is recorded as the ACTUAL grid in the feature
metadata — analysis must plot against actuals, not the rung label.

Torch-free on purpose: importable by tests, modal_extract, and the CLI
without the heavy deps resolved.
"""

from __future__ import annotations

# Target vision-token counts, low to high. All perfect squares so the merge
# towers pool to exact s x s grids.
LADDER = [64, 100, 144, 196, 256, 400, 576, 784, 1024]

# Fixed-resolution towers: native grid (H, W). Down-budget via derive_pooled.
MERGE_TOWERS: dict[str, tuple[int, int]] = {
    "clip_vit_l_336": (24, 24),
    "siglip2_so400m_384": (27, 27),
    "sam_vit_b": (64, 64),
}

# Qwen3.5 ViT: 14px patches, 2x2 spatial merge -> one merged token covers a
# 28x28 pixel tile, so merged tokens ~= pixels / 784.
QWEN_PIXELS_PER_TOKEN = 784

# DeepSeek-OCR DeepEncoder: token grid side is base_size // 64, so these are
# the base sizes that land exactly on ladder rungs. 576+ has no base_size
# (1536 would exceed the checkpoint's supported input sizes).
DEEPSEEK_BASE_SIZE: dict[int, int] = {
    64: 512,
    100: 640,
    144: 768,
    196: 896,
    256: 1024,
    400: 1280,
}


def budget_knobs(encoder: str, budget: int) -> dict[str, str]:
    """Adapter args that realize `budget` target tokens on `encoder`.

    Raises ValueError for merge-mechanism towers (use derive_pooled), for
    rungs a tower cannot realize, and for unknown encoders — a sweep must
    never silently extract at the wrong budget.
    """
    if budget <= 0:
        raise ValueError(f"budget must be positive, got {budget}")
    if encoder == "siglip2_naflex":
        return {"max_num_patches": str(budget)}
    if encoder in ("qwen35_vit", "qwen3_vl_vit"):  # same tower arch, same knob
        return {"max_pixels": str(budget * QWEN_PIXELS_PER_TOKEN)}
    if encoder == "deepseek_ocr":
        if budget not in DEEPSEEK_BASE_SIZE:
            raise ValueError(
                f"deepseek_ocr has no base_size for budget {budget}; "
                f"supported rungs: {sorted(DEEPSEEK_BASE_SIZE)}"
            )
        return {"base_size": str(DEEPSEEK_BASE_SIZE[budget])}
    if encoder in MERGE_TOWERS:
        raise ValueError(
            f"{encoder} is fixed-resolution ({MERGE_TOWERS[encoder][0]}x"
            f"{MERGE_TOWERS[encoder][1]} native) — derive its down-budget "
            "features with derive_pooled (mechanism='merge'), not a knob"
        )
    raise ValueError(
        f"no budget knob registered for {encoder!r}; knob towers: "
        "siglip2_naflex, qwen35_vit, deepseek_ocr; merge towers: "
        f"{sorted(MERGE_TOWERS)}"
    )


# The knob towers, for entrypoint validation / docs.
BUDGET_KNOBS: dict[str, str] = {
    "siglip2_naflex": "max_num_patches",
    "qwen35_vit": "max_pixels",
    "qwen3_vl_vit": "max_pixels",
    "deepseek_ocr": "base_size",
}

# site_store sweep-metadata `mechanism` per knob tower: naflex/qwen reach a
# budget by continuous input-resolution scaling ("resolution"); deepseek by
# picking one of its discrete base-size modes ("res-mode"). The fixed towers'
# derive_pooled files carry "merge"; an un-budgeted extraction is "native".
KNOB_MECHANISMS: dict[str, str] = {
    "siglip2_naflex": "resolution",
    "qwen35_vit": "resolution",
    "qwen3_vl_vit": "resolution",
    "deepseek_ocr": "res-mode",
}
