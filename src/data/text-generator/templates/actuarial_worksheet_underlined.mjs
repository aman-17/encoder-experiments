// FAMILY generator (training data) — landscape actuarial commutation worksheet:
// centered company/form title, key-value preamble (left cluster Plan/Sex/Class/
// Issue Age/Face Amount with gray highlight cells; right cluster NF Interest
// Rate/# Prem Payments/PVFB/NLP/Pa), then ONE wide N-row x 17-visual-column
// table. Almost no gridlines: each header abbreviation individually underlined
// (italic bold), vertical rules fencing the last two columns (tCVx/tRPUx) under
// a caption stack, typeset math header a-umlaut_{x+t:n|}.
// GT: preamble swallowed as 5-7 rows + 2 header rows + ROWS data rows, all x 13
// logical columns; the 17 visual columns fuse to 13 by joining the near-touching
// pairs (Mx Mbarx), (1000*Ax 1000*ABarx), (a-umlaut PVFBx+t), (tCVx tRPUx).
// Seed-varied: row count (25-43), preamble rows, company/form/subtitle pools
// (all fictional), label synonyms, header caption wording, font scale +/-10%,
// highlight pattern, spacer rows, extra vertical fence quirk.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = a => a[Math.floor(rng() * a.length)];

  // ---- fictional identity pools (no real insurers / forms / dates) ----
  const companies = [
    "Prairie Ridge Life Insurance Company",
    "Harvest Mutual Life Insurance Company",
    "Bluestem Life Assurance Company",
    "Copperleaf Life Insurance Company",
    "Granite Basin Life Insurance Company",
    "Silver Fir Mutual Life Insurance Company",
    "Windrose Mutual Life Insurance Company",
    "Cedar Hollow Life Insurance Company",
  ];
  const company = pick(companies);
  const formNo = `ICC${16 + Math.floor(rng() * 9)}${pick(["(WL)", "(WL)-1", "(WL)-2", "(WL-NF)", "(WL)A", "(WLNF)"])}`;
  const form = pick(["Policy Form ", "Form "]) + formNo;
  const subtitle = rng() < 0.45 ? pick([
    "Whole Life — Net Level Premium Basis",
    "Commutation Functions and Nonforfeiture Values",
    "Net Level Premiums and Minimum Cash Values",
    "Actuarial Demonstration of Nonforfeiture Values",
  ]) : null;

  // ---- structural jitter ----
  const ROWS = 25 + Math.floor(rng() * 19);      // 25..43 data rows (base 31 +/-20-40%)
  const issueAge = 25 + Math.floor(rng() * 21);  // 25..45
  const iPct = pick([3.0, 3.25, 3.5, 3.75, 4.0, 4.25, 4.5]);
  const i = iPct / 100, v = 1 / (1 + i);
  const n = pick([10, 15, 20, 25].filter(x => x <= ROWS - 4)); // premium-paying years
  const sex = rng() < 0.6 ? "M" : "F";
  const cls = pick(["SN", "PN", "SM", "NS", "PT", "UT"]);
  const face = pick([25000, 50000, 75000, 100000, 150000, 200000, 250000]);

  // font scale +/-10%, clamped so tall tables still fit one page
  let fs = 0.9 + rng() * 0.2;
  if (ROWS >= 40) fs = Math.min(fs, 0.98);
  else if (ROWS >= 36) fs = Math.min(fs, 1.04);
  const pt = x => (x * fs).toFixed(2) + "pt";
  const padTop = (7 + rng() * 4).toFixed(1);     // whitespace jitter

  // quirk toggles
  const hiSet = new Set(pick([["plan", "face"], ["plan"], ["face"], ["plan", "face", "age"], ["face", "sex"]]));
  const hasClass = rng() < 0.85;
  const hasMat = rng() < 0.35;
  const extraSpacer = rng() < 0.3;
  const extraVr = rng() < 0.22;                  // extra fence before PVFPa (visual only)
  const mult = rng() < 0.5 ? "*" : "";           // "1000*qx" vs "1000qx" label style

  // label synonym pools
  const planLbl = pick(["Plan", "Plan of Insurance"]);
  const classLbl = pick(["Class", "Risk Class"]);
  const issueAgeLbl = pick(["Issue Age", "Age at Issue"]);
  const faceLbl = pick(["Face Amount", "Face Amt"]);
  const rateLbl = pick(["NF Interest Rate", "Nonforfeiture Interest Rate", "NF Int Rate"]);
  const nLbl = pick(["# of Prem Payments (n)", "# Premium Payments (n)", "No. of Prem Payments (n)"]);
  const matLbl = pick(["Maturity Age", "Terminal Age"]);

  const fmt = (x, d) =>
    x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // mortality: smooth exponential 1000*qx with seeded level/slope + jitter
  const q0 = 1.2 + rng() * 0.5;
  const B = 0.062 + rng() * 0.012;
  const A = q0 / Math.exp(B * issueAge);
  const q1000 = [];
  let prevq = 0;
  for (let t = 1; t <= ROWS; t++) {
    const age = issueAge + t - 1;
    let q = A * Math.exp(B * age) * (1 + (rng() - 0.5) * 0.05);
    q = Math.max(prevq + 0.01, Math.round(q * 100) / 100);
    q1000.push(Number(q.toFixed(2)));
    prevq = q;
  }

  // commutation functions (radix 1000 at issue, D1 = 1000)
  const tpx = [1], Lx = [], Dx = [], Cx = [];
  for (let t = 1; t <= ROWS; t++) {
    if (t > 1) tpx[t - 1] = tpx[t - 2] * (1 - q1000[t - 2] / 1000);
    Lx[t - 1] = 1000 * tpx[t - 1];
    Dx[t - 1] = 1000 * Math.pow(v, t - 1) * tpx[t - 1];
    Cx[t - 1] = Lx[t - 1] * (q1000[t - 1] / 1000) * Math.pow(v, t);
  }
  const Mx = new Array(ROWS), Nx = new Array(ROWS);
  Mx[ROWS - 1] = Cx[ROWS - 1] + Dx[ROWS - 1] * (0.48 + rng() * 0.05);
  Nx[ROWS - 1] = Dx[ROWS - 1] * (12 + rng() * 3);
  for (let t = ROWS - 2; t >= 0; t--) {
    Mx[t] = Cx[t] + Mx[t + 1];
    Nx[t] = Dx[t] + Nx[t + 1];
  }
  const k = i / Math.log(1 + i); // continuous-payment adjustment Mbar = k*M

  const NLP = 1000 * Mx[0] / (Nx[0] - Nx[n]);
  const Pa = Number((NLP * (1.14 + rng() * 0.04)).toFixed(4));
  const pvfbStr = fmt(k * Mx[0], 4), nlpStr = fmt(NLP, 4), paStr = fmt(Pa, 4);
  const plan = `${n}Pay`, rateStr = iPct.toFixed(2) + "%", faceStr = fmt(face, 0);
  const matAge = String(issueAge + ROWS);

  // per-row formatted strings, 17 visual columns
  const rows = [];
  for (let t = 1; t <= ROWS; t++) {
    const j = t - 1, age = issueAge + j;
    const Ax = 1000 * Mx[j] / Dx[j], ABar = k * Ax;
    const ann = t <= n ? (Nx[j] - Nx[n]) / Dx[j] : null;
    const pvfpa = ann === null ? null : Pa * ann;
    const cvraw = (ABar - (pvfpa || 0)) * face / 1000;
    const cv = cvraw >= 0.5 ? Math.round(cvraw) : null;
    const rpu = cv === null ? null : (t > n ? face : Math.min(face, cv / (ABar / 1000)));
    rows.push([
      String(t), String(age), q1000[j].toFixed(2), tpx[j].toFixed(7),
      fmt(Lx[j], 4), fmt(Cx[j], 4), fmt(Dx[j], 4), fmt(Mx[j], 4),
      fmt(k * Mx[j], 4), fmt(Nx[j], 4), fmt(Ax, 4), fmt(ABar, 4),
      ann === null ? "-" : fmt(ann, 4), fmt(ABar, 4),
      pvfpa === null ? "-" : fmt(pvfpa, 4),
      cv === null ? "-" : fmt(cv, 2), rpu === null ? "-" : fmt(rpu, 2),
    ]);
  }

  const colw = [12, 9, 12, 18, 18, 15, 18, 16, 12, 21, 17, 18, 14, 28, 17, 16, 16];
  const cols = colw.map(w => `<col style="width:${w}mm">`).join("");
  const body = rows.map(r =>
    "<tr>" + r.map((c, ci) => {
      const cl = [ci >= 15 || (extraVr && ci === 14) ? "vr" : "", c === "-" ? "dash" : ""]
        .filter(Boolean).join(" ");
      return `<td${cl ? ` class="${cl}"` : ""}>${c}</td>`;
    }).join("") + "</tr>"
  ).join("\n");

  // header caption wording pools (render <br>-stacked; GT joins with spaces)
  const yearCap = pick([["Beginning", "Of"], ["Beginning of", "Policy"], ["Beg. of", "Policy"]]);
  const snflCap = pick([["Beginning of", "Year", "SNFL"], ["Beg. of Year", "SNFL"], ["Beginning of", "Year", "Min CV"]]);
  const rpuCap = pick([["Reduced", "Paid-up"], ["Reduced", "Paid-Up", "Insurance"]]);
  const capH = lines => {
    const p = lines.slice();
    while (p.length < 3) p.push("&nbsp;");
    return p.join("<br>");
  };

  const head = `<tr>
  <th><div class="cap">${yearCap.join("<br>")}</div><span class="u">Year</span></th>
  <th><span class="u">Age</span><div class="s2">x+t</div></th>
  <th><span class="u">1000${mult}q<sub>x</sub></span></th>
  <th><span class="u"><sub>t</sub>p<sub>x</sub></span></th>
  <th><span class="u">L<sub>x</sub></span></th>
  <th><span class="u">C<sub>x</sub></span></th>
  <th><span class="u">D<sub>x</sub></span></th>
  <th><span class="u">M<sub>x</sub></span></th>
  <th><span class="u">Mbar<sub>x</sub></span></th>
  <th><span class="u">N<sub>x</sub></span></th>
  <th><span class="u">1000${mult}A<sub>x+t</sub></span></th>
  <th><span class="u">1000${mult}ABar<sub>x+t</sub></span></th>
  <th class="math"><i>&auml;</i><sub>x+t:<span class="ol">n</span>|</sub></th>
  <th><span class="u">PVFB<sub>x+t</sub></span></th>
  <th${extraVr ? ' class="vr"' : ""}><span class="u">PVFP<sub>a</sub></span></th>
  <th class="vr"><div class="cap">${capH(snflCap)}</div><span class="u"><sub>t</sub>CV<sub>x</sub></span></th>
  <th class="vr"><div class="cap">${capH(rpuCap)}</div><span class="u"><sub>t</sub>RPU<sub>x</sub></span></th>
</tr>`;

  // ---- preamble rows: [leftLbl, leftVal, rightLbl, rightVal, hiFlag] | null = spacer ----
  const pre = [];
  pre.push([planLbl, plan, rateLbl, rateStr, hiSet.has("plan")]);
  pre.push(["Sex", sex, nLbl, String(n), hiSet.has("sex")]);
  if (extraSpacer) pre.push(null);
  if (hasClass) pre.push([classLbl, cls, "", "", false]);
  pre.push(null);
  pre.push([issueAgeLbl, String(issueAge), "PVFB", pvfbStr, hiSet.has("age")]);
  pre.push([faceLbl, faceStr, "NLP", nlpStr, hiSet.has("face")]);
  pre.push(hasMat ? [matLbl, matAge, "Pa", paStr, false] : ["", "", "Pa", paStr, false]);

  const preHtml = pre.map(r => {
    if (r === null) return `<tr class="sp"><td colspan="5"></td></tr>`;
    const [ll, lv, rl, rv, hi] = r;
    return `<tr><td class="pl">${ll}</td><td class="pv${hi ? " hi" : ""}">${lv}</td><td></td>`
      + `<td class="rl">${rl}</td><td class="rv">${rv}</td></tr>`;
  }).join("\n  ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  body { margin: 0; width: 296mm; height: 209mm; font-family: Arial, Helvetica, sans-serif;
         color: #000; font-size: ${pt(7)}; }
  .wrap { padding: ${padTop}mm 10mm 0; }
  .title { text-align: center; font-weight: bold; font-size: ${pt(9)}; }
  .title .form { font-size: ${pt(7.5)}; font-style: italic; }
  table.pre { border-collapse: collapse; width: 100%; margin-top: 5mm; }
  table.pre td { padding: 0.3pt 0; height: ${pt(9.5)}; vertical-align: bottom; }
  td.pl { width: 26mm; font-weight: bold; font-style: italic; }
  td.pv { width: 15mm; text-align: right; }
  td.pv.hi { background: #c9c9c9; }
  td.rl { width: 48mm; font-weight: bold; }
  td.rv { width: 23mm; text-align: right; }
  tr.sp td { height: ${pt(8)}; }
  table.main { border-collapse: collapse; table-layout: fixed; margin-top: 4.5mm; }
  table.main th, table.main td { padding: 0.4pt 1.5pt 0.4pt 0; font-size: ${pt(6.8)}; }
  table.main td { text-align: right; height: ${pt(8.6)}; }
  table.main th { text-align: center; vertical-align: bottom; font-weight: normal;
                  line-height: 1.2; padding-bottom: 3pt; }
  .u { font-weight: bold; font-style: italic; text-decoration: underline; }
  .cap { font-weight: bold; line-height: 1.15; margin-bottom: 2pt; }
  .s2 { font-style: italic; font-size: ${pt(6)}; margin-top: 0.5pt; }
  th.math { font-family: Georgia, "Times New Roman", serif; font-weight: bold;
            font-style: italic; font-size: ${pt(7.2)}; }
  .ol { border-top: 0.6pt solid #000; }
  .vr { border-left: 0.7pt solid #000; }
  td.dash { padding-right: 5pt; }
  sub { font-size: ${pt(4.8)}; }
  </style></head><body><div class="wrap">
  <div class="title">${company}<br><span class="form">${form}</span>${subtitle ? `<br><span class="form">${subtitle}</span>` : ""}</div>
  <table class="pre">
  ${preHtml}
  </table>
  <table class="main">${cols}\n${head}\n${body}</table>
  </div></body></html>`;

  // ---- GT: one 13-col table, preamble absorbed, fused column pairs ----
  const fuse = r => [
    r[0], r[1], r[2], r[3], r[4], r[5], r[6],
    `${r[7]} ${r[8]}`, r[9], `${r[10]} ${r[11]}`, `${r[12]} ${r[13]}`,
    r[14], `${r[15]} ${r[16]}`,
  ];
  const pad = cells => {
    const out = new Array(13).fill("");
    out[0] = cells[0] ?? ""; out[1] = cells[1] ?? "";
    out[11] = cells[2] ?? ""; out[12] = cells[3] ?? "";
    return out;
  };
  const preambleGT = pre.filter(r => r !== null)
    .map(([ll, lv, rl, rv]) => pad([ll, lv, rl, rv]));
  const h1 = [yearCap.join(" "), ...new Array(11).fill(""),
    `${snflCap.join(" ")} ${rpuCap.join(" ")}`];
  const h2 = ["Year", "Age x+t", `1000${mult}qx`, "tpx", "Lx", "Cx", "Dx", "Mx Mbarx",
    "Nx", `1000${mult}Ax+t 1000${mult}ABarx+t`, "äx+t:n| PVFBx+t", "PVFPa", "tCVx tRPUx"];
  const tr = (cells, tag) =>
    "  <tr>\n" + cells.map(c => `    <${tag}>${c}</${tag}>`).join("\n") + "\n  </tr>";
  const gt = "<table>\n"
    + preambleGT.map(r => tr(r, "td")).join("\n") + "\n"
    + tr(h1, "th") + "\n" + tr(h2, "th") + "\n"
    + rows.map(r => tr(fuse(r), "td")).join("\n")
    + "\n</table>";

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
