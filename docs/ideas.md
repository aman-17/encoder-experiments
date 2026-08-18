# What Survives the Bridge? Text-Signal Loss in a Production Document VLM

*Working title. Companion docs: [results.md](results.md) is the measurement
record, [experiments.md](experiments.md) the designs and decision rules,
[speaker-notes.md](speaker-notes.md) the plain-language walkthrough.*

**Status (2026-08-18).** The diagnosis stands, three attempts to repair it
failed, and the lever that actually moves benchmarks turned out to be the
token budget. That is the paper. Venue: TMLR / COLM — a method paper is not
available to us on this evidence, and we say so rather than dress up a
negative.

---

## Terminology contract (binding for all writing)

We say *signal retention*, *probe accessibility*, *stage-wise attenuation*,
*downstream utility*. We do not say information "dies", "is lost", or "is
destroyed" unless an intervention — the reconstruction test or activation
patching — demonstrates irrecoverability. Probing establishes accessibility to
a probe of stated capacity, never information-theoretic absence.

**For repair claims:** a repair requires a held-out *benchmark* delta with a
doc-bootstrap CI against a trainable-parameter-matched control. "Recovers X%
of the residual" is a probe-space statement and is labelled as such. The two
are reported side by side and never merged. We learned this the hard way; see
§The result that outlives the failure.

---

## What we set out to ask

Production document VLMs plateau in the high-80s / low-90s. A three-stage
stack — encoder → projector ("bridge") → decoder — gives three candidate
places for the missing information to go. The projector is the suspicious one:
it merges each 2×2 block of patch features into one token, so it must discard
something, and fine text is the natural casualty. If that were the whole
story, retraining ~27M projector parameters with the encoder and decoder
frozen would be a cheap, large win.

We tested that, and it is not the whole story.

---

## Findings

### 1. The projector discards recoverable text signal (stands)

On the frozen production Qwen3.5-4B, with capacity-matched probes, document
splits, measured floors and shuffled-label controls:

- A linear readout on a single **pre-merge** patch identifies characters at
  **.797** (measured majority floor .091).
- **Post-merge**, the same readout gets **.44**.
- An inverse map trained to reconstruct pre-merge features from post-merge
  ones supports only **.447** — a functional residual of **+.350, CI
  [+.336, +.364]**, i.e. **~44% of the readable text signal is not
  recoverable** by inverses of stated capacity (ridge and early-stopped MLP).
  The instrument was validated on synthetic cases where the answer is known
  (invertible rotation → ~1.0, no gap; deliberately lossy projection →
  reproduces the observed gap).
- The effect is **signal-specific**: layout-class accessibility is unaffected.

The probe suite that produced this survived a shortcut audit that killed four
of our eight original probe families — that audit is why this number is
credible, and it belongs in the paper as such.

### 2. The loss is upstream of the LM input, and reading happens early (stands)

Activation patching on geometry-aligned clean/damaged twins (identical token
grids), with mismatched-page and self-patch controls:

- Patching clean features at the **projector output** restores transcription
  **fully** — the decoder is a competent reader of whatever it is handed.
- Patching at **decoder mid-layer** restores only **15%** [0.008, 0.283]. By
  that depth the damage is committed; visual evidence is consumed in the
  decoder's first half.

### 3. LoRA-scale repair of the projector fails — three ways (stands)

| attempt | probe-space | task / benchmark |
|---|---|---|
| CE-only, 700 docs | +.0007 (nothing) | task up, but it was task-adaptation, not perception |
| diagnosis-supervised (glyph-aux, inverse-aux), 700 docs | ≤ +.017, n.s.; MLP head *drops* | flat to negative |
| diagnosis-supervised, 5k docs | **+.083, CI-separated, both heads, specificity passes** | **olmOCR 71.0→48.0, OmniDoc 81.2→59.7, PulseBench .719→.368** |

The mechanism is identified: the projector's main weight moved **0.796
relative Frobenius** (vs 0.14–0.19 for every arm trained on our more diverse
corpus) while LM loss fell to ~0.002 on an ~11-template corpus. It learned a
private dialect for our renderer and handed the frozen decoder a distribution
it cannot read elsewhere — damage tracking the training distribution exactly
(English edit +.036 vs Chinese +.434). Item-level: net **−2,163 of 8,413**
tests; **`long_tiny_text` fixed 0 of 442** — the slice the repair targeted.
Failure mode is rambling, not silence (looping 7.5%→25.5%, cap-hits
5.7%→25.1%, zero empty outputs).

Untried and still plausible: anchoring drift (weight or output KL) so the map
improves without being rewritten; a real-document training mix; decoder
co-adaptation at a data scale comparable to the field's working recipes.

### 4. The token budget is the lever that works (stands, deployable)

Stock model, **no training**, olmOCR-bench with its official scorer, only the
vision token budget varied:

| nominal tokens | overall | long_tiny_text |
|---|---|---|
| 280 | 38.8 | 1.4 |
| 560 | 56.8 | 23.1 |
| ~1120 (harness default) | 71.0 | 77.4 |
| 2240 (cap raised) | **74.0** | **90.5** |

Doubling above the default buys **+3.0 overall and +12.7 on fine text** for
inference cost alone. This is the probe-level survival curve (reading steeply
budget-bound, structure flat) reproduced end-to-end on a public benchmark, and
it is close to Silico's +7.126 TextVQA from the analogous intervention on a
different stack. `absent` and `headers_footers` move *opposite* at every
budget — both reward not emitting text — so the benchmark's per-file average
understates real reading gains.

### 5. The result that outlives the failure (stands)

**A probe improvement that is CI-separated, present on both linear and
nonlinear heads, and passes its own specificity control is still not evidence
that a change helps.** We had all three and were wrong by >20 benchmark
points in the opposite direction. Corollaries adopted:

- The external benchmark is the **first** gate, not the last.
- A null only adjudicates if the training objective is demonstrably **fit**
  (aux loss well below its random floor) at that dose — an unfit objective's
  null says nothing about the architecture. This is what made our 700-doc
  "saturation" conclusion wrong.
- Weight drift from the stock checkpoint is a cheap early-warning signal
  available before any benchmark run.
- Report probe and task numbers side by side, always.

---

## Controls that make the above credible

Worth a methods section of its own, because each one changed a conclusion:

- **Measured floors, not assumed ones.** The glyph floor is .091 (most common
  character), not 1/80 — our first write-up used .04 and overstated every
  margin by >2×.
- **Shortcut baselines.** Coordinates alone reach .376 on cell_col and .235
  mIoU on extent — the latter beats every tower, which refuted our
  "SAM retains extent" finding outright.
- **Capacity-matched heads.** Padding real features with pure noise to 4×
  width inflates scores by +.029; the projection to a common 512 dims
  collapses that to +.002.
- **Blind control** (image withheld / blank page). Every arm falls to ~.061
  without the image, so our task metric is genuinely vision-dependent — unlike
  Silico's MMMU, where the image was worth 1.6 points. Note the trap we found:
  "image withheld" is *degenerate* for bridge-only arms (no image tokens →
  the merger never runs → byte-identical to base, verified 211/211), so the
  blank-page variant is the load-bearing one.
- **Font-held-out splits.** Glyph .466 → .412 out-of-font: reading, not font
  memorization.

---

## Related work

1. **Projector / connector design** (Honeybee, abstractor families, perceiver
   resamplers, pixel shuffle, DeepStack). The competitive shelf. Our
   difference: we measure where the deployed one fails, localize it causally,
   and report honestly that repairing it at LoRA scale did not work. **Verify
   every venue and number before citing; our list is from memory.**
2. **Token reduction / budget compression** (ToMe, FastV, PruMerge, VisionZip,
   SparseVLM, Matryoshka Multimodal, LLaVA-Mini). Newly *central* rather than
   adjacent, since the budget is our positive result: they remove tokens, we
   measure what removing them costs per signal.
3. **Controlled encoder comparisons** (Prismatic, Cambrian-1, MM1). Two
   sentences: they vary encoders under a fixed stack and report end-task only;
   we localize within the stack and intervene.
4. **Goodfire/Silico's "Giving Qwen3-8B vision"**
   (docs.goodfire.com/examples/qwen3-8b-vision-report). The closest external
   work and genuine corroboration: their all-tile-tokens vs 4×-pixel-shuffle
   arms differ by **+7.126 TextVQA at 11.07 standard errors** on the reading
   benchmark and ≤ +0.74 elsewhere. Note their restraint, which we adopt —
   their compressed arm changed token count *and* projector input width, so
   they claim only "this compressor loses the gain", not that compression must.
   Their setup differs from ours in a way that matters: their decoder had no
   prior vision interface, so a retrained projector cannot break an
   expectation that never existed — the exact failure mode that killed our
   repair. Cite carefully: single runs, no seed replication, a *stipulated*
   ±2 floor, and 28.8% POPE train/eval overlap, all of which they disclose.

---

## Non-goals

No new encoders. No new probe families. No from-scratch adapter (their recipe
is ~1.3M samples on 8 GPUs and still lands 12.8 points short of the official
model on the one benchmark that measures reading; we would spend heavily to
ship something worse than what we serve). No full retrain — LoRA scale was the
constraint and the claim. No production-efficiency comparison against DeepSeek
until its crop path is measured. No claim beyond document-domain stacks.

---

## Pivot history (kept deliberately)

Three framings, each killed by our own controls. This is the record of how the
current one was arrived at, and it is short on purpose.

1. **Encoder anatomy / survival curves** (8 towers × 8 probe families). Died
   when the shortcut audit refuted four families and the positive results
   concentrated in one tower. Survives as: the survival curves, the validity
   apparatus, and one motivation figure.
2. **"The Bridge is the Bottleneck"** — diagnosis + repair, aimed at CVPR.
   Diagnosis survived; the repair failed three times, decisively on external
   benchmarks. Survives as: findings 1–3.
3. **Current.** Diagnosis + causal localization + a documented repair failure
   with mechanism + the token-budget positive + the probe-vs-benchmark
   divergence as a methodological contribution.

Nothing measured was deleted at any pivot — [results.md](results.md) keeps
every number, including the refuted and withdrawn ones.
