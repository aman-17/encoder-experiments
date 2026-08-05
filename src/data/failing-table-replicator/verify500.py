#!/usr/bin/env python3
"""Dedup + eval-contamination checks for the 500-doc synthetic training set.

Within-set: exact normalized-GT hash; 8-gram shingle Jaccard (>=0.6 flagged,
computed only within the same template family — cross-family overlap is
structurally impossible except via shared boilerplate labels).
Vs eval: value-token overlap between each GT and each of the 37 real failing
ParseBench PDFs (pdftotext): flag if >=12-token contiguous VALUE run matches.
Also verifies structural sanity: GT parses, cell counts, per-family ranges.
"""
import collections
import hashlib
import itertools
import json
import re
import subprocess
from pathlib import Path

OUT = Path.home() / "Desktop" / "synthetic_failing_tables_v1"
REAL = Path("/Users/aman/programs/llamaindex/parsebench_viewer/failing_tables_lt0.5")

def norm(s):
    return re.sub(r"\s+", " ", s).strip().lower()

def cells_of(gt):
    return len(re.findall(r"<t[dh][ >]", gt))

docs = []
for tj in sorted(OUT.glob("*.test.json")):
    d = json.loads(tj.read_text())
    gt = d["expected_markdown"]
    fam = tj.stem.rsplit("_s", 1)[0].replace(".test", "")
    docs.append({"id": tj.stem.replace(".test", ""), "fam": fam, "gt": gt, "n": norm(gt)})
print(f"docs: {len(docs)}")

# 1. exact dup
h = collections.Counter(hashlib.md5(d["n"].encode()).hexdigest() for d in docs)
exact = sum(c - 1 for c in h.values() if c > 1)
print(f"exact normalized-GT dups: {exact}")

# 2. near-dup within family (8-gram shingles, Jaccard >= 0.6)
def shingles(s, k=8):
    w = s.split()
    return {" ".join(w[i:i + k]) for i in range(max(1, len(w) - k + 1))}
near = []
byfam = collections.defaultdict(list)
for d in docs:
    byfam[d["fam"]].append(d)
for fam, ds in byfam.items():
    sh = {d["id"]: shingles(d["n"]) for d in ds}
    for a, b in itertools.combinations(ds, 2):
        A, B = sh[a["id"]], sh[b["id"]]
        j = len(A & B) / max(1, len(A | B))
        if j >= 0.6:
            near.append((a["id"], b["id"], round(j, 3)))
print(f"near-dup pairs (same-family J>=0.6): {len(near)}")
for a, b, j in near[:10]:
    print("  ", a, b, j)

# 3. eval contamination: contiguous VALUE-run overlap vs real PDF text
VAL = re.compile(r"[0-9][0-9,.\-$%()]*|[A-Z]{2,}[0-9A-Z\-]*")
def value_seq(text):
    return [m.group(0) for m in VAL.finditer(text) if len(m.group(0)) > 1]
real_grams = set()
K = 12
for pdf in REAL.glob("*.pdf"):
    try:
        txt = subprocess.run(["/opt/homebrew/bin/pdftotext", str(pdf), "-"],
                             capture_output=True, text=True, timeout=60).stdout
    except Exception:
        continue
    seq = value_seq(txt)
    for i in range(max(0, len(seq) - K + 1)):
        real_grams.add(tuple(seq[i:i + K]))
print(f"real value {K}-grams: {len(real_grams)}")
contam = []
for d in docs:
    seq = value_seq(d["gt"])
    hits = sum(1 for i in range(max(0, len(seq) - K + 1)) if tuple(seq[i:i + K]) in real_grams)
    if hits:
        contam.append((d["id"], hits))
print(f"docs with >= {K}-token contiguous value overlap vs eval: {len(contam)}")
for c in contam[:10]:
    print("  ", c)

# 4. structural sanity per family
print("\nper-family GT cells (min-max) and doc count:")
for fam in sorted(byfam):
    ns = [cells_of(d["gt"]) for d in byfam[fam]]
    rows = len(byfam[fam])
    flag = " <-- OVER 1500" if max(ns) > 1500 else ""
    print(f"  {fam:34s} n={rows:3d} cells {min(ns)}-{max(ns)}{flag}")

bad = exact + len(near) + len(contam)
print("\nRESULT:", "CLEAN" if bad == 0 else f"{bad} issues (see above)")
