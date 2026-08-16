# What Survives the Bottleneck? Document Signal Retention in Vision Encoders

*(Alternative title: "Where Document Information Survives: Signal Retention under Vision-Token Bottlenecks")*

**Terminology contract (binding for all writing).** We say *signal retention*,
*probe accessibility*, *stage-wise attenuation*, *downstream utility*. We do
not say information "dies", "is lost", or "is destroyed" anywhere unless an
intervention (reconstruction test or activation patching) demonstrates
irrecoverability. Probing establishes accessibility to a probe of stated
capacity — never information-theoretic absence.

## Thesis

Vision-token budgets do not impose a uniform loss of document information.
They preferentially attenuate fine-grained visual signals while preserving
coarse structure, and encoder architectures differ in which signals they
retain. Crucially, representation-level retention does not necessarily predict
downstream utility: a heavily compressed, decoder-co-trained representation
can outperform a richer encoder at the same token budget.

The last sentence is the intellectual payoff; everything in the paper serves
it.

## Abstract (skeleton)

Vision–language models for document understanding must fit high-resolution
pages into a limited vision-token budget, and encoder families implement that
budget in architecturally different ways — some by reducing input resolution,
some through a separable compression stage. We lack a controlled account of
**which document signals remain recoverable at a given budget, and whether
representation-level retention predicts downstream utility**. Prior controlled
comparisons (Prismatic VLMs, Cambrian-1, MM1) varied encoders under a fixed
language stack on natural images at a single effective budget, reporting
end-task accuracy only. We probe frozen document encoders across a 16× token
range with capacity-matched heads, validated against shortcut baselines and
real-document (OOD) test sets, and pair the probe curves with end-task budget
frontiers on the corresponding full stacks.

**Findings: [slots — filled only after measurement validation passes; see
§Gates. No numeric thresholds asserted pre-data.]**

## The paper in four questions (the spine)

1. **What survives token compression?** Fine-grained reading (glyph identity)
   vs spatial extent vs structural gist, as the budget contracts 1024→64.
2. **Does the survival profile depend on encoder architecture?** Qwen vs SAM
   vs SigLIP2/NaFlex vs DeepSeek — specialization, not ranking.
3. **Does representation survival predict downstream utility?** Probe curves
   vs end-task budget frontier on the same corpus.
4. **Where does the discrepancy emerge?** Encoder → bridge → decoder
   (site-wise probing + reconstruction), confirmed by **one causal
   intervention** (activation patching at a single stage).

Everything else is supporting analysis. No fifth question.

## The paper in three figures

- **Fig 1 — Signal survival.** Retention vs realized tokens, one line per
  signal, faceted by architecture: establishes that budgets attenuate signals
  at very different rates.
- **Fig 2 — Encoder anatomy.** Signal × encoder heatmap at fixed budget:
  establishes architectural specialization (identity vs localization
  factoring differently across towers).
- **Fig 3 — Retention vs utility.** Probe-accessible glyph score vs
  low-budget end-task score, one point per stack: establishes that the two
  diverge sharply (the payoff).

Supporting inset: end-to-end decode cost vs vision budget (starved vision
inflates decoder output; budget dials must be priced end-to-end).

## Signal classes

- **S1 Glyph identity** — character readout swept against font size.
  Validity requires the shortcut battery (font-held-out splits, OCR-ceiling
  baseline) in §Gates.
- **S2 Cell geometry** — (row, col) index readout. Reported as margin over
  the coordinate baseline (x/y position alone predicts much of cell_col).
- **S3 Series–legend binding** — series-ID at a marked point. Claims beyond
  "local color is preserved" require color/marker/dash counterfactuals.
- **S4 Spatial extent** — element bbox regression from a point feature.
  Reported as margin over the coordinate-prior baseline (point position alone
  carries a strong extent prior). `point_value` is appendix-only until its
  per-axis normalization is fixed.
- **S5 Layout category presence** — renamed from "layout topology": per-class
  presence + counts is page gist, not topology. Topology claims require P-L2
  (extent) and P-L4 (reading order); P-L3 (pooled summary) is demoted to
  supporting.

## Towers (frozen; no additions)

| Arm | Family | Checkpoint |
|---|---|---|
| P1 | fixed-res contrastive | CLIP-ViT-L/336 (+ random-init floor) |
| A1 | fixed-res sigmoid | SigLIP2-So400m/384 (+ floor) |
| A2 | native-res packing | SigLIP2 NaFlex (+ floor) |
| A3 | native-res, production | Qwen3.5-4B tower (single bridge, `deepstack_visual_indexes: []`) |
| A4 | segmentation backbone | SAM-ViT-B pre-neck |
| P2 | serial compressed | DeepSeek-OCR DeepEncoder (SAM→16×conv→CLIP) |
| F1/F2 | full stacks | Qwen3.5-4B / DeepSeek-OCR end-to-end |

Seven towers is enough. **We do not add encoders** (no InternVL/Florence/
Pixtral); the marginal reviewer-value is negative — what the paper needs is
better controls, not more models. Qwen3-VL (DeepStack `[5,11,17]`) stays a
pilot-only reference with the multi-bridge caveat attached.

**Control note.** Exact matching of pretraining exposure is impossible. All
cross-family comparisons are matched-*measurement* frontiers atop documented
initializations with random-init floors; only A1→A2 (same SigLIP2 lineage) is
an architecture-clean contrast. DeepSeek serving uses tiled crops; our global-
view-only numbers are labeled **global-view budget frontier** until the crop
path is measured (§Gates), and no production-efficiency claim is made before
that.

## Budget mechanisms: resolution vs compression

The token knob is physically different per family (resolution scaling,
res-modes, post-hoc merge). Consequences: (a) the x-axis is **realized
tokens**, never nominal; (b) every point is mechanism-annotated (resolution /
res-mode / merge / native) and the figure encodes mechanism visually; (c) each
point also reports effective pixel coverage and spatial sampling density —
without these, budget curves conflate input sampling with feature
compression. **H3 is scoped**: the resolution-vs-compression decomposition is
identified only *within* the serial architecture (same encoder, same input
resolution, compressor varied) and within-tower via the pixel-information
control below. We do not claim to decompose loss across arbitrary families.

## Gates: measurement validation before any scaling

Reviewer-mandated and accepted: the next compute goes to validating the
measurement, not to Part II. Pre-registered plan and running results:
[measurement-validation.md](measurement-validation.md). Summary of what must
pass:

1. **Shortcut audit** (formal subsection in the paper): for every probe, the
   named shortcut (glyph→font/position; cell_row→y; cell_col→x; series→color;
   extent→position prior; layout→page template) is measured by an explicit
   baseline and either subtracted or broken by construction. First results
   already show cell_col and pl2_extent carry large coordinate components —
   all probe numbers will be re-reported as margins over these baselines.
2. **Baseline battery**: coordinate baseline, color baseline, raw-pixel probe
   ceiling, small-CNN reference, OCR-engine reference for glyphs.
3. **Glyph validity**: splits held out by font family (and character),
   position/background/anti-aliasing variation, distractor text.
4. **Series binding counterfactuals**: same chart re-rendered with permuted
   colors / marker-only / dash-only / moved legend. Retention after color
   permutation is the only evidence that binding exceeds color readout.
5. **OOD validation**: probes trained on generated docs, tested on real
   documents (real PDFs/scans with trustworthy GT, e.g. OmniDocBench layout +
   text annotations; old-book scans). The survival *ordering* must persist
   out of the synthetic rendering distribution.
6. **Pixel-information control** (the H3 instrument): within one tower,
   high-res encode → pool features to budget vs resize input → encode at
   budget. Separates information never captured from information captured
   then discarded. Cheap: Qwen native grids and resolution rungs are already
   cached; only the pooled arm is new.
7. **DeepSeek crop path**: run the full serving stack (tiled crops) across
   the ladder, or every DeepSeek claim stays labeled global-view-only.

If the core curves survive this battery, scale; if not, the paper's
contribution becomes the corrected measurement.

## Stage localization + the causal intervention

Site-wise probing on the production tower (pre-merge → post-merge → decoder
mid-layer), reconstruction test, DPI sandwich, capacity-matched heads:
pre-registered in [exp2a-bridge-localization.md](exp2a-bridge-localization.md).
Probe deltas license "not recoverable at capacity d"; only the reconstruction
test and patching license stronger wording.

**Activation patching (promoted — the paper's one causal experiment).** 2–3
interventions, not a patching study: encode a clean image and its
degraded/low-budget twin; patch the clean representation in at stage X;
measure end-task restoration on glyph-heavy and extent-heavy items. Stage
whose restoration recovers performance localizes the attenuation causally.
This replaces breadth (more probe variants) with one decisive experiment. Not
advertised in the abstract until results exist.

## Part II — one question (gated)

> Can decoder/bridge adaptation close the gap between encoder-level retention
> and task-level utility?

LoRA-scale bridge-only pilot (frozen encoder+decoder) with an equal-compute
decoder-LoRA control, on the stack the localization implicates. Full retrain
gated on the pilot moving OCR metrics. The former Exp-4 grid (7 encoders ×
LR sweep × transplant × compression ratios) is dropped from the paper's
scope; transplantability is a separate future paper. Gate order: measurement
validation → localization → LoRA pilot → (only then) scale.

## Hypotheses

- **H1 (survival order):** signals attenuate at different budget rates, and
  the ordering differs by encoder family.
- **H2 (specialization):** which signals a tower retains depends on
  architecture/pretraining (identity vs localization factoring).
- **H3 (mechanism, scoped):** within a serial architecture at fixed input
  resolution, the compression stage accounts for a measurable share of
  attenuation; within a single tower, pooling-after-encode differs measurably
  from resize-before-encode at matched token counts.
- **H4 (retention ≠ utility):** probe-level retention and end-task utility
  can invert across stacks at matched budgets.

No direction or threshold asserted pre-data. Flat outcomes publish as
invariance results.

## Related work positioning

Framed against Prismatic / Cambrian-1 / MM1 (controlled encoder comparisons,
natural images, single budget, end-task only): our contribution is
document-signal retention under a budget sweep, with shortcut-audited probes,
paired end-task frontiers, and stage localization. Goodfire/Silico's adapter
ablation (TextVQA −5.9 under 4× pixel-shuffle at fixed coverage;
x.com/GoodfireAI/status/2088298362730877139) is 3–4 sentences of motivation:
field evidence that text-like signals attenuate first under bridge
compression and that bridge retraining recovers some of it (~6/20 pts) — the
phenomenon we measure per-signal, per-stage, per-budget. The paper stands
without it.

## Demoted to appendix / cut

- P-L3 pooled layout summary (supporting only; renamed "layout category
  presence").
- `point_value` (until per-axis normalization lands).
- Transplantability (future work, one sentence).
- LR-sweep mechanics, knee-localization heuristics.
- Any activation-patching *framework* talk — only the 2–3 run interventions
  appear, with results.
- Slogans ("nobody reads under ~200 tokens", "text is the only thing that
  dies") — figures may show it; prose states the defensible version: among
  the signals tested, glyph identity exhibits the strongest budget
  sensitivity, while the tested structural probes remain comparatively
  stable.

---

*Internal mapping (remove before submission): measurement validation = the
current sprint and the gate for everything; Part I (validated curves +
localization + patching) feeds the gate review and the submission; Part II
LoRA pilot doubles as the Path-B build decision. Pilot findings and their
current validity status: [RESULTS.md](RESULTS.md).*
