// Canonical17 layout sidecar (<id>.layout.json) — the cross-generator layout
// ground-truth contract shared by every synthetic-doc generator:
//
//   { version: 1, coords, ontology: "canonical17", page_w_px, page_h_px,
//     items: [{ id, class, bbox:[x,y,w,h], reading_order, text, attrs }] }
//
// Coordinates are normalized [0,1] over the WHOLE page (x rightward, y downward,
// top-left origin; bbox is COCO-style [x,y,w,h]). Classes are the EXACT enum
// strings of llamacloud-bench's CanonicalLabel (Canonical17).
//
// Measurement contract: measureLayoutItems() MUST be evaluated on the CORRECTED
// print-layout DOM (the charts' pixels.json re-measure fix) — i.e. after the
// page has been laid out at the exact geometry Chrome prints (viewport
// printW/scale x printH/scale when pdf({scale}) is used, or the zoom-baked DOM
// printed at scale 1). Never reuse the legacy screen-viewport measurement,
// which drifts whenever print scale != 1. The legacy layoutTest outputs are
// left byte-untouched; this module only ADDS the new sidecar.
//
// This file is intentionally IDENTICAL in chart-generator/ and table-generator/
// (the selector is the union of both generators' element classes; classes that
// don't occur in a given generator simply never match).

// ---- browser-side measurement (passed to page.evaluate) --------------------
// Returns [{tag, cls, x, y, w, h, text}] in DOM order, viewport px, following
// the DocLayNet/heron box conventions:
//   - text boxes are TIGHT to the glyph extents (union of line rects), not the
//     CSS block box,
//   - running header/footer containers holding 2+ separated chunks (left text
//     ... right page number) emit one box per chunk,
//   - each <li> is its own item, extended left to include its bullet,
//   - a figure's graphic (svg/img) and its <figcaption> are separate items,
//   - form/kv/toc/code REGIONS are emitted as one box each; their inner
//     widgets are covered by the region and not re-emitted.
export function measureLayoutItems() {
    const SEL = [
        // headings + prose + lists
        "h1", "h2", "h3", "p", "li",
        // tables & figures
        "table.gen", "figure.fig > svg", "figure.fig > img", "figcaption",
        // letterhead / business chrome
        "img.doclogo", ".lh-info", ".docref", ".so",
        // page furniture
        ".runhead", ".runfoot", ".footer", ".pagenum", ".footnote", ".watermark",
        ".dateline", ".subtitle", ".callout", ".pullquote", ".mag-kicker",
        // docstyle archetype chrome (chart-generator)
        ".mz-kicker", ".ax-byline", ".ax-id", ".ax-abstract", ".jr-masthead",
        ".jr-meta", ".tb-chap", ".tb-box", ".mz-deck", ".mz-byline", ".fn-sub",
        ".sl-sub", ".sl-no", ".sl-foot",
        // masthead meta (table-generator)
        ".mh-right",
        // heron delta components (table-generator deltaBlocks)
        ".cbrow", ".cbitem", ".kvregion", ".formblock", "pre.codeblock", ".tocblock",
        // acroform-seeded form regions (table-generator --doc-mode)
        ".kv-region", ".form-region", ".gen-toc",
    ].join(",");

    const clsOf = (el) => (typeof el.className === "string" ? el.className : (el.getAttribute("class") || ""));
    const hasTok = (el, tok) => clsOf(el).split(/\s+/).includes(tok);
    const REGION_TOKS = ["kvregion", "formblock", "codeblock", "tocblock", "kv-region", "form-region", "gen-toc", "cbrow", "cbitem"];

    // Glyph-tight rect: union of the contents' client rects (handles transforms
    // — rotated watermarks / skewed tables report their axis-aligned envelope).
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

    const nodes = [...document.querySelectorAll(SEL)];

    // Running header/footer containers with 2+ separated text chunks emit one
    // box per chunk (DocLayNet convention).
    const isChunkContainer = (el) => {
        const c = clsOf(el);
        return /(?:^|\s)(?:runhead|runfoot|footer|jr-masthead|sl-foot)(?:\s|$)/.test(c)
            && [...el.children].filter((k) => (k.innerText || "").trim()).length >= 2;
    };

    const out = [];
    for (const el of nodes) {
        // Outermost-wins dedup: anything inside another matched node is covered
        // by that node's item (e.g. .cbitem inside .formblock, .sl-no inside a
        // chunked .sl-foot) and must not be emitted twice.
        if (nodes.some((o) => o !== el && o.contains(el))) { continue; }
        const tag = el.tagName.toLowerCase();
        const cls = clsOf(el);
        if (isChunkContainer(el)) {
            for (const k of [...el.children].filter((c) => (c.innerText || "").trim())) {
                const r = tightRect(k);
                if (r.width > 0.5 && r.height > 0.5) {
                    out.push({ tag, cls, x: r.x, y: r.y, w: r.width, h: r.height, text: (k.innerText || "") });
                }
            }
            continue;
        }
        let r;
        const isRegion = REGION_TOKS.some((t) => hasTok(el, t));
        if (tag === "table" || tag === "svg" || tag === "img" || tag === "pre" || isRegion) {
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
        if (!(r.width > 0.5 && r.height > 0.5)) { continue; }
        const graphic = tag === "svg" || (tag === "img");
        const text = (tag === "table" || graphic) ? "" : (el.innerText || "");
        // Skip invisible / empty text elements (display:none figcaptions on
        // slide themes, empty footers, ...); graphics and tables carry no text.
        if (!text.trim() && !graphic && tag !== "table") { continue; }
        out.push({ tag, cls, x: r.x, y: r.y, w: r.width, h: r.height, text });
    }
    return out;
}

// ---- node-side: measured items -> Canonical17 sidecar ----------------------

const tokSet = (cls) => new Set(String(cls || "").split(/\s+/).filter(Boolean));

// Map a measured element to { class, attrs } using the EXACT Canonical17 enum
// strings. Elements with no better canonical fit map to Text with an
// attrs.role annotation (watermark, doc-ref, signoff, ...).
function canonical17(el) {
    const t = el.tag;
    const toks = tokSet(el.cls);
    const has = (k) => toks.has(k);
    // form-ish regions first (they may ride on generic tags)
    if (has("cbrow") || has("cbitem")) {
        return { class: has("sel") ? "Checkbox-Selected" : "Checkbox-Unselected" };
    }
    if (has("kvregion") || has("kv-region")) { return { class: "Key-Value Region" }; }
    if (has("formblock") || has("form-region")) { return { class: "Form" }; }
    if (t === "pre" || has("codeblock")) { return { class: "Code" }; }
    if (has("tocblock") || has("gen-toc")) { return { class: "Document Index" }; }
    if (t === "table") { return { class: "Table" }; }
    if (t === "figcaption") { return { class: "Caption" }; }
    if (t === "svg") { return { class: "Picture", attrs: { picture_type: "chart" } }; }
    if (t === "img") { return { class: "Picture", attrs: { picture_type: has("doclogo") ? "logo" : "image" } }; }
    if (t === "h1") { return { class: "Title", attrs: { level: 1 } }; }
    if (t === "h2") { return { class: "Section-header", attrs: { level: 2 } }; }
    if (t === "h3") { return { class: "Section-header", attrs: { level: 3 } }; }
    if (t === "li") { return { class: "List-item" }; }
    // page furniture
    if (has("runhead") || has("jr-masthead") || has("tb-chap")) { return { class: "Page-header" }; }
    if (has("sl-foot") || has("runfoot") || has("footer") || has("pagenum")) { return { class: "Page-footer" }; }
    if (has("sl-no")) { return { class: "Page-header" }; }  // slide number in the title band
    if (has("footnote")) { return { class: "Footnote" }; }
    if (has("watermark")) { return { class: "Text", attrs: { role: "watermark" } }; }
    // Text with an informative role where the element is distinctive chrome
    if (has("docref")) { return { class: "Text", attrs: { role: "doc-ref" } }; }
    if (has("so")) { return { class: "Text", attrs: { role: "signoff" } }; }
    if (has("lh-info")) { return { class: "Text", attrs: { role: "letterhead" } }; }
    if (has("subtitle") || has("mz-deck") || has("fn-sub") || has("sl-sub")) { return { class: "Text", attrs: { role: "subtitle" } }; }
    if (has("dateline")) { return { class: "Text", attrs: { role: "dateline" } }; }
    if (has("callout") || has("pullquote") || has("tb-box")) { return { class: "Text", attrs: { role: "callout" } }; }
    if (has("mag-kicker") || has("mz-kicker")) { return { class: "Text", attrs: { role: "kicker" } }; }
    if (has("ax-byline") || has("mz-byline") || has("jr-meta")) { return { class: "Text", attrs: { role: "byline" } }; }
    if (has("ax-abstract")) { return { class: "Text", attrs: { role: "abstract" } }; }
    if (has("ax-id") || has("mh-right")) { return { class: "Text", attrs: { role: "doc-meta" } }; }
    return { class: "Text" };
}

// measured: measureLayoutItems() output, taken at the PRINT layout (viewport
// printW/scale x printH/scale); scale: the pdf print scale; pageW/pageH: the
// printed page in px @96dpi. bbox = measured px * scale / page px, clamped.
export function buildLayoutSidecar(measured, scale, pageW, pageH) {
    const items = [];
    const deferred = []; // watermarks read last (they overlay the whole page)
    for (const el of measured) {
        const x = Math.max(0, Math.min(1, (el.x * scale) / pageW));
        const y = Math.max(0, Math.min(1, (el.y * scale) / pageH));
        const w = Math.min(1 - x, Math.max(0, (el.w * scale) / pageW));
        const h = Math.min(1 - y, Math.max(0, (el.h * scale) / pageH));
        if (w <= 0 || h <= 0) { continue; }
        const m = canonical17(el);
        const noText = m.class === "Table" || m.class === "Picture";
        const item = {
            id: 0,
            class: m.class,
            bbox: [x, y, w, h].map((v) => +v.toFixed(6)),
            reading_order: 0,
            text: noText ? null : String(el.text || "").replace(/\s+\n/g, "\n").trim(),
        };
        if (m.attrs) { item.attrs = m.attrs; }
        (m.attrs && m.attrs.role === "watermark" ? deferred : items).push(item);
    }
    items.push(...deferred);
    items.forEach((it, i) => { it.id = i; it.reading_order = i; });
    return {
        version: 1,
        coords: "normalized [0,1] over the page, x rightward, y downward (top-left origin); bbox=[x,y,w,h] COCO-style",
        ontology: "canonical17",
        page_w_px: pageW,
        page_h_px: pageH,
        items,
    };
}
