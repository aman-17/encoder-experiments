// FAMILY generator: European reinsurance SFCR page — two stacked "twin"
// geographic premium tables (current year, prior year), each with a 2-tier
// header (YEAR + bold country names / repeated unit row) and 2-3 metric rows
// (GWP / optional NWP / NEP) drawn with full-width horizontal underlines and
// a double rule under the last metric row; then Dividends prose, a 3-col
// SII-to-local-GAAP reconciliation table (rule above the bold subtotal row,
// heavy double rule under the bold final row), then a red "A.3 Investment
// performance" heading with bullets.
//
// Training-data version: all structure is seed-jittered (geography count 5-8,
// metric rows 2-3, reconciliation line items 10-15, label/title/unit pools,
// font scale ±10%, nil-cell + winding-down-book quirk probabilities, home
// jurisdiction pool driving the anchor geography and "<X> GAAP" wording).
// No real company names, form-specific dates, or eval-year values remain.
// GT = three logical tables; ~92-151 cells depending on seed.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---- structural knobs (all seed-driven) ----
  const fscale = 0.9 + rng() * 0.2;          // ±10% font size
  const year = 2016 + Math.floor(rng() * 7); // 2016-2022 (source doc years avoided)
  const prior = year - 1;

  // home jurisdiction: anchors the first geography and the "<adj> GAAP" wording
  const HOME = [
    ["IRELAND", "Irish"], ["LUXEMBOURG", "Luxembourg"], ["MALTA", "Maltese"],
    ["BELGIUM", "Belgian"], ["NETHERLANDS", "Dutch"], ["FINLAND", "Finnish"],
    ["AUSTRIA", "Austrian"],
  ];
  const [homeCountry, homeAdj] = pick(HOME);

  const geoPool = ["FRANCE", "UK", "GERMANY", "DUBAI", "SWITZERLAND", "SINGAPORE",
    "ITALY", "SPAIN", "BERMUDA", "NETHERLANDS", "PORTUGAL", "POLAND", "CANADA", "JAPAN"]
    .filter((c) => c !== homeCountry);
  const nPicked = 4 + Math.floor(rng() * 4); // 4-7 → 5-8 geographies
  const picked = [];
  while (picked.length < nPicked) {
    const c = geoPool[Math.floor(rng() * geoPool.length)];
    if (!picked.includes(c)) picked.push(c);
  }
  const countries = [homeCountry, ...picked];
  const nGeo = countries.length;
  const nCols = nGeo + 2;                    // label col + countries + TOTAL
  const wide = nGeo >= 7;
  const mag = wide ? 0.5 : 1;                // keep wide tables within column width

  const hasNwp = rng() < 0.35;               // optional third metric row
  const metricRows = hasNwp ? 3 : 2;

  // quirk: nil (em-dash) books, probability-driven, back-half geographies;
  // the current-year nil country runs a small winding-down book in the prior year
  const nilPickIdx = () => nGeo - 3 + Math.floor(rng() * 3);
  const nilCur = rng() < 0.8 ? nilPickIdx() : -1;
  let nilPrior = rng() < 0.75 ? nilPickIdx() : -1;
  if (nilPrior !== -1 && nilPrior === nilCur) nilPrior = nGeo - 3 + ((nilPrior - (nGeo - 3) + 1) % 3);

  const fmtN = (n) => n < 0 ? `(${Math.abs(n).toLocaleString("en-US")})` : n.toLocaleString("en-US");
  const DASH = "—";

  // ---- per-country GWP/(NWP)/NEP for both years ----
  const mkYear = (nilIdx, exitIdx) => {
    const gwp = [], nwp = [], nep = [];
    for (let i = 0; i < nGeo; i++) {
      if (i === nilIdx) { gwp.push(null); nwp.push(null); nep.push(null); continue; }
      let g;
      if (i === exitIdx) g = Math.round((4000 + rng() * 12000) * mag);       // winding-down book
      else if (i < 2) g = Math.round((90000 + rng() * 120000) * mag);
      else g = Math.round((25000 + rng() * (rng() < 0.35 ? 560000 : 190000)) * mag);
      gwp.push(g);
      nwp.push(Math.floor(g * (0.6 + rng() * 0.25)));
      nep.push(Math.floor(g * (0.24 + rng() * 0.2)));
    }
    const sum = (a) => a.reduce((x, y) => x + (y ?? 0), 0);
    return { gwp, nwp, nep, tg: sum(gwp), tw: sum(nwp), tn: sum(nep) };
  };
  const cur = mkYear(nilCur, -1);
  const pri = mkYear(nilPrior, nilCur);

  // ---- reconciliation line-item structure (varies per seed) ----
  // 0-5 extra line items beyond the 10-row core; the seed offset keeps
  // neighbouring seeds structurally distinct (rec row count = 10 + nExtra)
  const nExtra = (Math.floor(rng() * 6) + seed) % 6;
  const cand = [["gwp", 2], ["oti", 1], ["split", 1], ["real", 1], ["fx", 1]];
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const on = new Set();
  let left = nExtra;
  for (const [k, cost] of cand) if (cost <= left) { on.add(k); left -= cost; }
  const includeGwpRows = on.has("gwp");
  const includeOti = on.has("oti");
  const splitExp = on.has("split");   // expenses shown as two lines instead of one
  const includeRealised = on.has("real");
  const includeFx = on.has("fx");

  const labelStyle = Math.floor(rng() * 2);
  const L = labelStyle === 0 ? {
    gwp: "Gross written premiums", rsp: "Reinsurers’ share of premiums",
    gep: "Gross earned premiums", rsep: "Reinsurers’ share of earned premiums",
    gci: "Gross claims incurred", rsci: "Reinsurers’ share of claims incurred",
  } : {
    gwp: "Gross premiums written", rsp: "Reinsurers’ share of premiums written",
    gep: "Gross premiums earned", rsep: "Reinsurers’ share of premiums earned",
    gci: "Claims incurred, gross", rsci: "Claims incurred, reinsurers’ share",
  };
  const subLabel = pick(["Per QRT Form S.05", "Per QRT S.05.01", "Per Form S.05.01", "Technical result per QRT S.05"]);
  const otherLabel = pick(["Income/(expense) from other activities", "Other income/(expense)", "Net other income/(expense)"]);
  const finLabel = pick([`Pre-tax ${homeAdj} GAAP profit`, `${homeAdj} GAAP profit before tax`, `Profit before tax (${homeAdj} GAAP)`]);
  const recHeadLabel = pick(["Year ended 31 December", "Financial year ended 31 December", "Year to 31 December", "12 months ended 31 December"]);

  // arithmetic-consistent figures, tied to the twin-table totals like the real family
  const mkRec = (twinGwpTotal) => {
    const gwp = twinGwpTotal + 3000 + Math.floor(rng() * 18000);
    const rsp = Math.floor(gwp * (0.32 + rng() * 0.28));
    const gep = Math.floor(gwp * (0.78 + rng() * 0.13));
    const rsep = Math.floor(gep * (0.55 + rng() * 0.14));
    const oti = 1500 + Math.floor(rng() * 9000);
    const gci = Math.floor(gep * (0.6 + rng() * 0.12));
    const rsci = Math.floor(gci * (0.55 + rng() * 0.12));
    const nexp = Math.floor(gep * (0.08 + rng() * 0.04));
    const opex = nexp + Math.floor(gep * (0.02 + rng() * 0.03));
    const comm = opex - nexp;
    const perQrt = gep - rsep + (includeOti ? oti : 0) - (gci - rsci) - nexp;
    const inv = Math.floor((30000 + rng() * 42000) * mag);
    const realised = Math.floor((-18000 + rng() * 40000) * mag);
    const unreal = Math.floor((-30000 + rng() * 92000) * mag);
    const fx = Math.floor((-12000 + rng() * 26000) * mag);
    const other = Math.floor((-58000 + rng() * 66000) * mag);
    const pretax = perQrt + inv + (includeRealised ? realised : 0) + unreal + (includeFx ? fx : 0) + other;
    const rows = [];
    if (includeGwpRows) { rows.push([L.gwp, gwp], [L.rsp, rsp]); }
    rows.push([L.gep, gep], [L.rsep, rsep]);
    if (includeOti) rows.push(["Other technical income", oti]);
    rows.push([L.gci, gci], [L.rsci, rsci]);
    if (splitExp) rows.push(["Gross operating expenses", opex], ["Commissions and profit participation received", -comm]);
    else rows.push(["Net expenses incurred", nexp]);
    rows.push([subLabel, perQrt], ["Investment income", inv]);
    if (includeRealised) rows.push(["Realised gains/(losses) on investments", realised]);
    rows.push(["Unrealised gain/(loss) on investments", unreal]);
    if (includeFx) rows.push(["Foreign exchange gains/(losses)", fx]);
    rows.push([otherLabel, other], [finLabel, pretax]);
    return rows;
  };
  const recCur = mkRec(cur.tg);
  const recPri = mkRec(pri.tg);
  const recRows = recCur.length;                       // 10-15 data rows
  const subIdx = recCur.findIndex((r) => r[0] === subLabel);

  // ---- label/unit/title pools ----
  const geoUnit = pick(["€'000", "€000", "€ '000"]);
  const recUnit = pick(["€000's", "€'000", "€000"]);
  const divHead = pick(["Dividends", "Dividend", "Dividends and distributions"]);
  const divSentence = pick([
    `The directors do not recommend the payment of a final dividend (${prior}: €0m).`,
    `No dividend was declared or paid during the year (${prior}: €nil).`,
    `The directors have not proposed a final dividend in respect of ${year} (${prior}: €nil).`,
  ]);
  const recHead = `Reconciliation of ${pick(["SII information", "Solvency II information", "SII figures"])} to ${homeAdj} GAAP`;
  const recIntro = pick([
    `Below is a reconciliation of the SII information reported in QRT S.05.01. to pre-tax ${homeAdj} GAAP profit:`,
    `The table below reconciles the SII figures reported in QRT S.05.01 to the pre-tax ${homeAdj} GAAP result:`,
    `A reconciliation of the technical account reported in QRT S.05.01 to ${homeAdj} GAAP pre-tax profit is set out below:`,
  ]);
  const a3title = pick(["Investment performance", "Investment Performance"]);
  const invIntro = pick([
    "The primary objective of the Company's investment strategy is to maximize the risk adjusted return on economic capital employed subject to a variety of constraints including:",
    "The Company's investment strategy seeks to maximise the risk adjusted return on the economic capital employed, subject to a number of constraints including:",
  ]);
  const pageNo = 12 + Math.floor(rng() * 18);

  // ---- vertical budget: squeeze spacing when the seed drew a tall structure ----
  const load = 2 * metricRows + recRows + (fscale - 1) * 30;
  const wantBullet4 = rng() < 0.35 && load < 19;
  const compact = load >= 17;
  const ultra = load >= 20;

  const bulletItems = [
    "Maintaining adequate regulatory and rating agency capitalisation",
    "Maintaining sufficient liquidity to ensure payment of claims, operating expenses and other obligations even during stressed scenarios",
    ...(wantBullet4 ? ["Limiting foreign exchange exposure by broadly matching assets and liabilities by currency"] : []),
    "Generating stable net investment income",
  ];
  const bulletHtml = bulletItems.map((t, i) => {
    const p = i < bulletItems.length - 2 ? ";" : i === bulletItems.length - 2 ? "; and" : ".";
    return `<div class="b"><span class="m">•</span><span>${t}${p}</span></div>`;
  }).join("\n    ");

  const closing = pick([
    "The Company holds investment grade fixed and variable income portfolios denominated in a variety of currencies, which broadly correspond to the respective liabilities of the Company. Assets representing capital of the Company, which are not matched to specific liabilities, are generally held in the major currencies.",
    "The Company invests in investment grade fixed and floating rate portfolios denominated in a range of currencies which broadly correspond to the respective liabilities of the Company. Assets representing the capital of the Company, which are not matched to specific liabilities, are held in the major currencies.",
  ]) + (ultra ? "" : " Consideration is given to the interest rate environment, the volatility of exchange rates and the risk charge under SII.");

  // ---- twin table strings (shared by HTML + GT) ----
  const geoStrings = (y, d) => {
    const line = (lab, arr, tot) => [lab, ...arr.map((v) => (v === null ? DASH : fmtN(v))), fmtN(tot)];
    const metrics = [line("GWP", d.gwp, d.tg)];
    if (hasNwp) metrics.push(line("NWP", d.nwp, d.tw));
    metrics.push(line("NEP", d.nep, d.tn));
    return {
      h1: [String(y), ...countries, "TOTAL"],
      h2: ["", ...Array(nGeo + 1).fill(geoUnit)],
      metrics,
    };
  };
  const geoCur = geoStrings(year, cur);
  const geoPri = geoStrings(prior, pri);

  const geoHtml = (t) => `<table class="geo">
  <tr>${t.h1.map((c, i) => `<th class="${i === 0 ? "lab" : ""}">${c}</th>`).join("")}</tr>
  <tr>${t.h2.map((c, i) => `<th class="${i === 0 ? "lab" : "u"}">${c}</th>`).join("")}</tr>
  ${t.metrics.map((m) => `<tr class="dr">${m.map((c, i) => i === 0 ? `<td class="lab">${c}</td>` : `<td class="num">${c}</td>`).join("")}</tr>`).join("\n  ")}
  <tr class="dblr"><td colspan="${nCols}"></td></tr>
  </table>`;

  // ---- reconciliation HTML ----
  let recBody = "";
  for (let i = 0; i < recRows; i++) {
    const cls = i === subIdx ? ' class="sub"' : i === recRows - 1 ? ' class="fin"' : "";
    recBody += `<tr${cls}><td class="lab">${recCur[i][0]}</td><td class="num">${fmtN(recCur[i][1])}</td><td class="num">${fmtN(recPri[i][1])}</td></tr>\n`;
  }
  const recHtml = `<table class="rec">
  <tr class="h"><th class="lab">${recHeadLabel}</th><th class="num">${year}</th><th class="num">${prior}</th></tr>
  <tr class="h"><th class="lab"></th><th class="num">${recUnit}</th><th class="num">${recUnit}</th></tr>
  ${recBody}<tr class="findbl"><td colspan="3"></td></tr>
  </table>`;

  const pt = (v) => (v * fscale).toFixed(2) + "pt";
  const geoFs = wide ? 8.2 : 8.7;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a;
         width: 210mm; height: 296mm; box-sizing: border-box;
         padding: 25mm 19mm 14mm; position: relative; font-size: ${pt(9)}; }
  .geo { width: 100%; border-collapse: collapse; margin: 0 0 ${compact ? "4mm" : "5.5mm"}; }
  .geo th { font-weight: bold; font-size: ${pt(geoFs)}; text-align: center; padding: 0.4mm 1mm; }
  .geo th.lab { text-align: left; padding-left: ${wide ? "4mm" : "7mm"}; width: ${wide ? "13mm" : "17mm"}; }
  .geo th.u { font-size: ${pt(geoFs - 0.3)}; }
  .geo td { font-size: ${pt(geoFs)}; padding: ${compact ? "2.3mm" : "3.2mm"} 1mm 1.1mm; }
  .geo td.lab { text-align: left; padding-left: 0; }
  .geo td.num { text-align: right; }
  .geo tr.dr td { border-bottom: 0.75pt solid #000; }
  .geo tr.dblr td { height: 1.1mm; border-bottom: 0.9pt solid #000; padding: 0; }
  h4 { font-size: ${pt(9.2)}; margin: ${compact ? "3.2mm 0 2mm" : "4.5mm 0 2.5mm"}; }
  p { margin: 0 0 ${compact ? "2.4mm" : "3.2mm"}; line-height: 1.45; text-align: justify; }
  .rec { border-collapse: collapse; width: 128mm; margin: 1mm 0 0; }
  .rec th, .rec td { font-size: ${pt(9)}; padding: ${compact ? "0.9mm" : "1.2mm"} 0; }
  .rec .lab { text-align: left; }
  .rec .num { text-align: right; width: 27mm; }
  .rec th { font-weight: bold; }
  .rec tr.sub td { border-top: 0.75pt solid #000; font-weight: bold; }
  .rec tr.fin td { font-weight: bold; border-bottom: 1.1pt solid #000; }
  .rec tr.findbl td { height: 1.1mm; border-bottom: 0.75pt solid #000; padding: 0; }
  .a3 { color: #d9432a; font-size: ${pt(13)}; font-weight: bold; margin: ${compact ? "4.5mm 0 3mm" : "6.5mm 0 4mm"}; }
  .a3 .no { margin-right: 5mm; }
  .bullets { margin: 1mm 0 3.2mm 10mm; }
  .b { display: flex; margin-bottom: ${compact ? "2mm" : "2.6mm"}; line-height: 1.45; }
  .b .m { width: 8mm; flex: 0 0 8mm; }
  .pageno { position: absolute; bottom: 9mm; left: 0; right: 0; text-align: center; font-size: ${pt(9)}; }
  </style></head><body>
  ${geoHtml(geoCur)}
  ${geoHtml(geoPri)}
  <h4>${divHead}</h4>
  <p>${divSentence}</p>
  <h4>${recHead}</h4>
  <p>${recIntro}</p>
  ${recHtml}
  <div class="a3"><span class="no">A.3.</span>${a3title}</div>
  <p>${invIntro}</p>
  <div class="bullets">
    ${bulletHtml}
  </div>
  <p>${closing}</p>
  <div class="pageno">${pageNo}</div>
  </body></html>`;

  // ---- GT: three logical tables ----
  const gtRow = (cells, th) =>
    "  <tr>\n" + cells.map((c) => `    <${th ? "th" : "td"}>${c}</${th ? "th" : "td"}>`).join("\n") + "\n  </tr>";
  const geoGt = (t) =>
    "<table>\n" + gtRow(t.h1, true) + "\n" + gtRow(t.h2, true) + "\n"
    + t.metrics.map((m) => gtRow(m, false)).join("\n") + "\n</table>";
  const recGtRows = recCur.map((r, i) => gtRow([r[0], fmtN(r[1]), fmtN(recPri[i][1])], false));
  const recGt = "<table>\n"
    + gtRow([recHeadLabel, String(year), String(prior)], true) + "\n"
    + gtRow(["", recUnit, recUnit], true) + "\n"
    + recGtRows.join("\n") + "\n</table>";
  const gt = [geoGt(geoCur), geoGt(geoPri), recGt].join("\n\n");

  return { html, gt, pageOpts: { format: "A4" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
