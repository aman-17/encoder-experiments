// CLI: generate a synthetic single-page table dataset.
//
//   node generateTables.mjs --out <dir> [--count 50] [--seed N]
//        [--templates <dir>] [--llm-concurrency 50] [--render-concurrency 6]
//        [--no-llm] [--clean]
//
// Phase 1 (content): for each doc, ask Gemini 3.1 Flash Lite for credible
//   domain content (one or more tables) — fanned out up to --llm-concurrency.
//   Falls back to procedural content on failure or with --no-llm.
// Phase 2 (render): render each doc to PDF via headless Chrome and write the
//   matching ground-truth rule file (tables_extended format; multiple tables
//   are joined into one expected_markdown).

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { makeRng } from "./rng.mjs";
import { documentHtml, docGroundTruth } from "./render.mjs";
import { textTest, layoutTest, pageMarkdown, measureElements, measureChartSvgs } from "./groundTruth.mjs";
import { chartDataPoints, chartGoldMarkdown, chartPixelsSidecar } from "./figure.mjs";
import { pickLocale } from "./locales.mjs";
import { pickDocStyle, pickSlideTheme } from "./docstyle.mjs";
const CHARTS_ONLY = process.env.CG_CHARTS_ONLY === "1" || process.env.CG_CHARTS_ONLY === "true";
// CG_SLIDE: PowerPoint-slide-styled docs on a 16:9 widescreen page.
const SLIDE = process.env.CG_SLIDE === "1" || process.env.CG_SLIDE === "true";
// CG_ROTATE: rotate the main table/chart on the page (90°/270°, some skew).
const ROTATE = process.env.CG_ROTATE === "1" || process.env.CG_ROTATE === "true";
import { randomTemplate, loadTemplates, varyTemplate } from "./template.mjs";
import { generateLlmDoc, generateProceduralDoc } from "./llmContent.mjs";
import { hasGeminiKey, mapPool } from "./gemini.mjs";

function parseArgs(argv) {
    const a = { count: 50, seed: null, out: null, templatesDir: null, llmConcurrency: 50, renderConcurrency: 6, noLlm: false, clean: false, noHtml: false };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--out") { a.out = v(); }
        else if (k === "--count") { a.count = Number(v()); }
        else if (k === "--seed") { a.seed = Number(v()); }
        else if (k === "--templates") { a.templatesDir = v(); }
        else if (k === "--llm-concurrency") { a.llmConcurrency = Math.max(1, Number(v())); }
        else if (k === "--render-concurrency") { a.renderConcurrency = Math.max(1, Number(v())); }
        else if (k === "--no-llm") { a.noLlm = true; }
        else if (k === "--no-html") { a.noHtml = true; }
        else if (k === "--tests") { a.tests = v(); }
        else if (k === "--chart-focus") { a.chartFocus = Number(v()); }
        else if (k === "--text-focus") { a.textFocus = Number(v()); }
        else if (k === "--clean") { a.clean = true; }
        else if (k === "--multipage") { a.multipage = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    a.tests = (a.tests || "table").split(",").map((s) => s.trim()).filter(Boolean);
    // chart-focused doc ratio: default to all docs when chart tests are requested.
    if (a.chartFocus == null) { a.chartFocus = a.tests.includes("chart") ? 1 : 0; }
    // text-focused (prose-heavy) ratio: default to all when only text/layout requested.
    if (a.textFocus == null) { a.textFocus = (a.tests.includes("text") && !a.tests.includes("table") && !a.tests.includes("chart")) ? 1 : 0; }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    if (a.seed == null) { a.seed = (Date.now() & 0x7fffffff) >>> 0; }
    return a;
}

// The in-repo template bank, used by default so generation always draws from
// pre-extracted real-PDF styles.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_BANK = path.join(HERE, "templates");

function resolveExecutablePath() {
    const candidates = [];
    if (process.env.PUPPETEER_EXECUTABLE_PATH) { candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH); }
    if (process.platform === "darwin") {
        candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
        candidates.push("/Applications/Chromium.app/Contents/MacOS/Chromium");
    } else {
        candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");
    }
    const cacheRoot = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
    if (fssync.existsSync(cacheRoot)) {
        for (const ver of fssync.readdirSync(cacheRoot).sort().reverse()) {
            candidates.push(path.join(cacheRoot, ver, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
            candidates.push(path.join(cacheRoot, ver, "chrome-linux64", "chrome"));
        }
    }
    return candidates.find((p) => p && fssync.existsSync(p)) || null;
}

async function launchBrowser() {
    const execPath = resolveExecutablePath();
    const args = ["--no-sandbox", "--font-render-hinting=none"];
    try {
        const browser = await puppeteer.launch(execPath ? { headless: "new", executablePath: execPath, args } : { headless: "new", args });
        return { browser, execPath: execPath || "(puppeteer default)" };
    } catch {
        const browser = await puppeteer.launch({ channel: "chrome", headless: "new", args });
        return { browser, execPath: "channel:chrome" };
    }
}

const deriveSeed = (base, i) => (base ^ Math.imul(i + 1, 2654435761)) >>> 0;

// Target page is always A4. The margin is applied as full-bleed body padding
// (see render.mjs), so the page itself has no print margin and the measured
// area is the whole A4 sheet (dimensions swap in landscape).
const A4 = { w: 8.27, h: 11.69 };
// CG_SLIDE: US-widescreen 16:9 PowerPoint slide (1280x720 css px at 96dpi).
const SLIDE_PAGE = { w: 13.333, h: 7.5 };

function pagePx(landscape) {
    if (SLIDE) {
        return { w: Math.round(SLIDE_PAGE.w * 96), h: Math.round(SLIDE_PAGE.h * 96) };
    }
    const w = landscape ? A4.h : A4.w;
    const h = landscape ? A4.w : A4.h;
    return { w: Math.round(w * 96), h: Math.round(h * 96) };
}

// CG_SLIDE: bound a table model to slide-legible size — at most 5-14 body rows
// and 7 columns, like a real deck table. Mutates the MODEL in phase 1, before
// BOTH render and ground truth are derived from it, so the gold contract
// (gold == the plotted/printed model) is untouched.
function boundSlideModel(model, rng) {
    const maxBody = rng.int(5, 14);
    const maxCols = 7;
    let rows = [];
    let body = 0;
    for (const row of model.rows) {
        const isBody = row.some((c) => c.tag === "td");
        if (isBody && body >= maxBody) { continue; }
        if (isBody) { body += 1; }
        rows.push(row);
    }
    // clamp rowspans that now extend past the truncated end
    rows = rows.map((row, i) => row.map((c) => ((c.rowspan || 1) > 1 && i + c.rowspan > rows.length) ? { ...c, rowspan: rows.length - i } : c));
    let ncols = model.ncols;
    // Column truncation is only safe on span-simple grids: a row that FOLLOWS a
    // rowspan cell starts at column 1, so a per-row colspan clamp would shear it.
    const hasRowspan = rows.some((r) => r.some((c) => (c.rowspan || 1) > 1));
    if (ncols > maxCols && !hasRowspan) {
        rows = rows.map((row) => {
            const out = [];
            let used = 0;
            for (const c of row) {
                if (used >= maxCols) { break; }
                const span = Math.max(1, c.colspan || 1);
                out.push(used + span > maxCols ? { ...c, colspan: maxCols - used } : c);
                used += span;
            }
            return out;
        });
        ncols = maxCols;
    }
    return { ...model, rows, ncols, nrows: body };
}

// CG_SLIDE: reshape a generated doc into a single slide — one section, terse
// prose, a slide-sized table. Everything mutated here feeds both the render
// AND the ground truth, so the golds stay exact.
function prepareSlideDoc(doc, rng) {
    doc.dense = false; doc.huge = false; doc.hardlong = false; doc.panels = 0;
    doc.landscape = false; doc.textFocus = false;
    const sec = doc.sections.find((s) => s.model) || doc.sections[0];
    if (sec) {
        if (sec.model) { sec.model = boundSlideModel(sec.model, rng); }
        sec.lead = (sec.lead || []).slice(0, 1);
        sec.trailing = [];
        sec.bullets = (sec.bullets || []).slice(0, 4);
        doc.sections = [sec];
    }
    doc.intro = (doc.intro || []).slice(0, 1);
    doc.conclusion = [];
}

// Compute a print scale so the natural content fits on a single page. Must be
// called AFTER the viewport is set to the printable width (so the measured
// layout matches what gets printed). Returns 1 when it already fits.
async function fitScale(page, printH, printW) {
    const { sw, sh } = await page.evaluate(() => ({ sw: document.body.scrollWidth, sh: document.body.scrollHeight }));
    const z = Math.min(printW / sw, printH / sh);
    // Shrink to fit when content overflows; scale up gently (cap 1.18) when it's
    // much smaller than the page, to reduce big empty bottoms.
    if (z >= 1) {
        return Math.min(1.18, z);
    }
    return Math.max(0.1, z * 0.95);
}

// --multipage: instead of emitting a whole multi-page "huge" doc (or always its
// first page), emit ONE RANDOM page of it as a standalone single page. We slice
// the table to that page's worth of rows (header rows + a window of body rows)
// and re-render as a single page, so the ground truth matches exactly. Mutates
// `doc` in place (its model + first-page-only prose) so downstream GT/gen.json
// reflect the emitted page. Returns { pdf, scale } or null to keep the original.
async function emitRandomPage({ doc, template, rng, id, browser, pdfOpts, printH, printW, pageCount }) {
    const sec = doc.sections.find((s) => s.model);
    if (!sec) { return null; }
    const model = sec.model;
    const head = model.rows.filter((r) => r.every((c) => c.tag === "th"));
    const body = model.rows.filter((r) => r.some((c) => c.tag === "td"));
    if (body.length < 2) { return null; }
    const rowsPerPage = Math.ceil(body.length / pageCount);
    const p = rng.int(0, pageCount - 1);
    const pageBody = body.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    if (!pageBody.length) { return null; }
    // Real continuation pages vary: some repeat the column header, some are
    // headerless (the header only appeared on page 1). Drop the header on ~55% of
    // continuation pages (p>0) so the dataset includes genuine headerless tables.
    const keepHead = p === 0 || rng.bool(0.45);
    sec.model = { ...model, rows: [...(keepHead ? head : []), ...pageBody], nrows: pageBody.length, headerless: !keepHead };
    // A continuation page (p>0) carries no intro/lead prose — just the table.
    if (p > 0) { doc.intro = []; sec.lead = []; sec.trailing = []; doc.conclusion = []; }
    doc.huge = false;
    doc.pageInfo = { page: p + 1, of: pageCount };
    const { html } = documentHtml(doc, template, rng, id);
    // Render on a FRESH page (re-setContent on the just-pdf'd page hangs on
    // networkidle0); this mirrors the working first-render path.
    const p2 = await browser.newPage();
    try {
        await p2.setViewport({ width: printW, height: printH, deviceScaleFactor: 1 });
        await p2.setContent(html, { waitUntil: "networkidle0" });
        let scale = await fitScale(p2, printH, printW);
        let pdf = await p2.pdf(pdfOpts(scale));
        for (let attempt = 0; attempt < 5; attempt++) {
            if ((await PDFDocument.load(pdf)).getPageCount() <= 1 || scale <= 0.29) { break; }
            scale = Math.max(0.28, scale * 0.88);
            pdf = await p2.pdf(pdfOpts(scale));
        }
        return { pdf, scale };
    } finally {
        await p2.close();
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const outDir = path.resolve(args.out.replace(/^~/, os.homedir()));
    const useLlm = !args.noLlm && hasGeminiKey();
    if (!args.noLlm && !useLlm) {
        console.error("! GOOGLE_GEMINI_API_KEY not set — falling back to procedural content. Use --no-llm to silence.");
    }

    const templatesDir = args.templatesDir || (fssync.existsSync(DEFAULT_TEMPLATE_BANK) ? DEFAULT_TEMPLATE_BANK : null);
    const templates = templatesDir ? loadTemplates(templatesDir) : [];
    if (templatesDir) {
        console.error(`Loaded ${templates.length} style template(s) from ${templatesDir}`);
    }
    if (templates.length === 0) {
        console.error("! No pre-extracted templates found — using synthesized styles. Run ./extracttemplates first.");
    }

    const srcDir = path.join(outDir, "src");
    if (args.clean && fssync.existsSync(outDir)) {
        for (const f of fssync.readdirSync(outDir)) {
            if (f.endsWith(".pdf") || f.endsWith(".test.json")) { fssync.rmSync(path.join(outDir, f)); }
        }
        if (!args.noHtml) {
            fssync.rmSync(srcDir, { recursive: true, force: true });
        }
    }
    await fs.mkdir(outDir, { recursive: true });
    if (!args.noHtml) {
        await fs.mkdir(srcDir, { recursive: true });
    }

    // Sibling dataset folders for the other test types (same PDFs, different
    // ground truth), in the format of each benchmark.
    const wantText = args.tests.includes("text");
    const wantLayout = args.tests.includes("layout");
    const wantChart = args.tests.includes("chart");
    const textDir = `${outDir}-text`;
    const layoutDir = `${outDir}-layout`;
    const chartDir = `${outDir}-charts`;
    for (const [on, dir] of [[wantText, textDir], [wantLayout, layoutDir], [wantChart, chartDir]]) {
        if (!on) { continue; }
        if (args.clean && fssync.existsSync(dir)) {
            for (const f of fssync.readdirSync(dir)) {
                if (f.endsWith(".pdf") || f.endsWith(".test.json") || f.endsWith(".md")) { fssync.rmSync(path.join(dir, f)); }
            }
        }
        await fs.mkdir(dir, { recursive: true });
    }
    if (wantText || wantLayout || wantChart) {
        console.error(`Also emitting: ${args.tests.filter((t) => t !== "table").join(", ")}${args.chartFocus ? ` (chart-focus=${args.chartFocus})` : ""}`);
    }

    // Phase 1: content (Gemini fan-out).
    console.error(`Phase 1: content for ${args.count} docs (${useLlm ? `Gemini, concurrency=${args.llmConcurrency}` : "procedural"})`);
    const indices = Array.from({ length: args.count }, (_, i) => i);
    let llmOk = 0;
    let fellBack = 0;

    const prepared = await mapPool(indices, useLlm ? args.llmConcurrency : args.count, async (i) => {
        const rng = makeRng(deriveSeed(args.seed, i));
        // For visual variety: ~60% a jittered real-PDF template from the bank,
        // ~40% a fully synthesized (colorful, varied) style. Falls back to
        // synthesized when the bank is empty.
        let template;
        if (templates.length && rng.bool(0.6)) {
            template = varyTemplate(templates[Math.floor(rng() * templates.length)], rng);
        } else {
            template = randomTemplate(rng);
        }
        let doc;
        const locale = pickLocale(rng);
        const docOpts = { forceNormal: args.chartFocus >= 0.99, textFocus: args.textFocus >= 1 ? true : (args.textFocus > 0 ? rng.bool(args.textFocus) : false), allowMultipage: Boolean(args.multipage), locale };
        if (useLlm) {
            // Prefer real LLM prose for paragraphs; retry once before the
            // procedural fallback (which has no real paragraphs).
            try {
                doc = await generateLlmDoc(rng, docOpts);
                llmOk += 1;
            } catch {
                try {
                    doc = await generateLlmDoc(rng, docOpts);
                    llmOk += 1;
                } catch {
                    doc = generateProceduralDoc(rng);
                    fellBack += 1;
                }
            }
        } else {
            doc = generateProceduralDoc(rng);
        }
        if (SLIDE && doc) { prepareSlideDoc(doc, rng); }
        if (doc && args.chartFocus > 0 && !doc.dense && !doc.huge && !doc.panels) {
            doc.chartFocus = rng.bool(args.chartFocus);
        }
        if (doc) {
            doc.locale = locale;
            doc.chartsOnly = CHARTS_ONLY;
            if (process.env.CG_DOCSTYLE) { doc.docStyle = pickDocStyle(rng, doc.domain); }
        }
        if (SLIDE && doc) {
            doc.slide = true;
            doc.docStyle = pickSlideTheme(rng);
            // Pure chart-slides: ~60% of chart-focus slides drop the table
            // entirely (chart gold only, like CG_CHARTS_ONLY per-doc); the rest
            // keep table + chart side by side, emitting BOTH golds.
            if (doc.chartFocus && !doc.chartsOnly) { doc.chartsOnly = rng.bool(0.6); }
        }
        if (ROTATE && doc && !doc.huge && !doc.panels) {
            // Separate rng stream: the content rng is untouched, so a run with
            // CG_ROTATE toggled emits byte-identical ground truth.
            const rr = makeRng(deriveSeed(deriveSeed(args.seed, i), 1));
            doc.rotate = rr.bool(0.15)
                ? { mode: "skew", deg: rr.float(1.5, 4, 1) * (rr.bool() ? 1 : -1) }
                : { mode: "turn", deg: rr.pick([90, 270]) };
        }
        return { i, rng, template, doc };
    }, (done, total) => {
        if (done % 25 === 0 || done === total) { console.error(`  content ${done}/${total}`); }
    });

    if (useLlm) {
        console.error(`  Gemini ok=${llmOk} fallback=${fellBack}`);
    }

    // Phase 2: render PDFs.
    console.error(`Phase 2: render (concurrency=${args.renderConcurrency})`);
    const { browser, execPath } = await launchBrowser();
    console.error(`  Chrome: ${execPath}`);

    const stats = { easy: 0, medium: 0, hard: 0, multiTable: 0, twoCol: 0, byDomain: {} };
    await mapPool(prepared, args.renderConcurrency, async ({ i, rng, template, doc }) => {
        const id = `synth_${(args.seed >>> 0).toString(36)}_${String(i + 1).padStart(4, "0")}`;
        const landscape = Boolean(doc.landscape) || template.page.orientation === "landscape";
        const { html, figures, figGeoms } = documentHtml(doc, template, rng, id);
        const page = await browser.newPage();
        let pageCount = 1;
        let finalScale = 1;
        let measured = null;
        let chartRects = null;
        const { w: printW, h: printH } = pagePx(landscape);
        try {
            // Measure at the true A4 page size so the fit matches the print layout.
            await page.setViewport({ width: printW, height: printH, deviceScaleFactor: 1 });
            await page.setContent(html, { waitUntil: "networkidle0" });
            // CG_SLIDE prints on a fixed 16:9 widescreen sheet (no A4 format).
            const pdfOpts = (scale) => (SLIDE
                ? {
                    printBackground: true,
                    width: `${SLIDE_PAGE.w}in`,
                    height: `${SLIDE_PAGE.h}in`,
                    margin: { top: 0, bottom: 0, left: 0, right: 0 },
                    scale,
                }
                : {
                    printBackground: true,
                    format: "A4",
                    landscape,
                    margin: { top: 0, bottom: 0, left: 0, right: 0 },
                    scale,
                });
            let pdf;
            if (doc.huge) {
                // Huge dense tables span multiple pages. Use real page margins +
                // a repeating footer (page X of Y on EVERY page), and fit the
                // table to the printable width.
                const m = 0.5;
                const escH = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const ftxt = escH((doc.subtitle || doc.docTitle || "").slice(0, 70));
                const footerTemplate = `<div style="font-size:8px;color:#888;width:100%;padding:0 ${m}in;display:flex;justify-content:space-between;font-family:Arial,sans-serif;"><span>${ftxt}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
                const hugeOpts = (scale) => ({
                    printBackground: true, format: "A4", landscape, scale,
                    displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate,
                    margin: { top: "0.5in", bottom: "0.6in", left: `${m}in`, right: `${m}in` },
                });
                const a4w = landscape ? 11.69 : 8.27;
                const hugePrintW = Math.round((a4w - 2 * m) * 96);
                const { sw } = await page.evaluate(() => ({ sw: document.body.scrollWidth }));
                finalScale = Math.max(0.25, Math.min(1, hugePrintW / sw));
                pdf = await page.pdf(hugeOpts(finalScale));
            } else {
                // First guess from measured content height, then verify the real
                // page count and shrink-and-retry until it fits on a single page.
                finalScale = await fitScale(page, printH, printW);
                pdf = await page.pdf(pdfOpts(finalScale));
                for (let attempt = 0; attempt < 5; attempt++) {
                    const pages = (await PDFDocument.load(pdf)).getPageCount();
                    if (pages <= 1 || finalScale <= 0.29) {
                        break;
                    }
                    finalScale = Math.max(0.28, finalScale * 0.88);
                    pdf = await page.pdf(pdfOpts(finalScale));
                }
            }
            pageCount = (await PDFDocument.load(pdf)).getPageCount();
            // --multipage: emit one RANDOM page of a multi-page doc, re-rendered
            // as a standalone single page with matching ground truth.
            if (doc.huge && args.multipage && pageCount > 1) {
                const res = await emitRandomPage({ doc, template, rng, id, browser, pdfOpts, printH, printW, pageCount });
                if (res) { pdf = res.pdf; finalScale = res.scale; pageCount = (await PDFDocument.load(pdf)).getPageCount(); }
            }
            await fs.writeFile(path.join(outDir, `${id}.pdf`), pdf);
            // Layout ground truth needs per-element bounding boxes (single page only).
            if (wantLayout && pageCount === 1) {
                measured = await page.evaluate(measureElements);
            }
            // Pixel-space chart geometry needs each on-page <svg>'s rect. Single
            // page only, and never after a --multipage re-render (doc.pageInfo):
            // the open DOM is the ORIGINAL render, not the emitted page.
            // Chrome's pdf `scale` lays the printed page out at printW/scale CSS
            // px and THEN scales, so rects measured at the printW viewport are
            // wrong whenever scale != 1 — re-measure at the true print layout
            // size (the PDF is already written; the relayout is harmless, and
            // layout GT above keeps its original measurement).
            if (wantChart && figures.length && pageCount === 1 && !doc.pageInfo) {
                if (finalScale !== 1) {
                    await page.setViewport({ width: Math.round(printW / finalScale), height: Math.round(printH / finalScale), deviceScaleFactor: 1 });
                }
                chartRects = await page.evaluate(measureChartSvgs);
            }
            // Copy the PDF into the sibling datasets.
            if (wantText) { await fs.writeFile(path.join(textDir, `${id}.pdf`), pdf); }
            if (wantLayout && pageCount === 1) { await fs.writeFile(path.join(layoutDir, `${id}.pdf`), pdf); }
            if (wantChart && figures.length) { await fs.writeFile(path.join(chartDir, `${id}.pdf`), pdf); }
        } finally {
            await page.close();
        }
        // A single table flowing across page boundaries is a table-continuation
        // (merge-tables) case — tag it so it can be filtered for that test.
        const gt = docGroundTruth(doc);
        const spansPages = pageCount > 1 && doc.sections.length === 1;
        // Only emit a table rule when tables are wanted and the doc actually has
        // one (text-focus docs may be tableless).
        if (args.tests.includes("table") && gt.trim() && !doc.chartsOnly) {
            const rule = { expected_markdown: gt, ...doc.flags };
            if (spansPages) {
                rule.table_continues_across_pages = true;
            }
            if (doc.pageInfo) {
                rule.sampled_page = doc.pageInfo.page;
                rule.source_pages = doc.pageInfo.of;
            }
            await fs.writeFile(path.join(outDir, `${id}.test.json`), `${JSON.stringify(rule, null, 2)}\n`);
        }

        // Text test (text_extended format).
        if (wantText) {
            await fs.writeFile(path.join(textDir, `${id}.test.json`), `${JSON.stringify(textTest(doc), null, 2)}\n`);
            await fs.writeFile(path.join(textDir, `${id}.md`), pageMarkdown(doc));
        }
        // Layout test (v1.4 format) — single-page docs only.
        if (wantLayout && measured && pageCount === 1) {
            await fs.writeFile(path.join(layoutDir, `${id}.test.json`), `${JSON.stringify(layoutTest(doc, measured, finalScale, printW, printH), null, 2)}\n`);
            await fs.writeFile(path.join(layoutDir, `${id}.md`), pageMarkdown(doc));
        }
        // Chart test (charts_core v2.1 format) — one data point per category x series.
        if (wantChart && figures.length) {
            const rules = figures.flatMap((m) => chartDataPoints(m));
            await fs.writeFile(path.join(chartDir, `${id}.test.json`), `${JSON.stringify({ expected_markdown: null, test_rules: rules }, null, 2)}\n`);
            // human-readable ground truth (chart->table markdown), like tables' expected_markdown
            await fs.writeFile(path.join(chartDir, `${id}.gold.md`), chartGoldMarkdown(figures));
            // Pixel-space geometry sidecar (NEW schema; test.json/gold.md untouched):
            // per-mark & axis positions in normalized page coords + raw svg space.
            if (chartRects && chartRects.length === figures.length) {
                const sidecar = chartPixelsSidecar({ models: figures, geoms: figGeoms, svgRects: chartRects, scale: finalScale, pageW: printW, pageH: printH, rotate: doc.rotate || null });
                await fs.writeFile(path.join(chartDir, `${id}.pixels.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
            } else if (chartRects) {
                console.error(`! ${id}: measured ${chartRects.length} chart svgs but placed ${figures.length} models — skipping pixels.json`);
            }
        }

        // Save the raw HTML + content/style spec so docs can be re-rendered or
        // varied later without re-calling the LLM.
        if (!args.noHtml) {
            await fs.writeFile(path.join(srcDir, `${id}.html`), html);
            await fs.writeFile(path.join(srcDir, `${id}.gen.json`), `${JSON.stringify({ id, seed: args.seed, index: i, domain: doc.domain, source: doc.source, template: template.name, templateSource: template.source || null, pageCount, crossPageTable: spansPages, flags: doc.flags, doc }, null, 2)}\n`);
        }

        stats[doc.flags.table_difficulty] = (stats[doc.flags.table_difficulty] || 0) + 1;
        if (doc.sections.length > 1) { stats.multiTable += 1; }
        if (template.page.columns === 2) { stats.twoCol += 1; }
        stats.byDomain[doc.domain] = (stats.byDomain[doc.domain] || 0) + 1;
    }, (done, total) => {
        if (done % 25 === 0 || done === total) { console.error(`  render ${done}/${total}`); }
    });

    await browser.close();

    console.error(`\nDone: ${args.count} docs -> ${outDir}`);
    console.error(`  difficulty  easy=${stats.easy} medium=${stats.medium} hard=${stats.hard}`);
    console.error(`  layout      multi-table=${stats.multiTable} two-column=${stats.twoCol}`);
    console.error(`  domains     ${Object.entries(stats.byDomain).map(([k, v]) => `${k}=${v}`).join(" ")}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
