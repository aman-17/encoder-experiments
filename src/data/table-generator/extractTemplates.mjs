// CLI: scan a directory of PDFs and emit a style "template" JSON per PDF for
// the generator to reuse (generateTables.mjs --templates <dir>).
//
//   node extractTemplates.mjs --pdfs <dir> --out <templates-dir>
//        [--limit N] [--concurrency 50] [--no-llm]
//
// Per PDF we mechanically extract the hard facts — real font names (pdffonts),
// body/heading font sizes and margins (pdftotext -bbox), page size (pdfinfo) —
// then hand those facts plus a render of page 1 to Gemini 3.1 Flash Lite, which
// ASSIGNS the visual style (table border/header style, colors, zebra, density,
// columns). The font families and sizes stay grounded in the real PDF.

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { geminiJson, hasGeminiKey, mapPool } from "./gemini.mjs";
import { parsePdffonts } from "./fontUtil.mjs";
import { mapToGoogle, familyStack } from "./googleFonts.mjs";

function parseArgs(argv) {
    const a = { pdfs: null, out: null, limit: 0, concurrency: 50, noLlm: false };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--pdfs") { a.pdfs = v(); }
        else if (k === "--out") { a.out = v(); }
        else if (k === "--limit") { a.limit = Number(v()); }
        else if (k === "--concurrency") { a.concurrency = Math.max(1, Number(v())); }
        else if (k === "--no-llm") { a.noLlm = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    if (!a.pdfs || !a.out) { throw new Error("--pdfs <dir> and --out <dir> are required"); }
    return a;
}

const exp = (p) => p.replace(/^~/, os.homedir());

function run(cmd, args) {
    return execFileSync(cmd, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, timeout: 30000 });
}

const PAGE_PRESETS = [
    { name: "Letter", w: 612, h: 792 },
    { name: "A4", w: 595.3, h: 841.9 },
];

function nearestPage(w, h) {
    let best = PAGE_PRESETS[0];
    let bestD = Infinity;
    for (const p of PAGE_PRESETS) {
        const d = Math.abs(p.w - w) + Math.abs(p.h - h);
        if (d < bestD) { bestD = d; best = p; }
    }
    return best;
}

function median(nums) {
    if (!nums.length) { return 0; }
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

// Cluster heading-size candidates (heights notably larger than body) into up to
// 3 descending sizes.
function headingClusters(heights, bodyPt) {
    const big = heights.filter((h) => h > bodyPt * 1.25);
    const buckets = [];
    for (const h of big.sort((a, b) => b - a)) {
        const hit = buckets.find((b) => Math.abs(b.size - h) <= 1);
        if (hit) { hit.count++; } else { buckets.push({ size: h, count: 1 }); }
    }
    return buckets.sort((a, b) => b.size - a.size).slice(0, 3).map((b) => b.size);
}

// Extract mechanical facts from a PDF's first page.
function extractFacts(pdfPath, workDir) {
    const fonts = parsePdffonts(run("pdffonts", [pdfPath]));
    const info = run("pdfinfo", [pdfPath]);
    const sizeMatch = info.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/);
    const pw = sizeMatch ? Number(sizeMatch[1]) : 612;
    const ph = sizeMatch ? Number(sizeMatch[2]) : 792;
    const preset = nearestPage(pw, ph);

    // word boxes from page 1
    const bbox = run("pdftotext", ["-bbox", "-f", "1", "-l", "1", pdfPath, "-"]);
    const boxes = [];
    const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g;
    let m;
    while ((m = re.exec(bbox)) !== null) {
        boxes.push({ xMin: +m[1], yMin: +m[2], xMax: +m[3], yMax: +m[4], h: +m[4] - +m[2] });
    }
    const heights = boxes.map((b) => b.h).filter((h) => h > 1 && h < ph / 4);
    const bodyPt = median(heights) || 10;
    const headPts = headingClusters(heights, bodyPt);

    let marginIn = 0.75;
    if (boxes.length) {
        const left = Math.min(...boxes.map((b) => b.xMin));
        const right = pw - Math.max(...boxes.map((b) => b.xMax));
        const top = Math.min(...boxes.map((b) => b.yMin));
        const bot = ph - Math.max(...boxes.map((b) => b.yMax));
        marginIn = Math.max(0.3, Math.min(1.2, ((left + right + top + bot) / 4) / 72));
    }

    // pick a body font (first embedded text font) and a heading font (a bold one if present)
    const textFonts = fonts.filter((f) => !/Type 3/i.test(f.type));
    const bodyFont = textFonts[0] || fonts[0] || { name: "Helvetica" };
    const boldFont = textFonts.find((f) => /bold|black|heavy|semibold|65|75/i.test(f.name)) || bodyFont;

    const ptToPx = (pt) => Math.round(pt * 96 / 72);

    return {
        pageName: preset.name,
        marginIn: Number(marginIn.toFixed(2)),
        bodyFont: bodyFont.name,
        headingFont: boldFont.name,
        fontNames: fonts.map((f) => f.name),
        bodyPx: Math.max(9, Math.min(15, ptToPx(bodyPt))),
        tablePx: Math.max(8, Math.min(13, ptToPx(bodyPt * 0.92))),
        headingPx: headPts.map(ptToPx),
    };
}

const STYLE_SCHEMA = {
    type: "object",
    properties: {
        pageColumns: { type: "integer" },
        density: { type: "string" },
        bodyColor: { type: "string" },
        h1Color: { type: "string" },
        h2Color: { type: "string" },
        h3Color: { type: "string" },
        tableBorder: { type: "string" },
        borderColor: { type: "string" },
        borderWidthPx: { type: "integer" },
        headerStyle: { type: "string" },
        headerBg: { type: "string" },
        headerColor: { type: "string" },
        zebra: { type: "boolean" },
        zebraColor: { type: "string" },
        tableWidth: { type: "string" },
        numericAlign: { type: "string" },
        pageOrientation: { type: "string" },
        bodyAlign: { type: "string" },
        lineSpacing: { type: "string" },
        letterSpacing: { type: "string" },
        hasHeader: { type: "boolean" },
        headerAlign: { type: "string" },
        hasFooter: { type: "boolean" },
        footerAlign: { type: "string" },
        hasWatermark: { type: "boolean" },
        watermarkText: { type: "string" },
        watermarkColor: { type: "string" },
        pageBg: { type: "string" },
    },
    required: ["pageColumns", "density", "bodyColor", "h1Color", "h2Color", "h3Color", "tableBorder", "borderColor", "borderWidthPx", "headerStyle", "headerBg", "headerColor", "zebra", "zebraColor", "tableWidth", "numericAlign", "pageOrientation", "bodyAlign", "lineSpacing", "letterSpacing", "hasHeader", "headerAlign", "hasFooter", "footerAlign", "hasWatermark", "watermarkText", "watermarkColor", "pageBg"],
};

function stylePrompt(facts) {
    return [
        "You are assigning a reusable visual STYLE TEMPLATE for a document generator, based on a real document page.",
        "You are given a render of page 1 and these mechanically-extracted facts:",
        JSON.stringify({ pageSize: facts.pageName, marginInches: facts.marginIn, bodyFont: facts.bodyFont, fonts: facts.fontNames.slice(0, 6), bodyFontPx: facts.bodyPx }, null, 0),
        "",
        "Look at the image and return the style as JSON matching the schema. Guidance:",
        "- pageColumns: 1 or 2 (does body text flow in two columns?).",
        "- density: 'compact' | 'normal' | 'spacious' (table cell padding feel).",
        "- Colors are hex like '#1a3c5e' (or 'transparent' for headerBg if none).",
        "- tableBorder: one of 'grid','horizontal','header-only','none','box','outer-grid' — match the table's rule style.",
        "- headerStyle: 'band' (filled header background), 'bold-line' (bold text + bottom rule), or 'plain-bold'.",
        "- headerBg/headerColor: the table header background and text color you see.",
        "- zebra: true if alternating row shading is present; zebraColor its shade.",
        "- numericAlign: 'right' if numeric columns are right-aligned, else 'left'.",
        "- pageOrientation: 'portrait' or 'landscape'.",
        "- bodyAlign: alignment of body paragraphs — 'left' | 'justify' | 'right' | 'center'.",
        "- lineSpacing: 'tight' | 'normal' | 'loose'. letterSpacing: 'tight' | 'normal' | 'wide'.",
        "- hasHeader/hasFooter: is there a running header/footer band (small repeated text, page number, rule)? headerAlign/footerAlign: 'left'|'center'|'right'.",
        "- hasWatermark: is there a faint diagonal/background watermark? If so, watermarkText is its text (e.g. DRAFT, CONFIDENTIAL) and watermarkColor its hex; else watermarkText='' and watermarkColor='#999999'.",
        "- bodyColor: the main body TEXT color (hex). pageBg: the page BACKGROUND color (hex) — usually '#ffffff', but capture a tint/off-white/colored background if present.",
        "Return ONLY the JSON object.",
    ].join("\n");
}

const PADDING = {
    compact: { x: 4, y: 2 },
    normal: { x: 8, y: 4 },
    spacious: { x: 12, y: 7 },
};

const LINE_SPACING = { tight: 1.18, normal: 1.35, loose: 1.55 };
const LETTER_SPACING = { tight: 0, normal: 0, wide: 0.4 };
const ALIGNS = ["left", "justify", "right", "center"];

function assembleTemplate(name, facts, style, srcBasename, logo) {
    // Map the PDF's real fonts to the closest bundled Google family (full glyph
    // coverage so it renders our generated text).
    const bodyFamily = mapToGoogle(facts.bodyFont);
    const tableFamily = mapToGoogle(facts.headingFont || facts.bodyFont);
    const pad = PADDING[style.density] || PADDING.normal;
    const h = facts.headingPx;
    const h1 = h[0] || Math.round(facts.bodyPx * 1.8);
    const h2 = h[1] || Math.round(facts.bodyPx * 1.4);
    const h3 = h[2] || Math.round(facts.bodyPx * 1.15);
    const accent = style.h1Color || style.borderColor || "#444";

    const bg = String(style.pageBg || "").toLowerCase();
    const tint = (bg && /^#[0-9a-f]{6}$/.test(bg) && !["#ffffff", "#fefefe", "#fdfdfd"].includes(bg)) ? bg : "none";
    const decor = {
        accent,
        tint,
        bodyAlign: ALIGNS.includes(style.bodyAlign) ? style.bodyAlign : "left",
        lineHeight: LINE_SPACING[style.lineSpacing] || 1.35,
        letterSpacingPx: LETTER_SPACING[style.letterSpacing] ?? 0,
        header: style.hasHeader ? { show: true, rule: true, align: ["left", "center", "right"].includes(style.headerAlign) ? style.headerAlign : "left", upper: false } : { show: false },
        footer: style.hasFooter ? { show: true, rule: true, align: ["left", "center", "right"].includes(style.footerAlign) ? style.footerAlign : "left", pageNo: true } : { show: false },
        captured: true,
    };
    const watermark = (style.hasWatermark && style.watermarkText)
        ? { text: String(style.watermarkText).slice(0, 32), color: style.watermarkColor || "#999999", opacity: 0.1, angle: -30 }
        : null;

    return {
        name,
        source: srcBasename,
        sourceFonts: facts.fontNames.slice(0, 8),
        page: {
            size: facts.pageName,
            marginIn: facts.marginIn,
            columns: style.pageColumns === 2 ? 2 : 1,
            orientation: style.pageOrientation === "landscape" ? "landscape" : "portrait",
        },
        decor,
        watermark,
        logo: logo || null,
        body: {
            fontFamily: bodyFamily,
            fontStack: familyStack(bodyFamily),
            fontSizePx: facts.bodyPx,
            color: style.bodyColor || "#1a1a1a",
        },
        headings: {
            h1: { fontSizePx: h1, weight: 700, color: style.h1Color || "#111" },
            h2: { fontSizePx: h2, weight: 700, color: style.h2Color || "#222" },
            h3: { fontSizePx: h3, weight: 600, color: style.h3Color || "#333" },
        },
        table: {
            fontFamily: tableFamily,
            fontStack: familyStack(tableFamily),
            fontSizePx: facts.tablePx,
            lineHeight: style.density === "spacious" ? 1.4 : style.density === "compact" ? 1.15 : 1.3,
            border: ["grid", "horizontal", "header-only", "none", "box", "outer-grid"].includes(style.tableBorder) ? style.tableBorder : "grid",
            borderColor: style.borderColor || "#888",
            borderWidthPx: style.borderWidthPx >= 1 && style.borderWidthPx <= 3 ? style.borderWidthPx : 1,
            headerStyle: ["band", "bold-line", "plain-bold"].includes(style.headerStyle) ? style.headerStyle : "band",
            headerBg: style.headerBg || "transparent",
            headerColor: style.headerColor || "#111",
            zebra: Boolean(style.zebra),
            zebraColor: style.zebraColor || "#f3f3f3",
            cellPadXPx: pad.x,
            cellPadYPx: pad.y,
            width: style.tableWidth === "auto" ? "auto" : "100%",
            numericAlign: style.numericAlign === "left" ? "left" : "right",
        },
    };
}

// Try to pull a small logo-like raster from page 1 and save it into the bank's
// assets/ folder. Returns { src, align } or null. Heuristic: a page-1 image of
// modest size and sane aspect ratio (skip full-page scans / hairlines).
function extractLogo(pdfPath, workDir, outDir, safe) {
    let list;
    try {
        list = run("pdfimages", ["-list", "-f", "1", "-l", "1", pdfPath]);
    } catch {
        return null;
    }
    const rows = list.split("\n").map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 5 && /^\d+$/.test(c[1]));
    let best = -1;
    let bestArea = 0;
    rows.forEach((c, idx) => {
        const w = Number(c[3]);
        const h = Number(c[4]);
        if (!(w > 0 && h > 0)) { return; }
        const ar = w / h;
        const ok = w >= 40 && w <= 900 && h >= 16 && h <= 320 && ar >= 0.4 && ar <= 12 && w * h <= 900 * 320;
        if (ok && w * h > bestArea) { bestArea = w * h; best = idx; }
    });
    if (best < 0) {
        return null;
    }
    try {
        run("pdfimages", ["-png", "-f", "1", "-l", "1", pdfPath, path.join(workDir, "img")]);
    } catch {
        return null;
    }
    const pngs = fssync.readdirSync(workDir).filter((f) => /^img-\d+\.png$/i.test(f)).sort();
    if (!pngs[best]) {
        return null;
    }
    const assetsDir = path.join(outDir, "assets");
    fssync.mkdirSync(assetsDir, { recursive: true });
    const dest = path.join(assetsDir, `${safe}.png`);
    fssync.copyFileSync(path.join(workDir, pngs[best]), dest);
    return { src: `assets/${safe}.png`, align: "left" };
}

async function processPdf(pdfPath, outDir, useLlm) {
    const base = path.basename(pdfPath).replace(/\.pdf$/i, "");
    const safe = base.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
    const workDir = fssync.mkdtempSync(path.join(os.tmpdir(), "tmpl-"));
    try {
        const facts = extractFacts(pdfPath, workDir);
        let style = {};
        if (useLlm) {
            const pngPrefix = path.join(workDir, "p");
            run("pdftoppm", ["-png", "-r", "110", "-f", "1", "-l", "1", pdfPath, pngPrefix]);
            const png = fssync.readdirSync(workDir).find((f) => f.endsWith(".png"));
            if (png) {
                style = await geminiJson({ prompt: stylePrompt(facts), schema: STYLE_SCHEMA, imagePath: path.join(workDir, png), temperature: 0.4 });
            }
        }
        let logo = null;
        try {
            logo = extractLogo(pdfPath, workDir, outDir, safe);
        } catch {
            logo = null;
        }
        const template = assembleTemplate(`tmpl_${safe}`, facts, style, path.basename(pdfPath), logo);
        await fs.writeFile(path.join(outDir, `tmpl_${safe}.json`), `${JSON.stringify(template, null, 2)}\n`);
        return { ok: true, base, columns: template.page.columns, border: template.table.border, logo: Boolean(logo), watermark: Boolean(template.watermark), font: template.body.fontFamily };
    } catch (e) {
        return { ok: false, base, error: String(e.message || e).split("\n")[0] };
    } finally {
        fssync.rmSync(workDir, { recursive: true, force: true });
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const pdfDir = path.resolve(exp(args.pdfs));
    const outDir = path.resolve(exp(args.out));
    await fs.mkdir(outDir, { recursive: true });

    let pdfs = fssync.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf")).map((f) => path.join(pdfDir, f));
    if (args.limit > 0) {
        pdfs = pdfs.slice(0, args.limit);
    }
    const useLlm = !args.noLlm && hasGeminiKey();
    console.error(`Extracting ${pdfs.length} template(s) -> ${outDir} (${useLlm ? `Gemini vision, concurrency=${args.concurrency}` : "facts only, no-llm"})`);

    let ok = 0;
    let fail = 0;
    const results = await mapPool(pdfs, useLlm ? args.concurrency : Math.min(8, args.concurrency), (p) => processPdf(p, outDir, useLlm), (done, total) => {
        if (done % 25 === 0 || done === total) { console.error(`  ${done}/${total}`); }
    });
    for (const r of results) {
        if (r.ok) { ok++; } else { fail++; console.error(`  ! ${r.base}: ${r.error}`); }
    }
    console.error(`\nDone: ${ok} templates, ${fail} failed.`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
