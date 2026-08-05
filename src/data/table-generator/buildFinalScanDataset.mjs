#!/usr/bin/env node
// Build a shareable page-centric dataset from scanbatch output.
//
// Input is the output folder produced by buildDatasetFromScanBatch.mjs:
//   <scan-dataset>/scan_batch_manifest.json
//   <scan-dataset>/scan_manifests/<PACKAGE_ID>.json
//   <scan-dataset>{,-text,-charts}/<PAGE_ID>.pdf
//
// Output is:
//   <out>/pages/<PACKAGE_ID>/<ORDER>_<SOURCE_ID>/
//     original.pdf
//     scan.pdf
//     gt/{table,chart,text,layout}.test.json
//     gt/page.md
//     source/{gen.json,source.html}
//     page_manifest.json

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";

function parseArgs(argv) {
    const a = { scanDataset: null, out: null, clean: false };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = () => argv[++i];
        if (k === "--scan-dataset") { a.scanDataset = v(); }
        else if (k === "--out") { a.out = v(); }
        else if (k === "--clean") { a.clean = true; }
        else { throw new Error(`unknown arg: ${k}`); }
    }
    if (!a.scanDataset) { throw new Error("--scan-dataset <dir> is required"); }
    if (!a.out) { throw new Error("--out <dir> is required"); }
    return a;
}

function resolvePath(p) {
    return path.resolve(p.replace(/^~/, os.homedir()));
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, "utf8"));
}

async function copyIfExists(src, dst) {
    if (!src || !fssync.existsSync(src)) { return null; }
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
    return dst;
}

function safeSourcePart(sourceId) {
    return String(sourceId || "").replace(/[^A-Za-z0-9._-]/g, "_");
}

function firstExisting(paths) {
    return paths.find((p) => fssync.existsSync(p)) || null;
}

function gtPath(packageDir, gtEntry, field) {
    return gtEntry?.[field] ? path.join(packageDir, gtEntry[field]) : null;
}

function makeRel(outDir) {
    return (p) => p ? path.relative(outDir, p) : null;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const scanDataset = resolvePath(args.scanDataset);
    const outDir = resolvePath(args.out);
    const rel = makeRel(outDir);
    const scanBatchManifestPath = path.join(scanDataset, "scan_batch_manifest.json");
    const scanPageDirs = [scanDataset, `${scanDataset}-text`, `${scanDataset}-charts`];

    if (args.clean) {
        await fs.rm(outDir, { recursive: true, force: true });
    }
    await fs.mkdir(outDir, { recursive: true });

    const scanBatch = await readJson(scanBatchManifestPath);
    const finalManifest = {
        dataset_type: "printshop_scan_page_pairs",
        generated_at: new Date().toISOString(),
        source_scan_batch_manifest: scanBatchManifestPath,
        source_scans_dir: scanBatch.scans_dir,
        source_package_dirs: scanBatch.packages_dirs,
        page_count: 0,
        package_count: scanBatch.package_count,
        layout_note: "Layout GT is copied from the original digital render. It is useful as original-page ground truth but may not align geometrically to the scanned PDF after print/scan.",
        pages: [],
    };

    for (const pkgSummary of [...scanBatch.packages].sort((a, b) => a.packageId.localeCompare(b.packageId))) {
        const packageId = pkgSummary.packageId;
        const scanManifestPath = path.join(scanDataset, "scan_manifests", `${packageId}.json`);
        const scanManifest = await readJson(scanManifestPath);
        const packageManifestPath = scanManifest.source_manifest;
        const packageDir = path.dirname(packageManifestPath);
        const packageManifest = await readJson(packageManifestPath);

        for (const scanPage of [...scanManifest.pages].sort((a, b) => a.package_order - b.package_order)) {
            const packagePage = packageManifest.pages.find((p) => (
                p.order === scanPage.package_order && p.source_id === scanPage.source_id
            ));
            if (!packagePage) {
                throw new Error(`No package page for ${scanPage.id}`);
            }

            const pageDir = path.join(
                outDir,
                "pages",
                packageId,
                `${String(scanPage.package_order).padStart(3, "0")}_${safeSourcePart(scanPage.source_id)}`,
            );
            const gtDir = path.join(pageDir, "gt");
            const sourceDir = path.join(pageDir, "source");
            await fs.mkdir(gtDir, { recursive: true });
            await fs.mkdir(sourceDir, { recursive: true });

            const files = {};
            files.original_pdf = rel(await copyIfExists(path.join(packageDir, packagePage.page_pdf), path.join(pageDir, "original.pdf")));
            const scanPdfSource = firstExisting(scanPageDirs.map((dir) => path.join(dir, `${scanPage.id}.pdf`)));
            files.scan_pdf = rel(await copyIfExists(scanPdfSource, path.join(pageDir, "scan.pdf")));

            files.gt = {};
            const gt = packagePage.ground_truth || {};
            const copiedTable = await copyIfExists(gtPath(packageDir, gt.table, "test_json"), path.join(gtDir, "table.test.json"));
            if (copiedTable) { files.gt.table = rel(copiedTable); }
            const copiedChart = await copyIfExists(gtPath(packageDir, gt.chart, "test_json"), path.join(gtDir, "chart.test.json"));
            if (copiedChart) { files.gt.chart = rel(copiedChart); }
            const copiedText = await copyIfExists(gtPath(packageDir, gt.text, "test_json"), path.join(gtDir, "text.test.json"));
            if (copiedText) { files.gt.text = rel(copiedText); }
            const copiedLayout = await copyIfExists(gtPath(packageDir, gt.layout, "test_json"), path.join(gtDir, "layout.test.json"));
            if (copiedLayout) { files.gt.layout = rel(copiedLayout); }
            const mdSource = gtPath(packageDir, gt.text, "markdown") || gtPath(packageDir, gt.layout, "markdown");
            const copiedMd = await copyIfExists(mdSource, path.join(gtDir, "page.md"));
            if (copiedMd) { files.gt.markdown = rel(copiedMd); }

            files.source = {};
            const copiedGen = await copyIfExists(
                packagePage.source?.gen_json ? path.join(packageDir, packagePage.source.gen_json) : null,
                path.join(sourceDir, "gen.json"),
            );
            if (copiedGen) { files.source.gen_json = rel(copiedGen); }
            const copiedHtml = await copyIfExists(
                packagePage.source?.html ? path.join(packageDir, packagePage.source.html) : null,
                path.join(sourceDir, "source.html"),
            );
            if (copiedHtml) { files.source.html = rel(copiedHtml); }

            const pageManifest = {
                id: scanPage.id,
                package_id: packageId,
                package_order: scanPage.package_order,
                source_id: scanPage.source_id,
                scan_pdf_page_in_package: scanPage.scan_pdf_page,
                source_package_manifest: packageManifestPath,
                source_scan_pdf: scanManifest.scan_pdf,
                files,
            };
            await fs.writeFile(path.join(pageDir, "page_manifest.json"), `${JSON.stringify(pageManifest, null, 2)}\n`);
            finalManifest.pages.push({ ...pageManifest, page_manifest: rel(path.join(pageDir, "page_manifest.json")) });
        }
    }

    finalManifest.page_count = finalManifest.pages.length;
    finalManifest.counts = {
        pages: finalManifest.page_count,
        original_pdf: finalManifest.pages.filter((p) => p.files.original_pdf).length,
        scan_pdf: finalManifest.pages.filter((p) => p.files.scan_pdf).length,
        table_gt: finalManifest.pages.filter((p) => p.files.gt.table).length,
        chart_gt: finalManifest.pages.filter((p) => p.files.gt.chart).length,
        text_gt: finalManifest.pages.filter((p) => p.files.gt.text).length,
        layout_gt: finalManifest.pages.filter((p) => p.files.gt.layout).length,
        markdown: finalManifest.pages.filter((p) => p.files.gt.markdown).length,
        source_gen_json: finalManifest.pages.filter((p) => p.files.source.gen_json).length,
        source_html: finalManifest.pages.filter((p) => p.files.source.html).length,
    };

    await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`);
    await fs.writeFile(path.join(outDir, "README.md"), `# Printshop Scan Final Dataset

This folder pairs original synthetic pages with returned printshop scans and all available ground truth/source artifacts.

## Layout

Each page lives under:

\`pages/<package_id>/<page_order>_<source_id>/\`

Files per page:

- \`original.pdf\`: original generated single-page PDF sent to print
- \`scan.pdf\`: scanned single-page PDF returned by the printshop
- \`gt/table.test.json\`: table extraction GT when available
- \`gt/chart.test.json\`: chart GT when available
- \`gt/text.test.json\`: text GT
- \`gt/layout.test.json\`: original digital layout GT
- \`gt/page.md\`: Markdown text/layout reference
- \`source/gen.json\`: original generator data used to build the doc
- \`source/source.html\`: original generated HTML
- \`page_manifest.json\`: per-page metadata and source pointers

See \`manifest.json\` for the full machine-readable index.

Note: layout GT is copied from the original digital render. It may not geometrically align with the scanned page after print/scan.

Counts:

\`\`\`json
${JSON.stringify(finalManifest.counts, null, 2)}
\`\`\`
`);

    console.error(`Done: ${finalManifest.page_count} page(s) -> ${outDir}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
