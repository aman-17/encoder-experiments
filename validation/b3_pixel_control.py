"""B3 pixel-information control: pooled-native vs resolution head-to-head.

Joins probe_fit result JSONs for the two qwen35_vit budget mechanisms at each
ladder rung — `qwen35_vit_pooled@<rung>` (native full grids adaptive-pooled,
mechanism "merge"; run pixelcontrol_v1) against `qwen35_vit@<rung>` (the
resolution-knob sweep, run sweep_v1) — and writes the raw per-rung table to
validation/b3_pixel_control.json. Deltas are pooled - resolution on each
head's primary metric; realized token counts ride along because both
mechanisms realize <= the nominal rung. Raw numbers only, no verdict fields
(phase-b-causal.md SSB3 output discipline).

    uv run python validation/b3_pixel_control.py \
        --pooled-dir <dir with <probe>__qwen35_vit_pooled@<rung>.json> \
        --resolution-dir <dir with <probe>__qwen35_vit@<rung>.json>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median

PROBES = ["glyph_id", "cell_row", "cell_col", "pl1_class"]
RUNGS = [64, 100, 144, 196, 256, 400, 576, 784, 1024]


def realized(budget_tokens) -> dict:
    """budget_tokens is an int (all files agree) or a sorted list (variable
    per-image realization); report the raw value plus its median."""
    vals = budget_tokens if isinstance(budget_tokens, list) else [budget_tokens]
    return {"raw": budget_tokens, "median": median(vals)}


def arm_summary(res: dict) -> dict:
    primary = res["primary_metric"]
    heads = {}
    for head, h in res["heads"].items():
        heads[head] = {
            primary: h["real"]["metrics"][primary],
            "ci95": h["real"]["ci95"][primary],
            "shuffled": h["shuffled"]["metrics"][primary],
        }
    return {
        "mechanism": res["mechanism"],
        "knob": res["knob"],
        "realized_tokens": realized(res["budget_tokens"]),
        "n_samples": res["n_samples"],
        "n_test": res["n_test"],
        "n_missing_features": res["n_missing_features"],
        "primary_metric": primary,
        "heads": heads,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--pooled-dir", type=Path, required=True)
    ap.add_argument("--resolution-dir", type=Path, required=True)
    ap.add_argument("--out", type=Path,
                    default=Path(__file__).parent / "b3_pixel_control.json")
    args = ap.parse_args(argv)

    table: dict[str, list[dict]] = {}
    for probe in PROBES:
        rows = []
        for rung in RUNGS:
            pooled_path = args.pooled_dir / f"{probe}__qwen35_vit_pooled@{rung}.json"
            res_path = args.resolution_dir / f"{probe}__qwen35_vit@{rung}.json"
            row: dict = {"rung": rung}
            for key, path in (("pooled_native", pooled_path), ("resolution", res_path)):
                if not path.exists():
                    row[key] = None
                    continue
                res = json.loads(path.read_text())
                if "error" in res:
                    row[key] = {"error": res["error"]}
                    continue
                row[key] = arm_summary(res)
            if (
                isinstance(row["pooled_native"], dict) and "heads" in row["pooled_native"]
                and isinstance(row["resolution"], dict) and "heads" in row["resolution"]
            ):
                primary = row["pooled_native"]["primary_metric"]
                row["delta"] = {
                    head: row["pooled_native"]["heads"][head][primary]
                    - row["resolution"]["heads"][head][primary]
                    for head in row["pooled_native"]["heads"]
                    if head in row["resolution"]["heads"]
                }
            rows.append(row)
        table[probe] = rows

    out = {
        "experiment": "b3_pixel_control",
        "tower": "qwen35_vit",
        "arms": {
            "pooled_native": "native full grids adaptive-avg-pooled to the rung "
                             "(mechanism merge; captured-then-discarded)",
            "resolution": "pixel-budget knob at extraction (mechanism resolution; "
                          "never-captured)",
        },
        "delta_definition": "pooled_native - resolution on the primary metric, per head",
        "fit": {"runs": ["pixelcontrol_v1", "sweep_v1"], "split": "document",
                "train_frac": 0.8, "split_seed": 0},
        "probes": table,
    }
    args.out.write_text(json.dumps(out, indent=2) + "\n")
    print(f"[b3] wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
