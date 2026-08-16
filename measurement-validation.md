# Measurement validation (pre-registered)

**Scope change 2026-08-15.** This file gated the survival-curve paper's
scale-up. Under the bridge-repair framing ([ideas.md](ideas.md)) it has two
jobs and no longer gates all compute:

1. **Gate G2 (blocking, weeks 2–4):** does the *diagnosis* — the S1→S2 glyph
   residual — reproduce on real documents? This is the highest-variance unknown
   in the project and the one that decides whether the method has a motivation
   on its own evaluation distribution.
2. **The paper's appendix validity section**, re-scoped to the two surviving
   probe families (`glyph_id`, `pl1_class`). Everything about the six demoted
   families is retained below as record, not as work.

Battery items for probes that left the paper are **closed, not pending** — see
§Closed. The compute gate that matters now is G1 (B2 pilot,
[phase-b-causal.md](phase-b-causal.md)).

---

## Round 1 — shortcut audit (complete, pilot corpus)

Labels predicted from (x, y) coordinates alone (linear + kNN-50) and from
local window color alone; doc-level split, same discipline as probe_fit.
Script: shortcut_baselines*.py; raw JSON alongside. Plain accuracy, matching
the pilot table's metric.

| probe | test-majority floor | coord baseline | best encoder (pilot) | verdict | paper status |
|---|---|---|---|---|---|
| glyph_id | **.091** (table said .04) | .071–.091 (≤ floor) | Qwen .466 | **survives** — no positional shortcut; Qwen = 5.1× floor. CLIP/SAM/DeepSeek (.062–.079) are AT/BELOW floor | **KEPT — headline** |
| pl1_class | .578 (as stated) | .592 (kNN, +.014) | Qwen .831 | survives — positional shortcut negligible vs margins | **KEPT — specificity contrast** |
| cell_row | **.107** (said .05) | .096–.110 (≈ floor) | Qwen .200 | survives with smaller margin (1.9× floor); no y-shortcut | demoted → appendix |
| cell_col | **.202** (said .14) | **.376** (x-shortcut, linear) | Qwen .493 | **largely positional** — only Qwen (+.117) clears it | demoted → appendix |
| series_id | **.497** (said .28) | .470–.497 (≤ floor) | Qwen .533 | floors were wrong; Qwen margin +.036, not +.25 | demoted → appendix |
| pl2_extent | — | **.235 mIoU** (point-position prior) | SAM .165 | **invalid** — every tower below the coordinate prior | demoted → appendix (refuted) |

**Color shortcut for series_id: structurally absent in this corpus.** Window
color at the marked point predicts series at .289 vs .309 majority
(multi-series slice) — per-label mean colors are indistinguishable
(~[0.6,0.6,0.6], std ~0.2) because the generators randomize palettes per
chart, so no global color→series map exists for any global probe to exploit.
Caveat: 9×9 window mean; the exact-pixel + swatch-matching variant is now
closed unrun (§Closed).

## Refit round 1 — all 8 towers, native caches (complete, validation_v1)

| tower | pl2 Δ lin | series multi lin/mlp | glyph font-held-out lin (in-dist) |
|---|---|---|---|
| clip_vit_l_336 | −.033 | .290 / .301 | .049 (.062) |
| clip __rand | −.017 | .292 / .274 | .075 (.061) |
| siglip2_so400m | −.016 | .327 / .327 | .103 (.122) |
| siglip2 __rand | −.039 | .285 / .313 | .071 (.071) |
| siglip2_naflex | −.015 | .296 / .355 | .142 (.185) |
| sam_vit_b | **−.001** | .296 / .325 | .075 (.079) |
| qwen35_vit | **+.004** | **.441 / .487** | **.412 (.466)** |
| deepseek_ocr | −.040 | .278 / .312 | .062 (.065) |

(series multi-series majority floor: **.304**; pl2 coords-only baseline:
.238 mIoU; MLP pl2 Δs all negative under the uncalibrated head — read the
linear column.)

**Verdicts:**

1. **pl2_extent is dead as designed — for every tower.** No feature set adds
   anything beyond the coordinate prior (best Δ +.004; SAM, the supposed
   extent specialist, −.001). The pilot's "SAM retains extent 3× Qwen"
   finding is REFUTED — it measured how linearly a tower's features encode
   *position*, not element extent.
2. **Series binding is a Qwen-only signal.** On the honest multi-series slice
   every public tower sits AT the .304 floor (.278–.327); only qwen35_vit
   separates (+.14 linear, +.18 MLP). Color shortcut structurally absent.
3. **Glyph survives font-held-out for the towers that read at all**: Qwen
   .412 vs .466 in-distribution (~11% relative drop), NaFlex .142 vs .185;
   CLIP drops to its shuffled floor (and random-init CLIP scores ABOVE
   learned CLIP out-of-font).

MLP head calibration (validation/mlp_calibration.json): epochs=300, lr=3e-5
restores MLP ≥ linear on the arms where that is attainable; on S1
concat4/pl2-S1 arms the linear>MLP ordering is a transfer property of the
arm, not undertraining (exhaustive sweep) — the exp2a yardstick clamps
negative lifts at 0 accordingly.

**Why this section survives into the paper.** Glyph_id is the family the entire
diagnosis and repair target rests on, and it is the family that passed every
check: no positional shortcut, 5.1× floor, survives font-held-out. That is the
appendix that makes §3 credible. It is also why six other families are gone —
we ran the audit, and we report what it did to them.

---

## OPEN — Gate G2: does the diagnosis reproduce on real documents? (BLOCKING)

The one item promoted, not demoted. Everything else in this file is either
complete or closed.

**Claim under test.** The S1→S2 glyph residual on the production Qwen3.5 stack
exists on *real* document pages, not only on our renderer. Absolute numbers are
not expected to transfer; the residual's existence and rough magnitude must.

**Instrument.** OmniDocBench (real annotated pages: layout classes + word-level
text GT) — word/character-level glyph readout at marked points inside annotated
text regions, plus `pl1_class` from the layout annotations as the specificity
contrast. Old-book scans as a secondary anchor.

**Procedure.** Re-run the exp2a S1 (pre-merge) / S2 (post-merge) probe pair and
the reconstruction test at native resolution on real pages. Same
capacity-matched heads, same doc-level split discipline, same shuffled controls.
No new machinery — `site=premerge` extraction + `probe_fit` + `reconstruct.py`
already do this; only the label pipeline is new.

**Pre-registered readings.**

| outcome | action |
|---|---|
| residual present, comparable magnitude | G2 passes; proceed to B4/B5 as planned |
| residual present but much smaller | method motivation survives; **re-scope the headline number to real pages** and report the synthetic/real gap honestly as a rendering-sensitivity result |
| residual absent on real pages | the diagnosis is a synthetic artifact. Stop before training spend; restructure. This is a publishable negative and it is far better learned in week 3 than week 11 |

**Cost.** Days, on cached-feature CPU fits plus one extraction pass. It runs
early *because* it is cheap and decisive.

---

## Closed (no longer pending — the probes they validate left the paper)

Retained so the record shows these were deliberate scope decisions, not
oversights. Any of them reopens automatically if the corresponding family
returns to the paper.

- **pl2 probe redesign** (small-elements / boundary-distance variants, where the
  coordinate prior is weak). Closed: pl2 is refuted and demoted; exp2a already
  showed extent-beyond-position at no site and no budget.
- **Series counterfactual twins** (permuted palette / markers-only / dash-only /
  moved legend) + exact-pixel and swatch-matching color baselines. Closed:
  series_id is demoted. This was real work and a real experiment — it belongs to
  the survival-curve paper, and returns with it if G1 sends us to TMLR.
- **Raw-pixel probe ceilings and small-CNN references** across families.
  Closed for the demoted families; **retained for glyph_id only** as an appendix
  sanity check ("can raw pixels at this crop size read the character at all"),
  since a broken synthetic task would invalidate the repair target.
- **OCR-engine reference for glyph_id.** Retained, appendix, cheap — it is the
  "solvable by off-the-shelf reading" ceiling and reviewers ask for it.
- **Pixel-information control** (within-tower H3). Closed as a headline item;
  results exist in `validation/b3_pixel_control.json` and stay as the appendix
  answer to "is the residual a bridge property or an input-sampling property"
  ([phase-b-causal.md](phase-b-causal.md) §B3).
- **DeepSeek crop path.** Closed as blocking. DeepSeek is now a contrast tower
  with no efficiency claim attached, so the "global-view only" label is
  sufficient. Reopens only if a DeepSeek production-efficiency claim re-enters.
- **Corpus-wide difficulty stratification** ([data.md](data.md)). Closed: the
  tags are degenerate (~100% hard on dense pages) and nothing in this paper
  stratifies on them.

## Retained additions to the generator (scale-up spec)

Not validation of past results — insurance for the new ones. Fold into the 20k
generation run ([ideas.md](ideas.md) §Data):

- **Rendering variation**: anti-aliasing modes, subpixel positioning, DPI
  jitter. "Your effect is a renderer artifact" is now a first-order reviewer
  risk, and it is cheapest to defeat at generation time.
- **Glyph-weighted mix** (≥60% glyph-heavy: small `size_pt`, dense text, math,
  label-heavy charts) — the pages where the measured residual lives.
- Keep exact-GT sidecars and scan-severity twins (B1's instrument).

## Non-goals

No new encoders. No new probe families. No re-validation of demoted families
unless they return to the paper.
