// FAMILY: large-cap proxy-statement "proposal summary" page — top nav strip, one
// sparse table (accent-color proposal-number gutter | title + justified bullet
// prose | accent AGAINST recommendation | page ref), light band shading, thin
// horizontal rules only, multicolor gradient footer rule + centered logo mark,
// generous lower whitespace. TRAINING-DATA generator: structure (row count 2-4,
// bullet counts, header labels, nav wording, shading quirk, font scale, palette)
// is seed-varied; all companies/report names/years are fictional pools.
// GT = one logical table, (1 + nProposals) rows x 4 cols => 12-20 cells.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---- fictional identity pools (no real issuers) ----
  const companies = [
    ["Trellis Dynamics, Inc.", "Trellis", "T"],
    ["Northwind Semiconductor Corporation", "Northwind", "N"],
    ["Beacon Digital, Inc.", "Beacon", "B"],
    ["Juniper Ridge Technologies, Inc.", "Juniper Ridge", "J"],
    ["Cobalt Peak Systems, Inc.", "Cobalt Peak", "C"],
    ["Meridian Loom Corporation", "Meridian", "M"],
    ["Harborlight Instruments, Inc.", "Harborlight", "H"],
    ["Vantage Orchard Group, Inc.", "Vantage", "V"],
  ];
  const [, co, initial] = pick(companies);
  const proxyYear = 2019 + Math.floor(rng() * 8); // 2019-2026, all fictional filings

  // ---- structural knobs ----
  const rRows = rng();
  const nProposals = rRows < 0.38 ? 2 : rRows < 0.72 ? 3 : 4;
  const navPage = 9 + Math.floor(rng() * 16);
  const fs =
    nProposals === 4 ? 0.86 + rng() * 0.1
    : nProposals === 3 ? 0.9 + rng() * 0.16
    : 0.9 + rng() * 0.2; // global font scale ~±10%
  const F = (base) => (base * fs).toFixed(2);
  const padV = nProposals === 4 ? 2.2 : 2.8;
  const wrapTop = (nProposals === 4 ? 27 : 28) + rng() * (nProposals === 4 ? 2 : 5);

  const c1w = 10 + rng() * 2.5;
  const c3w = 25 + rng() * 4;
  const c4w = 23 + rng() * 4;
  const c2w = 175 - c1w - c3w - c4w;

  const rShade = rng();
  const shadeMode = rShade < 0.55 ? "first" : rShade < 0.8 ? "alt" : "none";
  const roundMark = rng() < 0.35; // circular vs rounded-square logo mark

  const accent = pick(["#e63329", "#c8102e", "#d1342a", "#b5251f"]);
  const grad = pick([
    ["#5cb943", "#fcb92a", "#f4831c", "#df3b41", "#93409a", "#0aa0d8"],
    ["#2f9e44", "#f5c518", "#ef7f1a", "#d7263d", "#7b2d8b", "#1f7ac0"],
    ["#0b7285", "#37b24d", "#f2c14e", "#e8590c", "#c2255c", "#5f3dc4"],
  ]);
  const gradCss = `linear-gradient(to right, ${grad.join(", ")})`;

  const navSets = [
    ["Summary", "Governance", "Directors", "Compensation", "Proposals", "Other Information"],
    ["Summary", "Corporate Governance", "Board of Directors", "Executive Compensation", "Audit Matters", "Shareholder Proposals"],
    ["Overview", "Governance", "Directors", "Compensation", "Audit", "General Information"],
  ];
  const navItems = pick(navSets);
  const navRight = pick([
    `${proxyYear} Proxy Statement`,
    `Proxy Statement ${proxyYear}`,
    `${proxyYear} Annual Meeting &amp; Proxy Statement`,
    `Notice of ${proxyYear} Annual Meeting`,
  ]);

  // ---- header-label pools (col2 empty-th over the number gutter is the family quirk) ----
  const h1 = pick(["Proposal", "Proposal No.", "Item"]);
  const h2 = rng() < 0.65 ? "" : pick(["Summary of Proposal", "Description"]);
  const h3 = pick([
    "Board Recommendation",
    "Board's Recommendation",
    "Board Voting Recommendation",
    "Our Board's Recommendation",
  ]);
  const h4 = pick(["Page Reference", "Page", "See Page", "For More Information"]);
  const recWord = pick(["AGAINST", "Vote AGAINST"]);

  // ---- topic pool: board AGAINST responses to shareholder proposals (all fictional) ----
  const topics = [
    (r) => {
      const yrA = proxyYear - 1 - Math.floor(r() * 2);
      const rep = ["People Report", "Inclusion and Belonging Report", "Workforce Representation Report"][Math.floor(r() * 3)];
      return {
        title: "Report on Median Pay Gaps",
        b1: `We maintain a comprehensive pay equity program at every level of the Company, and our annual independent audit confirmed in ${yrA} that employees of all genders globally, and of all races and ethnicities in the United States, are paid equitably for similar work, covering both our hourly and salaried workforce.`,
        b2: `We report on our progress on representation annually in our ${rep}, and we believe our current disclosures represent a more meaningful approach to pay equity and representation than the additional median statistics requested in the proposal.`,
      };
    },
    (r) => {
      const pct = [10, 15, 20][Math.floor(r() * 3)];
      const pct2 = 50 + Math.floor(r() * 25);
      return {
        title: "Amendments to Special Meeting Rights",
        b1: `Our special meeting bylaws were adopted after careful consideration of the perspectives offered by a broad cross-section of our shareholders and permit holders of ${pct}% of outstanding shares to call a special meeting, providing a meaningful opportunity for shareholders to act between annual meetings.`,
        b2: `${co} has a robust shareholder engagement program and, over the course of our engagement in calendar year ${proxyYear - 1} with shareholders representing over ${pct2}% of institutional shares held, no participating shareholders raised concerns with, or requested modifications to, the current ownership threshold.`,
      };
    },
    (r) => {
      const nAll = 9 + Math.floor(r() * 4);
      return {
        title: "Independent Board Chair Requirement",
        b1: `Our Board believes that retaining the flexibility to determine the appropriate leadership structure serves shareholders better than a rigid policy, and our strong Lead Independent Director role carries clearly defined authority over meeting agendas, executive sessions, and the annual Board evaluation under our Corporate Governance Guidelines.`,
        b2: `${nAll - 1} of our ${nAll} directors are independent, each of our standing committees is composed entirely of independent directors, and the independent directors met in executive session at every regularly scheduled Board meeting during fiscal ${proxyYear - 1}.`,
      };
    },
    (r) => {
      const amt = [25, 50, 100][Math.floor(r() * 3)];
      return {
        title: "Report on Political Contributions Alignment",
        b1: `We publish an annual Political Activities Report describing our public policy priorities, our trade association memberships involving dues over $${amt},000, and the governance process our Government Affairs team follows, which is overseen directly by the Nominating and Governance Committee of the Board.`,
        b2: `The additional alignment analysis requested by the proposal would impose significant administrative burden without providing shareholders meaningful new information beyond our existing disclosures, which were rated in the top quartile of large-cap companies in the most recent independent benchmarking of corporate political disclosure.`,
      };
    },
    (r) => {
      const n = 700 + Math.floor(r() * 500);
      const k = 30 + Math.floor(r() * 25);
      const rep = ["Responsible Sourcing Report", "Supply Chain Standards Report", "Supplier Accountability Report"][Math.floor(r() * 3)];
      return {
        title: "Report on Supply Chain Working Conditions",
        b1: `We assess working conditions across our supply base each year, completing ${n} independent audits covering facilities in ${k} countries in fiscal ${proxyYear - 1}, and we publish the results, corrective action rates, and supplier terminations in our annual ${rep}.`,
        b2: `Our Supplier Code of Conduct is aligned with international labor conventions and applies to all suppliers as a condition of doing business with ${co}, and we believe the report requested by the proposal would substantially duplicate disclosures we already provide.`,
      };
    },
    (r) => {
      const x = 1 + Math.floor(r() * 2);
      return {
        title: "Shareholder Ratification of Severance Agreements",
        b1: `Our existing executive change-in-control arrangements are double-trigger, do not include excise tax gross-ups, and are capped at ${x}.99 times the sum of base salary and target bonus, a structure the Compensation Committee reviews annually against peer market practice with its independent consultant.`,
        b2: `Requiring advance shareholder ratification of individual severance arrangements would place ${co} at a competitive disadvantage in recruiting and retaining senior executives and would limit the Compensation Committee's ability to respond quickly to critical retention needs.`,
      };
    },
    (r) => {
      const pctT = 60 + Math.floor(r() * 30);
      return {
        title: "Report on Climate Lobbying Alignment",
        b1: `We publish an annual Climate Policy Engagement Review describing how our direct advocacy and the positions of our principal trade associations align with our public emissions-reduction commitments, covering associations representing approximately ${pctT}% of our total membership dues.`,
        b2: `The Nominating and Governance Committee oversees our political and policy engagement activities, and our Board believes the additional bespoke analysis requested by the proposal would not provide shareholders decision-useful information beyond these existing disclosures.`,
      };
    },
    (r) => {
      const mult = [6, 8, 10][Math.floor(r() * 3)];
      return {
        title: "Adopt Share Retention Policy for Executives",
        b1: `Our stock ownership guidelines already require the Chief Executive Officer to hold shares valued at ${mult} times annual base salary, and all other executive officers to hold a multiple of salary, with unvested awards excluded from the calculation and compliance reviewed annually by the Compensation Committee.`,
        b2: `Our insider trading policy prohibits hedging and pledging of Company securities by executive officers and directors, and the Compensation Committee believes the rigid post-employment retention period requested by the proposal would place ${co} outside prevailing market practice among our peers.`,
      };
    },
  ];

  const order = shuffle(topics.map((_, i) => i)).slice(0, nProposals);
  const chosen = order.map((i) => topics[i](rng));

  // optional short third bullet ("closer") — never on 4-row pages (keeps the page inside the footer rule)
  const closers = [
    `After careful consideration, the Board has concluded that the actions requested by this proposal are not in the best interests of ${co} or our shareholders.`,
    `A substantially similar proposal was rejected by shareholders holding a majority of the votes cast at our ${proxyYear - 1} annual meeting.`,
    `We will continue to engage with our shareholders on this topic as part of our year-round outreach program.`,
    `Implementation of the proposal would divert resources from initiatives that our Board believes better serve long-term shareholder value.`,
    `Our Nominating and Governance Committee reviewed the proposal and concluded that it would not provide meaningful additional benefit to shareholders.`,
    `The Board therefore recommends that shareholders vote against this proposal for the reasons described beginning on the page listed.`,
  ];
  const closerOrder = shuffle(closers);
  const closerProb = nProposals === 4 ? 0 : nProposals === 3 ? 0.5 : 0.6;
  let closerIdx = 0;
  for (const t of chosen) {
    t.b3 = rng() < closerProb ? closerOrder[closerIdx++ % closerOrder.length] : null;
  }

  const num0 = 4 + Math.floor(rng() * 6); // consecutive proposal numbers
  const nums = chosen.map((_, i) => num0 + i);
  const pages = []; // increasing page references
  let pp = 58 + Math.floor(rng() * 40);
  for (let i = 0; i < chosen.length; i++) {
    pages.push(pp);
    pp += 3 + Math.floor(rng() * 6);
  }

  const shaded = (i) =>
    (shadeMode === "first" && i === 0) || (shadeMode === "alt" && i % 2 === 0);

  const proseCell = (t) =>
    `<div class="pt">${t.title}</div>` +
    `<div class="b"><span class="bm">•</span>${t.b1}</div>` +
    `<div class="b"><span class="bm">•</span>${t.b2}</div>` +
    (t.b3 ? `<div class="b"><span class="bm">•</span>${t.b3}</div>` : "");

  const bodyRows = chosen
    .map(
      (t, i) =>
        `<tr class="${shaded(i) ? "sh" : "pl"}"><td class="num">${nums[i]}</td>` +
        `<td class="prose">${proseCell(t)}</td>` +
        `<td class="rec">${recWord}</td><td class="ref">${pages[i]}</td></tr>`
    )
    .join("\n    ");

  const navHtml = navItems
    .map((it, i) => `<span class="it${i === 0 ? " active" : ""}">${it}</span>`)
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter portrait; margin: 0; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a;
         width: 215.9mm; height: 279mm; position: relative; }
  .nav { position: absolute; top: 12mm; left: 20.5mm; right: 20.5mm;
         display: flex; align-items: baseline; font-size: ${F(7.5)}pt; color: #1a1a1a; }
  .nav .it { margin-right: 9mm; }
  .nav .active { font-weight: bold; padding-bottom: 2.5px;
    background: ${gradCss} bottom left / 100% 1.6px no-repeat; }
  .nav .right { margin-left: auto; margin-right: 0; }
  .nav .pg { font-weight: bold; font-size: ${F(8.5)}pt; margin-left: 4mm; }
  .wrap { position: absolute; top: ${wrapTop.toFixed(1)}mm; left: 20.5mm; width: 175mm; }
  table { border-collapse: collapse; table-layout: fixed; width: 175mm; margin: 0; }
  col.c1 { width: ${c1w.toFixed(1)}mm; } col.c2 { width: ${c2w.toFixed(1)}mm; }
  col.c3 { width: ${c3w.toFixed(1)}mm; } col.c4 { width: ${c4w.toFixed(1)}mm; }
  th { font-size: ${F(7.5)}pt; font-weight: bold; text-align: left; vertical-align: bottom;
       padding: 0 0 4pt 0; border-bottom: 0.75pt solid #8c8c8c; line-height: 1.25; }
  th.hnum { white-space: nowrap; }
  th.href { text-align: center; }
  td { vertical-align: top; padding: ${padV}mm 0 ${padV}mm 0; font-size: ${F(9)}pt;
       border-bottom: 0.5pt solid #cbcbcb; }
  tr.sh td { background: #ececec; }
  td.num { font-size: ${F(10.5)}pt; font-weight: bold; color: ${accent}; padding-left: 1.2mm;
           line-height: 1.1; }
  td.prose { padding-right: 0; }
  .pt { font-weight: bold; font-size: ${F(9.5)}pt; margin-bottom: 1.8mm; }
  .b { position: relative; padding-left: 2.8mm; text-align: justify; line-height: 1.42;
       margin-top: 1.8mm; }
  .bm { position: absolute; left: 0.2mm; }
  td.rec { font-weight: bold; color: ${accent}; padding-left: 0.5mm; }
  td.ref { text-align: center; color: #58585b; }
  .rule { position: absolute; left: 20.5mm; right: 20.5mm; bottom: 15mm; height: 0.9mm;
    background: ${gradCss}; }
  .logo { position: absolute; bottom: 5mm; left: 0; right: 0; text-align: center; }
  .mark { display: inline-block; width: 4.6mm; height: 4.6mm;
          border-radius: ${roundMark ? "50%" : "1.2mm"};
          background: #3a3a3c; color: #fff; font-weight: bold; font-size: ${F(8.5)}pt;
          line-height: 4.6mm; text-align: center; }
  </style></head><body>
  <div class="nav">
    ${navHtml}
    <span class="it right">${navRight}<span class="pg">${navPage}</span></span>
  </div>
  <div class="wrap"><table>
    <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
    <tr><th class="hnum">${h1}</th><th>${h2}</th><th>${h3}</th><th class="href">${h4}</th></tr>
    ${bodyRows}
  </table></div>
  <div class="rule"></div>
  <div class="logo"><span class="mark">${initial}</span></div>
  </body></html>`;

  const proseGT = (t) =>
    `${t.title} • ${t.b1} • ${t.b2}` + (t.b3 ? ` • ${t.b3}` : "");
  const gtRows = chosen
    .map(
      (t, i) => `  <tr>
    <td>${nums[i]}</td>
    <td>${proseGT(t)}</td>
    <td>${recWord}</td>
    <td>${pages[i]}</td>
  </tr>`
    )
    .join("\n");
  const gt = `<table>
  <tr>
    <th>${h1}</th>
    <th>${h2}</th>
    <th>${h3}</th>
    <th>${h4}</th>
  </tr>
${gtRows}
</table>`;

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
