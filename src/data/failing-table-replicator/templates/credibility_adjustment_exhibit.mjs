// FAMILY generator (training data) modeled on a CA rate-filing "CREDIBILITY
// ADJUSTMENT" exhibit (Letter portrait, landscape Excel sheet scaled into the
// top ~60%): EXHIBIT no. top-right over a full-width rule, centered
// company/operations/LOB title block, 3-5 dense regulatory CCR paragraphs +
// 2-line credibility-formula note, boxed Loss Trend mini-table with
// free-floating N/Z/CW-Credibility lines, one very wide 15-col main quarterly
// table under three bordered group banners (the 2nd and 3rd banner texts are
// IDENTICAL — kept quirk), then a ragged "Selected" pseudo-table (left) and a
// boxed "Rolling 4-Quarter Annual Trends" mini-table (right).
// Seed-varied structure: data-row count 21-32 (years x quarters window),
// paragraph count, trend-table row count, Selected-table row count, header
// synonym pools, title wording, date range, font scale +/-10%, quirk
// probabilities (identical-value saturation on the two frequency columns,
// value spikes, zero-trend cells). All identifiers fictional.
// GT = 4 logical tables; main = 15 cols, 2-tier header (stub rowspan + 3
// banner colspans), first 3 data rows blank in cols 7-15 (gray block).
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  // ---------- identity (all fictional pools) ----------
  const company = pick([
    "PENINSULA STANDARD INSURANCE COMPANY",
    "GRANITE SELECT INSURANCE COMPANY",
    "MERIDIAN PREFERRED INSURANCE COMPANY",
    "CASCADE NATIONAL INSURANCE COMPANY",
    "HARBORLIGHT MUTUAL INSURANCE COMPANY",
    "BLUE SPRUCE INDEMNITY COMPANY",
    "SILVERGATE FIRE & MARINE INSURANCE COMPANY",
    "ALDERWOOD SPECIALTY INSURANCE COMPANY",
  ]);
  const ops = pick([
    "Dealer Operations",
    "Contractors Equipment",
    "Jewelers Block Operations",
    "Motor Truck Cargo",
    "Builders Risk Operations",
    "Warehouse Legal Liability",
    "Fine Arts & Exhibitions",
  ]);
  const lob = pick([
    "INLAND MARINE",
    "COMMERCIAL INLAND MARINE",
    "OCEAN MARINE",
    "COMMERCIAL PROPERTY",
    "BOILER AND MACHINERY",
    "EARTHQUAKE",
  ]);
  const capText = pick([
    "CREDIBILITY ADJUSTMENT",
    "CREDIBILITY ADJUSTMENT EXHIBIT",
    "DETERMINATION OF CREDIBILITY ADJUSTMENT",
    "CREDIBILITY ADJUSTMENT AND LOSS TREND",
  ]);
  const bureau = pick(["ARBIS", "NIRDA", "CALRAB", "INSTAT", "WESTRAB", "MARCS"]); // fictional advisory orgs
  const exhibitNo = 5 + Math.floor(rng() * 9);
  const pageNo = 1 + Math.floor(rng() * 4);
  const isoRef = `CF-${2006 + Math.floor(rng() * 12)}-RLA${1 + Math.floor(rng() * 4)}`;
  const cdiRef = `${11 + Math.floor(rng() * 8)}-${1000 + Math.floor(rng() * 9000)}`;

  // ---------- structural knobs ----------
  const y0 = 2009 + Math.floor(rng() * 10); // first data year
  const nYears = 6 + Math.floor(rng() * 3); // 6-8 data years
  const startQ = 1 + Math.floor(rng() * 3); // first year starts Q1-Q3
  const endQ = rng() < 0.3 ? 3 : 4; // last year sometimes ends at Q3
  const fsc = 0.9 + rng() * 0.2; // font scale +/-10%
  const F = (x) => (x * fsc).toFixed(2);

  // quirk probabilities (seed-varied)
  const pSpikeE = 0.06 + rng() * 0.14; // earned-exposure spike rows
  const pTinyPaid = 0.02 + rng() * 0.07; // near-zero paid-loss rows
  const pSpikeT = 0.04 + rng() * 0.1; // total-loss spike rows
  const pZeroTrend = 0.04 + rng() * 0.1; // literal-0.0% trend cells
  const zeroSat = rng() < 0.78; // identical-value saturation on freq cols
  const satVal = pick(["0.00", "0.000"]);
  const hasAlt = rng() < 0.8; // Alternate Pure Premium row present

  // ---------- quarterly data rows ----------
  const yEnd = y0 + nYears - 1;
  const quarters = [];
  for (let y = y0; y <= yEnd; y++)
    for (let qq = y === y0 ? startQ : 1; qq <= (y === yEnd ? endQ : 4); qq++)
      quarters.push(`${y}${qq}`);

  const q = quarters.map(() => {
    let earned = (0.3 + rng() * 1.05) * 1e9;
    if (rng() < pSpikeE) earned *= 1.9;
    const closed = 58 + Math.floor(rng() * 70);
    const reported = closed + 5 + Math.floor(rng() * 55);
    let paid = (0.7 + rng() * 3.4) * 1e6;
    if (rng() < pTinyPaid) paid = 50000 + rng() * 160000;
    let total = (0.9 + rng() * 2.2) * 1e6;
    if (rng() < pSpikeT) total *= 2.8;
    return { earned: Math.round(earned), closed, reported, paid: Math.round(paid), total: Math.round(total) };
  });

  // main-table rows: 15 logical columns each (strings; "" = blank cell)
  const mainRows = q.map((r, i) => {
    const left = [quarters[i], fmt(r.earned), String(r.closed), String(r.reported), fmt(r.paid), fmt(r.total)];
    if (i < 3) return left.concat(Array(9).fill(""));
    const w = q.slice(i - 3, i + 1);
    const s = (k) => w.reduce((a, x) => a + x[k], 0);
    const rc = s("closed");
    const freq = (cnt) => (zeroSat ? satVal : ((cnt / s("earned")) * 1e5).toFixed(2));
    return left.concat([
      fmt(s("earned")), String(rc), String(s("reported")), fmt(s("paid")), fmt(s("total")),
      freq(rc), freq(s("reported")), fmt(s("paid") / rc), fmt(s("total") / rc),
    ]);
  });

  // ---------- loss-trend satellite: yearly sums of Reported Claims ----------
  const byYear = new Map();
  quarters.forEach((qs, i) => {
    const y = qs.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(i);
  });
  const ltRows = [];
  for (const [y, idxs] of byYear) {
    const sum = idxs.reduce((a, i) => a + q[i].reported, 0);
    const label = idxs.length === 4 ? y : `${y}${quarters[idxs[0]].slice(4)}-${y}${quarters[idxs[idxs.length - 1]].slice(4)}`;
    ltRows.push([label, String(sum)]);
  }
  const N = q.reduce((a, x) => a + x.reported, 0);
  const Z = pick([10000, 15000, 20000, 25000, 30000, 40000]);
  const cred = `${(Math.sqrt(N / Z) * 100).toFixed(1)}%`;

  // ---------- annual-trends satellite + Selected pseudo-table ----------
  const ptAll = ["4 pt", "6 pt", "8 pt", "12 pt", "16 pt", "20 pt", "24 pt", "28 pt"];
  const nPts = 4 + Math.floor(rng() * 3); // 4-6 trend rows
  const ptStart = Math.floor(rng() * (ptAll.length - nPts + 1));
  const pts = ptAll.slice(ptStart, ptStart + nPts);
  const pct = (v) => `${v.toFixed(1)}%`;
  const tval = () => (rng() < pZeroTrend ? 0 : Math.round((rng() * 20 - 8.5) * 10) / 10);
  const trends = pts.map(() => [tval(), tval(), tval(), tval()]);
  const trendRows = pts.map((p, i) => [p, ...trends[i].map(pct)]);

  const selIdx = pts.length - 1 - Math.floor(rng() * 3); // one of the last 3 pts
  const selFreq = Math.max(trends[selIdx][1], 0);
  const selSev = Math.max(trends[selIdx][2], 0);
  const selPP = ((1 + selFreq / 100) * (1 + selSev / 100) - 1) * 100 + (rng() < 0.5 ? 0.06 : 0);
  const selRows = [
    ["Selected:", pts[selIdx], pick(["Complement Trend", "Complement of Credibility Trend"])],
    ["Frequency:", "Reported", pct(selFreq)],
    ["Severity:", "Paid", pct(selSev)],
    ["Pure Premium:", "", pct(selPP)],
  ];
  if (hasAlt) selRows.push(["Alternate Pure Premium :", "", "(Justify in Filing Memorandum)"]);

  // ---------- headers (synonym pools) ----------
  const expH = pick(["Earned Exposures", "Earned Exposure Units", "Earned Premium Exposures"]);
  const paidH = pick(["Paid Losses", "Paid Loss"]);
  const per100 = pick(["per 100 Exposures", "per 100 Earned Exposures"]);
  const TOT_PAID = pick([
    "Total Paid Losses &amp; DCCE including Partial Payments on Prior Calendar Years, on Closed Claims",
    "Total Paid Loss &amp; DCCE including Partial Payments made in Prior Calendar Years, on Closed Claims",
  ]);
  const g15 = [expH, "Closed Claims", "Reported Claims", `${paidH} &amp; DCCE`, TOT_PAID];
  const g3 = [
    `Closed Frequency ${per100}`,
    `Reported Frequency ${per100}`,
    "Paid Loss &amp; DCCE Severity",
    "Total Paid Loss &amp; DCCE Severity including Partial Payments on Prior Calendar Years, on Closed Claims",
  ];
  const leaves = [...g15, ...g15, ...g3]; // 14 leaf headers (duplicated verbatim across groups)
  const stubH = pick(["Calendar YYYYQ", "Calendar Year/Qtr", "Calendar YYYYQ Ending", "Accident YYYYQ"]);
  const bannerQ = pick(["Quarterly Data", "Calendar Quarter Data"]);
  const bannerR = pick(["Rolling 4-Quarter Data", "Rolling Four-Quarter Data"]); // used for BOTH right banners (kept quirk)
  const fqWord = pick(["Frequency", "Freq."]);
  const trendHead = ["", `Closed ${fqWord}`, `Reported ${fqWord}`, "Paid Severity",
    pick(["Total Paid (w/Partials) Severity", "Total Paid Severity (incl. Partials)"])];
  const trendCap = pick(["Rolling 4-Quarter Annual Trends", "Rolling Four-Quarter Annual Trends"]);

  // ---------- HTML ----------
  const widths = [40, 34, 20, 22, 28, 24, 7, 36, 20, 22, 28, 24, 7, 22, 22, 22, 24]; // 17 phys cols (2 spacers)
  const wsum = widths.reduce((a, b) => a + b, 0);
  const colTags = widths.map((w) => `<col style="width:${((w / wsum) * 100).toFixed(2)}%">`).join("");

  // gutter columns are already covered by rowspan=2 cells in the banner row
  const leafCells = leaves.map((h) => `<th class="leaf">${h}</th>`).join("");

  const bodyRows = mainRows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const cls = ci === 0 ? "stub" : ci <= 5 ? "n b" : "n" + (ri < 3 ? " g" : "");
      const gut = ci === 5 ? '<td class="gut"></td>' : ci === 10 ? `<td class="gut${ri < 3 ? " g" : ""}"></td>` : "";
      return `<td class="${cls}">${v}</td>${gut}`;
    }).join("");
    return `<tr${ri === 0 ? ' class="first"' : ""}>${cells}</tr>`;
  }).join("\n");

  const ltHtml = ltRows.map(([y, c]) =>
    `<tr><td class="lty">${y}</td><td class="ltc b">${c}</td></tr>`).join("\n");

  const trendBody = trendRows.map((r) =>
    `<tr><td class="tp">${r[0]}</td>${r.slice(1).map((v) => `<td class="tv">${v}</td>`).join("")}</tr>`).join("\n");

  const fullStd = pick(["3,000", "2,500", "1,850", "5,000"]);
  const paraPool = [
    `A credibility adjustment is necessary if the data in the three-year recorded period is less than fully credible. In the event the data is fully credible with fewer than three years of experience, only as many years as needed to be fully credible shall be used as the recorded period. If the data in the three-year recorded period has less than 25% credibility, up to three additional years shall be added to the recorded period until the data is at least 25% credible. Refer to CCR &sect;2642.6. If after six years, the data remains less than 25% credible, alternative complementary loss and DCCE may be used, provided that the alternative is the most actuarially sound method. Refer to CCR &sect;2644.23(i).`,
    `Pursuant to CCR &sect;2644.23, if the data is not 100% credible, indicate how the loss and DCCE credibility factor on Page 6, line 14 of the Rate Template was determined. Provide the credibility formula or table that was used to derive the factor.`,
    `If alternative loss and DCCE are used as pertaining to CCR &sect;2644.23(i), then the credibility-weighted projected ultimate loss and DCCE should be entered on Page 6, lines 7 and 8 of the Rate Template. Enter a factor of 1.00 for all loss and DCCE development, trend and catastrophe adjustment on lines 9 through 13, and enter 100% for credibility in line 14. Detailed data and calculations supporting the development of the credibility-weighted projected ultimate loss and DCCE should be provided within the corresponding exhibits.`,
    `The full credibility standard is ${fullStd} claims for each homeowners form and for each coverage for private passenger auto. The calculation for partial credibility is the square root of the ratio of the actual number of incurred claims in the recorded period divided by the full credibility standard. For other lines of insurance, the standard for full and partial credibility shall be calculated using the most actuarially sound method.`,
    `Where quarterly data are used in lieu of accident-year data, the rolling four-quarter aggregation shall be computed on a consistent basis for all displayed measures, and any discontinuity in the underlying exposure base shall be disclosed and supported in the accompanying Filing Memorandum.`,
  ];
  // 3-5 paragraphs: first two always, each remaining with prob 0.7 (min one)
  const paraSel = [paraPool[0], paraPool[1]];
  const opt = [paraPool[2], paraPool[3], paraPool[4]].filter(() => rng() < 0.7);
  paraSel.push(...(opt.length ? opt : [paraPool[3]]));
  const paras = paraSel.map((p) => `<p>${p}</p>`).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 8.5in 11in; margin: 0; }
  body { margin: 0; width: 8.5in; height: 10.95in; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .content { padding: 0.72in 0.62in 0; }
  .b { color: #2244aa; }
  .exh { text-align: right; font-size: ${F(5.6)}pt; font-weight: bold; padding-right: 0.35in; }
  .exh .pg { font-weight: normal; font-size: ${F(4.2)}pt; }
  .rule { border-top: 0.7pt solid #000; margin: 1.5pt 0 3pt; }
  .co { text-align: center; font-weight: bold; font-size: ${F(6.4)}pt; }
  .ops { text-align: center; font-weight: bold; font-size: ${F(5.4)}pt; margin-bottom: 9pt; }
  .lob { text-align: center; font-weight: bold; font-size: ${F(4.8)}pt; line-height: 1.4; }
  .cap { text-align: center; font-weight: bold; font-size: ${F(4.8)}pt; margin: 8pt 0 6pt; }
  p { font-size: ${F(4)}pt; line-height: 1.3; margin: 0 0 6.5pt; }
  .formula { font-size: ${F(4)}pt; line-height: 1.35; margin: 2pt 0 10pt; }
  .lth { font-size: ${F(5)}pt; font-weight: bold; text-decoration: underline; margin-bottom: 4pt; }
  .ltbox { border: 0.6pt solid #000; width: 1.18in; font-size: ${F(4.2)}pt; padding: 2pt 3pt 2.5pt; margin-bottom: 9pt; }
  .ltbox table { border-collapse: collapse; width: 100%; }
  .ltbox .hd td { font-weight: normal; border-bottom: 0.5pt solid #000; padding-bottom: 0.5pt; }
  .lty { text-align: right; padding-right: 4pt; width: 55%; }
  .ltc { text-align: right; padding-right: 2pt; }
  .kv { margin-top: 5pt; line-height: 1.55; }
  .kv span { display: inline-block; width: 0.52in; }
  table.main { border-collapse: collapse; table-layout: fixed; width: 100%; }
  .main th.banner { border: 0.6pt solid #000; font-size: ${F(4.3)}pt; font-weight: bold; padding: 1pt 0; text-align: center; }
  .main th.leaf { font-size: ${F(4)}pt; font-weight: bold; line-height: 1.15; vertical-align: middle; text-align: center; padding: 2pt 0.5pt 2.5pt; }
  .main td { font-size: ${F(3.6)}pt; line-height: 1.02; padding: 0.1pt 1.5pt 0.1pt 0; }
  .main td.n { text-align: right; }
  .main td.stub { text-align: center; font-weight: bold; }
  .main td.g { background: #d9d9d9; }
  .main tr.first td { padding-top: 2.5pt; }
  .bottom { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10pt; }
  table.sel { border-collapse: collapse; font-size: ${F(4.2)}pt; }
  .sel td { padding: 1pt 3pt 1pt 0; vertical-align: bottom; }
  .sel td.l { padding-right: 6pt; }
  .sel td.box { border: 0.6pt solid #000; text-align: center; padding: 1pt 4pt; }
  .sel tr.alt td { padding-top: 5pt; }
  .tbox { border: 0.6pt solid #000; width: 2.55in; }
  .tbox .cap2 { font-size: ${F(4.2)}pt; padding: 1pt 2pt; border-bottom: 0.6pt solid #000; }
  .tbox table { border-collapse: collapse; width: 100%; font-size: ${F(4)}pt; }
  .tbox th { font-weight: bold; text-align: center; line-height: 1.15; padding: 1.5pt 1pt; vertical-align: bottom; }
  .tbox td.tp { text-align: right; padding: 0.4pt 4pt 0.4pt 0; }
  .tbox td.tv { text-align: right; padding: 0.4pt 5pt 0.4pt 0; }
  </style></head><body><div class="content">
  <div class="exh">EXHIBIT&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${exhibitNo}<br><span class="pg">Page ${pageNo}</span></div>
  <div class="rule"></div>
  <div class="co">${company}</div>
  <div class="ops">${ops}</div>
  <div class="lob">${lob}<br>CALIFORNIA</div>
  <div class="cap">${capText}</div>
  ${paras}
  <div class="formula">The Credibility formula used is [ (N) / (Z) ] ^ 1/2<br>where Z is based on the full Credibility Claims Standard for Property from ${bureau} reference ${isoRef} (CDI #${cdiRef}).</div>
  <div class="lth">Loss Trend</div>
  <div class="ltbox">
    <table><tr class="hd"><td class="lty">Year</td><td class="ltc">Reported Claims</td></tr>
    ${ltHtml}</table>
    <div class="kv"><span>N =</span>${N}<br><span>Z =</span>${Z}<br><span>CW Credibility</span>${cred}</div>
  </div>
  <table class="main"><colgroup>${colTags}</colgroup>
  <tr><th class="leaf" rowspan="2" style="vertical-align:middle">${stubH}</th>
      <th class="banner" colspan="5">${bannerQ}</th><td rowspan="2" class="gut"></td>
      <th class="banner" colspan="5">${bannerR}</th><td rowspan="2" class="gut"></td>
      <th class="banner" colspan="4">${bannerR}</th></tr>
  <tr>${leafCells}</tr>
  ${bodyRows}
  </table>
  <div class="bottom">
    <table class="sel">
      <tr><td class="l">${selRows[0][0]}</td><td class="box b"><b>${selRows[0][1]}</b></td><td class="box">${selRows[0][2]}</td></tr>
      <tr><td class="l">${selRows[1][0]}</td><td class="b"><b>${selRows[1][1]}</b></td><td class="b" style="text-align:right"><b>${selRows[1][2]}</b></td></tr>
      <tr><td class="l">${selRows[2][0]}</td><td class="b"><b>${selRows[2][1]}</b></td><td class="b" style="text-align:right"><b>${selRows[2][2]}</b></td></tr>
      <tr><td class="l">${selRows[3][0]}</td><td></td><td style="text-align:right"><b>${selRows[3][2]}</b></td></tr>
      ${hasAlt ? `<tr class="alt"><td class="l">${selRows[4][0]}</td><td></td><td>${selRows[4][2]}</td></tr>` : ""}
    </table>
    <div class="tbox">
      <div class="cap2">${trendCap}</div>
      <table><colgroup><col style="width:16%"><col style="width:20%"><col style="width:22%"><col style="width:18%"><col style="width:24%"></colgroup>
      <tr>${trendHead.map((h) => `<th>${h}</th>`).join("")}</tr>
      ${trendBody}</table>
    </div>
  </div>
  </div></body></html>`;

  // ---------- GT: 4 logical tables ----------
  const t = (rows) => `<table>\n${rows.join("\n")}\n</table>`;
  const tr = (cells) => `  <tr>\n${cells.join("\n")}\n  </tr>`;

  const gtLT = t([
    tr(["    <th>Year</th>", "    <th>Reported Claims</th>"]),
    ...ltRows.map((r) => tr(r.map((v) => `    <td>${v}</td>`))),
  ]);

  const gtMain = t([
    tr([
      `    <th rowspan="2">${stubH}</th>`,
      `    <th colspan="5">${bannerQ}</th>`,
      `    <th colspan="5">${bannerR}</th>`,
      `    <th colspan="4">${bannerR}</th>`,
    ]),
    tr(leaves.map((h) => `    <th>${h}</th>`)),
    ...mainRows.map((r) => tr(r.map((v) => `    <td>${v}</td>`))),
  ]);

  const gtSel = t(selRows.map((r) => tr(r.map((v) => `    <td>${v}</td>`))));

  const gtTr = t([
    tr(trendHead.map((h) => `    <th>${h}</th>`)),
    ...trendRows.map((r) => tr(r.map((v) => `    <td>${v}</td>`))),
  ]);

  const gt = [gtLT, gtMain, gtSel, gtTr].join("\n\n");

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
