"""degrade.py cells.json bbox-convention handling: xywh bboxes transformed
down the corner path become hulls of inverted rects, so the convention is
sniffed PER FILE (coords string, then producer schema keys, then the corner
geometric invariant) and never guessed from a generator name — each file is
transformed IN its own convention.
"""

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest

from encoder_experiments.probe_sampler import DEFAULT_CAPS, sample_cell_row_col

ROOT = Path(__file__).resolve().parents[1]

_spec = importlib.util.spec_from_file_location("degrade", ROOT / "src" / "data" / "degrade.py")
degrade = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("degrade", degrade)
_spec.loader.exec_module(degrade)

# a non-trivial affine: rotation + skew + shift (normalized coords)
M = np.array(
    [
        [0.9995, -0.0300, 0.0120],
        [0.0210, 0.9995, -0.0080],
    ]
)


def _tablegen_doc():
    """Table-generator shape: grid_rows/grid_cols, rowspan/colspan/tag cells,
    xywh bboxes, coords string WITHOUT a bbox spec."""
    cells = [
        {
            "row": r, "col": c, "grid_row": r, "grid_col": c,
            "rowspan": 1, "colspan": 1, "tag": "th" if r == 0 else "td",
            "bbox": [0.1 + 0.2 * c, 0.4 + 0.06 * r, 0.18, 0.05],
            "text": f"v{r}{c}",
        }
        for r in range(4)
        for c in range(3)
    ]
    return {
        "id": "synth_tg",
        "coords": "normalized [0,1] over the page; x rightward, y downward (top-left origin)",
        "tables": [
            {"table_index": 0, "bbox": [0.1, 0.4, 0.58, 0.29],
             "grid_rows": 4, "grid_cols": 3, "cells": cells}
        ],
    }


def _replicator_doc():
    """Replicator shape: n_rows/n_cols, dom_row/is_header/row_span cells,
    corner bboxes, coords string naming x0,y0,x1,y1."""
    cells = [
        {
            "dom_row": r, "dom_slot": c, "row": r, "col": c,
            "row_span": 1, "col_span": 1, "is_header": r == 0,
            "text": f"v{r}{c}", "page": 0,
            "bbox": [0.1 + 0.2 * c, 0.4 + 0.06 * r, 0.28 + 0.2 * c, 0.45 + 0.06 * r],
        }
        for r in range(3)
        for c in range(2)
    ]
    return {
        "id": "repl",
        "coords": "normalized [0,1] over the page, x rightward, y downward "
                  "(top-left origin); bbox=[x0,y0,x1,y1]; matches encoder_experiments/sites.py",
        "tables": [
            {"table_index": 0, "page": 0, "n_rows": 3, "n_cols": 2,
             "bbox": [0.1, 0.4, 0.68, 0.63], "cells": cells}
        ],
    }


def _hull(bbox_corners):
    x0, y0, x1, y1 = bbox_corners
    pts = [
        (M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2])
        for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
    ]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


# ---------------------------------------------------------------------------
# detection
# ---------------------------------------------------------------------------

def test_detect_by_coords_string():
    assert degrade.detect_cells_bbox_convention(_replicator_doc()) == "corners"
    # coords naming [x,y,w,h] resolves without any table keys
    assert degrade.detect_cells_bbox_convention(
        {"coords": "bbox = [x, y, w, h] COCO-style", "tables": []}
    ) == "xywh"


def test_detect_by_schema_keys_without_coords():
    tg = _tablegen_doc()
    del tg["coords"]  # table-generator coords string names no bbox spec anyway
    assert degrade.detect_cells_bbox_convention(tg) == "xywh"
    rp = _replicator_doc()
    del rp["coords"]
    assert degrade.detect_cells_bbox_convention(rp) == "corners"


def test_detect_by_geometric_invariant():
    # no coords, no producer keys — but a bbox with b[2] < b[0] proves xywh
    doc = {"tables": [{"cells": [
        {"row": 0, "col": 0, "text": "x", "bbox": [0.8, 0.1, 0.05, 0.02]}
    ]}]}
    assert degrade.detect_cells_bbox_convention(doc) == "xywh"


def test_detect_refuses_to_guess_when_ambiguous():
    doc = {"tables": [{"cells": [
        {"row": 0, "col": 0, "text": "x", "bbox": [0.1, 0.1, 0.5, 0.5]}
    ]}]}
    with pytest.raises(ValueError, match="bbox convention"):
        degrade.detect_cells_bbox_convention(doc)


# ---------------------------------------------------------------------------
# transform: each file transformed IN its own convention
# ---------------------------------------------------------------------------

def test_xywh_cells_transform_stays_xywh_and_matches_affine_oracle():
    doc = _tablegen_doc()
    out = degrade.transform_sidecar(doc, M, "2b", page_index=0)
    assert out["scan_bbox_fmt"] == "xywh"
    table_out = out["tables"][0]
    pairs = [(doc["tables"][0], table_out)] + list(
        zip(doc["tables"][0]["cells"], table_out["cells"])
    )
    for src, got in pairs:
        x, y, w, h = src["bbox"]
        ex0, ey0, ex1, ey1 = _hull([x, y, x + w, y + h])
        exp = [ex0, ey0, ex1 - ex0, ey1 - ey0]
        assert got["bbox"] == pytest.approx(exp, abs=1e-6)
        gx, gy, gw, gh = got["bbox"]
        assert gw > 0 and gh > 0  # never an inverted-rect hull
    # non-coordinate fields untouched
    assert table_out["grid_rows"] == 4 and table_out["cells"][0]["tag"] == "th"


def test_corner_cells_transform_keeps_corner_semantics():
    doc = _replicator_doc()
    out = degrade.transform_sidecar(doc, M, 2, page_index=0)
    assert out["scan_bbox_fmt"] == "corners"
    for src, got in zip(doc["tables"][0]["cells"], out["tables"][0]["cells"]):
        assert got["bbox"] == pytest.approx(list(_hull(src["bbox"])), abs=1e-6)


def test_degraded_tablegen_cells_still_feed_the_sampler():
    """A degraded table-generator doc must emit exactly as many
    cell_row/cell_col rows as its clean twin — never silently zero."""
    doc = _tablegen_doc()
    n_cells = len(doc["tables"][0]["cells"])
    clean_rows = sample_cell_row_col("tables/tg", doc, ("0", 0), DEFAULT_CAPS["cell_rc"])
    assert len(clean_rows) == 2 * n_cells

    moved = degrade.transform_sidecar(doc, M, "2b", page_index=0)
    degraded_rows = sample_cell_row_col(
        "tables/tg__sev2b", moved, ("2b", 2), DEFAULT_CAPS["cell_rc"]
    )
    assert len(degraded_rows) == len(clean_rows)
    labels = {(r["probe"], r["label"]) for r in degraded_rows}
    assert ("cell_row", 3) in labels and ("cell_col", 2) in labels


def test_process_page_cli_path_transforms_tablegen_cells_correctly(tmp_path):
    """Full CLI path (find_sidecars -> process_page dispatch): the degraded
    cells.json must equal the stamped scan_geom_matrix applied to the clean
    xywh rects, re-expressed as xywh."""
    cv2 = pytest.importorskip("cv2")
    img = np.full((300, 400, 3), 255, np.uint8)
    cv2.rectangle(img, (40, 120), (360, 260), (0, 0, 0), 2)
    doc = _tablegen_doc()
    (tmp_path / "tgpage.cells.json").write_text(json.dumps(doc))

    degrade.process_page(img, "tgpage", 0, 1, 1, tmp_path, 20260812, tmp_path, None)

    out = json.loads((tmp_path / "tgpage__sev1.cells.json").read_text())
    meta = json.loads((tmp_path / "tgpage__sev1.degrade.json").read_text())
    Mn = np.asarray(meta["scan_geom_matrix"], dtype=np.float64)
    assert out["scan_bbox_fmt"] == "xywh"
    for src, got in zip(doc["tables"][0]["cells"], out["tables"][0]["cells"]):
        x, y, w, h = src["bbox"]
        ex0, ey0, ex1, ey1 = degrade.xf_bbox(Mn, [x, y, x + w, y + h])
        assert got["bbox"] == pytest.approx([ex0, ey0, ex1 - ex0, ey1 - ey0], abs=1e-6)
