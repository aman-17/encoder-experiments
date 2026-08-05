// FAMILY GENERATOR — title-insurance endorsement charge schedule (modeled on a
// SERFF-style rate-filing page; all identifiers fictional / decontaminated).
// Visual identity: one fully-boxed 4-col table (<assoc> NO. | DESCRIPTION |
// POLICY FORM | CHARGE), tall row-blocks whose POLICY FORM cells hold vertical
// Owner:/Extended/Standard/Lender: sub-lists with CHARGE values aligned
// line-by-line (deliberate blank filler lines), 5-line stacked CHARGE header
// cell, company title on top, page number + "State of X / Effective:" footer.
// Seed-driven structure: 5-8+ blocks drawn from 9 archetypes, per-block
// sub-list lengths 2/3/6, header-label synonym pools, optional subtitle,
// font size 9-11pt, quirk toggles (shifted charges, N/C alignment,
// pattern-breaker code cell, dropped paren). GT explodes each block into
// sub-rows with code/description rowspanned; ~55-110 cells across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // ---- fictional identity pools (decontaminated) ----
  const company = pick([
    "GRANITE PEAK TITLE INSURANCE COMPANY",
    "MERIDIAN COAST TITLE INSURANCE COMPANY",
    "SILVER OAK NATIONAL TITLE INSURANCE COMPANY",
    "HARBORVIEW TITLE GUARANTY COMPANY",
    "CASCADE UNION TITLE INSURANCE COMPANY",
    "BLUE MESA LAND TITLE INSURANCE COMPANY",
    "PIONEER SUMMIT TITLE GUARANTY COMPANY",
    "REDSTONE ATLANTIC TITLE INSURANCE COMPANY",
  ]);
  const subtitleOn = rng() < 0.45;
  const subtitle = pick([
    "SCHEDULE OF ENDORSEMENT CHARGES",
    "ENDORSEMENT CHARGE SCHEDULE",
    "SCHEDULE OF CHARGES FOR ENDORSEMENTS",
    "ENDORSEMENT RATE SCHEDULE",
  ]);
  const state = pick([
    "State of Nevada", "State of Arizona", "State of Oregon",
    "State of Colorado", "State of Washington", "State of Utah",
    "State of Idaho", "State of Montana",
  ]);
  const month = pick(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
  const day = 1 + Math.floor(rng() * 28);
  const year = 1995 + Math.floor(rng() * 9); // 1995-2003, shifted off any real filing date
  const pageNo = 55 + Math.floor(rng() * 90);

  // fictional endorsement-numbering associations (replace real CLTA/ALTA)
  const acro = pick(["PLTA", "WLTA", "GLTA", "SLTA", "KLTA", "BLTA"]);
  const acro2 = pick(["NTLA", "AMLT", "NALT", "UNTA", "NLTC", "NATC"]);
  const rev = pick(["-04", "-05", "-07", "-08", "-09", "-11"]);

  // font scale +/-10% around 10pt; slight table-width jitter
  const fs = +(9 + rng() * 2).toFixed(2);
  const tableW = +(6.35 + rng() * 0.55).toFixed(2);
  const wScale = tableW / 6.62;
  const w1 = +(1.34 * wScale + (rng() - 0.5) * 0.06).toFixed(2);
  const w2 = +(2.32 * wScale + (rng() - 0.5) * 0.06).toFixed(2);
  const w3 = +(1.22 * wScale + (rng() - 0.5) * 0.06).toFixed(2);
  const w4 = +(tableW - w1 - w2 - w3).toFixed(2);

  // ---- header-label synonym pools ----
  const col1Hdr = pick([`${acro} NO.`, `${acro} FORM NO.`, `${acro} END. NO.`]);
  const col2Hdr = pick(["DESCRIPTION", "ENDORSEMENT DESCRIPTION", "TITLE OF ENDORSEMENT"]);
  const col3Lines = pick([["POLICY", "FORM"], ["POLICY", "TYPE"], ["COVERAGE", "FORM"]]);
  const chargeSub = pick([
    ["(Percentage of", "applicable Base", "Rate unless", "otherwise indicated)"],
    ["(Percent of the", "applicable Basic", "Rate unless", "otherwise noted)"],
    ["(Percentage of", "the Schedule", "Rate unless", "otherwise shown)"],
    ["(Percent of", "applicable Base", "Premium unless", "otherwise indicated)"],
  ]);

  // ---- endorsement code family (ascending within one series) ----
  const major = pick([102, 103, 104, 106, 107, 109, 110, 111, 112, 115]);
  const s = 2 + Math.floor(rng() * 5);
  const a1 = 9 + Math.floor(rng() * 30);
  let a3 = 4 + Math.floor(rng() * 30);
  if (a3 === a1) a3 += 3;
  let a4 = 5 + Math.floor(rng() * 35);
  if (a4 === a1 || a4 === a3) a4 += 2;
  const se = 10 + Math.floor(rng() * 20);

  // ---- description theme pools ----
  const pairTheme = pick(["Adjacency", "Severance", "Frontage", "Tideland", "Contiguity", "Encroachment", "Boundary", "Easement"]);
  const fam = pick(["Modular Housing", "Solar Equipment", "Water System", "Storage Facility", "Manufactured Home", "Irrigation Equipment", "Wind Equipment", "Commercial Improvement"]);
  const oddDesc = pick([
    "Unpatented Mining Claim",
    "Unrecorded Lease Interest",
    "Unconverted Storage Unit",
    "Unassigned Water Stock",
    "Unperfected Access Easement",
    "Unsubordinated Ground Rent",
  ]);
  const lenderTheme = pick(["Assignment of Rents", "Leasehold Improvements", "Mineral Rights Waiver", "Access and Entry", "Zoning Compliance", "Utility Facility"]);
  const ownerTheme = pick(["Encroachment Waiver", "Survey Amendment", "Water Rights Notation", "Street Assessment", "Designated Improvements", "Boundary Agreement"]);
  const extraFams = shuffle(rng, ["Well Equipment", "Septic System", "Greenhouse Structure", "Dock and Pier", "Grain Storage", "Pipeline Corridor"]);

  // ---- charges ----
  const pctPool = ["10%", "15%", "20%", "25%", "30%"];
  const x = pick(pctPool);
  let y = pick(pctPool);
  if (y === x) y = pctPool[(pctPool.indexOf(x) + 2) % pctPool.length];
  const p2a = pick(pctPool);
  let p2b = pick(pctPool);
  if (p2b === p2a) p2b = pctPool[(pctPool.indexOf(p2a) + 1) % pctPool.length];
  const x2 = pick(pctPool);
  const feePool = ["$25", "$50", "$75", "$100", "$125", "$150"];
  const fee = pick(feePool);
  let fee2 = pick(feePool);
  if (fee2 === fee) fee2 = feePool[(feePool.indexOf(fee) + 3) % feePool.length];

  // ---- quirk toggles (seeded probabilities) ----
  const qShift = rng() < 0.6;      // charges shifted up one slot vs Extended/Standard lines
  const qNC = rng() < 0.8;         // N/C + percent alignment quirk
  const qDropParen = rng() < 0.5;  // dropped opening paren in a description
  const plural = rng() < 0.25;     // Owners:/Lenders: label variant
  const covAbbrev = rng() < 0.2;   // Extended Cov./Standard Cov. variant

  const ownLbl = plural ? "Owners:" : "Owner:";
  const lenLbl = plural ? "Lenders:" : "Lender:";
  const extLbl = covAbbrev ? "Extended Cov." : "Extended";
  const stdLbl = covAbbrev ? "Standard Cov." : "Standard";
  const PF6 = [ownLbl, extLbl, stdLbl, lenLbl, extLbl, stdLbl];

  // ---- structural plan: 5-8 blocks drawn from 9 archetypes ----
  const ARCH = ["pairSingle", "pairMulti", "feeUnit", "breaker", "convLoan", "convOwner", "unitNoRef", "lenderPct", "ownerNC"];
  const optional = ARCH.slice(1);
  const blockCount = 5 + Math.floor(rng() * 4);
  const dropN = ARCH.length - blockCount;
  const dropIdx = new Set();
  while (dropIdx.size < dropN) dropIdx.add(Math.floor(rng() * optional.length));
  const plan = ["pairSingle", ...optional.filter((_, i) => !dropIdx.has(i))];

  // ascending code cursor: main entries advance the minor, sub entries append .1/.2/A
  let cur = s, curUsed = false, subIdx = 0;
  const mainNo = () => { if (curUsed) { cur += 1; subIdx = 0; } curUsed = true; return cur; };
  const subNo = () => { subIdx += 1; return `${cur}.${subIdx}`; };

  const blocks = [];
  for (const kind of plan) {
    if (kind === "pairSingle") blocks.push({
      code: [`${major}.${mainNo()}${rev}`, `(${acro2} ${a1}.1${rev})`],
      desc: [`${pairTheme} – Single Parcel`, `(Owner or Lender)`],
      pf: PF6,
      chg: qShift ? [x, x, "", y, x, ""] : ["", x, y, "", x, y],
    });
    else if (kind === "pairMulti") blocks.push({
      code: [`${major}.${subNo()}${rev}`, `(${acro2} ${a1}${rev})`],
      desc: [`${pairTheme} – Multiple Parcels`, `(Owner or Lender)`],
      pf: PF6,
      chg: qNC ? ["", "N/C", p2a, "", "N/C", p2b] : ["", p2a, p2b, "", p2a, p2b],
    });
    else if (kind === "feeUnit") blocks.push({
      code: [`${major}.${mainNo()}${rev}`, `(${acro2} ${a3}${rev})`],
      desc: [`${fam} Unit`, `(Owner or Lender)`],
      pf: PF6,
      chg: ["", fee, fee, "", fee, fee],
    });
    else if (kind === "breaker") blocks.push({ // pattern-breaker: 3-line code cell, 2 policy-form lines
      code: [`${major}.${cur}A (not`, `${acro} End)`, `(SE-${se})`],
      desc: [oddDesc],
      pf: [lenLbl, extLbl],
      chg: ["", "N/C"],
    });
    else if (kind === "convLoan") blocks.push({
      code: [`${major}.${subNo()}${rev}`, `(${acro2} ${a3}.1${rev})`],
      desc: [`${fam},`, `Conversion, Loan (Lender)`],
      pf: [lenLbl, extLbl, stdLbl],
      chg: ["", fee, fee],
    });
    else if (kind === "convOwner") blocks.push({
      code: [`${major}.${subNo()}${rev}`, `(${acro2} ${a3}.2${rev})`],
      desc: [`${fam},`, `Conversion, Owner (Owner)`],
      pf: [ownLbl, extLbl, stdLbl],
      chg: ["", fee, fee],
    });
    else if (kind === "unitNoRef") blocks.push({ // no second-org ref; optionally drops the opening paren
      code: [`${major}.${mainNo()}${rev}`],
      desc: [`${fam} Unit`, qDropParen ? `Owner or Lender)` : `(Owner or Lender)`],
      pf: PF6,
      chg: ["", fee2, fee2, "", fee2, fee2],
    });
    else if (kind === "lenderPct") blocks.push({
      code: [`${major}.${mainNo()}${rev}`, `(${acro2} ${a4}${rev})`],
      desc: [lenderTheme, `(Lender Only)`],
      pf: [lenLbl, extLbl, stdLbl],
      chg: ["", x2, x2],
    });
    else if (kind === "ownerNC") blocks.push({
      code: [`${major}.${mainNo()}${rev}`],
      desc: [ownerTheme, `(Owner Only)`],
      pf: [ownLbl, extLbl],
      chg: ["", "N/C"],
    });
  }

  const totalLines = () => blocks.reduce((n, b) => n + b.pf.length, 0);

  // min-density guard: append extra fee-unit blocks so row count stays within
  // ~-30% of the family's nominal 32 sub-rows
  while (totalLines() < 22 && extraFams.length) {
    const f2 = extraFams.shift();
    blocks.push({
      code: [`${major}.${mainNo()}${rev}`, `(${acro2} ${a4 + extraFams.length}${rev})`],
      desc: [`${f2} Unit`, `(Owner or Lender)`],
      pf: PF6,
      chg: ["", fee2, fee2, "", fee2, fee2],
    });
  }

  // overflow guard: line budget from font size / block count; halve 6-line
  // blocks (keep one policy half) before dropping trailing blocks
  const availIn = 10.96 - 0.60 - 0.26 - (subtitleOn ? 0.22 : 0) - 0.30 - 1.25;
  const headerIn = (5 * fs * 1.18) / 72 + 0.12;
  const lineIn = (fs * 1.18) / 72;
  const capLines = Math.floor((availIn - headerIn - blocks.length * 0.10) / lineIn);
  while (totalLines() > capLines) {
    const i = blocks.map((b) => b.pf.length).lastIndexOf(6);
    if (i >= 0) {
      const b = blocks[i];
      const keepOwner = rng() < 0.5;
      b.pf = keepOwner ? b.pf.slice(0, 3) : b.pf.slice(3, 6);
      b.chg = keepOwner ? b.chg.slice(0, 3) : b.chg.slice(3, 6);
      b.desc = b.desc.map((d) =>
        d.replace("(Owner or Lender)", keepOwner ? "(Owner)" : "(Lender)")
         .replace(/^Owner or Lender\)$/, keepOwner ? "Owner)" : "Lender)"));
    } else blocks.pop();
  }

  const dv = (lines, blankNbsp) =>
    lines.map((l) => `<div>${l === "" && blankNbsp ? "&nbsp;" : l}</div>`).join("");

  const bodyRows = blocks
    .map(
      (b) => `<tr>
  <td>${dv(b.code)}</td>
  <td>${dv(b.desc)}</td>
  <td>${dv(b.pf)}</td>
  <td>${dv(b.chg, true)}</td>
</tr>`
    )
    .join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; width: 8.5in; height: 10.96in; position: relative;
         font-family: Arial, Helvetica, sans-serif; color: #000; }
  .title { padding-top: 0.60in; text-align: center; font-size: ${(fs * 1.05).toFixed(2)}pt; }
  .subtitle { text-align: center; font-size: ${(fs * 0.95).toFixed(2)}pt; padding-top: 4px; }
  table { border-collapse: collapse; table-layout: fixed; width: ${tableW}in; margin: 0.30in auto 0; }
  th, td { border: 1px solid #000; font-size: ${fs}pt; line-height: 1.18;
           padding: 2px 4px 5px 6px; vertical-align: top; text-align: left; }
  th { font-weight: bold; vertical-align: bottom; text-align: center; padding-bottom: 3px; }
  th.hc { vertical-align: top; font-weight: normal; padding-top: 3px; }
  .footer-page { position: absolute; bottom: 0.90in; left: 0; right: 0; text-align: center; font-size: ${fs}pt; }
  .footer-left { position: absolute; bottom: 0.52in; left: 0.95in; font-size: ${(fs * 0.95).toFixed(2)}pt; line-height: 1.3; }
  </style></head><body>
  <div class="title">${company}</div>
  ${subtitleOn ? `<div class="subtitle">${subtitle}</div>` : ""}
  <table>
  <colgroup><col style="width:${w1}in"><col style="width:${w2}in"><col style="width:${w3}in"><col style="width:${w4}in"></colgroup>
  <tr>
    <th>${col1Hdr}</th>
    <th>${col2Hdr}</th>
    <th>${col3Lines.join("<br>")}</th>
    <th class="hc"><b>CHARGE</b><br>${chargeSub.join("<br>")}</th>
  </tr>
${bodyRows}
  </table>
  <div class="footer-page">${pageNo}</div>
  <div class="footer-left">${state}<br>Effective: ${month} ${day}, ${year}</div>
  </body></html>`;

  // ---- GT: logical explosion — one row per POLICY FORM sub-line, code and
  // description rowspanned down each block. cells = 4 + 2*lines + 2*blocks.
  const gtRows = [
    `  <tr>\n    <th>${col1Hdr}</th>\n    <th>${col2Hdr}</th>\n    <th>${col3Lines.join(" ")}</th>\n    <th>CHARGE ${chargeSub.join(" ")}</th>\n  </tr>`,
  ];
  for (const b of blocks) {
    const L = b.pf.length;
    const codeTxt = b.code.join(" ");
    const descTxt = b.desc.join(" ");
    for (let i = 0; i < L; i++) {
      const cells = [];
      if (i === 0) {
        cells.push(`<td rowspan="${L}">${codeTxt}</td>`);
        cells.push(`<td rowspan="${L}">${descTxt}</td>`);
      }
      cells.push(`<td>${b.pf[i]}</td>`);
      cells.push(`<td>${b.chg[i]}</td>`);
      gtRows.push(`  <tr>\n    ${cells.join("\n    ")}\n  </tr>`);
    }
  }
  const gt = `<table>\n${gtRows.join("\n")}\n</table>`;

  return { html, gt, pageOpts: { format: "Letter" } };
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
