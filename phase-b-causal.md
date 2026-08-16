# Phase B — causal confirmation and repair of the bridge bottleneck (pre-registered)

**Status change 2026-08-15: PROMOTED.** This file was the gated "Part II" of the
survival-curve paper. It is now the pre-registration for **§4 (causal) and §5
(method)** of the paper — the contribution itself. Framing:
[ideas.md](ideas.md). Diagnosis it rests on:
[exp2a-bridge-localization.md](exp2a-bridge-localization.md) → RESULTS.md §Exp 2a.

Gate context: exp2a's Phase-B condition is met (S1→S2 counts on glyph at every
served budget; reconstruction licenses a 44% native bridge residual —
functional residual +.350, CI [+.336, +.364]). Aman authorized the causal phase
2026-08-15. All claims scoped to the production Qwen3.5-4B stack; the corpus
scope is lifted from "pilot only" to "pilot + real benchmarks" by §B5.

Order: **V0 → B1 → B2 → (gate G1) → B4 → B5**. B3 is now optional (§B3).

---

## V0 — merger architecture verification (BLOCKING, ~1 hour)

The method design depends on a mechanical fact that must be read out of the
installed code, not assumed.

**Procedure.** Load the checkpoint, resolve `visual.merger` via `_find_merger`
([modal_phaseb_train.py](modal_phaseb_train.py)), record: module repr,
`spatial_merge_size`, the input/output shapes through a forward hook on one real
page, and whether the 2×2 reduction is a **concatenation** along the channel
axis (expected: `4·D → MLP → D_llm`, Qwen2-VL `PatchMerger` lineage) or a
**mean/pool**.

**Why it gates.** If concat: the merge is information-preserving and the loss is
the learned projection — B4's residual path (R2) is well-posed and the paper's
hook ("concatenation is lossless, projection is not") is real. If pool: the loss
is upstream of the map, R2's residual source changes to `patch − cell_mean`, and
the framing sentence must change. Same scaffolding either way; different paper
sentence, and we do not get to write it wrong.

**Output.** `validation/v0_merger_arch.json` — repr, shapes, verdict. Cited in
the paper as a stated architecture fact.

---

## B1 — Activation patching (causal localization, inference-only)

**Design.** ~100 glyph-heavy pages (text + math generators), each rendered
clean and degraded with the SAME geometry (degrade.py with the affine
scan-geometry component disabled; blur/noise/tint only) at identical
dimensions → identical token grids. Four conditions per page, full-stack
transcription (greedy, fixed prompt, native resolution):

1. clean forward (anchor)
2. degraded forward (floor)
3. degraded + clean **S2 patch**: image-position `inputs_embeds` replaced
   with the clean run's during prefill
4. degraded + clean **S3 patch**: image-position hidden states at layer
   ⌊n/2⌋ replaced with the clean run's during prefill

(S1 patching is omitted: the merger maps each 2×2 cell independently, so
patch-at-S1 ≡ patch-at-S2.)

**Metric.** Transcription score (frontier_score edit-sim on text/math gold)
per condition; **restoration fraction** = (patched − floor)/(anchor −
floor), doc-bootstrap CIs.

**Pre-registered readings.** S2 restoration ≈ 1 → degradation-induced
reading loss is entirely upstream of the LM input (encoder+input side;
decoder exonerated as a reader of what it is given). S2 restoration
substantially < 1 → decoder co-adaptation to degraded features matters and
"bridge-only" fixes are capped. S3 restoration relative to S2 measures how
much of the recoverable signal survives to mid-decoder in usable form.
Negative controls: patch with a mismatched page's clean features (must NOT
restore); patch clean-into-clean (must be a no-op).

**Paper role (new).** This is §4 and the sole causal experiment. It is what
upgrades the wording from "not recoverable at capacity d" to a stage claim. If
S2 restoration is low AND B2 arm A wins anyway, say so plainly — a repair that
works without a clean causal story is still a repair, but it is reported as
such, not narrated into a mechanism we did not measure.

---

## B2 — Bridge-only pilot vs decoder-LoRA control (the G1 go/no-go)

**Question.** Can adaptation at the implicated stage recover transcription
quality that adaptation elsewhere (equal compute) cannot?

**Arms** (all: Qwen3.5-4B, bf16, identical data/steps/schedule):
- **A (bridge)**: merger/bridge parameters trainable, encoder + decoder
  frozen. No format repacking — the bridge's output interface is unchanged,
  so the frozen-decoder-can't-read-it risk is minimized by construction.
- **B (decoder control)**: decoder LoRA, trainable-parameter count matched
  to arm A within 2× (both counts reported), encoder + bridge frozen.
- **C (anchor)**: no training.

**Data.** Train: the 789 train-split docs (probe-harness split, seed 0),
clean native images → gold markdown. Eval: the 211 held-out docs, clean
natives, frontier_score (overall + per-generator; glyph-heavy text/math
sub-scores are the primary readout). No degraded images in the pilot.

**Budget.** 3-point LR sweep per arm (equal sweep budget), best-of-3 by val
score on a 40-doc slice of train; ~2 epochs; hours on one A100/H100-class
GPU per (arm × LR). This is the pilot, not the retrain.

**Pre-registered decision — this is gate G1, and it selects the venue.**
Primary contrast: arm A − arm B on held-out overall score, doc-bootstrap CI.

| outcome | reading | action |
|---|---|---|
| **A > B beyond CI** | bridge confirmed as the recoverable stage | proceed to B4/B5; this is the CVPR paper |
| A ≈ B > C | adaptation helps, not stage-specific (Silico expectation, ~6/20-pt scale) | method framing dead → TMLR/COLM with the corrected measurement; **do not spend the 20k** |
| A ≈ C | LoRA-scale capacity cannot move it; may need a design change, not more compute | report as such; TMLR. Do not escalate compute |
| B > A | hypothesis functionally unsupported | TMLR; compute moves to decoder adaptation |

**Additional readout (new, cheap).** Run the exp2a glyph probe on arm A's
*repaired* S2 features. This gives the probe-space counterpart of the task-space
delta and is the first estimate of "share of the 44% residual recovered" — the
number that ties §3 to §5. Report it as a probe-space statement (terminology
contract).

---

## B3 — Pixel-information control (OPTIONAL under the new scope)

Within qwen35_vit only: adaptive-pool the cached NATIVE merged grids down to
the ladder rungs (mechanism `merge`) and fit glyph probes at matched realized
token counts against the existing resolution rungs (mechanism `resolution`).
Pooled-native ≥ resolution-rung at matched count → the budget loss is input
sampling (never captured). Resolution-rung ≥ pooled-native → post-hoc feature
compression is the cheaper dial. Reuses derive_pooled + probe_fit; no new GPU
extraction.

**Scope note.** This answered a question the survival-curve paper asked
(never-captured vs captured-then-discarded across budgets). The repair paper
only needs it if a reviewer challenges whether the residual is a *bridge*
property or an *input-sampling* property. Results already exist in
`validation/b3_pixel_control.json` — keep as an appendix answer, do not extend.

---

## B4 — The repair (the method, §5)

Pre-registered before implementation. Design space, selection rule, and
ablations in [ideas.md](ideas.md) §The method; restated here as the run contract.

**Arms.** R2 (residual detail path from the merger's input to its output;
frozen merger) is the contribution. R1 (= B2 arm A, LoRA on the merger MLP) is
the honest baseline it must beat. R3 (capacity-widened projector) is the
capacity-vs-optimization ablation. R0 (DeepStack-style multi-path) is a
reference ceiling and prior art, never claimed as ours.

**Constraints (binding — these are the claim).**
- Encoder and decoder frozen. Bridge output interface byte-compatible.
- Trainable parameters at LoRA scale; count reported in every table.
- No change to the serving path beyond loading the residual module.

**Training data.** The 20k glyph-weighted synthetic corpus (spec in
[ideas.md](ideas.md) §Data). Pilot-scale runs on the 789-doc split first for
rank selection; full runs only after G3.

**Pre-registered success condition (G3).** R2 > R1 and R2 > param-matched
decoder-LoRA on held-out synthetic frontier_score, doc-bootstrap CI, *before*
any real-benchmark compute is spent.

**Pre-registered specificity check (H4).** The repair must move glyph-dependent
metrics and leave `pl1_class` accessibility approximately flat. A repair that
lifts everything uniformly is a capacity effect, not a bridge repair, and must
be reported that way — this check can falsify our own mechanism story and is run
regardless of how the headline number looks.

**Held in reserve — R4 (diagnosis-supervised).** Auxiliary glyph-probe /
inverse-map loss on the repaired S2 alongside next-token CE. Do not run before
R2-on-CE has a number; it is the answer to "you just LoRA'd a projector", and it
is worth more as a targeted response than as an undifferentiated third arm.

---

## B5 — Real-document evaluation (§6)

**Binding: the headline table is real documents.** Synthetic held-out is a
diagnostic panel, labeled as such, never the primary claim.

- **Benchmark list frozen before training** (week 4, per the schedule): 4–5 of
  OmniDocBench, OCRBench, DocVQA, ChartQA, InfographicVQA, TEDS on
  PubTabNet/FinTabNet. Once frozen, all of them are reported — including
  regressions.
- **Peer methods.** Projector/connector designs (Honeybee-style locality
  projector, abstractor families, perceiver resampler, pixel shuffle,
  DeepStack). **Verify every citation and reported number before use.**
- **Controls.** Param-matched decoder-LoRA, no-train anchor, random-init
  residual, shuffled-target residual.
- **Reporting.** Doc-bootstrap CIs on every delta; trainable-parameter counts in
  every table; both the probe-space residual-recovered figure and the task-space
  benchmark delta, side by side and never merged.

**G2 dependency.** B5 assumes the diagnosis reproduces on real pages (gate G2,
[measurement-validation.md](measurement-validation.md) item 1). If it does not,
the method has no motivation on the eval distribution and the paper is
restructured before any training spend.

---

## Output discipline

Raw per-condition / per-arm JSONs + controls; restoration fractions and arm
contrasts with CIs; no conclusion prose in the bundles. Wording licenses: B1
restorations license causal stage claims for degradation loss; B2/B4 license
recoverability and repair claims at the stated parameter scale; neither licenses
generalization beyond the corpus until B5 lands. Agent-written conclusion
paragraphs are not evidence and are excluded from the results bundles.

## Non-goals

Benchmark gaps also contain non-perceptual components (eval strictness,
formatting, degradation); this work bounds the perceptual share only. No full
retrain. No new encoders. No token-reduction method. No claim beyond
document-domain stacks.
