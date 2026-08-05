// parseDataset.mjs
//
// Batch-parses a folder of PDFs with the local cli2 (agentic tier, HTML
// tables in markdown-v2 + page screenshots) and builds a manifest the table
// annotator UI consumes. Follows the harness convention of shelling out to the
// built ./cli2 and reading its sidecar outputs rather than importing worker
// internals, so it never drifts from the real pipeline.
//
// Per PDF, cli2 (run from a per-doc work dir so its outputs never touch the
// dataset) writes:
//   <base>.v2.md.json            -> { pages: [{ success, page_number, markdown, ... }] }
//   <base>_data/screenshot/page_N.jpg
// We pull the HTML <table> blocks out of each page's markdown and record the
// screenshot path. The seed expected_markdown is every table on the page,
// concatenated — the same shape tables_extended .test.json files use.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

const TABLE_RE = /<table[\s\S]*?<\/table>/gi;

export function extractTablesFromMarkdown(markdown) {
    if (!markdown) {
        return [];
    }
    const matches = markdown.match(TABLE_RE);
    return matches ? matches.map((t) => t.trim()) : [];
}

function listPdfs(dir) {
    return fssync
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".pdf"))
        .sort()
        .map((f) => path.join(dir, f));
}

function readExistingTestJson(datasetDir, id) {
    const p = path.join(datasetDir, `${id}.test.json`);
    if (!fssync.existsSync(p)) {
        return null;
    }
    try {
        return JSON.parse(fssync.readFileSync(p, "utf-8"));
    } catch (e) {
        console.error(`  ! failed to parse existing ${id}.test.json: ${e.message}`);
        return null;
    }
}

function runCli2(cli2Path, workerRoot, args, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn(cli2Path, args, { cwd: workerRoot });
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            resolve({ ok: false, error: `timeout after ${timeoutMs}ms`, stderr });
        }, timeoutMs);
        child.stdout.on("data", () => {});
        child.stderr.on("data", (d) => {
            stderr += d.toString();
        });
        child.on("error", (e) => {
            clearTimeout(timer);
            resolve({ ok: false, error: e.message, stderr });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ ok: code === 0, code, stderr });
        });
    });
}

function collectScreenshots(workDir, baseName) {
    const dir = path.join(workDir, `${baseName}.pdf_data`, "screenshot");
    if (!fssync.existsSync(dir)) {
        return [];
    }
    return fssync
        .readdirSync(dir)
        .filter((f) => /^page_\d+\.(jpg|jpeg|png)$/i.test(f))
        .map((f) => ({
            page: parseInt(f.match(/page_(\d+)\./)[1], 10),
            path: path.join(dir, f),
        }))
        .sort((a, b) => a.page - b.page);
}

function readMarkdownV2(workDir, baseName) {
    const p = path.join(workDir, `${baseName}.v2.md.json`);
    if (!fssync.existsSync(p)) {
        return null;
    }
    try {
        return JSON.parse(fssync.readFileSync(p, "utf-8"));
    } catch (e) {
        console.error(`  ! failed to parse ${baseName}.v2.md.json: ${e.message}`);
        return null;
    }
}

// Parse a single PDF: copy into the work dir, run cli2, harvest tables +
// screenshots. Returns the doc manifest entry, or null on failure.
async function parseOneDoc(opts, pdfPath) {
    const { workDir, cli2Path, workerRoot, tier, version, timeoutMs, datasetDir } = opts;
    const baseName = path.basename(pdfPath, path.extname(pdfPath));
    const docWorkDir = path.join(workDir, baseName);
    await fs.mkdir(docWorkDir, { recursive: true });
    const workPdf = path.join(docWorkDir, `${baseName}.pdf`);
    await fs.copyFile(pdfPath, workPdf);

    const args = [
        `--tier=${tier}`,
        `--version=${version}`,
        "--output=markdown-v2",
        "--output_tables_as_HTML",
        "--debug_screenshots",
        "--monoactivity",
        "--invalidate_cache",
        workPdf,
    ];
    const res = await runCli2(cli2Path, workerRoot, args, timeoutMs);
    if (!res.ok) {
        console.error(`  ! ${baseName}: cli2 failed (${res.error || `exit ${res.code}`})`);
        const tail = (res.stderr || "").split("\n").slice(-4).join("\n");
        if (tail.trim()) {
            console.error(`    ${tail.replace(/\n/g, "\n    ")}`);
        }
        return null;
    }

    const mdV2 = readMarkdownV2(docWorkDir, baseName);
    const shots = collectScreenshots(docWorkDir, baseName);
    if (!mdV2 || !Array.isArray(mdV2.pages)) {
        console.error(`  ! ${baseName}: no markdown-v2 output produced`);
        return null;
    }

    const shotByPage = new Map(shots.map((s) => [s.page, s.path]));
    const pages = [];
    const allTables = [];
    for (const page of mdV2.pages) {
        const markdown = page && page.success ? page.markdown || "" : "";
        const tables = extractTablesFromMarkdown(markdown);
        allTables.push(...tables);
        pages.push({
            pageNum: page.page_number,
            screenshot: shotByPage.get(page.page_number) || null,
            tables,
            markdown,
        });
    }

    return {
        id: baseName,
        pdf: pdfPath,
        pages,
        seedExpectedMarkdown: allTables.join("\n"),
        tableCount: allTables.length,
        existingTestJson: readExistingTestJson(datasetDir, baseName),
    };
}

// Parse every PDF in datasetDir with a bounded concurrency pool. Results are
// cached to <workDir>/manifest.json; re-runs reuse the cache unless force=true.
// As each doc completes it is placed in filename order and `liveDocs` (if given)
// is kept in sync in place, so a server holding that array reflects progress
// live. onProgress({done,total,id}) is called as each doc completes.
export async function parseDataset(opts) {
    const {
        datasetDir,
        workDir,
        cli2Path,
        workerRoot,
        tier = "agentic",
        version = "latest",
        timeoutMs = 1000 * 60 * 10,
        force = false,
        concurrency = 25,
        onProgress = () => {},
        liveDocs = null,
    } = opts;

    await fs.mkdir(workDir, { recursive: true });
    const manifestPath = path.join(workDir, "manifest.json");

    let cached = null;
    if (!force && fssync.existsSync(manifestPath)) {
        try {
            cached = JSON.parse(fssync.readFileSync(manifestPath, "utf-8"));
        } catch {
            cached = null;
        }
    }
    const cachedById = new Map();
    if (cached && cached.tier === tier && cached.version === version && Array.isArray(cached.docs)) {
        for (const d of cached.docs) {
            // Only trust a cached doc if its screenshots are still on disk.
            const ok = d.pages.every((p) => !p.screenshot || fssync.existsSync(p.screenshot));
            if (ok) {
                cachedById.set(d.id, d);
            }
        }
    }

    const pdfs = listPdfs(datasetDir);
    // results is indexed by original (filename) order; compacting it preserves
    // a stable display order regardless of which parse finishes first.
    const results = new Array(pdfs.length).fill(null);

    const syncLive = () => {
        const docs = results.filter(Boolean);
        if (liveDocs) {
            liveDocs.length = 0;
            liveDocs.push(...docs);
        }
        return docs;
    };

    // Serialize manifest writes (tmp + rename) so concurrent workers can't
    // interleave a half-written file.
    let writeChain = Promise.resolve();
    const persist = () => {
        const docs = results.filter(Boolean);
        writeChain = writeChain.then(async () => {
            const tmp = `${manifestPath}.tmp`;
            await fs.writeFile(tmp, JSON.stringify({ datasetDir, tier, version, docs }, null, 2));
            await fs.rename(tmp, manifestPath);
        });
        return writeChain;
    };

    // Seed cached docs immediately so they're annotatable from the first second.
    const todo = [];
    let done = 0;
    pdfs.forEach((pdfPath, i) => {
        const id = path.basename(pdfPath, path.extname(pdfPath));
        const cachedDoc = cachedById.get(id);
        if (cachedDoc) {
            cachedDoc.existingTestJson = readExistingTestJson(datasetDir, id);
            results[i] = cachedDoc;
            done += 1;
        } else {
            todo.push(i);
        }
    });
    syncLive();
    if (done > 0) {
        console.error(`  = ${done} cached doc(s) reused`);
    }

    // Worker pool: each worker pulls the next index off the shared cursor.
    let cursor = 0;
    const worker = async () => {
        for (;;) {
            const slot = cursor;
            cursor += 1;
            if (slot >= todo.length) {
                return;
            }
            const i = todo[slot];
            const pdfPath = pdfs[i];
            const id = path.basename(pdfPath, path.extname(pdfPath));
            console.error(`  > ${id}: parsing...`);
            const doc = await parseOneDoc(
                { workDir, cli2Path, workerRoot, tier, version, timeoutMs, datasetDir },
                pdfPath,
            );
            results[i] = doc; // may be null on failure; filtered out of live/manifest
            done += 1;
            syncLive();
            await persist();
            onProgress({ done, total: pdfs.length, id });
        }
    };

    const poolSize = Math.max(1, Math.min(concurrency, Math.max(1, todo.length)));
    await Promise.all(Array.from({ length: poolSize }, worker));
    await writeChain;

    return { datasetDir, tier, version, docs: results.filter(Boolean), manifestPath };
}
