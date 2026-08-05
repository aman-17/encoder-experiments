// Family generator: state auto rate filing "UW Rate Matrix Tier" page.
// A4 landscape dominated by ONE monolithic micro-font factor matrix (13-16
// cols x ~40-95 rows). No gridlines; the four left ID columns sit on a light
// shaded band; a lone "Proposed"-style word centered above the grid; the
// matrix ends partway down the page (mid-document slice look) with optional
// filing footer. Family quirks (seed-toggled): several coverage columns
// byte-identical (shared value streams); credit tiers A.. then Z-suffix rows
// that mirror the last alphabet rows and then repeat verbatim; one whole
// tier group a verbatim copy of an earlier group; constant source-tier
// letter column; running tier index 1..N; last group cut mid-alphabet.
// All company names / form numbers / dates are fictional pools.
// GT = one flat table, no merges (~500-1400 cells across seeds).
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

  // ---------- pools (fictional) ----------
  const COMPANIES = [
    "Talvern Mutual Insurance Company", "Orisette Casualty Insurance Company",
    "Bluewick National Insurance Company", "Crestfall Indemnity Company",
    "Veridane Insurance Group", "Hollowbrook Property & Casualty Company",
    "Quillstone Mutual Assurance Company", "Marbeck General Insurance Company"];
  const TITLES = ["UW Rate Matrix Tier", "UW Rate Matrix Tier Factors",
    "Underwriting Rate Matrix Tier", "UW Tier Rate Matrix",
    "UW Rate Matrix Tier Assignment", "Rate Matrix Tier Factors"];
  const PROPOSED = ["Proposed", "Proposed Rates", "Proposed Factors",
    "Proposed — New Business", "Proposed (Revised)", "Proposed Program"];
  const C1 = ["UW Tier Group", "Tier Group", "UW Group", "Rate Tier Group", "UW Tier Grp"];
  const C2 = ["Credit Tier", "Credit Score Tier", "Insurance Score Tier", "Score Tier", "Credit Grp Tier"];
  const C3 = ["NB/PRV TIER", "ACQ/REN TIER", "MKT SEG TIER", "SRC CH TIER",
    "AGY/DIR TIER", "ORIG BK TIER", "POL GRP TIER"];
  const C4 = ["UW Rate Matrix Tier", "Rate Matrix Tier", "UW Matrix Tier",
    "Matrix Rate Tier", "UW Tier"];
  const COVPOOL = ["ALL", "BI", "CEQ", "COL", "EXTR", "GAP", "MED", "MP", "OTC",
    "PD", "PIP", "RA", "RENT", "TL", "UIM", "UMBI", "UMPD"];
  const LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y"];
  const ZLETTERS = ["ZD","ZE","ZF","ZG","ZH","ZJ","ZK","ZL"];
  const SHADES = ["#dce6f1", "#e2ecf5", "#d9e4ee", "#e8eef7"];

  // ---------- structural knobs (seed-driven) ----------
  const nGroups = ri(3, 5);
  const baseLen = ri(12, 16);            // A.. alphabet depth per group
  const zCount = ri(3, 5);               // Z-suffix rows per full group
  const covCount = ri(9, 12);            // coverage factor columns
  const cols = 4 + covCount;
  const partialQuirk = rng() < 0.8;      // last group cut mid-alphabet
  const partialLen = ri(8, baseLen - 2);
  const zMirror = rng() < 0.85;          // Z rows mirror/repeat tail of alphabet
  const saturate = rng() < 0.85;         // several coverage cols byte-identical
  const nStreams = saturate ? ri(4, 5) : covCount;
  const doRepeat = nGroups >= 4 && rng() < 0.7; // whole-group verbatim copy
  const lastFull = partialQuirk ? nGroups - 1 : nGroups;
  const repeatIdx = doRepeat ? ri(2, lastFull - 1) : -1;
  const repeatSrc = doRepeat ? ri(0, repeatIdx - 1) : -1;
  const tierConst = rng() < 0.85;
  const constLetter = pick(["A", "B", "C", "N", "S"]);
  const groupLetters = ["A", "B", "C", "D", "E"];

  // coverage columns: alphabetical slice of the pool (family sorts headers)
  const covIdx = new Set();
  while (covIdx.size < covCount) covIdx.add(Math.floor(rng() * COVPOOL.length));
  const covs = [...covIdx].map((i) => COVPOOL[i]).sort();
  // stream assignment: every stream used, extras shared -> identical columns
  const order = covs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const colStream = new Array(covCount);
  order.forEach((c, k) => { colStream[c] = k < nStreams ? k : Math.floor(rng() * nStreams); });

  // ---------- value streams: ascending 4-dec factors, small steps + jumps ----------
  const step = (v) => v + (rng() < 0.62 ? 0.002 : 0.008 + rng() * 0.13);
  const genGroup = (nRows) => {
    const v = [];
    for (let s = 0; s < nStreams; s++) v.push(0.25 + rng() * 0.55);
    const out = [];
    for (let r = 0; r < nRows; r++) {
      out.push(v.map((x) => x.toFixed(4)));
      for (let s = 0; s < nStreams; s++) v[s] = step(v[s]);
    }
    return out;
  };
  const makeFull = () => {
    const g = genGroup(baseLen + zCount);
    if (zMirror) {
      const m = Math.min(3, zCount);
      for (let i = 0; i < zCount; i++)
        g[baseLen + i] = i < m ? g[baseLen - 3 + i] : g[baseLen - 1];
    }
    return g;
  };

  const groups = [];
  for (let gi = 0; gi < nGroups; gi++) {
    if (gi === repeatIdx) groups.push(groups[repeatSrc]);           // verbatim block repeat
    else if (partialQuirk && gi === nGroups - 1) groups.push(genGroup(partialLen));
    else groups.push(makeFull());
  }

  // ---------- assemble rows: [group, letter, srcTier, tierIdx, factors...] ----------
  const HEAD = [pick(C1), pick(C2), pick(C3), pick(C4), ...covs];
  let rows = [];
  let tier = 1;
  groups.forEach((g, gi) => {
    const srcLetter = tierConst ? constLetter : groupLetters[gi];
    g.forEach((vals, k) => {
      const letter = k < baseLen ? LETTERS[k] : ZLETTERS[k - baseLen];
      rows.push([String(gi + 1), letter, srcLetter, String(tier++),
        ...colStream.map((s) => vals[s])]);
    });
  });
  // budget cap: keep GT in 500-1400 cells (trim reads as another page cut)
  const maxRows = Math.floor(1400 / cols) - 1;
  if (rows.length > maxRows) rows = rows.slice(0, maxRows);

  // ---------- page furniture ----------
  const F = 3.9 + rng() * 0.9;                    // base grid font, pt (±10%)
  const fs = (m) => (F * m).toFixed(2) + "pt";
  const idW = (5.8 + rng() * 1.2).toFixed(2);
  const shade = pick(SHADES);
  const company = COMPANIES[Math.floor(rng() * COMPANIES.length)];
  const showCompany = rng() < 0.55;
  const title = pick(TITLES);
  const proposed = pick(PROPOSED);
  const yr = 2028 + Math.floor(rng() * 7);
  const mm = String(ri(1, 12)).padStart(2, "0");
  const dd = String(ri(1, 28)).padStart(2, "0");
  const showEff = rng() < 0.6;
  const showExh = rng() < 0.5;
  const exh = rng() < 0.5 ? `Exhibit R-${ri(2, 24)}` : `Exh. ${pick(["A","B","C","D","E","F"])}-${ri(1, 9)}`;
  const showFooter = rng() < 0.7;
  const formNo = `Form UW-${ri(1000, 9899)} Ed. ${mm}-${String(yr).slice(2)}`;
  const pageNo = ri(101, 949);

  const idCls = (i) => (i < 4 ? ' class="id"' : "");
  const headHtml = "<tr>" + HEAD.map((h, i) => `<th${idCls(i)}>${h}</th>`).join("") + "</tr>";
  const bodyHtml = rows.map((r) =>
    "<tr>" + r.map((c, i) => `<td${idCls(i)}>${c}</td>`).join("") + "</tr>").join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  body { margin: 0; width: 297mm; height: 209mm; font-family: Arial, Helvetica, sans-serif;
         color: #000; overflow: hidden; position: relative; }
  .wrap { padding: 2mm 3mm 0 3mm; }
  .company { text-align: center; font-size: ${fs(1.5)}; font-weight: bold; margin-bottom: 0.5mm; }
  .titleline { position: relative; }
  .title { font-size: ${fs(1.42)}; font-weight: bold; }
  .exh { position: absolute; right: 0; top: 0; font-size: ${fs(1.25)}; }
  .proposed { text-align: center; font-size: ${fs(1.3)}; margin: 0.6mm 0 ${showEff ? "0.2mm" : "0.6mm"}; }
  .eff { text-align: center; font-size: ${fs(1.15)}; margin-bottom: 0.6mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { font-size: ${fs(1)}; line-height: 1.02; padding: 0; text-align: center;
           white-space: nowrap; overflow: hidden; font-weight: normal; }
  th { font-weight: bold; }
  col.id { width: ${idW}%; }
  .id { background: ${shade}; }
  .foot { position: absolute; bottom: 2mm; left: 3mm; right: 3mm; font-size: ${fs(1.15)}; }
  .foot .pg { float: right; }
  </style></head><body><div class="wrap">
  ${showCompany ? `<div class="company">${company}</div>` : ""}
  <div class="titleline"><span class="title">${title}</span>${showExh ? `<span class="exh">${exh}</span>` : ""}</div>
  <div class="proposed">${proposed}</div>
  ${showEff ? `<div class="eff">Effective ${mm}-${dd}-${yr}</div>` : ""}
  <table><colgroup>${'<col class="id">'.repeat(4)}<col span="${covCount}"></colgroup>
  ${headHtml}
  ${bodyHtml}
  </table></div>
  ${showFooter ? `<div class="foot">${formNo}<span class="pg">Page ${pageNo}</span></div>` : ""}
  </body></html>`;

  const gt = "<table>\n  <tr>\n" + HEAD.map((h) => `    <th>${h}</th>`).join("\n") + "\n  </tr>\n"
    + rows.map((r) => "  <tr>\n" + r.map((c) => `    <td>${c}</td>`).join("\n") + "\n  </tr>").join("\n")
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
