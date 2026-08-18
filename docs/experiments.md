# Experiments

The single experiment record for this project: what each experiment asks, why
we ran it, what came back, and — the part that matters most — **what it licenses
us to say**. Replaces `exp2a-bridge-localization.md`, `phase-b-causal.md`,
`measurement-validation.md`, and `data.md` (all removed 2026-08-15; recoverable
at commit `6ff7aa0`).

Framing and what currently stands: [ideas.md](ideas.md). Measurement record:
[results.md](results.md). Tooling and contracts: [README.md](../README.md).

---

## The through-line

Document VLMs squeeze a page through a projector that merges neighboring patch
features. We wanted to know where document information stops being usable. The
experiments walk that question inward:

**Exp 1** asked *which encoder retains what* — and found that only one tower
reads at all, and that half our probes were measuring shortcuts. **Exp 1b**
(the validity audit) is what established that, and it is the reason anything
downstream is believable. **Exp 2/3** asked whether retention predicts
end-task quality — it does not, which is what pointed us past the encoder.
**Exp 2a** then looked *inside* the production stack and localized the loss to
one module, with a reconstruction test that put a number on it: 44% of the
pre-merge glyph readout is unrecoverable from post-merge features.

**V0 → B1** confirmed that localization causally (patching at the projector
output fully restores transcription; at decoder mid-layer only 15%).
**B2 → R4 → R5** then tried to repair the module and failed three times, the
last time spectacularly: a probe gain that passed every internal control cost
21–23 points on every public benchmark. **S1–S3** are the post-mortem plus the
one intervention that did work — raising the vision token budget, which needs
no training at all.

So the arc is: localize (stands) → confirm causally (stands) → attempt repair
(failed, mechanism identified) → find the lever that actually moves benchmarks
(the budget). Read the decision rules below as they were written *before* each
result, which is what makes the negatives worth anything.

---

## Wording licenses (binding for all writing)

We say *signal retention*, *probe accessibility*, *stage-wise attenuation*,
*downstream utility*. We never say information "dies", "is lost", or "is
destroyed" unless an intervention demonstrates irrecoverability. Probing
establishes accessibility to a probe of stated capacity — never
information-theoretic absence.

| evidence | licenses you to say |
|---|---|
| probe delta between sites | "not linearly recoverable at probe capacity *d*" |
| reconstruction test (trained inverse) | "not recoverable from *X* by inverses of stated capacity" |
| activation patching | causal stage claims for the intervened condition |
| benchmark delta vs param-matched control | repair claims, at the stated parameter scale |
| anything on synthetic pages only | the claim, plus "on generated documents" |

**Method-side extension.** "Recovers X% of the bridge residual" is a
probe-space statement and never substitutes for a task-level claim. The two are
reported side by side, never merged into one number. Agent-written conclusion
prose is not evidence and stays out of results bundles.

---

## Experiment map

| id | asks | outcome |
|---|---|---|
| **Exp 1** | Which towers retain which document signals? | run. Only one tower reads; 2 of 8 probe families survived the audit |
| **Exp 1b** | Are the probes measuring signal or shortcuts? | run. Refuted 4 families; **this is what makes everything downstream credible** |
| **Exp 2** | How does retention scale with token budget? | run. Reading steeply budget-bound, structure flat — later confirmed end-to-end by S2 |
| **Exp 3** | Does retention predict end-task utility? | run. No — retention and utility diverge |
| **Exp 2a** | Where does text signal stop being recoverable? | run. **44% functional residual across the projector. Stands.** |
| **V0** | Does the merger concatenate or pool? | verified: concatenation (Qwen2-VL-lineage `PatchMerger`) |
| **B1** | Is the localization causal? | run (v2, rs3x twins). **Yes: projector-output patch restores fully, decoder-mid only 15%. Stands.** |
| **B2** | Can bridge adaptation beat decoder adaptation? | run. **No — gate G1 FAILED** (decoder-LoRA .678 vs bridge .608; probe unmoved) |
| **B3** | Never-captured or captured-then-discarded? | run. Pooling a native encode beats downscaling at matched tokens |
| **R4** | Does diagnosis-supervised training move it? | run. Objectives bound; nothing transferred at 700 docs |
| **R5** | Was R4 a dose or a pin problem? | run. Dose — probe +.083 at 5k docs, **but the checkpoint collapses on external benchmarks** |
| **S1** | Is our task metric image-driven or priors? | run. **Image-driven** (all arms fall to ~.061 blind) |
| **S2** | Does the vision token budget move real benchmarks? | run. **Yes: +3.0 overall, +12.7 fine-text, no training. Stands.** |
| **S3** | What exactly broke in the collapse? | run. Rambling not silence; `long_tiny_text` 0/442 fixed |
| **G2** | Does the *diagnosis* reproduce on real documents? | **never run.** Still the largest open question |

---

# Part I — the diagnosis (run)

## Exp 1 — Frozen-encoder probe atlas

**Asks.** Which document signals are linearly recoverable from which frozen
vision towers?

**Why.** Prior controlled encoder comparisons (Prismatic, Cambrian-1, MM1)
varied encoders under a fixed language stack and reported end-task accuracy
only. Nobody had asked which *specific* document signals survive in the
representation itself.

**Design.** 8 encoder variants × 8 probe families, 1,000 docs / 1,420 images /
288,329 probe samples. Linear + 2-layer-MLP heads, shuffled-label controls,
random-init tower floors, document-level splits (a doc never straddles), 95%
CIs from 1000 bootstrap resamples over test documents.

**What it told us.** Qwen3.5's tower is the only one with substantial
fine-grained symbolic content (glyphs .466 vs a .091 floor — 5.1×); every other
tower sits at or near floor on glyphs. Layout class is recoverable everywhere
(.68–.83). And — critically — running Exp 1b against these numbers killed half
of them.

**What it licenses.** Accessibility statements per (tower, probe, capacity), on
generated documents. Nothing about information presence or absence.

**Status.** Run. Six of eight probe families and five of seven towers are cut
from the paper ([results.md](results.md) carries per-item tags). `glyph_id`
survives as the headline signal; `pl1_class` survives as the specificity
contrast.

## Exp 1b — Shortcut audit and refits

**Asks.** For each probe, can the named shortcut (glyph→font/position;
cell_row→y; cell_col→x; series→color; extent→position prior) explain the score?

**Why.** A probe is a measurement instrument and an uncalibrated one produces
confident nonsense. External review demanded this before trusting any number,
and it was accepted. This is the experiment that separates this project from a
probe-atlas paper that would not have survived review.

**Design.** Labels predicted from (x, y) alone (linear + kNN-50) and from local
window color alone, doc-level split, plain accuracy — same metric and the same
discipline as `probe_fit`. Then blocking refits on all 8 towers against native
caches: pl2 as Δ over a coords-only baseline with [features ⊕ coords] heads;
series on the honest multi-series slice; glyph with font-family held out.

**What it told us — the corrections:**

| probe | true floor | shortcut | verdict |
|---|---|---|---|
| glyph_id | **.091** (we had said .04) | coord ≤ floor | **survives** — no positional shortcut; Qwen 5.1× floor |
| pl1_class | .578 | coord +.014 | **survives** — shortcut negligible vs margins |
| cell_row | **.107** (said .05) | ≈ floor | survives at 1.9× floor; demoted |
| cell_col | **.202** (said .14) | **.376 from x alone** | largely positional; only Qwen clears it |
| series_id | **.497** (said .28) | ≤ floor | floors were wrong; margin +.036, not +.25 |
| pl2_extent | — | **.235 mIoU coord prior** | **invalid** — every tower scores below the prior |

Refit verdicts: **pl2_extent is dead for every tower** (best feature Δ +.004;
SAM, the supposed extent specialist, −.001) — the pilot's "SAM retains extent
3× Qwen" finding is **refuted**, it measured how linearly features encode
*position*. **Series binding is Qwen-only** (every public tower at the .304
multi-series floor; Qwen +.14 linear / +.18 MLP; color shortcut structurally
absent because the generators randomize palettes per chart). **Glyph survives
font-held-out**: Qwen .412 vs .466 in-distribution (~11% relative), NaFlex
.142 vs .185, CLIP falls to its shuffled floor.

**What it licenses.** The one thing the whole paper leans on: `glyph_id` is not
a shortcut, not font memorization, and sits 5.1× above a correctly measured
floor. That is why a 44% residual on *that* probe is worth repairing.

**Status.** Run. Ships as the appendix validity section.

## Exp 2 — Budget sweep (survival curves)

**Asks.** How does retention scale as the token budget contracts 1024→64?

**Why.** If all signals degrade together, budget is a simple quality dial and
there is nothing signal-specific to localize. If they separate, there is.

**Design.** 7 towers × ladder {64…1024 *realized* tokens} × 8 families, 448
pairs. Mechanisms annotated per point (resolution / res-mode / merge / native),
plotted against actual token counts, never nominal.

**What it told us.** Signals separate sharply. Glyph identity rises
super-linearly with tokens for every resolution-mechanism tower and stays flat
for every merge-mechanism tower; structural probes barely move across a 16×
range. Among the signals tested, glyph identity exhibits the strongest budget
sensitivity while the tested structural probes remain comparatively stable.

**What it licenses.** The signal-specificity premise — and only in the
defensible phrasing above. Not "text dies first", not "nobody reads under 200
tokens". Figures may imply it; prose does not say it.

**Status.** Run. Survives as one motivation panel for the two in-scope towers.

## Exp 3 — Task frontier

**Asks.** Does representation-level retention predict end-task quality at
matched budgets?

**Why.** This is the question that redirected the project. If retention
predicted utility, the encoder would be the thing to fix.

**Design.** 7 full-stack configs × 1,420 pages generating markdown, scored
against gold (TEDS via pipe→HTML, edit-sim, chart-rule recall).

**What it told us — the inversion.** Qwen's *encoder* shows far higher
probe-accessible glyph signal than DeepSeek's at every budget, yet DeepSeek's
*stack* wins end-to-end at low budgets. A representation with lower
probe-accessible glyph information yields better end-task performance after
decoder co-training. **Why** — decoder alignment, language priors, redundancy,
recovery from partial evidence — is not established here. The divergence itself
is the finding, and it is why this project is now about the bridge rather than
the encoder.

Secondary, and useful: starved vision made the decoder ramble to its 4096-token
cap (~80s/page at 144 tokens vs ~30 at 784). Cutting vision tokens *raised*
decode cost. Budget dials must be priced end-to-end.

**What it licenses.** The inversion as an observation on this corpus, with
DeepSeek labeled global-view-only (production adds tiled crops). No
production-efficiency comparison.

**Status.** Run. One intro sentence + the decode-cost inset.

## Exp 2a — Bridge localization (§3, the diagnosis)

**Asks.** Where does OCR-relevant information become unrecoverable in the
production stack: the ViT, the 2×2 merger+MLP bridge, or the decoder?

**Why.** Exp 3 showed the encoder is not the binding constraint. If the loss is
localized to a single module, a cheap targeted repair becomes possible — which
is the entire premise of the paper.

**Architecture facts (verified in configs).** Qwen3.5-4B has
`deepstack_visual_indexes: []` — a **single bridge**, so this experiment is
architecturally complete for it. Qwen3-VL uses DeepStack `[5, 11, 17]` — plural
bridges, excluded; any VL result would have to tap all four paths.

**Design.**
- **Sites**: S1 pre-merge (ViT output before merger), S2 post-merge (= LM input
  embeddings in this architecture), S3 decoder mid-layer (image-token positions,
  fixed transcription prompt, layer ≈ depth/2).
- **Budgets**: {144, 400, 1024} merged-token equivalents + native.
- **Pre-merge readout, two modes**: concat-of-4 and mean-of-4 over the children
  of the containing merged cell. The concat-vs-mean gap is itself a result.
- **Capacity-matched heads**: all features pass through a seeded Gaussian
  projection to a common *d* before heads, so no arm wins on dimensionality.
  MLP calibrated at 300ep/3e-5. Raw-D results are secondary only.
- **Reconstruction test**: train an inverse S2→S1 on cached features; report
  feature-space residual R² and *functional* residual (probe accuracy on
  reconstructed-S1 vs true-S1). Only this licenses loss wording.
- **Sandwich artifact detector**: recoverable information cannot increase along
  S1→S2→S3. Any increase proves the earlier site's probe understated presence
  and downgrades affected claims.
- **Threshold rule**: a gap counts only if it exceeds both the bootstrap CI
  half-width and the smaller site's own linear→MLP lift.

**What it told us.**

1. **S1→S2 counts on glyph at every served budget** (@144 +.033/.037, @400
   +.021/.034, @1024 +.026). The bridge attenuates reading.
2. **At native the registered readouts fire the artifact detector** (S1 < S2) —
   the concat4/mean4 arms understate S1. Under the finest readout S1 ≫ S2
   (.797 vs .439). Readout granularity dominates that comparison, and the
   spread is itself a pre-registered result: fine-grained glyph accessibility
   lives in *individual pre-merge patches*.
3. **The reconstruction wall — the number the paper is built on.** Reconstructed
   S1 recovers glyph accuracy only to ≈ S2's own level at every budget:

   | budget | feature R² | glyph true→recon | gap |
   |---|---|---|---|
   | 144 | .242 | .110 → .108 | +.002 [−.005, +.010] |
   | 400 | .278 | .222 → .155 | +.067 [+.056, +.078] |
   | 1024 | .321 | .389 → .213 | +.176 [+.160, +.190] |
   | native | .438 | **.797 → .447** | **+.350 [+.336, +.364]** |

   At native resolution, the patch-level glyph signal accessible pre-merge is
   **not recoverable from post-merge features by inverses of the stated capacity
   (ridge + early-stopped 512-hidden MLP): 44% of true-S1 accuracy**. The
   residual shrinks monotonically as budget contracts — at 144 both sites are
   starved and S2 retains essentially everything S1 had.
4. **Signal specificity**: pl1_class shows only small S1-advantage gaps at
   compressed budgets (~+.02). Layout passes where text does not.
5. **pl2_extent Δ≈0 at every site and budget** (−.022 to +.012) —
   extent-beyond-position exists nowhere in the stack. Retained as a null.

**What it licenses.** Recoverability statements at stated inverse capacity, on
generated documents, for this stack. **Not** a causal claim — that is B1's job —
and not generalization to real pages — that is G2's.

**Status.** Run clean (48 fits + 4 reconstruction jobs, 0 errors; raw bundle
`validation/exp2a_summary.json`). Two open dependencies before write-up: **V0**
and **G2**.

---

# Part II — causal confirmation and the repair attempts

Ran in order **V0 → B1 → B2 (gate G1) → R4 → R5 → S1–S3**. The causal work
stands; every repair attempt failed. B4 (the residual-path design) and B5 (the
real-benchmark headline for a working repair) were never built — G1 and G1′
failed first, and the designs below are kept as the record of what was planned
and pre-registered, not as pending work.

## V0 — Merger architecture verification `verified`

**Asks.** Does `visual.merger` concatenate the 2×2 patch states along the
channel axis, or average/pool them?

**Why.** The entire method turns on this, and the paper states it as fact.
Expected: Qwen2-VL-lineage `PatchMerger`, `spatial_merge_size=2`, patch states
**concatenated** to 4·D then `ln → MLP → out_hidden_size`. If so, merging is
information-preserving and the loss is the *learned projection* — which makes
the framing sentence ("concatenation is lossless, projection is not") true, and
makes a residual on the map well-posed. "Pooling destroys detail" would be
obvious and uninteresting; "the projector throws away 44% of the text signal" is
a claim about capacity allocation during training, and it implies a cheap fix.

**Design.** Load the checkpoint, resolve the merger via `_find_merger`
([modal_phaseb_train.py](../pipelines/modal_phaseb_train.py)), record module repr,
`spatial_merge_size`, and a shape trace through a forward hook on one real page.
Read the installed transformers source — do not trust this file.

**Decides.** Concat → B4's residual source is the merger's 4·D input (R2 as
written). Pool → residual source becomes `patch − cell_mean`, and the framing
sentence changes. Same scaffolding either way; we do not get to write it wrong.

**Output.** `validation/v0_merger_arch.json`.

## B1 — Activation patching (§4, the causal experiment)

**Asks.** Is the localization causal, or an artifact of probe capacity?

**Why.** Probe deltas and reconstruction license "not recoverable at capacity
*d*". Only an intervention licenses a stage claim. This is the paper's one
causal experiment — breadth traded for one decisive result.

**Design.** ~100 glyph-heavy pages (text + math generators), each rendered clean
and degraded with the **same geometry** (`degrade.py` with the affine component
disabled — blur/noise/tint only) at identical dimensions, so token grids match.
Four conditions per page, full-stack greedy transcription at native resolution:

1. clean forward (anchor)
2. degraded forward (floor)
3. degraded + clean **S2 patch** (image-position `inputs_embeds` replaced during prefill)
4. degraded + clean **S3 patch** (image-position hidden states at layer ⌊n/2⌋)

S1 patching is omitted: the merger maps each 2×2 cell independently, so
patch-at-S1 ≡ patch-at-S2.

**Metric.** Restoration fraction = (patched − floor)/(anchor − floor), edit-sim
on text/math gold, doc-bootstrap CIs. **Negative controls**: patching a
mismatched page's clean features must NOT restore; clean-into-clean must be a
no-op.

**Pre-registered readings.** S2 restoration ≈ 1 → degradation-induced reading
loss is entirely upstream of the LM input; the decoder is exonerated as a reader
of what it is given. S2 restoration well below 1 → decoder co-adaptation matters
and bridge-only fixes are capped. S3 relative to S2 measures how much
recoverable signal survives to mid-decoder in usable form.

**Honesty clause.** If S2 restoration is low *and* B2 arm A wins anyway, say so
plainly. A repair that works without a clean causal story is still a repair,
reported as such — not narrated into a mechanism we did not measure.

## B2 — Bridge-only pilot vs decoder-LoRA control `GATE G1`

**Asks.** Can adaptation at the implicated stage recover transcription quality
that equal-compute adaptation elsewhere cannot?

**Why.** This is the go/no-go. It tests the paper's premise cheaply, before the
20k generation run and before any method engineering.

**Arms** (Qwen3.5-4B, bf16, identical data/steps/schedule):

- **A (bridge)** — merger/bridge trainable, encoder + decoder frozen. No format
  repacking: the output interface is unchanged, so "frozen decoder can't read
  the new format" is excluded by construction.
- **B (decoder control)** — decoder LoRA, trainable-parameter count matched to
  A within 2× (both counts reported), encoder + bridge frozen.
- **C (anchor)** — no training.

**Data.** Train on the 789 train-split docs (probe-harness split, seed 0), clean
native images → gold markdown. Eval on the 211 held-out docs; `frontier_score`
overall + per-generator, with glyph-heavy text/math sub-scores as the primary
readout. 3-point LR sweep per arm, best-of-3 on a 40-doc val slice, ~2 epochs.
Hours per (arm × LR) on one A100/H100-class GPU. This is the pilot, not the
retrain.

**Additional readout (cheap, do it).** Run the exp2a glyph probe on arm A's
*repaired* S2 features — the first estimate of "share of the 44% residual
recovered", and the number that ties §3 to §5. Probe-space statement; label it.

**Pre-registered decision rule (written before the run):**

| outcome | reading |
|---|---|
| A > B beyond CI | bridge confirmed as the recoverable stage → build the repair |
| A ≈ B > C | adaptation helps but is not stage-specific → method framing dead |
| A ≈ C | LoRA-scale capacity cannot move it → do not escalate compute without a design change |
| **B > A** | **hypothesis functionally unsupported → compute moves to decoder work** |

**Outcome: the last row.** Decoder-LoRA .6777 vs bridge .6082 (A−B −.070
[−.095, −.041]), with the probe-space readout flat (+.0007). Gate G1 failed.

**But note how this verdict was itself wrong-headed, which is the lesson.** G1
adjudicated a hypothesis using an arm whose training budget was never
validated: 700 docs / ~180 optimizer steps, with the auxiliary objective only
half-fit. R5 later showed the dose was the binding constraint. **A null only
adjudicates if the objective is demonstrably fit at that dose** — that rule
came out of this failure and now governs every gate we write.

## B4 — The repair (§5, the contribution)

**Asks.** Can a LoRA-scale residual at the implicated stage recover the measured
loss without touching encoder or decoder?

**Why.** The diagnosis hands us something rare: a defect with an address and a
number. B4 is the experiment that converts a measurement paper into a method
paper.

**Arms.**

| id | design | role |
|---|---|---|
| **R2** | **Residual detail path**: low-rank map from the merger's *input* (4·D concat) added to its output; merger frozen. Output interface unchanged by construction | **the contribution** |
| R1 | LoRA on the merger MLP itself (= B2 arm A) | "just train the bridge" baseline it must beat |
| R3 | Capacity-widened projector, width/rank swept | ablation: capacity or optimization? |
| R0 | DeepStack-style multi-path injection | reference ceiling and prior art — **never claimed as ours**. Qwen3-VL already does this, and our own pilot shows VL ahead on glyphs |

**Constraints (these are the claim).** Encoder and decoder frozen. Bridge output
interface byte-compatible. Trainable parameters at LoRA scale, counted in every
table. No serving-path change beyond loading the module.

**Training data.** The 20k glyph-weighted synthetic corpus ([ideas.md](ideas.md)
§Data). Rank selection first on the 789-doc split.

**Success condition (G3).** R2 > R1 and R2 > param-matched decoder-LoRA on
held-out synthetic `frontier_score`, doc-bootstrap CI — *before* any
real-benchmark compute.

**Specificity check (H4), run regardless of how the headline looks.** The repair
must move glyph-dependent metrics and leave `pl1_class` approximately flat. A
repair that lifts everything uniformly is a capacity effect, not a bridge
repair, and gets reported that way. This check can falsify our own mechanism
story, which is exactly why it ships.

**Held in reserve — R4 (diagnosis-supervised).** Auxiliary glyph-probe /
inverse-map loss on the repaired S2 alongside next-token CE. Do not run before
R2-on-CE has a number; it is worth more as the targeted answer to "you just
LoRA'd a projector" than as an undifferentiated third arm.

**Ablations that must ship.** Rank sweep; residual source (concat input vs
pre-merge patches vs `patch − cell_mean`); training-data mix (glyph-weighted vs
uniform); random-init residual and shuffled-target controls.

## B5 — Real-document evaluation (§6)

**Asks.** Does the repair hold on documents we did not render?

**Why.** Every number in this project so far is on our own renderer. The
headline table has to be real documents or the paper does not survive review.

**Design.** Benchmark list frozen before training (week 4): 4–5 of OmniDocBench,
OCRBench, DocVQA, ChartQA, InfographicVQA, TEDS on PubTabNet/FinTabNet. Once
frozen, **all of them are reported, including regressions.** Synthetic held-out
`frontier_score` is a diagnostic panel, labeled as such, never the primary claim.

**Controls.** Param-matched decoder-LoRA, no-train anchor, random-init residual,
shuffled-target residual.

**Peer methods** (the comparison reviewers will demand): projector/connector
designs — Honeybee-style locality-enhanced projector, abstractor families,
perceiver resampler, pixel-shuffle projection, DeepStack. Token-*reduction* work
(ToMe, FastV, PruMerge, VisionZip, SparseVLM, Matryoshka Multimodal, LLaVA-Mini)
is adjacent, cited in related work, not head-to-head — different problem.
**Verify every citation, venue, and reported number before use; these are from
memory and are not reliable.**

**Reporting.** Doc-bootstrap CIs on every delta; trainable-parameter counts in
every table; probe-space residual-recovered and task-space benchmark delta side
by side, never merged.

## B3 — Pixel-information control `optional`

**Asks.** Is the budget loss information never captured, or captured then
discarded?

**Why.** Answered a question the survival-curve framing asked. Under the repair
framing it matters only if a reviewer challenges whether the residual is a
*bridge* property or an *input-sampling* property.

**Design.** Within `qwen35_vit` only: adaptive-pool cached native merged grids
down to the ladder rungs and fit glyph probes at matched realized token counts
against the existing resolution rungs. Pooled-native ≥ resolution-rung → the
loss is input sampling. Reuses `derive_pooled` + `probe_fit`; no new extraction.

**Status.** Run; results in `validation/b3_pixel_control.json`. Appendix answer.
Do not extend.

---

# Gates

Ordered so a failure surfaces in week 2, not week 11.

| gate | when | question | failure action |
|---|---|---|---|
| **V0** | now, ~1h | concat or pool? | rewrite B4's residual source and the framing sentence |
| **G1** (B1 + B2) | wks 1–2 | is the bridge the recoverable stage? | **venue switch to TMLR/COLM; do not spend the 20k** |
| **G2** | wks 2–4 | does the diagnosis reproduce on real pages? | stop before training spend; restructure |
| **G3** (B4) | wk ~6 | does R2 beat R1 and the param-matched control on held-out synthetic? | redesign before real-benchmark compute |

## G2 in detail — does the diagnosis reproduce on real documents? `BLOCKING`

**Claim under test.** The S1→S2 glyph residual exists on real document pages,
not only on our renderer. Absolute numbers are not expected to transfer; the
residual's existence and rough magnitude must.

**Why it runs early.** It is the highest-variance unknown in the project and it
is cheap. If the residual is a synthetic artifact, the method has no motivation
on its own evaluation distribution — and that is far better learned in week 3.

**Design.** OmniDocBench (real annotated pages: layout classes + word-level text
GT) — glyph readout at marked points inside annotated text regions, plus
`pl1_class` from the layout annotations as the specificity contrast. Old-book
scans as a secondary anchor. Re-run the exp2a S1/S2 probe pair and the
reconstruction test at native resolution, same capacity-matched heads, same
split discipline, same shuffled controls. No new machinery — `site=premerge`
extraction + `probe_fit` + `reconstruct.py` already do this; only the label
pipeline is new.

| outcome | action |
|---|---|
| residual present, comparable magnitude | proceed to B4/B5 as planned |
| present but much smaller | motivation survives; **re-scope the headline number to real pages** and report the synthetic/real gap as a rendering-sensitivity result |
| absent on real pages | the diagnosis is a synthetic artifact. Stop. Restructure. Publishable as a negative |

Real scanned PDFs are never probe substrate (no latent labels) — they are
transfer-validation and eval only.

---

# Closed — deliberately not running

Recorded so these read as scope decisions, not oversights. Each reopens
automatically if its family returns to the paper (i.e. if G1 fails and the
survival-curve framing comes back).

- **pl2 probe redesign** (small-element / boundary-distance variants where the
  coordinate prior is weak). Closed: pl2 is refuted and demoted; exp2a already
  showed extent-beyond-position at no site and no budget.
- **Series counterfactual twins** (permuted palette / markers-only / dash-only /
  moved legend) + exact-pixel and swatch-matching color baselines. Closed:
  series_id is demoted. Real work, real experiment — it belongs to the other
  paper.
- **Raw-pixel probe ceilings and small-CNN references.** Closed for demoted
  families; **retained for `glyph_id`** as an appendix sanity check (can raw
  pixels at this crop read the character at all), since a broken synthetic task
  would invalidate the repair target.
- **OCR-engine reference for glyph_id.** Retained, appendix, cheap — the
  "solvable by off-the-shelf reading" ceiling. Reviewers ask for it.
- **DeepSeek crop path.** Closed as blocking; DeepSeek is a contrast tower with
  no efficiency claim attached, so the global-view-only label suffices.
- **Difficulty stratification** (the former `data.md` taxonomy). Closed: tags
  come out ~100% `hard` on dense synthetic pages, so they carry no
  discriminative power, and nothing in this paper stratifies on them.
  `difficulty_tagger.py` is implemented and tested (`tests/test_difficulty_tagger.py`)
  — leave it alone, don't extend it, don't recalibrate the cut points. What
  survives: the raw continuous covariates the generators already emit —
  `size_pt` above all, since it drives the glyph signal the repair targets — and
  the scan-severity presets, which are B1's causal instrument, not a difficulty
  axis.

## Generator additions for the 20k run

Insurance for new results, not validation of old ones:

- **Rendering variation** — anti-aliasing modes, subpixel positioning, DPI
  jitter. "Your effect is a renderer artifact" is now a first-order reviewer
  risk and it is cheapest to defeat at generation time.
- **Glyph-weighted mix** — ≥60% glyph-heavy (small `size_pt`, dense text, math,
  label-heavy charts): the pages where the measured residual lives.
- Keep exact-GT sidecars and scan-severity twins.

---

# Non-goals

No new encoders. No new probe families. No token-reduction method. No full
retrain — LoRA scale is both the claim and the constraint. No
production-efficiency comparison against DeepSeek until its crop path is
measured. No claim beyond document-domain stacks. Benchmark gaps contain
non-perceptual components (eval strictness, formatting, degradation); this work
bounds the perceptual share only.

---

# R4 — diagnosis-supervised bridge training (pre-registered 2026-08-16, authorized)

The reserved design change for the failed-G1 branch, now promoted to run.
Question: is the bridge residual *inert* (the decoder never needed what the
projector discards) or *unreached* (CE gave the bridge no gradient pressure)?
B2 established that CE-only training leaves the merger's feature geometry
untouched (probe Δ +.0007); R4 adds the diagnosis itself as training signal.

**Arms** (all: B2 arm-A recipe — full merger trainable, encoder+decoder
frozen, same 775-doc train split, same schedule, LR 3e-4 = arm A's winner):

- **R4a (glyph-probe aux)**: CE + λ · cross-entropy of a jointly-trained
  linear head reading S2 at the training images' glyph probe points
  (probes.jsonl, train docs only; torch bilinear readout on the merged
  grid). Pressure: make S2 carry glyph-discriminative features.
- **R4b (inverse-map aux)**: CE + λ · MSE of a jointly-trained linear head
  reconstructing the merger's own input (pre-merge patches, free in the
  same forward) from its output. Pressure: make the projection invertible —
  targets the 44% reconstruction residual directly.
- λ ∈ {0.1, 1.0} per arm (4 jobs). Aux heads are discarded at eval; they
  exist only to shape the merger.

**Readouts (both, never merged):** (1) probe-space — the b2_probe_readout
pipeline on each arm's repaired S2 (independently refit heads; stock
reference .4386 linear / .5029 mlp); (2) task-space — the 211-doc eval +
score, text/math slice and overall.

**Pre-registered adjudication:**

| probe-space | task-space | reading |
|---|---|---|
| lifts (CI-separated) | flat | residual is INERT — projector functionally exonerated; the loss it causes is signal the decoder never learned to use. TMLR story strengthens. |
| lifts | lifts (text/math) | repair path is LIVE — CE was the wrong tool; method paper revives with R4 as §5. |
| flat | any | aux loss failed to bind at this scale; report and stop — no further repair spend without new design. |

Guards: new checkpoint dirs /vol/phaseb/R4{a,b}_<lam>/ (B2 arms untouched);
frozen-set certification as in B2; aux-loss curves logged so "failed to
bind" is distinguishable from "bound but didn't transfer".

---

# R5 — the pin-vs-scale 2×2 (pre-registered 2026-08-16, authorized)

R4's bound-but-did-not-transfer outcome has two live explanations: (a) the
frozen decoder PINS the merger (any large reorganization breaks
decoder-readability → LM loss spikes → optimizer stays local; the linear-↑/
MLP-↓ re-allocation signature is the fingerprint), and (b) supervision/step
underdose (31.5k glyph points, 180 optimizer steps). The 2×2 isolates them:

|  | ~700 docs (pilot split) | ~5k fresh glyph-heavy docs |
|---|---|---|
| **bridge-only** (CE + λ=1 glyph aux; = R4a recipe) | **= R4a_1, already run** (probe +.017 n.s.; task .586) | R5b5k |
| **joint** (same objective; merger + decoder-LoRA r16 both trainable, encoder frozen) | R5j700 | R5j5k |

- Joint arms are NOT param-matched to bridge-only (that is not the
  question); trainable counts reported everywhere. Same λ=1 glyph aux, same
  LR 3e-4 (merger) with LoRA lr 3e-4, same schedule; 5k arms ~2 epochs
  (~1.2k optimizer steps).
- **Data**: ~5k fresh glyph-heavy synthetic docs (text+math ≈ 60/40, small
  size_pt biased, dense; generators' exact-GT sidecars; agent may cut to
  ≥3k if local generation throughput demands — count recorded). Train-only;
  eval stays the SAME 211 held-out pilot docs. New corpus at /corpus_r5.
- **Readouts** (all four cells): (1) probe-space repaired-S2 glyph vs stock
  (b2_probe_readout pipeline); (2) task-space on the 211 docs with the
  existing metrics PLUS a **content-normalized glyph metric** (edit-sim on
  lowercased alphanumeric-only content, markdown syntax stripped) on
  text/math — the de-formatted perception readout, computed retroactively
  for A/B/C/R4 arms too.
- **Pre-registered adjudication**: joint↑ where bridge-only stays flat (at
  either scale) → PIN confirmed; repair requires decoder co-adaptation —
  positive final act. Both ↑ only at 5k → dose story; scale further.
  All flat incl. joint@5k → saturation/interface claim is airtight; TMLR
  negative arc final. Probe-space primary; content-metric co-primary on
  task side; CI discipline as everywhere.

---

# S1–S3 — the Silico-informed follow-ups (pre-registered 2026-08-18; all run)

**Outcomes** (details in [results.md](results.md)): **S1** — every arm falls to
~.061 blind, so our task metric is image-driven, not priors; the "image
withheld" variant turned out to be *degenerate* for bridge-only arms (no image
tokens → the merger never runs → byte-identical to base), so the blank-page
variant is the load-bearing one. **S2** — the token budget moves real
benchmarks: 280→38.8, 560→56.8, ~1120 default→71.0, 2240→74.0 overall, with
`long_tiny_text` 1.4→90.5; doubling above the default buys +3.0 overall and
+12.7 fine-text for inference cost alone. **S3** — the collapse is rambling,
not silence (looping 7.5%→25.5%, cap-hits 5.7%→25.1%, zero empty outputs), net
−2,163 of 8,413 tests, `long_tiny_text` 0/442 fixed, and the two slices that
"improved" reward not emitting text.

Prompted by Goodfire/Silico's "Giving Qwen3-8B vision" report
(docs.goodfire.com/examples/qwen3-8b-vision-report), which trains a LLaVA-style
projector onto a text-only Qwen3-8B. Their setup differs from ours in a way
that matters: their decoder had NO prior vision interface, so a retrained
projector cannot break an expectation that never existed — the failure mode
that killed our repair (0.796 rel-Frobenius drift → −23 benchmark points)
is structurally impossible there. What transfers is their method, not their
project. All three items below need **zero training**.

## S1 — Blind control ("image withheld") on our task eval

Their control: run the trained model on the same questions with the image
removed, identical answer formatting. It exposed their MMMU win as language
priors (44.56 sighted vs 43.0 blind — the image was worth 1.6 points). We
have shortcut baselines on the probe side but **nothing equivalent on the
task side**, and our corpus is templated, so priors + format may carry more
of our task scores than we assume.

**Design.** Arms C (anchor), A (bridge CE), B (decoder-LoRA) on the same 211
held-out docs, same prompt, same greedy decoding, same scorers (raw +
content_edit_sim). Two variants: image withheld (no image at all) and blank
white page (keeps the image-token span — separates "no visual input" from "no
information in the visual input"). Readout: sighted − blind = **gain from the
image**, per arm and per family, with doc-bootstrap CIs.

**What it can overturn.** If blind ≈ sighted on any arm, that arm's task
score is not measuring perception, and every G1/R4/R5 task-space comparison
built on it is re-scoped accordingly. This is a check that can embarrass our
own earlier readings, which is why it is worth running now rather than never.

## S2 — Vision token budget vs external benchmarks (stock model only)

Their decisive ablation: every tile token (3,977) vs 4× pixel-shuffle
(1,009), same pixels, same geometry, same recipe → **+7.126 TextVQA at 11.07
standard errors**, and ≤ +0.74 on every non-reading benchmark. Cost: ~4×
inference on the image span, stage-2 training 24.5h vs 7.9h.

Note their own restraint, which we adopt: their compressed arm changed **two**
things (token count AND projector input width 1,152 → 4,608), so they claim
only "this compressor loses the gain", not "compression must". Our sweep
changes only the budget knob, so it is the cleaner version of the same
question — provided the serving path actually honors the knob, which the run
must VERIFY by logging realized image-token counts (a silently-ignored
max_pixels would invalidate everything).

**Design.** Stock Qwen3.5-4B, olmOCR-bench (1,403 pages), 4–5 budgets
including the current default (the 71.0 baseline), reporting all sub-slices,
**realized** token counts, and per-page generation cost. OmniDoc at the two
extremes if the trend is clear.

**Why it matters most.** It is the only experiment here with a deployable
answer, and it tests the alternative hypothesis our whole repair program was
built against: that the fix is *fewer bottlenecked tokens*, not a better map.

## S3 — Item-level forensics on the −23-point collapse

Their model: 745 items wrong→right, 339 right→wrong, and reading the actual
predictions revealed several "regressions" were exact-match scorer artifacts
("25 paisa" vs reference "25"), not misreadings.

**Design.** Item-level confusion (pass→pass / pass→fail / fail→pass /
fail→fail) for stock vs repaired on olmOCR, per test_type and per file;
failure-mode classification from **reading ~30 pass→fail predictions**
(empty / truncated / repetition / hallucination / format / script breakdown);
degeneration statistics over all predictions (mean length, empty fraction,
cap-hit fraction, repetition measure); and a direct test of whether the
`absent` slice (+8.3) rose because the model correctly identifies absence or
merely emits less.

**What it settles.** Whether the collapse is uniform degradation or a specific
generation failure — which determines whether an anchored retrain is worth
running at all.

## Not doing, and why

**Building a from-scratch adapter (their actual project).** Their recipe is
558,128 caption pairs + 742,400 instruction samples on 8 GPUs, and it lands
at **70.72 TextVQA vs the official model's 83.56** — 12.8 points short, which
they attribute to training-data scale. Document OCR needs more data than
TextVQA, not less. We would spend heavily to produce a model worse than the
one we already serve, and trade a measurement contribution for a second-tier
VLM. Explicitly out of scope.
