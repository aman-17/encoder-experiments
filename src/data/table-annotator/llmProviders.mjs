// llmProviders.mjs
//
// Self-contained multi-provider LLM chat for the table annotator. Calls the
// Anthropic / Google / OpenAI SDKs directly (already in the worker's
// node_modules) with keys from the worker .env, so the tool stays decoupled
// from worker pipeline internals. The model id strings mirror the worker's own
// registry (LLMModelConf.ts) so they hit the same backends the pipeline uses.
//
// Every model takes the current table HTML + the page screenshot + a user
// instruction and returns revised table HTML. "Fan-out" mode just calls several
// of these in parallel and the UI lets the human pick the best candidate.

import fssync from "node:fs";

// Curated, vision-capable models grouped by family. `id` is what the UI sends
// back; `apiModel` is the provider's wire string (from LLMModelConf.ts).
export const MODELS = [
    { id: "claude-fable-5", label: "Claude Fable 5", provider: "anthropic", apiModel: "claude-fable-5", family: "Claude" },
    { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", apiModel: "claude-opus-5", family: "Claude" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", apiModel: "claude-sonnet-4-6", family: "Claude" },
    { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", provider: "google", apiModel: "gemini-3.1-pro-preview", family: "Gemini" },
    { id: "gemini-3-flash", label: "Gemini 3 Flash", provider: "google", apiModel: "gemini-3-flash-preview", family: "Gemini" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", apiModel: "gemini-2.5-flash", family: "Gemini" },
    { id: "gpt-5.6-sol", label: "GPT 5.6 Sol", provider: "openai", apiModel: "gpt-5.6-sol", family: "GPT" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini", provider: "openai", apiModel: "gpt-5.4-mini", family: "GPT" },
];

const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

const SYSTEM_PROMPT = [
    "You are an expert at transcribing tables from documents into clean, semantic HTML.",
    "You are helping a human build ground-truth annotations for a table-extraction benchmark.",
    "You are given: (1) a page screenshot, (2) the current best-guess HTML transcription of the table(s) on that page, and (3) an instruction describing what to fix.",
    "Return the COMPLETE corrected HTML for the table(s) — not a diff, not an explanation.",
    "Rules for the HTML:",
    "- Use <table>, <tr>, <th> (header cells) and <td> (data cells). <thead>/<tbody> are optional.",
    "- Use colspan / rowspan to represent merged cells exactly as they appear visually.",
    "- Use <br/> for hard line breaks inside a cell. Preserve the cell text verbatim, including units and symbols.",
    "- If there are multiple distinct tables on the page, output each as its own <table> element, in reading order, separated by a newline.",
    "- Output ONLY the HTML. Do not wrap it in markdown code fences. Do not add commentary before or after.",
].join("\n");

function buildUserText(currentHtml, instruction) {
    return [
        "Current HTML transcription of the table(s):",
        "```html",
        currentHtml || "(none yet — transcribe the table(s) from the screenshot)",
        "```",
        "",
        "Instruction:",
        instruction || "Transcribe the table(s) in the screenshot as accurately as possible, fixing any errors in the current HTML.",
    ].join("\n");
}

// Strip accidental ```html ... ``` fences a model may add despite instructions.
function stripFences(text) {
    if (!text) {
        return "";
    }
    const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence) {
        return fence[1].trim();
    }
    return text.trim();
}

function imageBase64(imagePath) {
    return fssync.readFileSync(imagePath).toString("base64");
}

function mimeFor(imagePath) {
    return /\.png$/i.test(imagePath) ? "image/png" : "image/jpeg";
}

async function callAnthropic(model, imagePath, currentHtml, instruction) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const content = [];
    if (imagePath) {
        content.push({
            type: "image",
            source: { type: "base64", media_type: mimeFor(imagePath), data: imageBase64(imagePath) },
        });
    }
    content.push({ type: "text", text: buildUserText(currentHtml, instruction) });
    const resp = await client.messages.create({
        model: model.apiModel,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
    });
    // Claude Fable 5 reports policy refusal as a successful response. Never
    // return that as an empty-looking annotation candidate.
    if (resp.stop_reason === "refusal") {
        throw new Error("Claude Fable 5 refused this table-review request");
    }
    const text = (resp.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    return stripFences(text);
}

async function callGoogle(model, imagePath, currentHtml, instruction) {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const client = new GoogleGenAI({ apiKey });
    const parts = [{ text: buildUserText(currentHtml, instruction) }];
    if (imagePath) {
        parts.push({ inlineData: { data: imageBase64(imagePath), mimeType: mimeFor(imagePath) } });
    }
    const config = { systemInstruction: SYSTEM_PROMPT };
    // Gemini 3.x Pro is a thinking-only model (thinkingBudget 0 is rejected); a
    // low thinking level keeps latency reasonable for interactive edits.
    if (/pro/i.test(model.apiModel)) {
        config.thinkingConfig = { thinkingLevel: "LOW" };
    }
    const resp = await client.models.generateContent({
        model: model.apiModel,
        contents: [{ role: "user", parts }],
        config,
    });
    return stripFences(resp.text || "");
}

async function callOpenAI(model, imagePath, currentHtml, instruction) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const content = [{ type: "input_text", text: buildUserText(currentHtml, instruction) }];
    if (imagePath) {
        content.push({
            type: "input_image",
            image_url: `data:${mimeFor(imagePath)};base64,${imageBase64(imagePath)}`,
        });
    }
    const resp = await client.responses.create({
        model: model.apiModel,
        instructions: SYSTEM_PROMPT,
        input: [{ role: "user", content }],
        max_output_tokens: 8000,
    });
    return stripFences(resp.output_text || "");
}

// Run one model. Returns { modelId, label, ok, html?, error? } — never throws,
// so a single provider failure can't take down a fan-out request.
export async function runModel(modelId, { imagePath, currentHtml, instruction }) {
    const model = MODEL_BY_ID.get(modelId);
    if (!model) {
        return { modelId, label: modelId, ok: false, error: `unknown model: ${modelId}` };
    }
    const started = Date.now();
    try {
        const html = await callModel(model, imagePath, currentHtml, instruction);
        return { modelId, label: model.label, ok: true, html, ms: Date.now() - started };
    } catch (e) {
        const fallback = modelId === "claude-fable-5" && fableUnavailable(e)
            ? MODEL_BY_ID.get("claude-opus-5")
            : null;
        if (fallback) {
            try {
                const html = await callModel(fallback, imagePath, currentHtml, instruction);
                return {
                    modelId: fallback.id,
                    label: fallback.label,
                    requestedModelId: modelId,
                    fallbackFrom: modelId,
                    ok: true,
                    html,
                    ms: Date.now() - started,
                };
            } catch (fallbackError) {
                return {
                    modelId,
                    label: model.label,
                    ok: false,
                    error: `Fable 5 unavailable and Opus 5 fallback failed: ${fallbackError.message}`,
                    ms: Date.now() - started,
                };
            }
        }
        return { modelId, label: model.label, ok: false, error: e.message, ms: Date.now() - started };
    }
}

async function callModel(model, imagePath, currentHtml, instruction) {
    if (model.provider === "anthropic") {
        return callAnthropic(model, imagePath, currentHtml, instruction);
    }
    if (model.provider === "google") {
        return callGoogle(model, imagePath, currentHtml, instruction);
    }
    if (model.provider === "openai") {
        return callOpenAI(model, imagePath, currentHtml, instruction);
    }
    throw new Error(`unsupported provider: ${model.provider}`);
}

function fableUnavailable(error) {
    return /model_not_available|data retention|not available|refused/i.test(String(error?.message || error));
}

// Fan out to several models in parallel; each result is independent.
export async function runModels(modelIds, payload) {
    return Promise.all(modelIds.map((id) => runModel(id, payload)));
}

// Which providers actually have a key configured — the UI greys out the rest.
export function availableProviders() {
    return {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        google: Boolean(process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
    };
}
