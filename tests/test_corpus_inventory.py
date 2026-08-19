"""Stage 0/1 corpus tooling: unit checks plus a round-trip on a PDF we author.

The round-trip is the load-bearing one. Every downstream selection decision
reads these fields, and a silent regression in the probe would misroute the
whole corpus without failing anything else.
"""

from __future__ import annotations

import json
import pathlib

import fitz
import pytest

from encoder_experiments.corpus import cluster, inventory


# --------------------------------------------------------------------------
# script classification
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ch,expected",
    [
        ("a", "ascii"),
        ("7", "ascii"),
        ("é", "latin_ext"),
        ("漢", "han"),
        ("ひ", "kana"),
        ("カ", "kana"),
        ("한", "hangul"),
        ("ع", "arabic"),
        ("ש", "hebrew"),
        ("д", "cyrillic"),
        ("क", "devanagari"),
        ("ก", "thai"),
        ("α", "greek"),
        ("→", "other"),
    ],
)
def test_script_of(ch: str, expected: str) -> None:
    assert inventory.script_of(ch) == expected


def test_percentile_matches_linear_interpolation() -> None:
    vals = [1.0, 2.0, 3.0, 4.0]
    assert inventory._percentile(vals, 0.0) == 1.0
    assert inventory._percentile(vals, 1.0) == 4.0
    assert inventory._percentile(vals, 0.5) == 2.5
    assert inventory._percentile([], 0.5) == 0.0
    assert inventory._percentile([9.0], 0.9) == 9.0


def test_base_font_strips_subset_tag() -> None:
    assert inventory._base_font("ABCDEF+Helvetica") == "Helvetica"
    assert inventory._base_font("Helvetica") == "Helvetica"
    # Lowercase prefix is not a subset tag and must survive intact.
    assert inventory._base_font("abcdef+Weird") == "abcdef+Weird"


# --------------------------------------------------------------------------
# signatures
# --------------------------------------------------------------------------


def _page_stat(**kw) -> inventory.PageStat:
    base = dict(page=0, width=612, height=792, rotation=0)
    base.update(kw)
    return inventory.PageStat(**base)  # type: ignore[arg-type]


def test_layout_signature_separates_font_stacks() -> None:
    a = _page_stat(size_p50=10.0, columns=1, fonts=["Arial"])
    b = _page_stat(size_p50=10.0, columns=1, fonts=["Times"])
    assert inventory.layout_signature(a) != inventory.layout_signature(b)


def test_layout_signature_is_stable_and_deterministic() -> None:
    a = _page_stat(size_p50=10.0, fonts=["Arial", "Arial-Bold"])
    b = _page_stat(size_p50=10.0, fonts=["Arial-Bold", "Arial"])
    # Font order within a page must not split a template.
    assert inventory.layout_signature(a) == inventory.layout_signature(b)


def test_coarse_signature_ignores_fonts_but_not_geometry() -> None:
    arial = {"width": 612, "height": 792, "size_p50": 10.0, "columns": 1, "fonts": ["Arial"]}
    times = dict(arial, fonts=["Times"])
    a4 = dict(arial, width=595, height=842)
    assert cluster.coarse_signature(arial) == cluster.coarse_signature(times)
    assert cluster.coarse_signature(arial) != cluster.coarse_signature(a4)


def test_size_bucket_resolves_small_text_finely() -> None:
    # The buckets below 12pt must be distinct: that is the slice we select for.
    assert len({cluster.size_bucket(p) for p in (5.0, 7.0, 8.0, 10.0, 11.0)}) == 5
    # Everything large collapses.
    assert cluster.size_bucket(18.0) == cluster.size_bucket(40.0)


# --------------------------------------------------------------------------
# archetypes and script rollup
# --------------------------------------------------------------------------


def test_page_archetype_classes() -> None:
    base = {"kind": "digital", "h_rules": 0, "v_rules": 0, "image_area_frac": 0.0,
            "text_area_frac": 0.2, "n_chars": 800, "columns": 1}
    assert cluster.page_archetype(base) == "prose"
    assert cluster.page_archetype(dict(base, h_rules=20, v_rules=18)) == "table_heavy"
    assert cluster.page_archetype(dict(base, h_rules=14)) == "table_light"
    assert cluster.page_archetype(dict(base, image_area_frac=0.5)) == "figure_heavy"
    assert cluster.page_archetype(dict(base, columns=3)) == "multi_column"
    assert cluster.page_archetype(dict(base, n_chars=4000)) == "dense_text"
    assert cluster.page_archetype(dict(base, kind="scanned")) == "scanned"
    assert cluster.page_archetype(dict(base, kind="sparse", image_area_frac=0.4)) == "cover"


def test_dominant_script_tolerates_stray_symbols() -> None:
    latin = {"scripts": {"ascii": 1000, "other": 12, "latin_ext": 5}}
    assert cluster.dominant_script(latin) == "latin"
    jp = {"scripts": {"ascii": 200, "han": 600, "kana": 300}}
    assert cluster.dominant_script(jp) == "han"
    assert cluster.dominant_script({"scripts": {}}) == "none"


# --------------------------------------------------------------------------
# round-trip on an authored PDF
# --------------------------------------------------------------------------


@pytest.fixture()
def authored_pdf(tmp_path: pathlib.Path) -> pathlib.Path:
    """A two-page PDF whose content we know exactly."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    body = "The quick brown fox jumps over the lazy dog. "
    for i in range(20):
        page.insert_text((72, 100 + i * 14), body, fontsize=10, fontname="helv")
    # A ruled table: 6 horizontal rules, 4 vertical.
    for i in range(6):
        y = 420 + i * 20
        page.draw_line(fitz.Point(72, y), fitz.Point(540, y))
    for i in range(4):
        x = 72 + i * 156
        page.draw_line(fitz.Point(x, 420), fitz.Point(x, 520))

    p2 = doc.new_page(width=612, height=792)
    p2.insert_text((72, 100), "second page", fontsize=24, fontname="helv")

    out = tmp_path / "authored.pdf"
    doc.save(out)
    doc.close()
    return out


def test_probe_pdf_round_trip(authored_pdf: pathlib.Path, tmp_path: pathlib.Path) -> None:
    doc = inventory.probe_pdf(authored_pdf, tmp_path)

    assert doc["pages"] == 2
    assert doc["error"] is None if "error" in doc else True
    assert doc["kind"] == "digital"
    assert doc["dominant_script"] == "latin"

    stats = doc["page_stats"]
    assert len(stats) == 2
    first = stats[0]
    assert first.kind == "digital"
    assert first.width == 612 and first.height == 792
    # 20 lines of the body string, no trailing space counted.
    expected_chars = 20 * len([c for c in "The quick brown fox jumps over the lazy dog. " if not c.isspace()])
    assert first.n_chars == expected_chars
    assert first.size_p50 == 10.0
    assert "Helvetica" in " ".join(first.fonts)
    assert first.h_rules >= 6
    assert first.v_rules >= 4
    assert first.columns == 1
    assert 0.0 < first.margin_l < 0.2
    assert doc["text_head"].startswith("The quick brown fox")

    # The heading-only page must not be mistaken for body text.
    assert stats[1].size_p50 == 24.0
    assert stats[1].n_chars == len("secondpage")


def test_probe_pdf_survives_a_corrupt_file(tmp_path: pathlib.Path) -> None:
    bad = tmp_path / "broken.pdf"
    bad.write_bytes(b"%PDF-1.4\nthis is not a pdf\n")
    doc = inventory.probe_pdf(bad, tmp_path)
    assert doc["error"]
    assert doc["page_stats"] == []
    # A census row is still emitted so the manifest stays complete.
    assert doc["sha"] == "broken"


def test_build_manifest_writes_both_streams(authored_pdf: pathlib.Path, tmp_path: pathlib.Path) -> None:
    root = authored_pdf.parent
    out = tmp_path / "manifest"
    summary = inventory.build_manifest(root, out, workers=1)
    assert summary["docs"] == 1
    assert summary["pages"] == 2
    docs = [json.loads(l) for l in (out / "docs.jsonl").read_text().splitlines() if l.strip()]
    pages = [json.loads(l) for l in (out / "pages.jsonl").read_text().splitlines() if l.strip()]
    assert len(docs) == 1 and len(pages) == 2
    # Page rows carry the doc key so the two streams can be joined.
    assert {p["sha"] for p in pages} == {docs[0]["sha"]}
    assert all("layout_sig" in p for p in pages)


def test_cluster_report_counts_diversity(authored_pdf: pathlib.Path, tmp_path: pathlib.Path) -> None:
    out = tmp_path / "manifest"
    inventory.build_manifest(authored_pdf.parent, out, workers=1)
    pages = list(cluster.annotate_pages(cluster.iter_jsonl(out / "pages.jsonl")))
    rep = cluster.cluster_report(pages)
    assert rep["pages"] == 2
    # Body page and heading page differ in body size, so they are distinct layouts.
    assert rep["distinct_sig_coarse"] == 2
    assert set(rep["archetypes"]) <= {
        "prose", "dense_text", "table_heavy", "table_light", "figure_heavy",
        "multi_column", "sparse", "cover", "scanned", "empty", "error",
    }
