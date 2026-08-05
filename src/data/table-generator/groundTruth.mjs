// Builds ground truth for the non-table test types from the same generated
// page, in the formats of the existing benchmarks:
//   text_extended  -> bag-of-sentence / word / digit rules + original_md
//   layout (v1.4)  -> per-element {canonical_class, bbox, content, ro_index}
// (chart ground truth is emitted separately where a figure's data is known.)

import { groundTruthHtml } from "./render.mjs";

function stripTags(s) {
    return String(s || "")
        .replace(/<\/?(?:strong|em|u|sup|sub|br|a|s|del|strike|ins|cite|small|big|mark|abbr|q|span|code|tt|kbd|var|samp|dfn|time|bdi|font|b|i)\b[^>]*>/gi, "");
}

// Convert the whitelisted inline HTML in prose into Markdown for the gold .md /
// expected_markdown, so the reference reflects the formatting actually rendered
// in the PDF (a parser that recovers bold/italic/strike/links scores correctly):
//   <strong>->**  <em>->*  <s>/<del>->~~  <a href>-> [text](url)
// <u>/<sup>/<sub> have no Markdown equivalent and stay as inline HTML (valid in
// Markdown); <br/> collapses to a space. Tables keep their inline HTML markup
// via groundTruthHtml, so this only covers prose.
function mdInline(s) {
    return String(s || "")
        .replace(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
            (m, q, url, txt) => (/^(https?:\/\/|mailto:)/i.test(url) ? `[${txt}](${url})` : txt))
        .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
        .replace(/<\/?(strong|b)\s*>/gi, "**")
        .replace(/<\/?(em|i|cite)\s*>/gi, "*")
        .replace(/<\/?(s|del|strike)\s*>/gi, "~~")
        .replace(/<(\/?)ins\s*>/gi, "<$1u>")
        .replace(/<\/?(?:small|big|mark|abbr|q|span|code|tt|kbd|var|samp|dfn|time|bdi|font)\b[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .trim();
}

// ---- page text / markdown -------------------------------------------------

// Plain text of every table cell, row by row.
function tableText(model) {
    return model.rows.map((row) => row.map((c) => stripTags(c.text)).filter(Boolean).join(" ")).filter(Boolean).join("\n");
}

// Ordered prose blocks (no table cells) — used for the sentence bag.
function proseBlocks(doc) {
    const out = [];
    const push = (t) => { const s = stripTags(t).trim(); if (s) { out.push(s); } };
    push(doc.docTitle);
    push(doc.subtitle);
    (doc.intro || []).forEach(push);
    for (const sec of doc.sections) {
        push(sec.heading);
        (sec.lead || []).forEach(push);
        (sec.bullets || []).forEach(push);
        (sec.trailing || []).forEach(push);
    }
    (doc.conclusion || []).forEach(push);
    push(doc.footnote);
    return out;
}

export function pageMarkdown(doc) {
    const md = [];
    if (doc.docTitle) { md.push(`# ${mdInline(doc.docTitle)}`); }
    if (doc.subtitle) { md.push(mdInline(doc.subtitle)); }
    if (doc.dateline) { md.push(mdInline(doc.dateline)); }
    (doc.intro || []).forEach((p) => md.push(mdInline(p)));
    doc.sections.forEach((sec) => {
        if (sec.heading) { md.push(`## ${mdInline(sec.heading)}`); }
        (sec.lead || []).forEach((p) => md.push(mdInline(p)));
        if (sec.model) { md.push(groundTruthHtml(sec.model)); }
        (sec.bullets || []).forEach((b) => md.push(`- ${mdInline(b)}`));
        (sec.trailing || []).forEach((p) => md.push(mdInline(p)));
    });
    (doc.conclusion || []).forEach((p) => md.push(mdInline(p)));
    if (doc.footnote) { md.push(mdInline(doc.footnote)); }
    return md.join("\n\n");
}

// ---- text test (text_extended format) -------------------------------------

function countBag(items) {
    const bag = {};
    for (const it of items) {
        bag[it] = (bag[it] || 0) + 1;
    }
    return bag;
}

function splitSentences(text) {
    return text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12 && /[a-zA-Z]/.test(s));
}

function tokenizeWords(text) {
    return (text.toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []);
}

export function textTest(doc) {
    const prose = proseBlocks(doc);
    const allText = [prose.join(" "), ...doc.sections.filter((s) => s.model).map((s) => tableText(s.model))].join(" ");

    const sentences = prose.flatMap(splitSentences);
    const bagSentence = countBag(sentences);
    const bagWord = countBag(tokenizeWords(allText));
    const bagDigit = countBag((allText.match(/[0-9]/g) || []));

    // a few distinctive specific words/numbers that should always be present
    const specifics = [];
    const longNums = allText.match(/\d[\d,]{3,}/g) || [];
    const rareWords = Object.entries(bagWord).filter(([w, c]) => c === 1 && w.length >= 6).map(([w]) => w);
    for (const v of [...new Set(longNums)].slice(0, 3)) { specifics.push(v.replace(/,/g, "")); }
    for (const w of rareWords.slice(0, 3)) { specifics.push(w); }

    const rules = [
        { type: "missing_sentence_percent", bag_of_sentence: bagSentence },
        { type: "unexpected_sentence_percent", bag_of_sentence: bagSentence, original_md: pageMarkdown(doc) },
        { type: "too_many_sentence_occurence_percent", bag_of_sentence: bagSentence },
        { type: "unexpected_word_percent", bag_of_word: bagWord },
        { type: "too_many_word_occurence_percent", bag_of_word: bagWord },
        { type: "missing_word_percent", bag_of_word: bagWord },
        { type: "bag_of_digit_percent", bag_of_digit: bagDigit },
        ...specifics.map((w) => ({ type: "missing_specific_word", word: w })),
    ];
    return { expected_markdown: null, test_rules: rules };
}

// ---- layout test (v1.4 format) --------------------------------------------

// Map a measured element (tag + class) to a DocLayNet-style canonical class,
// matching heron's (canonical-DocLayNet) annotation convention:
//   - each <li> is its own List-item (not one box around the whole list),
//   - Picture is the graphic only; its <figcaption> is a separate Caption,
//   - section headings use the canonical "Section-header" name.
function canonicalClass(el) {
    const c = el.cls || "";
    // Field-level widgets FIRST — tight boxes on the widget only (FFDetr/Heron
    // convention: TextBox = the empty fill area, Checkbox = the mark, Signature =
    // the signing line; none include their label). Then the container regions.
    if (c.includes("cb-box")) { return c.includes("cb-sel") ? "Checkbox-Selected" : "Checkbox-Unselected"; }
    if (c.includes("ff-blank")) { return "TextBox"; }            // the empty fill area, not the label/ink
    if (c.includes("sig-line")) { return "Signature"; }          // the signing line, not the caption/date
    if (c.includes("form-region")) { return "Form"; }            // region CONTAINING the widgets above
    if (c.includes("kv-region")) { return "Key-Value Region"; }
    if (c.includes("gen-toc")) { return "Document Index"; }
    if (el.tag === "table") { return "Table"; }
    // heron delta classes (deltaBlocks.mjs components)
    if (/(?:^|\s)(?:cbrow|cbitem)(?:\s|$)/.test(c)) { return /(?:^|\s)sel(?:\s|$)/.test(c) ? "Checkbox-Selected" : "Checkbox-Unselected"; }
    if (c.includes("kvregion")) { return "Key-Value Region"; }
    if (c.includes("formblock")) { return "Form"; }
    if (el.tag === "pre" || c.includes("codeblock")) { return "Code"; }
    if (c.includes("tocblock")) { return "Document Index"; }
    if (el.tag === "figcaption") { return "Caption"; }
    if (el.tag === "svg" || el.tag === "img" || el.tag === "figure" || c.includes("fig")) { return "Picture"; }
    if (el.tag === "h1") { return "Title"; }
    if (el.tag === "h2" || el.tag === "h3") { return "Section-header"; }
    if (el.tag === "ul" || el.tag === "ol" || el.tag === "li") { return "List-item"; }
    if (c.includes("runhead")) { return "Page-header"; }
    if (c.includes("runfoot") || c.includes("footer") || c.includes("pagenum")) { return "Page-footer"; }
    if (c.includes("footnote")) { return "Footnote"; }
    return "Text";
}

// ---- per-cell table ground truth (sidecar) ---------------------------------

// Builds the per-doc `<id>.cells.json` sidecar payload from a measurement made
// with measureElements({tableCells: true}). This is a NEW ground-truth file —
// the existing test.json / layout-rule schemas are untouched.
//
// Coordinates use the same normalization as layoutTest (bbox = measured px *
// scale / page px, clamped to [0,1]) and follow the probe convention in
// encoder_experiments/sites.py: normalized [0,1] over the page, x rightward,
// y DOWNWARD (top-left origin).
//
// Per cell BOTH addressings are emitted:
//   row/col          DOM slot position (rowIndex / cellIndex). Under spans,
//                    cellIndex is the SLOT index within its row, NOT the
//                    logical grid column.
//   grid_row/grid_col  logical grid position from the rowspan/colspan
//                    occupancy walk (grid_row always equals row in HTML
//                    tables; grid_col differs whenever a spanning cell from a
//                    previous row or column shifts the slots).
export function tableCellsGt(measured, scale, pageW, pageH) {
    const norm = (x, y, w, h) => [
        (x * scale) / pageW,
        (y * scale) / pageH,
        (w * scale) / pageW,
        (h * scale) / pageH,
    ].map((v) => Math.max(0, Math.min(1, v)));
    const tables = [];
    for (const el of measured) {
        if (el.tag !== "table" || !el.cells || el.w <= 0 || el.h <= 0) { continue; }
        tables.push({
            table_index: tables.length,
            bbox: norm(el.x, el.y, el.w, el.h),
            grid_rows: el.gridRows,
            grid_cols: el.gridCols,
            cells: el.cells.map((c) => ({
                row: c.row,
                col: c.col,
                grid_row: c.grid_row,
                grid_col: c.grid_col,
                rowspan: c.rowspan,
                colspan: c.colspan,
                tag: c.tag,
                bbox: norm(c.x, c.y, c.w, c.h),
                text: c.text,
            })),
        });
    }
    return {
        coords: "normalized [0,1] over the page; x rightward, y downward (top-left origin)",
        tables,
    };
}

// measured: [{tag, cls, x, y, w, h, text}] in DOM order (viewport coords).
// scale: print scale applied to the page; pageW/pageH: full page px.
export function layoutTest(doc, measured, scale, pageW, pageH) {
    const tableModels = doc.sections.map((s) => s.model).filter(Boolean);
    let tableIdx = 0;
    const rules = [];
    measured.forEach((el, i) => {
        if (el.w <= 0 || el.h <= 0) { return; }
        const cls = canonicalClass(el);
        const bbox = [
            (el.x * scale) / pageW,
            (el.y * scale) / pageH,
            (el.w * scale) / pageW,
            (el.h * scale) / pageH,
        ].map((v) => Math.max(0, Math.min(1, v)));
        let content;
        if (cls === "Table" && tableModels[tableIdx]) {
            content = { html: groundTruthHtml(tableModels[tableIdx]), type: "table" };
            tableIdx += 1;
        } else {
            content = { text: stripTags(el.text || "").trim().slice(0, 600), type: "text" };
        }
        rules.push({
            type: "layout",
            attributes: {},
            bbox,
            canonical_class: cls,
            content,
            id: `lay_${i}`,
            page: 1,
            ro_index: rules.length,
            verified: true,
        });
    });
    return { expected_markdown: pageMarkdown(doc), test_rules: rules };
}

// Browser-side measurement function (passed to page.evaluate). Returns elements
// in document order with viewport-space bounding boxes, following heron's
// (DocLayNet) box convention:
//   - text boxes are TIGHT to the glyph extents (union of the contents' line
//     rects), not the CSS block box — a short centered <h1> in a wide column
//     must not produce a full-width box (measured vs stock heron: Title GT was
//     1.8x wider, Caption 2.0x, footers 2.6x, before this),
//   - page header/footer containers that hold several separated chunks (left
//     text ... right page number) emit one box PER chunk, as DocLayNet does,
//   - each <li> is its own List-item, extended left to include its bullet,
//   - the figure graphic and its <figcaption> are separate elements.
// opts.tableCells: additionally walk each table.gen's rows[].cells[] and attach
// per-cell boxes to the table's entry ({cells, gridRows, gridCols}) for the
// cells sidecar. Off when omitted, so existing callers (rederiveScanGt) get
// byte-identical output.
export function measureElements(opts) {
    const withCells = Boolean(opts && opts.tableCells);
    const sel = "h1,h2,h3,p,li,table.gen,figure.fig > svg,figure.fig > img,figure.fig figcaption,.runhead,.runfoot,.footer,.footnote,.pagenum,.dateline,.subtitle,.cbrow,.cbitem,.kvregion,.formblock,pre.codeblock,.tocblock"
        // acroform-seeded form components (--doc-mode): regions + tight widget boxes.
        + ",.kv-region,.form-region,.gen-toc,.ff-blank,.cb-box,.sig-line";
    // Per-cell boxes for one table: DOM slot position (rowIndex/cellIndex) AND
    // logical grid position from the standard rowspan/colspan occupancy walk
    // (occ[r][c] marks slots covered by earlier spanning cells; each new cell
    // lands on the first free slot of its row). grid_row always equals the DOM
    // rowIndex; grid_col differs from cellIndex whenever spans shift the slots.
    const tableCells = (tbl) => {
        const rows = [...tbl.rows];
        const occ = [];
        const cells = [];
        let gridCols = 0;
        for (let ri = 0; ri < rows.length; ri++) {
            if (!occ[ri]) { occ[ri] = []; }
            let gc = 0;
            for (const cell of [...rows[ri].cells]) {
                while (occ[ri][gc]) { gc += 1; }
                // rowSpan 0 ("to end of row group") never occurs in generated
                // tables — treat as 1; clamp overhanging spans to the real grid.
                const rs = Math.min(Math.max(1, cell.rowSpan || 1), rows.length - ri);
                const cs = Math.max(1, cell.colSpan || 1);
                for (let dr = 0; dr < rs; dr++) {
                    if (!occ[ri + dr]) { occ[ri + dr] = []; }
                    for (let dc = 0; dc < cs; dc++) { occ[ri + dr][gc + dc] = true; }
                }
                const cr = cell.getBoundingClientRect();
                cells.push({
                    row: ri, col: cell.cellIndex,
                    grid_row: ri, grid_col: gc,
                    rowspan: rs, colspan: cs,
                    tag: cell.tagName.toLowerCase(),
                    x: cr.x, y: cr.y, w: cr.width, h: cr.height,
                    text: (cell.innerText || "").slice(0, 300),
                });
                gc += cs;
            }
            gridCols = Math.max(gridCols, occ[ri].length);
        }
        return { cells, gridRows: rows.length, gridCols };
    };
    const tightRect = (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
        if (!rects.length) { return el.getBoundingClientRect(); }
        const x0 = Math.min(...rects.map((q) => q.x));
        const y0 = Math.min(...rects.map((q) => q.y));
        const x1 = Math.max(...rects.map((q) => q.x + q.width));
        const y1 = Math.max(...rects.map((q) => q.y + q.height));
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    };
    const nodes = [...document.querySelectorAll(sel)];
    // Header/footer containers with 2+ text chunks are measured per chunk;
    // anything inside them (e.g. a .pagenum span also matching the selector)
    // must not be emitted twice.
    const isChunkContainer = (el) => {
        const c = typeof el.className === "string" ? el.className : "";
        return /(?:^|\s)(?:runhead|runfoot|footer)(?:\s|$)/.test(c)
            && [...el.children].filter((k) => (k.innerText || "").trim()).length >= 2;
    };
    const containers = nodes.filter(isChunkContainer);
    const out = [];
    for (const el of nodes) {
        if (containers.some((c) => c !== el && c.contains(el))) { continue; }
        const tag = el.tagName.toLowerCase();
        // SVG elements have an SVGAnimatedString className and no innerText.
        const cls = typeof el.className === "string" ? el.className : (el.getAttribute("class") || "");
        if (isChunkContainer(el)) {
            for (const k of [...el.children].filter((c) => (c.innerText || "").trim())) {
                const r = tightRect(k);
                out.push({ tag, cls, x: r.x, y: r.y, w: r.width, h: r.height, text: (k.innerText || "").slice(0, 600) });
            }
            continue;
        }
        let r;
        const regionBox = /kvregion|formblock|codeblock|tocblock|kv-region|form-region|gen-toc|ff-blank|cb-box|sig-line/.test(cls);
        if (tag === "table" || tag === "svg" || tag === "img" || tag === "pre" || regionBox) {
            r = el.getBoundingClientRect();
        } else {
            r = tightRect(el);
            if (tag === "li") {
                // Include the bullet/number marker, which sits left of the
                // content box (list-style-position: outside).
                const list = el.closest("ul,ol");
                const fs = parseFloat(getComputedStyle(el).fontSize) || 12;
                const minX = list ? list.getBoundingClientRect().x : r.x - 1.4 * fs;
                const x0 = Math.max(minX, r.x - 1.4 * fs);
                r = { x: x0, y: r.y, width: r.x + r.width - x0, height: r.height };
            }
        }
        const text = (tag === "table" || tag === "svg") ? "" : (el.innerText || "").slice(0, 600);
        const entry = { tag, cls, x: r.x, y: r.y, w: r.width, h: r.height, text };
        if (withCells && tag === "table") { Object.assign(entry, tableCells(el)); }
        out.push(entry);
    }
    return out;
}
