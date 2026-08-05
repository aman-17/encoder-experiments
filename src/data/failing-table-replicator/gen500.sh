#!/bin/zsh
# Render 500 training docs from the diversified templates.
# 24 templates x 15 seeds + 10 templates x 14 seeds = 500. Seeds start at 101
# (replica/preview used 1-2, diversify check used 101-103 — same template+seed
# is deterministic so re-rendering 101-103 here is idempotent, not duplication).
set -e
cd "$(dirname "$0")"
OUT="$HOME/Desktop/synthetic_failing_tables_v1"
mkdir -p "$OUT"
tpls=($(ls templates/*.mjs | sed 's|.*/||;s|\.mjs||' | sort))
i=0
jobs=""
for t in $tpls; do
  n=$(( i < 24 ? 15 : 14 ))
  for s in $(seq 101 $((100 + n))); do
    jobs+="$t $s\n"
  done
  i=$((i + 1))
done
echo "rendering $(printf "$jobs" | wc -l | tr -d ' ') docs -> $OUT"
printf "$jobs" | xargs -P 6 -L 1 zsh -c 'node render.mjs templates/$0.mjs $1 "'"$OUT"'" > /dev/null 2>&1 || echo "FAIL $0 seed $1"'
# drop per-page verification thumbnails — dataset stays <id>.pdf + <id>.test.json + <id>.cells.json
rm -f "$OUT"/*__p*.png
echo "pdfs: $(ls "$OUT" | grep -c '\.pdf$')  test.jsons: $(ls "$OUT" | grep -c '\.test\.json$')"
