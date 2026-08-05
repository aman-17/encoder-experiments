// FAMILY generator: auto-insurance payment-plan discount rate-filing page
// (fictional carriers only). Portrait Letter, centered proposal tag, top band of
// three small hairline-gridded key tables (payment-method code grid, tenure/codes
// list, shaded key box whose two full-width title bars are the only merges), then
// a giant micro-print discount-factor table: 6 code columns + 8-11 coverage
// columns x ~38-84 data rows of 4-decimal factors with long runs of identical
// rows (frozen tenure plateau), an all-zero block, and (seed-toggled) mid-pattern
// truncation at the bottom. Seed-varied structure: data-row count, coverage-column
// count/pool, tenure bucket count+width, payment-method counts, label synonyms,
// title wording, fictional company/form/date pools, font scale +/-10%, quirk
// probabilities. GT lands ~800-1300 cells per seed.
export function generate(seed) {
  const rng = mulberry32(seed);
  const f4 = (x) => Math.max(0, x).toFixed(4);
  const rnd = (lo, hi) => lo + rng() * (hi - lo);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const chance = (p) => rng() < p;
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };

  // ---------------- fictional identity (no real carriers / forms / dates) ----
  const company = pick([
    "Meridian Peak Casualty Insurance Company",
    "Bluepine Mutual Automobile Insurance Co.",
    "Cardinal Ridge Indemnity Company",
    "Halverton National Insurance Group",
    "Sagebrook Casualty Company",
    "Torrey Lake Insurance Company",
    "Quillstone Mutual Insurance Co.",
    "Ferndale Assurance Corporation"]);
  const effYear = 2028 + Math.floor(rng() * 6);
  const effDate = `${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}/${pick(["01", "15"])}/${effYear}`;
  const formNo = `Form ${pick(["AU", "PA", "RC", "PP", "NB", "RN"])}-${4000 + Math.floor(rng() * 5000)} (Ed. ${effYear - 1})`;

  // ---------------- seed-varied surface labels -------------------------------
  const eftWord = pick(["EFT", "EFT", "ACH", "EPP"]);
  const codeName = pick(["ALR", "APC", "BPC", "PRC", "RPC", "DSC"]);
  const [gplName, gplAbbr] = pick([["Go Paperless", "GPL"], ["Paperless Billing", "PBL"],
    ["eDelivery", "EDL"], ["Go Green", "GGR"], ["Paperless Documents", "PDC"]]);
  const proposed = pick(["Proposed", "Proposed Rates", "Proposed - New Business",
    "Proposed - Renewal", "Filed / Proposed"]);
  const mainTitle = pick([
    `${eftWord}-PIF-${gplAbbr} Discount`,
    `${eftWord}-PIF-${gplAbbr} Discount Factors`,
    `${eftWord} / Paid-in-Full / ${gplAbbr} Discount`]);
  const tier = 1 + Math.floor(rng() * 6);              // UW Tier Group slice
  const dpCode = pick(["C", "C", "D", "Y", "B", "N"]); // Downpayment code slice
  const sweep = pick(["Producer Sweep", "Agency Sweep", "Broker Sweep", "Direct Bill Sweep"]);
  const chkLabel = pick(["Checking/ Saving", "Checking/Savings"]); // messy-space quirk

  // ---------------- structural knobs -----------------------------------------
  const TENN = 9 + Math.floor(rng() * 4);              // 9..12 tenure codes
  const step = pick([3, 6, 12]);                       // tenure bucket width, months
  const TENLET = "ABCDEFGHIJKLMN".slice(0, TENN);
  const nCov = 8 + Math.floor(rng() * 4);              // 8..11 coverage columns
  const coverages = shuffle(["ALL", "BI", "COL", "COMP", "ERS", "EXTR", "GAP", "MED",
    "MP", "OTC", "PD", "PIP", "RA", "RENT", "TL", "TOW", "UIM", "UMBI", "UMPD"])
    .slice(0, nCov).sort();
  const covKeys = coverages.map(() => "v" + (1 + Math.floor(rng() * 5))); // identical-column saturation
  const includeY = chance(0.35);                       // 4th installment section in main table
  const includeP = chance(0.4);                        // Payroll Deduct instrument row
  const truncMid = chance(0.6);                        // truncate mid-pattern vs at block boundary
  const fscale = 0.9 + rng() * 0.2;                    // font size +/-10%
  const px = (v) => (v * fscale).toFixed(2) + "px";

  // ---------------- factor streams -------------------------------------------
  // 5 value streams per row; tenure declines linearly for P steps then freezes
  // (long identical-row runs, like the family's real pages).
  const P = 3 + Math.floor(rng() * (TENN - 4));
  const ramp = (a, b) => {
    const out = [];
    for (let t = 0; t < TENN; t++) out.push(f4(a + (b - a) * Math.min(t, P) / P));
    return out;
  };
  const flat = (s) => Array(TENN).fill(s);

  // EFT-only discount (PIF=N): v1 shared between E and X blocks
  const v1eft = ramp(rnd(0.022, 0.042), rnd(0.022, 0.042) * rnd(0.80, 0.88));
  const kx = rnd(0.58, 0.72); // paperless-off shrink for the other streams
  const e2 = [rnd(0.07, 0.115), rnd(0.008, 0.02)];
  const e3 = [rnd(0.042, 0.068), rnd(0.018, 0.03)];
  const e4 = [rnd(0.125, 0.165), rnd(0.09, 0.12)];
  const e5 = [rnd(0.095, 0.135), rnd(0.035, 0.055)];
  const eftE = { v1: v1eft, v2: ramp(...e2), v3: ramp(...e3), v4: ramp(...e4), v5: ramp(...e5) };
  const eftX = { v1: v1eft, v2: ramp(e2[0] * kx, e2[1] * kx), v3: ramp(e3[0] * kx, e3[1] * kx),
                 v4: ramp(e4[0] * 0.88, e4[1] * 0.9), v5: ramp(e5[0] * kx, e5[1] * kx) };

  // optional credit-card EFT variant (scaled copy of the checking streams)
  let eftYE = null, eftYX = null;
  if (includeY) {
    const ky = rnd(0.82, 0.94);
    const scale = (s) => ({ v1: s.v1, v2: s.v2.map((x) => f4(x * ky)), v3: s.v3.map((x) => f4(x * ky)),
                            v4: s.v4.map((x) => f4(x * ky)), v5: s.v5.map((x) => f4(x * ky)) });
    eftYE = scale(eftE); eftYX = scale(eftX);
  }

  // Paid-in-full (PIF=Y): identical for every installment code; v1 shared E/X
  const v1pif = ramp(rnd(0.145, 0.185), rnd(0.145, 0.185) * rnd(0.66, 0.74));
  const kp = rnd(0.78, 0.87);
  const p2 = [rnd(0.14, 0.18), rnd(0.058, 0.078)];
  const p3 = [rnd(0.11, 0.145), rnd(0.044, 0.06)];
  const p4 = [rnd(0.26, 0.31), rnd(0.18, 0.22)];
  const p5 = [rnd(0.12, 0.16), rnd(0.042, 0.058)];
  const pifE = { v1: v1pif, v2: ramp(...p2), v3: ramp(...p3), v4: ramp(...p4), v5: ramp(...p5) };
  const pifX = { v1: v1pif, v2: ramp(p2[0] * kp, p2[1] * kp), v3: ramp(p3[0] * kp, p3[1] * kp),
                 v4: ramp(p4[0] * 0.95, p4[1] * 0.96), v5: ramp(p5[0] * kp, p5[1] * kp) };

  // No EFT: paperless-only discount, floors at 0.0100; all-zero saturation block
  const gplE = { v1: flat("0.0000"),
                 v2: ramp(rnd(0.028, 0.042), 0.01), v3: ramp(rnd(0.02, 0.032), 0.01),
                 v4: ramp(rnd(0.016, 0.024), 0.01), v5: ramp(rnd(0.032, 0.048), 0.01) };
  const zero = { v1: flat("0.0000"), v2: flat("0.0000"), v3: flat("0.0000"),
                 v4: flat("0.0000"), v5: flat("0.0000") };

  // ---------------- small tables ---------------------------------------------
  const instMap = [["None", "N", "N"], ["Checking/Savings", "Y", "Y"],
                   ["Credit Card", "C", "Y"], ["Debit Card", "D", "N"]];
  if (includeP) instMap.push(["Payroll Deduct", "P", "Y"]);
  const dpMethods = [sweep, ...shuffle(["Checking/Savings", "Credit Card", "Debit Card",
    "Money Order", "Payroll Deduction"]).slice(0, 3 + (chance(0.5) ? 1 : 0))];
  const alrRows = [];
  for (const [im, code, disc] of instMap)
    for (const dm of dpMethods) alrRows.push([dm, im, code, disc]);

  const tenRows = [];
  for (let i = 0; i < TENN - 1; i++)
    tenRows.push([`${i * step} to < ${(i + 1) * step} months`, TENLET[i]]);
  tenRows.push([`>= ${(TENN - 1) * step} months`, TENLET[TENN - 1]]);

  const eftKey = [["C", chkLabel], ["D", "Debit Card"], ["N", `No ${eftWord}`], ["Y", "Credit Card"]];
  if (includeP) eftKey.push(["P", "Payroll Deduct"]);
  const gplKey = [["E", gplName], ["X", `No ${gplName}`]];

  // ---------------- budget-capped main-table rows -----------------------------
  const smallCells = (alrRows.length + 1) * 4 + (tenRows.length + 1) * 2
    + 2 + (eftKey.length + gplKey.length) * 2;
  const cols = 6 + nCov;
  const targetTotal = 800 + Math.floor(rng() * 500);   // total GT cells 800..1299
  let dataRows = Math.floor((targetTotal - smallCells) / cols) - 1;
  if (!truncMid) dataRows = Math.max(2 * TENN, Math.floor(dataRows / TENN) * TENN);

  const mainInst = includeY ? ["C", "Y", "D", "N"] : ["C", "D", "N"];
  const streamFor = (inst, pif, gpl) => {
    if (pif === "Y") return gpl === "E" ? pifE : pifX;
    if (inst === "C") return gpl === "E" ? eftE : eftX;
    if (inst === "Y") return gpl === "E" ? eftYE : eftYX;
    return gpl === "E" ? gplE : zero;
  };
  const rows = [];
  outer:
  for (const inst of mainInst) {
    for (const pif of ["N", "Y"]) {
      for (const gpl of ["E", "X"]) {
        const s = streamFor(inst, pif, gpl);
        for (let t = 0; t < TENN; t++) {
          rows.push([String(tier), dpCode, inst, pif, gpl, TENLET[t],
                     ...covKeys.map((k) => s[k][t])]);
          if (rows.length >= dataRows) break outer;
        }
      }
    }
  }

  // ---------------- headers (html wrap vs logical GT text) --------------------
  const H = (gt, html) => ({ gt, html: html || gt });
  const heads = [
    H(pick(["UW Tier Group", "Rating Tier Group", "UW Tier"])),
    H(`Downpayment ${codeName} Code`, `Downpayment ${codeName}<br>Code`),
    H(`${eftWord} Installment ${codeName} Code`),
    H(pick(["Paid In Full", "Paid-in-Full"])),
    H(gplName),
    H(pick(["Lifetime Tenure", "Lifetime Tenure Code"])),
    ...coverages.map((c) => H(c)),
  ];
  const ALR_HEADS = [
    H("Down Payment Method", "Down Payment<br>Method"),
    H(`${eftWord} Installment Method`, `${eftWord} Installment<br>Method`),
    H(`Installment ${codeName} Code`),
    H(`${eftWord} Discount Applied*`, `${eftWord} Discount<br>Applied*`),
  ];
  const tenHead = pick(["Codes", "Code"]);

  // ---------------- HTML ------------------------------------------------------
  const mainHead = "<tr>" + heads.slice(0, 6).map((h, i) => `<th class=w${i + 1}>${h.html}</th>`).join("")
    + heads.slice(6).map((h) => `<th class=wf>${h.html}</th>`).join("") + "</tr>";
  const mainBody = rows.map((r) =>
    `<tr><td class=r>${r[0]}</td><td class=l>${r[1]}</td><td class=l>${r[2]}</td>`
    + `<td class=l>${r[3]}</td><td class=l>${r[4]}</td><td class=l>${r[5]}</td>`
    + r.slice(6).map((v) => `<td class=n>${v}</td>`).join("") + "</tr>").join("\n");

  const alrHtml = "<table class=s><tr>" + ALR_HEADS.map((h) => `<th>${h.html}</th>`).join("") + "</tr>"
    + alrRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class=c>${r[2]}</td><td class=c>${r[3]}</td></tr>`).join("") + "</table>";

  const tenHtml = `<table class=s><tr><th>Lifetime Tenure</th><th>${tenHead}</th></tr>`
    + tenRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("") + "</table>";

  const keyHtml = `<table class='s key'><tr><th colspan=2 class=bar>${eftWord} Key</th></tr>`
    + eftKey.map((r) => `<tr><td class='c kc'>${r[0]}</td><td class=c>${r[1]}</td></tr>`).join("")
    + `<tr><th colspan=2 class=bar>${gplName} Key</th></tr>`
    + gplKey.map((r) => `<tr><td class='c kc'>${r[0]}</td><td class=c>${r[1]}</td></tr>`).join("") + "</table>";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000;
         width: 816px; height: 1054px; overflow: hidden; position: relative; }
  .wrap { padding: 56px 40px 0 40px; }
  .proposed { text-align: center; font-weight: bold; font-size: ${px(7)}; }
  .lbl { font-weight: bold; font-size: ${px(5.5)}; margin: 0 0 3px 0; }
  .band { display: flex; align-items: flex-start; margin-top: 10px; }
  table { border-collapse: collapse; }
  table.s th, table.s td { border: 0.5px solid #9a9a9a; font-size: ${px(5.5)};
    line-height: ${px(6.2)}; padding: 0.5px 3px; text-align: left; vertical-align: bottom; }
  table.s th { font-weight: bold; }
  table.s td.c { text-align: center; }
  table.key { min-width: 150px; }
  table.key th.bar { background: #d9d9d9; text-align: center; }
  table.key td.kc { width: 32px; }
  .ten { margin-left: 30px; }
  .keybox { margin-left: 96px; margin-top: 4px; }
  .mainlbl { margin-top: 10px; }
  table.m { table-layout: fixed; width: 100%; }
  table.m th, table.m td { border: 0.5px solid #a8a8a8; font-size: ${px(4.7)};
    line-height: ${px(5.6)}; padding: 0 1px; overflow: hidden; }
  table.m th { font-weight: bold; text-align: center; vertical-align: bottom; padding-bottom: 1px; }
  table.m td.r { text-align: right; }
  table.m td.l { text-align: left; }
  table.m td.n { text-align: center; }
  .w1 { width: 36px; } .w2 { width: 46px; } .w3 { width: 66px; }
  .w4 { width: 30px; } .w5 { width: 32px; } .w6 { width: 38px; }
  .foot { position: absolute; bottom: 22px; left: 40px; right: 40px;
    display: flex; justify-content: space-between; font-size: ${px(5.5)}; }
  </style></head><body><div class="wrap">
  <div class="proposed">${proposed}</div>
  <div class="lbl" style="margin-top:10px">${eftWord} ${codeName} Code</div>
  <div class="band" style="margin-top:0">
    ${alrHtml}
    <div class="ten">${tenHtml}</div>
    <div class="keybox">${keyHtml}</div>
  </div>
  <div class="lbl mainlbl">${mainTitle}</div>
  <table class="m">${mainHead}\n${mainBody}</table>
  </div>
  <div class="foot"><span>${company}</span><span>${formNo}</span><span>Effective ${effDate}</span></div>
  </body></html>`;

  // ---------------- GT --------------------------------------------------------
  const tr = (cells, tag = "td") => "  <tr>\n" + cells.map((c) => `    <${tag}>${c}</${tag}>`).join("\n") + "\n  </tr>";
  const gtAlr = "<table>\n" + tr(ALR_HEADS.map((h) => h.gt), "th") + "\n"
    + alrRows.map((r) => tr(r)).join("\n") + "\n</table>";
  const gtTen = "<table>\n" + tr(["Lifetime Tenure", tenHead], "th") + "\n"
    + tenRows.map((r) => tr(r)).join("\n") + "\n</table>";
  const gtKey = `<table>\n  <tr>\n    <th colspan="2">${eftWord} Key</th>\n  </tr>\n`
    + eftKey.map((r) => tr(r)).join("\n")
    + `\n  <tr>\n    <th colspan="2">${gplName} Key</th>\n  </tr>\n`
    + gplKey.map((r) => tr(r)).join("\n") + "\n</table>";
  const gtMain = "<table>\n" + tr(heads.map((h) => h.gt), "th") + "\n"
    + rows.map((r) => tr(r)).join("\n") + "\n</table>";

  const gt = [gtAlr, gtTen, gtKey, gtMain].join("\n\n");

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
