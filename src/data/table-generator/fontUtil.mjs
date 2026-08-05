// Font helpers for the style extractor: parse pdffonts output, strip subset
// prefixes, classify serif/sans/mono, check local availability (fc-list), and
// build a CSS font stack that prefers the PDF's real font when installed and
// falls back to a matching generic family otherwise.

import { execFileSync } from "node:child_process";

const SERIF_RE = /times|serif|georgia|garamond|minion|sabon|caslon|baskerville|cambria|palatino|book\s*antiqua|roman|ming|song|century|bodoni|didot|freight|charter|utopia|plantin/i;
const MONO_RE = /mono|courier|consol|menlo|inconsolata|sourcecode|robotomono|ibmplexmono/i;

const GENERIC_FALLBACK = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Arial, Helvetica, sans-serif",
    mono: "'Courier New', monospace",
};

let installedFamilies = null;
function getInstalledFamilies() {
    if (installedFamilies) {
        return installedFamilies;
    }
    installedFamilies = new Set();
    try {
        const out = execFileSync("fc-list", [":", "family"], { encoding: "utf-8", timeout: 8000 });
        for (const line of out.split("\n")) {
            for (const fam of line.split(",")) {
                const f = fam.trim();
                if (f) {
                    installedFamilies.add(f.toLowerCase());
                }
            }
        }
    } catch {
        // fc-list missing — leave the set empty; we just rely on fallbacks.
    }
    return installedFamilies;
}

// "AAARQI+Sabon_MT_Pro" -> "Sabon MT Pro"
export function cleanFontName(raw) {
    let n = String(raw || "");
    n = n.replace(/^[A-Z]{6}\+/, ""); // subset prefix
    n = n.replace(/[-_]/g, " ");
    n = n.replace(/\s+/g, " ").trim();
    return n;
}

export function classifyFont(name) {
    if (MONO_RE.test(name)) {
        return "mono";
    }
    if (SERIF_RE.test(name)) {
        return "serif";
    }
    return "sans";
}

function isInstalled(name) {
    const fams = getInstalledFamilies();
    if (fams.size === 0) {
        return false;
    }
    const lower = name.toLowerCase();
    if (fams.has(lower)) {
        return true;
    }
    // loose match on the leading family token (e.g. "Univers LT 45 Light" -> "univers")
    const head = lower.split(" ")[0];
    for (const f of fams) {
        if (f === lower || f.startsWith(`${head} `) || f === head) {
            return true;
        }
    }
    return false;
}

// Build a CSS font stack. Prefers the real family when installed; always ends
// with a generic fallback matching the font's classification.
export function cssFontStack(rawName) {
    const name = cleanFontName(rawName) || "Helvetica";
    const cls = classifyFont(name);
    const fallback = GENERIC_FALLBACK[cls];
    if (isInstalled(name)) {
        return { stack: `"${name}", ${fallback}`, family: name, cls, installed: true };
    }
    return { stack: fallback, family: name, cls, installed: false };
}

// Parse `pdffonts` table output into [{ name, type, emb, sub }].
export function parsePdffonts(text) {
    const lines = text.split("\n");
    const out = [];
    let started = false;
    for (const line of lines) {
        if (/^-{5,}/.test(line)) {
            started = true;
            continue;
        }
        if (!started || !line.trim()) {
            continue;
        }
        // columns are space-separated; name may contain no spaces (PDF font names don't)
        const cols = line.trim().split(/\s+/);
        if (cols.length < 6) {
            continue;
        }
        const name = cols[0];
        const emb = cols[cols.length - 4] === "yes";
        const sub = cols[cols.length - 3] === "yes";
        out.push({ name, type: cols.slice(1, cols.length - 5).join(" "), emb, sub });
    }
    return out;
}
