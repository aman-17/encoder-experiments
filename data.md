# Difficulty taxonomy for Exp 1 probe data

How probe data is tagged for stratified results reporting. The shape: every object
gets **`difficulty ∈ {easy, medium, hard}`** plus **orthogonal flags** (`multi_*`,
counts). "Multi" is NOT a fourth difficulty level — a page can be multi AND hard;
collapsing them would hide whether a failure came from clutter or complexity.

Two principles, non-negotiable:

1. **Tags are a derived view, never the primary label.** The manifest stores the raw
   continuous covariates (`n_rows`, `n_series`, `empty_frac`, `size_pt`, ...); tags are
   computed from them by a versioned pure function (`difficulty_rules: v1`). Paper
   figures use the continuous curves; tags feed the summary tables. Retagging is a
   re-run, never a re-annotation.
2. **The tagger partitions.** Rules are evaluated in precedence order
   hard → medium → easy (first match wins, easy is the else-branch), so every object
   classifies. An object that somehow doesn't is a hard error, not a silent default —
   boundary bugs in tagging silently corrupt every downstream results table.

Aggregation: objects are tagged individually; a page's difficulty per task family =
max over its objects (easy < medium < hard). Flags live at page level.

---

## Tables — per table, from `<id>.cells.json`

Features: `R = n_rows`, `C = n_cols`, `merged = any(row_span>1 or col_span>1)`,
`empty_frac = empty_cells / logical_cells`, `max_span = max over cells of
max(row_span, col_span)`, `header_depth` = consecutive leading header rows,
`weird_family` = replicator template families with pathological layout (snaking,
mirrored, line-printer, continuation-fragment, ...).

| tag | rule (precedence order) |
|---|---|
| **hard** | `max(R,C) ≥ 10` OR `empty_frac ≥ 0.2` OR `max_span ≥ 4` OR `header_depth ≥ 2` OR `weird_family` |
| **medium** | else if `merged` OR `0.05 ≤ empty_frac < 0.2` |
| **easy** | else (`max(R,C) ≤ 9`, unmerged, near-complete) |

Flags: `n_tables` per page; `multi_table = n_tables ≥ 2`.

Kept continuous (sub-bin `hard` in analysis — it spans 144-cell to 1200-cell tables,
which cover a huge quality range): `n_rows`, `n_cols`, `n_logical_cells`,
`empty_frac`, `n_merged_cells`, `max_span`.

## Charts — per chart, from `<id>.pixels.json`

Features: `n_series` = distinct `seriesName` among marks, `dual_axis` = any
right-axis marks / `y2Ticks` present, `stacked` = stacking geometry
(`cumStart/cumEnd` or stacked/percent types), `chartType`, `geomKind`.

| tag | rule (precedence order) |
|---|---|
| **hard** | `n_series ≥ 4` OR `dual_axis` OR `chartType ∈ {radar, heatmap, candlestick, boxplot, waterfall}` |
| **medium** | else if `n_series ∈ {2,3}` OR `stacked` OR `chartType ∈ {bubble, gauge, funnel, pyramid, slope}` (extra encoding / nonstandard geometry) |
| **easy** | else (single-series bar/hbar/line/spline/area/scatter/pie/donut/histogram/lollipop) |

Flags: `n_charts` per page; `multi_chart = n_charts ≥ 2`.

Kept continuous: `n_series`, `n_marks`, `n_rules`.

Candidate hard criterion, not in v1 (sidecar doesn't record it yet): value-labels-off
for multi-series — the CG_HARD recipe. Add if the generator run emits the flag.

## Bboxes — per page, from `<id>.layout.json`

**Counting unit matters:** count the items in `<id>.layout.json` (Canonical17
classes — Table, Picture, Section-header, Text, Formula, ...),
NOT pymupdf raw text blocks and NOT word boxes — dense text pages have dozens of
blocks and would make `hard` ≈ 90% of pages, destroying the stratification's power.
Sidecar bboxes are **v2: integers on the 0–1000 page scale** (÷1000 for the
normalized frame); `degrade.py` accepts v1 (normalized float) and v2.

| tag | rule |
|---|---|
| **easy** | `n_boxes ≤ 4` |
| **medium** | `5 ≤ n_boxes ≤ 8` |
| **hard** | `n_boxes ≥ 9` |

⚠ **Calibrate before freezing**: check the empirical `n_boxes` distribution on real
generated pages; shift the 4/8 cut points if any bucket ends up degenerate.
*Measured on pilot_1k (2026-08-13): the 4/8 cuts ARE degenerate on dense synthetic
pages — bboxes family tags ~100% hard for charts/math/text, dragging page-level
difficulty to hard for 90–100% of those generators (per-family spreads are healthy,
e.g. charts 87/89/124 easy/med/hard). Cut points need raising (or per-generator
quantiles) before difficulty slices are meaningful for layout-dense pages —
owner decision pending.*

Kept continuous: `n_boxes`, `min_box_area`, `n_overlapping_pairs` (small and
overlapping boxes are the actual difficulty drivers; count alone is a proxy).

Reporting option: per-class difficulty slices from the Canonical17 `class` field —
a Formula-heavy page and a Table-heavy page at the same `n_boxes` are different
problems, and the slice is a groupby, not a re-annotation.

## Text & math — per page, from pymupdf sidecars + generator metadata

Features: `n_equations` (display equations, from math-generator metadata),
`script_depth` = max nesting depth of super/subscripts per equation (from the KaTeX
source at generation time — NOT a per-page superscript count; reference markers alone
would make every scientific page hard), `styled` = any headers/footers/headings/
sub-headings/bold/italic/strikethrough, `heavy_style` = styled-run fraction above
threshold (calibrate), `median_size_pt` / `min_size_pt` from glyph sidecars.

| tag | rule (precedence order) |
|---|---|
| **hard** | `n_equations ≥ 4` OR `script_depth ≥ 2` OR `heavy_style` OR `median_size_pt < 6` |
| **medium** | else if `2 ≤ n_equations ≤ 3` OR `styled` |
| **easy** | else (plain prose, ≤1 simple equation) |

Flags: `n_equations`.

Kept continuous: `n_equations`, `script_depth`, `styled_run_frac`, `median_size_pt`,
`min_size_pt`.

**Font size is a deliberate addition** — it's the strongest difficulty driver for the
glyph probe and the audit found real chart labels down to 1.86pt effective. Never
filter `size_pt ≥ 4` when building glyph probe sets (real labels go below it).

---

## Scan severity — orthogonal axis, all task families

`scan_severity ∈ {0..4}` from `src/data/degrade.py` (presets v5). Like `multi_*`,
this is **not** a difficulty level — a degraded easy table and a clean hard table
fail differently, and that distinction is a finding. Report as its own slice /
curve axis, never folded into easy/medium/hard.

| sev | meaning | character |
|---|---|---|
| 0 | born-digital | bit-exact passthrough |
| 1 | light office scan | faint grain, mild skew (≤0.30°) |
| 2 | typical photocopy | toner texture, banding, bimodal B/W-or-color |
| 3 | aged re-scanned copy | stains, bleed-through, real skew (≤1.80°) |
| 4 | fax-grade | sharp 1-bit, nearest-neighbor jaggies, dropout lines |

Hard constraints baked into the presets (user-set — do not drift):
- **Legibility**: every line of text stays human-readable at every severity;
  blur is pinned to σ∈(0.05, 0.10) everywhere; rasterization ≥200dpi.
- **GT exactness**: geometry is one explicit affine per (page, severity), stamped
  as `scan_geom_matrix` in the transformed sidecar; photometric ops are
  pixel-position-preserving. Same seed → byte-identical output.
- **Fonts**: scan-destined batches MUST generate with `CG_SCAN_ERA=1` (both
  chart- and table-generator) — era-plausible faces only; a 2020s geometric
  sans under aged grime is an instant synthetic tell.

Probe-harness consumer notes (from the adversarial geometry verification):
- At sev 4, binarize+bleed dilate ink ~0.6–2.2px beyond the transformed bbox
  hull — pad hulls ~2px when ink-coverage (vs geometric) boxes are needed.
- At sev 4 expect ~1-in-10 tiny landmarks occluded by grime; coordinates remain
  correct, detection may fail — drop, don't relabel.
- Real scanned PDFs (Internet Archive etc.) are never probe substrate — no
  latent labels. They serve as transfer-validation anchor, Exp 2 eval slices,
  and Exp 3 training data only.

Manifest fields: `scan_severity` (int), `scan_geom_matrix` rides in the
transformed sidecar. Sample pages at every severity per probe family; the
frontier claim is per-family robustness *curves* over severity.

## Deviations from the original spoken rules (all deliberate — veto if wrong)

| original | v1 | why |
|---|---|---|
| tables `<10` / `>10` | `≤9` / `≥10` | `= 10` was unclassifiable |
| tables hard = "m,n > 10" | `max(R,C) ≥ 10` (OR-semantics) | a 30×5 table classified as nothing under AND-reading |
| tables multi `> 2` | `≥ 2` | a 2-table page fell into no bucket; also consistent with charts (`≥ 2`) |
| charts "2-3 dimensions" | `n_series 2–3` OR extra encoding OR nonstandard geometry | "dimension" bound to measurable fields |
| math hard ">2 superscripts" per page | per-equation `script_depth ≥ 2` | page-level superscript counts tag nearly all scientific text hard |
| (absent) | `median_size_pt < 6` → hard | tiny text dominates glyph-probe difficulty |

## Manifest contract additions

Each manifest row carries: `difficulty` (tag), `difficulty_rules: "v1"`, the raw
covariates listed above for its task family, and the page-level flags
(`n_tables`/`n_charts`/`n_equations`, `multi_*`). Probe harness joins on `image_id`
and stratifies on these fields.

## Reporting

- Summary tables: per (task × difficulty), bootstrap CIs over eval items; `multi` as
  its own slice (never merged into the difficulty axis).
- Layout probes (P-L1/2/3 in the README probe suite) report per Canonical17 class
  and per `scan_severity`, stratified by these bbox tags — the counting unit and
  the probe labels come from the same `layout.json` items, so the slices align by
  construction.
- Paper figures: degradation curves over the continuous covariates (accuracy vs
  `n_series`, vs `n_logical_cells`, vs `size_pt`) — tags compress these curves to 3
  points and are for exec summaries, not for the reviewers.
- Before freezing v1 thresholds: run the tagger over real generated data and check
  the distribution — as a heuristic, no bucket should hold <10% or >60% of pages for
  its task. A stratification with one dominant bucket has no discriminative power.

Status: spec only — the tagger (`src/data/difficulty_tagger.py`) is not yet
implemented; when it lands it must follow this file, and changes to rules bump the
version (`v2`, ...), never silently edit `v1`.
