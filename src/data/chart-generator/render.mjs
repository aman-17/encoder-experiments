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
import { buildFigure, HARD_CHARTS } from "./figure.mjs";
import { docStyleChrome } from "./docstyle.mjs";
import { inlineHtml as esc } from "./inline.mjs";
import { fontFaceCss } from "./googleFonts.mjs";
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
    const cls = [compact ? "gen compact" : "gen", model.rotatedHeaders ? "rothead" : "", model.form ? "form" : "", model.fieldBlock ? "fieldblock" : ""].filter(Boolean).join(" ");
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

// CG_ROTATE: after layout, size each rotation wrapper to its content's ROTATED
// bounding box so nothing clips and fitScale sees the true extent. 90°/270°
// turns map a w x h element into an h x w wrapper (transform-origin top-left +
// a translate back into the box); small skews get padding slack for the tilted
// corners. Render-only — the gold is model-derived and untouched.
const ROT_SCRIPT = `<script>
(function () {
  document.querySelectorAll(".rotwrap--turn").forEach(function (w) {
    var inner = w.firstElementChild;
    var deg = ((Number(w.getAttribute("data-deg")) % 360) + 360) % 360;
    var iw = inner.offsetWidth, ih = inner.offsetHeight;
    w.style.width = (ih + 2) + "px";
    w.style.height = (iw + 2) + "px";
    inner.style.transformOrigin = "top left";
    inner.style.transform = deg === 90 ? "rotate(90deg) translateY(-100%)" : "rotate(-90deg) translateX(-100%)";
  });
  document.querySelectorAll(".rotwrap--skew").forEach(function (w) {
    var inner = w.firstElementChild;
    var deg = Number(w.getAttribute("data-deg"));
    var rad = Math.abs(deg) * Math.PI / 180;
    var padY = Math.ceil(Math.sin(rad) * inner.offsetWidth / 2) + 4;
    var padX = Math.ceil(Math.sin(rad) * inner.offsetHeight / 2) + 4;
    w.style.padding = padY + "px " + padX + "px";
    inner.style.transform = "rotate(" + deg + "deg)";
  });
})();
</script>`;

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

export function documentHtml(doc, template, rng, idLabel) {
    // A wide table can't shrink below its min-content, so squeezing it into a
    // fraction of the page width makes it spill off the edge (clipped). For the
    // newspaper-column flow we'd rather give a wide table the full page width
    // (more readable), so gate multi-column on the widest table. Panels are
    // inherently divided, so there we instead force cells to wrap (see CSS below).
    const widestTable = doc.sections.reduce((m, s) => Math.max(m, (s.model && s.model.ncols) || 0), 0);
    const panelMode = doc.panels >= 2;
    const ds = doc.docStyle || null; // document archetype (arxiv/journal/textbook/magazine/financial/slide)
    const ncols = ds && ds.columns ? ds.columns : Math.max(1, Math.min(4, template.page.columns || 1));
    const isLandscape = Boolean(doc.landscape) || template.page.orientation === "landscape";
    const colCapacity = isLandscape ? 6 : 5;
    const multiCol = ncols >= 2 && !panelMode && widestTable <= colCapacity;
    const css = templateToCss(template);
    const figures = []; // chart data models actually placed on the page (for chart GT)
    const figGeoms = []; // matching svg-space geometry (renderChartWithGeom), same order
    const accent = template.table.headerBg && template.table.headerBg !== "transparent" ? template.table.headerBg : template.table.borderColor;

    const decorTop = template.decor || {};
    const short = (s, n) => { const x = String(s || ""); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

    // CG_ROTATE: wrap the main content element (table / figure) in a transform
    // container; surrounding prose and headings stay upright. The wrapper is
    // sized to the rotated bounding box by ROT_SCRIPT after layout.
    const rot = doc.rotate || null;
    const rotWrap = (inner) => rot
        ? `<div class="rotwrap rotwrap--${rot.mode === "skew" ? "skew" : "turn"}" data-deg="${rot.deg}"><div class="rotinner">\n${inner}\n</div></div>`
        : inner;
    // The width a 90°/270° element is laid out at BEFORE rotating = its height
    // afterwards, so budget it to the page's vertical space (sideways
    // landscape-table-in-portrait-page look). Overshoot is caught by fitScale.
    const rotBudget = (ds && ds.slide) ? 480 : (isLandscape ? 620 : 940);

    const isSlide = Boolean(ds && ds.slide);
    const wantDocRef = !doc.huge && !isSlide && rng.bool(0.05);
    const wantSignOff = !doc.huge && !doc.panels && !isSlide && rng.bool(0.05);
    // ~30% of docs highlight one existing paragraph as a callout/note box
    // (accent left-bar + tint). Render-only — the text is unchanged in GT.
    const wantCallout = !doc.huge && !panelMode && rng.bool(0.3);
    let calloutUsed = false;
    const calloutBlock = (text) => `<div class="callout">${esc(text)}</div>`;

    const blocks = [];
    if (wantDocRef) {
        blocks.push(docRefBlock(rng));
    }
    // optional logo (only present on extracted templates that captured one)
    let hasLetterhead = false;
    if (template.logo && template.logo.dataUri) {
        const lh = logoBlock(template, doc, rng, short);
        hasLetterhead = lh.includes('class="letterhead');
        blocks.push(lh);
    }
    // optional running header — a condensed doc label (the lead part of the
    // title, before a "Title: subtitle" break). Never the subtitle verbatim,
    // which already appears in its own line just below (that read as duplicated).
    // Skipped when a letterhead is present, since it already shows the company.
    if (decorTop.header && decorTop.header.show && !hasLetterhead && !isSlide) {
        const lead = (doc.docTitle || "").split(/:|\s[-–—]\s/)[0].trim();
        const htext = short(lead || doc.dateline, 70);
        if (htext) {
            blocks.push(`<div class="runhead">${esc(htext)}</div>`);
        }
    }
    if (ds) {
        // archetype supplies its own title chrome (masthead/abstract/kicker/band)
        blocks.push(docStyleChrome(doc, ds, rng));
    } else {
        if (doc.dateline) { blocks.push(`<div class="dateline">${esc(doc.dateline)}</div>`); }
        if (doc.docTitle) { blocks.push(`<h1>${esc(doc.docTitle)}</h1>`); }
        if (doc.subtitle) { blocks.push(`<div class="subtitle">${esc(doc.subtitle)}</div>`); }
    }
    if (doc.intro && doc.intro.length) {
        blocks.push(paraBlocks(doc.intro));
    }

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
    } else if (HARD_CHARTS && doc.chartFocus && rng.bool(doc.chartsOnly ? 0.72 : 0.55)) {
        // CG_HARD multi-chart page: 2-4 synthetic chart panels in a grid, each
        // with a DISTINCT category axis so [cat,series] labels never collide
        // across panels. Mirrors the failing profile's frequent multi-chart pages.
        // 2-8 chart panels per page (dense dashboards: 5/6/8 graphs side by side).
        // chart-only: include SOLO (1) up to 5 dashboards. With a table also on the
        // page (dual mode), cap at 2-4 so it stays single-page.
        const nPanels = doc.chartsOnly
            ? rng.weighted([[1, 2], [2, 3], [3, 3], [4, 2], [5, 1]])
            : rng.weighted([[2, 3], [3, 3], [4, 2]]);
        const kinds = rng.shuffle(["year", "quarter", "month", "region", "segment", "age"]);
        // Distinct caption per panel (no more repeated titles across the grid).
        const subjects = rng.shuffle([
            "Revenue by Period", "Cost Breakdown", "Volume Trend", "Market Share", "Growth Rate",
            "Capacity Utilization", "Margin Analysis", "Headcount", "Output by Region", "Spend by Category",
            "Throughput", "Utilization Rate", "Unit Economics", "Backlog", "Yield by Line",
        ]);
        const dcur = detectDocCurrency(doc);
        const mkFig = (p) => {
            const fig = buildFigure(null, rng, accent, figures.length + 1, subjects[p % subjects.length],
                { forceSynthetic: true, dense: nPanels <= 4, catKind: kinds[p % kinds.length], catOffset: (p % 4) * 2, currency: dcur, locale: doc.locale });
            figures.push(fig.model);
            figGeoms.push(fig.geom);
            return fig;
        };
        // Vary the LAYOUT so chart positions aren't uniform: hero (one big + rest),
        // asymmetric spans, magazine column-flow, or a plain/tinted grid.
        const layout = rng.weighted([["grid", 3], ["hero", 2], ["asym", 2], ["magflow", 3], ["giant", 2]]);
        const kicker = rng.pick(["ANALYSIS", "IN DEPTH", "BY THE NUMBERS", "DASHBOARD", "MARKET REVIEW", "DATA BRIEF", "FEATURE", "SPECIAL REPORT"]);
        if (layout === "magflow") {
            // Magazine article: 2-3 column flow; charts of varied sizes break across
            // columns, interspersed with a pull-quote — organic, non-gridded positions.
            const ncol = rng.pick([2, 2, 3]);
            const parts = [`<div class="mag-kicker">${esc(kicker)}</div>`];
            for (let p = 0; p < nPanels; p++) {
                const fig = mkFig(p);
                const span = (p === 0 && rng.bool(0.6)) ? " span-all" : "";
                parts.push(`<figure class="fig${span}">\n${fig.svg}\n<figcaption><strong>Figure ${fig.figNum}.</strong> ${esc(fig.caption)}</figcaption></figure>`);
                const lead = doc.sections[0] && doc.sections[0].lead && doc.sections[0].lead[0];
                if (p === Math.floor(nPanels / 2) && lead) {
                    parts.push(`<div class="pullquote">${esc(String(lead).slice(0, 140))}</div>`);
                }
            }
            blocks.push(`<div class="magflow" style="column-count:${ncol};">\n${parts.join("\n")}\n</div>`);
        } else if (layout === "giant") {
            // 1-2 HUGE full-width charts dominating the page (magazine hero graphic).
            const nBig = 1; // one huge chart + the table -> stays single-page
            if (rng.bool(0.5)) { blocks.push(`<div class="mag-kicker">${esc(kicker)}</div>`); }
            for (let p = 0; p < nBig; p++) {
                const fig = mkFig(p);
                blocks.push(`<figure class="fig fig--giant">\n${fig.svg}\n<figcaption><strong>Figure ${fig.figNum}.</strong> ${esc(fig.caption)}</figcaption></figure>`);
            }
        } else {
            const gridCols = nPanels <= 2 ? nPanels : nPanels <= 4 ? 2 : nPanels <= 6 ? 3 : 4;
            const panelHtmls = [];
            for (let p = 0; p < nPanels; p++) {
                const fig = mkFig(p);
                let cls = "panel p-plain";
                if (layout === "hero" && p === 0) { cls += " hero"; }
                else if (layout === "asym" && gridCols >= 2 && rng.bool(0.33)) { cls += " span2"; }
                panelHtmls.push(`<div class="${cls}">${figureBlock(fig, accent, { inline: true })}</div>`);
            }
            const mag = rng.bool(0.45);
            const head = mag ? `<div class="mag-kicker">${esc(kicker)}</div>` : "";
            blocks.push(`${head}<div class="panelgrid ${mag ? "pg-mag" : "pg-plain"}" style="grid-template-columns: repeat(${gridCols}, minmax(0, 1fr));">\n${panelHtmls.join("\n")}\n</div>`);
        }
        // Dual mode: also render the section table(s) (expected_markdown GT) alongside
        // the charts. Chart-ONLY mode (CG_CHARTS_ONLY) skips this -> pure chart page.
        if (!doc.chartsOnly) {
            for (const s of doc.sections) {
                if (s.heading) { blocks.push(`<h3>${esc(s.heading)}</h3>`); }
                if (s.model) { blocks.push(tableHtml(s.model, false)); }
            }
        }
    } else {
        // Chart-focus docs always get a prominent synthetic chart; otherwise
        // charts are rare (~2%) and never on dense full-page tables.
        const wantFigure = doc.chartFocus || (!doc.dense && rng.bool(0.02));
        const nSec = doc.sections.length;
        // Host the chart in a RANDOM section (not always the first), and pick a
        // varied, realistic placement — above the table, below it, or beside it —
        // so chart docs aren't all "a chart stacked over the first table".
        const figSectionIdx = wantFigure ? rng.int(0, nSec - 1) : -1;
        const hostModel = figSectionIdx >= 0 ? doc.sections[figSectionIdx].model : null;
        // A side-by-side chart only works when its table is narrow enough to share
        // the row (and not already in a divided / landscape layout).
        const besideOk = Boolean(hostModel) && hostModel.ncols >= 2 && hostModel.ncols <= 5 && !doc.landscape && !multiCol && !rot;
        let figVariant = "above";
        if (wantFigure) {
            if (isSlide) {
                // slides: chart + table share the slide side by side when the
                // table is narrow enough; a pure chart-slide (chartsOnly) hosts
                // the chart under the title, filling the content area.
                figVariant = (besideOk && !doc.chartsOnly) ? rng.pick(["beside-right", "beside-right", "beside-left"]) : "above";
            } else {
                const pool = ["above", "above", "below", "below"];
                if (besideOk) { pool.push("beside-right", "beside-right", "beside-left"); }
                figVariant = rng.pick(pool);
            }
        }
        // For the stacked variants, vary the chart's size and alignment too.
        const figSize = isSlide ? "full" : rng.pick(["full", "full", "medium", "small"]);
        const figLeft = figSize !== "full" && rng.bool(0.5);
        // In multi-column docs, a SHORT single table is sometimes contained in a
        // column and sometimes spans — a bit of both. But a long table contained
        // in one narrow column leaves the others empty, so long tables always
        // span. Multi-table docs always span (reading order).
        const firstRows = (doc.sections[0] && doc.sections[0].model) ? doc.sections[0].model.rows.length : 0;
        const tablesSpan = nSec > 1 ? true : (firstRows > 14 ? true : rng.bool(0.5));
        const docCurrency = detectDocCurrency(doc);
        const figOpts = doc.chartFocus ? { forceSynthetic: true, dense: rng.bool(0.5), type: doc.chartType || undefined, currency: docCurrency, locale: doc.locale } : { type: doc.chartType || undefined, currency: docCurrency, locale: doc.locale };
        const mkFig = (s, o = {}) => {
            const fig = buildFigure(s.model, rng, accent, figures.length + 1, captionFor(s, doc, rng), figOpts);
            figures.push(fig.model);
            figGeoms.push(fig.geom);
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
            if (s.lead && s.lead.length) {
                blocks.push(paraBlocks(s.lead));
            }
            const isHost = i === figSectionIdx;
            const beside = !doc.chartsOnly && isHost && s.model && (figVariant === "beside-left" || figVariant === "beside-right");
            if (beside) {
                // Chart and table share a row (chart left or right of the table).
                const cells = figVariant === "beside-left"
                    ? [mkFig(s, { inline: true }), tableHtml(s.model, false)]
                    : [tableHtml(s.model, false), mkFig(s, { inline: true })];
                blocks.push(`<div class="figrow">\n${cells.join("\n")}\n</div>`);
            } else {
                if (isHost && figVariant === "above") {
                    blocks.push(rotWrap(mkFig(s, { size: figSize, left: figLeft })));
                }
                if (s.model && !doc.chartsOnly) {
                    // A narrow table in a plain single-column doc reads better at
                    // content width than stretched edge-to-edge with sparse gaps.
                    const compact = !doc.dense && !doc.huge && !isLandscape && !multiCol && !panelMode && s.model.ncols <= 4;
                    blocks.push(rotWrap(tableHtml(s.model, multiCol && tablesSpan, compact)));
                }
                if (isHost && figVariant === "below") {
                    blocks.push(rotWrap(mkFig(s, { size: figSize, left: figLeft })));
                }
            }
            if (s.bullets && s.bullets.length) {
                blocks.push(`<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
            }
            if (s.trailing && s.trailing.length) {
                if (wantCallout && !calloutUsed) {
                    blocks.push(calloutBlock(s.trailing[0]));
                    if (s.trailing.length > 1) { blocks.push(paraBlocks(s.trailing.slice(1))); }
                    calloutUsed = true;
                } else {
                    blocks.push(paraBlocks(s.trailing));
                }
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
    if (ds && ds.footerChrome) {
        // slide themes carry their own footer strip (deck / date / slide no.)
        footBlocks.push(ds.footerChrome(doc, rng));
    } else if (!doc.huge) {
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

    const inner = blocks.join("\n");
    const wm = template.watermark || decorTop.watermark || null;
    const wmHtml = wm ? `<div class="watermark">${esc(wm.text)}</div>\n` : "";
    const contentInner = multiCol
        ? `<div class="colflow" style="column-count: ${ncols}; column-gap: ${rng.int(18, 32)}px;">\n${inner}\n</div>`
        : inner;
    // Huge docs use Chrome page margins (for the repeating footer), so they skip
    // the flex/full-bleed-padding layout used by single-page docs.
    const body = doc.huge
        ? `${wmHtml}${contentInner}`
        : `${wmHtml}<div class="content">\n${contentInner}\n</div>${footBlocks.length ? `\n<div class="pagefoot">${footBlocks.join("\n")}</div>` : ""}`;

    // The page margin is applied as full-bleed body padding (not a print margin)
    // so a background tint reaches the page edge instead of leaving a white frame.
    // The page must stay light (some templates captured a dark cover-page tint);
    // text is forced dark in templateToCss, so only a light tint is allowed.
    let pageBg = (decorTop.tint && decorTop.tint !== "none" && luminance(decorTop.tint) > 0.85) ? decorTop.tint : "#ffffff";
    // CG_HARD magazine backgrounds: ~a third of pages are NOT white. Light/pastel
    // tints keep charts readable directly; a bold/dark cover-style page puts the
    // content in a light card so text + charts stay legible.
    let contentCard = false;
    if (HARD_CHARTS && rng.bool(0.32)) {
        if (rng.bool(0.72)) {
            pageBg = rng.pick(["#f4efe6", "#eaf1f7", "#eef4ee", "#faf0f0", "#f0eef7", "#f5f1e8", "#e9eef2", "#f7efe9", "#ecebf5", "#eef2ea"]);
        } else {
            pageBg = rng.pick(["#1f2a37", "#232323", "#20303a", "#33263a", "#0f2b46", "#3a2b2b", "#1c2b25"]);
            contentCard = true;
        }
    }
    // archetype background wins over the random HARD tint (avoids card-in-band).
    if (ds && ds.pageBg) { pageBg = ds.pageBg; contentCard = false; }
    // Keep the template's margin (varies — some docs genuinely have wide margins);
    // just guard the extremes. Slide themes pin it (full-bleed band chrome).
    const marginIn = (ds && ds.marginIn != null) ? ds.marginIn : Math.min(1.1, Math.max(0.3, template.page.marginIn || 0.5));
    const landscape = Boolean(doc.landscape) || template.page.orientation === "landscape" || Boolean(ds && ds.landscape);

    const faceCss = fontFaceCss([template.body && template.body.fontFamily, template.table && template.table.fontFamily].filter(Boolean));

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
  .content { flex: 1 0 auto;${contentCard ? " background: #ffffff; padding: 0.45in 0.5in; border-radius: 6px;" : ""} }
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
  .figrow table.gen th, .figrow table.gen td { overflow-wrap: anywhere; word-break: break-word; }
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
  table.gen td.fld { background: #eef3fb; }
  table.gen.fieldblock { width: auto; min-width: 55%; }
  table.gen.fieldblock th.rh { background: transparent; font-weight: 600; }
  table.gen.form td:empty { background: #eef3fb; }
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
  /* varied / magazine chart layouts (non-uniform positions) */
  .panel.span2 { grid-column: span 2; }
  .panelgrid .panel.hero { grid-column: 1 / -1; }
  .panelgrid .panel.hero figure.fig svg { max-width: 760px; }
  .panelgrid.pg-mag { gap: 18px; padding: 12px 14px; background: ${lightTintOf(accent)}; border-radius: 5px; }
  .mag-kicker { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72em; color: ${accent}; font-weight: 700; margin: 8px 0 6px; }
  .pullquote { border-left: 4px solid ${accent}; padding: 4px 12px; margin: 8px 0; font-size: 1.12em; font-style: italic; color: #444; break-inside: avoid; }
  .magflow { column-gap: 22px; margin-top: 6px; }
  .magflow figure.fig { break-inside: avoid; margin: 0 0 12px; text-align: center; }
  .magflow figure.fig svg { width: 100%; max-width: 100%; height: auto; }
  .magflow figure.fig.span-all { column-span: all; }
  .magflow figure.fig.span-all svg { max-width: 720px; }
  /* huge full-page hero chart */
  figure.fig.fig--giant { margin: 14px 0 16px; }
  figure.fig.fig--giant svg { width: 100%; max-width: 100%; height: auto; }
  figure.fig.fig--giant figcaption { font-size: 0.95em; }
  .panel h3 { margin-top: 0; }
  .panel table.gen { width: 100%; }
  /* In a panel a table can't take the full page width, so let cells break
     anywhere — this lowers the table's min-content so it always fits the panel
     track instead of spilling off the page edge. */
  .panel table.gen th, .panel table.gen td { overflow-wrap: anywhere; word-break: break-word; }
  .docref { display: flex; gap: 16px; justify-content: flex-end; flex-wrap: wrap; font-size: 0.66em; color: #666; font-family: 'Courier New', monospace; letter-spacing: 0.02em; margin-bottom: 10px; }
  .signoff { display: flex; gap: 30px; margin-top: 26px; }
  .so { flex: 1; }
  .soline { border-top: 1px solid #999; height: 24px; margin-bottom: 4px; }
  .sorole { font-size: 0.68em; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .soname { font-weight: 600; font-size: 0.85em; }
  .sotitle { font-size: 0.72em; color: #666; }
${css}
${ds ? ds.css : ""}${rot ? `
  .rotwrap { position: relative; break-inside: avoid; margin: 14px auto; }
  .rotwrap--turn > .rotinner { position: absolute; top: 0; left: 0; width: ${rotBudget}px; }
  .rotwrap--skew > .rotinner { width: 93%; margin: 0 auto; }
  .rotinner figure.fig svg { max-width: 100%; }
  .rotinner table.gen { width: 100%; }` : ""}
</style>
</head>
<body${ds ? ` class="ds-${ds.key}"` : ""}>
${body}${rot ? `\n${ROT_SCRIPT}` : ""}
</body>
</html>`;
    return { html, figures, figGeoms };
}

function captionFor(section, doc, rng) {
    if (section.heading) {
        return section.heading;
    }
    return doc.docTitle || "Summary of results";
}
