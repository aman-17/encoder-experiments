// FAMILY GENERATOR — landscape Excel print of an actuarial loss-development
// TRIANGLE exhibit (rate-filing support page style). Top "CUMU(LATIVE) DOLLARS"
// triangle (Coverage | ACC QTR | Q1..QN + 4-5 far-right summary cols), bottom
// "AGE-TO-AGE" ratio triangle (Q2/Q1..QN/Q(N-1) + TAIL) with 5-7 spanning
// statistic rows. No gridlines anywhere, micro ~4-5pt font, staircase ragged
// right edge, #DIV/0! artifacts, optional all-zero quarter row and frozen-low
// first row. Seed-varied structure: triangle depth N=13..21, summary-col count,
// stat-row count, label/banner/title pools, base year, font size (+-10%),
// column widths, quirk toggles. All names/dates fictional.
// GT = two tables, ~550-1300 cells across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];

  // ---------- structure knobs (seed-driven) ----------
  const N = 13 + Math.floor(rng() * 9);  // accident-quarter rows (staircase depth N..1)
  const NR = N - 1;                      // ratio columns Q2/Q1..QN/Q(N-1)

  // quirk toggles
  const zeroOn = rng() < 0.8;                  // an all-zero accident-quarter row
  const zi = 1 + Math.floor(rng() * 3);        // its row index (1..3)
  const frozenOn = rng() < 0.7;                // row 0: 0 -> small -> frozen low tail
  const nDiv = 1 + Math.floor(rng() * 2);      // #DIV/0! markers in the zero ratio row
  const haveCov = rng() < 0.85;                // Coefficient of Variation stat row
  const haveSimple3 = rng() < 0.35;            // Simple Average Last 3 stat row
  const hasAnnual = rng() < 0.75;              // Annual Ultimate LDF summary column

  // ---------- identity (fictional pools) ----------
  const company = pick([
    "Bridgepoint General Insurance Company",
    "Harbor Ridge Indemnity Company",
    "Lakeland Direct Insurance Company",
    "Silvermont Casualty Insurance Company",
    "Trailhead Mutual Insurance Company",
    "Copperline National Insurance Company",
    "Bluecrest Standard Insurance Company",
    "Ferndale Premier Assurance Company",
  ]);
  const cov = pick(["PD", "BI", "CM", "UM", "PIP", "MP", "COLL", "COMP"]);
  const Y0 = 1998 + Math.floor(rng() * 18);
  const mi = Math.floor(rng() * 4);
  const metric = ["LOSS &amp; DCC", "LOSS &amp; LAE", "LOSS &amp; ALAE", "LOSS ONLY"][mi];
  const lossShort = ["Loss + DCC", "Loss + LAE", "Loss + ALAE", "Loss"][mi];
  const lossAmp = ["Loss &amp; DCC", "Loss &amp; LAE", "Loss &amp; ALAE", "Loss"][mi];
  const bi = Math.floor(rng() * 3);
  const basis = ["REPORTED", "PAID", "INCURRED"][bi];
  const basisT = ["Reported", "Paid", "Incurred"][bi];
  const cumWord = pick(["CUMU DOLLARS", "CUMULATIVE DOLLARS", "CUM DOLLARS"]);
  const arrow = pick(["-------&gt;", "----------&gt;", "-----&gt;"]);
  const banner1 = `${cumWord} - ${metric} ${basis} ${arrow}`;
  const banner2 = `AGE-TO-AGE - ${metric} ${basis} ${arrow}`;
  const covLbl = pick(["Coverage", "COVERAGE", "Cov"]);
  const accLbl = pick(["ACC QTR", "Acc Qtr", "ACC. QTR", "ACCIDENT QTR"]);
  const qWord = pick(["Quarters", "Qtrs"]);
  const titleLine2 =
    `${pick(["PPA", "Private Passenger Auto", "Personal Auto"])} ${lossAmp} Development Factors`;
  const titleLine3 = pick([
    "Accident Quarter Cumulative Statistics",
    "Accident Quarter Development Statistics",
    "Cumulative Loss Development Triangles",
    "Accident Quarter Triangle Statistics",
  ]);
  const exhibit = 2 + Math.floor(rng() * 10);
  const exLine = pick([
    `Exhibit ${exhibit}`,
    `Exhibit ${String.fromCharCode(65 + Math.floor(rng() * 8))}-${exhibit}`,
    `Appendix ${exhibit}`,
  ]);
  const exLine2 = pick([
    "Support Data Exhibit", "Supporting Data", "Development Support Data",
    "Actuarial Support Exhibit",
  ]);
  const pageNo = 3 + Math.floor(rng() * 14);
  const pageTot = pageNo + 2 + Math.floor(rng() * 10);

  const qtrs = [`${Y0}4`];
  for (let y = 1; qtrs.length < N; y++)
    for (let q = 1; q <= 4 && qtrs.length < N; q++) qtrs.push(`${Y0 + y}${q}`);

  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const depth = (i) => N - i;

  // ---------- cumulative dollars ----------
  const nums = [];
  for (let i = 0; i < N; i++) {
    const d = depth(i);
    if (zeroOn && i === zi) { nums.push(Array(d).fill(0)); continue; }  // all-zero quarter
    if (frozenOn && i === 0) {                                          // 0 -> small -> frozen low
      const b = Math.round((1400 + rng() * 1700) / 10) * 10;
      const mid = Math.round((b * 0.99) / 100) * 100;
      const low = Math.round((b * (0.6 + rng() * 0.14)) / 10) * 10;
      const row = [0, b, mid, mid];
      while (row.length < d) row.push(low);
      nums.push(row);
      continue;
    }
    let v = 2000 + rng() * 23000;
    v = rng() < 0.4 ? Math.round(v / 100) * 100 : Math.round(v);
    const row = [v];
    const g = Math.min(d - 1, 3 + Math.floor(rng() * 6));
    for (let k = 1; k < d; k++) {
      if (k <= g) {
        let f = k <= 2 ? 1 + rng() * 1.3 : 1 + rng() * 0.45 * Math.exp(-(k - 2) / 3);
        if (rng() < 0.18) f = 0.85 + rng() * 0.15;
        v = Math.round(v * f);
      } else if (rng() < 0.08) {
        v = Math.round(v * (0.97 + rng() * 0.06));
      }
      row.push(v);
    }
    nums.push(row);
  }
  const valStr = nums.map((row) => row.map((v) => fmt(v)));

  // ---------- age-to-age ratios ----------
  const divCols = new Set();
  if (zeroOn) {
    const dz = depth(zi) - 1;  // ratio cells present in the zero row
    while (divCols.size < Math.min(nDiv, dz)) divCols.add(Math.floor(rng() * dz));
  }
  const ratioStr = [], ratioNum = [];
  for (let i = 0; i < N - 1; i++) {
    const d = depth(i), rs = [], rn = [];
    for (let j = 0; j <= d - 2; j++) {
      if (zeroOn && i === zi) {
        rs.push(divCols.has(j) ? "#DIV/0!" : ""); rn.push(null); continue;
      }
      if (frozenOn && i === 0 && j === 0) { rs.push(""); rn.push(null); continue; }
      const r = nums[i][j + 1] / nums[i][j];
      rs.push(r.toFixed(2)); rn.push(r);
    }
    ratioStr.push(rs); ratioNum.push(rn);
  }

  // ---------- column statistics ----------
  const cov_ = [], wavg = [], flat = [], wl3 = [], sl3 = [];
  for (let j = 0; j < NR; j++) {
    const vals = []; let sumP = 0, sumN = 0, hasDiv = false;
    const contrib = [];
    for (let i = 0; i < N - 1; i++) {
      if (j > depth(i) - 2) continue;
      contrib.push(i);
      if (ratioStr[i][j] === "#DIV/0!") hasDiv = true;
      if (ratioNum[i][j] != null) vals.push(ratioNum[i][j]);
      sumP += nums[i][j]; sumN += nums[i][j + 1];
    }
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const sd = vals.length
      ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length) : 0;
    cov_.push(hasDiv ? "#DIV/0!" : (mean > 0 ? sd / mean : 0).toFixed(2));
    flat.push(hasDiv ? "#DIV/0!" : mean.toFixed(2));
    wavg.push((sumP > 0 ? sumN / sumP : 1).toFixed(2));
    let sP = 0, sN = 0, taken = 0;
    for (let k = contrib.length - 1; k >= 0 && taken < 3; k--) {
      const i = contrib[k];
      if (ratioNum[i][j] == null) continue;
      sP += nums[i][j]; sN += nums[i][j + 1]; taken++;
    }
    wl3.push((sP > 0 ? sN / sP : 1).toFixed(2));
    const l3 = vals.slice(-3);
    sl3.push(l3.length
      ? (l3.reduce((a, b) => a + b, 0) / l3.length).toFixed(2) : "1.00");
  }
  const sel = wl3.slice();
  const atuN = Array(NR);
  { let p = 1; for (let j = NR - 1; j >= 0; j--) { p *= parseFloat(sel[j]); atuN[j] = p; } }
  const atu = atuN.map((v) => v.toFixed(2));

  // ---------- far-right summary columns ----------
  const toDateN = [], toDate = [], ldf = [], ultN = [], ult = [], accYr = [], annLdf = [];
  for (let i = 0; i < N; i++) {
    const t = nums[i][depth(i) - 1];
    toDateN.push(t); toDate.push(fmt(t));
    const jj = NR - i;
    const l = jj > NR - 1 ? 1 : atuN[jj];
    ldf.push(l.toFixed(2));
    const u = Math.round(t * l);
    ultN.push(u); ult.push(fmt(u));
    accYr.push(""); annLdf.push("");
  }
  for (let i = 0; i < N; i += 4) {
    accYr[i] = String(Y0 + i / 4);
    const rows = i === 0 ? [0] : [i - 3, i - 2, i - 1, i];
    const sT = rows.reduce((a, r) => a + toDateN[r], 0);
    const sU = rows.reduce((a, r) => a + ultN[r], 0);
    annLdf[i] = (sT > 0 ? sU / sT : 1).toFixed(3);
  }
  const totT = fmt(toDateN.reduce((a, b) => a + b, 0));
  const totU = fmt(ultN.reduce((a, b) => a + b, 0));

  const sumCols = [
    { h: `To-Date ${lossShort} ${basisT}`, v: toDate },
    { h: pick(["Quarterly LDF", "Qtrly LDF", "Quarterly Devt Factor"]), v: ldf },
    { h: `Ultimate ${lossShort}`, v: ult },
    { h: pick(["Accident Year", "Acc Year", "Accident Yr"]), v: accYr },
  ];
  if (hasAnnual) sumCols.push({
    h: pick(["Annual Ultimate Incur LDF", "Annual Ult Incurred LDF", "Annual Ultimate LDF"]),
    v: annLdf,
  });
  const S = sumCols.length;
  const totRow = sumCols.map((c, k) => (k === 0 ? totT : k === 2 ? totU : ""));

  const statRows = [];
  if (haveCov)
    statRows.push({ l: "Coefficient of Variation", v: cov_, t: "0.00" });
  statRows.push({ l: "Weighted Average Age-to-Age Factor", v: wavg, t: "1.00" });
  statRows.push({ l: "Flat Average Age-to-Age Factor", v: flat, t: "1.00" });
  statRows.push({ l: `Weighted Average Last 3 ${qWord}`, v: wl3, t: "1.00" });
  if (haveSimple3)
    statRows.push({ l: `Simple Average Last 3 ${qWord}`, v: sl3, t: "1.00" });
  statRows.push({ l: "Selected Age-to-Age Factor", v: sel, t: "1.00" });
  statRows.push({ l: "Age-to-Ultimate", v: atu, t: "1.00" });

  // ---------- HTML ----------
  const fs = +(4.5 * (0.9 + rng() * 0.2)).toFixed(2);   // base font, ~4.05..4.95pt
  const bfs = +(fs + 0.1).toFixed(2);
  const tfs = +(fs + 0.3).toFixed(2);
  const qwN = Math.min(0.40 + rng() * 0.10, 10.03 / N);
  const rwN = Math.min(0.48 + rng() * 0.10, 12.53 / N);
  const qw = qwN.toFixed(4), rw = rwN.toFixed(4);
  const w1 = (0.42 + 0.55 + N * qwN + 0.20 + S * 0.46).toFixed(2);
  const w2 = (0.42 + 0.55 + N * rwN).toFixed(2);

  let cols1 = '<col style="width:0.42in"><col style="width:0.55in">';
  for (let q = 0; q < N; q++) cols1 += `<col style="width:${qw}in">`;
  cols1 += '<col style="width:0.20in">';
  for (let s = 0; s < S; s++) cols1 += '<col style="width:0.46in">';
  let cols2 = '<col style="width:0.42in"><col style="width:0.55in">';
  for (let j = 0; j <= NR; j++) cols2 += `<col style="width:${rw}in">`;

  let h1 = `<tr><th class="l">${covLbl}</th><th class="l">${accLbl}</th>`;
  for (let q = 1; q <= N; q++) h1 += `<th>Q${q}</th>`;
  h1 += "<th></th>" + sumCols.map((c) => `<th class="sum">${c.h}</th>`).join("") + "</tr>";

  let b1 = "";
  for (let i = 0; i < N; i++) {
    b1 += `<tr><td class="l">${cov}</td><td class="l">${qtrs[i]}</td>`;
    for (let q = 0; q < N; q++) b1 += `<td>${valStr[i][q] ?? ""}</td>`;
    b1 += "<td></td>" + sumCols.map((c) => `<td>${c.v[i]}</td>`).join("") + "</tr>\n";
  }
  b1 += `<tr class="sp"><td colspan="${N + 3 + S}"></td></tr>\n`;
  b1 += `<tr><td class="l">${cov}</td><td class="l">All</td>` + "<td></td>".repeat(N + 1) +
    totRow.map((v) => `<td>${v}</td>`).join("") + "</tr>\n";

  let h2 = `<tr><th class="l">${covLbl}</th><th class="l">${accLbl}</th>`;
  for (let j = 0; j < NR; j++) h2 += `<th>Q${j + 2}/Q${j + 1}</th>`;
  h2 += `<th>TAIL / Q${N}</th></tr>`;

  let b2 = "";
  for (let i = 0; i < N - 1; i++) {
    b2 += `<tr><td class="l">${cov}</td><td class="l">${qtrs[i]}</td>`;
    for (let j = 0; j < NR; j++) b2 += `<td>${ratioStr[i][j] ?? ""}</td>`;
    b2 += "<td></td></tr>\n";
  }
  b2 += `<tr class="sp"><td colspan="${N + 2}"></td></tr>\n`;
  for (const sr of statRows) {
    b2 += `<tr><td class="l lbl" colspan="2">${sr.l}</td>`;
    for (let j = 0; j < NR; j++) b2 += `<td>${sr.v[j]}</td>`;
    b2 += `<td class="b">${sr.t}</td></tr>\n`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 14in 8.5in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 14in; height: 8.5in; font-family: Arial, Helvetica, sans-serif;
         color: #000; position: relative; }
  .tl { position: absolute; top: 0.20in; left: 0.25in; font-size: ${tfs}pt; line-height: 1.45; }
  .tr { position: absolute; top: 0.20in; right: 0.25in; font-size: ${tfs}pt; line-height: 1.45;
        text-align: right; }
  .content { position: absolute; top: 0.60in; left: 0.25in; width: 13.5in; }
  .banner { font-weight: bold; font-size: ${bfs}pt; margin: 0 0 3pt 0; }
  .b2 { margin-top: 10pt; }
  table { border-collapse: collapse; table-layout: fixed; }
  th, td { font-size: ${fs}pt; font-weight: normal; padding: 0.4pt 1.5pt 0.4pt 0;
           text-align: right; white-space: nowrap; overflow: hidden; line-height: 1.28;
           vertical-align: bottom; }
  th { font-weight: bold; }
  .l { text-align: left; }
  th.sum { white-space: normal; text-align: left; line-height: 1.12; }
  td.lbl { overflow: visible; }
  .b { font-weight: bold; }
  tr.sp td { height: 4.5pt; }
  </style></head><body>
  <div class="tl">${company}<br>${titleLine2}<br>${titleLine3}<br><b>${cov}</b></div>
  <div class="tr">${exLine}<br>${exLine2}<br>Page ${pageNo} of ${pageTot}</div>
  <div class="content">
  <div class="banner">${banner1}</div>
  <table style="width:${w1}in"><colgroup>${cols1}</colgroup>${h1}\n${b1}</table>
  <div class="banner b2">${banner2}</div>
  <table style="width:${w2}in"><colgroup>${cols2}</colgroup>${h2}\n${b2}</table>
  </div></body></html>`;

  // ---------- GT (logical) ----------
  let g1 = `<table>\n<tr><td colspan="${N + 2 + S}">${banner1}</td></tr>\n`;
  g1 += `<tr><th>${covLbl}</th><th>${accLbl}</th>`;
  for (let q = 1; q <= N; q++) g1 += `<th>Q${q}</th>`;
  g1 += sumCols.map((c) => `<th>${c.h}</th>`).join("") + "</tr>\n";
  for (let i = 0; i < N; i++) {
    g1 += `<tr><td>${cov}</td><td>${qtrs[i]}</td>`;
    for (let q = 0; q < N; q++) g1 += `<td>${valStr[i][q] ?? ""}</td>`;
    g1 += sumCols.map((c) => `<td>${c.v[i]}</td>`).join("") + "</tr>\n";
  }
  g1 += `<tr><td>${cov}</td><td>All</td>` + "<td></td>".repeat(N) +
    totRow.map((v) => `<td>${v}</td>`).join("") + "</tr>\n</table>";

  let g2 = `<table>\n<tr><td colspan="${N + 2}">${banner2}</td></tr>\n`;
  g2 += `<tr><th>${covLbl}</th><th>${accLbl}</th>`;
  for (let j = 0; j < NR; j++) g2 += `<th>Q${j + 2}/Q${j + 1}</th>`;
  g2 += `<th>TAIL / Q${N}</th></tr>\n`;
  for (let i = 0; i < N - 1; i++) {
    g2 += `<tr><td>${cov}</td><td>${qtrs[i]}</td>`;
    for (let j = 0; j < NR; j++) g2 += `<td>${ratioStr[i][j] ?? ""}</td>`;
    g2 += "<td></td></tr>\n";
  }
  for (const sr of statRows) {
    g2 += `<tr><td colspan="2">${sr.l}</td>`;
    for (let j = 0; j < NR; j++) g2 += `<td>${sr.v[j]}</td>`;
    g2 += `<td>${sr.t}</td></tr>\n`;
  }
  g2 += "</table>";

  return { html, gt: g1 + "\n\n" + g2, pageOpts: { width: "14in", height: "8.5in" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
