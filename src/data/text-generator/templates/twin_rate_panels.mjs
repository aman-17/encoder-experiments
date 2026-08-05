// FAMILY generator (training data) — private passenger auto "Stated & Agreed Amount"
// rate-factor exhibit: TWO micro-font full-grid rate tables printed side by side.
// Left panel "Stated Amount" (has Vehicle Age), right panel "Agreed Amount" (no age;
// code 99 expands into value bands). Wallpaper-1.000 saturation with two ramp columns
// mirrored into the Loan/Lease columns; both panels cut by the page at the same row
// (headerless truncated blocks). Centered title block, "Exhibit NN" top right,
// "Page 1 of NN" bottom right, light Excel gridlines, ~4pt font.
//
// Seed-varied structure: vehicle-type count (2-4), age-group scheme, value-band count
// (8-12) + code-skip position, code-99 expansion depth (4-7), coverage-column count
// (3-5), trailing coverage column, header synonyms, title/date wording, font scale
// +-10%, spacer-row / flat-plateau / effective-date quirk toggles, and a seeded page
// cut that lands total GT cells in ~650-1350 (budget-capped from the real 3267).
// All furniture names are fictional; years shifted to 2031-2039.
export function generate(seed) {
  const rng = mulberry32(seed);
  const round2 = v => Math.round(v * 100) / 100;
  const fmt = v => round2(v).toFixed(2) + "0"; // every factor ends in a trailing 0 (e.g. 1.000, 0.170, 12.560)
  const pick = arr => arr[Math.floor(rng() * arr.length)];

  // ---------- furniture (all fictional) ----------
  const states = ["State of Missouri", "State of Nebraska", "State of Oklahoma", "State of Iowa",
    "State of Kansas", "State of Indiana", "State of Wisconsin", "State of Wyoming",
    "State of Vermont", "State of Idaho"];
  const companies = [
    "Harborview Financial Benefit Insurance Company",
    "Meridian Security Benefit Insurance Company",
    "Lakeshore Mutual Benefit Insurance Company",
    "Continental Plains Benefit Insurance Company",
    "Silverbrook Casualty Insurance Company",
    "Crestfield Assurance Company",
    "Bluewater National Indemnity Company",
    "Ironpeak Mutual Insurance Company",
  ];
  const programs = ["Private Passenger Automobile", "Personal Automobile Program",
    "Private Passenger Auto Program", "Personal Lines Automobile"];
  const subjects = ["Stated & Agreed Amount", "Stated and Agreed Amount Factors",
    "Stated & Agreed Amount Rating Factors", "Stated / Agreed Amount Program"];
  const months = ["January", "March", "April", "June", "July", "September", "October", "December"];
  const state = pick(states);
  const company = pick(companies);
  const program = pick(programs);
  const subject = pick(subjects);
  const hasEffDate = rng() < 0.6;
  const effLine = hasEffDate ? `<br>Effective ${pick(months)} 1, ${2031 + Math.floor(rng() * 9)}` : "";
  const exhibitNo = 12 + Math.floor(rng() * 33);
  const totalPages = 8 + Math.floor(rng() * 24);
  const tier = String(1 + Math.floor(rng() * 5)).padStart(3, "0");

  // ---------- structural knobs ----------
  const nBands = 8 + Math.floor(rng() * 5);        // value-band codes per block (real: 26)
  const n99 = 4 + Math.floor(rng() * 4);           // right-panel code-99 expansion rows (real: 21)
  const nTypes = 2 + Math.floor(rng() * 3);        // vehicle types (real: 4)
  const ages = pick([["0", "1+"], ["0", "1", "2+"], ["0-2", "3+"]]);
  const covK = 3 + Math.floor(rng() * 3);          // coverage columns (real: 5 = COMPx4 + COLL)
  const useSpacers = rng() < 0.35;                 // blank grid spacer rows between blocks (render-only)
  const fsCell = round2(3.7 * (0.9 + rng() * 0.2)); // micro font +-10%
  const titlePad = round2(11 + rng() * 7);         // whitespace jitter (mm)
  const panelGap = round2(3 + rng() * 4);

  // vehicle-type codes: distinct two-letter codes, alphabetical (real doc: AN, AT, CL, PP)
  const pool = ["AN", "AT", "CL", "PP", "SP", "MC", "RV", "LS", "FM", "UT"];
  const types = [];
  while (types.length < nTypes) {
    const t = pool[Math.floor(rng() * pool.length)];
    if (!types.includes(t)) types.push(t);
  }
  types.sort();
  // right panel skips one interior vehicle type (real page: AN, CL, PP — no AT)
  const skipIdx = 1 + Math.floor(rng() * (nTypes - 1));
  const rightTypes = types.filter((_, i) => i !== skipIdx);

  // ---------- value bands (one code skipped mid-sequence — real quirk skipped 96) ----------
  const unit = pick([1000, 2000, 2500]);
  const nSmall = Math.ceil(nBands / 2);
  const startCode = 60 + Math.floor(rng() * 15);
  const skipAt = nBands - 1 - Math.floor(rng() * 3);
  const bands = [];
  let lo = 1, code = startCode;
  for (let i = 0; i < nBands; i++) {
    const w = i < nSmall ? unit : unit * (i - nSmall < 2 ? 5 : 10);
    if (i === skipAt) code++; // code-skip quirk
    bands.push([String(code), lo, lo + w - 1]);
    lo += w; code++;
  }
  const topVal = lo - 1;
  // right-panel code 99 expansion: fixed-width bands then a catch-all to 999999
  const w99 = pick([10000, 20000]);
  const rBands = [];
  for (let k = 0; k < n99 - 1; k++) rBands.push([topVal + 1 + k * w99, topVal + (k + 1) * w99]);
  rBands.push([topVal + 1 + (n99 - 1) * w99, 999999]);

  // ---------- left-panel ramps (identical for every type/age block — real quirk) ----------
  const lin = Math.min(nSmall, nBands - 2);
  const unitC = 0.15 + rng() * 0.05;
  const unitL = 0.115 + rng() * 0.03;
  const lc = [1], ll = [1];
  for (let i = 1; i <= lin; i++) { lc.push(round2(unitC * i)); ll.push(round2(unitL * i)); }
  let hv = lc[lin] + 0.7 + rng() * 0.4;
  let lv = ll[lin] + 0.04 + rng() * 0.04;
  const sHi = 0.6 + rng() * 0.12, sLo = 0.18 + rng() * 0.03;
  for (let i = lin + 1; i <= nBands + 1; i++) {
    lc.push(round2(hv)); ll.push(round2(lv));
    hv += sHi + (rng() < 0.25 ? rng() * 0.24 - 0.12 : 0);
    lv += sLo;
  }

  // ---------- right-panel ramps ----------
  const RN = nBands + n99;
  const unitR = 0.10 + rng() * 0.03;
  const rcompo = [1], rcoll = [1];
  let rv = 0;
  for (let i = 1; i <= lin; i++) { rv += unitR * (0.8 + rng() * 0.5); rcompo.push(round2(rv)); rcoll.push(round2(rv * 0.75)); }
  const sR = pick([0.02, 0.03, 0.04]);
  let cur = rcompo[lin] + sR;
  for (let i = lin + 1; i <= RN; i++) {
    rcompo.push(round2(cur));
    rcoll.push(i === lin + 1 ? round2(cur * 0.87) : round2(cur));
    cur += sR;
  }
  // flat "PP-style" plateau variant for the last right-panel type (seed-toggled)
  const useFlat = rightTypes.length >= 2 && rng() < 0.7;
  const fcompo = [], fcoll = [];
  { const cpy = Math.max(3, lin - 1);
    let p = 1.05, rem = 0, li = 0;
    for (let i = 0; i <= RN; i++) {
      if (i < cpy) { fcompo.push(rcompo[i]); continue; }
      if (i === cpy) rem = 2;
      if (rem === 0) { p = round2(p + 0.05); rem = 2 + (li++ % 2); }
      fcompo.push(p); rem--;
    }
    for (let i = 0; i <= RN; i++) fcoll.push(i < cpy + 2 ? rcoll[i] : fcompo[i]);
  }

  // ---------- headers (seed-picked synonyms) ----------
  const tierH = pick([["UW Tier", "Group"], ["Rating Tier", "Group"], ["UW Tier", "Grp"], ["Tier", "Group"]]);
  const typeH = pick([["Vehicle Type"], ["Veh Type"], ["Vehicle Class"]]);
  const ageH = pick([["Vehicle Age"], ["Veh Age"], ["Model Age"]]);
  const amtWord = pick(["Amount", "Amt", "Value"]);
  const [minH, maxH] = pick([[["Min Value"], ["Max Value"]], [["Value Min"], ["Value Max"]],
    [["Low Value"], ["High Value"]], [["Min Amt"], ["Max Amt"]]]);
  const loanWord = pick(["Loan /Lease", "Loan/Lease", "Loan & Lease"]);
  const covPool = ["COMPO", "COMPA", "COMPG", "COMPC", "COMPF", "COMPW"];
  const covNames = [covPool[0]];
  { const rest = covPool.slice(1);
    while (covNames.length < covK) {
      const c = rest.splice(Math.floor(rng() * rest.length), 1)[0];
      covNames.push(c);
    }
    covNames.splice(1, covK - 1, ...covNames.slice(1).sort());
  }
  const extraH = pick([["Roadside", "Assistance"], ["Towing &", "Labor"], ["Rental", "Reimb"],
    ["Emergency", "Road Svc"], ["Trip", "Interruption"], ["Glass", "Coverage"]]);
  const pTitleIdx = Math.floor(rng() * 3);
  const pTitleL = ["Stated Amount", "Stated Amount Factors", "Stated Value"][pTitleIdx];
  const pTitleR = ["Agreed Amount", "Agreed Amount Factors", "Agreed Value"][pTitleIdx];

  const covHeads = [...covNames.map(n => [n]), ["COLL"]];
  const tailHeads = [["Comp Auto", loanWord], ["Coll Auto", loanWord], extraH];
  const leftHeads = [tierH, typeH, ageH, ["Stated", amtWord, "Code"], minH, maxH, ...covHeads, ...tailHeads];
  const rightHeads = [tierH, typeH, ["Agreed", amtWord, "Code"], minH, maxH, ...covHeads, ...tailHeads];

  // ---------- rows ----------
  const ones = n => Array(n).fill("1.000");
  const factors = (c, l) => [c, ...ones(covK - 1), l, c, l, "1.000"];

  const leftBlockLen = nBands + 2;
  const leftRows = [];
  for (const t of types) for (const age of ages) {
    leftRows.push([tier, t, age, "00", "0", "0", ...ones(covK + 4)]);
    for (let i = 1; i <= nBands + 1; i++) {
      const [bCode, mn, mx] = i <= nBands ? bands[i - 1] : ["99", topVal + 1, 999999];
      leftRows.push([tier, t, age, bCode, String(mn), String(mx), ...factors(fmt(lc[i]), fmt(ll[i]))]);
    }
  }

  const rightBlockLen = RN + 1;
  const rightRows = [];
  for (let b = 0; b < rightTypes.length; b++) {
    const t = rightTypes[b];
    const flat = useFlat && b === rightTypes.length - 1;
    const C = flat ? fcompo : rcompo, L = flat ? fcoll : rcoll;
    rightRows.push([tier, t, "0", "0", "0", ...ones(covK + 4)]);
    for (let i = 1; i <= RN; i++) {
      const [bCode, mn, mx] = i <= nBands ? bands[i - 1] : ["99", ...rBands[i - nBands - 1]];
      rightRows.push([tier, t, bCode, String(mn), String(mx), ...factors(fmt(C[i]), fmt(L[i]))]);
    }
  }

  // ---------- page cut (budget cap: land total GT cells ~650-1350) ----------
  const LT = leftRows.length, RT = rightRows.length;
  const leftCols = leftHeads.length, rightCols = rightHeads.length;
  const targetCells = 700 + Math.floor(rng() * 600);
  const cellsAt = r => (Math.min(LT, r) + 1) * leftCols + (Math.min(RT, r) + 1) * rightCols;
  let cut = Math.max(LT, RT);
  while (cut > 14 && cellsAt(cut) > targetCells) cut--;
  const leftPage = leftRows.slice(0, cut);
  const rightPage = rightRows.slice(0, cut);

  // ---------- html ----------
  const thRow = heads => "<tr>" + heads.map(h => `<th>${h.join("<br>")}</th>`).join("") + "</tr>";
  const trs = (rows, blockLen, cols) => rows.map((r, idx) =>
    (useSpacers && idx > 0 && idx % blockLen === 0
      ? "<tr>" + "<td>&nbsp;</td>".repeat(cols) + "</tr>\n" : "") +
    "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>").join("\n");

  const f = m => round2(fsCell * m); // derived font sizes track the +-10% jitter
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; width: 216mm; height: 278mm; position: relative;
         font-family: Arial, Helvetica, sans-serif; color: #000; }
  .exh { position: absolute; top: 4.5mm; right: 7mm; font-size: ${f(1.35)}pt; }
  .title { text-align: center; font-weight: bold; font-size: ${f(1.51)}pt; line-height: 1.55; padding-top: ${titlePad}mm; }
  .panels { display: flex; justify-content: center; gap: ${panelGap}mm; align-items: flex-start; padding: 0 5.5mm; margin-top: 4mm; }
  .ptitle { font-weight: bold; font-size: ${f(1.4)}pt; margin-bottom: 0.8mm; }
  table { border-collapse: collapse; }
  th, td { border: 0.25pt solid #999; font-size: ${fsCell}pt; font-weight: normal;
           padding: 0.3pt 0.6pt; text-align: center; line-height: 1.08; white-space: nowrap; }
  th { line-height: 1.2; padding: 0.7pt 0.4pt; }
  .pageno { position: absolute; bottom: 4.5mm; right: 7mm; font-size: ${f(1.35)}pt; }
  </style></head><body>
  <div class="exh">Exhibit ${exhibitNo}</div>
  <div class="title">${state}<br>${company}<br>${program}<br>${subject.replace(/&/g, "&amp;")}${effLine}</div>
  <div class="panels">
    <div><div class="ptitle">${pTitleL}</div>
      <table>${thRow(leftHeads)}\n${trs(leftPage, leftBlockLen, leftCols)}</table></div>
    <div><div class="ptitle">${pTitleR}</div>
      <table>${thRow(rightHeads)}\n${trs(rightPage, rightBlockLen, rightCols)}</table></div>
  </div>
  <div class="pageno">Page 1 of ${totalPages}</div>
  </body></html>`;

  // ---------- GT: two logical tables (spacer rows are render-only, NOT in GT) ----------
  const gtTable = (heads, rows) =>
    "<table>\n  <tr>\n" + heads.map(h => `    <th>${h.join(" ")}</th>`).join("\n") + "\n  </tr>\n" +
    rows.map(r => "  <tr>\n" + r.map(c => `    <td>${c}</td>`).join("\n") + "\n  </tr>").join("\n") + "\n</table>";
  const gt = gtTable(leftHeads, leftPage) + "\n\n" + gtTable(rightHeads, rightPage);

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
