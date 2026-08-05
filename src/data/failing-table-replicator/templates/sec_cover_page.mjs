// FAMILY: SEC Form 10-K cover page for a dual-registrant REIT (Corporation +
// operating-partnership co-registrant): dense centered legal boilerplate with
// ☑/☐ glyphs, heavy top/bottom bars, and TWO small bordered securities tables
// mid-page (shaded long-text rows + a sibling panel that is either "None/N/A"
// or a short list of notes). All names/tickers/exchanges/addresses/years are
// FICTIONAL (drawn from pools) — no identifiers from any real filing.
//
// GT = ONE logical 3-col table (both panels share the 3-col 12(b) schema →
// flattened; the co-registrant panel's repeated header — when present —
// becomes a data row). Seed-varied structure:
//   rows = 1 header + (1 common + 2..6 preferred) + (0|1 repeated header)
//          + (1 "None" row | 1..3 notes rows)      → 15..36 cells, no merges.
// Seeded quirks: row shading pattern, spacer row, headerless second panel,
// <br>-wrapped panel-2 header, font scale ±10% (damped when row-heavy).
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const di = (n) => String(Math.floor(rng() * n));
  const digits = (k) => Array.from({ length: k }, () => di(10)).join("");
  const chance = (p) => rng() < p;

  // ---- registrant identity (all fictional) ---------------------------------
  const base = pick([
    ["HARBORVIEW REALTY", "HVRE"],
    ["CEDARBROOK CENTERS", "CDBK"],
    ["WESTGATE PROPERTY TRUST", "WGPT"],
    ["LARKFIELD REALTY GROUP", "LKRG"],
    ["STONEMERE PROPERTIES", "STMR"],
    ["PINEHARBOR CENTERS", "PNHB"],
    ["MERROW PARK REALTY", "MRWP"],
    ["QUARRYSTONE RETAIL TRUST", "QRST"],
  ]);
  const [nameUp, tick] = base;
  const nameTc = nameUp.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const corpSuffix = pick(["Corporation", "Corporation", ", Inc.", "Incorporated"]);
  const corp = corpSuffix.startsWith(",") ? `${nameTc}${corpSuffix}` : `${nameTc} ${corpSuffix}`;
  const opSuffix = pick(["OP, LLC", "OP, L.P.", "Operating Partnership, L.P.", "OP, LLC"]);
  const op = `${nameTc} ${opSuffix}`;
  const corpUp = corp.toUpperCase();
  const opUp = op.toUpperCase();

  const fy = 2014 + Math.floor(rng() * 8); // fiscal year ended Dec 31, 2014..2021 (shifted, fictional)
  const fileNo1 = `1-${digits(5)}`;
  const fileNo2 = `333-${digits(6)}-01`;
  const state1 = pick(["Maryland", "Ohio", "Indiana", "Virginia", "Missouri", "Colorado"]);
  const ein1 = `${13 + Math.floor(rng() * 60)}-${digits(7)}`;
  const ein2 = `${13 + Math.floor(rng() * 80)}-${digits(7)}`;
  const addr = pick([
    "400 Corporate Plaza, Suite 210, Uniondale, NY 11556",
    "225 Broadhollow Road, Suite 400, Melville, NY 11747",
    "One Overlook Point, Suite 500, Rye Brook, NY 10573",
    "1200 Glades Circle, Suite 150, Garden City, NY 11530",
    "77 Kettlepond Parkway, Suite 320, Hawthorne, NY 10532",
    "910 Stony Hollow Drive, Suite 275, Great Neck, NY 11021",
    "35 Crescent Commons, Suite 600, Tarrytown, NY 10591",
  ]);
  const phone = `(${pick(["516", "631", "914", "203", "845", "475"])}) ${100 + Math.floor(rng() * 900)}-${digits(4)}`;
  const exch = pick([
    "Meridian Stock Exchange",
    "Continental Stock Exchange",
    "Atlantic Securities Exchange",
    "National Equities Exchange",
    "Empire Stock Exchange",
    "Federated Stock Exchange",
    "Liberty Stock Exchange",
  ]);

  // ---- structural knobs ----------------------------------------------------
  const nDep = 2 + Math.floor(rng() * 6);          // 2..7 preferred/depositary rows
  const opNotes = chance(0.45);                     // co-registrant lists notes vs None/N/A
  const nOp = opNotes ? 1 + Math.floor(rng() * 3) : 1; // 1..3 notes rows, or the single None row
  const headerlessOp = chance(0.3);                 // QUIRK: panel 2 drops its header row
  const hasSpacer = chance(0.7);                    // QUIRK: blank spacer row atop panel 2
  const brHdr = chance(0.6);                        // QUIRK: panel-2 3rd header wraps with <br>
  const shadePat = pick(["even", "even", "odd", "all", "none"]); // QUIRK: shading pattern
  const includeErr = (nDep + nOp <= 6) ? chance(0.85) : false; // trim boilerplate when row-heavy
  // Density-coupled type size (±~10%): heavier covers print smaller, as the
  // family does. load ≈ text-line units added by seeded structure.
  const load = 2 * nDep + nOp + (headerlessOp ? 0 : 1) + (includeErr ? 4 : 0);
  const rawScale = 0.95 + rng() * 0.12;
  const scale = Math.max(0.87, rawScale - 0.018 * Math.max(0, load - 6));
  const pt = (x) => `${(x * scale).toFixed(2)}pt`;

  // ---- column-label pool (statutory synonyms) ------------------------------
  const HDR = [
    pick(["Title of each class", "Title of each class of securities", "Title of class"]),
    pick(["Trading Symbol(s)", "Trading Symbol", "Trading symbol(s)"]),
    pick([
      "Name of each exchange on which registered",
      "Name of exchange on which registered",
      "Name of each exchange on which registered",
    ]),
  ];

  // ---- securities table values --------------------------------------------
  const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lStart = Math.floor(rng() * (AL.length - nDep));
  const letters = AL.slice(lStart, lStart + nDep).split("");
  const rate = () => `${(4.75 + 0.125 * Math.floor(rng() * 22)).toFixed(3)}%`;
  const frac = pick(["one-thousandth", "one-hundredth"]);
  const parPref = pick(["$1.00", "$25.00", "$0.01"]);
  const dep = (r, L, kind) =>
    `Depositary Shares, each representing ${frac} of a share of ${r} Class ${L} Cumulative ${kind} Preferred Stock, ${parPref} par value per share.`;
  const commonPar = pick(["$.01", "$.10", "$0.01"]);
  const corpRows = [[`Common Stock, par value ${commonPar} per share.`, tick, exch]];
  for (const L of letters) {
    corpRows.push([dep(rate(), L, pick(["Redeemable", "Redeemable", "Convertible"])), `${tick}pr${L}`, exch]);
  }
  let opRows;
  if (opNotes) {
    opRows = [];
    for (let i = 0; i < nOp; i++) {
      const due = fy + 3 + Math.floor(rng() * 10);
      opRows.push([`${rate()} Senior Notes due ${due}`, `${tick}${String(due).slice(2)}`, exch]);
    }
  } else {
    opRows = [["None", "N/A", "N/A"]];
  }

  // ---- other seeded fill ---------------------------------------------------
  const mval = `$${(5 + rng() * 14).toFixed(1)} billion`;
  const shares = (350_000_000 + Math.floor(rng() * 450_000_000)).toLocaleString("en-US");
  const asOfDay = 3 + Math.floor(rng() * 23);
  const mtgMonth = pick(["April", "May", "June"]);
  const mtgDay = 1 + Math.floor(rng() * 27);
  const exhPage = 46 + Math.floor(rng() * 18);
  const exhLine = pick([
    `Index to Exhibits begins on page ${exhPage}.`,
    `The Exhibit Index is located on page ${exhPage} of this report.`,
    `An index to exhibits appears on page ${exhPage}.`,
  ]);
  const attest2 = chance(0.3); // internal-control attestation checked for co-registrant too

  // ---- HTML ----------------------------------------------------------------
  const CK = "☑", UK = "☐"; // ☑ ☐
  const pair = (a, b) =>
    `<div class="pair"><span><b>${corp}</b> ${a}</span><span><b>${op}</b> ${b}</span></div>`;
  const yn = (y) => (y ? `Yes ${CK} No ${UK}` : `Yes ${UK} No ${CK}`);
  const fgrid = (b1, b2, b3, b4, b5) => `
  <div class="fgrid"><span>Large accelerated filer</span><span class="fb">${b1}</span><span>Accelerated filer</span><span class="fb">${b2}</span><span>Non-accelerated filer</span><span class="fb">${b3}</span></div>
  <div class="fgrid"><span>Smaller reporting company</span><span class="fb">${b4}</span><span>Emerging growth company</span><span class="fb">${b5}</span><span></span><span></span></div>`;

  const shaded = (i) =>
    shadePat === "all" ? true
      : shadePat === "even" ? i % 2 === 0
      : shadePat === "odd" ? i % 2 === 1
      : false;
  const tbl1Body = corpRows.map((r, i) => `<tr${shaded(i) ? ' class="sh"' : ""}>
    <td class="l">${r[0]}</td><td class="m">${r[1]}</td><td class="m">${r[2]}</td></tr>`).join("\n");
  const tbl2Body = opRows.map((r) => `<tr>
    <td class="l">${r[0]}</td><td class="m">${r[1]}</td><td class="m">${r[2]}</td></tr>`).join("\n");
  const hdr3html = brHdr
    ? `<th style="vertical-align:bottom">${HDR[0]}</th><th style="vertical-align:bottom">${HDR[1]}</th><th>${HDR[2].replace(/ (?=[a-z]+ registered$)/i, "<br>")}</th>`
    : `<th>${HDR[0]}</th><th>${HDR[1]}</th><th>${HDR[2]}</th>`;
  const tbl2Hdr = headerlessOp ? "" : `<tr>${hdr3html}</tr>\n`;
  const spacerRow = hasSpacer ? `<tr class="spacer"><td colspan="3"></td></tr>\n` : "";

  const errBlocks = includeErr ? `
  <div class="p">If securities are registered pursuant to Section 12(b) of the Act, indicate by check mark whether the financial statements of the registrant included in the filing reflect the correction of an error to previously issued financial statements.</div>
  ${pair(UK, UK)}
  <div class="p">Indicate by check mark whether any of those error corrections are restatements that required a recovery analysis of incentive-based compensation received by any of the registrant&rsquo;s executive officers during the relevant recovery period pursuant to &sect;240.10D-1(b).</div>
  ${pair(UK, UK)}` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 8.5in; height: 11in; padding: 6mm 11mm 14mm;
         font-family: "Times New Roman", Times, serif; font-size: ${pt(6.5)}; color: #000;
         position: relative; line-height: 1.2; }
  .bar { height: 1.1mm; background: #000; }
  .botbars { position: absolute; left: 11mm; right: 11mm; bottom: 5mm; }
  .botbars div { height: 1mm; background: #000; margin-top: 1.5mm; }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .u { text-decoration: underline; }
  .hb { font-weight: bold; font-size: ${pt(7)}; line-height: 1.3; }
  .form { font-weight: bold; font-size: ${pt(9.5)}; margin: 0.4mm 0; }
  .chk { position: relative; text-align: center; font-weight: bold; font-size: ${pt(7)}; margin-top: 0.5mm; }
  .chk .box { position: absolute; left: 16mm; font-weight: normal; }
  .blank { display: inline-block; width: 15mm; border-bottom: 0.5pt solid #000; }
  .conm { font-weight: bold; font-size: ${pt(11)}; text-decoration: underline; line-height: 1.25; margin-top: 1.2mm; }
  .cols2 { display: flex; margin-top: 1.1mm; }
  .cols2 > div { width: 50%; text-align: center; }
  .rule2 { display: flex; } .rule2 > div { width: 50%; border-bottom: 0.5pt solid #000; }
  .pair { display: flex; justify-content: center; gap: 26mm; font-size: ${pt(6.8)}; margin: 0.4mm 0 0.6mm; }
  .p { text-align: justify; margin-top: 0.6mm; }
  .cap { font-weight: bold; font-size: ${pt(6.8)}; margin: 1mm 0 0.4mm; }
  table.sec { border-collapse: collapse; width: 100%; table-layout: fixed; }
  table.sec th, table.sec td { border: 0.5pt solid #000; padding: 0.35mm 1.2mm; font-size: ${pt(6.4)};
                               font-weight: normal; vertical-align: middle; }
  table.sec th { text-align: center; }
  table.sec td.l { text-align: left; }
  table.sec td.m { text-align: center; }
  table.sec tr.sh td { background: #d6d6d6; }
  table.sec col.c1 { width: 57%; } table.sec col.c2 { width: 14%; } table.sec col.c3 { width: 29%; }
  tr.spacer td { height: 1.8mm; padding: 0; }
  .fhead { font-weight: bold; margin-top: 0.7mm; }
  .fgrid { display: grid; grid-template-columns: 27% 10% 26% 10% 21% 6%; margin: 0.4mm 0; }
  .fgrid .fb { text-align: left; }
  </style></head><body>
  <div class="bar" style="margin-bottom:4mm"></div>
  <div class="c hb">UNITED STATES<br>SECURITIES AND EXCHANGE COMMISSION<br>Washington, D.C. 20549</div>
  <div class="c form">FORM 10-K</div>
  <div class="chk"><span class="box">${CK}</span>ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934</div>
  <div class="c b" style="font-size:${pt(6.6)}">For the fiscal year ended December 31, ${fy}</div>
  <div class="c b" style="font-size:${pt(6.6)}">OR</div>
  <div class="chk"><span class="box">${UK}</span>TRANSITION REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934</div>
  <div class="c b" style="font-size:${pt(6.6)}">For the transition period from <span class="blank"></span> to <span class="blank"></span></div>
  <div class="c b" style="margin-top:1mm">Commission file number <span class="u">${fileNo1} (${corp})</span></div>
  <div class="c b">Commission file number <span class="u">${fileNo2} (${op})</span></div>
  <div class="c conm">${corpUp}<br>${opUp}</div>
  <div class="c">(Exact name of registrant as specified in its charter)</div>
  <div class="cols2 b"><div>${state1} (${corp})<br>Delaware (${op})</div><div>${ein1}<br>${ein2}</div></div>
  <div class="rule2"><div></div><div></div></div>
  <div class="cols2" style="margin-top:0"><div>(State or other jurisdiction of incorporation or organization)</div><div>(I.R.S. Employer Identification No.)</div></div>
  <div class="c b u" style="margin-top:0.8mm">${addr}</div>
  <div class="c">(Address of principal executive offices) (Zip Code)</div>
  <div class="c b u">${phone}</div>
  <div class="c">(Registrant&rsquo;s telephone number, including area code)</div>
  <div class="c">Securities registered pursuant to Section 12(b) of the Act:</div>

  <div class="cap">${corp}</div>
  <table class="sec"><colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup>
  <tr><th>${HDR[0]}</th><th>${HDR[1]}</th><th>${HDR[2]}</th></tr>
  ${tbl1Body}
  </table>

  <div class="cap">${op}</div>
  <table class="sec"><colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup>
  ${spacerRow}${tbl2Hdr}${tbl2Body}
  </table>

  <div class="p">Securities registered pursuant to section 12(g) of the Act: &nbsp;None</div>
  <div class="p">Indicate by check mark if the registrant is a well-known seasoned issuer, as defined in Rule 405 of the Securities Act.</div>
  ${pair(yn(1), yn(1))}
  <div class="p">Indicate by check mark if the registrant is not required to file reports pursuant to Section 13 or Section 15(d) of the Act.</div>
  ${pair(yn(0), yn(0))}
  <div class="p">Indicate by check mark whether the registrant (1) has filed all reports required to be filed by Section 13 or 15(d) of the Securities Exchange Act of 1934 during the preceding 12 months (or for such shorter period that the registrant was required to file such reports), and (2) has been subject to such filing requirements for the past 90 days.</div>
  ${pair(yn(1), yn(1))}
  <div class="p">Indicate by check mark whether the registrant has submitted electronically every Interactive Data File required to be submitted pursuant to Rule 405 of Regulation S-T (&sect; 232.405 of this chapter) during the preceding 12 months (or for such shorter period that the registrant was required to submit such files).</div>
  ${pair(yn(1), yn(1))}
  <div class="p">Indicate by check mark whether the registrant is a large accelerated filer, an accelerated filer, a non-accelerated filer, a smaller reporting company, or an emerging growth company. See the definitions of &ldquo;large accelerated filer,&rdquo; &ldquo;accelerated filer,&rdquo; &ldquo;smaller reporting company,&rdquo; and &ldquo;emerging growth company&rdquo; in Rule 12b-2 of the Exchange Act.</div>
  <div class="fhead">${corp}:</div>
  ${fgrid(CK, UK, UK, UK, UK)}
  <div class="fhead">${op}:</div>
  ${fgrid(UK, UK, CK, UK, UK)}
  <div class="p">If an emerging growth company, indicate by check mark if the registrant has elected not to use the extended transition period for complying with any new or revised financial accounting standards provided pursuant to Section 13(a) of the Exchange Act.</div>
  ${pair(UK, UK)}
  <div class="p">Indicate by check mark whether the registrant has filed a report on and attestation to its management&rsquo;s assessment of the effectiveness of its internal control over financial reporting under Section 404(b) of the Sarbanes-Oxley Act (15 U.S.C. 7262(b)) by the registered public accounting firm that prepared or issued its audit report.</div>
  ${pair(CK, attest2 ? CK : UK)}${errBlocks}
  <div class="p">Indicate by check mark whether the registrant is a shell company (as defined in Rule 12b-2 of the Act).</div>
  ${pair(yn(0), yn(0))}
  <div class="p">The aggregate market value of the voting and non-voting common equity held by non-affiliates of ${corp} was approximately ${mval} based upon the closing price on the ${exch} for such equity on June 30, ${fy}.</div>
  <div class="c" style="margin-top:0.9mm">(APPLICABLE ONLY TO CORPORATE REGISTRANTS)</div>
  <div class="p">Indicate the number of shares outstanding of each of the registrant's classes of common stock, as of the latest practicable date.</div>
  <div class="c">As of February ${asOfDay}, ${fy + 1}, ${corp} had ${shares} shares of common stock outstanding.</div>
  <div class="c">DOCUMENTS INCORPORATED BY REFERENCE</div>
  <div class="p">Part III incorporates certain information by reference to the ${corp}'s definitive proxy statement to be filed with respect to the Annual Meeting of Stockholders expected to be held on ${mtgMonth} ${mtgDay}, ${fy + 1}.</div>
  <div class="p">${exhLine}</div>
  <div class="botbars"><div></div><div></div></div>
  </body></html>`;

  // ---- GT: one logical 3-col table, flattened panels, no merges ------------
  const th = (r) => r.map((c) => `    <th>${c}</th>`).join("\n");
  const td = (r) => r.map((c) => `    <td>${c}</td>`).join("\n");
  const gtDataRows = [
    ...corpRows,
    ...(headerlessOp ? [] : [HDR]), // repeated panel-2 header renders as a data row
    ...opRows,
  ];
  const gt = "<table>\n"
    + `  <tr>\n${th(HDR)}\n  </tr>\n`
    + gtDataRows.map((r) => `  <tr>\n${td(r)}\n  </tr>`).join("\n") + "\n"
    + "</table>";

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
