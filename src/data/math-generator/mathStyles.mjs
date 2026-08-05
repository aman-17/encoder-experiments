// Document ARCHETYPES for math documents: textbook / scientific paper /
// lecture notes / exam / reference handbook. Each is a correlated bundle of
// column count, base font sizing and chrome CSS. The textual chrome (kicker,
// byline, abstract, instructions) lives in the MODEL (mathContent.mjs) so it
// is part of the gold markdown; this module is pure skin + structural params.
//
// MG_STYLE env (default "mix"): force one archetype or a csv subset.

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Arial, sans-serif";

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
};

// Pick an archetype, honouring MG_STYLE (mix | <key> | csv of keys).
export function pickStyle(rng) {
    const env = (process.env.MG_STYLE || "mix").trim();
    if (env !== "mix" && env !== "all") {
        const allow = env.split(",").map((s) => s.trim()).filter((k) => STYLES[k]);
        if (allow.length) {
            return STYLES[rng.pick(allow)];
        }
    }
    return STYLES[rng.weighted([["textbook", 3], ["paper", 3], ["lecture", 2], ["exam", 2], ["handbook", 2]])];
}
