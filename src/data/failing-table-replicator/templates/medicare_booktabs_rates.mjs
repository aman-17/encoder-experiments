// FAMILY generator (training data) — Medicare Supplement gross-annual-premium
// rate page in the "booktabs" SERFF style: centered title stack, one narrow
// no-vertical-rules table (Attained-Age stub rowspan-2, 2-3 colspan-2 rating
// groups, short rules under the group labels, full rule + heavier second rule
// under tier-2), footnote sentences, left area-factor block, stray footer tokens.
// Seed-varied structure: end age (86-99 => 22-35 age rows), under-65 treatment
// (single NA band vs explicit 60-64 rate rows), 2 vs 3 rating groups (5 vs 7
// cols), sex order, label/title/plan/state/company pools, font scale +-10%,
// quirk probabilities (identical-value column saturation, NA vs N/A, CURRENT/
// REVISED RATES line, footer tokens, area-block style incl. "Area Facto" typo).
// Decontaminated: fictional insurer pools only; no Texas/TX (state pool with
// plausible ZIP-prefix ranges); shifted years 2021-2026.
// GT = main table + small 2-col area-factor table; ~130-310 cells across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pick = (a) => a[Math.floor(rng() * a.length)];

  // ---- structural knobs -----------------------------------------------------
  // mulberry32's first draws are biased for small seeds, so alternate the page
  // style by parity to guarantee both real looks appear across seeds
  const styleB = seed % 2 === 0;            // false = "page434" look, true = "page964" look
  const numGroups = rng() < 0.3 ? 3 : 2;    // 2 rating classes (5 cols) or 3 (7 cols)
  const nRate = numGroups * 2;
  const sexes = rng() < 0.5 ? ["Female", "Male"] : ["Male", "Female"];
  const pairPool = [
    ["Preferred", "Standard"],
    ["Non-Tobacco", "Tobacco"],
    ["Select", "Standard"],
    ["Non-Smoker", "Smoker"],
    ["Preferred", "Substandard"],
  ];
  const triplePool = [
    ["Preferred", "Standard", "Substandard"],
    ["Non-Tobacco", "Tobacco", "Rated"],
    ["Select", "Standard", "Rated"],
  ];
  const groups = numGroups === 3 ? pick(triplePool) : pick(pairPool);
  const endAge = 86 + Math.floor(rng() * 14); // 86-99 => 22-35 attained-age rows
  const underMode = rng() < 0.55 ? 0 : rng() < 0.55 ? 1 : 2; // 0="0-64" NA, 1="Under 65" NA, 2=explicit 60-64 rows
  const stub = rng() < 0.75 ? "Attained Age" : "Age";

  // ---- quirk toggles --------------------------------------------------------
  const na = (styleB ? rng() < 0.85 : rng() < 0.15) ? "N/A" : "NA";
  const dupCols = rng() < (styleB ? 0.15 : 0.7); // identical-value quirk: group1 col2 == group2 col1
  const hasCurrent = rng() < 0.78;
  const currentLabel = pick(["CURRENT RATES", "REVISED RATES", "PROPOSED RATES"]);
  const hasEff = rng() < 0.45;
  const effYr = 2021 + Math.floor(rng() * 6);
  const effMon = pick(["January", "April", "July", "October"]);

  // ---- decontaminated pools -------------------------------------------------
  const companiesA = [
    "Cascade Union Life Assurance Company",
    "Prairie Meridian Life Assurance Company",
    "Lakeshore Fidelity Life Assurance Company",
    "Harbor Crest Life Assurance Company",
    "Silver Birch Life Assurance Company",
    "Juniper Summit Life Assurance Company",
    "Windmere Continental Life Assurance Company",
  ];
  const companiesB = [
    "GRANITE VALLEY LIFE INSURANCE COMPANY",
    "BLUE HERON LIFE INSURANCE COMPANY",
    "PIEDMONT CENTENNIAL LIFE INSURANCE COMPANY",
    "OLD DOMINION SECURITY LIFE INSURANCE COMPANY",
    "COPPER RIDGE LIFE INSURANCE COMPANY",
    "STERLING HARBOR LIFE INSURANCE COMPANY",
    "ROYAL ELM LIFE INSURANCE COMPANY",
  ];
  const company = styleB ? pick(companiesB) : pick(companiesA);
  const plan = pick([
    "2010 Standardized Plan G",
    "Standardized Plan C",
    "2010 Standardized Plan F",
    "Standardized Plan N",
    "2010 Standardized Plan A",
    "Standardized Plan B",
    "2010 Standardized High Deductible Plan F",
  ]);
  const titleWord = pick([
    "Gross Annual Premiums",
    "Gross Annual Premiums",
    "Annual Gross Premiums",
    "Gross Annual Premium Rates",
  ]);
  const states = [
    { name: "Ohio", ab: "OH", lo: 430, hi: 458 },
    { name: "Georgia", ab: "GA", lo: 300, hi: 319 },
    { name: "Colorado", ab: "CO", lo: 800, hi: 816 },
    { name: "Tennessee", ab: "TN", lo: 370, hi: 385 },
    { name: "Missouri", ab: "MO", lo: 630, hi: 658 },
    { name: "Alabama", ab: "AL", lo: 350, hi: 369 },
    { name: "Virginia", ab: "VA", lo: 220, hi: 246 },
    { name: "Kansas", ab: "KS", lo: 660, hi: 679 },
  ];
  const st = pick(states);

  // ---- rate matrix ----------------------------------------------------------
  // per-group loading G, second-sex loading m; dup variant makes column 2 and
  // column 3 byte-identical (the eval family's saturation quirk)
  const m = 1.13 + rng() * 0.04;
  const c = 1.08 + rng() * 0.05;
  const d = c * (1.05 + rng() * 0.05);
  const G = numGroups === 3 ? [1, c, d] : [1, c];
  const load = [];
  for (let g = 0; g < numGroups; g++) for (let s = 0; s < 2; s++)
    load.push(G[g] * (s === 1 ? m : 1));
  if (dupCols) load[2] = load[1];
  let v = 1450 + rng() * 1900;              // base premium at attained age 65
  const g0 = 0.034 + rng() * 0.012;         // early-age growth
  const g1 = 0.005 + rng() * 0.012;         // late-age growth
  const rows = [];
  if (underMode === 2) {
    rows.push(["0-59", ...Array(nRate).fill(na)]);
    for (let age = 60; age <= 64; age++) {
      const uv = v * Math.pow(0.955 + rng() * 0.01, 65 - age);
      rows.push([String(age), ...load.map((x) => fmt(Math.round(uv * x)))]);
    }
  } else {
    rows.push([underMode === 1 ? "Under 65" : "0-64", ...Array(nRate).fill(na)]);
  }
  for (let age = 65; age <= endAge; age++) {
    if (age >= 68) {
      const t = (age - 68) / Math.max(1, endAge - 68);
      v *= 1 + g0 + (g1 - g0) * t;
    }
    rows.push([String(age), ...load.map((x) => fmt(Math.round(v * x)))]);
  }

  // ---- footnotes ------------------------------------------------------------
  const fee = pick([20, 25, 30, 35, 40]);
  const disc = pick([".90", ".92", ".93", ".95"]);
  const notes = [
    pick(["There is no modal loading.", "Modal loading does not apply.",
      "Premiums shown do not include modal loading."]),
    pick([`The rates above do not include a one time $${fee} policy fee.`,
      `Rates shown exclude the one-time $${fee} policy fee.`]),
  ];
  if (rng() < (styleB ? 0.3 : 0.85))
    notes.push(`A discount factor of ${disc} is applied for household discount applicants.`);

  // ---- area factor block ----------------------------------------------------
  const zips = [];
  for (let p = st.lo; p <= st.hi; p++) zips.push(String(p));
  const runA = st.lo + Math.floor(rng() * Math.max(1, st.hi - st.lo - 8));
  let areaHtml, areaGtRows;
  if (!styleB) {
    // "page434" style: typo heading ("Area Facto"), plain right-aligned factors
    const r1k = pick([`${runA}-${runA + 3}, ${runA + 5}`, `${runA}-${runA + 2}, ${runA + 4}`,
      `${runA}, ${runA + 2}-${runA + 5}`]);
    const chosen = zips.filter(() => rng() < 0.45).slice(0, 8 + Math.floor(rng() * 3));
    const r2k = (chosen.length >= 6 ? chosen : zips.slice(0, 8)).join(", ");
    const extra = rng() < 0.35;
    const lo = 0.85 + rng() * 0.05;
    const mid = lo + 0.05 + rng() * 0.05;
    const mid2 = mid + 0.03 + rng() * 0.04;
    const hi = 1.03 + rng() * 0.2;
    const keyed = [[r1k, hi.toFixed(2)], [r2k, mid.toFixed(2)]];
    if (extra) {
      const r3k = zips.filter(() => rng() < 0.3).slice(0, 4).join(", ") || zips.slice(-4).join(", ");
      keyed.splice(1, 0, [r3k, mid2.toFixed(2)]);
    }
    areaGtRows = [[`Area Facto ${st.name}`, ""], ...keyed, ["Rest of State", lo.toFixed(2)]];
    areaHtml = `<div class="area">
      <div class="ahead">Area Facto ${st.name}</div>
      ${keyed.map(([k, f]) => `<div class="arow"><span class="k">${k}</span><span class="v">${f}</span></div>`).join("\n      ")}
      <div class="arow"><span class="k">Rest of State</span><span class="v">${lo.toFixed(2)}</span></div>
    </div>`;
  } else {
    // "page964" style: "Area Factors:" + underlined state, dot leaders, wrapped key
    const k1a = `${runA}-${runA + 3}, ${runA + 5}-${runA + 6}`;
    const k1b = pick([`${st.lo + 2}, ${st.lo + 4}-${st.lo + 5}`, `${st.lo}-${st.lo + 1}, ${st.lo + 6}`,
      `${st.lo + 1}, ${st.lo + 3}-${st.lo + 6}`]);
    const k2 = pick([`${st.hi - 6}-${st.hi - 3}, ${st.hi - 1}`, `${st.hi - 5}-${st.hi - 2}`,
      `${st.hi - 7}-${st.hi - 4}, ${st.hi}`]);
    const hi = (1.15 + rng() * 0.15).toFixed(2);
    const mid = (1.05 + rng() * 0.08).toFixed(2);
    const lo = "1.00";
    const d1 = "…".repeat(10), d2 = "…".repeat(13), d3 = "…".repeat(14);
    areaGtRows = [["Area Factors:", ""], [st.name, ""],
      [`${k1a} ${k1b}${d1}`, hi], [`${k2}${d2}`, mid], [`Rest of State${d3}`, lo]];
    areaHtml = `<div class="area areab">
      <div class="ahead2">Area Factors:</div>
      <div class="tx">${st.name}</div>
      <div class="arow"><span class="k">${k1a}<br><span class="ind2">${k1b}${d1}</span></span><span class="v">${hi}</span></div>
      <div class="arow"><span class="k">${k2}${d2}</span><span class="v">${mid}</span></div>
      <div class="arow"><span class="k">Rest of State${d3}</span><span class="v">${lo}</span></div>
    </div>`;
  }

  // ---- title stack ----------------------------------------------------------
  const effLine = hasEff ? `<div class="tl sm">Rates Effective ${effMon} 1, ${effYr}</div>` : "";
  const titleA = `
    <div class="tl b co">${company}</div>
    <div class="tl">${titleWord}</div>
    ${hasCurrent ? `<div class="tl b">${currentLabel}</div>` : ""}
    ${effLine}
    <div class="tl tight">Medicare Supplement Policy<br>${plan}</div>`;
  const titleB = `
    ${hasCurrent ? `<div class="tl b sm">${currentLabel}</div>` : ""}
    <div class="tl">${titleWord}</div>
    <div class="tl b co">${company}</div>
    ${effLine}
    <div class="tl tight">Medicare Supplement Policy<br>${plan}</div>`;

  // ---- footer stray tokens --------------------------------------------------
  const yr = 2021 + Math.floor(rng() * 6);
  const dte = `${1 + Math.floor(rng() * 12)}/${1 + Math.floor(rng() * 28)}/${yr}`;
  const footer = rng() < (styleB ? 0.85 : 0.15)
    ? `<div class="ft l">${st.ab}</div><div class="ft r">${dte}</div>` : "";

  // ---- geometry / typography jitter ----------------------------------------
  const tall = rows.length > 36 || (numGroups === 3 && rows.length > 32);
  let fs = 0.9 + rng() * 0.2;               // font scale +-10%
  if (tall) fs = Math.min(fs, 1.0);
  const pt = (base) => (base * fs).toFixed(2) + "pt";
  const padTop = (tall ? 12 + rng() * 3 : 16 + rng() * 8).toFixed(1);
  const tlMb = tall ? 4 : 6;
  const wrapW = numGroups === 3 ? 142 : 106;

  // ---- physical table -------------------------------------------------------
  const stubHtml = stub.includes(" ") ? stub.replace(" ", "<br>") : stub;
  const body = rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("\n");
  const tier1 = `<tr class="t1"><th class="stub" rowspan="2">${stubHtml}</th>`
    + groups.map((g) => `<th class="grp" colspan="2"><div>${g}</div></th>`).join("") + "</tr>";
  const tier2 = `<tr class="t2">`
    + groups.map(() => sexes.map((s) => `<th>${s}</th>`).join("")).join("") + "</tr>";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 216mm; height: 278mm; position: relative; }
  .wrap { width: ${wrapW}mm; margin: 0 auto; padding-top: ${padTop}mm; }
  .tl { text-align: center; font-size: ${pt(10)}; margin-bottom: ${tlMb}mm; }
  .tl.b { font-weight: bold; }
  .tl.co { font-size: ${pt(10.5)}; }
  .tl.sm { font-size: ${pt(9.5)}; margin-bottom: ${tlMb - 1}mm; }
  .tl.tight { line-height: 1.3; margin-bottom: 0; }
  table { border-collapse: collapse; margin: 5mm auto 0; }
  th, td { font-weight: normal; font-size: ${pt(9.5)}; padding: 0.4pt 0;
           text-align: center; line-height: 1.05; }
  th.stub { width: 17mm; vertical-align: bottom; }
  col.n { width: 15.5mm; }
  tr.t1 th.grp div { border-bottom: 1pt solid #000; margin: 0 2.5pt; padding-bottom: 0.5pt; }
  tr.t2 th, th.stub { border-bottom: 1pt solid #000; }
  td.dbl { height: 1pt; border-bottom: 1.8pt solid #000; padding: 0; }
  .notes { margin-top: ${tall ? 4 : 6}mm; font-size: ${pt(9)}; line-height: 1.45; }
  .area { margin-top: ${tall ? 4 : 5}mm; font-size: ${pt(9)}; line-height: 1.45; }
  .ahead, .ahead2 { margin-bottom: 0; }
  .tx { margin-left: 10mm; text-decoration: underline; }
  .arow { display: flex; align-items: flex-end; }
  .areab .arow { margin-left: 8mm; }
  .arow .k { }
  .ind2 { margin-left: 3mm; }
  .arow .v { margin-left: auto; padding-left: 4mm; }
  .ft { position: absolute; bottom: 15mm; font-size: ${pt(9.5)}; }
  .ft.l { left: 19mm; } .ft.r { right: 21mm; }
  </style></head><body>
  <div class="wrap">
    ${styleB ? titleB : titleA}
    <table>
      <colgroup><col>${'<col class="n">'.repeat(nRate)}</colgroup>
      ${tier1}
      ${tier2}
      <tr><td class="dbl" colspan="${1 + nRate}"></td></tr>
${body}
    </table>
    <div class="notes">${notes.join("<br>")}</div>
    ${areaHtml}
  </div>
  ${footer}
  </body></html>`;

  // ---- logical GT -----------------------------------------------------------
  const gt1 = `<table>\n  <tr>\n    <th rowspan="2">${stub}</th>\n`
    + groups.map((g) => `    <th colspan="2">${g}</th>`).join("\n") + "\n  </tr>\n  <tr>\n"
    + groups.map(() => sexes.map((s) => `    <th>${s}</th>`).join("\n")).join("\n") + "\n  </tr>\n"
    + rows.map((r) => `  <tr>\n${r.map((x) => `    <td>${x}</td>`).join("\n")}\n  </tr>`).join("\n")
    + "\n</table>";
  const gt2 = "<table>\n"
    + areaGtRows.map(([k, val]) => `  <tr>\n    <td>${k}</td>\n    <td>${val}</td>\n  </tr>`).join("\n")
    + "\n</table>";

  return { html, gt: gt1 + "\n\n" + gt2, pageOpts: { format: "Letter" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
