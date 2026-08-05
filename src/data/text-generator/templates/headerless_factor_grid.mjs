// FAMILY: headerless auto rate-factor matrix (training-data generator).
// Completely headerless, borderless grid: age label column + N unnamed factor
// columns, two stacked demographic sections (each: single ages 0..maxAge plus
// 2-4 age bands), optional final "No Driver" row. Table fills the upper half
// to two-thirds of a Letter portrait page; bottom is whitespace with an
// "Effective ..." / "Rates-..." footer. GT = ONE logical table, section rows
// are full-width colspan cells, no <th> anywhere.
// Seed-varied: factor-column count (7-10), max single age (19-27), band count
// (2-4), plateau breakpoints, section-label pair, fictional company + optional
// program subtitle, footer wording/year, font scale (±10%), margins, and the
// adversarial quirks (shadow/near-duplicate columns, smooth breaking column,
// near-duplicate male section, visual spacer row, No-Driver row).
export function generate(seed) {
  const rng = mulberry32(seed);
  const rnd2 = (v) => Math.round(v * 100) / 100;
  const f2 = (v) => v.toFixed(2);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const irange = (a, b) => a + Math.floor(rng() * (b - a + 1));

  // ---- structural knobs (all seed-driven) ----
  const nf = irange(7, 10);                        // unnamed factor columns
  const maxAge = nf <= 7 ? irange(23, 27) : irange(19, 27); // single ages 0..maxAge
  const bandCount = irange(2, 4);                  // trailing age bands
  const nc = nf + 1;                               // total columns incl. label
  const hasNoDriver = rng() < 0.85;
  const hasSpacer = rng() < 0.35;                  // visual-only blank row between sections
  const fontScale = 0.9 + rng() * 0.2;             // ±10%

  // ---- fictional furniture pools (no real insurers / filings / dates) ----
  const companies = [
    "Ardenvale Indemnity Company",
    "Crestbourne National Insurance Company",
    "Pellamar Casualty Insurance Corporation",
    "Torvane Mutual Insurance Company",
    "Quillbrook Fire & Casualty Company",
    "Hollowmere Standard Insurance Company",
    "Braewick Interinsurance Exchange",
    "Sablecroft Assurance Corporation",
  ];
  const company = pick(companies);
  const subtitle = rng() < 0.6
    ? pick([
        "Private Passenger Automobile Program",
        "Personal Auto Rating Factors",
        "Voluntary Private Passenger Auto",
        "Driver Classification Factors",
        "Personal Lines Automobile",
        "Preferred Auto Program",
      ])
    : "";
  let sections = pick([
    ["Single Female", "Single Male"],
    ["Married Female", "Married Male"],
    ["Female", "Male"],
    ["Female Operators", "Male Operators"],
    ["Principal Female", "Principal Male"],
    ["Occasional Female", "Occasional Male"],
  ]);
  if (rng() < 0.3) sections = [sections[1], sections[0]];
  const ndLabel = pick(["No Driver", "No Operator"]);
  const year = 2015 + Math.floor(rng() * 7);       // 2015-2021
  const dateTok = rng() < 0.6
    ? "xx/xx"
    : `${String(irange(1, 12)).padStart(2, "0")}/${String(irange(1, 28)).padStart(2, "0")}`;
  const footLeft = `${pick(["Effective", "Effective", "New Business Effective", "Rates Effective"])} ${dateTok}/${year}`;
  const footRight = pick([
    "Rates-PROPOSED", "Rates-PROPOSED", "Rates-REVISED",
    "Rate Pages-PROPOSED", "Rates-FILED", "Rates-NEW",
  ]);

  // ---- age band labels ----
  const bStart = maxAge + 1;
  const c1 = pick([34, 39, 44]);
  const c2 = pick([54, 59, 64]);
  const c3 = pick([69, 74]);
  const bandLabels =
    bandCount === 2 ? [`${bStart}-${c2}`, `${c2 + 1}+`]
    : bandCount === 3 ? [`${bStart}-${c1}`, `${c1 + 1}-${c2}`, `${c2 + 1}+`]
    : [`${bStart}-${c1}`, `${c1 + 1}-${c2}`, `${c2 + 1}-${c3}`, `${c3 + 1}+`];
  const labels = [...Array(maxAge + 1).keys()].map(String).concat(bandLabels);
  const nEntries = labels.length;

  // ---- shared plateau segmentation for ages 10..maxAge (identical-value
  // saturation quirk: every regular column plateaus at the same seeded ages) ----
  const segs = [];
  { let a = 10;
    while (a <= maxAge) { const len = Math.min(irange(3, 6), maxAge - a + 1); segs.push([a, a + len - 1]); a += len; } }
  const bumpLast = segs.length >= 2 && rng() < 0.6;  // small bump on final plateau

  // regular column: stair-step descent with plateaus, bands rising again
  function regularCol() {
    const v = [];
    let x = 2.3 + rng() * 0.6;                       // age 0
    v[0] = x;
    for (let a = 1; a <= 3; a++) { x -= 0.02 + rng() * 0.09; v[a] = x; }
    x = 1.5 + rng() * 0.3;                           // big drop at 4
    v[4] = x;
    for (let a = 5; a <= 9; a++) { x -= (a % 2 ? 0.03 + rng() * 0.05 : 0.05 + rng() * 0.1); v[a] = x; }
    segs.forEach(([s, e], i) => {
      if (i === 0) x = 0.98 + rng() * 0.15;
      else if (bumpLast && i === segs.length - 1) x += 0.02 + rng() * 0.04;
      else x -= 0.03 + rng() * 0.05;
      for (let a = s; a <= e; a++) v[a] = x;
    });
    const incs = [0.01 + rng() * 0.04, 0.06 + rng() * 0.06, 0.15 + rng() * 0.10, 0.08 + rng() * 0.08];
    for (let b = 0; b < bandCount; b++) { x += incs[b]; v[maxAge + 1 + b] = x; }
    return v.map(rnd2);
  }
  // "smooth" column: declines a tick every single year, and its bands DECREASE
  // instead of rising — the one column that breaks the pattern
  function smoothCol() {
    const v = [];
    let x = 2.05 + rng() * 0.35;
    v[0] = x;
    for (let a = 1; a <= 9; a++) { x -= 0.02 + rng() * 0.10; v[a] = x; }
    x -= 0.25 + rng() * 0.10;                        // age 10 drop
    for (let a = 10; a <= maxAge; a++) { v[a] = x; x -= (rng() < 0.7 ? 0.01 : 0.02); }
    x -= 0.03 + rng() * 0.04;
    v[maxAge + 1] = x;                               // first band ~flat...
    for (let b = 1; b < bandCount; b++) { x -= 0.02; v[maxAge + 1 + b] = x; }
    return v.map(rnd2);
  }

  const fem = [];
  for (let i = 0; i < nf; i++) fem[i] = regularCol();
  const smoothIdx = rng() < 0.9 ? irange(Math.max(1, nf - 4), nf - 1) : -1;
  if (smoothIdx >= 0) fem[smoothIdx] = smoothCol();

  // shadow-column quirk: 1-2 columns are near-copies of a neighbor (identical
  // except tiny diffs at a few young ages) — the indistinguishable-columns trap
  const shadowTargets = new Set();
  const nShadow = (rng() < 0.9 ? 1 : 0) + (nf >= 8 && rng() < 0.55 ? 1 : 0);
  for (let k = 0; k < nShadow; k++) {
    let t = irange(2, nf - 1), tries = 0;
    while ((t === smoothIdx || shadowTargets.has(t)) && tries++ < 10) t = irange(2, nf - 1);
    if (t === smoothIdx || shadowTargets.has(t)) continue;
    let s = t - irange(1, 2);
    if (s === smoothIdx) s -= 1;
    if (s < 0 || shadowTargets.has(s)) continue;
    shadowTargets.add(t).add(s);
    fem[t] = rng() < 0.5
      ? fem[s].map((v, i) => (i >= 2 && i <= 9 ? rnd2(v + 0.01 + rng() * 0.04) : v))
      : fem[s].map((v, i) => (i >= 4 && i <= 7 ? rnd2(v - (rng() < 0.5 ? 0.02 : 0.04)) : v));
  }

  // second section = first + small per-column constant offset (near-duplicate
  // sections quirk); occasional extra tick on the band rows
  const male = fem.map((col) => {
    const off = rnd2(-0.12 + rng() * 0.18);
    return col.map((v, i) => rnd2(v + off + (i > maxAge && rng() < 0.3 ? -0.01 : 0)));
  });
  const noDriver = fem.map(() => rnd2(0.88 + rng() * 0.12));

  // ---- rows (single source of truth for HTML and GT so values byte-match) ----
  const rows = []; // { label, vals } | { section } | { spacer }
  rows.push({ section: sections[0] });
  labels.forEach((lb, i) => rows.push({ label: lb, vals: fem.map((c) => f2(c[i])) }));
  if (hasSpacer) rows.push({ spacer: true });
  rows.push({ section: sections[1] });
  labels.forEach((lb, i) => rows.push({ label: lb, vals: male.map((c) => f2(c[i])) }));
  if (hasNoDriver) rows.push({ label: ndLabel, vals: noDriver.map(f2) });

  let body = "";
  for (const r of rows) {
    body += r.spacer
      ? `<tr><td colspan="${nc}">&nbsp;</td></tr>\n`
      : r.section
      ? `<tr><td class="lbl sec" colspan="${nc}">${r.section}</td></tr>\n`
      : `<tr><td class="lbl">${r.label}</td>${r.vals.map((v) => `<td class="num">${v}</td>`).join("")}</tr>\n`;
  }

  // ---- layout (seed-jittered, overflow-safe) ----
  const fs = rnd2(6.8 * fontScale);
  const fsSmall = rnd2(7 * fontScale);
  const rowH = (0.115 * fontScale).toFixed(3);
  const compTop = rnd2(0.45 + rng() * 0.15);
  const top = rnd2(compTop + 0.4 + rng() * 0.15);
  const left = rnd2(0.6 + rng() * 0.25);
  const lblW = rnd2(0.68 + rng() * 0.14);
  const numW = Math.min(0.72, rnd2((8.5 - left - 0.35 - lblW) / nf));
  const footBottom = rnd2(0.18 + rng() * 0.12);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; width: 8.5in; height: 10.95in; position: relative;
         font-family: Arial, Helvetica, sans-serif; color: #000; }
  .company { position: absolute; top: ${compTop}in; left: ${rnd2(left + 0.06)}in; font-size: ${fsSmall}pt; }
  table { border-collapse: collapse; position: absolute; top: ${top}in; left: ${left}in; }
  td { font-size: ${fs}pt; height: ${rowH}in; padding: 0; text-align: center;
       vertical-align: middle; }
  td.lbl { width: ${lblW}in; }
  td.num { width: ${numW}in; }
  td.sec { text-align: left; padding-left: 0.08in; }
  .footer { position: absolute; left: ${rnd2(left + 0.06)}in; right: 0.72in; bottom: ${footBottom}in;
            font-size: ${fsSmall}pt; display: flex; justify-content: space-between; }
  </style></head><body>
  <div class="company">${company}${subtitle ? `<br>${subtitle}` : ""}</div>
  <table>
${body}</table>
  <div class="footer"><span>${footLeft}</span><span>${footRight}</span></div>
  </body></html>`;

  const gt = "<table>\n"
    + rows.filter((r) => !r.spacer).map((r) => r.section
        ? `  <tr>\n    <td colspan="${nc}">${r.section}</td>\n  </tr>`
        : `  <tr>\n    <td>${r.label}</td>\n${r.vals.map((v) => `    <td>${v}</td>`).join("\n")}\n  </tr>`
      ).join("\n")
    + "\n</table>";

  return { html, gt, pageOpts: { format: "Letter" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
