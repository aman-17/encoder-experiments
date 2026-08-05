"""The probe-site readout is the contract between extraction and probes —
if patch-center sampling is off by half a patch, every localization finding
in the paper is quietly wrong. So these tests pin the math exactly."""

import torch

from encoder_experiments.sites import features_at, tokens_to_grid


def test_patch_center_is_exact():
    # 1 x 8 grid whose feature value IS the column index: sampling at each
    # patch center must return that index exactly (no interpolation bleed).
    w = 8
    tokens = torch.arange(w, dtype=torch.float32).unsqueeze(1)  # [8, 1]
    centers = torch.tensor([[(j + 0.5) / w, 0.5] for j in range(w)])
    out = features_at(tokens, (1, w), centers)
    assert torch.allclose(out.squeeze(1), torch.arange(w, dtype=torch.float32), atol=1e-5)


def test_midpoint_interpolates():
    tokens = torch.tensor([[0.0], [1.0]])  # 1x2 grid
    midpoint = torch.tensor([[0.5, 0.5]])  # exactly between the two patch centers
    out = features_at(tokens, (1, 2), midpoint)
    assert torch.allclose(out, torch.tensor([[0.5]]), atol=1e-5)


def test_row_major_orientation():
    # 2x2 grid, distinct values; y is downward. Top-left center must hit token 0,
    # bottom-left center token 2 — catches an accidental (y, x) swap.
    tokens = torch.tensor([[0.0], [1.0], [2.0], [3.0]])
    pts = torch.tensor([[0.25, 0.25], [0.25, 0.75], [0.75, 0.25], [0.75, 0.75]])
    out = features_at(tokens, (2, 2), pts).squeeze(1)
    assert torch.allclose(out, torch.tensor([0.0, 2.0, 1.0, 3.0]), atol=1e-5)


def test_grid_shape_validation():
    import pytest

    with pytest.raises(ValueError):
        tokens_to_grid(torch.zeros(5, 4), (2, 2))
    with pytest.raises(ValueError):
        features_at(torch.zeros(4, 4), None, torch.zeros(1, 2))
