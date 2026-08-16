"""Probe sampling: corpus images.jsonl -> probes.jsonl for the Exp 1 harness.

Input: one JSON row per image::

    {"image_id": ..., "image_path": ...,
     "sidecars": {"layout": <path>, "cells": <path>,
                  "pixels": <path>, "glyphs": <path>},
     "scan_severity": 0, "generator": ..., "covariates": {...}}

Sidecar paths may be absolute or relative to the images.jsonl directory.
Missing sidecar keys simply skip the probe families that need them.

Output: one JSON row per probe SAMPLE::

    {"probe": <family>, "image_id": ..., "doc_id": ..., "point_xy": [x, y],
     "label": ..., "meta": {"difficulty": ..., "scan_severity": ..., ...}}

``doc_id`` is copied from the manifest row onto every probe row when present
(probe_fit prefers it over deriving from image_id). ``scan_severity`` in the
manifest may be an int (0..4) or a book-variant key ('1b'/'2b'/'3b'); it is
normalized (see :func:`normalize_severity`) to ``meta.scan_severity`` = the
severity KEY as a string (e.g. '2b') plus ``meta.severity_level`` = the int
base level (e.g. 2).

Points follow the sites.py convention: (x, y) normalized to [0, 1] over the
original image, x rightward, y downward.

Probe families
--------------
- ``series_id``   chart marks (pixels.json); label = index of the mark's
                  seriesName within its chart's ordered series list; point =
                  mark anchor (fallback: mark center). Cap ~30/page, seeded.
- ``point_value`` same marks, cartesian charts with axis calibration only;
                  label = axisValue (regression). Cap ~30/page, seeded.
- ``cell_row`` /  non-empty cells (cells.json, either producer schema — see
  ``cell_col``    difficulty_tagger.normalize_table); two classification
                  sub-probes fitted independently and reported side by side:
                  label = int row index (``cell_row``) / int column index
                  (``cell_col``); point = cell bbox center. One seeded cell
                  selection (keyed ``cell_rc``) is shared by both sub-probes,
                  so they probe the same points. Cells whose center falls
                  inside another cell's bbox are skipped (overlap ambiguity).
                  Cap ~40 cells/table, seeded.
- ``glyph_id``    glyph sidecar; label = char-class index over a fixed
                  alphabet ([a-zA-Z0-9] + top punctuation), ``size_pt`` in
                  meta; point = glyph bbox center. Cap ~60/page, seeded.
- ``pl1_class``   K=96 points/page uniform over the page; label = Canonical17
                  class of the smallest-area layout item containing the
                  point, else "background".
- ``pl2_extent``  2 points/layout-item uniform inside the item; label = the
                  item's [x, y, w, h] / 1000 (regression).
- ``pl3_summary`` one row/image; label = flat float vector: per-class
                  presence (0/1, CANONICAL17 order, frozen) with n_boxes
                  appended as the last element — a plain regression target
                  for probe_fit (pooled probe; point_xy is the page center
                  by convention).

Label contract (shared with probe_fit): labels are ints/strs/bools
(classification) or floats / lists of floats (regression, pl2 bbox) — never
dicts. Multi-target probes are split into one sub-probe per target at this
level (cell_row/cell_col) or flattened into a vector (pl3_summary).

All sampling is seeded from (image_id, probe) — two runs over the same
corpus are byte-identical, regardless of row order (cell_row/cell_col share
one selection seeded from (image_id, "cell_rc")). Every row carries
``meta.difficulty`` from :mod:`encoder_experiments.difficulty_tagger`
(rules v1): chart rows use their chart's tag, cell rows their table's tag,
glyph rows the page's text/math tag, pl* rows the page's bbox tag.
``scan_severity`` rides in meta as its own orthogonal axis.

A failure on one image never kills the corpus: the offending row is logged
to ``errors.jsonl`` next to the output (``{"image_id", "error"}`` per line)
and sampling continues; the CLI exits nonzero only when more than
``FAILURE_FRAC_LIMIT`` (5%) of images fail.

Usage::

    uv run python -m encoder_experiments.probe_sampler \\
        --images data/probe_v1/images.jsonl --out data/probe_v1/probes.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import string
import sys
from pathlib import Path
from typing import Any, Iterable

from .difficulty_tagger import (
    DIFFICULTY_RULES_VERSION,
    layout_items_normalized,
    normalize_table,
    tag_bboxes,
    tag_chart,
    tag_table,
    tag_text,
)

PROBES = (
    "series_id",
    "point_value",
    "cell_row",
    "cell_col",
    "glyph_id",
    "pl1_class",
    "pl2_extent",
    "pl3_summary",
)

DEFAULT_CAPS = {
    "series_id": 30,    # marks per page
    "point_value": 30,  # marks per page
    "cell_rc": 40,      # cells per table — one shared selection; each kept
                        # cell emits one cell_row row + one cell_col row
    "glyph_id": 60,     # glyphs per page
    "pl1_class": 96,    # points per page (K)
    "pl2_extent": 2,    # points per layout item
}

# CLI exits nonzero when more than this fraction of corpus images fail.
FAILURE_FRAC_LIMIT = 0.05

# Canonical17 — the EXACT enum strings of llamacloud-bench's CanonicalLabel,
# as emitted by the generators' layout sidecars.
CANONICAL17 = (
    "Caption",
    "Footnote",
    "Formula",
    "List-item",
    "Page-footer",
    "Page-header",
    "Picture",
    "Section-header",
    "Table",
    "Text",
    "Title",
    "Checkbox-Selected",
    "Checkbox-Unselected",
    "Code",
    "Document Index",
    "Form",
    "Key-Value Region",
)
BACKGROUND_CLASS = "background"

# Fixed glyph alphabet: [a-zA-Z0-9] + top punctuation. Glyphs outside it are
# skipped (never relabeled). Order is the label index — frozen.
TOP_PUNCTUATION = ".,:;!?'\"()-%$/&*+="
GLYPH_ALPHABET: tuple[str, ...] = tuple(
    string.ascii_lowercase + string.ascii_uppercase + string.digits + TOP_PUNCTUATION
)
_GLYPH_INDEX = {ch: i for i, ch in enumerate(GLYPH_ALPHABET)}


# Helpers

def _rng(image_id: str, probe: str) -> random.Random:
    """Deterministic per-(image_id, probe) RNG — no global state, no clock."""
    digest = hashlib.blake2b(f"{image_id}::{probe}".encode(), digest_size=8).digest()
    return random.Random(int.from_bytes(digest, "big"))


_SEVERITY_RE = re.compile(r"(\d+)(b?)")


def normalize_severity(value: Any) -> tuple[str, int]:
    """Corpus ``scan_severity`` -> ``(key, level)``.

    The corpus writes severities in two spellings: plain ints (0..4) and
    book-variant string keys ('1b'/'2b'/'3b'); degrade.py manifests also carry
    a separate ``severity_key``. Accepts ints, numeric strings and '<n>b'
    keys; returns the severity KEY as a string (e.g. '2b') plus the int base
    level (e.g. 2). Anything else raises ValueError (caught by per-image
    error isolation).
    """
    if isinstance(value, bool):
        raise ValueError(f"scan_severity must be an int or severity key, got {value!r}")
    if value is None:
        return "0", 0
    if isinstance(value, int):
        return str(value), value
    if isinstance(value, float) and value.is_integer():
        return str(int(value)), int(value)
    m = _SEVERITY_RE.fullmatch(str(value).strip())
    if not m:
        raise ValueError(f"unrecognized scan_severity {value!r} (want int, '<n>' or '<n>b')")
    return m.group(0), int(m.group(1))


def _clamp01(v: float) -> float:
    return min(max(float(v), 0.0), 1.0)


def _point(x: float, y: float) -> list[float]:
    return [round(_clamp01(x), 6), round(_clamp01(y), 6)]


def _cap(items: list, cap: int, rng: random.Random) -> list:
    """Seeded subsample to at most `cap`, preserving original order."""
    if len(items) <= cap:
        return items
    keep = sorted(rng.sample(range(len(items)), cap))
    return [items[i] for i in keep]


def _row(probe: str, image_id: str, point: list[float], label: Any, meta: dict) -> dict:
    return {"probe": probe, "image_id": image_id, "point_xy": point, "label": label, "meta": meta}


def _base_meta(difficulty: str, severity: tuple[str, int], **extra: Any) -> dict:
    """`severity` is the normalized (key, level) pair from normalize_severity:
    meta.scan_severity = the severity KEY (string, e.g. '2b'),
    meta.severity_level = the int base level (e.g. 2)."""
    key, level = severity
    meta = {
        "difficulty": difficulty,
        "difficulty_rules": DIFFICULTY_RULES_VERSION,
        "scan_severity": key,
        "severity_level": level,
    }
    meta.update(extra)
    return meta


def _mark_point(mark: dict) -> tuple[float, float] | None:
    """Anchor if present, else the mark's bbox center. None if uncoordinated
    (e.g. rotated pages null out page-space coords)."""
    anchor = mark.get("anchor")
    if anchor and anchor.get("x") is not None and anchor.get("y") is not None:
        return float(anchor["x"]), float(anchor["y"])
    x, y = mark.get("x"), mark.get("y")
    if x is None or y is None:
        return None
    w = mark.get("w") or 0.0
    h = mark.get("h") or 0.0
    return float(x) + float(w) / 2.0, float(y) + float(h) / 2.0


# Content probes

def _chart_series(chart: dict) -> list[str]:
    series: list[str] = []
    for m in chart.get("marks") or []:
        name = m.get("seriesName")
        if name is not None and name not in series:
            series.append(name)
    return series


def _chart_calibrated(chart: dict, mark: dict) -> bool:
    """Cartesian chart with a value-axis calibration for this mark."""
    axis = chart.get("axis") or {}
    if axis.get("valueAxis") == "x":
        return axis.get("xMin") is not None and axis.get("xMax") is not None
    if mark.get("axis") == "right":
        return axis.get("y2Min") is not None and axis.get("y2Max") is not None
    return axis.get("yMin") is not None and axis.get("yMax") is not None


def sample_series_id(image_id: str, pixels: dict, severity: tuple[str, int], cap: int) -> list[dict]:
    if not pixels.get("page_coords_valid", True):
        return []
    candidates: list[dict] = []
    for chart_idx, chart in enumerate(pixels.get("charts") or []):
        difficulty, _ = tag_chart(chart)
        series = _chart_series(chart)
        for mark in chart.get("marks") or []:
            name = mark.get("seriesName")
            pt = _mark_point(mark)
            if name is None or pt is None:
                continue
            candidates.append(
                _row(
                    "series_id",
                    image_id,
                    _point(*pt),
                    series.index(name),
                    _base_meta(
                        difficulty,
                        severity,
                        chart_index=chart_idx,
                        chart_type=chart.get("chartType"),
                        series_name=name,
                        n_series=len(series),
                        kind=mark.get("kind"),
                    ),
                )
            )
    return _cap(candidates, cap, _rng(image_id, "series_id"))


def sample_point_value(image_id: str, pixels: dict, severity: tuple[str, int], cap: int) -> list[dict]:
    if not pixels.get("page_coords_valid", True):
        return []
    candidates: list[dict] = []
    for chart_idx, chart in enumerate(pixels.get("charts") or []):
        difficulty, _ = tag_chart(chart)
        for mark in chart.get("marks") or []:
            value = mark.get("axisValue")
            pt = _mark_point(mark)
            if value is None or pt is None or not _chart_calibrated(chart, mark):
                continue
            candidates.append(
                _row(
                    "point_value",
                    image_id,
                    _point(*pt),
                    float(value),
                    _base_meta(
                        difficulty,
                        severity,
                        chart_index=chart_idx,
                        chart_type=chart.get("chartType"),
                        series_name=mark.get("seriesName"),
                        kind=mark.get("kind"),
                    ),
                )
            )
    return _cap(candidates, cap, _rng(image_id, "point_value"))


def _center_in_other_cell(center: tuple[float, float], cell_idx: int, cells: list[dict]) -> bool:
    cx, cy = center
    for j, other in enumerate(cells):
        if j == cell_idx:
            continue
        bbox = other.get("bbox")
        if not bbox:
            continue
        x0, y0, x1, y1 = bbox
        # half-open: cells tile the table sharing edges; a center exactly on a
        # neighbor's far edge is not "inside" it
        if x0 <= cx < x1 and y0 <= cy < y1:
            return True
    return False


def sample_cell_row_col(
    image_id: str, cells_doc: dict, severity: tuple[str, int], cap_per_table: int
) -> list[dict]:
    """cell_row + cell_col rows — one of each per sampled cell.

    The two sub-probes are classification targets fitted independently by
    probe_fit and reported side by side; they share one seeded cell selection
    (keyed ``cell_rc``) so both probe the exact same points.
    """
    rows: list[dict] = []
    template = cells_doc.get("template")
    rng = _rng(image_id, "cell_rc")
    for table in cells_doc.get("tables") or []:
        table = normalize_table(table)
        difficulty, cov = tag_table(table, template=template)
        table_idx = table.get("table_index", 0)
        cells = table.get("cells") or []
        candidates: list[tuple[tuple[float, float], dict]] = []
        for i, cell in enumerate(cells):
            text = cell.get("text")
            bbox = cell.get("bbox")
            if text is None or not str(text).strip() or not bbox:
                continue
            x0, y0, x1, y1 = bbox
            center = ((x0 + x1) / 2.0, (y0 + y1) / 2.0)
            if _center_in_other_cell(center, i, cells):
                continue  # overlap ambiguity — drop, don't relabel
            candidates.append((center, cell))
        for center, cell in _cap(candidates, cap_per_table, rng):
            point = _point(*center)
            for probe, label in (
                ("cell_row", int(cell["row"])),
                ("cell_col", int(cell["col"])),
            ):
                rows.append(
                    _row(
                        probe,
                        image_id,
                        point,
                        label,
                        _base_meta(
                            difficulty,
                            severity,
                            table_index=table_idx,
                            n_rows=cov["n_rows"],
                            n_cols=cov["n_cols"],
                            is_header=bool(cell.get("is_header")),
                            row_span=int(cell.get("row_span", 1) or 1),
                            col_span=int(cell.get("col_span", 1) or 1),
                        ),
                    )
                )
    return rows


def sample_glyph_id(
    image_id: str,
    glyphs_doc: dict,
    severity: tuple[str, int],
    cap: int,
    covariates: dict | None = None,
) -> list[dict]:
    difficulty, _ = tag_text(covariates, glyphs_doc)
    candidates: list[dict] = []
    for glyph in glyphs_doc.get("glyphs") or []:
        char = glyph.get("char")
        bbox = glyph.get("bbox")
        if char not in _GLYPH_INDEX or not bbox:
            continue  # outside the fixed alphabet — skip, never relabel
        x0, y0, x1, y1 = bbox
        candidates.append(
            _row(
                "glyph_id",
                image_id,
                _point((x0 + x1) / 2.0, (y0 + y1) / 2.0),
                _GLYPH_INDEX[char],
                _base_meta(
                    difficulty,
                    severity,
                    char=char,
                    size_pt=glyph.get("size_pt"),
                    font=glyph.get("font"),
                ),
            )
        )
    return _cap(candidates, cap, _rng(image_id, "glyph_id"))


# Layout probes (P-L1 / P-L2 / P-L3)

def _class_at_point(x: float, y: float, items: list[dict]) -> str:
    """Canonical17 class of the smallest-area item containing (x, y), else
    background (smallest-area-wins on overlap, per the README probe spec)."""
    best_cls, best_area = BACKGROUND_CLASS, float("inf")
    for it in items:
        bx, by, bw, bh = it["bbox"]
        if bx <= x <= bx + bw and by <= y <= by + bh:
            area = bw * bh
            if area < best_area:
                best_cls, best_area = it["class"], area
    return best_cls


def sample_pl1_class(image_id: str, layout: dict, severity: tuple[str, int], k: int) -> list[dict]:
    difficulty, cov = tag_bboxes(layout)
    items = layout_items_normalized(layout)
    rng = _rng(image_id, "pl1_class")
    rows = []
    for _ in range(k):
        x, y = rng.random(), rng.random()
        cls = _class_at_point(x, y, items)
        rows.append(
            _row(
                "pl1_class",
                image_id,
                _point(x, y),
                cls,
                _base_meta(difficulty, severity, **{"class": cls, "n_boxes": cov["n_boxes"]}),
            )
        )
    return rows


def sample_pl2_extent(
    image_id: str, layout: dict, severity: tuple[str, int], points_per_item: int
) -> list[dict]:
    difficulty, _ = tag_bboxes(layout)
    items = layout_items_normalized(layout)
    rng = _rng(image_id, "pl2_extent")
    rows = []
    for item_idx, it in enumerate(items):
        bx, by, bw, bh = it["bbox"]
        if bw <= 0 or bh <= 0:
            continue  # degenerate box — nothing to sample inside
        label = [round(v, 6) for v in (bx, by, bw, bh)]
        for _ in range(points_per_item):
            x = bx + rng.random() * bw
            y = by + rng.random() * bh
            rows.append(
                _row(
                    "pl2_extent",
                    image_id,
                    _point(x, y),
                    label,
                    _base_meta(
                        difficulty,
                        severity,
                        **{"class": it.get("class"), "item_index": item_idx},
                    ),
                )
            )
    return rows


def sample_pl3_summary(image_id: str, layout: dict, severity: tuple[str, int]) -> list[dict]:
    """One pooled row/image. Label = flat float vector (regression for
    probe_fit): per-class presence 0/1 in CANONICAL17 order (frozen), then
    n_boxes as the last element. Never a dict — probe_fit's label contract
    has no dict path."""
    difficulty, cov = tag_bboxes(layout)
    items = layout_items_normalized(layout)
    present = {it.get("class") for it in items}
    label = [float(cls in present) for cls in CANONICAL17] + [float(cov["n_boxes"])]
    # pooled probe — no marked point; page center by convention
    return [
        _row(
            "pl3_summary",
            image_id,
            [0.5, 0.5],
            label,
            _base_meta(difficulty, severity, pooled=True, n_boxes=cov["n_boxes"]),
        )
    ]


# Per-image / corpus drivers

def _load_sidecar(path_str: str | None, root: Path | None) -> dict | None:
    if not path_str:
        return None
    path = Path(path_str)
    if not path.is_absolute() and root is not None:
        path = root / path
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def sample_image(row: dict, *, root: Path | None = None, caps: dict | None = None) -> list[dict]:
    """All probe rows for one corpus row. Deterministic in (image_id, probe)."""
    caps = {**DEFAULT_CAPS, **(caps or {})}
    image_id = row["image_id"]
    # severity_key (degrade.py manifests) wins over scan_severity
    severity = normalize_severity(
        row.get("severity_key", row.get("scan_severity", 0))
    )
    covariates = row.get("covariates") or {}
    sidecars = row.get("sidecars") or {}

    pixels = _load_sidecar(sidecars.get("pixels"), root)
    cells = _load_sidecar(sidecars.get("cells"), root)
    glyphs = _load_sidecar(sidecars.get("glyphs"), root)
    layout = _load_sidecar(sidecars.get("layout"), root)

    rows: list[dict] = []
    if pixels is not None:
        rows.extend(sample_series_id(image_id, pixels, severity, caps["series_id"]))
        rows.extend(sample_point_value(image_id, pixels, severity, caps["point_value"]))
    if cells is not None:
        rows.extend(sample_cell_row_col(image_id, cells, severity, caps["cell_rc"]))
    if glyphs is not None:
        rows.extend(sample_glyph_id(image_id, glyphs, severity, caps["glyph_id"], covariates))
    if layout is not None:
        rows.extend(sample_pl1_class(image_id, layout, severity, caps["pl1_class"]))
        rows.extend(sample_pl2_extent(image_id, layout, severity, caps["pl2_extent"]))
        rows.extend(sample_pl3_summary(image_id, layout, severity))

    generator = row.get("generator")
    if generator is not None:
        for r in rows:
            r["meta"]["generator"] = generator
    # manifest doc_id rides on every probe row so probe_fit's document split
    # never has to derive it from image_id
    doc_id = row.get("doc_id")
    if doc_id is not None:
        for r in rows:
            r["doc_id"] = str(doc_id)
    return rows


def iter_corpus(images_jsonl: Path) -> Iterable[dict]:
    with open(images_jsonl, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def build_probes(
    images_jsonl: Path | str,
    out_jsonl: Path | str,
    *,
    caps: dict | None = None,
) -> dict[str, int]:
    """images.jsonl -> probes.jsonl. Returns per-probe row counts plus
    ``images`` / ``images_failed``.

    One bad image never kills the corpus: per-image failures are caught,
    appended to ``errors.jsonl`` next to ``out_jsonl`` (one
    ``{"image_id", "error"}`` JSON row each), and sampling continues. A
    failed image contributes no probe rows (sampling happens before any
    write, so there are no partial images). Any stale ``errors.jsonl`` is
    removed first; the file exists after a run iff something failed.
    """
    images_jsonl = Path(images_jsonl)
    out_jsonl = Path(out_jsonl)
    out_jsonl.parent.mkdir(parents=True, exist_ok=True)
    errors_jsonl = out_jsonl.parent / "errors.jsonl"
    errors_jsonl.unlink(missing_ok=True)
    root = images_jsonl.parent

    counts: dict[str, int] = {p: 0 for p in PROBES}
    n_images = 0
    failures: list[dict] = []
    with open(out_jsonl, "w", encoding="utf-8") as out:
        for row in iter_corpus(images_jsonl):
            n_images += 1
            try:
                probe_rows = sample_image(row, root=root, caps=caps)
            except Exception as exc:  # noqa: BLE001 — per-image isolation
                failure = {
                    "image_id": row.get("image_id"),
                    "error": f"{type(exc).__name__}: {exc}",
                }
                failures.append(failure)
                print(
                    f"[probe_sampler] FAIL {failure['image_id']}: {failure['error']}",
                    file=sys.stderr,
                )
                continue
            for probe_row in probe_rows:
                counts[probe_row["probe"]] += 1
                out.write(json.dumps(probe_row, ensure_ascii=False) + "\n")
    if failures:
        with open(errors_jsonl, "w", encoding="utf-8") as err:
            for failure in failures:
                err.write(json.dumps(failure, ensure_ascii=False) + "\n")
    counts["images"] = n_images
    counts["images_failed"] = len(failures)
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--images", required=True, help="corpus images.jsonl")
    ap.add_argument("--out", required=True, help="output probes.jsonl")
    args = ap.parse_args(argv)
    counts = build_probes(Path(args.images), Path(args.out))
    for name, n in counts.items():
        print(f"{name}: {n}")
    n_images, n_failed = counts["images"], counts["images_failed"]
    if n_images and n_failed / n_images > FAILURE_FRAC_LIMIT:
        print(
            f"[probe_sampler] {n_failed}/{n_images} images failed "
            f"(> {FAILURE_FRAC_LIMIT:.0%}); see "
            f"{Path(args.out).parent / 'errors.jsonl'}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
