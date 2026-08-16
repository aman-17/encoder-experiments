"""Difficulty tagging for Exp 1 probe data — rules v1, spec: docs/experiments.md §Closed.

Pure functions from sidecar dicts (+ generator covariates) to
``{difficulty, difficulty_rules: "v1", covariates, flags}``. Two invariants
from docs/experiments.md §Closed, non-negotiable:

1. Tags are a derived view — the raw continuous covariates are returned
   alongside the tag so retagging is a re-run, never a re-annotation.
2. The tagger partitions. Rules are evaluated hard -> medium -> easy
   (first match wins, easy is the else-branch). An input that cannot be
   featurized at all raises :class:`Unclassifiable` — silent defaults would
   corrupt every downstream results table.

Four task families:

- tables    — per table, from ``<id>.cells.json`` (both producer schemas —
              the replicator's contract shape and table-generator's
              ``grid_rows``/``rowspan``/``tag``/xywh shape — are unified by
              :func:`normalize_table` before any rule runs)
- charts    — per chart, from ``<id>.pixels.json``
- bboxes    — per page,  from ``<id>.layout.json`` (Canonical17 items;
              v2 bboxes are ints on the 0-1000 scale, v1 normalized floats)
- text_math — per page,  from glyph sidecars + generator metadata covariates

``scan_severity`` is an orthogonal axis and is deliberately NOT an input to
any rule here — a degraded easy table and a clean hard table fail
differently, and that distinction is a finding (docs/experiments.md §Closed).

Rule changes bump the version (``v2``, ...) — never silently edit ``v1``.
"""

from __future__ import annotations

import math
from statistics import median
from typing import Any

DIFFICULTY_RULES_VERSION = "v1"

EASY = "easy"
MEDIUM = "medium"
HARD = "hard"
LEVELS = (EASY, MEDIUM, HARD)  # ordered: easy < medium < hard

# Rule constants — verbatim from docs/experiments.md §Closed (v1). Do not edit without a version
# bump.

# Tables
TABLE_HARD_MAX_RC = 10          # hard if max(R, C) >= 10  (easy side is <= 9)
TABLE_HARD_EMPTY_FRAC = 0.2     # hard if empty_frac >= 0.2
TABLE_HARD_MAX_SPAN = 4         # hard if max_span >= 4
TABLE_HARD_HEADER_DEPTH = 2     # hard if header_depth >= 2
TABLE_MEDIUM_EMPTY_FRAC = 0.05  # medium if 0.05 <= empty_frac < 0.2
# Replicator template families with pathological layout (docs/experiments.md §Closed: snaking,
# mirrored, line-printer, continuation-fragment, ...). Matched as tokens
# against the normalized template name.
WEIRD_FAMILY_TOKENS = (
    "snaking",
    "mirrored",
    "line_printer",
    "continuation_fragment",
)

# Charts
CHART_HARD_N_SERIES = 4
CHART_HARD_TYPES = frozenset({"radar", "heatmap", "candlestick", "boxplot", "waterfall"})
CHART_MEDIUM_N_SERIES = frozenset({2, 3})
CHART_MEDIUM_TYPES = frozenset({"bubble", "gauge", "funnel", "pyramid", "slope"})

# Bboxes (per page, counting layout.json Canonical17 items — never raw
# pymupdf blocks, never word boxes)
BBOX_EASY_MAX_BOXES = 4     # easy   if n_boxes <= 4
BBOX_MEDIUM_MAX_BOXES = 8   # medium if 5 <= n_boxes <= 8; hard if >= 9

# Text & math
TEXT_HARD_N_EQUATIONS = 4       # hard if n_equations >= 4
TEXT_HARD_SCRIPT_DEPTH = 2      # hard if script_depth >= 2 (per equation)
TEXT_HARD_MEDIAN_SIZE_PT = 6.0  # hard if median_size_pt < 6
TEXT_MEDIUM_N_EQUATIONS = (2, 3)  # medium if 2 <= n_equations <= 3

# Flags
MULTI_TABLE_MIN = 2  # multi_table = n_tables >= 2
MULTI_CHART_MIN = 2  # multi_chart = n_charts >= 2


class Unclassifiable(ValueError):
    """Input that cannot be featurized for any v1 rule — a hard error,
    never a silent default (docs/experiments.md §Closed principle 2)."""


def _max_level(levels: list[str]) -> str:
    if not levels:
        raise Unclassifiable("no objects to aggregate a page difficulty from")
    return LEVELS[max(LEVELS.index(lv) for lv in levels)]


def _require_count(value: Any, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise Unclassifiable(f"{name} must be a positive int, got {value!r}")
    return value


def _is_blank(text: Any) -> bool:
    return text is None or (isinstance(text, str) and not text.strip())


# Tables — per table, from a `tables[i]` entry of <id>.cells.json

def normalize_table(table: dict) -> dict:
    """Adapt a `tables[i]` entry to the covariate contract. Pure schema shim —
    no rule content lives here.

    Two producers exist:

    - failing-table-replicator emits the contract directly: ``n_rows`` /
      ``n_cols``, cells with ``row_span`` / ``col_span`` / ``is_header``, and
      corner bboxes ``[x0, y0, x1, y1]``;
    - table-generator (src/data/table-generator/groundTruth.mjs) emits
      ``grid_rows`` / ``grid_cols``, cells with ``rowspan`` / ``colspan`` /
      ``tag`` ("th"/"td"), and ``[x, y, w, h]`` bboxes.

    The table-generator schema (detected by ``grid_rows`` without ``n_rows``)
    is mapped onto the contract, including the xywh -> corner bbox conversion
    for both cell and table bboxes, so every consumer (tagger, sampler) sees
    one schema. Contract-shaped tables pass through untouched.
    """
    if "n_rows" in table or "grid_rows" not in table:
        return table

    def _corners(bbox: Any) -> Any:
        if not bbox or len(bbox) != 4:
            return bbox
        x, y, w, h = (float(v) for v in bbox)
        return [x, y, x + w, y + h]

    cells = []
    for cell in table.get("cells") or []:
        c = dict(cell)
        c["row_span"] = int(c.get("row_span", c.get("rowspan", 1)) or 1)
        c["col_span"] = int(c.get("col_span", c.get("colspan", 1)) or 1)
        c["is_header"] = bool(c.get("is_header", c.get("tag") == "th"))
        c["bbox"] = _corners(c.get("bbox"))
        cells.append(c)
    out = dict(table)
    out["n_rows"] = table.get("grid_rows")
    out["n_cols"] = table.get("grid_cols")
    out["cells"] = cells
    out["bbox"] = _corners(table.get("bbox"))
    return out


def _normalize_template(template: str | None) -> str:
    if not template:
        return ""
    stem = template.rsplit("/", 1)[-1]
    if stem.endswith(".mjs"):
        stem = stem[: -len(".mjs")]
    return stem.replace("-", "_").lower()


def is_weird_family(template: str | None) -> bool:
    name = _normalize_template(template)
    return any(tok in name for tok in WEIRD_FAMILY_TOKENS)


def table_covariates(
    table: dict,
    template: str | None = None,
    weird_family: bool | None = None,
) -> dict:
    """Continuous covariates for one table (kept per docs/experiments.md §Closed)."""
    table = normalize_table(table)
    n_rows = _require_count(table.get("n_rows"), "n_rows")
    n_cols = _require_count(table.get("n_cols"), "n_cols")
    cells = table.get("cells") or []

    n_logical = n_rows * n_cols
    covered_nonempty = 0
    n_merged = 0
    max_span = 1
    for cell in cells:
        rs = int(cell.get("row_span", 1) or 1)
        cs = int(cell.get("col_span", 1) or 1)
        if rs > 1 or cs > 1:
            n_merged += 1
        max_span = max(max_span, rs, cs)
        if not _is_blank(cell.get("text")):
            covered_nonempty += rs * cs
    empty_cells = max(0, n_logical - covered_nonempty)
    empty_frac = empty_cells / n_logical
    if math.isnan(empty_frac) or not (0.0 <= empty_frac <= 1.0):
        raise Unclassifiable(f"empty_frac out of range: {empty_frac!r}")

    # header_depth: consecutive leading rows whose cells are all headers
    header_depth = 0
    for r in range(n_rows):
        row_cells = [c for c in cells if c.get("row") == r]
        if not row_cells or not all(c.get("is_header") for c in row_cells):
            break
        header_depth += 1

    if weird_family is None:
        weird_family = is_weird_family(template)

    return {
        "n_rows": n_rows,
        "n_cols": n_cols,
        "n_logical_cells": n_logical,
        "empty_frac": empty_frac,
        "n_merged_cells": n_merged,
        "merged": n_merged > 0,
        "max_span": max_span,
        "header_depth": header_depth,
        "weird_family": bool(weird_family),
    }


def tag_table(
    table: dict,
    template: str | None = None,
    weird_family: bool | None = None,
) -> tuple[str, dict]:
    """(difficulty, covariates) for one table. Precedence hard -> medium -> easy."""
    cov = table_covariates(table, template=template, weird_family=weird_family)
    r, c = cov["n_rows"], cov["n_cols"]
    if (
        max(r, c) >= TABLE_HARD_MAX_RC
        or cov["empty_frac"] >= TABLE_HARD_EMPTY_FRAC
        or cov["max_span"] >= TABLE_HARD_MAX_SPAN
        or cov["header_depth"] >= TABLE_HARD_HEADER_DEPTH
        or cov["weird_family"]
    ):
        return HARD, cov
    if cov["merged"] or TABLE_MEDIUM_EMPTY_FRAC <= cov["empty_frac"] < TABLE_HARD_EMPTY_FRAC:
        return MEDIUM, cov
    return EASY, cov


# Charts — per chart, from a `charts[i]` entry of <id>.pixels.json

def chart_covariates(chart: dict) -> dict:
    marks = chart.get("marks") or []
    chart_type = chart.get("chartType")
    if not isinstance(chart_type, str) or not chart_type:
        raise Unclassifiable(f"chart has no chartType: {chart_type!r}")
    ct = chart_type.lower()

    series: list[str] = []
    for m in marks:
        name = m.get("seriesName")
        if name is not None and name not in series:
            series.append(name)
    if not series:
        for entry in chart.get("legend") or []:
            name = entry.get("series")
            if name is not None and name not in series:
                series.append(name)
    if not series:
        raise Unclassifiable("chart has no marks and no legend — n_series unknown")

    axis = chart.get("axis") or {}
    dual_axis = (
        axis.get("y2Ticks") is not None
        or axis.get("y2Min") is not None
        or any(m.get("axis") == "right" for m in marks)
    )
    stacked = (
        "stacked" in ct
        or "percent" in ct
        or any(m.get("cumStart") is not None or m.get("cumEnd") is not None for m in marks)
    )
    return {
        "n_series": len(series),
        "n_marks": len(marks),
        "chart_type": chart_type,
        "geom_kind": chart.get("geomKind"),
        "dual_axis": bool(dual_axis),
        "stacked": bool(stacked),
    }


def tag_chart(chart: dict) -> tuple[str, dict]:
    """(difficulty, covariates) for one chart. Precedence hard -> medium -> easy."""
    cov = chart_covariates(chart)
    ct = cov["chart_type"].lower()
    if (
        cov["n_series"] >= CHART_HARD_N_SERIES
        or cov["dual_axis"]
        or ct in CHART_HARD_TYPES
    ):
        return HARD, cov
    if cov["n_series"] in CHART_MEDIUM_N_SERIES or cov["stacked"] or ct in CHART_MEDIUM_TYPES:
        return MEDIUM, cov
    return EASY, cov


# Bboxes — per page, from <id>.layout.json (Canonical17 items)

def layout_items_normalized(layout: dict) -> list[dict]:
    """Layout items with bbox=[x, y, w, h] as normalized floats.

    Auto-detects v2 (ints on the 0-1000 page scale — divide by 1000) vs v1
    (already-normalized floats), mirroring src/data/degrade.py.
    """
    items = layout.get("items")
    if items is None:
        raise Unclassifiable("layout sidecar has no 'items'")
    v2 = layout.get("version") == 2 or any(
        coord > 1.5 for it in items for coord in (it.get("bbox") or [])
    )
    scale = 1.0 / 1000.0 if v2 else 1.0
    out = []
    for it in items:
        bbox = it.get("bbox")
        if bbox is None or len(bbox) != 4:
            raise Unclassifiable(f"layout item without a 4-vector bbox: {it!r}")
        out.append({**it, "bbox": [float(v) * scale for v in bbox]})
    return out


def _boxes_overlap(a: list[float], b: list[float]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def bbox_covariates(layout: dict) -> dict:
    items = layout_items_normalized(layout)
    areas = [it["bbox"][2] * it["bbox"][3] for it in items]
    n_overlapping = sum(
        1
        for i in range(len(items))
        for j in range(i + 1, len(items))
        if _boxes_overlap(items[i]["bbox"], items[j]["bbox"])
    )
    return {
        "n_boxes": len(items),
        "min_box_area": min(areas) if areas else None,
        "n_overlapping_pairs": n_overlapping,
    }


def tag_bboxes(layout: dict) -> tuple[str, dict]:
    """(difficulty, covariates) for the page's layout. easy <=4 / medium 5-8 / hard >=9."""
    cov = bbox_covariates(layout)
    n = cov["n_boxes"]
    if n > BBOX_MEDIUM_MAX_BOXES:
        return HARD, cov
    if n > BBOX_EASY_MAX_BOXES:
        return MEDIUM, cov
    return EASY, cov


# Text & math — per page, from glyph sidecars + generator metadata covariates

TEXT_COVARIATE_KEYS = (
    "n_equations",
    "script_depth",
    "styled",
    "heavy_style",
    "styled_run_frac",
    "median_size_pt",
    "min_size_pt",
)


def text_covariates(covariates: dict | None = None, glyphs: dict | None = None) -> dict:
    cov = dict(covariates or {})
    n_equations = int(cov.get("n_equations") or 0)
    script_depth = int(cov.get("script_depth") or 0)
    if n_equations < 0 or script_depth < 0:
        raise Unclassifiable(
            f"negative text covariates: n_equations={n_equations}, script_depth={script_depth}"
        )
    sizes = [
        float(g["size_pt"])
        for g in (glyphs or {}).get("glyphs", [])
        if g.get("size_pt") is not None
    ]
    median_size_pt = median(sizes) if sizes else cov.get("median_size_pt")
    min_size_pt = min(sizes) if sizes else cov.get("min_size_pt")
    return {
        "n_equations": n_equations,
        "script_depth": script_depth,
        "styled": bool(cov.get("styled", False)),
        "heavy_style": bool(cov.get("heavy_style", False)),
        "styled_run_frac": cov.get("styled_run_frac"),
        "median_size_pt": median_size_pt,
        "min_size_pt": min_size_pt,
    }


def tag_text(covariates: dict | None = None, glyphs: dict | None = None) -> tuple[str, dict]:
    """(difficulty, covariates) for the page's text/math content."""
    if not glyphs and not any(k in (covariates or {}) for k in TEXT_COVARIATE_KEYS):
        raise Unclassifiable("no glyph sidecar and no text covariates — text family unfeaturizable")
    cov = text_covariates(covariates, glyphs)
    lo, hi = TEXT_MEDIUM_N_EQUATIONS
    if (
        cov["n_equations"] >= TEXT_HARD_N_EQUATIONS
        or cov["script_depth"] >= TEXT_HARD_SCRIPT_DEPTH
        or cov["heavy_style"]
        or (cov["median_size_pt"] is not None and cov["median_size_pt"] < TEXT_HARD_MEDIAN_SIZE_PT)
    ):
        return HARD, cov
    if lo <= cov["n_equations"] <= hi or cov["styled"]:
        return MEDIUM, cov
    return EASY, cov


# Page-level entry point

def tag_page(
    *,
    cells: dict | None = None,
    pixels: dict | None = None,
    layout: dict | None = None,
    glyphs: dict | None = None,
    covariates: dict | None = None,
) -> dict:
    """Tag a page from whichever sidecars it has.

    Returns ``{difficulty, difficulty_rules, families, covariates, flags}``.
    Page difficulty per family = max over that family's objects; the top-level
    ``difficulty`` is the max across families (easy < medium < hard).
    Unknown covariate keys (e.g. ``scan_severity``) are ignored — severity is
    an orthogonal axis and never folds into the tag.
    Raises :class:`Unclassifiable` when no family can be featurized.
    """
    families: dict[str, str] = {}
    covs: dict[str, Any] = {}
    flags: dict[str, Any] = {}

    tables = (cells or {}).get("tables") or []
    if cells is not None:
        template = cells.get("template")
        tagged = [tag_table(t, template=template) for t in tables]
        if tagged:
            families["tables"] = _max_level([lv for lv, _ in tagged])
            covs["tables"] = [c for _, c in tagged]
    flags["n_tables"] = len(tables)
    flags["multi_table"] = len(tables) >= MULTI_TABLE_MIN

    charts = (pixels or {}).get("charts") or []
    if pixels is not None:
        tagged = [tag_chart(c) for c in charts]
        if tagged:
            families["charts"] = _max_level([lv for lv, _ in tagged])
            covs["charts"] = [c for _, c in tagged]
    flags["n_charts"] = len(charts)
    flags["multi_chart"] = len(charts) >= MULTI_CHART_MIN

    if layout is not None:
        lv, cov = tag_bboxes(layout)
        families["bboxes"] = lv
        covs["bboxes"] = cov

    has_text_cov = any(k in (covariates or {}) for k in TEXT_COVARIATE_KEYS)
    if glyphs is not None or has_text_cov:
        lv, cov = tag_text(covariates, glyphs)
        families["text_math"] = lv
        covs["text_math"] = cov
        flags["n_equations"] = cov["n_equations"]
    else:
        flags["n_equations"] = 0

    if not families:
        raise Unclassifiable("no sidecar or covariate featurizes any v1 task family")

    return {
        "difficulty": _max_level(list(families.values())),
        "difficulty_rules": DIFFICULTY_RULES_VERSION,
        "families": families,
        "covariates": covs,
        "flags": flags,
    }
