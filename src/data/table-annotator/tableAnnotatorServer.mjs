// tableAnnotatorServer.mjs
//
// Dependency-free HTTP server for the table annotator. Serves the single-page
// UI, page screenshots, and the manifest, and exposes two actions:
//   POST /api/chat  -> fan out to selected models, return candidate HTML tables
//   POST /api/save  -> write <id>.test.json next to the original PDF
//
// The manifest is held in memory; saves also update the in-memory doc so the UI
// reflects progress without a re-parse.

import http from "node:http";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, runModels, availableProviders } from "./llmProviders.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");

const STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
};

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (c) => {
            size += c.length;
            if (size > 50 * 1024 * 1024) {
                reject(new Error("request body too large"));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        req.on("error", reject);
    });
}

// The manifest sent to the browser omits heavy per-page markdown and the absolute
// screenshot paths (served via /api/screenshot instead).
function publicManifest(state) {
    return {
        datasetDir: state.datasetDir,
        tier: state.tier,
        version: state.version,
        providers: availableProviders(),
        models: MODELS.map((m) => ({ id: m.id, label: m.label, family: m.family, provider: m.provider })),
        docs: state.docs.map((d) => ({
            id: d.id,
            tableCount: d.tableCount,
            pages: d.pages.map((p) => ({ pageNum: p.pageNum, hasScreenshot: Boolean(p.screenshot) })),
            seedExpectedMarkdown: d.seedExpectedMarkdown,
            savedExpectedMarkdown: d.existingTestJson ? d.existingTestJson.expected_markdown || null : null,
            existingFlags: d.existingTestJson ? extractFlags(d.existingTestJson) : null,
            isAnnotated: Boolean(d.existingTestJson && d.existingTestJson.expected_markdown),
        })),
    };
}

const FLAG_KEYS = [
    "table_difficulty",
    "trm_unsupported",
    "max_top_title_rows",
    "allow_splitting_ambiguous_merged_tables",
];

function extractFlags(testJson) {
    const out = {};
    for (const k of FLAG_KEYS) {
        if (testJson[k] !== undefined) {
            out[k] = testJson[k];
        }
    }
    return out;
}

function findDoc(state, id) {
    return state.docs.find((d) => d.id === id) || null;
}

function findScreenshot(state, id, pageNum) {
    const doc = findDoc(state, id);
    if (!doc) {
        return null;
    }
    const page = doc.pages.find((p) => p.pageNum === Number(pageNum));
    return page ? page.screenshot : null;
}

async function handleScreenshot(state, url, res) {
    const id = url.searchParams.get("doc");
    const pageNum = url.searchParams.get("page");
    const shot = findScreenshot(state, id, pageNum);
    if (!shot || !fssync.existsSync(shot)) {
        sendJson(res, 404, { error: "screenshot not found" });
        return;
    }
    const ext = path.extname(shot).toLowerCase();
    const type = ext === ".png" ? "image/png" : "image/jpeg";
    const data = await fs.readFile(shot);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(data);
}

async function handleChat(state, req, res) {
    const body = JSON.parse(await readBody(req));
    const { docId, pageNum, currentHtml, message, models } = body;
    const imagePath = pageNum != null ? findScreenshot(state, docId, pageNum) : null;
    const modelIds = Array.isArray(models) && models.length
        ? models
        : ["claude-fable-5", "gemini-3.1-pro", "gpt-5.6-sol"];
    const results = await runModels(modelIds, {
        imagePath: imagePath && fssync.existsSync(imagePath) ? imagePath : null,
        currentHtml,
        instruction: message,
    });
    sendJson(res, 200, { candidates: results });
}

// Write <id>.test.json next to the original PDF. Existing non-expected_markdown
// fields (e.g. other benchmark rules) are preserved; flags are merged.
async function handleSave(state, req, res) {
    const body = JSON.parse(await readBody(req));
    const { docId, expectedMarkdown, flags } = body;
    const doc = findDoc(state, docId);
    if (!doc) {
        sendJson(res, 404, { error: `unknown doc: ${docId}` });
        return;
    }
    const outPath = path.join(state.datasetDir, `${docId}.test.json`);
    const existing = doc.existingTestJson && typeof doc.existingTestJson === "object" ? { ...doc.existingTestJson } : {};
    existing.expected_markdown = expectedMarkdown || "";
    for (const k of FLAG_KEYS) {
        if (flags && flags[k] !== undefined && flags[k] !== null && flags[k] !== "") {
            existing[k] = flags[k];
        } else {
            delete existing[k];
        }
    }
    await fs.writeFile(outPath, `${JSON.stringify(existing, null, 2)}\n`);
    doc.existingTestJson = existing;
    sendJson(res, 200, { ok: true, path: outPath, isAnnotated: true, savedExpectedMarkdown: expectedMarkdown });
}

async function handleStatic(url, res) {
    let rel = url.pathname === "/" ? "/index.html" : url.pathname;
    rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR) || !fssync.existsSync(filePath)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": STATIC_TYPES[ext] || "application/octet-stream" });
    res.end(data);
}

export function startServer(state, port) {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        try {
            if (url.pathname === "/api/manifest") {
                sendJson(res, 200, publicManifest(state));
            } else if (url.pathname === "/api/screenshot") {
                await handleScreenshot(state, url, res);
            } else if (url.pathname === "/api/chat" && req.method === "POST") {
                await handleChat(state, req, res);
            } else if (url.pathname === "/api/save" && req.method === "POST") {
                await handleSave(state, req, res);
            } else {
                await handleStatic(url, res);
            }
        } catch (e) {
            console.error(`! request ${url.pathname} failed: ${e.stack || e.message}`);
            if (!res.headersSent) {
                sendJson(res, 500, { error: e.message });
            }
        }
    });
    return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
    });
}
