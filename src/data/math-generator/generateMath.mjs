// CLI: generate a synthetic single-page math-document dataset.
//
//   node generateMath.mjs --out <dir> [--count 50] [--seed N]
//        [--render-concurrency 4] [--clean] [--no-html]
//
// Content is fully procedural (NO LLM anywhere): mathContent.mjs builds a
// logical document model (prose + LaTeX formulas at three difficulty tiers,
// ~20/45/35 easy/medium/hard dominant per batch), every formula pre-validated
// through KaTeX. Rendering goes through headless Chrome; formulas are rendered
// server-side by KaTeX with all fonts inlined as data URIs (no network).
//
// Outputs per doc:
//   <out>/<id>.pdf         single-page PDF
//   <out>/<id>.md          gold markdown (prose verbatim, formulas as the exact
//                          LaTeX source in $...$ / $$...$$, headings as markdown)
//   <out>/<id>.test.json   { expected_markdown: <same markdown string> }
//   <out>/src/<id>.html + <id>.gen.json  (debug, skipped with --no-html)
//
// Env: MG_STYLE=mix|textbook|paper|lecture|exam|handbook (csv ok; default mix)
//      MG_TIER=mix|easy|medium|hard (default mix)
//      MG_OLD_BOOK=1  "old scanned math book" family: per-doc seeded pick among
//                     treatise18 / letterpress1900 / midcentury substyles
//                     (MG_STYLE=treatise18|letterpress1900|midcentury also works)

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { makeRng } from "./rng.mjs";
import { randomTemplate } from "./template.mjs";
import { pickStyle, oldBookTemplate, OLD_BOOK_KEYS } from "./mathStyles.mjs";
import { buildMathDoc, katexRejectCount } from "./mathContent.mjs";
import { documentHtml, docMarkdown } from "./mathRender.mjs";

function parseArgs(argv) {
    const a = { count: 50, seed: null, out: null, renderConcurrency: 4, clean: false, noHtml: false };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--out") { a.out = v(); }
        else if (k === "--count") { a.count = Number(v()); }
        else if (k === "--seed") { a.seed = Number(v()); }
        else if (k === "--render-concurrency") { a.renderConcurrency = Math.max(1, Number(v())); }
        else if (k === "--clean") { a.clean = true; }
        else if (k === "--no-html") { a.noHtml = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    if (a.seed == null) { a.seed = (Date.now() & 0x7fffffff) >>> 0; }
    return a;
}

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

// Target page is always portrait A4 (margins are full-bleed body padding).
const A4 = { w: 8.27, h: 11.69 };
const pagePx = () => ({ w: Math.round(A4.w * 96), h: Math.round(A4.h * 96) });

// Compute a print scale so the natural content fits on a single page (same
// logic as the table-generator engine): shrink on overflow, gentle upscale cap.
async function fitScale(page, printH, printW) {
    const { sw, sh } = await page.evaluate(() => ({ sw: document.body.scrollWidth, sh: document.body.scrollHeight }));
    const z = Math.min(printW / sw, printH / sh);
    if (z >= 1) {
        return Math.min(1.18, z);
    }
    return Math.max(0.1, z * 0.95);
}

// ---- layout ground truth (Canonical17 sidecar) ------------------------------
//
// Browser-side sweep (passed to page.evaluate). Must run at the PRINT layout,
// never the screen viewport: page.pdf({scale}) lays the page out at
// printW/scale CSS px wide (print media), so when scale != 1 a screen-viewport
// measurement drifts — text re-wraps at the wrong width (this is the
// print_scale bug the table-generator's measureAtPrintLayout comment
// documents; the failing-table-replicator shipped misaligned GT because of
// it). Measuring after re-laying the DOM out at the printed geometry makes
// bbox = measured * scale exact.
//
// Every visible element maps to exactly one item: runhead cells + old-book
// chrome (.obl/.obc/.obr, .catchword), title-block divs, headings, paragraphs
// (leadp §-marks live inside their <p>), .hblabel handbook labels, and .disp
// display-math blocks. Containers (.env/.problem/.hbitem/.colflow/.fullwidth)
// are covered via their children.
function measureMathElements() {
    const sel = "h1, h2, p, .disp, .kicker, .byline, .meta, .abstract, .instructions, .catchword, .hblabel, .obhead .obl, .obhead .obc, .obhead .obr";
    // Rendered text only: skip the visually-clipped KaTeX MathML mirror so
    // formula characters are not duplicated (innerText would include it —
    // clip: rect(1px,...) does not hide from innerText).
    const visibleText = (el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                for (let a = n.parentElement; a && a !== el.parentElement; a = a.parentElement) {
                    if (a.classList && a.classList.contains("katex-mathml")) { return NodeFilter.FILTER_REJECT; }
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        let s = "";
        while (walker.nextNode()) { s += walker.currentNode.nodeValue; }
        return s.replace(/\s+/g, " ").trim();
    };
    const sx = window.scrollX || 0;
    const sy = window.scrollY || 0;
    // Chrome cells (runhead thirds, catchword) are wide flex/block boxes with
    // the text pushed to one edge — box the TEXT, not the empty cell.
    const TIGHT = ["obl", "obc", "obr", "catchword"];
    return [...document.querySelectorAll(sel)].map((el) => {
        let r = el.getBoundingClientRect();
        if (TIGHT.some((k) => el.classList.contains(k))) {
            const range = document.createRange();
            range.selectNodeContents(el);
            const tr = range.getBoundingClientRect();
            if (tr.width > 0 && tr.height > 0) { r = tr; }
        }
        // Display math: in KaTeX display mode .katex-display, its .katex child
        // AND .katex-html are all full-column blocks, so the element rect can
        // be ~9x wider than short centered equations. Take horizontal bounds
        // from a Range over the .katex-html contents instead: it unions the
        // shrink-to-fit .base inline-blocks with the absolutely-positioned
        // .tag child (\tag equation numbers stay inside the box) and never
        // sees the clipped .katex-mathml mirror (a sibling of .katex-html).
        // Vertical bounds stay the block's — those are already ink-exact.
        if (el.classList.contains("disp")) {
            let left = Infinity;
            let right = -Infinity;
            for (const kh of el.querySelectorAll(".katex-html")) {
                const range = document.createRange();
                range.selectNodeContents(kh);
                const kr = range.getBoundingClientRect();
                if (kr.width > 0) {
                    left = Math.min(left, kr.left);
                    right = Math.max(right, kr.right);
                }
            }
            if (right > left) { r = { x: left, y: r.y, width: right - left, height: r.height }; }
        }
        // KaTeX keeps the exact source in the MathML annotation.
        const ann = el.classList.contains("disp") ? el.querySelector('annotation[encoding="application/x-tex"]') : null;
        return {
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || ""),
            x: r.x + sx, y: r.y + sy, w: r.width, h: r.height,
            text: visibleText(el),
            latex: ann ? ann.textContent : null,
        };
    });
}

// Corrected print-layout measurement path (same idiom as the table-generator
// fix): print media + viewport at the geometry page.pdf({scale}) prints.
async function measureAtPrintLayout(page, printW, printH, scale) {
    await page.emulateMediaType("print");
    await page.setViewport({
        width: Math.max(1, Math.round(printW / scale)),
        height: Math.max(1, Math.round(printH / scale)),
        deviceScaleFactor: 1,
    });
    return page.evaluate(measureMathElements);
}

// Map a measured element to a Canonical17 class + attrs. Lead-in paragraphs
// (§-marks, "Theorem 2.1.", "Example 1 :", "Art." heads) are inline spans of
// their <p>, so they classify as Text; only real headings become
// Section-header / Title.
function classifyMathElement(el) {
    const has = (k) => el.cls.split(/\s+/).includes(k);
    const attrs = {};
    let cls;
    if (has("obl") || has("obc") || has("obr")) {
        cls = "Page-header";
        if (/^[0-9]+$/.test(el.text)) { attrs.role = "page-number"; }
        else { attrs.role = "running-head"; }
    } else if (has("catchword")) {
        cls = "Page-footer";
        attrs.role = "catchword";
    } else if (el.tag === "h1") {
        cls = "Title";
        attrs.level = 1;
    } else if (el.tag === "h2") {
        cls = "Section-header";
        attrs.level = 2;
    } else if (has("disp")) {
        cls = "Formula";
        if (el.latex) { attrs.latex = el.latex; }
    } else {
        cls = "Text";
        for (const role of ["kicker", "byline", "meta", "abstract", "instructions", "hblabel"]) {
            if (has(role)) { attrs.role = role; }
        }
    }
    return { cls, attrs };
}

// Final emission: normalized-float [x,y,w,h] -> INTEGER 0-1000 page coords.
// Each value = Math.round(norm*1000) clamped to [0,1000]; then w,h are floored
// at 1 (no zero-size boxes) and x,y re-clamped so x+w<=1000, y+h<=1000.
function intBbox(x, y, w, h) {
    const q = (v) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
    const W = Math.max(1, q(w));
    const H = Math.max(1, q(h));
    const X = Math.min(q(x), 1000 - W);
    const Y = Math.min(q(y), 1000 - H);
    return [X, Y, W, H];
}

// Build the <id>.layout.json sidecar (contract: INTEGER 0-1000 COCO-style
// [x,y,w,h], top-left origin — Qwen-VL grounding convention — Canonical17
// enum strings, items in reading order = DOM order, which IS the logical
// order even in 2-column flows). All internal math stays normalized float;
// the int rounding happens only at the final emission point (intBbox).
function layoutSidecar(measured, scale, printW, printH) {
    const items = [];
    for (const el of measured) {
        if (el.w <= 0 || el.h <= 0) { continue; }
        if (!el.text && !el.latex) { continue; } // empty runhead cells etc.
        const { cls, attrs } = classifyMathElement(el);
        const bbox = intBbox(
            (el.x * scale) / printW,
            (el.y * scale) / printH,
            (el.w * scale) / printW,
            (el.h * scale) / printH,
        );
        items.push({
            id: items.length,
            class: cls,
            bbox,
            reading_order: items.length,
            text: el.text || null,
            ...(Object.keys(attrs).length ? { attrs } : {}),
        });
    }
    return {
        version: 2,
        coords: "integer 0-1000 scale over the page, x rightward, y downward (top-left origin); bbox=[x,y,w,h]",
        ontology: "canonical17",
        page_w_px: printW,
        page_h_px: printH,
        items,
    };
}

async function mapPool(items, concurrency, fn, onProgress) {
    const results = new Array(items.length);
    let next = 0;
    let done = 0;
    async function worker() {
        for (;;) {
            const i = next++;
            if (i >= items.length) { return; }
            results[i] = await fn(items[i], i);
            done++;
            if (onProgress) { onProgress(done, items.length); }
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const outDir = path.resolve(args.out.replace(/^~/, os.homedir()));
    const srcDir = path.join(outDir, "src");
    if (args.clean && fssync.existsSync(outDir)) {
        for (const f of fssync.readdirSync(outDir)) {
            if (f.endsWith(".pdf") || f.endsWith(".test.json") || f.endsWith(".md") || f.endsWith(".layout.json")) { fssync.rmSync(path.join(outDir, f)); }
        }
        fssync.rmSync(srcDir, { recursive: true, force: true });
    }
    await fs.mkdir(outDir, { recursive: true });
    if (!args.noHtml) { await fs.mkdir(srcDir, { recursive: true }); }

    const tierEnv = (process.env.MG_TIER || "mix").trim();
    const forcedTier = ["easy", "medium", "hard"].includes(tierEnv) ? tierEnv : null;

    // Old-book family: on when MG_OLD_BOOK=1 or MG_STYLE names a substyle. The
    // flag-off path below is untouched (same rng draw order -> same-seed runs
    // stay byte-identical).
    const styleEnvKeys = (process.env.MG_STYLE || "").split(",").map((s) => s.trim());
    const oldBookMode = process.env.MG_OLD_BOOK === "1" || styleEnvKeys.some((k) => OLD_BOOK_KEYS.includes(k));

    // Phase 1: content (procedural, KaTeX-validated at build time).
    console.error(`Phase 1: content for ${args.count} docs (procedural, seed=${args.seed})`);
    const prepared = [];
    for (let i = 0; i < args.count; i++) {
        const rng = makeRng(deriveSeed(args.seed, i));
        let template;
        let forcedStyle = null;
        if (oldBookMode) {
            // Pick the (sub)style first so the template can carry era faces and
            // period margins; a modern archetype in a mixed MG_STYLE csv still
            // gets a randomTemplate.
            forcedStyle = pickStyle(rng);
            template = forcedStyle.oldBook ? oldBookTemplate(rng, forcedStyle) : randomTemplate(rng);
        } else {
            template = randomTemplate(rng);
        }
        // Math docs are portrait single-pagers; watermarks/logos are chrome the
        // gold markdown can't carry, so strip them. Also strip text-transform
        // decor (headingUpper): the gold is EXACT text, and a CSS uppercase
        // would make the visible casing diverge from it.
        template.page.orientation = "portrait";
        template.watermark = null;
        if (template.decor) {
            template.decor.watermark = null;
            template.decor.tint = "none";
            template.decor.headingUpper = false;
        }
        const doc = buildMathDoc(rng, { ...(forcedTier && { tier: forcedTier }), ...(forcedStyle && { style: forcedStyle }) });
        prepared.push({ i, rng, template, doc });
    }
    console.error(`  katex rejects (regenerated): ${katexRejectCount()}`);

    // Phase 2: render PDFs.
    console.error(`Phase 2: render (concurrency=${args.renderConcurrency})`);
    const { browser, execPath } = await launchBrowser();
    console.error(`  Chrome: ${execPath}`);

    const stats = { easy: 0, medium: 0, hard: 0, byStyle: {}, byCols: {}, formulas: 0, shrunk: 0 };
    await mapPool(prepared, args.renderConcurrency, async ({ i, rng, template, doc }) => {
        const id = `math_${(args.seed >>> 0).toString(36)}_${String(i + 1).padStart(4, "0")}`;
        const { html } = documentHtml(doc, template, rng);
        const { w: printW, h: printH } = pagePx();
        const page = await browser.newPage();
        let finalScale = 1;
        let pageCount = 1;
        let layout = null;
        try {
            await page.setViewport({ width: printW, height: printH, deviceScaleFactor: 1 });
            await page.setContent(html, { waitUntil: "networkidle0" });
            const pdfOpts = (scale) => ({
                printBackground: true,
                format: "A4",
                margin: { top: 0, bottom: 0, left: 0, right: 0 },
                scale,
            });
            finalScale = await fitScale(page, printH, printW);
            let pdf = await page.pdf(pdfOpts(finalScale));
            for (let attempt = 0; attempt < 5; attempt++) {
                if ((await PDFDocument.load(pdf)).getPageCount() <= 1 || finalScale <= 0.29) { break; }
                finalScale = Math.max(0.28, finalScale * 0.88);
                pdf = await page.pdf(pdfOpts(finalScale));
            }
            pageCount = (await PDFDocument.load(pdf)).getPageCount();
            await fs.writeFile(path.join(outDir, `${id}.pdf`), pdf);
            // Layout GT: read-only re-measure at the print layout (after the
            // PDF is final, before the page closes). Single-page docs only —
            // page-2 elements would have no page to normalize against.
            if (pageCount === 1) {
                const measured = await measureAtPrintLayout(page, printW, printH, finalScale);
                layout = layoutSidecar(measured, finalScale, printW, printH);
            }
        } finally {
            await page.close();
        }
        if (layout) {
            await fs.writeFile(path.join(outDir, `${id}.layout.json`), `${JSON.stringify(layout, null, 2)}\n`);
        } else {
            console.error(`  WARN ${id}: ${pageCount} pages after shrink retries — no layout sidecar`);
        }

        // Gold: derived from the logical model only (never the rendered DOM).
        const md = docMarkdown(doc);
        await fs.writeFile(path.join(outDir, `${id}.md`), md);
        await fs.writeFile(path.join(outDir, `${id}.test.json`), `${JSON.stringify({ expected_markdown: md }, null, 2)}\n`);

        if (!args.noHtml) {
            await fs.writeFile(path.join(srcDir, `${id}.html`), html);
            await fs.writeFile(path.join(srcDir, `${id}.gen.json`), `${JSON.stringify({ id, seed: args.seed, index: i, style: doc.style, tier: doc.tier, ncols: doc.ncols, nFormulas: doc.nFormulas, scale: finalScale, pageCount, template: template.name, doc }, null, 2)}\n`);
        }

        stats[doc.tier] += 1;
        stats.byStyle[doc.style] = (stats.byStyle[doc.style] || 0) + 1;
        stats.byCols[doc.ncols] = (stats.byCols[doc.ncols] || 0) + 1;
        stats.formulas += doc.nFormulas;
        if (finalScale < 0.95) { stats.shrunk += 1; }
    }, (done, total) => {
        if (done % 25 === 0 || done === total) { console.error(`  render ${done}/${total}`); }
    });

    await browser.close();

    console.error(`\nDone: ${args.count} docs -> ${outDir}`);
    console.error(`  tier      easy=${stats.easy} medium=${stats.medium} hard=${stats.hard}`);
    console.error(`  styles    ${Object.entries(stats.byStyle).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    console.error(`  columns   ${Object.entries(stats.byCols).map(([k, v]) => `${k}col=${v}`).join(" ")}`);
    console.error(`  formulas  total=${stats.formulas} avg=${(stats.formulas / args.count).toFixed(1)} per doc`);
    console.error(`  fit       shrunk-below-0.95=${stats.shrunk} katex-rejects=${katexRejectCount()}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
