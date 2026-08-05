// FAMILY generator — first page of a semiconductor (MOSFET) datasheet: gray logo
// banner + teal band, two-column prose (General Description | Product Summary),
// Applications, package-diagram strip (chip shots, 8-pin DFN pinout, MOSFET
// circuit symbol, optional Green badge), then fully boxed spec tables:
// Orderable Part Number (4 or 5 cols, 1-3 rows), Absolute Maximum Ratings
// (nested condition sub-column, heavy rowspans, cross-block unit merge,
// footnote markers, 8-17 data rows), Thermal Characteristics (5 or 6 cols,
// 3-5 data rows). Structure, column labels, title wording, font scale (+-10%)
// and quirk toggles are all seed-jittered; table block position and upper-page
// heights adapt so the page never overflows. All company identities/sites/part
// prefixes are fictional. GT = three logical tables, ~65-115 cells per seed.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p) => rng() < p;
  const f1 = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const shuffled = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // ---------- seeded identity (fictional pool, no real vendor / AONR-style ids) ----------
  const brand = pick([
    { l1: "AXIOM &amp; VERTA", l2: "SEMICONDUCTOR", init: "AV", pre: "AVT", site: "www.axvsemi.com" },
    { l1: "ARDEN &amp; MERIT", l2: "SEMICONDUCTOR", init: "AM", pre: "AMH", site: "www.ardenmerit.com" },
    { l1: "TALVEN MICRO", l2: "SEMICONDUCTOR", init: "TM", pre: "TVM", site: "www.talvenmicro.com" },
    { l1: "NORWICK &amp; HALE", l2: "SEMICONDUCTOR", init: "NH", pre: "NWH", site: "www.norwickhale.com" },
    { l1: "QUILLAN DEVICES", l2: "SEMICONDUCTOR", init: "QD", pre: "QDV", site: "www.quillandevices.com" },
    { l1: "VELMONT &amp; CROSS", l2: "SEMICONDUCTOR", init: "VC", pre: "VCM", site: "www.velmontcross.com" },
    { l1: "HELIX &amp; BOREA", l2: "SEMICONDUCTOR", init: "HB", pre: "HBR", site: "www.helixborea.com" },
  ]);
  const partNum = ri(41000, 89999);
  const part = `${brand.pre}${partNum}`;
  const V = pick([20, 25, 30, 40, 60]);
  const subtitle = pick([
    `${V}V N-Channel MOSFET`,
    `N-Channel ${V}V MOSFET`,
    `${V}V N-Channel Power MOSFET`,
  ]);

  // ---------- seeded values ----------
  const ID = ri(20, 55);
  const rds10 = (2.9 + rng() * 8).toFixed(1);
  const rds45 = (parseFloat(rds10) * (1.3 + rng() * 0.25)).toFixed(1);
  const idTc100 = f1(Math.round(ID * 0.85 * 2) / 2);
  const idTc125 = f1(Math.round(ID * 0.6 * 2) / 2);
  const idm = String(ID * pick([3, 4]));
  const idsm25 = Math.round(ID * 0.57);
  const idsm70 = f1(Math.round(idsm25 * 0.8 * 2) / 2);
  const ias = String(Math.round(ID * 1.1));
  const eas = String(Math.round(ID * 0.9));
  const Lval = pick(["0.05", "0.1", "0.3"]);
  const pd25 = ri(18, 35);
  const pd100 = f1(Math.round(pd25 * 0.4 * 10) / 10);
  const pdsm25 = f1(Math.round((3 + rng() * 3) * 10) / 10);
  const pdsm70 = f1(Math.round(parseFloat(pdsm25) * 0.63 * 10) / 10);
  const rjaT = ri(20, 32), rjaTmax = Math.round(rjaT * 1.25);
  const rjaS = ri(40, 58), rjaSmax = Math.round(rjaS * 1.27);
  const rjc = f1(Math.round((3 + rng() * 4) * 10) / 10);
  const rjcMax = f1(Math.round(parseFloat(rjc) * 1.24 * 10) / 10);
  const rjcT = (1 + rng() * 2).toFixed(1);
  const rjcTmax = (parseFloat(rjcT) * 1.3).toFixed(1);
  const rjl = ri(8, 16), rjlMax = Math.round(rjl * 1.25);
  const vgsBase = pick([12, 16, 20, 25]);
  const tlead = pick(["260", "270", "300"]);

  const [pkgBase, pkgTable] = pick([
    ["DFN 3x3", "DFN 3X3"], ["DFN 3.3x3.3", "DFN 3.3X3.3"], ["DFN 5x6", "DFN 5X6"],
    ["DFN 2x2", "DFN 2X2"], ["DFN 4x4", "DFN 4X4"],
  ]);
  const rev = `Rev.${ri(1, 4)}.${ri(0, 9)}: ${pick(["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"])} ${ri(2015, 2026)}`;
  const pageOf = `Page 1 of ${ri(5, 11)}`;

  // ---------- structural toggles (quirk probabilities are the family's point) ----------
  const mk = chance(0.5) ? { A: "A", B: "B", C: "C", D: "D", G: "G" }
                         : { A: "1", B: "2", C: "3", D: "4", G: "5" };
  const hasVgsT = chance(0.35);        // extra transient-VGS row
  const cdcN = chance(0.3) ? 3 : 2;    // continuous-drain-current condition rows
  const hasIdsm = chance(0.8);         // TA-referenced current pair
  const hasAva = chance(0.65);         // avalanche current + energy rows
  const hasPdsm = chance(0.75);        // TA-referenced power pair
  const hasLead = chance(0.35);        // lead soldering temperature row
  const thermTyp = chance(0.7);        // thermal table has Typ column (6 cols) or not (5)
  const thermJcPair = chance(0.3);     // junction-to-case as rowspan pair vs single row
  const hasJlead = chance(0.35);       // junction-to-lead row
  const nOrd = ri(1, 3);               // orderable part rows
  const ordMarking = chance(0.4);      // 5th "Marking" column
  const greenBadge = chance(0.85);

  // ---------- column-label / title pools ----------
  const L = {
    ordPn: pick(["Orderable Part Number", "Part Number", "Ordering Part Number"]),
    ordPkg: pick(["Package Type", "Package"]),
    ordForm: pick(["Form", "Shipping Form", "Packing"]),
    ordMoq: pick(["Minimum Order Quantity", "Minimum Order Qty", "MOQ (pcs)"]),
    maxCol: pick(["Maximum", "Rating", "Limit"]),
    units: pick(["Units", "Unit"]),
    typ: pick(["Typ", "Typical"]),
    max2: pick(["Max", "Maximum"]),
  };
  const absTitleHead = pick(["Absolute Maximum Ratings", "Absolute Maximum Ratings", "Maximum Ratings"]);
  const absTitleTail = pick(["unless otherwise noted", "unless otherwise specified"]);
  const thermTitle = pick(["Thermal Characteristics", "Thermal Resistance Ratings", "Thermal Data"]);

  // ---------- Orderable Part Number table (values shared html/GT) ----------
  const sfx = ["", "L", "E"];
  const formPool = ["Tape &amp; Reel", "Tape &amp; Reel, 7-inch", "Tube"];
  const ords = [];
  for (let i = 0; i < nOrd; i++) ords.push({
    pn: part + sfx[i],
    form: formPool[i],
    moq: String(pick([2500, 3000, 4000, 5000])),
    mark: brand.init + String(partNum + i).slice(1),
  });
  const ordCols = ordMarking
    ? `<colgroup><col style="width:26%"><col style="width:18%"><col style="width:19%"><col style="width:14%"><col style="width:23%"></colgroup>`
    : `<colgroup><col style="width:29%"><col style="width:21%"><col style="width:22%"><col style="width:28%"></colgroup>`;
  const ordHead = `<tr><th>${L.ordPn}</th><th>${L.ordPkg}</th>${ordMarking ? "<th>Marking</th>" : ""}<th>${L.ordForm}</th><th>${L.ordMoq}</th></tr>`;
  const ordHtml = `<table class="spec">
  ${ordCols}
  ${ordHead}
  ${ords.map((o) => `<tr><td class="c">${o.pn}</td><td class="c">${pkgTable}</td>${ordMarking ? `<td class="c">${o.mark}</td>` : ""}<td class="c">${o.form}</td><td class="c">${o.moq}</td></tr>`).join("\n  ")}
  </table>`;
  const gtOrd = `<table>
  ${ordHead}
  ${ords.map((o) => `<tr><td>${o.pn}</td><td>${pkgTable}</td>${ordMarking ? `<td>${o.mark}</td>` : ""}<td>${o.form}</td><td>${o.moq}</td></tr>`).join("\n  ")}
</table>`;

  // ---------- Absolute Maximum Ratings rows (html + GT built in lockstep) ----------
  const ah = [], ag = [];
  const row = (h, g) => { ah.push(h); ag.push(g); };

  row(`<tr><td class="p" colspan="2">Drain-Source Voltage</td><td class="c">V<sub>DS</sub></td><td class="c">${V}</td><td class="c">V</td></tr>`,
      `<tr><td colspan="2">Drain-Source Voltage</td><td>VDS</td><td>${V}</td><td>V</td></tr>`);
  row(`<tr><td class="p" colspan="2">Gate-Source Voltage</td><td class="c">V<sub>GS</sub></td><td class="c">&plusmn;${vgsBase}</td><td class="c">V</td></tr>`,
      `<tr><td colspan="2">Gate-Source Voltage</td><td>VGS</td><td>&plusmn;${vgsBase}</td><td>V</td></tr>`);
  if (hasVgsT)
    row(`<tr><td class="p" colspan="2">Gate-Source Voltage, Transient (t&le;100&mu;s)</td><td class="c">V<sub>GS</sub></td><td class="c">&plusmn;${vgsBase + 5}</td><td class="c">V</td></tr>`,
        `<tr><td colspan="2">Gate-Source Voltage, Transient (t&le;100&mu;s)</td><td>VGS</td><td>&plusmn;${vgsBase + 5}</td><td>V</td></tr>`);

  const cdcConds = [["25", String(ID)], ["100", idTc100], ["125", idTc125]].slice(0, cdcN);
  row(`<tr><td class="p" rowspan="${cdcN}">Continuous Drain Current <sup>${mk.G}</sup></td><td class="cond">T<sub>C</sub>=25&deg;C</td><td class="c" rowspan="${cdcN}">I<sub>D</sub></td><td class="c">${ID}</td><td class="c" rowspan="${cdcN + 1}">A</td></tr>`,
      `<tr><td rowspan="${cdcN}">Continuous Drain Current ${mk.G}</td><td>TC=25&deg;C</td><td rowspan="${cdcN}">ID</td><td>${ID}</td><td rowspan="${cdcN + 1}">A</td></tr>`);
  for (let i = 1; i < cdcN; i++)
    row(`<tr><td class="cond">T<sub>C</sub>=${cdcConds[i][0]}&deg;C</td><td class="c">${cdcConds[i][1]}</td></tr>`,
        `<tr><td>TC=${cdcConds[i][0]}&deg;C</td><td>${cdcConds[i][1]}</td></tr>`);
  row(`<tr><td class="p" colspan="2">Pulsed Drain Current <sup>${mk.C}</sup></td><td class="c">I<sub>DM</sub></td><td class="c">${idm}</td></tr>`,
      `<tr><td colspan="2">Pulsed Drain Current ${mk.C}</td><td>IDM</td><td>${idm}</td></tr>`);

  if (hasIdsm) {
    row(`<tr><td class="p" rowspan="2">Continuous Drain Current</td><td class="cond">T<sub>A</sub>=25&deg;C</td><td class="c" rowspan="2">I<sub>DSM</sub></td><td class="c">${idsm25}</td><td class="c" rowspan="2">A</td></tr>`,
        `<tr><td rowspan="2">Continuous Drain Current</td><td>TA=25&deg;C</td><td rowspan="2">IDSM</td><td>${idsm25}</td><td rowspan="2">A</td></tr>`);
    row(`<tr><td class="cond">T<sub>A</sub>=70&deg;C</td><td class="c">${idsm70}</td></tr>`,
        `<tr><td>TA=70&deg;C</td><td>${idsm70}</td></tr>`);
  }
  if (hasAva) {
    row(`<tr><td class="p" colspan="2">Avalanche Current <sup>${mk.C}</sup></td><td class="c">I<sub>AS</sub></td><td class="c">${ias}</td><td class="c">A</td></tr>`,
        `<tr><td colspan="2">Avalanche Current ${mk.C}</td><td>IAS</td><td>${ias}</td><td>A</td></tr>`);
    row(`<tr><td class="p">Avalanche energy</td><td class="cond">L=${Lval}mH <sup>${mk.C}</sup></td><td class="c">E<sub>AS</sub></td><td class="c">${eas}</td><td class="c">mJ</td></tr>`,
        `<tr><td>Avalanche energy</td><td>L=${Lval}mH ${mk.C}</td><td>EAS</td><td>${eas}</td><td>mJ</td></tr>`);
  }
  row(`<tr><td class="p" rowspan="2">Power Dissipation <sup>${mk.B}</sup></td><td class="cond">T<sub>C</sub>=25&deg;C</td><td class="c" rowspan="2">P<sub>D</sub></td><td class="c">${pd25}</td><td class="c" rowspan="2">W</td></tr>`,
      `<tr><td rowspan="2">Power Dissipation ${mk.B}</td><td>TC=25&deg;C</td><td rowspan="2">PD</td><td>${pd25}</td><td rowspan="2">W</td></tr>`);
  row(`<tr><td class="cond">T<sub>C</sub>=100&deg;C</td><td class="c">${pd100}</td></tr>`,
      `<tr><td>TC=100&deg;C</td><td>${pd100}</td></tr>`);
  if (hasPdsm) {
    row(`<tr><td class="p" rowspan="2">Power Dissipation <sup>${mk.A}</sup></td><td class="cond">T<sub>A</sub>=25&deg;C</td><td class="c" rowspan="2">P<sub>DSM</sub></td><td class="c">${pdsm25}</td><td class="c" rowspan="2">W</td></tr>`,
        `<tr><td rowspan="2">Power Dissipation ${mk.A}</td><td>TA=25&deg;C</td><td rowspan="2">PDSM</td><td>${pdsm25}</td><td rowspan="2">W</td></tr>`);
    row(`<tr><td class="cond">T<sub>A</sub>=70&deg;C</td><td class="c">${pdsm70}</td></tr>`,
        `<tr><td>TA=70&deg;C</td><td>${pdsm70}</td></tr>`);
  }
  row(`<tr><td class="p" colspan="2">Junction and Storage Temperature Range</td><td class="c">T<sub>J</sub>, T<sub>STG</sub></td><td class="c">-55 to 150</td><td class="c">&deg;C</td></tr>`,
      `<tr><td colspan="2">Junction and Storage Temperature Range</td><td>TJ, TSTG</td><td>-55 to 150</td><td>&deg;C</td></tr>`);
  if (hasLead)
    row(`<tr><td class="p" colspan="2">Maximum Lead Temperature for Soldering, 10s</td><td class="c">T<sub>L</sub></td><td class="c">${tlead}</td><td class="c">&deg;C</td></tr>`,
        `<tr><td colspan="2">Maximum Lead Temperature for Soldering, 10s</td><td>TL</td><td>${tlead}</td><td>&deg;C</td></tr>`);

  const absHtml = `<table class="spec">
  <colgroup><col style="width:27%"><col style="width:20%"><col style="width:12%"><col style="width:26%"><col style="width:15%"></colgroup>
  <tr><td class="ttl" colspan="5">${absTitleHead}&nbsp; T<sub>A</sub>=25&deg;C ${absTitleTail}</td></tr>
  <tr><th class="pl" colspan="2">Parameter</th><th>Symbol</th><th>${L.maxCol}</th><th>${L.units}</th></tr>
  ${ah.join("\n  ")}
  </table>`;
  const gtAbs = `<table>
  <tr><td colspan="5">${absTitleHead} TA=25&deg;C ${absTitleTail}</td></tr>
  <tr><th colspan="2">Parameter</th><th>Symbol</th><th>${L.maxCol}</th><th>${L.units}</th></tr>
  ${ag.join("\n  ")}
</table>`;

  // ---------- Thermal table (5 or 6 cols) ----------
  const tTyp = (v) => (thermTyp ? `<td class="c">${v}</td>` : "");
  const gTyp = (v) => (thermTyp ? `<td>${v}</td>` : "");
  const th = [], tg = [];
  const trow = (h, g) => { th.push(h); tg.push(g); };

  trow(`<tr><td class="p">Maximum Junction-to-Ambient <sup>${mk.A}</sup></td><td class="cond">t &le; 10s</td><td class="c" rowspan="2">R<sub>&theta;JA</sub></td>${tTyp(rjaT)}<td class="c">${rjaTmax}</td><td class="c" rowspan="2">&deg;C/W</td></tr>`,
       `<tr><td>Maximum Junction-to-Ambient ${mk.A}</td><td>t &le; 10s</td><td rowspan="2">R&theta;JA</td>${gTyp(rjaT)}<td>${rjaTmax}</td><td rowspan="2">&deg;C/W</td></tr>`);
  trow(`<tr><td class="p">Maximum Junction-to-Ambient <sup>${mk.A} ${mk.D}</sup></td><td class="cond">Steady-State</td>${tTyp(rjaS)}<td class="c">${rjaSmax}</td></tr>`,
       `<tr><td>Maximum Junction-to-Ambient ${mk.A} ${mk.D}</td><td>Steady-State</td>${gTyp(rjaS)}<td>${rjaSmax}</td></tr>`);
  if (thermJcPair) {
    trow(`<tr><td class="p" rowspan="2">Maximum Junction-to-Case</td><td class="cond">t &le; 10s</td><td class="c" rowspan="2">R<sub>&theta;JC</sub></td>${tTyp(rjcT)}<td class="c">${rjcTmax}</td><td class="c" rowspan="2">&deg;C/W</td></tr>`,
         `<tr><td rowspan="2">Maximum Junction-to-Case</td><td>t &le; 10s</td><td rowspan="2">R&theta;JC</td>${gTyp(rjcT)}<td>${rjcTmax}</td><td rowspan="2">&deg;C/W</td></tr>`);
    trow(`<tr><td class="cond">Steady-State</td>${tTyp(rjc)}<td class="c">${rjcMax}</td></tr>`,
         `<tr><td>Steady-State</td>${gTyp(rjc)}<td>${rjcMax}</td></tr>`);
  } else {
    trow(`<tr><td class="p">Maximum Junction-to-Case</td><td class="cond">Steady-State</td><td class="c">R<sub>&theta;JC</sub></td>${tTyp(rjc)}<td class="c">${rjcMax}</td><td class="c">&deg;C/W</td></tr>`,
         `<tr><td>Maximum Junction-to-Case</td><td>Steady-State</td><td>R&theta;JC</td>${gTyp(rjc)}<td>${rjcMax}</td><td>&deg;C/W</td></tr>`);
  }
  if (hasJlead)
    trow(`<tr><td class="p">Maximum Junction-to-Lead <sup>${mk.B}</sup></td><td class="cond">Steady-State</td><td class="c">R<sub>&theta;JL</sub></td>${tTyp(rjl)}<td class="c">${rjlMax}</td><td class="c">&deg;C/W</td></tr>`,
         `<tr><td>Maximum Junction-to-Lead ${mk.B}</td><td>Steady-State</td><td>R&theta;JL</td>${gTyp(rjl)}<td>${rjlMax}</td><td>&deg;C/W</td></tr>`);

  const thermNC = thermTyp ? 6 : 5;
  const thermCols = thermTyp
    ? `<colgroup><col style="width:27%"><col style="width:13%"><col style="width:12%"><col style="width:15%"><col style="width:16%"><col style="width:17%"></colgroup>`
    : `<colgroup><col style="width:27%"><col style="width:15%"><col style="width:14%"><col style="width:24%"><col style="width:20%"></colgroup>`;
  const thermHead = `<tr><th class="pl" colspan="2">Parameter</th><th>Symbol</th>${thermTyp ? `<th>${L.typ}</th>` : ""}<th>${L.max2}</th><th>${L.units}</th></tr>`;
  const thermHtml = `<table class="spec">
  ${thermCols}
  <tr><td class="ttl" colspan="${thermNC}">${thermTitle}</td></tr>
  ${thermHead}
  ${th.join("\n  ")}
  </table>`;
  const gtTherm = `<table>
  <tr><td colspan="${thermNC}">${thermTitle}</td></tr>
  ${thermHead}
  ${tg.join("\n  ")}
</table>`;

  // ---------- adaptive layout: font scale +-10%, shrink-to-fit, no overflow ----------
  let fs = 0.9 + rng() * 0.2;
  const wrapExtra = nOrd >= 2 ? 1 : 0; // "Tape & Reel, 7-inch" wraps to two lines
  const totalVis = (1 + nOrd) + (2 + ah.length) + (2 + th.length) + wrapExtra;
  const mmPt = 25.4 / 72;
  const gap = 4.5;
  const tablesHmm = () => totalVis * (8 * fs * 1.25 + 2.8 + 0.9) * mmPt + 2 * gap + 8;
  let tablesTop = 276 - tablesHmm();
  while (tablesTop < 133 && fs > 0.8) { fs -= 0.02; tablesTop = 276 - tablesHmm(); }
  tablesTop = Math.min(Math.max(tablesTop, 133), 153);
  const diagH = ri(30, 34);
  const colsMinH = Math.min(Math.max(tablesTop - 46.8 - (diagH + 6) - 4, 48), 72);
  const tight = colsMinH < 56;
  const p = (v) => (v * fs).toFixed(2);

  // ---------- prose content (counts seed-varied, capped when page is tight) ----------
  const appsAll = [
    "Notebook AC-in load switch", "Battery protection charge/discharge",
    "DC/DC converter", "Load switch", "Power management in servers", "Motor drive",
    "Telecom bricks and modules", "USB power delivery", "Point-of-load converters",
    "Hot-swap control",
  ];
  const nApps = tight ? 2 : ri(2, 4);
  const apps = shuffled(appsAll).slice(0, nApps);
  const descExtras = shuffled([
    pick(["High Current capability", "High current handling capability"]),
    "RoHS and Halogen-Free Compliant", "Low gate charge", "Fast switching speed",
  ]);
  const nDesc = tight ? Math.min(ri(3, 5), 4) : ri(3, 5);
  const desc = [
    pick(["Latest advanced trench technology", "Advanced low-voltage trench technology",
          "State-of-the-art trench power process"]),
    'Low R<sub>DS(ON)</sub>',
    ...descExtras.slice(0, nDesc - 2),
  ];
  const testedAll = ["100% UIS Tested", "100% R<sub>g</sub> Tested", "100% EAS Guaranteed"];
  const tested = shuffled(testedAll).slice(0, ri(1, 2));
  const kvExtra = chance(0.5) && !tight
    ? pick([`<span>V<sub>GS(th)</sub></span><span>${(1 + rng() * 1.5).toFixed(1)}V</span>`,
            `<span>Q<sub>g</sub> (typ)</span><span>${ri(8, 40)}nC</span>`])
    : "";

  // ---------- diagrams (inline SVG) ----------
  const pinNames = ["S", "S", "S", "G"];
  let pinL = "", pinR = "";
  for (let i = 0; i < 4; i++) {
    const y = 16 + i * 19;
    pinL += `<rect x="30" y="${y}" width="9" height="8" fill="none" stroke="#000" stroke-width="0.8"/>
      <text x="24" y="${y + 7}" font-size="7" text-anchor="end">${pinNames[i]}</text>
      <text x="43" y="${y + 6.5}" font-size="5">${i + 1}</text>`;
    pinR += `<rect x="91" y="${y}" width="9" height="8" fill="none" stroke="#000" stroke-width="0.8"/>
      <text x="106" y="${y + 7}" font-size="7">D</text>
      <text x="88" y="${y + 6.5}" font-size="5" text-anchor="end">${8 - i}</text>`;
  }
  const pinoutSvg = `<svg width="118" height="100" viewBox="0 0 118 100">
    <rect x="39" y="10" width="52" height="82" fill="none" stroke="#000" stroke-width="1"/>
    <circle cx="48" cy="21" r="2.6" fill="#000"/>${pinL}${pinR}</svg>`;

  const mosfetSvg = `<svg width="92" height="98" viewBox="0 0 92 98">
    <g stroke="#000" stroke-width="1.1" fill="none">
      <line x1="36" y1="24" x2="36" y2="72"/>
      <line x1="42" y1="24" x2="42" y2="37"/><line x1="42" y1="41" x2="42" y2="55"/><line x1="42" y1="59" x2="42" y2="72"/>
      <line x1="14" y1="48" x2="36" y2="48"/>
      <line x1="42" y1="30" x2="64" y2="30"/><line x1="64" y1="30" x2="64" y2="10"/>
      <line x1="42" y1="66" x2="64" y2="66"/><line x1="64" y1="66" x2="64" y2="88"/>
      <line x1="42" y1="48" x2="56" y2="48"/><line x1="56" y1="48" x2="56" y2="66"/>
      <polygon points="42,48 51,44 51,52" fill="#000"/>
      <line x1="64" y1="30" x2="78" y2="30"/><line x1="78" y1="30" x2="78" y2="42"/>
      <line x1="78" y1="56" x2="78" y2="66"/><line x1="78" y1="66" x2="64" y2="66"/>
      <polygon points="78,56 72,44 84,44" fill="#000"/><line x1="72" y1="56" x2="84" y2="56"/>
      <circle cx="64" cy="8" r="2.4"/><circle cx="64" cy="90" r="2.4"/>
    </g>
    <text x="70" y="10" font-size="8">D</text><text x="70" y="94" font-size="8">S</text>
    <text x="5" y="51" font-size="8">G</text></svg>`;

  const chipTopSvg = `<svg width="86" height="66" viewBox="0 0 86 66">
    <g transform="rotate(-9 43 33)"><rect x="16" y="12" width="52" height="42" rx="3" fill="#161616"/>
    <rect x="20" y="16" width="44" height="34" rx="2" fill="#242424"/>
    <circle cx="26" cy="44" r="3" fill="#3a3a3a"/>
    <text x="42" y="36" font-size="7" fill="#8a8a8a" text-anchor="middle" font-style="italic">${brand.init}</text></g></svg>`;
  let pads = "";
  for (let i = 0; i < 4; i++) {
    const y = 17 + i * 9;
    pads += `<rect x="19" y="${y}" width="7" height="5" fill="#c9a44c"/><rect x="60" y="${y}" width="7" height="5" fill="#c9a44c"/>`;
  }
  const chipBotSvg = `<svg width="86" height="66" viewBox="0 0 86 66">
    <g transform="rotate(7 43 33)"><rect x="15" y="11" width="56" height="44" rx="3" fill="#1c1c1c"/>
    ${pads}<rect x="31" y="17" width="24" height="32" fill="#9c9c9c"/>
    <circle cx="23" cy="51" r="2" fill="#c9a44c"/></g></svg>`;

  // ---------- page ----------
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; width: 210mm; height: 296mm; position: relative;
         font-family: Arial, Helvetica, sans-serif; color: #000; font-size: ${p(7.5)}pt; }
  .frame { position: absolute; left: 13mm; right: 13mm; top: 20mm; border: 0.9pt solid #000; }
  .banner { background: #d2d2d2; height: 25mm; position: relative; }
  .logo { position: absolute; left: 4mm; top: 4mm; display: flex; align-items: center; }
  .logo-circ { width: 9mm; height: 9mm; border-radius: 50%; background: #1c3e94; color: #fff;
               font-family: Georgia, serif; font-style: italic; font-weight: bold; font-size: 12pt;
               display: flex; align-items: center; justify-content: center; margin-right: 2mm; }
  .lg1 { font-family: Georgia, serif; font-weight: bold; font-style: italic; font-size: 10.5pt;
         border-bottom: 1.4pt solid #000; padding-bottom: 0.4mm; }
  .lg2 { font-family: Georgia, serif; font-size: 8pt; letter-spacing: 3.2pt;
         border-bottom: 0.9pt solid #000; padding: 0.4mm 0 0.3mm; }
  .pn { position: absolute; right: 4mm; top: 3mm; text-align: right; }
  .pn1 { font-size: 20pt; font-weight: bold; font-style: italic; }
  .pn2 { font-size: 11pt; font-weight: bold; font-style: italic; }
  .band { height: 1.8mm; background: #0f4d55; }
  .cols { display: flex; border-bottom: 0.9pt solid #000; min-height: ${colsMinH.toFixed(1)}mm; }
  .colL { width: 47%; border-right: 0.9pt solid #000; padding: 4mm 4mm 3mm 5mm; box-sizing: border-box; }
  .colR { width: 53%; padding: 4mm 4mm 3mm 5mm; box-sizing: border-box; position: relative; }
  h3 { font-size: ${p(9)}pt; margin: 0 0 3.5mm; }
  .bl { margin: 0 0 1.1mm 1mm; }
  .kv { display: grid; grid-template-columns: 1fr 30mm; row-gap: 1.2mm; margin: 1mm 6mm 0 2mm; }
  .apps { margin-top: ${tight ? 4 : 9}mm; }
  .tested { margin: 1mm 0 0 2mm; line-height: 1.7; }
  .badge { position: absolute; right: 5mm; bottom: 6mm; width: 13mm; text-align: center; }
  .badge-circ { width: 9mm; height: 9mm; border-radius: 50%; margin: 0 auto;
                background: radial-gradient(circle at 35% 35%, #7cc44a, #2e7d1e); }
  .badge-word { font-family: Georgia, serif; font-style: italic; color: #2e7d1e; font-size: 8.5pt;
                font-weight: bold; margin-top: -2.6mm; text-shadow: 0.2mm 0.2mm 0 #fff; }
  .badge-sub { font-size: 4.5pt; color: #2e7d1e; }
  .diag { display: flex; align-items: center; justify-content: space-between; padding: 3mm 6mm; height: ${diagH}mm; }
  .dg { text-align: center; }
  .dg .cap { font-weight: bold; font-size: ${p(7.5)}pt; margin-bottom: 1mm; }
  .shotrow { display: flex; gap: 5mm; }
  .shot .cap2 { font-weight: bold; font-size: ${p(7)}pt; }
  .pin1lbl { font-size: 6.5pt; text-align: left; margin: -1.5mm 0 0 1mm; }
  .tables { position: absolute; top: ${tablesTop.toFixed(1)}mm; left: 13mm; width: 184mm; }
  table.spec { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0 0 ${gap}mm; }
  .spec th, .spec td { border: 0.75pt solid #000; font-size: ${p(8)}pt; padding: 1.4pt 3pt; line-height: 1.25; }
  .spec th { font-weight: bold; text-align: center; }
  .spec th.pl { text-align: left; }
  .spec td.ttl { font-weight: bold; }
  .spec td.c { text-align: center; }
  .spec td.cond { font-size: ${p(7)}pt; }
  sub { font-size: ${p(5.5)}pt; } sup { font-size: ${p(5.5)}pt; }
  .footer { position: absolute; bottom: 11mm; left: 13mm; right: 13mm; font-size: 8pt;
            display: flex; justify-content: space-between; align-items: baseline; }
  .footer .site { font-weight: bold; }
  </style></head><body>
  <div class="frame">
    <div class="banner">
      <div class="logo"><div class="logo-circ">${brand.init}</div>
        <div><div class="lg1">${brand.l1}</div><div class="lg2">${brand.l2}</div></div></div>
      <div class="pn"><div class="pn1">${part}</div><div class="pn2">${subtitle}</div></div>
    </div>
    <div class="band"></div>
    <div class="cols">
      <div class="colL">
        <h3>General Description</h3>
        ${desc.map((d) => `<div class="bl">&bull; ${d}</div>`).join("\n        ")}
        <div class="apps"><h3>Applications</h3>
        ${apps.map((d) => `<div class="bl">&bull; ${d}</div>`).join("\n        ")}</div>
      </div>
      <div class="colR">
        <h3>Product Summary</h3>
        <div class="kv">
          <span>V<sub>DS</sub></span><span>${V}V</span>
          <span>I<sub>D</sub> (at V<sub>GS</sub>=10V)</span><span>${ID}A</span>
          <span>R<sub>DS(ON)</sub> (at V<sub>GS</sub>=10V)</span><span>&lt; ${rds10}m&Omega;</span>
          <span>R<sub>DS(ON)</sub> (at V<sub>GS</sub>=4.5V)</span><span>&lt; ${rds45}m&Omega;</span>
          ${kvExtra}
        </div>
        <div class="tested" style="margin-top:${tight ? 5 : 9}mm">${tested.join("<br>")}</div>
        ${greenBadge ? '<div class="badge"><div class="badge-circ"></div><div class="badge-word">Green</div><div class="badge-sub">Product</div></div>' : ""}
      </div>
    </div>
    <div class="diag">
      <div class="dg"><div class="cap">${pkgBase}_EP</div>
        <div class="shotrow">
          <div class="shot"><div class="cap2">Top View</div>${chipTopSvg}<div class="pin1lbl">PIN1</div></div>
          <div class="shot"><div class="cap2">Bottom View</div>${chipBotSvg}</div>
        </div></div>
      <div class="dg"><div class="cap">Top View</div>${pinoutSvg}</div>
      <div class="dg">${mosfetSvg}</div>
    </div>
  </div>
  <div class="tables">${ordHtml}\n${absHtml}\n${thermHtml}</div>
  <div class="footer"><span>${rev}</span><span class="site">${brand.site}</span><span>${pageOf}</span></div>
  </body></html>`;

  const gt = [gtOrd, gtAbs, gtTherm].join("\n\n");
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
