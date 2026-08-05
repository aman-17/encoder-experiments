// FAMILY: state-filing private-passenger-auto actuarial exhibit, "premium trend
// factors" style. Top-right Exhibit/Sheet/(revised) block, centered bold title
// stack, bold caption line, Effective-Date / Avg-Date-of-Loss key-value line,
// unruled trend-period mini-list, then ONE outer-box-only table (rule under the
// in-box fit title, underline under the last data row, NO other internal rules),
// stacked 3-line stub "Selected/Trend/(N point)", full-width "Premium Trend
// Factor" section row, deliberate column-group gap, lower half of page empty.
// Family quirks kept (seed-toggled): identical-value saturation (historical ==
// prospective trend rows), blank spacer rows that ARE part of the family GT,
// headerless date rows (blank stubs), pinned-0% coverage + footnote.
// Structural jitter per seed: number of date/factor rows (2-5), spacer count,
// coverage-column count (5-8) + label synonyms + reordered extras, gap position
// / presence, title & caption wording, shifted year range, font size +/-10%.
// GT: logical cols = 2 + nCov; cells = 1 (colspan title) + rows x cols,
// ~64-131 cells across seeds. All names/dates fictional (no eval carryover).
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p) => rng() < p;

  // ---- identity pools (all fictional; years shifted off the modeled era)
  const company = pick([
    "PACIFIC CREST CASUALTY COMPANY",
    "GOLDEN GATE INDEMNITY COMPANY",
    "SIERRA VERDE INSURANCE COMPANY",
    "WESTHAVEN CASUALTY COMPANY",
    "BLUE HARBOR MUTUAL INSURANCE COMPANY",
    "CASCADIA FIRE & CASUALTY COMPANY",
    "MERIDIAN VALLEY ASSURANCE COMPANY",
    "STONEBRIDGE INDEMNITY EXCHANGE",
  ]);
  const state = pick(["NEVADA", "OREGON", "COLORADO", "ARIZONA", "UTAH", "NEW MEXICO", "IDAHO", "KANSAS"]);
  const lob = pick([
    "PRIVATE PASSENGER AUTOMOBILE",
    "PERSONAL AUTOMOBILE PROGRAM",
    "PRIVATE PASSENGER AUTO LIABILITY AND PHYSICAL DAMAGE",
    "PERSONAL LINES AUTOMOBILE",
  ]);
  const exhibitTitle = pick([
    "PREMIUM TREND FACTORS",
    "DEVELOPMENT OF PREMIUM TREND FACTORS",
    "PREMIUM TREND FACTOR SELECTIONS",
    "CALCULATION OF PREMIUM TREND FACTORS",
    "PREMIUM TREND ANALYSIS",
  ]);
  const program = pick([
    "Preferred Program", "Standard Program", "Select Program", "Advantage Program",
    "Value Program", "Choice Program", "Signature Program", "Classic Program",
  ]);
  const showProgram = chance(0.8);

  const exhibitNo = ri(2, 14);
  const sheetNo = ri(1, 4);
  const hasRevised = chance(0.65);
  const B = ri(2013, 2022); // proposed effective year (shifted range)
  const revised = `(revised ${ri(1, 12)}/${ri(1, 28)}/${String(B - 1).slice(2)})`;
  const effDate = `${pick(["1/1", "4/1", "7/1"])}/${B}`;
  const avgLoss = `${pick(["10/1", "7/1", "4/1"])}/${B}`;
  const effLabel = pick(["Proposed Effective Date:", "Assumed Effective Date:"]);
  const avgLabel = pick(["Avg Date of Loss:", "Average Date of Loss:"]);
  const capPage = ri(3, 12);
  const capLine = ri(1, 9);
  const caption = pick([
    `Calculation of Premium Trend Factors for Rate Application Page ${capPage}, Line ${capLine}`,
    `Development of Premium Trend Factors for Rate Application Page ${capPage}, Line ${capLine}`,
    `Support for Premium Trend Factors, Rate Template Page ${capPage}, Row ${capLine}`,
    `Calculation of Premium Trend Factors for Filing Memorandum Page ${capPage}, Line ${capLine}`,
  ]);

  // ---- structural jitter
  const nYears = ri(2, 5); // date/factor rows (family base 3 -> +/-20-40%+)
  const spPre = ri(1, 2); // blank spacer rows before the section row
  const fyEnd = pick(["9/30", "12/31", "6/30", "3/31"]);
  const yearEnds = [];
  for (let i = 0; i < nYears; i++) yearEnds.push(`${fyEnd}/${B - 1 - nYears + i}`);
  const topPeriod = nYears + 1.5 + pick([0, 0.25, -0.25]);
  const periods = yearEnds.map((_, i) => topPeriod - i); // earliest year = longest period
  const periodStr = periods.map((p) => p.toFixed(2));

  const nPoints = pick([6, 8, 12, 12, 12, 16, 20, 24]);
  const fitKind = pick(["exponential", "exponential", "exponential", "linear"]);
  const refSheet = sheetNo === 1 ? 2 : 1;
  const fitTitle = `${nPoints} point ${fitKind} fit (see ${pick(["sheet", "Sheet"])} ${refSheet})`;

  // coverage columns: 4 fixed + 1-4 extras (reordered), label synonyms per seed
  const labelPools = {
    BI: ["BI", "Bod Inj"], PD: ["PD", "Prop Dam"], Coll: ["Coll", "Collision"],
    Comp: ["Comp", "Comprehensive", "OTC"], UM: ["UM", "UMBI"], MP: ["MP", "Med Pay"],
    UMPD: ["UMPD"], UIM: ["UIM"], Tow: ["Tow", "Towing"],
  };
  const trendGen = {
    BI: () => -(2.0 + rng() * 5.0), PD: () => -(0.5 + rng() * 2.5),
    Coll: () => 1.0 + rng() * 2.5, Comp: () => 3.0 + rng() * 4.0,
    UM: () => -(1.0 + rng() * 4.0), MP: () => -(6.0 + rng() * 8.0),
    UIM: () => -(1.5 + rng() * 3.0), Tow: () => 0.5 + rng() * 2.0,
    UMPD: () => 0, // pinned-0% family quirk
  };
  const extrasPool = ["UM", "MP", "UMPD", "UIM", "Tow"];
  for (let i = extrasPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [extrasPool[i], extrasPool[j]] = [extrasPool[j], extrasPool[i]];
  }
  const keys = ["BI", "PD", "Coll", "Comp", ...extrasPool.slice(0, ri(1, 4))];
  const nCov = keys.length; // 5..8

  const covs = keys.map((k) => {
    const t = trendGen[k]();
    const rate = Number(t.toFixed(1)) / 100;
    return {
      name: pick(labelPools[k]),
      pinned: k === "UMPD",
      pct: t.toFixed(1) + "%",
      factors: periods.map((p) => Math.pow(1 + rate, p).toFixed(3)),
      t,
    };
  });
  // identical-value saturation quirk: prospective row repeats historical (p=0.7)
  const pcts = covs.map((c) => c.pct);
  const prosPcts = chance(0.7)
    ? pcts
    : covs.map((c) => (c.pinned ? c.pct : (c.t + (rng() - 0.5)).toFixed(1) + "%"));
  const factorRows = yearEnds.map((d, i) => [d, covs.map((c) => c.factors[i])]);
  const empties = covs.map(() => "");

  const hasPinNote = covs.some((c) => c.pinned) && chance(0.8);
  const pinName = covs.find((c) => c.pinned)?.name ?? "";
  const noteText = pick([
    `Note: ${pinName} uses 0% trend`,
    `Note: a 0.0% trend is selected for ${pinName}`,
  ]);
  const sectionLabel = pick(["Premium Trend Factor", "Premium Trend Factors"]);
  const tpText = pick([
    "Trend Period (number of years from the midpoint of the accident year to the average date of loss)",
    "Trend Period (years from the accident year midpoint to the average date of loss)",
    "Trend Period (number of years from the accident year midpoint to the avg date of loss)",
  ]);

  // deliberate gap between column groups (position varies; occasionally absent)
  const hasGap = chance(0.85);
  const gapIdx = hasGap ? ri(3, nCov - 2) : nCov;
  const fs = (9.0 + rng() * 2.0).toFixed(1); // base font size +/-10% of 10pt
  const l2W = avgLabel.length > 20 ? 44 : 36;

  // ---- visual table (physical cols: 2 stubs + leading covs + [gap] + trailing)
  const physCols = 2 + nCov + (hasGap ? 1 : 0);
  const num = (v) => `<td class="n">${v}</td>`;
  const numRow = (vals) => {
    const tds = vals.map(num);
    return hasGap
      ? tds.slice(0, gapIdx).join("") + '<td class="gap"></td>' + tds.slice(gapIdx).join("")
      : tds.join("");
  };
  const blankRow = `<tr class="sp"><td colspan="${physCols}">&nbsp;</td></tr>`;

  const boxRows = [
    `<tr class="ttl"><td colspan="${physCols}">${fitTitle}</td></tr>`,
    `<tr><td></td><td></td>${numRow(covs.map((c) => c.name))}</tr>`,
    blankRow,
    `<tr><td class="s1">Selected</td><td class="s2">Historical</td>${numRow(pcts)}</tr>`,
    `<tr><td class="s1">Trend</td><td class="s2">Prospective</td>${numRow(prosPcts)}</tr>`,
    `<tr><td class="s1">(${nPoints} point)</td><td></td>${numRow(empties)}</tr>`,
    ...Array.from({ length: spPre }, () => blankRow),
    `<tr><td class="s1" colspan="2">${sectionLabel}</td>${numRow(empties)}</tr>`,
    ...factorRows.map(
      ([d, f], i) =>
        `<tr${i === nYears - 1 ? ' class="last"' : ""}><td></td><td class="dt">${d}</td>${numRow(f)}</tr>`
    ),
  ].join("\n");

  const miniRows = yearEnds
    .map((d, i) => `<div class="mini"><span class="md">${d}</span><span class="mv">${periodStr[i]}</span></div>`)
    .join("\n");

  const numW = ((172 - 45 - (hasGap ? 11 : 0)) / nCov).toFixed(1);
  const colTags = [
    '<col style="width:18mm">',
    '<col style="width:27mm">',
    ...covs.map(() => `<col style="width:${numW}mm">`),
  ];
  if (hasGap) colTags.splice(2 + gapIdx, 0, '<col style="width:11mm">');

  const titleLines = [company, lob, state, exhibitTitle];
  if (showProgram) titleLines.push(program);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; width: 210mm; height: 296mm; font-family: Arial, Helvetica, sans-serif;
         font-size: ${fs}pt; color: #000; filter: grayscale(1) contrast(1.05); }
  .wrap { padding: ${ri(6, 10)}mm 11mm 0; }
  .exh { text-align: right; line-height: 1.35; }
  .exh .rev { font-weight: bold; font-style: italic; }
  .titles { text-align: center; font-weight: bold; font-size: ${(Number(fs) + 0.5).toFixed(1)}pt; line-height: 1.4; margin-top: ${ri(4, 7)}mm; }
  .caption { text-align: center; font-weight: bold; font-size: ${(Number(fs) + 0.5).toFixed(1)}pt; margin-top: ${ri(6, 10)}mm; }
  .kv { margin-top: ${ri(9, 13)}mm; margin-left: 12mm; }
  .kv .l1 { display: inline-block; width: 47mm; }
  .kv .v1 { display: inline-block; width: 34mm; font-weight: bold; }
  .kv .l2 { display: inline-block; width: ${l2W}mm; }
  .kv .v2 { font-weight: bold; }
  .tp { margin-top: 7mm; margin-left: 12mm; }
  .minis { margin-top: 5mm; }
  .mini { line-height: 1.3; }
  .mini .md { display: inline-block; margin-left: 42mm; width: 20mm; text-align: right; }
  .mini .mv { display: inline-block; width: 16mm; text-align: right; }
  .box { border: 1.1pt solid #000; margin-top: 6mm; margin-left: 12mm; margin-right: 4mm; padding-bottom: 4px; }
  table { border-collapse: collapse; table-layout: fixed; width: 100%; font-size: ${fs}pt; }
  td { padding: 0.5pt 0; overflow: visible; }
  td.n { text-align: right; padding-right: 2mm; }
  td.gap {}
  td.s1 { padding-left: 1.5mm; white-space: nowrap; }
  td.s2 { white-space: nowrap; }
  td.dt { text-align: right; padding-right: 5mm; }
  tr.ttl td { text-align: center; border-bottom: 0.9pt solid #000; padding: 1pt 0; }
  tr.sp td { height: 11pt; }
  tr.last td { border-bottom: 0.8pt solid #000; }
  .note { margin-top: 9mm; margin-left: 12mm; }
  </style></head><body><div class="wrap">
  <div class="exh">Exhibit ${exhibitNo}<br>Sheet ${sheetNo}${hasRevised ? `<br><span class="rev">${revised}</span>` : ""}</div>
  <div class="titles">${titleLines.join("<br>")}</div>
  <div class="caption">${caption}</div>
  <div class="kv"><span class="l1">${effLabel}</span><span class="v1">${effDate}</span><span class="l2">${avgLabel}</span><span class="v2">${avgLoss}</span></div>
  <div class="tp">${tpText}</div>
  <div class="minis">
${miniRows}
  </div>
  <div class="box"><table>
  <colgroup>${colTags.join("")}</colgroup>
${boxRows}
  </table></div>
  ${hasPinNote ? `<div class="note">${noteText}</div>` : ""}
  </div></body></html>`;

  // ---- logical GT: (2 + nCov) cols; colspan title + data rows (spacers are
  // part of this family's GT convention, mirroring the modeled shape)
  const gtCols = 2 + nCov;
  const gtRow = (cells, tag = "td") =>
    "  <tr>\n" + cells.map((c) => `    <${tag}>${c}</${tag}>`).join("\n") + "\n  </tr>";
  const eAll = ["", "", ...empties];
  const gt = [
    "<table>",
    `  <tr>\n    <td colspan="${gtCols}">${fitTitle}</td>\n  </tr>`,
    gtRow(["", "", ...covs.map((c) => c.name)], "th"),
    gtRow(eAll),
    gtRow(["Selected", "Historical", ...pcts]),
    gtRow(["Trend", "Prospective", ...prosPcts]),
    gtRow([`(${nPoints} point)`, "", ...empties]),
    ...Array.from({ length: spPre }, () => gtRow(eAll)),
    gtRow([sectionLabel, "", ...empties]),
    ...factorRows.map(([d, f]) => gtRow(["", d, ...f])),
    "</table>",
  ].join("\n");

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
