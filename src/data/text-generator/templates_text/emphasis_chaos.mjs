// FAMILY GENERATOR — "emphasis_chaos": dense report page (EN or JP per seed) that
// stress-tests MIXED inline emphasis: underline, bold, italic, strikethrough, and
// bold+underline combos scattered through dense prose. Modeled on the genre of a
// government/economic-report page whose ParseBench failure mode is emphasis (FORMAT)
// fidelity. All content is freshly written and fictional (invented cities, facilities,
// organizations); no sentence from the anchor is reproduced.
//
// Drift knobs (seed-driven):
//   lang EN/JP, 3 discrete layout modes (0 boxed-lead + 2 figures, 1 mid-page sidebar
//   box + optional figure, 2 numbered subsections + bottom box), emphasis density
//   0.13-0.38 (box paragraphs run hotter), per-type emphasis weights, font family
//   within class (Mincho/Gothic; Georgia/Times/Arial), font size / line-height /
//   margins jitter, bullet count 5-8 and one- vs two-column box, figure heights,
//   caption punctuation style, figure-number base, page-number style, optional
//   running header, optional sentence drops per paragraph.
//
// GT = markdown text in logical reading order; every emphasis span mirrored exactly
// (**bold**, *italic*, <u>underline</u>, ~~strike~~, **<u>combo</u>**). Punctuation is
// kept OUTSIDE emphasis wrappers so CommonMark flanking rules always hold (incl. CJK).

export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const fwd = (n) => String.fromCharCode(0xff10 + n); // full-width digit

  const lang = rng() < 0.5 ? "ja" : "en";
  const mode = Math.floor(rng() * 3); // 0 boxed-lead, 1 mid sidebar, 2 numbered subsections
  const joiner = lang === "ja" ? "" : " ";

  // ---- typography knobs ----
  const fs = lang === "ja" ? 9.2 + rng() * 1.2 : 9.0 + rng() * 1.2;
  const lh = 1.32 + rng() * 0.14;
  const mSide = 15 + rng() * 5;
  const mTop = 12 + rng() * 5;
  const font =
    lang === "ja"
      ? rng() < 0.65
        ? `"Hiragino Mincho ProN","Yu Mincho",serif`
        : `"Hiragino Sans","Yu Gothic",sans-serif`
      : pick([
          `Georgia,"Times New Roman",serif`,
          `"Times New Roman",Times,serif`,
          `Arial,Helvetica,sans-serif`,
        ]);
  const enBlockStyle = rng() < 0.45; // EN: block paragraphs vs indented
  const indent = lang === "ja" ? "1em" : enBlockStyle ? "0" : "1.6em";
  const pgap = lang === "ja" ? (rng() < 0.5 ? 0 : 2) : enBlockStyle ? 4.5 : 1.5;
  const bw = (1 + rng() * 1.2).toFixed(1);

  // ---- emphasis knobs ----
  const density = 0.13 + rng() * 0.25;
  const boxDensity = Math.min(0.55, density * (1.5 + rng() * 0.8));
  const wts = [
    ["u", 0.25 + rng() * 0.4],
    ["b", 0.22 + rng() * 0.35],
    ["bu", 0.08 + rng() * 0.25],
    ["i", 0.05 + rng() * 0.13],
    ["s", 0.03 + rng() * 0.08],
  ];
  const pickType = () => {
    const tot = wts.reduce((s, [, w]) => s + w, 0);
    let r = rng() * tot;
    for (const [t, w] of wts) if ((r -= w) <= 0) return t;
    return "u";
  };

  const PUNCT = "\\s、。，．・：；（）()「」『』,;:.!?'\"—–-";
  const LEAD_RE = new RegExp(`^[${PUNCT}]+`);
  const TRAIL_RE = new RegExp(`[${PUNCT}]+$`);

  function emphasizePara(sentences, dens) {
    const spans = [];
    let prevE = false;
    for (const sent of sentences) {
      for (const chunk of sent) {
        const lm = LEAD_RE.exec(chunk);
        const lead = lm ? lm[0] : "";
        const rest = chunk.slice(lead.length);
        const tm = TRAIL_RE.exec(rest);
        const trail = tm ? tm[0] : "";
        const core = rest.slice(0, rest.length - trail.length);
        let e = null;
        if (!prevE && core.length >= 2 && rng() < dens) e = pickType();
        prevE = e !== null;
        spans.push({ lead, core, trail, emph: e });
      }
    }
    return spans;
  }

  const H = {
    u: (c) => `<u>${c}</u>`,
    b: (c) => `<b>${c}</b>`,
    bu: (c) => `<b><u>${c}</u></b>`,
    i: (c) => `<i>${c}</i>`,
    s: (c) => `<s>${c}</s>`,
  };
  const M = {
    u: (c) => `<u>${c}</u>`,
    b: (c) => `**${c}**`,
    bu: (c) => `**<u>${c}</u>**`,
    i: (c) => `*${c}*`,
    s: (c) => `~~${c}~~`,
  };
  const spanHtml = (sp) => sp.lead + (sp.emph ? H[sp.emph](sp.core) : sp.core) + sp.trail;
  const spanMd = (sp) => sp.lead + (sp.emph ? M[sp.emph](sp.core) : sp.core) + sp.trail;
  const paraHtml = (spans) => spans.map(spanHtml).join(joiner);
  const paraMd = (spans) => spans.map(spanMd).join(joiner);

  function ensureAllTypes(paraSpanArrays) {
    const present = new Set();
    for (const ps of paraSpanArrays) for (const sp of ps) if (sp.emph) present.add(sp.emph);
    for (const t of ["u", "b", "bu", "i", "s"]) {
      if (present.has(t)) continue;
      for (let tries = 0; tries < 80; tries++) {
        const ps = paraSpanArrays[Math.floor(rng() * paraSpanArrays.length)];
        const i = Math.floor(rng() * ps.length);
        const sp = ps[i];
        if (sp.emph || sp.core.length < 2) continue;
        if (i > 0 && ps[i - 1].emph) continue;
        if (i < ps.length - 1 && ps[i + 1].emph) continue;
        sp.emph = t;
        break;
      }
    }
  }

  const thin = (par) => {
    if (par.length >= 4 && rng() < 0.4) par.splice(1 + Math.floor(rng() * (par.length - 2)), 1);
    else if (par.length === 3 && rng() < 0.15) par.splice(1, 1);
    return par;
  };

  // ================= content =================
  let head, subTitles, paras, bullets, boxCap, boxSrc, figDefs, footer, runHead;
  const figBase = ri(3, 24);
  const pnum = ri(2, 48);

  if (lang === "ja") {
    const cities = ["浜津", "北栄", "港南", "若洲", "東渚", "旭浜"];
    const city = pick(cities);
    const rest1 = cities.filter((c) => c !== city);
    const ncity = pick(rest1);
    const ncity2 = pick(rest1.filter((c) => c !== ncity));
    const proj = pick([
      `${city}臨海国際物流ターミナル`,
      `${city}ゲートウェイ物流パーク`,
      `${city}港東国際物流拠点`,
    ]);
    const fac2 = pick(["第二コンテナ埠頭", "中央流通加工センター", "臨港鉄道貨物駅"]);
    const fac3 = pick(["広域配送センター", "冷凍冷蔵物流棟", "モーダルシフト対応ヤード"]);
    const road = pick(["臨港幹線道路", "湾岸連絡道路", "港北アクセス道路"]);
    const org = pick([`${city}湾広域振興機構`, "臨海部開発推進協議会", "広域物流政策研究所"]);
    const event = pick(["国際物流総合展", "全国港湾振興大会", "世界食品流通会議"]);
    const y1 = ri(2027, 2031);
    const y2 = y1 + ri(1, 3);
    const area = ri(60, 180);
    const capV = ri(800, 2400);
    const impact = ri(1400, 5200);
    const jobs = ri(3, 9);
    const delay = ri(2, 3);
    const yr = ri(2024, 2026);
    const mo = ri(1, 12);

    head = `（${fwd(ri(2, 9))}）${pick([
      `${proj}の整備進捗と広域連携による物流機能強化への期待`,
      `臨海部開発を契機とする官民連携による物流拠点形成に向けて`,
      `${city}圏における物流基盤整備の現状と課題`,
    ])}`;
    subTitles = ["整備の進捗", "直面する課題", "関係主体に期待される役割", "今後の展望", "圏域内の調整", "留意事項"];

    paras = [
      [
        [`${city}市が推進する`, `${proj}構想`, `は、`, `${y1}年度の`, `第一期区画の供用開始`, `に向けて`, `整備が本格化している。`],
        [`計画区域は`, `臨海部の約${area}ヘクタール`, `に及び、`, `完成時には`, `年間${capV}万トン規模の貨物`, `を取り扱う`, `広域物流の結節点`, `となることが見込まれる。`],
        [`既存の${city}港旧埠頭地区に加え、`, `${fac2}や${fac3}の整備`, `が並行して進められており、`, `周辺自治体からは`, `雇用創出や税収増への期待`, `が高まっている。`],
        [`${org}の試算によれば、`, `関連投資の経済波及効果`, `は${impact}億円に上り、`, `建設段階だけで`, `延べ${jobs}万人の雇用`, `が生じるとされる。`],
      ],
      [
        [`一方で、`, `アクセス道路の渋滞対策`, `や`, `労働力の確保、`, `周辺環境への負荷軽減`, `など、`, `解決すべき課題`, `も少なくない。`],
        [`特に`, `${road}の拡幅工事`, `は、`, `用地取得の遅れ`, `から`, `当初計画より${delay}年程度`, `後ろ倒しとなる公算が大きく、`, `開業初期の輸送能力`, `を制約する要因となり得る。`],
        [`また、`, `倉庫業・運送業の人手不足`, `は全国的にも深刻であり、`, `自動化設備の導入`, `や`, `外国人材の受け入れ体制の整備`, `が急務である。`],
        [`近隣の${ncity}市や${ncity2}市でも`, `物流用地の引き合い`, `が強まっており、`, `賃料や地価の上昇傾向`, `が鮮明になりつつある。`],
      ],
      [
        [`事業者には、`, `単なる保管機能にとどまらず、`, `流通加工や検品・梱包`, `など`, `付加価値サービスの拡充`, `に注力するとともに、`, `共同配送の枠組みづくり`, `を通じた効率化が求められる。`],
        [`産業界には、`, `施設利用の長期契約`, `や`, `共同出資による専用棟の整備`, `など、`, `安定的な需要の下支え`, `という形で関与できる。`],
        [`自治体には、`, `規制緩和や税制上の優遇措置、`, `広域インフラの計画的な整備`, `を通じて、`, `民間投資を呼び込む環境づくり`, `が期待される。`],
      ],
      [
        [`${y2}年に予定される`, `${event}の開催`, `は、`, `地域の知名度向上`, `と`, `新規需要の獲得`, `に向けた好機である。`],
        [`官民が連携し、`, `${city}圏の地理的優位性`, `を国内外の荷主企業に`, `積極的に発信していく`, `ことが、`, `構想実現への確かな一歩`, `となろう。`],
        [`ターミナルの開業を一過性の出来事に終わらせず、`, `継続的な企業誘致`, `と`, `定住促進`, `につなげる視点が欠かせない。`],
      ],
      [
        [`なお、`, `${ncity}市においても`, `類似の物流団地構想`, `が浮上しており、`, `圏域内での機能分担`, `をめぐる調整が今後の論点となる。`],
        [`過度な誘致競争は、`, `賃料水準の低下`, `や`, `投資回収の長期化`, `を招くおそれがあるため、`, `広域での需給見通しの共有`, `が欠かせない。`],
        [`${org}が${yr}年${mo}月に公表した`, `中間とりまとめ`, `では、`, `圏域全体を単一の市場として捉える視点`, `が強調されている。`],
      ],
      [
        [`本節の分析は、`, `${yr}年${mo}月時点で入手可能な公表資料`, `に基づくものであり、`, `事業計画の変更`, `により`, `前提条件が変わり得る点`, `に留意が必要である。`],
        [`圏域の将来像を共有するため、`, `定量的な需要予測の定期的な更新`, `と`, `進捗の透明性の高い開示`, `が望まれる。`],
      ],
    ];

    bullets = shuffle([
      `・第一期区画の供用開始時期を${y1}年度から前倒しすべきとの意見があった。`,
      `・アクセス道路の整備が需要増に追いついておらず、朝夕の渋滞が既に顕在化している。`,
      `・冷凍・冷蔵倉庫の需給が逼迫しており、温度帯別の整備計画を明確に示すべきである。`,
      `・災害時の代替輸送ルートの確保について、県域を越えた調整が必要である。`,
      `・人材確保のため、寮や保育施設など就業環境の整備を一体的に進めるべきである。`,
      `・脱炭素化の要請を踏まえ、屋根置き太陽光や次世代燃料への対応を標準仕様とすべきである。`,
      `・中小事業者が利用しやすい共同利用型の倉庫区画を確保すべきとの指摘があった。`,
      `・入出庫手続きの電子化に向け、情報システムの標準化を推進する必要がある。`,
    ]).slice(0, ri(5, 8));
    const capSep = pick(["　", " "]);
    boxCap = `図表 ${figBase}${capSep}${pick([
      `${proj}に関する検討会意見（抜粋）`,
      `有識者ヒアリングにおける主な指摘（抜粋）`,
      `${org}検討部会の主な意見（抜粋）`,
    ])}`;
    boxSrc = `（出所）${org}（${yr}年${mo}月）`;
    const figCaps = shuffle([
      `${proj}の完成予想図`,
      `計画区域の位置図`,
      `${fac2}の整備イメージ`,
      `年間取扱貨物量の見通し`,
    ]);
    const figSrcs = shuffle([
      `（出所）${city}市港湾局資料`,
      `（資料提供）${org}`,
      `（出所）${org}（${yr}年${mo}月）`,
    ]);
    figDefs = [0, 1].map((i) => ({
      cap: `図表 ${figBase + 1 + i}${capSep}${figCaps[i]}`,
      src: figSrcs[i % figSrcs.length],
    }));
    footer = pick([`- ${pnum} -`, `${pnum}`, `－ ${pnum} －`]);
    runHead = rng() < 0.35 ? `第${fwd(ri(1, 5))}章　地域経済の動向` : null;
  } else {
    const cities = ["Marbury", "Kestrel Bay", "North Halden", "Verrow", "Ashport", "Dunmere"];
    const city = pick(cities);
    const ncity = pick(cities.filter((c) => c !== city));
    const proj = pick([
      `${city} Gateway Logistics District`,
      `${city} Intermodal Freight Terminal`,
      `${city} Riverside Trade Park`,
    ]);
    const site = pick(["former railway yards", "decommissioned steelworks", "reclaimed dockside land"]);
    const fac2 = pick(["Central Transload Building", "Eastern Container Yard", "Rail Freight Interchange"]);
    const fac3 = pick(["Regional Distribution Centre", "Cold-Chain Warehouse Block", "Inland Customs Depot"]);
    const road = pick(["A312 orbital route", "Harbour Link Road", "Northern Freight Corridor"]);
    const org = pick([`${city} Regional Development Board`, "Institute for Freight Economics", "Corridor Planning Council"]);
    const event = pick(["International Logistics Expo", "National Ports Congress", "World Supply-Chain Forum"]);
    const month = pick(["February", "May", "September", "November"]);
    const season = pick(["spring", "summer", "autumn"]);
    const y1 = ri(2027, 2031);
    const y2 = y1 + ri(1, 3);
    const area = ri(45, 160);
    const capV = ri(3, 11);
    const impact = (1.2 + Math.round(rng() * 36) / 10).toFixed(1);
    const jobs = ri(40, 90);
    const delay = pick(["two", "three"]);
    const yr = ri(2024, 2026);

    const hn = pick([`(${ri(2, 9)}) `, `${ri(2, 9)}.${ri(1, 4)} `, ``]);
    head = `${hn}${pick([
      `Public–private cooperation and the outlook for the ${proj}`,
      `Progress on the ${proj} and the case for regional coordination`,
      `Freight-capacity constraints and the ${city} corridor response`,
    ])}`;
    subTitles = [
      "Progress to date",
      "Outstanding constraints",
      "Roles for stakeholders",
      "Outlook",
      "Coordination within the corridor",
      "Caveats",
    ];

    paras = [
      [
        [`The ${proj},`, `a ${area}-hectare redevelopment`, `on the ${site},`, `is scheduled to open`, `its first phase`, `in ${season} ${y1}.`],
        [`Once complete,`, `the district is expected to handle`, `roughly ${capV} million tonnes of freight annually,`, `placing it among the largest`, `inland logistics hubs`, `in the region.`],
        [`Alongside the terminal itself,`, `construction of the ${fac2}`, `and the ${fac3}`, `is proceeding on schedule,`, `and neighbouring municipalities anticipate`, `substantial gains in employment and tax revenue.`],
        [`A study by the ${org} estimates`, `total economic spillover of $${impact} billion,`, `with construction alone generating`, `${jobs} thousand person-years of employment.`],
      ],
      [
        [`Significant obstacles remain,`, `however,`, `including congestion on arterial roads,`, `a tightening labour market,`, `and unresolved questions`, `over environmental mitigation.`],
        [`Widening of the ${road}`, `has slipped by roughly ${delay} years`, `owing to delays in land acquisition,`, `and is likely to constrain throughput`, `during the opening period.`],
        [`Warehouse operators across the country`, `report acute staffing shortages,`, `making investment in automation`, `and structured recruitment programmes`, `a matter of urgency.`],
        [`Demand for logistics land in ${ncity}`, `is meanwhile firming,`, `and rents along the corridor`, `have begun to climb.`],
      ],
      [
        [`Operators should move beyond`, `simple storage services`, `toward value-added activities`, `such as inspection, kitting and light assembly,`, `while building shared-delivery frameworks`, `to lift utilisation.`],
        [`Industry can contribute`, `through long-term capacity contracts,`, `joint investment in dedicated facilities,`, `and sponsorship of workforce training schemes.`],
        [`For its part,`, `the regional government is expected`, `to streamline permitting,`, `extend targeted tax incentives,`, `and sequence public infrastructure works`, `so that private investment is not left stranded.`],
      ],
      [
        [`The ${event},`, `to be hosted in ${y2},`, `offers a rare opportunity`, `to raise the district's profile`, `among international shippers.`],
        [`Sustained cooperation between`, `public and private partners`, `will determine whether the ${city} region`, `converts its geographic advantage`, `into durable growth.`],
        [`The opening itself should be treated`, `not as an end point`, `but as the start of a longer effort`, `to anchor tenants and skilled workers`, `in the corridor.`],
      ],
      [
        [`A rival scheme in ${ncity}`, `has meanwhile been mooted,`, `raising questions over`, `how functions should be divided`, `within the wider corridor.`],
        [`Unchecked competition for tenants`, `risks depressing rents`, `and stretching payback periods,`, `so a shared regional demand outlook`, `is indispensable.`],
        [`The interim report published by the ${org}`, `in ${month} ${yr}`, `urges stakeholders to treat`, `the corridor as a single market.`],
      ],
      [
        [`The analysis in this section`, `draws on material published`, `up to ${month} ${yr},`, `and its assumptions may shift`, `as the business plan evolves.`],
        [`Regular updates of the demand forecast,`, `published on a transparent basis,`, `would help stakeholders`, `share a common view`, `of the corridor's future.`],
      ],
    ];

    bullets = shuffle([
      `- Phase 1 opening should be brought forward from ${y1} if utility works permit.`,
      `- Peak-hour congestion on approach roads is already evident and will worsen without demand management.`,
      `- Cold-chain capacity is under-provisioned; a temperature-tier plan should be published.`,
      `- Cross-county coordination on alternative freight routes is required for resilience planning.`,
      `- Worker housing and childcare provision should be planned jointly with the terminal itself.`,
      `- Rooftop solar and alternative-fuel readiness should be standard in all new sheds.`,
      `- Shared-user warehouse bays should be reserved for smaller operators.`,
      `- Gate procedures should be digitised under a common data standard.`,
    ]).slice(0, ri(5, 8));
    const capSep = pick([" ", ". ", ": "]);
    boxCap = `Figure ${figBase}${capSep === " " ? " " : capSep}${pick([
      "Summary of panel findings (extract)",
      "Key points from stakeholder hearings (extract)",
      "Advisory committee observations (extract)",
    ])}`;
    boxSrc = `Source: ${org} (${month} ${yr})`;
    const figCaps = shuffle([
      `Artist's impression of the ${proj}`,
      `Location of the planned district`,
      `Indicative layout of the ${fac2}`,
      `Projected annual throughput`,
    ]);
    const figSrcs = shuffle([`Source: ${city} City Council`, `Source: ${org}`, `Image: ${proj} consortium`]);
    figDefs = [0, 1].map((i) => ({
      cap: `Figure ${figBase + 1 + i}${capSep === " " ? " " : capSep}${figCaps[i]}`,
      src: figSrcs[i % figSrcs.length],
    }));
    footer = pick([`- ${pnum} -`, `${pnum}`, `Page ${pnum}`]);
    runHead = rng() < 0.35 ? `${org} — Regional Outlook ${yr}` : null;
  }

  // ---- thin optional sentences, then emphasize ----
  for (const p of paras) thin(p);
  const nBoxParas = mode === 0 ? 2 : 0; // first N paragraphs live in the lead box (hot density)
  const spansPerPara = paras.map((p, i) => emphasizePara(p, i < nBoxParas ? boxDensity : density));
  ensureAllTypes(spansPerPara);

  // ---- assemble ----
  const htmlParts = [];
  const gtBlocks = [];
  const add = (h, g) => {
    if (h) htmlParts.push(h);
    if (g != null) gtBlocks.push(g);
  };
  const P = (i) => add(`<p>${paraHtml(spansPerPara[i])}</p>`, paraMd(spansPerPara[i]));
  const SUB = (i) => {
    const t = lang === "ja" ? `（${fwd(i + 1)}）${subTitles[i]}` : `(${i + 1}) ${subTitles[i]}`;
    add(`<div class="sub">${t}</div>`, `## ${t}`);
  };
  const blDiv = (b) => `<div class="bl">${b}</div>`;
  const boxBlock = (twoCol) => {
    add(`<div class="cap">${boxCap}</div>`, boxCap);
    if (twoCol) {
      const half = Math.ceil(bullets.length / 2);
      add(
        `<div class="box cols"><div class="col">${bullets.slice(0, half).map(blDiv).join("")}</div><div class="col">${bullets.slice(half).map(blDiv).join("")}</div></div>`,
        bullets.join("\n"),
      );
    } else {
      add(`<div class="box">${bullets.map(blDiv).join("")}</div>`, bullets.join("\n"));
    }
    add(`<div class="src">${boxSrc}</div>`, boxSrc);
  };
  // .ph flex-grows into leftover page space (clamped) so every mode fills the page
  const figBlock = (f, maxH) =>
    `<div class="fig"><div class="cap">${f.cap}</div><div class="ph" style="max-height:${maxH}mm"></div><div class="src">${f.src}</div></div>`;

  if (runHead) add(`<div class="rh">${runHead}</div>`, runHead);
  add(`<div class="hd">${head}</div>`, `# ${head}`);

  if (mode === 0) {
    add(
      `<div class="lead"><p>${paraHtml(spansPerPara[0])}</p><p style="margin-bottom:0">${paraHtml(spansPerPara[1])}</p></div>`,
      null,
    );
    gtBlocks.push(paraMd(spansPerPara[0]), paraMd(spansPerPara[1]));
    P(2);
    P(3);
    P(4);
    boxBlock(true);
    const h = ri(45, 60);
    add(`<div class="figrow">${figBlock(figDefs[0], h)}${figBlock(figDefs[1], h)}</div>`, null);
    for (const f of figDefs) gtBlocks.push(f.cap, f.src);
  } else if (mode === 1) {
    P(0);
    P(1);
    boxBlock(false);
    P(2);
    P(3);
    P(4);
    if (rng() < 0.5) P(5);
    add(`<div class="fig1">${figBlock(figDefs[0], ri(45, 70))}</div>`, null);
    gtBlocks.push(figDefs[0].cap, figDefs[0].src);
  } else {
    for (let i = 0; i < 6; i++) {
      SUB(i);
      P(i);
    }
    boxBlock(rng() < 0.4);
    add(`<div class="fig1">${figBlock(figDefs[0], ri(35, 60))}</div>`, null);
    gtBlocks.push(figDefs[0].cap, figDefs[0].src);
  }

  add(`<div class="ft">${footer}</div>`, footer);

  const css = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{width:210mm;height:297mm;padding:${mTop.toFixed(1)}mm ${mSide.toFixed(1)}mm ${(mTop * 0.85).toFixed(1)}mm;display:flex;flex-direction:column;font-family:${font};font-size:${fs.toFixed(1)}pt;line-height:${lh.toFixed(2)};color:#101010;background:#fff}
p{margin:0 0 ${pgap}pt;text-align:justify;text-indent:${indent}}
.rh{font-size:${(fs * 0.82).toFixed(1)}pt;color:#333;text-align:${rng() < 0.5 ? "right" : "left"};margin:0 0 5pt}
.hd{font-size:${(fs * 1.14).toFixed(1)}pt;font-weight:bold;margin:0 0 ${(4 + rng() * 4).toFixed(1)}pt}
.lead{border:${bw}px solid #000;padding:5pt 7pt;margin:0 0 7pt}
.sub{font-weight:bold;margin:${(3 + rng() * 4).toFixed(1)}pt 0 2pt}
.cap{text-align:center;margin:8pt 0 3pt;text-indent:0}
.box{border:1px solid #000;padding:5pt 7pt;font-size:${(fs * 0.9).toFixed(1)}pt;line-height:${(lh * 0.98).toFixed(2)}}
.cols{display:flex;gap:10pt}
.col{flex:1}
.bl{margin:0 0 2.5pt;padding-left:1em;text-indent:-1em;text-align:justify}
.src{font-size:${(fs * 0.82).toFixed(1)}pt;margin:2.5pt 0 0}
.figrow{display:flex;gap:7mm;margin-top:8pt;flex:1 1 auto;min-height:0}
.fig{flex:1;display:flex;flex-direction:column;min-height:0}
.fig1{width:${ri(58, 78)}%;margin:8pt auto 0;flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.fig1 .fig{flex:1}
.fig .src{text-align:left}
.ph{background:#d9d9d9;border:0.5pt solid #b5b5b5;flex:1 1 0;min-height:14mm}
.ft{margin-top:auto;text-align:center;font-size:${(fs * 0.9).toFixed(1)}pt;padding-top:6pt}
u{text-underline-offset:1.5pt}
s{text-decoration:line-through}
`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${htmlParts.join("")}</body></html>`;
  const gt = gtBlocks.join("\n\n");
  return { html, gt, pageOpts: {} };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
