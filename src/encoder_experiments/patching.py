"""B1 activation-patching primitives (docs/experiments.md §B1), pure parts.

Everything modal_patch.py needs that can be tested without a GPU:

- prefill-only forward-pre-hooks that swap (or capture) the hidden states at
  the IMAGE-TOKEN positions of a decoder layer's input. "Prefill" is detected
  as seq_len > 1: with batch 1 and greedy KV-cache generation, every decode
  step after the first forward has seq_len 1, so the patch lands exactly once
  and the KV cache carries it into generation.
- the two patch sites, expressed as which decoder layer's INPUT is swapped:
  layer 0's input is `inputs_embeds` after the vision scatter (S2); layer
  floor(n/2)'s input is hidden_states[n//2] — the same tensor
  modal_extract.extract_decoder_mid captures for the S3 probe site.
- the mismatched-page pairing for the negative control (same-pixel-dims
  cyclic derangement, so token grids always agree),
- restoration fraction (patched − floor)/(anchor − floor) with a paired
  doc-bootstrap CI.
"""

from __future__ import annotations

from typing import Any, Sequence

CONDITIONS = (
    "anchor",             # clean forward
    "floor",              # degraded forward
    "patch_s2",           # degraded + clean layer-0-input (inputs_embeds) patch
    "patch_s3",           # degraded + clean layer-floor(n/2)-input patch
    "control_mismatch",   # degraded + MISMATCHED page's clean S2 patch (must not restore)
    "control_selfpatch",  # clean + its own clean S2 patch (must be a no-op)
)


def parse_conditions(spec: str) -> tuple[str, ...]:
    """CONDITIONS subset from a comma list ('' -> all), normalized to
    CONDITIONS order; unknown names raise (a typo must not silently run
    the full six-condition sweep)."""
    names = [s.strip() for s in spec.split(",") if s.strip()]
    if not names:
        return CONDITIONS
    unknown = [n for n in names if n not in CONDITIONS]
    if unknown:
        raise ValueError(f"unknown conditions {unknown}; valid: {CONDITIONS}")
    return tuple(c for c in CONDITIONS if c in names)


def image_token_positions(input_ids_row, image_token_id: int):
    """1-D LongTensor of positions in one sequence holding image tokens.
    Raises if there are none (a patch with no target is a silent no-op bug)."""
    pos = (input_ids_row == image_token_id).nonzero(as_tuple=True)[0]
    if pos.numel() == 0:
        raise ValueError(f"no image tokens (id={image_token_id}) in sequence")
    return pos


def find_decoder_layers(model, n_layers: int):
    """Locate the decoder-layer ModuleList on a wrapped VLM stack.

    Tries the attribute paths seen across Qwen-family releases and validates
    by length against config.text_config.num_hidden_layers — a wrong grab
    (e.g. the vision blocks) fails loudly instead of hooking the wrong stack.
    """
    candidates = (
        "model.language_model.layers",
        "language_model.layers",
        "model.model.language_model.layers",
        "model.layers",
        "model.model.layers",
        "layers",
    )
    for path in candidates:
        obj: Any = model
        for name in path.split("."):
            obj = getattr(obj, name, None)
            if obj is None:
                break
        if obj is not None and hasattr(obj, "__len__") and len(obj) == n_layers:
            return obj
    raise RuntimeError(
        f"could not locate a {n_layers}-layer decoder ModuleList on "
        f"{type(model).__name__} (tried {candidates})"
    )


def _hook_hidden_states(args, kwargs):
    """(hidden_states, channel) where channel says how to put it back."""
    if args:
        return args[0], "args"
    if "hidden_states" in kwargs:
        return kwargs["hidden_states"], "kwargs"
    return None, None


class PrefillPatch:
    """forward_pre_hook payload: replace hidden_states[:, positions] with
    `patch` on prefill calls (seq_len > 1) only. Register with
    ``layer.register_forward_pre_hook(p.hook, with_kwargs=True)``.

    `patch` is [len(positions), D]; it is cast to the incoming dtype/device at
    apply time (a bf16 capture patched into a bf16 run is bit-exact, which is
    what makes the self-patch control a true no-op)."""

    def __init__(self, positions, patch):
        if patch.ndim != 2 or patch.shape[0] != positions.numel():
            raise ValueError(
                f"patch {tuple(patch.shape)} does not cover {positions.numel()} positions"
            )
        self.positions = positions
        self.patch = patch
        self.n_applied = 0

    def hook(self, module, args, kwargs):
        hs, channel = _hook_hidden_states(args, kwargs)
        if hs is None or hs.shape[1] <= 1:
            return None
        if int(self.positions.max()) >= hs.shape[1]:
            raise RuntimeError(
                f"patch positions (max {int(self.positions.max())}) exceed prefill "
                f"seq_len {hs.shape[1]} — clean/degraded token grids disagree"
            )
        hs = hs.clone()
        hs[:, self.positions.to(hs.device), :] = self.patch.to(hs.device, hs.dtype)
        self.n_applied += 1
        if channel == "args":
            return (hs, *args[1:]), kwargs
        kwargs = dict(kwargs)
        kwargs["hidden_states"] = hs
        return args, kwargs


class PrefillCapture:
    """forward_pre_hook payload: record hidden_states[0, positions] of the
    FIRST prefill call (the layer's input, i.e. hidden_states[layer_idx] in
    extract_decoder_mid's indexing). Non-mutating."""

    def __init__(self, positions):
        self.positions = positions
        self.value = None

    def hook(self, module, args, kwargs):
        hs, _ = _hook_hidden_states(args, kwargs)
        if hs is None or hs.shape[1] <= 1 or self.value is not None:
            return None
        self.value = hs[0, self.positions.to(hs.device), :].detach().clone()
        return None


def partner_map(items: Sequence[tuple[str, tuple[int, int]]]) -> dict[str, str]:
    """Mismatched-page pairing: id -> partner id with IDENTICAL pixel dims
    (so both pages realize the same token grid), cyclic shift within each
    dims-group in input order. Groups of one get no partner (their
    control_mismatch is skipped and recorded as such)."""
    groups: dict[tuple[int, int], list[str]] = {}
    for image_id, dims in items:
        groups.setdefault(tuple(dims), []).append(image_id)
    out: dict[str, str] = {}
    for ids in groups.values():
        if len(ids) < 2:
            continue
        for i, image_id in enumerate(ids):
            out[image_id] = ids[(i + 1) % len(ids)]
    return out


def strip_md_fence(text: str) -> str:
    """Unwrap a whole-output ```markdown fence (mirror of
    modal_frontier._strip_md_fence — inner code fences are content and stay)."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    first_nl = stripped.find("\n")
    if first_nl == -1:
        return stripped
    tag = stripped[3:first_nl].strip().lower()
    if tag not in ("", "markdown", "md"):
        return stripped
    body = stripped[first_nl + 1:]
    if body.rstrip().endswith("```"):
        return body.rstrip()[:-3].strip()
    if tag:
        return body.strip()
    return stripped


# Restoration math (assembler side; no torch)

_DENOM_EPS = 1e-9


def restoration_fraction(
    anchor: Sequence[float], floor: Sequence[float], patched: Sequence[float]
) -> float | None:
    """(mean(patched) − mean(floor)) / (mean(anchor) − mean(floor)) over PAIRED
    per-doc scores. None when the anchor−floor gap is degenerate (no
    degradation effect to restore)."""
    if not (len(anchor) == len(floor) == len(patched)):
        raise ValueError("restoration inputs must be paired per-doc lists")
    if not anchor:
        return None
    ma = sum(anchor) / len(anchor)
    mf = sum(floor) / len(floor)
    mp = sum(patched) / len(patched)
    denom = ma - mf
    if abs(denom) < _DENOM_EPS:
        return None
    return (mp - mf) / denom


def bootstrap_restoration(
    anchor: Sequence[float],
    floor: Sequence[float],
    patched: Sequence[float],
    n_boot: int = 2000,
    seed: int = 0,
) -> dict:
    """Doc-bootstrap CI for the restoration fraction: resample docs (paired
    across the three conditions), 2.5/97.5 percentiles. Resamples with a
    degenerate anchor−floor gap are dropped (counted in n_degenerate)."""
    import numpy as np

    point = restoration_fraction(anchor, floor, patched)
    n = len(anchor)
    result = {
        "n_docs": n,
        "fraction": None if point is None else round(float(point), 6),
        "ci95_lo": None,
        "ci95_hi": None,
        "n_boot": n_boot,
        "n_degenerate": 0,
    }
    if point is None or n < 2:
        return result
    a = np.asarray(anchor, dtype=np.float64)
    f = np.asarray(floor, dtype=np.float64)
    p = np.asarray(patched, dtype=np.float64)
    rng = np.random.default_rng(seed)
    fracs = []
    degenerate = 0
    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        denom = a[idx].mean() - f[idx].mean()
        if abs(denom) < _DENOM_EPS:
            degenerate += 1
            continue
        fracs.append((p[idx].mean() - f[idx].mean()) / denom)
    result["n_degenerate"] = degenerate
    if fracs:
        lo, hi = np.percentile(np.asarray(fracs), [2.5, 97.5])
        result["ci95_lo"] = round(float(lo), 6)
        result["ci95_hi"] = round(float(hi), 6)
    return result
