#!/usr/bin/env bash
# One full 4-dim ParseBench eval per vision-token-budget rung, all off ONE physical export.
#
#   ./sweep_parsebench_budget.sh [--rungs b512,b1024,native,...] [--export parsebench__<dir>]
#                                [--version <params>] [--datasets a,b] [--dry-run]
#
# Each rung is the training pipeline's own `eval_recipe.sh` in merge-free `--export-name` mode:
# same recipe adapter, same prompt, same genuine parse_bench scorers. The ONLY difference between
# rungs is the vision token budget — `PB_MM_SIZE` (serve-side: same render, fewer/more merged
# tokens) and `PB_RENDER_DPI` (client-side: more pixels). `PARSEBENCH_WEIGHTS_FROM` lets every rung
# read the one export while keying its artifacts under its own run name, so no arm overwrites
# another and we don't copy 8GB per rung.
#
# The rung ladder itself lives in modal_parsebench_budget.py (RUNGS) and is read from there — this
# script never restates a budget. Runs SEQUENTIALLY: each rung holds a 16-replica H200 serve fleet
# for a few minutes, and serialising keeps that at one fleet at a time.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(cd "$HERE/../../ocr_postraining/training/training_pipeline" && pwd)"
LOG_DIR="${LOG_DIR:-$HERE/../validation/parsebench_budget_logs}"

# v14 rather than a longer sibling purely for the app-name budget below: every params version in
# this family resolves to the SAME eval-relevant knobs (MODEL/tokenizer, PROMPT_FILE, SERVE_IMAGE,
# GPU, chat-template kwargs), and only the trainer-side reward config differs.
RUNGS=""; EXPORT=""; VERSION="v14"; DATASETS=""; DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rungs)    RUNGS="${2:-}"; shift 2;;
    --export)   EXPORT="${2:-}"; shift 2;;
    --version)  VERSION="${2:-}"; shift 2;;
    --datasets) DATASETS="${2:-}"; shift 2;;
    --dry-run)  DRY=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

# RUNGS/EXPORT/keys come from the python module (single source of truth for the ladder).
spec() { (cd "$HERE" && uv run python -c "
import json, sys
import modal_parsebench_budget as M
rungs = [r for r in (sys.argv[1] or ','.join(M.RUNGS)).split(',') if r]
export = sys.argv[2] or M.EXPORT
unknown = [r for r in rungs if r not in M.RUNGS]
if unknown: raise SystemExit(f'unknown rungs {unknown}')
for r in rungs:
    s = M.RUNGS[r]
    size = json.dumps({'size': s['size']}, separators=(',', ':')) if s['size'] else ''
    # '|' not tab: tab is an IFS *whitespace* char, so bash's read collapses the empty
    # native-size field into its neighbour and every rung after it shifts.
    print('|'.join([r, M.run_key(r, export), export, size, str(s['dpi'] or M.RENDER_DPI)]))
" "$RUNGS" "$EXPORT"); }

mkdir -p "$LOG_DIR"
SPECS="$(spec)"
echo "[sweep] rungs:"; echo "$SPECS" | awk -F'|' '{printf "  %-9s key=%-28s dpi=%-4s size=%s\n", $1, $2, $5, ($4==""?"(native)":$4)}'

# Modal caps app names at 63 chars and serve.py/eval_recipe.sh both TRUNCATE to fit. The rung lives
# at the tail of that name, so an over-long recipe+version would silently collapse every rung onto
# one serve app — arms sharing a fleet, with nothing in the logs to say so. Refuse instead.
apps=""
while IFS='|' read -r rung key _ _ _; do
  [[ -n "$rung" ]] || continue
  full="ocr-rl-pbserve-dataprep-qwen35-4b-os-${VERSION}-${key//_/-}"
  apps+="${full:0:63}"$'\n'
done <<< "$SPECS"
if [[ "$(echo "$apps" | sort -u | grep -c .)" != "$(echo "$apps" | grep -c .)" ]]; then
  echo "error: serve app names collide after Modal's 63-char truncation:" >&2
  echo "$apps" | sort | uniq -d >&2
  echo "shorten --version or the export name" >&2
  exit 1
fi

while IFS='|' read -r rung key export size dpi; do
  [[ -n "$rung" ]] || continue
  log="$LOG_DIR/${key}.log"
  echo "[sweep] === $rung -> $key (log: $log) ==="
  cmd=("$PIPELINE_DIR/eval_recipe.sh" --recipe dataprep_qwen35_4b_os --version "$VERSION"
       --export-name "parsebench__${key}" --no-stage)
  [[ -n "$DATASETS" ]] && cmd+=(--datasets "$DATASETS")
  env=(PARSEBENCH_WEIGHTS_FROM="$export" PB_MM_SIZE="$size" PB_RENDER_DPI="$dpi")
  if [[ "$DRY" == "1" ]]; then
    echo "  ${env[*]} ${cmd[*]}"
    continue
  fi
  ( cd "$PIPELINE_DIR" && env "${env[@]}" "${cmd[@]}" ) 2>&1 | tee "$log"
  echo "[sweep] $rung done"
done <<< "$SPECS"

echo "[sweep] all rungs done — collect with:"
echo "  (cd $HERE && uv run modal run modal_parsebench_budget.py --collect)"
