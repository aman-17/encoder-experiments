# Measurement record

> **Paper-scope banner (2026-08-15).** The project pivoted to the bridge-repair
> paper ([ideas.md](ideas.md)). **Nothing in this file is deleted or amended by
> that decision** — it is the measurement record, refuted findings included, and
> it stays complete. What changed is which parts appear in the submission:
>
> | section | paper role |
> |---|---|
> | Exp 2a bridge localization (bottom) | **§3 — the diagnosis. The paper's core.** |
> | glyph_id + pl1_class rows, everywhere | **kept** — headline signal + specificity contrast |
> | Measurement-validity addendum | **appendix** — validity section, re-scoped to those two |
> | Survival curves / budget sweep | one motivation figure |
> | Task frontier (eyes-vs-brain inversion) | intro framing sentence, not a results section |
> | point_value, pl2_extent, pl3, cell_row/col | appendix table; not reported as findings |
> | CLIP / SigLIP2 / NaFlex / SAM + rand floors | one appendix table |
>
> Demotion is a scope decision, not a retraction. If gate G1
> ([phase-b-causal.md](phase-b-causal.md) §B2) fails, the survival-curve framing
> returns as a TMLR submission and most of this file is promoted back.
>
> **Inline tags (added 2026-08-15).** Every item below is marked for the
> bridge-repair paper:
>
> - `[UNNECESSARY]` — not needed for this paper. Do not spend time on it, do not
>   re-run it, do not write it up. Kept here as record only.
> - `[APPENDIX]` — not a finding, but reviewers will ask; it ships in the
>   supplementary.
> - `[KEEP]` — load-bearing for the submission.
>
> Untagged prose is scaffolding for whichever tagged item it sits under.

---

# Pilot v1 results — FINAL (64/64 pairs, 2026-08-13)

> **Budget-sweep addendum (2026-08-14, 448/448 pairs): see "Survival curves"
> section at the bottom — the signature figure is
> [figures/survival_pilot1k.png](figures/survival_pilot1k.png).**

1,000 docs / 1,420 images / 288,329 probe samples / 8 probe families ×
8 encoder variants. Linear + MLP heads, shuffled-label controls, doc-level
splits, bootstrap CIs. Per-pair JSONs: Modal volume `/vol/results/pilot_v1/`.

## Linear-head table (primary)

Column scope: **Qwen-ViT `[KEEP]`** (the stack being repaired) and **DeepSeek
`[KEEP]`** (compressed-bridge contrast) carry the paper. CLIP / CLIP-rnd /
SigLIP2 / SigL-rnd / NaFlex / SAM are **`[APPENDIX]`** — one table, no findings.

| probe (chance) | tag | CLIP  | CLIP-rnd | SigLIP2 | SigL-rnd | NaFlex | SAM   | Qwen-ViT | DeepSeek |
|---|---|-------|----------|---------|----------|--------|-------|----------|----------|
| glyph_id, 81-way (.04) | **`[KEEP]`** — headline signal; the repair target | .062  | .061     | .122    | .070     | .185   | .079  | **.466** | .065     |
| pl1_class (.57) | **`[KEEP]`** — specificity contrast (H4: must stay flat under repair) | .683  | .577     | .777    | .600     | .794   | .763  | **.831** | .732     |
| cell_row (.05) | `[UNNECESSARY]` — 1.9× floor, demoted | .094  | .070     | .163    | .087     | .167   | .144  | **.200** | .142     |
| cell_col (.14) | `[UNNECESSARY]` — largely an x-coordinate readout (.376 shortcut) | .331  | .191     | .359    | .156     | .387   | .410  | **.493** | .282     |
| series_id (.28) | `[UNNECESSARY]` — floor was wrong; real margin +.036, counterfactuals never run | .384  | .397     | .388    | .371     | .414   | .398  | **.533** | .342     |
| point_value R² (floor −.61) | `[UNNECESSARY]` — **broken probe**, negative R² everywhere, both heads. Never report | −.68  | −1.16    | −.82    | −1.55    | −.82   | −.50  | −.93     | −.91     |
| pl2_extent mIoU (.01) | `[UNNECESSARY]` — **refuted**; coord prior (.235) beats every tower | .042  | .013     | .070    | .013     | .079   | **.165** | .055  | .096     |
| pl3_summary R² (floor −2.8) | `[UNNECESSARY]` — page gist, not topology; demoted before the pivot | −.41  | .01      | .06     | −.48     | .08    | .28   | .41      | **.43**  |

MLP heads track linear (same ranking) with two notable lifts: Qwen glyph
.466→**.528** `[KEEP]`, and pl3 for everyone (.51–.64) `[UNNECESSARY]` —
page-layout summary is present but stored *nonlinearly* in most towers.

## Findings

1. **`[KEEP]` (glyph + pl1 clauses only; the cell/series clauses are
   `[UNNECESSARY]`)** — **Qwen3.5's tower (production, A3) has the strongest
   probe-recoverable
   fine-grained symbolic content among the evaluated towers** — glyphs (.466,
   2.5× the best public tower), cell indexing, chart series binding, layout
   class (.831). Native resolution + OCR-adjacent pretraining compound.
   *(Validity addendum below: cell_col and series margins shrink
   substantially against the measured shortcut floors; glyph and pl1
   survive.)*
2. `[UNNECESSARY]` — **refuted by our own refit; do not write this up.**
   **…while SAM retains substantially better spatial-extent readout** (.165
   vs Qwen .055; DeepSeek .096). *(REFUTED by the [features ⊕ coords] refit,
   2026-08-15: no tower's features add anything over the coordinate prior —
   SAM Δ −.001, best Δ +.004, prior alone .235 mIoU. The pl2 column measured
   how linearly each tower encodes position, not extent retention; the
   SAM-vs-Qwen "double dissociation" does not survive. Extent claims await a
   redesigned probe — see measurement-validation.md.)*
3. `[APPENDIX]` — a probe-validity signal, not a finding about CLIP; CLIP is
   not in the paper. **CLIP ≈ random-init CLIP on two families** — glyphs (.062 vs .061) and
   series-ID (.384 vs .397): under these probes, at 336px, on this corpus,
   learned CLIP features do not outperform the random-init control for fine
   document content (its only clear learned margin is layout class, .683 vs
   .577). Series-ID numbers must be read against the corrected floor
   (addendum): most towers sit at or below bias-only accuracy; palette
   randomization in the generators means a global color→series shortcut
   does not exist in this corpus, so what remains after the multi-series
   refit is candidate binding signal — counterfactual (color-permutation)
   evidence is still required before any binding claim.
4. `[UNNECESSARY]` — SigLIP2 lineage is out of scope; the causal contrast in
   this paper is site-wise (S1/S2/S3), not cross-tower.
   **Resolution handling is the cleanest causal contrast**: same-lineage A1→A2
   (SigLIP2 fixed → NaFlex) lifts glyphs .122→.185 and cell_col .359→.387.
5. `[APPENDIX]` — the glyph-at-floor half supports the compressed-bridge
   contrast; the pl3 half is `[UNNECESSARY]`.
   **DeepSeek's 256-token global view: gist survives, detail doesn't.** At
   the majority floor on glyphs (.065 vs .091 floor) but **best-in-table pl3
   layout-category-presence summary** (R² .43; "pl3 layout summary" is
   renamed — it measures page gist, per-class presence + counts, not layout
   topology) — its 16× compression keeps page-level structure while
   character identity rides on its (unprobed) crop path.
6. `[APPENDIX]` — degradation robustness is B1's *instrument*, not a result of
   this paper. **Layout localization is robust to scan degradation**: pl1 accuracy is FLAT
   across severities for every tower (Qwen .819–.874 over sev 0→3b). Noise
   destroys high-frequency content (glyphs) long before low-frequency layout —
   though glyph-vs-severity itself is still an open measurement (below).

## Caveats

- `[UNNECESSARY]` **point_value R² < 0 for all towers, both heads** — probe design review
  needed (per-axis target normalization) before reading it as "values absent".
  *(Probe is cut. No review, no normalization fix, no mention.)*
- `[KEEP]` **glyph probes are clean-pages-only** (no degraded text-layer GT in pilot) —
  the glyph-vs-severity curve, likely the most damage-sensitive one, is not
  yet measured. *(Still true and still a real limitation — B1's degraded twins
  are transcription-scored, not glyph-probed.)*
- `[KEEP]` **DeepSeek measured on its global 1024px view only** (production adds tiled
  crops). `[APPENDIX]` **sam_vit_b__rand excluded** (exact-zero features at random init).
- `[UNNECESSARY]` Severity slices partially confound with doc mix (only era-font docs were
  degraded); scale-up should degrade a stratified sample instead. *(No severity
  slice is reported in this paper.)*
- `[KEEP]` pl1's chance floor is high (.57, background-heavy); read margins over floor.
- `[APPENDIX]` Corpus skews: bar-family chart types; no degraded replicator pages; bbox
  difficulty tags saturate (Data.md calibration note). *(The bbox-tag half is
  `[UNNECESSARY]` — tagging is dropped entirely.)*

## Ops notes `[KEEP]` — retitle "for the 20k bridge-training run"

- Extraction: fp32 compute mandatory (bf16 per-token divergence), `--detach`
  mandatory, features fp16 on volume (~45 GB for this pilot).
- Fitting: CPU containers (16 core) — sklearn-bound, schedules instantly, and
  avoids the shared-workspace L40S queue where pending apps got CLI-stopped.
- Repro commands: see README "Modal" section; probes via `probe_sampler` on
  `data/pilot_1k/images.jsonl`.

---

# Survival curves — budget sweep (448/448 pairs, 2026-08-14) `[UNNECESSARY]`

> **Whole section `[UNNECESSARY]` except one panel.** The budget sweep survives
> as a single motivation figure (glyph is steeply budget-bound; structure is
> not — Fig 2's premise), and only for the two towers in scope. The 448-pair
> grid, the mechanism decomposition, the knee analysis, and all five findings
> below are cut. This was the old paper's centerpiece; it is now one panel.

7 towers × ladder {64…1024 actual tokens} × 8 probe families; linear heads,
doc-level splits, CIs from 1000 doc bootstraps. Mechanisms: resolution
(NaFlex, both Qwen towers), res-mode (DeepSeek base sizes), merge
(CLIP/SigLIP2/SAM adaptive-pooled from cached full grids). Figure:
[figures/survival_pilot1k.png](figures/survival_pilot1k.png); tidy data:
[figures/survival_pilot1k_curves.json](figures/survival_pilot1k_curves.json).

## Findings

1. **Reading is the only signal that is steeply budget-bound.** glyph_id rises
   super-linearly with tokens for every resolution-mechanism tower (Qwen3-VL
   .05→.20, Qwen3.5 .05→.18, NaFlex .05→.185 across 64→1024) while every
   merge-mechanism tower stays flat at ~.06–.08 — pooling cannot recover
   glyphs that the native grid barely holds, and below ~200 tokens all towers
   converge to the majority floor. Pilot-scoped slogan (this corpus, these
   towers, linear probes — not paper wording): "nobody reads a full page
   under ~200 tokens." (Native-resolution Qwen at 3796 tokens reaches
   .466/.515 — the curve keeps climbing well past our ladder.)
2. **Structure barely notices the budget.** pl1 layout-class drifts only
   ~.70→.79 over a 16× token range; series binding and cell indices move
   gently; **pl2 extent is flat for every tower at every budget** — and SAM
   leads it at every single rung (~.18 IoU, 2× everyone). Localization is an
   encoder-identity property, not a budget property.
3. **Among the signals tested, glyph identity exhibits the strongest budget
   sensitivity; the tested structural probes remain comparatively stable**
   down to 64 tokens (the per-signal twin of Goodfire's benchmark-level
   "text dies first"). The practical corollary for serving: token budgets
   are primarily an OCR-quality dial, comparatively cheap for the
   layout/structure signals probed here. Note pl2's flatness is now partly
   explained by the coordinate prior (validity addendum) — "structure
   survives" claims rest on pl1/cell probes pending the pl2 refit.
4. **Mechanism matters as much as budget** (H3 evidence): at equal token
   counts, resolution-scaled towers hold glyphs better than merge-pooled ones;
   SAM's pooled features nevertheless keep their structure lead (cell_col ~.42
   at 64 tokens). Every point is mechanism-annotated in the tidy data.
5. **The two Qwen generations track each other** across the ladder with the
   native-table pattern preserved (VL slightly better on glyphs, 3.5 better on
   relational probes) — the generation contrast is budget-stable.

## Caveats

- point_value remains a broken probe (negative R² everywhere) — excluded from
  interpretation pending per-axis normalization.
- CLIP's pl1 curve *declines* past ~400 pooled tokens — likely a pooling
  artifact on its small native grid; treat CLIP merge rungs ≥400 with care.
- Knee localization in knees.md is naive (largest single-segment drop); the
  visual knees (glyph super-linearity onset ~200–250 tokens) are the robust
  reading.
- Merge rungs for CLIP/SigLIP2 cap at 576 (can't pool above native).

---

# Task frontier — full corpus (7 configs × 1,420 pages, 2026-08-15) `[APPENDIX]`

> **Section `[APPENDIX]`, two items excepted.** Finding 2 (the eyes-vs-brain
> inversion) becomes **one framing sentence in the intro** — it is why the
> paper is about the bridge rather than the encoder — and finding 4 (starved
> vision inflates decode cost) is the **supporting inset**. The frontier table
> itself is synthetic-scored and does not appear in the results section; the
> headline table is real benchmarks (B5). Findings 1 and 3 are
> `[UNNECESSARY]`.

Full stacks generating markdown, scored against gold (TEDS via pipe→HTML /
edit-sim / chart-rule recall). Figure: [figures/frontier_pilot1k.png](figures/frontier_pilot1k.png).

| config | overall | tables | replicator | text | math |
|---|---|---|---|---|---|
| qwen3_vl@144 | .122 | .138 | .109 | .144 | .222 |
| qwen3_vl@256 | .285 | .310 | .189 | .201 | .574 |
| qwen3_vl@400 | .416 | .498 | .226 | .357 | .798 |
| qwen3_vl@784 | .523 | .698 | .306 | .608 | .914 |
| deepseek@100 | .464 | .526 | .241 | .627 | .863 |
| deepseek@256 | .520 | .671 | .340 | .784 | .875 |
| deepseek@400 | .538 | .711 | .359 | .802 | .888 |

## Findings

1. **Pareto crossover, measured — global-view frontier**: DeepSeek leads
   every matched budget below 784 tokens (at 100 tokens it doubles qwen@256
   overall); Qwen draws level at 784 (.523 vs .520) and, per its slope,
   passes above it. Scope: DeepSeek ran its GLOBAL 1024px view only —
   production serving adds tiled crops, so this is a global-view budget
   frontier, not a production-efficiency comparison, until the crop-mode run
   lands (measurement-validation.md item 7).
2. **The eyes-vs-brain inversion** (the headline panel pair): Qwen's
   *encoder* shows far higher probe-accessible glyph signal than DeepSeek's
   at every budget, yet DeepSeek's *stack* wins end-to-end at low budgets —
   a representation with lower probe-accessible glyph information yields
   better end-task performance after decoder co-training. Why (better
   decoder alignment, language priors, redundancy exploitation, recovery
   from partial evidence) is NOT established here; localizing it is exp2a's
   job. Probe results measure representation retention; end-task adds
   decoder adaptation; the divergence itself is the finding.
3. **Qwen's end-task curve is the task-level shadow of its glyph survival
   curve** — steep, near-collapse at 144 tokens (.122), consistent with the
   probe-level "nobody reads under ~200 tokens".
4. **Low budgets are not cheap to serve for Qwen**: starved vision input made
   the decoder ramble to the 4096-token cap (~80s/page at 144 vs ~30 at 784)
   — cutting vision tokens raised decode cost. Budget dials must be priced
   end-to-end, not by vision-token count alone.

## Ops addenda

- Function timeout must exceed shard_pages × worst s/page: the 4h ceiling
  killed 355-page shards at ~80s/page; 16-way sharding + resume recovered.
- Volume dirs under concurrent writers show commit-lineage read bounce; treat
  per-file presence, not dir listings, as truth during active runs.

---

## Retroactive caveat (2026-08-15): qwen3_vl_vit numbers describe ONE of four bridges `[APPENDIX]`

> Not a finding, but **load-bearing as the stated reason Qwen3-VL is excluded**
> from the causal work — a single-bridge stack is what makes exp2a
> architecturally complete. Two sentences in the scope paragraph. All
> qwen3_vl_vit *numbers* elsewhere in this file are `[UNNECESSARY]`.

Qwen3-VL-4B-Instruct uses DeepStack (`deepstack_visual_indexes: [5, 11, 17]`):
ViT features from three intermediate layers are injected at multiple decoder
depths in addition to the top-level merger path. All qwen3_vl_vit probe numbers
in this file measured the top path only; the VL decoder receives feature paths
our probes never touched. Cross-generation comparisons (3.5 vs 3-VL towers)
under-describe the VL side accordingly. Qwen3.5-4B (production) has
`deepstack_visual_indexes: []` — a single bridge — so its numbers, and the
bridge-localization experiment, are architecturally complete for that model.

---

# Measurement-validity addendum (2026-08-15) — shortcut baselines, measured `[APPENDIX]`

> **Section `[APPENDIX]` — this is what makes §3 credible.** The glyph_id and
> pl1_class rows are `[KEEP]`: no positional shortcut, 5.1× floor, survives
> font-held-out. That is the appendix a reviewer needs before believing the
> repair target. The cell_col / pl2_extent / series_id corrections are
> `[UNNECESSARY]` as write-up — those families are cut — but they stay in this
> file as the record of why.

External review (accepted) demanded shortcut baselines before trusting any
probe number. Coordinate-only (linear + kNN-50) and color-only baselines,
doc-level split, plain accuracy — same metric as the pilot table. Full table,
verdicts, and the remaining battery: [measurement-validation.md](measurement-validation.md).

**Corrections to the pilot table:**

- **The "(chance)" column is superseded.** Measured test-majority floors:
  glyph_id **.091** (not .04), cell_row **.107** (not .05), cell_col **.202**
  (not .14), series_id **.497** (not .28), pl1 .578 (as stated).
- **cell_col is largely a coordinate readout**: (x, y) alone scores **.376**.
  Only Qwen (.493, +.117) clears the shortcut decisively; SAM (+.034)
  marginally; every other tower is at/below it.
- **pl2_extent is invalid — refit complete, finding refuted**: the
  coordinate prior alone reaches **.235 mIoU — above every tower**, and the
  [features ⊕ coords] refit shows NO tower's features add anything over it
  (SAM Δ −.001, best Δ +.004). The extent column measured position
  encoding, not extent retention; the SAM-specialization finding is dead
  pending a redesigned probe (measurement-validation.md, refit round 1).
- **series_id floors were wrong — refit complete, Qwen-only signal**: on
  the multi-series slice (floor .304) every public tower sits at floor
  (.278–.327); only qwen35_vit separates (linear .441, MLP .487). Color
  shortcut measured ABSENT corpus-wide (palette randomization: color-only
  .289 vs .309 majority on that slice); counterfactual twins remain before
  any binding claim.
- **glyph font-held-out refit**: Qwen .412 vs .466 in-distribution — the
  glyph result is not font memorization (NaFlex .142 vs .185; CLIP falls
  to its shuffled floor out-of-font).
- **Survivors, strengthened**: glyph_id has no positional shortcut (coord ≤
  floor) — Qwen's .466 = 5.1× floor stands; cell_row has no y-shortcut;
  pl1's positional shortcut is negligible (+.014) against its margins.

---

# Exp 2a — bridge localization on the production tower (2026-08-15, exp2a_v1) `[KEEP]`

> **THIS SECTION IS THE PAPER (§3).** Everything above it is motivation,
> appendix, or cut. The reconstruction table below produces the number the
> method is built to recover (+.350 native functional residual = 44% of the
> pre-merge glyph readout). Two open dependencies before it can be written up:
> **V0** (verify the merger concatenates rather than pools) and **G2** (does
> this residual reproduce on real documents) — [phase-b-causal.md](phase-b-causal.md).

Pre-registration: [exp2a-bridge-localization.md](exp2a-bridge-localization.md).
Full grid ran clean: 48 fit jobs + 4 reconstruction jobs, 0 errors; raw
bundle at `/vol/results/exp2a_v1/exp2a_summary.json` (local copy
`validation/exp2a_summary.json`). Capacity-matched D=512, calibrated MLP
(300ep/3e-5), shuffled controls, doc-level splits, 1000-doc bootstraps.
All statements below are probe-accessibility statements except where the
reconstruction test is cited.

## glyph_id across sites (linear head, capacity-matched)

| budget | S1 concat4 | S1 mean4 | S2 point | S3 point |
|---|---|---|---|---|
| 144 | .115 | .119 | .082 | .081 |
| 400 | .149 | .162 | .128 | .116 |
| 1024 | .204 | .223 | .197 | .160 |
| native | .386 | .418 | **.439** | .308 |

Reference (reconstruction module, raw-D single-point premerge readout, no
capacity match): S1 point-readout at native = **.797** — far above every
S2/S3 number. **Readout granularity dominates the native S1-vs-S2
comparison**: under the registered concat4/mean4 arms S1 < S2 at native (the
sandwich artifact detector fires: S1→S2 increases, linear +.021/+.053, MLP
up to +.298 — S1's registered readouts understate presence); under the
finest readout S1 ≫ S2. The concat/mean-vs-point spread is itself a result
(pre-registered as such): at native, fine-grained glyph accessibility lives
in *individual pre-merge patches*, and both averaging into merged cells and
the merger itself reorganize it.

## Pre-registered threshold outcomes (gap counts iff > CI half-width AND > yardstick)

- **S1→S2 (the bridge) COUNTS on glyph at every served budget**: @144
  +.033/.037 (concat4/mean4), @400 +.021/.034, @1024 +.026 (mean4). The
  Phase-B gate condition is met.
- **S1→S2 does NOT count at native** on the registered arms (gap negative;
  artifact detector fired — see above; the reconstruction test below is the
  licensed native instrument).
- **S2→S3 (inside the decoder) counts at 400 (+.012), 1024 (+.037), and is
  the largest registered-arm gap at native (+.131)**. Caveat (pre-registered
  non-goal boundary): S3 measures what remains linearly present at a decoder
  mid-layer, not what the decoder consumed — a decoder that has already read
  the glyphs need not keep them linearly decodable.
- `[KEEP]` pl1_class: small S1-advantage gaps count at compressed budgets (~+.02).
  *(The specificity contrast — layout barely moves where glyph does. H4 predicts
  the repair leaves this flat.)*
- `[UNNECESSARY]` cell_row / cell_col: no counting gaps anywhere.
- `[APPENDIX]` (as a null, one line) — **pl2_extent: all 16 Δ-over-coords cells are ≈0 or negative** (−.022 to
  +.012, |Δ| ≤ .022) — extent-beyond-position exists at NO site and NO
  budget in the production stack. The nominally "counting" pl2 gaps are
  differences between two ≈0 deltas and are dismissed as such.

## Reconstruction test S2→S1 (the licensed instrument)

| budget | ridge feature R² (unif) | glyph functional residual (true→recon, linear inverse) |
|---|---|---|
| 144 | .242 | .110 → .108, gap +.002 CI [−.005, +.010] |
| 400 | .278 | .222 → .155, gap +.067 CI [+.056, +.078] |
| 1024 | .321 | .389 → .213, gap +.176 CI [+.160, +.190] |
| native | .438 | **.797 → .447, gap +.350 CI [+.336, +.364]** |

Reconstructed-S1 recovers glyph accuracy only to ≈ S2's own level at every
budget (consistent with data processing). Licensed statement: **at native
resolution, the patch-level glyph signal accessible pre-merge is not
recoverable from post-merge features by inverses of the stated capacity
(ridge + early-stopped 512-hidden MLP) — 44% of true-S1 accuracy is lost
through the bridge**; the residual shrinks monotonically as the budget
contracts (at 144, S2 retains essentially everything S1 had — both are
starved).

## Pre-registered decision

The Phase-B gate condition (S1→S2 counts on a headline family at a served
budget) is **met** — on glyph_id, the one family that passed the full
validity battery. Per the pre-registration and the 2026-08-15 double-gate,
the next step is the **LoRA-scale bridge-only pilot with an equal-compute
decoder-LoRA control** — held for an explicit go decision (training spend;
the measurement-validation battery still has OOD + counterfactual items
open). S3's native gap additionally motivates including the decoder-LoRA
control arm rather than treating bridge-only as the foregone winner.
