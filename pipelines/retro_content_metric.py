"""Retro-score the §R5 content-normalized metric over EXISTING local eval
outputs (docs/experiments.md §R5 readout 2) — no volume fetch, no rewrite of
the frozen *_scores dirs.

Reads validation/phaseb_eval/<arm>/<image_id>.md for each arm against the
pilot_1k gold (data/pilot_1k, images_phaseb_eval.jsonl — exactly how
modal_phaseb_train._score_local located it) and computes
frontier_score.content_edit_sim per doc: gold-markdown docs only (the chart
docs without a .gold.md sidecar are excluded and counted), missing
predictions score 0.0.

Writes validation/content_metric_retro.json:
  - arms.<arm>.overall / .families.<family> — raw per-arm mean with a
    percentile doc-bootstrap CI (2000 resamples, seed 0 — same discipline as
    b2_pilot.json's contrasts; text/math are the co-primary families),
  - contrasts.<X>-<Y> — doc-paired bootstrap contrasts for every arm pair
    (modal_phaseb_train.contrast_block on the content_edit_sim field),
  - n_docs / n_missing_pred / n_no_content_gold per arm.

    uv run python pipelines/retro_content_metric.py [--arms A,B,...]
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

import numpy as np

from encoder_experiments.frontier_score import (
    content_edit_sim,
    gold_skip_reason,
    load_gold,
    load_images_jsonl,
)
from modal_phaseb_train import contrast_block

REPO = Path(__file__).resolve().parents[1]
DEFAULT_ARMS = ("A", "B", "C", "R4a_0.1", "R4a_1", "R4b_0.1", "R4b_1")
N_BOOT = 2000
SEED = 0
FAMILY_ORDER = ["text", "math", "tables", "replicator", "charts"]  # co-primary first


def bootstrap_mean(values: list[float], n_boot: int = N_BOOT, seed: int = SEED) -> dict:
    """Percentile doc-bootstrap CI of the raw mean (contrasts' twin, unpaired)."""
    v = np.asarray(values, dtype=np.float64)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(v), size=(n_boot, len(v)))
    boots = v[idx].mean(axis=1)
    return {
        "n_docs": int(len(v)),
        "mean": round(float(v.mean()), 6),
        "ci95_lo": round(float(np.quantile(boots, 0.025)), 6),
        "ci95_hi": round(float(np.quantile(boots, 0.975)), 6),
    }


def score_arm(pred_dir: Path, rows: list[dict], dataset_root: Path) -> tuple[dict, dict]:
    """(arm block, {image_id: record}) — records shaped like frontier_score
    scores.jsonl rows so contrast_block pairs them by the content field."""
    recs: dict[str, dict] = {}
    n_missing = 0
    n_no_content_gold = 0
    for row in rows:  # already image_id-sorted by load_images_jsonl
        try:
            gold = load_gold(dataset_root, row["generator"], row["doc_id"])
        except FileNotFoundError:
            continue
        if gold_skip_reason(gold) is not None:
            continue
        if gold.markdown is None:  # chart docs without a .gold.md sidecar
            n_no_content_gold += 1
            continue
        pred_path = pred_dir / f"{row['image_id']}.md"
        if pred_path.exists():
            pred_md = pred_path.read_text()
        else:
            pred_md = ""
            n_missing += 1
        recs[row["image_id"]] = {
            "family": row["generator"],
            "content_edit_sim": round(content_edit_sim(pred_md, gold.markdown), 6),
        }
    by_family: dict[str, list[float]] = {}
    for rec in recs.values():
        by_family.setdefault(rec["family"], []).append(rec["content_edit_sim"])
    fams = sorted(by_family, key=lambda g: (FAMILY_ORDER.index(g) if g in FAMILY_ORDER else 99, g))
    block = {
        "n_docs": len(recs),
        "n_missing_pred": n_missing,
        "n_no_content_gold": n_no_content_gold,
        "overall": bootstrap_mean([r["content_edit_sim"] for r in recs.values()]),
        "families": {g: bootstrap_mean(by_family[g]) for g in fams},
    }
    return block, recs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--arms", default=",".join(DEFAULT_ARMS),
                    help="comma-separated pred-dir names under validation/phaseb_eval")
    ap.add_argument("--out", type=Path,
                    default=REPO / "validation" / "content_metric_retro.json")
    args = ap.parse_args(argv)

    dataset_root = REPO / "data" / "pilot_1k"
    rows = load_images_jsonl(dataset_root / "images_phaseb_eval.jsonl")
    eval_root = REPO / "validation" / "phaseb_eval"

    arm_blocks: dict[str, dict] = {}
    arm_recs: dict[str, dict] = {}
    for arm in [a for a in args.arms.split(",") if a]:
        block, recs = score_arm(eval_root / arm, rows, dataset_root)
        arm_blocks[arm] = block
        arm_recs[arm] = recs
        fams = block["families"]
        print(f"[retro] {arm}: overall {block['overall']['mean']:.4f}  "
              + "  ".join(f"{g} {fams[g]['mean']:.4f}" for g in ("text", "math") if g in fams)
              + (f"  (missing_pred {block['n_missing_pred']})" if block["n_missing_pred"] else ""))

    contrasts = {
        f"{a}-{b}": contrast_block(arm_recs[a], arm_recs[b],
                                   n_boot=N_BOOT, seed=SEED, key="content_edit_sim")
        for a, b in combinations(arm_recs, 2)
    }

    out = {
        "experiment": "R5-retro",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "metric": "content_edit_sim",
        "normalization": "frontier_score.content_normalize",
        "primary_readout": ["text", "math"],
        "eval_images": "data/pilot_1k/images_phaseb_eval.jsonl",
        "arms": arm_blocks,
        "contrasts": contrasts,
        "bootstrap": {"n_resamples": N_BOOT, "unit": "document", "seed": SEED},
    }
    args.out.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
    print(f"[retro] wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
