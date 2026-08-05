// FAMILY GENERATOR (training data) — "duplicate quadrant tables": three
// structurally identical borderless "batch cycle" tables in a 2x2 grid with
// one quadrant EMPTY; one category appears once, the other appears TWICE as a
// byte-identical duplicate (the defining quirk, always on). Each table carries
// a ragged "Exp Scaled Output"-style KV tail under the trailing columns. No
// gridlines anywhere; tiny ~5pt sans-serif; large blank region below.
//
// Seed-varied structure: data-row count (15-28 via cycles x letters, seed-mod
// guaranteed to differ across consecutive seeds), 6 or 7 columns (one per-unit
// column occasionally dropped), KV cycle count 4-6, header-synonym pools, key
// prefix, title wording/year suffix, font scale +/-10%, quadrant arrangement
// (which quadrant is empty / which holds the duplicate pair), and quirk
// toggles: coeff identical-value saturation, blank spacer rows (visual only),
// stray footer token. All names/codes/years are fictional pools.
//
// GT = 2 logical tables per rendered table (main + KV tail), duplicate listed
// twice, reading order. ~330-660 cells depending on seed.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // ---- structural knobs ------------------------------------------------
  // row count: cycles x letters; seed-mod so consecutive seeds always differ
  const combos = [[3, 5], [4, 4], [3, 6], [4, 5], [3, 7], [4, 6], [5, 5], [4, 7]];
  const [nCycles, nLetters] = combos[Math.abs(seed) % combos.length];
  const nRows = nCycles * nLetters; // 15,16,18,20,21,24,25,28

  const kvCycles = 4 + Math.floor(rng() * 3); // 4..6 KV cycle lines

  // occasionally drop one derived per-unit column (7 -> 6 cols)
  let dropIdx = -1;
  const dr = rng();
  if (dr < 0.15) dropIdx = 3; else if (dr < 0.30) dropIdx = 6;
  const nCols = dropIdx === -1 ? 7 : 6;

  // ---- wording pools (all fictional / generic) -------------------------
  const keyOpt = pick([["Batch", "Cycle"], ["Run", "Cycle"], ["Lot", "Cycle"],
    ["Prod", "Cycle"], ["Batch", "Series"], ["Run", "Block"]]);
  const keyPrefix = keyOpt.map((w) => w[0]).join(""); // BC / RC / LC / PC / BS / RB
  const unitOpt = pick([["Unit", "Count"], ["Unit", "Vol"], ["Units", "Proc"]]);
  const grossW = pick(["Gross", "Base", "Total"]);
  const outW = pick(["Output", "Yield", "Thruput"]);
  const scaledW = pick(["Scaled", "Adj", "Indexed", "Wtd"]);
  const coeffOpt = pick([["Scale", "Coeff"], ["Adj", "Coeff"], ["Scale", "Factor"], ["Conv", "Coeff"]]);
  const kvHdr = `${pick(["Exp", "Est", "Proj"])} ${scaledW} ${outW}`;
  const selW = pick(["Sel", "Wtd", "Avg"]);
  const cycFmt = pick([(c) => `${c} Cycle`, (c) => `Cycle ${c}`, (c) => `${c} Cyc`]);

  // titles: two distinct fictional category names, optional fictional year
  const labelW = pick(["Category", "Segment", "Cohort", "Series", "Division", "Group", "Cluster"]);
  const greek = ["Gamma", "Delta", "Epsilon", "Zeta", "Theta", "Kappa", "Sigma", "Omega", "Lambda", "Rho"];
  const i1 = Math.floor(rng() * greek.length);
  let i2 = Math.floor(rng() * (greek.length - 1));
  if (i2 >= i1) i2 += 1;
  const year = 2006 + Math.floor(rng() * 24);
  const sm = rng();
  const mkTitle = (g) => sm < 0.35 ? `${labelW} ${g} — CY ${year}`
    : sm < 0.60 ? `${labelW} ${g} (${year})` : `${labelW} ${g}`;
  const titleA = mkTitle(greek[i1]);
  const titleB = mkTitle(greek[i2]);

  // ---- quirk toggles ---------------------------------------------------
  const satOn = rng() < 0.30;     // coeff column identical-value saturation
  const spacersOn = rng() < 0.35; // blank spacer row after each letter group (visual only)
  const footerOn = rng() < 0.45;  // stray footer token
  const footerTok = pick(["EXH SO-4", "SCH R-2", "FORM QT-07", "TAB C-3", "EXH B-12", "SCH K-9"]);

  // ---- header cells (line arrays; <br> in HTML, spaces in GT) ----------
  const HDRW = [
    keyOpt,
    [...unitOpt, "(000s)"],
    [grossW, outW, "($000s)"],
    [outW, "per", "Unit", "($s)"],
    coeffOpt,
    [scaledW, outW, "($000s)"],
    [scaledW, "per", "Unit", "($s)"],
  ].filter((_, i) => i !== dropIdx);
  const HDRhtml = HDRW.map((a) => a.join("<br>"));
  const GTHDR = HDRW.map((a) => a.join(" "));

  // ---- row keys: letter-major, cycle-minor -----------------------------
  const letters = "ABCDEFG".slice(0, nLetters).split("");
  const keys = [];
  for (const c of letters) for (let i = 1; i <= nCycles; i++) keys.push(`${keyPrefix}-0${i}${c}`);

  function genTable() {
    const unit0 = 2.4 + rng() * 3.0;
    const unitStep = 0.08 + rng() * 0.07;
    const gross0 = 180 + Math.floor(rng() * 580);
    const grossStep = 1 + Math.floor(rng() * 11);
    const coeff0 = 1.02 + rng() * 0.55;
    const coeffStep = (rng() - 0.35) * 0.012;
    const satVal = satOn
      ? (rng() < 0.5 ? "1.000" : (1 + Math.floor(rng() * 25) / 100).toFixed(3))
      : null;
    const outlierAt = !satOn && rng() < 0.55 ? 2 + Math.floor(rng() * (nRows - 4)) : -1;
    const rows = [];
    for (let i = 0; i < nRows; i++) {
      const unit = unit0 + i * unitStep;
      const gross = gross0 + i * grossStep;
      let coeffStr;
      if (satOn) {
        coeffStr = rng() < 0.87 ? satVal
          : (parseFloat(satVal) + (rng() - 0.5) * 0.09).toFixed(3);
      } else {
        let coeff = coeff0 + i * coeffStep + (rng() - 0.5) * 0.006;
        if (i === outlierAt) coeff += 0.08 + rng() * 0.05;
        coeffStr = coeff.toFixed(3);
      }
      const scaled = Math.round(gross * parseFloat(coeffStr));
      const full = [
        keys[i],
        unit.toFixed(3),
        fmt(gross),
        String(Math.round(gross / unit)),
        coeffStr,
        fmt(scaled),
        String(Math.round(scaled / unit)),
      ];
      rows.push(dropIdx === -1 ? full : full.filter((_, k) => k !== dropIdx));
    }
    // KV tail: kvCycles..1 signed percentages + Backward/Forward selections
    const kv = [];
    const cyc = [];
    for (let c = kvCycles; c >= 1; c--) {
      const v = rng() * 8 - 6.6;
      cyc.push(v);
      kv.push([cycFmt(c), `${v.toFixed(2)}%`]);
    }
    const back = (cyc[0] + cyc[1] + cyc[2]) / 3 + (rng() - 0.5) * 0.4;
    const fwd = (cyc[cyc.length - 2] + cyc[cyc.length - 1]) / 2 + (rng() - 0.5) * 0.4;
    kv.push([`${selW} Backward`, `${back.toFixed(1)}%`]);
    kv.push([`${selW} Forward`, `${fwd.toFixed(1)}%`]);
    return { rows, kv };
  }

  const tblA = genTable();
  const tblB = genTable(); // rendered twice, byte-identical

  // ---- layout: 2x2 grid, one empty quadrant, dynamic vertical fit ------
  let j = 0.9 + rng() * 0.2;            // font/size scale +/-10%
  const topTop = 0.32 + rng() * 0.12;
  const gap = 0.28 + rng() * 0.20;
  const hdrLines = Math.max(...HDRW.map((a) => a.length));
  const spacerCount = spacersOn ? nLetters - 1 : 0;
  const Hunit = 0.174 + hdrLines * 0.0778 + 0.03 + nRows * 0.104
    + spacerCount * 0.06 + 0.154 + (kvCycles + 2) * 0.092 + 0.05;
  j = Math.min(j, (10.5 - topTop - gap) / 2 / Hunit); // never overflow the page
  const H = j * Hunit;
  const bottomTop = topTop + H + gap;

  const baseW = [0.49, 0.42, 0.41, 0.42, 0.39, 0.445, 0.42].filter((_, i) => i !== dropIdx);
  const leftX = 0.44 + rng() * 0.14;
  const rightX = 4.26 + rng() * 0.20;

  // which quadrant is empty (TL favored, as in the family), where the unique
  // table sits; the other two filled quadrants share the duplicate
  const er = rng();
  const emptyQ = er < 0.40 ? 0 : er < 0.60 ? 1 : er < 0.80 ? 2 : 3;
  const filledQ = [0, 1, 2, 3].filter((q) => q !== emptyQ);
  const aQ = filledQ[Math.floor(rng() * 3)];
  const blocks = filledQ.map((q) => ({
    x: q % 2 === 0 ? leftX : rightX,
    y: q < 2 ? topTop : bottomTop,
    title: q === aQ ? titleA : titleB,
    t: q === aQ ? tblA : tblB,
  }));

  const lead = nCols - 3;
  function block(title, t) {
    let h = `<div class="ttl">${title}</div><table>`;
    h += baseW.map((w) => `<col style="width:${(w * j).toFixed(3)}in">`).join("");
    h += "<tr>" + HDRhtml.map((x) => `<th>${x}</th>`).join("") + "</tr>\n";
    let ri = 0;
    for (const r of t.rows) {
      h += "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>\n";
      ri += 1;
      if (spacersOn && ri % nCycles === 0 && ri < t.rows.length)
        h += `<tr class="sp"><td colspan="${nCols}"></td></tr>\n`;
    }
    h += `<tr class="kvh"><td colspan="${lead}"></td><td colspan="3">${kvHdr}</td></tr>\n`;
    for (const [k, v] of t.kv)
      h += `<tr class="kv"><td colspan="${lead}"></td><td colspan="2">${k}</td><td class="kvv">${v}</td></tr>\n`;
    return h + "</table>";
  }

  const I = (v) => `${(v * j).toFixed(3)}in`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  body { margin: 0; width: 8.5in; height: 10.96in; position: relative;
         font-family: Arial, Helvetica, sans-serif; color: #000; }
  .blk { position: absolute; }
  .ttl { font-weight: normal; font-size: ${(7.5 * j).toFixed(2)}pt; margin-bottom: ${I(0.07)}; }
  table { border-collapse: collapse; table-layout: fixed; }
  th, td { font-size: ${(5 * j).toFixed(2)}pt; font-weight: normal; text-align: left; padding: 0;
           vertical-align: bottom; overflow: visible; white-space: nowrap; }
  th { vertical-align: top; line-height: 1.12; padding-bottom: ${I(0.03)}; }
  td { height: ${I(0.104)}; }
  tr.sp td { height: ${I(0.06)}; }
  .kvh td { padding-top: ${I(0.05)}; }
  tr.kv td { height: ${I(0.092)}; }
  td.kvv { transform: translateX(-${I(0.10)}); }
  .ftr { position: absolute; left: 0.52in; top: 10.58in; font-size: ${(5 * j).toFixed(2)}pt; }
  </style></head><body>
  ${blocks.map((b) => `<div class="blk" style="left:${b.x.toFixed(3)}in;top:${b.y.toFixed(3)}in">${block(b.title, b.t)}</div>`).join("\n  ")}
  ${footerOn ? `<div class="ftr">${footerTok}</div>` : ""}
  </body></html>`;

  // ---- logical GT: main + KV tail per rendered table, reading order ----
  // (spacer rows and titles are NOT GT; duplicate table appears twice)
  const mainGT = (t) =>
    "<table>\n  <tr>\n" + GTHDR.map((h) => `    <th>${h}</th>`).join("\n") + "\n  </tr>\n"
    + t.rows.map((r) => "  <tr>\n" + r.map((c) => `    <td>${c}</td>`).join("\n") + "\n  </tr>").join("\n")
    + "\n</table>";

  const kvGT = (t) =>
    `<table>\n  <tr>\n    <th>${kvHdr}</th>\n    <th></th>\n  </tr>\n`
    + t.kv.map(([k, v]) => `  <tr>\n    <td>${k}</td>\n    <td>${v}</td>\n  </tr>`).join("\n")
    + "\n</table>";

  const gt = blocks.flatMap((b) => [mainGT(b.t), kvGT(b.t)]).join("\n\n");

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
