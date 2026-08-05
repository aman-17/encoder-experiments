#!/usr/bin/env node
// Batch rebuild eval datasets from scanned print-package PDFs.
//
// Each scanned PDF filename must start with the 8-character package id, e.g.
//   KUZ6WD3X.pdf
//   KUZ6WD3X_scan.pdf
//
// The script finds the matching package manifest under one of the provided
// --packages-dir roots, skips the cover page, splits scanned pages into
// per-page PDFs, and copies the package ground truth into benchmark folders.

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import { PDFDocument } from "pdf-lib";

const TEST_DIR_SUFFIX = { table: "", text: "-text", layout: "-layout", chart: "-charts" };
const DEFAULT_TESTS = ["table", "text", "chart"];
const PACKAGE_ID_RE = /^[A-Z0-9]{8}/;
const DEFAULT_MAX_ID_DISTANCE = 2;

function parseArgs(argv) {
    const a = {
        scansDir: null,
        packagesDirs: [],
        out: null,
        tests: null,
        clean: false,
        noSkipCover: false,
        maxIdDistance: DEFAULT_MAX_ID_DISTANCE,
    };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--scans-dir") { a.scansDir = v(); }
        else if (k === "--packages-dir") { a.packagesDirs.push(...v().split(",").map((s) => s.trim()).filter(Boolean)); }
        else if (k === "--out") { a.out = v(); }
        else if (k === "--tests") { a.tests = v().split(",").map((s) => s.trim()).filter(Boolean); }
        else if (k === "--max-id-distance") { a.maxIdDistance = Math.max(0, Number(v())); }
        else if (k === "--clean") { a.clean = true; }
        else if (k === "--no-skip-cover") { a.noSkipCover = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    if (!a.scansDir) { throw new Error("--scans-dir <dir> is required"); }
    if (!a.packagesDirs.length) { throw new Error("--packages-dir <dir> is required; pass it more than once for multiple package roots"); }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    for (const t of a.tests || []) {
        if (!TEST_DIR_SUFFIX.hasOwnProperty(t)) { throw new Error(`unknown test: ${t}`); }
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

async function listScanPdfs(scansDir) {
    const entries = await fs.readdir(scansDir, { withFileTypes: true });
    return entries
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".pdf"))
        .map((d) => path.join(scansDir, d.name))
        .sort();
}

function packageIdFromFilename(file) {
    const m = path.basename(file, path.extname(file)).toUpperCase().match(PACKAGE_ID_RE);
    return m ? m[0] : null;
}

function editDistance(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const curr = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost,
            );
        }
        prev.splice(0, prev.length, ...curr);
    }
    return prev[b.length];
}

async function indexPackages(packagesDirs) {
    const byId = new Map();
    for (const root of packagesDirs) {
        const entries = await fs.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory() || !/^[A-Z0-9]{8}$/.test(entry.name)) { continue; }
            const packageDir = path.join(root, entry.name);
            const manifestPath = path.join(packageDir, "manifest.json");
            if (!fssync.existsSync(manifestPath)) { continue; }
            if (!byId.has(entry.name)) {
                byId.set(entry.name, { packageDir, manifestPath });
            }
        }
    }
    return byId;
}

async function resolvePackageForScan(scanPath, packageIndex, maxDistance) {
    const basename = path.basename(scanPath, path.extname(scanPath)).toUpperCase();
    const exactId = packageIdFromFilename(scanPath);
    if (exactId && packageIndex.has(exactId)) {
        const hit = packageIndex.get(exactId);
        const manifest = await readJson(hit.manifestPath);
        if (manifest.package_id !== exactId) {
            throw new Error(`${hit.manifestPath} has package_id=${manifest.package_id}, expected ${exactId}`);
        }
        return { packageId: exactId, correctedFrom: null, packageDir: hit.packageDir, manifestPath: hit.manifestPath, manifest };
    }

    const candidates = [];
    for (const [packageId, hit] of packageIndex.entries()) {
        const prefix = basename.slice(0, 8);
        const windows = new Set([prefix]);
        for (let i = 0; i <= Math.max(0, basename.length - 8); i++) {
            windows.add(basename.slice(i, i + 8));
        }
        let best = Infinity;
        for (const w of windows) {
            if (w.length >= 6) {
                best = Math.min(best, editDistance(w, packageId));
            }
        }
        if (best <= maxDistance) {
            candidates.push({ packageId, hit, distance: best });
        }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.packageId.localeCompare(b.packageId));
    if (!candidates.length) {
        throw new Error(`no package id match for scan ${scanPath}; filename should start with a package id, or be within edit distance ${maxDistance}`);
    }
    if (candidates.length > 1 && candidates[0].distance === candidates[1].distance) {
        throw new Error(`ambiguous package id for scan ${scanPath}: ${candidates.slice(0, 5).map((c) => `${c.packageId}(d=${c.distance})`).join(", ")}`);
    }
    const best = candidates[0];
    const manifest = await readJson(best.hit.manifestPath);
    if (manifest.package_id !== best.packageId) {
        throw new Error(`${best.hit.manifestPath} has package_id=${manifest.package_id}, expected ${best.packageId}`);
    }
    return {
        packageId: best.packageId,
        correctedFrom: exactId || basename.slice(0, 8),
        packageDir: best.hit.packageDir,
        manifestPath: best.hit.manifestPath,
        manifest,
    };
}

function testsToEmit(requested, manifest) {
    const available = new Set();
    for (const page of manifest.pages || []) {
        for (const test of Object.keys(page.ground_truth || {})) {
            available.add(test);
        }
    }
    return (requested || DEFAULT_TESTS).filter((test) => available.has(test));
}

async function prepareOutputDirs(outDir, tests, clean) {
    const unique = new Set(tests);
    for (const test of unique) {
        const dir = `${outDir}${TEST_DIR_SUFFIX[test]}`;
        if (clean && fssync.existsSync(dir)) {
            fssync.rmSync(dir, { recursive: true, force: true });
        }
        await fs.mkdir(dir, { recursive: true });
    }
    await fs.mkdir(path.join(outDir, "scan_manifests"), { recursive: true });
}

async function writeSinglePagePdf(scanPdf, pageIndex, outFile) {
    const dst = await PDFDocument.create();
    const [page] = await dst.copyPages(scanPdf, [pageIndex]);
    dst.addPage(page);
    await fs.writeFile(outFile, await dst.save());
}

async function processScan({ scanPath, packageInfo, outDir, requestedTests, noSkipCover }) {
    const { packageDir, manifestPath, manifest } = packageInfo;
    const tests = testsToEmit(requestedTests, manifest);
    if (!tests.length) {
        throw new Error(`package ${manifest.package_id} has none of the requested GT families`);
    }
    const scanPdf = await PDFDocument.load(await fs.readFile(scanPath));
    const coverPages = noSkipCover ? 0 : (manifest.cover_pages || 1);
    const requiredPages = coverPages + manifest.pages.length;
    const actualPages = scanPdf.getPageCount();
    if (actualPages !== requiredPages) {
        throw new Error(`${scanPath} has ${actualPages} page(s), expected exactly ${requiredPages} (${coverPages} cover + ${manifest.pages.length} document pages)`);
    }

    const datasetManifest = {
        package_id: manifest.package_id,
        scan_pdf: scanPath,
        source_manifest: manifestPath,
        corrected_from_filename_id: packageInfo.correctedFrom || null,
        cover_pages_skipped: coverPages,
        tests,
        pages: [],
    };

    for (let i = 0; i < manifest.pages.length; i++) {
        const page = manifest.pages[i];
        const id = `${manifest.package_id}_${String(page.order).padStart(3, "0")}_${page.source_id}`;
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
    await fs.writeFile(
        path.join(outDir, "scan_manifests", `${manifest.package_id}.json`),
        `${JSON.stringify(datasetManifest, null, 2)}\n`,
    );
    return { packageId: manifest.package_id, pages: manifest.pages.length, tests };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const scansDir = resolvePath(args.scansDir);
    const packagesDirs = args.packagesDirs.map(resolvePath);
    const outDir = resolvePath(args.out);
    const scans = await listScanPdfs(scansDir);
    if (!scans.length) {
        throw new Error(`no PDF scans found in ${scansDir}`);
    }

    if (args.clean) {
        for (const suffix of Object.values(TEST_DIR_SUFFIX)) {
            const dir = `${outDir}${suffix}`;
            if (fssync.existsSync(dir)) {
                fssync.rmSync(dir, { recursive: true, force: true });
            }
        }
    }

    const packageIndex = await indexPackages(packagesDirs);
    if (!packageIndex.size) {
        throw new Error(`no package manifests found under ${packagesDirs.join(", ")}`);
    }

    const allTests = new Set(args.tests || DEFAULT_TESTS);
    await prepareOutputDirs(outDir, allTests, false);

    const summary = [];
    for (const scanPath of scans) {
        const packageInfo = await resolvePackageForScan(scanPath, packageIndex, args.maxIdDistance);
        const result = await processScan({
            scanPath,
            packageInfo,
            outDir,
            requestedTests: args.tests,
            noSkipCover: args.noSkipCover,
        });
        summary.push({ ...result, scan_pdf: scanPath, corrected_from_filename_id: packageInfo.correctedFrom || null });
        const correction = packageInfo.correctedFrom ? ` (matched filename id ${packageInfo.correctedFrom} -> ${packageInfo.packageId})` : "";
        console.error(`Processed ${packageInfo.packageId}${correction}: ${result.pages} page(s), tests=${result.tests.join(",")}`);
    }

    const aggregate = {
        generated_at: new Date().toISOString(),
        scans_dir: scansDir,
        packages_dirs: packagesDirs,
        out: outDir,
        package_count: summary.length,
        page_count: summary.reduce((n, r) => n + r.pages, 0),
        packages: summary,
    };
    await fs.writeFile(path.join(outDir, "scan_batch_manifest.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
    console.error(`Done: ${aggregate.package_count} package scan(s), ${aggregate.page_count} page(s) -> ${outDir}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
