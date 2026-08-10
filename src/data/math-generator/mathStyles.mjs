// Document ARCHETYPES for math documents: textbook / scientific paper /
// lecture notes / exam / reference handbook. Each is a correlated bundle of
// column count, base font sizing and chrome CSS. The textual chrome (kicker,
// byline, abstract, instructions) lives in the MODEL (mathContent.mjs) so it
// is part of the gold markdown; this module is pure skin + structural params.
//
// MG_STYLE env (default "mix"): force one archetype or a csv subset.
// MG_OLD_BOOK=1: "old scanned math book" family — restricts the mix to three
// period substyles (treatise18 / letterpress1900 / midcentury) that imitate
// real scanned book pages (typography/layout only; paper aging is the degrade
// stage's job). MG_STYLE can also name the substyles directly.

import { familyStack } from "./googleFonts.mjs";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Arial, sans-serif";

export const OLD_BOOK_KEYS = ["treatise18", "letterpress1900", "midcentury"];

// Chrome shared by the three old-book substyles: a three-cell running head
// (left / center / right) and a catchword slot at the foot of the page.
const OLD_SHARED_CSS = `
  .obhead { display: flex; align-items: baseline; margin: 0 0 16px; }
  .obhead .obl { flex: 1; text-align: left; }
  .obhead .obc { flex: 2.6; text-align: center; }
  .obhead .obr { flex: 1; text-align: right; }
  .catchword { text-align: right; margin-top: 22px; }
  .disp { break-inside: avoid; }
`;

export const STYLES = {
    textbook: {
        key: "textbook",
        cols: () => 1,
        numberEqs: 0.6,
        css: (accent, tint) => `
  body.ds-textbook { font-family: ${SERIF}; font-size: 12.5px; }
  .ds-textbook .kicker { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: ${accent}; margin-bottom: 2px; }
  .ds-textbook h1 { font-size: 22px; border-bottom: 2px solid ${accent}; padding-bottom: 6px; font-family: ${SERIF}; }
  .ds-textbook h2 { font-size: 15px; margin: 14px 0 6px; font-family: ${SERIF}; }
  .ds-textbook .env { border: 1px solid ${accent}; background: ${tint}; border-left: 4px solid ${accent}; padding: 7px 12px; margin: 10px 0; break-inside: avoid; }
  .ds-textbook .env .envhead { font-weight: 700; }
  .ds-textbook .env-Proof, .ds-textbook .env-Remark { border: none; background: transparent; padding: 0 0 0 2px; border-left: none; }
`,
    },
    paper: {
        key: "paper",
        cols: () => 2,
        numberEqs: 0.9,
        css: (accent) => `
  body.ds-paper { font-family: ${SERIF}; font-size: 10.5px; text-align: justify; }
  .ds-paper h1 { font-size: 18px; text-align: center; font-weight: 700; margin: 2px 0 6px; font-family: ${SERIF}; border: none; }
  .ds-paper .byline { text-align: center; font-size: 10.5px; color: #333; margin: 2px 0; }
  .ds-paper .meta { text-align: center; font-size: 9px; color: #888; margin-bottom: 8px; letter-spacing: .03em; }
  .ds-paper .abstract { font-size: 9.8px; line-height: 1.4; margin: 6px 7% 12px; color: #222; }
  .ds-paper h2 { font-size: 12px; font-weight: 700; margin: 11px 0 4px; font-family: ${SERIF}; }
  .ds-paper .env .envhead { font-weight: 700; font-variant: small-caps; }
  .ds-paper .env { font-style: italic; margin: 8px 0; }
  .ds-paper .env .envhead, .ds-paper .env .katex { font-style: normal; }
  .ds-paper .env-Proof { font-style: normal; }
`,
    },
    lecture: {
        key: "lecture",
        cols: () => 1,
        numberEqs: 0.3,
        wideMargins: true,
        css: (accent) => `
  body.ds-lecture { font-size: 12.5px; }
  .ds-lecture .kicker { font-size: 10.5px; color: ${accent}; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .ds-lecture h1 { font-size: 20px; margin: 2px 0 3px; }
  .ds-lecture .meta { font-size: 10px; color: #777; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 10px; }
  .ds-lecture h2 { font-size: 14px; color: ${accent}; margin: 13px 0 5px; }
  .ds-lecture .env { border-left: 3px solid ${accent}; padding: 2px 0 2px 10px; margin: 9px 0; }
  .ds-lecture .env .envhead { font-weight: 700; }
`,
    },
    exam: {
        key: "exam",
        cols: (rng) => (rng.bool(0.3) ? 2 : 1),
        numberEqs: 0,
        css: (accent) => `
  body.ds-exam { font-family: ${SANS}; font-size: 11.5px; }
  .ds-exam h1 { font-size: 17px; text-align: center; margin: 0 0 3px; border: none; font-family: ${SANS}; }
  .ds-exam .meta { text-align: center; font-size: 10px; color: #444; margin-bottom: 6px; }
  .ds-exam .instructions { font-size: 10px; border: 1px solid #999; padding: 6px 10px; margin: 8px 0 12px; }
  .ds-exam .problem { margin: 0 0 13px; break-inside: avoid; }
  .ds-exam .problem .phead { font-weight: 700; }
  .ds-exam .problem .pts { font-weight: 400; font-style: italic; color: #555; }
`,
    },
    handbook: {
        key: "handbook",
        cols: (rng, tier) => (tier === "hard" ? 2 : rng.pick([2, 3])),
        numberEqs: 0,
        css: (accent, tint) => `
  body.ds-handbook { font-family: ${SANS}; font-size: 9.5px; }
  .ds-handbook h1 { font-size: 16px; margin: 0 0 2px; border: none; font-family: ${SANS}; }
  .ds-handbook .meta { font-size: 9px; color: #777; border-bottom: 2px solid ${accent}; padding-bottom: 5px; margin-bottom: 9px; }
  .ds-handbook h2 { font-size: 11px; background: ${tint}; border-left: 3px solid ${accent}; padding: 3px 7px; margin: 9px 0 5px; font-family: ${SANS}; }
  .ds-handbook .hbitem { margin: 0 0 7px; break-inside: avoid; }
  .ds-handbook .hbitem .hblabel { font-weight: 700; font-size: 9px; color: #333; }
  .ds-handbook .disp .katex-display { margin: 0.25em 0; }
  .ds-handbook .katex { font-size: 1em; }
`,
    },
    // ---- MG_OLD_BOOK family: pages that read like real scanned math books ----
    // Anchors: the 11 scans in math-scanned-old-example-templates. Only era
    // faces from the bundled pool; the css() functions take an extra rng so
    // per-doc quirks (letterpress word-spacing jitter) stay seeded.
    treatise18: {
        key: "treatise18",
        cols: () => 1,
        numberEqs: 0,
        oldBook: true,
        fonts: ["EB Garamond", "Cardo"],
        marginIn: (rng) => rng.float(0.95, 1.2, 2),
        bodyPx: (rng) => rng.int(13, 15),
        lineHeight: (rng) => rng.float(1.55, 1.75, 2),
        indentEm: 0,
        css: (accent, tint, rng) => `
  ${OLD_SHARED_CSS}
  .ds-treatise18 .obhead { font-size: 1.04em; margin-bottom: ${rng ? rng.int(18, 26) : 20}px; }
  .ds-treatise18 .obhead .obc, .ds-treatise18 .obhead .obl { font-style: italic; }
  .ds-treatise18 p { margin: 0 0 ${rng ? rng.int(8, 12) : 10}px; }
  .ds-treatise18 .plead { margin-right: 0.35em; }
  .ds-treatise18 .disp .katex-display { margin: 0.75em 0; }
  .ds-treatise18 .catchword { font-size: 0.98em; }
`,
    },
    letterpress1900: {
        key: "letterpress1900",
        cols: () => 1,
        numberEqs: 0,
        oldBook: true,
        fonts: ["PT Serif", "Noto Serif"],
        marginIn: (rng) => rng.float(0.5, 0.65, 2),
        bodyPx: (rng) => rng.int(12, 13),
        lineHeight: (rng) => rng.float(1.5, 1.68, 2),
        indentEm: 1.2,
        // LOOSE, uneven hand-set spacing: base word-spacing plus a per-paragraph
        // jitter cycle (no geometric warping — the degrade stage does the rest).
        css: (accent, tint, rng) => `
  ${OLD_SHARED_CSS}
  .ds-letterpress1900 .obhead { font-size: 0.98em; margin-bottom: ${rng ? rng.int(14, 20) : 16}px; }
  .ds-letterpress1900 .obhead .obc { letter-spacing: 0.1em; }
  .ds-letterpress1900 .obhead .obr { font-size: 1.12em; }
  .ds-letterpress1900 p { word-spacing: ${rng ? rng.float(1.2, 2.2, 2) : 1.6}px; letter-spacing: 0.12px; margin: 0 0 6px; }
  .ds-letterpress1900 p:nth-of-type(3n) { word-spacing: ${rng ? rng.float(2.6, 4.6, 2) : 3.4}px; }
  .ds-letterpress1900 p:nth-of-type(3n+1) { word-spacing: ${rng ? rng.float(0.6, 1.6, 2) : 1.0}px; }
  .ds-letterpress1900 p:nth-of-type(4n+2) { word-spacing: ${rng ? rng.float(3.4, 5.6, 2) : 4.2}px; }
  .ds-letterpress1900 .plead { font-variant: small-caps; font-weight: 700; letter-spacing: 0.04em; margin-right: 0.3em; }
  .ds-letterpress1900 .disp .katex-display { margin: 0.6em 0; }
`,
    },
    midcentury: {
        key: "midcentury",
        cols: () => 1,
        numberEqs: 0.65,
        oldBook: true,
        fonts: ["Libre Baskerville", "Crimson Text", "Lora"],
        marginIn: (rng) => rng.float(0.8, 1.0, 2),
        bodyPx: (rng) => rng.int(12, 14),
        lineHeight: (rng) => rng.float(1.5, 1.65, 2),
        indentEm: 1.4,
        css: (accent, tint, rng) => `
  ${OLD_SHARED_CSS}
  .ds-midcentury .obhead { font-size: 1.0em; margin-bottom: ${rng ? rng.int(16, 24) : 18}px; }
  .ds-midcentury .obhead .obc { font-style: italic; }
  .ds-midcentury p { margin: 0 0 ${rng ? rng.int(6, 9) : 7}px; }
  .ds-midcentury .env .envhead { font-style: italic; font-weight: 400; }
  .ds-midcentury .env .envhead em { font-style: italic; }
  .ds-midcentury .plead { font-style: italic; margin-right: 0.3em; }
  .ds-midcentury .disp .katex-display { margin: 0.65em 0; }
`,
    },
};

// A restrained template for the old-book family: one era serif for everything,
// near-black ink, a single justified column, no color chrome / watermarks /
// bands. Shape-compatible with templateToCss(t).
export function oldBookTemplate(rng, style) {
    const family = rng.pick(style.fonts);
    // Libre Baskerville has a very large x-height — pull it down a notch.
    const body = style.bodyPx(rng) - (family === "Libre Baskerville" ? 1 : 0);
    const ink = `hsl(0, 0%, ${rng.int(5, 12)}%)`;
    return {
        name: `oldbook-${style.key}-${family.replace(/\s+/g, "")}`,
        page: { size: "A4", marginIn: style.marginIn(rng), columns: 1, orientation: "portrait" },
        body: { fontFamily: family, fontStack: familyStack(family), fontSizePx: body, color: ink },
        headings: {
            h1: { fontSizePx: Math.round(body * 1.5), weight: 700, color: ink },
            h2: { fontSizePx: Math.round(body * 1.15), weight: 700, color: ink },
            h3: { fontSizePx: body + 1, weight: 700, color: ink },
        },
        table: {
            fontFamily: family, fontStack: familyStack(family), fontSizePx: Math.max(9, body - 1),
            lineHeight: 1.4, border: "none", borderColor: "#333333", borderWidthPx: 0.5,
            headerStyle: "plain-bold", headerBg: "transparent", headerColor: "#222222",
            zebra: false, zebraColor: "#ffffff", cellPadXPx: 6, cellPadYPx: 3,
            width: "auto", numericAlign: "right",
        },
        decor: {
            accent: ink,
            bodyAlign: "justify",
            lineHeight: style.lineHeight(rng),
            letterSpacingPx: 0,
            wordSpacingPx: 0,
            indentEm: style.indentEm,
            tint: "none",
            headingUpper: false,
            h1Align: "left",
            header: { show: false },
            footer: { show: false },
            watermark: null,
            pageNum: null,
        },
        fontFaces: [],
    };
}

// Pick an archetype, honouring MG_STYLE (mix | <key> | csv of keys) and
// MG_OLD_BOOK=1 (seeded per-doc pick among the three old-book substyles).
export function pickStyle(rng) {
    const env = (process.env.MG_STYLE || "mix").trim();
    if (env !== "mix" && env !== "all") {
        const allow = env.split(",").map((s) => s.trim()).filter((k) => STYLES[k]);
        if (allow.length) {
            return STYLES[rng.pick(allow)];
        }
    }
    if (process.env.MG_OLD_BOOK === "1") {
        return STYLES[rng.weighted([["treatise18", 1], ["letterpress1900", 1.1], ["midcentury", 1.1]])];
    }
    return STYLES[rng.weighted([["textbook", 3], ["paper", 3], ["lecture", 2], ["exam", 2], ["handbook", 2]])];
}
