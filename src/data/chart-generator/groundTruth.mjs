// Builds ground truth for the non-table test types from the same generated
// page, in the formats of the existing benchmarks:
//   text_extended  -> bag-of-sentence / word / digit rules + original_md
//   layout (v1.4)  -> per-element {canonical_class, bbox, content, ro_index}
// (chart ground truth is emitted separately where a figure's data is known.)

import { groundTruthHtml } from "./render.mjs";

function stripTags(s) {
    return String(s || "")
        .replace(/<a\b[^>]*>/gi, "")
        .replace(/<\/?(strong|em|u|sup|sub|br|a|s|del|strike)\s*\/?>/gi, "");
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
        .replace(/<\/?(em|i)\s*>/gi, "*")
        .replace(/<\/?(s|del|strike)\s*>/gi, "~~")
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

// Map a measured element (tag + class) to a DocLayNet-style canonical class.
function canonicalClass(el) {
    const c = el.cls || "";
    if (el.tag === "table") { return "Table"; }
    if (el.tag === "figure" || c.includes("fig")) { return "Picture"; }
    if (el.tag === "h1") { return "Title"; }
    if (el.tag === "h2" || el.tag === "h3") { return "Section"; }
    if (el.tag === "ul" || el.tag === "ol" || el.tag === "li") { return "List-item"; }
    if (c.includes("runhead")) { return "Page-header"; }
    if (c.includes("runfoot") || c.includes("footer") || c.includes("pagenum")) { return "Page-footer"; }
    if (c.includes("footnote")) { return "Footnote"; }
    return "Text";
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

// Browser-side: viewport-px rect of every on-page chart <svg> (inside a
// figure.fig), in DOM order — the same order documentHtml pushed figures[] /
// figGeoms[]. Used to map chartlib's svg-space geometry to page coordinates.
export function measureChartSvgs() {
    return [...document.querySelectorAll("figure.fig svg")].map((el) => {
        const r = el.getBoundingClientRect();
        // getScreenCTM maps SVG USER space (the 520x300 viewBox) to viewport px
        // exactly — including the letterboxing preserveAspectRatio="meet" adds
        // when CSS (e.g. slide max-height) breaks the box's 520:300 aspect.
        const m = el.getScreenCTM();
        return { x: r.x, y: r.y, w: r.width, h: r.height, ctm: m ? { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } : null };
    });
}

// Browser-side measurement function (passed to page.evaluate). Returns elements
// in document order with viewport-space bounding boxes.
export function measureElements() {
    const sel = "h1,h2,h3,p,ul,table.gen,figure.fig,.runhead,.runfoot,.footer,.footnote,.pagenum,.dateline,.subtitle";
    return [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), cls: el.className || "", x: r.x, y: r.y, w: r.width, h: r.height, text: el.tagName === "TABLE" ? "" : (el.innerText || "").slice(0, 600) };
    });
}
