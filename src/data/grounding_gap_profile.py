"""Profile WHY grounded F1 is low for one run, across a whole dataset.

Not a delta tool. Takes one run's outputs and the GT, replays the real metric
per cell, and asks what the non-grounded cells actually look like:

  bucket        no-box / wrong-page / displaced (IoU 0) / partial (0<IoU<0.5)
  near-miss     how many cells sit just under the 0.5 threshold
  containment   is the predicted box INSIDE the GT box (we cite the value, GT
                boxes the whole field) or is GT inside pred (row-band smear)
  center-in     does the predicted box's center land inside the GT box

The last one is the money number: if most failures are center-in-GT, we are
pointing at the right place and only disagreeing about extent, which is a box
convention problem, not a localization problem.

Usage:
  uv run python tools/grounding_gap_profile.py <run_dir> <gt_dir> --doclist f [--out cells.json]
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics
from pathlib import Path

from llamacloud_bench.evaluation.metrics.extract import unified_evidence_metric as U
from llamacloud_bench.test_cases.loader import load_test_case


def cells_for_doc(result_path: Path, test_path: Path) -> list[dict]:
    out = json.load(open(result_path))["output"]
    pdf = test_path.parent / test_path.name.replace(".test.json", ".pdf")
    tc = load_test_case(pdf, test_path)

    recs: list[dict] = []
    orig = U._Scorer._score_cell

    def patched(self, gt_path, pred_path, canonical, actual, field, c, ground=True):  # noqa: ANN001
        gt_boxes = self._ev_boxes.get(gt_path) or []
        if ground and gt_boxes:
            pred_boxes = self._pred_boxes.get(pred_path) or []
            gt_pages = self._ev_pages.get(gt_path) or set()
            pred_pages = self._pred_pages.get(pred_path) or set()
            best, gb_best, pb_best = 0.0, None, None
            for gp, gb in gt_boxes:
                for pp, pb in pred_boxes:
                    if gp != pp:
                        continue
                    i = U._iou_xywh(gb, pb)
                    if i >= best:
                        best, gb_best, pb_best = i, gb, pb
            if gb_best is None and gt_boxes:
                gb_best = gt_boxes[0][1]
            if pb_best is None and pred_boxes:
                pb_best = pred_boxes[0][1]
            recs.append({
                "field": field,
                "gt_path": gt_path,
                "n_pred": len(pred_boxes),
                "page_ok": bool(gt_pages & pred_pages),
                "iou": best,
                "gt_box": list(gb_best) if gb_best else None,
                "pred_box": list(pb_best) if pb_best else None,
            })
        return orig(self, gt_path, pred_path, canonical, actual, field, c, ground)

    U._Scorer._score_cell = patched
    try:
        U.compute_unified_evidence_metrics(
            expected_output=tc.expected_output,
            extracted_data=out["extracted_data"],
            field_rules=tc.get_extract_field_rules(),
            field_citations=out.get("field_citations") or [],
            data_schema=tc.data_schema,
        )
    finally:
        U._Scorer._score_cell = orig
    return recs


def area(b: list[float]) -> float:
    return max(0.0, b[2]) * max(0.0, b[3])


def inter(a: list[float], b: list[float]) -> float:
    x = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    y = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    return x * y


def center_in(pred: list[float], gt: list[float]) -> bool:
    cx, cy = pred[0] + pred[2] / 2, pred[1] + pred[3] / 2
    return gt[0] <= cx <= gt[0] + gt[2] and gt[1] <= cy <= gt[1] + gt[3]


def bucket(r: dict) -> str:
    if r["n_pred"] == 0:
        return "no-box"
    if not r["page_ok"]:
        return "wrong-page"
    if r["iou"] >= 0.5:
        return "grounded"
    return "displaced" if r["iou"] == 0.0 else "partial"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("gt_dir")
    ap.add_argument("--doclist", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    rd, gd = Path(a.run_dir), Path(a.gt_dir)

    recs: list[dict] = []
    for d in [x.strip() for x in open(a.doclist) if x.strip()]:
        rp, tp = rd / f"{d}.result.json", gd / f"{d}.test.json"
        if not (rp.exists() and tp.exists()):
            continue
        try:
            for r in cells_for_doc(rp, tp):
                r["doc"] = d
                recs.append(r)
        except Exception:  # noqa: BLE001
            continue

    n = len(recs)
    b = collections.Counter(bucket(r) for r in recs)
    print(f"gradeable GT-bbox cells: {n}\n")
    for k, v in b.most_common():
        print(f"  {k:12} {v:6}  {100 * v / n:5.1f}%")

    # IoU distribution over cells that have a same-page predicted box
    both = [r for r in recs if r["n_pred"] and r["page_ok"] and r["pred_box"] and r["gt_box"]]
    print(f"\ncells with a predicted box on the right page: {len(both)}")
    bands = [(0.0, 0.0), (0.0, 0.1), (0.1, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 1.01)]
    for lo, hi in bands:
        if lo == hi == 0.0:
            c = sum(1 for r in both if r["iou"] == 0.0)
            print(f"  IoU == 0        {c:6}  {100 * c / len(both):5.1f}%")
        else:
            c = sum(1 for r in both if lo < r["iou"] < hi) if lo == 0.0 else sum(
                1 for r in both if lo <= r["iou"] < hi
            )
            print(f"  IoU {lo:.1f}-{hi:.1f}     {c:6}  {100 * c / len(both):5.1f}%")

    fail = [r for r in both if r["iou"] < 0.5]
    print(f"\nnon-grounded cells that DO have a same-page box: {len(fail)}")
    ci = sum(1 for r in fail if center_in(r["pred_box"], r["gt_box"]))
    gc = sum(1 for r in fail if center_in(r["gt_box"], r["pred_box"]))
    pin = sum(1 for r in fail if inter(r["pred_box"], r["gt_box"]) >= 0.9 * area(r["pred_box"]))
    gin = sum(1 for r in fail if inter(r["pred_box"], r["gt_box"]) >= 0.9 * area(r["gt_box"]))
    ov = sum(1 for r in fail if r["iou"] > 0)
    print(f"  any overlap at all                        {ov:6}  {100 * ov / len(fail):5.1f}%")
    print(f"  pred CENTER inside GT box                 {ci:6}  {100 * ci / len(fail):5.1f}%")
    print(f"  GT center inside pred box                 {gc:6}  {100 * gc / len(fail):5.1f}%")
    print(f"  pred box ~contained in GT (we cite less)  {pin:6}  {100 * pin / len(fail):5.1f}%")
    print(f"  GT ~contained in pred (we cite more)      {gin:6}  {100 * gin / len(fail):5.1f}%")

    wr = [r["pred_box"][2] / r["gt_box"][2] for r in fail if r["gt_box"][2] > 0]
    hr = [r["pred_box"][3] / r["gt_box"][3] for r in fail if r["gt_box"][3] > 0]
    print(f"  width  pred/GT  median {statistics.median(wr):.2f}")
    print(f"  height pred/GT  median {statistics.median(hr):.2f}")

    # what-if: alternative acceptance criteria over ALL gradeable cells
    print("\nwhat grounded F1 would be under alternative box criteria (all cells):")
    got = sum(1 for r in recs if bucket(r) == "grounded")
    print(f"  IoU >= 0.5  (today)                {got:6}  {100 * got / n:5.1f}%")
    for thr in (0.3, 0.1):
        c = sum(1 for r in recs if r["n_pred"] and r["page_ok"] and r["iou"] >= thr)
        print(f"  IoU >= {thr}                        {c:6}  {100 * c / n:5.1f}%")
    c = sum(
        1
        for r in recs
        if r["n_pred"] and r["page_ok"] and r["pred_box"] and r["gt_box"]
        and center_in(r["pred_box"], r["gt_box"])
    )
    print(f"  pred center inside GT box          {c:6}  {100 * c / n:5.1f}%")
    c = sum(
        1
        for r in recs
        if r["n_pred"] and r["page_ok"] and r["pred_box"] and r["gt_box"] and r["iou"] > 0
    )
    print(f"  any overlap                        {c:6}  {100 * c / n:5.1f}%")

    if a.out:
        json.dump(recs, open(a.out, "w"))
        print(f"\nwrote {len(recs)} cells -> {a.out}")


if __name__ == "__main__":
    main()
