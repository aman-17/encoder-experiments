// Serialization of a generated math document:
//   docMarkdown(doc)                -> the gold markdown (.md / expected_markdown):
//                                      headings as markdown, prose verbatim, and
//                                      every formula as its EXACT LaTeX source in
//                                      $...$ / $$...$$ delimiters. Derived purely
//                                      from the logical model — never from the DOM.
//   documentHtml(doc, template, rng) -> a full standalone HTML page with formulas
//                                      rendered server-side through KaTeX and all
//                                      fonts (body + KaTeX) inlined as data URIs.

import katex from "katex";
import { templateToCss, luminance, lightTintOf } from "./template.mjs";
import { fontFaceCss } from "./googleFonts.mjs";
import { katexCss } from "./katexCss.mjs";
import { STYLES } from "./mathStyles.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function kat(latex, displayMode) {
    const html = katex.renderToString(latex, { throwOnError: false, displayMode, strict: "ignore" });
    if (html.includes("katex-error")) {
        // Content is pre-validated in mathContent.mjs; reaching here is a bug.
        throw new Error(`katex error box at render time (validation missed it): ${latex}`);
    }
    return html;
}

// ---- gold markdown ----------------------------------------------------------
const runsMd = (runs) => runs.map((x) => (x.t === "math" ? `$${x.v}$` : x.v)).join("");
const displayMd = (latex) => `$$${latex}$$`;

function blockMd(b) {
    if (b.type === "p") { return runsMd(b.runs); }
    if (b.type === "display") { return displayMd(b.latex); }
    if (b.type === "env") {
        const head = b.kind === "Proof" ? "*Proof.*" : `**${b.kind}${b.label ? ` ${b.label}` : ""}.**`;
        const parts = [`${head} ${runsMd(b.runs)}`];
        if (b.display) { parts.push(displayMd(b.display.latex)); }
        return parts.join("\n\n");
    }
    if (b.type === "problem") {
        const parts = [`**Problem ${b.num}.** *(${b.points} points)* ${runsMd(b.runs)}`];
        for (const d of b.displays) { parts.push(displayMd(d.latex)); }
        return parts.join("\n\n");
    }
    if (b.type === "item") {
        return `**${b.label}.**\n\n${displayMd(b.latex)}`;
    }
    throw new Error(`unknown block type: ${b.type}`);
}

export function docMarkdown(doc) {
    const parts = [];
    if (doc.kicker) { parts.push(doc.kicker); }
    parts.push(`# ${doc.title}`);
    if (doc.byline) { parts.push(doc.byline); }
    if (doc.meta) { parts.push(doc.meta); }
    if (doc.abstract) { parts.push(`**Abstract.** ${runsMd(doc.abstract)}`); }
    if (doc.instructions) { parts.push(doc.instructions); }
    for (const sec of doc.sections) {
        if (sec.heading) { parts.push(`## ${sec.heading}`); }
        for (const b of sec.blocks) { parts.push(blockMd(b)); }
    }
    return `${parts.join("\n\n")}\n`;
}

// ---- HTML -------------------------------------------------------------------
const runsHtml = (runs) => runs.map((x) => (x.t === "math" ? kat(x.v, false) : esc(x.v))).join("");

const displayHtml = (b) => `<div class="disp">${kat(b.latex, true)}</div>`;

// Returns { html, span }. `span` marks a top-level wide display that should be
// set FULL-WIDTH in a 2-column document. We deliberately do NOT use CSS
// `column-span: all` — inside a printed multicol it makes Chrome fragment the
// flow across pages. Instead documentHtml SEGMENTS the column flow around
// spanning blocks (close columns, emit full-width, reopen columns), which is
// also how real two-column papers set wide equations.
function blockHtml(b, ncols) {
    if (b.type === "p") { return { html: `<p>${runsHtml(b.runs)}</p>`, span: false }; }
    if (b.type === "display") { return { html: displayHtml(b), span: b.wide && ncols === 2 }; }
    if (b.type === "env") {
        const head = b.kind === "Proof"
            ? `<span class="envhead envhead-proof"><em>Proof.</em></span>`
            : `<span class="envhead">${esc(b.kind)}${b.label ? ` ${esc(b.label)}` : ""}.</span>`;
        const parts = [`<p>${head} ${runsHtml(b.runs)}</p>`];
        if (b.display) { parts.push(displayHtml(b.display)); }
        return { html: `<div class="env env-${esc(b.kind)}">${parts.join("\n")}</div>`, span: false };
    }
    if (b.type === "problem") {
        const parts = [`<p><span class="phead">Problem ${b.num}.</span> <span class="pts">(${b.points} points)</span> ${runsHtml(b.runs)}</p>`];
        for (const d of b.displays) { parts.push(displayHtml(d)); }
        return { html: `<div class="problem">${parts.join("\n")}</div>`, span: false };
    }
    if (b.type === "item") {
        return { html: `<div class="hbitem"><div class="hblabel">${esc(b.label)}.</div>${displayHtml(b)}</div>`, span: false };
    }
    throw new Error(`unknown block type: ${b.type}`);
}

export function documentHtml(doc, template, rng) {
    const style = STYLES[doc.style];
    const ncols = doc.ncols;
    const accent = (template.decor && template.decor.accent) || template.table.borderColor;
    const tint = lightTintOf(accent);

    // Full-width header zone (title/byline/abstract), then the column flow.
    const headBlocks = [];
    if (doc.kicker) { headBlocks.push(`<div class="kicker">${esc(doc.kicker)}</div>`); }
    headBlocks.push(`<h1>${esc(doc.title)}</h1>`);
    if (doc.byline) { headBlocks.push(`<div class="byline">${esc(doc.byline)}</div>`); }
    if (doc.meta) { headBlocks.push(`<div class="meta">${esc(doc.meta)}</div>`); }
    if (doc.abstract) { headBlocks.push(`<div class="abstract"><b>Abstract.</b> ${runsHtml(doc.abstract)}</div>`); }
    if (doc.instructions) { headBlocks.push(`<div class="instructions">${esc(doc.instructions)}</div>`); }

    const bodyBlocks = [];
    for (const sec of doc.sections) {
        if (sec.heading) { bodyBlocks.push({ html: `<h2>${esc(sec.heading)}</h2>`, span: false }); }
        for (const b of sec.blocks) { bodyBlocks.push(blockHtml(b, ncols)); }
    }
    // Assemble the body: in a multi-column doc, consecutive non-spanning blocks
    // are wrapped in a column flow; a spanning block sits full-width between
    // flows (reading order — DOM order — is unchanged, so the gold matches).
    let wrapped;
    if (ncols > 1) {
        const gap = rng.int(18, 28);
        const flow = (chunk) => `<div class="colflow" style="column-count: ${ncols}; column-gap: ${gap}px;">\n${chunk.join("\n")}\n</div>`;
        const out = [];
        let chunk = [];
        for (const b of bodyBlocks) {
            if (b.span) {
                if (chunk.length) { out.push(flow(chunk)); chunk = []; }
                out.push(`<div class="fullwidth">${b.html}</div>`);
            } else {
                chunk.push(b.html);
            }
        }
        if (chunk.length) { out.push(flow(chunk)); }
        wrapped = out.join("\n");
    } else {
        wrapped = bodyBlocks.map((b) => b.html).join("\n");
    }

    // Page margins as full-bleed body padding (same approach as the engine).
    let marginIn = Math.min(1.0, Math.max(0.4, template.page.marginIn || 0.5));
    // Lecture-notes archetype: wide right margin (annotation gutter).
    const padding = style.wideMargins
        ? `${marginIn}in ${Math.min(2.0, marginIn + rng.float(0.8, 1.2, 2))}in ${marginIn}in ${marginIn}in`
        : `${marginIn}in`;

    const faceCss = fontFaceCss([template.body && template.body.fontFamily].filter(Boolean));
    const layoutCss = `
  body { margin: 0; padding: ${padding}; background: #ffffff; box-sizing: border-box; }
  .disp { break-inside: avoid; margin: 4px 0; }
  .disp .katex-display { margin: 0.45em 0; }
  .fullwidth { margin: 4px 0; }
  .colflow p, .colflow h2, .colflow .env, .colflow .problem, .colflow .hbitem { break-inside: avoid-column; }
  .colflow h2 { break-after: avoid-column; }
  h1 { margin: 0 0 6px; }
  p { margin: 0 0 7px; }
  .env p { margin: 0 0 4px; }
`;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${faceCss}
${katexCss()}
${templateToCss(template)}
${style.css(accent, tint)}
${layoutCss}
</style>
</head>
<body class="ds-${doc.style}">
<div class="content">
${headBlocks.join("\n")}
${wrapped}
</div>
</body>
</html>`;
    return { html };
}
