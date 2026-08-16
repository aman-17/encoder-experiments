"""Boundary pins for the v1 difficulty rules (Data.md).

Boundary bugs in tagging silently corrupt every downstream results table,
so the exact cut points are pinned here: max(R,C)==9 vs 10, the empty_frac
edges (0.05 / 0.2), severity independence, and the unclassifiable-raises
contract."""

import pytest

from encoder_experiments.difficulty_tagger import (
    DIFFICULTY_RULES_VERSION,
    Unclassifiable,
    normalize_table,
    tag_bboxes,
    tag_chart,
    tag_page,
    tag_table,
    tag_text,
)


# ---------------------------------------------------------------------------
# fixture builders
# ---------------------------------------------------------------------------

def make_table(n_rows, n_cols, *, empty_cells=0, spans=None, header_rows=0):
    """Full grid of 1x1 cells; the first `empty_cells` get blank text;
    `spans` = {(r, c): (row_span, col_span)} replaces those cells (cells
    swallowed by a span are removed)."""
    spans = spans or {}
    swallowed = set()
    for (r, c), (rs, cs) in spans.items():
        for dr in range(rs):
            for dc in range(cs):
                if (dr, dc) != (0, 0):
                    swallowed.add((r + dr, c + dc))
    cells = []
    emptied = 0
    for r in range(n_rows):
        for c in range(n_cols):
            if (r, c) in swallowed:
                continue
            rs, cs = spans.get((r, c), (1, 1))
            if emptied < empty_cells:
                text = ""
                emptied += 1
            else:
                text = f"r{r}c{c}"
            cells.append(
                {
                    "row": r,
                    "col": c,
                    "row_span": rs,
                    "col_span": cs,
                    "is_header": r < header_rows,
                    "text": text,
                    "bbox": [c / n_cols, r / n_rows, (c + 1) / n_cols, (r + 1) / n_rows],
                }
            )
    return {"table_index": 0, "n_rows": n_rows, "n_cols": n_cols, "cells": cells}


def make_chart(n_series=1, chart_type="bar", *, dual_axis=False, stacked=False):
    marks = []
    for si in range(n_series):
        mark = {
            "kind": "bar",
            "seriesIndex": si,
            "seriesName": f"S{si}",
            "value": 1 + si,
            "axisValue": 1 + si,
            "x": 0.1 + 0.1 * si,
            "y": 0.5,
            "anchor": {"x": 0.1 + 0.1 * si, "y": 0.5},
        }
        if dual_axis and si == n_series - 1:
            mark["axis"] = "right"
        if stacked:
            mark["cumStart"] = si
            mark["cumEnd"] = si + 1
        marks.append(mark)
    return {"chartType": chart_type, "geomKind": "cartesian", "marks": marks, "axis": {"yMin": 0, "yMax": 10}}


def make_layout(n_boxes):
    return {
        "version": 2,
        "items": [
            {"id": i, "class": "Text", "bbox": [50, 50 + 60 * i, 300, 40]}
            for i in range(n_boxes)
        ],
    }


# ---------------------------------------------------------------------------
# tables
# ---------------------------------------------------------------------------

def test_table_max_rc_9_is_easy_10_is_hard():
    assert tag_table(make_table(9, 3))[0] == "easy"
    assert tag_table(make_table(3, 9))[0] == "easy"
    assert tag_table(make_table(10, 3))[0] == "hard"
    assert tag_table(make_table(3, 10))[0] == "hard"


def test_table_empty_frac_edges():
    # 5x4 = 20 logical cells
    assert tag_table(make_table(5, 4, empty_cells=0))[0] == "easy"
    # 1/40 = 0.025 < 0.05 -> easy
    assert tag_table(make_table(8, 5, empty_cells=1))[0] == "easy"
    # exactly 0.05 (1/20) -> medium
    assert tag_table(make_table(5, 4, empty_cells=1))[0] == "medium"
    # 3/20 = 0.15 in [0.05, 0.2) -> medium
    assert tag_table(make_table(5, 4, empty_cells=3))[0] == "medium"
    # exactly 0.2 (4/20) -> hard
    assert tag_table(make_table(5, 4, empty_cells=4))[0] == "hard"


def test_table_span_and_header_depth():
    # merged (span < 4) -> medium
    assert tag_table(make_table(5, 4, spans={(0, 0): (1, 2)}))[0] == "medium"
    # max_span == 3 still medium, == 4 hard
    assert tag_table(make_table(6, 5, spans={(0, 0): (1, 3)}))[0] == "medium"
    assert tag_table(make_table(6, 5, spans={(0, 0): (1, 4)}))[0] == "hard"
    # header depth: 1 leading header row is not a trigger; 2 -> hard
    assert tag_table(make_table(5, 4, header_rows=1))[0] == "easy"
    assert tag_table(make_table(5, 4, header_rows=2))[0] == "hard"


def test_table_weird_family():
    t = make_table(3, 3)
    assert tag_table(t, template="snaking_class_deviations.mjs")[0] == "hard"
    assert tag_table(t, template="line_printer_vin.mjs")[0] == "hard"
    assert tag_table(t, template="agronomy_trial_table.mjs")[0] == "easy"


def make_tablegen_table(grid_rows=6, grid_cols=5, *, header_rows=1, spans=None):
    """Real table-generator cells.json shape: grid_rows/grid_cols instead of
    n_rows/n_cols, rowspan/colspan instead of row_span/col_span, tag "th"/"td"
    instead of is_header, and [x, y, w, h] bboxes instead of corners."""
    spans = spans or {}
    swallowed = set()
    for (r, c), (rs, cs) in spans.items():
        for dr in range(rs):
            for dc in range(cs):
                if (dr, dc) != (0, 0):
                    swallowed.add((r + dr, c + dc))
    cells = []
    for r in range(grid_rows):
        for c in range(grid_cols):
            if (r, c) in swallowed:
                continue
            rs, cs = spans.get((r, c), (1, 1))
            cells.append(
                {
                    "row": r,
                    "col": c,
                    "grid_row": r,
                    "grid_col": c,
                    "rowspan": rs,
                    "colspan": cs,
                    "tag": "th" if r < header_rows else "td",
                    "bbox": [0.11 + 0.15 * c, 0.44 + 0.05 * r, 0.14, 0.04],
                    "text": f"v{r}{c}",
                }
            )
    return {
        "table_index": 0,
        "bbox": [0.11, 0.44, 0.78, 0.24],
        "grid_rows": grid_rows,
        "grid_cols": grid_cols,
        "cells": cells,
    }


def test_table_generator_schema_tags_without_raising():
    # a full sidecar in table-generator spelling must classify — Data.md rules
    # are exhaustive by precedence for any doc with sidecars
    level, cov = tag_table(make_tablegen_table())
    assert level == "easy"
    assert cov["n_rows"] == 6 and cov["n_cols"] == 5
    assert cov["header_depth"] == 1
    assert cov["empty_frac"] == 0.0
    # the v1 cut points act on the mapped covariates
    assert tag_table(make_tablegen_table(grid_rows=10))[0] == "hard"
    assert tag_table(make_tablegen_table(header_rows=2))[0] == "hard"
    assert tag_table(make_tablegen_table(spans={(1, 0): (1, 2)}))[0] == "medium"
    assert tag_table(make_tablegen_table(spans={(1, 0): (1, 4)}))[0] == "hard"


def test_normalize_table_maps_schema_and_bboxes():
    norm = normalize_table(make_tablegen_table())
    assert norm["n_rows"] == 6 and norm["n_cols"] == 5
    cell = norm["cells"][0]  # (0, 0), a "th"
    assert cell["row_span"] == 1 and cell["col_span"] == 1
    assert cell["is_header"] is True
    assert not any(c["is_header"] for c in norm["cells"] if c["row"] > 0)
    # xywh -> corners, cell and table bbox alike
    assert cell["bbox"] == pytest.approx([0.11, 0.44, 0.25, 0.48])
    assert norm["bbox"] == pytest.approx([0.11, 0.44, 0.89, 0.68])
    # contract-shaped tables pass through untouched
    contract = make_table(3, 3)
    assert normalize_table(contract) is contract


def test_table_covariates_ride_along():
    level, cov = tag_table(make_table(5, 4, empty_cells=1))
    assert level == "medium"
    assert cov["n_logical_cells"] == 20
    assert cov["empty_frac"] == pytest.approx(0.05)
    assert cov["max_span"] == 1


# ---------------------------------------------------------------------------
# charts
# ---------------------------------------------------------------------------

def test_chart_series_ladder():
    assert tag_chart(make_chart(1))[0] == "easy"
    assert tag_chart(make_chart(2))[0] == "medium"
    assert tag_chart(make_chart(3))[0] == "medium"
    assert tag_chart(make_chart(4))[0] == "hard"


def test_chart_type_and_geometry_triggers():
    assert tag_chart(make_chart(1, chart_type="radar"))[0] == "hard"
    assert tag_chart(make_chart(1, chart_type="bubble"))[0] == "medium"
    assert tag_chart(make_chart(1, dual_axis=True))[0] == "hard"
    assert tag_chart(make_chart(1, stacked=True))[0] == "medium"
    assert tag_chart(make_chart(1, chart_type="line"))[0] == "easy"


# ---------------------------------------------------------------------------
# bboxes
# ---------------------------------------------------------------------------

def test_bbox_count_edges():
    assert tag_bboxes(make_layout(4))[0] == "easy"
    assert tag_bboxes(make_layout(5))[0] == "medium"
    assert tag_bboxes(make_layout(8))[0] == "medium"
    assert tag_bboxes(make_layout(9))[0] == "hard"


def test_bbox_v1_float_sidecar_accepted():
    layout = {
        "items": [
            {"id": 0, "class": "Table", "bbox": [0.1, 0.1, 0.5, 0.3]},
            {"id": 1, "class": "Text", "bbox": [0.1, 0.5, 0.5, 0.2]},
        ]
    }
    level, cov = tag_bboxes(layout)
    assert level == "easy"
    assert cov["min_box_area"] == pytest.approx(0.1)


# ---------------------------------------------------------------------------
# text & math
# ---------------------------------------------------------------------------

def test_text_equation_edges():
    assert tag_text({"n_equations": 1})[0] == "easy"
    assert tag_text({"n_equations": 2})[0] == "medium"
    assert tag_text({"n_equations": 3})[0] == "medium"
    assert tag_text({"n_equations": 4})[0] == "hard"


def test_text_script_depth_style_and_font_size():
    assert tag_text({"script_depth": 1})[0] == "easy"
    assert tag_text({"script_depth": 2})[0] == "hard"
    assert tag_text({"styled": True})[0] == "medium"
    assert tag_text({"heavy_style": True})[0] == "hard"
    assert tag_text({"median_size_pt": 6.0})[0] == "easy"
    assert tag_text({"median_size_pt": 5.9})[0] == "hard"


def test_text_median_from_glyph_sidecar():
    glyphs = {"glyphs": [{"char": "a", "size_pt": s} for s in (4.0, 5.0, 5.5)]}
    level, cov = tag_text(None, glyphs)
    assert level == "hard"  # median 5.0 < 6
    assert cov["median_size_pt"] == pytest.approx(5.0)
    assert cov["min_size_pt"] == pytest.approx(4.0)


# ---------------------------------------------------------------------------
# page-level aggregation, severity independence, unclassifiable
# ---------------------------------------------------------------------------

def test_page_max_over_objects_and_flags():
    cells = {"template": "x.mjs", "tables": [make_table(3, 3), make_table(10, 3)]}
    pixels = {"charts": [make_chart(2)]}
    out = tag_page(cells=cells, pixels=pixels, layout=make_layout(3))
    assert out["difficulty"] == "hard"  # max over the hard table
    assert out["difficulty_rules"] == DIFFICULTY_RULES_VERSION == "v1"
    assert out["families"] == {"tables": "hard", "charts": "medium", "bboxes": "easy"}
    assert out["flags"]["n_tables"] == 2
    assert out["flags"]["multi_table"] is True
    assert out["flags"]["n_charts"] == 1
    assert out["flags"]["multi_chart"] is False


def test_scan_severity_never_folds_into_difficulty():
    # bimodal-severity independence: the same page at severity 0 and 4 must
    # tag identically — severity is an orthogonal axis, never a rule input.
    cells = {"tables": [make_table(5, 4, empty_cells=1)]}
    tagged = [
        tag_page(cells=cells, covariates={"scan_severity": sev, "n_equations": 1})
        for sev in (0, 4)
    ]
    assert tagged[0] == tagged[1]
    assert tagged[0]["difficulty"] == "medium"


def test_unclassifiable_raises():
    # nothing featurizable at all
    with pytest.raises(Unclassifiable):
        tag_page()
    # table without a valid grid
    with pytest.raises(Unclassifiable):
        tag_table({"n_rows": 0, "n_cols": 3, "cells": []})
    with pytest.raises(Unclassifiable):
        tag_table({"n_cols": 3, "cells": []})
    # chart with no type
    with pytest.raises(Unclassifiable):
        tag_chart({"marks": [{"seriesName": "A"}]})
    # chart with no series evidence
    with pytest.raises(Unclassifiable):
        tag_chart({"chartType": "bar", "marks": []})
    # layout without items
    with pytest.raises(Unclassifiable):
        tag_bboxes({})
    # text family with no evidence
    with pytest.raises(Unclassifiable):
        tag_text(None, None)
