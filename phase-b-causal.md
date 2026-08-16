# Phase B — causal confirmation of the bridge bottleneck (pre-registered)

Gate context: exp2a's Phase-B condition is met (S1→S2 counts on glyph at
every served budget; reconstruction licenses a 44% native bridge loss —
RESULTS.md §Exp 2a). Aman authorized the causal phase 2026-08-15. Three
experiments, ordered cheap→expensive; all claims scoped to the production
Qwen3.5-4B stack and the pilot corpus distribution.

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

## B2 — Bridge-only pilot vs decoder-LoRA control (the recoverability test)

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
sub-scores are the primary readout). No degraded images in the pilot; no
external benchmarks yet (ParseBench eval is the follow-up IF the pilot
moves).

**Budget.** 3-point LR sweep per arm (equal sweep budget), best-of-3 by val
score on a 40-doc slice of train; ~2 epochs; hours on one A100/H100-class
GPU per (arm × LR). This is the pilot, not the retrain.

**Pre-registered decision.** Primary contrast: arm A − arm B on held-out
overall score, doc-bootstrap CI. A > B beyond CI → the bridge is confirmed
as the recoverable stage; full bridge retrain is justified. A ≈ B > C →
adaptation helps but is not stage-specific (Silico expectation: partial
recovery, ~6/20-pt scale). A ≈ C → the pilot fails to move metrics; the
bridge loss may need more than LoRA-scale capacity — report as such, do not
escalate compute without a design change. B > A → hypothesis functionally
unsupported; money moves to decoder adaptation.

## B3 — Pixel-information control (captured-then-discarded vs never-captured)

Within qwen35_vit only: adaptive-pool the cached NATIVE merged grids down to
the ladder rungs (mechanism `merge`) and fit glyph probes at matched
realized token counts against the existing resolution rungs (mechanism
`resolution`). Pooled-native ≥ resolution-rung at matched count → the
budget loss is input sampling (never captured). Resolution-rung ≥
pooled-native → post-hoc feature compression is the cheaper dial. Reuses
derive_pooled + probe_fit; no new GPU extraction.

## Output discipline

Raw per-condition/per-arm JSONs + controls; restoration fractions and arm
contrasts with CIs; no conclusion prose in the bundles. Wording licenses:
B1 restorations license causal stage claims for degradation loss; B2
licenses recoverability claims; neither licenses generalization beyond the
corpus until the OOD battery item runs.
