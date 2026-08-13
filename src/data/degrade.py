"""Scan degradation for the Exp 1 probe data: born-digital page -> plausible scan.

The probe families need the SAME page at several "how badly was this scanned"
levels, with ground-truth coordinates that are still exact afterwards. That
forces a strict split between the two kinds of corruption:

  GEOMETRIC   one explicit 2x3 affine per (page, severity) - rotation, skew,
              mild scale, translation - applied to the pixels with
              cv2.warpAffine AND to every normalized coordinate in the
              sidecars. Sidecar coords therefore stay exact, not approximate.

  PHOTOMETRIC everything else (paper, toner, grime, lighting, noise, blur,
              low-DPI resampling, JPEG). Every op here is
              PIXEL-POSITION-PRESERVING: nothing folds, warps, curls, shifts
              or rescales the content. Augraphy augmentations that displace
              pixels (Folding, BookBinding, Squish, SectionShift, InkShifter,
              Geometric, GlitchEffect, DoubleExposure, PixelBleed, Moire,
              PageBorder ...) are deliberately NOT in the roster.

So: a coordinate probe can trust `scan_geom_matrix`, and only that matrix.

Severity ladder (SEVERITY_PRESETS below is the single place to retune):
  0  born-digital, untouched
  1  light office scan       (clean flatbed, faint grain, mild skew)
  2  typical photocopy       (desaturated, toner texture, lamp gradient)
  3  aged / re-scanned copy  (stains, bleed-through, drum streaks, real skew)
  4  fax-grade               (near-binarized, heavy grime, dropout lines)

BOOK-SCAN variants '1b'/'2b'/'3b' (BOOK_PRESETS) compose on top of severities
1-3: deep amber/tan/cream/grey-white book paper (PAPER_TONES 8-11, modeled on
real scanned math books), a one-sided PHOTOMETRIC gutter shadow (recto/verso
per-page seeded; no geometric page curl - banned by the GT contract), darker
outer margins and occasional brown foxing spots. Desat is disabled there: book
pages are color scans, the tone must survive.

Realism rules baked into the ops (the "does this look synthetic" failure modes):
  * paper is never flat - low-frequency mottle + fibre grain under everything;
  * grime is per-page unique (fractal fields drawn from a per-page RNG), never
    a repeated stamp and never tiled;
  * noise interacts with ink - grain amplitude rises at toner edges, dropouts
    only eat ink, dust clusters instead of spreading uniformly;
  * no pitch-black page borders - edge shadows are shallow, optional, and land
    on one or two sides at most;
  * every page draws its own scanner profile, so a stack of pages varies.

Determinism: all randomness comes from a per-(image_id, severity, seed) RNG
derived by hashing those three (blake2b). No global RNG reuse, no clock. The
augraphy bridge pins `random` / `np.random` global state per op from that same
stream, which was verified deterministic for every op in the roster. Same
inputs + same seed => byte-identical PNGs.

Usage:
  uv run python src/data/degrade.py --pdfs '<glob>' --out <dir> --severity sweep
  uv run python src/data/degrade.py --images '<glob>' --severity 3 --out <dir>
  uv run python src/data/degrade.py --pdfs '<glob>' --sidecars <dir> --out <dir> \
      --severity sweep --seed 1234
  uv run python src/data/degrade.py --selftest        # cross-target geometry check

Sidecars (--sidecars DIR) are passed through with coordinates transformed and
nothing else touched. Recognised: `<stem>.cells.json`, `<stem>.pixels.json`,
`<stem>.layout.json`, `<stem>.p<page>.sidecar.json`. Layout sidecars are the
Canonical17 items list with COCO-style `bbox = [x, y, w, h]` (NOT corners):
each bbox becomes the axis-aligned hull of the affined rect, exactly like the
{x,y,w,h} rect path; `class` / `text` / `attrs` pass through verbatim.
Cells sidecars have TWO producers with different `bbox` conventions — the
replicator's corners [x0,y0,x1,y1] vs the table-generator's [x,y,w,h] — so the
convention is sniffed PER FILE from the self-describing payload
(`detect_cells_bbox_convention`: coords string, then schema keys, then the
corner geometric invariant) and each file is transformed in, and stays in, its
own convention. Coordinate convention everywhere - input and
output - is normalized [0,1] over the page, x rightward, y downward
(top-left origin), matching encoder_experiments/sites.py.
"""

from __future__ import annotations

import argparse
import glob as globlib
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

# --------------------------------------------------------------------------
# Severity presets - the retuning surface. Ranges are (lo, hi), sampled
# uniformly per page; probabilities are per page.
# --------------------------------------------------------------------------

# Paper substrate colours, BGR. Index range per severity (lo, hi_exclusive).
PAPER_TONES: list[tuple[int, int, int]] = [
    (253, 253, 253),  # 0 bright office white
    (250, 251, 252),  # 1 cool white
    (245, 247, 249),  # 2 slightly warm white
    (238, 242, 246),  # 3 cream
    (232, 238, 244),  # 4 aged cream
    (226, 233, 241),  # 5 yellowed
    (233, 234, 232),  # 6 grey recycled
    (222, 230, 240),  # 7 old newsprint-ish
    # Book-scan tones (indices 8-11), matched against the real scanned-book
    # samples in math-scanned-old-example-templates: the browned letterpress
    # pages sit around RGB(215,185,135), the clean ones near warm cream /
    # grey-white. Only the *b presets index into this range.
    (122, 180, 214),  # 8 deep amber (browned letterpress)
    (160, 198, 222),  # 9 aged tan
    (205, 227, 240),  # 10 warm cream
    (222, 227, 226),  # 11 grey-white (old cover stock)
]

SEVERITY_PRESETS: dict[int, dict[str, Any]] = {
    0: {
        "label": "born-digital (untouched)",
        "geom": {"rot_deg": 0.0, "skew_deg": 0.0, "shift_frac": 0.0, "scale_jitter": 0.0},
        "photo": None,  # None => bit-exact passthrough of the render
    },
    1: {
        "label": "light office scan",
        "geom": {"rot_deg": 0.30, "skew_deg": 0.12, "shift_frac": 0.0025, "scale_jitter": 0.0015},
        "photo": {
            "paper_tone": (0, 3),
            "tone_strength": 0.45,
            "blotch": 0.014,          # low-frequency paper mottle, fraction of white
            "fibre": 0.009,           # fine grain in the substrate
            "lighting": (0.03, 0.07), # smooth lamp falloff amplitude
            "vignette": (0.015, 0.045),
            "desat": 0.12,
            "ink_ops": (("InkMottling", 0.35), ("InkBleed", 0.25)),
            "toner_dropout": 0.0,
            "bleed_p": 0.10,
            "stains": (0, 1),
            "stain_alpha": (0.02, 0.05),
            "drum_p": 0.0,
            "band": 0.0,
            "specks": (0, 30),
            "speck_dark": (0.15, 0.40),
            "edge_shadow_p": 0.12,
            "edge_shadow": (0.04, 0.09),
            "scan_edge_p": 0.15,
            "gamma": (0.97, 1.05),
            "contrast": (1.00, 1.06),
            "binarize": None,
            "blur": (0.05, 0.10),  # v5 (user): blur pinned to 0.05-0.1 everywhere
            "low_dpi": (0.92, 1.00),
            "noise": (1.0, 2.2),
            "noise_edge": 1.2,
            "fax_lines": 0.0,
            "jpeg": (88, 96),
            "aug": (("SubtleNoise", 0.45), ("BrightnessTexturize", 0.35)),
        },
    },
    2: {
        "label": "typical photocopy",
        "geom": {"rot_deg": 0.80, "skew_deg": 0.30, "shift_frac": 0.006, "scale_jitter": 0.004},
        "photo": {
            "paper_tone": (1, 6),
            "tone_strength": 0.7,
            "blotch": 0.030,
            "fibre": 0.016,
            "lighting": (0.06, 0.13),
            "vignette": (0.04, 0.10),
            "desat": 0.75,
            "desat_bimodal": 0.55,   # judge fix: full-B/W copy or honest color, never half
            "ink_ops": (("InkMottling", 0.5), ("InkBleed", 0.4), ("Letterpress", 0.30)),
            "toner_dropout": 0.05,
            "bleed_p": 0.30,
            "stains": (0, 2),
            "stain_alpha": (0.04, 0.10),
            "drum_p": 0.25,
            "band": 0.020,
            "specks": (20, 140),
            "speck_dark": (0.20, 0.55),
            "edge_shadow_p": 0.35,
            "edge_shadow": (0.06, 0.14),
            "scan_edge_p": 0.30,
            "gamma": (0.88, 1.02),
            "contrast": (1.05, 1.22),
            "binarize": None,
            "blur": (0.05, 0.10),  # v5 (user): blur pinned to 0.05-0.1 everywhere
            "low_dpi": (0.72, 0.90),
            "noise": (2.0, 3.8),
            "noise_edge": 1.8,
            "fax_lines": 0.0,
            "jpeg": (72, 88),
            "aug": (("SubtleNoise", 0.6), ("BrightnessTexturize", 0.45), ("NoiseTexturize", 0.3)),
        },
    },
    3: {
        "label": "aged, re-scanned copy",
        "geom": {"rot_deg": 1.80, "skew_deg": 0.70, "shift_frac": 0.012, "scale_jitter": 0.008},
        "photo": {
            "paper_tone": (3, 8),
            "tone_strength": 0.95,
            "blotch": 0.055,
            "fibre": 0.024,
            "lighting": (0.07, 0.14),
            "vignette": (0.05, 0.11),
            # LEGIBILITY IS THE CONSTRAINT (user, v3): every line of text stays
            # human-readable; "aged" comes from tone, stains and mild speckle —
            # never from stroke destruction. The v2 toner/Letterpress bumps that
            # compensated for the blur cut ate thin glyphs; reverted below.
            "desat": 0.88,
            "desat_bimodal": 0.70,   # 70% full-B/W copies, else colors survive honestly
            "ink_ops": (("InkMottling", 0.6), ("InkBleed", 0.45), ("Letterpress", 0.40),
                        ("LowInkRandomLines", 0.15)),
            "toner_dropout": 0.09,
            "bleed_p": 0.65,
            "stains": (1, 3),
            "stain_alpha": (0.05, 0.14),
            "drum_p": 0.5,
            "band": 0.022,
            "specks": (80, 280),
            "speck_dark": (0.22, 0.55),
            "edge_shadow_p": 0.5,
            "edge_shadow": (0.08, 0.20),
            "scan_edge_p": 0.45,
            "gamma": (0.88, 1.00),
            "contrast": (1.06, 1.22),
            "binarize": None,
            # user feedback 2026-08-05: aged copies must stay CRISP — age shows in
            # toner erosion/specks/stains, not defocus. Blur cut ~3x, resample mild;
            # toner_dropout/Letterpress above carry the "aged" read instead.
            "blur": (0.05, 0.10),  # v5 (user): blur pinned to 0.05-0.1 everywhere
            "low_dpi": (0.85, 1.0),
            "noise": (2.2, 4.0),
            "noise_edge": 2.4,
            "fax_lines": 0.0,
            "jpeg": (60, 80),
            "aug": (("SubtleNoise", 0.7), ("NoiseTexturize", 0.5), ("DirtyDrum", 0.35),
                    ("Stains", 0.25), ("BrightnessTexturize", 0.4)),
        },
    },
    4: {
        "label": "fax-grade",
        "geom": {"rot_deg": 3.00, "skew_deg": 1.20, "shift_frac": 0.020, "scale_jitter": 0.012},
        "photo": {
            "paper_tone": (2, 8),
            "tone_strength": 1.0,
            "blotch": 0.075,
            "fibre": 0.030,
            # fax/contact scan: near-uniform illumination, tiny vignette -
            # anything stronger dips below the binarize threshold and paints
            # black corners, the classic synthetic tell.
            "lighting": (0.04, 0.10),
            "vignette": (0.02, 0.07),
            # LEGIBILITY IS THE CONSTRAINT (user, v3): a real fax of normal text
            # is ugly but readable — jaggies and 1-bit character, not shredded
            # strokes. Downsample floor raised, ink destruction halved.
            "desat": 1.0,
            "ink_ops": (("Letterpress", 0.45), ("LowInkPeriodicLines", 0.25),
                        ("LowInkRandomLines", 0.25), ("InkBleed", 0.5)),
            "toner_dropout": 0.12,
            "bleed_p": 0.55,
            "stains": (0, 2),
            "stain_alpha": (0.04, 0.10),
            "drum_p": 0.45,
            "band": 0.030,
            "specks": (100, 350),
            "speck_dark": (0.25, 0.65),
            "edge_shadow_p": 0.55,
            "edge_shadow": (0.10, 0.24),
            "scan_edge_p": 0.55,
            "gamma": (0.85, 1.00),
            "contrast": (1.15, 1.40),
            # near-binarization: sigmoid steepness, threshold as FRACTION OF THE
            # PAGE'S PAPER LEVEL (fax thresholds adapt - any ink goes dark, faint
            # ink is not bleached to white), spatial wobble
            # user feedback 2026-08-05: real fax output is SHARP — 1-bit, jagged,
            # never soft. Blur is sensor-level only; harder sigmoid; nearest-neighbor
            # up-resample supplies the jaggies that read as "fax" to a human.
            "binarize": {"k": (30.0, 60.0), "t_frac": (0.84, 0.91), "wobble": (0.02, 0.04)},
            "blur": (0.05, 0.10),  # v5 (user): blur pinned to 0.05-0.1 everywhere
            "low_dpi": (0.70, 0.85),   # v4: jaggies survive, small glyphs stay whole
            "low_dpi_up": "nearest",
            "noise": (3.0, 5.5),
            "noise_edge": 2.8,
            "fax_lines": 0.45,
            "jpeg": (46, 64),
            # v3: BadPhotoCopy, DirtyDrum and Stains all removed at sev4 — any
            # mid-gray texture they add gets slammed to black by the hard
            # threshold, producing the toner-storm clusters that made pages
            # unreadable. Fax character = jaggies + specks + dropout lines.
            "aug": (("SubtleNoise", 0.8), ("NoiseTexturize", 0.3)),
        },
    },
}

SEVERITIES = tuple(sorted(SEVERITY_PRESETS))


# --------------------------------------------------------------------------
# BOOK-SCAN variants ("1b".."3b"): compose on top of the numeric severities.
# Modeled on the real scanned-book pages in math-scanned-old-example-templates:
#   * deep amber/tan substrate on the letterpress-era pages, warm cream or
#     grey-white on the clean ones (PAPER_TONES 8-11);
#   * a one-sided gutter shadow (recto/verso, per-page seeded) — PHOTOMETRIC
#     ONLY, a smooth multiplicative band; page curl / geometric warp is banned
#     by the GT contract;
#   * slightly darker outer margins + occasional foxing (small brown blotches,
#     stain machinery with a brown absorb).
# A book page is photographed/scanned in COLOR — the tone must survive — so
# the B/W-copier desat branch is disabled (desat_bimodal would grayscale the
# amber away on most pages).
# --------------------------------------------------------------------------

def _book_variant(base_sev: int, *, paper_tone: tuple[int, int],
                  tone_strength: float, gutter_depth: tuple[float, float],
                  gutter_width: tuple[float, float], margin_dark: tuple[float, float],
                  foxing: tuple[int, int], fox_alpha: tuple[float, float]) -> dict[str, Any]:
    import copy  # noqa: PLC0415
    preset = copy.deepcopy(SEVERITY_PRESETS[base_sev])
    preset["label"] = SEVERITY_PRESETS[base_sev]["label"] + ", book-scan"
    ph = preset["photo"]
    ph["paper_tone"] = paper_tone
    ph["tone_strength"] = tone_strength
    ph["desat"] = 0.05              # color scan of a book page; tone survives
    ph.pop("desat_bimodal", None)   # never the full-B/W copier branch
    # Book paper is smoother than the recycled-cardboard read the heavier
    # numeric presets give: age lives in the TONE, not in coarse mottle.
    # NoiseTexturize adds a fabric-weave surface and DirtyDrum paints
    # copier-drum speckle streaks - neither exists on a scanned book page.
    ph["blotch"] = min(ph["blotch"], 0.035)
    ph["fibre"] = min(ph["fibre"], 0.013)
    ph["drum_p"] = 0.0
    ph["aug"] = tuple((n, pr) for n, pr in ph["aug"]
                      if n not in ("NoiseTexturize", "DirtyDrum"))
    ph["book"] = {
        "gutter_depth": gutter_depth,   # multiplicative darkening at the spine
        "gutter_width": gutter_width,   # band width, fraction of page width
        "margin_dark": margin_dark,     # outer-margin darkening amplitude
        "foxing": foxing,               # count range of brown blotches
        "fox_alpha": fox_alpha,         # blotch absorption strength
    }
    return preset


BOOK_PRESETS: dict[str, dict[str, Any]] = {
    "1b": _book_variant(1, paper_tone=(10, 12), tone_strength=0.80,
                        gutter_depth=(0.10, 0.18), gutter_width=(0.10, 0.18),
                        margin_dark=(0.02, 0.06), foxing=(0, 4),
                        fox_alpha=(0.06, 0.14)),
    "2b": _book_variant(2, paper_tone=(8, 12), tone_strength=0.92,
                        gutter_depth=(0.15, 0.28), gutter_width=(0.12, 0.22),
                        margin_dark=(0.04, 0.09), foxing=(1, 6),
                        fox_alpha=(0.08, 0.18)),
    "3b": _book_variant(3, paper_tone=(8, 10), tone_strength=1.0,
                        gutter_depth=(0.20, 0.38), gutter_width=(0.14, 0.26),
                        margin_dark=(0.05, 0.12), foxing=(2, 8),
                        fox_alpha=(0.10, 0.22)),
}

BOOK_SEVERITIES = tuple(BOOK_PRESETS)
ALL_PRESETS: dict[Any, dict[str, Any]] = {**SEVERITY_PRESETS, **BOOK_PRESETS}


def _base_severity(severity: int | str) -> int:
    s = str(severity)
    return int(s[:-1]) if s.endswith("b") else int(s)

# Augraphy augmentations allowed in the roster. Every one of these was checked
# to (a) preserve image shape, (b) preserve pixel positions, (c) be
# deterministic under pinned `random` / `np.random` global state.
AUGRAPHY_ALLOWED = frozenset({
    "SubtleNoise", "BrightnessTexturize", "NoiseTexturize", "InkMottling", "InkBleed",
    "Letterpress", "BleedThrough", "DirtyDrum", "BadPhotoCopy", "Stains",
    "LowInkPeriodicLines", "LowInkRandomLines",
})


# --------------------------------------------------------------------------
# Deterministic per-page randomness
# --------------------------------------------------------------------------

def page_seed(image_id: str, severity: int | str, base_seed: int) -> int:
    """Stable 63-bit seed for one (page, severity). No clock, no global state.
    Book severities ("2b") hash distinctly from their numeric base (2)."""
    key = f"{image_id}\x00{severity}\x00{base_seed}".encode()
    return int.from_bytes(hashlib.blake2b(key, digest_size=8).digest(), "big") >> 1


def page_rng(image_id: str, severity: int | str, base_seed: int) -> np.random.Generator:
    return np.random.default_rng(page_seed(image_id, severity, base_seed))


def _u(rng: np.random.Generator, rangepair: tuple[float, float]) -> float:
    lo, hi = rangepair
    return float(lo) if hi <= lo else float(rng.uniform(lo, hi))


def _i(rng: np.random.Generator, rangepair: tuple[int, int]) -> int:
    lo, hi = rangepair
    return int(lo) if hi <= lo else int(rng.integers(lo, hi))


# --------------------------------------------------------------------------
# Geometry - the explicit affine, in pixels and in normalized page coords
# --------------------------------------------------------------------------

def build_affine(
    rng: np.random.Generator, w: int, h: int, geom: dict[str, float]
) -> tuple[np.ndarray, np.ndarray, dict[str, float]]:
    """(M_px, M_norm, params). Both are 2x3 forward maps: src point -> dst point.

    M_px acts on pixel (x, y); M_norm on normalized (u, v) = (x/w, y/h).
    cv2.warpAffine without WARP_INVERSE_MAP treats its matrix as src->dst, so
    the very same M_px that moves the pixels also moves the coordinates.
    """
    rot = float(rng.uniform(-1, 1)) * geom["rot_deg"]
    skew = float(rng.uniform(-1, 1)) * geom["skew_deg"]
    sx = 1.0 + float(rng.uniform(-1, 1)) * geom["scale_jitter"]
    sy = 1.0 + float(rng.uniform(-1, 1)) * geom["scale_jitter"]
    tx = float(rng.uniform(-1, 1)) * geom["shift_frac"] * w
    ty = float(rng.uniform(-1, 1)) * geom["shift_frac"] * h

    cx, cy = w / 2.0, h / 2.0
    th = math.radians(rot)
    cos_t, sin_t = math.cos(th), math.sin(th)
    R = np.array([[cos_t, -sin_t], [sin_t, cos_t]], dtype=np.float64)
    Sh = np.array([[1.0, math.tan(math.radians(skew))], [0.0, 1.0]], dtype=np.float64)
    S = np.array([[sx, 0.0], [0.0, sy]], dtype=np.float64)
    L = R @ Sh @ S                                   # linear part
    t = np.array([cx + tx, cy + ty]) - L @ np.array([cx, cy])

    M_px = np.hstack([L, t.reshape(2, 1)])           # 2x3
    M_norm = np.array([
        [L[0, 0], L[0, 1] * h / w, t[0] / w],
        [L[1, 0] * w / h, L[1, 1], t[1] / h],
    ], dtype=np.float64)
    params = {"rot_deg": rot, "skew_deg": skew, "scale_x": sx, "scale_y": sy,
              "shift_x_px": tx, "shift_y_px": ty}
    return M_px, M_norm, params


IDENTITY_2X3 = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])


def xf_point(M: np.ndarray, x: float, y: float) -> tuple[float, float]:
    return (M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2])


def xf_bbox(M: np.ndarray, bbox) -> list[float]:
    """[x0,y0,x1,y1] -> axis-aligned hull of the transformed rectangle."""
    x0, y0, x1, y1 = (float(v) for v in bbox)
    pts = [xf_point(M, x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return [min(xs), min(ys), max(xs), max(ys)]


def _linear_scale(M: np.ndarray) -> float:
    det = abs(M[0, 0] * M[1, 1] - M[0, 1] * M[1, 0])
    return math.sqrt(det) if det > 0 else 1.0


# --------------------------------------------------------------------------
# Sidecar pass-through: transform coordinates, touch nothing else
# --------------------------------------------------------------------------

SIDECAR_SUFFIXES = (".cells.json", ".pixels.json", ".sidecar.json", ".layout.json")


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _bboxlike(v) -> bool:
    return isinstance(v, (list, tuple)) and len(v) == 4 and all(_num(x) for x in v)


def _round(v: float) -> float:
    return round(float(v), 6)


# Two cells.json producers exist with DIFFERENT bbox conventions for the very
# same "bbox" key (the files are self-describing — never guess by generator):
#   - failing-table-replicator: corner bboxes [x0, y0, x1, y1]; its `coords`
#     string says so ("bbox=[x0,y0,x1,y1]") and its tables carry n_rows /
#     n_cols with dom_row / dom_slot / is_header / row_span / col_span cells;
#   - table-generator (groundTruth.mjs): COCO-style [x, y, w, h]; its tables
#     carry grid_rows / grid_cols with grid_row / grid_col / rowspan /
#     colspan / tag ("th"/"td") cells and no bbox spec in `coords`.
# Transforming an xywh bbox down the corner path scrambles it (the hull of an
# inverted rect), so every cells.json gets its convention detected per file.

_CORNER_CELL_KEYS = frozenset({"dom_row", "dom_slot", "is_header", "row_span", "col_span"})
_XYWH_CELL_KEYS = frozenset({"grid_row", "grid_col", "rowspan", "colspan", "tag"})


def detect_cells_bbox_convention(data: Any) -> str:
    """Sniff a cells.json payload -> "corners" | "xywh".

    Evidence, strongest first: (1) the `coords` self-description naming the
    bbox layout; (2) the producer schema keys on tables/cells; (3) the corner
    geometric invariant (x1 >= x0, y1 >= y0 — any violation proves xywh).
    Raises when no evidence resolves, rather than silently scrambling coords.
    """
    if not isinstance(data, dict):
        raise ValueError("cells.json payload is not an object; cannot sniff bbox convention")

    coords = data.get("coords")
    if isinstance(coords, str):
        c = coords.lower().replace(" ", "")
        if "x0,y0,x1,y1" in c or "[x0,y0,x1,y1]" in c:
            return "corners"
        if "x,y,w,h" in c or "[x,y,w,h]" in c or "coco" in c:
            return "xywh"

    corner_votes = 0
    xywh_votes = 0
    bboxes: list[list[float]] = []
    tables = data.get("tables")
    for table in tables if isinstance(tables, list) else []:
        if not isinstance(table, dict):
            continue
        if "n_rows" in table or "n_cols" in table:
            corner_votes += 1
        if "grid_rows" in table or "grid_cols" in table:
            xywh_votes += 1
        if _bboxlike(table.get("bbox")):
            bboxes.append(table["bbox"])
        cells = table.get("cells")
        for cell in cells if isinstance(cells, list) else []:
            if not isinstance(cell, dict):
                continue
            keys = set(cell)
            if keys & _CORNER_CELL_KEYS:
                corner_votes += 1
            if keys & _XYWH_CELL_KEYS:
                xywh_votes += 1
            if _bboxlike(cell.get("bbox")):
                bboxes.append(cell["bbox"])
    if corner_votes and not xywh_votes:
        return "corners"
    if xywh_votes and not corner_votes:
        return "xywh"

    # geometric invariant: corners always satisfy x1 >= x0 and y1 >= y0
    if any(b[2] < b[0] or b[3] < b[1] for b in bboxes):
        return "xywh"

    raise ValueError(
        "cannot detect cells.json bbox convention (no coords self-description, "
        f"ambiguous schema keys: corner_votes={corner_votes} xywh_votes={xywh_votes}); "
        "refusing to guess — a wrong convention silently scrambles every bbox"
    )


def _is_cells_payload(data: Any) -> bool:
    return isinstance(data, dict) and isinstance(data.get("tables"), list)


class _Ctx:
    """Traversal context: the matrix plus a companion coord for lone scalars.

    Chart sidecars store axis ticks as a bare `y` (a horizontal gridline) or a
    bare `x` (a vertical one). A line has no single image under an affine, so
    we evaluate it at the chart's plot-rect centre - exact for the point of the
    line that sits at the plot centre, which is what tick readouts sample.
    """

    __slots__ = ("M", "scale", "ref", "bbox_fmt")

    def __init__(self, M: np.ndarray, ref: tuple[float, float] = (0.5, 0.5),
                 bbox_fmt: str = "corners"):
        if bbox_fmt not in ("corners", "xywh"):
            raise ValueError(f"bbox_fmt must be 'corners' or 'xywh', got {bbox_fmt!r}")
        self.M = M
        self.scale = _linear_scale(M)
        self.ref = ref
        self.bbox_fmt = bbox_fmt

    def with_ref(self, ref: tuple[float, float]) -> "_Ctx":
        c = _Ctx(self.M, ref, self.bbox_fmt)
        return c


def _xf_bbox_fmt(M: np.ndarray, bbox, fmt: str) -> list[float]:
    """Transform one bbox 4-vector in its file's convention, staying in that
    convention: corners -> hull corners; xywh -> hull re-expressed as xywh."""
    if fmt == "xywh":
        x, y, w, h = (float(v) for v in bbox)
        x0, y0, x1, y1 = xf_bbox(M, [x, y, x + w, y + h])
        return [_round(x0), _round(y0), _round(x1 - x0), _round(y1 - y0)]
    return [_round(c) for c in xf_bbox(M, bbox)]


def _xf_node(node: Any, ctx: _Ctx) -> Any:
    if isinstance(node, list):
        return [_xf_node(v, ctx) for v in node]
    if not isinstance(node, dict):
        return node

    # A chart's plotRect centre becomes the companion coord for its axis ticks.
    pr = node.get("plotRect")
    if isinstance(pr, dict) and all(_num(pr.get(k)) for k in ("x", "y", "w", "h")):
        ctx = ctx.with_ref((pr["x"] + pr["w"] / 2.0, pr["y"] + pr["h"] / 2.0))

    out: dict[str, Any] = {}
    done: set[str] = set()
    M = ctx.M

    has_xy = _num(node.get("x")) and _num(node.get("y"))
    has_wh = _num(node.get("w")) and _num(node.get("h"))
    if has_xy and has_wh:                                    # rect {x,y,w,h}
        x0, y0, x1, y1 = xf_bbox(M, [node["x"], node["y"],
                                     node["x"] + node["w"], node["y"] + node["h"]])
        out.update(x=_round(x0), y=_round(y0), w=_round(x1 - x0), h=_round(y1 - y0))
        done |= {"x", "y", "w", "h"}
    elif has_xy:                                             # point {x,y}
        px, py = xf_point(M, node["x"], node["y"])
        out.update(x=_round(px), y=_round(py))
        done |= {"x", "y"}
    elif _num(node.get("x")):                                # lone x (v-line)
        px, _ = xf_point(M, node["x"], ctx.ref[1])
        out["x"] = _round(px)
        done.add("x")
    elif _num(node.get("y")):                                # lone y (h-line)
        _, py = xf_point(M, ctx.ref[0], node["y"])
        out["y"] = _round(py)
        done.add("y")

    if _num(node.get("xCenter")) and _num(node.get("yCenter")):
        px, py = xf_point(M, node["xCenter"], node["yCenter"])
        out.update(xCenter=_round(px), yCenter=_round(py))
        done |= {"xCenter", "yCenter"}
    elif _num(node.get("xCenter")):
        px, _ = xf_point(M, node["xCenter"], ctx.ref[1])
        out["xCenter"] = _round(px)
        done.add("xCenter")
    elif _num(node.get("yCenter")):
        _, py = xf_point(M, ctx.ref[0], node["yCenter"])
        out["yCenter"] = _round(py)
        done.add("yCenter")

    for k, v in node.items():
        if k in done:
            continue
        if k.startswith("svg_"):        # raw svg user space - never page coords
            out[k] = v
        elif k == "bbox" and _bboxlike(v):
            out[k] = _xf_bbox_fmt(M, v, ctx.bbox_fmt)
        elif k == "bbox" and isinstance(v, list) and all(_bboxlike(b) for b in v) and v:
            out[k] = [_xf_bbox_fmt(M, b, ctx.bbox_fmt) for b in v]
        elif k in ("r", "radius") and _num(v):
            out[k] = _round(v * ctx.scale)
        elif k in ("w", "h") and _num(v):   # length with no anchor to rotate about
            out[k] = _round(v * ctx.scale)
        else:
            out[k] = _xf_node(v, ctx)
    return out


def transform_sidecar(
    data: Any,
    M_norm: np.ndarray,
    severity: int | str,
    *,
    page_index: int | None = None,
    extra: dict[str, Any] | None = None,
    bbox_fmt: str | None = None,
) -> Any:
    """Sidecar in -> sidecar out with every page coordinate through M_norm.

    Only coordinates change. Labels, text, spans, indices and the raw `svg_*`
    debug fields are copied verbatim.

    `bbox_fmt` fixes the convention of `bbox` 4-vectors ("corners" or "xywh").
    When None it is detected per file: cells.json payloads (a `tables` list)
    are sniffed with `detect_cells_bbox_convention`; everything else keeps the
    historical corner convention. Either way the output stays in the INPUT's
    convention, so downstream consumers see the producer's own schema.
    """
    if bbox_fmt is None:
        bbox_fmt = (detect_cells_bbox_convention(data)
                    if _is_cells_payload(data) else "corners")
    ctx = _Ctx(np.asarray(M_norm, dtype=np.float64), bbox_fmt=bbox_fmt)
    out = _xf_node(data, ctx)
    if not isinstance(out, dict):
        out = {"records": out}
    out["scan_severity"] = _base_severity(severity)
    out["severity_key"] = str(severity)
    out["scan_geom_matrix"] = [[_round(v) for v in row] for row in np.asarray(M_norm)]
    out["geom_valid"] = True
    out["scan_bbox_fmt"] = bbox_fmt
    if bbox_fmt == "xywh":
        out["scan_coords"] = (
            "normalized [0,1] over the DEGRADED page image; x rightward, y downward "
            "(top-left origin). Every coordinate above is scan_geom_matrix applied to "
            "the original; bboxes are [x,y,w,h] of the axis-aligned hull of the "
            "transformed rect (input convention preserved)."
        )
    else:
        out["scan_coords"] = (
            "normalized [0,1] over the DEGRADED page image; x rightward, y downward "
            "(top-left origin). Every coordinate above is scan_geom_matrix applied to "
            "the original; bboxes are the axis-aligned hull of the transformed rect."
        )
    if page_index is not None:
        out["scan_page_index"] = int(page_index)
    if extra:
        out.update(extra)
    return out


def _layout_scale(data: Any) -> float:
    """Layout-sidecar coordinate scale: 1000.0 for v2 integer 0-1000 sidecars
    (Qwen-VL grounding convention), 1.0 for v1 normalized-float ones. Detects
    by `version` first, then by the `coords` string."""
    if isinstance(data, dict):
        if data.get("version") == 2:
            return 1000.0
        coords = data.get("coords")
        if isinstance(coords, str) and "integer 0-1000" in coords:
            return 1000.0
    return 1.0


def _int_bbox_1000(x: float, y: float, w: float, h: float) -> list[int]:
    """v2 emission rule (mirror of the generators' intBbox): each value =
    round(norm*1000) half-up (JS Math.round) clamped to [0,1000]; then w,h
    floored at 1 and x,y re-clamped so x+w<=1000, y+h<=1000."""
    def q(v: float) -> int:
        return max(0, min(1000, int(math.floor(v * 1000.0 + 0.5))))
    wi, hi = max(1, q(w)), max(1, q(h))
    xi = min(q(x), 1000 - wi)
    yi = min(q(y), 1000 - hi)
    return [xi, yi, wi, hi]


def _xf_layout_item(item: Any, M: np.ndarray, scale: float = 1.0) -> Any:
    """One `<stem>.layout.json` item. Its bbox is COCO-style [x, y, w, h] - NOT
    the [x0,y0,x1,y1] the generic `bbox` key means elsewhere - so it gets a
    dedicated pass: de-scale to normalized floats (v2 ints /1000; v1 already
    normalized), axis-aligned hull of the affined rect, back to [x,y,w,h] at
    the input's scale (v2 re-rounded to ints, v1 kept float). Every other
    field (class, text, attrs, reading_order, ...) is copied verbatim."""
    if not isinstance(item, dict):
        return item
    out = dict(item)
    bb = item.get("bbox")
    if _bboxlike(bb):
        x, y, bw, bh = (float(v) / scale for v in bb)
        x0, y0, x1, y1 = xf_bbox(M, [x, y, x + bw, y + bh])
        if scale == 1.0:
            out["bbox"] = [_round(x0), _round(y0), _round(x1 - x0), _round(y1 - y0)]
        else:
            out["bbox"] = _int_bbox_1000(x0, y0, x1 - x0, y1 - y0)
    return out


def transform_layout_sidecar(
    data: Any,
    M_norm: np.ndarray,
    severity: int | str,
    *,
    page_index: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """`<stem>.layout.json` in -> out: every item bbox through M_norm, nothing
    else touched. Handles BOTH sidecar versions: v1 normalized floats stay
    float; v2 integer 0-1000 bboxes are de-scaled to normalized floats, put
    through the exact same affine hull, then re-scaled and re-rounded to ints
    (deterministic). Top-level fields (version, ontology, coords, page_*_px,
    ...) ride along verbatim; the same scan_* stamps as `transform_sidecar`
    are added. scan_geom_matrix operates on NORMALIZED coords in both cases."""
    M = np.asarray(M_norm, dtype=np.float64)
    scale = _layout_scale(data)
    if isinstance(data, dict):
        out: dict[str, Any] = dict(data)
        if isinstance(out.get("items"), list):
            out["items"] = [_xf_layout_item(it, M, scale) for it in out["items"]]
    else:   # bare items list
        out = {"items": [_xf_layout_item(it, M, scale) for it in data]}
    out["scan_severity"] = _base_severity(severity)
    out["severity_key"] = str(severity)
    out["scan_geom_matrix"] = [[_round(v) for v in row] for row in np.asarray(M_norm)]
    out["geom_valid"] = True
    if scale == 1.0:
        out["scan_coords"] = (
            "normalized [0,1] over the DEGRADED page image; x rightward, y downward "
            "(top-left origin). Every item bbox [x,y,w,h] is the axis-aligned hull of "
            "scan_geom_matrix applied to the original rect."
        )
    else:
        out["scan_coords"] = (
            "integer 0-1000 scale over the DEGRADED page image; x rightward, y downward "
            "(top-left origin). Every item bbox [x,y,w,h] is the axis-aligned hull of "
            "scan_geom_matrix applied to the original rect in normalized coords, "
            "re-rounded to integers."
        )
    if page_index is not None:
        out["scan_page_index"] = int(page_index)
    if extra:
        out.update(extra)
    return out


def find_sidecars(sidecar_dir: Path | None, stem: str, page_index: int) -> list[Path]:
    """Sidecar files that belong to (doc stem, page). Per-page files win by name;
    doc-level files (cells/pixels/layout) attach to page 0."""
    if sidecar_dir is None:
        return []
    hits = [p for p in (sidecar_dir / f"{stem}.p{page_index}.sidecar.json",) if p.exists()]
    if page_index == 0:
        for suf in (".cells.json", ".pixels.json", ".sidecar.json", ".layout.json"):
            p = sidecar_dir / f"{stem}{suf}"
            if p.exists():
                hits.append(p)
    return hits


# --------------------------------------------------------------------------
# Noise fields (per-page unique, never tiled)
# --------------------------------------------------------------------------

def _fbm(rng: np.random.Generator, h: int, w: int, base_cells: float = 3.0,
         octaves: int = 4, persistence: float = 0.55) -> np.ndarray:
    """Fractal value noise in [0,1], random phase, non-repeating."""
    field = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        cells = base_cells * (2 ** o)
        gw = max(2, int(round(cells)))
        gh = max(2, int(round(cells * h / max(w, 1))))
        g = rng.random((gh, gw), dtype=np.float32)
        field += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        norm += amp
        amp *= persistence
    field /= norm
    lo, hi = float(field.min()), float(field.max())
    return (field - lo) / max(hi - lo, 1e-6)


def _grain(rng: np.random.Generator, h: int, w: int, sigma_px: float = 0.8) -> np.ndarray:
    """Zero-mean spatially correlated grain, unit std. Scanner grain is not
    per-pixel white noise - it clumps."""
    n = rng.standard_normal((h, w), dtype=np.float32)
    if sigma_px > 0:
        n = cv2.GaussianBlur(n, (0, 0), sigma_px)
    s = float(n.std())
    return n / max(s, 1e-6)


def _ink_map(img: np.ndarray) -> np.ndarray:
    """0 on paper, 1 on solid toner - the handle every ink-aware op uses."""
    gray = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    paper = max(float(np.percentile(gray, 92)), 32.0)
    return np.clip((paper - gray) / paper, 0.0, 1.0)


def _modulate(img: np.ndarray, field: np.ndarray, ink: np.ndarray | None = None,
              ink_protect: float = 0.0) -> np.ndarray:
    """Multiply by a scalar field; `ink_protect` keeps toner from being bleached."""
    m = field
    if ink is not None and ink_protect > 0:
        m = 1.0 + (field - 1.0) * (1.0 - ink_protect * ink)
    return img * m[..., None]


# --------------------------------------------------------------------------
# Photometric ops - all pixel-position-preserving
# --------------------------------------------------------------------------

def op_paper(img, rng, ink, p):
    h, w = ink.shape
    tone = np.array(PAPER_TONES[_i(rng, p["paper_tone"])], np.float32) / 255.0
    tone = 1.0 + (tone - 1.0) * p["tone_strength"]
    img = img * tone[None, None, :]
    blotch = (_fbm(rng, h, w, base_cells=float(rng.uniform(1.5, 3.5))) - 0.5) * 2.0
    fibre = _grain(rng, h, w, sigma_px=float(rng.uniform(0.5, 0.9)))
    field = 1.0 + blotch * p["blotch"] + fibre * p["fibre"]
    return _modulate(img, field, ink, ink_protect=0.75)


def op_stains(img, rng, ink, p):
    """Organic grime blobs. Count, shape, colour and placement are per page, so
    no two pages share a stain."""
    n = _i(rng, p["stains"])
    if n <= 0:
        return img
    h, w = ink.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for _ in range(n):
        cx, cy = float(rng.uniform(0.03, 0.97)) * w, float(rng.uniform(0.03, 0.97)) * h
        rx = float(rng.uniform(0.05, 0.30)) * w
        ry = rx * float(rng.uniform(0.5, 1.8))
        d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
        window = np.clip(1.0 - d, 0.0, 1.0) ** float(rng.uniform(0.6, 1.6))
        blob = _fbm(rng, h, w, base_cells=float(rng.uniform(2.0, 6.0)), octaves=5)
        thr = float(rng.uniform(0.35, 0.55))
        mask = np.clip((blob - thr) / 0.30, 0.0, 1.0) * window
        mask = cv2.GaussianBlur(mask, (0, 0), max(1.0, min(rx, ry) * 0.06))
        alpha = _u(rng, p["stain_alpha"])
        # Per-channel absorption, BGR: a tea/coffee stain eats blue hardest, so
        # the residue reads brown rather than grey. A stain also sits ON the ink,
        # hence a plain multiply over all pixels.
        absorb = np.array([1.0,
                           float(rng.uniform(0.55, 0.90)),
                           float(rng.uniform(0.30, 0.75))], np.float32)
        if rng.random() < 0.25:                       # some grime is just grey
            absorb[:] = float(rng.uniform(0.85, 1.0))
        img = img * (1.0 - alpha * mask[..., None] * absorb[None, None, :])
        # Judge-panel fix: liquid wicks into toner — under a strong stain, ink
        # edges feather instead of staying razor-sharp. Positionally exact
        # (gaussian blend, no displacement); weight capped so text stays legible.
        wick = np.clip(mask * alpha * 6.0, 0.0, 0.45).astype(np.float32)
        if float(wick.max()) > 0.02:
            soft = cv2.GaussianBlur(img, (0, 0), 0.9)
            img = img * (1.0 - wick[..., None]) + soft * wick[..., None]
    return img


def op_toner_dropout(img, rng, ink, p):
    """Photocopier toner gaps: ink thins where the drum under-delivered. Ink-only
    by construction - paper is untouched."""
    strength = p["toner_dropout"]
    if strength <= 0:
        return img
    h, w = ink.shape
    field = _fbm(rng, h, w, base_cells=float(rng.uniform(6.0, 16.0)), octaves=4)
    thr = float(np.quantile(field, 1.0 - strength * float(rng.uniform(0.8, 1.4))))
    gap = np.clip((field - thr) / 0.12, 0.0, 1.0)
    gap = cv2.GaussianBlur(gap, (0, 0), 0.8) * ink
    paper = float(np.percentile(cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2GRAY), 92))
    return img + (paper - img) * (gap[..., None] * float(rng.uniform(0.55, 0.95)))


def op_bands(img, rng, ink, p):
    """Photocopy / drum banding: smooth 1-D density variation across one axis
    plus a couple of narrow streaks."""
    amp = p["band"]
    if amp <= 0:
        return img
    h, w = ink.shape
    vertical = bool(rng.random() < 0.65)
    n = w if vertical else h
    prof = _fbm(rng, 1, n, base_cells=float(rng.uniform(4.0, 20.0)), octaves=3)[0]
    prof = 1.0 + (prof - prof.mean()) * 2.0 * amp
    for _ in range(int(rng.integers(0, 4))):
        c = int(rng.integers(0, n))
        wdt = max(1, int(rng.integers(1, max(2, n // 220))))
        depth = float(rng.uniform(0.02, 0.10))
        lo, hi = max(0, c - wdt), min(n, c + wdt)
        prof[lo:hi] *= 1.0 - depth
    prof = cv2.GaussianBlur(prof.reshape(1, -1), (0, 0), 1.2).reshape(-1)
    field = np.tile(prof, (h, 1)) if vertical else np.tile(prof.reshape(-1, 1), (1, w))
    return _modulate(img, field.astype(np.float32), ink, ink_protect=0.3)


def op_lighting(img, rng, ink, p):
    """Lamp falloff + vignette. Light hits ink as well as paper, so no ink
    protection here."""
    h, w = ink.shape
    amp = _u(rng, p["lighting"])
    field = 1.0 + (_fbm(rng, h, w, base_cells=float(rng.uniform(1.0, 2.2)), octaves=2)
                   - 0.5) * 2.0 * amp
    vig = _u(rng, p["vignette"])
    if vig > 0:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        cx = w * float(rng.uniform(0.35, 0.65))
        cy = h * float(rng.uniform(0.35, 0.65))
        r = np.sqrt(((xx - cx) / w) ** 2 + ((yy - cy) / h) ** 2) / 0.75
        field *= 1.0 - vig * np.clip(r, 0.0, 1.4) ** 2.2
    return img * field[..., None]


def op_edge_shadow(img, rng, ink, p, quad: np.ndarray | None):
    """A shallow lid/lift shadow on one or two sides, plus (sometimes) the
    genuine page edge left by the skew. Never a black frame."""
    h, w = ink.shape
    out = img
    if rng.random() < p["edge_shadow_p"]:
        depth = _u(rng, p["edge_shadow"])
        sides = list(rng.permutation(4)[: int(rng.integers(1, 3))])
        field = np.ones((h, w), np.float32)
        for s in sides:
            width = float(rng.uniform(0.015, 0.06))
            if s in (0, 1):
                d = np.arange(w, dtype=np.float32) / w
                prof = np.exp(-(d if s == 0 else 1.0 - d) / width)
                field *= 1.0 - depth * prof[None, :]
            else:
                d = np.arange(h, dtype=np.float32) / h
                prof = np.exp(-(d if s == 2 else 1.0 - d) / width)
                field *= 1.0 - depth * prof[:, None]
        out = out * field[..., None]
    if quad is not None and rng.random() < p["scan_edge_p"]:
        # outside-the-page region: platen backing, a touch darker, plus a soft
        # edge line. Kept shallow - a black border on every page reads as fake.
        mask = np.zeros((h, w), np.uint8)
        cv2.fillConvexPoly(mask, quad.astype(np.int32), 255)
        outside = (mask == 0).astype(np.float32)
        if outside.mean() > 1e-4:
            outside_s = cv2.GaussianBlur(outside, (0, 0), 1.2)
            # Under a binarize preset the platen tint must stay ABOVE the fax
            # threshold (0.84-0.93 of paper), or the whole border slams to black —
            # the "black frame on every page" tell. Keep it barely-there instead.
            tint = (float(rng.uniform(0.965, 0.995)) if p.get("binarize")
                    else float(rng.uniform(0.86, 0.97)))
            out = out * (1.0 - outside_s[..., None] * (1.0 - tint))
            line = cv2.GaussianBlur(
                cv2.morphologyEx(mask, cv2.MORPH_GRADIENT,
                                 np.ones((3, 3), np.uint8)).astype(np.float32) / 255.0,
                (0, 0), float(rng.uniform(0.6, 1.6)))
            out = out * (1.0 - line[..., None] * float(rng.uniform(0.10, 0.30)))
    return out


def op_foxing(img, rng, ink, b):
    """Foxing: the small rust-brown blotches of aged book paper (clearly visible
    on the grey-white cover sample). Same machinery as op_stains — a windowed
    fbm mask, per-channel absorption — but small radii and an always-brown
    absorb (blue eaten hardest). Alpha is capped low enough that text under a
    spot stays readable. Pixel-position-preserving (pure multiply)."""
    n = _i(rng, b["foxing"])
    if n <= 0:
        return img
    h, w = ink.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for _ in range(n):
        cx = float(rng.uniform(0.04, 0.96)) * w
        cy = float(rng.uniform(0.03, 0.97)) * h
        rx = float(rng.uniform(0.010, 0.035)) * w
        ry = rx * float(rng.uniform(0.7, 1.4))
        d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
        window = np.clip(1.0 - d, 0.0, 1.0) ** float(rng.uniform(0.8, 1.8))
        blob = _fbm(rng, h, w, base_cells=float(rng.uniform(6.0, 14.0)), octaves=3)
        mask = np.clip((blob - 0.40) / 0.25, 0.0, 1.0) * window
        mask = cv2.GaussianBlur(mask, (0, 0), max(0.8, min(rx, ry) * 0.10))
        alpha = _u(rng, b["fox_alpha"])
        absorb = np.array([1.0,                                  # B eaten hardest
                           float(rng.uniform(0.45, 0.70)),       # G partial
                           float(rng.uniform(0.20, 0.45))],      # R survives -> brown
                          np.float32)
        img = img * (1.0 - alpha * mask[..., None] * absorb[None, None, :])
    return img


def op_book_shadow(img, rng, ink, b):
    """Gutter shadow + page-edge darkening of an open-book scan.

    PHOTOMETRIC ONLY: a smooth one-sided multiplicative band with raised-cosine
    falloff toward the spine (left or right, per-page seeded — recto/verso),
    modulated slowly along the page so the shadow breathes like a real spine,
    plus a shallower darkening of the outer margins. No geometric warp — page
    curl is banned by the GT contract. Like op_lighting, light hits ink as well
    as paper, so no ink protection."""
    h, w = ink.shape
    left = bool(rng.random() < 0.5)                       # recto/verso
    depth = _u(rng, b["gutter_depth"])
    width = max(_u(rng, b["gutter_width"]), 1e-3)
    xu = np.arange(w, dtype=np.float32) / max(w - 1, 1)
    d = xu if left else 1.0 - xu
    t = np.clip(d / width, 0.0, 1.0)
    prof = (0.5 + 0.5 * np.cos(np.pi * t)).astype(np.float32)
    wobble = _fbm(rng, 1, h, base_cells=2.0, octaves=2)[0]  # breathes along y
    field = 1.0 - depth * prof[None, :] * (0.85 + 0.30 * wobble[:, None])

    m = _u(rng, b["margin_dark"])
    if m > 0:
        # outer vertical edge (opposite the spine) darkest, top/bottom lighter
        yv = np.arange(h, dtype=np.float32) / max(h - 1, 1)
        for axis_d, horizontal, weight in (((1.0 - xu) if left else xu, True, 1.0),
                                           (yv, False, 0.6),
                                           (1.0 - yv, False, 0.6)):
            ew = float(rng.uniform(0.02, 0.05))
            eprof = np.exp(-axis_d / ew).astype(np.float32) * m * weight
            field = field * (1.0 - (eprof[None, :] if horizontal else eprof[:, None]))
    return img * field[..., None]


def op_tone_response(img, rng, ink, p):
    """Desaturation + copier gamma/contrast curve.

    Judge-panel fix: partial desaturation is a synthetic tell ("vivid green bars
    on a page dressed as a B/W photocopy"). Real pages are bimodal — a copy is
    FULLY grayscale, a color scan keeps its colors. `desat_bimodal` = probability
    this page went through a B/W copier; otherwise colors survive nearly intact."""
    desat = p["desat"]
    bimodal = p.get("desat_bimodal")
    if bimodal is not None:
        desat = 1.0 if rng.random() < bimodal else float(rng.uniform(0.05, 0.25))
    if desat > 0:
        gray = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)
        img = img * (1.0 - desat) + gray.astype(np.float32)[..., None] * desat
    x = np.clip(img / 255.0, 0.0, 1.0)
    x = x ** _u(rng, p["gamma"])
    c = _u(rng, p["contrast"])
    x = np.clip((x - 0.5) * c + 0.5, 0.0, 1.0)
    return x * 255.0


def op_binarize(img, rng, ink, p):
    """Severity-4 near-binarization, AFTER the optics stage (a fax thresholds
    what its sensor saw, blur included). The threshold sits at a fraction of
    this page's OWN paper level, so faint ink lands below it and goes dark
    instead of being bleached to white; a wobble field breaks strokes and
    speckles the odd background patch, which is what real fax grime does."""
    b = p.get("binarize")
    if not b:
        return img
    h, w = ink.shape
    x = np.clip(img / 255.0, 0.0, 1.0)
    lum = x.mean(axis=2)
    paper = float(np.percentile(lum, 88))
    t = paper * _u(rng, b["t_frac"]) + (
        _fbm(rng, h, w, base_cells=float(rng.uniform(2.0, 6.0))) - 0.5
    ) * 2.0 * _u(rng, b["wobble"])
    k = _u(rng, b["k"])
    x = 1.0 / (1.0 + np.exp(-k * (x - t[..., None])))
    return x * 255.0


def op_optics(img, rng, ink, p):
    """Defocus then the resample chain of a low-DPI scan (down, then back up).

    Real scanners keep type crisp — degradation lives in noise/toner, not focus —
    so blur sigmas stay small everywhere. The up-resample interpolation is
    preset-controlled: "cubic" (smooth, photocopy) or "nearest" (jaggies — the
    fax look; real 1-bit fax output is brutally sharp, never soft)."""
    sigma = _u(rng, p["blur"])
    if sigma > 0.05:
        img = cv2.GaussianBlur(img, (0, 0), sigma)
    f = _u(rng, p["low_dpi"])
    if f < 0.995:
        h, w = img.shape[:2]
        up = cv2.INTER_NEAREST if p.get("low_dpi_up") == "nearest" else cv2.INTER_CUBIC
        small = cv2.resize(img, (max(8, int(round(w * f))), max(8, int(round(h * f)))),
                           interpolation=cv2.INTER_AREA)
        img = cv2.resize(small, (w, h), interpolation=up)
    return img


def op_sensor_noise(img, rng, ink, p):
    """Grain whose amplitude rises at toner edges (real scanner noise interacts
    with ink), plus clustered dust and fax dropout lines."""
    h, w = ink.shape
    edge = cv2.morphologyEx(ink, cv2.MORPH_GRADIENT, np.ones((3, 3), np.float32))
    edge = cv2.GaussianBlur(edge, (0, 0), 1.6)
    edge /= max(float(edge.max()), 1e-6)
    amp = _u(rng, p["noise"]) * (1.0 + p["noise_edge"] * edge + 0.35 * ink)
    img = img + _grain(rng, h, w, sigma_px=float(rng.uniform(0.35, 0.9)))[..., None] * amp[..., None]

    n_specks = _i(rng, p["specks"])
    if n_specks > 0:
        density = _fbm(rng, h, w, base_cells=float(rng.uniform(2.0, 5.0)))  # dirt clusters
        flat = (density ** 3).ravel()
        idx = rng.choice(flat.size, size=n_specks, replace=True, p=flat / flat.sum())
        ys, xs = np.unravel_index(idx, (h, w))
        speck = np.zeros((h, w), np.float32)
        for y, x in zip(ys.tolist(), xs.tolist()):
            r = int(rng.integers(0, 3))
            cv2.circle(speck, (x, y), r, float(rng.uniform(0.4, 1.0)), -1)
        speck = cv2.GaussianBlur(speck, (0, 0), 0.6)
        img = img - speck[..., None] * 255.0 * _u(rng, p["speck_dark"])

    if p.get("fax_lines", 0.0) > 0 and rng.random() < p["fax_lines"]:
        for _ in range(int(rng.integers(1, 5))):
            y = int(rng.integers(0, h))
            th = int(rng.integers(1, 3))
            if rng.random() < 0.6:      # dropout (white streak)
                img[y:y + th] = img[y:y + th] * float(rng.uniform(1.05, 1.30))
            else:                       # smeared dark line
                img[y:y + th] = img[y:y + th] * float(rng.uniform(0.70, 0.92))
    return img


def op_jpeg(img, rng, p):
    q = _i(rng, p["jpeg"])
    ok, buf = cv2.imencode(".jpg", np.clip(img, 0, 255).astype(np.uint8),
                           [int(cv2.IMWRITE_JPEG_QUALITY), q])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR).astype(np.float32) if ok else img


# --------------------------------------------------------------------------
# Augraphy bridge - curated roster only, global RNG state pinned per op
# --------------------------------------------------------------------------

_AUG_MOD: Any = None
_AUG_TRIED = False


def _augraphy():
    global _AUG_MOD, _AUG_TRIED
    if not _AUG_TRIED:
        _AUG_TRIED = True
        try:
            import augraphy  # noqa: PLC0415
            _AUG_MOD = augraphy
        except Exception:       # pragma: no cover - native ops cover everything
            _AUG_MOD = None
    return _AUG_MOD


def _aug_builders(A) -> dict[str, Callable[[np.random.Generator], Any]]:
    """Tuned constructors. Augraphy defaults are far too heavy-handed for a
    believable page (BadPhotoCopy in particular paints a black cloud)."""
    return {
        "SubtleNoise": lambda r: A.SubtleNoise(subtle_range=int(r.integers(5, 14))),
        "BrightnessTexturize": lambda r: A.BrightnessTexturize(
            texturize_range=(0.93, 0.99), deviation=float(r.uniform(0.008, 0.03))),
        "NoiseTexturize": lambda r: A.NoiseTexturize(
            sigma_range=(2, 6), turbulence_range=(2, 5),
            texture_width_range=(int(r.integers(150, 400)), int(r.integers(400, 900))),
            texture_height_range=(int(r.integers(150, 400)), int(r.integers(400, 900)))),
        "InkMottling": lambda r: A.InkMottling(
            ink_mottling_alpha_range=(0.05, 0.18),
            ink_mottling_noise_scale_range=(1, 2),
            ink_mottling_gaussian_kernel_range=(3, 5)),
        "InkBleed": lambda r: A.InkBleed(
            intensity_range=(0.1, 0.3), kernel_size=(3, 3), severity=(0.1, 0.3)),
        "Letterpress": lambda r: A.Letterpress(
            n_samples=(80, 260), n_clusters=(200, 500), std_range=(500, 2500),
            value_range=(210, 255), value_threshold_range=(112, 160), blur=1),
        "BleedThrough": lambda r: A.BleedThrough(
            intensity_range=(0.05, 0.20), color_range=(48, 224), ksize=(17, 17), sigmaX=1,
            alpha=float(r.uniform(0.06, 0.20)),
            offsets=(int(r.integers(4, 24)), int(r.integers(4, 24)))),
        "DirtyDrum": lambda r: A.DirtyDrum(
            line_width_range=(1, 3), line_concentration=float(r.uniform(0.01, 0.06)),
            direction=int(r.integers(0, 3)), noise_intensity=float(r.uniform(0.1, 0.4)),
            noise_value=(0, 24), ksize=(3, 3), sigmaX=0),
        "BadPhotoCopy": lambda r: A.BadPhotoCopy(
            noise_type=int(r.integers(1, 6)), noise_side="random",
            noise_iteration=(1, 1), noise_size=(1, 2), noise_value=(96, 160),
            noise_sparsity=(0.5, 0.85), noise_concentration=(0.01, 0.06),
            blur_noise=1, wave_pattern=0, edge_effect=0),
        "Stains": lambda r: A.Stains(
            stains_type="random", stains_blend_method="darken",
            stains_blend_alpha=float(r.uniform(0.05, 0.20))),
        "LowInkPeriodicLines": lambda r: A.LowInkPeriodicLines(
            count_range=(1, 3), period_range=(20, 60), use_consistent_lines=True,
            noise_probability=0.05),
        "LowInkRandomLines": lambda r: A.LowInkRandomLines(
            count_range=(2, 6), use_consistent_lines=True, noise_probability=0.05),
    }


def apply_augraphy(name: str, img: np.ndarray, seed: int) -> np.ndarray | None:
    """Run one roster augmentation. Returns None if unavailable / misbehaving.

    Shape is asserted, so an op that ever starts resizing gets dropped rather
    than silently invalidating coordinates.
    """
    if name not in AUGRAPHY_ALLOWED:
        raise ValueError(f"{name} is not in the position-preserving roster")
    A = _augraphy()
    if A is None:
        return None
    builders = _aug_builders(A)
    if name not in builders:
        return None
    src = np.clip(img, 0, 255).astype(np.uint8)
    try:
        random.seed(seed)          # augraphy reads both global streams
        np.random.seed(seed % (2 ** 32))
        out = builders[name](np.random.default_rng(seed))(src.copy())
    except Exception:
        return None
    if out is None or not isinstance(out, np.ndarray):
        return None
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    if out.shape[:2] != src.shape[:2] or out.dtype != np.uint8:
        return None
    return out.astype(np.float32)


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------

def degrade_image(
    img_bgr: np.ndarray, image_id: str, severity: int | str, base_seed: int = 0
) -> tuple[np.ndarray, dict[str, Any]]:
    """One page -> (degraded BGR uint8, metadata incl. the 2x3 matrices)."""
    if severity not in ALL_PRESETS:
        raise ValueError(f"severity {severity} not in {SEVERITIES + BOOK_SEVERITIES}")
    preset = ALL_PRESETS[severity]
    h, w = img_bgr.shape[:2]
    rng = page_rng(image_id, severity, base_seed)
    seed = page_seed(image_id, severity, base_seed)

    meta: dict[str, Any] = {
        "image_id": image_id,
        "scan_severity": _base_severity(severity),
        "severity_key": str(severity),
        "severity_label": preset["label"],
        "seed": seed,
        "base_seed": base_seed,
        "image_w_px": w,
        "image_h_px": h,
        "geom_valid": True,
        "ops": [],
    }

    if preset["photo"] is None and all(v == 0 for v in preset["geom"].values()):
        meta["scan_geom_matrix"] = IDENTITY_2X3.tolist()
        meta["scan_geom_matrix_px"] = IDENTITY_2X3.tolist()
        meta["geom_params"] = {k: 0.0 for k in ("rot_deg", "skew_deg", "scale_x", "scale_y",
                                                "shift_x_px", "shift_y_px")}
        return np.ascontiguousarray(img_bgr), meta

    M_px, M_norm, gparams = build_affine(rng, w, h, preset["geom"])
    meta["scan_geom_matrix"] = [[float(v) for v in row] for row in M_norm]
    meta["scan_geom_matrix_px"] = [[float(v) for v in row] for row in M_px]
    meta["geom_params"] = gparams

    src = img_bgr.astype(np.float32)
    border = [float(np.percentile(src[..., c], 96)) for c in range(3)]
    img = cv2.warpAffine(src, M_px.astype(np.float32), (w, h), flags=cv2.INTER_CUBIC,
                         borderMode=cv2.BORDER_CONSTANT, borderValue=border)
    meta["ops"].append("affine")
    quad = cv2.transform(np.array([[[0, 0], [w, 0], [w, h], [0, h]]], np.float32),
                         M_px.astype(np.float32))[0]

    p = preset["photo"]
    if p is None:
        out = np.clip(img, 0, 255).astype(np.uint8)
        return np.ascontiguousarray(out), meta

    ink = _ink_map(img)                       # from the clean warp, before grime

    # ---- ink / toner stage -------------------------------------------------
    for name, prob in p["ink_ops"]:
        if rng.random() < prob:
            got = apply_augraphy(name, img, int(rng.integers(1, 2 ** 31 - 1)))
            if got is not None:
                img = got
                meta["ops"].append(f"aug:{name}")
    if p["toner_dropout"] > 0:
        img = op_toner_dropout(img, rng, ink, p)
        meta["ops"].append("toner_dropout")

    # ---- substrate ---------------------------------------------------------
    img = op_paper(img, rng, ink, p)
    meta["ops"].append("paper")

    if rng.random() < p["bleed_p"]:
        got = apply_augraphy("BleedThrough", img, int(rng.integers(1, 2 ** 31 - 1)))
        if got is not None:
            img = got
            meta["ops"].append("aug:BleedThrough")

    # ---- grime -------------------------------------------------------------
    img = op_stains(img, rng, ink, p)
    meta["ops"].append("stains")
    if p.get("book"):                       # book variants only: rng sequence
        img = op_foxing(img, rng, ink, p["book"])   # of numeric presets untouched
        meta["ops"].append("foxing")
    if rng.random() < p["drum_p"]:
        img = op_bands(img, rng, ink, p)
        meta["ops"].append("bands")

    # ---- illumination ------------------------------------------------------
    img = op_lighting(img, rng, ink, p)
    img = op_edge_shadow(img, rng, ink, p, quad)
    meta["ops"] += ["lighting", "edge_shadow"]
    if p.get("book"):
        img = op_book_shadow(img, rng, ink, p["book"])
        meta["ops"].append("book_shadow")

    # ---- extra texture from the curated augraphy roster --------------------
    for name, prob in p["aug"]:
        if rng.random() < prob:
            got = apply_augraphy(name, img, int(rng.integers(1, 2 ** 31 - 1)))
            if got is not None:
                img = got
                meta["ops"].append(f"aug:{name}")

    # ---- copier tone curve, optics, fax threshold, sensor, codec -----------
    img = op_tone_response(img, rng, ink, p)
    img = op_optics(img, rng, ink, p)
    meta["ops"] += ["tone_response", "optics"]
    if p.get("binarize"):
        img = op_binarize(img, rng, ink, p)
        meta["ops"].append("binarize")
    img = op_sensor_noise(img, rng, ink, p)
    img = op_jpeg(img, rng, p)
    meta["ops"] += ["sensor_noise", "jpeg"]

    out = np.clip(img, 0, 255).astype(np.uint8)
    return np.ascontiguousarray(out), meta


# --------------------------------------------------------------------------
# Rasterization / IO
# --------------------------------------------------------------------------

def rasterize_pdf(pdf_path: Path, dpi: int) -> list[np.ndarray]:
    import pymupdf  # noqa: PLC0415

    pages = []
    with pymupdf.open(pdf_path) as doc:
        for page in doc:
            pm = page.get_pixmap(dpi=dpi, alpha=False)
            arr = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.h, pm.w, pm.n)
            pages.append(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) if pm.n == 3
                         else cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR))
    return pages


def process_page(
    img: np.ndarray, stem: str, page_index: int, n_pages: int, severity: int | str,
    out_dir: Path, base_seed: int, sidecar_dir: Path | None, dpi: int | None,
) -> dict[str, Any]:
    page_id = stem if n_pages == 1 else f"{stem}__p{page_index}"
    out_img, meta = degrade_image(img, page_id, severity, base_seed)
    meta["page_index"] = page_index
    meta["source_dpi"] = dpi
    img_path = out_dir / f"{page_id}__sev{severity}.png"
    cv2.imwrite(str(img_path), out_img)

    M_norm = np.asarray(meta["scan_geom_matrix"], dtype=np.float64)
    written = []
    for sc in find_sidecars(sidecar_dir, stem, page_index):
        data = json.loads(sc.read_text())
        xf = (transform_layout_sidecar if sc.name.endswith(".layout.json")
              else transform_sidecar)
        moved = xf(
            data, M_norm, severity, page_index=page_index,
            extra={"scan_source_sidecar": sc.name, "scan_image": img_path.name},
        )
        suffix = "".join(sc.suffixes[-2:]) if len(sc.suffixes) >= 2 else sc.suffix
        name = sc.name[: -len(suffix)] if sc.name.endswith(suffix) else sc.stem
        dest = out_dir / f"{page_id}__sev{severity}{suffix}"
        dest.write_text(json.dumps(moved, ensure_ascii=False, indent=1))
        written.append(dest.name)
        del name
    meta["sidecars"] = written
    meta["image"] = img_path.name
    (out_dir / f"{page_id}__sev{severity}.degrade.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


def run(args: argparse.Namespace) -> int:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    sidecar_dir = Path(args.sidecars) if args.sidecars else None
    if args.severity == "sweep":
        severities: list[int | str] = list(SEVERITIES)
    elif args.severity == "sweep-book":
        severities = list(BOOK_SEVERITIES)
    else:
        severities = [args.severity if args.severity in BOOK_PRESETS else int(args.severity)]

    inputs = sorted(globlib.glob(args.pdfs if args.pdfs else args.images))
    if args.limit:
        inputs = inputs[: args.limit]
    if not inputs:
        raise SystemExit(f"no inputs match {args.pdfs or args.images!r}")

    manifest = []
    for path in inputs:
        src = Path(path)
        if args.pdfs:
            pages = rasterize_pdf(src, args.dpi)
            stem = src.stem
        else:
            im = cv2.imread(str(src), cv2.IMREAD_COLOR)
            if im is None:
                print(f"! unreadable image, skipped: {src}")
                continue
            pages, stem = [im], src.stem
        for pi, page in enumerate(pages):
            for sev in severities:
                meta = process_page(page, stem, pi, len(pages), sev, out_dir,
                                    args.seed, sidecar_dir, args.dpi if args.pdfs else None)
                manifest.append(meta)
                print(f"{meta['image']}  {meta['severity_label']}  "
                      f"rot={meta['geom_params']['rot_deg']:+.2f}deg  "
                      f"ops={len(meta['ops'])}  sidecars={len(meta['sidecars'])}")
    (out_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(m, ensure_ascii=False) + "\n" for m in manifest))
    print(f"done: {len(manifest)} output page(s) -> {out_dir}")
    return 0


# --------------------------------------------------------------------------
# Self-test: a calibration page of crosses at known normalized coordinates
# --------------------------------------------------------------------------

def make_calibration_page(w: int = 1275, h: int = 1650, cols: int = 5, rows: int = 7,
                          seed: int = 0) -> tuple[np.ndarray, list[tuple[float, float]], int]:
    """White page with black crosses on a jittered grid + filler ink so the
    ink-aware ops have something to chew on. Returns (image, points, arm_px)."""
    rng = np.random.default_rng(seed)
    img = np.full((h, w, 3), 255, np.uint8)
    arm, thick = 13, 3
    pts: list[tuple[float, float]] = []
    for r in range(rows):
        for c in range(cols):
            x = int((c + 0.5) / cols * w + rng.uniform(-18, 18))
            y = int((r + 0.5) / rows * h + rng.uniform(-18, 18))
            x = int(np.clip(x, 70, w - 70))
            y = int(np.clip(y, 70, h - 70))
            cv2.line(img, (x - arm, y), (x + arm, y), (0, 0, 0), thick, cv2.LINE_AA)
            cv2.line(img, (x, y - arm), (x, y + arm), (0, 0, 0), thick, cv2.LINE_AA)
            pts.append((x / w, y / h))
    # filler text lines, kept clear of every cross
    for _ in range(220):
        x = int(rng.integers(40, w - 340))
        y = int(rng.integers(40, h - 40))
        if any(abs(x + 150 - px * w) < 215 and abs(y - py * h) < 32 for px, py in pts):
            continue
        cv2.putText(img, "the quick brown fox 0123456789", (x, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (40, 40, 40), 1, cv2.LINE_AA)
    return img, pts, arm


def detect_cross(gray: np.ndarray, cx: float, cy: float, arm: int) -> tuple[float, float] | None:
    """Sub-pixel cross centre near (cx, cy): coarse template peak, then a
    SEPARABLE refinement - x from the vertical arm only, y from the horizontal
    arm only. Separability is what survives grime: a dropout that eats half an
    arm shifts a joint centroid, but every remaining row of the vertical arm
    still centres on the true x (and vice versa)."""
    h, w = gray.shape
    tmpl = np.full((2 * arm + 7, 2 * arm + 7), 255, np.uint8)
    c = arm + 3
    cv2.line(tmpl, (c - arm, c), (c + arm, c), 0, 3, cv2.LINE_AA)
    cv2.line(tmpl, (c, c - arm), (c, c + arm), 0, 3, cv2.LINE_AA)

    pad = arm + 26
    x0, y0 = int(round(cx)) - pad, int(round(cy)) - pad
    x1, y1 = int(round(cx)) + pad, int(round(cy)) + pad
    if x0 < 0 or y0 < 0 or x1 > w or y1 > h:
        return None
    win = gray[y0:y1, x0:x1]
    res = cv2.matchTemplate(win, tmpl, cv2.TM_CCOEFF_NORMED)
    _, _, _, mx = cv2.minMaxLoc(res)
    px = float(x0 + mx[0] + c)
    py = float(y0 + mx[1] + c)

    half = 5            # strip half-width around an arm (stroke is ~3px + blur)
    for _ in range(3):  # refine; strips re-centre on the previous estimate
        r = arm + 4
        a, b = int(round(px)) - r, int(round(py)) - r
        if a < 0 or b < 0 or a + 2 * r >= w or b + 2 * r >= h:
            return None
        patch = gray[b:b + 2 * r, a:a + 2 * r].astype(np.float32)
        bg = float(np.percentile(patch, 88))
        wgt = np.clip(bg - patch, 0, None)
        wgt[wgt < 0.35 * float(wgt.max() or 1)] = 0.0     # drop grime, keep the cross
        yy, xx = np.mgrid[0:2 * r, 0:2 * r].astype(np.float32)
        lx, ly = px - a, py - b
        v = wgt * (np.abs(xx - lx) <= half) * (np.abs(yy - ly) <= arm)   # vertical arm
        hz = wgt * (np.abs(yy - ly) <= half) * (np.abs(xx - lx) <= arm)  # horizontal arm
        tv, th = float(v.sum()), float(hz.sum())
        if tv <= 0 or th <= 0:
            return None
        px = a + float((v * xx).sum() / tv)
        py = b + float((hz * yy).sum() / th)
    return (px, py)


def selftest(base_seed: int = 20260805, verbose: bool = True) -> dict[Any, dict[str, float]]:
    """Geometry fidelity per severity (numeric + book). Returns
    {severity: {max_px, mean_px, n}}."""
    img, pts, arm = make_calibration_page(seed=7)
    h, w = img.shape[:2]
    report: dict[Any, dict[str, float]] = {}
    for sev in list(SEVERITIES) + list(BOOK_SEVERITIES):
        out, meta = degrade_image(img, "calibration", sev, base_seed)
        M = np.asarray(meta["scan_geom_matrix"], dtype=np.float64)
        gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
        errs = []
        for (u, v) in pts:
            eu, ev = xf_point(M, u, v)
            ex, ey = eu * w, ev * h
            if not (40 < ex < w - 40 and 40 < ey < h - 40):
                continue
            got = detect_cross(gray, ex, ey, arm)
            if got is None:
                continue
            errs.append(math.hypot(got[0] - ex, got[1] - ey))
        report[sev] = {"max_px": max(errs), "mean_px": sum(errs) / len(errs),
                       "n": len(errs), "rot_deg": meta["geom_params"]["rot_deg"]}
        if verbose:
            r = report[sev]
            print(f"sev{sev!s:<3s} {ALL_PRESETS[sev]['label']:<28s} "
                  f"n={r['n']:3d} max={r['max_px']:.2f}px mean={r['mean_px']:.2f}px "
                  f"rot={r['rot_deg']:+.2f}deg")
    return report


def selftest_layout(base_seed: int = 20260805, verbose: bool = True) -> None:
    """Layout-sidecar pass-through check: a tiny synthetic `<stem>.layout.json`
    rides the full CLI path (find_sidecars -> process_page dispatch) at
    severities 0 / 2 / 3b. Asserts: sev0 bboxes byte-identical; degraded bboxes
    equal the stamped matrix applied to the input rects (axis-aligned hull,
    <= 1e-6); class / text / attrs / reading_order untouched everywhere."""
    import tempfile  # noqa: PLC0415

    img = np.full((800, 600, 3), 255, np.uint8)
    cv2.rectangle(img, (60, 320), (510, 560), (0, 0, 0), 2)
    cv2.putText(img, "layout selftest", (70, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                (30, 30, 30), 2, cv2.LINE_AA)
    items = [
        {"id": 0, "class": "Title", "bbox": [0.1, 0.05, 0.8, 0.06],
         "reading_order": 0, "text": "A Tiny Page"},
        {"id": 1, "class": "Formula", "bbox": [0.15, 0.2, 0.5, 0.1],
         "reading_order": 1, "text": "E = mc^2", "attrs": {"latex": "E = mc^2"}},
        {"id": 2, "class": "Table", "bbox": [0.1, 0.4, 0.75, 0.3],
         "reading_order": 2, "text": None},
        {"id": 3, "class": "Page-footer", "bbox": [0.45, 0.93, 0.1, 0.03],
         "reading_order": 3, "text": "7", "attrs": {"role": "page-number"}},
    ]
    sidecar = {"version": 1, "ontology": "canonical17",
               "coords": "normalized [0,1]; bbox=[x,y,w,h] COCO-style",
               "page_w_px": 600, "page_h_px": 800, "items": items}

    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        (tdp / "layoutpage.layout.json").write_text(json.dumps(sidecar))
        for sev in (0, 2, "3b"):
            process_page(img, "layoutpage", 0, 1, sev, tdp, base_seed, tdp, None)
            out = json.loads((tdp / f"layoutpage__sev{sev}.layout.json").read_text())
            meta = json.loads((tdp / f"layoutpage__sev{sev}.degrade.json").read_text())
            M = np.asarray(meta["scan_geom_matrix"], dtype=np.float64)
            assert out["scan_severity"] == _base_severity(sev)
            assert out["severity_key"] == str(sev)
            assert out["ontology"] == "canonical17" and out["version"] == 1
            worst = 0.0
            for src, got in zip(items, out["items"]):
                assert {k: v for k, v in got.items() if k != "bbox"} == \
                       {k: v for k, v in src.items() if k != "bbox"}, \
                    f"sev{sev}: non-bbox item fields changed"
                x, y, bw, bh = src["bbox"]
                ex0, ey0, ex1, ey1 = xf_bbox(M, [x, y, x + bw, y + bh])
                exp = [ex0, ey0, ex1 - ex0, ey1 - ey0]
                worst = max(worst, max(abs(a - b) for a, b in zip(got["bbox"], exp)))
            if sev == 0:
                same = all(json.dumps(s["bbox"]) == json.dumps(g["bbox"])
                           for s, g in zip(items, out["items"]))
                assert same, "sev0 layout bboxes not byte-identical"
                if verbose:
                    print(f"layout sev0   bboxes byte-identical: {same}  "
                          f"n={len(items)}  fields untouched: True")
            else:
                assert worst <= 1e-6, f"sev{sev}: bbox error {worst:.2e} > 1e-6"
                if verbose:
                    print(f"layout sev{sev!s:<3s} max|bbox - hull(M@rect)| = "
                          f"{worst:.2e}  (<= 1e-6)  n={len(items)}  "
                          f"fields untouched: True")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--pdfs", help="glob of input PDFs (quote it)")
    ap.add_argument("--images", help="glob of input images (quote it)")
    ap.add_argument("--sidecars", help="dir holding *.cells.json / *.pixels.json / "
                                       "*.layout.json / *.sidecar.json")
    ap.add_argument("--out", help="output dir")
    ap.add_argument("--dpi", type=int, default=200, help="rasterization DPI for --pdfs (v5: raised from 150 per user)")
    ap.add_argument("--severity", default="sweep",
                    help="0..4, a book variant '1b'/'2b'/'3b', 'sweep' (all five "
                         "numeric) or 'sweep-book' (the three book variants)")
    ap.add_argument("--seed", type=int, default=0, help="base seed; mixed with (id, severity)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--selftest", action="store_true", help="run the cross-target geometry check")
    args = ap.parse_args()

    if args.selftest:
        selftest(base_seed=args.seed or 20260805)
        selftest_layout(base_seed=args.seed or 20260805)
        return
    if bool(args.pdfs) == bool(args.images):
        raise SystemExit("give exactly one of --pdfs / --images")
    if not args.out:
        raise SystemExit("--out is required")
    if (args.severity not in ("sweep", "sweep-book")
            and args.severity not in BOOK_PRESETS
            and not (args.severity.isdigit() and int(args.severity) in SEVERITY_PRESETS)):
        raise SystemExit("--severity must be 'sweep', 'sweep-book' or one of "
                         f"{list(SEVERITIES) + list(BOOK_SEVERITIES)}")
    sys.exit(run(args))


if __name__ == "__main__":
    main()
