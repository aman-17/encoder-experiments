# math-generator

Synthetic **math-heavy document** generator for the parse benchmark. Builds
single-page PDFs of procedural technical prose + LaTeX formulas (rendered
server-side by KaTeX) with **exact gold markdown**: prose verbatim, headings as
markdown, and every formula as its original LaTeX source in `$...$` /
`$$...$$` delimiters.

Engine copied from `../table-generator` (same pattern as `../chart-generator`)
and fully self-contained — no runtime imports from sibling tools, **no LLM
anywhere** (content is 100% procedural and deterministic from `--seed`).

## Usage

```bash
npm install            # puppeteer, pdf-lib, @faker-js/faker, katex
node generateMath.mjs --out ~/datasets/synth_math_v1 --count 500 --seed 7 \
    --render-concurrency 4 [--clean] [--no-html]
```

Outputs per doc:

| file | contents |
|---|---|
| `<out>/<id>.pdf` | single-page A4 PDF |
| `<out>/<id>.md` | gold markdown (derived from the logical model, never the DOM) |
| `<out>/<id>.test.json` | `{ "expected_markdown": <same markdown string> }` |
| `<out>/src/<id>.html`, `<id>.gen.json` | debug HTML + full doc model (skip with `--no-html`) |

## Content

Three formula difficulty tiers (`formulas.mjs`), all numerically/symbolically
consistent where values are computed:

- **easy** — fractions, powers/subscripts, simple summations, quadratic-style
  equations, basic trig identities, geometry one-liners.
- **medium** — definite integrals, partial derivatives, limits,
  binomial/combinatorial identities, 2x2 matrices, short aligned expansions,
  expectation/variance/Bayes.
- **hard** — nested/continued fractions, multi-line aligned derivations (3-6
  steps), 3x3 matrices/determinants (cofactor-correct), `cases` environments,
  double/triple integrals and nested big operators, tensor index chains
  (Riemann/Christoffel/Einstein), series expansions.

Batch tier mix: **~20% easy / ~45% medium / ~35% hard** dominant docs; each doc
mixes tiers but is dominated by its own (`MG_TIER=easy|medium|hard` forces one).
6-20 formulas per doc, both inline (`$...$` inside prose, "where $x$ denotes
the ...") and display (`$$...$$`, numbered `\tag{N}` equations on paper/textbook
styles, referenced from the prose).

## Styles & layout

Five archetypes (`mathStyles.mjs`, forceable via `MG_STYLE`, csv ok):
**textbook** (chapter kicker, tinted theorem/definition boxes),
**paper** (arXiv two-column look: byline, abstract, numbered sections,
small-caps envs), **lecture** (wide annotation margin, informal headers),
**exam** (numbered problems with points, instructions box),
**handbook** (dense 2-3-column labelled formula reference).

**Old scanned math book family** (`MG_OLD_BOOK=1`, or name a substyle in
`MG_STYLE`): three period substyles picked per-doc by the seeded rng, modelled
on real scanned pages (typography/layout only — paper aging is the degrade
stage's job). **treatise18** (EB Garamond/Cardo, long-ſ medial-s substitution
in body text — recorded verbatim in the gold — italic running head + page
number, `§. N.` section marks, bracket fractions/factorials, series ending in
`&c.`, catchword bottom-right, wide margins), **letterpress1900** (PT
Serif/Noto Serif, `Art. N ]` + letterspaced caps chapter title + page running
head, loose uneven per-paragraph word spacing, big-paren integer matrices and
subscripted quadratic forms, small-caps `Example N :` lead-ins),
**midcentury** (Libre Baskerville/Crimson Text/Lora, italic running head +
page, justified em-indent paragraphs, italic `Theorem m.n.` lead-ins,
bracketed matrices, right-aligned `\tag` equation numbers). All old-book docs
are single-column, era serif faces only, and their formula mix is biased per
substyle (treatise: series/binomials/fractions; the other two: matrices and
subscripted systems). Flag-off runs are unaffected (same-seed byte-identical).

1/2/3-column bodies use the engine's CSS column flow. Wide formulas (long
aligned derivations, big matrices) in 2-column docs are set **full-width by
segmenting the column flow** (not CSS `column-span:all`, which fragments
Chrome's print output across pages); 3-column docs exclude wide formulas at
content time.

## Ground-truth contract

- Gold derives ONLY from the logical model (`mathContent.mjs` →
  `docMarkdown()` in `mathRender.mjs`); rendering cannot change it.
- Every formula is KaTeX-validated at model-build time
  (`throwOnError:false` + error-box detection): a failing formula is **logged
  and regenerated**, so PDFs contain zero red error boxes.
- Render chrome that would desync text from gold is stripped (watermarks,
  logos, `text-transform: uppercase` heading decor).
- Duplicate display formulas are de-duplicated doc-wide.
- Single page enforced by the engine's `fitScale` + shrink-and-retry loop
  (content is sized to fit at scale 1; the loop is a safety net).

KaTeX CSS + its webfonts are inlined as base64 data URIs (`katexCss.mjs`),
matching how `googleFonts.mjs` inlines body fonts — headless Chrome needs no
network.

## Env flags

| flag | default | effect |
|---|---|---|
| `MG_STYLE` | `mix` | force archetype(s): `textbook,paper,lecture,exam,handbook` + old-book `treatise18,letterpress1900,midcentury` (csv) |
| `MG_TIER` | `mix` | force a single difficulty tier for all docs |
| `MG_OLD_BOOK` | off | `1` = old-scanned-book family: seeded per-doc pick among the three period substyles |

Both default to no behavior change (batch mix as described above).
