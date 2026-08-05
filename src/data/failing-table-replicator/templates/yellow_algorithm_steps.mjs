// FAMILY generator: auto rate-filing algorithm exhibit — stacked mini-tables in
// the top portion of a US-Letter page. Top table black-on-white with a boxed
// checkbox 'X', a boxed 2-line percent-of-premium cell and a boxed '0 places'
// cell. Below it, 2-3 sibling algorithm tables (identical schema, different
// coverage label) with bright-yellow fill bands, RED underlined hyperlink-styled
// text, black borders ONLY around the algorithm-step and round-to columns, step
// letters A.., and (quirk) a clipped mid-word final step. Seed-varied structure:
// step count 4-7, sibling count 2-3, headerless-continuation sibling, header
// label synonyms, font scale +/-10%, digit saturation, caption/date wording.
// GT = (1 + nSib) tables, ~43-90 cells, label rowspan merges only.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const esc = (s) => s.replace(/&/g, "&amp;");
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };

  // ---------- structural knobs (seed-driven) ----------
  const nSteps = 4 + Math.floor(rng() * 4);          // 4..7 algorithm rows (base 5, +/-20-40%)
  const nSib = 2 + (rng() < 0.4 ? 1 : 0);            // 2 or 3 yellow sibling tables
  const k = 0.9 + rng() * 0.2;                        // font/geometry scale +/-10%
  const fs = (10 * k).toFixed(2);                     // base font size, pt
  const fsSm = (9 * k).toFixed(2);
  const fsBox = (9.5 * k).toFixed(2);
  const rowH = (4.3 * k).toFixed(2);
  const w = (mm) => (mm * k).toFixed(1) + "mm";       // scaled column widths
  const marginL = Math.min(20, 215.9 - 175 * k - 3).toFixed(1);
  const gapA = (5 + rng() * 3).toFixed(1);            // gap above first sibling
  const gapB = (8 + rng() * 4).toFixed(1);            // gap between siblings

  // ---------- quirk probabilities (seed-driven) ----------
  const clipLast = rng() < 0.7;                       // Excel-export mid-word truncation
  const pZero = 0.08 + rng() * 0.27;                  // chance a step rounds to 0 places
  const headerlessLast = nSib === 3 && rng() < 0.35;  // continuation block w/o header row
  const showDate = rng() < 0.55;

  // ---------- fictional furniture pools (no real-world identifiers) ----------
  const company = pick([
    "Crestline Preferred Insurance Company",
    "Bluegrain Interstate Insurance Company",
    "Harborwick Mutual Casualty Company",
    "Pinebrook & Vale Insurance Company",
    "Quartzline Select Insurance Company",
    "Tallgrass Union Indemnity Company",
    "Silver Fir National Insurance Company",
    "Marrow Point Casualty Insurance Company",
  ]);
  const exNo = 1 + Math.floor(rng() * 5);
  const exLtr = pick(["A", "B", "C", "D", "E", "F"]);
  const exhibit = pick([
    `Exhibit ${exNo} - Section ${exLtr}`,
    `Exhibit ${exNo} - Page ${1 + Math.floor(rng() * 9)}`,
    `Attachment ${exLtr}-${exNo}`,
    `Exhibit ${exLtr}, Sheet ${exNo}`,
    `Rate Section ${exNo} - Exhibit ${exLtr}`,
    `Exhibit ${exNo}${exLtr}`,
  ]);
  const yr = pick([2003, 2005, 2006, 2008, 2011, 2013, 2016, 2018]);
  const mo = String(1 + Math.floor(rng() * 12)).padStart(2, "0");
  const dateLine = pick([
    `Effective ${mo}/01/${yr}`,
    `Edition ${mo}-${String(yr).slice(2)}`,
    `Revised ${mo}/15/${yr}`,
    `Proposed Effective ${mo}/01/${yr}`,
    `Filing Edition ${yr}`,
    `New Business ${mo}/01/${yr}`,
  ]);
  const pageNo = 2 + Math.floor(rng() * 9);

  // header label synonyms (used identically in render and GT)
  const hdesc = pick([
    "Algorithm Steps",
    "Rating Algorithm Steps",
    "Calculation Steps",
    "Algorithm Sequence",
    "Premium Calculation Steps",
    "Order of Calculation",
  ]);
  const hrnd = pick([
    "Round to X Places",
    "Rounding - X Places",
    "Round to # Places",
    "Rounded to X Places",
    "Round X Places",
    "Decimal Places",
  ]);

  // Top mini-table: two-line wrapped coverage label + boxed % description
  const topLabel = pick([
    ["Hired / Borrowed", "Coverage"],
    ["Named / Nonowner", "Coverage"],
    ["Employer / Nonowned", "Coverage"],
    ["Leased / Nonowned", "Coverage"],
    ["Garage / Nonowned", "Coverage"],
    ["Occasional / Nonowned", "Coverage"],
    ["Furnished / Borrowed", "Coverage"],
  ]);
  const pct = pick(["1%", "1.5%", "2%", "2.5%", "3%", "4%", "5%"]);
  const basePrem = pick([
    "Fully Developed BI/PD",
    "Fully Developed Comp/Coll",
    "Fully Earned Liability",
    "Total Developed Physical Damage",
    "Combined Single Limit",
    "Fully Developed Liability & PD",
  ]);
  const topDescL1 = `${pct} of ${basePrem} premium for`;
  const [topDescL2, topDescL2Html] = pick([
    ["each coverage at a policy level", "each coverage at <u>a policy</u> level"],
    ["each applicable coverage at a policy level", "each applicable coverage at <u>a policy</u> level"],
    ["each coverage on a per policy basis", "each coverage on a <u>per policy</u> basis"],
    ["each elected coverage at the policy level", "each elected coverage at <u>the policy</u> level"],
  ]);
  const topDescGT = `${topDescL1} ${topDescL2}`;

  // Sibling coverages (identical algorithm blocks, real-family quirk)
  const covs = shuffle([
    "Towing Assistance", "Rental Reimbursement", "Roadside Service",
    "Trip Interruption", "Loan/Lease Gap", "Custom Equipment",
    "Extended Transportation", "Key Replacement", "Glass Repair",
    "Audio Equipment", "Pet Injury", "Original Parts",
  ]).slice(0, nSib);

  // Algorithm chain A..; middle steps multiply factors; last step is a
  // summary line, usually pre-clipped mid-word (Excel-export truncation quirk).
  const factors = shuffle([
    "TERM", "TERRITORY", "POLICY TERM", "VEHICLE RATING - SYMBOLS",
    "MODEL YEAR - AGE GROUP", "DRIVER CLASS - POINTS", "INCREASED LIMITS",
    "DEDUCTIBLE", "COVERAGE OPTION", "ANNUAL MILEAGE", "USAGE TYPE",
    "SAFE DRIVER", "MULTI-CAR", "GARAGING ZONE",
  ]).slice(0, nSteps - 2);
  const lastStep = clipLast
    ? pick([
        "SUBTRACT CREDITS & ADD POLICY SURCHAR",
        "APPLY DISCOUNTS & ADD EXPENSE CONSTAN",
        "SUBTRACT DISCOUNTS & ADD FILED SURCHA",
        "LESS DISCOUNTS PLUS APPLICABLE SURC",
        "ADD FEES & SUBTRACT PROGRAM CRED",
        "APPLY CAPPING & ADD INSTALLMENT CHAR",
      ])
    : pick([
        "SUBTRACT CREDITS & ADD POLICY SURCHARGES",
        "APPLY DISCOUNTS & ADD EXPENSE CONSTANT",
        "SUBTRACT DISCOUNTS & ADD FILED SURCHARGES",
        "ADD FEES & SUBTRACT PROGRAM CREDITS",
      ]);
  const dMain = pick(["2", "3", "3", "3", "4"]); // identical-value saturation
  const letters = "ABCDEFGH";
  const steps = [];
  for (let i = 0; i < nSteps; i++) {
    const L = letters[i];
    const dg = i > 0 && rng() < pZero ? "0" : dMain;
    let txt;
    if (i === 0) txt = "BASE RATE";
    else if (i === nSteps - 1) txt = lastStep;
    else txt = `${letters[i - 1]} x ${factors[i - 1]} FACTOR`;
    steps.push([L, txt, dg]);
  }

  const yTable = (label, headerless) => `<table class="yt">
<colgroup><col style="width:${w(52)}"><col style="width:${w(14)}"><col style="width:${w(75)}"><col style="width:${w(34)}"></colgroup>
${headerless ? "" : `<tr><td></td><td></td><th class="hdesc">${esc(hdesc)}</th><th class="hrnd">${esc(hrnd)}</th></tr>\n`}${steps.map(([L, txt, dg], i) =>
  `<tr>${i === 0 ? `<td class="lbl" rowspan="${nSteps}">${esc(label)}</td>` : ""}<td class="ltr">${L}</td><td class="desc"><span class="u">${esc(txt)}</span></td><td class="rnd"><span class="u dg">${dg}</span><span class="u pl">places</span></td></tr>`
).join("\n")}
</table>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 215.9mm; height: 276mm; position: relative; font-size: ${fs}pt; }
  .cap { text-align: right; padding-top: 8mm; margin: 0 21mm 0 0; font-size: ${fs}pt; }
  .cap .dt { display: block; font-size: ${fsSm}pt; }
  table { border-collapse: collapse; table-layout: fixed; margin-left: ${marginL}mm; }
  td, th { font-size: ${fs}pt; font-weight: normal; text-align: left; padding: 0 1mm; height: ${rowH}mm; overflow: hidden; white-space: nowrap; }
  /* top mini-table: black on white, isolated boxed cells */
  .top { margin-top: 1.5mm; }
  .top .tl { font-weight: bold; }
  .top .hdesc2 { font-weight: bold; text-align: center; }
  .top .hrnd2 { font-weight: bold; text-align: center; font-size: ${fsSm}pt; }
  .top .chk { text-align: right; padding-right: 2.5mm; vertical-align: top; }
  .top .box { display: inline-block; border: 1pt solid #000; padding: 0 1.1mm; font-size: ${fsBox}pt; }
  .top .ltr2 { text-align: center; vertical-align: top; }
  .top .desc2 { border: 1pt solid #000; white-space: normal; font-size: ${fs}pt; line-height: 1.18; padding: 0.2mm 1mm; }
  .top .rnd2 { border: 1pt solid #000; vertical-align: top; font-size: ${fsBox}pt; }
  .top .rnd2 .dg2 { margin-left: 7mm; }
  .top .rnd2 .pl2 { margin-left: 6mm; }
  /* yellow sibling tables: fill band, red underlined text, borders only on desc/rnd cols */
  .yt td, .yt th { background: #ffff00; color: #f00; }
  .yt { margin-top: ${gapA}mm; }
  .yt + .yt { margin-top: ${gapB}mm; }
  .yt .hdesc { font-weight: bold; text-align: center; text-decoration: underline; }
  .yt .hrnd { font-weight: bold; text-align: center; text-decoration: underline; font-size: ${fsSm}pt; }
  .yt .lbl { font-weight: bold; vertical-align: top; text-decoration: underline; }
  .yt .ltr { text-align: center; text-decoration: underline; }
  .yt .desc, .yt .rnd { border: 1pt solid #000; }
  .yt .u { text-decoration: underline; }
  .yt .rnd .dg { margin-left: 7mm; }
  .yt .rnd .pl { margin-left: 6mm; }
  .footer { position: absolute; bottom: 8mm; left: 21mm; right: 21mm; font-size: ${fs}pt;
            display: flex; justify-content: space-between; }
  </style></head><body>
  <div class="cap">${esc(exhibit)}${showDate ? `<span class="dt">${esc(dateLine)}</span>` : ""}</div>
  <table class="top">
  <colgroup><col style="width:${w(42)}"><col style="width:${w(13)}"><col style="width:${w(11)}"><col style="width:${w(75)}"><col style="width:${w(34)}"></colgroup>
  <tr><td class="tl">${topLabel[0]}</td><td></td><td></td><th class="hdesc2">${esc(hdesc)}</th><th class="hrnd2">${esc(hrnd)}</th></tr>
  <tr><td class="tl">${topLabel[1]}</td><td class="chk"><span class="box">X</span></td><td class="ltr2">A</td><td class="desc2">${esc(topDescL1)}<br>${topDescL2Html}</td><td class="rnd2"><span class="dg2">0</span><span class="pl2">places</span></td></tr>
  </table>
  ${covs.map((c, i) => yTable(c, headerlessLast && i === nSib - 1)).join("\n  ")}
  <div class="footer"><span>${esc(company)}</span><span>${pageNo}</span></div>
  </body></html>`;

  // Logical GT: 1 + nSib tables. Top: 5 cols, 9 cells, label rowspan=2.
  // Each sibling: 4 cols, 4 (header, unless headerless) + 3*nSteps + 1 cells,
  // label rowspan=nSteps. Wrapped texts fold to single cells with spaces.
  const gtSteps = (label) =>
    steps.map(([L, txt, dg], i) =>
      `  <tr>\n${i === 0 ? `    <td rowspan="${nSteps}">${esc(label)}</td>\n` : ""}    <td>${L}</td>\n    <td>${esc(txt)}</td>\n    <td>${dg} places</td>\n  </tr>`
    ).join("\n");
  const gtSibling = (label, headerless) =>
    `<table>\n${headerless ? "" : `  <tr>\n    <td></td>\n    <td></td>\n    <th>${esc(hdesc)}</th>\n    <th>${esc(hrnd)}</th>\n  </tr>\n`}${gtSteps(label)}\n</table>`;
  const gt =
    `<table>\n  <tr>\n    <td rowspan="2">${topLabel[0]} ${topLabel[1]}</td>\n    <td></td>\n    <td></td>\n    <th>${esc(hdesc)}</th>\n    <th>${esc(hrnd)}</th>\n  </tr>\n  <tr>\n    <td>X</td>\n    <td>A</td>\n    <td>${esc(topDescGT)}</td>\n    <td>0 places</td>\n  </tr>\n</table>`
    + covs.map((c, i) => "\n\n" + gtSibling(c, headerlessLast && i === nSib - 1)).join("");

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
