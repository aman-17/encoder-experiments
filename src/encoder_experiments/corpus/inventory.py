"""Stage 0 — inventory a content-addressed PDF store.

One pass over every PDF, emitting a doc row and a row per page. Everything
downstream (dedup clustering, page selection, recipe mining) selects off this
manifest, so the fields here are chosen to answer the Stage 1/2 questions
without reopening the PDFs:

- clustering      -> ``layout_sig`` (page geometry + font stack + grid)
- decontamination -> ``text_head`` (leading characters, for char-level LCS)
- selection       -> script mix, font-size percentiles, rule/image density

The pass is read-only and never raises on a bad PDF: unreadable documents get
an ``error`` row so the manifest stays a complete census of the store.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import traceback
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Iterator

import fitz

# Unicode blocks we care about for corpus balance. Anything unmatched lands in
# "other" rather than being silently folded into latin.
_SCRIPT_RANGES: tuple[tuple[str, int, int], ...] = (
    ("han", 0x4E00, 0x9FFF),
    ("han", 0x3400, 0x4DBF),
    ("han", 0xF900, 0xFAFF),
    ("kana", 0x3040, 0x30FF),
    ("kana", 0x31F0, 0x31FF),
    ("hangul", 0xAC00, 0xD7AF),
    ("hangul", 0x1100, 0x11FF),
    ("arabic", 0x0600, 0x06FF),
    ("arabic", 0x0750, 0x077F),
    ("hebrew", 0x0590, 0x05FF),
    ("cyrillic", 0x0400, 0x04FF),
    ("devanagari", 0x0900, 0x097F),
    ("thai", 0x0E00, 0x0E7F),
    ("greek", 0x0370, 0x03FF),
)

SCRIPTS: tuple[str, ...] = (
    "ascii",
    "latin_ext",
    "han",
    "kana",
    "hangul",
    "arabic",
    "hebrew",
    "cyrillic",
    "devanagari",
    "thai",
    "greek",
    "other",
)

# A page needs this many non-space characters before we trust its text layer
# for script/font statistics.
MIN_TEXT_CHARS = 40

# Characters of page-1 text kept per document for the contamination check.
TEXT_HEAD_CHARS = 2000

# A drawing whose bbox is thinner than this (points) counts as a rule.
RULE_THICKNESS_PT = 3.0
# ...and must be at least this long to distinguish a rule from a tick or glyph
# fragment left in the drawing layer.
RULE_MIN_LENGTH_PT = 18.0


def script_of(ch: str) -> str:
    o = ord(ch)
    if o < 128:
        return "ascii"
    for name, lo, hi in _SCRIPT_RANGES:
        if lo <= o <= hi:
            return name
    if 0x00C0 <= o <= 0x024F or 0x1E00 <= o <= 0x1EFF:
        return "latin_ext"
    return "other"


def _percentile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 2)
    pos = q * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return round(sorted_vals[lo], 2)
    frac = pos - lo
    return round(sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac, 2)


def _base_font(name: str) -> str:
    """Strip the subset tag PDFs prepend to embedded fonts (``ABCDEF+Arial``)."""
    if len(name) > 7 and name[6] == "+" and name[:6].isupper():
        name = name[7:]
    return name


@dataclass
class PageStat:
    """Per-page features. Field names are the manifest column names."""

    page: int
    width: int
    height: int
    rotation: int
    n_chars: int = 0
    n_spans: int = 0
    n_lines: int = 0
    n_blocks: int = 0
    n_images: int = 0
    image_area_frac: float = 0.0
    text_area_frac: float = 0.0
    h_rules: int = 0
    v_rules: int = 0
    n_drawings: int = 0
    size_p10: float = 0.0
    size_p50: float = 0.0
    size_p90: float = 0.0
    small_text_frac: float = 0.0
    fonts: list[str] = field(default_factory=list)
    scripts: dict[str, int] = field(default_factory=dict)
    columns: int = 0
    margin_l: float = 0.0
    margin_t: float = 0.0
    margin_r: float = 0.0
    margin_b: float = 0.0
    kind: str = "empty"
    layout_sig: str = ""


def _estimate_columns(line_boxes: list[tuple[float, float, float, float]], page_w: float) -> int:
    """Count vertical text bands by gaps in x-coverage.

    Deliberately crude — it exists to stratify selection and seed the layout
    signature, not to drive rendering. A page whose lines all start near the
    same x is one column regardless of how the publisher thought of it.
    """
    if len(line_boxes) < 8 or page_w <= 0:
        return 1
    bins = 48
    covered = [False] * bins
    for x0, _, x1, _ in line_boxes:
        b0 = max(0, min(bins - 1, int(bins * x0 / page_w)))
        b1 = max(0, min(bins - 1, int(bins * x1 / page_w)))
        for b in range(b0, b1 + 1):
            covered[b] = True
    runs = 0
    prev = False
    gap = 0
    for c in covered:
        if c and not prev:
            runs += 1
        if not c and prev:
            gap = 0
        if not c:
            gap += 1
        prev = c
    # Collapse runs separated by a hairline gap; a real column gutter is wide.
    if runs > 1:
        merged = 1
        run_gap = 0
        started = False
        for c in covered:
            if c:
                if started and run_gap >= 2:
                    merged += 1
                started = True
                run_gap = 0
            elif started:
                run_gap += 1
        runs = merged
    return max(1, min(runs, 6))


def probe_page(page: fitz.Page) -> PageStat:
    rect = page.rect
    pw, ph = float(rect.width), float(rect.height)
    st = PageStat(
        page=page.number,
        width=round(pw),
        height=round(ph),
        rotation=int(page.rotation or 0),
    )
    page_area = max(pw * ph, 1.0)

    try:
        raw = page.get_text("dict")
    except Exception:
        st.kind = "error"
        return st

    sizes: list[float] = []
    weighted_small = 0
    fonts: Counter[str] = Counter()
    scripts: Counter[str] = Counter()
    line_boxes: list[tuple[float, float, float, float]] = []
    text_area = 0.0
    img_area = 0.0
    x0s: list[float] = []
    y0s: list[float] = []
    x1s: list[float] = []
    y1s: list[float] = []

    for blk in raw.get("blocks", []):
        if blk.get("type") == 1:
            st.n_images += 1
            bx = blk.get("bbox")
            if bx:
                img_area += max(0.0, bx[2] - bx[0]) * max(0.0, bx[3] - bx[1])
            continue
        st.n_blocks += 1
        for line in blk.get("lines", []):
            st.n_lines += 1
            lb = line.get("bbox")
            if lb:
                line_boxes.append(tuple(lb))  # type: ignore[arg-type]
                x0s.append(lb[0])
                y0s.append(lb[1])
                x1s.append(lb[2])
                y1s.append(lb[3])
                text_area += max(0.0, lb[2] - lb[0]) * max(0.0, lb[3] - lb[1])
            for span in line.get("spans", []):
                st.n_spans += 1
                txt = span.get("text", "")
                size = float(span.get("size", 0.0) or 0.0)
                nchar = 0
                for ch in txt:
                    if ch.isspace():
                        continue
                    nchar += 1
                    scripts[script_of(ch)] += 1
                if nchar:
                    st.n_chars += nchar
                    fonts[_base_font(str(span.get("font", "")))] += nchar
                    sizes.extend([size] * nchar)
                    if size and size < 7.0:
                        weighted_small += nchar

    # get_images catches XObjects that carry no text block of their own.
    try:
        st.n_images = max(st.n_images, len(page.get_images(full=True)))
    except Exception:
        pass

    try:
        drawings = page.get_cdrawings()
    except Exception:
        drawings = []
    st.n_drawings = len(drawings)
    for d in drawings:
        bx = d.get("rect")
        if bx is None:
            continue
        w = abs(bx[2] - bx[0])
        h = abs(bx[3] - bx[1])
        if h <= RULE_THICKNESS_PT and w >= RULE_MIN_LENGTH_PT:
            st.h_rules += 1
        elif w <= RULE_THICKNESS_PT and h >= RULE_MIN_LENGTH_PT:
            st.v_rules += 1

    sizes.sort()
    st.size_p10 = _percentile(sizes, 0.10)
    st.size_p50 = _percentile(sizes, 0.50)
    st.size_p90 = _percentile(sizes, 0.90)
    st.small_text_frac = round(weighted_small / st.n_chars, 4) if st.n_chars else 0.0
    st.fonts = [f for f, _ in fonts.most_common(8) if f]
    st.scripts = dict(scripts)
    st.image_area_frac = round(min(img_area / page_area, 1.0), 4)
    st.text_area_frac = round(min(text_area / page_area, 1.0), 4)
    st.columns = _estimate_columns(line_boxes, pw)

    if x0s:
        st.margin_l = round(min(x0s) / pw, 4)
        st.margin_r = round((pw - max(x1s)) / pw, 4)
        st.margin_t = round(min(y0s) / ph, 4)
        st.margin_b = round((ph - max(y1s)) / ph, 4)

    if st.n_chars >= MIN_TEXT_CHARS:
        st.kind = "digital"
    elif st.n_chars > 0:
        st.kind = "sparse"
    elif st.n_images:
        st.kind = "scanned"
    else:
        st.kind = "empty"

    st.layout_sig = layout_signature(st)
    return st


def layout_signature(st: PageStat) -> str:
    """Coarse fingerprint used to collapse near-duplicate layouts in Stage 1.

    Quantized hard: two pages from the same publisher template must collide
    even when their body text differs. Font stack is the discriminating term,
    geometry the grouping one.
    """
    geom = f"{st.width // 8}x{st.height // 8}"
    margins = "-".join(str(int(round(m * 20))) for m in (st.margin_l, st.margin_t, st.margin_r, st.margin_b))
    body = int(round(st.size_p50))
    rules = "r1" if (st.h_rules + st.v_rules) > 12 else "r0"
    img = "i1" if st.image_area_frac > 0.05 else "i0"
    stack = ",".join(sorted(st.fonts[:4]))
    payload = f"{geom}|{margins}|{body}|c{st.columns}|{rules}|{img}|{stack}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def probe_pdf(path: pathlib.Path, root: pathlib.Path, max_pages: int = 0) -> dict[str, Any]:
    rel = str(path.relative_to(root)) if path.is_relative_to(root) else str(path)
    doc: dict[str, Any] = {
        "sha": path.stem,
        "path": rel,
        "bytes": path.stat().st_size if path.exists() else 0,
    }
    try:
        with fitz.open(path) as d:
            meta = d.metadata or {}
            doc.update(
                {
                    "pages": d.page_count,
                    "encrypted": bool(d.is_encrypted),
                    "producer": (meta.get("producer") or "").strip()[:120],
                    "creator": (meta.get("creator") or "").strip()[:120],
                    "title": (meta.get("title") or "").strip()[:200],
                }
            )
            if d.is_encrypted and not d.authenticate(""):
                doc["error"] = "encrypted"
                doc["page_stats"] = []
                return doc

            limit = d.page_count if max_pages <= 0 else min(d.page_count, max_pages)
            stats: list[PageStat] = []
            head_parts: list[str] = []
            head_len = 0
            for i in range(limit):
                try:
                    page = d[i]
                except Exception:
                    continue
                st = probe_page(page)
                stats.append(st)
                if head_len < TEXT_HEAD_CHARS and st.kind in ("digital", "sparse"):
                    try:
                        t = page.get_text("text")
                    except Exception:
                        t = ""
                    t = " ".join(t.split())
                    if t:
                        head_parts.append(t)
                        head_len += len(t)

            doc["page_stats"] = stats
            doc["text_head"] = " ".join(head_parts)[:TEXT_HEAD_CHARS]
            doc.update(_doc_rollup(stats))
    except Exception as exc:  # a corrupt PDF must not end the census
        doc.setdefault("pages", 0)
        doc["error"] = f"{type(exc).__name__}: {exc}"[:200]
        doc["page_stats"] = []
    return doc


def _doc_rollup(stats: list[PageStat]) -> dict[str, Any]:
    if not stats:
        return {"kind": "empty", "dominant_script": "none", "scanned_frac": 0.0}
    kinds = Counter(s.kind for s in stats)
    scripts: Counter[str] = Counter()
    for s in stats:
        scripts.update(s.scripts)
    total = sum(scripts.values())
    ascii_frac = scripts.get("ascii", 0) / total if total else 0.0
    if total == 0:
        dominant = "none"
    elif ascii_frac > 0.85:
        dominant = "latin"
    else:
        non_ascii = [(k, v) for k, v in scripts.items() if k != "ascii"]
        dominant = max(non_ascii, key=lambda kv: kv[1])[0] if non_ascii else "latin"
    digital = kinds.get("digital", 0)
    n = len(stats)
    sigs = Counter(s.layout_sig for s in stats if s.layout_sig)
    return {
        "kind": "digital" if digital / n >= 0.5 else ("scanned" if kinds.get("scanned", 0) / n >= 0.5 else "sparse"),
        "dominant_script": dominant,
        "script_totals": dict(scripts),
        "digital_frac": round(digital / n, 4),
        "scanned_frac": round(kinds.get("scanned", 0) / n, 4),
        "median_body_pt": _percentile(sorted(s.size_p50 for s in stats if s.size_p50), 0.5),
        "table_page_frac": round(sum(1 for s in stats if (s.h_rules + s.v_rules) > 12) / n, 4),
        "image_page_frac": round(sum(1 for s in stats if s.n_images) / n, 4),
        "distinct_layout_sigs": len(sigs),
        "modal_layout_sig": sigs.most_common(1)[0][0] if sigs else "",
    }


def iter_pdfs(root: pathlib.Path) -> Iterator[pathlib.Path]:
    yield from sorted(root.rglob("*.pdf"))


def _worker(args: tuple[str, str, int]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    path_s, root_s, max_pages = args
    root = pathlib.Path(root_s)
    try:
        doc = probe_pdf(pathlib.Path(path_s), root, max_pages=max_pages)
    except Exception:
        return ({"sha": pathlib.Path(path_s).stem, "path": path_s, "pages": 0,
                 "error": traceback.format_exc(limit=1)[:200], "page_stats": []}, [])
    stats: list[PageStat] = doc.pop("page_stats", [])
    sha = doc["sha"]
    page_rows = []
    for st in stats:
        row = st.__dict__.copy()
        row["sha"] = sha
        page_rows.append(row)
    return doc, page_rows


def build_manifest(
    root: pathlib.Path,
    out_dir: pathlib.Path,
    workers: int = 0,
    limit: int = 0,
    max_pages: int = 0,
    progress_every: int = 200,
) -> dict[str, Any]:
    """Write ``docs.jsonl`` + ``pages.jsonl`` under ``out_dir``; return a summary."""
    import multiprocessing as mp

    pdfs = list(iter_pdfs(root))
    if limit:
        pdfs = pdfs[:limit]
    out_dir.mkdir(parents=True, exist_ok=True)
    doc_path = out_dir / "docs.jsonl"
    page_path = out_dir / "pages.jsonl"

    workers = workers or max(1, (os.cpu_count() or 4) - 2)
    tasks = [(str(p), str(root), max_pages) for p in pdfs]

    n_docs = 0
    n_pages = 0
    n_err = 0
    with doc_path.open("w") as fd, page_path.open("w") as fp:
        if workers <= 1:
            results: Iterator[Any] = (_worker(t) for t in tasks)
            ctx = None
        else:
            ctx = mp.get_context("fork")
            pool = ctx.Pool(workers)
            results = pool.imap_unordered(_worker, tasks, chunksize=4)
        for doc, pages in results:
            n_docs += 1
            n_pages += len(pages)
            if doc.get("error"):
                n_err += 1
            fd.write(json.dumps(doc) + "\n")
            for row in pages:
                fp.write(json.dumps(row) + "\n")
            if progress_every and n_docs % progress_every == 0:
                print(f"  {n_docs}/{len(tasks)} docs, {n_pages} pages, {n_err} errors", flush=True)
        if workers > 1:
            pool.close()
            pool.join()

    return {"root": str(root), "docs": n_docs, "pages": n_pages, "errors": n_err,
            "docs_jsonl": str(doc_path), "pages_jsonl": str(page_path)}


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Stage 0 — inventory a PDF store")
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-pages", type=int, default=0, help="cap pages scanned per doc (0 = all)")
    a = ap.parse_args(argv)

    summary = build_manifest(
        pathlib.Path(a.root).expanduser(),
        pathlib.Path(a.out).expanduser(),
        workers=a.workers,
        limit=a.limit,
        max_pages=a.max_pages,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
