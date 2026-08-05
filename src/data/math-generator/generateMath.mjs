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

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { makeRng } from "./rng.mjs";
import { randomTemplate } from "./template.mjs";
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
            if (f.endsWith(".pdf") || f.endsWith(".test.json") || f.endsWith(".md")) { fssync.rmSync(path.join(outDir, f)); }
        }
        fssync.rmSync(srcDir, { recursive: true, force: true });
    }
    await fs.mkdir(outDir, { recursive: true });
    if (!args.noHtml) { await fs.mkdir(srcDir, { recursive: true }); }

    const tierEnv = (process.env.MG_TIER || "mix").trim();
    const forcedTier = ["easy", "medium", "hard"].includes(tierEnv) ? tierEnv : null;

    // Phase 1: content (procedural, KaTeX-validated at build time).
    console.error(`Phase 1: content for ${args.count} docs (procedural, seed=${args.seed})`);
    const prepared = [];
    for (let i = 0; i < args.count; i++) {
        const rng = makeRng(deriveSeed(args.seed, i));
        const template = randomTemplate(rng);
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
        const doc = buildMathDoc(rng, forcedTier ? { tier: forcedTier } : {});
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
        } finally {
            await page.close();
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
