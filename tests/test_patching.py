"""B1 patching pure parts: prefill-only hook masking, mismatch pairing,
restoration math (encoder_experiments/patching.py)."""

import pytest
import torch
from torch import nn

from encoder_experiments.patching import (
    CONDITIONS,
    PrefillCapture,
    PrefillPatch,
    bootstrap_restoration,
    find_decoder_layers,
    image_token_positions,
    partner_map,
    restoration_fraction,
    strip_md_fence,
)


class _Layer(nn.Module):
    """Identity layer that records the hidden states it actually received."""

    def __init__(self):
        super().__init__()
        self.seen = []

    def forward(self, hidden_states, marker=None):
        self.seen.append(hidden_states.clone())
        return hidden_states


def _hs(seq, dim=4, base=0.0):
    return torch.arange(seq * dim, dtype=torch.float32).reshape(1, seq, dim) + base


def test_image_token_positions():
    ids = torch.tensor([1, 7, 7, 2, 7, 3])
    assert image_token_positions(ids, 7).tolist() == [1, 2, 4]
    with pytest.raises(ValueError):
        image_token_positions(ids, 99)


def test_prefill_patch_applies_only_on_prefill_and_only_at_positions():
    layer = _Layer()
    pos = torch.tensor([1, 3])
    patch = torch.full((2, 4), -1.0)
    p = PrefillPatch(pos, patch)
    handle = layer.register_forward_pre_hook(p.hook, with_kwargs=True)

    prefill = _hs(5)
    layer(prefill)                      # positional channel
    got = layer.seen[-1][0]
    assert torch.equal(got[pos], patch)
    untouched = [i for i in range(5) if i not in pos.tolist()]
    assert torch.equal(got[untouched], prefill[0][untouched])
    assert torch.equal(prefill, _hs(5))  # input tensor not mutated in place

    layer(_hs(1, base=9.0))             # decode step: no patch
    assert torch.equal(layer.seen[-1], _hs(1, base=9.0))
    assert p.n_applied == 1

    layer(hidden_states=_hs(5))         # kwarg channel
    assert torch.equal(layer.seen[-1][0][pos], patch)
    assert p.n_applied == 2
    handle.remove()


def test_prefill_patch_shape_and_range_guards():
    with pytest.raises(ValueError):
        PrefillPatch(torch.tensor([0, 1]), torch.zeros(3, 4))
    layer = _Layer()
    p = PrefillPatch(torch.tensor([9]), torch.zeros(1, 4))
    handle = layer.register_forward_pre_hook(p.hook, with_kwargs=True)
    with pytest.raises(RuntimeError, match="exceed prefill"):
        layer(_hs(5))
    handle.remove()


def test_prefill_patch_casts_to_incoming_dtype():
    layer = _Layer()
    pos = torch.tensor([0])
    p = PrefillPatch(pos, torch.full((1, 4), 0.5, dtype=torch.float32))
    handle = layer.register_forward_pre_hook(p.hook, with_kwargs=True)
    layer(_hs(3).to(torch.bfloat16))
    assert layer.seen[-1].dtype == torch.bfloat16
    handle.remove()


def test_prefill_capture_first_prefill_only_and_selfpatch_noop():
    layer = _Layer()
    pos = torch.tensor([1, 2])
    cap = PrefillCapture(pos)
    handle = layer.register_forward_pre_hook(cap.hook, with_kwargs=True)
    layer(_hs(1))                       # decode-shaped: ignored
    assert cap.value is None
    first = _hs(4, base=3.0)
    layer(first)
    layer(_hs(4, base=100.0))           # later prefill-shaped call: not recaptured
    assert torch.equal(cap.value, first[0][pos])
    handle.remove()

    # self-patch: replacing with the captured values is a bit-exact no-op
    p = PrefillPatch(pos, cap.value)
    handle = layer.register_forward_pre_hook(p.hook, with_kwargs=True)
    layer(first)
    assert torch.equal(layer.seen[-1], first)
    handle.remove()


def test_find_decoder_layers():
    class Inner(nn.Module):
        def __init__(self):
            super().__init__()
            self.layers = nn.ModuleList([_Layer() for _ in range(6)])

    class Wrapper(nn.Module):
        def __init__(self):
            super().__init__()
            self.language_model = Inner()

    class Model(nn.Module):
        def __init__(self):
            super().__init__()
            self.model = Wrapper()

    m = Model()
    assert find_decoder_layers(m, 6) is m.model.language_model.layers
    with pytest.raises(RuntimeError, match="could not locate"):
        find_decoder_layers(m, 7)   # wrong length must not silently match


def test_partner_map_same_dims_cyclic_derangement():
    items = [("a", (10, 20)), ("b", (10, 20)), ("c", (10, 20)),
             ("d", (30, 40)), ("e", (30, 40)), ("lone", (50, 60))]
    pm = partner_map(items)
    assert pm == {"a": "b", "b": "c", "c": "a", "d": "e", "e": "d"}
    assert "lone" not in pm
    assert all(k != v for k, v in pm.items())
    assert pm == partner_map(items)     # deterministic


def test_restoration_fraction():
    anchor, floor = [0.9, 0.8], [0.3, 0.5]
    assert restoration_fraction(anchor, floor, [0.9, 0.8]) == pytest.approx(1.0)
    assert restoration_fraction(anchor, floor, [0.3, 0.5]) == pytest.approx(0.0)
    assert restoration_fraction(anchor, floor, [0.6, 0.65]) == pytest.approx(0.5)
    assert restoration_fraction([0.5], [0.5], [0.7]) is None    # degenerate gap
    assert restoration_fraction([], [], []) is None
    with pytest.raises(ValueError):
        restoration_fraction([0.1], [0.2, 0.3], [0.1])


def test_bootstrap_restoration_deterministic_and_bracketing():
    n = 40
    anchor = [0.9 + 0.001 * i for i in range(n)]
    floor = [0.3 + 0.001 * i for i in range(n)]
    patched = [0.6 + 0.001 * i for i in range(n)]
    r1 = bootstrap_restoration(anchor, floor, patched, n_boot=500, seed=7)
    r2 = bootstrap_restoration(anchor, floor, patched, n_boot=500, seed=7)
    assert r1 == r2
    assert r1["fraction"] == pytest.approx(0.5, abs=1e-6)
    assert r1["ci95_lo"] <= r1["fraction"] <= r1["ci95_hi"]
    assert r1["n_degenerate"] == 0

    single = bootstrap_restoration([0.9], [0.3], [0.6], n_boot=10, seed=0)
    assert single["fraction"] == pytest.approx(0.5)
    assert single["ci95_lo"] is None    # n<2: no CI


def test_strip_md_fence():
    assert strip_md_fence("```markdown\n# T\n```") == "# T"
    assert strip_md_fence("```\nplain\n```") == "plain"
    assert strip_md_fence("```markdown\ntruncated") == "truncated"
    assert strip_md_fence("```python\nx=1\n```") == "```python\nx=1\n```"
    assert strip_md_fence("no fence") == "no fence"


def test_conditions_registry():
    assert CONDITIONS[:2] == ("anchor", "floor")
    assert set(CONDITIONS) >= {"patch_s2", "patch_s3",
                               "control_mismatch", "control_selfpatch"}
