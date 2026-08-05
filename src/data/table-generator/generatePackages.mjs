#!/usr/bin/env node
// Build print/scan packages from generated synthetic pages.
//
// A package folder contains:
//   - <PACKAGE_ID>.pdf: cover page + all selected source pages, in print order
//   - manifest.json: machine-readable page order and ground-truth references
//   - pages/: the individual source PDFs used in the package
//   - gt/<test>/: copied ground-truth files for each source page
//   - source/: original generator artifacts, including .gen.json and .html

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { makeRng } from "./rng.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR_SUFFIX = { table: "", text: "-text", layout: "-layout", chart: "-charts" };
const GT_EXTENSIONS = {
    table: [".test.json"],
    text: [".test.json", ".md"],
    layout: [".test.json", ".md"],
    chart: [".test.json"],
};
const PACKAGE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function parseArgs(argv) {
    const a = {
        out: null,
        packageCount: 1,
        lengths: null,
        minPages: null,
        maxPages: null,
        seed: null,
        tests: ["table", "text", "layout", "chart"],
        noLlm: false,
        clean: false,
        keepSource: false,
        llmConcurrency: 50,
        renderConcurrency: 6,
        templatesDir: null,
        chartFocus: null,
        textFocus: null,
        tableFocus: null,
    };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--out") { a.out = v(); }
        else if (k === "--package-count") { a.packageCount = Math.max(1, Number(v())); }
        else if (k === "--lengths") { a.lengths = v().split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0); }
        else if (k === "--min-pages") { a.minPages = Math.max(1, Number(v())); }
        else if (k === "--max-pages") { a.maxPages = Math.max(1, Number(v())); }
        else if (k === "--seed") { a.seed = Number(v()); }
        else if (k === "--tests") { a.tests = v().split(",").map((s) => s.trim()).filter(Boolean); }
        else if (k === "--templates") { a.templatesDir = v(); }
        else if (k === "--llm-concurrency") { a.llmConcurrency = Math.max(1, Number(v())); }
        else if (k === "--render-concurrency") { a.renderConcurrency = Math.max(1, Number(v())); }
        else if (k === "--chart-focus") { a.chartFocus = Number(v()); }
        else if (k === "--text-focus") { a.textFocus = Number(v()); }
        else if (k === "--table-focus") { a.tableFocus = Number(v()); }
        else if (k === "--no-llm") { a.noLlm = true; }
        else if (k === "--clean") { a.clean = true; }
        else if (k === "--keep-source") { a.keepSource = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    if (!a.lengths && (a.minPages == null || a.maxPages == null)) {
        a.lengths = [10];
    }
    if (a.lengths && a.lengths.length === 0) { throw new Error("--lengths must contain at least one positive integer"); }
    if (a.minPages != null && a.maxPages != null && a.minPages > a.maxPages) {
        throw new Error("--min-pages must be <= --max-pages");
    }
    for (const t of a.tests) {
        if (!TEST_DIR_SUFFIX.hasOwnProperty(t)) { throw new Error(`unknown test: ${t}`); }
    }
    if (a.seed == null) { a.seed = (Date.now() & 0x7fffffff) >>> 0; }
    return a;
}

function resolveOut(p) {
    return path.resolve(p.replace(/^~/, os.homedir()));
}

function packageLength(args, rng, packageIndex) {
    if (args.lengths) {
        return args.lengths[packageIndex % args.lengths.length];
    }
    return rng.int(args.minPages, args.maxPages);
}

function randomPackageId(rng) {
    let id = "";
    for (let i = 0; i < 8; i++) {
        id += PACKAGE_ID_ALPHABET[Math.floor(rng() * PACKAGE_ID_ALPHABET.length)];
    }
    return id;
}

async function runNodeScript(script, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--max-old-space-size=4096", script, ...args], {
            cwd: HERE,
            stdio: "inherit",
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) { resolve(); }
            else { reject(new Error(`${path.basename(script)} exited with ${code}`)); }
        });
    });
}

async function listGeneratedIds(baseDir) {
    const files = await fs.readdir(baseDir);
    return files
        .filter((f) => f.endsWith(".pdf"))
        .map((f) => path.basename(f, ".pdf"))
        .sort();
}

async function copyIfExists(src, dst) {
    try {
        await fs.copyFile(src, dst);
        return true;
    } catch (e) {
        if (e && e.code === "ENOENT") { return false; }
        throw e;
    }
}

async function copyGroundTruth({ sourceBaseDir, packageDir, sourceId, outputId, tests }) {
    const entries = {};
    for (const test of tests) {
        const gtDir = path.join(packageDir, "gt", test);
        await fs.mkdir(gtDir, { recursive: true });
        const sourceDir = `${sourceBaseDir}${TEST_DIR_SUFFIX[test]}`;
        for (const ext of GT_EXTENSIONS[test]) {
            const rel = path.join("gt", test, `${outputId}${ext}`);
            const copied = await copyIfExists(path.join(sourceDir, `${sourceId}${ext}`), path.join(packageDir, rel));
            if (copied) {
                entries[test] ||= {};
                entries[test][ext === ".md" ? "markdown" : "test_json"] = rel;
            }
        }
    }
    return entries;
}

async function copySourceArtifacts({ sourceBaseDir, packageDir, sourceId, outputId }) {
    const entries = {};
    const sourceDir = path.join(packageDir, "source");
    await fs.mkdir(sourceDir, { recursive: true });
    for (const [kind, ext] of [["gen_json", ".gen.json"], ["html", ".html"]]) {
        const rel = path.join("source", `${outputId}${ext}`);
        const copied = await copyIfExists(path.join(sourceBaseDir, "src", `${sourceId}${ext}`), path.join(packageDir, rel));
        if (copied) {
            entries[kind] = rel;
        }
    }
    return entries;
}

async function makeCoverPdf(packageId, pageCount) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4 portrait, points
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("PRINT/SCAN PACKAGE", {
        x: 72,
        y: 700,
        size: 22,
        font: bold,
        color: rgb(0.12, 0.14, 0.18),
    });
    page.drawText("PACKAGE ID", {
        x: 72,
        y: 590,
        size: 18,
        font,
        color: rgb(0.28, 0.31, 0.36),
    });
    page.drawText(packageId, {
        x: 72,
        y: 500,
        size: 76,
        font: bold,
        color: rgb(0.02, 0.02, 0.03),
    });
    page.drawText(`${pageCount} document page${pageCount === 1 ? "" : "s"} follow this cover page.`, {
        x: 72,
        y: 420,
        size: 16,
        font,
        color: rgb(0.28, 0.31, 0.36),
    });
    return pdf.save();
}

async function appendPdf(target, pdfBytes) {
    const src = await PDFDocument.load(pdfBytes);
    const copied = await target.copyPages(src, src.getPageIndices());
    for (const page of copied) {
        target.addPage(page);
    }
    return copied.length;
}

async function buildPackage({ outDir, sourceBaseDir, ids, startIndex, pageCount, packageId, tests }) {
    const packageDir = path.join(outDir, packageId);
    await fs.mkdir(path.join(packageDir, "pages"), { recursive: true });
    const merged = await PDFDocument.create();
    await appendPdf(merged, await makeCoverPdf(packageId, pageCount));

    const manifest = {
        package_id: packageId,
        generated_at: new Date().toISOString(),
        package_pdf: `${packageId}.pdf`,
        cover_pages: 1,
        page_count: pageCount,
        tests,
        pages: [],
    };

    for (let offset = 0; offset < pageCount; offset++) {
        const sourceId = ids[startIndex + offset];
        const order = offset + 1;
        const outputId = `${String(order).padStart(3, "0")}_${sourceId}`;
        const pageRel = path.join("pages", `${outputId}.pdf`);
        const pageBytes = await fs.readFile(path.join(sourceBaseDir, `${sourceId}.pdf`));
        await fs.writeFile(path.join(packageDir, pageRel), pageBytes);
        await appendPdf(merged, pageBytes);
        const groundTruth = await copyGroundTruth({ sourceBaseDir, packageDir, sourceId, outputId, tests });
        const source = await copySourceArtifacts({ sourceBaseDir, packageDir, sourceId, outputId });
        manifest.pages.push({
            order,
            source_id: sourceId,
            page_pdf: pageRel,
            ground_truth: groundTruth,
            source,
        });
    }

    await fs.writeFile(path.join(packageDir, `${packageId}.pdf`), await merged.save());
    await fs.writeFile(path.join(packageDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const outDir = resolveOut(args.out);
    const rng = makeRng(args.seed >>> 0);
    const lengths = Array.from({ length: args.packageCount }, (_, i) => packageLength(args, rng, i));
    const totalPages = lengths.reduce((a, b) => a + b, 0);

    if (args.clean && fssync.existsSync(outDir)) {
        fssync.rmSync(outDir, { recursive: true, force: true });
    }
    await fs.mkdir(outDir, { recursive: true });

    const sourceParent = args.keepSource
        ? path.join(outDir, "_source")
        : await fs.mkdtemp(path.join(os.tmpdir(), "tablegen-packages-"));
    const sourceBaseDir = path.join(sourceParent, "pages");
    await fs.mkdir(sourceParent, { recursive: true });

    const genArgs = [
        "--out", sourceBaseDir,
        "--count", String(totalPages),
        "--seed", String(args.seed),
        "--tests", args.tests.join(","),
        "--llm-concurrency", String(args.llmConcurrency),
        "--render-concurrency", String(args.renderConcurrency),
        "--clean",
    ];
    if (args.noLlm) { genArgs.push("--no-llm"); }
    if (args.templatesDir) { genArgs.push("--templates", args.templatesDir); }
    if (args.chartFocus != null) { genArgs.push("--chart-focus", String(args.chartFocus)); }
    if (args.textFocus != null) { genArgs.push("--text-focus", String(args.textFocus)); }
    if (args.tableFocus != null) { genArgs.push("--table-focus", String(args.tableFocus)); }

    console.error(`Generating ${totalPages} source page(s) for ${lengths.length} package(s).`);
    await runNodeScript(path.join(HERE, "generateTables.mjs"), genArgs);

    const ids = await listGeneratedIds(sourceBaseDir);
    if (ids.length < totalPages) {
        throw new Error(`expected ${totalPages} generated PDFs, found ${ids.length}`);
    }

    const used = new Set();
    let cursor = 0;
    for (let i = 0; i < lengths.length; i++) {
        let packageId;
        do {
            packageId = randomPackageId(rng);
        } while (used.has(packageId) || fssync.existsSync(path.join(outDir, packageId)));
        used.add(packageId);
        await buildPackage({ outDir, sourceBaseDir, ids, startIndex: cursor, pageCount: lengths[i], packageId, tests: args.tests });
        console.error(`Package ${packageId}: ${lengths[i]} page(s) -> ${path.join(outDir, packageId, `${packageId}.pdf`)}`);
        cursor += lengths[i];
    }

    if (!args.keepSource) {
        fssync.rmSync(sourceParent, { recursive: true, force: true });
    }
    console.error(`Done: ${lengths.length} package(s) -> ${outDir}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
