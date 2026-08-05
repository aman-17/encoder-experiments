# table-generator — synthetic document & benchmark generator

Generates single-page documents **and their exact ground truth** for four
parsing benchmarks at once. Each page is built as a logical *model*, then
serialized two ways:

1. the **answer** (clean structural JSON/markdown), and
2. a fully-styled HTML page → rendered to **PDF** with headless Chrome.

Both come from the same model, so the PDF and the ground truth can never
disagree — no human annotation, no parser-in-the-loop.

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
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--out` | (required) | Output dataset folder (siblings `-text`/`-layout`/`-charts` as needed). |
| `--count` | `50` | Number of documents. |
| `--seed` | clock | Base RNG seed — reproduces the run (content is LLM-stochastic; structure/style are deterministic). |
| `--tests` | `table` | Comma list: `table,text,layout,chart`. |
| `--chart-focus` | auto | 0–1 ratio of chart-centred docs (defaults to 1 when only `chart` is requested). |
| `--text-focus` | auto | 0–1 ratio of prose-heavy (mostly-text) docs. |
| `--templates <dir>` | in-repo `templates/` | Style-template bank to draw from. |
| `--llm-concurrency` | `50` | Parallel Gemini content calls. |
| `--render-concurrency` | `6` | Parallel Chrome pages. |
| `--no-llm` | off | Procedural content (offline). |
| `--no-html` | off | Don't save the per-doc `src/<id>.html` + `<id>.gen.json`. |
| `--clean` | off | Clear the output folders first. |
| `--multipage` | off | Allow multi-page "huge" tables; emits one random page of each (default: single-page docs only). |

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
pick domain (76)  ─┐
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
  enable with `--multipage`), **panels** (N-up
  mini-pages), **text-focus** (prose, ≤1 small table). Multi-column (1–4) and
  landscape supported.
- **Style** — every doc draws a real-PDF-derived template (page, fonts, borders,
  colors, header band, zebra, padding, logo, watermark, header/footer), lightly
  jittered for variety. Contrast guards keep text readable; the page is always
  single-page (content measured + print-scaled to fit).
- **Typography** — 46 bundled open-source **Google Fonts** (`@font-face`-inlined),
  so type is varied, coherent, and renders our generated text with full glyphs.

## Document types (76)

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
comparative_market_analysis · warranty_card

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
| `domains.mjs` | 76-domain registry, document prompt, response schema, per-doc flavor |
| `llmContent.mjs` | builds a doc model (LLM) — shapes: normal/dense/extreme/huge/panels/text |
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
