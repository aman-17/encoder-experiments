"""Probe-site readout: features at marked image locations.

The probe tasks (series-ID at a marker, cell (row,col), point-coordinate)
need the feature vector *at* a normalized image position, not the pooled
summary. Extraction stores the full token grid; this module turns
(tokens, grid_hw, points) into per-point feature vectors.

Coordinate convention — the one the data side must emit:
    points are (x, y), normalized to [0, 1] over the ORIGINAL image,
    x rightward, y downward. Patch centers sit at ((j+0.5)/W, (i+0.5)/H).

Under `align_corners=False` that convention maps a point at a patch center
exactly onto that patch's token (verified in tests/test_sites.py), and
bilinear interpolation handles points between centers.

Caveat: for adapters that letterbox/pad the input (SAM pads to square),
normalized coordinates must be computed on the *processed* geometry; the
data side emits square renders for those probe families, which sidesteps it.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def tokens_to_grid(tokens: torch.Tensor, grid_hw: tuple[int, int]) -> torch.Tensor:
    """[N, D] row-major -> [H, W, D]."""
    h, w = grid_hw
    if tokens.shape[0] != h * w:
        raise ValueError(f"{tokens.shape[0]} tokens cannot fill a {h}x{w} grid")
    return tokens.view(h, w, -1)


def features_at(
    tokens: torch.Tensor,
    grid_hw: tuple[int, int] | None,
    points_xy: torch.Tensor,
) -> torch.Tensor:
    """Bilinear feature readout at normalized (x, y) points.

    tokens: [N, D]; points_xy: [K, 2] in [0, 1]. Returns [K, D] float32.
    """
    if grid_hw is None:
        raise ValueError("encoder produced no spatial grid; site probes need grid_hw")
    if points_xy.dim() != 2 or points_xy.shape[1] != 2:
        raise ValueError(f"points_xy must be [K, 2], got {tuple(points_xy.shape)}")
    grid = tokens_to_grid(tokens, grid_hw).float()          # [H, W, D]
    grid = grid.permute(2, 0, 1).unsqueeze(0)               # [1, D, H, W]
    coords = points_xy.float() * 2.0 - 1.0                  # [0,1] -> [-1,1]
    coords = coords.view(1, 1, -1, 2).to(grid.device)       # [1, 1, K, 2] as (x, y)
    sampled = F.grid_sample(grid, coords, mode="bilinear", align_corners=False)
    return sampled[0, :, 0, :].transpose(0, 1)              # [K, D]
