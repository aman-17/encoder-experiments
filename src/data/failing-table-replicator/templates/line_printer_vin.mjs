// FAMILY GENERATOR (training data) — VIN vehicle-rating-symbol lookup spool
// dumped onto one abnormally tall page: ONE continuous 18-col table, no cell
// borders/shading — the only furniture is one thick rule under the header;
// columns separated by whitespace; small Arial report-spool look with two-line
// stacked bold-italic header fragments (BODY over TYPE, BI over SYM, ...).
// Quirks kept (seed-tuned probabilities): lexicographic VIN sort (digit year
// codes 01/02 sort before letter year codes T/V/W when the seed's year window
// includes 2001+), variable-width MODEL field hard-truncated at 20 chars,
// sporadic blank CARB cells that shift the whitespace, leading-zero 2-digit
// symbol columns with near-constant identical-value runs, stray body-type
// glitches (SV/2W), trailing sentinel token on every row.
// DECONTAMINATED: all vendor/make/model names are fictional pools; no real
// manufacturer, model line, or data-vendor identifiers remain.
// Structural jitter per seed: data-row count 34-72, VIN-family subset+order,
// model-year window, header-label synonyms, vendor title, sentinel token,
// font size ±10%, page height (content + seeded trailing feed), quirk rates.
// GT = ONE logical 18-col table, header row + data rows -> ~630-1314 cells.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = a => a[Math.floor(rng() * a.length)];

  const YR = { 1980:"A",1981:"B",1982:"C",1983:"D",1984:"E",1985:"F",1986:"G",
    1987:"H",1988:"J",1989:"K",1990:"L",1991:"M",1992:"N",1993:"P",1994:"R",
    1995:"S",1996:"T",1997:"V",1998:"W",1999:"X",2000:"Y",2001:"1",2002:"2" };

  // name kits: same document family, different (fictional) manufacturer spool
  const kits = [
    { make:"VECTA", wmi:"1VD", mvS:"MERIDOSA", mvL:"GRAND MERIDOSA",
      se:"SE", le:"LE", es:"ES", sport:"SPORT", utLate:"CRAGMONT",
      ut2:"CRAGMONT RD-100", ut4:"CRAGMONT RW-100",
      wagS:"VD150 WAGON", vanS:"VD150 VAN", wagL:"VD250 WAGON", vanL:"VD250 VAN" },
    { make:"TALIN", wmi:"1TL", mvS:"WINDMERE", mvL:"WINDMERE EXT",
      se:"CS", le:"CL", es:"LT", sport:"SPORT", utLate:"STONEVALE",
      ut2:"STONEVALE C-10", ut4:"STONEVALE K-10",
      wagS:"TL100 WAGON", vanS:"TL100 VAN", wagL:"TL200 WAGON", vanL:"TL200 VAN" },
    { make:"ARDEX", wmi:"1AD", mvS:"CALVERO", mvL:"GRAND CALVERO",
      se:"SE", le:"LE", es:"ES", sport:"SPORT", utLate:"HIGHMOOR",
      ut2:"HIGHMOOR HD-100", ut4:"HIGHMOOR HW-100",
      wagS:"AD150 WAGON", vanS:"AD150 VAN", wagL:"AD250 WAGON", vanL:"AD250 VAN" },
    { make:"KORVA", wmi:"1KV", mvS:"SOLANTE", mvL:"SOLANTE EXT",
      se:"DX", le:"LX", es:"GX", sport:"SPORT", utLate:"ROCKMERE",
      ut2:"ROCKMERE R-20", ut4:"ROCKMERE R-40",
      wagS:"KV110 WAGON", vanS:"KV110 VAN", wagL:"KV220 WAGON", vanL:"KV220 VAN" },
    { make:"MIRAV", wmi:"1MV", mvS:"PELLARO", mvL:"GRAND PELLARO",
      se:"SE", le:"LE", es:"ES", sport:"SPORT", utLate:"DUNCREST",
      ut2:"DUNCREST D-100", ut4:"DUNCREST D-400",
      wagS:"MV150 WAGON", vanS:"MV150 VAN", wagL:"MV250 WAGON", vanL:"MV250 VAN" },
    { make:"DUNMO", wmi:"1DM", mvS:"TERRALIN", mvL:"TERRALIN EXT",
      se:"CS", le:"CL", es:"LT", sport:"SPORT", utLate:"KELDARE",
      ut2:"KELDARE C-15", ut4:"KELDARE K-15",
      wagS:"DM120 WAGON", vanS:"DM120 VAN", wagL:"DM240 WAGON", vanL:"DM240 VAN" },
    { make:"FENWK", wmi:"1FW", mvS:"OSTARA", mvL:"GRAND OSTARA",
      se:"SE", le:"LE", es:"ES", sport:"SPORT", utLate:"BREMOND",
      ut2:"BREMOND B-100", ut4:"BREMOND B-400",
      wagS:"FW150 WAGON", vanS:"FW150 VAN", wagL:"FW250 WAGON", vanL:"FW250 VAN" },
  ];
  const n = pick(kits);

  // per-seed digit permutation applied to VIN family digit pairs (keeps all
  // family codes distinct, reshuffles sort order and values between seeds)
  const P = [0,1,2,3,4,5,6,7,8,9];
  for (let i = 9; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }

  // ---- seeded structural knobs -------------------------------------------
  const fs = Math.round((7.7 + rng() * 1.6) * 10) / 10;   // font size ±~10% of 8.5pt
  const scale = fs / 8.5;
  const lh = Math.round(5.66 * scale * 100) / 100;        // data-row line height (mm)
  const hl = Math.round(4.0 * scale * 100) / 100;         // header line height (mm)
  const tail = 15 + rng() * 70;                           // trailing blank spool feed (mm)

  // fictional data-vendor title (first header cell doubles as report title)
  const vendor = pick(["VINTRA VIN","DATAVIN","VINDEX VIN","VINCOR VIN",
    "REGISTAT VIN","AUTOSTAT VIN","VINETICS VIN"]);
  // header-label synonym pools ([top line, bottom line])
  const hYear  = pick([["MODEL","YEAR"],["MDL","YEAR"],["","YEAR"]]);
  const hMake  = pick([["","MAKE"],["","MFR"]]);
  const hModel = pick([["","MODEL"],["","SERIES"]]);
  const hBody  = pick([["BODY","TYPE"],["BODY","STYLE"]]);
  const hDrive = pick([["WHEEL","DRIVE"],["DRIVE","TYPE"],["WHL","DRV"]]);
  const hCyl   = pick([["","CYL"],["","CYLS"]]);
  const hCid   = pick([["","CID"],["","DISP"]]);
  const hLux   = pick([["LUX","IND"],["LUX","CODE"],["PRC","IND"]]);
  const symW   = pick(["SYM","SYMB"]);
  const hLast  = pick(["YMM","EOR","CHK"]);
  const sentinel = pick(["YYY","ZZZ","XXX","EEE","999"]);

  // model-year window (varies which era/families the spool covers)
  const [w0, w1] = pick([[1980,2002],[1982,2002],[1984,2002],[1980,1997],
    [1980,2000],[1986,2002],[1980,1995]]);

  const nData = 34 + Math.floor(rng() * 39); // target data rows: 34-72

  // quirk probabilities (seed-tuned)
  const pGlitch = 0.004 + rng() * 0.012;     // stray body-code glitch
  const pCarbEarly = 0.03 + rng() * 0.05;    // blank CARB, pre-'87 rows
  const pCarbLate = 0.006 + rng() * 0.014;   // blank CARB, later rows
  const pSymJit = 0.25 + rng() * 0.3;        // symbol jitter off the base run
  // ------------------------------------------------------------------------

  const spoRule = y => y >= 2001 ? `${n.mvL} ${n.sport}` : y >= 1997 ? `${n.mvL} ${n.se} SPORT` : `${n.mvL} ${n.se}`;
  // engines: [vinChar, cyl, cid, fuel, yearFrom, yearTo]
  const FAMS = [
    { f:"FH41", body:"PV", d:"42", model:y=>`${n.mvS} ${n.le}`,
      eng:[["G",4,156,"G",1984,1985],["K",4,153,"G",1986,1988]] },
    { f:"FH54", body:"PV", d:"42", model:y=>`${n.mvL} ${n.le}`,
      eng:[["3",6,181,"G",1989,1990],["J",4,153,"G",1989,1989],["R",6,201,"G",1990,1990]] },
    { f:"FK51", body:"PV", d:"42", model:y=>`${n.mvS} ${n.le}`,
      eng:[["G",4,156,"G",1984,1984],["K",4,153,"G",1987,1988]] },
    { f:"FK54", body:"PV", d:"42", model:y=>`${n.mvL} ${n.le}`,
      eng:[["3",6,181,"G",1989,1990],["J",4,153,"G",1989,1989],["R",6,201,"G",1990,1990]] },
    { f:"FP25", body:"PV", d:"42", model:y=>`${n.mvS} ${n.se}`,
      eng:[["3",6,201,"F",2001,2002],["B",4,148,"G",2001,2002],["G",6,201,"G",2001,2001],["R",6,201,"G",2001,2002]] },
    { f:"FP44", body:"PV", d:"42", model:spoRule,
      eng:[["R",6,201,"G",1996,2000],["B",4,148,"G",1996,1997]] },
    { f:"FP54", body:"PV", d:"42", model:y=>`${n.mvL} ${n.le} ES`,
      eng:[["L",6,230,"G",1996,1997],["R",6,201,"G",1996,1997]] },
    { f:"GB11", body:"PV", d:"42", model:y=>n.wagS,
      eng:[["E",6,225,"G",1982,1982],["H",6,225,"G",1983,1984],["P",8,318,"G",1982,1982],["T",8,318,"G",1983,1984]] },
    { f:"GB13", body:"CG", d:"42", model:y=>n.vanS,
      eng:[["E",6,225,"G",1982,1982],["H",6,225,"G",1984,1984],["T",8,318,"G",1983,1985]] },
    { f:"GD12", body:"UT", d:"42", model:y=>n.ut2,
      eng:[["1",8,360,"G",1985,1985],["P",8,318,"G",1981,1982],["R",8,318,"G",1982,1982],
           ["T",8,318,"G",1983,1985],["U",8,318,"G",1983,1983],["W",8,360,"G",1984,1985]] },
    { f:"GD44", body:"PV", d:"44", model:y=>`${n.mvL} ${n.se}`, eng:[["R",6,201,"G",1991,1991]] },
    { f:"GD54", body:"PV", d:"44", model:y=>`${n.mvL} ${n.le}`, eng:[["R",6,201,"G",1991,1991]] },
    { f:"GH24", body:"PV", d:"42", model:y=>n.mvL, eng:[["3",6,181,"G",1994,1995]] },
    { f:"GH44", body:"PV", d:"42", model:y=>`${n.mvL} ${n.se}`,
      eng:[["3",6,181,"G",1992,1995],["R",6,201,"G",1992,1995]] },
    { f:"GH45", body:"PV", d:"42", model:y=>`${n.mvS} ${n.se}`, eng:[["R",6,201,"G",1992,1992]] },
    { f:"GH54", body:"PV", d:"42", model:y=>y>=1993?`${n.mvL} ${n.le} ES`:`${n.mvL} ${n.le}`,
      eng:[["3",6,181,"G",1992,1992],["L",6,230,"G",1994,1995],["R",6,201,"G",1992,1995]] },
    { f:"GH55", body:"PV", d:"42", model:y=>`${n.mvS} ${n.le}`, eng:[["R",6,201,"G",1992,1992]] },
    { f:"GK40", body:"PV", d:"42", model:y=>`${n.mvL} ${n.se}`, eng:[["3",6,181,"G",1988,1988]] },
    { f:"GK44", body:"PV", d:"42", drv:y=>y>=1992?"44":"42", model:y=>`${n.mvL} ${n.se}`,
      eng:[["3",6,181,"G",1989,1989],["R",6,201,"G",1990,1995]] },
    { f:"GK54", body:"PV", d:"42", drv:y=>y>=1992?"44":"42",
      model:y=>y>=1995?`${n.mvL} ${n.le} ES`:`${n.mvL} ${n.le}`,
      eng:[["L",6,230,"G",1994,1995],["R",6,201,"G",1990,1995]] },
    { f:"GP15", body:"PV", d:"42", model:y=>`${n.mvS} EC`, eng:[["B",4,148,"G",2002,2002]] },
    { f:"GP24", body:"PV", d:"42", model:y=>`${n.mvL} ${n.se}`, eng:[["3",6,201,"F",2001,2002]] },
    { f:"GP25", body:"PV", d:"42", model:y=>`${n.mvS} ${n.se}`,
      eng:[["3",6,201,"F",2001,2002],["B",4,148,"G",2001,2002],["G",6,201,"G",2001,2001],["R",6,201,"G",2001,2002]] },
    { f:"GP34", body:"PV", d:"42", model:y=>`${n.mvL} EL`, eng:[["3",6,201,"F",2002,2002]] },
    { f:"GP44", body:"PV", d:"42", model:spoRule,
      eng:[["3",6,181,"G",1996,1997],["B",4,148,"G",1996,1997],["G",6,201,"F",1998,2000],
           ["L",6,230,"G",1998,2000],["R",6,201,"G",1996,2002]] },
    { f:"GP45", body:"PV", d:"42",
      model:y=>y>=2001?`${n.mvS} ${n.sport}`:`${n.mvS} ${n.se} SPORT`,
      eng:[["3",6,201,"F",2001,2002],["B",4,148,"G",1997,1997],["G",6,201,"F",1998,2000],
           ["L",6,230,"G",1998,2000],["R",6,201,"G",1996,2002]] },
    { f:"GP54", body:"PV", d:"42",
      model:y=>y>=2001?`${n.mvL} ${n.es}`:y<=1998?`${n.mvL} ${n.le} ES`:`${n.mvL} ${n.le}`,
      eng:[["3",6,201,"F",2001,2001],["G",6,201,"F",1998,2000],["L",6,230,"G",1996,2002],["R",6,201,"G",1996,2000]] },
    { f:"GP55", body:"PV", d:"42", model:y=>y<=1997?`${n.mvS} ${n.le} ES`:`${n.mvS} ${n.le}`,
      eng:[["G",6,201,"F",1998,1999],["L",6,230,"G",1996,1999],["R",6,201,"G",1996,1999]] },
    { f:"GP74", body:"PV", d:"42", model:y=>`${n.mvL} ${n.es}`, eng:[["L",6,230,"G",1999,2000]] },
    { f:"GT44", body:"PV", d:"44", model:y=>y>=2000?`${n.mvL} ${n.sport}`:`${n.mvL} ${n.se}`,
      eng:[["L",6,230,"G",1997,2000]] },
    { f:"GT54", body:"PV", d:"44", model:y=>y<=1998?`${n.mvL} ${n.le} ES`:`${n.mvL} ${n.le}`,
      eng:[["L",6,230,"G",1997,2000]] },
    { f:"GT74", body:"PV", d:"44", model:y=>`${n.mvL} ${n.es}`, eng:[["L",6,230,"G",1999,2000]] },
    { f:"GW12", body:"UT", d:"44", model:y=>n.ut4,
      eng:[["1",8,360,"G",1985,1985],["P",8,318,"G",1981,1982],["R",8,318,"G",1981,1982],
           ["S",8,360,"G",1982,1982],["T",8,360,"G",1981,1983],["U",8,318,"G",1983,1983],
           ["V",8,360,"G",1983,1983],["W",8,360,"G",1983,1985]] },
    { f:"HB11", body:"PV", d:"42", model:y=>n.wagS,
      eng:[["H",6,225,"G",1983,1984],["T",8,318,"G",1983,1984]] },
    { f:"HB21", body:"PV", d:"42", model:y=>n.wagL,
      eng:[["E",6,225,"G",1982,1982],["H",6,225,"G",1984,1984],["P",8,318,"G",1982,1982],
           ["R",8,318,"G",1982,1982],["T",8,318,"G",1983,1984],["U",8,318,"G",1983,1983]] },
    { f:"HB23", body:"CG", d:"42", model:y=>n.vanL,
      eng:[["E",6,225,"G",1982,1982],["P",8,318,"G",1982,1982],["T",8,318,"G",1983,1985]] },
    { f:"HR28", body:"UT", d:"42", model:y=>n.utLate,
      eng:[["N",8,287,"G",2001,2001],["X",6,239,"G",1999,1999],["Y",8,318,"G",1999,2000],["Z",8,360,"G",1999,2001]] },
  ];

  // seed-shuffled family subset: take shuffled families until the year-window
  // row projection covers the target row count (varies which VIN families and
  // how many "sections" of the spool appear per seed)
  for (let i = FAMS.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [FAMS[i], FAMS[j]] = [FAMS[j], FAMS[i]];
  }
  const rowsIn = fam => fam.eng.reduce((s, e) => {
    const a = Math.max(e[4], w0), b = Math.min(e[5], w1);
    return s + (b >= a ? b - a + 1 : 0);
  }, 0);
  const sel = [];
  let projected = 0;
  for (const fam of FAMS) {
    const k = rowsIn(fam);
    if (!k) continue;
    sel.push(fam); projected += k;
    if (projected >= nData) break;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const eraBase = y => y <= 1985 ? [1,1,1,1,4] : y <= 1991 ? [1,2,2,3,7]
    : y <= 1995 ? [5,6,3,4,12] : [6,8,3,6,11];
  const p2 = v => String(v).padStart(2, "0");

  const rows = [];
  for (const fam of sel) {
    const code = fam.f[0] + fam.f[1] + P[+fam.f[2]] + P[+fam.f[3]];
    for (const [ch, cyl, cid, fuel, e0, e1] of fam.eng) {
      const y0 = Math.max(e0, w0), y1 = Math.min(e1, w1);
      if (y1 < y0) continue;
      // per-variant symbol base with per-row jitter (near-constant runs)
      const base = eraBase(Math.floor((y0 + y1) / 2)).map(m => clamp(m + Math.floor(rng() * 3) - 1, 1, 17));
      for (let y = y0; y <= y1; y++) {
        const vin = n.wmi + code + ch + "0" + YR[y];
        const drive = fam.drv ? fam.drv(y) : fam.d;
        const vti = fam.body === "UT" ? (drive === "44" ? "Y" : "U") : "V";
        let body = fam.body;
        if (rng() < pGlitch) body = drive === "44" ? "2W" : "SV"; // stray body-code glitch
        let carb = fuel === "F" ? "F" : (y <= 1986 ? "C" : "F");
        if (fuel !== "F" && rng() < (y <= 1986 ? pCarbEarly : pCarbLate)) carb = ""; // blank-CARB shift
        const lux = fuel === "F" ? "L" : "P";
        const syms = base.map((b, i) => {
          const hi = i === 4 ? 17 : 13;
          return p2(rng() < pSymJit ? clamp(b + Math.floor(rng() * 3) - 1, 1, hi) : b);
        });
        rows.push([vin, String(y), n.make, fam.model(y).slice(0, 20), body, drive,
          String(cyl), String(cid), fuel, carb, lux, vti, ...syms, sentinel]);
      }
    }
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1)); // plain ASCII sort: digits before letters
  rows.length = Math.min(rows.length, nData);

  const HEAD = [["", vendor], hYear, hMake, hModel, hBody, hDrive, hCyl, hCid,
    ["","FUEL"], ["","CARB"], hLux, ["","VTI"],
    ["BI",symW], ["PD",symW], ["COMP",symW], ["COLL",symW], ["PIP",symW], ["",hLast]];
  const LEFT = new Set([0, 2, 3]);
  const headHtml = HEAD.map(([t, b]) =>
    `<th>${t ? t + "<br>" : ""}${b}</th>`).join("");
  const bodyHtml = rows.map(r =>
    "<tr>" + r.map((c, i) => `<td${LEFT.has(i) ? ' class="l"' : ""}>${c}</td>`).join("") + "</tr>"
  ).join("\n");

  // page height follows content: header + rows + seeded trailing spool feed
  const pageH = Math.ceil(1.5 + 2 * hl + 1.6 + rows.length * lh + tail + 4);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 216mm ${pageH}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { width: 216mm; background: #fff; color: #000;
         font-family: Arial, Helvetica, sans-serif; }
  table { border-collapse: collapse; margin: 1.5mm auto 0 auto; }
  th, td { font-size: ${fs}pt; white-space: nowrap; padding: 0 1.5pt; }
  td { line-height: ${lh}mm; text-align: center; }
  th { font-weight: bold; font-style: italic; vertical-align: bottom;
       text-align: center; line-height: ${hl}mm; padding-bottom: 0.4mm;
       border-bottom: 2.2pt solid #000; }
  .l { text-align: left; }
  </style></head><body>
  <table>
  <tr>${headHtml}</tr>
  ${bodyHtml}
  </table>
  </body></html>`;

  const GTH = HEAD.map(([t, b]) => (t ? t + " " : "") + b);
  const gt = "<table>\n<tr>" + GTH.map(h => `<th>${h}</th>`).join("") + "</tr>\n"
    + rows.map(r => "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>").join("\n")
    + "\n</table>";

  // preferCSSPageSize: the render harness pre-sets format:"A4", which puppeteer
  // would otherwise let win over width/height and shrink the tall page to A4.
  return { html, gt, pageOpts: { width: "216mm", height: `${pageH}mm`, preferCSSPageSize: true } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
