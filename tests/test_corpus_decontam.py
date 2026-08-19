"""Stage 1b decontamination.

The CJK case is the reason this is character-level at all: 7.6% of the store
is Japanese, which does not space-separate, so any word-token overlap metric
reports zero for a verbatim match. That test is the load-bearing one here.
"""

from __future__ import annotations

import json
import pathlib

from encoder_experiments.corpus import decontam

LATIN_GOLD = (
    "The Commission finds that the applicant has satisfied the requirements of "
    "section 4(b) of the Act, and that the proposed tariff revision is just and "
    "reasonable within the meaning of the governing statute. Accordingly the "
    "petition is granted subject to the conditions enumerated in Appendix B of "
    "this order, effective thirty days from the date of service hereof."
)

JP_GOLD = (
    "当社は、当連結会計年度における事業環境の変化を踏まえ、経営の効率化と収益基盤の"
    "強化に取り組んでまいりました。売上高は前期比で増加したものの、原材料価格の上昇"
    "および為替変動の影響により、営業利益は前期を下回る結果となりました。今後も継続"
    "的な原価低減と生産性向上に努める方針であります。"
)


def _index() -> decontam.GoldIndex:
    return decontam.build_index([("olmocr", [("olmocr::a.pdf", LATIN_GOLD),
                                             ("olmocr::b.pdf", JP_GOLD)])])


def test_normalize_collapses_and_folds() -> None:
    assert decontam.normalize("  A  B\n\tC ") == "a b c"
    # NFKC folds fullwidth forms, which EDINET-style filings use freely.
    assert decontam.normalize("ＡＢＣ") == "abc"


def test_shingles_are_stable_across_processes() -> None:
    """Uses crc32, not hash(): a salted hash would break a persisted index."""
    a = decontam.shingles("the quick brown fox jumps")
    b = decontam.shingles("the quick brown fox jumps")
    assert a == b
    assert decontam._h("abc") == 891568578  # pinned crc32 of b"abc"
    assert len(decontam.shingles("short")) == 1


def test_effective_length_weights_dense_scripts() -> None:
    """141 CJK characters must not be treated as shorter than 141 Latin ones."""
    assert decontam.effective_length("abcde") == 5
    assert decontam.effective_length(JP_GOLD) > len(JP_GOLD)
    # The Japanese sample carries comparable content to the Latin one and must
    # clear the same fragment floor.
    assert decontam.effective_length(JP_GOLD) >= decontam.MIN_GOLD_CHARS


def test_index_skips_fragment_gold() -> None:
    idx = decontam.build_index([("olmocr", [("frag", "25 paisa")])])
    # A rule that short matches everything; it must never enter the index.
    assert len(idx) == 0


def test_self_match_is_confirmed() -> None:
    idx = _index()
    hit = idx.check(LATIN_GOLD)
    assert hit is not None
    assert hit["gold_id"] == "olmocr::a.pdf"
    assert hit["ratio"] >= 99.0


def test_cjk_verbatim_match_is_caught() -> None:
    """A word-n-gram check reports zero overlap here. Character shingles do not."""
    idx = _index()
    hit = idx.check(JP_GOLD)
    assert hit is not None
    assert hit["gold_id"] == "olmocr::b.pdf"
    assert hit["ratio"] >= 99.0
    # And the naive tokenization really is blind to it, which is why we do this.
    assert len(set(JP_GOLD.split()) & set(JP_GOLD[:80].split())) <= 1


def test_gold_embedded_in_a_longer_document_is_found() -> None:
    """The realistic shape: one bench page inside a 200-page filing."""
    idx = _index()
    filler = "Unrelated preamble about quarterly logistics. " * 30
    hit = idx.check(filler + LATIN_GOLD + filler)
    assert hit is not None
    assert hit["gold_id"] == "olmocr::a.pdf"


def test_unrelated_document_is_not_flagged() -> None:
    idx = _index()
    assert idx.check("The quick brown fox jumps over the lazy dog. " * 40) is None


def test_screen_docs_reports_per_bench_counts() -> None:
    idx = _index()
    docs = [
        {"sha": "clean", "text_head": "Wholly unrelated content about bicycles. " * 20},
        {"sha": "dirty", "text_head": LATIN_GOLD},
        {"sha": "empty", "text_head": ""},
    ]
    flagged, rep = decontam.screen_docs(docs, idx)
    assert [f["sha"] for f in flagged] == ["dirty"]
    assert rep["docs_seen"] == 3
    assert rep["docs_checked"] == 2  # the empty one is skipped
    assert rep["flagged_by_bench"] == {"olmocr": 1}


def test_olmocr_adapter_groups_rules_by_pdf_and_drops_absent(tmp_path: pathlib.Path) -> None:
    bench = tmp_path / "bench_data"
    bench.mkdir()
    rows = [
        {"pdf": "x/p1.pdf", "type": "present", "text": "alpha beta gamma"},
        {"pdf": "x/p1.pdf", "type": "present", "text": "delta epsilon"},
        {"pdf": "x/p1.pdf", "type": "absent", "text": "NEVER_ON_THE_PAGE"},
        {"pdf": "x/p2.pdf", "type": "table", "cell": "0.569"},
    ]
    (bench / "t.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
    got = dict(decontam.load_olmocr_gold(bench))
    assert set(got) == {"olmocr::x/p1.pdf", "olmocr::x/p2.pdf"}
    assert "alpha beta gamma" in got["olmocr::x/p1.pdf"]
    assert "delta epsilon" in got["olmocr::x/p1.pdf"]
    assert "NEVER_ON_THE_PAGE" not in got["olmocr::x/p1.pdf"]


def test_gold_buried_deep_in_a_long_document_is_caught() -> None:
    """Regression: the realistic contamination shape.

    Confirmation used to compare two 4k-char prefixes and rank on
    document-in-gold containment, so a bench page sitting past the prefix of a
    long filing scored zero — the exact case the gate exists to catch. It now
    ranks on gold-in-document containment, which is position-invariant.
    """
    idx = _index()
    filler = "Quarterly logistics summary and unrelated preamble text. " * 60
    hit = idx.check(filler + LATIN_GOLD + filler)
    assert hit is not None
    assert hit["gold_id"] == "olmocr::a.pdf"
    assert hit["gold_containment"] >= decontam.CONFIRM_GOLD_CONTAINMENT


def test_partial_gold_overlap_still_flags() -> None:
    """OCR noise and re-typesetting must not defeat the gate."""
    idx = _index()
    noised = "".join(c for i, c in enumerate(LATIN_GOLD) if i % 20)
    assert idx.check(noised) is not None


def test_screen_selected_pages_reads_the_chosen_pages(tmp_path: pathlib.Path) -> None:
    import fitz

    sha = "ab" + "c" * 62
    pdf_dir = tmp_path / sha[:2] / sha[2:4]
    pdf_dir.mkdir(parents=True)
    doc = fitz.open()
    # Gold text is on page 3, well past any document-head window.
    for i in range(4):
        page = doc.new_page(width=612, height=792)
        body = LATIN_GOLD if i == 3 else "Unrelated filler paragraph. " * 12
        for j, chunk in enumerate([body[k:k + 90] for k in range(0, len(body), 90)]):
            page.insert_text((60, 90 + j * 14), chunk, fontsize=9, fontname="helv")
    doc.save(pdf_dir / f"{sha}.pdf")
    doc.close()

    idx = _index()
    selected = [{"sha": sha, "page": 3}, {"sha": sha, "page": 0}]
    flagged, rep = decontam.screen_selected_pages(selected, tmp_path, idx)
    assert rep["pages_checked"] == 2
    assert rep["pages_unreadable"] == 0
    assert [f["page"] for f in flagged] == [3]


def test_screen_selected_pages_counts_missing_sources(tmp_path: pathlib.Path) -> None:
    idx = _index()
    flagged, rep = decontam.screen_selected_pages([{"sha": "de" + "f" * 62, "page": 0}], tmp_path, idx)
    assert flagged == []
    assert rep["pages_unreadable"] == 1


SEC_BOILERPLATE = (
    "Plan Category Number of Securities to be Issued Upon Exercise of Outstanding "
    "Options, Warrants and Rights (a) Weighted-Average Exercise Price of Outstanding "
    "Options, Warrants and Rights ($)(b) Number of Securities Remaining Available for "
    "Future Issuance Under Equity Compensation Plans (excluding securities reflected "
    "in column (a))(c) Equity compensation plans approved by security holders Equity "
    "compensation plans not approved by security holders Total"
)


def test_numeric_overlap_separates_boilerplate_from_identity() -> None:
    """Two filers' equity-compensation tables share every header and no figure."""
    filer_a = SEC_BOILERPLATE + " 1,234,567 12.45 8,910,111"
    filer_b = SEC_BOILERPLATE + " 9,876,543 41.02 2,220,333"
    assert decontam.numeric_overlap(filer_a, filer_b) == 0.0
    # The same filing compared with itself keeps its figures.
    assert decontam.numeric_overlap(filer_a, filer_a) == 1.0
    assert decontam.numeric_overlap("no digits here", "none either") == 0.0


def test_boilerplate_collision_is_flagged_but_marked_zero_overlap() -> None:
    """The gate should still fire — triage is our job, not the matcher's."""
    idx = decontam.build_index([("pulse", [("pulse::sec_0013", SEC_BOILERPLATE + " 1,234,567 12.45")])])
    hit = idx.check(SEC_BOILERPLATE + " 9,876,543 41.02")
    assert hit is not None, "high character containment must still surface"
    assert hit["numeric_jaccard"] == 0.0, "and must be marked as carrying no shared figures"
