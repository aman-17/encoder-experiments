// Curated set of open-source Google Fonts bundled with the tool (woff2 files in
// ./fonts, fetched by fetch-fonts.mjs). Using real webfonts with full glyph
// coverage means generated documents render in genuinely different, coherent
// typefaces (system fonts often aren't installed in headless Chrome, so they
// silently fall back and everything looks the same).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.join(HERE, "fonts");

// family -> generic fallback class
const FULL_GFONTS = {
    serif: [
        "Merriweather", "Lora", "Playfair Display", "PT Serif", "Source Serif 4",
        "Libre Baskerville", "EB Garamond", "Bitter", "Crimson Text", "Spectral",
        "Noto Serif", "Cardo", "Vollkorn", "Cormorant Garamond", "Frank Ruhl Libre",
        "Roboto Slab", "Zilla Slab", "Arvo",
    ],
    sans: [
        "Roboto", "Open Sans", "Lato", "Montserrat", "Source Sans 3", "Inter",
        "Work Sans", "Noto Sans", "Poppins", "Raleway", "IBM Plex Sans", "Rubik",
        "DM Sans", "Karla", "Assistant", "Cabin", "Fira Sans", "Manrope", "Nunito",
        "Mukta", "Barlow", "Hind",
    ],
    mono: [
        "Roboto Mono", "Source Code Pro", "JetBrains Mono", "IBM Plex Mono",
        "Space Mono", "Inconsolata",
    ],
};

// Handwriting families for filled-by-hand form fields + signatures (mirrors the
// FFDetr fillgen handwriting set). Fetched into fonts/ and base64-inlined too.
export const HANDWRITING_FAMILIES = ["Caveat", "Homemade Apple", "Shadows Into Light"];

// Scan-era palette (CG_SCAN_ERA=1): scan-destined docs must not be set in 2020s
// geometric faces (aged photocopy in Poppins = instant anachronism). Handwriting
// families stay available in era mode — pen fills are era-neutral.
const SCAN_ERA_GFONTS = {
    serif: [
        "PT Serif", "Noto Serif", "Merriweather", "Lora", "Bitter",
        "Libre Baskerville", "EB Garamond", "Crimson Text", "Cardo", "Vollkorn",
    ],
    sans: ["Open Sans", "Lato", "Source Sans 3", "Noto Sans", "Fira Sans", "Roboto"],
    mono: ["Inconsolata", "Source Code Pro", "IBM Plex Mono"],
};

export const SCAN_ERA_ACTIVE = process.env.CG_SCAN_ERA === "1";
// Every rng.pick draws from GFONTS, so swapping the export constrains all font
// decisions; classification (classOf/ALL_FAMILIES) stays on the FULL pool.
export const GFONTS = SCAN_ERA_ACTIVE ? SCAN_ERA_GFONTS : FULL_GFONTS;

export const ALL_FAMILIES = [...FULL_GFONTS.serif, ...FULL_GFONTS.sans, ...FULL_GFONTS.mono, ...HANDWRITING_FAMILIES];

const GENERIC = { serif: "Georgia, 'Times New Roman', serif", sans: "Arial, Helvetica, sans-serif", mono: "'Courier New', monospace" };

export function classOf(family) {
    // FULL pool on purpose: under CG_SCAN_ERA a template naming a modern face
    // must still classify correctly so the era re-pick lands in-class.
    if (FULL_GFONTS.mono.includes(family)) {
        return "mono";
    }
    if (FULL_GFONTS.sans.includes(family)) {
        return "sans";
    }
    return "serif";
}

export function familyStack(family) {
    return `"${family}", ${GENERIC[classOf(family)]}`;
}

export function slug(family) {
    return family.replace(/\s+/g, "");
}

// Map a real PDF font name to the closest bundled Google family: exact-ish name
// match first, otherwise a representative family for its serif/sans/mono class.
const SERIF_RE = /times|serif|georgia|garamond|minion|sabon|caslon|baskerville|cambria|palatino|roman|century|bodoni|didot|charter|plantin|book|cardo/i;
const MONO_RE = /mono|courier|consol|menlo|inconsolata|code/i;

export function mapToGoogle(pdfName, rng) {
    const clean = String(pdfName || "").replace(/^[A-Z]{6}\+/, "").replace(/[-_].*$/, "").trim();
    const lower = clean.toLowerCase();
    for (const fam of ALL_FAMILIES) {
        if (fam.toLowerCase().replace(/\s+/g, "").startsWith(lower.replace(/\s+/g, "")) && lower.length >= 4) {
            // Era mode: a name-matched modern face still leaks the 2020s look.
            if (SCAN_ERA_ACTIVE && !HANDWRITING_FAMILIES.includes(fam) && !GFONTS[classOf(fam)].includes(fam)) {
                const eraCls = classOf(fam);
                return rng ? rng.pick(GFONTS[eraCls]) : GFONTS[eraCls][0];
            }
            return fam;
        }
    }
    // No name match: pick a RANDOM representative of the right class so the huge
    // pool of extracted templates (whose source font names rarely match a bundled
    // family) don't all collapse onto one default and dominate the dataset.
    const cls = MONO_RE.test(pdfName) ? "mono" : SERIF_RE.test(pdfName) ? "serif" : "sans";
    const dflt = { mono: "IBM Plex Mono", serif: "Source Serif 4", sans: "Source Sans 3" }[cls];
    return rng ? rng.pick(GFONTS[cls]) : dflt;
}

// Cache woff2 bytes -> base64 once.
const _cache = new Map();
function faceFor(family, weight) {
    const file = path.join(FONTS_DIR, `${slug(family)}-${weight}.woff2`);
    const key = `${family}:${weight}`;
    if (_cache.has(key)) {
        return _cache.get(key);
    }
    let css = "";
    if (fs.existsSync(file)) {
        const b64 = fs.readFileSync(file).toString("base64");
        css = `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
    }
    _cache.set(key, css);
    return css;
}

// @font-face CSS (regular+bold) for the given families, base64-inlined so the
// rendered HTML is self-contained.
export function fontFaceCss(families) {
    const seen = new Set();
    const out = [];
    for (const fam of families) {
        if (!fam || seen.has(fam)) {
            continue;
        }
        seen.add(fam);
        out.push(faceFor(fam, 400));
        out.push(faceFor(fam, 700));
    }
    return out.filter(Boolean).join("\n");
}

export function fontsAvailable() {
    return fs.existsSync(FONTS_DIR) && fs.readdirSync(FONTS_DIR).some((f) => f.endsWith(".woff2"));
}
