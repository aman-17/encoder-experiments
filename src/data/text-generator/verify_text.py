#!/usr/bin/env python3
"""Dedup + anchor-contamination checks for the dense-text training set.

Within-set: exact normalized-GT hash; same-family 8-gram shingle Jaccard >= 0.5
(prose should overlap far less than tables — boilerplate is smaller).
Vs anchors: 10-gram word overlap against pdftotext of the 3 real dense docs
(the magazine anchor is a raster scan → contributes nothing; noted).
Also: per-family GT length stats + emphasis-marker coverage (families exist to
teach FORMAT, so GTs must actually contain emphasis/structure markers).
"""
import collections
import hashlib
import itertools
import json
import re
import subprocess
from pathlib import Path

OUT = Path.home() / "Desktop" / "synthetic_dense_text_v1"
ANCHORS = [
    "/Users/aman/programs/llamaindex/parsebench_viewer/failing_text_lt0.5/0.000_text_dense__de.pdf",
    "/Users/aman/programs/llamaindex/parsebench_viewer/failing_text_lt0.5/0.000_text_dense__underline.pdf",
    "/Users/aman/programs/llamaindex/parsebench_viewer/failing_text_lt0.5/0.308_text_dense__japanese.pdf",
]

def norm(s):
    return re.sub(r"\s+", " ", s).strip().lower()

docs = []
for tj in sorted(OUT.glob("*.test.json")):
    d = json.loads(tj.read_text())
    gt = d["expected_markdown"]
    fam = tj.stem.rsplit("_s", 1)[0].replace(".test", "")
    docs.append({"id": tj.stem.replace(".test", ""), "fam": fam, "gt": gt, "n": norm(gt)})
print(f"docs: {len(docs)}")

h = collections.Counter(hashlib.md5(d["n"].encode()).hexdigest() for d in docs)
print(f"exact normalized-GT dups: {sum(c - 1 for c in h.values() if c > 1)}")

def shingles(s, k=8):
    w = s.split()
    return {" ".join(w[i:i + k]) for i in range(max(1, len(w) - k + 1))}

byfam = collections.defaultdict(list)
for d in docs:
    byfam[d["fam"]].append(d)
near = []
for fam, ds in byfam.items():
    sh = {d["id"]: shingles(d["n"]) for d in ds}
    for a, b in itertools.combinations(ds, 2):
        j = len(sh[a["id"]] & sh[b["id"]]) / max(1, len(sh[a["id"]] | sh[b["id"]]))
        if j >= 0.5:
            near.append((a["id"], b["id"], round(j, 3)))
print(f"near-dup pairs (same-family J>=0.5): {len(near)}")
for p in near[:12]:
    print("  ", *p)

# contamination vs anchors (word 10-grams; CJK: char 20-grams)
anchor_words, anchor_chars = set(), set()
for a in ANCHORS:
    txt = subprocess.run(["/opt/homebrew/bin/pdftotext", str(a), "-"],
                         capture_output=True, text=True, timeout=60).stdout
    w = norm(txt).split()
    for i in range(max(0, len(w) - 9)):
        anchor_words.add(" ".join(w[i:i + 10]))
    c = re.sub(r"\s+", "", txt)
    for i in range(max(0, len(c) - 19)):
        anchor_chars.add(c[i:i + 20])
print(f"anchor word-10-grams: {len(anchor_words)}, char-20-grams: {len(anchor_chars)}")
contam = []
for d in docs:
    w = d["n"].split()
    wh = sum(1 for i in range(max(0, len(w) - 9)) if " ".join(w[i:i + 10]) in anchor_words)
    c = re.sub(r"\s+", "", d["gt"])
    ch = sum(1 for i in range(0, max(0, len(c) - 19), 5) if c[i:i + 20] in anchor_chars)
    if wh or ch:
        contam.append((d["id"], wh, ch))
print(f"docs overlapping anchors: {len(contam)}")
for c in contam[:10]:
    print("  ", c)

print("\nper-family: n, GT chars (min-max), emphasis coverage")
for fam in sorted(byfam):
    ds = byfam[fam]
    lens = [len(d["gt"]) for d in ds]
    emph = sum(1 for d in ds if re.search(r"<u>|\*\*|~~|\*[^*]+\*", d["gt"]))
    struct = sum(1 for d in ds if re.search(r"^#|\n#", d["gt"]))
    print(f"  {fam:26s} n={len(ds):3d} chars {min(lens)}-{max(lens)}  emphasis {emph}/{len(ds)}  headings {struct}/{len(ds)}")
