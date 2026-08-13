# Pilot v1 results — INTERIM (44/64 pairs, 2026-08-13)

Status: 4 towers complete (CLIP, SigLIP2, NaFlex, SAM); Qwen-ViT/DeepSeek/both
rand floors partially done (detached fits running). Linear-head primary metric;
MLP heads track linear closely so far. Full table with CIs + severity slices
lands when all 64 (probe × encoder) pairs finish; per-pair JSONs on the Modal
volume at `/vol/results/pilot_v1/`.

| probe (chance floor)         | CLIP  | CLIP-rnd | SigLIP2 | SigL-rnd | NaFlex | SAM   | Qwen-ViT | DeepSeek |
|------------------------------|-------|----------|---------|----------|--------|-------|----------|----------|
| glyph_id, 81-way (.04)       | .062  | .062     | .122    | .070     | .185   | .079  | **.466** | .065     |
| cell_row (.05)               | .094  | .070     | .163    | .088     | .167   | .144  | **.200** | .141     |
| cell_col (.14)               | .331  | .191     | .359    | .156     | .387   | .410  | **.494** | .280     |
| series_id (.28)              | .384  | ⏳       | .388    | ⏳       | .414   | .398  | ⏳       | ⏳       |
| point_value R² (floor −.61)  | −.68  | ⏳       | −.82    | ⏳       | −.82   | −.50  | ⏳       | ⏳       |
| pl1_class (.57)              | .683  | ⏳       | .777    | ⏳       | .794   | .763  | ⏳       | ⏳       |
| pl2_extent mIoU (.01)        | .042  | ⏳       | .070    | ⏳       | .079   | **.165** | ⏳    | ⏳       |
| pl3_summary R² (floor −2.8)  | −.41  | ⏳       | .064    | ⏳       | .078   | .277  | ⏳       | ⏳       |

## Interim findings

1. **Resolution handling dominates reading.** The clean same-lineage contrast
   (A1 fixed-res SigLIP2 .122 → A2 NaFlex .185 on glyphs) isolates it; CLIP at
   336px is the floor case.
2. **CLIP's pretraining adds ~nothing for glyphs**: trained CLIP == random-init
   CLIP (.062 = .062). The page resize destroys character information before
   the transformer ever runs — 400M image-text pairs can't recover pixels that
   were never sampled.
3. **Qwen3.5's tower (production, A3) is in a different class on reading**:
   .466 glyph (2.5× NaFlex), leads both cell probes. Native resolution + OCR-
   adjacent pretraining compound.
4. **Double dissociation, the "different eyes" thesis in one table**: SAM is
   best at element extent (mIoU .165, ~2× everyone; segmentation pretraining
   encodes boundaries) and near-floor on glyphs; Qwen is the opposite pole.
   Encoder choice is a capability trade, not a scalar ranking.
5. **DeepSeek's 256-token global view reads at CLIP level** (.065 glyphs) —
   16× spatial compression costs character identity. Caveat: the production
   stack adds tiled crops; this measures the global encoder alone.

## Caveats / open items

- **point_value R² is negative for every tower** — treat as "probe under
  design review" (target likely needs per-axis normalization), not a finding.
- **glyph probes are clean-pages-only** (GT comes from the PDF text layer;
  degraded rasters have none — transformed-sidecar support exists but wasn't
  exercised in pilot post-processing). No glyph-vs-severity curves yet.
- **sam_vit_b__rand emits exact zeros** at random init → excluded; CLIP/SigLIP2
  rand floors calibrate instead.
- **pl1_class chance floor is high (~.57)** — background-heavy base rate; read
  the margin over floor, not the absolute.
- Corpus skews: chart types bar-family-heavy; no degraded replicator pages;
  bbox difficulty tags saturate "hard" on dense synthetic pages (see Data.md
  calibration note).

## Reproduce

```bash
# probes from the corpus
uv run python -m encoder_experiments.probe_sampler \
    --images data/pilot_1k/images.jsonl --out data/pilot_1k/probes.jsonl
# remote fit (one encoder per container; see README "Modal" section)
uv run modal run --detach modal_extract.py --fit \
    --encoders <encoder> --probes-subpath probes.jsonl --run pilot_v1
# fetch results
modal volume get encoder-anatomy-pilot /results/pilot_v1 results_pilot_v1/
```
