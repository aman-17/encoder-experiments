"""Shared 3-doc fixture corpus (mirrors the real sidecar schemas exactly):

- doc1  chart page   (.pixels.json + .layout.json), severity 0
- doc2  table page   (.cells.json + .layout.json), severity 2, with a
        deliberately overlapping cell (the ambiguity-skip case)
- doc3  text page    (.sidecar.json glyphs + .layout.json), severity 4,
        9 layout boxes (bbox-hard)

Used by test_probe_sampler (schema/label semantics) and by
test_integration_sampler_fit (sampler output -> probe_fit end to end).
"""

import json

import pytest

from encoder_experiments.probe_sampler import GLYPH_ALPHABET

SEVERITY = {"charts/doc1": 0, "tables/doc2": 2, "text/doc3": 4}


def _pixels_doc1():
    def mark(series, si, x, y, axis_value):
        return {
            "kind": "point",
            "seriesIndex": si,
            "seriesName": series,
            "value": axis_value,
            "axisValue": axis_value,
            "x": x,
            "y": y,
            "r": 0.004,
            "anchor": {"x": x, "y": y},
        }

    chart0 = {
        "chartType": "line",
        "geomKind": "cartesian",
        "axis": {
            "yMin": 0,
            "yMax": 10,
            "yTicks": [{"value": v, "label": str(v), "y": 0.4 - 0.03 * v} for v in (0, 5, 10)],
        },
        "marks": [
            mark("A", 0, 0.20, 0.30, 2),
            mark("A", 0, 0.30, 0.25, 4),
            mark("A", 0, 0.40, 0.20, 6),
            mark("B", 1, 0.20, 0.35, 1),
            mark("B", 1, 0.30, 0.32, 3),
            mark("B", 1, 0.40, 0.28, 5),
        ],
        "legend": [{"series": "A"}, {"series": "B"}],
    }
    chart1 = {
        "chartType": "pie",
        "geomKind": "radial",
        "axis": None,
        "marks": [
            {
                "kind": "slice",
                "seriesIndex": 0,
                "seriesName": "S",
                "value": "33%",
                "x": 0.70 + 0.02 * i,
                "y": 0.70 + 0.02 * i,
                "anchor": {"x": 0.70 + 0.02 * i, "y": 0.70 + 0.02 * i},
            }
            for i in range(3)
        ],
        "legend": [{"series": "S"}],
    }
    return {
        "version": 1,
        "page_coords_valid": True,
        "charts": [chart0, chart1],
    }


def _cells_doc2():
    cells = []
    for r in range(3):
        for c in range(3):
            cells.append(
                {
                    "row": r,
                    "col": c,
                    "row_span": 1,
                    "col_span": 1,
                    "is_header": False,
                    "text": f"r{r}c{c}",
                    "bbox": [0.1 + 0.2 * c, 0.1 + 0.1 * r, 0.3 + 0.2 * c, 0.2 + 0.1 * r],
                }
            )
    # footer cell A spanning cols 0-1 (merged -> table tags medium)
    cells.append(
        {
            "row": 3, "col": 0, "row_span": 1, "col_span": 2, "is_header": False,
            "text": "footer", "bbox": [0.1, 0.4, 0.5, 0.5],
        }
    )
    # trap cell B: its center (0.40, 0.45) lies inside A's bbox -> must be
    # skipped for overlap ambiguity; A's center (0.30, 0.45) is NOT inside B.
    cells.append(
        {
            "row": 3, "col": 2, "row_span": 1, "col_span": 1, "is_header": False,
            "text": "inner", "bbox": [0.32, 0.41, 0.48, 0.49],
        }
    )
    return {
        "id": "doc2",
        "template": "plain_grid.mjs",
        "tables": [{"table_index": 0, "n_rows": 4, "n_cols": 3, "cells": cells}],
    }


def _glyphs_doc3():
    glyphs = []
    for i in range(100):
        char = GLYPH_ALPHABET[i % len(GLYPH_ALPHABET)]
        x = 0.05 + (i % 20) * 0.045
        y = 0.10 + (i // 20) * 0.05
        glyphs.append(
            {
                "char": char,
                "bbox": [x, y, x + 0.008, y + 0.012],
                "font": "Courier",
                "size_pt": 10.0,
            }
        )
    # out-of-alphabet glyphs must be skipped, never relabeled
    glyphs.append({"char": "→", "bbox": [0.5, 0.9, 0.51, 0.91], "font": "Courier", "size_pt": 10.0})
    glyphs.append({"char": "§", "bbox": [0.6, 0.9, 0.61, 0.91], "font": "Courier", "size_pt": 10.0})
    return {"page_w_pt": 612, "page_h_pt": 792, "glyphs": glyphs}


def _layout(items):
    return {"version": 2, "ontology": "canonical17", "items": items}


def _layout_doc1():
    return _layout(
        [
            {"id": 0, "class": "Picture", "bbox": [50, 50, 500, 450], "reading_order": 0},
            {"id": 1, "class": "Title", "bbox": [50, 550, 900, 60], "reading_order": 1},
        ]
    )


def _layout_doc2():
    return _layout(
        [
            {"id": 0, "class": "Table", "bbox": [100, 100, 800, 400], "reading_order": 0},
            {"id": 1, "class": "Footnote", "bbox": [100, 550, 400, 60], "reading_order": 1},
        ]
    )


def _layout_doc3():
    classes = ["Text", "Text", "Section-header", "Formula", "List-item", "Text", "Page-header", "Text", "Footnote"]
    items = []
    for i, cls in enumerate(classes):
        x = 50 + (i % 3) * 300
        y = 100 + (i // 3) * 200
        items.append({"id": i, "class": cls, "bbox": [x, y, 250, 180], "reading_order": i})
    return _layout(items)


CORPUS_ROWS = [
    {
        "image_id": "charts/doc1",
        "image_path": "/img/doc1.png",
        "sidecars": {"pixels": "docs/doc1.pixels.json", "layout": "docs/doc1.layout.json"},
        "scan_severity": 0,
        "generator": "chart-generator",
    },
    {
        "image_id": "tables/doc2",
        "image_path": "/img/doc2.png",
        "sidecars": {"cells": "docs/doc2.cells.json", "layout": "docs/doc2.layout.json"},
        "scan_severity": 2,
        "generator": "table-generator",
    },
    {
        "image_id": "text/doc3",
        "image_path": "/img/doc3.png",
        "sidecars": {"glyphs": "docs/doc3.p0.sidecar.json", "layout": "docs/doc3.layout.json"},
        "scan_severity": 4,
        "generator": "text-generator",
    },
]


@pytest.fixture(scope="session")
def corpus(tmp_path_factory):
    root = tmp_path_factory.mktemp("corpus")
    docs = root / "docs"
    docs.mkdir()

    sidecar_files = {
        "doc1.pixels.json": _pixels_doc1(),
        "doc1.layout.json": _layout_doc1(),
        "doc2.cells.json": _cells_doc2(),
        "doc2.layout.json": _layout_doc2(),
        "doc3.p0.sidecar.json": _glyphs_doc3(),
        "doc3.layout.json": _layout_doc3(),
    }
    for name, payload in sidecar_files.items():
        (docs / name).write_text(json.dumps(payload), encoding="utf-8")

    images = root / "images.jsonl"
    images.write_text("".join(json.dumps(r) + "\n" for r in CORPUS_ROWS), encoding="utf-8")
    return root
