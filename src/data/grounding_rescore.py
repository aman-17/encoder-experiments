"""Re-score a run's saved outputs against a (possibly different) GT snapshot.

Same metric, same alignment as the real scorer -- just fed predictions from one
place and test_rules from another. Lets you ask "what would run A have scored if
it had been graded against today's ground truth?" without re-running inference.

Usage:
  uv run python tools/grounding_rescore.py <results_dir> <gt_dir> [--doclist f] [--out csv]

<results_dir> holds <fam>/<doc>.result.json, <gt_dir> holds <fam>/<doc>.{test.json,pdf}.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from llamacloud_bench.evaluation.metrics.extract import unified_evidence_metric as U
from llamacloud_bench.test_cases.loader import load_test_case

WANT = (
    "extract_unified_grounded_f1",
    "extract_unified_page_f1",
    "extract_unified_value_f1",
)


def score_one(result_path: Path, test_path: Path) -> dict[str, float] | None:
    res = json.load(open(result_path))
    out = res.get("output") or {}
    extracted = out.get("extracted_data")
    if extracted is None:
        return None
    citations = out.get("field_citations") or []
    pdf = test_path.parent / test_path.name.replace(".test.json", ".pdf")
    tc = load_test_case(pdf, test_path)
    metrics = U.compute_unified_evidence_metrics(
        expected_output=tc.expected_output,
        extracted_data=extracted,
        field_rules=tc.get_extract_field_rules(),
        field_citations=citations,
        data_schema=tc.data_schema,
    )
    by = {m.metric_name: m.value for m in metrics}
    return {k: by.get(k) for k in WANT}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("results_dir")
    ap.add_argument("gt_dir")
    ap.add_argument("--doclist", help="file of <fam>/<doc> lines; default = glob results_dir")
    ap.add_argument("--out", help="write per-doc csv here")
    a = ap.parse_args()

    rd, gd = Path(a.results_dir), Path(a.gt_dir)
    if a.doclist:
        docs = [ln.strip() for ln in open(a.doclist) if ln.strip()]
    else:
        docs = sorted(str(p.relative_to(rd))[: -len(".result.json")] for p in rd.rglob("*.result.json"))

    rows, skipped = [], []
    for d in docs:
        rp, tp = rd / f"{d}.result.json", gd / f"{d}.test.json"
        if not rp.exists() or not tp.exists():
            skipped.append((d, "missing file"))
            continue
        try:
            m = score_one(rp, tp)
        except Exception as e:  # noqa: BLE001
            skipped.append((d, f"{type(e).__name__}: {e}"))
            continue
        if m is None or m["extract_unified_grounded_f1"] is None:
            skipped.append((d, "no grounded metric"))
            continue
        rows.append({"test_id": d, **m})

    if not rows:
        print("no docs scored", file=sys.stderr)
        sys.exit(1)

    for k in WANT:
        vals = [r[k] for r in rows if r[k] is not None]
        print(f"{k:34} n={len(vals):>4}  mean={sum(vals) / len(vals):.4f}")
    print(f"scored {len(rows)}, skipped {len(skipped)}")
    for d, why in skipped[:10]:
        print(f"   skip {d}: {why}")

    if a.out:
        with open(a.out, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["test_id", *WANT])
            w.writeheader()
            w.writerows(rows)
        print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
