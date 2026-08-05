// FAMILY generator (training data) — ARM-style agronomy herbicide-trial efficacy page.
// Visual identity (kept, seed-jittered, never dropped): yellow italic title bar,
// stacked header tiers (Pest Name / Rating Date / optional extra ARM tiers) above a
// column row whose result side carries a PERCENT CONTROL spanner; multi-row treatment
// blocks (product + tank-mix partners) separated by full-width yellow spray-timing
// divider rows; yellow LSD row; small-print footnotes; vertical rules only between
// rating-date groups and at the stub/results boundary; horizontal rules only at block
// starts. Adversarial quirks are the POINT and are seed-toggled, not removed:
//   * result cells printed ONLY on the block-first row (~80-85% of the result area blank)
//   * each result column is number + significance-letter sub-columns with a wide gap
//   * Rate splits into value + unit sub-columns
//   * identical-value saturation (whole rating columns of 0 before spraying / 100 late,
//     LSD "0.0", repeated tier values across every date column)
//   * blank spacer rows between sections (layout only, NOT GT rows)
//   * headerless (blank-Trt) continuation blocks
//   * optional ARM "Application Description" panel = a SECOND logical table
// DECONTAMINATED: every trade name, station name and year in the modeled eval page is
// replaced by invented pools (fictional herbicide/adjuvant brands, invented research
// sites, years shifted to 2029-2036). Only generic agronomy/regulatory phrasing is kept
// ("Rating Date", "LSD P=.10", "% v/v", "fl oz/a", weed common names).
// GT = ONE logical table of 4 + nDates cols (Trt + 6 result cells rowspan each block,
// dividers/tiers colspan) + optionally a second small table for the application panel.
export function generate(seed) {
  const rng = mulberry32(seed);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const rf = (lo, hi) => lo + rng() * (hi - lo);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const chance = (p) => rng() < p;

  // ---------- fictional pools (decontamination) ----------
  const PRODUCTS = [
    ["PROVANEX SL", "48", "fl oz/a"], ["KESTREL MAX", "16", "fl oz/a"],
    ["TERRAGARD 4L", "2.5", "pt/a"], ["VELORAN DF", "5.3", "oz wt/a"],
    ["AXIMOR SC", "3.25", "fl oz/a"], ["NOVARIS PRO", "22", "fl oz/a"],
    ["STRATOVANE 3", "30", "fl oz/a"], ["CLARIDIUM EC", "12.5", "fl oz/a"],
    ["THRESHOLD XT", "1.33", "pt/a"], ["ORVANTIS 75DF", "6.45", "oz wt/a"],
    ["MERIDANE SL", "24", "fl oz/a"], ["PYRALTON FL", "1", "fl oz/a"],
    ["FALCROSS DG", "2.5", "oz wt/a"], ["VANTREL II", "8", "fl oz/a"],
    ["SOLIXAN 2.5", "56.5", "fl oz/a"], ["EMBERLINE SC", "12.8", "fl oz/a"],
    ["QUANTRIX WG", "4.2", "oz wt/a"], ["HALVORA MAX", "3", "pt/a"],
    ["TRAILMARK 4F", "1.5", "pt/a"], ["ZEPHRANE ULTRA", "20", "fl oz/a"],
    ["CORVIDEX WDG", "2.75", "oz wt/a"], ["LUMISTAR 2SC", "10.5", "fl oz/a"],
  ];
  const ADJUVANTS = [
    ["NIS 90-10", "0.25", "% v/v"], ["CROP OIL CONC", "1.0", "% v/v"],
    ["MSO ADJUVANT", "1.5", "% v/v"], ["AMS LIQUID", "2.5", "% v/v"],
    ["DRA AGENT", "0.5", "% v/v"], ["SURFAMAX NG", "2.5", "% v/v"],
    ["DRIFTLOK", "4", "fl oz/a"], ["ACTIVAID PLUS", "1.0", "% v/v"],
    ["CANOPY OIL 100", "1.25", "% v/v"], ["NITRO-SULF AMS", "17", "lb/100gal"],
  ];
  const SITES = [
    ["Halloway", "MN"], ["Braxton Flats", "IA"], ["Cedar Junction", "SD"],
    ["Merrick Bend", "WI"], ["Ellsberry", "ND"], ["Tolliver", "IL"],
    ["Kanawa Grove", "NE"], ["Pinewick", "IN"], ["Ardmoor", "OH"],
    ["Saltlick Ridge", "KS"],
  ];
  const PESTS = [
    ["volunteer corn", "VOLUNTEER CORN"], ["waterhemp", "COMMON WATERHEMP"],
    ["giant ragweed", "GIANT RAGWEED"], ["kochia", "KOCHIA"],
    ["Palmer amaranth", "PALMER AMARANTH"], ["marestail", "HORSEWEED (MARESTAIL)"],
    ["volunteer cereal rye", "VOLUNTEER CEREAL RYE"], ["green foxtail", "GREEN FOXTAIL"],
    ["common lambsquarters", "COMMON LAMBSQUARTERS"], ["velvetleaf", "VELVETLEAF"],
  ];
  const CROPS = ["soybean", "soybean", "corn", "spring wheat", "dry bean", "sunflower", "field pea"];
  const TILL = ["no-till", "conventional-till", "strip-till", "reduced-till", "vertical-till"];
  const TRIAL_PREFIX = ["HRB", "WCT", "AGX", "TRV", "FLD", "NPS", "CRP"];

  // ---------- document identity ----------
  const year = ri(2029, 2036);
  const yy = String(year).slice(2);
  const [site, st] = pick(SITES);
  const [pestLower, pestName] = pick(PESTS);
  const crop = pick(CROPS);
  const till = pick(TILL);
  const tblNo = ri(1, 14);
  const trialId = `${pick(TRIAL_PREFIX)}-${yy}-${String(ri(100, 9899)).padStart(4, "0")}`;

  // ---------- page / type scale (font jitter +-10%) ----------
  const fs = +(6.6 * rf(0.9, 1.1)).toFixed(2);
  const scale = fs / 6.6;
  const padX = +rf(11, 14).toFixed(1);
  const padTop = +rf(12.5, 17).toFixed(1);
  const tableW = +(215.9 - 2 * padX).toFixed(1);
  const rowMM = (fs * 1.12 + 2.0) * 0.3528;

  // ---------- structural knobs ----------
  let nDates = ri(5, 10);
  const nSections = ri(3, 5);
  const longDates = nDates <= 6 && chance(0.7);
  const spacerQuirk = chance(0.45);
  const indentPartners = chance(0.6);
  const headerlessBlock = chance(0.35);
  const wantCaption = chance(0.5);

  // ---------- column labels (synonym pools; picked before widths so they fit) ----------
  const trtLabel = pick(["Trt", "Trt", "Trt No.", "No.", "Trt#"]);
  const treatLabel = pick(["Treatment", "Treatment", "Treatment Name", "Product Name", "Treatment Product"]);
  const rateLabel = pick(["Rate", "Rate", "Rate Amt", "Product Rate", "Rate/Unit"]);
  const applLabel = pick(["Appl", "Appl", "Appl Code", "App Code", "Timing"]);
  const spanner = pick([
    "PERCENT CONTROL (%)", "PERCENT CONTROL (%)", "PERCENT WEED CONTROL (%)",
    "PERCENT VISUAL CONTROL (%)", "CONTROL (PERCENT)", "PERCENT CONTROL", "WEED CONTROL (%)",
  ]);
  const pLevel = pick([".10", ".10", ".10", ".05"]);

  // ---------- column widths (fixes nDates before any content is built) ----------
  const textMM = (s) => (s.length * fs * 0.55 + 5) * 0.3528;
  const trtW = +Math.max(rf(5, 7) * scale, textMM(trtLabel)).toFixed(2);
  const rateW = +(rf(7, 9) * scale).toFixed(2);
  const unitW = +Math.max(rf(10, 13) * scale, textMM("lb/100gal")).toFixed(2);
  const applW = +Math.max(rf(6.5, 8.5) * scale, textMM(applLabel)).toFixed(2);
  const dateNeed = (longDates ? 15.4 : 11.6) * scale;
  let treatW = +rf(26, 38).toFixed(2);
  let perDate = (tableW - (trtW + rateW + unitW + applW + treatW)) / nDates;
  while (perDate < dateNeed && treatW > 23) { treatW -= 0.5; perDate = (tableW - (trtW + rateW + unitW + applW + treatW)) / nDates; }
  while (perDate < dateNeed && nDates > 4) { nDates--; perDate = (tableW - (trtW + rateW + unitW + applW + treatW)) / nDates; }
  const numW = +(perDate * 0.57).toFixed(2);
  const letW = +(perDate - numW).toFixed(2);
  const PC = 5 + 2 * nDates;      // physical columns
  const GC = 4 + nDates;          // logical (GT) columns

  // ---------- dates: application timings + rating dates ----------
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const addD = (dt, n) => new Date(dt.getTime() + n * 864e5);
  const fShort = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}/${yy}`;
  const fLong = (dt) => `${MO[dt.getMonth()]}-${dt.getDate()}-${year}`;
  const fDate = (dt) => (longDates ? fLong(dt) : fShort(dt));

  const SCHEMES = [
    ["PRE", "POST I", "POST II", "POST III", "POST IV"],
    ["PRE", "EPOST", "MPOST", "LPOST"],
    ["PPI", "PRE", "EPOST", "LPOST"],
    ["PRE", "V3 POST", "V6 POST", "R1 POST"],
    ["BURNDOWN", "PRE", "POST A", "POST B"],
    ["DELAYED PRE", "EPOST", "MPOST", "LPOST"],
    ["FALL", "SPRING PRE", "POST I", "POST II"],
  ];
  const scheme = pick(SCHEMES);
  const nTim = clamp(ri(3, 5), 2, scheme.length);
  const timings = [];
  {
    let d = new Date(year, 4, ri(6, 26));
    for (let i = 0; i < nTim; i++) {
      timings.push({ name: scheme[i], date: d, code: "ABCDEF"[i] });
      d = addD(d, ri(6, 14));
    }
  }
  const ratingDts = [];
  {
    let d = addD(timings[0].date, ri(5, 12));
    for (let i = 0; i < nDates; i++) { ratingDts.push(d); d = addD(d, ri(5, 10)); }
  }
  const ratingStr = ratingDts.map(fDate);

  // ---------- sections (spray-timing divider rows) ----------
  const combos = [];
  for (let i = 0; i < nTim; i++) {
    for (let j = i + 1; j < nTim; j++) combos.push([i, j]);
  }
  const singles = [];
  for (let i = 0; i < nTim; i++) singles.push([i]);
  const pool = chance(0.75) ? shuffle(combos).concat(shuffle(singles))
                            : shuffle(shuffle(combos).concat(shuffle(singles)));
  const sections = pool.slice(0, nSections)
    .sort((a, b) => (a[0] - b[0]) || ((a[1] ?? -1) - (b[1] ?? -1)))
    .map((ix) => ({
      ix,
      label: ix.map((k) => `${timings[k].name} (${fShort(timings[k].date)})`).join(" / "),
    }));

  // ---------- header tiers ----------
  const pestLabel = pick(["Pest Name", "Pest Common Name", "Weed Name", "Pest Name"]);
  const dateLabel = pick(["Rating Date", "Rating Date", "Eval Date", "Evaluation Date"]);
  const stages = ["V2", "V3", "V4", "V6", "V8", "R1", "R2", "R3"];
  const stageStart = ri(0, 3);
  const extraTierPool = [
    () => ({ label: "Rating Data Type", span: pick(["CONTROL", "PERCENT CONTROL", "WEED CONTROL"]) }),
    () => ({ label: "Rating Unit", span: "PERCENT" }),
    () => ({ label: pick(["Crop Stage Majority", "Crop Growth Stage"]),
             vals: ratingDts.map((_, i) => stages[Math.min(stageStart + i, stages.length - 1)]) }),
    () => ({ label: "Trt-Eval Interval",
             vals: ratingDts.map((d) => `${Math.round((d - timings[0].date) / 864e5)} DA-A`) }),
    () => ({ label: "Days After First Appl",
             vals: ratingDts.map((d) => String(Math.round((d - timings[0].date) / 864e5))) }),
    () => ({ label: "Number of Subsamples", span: String(ri(2, 6)) }),
    () => ({ label: "Rating Type", span: pick(["VISUAL", "VISUAL ESTIMATE"]) }),
  ];
  const tiers = [{ label: pestLabel, span: pestName }, { label: dateLabel, vals: ratingStr }];
  {
    const extras = shuffle(extraTierPool).slice(0, ri(0, 3)).map((f) => f());
    // a spanning tier sometimes prints its value once per date column (saturation quirk)
    for (const t of extras) {
      if (t.span && chance(0.4)) { t.vals = ratingStr.map(() => t.span); delete t.span; }
      tiers.push(t);
    }
    if (chance(0.5) && tiers.length > 2) tiers.splice(1, 0, tiers.pop());
  }

  // ---------- summary rows ----------
  const summaryDefs = [
    { label: pick([`LSD P=${pLevel}`, `LSD P=${pLevel}`, `LSD (P=${pLevel})`]), kind: "lsd", yel: true },
    { label: "Standard Deviation", kind: "sd" },
    { label: "CV", kind: "cv" },
    { label: pick(["Bartlett's X2", "Treatment Prob(F)", "Replicate Prob(F)"]), kind: "prob" },
  ];
  const summaries = summaryDefs.slice(0, ri(1, 4));

  // ---------- application-description panel (second logical table) ----------
  const nApp = Math.min(nTim, 5);
  const PANEL_FIELDS = [
    ["Application Date", (k) => fShort(timings[k].date)],
    ["Time of Day", () => `${ri(7, 11)}:${String(ri(0, 59)).padStart(2, "0")} ${chance(0.8) ? "AM" : "PM"}`],
    ["Application Method", () => pick(["SPRAY", "SPRAY", "BROADCAST SPRAY"])],
    ["Applicator", () => pick(["CO2 BACKPACK", "CO2 BACKPACK", "TRACTOR BOOM", "PLOT SPRAYER"])],
    ["Spray Volume (gpa)", () => String(pick([10, 15, 15, 20, 25]))],
    ["Spray Pressure (psi)", () => String(pick([28, 30, 35, 40]))],
    ["Nozzle Type", () => pick(["FLAT FAN", "FLAT FAN", "AIR INDUCT", "TURBO FLAT"])],
    ["Air Temperature (F)", () => String(ri(58, 88))],
    ["% Relative Humidity", () => String(ri(38, 88))],
    ["Wind Velocity (mph)", () => rf(0.5, 9).toFixed(1)],
    ["Wind Direction", () => pick(["N", "NE", "E", "SE", "S", "SW", "W", "NW"])],
    ["Cloud Cover (%)", () => String(pick([0, 0, 10, 25, 50, 75, 90]))],
    ["Soil Moisture", () => pick(["GOOD", "GOOD", "FAIR", "DRY", "WET"])],
    ["Crop Stage Majority", () => pick(stages)],
    ["Weed Stage Majority", () => `${ri(1, 4)}-${ri(5, 10)} IN`],
  ];
  let wantPanel = chance(0.55);
  const panelFields = PANEL_FIELDS.slice(0, 3).concat(shuffle(PANEL_FIELDS.slice(3)).slice(0, ri(5, 10)));

  // ---------- fit everything on ONE page (row budget, then fill it) ----------
  const nFn = ri(2, 3);
  const fnH = nFn * fs * 1.45 * 0.3528 + 2.4;
  const panelRows = wantPanel ? panelFields.length + 1 + (wantCaption ? 1 : 0) : 0;
  const panelH = wantPanel ? panelRows * rowMM + 5 : 0;
  const availH = 278.5 - padTop - 9 - fnH - panelH;
  const overhead = 1 + tiers.length + 1 + nSections + (spacerQuirk ? nSections - 1 : 0) + summaries.length;
  let dataBudget = Math.floor(availH / rowMM) - overhead - 1;
  if (dataBudget < 14) { wantPanel = false; dataBudget = Math.floor((availH + panelH) / rowMM) - overhead - 1; }
  const targetRows = Math.max(10, Math.floor(dataBudget * rf(0.86, 1.0)));

  // treatment count + per-block partner rows, sized to fill the budget
  const maxSize = ri(3, 9);
  let nTrt = clamp(Math.max(ri(12, 26), Math.ceil(targetRows / maxSize)), 8, Math.min(targetRows, 28));
  const sizes = new Array(nTrt).fill(1);
  { let left = targetRows - nTrt, guard = 0;
    while (left > 0 && guard++ < 900) {
      const i = Math.floor(rng() * nTrt);
      if (sizes[i] >= maxSize) continue;
      sizes[i]++; left--;
    }
  }

  // ---------- treatment numbers (some untreated checks dropped, per the family) ----------
  const nDrop = ri(0, 3);
  const allNums = shuffle(Array.from({ length: nTrt + nDrop }, (_, i) => i + 1));
  const dropped = allNums.slice(0, nDrop).sort((a, b) => a - b);
  const kept = allNums.slice(nDrop);
  const perSec = new Array(nSections).fill(0);
  for (let i = 0; i < nTrt; i++) perSec[i % nSections]++;
  for (let i = 0; i < nSections - 1; i++) {
    if (perSec[i] > 1 && chance(0.5)) { perSec[i]--; perSec[i + 1]++; }
  }
  const trtBySec = [];
  { let off = 0; for (const c of perSec) { trtBySec.push(kept.slice(off, off + c).sort((a, b) => a - b)); off += c; } }

  // ---------- blocks ----------
  const mains = shuffle(PRODUCTS).slice(0, clamp(6 + Math.floor(nTrt / 3), 6, PRODUCTS.length));
  const adjs = shuffle(ADJUVANTS).slice(0, ri(3, 6));
  const blocks = [];
  { let bi = 0;
    sections.forEach((sec, si) => {
      trtBySec[si].forEach((trt) => {
        const k = sizes[bi++] ?? 1;
        const groups = sec.ix.slice(0, Math.max(1, Math.min(sec.ix.length, k)));
        const rows = [];
        let left = k;
        groups.forEach((gk, gi) => {
          const n = gi === groups.length - 1 ? left : clamp(Math.round(left / (groups.length - gi)) + (chance(0.4) ? -1 : 0), 1, left - (groups.length - gi - 1));
          left -= n;
          const nProd = clamp(1 + (n >= 3 && chance(0.5) ? 1 : 0), 1, n);
          const pp = shuffle(mains), ap = shuffle(adjs);
          for (let i = 0; i < n; i++) {
            const src = i < nProd ? pp[i % pp.length] : ap[(i - nProd) % ap.length];
            rows.push([src[0], src[1], src[2], timings[gk].code]);
          }
        });
        blocks.push({ trt, k: rows.length, rows, si, ix: sec.ix });
      });
    });
  }
  if (headerlessBlock && blocks.length > 3) blocks[ri(1, blocks.length - 1)].trt = "";

  // ---------- percent-control values ----------
  const appliedBefore = (ix, c) => ix.filter((k) => timings[k].date <= ratingDts[c]).length;
  const satCol = chance(0.4) ? ri(Math.max(0, nDates - 3), nDates - 1) : -1;
  const satVal = pick(["100", "100", "99"]);
  const vals = blocks.map((b) => {
    const good = chance(0.78);
    const final = good ? ri(88, 99) : ri(52, 84);
    const v = [];
    let cur = 0, prevN = 0;
    for (let c = 0; c < nDates; c++) {
      const n = appliedBefore(b.ix, c);
      if (n === 0) { v.push(0); cur = 0; prevN = 0; continue; }
      if (cur === 0) cur = ri(18, 72);
      else {
        cur = cur + (final - cur) * (0.3 + rng() * 0.5) + rf(-3, 3);
        if (n > prevN) cur = cur + (final - cur) * 0.55;
      }
      prevN = n;
      v.push(clamp(Math.round(cur), 0, 100));
    }
    return v;
  });
  if (satCol >= 0) for (const v of vals) v[satCol] = Number(satVal);

  // ---------- significance letters per rating column ----------
  const lsdBase = Array.from({ length: nDates }, () => 1.4 + rng() * 3.4);
  const LET = "abcdefg";
  const letterStr = blocks.map(() => []);
  for (let c = 0; c < nDates; c++) {
    const order = blocks.map((_, i) => i).sort((x, y) => vals[y][c] - vals[x][c]);
    const grp = new Array(blocks.length);
    let gI = 0;
    grp[order[0]] = 0;
    for (let i = 1; i < order.length; i++) {
      if (vals[order[i - 1]][c] - vals[order[i]][c] > lsdBase[c]) gI = Math.min(gI + 1, 6);
      grp[order[i]] = gI;
    }
    const maxG = gI;
    const extraForG = {};
    for (let i = 0; i < blocks.length; i++) {
      const g0 = grp[i];
      if (!(g0 in extraForG)) extraForG[g0] = chance(0.32) ? 1 + (chance(0.3) ? 1 : 0) : 0;
      const e = Math.min(extraForG[g0], 6 - g0, maxG - g0);
      letterStr[i][c] = LET.slice(g0, g0 + 1 + e) || "a";
    }
  }
  const flatCol = (c) => vals.every((v) => v[c] === vals[0][c]);
  const lsdOut = [], sdOut = [], cvOut = [], probOut = [];
  for (let c = 0; c < nDates; c++) {
    const flat = flatCol(c);
    lsdOut.push(flat ? "0.0" : lsdBase[c].toFixed(1));
    sdOut.push(flat ? "0.0" : (lsdBase[c] * rf(0.5, 0.75)).toFixed(2));
    const mean = vals.reduce((a, v) => a + v[c], 0) / vals.length;
    cvOut.push(mean > 0 ? (100 * lsdBase[c] * 0.45 / mean).toFixed(2) : "0.00");
    probOut.push(flat ? "1.0000" : (rng() * 0.02).toFixed(4));
  }

  // ---------- title ----------
  const systems = shuffle(mains).slice(0, ri(2, 3)).map((p) => p[0].split(" ")[0]);
  const sysPhrase = systems.length === 2 ? `${systems[0]} and ${systems[1]}`
    : `${systems[0]}, ${systems[1]} and ${systems[2]}`;
  const title = pick([
    `Table ${tblNo}. Control of ${pestLower} with ${sysPhrase} systems in ${till} ${crop} at ${site}, ${st} in ${year}.`,
    `Table ${tblNo}. ${pestLower[0].toUpperCase()}${pestLower.slice(1)} control from ${sysPhrase} programs in ${till} ${crop}, ${site}, ${st}, ${year}.`,
    `Table ${tblNo}. Evaluation of ${sysPhrase} herbicide programs for ${pestLower} management in ${crop} at ${site}, ${st} (${year}).`,
    `Table ${tblNo}. Season-long ${pestLower} control with ${sysPhrase} systems, ${till} ${crop}, ${site}, ${st} ${year}.`,
    `Table ${tblNo}. Residual and postemergence ${pestLower} control in ${till} ${crop}, ${site}, ${st}, ${year}.`,
    `Table ${tblNo}. ${sysPhrase} programs evaluated for ${pestLower} suppression in ${crop}, ${site}, ${st} ${year}.`,
  ]);

  // ---------- footnotes ----------
  const FN = [
    `Means followed by same letter or symbol do not significantly differ (P=${pLevel}, LSD).`,
    `Ratings are visual estimates of control relative to the untreated check.`,
    `Plots were ${ri(8, 12)} by ${ri(25, 40)} ft in a randomized complete block design with ${ri(3, 4)} replications.`,
    `Applications were made with a CO2-pressurized backpack sprayer delivering ${pick([10, 15, 20])} gpa.`,
    `Data were subjected to ANOVA and means separated with protected LSD at P=${pLevel}.`,
    `Trial ${trialId} was maintained weed-free after the final rating date.`,
    `Rate units are per broadcast acre unless otherwise indicated.`,
  ];
  const fns = shuffle(FN).slice(0, nFn);
  if (dropped.length)
    fns.unshift(`Treatment${dropped.length > 1 ? "s" : ""} ${dropped.slice(0, -1).join(", ")}${dropped.length > 1 ? " and " : ""}${dropped[dropped.length - 1]}, untreated check${dropped.length > 1 ? "s" : ""}, ${dropped.length > 1 ? "are" : "is"} not shown in table.`);

  // ---------- assemble ----------
  let vb = "";
  const g = [];
  vb += `<tr class="yel"><td colspan="${PC}">${title}</td></tr>\n`;
  g.push(`  <tr><th colspan="${GC}">${title}</th></tr>`);
  for (const t of tiers) {
    if (t.span !== undefined) {
      vb += `<tr><td colspan="5" class="bb">${t.label}</td><td colspan="${2 * nDates}" class="vl bb ctr b">${t.span}</td></tr>\n`;
      g.push(`  <tr><th colspan="4">${t.label}</th><th colspan="${nDates}">${t.span}</th></tr>`);
    } else {
      const vv = t.vals.slice(0, nDates);
      vb += `<tr><td colspan="5" class="bb">${t.label}</td>` +
        vv.map((x) => `<td colspan="2" class="vl bb ctr b">${x}</td>`).join("") + `</tr>\n`;
      g.push(`  <tr><th colspan="4">${t.label}</th>` + vv.map((x) => `<th>${x}</th>`).join("") + `</tr>`);
    }
  }
  vb += `<tr><td class="bb">${trtLabel}</td><td class="bb">${treatLabel}</td><td colspan="2" class="bb ctr">${rateLabel}</td>` +
    `<td class="bb ctr">${applLabel}</td><td colspan="${2 * nDates}" class="vl bb ctr b">${spanner}</td></tr>\n`;
  g.push(`  <tr><th>${trtLabel}</th><th>${treatLabel}</th><th>${rateLabel}</th><th>${applLabel}</th><th colspan="${nDates}">${spanner}</th></tr>`);

  let bIdx = 0;
  sections.forEach((sec, si) => {
    if (spacerQuirk && si > 0) vb += `<tr class="sp"><td colspan="${PC}">&nbsp;</td></tr>\n`;
    vb += `<tr class="yel"><td colspan="${PC}">${sec.label}</td></tr>\n`;
    g.push(`  <tr><td colspan="${GC}">${sec.label}</td></tr>`);
    trtBySec[si].forEach(() => {
      const b = blocks[bIdx];
      if (!b) return;
      b.rows.forEach((r, rIdx) => {
        const [name, rv, ru, ap] = r;
        if (rIdx === 0) {
          vb += `<tr class="bt"><td class="rt">${b.trt}</td><td>${name}</td><td class="rt">${rv}</td><td>${ru}</td><td class="ctr">${ap}</td>`;
          for (let c = 0; c < nDates; c++)
            vb += `<td class="vl num">${vals[bIdx][c]}</td><td class="let">${letterStr[bIdx][c]}</td>`;
          vb += `</tr>\n`;
          let gr = `  <tr><td rowspan="${b.k}">${b.trt}</td><td>${name}</td><td>${rv} ${ru}</td><td>${ap}</td>`;
          for (let c = 0; c < nDates; c++) gr += `<td rowspan="${b.k}">${vals[bIdx][c]} ${letterStr[bIdx][c]}</td>`;
          g.push(gr + `</tr>`);
        } else {
          vb += `<tr><td></td><td class="${indentPartners ? "ind" : ""}">${name}</td><td class="rt">${rv}</td><td>${ru}</td><td class="ctr">${ap}</td>`;
          for (let c = 0; c < nDates; c++) vb += `<td class="vl"></td><td></td>`;
          vb += `</tr>\n`;
          g.push(`  <tr><td>${name}</td><td>${rv} ${ru}</td><td>${ap}</td></tr>`);
        }
      });
      bIdx++;
    });
  });

  for (const s of summaries) {
    const cells = s.kind === "lsd" ? lsdOut : s.kind === "sd" ? sdOut : s.kind === "cv" ? cvOut : probOut;
    const cls = s.yel ? "yel" : "sum";
    vb += `<tr class="${cls}"><td colspan="5">${s.label}</td>` +
      cells.map((x) => `<td colspan="2" class="vl ctr up">${x}</td>`).join("") + `</tr>\n`;
    g.push(`  <tr><td colspan="4">${s.label}</td>` + cells.map((x) => `<td>${x}</td>`).join("") + `</tr>`);
  }

  // ---------- optional application-description panel ----------
  let panelHtml = "";
  if (wantPanel) {
    const codes = timings.slice(0, nApp).map((t) => t.code);
    const rowsOut = panelFields.map(([label, f]) => [label, codes.map((_, k) => f(k))]);
    const labW = +(38 * scale).toFixed(2);
    const cw = +((tableW - labW) / nApp).toFixed(2);
    const cg = `<col style="width:${labW}mm">` + codes.map(() => `<col style="width:${cw}mm">`).join("");
    let pb = "";
    const pg = [];
    if (wantCaption) {
      pb += `<tr class="yel"><td colspan="${nApp + 1}">Application Description</td></tr>\n`;
      pg.push(`  <tr><th colspan="${nApp + 1}">Application Description</th></tr>`);
    }
    pb += `<tr><td class="bb b">Application Code</td>` + codes.map((c) => `<td class="vl bb ctr b">${c}</td>`).join("") + `</tr>\n`;
    pg.push(`  <tr><th>Application Code</th>` + codes.map((c) => `<th>${c}</th>`).join("") + `</tr>`);
    for (const [label, cells] of rowsOut) {
      pb += `<tr><td>${label}</td>` + cells.map((x) => `<td class="vl ctr">${x}</td>`).join("") + `</tr>\n`;
      pg.push(`  <tr><td>${label}</td>` + cells.map((x) => `<td>${x}</td>`).join("") + `</tr>`);
    }
    panelHtml = `<table class="panel"><colgroup>${cg}</colgroup>\n${pb}</table>`;
    g.push("__PANEL__" + `<table>\n${pg.join("\n")}\n</table>`);
  }

  const colw = [trtW, treatW, rateW, unitW, applW];
  for (let c = 0; c < nDates; c++) colw.push(numW, letW);
  const colgroup = colw.map((w) => `<col style="width:${w}mm">`).join("");

  const showHdr = chance(0.5);
  const hdrLine = showHdr
    ? `<div class="hdr">Trial ID: ${trialId}&nbsp;&nbsp;&nbsp;${site}, ${st}&nbsp;&nbsp;&nbsp;Page ${ri(1, 4)} of ${ri(5, 9)}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; width: 215.9mm; height: 278.5mm; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .wrap { padding: ${padTop}mm ${padX}mm 0 ${padX}mm; }
  .hdr { font-size: ${(fs - 0.3).toFixed(2)}pt; margin-bottom: 1.2mm; }
  table { border-collapse: collapse; table-layout: fixed; width: ${tableW}mm; border: 1pt solid #000; }
  table.panel { margin-top: 3.5mm; }
  td { font-size: ${fs}pt; padding: 0.8pt 2pt; line-height: 1.12; white-space: nowrap; overflow: hidden;
       text-align: left; vertical-align: bottom; }
  .vl { border-left: 0.6pt solid #000; }
  .bb { border-bottom: 0.6pt solid #000; }
  tr.bt td { border-top: 0.6pt solid #000; }
  tr.yel td { background: #ffff00; font-weight: bold; font-style: italic;
              border-top: 0.6pt solid #000; border-bottom: 0.6pt solid #000; }
  tr.sum td { border-top: 0.6pt solid #000; }
  tr.sp td { height: ${(rowMM * 0.75).toFixed(2)}mm; }
  .ctr { text-align: center; }
  .rt { text-align: right; }
  .ind { padding-left: ${indentPartners ? 5 : 2}pt; }
  .b { font-weight: bold; }
  .up { font-style: normal; font-weight: bold; }
  .num { text-align: center; font-weight: bold; }
  .let { font-weight: bold; padding-left: 3pt; }
  .fn { font-size: ${(fs - 0.2).toFixed(2)}pt; line-height: 1.45; margin-top: 0.8mm; }
  </style></head><body><div class="wrap">
  ${hdrLine}
  <table><colgroup>${colgroup}</colgroup>\n${vb}</table>
  ${panelHtml}
  <div class="fn">${fns.join("<br>")}</div>
  </div></body></html>`;

  const main = g.filter((r) => !r.startsWith("__PANEL__"));
  const panelGt = g.find((r) => r.startsWith("__PANEL__"));
  const gt = `<table>\n${main.join("\n")}\n</table>` + (panelGt ? `\n\n${panelGt.slice(9)}` : "");

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
