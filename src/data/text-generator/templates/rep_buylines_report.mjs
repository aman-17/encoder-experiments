// FAMILY generator (training data) modeled on the landscape TV-rep "REP BUYLINES"
// ad-order report look (source: 0.461_..._page1): rep-firm logo, rounded metadata
// box with 3 kv column-groups + italic serif title, one wide 15-col borderless
// buyline table (~6pt condensed) with yellow Day/Time chips + pale-yellow left
// band, green Total-Dollars column, full-width green totals band, detached monthly
// estimate fragment; bottom of page mostly empty.
// Seed-varied structure: buyline count (5-10), comment-row mix, out-of-order line
// display quirk, $0 mirrored make-good lines quirk, header-label synonyms, title
// wording, flag row, font scale +/-10%. All names/stations/agencies/programs are
// fictional pools (decontaminated). GT: 15 logical cols, 2 full-span merged rows;
// ~200-520 cells across seeds.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pad = (n, w) => String(n).padStart(w, "0");
  const chance = (p) => rng() < p;

  // ---------- structural knobs (seed-driven) ----------
  const fs = 0.9 + rng() * 0.2;                 // font scale +/-10%
  const pt = (v) => `${(v * fs).toFixed(2)}pt`;
  const wfs = Math.min(fs, 1.02);               // column-width scale, capped to page
  const nLines = int(5, 10);                    // buyline rows (base 7, +/-~40%)
  const quirkMG = chance(0.7);                  // $0 make-good lines + mirrored program
  const quirkShuffle = chance(0.65);            // out-of-order line-number display
  const titleTxt = pick(["REP BUYLINES", "REP BUYLINES REPORT", "STATION BUYLINES",
    "BUYLINE DETAIL", "REP ORDER BUYLINES", "AGENCY BUYLINES"]);
  const flagRow = pick(["##CASH ##CONF", "##CASH ##EDI", "##CASH", "##TRADE ##EDI",
    "##CASH ##WEB", "##CASH ##ORD"]);
  const estLabel = pick(["Monthly Estimate Dollars:", "Monthly Est. Dollars:",
    "Estimate Dollars by Month:"]);
  // header-label synonym picks (segments; display joins with <br>, GT with space)
  const hWks = pick([["#", "of", "Wks"], ["No.", "of", "Wks"]]);
  const hSpt = pick([["Spt/", "Week"], ["Spots/", "Week"]]);
  const hDol = pick([["Total", "Dollars"], ["Gross", "Dollars"]]);
  const hProg = pick([["Program Name"], ["Program"]]);
  const hAct = pick([["Last", "Activity"], ["Last", "Action"]]);

  // ---------- metadata (fictional pools only) ----------
  const mon = pick(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Sep", "Oct", "Nov"]);
  const yy = int(21, 27);
  const ws = int(8, 18);            // flight week start day
  const we = ws + 6;                // flight week end day
  const runDay = we - int(1, 3);
  const D = (d) => `${mon}${d}/${yy}`;
  const monYY = `${mon}/${yy}`;

  const repFirm = pick(["MERIDREPS", "CRESTREPS", "VANTAREPS", "ZENITREPS",
    "HARBOREPS", "ALDERREPS", "BLUEQREPS"]);
  const candFirst = pick(["MICHAEL", "ROBERT", "ELIZABETH", "THOMAS", "PATRICIA",
    "DANIEL", "MARGARET", "GREGORY"]);
  const candLast = pick(["WHITMORE", "CALDWELL", "BRENNAN", "HASTINGS", "MARLOWE",
    "DONNELLY", "ASHWORTH", "PEMBROOK"]);
  const party = pick(["D", "R", "I"]);
  const campaign = `${candFirst} ${candLast} FOR PRESIDENT`;
  const advertiser = `POLI/${candFirst[0]} ${candLast}/${party}/PRE/US`;
  const buyer = `${pick(["HEATHER", "ALLISON", "MEGAN", "RACHEL", "COURTNEY", "DIANA"])} ${pick(["GOLDSMITH", "PARRISH", "LINDQUIST", "MCALLISTER", "SHERWOOD", "FAIRBANK"])}`;
  const sales = `${pick(["IAN", "CARL", "DREW", "NEIL", "ROSS", "GLEN"])} ${pick(["AMBRON", "TELFORD", "MARCHETTI", "OAKES", "BRANDT", "KELSO"])}`;
  // invented (unassigned-style) call letters + generic mid-size markets
  const station = `${pick(["WQZV-TV", "KXVQ-TV", "WVYK-TV", "KQPX-TV", "WZLQ-TV", "KVXD-TV", "WYQR-TV", "KZPV-TV"])} ${pick(["GREENVILLE", "SPOKANE", "LUBBOCK", "CHATTANOOGA", "SIOUX FALLS", "MACON", "FRESNO", "TOLEDO"])}`;
  const agency = pick(["SILVERGATE MEDIA", "NORTHWIND STRATEGIES", "CALLOWAY & FINCH",
    "REDOAK MEDIA WORKS", "BLUE HARBOR GROUP", "STRATFORD & VALE", "KESTREL MEDIA LAB"]);
  const repIni = pick(["HRP", "KGM", "TCB", "MRD", "JLS", "VPO"]);
  const reqBy = pick(["KC", "DL", "JM", "TR", "BW", "SN"]);
  const demo = pick(["RA35+", "RA25-54", "RA18-49", "RW35+", "RM25-54"]);
  const orderNo = int(40000, 98000);
  const hdlnNo = int(9100000, 9899999);
  const trafficNo = int(410000, 989000);
  const estNo = pad(int(90, 600), 4);
  const modV = `0.${int(1, 3)}`;
  const tel = `${pick(["917", "904", "212", "615", "305", "402"])}-${int(200, 899)}-${int(1000, 9999)} (ext 000000)`;
  const runTime = `${int(8, 18)}:${pad(int(0, 59), 2)}`;
  const prod2 = chance(0.4) ? `${candLast} WKND` : "";

  // ---------- buyline records ----------
  // display order quirk: first two lines, then the tail block, then the middle
  const lineOrder = (() => {
    const seq = Array.from({ length: nLines }, (_, i) => i + 1);
    if (!quirkShuffle) return seq;
    const b = int(3, nLines - 1);
    return [...seq.slice(0, 2), ...seq.slice(b - 1), ...seq.slice(2, b - 1)];
  })();

  // fictional vintage-syndication program pool (+ generic rotators)
  const progPool = ["THE MARSHAL OF DRY CREEK", "HARBOR PATROL", "JUDGE CALLOWAY",
    "COPPER CANYON", "MIDNIGHT FREIGHT", "DELIA'S DINER", "THE SILVER SADDLE",
    "INSPECTOR VANCE", "PRAIRIE JUSTICE", "THE CROW'S NEST", "ROCKET ROUNDUP",
    "GRANITE FALLS", "OVERNIGHT", "DAYTIME ROTATOR"];
  const dayParts = ["M-F", "M-Su", "Sa-Su", "Sun", "Sat", "Tu-F", "W-F", "Th-F"];
  const times = ["3-4P", "2-3P", "9-10A", "2-259A", "4-5P", "6-7P", "11-1130P",
    "6-630A", "1-2P", "10-11A"];
  const dts = [];
  while (dts.length < nLines) { const c = `${pick(dayParts)}/${pick(times)}`; if (!dts.includes(c)) dts.push(c); }

  // $0 make-good lines: which display positions carry zero spots
  const nZero = quirkMG ? int(1, Math.max(2, Math.round(nLines * 0.4))) : (chance(0.3) ? 1 : 0);
  const zeroIdx = new Set();
  while (zeroIdx.size < nZero) zeroIdx.add(int(1, nLines - 1));

  // distinct programs per line; one zero line may mirror an earlier line's program
  const progs = [];
  { const p = progPool.slice(); for (let i = 0; i < nLines; i++) progs.push(p.splice(Math.floor(rng() * p.length), 1)[0]); }
  if (quirkMG && nZero > 0) {
    const z = [...zeroIdx][0];
    const donor = [...Array(nLines).keys()].find((i) => !zeroIdx.has(i) && i < z);
    if (donor !== undefined) progs[z] = progs[donor];   // mirrored $0 row quirk
  }

  const recs = lineOrder.map((line, i) => {
    const rate = pick([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    const spt = zeroIdx.has(i) ? 0 : int(1, 4);
    const zero = spt === 0;
    const sd = zero ? ws + int(0, 2) : ws + int(1, 5);
    return {
      line, dt: dts[i], len: "30S", rate, spt,
      sd: D(sd), ed: zero ? D(sd) : D(we),
      spots: spt, dollars: rate * spt, prog: progs[i],
      act: D(runDay), mr: zero ? `Mod #${modV}: S` : `Mod #${modV}: A`,
    };
  });

  // comment rows (headerless blocks under buylines)
  const zeroLineNums = [...zeroIdx].map((i) => lineOrder[i]);
  const mgLo = Math.min(...zeroLineNums), mgHi = Math.max(...zeroLineNums);
  const mgTxt = nZero > 1
    ? `Part of a makegood made up of lines ${mgLo}-${mgHi}`
    : `Part of a makegood made up of line ${mgLo}`;
  const mgDay = `${mon}${ws + 1}`;
  let mgNotePlaced = false;
  const comments = recs.map((r) => {
    if (r.spt === 0) return chance(0.75) ? [mgTxt, "Order Comment: MG"] : [];
    const roll = rng();
    if (quirkMG && !mgNotePlaced && roll < 0.35) {
      mgNotePlaced = true;
      const l1 = int(1, nLines - 1);
      return [`This is a make-good for ${mgDay} on line-${l1} for 1 spot/wk`,
        `This is a make-good for ${mgDay} on line-${l1 + 1} for 1 spot/wk`,
        "Order Comment: MG"];
    }
    if (roll < 0.75) return [`Contract Comment: ${r.prog}`];
    return [];
  });
  // keep the family's headerless comment-block quirk alive on every page
  if (comments.every((c) => c.length === 0)) {
    const i = recs.findIndex((r) => r.spt > 0);
    comments[i] = [`Contract Comment: ${recs[i].prog}`];
  }
  const totSpots = recs.reduce((s, r) => s + r.spots, 0);
  const totDollars = recs.reduce((s, r) => s + r.dollars, 0);

  // ---------- HTML ----------
  const kv = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const th = (t, cls) => `<th class="${cls || ""}">${t}</th>`;
  const br = (seg) => seg.join("<br>");
  const headRow = "<tr>"
    + th("Mod<br>Code") + th("Buy<br>Line", "r") + th("Day/Time") + th("Length")
    + th("Rate", "r") + th("Starting<br>Date") + th("Ending<br>Date")
    + th(br(hWks), "c") + th(br(hSpt), "c") + th("Total<br>Spots", "c")
    + th(br(hDol), "r") + th(br(hProg)) + th(`Rep:<br>${demo}`, "r")
    + th(br(hAct)) + th("Last Mod/Rev") + "</tr>";

  const e8 = "<td></td>".repeat(8);
  const grpRow = (t) => `<tr class="g"><td class="yb"></td><td colspan="14" class="grp">${t}</td></tr>`;
  const recRow = (r) => `<tr class="rec"><td class="yb"></td><td class="yb r">${r.line}</td>`
    + `<td class="dt">${r.dt}</td><td>${r.len}</td><td class="r">$${r.rate}</td>`
    + `<td>${r.sd}</td><td>${r.ed}</td><td class="c">1</td><td class="c">${r.spt}</td>`
    + `<td class="c">${r.spots}</td><td class="gr r">$${r.dollars}</td><td>${r.prog}</td>`
    + `<td class="r">0.0</td><td>${r.act}</td><td>${r.mr}</td></tr>`;
  const cmtRow = (t) => `<tr class="cmt"><td class="yb"></td><td class="yb"></td>`
    + `<td colspan="5" class="cm">${t}</td>${e8}</tr>`;

  let bodyRows = grpRow(flagRow) + "\n" + grpRow(campaign) + "\n";
  recs.forEach((r, i) => {
    bodyRows += recRow(r) + "\n";
    for (const c of comments[i]) bodyRows += cmtRow(c) + "\n";
  });
  bodyRows += `<tr class="sp"><td class="yb"></td><td class="yb"></td><td colspan="13"></td></tr>\n`;
  bodyRows += `<tr class="tot"><td></td><td></td><td class="b">Total ${totSpots} Spots for:</td>`
    + `<td></td><td class="r b">$${totDollars}</td><td></td><td></td><td></td><td></td>`
    + `<td class="c b">${totSpots}</td><td class="r b">$${totDollars}</td><td></td>`
    + `<td class="r b">0.0</td><td></td><td></td></tr>\n`;
  bodyRows += `<tr class="sp2"><td class="yb"></td><td class="yb"></td><td colspan="13"></td></tr>\n`;
  bodyRows += `<tr class="lbl"><td class="yb"></td><td class="yb"></td><td class="dt b">${estLabel}</td><td colspan="12"></td></tr>\n`;
  bodyRows += `<tr class="sp2"><td colspan="15"></td></tr>\n`;
  bodyRows += `<tr class="est"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`
    + `<td class="gr r">$${totDollars}</td><td class="gr">${monYY}</td><td class="gr r">0.0</td><td class="gr">${monYY}</td><td></td></tr>\n`;

  const colmm = [10, 9, 33, 17, 16, 15, 16, 12, 13, 13, 18, 50, 10, 15, 31]
    .map((w) => +(w * wfs).toFixed(2));
  const cols = colmm.map((w) => `<col style="width:${w}mm">`).join("");
  const tableW = Math.min(284 * wfs, 284).toFixed(1);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 297mm; height: 209mm; color: #000;
         font-family: "Arial Narrow", Arial, Helvetica, sans-serif; }
  .wrap { padding: 6mm 6.5mm 0; }
  .top { display: flex; align-items: flex-start; }
  .logo { width: 41mm; padding-top: 2.5mm; display: flex; align-items: center; }
  .cube { width: 8mm; height: 8mm; background: #1b74bc; border-radius: 1mm; position: relative; flex: none; }
  .cube:before { content: ""; position: absolute; left: 1.8mm; top: 1.8mm; width: 4.4mm; height: 4.4mm;
                 background: #fff; transform: rotate(45deg); }
  .cube:after { content: ""; position: absolute; left: 3.1mm; top: 3.1mm; width: 1.8mm; height: 1.8mm;
                background: #7ec6e8; transform: rotate(45deg); }
  .wordmark { font-weight: 900; font-size: ${pt(14)}; color: #1b74bc; letter-spacing: 0.15mm; margin-left: 2mm;
              font-family: Arial, Helvetica, sans-serif; }
  .mbox { flex: 1; border: 0.35mm solid #000; border-radius: 2.5mm; padding: 1.6mm 3mm 2mm; }
  .mrow1 { display: grid; grid-template-columns: 1fr 1.6fr 1fr; align-items: start; }
  .title { text-align: center; font-family: "Times New Roman", Times, serif; font-weight: bold;
           font-style: italic; font-size: ${pt(12.5)}; letter-spacing: 0.3mm; }
  .kv { font-size: ${pt(6.4)}; line-height: 1.4; }
  .kv .row { display: flex; }
  .kv .k { font-family: "Times New Roman", Times, serif; font-style: italic; white-space: pre; }
  .kv .v { margin-left: 1mm; white-space: pre; }
  .kv.rt .row { justify-content: flex-end; }
  .mgrid { display: grid; grid-template-columns: 40% 33% 27%; margin-top: 1.2mm; }
  .mgrid .k { display: inline-block; text-align: right; }
  .g1 .k { width: 17mm; } .g1 { padding-left: 2mm; }
  .g2 .k { width: 10mm; }
  .g3 .k { width: 20mm; }
  .rule { border-top: 0.55mm solid #000; margin-top: 1.8mm; }
  table.main { table-layout: fixed; border-collapse: collapse; width: ${tableW}mm; margin-top: 1.2mm; }
  .main td, .main th { font-size: ${pt(6)}; padding: 0.2mm 0.8mm; vertical-align: bottom;
                       white-space: nowrap; overflow: visible; text-align: left; }
  .main th { font-size: ${pt(5.9)}; font-weight: bold; line-height: 1.08;
             border-bottom: 0.2mm solid #000; padding-bottom: 0.7mm; }
  .main .r { text-align: right; } .main .c { text-align: center; } .main .b { font-weight: bold; }
  .yb { background: #fbf8d2; }
  td.dt { background: #fbf5b4; }
  td.gr { background: #cde7cb; }
  tr.rec td { padding-top: 0.9mm; }
  tr.g td.grp { background: linear-gradient(to right, #fbf8d2 0, #fbf8d2 9mm, transparent 9mm); }
  tr.cmt td.cm { padding-left: 1mm; }
  tr.sp td { height: 3.4mm; }
  tr.sp2 td { height: 2mm; }
  tr.tot td { background: #cde7cb; border-top: 0.2mm solid #000; padding-top: 0.7mm; padding-bottom: 0.7mm; }
  tr.est td { padding-top: 0.4mm; padding-bottom: 0.4mm; }
  </style></head><body><div class="wrap">
  <div class="top">
    <div class="logo"><div class="cube"></div><div class="wordmark">${repFirm}</div></div>
    <div class="mbox">
      <div class="mrow1">
        <div class="kv">${kv("Rep:", repIni)}${kv("Run On:", `${D(runDay)} at ${runTime}`)}</div>
        <div class="title">${titleTxt}</div>
        <div class="kv rt">${kv("Page:", "1")}${kv("Requested by:", reqBy)}</div>
      </div>
      <div class="mgrid kv">
        <div class="g1">${kv0("Order#:", `${orderNo} (Rev 0)`, 17)}${kv0("Station:", station, 17)}${kv0("Agency:", agency, 17)}${kv0("Advertiser:", advertiser, 17)}${kv0("Buyer:", buyer, 17)}</div>
        <div class="g2">${kv0("Hdln#:", `${hdlnNo} (Mod ${modV})`, 10)}${kv0("Dates:", `${D(ws)} - ${D(we)}`, 10)}${kv0("Prod1:", `${candLast} 4 PRES`, 10)}${kv0("Prod2:", prod2, 10)}${kv0("Tel #:", tel, 10)}</div>
        <div class="g3">${kv0("Traffic#:", String(trafficNo), 20)}${kv0("Salesperson:", sales, 20)}${kv0("Est#:", estNo, 20)}${kv0("Demo:", demo, 20)}</div>
      </div>
    </div>
  </div>
  <div class="rule"></div>
  <table class="main">${cols}
  ${headRow}
  ${bodyRows}</table>
  </div></body></html>`;

  // ---------- GT (logical: 15 cols, 2 full-span merged rows) ----------
  const sp = (seg) => seg.join(" ");
  const gtRows = [];
  const H = ["Mod Code", "Buy Line", "Day/Time", "Length", "Rate", "Starting Date",
    "Ending Date", sp(hWks), sp(hSpt), "Total Spots", sp(hDol),
    sp(hProg), `Rep: ${demo}`, sp(hAct), "Last Mod/Rev"];
  gtRows.push("  <tr>\n" + H.map((h) => `    <th>${h}</th>`).join("\n") + "\n  </tr>");
  const span = (t) => `  <tr>\n    <td colspan="15">${t}</td>\n  </tr>`;
  const row15 = (cells) => "  <tr>\n" + cells.map((c) => `    <td>${c}</td>`).join("\n") + "\n  </tr>";
  gtRows.push(span(flagRow));
  gtRows.push(span(campaign));
  recs.forEach((r, i) => {
    gtRows.push(row15(["", String(r.line), r.dt, r.len, `$${r.rate}`, r.sd, r.ed, "1",
      String(r.spt), String(r.spots), `$${r.dollars}`, r.prog, "0.0", r.act, r.mr]));
    for (const c of comments[i])
      gtRows.push(row15(["", "", c, "", "", "", "", "", "", "", "", "", "", "", ""]));
  });
  gtRows.push(row15(["", "", `Total ${totSpots} Spots for:`, "", `$${totDollars}`, "", "", "",
    "", String(totSpots), `$${totDollars}`, "", "0.0", "", ""]));
  gtRows.push(row15(["", "", estLabel, "", "", "", "", "", "", "",
    `$${totDollars}`, monYY, "0.0", monYY, ""]));
  const gt = "<table>\n" + gtRows.join("\n") + "\n</table>";

  return { html, gt, pageOpts: { format: "A4", landscape: true } };

  // right-aligned-label kv row for the metadata grid
  function kv0(k, v, w) {
    return `<div class="row"><span class="k" style="width:${w}mm">${k}</span><span class="v">${v}</span></div>`;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
