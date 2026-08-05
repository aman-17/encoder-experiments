// annotateTables.mjs
//
// CLI entry for the table annotator. Parses a folder of table PDFs with cli2
// (agentic, HTML tables + screenshots), then serves a web app where a human
// reviews each table beside its page screenshot and chats with one or more LLMs
// to refine the transcription, finally saving <id>.test.json ground-truth files
// in the tables_extended benchmark format.
//
// Usage:
//   ./annotator --dataset <folder> [--port 5599] [--workdir <dir>]
//               [--tier agentic] [--version latest] [--reparse]
//
// Run from the worker dir; requires `pnpm compile` (so dist/worker/cli2.js
// exists) and the worker .env (provider keys + S3/layout config).

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDataset } from "./parseDataset.mjs";
import { startServer } from "./tableAnnotatorServer.mjs";
import { availableProviders } from "./llmProviders.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The annotator parses PDFs by shelling out to the LlamaParse worker's `cli2`.
// Point WORKER_ROOT at a built worker checkout (--worker-root or $WORKER_ROOT);
// defaults to the standard platform checkout.
const DEFAULT_WORKER_ROOT = path.join(process.env.HOME || "", "Code", "fourth", "platform", "llamaparse", "worker");

function parseArgs(argv) {
    const args = { port: 5599, tier: "agentic", version: "latest", reparse: false, concurrency: 25 };
    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        const eq = a.indexOf("=");
        const key = eq >= 0 ? a.slice(2, eq) : a.replace(/^--/, "");
        const inlineVal = eq >= 0 ? a.slice(eq + 1) : null;
        const takeVal = () => (inlineVal != null ? inlineVal : argv[++i]);
        switch (key) {
            case "dataset":
                args.dataset = takeVal();
                break;
            case "workdir":
                args.workdir = takeVal();
                break;
            case "worker-root":
                args.workerRoot = takeVal();
                break;
            case "port":
                args.port = parseInt(takeVal(), 10);
                break;
            case "tier":
                args.tier = takeVal();
                break;
            case "version":
                args.version = takeVal();
                break;
            case "concurrency":
                args.concurrency = parseInt(takeVal(), 10);
                break;
            case "reparse":
                args.reparse = true;
                break;
            default:
                break;
        }
    }
    return args;
}

// Minimal .env loader (KEY=VALUE, optional quotes). Does not overwrite vars
// already present in the environment.
function loadEnv(envPath) {
    if (!fssync.existsSync(envPath)) {
        return;
    }
    const text = fssync.readFileSync(envPath, "utf-8");
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq < 0) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = val;
        }
    }
}

async function main() {
    const args = parseArgs(process.argv);
    if (!args.dataset) {
        console.error("Usage: ./annotator --dataset <folder> [--port 5599] [--workdir <dir>] [--tier agentic] [--version latest] [--reparse]");
        process.exit(1);
    }
    const datasetDir = path.resolve(args.dataset.replace(/^~(?=$|\/)/, process.env.HOME));
    if (!fssync.existsSync(datasetDir) || !fssync.statSync(datasetDir).isDirectory()) {
        console.error(`Dataset folder not found: ${datasetDir}`);
        process.exit(1);
    }

    const workerRoot = path.resolve(
        (args.workerRoot || process.env.WORKER_ROOT || DEFAULT_WORKER_ROOT).replace(/^~(?=$|\/)/, process.env.HOME),
    );
    loadEnv(path.join(workerRoot, ".env"));

    const cli2Path = path.join(workerRoot, "cli2");
    if (!fssync.existsSync(cli2Path)) {
        console.error(`cli2 wrapper not found at ${cli2Path} — pass --worker-root <built worker checkout> (or set $WORKER_ROOT).`);
        process.exit(1);
    }
    if (!fssync.existsSync(path.join(workerRoot, "dist", "worker", "cli2.js"))) {
        console.error(`dist/worker/cli2.js missing under ${workerRoot} — run \`pnpm compile\` (or \`pnpm build\`) in the worker dir first.`);
        process.exit(1);
    }

    const workDir = path.resolve(
        (args.workdir && args.workdir.replace(/^~(?=$|\/)/, process.env.HOME)) ||
            path.join(process.env.HOME || "/tmp", "Code", "tmp", "tableAnnotator", path.basename(datasetDir)),
    );

    const providers = availableProviders();
    const enabled = Object.entries(providers).filter(([, v]) => v).map(([k]) => k);
    const pdfCount = fssync.readdirSync(datasetDir).filter((f) => f.toLowerCase().endsWith(".pdf")).length;
    console.error(`Table Annotator`);
    console.error(`  dataset : ${datasetDir} (${pdfCount} PDFs)`);
    console.error(`  workdir : ${workDir}`);
    console.error(`  parse   : tier=${args.tier} version=${args.version} concurrency=${args.concurrency}`);
    console.error(`  chat LLM providers with keys: ${enabled.length ? enabled.join(", ") : "(none — chat disabled)"}`);
    console.error("");

    // The server reads state.docs live; parseDataset keeps it in sync as each
    // PDF finishes, so the UI is usable immediately and fills in as parsing runs.
    const state = { datasetDir, tier: args.tier, version: args.version, docs: [] };
    await startServer(state, args.port);
    console.error(`  ➜  Table annotator running:  http://localhost:${args.port}`);
    console.error("     Docs become annotatable as they finish parsing. Refresh to see new ones.");
    console.error("     (Ctrl-C to stop. Saved annotations are written as <id>.test.json in the dataset folder.)");
    console.error("");
    console.error(`Parsing ${pdfCount} PDFs (${args.concurrency} at a time)...`);

    const started = Date.now();
    parseDataset({
        datasetDir,
        workDir,
        cli2Path,
        workerRoot,
        tier: args.tier,
        version: args.version,
        force: args.reparse,
        concurrency: args.concurrency,
        liveDocs: state.docs,
        onProgress: ({ done, total }) => {
            if (done === total || done % 10 === 0) {
                const mins = ((Date.now() - started) / 60000).toFixed(1);
                const withTables = state.docs.filter((d) => d.tableCount > 0).length;
                console.error(`  parsed ${done}/${total} (${withTables} with tables) — ${mins} min`);
            }
        },
    })
        .then(() => {
            const withTables = state.docs.filter((d) => d.tableCount > 0).length;
            console.error("");
            console.error(`Parse complete: ${state.docs.length} PDFs (${withTables} with at least one table).`);
        })
        .catch((e) => {
            console.error(`Parse error: ${e.stack || e.message}`);
        });
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
