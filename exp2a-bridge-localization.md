# Exp 2a — Bridge localization on the production tower (pre-registered)

**Question.** Where does OCR-relevant information become unrecoverable in the
production stack: ViT proper, the 2×2 merger+MLP bridge, or the decoder?
**Driving hypothesis (Aman).** The bridge; corollary: retraining it with frozen
encoder+decoder lifts OCR benchmarks.

**Architecture facts (verified in configs, 2026-08-15).** Qwen3.5-4B:
`deepstack_visual_indexes: []` — single bridge; this experiment is
architecturally complete for it. Qwen3-VL: DeepStack `[5,11,17]` — plural
bridges; excluded from this experiment (any future VL version must tap all
paths).

## Design

Site × budget grid on the production tower, pilot-1k corpus, existing probes:

- **Sites**: S1 pre-merge (ViT output before merger), S2 post-merge (= LM input
  embeddings in this architecture), S3 decoder mid-layer (hidden states at
  image-token positions, fixed transcription prompt, layer ≈ depth/2).
- **Budgets**: {144, 400, 1024} merged-token equivalents + native. Prior
  expectation: effects concentrate at low budgets (pilot showed the merger
  passes substantial glyph signal at native).
- **Probe families**: `glyph_id` is the headline cell (validated: no
  positional shortcut, 5.1× majority floor). `pl2_extent` is headline
  *conditional on its refit* — the coordinate prior alone beats every tower
  (.235 mIoU; measurement-validation.md), so extent is measured here ONLY as
  Δ over the coords-only baseline with [features ⊕ coords] heads.
  `cell_row/col` (reported as margin over the coord shortcut), `pl1_class`
  secondary.
- **Pre-merge readout, two modes**: concat-of-4 children of the containing
  merged cell, and mean-of-4. The concat-vs-mean gap is itself a result:
  information in fine spatial arrangement vs in the features.
- **Heads**: linear + MLP at every (site, budget, readout). **Capacity-matched
  across dims**: all features pass through a seeded Gaussian projection to a
  common d before heads (one d for every arm, incl. concat-of-4); MLP
  parameter count fixed by construction. Raw-D results reported as secondary
  only. *This gates the run.*
- **Reconstruction test** (destruction vs re-encoding): train an inverse map
  S2→S1 on cached features; report (a) feature-space residual R², (b)
  functional residual — probe accuracy on reconstructed-S1 vs true-S1 for the
  headline families. Only this licenses any "information lost at the bridge"
  wording; probe deltas alone license "not recoverable at probe capacity d".
- **DPI sandwich check**: recoverable information cannot increase along
  S1→S2→S3. Any linear-probe increase along the chain is an artifact detector:
  it proves the earlier site's linear probe understated presence (see pl3
  precedent) and downgrades affected claims to MLP-head evidence.
- **Activation patching (the causal confirmation, 2–3 interventions only)**:
  clean image + low-budget/degraded twin; patch the clean representation in
  at one site (S1 or S2) during the twin's forward pass at matched
  positions; measure end-task restoration on glyph-heavy and extent-heavy
  items. The site whose patch restores performance localizes the attenuation
  causally — this, with the reconstruction test, is what licenses any
  stronger-than-accessibility wording. Not run until the probe grid picks
  the sites worth patching.

## Pre-registered decision thresholds

A site gap **counts** only if it exceeds BOTH (a) the bootstrap CI half-width
and (b) the smaller site's own linear→MLP lift (the accessibility yardstick).
Per-signal effect sizes are the result; no aggregate verdict. Expected a
priori: mixed-by-signal.

**Phase B gate.** Double-gated (2026-08-15): Phase B additionally requires
the measurement-validation battery ([measurement-validation.md](measurement-validation.md))
to pass on the families the decision rests on. If the S1→S2 gap counts on a
headline family at any served budget: run a **LoRA-scale bridge-only pilot
first** (frozen encoder+decoder,
small slice, hours) with an equal-compute decoder-LoRA control arm. Full
retrain is gated on the pilot moving OCR metrics; the Silico precedent
(bridge retrain recovered ~6/20 pts) sets expectations, and a frozen decoder
reading a re-packed format is an independent failure risk the pilot exists to
expose. If S1≈S2 everywhere that counts: the bridge is exonerated at probe
capacity; money goes to encoder resolution or decoder adaptation instead.

## Status: RUN COMPLETE (2026-08-15, exp2a_v1)

Machinery gate passed (pass_with_issues → all blocking fixes landed:
calibrated MLP 300ep/3e-5, children re-extraction, dual-inverse
reconstruction, pl2 as Δ-over-coords). Full grid: 48 fits + 4 recon, 0
errors. Results and pre-registered threshold outcomes: RESULTS.md §Exp 2a;
raw bundle validation/exp2a_summary.json. Headline outcomes: S1→S2 counts on
glyph at every served budget (Phase-B gate condition MET); at native the
registered readouts fire the artifact detector (S1<S2) while the
reconstruction test licenses the loss claim (functional residual +.350 CI
[.336,.364] — 44% of point-readout S1 glyph accuracy unrecoverable from S2);
S2→S3 is the largest registered-arm native gap (+.131, S3-interpretation
caveat applies); pl2 Δ≈0 at every site (extent-beyond-position nowhere in
the stack). Phase B (LoRA bridge pilot + decoder-LoRA control) awaits an
explicit go decision — training spend, and the validation battery's OOD +
counterfactual items are still open.

## Output discipline

Deliverables are raw per-(site×budget×family×head) JSONs + shuffled-label and
random-projection controls + the sandwich table. Agent-written conclusion
paragraphs are not evidence and are excluded from the results bundle.

## Non-goals

Benchmark gaps also contain non-perceptual components (eval strictness,
formatting, degradation); this experiment bounds the perceptual share only.
