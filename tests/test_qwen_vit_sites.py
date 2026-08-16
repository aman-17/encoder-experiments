"""qwen35_vit capture sites: postmerge (default) vs premerge.

Runs a TINY randomly-initialized Qwen3.5 vision tower (real transformers
class, real image processor) through the adapter with load() bypassed — the
site logic, token picking, row-major layout, and budget accounting are all
exercised on the exact tensors the production tower produces, without the 4B
checkpoint.

Pinned contracts:
- postmerge tokens are the tower's merged output, bit-identical (no site
  plumbing may perturb the existing caches' feature path);
- premerge emits merge^2 = 4x the postmerge count on the full (h, w) patch
  grid, row-major per the EncoderFeatures contract (checked against the
  lineage's get_vision_position_ids ordering, not the adapter's own math);
- the realized-budget guard scales by merge^2 in premerge mode;
- cache_tag separates the sites so feature dirs never collide.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch
from PIL import Image

transformers = pytest.importorskip("transformers")

from encoder_experiments.adapters.qwen_vit import Qwen35Vit  # noqa: E402
from encoder_experiments.registry import build  # noqa: E402

MERGE = 2
PATCH = 16


@pytest.fixture(scope="module")
def tower():
    from transformers.models.qwen3_5 import Qwen3_5VisionConfig, Qwen3_5VisionModel

    torch.manual_seed(0)
    config = Qwen3_5VisionConfig(
        depth=2,
        hidden_size=32,
        intermediate_size=64,
        num_heads=2,
        out_hidden_size=48,
        patch_size=PATCH,
        spatial_merge_size=MERGE,
        temporal_patch_size=2,
    )
    return Qwen3_5VisionModel(config).eval()


@pytest.fixture()
def image():
    torch.manual_seed(1)
    arr = (torch.rand(96, 64, 3) * 255).to(torch.uint8).numpy()
    return Image.fromarray(arr)  # 64x96 -> exact multiples of patch*merge=32


def make_adapter(tower, site: str | None = None, max_pixels: int = 0) -> Qwen35Vit:
    from transformers import Qwen2VLImageProcessor

    args = {"site": site} if site else {}
    adapter = Qwen35Vit(torch.device("cpu"), torch.float32, **args)
    image_processor = Qwen2VLImageProcessor(
        patch_size=PATCH, merge_size=MERGE, temporal_patch_size=2
    )
    adapter.processor = SimpleNamespace(image_processor=image_processor)
    adapter.max_pixels = max_pixels
    adapter.min_pixels = 0
    adapter._budget_kwargs = (
        adapter._apply_pixel_budget(image_processor, 0, max_pixels) if max_pixels else {}
    )
    adapter.visual = tower
    adapter.merge = MERGE
    if adapter.site == "premerge":
        adapter._install_premerge_capture()
    return adapter


def test_premerge_vs_postmerge(tower, image):
    with torch.inference_mode():
        post = make_adapter(tower).encode(image)
        pre = make_adapter(tower, site="premerge").encode(image)

    # postmerge is bit-identical to the tower's merged output (cache regression)
    out = tower(
        *_processed(image, tower),
    )
    assert torch.equal(post.tokens, out.pooler_output)
    assert post.grid_hw is not None and pre.grid_hw is not None

    # premerge: merge^2 x the token count, same aspect, full patch grid
    assert pre.tokens.shape[0] == MERGE**2 * post.tokens.shape[0]
    assert pre.grid_hw == (post.grid_hw[0] * MERGE, post.grid_hw[1] * MERGE)
    assert pre.grid_hw[0] * pre.grid_hw[1] == pre.tokens.shape[0]
    for feats in (post, pre):
        assert torch.isfinite(feats.tokens).all() and torch.isfinite(feats.pooled).all()
    # different stages, different width
    assert pre.tokens.shape[1] == tower.config.hidden_size
    assert post.tokens.shape[1] == tower.config.out_hidden_size


def test_premerge_row_major_layout(tower, image):
    """The emitted grid must be row-major over (h, w) — checked against the
    lineage's own position ids, not the adapter's permutation math."""
    from transformers.vision_utils import get_vision_position_ids

    adapter = make_adapter(tower, site="premerge")
    raw: list[torch.Tensor] = []
    handle = tower.merger.register_forward_pre_hook(lambda _m, a: raw.append(a[0]))
    try:
        with torch.inference_mode():
            feats = adapter.encode(image)
    finally:
        handle.remove()

    h, w = feats.grid_hw
    pos = get_vision_position_ids(torch.tensor([[1, h, w]]), MERGE)  # [h*w, 2] seq order
    expected = torch.empty_like(raw[0])
    expected[pos[:, 0] * w + pos[:, 1]] = raw[0]
    assert torch.equal(feats.tokens, expected)


def test_budget_guard_scales_with_site(tower):
    torch.manual_seed(2)
    big = Image.fromarray((torch.rand(256, 256, 3) * 255).to(torch.uint8).numpy())
    max_pixels = 16 * (PATCH * MERGE) ** 2  # 16 merged tokens
    with torch.inference_mode():
        post = make_adapter(tower, max_pixels=max_pixels).encode(big)
        pre = make_adapter(tower, site="premerge", max_pixels=max_pixels).encode(big)
    assert post.tokens.shape[0] <= 16
    assert pre.tokens.shape[0] == MERGE**2 * post.tokens.shape[0]  # guard passed at 4x


def test_site_plumbing(tower):
    adapter = build("qwen35_vit", torch.device("cpu"), torch.float32,
                    adapter_args={"site": "premerge"})
    assert adapter.site == "premerge"
    assert adapter.cache_tag == "qwen35_vit__premerge"
    assert adapter.extra_meta == {"site": "premerge"}

    default = build("qwen35_vit", torch.device("cpu"), torch.float32)
    assert default.site == "postmerge"
    assert default.cache_tag == "qwen35_vit"  # existing caches keep their dir
    assert default.extra_meta == {}
    assert default.budget_multiplier == 1

    premerge = make_adapter(tower, site="premerge")
    assert premerge.budget_multiplier == MERGE**2

    with pytest.raises(ValueError, match="unknown site"):
        _ = Qwen35Vit(torch.device("cpu"), torch.float32, site="midtower").site

    spec_path = Path(__file__).parents[1] / "pipelines" / "modal_extract.py"
    spec = importlib.util.spec_from_file_location("modal_extract", spec_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    name, random_init, adapter_args = mod.parse_encoder_spec("qwen35_vit@site=premerge")
    assert (name, random_init, adapter_args) == ("qwen35_vit", False, {"site": "premerge"})
    assert build(name, torch.device("cpu"), torch.float32,
                 adapter_args=adapter_args).cache_tag == "qwen35_vit__premerge"


def _processed(image, tower):
    from transformers import Qwen2VLImageProcessor

    ip = Qwen2VLImageProcessor(patch_size=PATCH, merge_size=MERGE, temporal_patch_size=2)
    inputs = ip(images=[image], return_tensors="pt")
    return inputs["pixel_values"].to(torch.float32), inputs["image_grid_thw"]
