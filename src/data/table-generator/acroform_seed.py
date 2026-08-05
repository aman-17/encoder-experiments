"""Seed the synthetic generator from REAL acroforms.

Reads a few acroform PDFs (already downloaded) and extracts their form structure
via pymupdf widgets + nearby label text, then emits a JSON "form spec" per doc
that the generator turns into a styled page carrying ALL Canonical17 components:

  Key-Value Region, Form (fillable fields), Checkbox-Selected/Unselected,
  Code, Formula, Document Index — plus the usual Title/Text/Table.

Usage: python acroform_seed.py --acroforms <dir> --count 8 --out form_specs.json
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import pymupdf


import re


def clean_name(name: str) -> str:
    """Turn an XFA/AcroForm field name into a human label.
    'form1[0].#subform[0].Last_Name[0]' -> 'Last Name'."""
    seg = name.split(".")[-1]
    seg = re.sub(r"\[\d+\]", "", seg)          # drop [0]
    seg = re.sub(r"[#_]+", " ", seg)            # #subform / underscores -> space
    seg = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", seg)  # camelCase -> spaced
    seg = re.sub(r"\d+$", "", seg).strip()
    words = [w for w in seg.split() if w.lower() not in ("subform", "form", "field", "topmostsubform")]
    seg = " ".join(words).strip()
    return seg[:1].upper() + seg[1:] if seg else ""


def label_for(page, rect):
    """Nearest printed text to the left/above a widget rect = its label."""
    words = page.get_text("words")  # x0,y0,x1,y1,word,...
    best, bestd = None, 1e9
    cx, cy = rect.x0, (rect.y0 + rect.y1) / 2
    for x0, y0, x1, y1, w, *_ in words:
        if not w.strip():
            continue
        # prefer words to the left on the same line, or just above
        same_line = abs((y0 + y1) / 2 - cy) < rect.height * 1.2 and x1 <= cx + 2
        above = 0 <= cy - y1 < rect.height * 2 and abs(x0 - cx) < rect.width
        if same_line or above:
            d = (cx - x1) ** 2 + ((y0 + y1) / 2 - cy) ** 2
            if d < bestd:
                bestd, best = d, w
    return (best or "").strip(":").strip()


def extract_spec(pdf: Path, rng: random.Random):
    doc = pymupdf.open(pdf)
    fields, checks = [], []
    title = pdf.stem.replace("_", " ").replace("-", " ").strip()[:70]
    for pno in range(min(doc.page_count, 3)):
        page = doc[pno]
        try:
            widgets = list(page.widgets() or [])
        except Exception:
            widgets = []
        for w in widgets:
            r = w.rect.normalize()
            if r.width < 3 or r.height < 3:
                continue
            printed = label_for(page, r)
            named = clean_name(w.field_name or "")
            # prefer a real printed word-label; fall back to the cleaned field name
            lbl = printed if (printed and re.search(r"[A-Za-z]{3}", printed)) else named
            lbl = " ".join(lbl.split())[:40]
            if not lbl or not re.search(r"[A-Za-z]{2}", lbl):
                continue
            if w.field_type == pymupdf.PDF_WIDGET_TYPE_CHECKBOX:
                checks.append(lbl)
            elif w.field_type == pymupdf.PDF_WIDGET_TYPE_TEXT:
                fields.append(lbl)
        if fields or checks:
            break
    doc.close()
    # de-dup, keep order
    fields = list(dict.fromkeys(fields))[:10]
    checks = list(dict.fromkeys(checks))[:6]
    if len(fields) < 2 and len(checks) < 2:
        return None  # not enough structure to seed a form

    # Split fields: first few -> key-value region, rest -> fillable form fields.
    kv = fields[: max(2, len(fields) // 2)]
    formfields = fields[len(kv):] or fields[:3]
    return {
        "id": pdf.stem,
        "source_pdf": pdf.name,
        "title": title or "Form Submission",
        "keyvalues": [{"label": k, "value": ""} for k in kv],
        "formfields": [{"label": f} for f in formfields],
        "checkboxes": [{"label": c, "checked": rng.random() < 0.4} for c in checks]
        or [{"label": "I certify the information is correct", "checked": True}],
        "toc": ["Filing Information", "Declarations", "Certification", "Appendix"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--acroforms", required=True)
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default="form_specs.json")
    a = ap.parse_args()
    rng = random.Random(a.seed)
    pdfs = sorted(Path(a.acroforms).glob("*.pdf"))
    rng.shuffle(pdfs)
    specs = []
    for p in pdfs:
        if len(specs) >= a.count:
            break
        try:
            s = extract_spec(p, rng)
        except Exception as e:
            print("skip", p.name, e)
            continue
        if s:
            specs.append(s)
    json.dump(specs, open(a.out, "w"), indent=1)
    print(f"wrote {len(specs)} form specs -> {a.out}")


if __name__ == "__main__":
    main()
