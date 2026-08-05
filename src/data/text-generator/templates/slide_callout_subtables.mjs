// FAMILY generator: 16:9 earnings-deck slide — solid brand-blue banner with white
// heading + circular accent mark, brand-color intro paragraph, 2-3 dashed rounded
// callout boxes each holding 1-3 stacked date sub-tables (light band title, dark
// 2-line header, bold row + gray "Base:" zebra rows), big bold "FY## Reporting"
// labels floating LEFT of each dashed box. No gridlines anywhere — fill-only.
// Adversarial quirks kept (seed-varied): Full Year column repeats Q4 verbatim,
// optional H1 column repeats Q2 verbatim, later boxes' comparison sub-tables
// repeat earlier boxes' rows verbatim, optional "As Reported:" rows duplicate the
// Base row byte-for-byte, 53-week / 14-week-Q4 comparison years.
// Seeded structural knobs: box count (2-3), sub-tables per box (1-3), extra rows
// (0-2), period columns (5 or 6 -> 6/7 GT cols), label/title/intro/footnote
// wording pools, fiscal year (FY28-FY38), fiscal year-end month+weekday, date
// zero-padding, brand color pools, font scale (+/-10% with fit-shrink).
// Decontaminated: no real company names/marks, fictional retailer pool, shifted
// fiscal years, paraphrased intro/footnote text, pooled non-brand colors.
// GT = one logical table per dashed box; band rows are colspan merges.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = a => a[Math.floor(rng() * a.length)];
  const D = 86400000;
  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  // ---- seeded knobs -------------------------------------------------------
  const endMonth = pick([0, 0, 0, 3, 6, 8]);       // fiscal year-end month (Jan-heavy)
  const endDow = pick([5, 6, 6, 0]);               // last Fri/Sat/Sun of that month
  const padDay = rng() < 0.55;
  const fmt = t => {
    const d = new Date(t);
    const day = padDay ? String(d.getUTCDate()).padStart(2, "0") : String(d.getUTCDate());
    return `${MONTHS[d.getUTCMonth()]} ${day}, ${d.getUTCFullYear()}`;
  };
  const lastDow = (y, m, dow) => {                 // last `dow` on/before month end
    const t = Date.UTC(y, m + 1, 0);
    return t - ((new Date(t).getUTCDay() - dow + 7) % 7) * D;
  };
  const fyEnd = K => lastDow(2000 + K, endMonth, endDow);
  const is53 = K => Math.round((fyEnd(K) - fyEnd(K - 1)) / D) === 371;

  // reporting fiscal year FY{N} in 28..38; prefer an N whose FY{N-1} has 53 weeks
  const cand = Array.from({ length: 11 }, (_, i) => 28 + i);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const want53 = rng() < 0.8;
  let N = cand[0];
  if (want53) { const hit = cand.find(k => is53(k - 1)); if (hit !== undefined) N = hit; }

  const layoutRoll = rng();
  const layout = layoutRoll < 0.45 ? "A" : layoutRoll < 0.8 ? "B" : "C";
  const fyList = layout === "C" ? [N, N + 1, N + 2] : [N, N + 1];
  const nBoxes = fyList.length;
  const subsPerBox =
    layout === "A" ? [2, 2] :
    layout === "B" ? (rng() < 0.5 ? [3, 2] : [2, 3]) :
    pick([[2, 1, 1], [1, 1, 1], [2, 2, 1]]);

  const hasH1 = rng() < 0.3;
  const qNames = pick([["Q1", "Q2", "Q3", "Q4"],
    ["Qtr 1", "Qtr 2", "Qtr 3", "Qtr 4"],
    ["First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter"]]);
  const fyName = pick(["Full Year", "Fiscal Year", "Total Year"]);
  const h1Name = pick(["H1", "First Half"]);
  const endedWord = pick(["Weeks Ended", "Weeks Ending"]);
  const bandPhrase = pick(["Comparable Sales", "Comparable Sales Calendar", "Comp Sales Reporting Calendar"]);
  const compPrefix = pick(["Comparison Period:", "Base Period:", "Prior Comparison:"]);
  const basePrefix = pick(["Base:", "Comp Base:", "Comparison Base:"]);
  const dupPrefix = pick(["As Reported:", "Unadjusted:", "Restated:"]);
  const priorPrefix = pick(["Prior Base:", "Two-Year Base:"]);
  const sideWord = pick(["Reporting", "Reporting", "Reporting Periods", "Calendar"]);

  const COMPANIES = ["Trellico Stores", "Bramblewood Markets", "Northwind Retail Group",
    "Fairhollow Companies", "Quillcrest Markets", "Sunhaven Stores",
    "Marlowe Home Centers", "Cobalt Pine Mercantile"];
  const company = pick(COMPANIES);
  const words = company.split(/[^A-Za-z]+/).filter(Boolean);
  const initials = words.slice(0, rng() < 0.35 ? 2 : 1).map(w => w[0]).join("");

  const ink = pick(["#0154da", "#0b3d91", "#1a4fb4", "#0e5cad", "#2456c4", "#0a4fc0"]);
  const hdrBg = pick(["#0a68dc", "#1257b8", "#0d5bc6", "#2a63c9"]);
  const bandBg = pick(["#acd8f3", "#bcd9ee", "#cfe3f5", "#a9cdec"]);
  const navy = pick(["#06284f", "#0b2a4a", "#102c57"]);
  const markBg = pick(["#ffc220", "#ffb81c", "#f2a900", "#ffd24d"]);
  const geo = pick(["U.S.", "domestic", "North American", "core-market"]);
  const pageNo = 12 + Math.floor(rng() * 19);
  const fJit = 0.9 + rng() * 0.2;                  // +/-10% font jitter

  // ---- 4-5-4 date engine --------------------------------------------------
  const fyMemo = new Map();
  const fyData = K => {
    if (!fyMemo.has(K)) {
      const e0 = fyEnd(K - 1), e1 = fyEnd(K);
      const wks = Math.round((e1 - e0) / D / 7);   // 52 or 53
      const q = [1, 2, 3].map(k => e0 + 91 * k * D); q.push(e1, e1); // Full Year repeats Q4
      const dates = hasH1 ? [q[0], q[1], q[1], q[2], q[3], q[4]] : q; // H1 repeats Q2
      fyMemo.set(K, { dates, wks, q4w: wks - 39 });
    }
    return fyMemo.get(K);
  };
  const shift = (dates, days) => dates.map(t => t - days * D);
  const periodsFor = f => {
    const p = [{ n: qNames[0], w: 13 }, { n: qNames[1], w: 13 }];
    if (hasH1) p.push({ n: h1Name, w: 26 });
    p.push({ n: qNames[2], w: 13 }, { n: qNames[3], w: f.q4w }, { n: fyName, w: f.wks });
    return p;
  };
  const nPeriods = hasH1 ? 6 : 5;

  // ---- structure ----------------------------------------------------------
  const makeSub = (K, comp) => {
    const f = fyData(K);
    return {
      K,
      band: comp ? `${compPrefix} FY${K} ${bandPhrase}` : `FY${K} ${bandPhrase}`,
      periods: periodsFor(f),
      rows: [
        { label: `FY${K} (${f.wks} weeks)`, dates: f.dates, st: comp ? "p" : "b", sup: comp },
        { label: `${basePrefix} FY${K - 1} (${f.wks} weeks)`, dates: shift(f.dates, 364), st: "z", sup: false },
      ],
    };
  };
  const boxes = fyList.map((K, i) => {
    const subs = [makeSub(K, false)];
    if (subsPerBox[i] >= 2) subs.push(makeSub(K - 1, true));
    if (subsPerBox[i] >= 3) subs.push(makeSub(K - 2, true));
    return { side: `FY${K}`, subs };
  });
  const allSubs = boxes.flatMap(b => b.subs);

  // extra rows: duplicate-the-Base verbatim ("As Reported:") or two-year base
  let extraBudget = layout === "A"
    ? (rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0)
    : (rng() < 0.5 ? 1 : 0);
  const openSubs = allSubs.slice();
  while (extraBudget-- > 0 && openSubs.length) {
    const s = openSubs.splice(Math.floor(rng() * openSubs.length), 1)[0];
    const f = fyData(s.K);
    if (rng() < 0.6)
      s.rows.push({ label: `${dupPrefix} FY${s.K - 1} (${f.wks} weeks)`, dates: shift(f.dates, 364), st: "z", sup: false });
    else
      s.rows.push({ label: `${priorPrefix} FY${s.K - 2} (${f.wks} weeks)`, dates: shift(f.dates, 728), st: "p", sup: false });
  }
  const hasSup = allSubs.some(s => s.rows.some(r => r.sup));

  // ---- fit / scale --------------------------------------------------------
  const subH = s => 19 + 31 + 21 * s.rows.length;
  const boxH = b => b.subs.reduce((a, s) => a + subH(s), 0) + 26;
  const gap = nBoxes === 3 ? 16 : 24;
  const need = 78 + boxes.reduce((a, b) => a + boxH(b), 0) + gap * (nBoxes - 1);
  const avail = 718 - 144 - 10 - 12 - 58;
  const S = Math.max(0.74, Math.min(fJit, avail / need));
  const px = v => `${(v * S).toFixed(1)}px`;

  const maxLbl = Math.max(...allSubs.flatMap(s => s.rows.map(r => r.label.length)));
  const lblW = Math.min(236, Math.max(160, Math.round(maxLbl * 6.6 + 16)));
  const dtW = Math.floor((918 - lblW) / nPeriods);
  const dtF = Math.min(12.5, (dtW - 8) / 9.4);
  const lblF = Math.min(12.5, (lblW - 14) / (maxLbl * 0.54));

  // ---- text pools ---------------------------------------------------------
  let yr53 = null;
  for (let k = N - 1; k <= fyList[nBoxes - 1] && yr53 === null; k++) if (is53(k)) yr53 = k;
  const fyPhrase = nBoxes === 3
    ? pick([`FY${N} Through FY${N + 2}`, `FY${N}&ndash;FY${N + 2}`])
    : `FY${N} and FY${N + 1}`;
  const calPhrase = pick(["4-5-4 Reporting Calendars", "Reporting Calendars (4-5-4 Basis)", "4-5-4 Calendar Reference"]);
  const titleLead = pick(["Supplemental Information -", "Appendix:", "Supplemental Detail -"]);
  const title = `${titleLead}<br>${fyPhrase} Comparable Sales ${calPhrase}`;

  const s1 = pick([
    `We report ${geo} comparable sales on a 13-week and 52-week retail calendar &mdash; commonly called a &quot;4-5-4&quot; calendar &mdash; in which each year contains 364 days.`,
    `${company} measures ${geo} comparable sales using a 4-5-4 retail calendar built from 13-week quarters, so each fiscal year spans 364 days.`,
    `Our ${geo} comparable sales follow a 4-5-4 reporting calendar in which every quarter contains 13 weeks and every year contains 364 days.`,
  ]);
  const s2 = yr53 !== null ? pick([
    `In certain years a 53rd week must be added to the comparable sales calendar, which occurred in fiscal 20${yr53}.`,
    `Periodically an extra 53rd week is required to realign the calendar, most recently in fiscal 20${yr53}.`,
  ]) : `No 53rd week falls within the periods presented below.`;
  const s3 = pick([
    `The tables below present our period ending dates for ${geo} comparable sales reporting throughout ${fyPhrase.replace(/&ndash;/g, " through ")}.`,
    `The following schedules set out the period ending dates used for ${geo} comparable sales in ${fyPhrase.replace(/&ndash;/g, " through ")}.`,
  ]);
  const s4 = yr53 !== null ? " " + pick([
    `The additional week affects 4-5-4 comparable sales only; all other reported measures are unchanged.`,
    `Only 4-5-4 comparable sales are impacted by the extra week; no other metrics are affected.`,
  ]) : "";
  const intro = `${s1} ${s2} ${s3}${s4}`;

  const footNote = pick([
    `Comparable sales are calculated over periods of equal length, and comparison periods are shown as originally reported. Recasting the comparison periods to match the length of the reporting period would not change previously reported comparable sales in any meaningful way.`,
    `Our comparable sales calculations use periods of equal length; comparison periods appear as first reported. Aligning them to the reporting period&rsquo;s week count would have an immaterial effect on prior comparable sales.`,
    `Comparisons are made across equal-length periods and are presented as originally disclosed. Restating them to the reporting period&rsquo;s number of weeks would produce no meaningful change.`,
  ]);

  // ---- render -------------------------------------------------------------
  const hdrRow = s =>
    `<tr><td class="lb"></td>` +
    s.periods.map(p => `<td class="h">${p.n}<br>${p.w} ${endedWord}</td>`).join("") + `</tr>`;
  const boxHtml = box => {
    let t = `<table class="cal">`;
    for (const s of box.subs) {
      t += `<tr><td class="lb"></td><td colspan="${nPeriods}" class="band">${s.band}</td></tr>` + hdrRow(s);
      for (const r of s.rows)
        t += `<tr class="${r.st}"><td class="lbl">${r.label}${r.sup ? "<sup>1</sup>" : ""}</td>` +
          r.dates.map(d => `<td class="dt">${fmt(d)}</td>`).join("") + `</tr>`;
    }
    t += `</table>`;
    return `<div class="grp"><div class="side">${box.side}<br>${sideWord}</div><div class="dbox">${t}</div></div>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 338.7mm 190.5mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { width: 1280px; height: 718px; overflow: hidden; position: relative;
         font-family: Arial, Helvetica, sans-serif; background: #fff; }
  .banner { height: 144px; background: ${ink}; position: relative; }
  .banner h1 { margin: 0; padding: 24px 0 0 40px; color: #fff; font-size: ${nBoxes === 3 ? 34 : 37}px;
               font-weight: 400; line-height: 1.24; letter-spacing: -0.4px; }
  .mark { position: absolute; top: 20px; right: 28px; width: 34px; height: 34px;
          border-radius: 50%; background: ${markBg}; color: ${ink}; font-weight: bold;
          font-size: ${initials.length === 2 ? 14 : 21}px; text-align: center; line-height: 34px; }
  .intro { color: ${ink}; font-size: ${px(13.5)}; line-height: 1.38; margin: 10px 40px 0 40px; }
  .grp { position: relative; margin-top: 12px; }
  .grp + .grp { margin-top: ${gap}px; }
  .side { position: absolute; left: 0; top: 50%; transform: translateY(-50%);
          width: 233px; text-align: center; color: ${ink}; font-weight: bold;
          font-size: ${px(27)}; line-height: 1.25; }
  .dbox { margin-left: 233px; width: 953px; box-sizing: border-box;
          border: 5px dashed ${ink}; border-radius: 28px; padding: 8px 0 8px 16px; }
  table.cal { border-collapse: collapse; }
  td { vertical-align: middle; padding: 0; }
  .lb, .lbl { width: ${lblW}px; }
  .lbl { text-align: right; padding-right: 10px; font-size: ${px(lblF)}; white-space: nowrap; }
  .dt { width: ${dtW}px; text-align: center; font-size: ${px(dtF)}; white-space: nowrap; }
  .band { background: ${bandBg}; color: ${navy}; font-weight: bold; text-align: center;
          font-size: ${px(12.5)}; height: ${px(19)}; }
  .h { background: ${hdrBg}; color: #fff; text-align: center; font-size: ${px(11.5)};
       line-height: 1.28; height: ${px(31)}; }
  tr.b td { color: ${navy}; font-weight: bold; height: ${px(21)}; }
  tr.p td { color: #595959; height: ${px(21)}; }
  tr.z td { background: #e6e6e6; color: #595959; height: ${px(21)}; }
  sup { font-size: ${px(8)}; }
  .foot { position: absolute; left: 40px; right: 40px; bottom: 20px;
          color: ${ink}; font-size: ${px(9.5)}; line-height: 1.4; }
  .copy { position: absolute; bottom: 5px; left: 40px; color: #777; font-size: 8.5px; }
  .pgno { position: absolute; bottom: 5px; left: 0; right: 0; text-align: center;
          color: #333; font-size: 12px; }
  </style></head><body>
  <div class="banner"><h1>${title}</h1><div class="mark">${initials}</div></div>
  <div class="intro">${intro}</div>
  ${boxes.map(boxHtml).join("\n")}
  <div class="foot">${hasSup ? "<sup>1</sup>" : ""}${footNote}</div>
  <div class="copy">&copy; 20${N - 1} ${company}. All rights reserved.</div>
  <div class="pgno">${pageNo}</div>
  </body></html>`;

  // ---- logical GT: one table per dashed box -------------------------------
  const gtBox = box => {
    let g = "<table>\n";
    for (const s of box.subs) {
      g += `  <tr>\n    <td></td>\n    <td colspan="${nPeriods}">${s.band}</td>\n  </tr>\n`;
      g += `  <tr>\n    <th></th>\n` +
        s.periods.map(p => `    <th>${p.n} ${p.w} ${endedWord}</th>`).join("\n") + `\n  </tr>\n`;
      for (const r of s.rows)
        g += `  <tr>\n    <td>${r.label}${r.sup ? "1" : ""}</td>\n` +
          r.dates.map(d => `    <td>${fmt(d)}</td>`).join("\n") + `\n  </tr>\n`;
    }
    return g + "</table>";
  };
  const gt = boxes.map(gtBox).join("\n\n");

  // format:undefined neutralizes render.mjs's default format:"A4" (puppeteer
  // gives `format` priority over width/height); preferCSSPageSize backs it up.
  return { html, gt, pageOpts: { format: undefined, width: "338.7mm", height: "190.5mm", preferCSSPageSize: true } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
