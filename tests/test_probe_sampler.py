"""probe_sampler on the shared synthetic 3-doc corpus (see conftest.py):
schema, determinism, point ranges, per-family label semantics, caps, the
P-L1 background fraction, the table-generator sidecar schema, and per-image
error isolation (errors.jsonl + the >5% exit-code rule)."""

import json

import pytest
from conftest import SEVERITY

from encoder_experiments.probe_sampler import (
    CANONICAL17,
    DEFAULT_CAPS,
    FAILURE_FRAC_LIMIT,
    GLYPH_ALPHABET,
    build_probes,
    main,
    sample_cell_row_col,
    sample_image,
)


@pytest.fixture(scope="module")
def probes(corpus):
    out = corpus / "probes.jsonl"
    build_probes(corpus / "images.jsonl", out)
    return [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]


def _rows(probes, probe=None, image_id=None):
    return [
        r
        for r in probes
        if (probe is None or r["probe"] == probe)
        and (image_id is None or r["image_id"] == image_id)
    ]


# ---------------------------------------------------------------------------
# schema / determinism / ranges
# ---------------------------------------------------------------------------

def test_row_schema(probes):
    assert probes, "sampler produced no rows"
    for r in probes:
        assert set(r) == {"probe", "image_id", "point_xy", "label", "meta"}
        assert r["image_id"] in SEVERITY
        x, y = r["point_xy"]
        assert 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0
        meta = r["meta"]
        assert meta["difficulty"] in {"easy", "medium", "hard"}
        assert meta["difficulty_rules"] == "v1"
        # scan_severity is normalized: KEY string + int level
        assert meta["scan_severity"] == str(SEVERITY[r["image_id"]])
        assert meta["severity_level"] == SEVERITY[r["image_id"]]
        assert meta["generator"].endswith("-generator")


def test_two_runs_are_byte_identical(corpus):
    out_a = corpus / "run_a.jsonl"
    out_b = corpus / "run_b.jsonl"
    counts_a = build_probes(corpus / "images.jsonl", out_a)
    counts_b = build_probes(corpus / "images.jsonl", out_b)
    assert counts_a == counts_b
    assert out_a.read_bytes() == out_b.read_bytes()


def test_seeding_is_per_image_not_per_run_order(corpus):
    rows = [json.loads(line) for line in (corpus / "images.jsonl").read_text().splitlines()]
    forward = [r for row in rows for r in sample_image(row, root=corpus)]
    backward = [r for row in reversed(rows) for r in sample_image(row, root=corpus)]
    key = lambda r: (r["image_id"], r["probe"], json.dumps(r, sort_keys=True))
    assert sorted(forward, key=key) == sorted(backward, key=key)


# ---------------------------------------------------------------------------
# content probes
# ---------------------------------------------------------------------------

def test_series_id_labels_and_difficulty(probes):
    rows = _rows(probes, "series_id", "charts/doc1")
    assert 0 < len(rows) <= DEFAULT_CAPS["series_id"]
    chart0 = [r for r in rows if r["meta"]["chart_index"] == 0]
    chart1 = [r for r in rows if r["meta"]["chart_index"] == 1]
    assert {r["label"] for r in chart0} == {0, 1}  # series A -> 0, B -> 1
    assert {r["label"] for r in chart1} == {0}
    # per-object difficulty: 2-series line = medium, 1-series pie = easy
    assert {r["meta"]["difficulty"] for r in chart0} == {"medium"}
    assert {r["meta"]["difficulty"] for r in chart1} == {"easy"}


def test_point_value_only_calibrated_charts(probes):
    rows = _rows(probes, "point_value", "charts/doc1")
    assert rows
    assert {r["meta"]["chart_index"] for r in rows} == {0}  # pie has no axis
    assert {r["label"] for r in rows} == {1.0, 2.0, 3.0, 4.0, 5.0, 6.0}
    assert all(isinstance(r["label"], float) for r in rows)


def test_cell_row_col_labels_and_overlap_skip(probes):
    rows_r = _rows(probes, "cell_row", "tables/doc2")
    rows_c = _rows(probes, "cell_col", "tables/doc2")
    # the two sub-probes share one seeded cell selection: same count, and the
    # i-th row of each refers to the same cell (same point, paired emission)
    assert len(rows_r) == len(rows_c) > 0
    for rr, rc in zip(rows_r, rows_c):
        assert rr["point_xy"] == rc["point_xy"]
        assert isinstance(rr["label"], int) and isinstance(rc["label"], int)
    labels = {(rr["label"], rc["label"]) for rr, rc in zip(rows_r, rows_c)}
    expected = {(r, c) for r in range(3) for c in range(3)} | {(3, 0)}
    assert labels == expected  # trap cell (3, 2) skipped: center inside footer
    assert len(rows_r) == len(labels)
    for rows in (rows_r, rows_c):
        assert {r["meta"]["difficulty"] for r in rows} == {"medium"}  # merged footer
        for r in rows:
            assert r["meta"]["n_rows"] == 4 and r["meta"]["n_cols"] == 3


def test_glyph_id_cap_alphabet_and_meta(probes):
    rows = _rows(probes, "glyph_id", "text/doc3")
    assert len(rows) == DEFAULT_CAPS["glyph_id"]  # 100 candidates -> capped
    for r in rows:
        assert 0 <= r["label"] < len(GLYPH_ALPHABET)
        assert GLYPH_ALPHABET[r["label"]] == r["meta"]["char"]
        assert r["meta"]["size_pt"] == 10.0
    assert all(r["meta"]["char"] not in ("→", "§") for r in rows)


# ---------------------------------------------------------------------------
# table-generator sidecar schema (regression: the real corpus shape)
# ---------------------------------------------------------------------------

def _cells_tablegen():
    """Exact shape of a real table-generator cells.json (synth_70t_0001):
    grid_rows/grid_cols, cells with rowspan/colspan/tag ("th"/"td"), and
    [x, y, w, h] bboxes — NOT the replicator contract schema."""
    cells = []
    for r in range(6):
        for c in range(5):
            cells.append(
                {
                    "row": r,
                    "col": c,
                    "grid_row": r,
                    "grid_col": c,
                    "rowspan": 1,
                    "colspan": 1,
                    "tag": "th" if r == 0 else "td",
                    "bbox": [0.11 + 0.156 * c, 0.44 + 0.05 * r, 0.14, 0.04],
                    "text": f"v{r}{c}",
                }
            )
    return {
        "id": "synth_tg_0001",
        "page": 1,
        "page_px": {"w": 794, "h": 1122},
        "coords": "normalized [0,1] over the page; x rightward, y downward (top-left origin)",
        "tables": [
            {
                "table_index": 0,
                "bbox": [0.11, 0.44, 0.78, 0.24],
                "grid_rows": 6,
                "grid_cols": 5,
                "cells": cells,
            }
        ],
    }


def test_table_generator_schema_produces_cell_probes():
    # regression for the E2E failure: this shape used to raise Unclassifiable
    # ("n_rows must be a positive int, got None") and, past that, the xywh
    # bboxes were misread as corners and every cell was silently dropped
    rows = sample_cell_row_col("tables/tg1", _cells_tablegen(), ("0", 0), DEFAULT_CAPS["cell_rc"])
    rows_r = [r for r in rows if r["probe"] == "cell_row"]
    rows_c = [r for r in rows if r["probe"] == "cell_col"]
    assert len(rows_r) == len(rows_c) == 30  # all 30 cells survive
    assert {r["label"] for r in rows_r} == set(range(6))
    assert {r["label"] for r in rows_c} == set(range(5))
    for r in rows_r:
        assert r["meta"]["n_rows"] == 6 and r["meta"]["n_cols"] == 5
    # points are centers of the xywh->corner-converted boxes: x + w/2, y + h/2
    by_label = {(rr["label"], rc["label"]): rr["point_xy"] for rr, rc in zip(rows_r, rows_c)}
    x, y = by_label[(2, 3)]
    assert x == pytest.approx(0.11 + 0.156 * 3 + 0.14 / 2, abs=1e-5)
    assert y == pytest.approx(0.44 + 0.05 * 2 + 0.04 / 2, abs=1e-5)
    # header row carries is_header from tag == "th"
    header = [rr for rr in rows_r if rr["label"] == 0]
    assert header and all(r["meta"]["is_header"] for r in header)
    assert all(not r["meta"]["is_header"] for r in rows_r if r["label"] > 0)


# ---------------------------------------------------------------------------
# layout probes
# ---------------------------------------------------------------------------

def test_pl1_counts_classes_and_background_fraction(probes):
    for image_id in SEVERITY:
        rows = _rows(probes, "pl1_class", image_id)
        assert len(rows) == DEFAULT_CAPS["pl1_class"]
        for r in rows:
            assert r["label"] in CANONICAL17 or r["label"] == "background"
            assert r["meta"]["class"] == r["label"]
        bg = sum(r["label"] == "background" for r in rows) / len(rows)
        assert 0.10 <= bg <= 0.90, f"{image_id}: background fraction {bg}"


def test_pl2_two_points_inside_each_item(probes):
    rows = _rows(probes, "pl2_extent", "text/doc3")
    assert len(rows) == 9 * DEFAULT_CAPS["pl2_extent"]
    for r in rows:
        x, y = r["point_xy"]
        bx, by, bw, bh = r["label"]
        assert bx <= x <= bx + bw and by <= y <= by + bh
        assert all(0.0 <= v <= 1.0 for v in r["label"])
        assert r["meta"]["difficulty"] == "hard"  # 9 boxes


def test_pl3_summary_one_row_per_image(probes):
    for image_id, expect_present, n_boxes in [
        ("charts/doc1", {"Picture", "Title"}, 2),
        ("tables/doc2", {"Table", "Footnote"}, 2),
        ("text/doc3", {"Text", "Section-header", "Formula", "List-item", "Page-header", "Footnote"}, 9),
    ]:
        rows = _rows(probes, "pl3_summary", image_id)
        assert len(rows) == 1
        label = rows[0]["label"]
        # flat float vector: Canonical17 presence (frozen order) + n_boxes last
        assert isinstance(label, list) and len(label) == len(CANONICAL17) + 1
        assert all(isinstance(v, float) for v in label)
        assert {cls for cls, v in zip(CANONICAL17, label) if v == 1.0} == expect_present
        assert label[-1] == float(n_boxes)
        assert rows[0]["meta"]["pooled"] is True
        assert rows[0]["meta"]["n_boxes"] == n_boxes


def test_bbox_difficulty_slices(probes):
    assert {r["meta"]["difficulty"] for r in _rows(probes, "pl1_class", "tables/doc2")} == {"easy"}
    assert {r["meta"]["difficulty"] for r in _rows(probes, "pl1_class", "text/doc3")} == {"hard"}


# ---------------------------------------------------------------------------
# per-image error isolation (one bad doc must not kill the corpus)
# ---------------------------------------------------------------------------

def _write_corpus_with_bad_row(src_corpus, tmp_path, n_bad=1):
    """Corpus reusing the shared fixture's good sidecars plus n_bad rows whose
    cells sidecar is unfeaturizable (no n_rows/grid_rows -> Unclassifiable)."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "bad.cells.json").write_text(
        json.dumps({"id": "bad", "tables": [{"table_index": 0, "cells": []}]}),
        encoding="utf-8",
    )
    good = [json.loads(line) for line in (src_corpus / "images.jsonl").read_text().splitlines()]
    for row in good:
        row["sidecars"] = {
            k: str(src_corpus / v) for k, v in row["sidecars"].items()
        }
    bad = [
        {
            "image_id": f"tables/bad{i}",
            "image_path": f"/img/bad{i}.png",
            "sidecars": {"cells": "docs/bad.cells.json"},
            "scan_severity": 0,
            "generator": "table-generator",
        }
        for i in range(n_bad)
    ]
    images = tmp_path / "images.jsonl"
    images.write_text(
        "".join(json.dumps(r) + "\n" for r in good + bad), encoding="utf-8"
    )
    return images


def test_bad_image_goes_to_errors_jsonl_and_rest_survive(corpus, tmp_path):
    images = _write_corpus_with_bad_row(corpus, tmp_path)
    out = tmp_path / "probes.jsonl"
    counts = build_probes(images, out)
    assert counts["images"] == 4
    assert counts["images_failed"] == 1
    # good images fully sampled
    produced = {json.loads(line)["image_id"] for line in out.read_text().splitlines()}
    assert produced == {"charts/doc1", "tables/doc2", "text/doc3"}
    # the failure is recorded next to probes.jsonl with image_id + error
    errors = [json.loads(line) for line in (tmp_path / "errors.jsonl").read_text().splitlines()]
    assert len(errors) == 1
    assert errors[0]["image_id"] == "tables/bad0"
    assert "Unclassifiable" in errors[0]["error"]


def test_exit_nonzero_only_above_failure_threshold(corpus, tmp_path):
    # 1 bad / 4 images = 25% > 5% -> exit 1
    bad_dir = tmp_path / "bad"
    bad_dir.mkdir()
    images = _write_corpus_with_bad_row(corpus, bad_dir)
    assert main(["--images", str(images), "--out", str(bad_dir / "probes.jsonl")]) == 1
    # all-good corpus -> exit 0 and no errors.jsonl
    ok_dir = tmp_path / "ok"
    ok_dir.mkdir()
    good = [json.loads(line) for line in (corpus / "images.jsonl").read_text().splitlines()]
    for row in good:
        row["sidecars"] = {k: str(corpus / v) for k, v in row["sidecars"].items()}
    images_ok = ok_dir / "images.jsonl"
    images_ok.write_text("".join(json.dumps(r) + "\n" for r in good), encoding="utf-8")
    assert main(["--images", str(images_ok), "--out", str(ok_dir / "probes.jsonl")]) == 0
    assert not (ok_dir / "errors.jsonl").exists()
    assert 0.0 < FAILURE_FRAC_LIMIT < 1.0


# ---------------------------------------------------------------------------
# severity normalization + doc_id carry (regression: book-key '2b' crash and
# manifest doc_id dropped on the floor)
# ---------------------------------------------------------------------------

def test_normalize_severity_accepts_corpus_conventions():
    from encoder_experiments.probe_sampler import normalize_severity

    assert normalize_severity(0) == ("0", 0)
    assert normalize_severity(3) == ("3", 3)
    assert normalize_severity("2") == ("2", 2)
    assert normalize_severity("2b") == ("2b", 2)  # used to int()-crash
    assert normalize_severity("3b") == ("3b", 3)
    assert normalize_severity(" 1b ") == ("1b", 1)
    assert normalize_severity(None) == ("0", 0)
    for bad in ("b2", "fax", "", True, 1.5):
        with pytest.raises(ValueError):
            normalize_severity(bad)


def test_book_severity_rows_sample_and_carry_doc_id(corpus, tmp_path):
    # the audited pilot manifest writes scan_severity as the STRING key
    # '2b'/'3b' for book variants and carries doc_id on every row
    rows = [json.loads(line) for line in (corpus / "images.jsonl").read_text().splitlines()]
    for row in rows:
        row["sidecars"] = {k: str(corpus / v) for k, v in row["sidecars"].items()}
        row["scan_severity"] = "2b"
        row["doc_id"] = row["image_id"].split("/", 1)[1]
    images = tmp_path / "images.jsonl"
    images.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    out = tmp_path / "probes.jsonl"
    counts = build_probes(images, out)
    assert counts["images_failed"] == 0  # '2b' used to fail every row
    produced = [json.loads(line) for line in out.read_text().splitlines()]
    assert produced
    for r in produced:
        assert r["meta"]["scan_severity"] == "2b"
        assert r["meta"]["severity_level"] == 2
        # doc_id from the manifest rides on EVERY probe row
        assert r["doc_id"] == r["image_id"].split("/", 1)[1]


def test_severity_key_field_wins_over_scan_severity(corpus, tmp_path):
    # degrade.py manifests write scan_severity as the base INT plus a separate
    # severity_key ('2b'); the key must win so the book axis isn't collapsed
    rows = [json.loads(line) for line in (corpus / "images.jsonl").read_text().splitlines()][:1]
    rows[0]["sidecars"] = {k: str(corpus / v) for k, v in rows[0]["sidecars"].items()}
    rows[0]["scan_severity"] = 2
    rows[0]["severity_key"] = "2b"
    images = tmp_path / "images.jsonl"
    images.write_text(json.dumps(rows[0]) + "\n", encoding="utf-8")
    out = tmp_path / "probes.jsonl"
    counts = build_probes(images, out)
    assert counts["images_failed"] == 0
    produced = [json.loads(line) for line in out.read_text().splitlines()]
    assert produced
    assert all(r["meta"]["scan_severity"] == "2b" for r in produced)
    assert all(r["meta"]["severity_level"] == 2 for r in produced)
    # no doc_id in the manifest row -> none invented on probe rows
    assert all("doc_id" not in r for r in produced)
