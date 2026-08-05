// FAMILY generator: auto-insurance "Core Tiers" rate page — N parallel 3-col
// panels side-by-side (Tier Group | Credit Tier | {coverage} Core Tier), Excel
// print on LETTER paper. Silver #C0C0C0 fill on key cols + headers, solid
// yellow result col, black ink, thick panel outline, thin inner grid,
// micro-type (~4pt) rows.
//
// TRAINING-DATA version: structurally jittered per seed —
//   * 3..5 coverage panels drawn from a pool of coverage codes
//   * 2..3 full tier groups + a partial group cut by the page break
//   * 12..33 credit tiers per group (A..Y singles + seed-chosen Z-pairs)
//   * header-label synonym pools, title/heading wording pools, font +-10%
//   * quirks seed-toggled: tail group duplicating an earlier group's mapping,
//     identical-value saturation (long same-level runs), early jump-to-5 in
//     the credit tail, optional blank spacer rows between groups (visual only)
//   * optional footer with FICTIONAL insurer / exhibit / effective date
// GT = ONE logical 3-col table, panels concatenated top-to-bottom, each panel
// contributing its header row + data rows. Cell budget: ~550-1350 per seed.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---- pools (all fictional / generic-regulatory wording) ----
  const COVERAGES = [
    { label: "BI", prefix: "B" }, { label: "PD", prefix: "P" },
    { label: "PI", prefix: "F" }, { label: "CM", prefix: "O" },
    { label: "CL", prefix: "C" }, { label: "MP", prefix: "M" },
    { label: "UM", prefix: "U" }, { label: "RR", prefix: "R" },
    { label: "TL", prefix: "T" }, { label: "UIM", prefix: "W" },
  ];
  const COL_A = [
    { h: "UW Tier<br>Group", g: "UW Tier Group" },
    { h: "Rating<br>Tier Group", g: "Rating Tier Group" },
    { h: "Tier<br>Group", g: "Tier Group" },
    { h: "UW<br>Group", g: "UW Group" },
    { h: "Rate<br>Group", g: "Rate Group" },
    { h: "Tier<br>Grp", g: "Tier Grp" },
  ];
  const COL_B = [
    { h: "Credit Tier", g: "Credit Tier" },
    { h: "Credit<br>Band", g: "Credit Band" },
    { h: "Score<br>Tier", g: "Score Tier" },
    { h: "Ins Score<br>Tier", g: "Ins Score Tier" },
    { h: "Credit<br>Level", g: "Credit Level" },
    { h: "Credit<br>Grp", g: "Credit Grp" },
  ];
  const COL_C = [
    { h: "Core Tier", g: "Core Tier" },
    { h: "Rate Tier", g: "Rate Tier" },
    { h: "Tier", g: "Tier" },
    { h: "Core Level", g: "Core Level" },
    { h: "Core Tier", g: "Core Tier" },
    { h: "Base Tier", g: "Base Tier" },
  ];
  const TITLES = ["Core Tiers", "Core Tier Matrix", "Core Tier Assignment",
    "Tier Mapping", "Rating Core Tiers", "Core Tiering"];
  const HEADINGS = ["Proposed", "Current", "Revised", "Filed", "Renewal", "Indicated"];
  const INSURERS = ["Pinehurst Mutual Ins Co", "Granite Bay Casualty",
    "Bluewater National Assurance", "Harvest Ridge Insurance",
    "Cardinal Peak P&C", "Silver Fern Underwriters",
    "Northgate Indemnity Co", "Maple Crown Assurance"];

  // ---- structural knobs ----
  const numPanels = 3 + Math.floor(rng() * 3);        // 3..5
  const numGroups = rng() < 0.5 ? 2 : 3;              // full groups (+1 partial)
  const fscale = 0.9 + rng() * 0.2;                   // font/pitch +-10%
  const spacerQuirk = rng() < 0.35;                   // blank rows between groups
  const dupQuirk = rng() < 0.75;                      // tail duplicates a group
  const dupSrc = Math.floor(rng() * numGroups);       // ...which group it copies
  const jumpP = 0.3 + rng() * 0.4;                    // early-jump-to-5 prob
  const footerOn = rng() < 0.65;
  const title = pick(TITLES);
  const heading = pick(HEADINGS);
  const colA = pick(COL_A), colB = pick(COL_B), colC = pick(COL_C);

  // panels: seed-shuffled distinct coverages
  const covs = COVERAGES.slice();
  for (let i = covs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [covs[i], covs[j]] = [covs[j], covs[i]];
  }
  const PANELS = covs.slice(0, numPanels);

  // geometry jitter
  const left = 40 + rng() * 20;                        // 40..60pt
  const top = 58 + rng() * 14;                         // 58..72pt
  const panelW = 68 + rng() * 10;                      // 68..78pt
  const gap = 16 + rng() * 14;                         // 16..30pt
  const thPt = 3.5 * fscale, tdPt = 4.2 * fscale;
  const headH = 11 * fscale;                           // pt
  const rowPx = 6.2 * fscale;                          // px (0.75pt/px)
  const rowPt = rowPx * 0.75;
  const spacerPx = 3 * fscale;

  // ---- row budget: target 550-1350 GT cells, capped by page height ----
  // cells = 3 * numPanels * (1 + dataRows)
  const targetCells = 560 + rng() * 780;               // 560..1340
  let D = Math.round(targetCells / (3 * numPanels)) - 1;
  const spacerBudget = spacerQuirk ? numGroups * spacerPx * 0.75 : 0;
  const dMaxH = Math.floor((792 - top - headH - spacerBudget - 30) / rowPt);
  D = Math.max(30, Math.min(D, dMaxH));

  // tiers per group T and partial-group length t so that numGroups*T + t = D
  let T = Math.max(12, Math.min(33, Math.round(D / (numGroups + 0.7))));
  let t = D - numGroups * T;
  t = Math.max(Math.max(3, Math.ceil(0.3 * T)), Math.min(t, T - 1));

  // credit-tier letter pool: A..Y singles, then seed-chosen Z-pairs
  const singles = "ABCDEFGHIJKLMNOPQRSTUVWXY".split("");
  const zSuffixPool = "ABCDEFGHJKLMNPRSTUV".split("");
  for (let i = zSuffixPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [zSuffixPool[i], zSuffixPool[j]] = [zSuffixPool[j], zSuffixPool[i]];
  }
  const zPairs = zSuffixPool.slice(0, 8).sort().map((c) => "Z" + c);
  const LETTERS = singles.concat(zPairs).slice(0, T);

  // one monotone credit-tier -> level(1..5) mapping; strict groups start higher
  function mapping(strict) {
    const start = strict && rng() < 0.65 ? 2 : 1;
    const topLv = strict ? 5 : rng() < 0.45 ? 4 : 5;
    const cuts = Array.from({ length: topLv - start },
      () => 2 + Math.floor(rng() * Math.max(3, T - 4)))
      .sort((a, b) => a - b);
    const lv = LETTERS.map((_, i) => {
      let l = start;
      for (const c of cuts) if (i >= c) l++;
      return Math.min(l, 5);
    });
    // quirk: an early jump to 5 near the credit tail, neighbors lower
    if (!strict && rng() < jumpP) {
      const bi = Math.max(1, T - 3 - Math.floor(rng() * Math.min(8, T - 4)));
      lv[bi] = Math.min(5, lv[bi] + 1 + (rng() < 0.35 ? 1 : 0));
    }
    return lv;
  }

  // per panel: mappings for full groups + tail (tail may duplicate a group)
  const maps = PANELS.map(() => {
    const gs = [];
    for (let g = 0; g < numGroups; g++) gs.push(mapping(g % 2 === 1));
    gs.push(dupQuirk ? gs[dupSrc] : mapping(true));
    return gs;
  });

  // materialize rows per panel: [group, letter, code]
  const panelRows = PANELS.map((p, pi) => {
    const rows = [];
    for (let g = 1; g <= numGroups + 1; g++) {
      const n = g === numGroups + 1 ? t : T;
      for (let i = 0; i < n; i++)
        rows.push([String(g), LETTERS[i], p.prefix + maps[pi][g - 1][i]]);
    }
    return rows;
  });

  // ---- HTML (letter page, N fixed-width tables in a row) ----
  const spacerTr = `<tr class="sp"><td></td><td></td><td></td></tr>`;
  const tables = PANELS.map((p, pi) => {
    const parts = [];
    let prevG = "1";
    for (const [g, tt, v] of panelRows[pi]) {
      if (spacerQuirk && g !== prevG) parts.push(spacerTr);
      prevG = g;
      parts.push(`<tr><td class="k">${g}</td><td class="k">${tt}</td><td class="y">${v}</td></tr>`);
    }
    return `<table>
<tr><th>${colA.h}</th><th>${colB.h}</th><th>${p.label}<br>${colC.h}</th></tr>
${parts.join("\n")}
</table>`;
  }).join("\n");

  const mid = Math.floor(numPanels / 2);
  const headLeft = left + mid * (panelW + gap);
  const c1 = panelW * 0.32, c2 = panelW * 0.345, c3 = panelW * 0.335;
  const yr = 2031 + Math.floor(rng() * 9);
  const mm = pick(["01", "03", "04", "06", "07", "09", "10"]);
  const exh = `Exhibit ${pick(["K", "M", "R", "T", "W", "H"])}-${1 + Math.floor(rng() * 9)}`;
  const footer = footerOn
    ? `<div class="ftr">${pick(INSURERS)} — ${exh} &nbsp;&nbsp; Eff. ${mm}/01/${yr}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 8.5in 11in; margin: 0; }
  body { margin: 0; width: 8.5in; height: 11in; position: relative;
         font-family: Arial, Helvetica, sans-serif; color: #000; }
  .lbl { position: absolute; font-weight: bold; font-size: ${(7 * fscale).toFixed(2)}pt; }
  #core { left: ${left.toFixed(1)}pt; top: ${(top - 13).toFixed(1)}pt; }
  #head { left: ${headLeft.toFixed(1)}pt; top: ${(top - 18).toFixed(1)}pt;
          width: ${panelW.toFixed(1)}pt; text-align: center; }
  .wrap { position: absolute; left: ${left.toFixed(1)}pt; top: ${top.toFixed(1)}pt; display: flex; }
  table { border-collapse: collapse; table-layout: fixed; width: ${panelW.toFixed(1)}pt;
          margin-right: ${gap.toFixed(1)}pt; border: 1.1pt solid #000; }
  col.c1 { width: ${c1.toFixed(1)}pt; } col.c2 { width: ${c2.toFixed(1)}pt; }
  col.c3 { width: ${c3.toFixed(1)}pt; }
  th, td { border: 0.5pt solid #000; text-align: center; padding: 0; }
  th { background: #c0c0c0; font-weight: bold; font-size: ${thPt.toFixed(2)}pt;
       letter-spacing: -0.06pt; line-height: 1.2; height: ${headH.toFixed(2)}pt;
       vertical-align: middle; white-space: nowrap;
       border-bottom: 0.7pt solid #000; }
  td { font-size: ${tdPt.toFixed(2)}pt; height: ${rowPx.toFixed(2)}px;
       line-height: ${rowPx.toFixed(2)}px; overflow: hidden; }
  td.k { background: #c0c0c0; }
  td.y { background: #ffff00; }
  tr.sp td { background: #fff; height: ${spacerPx.toFixed(2)}px; }
  .ftr { position: absolute; left: ${left.toFixed(1)}pt; bottom: 16pt;
         font-size: ${(5 * fscale).toFixed(2)}pt; color: #000; }
  </style></head><body>
  <div class="lbl" id="core">${title}</div>
  <div class="lbl" id="head">${heading}</div>
  <div class="wrap">
${tables.replace(/<table>/g, '<table><colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup>')}
  </div>
  ${footer}
  </body></html>`;

  // ---- GT: one logical 3-col table, panels concatenated top-to-bottom ----
  // (spacer rows are layout-only and excluded; wrapped headers join with spaces)
  const gtParts = [];
  for (let pi = 0; pi < PANELS.length; pi++) {
    gtParts.push(`  <tr>\n    <th>${colA.g}</th>\n    <th>${colB.g}</th>\n    <th>${PANELS[pi].label} ${colC.g}</th>\n  </tr>`);
    for (const [g, tt, v] of panelRows[pi])
      gtParts.push(`  <tr>\n    <td>${g}</td>\n    <td>${tt}</td>\n    <td>${v}</td>\n  </tr>`);
  }
  const gt = "<table>\n" + gtParts.join("\n") + "\n</table>";

  return { html, gt, pageOpts: { width: "8.5in", height: "11in" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
