"""Per-page probe sidecars from existing PDFs, via pymupdf.

Emits pixel-space ground truth for the glyph/bbox probe families WITHOUT
regenerating any documents: for every page of every input PDF, a NEW
sidecar file `<stem>.p<page>.sidecar.json` is written next to nothing —
into --out — so existing test.json / layout-rule schemas stay untouched.

Sidecar schema:
  {
    "page_w_pt": float, "page_h_pt": float,
    "glyphs": [{"char": str, "bbox": [x0,y0,x1,y1], "font": str, "size_pt": float}],
    "words":  [{"text": str, "bbox": [x0,y0,x1,y1]}],
    "blocks": [{"bbox": [x0,y0,x1,y1], "kind": "text"}]
  }

All bboxes are normalized to [0, 1] over the page, x rightward, y DOWNWARD
(top-left origin) — pymupdf page coordinates are already top-left-origin
y-down points, so normalization is a straight divide by page width/height.
This matches the probe convention in encoder_experiments/sites.py.

Pages with no text layer are skipped (no sidecar emitted) and counted.

Usage:
  uv run python src/data/pdf_probe_sidecars.py --pdfs '<glob>' --out <dir> [--limit N]
"""

from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

import pymupdf


def _norm_bbox(bbox: tuple[float, float, float, float], w: float, h: float) -> list[float]:
    x0, y0, x1, y1 = bbox
    return [
        min(max(x0 / w, 0.0), 1.0),
        min(max(y0 / h, 0.0), 1.0),
        min(max(x1 / w, 0.0), 1.0),
        min(max(y1 / h, 0.0), 1.0),
    ]


def extract_page(page: pymupdf.Page) -> dict | None:
    """One page -> sidecar dict, or None if the page has no text layer."""
    w, h = page.rect.width, page.rect.height
    if w <= 0 or h <= 0:
        return None

    glyphs: list[dict] = []
    raw = page.get_text("rawdict")
    for block in raw.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                font = span.get("font", "")
                size_pt = float(span.get("size", 0.0))
                for ch in span.get("chars", []):
                    c = ch.get("c", "")
                    if not c or c.isspace():
                        continue
                    glyphs.append(
                        {
                            "char": c,
                            "bbox": _norm_bbox(ch["bbox"], w, h),
                            "font": font,
                            "size_pt": size_pt,
                        }
                    )
    if not glyphs:
        return None

    words = [
        {"text": wd[4], "bbox": _norm_bbox(wd[:4], w, h)}
        for wd in page.get_text("words")
    ]
    blocks = [
        {"bbox": _norm_bbox(bl[:4], w, h), "kind": "text"}
        for bl in page.get_text("blocks")
        if bl[6] == 0  # type 0 = text block; 1 = image
    ]
    return {
        "page_w_pt": w,
        "page_h_pt": h,
        "glyphs": glyphs,
        "words": words,
        "blocks": blocks,
    }


def process_pdf(pdf_path: Path, out_dir: Path) -> tuple[int, int]:
    """Returns (pages_emitted, pages_skipped_no_text)."""
    emitted = skipped = 0
    with pymupdf.open(pdf_path) as doc:
        for page_no, page in enumerate(doc):
            sidecar = extract_page(page)
            if sidecar is None:
                skipped += 1
                continue
            out_path = out_dir / f"{pdf_path.stem}.p{page_no}.sidecar.json"
            out_path.write_text(json.dumps(sidecar, ensure_ascii=False))
            emitted += 1
    return emitted, skipped


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--pdfs", required=True, help="glob of input PDFs (quote it)")
    ap.add_argument("--out", required=True, help="output dir for sidecar JSONs")
    ap.add_argument("--limit", type=int, default=None, help="max PDFs to process")
    args = ap.parse_args()

    pdfs = sorted(glob.glob(args.pdfs))
    if args.limit is not None:
        pdfs = pdfs[: args.limit]
    if not pdfs:
        raise SystemExit(f"no PDFs match {args.pdfs!r}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    total_emitted = total_skipped = 0
    for p in pdfs:
        emitted, skipped = process_pdf(Path(p), out_dir)
        total_emitted += emitted
        total_skipped += skipped
        print(f"{p}: {emitted} page(s) emitted, {skipped} skipped (no text layer)")
    print(
        f"done: {len(pdfs)} PDF(s), {total_emitted} sidecar page(s), "
        f"{total_skipped} page(s) skipped (no text layer)"
    )


if __name__ == "__main__":
    main()
