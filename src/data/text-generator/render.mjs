// Render a replica template to PDF + test.json + layout.json (+ 80dpi thumbnails).
// usage: node render.mjs templates/<family>.mjs <seed> [outdir]
// Template contract: export function generate(seed) -> {
//   html: string          // full self-contained HTML (inline CSS, system fonts only)
//   gt: string            // expected_markdown: clean <table> HTML, LOGICAL shape (matches manifest cells/cols)
//   pageOpts?: object     // puppeteer page.pdf() options; default A4 portrait, printBackground
// }
// <id>.layout.json sidecar (additive; PDF + test.json output unchanged):
// Canonical17 element sweep (layoutSweep.mjs) measured from the live DOM at the
// print-layout viewport, INTEGER 0-1000 over the page (top-left origin;
// Qwen-VL grounding convention), COCO [x,y,w,h] bboxes.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { sweepLayout, buildLayoutSidecar } from "./layoutSweep.mjs";

const [tplPath, seedArg, outArg] = process.argv.slice(2);
if (!tplPath) { console.error("usage: node render.mjs <template.mjs> <seed> [outdir]"); process.exit(1); }
const seed = Number(seedArg ?? 1);
const outDir = resolve(outArg ?? "out");
mkdirSync(outDir, { recursive: true });

const mod = await import(pathToFileURL(resolve(tplPath)).href);
const { html, gt, pageOpts = {} } = mod.generate(seed);
const name = `${basename(tplPath, ".mjs")}_s${seed}`;

// Printed page size in CSS px (Chrome prints 96 CSS px per inch at scale 1).
// Used only to size the viewport so screen layout == print layout; the final
// normalization divisor comes from the actual PDF page size (pdfinfo, exact).
const PAPER_IN = { a4: [8.27, 11.7], a3: [11.7, 16.54], letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17] };
const inches = (v) => {
  const m = /^([\d.]+)\s*(px|in|cm|mm)?$/.exec(String(v).trim());
  return Number(m[1]) / { px: 96, in: 1, cm: 2.54, mm: 25.4 }[m[2] ?? "px"];
};
const printScale = pageOpts.scale ?? 1;
let [wIn, hIn] = pageOpts.width && pageOpts.height
  ? [inches(pageOpts.width), inches(pageOpts.height)]
  : PAPER_IN[String(pageOpts.format ?? "a4").toLowerCase()] ?? PAPER_IN.a4;
if (pageOpts.landscape && wIn < hIn) [wIn, hIn] = [hIn, wIn];
const layoutWPx = wIn * 96 / printScale, layoutHPx = hIn * 96 / printScale; // print layout viewport

let browser;
try {
  browser = await puppeteer.launch({ channel: "chrome", headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
} catch {
  browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
}
const page = await browser.newPage();
await page.setViewport({ width: Math.max(1, Math.round(layoutWPx)), height: Math.max(1, Math.round(layoutHPx)) });
await page.setContent(html, { waitUntil: "networkidle0" });
await page.emulateMediaType("print");
// Canonical17 layout sweep (read-only pass, before printing — does not perturb
// the PDF; measured at the true print-layout viewport, never the legacy
// printW-viewport path that carries the print_scale bug).
const swept = await page.evaluate(sweepLayout, { pageW: layoutWPx, pageH: layoutHPx });
const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, ...pageOpts });
await browser.close();

const pdfPath = `${outDir}/${name}.pdf`;
writeFileSync(pdfPath, pdf);
writeFileSync(`${outDir}/${name}.test.json`, JSON.stringify({ expected_markdown: gt, seed, template: basename(tplPath) }, null, 1));

// layout.json: normalize CSS px -> per-page [0,1] using the ACTUAL pdf page size.
//
// Fit-to-paper correction (same as failing-table-replicator/render.mjs):
// page.pdf() gets format:"A4" as a default under ...pageOpts, and puppeteer
// gives `format` priority over width/height. Templates that set width/height
// WITHOUT preferCSSPageSize therefore lay out at their CSS page size but print
// min-fit-scaled + centered onto A4. The PDFs are correct (and byte-stable with
// the original datasets), so the fix lives HERE: detect the layout-vs-paper
// mismatch from pdfinfo and compose the same uniform min-fit transform into the
// normalization. Assumes @page CSS size == pageOpts width/height (true for all
// current templates; preferCSSPageSize templates use matching A4 sizes).
const info = execFileSync("/opt/homebrew/bin/pdfinfo", [pdfPath]).toString();
const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 1);
const [pageWPt, pageHPt] = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info).slice(1, 3).map(Number);
const cssWPt = wIn * 72, cssHPt = hIn * 72;      // layout page in printed pt (scale-independent)
const fitS = Math.abs(pageWPt - cssWPt) > 1 || Math.abs(pageHPt - cssHPt) > 1
  ? Math.min(pageWPt / cssWPt, pageHPt / cssHPt)
  : 1;
const offXPt = (pageWPt - cssWPt * fitS) / 2, offYPt = (pageHPt - cssHPt * fitS) / 2;
const px2pt = 0.75 * printScale * fitS;          // CSS px -> printed pt, incl. min-fit
const norm = ([x0, y0, x1, y1]) => {
  const p = Math.min(pages - 1, Math.max(0, Math.floor((y0 + y1) / 2 / layoutHPx)));
  const cl = (v) => Math.min(1, Math.max(0, Number(v.toFixed(6))));
  const X = (x) => cl((x * px2pt + offXPt) / pageWPt);
  const Y = (y) => cl(((y - p * layoutHPx) * px2pt + offYPt) / pageHPt);
  return { page: p, bbox: [X(x0), Y(y0), X(x1), Y(y1)] };
};
writeFileSync(`${outDir}/${name}.layout.json`, JSON.stringify({
  id: name, template: basename(tplPath), seed,
  ...buildLayoutSidecar({ swept, norm, tables: null, pageWPt, pageHPt }),
}, null, 1));

// thumbnails for visual self-verification (one per page)
for (let p = 1; p <= pages; p++)
  execFileSync("/opt/homebrew/bin/pdftoppm", ["-png", "-r", "80", "-f", String(p), "-l", String(p), "-singlefile", pdfPath, `${outDir}/${name}__p${p}`]);
console.log(`${pdfPath} (${pages}p) + test.json + layout.json + thumbs`);
