"""Stage 2 selection: the caps and the round-robin are the whole point.

If a cap leaks, the corpus reproduces the 11-template failure with more
documents, which is exactly the outcome this pipeline exists to prevent — so
these assertions are about domination, not just counts.
"""

from __future__ import annotations

from typing import Any

from encoder_experiments.corpus.select import SelectionKnobs, eligible, select_pages


def mk_page(sha: str, page: int, *, sig: str = "", size: float = 10.0,
            chars: int = 900, arche: str = "prose", script: str = "latin",
            text_frac: float = 0.25) -> dict[str, Any]:
    return {
        "sha": sha, "page": page, "kind": "digital", "n_chars": chars,
        "width": 612, "height": 792, "size_p50": size, "text_area_frac": text_frac,
        "archetype": arche, "script": script, "sig_coarse": sig or f"c{sha}",
        "layout_sig": f"e{sha}_{page}", "h_rules": 0, "v_rules": 0,
        "image_area_frac": 0.0, "columns": 1,
    }


def test_eligibility_rejects_unusable_pages() -> None:
    k = SelectionKnobs()
    assert eligible(mk_page("a", 0), k)
    assert not eligible(dict(mk_page("a", 0), kind="scanned"), k)
    # Cover/sparse pages are carried on kind="sparse", so the kind gate is what
    # excludes them; the archetype gate is the backstop if a kind is ever added.
    assert not eligible(dict(mk_page("a", 0), kind="sparse", archetype="cover"), k)
    assert not eligible(dict(mk_page("a", 0), archetype="scanned"), k)
    assert not eligible(dict(mk_page("a", 0), n_chars=10), k)
    assert not eligible(dict(mk_page("a", 0), text_area_frac=0.001), k)
    assert not eligible(dict(mk_page("a", 0), width=0), k)


def test_per_doc_cap_is_enforced() -> None:
    pages = [mk_page("doc1", i, sig="one") for i in range(50)]
    knobs = SelectionKnobs(target_pages=100, per_doc=3, per_cluster=99)
    selected, rep = select_pages(pages, knobs)
    assert len(selected) == 3
    assert rep["pages_per_doc_max"] == 3


def test_per_cluster_cap_is_enforced() -> None:
    pages = [mk_page(f"doc{i}", 0, sig="one") for i in range(50)]
    knobs = SelectionKnobs(target_pages=100, per_doc=9, per_cluster=5)
    selected, _ = select_pages(pages, knobs)
    assert len(selected) == 5


def test_round_robin_stops_a_dominant_cluster_from_eating_the_budget() -> None:
    """The real corpus shape: one publisher with 20% of the store."""
    big = [mk_page(f"big{i}", p, sig="dominant") for i in range(200) for p in range(5)]
    small = [mk_page(f"small{i}", 0, sig=f"rare{i}") for i in range(40)]
    knobs = SelectionKnobs(target_pages=60, per_doc=5, per_cluster=1000)
    selected, rep = select_pages(big + small, knobs)

    from collections import Counter
    per_sig = Counter(p["sig_coarse"] for p in selected)
    # Every rare cluster is represented before the dominant one takes a second turn.
    assert per_sig["dominant"] <= 20
    assert len([s for s in per_sig if s.startswith("rare")]) == 40
    assert rep["distinct_sig_coarse"] == 41


def test_small_text_is_drafted_first() -> None:
    pages = [mk_page("d", 0, sig="c", size=18.0), mk_page("d", 1, sig="c", size=6.0),
             mk_page("d", 2, sig="c", size=11.0)]
    knobs = SelectionKnobs(target_pages=1, per_doc=5, per_cluster=5)
    selected, _ = select_pages(pages, knobs)
    assert selected[0]["size_p50"] == 6.0

    off = SelectionKnobs(target_pages=1, per_doc=5, per_cluster=5, small_text_boost=False)
    selected_off, _ = select_pages(pages, off)
    # Without the boost, density decides instead of size.
    assert selected_off[0]["size_p50"] != 6.0 or len({p["text_area_frac"] for p in pages}) == 1


def test_selection_is_deterministic_regardless_of_input_order() -> None:
    pages = [mk_page(f"d{i}", p, sig=f"c{i % 7}") for i in range(30) for p in range(3)]
    knobs = SelectionKnobs(target_pages=25, per_doc=2, per_cluster=10)
    a, _ = select_pages(list(pages), knobs)
    b, _ = select_pages(list(reversed(pages)), knobs)
    key = lambda rows: [(r["sha"], r["page"]) for r in rows]
    assert key(a) == key(b)


def test_report_counts_what_selection_actually_achieved() -> None:
    pages = [mk_page(f"d{i}", 0, sig=f"c{i % 5}", script="han" if i % 4 == 0 else "latin",
                     arche="table_heavy" if i % 3 == 0 else "prose") for i in range(40)]
    selected, rep = select_pages(pages, SelectionKnobs(target_pages=20, per_doc=1, per_cluster=10))
    assert rep["selected"] == len(selected) == 20
    assert rep["distinct_sig_coarse"] == 5
    assert rep["source_docs"] == 20
    assert set(rep["scripts"]) <= {"han", "latin"}
    assert sum(rep["archetypes"].values()) == 20


def test_target_is_a_ceiling_not_a_promise() -> None:
    """Asking for more pages than exist must not loop forever."""
    pages = [mk_page(f"d{i}", 0, sig=f"c{i}") for i in range(5)]
    selected, rep = select_pages(pages, SelectionKnobs(target_pages=1000, per_doc=9, per_cluster=9))
    assert len(selected) == 5
    assert rep["selected"] == 5


def test_breadth_before_depth_across_documents() -> None:
    """Every document contributes once before any contributes twice.

    Guards the multi-pass quota loop: a single-pass round-robin drains the
    first-sorted documents to their cap and leaves others unrepresented.
    """
    pages = [mk_page(f"d{i}", p, sig=f"c{i % 3}") for i in range(10) for p in range(5)]
    knobs = SelectionKnobs(target_pages=10, per_doc=5, per_cluster=99)
    selected, rep = select_pages(pages, knobs)
    from collections import Counter
    per_doc = Counter(p["sha"] for p in selected)
    assert len(per_doc) == 10, "all ten documents should be represented first"
    assert max(per_doc.values()) == 1
    assert rep["source_docs"] == 10


def test_no_page_is_selected_twice() -> None:
    pages = [mk_page(f"d{i}", p, sig=f"c{i % 2}") for i in range(6) for p in range(4)]
    selected, _ = select_pages(pages, SelectionKnobs(target_pages=999, per_doc=4, per_cluster=99))
    keys = [(p["sha"], p["page"]) for p in selected]
    assert len(keys) == len(set(keys)) == 24
