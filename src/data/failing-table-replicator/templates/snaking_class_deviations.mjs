// FAMILY GENERATOR — workers-comp class-code deviation page (modeled on a SERFF-style
// state filing exhibit). N side-by-side (Class Code | Deviation Factor) pairs, full thin
// grid, gray 2-line headers, column-major snake fill, blank spacer rows every few data
// rows, xlsx print footer. GT = ONE logical 2-col table in snake order.
//
// Training-data mode: every structural knob is seed-driven (pair count 6-8, logical row
// count ~250-460, spacer-group size + presence, identical-value saturation, deviated-
// factor palette, header label wording, title/state/company/date pools, font scale ±10%).
// All company names / states / workbook filenames are FICTIONAL pools; no identifiers
// from the real eval page remain. GT cells = 2*(rows+1), ~500-930 across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);

  // ---- identity pools (all fictional) ----
  const companies = [
    ["Pinehurst Compensation Insurance Company", "PCI"],
    ["Granite Shield Mutual Insurance Co.", "GSM"],
    ["Meridian Basin Casualty Company", "MBC"],
    ["Bluewater Indemnity Corporation", "BWI"],
    ["Ironvale Assurance Company", "IVA"],
    ["Cascade Fork Employers Insurance Co.", "CFE"],
    ["Harborline Mutual Casualty Company", "HMC"],
    ["Silver Fir Insurance Exchange", "SFX"],
  ];
  const states = [
    ["Nevada", "NV"], ["Arizona", "AZ"], ["Oregon", "OR"], ["Colorado", "CO"],
    ["Utah", "UT"], ["Idaho", "ID"], ["Montana", "MT"], ["New Mexico", "NM"],
  ];
  const [company, coCode] = companies[Math.floor(rng() * companies.length)];
  const [state, stAbbr] = states[Math.floor(rng() * states.length)];

  const subtitlePool = [
    `${state} Class Deviations`,
    `${state} Classification Deviations`,
    `${state} Class Code Deviations`,
    `${state} Deviations by Class Code`,
    `${state} Workers Compensation Class Deviations`,
  ];
  const subtitle = subtitlePool[Math.floor(rng() * subtitlePool.length)];

  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const month = months[Math.floor(rng() * 12)];
  const year = 2019 + Math.floor(rng() * 9);
  const effPool = [
    `Effective ${month} 1, ${year} on New and Renewal Policies`,
    `Effective ${month} 1, ${year} for New and Renewal Business`,
    `Applicable to New and Renewal Policies Effective ${month} 1, ${year}`,
    `Effective ${month} 1, ${year}`,
  ];
  const title3 = effPool[Math.floor(rng() * effPool.length)];

  // ---- structural knobs (seed-driven) ----
  const fontScale = 0.92 + rng() * 0.18;             // ±~10% font size
  const useSpacers = rng() < 0.85;                    // blank spacer rows quirk
  const groupBase = 4 + Math.floor(rng() * 3);        // 4-6 data rows per block
  const groupJitterP = 0.25 + rng() * 0.35;
  const PAIRS = 6 + Math.floor(rng() * 3);            // 6-8 side-by-side pairs
  const satur = 0.80 + rng() * 0.15;                  // identical-value saturation

  // fit budget: bound logical rows so one A4 page never overflows
  const rowMm = (8.5 * fontScale + 1.8) * 0.3528;     // physical data-row height
  const usableMm = 248 - 15 * fontScale;              // page minus title/footer/header
  const maxPhys = Math.floor(usableMm / rowMm) - 2;
  const spacerRatio = useSpacers ? (groupBase + 0.5) / (groupBase + 1.5) : 1;
  const maxPerPair = Math.floor(maxPhys * spacerRatio);
  const maxLogical = Math.min(PAIRS * maxPerPair, 660);
  const nLogical = Math.min(maxLogical,
    250 + Math.floor(rng() * Math.max(20, maxLogical - 250)));

  // ---- logical rows: ascending 4-digit class codes, mostly-identical factors ----
  const devSets = [
    ["0.950", "0.900", "0.850", "0.800"],
    ["0.975", "0.950", "0.925", "0.900"],
    ["0.900", "0.850", "0.750"],
    ["1.050", "0.950", "0.900", "0.850"],
    ["0.960", "0.920", "0.880", "0.840"],
    ["0.940", "0.890", "0.830"],
  ];
  const devSet = devSets[Math.floor(rng() * devSets.length)];
  const avgStep = Math.max(3, Math.floor(9300 / nLogical));
  const rows = [];
  let code = 5 + Math.floor(rng() * 40);
  for (let i = 0; i < nLogical && code <= 9900; i++) {
    const factor = rng() < satur ? "1.000" : devSet[Math.floor(rng() * devSet.length)];
    rows.push([String(code).padStart(4, "0"), factor]);
    code += 1 + Math.floor(rng() * (rng() < 0.75 ? Math.ceil(1.5 * avgStep) : 3 * avgStep));
  }

  // ---- physical layout plan: column-major snake with optional spacer rows ----
  const perPair = Math.ceil(rows.length / PAIRS);
  const plan = []; // logical offset within pair, or -1 for spacer row
  if (useSpacers) {
    let k = 0;
    while (k < perPair) {
      if (k > 0) plan.push(-1);
      const g = Math.min(groupBase + (rng() < groupJitterP ? 1 : 0), perPair - k);
      for (let j = 0; j < g; j++) plan.push(k++);
    }
  } else {
    for (let k = 0; k < perPair; k++) plan.push(k);
  }

  let body = "";
  for (const k of plan) {
    body += "<tr>";
    for (let pi = 0; pi < PAIRS; pi++) {
      if (k < 0) { body += "<td></td><td></td>"; continue; }
      const rowv = rows[pi * perPair + k];
      body += rowv ? `<td class="c">${rowv[0]}</td><td class="f">${rowv[1]}</td>`
                   : "<td></td><td></td>";
    }
    body += "</tr>\n";
  }

  // ---- headers (wrapped visually; single logical cell in GT) ----
  const headerPool = [
    { v1: "Class<br>Code", v2: "Deviation<br>Factor", g1: "Class Code", g2: "Deviation Factor" },
    { v1: "Class<br>Code", v2: "Deviation<br>Factor", g1: "Class Code", g2: "Deviation Factor" },
    { v1: "Class<br>Code", v2: "Dev.<br>Factor", g1: "Class Code", g2: "Dev. Factor" },
    { v1: "Code", v2: "Deviation<br>Factor", g1: "Code", g2: "Deviation Factor" },
    { v1: "Class<br>Code", v2: "Factor", g1: "Class Code", g2: "Factor" },
    { v1: "Class", v2: "Deviation", g1: "Class", g2: "Deviation" },
  ];
  const hdr = headerPool[Math.floor(rng() * headerPool.length)];
  const headCells = Array.from({ length: PAIRS }, () =>
    `<th>${hdr.v1}</th><th>${hdr.v2}</th>`).join("");

  // ---- footer (fictional workbook names) ----
  const dept = ["Actuarial", "Rating", "Pricing", "Filing Support", "Actuarial Services",
    "Underwriting"][Math.floor(rng() * 6)];
  const mm = String(1 + Math.floor(rng() * 12)).padStart(2, "0");
  const fnamePool = [
    `${stAbbr} ${coCode} Rates and Deviations ${year} ${mm} 01.xlsx`,
    `${coCode} ${stAbbr} Class Dev Factors ${year}.xlsx`,
    `${stAbbr} deviation worksheet ${year}-${mm}.xlsx`,
    `${coCode} Class Deviation Workbook ${stAbbr} ${year}.xlsx`,
  ];
  const fname = fnamePool[Math.floor(rng() * fnamePool.length)];
  const ftime = `${1 + Math.floor(rng() * 12)}/${1 + Math.floor(rng() * 28)}/${year} ` +
    `${1 + Math.floor(rng() * 11)}:${String(Math.floor(rng() * 60)).padStart(2, "0")} ` +
    (rng() < 0.5 ? "AM" : "PM");

  // ---- cosmetics (seed-jittered within family look) ----
  const titlePt = (8.5 * fontScale).toFixed(2);
  const tdPt = (6.6 * fontScale).toFixed(2);
  const cellHPt = (8.5 * fontScale).toFixed(2);
  const footPt = (9 * fontScale).toFixed(2);
  const headBg = ["#d9d9d9", "#d4d4d4", "#dedede", "#cfcfcf"][Math.floor(rng() * 4)];
  const borderPt = (0.5 + rng() * 0.2).toFixed(2);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 210mm; height: 296mm; position: relative; }
  .title { text-align: center; font-weight: bold; font-size: ${titlePt}pt; padding-top: 20mm; line-height: 1.35; }
  table { border-collapse: collapse; margin: 5mm auto 0; }
  th, td { border: ${borderPt}pt solid #000; font-size: ${tdPt}pt; padding: 0.6pt 3.5pt; text-align: center; }
  th { background: ${headBg}; font-weight: bold; line-height: 1.05; padding: 1pt 3.5pt; }
  td { min-width: 9mm; height: ${cellHPt}pt; }
  td.f { text-align: center; }
  .footer { position: absolute; bottom: 9mm; left: 14mm; right: 14mm; font-size: ${footPt}pt;
            display: flex; justify-content: space-between; }
  </style></head><body>
  <div class="title">${company}<br>${subtitle}<br>${title3}</div>
  <table><tr>${headCells}</tr>\n${body}</table>
  <div class="footer"><span>${dept}</span><span>${fname}</span><span>${ftime}</span></div>
  </body></html>`;

  const gt = `<table>\n  <tr>\n    <th>${hdr.g1}</th>\n    <th>${hdr.g2}</th>\n  </tr>\n`
    + rows.map(([c, f]) => `  <tr>\n    <td>${c}</td>\n    <td>${f}</td>\n  </tr>`).join("\n")
    + "\n</table>";

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
