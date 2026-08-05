// Render a replica template to PDF + test.json (+ 80dpi thumbnails).
// usage: node render.mjs templates/<family>.mjs <seed> [outdir]
// Template contract: export function generate(seed) -> {
//   html: string          // full self-contained HTML (inline CSS, system fonts only)
//   gt: string            // expected_markdown: clean <table> HTML, LOGICAL shape (matches manifest cells/cols)
//   pageOpts?: object     // puppeteer page.pdf() options; default A4 portrait, printBackground
// }
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const [tplPath, seedArg, outArg] = process.argv.slice(2);
if (!tplPath) { console.error("usage: node render.mjs <template.mjs> <seed> [outdir]"); process.exit(1); }
const seed = Number(seedArg ?? 1);
const outDir = resolve(outArg ?? "out");
mkdirSync(outDir, { recursive: true });

const mod = await import(pathToFileURL(resolve(tplPath)).href);
const { html, gt, pageOpts = {} } = mod.generate(seed);
const name = `${basename(tplPath, ".mjs")}_s${seed}`;

let browser;
try {
  browser = await puppeteer.launch({ channel: "chrome", headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
} catch {
  browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--force-color-profile=srgb"] });
}
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, ...pageOpts });
await browser.close();

const pdfPath = `${outDir}/${name}.pdf`;
writeFileSync(pdfPath, pdf);
writeFileSync(`${outDir}/${name}.test.json`, JSON.stringify({ expected_markdown: gt, seed, template: basename(tplPath) }, null, 1));
// thumbnails for visual self-verification (one per page)
const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("/opt/homebrew/bin/pdfinfo", [pdfPath]).toString())?.[1] ?? 1);
for (let p = 1; p <= pages; p++)
  execFileSync("/opt/homebrew/bin/pdftoppm", ["-png", "-r", "80", "-f", String(p), "-l", String(p), "-singlefile", pdfPath, `${outDir}/${name}__p${p}`]);
console.log(`${pdfPath} (${pages}p) + test.json + thumbs`);
