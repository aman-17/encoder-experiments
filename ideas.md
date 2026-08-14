# Where Document Information Dies: A Controlled Study of Signal Survival across Vision-Encoder Bottlenecks

*(Alternative title, plainer: "Where Do Vision Encoders Lose Document Information?")*

## Abstract

Vision–language models for document understanding must fit high-resolution pages into a limited vision-token budget, and different encoder families implement that budget in architecturally different ways — some by reducing input resolution, some through a separable compression stage. We lack a controlled account of **which document signals survive a given budget, and where in the stack they are lost**. Prior controlled comparisons (Prismatic VLMs, Cambrian-1, MM1) varied encoders under a fixed language stack, but on natural images, at a single effective budget, reporting end-task accuracy only; diagnostic work on charts (FUGU; HKUST) has begun to localize information loss but remains task-narrow and encoder-agnostic.

We treat four encoder families as **information bottlenecks rather than competitors**: (i) fixed-resolution contrastive ViTs with tiled input; (ii) native-resolution patch packing; (iii) serial hybrids (windowed attention → 16× convolutional compression → global attention); (iv) serial hybrids whose global stage is a causal language model with learned reordering queries. Under a fixed decoder, we trace the survival of five signal classes — glyph identity, cell geometry, series–legend binding, spatial coordinates, layout topology — as the per-page budget contracts from 1120 to 64 tokens, and localize the stage (within-encoder, projection hand-off, decoder) at which each signal is lost.

**Findings: [slots — to be filled only after Part I completes; see pre-registered hypotheses H1–H3 in §7. No results are in hand and no numeric thresholds are asserted pre-data.]**

The result reframes encoder selection under a deployment token budget as a per-signal decision — which information one can afford to lose at a given cost — rather than an accuracy ranking.

**Control note.** Exact matching of pretraining exposure is impossible (CLIP-scale web pairs vs. SAM segmentation masks vs. text-pretrained LMs). Part I therefore uses frozen released components only, and Part II matches *adaptation* compute (identical document corpus, token count, and schedule) atop documented initializations, with a full provenance table and random-init controls to bound initialization effects. Only the A1–A2 contrast (same SigLIP2 lineage; resolution handling differs) is fully architecture-clean; all cross-family comparisons are interpreted as matched-adaptation frontiers, and localization claims are scoped to the towers on which they are measured (§4).

---

## 1. Core question

> What document information survives progressive vision-token budget reduction, and at which stage — within-encoder, projection hand-off, or decoder — is each signal lost, under different architectural bottlenecks?

"Survives" is defined operationally: recoverable by a probe of stated capacity. Linear probes measure **accessible** information; 2-layer MLP probes measure **present** information (probe capacity normalized by feature dimension). The gap between the two is retained as a methodological axis — it operationalizes present-vs-accessible (HKUST's central distinction) — but we make **no** pre-registered claim about how that gap orders across families.

## 2. Budget mechanisms: resolution vs. compression

The token-budget knob is physically different per family, and cross-family budget curves conflate two mechanisms:

| Family | Budget knob | What it physically does | Fixed-resolution compression sweep possible? |
|---|---|---|---|
| A1 fixed-res + tiling | tile count + merge ratio | changes coverage/effective resolution | No |
| A2/A3 native-res | max_pixels / merge ratio | changes input resolution | No |
| A4/A5 serial hybrids | res modes + crops **and** a separable 16× compressor | resolution *and* compression, independently addressable | **Yes** |

Consequences for design: (a) every point on a cross-family budget curve is annotated with its mechanism; (b) the serial families' separable compressor is the only place the compression component can be isolated at fixed resolution — in Part I via pre-/post-compressor probing on the released serial pipeline (Exp 2a), in Part II via trained compressor-ratio variants (Exp 4c). This converts the predictable reviewer objection ("you measured resolution sensitivity and called it compression") into hypothesis H3.

## 3. Signal classes (probed throughout)

- **S1 Glyph identity** — character/word readout swept against font size.
- **S2 Cell geometry** — (row, col) index readout; merged/spanning-cell topology.
- **S3 Series–legend binding** — series-ID readout at a marked point (color ↔ legend), swept over n_series and legend distance.
- **S4 Spatial coordinates** — point-coordinate regression (FUGU-style); bbox regression from pooled latents.
- **S5 Layout topology** — region adjacency and reading-order pair readout.

All synthetic with known latent labels; difficulty axes swept to produce degradation curves, not point estimates.

## 4. Towers

| Arm | Family | Composition | ~Params | Part |
|---|---|---|---|---|
| A1 | fixed-res + tiling | SigLIP2-So400m/14-384 + AnyRes | 400M | I (frozen) + II |
| A2 | native-res | SigLIP2 NaFlex | 400M | I (frozen) + II |
| A3 | native-res, production | Qwen3.5 native ViT | ~670M | I (frozen) + II |
| A4 | serial hybrid | SAM-base + 16× conv + CLIP-L (reassembled) | 380M | **II only** |
| A5 | serial LM-hybrid | SAM-base + 16× conv (out-dim 896) + Qwen2-0.5B, causal-flow queries | ~580M | **II only** |
| P1 | encoder reference | raw CLIP-ViT-L/336 | — | I |
| P2 | serial pipeline reference | released DeepSeek-OCR DeepEncoder (trained glue) | — | I |
| F1 | full production stack | released Qwen3.5-VL-4B (A3 + its projector + 4B decoder) | — | I |
| F2 | full serial stack | released DeepSeek-OCR (P2 + MoE decoder) | — | I |

**Why A4/A5 are Part II only:** as mere assemblies their glue (the 16× conv, output projections) is untrained; probing downstream of a random compressor is meaningless. In Part I, intra-pipeline serial probing therefore runs on **P2/F2**, whose glue is trained, with raw SAM-base and standalone CLIP-L as component references. A4/A5 enter the survival analysis only after Part II adaptation trains their glue. The released DeepEncoder is never used as a *trained arm* in Part II (its training data confounds the grid); it serves as Part I's trained serial reference. Inference FLOPs per page are reported at every budget alongside parameter counts.

---

## Part I — Frozen-stack study (inference only; publishable alone)

### Exp 1 — Survival trajectories on frozen towers *(primary)*

Towers A1–A3, P1, P2. Probe **at every budget rung**: {64, 100, 128, 192, 256, 400, 512, 784, 896, 1120}, with adaptive refinement — where a signal's curve drops fastest, add intermediate rungs to localize the knee. Linear + 2-layer MLP probes; controls: random-init encoder of each architecture + shuffled labels.

Output: per-signal, per-family **survival curves** — the order in which S1–S5 collapse and the budget at which each collapses. These curves are the paper's signature figures.

Engineering note (corrected from prior drafts): features are extracted **per budget**, not once. Full per-patch dumps at 10 budgets × 7 towers × probe-set scale run to tens of TB; the plan is to extract and fit probes on the fly per (tower, budget, signal), persisting only probe-site pooled features and fitted probe weights.

### Exp 2 — Stage-wise localization on frozen pipelines *(primary)*

- **(a) Intra-pipeline, serial:** P2/F2 probed at SAM output (pre-compressor), post-16×-conv, and post-global-stage, at fixed input resolution. This is the compression axis measured directly in information terms — the H3 instrument available without any training.
- **(b) Full-stack, three-site:** F1 and F2 probed at encoder output, post-projection, and decoder mid-layers. Deliverable: where each signal dies in stacks people actually ship, with zero training.

Localization claims in Part I are scoped to these towers.

### Exp 3 — Task frontier on existing stacks *(supporting)*

F1 and F2 across the budget ladder on ParseBench (primary; enterprise document distribution), OmniDocBench, and the internal hard slices, every point mechanism-annotated per §2. Supplies the practical cost curves that accompany — but do not headline — the survival analysis.

### Part I gate *(pre-registered)*

- Survival curves and localization **architecture-flat** → the Part II grid is not scientifically justified; Part I publishes as an architecture-invariance result ("the survival profile is a property of the budget, not the family"), and the internal decision defaults to data-first on the stock encoder.
- **Architecture-dependent** → Part II proceeds, on the arms the curves implicate.

Estimated cost: a few hundred H100-hours, dominated by feature extraction; probes are trivial.

---

## Part II — Matched-adaptation study (gated on Part I)

### Exp 4 — Adaptation grid with transplant control

- **(a) Primary route (headline numbers):** each encoder adapted **attached to the actual Qwen3.5-4B decoder** — projector warmup with all else frozen, then SFT on the unified grounded schema with an identical data mix, schedule, and encoder-unfreeze schedule across arms. 3-point LR sweep per arm (equal sweep budget).
- **(b) Transplant control (two arms only — one serial, one native-res):** continue-pretrain through a throwaway ~0.5B decoder (~30B document tokens), then transplant to the 4B. The route-(a)-vs-route-(b) delta is reported as a measured property — **transplantability** — not treated as a nuisance. Adaptation-loss flattening is inspected for all arms but explicitly does *not* license ignoring route effects; that is what the control is for.
- **(c) Compression-ratio variants (serial arm, optional):** {4×, 8×, 16×, 32×} compressors at fixed resolution — the trained end-task complement to Exp 2a for H3.

No GRPO anywhere in the paper.

### Exp 5 — Post-adaptation diagnostics

Full survival trajectories (Exp 1 protocol) and three-site localization (Exp 2 protocol) rerun on all trained arms. Small-N activation patching on clean/corrupted pairs (e.g., swapped legend colors) as **supporting causal evidence only** — not a primary claim.

### Exp 6 — Variance

One seed for the grid; three seeds on the two closest-competing arms at decision-relevant budgets; bootstrap over eval items elsewhere.

Estimated cost: ~1–1.5k H100-hours per arm including the LR sweep, plus the two-arm control route.

---

## 6. Evals

ParseBench (primary end-task anchor), chart → structured JSON with the tolerance-ladder matcher (S3 hard slice), table → HTML with TEDS + cell-F1 (dense/merged/borderless slices), full-page OCR edit distance, layout bbox mAP + both referring directions. Public + synthetic data only. Primary localization claims are anchored on charts and tables, where gold is trustworthy; layout/grounding results are secondary for localization because gold is noisier.

## 7. Pre-registered hypotheses and decision mapping

- **H1 (survival order):** the order in which S1–S5 collapse, and the budgets at which they collapse, differ by encoder family. *Adjudicated by Exp 1 (frozen) and Exp 5 (trained).*
- **H2 (bottleneck location):** the stage at which each signal dies — within-encoder, projection, decoder — differs systematically by family. *Adjudicated by Exp 2 on Part I towers; extended to A1–A5 by Exp 5.*
- **H3 (mechanism decomposition):** budget-induced loss decomposes into resolution-driven and compression-driven components; the compression component, isolable only in serial families, accounts for a measurable share of loss at fixed resolution. *Adjudicated by Exp 2a; strengthened by Exp 4c.*

All three are hypotheses; no direction or threshold is asserted pre-data. The former "Finding 3" (family-ordered linearization) is **removed as a claim**; the linear-vs-MLP gap remains in the toolkit as the accessibility axis only. If H1–H3 all come back flat, Part I publishes the invariance result and the internal decision simplifies to data-first on the stock encoder — under this framing, the flat outcome is a finding, not a failure.

## 8. Design choices and risk mitigations

- Framed explicitly against Prismatic / Cambrian-1 / MM1: the contribution is document-signal survival under a budget sweep with stage-wise localization, not the controlled comparison per se.
- Two-part structure is explicit; Part I is inference-only and publishable alone, and gates all training spend.
- The resolution/compression mechanism table is published; every cross-family budget point is mechanism-annotated.
- Transplant confound is measured (Exp 4b), not hedged.
- A1–A2 is the only fully clean architectural contrast; everything else is a matched-adaptation frontier atop documented initializations, with provenance and random-init controls.
- Per-budget feature extraction with an explicit storage plan; no "extract once" assumption.
- Serial-family intra-pipeline claims in Part I are scoped to trained pipelines (P2/F2), never to untrained assemblies.

---

## 9. Concurrent external evidence (Goodfire/Silico, Aug 2026)

Goodfire's autonomous research agent (Silico) trained a vision adapter for
Qwen3-8B, matched Qwen3-VL-8B on GQA/POPE/MMMU, lagged on TextVQA, and
self-diagnosed the cause as a too-coarse vision→language bridge
(x.com/GoodfireAI/status/2088298362730877139). Their ablation, vs. a single-384px
baseline (stated noise floor ±2 pts):

| config | TextVQA | GQA | POPE | MMMU |
|---|---|---|---|---|
| tiling, all tile tokens | **+7.0** | +0.4 | +0.7 | +1.3 |
| tiling, 4× pixel-shuffle | +1.1 | −1.3 | +0.3 | +2.2 |
| **compression cost (Δ)** | **−5.9** | −1.7 | −0.4 | +0.9 |

Only the TextVQA effects clear the noise floor. Absolute: 63.5 (baseline) →
70.6 (all tokens) vs. 83.5 (official Qwen3-VL-8B).

**Why this belongs in the paper's motivation, not its results:**

- **Field observation of H1's expected ordering.** "Text dies first, semantics
  survive" at the benchmark level = S1 (glyph identity) collapsing before
  semantic/layout signals — precisely the survival-order phenomenon Exp 1
  measures per-signal and per-family. Our pilot already shows the probe-level
  twin: the 16×-compressed serial reference (P2) sits at the glyph-probe floor
  while leading the pooled layout-summary probe; CLIP@336 equals its own
  random-init on glyphs.
- **Field observation of H3's compression component.** Both their conditions
  tile (coverage held constant); only the pixel-shuffle compressor varies. The
  −5.9 TextVQA delta is therefore a compression-driven loss at fixed effective
  resolution — the exact quantity Exp 2a/4c isolate, observed in the wild at a
  single ratio on a single stack.
- **Instrument contrast (the positioning sentence).** Silico localized the
  bottleneck *by intervention*: hypothesize → rebuild the adapter → overnight
  retrain → re-benchmark, with localization inferred from the fix working.
  Our probe suite answers the same question *by measurement*: pre-decoder,
  per-signal, across all towers simultaneously, at negligible cost — and the
  fact that all-tile-tokens recovered the gap implies the information existed
  in the encoder and died at the hand-off, which is exactly the stage
  distinction Exp 2's site-wise probing measures rather than infers. The two
  compose: probes to localize cheaply, intervention to confirm causally —
  structurally our Part I → Part II gate.
- **Their residual gap motivates Part II.** After the granularity fix they
  remain ~13 pts under the official stack (70.6 vs 83.5) — everything left is
  pretraining/data/recipe confounds, i.e. the matched-adaptation question.

Caveats when citing: single stack, single compression ratio, benchmark-level
metrics only (no per-signal decomposition), n=1 training run per condition
with a self-reported ±2 noise floor, and a tweet rather than a paper (check
for an accompanying blog/preprint before camera-ready).

---

*Internal mapping (remove before submission): Part I ≡ the Stage-0 deliverable — inference-only, runs within current constraints, feeds the gate review and the CVPR submission. Part II is gated on the same evidence that gates the Path B build; one compute budget serves the gate memo, the deck, and the paper.*