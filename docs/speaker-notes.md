## 1. The question we started from

Our OCR models plateau in the high-80s / low-90s on benchmarks. Nobody could
say *where* the missing information goes. A document VLM has three stages:

```
  page image → [ vision encoder ] → [ projector / "bridge" ] → [ decoder ] → text
                   "the eyes"        "the translator"          "the writer"
```

The encoder looks at the page. The projector compresses what it saw into the
tokens the language model consumes — in Qwen3.5 it takes each 2×2 block of
image patches, glues them together, and maps them into the decoder's
vocabulary space. The decoder writes the answer.

My (Aman's) hypothesis: **the projector is the leak.** It compresses 4 patches into
1 token, so it must throw something away, and fine text is exactly the kind of
detail that would die there. If true, retraining just that one small module —
leaving the expensive encoder and decoder frozen — should recover accuracy
cheaply.

Everything below is the attempt to prove or kill my idea.

---

## 2. How you measure "where information dies"

We can't open the model and read off "text is gone here." What we can do is
ask, at each stage: **can a simple readout still recover the answer from this
representation?**

Concretely: render a page, mark a specific pixel where the letter "R" sits,
grab the model's internal feature vector at that spot, and train a tiny
classifier to predict *which character it was*. If the classifier gets it
right, the information survived to that point. This is a **probe**.

Three taps on the production model:

- **S1** — right before the projector (what the encoder saw)
- **S2** — right after the projector (what the decoder receives)
- **S3** — halfway inside the decoder

We also probed layout (what kind of region is here — heading, table, figure)
as a control: if *everything* degrades equally, that's just generic
compression; if only text degrades, that's a specific defect.

**Why so much scaffolding first.** Probes lie easily. Before trusting a single
number we had to prove the probe wasn't cheating:

- Can the answer be guessed from the *pixel position* alone? (For table
  columns: mostly yes — that probe was junk. For characters: no.)
- Does it work on fonts it never saw in training? (Yes — .466 → .412, so it
  learned reading, not font memorization.)
- Are we comparing feature vectors of different widths fairly? (We now project
  everything to a common dimension first, so a "wider" representation can't
  win by width alone.)

---

## 3. How the numbers are actually made

Three different kinds of number appear in this talk, and they are produced in
three different ways. Worth being precise, because the whole argument depends
on them not being the same thing.

### (a) Probe accuracy — ".797 at the encoder, .44 after the projector"

**Where the ground truth comes from.** We generate the pages ourselves, so we
render from a PDF and then read its text layer back out (pymupdf). That gives
the exact bounding box of every character on the page — no human labels, no
OCR in the loop, no label noise. We take each character's centre, express it
as a fraction of page width/height, and store `(x, y) → "R"`. We sample up to
60 characters per page.

**Getting a feature vector for that point.** The model sees the page as a grid
of patches. A point at (0.41, 0.62) falls somewhere on that grid, so we read
the feature there by bilinear interpolation of the surrounding patch vectors —
and a point exactly at a patch centre returns that patch's vector untouched
(pinned by unit tests, because this is the kind of off-by-half-a-patch bug
that would quietly invent a result). At the pre-projector tap the grid is 2×
finer in each direction, since that is precisely what the 2×2 merge collapses.

**Fitting the readout.** For each stage we now have ~41,000 (vector, character)
pairs across 1,420 pages. We split **by document**, 80/20 — every point from a
page goes entirely to train or entirely to test, asserted in code, so the
classifier can never see a page it will be tested on. Then we fit two heads:
a linear one (logistic regression) and a small 2-layer MLP. The linear head
measures what is *easily* accessible; the MLP measures what is present but
tangled. Accuracy is plain top-1 on the held-out documents, ~8,600 test points.

**The four guards that make the number trustworthy:**

- **Chance floor**: 80 character classes, but they're not uniform — the most
  common one alone is 9.1% of the data. So the floor is **.091**, not 1/80.
  We measured it rather than assuming it, and it turned out our original
  chance estimate had been wrong by 2×.
- **Shuffled-label control**: refit with the training labels randomly
  permuted. It lands at floor. If it didn't, the pipeline would be leaking.
- **Equal-capacity comparison**: different taps have different vector widths
  (1024 pre-projector vs 2560 after). A wider vector can win on width alone,
  so every arm is first projected through the same fixed random projection
  down to 512 dimensions. We verified this matters: padding features with
  pure noise to 4× width inflates the score by +.029 without the correction
  and +.002 with it.
- **Confidence intervals**: resample the *test documents* 1,000 times with
  replacement. Every number we act on is reported with that interval, and
  "moved" means the intervals don't overlap — not that the mean shifted.

So "+.083" means: same pages, same points, same split, same head size, same
guards — only the projector's weights differ, and the intervals are disjoint.

### (b) The reconstruction number — "44% unrecoverable"

Probes can only ever say "a readout of this size couldn't get it." To say
information is *gone*, we train a second model whose only job is to map
post-projector features back to pre-projector features, then run the character
probe on those reconstructions. If the information were merely rearranged, a
good inverse recovers it. Ours plateaus at .447 versus .797 from the genuine
article, using both a ridge and a neural inverse. Sanity-checked on synthetic
cases first: an invertible rotation gives ~1.0 and no gap; a deliberately
lossy projection reproduces the gap we see. That is what licenses the word
"lost" instead of "less accessible."

### (c) Task scores — the end-to-end numbers

Here the model actually generates. We hold out **211 documents** that no
training arm ever saw, feed each page with a fixed transcription prompt,
decode greedily (no sampling, so the run is reproducible), and score the
output against the gold markdown: **TEDS** for tables, **edit similarity** for
text and math, a rule-based recall for chart data. Same prompt, same decoding,
same scorer for every arm — the only variable is weights.

One wrinkle we had to add: a model can score better simply by learning our
markdown conventions. So we also compute a **content-only** version — strip
all markdown/LaTeX syntax and punctuation, lowercase, then compare — which
measures *what characters it read* rather than *how it formatted them*. That
distinction is what exposed the first repair attempt as a formatting gain
rather than a vision gain.

### (d) External benchmarks — the ones that count

Everything above is our own data and our own scorers, which is right for
isolating a mechanism and worthless as proof to anyone else. So the final step
runs the stock model and the repaired model through **public benchmarks with
their official scorers** — olmOCR-bench, OmniDocBench, PulseBench-Tab — on
identical settings. To make sure the comparison is honest we build the
repaired checkpoint by copying the stock one and overwriting *only* the 27.3M
projector tensors, then verify tensor-by-tensor that nothing else changed.

---

## 4. What we found: the diagnosis

**At the encoder (S1), text is vividly present.** A linear readout on a single
pre-projector patch identifies characters at **.797 accuracy** (chance ≈ .09).
The eyes are excellent.

**After the projector (S2), that drops to ~.44.**

Then the key control, because a drop in probe accuracy could just mean
"reorganized, not lost": we trained an **inverse map** — a model whose only
job is to reconstruct the pre-projector features from the post-projector ones.
If the information were merely rearranged, reconstruction should recover it.

It didn't. Reconstructed features support only .447 character accuracy versus
.797 from the real thing. **~44% of the readable text signal is genuinely not
recoverable after the projector.** That is the diagnosis, and it survived
every validity check we threw at it.

**The causal confirmation.** We took pairs of pages — one clean, one damaged
until the model misread it — and during inference *transplanted* the clean
representation into the damaged run at each stage:

- Patch at the projector output → transcription is **fully restored**. So the
  decoder is not the problem; give it good features and it reads perfectly.
- Patch halfway into the decoder → only **15%** restored. By that depth the
  damage is baked in; the decoder consumes visual evidence early.

Diagnosis complete: **the loss happens at or before the projector's output,
and the decoder is an innocent reader of whatever it's handed.**

---

## 5. The repair — including the part where we got it wrong

**Attempt 1 (failed).** Train the projector on document transcription with the
encoder and decoder frozen. Result: scores rose a lot… but a control arm that
instead trained a bit of the *decoder* rose more. And crucially, when we
re-probed the "repaired" projector, character accuracy hadn't moved at all
(+.0007). **The gains were the model learning our markdown formatting, not
learning to see.** That distinction only became visible because we ran the
probe alongside the benchmark — a benchmark number alone would have fooled us
in both directions.

**Attempt 2 (also failed, at the time).** If plain transcription loss doesn't
pressure the projector to preserve text, supervise it *with the diagnosis
itself*: add a loss that explicitly rewards the projector for keeping
characters readable, and another that rewards it for being reconstructable.
Both objectives trained fine. Probe: still flat. We wrote it up as a negative
result and concluded the projector was saturated.

**That conclusion was wrong, and finding out why is the most useful thing we
learned.** Two other explanations existed:

- Maybe the *frozen decoder* was pinning the projector — any big change would
  break what the decoder expects, so the optimizer stays put.
- Maybe we simply hadn't fed it enough. ~700 documents, ~180 optimizer steps,
  31.5k supervised characters. That is very little to reshape a 27M-parameter
  module.

So we ran a 2×2: {frozen decoder, decoder free to adapt} × {700 docs, 5,000
fresh text-heavy docs}. This is the experiment that answers it.

**Result:**

| | 700 docs | 5,000 docs |
|---|---|---|
| decoder frozen | +.017 (noise) | **+.083 ✅** |
| decoder free | +.011 (noise) | **+.081 ✅** |

- **Data was the answer.** 10× the character supervision converts a
  nothing-burger into a solid, statistically separated **+.083** — roughly
  **23% of the lost signal recovered** — and this from checkpoints that only
  got through *one* epoch before hitting a timeout.
- **The frozen decoder was never the obstacle** — the two rows are identical.
  Good news for deployment: you don't need to touch the decoder.
- **The strongest evidence it's real:** in every earlier attempt, the linear
  readout crept up while the nonlinear one *dropped* — signal being shuffled
  around, not added. At 5k, **both go up together**. That's new information
  arriving at the decoder's doorstep, not reshuffling.

**So how did we repair it, in one sentence?** We trained the projector alone
(encoder and decoder frozen, ~27M parameters, LoRA-scale) on transcription
*plus* an auxiliary loss that explicitly requires each output token to keep
its characters identifiable — and, critically, we gave it enough
character-supervised data (300k labelled glyph points) for that pressure to
actually reshape the map.

### …and then the real benchmarks said no

**This is the punchline of the whole talk, so don't skip it.** We took that
repaired checkpoint — identical to stock except 27M projector weights,
verified tensor by tensor — and ran it on public OCR benchmarks with their
official scorers:

| benchmark | stock | repaired | change |
|---|---|---|---|
| olmOCR-bench | 71.0 | 48.0 | **−23.0** |
| OmniDocBench | 81.2 | 59.7 | **−21.6** |
| PulseBench-Tab (mean) | .719 | .368 | **−.35** |
| PulseBench coverage | 92.1% | 69.2% | 560 pages emit no table markup |

Not a small regression — a collapse. And the shape of it explains itself:

- **It doesn't go silent — it rambles.** Zero empty outputs, but average
  output length doubled, generation hit the token cap 5.7% → 25.1% of the
  time, and looping/repetition went 7.5% → 25.5%. One page repeated
  `- **PRESIDENTIAL**` until the cap (22,244 characters); another emitted
  `\! \! \!` 3,970 times. This is the same signature we saw when we starved
  the model of vision tokens back in the budget sweep: give the decoder
  visual features it cannot read — too few, or wrongly shaped — and it loops.
- **On the slice the repair was built for, it fixed nothing.** `long_tiny_text`:
  **0 of 442** tests went from fail to pass, while 259 went from pass to fail.
- **The two slices that "improved" are degradation in disguise.** `absent`
  rewards *not* reproducing a forbidden string. The newly-passing pages are
  2.4× longer, and the model passes by *garbling* that string below the
  scorer's threshold — fidelity to it drops .995 → .705 on exactly those items.
- English text degraded least (+.036 edit distance); Chinese degraded most
  (+.434). Our 5k training corpus is latin-only. The damage follows the
  training distribution precisely.
- The projector's main weight matrix had moved by **80% relative magnitude**
  (against 0.14–0.19 for every arm trained on our more diverse corpus). We did
  not nudge the map, we rewrote it — to fit ~11 synthetic templates that the
  language-model loss had essentially memorized (loss ≈ 0.002).

**What we actually built** was a projector that speaks a private dialect: it
packs *our* pages more legibly, and hands the frozen decoder something it has
never learned to read on any other kind of document. The probe was measuring
"is the information there in a form *a fresh classifier trained on our pages*
can extract" — and that is not the same question as "can the decoder use it."

**The lesson, stated plainly, because it is the most transferable thing we
learned:** a probe improvement that is statistically clean, passes its own
specificity control, and shows on both linear and nonlinear heads **is still
not evidence that a change helps**. We had all three and were wrong by more
than twenty benchmark points. Run the external benchmark first, not last.

---

## 6. Other ways to attack the same leak

Ordered by how much we believe in them:

1. **More and more *diverse* data (highest confidence).** Our 5k corpus is
   5,000 pages but only ~11 templates — it scaled supervision, not variety.
   The effect is still climbing; the obvious next lever is 20k+ pages with
   real template/font/rendering diversity.
2. **Widen the projector.** It maps 4×1024 → 2560. Give it more intermediate
   capacity or a wider output and the compression is simply less severe. Cost:
   more tokens/compute downstream, and it changes the serving interface.
3. **Residual "detail path."** Add a small side path carrying what the main
   map discards, added back into its output — repairs without disturbing the
   existing mapping. This was our original planned design (R2) and is still
   untested.
4. **Multiple injection points (DeepStack).** Feed several encoder layers into
   several decoder depths instead of one bottleneck. Qwen3-VL already does
   this — it's the expensive, architectural answer, and it is *prior art*, not
   something we can claim.
5. **More vision tokens / higher resolution.** Always works, always costs
   inference time. Our own budget sweep showed pooling a high-res encode beats
   encoding a downscaled image at the same token count — worth knowing for
   serving regardless.
6. **Unfreeze the decoder too.** Measured: helps output quality, does nothing
   for perception. Not the lever for this problem.

---

## 7. Where this leaves us

**What stands, and would stand in a paper:**

1. **The diagnosis.** The projector discards ~44% of the recoverable
   character signal on the stock model — measured with validated probes,
   confirmed by a reconstruction test, and specific to text rather than
   layout. Nothing in the failed repair touches this; it is a property of the
   shipped model, measured three independent ways.
2. **The causal localization.** Transplanting clean features at the
   projector's output fully restores transcription on damaged pages; doing it
   halfway into the decoder restores only 15%. The decoder is a competent
   reader of whatever it is handed, and visual evidence is consumed early.
3. **A methodological result we did not go looking for**: probe-space gains
   and end-to-end quality can point in opposite directions by more than
   twenty benchmark points. We have a clean, controlled demonstration of it,
   with the mechanism (distribution-specific rewriting of the map) identified.

**What does not stand:** the repair, at this recipe. Bridge-only training on
synthetic data, at any dose we tried, either does nothing (700 docs) or
overfits the renderer catastrophically (5,000 docs).

**What we would try next, if we spend more here.** All of these attack the
same failure — the projector drifting away from what the frozen decoder can
read:

- **Anchor the projector to its original.** Add a penalty for moving away from
  the stock weights (or the stock outputs), so the map can be improved without
  being rewritten. An 80% relative change is the disease; constrain it.
- **Train on real documents, not our renderer.** The damage tracked our
  training distribution exactly (latin-only corpus → latin-only survival).
  A mixed corpus with real pages is the obvious control.
- **Much gentler optimization** — far lower learning rate, early stopping on a
  real-benchmark signal rather than on our own held-out synthetic loss, which
  is what let us train straight past the point of no return.
- **Let the decoder adapt** *and* keep the anchor. We showed unfreezing the
  decoder does not help perception, but it may be what keeps a repaired
  projector legible.
- **Or accept the architectural answer**: more vision tokens, or multiple
  injection points (DeepStack). Expensive, prior art, and — on this evidence —
  the thing that actually addresses the interface limit.

**And the rule we adopt going forward:** the external benchmark is the first
gate, not the last. Every internal metric we have — probes, our own held-out
task scores — has now been caught pointing the wrong way at least once. They
are good instruments for understanding *why*. They are not evidence that
something works.
