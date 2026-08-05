// Re-derive layout ground truth for the EXISTING SCAN-1k pages from their
// stored source.html + gen.json (full doc object), using the fixed
// print-layout measurement (PR #1730) and heron-convention boxes.
//
// The original finalScale was not stored, but it is deterministic given the
// DOM: the same fitScale + shrink-until-one-page procedure the generator ran
// recovers it. Fonts are data-URI-embedded in source.html, so the re-render
// is self-contained; alignment against the ORIGINAL renders is validated
// downstream (python ink audit against data/scan1k images).
//
//   node rederiveScanGt.mjs --manifest /tmp/scan_manifest.json \
//        --nfs http://llama-nfs --token "$TOK" --out <dir> [--limit N] [--ids a,b]
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { layoutTest, measureElements } from "./groundTruth.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k.startsWith("--")) { args[k.slice(2)] = process.argv[i + 1]; i++; }
}
const NFS = args.nfs || "http://llama-nfs";
const TOKEN = args.token;
const OUT = args.out;
const LIMIT = args.limit ? Number(args.limit) : 0;
const ONLY = args.ids ? new Set(args.ids.split(",")) : null;
const CONCURRENCY = Number(args.concurrency || 5);

const PRINT_W = Math.round(8.27 * 96);   // A4 portrait, matches the generator
const PRINT_H = Math.round(11.69 * 96);

async function nfsGet(rel) {
    const res = await fetch(`${NFS}/api/raw/datasets/SCAN-1k-dataset/${rel}`, { headers: { "X-Auth": TOKEN } });
    if (!res.ok) { throw new Error(`${res.status} ${rel}`); }
    return Buffer.from(await res.arrayBuffer());
}

async function fitScale(page, printH, printW) {
    const { sw, sh } = await page.evaluate(() => ({ sw: document.body.scrollWidth, sh: document.body.scrollHeight }));
    const z = Math.min(printW / sw, printH / sh);
    if (z >= 1) { return Math.min(1.18, z); }
    return Math.max(0.1, z * 0.95);
}

const pdfOpts = (scale, landscape) => ({
    printBackground: true, format: "A4", landscape,
    margin: { top: 0, bottom: 0, left: 0, right: 0 }, scale,
});

async function processPage(browser, entry) {
    const [html, genBuf] = await Promise.all([
        nfsGet(entry.files.source.html),
        nfsGet(entry.files.source.gen_json),
    ]);
    const gen = JSON.parse(genBuf.toString());
    if (gen.doc.pageInfo || gen.doc.huge || gen.pageCount > 1) {
        return { id: entry.source_id, skip: "multipage/huge" };
    }
    const landscape = Boolean(gen.doc.landscape);
    const printW = landscape ? PRINT_H : PRINT_W;
    const printH = landscape ? PRINT_W : PRINT_H;
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: printW, height: printH, deviceScaleFactor: 1 });
        await page.setContent(html.toString(), { waitUntil: "networkidle0" });
        // Recover the deterministic print scale exactly as the generator did.
        let scale = await fitScale(page, printH, printW);
        let pdf = await page.pdf(pdfOpts(scale, landscape));
        for (let attempt = 0; attempt < 5; attempt++) {
            if ((await PDFDocument.load(pdf)).getPageCount() <= 1 || scale <= 0.29) { break; }
            scale = Math.max(0.28, scale * 0.88);
            pdf = await page.pdf(pdfOpts(scale, landscape));
        }
        await page.emulateMediaType("print");
        await page.setViewport({
            width: Math.max(1, Math.round(printW / scale)),
            height: Math.max(1, Math.round(printH / scale)),
            deviceScaleFactor: 1,
        });
        const measured = await page.evaluate(measureElements);
        const gt = layoutTest(gen.doc, measured, scale, printW, printH);
        await fs.writeFile(path.join(OUT, `${entry.source_id}.test.json`),
            `${JSON.stringify({ ...gt, scan_page_id: entry.id, rederived_scale: scale, flags: gen.flags }, null, 1)}\n`);
        return { id: entry.source_id, rules: gt.test_rules.length, scale };
    } finally {
        await page.close();
    }
}

async function main() {
    const manifest = JSON.parse(await fs.readFile(args.manifest, "utf8"));
    let pages = manifest.pages;
    if (ONLY) { pages = pages.filter((p) => ONLY.has(p.source_id) || ONLY.has(p.id)); }
    if (LIMIT) { pages = pages.slice(0, LIMIT); }
    await fs.mkdir(OUT, { recursive: true });
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        args: ["--no-sandbox", "--font-render-hinting=none"],
    });
    let done = 0, skipped = 0, failed = 0;
    const queue = [...pages];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            const entry = queue.shift();
            try {
                const r = await processPage(browser, entry);
                if (r.skip) { skipped++; } else { done++; }
            } catch (e) {
                failed++;
                console.error(`FAIL ${entry.source_id}: ${e.message}`);
            }
            if ((done + skipped + failed) % 50 === 0) {
                console.error(`  progress ${done + skipped + failed}/${pages.length} (ok=${done} skip=${skipped} fail=${failed})`);
            }
        }
    }));
    await browser.close();
    console.error(`DONE ok=${done} skip=${skipped} fail=${failed} -> ${OUT}`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
