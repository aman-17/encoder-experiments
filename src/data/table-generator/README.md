# table-generator — synthetic document & benchmark generator

Generates single-page documents **and their exact ground truth** for four
parsing benchmarks at once. Each page is built as a logical *model*, then
serialized two ways:

1. the **answer** (clean structural JSON/markdown), and
2. a fully-styled HTML page → rendered to **PDF** with headless Chrome.

Both come from the same model, so the PDF and the ground truth can never
disagree — no human annotation, no parser-in-the-loop.

The default output is A4 document PDFs. Add `--format presentation` to render
PowerPoint-like 16:9 slide pages instead, while keeping the same benchmark
ground-truth files. Presentation mode uses slide-native layouts and slide-native
copy: concise action titles, takeaway bullets, KPI labels, decision-context
panes, roadmap notes, and chart/table captions generated from the table model
rather than widening report pages.

## Four metrics from one page

| Metric | Output folder | Format (matches existing bench) |
|--------|---------------|---------------------------------|
| **Tables** | `<out>` | `expected_markdown` (clean `<table>` HTML, multi-table joined) |
| **Text** | `<out>-text` | `text_extended` — bag-of-sentence / word / digit rules + `original_md` |
| **Layout** | `<out>-layout` | `v1.4` — per-element `{canonical_class, bbox, content, ro_index}` (bboxes measured in the browser) |
| **Charts** | `<out>-charts` | `charts_core` v2.1 — one `chart_data_point` per value plotted |

Select with `--tests table,text,layout,chart`. Each folder is a self-contained
dataset (`<id>.pdf` + `<id>.test.json`, plus `<id>.md` for text/layout).

## Setup

Self-contained Node tool. From this folder:

```bash
npm install            # one-time (skips Chromium download; uses system Chrome)
node fetch-fonts.mjs   # one-time: download the bundled Google Fonts into ./fonts
export GOOGLE_GEMINI_API_KEY=...   # for credible content + style extraction
```

Requires Node 18+, a local Chrome/Chromium, and (for the extractor) poppler
(`pdffonts` / `pdfinfo` / `pdftotext` / `pdftoppm`). Runs offline with `--no-llm`
(procedural content). `node_modules/` is gitignored; logo assets are git-LFS.

## CLIs

```bash
./tablegen          --out <dir> [flags]   # generate a dataset
./extracttemplates  --pdfs <dir> --out templates   # (re)build the style-template bank
./scanbatch         --scans-dir <dir> --packages-dir <dir> --out <dir>
./scanfinal         --scan-dataset <dir> --out <dir>
node fetch-fonts.mjs                       # download bundled Google Fonts
```

### Generate

```bash
# all four metrics; chart-focus controls how many docs centre on a chart
./tablegen --out ~/datasets/v1 --count 500 --seed 7 --tests table,text,layout,chart --chart-focus 0.25

# a prose-heavy TEXT set
./tablegen --out ~/datasets/text --count 500 --tests text --text-focus 1

# a CHART set (every doc centred on a chart)
./tablegen --out ~/datasets/charts --count 500 --tests chart --chart-focus 1

# widescreen presentation-style PDFs with the same table/text/chart/layout GT
./tablegen --out ~/datasets/slides --count 100 --format presentation --tests table,text,layout,chart --chart-focus 0.4

# force one slide layout while visually QA-ing presentation templates
./tablegen --out ~/datasets/slides-title --count 10 --format presentation --presentation-layout titleSlide

# force a provider-style theme family
./tablegen --out ~/datasets/slides-keynote --count 10 --format presentation --presentation-theme keynote-gradient
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--out` | (required) | Output dataset folder (siblings `-text`/`-layout`/`-charts` as needed). |
| `--count` | `50` | Number of documents. |
| `--seed` | clock | Base RNG seed — reproduces the run (content is LLM-stochastic; structure/style are deterministic). |
| `--tests` | `table` | Comma list: `table,text,layout,chart`. |
| `--chart-focus` | auto | 0–1 ratio of chart-centred docs (defaults to 1 when only `chart` is requested). |
| `--text-focus` | auto | 0–1 ratio of prose-heavy (mostly-text) docs. |
| `--table-focus` | `1` | In prose-heavy docs, 0–1 ratio of docs allowed to keep one small table. |
| `--language-mix` | `english` | Use `diverse` to vary visible document language across pages. |
| `--format` | `pdf` | `pdf` for normal A4 documents, or `presentation` for 16:9 PowerPoint-like slide PDFs with slide-native layouts. |
| `--presentation-layout` | auto | Force one presentation layout by id; useful for QA. |
| `--presentation-theme` | auto | Force one presentation theme pack by id; useful for QA. |
| `--templates <dir>` | in-repo `templates/` | Style-template bank to draw from. |
| `--llm-concurrency` | `50` | Parallel Gemini content calls. |
| `--render-concurrency` | `6` | Parallel Chrome pages. |
| `--no-llm` | off | Procedural content (offline). Not supported with `--format presentation`, which requires LLM slide copy. |
| `--no-html` | off | Don't save the per-doc `src/<id>.html` + `<id>.gen.json`. |
| `--clean` | off | Clear the output folders first. |
| `--multipage` | off | Allow multi-page "huge" tables; emits one random page of each (default: single-page docs only). |

Presentation layout ids:

| Layout id | Common slide pattern |
|-----------|----------------------|
| `titleSlide` | Title page / title slide. |
| `sectionHeader` | Section divider with a large banded heading. |
| `titleOnly` | Title at top with minimal supporting visual content. |
| `blankCanvas` | Blank/freeform slide with positioned objects. |
| `titleContent` | Title on top, one main content placeholder. |
| `twoContent` | Title on top, two side-by-side content placeholders. |
| `comparison` | Title on top, two labeled comparison placeholders. |
| `contentCaption` | Main content plus a caption/text pane. |
| `pictureCaption` | Large visual/content region plus caption pane. |
| `tableFocus` | Table-first slide with optional KPI row. |
| `chartFocus` | Chart-first slide with an insight rail. |
| `chartTable` | Chart and table side by side. |
| `dashboard` | KPI/dashboard summary slide. |
| `roadmap` | Roadmap/timeline slide. |
| `quote` | Quote or big-number style slide. |
| `bigNumber` | One dominant metric with proof visual/table. |
| `threeCards` | Three-tile summary slide. |
| `agenda` | Agenda or discussion-list slide. |
| `process` | Process or step-sequence slide. |
| `splitStatement` | Bold statement paired with evidence. |
| `visualLeft` | Large visual left, narrative right. |
| `visualRight` | Narrative left, large visual right. |

Presentation theme pack ids are inspired equivalents of common default theme
families in Google Slides, PowerPoint, and Keynote. They intentionally mimic
design language rather than copying proprietary templates pixel-for-pixel.

| Theme id | Style family |
|----------|--------------|
| `google-simple` | Google Slides simple/default clean deck. |
| `google-material` | Google-style rounded material cards and subtle shadows. |
| `google-focus` | Google-style focused content with accent rails. |
| `powerpoint-office` | PowerPoint Office-style clean business deck. |
| `powerpoint-ion` | PowerPoint Ion-like side color field. |
| `powerpoint-facet` | PowerPoint Facet-like geometric accents. |
| `powerpoint-gallery` | PowerPoint Gallery-like color blocks. |
| `keynote-basic-white` | Keynote Basic White-style minimal slides. |
| `keynote-basic-black` | Keynote Basic Black-style dark slides. |
| `keynote-gradient` | Keynote Gradient-style soft depth. |
| `keynote-photo-essay` | Keynote Photo Essay-style large visual field. |
| `keynote-modern-type` | Keynote Modern Type-style typography-led deck. |
| `google-geometric` | Google-style geometric color accents. |
| `powerpoint-retrospect` | PowerPoint Retrospect-like warm block layout. |
| `keynote-editorial` | Keynote editorial-style serif typography. |

LLM-backed runs write `<out>/usage.json` with Gemini token counts and an
estimated Gemini API cost. This is an estimate only: actual billing can differ
by paid tier, free quota, discounts, retry behavior, and Google pricing changes.

### Rebuild datasets from printshop scans

After the printshop returns scanned package PDFs, place those scans in one
folder. Ideally each scanned PDF filename starts with its package id, for example
`KUZ6WD3X.pdf` or `KUZ6WD3X_scan.pdf`. If there is a small typo, `scanbatch`
will look for the nearest known package id under the package roots and use it
when the match is unambiguous.

```bash
./scanbatch \
  --scans-dir ~/Code/synthData/returnedScans \
  --packages-dir ~/Code/synthData/tableRich \
  --packages-dir ~/Code/synthData/textRich \
  --out ~/Code/synthData/finalScannedDataset \
  --clean
```

The command skips each package cover page, splits the scan into one PDF per
document page, and copies the saved ground truth from the package manifests. It
writes benchmark-style folders: `<out>` for table tests, `<out>-text` for text
tests, and `<out>-charts` for chart tests by default. Add
`--tests table,text,chart,layout` if you intentionally want layout GT too, but
remember that print/scan can shift or warp coordinates.

Each scanned package is rejected unless its page count exactly matches the saved
manifest (`cover_pages + document pages`). This catches printshop mistakes such
as missing, duplicated, or extra pages before the scan is paired with GT.

Use `--max-id-distance N` to tune typo tolerance; the default is `2`. Ambiguous
nearest matches fail instead of guessing.

To package the scanbatch output into a page-centric shareable dataset with the
original generated page, scanned page, every available GT file, Markdown, and
generator source data colocated per page, run:

```bash
./scanfinal \
  --scan-dataset ~/Code/synthData/finalScannedDataset \
  --out ~/Code/synthData/finalScannedDataset-shareable \
  --clean
```

Each output page folder contains `original.pdf`, `scan.pdf`,
`gt/table.test.json`, `gt/chart.test.json`, `gt/text.test.json`,
`gt/layout.test.json`, `gt/page.md`, `source/gen.json`, `source/source.html`,
and `page_manifest.json` when those artifacts are available. The top-level
`manifest.json` indexes all pages.

### Extract templates

Builds the **style-template bank** from real PDFs: mechanically reads font names
(`pdffonts`), sizes/margins (`pdftotext -bbox`), page size (`pdfinfo`), then has
Gemini *vision* assign the visual style (borders, colors, header style, density,
watermark, columns) from a render of page 1. Captures a logo (via `pdfimages`)
when present and maps the PDF's real font to the closest bundled Google family.

```bash
./extracttemplates --pdfs <pdf-dir> --out templates --concurrency 50 [--limit N] [--no-llm]
```

## How a page is built

```
pick domain (81)  ─┐
pick shape         ├─►  prompt ─► Gemini 3.1 Flash Lite ─► structured JSON ─┐
pick "flavor"      │    (era/region/currency/entity)                         │
                   │                                                         ▼
draw template ─────┘                                       logical doc model (tables, prose, chart)
from the bank                                                               │
                                              ┌─────────────────────────────┼──────────────────────────┐
                                              ▼                             ▼                            ▼
                                      ground truth                    styled HTML  ──► Chrome ──► PDF   measured bboxes
                                  (table/text/chart)                  (template CSS + Google webfonts)  (layout GT)
```

- **Content** — Gemini fills a JSON schema (headers, rows, prose, optional chart
  type). A per-doc *flavor* randomizes era (1994–2025), industry, region,
  currency and naming style so docs aren't all 2024 US tech companies. Bulk cell
  values in huge tables are synthesized from per-column generator *specs*
  (`currency:…`, `formula:mul:…`, `cat:A|B|C`, faker names) so a 20×200 table
  costs almost no tokens and stays internally consistent.
- **Structure / shape** — normal, **dense** full-page table, **extreme** (3-tier
  nested headers + rowspan groups + section subtotals), **complex-cells**
  (rich multi-line/multi-field body cells: addresses, contacts, value+note,
  plus merged body cells — horizontal `<<` colspans and repeated-category
  rowspan groups),
  **huge** (programmatic, multi-page, tagged for merge-tests; OFF by default —
  enable with `--multipage`), **panels** (N-up mini-pages), **text-focus**
  (prose, ≤1 small table), **matrix / cross-tab** (row-axis × column-axis with
  marker/value cells and rotated column headers), **center-label-spine**
  (row-label column in the middle, data columns on both sides), **form**
  (fill-in field blocks + numbered-column grids, `XXX`/empty cells), and
  **headerless** continuation fragments. Tables may also use `<th>` row headers,
  section bands, total rules, and render-only conditional cell colour (negatives
  in red / RAG status). All ground-truth-safe: tag/colspan/rowspan/text live in
  the model, styling is render-only.
- **Style & layout** — every doc draws a real-PDF-derived template (page, fonts,
  borders, colors, header band, zebra, padding, logo, watermark), then varies its
  own RHYTHM per doc: masthead treatment (plain / tinted-or-solid-or-outline band
  / rule / left-bar / centered / hero), vertical density (airy↔compact),
  1–3-column body with full-width spanning tables, block order (data-first,
  table-last, …), prose proportion (lean↔rich), and callout style (box /
  pull-quote / floated sidebar). Body is never monospace; contrast guards keep
  text readable; the page is single-page (content measured + print-scaled to fit).
- **Typography** — 46 bundled open-source **Google Fonts** (`@font-face`-inlined),
  so type is varied, coherent, and renders our generated text with full glyphs.

## Document types (81)

financial_statement · balance_sheet · rate_sheet · insurance_schedule ·
timetable · price_list · statistics · comparison · roster · scientific ·
invoice · scientific_paper · timesheet · earnings_deck · report ·
financial_notes · purchase_order · bank_statement · payslip · tax_return ·
cap_table · amortization_schedule · bill_of_materials · inventory_report ·
shipping_manifest · lab_report · nutrition_panel · real_estate_listing ·
utility_bill · expense_report · budget · sales_report · survey_results ·
standings · transcript · menu · meeting_minutes · risk_register · datasheet ·
portfolio_holdings · depreciation_schedule · census_table ·
medical_lab_results · prescription · work_order · gradebook ·
attendance_register · travel_itinerary · hotel_folio · receipt ·
parts_catalog · legal_contract · patent · bibliography · staff_directory ·
general_ledger · trial_balance · aging_report · mortgage_statement ·
production_schedule · inspection_checklist · commission_statement ·
bill_of_lading · report_card · immunization_record · donation_receipt ·
benefits_enrollment · packing_slip · course_syllabus · grant_budget ·
customs_declaration · safety_data_sheet · event_agenda · maintenance_log ·
comparative_market_analysis · warranty_card · rent_roll · quote ·
payroll_register · calibration_certificate · explanation_of_benefits

## Charts (28 types)

`chartlib.mjs` is a dependency-free SVG charting library. The LLM may pick a
chart type that suits the page; the chart's data **model is the ground truth**
(`chartDataPoints()` recovers every plotted value).

bar · groupedBar · stackedBar · percentBar · hbar · stackedHBar · line ·
multiLine · spline · stepLine · area · stackedArea · scatter · bubble · pie ·
donut · radar · waterfall · funnel · histogram · lollipop · **comboBarLine
(dual-axis)** · slope · heatmap · gauge · pyramid · boxplot · candlestick

## The template bank

`templates/` holds **2,535** style templates (one JSON per source PDF) +
**628** captured logos (`templates/assets/`, git-LFS). Each generated doc draws
a random template, so it inherits a real document's look. Rebuild/extend with
`./extracttemplates`.

## Files

| File | Role |
|------|------|
| `generateTables.mjs` | generator CLI: content fan-out → render → ground truth |
| `extractTemplates.mjs` | style-template extractor CLI |
| `domains.mjs` | 81-domain registry, document prompt, response schema, per-doc flavor |
| `llmContent.mjs` | builds a doc model (LLM) — shapes: normal/dense/extreme/huge/panels/text/matrix/spine/form |
| `tableModel.mjs` | logical table model + programmatic huge-table cell generators (faker) |
| `render.mjs` | `documentHtml()` styled page + `docGroundTruth()` |
| `template.mjs` | template shape, `templateToCss()`, contrast/size guards, font/color jitter |
| `chartlib.mjs` | 28-type dependency-free SVG charting library |
| `figure.mjs` | typed chart model + `chartDataPoints()` ground truth |
| `groundTruth.mjs` | text (`text_extended`) + layout (`v1.4`) ground truth + bbox measurement |
| `googleFonts.mjs` | bundled-font registry, `@font-face` inlining, PDF-font → Google mapping |
| `fetch-fonts.mjs` | one-time Google Fonts downloader |
| `gemini.mjs` | Gemini 3.1 Flash Lite client (structured JSON + vision) + concurrency pool |
| `fontUtil.mjs` · `content.mjs` · `inline.mjs` · `rng.mjs` | pdffonts parsing · procedural fallback content · inline-markup escaping · seeded RNG |

## Notes

- Gemini key: `GOOGLE_GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`). Don't
  source a `.env` whose key is blank — it clobbers a key already in your shell.
- Per-doc HTML + content spec are saved under `<out>/src/` (unless `--no-html`),
  so a doc can be re-rendered or varied later without re-calling the LLM.

## All Canonical17 components (forms) — seeded from real acroforms

The generator now emits the **Canonical17 extended form components** the
table-focused path never produced: **Key-Value Region, Form, TextBox,
Checkbox-Selected/Unselected, Signature, and Document Index** — each with a
correct `canonical_class` in the layout ground truth (bboxes measured in the
browser like every other block).

**Box convention (matches the FFDetr / Heron form eval).** One `Form` region
*contains* every fillable widget; each widget box covers the **whole widget box,
filled or empty**, and never the label:

| class | bbox covers | scope |
|-------|-------------|-------|
| `Form` | the whole form body — **all** the TextBoxes, Checkboxes **and** the Signature | **region** (contains every widget below) |
| `Key-Value Region` | the label:value block | region |
| `Document Index` | the table-of-contents block | region |
| `TextBox` | the **whole fill-area box, filled or empty** — never the label, never just the entered ink | widget |
| `Checkbox-Selected` / `-Unselected` | the **checkbox mark only** (the box), not the label | widget |
| `Signature` | the **whole signing line, signed or blank** — not the caption/date | widget |

So the single `Form` region box encloses all the tight `TextBox` / `Checkbox` /
`Signature` boxes nested inside it — exactly how the FFDetr field detector and
Heron form-region gate are evaluated. The widget box is the field *rectangle*
(stable whether or not it holds ink), so blank and filled fields get identical
boxes. Run `node overlay_debug.mjs <out>/src <out>/overlay` to draw these boxes
on each page for visual QA (region thick, widgets tight).

**Fill states.** Every fillable field rolls a writer mode — **empty 30% /
typed 45% / handwritten 25%** (mirrors the FFDetr `fillgen` writer modes) — so
the dataset has both blank and completed fields. Handwritten values + cursive
signatures render in bundled handwriting fonts (Caveat / Homemade Apple /
Shadows Into Light); run `node fetch-fonts.mjs` once to fetch them. Filled
values are field-aware and obviously fake (SSN 900-, EIN 00-).

**`--doc-mode`** controls how many docs are forms:

| mode | behaviour |
|------|-----------|
| `form` | every doc is a form: Form regions containing TextBoxes + Checkboxes, plus Key-Value + Signature + Document-Index (default when `--from-acroforms` is given) |
| `regular` | normal table/report docs that only *occasionally* (~15%) carry a lone form region |
| `mix` | a blend (~45% full forms, the rest regular with the occasional form region) |
| `none` | pure table/report docs, no form components (default) |

Seed the form content from **real acroforms** (labels / field types / checkbox
groups; field *values* are synthesized):

```bash
# 1) extract form structure from real acroforms
python acroform_seed.py --acroforms <dir-of-acroform-pdfs> --count 8 --out form_specs.json

# 2) generate styled form pages (all components, mixed fill) + layout GT
./tablegen --no-llm --doc-mode form --from-acroforms form_specs.json --count 8 --tests layout --out forms
```

`--doc-mode form` without `--from-acroforms` still produces forms from a
procedural form spec. Each page reuses the procedural Title/Text/Table base and
adds the form components on top, so one page carries the full extended label set.
