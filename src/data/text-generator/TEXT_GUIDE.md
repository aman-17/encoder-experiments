# Dense-text family guide (addendum to REPLICATE_GUIDE.md)

Same contract: `generate(seed) -> {html, gt, pageOpts}`, mulberry32, deterministic,
self-contained HTML, system fonts (CJK: "Hiragino Sans", "Hiragino Mincho ProN";
latin: Times/Georgia/Arial; mono: Courier New).

## GT = markdown TEXT (not table HTML)

`gt` is the page's full text as clean markdown in LOGICAL READING ORDER:

- Headings: `#`/`##`/`###` by visual hierarchy. Display headlines = `#`.
- Emphasis must mirror the render exactly: `**bold**`, `*italic*`,
  `<u>underline</u>`, `~~strikethrough~~`. This family fails ParseBench on
  FORMAT score — emphasis fidelity is the whole point.
- Paragraph-numbered genres keep their tokens verbatim: `[0032]`, `(i)`, `(1)`.
- Lists: `-` for dash lists, `1.` for numbered. Indented sub-lists 2 spaces.
- Boxed/sidebar content: emit where it logically reads (after the paragraph it
  interrupts), preceded by its own heading/caption line if it has one.
- Figures/photos: render as gray placeholder blocks (no external images); GT
  carries ONLY the caption line (e.g. `図表 18 ...` / `Figure 3 ...`), not the image.
- Vertical Japanese (tategaki, writing-mode: vertical-rl): GT in logical reading
  order — headline first, then columns right-to-left, each top-to-bottom.
- Page furniture (page numbers, running headers like `6/179`): include at the
  position it visually occupies (header first / footer last).
- GT text must byte-match rendered text (same characters incl. full-width forms).

## Drift mandate (anti-overfitting — REQUIRED)

You are building a FAMILY, not a replica. Anchor gives the genre + failure mode;
your seeds must wander around it:
- seed-vary: column count/widths, emphasis density (underline every 5th vs 15th
  word), paragraph-number ranges, section counts, font family within class,
  font size ±15%, box/sidebar presence, figure count 0-3, page furniture style.
- content is FRESHLY WRITTEN (invented companies, invented topics, plausible
  domain prose). NEVER transcribe sentences from the anchor PDF. Fictional
  names only; shift years.
- 2-4 discrete "layout modes" per family (e.g. 1-col vs 2-col, box top vs box
  mid) selected by seed, so 50 seeds don't share one skeleton.

## Verify loop

Render seeds 101/102/103 into out_text/, Read a thumbnail, confirm: dense look
matches genre, no overflow (1 page unless the family is a spread — spreads use
one wide page), GT reading order sane, emphasis in GT matches what's rendered.
Max 3 fix iterations. CJK families: confirm glyphs actually rendered (no tofu).
