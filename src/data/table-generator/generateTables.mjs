// CLI: generate a synthetic single-page table dataset.
//
//   node generateTables.mjs --out <dir> [--count 50] [--seed N]
//        [--templates <dir>] [--llm-concurrency 50] [--render-concurrency 6]
//        [--format pdf|presentation] [--no-llm] [--clean]
//        [--doc-mode form|regular|mix|none] [--from-acroforms <specs.jsonl>]
//        [--hard-table-mix 0..1]  visually-hard table styles + miss-mining shapes
//        [--delta-mix 0..1]       heron delta-class components in regular docs
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
import { textTest, layoutTest, pageMarkdown, measureElements, tableCellsGt } from "./groundTruth.mjs";
import { chartDataPoints } from "./figure.mjs";
import { randomTemplate, loadTemplates, varyTemplate, forceHardTableStyle, tableVisualDifficulty } from "./template.mjs";
import { generateLlmDoc, generateProceduralDoc, injectHardSections, injectDeltaSections } from "./llmContent.mjs";
import { getGeminiUsage, hasGeminiKey, mapPool, resetGeminiUsage } from "./gemini.mjs";

function parseArgs(argv) {
    // Per-cell table GT sidecar (<id>.cells.json): ON by default; disable with
    // --no-cell-gt or TABLEGEN_CELL_GT=0. Only ever adds the NEW sidecar file —
    // existing outputs (test.json / layout / md / gen.json) are unchanged
    // either way.
    const a = { count: 50, seed: null, out: null, templatesDir: null, llmConcurrency: 50, renderConcurrency: 6, noLlm: false, clean: false, noHtml: false, format: "pdf", hardTableMix: 0, deltaMix: 0, cellGt: process.env.TABLEGEN_CELL_GT !== "0" };
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
        else if (k === "--table-focus") { a.tableFocus = Number(v()); }
        else if (k === "--text-focus") { a.textFocus = Number(v()); }
        else if (k === "--language-mix") { a.languageMix = v(); }
        else if (k === "--clean") { a.clean = true; }
        else if (k === "--multipage") { a.multipage = true; }
        else if (k === "--from-acroforms") { a.fromAcroforms = v(); }
        else if (k === "--doc-mode") { a.docMode = v(); }   // form | regular | mix | none
        else if (k === "--hard-table-mix") { a.hardTableMix = Math.max(0, Math.min(1, Number(v()))); }
        else if (k === "--delta-mix") { a.deltaMix = Math.max(0, Math.min(1, Number(v()))); }
        else if (k === "--cell-gt") { a.cellGt = true; }
        else if (k === "--no-cell-gt") { a.cellGt = false; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    a.tests = (a.tests || "table").split(",").map((s) => s.trim()).filter(Boolean);
    // chart-focused doc ratio: default to all docs when chart tests are requested.
    if (a.chartFocus == null) { a.chartFocus = a.tests.includes("chart") ? 1 : 0; }
    // text-focused (prose-heavy) ratio: default to all when only text/layout requested.
    if (a.textFocus == null) { a.textFocus = (a.tests.includes("text") && !a.tests.includes("table") && !a.tests.includes("chart")) ? 1 : 0; }
    if (a.tableFocus == null) { a.tableFocus = 1; }
    if (a.languageMix == null) { a.languageMix = "english"; }
    // Doc mode: form = every doc is a form; regular = normal docs that only
    // occasionally carry a form region; mix = a blend. Defaults to `form` when
    // seeding from acroforms, else `none` (pure table/report docs, unchanged).
    if (a.docMode == null) { a.docMode = a.fromAcroforms ? "form" : "none"; }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    if (a.seed == null) { a.seed = (Date.now() & 0x7fffffff) >>> 0; }
    return a;
}

// ---- Form field content: fill values + fill modes -------------------------
// Field-aware synthetic values (obviously-fake identifiers), mirroring the
// FFDetr fillgen.synth_value so filled fields read like real form entries.
const FIRST = ["James", "Maria", "Chen", "Aisha", "Robert", "Sofia", "David", "Priya", "Noah", "Elena", "Omar", "Grace"];
const LAST = ["Bennett", "Okafor", "Silva", "Nakamura", "Haddad", "Larsen", "Novak", "Patel", "Costa", "Reyes"];
const CITY = ["Fairview", "Riverton", "Lakeside", "Millbrook", "Ashford", "Kingsport", "Glendale", "Easton"];
const ST = ["CA", "TX", "NY", "FL", "IL", "WA", "GA", "OH", "AZ", "CO"];
const STREET = ["Maple Ave", "Oak St", "Cedar Ln", "Park Blvd", "Elm Dr", "Ridge Rd", "Birch Way"];
function synthValue(label, rng) {
    const l = String(label || "").toLowerCase();
    const name = () => `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    const date = () => `${String(rng.int(1, 12)).padStart(2, "0")}/${String(rng.int(1, 28)).padStart(2, "0")}/20${rng.int(10, 24)}`;
    if (/e-?mail/.test(l)) { return `${rng.pick(FIRST).toLowerCase()}.${rng.pick(LAST).toLowerCase()}@example.com`; }
    if (/phone|tel|area\s*code/.test(l)) { return `(${rng.int(200, 989)}) ${rng.int(200, 989)}-${String(rng.int(0, 9999)).padStart(4, "0")}`; }
    if (/zip|postal/.test(l)) { return String(rng.int(10000, 99999)); }
    if (/state/.test(l)) { return rng.pick(ST); }
    if (/city/.test(l)) { return rng.pick(CITY); }
    if (/address|street/.test(l)) { return `${rng.int(1, 9999)} ${rng.pick(STREET)}`; }
    if (/date|dob|birth|day|month|year/.test(l)) { return date(); }
    if (/ssn|social/.test(l)) { return `900-${rng.int(10, 99)}-${String(rng.int(0, 9999)).padStart(4, "0")}`; }
    if (/ein|tax\s*id|file\s*number|number|no\b|#/.test(l)) { return `${String(rng.int(0, 99)).padStart(2, "0")}-${rng.int(1000000, 9999999)}`; }
    if (/name|applicant|veteran|payee|first|last|middle/.test(l)) { return name(); }
    if (/amount|total|sum|\$|price|value/.test(l)) { return `$${rng.int(100, 99999).toLocaleString()}.00`; }
    return name();
}
// Writer modes per field: empty 30% / typed 45% / handwritten 25% (fillgen-like).
function rollFill(rng) {
    const x = rng();  // base mulberry32 in [0,1)
    return x < 0.30 ? "empty" : (x < 0.75 ? "typed" : "handwritten");
}
function fillField(f, rng) {
    const fill = rollFill(rng);
    return {
        label: f.label,
        value: fill === "empty" ? "" : synthValue(f.label, rng),
        fill,
        tilt: fill === "handwritten" ? rng.int(-3, 3) : 0,
    };
}

// A generic procedural form spec (for --doc-mode form without acroform seeds).
// Real form titles, not filenames. Strip extension / URL-encoding artifacts
// (%xx, "2B" = encoded "+") / separators / trailing ID digit-runs, title-case,
// and fall back to a generic title if what's left is junk (e.g. no word breaks).
function cleanTitle(t) {
    let s = String(t || "").replace(/\.(pdf|docx?|xlsx?|html?)$/i, "");
    s = s.replace(/%[0-9a-f]{2}/gi, " ").replace(/\b2[BbCc]\b/g, " ");  // URL-encode junk
    s = s.replace(/[_\-+]+/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/(\s\d{3,})+$/g, "").trim();                          // trailing ID runs
    const words = s.split(" ").filter(Boolean);
    const alpha = words.filter((w) => /[a-z]/i.test(w));
    if (alpha.length < 2 || s.length > 60) { return ""; }  // junk -> caller falls back
    return words.map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

const FORM_TITLE_FALLBACKS = ["Application Form", "Enrollment Request", "Registration Form",
    "Filing Declaration", "Claim Form", "Authorization Request", "Membership Application"];

const FIELD_LABEL_POOL = ["First Name", "Last Name", "Middle Initial", "Date of Birth",
    "Social Security Number", "Mailing Address", "City", "State", "ZIP Code", "Email Address",
    "Phone Number", "Employer Name", "Occupation", "Account Number", "Reference Number", "Amount"];
const CHECK_LABEL_POOL = ["Individual", "Business", "Yes", "No", "I agree to the terms",
    "I certify the above is correct", "Married", "Single", "Amended", "Applicable", "Not applicable",
    "Check if address changed", "Direct deposit"];

// Acroform field NAMES are often un-humanreadable (concatenated caps, stray XFA
// parens). Turn them into real-looking labels: split camelCase, strip brackets,
// title-case; if it's still junk (long concatenation / empty), substitute a
// realistic label from `pool` so the page reads like a real form.
function cleanLabel(s, rng, pool = FIELD_LABEL_POOL) {
    let x = String(s ?? "").replace(/[()[\]{}:]+/g, " ");
    if (/[a-z][A-Z]/.test(x)) { x = x.replace(/([a-z])([A-Z])/g, "$1 $2"); }
    x = x.replace(/\s+/g, " ").trim();
    const words = x.split(" ").filter(Boolean);
    const junk = !x || x.length < 2 || x.length > 34 || words.some((w) => w.length > 16);
    if (junk) { return rng ? rng.pick(pool) : "Field"; }
    return words.map((w) => (w.length <= 3 && w === w.toUpperCase()
        ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(" ");
}

function syntheticFormSpec(rng) {
    const kvLabels = ["Full Name", "Date of Birth", "Reference No"];
    const fieldLabels = rng.pick([
        ["Street Address", "City", "State", "ZIP Code", "Email", "Phone"],
        ["Employer Name", "Position", "Start Date", "Annual Amount", "Tax ID"],
        ["Applicant Name", "Case Number", "Filing Date", "Contact Email"],
    ]);
    const checkLabels = rng.pick([
        ["Individual", "Business", "Non-profit"],
        ["Domestic", "International", "Amended return"],
        ["Married", "Single", "Head of household"],
    ]);
    return {
        title: rng.pick(["Application Form", "Enrollment Request", "Filing Declaration", "Registration Form"]),
        keyvalues: kvLabels.map((k) => ({ label: k, value: "" })),
        formfields: fieldLabels.map((l) => ({ label: l })),
        checkboxes: checkLabels.map((c) => ({ label: c })),
        toc: ["Filing Information", "Declarations", "Certification"],
    };
}

// Turn a "form spec" into doc.formBlocks (Canonical17 form components), rolling
// per-field fill state + a signature. `full` = the whole form component set
// (form docs); when false, only a small subset is attached (regular docs that
// occasionally carry a form region).
function buildFormBlocks(spec, rng, full = true) {
    const b = [];
    if (spec.keyvalues && spec.keyvalues.length) {
        // KV values are filled ~half the time (typed), else left blank.
        const rows = spec.keyvalues.map((r) => { const label = cleanLabel(r.label, rng); return { label, value: rng.bool(0.5) ? synthValue(label, rng) : "" }; });
        b.push({ kind: "kv", title: "Filing Information", rows });
    }
    if (!full) { return b; }  // regular docs get just the KV region
    // ---- fillable fields: densify to a realistic count (real forms pack many),
    // seeding from the acroform's fields then padding from a realistic pool ----
    const baseFields = (spec.formfields || []).map((f) => cleanLabel(f.label, rng));
    const fTarget = rng.int(9, 22);
    const fLabels = [...baseFields];
    const fPool = rng.shuffle([...FIELD_LABEL_POOL]);
    while (fLabels.length < fTarget) { fLabels.push(fPool[fLabels.length % fPool.length]); }
    const fields = fLabels.map((label) => fillField({ label }, rng));
    if (fields.length > 12 && rng.bool(0.6)) {
        const cut = Math.floor(fields.length / 2);
        b.push({ kind: "form", title: rng.pick(["Applicant Details", "Personal Information", "Part I - Identification"]), fields: fields.slice(0, cut) });
        b.push({ kind: "form", title: rng.pick(["Additional Information", "Part II - Details", "Employment"]), fields: fields.slice(cut) });
    } else {
        b.push({ kind: "form", title: rng.pick(["Applicant Details", "Personal Information", "Section A"]), fields });
    }
    // ---- checkboxes (option-style labels, densified) ----
    const cLabels = (spec.checkboxes || []).map((c) => cleanLabel(c.label, rng, CHECK_LABEL_POOL));
    const cPool = rng.shuffle([...CHECK_LABEL_POOL]);
    const cTarget = rng.int(3, 7);
    while (cLabels.length < cTarget) { cLabels.push(cPool[cLabels.length % cPool.length]); }
    b.push({ kind: "checks", title: rng.pick(["Declarations", "Options", "Select all that apply"]), items: cLabels.map((label) => ({ label, checked: rng.bool(0.4) })) });
    // Signature block — its own bbox (canonical_class Signature). Signed ~55%.
    const signed = rng.bool(0.55);
    b.push({ kind: "signature", items: [{
        label: "Signature", signed,
        value: signed ? `${rng.pick(FIRST)} ${rng.pick(LAST)}` : "",
        tilt: rng.int(-4, 2),
        date: rng.bool(0.6) ? `${String(rng.int(1, 12)).padStart(2, "0")}/${String(rng.int(1, 28)).padStart(2, "0")}/20${rng.int(20, 24)}` : "",
    }] });
    // Real single-page forms rarely carry a table-of-contents; keep it rare so
    // the Document Index class still appears occasionally but forms look like forms.
    if (spec.toc && spec.toc.length && rng.bool(0.08)) { b.push({ kind: "toc", items: spec.toc }); }
    return b;
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

function pagePx(landscape) {
    const w = landscape ? A4.h : A4.w;
    const h = landscape ? A4.w : A4.h;
    return { w: Math.round(w * 96), h: Math.round(h * 96) };
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

// Layout GT must be measured at the PRINT layout, not the screen layout:
// page.pdf({scale}) lays the page out at printW/scale CSS px wide (and print
// media), so when scale != 1 the screen-viewport measurement drifts — text
// re-wraps at the different width and bottom-anchored flex elements (footers,
// footnotes) move to the true page bottom. Measuring after re-laying the DOM
// out at the exact printed geometry makes bbox = measured * scale exact.
// (This was the root cause of SCAN-1k's misaligned ground truth: footers 96%
// off, ~30% of boxes on whitespace, worst on heavily-scaled pages.)
async function measureAtPrintLayout(page, printW, printH, scale, opts) {
    await page.emulateMediaType("print");
    await page.setViewport({
        width: Math.max(1, Math.round(printW / scale)),
        height: Math.max(1, Math.round(printH / scale)),
        deviceScaleFactor: 1,
    });
    return page.evaluate(measureElements, opts);
}

// Second line of defense: validate every layout rule against the rendered
// pixels. A box containing (almost) no ink marks content that did not
// actually render (overflow, hidden element, any residual reflow) — drop it
// rather than ship a ground-truth box on whitespace. Pages losing more than
// LAYOUT_MAX_DROP_SHARE of their rules are marked invalid and emit no layout
// GT at all. Ink = pixels whose luminance differs from the page background
// (sampled median), so tinted/dark themes validate correctly.
const LAYOUT_MIN_INK = 0.02;
const LAYOUT_MAX_DROP_SHARE = 0.3;

async function validateLayoutRules(page, gt) {
    if (!gt.test_rules.length) {
        return { gt, dropped: 0, total: 0, valid: true };
    }
    const shot = await page.screenshot({ type: "png", encoding: "base64" });
    const fracs = await page.evaluate(async (b64, boxes) => {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = `data:image/png;base64,${b64}`;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const lumAt = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const samples = [];
        for (let y = 0; y < img.height; y += 31) {
            for (let x = 0; x < img.width; x += 31) {
                samples.push(lumAt((y * img.width + x) * 4));
            }
        }
        samples.sort((a, b) => a - b);
        const bg = samples[Math.floor(samples.length / 2)];
        return boxes.map(([bx, by, bw, bh]) => {
            const x0 = Math.max(0, Math.round(bx * img.width));
            const y0 = Math.max(0, Math.round(by * img.height));
            const x1 = Math.min(img.width, Math.round((bx + bw) * img.width));
            const y1 = Math.min(img.height, Math.round((by + bh) * img.height));
            let ink = 0;
            let n = 0;
            // Contrast cutoff 20: low enough that light-styled small text
            // (9px #888 footers render mostly as faint anti-aliased pixels)
            // counts as ink, high enough that zebra-stripe tints do not.
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    n += 1;
                    if (Math.abs(lumAt((y * img.width + x) * 4) - bg) > 20) {
                        ink += 1;
                    }
                }
            }
            return n ? ink / n : 0;
        });
    }, shot, gt.test_rules.map((r) => r.bbox));
    const kept = gt.test_rules.filter((_, i) => fracs[i] >= LAYOUT_MIN_INK);
    kept.forEach((r, i) => { r.ro_index = i; });
    const dropped = gt.test_rules.length - kept.length;
    return {
        gt: { ...gt, test_rules: kept },
        dropped,
        total: gt.test_rules.length,
        valid: dropped / gt.test_rules.length <= LAYOUT_MAX_DROP_SHARE,
    };
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
        return { pdf, scale, html };
    } finally {
        await p2.close();
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    // Optional: seed each doc from a real acroform "form spec" (acroform_seed.py).
    const formSpecs = args.fromAcroforms
        ? JSON.parse(fssync.readFileSync(path.resolve(args.fromAcroforms.replace(/^~/, os.homedir())), "utf8"))
        : null;
    if (formSpecs && !args.count) { args.count = formSpecs.length; }
    resetGeminiUsage();
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
            if (f.endsWith(".pdf") || f.endsWith(".test.json") || f.endsWith(".cells.json")) { fssync.rmSync(path.join(outDir, f)); }
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
    const wantCells = args.cellGt;
    if (wantCells) { console.error("Also emitting: per-cell table GT sidecars (<id>.cells.json; --no-cell-gt to disable)"); }
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
        // --hard-table-mix: force a visually-hard table style (borderless /
        // sparse / low-contrast) on this fraction of docs, and boost the
        // structural complexity of procedurally built tables.
        const hardTable = args.hardTableMix > 0 && rng.bool(args.hardTableMix);
        // Hard docs pick one miss-mining variant: visually-hard styling on a
        // standard table, or one of the shapes detectors miss most (headerless
        // label-value listings, patent code listings, stacked sub-table pairs),
        // injected into the doc after content generation.
        const hardVariant = hardTable
            ? rng.weighted([["style", 4], ["labelValue", 2.5], ["codeListing", 2], ["stackedPair", 1.5]])
            : null;
        if (hardVariant === "style" || (hardVariant && rng.bool(0.35))) {
            forceHardTableStyle(template, rng);
        }
        let doc;
        const docOpts = {
            structureBoost: hardTable,
            forceNormal: args.chartFocus >= 0.99,
            textFocus: args.textFocus >= 1 ? true : (args.textFocus > 0 ? rng.bool(args.textFocus) : false),
            tableFocus: args.tableFocus,
            languageMix: args.languageMix,
            allowMultipage: Boolean(args.multipage),
        };
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
                    doc = generateProceduralDoc(rng, docOpts);
                    fellBack += 1;
                }
            }
        } else {
            doc = generateProceduralDoc(rng, docOpts);
        }
        if (args.docMode !== "none") {
            // Doc-mode driven form injection. form: every doc is a full form.
            // regular: normal doc that occasionally carries just a form region.
            // mix: a blend. none: no form (pure table/report doc, unchanged).
            const dm = args.docMode;
            let makeForm = false, fullForm = false;
            if (dm === "form") { makeForm = true; fullForm = true; }
            else if (dm === "mix") {
                if (rng.bool(0.45)) { makeForm = true; fullForm = true; }
                else { makeForm = rng.bool(0.15); }
            } else if (dm === "regular") { makeForm = rng.bool(0.15); }
            if (makeForm) {
                const spec = formSpecs ? formSpecs[i % formSpecs.length] : syntheticFormSpec(rng);
                if (fullForm) {
                    // Form-DOMINATED page: the form IS the page. Strip the report
                    // scaffold (prose intro/sections/tables/conclusion, dateline)
                    // and the "Source form:" artifact; give it a real, cleaned
                    // title (no filename/extension/ID junk).
                    doc.docTitle = cleanTitle(spec.title || spec.source_pdf)
                        || rng.pick(FORM_TITLE_FALLBACKS);
                    doc.subtitle = ""; doc.dateline = "";
                    doc.intro = []; doc.sections = []; doc.conclusion = [];
                    doc.domain = "form"; doc.source = formSpecs ? "acroform-seed" : "procedural-form";
                    doc.huge = false; doc.dense = false; doc.panels = 0; doc.landscape = false; doc.chartFocus = false;
                }
                doc.formBlocks = buildFormBlocks(spec, rng, fullForm);
            }
        }
        if (doc && args.chartFocus > 0 && !doc.dense && !doc.huge && !doc.panels) {
            doc.chartFocus = rng.bool(args.chartFocus);
        }
        if (doc && hardVariant && hardVariant !== "style") {
            injectHardSections(doc, rng, hardVariant);
        }
        // --delta-mix: heron delta-class components injected as furniture in
        // REGULAR docs (kv/index/code weighted up; checkbox/form kept light —
        // form-focused documents are --doc-mode's job, not this knob's).
        let deltaKinds = null;
        if (doc && args.deltaMix > 0 && rng.bool(args.deltaMix)) {
            const weights = [["kv_region", 3], ["toc", 2], ["code", 2], ["checkboxes", 1], ["form", 0.7]];
            const n = rng.bool(0.35) ? 2 : 1;
            deltaKinds = [];
            for (let k = 0; k < n; k++) {
                deltaKinds.push(rng.weighted(weights.filter(([w]) => !deltaKinds.includes(w))));
            }
            injectDeltaSections(doc, rng, deltaKinds);
        }
        return { i, rng, template, doc, hardVariant, deltaKinds };
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

    const stats = { easy: 0, medium: 0, hard: 0, multiTable: 0, twoCol: 0, byDomain: {}, visual: { easy: 0, medium: 0, hard: 0 }, variants: {}, delta: {}, layoutRules: 0, layoutDropped: 0, layoutInvalidPages: 0 };
    await mapPool(prepared, args.renderConcurrency, async ({ i, rng, template, doc, hardVariant, deltaKinds }) => {
        const id = `synth_${(args.seed >>> 0).toString(36)}_${String(i + 1).padStart(4, "0")}`;
        const landscape = Boolean(doc.landscape) || template.page.orientation === "landscape";
        const { html, figures } = documentHtml(doc, template, rng, id);
        const page = await browser.newPage();
        let pageCount = 1;
        let finalScale = 1;
        let measured = null;
        let layoutGt = null;
        const { w: printW, h: printH } = pagePx(landscape);
        try {
            // Measure at the true A4 page size so the fit matches the print layout.
            await page.setViewport({ width: printW, height: printH, deviceScaleFactor: 1 });
            await page.setContent(html, { waitUntil: "networkidle0" });
            const pdfOpts = (scale) => ({
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
                // Fit-to-page via CSS `zoom` baked into the DOM, then print at
                // scale 1. Chrome's page.pdf `scale` shrinks the raster in a way
                // that does NOT match getBoundingClientRect (used for the GT), so
                // scaled pages had ~1% box drift. `zoom` is a real layout property
                // that BOTH the measurement and page.pdf see identically, so the
                // GT lands exactly on the printed content. finalScale stays 1
                // because the zoom is already reflected in the measured coords.
                let z = await fitScale(page, printH, printW);
                await page.evaluate((zz) => { document.body.style.zoom = String(zz); }, z);
                pdf = await page.pdf(pdfOpts(1));
                for (let attempt = 0; attempt < 5; attempt++) {
                    const pages = (await PDFDocument.load(pdf)).getPageCount();
                    if (pages <= 1 || z <= 0.29) {
                        break;
                    }
                    z = Math.max(0.28, z * 0.88);
                    await page.evaluate((zz) => { document.body.style.zoom = String(zz); }, z);
                    pdf = await page.pdf(pdfOpts(1));
                }
                finalScale = 1;
            }
            pageCount = (await PDFDocument.load(pdf)).getPageCount();
            // --multipage: emit one RANDOM page of a multi-page doc, re-rendered
            // as a standalone single page with matching ground truth.
            if (doc.huge && args.multipage && pageCount > 1) {
                const res = await emitRandomPage({ doc, template, rng, id, browser, pdfOpts, printH, printW, pageCount });
                if (res) {
                    pdf = res.pdf;
                    finalScale = res.scale;
                    pageCount = (await PDFDocument.load(pdf)).getPageCount();
                    // The emitted page is a different document than what `page`
                    // holds — reload it so layout GT measures the right DOM.
                    await page.setContent(res.html, { waitUntil: "networkidle0" });
                }
            }
            await fs.writeFile(path.join(outDir, `${id}.pdf`), pdf);
            // Layout ground truth needs per-element bounding boxes (single page
            // only), measured at the PRINT layout and pixel-validated. The cells
            // sidecar shares the same measurement pass (with per-cell boxes on).
            if ((wantLayout || wantCells) && pageCount === 1) {
                measured = await measureAtPrintLayout(page, printW, printH, finalScale, { tableCells: wantCells });
                if (wantLayout) {
                    layoutGt = await validateLayoutRules(page, layoutTest(doc, measured, finalScale, printW, printH));
                }
            }
            // Copy the PDF into the sibling datasets (layout only when its GT
            // survived pixel validation).
            if (wantText) { await fs.writeFile(path.join(textDir, `${id}.pdf`), pdf); }
            if (wantLayout && pageCount === 1 && layoutGt && layoutGt.valid) { await fs.writeFile(path.join(layoutDir, `${id}.pdf`), pdf); }
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
        // Visual table difficulty comes from the template's styling; the
        // structural table_difficulty flag comes from the model.
        const visualDifficulty = tableVisualDifficulty(template);
        const styleFlags = { border_style: template.table && template.table.border, visual_difficulty: visualDifficulty };
        if (args.tests.includes("table") && gt.trim()) {
            const rule = { expected_markdown: gt, ...doc.flags, ...styleFlags };
            if (spansPages) {
                rule.table_continues_across_pages = true;
            }
            if (doc.pageInfo) {
                rule.sampled_page = doc.pageInfo.page;
                rule.source_pages = doc.pageInfo.of;
            }
            await fs.writeFile(path.join(outDir, `${id}.test.json`), `${JSON.stringify(rule, null, 2)}\n`);
        }

        // Per-cell table GT sidecar (<id>.cells.json), keyed by table index —
        // pixel-space cell boxes normalized to [0,1] over the page (x right,
        // y down; the sites.py probe convention). A NEW file alongside the
        // existing outputs; nothing in the existing schemas changes. Single-page
        // docs only (bboxes are per-page), skipped when the page has no table.
        if (wantCells && measured && pageCount === 1) {
            const cellGt = tableCellsGt(measured, finalScale, printW, printH);
            if (cellGt.tables.length) {
                await fs.writeFile(path.join(outDir, `${id}.cells.json`),
                    `${JSON.stringify({ id, page: 1, page_px: { w: printW, h: printH }, ...cellGt }, null, 2)}\n`);
            }
        }

        // Text test (text_extended format).
        if (wantText) {
            await fs.writeFile(path.join(textDir, `${id}.test.json`), `${JSON.stringify(textTest(doc), null, 2)}\n`);
            await fs.writeFile(path.join(textDir, `${id}.md`), pageMarkdown(doc));
        }
        // Layout test (v1.4 format) — single-page docs whose pixel-validated GT
        // survived (invalid pages emit no layout example at all).
        if (wantLayout && layoutGt && layoutGt.valid && pageCount === 1) {
            await fs.writeFile(path.join(layoutDir, `${id}.test.json`), `${JSON.stringify(layoutGt.gt, null, 2)}\n`);
            await fs.writeFile(path.join(layoutDir, `${id}.md`), pageMarkdown(doc));
        }
        // Chart test (charts_core v2.1 format) — one data point per category x series.
        if (wantChart && figures.length) {
            const rules = figures.flatMap((m) => chartDataPoints(m));
            await fs.writeFile(path.join(chartDir, `${id}.test.json`), `${JSON.stringify({ expected_markdown: null, test_rules: rules }, null, 2)}\n`);
        }

        // Save the raw HTML + content/style spec so docs can be re-rendered or
        // varied later without re-calling the LLM.
        if (!args.noHtml) {
            await fs.writeFile(path.join(srcDir, `${id}.html`), html);
            await fs.writeFile(path.join(srcDir, `${id}.gen.json`), `${JSON.stringify({ id, seed: args.seed, index: i, domain: doc.domain, source: doc.source, template: template.name, templateSource: template.source || null, pageCount, crossPageTable: spansPages, flags: { ...doc.flags, ...styleFlags }, layout_gt: layoutGt ? { total: layoutGt.total, dropped: layoutGt.dropped, valid: layoutGt.valid } : undefined, doc }, null, 2)}\n`);
        }

        stats[doc.flags.table_difficulty] = (stats[doc.flags.table_difficulty] || 0) + 1;
        stats.visual[visualDifficulty] = (stats.visual[visualDifficulty] || 0) + 1;
        if (hardVariant) { stats.variants[hardVariant] = (stats.variants[hardVariant] || 0) + 1; }
        for (const k of deltaKinds || []) { stats.delta[k] = (stats.delta[k] || 0) + 1; }
        if (layoutGt) {
            stats.layoutRules += layoutGt.total;
            stats.layoutDropped += layoutGt.dropped;
            if (!layoutGt.valid) { stats.layoutInvalidPages += 1; }
        }
        if (doc.sections.length > 1) { stats.multiTable += 1; }
        if (template.page.columns === 2) { stats.twoCol += 1; }
        stats.byDomain[doc.domain] = (stats.byDomain[doc.domain] || 0) + 1;
    }, (done, total) => {
        if (done % 25 === 0 || done === total) { console.error(`  render ${done}/${total}`); }
    });

    await browser.close();

    if (useLlm) {
        await fs.writeFile(path.join(outDir, "usage.json"), `${JSON.stringify(getGeminiUsage(), null, 2)}\n`);
    }

    console.error(`\nDone: ${args.count} docs -> ${outDir}`);
    console.error(`  difficulty  easy=${stats.easy} medium=${stats.medium} hard=${stats.hard}`);
    console.error(`  visual      easy=${stats.visual.easy} medium=${stats.visual.medium} hard=${stats.visual.hard}${args.hardTableMix ? ` (hard-table-mix=${args.hardTableMix})` : ""}`);
    if (Object.keys(stats.variants).length) {
        console.error(`  hard-mix    ${Object.entries(stats.variants).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    }
    if (Object.keys(stats.delta).length) {
        console.error(`  delta-mix   ${Object.entries(stats.delta).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    }
    if (args.tests.includes("layout")) {
        console.error(`  layout GT   rules=${stats.layoutRules} dropped-by-ink-check=${stats.layoutDropped} invalid-pages=${stats.layoutInvalidPages}`);
    }
    console.error(`  layout      multi-table=${stats.multiTable} two-column=${stats.twoCol}`);
    console.error(`  domains     ${Object.entries(stats.byDomain).map(([k, v]) => `${k}=${v}`).join(" ")}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
