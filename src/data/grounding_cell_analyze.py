"""Classify WHY gradeable cells miss, from a grounding_cell_dump.py records file.

Separates ground-truth artifacts (duplicated GT boxes, off-by-one page anchors)
from real prediction geometry problems (row-band smear, half-height stacked
cells, column drift), and prints the dominant signature per field.
"""

from __future__ import annotations

import collections
import json
import re
import statistics
import sys


def idx(path: str) -> int | None:
    m = re.match(r"^([A-Za-z_]+)\[(\d+)\]", path)
    return int(m.group(2)) if m else None


def bucket(r: dict) -> str:
    if r["n_pred_boxes"] == 0:
        return "no-pred-box"
    if not r["page_ok"]:
        return "wrong-page"
    iou = r["iou"] or 0.0
    if iou >= 0.5:
        return "grounded"
    if iou == 0:
        return "displaced"
    return "low-iou"


def geom(r: dict) -> str:
    """Signature of the pred-vs-GT box relationship (same page only)."""
    g, p = r["gt_box"], r["pred_box"]
    if not p:
        return "-"
    gx, gy, gw, gh = g
    px, py, pw, ph = p
    wr = pw / gw if gw else 0
    hr = ph / gh if gh else 0
    dy = py - gy
    dx = px - gx
    tags = []
    if wr > 3:
        tags.append("FULL-ROW-BAND" if wr > 6 else "wide")
    elif wr < 0.4:
        tags.append("narrow")
    if hr > 1.6:
        tags.append("tall")
    elif hr < 0.7:
        tags.append("HALF-HEIGHT" if 0.4 < hr < 0.6 else "short")
    if abs(dy) > max(gh, 0.004) * 1.2:
        tags.append(f"dy{'+' if dy > 0 else '-'}")
    if abs(dx) > max(gw, 0.01) * 1.2:
        tags.append(f"dx{'+' if dx > 0 else '-'}")
    return ",".join(tags) or "aligned"


def main() -> None:
    path = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else path
    recs = json.load(open(path))

    # ---- duplicated GT boxes (the fixture-artifact signature)
    bybox = collections.defaultdict(list)
    for r in recs:
        bybox[(r["field"], tuple(r["gt_pages"]), tuple(r["gt_box"]))].append(r)

    def dup(r):
        return len(bybox[(r["field"], tuple(r["gt_pages"]), tuple(r["gt_box"]))]) > 1

    total = len(recs)
    tp = sum(1 for r in recs if bucket(r) == "grounded" and r["v_ok"])
    clean = [r for r in recs if not dup(r)]
    ctp = sum(1 for r in clean if bucket(r) == "grounded" and r["v_ok"])
    ndup_bad = sum(1 for r in recs if dup(r) and bucket(r) != "grounded")

    print(f"\n{'=' * 78}\n## {name}")
    print(f"   gradeable cells {total}   grounded_tp {tp}   f1 {tp / total:.4f}")
    print(f"   cells on a GT box shared with another row: {sum(1 for r in recs if dup(r))}"
          f"  (of which failing: {ndup_bad})")
    if clean and len(clean) != total:
        print(f"   excluding shared-GT-box cells: {ctp}/{len(clean)} = {ctp / len(clean):.4f}")

    # ---- page monotonicity (row order vs page order)
    gt_pg, pr_pg = collections.defaultdict(list), collections.defaultdict(list)
    for r in recs:
        i = idx(r["gt_path"])
        if i is None:
            continue
        gt_pg[i] += r["gt_pages"]
        pr_pg[i] += r["pred_pages"]
    rows = sorted(gt_pg)
    if rows:
        gs = [statistics.mode(gt_pg[i]) for i in rows]
        ps = [statistics.mode(pr_pg[i]) for i in rows if pr_pg[i]]
        gdec = sum(1 for k in range(1, len(gs)) if gs[k] < gs[k - 1])
        pdec = sum(1 for k in range(1, len(ps)) if ps[k] < ps[k - 1])
        print(f"   page-order decreases across {len(rows)} rows:  GT {gdec}   PRED {pdec}"
              f"   {'<- GT is non-monotonic' if gdec > pdec else ''}")

    # ---- per-field dominant geometry signature for failing cells
    print(f"\n   {'field':26} {'fail':>5}/{'tot':<5} {'bucket':<12} dominant pred-vs-GT geometry")
    fields = collections.defaultdict(list)
    for r in recs:
        fields[r["field"]].append(r)
    ranked = sorted(fields.items(), key=lambda kv: -sum(1 for r in kv[1] if bucket(r) != "grounded"))
    for f, rs in ranked[:14]:
        bad = [r for r in rs if bucket(r) != "grounded"]
        if not bad:
            continue
        bk = collections.Counter(bucket(r) for r in bad).most_common(1)[0]
        gsig = collections.Counter(geom(r) for r in bad if r["pred_box"]).most_common(2)
        ious = [r["iou"] for r in bad if r["iou"]]
        med = f" medIoU={statistics.median(ious):.3f}" if ious else ""
        dupn = sum(1 for r in bad if dup(r))
        sig = "  ".join(f"{k}×{v}" for k, v in gsig)
        print(f"   {f:26} {len(bad):5}/{len(rs):<5} {bk[0]:<12} {sig}{med}"
              f"{f'  [dupGT×{dupn}]' if dupn else ''}")

    # ---- concrete examples for the top failing field
    if ranked:
        f, rs = ranked[0]
        bad = [r for r in rs if bucket(r) != "grounded"]
        print(f"\n   -- examples, {f} ({bucket(bad[0])}):")
        for r in bad[:5]:
            print(f"      {r['gt_path'][:34]:34} GTp{r['gt_pages']}{[round(x, 4) for x in r['gt_box']]}"
                  f"  PREDp{r['pred_pages']}{[round(x, 4) for x in r['pred_box']] if r['pred_box'] else None}"
                  f"  iou={r['iou']}")


if __name__ == "__main__":
    main()
