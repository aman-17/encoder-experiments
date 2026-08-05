// FAMILY GENERATOR (training data): state private-passenger auto "Annual Mileage"
// rate-factor matrix. Full-page wide grid: 4 key cols (UW tier / vehicle type /
// min / max miles) + 12-20 coverage-factor cols saturated with an identical
// literal factor value (usually "1.000"). Thin light full grid, heavier rule
// under a heavily word-wrapped single-tier header, centered bold small title
// block, "Exhibit NN" loose top-right, "Page N of M" bottom-right. Mileage bands
// sorted LEXICOGRAPHICALLY on the min-miles string (the family quirk), with
// optional 999998/999999 sentinel rows. First tier block starts mid-sequence
// (its lex-first rows "fell on the prior page"); the page ends a few rows into
// the next tier. All names/numbers fictional; structure jitters per seed.
// GT = ONE logical flat table: 1 header row + N data rows x (4+F) cols,
// tuned to land in ~500-1400 cells across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---------- pools (all fictional) ----------
  const states = ["Missouri", "Tennessee", "Georgia", "Iowa", "Nebraska", "Ohio", "Colorado", "Oregon"];
  const companies = [
    "Meridian Standard Benefit Insurance Company",
    "Continental Harbor Casualty Insurance Company",
    "Founders National Property Insurance Company",
    "Lakeshore Financial Assurance Insurance Company",
    "Prairie Summit Mutual Insurance Company",
    "Bluewater Guaranty Fire & Casualty Company",
    "Ridgeline Peak Indemnity Insurance Company",
    "Harvest Crown Security Insurance Company",
  ];
  const programLines = [
    "Private Passenger Automobile",
    "Personal Automobile Program",
    "Private Passenger Auto Program",
    "Personal Lines Automobile",
  ];
  const factorLines = [
    "Annual Mileage",
    "Estimated Annual Mileage",
    "Annual Mileage Factors",
    "Mileage Rating Factors",
  ];
  const months = ["January", "February", "March", "April", "June", "July", "September", "October"];

  const state = pick(states);
  const company = pick(companies);
  const exhibitNo = 20 + Math.floor(rng() * 60);
  const pageNo = 2 + Math.floor(rng() * 4);
  const pageTot = pageNo + 2 + Math.floor(rng() * 4);
  const hasEffDate = rng() < 0.5;
  const effDate = `${pick(months)} ${1 + Math.floor(rng() * 28)}, ${2009 + Math.floor(rng() * 10)}`;

  // ---------- structural jitter ----------
  const fs = 0.9 + rng() * 0.2; // font scale +/-10%
  const pt = (v) => (v * fs).toFixed(2) + "pt";

  // Two-tier codes with leading zeros (e.g. 002 then 003)
  const tierBase = 1 + Math.floor(rng() * 7);
  const tierA = String(tierBase).padStart(3, "0");
  const tierB = String(tierBase + 1).padStart(3, "0");

  // Two distinct vehicle-type group codes per seed
  const typePool = ["AO", "PP", "MC", "LT", "VN", "CM"];
  const typeA = pick(typePool);
  let typeB = pick(typePool);
  while (typeB === typeA) typeB = pick(typePool);

  // Mileage bands: `regular` bands stepping by `step`, optionally followed by
  // the sentinel band (next-min -> 999998) and the 999999-999999 band; all
  // sorted lexicographically on the min-miles string (family quirk).
  const step = pick([1000, 2000, 2500, 5000]);
  const bandCount = 16 + Math.floor(rng() * 11); // 16..26 total bands
  const hasSentinels = rng() < 0.9;
  const regular = hasSentinels ? bandCount - 2 : bandCount;
  const mins = [];
  for (let i = 0; i < regular; i++) mins.push(String(i * step));
  const sentinelLow = String(regular * step);
  if (hasSentinels) mins.push(sentinelLow, "999999");
  mins.sort(); // lexicographic
  const bandMax = (mn) =>
    hasSentinels && mn === sentinelLow ? "999998"
    : mn === "999999" ? "999999"
    : String(Number(mn) + step - 1);
  const bands = mins.map((mn) => [mn, bandMax(mn)]);

  // Page composition: block1 = tierA/typeA partial (first `drop` lex rows fell
  // on the prior page), block2 = tierA/typeB full, block3 = tierB/typeA first
  // `tail` rows before the page break.
  const drop = Math.floor(rng() * 3);       // 0..2
  const tail = 1 + Math.floor(rng() * 3);   // 1..3
  const rows = [];
  for (const [mn, mx] of bands.slice(drop)) rows.push([tierA, typeA, mn, mx]);
  for (const [mn, mx] of bands) rows.push([tierA, typeB, mn, mx]);
  for (const [mn, mx] of bands.slice(0, tail)) rows.push([tierB, typeA, mn, mx]);

  // ---------- columns ----------
  // Ordered factor-column pool; each seed keeps a subset (order preserved).
  const factorPool = [
    ["BI", "BI"], ["PD", "PD"], ["CSL", "CSL"], ["MP", "MP"], ["PIP", "PIP"],
    ["UM BI", "UM BI"], ["UM PD", "UM PD"], ["UM CSL", "UM CSL"],
    ["UIMBI", "UIMBI"], ["UIMPD", "UIMPD"], ["UIMCSL", "UIMCSL"],
    ["COMPO", "COMPO"], ["COMPA", "COMPA"], ["COMPG", "COMPG"], ["COMPC", "COMPC"],
    ["COLL", "COLL"],
    ["Comp Auto<br>Loan /Lease", "Comp Auto Loan /Lease"],
    ["Coll Auto<br>Loan /Lease", "Coll Auto Loan /Lease"],
    ["OLTE", "OLTE"],
    ["Towing", "Towing"],
    ["Rental<br>Reimb", "Rental Reimb"],
    ["Excess<br>Custom<br>Equipment", "Excess Custom Equipment"],
    ["Excess<br>Electronic<br>Equipment", "Excess Electronic Equipment"],
    ["Roadside<br>Assistance", "Roadside Assistance"],
    ["Full<br>Glass", "Full Glass"],
  ];
  const nFactors = 12 + Math.floor(rng() * 9); // 12..20 factor cols
  const idx = factorPool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { // pick subset, keep pool order
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const chosen = idx.slice(0, nFactors).sort((a, b) => a - b);
  const factorCols = chosen.map((i) => factorPool[i]);

  // Identical-value saturation: usually EVERY factor cell is the same literal
  // "1.000"; sometimes 1-3 columns carry a different constant factor.
  const colVals = Array(nFactors).fill("1.000");
  if (rng() >= 0.6) {
    const nDev = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < nDev; k++)
      colVals[Math.floor(rng() * nFactors)] = pick(["0.900", "0.950", "1.050", "1.100", "1.250"]);
  }

  // Key-column label synonym pools ([html, gt] pairs)
  const keyCols = [
    pick([
      ["UW Tier<br>Group", "UW Tier Group"],
      ["Rating Tier<br>Group", "Rating Tier Group"],
      ["UW<br>Tier", "UW Tier"],
    ]),
    pick([
      ["Vehicle Type<br>Group", "Vehicle Type Group"],
      ["Veh Type<br>Group", "Veh Type Group"],
      ["Vehicle<br>Class<br>Group", "Vehicle Class Group"],
    ]),
    pick([
      ["Minimum<br>Vehicle<br>Miles", "Minimum Vehicle Miles"],
      ["Min Annual<br>Miles", "Min Annual Miles"],
      ["Minimum<br>Annual<br>Mileage", "Minimum Annual Mileage"],
    ]),
    pick([
      ["Maximum<br>Vehicle<br>Miles", "Maximum Vehicle Miles"],
      ["Max Annual<br>Miles", "Max Annual Miles"],
      ["Maximum<br>Annual<br>Mileage", "Maximum Annual Mileage"],
    ]),
  ];

  // ---------- render ----------
  const headHtml = [...keyCols, ...factorCols].map(([v]) => `<th>${v}</th>`).join("");
  const factorTds = colVals.map((v) => `<td class="f">${v}</td>`).join("");
  const bodyHtml = rows
    .map(([t, v, mn, mx]) =>
      `<tr><td>${t}</td><td>${v}</td><td>${mn}</td><td>${mx}</td>${factorTds}</tr>`)
    .join("\n");

  const cols =
    '<col style="width:9.6mm">'.repeat(4) +
    '<col style="width:8mm">'.repeat(nFactors);

  const titleLines = [
    `State of ${state}`,
    company,
    pick(programLines),
    pick(factorLines),
    ...(hasEffDate ? [`Effective ${effDate}`] : []),
  ];

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 216mm; height: 278mm; position: relative; }
  .exhibit { position: absolute; top: 7mm; right: 8mm; font-size: ${pt(6.5)}; }
  .title { text-align: center; font-weight: bold; font-size: ${pt(6.5)}; padding-top: 15mm;
           line-height: 1.45; }
  table { border-collapse: collapse; table-layout: fixed; margin: 3mm auto 0; }
  th, td { border: 0.35pt solid #7f7f7f; font-size: ${pt(4.5)}; text-align: center;
           overflow: hidden; padding: 0; }
  th { font-weight: normal; font-size: ${pt(4.4)}; line-height: 1.15; padding: 0.8pt 0;
       vertical-align: middle; white-space: nowrap; border-bottom: 0.9pt solid #000; }
  td { height: ${(2.0 * fs).toFixed(2)}mm; line-height: 1; }
  .footer { position: absolute; bottom: 5mm; right: 8mm; font-size: ${pt(6.5)}; }
  </style></head><body>
  <div class="exhibit">Exhibit ${exhibitNo}</div>
  <div class="title">${titleLines.join("<br>")}</div>
  <table><colgroup>${cols}</colgroup>
  <tr>${headHtml}</tr>
  ${bodyHtml}</table>
  <div class="footer">Page ${pageNo} of ${pageTot}</div>
  </body></html>`;

  // ---------- GT (logical flat table, byte-identical values) ----------
  const gtHead = [...keyCols, ...factorCols].map(([, g]) => `    <th>${g}</th>`).join("\n");
  const gtFactorTds = colVals.map((v) => `    <td>${v}</td>`).join("\n");
  const gt = "<table>\n  <tr>\n" + gtHead + "\n  </tr>\n"
    + rows.map(([t, v, mn, mx]) =>
        `  <tr>\n    <td>${t}</td>\n    <td>${v}</td>\n    <td>${mn}</td>\n    <td>${mx}</td>\n${gtFactorTds}\n  </tr>`)
      .join("\n")
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
