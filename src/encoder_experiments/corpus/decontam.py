"""Stage 1b — quarantine source documents that overlap an evaluation set.

Regenerating with synthetic content removes most *content* contamination by
construction, but not the risk that matters here: if we mine a layout recipe
from a PDF that is also an olmOCR-bench page and then emit 40 training pages
from it, the model has seen that exact template at train time. Every external
number we report afterwards would be void.

So the unit of quarantine is the **source document**, and the test is
character-level. Word n-grams are not usable: 7.6% of this store is Japanese,
which does not space-separate, and German compounds defeat token overlap too.

Two stages, because 8.4k documents x thousands of gold texts is too slow for a
quadratic string metric:

1. **Shingle retrieval** — hashed character k-grams give candidate pairs at
   near-linear cost.
2. **Confirmation** — ``rapidfuzz.partial_ratio`` on the candidates only,
   which is the same instrument the item-level forensics used against the
   olmOCR scorer's own printed ratios.
"""

from __future__ import annotations

import json
import pathlib
import re
import unicodedata
import zlib
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable, Iterator

from rapidfuzz import fuzz

SHINGLE_K = 12
# Retrieval threshold: enough shared shingles in either direction to be worth
# scoring properly.
CANDIDATE_CONTAINMENT = 0.08
# Confirmation is on GOLD-in-DOCUMENT containment — the share of a bench page's
# character 12-grams present in the source document. That direction is the one
# contamination is defined in, and unlike a prefix-to-prefix fuzzy ratio it is
# invariant to where in a 372-page filing the bench page sits.
CONFIRM_GOLD_CONTAINMENT = 0.35
# Retained as a secondary signal only; a full-document rewrite scores high on
# containment and low here, and we want to see both in the quarantine record.
CONFIRM_RATIO = 80.0
# Gold texts shorter than this are fragments (olmOCR rules can be a few
# characters) and match everything; they are indexed per page, not alone.
# Measured in *effective* characters — see effective_length.
MIN_GOLD_CHARS = 200

# A CJK character carries roughly a word, where a Latin character carries part
# of one. Counting both at 1.0 would silently drop Japanese gold below the
# fragment floor — the 7.6% of the store we explicitly decided to keep.
CJK_WEIGHT = 2.5

_WS = re.compile(r"\s+")
# Multi-digit runs: the part of a table that is specific to one filer.
_NUM = re.compile(r"\d[\d,.]{2,}")


def normalize(text: str) -> str:
    """NFKC, lowercase, whitespace collapsed. No punctuation stripping: layout
    boilerplate is often punctuation-dense and it carries signal here."""
    text = unicodedata.normalize("NFKC", text or "")
    return _WS.sub(" ", text).strip().lower()


def effective_length(text: str) -> float:
    """Length in Latin-equivalent characters, weighting dense scripts up.

    Han/kana/hangul are not space-separated and pack far more content per
    codepoint, so a flat character count under-measures them by ~2.5x.
    """
    dense = 0
    for ch in text:
        o = ord(ch)
        if (0x3040 <= o <= 0x30FF) or (0x3400 <= o <= 0x4DBF) or (0x4E00 <= o <= 0x9FFF) \
           or (0xAC00 <= o <= 0xD7AF) or (0xF900 <= o <= 0xFAFF):
            dense += 1
    return (len(text) - dense) + dense * CJK_WEIGHT


def numeric_overlap(a: str, b: str) -> float:
    """Jaccard over multi-digit runs — the triage signal for a flagged pair.

    Standardized documents collide on boilerplate: every SEC filer's "Equity
    Compensation Plan Information" table carries the same column headers, so
    character shingles report high containment between two unrelated companies.
    The figures in the table do not collide. A flag at ~0 numeric overlap is a
    genre collision; a flag with real overlap is document identity.
    """
    na, nb = set(_NUM.findall(a)), set(_NUM.findall(b))
    if not (na or nb):
        return 0.0
    return round(len(na & nb) / len(na | nb), 4)


def _h(s: str) -> int:
    """Stable across processes — ``hash()`` is salted by PYTHONHASHSEED, which
    would make a persisted index silently fail to match on the next run."""
    return zlib.crc32(s.encode("utf-8", "ignore"))


def shingles(text: str, k: int = SHINGLE_K) -> set[int]:
    if len(text) < k:
        return {_h(text)} if text else set()
    return {_h(text[i : i + k]) for i in range(len(text) - k + 1)}


@dataclass
class GoldEntry:
    gold_id: str
    bench: str
    text: str
    shingles: set[int]


class GoldIndex:
    """Inverted shingle index over evaluation gold text."""

    def __init__(self) -> None:
        self.entries: dict[str, GoldEntry] = {}
        self.postings: defaultdict[int, set[str]] = defaultdict(set)

    def add(self, gold_id: str, bench: str, text: str) -> None:
        norm = normalize(text)
        if effective_length(norm) < MIN_GOLD_CHARS:
            return
        sh = shingles(norm)
        if not sh:
            return
        self.entries[gold_id] = GoldEntry(gold_id, bench, norm, sh)
        for h in sh:
            self.postings[h].add(gold_id)

    def __len__(self) -> int:
        return len(self.entries)

    def candidates(self, doc_shingles: set[int]) -> dict[str, tuple[float, float]]:
        """gold_id -> (gold-in-doc containment, doc-in-gold containment)."""
        hits: defaultdict[str, int] = defaultdict(int)
        for h in doc_shingles:
            for gid in self.postings.get(h, ()):  # type: ignore[arg-type]
                hits[gid] += 1
        n_doc = max(len(doc_shingles), 1)
        out: dict[str, tuple[float, float]] = {}
        for gid, shared in hits.items():
            gold_c = shared / max(len(self.entries[gid].shingles), 1)
            doc_c = shared / n_doc
            if max(gold_c, doc_c) >= CANDIDATE_CONTAINMENT:
                out[gid] = (gold_c, doc_c)
        return out

    def check(self, text: str) -> dict[str, Any] | None:
        """Return the strongest confirmed overlap, or None.

        Ranked on gold-in-document containment so that a bench page buried deep
        inside a long filing scores the same as one that is the whole document.
        """
        norm = normalize(text)
        if effective_length(norm) < MIN_GOLD_CHARS // 2:
            return None
        sh = shingles(norm)
        if not sh:
            return None
        best: dict[str, Any] | None = None
        ranked = sorted(self.candidates(sh).items(), key=lambda kv: -kv[1][0])[:20]
        for gid, (gold_c, doc_c) in ranked:
            if gold_c < CONFIRM_GOLD_CONTAINMENT:
                continue
            entry = self.entries[gid]
            ratio = float(fuzz.partial_ratio(norm[:6000], entry.text[:6000]))
            if best is None or gold_c > best["gold_containment"]:
                best = {"gold_id": gid, "bench": entry.bench,
                        "gold_containment": round(gold_c, 4),
                        "doc_containment": round(doc_c, 4),
                        "ratio": round(ratio, 2),
                        "numeric_jaccard": numeric_overlap(norm, entry.text)}
        return best


# --------------------------------------------------------------------------
# bench adapters
# --------------------------------------------------------------------------


def load_olmocr_gold(bench_data: pathlib.Path) -> Iterator[tuple[str, str]]:
    """olmOCR rules are fragments; concatenate them per source PDF page.

    A single rule ("25 paisa") is far too short to identify a document, but the
    union of every rule attached to one page is a usable fingerprint.
    """
    per_pdf: defaultdict[str, list[str]] = defaultdict(list)
    for path in sorted(bench_data.rglob("*.jsonl")):
        for line in path.read_text(errors="ignore").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            pdf = obj.get("pdf") or obj.get("pdf_path") or obj.get("id") or ""
            if not pdf:
                continue
            # `absent` rules assert a string is NOT on the page; including them
            # would dilute the page fingerprint with text the page never had.
            if obj.get("type") == "absent":
                continue
            for key in ("text", "before", "after", "answer", "target", "cell", "value"):
                v = obj.get(key)
                if isinstance(v, str) and v.strip():
                    per_pdf[f"olmocr::{pdf}"].append(v.strip())
    for gid, parts in per_pdf.items():
        yield gid, " ".join(parts)


def load_pdf_gold(pdf_dir: pathlib.Path, bench: str) -> Iterator[tuple[str, str]]:
    """Fingerprint bench pages from the shipped PDFs themselves.

    Preferred over ``load_olmocr_gold``: rule unions only cover the pages whose
    rules happen to carry enough text (363 of olmOCR's 1,403), whereas the PDF
    text layer covers every page that has one.
    """
    import fitz

    for path in sorted(pdf_dir.rglob("*.pdf")):
        try:
            with fitz.open(path) as doc:
                parts = []
                for page in doc:
                    try:
                        parts.append(page.get_text("text"))
                    except Exception:
                        continue
        except Exception:
            continue
        text = " ".join(parts).strip()
        if text:
            yield f"{bench}::{path.name}", text


def load_jsonl_gold(path: pathlib.Path, bench: str, id_key: str, text_keys: tuple[str, ...]) -> Iterator[tuple[str, str]]:
    for i, line in enumerate(path.read_text(errors="ignore").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        gid = f"{bench}::{obj.get(id_key, i)}"
        parts = [str(obj[k]) for k in text_keys if isinstance(obj.get(k), str)]
        if parts:
            yield gid, " ".join(parts)


def load_json_array_gold(path: pathlib.Path, bench: str) -> Iterator[tuple[str, str]]:
    """OmniDocBench ships one JSON array; gold text lives in per-block records."""
    try:
        data = json.loads(path.read_text(errors="ignore"))
    except json.JSONDecodeError:
        return
    if isinstance(data, dict):
        data = data.get("data") or data.get("samples") or []
    for i, rec in enumerate(data if isinstance(data, list) else []):
        if not isinstance(rec, dict):
            continue
        name = (rec.get("page_info") or {}).get("image_path") if isinstance(rec.get("page_info"), dict) else None
        gid = f"{bench}::{name or rec.get('image_path') or i}"
        parts: list[str] = []
        for blk in rec.get("layout_dets", []) or []:
            if isinstance(blk, dict):
                for k in ("text", "latex", "html"):
                    v = blk.get(k)
                    if isinstance(v, str) and v.strip():
                        parts.append(v.strip())
        if parts:
            yield gid, " ".join(parts)


# --------------------------------------------------------------------------
# corpus pass
# --------------------------------------------------------------------------


def screen_docs(
    docs: Iterable[dict[str, Any]],
    index: GoldIndex,
    text_field: str = "text_head",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    flagged: list[dict[str, Any]] = []
    n = 0
    n_checked = 0
    per_bench: defaultdict[str, int] = defaultdict(int)
    for doc in docs:
        n += 1
        text = doc.get(text_field) or ""
        if not text:
            continue
        n_checked += 1
        hit = index.check(text)
        if hit:
            per_bench[hit["bench"]] += 1
            flagged.append({"sha": doc.get("sha"), "path": doc.get("path"),
                            "producer": doc.get("producer"), **hit})
    return flagged, {
        "docs_seen": n,
        "docs_checked": n_checked,
        "gold_entries": len(index),
        "flagged": len(flagged),
        "flagged_by_bench": dict(per_bench),
        "thresholds": {"shingle_k": SHINGLE_K, "containment": CANDIDATE_CONTAINMENT,
                       "confirm_ratio": CONFIRM_RATIO, "min_gold_chars": MIN_GOLD_CHARS},
    }


def screen_selected_pages(
    selected: list[dict[str, Any]],
    pdf_root: pathlib.Path,
    index: GoldIndex,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Screen the exact pages Stage 2 chose, using their own text.

    Document-head screening cannot see a bench page sitting at page 150 of a
    372-page filing, and those are the pages we would actually mine a recipe
    from. This reads each selected page's text layer directly.
    """
    import fitz

    by_doc: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in selected:
        by_doc[row["sha"]].append(row)

    flagged: list[dict[str, Any]] = []
    checked = 0
    missing = 0
    for sha, rows in sorted(by_doc.items()):
        path = pdf_root / sha[:2] / sha[2:4] / f"{sha}.pdf"
        if not path.exists():
            missing += len(rows)
            continue
        try:
            doc = fitz.open(path)
        except Exception:
            missing += len(rows)
            continue
        try:
            for row in rows:
                idx_page = int(row.get("page", 0))
                if idx_page >= doc.page_count:
                    missing += 1
                    continue
                try:
                    text = doc[idx_page].get_text("text")
                except Exception:
                    missing += 1
                    continue
                checked += 1
                hit = index.check(text)
                if hit:
                    flagged.append({"sha": sha, "page": idx_page, **hit})
        finally:
            doc.close()

    return flagged, {
        "pages_selected": len(selected),
        "pages_checked": checked,
        "pages_unreadable": missing,
        "gold_entries": len(index),
        "flagged": len(flagged),
        "flagged_docs": len({f["sha"] for f in flagged}),
    }


def build_index(sources: list[tuple[str, Iterable[tuple[str, str]]]]) -> GoldIndex:
    idx = GoldIndex()
    for bench, pairs in sources:
        for gid, text in pairs:
            idx.add(gid, bench, text)
    return idx


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Stage 1b — decontaminate against eval gold")
    ap.add_argument("--docs", required=True, help="docs.jsonl from Stage 0")
    ap.add_argument("--olmocr-bench-data", default="")
    ap.add_argument("--pdf-gold", default="", help="bench:dir — fingerprint bench PDFs directly")
    ap.add_argument("--omnidoc-json", default="")
    ap.add_argument("--extra-jsonl", default="", help="bench:path:id_key:text_key")
    ap.add_argument("--out", required=True, help="quarantine list (jsonl)")
    ap.add_argument("--report", default="")
    a = ap.parse_args(argv)

    sources: list[tuple[str, Iterable[tuple[str, str]]]] = []
    if a.olmocr_bench_data:
        sources.append(("olmocr", load_olmocr_gold(pathlib.Path(a.olmocr_bench_data).expanduser())))
    if a.pdf_gold:
        bench, pdf_dir = a.pdf_gold.split(":", 1)
        sources.append((bench, load_pdf_gold(pathlib.Path(pdf_dir).expanduser(), bench)))
    if a.omnidoc_json:
        sources.append(("omnidoc", load_json_array_gold(pathlib.Path(a.omnidoc_json).expanduser(), "omnidoc")))
    if a.extra_jsonl:
        bench, path, id_key, text_key = a.extra_jsonl.split(":", 3)
        sources.append((bench, load_jsonl_gold(pathlib.Path(path).expanduser(), bench, id_key, (text_key,))))
    if not sources:
        raise SystemExit("no gold sources given")

    index = build_index(sources)
    docs = (json.loads(l) for l in pathlib.Path(a.docs).expanduser().read_text().splitlines() if l.strip())
    flagged, rep = screen_docs(docs, index)

    dst = pathlib.Path(a.out).expanduser()
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("w") as fh:
        for row in flagged:
            fh.write(json.dumps(row) + "\n")
    print(json.dumps(rep, indent=2))
    if a.report:
        p = pathlib.Path(a.report).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
