// Shared Gemini 3.1 Flash Lite client for the table generator + the style
// template extractor. Structured-JSON output (responseSchema), optional vision
// input, retry with backoff, and a concurrency-limited map pool so we can fan
// out ~50 calls at once. Key comes from the worker .env / shell environment.

import fssync from "node:fs";

export const FLASH_LITE = "gemini-3.1-flash-lite";
export const FLASH_LITE_STANDARD_PRICING_USD_PER_1M = { input: 0.25, output: 1.50 };

const usageTotals = {
    calls: 0,
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
    thoughtsTokenCount: 0,
};

function addUsage(meta) {
    if (!meta) { return; }
    usageTotals.calls += 1;
    for (const k of ["promptTokenCount", "candidatesTokenCount", "totalTokenCount", "thoughtsTokenCount"]) {
        usageTotals[k] += Number(meta[k] || 0);
    }
}

export function resetGeminiUsage() {
    for (const k of Object.keys(usageTotals)) {
        usageTotals[k] = 0;
    }
}

export function getGeminiUsage() {
    const inputCost = (usageTotals.promptTokenCount / 1_000_000) * FLASH_LITE_STANDARD_PRICING_USD_PER_1M.input;
    const outputCost = (usageTotals.candidatesTokenCount / 1_000_000) * FLASH_LITE_STANDARD_PRICING_USD_PER_1M.output;
    return {
        model: FLASH_LITE,
        pricing_note: "Estimated with Gemini Developer API Standard paid-tier text pricing; actual billing may differ by tier, discounts, free quota, retries, or Google billing changes.",
        pricing_usd_per_1m_tokens: FLASH_LITE_STANDARD_PRICING_USD_PER_1M,
        ...usageTotals,
        estimated_cost_usd: Number((inputCost + outputCost).toFixed(6)),
    };
}

let cachedClient = null;
async function getClient() {
    if (cachedClient) {
        return cachedClient;
    }
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        throw new Error("GOOGLE_GEMINI_API_KEY is not set (source the worker .env with keys, or run with --no-llm).");
    }
    cachedClient = new GoogleGenAI({ apiKey });
    return cachedClient;
}

export function hasGeminiKey() {
    return Boolean(process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function imageBase64(p) {
    return fssync.readFileSync(p).toString("base64");
}

function mimeFor(p) {
    return /\.png$/i.test(p) ? "image/png" : "image/jpeg";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-request wall-clock timeout. The @google/genai call has no built-in timeout,
// so a hung connection (server accepts but never responds) would block a mapPool
// slot forever and stall the whole batch. Race it against a timer that rejects with
// a RETRYABLE message so the existing backoff/retry (then procedural fallback) kicks in.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 90000);
function withTimeout(promise, ms) {
    let t;
    const timer = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error(`gemini request timeout after ${ms}ms (ETIMEDOUT)`)), ms);
    });
    return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

// One structured-JSON call. `schema` is a Gemini responseSchema. Returns the
// parsed object. Retries transient/5xx/429 errors with backoff.
export async function geminiJson({ system, prompt, schema, imagePath, temperature = 0.9, maxRetries = 4 }) {
    const client = await getClient();
    const parts = [{ text: prompt }];
    if (imagePath) {
        parts.push({ inlineData: { data: imageBase64(imagePath), mimeType: mimeFor(imagePath) } });
    }
    const config = {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature,
        thinkingConfig: { thinkingBudget: 0 },
    };
    if (system) {
        config.systemInstruction = system;
    }

    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const resp = await withTimeout(client.models.generateContent({
                model: FLASH_LITE,
                contents: [{ role: "user", parts }],
                config,
            }), GEMINI_TIMEOUT_MS);
            addUsage(resp.usageMetadata);
            const text = resp.text || "";
            return JSON.parse(text);
        } catch (e) {
            lastErr = e;
            const msg = String(e.message || e);
            const retryable = /429|408|500|502|503|504|ECONNRESET|ETIMEDOUT|timeout|fetch failed|overloaded|rate/i.test(msg);
            if (attempt === maxRetries || !retryable) {
                break;
            }
            await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 400));
        }
    }
    throw lastErr;
}

// Run `fn` over `items` with at most `concurrency` in flight. Returns results in
// input order; a failed item becomes { ok:false, error } via the caller's fn
// (fn should not throw — wrap it). Reports progress through onProgress(done,total).
export async function mapPool(items, concurrency, fn, onProgress) {
    const results = new Array(items.length);
    let next = 0;
    let done = 0;
    async function worker() {
        for (;;) {
            const i = next++;
            if (i >= items.length) {
                return;
            }
            results[i] = await fn(items[i], i);
            done++;
            if (onProgress) {
                onProgress(done, items.length);
            }
        }
    }
    const n = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
}
