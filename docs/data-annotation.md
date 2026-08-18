# How the data is made and annotated

This doc answers: **where do the pages come from, and where does the ground
truth come from?**

Everything below follows **one real document** — `synth_70w_0014` — through
the whole pipeline. Every JSON block is copied verbatim from the corpus.

---

## The core idea: never annotate, always emit

Normal document datasets are made by taking existing PDFs and paying people
(or a model) to draw boxes and type out the text. That gives you label noise,
disagreement between annotators, and a hard ceiling on how many labels you can
afford.

We do the opposite. Every page is built as a **logical model first** — a table
with known rows and columns, a chart with known data points, a paragraph with
known text — and that model is serialized **twice**:

```
                    ┌──→ the answer  (JSON / markdown ground truth)
   logical model ───┤
                    └──→ styled HTML → headless Chrome → PDF → PNG
```

Both come from the same object, so **the picture and the ground truth cannot
disagree**. No human annotation, no OCR in the loop, no parser guessing what a
cell was. The generator's own README puts it as: *"Both come from the same
model, so the PDF and the ground truth can never disagree."*

That is what buys us exact character-level labels at ~zero marginal cost —
which is the only reason probing at 41,000 marked characters was affordable.

---

## The generator family

Five toolkits under `src/data/`, each producing a different document species:

| generator | content source | what makes it hard |
|---|---|---|
| `table-generator` | **Gemini** writes the domain content | 81 domains, 2,535 real-PDF style templates, 46 inlined fonts, ~11 table shapes (nested 3-tier headers, spanning cells, borderless, multipage) |
| `chart-generator` | **Gemini** + a dependency-free SVG chart lib | 28 chart types, multi-series, value labels off, document archetypes (arxiv / journal / magazine / textbook / slides) |
| `math-generator` | 100% procedural, no LLM | 6–20 KaTeX formulas per page, 3 difficulty tiers, 5 modern archetypes + an old-scanned-book family (`treatise18`, `letterpress1900`, `midcentury`) |
| `text-generator` | template modules | 10 dense-text families reverse-engineered from real failing pages |
| `failing-table-replicator` | template modules | 34 table families, each a visual replica of a specific real ParseBench page we score badly on |

The last two exist because of a deliberate choice: rather than generating
"average" documents, we rebuilt the *specific kinds of page our models fail
on*, with fresh values every seed.

**Determinism.** One `--seed` reproduces a whole dataset. Per-document seeds
come from a single line, byte-identical across all three JS generators:

```js
const deriveSeed = (base, i) => (base ^ Math.imul(i + 1, 2654435761)) >>> 0;
```

feeding a mulberry32 RNG. Document ids encode that provenance:
`synth_70w_0014` = base-36 of run seed 9104 (`70w`), document index 14.
**Caveat we state honestly:** structure and styling are deterministic; the
*LLM-authored content* is not, so a rerun reproduces the layout, not the words.

---

## The example document

`synth_70w_0014`, from its `gen_manifest.jsonl` row:

```json
{"id": "synth_70w_0014", "generator": "table-generator",
 "style": "tmpl_25-07-230-MN-Lyon-County-Station-Information-Sheet-P03~v",
 "era_fonts": true, "seed": 9104,
 "flags": "CG_SCAN_ERA=1 --tests table --count 70 --seed 9104"}
```

A landscape A4 engineering bill-of-materials for a fictional Swedish brewery,
styled after a real Minnesota county station information sheet, with
period-appropriate fonts. Two tables, 20 layout regions, a watermark.

Files on disk for this one document:

```
   146,140  docs/tables/synth_70w_0014.pdf                 the page itself
     6,642  docs/tables/synth_70w_0014.test.json           gold markdown/HTML
   127,252  docs/tables/synth_70w_0014.cells.json          every cell, positioned
     4,878  docs/tables/synth_70w_0014.layout.json         every region, classified
   312,146  glyphs/synth_70w_0014.p0.sidecar.json          every character, positioned
   144,229  images/clean/tables__synth_70w_0014.png        200 DPI raster
 4,745,997  images/degraded/synth_70w_0014__sev2.png       the "photocopied" twin
     4,614  images/degraded/synth_70w_0014__sev2.layout.json   twin's regions, re-aligned
    84,712  images/degraded/synth_70w_0014__sev2.cells.json    twin's cells, re-aligned
     1,202  images/degraded/synth_70w_0014__sev2.degrade.json  what was done to it
```

Note the ratio: **312 KB of character-level annotation for a 146 KB page**,
produced in milliseconds, with zero human involvement.

---

## Annotation layer 1 — the answer (`.test.json`)

What a perfect model should output. For tables it is HTML:

```html
<table>
  <tr>
    <th>Item</th><th>Part No</th><th>Description</th><th>Material</th>
    <th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Extended Cost</th>
    <th>Supplier</th><th>Cert</th><th>Status</th>
  </tr>
  <tr>
    <th>Stainless Vat</th><td>SV-202</td><td>300L Fermenter</td>
    <td>SUS316</td><td>2</td><td>EA</td><td>15000 kr</td>
    <td>30000 kr</td><td>NordicSteel</td><td>Yes</td><td>Active</td>
  </tr>
  ...
```

The file also carries the generator's own difficulty self-report:
`table_difficulty: "hard"`, `border_style: "horizontal"`,
`visual_difficulty: "hard"`.

This is what end-to-end scoring compares against (TEDS for tables, edit
similarity for text).

---

## Annotation layer 2 — regions (`.layout.json`)

Every visually distinct block on the page, classified and boxed:

```json
{"version": 2,
 "coords": "integer 0-1000 scale over the page, x rightward, y downward (top-left origin); bbox=[x,y,w,h]",
 "ontology": "canonical17",
 "page_w_px": 1122, "page_h_px": 794,
 "items": [ ... ]}
```

The 20 items on this page, verbatim (id, class, bbox, reading order, text):

```
 0  Title           [ 27,  39, 270,  16]   'Björkhedens Bryggeri AB: Engineering BOM…'   {level: 1}
 1  Text            [ 27,  60, 166,   8]   'Component Specification and Regulatory…'     {role: subtitle}
 2  Text            [915,  69,  58,   6]   'Stockholm, Sweden – October 14, 2022'        {role: doc-meta}
 3  Text            [ 27,  75, 298,   6]   'This document outlines the primary…'
 4  Section-header  [ 27,  91,  70,  10]   'Component Specifications'                    {level: 2}
 5  Text            [ 27, 107, 105,   6]   'Procurement summary for the 2022…'
 6  List-item       [ 27, 118, 105,   6]   'Lead supplier contact: procurement@…'
 7  List-item       [ 27, 128,  76,   6]   'Quality audit conducted August 2022.'
 8  Text            [ 27, 141,  68,   6]   'All costs are in Swedish Kronor (kr).'
 9  Table           [ 27, 152, 945, 156]   ''
10  Section-header  [ 27, 315,  80,  10]   'Regulatory Compliance Matrix'                {level: 2}
...
18  Page-footer     [964, 928,   9,   5]   'Page 4'
19  Text            [448, 391, 105, 123]   'INFO'                                        {role: watermark}
```

**The Canonical17 ontology** (the same 17 classes ParseBench uses, so our
labels are directly comparable to the benchmark's):

```
Caption · Footnote · Formula · List-item · Page-footer · Page-header ·
Picture · Section-header · Table · Text · Title · Checkbox-Selected ·
Checkbox-Unselected · Code · Document Index · Form · Key-Value Region
```

Three conventions worth internalizing, each of which we got wrong once:

- **Boxes are integers on a 0–1000 scale**, not pixels and not floats. This is
  the Qwen-VL grounding convention, so labels can be fed to a model as text.
  Divide by 1000 to get the normalized frame everything else uses.
- **Boxes are tight to ink, not to the layout column.** An early version boxed
  a memo's paragraph as the full column width; the fix was to measure actual
  glyph extents. If a box is looser than the text it contains, that is a bug.
- **`reading_order` is explicit**, and `attrs` carries per-class extras —
  heading `level`, text `role` (subtitle / doc-meta / watermark), and for
  formulas the source `latex`.

---

## Annotation layer 3 — table cells (`.cells.json`)

Every cell of every table, with its grid position, spans, and box:

```json
{"id": "synth_70w_0014", "page": 1, "page_px": {"w": 1122, "h": 794},
 "coords": "normalized [0,1] over the page; x rightward, y downward",
 "tables": [{"table_index": 0, "grid_rows": 6, "grid_cols": 11, "cells": [...]}]}
```

One cell:

```json
{"row": 0, "col": 0, "grid_row": 0, "grid_col": 0,
 "rowspan": 1, "colspan": 1, "tag": "th",
 "bbox": [0.0274, 0.1517, 0.1455, 0.0485], "text": "ITEM"}
```

**The trap:** two generators use two different box conventions —
table-generator writes `[x, y, w, h]`, the replicator writes corners
`[x0, y0, x1, y1]`. We learned this the hard way when the degradation script
transformed 93 files with the wrong interpretation and scrambled them. The fix
was to **sniff the convention per file** (the payloads are self-describing) and
transform each in its own convention. If you write code that touches cells,
sniff — don't assume.

---

## Annotation layer 4 — every character (`.p0.sidecar.json`)

The layer that made the whole probing program possible. Produced by
`src/data/pdf_probe_sidecars.py`, which simply asks PyMuPDF what the PDF's own
text layer contains:

```json
{"page_w_pt": 841.92, "page_h_pt": 595.92,
 "glyphs": [...], "words": [...], "blocks": [...]}

glyphs[0] = {"char": "B",
             "bbox": [0.0274, 0.0394, 0.0331, 0.0550],
             "font": "FiraSans-Bold",
             "size_pt": 7.7775}
```

Every character on the page, with its exact box, its font, and its point size.
This is not inferred — it is what the PDF says it drew. Which is why the
character probe has **zero label noise**, and why we can slice results by font
and by type size for free.

---

## Making it hard: degradation (`degrade.py`)

Clean renders are too easy and unlike real documents, so each page can be aged
into a scan. Eight presets: severities **0–4** plus book variants **1b/2b/3b**.

```
0  born-digital (untouched)   — bit-exact passthrough
1  light office scan          — faint grain, mild skew
2  typical photocopy          — desaturated, toner texture, lamp gradient
3  aged, re-scanned copy      — stains, bleed-through, drum streaks, real skew
4  fax-grade                  — near-binarized, heavy grime, dropout lines
1b/2b/3b  book stock          — amber page tone, gutter shadow, foxing
```

Each preset is ~30 knobs (paper tone, blotch, fibre, lighting falloff,
vignette, ink mottling, bleed, stains, specks, gamma, contrast, blur, noise,
JPEG quality…). One knob is deliberately pinned across every severity:

```python
"blur": (0.05, 0.10),   # identical at severities 1-4
```

That is a **legibility floor we set by hand** after several rounds of "sev 3
and 4 are not even human readable" — degradation should make a page look old,
not make it unreadable. Realism is bounded by the requirement that a person can
still read it.

### The part that matters for annotation: keeping labels aligned

Degradation *moves pixels* — rotation, skew, shift, scale jitter. If the boxes
didn't move with them, every annotation would silently drift out of alignment.

So the geometry is restricted to a single **affine transform**, recorded per
page as `scan_geom_matrix`, and applied to the pixels and the annotations by
the very same matrix:

```python
# cv2.warpAffine without WARP_INVERSE_MAP treats its matrix as src->dst,
# so the very same M_px that moves the pixels also moves the coordinates.
```

The rules that follow from that, enforced in code:

- **No warp that an affine can't express.** Page curl is banned outright. The
  book "gutter shadow" is a *photometric* darkening band, never a bend —
  because a bend would invalidate every box on the page.
- **Any augmentation that resizes the image is dropped**, not silently
  accepted, because a resize would break the coordinate contract.
- The transform is applied to `.layout.json`, `.cells.json`, `.pixels.json`,
  and glyph sidecars alike, each in its own convention.

The realized parameters are stamped alongside each degraded page in
`.degrade.json`, e.g. sev-3 rotation +1.4962°, skew 0.1229, shift (−26.29,
−7.21) px. Nothing is left implicit.

**Determinism:** every random choice derives from
`blake2b(image_id, severity, base_seed)`, so `sev2` of this page is the same
page every time, and `2b` hashes differently from `2`.

Also worth knowing: a `no_geom` flag exists (identity affine, photometric
only). It was added for the activation-patching experiment, which needed
clean/degraded pairs at **identical pixel dimensions** so both produce
token-identical grids.

---

## From annotations to probe rows

`probe_sampler.py` turns the sidecars into the flat rows that training and
probing consume. For our example page it emitted, verbatim:

```json
{"probe": "glyph_id", "image_id": "tables__synth_70w_0014",
 "point_xy": [0.082311, 0.063358], "label": 13,
 "meta": {"char": "n", "size_pt": 3.71, "font": "FiraSans-Regular",
          "difficulty": "hard", "scan_severity": "0", "generator": "tables"},
 "doc_id": "synth_70w_0014"}

{"probe": "cell_row", "point_xy": [0.10017, 0.175958], "label": 0,
 "meta": {"table_index": 0, "n_rows": 6, "n_cols": 11, "is_header": true,
          "row_span": 1, "col_span": 1, ...}}

{"probe": "pl1_class", "point_xy": [0.202425, 0.741761], "label": "Table",
 "meta": {"class": "Table", "n_boxes": 20, ...}}

{"probe": "pl2_extent", "point_xy": [0.190319, 0.039923],
 "label": [0.027, 0.039, 0.27, 0.016],
 "meta": {"class": "Title", "item_index": 0, ...}}
```

Note that 3.71 pt character — the page is genuinely dense, and the sampler
records the size so results can be sliced by how small the text was.

Per-page sampling caps, so no single page dominates:

| family | source | cap | label |
|---|---|---|---|
| `glyph_id` | glyph sidecar | 60 / page | character index (88-char alphabet) |
| `cell_row` / `cell_col` | cells.json | 40 / table | row index / column index |
| `pl1_class` | layout.json | 96 / page | Canonical17 class at that point (smallest containing box wins) |
| `pl2_extent` | layout.json | 2 / region | that region's `[x,y,w,h]` |
| `series_id` / `point_value` | pixels.json | 30 / page | series index / plotted value |
| `pl3_summary` | layout.json | 1 / page | 17 class-presence flags + box count |

Our example page yields **357 probe rows** clean (60 glyph + 80 cell_row +
80 cell_col + 96 pl1 + 40 pl2 + 1 pl3), plus **297 more** from its degraded
twin — and the twin has no glyph rows, because we don't have a text layer for
a scanned image. That absence is itself a documented limitation: it's why the
glyph-vs-degradation curve is the one measurement we never got.

Two conventions that quietly matter:

- **Points are rounded to 6 decimal places** and matched by *exact* equality
  against the cached feature store. A mismatch is a hard error naming the
  nearest stored point — never a silent nearest-neighbour fallback.
- **Sampling is seeded per (image, family)** via blake2b, so the same corpus
  always produces the same rows, and no global RNG state can leak in.

---

## Corpus scale

**Pilot** (`data/pilot_1k/`): 1,000 documents → 1,420 images (420 degraded at
severities 1–3b) → **288,329 probe rows** across 8 families.

**R5 training corpus** (`data/corpus_r5/`): 5,000 fresh glyph-heavy documents
(3,000 dense text / 2,000 math), clean only, **300,000 glyph probe rows**,
median character size ~8 pt. Generated end-to-end in about 90 minutes.

An audit of that second corpus caught two "text" templates that were actually
Japanese-content families — CJK we deliberately exclude, since our fonts don't
cover it. They were purged and replaced. **Every corpus gets a visual
spot-check by a person (or an agent instructed to actually look at the
images)** before it is used; this is the second time that step caught something
a schema check never would.

---

## The honest limitations

State these before anyone else does:

1. **Synthetic ≠ real.** Our pages are rendered from HTML by Chrome. Real
   documents have artifacts no generator reproduces. This is why the deciding
   experiments run on public benchmarks, not on our own corpus.
2. **Diversity ≠ volume.** The 5k corpus is 5,000 pages but only ~11 template
   families. The language model nearly memorizes it (loss ~0.002). More seeds
   of the same template is not more data in any meaningful sense — the next
   scale-up has to add *template, font, and rendering variety*.
3. **The difficulty taxonomy is degenerate.** We built an easy/medium/hard/multi
   tagger; on dense pages it labels nearly everything "hard", so nothing in the
   current work stratifies on it. It's still emitted; it just isn't load-bearing.
4. **No degraded-page character labels**, per above.
5. **LLM content is not reproducible** across regenerations, only structure and
   style are.

---

## The one-paragraph version

We never annotate documents; we *emit* them. Each page is built as a logical
model and serialized twice — once as ground truth, once as a styled PDF — so
the answer key is correct by construction. Four annotation layers come out of
that for free: the expected output, region boxes on the 17-class ParseBench
ontology at 0–1000 scale, every table cell with its grid position and spans,
and every single character with its exact box, font, and point size. Pages can
then be aged into realistic scans, with the constraint that only an affine
transform is allowed so every box can be moved by the same matrix that moves
the pixels. A sampler turns those layers into flat probe rows with per-page
caps and seeded selection. The result: 300,000 exactly-labelled characters for
about ninety minutes of compute and no human labelling at all.
