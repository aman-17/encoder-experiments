"""derive_pooled: the merge-mechanism budget rungs. The pooling math is what
every fixed-tower sweep number rests on, so it is pinned exactly — a
hand-built 4x4 grid pooled to 2x2 must give the block means — and the
end-to-end CLI must write files that follow the site_store contract
(sites/points/pooled tensors, budget_tokens = actual, mechanism="merge")
byte-compatibly with extract --sites-from output."""

import json

import pytest
import torch
from safetensors import safe_open
from safetensors.torch import save_file

from encoder_experiments.budgets import LADDER, MERGE_TOWERS
from encoder_experiments.derive_pooled import (
    SITES_SUFFIX,
    derive_for_dir,
    derive_target_grid,
    main,
    pool_grid,
)


# --------------------------------------------------------------------------- #
# pooling math
# --------------------------------------------------------------------------- #

def test_pool_4x4_to_2x2_is_exact_block_means():
    # Values 0..15 row-major on a 4x4 grid; 2x2 output bins are the exact
    # means of each 2x2 block: [[0,1,4,5],[2,3,6,7],[8,9,12,13],[10,11,14,15]].
    tokens = torch.arange(16, dtype=torch.float32).unsqueeze(1)  # [16, 1]
    merged = pool_grid(tokens, (4, 4), (2, 2))
    assert merged.shape == (4, 1)
    assert merged.dtype == torch.float32  # fp32 pooling rule
    expected = torch.tensor([[2.5], [4.5], [10.5], [12.5]])
    assert torch.equal(merged, expected)


def test_pool_identity_and_multichannel():
    tokens = torch.randn(9, 5)
    assert torch.equal(pool_grid(tokens, (3, 3), (3, 3)), tokens)  # identity rung
    # Channel independence: pooling [N, D] equals pooling each channel alone.
    merged = pool_grid(tokens, (3, 3), (1, 1))
    assert torch.allclose(merged[0], tokens.mean(dim=0), atol=1e-6)


def test_pool_rejects_wrong_grid():
    with pytest.raises(ValueError):
        pool_grid(torch.zeros(5, 2), (2, 2), (1, 1))


# --------------------------------------------------------------------------- #
# target-grid derivation per tower
# --------------------------------------------------------------------------- #

def test_target_grids_for_the_three_merge_towers():
    # clip 24x24=576: rungs through 576 pool to exact sides; 784/1024 skip.
    clip = MERGE_TOWERS["clip_vit_l_336"]
    assert [derive_target_grid(clip, r) for r in LADDER] == [
        (8, 8), (10, 10), (12, 12), (14, 14), (16, 16), (20, 20), (24, 24), None, None,
    ]
    # siglip2 27x27=729: 576 -> 24x24 (uneven bins are fine); 784/1024 skip.
    sig = MERGE_TOWERS["siglip2_so400m_384"]
    assert derive_target_grid(sig, 576) == (24, 24)
    assert derive_target_grid(sig, 784) is None
    # sam 64x64=4096: the whole ladder fits.
    sam = MERGE_TOWERS["sam_vit_b"]
    assert [derive_target_grid(sam, r) for r in LADDER] == [
        (8, 8), (10, 10), (12, 12), (14, 14), (16, 16), (20, 20), (24, 24), (28, 28), (32, 32),
    ]


def test_target_grid_identity_and_over_budget():
    assert derive_target_grid((24, 24), 576) == (24, 24)   # native point
    assert derive_target_grid((24, 24), 577) is None       # cannot up-budget
    # Non-square source: aspect-preserving, never exceeds the budget.
    th, tw = derive_target_grid((12, 48), 144)
    assert th * tw <= 144 and tw > th


# --------------------------------------------------------------------------- #
# end to end: full-grid cache -> rung files per the site_store contract
# --------------------------------------------------------------------------- #

def _write_probes(path, rows):
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))


@pytest.fixture()
def toy_cache(tmp_path):
    """One 4x4-grid image (D=2) in features/toy_tower + 2 probe points."""
    feat_dir = tmp_path / "features" / "toy_tower"
    feat_dir.mkdir(parents=True)
    base = torch.arange(16, dtype=torch.float16)
    tokens = torch.stack([base, base * 10], dim=1)  # [16, 2]
    save_file(
        {"tokens": tokens, "pooled": tokens.float().mean(0).half()},
        feat_dir / "charts__doc1.safetensors",
        metadata={
            "encoder": "toy_tower", "checkpoint": "toy/ckpt", "pooled_kind": "cls",
            "random_init": "False", "compute_dtype": "torch.float32",
            "grid_h": "4", "grid_w": "4", "num_tokens": "16", "feat_dim": "2",
        },
    )
    probes = tmp_path / "probes.jsonl"
    _write_probes(probes, [
        # (0.25, 0.25) = center of pooled patch (0,0) at 2x2 -> block mean 2.5
        {"probe": "series_id", "image_id": "charts/doc1", "point_xy": [0.25, 0.25], "label": 1},
        # (0.75, 0.75) = center of pooled patch (1,1) at 2x2 -> block mean 12.5
        {"probe": "series_id", "image_id": "charts/doc1", "point_xy": [0.75, 0.75], "label": 2},
    ])
    return feat_dir, probes, tmp_path / "sweep"


def test_cli_end_to_end_contract(toy_cache):
    feat_dir, probes, out = toy_cache
    rc = main([
        "--features-in", str(feat_dir), "--probes", str(probes),
        "--rungs", "4,16,25", "--out", str(out),
    ])
    assert rc == 0

    # rung 4 -> 2x2 merge: site at pooled patch centers = exact block means.
    path4 = out / "toy_tower@4" / f"charts__doc1{SITES_SUFFIX}"
    with safe_open(path4, framework="pt") as f:
        meta = f.metadata()
        sites = f.get_tensor("sites")
        points = f.get_tensor("points")   # site_store tensor name
        pooled = f.get_tensor("pooled")
    assert sites.dtype == torch.float16 and pooled.dtype == torch.float16
    assert points.dtype == torch.float32
    # sweep contract fields: budget_tokens is the ACTUAL merged count
    assert meta["mechanism"] == "merge"
    assert meta["budget_tokens"] == "4"
    assert meta["budget_nominal"] == "4"
    assert meta["knob"] == "adaptive_avg_pool:4x4->2x2"
    assert (meta["grid_h"], meta["grid_w"], meta["num_tokens"]) == ("2", "2", "4")
    assert (meta["source_grid_h"], meta["source_grid_w"]) == ("4", "4")
    assert meta["pooled_kind"] == "mean" and meta["source_pooled_kind"] == "cls"
    assert meta["encoder"] == "toy_tower" and meta["checkpoint"] == "toy/ckpt"
    assert (meta["num_sites"], meta["feat_dim"]) == ("2", "2")
    assert torch.equal(points, torch.tensor([[0.25, 0.25], [0.75, 0.75]]))
    assert torch.allclose(sites.float(), torch.tensor([[2.5, 25.0], [12.5, 125.0]]))
    assert torch.allclose(pooled.float(), torch.tensor([7.5, 75.0]))  # merged mean

    # rung 16 -> identity pool: sites are the bilinear readout on the raw grid.
    path16 = out / "toy_tower@16" / f"charts__doc1{SITES_SUFFIX}"
    with safe_open(path16, framework="pt") as f:
        m16 = f.metadata()
        s16 = f.get_tensor("sites").float()
    assert (m16["grid_h"], m16["budget_tokens"]) == ("4", "16")
    # (0.25, 0.25) on the 4x4 grid = midpoint of patches (0,0),(0,1),(1,0),(1,1)
    assert torch.allclose(s16[0], torch.tensor([2.5, 25.0]))

    # rung 25 > native 16 -> skipped entirely.
    assert not (out / "toy_tower@25" / f"charts__doc1{SITES_SUFFIX}").exists()


def test_resume_skips_existing(toy_cache):
    feat_dir, probes, out = toy_cache
    stats1 = derive_for_dir(feat_dir, probes, [4], out)
    stats2 = derive_for_dir(feat_dir, probes, [4], out)
    assert stats1["rungs"]["4"]["written"] == 1
    assert stats2["rungs"]["4"] == {"written": 0, "skipped_existing": 1, "over_budget": 0}


def test_pooled_only_image_gets_zero_site_file(toy_cache):
    # An image whose only probe rows are pooled (pl3*) still gets a file —
    # zero sites, pooled vector present (the merged-grid mean).
    feat_dir, probes, out = toy_cache
    pooled_probes = probes.parent / "pooled_only.jsonl"
    _write_probes(pooled_probes, [
        {"probe": "pl3_summary", "image_id": "charts/doc1", "label": [1.0, 0.0]},
    ])
    stats = derive_for_dir(feat_dir, pooled_probes, [4], out)
    assert stats["rungs"]["4"]["written"] == 1
    with safe_open(out / "toy_tower@4" / f"charts__doc1{SITES_SUFFIX}", framework="pt") as f:
        assert f.get_tensor("sites").shape == (0, 2)
        assert f.metadata()["num_sites"] == "0"
        assert torch.allclose(f.get_tensor("pooled").float(), torch.tensor([7.5, 75.0]))


def test_image_without_probe_rows_is_skipped(toy_cache):
    # Same rule as extract --sites-from: no probe rows -> nothing to store.
    feat_dir, probes, out = toy_cache
    other_probes = probes.parent / "other.jsonl"
    _write_probes(other_probes, [
        {"probe": "series_id", "image_id": "charts/OTHER", "point_xy": [0.5, 0.5], "label": 0},
    ])
    stats = derive_for_dir(feat_dir, other_probes, [4], out)
    assert stats["no_probe_rows"] == 1
    assert not (out / "toy_tower@4" / f"charts__doc1{SITES_SUFFIX}").exists()
