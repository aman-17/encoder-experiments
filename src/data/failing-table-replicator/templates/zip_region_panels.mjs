// FAMILY GENERATOR (training data) modeled on the "ZIP-region panels" family:
// A4 landscape Medicare-supplement gross-premium rate sheet, P side-by-side
// ZIP-region panels (underlined captions, no gridlines), each panel two
// parallel (Age | Mode | Plan X) column triples, tiny ~5-6pt type, bold age
// numbers only on the first of their payment-mode rows, rightmost mode labels
// optionally clipped at the page edge ("Month Bank Dra"), "Under 65 Disabled"
// special group with $0.00 / N/A values, italic footnote block, stray
// tracking token + state code, missing-slash date quirk.
//
// Seed-varied structure: panel count (2-3), age groups per half (10-14),
// payment modes (3-4), presence of Under-65 group, caption wording/order,
// header label pools, title wording, plan letter/form, state + zip windows,
// font scale (fit-capped), quirk probabilities. All names fictional.
//
// GT = ONE logical 6-col table: per panel a colspan-6 zip caption row +
// 6 header cells + H*M body rows with rowspan-M age cells.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

  // ---------- structural knobs ----------
  const P = rng() < 0.22 ? 2 : 3;              // panel count
  const M = P === 3 && rng() < 0.22 ? 3 : 4;   // payment modes (3 drops Quarterly)
  const H = P === 2 ? ri(12, 14) : ri(10, 13); // age groups per panel half
  const u65 = rng() < 0.8;                     // Under-65 Disabled special group
  const clip = P === 3 && rng() < 0.85;        // clip rightmost mode labels
  const dateQuirk = rng() < 0.65;              // missing-slash date

  // ---------- meta (all fictional) ----------
  const companies = [
    "Heritage National Life Insurance Company",
    "Sterling Fidelity Life Insurance Company",
    "Prairie Crest Mutual Life Insurance Company",
    "Continental Pledge Life Insurance Company",
    "Bluegrass Assurance Life Insurance Company",
    "Granite Harbor Life Insurance Company",
    "Meridian Oak Life Insurance Company",
    "Cascade Union Life Insurance Company",
  ];
  const company = pick(companies);
  const states = [
    { name: "Ohio", abbr: "OH", lo: 430, hi: 458 },
    { name: "Georgia", abbr: "GA", lo: 300, hi: 319 },
    { name: "Missouri", abbr: "MO", lo: 630, hi: 658 },
    { name: "Tennessee", abbr: "TN", lo: 370, hi: 385 },
    { name: "Arizona", abbr: "AZ", lo: 850, hi: 865 },
    { name: "Colorado", abbr: "CO", lo: 800, hi: 816 },
    { name: "Indiana", abbr: "IN", lo: 460, hi: 479 },
    { name: "Oklahoma", abbr: "OK", lo: 730, hi: 749 },
  ];
  const st = pick(states);
  const year = 2019 + ri(0, 7);
  const letter = pick(["A", "B", "D", "F", "G", "N"]);
  const form = pick([
    `${9000 + Math.floor(rng() * 900)}${letter}`,
    `MS-${400 + Math.floor(rng() * 500)}${letter}`,
    `${70 + Math.floor(rng() * 25)}-${1000 + Math.floor(rng() * 8000)}`,
  ]);
  const title1 = pick([
    `${company} - ${year} Gross Premiums - ${st.name}`,
    `${company} - Gross Annual Premiums - ${st.name} - ${year}`,
    `${st.name} ${year} Gross Premium Rate Sheet - ${company}`,
  ]);
  const title2 = pick([
    `Group Standardized Medicare Supplement Policy Form ${form}`,
    `Individual Standardized Medicare Supplement Policy Form ${form}`,
    `Standardized Medicare Supplement Plan ${letter} - Policy Form ${form}`,
  ]);

  // ZIP-region captions
  const zipWord = rng() < 0.25 ? "ZIP Codes" : "Zips";
  const zrange = () => {
    const a = ri(st.lo, st.hi - 5);
    return `${a}-${a + ri(1, 5)}`;
  };
  const zlist = (n) => Array.from({ length: n }, zrange).join(", ");
  const allOthers = pick([`${zipWord} All Others`, `All Other ${zipWord}`]);
  const regionCaps = [];
  for (let i = 0; i < P - 1; i++) {
    const body = `${zipWord} ${zlist(ri(1, 3))}`;
    regionCaps.push(i === P - 2 && rng() < 0.55 ? `(${body})` : body);
  }
  const caps = rng() < 0.7 ? [allOthers, ...regionCaps] : [...regionCaps, allOthers];

  const naic = 60000 + Math.floor(rng() * 39000);
  const fein = `${30 + Math.floor(rng() * 30)}-${1000000 + Math.floor(rng() * 8999999)}`;
  const track = `${10 + Math.floor(rng() * 89)}${pick(["D", "R", "F"])}${100 + Math.floor(rng() * 899)}`;
  const mm = String(ri(1, 12)).padStart(2, "0");
  const dateStr = dateQuirk ? `${mm}/01${year}` : `${mm}/01/${year}`;

  // ---------- labels ----------
  const agePair = pick([["Attained", "Age"], ["Issue", "Age"]]);
  const modeLab = pick(["Mode", "Pay Mode"]);
  const semiLab = rng() < 0.3 ? "Semiannual" : "Semi-Annual";
  const lastMode = pick(["Month Bank Draft", "Monthly Bank Draft"]);
  const MODES4 = ["Annual", semiLab, "Quarterly", lastMode];
  const RATIO4 = [1, 0.51 + rng() * 0.02, 0.26 + rng() * 0.012, 0.083 + rng() * 0.003];
  const keep = M === 4 ? [0, 1, 2, 3] : [0, 1, 3];
  const MODES = keep.map((i) => MODES4[i]);
  const RATIO = keep.map((i) => RATIO4[i]);
  const u65LabPool = [["Under", "65 Disabled"], ["Disabled", "Under 65"], ["Under 65", "(Disabled)"]];
  const u65Lab = pick(u65LabPool);
  const u65Vals4 = pick([
    ["$0.00", "N/A", "$0.00", "$0.00"],
    ["N/A", "N/A", "N/A", "N/A"],
    ["$0.00", "$0.00", "$0.00", "$0.00"],
  ]);
  const U65 = keep.map((i) => u65Vals4[i]);

  // ---------- premiums ----------
  // numAges age groups: 65 .. (65+numAges-2), then "(top)+"
  const numAges = 2 * H - (u65 ? 1 : 0);
  const ageLabels = [];
  for (let i = 0; i < numAges - 1; i++) ageLabels.push(String(65 + i));
  ageLabels.push(`${65 + numAges - 1}+`);
  const mult = [1];
  for (let i = 1; i < numAges - 1; i++) mult.push(mult[i - 1] * (1.022 + rng() * 0.012));
  mult.push(mult[numAges - 2] * (1.058 + rng() * 0.02)); // top-age jump
  const base = 3400 + rng() * 1600;
  const panelF = [1];
  for (let p = 1; p < P; p++) panelF.push(panelF[p - 1] * (1.07 + rng() * 0.05));
  const fmt = (n) => {
    const [i, cts] = n.toFixed(2).split(".");
    return "$" + i.replace(/\B(?=(\d{3})+$)/g, ",") + "." + cts;
  };
  // amt[p][ageIdx][mode]
  const amt = panelF.map((pf) =>
    mult.map((m) => {
      const annual = Math.round(base * m * pf * 100) / 100;
      return RATIO.map((r, k) => (k === 0 ? fmt(annual) : fmt(Math.round(annual * r * 100) / 100)));
    })
  );

  // per-panel group lists: left triple = first H ages, right triple = rest
  // (+ Under 65 Disabled last when present). Column-major (down-then-across).
  const leftGroups = (p) =>
    Array.from({ length: H }, (_, g) => ({ lab: [ageLabels[g]], amts: amt[p][g] }));
  const rightGroups = (p) => {
    const gs = Array.from({ length: numAges - H }, (_, g) => ({
      lab: [ageLabels[H + g]],
      amts: amt[p][H + g],
    }));
    if (u65) gs.push({ lab: u65Lab, amts: U65 });
    return gs;
  };

  // ---------- sizing (fit-capped font jitter, ±10% feel) ----------
  const bodyRows = H * M;
  const lh = 1.62 + rng() * 0.18;
  const fontMax = 478 / (lh * (bodyRows + 2)); // pt budget for the table block
  const font = Math.max(4.5, Math.min(5.5 * (0.9 + rng() * 0.21), fontMax));
  const fpt = font.toFixed(2);
  const capPt = (font * 1.1).toFixed(2);
  const footPt = Math.max(5.3, Math.min(font * 1.09, 6.6)).toFixed(2);
  const t1pt = (8.5 + rng()).toFixed(1);
  const t2pt = (Number(t1pt) - 1).toFixed(1);
  const wAge = (8.5 + rng()).toFixed(1);
  const wMode = (18 + rng() * 1.5).toFixed(1);
  const wAmt = (13.5 + rng()).toFixed(1);
  const wGap = (3.5 + rng()).toFixed(1);
  const panelW = 2 * (+wAge + +wMode + +wAmt) + +wGap;
  const padLeft = P === 2 ? (20 + rng() * 15).toFixed(1) : (6 + rng() * 2).toFixed(1);
  const gapMm = (P === 2
    ? 28 + rng() * 12
    : Math.max(4, Math.min(10, (295 - +padLeft - 3 * panelW) / 2))
  ).toFixed(1);
  const clipW = (2.45 * font).toFixed(1);

  // ---------- visual html ----------
  const headRows = `
  <tr><th class="age">${agePair[0]}</th><th></th><th class="amth">Plan ${letter}</th><th class="gap"></th><th class="age">${agePair[0]}</th><th></th><th class="amth">Plan ${letter}</th></tr>
  <tr><th class="age">${agePair[1]}</th><th class="mode">${modeLab}</th><th class="amth">${form}</th><th class="gap"></th><th class="age">${agePair[1]}</th><th class="mode">${modeLab}</th><th class="amth">${form}</th></tr>`;

  const panelHtml = (p) => {
    const L = leftGroups(p), R = rightGroups(p);
    const doClip = clip && p === P - 1; // rightmost triple clipped at page edge
    let rows = "";
    for (let r = 0; r < bodyRows; r++) {
      const g = Math.floor(r / M), k = r % M;
      const modeCell = (isClip) =>
        isClip ? `<td class="mode"><span class="clip">${MODES[k]}</span></td>` : `<td class="mode">${MODES[k]}</td>`;
      const amtCell = (v) => (v === "N/A" ? `<td class="amt na">N/A</td>` : `<td class="amt">${v}</td>`);
      rows += `<tr><td class="age">${L[g].lab[k] ?? ""}</td>${modeCell(false)}${amtCell(L[g].amts[k])}` +
        `<td class="gap"></td><td class="age">${R[g].lab[k] ?? ""}</td>${modeCell(doClip)}${amtCell(R[g].amts[k])}</tr>\n`;
    }
    return `<div class="panel"><div class="cap"><span>${caps[p]}</span></div>
    <table><colgroup><col class="cage"><col class="cmode"><col class="camt"><col class="cgap"><col class="cage"><col class="cmode"><col class="camt"></colgroup>${headRows}
    ${rows}</table></div>`;
  };

  const noteLines = pick([
    ["The above rates reflect current deductible and benefit levels.  We anticipate that they will need to be adjusted each year to",
      "reflect deductible and/or benefit changes, trend, and utilization changes.  Premiums will change as your age changes."],
    ["Rates shown reflect the deductible and benefit levels in effect on the date of this filing.  Annual adjustments are expected",
      "to reflect benefit changes, medical trend, and utilization experience.  Premiums will change as your age changes."],
    ["The premiums above are based on current benefit and deductible provisions.  They are expected to be revised each year for",
      "changes in deductibles and/or benefits, trend, and utilization.  Your premium will change on each policy anniversary."],
  ]);
  const mbdNote = pick([
    `* ${lastMode} (MBD) requires 2 months submitted.`,
    `* ${lastMode} (MBD) requires two months premium with the application.`,
  ]);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; overflow: hidden; }
  body { width: 297mm; height: 209mm; font-family: Arial, Helvetica, sans-serif; color: #000; position: relative; }
  .t1 { text-align: center; font-weight: bold; font-size: ${t1pt}pt; padding-top: 6.5mm; }
  .t2 { text-align: center; font-weight: bold; font-size: ${t2pt}pt; }
  .panels { display: flex; padding-left: ${padLeft}mm; margin-top: 3.5mm; }
  .panel { margin-right: ${gapMm}mm; }
  .panel:last-child { margin-right: 0; }
  .cap { text-align: center; font-size: ${capPt}pt; font-weight: bold; margin-bottom: 0.8mm; }
  .cap span { text-decoration: underline; }
  table { border-collapse: collapse; table-layout: fixed; }
  col.cage { width: ${wAge}mm; } col.cmode { width: ${wMode}mm; } col.camt { width: ${wAmt}mm; } col.cgap { width: ${wGap}mm; }
  th, td { font-size: ${fpt}pt; padding: 0; line-height: ${lh.toFixed(2)}; white-space: nowrap; overflow: hidden; }
  th { font-weight: bold; }
  .age { text-align: center; font-weight: bold; }
  .mode { text-align: center; }
  .amt { text-align: right; padding-right: 1mm; }
  .amth { text-align: center; }
  .na { text-align: left; padding-left: 1.5mm; }
  .clip { display: inline-block; max-width: ${clipW}mm; overflow: hidden; vertical-align: bottom; }
  .foot { display: flex; align-items: flex-start; padding-left: 7mm; font-size: ${footPt}pt; font-style: italic; margin-top: 0.6mm; }
  .fnotes { width: 152mm; }
  .fnotes .nlab { display: inline-block; width: 12mm; }
  .fnotes .ind { padding-left: 12mm; }
  .freg { width: 62mm; display: flex; justify-content: space-between; padding-top: 2.6mm; }
  .ftrack { flex: 1; text-align: right; padding-top: 2.6mm; padding-right: 2mm; line-height: 1.6; }
  .fdate { position: absolute; left: 7mm; margin-top: 7mm; font-size: ${footPt}pt; font-style: italic; }
  </style></head><body>
  <div class="t1">${title1}</div>
  <div class="t2">${title2}</div>
  <div class="panels">${Array.from({ length: P }, (_, p) => panelHtml(p)).join("")}</div>
  <div class="foot">
    <div class="fnotes">
      <div><span class="nlab">Note</span>${noteLines[0]}</div>
      <div class="ind">${noteLines[1]}</div>
      <div class="ind">${mbdNote}</div>
    </div>
    <div class="freg"><span>NAIC Co. Code: ${naic}</span><span>FEIN: ${fein}</span></div>
    <div class="ftrack">${track}<br>${st.abbr}</div>
  </div>
  <div class="fdate">${dateStr}</div>
  </body></html>`;

  // ---------- logical GT: one 6-col table, panels stacked ----------
  const ageHdr = `${agePair[0]} ${agePair[1]}`;
  const gtPanels = panelF.map((_, p) => {
    const L = leftGroups(p), R = rightGroups(p);
    let s = `  <tr>\n    <th colspan="6">${caps[p]}</th>\n  </tr>\n`;
    s += `  <tr>\n    <th>${ageHdr}</th>\n    <th>${modeLab}</th>\n    <th>Plan ${letter} ${form}</th>\n    <th>${ageHdr}</th>\n    <th>${modeLab}</th>\n    <th>Plan ${letter} ${form}</th>\n  </tr>\n`;
    const rows = [];
    for (let r = 0; r < bodyRows; r++) {
      const g = Math.floor(r / M), k = r % M;
      let cells = "";
      if (k === 0) cells += `    <td rowspan="${M}">${L[g].lab.join(" ")}</td>\n`;
      cells += `    <td>${MODES[k]}</td>\n    <td>${L[g].amts[k]}</td>\n`;
      if (k === 0) cells += `    <td rowspan="${M}">${R[g].lab.join(" ")}</td>\n`;
      cells += `    <td>${MODES[k]}</td>\n    <td>${R[g].amts[k]}</td>\n`;
      rows.push(`  <tr>\n${cells}  </tr>`);
    }
    return s + rows.join("\n");
  });
  const gt = `<table>\n${gtPanels.join("\n")}\n</table>`;

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
