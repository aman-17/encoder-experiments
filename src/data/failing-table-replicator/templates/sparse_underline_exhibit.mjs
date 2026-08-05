// FAMILY generator: sparse portrait actuarial LAE exhibit (training data).
// Visual identity: centered 4-line title block, "Exhibit N / Sheet M" top right,
// one small gridless 6-col serif table (header underlines only, whitespace
// alignment), ragged right-aligned annotation rows with values only in the two
// ratio columns (selective blue), section B label:value lines, Notes block,
// 3-part xlsx footer.
// Family quirks (seed-toggled): invisible "1/1/1904 0.0% ..." Excel-epoch row in
// the text layer (white text), selective blue ink, N/A saturation in the DCC
// column of bureau/selected rows, blank spacer rows between annotation groups.
// Structural jitter per seed: 4-8 accident years, 6-10 annotation rows, phantom
// row on/off, label synonym pools, state/bureau/company pools, spacer-gap sizes,
// font size +/-10%. GT = ONE logical 6-col table, 13-22 rows, exactly one
// colspan=2 merge -> ~77-131 cells.
// All company / bureau names are FICTIONAL; years shifted off the source doc.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const chance = (p) => rng() < p;

  // ---------- identity pools (all fictional) ----------
  const companies = [
    "Pinnacle Point Indemnity Company",
    "Granite Shield Mutual Insurance Co.",
    "Meridian National Casualty Company",
    "Cascade Summit Assurance Company",
    "Harborlight Standard Insurance Company",
    "Ironvale Mutual Casualty Company",
    "Bluewater Ridge Indemnity Corporation",
    "Copperfield Pacific Assurance Co.",
  ];
  const company = pick(companies);
  const coTag = company.split(/\s+/).slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  // NCCI-administered states (no real independent rating bureau -> acronyms fictional)
  const states = [
    { name: "Georgia", ab: "GA" }, { name: "Arizona", ab: "AZ" },
    { name: "Colorado", ab: "CO" }, { name: "Oregon", ab: "OR" },
    { name: "Missouri", ab: "MO" }, { name: "Tennessee", ab: "TN" },
    { name: "Nevada", ab: "NV" }, { name: "Iowa", ab: "IA" },
  ];
  const st = pick(states);
  const natAcr = pick(["NCAB", "NCSF", "NACR", "NCRF", "CNRB", "NCPB"]); // fictional national council
  const stAcr = st.ab + "CRB"; // fictional state rating bureau

  const effYear = pick([2018, 2019, 2020, 2022, 2025, 2026]);
  const effMonth = pick([1, 4, 7, 10]);
  const evalYear = effYear - 1 - Math.floor(rng() * 2);
  const exhibitNo = 2 + Math.floor(rng() * 10);
  const sheetNo = 1 + Math.floor(rng() * 8);

  // ---------- wording pools ----------
  const geo = pick(["Countrywide", "Nationwide", "All-States"]);
  const ult = pick(["Ultimate Incurred", "Developed Ultimate", "Estimated Ultimate"]);
  const thou = pick(["(in thousands)", "(in $000s)", "($000s omitted)"]);
  const [ay1, ay2] = pick([["Accident", "Year"], ["Acc.", "Year"], ["Accident", "Yr."]]);
  const effWord = pick(["FILING EFFECTIVE", "RATES EFFECTIVE", "PROPOSED EFFECTIVE"]);
  const evalWord = pick(["Data Evaluated as of", "Experience Evaluated as of", "Losses Evaluated as of"]);
  const secATitle = pick([
    "Determination of Loss Adjustment Expense",
    "Derivation of the Loss Adjustment Expense Provision",
    "Development of Loss Adjustment Expense Ratios",
    "Indicated Loss Adjustment Expense Provision",
  ]);
  const secBTitle = pick(["Selected LAE &amp; LBA Provision", "Selected LAE and LBA Provision", "Selection of LAE &amp; LBA Provision"]);
  const wtdStyle = pick(["-yr Wtd Avg:", "-Year Wtd Avg:", "-yr Weighted Avg:"]);
  const exHiLoLbl = pick(["Avg Ex Hi/Lo:", "Average Ex-Hi/Lo:", "Avg Excl Hi/Lo:"]);
  const totalLbl = pick(["Total", "Total:", "All Years"]);
  const footLeft = pick(["Actuarial", "Actuarial Department", "Rate Filing Support"]);
  const fstem = pick(["Filing Exhibits", "Rate Exhibits", "Actuarial Exhibits"]);

  // ---------- quirk toggles ----------
  const hasPhantom = chance(0.8);       // invisible Excel-epoch row in text layer
  const useBlue = chance(0.9);          // selective blue ink on bureau/selected values
  const hasExHiLo = chance(0.85);
  const fs = Math.round((8.1 + rng() * 1.8) * 10) / 10; // 8.1-9.9pt (9pt +/-10%)

  const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pct = (x) => (100 * x).toFixed(1) + "%";

  // ---------- accident-year block (4-8 rows, seed-jittered) ----------
  const nYears = 4 + Math.floor(rng() * 5);
  const years = [];
  let loss = 15000 + Math.floor(rng() * 35000);
  for (let i = 0; i < nYears; i++) {
    loss = Math.round(loss * (1.02 + rng() * 0.18));
    const dcc = Math.round(loss * (0.112 + rng() * 0.028));
    const aoe = Math.round(loss * (0.108 + rng() * 0.04));
    years.push({ ay: effYear - nYears - 1 + i, loss, dcc, aoe });
  }
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  const tot = { loss: sum(years, "loss"), dcc: sum(years, "dcc"), aoe: sum(years, "aoe") };
  const wavg = (n, k) => { const a = years.slice(-n); return pct(sum(a, k) / sum(a, "loss")); };
  const exHiLo = (k) => {
    const rs = years.map((y) => y[k] / y.loss).sort((a, b) => a - b).slice(1, -1);
    return pct(rs.reduce((s, x) => s + x, 0) / rs.length);
  };
  const natAoe = pct(0.082 + rng() * 0.024);
  const stDcc = pct(0.178 + rng() * 0.03);
  const stAoe = pct(0.124 + rng() * 0.02);
  const lae = (parseFloat(stDcc) + parseFloat(stAoe)).toFixed(1) + "%";
  const lba = pick(["0.0%", "0.0%", "0.2%", "0.5%"]);
  const laeLba = (parseFloat(lae) + parseFloat(lba)).toFixed(1) + "%";

  // ---------- annotation block (6-9 logical rows, seed-jittered) ----------
  // entry: { lbl, v1, v2, blue, gap, merge }
  const annos = [];
  const avgNs = [5, 4, 3, 2].filter((n) => n <= nYears);
  const nAvg = Math.min(avgNs.length, 2 + Math.floor(rng() * 3)); // 2-4 wtd-avg rows
  const gapA = 1 + Math.floor(rng() * 2);
  avgNs.slice(avgNs.length - nAvg).forEach((n, i) =>
    annos.push({ lbl: `${n}${wtdStyle}`, v1: wavg(n, "dcc"), v2: wavg(n, "aoe"), blue: false, gap: i === 0 ? gapA : 0 }));
  if (hasExHiLo)
    annos.push({ lbl: exHiLoLbl, v1: exHiLo("dcc"), v2: exHiLo("aoe"), blue: false, gap: 0 });
  annos.push({ lbl: `${natAcr} - ${geo}:`, v1: "N/A", v2: natAoe, blue: true, gap: 1 });
  annos.push({ lbl: `${stAcr} - ${st.name}:`, v1: stDcc, v2: stAoe, blue: true, gap: 0 });
  const selBase = 5 + Math.floor(rng() * 3);
  annos.push({ lbl: `(${selBase}) ${geo} Selected:`, v1: "N/A", v2: natAoe, blue: true, gap: 1 + Math.floor(rng() * 2), merge: true });
  annos.push({ lbl: `(${selBase + 1}) ${st.name} Selected:`, v1: stDcc, v2: stAoe, blue: true, gap: 1 + Math.floor(rng() * 2) });
  if (chance(0.5)) // optional reference line: provision from the prior filing
    annos.push({ lbl: pick(["Prior Filing Selected:", "Current Provision:", "Prior Approved:"]),
      v1: pct(0.17 + rng() * 0.04), v2: pct(0.12 + rng() * 0.03), blue: false, gap: 1 });

  const phantom = ["1/1/1904", "0.0%", "0.0%", "0.0%", "0.0%", "-"];

  // ---------- visual HTML ----------
  const sp = '<tr class="sp"><td colspan="6"></td></tr>';
  const yearTr = (y) =>
    `<tr><td class="yr">${y.ay}</td><td class="num">${comma(y.loss)}</td><td class="num">${comma(y.dcc)}</td><td class="num">${comma(y.aoe)}</td><td class="rat">${pct(y.dcc / y.loss)}</td><td class="rat">${pct(y.aoe / y.loss)}</td></tr>`;
  const annoTr = (a) => {
    const b = a.blue && useBlue ? " blue" : "";
    return sp.repeat(a.gap) +
      `<tr><td class="albl" colspan="4"><span>${a.lbl}</span></td><td class="rat${b}">${a.v1}</td><td class="rat${b}">${a.v2}</td></tr>`;
  };
  let bodyRows = "";
  if (hasPhantom)
    bodyRows += `<tr class="ph"><td>${phantom[0]}</td><td class="num">${phantom[1]}</td><td class="num">${phantom[2]}</td><td class="num">${phantom[3]}</td><td class="rat">${phantom[4]}</td><td class="rat">${phantom[5]}</td></tr>`;
  for (const y of years) bodyRows += yearTr(y);
  bodyRows += sp;
  bodyRows += `<tr><td class="yr">${totalLbl}</td><td class="num">${comma(tot.loss)}</td><td class="num">${comma(tot.dcc)}</td><td class="num">${comma(tot.aoe)}</td><td class="rat">${pct(tot.dcc / tot.loss)}</td><td class="rat">${pct(tot.aoe / tot.loss)}</td></tr>`;
  for (const a of annos) bodyRows += annoTr(a);

  const mm2 = String(effMonth).padStart(2, "0");
  const fname = `${fstem}_${st.ab}_${coTag} ${effYear}-${mm2}-01.xlsx`;
  const fMon = ((effMonth + 9) % 12) + 1; // ~3 months before effective
  const ftime = `${fMon}/${1 + Math.floor(rng() * 27)}/${effMonth <= 3 ? effYear - 1 : effYear} ${8 + Math.floor(rng() * 3)}:${String(Math.floor(rng() * 60)).padStart(2, "0")} AM`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; width: 215.9mm; height: 278mm; position: relative;
         font-family: "Times New Roman", Times, serif; font-size: ${fs}pt; color: #000; }
  .blue { color: #0000ff; }
  .exh { position: absolute; top: 6mm; right: 19mm; text-align: right; font-size: ${(fs * 1.17).toFixed(1)}pt; line-height: 1.3; }
  .title { padding-top: 19mm; text-align: center; font-size: ${fs}pt; line-height: 1.45; }
  .title b { display: block; }
  .sec { margin: 10mm 0 0 19mm; font-weight: bold; font-size: ${fs}pt; }
  .sec .st { margin-left: 4.5mm; }
  table.main { border-collapse: collapse; margin: 5mm 0 0 26mm; table-layout: fixed; }
  table.main col.c1 { width: 28mm; } table.main col.cw { width: 30mm; } table.main col.cr { width: 28mm; }
  table.main th { font-weight: normal; vertical-align: bottom; text-align: center; padding: 0; line-height: 1.25; }
  table.main td { padding: 0; height: 4.1mm; overflow: visible; }
  .ins { font-size: ${(fs * 0.83).toFixed(1)}pt; display: inline-block; border-bottom: 0.8pt solid #000; padding: 0 4mm 0.4mm; }
  .ul2 { display: inline-block; border-bottom: 0.8pt solid #000; padding: 0 3mm 0.4mm; }
  .ulr { display: inline-block; border-bottom: 0.8pt solid #000; padding: 0 5mm 0.4mm; }
  td.fr { text-align: center; height: 4.6mm; vertical-align: top; }
  td.yr { text-align: center; }
  td.num { text-align: right; padding-right: 6mm; }
  td.rat { text-align: right; padding-right: 3mm; }
  td.albl { text-align: right; }
  td.albl span { display: inline-block; transform: translateX(8mm); }
  tr.sp td { height: 4.1mm; }
  tr.ph td { color: #ffffff; }
  table.secb { border-collapse: collapse; margin: 3.5mm 0 0 55mm; table-layout: fixed; }
  table.secb col.l { width: 96mm; } table.secb col.v { width: 18mm; }
  table.secb td { padding: 0; height: 4.1mm; }
  table.secb td.v { text-align: right; }
  .notes { margin: 9mm 0 0 19mm; font-size: ${fs}pt; line-height: 1.4; }
  .notes .nh { text-decoration: underline; }
  .footer { position: absolute; bottom: 7mm; left: 19mm; right: 19mm; font-size: ${(fs * 1.11).toFixed(1)}pt;
            display: flex; justify-content: space-between; }
  </style></head><body>
  <div class="exh">Exhibit ${exhibitNo}<br>Sheet ${sheetNo}</div>
  <div class="title"><b>${company}</b><b>Workers' Compensation - ${st.name}</b><b>${effWord} ${effMonth}/1/${effYear}</b>${evalWord} December 31, ${evalYear}</div>
  <div class="sec">A.<span class="st">${secATitle}</span></div>
  <table class="main">
  <colgroup><col class="c1"><col class="cw"><col class="cw"><col class="cw"><col class="cr"><col class="cr"></colgroup>
  <tr>
    <th><span class="ul2">${ay1}<br>${ay2}</span></th>
    <th>${geo}<br>${ult}<br>Losses<br><span class="ins">${thou}</span></th>
    <th>${geo}<br>${ult}<br>DCC<br><span class="ins">${thou}</span></th>
    <th>${geo}<br>${ult}<br>AOE<br><span class="ins">${thou}</span></th>
    <th><span class="ulr">DCC Ratio</span></th>
    <th><span class="ulr">AOE Ratio</span></th>
  </tr>
  <tr><td class="fr"></td><td class="fr">(1)</td><td class="fr">(2)</td><td class="fr">(3)</td><td class="fr">(4) = (2) / (1)</td><td class="fr">(5) = (3) / (1)</td></tr>
  ${bodyRows}
  </table>
  <div class="sec" style="margin-top:6mm">B.<span class="st">${secBTitle}</span></div>
  <table class="secb">
  <colgroup><col class="l"><col class="v"></colgroup>
  <tr><td>(1)&nbsp; Selected LAE Provision</td><td class="v">${lae}</td></tr>
  <tr><td>(2)&nbsp; Selected LBA Provision</td><td class="v${useBlue ? " blue" : ""}">${lba}</td></tr>
  <tr><td>(3)&nbsp; Selected LAE &amp; LBA Provision = (1) + (2)</td><td class="v">${laeLba}</td></tr>
  </table>
  <div class="notes"><span class="nh">Notes:</span><br>Columns (1) through (3) from Annual Statement, Schedule P - Part 1D<br><span class="${useBlue ? "blue" : ""}">The selected ${geo} and ${st.name} DCC &amp; AOE ratios are from the ${natAcr} and the ${stAcr}, respectively.</span></div>
  <div class="footer"><span>${footLeft}</span><span>${fname}</span><span>${ftime}</span></div>
  </body></html>`;

  // ---------- logical GT: 6 cols, one colspan=2 merge on the geo-Selected row ----------
  const tr = (cells) => "  <tr>\n" + cells.join("\n") + "\n  </tr>";
  const td = (v) => `    <td>${v}</td>`;
  const gtRows = [];
  gtRows.push(tr([
    `    <th>${ay1} ${ay2}</th>`,
    `    <th>${geo} ${ult} Losses ${thou}</th>`,
    `    <th>${geo} ${ult} DCC ${thou}</th>`,
    `    <th>${geo} ${ult} AOE ${thou}</th>`,
    "    <th>DCC Ratio</th>",
    "    <th>AOE Ratio</th>",
  ]));
  gtRows.push(tr([td(""), td("(1)"), td("(2)"), td("(3)"), td("(4) = (2) / (1)"), td("(5) = (3) / (1)")]));
  if (hasPhantom) gtRows.push(tr(phantom.map(td)));
  for (const y of years)
    gtRows.push(tr([td(y.ay), td(comma(y.loss)), td(comma(y.dcc)), td(comma(y.aoe)), td(pct(y.dcc / y.loss)), td(pct(y.aoe / y.loss))]));
  gtRows.push(tr([td(totalLbl), td(comma(tot.loss)), td(comma(tot.dcc)), td(comma(tot.aoe)), td(pct(tot.dcc / tot.loss)), td(pct(tot.aoe / tot.loss))]));
  for (const a of annos) {
    if (a.merge)
      gtRows.push(tr([td(""), td(""), `    <td colspan="2">${a.lbl}</td>`, td(a.v1), td(a.v2)]));
    else
      gtRows.push(tr([td(""), td(""), td(""), td(a.lbl), td(a.v1), td(a.v2)]));
  }
  const gt = "<table>\n" + gtRows.join("\n") + "\n</table>";

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
