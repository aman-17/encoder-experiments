"""Compare what two runs' citations are ANCHORED to, conditioned on grounding failure.

For each gradeable GT cell that run A grounds and run B displaces, look up the
citation each run emitted for that field and classify the text it matched:

  md-row     reference_text is a markdown table row ("| a | b | c |")
  br-blob    reference_text is a <br/>-joined cell (a whole column collapsed
             into one parse cell -- the degenerate table rendering)
  prose      anything else

A shift from md-row to br-blob on exactly the failing cells means the two runs
are grounding against different renderings of the same table.

Usage:
  uv run python tools/grounding_anchor_compare.py <runA> <runB> <gt> --doclist f
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

from llamacloud_bench.evaluation.metrics.extract import unified_evidence_metric as U
from llamacloud_bench.test_cases.loader import load_test_case


def cells(result_path: Path, test_path: Path) -> dict[str, dict]:
    """{gt_path: {bucket, pred_path}} for every gradeable GT-bbox cell."""
    res = json.load(open(result_path))
    out = res["output"]
    pdf = test_path.parent / test_path.name.replace(".test.json", ".pdf")
    tc = load_test_case(pdf, test_path)

    recs: dict[str, dict] = {}
    orig = U._Scorer._score_cell

    def patched(self, gt_path, pred_path, canonical, actual, field, c, ground=True):  # noqa: ANN001
        gt_boxes = self._ev_boxes.get(gt_path) or []
        pred_boxes = self._pred_boxes.get(pred_path) or []
        if ground and gt_boxes:
            gt_pages = self._ev_pages.get(gt_path) or set()
            pred_pages = self._pred_pages.get(pred_path) or set()
            best = 0.0
            best_pb = None
            for gp, gb in gt_boxes:
                for pp, pb in pred_boxes:
                    if gp == pp:
                        i = U._iou_xywh(gb, pb)
                        if i >= best:
                            best, best_pb = i, pb
            if not pred_boxes:
                b = "no-box"
            elif not (gt_pages & pred_pages):
                b = "wrong-page"
            elif best >= 0.5:
                b = "grounded"
            elif best == 0.0:
                b = "displaced"
            else:
                b = "low-iou"
            recs[gt_path] = {
                "bucket": b,
                "pred_path": pred_path,
                "gt_box": list(gt_boxes[0][1]),
                "pred_box": list(best_pb) if best_pb else (list(pred_boxes[0][1]) if pred_boxes else None),
            }
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


def anchors(result_path: Path) -> dict[str, str]:
    out = json.load(open(result_path))["output"]
    by: dict[str, str] = {}
    for c in out.get("field_citations") or []:
        by.setdefault(str(c.get("field_path")), str(c.get("reference_text") or ""))
    return by


def shape(text: str) -> str:
    if "<br/>" in text:
        return "br-blob"
    if text.strip().startswith("|"):
        return "md-row"
    return "prose"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_a")
    ap.add_argument("run_b")
    ap.add_argument("gt")
    ap.add_argument("--doclist", required=True)
    a = ap.parse_args()
    ra, rb, gd = Path(a.run_a), Path(a.run_b), Path(a.gt)

    dump: list[dict] = []
    pairs = collections.Counter()
    tot_a = collections.Counter()
    tot_b = collections.Counter()
    n_cells = n_docs = 0
    for d in [x.strip() for x in open(a.doclist) if x.strip()]:
        pa, pb, tp = ra / f"{d}.result.json", rb / f"{d}.result.json", gd / f"{d}.test.json"
        if not (pa.exists() and pb.exists() and tp.exists()):
            continue
        try:
            ca, cb = cells(pa, tp), cells(pb, tp)
            aa, ab = anchors(pa), anchors(pb)
        except Exception:  # noqa: BLE001
            continue
        n_docs += 1
        for gt_path, ra_rec in ca.items():
            rb_rec = cb.get(gt_path)
            if not rb_rec:
                continue
            # baseline reference: all cells, to show the background rate
            tot_a[shape(aa.get(ra_rec["pred_path"], ""))] += 1
            tot_b[shape(ab.get(rb_rec["pred_path"], ""))] += 1
            if ra_rec["bucket"] == "grounded" and rb_rec["bucket"] == "displaced":
                n_cells += 1
                ta = aa.get(ra_rec["pred_path"], "")
                tb = ab.get(rb_rec["pred_path"], "")
                pairs[(shape(ta), shape(tb))] += 1
                dump.append(
                    {
                        "doc": d, "gt_path": gt_path, "pred_path": rb_rec["pred_path"],
                        "a_text": ta, "b_text": tb,
                        "gt_box": rb_rec["gt_box"],
                        "a_box": ra_rec["pred_box"], "b_box": rb_rec["pred_box"],
                    }
                )

    print(f"docs={n_docs}  cells A-grounded & B-displaced = {n_cells}\n")
    print("anchor shape on ALL gradeable cells (background rate):")
    for k in ("md-row", "br-blob", "prose"):
        ta, tb = tot_a[k], tot_b[k]
        sa, sb = sum(tot_a.values()) or 1, sum(tot_b.values()) or 1
        print(f"   {k:9} A {ta:6} ({100*ta/sa:5.1f}%)   B {tb:6} ({100*tb/sb:5.1f}%)")
    with open("/tmp/failing_cells.json", "w") as fh:
        json.dump(dump, fh)
    print(f"\nwrote {len(dump)} failing-cell records -> /tmp/failing_cells.json")
    print("\nanchor shape ON THE FAILING CELLS (A shape -> B shape):")
    for (sa_, sb_), n in pairs.most_common():
        print(f"   {sa_:9} -> {sb_:9}  {n:6}  ({100*n/max(n_cells,1):5.1f}%)")


if __name__ == "__main__":
    main()
