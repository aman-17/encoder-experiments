// FAMILY generator (training data) modeled on a SERFF-style Medicare Supplement
// rate page: 2-3 narrow boxed twin (Age | premium) cohort lists in the left
// portion of a portrait page, right side mostly empty. Each list has a detached
// boxed multi-line date-cohort caption, a detached boxed 2-cell header, then the
// data box with a center rule and an underline after every k-th data row.
// Free-text title stack above, "Please refer to ..." notes under each list,
// rate-conversion paragraph at the bottom.
//
// Seed-varied structure: panel count (2-3), data-row count (~22-42), start age,
// header-label wording, title/mode wording, cohort cutoff dates, filing-code
// pools, font scale (±10%), geometry, and quirk toggles (periodic underlines,
// spacer pad row, premium plateaus, "N+" last age). All company names, states,
// dates and filing codes are drawn from fictional pools (no eval-page strings).
//
// GT = ONE logical 2-col table serializing the panels top-to-bottom; each
// panel contributes 1 merged caption cell + 2 header cells + rows*2 data cells.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const r5 = (c) => Math.round(c / 5) * 5;
  const mm = (x) => `${x.toFixed(2)}mm`;
  const pt = (x) => `${x.toFixed(2)}pt`;

  // ---------- identity pools (all fictional) ----------
  const companies = [
    "PIONEER MUTUAL BENEFIT INSURANCE COMPANY",
    "GRANITE PEAK SENIOR LIFE INSURANCE COMPANY",
    "MERIDIAN HARBOR LIFE INSURANCE COMPANY",
    "CORNERSTONE UNION MUTUAL INSURANCE COMPANY",
    "BLUE HERON ASSURANCE COMPANY",
    "SILVER BIRCH LIFE & HEALTH INSURANCE COMPANY",
    "OAKMONT GUARANTY LIFE INSURANCE COMPANY",
    "NORTH LANTERN BENEFIT INSURANCE COMPANY",
  ];
  const states = [
    ["Ohio", "OH"], ["Georgia", "GA"], ["Missouri", "MO"], ["Arizona", "AZ"],
    ["Colorado", "CO"], ["Tennessee", "TN"], ["Indiana", "IN"], ["Oregon", "OR"],
  ];
  const company = pick(companies);
  const [stateName, stateAb] = pick(states);
  const plan = pick(["A", "B", "C", "D", "F", "G", "K", "L", "N"]);
  const titleYear = 2008 + Math.floor(rng() * 10);
  const titleLine = pick(["Table of Rates", "Schedule of Rates", "Rate Schedule", "Premium Rate Table"]);
  const productLine = pick(["Medicare Supplement Policy", "Medicare Supplement Insurance", "Medicare Supplement Plan"]);
  const modeNoun = pick(["Automatic Bank Withdrawal", "Automatic Bank Draft", "Preauthorized Bank Withdrawal", "Electronic Funds Withdrawal"]);
  const premLabel = pick(["Base Premiums", "Base Annual Premiums", "Standard Base Premiums"]);
  const monthlyAdd = pick([2, 3, 4, 5]);

  // ---------- panel structure + cohort cutoff dates (fictional years) ----------
  const nPanels = rng() < 0.6 ? 2 : 3;
  const cutPairs = [
    ["Jan 31", "Feb 1"], ["Mar 31", "Apr 1"], ["Apr 30", "May 1"],
    ["Jun 30", "Jul 1"], ["Aug 31", "Sep 1"], ["Sep 30", "Oct 1"], ["Oct 31", "Nov 1"],
  ];
  const y1 = 1996 + Math.floor(rng() * 7);
  const [cutPrior1, cutAfter1] = pick(cutPairs);
  let capLinesArr; // array (per panel) of caption line arrays
  if (nPanels === 2) {
    capLinesArr = [
      ["ISSUES PRIOR", "TO", `${cutPrior1}, ${y1}`],
      ["ISSUES ON OR", "AFTER", `${cutAfter1}, ${y1}`],
    ];
  } else {
    const y2 = y1 + 3 + Math.floor(rng() * 5);
    const [cutPrior2, cutAfter2] = pick(cutPairs);
    capLinesArr = [
      ["ISSUES", "PRIOR TO", `${cutPrior1}, ${y1}`],
      ["ISSUES ON OR", `AFTER ${cutAfter1}, ${y1}`, "AND PRIOR TO", `${cutPrior2}, ${y2}`],
      ["ISSUES ON", "OR AFTER", `${cutAfter2}, ${y2}`],
    ];
  }

  // ---------- header-label pool (col B may wrap onto 2 lines) ----------
  const hdrPool = [
    [["Age"], ["Attained", "Age"]],
    [["Age"], ["Attained Age", "Premium"]],
    [["Age"], ["Annual", "Premium"]],
    [["Age"], ["Premium"]],
    [["Attained", "Age"], ["Premium"]],
    [["Age"], ["Rate"]],
  ];
  const hdr = pick(hdrPool);

  // ---------- font scale + geometry jitter ----------
  const f = 0.9 + rng() * 0.2;          // font size ±10%
  const leftM = 15 + rng() * 6;         // mm
  const titleTop = 14 + rng() * 6;
  // title stack: 9 lines at 1.35 line-height + 2 paragraph margins, then a gap
  const twinsTop = titleTop + 41 * f + 2 + rng() * 6;
  const bottomTop = 264 + rng() * 7;
  const twinW = 25 + rng() * 3.5;
  const ageW = 8.5 + rng() * 1.5;
  const gapW = 4.5 + rng() * 2.5;
  const lineMM = 3.67 * f;
  const capLines = nPanels === 3 ? 4 : 3;
  const capH = capLines * lineMM + 2.6 * f;
  const headerH = 10.5 * f;
  const rowH = 3.95 * f;

  // ---------- quirk toggles ----------
  const padRow = rng() < 0.9;                     // blank spacer row atop data box
  const padH = padRow ? 4.2 * f : 0;
  const uKeep = rng() < 0.85;                     // periodic underline rows
  const uStart = 2 + Math.floor(rng() * 3);       // first underlined data index
  const uInt = pick([4, 5, 6]);                   // underline interval
  const lastPlus = rng() < 0.25;                  // final age rendered "N+"
  const plateau = rng() < 0.3;                    // identical-premium runs

  // ---------- notes ("Please refer to ...") ----------
  const notesPer = Array.from({ length: nPanels }, () => 1);
  if (rng() < 0.7) notesPer[nPanels - 1] += 1;
  if (rng() < 0.25) notesPer[nPanels - 1] += 1;
  const prefixes = [`CORE-${stateAb}`, "AREA-STD", "TOBACCO-STD", `SELECT-${stateAb}`, "AREA-FCT", `RATE-${stateAb}`];
  for (let i = prefixes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [prefixes[i], prefixes[j]] = [prefixes[j], prefixes[i]];
  }
  const codeTail = () =>
    String(1 + Math.floor(rng() * 12)).padStart(2, "0") +
    String(1 + Math.floor(rng() * 28)).padStart(2, "0") +
    String(94 + Math.floor(rng() * 16)).slice(-2);
  const refTexts = ["for areas and factors", "for area factors", "for applicable rating factors"];
  let codeIdx = 0;
  const noteTexts = notesPer.map((n) =>
    Array.from({ length: n }, () => `Please refer to ${prefixes[codeIdx++ % prefixes.length]}-${codeTail()} ${pick(refTexts)}.`));
  const maxNotes = Math.max(...notesPer);

  // ---------- row count: jittered, capped by age 99 and by page fit ----------
  const startAge = pick([60, 62, 64, 65]);
  const notesH = maxNotes * 19 * f;               // conservative wrap estimate
  const avail = bottomTop - 5 - twinsTop - (capH + 2 + headerH + 2 + padH + 1 + notesH);
  const maxRows = Math.floor(avail / rowH);
  const rowsWanted = 22 + Math.floor(rng() * 21); // 22-42 before caps
  const rows = Math.max(Math.min(rowsWanted, 99 - startAge + 1, maxRows), 18);
  const ages = Array.from({ length: rows }, (_, i) => startAge + i);
  const ageLabel = (i) => (lastPlus && i === rows - 1) ? `${ages[i]}+` : String(ages[i]);

  // ---------- premiums (cents, multiples of 5); later cohorts cheaper ----------
  let v = r5(11000 + Math.floor(rng() * 14000));
  const base = [];
  for (let i = 0; i < rows; i++) {
    base.push(v);
    let step = r5(300 + rng() * 520);
    if (rng() < 0.1) step += r5(150 + rng() * 150); // occasional bigger jump
    if (plateau && rng() < 0.18) step = 0;          // rate-plateau quirk
    v += step;
  }
  const prem = Array.from({ length: nPanels }, () => null);
  prem[nPanels - 1] = base;
  for (let j = nPanels - 2; j >= 0; j--) {
    const g0 = r5(1300 + Math.floor(rng() * 1700));
    const gs = pick([5, 10, 15, 20]); // gap narrows slowly down the ages
    prem[j] = prem[j + 1].map((c, i) => c + Math.max(g0 - i * gs, 5));
  }
  const money = (c) => `$${(c / 100).toFixed(2)}`;

  // ---------- HTML ----------
  const dataRows = (p) => ages.map((_, i) => {
    const u = uKeep && i >= uStart && (i - uStart) % uInt === 0 && i !== rows - 1 ? ' class="u"' : "";
    return `<tr${u}><td class="age">${ageLabel(i)}</td><td class="prem">${money(p[i])}</td></tr>`;
  }).join("\n");

  const twin = (k) => `
  <div class="twin">
    <div class="cap">${capLinesArr[k].join("<br>")}</div>
    <table class="hbox"><tr><td class="ha">${hdr[0].join("<br>")}</td><td class="hp">${hdr[1].join("<br>")}</td></tr></table>
    <div class="dbox"><table class="dtab">
${padRow ? `      <tr class="padrow"><td class="age"></td><td class="prem"></td></tr>\n` : ""}${dataRows(prem[k])}
    </table></div>
    ${noteTexts[k].map((t, i) => `<div class="note${i > 0 ? " nx" : ""}">${t}</div>`).join("\n    ")}
  </div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 210mm; height: 296mm; position: relative; font-size: ${pt(8 * f)}; }
  .titles { position: absolute; top: ${mm(titleTop)}; left: ${mm(leftM)}; line-height: 1.35; }
  .titles p { margin: 0 0 ${mm(3.2 * f)} 0; }
  .twins { position: absolute; top: ${mm(twinsTop)}; left: ${mm(leftM)}; display: flex; gap: ${mm(gapW)}; }
  .twin { width: ${mm(twinW)}; }
  .cap { border: 0.7pt solid #000; text-align: center; line-height: 1.3;
         padding-top: ${mm(1 * f)}; height: ${mm(capH)}; box-sizing: border-box; }
  .hbox { border-collapse: collapse; table-layout: fixed; width: ${mm(twinW)}; height: ${mm(headerH)}; margin-top: 2mm; }
  .hbox td { border: 0.7pt solid #000; vertical-align: top; text-align: center;
             line-height: 1.25; padding-top: 0.6mm; }
  .ha { width: ${mm(ageW)}; }
  .dbox { border: 0.7pt solid #000; margin-top: 2mm; }
  .dtab { border-collapse: collapse; table-layout: fixed; width: 100%; }
  .dtab td { height: ${mm(rowH)}; padding: 0; font-size: ${pt(8 * f)}; }
  .dtab tr.padrow td { height: ${mm(4.2 * f)}; }
  td.age { width: ${mm(ageW)}; border-right: 0.7pt solid #000; text-align: center; }
  td.prem { text-align: right; padding-right: 1.3mm; }
  tr.u td { border-bottom: 0.7pt solid #000; }
  .note { margin-top: 1.6mm; line-height: 1.25; }
  .nx { margin-top: ${mm(4.5 * f)}; }
  .bottom { position: absolute; top: ${mm(bottomTop)}; left: ${mm(leftM)}; width: ${mm(118 + rng() * 12)}; line-height: 1.3; }
  .pg { position: absolute; bottom: 6mm; right: 15mm; }
  </style></head><body>
  <div class="titles">
    <p>${company}<br>${titleLine}<br>${productLine}</p>
    <p>Plan ${plan}<br>${stateName}<br>${titleYear}</p>
    <p>${modeNoun}<br>${premLabel}</p>
  </div>
  <div class="twins">
${Array.from({ length: nPanels }, (_, k) => twin(k)).join("\n")}
  </div>
  <div class="bottom">To obtain Monthly rates, add $${monthlyAdd} to the above quoted ${modeNoun} rates. To obtain Quarterly, Semi-Annual, and Annual rates, multiply the above quoted ${modeNoun} by 3, 6 and 12 respectively.</div>
  <div class="pg">Page 1 of 1</div>
  </body></html>`;

  // ---------- logical GT: single 2-col table, panels serialized ----------
  const hdrGtA = hdr[0].join(" ");
  const hdrGtB = hdr[1].join(" ");
  const block = (k) =>
    `  <tr>\n    <th colspan="2">${capLinesArr[k].join(" ")}</th>\n  </tr>\n` +
    `  <tr>\n    <th>${hdrGtA}</th>\n    <th>${hdrGtB}</th>\n  </tr>\n` +
    ages.map((_, i) => `  <tr>\n    <td>${ageLabel(i)}</td>\n    <td>${money(prem[k][i])}</td>\n  </tr>`).join("\n");
  const gt = "<table>\n"
    + Array.from({ length: nPanels }, (_, k) => block(k)).join("\n")
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
