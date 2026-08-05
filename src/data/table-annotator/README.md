# Table Annotator (`tables_extended` ground truth)

A harness tool for building ground-truth `.test.json` rule files for the
`tables_extended` benchmark. Point it at a folder of single-page table PDFs and
it:

1. Parses every PDF with the local `cli2` (`agentic` tier, HTML tables in
   markdown-v2 + page screenshots) to seed an initial table transcription.
2. Serves a web app where you review each table **next to its page screenshot**,
   and **chat with one or more LLMs** (Claude / Gemini / GPT-5.4 families) to
   refine the HTML — including a fan-out mode that queries several models at once
   so you can pick the best candidate.
3. Saves the result as `<id>.test.json` in the dataset folder, in the exact
   `tables_extended` format (`expected_markdown` + optional flags) consumed by
   `~/Code/experimental/llamacloud-bench`.

## Prerequisites

- `npm install` in this folder (one-time).
- A **built LlamaParse worker checkout** — the annotator parses PDFs by shelling
  out to the worker's `cli2`. Run `pnpm compile` (or `pnpm build`) in the worker
  so `dist/worker/cli2.js` exists, and point the annotator at it with
  `--worker-root <path>` (or `$WORKER_ROOT`). Defaults to
  `~/Code/fourth/platform/llamaparse/worker`.
- The worker `.env` (loaded from `<worker-root>/.env`) with provider keys + the
  layout/OCR/S3 config the worker pipeline uses.
- Provider API keys for the chat step (each is independent — the UI greys out
  families whose key is missing):
  - `ANTHROPIC_API_KEY` → Claude Fable 5 (automatically falls back to Claude Opus 5 when unavailable), Claude Sonnet 4.6
  - `GOOGLE_GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) → Gemini 3.1 Pro, Gemini 2.5 Flash
  - `OPENAI_API_KEY` → GPT 5.6 Sol, GPT-5.4 mini

## Usage

From this folder:

```bash
./annotator --dataset ~/Code/pdfDataSetOrdered/tables_extended/v0.8 \
            --worker-root ~/Code/fourth/platform/llamaparse/worker
# then open http://localhost:5599
```

Options:

| Flag         | Default                                              | Meaning                                            |
|--------------|-----------------------------------------------------|----------------------------------------------------|
| `--dataset`  | (required)                                           | Folder of `.pdf` files to annotate.                |
| `--port`     | `5599`                                               | Web app port.                                      |
| `--workdir`  | `~/Code/tmp/tableAnnotator/<dataset-name>`           | Where cli2 outputs + the manifest cache live.      |
| `--tier`     | `agentic`                                            | Parse tier for the seed transcription.             |
| `--version`  | `latest`                                             | Tier version.                                      |
| `--reparse`  | off                                                  | Ignore the cache and re-parse every PDF.           |

The first run parses the whole folder (slow — `agentic`); results are
cached in `<workdir>/manifest.json`, so subsequent runs start instantly. The
parse never touches the dataset folder — each PDF is copied into a per-doc work
dir before cli2 runs.

## The UI

- **Left:** document list. A green dot = already annotated, red = no table was
  detected by the parser. Counter shows annotated / total.
- **Middle:** the page screenshot(s).
- **Right:** the editable `expected_markdown` HTML (with a live rendered
  preview), the benchmark flags (`table_difficulty`, `max_top_title_rows`,
  `trm_unsupported`, `allow_splitting_ambiguous_merged_tables`), and the chat
  panel.

**Chat:** click **Models ▾** to pick which models answer (toggle one for a quick
fix, or several to compare). Type an instruction ("the header should span 3
columns", "fix the merged cell in column 2", or leave it blank to just
transcribe). Each model returns a candidate table you can preview and **Use
this** to load into the editor. **Save .test.json** writes the file.

`⌘/Ctrl+Enter` in the chat box sends.

## Output format

`<dataset>/<id>.test.json`:

```json
{
  "expected_markdown": "<table>...</table>",
  "table_difficulty": "hard",
  "trm_unsupported": true
}
```

Existing fields in a `.test.json` (e.g. other benchmark rules) are preserved on
save; only `expected_markdown` and the flags are updated.

## Files

- `annotateTables.mjs` — CLI entry (parse phase → server). Run via `./annotator`.
- `parseDataset.mjs` — batch cli2 runner + manifest cache + HTML-table extraction.
- `llmProviders.mjs` — multi-provider chat (Anthropic / Google / OpenAI SDKs).
- `tableAnnotatorServer.mjs` — dependency-free HTTP server + API.
- `public/` — single-page web app.
