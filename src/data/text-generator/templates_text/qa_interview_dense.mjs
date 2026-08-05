// FAMILY GENERATOR — dense Q&A interview magazine page (drift sibling of a JP
// tategaki interview spread; this family is horizontal JP or EN per seed).
// Genre furniture: kicker + display headline with accent-colored phrase, lead
// paragraph, icon section heads, bold "——"/"—" interviewer questions, answers
// opening with a bold speaker-name marker, gray photo placeholders w/ captions,
// PROFILE bio box, page-number footer. Dense small type, 2-4 columns, justified.
//
// Layout modes (discrete, seed-picked):
//   0 banner-top   : full-width headline band, 3-4 cols, bio box pinned bottom of last col
//   1 photo-right  : headline left / photo placeholder right, 3 cols, bio box bottom
//   2 rail-left    : full-width headline, left rail (photo + PROFILE + book box), 2-3 cols
// Continuous knobs: language ja/en, topic (2 per lang), font class, base size,
// col count/gap/rules, emphasis density pEmph + underline share, lead width/bold,
// figure count 0-2, palette (5 accents), footer style, page number, headline size.
// GT = markdown text, logical reading order, emphasis mirrors render exactly.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const irnd = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const shuffled = (a) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };

  // ---------------- language / topic ----------------
  const lang = rng() < 0.5 ? "ja" : "en";
  const ja = lang === "ja";
  const topic = ja ? pick(JA_TOPICS) : pick(EN_TOPICS);
  const person = pick(topic.people);            // [family, given, pron?]
  const org = pick(topic.orgs);
  const title = pick(topic.titles);
  const fullName = ja ? person[0] + person[1] : `${person[0]} ${person[1]}`;
  const spkLabel = ja ? person[0] : person[1].toUpperCase() + ":";

  // ---------------- knobs ----------------
  const mode = irnd(0, 2);
  const PAD = irnd(30, 38);
  const W = 794, H = 1123;
  const availW = W - 2 * PAD;
  const fs = ja ? 10.2 + rng() * 2.0 : 10.5 + rng() * 2.0;
  const lh = Math.round(fs * (ja ? 1.55 : 1.4));
  const nCols = mode === 2 ? (ja ? irnd(2, 3) : 2) : (ja ? irnd(3, 4) : 3);
  const gap = irnd(14, 20);
  const colRule = rng() < 0.5;
  const pEmph = 0.35 + rng() * 0.5;             // chance a marked phrase gets emphasis
  const uShare = 0.25 + rng() * 0.55;           // underline vs bold split
  const [accent, tint] = pick([
    ["#d96f1e", "#faf1e6"], ["#0e7f78", "#eaf4f2"], ["#b23a68", "#f8edf2"],
    ["#28569c", "#edf1f8"], ["#7a5bbf", "#f1eef8"]]);
  const bodyBg = rng() < 0.3 ? "#fffdf6" : "#ffffff";
  const fonts = ja
    ? pick([
        { body: '"Hiragino Mincho ProN","Hiragino Mincho Pro",serif', head: '"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif', chw: 1.0 },
        { body: '"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif', head: '"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif', chw: 1.0 }])
    : pick([
        { body: "Georgia,'Times New Roman',serif", head: "Helvetica,Arial,sans-serif", chw: 0.50 },
        { body: "Helvetica,Arial,sans-serif", head: "Helvetica,Arial,sans-serif", chw: 0.525 },
        { body: "'Times New Roman',Times,serif", head: "Georgia,serif", chw: 0.49 }]);
  const chF = fonts.chw;                        // avg char width factor (em)
  const qItalic = !ja && rng() < 0.4;           // EN: bold-italic questions
  const leadBold = rng() < 0.3;
  const secStyle = irnd(0, 2);                  // 0 icon square, 1 left bar, 2 underline
  const bioTint = rng() < 0.55;
  const figCount = irnd(0, 2);
  const pageNo = irnd(12, 87);
  const mag = pick(topic.mags);
  const footTxt = ja
    ? `${mag}　2025年${irnd(1, 12)}月号　　${pageNo}`
    : `${mag} · ISSUE ${irnd(18, 64)} · ${pageNo}`;
  const footAlign = pick(["flex-start", "flex-end", "space-between-x"]);

  // ---------------- text helpers ----------------
  const nounPick = () => pick(topic.nouns);
  const fill = (s) => s.replace(/\{0\}/g, nounPick);
  // «phrase» markers -> seeded underline/bold/plain, html+gt built together
  function rich(s) {
    let html = "", gt = "", plain = "";
    for (const part of s.split(/(«[^»]*»)/)) {
      if (!part) continue;
      if (part.startsWith("«")) {
        const t = part.slice(1, -1);
        plain += t;
        if (rng() < pEmph) {
          if (rng() < uShare) { html += `<u>${t}</u>`; gt += `<u>${t}</u>`; }
          else { html += `<b>${t}</b>`; gt += `**${t}**`; }
        } else { html += t; gt += t; }
      } else { html += part; gt += part; plain += part; }
    }
    return { html, gt, plain };
  }
  const bag = (arr) => { let b = []; return () => { if (!b.length) b = shuffled(arr); return b.pop(); }; };
  const nextSentence = bag(topic.sentences);
  const paraText = (nS) => {
    const parts = [];
    for (let i = 0; i < nS; i++) parts.push(fill(nextSentence()));
    return parts.join(ja ? "" : " ");
  };
  const lines = (len, widthPx, fontPx) =>
    Math.max(1, Math.ceil(((ja ? len + 1 : len) * fontPx * chF) / widthPx));
  const capFirst = (s) => {
    if (ja) return s;
    if (s[0] === "«") return "«" + s[1].toUpperCase() + s.slice(2);
    return s[0].toUpperCase() + s.slice(1);
  };

  // ---------------- header geometry ----------------
  const hlSpec = pick(topic.headlines);         // {lines:[[seg,acc?],...]}
  const hlText = hlSpec.lines.map((l) => l.map((s) => s[0]).join("")).join(ja ? "" : " ");
  const maxHlLen = Math.max(...hlSpec.lines.map((l) => l.map((s) => s[0]).join("").length));
  const leadRaw = fill(pick(topic.leads))
    .replace(/\{org\}/g, org).replace(/\{name\}/g, fullName).replace(/\{title\}/g, title);
  const leadFs = fs + 1;

  const hlAreaW = mode === 1 ? Math.round(availW * 0.56) : availW;
  let hfs = ja ? irnd(30, 40) : irnd(32, 44);
  hfs = Math.min(hfs, Math.floor(hlAreaW / (maxHlLen * (ja ? 1.05 : 0.58))));
  const kickH = 22;
  const hlH = hlSpec.lines.length * Math.round(hfs * 1.18) + 8;
  const leadW = mode === 1 ? hlAreaW : Math.round(availW * (rng() < 0.5 ? 1 : 0.62 + rng() * 0.3));
  const leadLines = lines(leadRaw.length, leadW, leadFs);
  const leadH = leadLines * Math.round(leadFs * 1.62) + 10;
  const capFs = Math.max(8.5, fs - 1.5);
  const photoCap = ja
    ? `${fullName}氏。${org}${title}`
    : `${person[0]} ${person[1]}, ${title} of ${org}.`;
  let headerH, photoHtml = "";
  if (mode === 1) {
    const phH = irnd(170, 230);
    const photoW = availW - hlAreaW - 18;
    const capLines = lines(photoCap.length, photoW, capFs);
    const photoBoxH = phH + capLines * Math.round(capFs * 1.45) + 8;
    headerH = Math.max(kickH + hlH + leadH, photoBoxH) + 14;
    photoHtml = `<div class="hph" style="width:${photoW}px"><div class="ph" style="height:${phH}px"></div><p class="cap">${ja ? photoCap : `<i>${photoCap}</i>`}</p></div>`;
  } else {
    headerH = kickH + hlH + leadH + 14;
  }
  const footerH = 26;
  const colH = H - 2 * PAD - footerH - headerH;

  // ---------------- rail (mode 2) ----------------
  const railW = mode === 2 ? irnd(180, 210) : 0;
  const mainW = availW - (mode === 2 ? railW + 18 : 0);
  const colW = Math.floor((mainW - (nCols - 1) * gap) / nCols);

  // ---------------- bio / book box content ----------------
  const bio = topic.bio(rng, pick, irnd, person, org, title);
  const nameLine = ja
    ? { html: `<b>${fullName}</b>（${org}${title}）`, gt: `**${fullName}**（${org}${title}）` }
    : { html: `<b>${fullName}</b> — ${title}, ${org}`, gt: `**${fullName}** — ${title}, ${org}` };
  const bioHead = "PROFILE";
  const boxW = (mode === 2 ? railW : colW) - 26;
  const bioFs = Math.max(8.5, fs - 1);
  const bioLines = lines(bio.length, boxW, bioFs) + lines(nameLine.gt.length - 4, boxW, bioFs);
  const bioH = 16 + bioLines * Math.round(bioFs * 1.5) + 30;
  const bioHtml = `<div class="bio"><div class="bh">${bioHead}</div><p class="bn">${nameLine.html}</p><p class="bt">${bio}</p></div>`;
  const bioGt = `### ${bioHead}\n\n${nameLine.gt}\n\n${bio}`;
  const book = pick(topic.books);
  const bookHead = ja ? "著書紹介" : "ON THE SHELF";
  const bookLine = ja ? `${pick(["あおば書房", "灯火舎", "ミナト出版"])}／1,${pick(["540", "650", "760", "870"])}円（税込）` : `${pick(["Fernbank Editions", "Driftwood Press", "Longacre Books"])}, £${irnd(9, 16)}.99`;
  const bookHtml = `<div class="bio bk"><div class="bh">${bookHead}</div><p class="bn"><b>${book}</b></p><p class="bt">${bookLine}</p></div>`;
  const bookGt = `### ${bookHead}\n\n**${book}**\n\n${bookLine}`;

  // ---------------- Q&A stream ----------------
  const sects = topic.sections;
  const qs = topic.questions;
  const stream = [];
  let si = 0, secCountdown = 0;
  const qFs = fs;
  const secFs = fs + 2.5;
  for (let qi = 0; qi < qs.length; qi++) {
    if (secCountdown === 0 && si < sects.length) {
      const t = sects[si++];
      stream.push({ type: "sec", html: `<h3 class="sec">${secIcon(secStyle)}${t}</h3>`, gt: `## ${t}`, h: lines(t.length, colW - 14, secFs) * Math.round(secFs * 1.3) + 18 });
      secCountdown = irnd(2, 4);
    }
    secCountdown--;
    const q = qs[qi];
    const qGt = qItalic ? `***${q}***` : `**${q}**`;
    stream.push({ type: "q", html: `<p class="q${qItalic ? " qi" : ""}">${q}</p>`, gt: qGt, h: lines(q.length, colW, qFs) * lh + 15 });
    const nPara = 1 + (rng() < 0.45 ? 1 : 0);
    for (let p = 0; p < nPara; p++) {
      const r = rich(capFirst(paraText(irnd(2, 4))));
      const first = p === 0;
      const spkHtml = first ? `<b class="spk">${spkLabel}</b>${ja ? "　" : " "}` : "";
      const spkGt = first ? `**${spkLabel}**${ja ? "　" : " "}` : "";
      stream.push({ type: "para", html: `<p class="a${first ? "" : " ind"}">${spkHtml}${r.html}</p>`, gt: spkGt + r.gt, h: lines(r.plain.length + (first ? spkLabel.length + 1 : 0), colW, fs) * lh + 5 });
    }
  }
  // continuation padding so the page always fills
  for (let x = 0; x < 12; x++) {
    const r = rich(capFirst(paraText(irnd(2, 4))));
    stream.push({ type: "para", html: `<p class="a ind">${r.html}</p>`, gt: r.gt, h: lines(r.plain.length, colW, fs) * lh + 5 });
  }
  // figures spliced mid-stream
  const capBag = bag(topic.figCaps);
  for (let f = 0; f < figCount; f++) {
    const cap = capBag();
    const phH = irnd(80, 135);
    const capLines = lines(cap.length, colW, capFs);
    const idx = irnd(4, Math.min(stream.length - 2, 9 + f * 6));
    stream.splice(idx, 0, { type: "fig", html: `<div class="fig"><div class="ph" style="height:${phH}px"></div><p class="cap">${ja ? cap : `<i>${cap}</i>`}</p></div>`, gt: ja ? cap : `*${cap}*`, h: phH + capLines * Math.round(capFs * 1.45) + 14 });
  }

  // ---------------- fill columns ----------------
  const budgets = Array.from({ length: nCols }, () => colH - 6);
  const bioInLastCol = mode !== 2;
  if (bioInLastCol) budgets[nCols - 1] -= bioH + 10;
  const placed = Array.from({ length: nCols }, () => []);
  let ci = 0, rem = budgets[0], bi = 0;
  for (; bi < stream.length; bi++) {
    const b = stream[bi];
    let need = b.h;
    if ((b.type === "sec" || b.type === "q") && rem - need < 2.2 * lh) need = rem + 1; // don't strand headings
    if (need > rem) {
      ci++;
      if (ci >= nCols) break;
      rem = budgets[ci];
      if (b.h > rem) continue;
    }
    placed[ci].push(b);
    rem -= b.h;
  }
  // top-up: fill the tail of the last column with any later paragraphs that fit
  for (bi++; bi < stream.length && rem > 2 * lh; bi++) {
    const b = stream[bi];
    if (b.type !== "para" || b.h > rem) continue;
    placed[nCols - 1].push(b);
    rem -= b.h;
  }
  for (let c = nCols - 1; c >= 0; c--) {       // trim trailing dangling heads
    while (placed[c].length && ["sec", "q"].includes(placed[c][placed[c].length - 1].type)) placed[c].pop();
    if (placed[c].length) break;
  }

  // ---------------- assemble ----------------
  const kicker = pick(topic.kickers);
  const hlHtml = hlSpec.lines.map((l) => `<div>${l.map(([t, a]) => (a ? `<span class="ac">${t}</span>` : t)).join("")}</div>`).join("");
  const colsHtml = placed.map((blocks, i) => {
    const inner = blocks.map((b) => b.html).join("");
    const pin = bioInLastCol && i === nCols - 1 ? bioHtml : "";
    return `<div class="col${i > 0 && colRule ? " rl" : ""}${pin ? " cf" : ""}">${inner}${pin}</div>`;
  }).join("");

  let railHtml = "";
  const railPh = Math.max(90, Math.min(irnd(150, 200), colH - bioH - 150));
  if (mode === 2)
    railHtml = `<div class="rail"><div class="ph" style="height:${railPh}px"></div><p class="cap">${ja ? photoCap : `<i>${photoCap}</i>`}</p>${bioHtml}${bookHtml}</div>`;

  const headerInner = mode === 1
    ? `<div class="hrow"><div style="width:${hlAreaW}px"><p class="kick">${kicker}</p><h1 class="hl">${hlHtml}</h1><p class="lead${leadBold ? " lb" : ""}" style="width:${leadW}px">${leadRaw}</p></div>${photoHtml}</div>`
    : `<p class="kick">${kicker}</p><h1 class="hl">${hlHtml}</h1><p class="lead${leadBold ? " lb" : ""}" style="width:${leadW}px">${leadRaw}</p>`;

  const mainHtml = mode === 2
    ? `<div class="lower">${railHtml}<div class="cols">${colsHtml}</div></div>`
    : `<div class="cols">${colsHtml}</div>`;

  const footInner = footAlign === "space-between-x"
    ? `<span>${footTxt}</span><span class="dot"></span>`
    : `<span>${footTxt}</span>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0 }
* { margin:0; padding:0; box-sizing:border-box }
body { width:${W}px; height:${H}px; overflow:hidden; background:${bodyBg}; color:#1d1d1d; font-family:${fonts.body}; }
.page { width:100%; height:100%; padding:${PAD}px; display:flex; flex-direction:column; }
.kick { font-family:${fonts.head}; font-size:11px; font-weight:700; letter-spacing:.34em; color:${accent}; margin-bottom:6px; }
.hl { font-family:${fonts.head}; font-size:${hfs}px; line-height:1.18; font-weight:800; color:#333; letter-spacing:${ja ? ".02em" : "0"}; }
.hl .ac { color:${accent}; }
.hrow { display:flex; justify-content:space-between; align-items:flex-start; }
.lead { font-size:${leadFs}px; line-height:1.62; color:#333; margin-top:9px; text-align:justify; }
.lead.lb { font-weight:700; }
.hph .cap, .rail .cap, .fig .cap { font-size:${capFs}px; line-height:1.45; color:#555; margin-top:4px; text-align:left; }
.ph { background:linear-gradient(135deg,#c8c8c8,#adadad); width:100%; }
.cols { display:flex; height:${colH}px; overflow:hidden; margin-top:14px; flex:1 1 auto; }
.lower { display:flex; height:${colH}px; overflow:hidden; margin-top:14px; }
.rail { width:${railW}px; flex:0 0 ${railW}px; padding-right:14px; margin-right:4px; border-right:${colRule ? `1px solid #d5d5d5` : "none"}; }
.rail .bio { margin-top:12px; }
.col { flex:1 1 0; padding:0 ${Math.floor(gap / 2)}px; }
.col:first-child { padding-left:0 } .col:last-child { padding-right:0 }
.col.rl { border-left:1px solid #d8d8d8; }
.col.cf { display:flex; flex-direction:column; }
.sec { font-family:${fonts.head}; font-size:${secFs}px; line-height:1.3; font-weight:800; color:#2b2b2b; margin:9px 0 6px;
 ${secStyle === 1 ? `border-left:4px solid ${accent}; padding-left:7px;` : secStyle === 2 ? `border-bottom:2px solid ${accent}; padding-bottom:3px;` : ""} }
.sq { display:inline-block; width:9px; height:9px; background:${accent}; margin-right:6px; }
.q { font-family:${fonts.head}; font-size:${qFs}px; line-height:${lh}px; font-weight:700; color:#222; margin:9px 0 5px; text-align:justify; }
.q.qi { font-style:italic; }
.a { font-size:${fs}px; line-height:${lh}px; text-align:justify; margin-bottom:4px; }
.a.ind { text-indent:1em; }
.spk { font-weight:700; }
.fig { margin:8px 0 10px; }
.bio { ${bioTint ? `background:${tint};` : `background:#fff; border:1px solid #cfcfcf;`} border-top:3px solid ${accent}; padding:11px 12px; font-size:${bioFs}px; line-height:1.5; }
.bio.bk { margin-top:10px; border-top-style:${rng() < 0.5 ? "solid" : "double"}; }
.cf .bio { margin-top:auto; }
.bh { font-family:${fonts.head}; font-size:10px; font-weight:800; letter-spacing:.3em; color:${accent}; margin-bottom:5px; }
.bn { margin-bottom:4px; }
.bt { text-align:justify; }
.foot { height:${footerH}px; display:flex; align-items:flex-end; justify-content:${footAlign === "space-between-x" ? "space-between" : footAlign}; font-family:${fonts.head}; font-size:10px; color:#666; letter-spacing:.08em; ${rng() < 0.5 ? "border-top:1px solid #ddd; padding-top:5px;" : ""} }
.dot { width:8px; height:8px; background:${accent}; }
</style></head><body><div class="page">
${headerInner}
${mainHtml}
<div class="foot">${footInner}</div>
</div></body></html>`;

  // ---------------- GT ----------------
  const gtParts = [kicker, `# ${hlText}`, leadBold ? `**${leadRaw}**` : leadRaw];
  if (mode === 1) gtParts.push(ja ? photoCap : `*${photoCap}*`);
  if (mode === 2) {
    gtParts.push(ja ? photoCap : `*${photoCap}*`);
    gtParts.push(bioGt, bookGt);
  }
  for (const col of placed) for (const b of col) gtParts.push(b.gt);
  if (bioInLastCol) gtParts.push(bioGt);
  gtParts.push(footTxt);
  const gt = gtParts.join("\n\n");

  return { html, gt, pageOpts: {} };
}

function secIcon(style) { return style === 0 ? '<span class="sq"></span>' : ""; }

// =============================== CONTENT POOLS ===============================
// All names, organizations, magazines, books are fictional. «...» marks phrases
// eligible for seeded underline/bold emphasis. {0} = topic noun slot.

const JA_TOPICS = [
  {
    kickers: ["特集インタビュー", "巻頭インタビュー", "この人に聞く"],
    mags: ["まなびの窓", "月刊こもれび", "くらしと教育"],
    headlines: [
      { lines: [[["子どもが伸びる家庭は、"]], [["何を「"], ["しない", 1], ["」のか"]]] },
      { lines: [[["点数のその先に、"]], [["育てたい力", 1], ["がある"]]] },
      { lines: [[["反抗期は、"]], [["家庭が"], ["試される季節", 1]]] },
    ],
    leads: [
      "{org}を主宰し、三十年ちかく親子と向き合ってきた{name}さん。思春期の入り口に立つ子どもと、その隣で揺れる親に、いま伝えたいことをじっくり聞いた。",
      "「家庭は成績を上げる場所ではありません」。そう語る{org}{title}の{name}さんに、子どもが自分の足で歩き出すまでの見守り方を聞いた。",
    ],
    people: [["高月", "伸一郎"], ["柴崎", "真帆"], ["宇野", "克典"], ["三雲", "さやか"]],
    orgs: ["学習教室「そらまめ塾」", "NPO法人まなびのタネ", "こども研究室ハルカゼ", "私塾「灯台の会」"],
    titles: ["代表", "代表理事", "主宰", "塾長"],
    sections: ["生活のリズムがすべての土台", "「見守る」と「放任」のあいだ", "比べない、先回りしない", "失敗を歓迎する家庭に", "思春期の距離感", "親自身が楽しむこと"],
    questions: [
      "——最近の子どもたちを見ていて、以前と変わったと感じることはありますか。",
      "——家庭で最初に見直すべきことは何でしょうか。",
      "——つい口を出したくなる場面では、どうすればいいのでしょう。",
      "——「見守る」と「放任」は、どこが違うのですか。",
      "——きょうだいで差が出てきたとき、親はどう向き合えばいいですか。",
      "——スマートフォンとの付き合い方に悩む家庭も多いようです。",
      "——習い事をやめたいと言い出したときは、どうすべきでしょうか。",
      "——反抗期の子どもと、どう話せばいいのでしょうか。",
      "——父親と母親で、役割は違うのでしょうか。",
      "——進路について、親はどこまで関わるべきですか。",
      "——最後に、読者のみなさんへメッセージをお願いします。",
    ],
    nouns: ["生活のリズム", "小さな成功体験", "親の表情", "結果よりも過程", "朝の時間", "家庭の空気", "本人の納得", "失敗の経験", "没頭できる時間"],
    sentences: [
      "結論から言えば、«焦る必要はまったくありません»。",
      "私たちの教室でも、{0}を大切にしている家庭のお子さんほど、あとからぐんと伸びていきます。",
      "大人が思う以上に、子どもは«親の表情»をよく見ています。",
      "まずは十分に眠ること、朝ごはんを食べること。«当たり前のことが土台»になります。",
      "「早くしなさい」と言いたくなったら、ひと呼吸おいて、まず本人の言い分を聞いてみてください。",
      "十歳を過ぎたころから、子どもは急に«自分の世界»を持ちはじめます。",
      "そこで親が先回りしてしまうと、考える機会を奪うことになってしまうんです。",
      "大事なのは、{0}を家庭のなかにどう用意するかです。",
      "うまくいかなかった日こそ、«「よく挑戦したね」»と声をかけてほしいのです。",
      "比べる相手は隣の子ではなく、«昨日の本人»で十分です。",
      "実際、面談でお話を伺うと、多くの親御さんが同じところでつまずいています。",
      "口を出すのは三回に一回、と自分に決めるだけでも、家庭の空気は変わります。",
      "思春期の子にとって、正論はいちばん届きにくい言葉です。",
      "むしろ、親が自分の仕事や趣味を«楽しんでいる姿»を見せることが、何よりの教育になります。",
      "私自身、失敗談を話すようになってから、生徒との距離がぐっと縮まりました。",
      "{0}は数字では測れませんが、確実に子どもの中に積み上がっていきます。",
      "放任とは「見ていない」こと、見守るとは«「見ているけれど手を出さない」»ことです。",
      "その線引きさえできれば、多少の衝突はむしろ健全だと思います。",
      "きょうだいはそもそも別の人間ですから、同じ物差しを当てないことです。",
      "スマートフォンは禁止するより、«使い方を一緒に決める»ほうがうまくいきます。",
      "ルールづくりに本人を参加させると、驚くほど守るようになりますよ。",
      "やめたいと言い出したときは、まず理由を最後まで聞く。話はそれからです。",
      "進路は最終的に«本人が選んだ»という実感が、その後の粘り強さを生みます。",
      "親にできるのは、選択肢を並べることと、どれを選んでも応援すると伝えることだけです。",
      "宿題は「何時からやるか」を本人に宣言してもらうだけで、こちらの小言は半分になります。",
      "テストの点数より、«間違い直しのノート»を見てあげてください。",
      "「うちの子は集中力がない」と言う前に、大人が隣で本を開いてみてほしいんです。",
      "褒めるのは結果ではなく、«途中の工夫»。ここを外すと褒め言葉は届きません。",
      "リビングに図鑑を一冊置いておく。それだけで会話の種は増えます。",
      "子どもの「なんで」に全部答える必要はありません。一緒に調べればいいんです。",
      "{0}を奪わないこと。これが家庭でできる最大の支援だと思います。",
      "夜の食卓で今日あった話を一つだけ聞く。«続けられる習慣»はそのくらい小さくていいんです。",
      "叱ったあとに引きずらないこと。切り替えの早さは親の技術です。",
      "習い事は「三カ月やってから決める」と最初に約束しておくと、お互いに楽になります。",
      "点数が下がったときこそ、親の«どっしりした構え»が試されます。",
      "「あなたはどう思う」と聞かれて育った子は、面談でも自分の言葉で話します。",
    ],
    figCaps: ["教室での様子。この日は小学五年生の回だった", "面談スペースには保護者からの手紙が並ぶ", "教材はすべて手づくりだという"],
    books: ["『比べない子育て』", "『家庭という教室』", "『十歳からの見守り方』"],
    bio: (rng, pick, irnd, person, org, title) =>
      `${irnd(1962, 1984)}年、${pick(["長野県", "岡山県", "青森県", "福岡県", "新潟県"])}生まれ。${pick(["大学卒業後、出版社勤務を経て教育の現場へ", "教員として十二年勤めたのち独立", "学生時代から学習支援ボランティアに携わる"])}。${org}${title}。講演活動は年間${irnd(40, 120)}回を超える。`,
  },
  {
    kickers: ["まちの現場から", "特集インタビュー", "この人に聞く"],
    mags: ["街と人", "くらしの手帖舎", "月刊こもれび"],
    headlines: [
      { lines: [[["小さな台所から、"]], [["まちの風景", 1], ["は変わる"]]] },
      { lines: [[["八百屋の店先が、"]], [["まちの教室", 1], ["になる"]]] },
      { lines: [[["「続ける」ことが、"]], [["いちばんの"], ["まちづくり", 1]]] },
    ],
    leads: [
      "商店街の空き店舗を借りて{org}を開いて八年。{title}の{name}さんは「特別なことは何もしていない」と笑う。日々の営みがまちを変えていく、その足もとを聞いた。",
      "{org}の暖簾をくぐると、野菜の箱と子どもの声。{title}の{name}さんに、小さな商いと大きな循環の話を聞いた。",
    ],
    people: [["浅葉", "岳"], ["古谷", "真澄"], ["物部", "慎吾"], ["樋渡", "若菜"]],
    orgs: ["コミュニティ食堂「はぜの木」", "八百屋「日和屋」", "まちづくり会社ツギノバ", "合同会社アオゾラ商店"],
    titles: ["店主", "代表", "共同代表", "番頭"],
    sections: ["始まりは一杯の味噌汁", "商店街の空き店舗から", "「顔の見える野菜」の力", "続けるための小さな工夫", "これからの十年"],
    questions: [
      "——お店を始めたきっかけを教えてください。",
      "——商店街のみなさんの反応はいかがでしたか。",
      "——地元の農家さんとは、どうやってつながったのですか。",
      "——運営で苦労している点はありますか。",
      "——子どもたちの居場所にもなっていると聞きました。",
      "——行政との連携は、どのように進めているのでしょう。",
      "——採算は、どう成り立たせているのですか。",
      "——同じような取り組みを始めたい人に、助言はありますか。",
      "——十年後、このまちがどうなっていてほしいですか。",
    ],
    nouns: ["顔の見える関係", "持ち寄りの文化", "無理のない値付け", "余白のある営業時間", "おすそ分けの循環", "常連さんの口コミ"],
    sentences: [
      "最初は、«週に一度の味噌汁の会»から始めたんです。",
      "空き店舗を借りるとき、商店街の先輩たちがずいぶん力を貸してくれました。",
      "続ける秘訣は、«頑張りすぎないこと»。これに尽きます。",
      "{0}ができてくると、お客さんが自然と次のお客さんを連れてきてくれるんですよ。",
      "うちの野菜は形が不揃いでも、味で選んでいます。",
      "農家さんの畑には月に一度、必ず足を運ぶようにしています。",
      "子どもが宿題を広げていても、誰も気にしない。そんな店でありたいんです。",
      "値段を下げるのではなく、«理由のある値段»をきちんと説明する。それだけです。",
      "行政には、できないことより«できることのリスト»を持って相談に行きました。",
      "赤字の月もありますが、年間で帳尻が合えばいいと割り切っています。",
      "イベントは月に一度だけ。«日常のほう»を大事にしたいからです。",
      "{0}が、結果としていちばんの宣伝になっています。",
      "始めたい人には、まず«小さく試すこと»を勧めています。",
      "看板より先に、常連さんが十人いれば店は続きます。",
      "十年後は、この通りに«子どもの声»が戻っていてほしいですね。",
      "特別なことは何もしていません。毎日きちんと店を開ける。それだけです。",
      "仕入れ帳は手書きのまま。«数字より顔»を覚えるためです。",
      "定休日を増やしたら、かえって売上が安定したのは面白い発見でした。",
      "朝市の日は、開店の一時間前から常連さんが並んでくれるんです。",
      "レシピカードを野菜に添えるようになってから、«廃棄がぐっと減りました»。",
      "近所の高校生がポップを書いてくれて、それがいちばん売れるんですよ。",
      "配達は自転車で回れる範囲だけ。«無理をしない距離»が続く秘訣です。",
      "月末には帳簿を店先に貼り出します。«お金の流れを隠さない»のがうちの流儀です。",
      "空き箱の回収を頼まれるようになったら、店がまちに馴染んだ証拠だと思っています。",
      "{0}のおかげで、雨の日でも店の中はにぎやかです。",
      "定食は日替わり一種類だけ。選べないことが、かえって会話を生むんです。",
      "銀行より先に、隣の魚屋さんに相談したのが正解でした。",
      "傷んだ野菜はスープにして、夕方に安く出します。捨てる前にできることは案外多いんです。",
      "「手伝いましょうか」と言われたら、断らない。それも店の仕事だと思っています。",
      "十時開店を九時にしただけで、通勤前のお客さんがずいぶん増えました。",
    ],
    figCaps: ["開店前の仕込み。野菜は近郊の三軒の農家から届く", "店先の黒板は常連の中学生が担当している", "月に一度の持ち寄りの会のようす"],
    books: ["『まちの台所から』", "『不揃いのすすめ』", "『商店街の朝』"],
    bio: (rng, pick, irnd, person, org, title) =>
      `${irnd(1968, 1990)}年、${pick(["静岡県", "香川県", "秋田県", "熊本県", "富山県"])}生まれ。${pick(["会社員生活を経て地元に戻る", "調理師として働いたのち現在の活動を開始", "建築事務所勤務を経てまちづくりの道へ"])}。${org}${title}。二児の父でもある。`,
  },
];

const EN_TOPICS = [
  {
    kickers: ["THE INTERVIEW", "IN CONVERSATION", "SHOP TALK"],
    mags: ["MARGINALIA REVIEW", "THE SLOW READER", "FIELD & COUNTER"],
    headlines: [
      { lines: [[["The bookshop that"]], [["refuses to hurry", 1]]] },
      { lines: [[["Selling slowly,"]], [["reading deeply", 1]]] },
      { lines: [[["A shelf is"]], [["an ", 0], ["argument", 1]]] },
    ],
    leads: [
      "Twelve years after opening {org}, {name} still shelves every delivery by hand. We talked about patience, rent, and why the front table is the most honest page in the shop.",
      "{name}, {title} of {org}, has heard the obituary of the bookshop read many times. Over tea in the back room, we asked why the till keeps ringing anyway.",
    ],
    people: [["Ellison", "Mara", "She"], ["Reyes", "Tobias", "He"], ["Okafor", "June", "She"], ["Lindqvist", "Petra", "She"]],
    orgs: ["Lantern & Co. Booksellers", "Fernbank Books", "the Long Table Reading Room", "Driftwood & Daughter"],
    titles: ["founder", "co-owner", "proprietor", "publisher"],
    sections: ["A shop with no bestseller wall", "The economics of patience", "Readers, not customers", "Small presses, loud voices", "What survives the algorithm"],
    questions: [
      "—You opened during what everyone called the death of the bookshop. Why?",
      "—How do you decide what goes on the front table?",
      "—Is there a book you refuse to stock?",
      "—How does the shop actually make money?",
      "—What has surprised you most about your regulars?",
      "—Do you worry about the big online retailers?",
      "—What role do small presses play in your buying?",
      "—How do you hire booksellers?",
      "—What would you tell someone opening a shop next year?",
      "—What are you reading right now?",
    ],
    nouns: ["hand-selling", "the front table", "a good backlist", "the slow afternoon trade", "the reading room", "the standing-order list"],
    sentences: [
      "Honestly, the answer is «stubbornness», dressed up as strategy.",
      "We decided early on that {0} would matter more than any display budget.",
      "A bookshop is a bet that «attention is renewable», and I still believe that.",
      "Most of our margin comes from events, subscriptions, and the little press we run out back.",
      "If a book is on the front table, someone here has read it — «no exceptions».",
      "The regulars taught me more about stock than any trade catalogue ever did.",
      "We keep a ledger of requests, and it is «the most honest document» in the shop.",
      "I don't compete with the algorithm; I compete with «forgetting».",
      "Small presses take the risks the conglomerates gave up on years ago.",
      "Hiring is simple: I ask what they «reread», not what they've read.",
      "Nobody browses in a hurry, so we stopped designing for hurry.",
      "The shop breaks even nine months a year; «December pays» for the other three.",
      "My advice is dull: «know your rent», then know your neighbours.",
      "We shelve arguments next to each other on purpose.",
      "{0} is slow work, but slow work «compounds».",
      "Right now I'm rereading a field guide to mosses, of all things.",
      "The window display changes when a bookseller has something to say, not on a schedule.",
      "We took the discount table out after a year; it taught people to wait, not to read.",
      "We host a readers' swap on the last Friday of the month, and it outsells any promotion.",
      "A customer once drove two hours to collect a pamphlet of «bus timetable poetry»; that's my market research.",
      "Publishers' reps stopped visiting years ago, which is a shame — «gossip is stock intelligence».",
      "The children's corner subsidises the poetry wall, and «nobody needs to know» which way the money flows.",
      "Every returned book gets a note about why; the notes are becoming a book of their own.",
      "We do not sell candles. It was a near thing, one lean February.",
      "Our subscription boxes are packed by whoever is on shift, which is why they have a personality.",
      "«Backlist is compost»: it looks inert, and it feeds everything.",
      "The till is older than two of my booksellers and more reliable than one of them.",
      "I read the returns pile before the new releases; failure is more instructive.",
      "When a school class visits, we let them shelve one book each, anywhere; refiling takes a week and is worth it.",
      "Gift vouchers keep the lights on in January, which no spreadsheet ever predicted.",
    ],
    figCaps: ["Above: the shop floor an hour before opening.", "The requests ledger, started on day one.", "Left: the reading room on a quiet Thursday."],
    books: ["Shelf Life: Notes from a Slow Shop", "The Patient Till", "A Ledger of Requests"],
    bio: (rng, pick, irnd, person, org, title) =>
      `${person[1]} ${person[0]} is the ${title} of ${org}. ${person[2]} spent ${irnd(8, 18)} years ${pick(["as a rights manager in trade publishing", "as a branch librarian", "editing for a university press"])} before opening the shop in ${irnd(2009, 2016)}. ${person[2]} lives above the stockroom in ${pick(["Aldercroft", "Millbrent", "Harrow Fen", "Duncairn"])}.`,
  },
  {
    kickers: ["FIELD NOTES", "THE INTERVIEW", "GROUND LEVEL"],
    mags: ["THE COMMONS QUARTERLY", "FIELD & COUNTER", "STREET & SOIL"],
    headlines: [
      { lines: [[["Dinner grows"]], [["three blocks", 1], [" away"]]] },
      { lines: [[["The rooftop that"]], [["feeds a street", 1]]] },
      { lines: [[["Compost, rent,"]], [["and ", 0], ["radishes", 1]]] },
    ],
    leads: [
      "Six storeys above the bus depot, {name} runs {org} — beds of salad, a seed library, and a weigh-station with strong opinions. We climbed up to ask how a roof feeds a street.",
      "{name}, {title} of {org}, insists the romance wears off in twenty minutes. What's left after that, {name} says, is plumbing, paperwork, and the best tomatoes on the block.",
    ],
    people: [["Abebe", "Desta", "She"], ["Vasquez", "Corin", "He"], ["Ng", "Hazel", "She"], ["Dolan", "Marek", "He"]],
    orgs: ["Ninth Street Rooftop Farm", "the Tin Roof Kitchen", "Bellhaven Growers' Co-op", "the Allotment Project"],
    titles: ["head grower", "founding chef", "co-op steward", "director"],
    sections: ["From gravel to greens", "Feeding a street, not a market", "The volunteer question", "Winter is the real test", "Recipes as infrastructure"],
    questions: [
      "—A farm on a roof sounds romantic. Is it?",
      "—What actually grows well up there?",
      "—Who eats the food?",
      "—How do you keep volunteers coming back?",
      "—What happens in winter?",
      "—Do restaurants take your produce?",
      "—What did the first year get wrong?",
      "—How is this funded?",
      "—What should a city do to make this easier?",
      "—Where is this in five years?",
    ],
    nouns: ["the soil budget", "our seed library", "the Tuesday harvest", "the wash station", "the compost rota", "shared recipes"],
    sentences: [
      "Romantic for about «twenty minutes», and then it's plumbing.",
      "Greens, herbs, and anything that forgives wind; «tomatoes are pure vanity» up here.",
      "Half the harvest goes to the street it grows over — that rule is «non-negotiable».",
      "Volunteers stay for the vegetables and come back for «the company».",
      "Winter is planning season: we fix beds, order seed, and argue about varieties.",
      "Two restaurants buy from us, but the waiting list is longer than the roof.",
      "The first year we grew what looked good on paper instead of what the wind allowed.",
      "Funding is a braid: a city grant, veg-box subscriptions, and {0}.",
      "Cities could start by making «water access» boring and cheap.",
      "We weigh everything; the scale is «the most political object» on this roof.",
      "{0} turned out to matter more than any single crop.",
      "In five years I want three more roofs and «one full-time job» that isn't mine.",
      "A recipe is how a harvest becomes «a habit».",
      "Nobody owns the tools here; the tools own a shelf.",
      "The compost rota has outlasted two landlords and one mayor.",
      "Soil is the one line in the budget I refuse to trim.",
      "We plant for the school kitchen first and the farmers' market last.",
      "If the lift breaks, the whole month breaks; «infrastructure is destiny» up here.",
      "The bees arrived uninvited in year two and immediately unionised the roof.",
      "We log wind speed the way sailors do; «the forecast is a rumour» up here.",
      "Kale survives everything, which is exactly why nobody is excited about kale.",
      "The lift carries soil up and «stories down»; both matter to the funders.",
      "School groups plant the fiddly things; small fingers are our secret infrastructure.",
      "We lost a whole bed of seedlings to one hot Saturday, and now the rota has a deputy.",
      "Rainwater covers three months a year; the rest is a negotiation with the landlord.",
      "{0} gets audited by the volunteers more fiercely than by the council.",
      "Our worst pest is neither slug nor pigeon; it is «the barbecue party» one roof over.",
      "Every crate that leaves the roof is photographed; the album is our annual report.",
      "The chef downstairs trades bread for herbs, and both kitchens think they're winning.",
      "Winter salads sell out first at the market; scarcity is a better label than organic.",
    ],
    figCaps: ["Above: the Tuesday harvest, weighed and logged.", "The seed library lives in a retired filing cabinet.", "Left: beds built from reclaimed scaffold boards."],
    books: ["Common Ground: A Roof, A Street, A Table", "Wind-Tolerant", "The Weigh Station Diaries"],
    bio: (rng, pick, irnd, person, org, title) =>
      `${person[1]} ${person[0]} is the ${title} of ${org}. ${person[2]} spent ${irnd(6, 15)} years ${pick(["as a landscape contractor", "cooking in restaurant kitchens", "teaching horticulture at a further-education college"])} before taking on the roof in ${irnd(2014, 2020)}. The farm now feeds ${irnd(60, 240)} households a week.`,
  },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
