"""R4 (diagnosis-supervised bridge training) pure parts: the autograd
bilinear readout is pinned against sites.features_at AND an independent
numpy reference at 1e-5; the glyph sidecar is deterministic with an
order-independent vocab; the R4b loss is scale-normalized so lam is
comparable to CE; and R4 checkpoint dirs can never collide with B2's."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "pipelines"))

import modal_phaseb_train as pb  # noqa: E402
from encoder_experiments.sites import features_at  # noqa: E402


# --------------------------------------------------------------------------- #
# bilinear readout: torch reimplementation vs numpy reference vs features_at
# --------------------------------------------------------------------------- #

def _numpy_bilinear(grid: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Independent reference for features_at's convention: patch centers at
    ((j+.5)/W, (i+.5)/H), align_corners=False, zeros outside the grid."""
    h, w, d = grid.shape
    out = np.zeros((len(pts), d), dtype=np.float64)
    for k, (x, y) in enumerate(pts):
        fx, fy = x * w - 0.5, y * h - 0.5
        x0, y0 = math.floor(fx), math.floor(fy)
        wx, wy = fx - x0, fy - y0
        for dy in (0, 1):
            for dx in (0, 1):
                xi, yi = x0 + dx, y0 + dy
                if 0 <= xi < w and 0 <= yi < h:
                    out[k] += (wx if dx else 1 - wx) * (wy if dy else 1 - wy) * grid[yi, xi]
    return out


def _readout_points() -> torch.Tensor:
    torch.manual_seed(0)
    interior = torch.rand(17, 2)
    # border and corner points exercise the zero-padding path
    edges = torch.tensor([[0.0, 0.0], [1.0, 1.0], [0.5, 1.0], [1.0, 0.03], [0.0, 0.97]])
    return torch.cat([interior, edges])


def test_readout_parity_numpy_and_features_at():
    torch.manual_seed(1)
    h, w, d = 5, 7, 3
    tokens = torch.randn(h * w, d)
    pts = _readout_points()
    ours = pb.bilinear_readout(tokens, (h, w), pts)
    ref_torch = features_at(tokens, (h, w), pts)
    ref_np = _numpy_bilinear(tokens.reshape(h, w, d).numpy(), pts.numpy())
    assert torch.allclose(ours, ref_torch, atol=1e-5)
    assert np.allclose(ours.numpy(), ref_np, atol=1e-5)


def test_readout_keeps_autograd_and_takes_bf16():
    h, w, d = 4, 4, 6
    tokens = torch.randn(h * w, d, dtype=torch.bfloat16, requires_grad=True)
    out = pb.bilinear_readout(tokens, (h, w), torch.tensor([[0.3, 0.6], [0.9, 0.1]]))
    assert out.dtype == torch.float32
    out.sum().backward()
    assert tokens.grad is not None and float(tokens.grad.abs().sum()) > 0


def test_readout_rejects_wrong_grid():
    with pytest.raises(ValueError, match="cannot fill"):
        pb.bilinear_readout(torch.zeros(5, 4), (2, 2), torch.zeros(1, 2))


# --------------------------------------------------------------------------- #
# glyph sidecar determinism
# --------------------------------------------------------------------------- #

_PROBE_ROWS = [
    {"probe": "glyph_id", "image_id": "text__d1_0001", "point_xy": [0.25, 0.5], "label": 7},
    {"probe": "glyph_id", "image_id": "text__d1_0001", "point_xy": [0.75, 0.5], "label": 3},
    # non-train image still feeds the corpus-wide vocab, never `images`
    {"probe": "glyph_id", "image_id": "text__d9_0001", "point_xy": [0.1, 0.1], "label": 42},
    # other probe families are ignored even when their labels collide
    {"probe": "series_id", "image_id": "text__d1_0001", "point_xy": [0.2, 0.2], "label": 99},
    {"probe": "glyph_id", "image_id": "math__d2_0001", "point_xy": [0.5, 0.5], "label": 42},
]
_TRAIN_IDS = {"text__d1_0001", "math__d2_0001"}


def _write_probes(path: Path, rows) -> Path:
    path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    return path


def test_glyph_sidecar_content_and_determinism(tmp_path):
    p = _write_probes(tmp_path / "probes.jsonl", _PROBE_ROWS)
    sc = pb.build_glyph_sidecar(p, _TRAIN_IDS)
    assert sc["vocab"] == [3, 7, 42]  # includes the non-train doc's 42, not series_id's 99
    assert sc["n_classes"] == 3
    assert set(sc["images"]) == _TRAIN_IDS
    assert sc["images"]["text__d1_0001"]["labels"] == [1, 0]  # vocab indices, file order
    assert sc["images"]["math__d2_0001"]["labels"] == [2]
    # rebuild -> byte-identical
    again = pb.build_glyph_sidecar(p, _TRAIN_IDS)
    assert json.dumps(sc, sort_keys=True) == json.dumps(again, sort_keys=True)


def test_glyph_vocab_is_row_order_independent(tmp_path):
    p1 = _write_probes(tmp_path / "a.jsonl", _PROBE_ROWS)
    p2 = _write_probes(tmp_path / "b.jsonl", list(reversed(_PROBE_ROWS)))
    s1, s2 = (pb.build_glyph_sidecar(p, _TRAIN_IDS) for p in (p1, p2))
    assert s1["vocab"] == s2["vocab"]
    for img in _TRAIN_IDS:  # same (point, label) sets; only file order may differ
        pairs = lambda s: sorted(zip(map(tuple, s["images"][img]["points"]),
                                     s["images"][img]["labels"]))
        assert pairs(s1) == pairs(s2)


# --------------------------------------------------------------------------- #
# R4b normalized MSE: lam scale-comparability
# --------------------------------------------------------------------------- #

def test_normalized_mse_scale_invariant():
    torch.manual_seed(2)
    target = torch.randn(64, 10) * torch.linspace(0.1, 30.0, 10)
    pred = torch.randn(64, 10)
    base = float(pb.normalized_mse(pred, target))
    scaled = float(pb.normalized_mse(pred * 13.7, target * 13.7))
    assert scaled == pytest.approx(base, rel=1e-5)


def test_normalized_mse_mean_predictor_is_unit():
    torch.manual_seed(3)
    target = torch.randn(256, 8)
    pred = target.mean(dim=0, keepdim=True).expand_as(target)
    assert float(pb.normalized_mse(pred, target)) == pytest.approx(1.0, abs=1e-5)


def test_normalized_mse_constant_dim_stays_finite():
    torch.manual_seed(4)
    target = torch.randn(32, 4)
    target[:, 0] = 5.0  # zero-variance dim must not produce inf/nan
    pred = torch.randn(32, 4, requires_grad=True)
    loss = pb.normalized_mse(pred, target)
    assert math.isfinite(float(loss.detach()))
    loss.backward()  # std is detached: grads flow through pred only
    assert pred.grad is not None and torch.isfinite(pred.grad).all()


# --------------------------------------------------------------------------- #
# R4b target assembly
# --------------------------------------------------------------------------- #

def test_percell_target_flat_and_percell_forms_agree():
    torch.manual_seed(5)
    n, m2, d = 6, 4, 3
    flat = torch.randn(n * m2, d)  # rows 4i..4i+3 are output token i's cell
    t_flat = pb.percell_target(flat, n, m2)
    t_cell = pb.percell_target(flat.reshape(n, m2, d), n, m2)
    assert t_flat.shape == (n, m2 * d)
    assert torch.equal(t_flat, t_cell)
    assert torch.equal(t_flat[2], flat[8:12].reshape(-1))
    with pytest.raises(ValueError, match="does not factor"):
        pb.percell_target(torch.randn(n * m2 + 1, d), n, m2)
    with pytest.raises(ValueError, match="per-cell"):
        pb.percell_target(torch.randn(n, m2 + 1, d), n, m2)


# --------------------------------------------------------------------------- #
# merger tap: captures keep autograd into the merger
# --------------------------------------------------------------------------- #

def test_merger_tap_keeps_autograd_through_aux_loss():
    torch.manual_seed(6)
    n, m2, d_pre, d_out = 6, 4, 5, 3

    class Merger(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.proj = torch.nn.Linear(m2 * d_pre, d_out)

        def forward(self, x):
            return self.proj(x.reshape(-1, m2 * d_pre))

    merger = Merger()
    tap = pb._MergerTap(merger)
    x = torch.randn(n * m2, d_pre)
    out = merger(x)
    assert tap.inp is x and tap.out is out and tap.out.requires_grad
    # the R4b path end to end: head(out) vs per-cell input, back into the merger
    head = torch.nn.Linear(d_out, m2 * d_pre)
    loss = pb.normalized_mse(head(tap.out), pb.percell_target(tap.inp, n, m2).detach())
    loss.backward()
    assert all(p.grad is not None and torch.isfinite(p.grad).all()
               for p in merger.parameters())
    tap.clear()
    assert tap.inp is None and tap.out is None


def test_merger_tap_squeezes_batch_dim_and_rejects_non_tensor():
    class Batched(torch.nn.Module):
        def forward(self, x):
            return x.unsqueeze(0)  # [1, N, D]

    m = Batched()
    tap = pb._MergerTap(m)
    out = m(torch.randn(4, 2))
    assert out.dim() == 3  # forward return untouched...
    assert tap.out.dim() == 2 and tap.out.shape == (4, 2)  # ...tap stored the squeeze

    class Tupled(torch.nn.Module):
        def forward(self, x):
            return (x, x)

    t = Tupled()
    pb._MergerTap(t)
    with pytest.raises(AssertionError, match="merged-token stream"):
        t(torch.randn(4, 2))


# --------------------------------------------------------------------------- #
# arm registry: R4 dirs never collide with B2's
# --------------------------------------------------------------------------- #

def test_arm_dirs_disjoint_across_all_grids():
    for smoke in (False, True):
        dirs = [pb.arm_dir(a, lr, smoke=smoke) for a, grid in pb.LR_GRID.items() for lr in grid]
        r4_dirs = [pb.arm_dir(a, l, smoke=smoke) for a in pb.R4_ARMS for l in pb.LAM_GRID]
        combined = dirs + r4_dirs
        assert len(set(combined)) == len(combined)
        root = "phaseb/smoke" if smoke else "phaseb"
        assert all(d.startswith(f"{root}/R4") for d in r4_dirs)
        assert not any(d.startswith((f"{root}/A_", f"{root}/B_")) for d in r4_dirs)
    assert pb.arm_dir("R4a", 1.0) == "phaseb/R4a_1"
    assert pb.arm_dir("R4b", 0.1) == "phaseb/R4b_0.1"


def test_arm_labels_and_stats_labels():
    assert pb.arm_label("A", 3e-4) == "A"  # B2 identity unchanged
    assert pb.arm_label("C", 0.0) == "C"
    assert pb.arm_label("R4a", 0.1) == "R4a_0.1"
    assert pb.stats_label({"arm": "B", "lr": 1e-4}) == "B"  # old stats: no lam key
    assert pb.stats_label({"arm": "R4b", "lr": pb.R4_LR, "lam": 1.0}) == "R4b_1"
