// FAMILY generator (training data) — Excel-exported actuarial loss-trend exhibit:
// gridless 4-col quarterly table (seed-varied row count, ragged 2-3 line col-3
// header, floating group headers), boxed "PP Trend" mini-table, one blue input
// cell, bold Trend Factors key-value list. Titles are absolutely positioned and
// come LAST in DOM to mimic the real text-layer reading order.
//
// Seed-varied structure: data-row count (~16-33), quarter-label format, column
// label synonyms, title wording, state, mini-table point count (4-6), trend-factor
// row count (5-7), start year (1996-2017), font size +/-10%, table position/width,
// quirk probabilities (identical-value saturation in the mini-table, visual-only
// spacer rows at year boundaries — spacers are NOT GT rows).
// All names/exhibits/dates are fictional or shifted; no eval-page identifiers.
// GT: main ((N+1)x4) + PP Trend ((P+1)x2) + trend-period (1x2) + factors ((F+1)x2).
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const MM = 0.352777; // mm per pt

  // ---------- typography scale (±10%) ----------
  const fontPt = +(9 * (0.9 + rng() * 0.2)).toFixed(2); // 8.10 .. 9.90
  const s = fontPt / 9;
  const rowH = fontPt * 1.38 * MM;

  // ---------- label / wording pools (all fictional) ----------
  const companies = [
    "Meridian/Meridian General/Meridian Indemnity",
    "Lakeshore/Lakeshore National/Lakeshore Casualty",
    "Silverpine/Silverpine General/Silverpine Indemnity",
    "Northlight/Northlight National/Northlight Casualty",
    "Bluecrest/Bluecrest Fire &amp; Marine/Bluecrest Indemnity",
    "Harborstone/Harborstone Mutual/Harborstone Casualty",
    "Vantera/Vantera National/Vantera Indemnity",
    "Ridgemark/Ridgemark General/Ridgemark Casualty",
  ];
  const coverages = ["Bodily Injury", "Property Damage", "Medical Payments",
    "Uninsured Motorist Bodily Injury", "Collision", "Comprehensive"];
  const states = ["Nevada", "Oregon", "Arizona", "Colorado", "Utah", "New Mexico", "Idaho"];
  const line2Pool = ["Private Passenger Auto Liability", "Private Passenger Automobile Liability",
    "Personal Auto Liability", "Private Passenger Auto Program"];
  const line3Pool = ["Non-Catastrophe Loss and DCCE Trend", "Loss and DCCE Trend (Excluding Catastrophes)",
    "Non-Catastrophe Loss &amp; DCCE Trend Selections", "Loss and DCCE Trend Analysis"];
  const col1Pool = ["Calendar Qtr", "Calendar Quarter", "Accident Qtr"];
  const col2Pool = ["Earned Exposures", "Earned Car Years", "Earned Exposure Units", "On-Level Earned Exposures"];
  const col3Pool = [
    { br: "Total Paid Losses &amp; DCCE including<br>Partial Payments on Prior<br>Calendar Years, on Closed Claims",
      sp: "Total Paid Losses &amp; DCCE including Partial Payments on Prior Calendar Years, on Closed Claims", lines: 3 },
    { br: "Total Paid Losses &amp; ALAE including<br>Partial Payments on Prior<br>Calendar Years, on Closed Claims",
      sp: "Total Paid Losses &amp; ALAE including Partial Payments on Prior Calendar Years, on Closed Claims", lines: 3 },
    { br: "Paid Losses &amp; DCCE including Partial<br>Payments on Prior Calendar Years",
      sp: "Paid Losses &amp; DCCE including Partial Payments on Prior Calendar Years", lines: 2 },
    { br: "Total Closed Paid Losses &amp; DCCE<br>excluding Unallocated Loss<br>Adjustment Expense",
      sp: "Total Closed Paid Losses &amp; DCCE excluding Unallocated Loss Adjustment Expense", lines: 3 },
  ];
  const col4Pool = ["Pure Premium", "Pure Premium (PP)", "Rolling Pure Premium", "Paid Pure Premium"];

  const company = pick(companies);
  const coverage = pick(coverages);
  const state = pick(states);
  const line2 = pick(line2Pool);
  const line3 = pick(line3Pool);
  const col1 = pick(col1Pool);
  const col2 = pick(col2Pool);
  const hdr3 = pick(col3Pool);
  const col4 = pick(col4Pool);
  const grpL1 = rng() < 0.5
    ? `${state} Company-Specific Loss and DCCE Trend Data`
    : `Company-Specific ${state} Loss and DCCE Trend Data`;
  const grpL2 = rng() < 0.6 ? "Quarterly Data" : "Quarterly Experience";
  const exhibitNo = 3 + Math.floor(rng() * 17);
  const sheetNo = 1 + Math.floor(rng() * 9);

  // quarter label format (seed-varied)
  const qStyle = Math.floor(rng() * 3);
  const fmtQ = (y, q) => qStyle === 0 ? `${y}${q}` : qStyle === 1 ? `${y}Q${q}` : `${y}-${q}`;

  // ---------- quirk toggles ----------
  const spacerOn = rng() < 0.35;          // visual-only spacer rows at year boundaries
  const pDup = 0.3 + rng() * 0.4;         // identical-value saturation prob in mini-table

  // ---------- structural sizes ----------
  const desiredN = 18 + Math.floor(rng() * 16);          // 18..33 data rows (pre-clamp)
  const P = 4 + Math.floor(rng() * 3);                   // 4..6 mini-table points
  const F = 4 + Math.floor(rng() * 3);                   // 4..6 prior-year factor rows

  // ---------- layout geometry (computed so nothing overflows A4) ----------
  const mainTop = 56 + rng() * 8;
  const tableLeft = 36 + rng() * 8;
  const jw = 0.95 + rng() * 0.1;
  const w1 = 24 * jw, w2 = 30 * jw, w3 = 66 * jw, w4 = 20 * jw;
  const tableW = w1 + w2 + w3 + w4;
  const estLines = (label, wmm) =>
    Math.min(3, Math.max(1, Math.ceil((label.replace(/&amp;/g, "&").length * 0.52 * fontPt * MM) / wmm)));
  const headerLines = Math.max(hdr3.lines, estLines(col1, w1), estLines(col2, w2), estLines(col4, w4));
  const headerH = headerLines * fontPt * 1.35 * MM + 1;
  const gap1 = 6 + rng() * 9;
  const miniLeft = 100 + rng() * 8;
  const miniW = 68 + rng() * 8;
  const miniH = 2 * fontPt * 1.4 * MM + 1.5 + P * (fontPt * 1.62 * MM) + 1.6;
  const gap2 = 5 + rng() * 6;
  const frowH = 5.4 * s;
  const stackBelow = gap1 + miniH + gap2 + 17 * s + 6 * s + (F + 1) * frowH;
  const spacerH = rowH * 0.55;
  const rowHeff = spacerOn ? rowH + spacerH / 4 : rowH;
  const Nmax = Math.floor((290 - mainTop - headerH - stackBelow) / rowHeff);
  const N = Math.max(14, Math.min(desiredN, Nmax));

  // ---------- main quarterly table data ----------
  let y = 1996 + Math.floor(rng() * 22), q = 1 + Math.floor(rng() * 4);
  const qtr = [], qq = [];
  for (let i = 0; i < N; i++) { qtr.push(fmtQ(y, q)); qq.push(q); q++; if (q > 4) { q = 1; y++; } }

  let expo = 180000 + rng() * 220000;
  const gq = 0.010 + rng() * 0.014;           // avg quarterly exposure growth
  const ppqBase = 70 + rng() * 30;            // starting quarterly pure premium
  const drift = 0.04 + rng() * 0.06;          // annual pp drift
  const expos = [], losses = [];
  for (let i = 0; i < N; i++) {
    if (i > 0) expo *= 1 + gq + (rng() - 0.42) * 0.018;
    expos.push(Math.round(expo));
    const ppq = ppqBase * (1 + (drift * i) / 4) * (0.88 + rng() * 0.24);
    losses.push(Math.round(expos[i] * ppq));
  }
  const pp = expos.map((_, i) => {
    if (i < 3) return "";
    let le = 0, ee = 0;
    for (let k = i - 3; k <= i; k++) { le += losses[k]; ee += expos[k]; }
    return String(Math.round(le / ee));
  });

  // ---------- PP Trend mini-table (P points, identical-value quirk) ----------
  const ptsBase = ["4 pt", "8 pt", "12 pt", "16 pt", "20 pt", "24 pt", "28 pt"];
  const startIdx = rng() < 0.4 ? 0 : 1;
  const pts = ptsBase.slice(startIdx, startIdx + P);
  const tvals = [];
  let tv = 7 + rng() * 5;
  for (let i = 0; i < P; i++) {
    if (i > 0) tv = Math.max(1.6, tv - (0.6 + rng() * 2.4));
    tvals.push(tv);
  }
  if (rng() < pDup && P >= 3) tvals[P - 1] = tvals[P - 2];          // saturation quirk
  const trendPcts = tvals.map((v) => v.toFixed(1) + "%");

  // ---------- trend period + factors (selected trend = 2nd mini-table value) ----------
  const tp = pick(["1.750", "2.000", "2.250", "2.500", "2.750", "3.000", "3.250"]);
  const t = parseFloat(trendPcts[Math.min(1, P - 1)]) / 100;
  const factor = (k) => Math.pow(1 + t, parseFloat(tp) + k).toFixed(3);
  const suf = (n) => n === 2 ? "nd" : n === 3 ? "rd" : "th";
  const ordinals = [];
  for (let n = F + 1; n >= 2; n--) ordinals.push([n - 1, String(n), suf(n)]);
  const factorRowsHtml = ordinals
    .map(([k, n, sf]) => frow(`${n}<sup>${sf}</sup> Prior Year`, factor(k)))
    .join("\n") + "\n" + frow("Most Recent Year", factor(0));
  function frow(label, val) {
    return `<div class="frow"><span class="flab">${label}</span><span class="fval">${val}</span></div>`;
  }

  // ---------- vertical stack ----------
  const spacerAfter = (i) => spacerOn && qq[i] === 4 && i < N - 1;
  let spacerCount = 0;
  for (let i = 0; i < N; i++) if (spacerAfter(i)) spacerCount++;
  const tableH = headerH + N * rowH + spacerCount * spacerH;
  const miniTop = mainTop + tableH + gap1;
  const tplabTop = miniTop + miniH + gap2;
  const tpboxTop = tplabTop + 4.6 * s;
  const tfTop = tplabTop + 17 * s;
  const grpTop = mainTop - 11 * s;
  const f1 = (v) => v.toFixed(1);

  // ---------- HTML ----------
  const bodyRows = [];
  for (let i = 0; i < N; i++) {
    bodyRows.push(`<tr><td class="q">${qtr[i]}</td><td class="n1">${fmt(expos[i])}</td><td class="n2">${fmt(losses[i])}</td><td class="n3">${pp[i]}</td></tr>`);
    if (spacerAfter(i)) bodyRows.push(`<tr class="sp"><td colspan="4"></td></tr>`);
  }

  const miniRows = pts.map((p, i) =>
    `<tr><td class="ml">${p}</td><td class="mr">${trendPcts[i]}</td></tr>`
  ).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; width: 210mm; height: 296mm; position: relative;
         font-family: Arial, Helvetica, sans-serif; font-size: ${fontPt}pt; color: #000; }
  .exh { position: absolute; top: 8mm; right: 17mm; text-align: right; line-height: 1.45; }
  .titles { position: absolute; top: 19mm; left: 0; width: 210mm; text-align: center;
            font-weight: bold; font-size: ${(11.5 * s).toFixed(2)}pt; line-height: 1.4; }
  .titles .sub { font-size: ${(9.5 * s).toFixed(2)}pt; font-style: italic; }
  .gap { height: 4mm; }
  .grpL { position: absolute; top: ${f1(grpTop)}mm; left: ${f1(tableLeft)}mm; width: ${f1(w1 + w2 + w3)}mm; text-align: center;
          font-weight: bold; line-height: 1.45; }
  .grpR { position: absolute; top: ${f1(grpTop)}mm; left: ${f1(tableLeft + w1 + w2 + w3 - 1)}mm; width: ${f1(w4 + 14)}mm; text-align: center;
          font-weight: bold; line-height: 1.45; }
  table.main { position: absolute; top: ${f1(mainTop)}mm; left: ${f1(tableLeft)}mm; width: ${f1(tableW)}mm;
               table-layout: fixed; border-collapse: collapse; }
  table.main th { font-weight: normal; vertical-align: bottom; line-height: 1.35;
                  padding: 0 0 0.4mm 0; }
  table.main td { line-height: 1.38; padding: 0; }
  th.h3 { padding-left: 12mm; }
  td.q  { text-align: center; }
  td.n1 { text-align: right; padding-right: 8mm; }
  td.n2 { text-align: right; padding-right: 12mm; }
  td.n3 { text-align: right; padding-right: 4mm; }
  tr.sp td { height: ${f1(spacerH)}mm; line-height: 1; padding: 0; }
  .mini { position: absolute; top: ${f1(miniTop)}mm; left: ${f1(miniLeft)}mm; width: ${f1(miniW)}mm;
          border: 1.6pt solid #000; }
  .mini table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .mini th { font-weight: normal; text-align: center; line-height: 1.4;
             border-bottom: 0.9pt solid #000; padding: 0.5mm 0; }
  .mini td { line-height: 1.62; padding: 0; }
  td.ml { text-align: right; padding-right: 2mm; }
  td.mr { text-align: center; }
  .tplab { position: absolute; top: ${f1(tplabTop)}mm; left: ${f1(tableLeft + 7)}mm; line-height: 1.45; }
  .tpbox { position: absolute; top: ${f1(tpboxTop)}mm; left: ${f1(miniLeft)}mm; width: ${f1(miniW - 3)}mm;
           border: 1.1pt solid #5b9bd5; text-align: right; padding: 0.3mm 3mm 0.3mm 0; }
  .tf { position: absolute; top: ${f1(tfTop)}mm; left: ${f1(tableLeft + 7)}mm; width: 103mm; }
  .frow { position: relative; height: ${f1(frowH)}mm; }
  .flab { position: absolute; left: 2mm; }
  .fval { position: absolute; right: 0; font-weight: bold; }
  sup { font-size: ${(6 * s).toFixed(2)}pt; }
  </style></head><body>
  <div class="exh">Exhibit ${exhibitNo}<br>Sheet ${sheetNo}</div>

  <table class="main">
  <colgroup><col style="width:${f1(w1)}mm"><col style="width:${f1(w2)}mm"><col style="width:${f1(w3)}mm"><col style="width:${f1(w4)}mm"></colgroup>
  <tr><th>${col1}</th><th>${col2}</th><th class="h3">${hdr3.br}</th><th>${col4}</th></tr>
  ${bodyRows.join("\n")}
  </table>

  <div class="mini"><table>
  <tr><th style="width:50%"></th><th>PP<br>Trend</th></tr>
  ${miniRows}
  </table></div>

  <div class="tplab">Trend Period (Years) for Most Recent<br>Year in Experience Period:</div>
  <div class="tpbox">${tp}</div>

  <div class="tf">
  <div class="frow" style="height:${f1(6 * s)}mm"><span style="position:absolute;left:0">Trend Factors:</span></div>
  ${factorRowsHtml}
  </div>

  <div class="titles">${company}<br>${line2}<div class="gap"></div>${line3}<br><span class="sub">${coverage}</span></div>
  <div class="grpL">${grpL1}<br>${grpL2}</div>
  <div class="grpR">Rolling 4-<br>Quarter Data</div>
  </body></html>`;

  // ---------- GT (spacer rows are visual only — NOT in GT) ----------
  const gtMain = `<table>\n  <tr>\n    <th>${col1}</th>\n    <th>${col2}</th>\n    <th>${hdr3.sp}</th>\n    <th>${col4}</th>\n  </tr>\n`
    + qtr.map((c, i) => `  <tr>\n    <td>${c}</td>\n    <td>${fmt(expos[i])}</td>\n    <td>${fmt(losses[i])}</td>\n    <td>${pp[i]}</td>\n  </tr>`).join("\n")
    + "\n</table>";

  const gtMini = "<table>\n  <tr>\n    <th></th>\n    <th>PP Trend</th>\n  </tr>\n"
    + pts.map((p, i) => `  <tr>\n    <td>${p}</td>\n    <td>${trendPcts[i]}</td>\n  </tr>`).join("\n")
    + "\n</table>";

  const gtPeriod = `<table>\n  <tr>\n    <td>Trend Period (Years) for Most Recent Year in Experience Period:</td>\n    <td>${tp}</td>\n  </tr>\n</table>`;

  const gtFactors = "<table>\n"
    + ordinals.map(([k, n, sf]) => `  <tr>\n    <td>${n}${sf} Prior Year</td>\n    <td>${factor(k)}</td>\n  </tr>`).join("\n")
    + `\n  <tr>\n    <td>Most Recent Year</td>\n    <td>${factor(0)}</td>\n  </tr>\n</table>`;

  const gt = [gtMain, gtMini, gtPeriod, gtFactors].join("\n\n");

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
