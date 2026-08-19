"""Stage 1 — collapse near-duplicate layouts.

The CAS already deduplicated by content hash, and near-duplicates survived it:
in a 300-doc sample one PDF library accounts for 20% of the store and one
filing system for 11%. Training on that unclustered would reproduce the
11-template failure with more steps, so selection has to be per *layout*, not
per document.

Two granularities, because they answer different questions:

``sig_exact``   the full page fingerprint from Stage 0 (geometry + margins +
                body size + columns + rule/image flags + font stack). Two pages
                collide only if a publisher emitted them from one template.
``sig_coarse``  the same minus the font stack and margin detail. Groups a
                publisher's whole output even when fonts drift between years.

Selection caps against ``sig_coarse`` and diversity is *reported* against
``sig_exact``, so a cap can never be satisfied by 500 fonts of one layout.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from collections import Counter, defaultdict
from typing import Any, Iterable, Iterator

# Body-size buckets in points. Small text is the slice we are worst at
# (long_tiny_text scores 0/442 after the failed repair), so the low end is
# resolved finely and everything above 14pt is one bucket.
_SIZE_EDGES: tuple[float, ...] = (0.0, 6.0, 7.5, 9.0, 10.5, 12.0, 14.0)


def size_bucket(pt: float) -> int:
    for i, edge in enumerate(_SIZE_EDGES):
        if pt < edge:
            return i
    return len(_SIZE_EDGES)


def coarse_signature(page: dict[str, Any]) -> str:
    """Layout family fingerprint: geometry and grid only, no typography."""
    w = int(page.get("width", 0)) // 16
    h = int(page.get("height", 0)) // 16
    body = size_bucket(float(page.get("size_p50", 0.0) or 0.0))
    cols = int(page.get("columns", 1) or 1)
    rules = min(3, (int(page.get("h_rules", 0)) + int(page.get("v_rules", 0))) // 12)
    img = 1 if float(page.get("image_area_frac", 0.0) or 0.0) > 0.05 else 0
    dens = min(4, int(float(page.get("text_area_frac", 0.0) or 0.0) * 10))
    payload = f"{w}x{h}|b{body}|c{cols}|r{rules}|i{img}|d{dens}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def page_archetype(page: dict[str, Any]) -> str:
    """Human-readable page class used for stratification and audit sampling."""
    kind = page.get("kind", "empty")
    if kind in ("empty", "error"):
        return kind
    rules = int(page.get("h_rules", 0)) + int(page.get("v_rules", 0))
    img_frac = float(page.get("image_area_frac", 0.0) or 0.0)
    text_frac = float(page.get("text_area_frac", 0.0) or 0.0)
    n_chars = int(page.get("n_chars", 0))
    cols = int(page.get("columns", 1) or 1)
    if kind == "scanned":
        return "scanned"
    if kind == "sparse":
        return "cover" if img_frac > 0.2 else "sparse"
    if rules >= 24 and text_frac > 0.08:
        return "table_heavy"
    if rules >= 12:
        return "table_light"
    if img_frac > 0.35:
        return "figure_heavy"
    if cols >= 2:
        return "multi_column"
    if n_chars >= 2500 or text_frac > 0.42:
        return "dense_text"
    return "prose"


def dominant_script(page: dict[str, Any]) -> str:
    scripts = page.get("scripts") or {}
    total = sum(scripts.values())
    if not total:
        return "none"
    ascii_n = scripts.get("ascii", 0)
    if ascii_n / total > 0.85:
        return "latin"
    non_ascii = [(k, v) for k, v in scripts.items() if k != "ascii"]
    if not non_ascii:
        return "latin"
    top, n = max(non_ascii, key=lambda kv: kv[1])
    # A latin page with a few stray symbols is still latin.
    return top if n / total >= 0.10 else "latin"


def iter_jsonl(path: pathlib.Path) -> Iterator[dict[str, Any]]:
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def annotate_pages(pages: Iterable[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    """Attach ``sig_coarse``, ``archetype`` and ``script`` to each page row."""
    for p in pages:
        p["sig_coarse"] = coarse_signature(p)
        p["archetype"] = page_archetype(p)
        p["script"] = dominant_script(p)
        yield p


def cluster_report(pages: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Diversity census — the number that decides whether Stage 2 can succeed."""
    exact: Counter[str] = Counter()
    coarse: Counter[str] = Counter()
    arche: Counter[str] = Counter()
    script: Counter[str] = Counter()
    docs_per_coarse: defaultdict[str, set[str]] = defaultdict(set)
    n = 0
    for p in pages:
        n += 1
        exact[p.get("layout_sig", "")] += 1
        coarse[p["sig_coarse"]] += 1
        arche[p["archetype"]] += 1
        script[p["script"]] += 1
        docs_per_coarse[p["sig_coarse"]].add(p.get("sha", ""))

    def _head_share(c: Counter[str], k: int) -> float:
        tot = sum(c.values())
        return round(sum(v for _, v in c.most_common(k)) / tot, 4) if tot else 0.0

    return {
        "pages": n,
        "distinct_sig_exact": len(exact),
        "distinct_sig_coarse": len(coarse),
        "top10_coarse_share": _head_share(coarse, 10),
        "top10_exact_share": _head_share(exact, 10),
        "singleton_exact": sum(1 for v in exact.values() if v == 1),
        "archetypes": dict(arche.most_common()),
        "scripts": dict(script.most_common()),
        "largest_coarse": [
            {"sig": s, "pages": c, "docs": len(docs_per_coarse[s])}
            for s, c in coarse.most_common(10)
        ],
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Stage 1 — layout clustering census")
    ap.add_argument("--pages", required=True, help="pages.jsonl from Stage 0")
    ap.add_argument("--out", default="", help="write annotated pages here (jsonl)")
    ap.add_argument("--report", default="", help="write the census json here")
    a = ap.parse_args(argv)

    src = pathlib.Path(a.pages).expanduser()
    rows = list(annotate_pages(iter_jsonl(src)))
    if a.out:
        dst = pathlib.Path(a.out).expanduser()
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open("w") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")
    rep = cluster_report(rows)
    print(json.dumps(rep, indent=2)[:4000])
    if a.report:
        p = pathlib.Path(a.report).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
