// Document ARCHETYPES: a correlated bundle (fonts + columns + chrome + captions +
// background) that makes a page read as an arXiv paper / journal / textbook /
// magazine / financial report / slide — variety the independent style templates
// can't reliably produce. Chart-only run: these are pure SKIN + chrome (no table).
// Selected per doc (pickDocStyle), applied in render.mjs::documentHtml.

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SERIF = "Georgia, 'Times New Roman', 'Noto Serif', serif";
const SANS = "'Helvetica Neue', Arial, 'Noto Sans', sans-serif";
const AUTHORS = ["A. Kumar", "L. Fischer", "M. Rossi", "S. Tanaka", "J. Okafor", "R. Ivanova", "P. Dubois", "N. Haddad", "C. Silva", "E. Novak"];
const INSTS = ["Institute for Applied Analytics", "Dept. of Economics, State University", "National Data Laboratory", "Center for Quantitative Studies", "School of Computing"];

function authors(rng, n) { return rng.shuffle(AUTHORS).slice(0, n).join(", "); }
const yr = (rng) => 2019 + rng.int(0, 6);

// each archetype: { key, columns, css, pageBg, chrome(doc,rng) -> top HTML (replaces default title) }
export const DOCSTYLES = {
  arxiv: {
    key: "arxiv", columns: 2, pageBg: "#ffffff",
    css: `body.ds-arxiv{font-family:${SERIF};text-align:justify;}
 .ds-arxiv h1{font-size:19px;text-align:center;font-weight:700;margin:2px 0 4px;}
 .ds-arxiv .ax-byline{text-align:center;font-size:11px;color:#333;margin:2px 0;}
 .ds-arxiv .ax-id{text-align:center;font-size:9.5px;color:#888;margin-bottom:8px;letter-spacing:.03em;}
 .ds-arxiv .ax-abstract{font-size:10.5px;line-height:1.4;margin:6px 8% 12px;color:#222;}
 .ds-arxiv .ax-abstract b{font-variant:small-caps;}
 .ds-arxiv h2,.ds-arxiv h3{font-size:12px;font-weight:700;margin:12px 0 4px;}
 .ds-arxiv figcaption{font-size:9px;}`,
    chrome: (doc, rng) => `<h1>${esc(doc.docTitle || "A Quantitative Study")}</h1>
 <div class="ax-byline">${authors(rng, rng.int(2, 4))} &nbsp;·&nbsp; ${esc(rng.pick(INSTS))}</div>
 <div class="ax-id">arXiv:${yr(rng)}.${String(rng.int(1000, 99999)).padStart(5, "0")}v${rng.int(1, 3)} [stat.AP] &nbsp; ${yr(rng)}</div>
 <div class="ax-abstract"><b>Abstract.</b> ${esc((doc.intro && doc.intro[0]) || doc.subtitle || "We present an empirical analysis of the reported indicators across the observed period.")}</div>`,
  },
  journal: {
    key: "journal", columns: 2, pageBg: "#ffffff",
    css: `body.ds-journal{font-family:${SERIF};text-align:justify;}
 .ds-journal .jr-masthead{border-top:2px solid #7a1f2b;border-bottom:1px solid #ccc;padding:3px 0;font-size:9px;color:#7a1f2b;letter-spacing:.08em;text-transform:uppercase;display:flex;justify-content:space-between;margin-bottom:10px;}
 .ds-journal h1{font-size:17px;font-weight:700;margin:4px 0;}
 .ds-journal .jr-meta{font-size:10px;color:#444;margin-bottom:8px;}
 .ds-journal .jr-doi{font-size:9px;color:#888;}
 .ds-journal figcaption{font-size:9px;font-variant:small-caps;color:#555;}`,
    chrome: (doc, rng) => `<div class="jr-masthead"><span>J. Applied Data Science</span><span>Vol. ${rng.int(8, 42)} · No. ${rng.int(1, 12)} · ${yr(rng)}</span></div>
 <h1>${esc(doc.docTitle || "Findings on Sectoral Performance")}</h1>
 <div class="jr-meta">${authors(rng, rng.int(2, 3))}<br><span class="jr-doi">DOI:10.10${rng.int(10, 99)}/jads.${yr(rng)}.${rng.int(100, 999)} · Keywords: analytics, indicators, forecasting</span></div>`,
  },
  textbook: {
    key: "textbook", columns: 1, pageBg: "#fdfcf7",
    css: `body.ds-textbook{font-family:${SERIF};font-size:12.5px;padding-right:22% !important;}
 .ds-textbook .tb-chap{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8a6d3b;margin-bottom:2px;}
 .ds-textbook h1{font-size:22px;font-weight:700;border-bottom:2px solid #8a6d3b;padding-bottom:6px;}
 .ds-textbook .tb-box{border:1px solid #c9b48a;background:#fbf4e4;border-left:4px solid #8a6d3b;padding:8px 12px;margin:12px 0;font-size:11px;}
 .ds-textbook .tb-box b{color:#8a6d3b;}
 .ds-textbook figcaption{font-size:10px;font-style:italic;}`,
    chrome: (doc, rng) => `<div class="tb-chap">Chapter ${rng.int(2, 12)} · Section ${rng.int(1, 6)}.${rng.int(1, 5)}</div>
 <h1>${esc(doc.docTitle || "Reading Quantitative Charts")}</h1>
 <div class="tb-box"><b>Definition.</b> ${esc((doc.intro && doc.intro[0]) || "A chart encodes tabular values into visual position; reading it means recovering those values from the axes.")}</div>`,
  },
  magazine: {
    key: "magazine", columns: 1,
    pageBg: null, // let the accent tint show; set below per-doc
    css: `body.ds-magazine{font-family:${SANS};}
 .ds-magazine .mz-kicker{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:800;color:#c0392b;margin-bottom:2px;}
 .ds-magazine h1{font-size:30px;font-weight:800;line-height:1.05;margin:2px 0 6px;}
 .ds-magazine .mz-deck{font-size:14px;color:#555;font-weight:300;margin-bottom:6px;}
 .ds-magazine .mz-byline{font-size:10px;letter-spacing:.05em;color:#888;text-transform:uppercase;margin-bottom:10px;}
 .ds-magazine p:first-of-type::first-letter{float:left;font-size:44px;line-height:38px;font-weight:800;padding:2px 8px 0 0;color:#c0392b;}`,
    chrome: (doc, rng) => `<div class="mz-kicker">${esc(rng.pick(["The Data Issue", "In Depth", "Field Notes", "Special Report", "By The Numbers"]))}</div>
 <h1>${esc(doc.docTitle || "What The Numbers Say")}</h1>
 <div class="mz-deck">${esc(doc.subtitle || (doc.intro && doc.intro[0]) || "A visual look at the quarter's shifting indicators.")}</div>
 <div class="mz-byline">By ${authors(rng, 1)} · Photographs & charts by the data desk</div>`,
  },
  financial: {
    key: "financial", columns: 1, pageBg: "#ffffff",
    css: `body.ds-financial{font-family:${SANS};}
 .ds-financial .fn-band{background:#13293d;color:#fff;padding:14px 18px;margin:-4px -4px 12px;}
 .ds-financial .fn-band h1{color:#fff;font-size:21px;margin:0;}
 .ds-financial .fn-band .fn-sub{color:#9fb3c8;font-size:11px;margin-top:3px;}
 .ds-financial h2,.ds-financial h3{color:#13293d;border-left:3px solid #c8a24a;padding-left:8px;}
 .ds-financial figcaption{font-size:9.5px;color:#556;}
 .ds-financial .fn-disc{font-size:8.5px;color:#889;border-top:1px solid #ddd;margin-top:14px;padding-top:6px;}`,
    chrome: (doc, rng) => `<div class="fn-band"><h1>${esc(doc.docTitle || "Quarterly Performance Review")}</h1><div class="fn-sub">${esc(doc.subtitle || `Investor Relations · FY${yr(rng)} · Confidential`)}</div></div>`,
  },
  slide: {
    key: "slide", columns: 1, landscape: true, pageBg: "#f7f9fb",
    css: `body.ds-slide{font-family:${SANS};}
 .ds-slide .sl-band{background:#2a4d69;color:#fff;padding:12px 20px;margin:-4px -4px 14px;display:flex;justify-content:space-between;align-items:baseline;}
 .ds-slide .sl-band h1{color:#fff;font-size:24px;margin:0;}
 .ds-slide .sl-band .sl-no{color:#bcd;font-size:12px;}
 .ds-slide figure svg{max-width:100%;}
 .ds-slide figcaption{font-size:11px;}`,
    chrome: (doc, rng) => `<div class="sl-band"><h1>${esc(doc.docTitle || "Performance Dashboard")}</h1><span class="sl-no">${rng.int(3, 24)} / ${rng.int(25, 40)}</span></div>`,
  },
};

// ---- CG_SLIDE: PowerPoint-style slide THEMES -------------------------------
// A slide theme is a docStyle archetype (chrome + css + pageBg) plus slide
// extras consumed by render.mjs: slide:true (layout gates), marginIn:0 (the
// title band and footer strip bleed to the page edge), footerChrome (deck name
// / date / slide number strip pinned to the slide bottom). Selected per doc by
// pickSlideTheme (only ever called when CG_SLIDE is on).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DECK_LABELS = ["Quarterly Business Review", "Board Update", "Operating Review", "Strategy Offsite", "Investor Day", "Monthly Metrics", "Leadership Sync"];

// Shared slide title chrome: big title band + optional subtitle. Each theme
// styles .sl-band differently (solid bar / gradient / accent block / dark).
// LLM titles occasionally arrive with inline markup (<strong>…</strong>);
// esc() would surface it as literal text on the slide, so strip tags first.
function stripTags(s) { return String(s || "").replace(/<[^>]*>/g, ""); }
function slideChrome(doc, rng) {
  const sub = doc.subtitle && rng.bool(0.7) ? `\n<div class="sl-sub">${esc(stripTags(doc.subtitle))}</div>` : "";
  return `<div class="sl-band">\n<h1>${esc(stripTags(doc.docTitle) || "Business Review")}</h1>${sub}\n</div>`;
}

// Shared slide footer strip: deck name (with a logo-ish accent mark), date,
// slide number. Render-only chrome — never part of any ground truth.
function slideFooterChrome(doc, rng) {
  const lead = stripTags(doc.docTitle).split(/:|\s[-–—]\s/)[0].trim();
  const deck = esc((lead || rng.pick(DECK_LABELS)).slice(0, 46));
  const date = `${rng.pick(MONTHS)} ${yr(rng)}`;
  const n = rng.int(2, 28);
  const no = rng.pick([`${n} / ${n + rng.int(1, 14)}`, `Slide ${n}`, `${n}`]);
  return `<div class="sl-foot"><span class="sl-deck"><span class="sl-mark"></span>${deck}</span><span>${date}</span><span class="sl-no">${no}</span></div>`;
}

// Base slide CSS: deck-sized type (body 16-24px), bold table headers, charts
// that fill the content area, and the footer strip. Theme-specific styling
// (title band, page background, dark-mode fixes) rides in via o.extra.
function slideCss(k, o) {
  return `body.ds-${k}{padding:0 !important;font-family:${SANS};font-size:${o.bodyPx}px;color:${o.text};background:${o.bg};}
 .ds-${k} .content{padding:0 56px 6px;}
 .ds-${k} p{line-height:1.4;margin:0 0 10px;text-align:left;text-indent:0;}
 .ds-${k} ul{margin:6px 0 10px 1.3em;} .ds-${k} li{margin:6px 0;}
 .ds-${k} h1{font-size:${o.h1Px}px;font-weight:700;color:${o.h1Color};margin:0;background:none;border:none;padding:0;text-align:left;letter-spacing:0;}
 .ds-${k} h2,.ds-${k} h3{font-size:20px;color:${o.headColor};margin:10px 0 6px;background:none;border:none;padding:0;}
 .ds-${k} .sl-sub{font-size:15px;margin-top:6px;color:${o.subColor};font-weight:400;}
 .ds-${k} table.gen{width:100%;font-size:15.5px;line-height:1.5;margin:12px 0;border:none;box-shadow:none;}
 .ds-${k} table.gen th{background:${o.thBg};color:${o.thColor};font-weight:700;font-size:0.92em;text-transform:uppercase;letter-spacing:0.04em;padding:9px 13px;border:none;}
 .ds-${k} table.gen td{padding:8px 13px;border:none;border-bottom:1px solid ${o.rule};}
 .ds-${k} table.gen tbody th.rh{background:transparent;color:${o.text};border:none;border-bottom:1px solid ${o.rule};padding:8px 13px;}
 .ds-${k} figure.fig{margin:10px 0;}
 .ds-${k} figure.fig svg,.ds-${k} figure.fig.fig--full svg{max-width:840px;max-height:460px;}
 .ds-${k} .figrow{gap:26px;align-items:center;}
 .ds-${k} .figrow > figure.fig{flex:0 0 46%;}
 .ds-${k} figcaption{display:none;}
 .ds-${k} .footnote{font-size:11px;color:${o.subColor};border:none;margin:8px 0 0;}
 .ds-${k} .sl-foot{display:flex;justify-content:space-between;align-items:center;gap:18px;font-size:12px;color:${o.footColor};background:${o.footBg};padding:9px 56px;${o.footRuleColor ? `border-top:2px solid ${o.footRuleColor};` : ""}}
 .ds-${k} .sl-deck{display:flex;align-items:center;gap:8px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;font-size:11px;}
 .ds-${k} .sl-mark{width:11px;height:11px;border-radius:${o.markRound ? "50%" : "2px"};background:${o.mark};display:inline-block;}
${o.extra || ""}`;
}

export const SLIDE_THEMES = {
  // classic US-corporate deck: solid navy title bar with a gold rule
  "slide-corp": {
    key: "slide-corp", columns: 1, landscape: true, slide: true, marginIn: 0, pageBg: "#ffffff",
    chrome: slideChrome, footerChrome: slideFooterChrome,
    css: slideCss("slide-corp", {
      bodyPx: 17, bg: "#ffffff", text: "#26313c", h1Px: 30, h1Color: "#ffffff", headColor: "#1f4e79",
      subColor: "#bcd2e4", thBg: "#1f4e79", thColor: "#ffffff", rule: "#d3dce5",
      footBg: "#eef2f6", footColor: "#5a6b7d", footRuleColor: "#1f4e79", mark: "#e8a33d",
      extra: ` .ds-slide-corp .sl-band{background:#1f4e79;border-bottom:6px solid #e8a33d;padding:24px 56px 16px;margin:0 -56px 16px;}
 .ds-slide-corp .footnote{color:#7b8794;}`,
    }),
  },
  // dark deck, light text; charts sit on a white card so they stay readable
  "slide-dark": {
    key: "slide-dark", columns: 1, landscape: true, slide: true, marginIn: 0, pageBg: "#161d2b",
    chrome: slideChrome, footerChrome: slideFooterChrome,
    css: slideCss("slide-dark", {
      bodyPx: 17, bg: "#161d2b", text: "#dbe4f0", h1Px: 32, h1Color: "#f2f6fc", headColor: "#cfe0f5",
      subColor: "#8fa1b8", thBg: "#33415c", thColor: "#e6ecf5", rule: "rgba(255,255,255,0.16)",
      footBg: "rgba(255,255,255,0.04)", footColor: "#8fa1b8", footRuleColor: "rgba(255,255,255,0.14)", mark: "#38bdf8", markRound: true,
      extra: ` .ds-slide-dark .sl-band{padding:26px 56px 8px;margin:0 -56px 10px;}
 .ds-slide-dark .sl-band::after{content:"";display:block;width:88px;height:5px;background:#38bdf8;margin-top:12px;border-radius:2px;}
 .ds-slide-dark figure.fig{background:#ffffff;border-radius:10px;padding:14px 16px 8px;}
 .ds-slide-dark table.gen tbody tr:nth-child(even) td:not(.sec):not(.c-good):not(.c-warn):not(.c-bad){background:rgba(255,255,255,0.05);}
 .ds-slide-dark table.gen td.c-neg{color:#f8867e;}
 .ds-slide-dark table.gen td.c-good{background:rgba(74,222,128,0.15);}
 .ds-slide-dark table.gen td.c-warn{background:rgba(250,204,21,0.15);}
 .ds-slide-dark table.gen td.c-bad{background:rgba(248,113,113,0.18);}
 .ds-slide-dark table.gen tbody tr.total td{border-top-color:rgba(255,255,255,0.4);}
 .ds-slide-dark .callout{background:rgba(56,189,248,0.12);border-left-color:#38bdf8;color:#dbe4f0;}`,
    }),
  },
  // minimal white deck: big black title under a thick accent block
  "slide-minimal": {
    key: "slide-minimal", columns: 1, landscape: true, slide: true, marginIn: 0, pageBg: "#ffffff",
    chrome: slideChrome, footerChrome: slideFooterChrome,
    css: slideCss("slide-minimal", {
      bodyPx: 18, bg: "#ffffff", text: "#1c2126", h1Px: 34, h1Color: "#101418", headColor: "#101418",
      subColor: "#6b7480", thBg: "transparent", thColor: "#101418", rule: "#e3e6ea",
      footBg: "#ffffff", footColor: "#8a929c", footRuleColor: "#101418", mark: "#d1495b",
      extra: ` .ds-slide-minimal .sl-band{padding:30px 56px 8px;margin:0 -56px 8px;}
 .ds-slide-minimal .sl-band::before{content:"";display:block;width:70px;height:12px;background:#d1495b;margin-bottom:14px;}
 .ds-slide-minimal h1{font-weight:800;}
 .ds-slide-minimal table.gen th{border-bottom:3px solid #101418;}`,
    }),
  },
  // gradient header band over a near-white page
  "slide-gradient": {
    key: "slide-gradient", columns: 1, landscape: true, slide: true, marginIn: 0, pageBg: "#fafbfe",
    chrome: slideChrome, footerChrome: slideFooterChrome,
    css: slideCss("slide-gradient", {
      bodyPx: 17, bg: "#fafbfe", text: "#2b3140", h1Px: 30, h1Color: "#ffffff", headColor: "#5b2a86",
      subColor: "#d9e2f2", thBg: "#5b2a86", thColor: "#ffffff", rule: "#dcdfe8",
      footBg: "#ffffff", footColor: "#6a7186", footRuleColor: "#5b2a86", mark: "#31a0ab",
      extra: ` .ds-slide-gradient .sl-band{background:linear-gradient(100deg,#5b2a86 0%,#2a6f97 60%,#31a0ab 100%);padding:26px 56px 20px;margin:0 -56px 16px;}`,
    }),
  },
  // boxed content cards on a cool grey page, corner accent circle
  "slide-cards": {
    key: "slide-cards", columns: 1, landscape: true, slide: true, marginIn: 0, pageBg: "#e8edf3",
    chrome: slideChrome, footerChrome: slideFooterChrome,
    css: slideCss("slide-cards", {
      bodyPx: 17, bg: "#e8edf3", text: "#28313d", h1Px: 30, h1Color: "#12303f", headColor: "#12303f",
      subColor: "#5d6b7c", thBg: "#0e7c66", thColor: "#ffffff", rule: "#e3e8ee",
      footBg: "transparent", footColor: "#62708a", footRuleColor: "rgba(18,48,63,0.18)", mark: "#0e7c66",
      extra: ` .ds-slide-cards .sl-band{position:relative;padding:24px 56px 6px;margin:0 -56px 12px;overflow:hidden;}
 .ds-slide-cards .sl-band::after{content:"";position:absolute;top:-70px;right:-50px;width:180px;height:180px;border-radius:50%;background:rgba(14,124,102,0.14);}
 .ds-slide-cards table.gen,.ds-slide-cards figure.fig,.ds-slide-cards .figrow{background:#ffffff;border-radius:10px;box-shadow:0 2px 12px rgba(30,45,70,0.10);padding:12px 14px;}
 .ds-slide-cards .figrow > figure.fig,.ds-slide-cards .figrow > table.gen{background:transparent;box-shadow:none;padding:0;border-radius:0;margin:0;}`,
    }),
  },
};

// pick a slide theme, honoring CG_SLIDE_THEME (<key>|csv) for pinned runs.
export function pickSlideTheme(rng) {
  const env = (process.env.CG_SLIDE_THEME || "").trim();
  if (env) {
    const allow = env.split(",").map((s) => s.trim()).filter((k) => SLIDE_THEMES[k]);
    if (allow.length) { return SLIDE_THEMES[rng.pick(allow)]; }
  }
  return SLIDE_THEMES[rng.pick(Object.keys(SLIDE_THEMES))];
}

const MAG_TINTS = ["#fdf2ee", "#eef4f8", "#f3f0f8", "#fbf6ea", "#eef6f0"];

// pick an archetype, biased by content domain, honoring CG_DOCSTYLE (all|mix|<key>|csv).
export function pickDocStyle(rng, domain) {
  const env = (process.env.CG_DOCSTYLE || "mix").trim();
  const keys = Object.keys(DOCSTYLES);
  if (env !== "mix" && env !== "all" && env !== "1") {
    const allow = env.split(",").map((s) => s.trim()).filter((k) => DOCSTYLES[k]);
    if (allow.length) { return finalize(DOCSTYLES[rng.pick(allow)], rng); }
  }
  // domain bias
  const d = String(domain || "");
  let weighted;
  if (/scientific|patent|lab|research/.test(d)) { weighted = [["arxiv", 5], ["journal", 4], ["textbook", 2], ["whitepaper", 0]]; }
  else if (/financial|balance|earnings|bank|portfolio|trial|ledger|budget|tax|invoice/.test(d)) { weighted = [["financial", 5], ["slide", 2], ["magazine", 1]]; }
  else if (/report|statistics|survey|census|comparison/.test(d)) { weighted = [["magazine", 3], ["financial", 2], ["slide", 2], ["journal", 1]]; }
  else { weighted = [["magazine", 2], ["financial", 2], ["slide", 2], ["arxiv", 1], ["journal", 1], ["textbook", 1]]; }
  weighted = weighted.filter(([k]) => DOCSTYLES[k]);
  return finalize(DOCSTYLES[rng.weighted(weighted)], rng);
}

function finalize(ds, rng) {
  const out = { ...ds };
  if (ds.key === "magazine") { out.pageBg = rng.bool(0.6) ? rng.pick(MAG_TINTS) : "#ffffff"; }
  return out;
}

export function docStyleChrome(doc, ds, rng) {
  try { return ds && ds.chrome ? ds.chrome(doc, rng) : ""; } catch { return ""; }
}
