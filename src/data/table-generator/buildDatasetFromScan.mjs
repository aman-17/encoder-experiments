#!/usr/bin/env node
// Rebuild eval datasets from a scanned print package.
//
// Input:
//   - the scanned package PDF, in the same order as the generated package PDF
//   - the package id, used to find <packages-dir>/<PACKAGE_ID>/manifest.json
//
// Output:
//   - <out>/ for table tests
//   - <out>-text/ for text tests
//   - <out>-charts/ for chart tests
//   - <out>-layout/ only when explicitly requested

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import { PDFDocument } from "pdf-lib";

const TEST_DIR_SUFFIX = { table: "", text: "-text", layout: "-layout", chart: "-charts" };
const DEFAULT_TESTS = ["table", "text", "chart"];

function parseArgs(argv) {
    const a = {
        scan: null,
        packageId: null,
        packagesDir: null,
        out: null,
        tests: null,
        clean: false,
        noSkipCover: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--scan") { a.scan = v(); }
        else if (k === "--package-id") { a.packageId = v(); }
        else if (k === "--packages-dir") { a.packagesDir = v(); }
        else if (k === "--out") { a.out = v(); }
        else if (k === "--tests") { a.tests = v().split(",").map((s) => s.trim()).filter(Boolean); }
        else if (k === "--clean") { a.clean = true; }
        else if (k === "--no-skip-cover") { a.noSkipCover = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    if (!a.scan) { throw new Error("--scan <pdf> is required"); }
    if (!a.packageId) { throw new Error("--package-id <id> is required"); }
    if (!a.packagesDir) { throw new Error("--packages-dir <dir> is required"); }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    if (a.tests) {
        for (const t of a.tests) {
            if (!TEST_DIR_SUFFIX.hasOwnProperty(t)) { throw new Error(`unknown test: ${t}`); }
        }
    }
    return a;
}

function resolvePath(p) {
    return path.resolve(p.replace(/^~/, os.homedir()));
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, "utf8"));
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

async function writeSinglePagePdf(scanPdf, pageIndex, outFile) {
    const dst = await PDFDocument.create();
    const [page] = await dst.copyPages(scanPdf, [pageIndex]);
    dst.addPage(page);
    await fs.writeFile(outFile, await dst.save());
}

function testsToEmit(args, manifest) {
    const available = new Set();
    for (const page of manifest.pages || []) {
        for (const test of Object.keys(page.ground_truth || {})) {
            available.add(test);
        }
    }
    const requested = args.tests || DEFAULT_TESTS;
    return requested.filter((test) => available.has(test));
}

async function prepareOutputDirs(outDir, tests, clean) {
    for (const test of tests) {
        const dir = `${outDir}${TEST_DIR_SUFFIX[test]}`;
        if (clean && fssync.existsSync(dir)) {
            fssync.rmSync(dir, { recursive: true, force: true });
        }
        await fs.mkdir(dir, { recursive: true });
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const scanPath = resolvePath(args.scan);
    const packagesDir = resolvePath(args.packagesDir);
    const outDir = resolvePath(args.out);
    const packageDir = path.join(packagesDir, args.packageId);
    const manifestPath = path.join(packageDir, "manifest.json");
    const manifest = await readJson(manifestPath);
    if (manifest.package_id !== args.packageId) {
        throw new Error(`manifest package_id is ${manifest.package_id}, expected ${args.packageId}`);
    }

    const tests = testsToEmit(args, manifest);
    if (tests.length === 0) {
        throw new Error("no requested tests have ground truth in this package");
    }
    await prepareOutputDirs(outDir, tests, args.clean);

    const scanPdf = await PDFDocument.load(await fs.readFile(scanPath));
    const coverPages = args.noSkipCover ? 0 : (manifest.cover_pages || 1);
    const requiredPages = coverPages + manifest.pages.length;
    if (scanPdf.getPageCount() < requiredPages) {
        throw new Error(`scan has ${scanPdf.getPageCount()} page(s), expected at least ${requiredPages}`);
    }

    const datasetManifest = {
        package_id: args.packageId,
        scan_pdf: scanPath,
        source_manifest: manifestPath,
        cover_pages_skipped: coverPages,
        tests,
        pages: [],
    };

    for (let i = 0; i < manifest.pages.length; i++) {
        const page = manifest.pages[i];
        const id = `${args.packageId}_${String(page.order).padStart(3, "0")}_${page.source_id}`;
        const scanPageIndex = coverPages + i;
        const emitted = {};
        for (const test of tests) {
            const gt = page.ground_truth?.[test];
            if (!gt || !gt.test_json) { continue; }
            const dir = `${outDir}${TEST_DIR_SUFFIX[test]}`;
            await writeSinglePagePdf(scanPdf, scanPageIndex, path.join(dir, `${id}.pdf`));
            await copyIfExists(path.join(packageDir, gt.test_json), path.join(dir, `${id}.test.json`));
            if (gt.markdown) {
                await copyIfExists(path.join(packageDir, gt.markdown), path.join(dir, `${id}.md`));
            }
            emitted[test] = true;
        }
        datasetManifest.pages.push({
            id,
            package_order: page.order,
            source_id: page.source_id,
            scan_pdf_page: scanPageIndex + 1,
            tests: Object.keys(emitted),
        });
    }

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "scan_manifest.json"), `${JSON.stringify(datasetManifest, null, 2)}\n`);
    console.error(`Done: rebuilt ${manifest.pages.length} scanned page(s) for tests ${tests.join(", ")} -> ${outDir}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
