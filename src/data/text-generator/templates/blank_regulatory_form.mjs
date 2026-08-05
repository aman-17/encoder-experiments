// FAMILY generator modeled on a state-DOI "FORMS" page of a rate application.
// A4 landscape, mostly-blank fill-in template: corner header blocks (fictional
// State DOI / Company+Line), bordered 3-panel "Legend of Response Codes" box
// (Category panel = 3 internal enum columns + underlined definition lines),
// then a full-grid 12-col form: 2-tier spanning header, empty Proposed/Current
// item pairs (grey "% Impact" Current cell quirk), tall prose-label rows each
// beside a huge blank answer box, empty bottom third, "Edition | <app title> |
// Page N.x" footer.
// Seed-varied structure: item-pair count (1-3), tall-label rows (3-5, drawn
// from a pool), legend enum lengths (type 4-5, source 4-5, category 9-10),
// header-label synonyms, title/legend/footer wording, font scale +/-10%, and
// quirk toggles (shaded Current cell, spacer rows, footnote sups, tick rows).
// GT = legend table (5 cols) + main table (12 cols), ~85-140 cells.
// All names/regulators/orgs/form titles are FICTIONAL (decontaminated).
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p) => rng() < p;

  // ---- fictional identity pools (>=6 each; no real insurers/regulators) ----
  const states = [
    ["New Cambria", "NCDOI"], ["Westhaven", "WHDI"], ["Alderona", "ADOI"],
    ["Norvale", "NVDI"], ["Merrivale", "MVDI"], ["Elandria", "ELDI"],
    ["Port Caldera", "PCDOI"],
  ];
  const companies = [
    "Ashford Mutual Indemnity and", "Bluecrest Casualty and Surety",
    "Cendrell National Insurance", "Harborlane Fire and",
    "Kestrel Ridge Assurance", "Marrowgate Underwriters and",
    "Tessmark Property and Casualty", "Veralta Insurance Group",
  ];
  const lines = [
    "Commercial Auto", "General Liability", "Commercial Multiple Peril",
    "Homeowners Multiple Peril", "Allied Lines", "Inland Marine",
    "Businessowners", "Professional Liability",
  ];
  const advisoryOrgs = [
    "Interstate Rating Bureau (IRB)", "Meridian Rating Organization (MRO)",
    "Federated Advisory Services Office (FASO)", "Consolidated Rating Bureau (CRB)",
    "Atlas Advisory Rating Bureau (AARB)", "Unified Statistical Rating Office (USRO)",
  ];
  const appTitles = [
    "Prior Review Rate Application", "Rate Filing Application",
    "Application for Rate Approval", "Rate and Form Filing Application",
    "Rate Program Filing", "Form and Rate Review Application",
  ];
  const formsTitles = ["FORMS", "FORMS SCHEDULE", "FORMS EXHIBIT", "POLICY FORMS", "FORMS SECTION", "FORMS SUMMARY"];
  const legendLabels = [
    "Legend of Response Codes", "Response Code Legend", "Key to Response Codes",
    "Legend of Codes", "Response Codes — Legend", "Code Legend",
  ];

  const [stateName, abbr] = pick(states);
  const company = pick(companies);
  const line = pick(lines);
  const advisory = pick(advisoryOrgs);
  const appTitle = pick(appTitles);
  const formsTitle = pick(formsTitles);
  const legendLabel = pick(legendLabels);
  const ed = `${int(1, 12)}/${int(1, 28)}/${int(2018, 2026)} Edition`;
  const pageNo = `Page ${int(5, 14)}.${int(1, 6)}`;

  // ---- structural knobs ----
  const scale = 0.9 + rng() * 0.2;                       // font scale +/-10%
  const fs = (7 * scale).toFixed(2);
  const pr = rng();
  const itemPairs = pr < 0.45 ? 1 : pr < 0.8 ? 2 : 3;    // Proposed/Current pairs
  const stubStart = int(1, 6);
  const tallCount = int(3, 5);                           // prose-label rows
  const useSups = chance(0.8);                           // footnote markers quirk
  const shadeCurrent = chance(0.85);                     // grey % Impact quirk
  const useSpacers = chance(0.85);                       // spacer rows quirk
  const tickRows = tallCount >= 5 ? 1 : int(1, 3);       // trailing blank grid rows

  // ---- legend enums (seed-varied lengths) ----
  const typeMids = ["Endorsement", "Policy"];
  if (chance(0.45)) typeMids.push(pick(["Certificate", "Declarations Page", "Notice"]));
  const typeCodes = ["Application", ...typeMids, "Other (Describe in box below)"]
    .map((t, i) => `(${i + 1}) ${t}`);
  const srcMids = [advisory, "Other Advisory Organization", "Company"];
  if (chance(0.35)) srcMids.push("Reinsurer");
  const sourceCodes = [...srcMids, "Other (Describe in box below)"]
    .map((t, i) => `(${i + 1}) ${t}`);
  const cat1 = ["(1) New, mandatory", "(2) New, optional (required)", "(3) New, optional (elective)"];
  const cat2 = ["(4) Replacement, mandatory", "(5) Replacement, optional (required)", "(6) Replacement, optional (elective)"];
  const cat3 = ["(7) Withdrawn, mandatory", "(8) Withdrawn, optional (required)", "(9) Withdrawn, optional (elective)"];
  if (chance(0.8)) cat3.push("(10) Other (Describe in box below)");
  const defsHtml = [
    pick(["Mandatory - refers to forms that the <u>insurer</u> attaches to all policies.",
          "Mandatory - forms the <u>insurer</u> attaches to every policy issued."]),
    pick(["Optional (required) - refers to forms that the <u>insurer</u> requires be attached to some policies.",
          "Optional (required) - forms the <u>insurer</u> requires on certain policies only."]),
    pick(["Optional (elective) - refers to forms that the <u>insured</u> requests be added to their policy.",
          "Optional (elective) - forms added only at the <u>insured</u>'s request."]),
  ];
  const defsTxt = defsHtml.map((d) => d.replace(/<\/?u>/g, ""));

  // ---- tall prose-label rows: 2 core + picks from a pool ----
  const core = [
    ["Explain Revision/New Form",
     pick(["Provide a summary - when does it attach, how does it broaden or restrict coverage, and why are you seeking to revise or adopt it.",
           "Summarize the form - when it attaches, how coverage is broadened or restricted, and the reason for revising or adopting it."]),
     17],
    ["Premium Determination",
     pick(["(Factor or Charge - $, %, or description) - <b>Any changes or introduction of rates/premium charge must be justified and supported.</b> If additional space is needed submit a supplemental exhibit.",
           "(Factor or Charge - $, %, or description) - <b>All new or revised rates and premium charges must be justified and supported.</b> Attach a supplemental exhibit if additional space is required."]),
     21],
  ];
  const cands = [
    ["Rate Impact",
     pick(["Explain why there is or isn't a rate impact.", "Explain the presence or absence of any rate impact."]), 8],
    ["Rule",
     pick(["If applicable, specify the applicable rule(s) and manual page number(s).",
           "If applicable, identify the governing rule(s) and manual page number(s)."]), 9.5],
    ["Underwriting Impact",
     "Describe any effect on underwriting eligibility, acceptance criteria, or risk classification.", 9],
    ["Forms Superseded",
     "List any forms withdrawn or replaced by this filing, including form numbers and edition dates.", 10],
    ["Supporting Documentation",
     "Identify all exhibits, actuarial memoranda, or manual pages submitted in support of this form.", 9.5],
  ];
  const need = tallCount - 2;
  const chosen = [];
  while (chosen.length < need) {
    const j = int(0, cands.length - 1);
    if (!chosen.includes(j)) chosen.push(j);
  }
  chosen.sort((a, b) => a - b);
  const labels = [...core, ...chosen.map((j) => cands[j])];
  const tallSum = labels.reduce((s, l) => s + l[2], 0);
  const hf = Math.min(1, 62 / tallSum);                  // keep page from overflowing

  // ---- header label pools (12 physical cols, fixed) ----
  const t1a = pick(["Applicable Form", "Form Identification", "Form Information"]);
  const t1b = pick(["Source of Form", "Form Source", "Origin of Form"]);
  const t1c = pick(["Coverage Change Reflects", "Change in Coverage Reflects"]);
  const t1d = pick(["Coverage Change Includes", "Change in Coverage Includes"]);
  const sub = [
    pick(["#", "No."]), pick(["Title", "Form Title"]), "Type", "Source",
    { t: `${abbr} File #`, s: 1 }, { t: "Category", s: 3 },
    { t: pick(["Restriction?", "Restricting?"]), s: 2 },
    pick(["Broadening?", "Broadened?"]), pick(["Rate Impact?", "Rate Effect?"]),
    pick(["% Impact", "% Rate Impact"]),
  ];
  const subHtml = sub.map((c) =>
    typeof c === "string" ? `<th>${c}</th>` : `<th>${c.t}${useSups ? `<sup>${c.s}</sup>` : ""}</th>`).join("");
  const subGt = sub.map((c) => (typeof c === "string" ? c : `${c.t}${useSups ? c.s : ""}`));

  const li = (arr) => arr.map((t) => `<div class="it">${t}</div>`).join("");

  const pairRowsHtml = [];
  for (let i = 0; i < itemPairs; i++) {
    pairRowsHtml.push(
      `      <tr class="d"><td class="stub" rowspan="2">(${stubStart + i})</td><td class="rl">Proposed</td>${"<td></td>".repeat(10)}</tr>`,
      `      <tr class="d"><td class="rl">Current</td>${"<td></td>".repeat(9)}<td${shadeCurrent ? ' class="shade"' : ""}></td></tr>`
    );
  }

  const tallRows = labels.map(([t, p, h], i) =>
    `${i > 0 && useSpacers ? '<tr class="sp"><td class="chan"></td><td colspan="11" class="nb"></td></tr>\n' : ""}` +
    `<tr><td class="chan"></td><td colspan="2" class="lbl" style="height:${(h * hf).toFixed(1)}mm"><b>${t}</b><br>${p}</td><td colspan="9" class="ans"></td></tr>`
  ).join("\n");

  const ticks = Array(tickRows).fill('      <tr class="tick"><td class="chan"></td><td colspan="11" class="nb"></td></tr>').join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 296mm; height: 208mm; position: relative; font-size: ${fs}pt; }
  .wrap { padding: 12mm 13mm 0 13mm; }
  .corner { display: flex; justify-content: space-between; line-height: 1.35; }
  .cl { font-weight: bold; }
  .cr { width: 84mm; }
  .cr .row { display: flex; }
  .cr .lab { font-weight: bold; width: 50mm; }
  .forms { text-align: center; font-weight: bold; font-size: ${(10 * scale).toFixed(2)}pt; margin-top: 4mm; }
  .leglab { font-weight: bold; margin: 8mm 0 1mm 1mm; }
  .legend { display: flex; border: 0.9pt solid #000; }
  .lp { padding-bottom: 1.5mm; }
  .lp1 { width: 20.6%; }
  .lp2 { width: 22.8%; border-left: 0.7pt solid #000; }
  .lp3 { width: 56.6%; border-left: 0.7pt solid #000; }
  .lph { font-weight: bold; border-bottom: 0.7pt solid #000; padding: 0.4mm 0 0.4mm 0.8mm; }
  .it { padding-left: 3.2mm; line-height: 1.32; }
  .catcols { display: flex; }
  .cc1 { width: 33%; } .cc2 { width: 37%; } .cc3 { width: 30%; }
  .defs { margin-top: 1.4mm; }
  .defs .it { line-height: 1.38; }
  table.main { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 3mm; }
  .main td, .main th { border: 0.6pt solid #000; font-size: ${fs}pt; padding: 0.3mm 0.8mm; }
  .main th { font-weight: bold; text-align: center; }
  .main sup { font-size: ${(4.6 * scale).toFixed(2)}pt; }
  tr.h td, tr.h th { height: 3.4mm; }
  tr.d td { height: 3.6mm; }
  td.stub, td.rl { font-weight: bold; text-align: center; }
  td.shade { background: #d9d9d9; }
  td.lbl { vertical-align: top; line-height: 1.28; font-weight: normal; text-align: left; }
  td.lbl b { display: inline; }
  td.ans { }
  td.chan { border: none; border-left: 0.6pt solid #000; }
  td.nb { border: none; }
  tr.sp td { height: 3mm; }
  tr.tick td { height: 4mm; }
  .footer { position: absolute; bottom: 7mm; left: 13mm; right: 13mm;
            display: flex; justify-content: space-between; font-size: ${(7.5 * scale).toFixed(2)}pt; }
  </style></head><body>
  <div class="wrap">
    <div class="corner">
      <div class="cl">State of ${stateName}<br>Department of Insurance (${abbr})</div>
      <div class="cr">
        <div class="row"><span class="lab">Company:</span><span>${company}</span></div>
        <div class="row"><span class="lab">Line:</span><span>${line}</span></div>
      </div>
    </div>
    <div class="forms">${formsTitle}</div>
    <div class="leglab">${legendLabel}</div>
    <div class="legend">
      <div class="lp lp1"><div class="lph">Type Code</div>${li(typeCodes)}</div>
      <div class="lp lp2"><div class="lph">Source Code</div>${li(sourceCodes)}</div>
      <div class="lp lp3"><div class="lph">Category Code</div>
        <div class="catcols">
          <div class="cc1">${li(cat1)}</div>
          <div class="cc2">${li(cat2)}</div>
          <div class="cc3">${li(cat3)}</div>
        </div>
        <div class="defs">${li(defsHtml)}</div>
      </div>
    </div>
    <table class="main">
      <colgroup>
        <col style="width:2.9%"><col style="width:6.1%"><col style="width:11.8%"><col style="width:26.9%">
        <col style="width:5%"><col style="width:5%"><col style="width:8.7%"><col style="width:5%">
        <col style="width:7.5%"><col style="width:7.5%"><col style="width:7.6%"><col style="width:6%">
      </colgroup>
      <tr class="h"><td></td><td></td><th colspan="2">${t1a}</th><th colspan="3">${t1b}</th><td></td><th colspan="2">${t1c}</th><th colspan="2">${t1d}</th></tr>
      <tr class="h"><td></td><td></td>${subHtml}</tr>
${pairRowsHtml.join("\n")}
${tallRows}
${ticks}
    </table>
  </div>
  <div class="footer"><span>${ed}</span><span>${appTitle}</span><span>${pageNo}</span></div>
  </body></html>`;

  // ---- GT: legend table (5 cols) + main form table (12 cols) ----
  const maxRows = Math.max(typeCodes.length, sourceCodes.length, cat1.length, cat2.length, cat3.length);
  const legendRows = [];
  for (let r = 0; r < maxRows; r++) {
    legendRows.push([typeCodes[r] ?? "", sourceCodes[r] ?? "", cat1[r] ?? "", cat2[r] ?? "", cat3[r] ?? ""]);
  }
  const gtLegend = '<table>\n  <tr>\n    <th>Type Code</th>\n    <th>Source Code</th>\n    <th colspan="3">Category Code</th>\n  </tr>\n'
    + legendRows.map((cells) => "  <tr>\n" + cells.map((c) => `    <td>${c}</td>`).join("\n") + "\n  </tr>").join("\n")
    + "\n"
    + defsTxt.map((d) => `  <tr>\n    <td></td>\n    <td></td>\n    <td colspan="3">${d}</td>\n  </tr>`).join("\n")
    + "\n</table>";

  const e10 = Array(10).fill("<td></td>").join("\n    ");
  const gtPairs = [];
  for (let i = 0; i < itemPairs; i++) {
    gtPairs.push(`  <tr>\n    <td rowspan="2">(${stubStart + i})</td>\n    <td>Proposed</td>\n    ${e10}\n  </tr>`);
    gtPairs.push(`  <tr>\n    <td>Current</td>\n    ${e10}\n  </tr>`);
  }
  const gtMain = "<table>\n"
    + `  <tr>\n    <td colspan="2"></td>\n    <th colspan="2">${t1a}</th>\n    <th colspan="3">${t1b}</th>\n    <td></td>\n    <th colspan="2">${t1c}</th>\n    <th colspan="2">${t1d}</th>\n  </tr>\n`
    + `  <tr>\n    <td></td>\n    <td></td>\n` + subGt.map((c) => `    <th>${c}</th>`).join("\n") + "\n  </tr>\n"
    + gtPairs.join("\n") + "\n"
    + labels.map(([t, p]) => {
        const prose = p.replace(/<\/?b>/g, "");
        return `  <tr>\n    <td></td>\n    <td>${t} ${prose}</td>\n    <td colspan="10"></td>\n  </tr>`;
      }).join("\n")
    + "\n</table>";

  const gt = gtLegend + "\n\n" + gtMain;

  return { html, gt, pageOpts: { format: "A4", landscape: true } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
