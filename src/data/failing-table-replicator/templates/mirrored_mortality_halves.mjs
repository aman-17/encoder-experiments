// FAMILY generator — actuarial mortality-improvement page: one big table printed
// as two mirrored side-by-side halves (low ages left, high ages right), bordered
// title box, boxed gender banner spanning all physical columns, 3-line fragmented
// stacked headers, light-blue bold shaded projection-scale / basic-table columns,
// ragged blank block at high ages (improvement % cols go empty first, then only
// the two rate columns keep a constant terminal value).
// All names/years come from FICTIONAL pools (no real scales, agencies, table
// acronyms or eval-page dates). Seed-varied structure: data-row count (max age
// 90-126), improvement-column count (2-4), header year spans, title wording,
// font scale +/-10%, terminal value, blank-block extent, quirk toggles.
// GT = folded logical table: title row + banner row (2 merged cells) +
// 2x(3 header fragment rows) + (maxAge+1) age rows; cols = nSSA+4.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---------- structural knobs (seed-driven) ----------
  const maxAge = 90 + Math.floor(rng() * 37);        // 90..126 -> 91..127 data rows
  const nPct = 2 + Math.floor(rng() * 3);            // 2..4 population-improvement columns
  const C = nPct + 4;                                // logical cols: age + pcts + scale + 2 rates
  const fs = 0.9 + rng() * 0.2;                      // font scale +/-10%
  const gender = rng() < 0.5 ? "Male" : "Female";
  const tableNo = 7 + Math.floor(rng() * 18);

  // ---------- fictional identity pools (decontaminated) ----------
  const agency = pick(["NPB", "OVR", "PSD", "NVB", "CDR", "APB"]);        // population-stats bureau
  const acr = pick(["IAB", "ABM", "NBT", "PBM", "SAB", "IBT"]);           // basic-table acronym
  const scaleCode = pick(["H3", "K1", "M4", "R2", "T5", "W1", "J2", "P6"]);
  const endY = pick([1994, 1996, 1998, 2000, 2008, 2010, 2012, 2014]);    // shifted year anchor
  const expLbl = pick(["Exp.", "Exper."]);
  const expYear = endY - 2 - 2 * Math.floor(rng() * 3);
  const tblYear = endY + 4 + 2 * Math.floor(rng() * 4);
  const scaleName = `Scale ${scaleCode}`;
  const tblName = `${tblYear} ${acr} Basic Table`;
  const title = pick([
    `Table ${tableNo} - ${scaleName} versus Population Improvement and Resulting ${tblName}, ${gender}`,
    `Table ${tableNo} - Comparison of ${scaleName} with Population Improvement and the ${tblName}, ${gender}`,
    `Table ${tableNo} - ${scaleName} and Population Improvement Rates with Resulting ${tblName}, ${gender}`,
    `Table ${tableNo}. ${scaleName} versus General Population Improvement and Resulting ${tblName} - ${gender}`,
  ]);

  // header year spans for the improvement columns (ordered, era-shifted)
  const allSpans = [
    [endY - 16, endY], [endY - 10, endY], [endY - 4, endY], [endY + 6, endY + 16],
  ];
  const spanIdx = nPct === 2 ? [0, 3] : nPct === 3 ? [0, 2, 3] : [0, 1, 2, 3];
  const pctSpans = spanIdx.map((i) => allSpans[i]);

  // ---------- quirk knobs ----------
  const T = pick([300, 350, 375, 400, 425, 450, 500]);                 // terminal constant rate
  const pctCut = Math.min(maxAge - 4, 88 + Math.floor(rng() * 14));    // last age with improvement %
  const termAge = Math.min(maxAge, pctCut + 3 + Math.floor(rng() * 4)); // scale hits 0.0 / rates go constant
  const hasCm = rng() < 0.75;                                          // red Excel-comment triangle
  const shadeScale = rng() < 0.75;                                     // scale col shaded too, or only rate col
  const shade = pick(["#dce6f1", "#d9e2ef", "#dbe5f4"]);

  // ---------- curve helpers ----------
  const jit = (v, a) => v + (rng() * 2 - 1) * a;
  const lin = (pts) => (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, v1] = pts[i - 1], [x2, v2] = pts[i];
      if (x <= x2) return v1 + (v2 - v1) * (x - x1) / (x2 - x1);
    }
    return pts[pts.length - 1][1];
  };
  const loglin = (pts) => {
    const lp = pts.map(([x, v]) => [x, Math.log(v)]);
    const f = lin(lp);
    return (x) => Math.exp(f(x));
  };
  const fmtPct = (v) => {
    let r = Math.round(v * 10) / 10;
    if (r === 0) r = 0; // kill -0
    return r.toFixed(1) + "%";
  };

  // ---------- improvement % curve archetypes (one per improvement column) ----------
  const arch = [
    lin([[0, jit(2.2, .4)], [5, jit(3.2, .4)], [10, jit(4.0, .5)], [16, jit(2.4, .3)],
      [23, jit(0.6, .3)], [29, jit(2.0, .3)], [35, jit(2.7, .3)], [44, jit(0.9, .2)],
      [50, jit(0.6, .2)], [58, jit(1.8, .2)], [67, jit(2.1, .2)], [80, jit(1.5, .2)],
      [88, jit(0.5, .2)], [93, jit(-0.1, .15)], [110, jit(-0.5, .15)]]),
    lin([[0, jit(0.9, .5)], [4, jit(3.4, .5)], [7, jit(1.6, .5)], [11, jit(8.5, 1.0)],
      [15, jit(1.4, .4)], [19, jit(-0.7, .3)], [25, jit(-2.0, .3)], [33, jit(-0.1, .3)],
      [38, jit(2.0, .3)], [47, jit(1.2, .3)], [51, jit(-0.7, .3)], [57, jit(1.2, .3)],
      [63, jit(2.1, .3)], [70, jit(3.1, .3)], [80, jit(2.4, .3)], [90, jit(1.6, .3)],
      [97, jit(0.4, .2)], [110, jit(0.4, .2)]]),
    lin([[0, jit(1.9, .2)], [10, jit(2.6, .3)], [14, jit(1.3, .2)], [20, jit(0.9, .15)],
      [30, jit(1.1, .15)], [40, jit(1.0, .1)], [55, jit(1.3, .15)], [60, jit(1.5, .1)],
      [70, jit(1.1, .1)], [85, jit(0.6, .15)], [95, jit(0.4, .1)], [110, jit(0.4, .1)]]),
    lin([[0, jit(1.4, .3)], [6, jit(2.8, .4)], [13, jit(1.8, .3)], [21, jit(0.4, .2)],
      [30, jit(1.5, .25)], [42, jit(2.2, .25)], [55, jit(1.0, .2)], [66, jit(1.9, .2)],
      [78, jit(1.2, .2)], [90, jit(0.5, .15)], [110, jit(0.1, .1)]]),
  ];
  const pctFs = spanIdx.map((i) => arch[i]);

  // projection-scale trapezoid: flat base, ramp to peak, hold, decay to 0.0 at termAge
  const gBase = pick([0.8, 1.0, 1.1, 1.2]);
  const gPeak = gBase + pick([0.4, 0.5, 0.6]);
  const gA = 46 + Math.floor(rng() * 8);
  const gB = gA + 7 + Math.floor(rng() * 5);
  const gC = Math.min(Math.max(gB + 4, termAge - 20 - Math.floor(rng() * 8)), termAge - 6);
  const g2f = lin([[0, gBase], [gA, gBase], [gB, gPeak], [gC, gPeak], [termAge, 0.0]]);

  // ---------- mortality rates per 1000, 3 decimals ----------
  const q12base = [[0, 1.8], [1, 0.45], [3, 0.25], [6, 0.185], [9, 0.143], [11, 0.123],
    [13, 0.19], [15, 0.28], [18, 0.40], [20, 0.46], [23, 0.57], [26, 0.73], [29, 0.81],
    [32, 0.84], [34, 0.81], [36, 0.78], [38, 0.84], [40, 0.955], [44, 1.27], [48, 1.81],
    [52, 2.83], [56, 3.92], [60, 5.66], [64, 8.22], [68, 10.79], [72, 15.2], [76, 23.4],
    [80, 36.9], [84, 59.1], [88, 96.0], [92, 152.4], [96, 219.2], [100, 298.5], [104, 384.8]];
  const q12f = loglin(q12base.map(([x, v]) => [x, v * Math.exp((rng() * 2 - 1) * 0.07)]));
  const ratf = lin([[0, jit(1.22, .03)], [10, jit(1.43, .03)], [20, jit(1.02, .02)],
    [25, jit(0.98, .02)], [33, jit(1.06, .02)], [40, jit(1.13, .02)], [50, jit(1.05, .02)],
    [60, jit(1.17, .02)], [70, jit(1.24, .02)], [80, jit(1.21, .02)], [90, jit(1.11, .02)],
    [97, jit(1.04, .01)], [102, jit(1.01, .005)], [110, 1.0]]);

  // ---------- build (maxAge+1) logical age rows ----------
  const rows = [];
  for (let x = 0; x <= maxAge; x++) {
    let q12, q02;
    if (x >= termAge) { q12 = T; q02 = T; }
    else {
      q12 = q12f(x) * Math.exp((rng() * 2 - 1) * 0.008);
      const gap = termAge - x;
      if (gap <= 8) q12 = Math.max(q12, T * Math.exp(-0.155 * gap));
      q12 = Math.min(q12, T - 1.2 - rng() * 0.8);
      q02 = Math.min(q12 * ratf(x), T - 0.5);
    }
    rows.push({
      age: String(x),
      pcts: pctFs.map((f, i) =>
        x <= pctCut ? fmtPct(f(x) + (rng() * 2 - 1) * (i === 2 ? 0.10 : 0.12)) : ""),
      g2: x <= termAge ? fmtPct(g2f(x)) : "",
      q02: q02.toFixed(3),
      q12: q12.toFixed(3),
    });
  }

  // ---------- visual layout: two mirrored halves ----------
  const hl = Math.ceil(rows.length / 2);       // body rows; left ages 0..hl-1, right hl..maxAge
  const cmAge = hasCm ? 3 + Math.floor(rng() * Math.min(hl - 4, 12)) : -1;
  const shScale = shadeScale ? "sh" : "";
  const half = (r, isLeft) => {
    if (!r) return `<td class="a"></td>${"<td></td>".repeat(nPct)}<td class="${shScale}"></td><td class="r"></td><td class="sh r"></td>`;
    const cm = (isLeft && r.age === String(cmAge)) ? '<span class="cm"></span>' : "";
    return `<td class="a">${r.age}</td>` + r.pcts.map((v) => `<td>${v}</td>`).join("") +
      `<td class="${shScale}">${r.g2}</td><td class="r">${r.q02}</td><td class="sh r">${cm}${r.q12}</td>`;
  };
  let body = "";
  for (let i = 0; i < hl; i++) {
    body += `<tr>${half(rows[i], true)}${half(rows[hl + i] || null, false)}</tr>\n`;
  }

  // 3-line fragmented stacked headers
  const H1 = ["", ...pctSpans.map(() => agency), "", String(expYear), String(tblYear)];
  const H2 = ["", ...pctSpans.map(([a]) => String(a)), "Scale", expLbl, acr];
  const H3 = ["Age", ...pctSpans.map(([, b]) => `-${b}`), scaleCode, "Table", "Table"];
  const hrow = (cells) => `<tr class="h">${cells.map((c) => `<th>${c}</th>`).join("")}${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;

  const ageW = 7.5, rateW = 14.6;
  const pctW = (88 - ageW - 2 * rateW) / (nPct + 1);
  const colsHalf = `<col style="width:${ageW}mm">` +
    `<col style="width:${pctW.toFixed(2)}mm">`.repeat(nPct + 1) +
    `<col style="width:${rateW}mm">`.repeat(2);

  const topMargin = (9 + rng() * 4).toFixed(1);
  const rowH = Math.min(3.7 * fs, 238 / hl);
  const pt = (v) => (v * fs).toFixed(2) + "pt";
  const mm = (v) => v.toFixed(2) + "mm";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 210mm; position: relative; }
  .pgtop { position: absolute; top: 5mm; left: 9mm; font-size: ${pt(8)}; }
  .pgbot { text-align: right; margin: 4mm 11mm 0 0; font-size: ${pt(9.5)}; }
  .titlebox { border: 1pt solid #000; width: 176mm; margin: ${topMargin}mm auto 0;
              text-align: center; font-weight: bold; font-size: ${pt(9.5)}; padding: 1.4mm 0; }
  table { border-collapse: collapse; table-layout: fixed; width: 176mm;
          margin: 2.5mm auto 0; border: 1pt solid #000; }
  th, td { font-size: ${pt(6)}; padding: 0 0.6mm; text-align: center; overflow: hidden;
           white-space: nowrap; height: ${mm(rowH)}; line-height: 1; }
  tr.banner th { border: 0.5pt solid #999; font-size: ${pt(6.5)}; font-weight: bold; height: ${mm(rowH * 1.12)}; }
  tr.h th { border: 0.4pt solid #c4c4c4; font-weight: bold; height: ${mm(rowH * 0.95)}; }
  td { border: 0.3pt solid #e3e3e3; }
  td.a { font-weight: normal; }
  td.r { text-align: right; padding-right: 1.8mm; }
  td.sh { background: ${shade}; font-weight: bold; }
  td.sh.r { position: relative; }
  .cm { position: absolute; top: 0; right: 0; width: 0; height: 0;
        border-left: 1.1mm solid transparent; border-top: 1.1mm solid #c00; }
  </style></head><body>
  <div class="pgtop">${tableNo}</div>
  <div class="titlebox">${title}</div>
  <table>
  <colgroup>${colsHalf}${colsHalf}</colgroup>
  <tr class="banner"><th colspan="${2 * C}">${gender}</th></tr>
  ${hrow(H1)}
  ${hrow(H2)}
  ${hrow(H3)}
  ${body}</table>
  <div class="pgbot">${tableNo}</div>
  </body></html>`;

  // ---------- GT: folded logical C-col table ----------
  const gtHrow = (cells) => `  <tr>\n${cells.map((c) => `    <th>${c}</th>`).join("\n")}\n  </tr>`;
  const gtDrow = (r) => `  <tr>\n    <td>${r.age}</td>\n` +
    r.pcts.map((v) => `    <td>${v}</td>\n`).join("") +
    `    <td>${r.g2}</td>\n    <td>${r.q02}</td>\n    <td>${r.q12}</td>\n  </tr>`;
  const gt = "<table>\n"
    + `  <tr>\n    <th colspan="${C}">${title}</th>\n  </tr>\n`
    + `  <tr>\n    <th colspan="${C}">${gender}</th>\n  </tr>\n`
    + [gtHrow(H1), gtHrow(H2), gtHrow(H3)].join("\n") + "\n"
    + rows.slice(0, hl).map(gtDrow).join("\n") + "\n"
    + [gtHrow(H1), gtHrow(H2), gtHrow(H3)].join("\n") + "\n"
    + rows.slice(hl).map(gtDrow).join("\n")
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
