# Pilot v1 results — FINAL (64/64 pairs, 2026-08-13)

1,000 docs / 1,420 images / 288,329 probe samples / 8 probe families ×
8 encoder variants. Linear + MLP heads, shuffled-label controls, doc-level
splits, bootstrap CIs. Per-pair JSONs: Modal volume `/vol/results/pilot_v1/`.

## Linear-head table (primary)

| probe (chance)               | CLIP  | CLIP-rnd | SigLIP2 | SigL-rnd | NaFlex | SAM   | Qwen-ViT | DeepSeek |
|------------------------------|-------|----------|---------|----------|--------|-------|----------|----------|
| glyph_id, 81-way (.04)       | .062  | .061     | .122    | .070     | .185   | .079  | **.466** | .065     |
| cell_row (.05)               | .094  | .070     | .163    | .087     | .167   | .144  | **.200** | .142     |
| cell_col (.14)               | .331  | .191     | .359    | .156     | .387   | .410  | **.493** | .282     |
| series_id (.28)              | .384  | .397     | .388    | .371     | .414   | .398  | **.533** | .342     |
| point_value R² (floor −.61)  | −.68  | −1.16    | −.82    | −1.55    | −.82   | −.50  | −.93     | −.91     |
| pl1_class (.57)              | .683  | .577     | .777    | .600     | .794   | .763  | **.831** | .732     |
| pl2_extent mIoU (.01)        | .042  | .013     | .070    | .013     | .079   | **.165** | .055  | .096     |
| pl3_summary R² (floor −2.8)  | −.41  | .01      | .06     | −.48     | .08    | .28   | .41      | **.43**  |

MLP heads track linear (same ranking) with two notable lifts: Qwen glyph
.466→**.528**, and pl3 for everyone (.51–.64) — page-layout summary is present
but stored *nonlinearly* in most towers.

## Findings

1. **Qwen3.5's tower (production, A3) wins everything symbolic** — glyphs
   (.466, 2.5× the best public tower), cell indexing, chart series binding
   (.533 vs .41 next), layout class (.831). Native resolution + OCR-adjacent
   pretraining compound.
2. **…but NOT extent.** SAM leads element-extent IoU at .165 — 3× Qwen (.055);
   even DeepSeek (.096) beats Qwen there. The **double dissociation** is the
   paper thesis in one table: symbol identity and spatial extent are stored by
   *different* pretraining objectives; no tower wins both. Encoder choice is a
   capability trade, not a ranking.
3. **CLIP ≈ random-init CLIP on two families** — glyphs (.062 vs .061) and
   series-ID (.384 vs .397). At 336px, CLIP's 400M-pair pretraining adds
   ~nothing beyond a random projection for fine document content (its only
   clear learned signal is layout class, .683 vs .577). Series-ID ≈ color
   readout: random projections preserve color, so most towers cluster at
   .34–.41; Qwen's .533 means it binds series beyond color (markers/dash
   patterns).
4. **Resolution handling is the cleanest causal contrast**: same-lineage A1→A2
   (SigLIP2 fixed → NaFlex) lifts glyphs .122→.185 and cell_col .359→.387.
5. **DeepSeek's 256-token global view: gist survives, detail doesn't.** Near-
   floor on glyphs (.065) but **best-in-table pl3 layout summary** (R² .43) —
   its 16× compression is tuned to keep page-level structure while character
   identity rides on its (unprobed) crop path.
6. **Layout localization is robust to scan degradation**: pl1 accuracy is FLAT
   across severities for every tower (Qwen .819–.874 over sev 0→3b). Noise
   destroys high-frequency content (glyphs) long before low-frequency layout —
   though glyph-vs-severity itself is still an open measurement (below).

## Caveats

- **point_value R² < 0 for all towers, both heads** — probe design review
  needed (per-axis target normalization) before reading it as "values absent".
- **glyph probes are clean-pages-only** (no degraded text-layer GT in pilot) —
  the glyph-vs-severity curve, likely the most damage-sensitive one, is not
  yet measured.
- **DeepSeek measured on its global 1024px view only** (production adds tiled
  crops). **sam_vit_b__rand excluded** (exact-zero features at random init).
- Severity slices partially confound with doc mix (only era-font docs were
  degraded); scale-up should degrade a stratified sample instead.
- pl1's chance floor is high (.57, background-heavy); read margins over floor.
- Corpus skews: bar-family chart types; no degraded replicator pages; bbox
  difficulty tags saturate (Data.md calibration note).

## Ops notes (for the 10k run)

- Extraction: fp32 compute mandatory (bf16 per-token divergence), `--detach`
  mandatory, features fp16 on volume (~45 GB for this pilot).
- Fitting: CPU containers (16 core) — sklearn-bound, schedules instantly, and
  avoids the shared-workspace L40S queue where pending apps got CLI-stopped.
- Repro commands: see README "Modal" section; probes via `probe_sampler` on
  `data/pilot_1k/images.jsonl`.
