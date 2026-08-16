# The Bridge is the Bottleneck: Localizing and Repairing Text-Signal Loss in Vision–Language Projectors

*(Alternatives: "Concatenation is Lossless, Projection is Not"; "Where Document
Text Dies in VLM Bridges — and a Drop-in Repair")*

**Target:** CVPR 2027, deadline ~mid-November 2026 (**VERIFY the exact date**).
**Fallback:** TMLR / COLM — taken automatically if gate G1 fails (§Gates).
**Decision date:** 2026-08-15 (Aman). This file supersedes the survival-curve
framing; see §Supersession for what changed and what was kept.

---

## Terminology contract (binding for all writing)

We say *signal retention*, *probe accessibility*, *stage-wise attenuation*,
*downstream utility*. We do not say information "dies", "is lost", or "is
destroyed" anywhere unless an intervention (reconstruction test or activation
patching) demonstrates irrecoverability. Probing establishes accessibility to a
probe of stated capacity — never information-theoretic absence.

**Extension for the method sections (new, binding).** A repair claim requires a
held-out *benchmark* delta with a doc-bootstrap CI against a
trainable-parameter-matched control. "Recovers X% of the bridge residual" is a
probe-space statement and must be labeled as such; it never stands in for a
task-level claim. The two are reported side by side and never merged into one
number.

---

## Thesis

Production document VLMs concatenate their pre-merge patch features losslessly
and then discard a large, *signal-specific* share of them in the projector's
learned map. The loss is (a) localized to one module, (b) quantified by a
reconstruction test, (c) confirmed causally by activation patching, and (d)
recoverable by a LoRA-scale residual path that requires no change to the
bridge's output interface and no retraining of encoder or decoder.

The claim that carries the paper is (d). Everything in §3–§4 exists to earn the
right to make it.

---

## Why this is a CVPR paper and the previous framing was not

The survival-curve paper ended at "here is a corrected measurement." That is a
TMLR contribution. CVPR buys a *method*, and the measurement is the thing that
tells you which method to build and gives you a number to beat. The pivot is
structural, not experimental — §3 and §4 below are already run.

| | old framing | this paper |
|---|---|---|
| contribution | 8-tower probe atlas | one localized defect + a repair |
| headline number | Qwen glyph .466 vs .091 floor | benchmark Δ vs param-matched control |
| towers | 7 + random-init floors | 2 (Qwen3.5 production, DeepSeek contrast) |
| probe families | 8 | 2 (`glyph_id`, `pl1_class`) |
| eval data | synthetic, ours | real benchmarks; synthetic is training + diagnostic |
| survival curves | the result | one motivation figure |

---

## Abstract (skeleton)

Vision–language models for document understanding compress a high-resolution
page into a small vision-token budget through a projector ("bridge") that merges
neighboring patch features. We show that in the production Qwen3.5-4B stack this
merge is **not** where the information is lost — the merger's 2×2 concatenation
is lossless by construction — and that the loss instead occurs in the projector's
learned map, is specific to fine-grained text signal, and is *not recoverable*
by inverses of substantial capacity: **44% of the pre-merge glyph readout is
unrecoverable from post-merge features at native resolution** (functional
residual +.350, CI [+.336, +.364]). Activation patching confirms the stage
causally. We then show the loss is largely *repairable*: a rank-r residual path
from the merger's input to its output, trained at LoRA scale with encoder and
decoder frozen and the bridge's output interface unchanged, recovers [X]% of the
measured residual and improves [benchmarks] by [Δ] over a
trainable-parameter-matched decoder-LoRA control. Structural signals (layout
class) show neither the loss nor the gain, making the effect signal-specific
rather than a general capacity increase.

**Numbers in brackets are slots. No numeric threshold is asserted pre-data.**

---

## The paper in four questions (the spine)

1. **Where does document text signal become inaccessible?** Site-wise probing
   across pre-merge (S1) → post-merge (S2) → decoder mid-layer (S3), with
   capacity-matched heads and a reconstruction test. — *run (exp2a_v1)*
2. **Is that localization causal, or an artifact of probe capacity?**
   Activation patching: clean/degraded twins, patch at one site, measure
   end-task restoration. — *coded (B1), not run*
3. **Can it be repaired without touching encoder or decoder?** A drop-in
   residual projector at LoRA scale, against a trainable-parameter-matched
   decoder-LoRA control. — *B2 arms exist; the method (R2) is new*
4. **Does the repair transfer off our rendering distribution?** Real-document
   benchmarks, and the diagnosis re-run on real pages. — *not started; gate G2*

Everything else is supporting analysis. No fifth question.

---

## The paper in four figures

- **Fig 1 — The anatomy + the repair.** One diagram: encoder → concat(2×2) →
  projector MLP → decoder, annotated with measured glyph accessibility at each
  tap (.797 → .439 at native) and the residual path drawn in. This figure has
  to carry the paper; reviewers read it before the text. Budget: two days of
  actual design work, not a matplotlib afterthought.
- **Fig 2 — Signal specificity.** Glyph vs layout-class accessibility across
  S1/S2/S3 × budget. Establishes the loss is not general compression: layout
  passes, text does not.
- **Fig 3 — The reconstruction wall.** True-S1 vs reconstructed-S1 glyph
  accuracy per budget (the +.350 native gap), with the inverse-capacity ladder.
  This is what licenses "not recoverable", and it gives the method its target.
- **Fig 4 — Repair vs control.** Benchmark deltas for R2 vs param-matched
  decoder-LoRA vs no-train anchor, with the probe-space residual recovered on a
  twin axis. The payoff panel.

Supporting inset (from the old paper, demoted): end-to-end decode cost vs vision
budget — starved vision inflates decoder output, so budget dials must be priced
end-to-end.

---

## Architecture: where the loss is, mechanically

**Verified 2026-08-15:** Qwen3.5-4B has `deepstack_visual_indexes: []` — a
single bridge — so this stack is architecturally complete for the experiment.
Qwen3-VL uses DeepStack `[5, 11, 17]` and is excluded from the causal work (any
VL result must tap all four paths).

**V0 — architecture verification (BLOCKING, do first, one hour).** The merger is
Qwen2-VL-style `PatchMerger`: `spatial_merge_size = 2`, patch states
**concatenated** along the channel axis (4·D) and passed through
`ln → MLP → out_hidden_size`. Confirm this against the *installed* transformers
release and the actual `visual.merger` module — read the code, do not trust this
paragraph. The entire method design turns on it:

- **If concat (expected):** merging is information-preserving; the loss is the
  learned projection 4·D → D_llm. A repair that adds capacity *to the map* while
  leaving the input and output interfaces alone is well-posed, and R2 below is
  the right instrument.
- **If averaging/pooling:** the loss is upstream of the map and R2 cannot work;
  the method pivots to a detail path carrying `patch − cell_mean`. Same
  experimental scaffolding, different residual source.

Record the outcome in `validation/v0_merger_arch.json` with the module repr and
the shape trace. This is a stated architecture fact in the paper, so it needs a
citation-grade check, not an assumption.

**Why this framing is the interesting one.** "Pooling destroys detail" is
obvious and uninteresting. "The concatenation preserves everything and the
*learned projector* throws away 44% of the text signal" is a claim about
training and capacity allocation, not about geometry — and it implies the fix is
cheap. That contrast is the paper's intellectual hook.

---

## The method (§5): design space and selection

Target defined by the diagnosis: recover the measured functional residual
(+.350 at native) without changing the bridge's output interface, without
touching encoder or decoder, at LoRA-scale trainable parameters.

| id | design | role |
|---|---|---|
| **R2** | **Residual detail path**: low-rank map from the merger's *input* (the 4·D concat) added to its output; frozen merger, trained residual. Drop-in; output interface unchanged by construction. | **primary — the contribution** |
| R1 | LoRA on the merger MLP itself (= B2 arm A as pre-registered) | "just train the bridge" control; also the honest baseline the method must beat |
| R3 | Capacity-widened projector (intermediate width / output rank swept) | ablation: is the loss capacity or optimization? |
| R0 | DeepStack-style multi-path injection | reference ceiling, **not** the contribution — it exists in Qwen3-VL and our own pilot shows VL ahead on glyphs. Cite it as prior art and as the expensive answer our cheap one approaches. |

**R4 — diagnosis-supervised training (the tie-breaker if R2 underperforms on CE
alone).** Train the residual with an auxiliary objective taken directly from the
diagnosis: a glyph-probe / inverse-map loss on the repaired S2, added to
next-token CE. This is the design that most tightly couples method to
measurement and is the most defensible novelty if a reviewer says "you just
LoRA'd a projector." Hold it in reserve; do not run it before R2-on-CE has a
number.

**Ablations that must ship:** rank sweep; residual source (concat input vs
pre-merge patches vs `patch − cell_mean`); training-data mix (glyph-weighted vs
uniform); signal specificity (does layout-class accessibility move? it should
*not*); random-init residual and shuffled-target controls.

---

## Evaluation contract (§6) — binding

**Primary evaluation is on real documents.** Our synthetic corpus is training
data and a diagnostic instrument. It is never the headline table. This is the
single change most likely to decide accept/reject.

- **Benchmarks (real):** OmniDocBench (layout + text), OCRBench, DocVQA,
  ChartQA, InfographicVQA, TEDS on PubTabNet/FinTabNet. Pick 4–5, freeze the
  list before training, report all of them including losses.
- **Diagnostic (synthetic, held-out):** `frontier_score` on the 211 held-out
  pilot docs, per-generator. Reported as a diagnostic panel, labeled as such.
- **Controls:** trainable-parameter-matched decoder-LoRA (B2 arm B), no-train
  anchor (arm C), random-init residual, shuffled-target residual.
- **Peer methods (the comparison reviewers will demand):** projector/connector
  designs — Honeybee's locality-enhanced projector (CVPR 2024; **verify
  citation**), C-Abstractor/D-Abstractor, perceiver-resampler bridges
  (Idefics2-style), pixel-shuffle projection (InternVL-style), DeepStack.
  Token-*reduction* work (ToMe, FastV, LLaVA-PruMerge, VisionZip, SparseVLM,
  Matryoshka Multimodal, LLaVA-Mini) is adjacent, cited in related work, and
  **not** a head-to-head comparison — different problem. **Verify every venue
  and result before citing; this list is from memory and is not reliable.**
- **Reporting:** doc-bootstrap CIs on every delta. Trainable-parameter counts
  for every arm, in the table, always.

---

## Data and training corpus

**The 20k scale-up is retargeted, not cancelled.** 20k synthetic pages is poor
*probe* data — we are bias-limited, not variance-limited, and no finding died of
sample size — but it is genuinely good *training* data for the repair, because
our generators emit exact glyph-, cell-, and bbox-level ground truth that no
real corpus provides. The B2 pilot currently trains on **789 documents**; that
is the actually-undersized number in this project.

Generation spec for the scale-up (owner: friend):

- **Glyph-weighted mix**, not a uniform scale of the pilot recipe: bias toward
  small `size_pt`, dense text, math, and label-heavy charts — the pages where
  the measured residual lives. Target ≥60% glyph-heavy.
- **Keep** scan-severity coverage (degradation twins are B1's instrument) and
  the exact-GT sidecars.
- **Drop** effort on the difficulty taxonomy — it tags ~100% hard on dense
  pages ([data.md](data.md)) and nothing in this paper stratifies on it.
- **Add** rendering variation (anti-aliasing, subpixel positioning, DPI jitter)
  — this is the cheapest available insurance against "your effect is a renderer
  artifact", which is now a first-order reviewer risk.

Real data is eval-only and never probe substrate (no latent labels).

---

## Gates and schedule

~13 weeks to the deadline. The gates exist so that a failure is discovered in
week 2, not week 11.

**G1 — the go/no-go (weeks 1–2). Run before anything else is committed.**
B1 activation patching + the B2 pilot, both already coded
([run_b1_patching.py](run_b1_patching.py), [modal_phaseb_train.py](modal_phaseb_train.py)),
decided by the pre-registered rule in [phase-b-causal.md](phase-b-causal.md) §B2.

- **A > B beyond CI** → the bridge is the recoverable stage. Build R2. This paper.
- **A ≈ B > C** → adaptation helps but is not stage-specific. The method framing
  is dead; the paper becomes "retention ≠ utility, and adaptation is not
  stage-specific" → TMLR/COLM. Do not spend the 20k.
- **A ≈ C** → LoRA-scale capacity cannot move it. Report as such; TMLR.
- **B > A** → hypothesis unsupported. TMLR, and the compute moves to decoder work.

**G2 — OOD transfer of the *diagnosis* (weeks 2–4).** Re-run the S1/S2 glyph gap
and the reconstruction test on real annotated pages (OmniDocBench word-level
text + layout). The claim under test is that the *bridge residual exists on real
documents*, not that our absolute numbers transfer. If it does not reproduce,
the diagnosis is a synthetic artifact and the method has no motivation — this is
the highest-variance unknown in the project and it is cheap, so it runs early.

**G3 — repair moves the diagnostic (week ~6).** R2 beats R1 and the
param-matched control on held-out synthetic before any real-benchmark compute is
spent.

| weeks | work |
|---|---|
| 1–2 | V0 merger verification; B1 patching; B2 pilot → **G1** |
| 2–4 | OmniDocBench diagnosis re-run → **G2**; freeze benchmark list |
| 3–6 | 20k glyph-weighted generation (parallel, friend) |
| 5–6 | R2 implementation + rank sweep on pilot data → **G3** |
| 6–9 | Train R1/R2/R3/R0 + controls on 20k; peer-method baselines |
| 9–12 | Real benchmark table, ablations, signal-specificity panel, Figs 1–4 |
| 12–13 | Writing, appendix, repro bundle |

---

## What leaves the paper

Cut or demoted to appendix. This is a real reduction, not a filing change —
each of these costs credibility per page it occupies.

- **Six of eight probe families.** Keep `glyph_id` (survives the full validity
  battery, 5.1× floor, no positional shortcut) and `pl1_class` (negligible
  positional shortcut) as the specificity contrast. Gone: `point_value`
  (negative R² everywhere — broken, never reported again), `pl2_extent`
  (refuted; coordinate prior beats every tower), `pl3` (page gist, not
  topology), `cell_row`/`cell_col` (largely coordinate readout).
- **Five of seven towers.** Keep Qwen3.5-4B (the stack being repaired) and
  DeepSeek-OCR (the compressed-bridge contrast). CLIP / SigLIP2 / NaFlex / SAM
  and the random-init floors move to one appendix table.
- **The budget sweep** → one motivation figure, not a results section.
- **The difficulty taxonomy** ([data.md](data.md)) — degenerate and unused here.
- **Transplantability**, the LR-sweep mechanics, knee localization — gone.
- **Slogans.** "Nobody reads under ~200 tokens", "text dies first". Figures may
  imply it; prose states the defensible version.
- **The 8-tower "encoder anatomy" framing.** It was a group photo in which seven
  subjects scored at floor. It is not a contribution and it invites the "you
  probed a lot and found one thing" review.

Nothing measured is deleted from the record — [RESULTS.md](RESULTS.md) keeps
every number, including the refuted ones. Demotion is a paper-scope decision,
not a retraction.

---

## Related work positioning

Three lines to distinguish ourselves from, in order of reviewer risk:

1. **Projector/connector design** (Honeybee, abstractor families, perceiver
   resamplers, pixel shuffle, DeepStack). *The* competitive shelf. Our
   difference: we do not propose a projector on intuition and show it wins — we
   *measure where the existing one fails, causally confirm the stage, and repair
   exactly that*, with the residual-recovered number as the bridge between
   diagnosis and method. Frame as diagnosis-driven design.
2. **Token reduction / budget compression** (ToMe, FastV, PruMerge, VisionZip,
   SparseVLM, Matryoshka Multimodal, LLaVA-Mini). Adjacent: they remove tokens,
   we fix what survives the ones we keep. Cite, do not compete.
3. **Controlled encoder comparisons** (Prismatic, Cambrian-1, MM1) — the old
   paper's home. Now two sentences: they vary encoders under a fixed stack and
   report end-task only; we localize *within* the stack and intervene.

Goodfire/Silico's adapter ablation (TextVQA −5.9 under 4× pixel-shuffle at fixed
coverage; bridge retraining recovers ~6/20 pts;
x.com/GoodfireAI/status/2088298362730877139) is now more than motivation — it is
the closest field precedent for the repair working, and it sets the expected
effect size for B2. 3–4 sentences, cited honestly as a non-peer-reviewed
result. The paper stands without it.

---

## Hypotheses

- **H1 (localization):** fine-grained text signal present at the merger's input
  is not recoverable from its output by inverses of stated capacity, while
  structural signal is.
- **H2 (causality):** patching the clean representation at S2 restores end-task
  transcription on degraded twins substantially more than at S3.
- **H3 (repairability):** a LoRA-scale residual at the implicated stage recovers
  a measurable share of the residual and of end-task quality that a
  trainable-parameter-matched intervention elsewhere does not.
- **H4 (specificity):** the repair moves glyph-dependent metrics and leaves
  layout-class metrics flat — the effect is signal-specific, not general
  capacity.

No direction or threshold asserted pre-data. **H3 failing is G1 failing**, and
the fallback venue is chosen, not improvised.

---

## Non-goals

No new encoders. No new probe families. No token-reduction method. No full
retrain — LoRA scale is the claim and the constraint. No production-efficiency
comparison against DeepSeek until its crop path is measured. No claim that the
repair generalizes beyond document-domain stacks; the evaluation is documents,
and the title says so.

---

*Internal (remove before submission): G1 decides paper vs venue and runs first;
[phase-b-causal.md](phase-b-causal.md) is now the paper's §4–§5 pre-registration,
not a gated Part II; [exp2a-bridge-localization.md](exp2a-bridge-localization.md)
is §3; [measurement-validation.md](measurement-validation.md) is the appendix
validity section, re-scoped to the two surviving probes. Measurement record and
demotion status: [RESULTS.md](RESULTS.md).*

---

## Supersession note (2026-08-15)

Replaces *"What Survives the Bottleneck? Document Signal Retention in Vision
Encoders"* (survival curves + encoder anatomy + gated Part II).

**Why.** That paper's contribution was a corrected measurement. Four of eight
probe families did not survive our own validity battery, the positive results
concentrated in a single tower, and the venue rewards methods. The measurement
work was not wasted — it is what identifies the defect this paper repairs, and
it is why we know the repair target is 44% rather than a guess.

**Kept intact:** the terminology contract; the gate discipline (measurement
validity before scale); pre-registration of decisions before data; the
random-init and shuffled-label control philosophy; the honesty of recording
refuted findings rather than quietly dropping them.

**Reversal condition.** If G1 fails, this file is superseded in turn and the
survival-curve framing returns as a TMLR submission with the corrected
measurement as the stated contribution. That outcome is a publishable paper, not
a failure — but it is not a CVPR paper, and we decide which one we are writing
in week 2 rather than week 11.
