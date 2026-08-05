// FAMILY GENERATOR — Japanese policy/business report page (chamber-of-commerce /
// regional-bank survey genre). Defining quirk: HEAVY underlining of key phrases inside
// a full-width bordered text box; section heading （Ｎ）..., a 2-column comparison box
// captioned 図表NN with （出所） line, 0-2 gray photo placeholders with 図表 captions.
// GT = markdown text; every rendered underline is carried as <u>…</u> (bold-gothic
// emphasis seeds carry **<u>…</u>**).
//
// Drift: 3 discrete layout modes (0 = anchor-like box + 2 photos; 1 = two sections,
// no photos; 2 = box + 1 full-width photo), 3 fictional topic banks, seed-driven
// emphasis density 0.55-0.92, emphasis style (bold-gothic+underline vs underline-only),
// font size/leading jitter, running-header presence, 図表 numbering, years/capacities,
// footer style. All names, facilities, associations are FICTIONAL; prose freshly written.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const rf = (lo, hi) => lo + rng() * (hi - lo);
  const Z = "０１２３４５６７８９";
  const zen = (n) => String(n).split("").map((d) => Z[+d]).join("");

  // ---- seed knobs ----
  const mode = ri(0, 2);                    // 0: box+2photos  1: two sections  2: box+1 photo
  const emStyle = rng() < 0.7 ? 0 : 1;      // 0: bold gothic + underline, 1: underline only
  const pEm = rf(0.55, 0.92);               // emphasis density on candidate phrases
  const fs = mode === 1 ? rf(8.8, 9.6) : mode === 2 ? rf(9.0, 10.0) : rf(9.0, 9.8);
  const lh = rf(1.55, 1.72);
  const bw = rf(0.9, 1.5).toFixed(2);
  const uThick = rf(0.9, 1.6).toFixed(2);
  const uOff = rf(1.6, 3.0).toFixed(2);
  const cmpBg = rng() < 0.3 ? "#f6f6f3" : "#ffffff";
  const headGothic = rng() < 0.5;
  const pageNo = ri(2, 28);
  const footTxt = rng() < 0.65 ? `－ ${pageNo} －` : `${pageNo}`;
  const runhead = rng() < 0.4
    ? pick(["Ⅱ．圏域経済の現状と展望", "第３章　地域産業の構造変化", "Ⅲ．中期展望編", "第２部　圏域の成長戦略と課題"])
    : null;
  const runAlign = pick(["left", "right", "center"]);
  const secN = ri(3, 14);
  const znBase = ri(3, 21);

  // years / capacities
  const Y0 = ri(2024, 2026);
  const Y1 = Y0 + ri(1, 2), Y2 = Y1 + 1, Y3 = Y2 + 1;

  // ---- topic banks (fictional; emphasis candidates as ["..."] segments) ----
  const semiCap = pick(["1.5", "2", "3"]);
  const miceArea = pick(["4", "5", "6"]);
  const windMW = pick(["32", "38", "42", "45"]);

  const topics = [
    { // 0: semiconductor plant
      title: "先端半導体工場の稼働を契機とする産学官連携による人材確保・育成の強化",
      paras: [
        ["国内では経済安全保障の観点から半導体産業の再構築に向けた大型投資が相次いでおり、",
          ["地方圏における先端工場の立地"], "は、", ["雇用創出や関連産業の集積"],
          "を通じて地域経済の構造転換を促す好機となっている。"],
        [`三津川市では ${Y1} 年春に東雲セミコン株式会社の新工場（月産 ${semiCap} 万枚）が稼働予定であり、`,
          ["国内有数規模の先端ロジック半導体工場"],
          `となる。${Y2} 年には併設の後工程拠点が操業開始予定であるほか、造成中の葵野第二工業団地も ${Y2} 年から ${Y3} 年にかけて`,
          ["分譲開始の見込み"],
          "である。このほか圏域には白汐市の製造装置部品工場（従業員 8 百人）、梅坂市の特殊材料拠点（同 5 百人）などが立地しており、",
          ["圏域全体でみれば供給網の厚みは着実に増しつつある"], "。"],
        [["技術人材の確保"], "は、首都圏に集中する", ["設計開発部門"], "や", ["製造装置メーカー"],
          "など", ["企業側の採用方針に左右される"], "ことから、", ["地元大学における専門課程の拡充"],
          "や", ["実習設備の整備状況"], "、", ["処遇改善の取り組み"], "を粘り強く発信するとともに、",
          ["就業地としての魅力や定着率を高める"], "取り組みが望まれる。"],
        [["工場運営者"], "には、量産にとどまらず、", ["地元企業"], "や", ["高等専門学校"], "との",
          ["共同研究の展開"], "による", ["技術波及の拡大"], "や、特色ある", ["工場見学プログラムの実施"],
          "などによる", ["理解醸成"], "に注力するとともに、",
          ["部材メーカーの近接立地を生かした共同物流の構築"], "などに取り組む余地がある。",
          ["産業界"], "には、", ["インターンシップの受け入れ"], "、", ["寄付講座や奨学金の設置"],
          "など", ["人材育成への支援"], "、", ["地元調達比率の引き上げ"],
          "などの形で関与を深める余地が大きい。"],
        [["行政"], "には、工場立地を", ["地域経済への波及"], "や", ["若年層の定住促進"], "につなげるとの",
          ["都市営業の視点"], "から、例えば通勤利便と居住環境を兼ね備えた技術者の定住適地として売り込むなど、",
          ["圏域のポテンシャル"], "を", ["立地企業や協力会社向けに戦略的に発信"],
          "することが考えられる。量産開始を契機として、",
          ["産学官連携・広域連携による関連投資の呼び込みの加速"], "が期待される。"],
      ],
      boxCap: "三津川地区の半導体人材確保に関する県工業振興会声明（抜粋）",
      boxL: [
        "・首都圏のみに設計開発拠点の立地が集中（2031年迄には主要設計拠点の約7割が首都圏に立地する見通し）",
        "・圏域内の専門人材の育成枠は計画中を含め年間3百人程度に留まる。専門人材が首都圏へ偏在し続ければ「若年技術者の圏外流出」が一層進むことは避けられない。",
        "・隣接県では大規模な実習拠点の整備が先行しており、着手が遅れれば挽回は容易ではない。地域の技術基盤が細れば産業誘致そのものが困難になるという悪循環を何としても食い止める必要がある。",
      ],
      boxR: [
        "・既存の公共職業訓練校は多数の講座を抱え定員の確保が非常に困難な状況。民間研修機関も専門講師の不足から増枠の余地は限られる。",
        "・圏域における人材育成のコスト構造は、物価が高騰するなか首都圏研修と比較すると1.4倍の経費（講師の招聘費、実習装置の維持費等）がかさむために現行の予算規模では対応が難しくなってきている。",
      ],
      boxSrc: `（出所）三津川県工業振興会（${Y0}年3月）`,
      photos: [
        ["東雲セミコン三津川工場完成予想図", "（出所）東雲セミコン株式会社 Web サイト"],
        ["葵野後工程センター完成予想図", "（資料提供）葵野都市開発株式会社"],
      ],
    },
    { // 1: MICE / exhibition hall
      title: "大型展示場の開業を契機とする官民連携による国際催事誘致の推進",
      paras: [
        ["国際会議や大規模展示会の開催は、", ["宿泊・飲食・交通など裾野の広い消費"], "を生み出し、",
          ["開催都市の国際的な知名度向上"], "にも資することから、各都市の間で",
          ["誘致競争が年々激しさを増している"], "。"],
        [`帆浦市では ${Y1} 年秋に汐凪国際メッセ（展示面積 ${miceArea} 万平方メートル）が開業予定であり、`,
          ["国内最大級の複合展示施設"],
          `となる。${Y2} 年には隣接する国際会議棟が供用開始予定であるほか、改修工事中の帆浦産業会館も ${Y2} 年から ${Y3} 年にかけて`,
          ["利用再開の見込み"],
          "である。このほか圏域には梅坂市の梅坂コンベンションプラザ（2 千席）、津見野市のアクアホール津見野（1.5 千席）などがあり、",
          ["圏域全体でみれば大型催事の受入環境は着実に厚みを増しつつある"], "。"],
        [["開催地の選定"], "は、首都圏に多く所在する", ["主催団体"], "や", ["展示会オーガナイザー"],
          "など", ["主催者側の判断に委ねられる"], "ことから、", ["各施設の特色や開催実績"], "、",
          ["整備の進捗状況"], "を継続的に発信するとともに、", ["開催地としての存在感と集客力を高める"],
          "取り組みが望まれる。"],
        [["施設運営者"], "には、会場提供にとどまらず、", ["周辺商業施設"], "や", ["臨海観光エリア"],
          "との", ["連携企画の展開"], "による", ["来場者の回遊性向上"], "や、特色ある",
          ["自主企画展の開催"], "などによる", ["収益機会の拡充"], "を図るとともに、",
          ["展示場と会議場の一体利用を生かした同時開催の提案"], "など、多面的な展開が考えられる。",
          ["産業界"], "には、", ["催事への協賛"], "、", ["ネーミングライツや法人会員契約"], "など",
          ["施設運営への支援"], "、", ["地元企業による出展の拡大"],
          "などにより下支えする役割が期待される。"],
        [["行政"], "には、催事の開催を", ["地域経済への波及"], "や", ["国際交流の促進"], "につなげるとの",
          ["都市営業の視点"], "から、例えば港湾と都心が近接する国際催事の適地として売り込むなど、",
          ["圏域のポテンシャル"], "を", ["主催者やオーガナイザー向けに戦略的に発信"],
          "することが考えられる。施設開業を契機として、",
          ["官民連携・広域連携による国際催事の誘致体制の強化"], "が期待される。"],
      ],
      boxCap: "帆浦臨海部の展示場整備に関する催事産業連絡会声明（抜粋）",
      boxL: [
        "・首都圏のみに大型展示場の増設が集中（2030年迄には5万平方メートル級の会場が4施設開業となる予定）",
        "・圏域の展示場整備計画は構想段階を含め2施設に留まる。催事産業が首都圏へ偏在し続ければ「大型見本市の地方外し」が一層進むことは避けられない。",
        "・海外の競合都市は展示面積を倍増させており、着手が遅れれば挽回は容易ではない。国際催事の誘致力が低下した都市からの若年人材流出という悪循環を何としても食い止める必要がある。",
      ],
      boxR: [
        "・既存の帆浦産業会館は定例催事が重なり日程の確保が難しい状態が続く。屋外催事場も天候に左右されることから通年で使用できる期間は限られる。",
        "・圏域における催事の収支構造は、物価が高騰するなか首都圏開催と比較すると1.3倍の経費（機材の輸送費、施工人員の宿泊費等）がかさむために現行の会場規模では収支を確保しにくくなってきている。",
      ],
      boxSrc: `（出所）催事産業連絡会（${Y0}年11月）`,
      photos: [
        ["汐凪国際メッセ完成予想図", "（出所）株式会社汐凪都市整備 Web サイト"],
        ["帆浦国際会議棟完成予想図", "（資料提供）帆浦みなと開発株式会社"],
      ],
    },
    { // 2: offshore wind
      title: "洋上風力発電の導入を契機とする基地港湾を核とした関連産業集積への期待",
      paras: [
        ["脱炭素社会の実現に向けて洋上風力発電の導入拡大が国の方針として掲げられており、",
          ["部材製造や維持管理など関連産業の裾野の広さ"], "から、", ["立地地域への経済波及"],
          "に対する期待が高まっている。"],
        [`洲崎市の沖合では ${Y1} 年度に出力 ${windMW} 万キロワットの洋上風力発電所が運転開始予定であり、`,
          ["国内有数規模の着床式プロジェクト"],
          `となる。${Y2} 年度には洲崎港の耐震岸壁と部材組立ヤードが供用開始予定であるほか、隣接する白汐埠頭の改修も ${Y2} 年度から ${Y3} 年度にかけて`,
          ["完了の見込み"],
          "である。このほか圏域には梅坂市のブレード部品工場、津見野市の海底ケーブル製造拠点などが立地しており、",
          ["圏域全体でみれば関連産業の受け皿は着実に整いつつある"], "。"],
        [["建設・保守拠点の選定"], "は、首都圏や海外に本社を置く", ["発電事業者"], "や", ["風車メーカー"],
          "など", ["事業者側の判断に委ねられる"], "ことから、", ["港湾機能や背後用地の確保状況"], "、",
          ["地元企業の対応力"], "を継続的に発信するとともに、", ["拠点港としての競争力を高める"],
          "取り組みが望まれる。"],
        [["港湾管理者"], "には、岸壁の提供にとどまらず、", ["地元漁業者"], "や", ["観光事業者"], "との",
          ["共生策の展開"], "による", ["地域理解の醸成"], "や、特色ある", ["洋上見学ツアーの実施"],
          "などによる", ["交流人口の拡大"], "に注力するとともに、",
          ["メンテナンス人材の育成拠点の併設による定着促進"], "といった工夫が考えられる。",
          ["産業界"], "には、", ["部品供給への参入"], "、", ["作業船の共同保有"], "など",
          ["事業基盤への投資"], "、", ["訓練施設への協力"], "などの取り組みが求められる。"],
        [["行政"], "には、発電事業を", ["地域経済への波及"], "や", ["雇用の創出"], "につなげるとの",
          ["地域経営の視点"], "から、例えば静穏な海域と広大な背後地を備えた保守拠点の適地として売り込むなど、",
          ["圏域のポテンシャル"], "を", ["事業者やメーカー向けに戦略的に発信"],
          "することが考えられる。運転開始を契機として、",
          ["官民連携・広域連携による関連産業の集積の加速"], "が期待される。"],
      ],
      boxCap: "洲崎港の基地港湾指定に関する港湾振興協議会声明（抜粋）",
      boxL: [
        "・太平洋側のみに基地港湾の指定が集中（2032年迄には指定港湾の約6割が太平洋側となる見通し）",
        "・日本海側の指定は計画中を含め3港に留まる。基地機能の一極集中が進行すると「維持管理業務の域外流出」が一段と強まることは避けられない。",
        "・近隣港湾では大規模な岸壁改修が先行しており、着手が遅れれば挽回は容易ではない。港湾の競争力が低下した地域からの海事人材流出という悪循環を何としても食い止める必要がある。",
      ],
      boxR: [
        "・既存の洲崎港第一埠頭は定期航路の発着によりバース確保が非常に困難な状況。既存岸壁は耐荷重の制約から大型部材の仮置きに使用できる範囲は限られる。",
        "・圏域における建設の収支構造は、資材価格が高騰するなか太平洋側と比較すると1.2倍の経費（作業船の回航費、部材の海上輸送費等）がかさむために現行の港湾機能では費用回収が見通しにくくなってきている。",
      ],
      boxSrc: `（出所）洲崎港湾振興協議会（${Y0}年7月）`,
      photos: [
        ["洲崎港部材組立ヤード完成予想図", "（出所）洲崎港湾振興協議会 Web サイト"],
        ["帆座灘洋上風力発電所完成予想図", "（資料提供）帆座灘ウィンドパワー株式会社"],
      ],
    },
  ];

  const ti = ri(0, 2);
  const tj = (ti + ri(1, 2)) % 3;
  const tA = topics[ti], tB = topics[tj];

  // ---- emphasis renderer: html + gt must byte-match on text ----
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function renderPara(segs) {
    let h = "", g = "";
    for (const s of segs) {
      if (typeof s === "string") { h += esc(s); g += s; continue; }
      const t = s[0];
      if (rng() < pEm) {
        h += `<span class="em">${esc(t)}</span>`;
        g += emStyle === 0 ? `**<u>${t}</u>**` : `<u>${t}</u>`;
      } else { h += esc(t); g += t; }
    }
    return [h, g];
  }

  function section(num, topic, idxs) {
    let ph = "";
    const pg = [];
    for (const i of idxs) {
      const [h, g] = renderPara(topic.paras[i]);
      ph += `<p>${h}</p>`;
      pg.push(g);
    }
    const head = `（${zen(num)}）${topic.title}`;
    return {
      html: `<div class="sech">${head}</div><div class="mbox">${ph}</div>`,
      gt: [`## ${head}`, ...pg],
    };
  }

  function zbox(topic, n) {
    const cap = `図表 ${n}　${topic.boxCap}`;
    const left = topic.boxL.slice(0, rng() < 0.3 ? 2 : 3);
    const right = topic.boxR;
    const lw = rf(46, 54).toFixed(1);
    const html =
      `<div class="zcap">${cap}</div>` +
      `<div class="cmp"><div class="cc" style="width:${lw}%">${left.map((b) => `<div class="bl">${b}</div>`).join("")}</div>` +
      `<div class="cc cr" style="width:${(100 - +lw).toFixed(1)}%">${right.map((b) => `<div class="bl">${b}</div>`).join("")}</div></div>` +
      `<div class="zsrc">${topic.boxSrc}</div>`;
    return { html, gt: [cap, [...left, ...right].join("\n"), topic.boxSrc] };
  }

  // ---- assemble per mode ----
  const blocks = [];   // html pieces
  const gtb = [];      // gt blocks
  if (runhead) {
    blocks.push(`<div class="runh" style="text-align:${runAlign}">${runhead}</div>`);
    gtb.push(runhead);
  }

  const znCmp = znBase, znP1 = znBase + 1, znP2 = znBase + 2;

  if (mode === 0) {
    const s = section(secN, tA, [0, 1, 2, 3, 4]);
    const z = zbox(tA, znCmp);
    blocks.push(s.html, z.html);
    gtb.push(...s.gt, ...z.gt);
    const h = ri(40, 50);
    const capA = `図表 ${znP1}　${tA.photos[0][0]}`, capB = `図表 ${znP2}　${tA.photos[1][0]}`;
    blocks.push(
      `<div class="ph2">` +
      `<div class="fig"><div class="fcap">${capA}</div><div class="im" style="height:${h}mm"></div><div class="fsrc">${tA.photos[0][1]}</div></div>` +
      `<div class="fig"><div class="fcap">${capB}</div><div class="im" style="height:${h}mm"></div><div class="fsrc">${tA.photos[1][1]}</div></div>` +
      `</div>`);
    gtb.push(`${capA}\n${capB}\n${tA.photos[0][1]}\n${tA.photos[1][1]}`);
  } else if (mode === 1) {
    const sA = section(secN, tA, [0, 1, 2, 3]);
    const z = zbox(tA, znCmp);
    const sB = section(secN + 1, tB, [0, 1, 3, 4]);
    blocks.push(sA.html, z.html, sB.html);
    gtb.push(...sA.gt, ...z.gt, ...sB.gt);
  } else {
    const s = section(secN, tA, [0, 1, 2, 4]);
    const z = zbox(tA, znCmp);
    blocks.push(s.html, z.html);
    gtb.push(...s.gt, ...z.gt);
    const h = ri(54, 66), w = ri(58, 76);
    const cap = `図表 ${znP1}　${tA.photos[0][0]}`;
    blocks.push(
      `<div class="ph1" style="width:${w}%">` +
      `<div class="fcap">${cap}</div><div class="im" style="height:${h}mm"></div><div class="fsrc">${tA.photos[0][1]}</div></div>`);
    gtb.push(`${cap}\n${tA.photos[0][1]}`);
  }

  blocks.push(`<div class="foot">${footTxt}</div>`);
  gtb.push(footTxt);

  const mincho = `"Hiragino Mincho ProN","Yu Mincho","MS PMincho",serif`;
  const gothic = `"Hiragino Sans","Yu Gothic","MS PGothic",sans-serif`;
  const emCss = emStyle === 0
    ? `font-family:${gothic};font-weight:700;`
    : `font-weight:inherit;`;

  const html = `<meta charset="utf-8">
<style>
@page { size: A4; margin: 0; }
html,body { margin:0; padding:0; }
body { width:210mm; font-family:${mincho}; font-size:${fs.toFixed(2)}pt; line-height:${lh.toFixed(2)}; color:#101010; }
.page { position:relative; width:210mm; height:297mm; box-sizing:border-box; padding:${rf(11, 14).toFixed(1)}mm ${rf(16, 19).toFixed(1)}mm 14mm; overflow:visible; }
.runh { font-size:${(fs * 0.82).toFixed(2)}pt; margin-bottom:2.4mm; letter-spacing:0.04em; }
.sech { font-size:${(fs * 1.03).toFixed(2)}pt; margin:0 0 1.4mm; ${headGothic ? `font-family:${gothic};font-weight:600;` : ""} }
.mbox { border:${bw}px solid #000; padding:1.7mm 2.6mm; margin-bottom:${rf(5, 8).toFixed(1)}mm; }
.mbox p { margin:0; text-indent:1em; text-align:justify; }
.em { ${emCss} text-decoration:underline; text-decoration-thickness:${uThick}px; text-underline-offset:${uOff}px; }
.zcap { text-align:center; font-size:${(fs * 0.97).toFixed(2)}pt; margin:0 0 1.6mm; }
.cmp { display:flex; border:${bw}px solid #000; background:${cmpBg}; }
.cc { box-sizing:border-box; padding:1.6mm 2.1mm; font-size:${(fs * 0.78).toFixed(2)}pt; line-height:1.5; }
.cr { border-left:${bw}px solid #000; }
.bl { text-align:justify; padding-left:1em; text-indent:-1em; }
.zsrc { font-size:${(fs * 0.82).toFixed(2)}pt; margin:1.1mm 0 ${rf(4, 7).toFixed(1)}mm; }
.ph2 { display:flex; gap:7mm; margin-top:2mm; }
.fig { flex:1; min-width:0; }
.ph1 { margin:2mm auto 0; }
.fcap { text-align:center; font-size:${(fs * 0.95).toFixed(2)}pt; margin-bottom:1.6mm; }
.im { background:linear-gradient(180deg,#cbcbcb,#a8a8a8); }
.fsrc { font-size:${(fs * 0.8).toFixed(2)}pt; margin-top:1.4mm; }
.foot { position:absolute; bottom:7mm; left:0; width:100%; text-align:center; font-size:${(fs * 0.95).toFixed(2)}pt; }
</style>
<div class="page">${blocks.join("")}</div>`;

  return { html, gt: gtb.join("\n\n"), pageOpts: {} };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
