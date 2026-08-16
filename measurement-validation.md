# Measurement validation (pre-registered; gates all further compute)

Reviewer verdict accepted (2026-08-15): before Part II or any scale-up, the
next budget validates the measurement itself. If the core curves survive this
battery, scale; if they don't, the corrected measurement is the contribution.

## Shortcut audit — measured results (round 1, pilot corpus)

Labels predicted from (x, y) coordinates alone (linear + kNN-50) and from
local window color alone; doc-level split, same discipline as probe_fit.
Script: shortcut_baselines*.py; raw JSON alongside. Plain accuracy, matching
the pilot table's metric.

| probe | test-majority floor | coord baseline | best encoder (pilot) | verdict |
|---|---|---|---|---|
| glyph_id | **.091** (table said .04) | .071–.091 (≤ floor) | Qwen .466 | **survives** — no positional shortcut; Qwen = 5.1× floor. CLIP/SAM/DeepSeek (.062–.079) are AT/BELOW floor, not "weak signal" |
| cell_row | **.107** (said .05) | .096–.110 (≈ floor) | Qwen .200 | survives with smaller margin (1.9× floor); no y-shortcut (tables sit at varying page offsets) |
| cell_col | **.202** (said .14) | **.376** (x-shortcut, linear) | Qwen .493 | **largely positional** — only Qwen (+.117) and marginally SAM (+.034) beat the shortcut; every other tower is at/below it |
| series_id | **.497** (said .28) | .470–.497 (≤ floor) | Qwen .533 | floors were wrong: most towers (.34–.41) score BELOW bias-only; Qwen's margin over floor is +.036, not +.25. Re-analysis on the multi-series slice required (below) |
| pl1_class | .578 (as stated) | .592 (kNN, +.014) | Qwen .831 | survives — positional shortcut negligible vs margins |
| pl2_extent | — | **.235 mIoU** (point-position prior) | SAM .165 | **invalid as an absolute measure** — every tower scores BELOW the coordinate prior. By element size: medium .336, small .166, large .155 |

**Color shortcut for series_id: structurally absent in this corpus.** Window
color at the marked point predicts series at .289 vs .309 majority
(multi-series slice) — per-label mean colors are indistinguishable
(~[0.6,0.6,0.6], std ~0.2) because the generators randomize palettes per
chart, so no global color→series map exists for any global probe (linear
probes included) to exploit. Caveat: 9×9 window mean; an exact-pixel +
legend-swatch-matching variant is still owed (below).

## Consequences already adopted

- All probe results are re-reported as **margin over the measured shortcut
  baseline** (coord for cell_*/pl2, majority for the rest); the "(chance)"
  column in the pilot table is superseded.
- **pl2_extent redesign** before it can headline anything (incl. exp2a):
  refit heads on [features ⊕ (x,y)] and report Δ over the coords-only
  baseline — the increment attributable to features. The SAM-vs-Qwen extent
  ordering is unverified until then (SAM's lead may be "features linearly
  encode position better", not "extent information").
- **series_id re-analysis on the multi-series slice only** (floor .309;
  all-rows floor .497 is inflated by single-series charts where label≡0).
  Needs the cached features on the Modal volume; no new extraction.
- pl3 renamed "layout category presence" everywhere (it measures page gist,
  not topology).

## Refit round 1 — all 8 towers, native caches (2026-08-15, validation_v1)

The blocking refits, complete (raw, doc-level split; per-pair JSONs on
/vol/results/validation_v1/ + validation/refits_summary.json):

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
   *position*, not element extent. Any extent-retention claim now requires a
   redesigned probe: restrict to small elements (coord prior .166 there vs
   .336 medium), or predict boundary distance / is-edge-adjacent, where the
   positional prior is weak.
2. **Series binding is a Qwen-only signal, and it sharpens.** On the honest
   multi-series slice every public tower sits AT the .304 floor (.278–.327);
   only qwen35_vit separates (+.14 linear, +.18 MLP). Color shortcut
   structurally absent (palette randomization). Counterfactual twins remain
   the last check before a binding claim.
3. **Glyph survives font-held-out for the towers that read at all**: Qwen
   .412 vs .466 in-distribution (~11% relative drop), NaFlex .142 vs .185;
   CLIP drops to its shuffled floor (and random-init CLIP scores ABOVE
   learned CLIP out-of-font — the CLIP≈rand pattern again).

MLP head calibration (validation/mlp_calibration.json): epochs=300, lr=3e-5
restores MLP ≥ linear on the arms where that is attainable; on S1
concat4/pl2-S1 arms the linear>MLP ordering is a transfer property of the
arm, not undertraining (exhaustive sweep) — the exp2a yardstick clamps
negative lifts at 0 accordingly.

## Remaining battery (pre-registered, in priority order)

1. **pl2 refit + series multi-series refit** (Modal CPU, cached features;
   hours). Blocking for exp2a's headline-cell choice.
2. **Glyph validity splits**: refit glyph_id with font-family-held-out and
   character-held-out splits (font metadata is in the generator sidecars);
   report Qwen's .466 under both. Position/background randomization already
   present in the corpus; add anti-aliasing/rendering variation at
   generation time for the scale-up.
3. **Probe ceilings**: raw-pixel probe (patch crop at the point → linear +
   small-CNN) per family — if raw pixels can't solve a task, the synthetic
   task is broken; OCR-engine reference for glyph_id (the "solvable by
   off-the-shelf reading" ceiling).
4. **Series counterfactual twins** (chart-generator change): same chart data
   re-rendered with (a) permuted palette, (b) markers-only, (c) dash-only,
   (d) legend moved/far. Binding claim requires retention under (a).
   Exact-pixel + swatch-matching color baseline rides along.
5. **OOD validation**: probes trained on generated docs, tested on real
   annotated pages — OmniDocBench (layout classes + text GT → pl1/pl2/glyph
   at word level) + our old-book scans. The claim under test is that the
   survival ORDERING transfers, not the absolute numbers.
6. **Pixel-information control** (within-tower H3): qwen35_vit high-res
   encode → adaptive-pool tokens to each ladder rung vs the existing
   resolution rungs at matched realized tokens. Native grids are cached;
   only pooling + fits are new. Separates never-captured from
   captured-then-discarded.
7. **DeepSeek crop path**: extend the frontier (and, if feasible, the probe
   pass) to the production tiled-crop mode; until then every DeepSeek number
   carries the "global-view only" label.

## Non-goals

No new encoders. No Part II compute. No additional probe families beyond the
redesigns above.
