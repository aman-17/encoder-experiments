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
> ([experiments.md](experiments.md) §B2) fails, the survival-curve framing
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
> [figures/survival_pilot1k.png](../figures/survival_pilot1k.png).**

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
   redesigned probe — see experiments.md §Exp 1b.)*
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
  difficulty tags saturate (taxonomy dropped — experiments.md §Closed). *(The bbox-tag half is
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
[figures/survival_pilot1k.png](../figures/survival_pilot1k.png); tidy data:
[figures/survival_pilot1k_curves.json](../figures/survival_pilot1k_curves.json).

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
edit-sim / chart-rule recall). Figure: [figures/frontier_pilot1k.png](../figures/frontier_pilot1k.png).

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
   lands (experiments.md §Closed (DeepSeek crop path)).
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
verdicts, and the remaining battery: [experiments.md](experiments.md).

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
  pending a redesigned probe (experiments.md §Exp 1b).
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
> this residual reproduce on real documents) — [experiments.md](experiments.md).

Pre-registration: [experiments.md](experiments.md).
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
the validity battery (experiments.md) still has OOD + counterfactual items
open). S3's native gap additionally motivates including the decoder-LoRA
control arm rather than treating bridge-only as the foregone winner.

---

# B2 — bridge-only pilot vs decoder-LoRA control (2026-08-16, gate G1)

Pre-registration: experiments.md §B2. 6/6 training jobs (2 arms × 3 LRs,
A100-80GB), best-val LR = 3e-4 for both arms; frozen-set certification passed
every job; 775 usable train docs (14 no-gold), 25 replicator docs dropped
overlong; eval = 211 held-out docs (201 scored, 10 no-gold), greedy, native.
Raw bundle: validation/b2_pilot.json.

| arm | trainable params | overall [95% CI] | charts | math | replicator | tables | text |
|---|---|---|---|---|---|---|---|
| A bridge-only | 27.3M (full merger) | .608 [.551, .665] | .165 | .993 | .260 | .812 | .880 |
| B decoder-LoRA r16 | 21.2M | **.678 [.622, .733]** | .265 | .961 | .440 | .891 | .989 |
| C frozen anchor | 0 | .287 [.244, .330] | .079 | .236 | .321 | .610 | .337 |

Contrasts (doc-bootstrap 95% CI): **A−B overall −.070 [−.095, −.041]**;
A−C +.321 [+.265, +.380]; B−C +.391 [+.337, +.444]. Per-family A−B:
math **+.032 [+.002, +.072]** (A wins, CI excludes 0); text −.109; charts
−.099; tables −.079; replicator −.180.

**Pre-registered adjudication (G1, primary = overall per the authored
table): B > A beyond CI → hypothesis functionally unsupported at this
scale/data; fallback row applies (TMLR framing; compute moves to decoder
adaptation; do not spend the 20k on the repair as-is).**

Recorded observations (raw, not adjudication):

- Both arms gain enormously over the anchor (+.32/+.39), with the largest
  jumps on math (.24→.96/.99) and text (.34→.88/.99) — consistent with a
  large output-format-adaptation component in the metric (the anchor does
  not emit the generators' markdown/LaTeX conventions). The task-space
  contrast therefore conflates formatting with perception; the
  pre-registered probe-space readout (glyph probe on arm A's repaired S2,
  experiments.md §B2 "additional readout") is running and reports
  separately.
- math — the most format-constrained, glyph-dense family — is the single
  family where A beats B with a CI excluding zero (+.032), the
  diagnosis-predicted direction.
- The 2-epoch / 775-doc scale is the pilot's floor, pre-registered as such;
  the fallback row's "may need a design change, not more compute" reading
  applies to the repair design, not to the diagnosis (exp2a §3 stands).

## B2 probe-space readout (2026-08-16) — repaired S2 vs stock S2

Pre-registered "additional readout" (experiments.md §B2). Arm A's best
bridge (A_0.0003) loaded into the tower; glyph_id at native, point readout,
capacity-match 512, calibrated MLP — the exp2a S2 cell's exact recipe, both
arms fit in the same run. Raw: validation/b2_probe_readout.json.

| arm | linear [95% CI] | mlp [95% CI] |
|---|---|---|
| stock S2 | .4386 [.418, .462] | .5029 [.480, .526] |
| repaired S2 (arm A) | .4393 [.419, .460] | .4830 [.461, .506] |
| **delta** | **+.0007** | **−.0199** |

The bridge finetune left glyph accessibility unchanged (CIs fully overlap;
S1 reference .797). Combined with the task-space result (B > A overall),
the G1 record completes: arm A's +.32 task gain over the anchor was output
adaptation, not perception; CE-only training at this scale exerts no
measurable pressure on the merger's feature geometry. G1 fallback stands.
The §3 diagnosis (the 44% residual) is untouched by this outcome. The
pre-registration's reserved design change for exactly this branch is R4
(diagnosis-supervised bridge training); it has not been run and is not
launched under the failed gate.

---

# B1 v2 — activation patching on resolution-damaged twins (2026-08-16)

Pre-registration: experiments.md §B1. v1 (sev-2 photometric) was an
instrument-validation run: damage +.016 n.s. — attack too mild; controls
perfect. v2 uses rs3x twins (3× bilinear down / Lanczos up, identical pixel
dims → token-identical grids; damage ladder measured on 10-pair probes:
sev3 +.010, rs2x +.025, rs3x +.083). 100 pairs × 6 conditions, greedy,
native. Raw: validation/b1_patching_v2.json.

| condition | mean edit-sim |
|---|---|
| clean anchor | .2946 |
| degraded floor (rs3x) | .1961 |
| + clean S2 patch (LM input) | .2946 |
| + clean S3 patch (layer 16) | .2109 |
| mismatched-page patch | .1563 |
| self-patch | .2946 (byte-exact no-op) |

Damage +.0985 [+.077, +.121]. **Restoration: S2 = 1.000 [1.0, 1.0]
(structural upper anchor — full clean prefill reconstruction); S3 = 0.150
[0.008, 0.283]**; mismatch −.403 (destroys further — patches are causally
potent).

Licensed causal statements (per §B1 pre-registered readings):

1. **The decoder is exonerated as a reader of what it is given**:
   restoring clean LM-input image embeddings restores transcription
   exactly — resolution-induced reading loss is entirely upstream of the
   LM input.
2. **Only 15% of the recoverable signal is still patch-usable at
   mid-decoder**: the decoder's extraction of visual evidence into text
   positions concentrates in its first half (layers 0–16); by layer 16 the
   damage is committed. This is the causal counterpart of the S2→S3 probe
   gap and carries the same scope: degradation-loss localization, not a
   bridge claim (S1-patch ≡ S2-patch by merger cell-independence).

---

# R4 — diagnosis-supervised bridge training (2026-08-16, adjudicated)

Pre-registration: experiments.md §R4. 4/4 jobs (R4a glyph-aux / R4b
inverse-aux × λ {0.1, 1.0}, arm-A recipe, LR 3e-4). Both objectives BOUND:
glyph aux CE 4.389→2.643 (λ=1; well below the ln(80) random floor — point
readout alignment confirmed), inverse-map normalized MSE 2.21→0.69 (λ=1;
mean-predictor baseline 1.0). LM CE healthy in all arms (~0.19 final).
Raw: validation/b2_pilot.json (7-arm task bundle),
validation/b2_probe_readout_R4*.json.

## Probe-space (repaired S2 glyph vs stock .4388 linear / .5035 mlp)

| arm | linear Δ | mlp Δ |
|---|---|---|
| R4a λ=0.1 | +.0074 | −.022 |
| R4a λ=1.0 | +.0172 (CIs overlap) | −.042 |
| R4b λ=1.0 | +.0028 | −.045 |
| R4b λ=0.1 | +.0043 | −.022 |

Best lift = +.017 ≈ 5% of the .358 residual toward S1's .797, not
CI-separated. MLP drops in every arm while linear inches up: accessibility
is RE-ALLOCATED, not added.

> **SUPERSEDED 2026-08-17 by §R5.** The measurements above stand; the
> *interpretation* below them ("information-saturated projector") does not.
> Holding this objective fixed and raising the glyph supervision 10× (700 →
> 5,000 docs) produces a CI-separated +.083 linear AND +.045 MLP lift — both
> heads rising, i.e. information added, not re-allocated. R4's nulls were a
> DOSE artifact of 31.5k glyph points over ~180 optimizer steps, not a
> property of the projector.

## Task-space (overall, 201 docs; A = CE-only bridge .6082)

R4a_0.1 .6212 (A−R4a_0.1 −.013 n.s.); R4a_1 .5857 (A wins +.022 CI>0);
R4b_0.1 .5958 (n.s.); R4b_1 .5698 (A wins +.038 CI>0). Higher λ taxes CE
without task payoff. All R4 arms ≫ anchor C (.287).

## Adjudication (pre-registered table)

Probe-space: NOT lifted with CI separation. Task-space: flat-to-negative.
Neither "lifts" row is met at 700 docs; outcome recorded at the time as
**bound-but-did-not-transfer** — the objectives moved the merger's geometry
(reconstruction loss −69%) yet an independent probe recovered ≤5% of the
residual and the task none.

> **The verdict drawn from this at the time — "no further repair spend
> without a new design", "information-saturated projector", "the remaining
> lever is the interface, not the learned map", TMLR fallback — is
> WITHDRAWN (2026-08-17).** §R5 holds the objective fixed and raises only
> the data, and the repair works. What R4 actually established is narrower
> and still useful: *at ~700 documents / ~180 optimizer steps, diagnosis-
> supervised bridge training does not move the residual, under any of three
> objectives.* The bound-but-did-not-transfer framing was a real
> observation at that dose; generalizing it to the projector's capacity was
> an over-read of a null. Retained here as the record of what was measured
> and what was wrongly concluded from it.

---

# R5 — the pin-vs-scale 2×2 (2026-08-17) `[KEEP — headline]`

Pre-registration: experiments.md §R5. Question: was R4's null caused by the
frozen decoder PINNING the merger, or by supervision underdose? Objective
held fixed (CE + λ=1 glyph aux, LR 3e-4); only the decoder's freedom and the
data scale vary. Eval/probe substrate unchanged (pilot corpus, 211 held-out
docs; stock S2 reference .4388 linear [.418,.462] / .5035 mlp).

## Probe-space: repaired-S2 glyph accessibility

| cell | data | decoder | linear [95% CI] | Δ | mlp | Δ |
|---|---|---|---|---|---|---|
| R4a_1 | 700 | frozen | .4560 [.435,.479] | +.017 | .4617 | −.042 |
| R5j_700 | 700 | LoRA r16 | .4494 [.428,.471] | +.011 | .4641 | −.039 |
| **R5b_5k** | **5,000** | frozen | **.5211 [.498,.545]** | **+.083** | **.5478** | **+.045** |
| **R5j_5k** | **5,000** | LoRA r16 | **.5196 [.496,.542]** | **+.081** | **.5442** | **+.041** |

(5k cells are ~1-epoch checkpoints — both 5k jobs hit the 12h function
timeout at micro 5375/9920; timeout raised to 24h and full 2-epoch runs
relaunched. The lift below is therefore a LOWER bound on the spec run.)

**Two axes, cleanly separated:**

1. **Scale is the live axis.** 700 → 5,000 docs (31.5k → 300k glyph points,
   ~180 → ~670 optimizer steps) turns a non-significant +.017 into a
   CI-separated **+.083 linear** — repaired CIs do not overlap stock's —
   recovering ~23% of the .358 S1−S2 residual. Training-loss corroboration:
   glyph aux CE reaches ~1.0 at 5k vs 2.64 at 700.
2. **MLP rises with linear for the first time in the program** (+.045,
   +.041 vs −.039…−.045 in every 700-doc arm). Both heads up = information
   ADDED at S2, not re-allocated between heads. This is the measurement
   that overturns R4's saturation reading.
3. **The pin hypothesis is dead.** Bridge-only +.083 ≈ joint +.081 at 5k,
   and at 700 the joint arm was *worse* (+.011 vs +.017); joint aux CE 2.69
   vs frozen 2.64. Freeing the decoder never mattered for perception.

## Task-space (211 held-out pilot docs, unchanged eval)

| arm | overall | text | math |
|---|---|---|---|
| C anchor | .287 | .337 | .236 |
| R4a_1 (bridge, 700) | .586 | .788 | .989 |
| A (bridge CE-only, 700) | .608 | .880 | .993 |
| R5j_700 (joint, 700) | .651 | .955 | .999 |
| B (decoder-LoRA, 700) | .678 | .989 | .961 |
| R5b_5k / R5j_5k | *pending* | | |

R5j_700 vs its frozen twin R4a_1: **+.065 [+.039,+.093]** — but paired with
its *lower* probe-space delta, so the joint arm's task gain is decoder-side
output quality, not perception. Content-normalized metric (markdown/LaTeX
stripped) halves B's lead over A (+.070 → +.034) without erasing it.

## H4 specificity — does the repair move ONLY text?

Pre-registered falsification test: a repair that lifts everything is generic
capacity, not a bridge repair. `pl1_class` (layout class at the marked point)
under the IDENTICAL config as its stock reference (exp2a S2 native cell:
capacity_match 512, calibrated MLP, same doc split, n_test 28,992 both):

| probe | stock S2 | R5b_5k (repaired) | Δ |
|---|---|---|---|
| glyph_id | .4388 | .5211 | **+.083** |
| pl1_class | .815 linear / .8443 mlp | .812 / .827 | **−.003 / −.017** |

R5j_5k (joint arm) agrees: pl1 .8103 linear / .8230 mlp (Δ −.005 / −.021)
against glyph +.081.

Layout accessibility is flat (slightly negative) in BOTH 5k arms while glyph
rises with CI separation. **The effect is signal-specific**, matching the
diagnosis it was derived from — the pre-registered falsification test for
our own mechanism story did not fire.

## Status of the adjudication

Pre-registered rows: "both ↑ only at 5k → dose story; scale further" is the
row met **in probe space**. G1′ conditions (ideas.md §Gates): (a)
CI-separated lift on both heads — **MET**; (b) `pl1_class` flat — **MET**
(−.003); (c) task-space movement on glyph-dependent metrics — outstanding.
Also outstanding: 5k task-space eval on the pilot held-out set, the full
2-epoch runs (current cells are ~1 epoch), and the external-benchmark
comparison (stock vs repaired on olmOCR-bench / OmniDocBench /
PulseBench-Tab), which is the readout that decides whether this ships.

## WITHDRAWN (2026-08-17, same day): the repair does not transfer

> The probe measurements in this section stand. **The conclusion drawn from
> them — that the projector was repaired — is withdrawn**, by the external
> benchmark run below (§External OCR benchmarks): the same checkpoint that
> produces +.083 glyph accessibility on our corpus **loses 21–23 points on
> every public benchmark** (olmOCR 71.0→48.0, OmniDoc 81.2→59.7, PulseBench
> mean .719→.368, coverage −23pp).
>
> **What the +.083 actually was.** The repaired projector's main weight moved
> with relative Frobenius norm **0.796** — an ~80% rewrite, not a nudge —
> while LM loss fell to ~0.002 on an ~11-template corpus. The gain is
> distribution-specific: more glyph signal recoverable *on pages drawn from
> the training renderer*, at the cost of handing the frozen decoder a feature
> distribution it cannot read anywhere else. The English-vs-Chinese split in
> the OmniDoc slices (+.036 vs +.434/+.484 edit distance) matches the
> latin-only training corpus exactly.
>
> **The methodological finding this establishes**, which outlives the failed
> repair: *a CI-separated, specificity-passing, both-heads probe improvement
> is NOT sufficient evidence of a repair.* Our own pre-registered G1′ rule
> listed probe lift + specificity + task movement as three conditions; the
> first two passed and the third failed catastrophically. Any future claim of
> this shape needs the external number before, not after, the write-up.
>
> This also confirms the failure mode named in the original Phase-B
> pre-registration: "a frozen decoder reading a re-packed format is an
> independent failure risk the pilot exists to expose."

## Corpus caveat (binding on how far this generalizes)

The 5k corpus is 5,000 pages but only 6 latin text templates × 500 seeds +
5 math styles; LM CE falls to ~0.002 (near-memorization). It scales glyph
*supervision*, not layout diversity. "Scale further" therefore means more
DIVERSE data, and the next scale-up must add template/rendering variety,
not more seeds of the same families.

---

# External OCR benchmarks — stock vs repaired projector (2026-08-17)

Raw bundle: `validation/extbench_base_vs_repaired.json`; tensor-diff record:
`validation/extbench_arms_verify.json`. Runner: `pipelines/modal_extbench_bridge.py`.

## Method

The `ocr_postraining/extbench` apps serve a checkpoint DIRECTORY with vLLM, so both arms
are full serving checkpoints on `ocr-rl-trainer-models-0` and nothing about the
benchmark path is forked (their official scorers run unchanged):

| arm | served dir | weights |
|---|---|---|
| stock | `/models/hf_exports/qwen35_4b_stock` | `Qwen/Qwen3.5-4B` snapshot, unmodified |
| repaired_ep1 | `/models/hf_exports/qwen35_4b_R5b_5k` | same files, vision-merger tensors overwritten from `/vol/phaseb/R5b_5k_ep1/bridge.safetensors` (sha256 `5886aaff…`, the frozen 1-epoch R5b_5k checkpoint — byte-identical to the file the §R5 probe readout used) |

Tensor-level diff over both directories: **738 tensors, 733 byte-identical, 5 changed**
(27,270,656 of the merger's 27,271,680 params). Every non-shard file (config, tokenizer,
chat template, preprocessor) is byte-identical; shard 1 is byte-identical as a whole
file; shard 2 was rewritten and each of its non-merger tensors is byte-identical by
sha256 over its safetensors byte range. Per merger tensor (relative Frobenius change vs
stock, at the served bf16):

| tensor | params | rel. Frobenius Δ | max abs Δ |
|---|---|---|---|
| linear_fc1.weight | 16,777,216 | .7962 | .0556 |
| linear_fc2.weight | 10,485,760 | .7478 | .0404 |
| linear_fc2.bias | 2,560 | .2412 | .0111 |
| linear_fc1.bias | 4,096 | .1813 | .0245 |
| norm.bias | 1,024 | .0074 | .0160 |
| norm.weight | 1,024 | 0 | 0 |

`norm.weight` is byte-identical to stock and its trained fp32 value equals stock exactly:
under bf16 training every update to that LayerNorm gain (values ≈1, ULP ≈2⁻⁸) fell below
the representable step, while the same-magnitude updates survived on the near-zero
`norm.bias`.

Inference is extbench's own for both arms: production cost_effective prompt
(sha256 `19395f4c…`), greedy, `enable_thinking=false`, official renders (olmOCR 1288px
page 1, OmniDoc 2048px cap, Pulse 2560px table crops), official scorers
(`olmocr.bench.benchmark`; OmniDocBench repro container, quick_match; `tlag_scorer.py`).
Both arms produced the full page set on every benchmark: 1,403 / 1,651 / 1,820
predictions each.

## olmOCR-bench — official scorer, 1,403 pages (pass rate %)

| slice | stock | repaired_ep1 | Δ |
|---|---|---|---|
| **overall** (macro over jsonls) | 71.0 | 48.0 | -23.0 |
| absent (n=823) | 48.4 | 56.7 | +8.3 |
| baseline (n=1403) | 96.7 | 95.8 | -0.9 |
| math (n=3385) | 78.2 | 39.8 | -38.4 |
| order (n=1061) | 68.8 | 38.3 | -30.5 |
| present (n=721) | 62.0 | 19.7 | -42.3 |
| table (n=1020) | 80.3 | 52.0 | -28.3 |
| arxiv_math.jsonl | 79.3 | 37.5 | -41.8 |
| baseline | 96.7 | 95.8 | -0.9 |
| headers_footers.jsonl | 46.4 | 54.9 | +8.5 |
| long_tiny_text.jsonl | 77.4 | 18.8 | -58.6 |
| multi_column.jsonl | 76.5 | 42.3 | -34.2 |
| old_scans.jsonl | 40.1 | 27.9 | -12.2 |
| old_scans_math.jsonl | 71.4 | 54.6 | -16.8 |
| table_tests.jsonl | 80.3 | 52.1 | -28.2 |

## OmniDocBench v1.6 — official repro container, 1,651 pages

| slice | stock | repaired_ep1 | Δ |
|---|---|---|---|
| overall | 81.2397 | 59.6649 | -21.5748 |
| text_block_edit | 0.1628 | 0.3998 | +0.2370 |
| table_teds | 0.6992 | 0.3739 | -0.3253 |
| table_teds_structure_only | 0.7363 | 0.4514 | -0.2849 |
| table_edit | 0.2183 | 0.5536 | +0.3353 |
| display_formula_cdm | 0.9008 | 0.8158 | -0.0850 |
| display_formula_edit | 0.1739 | 0.2987 | +0.1248 |
| reading_order_edit | 0.2053 | 0.2933 | +0.0880 |

## PulseBench-Tab — official T-LAG scorer, 1,820 tables

| slice | stock | repaired_ep1 | Δ |
|---|---|---|---|
| mean | 0.7191 | 0.3676 | -0.3515 |
| median | 0.8163 | 0.3479 | -0.4684 |
| coverage_pct | 92.1000 | 69.2000 | -22.9000 |
| n_scored | 1677 | 1260 | -417 |
| n_missing | 143 | 560 | +417 |
| perfect_count | 235 | 12 | -223 |
| lang: arabic | 0.5622 | 0.2854 | -0.2768 |
| lang: chinese | 0.8179 | 0.4081 | -0.4098 |
| lang: english | 0.7139 | 0.4011 | -0.3128 |
| lang: french | 0.7946 | 0.4989 | -0.2957 |
| lang: german | 0.7023 | 0.2831 | -0.4192 |
| lang: greek | 0.5455 | 0.1310 | -0.4145 |
| lang: japanese | 0.7474 | 0.3385 | -0.4089 |
| lang: korean | 0.6657 | 0.1392 | -0.5265 |
| lang: russian | 0.7582 | 0.2866 | -0.4716 |
| lang: spanish | 0.7732 | 0.4578 | -0.3154 |

## OmniDocBench sub-slices (page-level, from the same result file)

Text-block edit distance (lower = better) by page language, and table TEDS by page
language — the full slice set is in the bundle:

| slice | stock | repaired_ep1 | Δ |
|---|---|---|---|
| text edit — english | 0.1180 | 0.1537 | +0.0357 |
| text edit — other | 0.2435 | 0.2691 | +0.0256 |
| text edit — en_ch_mixed | 0.2449 | 0.5087 | +0.2638 |
| text edit — simplified_chinese | 0.1947 | 0.6281 | +0.4335 |
| text edit — traditional_chinese | 0.1968 | 0.6812 | +0.4844 |
| text edit — layout: three_column | 0.0695 | 0.1208 | +0.0513 |
| text edit — layout: double_column | 0.1262 | 0.3270 | +0.2008 |
| text edit — layout: 1andmore_column | 0.0769 | 0.2979 | +0.2211 |
| text edit — layout: single_column | 0.1791 | 0.4018 | +0.2227 |
| text edit — layout: other_layout | 0.1954 | 0.5152 | +0.3199 |
| table TEDS — english | 0.6857 | 0.4401 | −0.2456 |
| table TEDS — traditional_chinese | 0.6114 | 0.3249 | −0.2865 |
| table TEDS — simplified_chinese | 0.7840 | 0.4039 | −0.3801 |
| table TEDS — en_ch_mixed | 0.7542 | 0.3654 | −0.3888 |

## Caveats

- Both arms are BASE Qwen3.5-4B — no OCR post-training, no markdown-convention
  training. Absolute values are not comparable to the leaderboards or to our
  post-trained soup reference (olmOCR 72.3 / OmniDoc 86.33 / PulseTab .794); only the
  stock↔repaired_ep1 contrast is the measurement here.
- repaired_ep1 is the ~1-epoch R5b_5k checkpoint (results.md §R5: the 5k cells are
  1-epoch, timeout-truncated). The 2-epoch retrain of the same arm was still running
  when these were measured and is a separate arm (`--repaired-dir`/`--repaired-arm`).
- The bridge's train corpus is 5,000 pages of 6 latin text templates × 500 seeds + 5
  math styles (§R5 corpus caveat). Chinese/Japanese/Korean/Greek/Russian/Arabic pages,
  every table slice, and scanned pages are out of distribution for it.
- olmOCR's `absent` family scores a model for NOT emitting text; `headers_footers`
  contains `absent`-style tests. Both rise here while every transcription family falls.
- Greedy, one sample per page, no repeats. olmOCR ships a ±95% CI over tests
  (stock 71.0 ± 1.1, repaired_ep1 48.0 ± 1.2); the OmniDocBench and T-LAG numbers carry
  no CI. PulseBench-Tab excludes missing predictions from its mean, so the mean is only
  readable next to Coverage (92.1% vs 69.2%).
- OmniDoc `overall` is ((1 − text_block edit) + table TEDS + formula CDM)/3 × 100, the
  leaderboard's own composite, computed from the scorer's own result file.

# Item-level forensics — stock vs repaired projector (2026-08-18) `[KEEP]`

Raw bundle: `validation/extbench_item_level.json`. Runner:
`uv run modal run modal_extbench_bridge.py --items` (pure parts unit-tested in
`tests/test_extbench_bridge.py`). Same two serving checkpoints and the same already-
scored predictions as the section above — nothing was re-inferred.

## Method

olmOCR-bench publishes no per-test pass file, so the per-item vector is reconstructed
from the scorer's own artifacts on `ocr-rl-trainer-data-0`: the 7 category jsonls (7,019
tests) plus one auto-generated baseline test for each pdf that no jsonl already covers
with a baseline of its own (1,394) = the 8,413 tests the scorer counts, minus each arm's
`reports/<candidate>/failed.jsonl`. The reconstruction is **checked against the scorer's
own printed tables** rather than trusted: every by-file (total, passed) pair and every
by-type pass rate falls out of the confusion exactly, both arms (`confusion_checks`,
14/14 true per arm).

Per-prediction statistics are computed on the generated files themselves
(`olmocr/bench_data/<candidate>/**/*.md`, `omnidoc/preds/<candidate>/*.md`,
`pulse/preds/<candidate>/*.html`), tokenized with the served checkpoint's own
`tokenizer.json`.

- `repetition` = share of a prediction's word 10-grams (character 30-grams for scripts
  that do not space-separate) that repeat an earlier one: 0 when every gram is unique,
  →1 for a loop of any period. Floor for the "looping" flag = 0.10; the bundle carries
  the whole threshold sweep (0.05/0.1/0.25/0.5/0.9).
- `at cap` = post-processed token count ≥ 0.98 × that bench's `max_tokens`
  (8,192 olmOCR/OmniDoc, 16,384 Pulse).
- Failure labels: page-level generation pathology first (empty → looping → at-cap →
  refusal), then the scorer's own printed reason for what it could not find, with a
  mostly-read text (fuzzy ratio ≥ 0.60) split off from a miss.

## olmOCR-bench item-level confusion (8,413 tests)

| slice | n | P→P | P→F | F→P | F→F | net | stock % | repaired % |
|---|---|---|---|---|---|---|---|---|
| **overall** | 8413 | 3916 | 2483 | 320 | 1694 | -2163 | 76.1 | 50.4 |
| type: absent | 823 | 322 | 76 | 145 | 280 | +69 | 48.4 | 56.7 |
| type: baseline | 1403 | 1308 | 49 | 36 | 10 | -13 | 96.7 | 95.8 |
| type: math | 3385 | 1271 | 1377 | 76 | 661 | -1301 | 78.2 | 39.8 |
| type: order | 1061 | 380 | 350 | 26 | 305 | -324 | 68.8 | 38.3 |
| type: present | 721 | 139 | 308 | 3 | 271 | -305 | 62.0 | 19.7 |
| type: table | 1020 | 496 | 323 | 34 | 167 | -289 | 80.3 | 52.0 |
| file: arxiv_math.jsonl | 2927 | 1054 | 1267 | 43 | 563 | -1224 | 79.3 | 37.5 |
| file: baseline | 1394 | 1300 | 48 | 36 | 10 | -12 | 96.7 | 95.8 |
| file: headers_footers.jsonl | 760 | 276 | 77 | 141 | 266 | +64 | 46.4 | 54.9 |
| file: long_tiny_text.jsonl | 442 | 83 | 259 | 0 | 100 | -259 | 77.4 | 18.8 |
| file: multi_column.jsonl | 884 | 350 | 326 | 24 | 184 | -302 | 76.5 | 42.3 |
| file: old_scans.jsonl | 526 | 138 | 73 | 9 | 306 | -64 | 40.1 | 27.9 |
| file: old_scans_math.jsonl | 458 | 217 | 110 | 33 | 98 | -77 | 71.4 | 54.6 |
| file: table_tests.jsonl | 1022 | 498 | 323 | 34 | 167 | -289 | 80.3 | 52.1 |


Silico's Qwen3-8B report's comparable line was 745 wrong→right / 339 right→wrong, net
+406 of 5,000. Here: 320 fail→pass / 2,483 pass→fail, net **−2,163 of 8,413**.
`long_tiny_text.jsonl` has **0** fail→pass items in 442 tests.

## Failure modes over the 2,483 pass→fail items

| mode | n | % of pass→fail | stock arm, all failures |
|---|---|---|---|
| math_not_found | 921 | 37.1 | 699 |
| repetition | 893 | 36.0 | 250 |
| order_anchor_missing | 227 | 9.1 | 297 |
| text_partial | 139 | 5.6 | 604 |
| table_cell_missing | 89 | 3.6 | 66 |
| truncated_at_cap | 82 | 3.3 | 9 |
| table_structure | 65 | 2.6 | 54 |
| table_dropped | 59 | 2.4 | 24 |
| text_not_found | 5 | 0.2 | 10 |
| disallowed_characters | 3 | 0.1 | 1 |


`empty_output` = 0 and `refusal` = 0 in both arms. Per test family (pass→fail only):

| family | dominant modes |
|---|---|
| math (1,377) | math_not_found 921, repetition 416, truncated_at_cap 40 |
| order (350) | order_anchor_missing 227, repetition 110, truncated_at_cap 13 |
| present (308) | repetition 224, text_partial 68, truncated_at_cap 11, text_not_found 5 |
| table (323) | repetition 98, table_cell_missing 89, table_structure 65, table_dropped 59, truncated_at_cap 12 |
| absent (76) | text_partial 71, repetition 5 |
| baseline (49) | repetition 40, truncated_at_cap 6, disallowed_characters 3 |

## Read pass→fail items — 32 of the 59 stratified samples, classified by hand

`samples` in the bundle carries all 59 (gold, both arms' predictions, both arms'
length/repetition/cap flags, the scorer's reason). Hand labels over the 32 read:

| read label | n | agrees with the automatic label |
|---|---|---|
| loop / degeneration to the cap | 8 | 8 |
| symbol- or word-level misread | 11 | 11 (as `math_not_found` / `text_partial` / `table_cell_missing`) |
| omission or reading-order change | 4 | 4 (as `order_anchor_missing`) |
| format switch (page or table emitted as fenced HTML, checkbox list, tabs) | 4 | 4 (as `table_dropped` / `table_cell_missing`) |
| hallucinated content not on the page | 2 | 2 (as `math_not_found`) |
| correct text relocated + wrapped in decoration | 1 | 1 (as `text_partial`) |
| header/footer newly emitted (`absent` family) | 2 | 2 (as `text_partial`) |
| empty output / refusal / script breakdown | 0 | — |

### Quoted examples (predictions truncated; both arms same page, same prompt)

**1 — math symbol misread** (`2503.04415_pg2_math_000`, stock pass → repaired fail).
Gold `\sigma\in[0,\frac{1-\gamma}{2})`. Stock: `$\sigma \in [0, \frac{1-\gamma}{2})$`.
Repaired: `$\sigma \in [0, \frac{1}{\sqrt{2}}]$`.

**2 — math symbol misread** (`2503.04612_pg8_math_003`). Gold
`\int \left| \log \sin \angle (\mathbf{E}_1, \mathbf{E}_2) \right| \, d\mu`. Repaired:
`$\int \log \sin \mathbb{Z}(\mathbf{E}_1, \mathbf{E}_2) \, d\mu$` — the angle sign
becomes `\mathbb{Z}` and the absolute-value bars are dropped. Same page: `PABLO LESSA`
→ `PALO LESSA`, `cocycles` → `coccyles`, `projective space` → `projection space`.

**3 — math symbol misread** (`2503.08553_pg25_math_000`). Gold
`S^2\setminus B(p_+, r_1)`. Repaired: `\operatorname{arccot}` → `\operatorname{arcct}`,
`B(p_+, r_1)` → `B(p_0, r_1)`, `\eta` → `\mathcal{S}`, `B(p_+, 2r_1)` → `B(p_4, 2r_1)`.

**4 — loop to the cap** (`11_pg146_pg1_text_27`, 5,279 → 22,244 chars, at cap). Tail:
`- **PRESIDENTIAL**` repeated to the token limit.

**5 — loop to the cap, table** (`3d780cdcc987c65fdc7e1628c6a32af33d5d_pg22_table_03`,
1,890 → 12,370 chars, at cap). Tail: `|  |  |  |  |  |  |  | …` — empty pipe cells to the
limit; the scorer then reports `No tables found in the content`.

**6 — loop the scorer itself flags** (`arxiv_math/2503.05360_pg2.pdf_baseline`, 3,574 →
12,796 chars). Tail: `\! \! \! \! \! …`; scorer reason
`Text ends with 3970 repeating 3-grams, invalid`.

**7 — proper-noun garbling in prose** (`multi_column/06ba2a90…_page_14`, a reference
list). Stock `Jenun PA, Stray-Pedersen B, Melby KK … *Toxoplasma gondii* … *J Clin
Microbiol* 1998;**36**:2900–2906`. Repaired `Jenun PA, Straw-Pedersen B, Melboi KK …
Tuxoplaxa gondii … J Clin Biobal 1998:36:2900-2906`, then loops the last entry.

**8 — hallucinated content** (`2503.06110_pg13_math_008`, an arXiv page). Repaired tail:
`**Index** — Approximation: 1, 3, 5 — Cantor Set: 2, 4, 6 … **End of Document**`.
Sibling case `2503.04620_pg35_math_002` invents a bibliography:
`[5] S. White, "Advanced Topics in Optimization," *Mathematical Analysis*, vol. 25,
no. 6, pp. 156-178, 2024.`

**9 — format switch** (`acd61dce…_pg1_table_04`, scorer:
`No tables found in the content`). Repaired opens with an ```` ```html ```` fence and
emits the whole page as an HTML document —
`<html><body><h2>NOTES FROM THE CURRICULUM …</h2><p>July 17, 2003 …</p>` — using
`<h2>`/`<p>` and no `<table>`. In `cefac431…_pg49_table_04` the table becomes a
checkbox list: `- [x] ~~driverTypeAddress~~ Address of the Driver Type`. In
`26076dc3…_pg3_table_14` it becomes fenced HTML carrying layout attributes:
`<table border="1" data-bbox="102 101 880 363">`.

**10 — correct text, relocated and decorated** (`17_115907`, scorer: threshold 0.984,
best match ratio 0.806). Gold `Very sincerely yours George Brokaw Compton Executive
Secretary`. Repaired emits the name at the top of the letterhead inside strikethrough:
`~~George Brokaw Compton, '09, '13 I. / Executive Secretary~~`.

**11 — handwriting** (`old_scans/76`, 239 → 258 chars). Stock: `I enclose these
clippings from the V. papers to have you see what obstacles I have fought against and
overcome. Nothing dies, but error and untruth`. Repaired: `I envision the *liftings*
from MIT V- papers to have you see what obstacles I have fought, against and
*precisely* ~~Nothing~~ *died*, but error and *mist*`.

**12 — `absent` newly failed** (`b2ca8e00…_page_2_header_00`, gold forbidden string
`P. Tarvainen et al.`). Stock omits the running head; repaired opens with
`98 / P. Tarvainen et al.` and inserts `security~~[1]~~ vulnerabilities`,
`precaution` → `precocious`.

## Degeneration over every prediction (both arms, all three benches)

| bench | arm | n | mean chars | mean tokens | empty | at cap | repetition ≥ floor | pages with table markup | markdown marks /1k chars |
|---|---|---|---|---|---|---|---|---|---|
| olmocr | stock | 1403 | 4431.2 | 1474.0 | 0 (0.0%) | 80 (5.7%) | 105 (7.48%) | 341 | 10.89 |
| olmocr | repaired_ep1 | 1403 | 8347.8 | 2853.8 | 0 (0.0%) | 352 (25.09%) | 358 (25.52%) | 229 | 20.2 |
| omnidoc | stock | 1651 | 4199.7 | 1808.2 | 0 (0.0%) | 137 (8.3%) | 175 (10.6%) | 580 | 16.88 |
| omnidoc | repaired_ep1 | 1651 | 9053.7 | 3844.4 | 0 (0.0%) | 600 (36.34%) | 617 (37.37%) | 375 | 26.99 |
| pulse | stock | 1820 | 4465.1 | 1494.7 | 143 (7.86%) | 35 (1.92%) | 179 (9.84%) | 1677 | 4.37 |
| pulse | repaired_ep1 | 1820 | 6842.9 | 3137.7 | 560 (30.77%) | 162 (8.9%) | 332 (18.24%) | 1260 | 18.45 |

PulseBench-Tab per-sample transitions over all 1,820 samples: scored→scored 1231, scored→missing 446, missing→missing 114, missing→scored 29.

## Format-artifact check — the scorer's own threshold, decoration removed

| test family | n | our ratio vs scorer's | mean scorer ratio | mean ratio, decoration stripped | recovered |
|---|---|---|---|---|---|
| absent | 76 | ±0.0078 | 0.9988 | 0.9957 | 3 |
| present | 308 | ±0.0219 | 0.6279 | 0.6372 | 0 |


`empty` on olmOCR and OmniDoc is the whole generated page (0 of 1,403 and 0 of 1,651 in
BOTH arms); `empty` on Pulse is the extracted `<table>` block, which is the only thing
`bench_pulse.infer` persists — a page whose generation carried no table markup writes an
empty file and the scorer counts it missing. Repaired-arm table markup falls by the same
proportion on the two benches where the full text IS kept: olmOCR 341 → 229 pages
(−32.8%), OmniDoc 580 → 375 (−35.3%), Pulse 1,677 → 1,260 (−24.9%).

The format-artifact check re-scores every fuzzy text failure against the scorer's OWN
printed threshold after markdown emphasis/strike/code marks are removed from both gold
and prediction. Our `partial_ratio` reproduces the scorer's printed ratio to ±0.022 over
308 `present` items, so the stripped ratio is comparable to the same threshold.
Decoration density did roughly double (10.89 → 20.20 marks per 1k chars on olmOCR;
4.37 → 18.45 on Pulse); **0 of the 308** `present` failures cross their threshold when it
is removed, at a mean scorer ratio of 0.628.

## `absent` slice — the one family that rose

| cell | items | pages | stock mean chars | repaired mean chars | repaired shorter | repaired empty | repaired looping | stock holds the forbidden string | repaired holds it |
|---|---|---|---|---|---|---|---|---|---|
| pass_pass | 322 | 225 | 4400.3 | 7528.0 | 125 | 0 | 85 | 0.79 | 0.777 |
| pass_fail | 76 | 58 | 5168.6 | 3657.0 | 33 | 0 | 5 | 0.709 | 0.991 |
| fail_pass | 145 | 97 | 3978.1 | 9542.1 | 59 | 0 | 41 | 0.995 | 0.705 |
| fail_fail | 280 | 182 | 3670.7 | 5438.1 | 128 | 0 | 44 | 0.997 | 0.991 |

"holds the forbidden string" = `rapidfuzz.partial_ratio(gold, page)`, the same
instrument as the format check above (±0.008 against the scorer's own printed ratio on
the 76 `absent` failures it prints one for). `pass_pass` is its floor: 0.777 mean and
180/322 items ≥ 0.9 on pages BOTH arms pass, because many forbidden strings are short
(`♦ 1-1`, `FOR HUMANITY`) and match somewhere by chance. The readable quantity is
therefore the paired stock→repaired change inside a cell, not the absolute level.

On the 145 items the repaired arm newly passes:

- the page is **longer**, not shorter: 3,978 → 9,542 mean chars, 86/145 longer,
  **0 empty**, 47/145 at the generation cap, 41/145 looping;
- fidelity to the forbidden string drops on exactly those items: stock 0.995 →
  repaired 0.705, while it stays at 0.991–0.997 in `pass_fail` and `fail_fail`;
- 110/145 repaired pages still hold a ≥ 0.5 fuzzy copy of the forbidden string, 79 hold
  ≥ 0.7, 57 hold ≥ 0.9; only 9 fall below 0.3;
- 7/145 of those pages fail their own baseline (non-degenerate, non-empty) test.

Per-item examples from `absent.fail_pass_pages`: gold `Downtown Campus-Main`, stock
1.000 → repaired 0.500; gold `Dr. P. MARIAYYAH`, stock 1.000 → repaired 0.938; gold
`Comunicar, nº 33, v. XVII, 2009, Revista Cie…`, stock 0.981 → repaired 0.885.

The 76 items in the other direction are the same mechanism reversed: stock 0.709 →
repaired 0.991, i.e. the repaired arm newly emits running heads the stock arm skipped
(`98 / P. Tarvainen et al.`; and on `c0d59815…_page_1_header_01`, a banner stock omits
entirely — `**AGENDA FOR HUMANITY** / 5 CORE RESPONSIBILITIES / 24 TRANSFORMATIONS`).

**Answer to the pre-registered question:** neither "correctly identifies absence" nor
"emits less text". The repaired arm's `absent` pages are 2.4× longer and never empty;
the flips in both directions track the fuzzy fidelity of the forbidden string
(−0.29 where it starts passing, +0.28 where it starts failing).

## Caveats on the instruments

- `repetition` is blind to loops whose repeated unit changes each cycle. Example
  `04af23cb…_page_5` ends `…-506000-m-506500-m-507000-m…` — an incrementing counter, so
  its 10-grams are all distinct and it scores 0.0; the cap flag catches it instead
  (labelled `truncated_at_cap`). Loop counts here are therefore lower bounds.
- `at cap` is a lower bound for the same reason as in the method note: post-processing
  strips think tags and code fences off the served text, so a run that stopped at
  `max_tokens` can land just under the 0.98 line.
- `bench_pulse.infer` writes only the extracted `<table>` block, so PulseBench "missing"
  cannot separate "generated nothing" from "generated no table" on its own. The
  0-empty and table-markup numbers above come from the 3,054 olmOCR + OmniDoc pages
  where the whole generation IS persisted; the Pulse raw text is not on the volume.
- Both benches' `_postprocess` intends to strip the prompt's
  `<page_full_transcription>` wrapper but the pattern is written `r"…>\\s*"`, which
  matches a literal backslash — so the tag survives in every prediction, in BOTH arms
  (visible in the quoted examples). It cancels in the stock↔repaired contrast and was
  present for all previously reported numbers; it is not corrected here.
- The failure labels are one per item with page-level pathology taking precedence, so a
  looping page contributes `repetition` for every test on it rather than splitting
  across the scorer's reasons. The per-reason view without that precedence is
  recoverable from `samples[].scorer_reason` and the bundle's raw counts.
