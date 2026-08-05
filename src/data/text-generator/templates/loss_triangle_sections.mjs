// FAMILY GENERATOR — letter-portrait Excel-print actuarial loss-development
// workpaper: FIVE stacked sections on one page:
// (1) incurred-loss run-off triangle (NQ accident quarters x A development ages),
// (2) age-to-age factor triangle,
// (3) 'Age-to-Age' method-selection block (numbered averaging methods, optional
//     power-curve trio, optional stray lone 0.000, Selected, Method) with an
//     extra terminal-Ult column,
// (4) 'Age-to-Ultimate' block,
// (5) narrow centered reported/ultimate losses table (stub + 9 value cols).
// Light-blue bands, blue/red accent text, ~4pt type, ragged triangle right edges.
// Seed-varied structure: age-column count, accident-quarter count, averaging
// windows, method-block composition, label pools, fonts. All names/dates are
// fictional. GT = 5 logical tables, ~700-1300 cells depending on seed.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const f3 = (x) => x.toFixed(3);
  const fmt = (n) => n.toLocaleString("en-US");
  const r3 = (x) => Math.round(x * 1000) / 1000;

  // ---------------- structural knobs ----------------
  const A = 13 + Math.floor(rng() * 6);                       // development-age columns (13..18 -> max age 39..54 mo)
  const E = A >= 17 ? 2 + Math.floor(rng() * 3)               // fully-developed extra quarters
                    : 2 + Math.floor(rng() * 5);
  const NQ = A + E;                                           // accident quarters (15..24)
  const NI = A - 1;                                           // age-to-age intervals
  const W = 4 + Math.floor(rng() * 3);                        // short-average window (4..6)
  const W2 = W + 1 + Math.floor(rng() * 2);                   // weighted-average window
  const hasPower = rng() < 0.78;                              // (8)-(10) power-curve trio present
  const hasStray = rng() < 0.7;                               // stray lone 0.000 row present
  const maxAge = 3 * A;
  const satStart = Math.max(6, Math.round(A * 0.38));         // where 1.000-saturation kicks in

  // ---------------- typography knobs (±10%) ----------------
  const fsT = r3(3.9 + rng() * 0.8);                          // grid font pt (3.9..4.7, stays micro)
  const rh = (5.6 * fsT / 4).toFixed(1);                      // row height px
  const fsTitle = r3(6.1 + rng() * 0.9);
  const s5w = (31 + rng() * 7).toFixed(1);
  const stubW = (9 + rng() * 2.4).toFixed(1);
  const padTop = 92 + Math.floor(rng() * 28);

  // ---------------- furniture (fictional pools) ----------------
  const insurers = [
    "MERIDIAN SHIELD INSURANCE GROUP", "COBALT NATIONAL MUTUAL", "HARBORLINE CASUALTY COMPANY",
    "PINEFIELD FIRE &amp; CASUALTY", "VANTURA PROPERTY INSURERS", "SILVERBROOK INDEMNITY COMPANY",
    "TALONRIDGE ASSURANCE GROUP", "NORTHGALE MUTUAL INSURANCE",
  ];
  const state = pick(["OHIO", "GEORGIA", "COLORADO", "MINNESOTA", "ARIZONA", "VIRGINIA", "OREGON", "TENNESSEE"]);
  const scope = rng() < 0.5
    ? `${pick(insurers)} - ${pick(["COUNTRYWIDE", `${state} ONLY`])}`
    : pick([
        "ALL COMPANIES COMBINED - COUNTRYWIDE",
        `ALL COMPANIES COMBINED - ${state} ONLY`,
        "LEAD COMPANY ONLY - COUNTRYWIDE",
        "ALL COMPANIES COMBINED - EX CATASTROPHE",
        `GROUP TOTAL - ${state} DIRECT`,
      ]);
  const titleLn = pick(["LOSS DEVELOPMENT FACTOR", "LOSS DEVELOPMENT FACTORS",
    "INCURRED LOSS DEVELOPMENT", "LOSS DEVELOPMENT ANALYSIS"]);
  const peril = pick(["Wind &amp; Hail", "Fire &amp; Lightning", "Water Non-Weather", "All Other Perils",
    "Theft &amp; Vandalism", "Weather-Related Water", "Liability", "Hurricane &amp; Tropical Storm"]);
  const formTok = pick(["Form - All", "All Forms", "Forms Combined"]);
  const basisLn = pick(["INCURRED LOSSES NET OF SAL &amp; SUB (000's)",
    "INCURRED LOSSES NET OF SALVAGE &amp; SUBROGATION (000's)",
    "INCURRED LOSSES NET OF S&amp;S ($000s)", "DIRECT INCURRED LOSSES (000's)"]);

  const startY = 1990 + Math.floor(rng() * 10);               // 1990..1999: labels top out ~2005, clear of the real doc's era
  const q0 = Math.floor(rng() * 4);
  const qlab = [];
  for (let n = 0; n < NQ; n++) qlab.push(`${startY + Math.floor((q0 + n) / 4)}-${((q0 + n) % 4) + 1}`);
  const ageLab = Array.from({ length: A }, (_, k) => (k === A - 1 ? `${maxAge}+` : String(3 + 3 * k)));
  const intLab = Array.from({ length: NI }, (_, k) => `${3 + 3 * k} - ${k === NI - 1 ? `${maxAge}+` : String(6 + 3 * k)}`);
  const ultLab = Array.from({ length: A }, (_, k) => `${3 + 3 * k}-Ult`);
  const ultHdr = `${maxAge}-Ult`;

  // ---------------- label pools (HTML uses <br>, GT uses spaces) ----------------
  const stubT = pick(["Accident Qtr", "Accident Quarter", "Acc. Qtr"]);
  const stubTHtml = stubT.replace(" ", "<br>");
  const sec1Span = pick(["Age in Months", "Age in Months of Development", "Development Age (Months)"]);
  const sec2Span = pick(["Age-to-Age Development", "Age-to-Age Factors", "Development Factors by Age"]);
  const sec3Title = pick(["Age-to-Age", "Age-to-Age Factor Selection"]);
  const sec4Title = pick(["Age-to-Ultimate", "Age-to-Ult Factors"]);
  const s5Title = pick(["Reported and Ultimate Losses", "Reported &amp; Ultimate Losses",
    "Reported and Projected Ultimate Losses"]);
  const lab1 = pick(["(1) Latest Quarter", "(1) Most Recent Quarter"]);
  const lab2 = `(2) Last ${W} Quarter Avg`;
  const lab3 = `(3) Last ${W2} Qtr Wt Avg`;
  const lab4 = `(4) Avg ${W}Qtrs Ex Min&amp;Max`;
  const lab5 = pick(["(5) All Quarters Avg", "(5) All Qtr Average"]);
  const lab9 = pick(["(9) Inv Power", "(9) Inverse Power"]);
  const allYrLbl = pick(["All Year Average", "All Yr Average", "All Quarters Avg"]);
  const s5Stub = pick(["Accident Years", "Accident Quarters", "Acc. Years"]);
  const incLbl = pick(["Inc to Date", "Incurred to Date"]);

  // ---------------- incurred triangle ----------------
  const obs = (i) => Math.min(A, NQ - i);
  const inc = [];
  for (let i = 0; i < NQ; i++) {
    let v = Math.round(Math.exp(Math.log(130) + rng() * (Math.log(3200) - Math.log(130))));
    const row = [v];
    for (let j = 1; j < obs(i); j++) {
      const jj = j - 1;
      const c = jj === 0 ? 0.30 : jj === 1 ? 0.08 : jj === 2 ? 0.045 : jj === 3 ? 0.025
        : jj === 4 ? 0.015 : jj === 5 ? 0.010 : jj <= 8 ? 0.006 : jj <= 11 ? 0.003 : 0.0015;
      const r = rng();
      let f;
      if (jj >= satStart && r < 0.82) f = 1;
      else if (r < 0.12) f = 1 - c * (0.15 + rng() * 0.5);
      else f = 1 + c * (0.3 + rng() * 1.7);
      v = Math.max(1, Math.round(v * f));
      row.push(v);
    }
    inc.push(row);
  }

  // displayed age-to-age factors (recomputed from rounded incurred, as Excel would)
  const fac = inc.map((row) => row.slice(1).map((v, j) => r3(v / row[j])));

  // ---------------- per-interval method stats ----------------
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const m1 = [], m2 = [], m3 = [], m4 = [], m5 = [], m6 = [], m7 = [];
  for (let j = 0; j < NI; j++) {
    const fs = [], ws = [];
    for (let i = 0; i < NQ; i++) if (fac[i].length > j) { fs.push(fac[i][j]); ws.push([inc[i][j], inc[i][j + 1]]); }
    m1.push(fs[fs.length - 1]);
    m2.push(r3(mean(fs.slice(-W))));
    const w6 = ws.slice(-W2);
    m3.push(r3(w6.reduce((s, w) => s + w[1], 0) / w6.reduce((s, w) => s + w[0], 0)));
    const l5 = fs.slice(-W).slice().sort((a, b) => a - b);
    m4.push(r3(mean(l5.length >= 4 ? l5.slice(1, -1) : l5)));
    m5.push(r3(mean(fs)));
    m6.push(Math.max(...fs));
    m7.push(Math.min(...fs));
  }
  const selNum = pick([2, 3, 4]);
  const selBase = selNum === 2 ? m2 : selNum === 3 ? m3 : m4;
  const m8 = selBase.slice();
  const a9 = Math.max(selBase[0] - 1, 0.06);
  const m9 = Array.from({ length: NI }, (_, j) => r3(1 + a9 * Math.pow(j + 1, -1.55)));
  const u9 = 1.002;
  const a10 = 0.05 + rng() * 0.04;
  const m10 = Array.from({ length: NI }, (_, j) => r3(1 + a10 * Math.pow(0.72, j)));
  const u10 = 1;
  const sel = selBase.slice(), uSel = 1;

  // ---------------- age-to-ultimate ----------------
  const cumUlt = (v, ult) => {
    const out = new Array(A);
    out[A - 1] = r3(ult);
    let p = ult;
    for (let j = NI - 1; j >= 0; j--) { p *= v[j]; out[j] = r3(p); }
    return out;
  };
  const A1 = cumUlt(m1, 1), A2 = cumUlt(m2, 1), A3 = cumUlt(m3, 1), A4 = cumUlt(m4, 1),
    A5 = cumUlt(m5, 1), A6 = cumUlt(m6, 1), A7 = cumUlt(m7, 1), ASel = cumUlt(sel, 1);

  // ---------------- reported and ultimate losses ----------------
  const s5rows = inc.map((row, i) => {
    const d = obs(i) - 1;
    const cur = row[d];
    const u = (Ax) => fmt(Math.round(cur * Ax[d]));
    return [qlab[i], fmt(cur), u(ASel), u(A1), u(A2), u(A3), u(A4), u(A5), u(A6), u(A7)];
  });

  // ================= HTML =================
  const tail = (pad) => (pad === 0 ? "" : pad === 1 ? "<td></td>" : `<td colspan="${pad}"></td>`);
  const stubCol = `<colgroup><col style="width:${stubW}%"></colgroup>`;

  const t1body = inc.map((row, i) =>
    `<tr><td class="stub">${qlab[i]}</td>${row.map((v) => `<td class="n">${fmt(v)}</td>`).join("")}${tail(A - row.length)}</tr>`
  ).join("\n");

  const t2body = fac.slice(0, NQ - 1).map((row, i) =>
    `<tr><td class="stub">${qlab[i]}</td>${row.map((v) => `<td class="n">${f3(v)}</td>`).join("")}${tail(NI - row.length)}</tr>`
  ).join("\n");

  const mrow = (label, vals, ult, cls) =>
    `<tr${cls ? ` class="${cls}"` : ""}><td class="mstub">${label}</td>${vals.map((v) => `<td class="n">${f3(v)}</td>`).join("")}${ult == null ? "<td></td>" : `<td class="n">${f3(ult)}</td>`}</tr>`;

  const t3rows = [
    mrow(lab1, m1, null),
    mrow(lab2, m2, null),
    mrow(lab3, m3, null),
    mrow(lab4, m4, null),
    mrow(lab5, m5, null),
    mrow("(6) High", m6, null),
    mrow("(7) Low", m7, null),
  ];
  if (hasPower) {
    t3rows.push(mrow("(8) Sel. Data for Power Curve", m8, null, "blue"));
    t3rows.push(mrow(lab9, m9, u9, "blue"));
    t3rows.push(mrow("(10) Double Exponential", m10, u10, "blue"));
  }
  if (hasStray) t3rows.push(`<tr class="blue"><td colspan="${NI + 1}"></td><td class="n">0.000</td></tr>`);
  t3rows.push(mrow("Selected", sel, uSel, "selrow"));
  t3rows.push(`<tr><td class="mstub">Method</td>${Array.from({ length: NI }, () => `<td class="n">${selNum}</td>`).join("")}<td></td></tr>`);
  const t3body = t3rows.join("\n");

  const urow = (label, Ax, cls) =>
    `<tr${cls ? ` class="${cls}"` : ""}><td class="mstub">${label}</td>${Ax.map((v) => `<td class="n">${f3(v)}</td>`).join("")}</tr>`;
  const t4body = [
    urow(lab1, A1), urow(lab2, A2),
    urow(lab3, A3), urow(lab4, A4),
    urow(lab5, A5), urow("(6) High", A6), urow("(7) Low", A7),
    urow("Selected", ASel, "selrow"),
  ].join("\n");

  const s5headHtml = [s5Stub.replace(" ", "<br>"), incLbl.replace(" to ", " to<br>"), "Selected<br>Ult. Loss",
    lab1.slice(4).replace(" ", "<br>"), `Last ${W}<br>Quarter<br>Avg`, `Last ${W2} Qtr<br>Wt Avg`,
    `Avg ${W}Qtrs<br>Ex<br>Min&amp;Max`, allYrLbl.replace(" ", "<br>"), "High", "Low"]
    .map((h) => `<th class="s5h">${h}</th>`).join("");
  const t5body = s5rows.map((r) =>
    `<tr><td class="stub">${r[0]}</td><td class="n">${r[1]}</td><td class="n blue2">${r[2]}</td>${r.slice(3).map((v) => `<td class="n">${v}</td>`).join("")}</tr>`
  ).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; box-sizing: border-box; width: 216mm; height: 279mm;
         padding: ${padTop}px 76px 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .tb { text-align: center; font-weight: bold; font-size: ${fsTitle}pt; line-height: 1.5; margin-bottom: 8px; }
  .tb .red { color: #c00000; }
  table.sec { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 7px;
              border: 0.5pt solid #7f9db9; }
  .sec th, .sec td { font-size: ${fsT}pt; height: ${rh}px; line-height: 1.05; padding: 0 2px 0 0;
                     overflow: hidden; white-space: nowrap; }
  .sec th { background: #daeef3; font-weight: bold; text-align: center; padding: 1px 1px 0.5px;
            border-bottom: 0.4pt solid #9dc3d4; }
  .sec th.lbl { text-align: left; padding-left: 3px; }
  td.n { text-align: right; }
  td.stub { font-weight: bold; text-align: left; padding-left: 3px; }
  td.mstub { text-align: left; padding-left: 3px; }
  tr.blue td { color: #0000cc; }
  tr.selrow td { color: #0000cc; background: #ffffcc; }
  td.blue2 { color: #0000cc; }
  table.s5 { width: ${s5w}%; border-collapse: collapse; table-layout: fixed; margin: 18px auto 0; }
  .s5 th, .s5 td { font-size: ${fsT}pt; line-height: 1.15; padding: 0 2px; overflow: hidden; }
  .s5 th.t { font-size: ${r3(fsT + 0.5)}pt; font-weight: bold; text-align: center; padding: 2px 0; }
  .s5 th.s5h { font-weight: bold; text-align: center; vertical-align: bottom;
               border-bottom: 0.5pt solid #000; white-space: normal; }
  .s5 td { height: ${rh}px; white-space: nowrap; }
  </style></head><body>
  <div class="tb">${scope}<br>${titleLn}<br><span class="red">${formTok} (${peril})</span><br>${basisLn}</div>

  <table class="sec">${stubCol}
  <tr><th rowspan="2" class="lbl">${stubTHtml}</th><th colspan="${A}">${sec1Span}</th></tr>
  <tr>${ageLab.map((a) => `<th>${a}</th>`).join("")}</tr>
  ${t1body}
  </table>

  <table class="sec">${stubCol}
  <tr><th rowspan="2" class="lbl">${stubTHtml}</th><th colspan="${NI}">${sec2Span}</th></tr>
  <tr>${intLab.map((a) => `<th>${a}</th>`).join("")}</tr>
  ${t2body}
  </table>

  <table class="sec">${stubCol}
  <tr><th colspan="${NI + 2}" class="lbl">${sec3Title}</th></tr>
  <tr><th class="lbl">Method</th>${intLab.map((a) => `<th>${a}</th>`).join("")}<th>${ultHdr}</th></tr>
  ${t3body}
  </table>

  <table class="sec">${stubCol}
  <tr><th colspan="${A + 1}" class="lbl">${sec4Title}</th></tr>
  <tr><th class="lbl">Method</th>${ultLab.map((a) => `<th>${a}</th>`).join("")}</tr>
  ${t4body}
  </table>

  <table class="s5"><colgroup><col style="width:12%"></colgroup>
  <tr><th class="t" colspan="10">${s5Title}</th></tr>
  <tr>${s5headHtml}</tr>
  ${t5body}
  </table>
  </body></html>`;

  // ================= GT (logical tables) =================
  const gt1 = `<table>\n  <tr><th rowspan="2">${stubT}</th><th colspan="${A}">${sec1Span}</th></tr>\n  <tr>${ageLab.map((a) => `<th>${a}</th>`).join("")}</tr>\n` +
    inc.map((row, i) => `  <tr><td>${qlab[i]}</td>${row.map((v) => `<td>${fmt(v)}</td>`).join("")}${tail(A - row.length)}</tr>`).join("\n") +
    `\n</table>`;

  const gt2 = `<table>\n  <tr><th rowspan="2">${stubT}</th><th colspan="${NI}">${sec2Span}</th></tr>\n  <tr>${intLab.map((a) => `<th>${a}</th>`).join("")}</tr>\n` +
    fac.slice(0, NQ - 1).map((row, i) => `  <tr><td>${qlab[i]}</td>${row.map((v) => `<td>${f3(v)}</td>`).join("")}${tail(NI - row.length)}</tr>`).join("\n") +
    `\n</table>`;

  const gtM = (label, vals, ult) =>
    `  <tr><td>${label}</td>${vals.map((v) => `<td>${f3(v)}</td>`).join("")}${ult == null ? "<td></td>" : `<td>${f3(ult)}</td>`}</tr>`;
  const gt3rows = [
    gtM(lab1, m1, null),
    gtM(lab2, m2, null),
    gtM(lab3, m3, null),
    gtM(lab4, m4, null),
    gtM(lab5, m5, null),
    gtM("(6) High", m6, null),
    gtM("(7) Low", m7, null),
  ];
  if (hasPower) {
    gt3rows.push(gtM("(8) Sel. Data for Power Curve", m8, null));
    gt3rows.push(gtM(lab9, m9, u9));
    gt3rows.push(gtM("(10) Double Exponential", m10, u10));
  }
  if (hasStray) gt3rows.push(`  <tr><td colspan="${NI + 1}"></td><td>0.000</td></tr>`);
  gt3rows.push(gtM("Selected", sel, uSel));
  gt3rows.push(`  <tr><td>Method</td>${Array.from({ length: NI }, () => `<td>${selNum}</td>`).join("")}<td></td></tr>`);
  const gt3 = `<table>\n  <tr><th colspan="${NI + 2}">${sec3Title}</th></tr>\n  <tr><th>Method</th>${intLab.map((a) => `<th>${a}</th>`).join("")}<th>${ultHdr}</th></tr>\n` +
    gt3rows.join("\n") + `\n</table>`;

  const gtU = (label, Ax) => `  <tr><td>${label}</td>${Ax.map((v) => `<td>${f3(v)}</td>`).join("")}</tr>`;
  const gt4 = `<table>\n  <tr><th colspan="${A + 1}">${sec4Title}</th></tr>\n  <tr><th>Method</th>${ultLab.map((a) => `<th>${a}</th>`).join("")}</tr>\n` + [
    gtU(lab1, A1), gtU(lab2, A2),
    gtU(lab3, A3), gtU(lab4, A4),
    gtU(lab5, A5), gtU("(6) High", A6), gtU("(7) Low", A7),
    gtU("Selected", ASel),
  ].join("\n") + `\n</table>`;

  const s5headGt = [s5Stub, incLbl, "Selected Ult. Loss", lab1.slice(4),
    `Last ${W} Quarter Avg`, `Last ${W2} Qtr Wt Avg`, `Avg ${W}Qtrs Ex Min&amp;Max`, allYrLbl, "High", "Low"];
  const gt5 = `<table>\n  <tr><th colspan="10">${s5Title}</th></tr>\n  <tr>${s5headGt.map((h) => `<th>${h}</th>`).join("")}</tr>\n` +
    s5rows.map((r) => `  <tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("\n") +
    `\n</table>`;

  const gt = [gt1, gt2, gt3, gt4, gt5].join("\n\n");

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
