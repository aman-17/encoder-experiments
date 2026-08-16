"""B1 assembler: score the patching conditions and compute restoration
fractions (phase-b-causal.md §B1). Raw numbers only — no conclusion prose.

Reads a local copy of the Modal output tree (fetch with
``uv run modal volume get encoder-anatomy-pilot /patch_b1 <pred-root>``),
scores every condition directory with frontier_score.score_pred_dir against
the twin manifest gold (edit-sim; the twins are text/math only), then:

- restoration fraction (patched − floor)/(anchor − floor) with a paired
  doc-bootstrap CI for patch_s2, patch_s3 and the mismatched-page control,
  each on the docs present in anchor ∩ floor ∩ that condition;
- self-patch no-op control: fraction of pairs whose control_selfpatch output
  is byte-identical to the anchor output, plus the per-doc |score| deltas.

Writes validation/b1_patching.json.

    uv run python run_b1_patching.py --pred-root <dir with condition subdirs>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from encoder_experiments.frontier_score import score_pred_dir
from encoder_experiments.patching import CONDITIONS, bootstrap_restoration

PATCHED_CONDITIONS = ("patch_s2", "patch_s3", "control_mismatch")


def _condition_scores(pred_root: Path, images_jsonl: Path, out_dir: Path) -> dict:
    """{condition: {image_id: score}} for every condition dir present, scored
    by the frontier scorer (missing predictions are excluded from pairing,
    not scored 0 — a pair that failed on Modal drops out of the contrast)."""
    per_cond: dict[str, dict[str, float]] = {}
    for cond in CONDITIONS:
        cond_dir = pred_root / cond
        if not cond_dir.is_dir():
            continue
        score_pred_dir(cond_dir, images_jsonl, out_dir / cond, only_preds=False)
        scores = {}
        for line in (out_dir / cond / "scores.jsonl").read_text().splitlines():
            rec = json.loads(line)
            if rec["metric"] != "missing_pred":
                scores[rec["image_id"]] = rec["score"]
        per_cond[cond] = scores
    return per_cond


def _paired(per_cond: dict, conds: tuple[str, ...]) -> list[str]:
    ids = set(per_cond.get(conds[0], {}))
    for c in conds[1:]:
        ids &= set(per_cond.get(c, {}))
    return sorted(ids)


def _selfpatch_control(pred_root: Path, per_cond: dict) -> dict:
    ids = _paired(per_cond, ("anchor", "control_selfpatch"))
    identical = []
    deltas = []
    for image_id in ids:
        a = (pred_root / "anchor" / f"{image_id}.md")
        s = (pred_root / "control_selfpatch" / f"{image_id}.md")
        identical.append(a.read_text() == s.read_text())
        deltas.append(abs(per_cond["control_selfpatch"][image_id]
                          - per_cond["anchor"][image_id]))
    return {
        "n_docs": len(ids),
        "identical_output_fraction": (
            round(sum(identical) / len(ids), 6) if ids else None
        ),
        "score_abs_delta_mean": round(sum(deltas) / len(ids), 6) if ids else None,
        "score_abs_delta_max": round(max(deltas), 6) if deltas else None,
    }


def assemble(pred_root: Path, images_jsonl: Path, out_path: Path,
             n_boot: int, seed: int) -> dict:
    score_dir = pred_root / "_scores"
    per_cond = _condition_scores(pred_root, images_jsonl, score_dir)
    if "anchor" not in per_cond or "floor" not in per_cond:
        raise SystemExit(f"{pred_root}: need anchor/ and floor/ condition dirs")

    conditions = {}
    for cond, scores in per_cond.items():
        vals = list(scores.values())
        conditions[cond] = {
            "n_docs": len(vals),
            "mean": round(sum(vals) / len(vals), 6) if vals else None,
            "per_doc": {k: round(v, 6) for k, v in sorted(scores.items())},
        }

    restoration = {}
    for cond in PATCHED_CONDITIONS:
        if cond not in per_cond:
            continue
        ids = _paired(per_cond, ("anchor", "floor", cond))
        restoration[cond] = bootstrap_restoration(
            [per_cond["anchor"][i] for i in ids],
            [per_cond["floor"][i] for i in ids],
            [per_cond[cond][i] for i in ids],
            n_boot=n_boot, seed=seed,
        )

    result = {
        "experiment": "b1_activation_patching",
        "metric": "frontier_score edit_sim (text/math twins)",
        "images": str(images_jsonl),
        "pred_root": str(pred_root),
        "bootstrap": {"n_boot": n_boot, "seed": seed},
        "conditions": conditions,
        "restoration": restoration,
        "controls": {
            "selfpatch": (
                _selfpatch_control(pred_root, per_cond)
                if "control_selfpatch" in per_cond else None
            ),
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return result


def main() -> int:
    root = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--pred-root", type=Path, required=True,
                    help="local dir holding the <condition>/<image_id>.md tree")
    ap.add_argument("--images", type=Path,
                    default=root / "data" / "pilot_1k" / "images_twins_b1.jsonl")
    ap.add_argument("--out", type=Path, default=root / "validation" / "b1_patching.json")
    ap.add_argument("--n-boot", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    result = assemble(args.pred_root, args.images, args.out, args.n_boot, args.seed)
    brief = {c: {k: v for k, v in r.items() if k != "per_doc"}
             for c, r in result["conditions"].items()}
    print(json.dumps({"conditions": brief,
                      "restoration": result["restoration"],
                      "controls": result["controls"]}, indent=2, sort_keys=True))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
