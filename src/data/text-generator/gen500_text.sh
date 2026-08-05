#!/bin/zsh
# Render 500 dense-text training docs: 10 families x 50 seeds (101-150).
set -e
cd "$(dirname "$0")"
OUT="$HOME/Desktop/synthetic_dense_text_v1"
mkdir -p "$OUT"
tpls=($(ls templates_text/*.mjs | sed 's|.*/||;s|\.mjs||' | sort))
echo "families: $#tpls"
jobs=""
for t in $tpls; do
  for s in $(seq 101 150); do jobs+="$t $s\n"; done
done
echo "rendering $(printf "$jobs" | wc -l | tr -d ' ') docs -> $OUT"
printf "$jobs" | xargs -P 6 -L 1 zsh -c 'node render.mjs templates_text/$0.mjs $1 "'"$OUT"'" > /dev/null 2>&1 || echo "FAIL $0 seed $1"'
rm -f "$OUT"/*__p*.png
echo "pdfs: $(ls "$OUT" | grep -c '\.pdf$')  test.jsons: $(ls "$OUT" | grep -c '\.test\.json$')"
