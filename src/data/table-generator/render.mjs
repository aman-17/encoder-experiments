// Serialization of a generated document:
//   docGroundTruth(doc)            -> the .test.json answer: each table's clean
//                                     structural HTML, joined by a blank line.
//   documentHtml(doc, template)    -> a full styled standalone HTML page that
//                                     reads like a real report (prose, headings,
//                                     figures, lists, footnotes) with the table(s)
//                                     embedded in the middle.
//
// A "doc" is { docTitle, subtitle, dateline, intro:[], sections:[...],
//              conclusion:[], footnote, flags }. Each section is
// { heading, lead:[], trailing:[], bullets:[], model }.

import { templateToCss, luminance } from "./template.mjs";
import { deltaHtml, deltaCss } from "./deltaBlocks.mjs";
import { buildFigure } from "./figure.mjs";
import { inlineHtml as esc } from "./inline.mjs";
import { fontFaceCss, HANDWRITING_FAMILIES } from "./googleFonts.mjs";
import { lightTintOf } from "./template.mjs";

function spanAttrs(cell) {
    let a = "";
    if (cell.colspan > 1) {
        a += ` colspan="${cell.colspan}"`;
    }
    if (cell.rowspan > 1) {
        a += ` rowspan="${cell.rowspan}"`;
    }
    return a;
}

// ---- Ground truth: minimal, structural, no styling. -----------------------
export function groundTruthHtml(model) {
    const lines = ["<table>"];
    for (const row of model.rows) {
        lines.push("  <tr>");
        for (const cell of row) {
            lines.push(`    <${cell.tag}${spanAttrs(cell)}>${esc(cell.text)}</${cell.tag}>`);
        }
        lines.push("  </tr>");
    }
    lines.push("</table>");
    return lines.join("\n");
}

export function docGroundTruth(doc) {
    return doc.sections.filter((s) => s.model).map((s) => groundTruthHtml(s.model)).join("\n\n");
}

// ---- Styled document ------------------------------------------------------

// Alignment is per-cell (set per column on the model) and applies to header
// cells too, so numeric columns are right-aligned in both the header and the
// body — real tables vary by column but stay consistent down a column.
function cellHtml(cell) {
    const classes = [];
    if (cell.align === "right") { classes.push("num"); }
    else if (cell.align === "center") { classes.push("ctr"); }
    // Full-width section-subheader rows get a styled band (see template CSS).
    if (cell.role === "section") { classes.push("sec"); }
    // First-column <th> row headers get a distinct row-header treatment.
    if (cell.role === "rowhead") { classes.push("rh"); }
    // Render-only conditional colour (negatives red; RAG status backgrounds).
    if (cell.color) { classes.push(`c-${cell.color}`); }
    // Form chrome: numbered-column tier cells, and boxed fill-in field values.
    if (cell.role === "colnum") { classes.push("cn"); }
    if (cell.role === "field") { classes.push("fld"); }
    const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
    // Render-only hierarchy indent (financial-statement line items). Not in the
    // ground truth — like alignment, it's a visual property of the printed cell.
    const style = cell.indent ? ` style="padding-left:${(1.6 + (cell.indent - 1) * 1.2).toFixed(1)}em"` : "";
    return `<${cell.tag}${spanAttrs(cell)}${cls}${style}>${esc(cell.text)}</${cell.tag}>`;
}

// A bold "Total"/"Subtotal" row: the prompt bolds total rows, so a body row
// whose first cell and ≥2 cells overall are <strong> reads as a total. We give
// it a top rule (see CSS) — the classic accounting total-row line.
function isTotalRow(row) {
    const tds = row.filter((c) => c.tag === "td" && c.role !== "section");
    if (tds.length < 2) { return false; }
    const bold = tds.filter((c) => /<strong>/i.test(c.text)).length;
    return bold >= 2 && /<strong>/i.test(tds[0].text);
}

function tableHtml(model, spanAll, compact = false) {
    const tr = (row) => `      <tr${isTotalRow(row) ? ' class="total"' : ""}>${row.map(cellHtml).join("")}</tr>`;
    // Split the leading all-<th> rows (title/super/group/leaf header) into a
    // <thead> so the browser REPEATS them on every printed page — a multi-page
    // table then shows its header on each page instead of a headerless
    // continuation. (Ground truth keeps the flat row list; this is a render-only
    // pagination concern, like alignment/indent.)
    let split = model.rows.findIndex((row) => row.some((c) => c.tag === "td"));
    if (split < 0) { split = model.rows.length; }
    const head = model.rows.slice(0, split);
    const body = model.rows.slice(split);
    const headHtml = head.length ? `    <thead>\n${head.map(tr).join("\n")}\n    </thead>\n` : "";
    const bodyHtml = body.length ? `    <tbody>\n${body.map(tr).join("\n")}\n    </tbody>\n` : "";
    const style = spanAll ? ' style="column-span: all; -webkit-column-span: all;"' : "";
    // A narrow table in plain flow sizes to its content instead of stretching
    // full-width (which leaves big sparse gaps between short columns).
    const cls = [compact ? "gen compact" : "gen", model.plain ? "plain" : "", model.rotatedHeaders ? "rothead" : "", model.form ? "form" : "", model.fieldBlock ? "fieldblock" : ""].filter(Boolean).join(" ");
    return `    <table class="${cls}"${style}>\n${headHtml}${bodyHtml}    </table>`;
}

function paraBlocks(paras) {
    return (paras || []).map((p) => `<p>${esc(p)}</p>`).join("\n");
}

// The masthead logo. Captured logos are all aligned left and dropped in bare, so
// vary it here: randomize the position, and about half the time build a proper
// letterhead (logo + company name, sometimes a tagline) instead of a lone image.
function logoBlock(template, doc, rng, short) {
    const img = `<img class="doclogo" src="${template.logo.dataUri}" alt="">`;
    const pos = rng.weighted([["left", 5], ["center", 2], ["right", 3]]);
    const company = (doc.docTitle || "").split(/:|\s[-–—]\s/)[0].trim();
    if (!company || !rng.bool(0.55)) {
        const a = pos === "right" ? "text-align:right;" : pos === "center" ? "text-align:center;" : "";
        return `<div style="${a}">${img}</div>`;
    }
    const tag = rng.bool(0.45) ? short(doc.subtitle || doc.dateline, 56) : "";
    const info = `<div class="lh-info"><div class="lh-name">${esc(company)}</div>${tag ? `<div class="lh-tag">${esc(tag)}</div>` : ""}</div>`;
    if (pos === "center") {
        return `<div class="letterhead lh-center">${img}${info}</div>`;
    }
    return pos === "right"
        ? `<div class="letterhead lh-right">${info}${img}</div>`
        : `<div class="letterhead">${img}${info}</div>`;
}

// Sniff the document's currency so a chart inside it uses the SAME currency
// rather than a random "$". Returns a renderable prefix symbol, "OTHER" for a
// currency the chart can't prefix (kr, SEK, R$ …), or null when none is found.
function detectDocCurrency(doc) {
    const parts = [doc.subtitle || "", ...(doc.intro || []), ...(doc.conclusion || []), doc.footnote || ""];
    for (const s of doc.sections || []) {
        if (s.lead) { parts.push(...s.lead); }
        if (s.trailing) { parts.push(...s.trailing); }
        if (s.model) { for (const row of s.model.rows) { for (const c of row) { parts.push(String(c.text || "")); } } }
    }
    const t = parts.join(" ");
    for (const sym of ["€", "£", "¥", "₹"]) { if (t.includes(sym)) { return sym; } }
    if (/(?<![A-Za-z])kr(?![A-Za-z])|\bSEK\b|\bNOK\b|\bDKK\b|\bCHF\b|R\$|\bRM\b|zł|\bAED\b|\bSAR\b|\bRp\b|₩|₫|฿|₪/i.test(t)) { return "OTHER"; }
    if (t.includes("$")) { return "$"; }
    return null;
}

function figureBlock(fig, accent, opts = {}) {
    const cls = opts.inline
        ? "fig fig--inline"
        : `fig fig--${opts.size || "full"}${opts.left ? " fig--left" : ""}`;
    return `<figure class="${cls}">\n${fig.svg}\n<figcaption><strong>Figure ${fig.figNum}.</strong> ${esc(fig.caption)}</figcaption>\n</figure>`;
}

// Occasional "business chrome" — a document-reference header and a sign-off
// block — that real operational documents carry.
const CHROME_FIRST = ["A.", "R.", "M.", "S.", "J.", "K.", "L.", "P.", "T.", "D.", "C.", "N.", "E.", "G."];
const CHROME_LAST = ["Bennett", "Okonkwo", "Larsson", "Vargas", "Nakamura", "Fischer", "Romano", "Patel", "Dubois", "Haddad", "Walsh", "Schneider", "Costa", "Kim", "Novak", "Mwangi", "Andersen", "Reyes"];
const CHROME_TITLES = ["Director, Finance", "Operations Manager", "Chief Accountant", "VP, Strategy", "Compliance Officer", "Department Head", "Controller", "Program Lead", "General Manager", "Regional Director", "Head of Audit", "Company Secretary"];
const CHROME_CLASS = ["Internal Use Only", "Confidential", "Restricted", "For Official Use", "Commercial-in-Confidence", "Draft — Not for Distribution"];

function chromeName(rng) {
    return `${rng.pick(CHROME_FIRST)} ${rng.pick(CHROME_LAST)}`;
}

function docRefBlock(rng) {
    const ref = `${rng.pick(["DOC", "REF", "FR", "RPT", "FIN", "OPS", "QA"])}-${rng.int(1000, 9999)}-${String(rng.int(1, 99)).padStart(2, "0")}`;
    const rev = rng.pick(["Rev A", "Rev B", "Rev 1.0", "Rev 2.1", "v1.3", "Issue 2", "Draft 0.9"]);
    const cls = rng.pick(CHROME_CLASS);
    return `<div class="docref"><span>Document Ref: ${esc(ref)}</span><span>${esc(rev)}</span><span>${esc(cls)}</span></div>`;
}

function signOffBlock(rng) {
    const cells = ["Prepared by", "Reviewed by", "Approved by"].slice(0, rng.pick([2, 3, 3])).map((r) => (
        `<div class="so"><div class="soline"></div><div class="sorole">${r}</div><div class="soname">${esc(chromeName(rng))}</div><div class="sotitle">${esc(rng.pick(CHROME_TITLES))}</div></div>`
    )).join("");
    return `<div class="signoff">${cells}</div>`;
}

// Render the Canonical17 "form" components (Key-Value Region, Form fillable
// fields, Checkbox-Selected/Unselected, Document Index) + Signature. Each
// component carries a class the ground-truth classifier (groundTruth.mjs) maps
// to its canonical class; bboxes are measured in the browser like every block.
// Fields carry a fill state (empty / typed / handwritten) so the dataset has
// both blank and completed fields — mirroring the FFDetr fillgen writer modes.
export function formComponentsHtml(blocks, rng) {
    const e = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Real forms render fillable fields in two conventions on a WHITE ground: a
    // bordered BOX or a plain UNDERLINE (never a tinted fill). Pick a per-doc
    // dominant style with occasional per-field flips so the dataset covers both.
    const roll = (p) => (rng ? rng.bool(p) : false);
    const docStyle = roll(0.5) ? "fs-line" : "fs-box";
    const pickStyle = () => (roll(0.82) ? docStyle : (docStyle === "fs-box" ? "fs-line" : "fs-box"));
    // The ink that sits on a field's blank line, per fill mode.
    const fill = (f) => {
        if (f.fill === "typed" && f.value) { return `<span class="ff-ink ff-typed">${e(f.value)}</span>`; }
        if (f.fill === "handwritten" && f.value) {
            return `<span class="ff-ink hw" style="transform:rotate(${f.tilt || 0}deg)">${e(f.value)}</span>`;
        }
        return "";  // empty
    };
    const out = [];
    // The Form region is ONE container that encloses every fillable widget —
    // TextBoxes, Checkboxes AND the Signature — so the measured "Form" bbox wraps
    // them all (Heron convention). Key-Value Region and Document Index are their
    // own region classes and stay separate. Accumulate the field/checkbox/
    // signature sub-groups, then flush them into a single .form-region.
    const formInner = [];
    const flushForm = () => {
        if (formInner.length) { out.push(`<div class="form-region">\n${formInner.join("\n")}\n</div>`); formInner.length = 0; }
    };
    for (const b of blocks || []) {
        if (b.kind === "kv") {
            flushForm();
            const rows = (b.rows || []).map((r) =>
                `<div class="kv-row"><span class="kv-k">${e(r.label)}</span><span class="kv-v">${e(r.value)}</span></div>`).join("\n");
            out.push(`<div class="kv-region">${b.title ? `<div class="fc-h">${e(b.title)}</div>` : ""}\n${rows}\n</div>`);
        } else if (b.kind === "form") {
            const rows = (b.fields || []).map((f) =>
                `<div class="ff-row"><label class="ff-l">${e(f.label)}</label><span class="ff-blank ${pickStyle()}">${fill(f)}</span></div>`).join("\n");
            formInner.push(`<div class="ff-sub">${b.title ? `<div class="fc-h">${e(b.title)}</div>` : ""}\n${rows}\n</div>`);
        } else if (b.kind === "checks") {
            // The checkbox MARK (.cb-box) is the measured widget; the sel/unsel
            // class rides on the mark so its bbox covers the box only, not the row.
            const items = (b.items || []).map((it) =>
                `<div class="cb-field"><span class="cb-box ${it.checked ? "cb-sel" : "cb-unsel"}">${it.checked ? "&#10003;" : ""}</span><span class="cb-lbl">${e(it.label)}</span></div>`).join("\n");
            formInner.push(`<div class="cb-group">${b.title ? `<div class="fc-h">${e(b.title)}</div>` : ""}\n${items}\n</div>`);
        } else if (b.kind === "signature") {
            // The signing line (.sig-line) is the measured Signature widget; it
            // lives inside the Form region with the other widgets.
            for (const s of b.items || []) {
                const ink = s.signed ? `<span class="hw sig-ink" style="transform:rotate(${s.tilt || 0}deg)">${e(s.value)}</span>` : "";
                formInner.push(`<div class="sig-field"><span class="sig-cap">${e(s.label || "Signature")}</span><span class="sig-line ${pickStyle()}">${ink}</span>${s.date ? `<span class="sig-date">Date: ${e(s.date)}</span>` : ""}</div>`);
            }
        } else if (b.kind === "toc") {
            flushForm();
            const rows = (b.items || []).map((t, i) =>
                `<div class="toc-row"><span class="toc-t">${e(t)}</span><span class="toc-dots"></span><span class="toc-p">${i + 1}</span></div>`).join("\n");
            out.push(`<nav class="gen-toc"><div class="fc-h">Contents</div>\n${rows}\n</nav>`);
        }
    }
    flushForm();
    return out.join("\n");
}

export function documentHtml(doc, template, rng, idLabel) {
    // A wide table can't shrink below its min-content, so squeezing it into a
    // fraction of the page width makes it spill off the edge (clipped). For the
    // newspaper-column flow we'd rather give a wide table the full page width
    // (more readable), so gate multi-column on the widest table. Panels are
    // inherently divided, so there we instead force cells to wrap (see CSS below).
    const widestTable = doc.sections.reduce((m, s) => Math.max(m, (s.model && s.model.ncols) || 0), 0);
    const panelMode = doc.panels >= 2;
    const isLandscape = Boolean(doc.landscape) || template.page.orientation === "landscape";
    const colCapacity = isLandscape ? 6 : 5;
    // ---- Layout recipe: vary the page's vertical RHYTHM doc-to-doc. ----------
    // Body column count is now a per-doc choice (full-width masthead/intro over a
    // 1/2/3-column body, with tables/figures spanning all columns), not a fixed
    // template property — so the dataset isn't one monotonous single-column stack.
    const tmplCols = Math.max(1, Math.min(4, template.page.columns || 1));
    // A multi-column body needs enough PROSE to fill the columns; the table(s)
    // span all columns (so table width no longer blocks multi-column). Make it
    // common — a 2/3-column page is the strongest at-a-glance layout difference.
    const proseChars = ((doc.intro || []).join(" ") + " "
        + doc.sections.map((s) => [...(s.lead || []), ...(s.trailing || []), ...(s.bullets || [])].join(" ")).join(" ")
        + " " + (doc.conclusion || []).join(" ")).length;
    // Form docs stay single-column: the form components flow into the column
    // grid, and the browser measurement vs. the printed PDF balance the columns
    // differently, which corrupts the measured layout-GT bboxes. A single column
    // keeps measurement and PDF identical so the form-component bboxes are exact.
    const hasForm = Boolean(doc.formBlocks && doc.formBlocks.length);
    const canCols = !hasForm && !panelMode && !doc.huge && !doc.dense && !isLandscape && proseChars > 340;
    const ncols = canCols
        ? rng.weighted(tmplCols >= 2 ? [[1, 2], [2, 5], [3, 3]] : [[1, 3], [2, 5], [3, 2]])
        : 1;
    const multiCol = ncols >= 2;
    // Vertical density: airy (loose, top-weighted) ↔ packed (tight, full page).
    const density = rng.weighted([["airy", 3], ["normal", 5], ["compact", 3]]);
    // Header/masthead rhythm at the top of the page.
    // Centered/hero mastheads need portrait whitespace to look balanced; on
    // landscape / dense full-page data pages they leave an ugly void, so there we
    // stick to plain/band/metarow.
    const headerStyle = (panelMode || isLandscape || doc.dense || doc.huge)
        ? rng.weighted([["plain", 4], ["band", 2], ["metarow", 2], ["rule", 2], ["leftbar", 2]])
        : rng.weighted([["plain", 3], ["centered", 3], ["band", 2], ["metarow", 2], ["hero", 2], ["rule", 3], ["leftbar", 2]]);
    // Callout/note styling: a tinted box, a large pull-quote, or a narrow floated
    // sidebar note that text wraps around (the floated one only in single-column).
    const calloutStyle = rng.weighted(multiCol ? [["box", 3], ["quote", 2]] : [["box", 3], ["quote", 2], ["aside", 2]]);
    // Section-heading treatment — a prominent, repeated element, so varying it
    // changes the whole page's rhythm. Render-only.
    const headStyle = rng.weighted([["plain", 4], ["bar", 3], ["rule", 2], ["band", 2], ["caps", 1]]);
    // Within-section BLOCK ORDER — shake up the "lead → table → bullets → trailing"
    // sameness so the vertical rhythm differs doc to doc. Reading order stays
    // self-consistent (layout GT measures the DOM; text GT is bag-of-words).
    const bodyOrder = rng.weighted([
        [["lead", "table", "bullets", "trailing"], 5],   // classic
        [["table", "lead", "bullets", "trailing"], 2],   // table right after heading
        [["lead", "bullets", "table", "trailing"], 2],   // key points, then the table
        [["lead", "table", "trailing", "bullets"], 2],   // bullets as a closing list
        [["lead", "bullets", "trailing", "table"], 2],   // discussion first, table last
    ]);
    const css = templateToCss(template) + deltaCss((template.decor && template.decor.accent) || undefined);
    const figures = []; // chart data models actually placed on the page (for chart GT)
    const accent = template.table.headerBg && template.table.headerBg !== "transparent" ? template.table.headerBg : template.table.borderColor;

    const decorTop = template.decor || {};
    const short = (s, n) => { const x = String(s || ""); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

    const wantDocRef = !doc.huge && rng.bool(0.05);
    const wantSignOff = !doc.huge && !doc.panels && rng.bool(0.05);
    // ~30% of docs highlight one existing paragraph as a callout/note box
    // (accent left-bar + tint). Render-only — the text is unchanged in GT.
    const wantCallout = !doc.huge && !panelMode && rng.bool(0.3);
    let calloutUsed = false;
    const calloutBlock = (text) => {
        if (calloutStyle === "quote") { return `<blockquote class="pullquote">${esc(text)}</blockquote>`; }
        if (calloutStyle === "aside") { return `<aside class="callout callout-aside">${esc(text)}</aside>`; }
        return `<div class="callout">${esc(text)}</div>`;
    };

    // The masthead / title / intro form a FULL-WIDTH header zone (above any
    // multi-column body), so the title never gets trapped in one narrow column.
    const headBlocks = [];
    if (wantDocRef) {
        headBlocks.push(docRefBlock(rng));
    }
    // optional logo (only present on extracted templates that captured one)
    let hasLetterhead = false;
    if (template.logo && template.logo.dataUri) {
        const lh = logoBlock(template, doc, rng, short);
        hasLetterhead = lh.includes('class="letterhead');
        headBlocks.push(lh);
    }
    // optional running header — a condensed doc label (the lead part of the
    // title, before a "Title: subtitle" break). Never the subtitle verbatim,
    // which already appears in its own line just below (that read as duplicated).
    // Skipped when a letterhead is present, since it already shows the company.
    if (decorTop.header && decorTop.header.show && !hasLetterhead) {
        const lead = (doc.docTitle || "").split(/:|\s[-–—]\s/)[0].trim();
        const htext = short(lead || doc.dateline, 70);
        if (htext) {
            headBlocks.push(`<div class="runhead">${esc(htext)}</div>`);
        }
    }
    // Masthead: the dateline + title + subtitle, arranged per headerStyle.
    const dateHtml = doc.dateline ? `<div class="dateline">${esc(doc.dateline)}</div>` : "";
    const titleHtml = doc.docTitle ? `<h1>${esc(doc.docTitle)}</h1>` : "";
    const subHtml = doc.subtitle ? `<div class="subtitle">${esc(doc.subtitle)}</div>` : "";
    if (headerStyle === "metarow" && (titleHtml || dateHtml)) {
        // Title on the left, the dateline / a reference on the right of one row.
        const right = doc.dateline ? esc(doc.dateline) : `Ref. ${String.fromCharCode(65 + rng.int(0, 25))}-${rng.int(1000, 9999)}`;
        headBlocks.push(`<div class="masthead-row"><div class="mh-left">${titleHtml}${subHtml}</div><div class="mh-right">${right}</div></div>`);
    } else if (headerStyle === "band" && titleHtml) {
        // The band itself varies so two band docs don't look identical: a light
        // tint + left bar, a solid accent banner (reversed text), or an outline box.
        const bandV = rng.weighted([["tint", 3], ["solid", 2], ["outline", 2]]);
        headBlocks.push(dateHtml);
        headBlocks.push(`<div class="masthead-band mb-${bandV}">${titleHtml}${subHtml}</div>`);
    } else if (headerStyle === "rule" && titleHtml) {
        // Title between rules (thick rule under, sometimes also over).
        headBlocks.push(`<div class="masthead-rule${rng.bool(0.4) ? " mr-both" : ""}">${dateHtml}${titleHtml}${subHtml}</div>`);
    } else if (headerStyle === "leftbar" && titleHtml) {
        // A thick accent bar to the left of the title block — no fill.
        headBlocks.push(`<div class="masthead-leftbar">${dateHtml}${titleHtml}${subHtml}</div>`);
    } else if (headerStyle === "centered") {
        headBlocks.push(`<div class="masthead-center">${dateHtml}${titleHtml}${subHtml}</div>`);
    } else if (headerStyle === "hero") {
        // Cover-like: a large centered title with generous whitespace above/below.
        headBlocks.push(`<div class="masthead-hero">${dateHtml}${titleHtml}${subHtml}</div>`);
    } else {
        headBlocks.push(dateHtml, titleHtml, subHtml);
    }
    // Data-first layout: the dominant table leads (right under the masthead) and
    // the intro/lead prose follows it — a genuinely different skeleton from the
    // usual intro→table→prose. Only when the first section has a table.
    const dataFirst = !panelMode && !doc.huge && rng.bool(0.22)
        && doc.sections[0] && doc.sections[0].model;
    const introHtml = (doc.intro && doc.intro.length) ? paraBlocks(doc.intro) : "";
    if (introHtml && !dataFirst) {
        headBlocks.push(introHtml);
    }

    const blocks = [];
    const decor = template.decor || {};
    if (panelMode) {
        // N-up: each section becomes a mini-page panel. Row-major (grid) or
        // top-to-bottom (stacked), so the ground-truth table order (section
        // order) is preserved either way. The panel STYLE varies so multi-table
        // docs aren't all "tables in clearly bordered boxes": card (bordered),
        // plain (bare, just spacing), divided (a thin rule between panels, no
        // box), band (a tinted heading bar, no box).
        const panelStyle = rng.weighted([["card", 2], ["plain", 2], ["divided", 2], ["band", 1]]);
        // Two panels are sometimes stacked on top of each other instead of side
        // by side; 3-4 panels stay in a grid so they fit one page.
        const stacked = doc.panels === 2 && rng.bool(0.4);
        const gridCols = stacked ? 1 : (doc.panels === 4 ? 2 : doc.panels);
        const panelHtmls = doc.sections.map((s) => {
            const parts = [];
            if (s.heading) {
                parts.push(`<h3>${esc(s.heading)}</h3>`);
            }
            if (s.lead && s.lead.length) {
                parts.push(paraBlocks(s.lead.slice(0, 1)));
            }
            if (s.model) {
                parts.push(tableHtml(s.model, false));
            }
            if (s.trailing && s.trailing.length) {
                parts.push(paraBlocks(s.trailing.slice(0, 1)));
            }
            return `<div class="panel p-${panelStyle}">${parts.join("\n")}</div>`;
        });
        // minmax(0, 1fr) lets a track shrink below its table's min-content (so a
        // wide table wraps inside the panel instead of overflowing the page).
        const gridCls = `panelgrid pg-${panelStyle}${stacked ? " pg-stacked" : ""}`;
        blocks.push(`<div class="${gridCls}" style="grid-template-columns: repeat(${gridCols}, minmax(0, 1fr));">\n${panelHtmls.join("\n")}\n</div>`);
    } else {
        // Chart-focus docs always get a prominent synthetic chart; otherwise
        // charts are rare (~2%) and never on dense full-page tables.
        // A chart/figure is a distinct layout dimension most docs never showed
        // (was 2%); ~10% now carry one (built from the table data → chart GT stays
        // valid). Not on dense full-page tables or matrices (no series to plot).
        const figureEligible = !doc.dense && !doc.huge && widestTable > 0
            && !(doc.sections[0] && doc.sections[0].model && doc.sections[0].model.matrix);
        const wantFigure = doc.chartFocus || (figureEligible && rng.bool(0.10));
        const nSec = doc.sections.length;
        // Host the chart in a RANDOM section (not always the first), and pick a
        // varied, realistic placement — above the table, below it, or beside it —
        // so chart docs aren't all "a chart stacked over the first table".
        const figSectionIdx = wantFigure ? rng.int(0, nSec - 1) : -1;
        const hostModel = figSectionIdx >= 0 ? doc.sections[figSectionIdx].model : null;
        // A side-by-side chart only works when its table is narrow enough to share
        // the row (and not already in a divided / landscape layout).
        const besideOk = Boolean(hostModel) && hostModel.ncols >= 2 && hostModel.ncols <= 5 && !doc.landscape && !multiCol;
        let figVariant = "above";
        if (wantFigure) {
            // Favour above/below (full/medium width, legible). A beside chart is
            // only ~40% wide, so its axis labels cramp on multi-series data — keep
            // it as the occasional variant, not a third of the time.
            const pool = ["above", "above", "above", "below", "below", "below"];
            if (besideOk) { pool.push("beside-right", "beside-left"); }
            figVariant = rng.pick(pool);
        }
        // For the stacked variants, vary the chart's size and alignment too.
        const figSize = rng.pick(["full", "full", "medium", "small"]);
        const figLeft = figSize !== "full" && rng.bool(0.5);
        // In multi-column docs, a SHORT single table is sometimes contained in a
        // column and sometimes spans — a bit of both. But a long table contained
        // in one narrow column leaves the others empty, so long tables always
        // span. Multi-table docs always span (reading order).
        const firstRows = (doc.sections[0] && doc.sections[0].model) ? doc.sections[0].model.rows.length : 0;
        const tablesSpan = nSec > 1 ? true : (firstRows > 14 ? true : rng.bool(0.5));
        const docCurrency = detectDocCurrency(doc);
        const figOpts = doc.chartFocus ? { forceSynthetic: true, dense: rng.bool(0.5), type: doc.chartType || undefined, currency: docCurrency } : { type: doc.chartType || undefined, currency: docCurrency };
        const mkFig = (s, o = {}) => {
            const fig = buildFigure(s.model, rng, accent, figures.length + 1, captionFor(s, doc, rng), figOpts);
            figures.push(fig.model);
            return figureBlock(fig, accent, o);
        };
        doc.sections.forEach((s, i) => {
            if (i > 0 && decor.divider) {
                blocks.push(`<hr class="divider">`);
            }
            if (s.heading) {
                const tag = nSec > 1 ? "h2" : "h3";
                const prefix = decor.numbered && nSec > 1 ? `${i + 1}. ` : "";
                blocks.push(`<${tag}>${prefix}${esc(s.heading)}</${tag}>`);
            }
            const dfHere = dataFirst && i === 0 && Boolean(s.model);
            const isHost = i === figSectionIdx;
            // Build each body piece, then emit them in the chosen order.
            const piece = { lead: "", table: "", bullets: "", trailing: "" };
            if (s.lead && s.lead.length) { piece.lead = paraBlocks(s.lead); }
            if (s.bullets && s.bullets.length) {
                piece.bullets = `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
            }
            if (s.trailing && s.trailing.length) {
                if (wantCallout && !calloutUsed) {
                    piece.trailing = calloutBlock(s.trailing[0]) + (s.trailing.length > 1 ? `\n${paraBlocks(s.trailing.slice(1))}` : "");
                    calloutUsed = true;
                } else {
                    piece.trailing = paraBlocks(s.trailing);
                }
            }
            if (isHost && s.model && (figVariant === "beside-left" || figVariant === "beside-right")) {
                const cells = figVariant === "beside-left"
                    ? [mkFig(s, { inline: true }), tableHtml(s.model, false)]
                    : [tableHtml(s.model, false), mkFig(s, { inline: true })];
                piece.table = `<div class="figrow">\n${cells.join("\n")}\n</div>`;
            } else {
                const parts = [];
                if (isHost && figVariant === "above") { parts.push(mkFig(s, { size: figSize, left: figLeft })); }
                if (s.model) {
                    const compact = !doc.dense && !doc.huge && !isLandscape && !multiCol && !panelMode && s.model.ncols <= 4;
                    const wideForCol = s.model.ncols > (ncols >= 3 ? 1 : 2);
                    parts.push(tableHtml(s.model, multiCol && (tablesSpan || wideForCol), compact));
                }
                if (isHost && figVariant === "below") { parts.push(mkFig(s, { size: figSize, left: figLeft })); }
                if (s.delta) { parts.push(deltaHtml(s.delta)); }
                piece.table = parts.join("\n");
            }
            // Data-first first section: table leads, then the intro + the rest.
            // Otherwise emit the pieces in this doc's bodyOrder.
            const seq = dfHere ? ["table", "lead", "bullets", "trailing"] : bodyOrder;
            if (dfHere && introHtml) { blocks.push(piece.table); blocks.push(introHtml); piece.table = ""; }
            for (const k of seq) {
                if (piece[k]) { blocks.push(piece[k]); }
            }
        });
    }

    if (doc.conclusion && doc.conclusion.length) {
        if (wantCallout && !calloutUsed) {
            blocks.push(calloutBlock(doc.conclusion[0]));
            if (doc.conclusion.length > 1) { blocks.push(paraBlocks(doc.conclusion.slice(1))); }
            calloutUsed = true;
        } else {
            blocks.push(paraBlocks(doc.conclusion));
        }
    }
    if (wantSignOff) {
        blocks.push(signOffBlock(rng));
    }
    if (doc.footnote) {
        blocks.push(`<div class="footnote">${esc(doc.footnote)}</div>`);
    }

    // Footer / page number live in a bottom region pinned to the page bottom
    // (not stuck right under the content). On multi-page (huge) docs this is
    // skipped — the generator draws a repeating per-page footer via Chrome's
    // footerTemplate instead.
    const footBlocks = [];
    if (!doc.huge) {
        let footerHasPage = false;
        // Synthetic page position. Real benchmark pages are usually an arbitrary
        // page of a LARGER document, so the footer should not always read
        // "Page 1 of 1". Page numbers follow a DECAYING curve — low pages common,
        // high pages rare — so page 1 dominates and page 100 is rare. Honour the
        // real sampled page (--multipage) when present. Render-only chrome: the
        // page label is not part of the table/text ground truth.
        let cur;
        let of;
        if (doc.pageInfo) {
            cur = doc.pageInfo.page;
            of = doc.pageInfo.of;
        } else if (rng.bool(0.4)) {
            // An early / short document.
            cur = 1;
            of = rng.bool(0.45) ? 1 : 1 + Math.floor(-6 * Math.log(1 - rng()));
        } else {
            // A page deeper in a long document. Exponential tail, with an
            // occasional "very long document" so deep pages (~100+) still occur,
            // just rarely — the curve decays smoothly from page 1.
            const mean = rng.bool(0.12) ? 55 : 11;
            cur = Math.min(300, 2 + Math.floor(-mean * Math.log(1 - rng())));
            of = Math.max(cur, cur + (rng.bool(0.7) ? Math.floor(-12 * Math.log(1 - rng())) : rng.int(0, 3)));
        }
        const wantFooter = (decorTop.footer && decorTop.footer.show) || rng.bool(0.35);
        if (wantFooter) {
            // Vary the page label, the left-hand meta text, and the layout so docs
            // don't all end in "<subtitle> · Page <n> of <m>".
            const pageLabel = rng.weighted([[`Page ${cur} of ${of}`, 3], [`Page ${cur}`, 2], [`${cur}`, 2], [`${cur} / ${of}`, 1], [`— ${cur} —`, 1], [`p. ${cur}`, 1], [`Page ${cur}/${of}`, 1], ["", 2]]);
            footerHasPage = pageLabel !== "";
            const metaChoices = [];
            const subj = short(doc.subtitle || doc.docTitle, 70);
            if (subj) { metaChoices.push(subj, subj); }
            if (doc.dateline) { metaChoices.push(short(doc.dateline, 48)); }
            metaChoices.push(rng.pick(["Confidential", "Internal use only", "Proprietary & Confidential", "Do not distribute", "Uncontrolled when printed", "Commercial in confidence", "For authorized recipients only"]));
            metaChoices.push(`Ref. ${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))}-${rng.int(1000, 9999)}`);
            metaChoices.push("", "");
            const meta = esc(rng.pick(metaChoices));
            const cls = decorTop.footer && decorTop.footer.rule ? "footer footer-rule" : "footer";
            const layout = rng.weighted([["split", 4], ["inline", 3], ["center", 2]]);
            if (layout === "split" && meta && footerHasPage) {
                footBlocks.push(`<div class="${cls} footer-split"><span>${meta}</span><span>${pageLabel}</span></div>`);
            } else {
                const t = [meta, footerHasPage ? pageLabel : ""].filter(Boolean).join(" · ");
                if (t) { footBlocks.push(`<div class="${cls}${layout === "center" ? " footer-center" : ""}">${t}</div>`); }
                else { footerHasPage = false; }
            }
        }
        // only add a standalone page number if the footer didn't already carry one
        const pn = decorTop.pageNum;
        if (pn && !footerHasPage && !footBlocks.length) {
            const pnText = rng.weighted([[`Page ${cur}`, 2], [`${cur}`, 2], [`Page ${cur} of ${of}`, 2], [`— ${cur} —`, 1]]);
            footBlocks.push(`<div class="pagenum" style="text-align:${pn.align}">${esc(pnText)}</div>`);
        }
    }

    // Form components (Canonical17 extended labels) lead the content, right under
    // the masthead — where fillable fields naturally sit on a real form.
    if (doc.formBlocks && doc.formBlocks.length) {
        blocks.unshift(formComponentsHtml(doc.formBlocks, rng));
    }
    const headInner = headBlocks.filter(Boolean).join("\n");
    const bodyInner = blocks.filter(Boolean).join("\n");
    const wm = template.watermark || decorTop.watermark || null;
    const wmHtml = wm ? `<div class="watermark">${esc(wm.text)}</div>\n` : "";
    // Full-width masthead/intro, then a 1/2/3-column body with tables/figures
    // spanning all columns (column-span: all, set on wide tables via tableHtml).
    const wrappedBody = multiCol
        ? `<div class="colflow" style="column-count: ${ncols}; column-gap: ${rng.int(18, 30)}px;">\n${bodyInner}\n</div>`
        : bodyInner;
    const contentInner = `${headInner}\n${wrappedBody}`;
    // Huge docs use Chrome page margins (for the repeating footer), so they skip
    // the flex/full-bleed-padding layout used by single-page docs.
    const body = doc.huge
        ? `${wmHtml}${contentInner}`
        : `${wmHtml}<div class="content">\n${contentInner}\n</div>${footBlocks.length ? `\n<div class="pagefoot">${footBlocks.join("\n")}</div>` : ""}`;

    // The page margin is applied as full-bleed body padding (not a print margin)
    // so a background tint reaches the page edge instead of leaving a white frame.
    // The page must stay light (some templates captured a dark cover-page tint);
    // text is forced dark in templateToCss, so only a light tint is allowed.
    const pageBg = (decorTop.tint && decorTop.tint !== "none" && luminance(decorTop.tint) > 0.85) ? decorTop.tint : "#ffffff";
    // Keep the template's margin (varies — some docs genuinely have wide margins);
    // just guard the extremes.
    let marginIn = Math.min(1.1, Math.max(0.3, template.page.marginIn || 0.5));
    // Density nudges the page margin too: airy pages breathe, compact pages tighten.
    if (density === "airy") { marginIn = Math.min(1.05, marginIn + 0.16); }
    else if (density === "compact") { marginIn = Math.max(0.3, marginIn - 0.12); }
    const landscape = Boolean(doc.landscape) || template.page.orientation === "landscape";

    const faceCss = fontFaceCss([template.body && template.body.fontFamily, template.table && template.table.fontFamily, ...HANDWRITING_FAMILIES].filter(Boolean));
    // Per-doc layout CSS: vertical density (line-height / block spacing) and the
    // masthead style. Render-only — none of it changes the ground truth.
    const dens = ({
        airy: { lh: 1.7, p: "0 0 13px", h2: "26px 0 10px", h3: "20px 0 8px", tbl: "14px 0 22px" },
        normal: { lh: 1.5, p: "0 0 9px", h2: "20px 0 7px", h3: "16px 0 6px", tbl: "8px 0 16px" },
        compact: { lh: 1.32, p: "0 0 5px", h2: "13px 0 4px", h3: "11px 0 4px", tbl: "5px 0 9px" },
    })[density];
    const layoutCss = `
  .content { line-height: ${dens.lh}; }
  .content p { margin: ${dens.p}; }
  .content h2 { margin: ${dens.h2}; }
  .content h3 { margin: ${dens.h3}; }
  .content table.gen { margin: ${dens.tbl}; }
  .colflow h1, .colflow h2, .colflow h3 { break-after: avoid; }
  ${headStyle === "bar" ? `.content h2, .content h3 { border-left: 3px solid ${accent}; padding-left: 8px; }` : ""}
  ${headStyle === "rule" ? `.content h2, .content h3 { border-bottom: 1.5px solid ${accent}; padding-bottom: 3px; }` : ""}
  ${headStyle === "band" ? `.content h2, .content h3 { background: ${lightTintOf(accent)}; padding: 4px 9px; }` : ""}
  ${headStyle === "caps" ? ".content h2, .content h3 { text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.95em; }" : ""}
  .masthead-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .masthead-row .mh-left { min-width: 0; }
  .masthead-row .mh-right { font-size: 0.8em; color: #777; white-space: nowrap; text-align: right; }
  .masthead-band { padding: 10px 16px; margin: 0 0 13px; }
  .masthead-band h1 { margin: 0; } .masthead-band .subtitle { margin: 4px 0 0; }
  .mb-tint { background: ${lightTintOf(accent)}; border-left: 5px solid ${accent}; }
  .mb-solid { background: ${accent}; }
  .mb-solid h1 { color: ${luminance(accent) > 0.55 ? "#1a1a1a" : "#ffffff"}; }
  .mb-solid .subtitle { color: ${luminance(accent) > 0.55 ? "#444444" : "rgba(255,255,255,0.88)"}; }
  .mb-outline { border: 2px solid ${accent}; }
  .masthead-rule { margin: 0 0 13px; border-bottom: 3px solid ${accent}; padding-bottom: 7px; }
  .masthead-rule.mr-both { border-top: 3px solid ${accent}; padding-top: 7px; }
  .masthead-rule h1 { margin: 2px 0; }
  .masthead-leftbar { border-left: 6px solid ${accent}; padding: 2px 0 2px 14px; margin: 0 0 13px; }
  .masthead-leftbar h1 { margin: 2px 0; }
  .masthead-center { text-align: center; margin: 0 0 15px; }
  ${density === "airy" ? ".masthead-center h1 { font-size: 30px; }" : ""}
  .masthead-center h1, .masthead-hero h1, .masthead-center .subtitle, .masthead-hero .subtitle, .masthead-center .dateline, .masthead-hero .dateline { text-align: center; }
  .masthead-hero { text-align: center; margin: 4% 0 7%; }
  .masthead-hero h1 { font-size: 34px; line-height: 1.15; margin: 0 0 12px; }
  .masthead-hero .subtitle { font-size: 1.18em; color: #555; }
  .masthead-hero .dateline { margin-bottom: 14px; }
  blockquote.pullquote { margin: 14px 0; padding: 4px 0 4px 16px; border-left: 4px solid ${accent}; font-size: 1.22em; font-style: italic; line-height: 1.4; color: #333; break-inside: avoid; }
  aside.callout-aside { float: right; width: 38%; margin: 4px 0 12px 18px; border-left: 3px solid ${accent}; background: ${lightTintOf(accent)}; padding: 9px 13px; border-radius: 2px; }`;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${faceCss}
  html { margin: 0; background: ${pageBg}; }
  ${doc.huge
        ? `body { margin: 0; padding: 0; background: ${pageBg}; box-sizing: border-box; }`
        : `body { margin: 0; padding: ${marginIn}in; background: ${pageBg}; box-sizing: border-box; min-height: 100vh; display: flex; flex-direction: column; }`}
  .content { flex: 1 0 auto; }
  .pagefoot { flex-shrink: 0; }
  ${doc.huge ? "table.gen thead { display: table-header-group; }" : "table.gen { break-inside: avoid; }"}
  /* In a newspaper-column flow, keep each block whole within one column. A block
     that splits across the column boundary gets a getBoundingClientRect spanning
     both columns, which would corrupt the layout ground-truth bbox. */
  .colflow p, .colflow ul, .colflow h2, .colflow h3, .colflow figure { break-inside: avoid; }
  ${(landscape || multiCol) ? "table.gen { width: 100%; }" : ""}
  /* A narrow table sizes to content (no sparse full-width gaps) but is CENTERED
     and given a sensible minimum width, so it reads as an intentional summary
     table instead of hugging the left with all the whitespace dumped on the
     right. */
  table.gen.compact { width: auto; min-width: 58%; max-width: 100%; margin-left: auto; margin-right: auto; }
  .dateline { font-size: 0.8em; letter-spacing: 0.04em; text-transform: uppercase; color: #777; margin: 0 0 10px; }
  .subtitle { font-size: 1.05em; color: #555; margin: 0 0 12px; }
  ul { margin: 0 0 9px 1.25em; padding: 0; } li { margin: 3px 0; }
  figure.fig { margin: 10px 0 14px; text-align: center; break-inside: avoid; }
  figure.fig svg { width: 100%; max-width: 460px; height: auto; }
  figure.fig.fig--full svg { max-width: 480px; }
  figure.fig.fig--medium svg { max-width: 340px; }
  figure.fig.fig--small svg { max-width: 280px; }
  figure.fig.fig--left { text-align: left; }
  /* side-by-side chart + table */
  .figrow { display: flex; gap: 20px; align-items: flex-start; margin: 10px 0 14px; }
  .figrow > figure.fig { flex: 0 0 40%; margin: 0; text-align: center; }
  .figrow > figure.fig svg { width: 100%; max-width: 100%; }
  .figrow > table.gen { flex: 1 1 0; min-width: 0; margin: 0; }
  .figrow table.gen { font-size: 0.9em; }
  .figrow table.gen th { overflow-wrap: normal; word-break: normal; }
  .figrow table.gen td { overflow-wrap: break-word; }
  figcaption { font-size: 0.85em; color: #555; margin-top: 5px; text-align: left; }
  .footnote { margin-top: 18px; font-size: 0.78em; color: #777; border-top: 1px solid #ddd; padding-top: 6px; }
  .footer { margin-top: 10px; font-size: 9px; color: #999; }
  .footer-split { display: flex; justify-content: space-between; gap: 12px; }
  .footer-center { text-align: center; }
  .footer-rule { border-top: 1px solid #ddd; padding-top: 5px; }
  .pagenum { margin-top: 12px; font-size: 0.72em; color: #888; }
  /* Rotated column headers for cross-tab/matrix tables: the column-axis header
     cells (every header cell except the top-left corner) are turned 90° so narrow
     mark columns fit. Render-only — the ground truth keeps the header text. */
  table.gen.rothead thead th:not(:first-child) { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; vertical-align: bottom; text-align: left; padding: 6px 3px; }
  table.gen.rothead thead th:first-child { vertical-align: bottom; }
  table.gen.rothead td { text-align: center; }
  /* Conditional cell colour (render-only — never in the ground truth) */
  table.gen td.c-neg { color: #c0392b; }
  table.gen td.c-good { background: #e6f4ea; }
  table.gen td.c-warn { background: #fdf4e0; }
  table.gen td.c-bad { background: #fbe6e4; }
  /* Form chrome (render-only) */
  table.gen th.cn { font-size: 0.78em; font-weight: 600; color: #555; padding: 1px 4px; }
  table.gen td.fld { background: #fff; }
  table.gen.fieldblock { width: auto; min-width: 55%; }
  table.gen.fieldblock th.rh { background: transparent; font-weight: 600; }
  table.gen.form td:empty { background: #fff; }
  .panelgrid { display: grid; gap: 14px; margin-top: 8px; }
  .pg-stacked { gap: 18px; }
  .panel { padding: 9px 11px; break-inside: avoid; }
  /* card: the classic bordered mini-page box */
  .p-card { border: 1px solid ${accent}; border-radius: 4px; }
  /* plain: no box at all, just the grid gap */
  .p-plain { padding: 2px 0; }
  /* band: no box, but a tinted heading bar marks each panel */
  .p-band { padding: 2px 0; }
  .p-band h3 { background: ${lightTintOf(accent)}; border-left: 3px solid ${accent}; padding: 5px 9px; margin: 0 0 7px; }
  /* divided: no box, a thin rule separates panels (column rule when side by
     side, row rule when stacked) */
  .pg-divided:not(.pg-stacked) .panel + .panel { border-left: 1px solid #d6d6d6; padding-left: 18px; }
  .pg-divided.pg-stacked .panel + .panel { border-top: 1px solid #d6d6d6; padding-top: 14px; }
  .panel h3 { margin-top: 0; }
  .panel table.gen { width: 100%; font-size: 0.82em; }
  /* In a panel a table can't take the full page width. Shrink the font and let
     LONG values wrap (overflow-wrap), but never break short header words
     mid-character ("Min" -> "Mi n") — headers keep their word and size the column. */
  .panel table.gen th { overflow-wrap: normal; word-break: normal; }
  .panel table.gen td { overflow-wrap: break-word; }
  .docref { display: flex; gap: 16px; justify-content: flex-end; flex-wrap: wrap; font-size: 0.66em; color: #666; font-family: 'Courier New', monospace; letter-spacing: 0.02em; margin-bottom: 10px; }
  /* ---- Canonical17 form components (render-only styling) ---- */
  .fc-h { font-weight: 700; font-size: 0.92em; margin: 0 0 6px; color: #222; }
  .kv-region, .gen-toc { break-inside: avoid; margin: 10px 0 14px; }
  /* The Form region holds every widget, so it can be tall — let it flow across a
     page break rather than jump wholesale (which would blank out page 1). Keep
     the widget sub-groups unbroken so a checkbox/field group stays intact. */
  .form-region { break-inside: auto; margin: 10px 0 14px; }
  .ff-sub, .cb-group, .sig-field { break-inside: avoid; }
  .ff-sub { margin-bottom: 8px; } .cb-group { margin: 6px 0; }
  .kv-region { border: 1px solid #ccd; background: ${lightTintOf(accent)}; padding: 9px 12px; border-radius: 3px; }
  .kv-row { display: flex; gap: 10px; padding: 3px 0; border-bottom: 1px dotted #ccc; }
  .kv-k { flex: 0 0 42%; font-weight: 600; color: #333; }
  .kv-v { flex: 1 1 0; color: #111; min-height: 1em; }
  .form-region { border: 1px solid ${accent}; padding: 10px 12px; border-radius: 3px; }
  .ff-row { display: flex; align-items: flex-end; gap: 10px; margin: 9px 0; }
  .ff-l { flex: 0 0 38%; font-size: 0.86em; color: #444; }
  /* Fields render WHITE (no tint) in one of two real-form styles, chosen per field:
     fs-line = plain underline, fs-box = full border. Measured bbox = the whole
     field rectangle either way (min-height fixes it, stable filled/empty). */
  .ff-blank { flex: 1 1 0; min-height: 1.35em; background: #fff; position: relative; padding: 0 4px; display: flex; align-items: flex-end; }
  .ff-blank.fs-line { border-bottom: 1px solid #333; }
  .ff-blank.fs-box { border: 1px solid #8a8f99; }
  .ff-ink { line-height: 1.1; }
  .ff-typed { font-size: 0.9em; color: #16305a; }
  /* Handwriting for hand-filled fields + signatures — the ink can cross the box */
  .hw { font-family: "Caveat", "Homemade Apple", "Shadows Into Light", cursive; color: #143a86; font-size: 1.28em; line-height: 1; }
  .sig-field { display: flex; align-items: flex-end; gap: 12px; margin: 12px 0 6px; break-inside: avoid; }
  .sig-cap { flex: 0 0 auto; font-size: 0.82em; color: #444; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px; }
  /* Signature is a whole FIELD box (like .ff-blank / TextBox), not a bare line:
     bordered, tinted, fixed height -> the measured bbox is the SAME rectangle
     whether signed or blank, and consistent with the TextBox convention. Taller
     than a text field because signatures occupy a bigger box (real sig aspect ~11:1). */
  .sig-line { flex: 1 1 0; min-height: 3em; background: #fff; position: relative; padding: 2px 6px; display: flex; align-items: flex-end; overflow: hidden; }
  .sig-line.fs-line { border-bottom: 1.5px solid #333; }
  .sig-line.fs-box { border: 1px solid #8a8f99; }
  .sig-ink { font-size: 1.4em; color: #101a3a; line-height: 1; }
  .sig-date { flex: 0 0 auto; font-size: 0.8em; color: #555; }
  .cb-group { padding: 2px 0; }
  .cb-field { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 0.9em; }
  .cb-box { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border: 1.5px solid #333; font-size: 11px; line-height: 1; color: #111; }
  .gen-toc { border-top: 2px solid ${accent}; border-bottom: 1px solid #ccc; padding: 8px 0; }
  .toc-row { display: flex; align-items: baseline; gap: 6px; margin: 4px 0; font-size: 0.92em; }
  .toc-t { white-space: nowrap; } .toc-p { white-space: nowrap; color: #555; }
  .toc-dots { flex: 1 1 0; border-bottom: 1px dotted #999; transform: translateY(-3px); }
  .signoff { display: flex; gap: 30px; margin-top: 26px; }
  .so { flex: 1; }
  .soline { border-top: 1px solid #999; height: 24px; margin-bottom: 4px; }
  .sorole { font-size: 0.68em; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .soname { font-weight: 600; font-size: 0.85em; }
  .sotitle { font-size: 0.72em; color: #666; }
${css}
${layoutCss}
</style>
</head>
<body>
${body}
</body>
</html>`;
    return { html, figures };
}

function captionFor(section, doc, rng) {
    if (section.heading) {
        return section.heading;
    }
    return doc.docTitle || "Summary of results";
}
