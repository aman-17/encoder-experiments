# Replica template guide

You are building ONE template module that visually replicates a specific real failing
ParseBench table PDF — same page layout, same table structure, same visual style
(gridlines, fonts, shading, density, header tiers, quirks) — but with freshly
generated values every seed. The synthetic PDF should be mistakable for a sibling
page of the same real document.

## Contract

Create `templates/<family>.mjs` exporting:

```js
export function generate(seed) {
  const rng = mulberry32(seed);   // copy mulberry32 from templates/snaking_class_deviations.mjs
  ...
  return { html, gt, pageOpts };
}
```

- `html`: complete self-contained page (inline CSS only, system fonts only:
  Arial/Helvetica, Times/Georgia, "Courier New" for typewriter/monospace looks).
  Set explicit page size in CSS (`@page { size: ...; margin: 0 }`) AND matching
  body width/height so layout is deterministic.
- `gt`: `expected_markdown` — clean `<table>` HTML in the **logical** shape
  (see GT rules below). `<th>` for header cells, colspan/rowspan attributes only
  where the logical GT genuinely has merged cells. Multiple logical tables →
  multiple `<table>` blocks joined with `\n\n`.
- `pageOpts`: puppeteer `page.pdf()` options. Default is A4 portrait. For
  landscape: `{ format: "A4", landscape: true }`. For custom/tall pages:
  `{ width: "210mm", height: "840mm" }` etc. `printBackground: true` is already set.

## GT rules (critical — this is what the eval compares against)

- The manifest row (`manifest.csv` in the real-PDF dir) gives the logical shape:
  `cells`, `cols`, `merged_cells`. Your GT must have the same STRUCTURE TYPE:
  cells within ±15% of the real count, same column count, merges only if the real
  GT has them.
- Visual layout ≠ logical GT. Snaking/side-by-side repeated column groups flatten
  to ONE logical table in column-major (down-then-across) order. Mirrored halves
  fold. N distinct side-by-side panels with the same schema flatten into one table
  (check cols in manifest: if manifest cols == one panel's cols, it's flattened).
- Spacer/blank layout rows are NOT GT rows. Wrapped header text is ONE logical
  header cell (use spaces, not <br>, in GT).
- Values in GT must byte-match what the HTML renders (same strings, same order).

## Workflow

1. Read the real PDF visually (Read tool on the PDF path you were given).
2. Read `templates/snaking_class_deviations.mjs` as the reference pattern.
3. Write your template. Generate DIFFERENT but domain-plausible values with the
   seeded rng (company names, dates, codes, premiums...). Keep the real doc's
   value style: leading zeros, $ signs, parentheses negatives, N/A cells,
   footnote markers — whatever the real page does.
4. Render: `cd <replicate dir> && node render.mjs templates/<family>.mjs 1 out`
5. Read the produced `out/<family>_s1__p1.png` and compare against the real page.
   Fix and re-render until the layout/style matches at a glance (max 3 iterations).
   Aim for: same table furniture (rules/borders/shading), same density and font
   scale, same header structure, same page composition (title blocks, footers,
   whitespace regions, side content).
6. Render seed 2 as well to confirm values vary and nothing overflows.

## Style notes

- Match font SIZE impressions (micro 4-5pt grids stay micro).
- Replicate quirks that make the doc hard: identical-value saturation (e.g. 90%
  of factors literally "1.000"), lexicographic sorts, blank spacer rows, repeated
  header groups, stray footer tokens, underlined header abbreviations.
- Scanned-look docs: replicate layout/typography cleanly; do NOT attempt scanner
  noise. A `filter: grayscale(1) contrast(1.05)` on body is the most you may add.
- Do not import anything except copying mulberry32. No external assets, no logos —
  approximate logos with styled text/colored blocks.
