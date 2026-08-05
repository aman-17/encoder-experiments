// FAMILY generator: Medicare-supplement attained-age rate sheet. Centered bold
// title block (fictional insurer, product line, rate-schedule wording, state),
// one wide two-tier premium grid (stub + [X / Non-Tobacco x P plans] +
// [X / Tobacco x P plans]), optional ragged "0-64"/"Under N" first row (values
// only under the first plan of each half), partial rules (outer frame +
// stub/midline verticals + header underlines only, NO horizontal body rules),
// bold centered footnotes, then a Zip Codes | Area Factors mini-table.
// Bottom of page left empty.
// Seed-varied structure: plan count P in {6,7,8} (cols = 1+2P), age-row count
// (~29-41 body rows), age span, quirk toggles (ragged pre-age row, flat first
// ages, flat-growth columns), label/title/state/company pools, font scale.
// Saturation quirks kept: first flatSpan age rows identical per column, tobacco
// half = one uniform multiplier of the non-tobacco half.
// GT = main table (3 + cols + bodyRows*cols, merged_cells=2) + mini-table
// (2*(1+zipGroups)); lands ~505-730 cells across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);

  const fmt = (n) => {
    const [i, d] = n.toFixed(2).split(".");
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + d;
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const pick = (a) => a[Math.floor(rng() * a.length)];

  // ---------- pools (all fictional) ----------
  const companies = [
    "Heartland National Life and Annuity Insurance Company",
    "Continental Assurance Life and Annuity Insurance Company",
    "Sterling Plains Life and Annuity Insurance Company",
    "Guaranty Union Life and Annuity Insurance Company",
    "Prairie Summit Life Insurance Company",
    "Beacon Mutual Life and Annuity Insurance Company",
    "Cedarbrook National Insurance Company",
    "Meridian Trust Life Insurance Company",
  ];
  const company = pick(companies);
  const exhLabel = `${pick(["Exhibit", "Exhibit", "Appendix", "Attachment"])} ${1 + Math.floor(rng() * 9)}`;

  const t2 = pick([
    "Individual Modernized Medicare Supplement",
    "Individual Standardized Medicare Supplement",
    "Individual Medicare Supplement Insurance Policies",
    "Modernized Medicare Supplement Plans",
  ]);
  const t3 = pick([
    "Attained Age Premium Rates",
    "Attained Age Annual Premium Rates",
    "Attained Age Rate Schedule",
  ]);
  const effYr = 2021 + Math.floor(rng() * 9);
  const effMo = 1 + Math.floor(rng() * 12);
  const t4 = pick([
    "Current Annual Rates",
    "Annual Premium Rates",
    `Annual Rates Effective ${effMo}/1/${effYr}`,
  ]);
  const states = [
    ["OHIO", 430, 459],
    ["GEORGIA", 300, 319],
    ["MISSOURI", 630, 658],
    ["TENNESSEE", 370, 385],
    ["KANSAS", 660, 679],
    ["COLORADO", 800, 816],
    ["ARIZONA", 850, 865],
    ["VIRGINIA", 220, 246],
  ];
  const [stateName, zipLo, zipHi] = pick(states);

  const sex = pick(["Female", "Female", "Male", "Male", "Unisex"]);
  const halfLabels = rng() < 0.25
    ? [`Non-Tobacco / ${sex}`, `Tobacco / ${sex}`]
    : [`${sex} / Non-Tobacco`, `${sex} / Tobacco`];
  const stubLabel = rng() < 0.8 ? "Attained Age" : "Age";

  // ---------- plan roster: first plan always Plan A, then P-1 of the rest ----------
  // [name, baseLo, baseJit, growLo, growJit, tailDamp]
  const planPool = [
    ["Plan A", 1850, 220, 0.020, 0.006, 0.5],
    ["Plan B", 1980, 200, 0.022, 0.006, 0.6],
    ["Plan C", 1850, 220, 0.029, 0.006, 1.0],
    ["Plan D", 1420, 220, 0.030, 0.008, 0.6],
    ["Plan F", 2150, 260, 0.023, 0.006, 0.5],
    ["Plan HDF", 460, 90, 0.024, 0.008, 0.4],
    ["Plan G", 1620, 220, 0.024, 0.006, 0.5],
    ["Plan K", 890, 140, 0.026, 0.006, 0.6],
    ["Plan L", 1150, 160, 0.025, 0.006, 0.5],
    ["Plan N", 1250, 180, 0.024, 0.006, 0.5],
  ];
  const P = 6 + Math.floor(rng() * 3); // 6..8 plans per half
  const cols = 1 + 2 * P;
  const restIdx = planPool.slice(1).map((_, i) => i + 1);
  for (let i = restIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [restIdx[i], restIdx[j]] = [restIdx[j], restIdx[i]];
  }
  const chosen = [0, ...restIdx.slice(0, P - 1).sort((a, b) => a - b)];
  const roster = chosen.map((i) => planPool[i]);
  const plans = roster.map((r) => r[0]);

  // ---------- age span: body row count varies per seed (budget floor ~500 GT cells) ----------
  const rowsMin = Math.max(29, Math.ceil(470 / cols));
  const rowsMax = P === 8 ? 38 : P === 7 ? 40 : 41; // narrower cols -> more rows allowed
  const ageRows = rowsMin + Math.floor(rng() * (rowsMax - rowsMin + 1)); // P=6: 37-41, P=7: 32-40, P=8: 29-38
  let endAge = 96 + Math.floor(rng() * 4); // 96..99
  let startAge = endAge - ageRows + 1;
  if (startAge < 59) { endAge = Math.min(99, 58 + ageRows); startAge = endAge - ageRows + 1; }

  // ---------- quirk toggles ----------
  const hasPreRow = rng() < 0.85; // ragged sub-age row, first plan of each half only
  const preLabel = rng() < 0.65 ? `0-${startAge - 1}` : `Under ${startAge}`;
  const flatSpan = 2 + Math.floor(rng() * 3); // first 2-4 age rows identical
  const flatProb = 0.15 + rng() * 0.25; // per-plan "stays flat one extra year"
  const tob = pick([1.12, 1.13, 1.15, 1.16, 1.18, 1.2]);

  // ---------- rate matrix ----------
  const base = roster.map(([, lo, jit]) => lo + rng() * jit);
  const grow = roster.map(([, , , glo, gjit]) => glo + rng() * gjit);
  const tail = roster.map(([, , , , , d]) => d);
  const flatX = roster.map(() => rng() < flatProb);
  const raw = base.slice();
  const nt = []; // formatted strings per age row
  const tb = [];
  for (let ai = 0; ai < ageRows; ai++) {
    const age = startAge + ai;
    if (ai >= flatSpan) {
      for (let p = 0; p < P; p++) {
        if (ai === flatSpan && flatX[p]) continue;
        const g = grow[p] * (age > 90 ? tail[p] : 1) * (0.85 + rng() * 0.3);
        raw[p] *= 1 + g;
      }
    }
    const ntRow = raw.map((v) => r2(v));
    nt.push(ntRow.map(fmt));
    tb.push(ntRow.map((v) => fmt(r2(v * tob))));
  }
  const a0nt = r2(raw[0] * (2.2 + rng() * 0.3)); // pre-age row, first plan only
  const a0tb = r2(a0nt * tob);

  // ---------- zip-code area-factor mini-table ----------
  const nZipG = 3 + Math.floor(rng() * 3); // 3-5 groups
  const span = zipHi - zipLo + 1;
  const g1len = Math.min(5 + Math.floor(rng() * 4), span - nZipG + 1);
  const g1start = zipLo + 1 + Math.floor(rng() * Math.max(1, span - g1len - 1));
  const groups = Array.from({ length: nZipG }, () => []);
  for (let z = zipLo; z <= zipHi; z++) {
    if (z >= g1start && z < g1start + g1len) groups[0].push(z);
    else groups[1 + Math.floor(rng() * (nZipG - 1))].push(z);
  }
  for (let gi = 1; gi < nZipG; gi++)
    if (groups[gi].length === 0) {
      const donor = groups.reduce((a, b, i) => (i > 0 && b.length > groups[a].length ? i : a), 1);
      groups[gi].push(groups[donor].pop());
    }
  for (const g of groups) g.sort((a, b) => a - b);
  const compress = (a) => {
    const out = []; let i = 0;
    while (i < a.length) {
      let j = i;
      while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
      out.push(i === j ? `${a[i]}` : `${a[i]}-${a[j]}`);
      i = j + 1;
    }
    return out.join(", ");
  };
  const outlier = rng() < 0.5 ? `, ${zipHi + 25 + Math.floor(rng() * 60)}` : "";
  let f = 1.15 + rng() * 0.12;
  const zipRows = groups.map((g, gi) => {
    const row = [compress(g) + (gi === nZipG - 1 ? outlier : ""), f.toFixed(2)];
    f -= 0.06 + rng() * 0.08;
    return row;
  });

  // ---------- footnotes ----------
  const discPct = pick([5, 7, 10, 12]);
  const riskPct = pick([15, 20, 25]);
  const fnPool = [
    `Applicants eligible for Household Discount will receive a ${discPct}% discount.`,
    `Risk class increase in premium of ${riskPct}% based on height/weight chart may apply`,
    `Premiums shown include the annual policy fee of $${pick([20, 25, 30, 36])}.`,
    "Rates are subject to change on the policy anniversary.",
    `Premiums for attained ages over ${endAge} are available upon request.`,
  ];
  const fnCount = pick([2, 2, 2, 1, 3]);
  const fnIdx = [];
  while (fnIdx.length < fnCount) {
    const k = Math.floor(rng() * fnPool.length);
    if (!fnIdx.includes(k)) fnIdx.push(k);
  }
  const footnotes = fnIdx.map((k) => fnPool[k]);

  // ---------- sizing (font scale +-10%, width tracks column count) ----------
  const S = 0.92 + rng() * 0.18;
  const pt = (x) => (x * S).toFixed(2) + "pt";
  const mainFs = ((P === 8 ? 6.0 : P === 7 ? 6.4 : 6.7) * (0.95 + rng() * 0.1)).toFixed(2);
  const tblW = P === 8 ? 190 : P === 7 ? 180 : 170;
  const stubW = P === 8 ? 12 : 13;
  const cellPad = P === 8 ? 1.6 : 2.5;

  // ---------- HTML ----------
  const planTh = () =>
    plans.map((p, i) => `<th class="${i === 0 ? "bl" : ""}">${p}</th>`).join("");
  let bodyHtml = "";
  const emptyRun = "<td></td>".repeat(P - 1);
  if (hasPreRow)
    bodyHtml += `<tr><td class="a">${preLabel}</td><td class="v bl">${fmt(a0nt)}</td>${emptyRun}`
      + `<td class="v bl">${fmt(a0tb)}</td>${emptyRun}</tr>\n`;
  for (let ai = 0; ai < ageRows; ai++) {
    bodyHtml += `<tr><td class="a">${startAge + ai}</td>`
      + nt[ai].map((v, i) => `<td class="v${i === 0 ? " bl" : ""}">${v}</td>`).join("")
      + tb[ai].map((v, i) => `<td class="v${i === 0 ? " bl" : ""}">${v}</td>`).join("")
      + "</tr>\n";
  }

  const zipHtml = zipRows.map(([z, fac]) => `<tr><td>${z}</td><td class="c">${fac}</td></tr>`).join("\n");
  const stubHtml = stubLabel.includes(" ") ? stubLabel.replace(" ", "<br>") : stubLabel;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; width: 216mm; height: 278mm; font-family: Arial, Helvetica, sans-serif;
         color: #000; position: relative; }
  .exh { position: absolute; top: 9mm; left: 17mm; font-size: ${pt(7.5)}; }
  .tblock { padding-top: ${(21 * S).toFixed(1)}mm; text-align: center; line-height: 1.45; }
  .t1, .t2 { font-size: ${pt(10.5)}; font-weight: bold; }
  .t3 { font-size: ${pt(9)}; font-weight: bold; }
  .t4 { font-size: ${pt(7.5)}; font-weight: bold; }
  .state { font-size: ${pt(7.5)}; font-weight: bold; margin-top: 5mm; }
  table.main { border-collapse: collapse; table-layout: fixed; width: ${tblW}mm;
               margin: 4.5mm auto 0; border: 1.1pt solid #000; }
  .main th, .main td { font-size: ${mainFs}pt; padding: 0.4pt ${cellPad}pt; white-space: nowrap; overflow: hidden; }
  .main th { font-weight: bold; text-align: center; }
  .main col.stub { width: ${stubW}mm; }
  .hr1 th { border-bottom: 0.9pt solid #000; font-size: ${(Number(mainFs) + 0.2).toFixed(2)}pt; }
  .hr2 th { border-bottom: 0.9pt solid #000; vertical-align: bottom; }
  .ath { line-height: 1.3; }
  .bl { border-left: 0.9pt solid #000; }
  td.a { text-align: center; }
  td.v { text-align: right; line-height: 1.34; }
  .fn { text-align: center; font-weight: bold; font-size: ${pt(6.8)}; margin-top: 1.8mm; line-height: 1.55; }
  table.zip { border-collapse: collapse; margin: ${(7 * S).toFixed(1)}mm 0 0 19mm; }
  .zip th, .zip td { font-size: ${pt(6.8)}; font-weight: bold; text-align: left; padding: 0.8pt 0; }
  .zip th:first-child { padding-left: 2mm; }
  .zip td.c, .zip th.c { text-align: center; width: 30mm; }
  .zip td:first-child { width: 92mm; }
  .u { text-decoration: underline; }
  </style></head><body>
  <div class="exh">${exhLabel}</div>
  <div class="tblock">
    <div class="t1">${company}</div>
    <div class="t2">${t2}</div>
    <div class="t3">${t3}</div>
    <div class="t4">${t4}</div>
    <div class="state">${stateName}</div>
  </div>
  <table class="main">
  <colgroup><col class="stub">${'<col>'.repeat(cols - 1)}</colgroup>
  <tr class="hr1"><th></th><th class="bl" colspan="${P}">${halfLabels[0]}</th><th class="bl" colspan="${P}">${halfLabels[1]}</th></tr>
  <tr class="hr2"><th class="ath">${stubHtml}</th>${planTh()}${planTh()}</tr>
  ${bodyHtml}</table>
  <div class="fn">${footnotes.join("<br>")}</div>
  <table class="zip">
  <tr><th><span class="u">Zip Codes</span></th><th class="c"><span class="u">Area Factors</span></th></tr>
  ${zipHtml}
  </table>
  </body></html>`;

  // ---------- GT ----------
  const gtPlanThs = plans.map((p) => `    <th>${p}</th>`).join("\n");
  const emptyTds = "    <td></td>\n".repeat(P - 1).trimEnd();
  let gtRows = hasPreRow
    ? `  <tr>\n    <td>${preLabel}</td>\n    <td>${fmt(a0nt)}</td>\n${emptyTds}\n`
      + `    <td>${fmt(a0tb)}</td>\n${emptyTds}\n  </tr>`
    : "";
  for (let ai = 0; ai < ageRows; ai++) {
    gtRows += `${gtRows ? "\n" : ""}  <tr>\n    <td>${startAge + ai}</td>\n`
      + nt[ai].map((v) => `    <td>${v}</td>`).join("\n") + "\n"
      + tb[ai].map((v) => `    <td>${v}</td>`).join("\n") + "\n  </tr>";
  }
  const gtMain = `<table>\n  <tr>\n    <th></th>\n    <th colspan="${P}">${halfLabels[0]}</th>\n    <th colspan="${P}">${halfLabels[1]}</th>\n  </tr>\n  <tr>\n    <th>${stubLabel}</th>\n${gtPlanThs}\n${gtPlanThs}\n  </tr>\n${gtRows}\n</table>`;
  const gtZip = `<table>\n  <tr>\n    <th>Zip Codes</th>\n    <th>Area Factors</th>\n  </tr>\n`
    + zipRows.map(([z, fac]) => `  <tr>\n    <td>${z}</td>\n    <td>${fac}</td>\n  </tr>`).join("\n")
    + "\n</table>";

  return { html, gt: gtMain + "\n\n" + gtZip, pageOpts: { format: "Letter" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
