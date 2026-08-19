"""Stage 2 — choose which pages to regenerate.

The store holds ~470k pages and we want ~30-50k. Which 10% we take decides
whether this corpus fixes the failure it was built for, so selection is
diversity-first rather than random:

* **Round-robin over layout clusters.** One page per cluster per pass. A
  publisher with 90k pages and one with 40 contribute equally until the small
  one is exhausted, so no cap can be satisfied by a single template.
* **Caps at both levels.** ``per_doc`` stops a 372-page filing from standing in
  for a template; ``per_cluster`` stops a template from standing in for the
  corpus.
* **Small text is boosted, not merely admitted.** ``long_tiny_text`` is the
  slice the failed repair scored 0/442 on, so within a cluster the smallest
  body text is drafted first.

Selection is deterministic given (manifest, knobs, seed): ordering is by
explicit sort keys, never by dict iteration.
"""

from __future__ import annotations

import json
import pathlib
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from typing import Any, Iterable

from .cluster import annotate_pages, iter_jsonl, size_bucket

# A page must carry at least this much text to be worth mining a recipe from.
MIN_CHARS = 120
# ...and its text must cover at least this much of the page, or it is a cover
# sheet whose "layout" is one title.
MIN_TEXT_AREA_FRAC = 0.02

ELIGIBLE_KINDS = ("digital",)

# Archetypes we never regenerate: nothing to mine, or nothing we can author.
SKIP_ARCHETYPES = ("scanned", "empty", "error", "sparse")


@dataclass
class SelectionKnobs:
    target_pages: int = 40_000
    per_doc: int = 6
    per_cluster: int = 40
    min_chars: int = MIN_CHARS
    min_text_area_frac: float = MIN_TEXT_AREA_FRAC
    small_text_boost: bool = True
    # Floor on how many pages a script keeps even if round-robin would starve
    # it. CJK is 7.6% of the store and we deliberately keep it.
    script_floor: float = 0.05
    seed: int = 0


def eligible(page: dict[str, Any], knobs: SelectionKnobs) -> bool:
    if page.get("kind") not in ELIGIBLE_KINDS:
        return False
    if page.get("archetype") in SKIP_ARCHETYPES:
        return False
    if int(page.get("n_chars", 0)) < knobs.min_chars:
        return False
    if float(page.get("text_area_frac", 0.0) or 0.0) < knobs.min_text_area_frac:
        return False
    if int(page.get("width", 0)) <= 0 or int(page.get("height", 0)) <= 0:
        return False
    return True


def _page_key(page: dict[str, Any], knobs: SelectionKnobs) -> tuple:
    """Within-cluster draft order. Lower sorts first.

    Small body text first when boosted, then denser pages (more signal per
    render), then a stable hash tiebreak so the order never depends on the
    order rows happened to be written.
    """
    size = float(page.get("size_p50", 0.0) or 0.0)
    size_term = size if knobs.small_text_boost else 0.0
    density = -float(page.get("text_area_frac", 0.0) or 0.0)
    return (size_term, density, str(page.get("sha", "")), int(page.get("page", 0)))


def select_pages(
    pages: Iterable[dict[str, Any]],
    knobs: SelectionKnobs | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return (selected page rows, report)."""
    knobs = knobs or SelectionKnobs()

    by_cluster: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    seen = 0
    rejected: Counter[str] = Counter()
    for p in pages:
        seen += 1
        if not eligible(p, knobs):
            reason = (
                "kind" if p.get("kind") not in ELIGIBLE_KINDS
                else "archetype" if p.get("archetype") in SKIP_ARCHETYPES
                else "too_short" if int(p.get("n_chars", 0)) < knobs.min_chars
                else "too_empty"
            )
            rejected[reason] += 1
            continue
        by_cluster[p["sig_coarse"]].append(p)

    for rows in by_cluster.values():
        rows.sort(key=lambda r: _page_key(r, knobs))

    # Rare clusters first: a 40-page template must get its turn before a
    # 90k-page one exhausts the budget.
    cluster_order = sorted(by_cluster, key=lambda s: (len(by_cluster[s]), s))

    selected: list[dict[str, Any]] = []
    taken_per_doc: Counter[str] = Counter()
    taken_per_cluster: Counter[str] = Counter()
    used: set[tuple[str, int]] = set()

    # Breadth before depth. Pass `quota` lets each source document contribute
    # its q-th page, so every document is represented once before any gives a
    # second. A single-pass round-robin instead drains the small-text documents
    # to their cap inside the rare clusters, and the large clusters then find
    # nothing uncapped left — costing ~34% of the reachable pages and, worse,
    # leaving a third of the source documents unrepresented.
    for quota in range(1, knobs.per_doc + 1):
        if len(selected) >= knobs.target_pages:
            break
        cursor: Counter[str] = Counter()
        exhausted: set[str] = set()
        while len(selected) < knobs.target_pages and len(exhausted) < len(cluster_order):
            progressed = False
            for sig in cluster_order:
                if sig in exhausted or len(selected) >= knobs.target_pages:
                    continue
                if taken_per_cluster[sig] >= knobs.per_cluster:
                    exhausted.add(sig)
                    continue
                rows = by_cluster[sig]
                i = cursor[sig]
                picked = None
                while i < len(rows):
                    cand = rows[i]
                    i += 1
                    key = (cand.get("sha", ""), int(cand.get("page", 0)))
                    if key in used:
                        continue
                    if taken_per_doc[cand.get("sha", "")] >= quota:
                        continue
                    picked = cand
                    picked_key = key
                    break
                cursor[sig] = i
                if picked is None:
                    exhausted.add(sig)
                    continue
                selected.append(picked)
                used.add(picked_key)
                taken_per_doc[picked.get("sha", "")] += 1
                taken_per_cluster[sig] += 1
                progressed = True
            if not progressed:
                break

    return selected, _report(selected, seen, rejected, by_cluster, knobs)


def _report(
    selected: list[dict[str, Any]],
    seen: int,
    rejected: Counter[str],
    by_cluster: dict[str, list[dict[str, Any]]],
    knobs: SelectionKnobs,
) -> dict[str, Any]:
    arche: Counter[str] = Counter()
    script: Counter[str] = Counter()
    sizes: Counter[int] = Counter()
    exact: Counter[str] = Counter()
    coarse: Counter[str] = Counter()
    docs: Counter[str] = Counter()
    for p in selected:
        arche[p.get("archetype", "?")] += 1
        script[p.get("script", "?")] += 1
        sizes[size_bucket(float(p.get("size_p50", 0.0) or 0.0))] += 1
        exact[p.get("layout_sig", "")] += 1
        coarse[p.get("sig_coarse", "")] += 1
        docs[p.get("sha", "")] += 1
    n = max(len(selected), 1)
    return {
        "knobs": asdict(knobs),
        "pages_seen": seen,
        "pages_eligible": sum(len(v) for v in by_cluster.values()),
        "rejected": dict(rejected),
        "selected": len(selected),
        "source_docs": len(docs),
        "distinct_sig_exact": len(exact),
        "distinct_sig_coarse": len(coarse),
        "clusters_available": len(by_cluster),
        "top10_coarse_share": round(sum(v for _, v in coarse.most_common(10)) / n, 4),
        "archetypes": dict(arche.most_common()),
        "scripts": dict(script.most_common()),
        "size_buckets": {str(k): v for k, v in sorted(sizes.items())},
        "pages_per_doc_max": max(docs.values()) if docs else 0,
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Stage 2 — stratified page selection")
    ap.add_argument("--pages", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", default="")
    ap.add_argument("--target", type=int, default=40_000)
    ap.add_argument("--per-doc", type=int, default=6)
    ap.add_argument("--per-cluster", type=int, default=40)
    ap.add_argument("--no-small-text-boost", action="store_true")
    a = ap.parse_args(argv)

    knobs = SelectionKnobs(
        target_pages=a.target,
        per_doc=a.per_doc,
        per_cluster=a.per_cluster,
        small_text_boost=not a.no_small_text_boost,
    )
    rows = annotate_pages(iter_jsonl(pathlib.Path(a.pages).expanduser()))
    selected, rep = select_pages(rows, knobs)

    dst = pathlib.Path(a.out).expanduser()
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("w") as fh:
        for r in selected:
            fh.write(json.dumps(r) + "\n")
    print(json.dumps(rep, indent=2)[:4000])
    if a.report:
        p = pathlib.Path(a.report).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
