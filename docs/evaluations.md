# Evaluation, by example

Companion to [speaker-notes.md](speaker-notes.md). Same methods, but followed
end-to-end on **one real page, one real character**, using rows copied
verbatim out of our artifacts. If you want to know exactly what "accuracy
.4388" is counting, this is the file.

Everything here is reproducible from `data/pilot_1k/` and `validation/`.

---

## The worked example: one character on one page

Take the page `math__math_5h9_0001` — a synthetic math handout. Somewhere near
the top there is a lowercase **r**. Here is the actual probe row for it,
copied from `data/pilot_1k/probes.jsonl`:

```json
{"probe": "glyph_id",
 "image_id": "math__math_5h9_0001",
 "point_xy": [0.467643, 0.089473],
 "label": 17,
 "meta": {"char": "r", "size_pt": 10.92, "font": "Cardo-Regular",
          "generator": "math", "scan_severity": "0"},
 "doc_id": "math_5h9_0001"}
```

Read it as: *"46.8% across the page, 8.9% down the page, there is a lowercase
`r`, set in Cardo-Regular at 10.92pt."*

**Where those numbers came from.** We rendered the page from a PDF we
generated, then read the PDF's own text layer back out with pymupdf. The text
layer knows every character's exact bounding box, so `point_xy` is the box's
centre expressed as a fraction of page size, and `char` is ground truth by
construction. No human labelling, no OCR, no label noise. `label: 17` is just
`"r"`'s index in our 80-character vocabulary.

We take up to **60 characters per page**. Across the pilot corpus that is
**41,011 rows over 697 documents**.

---

## Step 1 — turn that point into a number the model computed

Feed the page to Qwen3.5-4B. Its vision tower chops the image into patches;
after the 2×2 merge, this page becomes a **73 × 52 grid** of feature vectors,
each 2,560 numbers long. Before the merge it is **146 × 104**, each 1,024 long
— the merge is exactly what collapses 4 → 1.

Our point (0.467643, 0.089473) lands at grid position:

```
  column = 0.467643 × 73 = 34.1
  row    = 0.089473 × 52 =  4.7
```

It doesn't land dead centre on a patch, so we take a **bilinear blend** of the
four surrounding vectors — the standard "weighted average by how close you are
to each" — and get a single 2,560-number vector. (A point that *does* land on
a patch centre returns that patch's vector exactly; there's a unit test for
this, because a half-patch offset here would silently corrupt every result in
the project.)

Do that for all 41,011 marked characters, at each of the three taps. That's the
dataset the rest of the evaluation runs on.

---

## Step 2 — split so the test is honest

The 697 documents get hashed into 80% train / 20% test. **The split is by
document, never by character.**

Why that matters, concretely: page `math_5h9_0001` contributes ~60 characters.
If some went to train and some to test, the classifier could learn "on *this
page*, in *this font*, a squiggle like that is an `r`" and score well without
generalising at all. Splitting by document forces it to work on pages it has
never seen. The code asserts this after splitting and crashes if any document
straddles the line.

Result for characters: **~32,400 train points, 8,612 test points.**

---

## Step 3 — fit two readouts, and know what each one means

- **Linear head** (logistic regression): can you separate the 80 characters
  with a flat plane through the feature space? Measures how *easily available*
  the information is.
- **MLP head** (2-layer, 512 hidden): can you separate them with a curved
  boundary? Measures information that is *there but tangled*.

We report both, always, and the gap between them is itself a finding. Example
from the real table: at the post-projector tap, linear = **.4388**, MLP =
**.5035** — so some character information survives the projector in a form a
straight-line readout can't reach, but a small nonlinear one can.

---

## Step 4 — what "accuracy .4388" literally means

Of the 8,612 held-out characters, the linear readout named **3,779 correctly**
(.4388 × 8,612). Top-1, no partial credit.

**Is that good?** Only against the right baseline, and this is where we got it
wrong the first time:

| baseline | value | why |
|---|---|---|
| naive "1 in 80" | .0125 | **wrong** — assumes all characters equally likely |
| **measured majority class** | **.0907** | `e` alone is 9.07% of all sampled characters |
| shuffled-label control | .0546 | what the pipeline scores when labels are randomised |

Real text is *e*-heavy: our top characters are `e` (3,721), `t` (2,618),
`i` (2,472), `a` (2,278), `n` (2,144). Always guessing `e` gets 9%. So the
honest floor is **.091**, not .0125 — our original write-up used .04 and
overstated every margin by more than 2×. We now measure floors instead of
computing them from class counts.

Against .091, a score of .4388 means the post-projector features carry
**~4.8× floor**; the pre-projector features, at .797, carry ~8.8× floor.

---

## Step 5 — the guard that saved us: equal capacity

Pre-projector vectors are 1,024 wide; post-projector are 2,560. Wider vectors
are easier to classify *for free* — more dimensions, more room to separate
things — so a naive comparison would flatter whichever tap happens to be wider.

**We tested how bad this is, on our own real features:** take genuine
post-projector features and pad them with *pure noise* to 4× the width. Nothing
was added — the noise is meaningless — yet the score rose by **+.029**. That is
a full third of the size of our headline repair effect, manufactured out of
nothing but width.

The fix: before any head is fit, every arm is passed through the *same* fixed
random projection down to **512 dimensions**. Re-running the noise-padding test
with that in place: the fake gain collapses to **+.002**.

Every cross-tap and stock-vs-repaired number in our results uses this.

---

## Step 6 — error bars, and what "it moved" is allowed to mean

We resample the **test documents** (not the individual characters) 1,000 times
with replacement and refit the statistic, giving a 95% interval. Resampling
documents rather than characters is deliberate: characters on the same page are
correlated, so character-level bootstrapping would produce fake-narrow bars.

Worked example, the headline repair result:

```
  stock projector:    .4388   95% CI [.4176, .4624]
  repaired projector: .5211   95% CI [.4977, .5448]
                              ^ intervals do not overlap
```

That non-overlap is why we call it real. Compare with an earlier attempt:

```
  repaired (700 docs): .4560  95% CI [.4348, .4789]
  stock:               .4388  95% CI [.4176, .4624]
                              ^ heavily overlapping → we called it noise
```

Same pipeline, same everything — the only difference is whether the intervals
separate. We committed to that rule in writing before running the experiment.

---

## Step 7 — proving "lost", not just "harder to read"

A probe failing only proves *this readout couldn't get it*. To claim the
information is actually gone, we train an **inverse map**: a model whose only
job is to take post-projector features and reconstruct the pre-projector ones.

Real setup, from `validation/exp2a_summary.json`: **76,189 training pairs /
20,230 test pairs**, mapping 2,560 → 1,024 dimensions, documents split the same
way as everywhere else.

Then we run the character probe on the reconstructions:

```
  probe on genuine pre-projector features:       .797
  probe on reconstructed pre-projector features: .447
                                       ────────────────
  shortfall:                                     .350  ≈ 44% of the signal
```

**Why we trust the inverse map is competent:** we first ran it on two synthetic
cases where we knew the answer. Feed it an invertible rotation (nothing is
lost, just spun around) → it recovers ~1.0 with no gap. Feed it a deliberately
lossy projection (we deleted dimensions on purpose) → it reproduces a gap like
the one we observe. So the instrument can tell "rearranged" from "destroyed",
which is the whole question.

---

## Step 8 — the specificity test we could have failed

If our repair merely made the projector *better in general*, everything would
improve and our "we fixed text specifically" story would be false. So we ran
the identical probe pipeline on a different question: **what kind of region is
at this point** — heading, paragraph, table, figure (`pl1_class`, 28,992 test
points).

```
                     characters        layout regions
  stock projector       .4388              .8150
  repaired projector    .5211              .8120
  change                +.083 ✅           −.003  (flat)
```

Text went up; layout didn't move. We designed this check to be able to
embarrass us, and it didn't fire — twice, once for each independently trained
5k arm.

---

## Step 9 — from probes to actual reading

Probes measure what's *in* the representation. They don't prove the model
*uses* it. So we also make the model generate.

**Setup:** 211 documents no training run ever saw; fixed prompt
("Transcribe this document to markdown."); greedy decoding, so re-running gives
byte-identical output; scored against gold — TEDS for tables, edit-similarity
for text and math, rule-based recall for chart data points.

**The trap we walked into, with numbers.** Our first repair attempt looked
great here: overall score went from **.287 → .608**. Huge. But the probe said
character accuracy had moved **+.0007** — i.e. not at all.

What actually happened: the untrained model writes *correct text in the wrong
format* (different heading markers, different table syntax), and our scorer
punishes that. Training taught it our formatting conventions. Real improvement,
but not the improvement we were claiming.

So we added a **content-only** score: strip all markdown and LaTeX syntax and
punctuation, lowercase everything, then compare. It asks *did it read the right
characters*, ignoring *how it dressed them up*. Applying it retroactively cut
the gap between two arms roughly in half — a formatting effect, exposed.

**The rule this taught us, which is the main methodological lesson of the
project:** always report a probe number and a task number side by side. A task
score alone would have had us celebrating a formatting win as a vision fix. A
probe score alone would never have told us whether the model can use what we
added.

---

## Step 10 — the only numbers outsiders should trust

Everything above uses **our** pages and **our** scorers. Necessary for
isolating a mechanism; worthless as external proof.

So the final step: run the stock model and the repaired model on **public
benchmarks with their official scorers** — olmOCR-bench, OmniDocBench,
PulseBench-Tab — with identical prompts, decoding, and page sets.

To guarantee the comparison is clean, the repaired checkpoint is built by
copying the stock checkpoint and overwriting **only** the 27.3M projector
tensors, then verifying tensor-by-tensor that every other weight is
byte-identical (738 tensors, 733 confirmed unchanged, 5 merger tensors
changed). Whatever difference appears is attributable to those weights and
nothing else.

**That run happened, and it is why this document exists.** olmOCR 71.0 → 48.0,
OmniDoc 81.2 → 59.7, PulseBench .719 → .368. The checkpoint that scored +.083
on our probe — with CI separation, on both heads, passing its own specificity
control — lost 21–23 points on every public benchmark. It had overfit our
renderer: the projector's main weight moved 80% in relative Frobenius norm
while the language-model loss fell to ~0.002 on an 11-template corpus.

Meanwhile the intervention that *did* help touched no weights at all: doubling
the vision token budget on the stock model gained +3.0 overall and +12.7 on
olmOCR's fine-text slice.

So the honest summary of this whole document: the internal instruments above
are good for finding out **where** something happens and **why**. They are not
evidence that a change **works**. Only the external number is, and it goes
first.

---

## Cheat sheet

| number | what it is | honest floor | how measured |
|---|---|---|---|
| .797 | characters readable pre-projector | .091 | linear probe, 8,612 held-out points |
| .4388 | characters readable post-projector | .091 | same, same split, equal capacity |
| .350 | signal not recoverable by an inverse | — | reconstruct → re-probe, 20,230 test pairs |
| +.083 | probe gain from the bridge finetune | CIs disjoint | stock vs repaired, identical pipeline |
| −.003 | layout change under the same finetune | — | specificity control, 28,992 points |
| .608 | task score, our synthetic held-out | .287 (untrained), ~.061 (blind) | greedy generation, 211 unseen docs |
| **−23.0** | **that same checkpoint on olmOCR-bench** | — | public data, official scorer, 8,413 tests |
| **+12.7** | fine-text gain from doubling vision tokens | — | stock model, no training, same scorer |

**The last two rows are the point of this document.** A probe gain of +.083
that passed every internal control came with a **−23-point** external
regression, while an intervention that touched no weights at all bought
**+12.7** on the same reading slice. Internal metrics explain mechanisms;
external benchmarks decide whether anything works.

**Four rules we hold ourselves to:** split by document, never by sample;
measure the floor, never assume it; report probe and task together, never one
alone; and run the external benchmark *first*, not last.
