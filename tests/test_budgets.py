"""BUDGET KNOBS: the tower-knob table must map every ladder rung to a
preprocessing argument whose realized token count is <= the rung — a wrong
mapping silently mislabels an entire sweep axis, so the arithmetic is pinned
here (torch-free). GPU-realized counts for qwen/deepseek are checked in the
Verify phase; naflex has a local, network-gated realization test below."""

import os

import pytest

from encoder_experiments.budgets import (
    BUDGET_KNOBS,
    DEEPSEEK_BASE_SIZE,
    LADDER,
    MERGE_TOWERS,
    QWEN_PIXELS_PER_TOKEN,
    budget_knobs,
)


def test_ladder_is_sorted_perfect_squares():
    # Merge towers pool to exact s x s grids only when rungs are squares.
    assert LADDER == sorted(LADDER)
    for rung in LADDER:
        side = int(rung ** 0.5 + 0.5)
        assert side * side == rung, f"rung {rung} is not a perfect square"


def test_naflex_knob_passes_budget_through():
    for rung in LADDER:
        assert budget_knobs("siglip2_naflex", rung) == {"max_num_patches": str(rung)}


def test_qwen_knob_pixel_arithmetic():
    # max_pixels = budget * 784 and pixels/784 recovers the budget exactly:
    # one merged token covers a (14px patch x 2 merge)^2 = 784px tile.
    assert QWEN_PIXELS_PER_TOKEN == (14 * 2) ** 2
    for rung in LADDER:
        knob = budget_knobs("qwen35_vit", rung)
        assert knob == {"max_pixels": str(rung * 784)}
        assert int(knob["max_pixels"]) // QWEN_PIXELS_PER_TOKEN == rung


def test_deepseek_base_size_map_realizes_exact_grids():
    # Grid side is base_size // 64 (SAM /16, conv compressor /4), so each
    # mapped base_size must square back to its rung exactly.
    assert DEEPSEEK_BASE_SIZE == {64: 512, 100: 640, 144: 768, 196: 896, 256: 1024, 400: 1280}
    for rung, base in DEEPSEEK_BASE_SIZE.items():
        assert (base // 64) ** 2 == rung
        assert base % 64 == 0
        assert budget_knobs("deepseek_ocr", rung) == {"base_size": str(base)}


def test_deepseek_unmappable_rungs_raise():
    for rung in (576, 784, 1024):
        with pytest.raises(ValueError, match="deepseek_ocr"):
            budget_knobs("deepseek_ocr", rung)


def test_merge_towers_raise_toward_derive_pooled():
    assert set(MERGE_TOWERS) == {"clip_vit_l_336", "siglip2_so400m_384", "sam_vit_b"}
    for tower in MERGE_TOWERS:
        with pytest.raises(ValueError, match="derive_pooled"):
            budget_knobs(tower, 64)


def test_unknown_encoder_and_bad_budget_raise():
    with pytest.raises(ValueError, match="no budget knob"):
        budget_knobs("mystery_tower", 64)
    with pytest.raises(ValueError, match="positive"):
        budget_knobs("siglip2_naflex", 0)


def test_knob_table_names_every_knob_tower():
    assert BUDGET_KNOBS == {
        "siglip2_naflex": "max_num_patches",
        "qwen35_vit": "max_pixels",
        "qwen3_vl_vit": "max_pixels",
        "deepseek_ocr": "base_size",
    }


def test_qwen_pixel_budget_applier_hits_every_knob_shape():
    """_apply_pixel_budget must update both the bare attrs (Qwen2-VL lineage)
    and the size dict (transformers 5.x pixel-area keys) — checked against
    stubs so no checkpoint download is needed."""
    from encoder_experiments.adapters.qwen_vit import Qwen35Vit

    class BareAttrs:
        min_pixels = 1
        max_pixels = 10**9

    ip = BareAttrs()
    Qwen35Vit._apply_pixel_budget(ip, 784, 64 * 784)
    assert (ip.min_pixels, ip.max_pixels) == (784, 64 * 784)

    class SizeDict:
        size = {"shortest_edge": 1, "longest_edge": 10**9}

    ip = SizeDict()
    Qwen35Vit._apply_pixel_budget(ip, 0, 256 * 784)
    assert ip.size["longest_edge"] == 256 * 784
    assert ip.size["shortest_edge"] == 1  # min untouched when not requested

    class NoKnobs:
        pass

    # A processor exposing no known knobs must NOT raise: attrs are force-set,
    # per-call kwargs are returned for encode(), and encode()'s realized-token
    # guard is the loud-fail if no channel took effect.
    bare = NoKnobs()
    kwargs = Qwen35Vit._apply_pixel_budget(bare, 0, 64 * 784)
    assert kwargs == {
        "max_pixels": 64 * 784,
        # per-call size override: the channel transformers 5.x Qwen2VL
        # processors honor (pixel areas, smart_resize semantics)
        "size": {"shortest_edge": 3136, "longest_edge": 64 * 784},
    }
    assert bare.max_pixels == 64 * 784  # force-set even on unknown variants


@pytest.mark.skipif(
    not os.environ.get("ENCODER_BUDGET_NET_TESTS"),
    reason="downloads the naflex processor config; set ENCODER_BUDGET_NET_TESTS=1",
)
def test_naflex_processor_realizes_at_most_budget_per_rung():
    """Every ladder rung, realized: the NaFlex processor must produce
    h*w <= budget on a non-square page-shaped image (the processor promises
    <=; this pins it against transformers upgrades)."""
    import numpy as np
    from PIL import Image
    from transformers import AutoProcessor

    page = Image.fromarray(
        (np.random.default_rng(0).random((1056, 816, 3)) * 255).astype("uint8")
    )
    for rung in LADDER:
        proc = AutoProcessor.from_pretrained(
            "google/siglip2-so400m-patch16-naflex", max_num_patches=rung
        )
        inputs = proc(images=[page], return_tensors="pt")
        h, w = (int(x) for x in inputs.spatial_shapes[0])
        assert 0 < h * w <= rung, f"rung {rung}: realized {h}x{w}={h * w}"
