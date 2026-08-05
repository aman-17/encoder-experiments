// Builds a document (chrome text + one or more table models) for one output
// file. Primary path asks Gemini 3.1 Flash Lite for credible domain content;
// the procedural fallback (content.mjs / tableModel.mjs) keeps the harness
// working with --no-llm or when a call fails.

import { geminiJson } from "./gemini.mjs";
import { pickDomain, pickFlavor, buildDocPrompt, DOC_SCHEMA } from "./domains.mjs";
import { modelFromSection, generateTableModel, generateLabelValueModel, generateCodeListingModel, splitStackedPair } from "./tableModel.mjs";
import { generateDeltaBlock } from "./deltaBlocks.mjs";
import { randomDocTitle, lorem } from "./content.mjs";

const DIFF_RANK = { easy: 0, medium: 1, hard: 2 };

function aggregateFlags(models) {
    let hardest = "easy";
    let maxTitleRows = 0;
    for (const m of models) {
        if (DIFF_RANK[m.flags.table_difficulty] > DIFF_RANK[hardest]) {
            hardest = m.flags.table_difficulty;
        }
        if (m.flags.max_top_title_rows) {
            maxTitleRows = Math.max(maxTitleRows, m.flags.max_top_title_rows);
        }
    }
    const flags = { table_difficulty: hardest };
    if (maxTitleRows > 0) {
        flags.max_top_title_rows = maxTitleRows;
    }
    return flags;
}

function decideShape(rng) {
    const sectionsWanted = rng.weighted([[1, 6], [2, 3], [3, 1]]);
    // Fewer rows when several tables share one page, so the doc stays single-page.
    const rowsPool = sectionsWanted >= 3
        ? [[4, 3], [6, 3], [8, 2]]
        : sectionsWanted === 2
            ? [[5, 3], [7, 3], [10, 2], [12, 1]]
            : [[5, 3], [8, 4], [12, 3], [16, 1]];
    const complex = sectionsWanted === 1 && rng.bool(0.3);
    return {
        sectionsWanted,
        cols: rng.weighted([[3, 2], [4, 4], [5, 4], [6, 3], [7, 2], [8, 1]]),
        rows: rng.weighted(rowsPool),
        wantTitle: complex ? true : rng.bool(0.35),
        wantGroups: complex ? true : rng.bool(0.25),
        complex,
        dense: false,
        extreme: false,
    };
}

// Prose-heavy document (article / report / memo / policy): mostly text, with
// at most one small table. Used to build the text-extraction dataset.
function decideTextShape(rng) {
    return {
        sectionsWanted: rng.int(3, 6),
        cols: rng.weighted([[3, 2], [4, 2], [5, 1]]),
        rows: rng.weighted([[3, 2], [5, 2], [6, 1]]),
        wantTitle: false,
        wantGroups: false,
        complex: false,
        dense: false,
        extreme: false,
        textFocus: true,
    };
}

// N-up: several small sections laid out as bordered mini-page panels in a grid.
function decidePanelsShape(rng) {
    const n = rng.weighted([[2, 3], [3, 1], [4, 2]]);
    // Fewer panels => taller tables, so a 2-up sheet fills the page instead of
    // leaving the lower half blank with two thin tables.
    const rows = n === 2 ? rng.weighted([[8, 2], [10, 3], [13, 2], [16, 1]])
        : n === 3 ? rng.weighted([[6, 2], [8, 3], [10, 1]])
            : rng.weighted([[4, 2], [6, 3], [8, 1]]);
    return {
        sectionsWanted: n,
        // Panels are ~half-page wide, so keep their tables NARROW (3-4 cols) or
        // they cramp and collide with the divider.
        cols: rng.weighted([[3, 4], [4, 3]]),
        rows,
        wantTitle: rng.bool(0.3),
        wantGroups: rng.bool(0.15),
        complex: false,
        dense: false,
        extreme: false,
        panels: n,
    };
}

// A huge dense data table: many columns/rows, filled programmatically from
// per-column generator specs the LLM returns (so it stays cheap on tokens).
function decideHugeShape(rng) {
    return {
        sectionsWanted: 1,
        cols: rng.weighted([[6, 2], [8, 3], [10, 3], [12, 2], [16, 1], [20, 1]]),
        rows: rng.weighted([[40, 1], [80, 3], [120, 3], [180, 2], [220, 1]]),
        wantTitle: rng.bool(0.6),
        wantGroups: rng.bool(0.4),
        complex: false,
        dense: false,
        extreme: false,
        huge: true,
        // landscape is left to the template/random orientation — wide portrait
        // tables exist in the wild too.
    };
}

// HARD-LONG (training data): a big single-page programmatic table sized to the
// "trainable zone" — a few hundred to ~1200 cells whose full ground truth still
// fits the model's response budget — rendered on ONE page (huge generator fill,
// but doc.huge=false so it shrink-fits a single page, so the GT matches the image).
// Two families: TALL-narrow (2-3 cols x 180-300 rows, SERFF/rate-sheet shape) and
// WIDE (10-16 cols x 50-80 rows, financial-statement shape). Gated by env TG_HARDLONG.
function decideHardLongShape(rng, mode) {
    // Palette of HARD shapes matching the failing ParseBench profile. Each is
    // rendered single-page (hardlong -> doc.huge false). Reuses the existing
    // decide*Shape functions where a correct prompt already exists.
    const kind = (mode && !["mix", "1", "true"].includes(mode))
        ? mode
        : rng.weighted([
            ["tall", 2], ["wide", 2], ["multi", 2], ["panels", 1.5],
            ["merged", 1.5], ["form", 1.5], ["triangle", 1.5], ["matrix", 1], ["complex", 1],
        ]);
    let shape;
    if (kind === "tall") {
        // tall-narrow rate/premium schedule (SERFF): 2-3 cols x 180-260 rows.
        shape = {
            sectionsWanted: 1, cols: rng.weighted([[2, 2], [3, 3]]),
            rows: rng.weighted([[180, 2], [220, 3], [260, 3]]),
            wantTitle: rng.bool(0.6), wantGroups: false, complex: false, dense: false, extreme: false, huge: true,
        };
    } else if (kind === "wide") {
        // wide dense numeric grid (rating factors): 12-24 cols x 50-80 rows.
        shape = {
            sectionsWanted: 1, cols: rng.weighted([[12, 2], [14, 3], [16, 3], [20, 2], [24, 1]]),
            rows: rng.weighted([[50, 2], [60, 3], [70, 2], [80, 1]]),
            wantTitle: rng.bool(0.6), wantGroups: rng.bool(0.3), complex: false, dense: false, extreme: false, huge: true,
        };
    } else if (kind === "triangle") {
        // actuarial loss-development TRIANGLE: wide numeric, content fills the
        // upper-left triangle (rest empty -> the "incomplete" look).
        const tc = rng.weighted([[14, 2], [16, 3], [18, 2], [20, 1]]);
        shape = {
            sectionsWanted: 1, cols: tc, rows: tc + rng.int(2, 8),
            wantTitle: rng.bool(0.6), wantGroups: false, complex: false, dense: false, extreme: false,
            huge: true, triangle: true,
        };
    } else if (kind === "multi") {
        // 2-3 distinct tables STACKED on one page (multiple sections).
        shape = {
            sectionsWanted: rng.weighted([[2, 3], [3, 2]]), cols: rng.weighted([[5, 2], [6, 3], [7, 2], [8, 1]]),
            rows: rng.weighted([[16, 2], [22, 3], [28, 2]]),
            wantTitle: rng.bool(0.5), wantGroups: rng.bool(0.4), complex: rng.bool(0.5), dense: false, extreme: false, huge: false,
        };
    } else if (kind === "panels") {
        shape = decidePanelsShape(rng);                 // N-up grid of small tables
    } else if (kind === "merged") {
        shape = decideExtremeShape(rng);                // 3-tier headers + subheaders + subtotals
        shape.rows = rng.weighted([[28, 2], [40, 3], [55, 2], [70, 1]]);
    } else if (kind === "form") {
        shape = decideFormShape(rng);                   // empty/XXX fill-in form grid
        shape.rows = rng.weighted([[14, 2], [20, 3], [28, 2]]);
    } else if (kind === "matrix") {
        shape = decideMatrixShape(rng);                 // sparse intersection grid
        shape.cols = rng.weighted([[8, 2], [10, 3], [12, 2], [14, 1]]);
        shape.rows = rng.weighted([[18, 2], [26, 3], [34, 1]]);
    } else {
        shape = decideComplexCellsShape(rng);           // multi-line / merged body cells
        shape.rows = rng.weighted([[10, 2], [14, 3], [18, 1]]);
    }
    shape.hardlong = true;   // -> rendered single-page (doc.huge forced false below)
    return shape;
}

// An extremely complex table: 3-tier nested header, rowspan row-groups, section
// subheaders, subtotals, footnote markers.
function decideExtremeShape(rng) {
    return {
        sectionsWanted: 1,
        cols: rng.weighted([[4, 2], [5, 3], [6, 3], [7, 2], [8, 1]]),
        rows: rng.weighted([[10, 2], [14, 3], [18, 3], [22, 1]]),
        wantTitle: rng.bool(0.6),
        wantGroups: true,
        complex: true,
        dense: false,
        extreme: true,
    };
}

// A dense full-page table: one large table that fills the whole page, with
// little surrounding prose (rate sheets / filings / timetables).
function decideDenseShape(rng) {
    return {
        sectionsWanted: 1,
        cols: rng.weighted([[3, 2], [4, 3], [5, 3], [6, 3], [7, 2], [8, 1]]),
        rows: rng.weighted([[30, 2], [38, 3], [46, 3], [55, 2]]),
        wantTitle: rng.bool(0.5),
        wantGroups: rng.bool(0.3),
        complex: rng.bool(0.25),
        dense: true,
        extreme: false,
    };
}

// A table whose BODY cells are structurally rich (not just the header): cells
// hold multiple lines / fields (address, contact, value + note), emphasis and
// footnote markers — the kind of complexity that lives inside data cells.
function decideComplexCellsShape(rng) {
    return {
        sectionsWanted: 1,
        cols: rng.weighted([[4, 2], [5, 3], [6, 3], [7, 1]]),
        rows: rng.weighted([[6, 2], [8, 3], [10, 3], [12, 1]]),
        wantTitle: rng.bool(0.5),
        wantGroups: rng.bool(0.3),
        complex: false,
        dense: false,
        extreme: false,
        complexCells: true,
    };
}

// A cross-tabulation / matrix: a row axis meets a column axis, each body cell is
// a MARK (check / dot / +- / small value) at the intersection, usually sparse,
// with a labelled top-left corner. Covers checklist/skills/membership matrices,
// timetables and comparison grids — the single most common shape the generator
// could not previously produce.
function decideMatrixShape(rng) {
    return {
        sectionsWanted: 1,
        cols: rng.weighted([[5, 2], [6, 3], [7, 3], [8, 2], [9, 1], [10, 1], [12, 1]]),
        rows: rng.weighted([[6, 2], [8, 3], [10, 3], [12, 2], [14, 1]]),
        wantTitle: rng.bool(0.5),
        wantGroups: false,
        complex: false,
        dense: false,
        extreme: false,
        matrix: true,
        matrixMarker: rng.pick(["check", "dot", "cross", "plusminus", "yesno", "value"]),
        rotatedHeaders: rng.bool(0.6),
    };
}

// A center-label-spine table: the row-LABEL column sits in the MIDDLE, with
// comparative numeric columns flanking it on BOTH sides (e.g. current-period
// figures left of the metric name, prior-period / cumulative figures right).
// Common in European interim reports (OMV/Kennzahlen style).
function decideSpineShape(rng) {
    return {
        sectionsWanted: 1,
        cols: rng.weighted([[5, 2], [6, 3], [7, 3], [8, 1]]),
        rows: rng.weighted([[6, 2], [8, 3], [10, 3], [12, 1]]),
        wantTitle: rng.bool(0.5),
        wantGroups: false,
        complex: false,
        dense: false,
        extreme: false,
        spine: true,
    };
}

// An official FORM / regulatory return: a labelled fill-in FIELD BLOCK (key:value
// pairs in boxed fields) plus a NUMBERED line-item grid with intentionally empty
// and "XXX" (not-applicable) cells — e.g. an insurance annual statement, a tax or
// registration form, an enrollment/claim form.
function decideFormShape(rng) {
    return {
        sectionsWanted: 2,
        cols: rng.weighted([[5, 2], [6, 3], [7, 3], [8, 2], [10, 1], [12, 1]]),
        rows: rng.weighted([[6, 2], [8, 3], [10, 3], [12, 2]]),
        wantTitle: rng.bool(0.35),
        wantGroups: rng.bool(0.4),
        complex: false,
        dense: false,
        extreme: false,
        form: true,
        numberedCols: rng.bool(0.7),
    };
}

export async function generateLlmDoc(rng, opts = {}) {
    const domain = pickDomain(rng);
    // textFocus -> prose document; forceNormal (chart run) -> always a normal,
    // chart-eligible shape; otherwise a weighted mix (more dense docs now).
    let shape;
    // HARD-LONG training-data hook: TG_HARDLONG=tall|wide|mix forces big
    // single-page programmatic tables in the trainable cell-count zone.
    const HARDLONG = process.env.TG_HARDLONG;
    // Test hook: TG_FORCE_COMPLEXCELLS=1 forces every doc onto the complex-cells
    // shape so the ~10% merged-cell path can be exercised deterministically.
    if (HARDLONG) {
        shape = decideHardLongShape(rng, HARDLONG);
    } else if (process.env.TG_FORCE_COMPLEXCELLS) {
        shape = decideComplexCellsShape(rng);
    } else if (opts.textFocus) {
        shape = decideTextShape(rng);
    } else if (opts.presentation) {
        shape = decideShape(rng);
        shape.sectionsWanted = 1;
        shape.cols = rng.weighted([[4, 3], [5, 4], [6, 3]]);
        shape.rows = rng.weighted([[5, 2], [6, 3], [7, 3], [8, 2]]);
        shape.wantTitle = false;
        shape.wantGroups = rng.bool(0.15);
        shape.complex = false;
        shape.dense = false;
        shape.extreme = false;
    } else {
        const roll = opts.forceNormal ? 1 : rng();
        // "huge" tables are the only shape that spans multiple pages. They are
        // off by default (single-page docs); --multipage re-enables them. When
        // off, the huge band falls through to the (single-page) extreme shape.
        shape = roll < 0.06 ? decidePanelsShape(rng)
            : roll < 0.15 ? decideMatrixShape(rng)
                : roll < 0.20 ? decideSpineShape(rng)
                    : roll < 0.25 ? decideFormShape(rng)
                        : (roll < 0.31 && opts.allowMultipage) ? decideHugeShape(rng)
                            : roll < 0.39 ? decideExtremeShape(rng)
                                : roll < 0.48 ? decideComplexCellsShape(rng)
                                    : roll < 0.64 ? decideDenseShape(rng)
                                        : decideShape(rng);
    }
    shape.flavor = pickFlavor(rng, opts.languageMix);
    // A fraction of dense, table-dominant docs are rendered as a CONTINUATION
    // fragment: a bare data grid with no column header (the header appeared on an
    // earlier page). Real multi-page reports produce these headerless tables, and
    // the generator otherwise always emits a header — so without this the dataset
    // has zero headerless tables. Only for dense single-table docs, where a
    // headerless grid reads naturally.
    shape.headerless = shape.dense && !shape.panels && !shape.textFocus && rng.bool(0.18);
    // Wide domains (timesheets, earnings slides) are big tables — but not when
    // we've chosen an N-up panel layout (which needs several sections).
    if (domain.wide && !shape.panels && !shape.textFocus) {
        shape.sectionsWanted = 1;
        shape.cols = rng.weighted([[7, 2], [8, 3], [9, 2], [10, 2], [12, 1]]);
        shape.rows = rng.weighted([[12, 2], [16, 3], [22, 2], [28, 1]]);
        shape.dense = false;
        shape.extreme = false;
        // Wide tables exist in portrait too (narrow numeric columns fit fine), so
        // don't force landscape — scale the odds by width: a 7-col table is
        // usually portrait, a 12-col one usually landscape.
        shape.landscape = rng.bool(Math.min(0.85, 0.35 + (shape.cols - 7) * 0.1));
    }
    const prompt = buildDocPrompt(domain, { ...shape, presentation: Boolean(opts.presentation), presentationLayout: opts.presentationLayout || "" });

    const data = await geminiJson({
        prompt,
        schema: DOC_SCHEMA,
        temperature: 1.0,
    });
    const maxRows = shape.hardlong ? 400 : shape.huge ? 220 : shape.dense ? 60 : shape.landscape ? 40 : 24;

    // Cap prose so docs stay single-page at a readable scale.
    const asParas = (v, max) => (Array.isArray(v) ? v.map((p) => String(p || "")).filter((p) => p.trim()) : (v ? [String(v)] : [])).slice(0, max);

    // Dense docs keep the table dominant (little prose); text docs are the
    // opposite — lots of prose, tables optional. For the rest, vary the
    // prose:table ratio PER DOC — lean (table-dominant, minimal prose) ↔ rich
    // (prose-heavy) — so docs differ in how much narrative surrounds the table
    // (this also diversifies multi-column use and how fully the page fills).
    let proseLevel = (shape.textFocus || shape.dense) ? "fixed" : rng.weighted([["lean", 3], ["normal", 4], ["rich", 3]]);
    // A SMALL table can't fill a page on its own, so a lean (prose-starved) doc
    // around it would leave most of the page blank — give small-table docs more
    // prose. Lean is reserved for big tables that carry the page themselves.
    if (proseLevel === "lean" && (Number(shape.rows) || 0) < 14) {
        proseLevel = rng.bool(0.5) ? "normal" : "rich";
    }
    const lvl = (lean, normal, rich) => (proseLevel === "lean" ? lean : proseLevel === "rich" ? rich : normal);
    const leadMax = opts.presentation ? 1 : shape.textFocus ? 4 : shape.dense ? 1 : lvl(1, 2, 3);
    const trailMax = opts.presentation ? 0 : shape.textFocus ? 3 : shape.dense ? 0 : lvl(0, 2, 3);
    const bulletMax = opts.presentation ? 4 : shape.dense ? 0 : lvl(2, 5, 6);
    const introMax = opts.presentation ? 1 : shape.textFocus ? 3 : shape.dense ? 1 : lvl(1, 2, 3);
    const conclMax = opts.presentation ? 0 : (shape.textFocus) ? 3 : (shape.dense) ? 0 : lvl(0, 2, 3);

    const sections = [];
    let keptTextFocusTable = false;
    const textFocusTableRate = Number.isFinite(opts.tableFocus) ? Math.max(0, Math.min(1, opts.tableFocus)) : 1;
    for (const s of Array.isArray(data.sections) ? data.sections : []) {
        // hard-long: pin the programmatic row count to the target size (don't
        // trust the LLM's rowCount) so cell count lands in the trainable zone.
        if (shape.hardlong && s && s.table && s.table.generator) { s.table.generator.rowCount = shape.rows; }
        let model = modelFromSection(s.table || {}, { maxRows, rowspan: shape.extreme || shape.complexCells, rng, useGenerator: shape.huge, headerless: shape.headerless, matrix: shape.matrix, rotatedHeaders: shape.rotatedHeaders, spine: shape.spine, form: shape.form, numberedCols: shape.numberedCols, triangle: shape.triangle });
        if (shape.textFocus && model) {
            if (keptTextFocusTable || !rng.bool(textFocusTableRate)) {
                model = null;
            } else {
                keptTextFocusTable = true;
            }
        }
        // text-focus keeps text-only sections (no table); table docs require a table.
        if (model || shape.textFocus) {
            sections.push({
                heading: String(s.heading || ""),
                lead: asParas(s.lead, leadMax),
                trailing: asParas(s.trailing, trailMax),
                bullets: (Array.isArray(s.bullets) ? s.bullets.map((b) => String(b || "")).filter((b) => b.trim()) : []).slice(0, bulletMax),
                model: model || null,
            });
        }
    }
    const hasContent = shape.textFocus ? sections.some((s) => s.lead.length || s.heading) : sections.some((s) => s.model);
    if (!hasContent) {
        throw new Error("Gemini returned no usable content");
    }

    return {
        domain: domain.key,
        docTitle: String(data.docTitle || ""),
        subtitle: String(data.subtitle || ""),
        dateline: String(data.dateline || ""),
        chartType: String(data.chartType || ""),
        intro: asParas(data.intro, introMax),
        sections,
        conclusion: conclMax ? asParas(data.conclusion, conclMax) : [],
        footnote: String(data.footnote || ""),
        flags: aggregateFlags(sections.map((s) => s.model).filter(Boolean)),
        dense: shape.dense,
        landscape: Boolean(shape.landscape),
        // hard-long uses the huge generator-fill but renders single-page (so the
        // GT matches the one rasterized image): keep doc.huge false for it.
        huge: Boolean(shape.huge) && !shape.hardlong,
        hardlong: Boolean(shape.hardlong),
        textFocus: Boolean(shape.textFocus),
        // need >=2 surviving sections for a real N-up grid; else fall back to flow
        panels: (shape.panels && sections.length >= 2) ? Math.min(shape.panels, sections.length) : 0,
        presentationLayout: opts.presentationLayout || null,
        source: "llm",
    };
}

// Procedural fallback: 1-2 tables embedded in random-but-plausible prose.
export function generateProceduralDoc(rng, opts = {}) {
    const n = rng.weighted([[1, 7], [2, 2]]);
    const paras = (a, b) => Array.from({ length: rng.int(a, b) }, () => lorem(rng, rng.int(3, 5)));
    const sections = [];
    for (let i = 0; i < n; i++) {
        const model = generateTableModel(rng, { structureBoost: opts.structureBoost });
        sections.push({
            heading: n > 1 ? lorem(rng, 1).replace(/\.$/, "") : "",
            lead: paras(1, 2),
            trailing: rng.bool(0.7) ? paras(1, 2) : [],
            bullets: rng.bool(0.3) ? Array.from({ length: rng.int(2, 4) }, () => lorem(rng, 1)) : [],
            model,
        });
    }
    return {
        domain: "procedural",
        docTitle: randomDocTitle(rng),
        subtitle: rng.bool(0.4) ? lorem(rng, 1).replace(/\.$/, "") : "",
        dateline: "",
        intro: paras(1, 2),
        sections,
        conclusion: rng.bool(0.6) ? paras(1, 1) : [],
        footnote: rng.bool(0.5) ? lorem(rng, 1) : "",
        flags: aggregateFlags(sections.map((s) => s.model)),
        source: "procedural",
    };
}

// ---- hard-miss section injection (--hard-table-mix variants) ---------------
// Insert the table shapes real detectors miss (complexity-100 miss mining)
// into an already-built doc — works for both LLM and procedural content.
// variant: "labelValue" | "codeListing" | "stackedPair".
export function injectHardSections(doc, rng, variant) {
    if (!doc || doc.huge || doc.presentation || !Array.isArray(doc.sections)) { return doc; }
    if (variant === "labelValue") {
        const n = rng.bool(0.4) ? 2 : 1;
        for (let i = 0; i < n; i++) {
            const sec = {
                heading: rng.pick(["", "", "Technical Features", "Materials and Requirements"]),
                lead: rng.bool(0.7) ? [lorem(rng, rng.int(1, 3))] : [],
                trailing: rng.bool(0.4) ? [lorem(rng, rng.int(1, 2))] : [],
                bullets: [],
                model: generateLabelValueModel(rng),
            };
            doc.sections.splice(rng.int(0, doc.sections.length), 0, sec);
        }
    } else if (variant === "codeListing") {
        const model = generateCodeListingModel(rng);
        const heading = model.flags.layout_style.includes("ipc")
            ? rng.pick(["Publication Classification", "Int. Cl.", ""])
            : rng.pick(["References Cited", "U.S. Patent Documents", ""]);
        doc.sections.splice(rng.int(0, doc.sections.length), 0, {
            heading, lead: rng.bool(0.4) ? [lorem(rng, 1)] : [], trailing: [], bullets: [], model,
        });
    } else if (variant === "stackedPair") {
        const idx = doc.sections.findIndex((s) => s.model && !s.model.headerless);
        if (idx >= 0) {
            const pair = splitStackedPair(doc.sections[idx].model, rng);
            if (pair) {
                const orig = doc.sections[idx];
                doc.sections.splice(idx, 1,
                    { ...orig, model: pair[0], trailing: [], bullets: [] },
                    { heading: "", lead: [], trailing: orig.trailing || [], bullets: orig.bullets || [], model: pair[1] });
            }
        }
    }
    const models = doc.sections.map((s) => s.model).filter(Boolean);
    doc.flags = { ...aggregateFlags(models), layout_style: variant };
    return doc;
}

// ---- delta-class section injection (--delta-mix) ---------------------------
// Insert 1-2 heron delta-class components (checkbox groups, key-value regions,
// fill-in forms, code blocks, contents/index blocks) into an already-built doc.
export function injectDeltaSections(doc, rng, kinds) {
    if (!doc || doc.huge || doc.presentation || !Array.isArray(doc.sections)) { return doc; }
    for (const kind of kinds) {
        const block = generateDeltaBlock(rng, kind);
        const heading = kind === "form" || kind === "toc" ? "" : rng.bool(0.3) ? lorem(rng, 1).replace(/\.$/, "") : "";
        doc.sections.splice(rng.int(0, doc.sections.length), 0, {
            heading,
            lead: rng.bool(0.5) ? [lorem(rng, rng.int(1, 2))] : [],
            trailing: [],
            bullets: [],
            model: null,
            delta: block,
        });
    }
    doc.flags = { ...(doc.flags || {}), delta_components: kinds };
    return doc;
}
