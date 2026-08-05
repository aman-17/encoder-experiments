// FAMILY generator: regulator rate-filing loss-development exhibit — Letter
// PORTRAIT page, a wide spreadsheet print-shrunk into the top part of the page
// (~3.4pt effective font), ZERO gridlines. Two stacked triangles share one
// x-grid of age columns: top = cumulative incurred (NQ accident quarters x ages
// 3..3*NAGE + Latest Diagonal + Cum. LDFs + optional stray orphan column),
// bottom = age-to-age factors + ragged-width summary-stat rows, then
// Selected/Cumulative LDF rows. GT = ONE logical table, full grid with empty
// cells. Seeded structural jitter: NQ 12..20 (=> GT ~590-1360 cells), summary
// row set, label synonyms, quirk probabilities, fonts +-10%. All department /
// insurer names, exhibit numbers and date ranges are fictional.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = a => a[Math.floor(rng() * a.length)];

  // ---------- structural knobs (seed-driven) ----------
  const NQ = 12 + Math.floor(rng() * 9);        // accident quarters: 12..20
  const NAGE = NQ - 1;                          // age columns: 3..3*NAGE months
  const hasOrphan = rng() < 0.75;               // stray unheadered far-right col
  const COLS = 4 + NAGE + (hasOrphan ? 1 : 0);  // physical/logical grid width

  // ---------- furniture (fictional pools) ----------
  const depts = [
    "State of New Cambria Department of Insurance",
    "State of Caldora Department of Insurance",
    "Commonwealth of Westhaven Division of Insurance",
    "State of Merrivale Office of the Insurance Commissioner",
    "Commonwealth of Norvale Bureau of Insurance",
    "State of Ardenfield Department of Insurance",
    "State of Tolland Ridge Insurance Regulation Division",
  ];
  const companies = [
    "Meridian Preferred Insurance Company", "Cascadia Summit Casualty Company",
    "Sentinel Rock Insurance Company", "Crownline Mutual Insurance Company",
    "Bluepeak National Indemnity Company", "Harborstone Fire & Casualty Company",
    "Vantara Standard Insurance Company", "Kestrel Valley Casualty Company",
  ];
  const programs = [
    " - Commercial Vehicle", " - Commercial Auto", " - Private Passenger Auto",
    " - Personal Auto", " - Commercial Auto Liability", " - Fleet Vehicle Program",
  ];
  const covs = [
    ["Bodily Injury", "BI"], ["Property Damage", "PD"], ["Medical Payments", "MP"],
    ["Collision", "COLL"], ["Comprehensive", "COMP"], ["Uninsured Motorist", "UM"],
    ["Combined Single Limit", "CSL"],
  ];
  const title1s = [
    "Loss and Defense & Cost Containment Expense", "Loss and Allocated Loss Adjustment Expense",
    "Incurred Loss and DCC Expense", "Loss and Loss Adjustment Expense",
    "Paid Loss and Defense Expense", "Incurred Loss and Claim Expense",
  ];
  const title2s = [
    "(DCCE Development Factors)", "(Quarterly Development Factors)",
    "(Incurred Development Factors)", "(Loss Development Triangles)",
    "(Development Factor Analysis)", "(ALAE Development Factors)",
  ];
  const dept = pick(depts);
  const company = pick(companies) + pick(programs);
  const title1 = pick(title1s), title2 = pick(title2s);
  const [coverage, abbr] = pick(covs);
  const exhibitNo = 3 + Math.floor(rng() * 10);

  // column-label synonym pools (must stay identical between render and GT)
  const periodLbl = pick(["Accident Period", "Accident Quarter", "Loss Period"]);
  const [startLbl, endLbl] = pick([
    ["Start Month", "End Month"], ["Begin Month", "End Month"],
    ["Beginning", "Ending"], ["First Month", "Last Month"],
  ]);
  const devLbl = pick(["Development as of", "Developed as of", "Evaluated as of", "Development Age as of"]);
  const [diagTop, diagBot] = pick([["Latest", "Diagonal"], ["Current", "Diagonal"], ["Latest", "Diag."]]);
  const [cumTop, cumBot] = pick([["Cum.", "LDFs"], ["Cum.", "LDF"], ["Cumulative", "LDF"], ["Cumulative", "LDFs"]]);
  const factorLbl = pick(["Loss Development Factors", "Age-to-Age Factors", "Incurred Development Factors", "Link Ratios"]);
  const selLbl = pick(["Selected LDF", "Selected", "Selected Factors"]);
  const cumLbl = pick(["Cumulative LDF", "Cumulative", "Cum. LDF"]);

  // ---------- dates (fictional range, seeded quarter phase) ----------
  const startYear = 1997 + Math.floor(rng() * 18);
  const qOff = Math.floor(rng() * 4);
  const QM = [["m01", "m03"], ["m04", "m06"], ["m07", "m09"], ["m10", "m12"]];
  const q = [];
  for (let i = 0; i < NQ; i++) {
    const k = i + qOff, yr = startYear + Math.floor(k / 4);
    q.push([`${yr}${QM[k % 4][0]}`, `${yr}${QM[k % 4][1]}`]);
  }
  const evalLbl = q[NQ - 1][1];
  const ages = Array.from({ length: NAGE }, (_, j) => String(3 * (j + 1)));
  const ranges = Array.from({ length: NAGE }, (_, j) =>
    j < NAGE - 1 ? `${3 * (j + 1)} - ${3 * (j + 2)}` : `${3 * NAGE} -`);

  const fmtI = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f4 = x => x.toFixed(4);

  // ---------- triangle values (seeded quirk probabilities) ----------
  // age-to-age volatility shrinks with age; saturates at literal 1.0000
  const satBase = 0.05 + rng() * 0.07, satSlope = 0.065 + rng() * 0.04, satMax = 0.92 + rng() * 0.06;
  const spikeY = 0.06 + rng() * 0.08, spikeO = 0.01 + rng() * 0.02;
  const valScale = 0.6 + rng() * 1.5;
  function genFactor(j) {
    const p1 = j < 2 ? 0 : Math.min(satBase + (j - 2) * satSlope, satMax);
    if (rng() < p1) return 1;
    const spread = j === 0 ? 0.55 : j === 1 ? 0.34 : j < 5 ? 0.20 : Math.max(0.13 * Math.exp(-0.10 * (j - 4)), 0.012);
    const bias = j === 0 ? 0.28 : j === 1 ? 0.14 : j < 9 ? 0.05 * Math.exp(-0.25 * (j - 2)) : 0;
    let f = 1 + (rng() + rng() - 1) * 2 * spread + bias;
    if (rng() < (j < 3 ? spikeY : spikeO)) f += rng() * (j < 3 ? 0.9 : 0.55); // stray spike (e.g. reopened claim)
    if (f < 0.85) f = 0.85 + rng() * 0.07; // soft floor: no artificial clamp pileups
    return Math.min(f, 2.85);
  }
  const dOf = i => Math.min(NQ - i, NAGE); // populated dev cells per row (staircase)
  const V = [], VS = [], F = [], FS = [];
  for (let i = 0; i < NQ; i++) {
    const d = dOf(i);
    const vr = [Math.round((55000 + rng() * 330000) * valScale)];
    for (let j = 1; j < d; j++) {
      let f = genFactor(j - 1);
      if (vr[j - 1] * f > 950000 * valScale) f = 1 + (f - 1) * 0.08;
      vr.push(Math.round(vr[j - 1] * f));
    }
    V.push(vr); VS.push(vr.map(fmtI));
    const fr = [], fs = [];
    for (let j = 0; j + 1 < d; j++) { const x = vr[j + 1] / vr[j]; fr.push(x); fs.push(f4(x)); }
    F.push(fr); FS.push(fs);
  }

  // ---------- summary statistics (ragged widths are availability-driven) ----------
  const rowsFor = j => { const o = []; for (let i = 0; i < NQ; i++) if (F[i].length > j) o.push(i); return o; };
  const wtd = (rs, j) => { let n = 0, d = 0; for (const i of rs) { n += V[i][j + 1]; d += V[i][j]; } return n / d; };
  const trim = (rs, j) => { // drop the hi and lo factor rows
    let hi = rs[0], lo = rs[0];
    for (const i of rs) { if (F[i][j] > F[hi][j]) hi = i; if (F[i][j] < F[lo][j]) lo = i; }
    return rs.filter(i => i !== hi && i !== lo);
  };
  const stat = (need, fn) => Array.from({ length: NAGE }, (_, j) => {
    const rs = rowsFor(j);
    return rs.length >= need ? f4(fn(rs, j)) : "";
  });
  const lastN = (rs, n) => rs.slice(-n);
  const avg = (rs, j) => rs.reduce((s, i) => s + F[i][j], 0) / rs.length;

  // seed-varied experience windows (family pattern: big / mid / small, each with
  // an optional trimmed-weighted "MxLy" companion row)
  const wA = Math.min(NQ - 2, pick([12, 14, 16])), lA = wA - 2;
  const wB = Math.max(6, Math.round(wA / 2)), lB = wB - 2;
  const wC = Math.max(4, wB - 3), lC = Math.max(3, wC - 2);

  const allPeriod = stat(1, avg);
  const allPeriodW = stat(1, wtd);
  const maxR = stat(1, (rs, j) => Math.max(...rs.map(i => F[i][j])));
  const minR = stat(1, (rs, j) => Math.min(...rs.map(i => F[i][j])));
  const medR = stat(1, (rs, j) => {
    const v = rs.map(i => F[i][j]).sort((a, b) => a - b), m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  });
  const mA = stat(wA, (rs, j) => wtd(trim(lastN(rs, wA), j), j));
  const lastA = stat(lA, (rs, j) => avg(lastN(rs, lA), j));
  const lastAW = stat(lA, (rs, j) => wtd(lastN(rs, lA), j));
  const mB = stat(wB, (rs, j) => wtd(trim(lastN(rs, wB), j), j));
  const lastB = stat(lB, (rs, j) => avg(lastN(rs, lB), j));
  const lastBW = stat(lB, (rs, j) => wtd(lastN(rs, lB), j));
  const mC = stat(wC, (rs, j) => wtd(trim(lastN(rs, wC), j), j));
  const lastCW = stat(lC, (rs, j) => wtd(lastN(rs, lC), j));

  const sumRows = [ // [label, values, bold] — membership is seed-toggled
    ["All Period", allPeriod, 1], ["All Period Wtd", allPeriodW, 1],
    ["Maximum", maxR, 1], ["Minimum", minR, 1],
  ];
  if (rng() < 0.75) sumRows.push(["Median", medR, 1]);
  if (rng() < 0.8) sumRows.push([`M${wA - 2}L${wA} Wtd`, mA, 1]);
  sumRows.push([`Last ${lA}`, lastA, 1], [`Last ${lA} Wtd`, lastAW, 1]);
  if (rng() < 0.7) sumRows.push([`M${wB - 2}L${wB} Wtd`, mB, 1]);
  sumRows.push([`Last ${lB}`, lastB, 1], [`Last ${lB} Wtd`, lastBW, 1]);
  if (rng() < 0.7) sumRows.push([`M${wC - 2}L${wC} Wtd`, mC, 1]);
  sumRows.push([`Last ${lC} Wtd`, lastCW, 1]);

  // selected = big-window Wtd where credible, 1.0000 tail with one late oddball
  const selCut = Math.round(NAGE * (0.5 + rng() * 0.15));
  const hasOdd = rng() < 0.8;
  const oddJ = Math.min(NAGE - 3, selCut + 3 + Math.floor(rng() * 4));
  const oddFallback = (1.006 + rng() * 0.02).toFixed(4);
  const sel = Array.from({ length: NAGE }, (_, j) => {
    if (j <= selCut) return lastAW[j] || allPeriodW[j] || "1.0000";
    if (hasOdd && j === oddJ) return lastBW[j] && lastBW[j] !== "1.0000" ? lastBW[j] : oddFallback;
    return "1.0000";
  });
  const cumS = []; // cumulative LDF by age index
  { let p = 1; for (let j = NAGE - 1; j >= 0; j--) { p *= parseFloat(sel[j]); cumS[j] = f4(p); } }
  const cumOf = i => cumS[dOf(i) - 1];
  const orph = {}; // stray 3-decimal orphans in the far-right no-header column
  if (hasOrphan) {
    const nOr = 2 + Math.floor(rng() * 3), lo = Math.floor(NQ * 0.5);
    while (Object.keys(orph).length < nOr) {
      const i = lo + Math.floor(rng() * (NQ - lo));
      if (!(i in orph)) orph[i] = (1 + (parseFloat(cumOf(i)) - 1) * (0.55 + rng() * 0.2)).toFixed(3);
    }
  }
  sumRows.push([selLbl, sel, 0], [cumLbl, cumS, 0]);

  // ---------- physical page ----------
  const pad = (a, n) => a.concat(Array(Math.max(0, n - a.length)).fill(""));
  const tds = a => a.map(v => `<td>${v}</td>`).join("");
  const OT = hasOrphan ? "<td></td>" : "";
  const P = [];
  P.push(`<tr><td colspan="2" class="i c">${periodLbl}</td><td colspan="${NAGE}" class="i l">${devLbl} ${evalLbl}</td><td class="c">${diagTop}</td><td class="c">${cumTop}</td>${OT}</tr>`);
  P.push(`<tr><td class="i c">${startLbl}</td><td class="i c">${endLbl}</td>${tds(ages)}<td class="c u">${diagBot}</td><td class="c u">${cumBot}</td>${OT}</tr>`);
  P.push(`<tr class="sp"><td colspan="${COLS}"></td></tr>`);
  for (let i = 0; i < NQ; i++) {
    const d = dOf(i);
    P.push(`<tr><td class="m">${q[i][0]}</td><td class="m">${q[i][1]}</td>${tds(pad(VS[i], NAGE))}<td>${VS[i][d - 1]}</td><td>${cumOf(i)}</td>${hasOrphan ? `<td>${orph[i] ?? ""}</td>` : ""}</tr>`);
  }
  P.push(`<tr class="sp2"><td colspan="${COLS}"></td></tr>`);
  P.push(`<tr><td colspan="2" class="i c">${periodLbl}</td><td colspan="${NAGE}" class="i l">${factorLbl}</td><td></td><td></td>${OT}</tr>`);
  P.push(`<tr><td class="i c">${startLbl}</td><td class="i c">${endLbl}</td>${tds(ranges)}<td></td><td></td>${OT}</tr>`);
  P.push(`<tr class="sp"><td colspan="${COLS}"></td></tr>`);
  for (let i = 0; i < NQ; i++)
    P.push(`<tr><td class="m">${q[i][0]}</td><td class="m">${q[i][1]}</td>${tds(pad(FS[i], NAGE))}<td></td><td></td>${OT}</tr>`);
  P.push(`<tr class="sp2"><td colspan="${COLS}"></td></tr>`);
  for (const [lbl, vals, bold] of sumRows) {
    if (lbl === selLbl) P.push(`<tr class="sp3"><td colspan="${COLS}"></td></tr>`);
    P.push(`<tr><td colspan="2" class="l${bold ? " b" : ""}">${lbl}</td>${tds(pad(vals, NAGE))}<td></td><td></td>${OT}</tr>`);
  }

  // seed-jittered metrics (fonts +-10%, spacing, column widths)
  const fs = 4.2 + rng() * 0.9;                 // sheet font, pt (design 2x)
  const lh = (fs * 1.76).toFixed(2);
  const hfs = (fs + 0.6).toFixed(2), hlh = ((fs + 0.6) * 1.46).toFixed(2);
  const padT = (34 + rng() * 8).toFixed(1), padL = (30 + rng() * 10).toFixed(1);
  const exL = (100 + rng() * 22).toFixed(1);
  const g1h = (2.4 + rng() * 0.8).toFixed(1), g2h = (5.0 + rng() * 1.8).toFixed(1);
  const sp1 = (2.4 + rng() * 0.8).toFixed(1), sp2 = (1.4 + rng() * 0.8).toFixed(1), sp3 = (0.8 + rng() * 0.5).toFixed(1);
  const labW1 = (13 + rng() * 2.5).toFixed(1), labW2 = (11 + rng() * 2.5).toFixed(1);
  const age0W = (18 + rng() * 3).toFixed(1), ageW = (10 + rng() * 2.5).toFixed(1);

  // NOTE: page is designed at 2x and zoomed 0.5 so the effective ~3.4pt sheet
  // font escapes Chrome's 6px minimum-font-size clamp.
  const ageCols = `<col style="width:${age0W}mm">` + `<col style="width:${ageW}mm">`.repeat(NAGE - 1);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 216mm 279mm; margin: 0; }
  body { margin: 0; width: 216mm; height: 278mm; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .pad { transform: scale(0.5); transform-origin: 0 0; width: 432mm;
         padding: ${padT}mm 0 0 ${padL}mm; position: relative; }
  .hd { font-size: ${hfs}pt; line-height: ${hlh}pt; }
  .hd.bl { font-weight: bold; }
  .ex { position: absolute; left: ${exL}mm; top: ${padT}mm; font-size: ${hfs}pt; }
  .g1 { height: ${g1h}mm; } .g2 { height: ${g2h}mm; }
  table { border-collapse: collapse; table-layout: fixed; margin-top: 0.3mm; }
  td { font-size: ${fs.toFixed(2)}pt; line-height: ${lh}pt; height: ${lh}pt; padding: 0 0.8mm 0 0;
       text-align: right; white-space: nowrap; overflow: visible; font-weight: normal; }
  td.l { text-align: left; padding-left: 0.5mm; } td.c { text-align: center; }
  td.m { text-align: right; padding-right: 2.4mm; }
  td.i { font-style: italic; } td.b { font-weight: bold; }
  td.u { text-decoration: underline; }
  tr.sp td { height: ${sp1}mm; } tr.sp2 td { height: ${sp2}mm; } tr.sp3 td { height: ${sp3}mm; }
  </style></head><body><div class="pad">
  <div class="hd">${dept}</div>
  <div class="ex">Exhibit ${exhibitNo}-&nbsp;&nbsp;&nbsp;${abbr}</div>
  <div class="hd">${company}</div>
  <div class="g1"></div>
  <div class="hd bl">${title1}</div>
  <div class="hd">${title2}</div>
  <div class="g2"></div>
  <div class="hd bl">${coverage}</div>
  <table>
  <colgroup><col style="width:${labW1}mm"><col style="width:${labW2}mm">${ageCols}<col style="width:13.0mm"><col style="width:8.2mm">${hasOrphan ? `<col style="width:8.0mm">` : ""}</colgroup>
  ${P.join("\n")}
  </table>
  </div></body></html>`;

  // ---------- logical GT: ONE table, full grid incl. empty cells ----------
  const G = [];
  const gtds = a => a.map(v => `<td>${v}</td>`).join("");
  const GOT = hasOrphan ? "<td></td>" : "";
  G.push(`<tr><th colspan="2">${periodLbl}</th><th colspan="${NAGE}">${devLbl} ${evalLbl}</th><th rowspan="2">${diagTop} ${diagBot}</th><th rowspan="2">${cumTop} ${cumBot}</th>${hasOrphan ? `<th rowspan="2"></th>` : ""}</tr>`);
  G.push(`<tr><th>${startLbl}</th><th>${endLbl}</th>${ages.map(a => `<th>${a}</th>`).join("")}</tr>`);
  for (let i = 0; i < NQ; i++) {
    const d = dOf(i);
    G.push(`<tr><td>${q[i][0]}</td><td>${q[i][1]}</td>${gtds(pad(VS[i], NAGE))}<td>${VS[i][d - 1]}</td><td>${cumOf(i)}</td>${hasOrphan ? `<td>${orph[i] ?? ""}</td>` : ""}</tr>`);
  }
  G.push(`<tr><th colspan="2">${periodLbl}</th><th colspan="${NAGE}">${factorLbl}</th><td></td><td></td>${GOT}</tr>`);
  G.push(`<tr><th>${startLbl}</th><th>${endLbl}</th>${ranges.map(r => `<th>${r}</th>`).join("")}<td></td><td></td>${GOT}</tr>`);
  for (let i = 0; i < NQ; i++)
    G.push(`<tr><td>${q[i][0]}</td><td>${q[i][1]}</td>${gtds(pad(FS[i], NAGE))}<td></td><td></td>${GOT}</tr>`);
  for (const [lbl, vals] of sumRows)
    G.push(`<tr><td colspan="2">${lbl}</td>${gtds(pad(vals, NAGE))}<td></td><td></td>${GOT}</tr>`);
  const gt = `<table>\n${G.join("\n")}\n</table>`;

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
