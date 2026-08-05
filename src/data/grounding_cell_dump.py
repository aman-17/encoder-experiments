"""Per-cell dump of extract_unified_grounded_* for one doc.

Reruns the real metric (same alignment, same indexes) but instruments
_Scorer._score_cell so every aligned cell reports:
  value_ok, gt_has_box, pred_has_box, page_ok, box_ok, best IoU, geometry.

Usage:
  uv run python tools/grounding_cell_dump.py <result.json> <test.json> [out.json]
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict

from llamacloud_bench.evaluation.metrics.extract import unified_evidence_metric as U
from llamacloud_bench.test_cases.loader import load_test_case


def main() -> None:
    result_path, test_path = sys.argv[1], sys.argv[2]
    out_path = sys.argv[3] if len(sys.argv) > 3 else None

    res = json.load(open(result_path))
    out = res["output"]
    extracted = out["extracted_data"]
    citations = out.get("field_citations") or []

    from pathlib import Path

    tp = Path(test_path)
    pdf = tp.parent / (tp.name.replace(".test.json", ".pdf"))
    tc = load_test_case(pdf, tp)
    rules = tc.get_extract_field_rules()

    records: list[dict] = []
    orig = U._Scorer._score_cell

    def patched(self, gt_path, pred_path, canonical, actual, field, c, ground=True):  # noqa: ANN001
        v_ok = self._value_match(gt_path, canonical, actual, field)
        gt_boxes = self._ev_boxes.get(gt_path) or []
        pred_boxes = self._pred_boxes.get(pred_path) or []
        gt_pages = self._ev_pages.get(gt_path) or set()
        pred_pages = self._pred_pages.get(pred_path) or set()
        best_iou = 0.0
        best_pair = None
        for gp, gb in gt_boxes:
            for pp, pb in pred_boxes:
                if gp != pp:
                    continue
                i = U._iou_xywh(gb, pb)
                if i > best_iou:
                    best_iou, best_pair = i, (gp, gb, pb)
        if gt_boxes and pred_boxes:
            records.append(
                {
                    "gt_path": gt_path,
                    "pred_path": pred_path,
                    "field": field,
                    "v_ok": bool(v_ok),
                    "expected": canonical if not isinstance(canonical, (dict, list)) else str(canonical)[:80],
                    "actual": actual if not isinstance(actual, (dict, list)) else str(actual)[:80],
                    "gt_pages": sorted(gt_pages),
                    "pred_pages": sorted(pred_pages),
                    "page_ok": bool(gt_pages & pred_pages),
                    "iou": round(best_iou, 4),
                    "gt_box": [round(x, 4) for x in best_pair[1]] if best_pair else (
                        [round(x, 4) for x in gt_boxes[0][1]]
                    ),
                    "pred_box": [round(x, 4) for x in best_pair[2]] if best_pair else (
                        [round(x, 4) for x in pred_boxes[0][1]]
                    ),
                    "n_gt_boxes": len(gt_boxes),
                    "n_pred_boxes": len(pred_boxes),
                    "ground": bool(ground),
                }
            )
        elif gt_boxes:
            records.append(
                {
                    "gt_path": gt_path,
                    "pred_path": pred_path,
                    "field": field,
                    "v_ok": bool(v_ok),
                    "expected": canonical if not isinstance(canonical, (dict, list)) else str(canonical)[:80],
                    "actual": actual if not isinstance(actual, (dict, list)) else str(actual)[:80],
                    "gt_pages": sorted(gt_pages),
                    "pred_pages": sorted(pred_pages),
                    "page_ok": bool(gt_pages & pred_pages),
                    "iou": None,
                    "gt_box": [round(x, 4) for x in gt_boxes[0][1]],
                    "pred_box": None,
                    "n_gt_boxes": len(gt_boxes),
                    "n_pred_boxes": 0,
                    "ground": bool(ground),
                }
            )
        return orig(self, gt_path, pred_path, canonical, actual, field, c, ground)

    U._Scorer._score_cell = patched
    metrics = U.compute_unified_evidence_metrics(
        expected_output=tc.expected_output,
        extracted_data=extracted,
        field_rules=rules,
        field_citations=citations,
        data_schema=tc.data_schema,
    )
    U._Scorer._score_cell = orig

    by_name = {m.metric_name: m for m in metrics}
    g = by_name.get("extract_unified_grounded_f1")
    print("=== metrics ===")
    for m in metrics:
        print(f"{m.metric_name:42} {m.value:.4f}")
    if g:
        print("meta:", json.dumps(g.metadata, indent=2))

    # bucket the gradeable GT cells
    buckets = Counter()
    by_field = defaultdict(Counter)
    for r in records:
        if not r["ground"]:
            continue
        if r["n_pred_boxes"] == 0:
            b = "no-pred-box"
        elif not r["page_ok"]:
            b = "wrong-page"
        elif r["iou"] is None or r["iou"] == 0:
            b = "displaced"
        elif r["iou"] >= 0.5:
            b = "grounded-geom" if r["v_ok"] else "geom-ok-VALUE-FAIL"
        else:
            b = "low-iou"
        if b == "grounded-geom" and not r["v_ok"]:
            b = "geom-ok-VALUE-FAIL"
        if b != "grounded-geom" and not r["v_ok"]:
            b += "+value-fail"
        buckets[b] += 1
        by_field[r["field"]][b] += 1
    total = sum(buckets.values())
    print(f"\n=== gradeable GT-bbox cells reaching _score_cell: {total} ===")
    for b, n in buckets.most_common():
        print(f"  {b:28} {n:6}  {100 * n / total:5.1f}%")

    print("\n=== per-field breakdown (non-grounded only) ===")
    rows = []
    for f, c in by_field.items():
        bad = sum(v for k, v in c.items() if k != "grounded-geom")
        rows.append((bad, f, dict(c)))
    for bad, f, c in sorted(rows, reverse=True)[:25]:
        tot = sum(c.values())
        print(f"  {f:26} bad={bad:5}/{tot:5}  {c}")

    if out_path:
        json.dump(records, open(out_path, "w"))
        print(f"\nwrote {len(records)} cell records -> {out_path}")


if __name__ == "__main__":
    main()
