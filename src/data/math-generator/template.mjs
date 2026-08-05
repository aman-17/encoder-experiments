// Style "templates": a JSON description of a document's visual style (page,
// fonts, headings, table styling). Two sources produce templates:
//   - randomTemplate(rng)  — synthesizes varied styles (the default).
//   - loadTemplates(dir)   — templates emitted by extractTemplates.mjs from
//                            real PDFs.
// templateToCss(t) turns a template into the <style> body shared by both.

import fs from "node:fs";
import path from "node:path";
import { GFONTS, familyStack, mapToGoogle, classOf } from "./googleFonts.mjs";

// Broad font pools (commonly installed on macOS/Office systems) so generated
// documents don't all share one or two typefaces. Each entry ends in a generic
// fallback so it still renders if the named family is absent.
const FONT_STACKS = {
    serif: [
        "Georgia, 'Times New Roman', serif",
        "'Times New Roman', Times, serif",
        "Cambria, Georgia, serif",
        "'Book Antiqua', Palatino, serif",
        "Palatino, 'Palatino Linotype', serif",
        "Garamond, 'EB Garamond', serif",
        "Baskerville, 'Libre Baskerville', serif",
        "'Hoefler Text', Georgia, serif",
        "Didot, 'Bodoni 72', serif",
        "'Iowan Old Style', Georgia, serif",
        "Cochin, Georgia, serif",
        "'PT Serif', Georgia, serif",
        "Charter, Georgia, serif",
        "'Big Caslon', 'Times New Roman', serif",
        "'American Typewriter', Georgia, serif",
    ],
    sans: [
        "Arial, Helvetica, sans-serif",
        "Helvetica, Arial, sans-serif",
        "'Helvetica Neue', Helvetica, sans-serif",
        "Verdana, Geneva, sans-serif",
        "Calibri, 'Segoe UI', sans-serif",
        "'Trebuchet MS', Tahoma, sans-serif",
        "Tahoma, Geneva, sans-serif",
        "'Gill Sans', 'Gill Sans MT', sans-serif",
        "Optima, 'Segoe UI', sans-serif",
        "Futura, 'Century Gothic', sans-serif",
        "Avenir, 'Avenir Next', sans-serif",
        "'Lucida Grande', 'Lucida Sans', sans-serif",
        "'Franklin Gothic', 'Arial Narrow', sans-serif",
        "Geneva, Tahoma, sans-serif",
        "'Century Gothic', 'Apple Gothic', sans-serif",
    ],
    mono: [
        "'Courier New', monospace",
        "Consolas, 'Courier New', monospace",
        "Menlo, Monaco, monospace",
        "'Andale Mono', monospace",
        "Monaco, 'Courier New', monospace",
    ],
};

const BORDER_STYLES = [
    "grid", "horizontal", "header-only", "none", "box", "outer-grid",
    "vertical", "thick-header", "top-bottom", "frame", "hairline-grid",
];

function hsl(h, s, l) {
    return `hsl(${h}, ${s}%, ${l}%)`;
}

// A header-band color biased toward professional/corporate tones (navy, teal,
// forest, maroon, charcoal) with some free variety.
function bandColor(rng) {
    const pick = rng.weighted([
        ["navy", 3], ["teal", 2], ["forest", 2], ["maroon", 2], ["charcoal", 2], ["free", 2],
    ]);
    switch (pick) {
        case "navy": return hsl(rng.int(208, 232), rng.int(35, 60), rng.int(26, 42));
        case "teal": return hsl(rng.int(174, 196), rng.int(30, 55), rng.int(24, 38));
        case "forest": return hsl(rng.int(128, 156), rng.int(25, 50), rng.int(22, 36));
        case "maroon": return hsl(rng.int(344, 360), rng.int(35, 55), rng.int(28, 42));
        case "charcoal": return hsl(rng.int(0, 359), rng.int(4, 12), rng.int(22, 34));
        default: return hsl(rng.int(0, 359), rng.int(35, 65), rng.int(28, 48));
    }
}

// First family name in a CSS font stack (handles quotes).
function firstFamily(stack) {
    const first = String(stack || "").split(",")[0].trim();
    return first.replace(/^['"]|['"]$/g, "");
}

const WM_LABELS = ["DRAFT", "CONFIDENTIAL", "SPECIMEN", "COPY", "INTERNAL", "PRELIMINARY", "SAMPLE", "NOT FOR DISTRIBUTION", "UNCONTROLLED COPY", "FOR REVIEW ONLY", "DO NOT COPY", "PROOF"];
const WM_FIRST = ["James", "Sarah", "Wei", "Priya", "Ahmed", "Luca", "Anna", "David", "Maria", "Chen", "Omar", "Sofia", "Tom", "Nadia", "Raj", "Elena", "Yuki", "Karl"];
const WM_LAST = ["Bennett", "Okonkwo", "Larsson", "Vargas", "Nakamura", "Fischer", "Romano", "Patel", "Dubois", "Haddad", "Walsh", "Schneider", "Costa", "Kim", "Novak", "Mwangi", "Andersen", "Reyes"];
const WM_DOMAINS = ["acme-corp.com", "globex.co", "initech.io", "meridian-group.com", "northwind.com", "contoso.net", "vertexllc.com", "harborstone.com"];
const WM_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function wmDate(rng) {
    const p2 = (n) => String(n).padStart(2, "0");
    const y = rng.int(2017, 2025), m = rng.int(1, 12), d = rng.int(1, 28);
    return rng.pick([`${y}-${p2(m)}-${p2(d)}`, `${p2(d)} ${WM_MON[m - 1]} ${y}`, `${p2(m)}/${p2(d)}/${y}`]);
}

// A data-leakage / DLP-style provenance watermark: the kind that stamps who
// retrieved a document and when (generation date, tracking id, user email).
function wmProvenance(rng) {
    const first = rng.pick(WM_FIRST), last = rng.pick(WM_LAST);
    const email = `${first[0].toLowerCase()}.${last.toLowerCase()}@${rng.pick(WM_DOMAINS)}`;
    const id = rng.pick([`DOC-${rng.int(10000, 99999)}`, `REF ${rng.int(100000, 999999)}`, `TX-${rng.int(2017, 2025)}-${String(rng.int(1, 9999)).padStart(4, "0")}`, `WM${rng.int(100000, 999999)}`]);
    return rng.pick([
        `Generated ${wmDate(rng)}`,
        `Printed ${wmDate(rng)} · ${first[0].toLowerCase()}${last.toLowerCase()}`,
        email,
        `Prepared by ${first} ${last}`,
        id,
        `${email} · ${wmDate(rng)}`,
        `Licensed to ${first} ${last} — do not distribute`,
        `Retrieved ${wmDate(rng)} by ${email}`,
        `${id} · ${wmDate(rng)}`,
    ]);
}

function randomWatermark(rng) {
    // Grey with wide lightness (light to fairly dark) and barely any hue.
    const color = hsl(rng.int(0, 359), rng.int(0, 16), rng.int(40, 80));
    // Classic diagonals, plenty of horizontal (un-rotated), and the odd tilt.
    const angle = rng.weighted([[-30, 3], [-45, 3], [-25, 1], [-15, 1], [0, 3], [8, 1], [-52, 1]]);
    const leak = rng.bool(0.4);
    const text = leak ? wmProvenance(rng) : rng.pick(WM_LABELS);
    // Long provenance strings need a smaller font to sit on one diagonal line.
    const sizePx = leak ? rng.int(20, 34) : rng.pick([72, 84, 92, 100]);
    return { text, color, opacity: rng.float(0.05, 0.16, 2), angle, sizePx };
}

// Extra visual dimensions layered on top of the core style so documents look
// meaningfully different even from similar base templates.
export function randomDecor(rng) {
    const hue = rng.int(0, 359);
    return {
        accent: hsl(hue, rng.int(35, 70), rng.int(28, 48)),
        headingUpper: rng.bool(0.25),
        headingSpacingPx: rng.pick([0, 0, 0.3, 0.6, 1]),
        h1Rule: rng.bool(0.4),
        h1Align: rng.weighted([["left", 6], ["center", 2], ["right", 1]]),
        titleBar: rng.bool(0.22),  // tinted masthead band behind the H1 title
        headingBar: rng.bool(0.3),
        thUpper: rng.bool(0.3),
        labelEmphasis: rng.bool(0.35),  // bold the first (row-label) column
        tableCard: rng.bool(0.2),       // subtle drop-shadow "card" around tables
        // body text alignment + micro-spacing
        bodyAlign: rng.weighted([["left", 6], ["justify", 4]]),
        lineHeight: rng.float(1.2, 1.6, 2),
        letterSpacingPx: rng.pick([0, 0, 0, 0.2, 0.4]),
        wordSpacingPx: rng.pick([0, 0, 0, 0.6, 1.2]),
        indentEm: rng.bool(0.3) ? rng.pick([1.2, 1.6]) : 0,
        tint: rng.bool(0.18) ? hsl(hue, rng.int(18, 40), rng.int(96, 99)) : "none",
        divider: rng.bool(0.35),
        numbered: rng.bool(0.3),
        // running header / footer band (independent so docs differ)
        header: rng.bool(0.4) ? { show: true, rule: rng.bool(0.7), align: rng.pick(["left", "center", "right"]), upper: rng.bool(0.5) } : { show: false },
        footer: rng.bool(0.5) ? { show: true, rule: rng.bool(0.8), align: rng.pick(["left", "center", "right"]), pageNo: rng.bool(0.6) } : { show: false },
        // synthetic watermark (real ones come from extraction and override this)
        watermark: rng.bool(0.15) ? randomWatermark(rng) : null,
        // page number at the foot of the page
        pageNum: rng.bool(0.55) ? { text: rng.pick(["1", "Page 1", "- 1 -", "Page 1 of 1", "[1]", "1 / 1"]), align: rng.pick(["center", "center", "right", "left"]) } : null,
    };
}

// Pick a COHERENT body+table font pairing from the bundled Google Fonts. Body
// is always serif or sans (monospace body reads as incoherent); monospace only
// ever appears as a table face on data-heavy docs. Returns family names + CSS
// stacks (the @font-face for the families is inlined at render time).
export function pickFonts(rng) {
    const [bc, tc] = rng.weighted([
        [["serif", "serif"], 3],
        [["sans", "sans"], 4],
        [["serif", "sans"], 2],
        [["sans", "serif"], 1],
        [["sans", "mono"], 1],
        [["serif", "mono"], 0.6],
    ]);
    const bodyFamily = rng.pick(GFONTS[bc]);
    const tableFamily = rng.pick(GFONTS[tc]);
    return { bodyFamily, bodyStack: familyStack(bodyFamily), tableFamily, tableStack: familyStack(tableFamily) };
}

// Varied absolute body size plus varied heading/body and table/body ratios.
export function bodySizes(rng) {
    const body = rng.weighted([[10, 2], [11, 3], [12, 3], [13, 2], [14, 2], [15, 1], [16, 1]]);
    return {
        body,
        table: Math.max(7, Math.min(14, Math.round(body * rng.float(0.72, 1.0, 2)))),
        h1: Math.round(body * rng.float(1.5, 2.5, 2)),
        h2: Math.round(body * rng.float(1.2, 1.6, 2)),
        h3: Math.max(body + 1, Math.round(body * rng.float(1.02, 1.2, 2))),
    };
}

export function randomTemplate(rng) {
    const fonts = pickFonts(rng);
    const hue = rng.int(0, 359);
    const border = rng.pick(BORDER_STYLES);
    const headerStyle = rng.weighted([["band", 3], ["bold-line", 2], ["plain-bold", 1]]);
    // Varied absolute size AND varied heading/body & table/body ratios so docs
    // don't all read at one scale.
    const s = bodySizes(rng);

    return {
        name: `random-${hue}-${border}`,
        page: {
            size: "A4",
            // mostly moderate margins, occasionally wide (some real docs are)
            marginIn: rng.weighted([[0.4, 3], [0.5, 3], [0.6, 2], [0.75, 1], [0.9, 0.5]]),
            // 1-2 columns common; 3-4 rare but they exist
            columns: rng.weighted([[1, 6], [2, 3], [3, 0.6], [4, 0.2]]),
            orientation: rng.weighted([["portrait", 6], ["landscape", 1]]),
        },
        body: {
            fontFamily: fonts.bodyFamily,
            fontStack: fonts.bodyStack,
            fontSizePx: s.body,
            color: hsl(0, 0, rng.int(8, 22)),
        },
        headings: {
            h1: { fontSizePx: s.h1, weight: 700, color: hsl(hue, rng.int(0, 50), rng.int(12, 28)) },
            h2: { fontSizePx: s.h2, weight: 700, color: hsl(hue, rng.int(0, 45), rng.int(18, 34)) },
            h3: { fontSizePx: s.h3, weight: 600, color: hsl(hue, rng.int(0, 40), rng.int(22, 38)) },
        },
        table: {
            fontFamily: fonts.tableFamily,
            fontStack: fonts.tableStack,
            fontSizePx: s.table,
            lineHeight: rng.float(1.1, 1.5, 2),
            border,
            borderColor: rng.bool(0.5) ? hsl(hue, rng.int(10, 40), rng.int(25, 55)) : hsl(0, 0, rng.int(20, 70)),
            borderWidthPx: rng.pick([0.5, 0.75, 1, 1, 1, 1.5, 2, 2, 3]),
            headerStyle,
            headerBg: headerStyle === "band" ? bandColor(rng) : (rng.bool(0.5) ? hsl(hue, 30, 92) : "transparent"),
            headerColor: headerStyle === "band" ? "#ffffff" : hsl(hue, 40, 22),
            zebra: (border === "none" || border === "horizontal") ? rng.bool(0.8) : rng.bool(0.4),
            zebraColor: hsl(hue, rng.int(15, 45), rng.int(92, 97)),
            cellPadXPx: rng.int(3, 16),
            cellPadYPx: rng.int(1, 11),
            width: rng.weighted([["100%", 5], ["auto", 1]]),
            numericAlign: "right",
        },
        decor: randomDecor(rng),
        fontFaces: [],
    };
}

// Return a lightly-jittered copy of a template so the (often plain) extracted
// styles render with more visual variety — different fonts, an accent header
// band, zebra striping, border style, padding. Keeps the template's page/font
// sizes grounded; only diversifies appearance.
export function varyTemplate(t, rng) {
    const v = JSON.parse(JSON.stringify(t));
    v.name = `${t.name}~v`;

    // Fonts: if this template already carries a mapped Google family (from the
    // upgraded extractor) keep it most of the time; otherwise derive Google
    // families — mapping the source font's name when we have it, else random —
    // so every doc renders in a real, coherent bundled webfont.
    if (v.body.fontFamily && rng.bool(0.7)) {
        // Keep the captured serif/sans/mono CLASS (real-document fidelity) but
        // re-pick the specific family within that class most of the time. The
        // extractor maps the many unmatched source-font names onto a single
        // default per class, so without this one family would dominate ~1/3 of
        // the dataset.
        const reBody = rng.bool(0.75) ? rng.pick(GFONTS[classOf(v.body.fontFamily)]) : v.body.fontFamily;
        const reTable = rng.bool(0.75) ? rng.pick(GFONTS[classOf(v.table.fontFamily)]) : v.table.fontFamily;
        v.body.fontFamily = reBody;
        v.body.fontStack = familyStack(reBody);
        v.table.fontFamily = reTable;
        v.table.fontStack = familyStack(reTable);
    } else if (rng.bool(0.5)) {
        const bf = mapToGoogle(firstFamily(v.body.fontStack), rng);
        const tf = rng.bool(0.6) ? bf : mapToGoogle(firstFamily(v.table.fontStack), rng);
        v.body.fontFamily = bf;
        v.body.fontStack = familyStack(bf);
        v.table.fontFamily = tf;
        v.table.fontStack = familyStack(tf);
    } else {
        const f = pickFonts(rng);
        v.body.fontFamily = f.bodyFamily;
        v.body.fontStack = f.bodyStack;
        v.table.fontFamily = f.tableFamily;
        v.table.fontStack = f.tableStack;
    }
    // BODY text is never monospace — a whole report set in a mono font reads wrong
    // (some captured templates have a mono body that the keep-path preserved).
    // A monospace TABLE is fine and stays.
    if (classOf(v.body.fontFamily) === "mono") {
        const bf = rng.pick(GFONTS[rng.bool(0.5) ? "sans" : "serif"]);
        v.body.fontFamily = bf;
        v.body.fontStack = familyStack(bf);
    }
    if (rng.bool(0.7)) {
        const s = bodySizes(rng);
        v.body.fontSizePx = s.body;
        v.table.fontSizePx = s.table;
        v.headings.h1.fontSizePx = s.h1;
        v.headings.h2.fontSizePx = s.h2;
        v.headings.h3.fontSizePx = s.h3;
    }
    if (v.table.width === "auto" && rng.bool(0.6)) {
        v.table.width = "100%";
    }
    const hue = rng.int(0, 359);
    // give plain headers a colored band sometimes
    if (rng.bool(0.4) && (v.table.headerStyle !== "band" || v.table.headerBg === "transparent")) {
        v.table.headerStyle = "band";
        v.table.headerBg = bandColor(rng);
        v.table.headerColor = "#ffffff";
    } else if (rng.bool(0.3)) {
        v.table.headerBg = hsl(hue, 30, 92);
        v.table.headerColor = hsl(hue, 40, 22);
    }
    if (rng.bool(0.4)) {
        v.table.zebra = true;
        v.table.zebraColor = hsl(hue, rng.int(15, 45), rng.int(92, 97));
    }
    if (rng.bool(0.45)) {
        v.table.border = rng.pick(BORDER_STYLES);
        if (rng.bool(0.5)) {
            v.table.borderColor = hsl(hue, rng.int(10, 40), rng.int(25, 55));
        }
    }
    if (rng.bool(0.5)) {
        v.table.borderWidthPx = rng.pick([0.5, 0.75, 1, 1, 1.5, 2, 2, 3]);
    }
    if (rng.bool(0.4)) {
        v.table.cellPadXPx = rng.int(3, 16);
        v.table.cellPadYPx = rng.int(1, 11);
    }
    // Decor: if the extractor CAPTURED real decor (spacing/align/header/footer),
    // keep it and only add the small stylistic flags it doesn't carry. Otherwise
    // synthesize a full random decor layer for variety.
    if (v.decor && v.decor.captured) {
        const r = randomDecor(rng);
        v.decor.headingUpper = r.headingUpper;
        v.decor.headingSpacingPx = r.headingSpacingPx;
        v.decor.h1Rule = r.h1Rule;
        v.decor.titleBar = r.titleBar;
        v.decor.h1Align = v.decor.h1Align || r.h1Align;
        v.decor.headingBar = r.headingBar;
        v.decor.thUpper = r.thUpper;
        v.decor.labelEmphasis = r.labelEmphasis;
        v.decor.tableCard = r.tableCard;
        v.decor.divider = r.divider;
        v.decor.numbered = r.numbered;
        v.decor.indentEm = r.indentEm;
        v.decor.pageNum = r.pageNum;
        if (!v.decor.accent) { v.decor.accent = r.accent; }
    } else {
        v.decor = randomDecor(rng);
    }
    // Preserve captured watermark/logo; only synth a watermark if none captured.
    if (!v.watermark && v.decor && v.decor.watermark === undefined) {
        v.decor.watermark = randomDecor(rng).watermark;
    }
    return v;
}

export function loadTemplates(dir) {
    const resolved = dir.replace(/^~/, process.env.HOME || "");
    if (!fs.existsSync(resolved)) {
        throw new Error(`templates dir not found: ${resolved}`);
    }
    const out = [];
    for (const f of fs.readdirSync(resolved)) {
        if (f.endsWith(".json")) {
            try {
                const t = JSON.parse(fs.readFileSync(path.join(resolved, f), "utf-8"));
                // inline a captured logo as a data URI so render stays path-free
                if (t.logo && t.logo.src && !t.logo.dataUri) {
                    const p = path.join(resolved, t.logo.src);
                    if (fs.existsSync(p)) {
                        t.logo.dataUri = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
                    } else {
                        t.logo = null;
                    }
                }
                out.push(t);
            } catch {
                // skip unparseable template files
            }
        }
    }
    return out;
}

// Approximate luminance (0=black, 1=white) of a hex or hsl color.
export function luminance(color) {
    const hex = String(color).match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    }
    const h = String(color).match(/hsl\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/i);
    if (h) {
        return Number(h[1]) / 100;
    }
    return 0; // unknown -> assume dark (no change)
}

// Guard against unreadable captured colors: body/cell text must be dark on the
// (light) page; header text must contrast with its band.
function darkText(color) {
    return luminance(color) > 0.6 ? "#222222" : color;
}

// Colorfulness (0 = neutral grey, 1 = fully saturated) of a hex or hsl color.
function chroma(color) {
    const hex = String(color).match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        const n = parseInt(hex[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    }
    const h = String(color).match(/hsl\(\s*[\d.]+\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
    if (h) {
        const s = Number(h[1]) / 100, l = Number(h[2]) / 100;
        return (1 - Math.abs(2 * l - 1)) * s;
    }
    return 0;
}

// Body and table-cell copy must read as a near-neutral dark. A mis-captured
// template can carry a vivid hue (e.g. a blue that survives the darkText check
// because it's dark enough) — no real document sets body text to a saturated
// color, so neutralize it. (Headings keep their accent color.)
function bodyText(color) {
    return (luminance(color) > 0.6 || chroma(color) > 0.22) ? "#222222" : color;
}

// A near-white tint sharing the hue of a theme color (header band / accent),
// used to shade section-divider rows so they sit cohesively in the palette.
export function lightTintOf(color) {
    const m = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,/.exec(String(color));
    if (m) { return `hsl(${m[1]}, ${Math.min(38, Number(m[2]))}%, 94%)`; }
    return "#eceff3";
}

// Build the <style> body for one template.
export function templateToCss(t) {
    const tb = t.table;
    const bw = tb.borderWidthPx;
    const bc = tb.borderColor;
    // Section-subheader band: a light tint of the table's theme color, bold.
    const sectionBg = lightTintOf((tb.headerBg && tb.headerBg !== "transparent") ? tb.headerBg : (t.decor && t.decor.accent) || tb.borderColor);
    let cellBorder = "";
    if (tb.border === "grid" || tb.border === "outer-grid" || tb.border === "hairline-grid") {
        const w = tb.border === "hairline-grid" ? 0.5 : bw;
        cellBorder = `border: ${w}px solid ${bc};`;
    } else if (tb.border === "horizontal") {
        cellBorder = `border-bottom: ${bw}px solid ${bc};`;
    } else if (tb.border === "vertical") {
        cellBorder = `border-left: ${bw}px solid ${bc}; border-right: ${bw}px solid ${bc};`;
    } else if (tb.border === "thick-header" || tb.border === "top-bottom") {
        cellBorder = `border-bottom: 0.5px solid ${bc};`;
    }
    // The bottom border a normal BODY cell carries — row-header <th> cells reuse
    // it so they match the body rows instead of the heavy header underline.
    let cellBottom = "none";
    if (tb.border === "grid" || tb.border === "outer-grid" || tb.border === "hairline-grid") {
        cellBottom = `${tb.border === "hairline-grid" ? 0.5 : bw}px solid ${bc}`;
    } else if (tb.border === "horizontal") {
        cellBottom = `${bw}px solid ${bc}`;
    } else if (tb.border === "thick-header" || tb.border === "top-bottom") {
        cellBottom = `0.5px solid ${bc}`;
    }
    let tableBorder = "";
    if (tb.border === "box" || tb.border === "outer-grid" || tb.border === "frame") {
        tableBorder = `border: ${bw + 1}px solid ${bc};`;
    } else if (tb.border === "top-bottom") {
        tableBorder = `border-top: ${bw + 1}px solid ${bc}; border-bottom: ${bw + 1}px solid ${bc};`;
    }
    const headerBorder = (tb.border === "header-only" || tb.border === "box" || tb.border === "top-bottom" || tb.headerStyle === "bold-line")
        ? `border-bottom: ${Math.max(2, bw + 1)}px solid ${bc};`
        : (tb.border === "thick-header" ? `border-bottom: ${bw + 2}px solid ${bc};` : cellBorder);

    const fontFaces = (t.fontFaces || [])
        .map((ff) => `@font-face { font-family: ${JSON.stringify(ff.family)}; src: ${ff.src}; }`)
        .join("\n");

    const d = t.decor || {};
    const acc = d.accent || tb.borderColor;
    const wm = t.watermark || d.watermark || null;
    const decorCss = `
    ${d.tint && d.tint !== "none" && luminance(d.tint) > 0.85 ? `body { background: ${d.tint}; }` : ""}
    p {
      ${d.bodyAlign ? `text-align: ${d.bodyAlign};` : (d.justify ? "text-align: justify;" : "")}
      ${d.lineHeight ? `line-height: ${d.lineHeight};` : ""}
      ${d.letterSpacingPx ? `letter-spacing: ${d.letterSpacingPx}px;` : ""}
      ${d.wordSpacingPx ? `word-spacing: ${d.wordSpacingPx}px;` : ""}
      ${d.indentEm ? `text-indent: ${d.indentEm}em;` : ""}
    }
    h1 {
      ${d.headingUpper ? "text-transform: uppercase;" : ""}
      ${d.headingSpacingPx ? `letter-spacing: ${d.headingSpacingPx}px;` : ""}
      ${d.h1Align ? `text-align: ${d.h1Align};` : ""}
      ${d.h1Rule && !d.titleBar ? `border-bottom: 2px solid ${acc}; padding-bottom: 4px;` : ""}
      ${d.titleBar ? `background: ${lightTintOf(acc)}; border-left: 5px solid ${acc}; padding: 9px 14px;` : ""}
    }
    h2, h3 {
      ${d.headingUpper ? "text-transform: uppercase;" : ""}
      ${d.headingBar ? `border-left: 3px solid ${acc}; padding-left: 7px;` : ""}
    }
    ${d.thUpper ? "table.gen th { text-transform: uppercase; letter-spacing: 0.03em; }" : ""}
    ${d.labelEmphasis ? "table.gen tbody tr td:first-child { font-weight: 600; }" : ""}
    ${d.tableCard ? "table.gen { box-shadow: 0 1px 6px rgba(0,0,0,0.10); }" : ""}
    a { color: #15509e; text-decoration: underline; text-underline-offset: 1.5px; }
    hr.divider { border: none; border-top: 1px solid ${acc}; opacity: 0.45; margin: 14px 0; }
    .callout { border-left: 3px solid ${acc}; background: ${lightTintOf(acc)}; padding: 9px 13px; margin: 11px 0 14px; border-radius: 2px; break-inside: avoid; }
    .runhead { font-size: 0.72em; color: #777; letter-spacing: 0.05em; margin-bottom: 10px; padding-bottom: 4px; ${d.header && d.header.rule ? `border-bottom: 1px solid ${acc};` : ""} text-align: ${d.header ? d.header.align || "left" : "left"}; ${d.header && d.header.upper ? "text-transform: uppercase;" : ""} }
    .runfoot { font-size: 0.72em; color: #888; margin-top: 16px; padding-top: 4px; ${d.footer && d.footer.rule ? "border-top: 1px solid #ccc;" : ""} text-align: ${d.footer ? d.footer.align || "left" : "left"}; }
    .doclogo { display: block; max-height: 46px; max-width: 220px; margin-bottom: 8px; }
    .letterhead { display: flex; align-items: center; gap: 13px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e2e2; }
    .letterhead.lh-right { justify-content: flex-end; text-align: right; }
    .letterhead.lh-center { flex-direction: column; align-items: center; text-align: center; gap: 5px; }
    .letterhead .doclogo { margin-bottom: 0; }
    .lh-name { font-weight: 700; font-size: 1.08em; line-height: 1.2; }
    .lh-tag { font-size: 0.8em; color: #666; margin-top: 1px; }
    ${wm ? `.watermark { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-size: ${wm.sizePx ?? 92}px; font-weight: 800; color: ${wm.color || "#999"}; opacity: ${wm.opacity ?? 0.1}; transform: rotate(${wm.angle ?? -30}deg); letter-spacing: 0.08em; white-space: nowrap; pointer-events: none; z-index: 0; }` : ""}
  `;

    return `
    ${fontFaces}
    body {
      font-family: ${t.body.fontStack};
      font-size: ${t.body.fontSizePx}px;
      color: ${bodyText(t.body.color)};
    }
    h1 { font-family: ${t.body.fontStack}; font-size: ${Math.min(30, t.headings.h1.fontSizePx)}px; font-weight: ${t.headings.h1.weight}; color: ${darkText(t.headings.h1.color)}; margin: 0 0 6px; }
    h2 { font-family: ${t.body.fontStack}; font-size: ${Math.min(20, t.headings.h2.fontSizePx)}px; font-weight: ${t.headings.h2.weight}; color: ${darkText(t.headings.h2.color)}; margin: 20px 0 7px; }
    h3 { font-family: ${t.body.fontStack}; font-size: ${Math.min(16, t.headings.h3.fontSizePx)}px; font-weight: ${t.headings.h3.weight}; color: ${darkText(t.headings.h3.color)}; margin: 16px 0 6px; }
    /* heading directly above its own table/figure groups tighter */
    h2 + table.gen, h3 + table.gen, h2 + figure.fig, h3 + figure.fig { margin-top: 7px; }
    p { margin: 0 0 9px; }
    p.caption { font-size: 0.9em; color: #444; }
    .footer { margin-top: 24px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 4px; }
    table.gen {
      border-collapse: collapse;
      width: ${tb.width};
      font-family: ${tb.fontStack};
      font-size: ${tb.fontSizePx}px;
      line-height: ${tb.lineHeight};
      ${tableBorder}
      margin: 8px 0 16px;
    }
    table.gen td, table.gen th {
      padding: ${tb.cellPadYPx}px ${tb.cellPadXPx}px;
      ${cellBorder}
      vertical-align: top;
    }
    table.gen th {
      background: ${tb.headerBg};
      color: ${(tb.headerBg && tb.headerBg !== "transparent") ? (luminance(tb.headerBg) > 0.55 ? "#1a1a1a" : "#ffffff") : darkText(tb.headerColor)};
      font-weight: 600;
      text-align: left;
      ${headerBorder}
    }
    table.gen td.num, table.gen th.num { text-align: ${tb.numericAlign}; font-variant-numeric: tabular-nums; }
    table.gen td.ctr, table.gen th.ctr { text-align: center; }
    table.gen td.sec { background: ${sectionBg}; font-weight: 700; ${bw ? `border-top: ${bw}px solid ${bc};` : ""} letter-spacing: 0.01em; }
    table.gen tbody th.rh { background: ${sectionBg}; color: #1a1a1a; font-weight: 600; text-align: left; border-bottom: ${cellBottom}; }
    table.gen tbody tr.total td { border-top: ${Math.max(1.5, bw + 0.5)}px solid ${bc}; }
    ${tb.zebra ? `table.gen tbody tr:nth-child(even) td:not(.sec):not(.c-good):not(.c-warn):not(.c-bad) { background: ${tb.zebraColor}; }` : ""}
    ${decorCss}
  `;
}
