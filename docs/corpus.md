# Real-PDF corpus — regenerating scriptocr-data with exact annotations

The training corpus behind the failed repair was **11 templates**. The
projector rewrote itself 0.796 in relative Frobenius norm to fit them, LM loss
fell to ~0.002, and the checkpoint lost 21–23 points on every public benchmark.
The quantity that failure is a function of is **layout diversity**, not
document count, so this pipeline maximizes distinct templates.

Source: `~/Desktop/scriptocr-data/` — a sha256 content-addressed store,
16 GB, **8,378 unique PDFs**.

Status: Stages 0–2 complete and validated. Stage 3 (recipe mining) next.

---

## What the store actually contains (Stage 0)

Full census, all 8,378 documents, **0 read errors**:

| property | value |
|---|---|
| pages | **483,852** (median 17/doc, mean 56.4, max 372) |
| text layer | 76% born-digital, 23% sparse, 1% scanned |
| scripts | latin 90.8%, **han 5.9% + kana 0.5%**, cyrillic 0.2%, arabic/hangul ≈ 0 |
| structure | **44.9% table pages** (28.9% heavy + 16.0% light), 46% carry raster images |
| producers | PDFsharp 20%, EDINET 11%, iTextSharp 9%, Distiller, Acrobat Paper Capture |

`docs.jsonl` (one row per PDF) and `pages.jsonl` (one row per page) are written
by `encoder_experiments.corpus.inventory`. Page rows carry geometry, margins,
font stack, per-script character counts, font-size percentiles, rule counts,
image area, column estimate and a layout signature — chosen so Stages 1–3 never
need to reopen a PDF.

**Arabic (28 pages) and Korean (8 pages) are effectively absent.** Our
benchmark weakness map flags RTL and Korean; this corpus does not address them
and no amount of selection will change that.

---

## Layout diversity (Stage 1)

The concern going in was that one PDF library at 20% of the store would collapse
the corpus back to a handful of templates. It does not:

| measure | value |
|---|---|
| distinct exact layout signatures | **84,347** |
| distinct coarse layout families | 5,373 |
| singleton layouts (appear once) | 49,874 |
| top-10 family share of all pages | 28.3% |

Two granularities, because they answer different questions. `sig_exact`
fingerprints geometry + margins + body size + columns + rules/images + font
stack — pages collide only if one template emitted them. `sig_coarse` drops
typography to group a publisher's whole output across font drift. **Caps apply
to `sig_coarse`, diversity is reported on `sig_exact`**, so a cap can never be
satisfied by five hundred fonts of one layout.

---

## Selection (Stage 2)

`selected_40k.jsonl` — **31,534 pages from 6,959 source documents**:

| measure | value |
|---|---|
| distinct exact layouts | **18,515** |
| distinct coarse families | 3,920 of 4,937 available |
| top-10 family share | **1.9%** (from 28.3% in the raw store) |
| max pages from any one document | 8 |
| archetypes | table_heavy 10,135 · table_light 7,713 · prose 4,197 · multi_column 3,820 · figure_heavy 3,800 · dense_text 1,869 |
| scripts | latin 27,937 · han 2,785 · kana 262 · cyrillic 249 |
| body size | 5,071 pages under 9pt |

Selection is **breadth before depth**: pass *q* lets each source document
contribute its *q*-th page, so every document is represented once before any
gives a second. The first implementation used a single round-robin and cost
34% of reachable pages — rare clusters drained the small-text documents to
their per-document cap, and the large clusters then found nothing uncapped
left. It also left a third of the source documents unrepresented. Fixing it
took selection from 23,041 pages / 5,678 documents to 31,534 / 6,959.

Small body text is drafted first within a cluster, deliberately:
`long_tiny_text` is the slice the failed repair scored **0 of 442** on.

---

## Contamination gate (Stage 1b)

The risk regeneration does *not* remove: mine a recipe from a PDF that is also
an olmOCR-bench page, emit 40 training pages from it, and every external number
we report afterwards is void. So the unit of quarantine is the source document
and the test is character-level — word n-grams are unusable when 6.4% of the
store is Japanese.

Screened against **all three benchmarks we quote** — 4,258 gold entries:
olmOCR (1,225 pages with a text layer, of 1,403; the rest are scans),
OmniDocBench (1,649), PulseBench-Tab (1,820, all nine languages).

**Result: 7 of 31,534 selected pages flagged, 0 unreadable.** All 7 are
PulseBench SEC filings, and all 7 are **boilerplate collisions, not document
identity** — every filer's "Equity Compensation Plan Information" table carries
identical column headers, which is enough to drive character containment to
0.35–0.80 between unrelated companies. The figures do not collide: **0 shared
multi-digit runs in all 7 cases**, on pages carrying 4–48 numbers each. They
are quarantined anyway; 7 pages of 31,534 is not worth an argument about
whether an external number is clean.

That triage is now a gate output rather than a manual step: each flag carries
`numeric_jaccard`, so a genre collision (~0) is distinguishable from real
identity without opening a PDF.

Note where the 7 sat: pages **113, 108, 82, 64, 54, 136 and 6**. Document-head
screening would have missed six of them, and the pre-fix matcher would have
missed all seven.

A gate returning zero is worthless until it is shown to fire, so it was
validated on injected positives before being believed:

| control | caught |
|---|---|
| verbatim bench page | 20/20 per bench, all three |
| bench page buried in filler | 20/20 per bench, all three |
| bench page as 1 of 20 pages | 25/25 |
| bench page with 5% of characters dropped | 25/25 |
| **negative: all 8,378 real document heads** | **0 false positives** |

The Pulse positives cover Arabic, Chinese, Japanese, Korean and Russian gold,
so the CJK/RTL path is exercised rather than assumed.

That validation found a real bug. Confirmation originally compared two
4,000-character prefixes and ranked candidates on *document-in-gold*
containment, so a bench page sitting past the prefix of a long filing scored
zero — precisely the case the gate exists to catch. It now ranks on
**gold-in-document** containment, which is position-invariant. Two other
defects surfaced the same way: a salted `hash()` that would silently break any
persisted index, and a flat 200-character gold-length floor that discarded
Japanese gold entirely (141 CJK characters carry roughly what 361 Latin ones
do), which would have exempted the CJK share from the check we added it for.

**Known limit:** document-head screening reads only the first 2,000 characters
per document. The page-level screen above does not have that limit, and it is
the one that gates regeneration.

**Final corpus after quarantine: `selected_final.jsonl` — 31,527 pages,
18,509 distinct exact layouts, 6,959 source documents.**

---

## Files

| path | what |
|---|---|
| `src/encoder_experiments/corpus/inventory.py` | Stage 0 census |
| `src/encoder_experiments/corpus/cluster.py` | Stage 1 layout signatures, archetypes |
| `src/encoder_experiments/corpus/decontam.py` | Stage 1b gate |
| `src/encoder_experiments/corpus/select.py` | Stage 2 selection |
| `data/scriptocr/manifest/{docs,pages,pages_annotated}.jsonl` | the manifest |
| `data/scriptocr/selected_40k.jsonl` | the 31,534 chosen pages |
| `validation/corpus_{cluster_census,selection_40k,decontam,decontam_pages}.json` | run records |

50 tests across `tests/test_corpus_{inventory,select,decontam}.py`; suite at
309 passed, 1 skipped.

---

## Remaining stages

**Stage 3 — recipe mining.** Extract page geometry, grid, block types, table
structure, font stack and spacing per selected page.
`src/data/table-generator/extractTemplates.mjs` already does most of this for
tables (mechanical facts via `pdffonts`/`pdftotext -bbox`/`pdfinfo`, then an
LLM assigns visual style with fonts stayed grounded in the real PDF); it needs
generalizing to full-page layouts.

**Stage 4 — regeneration.** Author synthetic content into the mined layout —
same word-length distributions, numeric formats and density as the source,
different tokens — then the existing annotation pass runs unchanged.

**Stage 5 — verification.** Round-trip assert (re-extract from the regenerated
PDF, must match what we authored exactly), mandatory visual audit, fidelity
against source statistics, effective template count on the *output*, and
relative Frobenius drift after retraining — the 0.14–0.19 band, not 0.796.

**Stage 6 — splits**, held out by source document *and* template cluster.

**The real-page held-out set** runs alongside: direct annotation of real pages
via their own text layer, glyph and text labels only. Cheap, and it unblocks
G2 — whether the 44% bridge loss reproduces off our renderer, which every
number in the program so far has been unable to answer.
