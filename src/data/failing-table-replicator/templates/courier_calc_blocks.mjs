// FAMILY generator (training data) — actuarial rate-filing worksheet print
// (Excel/Courier look): HEADERLESS calc blocks framed by DOUBLE vertical rails
// with thin top/bottom rules and zero internal gridlines.
// Upper block: seed-varied count of SNAKE_CASE variable rows with one far-right
// value each; heavy rule + oversized bold summary row at the bottom.
// Free-standing bold-italic underlined caption, then a ragged-arity 5-col lower
// block (lone dashes mid-row + '0' at the rail, identical-value "0.00"
// saturation rows, NA floating under column 4 as a colspan-2 cell). Optionally
// a second captioned mini-block of label/value rows. Rest of page blank.
// GT = ONE logical 5-col table; row/cell counts vary per seed (~90-160 cells).
// All wording drawn from fictional pools — no eval-page strings reused verbatim
// except generic regulatory vocabulary.
export function generate(seed) {
  const rng = mulberry32(seed);

  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const pct = (lo, hi) => (lo + rng() * (hi - lo)).toFixed(2) + "%";
  const npct = (lo, hi) => "-" + pct(lo, hi);
  const dec3 = (lo, hi) => (lo + rng() * (hi - lo)).toFixed(3);
  const money = (lo, hi) => "$" + (lo + rng() * (hi - lo)).toFixed(2);
  // ordered random subset: shuffle indices, take k, restore original order
  const ordSubset = (n, k) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, Math.min(k, n)).sort((x, y) => x - y);
  };

  // ---- typography / geometry jitter (±10% font, margin drift) ----
  const fs = +(9 * (0.9 + rng() * 0.2)).toFixed(2); // base pt
  const fsMax = +(fs * 1.28).toFixed(2); // oversized summary row
  const fsCap = +(fs * 1.06).toFixed(2); // caption
  const lh = +(1.36 + rng() * 0.14).toFixed(2);
  const padTop = +(17 + rng() * 4).toFixed(1);
  const padL = +(16.5 + rng() * 3).toFixed(1);
  const padR = +(16 + rng() * 3.5).toFixed(1);
  const upC1 = +(56 + rng() * 8).toFixed(1); // upper label column %

  // ---- upper block: pool of label/value generators, seed-varied subset ----
  // [nameVariants, valueGen]; first 3 entries are always included (family core)
  const upperPool = [
    [["MAX_PREMIUM", "MAX_AVG_PREMIUM", "MAX_PREM"], () => money(330, 460)],
    [["MIN_PREMIUM", "MIN_AVG_PREMIUM", "MIN_PREM"], () => money(215, 300)],
    [["CHANGE_AT_MIN", "CHG_AT_MIN", "RATE_CHG_AT_MIN"], () => npct(11, 20)],
    [["FIXED_INV_INC_FACTOR", "FIXED_INVEST_INC_FCTR"], () => pct(5, 12)],
    [["VAR_INV_INC_FACTOR", "VAR_INVEST_INC_FCTR"], () => pct(3, 8)],
    [["ANNUAL_NET_TREND", "NET_ANNUAL_TREND", "ANN_NET_TREND"], () => npct(2, 9)],
    [["COMP_TREND", "COMPOSITE_TREND", "CMPD_TREND"], () => npct(12, 30)],
    [["LOSS_TREND", "ANN_LOSS_TREND"], () => pct(2, 7)],
    [["EXP_TREND", "EXPENSE_TREND"], () => pct(1, 5)],
    [["MAX_PROFIT", "MAX_UW_PROFIT"], () => pct(8, 18)],
    [["MIN_PROFIT", "MIN_UW_PROFIT"], () => npct(5, 15)],
    [["UW_PROFIT", "TGT_UW_PROFIT", "SEL_UW_PROFIT"], () => pct(1, 6)],
    [["CRED_FACTOR", "CREDIBILITY_FCTR"], () => dec3(0.3, 0.95)],
    [["MAX_DENOM", "MAX_DENOMINATOR"], () => dec3(0.45, 0.62)],
    [["MIN_DENOM", "MIN_DENOMINATOR"], () => dec3(0.72, 0.88)],
    [["PERM_LOSS_RATIO", "PERMISSIBLE_LR"], () => dec3(0.55, 0.75)],
    [["CUR_PREMIUM", "CURR_AVG_PREMIUM"], () => money(250, 420)],
    [["FIT_FACTOR", "FIT_ADJ_FACTOR"], () => dec3(0.65, 0.8)],
  ];
  const nUpper = ri(9, 16); // base 13 ± ~30%
  const optIdx = ordSubset(upperPool.length - 3, nUpper - 3).map((i) => i + 3);
  const chosen = [0, 1, 2, ...optIdx].sort((x, y) => x - y);
  const upper = chosen.map((i) => [pick(upperPool[i][0]), upperPool[i][1]()]);
  const maxLabel = pick(["CHANGE_AT_MAX", "CHG_AT_MAX", "RATE_CHG_AT_MAX", "MAX_CHANGE"]);
  const changeAtMax = pct(17, 33); // oversized bold summary row

  // ---- captions: fictional pool, two distinct picks ----
  const capPool = [
    "Alternate Calculation with Quota Share Reinsurance",
    "Alternate Calculation Net of Ceded Reinsurance",
    "Revised Calculation with Excess of Loss Reinsurance",
    "Supplemental Calculation with Assumed Reinsurance",
    "Recalculation Including Catastrophe Reinsurance",
    "Alternate Computation with Facultative Reinsurance",
    "Restated Calculation with Aggregate Stop Loss",
  ];
  const capIdx = ordSubset(capPool.length, 2);
  const caption = capPool[capIdx[0]];
  const caption2 = capPool[capIdx[1]];

  // ---- lower block: ragged 5-col rows, seed-varied composition ----
  const dashChar = rng() < 0.7 ? "–" : "-"; // en dash vs hyphen quirk
  const railZero = rng() < 0.8 ? "0" : "-";
  const commLabel = pick(["COMMISSION_RATE", "CEDING_COMM_RATE", "REINS_COMM_RATE"]);
  const commVal = rng() < 0.6 ? "0.00%" : pct(0.5, 4);
  const lower = [[commLabel, "", "", "", commVal]];

  const dashLabels = ["RE_PREM", "RE_RECOV", "RE_CAT_PREM", "RE_CAT_RECOV"];
  for (const i of ordSubset(dashLabels.length, ri(1, 3)))
    lower.push([dashLabels[i], dashChar, "-", "-", railZero]);

  // identical-value saturation quirk: per-expo rows all "0.00" most seeds
  const zeroLabels = ["RE_PREM_PER_EXP", "RE_RECOV_PER_EXP", "RE_NET_COST_PER_EXP", "RE_MARGIN_PER_EXP"];
  const zeroSat = rng() < 0.75;
  for (const i of ordSubset(zeroLabels.length, ri(1, 3))) {
    const z = () => (zeroSat ? "0.00" : (rng() * 0.4).toFixed(2));
    lower.push([zeroLabels[i], z(), z(), z(), z()]);
  }

  const a = 1.15 + rng() * 0.5;
  const b = a + 0.04 + rng() * 0.25;
  const c = b + 0.08 + rng() * 0.35;
  const big = (95 + rng() * 85).toFixed(2);
  lower.push([pick(["COMP_LOSS_RE", "COMP_LOSS_NET_RE"]), a.toFixed(2), b.toFixed(2), c.toFixed(2), big]);
  if (rng() < 0.45) {
    const l1 = 0.5 + rng() * 0.2;
    lower.push([pick(["COMP_LR_RE", "COMP_LR_NET_RE"]), l1.toFixed(3), (l1 + 0.02 + rng() * 0.06).toFixed(3), (l1 + 0.05 + rng() * 0.09).toFixed(3), dec3(0.55, 0.8)]);
  }

  // NA rows: value floats under column 4 (rendered as a colspan-2 cell)
  const naLabels = ["RMAX_PREMIUM", "RMIN_PREMIUM", "RCHANGE_AT_MAX"];
  const naPick = ordSubset(naLabels.length, ri(1, 3));
  const naRows = naPick.map((i, k) => [naLabels[i], "NA", k === naPick.length - 1 && rng() < 0.8]);

  // ---- optional second captioned mini-block (label/value rows) ----
  const extraPool = [
    [["NET_COST_OF_RE", "NET_RE_COST"], () => money(4, 30)],
    [["RE_MARGIN", "RE_RISK_MARGIN"], () => pct(1, 6)],
    [["CAT_LOAD", "CAT_PROVISION"], () => pct(2, 9)],
    [["NET_TREND_ADJ", "TREND_ADJ_NET"], () => npct(1, 6)],
    [["RETENTION_FACTOR", "RETENTION_FCTR"], () => dec3(0.6, 0.95)],
    [["CEDED_LR", "CEDED_LOSS_RATIO"], () => dec3(0.35, 0.7)],
  ];
  const hasExtra = rng() < 0.4;
  const extra = hasExtra
    ? ordSubset(extraPool.length, ri(3, 5)).map((i) => [pick(extraPool[i][0]), extraPool[i][1]()])
    : [];

  // ---- lower colgroup width jitter ----
  const w1 = 38 + rng() * 5, w2 = 15 + rng() * 3, w3 = 13 + rng() * 2, w4 = 13 + rng() * 2;
  const w5 = 100 - w1 - w2 - w3 - w4;
  const wf = (x) => x.toFixed(1) + "%";

  // ---- HTML ----
  let upBody = upper
    .map(([l, v]) => `<tr><td class="l">${l}</td><td class="v">${v}</td></tr>`)
    .join("\n");
  upBody += `\n<tr class="max"><td class="l">${maxLabel}</td><td class="v">${changeAtMax}</td></tr>`;

  let loBody = lower
    .map(
      ([l, c2, c3, c4, c5]) =>
        `<tr><td class="l">${l}</td><td class="v${c2 === "–" ? " dsh" : ""}">${c2}</td><td class="v">${c3}</td><td class="v">${c4}</td><td class="v">${c5}</td></tr>`
    )
    .join("\n");
  loBody += naRows
    .map(
      ([l, v, bi]) =>
        `\n<tr><td class="l">${l}</td><td class="v"></td><td class="v"></td><td class="${bi ? "nab" : "na"}" colspan="2">${v}</td></tr>`
    )
    .join("");

  const extraHtml = hasExtra
    ? `\n  <div class="cap">${caption2}</div>
  <div class="blk"><table>
  <colgroup><col style="width:${upC1}%"><col style="width:${(100 - upC1).toFixed(1)}%"></colgroup>
  ${extra.map(([l, v]) => `<tr><td class="l">${l}</td><td class="v">${v}</td></tr>`).join("\n")}
  </table></div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 210mm; height: 296mm; color: #000; background: #fff; }
  .wrap { padding: ${padTop}mm ${padR}mm 0 ${padL}mm; }
  .blk { border-left: 4px double #000; border-right: 4px double #000;
         border-top: 1pt solid #000; border-bottom: 1.1pt solid #000; }
  td.dsh { padding-right: 9pt; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td { padding: 0 2px; font-size: ${fs}pt; line-height: ${lh}; white-space: nowrap; overflow: visible; }
  td.l { font-family: "Courier New", Courier, monospace; text-align: left; }
  td.v { font-family: Arial, Helvetica, sans-serif; text-align: right; }
  tr.max td { border-top: 1.8pt solid #000; font-weight: bold; font-size: ${fsMax}pt; line-height: 1.3; }
  .cap { margin: 3mm 0 0.7mm; font-family: "Courier New", Courier, monospace;
         font-weight: bold; font-style: italic; font-size: ${fsCap}pt;
         text-decoration: underline; }
  td.na, td.nab { font-family: Arial, Helvetica, sans-serif; text-align: center; }
  td.nab { font-weight: bold; font-style: italic; }
  </style></head><body><div class="wrap">
  <div class="blk"><table>
  <colgroup><col style="width:${upC1}%"><col style="width:${(100 - upC1).toFixed(1)}%"></colgroup>
  ${upBody}
  </table></div>
  <div class="cap">${caption}</div>
  <div class="blk"><table>
  <colgroup><col style="width:${wf(w1)}"><col style="width:${wf(w2)}"><col style="width:${wf(w3)}"><col style="width:${wf(w4)}"><col style="width:${wf(w5)}"></colgroup>
  ${loBody}
  </table></div>${extraHtml}
  </div></body></html>`;

  // ---- GT: one logical 5-col table (caption rows fold in as colspan=5) ----
  const gtRows = [];
  const lvRow = (l, v) =>
    `  <tr>\n    <td>${l}</td>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td>${v}</td>\n  </tr>`;
  for (const [l, v] of upper) gtRows.push(lvRow(l, v));
  gtRows.push(lvRow(maxLabel, changeAtMax));
  gtRows.push(`  <tr>\n    <td colspan="5">${caption}</td>\n  </tr>`);
  for (const [l, c2, c3, c4, c5] of lower)
    gtRows.push(`  <tr>\n    <td>${l}</td>\n    <td>${c2}</td>\n    <td>${c3}</td>\n    <td>${c4}</td>\n    <td>${c5}</td>\n  </tr>`);
  for (const [l, v] of naRows)
    gtRows.push(`  <tr>\n    <td>${l}</td>\n    <td></td>\n    <td></td>\n    <td colspan="2">${v}</td>\n  </tr>`);
  if (hasExtra) {
    gtRows.push(`  <tr>\n    <td colspan="5">${caption2}</td>\n  </tr>`);
    for (const [l, v] of extra) gtRows.push(lvRow(l, v));
  }
  const gt = "<table>\n" + gtRows.join("\n") + "\n</table>";

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
