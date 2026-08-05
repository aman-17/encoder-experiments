// FAMILY GENERATOR — Japanese magazine interview spread (dense-TEXT family).
// Genre anchor: wide spread (~2:1.4), large display headline with a colored keyword,
// vertical-rl (tategaki) body columns read right-to-left, sidebar Q&A section markers
// with icons, big gray photo placeholder with vertical lead paragraph + huge vertical
// interviewee name, tiny page numbers.
//
// Drift: 3 discrete layout modes (0 = photo right + lead-on-photo, 1 = mirrored photo
// left, 2 = narrow photo + horizontal standfirst box + profile box), 3 fictional topic
// packs x 2 headlines x 2 interviewees, seeded accent color, body font 10.5-14.2px,
// line-height, emphasis style (bold vs underline) + density, section count 2-3,
// capacity-driven QA fill, furniture strip / magnifier icon toggles, page numbers.
// All content freshly invented; GT = markdown in logical reading order.

const PACKS = [
  {
    furn: "特集　発酵と暮らす",
    headlines: [
      [[["台所からはじめる、", 0]], [["小さな", 0], ["発酵", 1], ["が", 0]], [["毎日を変える", 0]]],
      [[["菌とともに暮らす。", 0]], [["食卓の知恵", 1], ["を", 0]], [["次の世代へつなぐ", 0]]],
    ],
    persons: [
      { sei: "早瀬", name: "早瀬公紀", affil: "発酵文化研究所　Hakko Lab代表", bio: "はやせ・こうき／1974年金沢市生まれ。蔵元での修業を経て2009年に発酵文化研究所を設立。著書に『台所の微生物』『麹と暮らす』など。" },
      { sei: "三雲", name: "三雲遥菜", affil: "みくも発酵室　Mikumo Kitchen主宰", bio: "みくも・はるな／1981年高知市生まれ。管理栄養士。2015年に発酵料理教室「みくも発酵室」を開室。著書に『ゆるい仕込み』など。" },
    ],
    lead: (p) => `味噌や甘酒、ぬか漬け。日本の台所に受け継がれてきた発酵食が、いま静かに見直されています。忙しくても無理なく続く仕込みのコツと、その奥深い世界について、${p.name}さんにお聞きしました。`,
    sections: [
      {
        title: "発酵食が体にいいと言われる理由",
        qas: [
          ["そもそも発酵食品は、なぜ体にいいと言われるのでしょうか。",
            ["発酵とは、微生物が食材の成分を分解して、うま味や香り、栄養を生み出す働きのことです。", "たとえば大豆が味噌になる過程では、たんぱく質がアミノ酸に分解され、消化吸収がぐっとよくなります。", "菌が先に消化してくれている、と考えるとわかりやすいですね。"]],
          ["毎日の食事には、どのくらい取り入れればよいですか。",
            ["特別なことをする必要はありません。", "朝の味噌汁に、ぬか漬けをひと切れ添える。それだけで十分です。", "大切なのは量よりも、切らさずに続けることだと考えています。", "腸内の環境は二週間ほどで入れ替わると言われていますから、まずは半月、続けてみてください。"]],
          ["発酵食品なら何でもよい、というわけではないのでしょうか。",
            ["市販品の中には、加熱処理で菌が失活しているものも少なくありません。", "表示を見て、生きた菌が入っているかを確かめる習慣をつけるとよいですね。", "もちろん、失活していてもうま味や栄養は残っていますので、無駄になるわけではありません。"]],
          ["大人になってから食べ始めても、効果はありますか。",
            ["もちろんです。", "腸内細菌の組成は年齢を重ねても変わり続けます。", "六十代から始めた方の追跡調査でも、三カ月で睡眠の質が改善したという報告が出ています。", "始めるのに遅すぎることはありません。"]],
        ],
      },
      {
        title: "忙しい人のための仕込みのコツ",
        qas: [
          ["仕事や子育てで忙しい人でも、家庭で発酵食を仕込めますか。",
            ["よく誤解されるのですが、発酵の主役は人間ではなく菌です。", "人がやることは、材料を混ぜて置いておくだけ。", "甘酒なら炊飯器で一晩、塩麹なら瓶に入れて一日一回かき混ぜるだけで完成します。", "手間のかかる趣味というより、放っておく技術なんです。"]],
          ["初心者がつまずきやすいポイントはどこでしょう。",
            ["いちばん多い失敗は、清潔にしすぎることと、雑にしすぎることの両極端です。", "容器は熱湯で消毒しつつ、手の常在菌は気にしすぎない。", "このさじ加減は、二、三回仕込めば自然と身につきます。"]],
          ["失敗したかどうかは、どう見分ければいいですか。",
            ["鼻がいちばん正直です。", "ツンとした刺激臭や、明らかに不快なにおいがしたら迷わず処分してください。", "逆に、白い膜のような産膜酵母は見た目ほど怖いものではなく、取り除けば問題ありません。"]],
          ["道具は何をそろえればいいでしょうか。",
            ["ふた付きの瓶と、清潔なスプーン。本当にそれだけです。", "温度計や専用の機械は、続けたくなってからで十分です。", "道具から入って挫折するのが、いちばんもったいないですから。"]],
        ],
      },
      {
        title: "子どもと楽しむ発酵ライフ",
        qas: [
          ["お子さんと一緒に楽しむには、どんな工夫がありますか。",
            ["観察日記をつけるのがおすすめです。", "泡が出た、香りが変わったと、瓶の中の変化を毎日記録するだけで、立派な自由研究になります。", "子どもは菌を飼っているという感覚でかわいがりますよ。"]],
          ["ご家庭では、どんな発酵食を仕込んでいますか。",
            ["定番は味噌と甘酒、それに季節の果物で仕込む酵素シロップです。", "娘は自分の名前を書いたラベルを瓶に貼って、味の変化を競っています。", "食卓の会話が増えたのが、いちばんの効用かもしれません。"]],
          ["最後に、これから始める読者にひと言お願いします。",
            ["発酵は失敗しても、また仕込めばいいだけの、おおらかな文化です。", "完璧を目指さず、台所の隅に小さな瓶をひとつ置くことから始めてみてください。", "その瓶が、暮らしの速度を少しだけゆるめてくれるはずです。"]],
        ],
      },
    ],
  },
  {
    furn: "特集　本屋の未来",
    headlines: [
      [[["町の本屋は、", 0]], [["終わらない。", 0]], [["小さな", 0], ["灯り", 1], ["の育て方", 0]]],
      [[["棚づくりは、", 0]], [["まちづくり", 1], ["。", 0]], [["本屋が残る町の条件", 0]]],
    ],
    persons: [
      { sei: "柏木", name: "柏木伸太郎", affil: "書肆灯台堂　Todaido Books店主", bio: "かしわぎ・しんたろう／1969年尾道市生まれ。出版取次勤務を経て2004年に書肆灯台堂を開業。全国書店員の会世話人。" },
      { sei: "宇野", name: "宇野咲江", affil: "泊まれる本屋汽水　Kisui Books支配人", bio: "うの・さきえ／1986年函館市生まれ。ホテル勤務ののち2018年にブックホテル汽水を開業。選書ユニット「岸辺」メンバー。" },
    ],
    lead: (p) => `全国で書店の閉店が相次ぐなか、地方の小さな店に客足が絶えません。棚と人の関係を結び直し、独自の売り場をつくってきた${p.name}さんに、これからの本屋と町の姿を伺いました。`,
    sections: [
      {
        title: "本が売れない時代の棚づくり",
        qas: [
          ["書店の数は減り続けています。現場の実感はいかがですか。",
            ["数字だけ見れば、たしかに厳しい時代です。", "ただ、うちの店の売上はこの五年、少しずつですが伸びています。", "本が売れないのではなく、本との出会い方が変わったのだと捉えています。"]],
          ["具体的には、どんな棚づくりをされているのでしょう。",
            ["ジャンルで分けるのをやめました。", "たとえば「眠れない夜に」という棚には、小説も科学書も詩集も並びます。", "検索では出会えない一冊に手が伸びる瞬間をつくるのが、実店舗の仕事だと思うんです。", "棚は在庫置き場ではなく、店からの手紙のようなものですね。"]],
          ["仕入れの基準も独特だと聞きました。",
            ["売れそうな本ではなく、この町の誰かの顔が浮かぶ本を仕入れます。", "百人に一冊ずつ売るより、ひとりに深く届く十冊を選ぶ。", "小さな店の強みは、その解像度の高さにあります。"]],
        ],
      },
      {
        title: "店を続けるためのお金の話",
        qas: [
          ["理想だけでは店は続きません。経営面の工夫を教えてください。",
            ["粗利の低い新刊だけに頼らないことです。", "古書とコーヒー、それに月額制の読書会を組み合わせて、収入の柱を四本に増やしました。", "どれかが不調でも店が揺らがない構えをつくっています。"]],
          ["読書会は、どんな方が参加されているのですか。",
            ["二十代の会社員から八十代の常連さんまで、実にさまざまです。", "同じ本を読んでも、感想は世代でまったく違う。", "その違いこそが、この会のいちばんの商品なのかもしれません。"]],
          ["価格競争とは距離を置いているように見えます。",
            ["定価販売の書籍は、そもそも価格で勝負できません。", "だからこそ、選ぶ手間と語る言葉に値段がつく商売だと割り切っています。", "うちで買う理由を毎日つくり続けるしかないんです。"]],
        ],
      },
      {
        title: "これからの町と本屋",
        qas: [
          ["今後、挑戦したいことはありますか。",
            ["空き店舗を借りて、一夜限りの本屋を開く実験を続けています。", "本屋がない町に、ひと晩だけ灯りをともす。", "その灯りを見た誰かが、次の店主になってくれたらうれしいですね。"]],
          ["本屋を始めたい人に伝えたいことはありますか。",
            ["小さく始めて、やめない工夫を先に考えてください。", "棚三本からでも本屋は名乗れます。", "続いている店だけが、町の記憶になっていきます。"]],
          ["最後に、読者へメッセージをお願いします。",
            ["近所の本屋で、目的の本以外を一冊買ってみてください。", "その偶然の一冊が、あなたと町の関係を少しだけ変えてくれるはずです。"]],
        ],
      },
    ],
  },
  {
    furn: "特集　働き方の設計図",
    headlines: [
      [[["週休三日", 1], ["が、", 0]], [["会社を強くする", 0]], [["という逆説", 0]]],
      [[["休むほどに、", 0]], [["成果", 1], ["が伸びる。", 0]], [["小さな会社の挑戦", 0]]],
    ],
    persons: [
      { sei: "香坂", name: "香坂理央", affil: "働き方デザイン機構　Worklab代表", bio: "こうさか・りお／1977年松本市生まれ。社会保険労務士。2012年に働き方デザイン機構を設立し、中小企業の制度設計を支援する。" },
      { sei: "藤丸", name: "藤丸康生", affil: "藤丸経営研究所　Fujimaru Lab所長", bio: "ふじまる・こうせい／1972年久留米市生まれ。銀行勤務を経て2010年に藤丸経営研究所を設立。休み方改革の実証研究を続ける。" },
    ],
    lead: (p) => `人手不足に悩む中小企業のあいだで、思い切って休みを増やす経営が広がりはじめています。百社を超える導入企業を調査してきた${p.name}さんに、休むほど強くなる会社の仕組みを聞きました。`,
    sections: [
      {
        title: "なぜ休むほど業績が上がるのか",
        qas: [
          ["休みを増やして業績が上がるとは、にわかに信じがたいのですが。",
            ["私も最初は半信半疑でした。", "ただ、三年間で百二十社を調査すると、はっきりした傾向が出ました。", "労働時間が二割減っても、成果はほとんど落ちない。", "会議と資料づくりという、成果に直結しない時間から先に削られていくからです。"]],
          ["どんな企業でも導入できるのでしょうか。",
            ["向き不向きはあります。", "属人化が激しい職場では、まず仕事の見える化から始める必要があります。", "逆に言えば、週休三日は業務整理の強力なきっかけになるということです。"]],
          ["調査で意外だった発見はありますか。",
            ["休みが増えた社員ほど、社外の学び直しに時間を使っていたことです。", "その知識が新しい商品につながった例が、調査先の一割強でありました。", "休息と成長は、対立するものではなかったんです。"]],
        ],
      },
      {
        title: "現場で起きた小さな革命",
        qas: [
          ["導入した企業では、どんな変化がありましたか。",
            ["象徴的なのは、ある金属加工の会社です。", "求人に応募が来ず廃業も考えていたのが、週休三日を掲げた途端、若手の応募が三十倍になりました。", "採用コストの削減額だけで、減った稼働時間の穴を埋めてお釣りが来た計算です。"]],
          ["一方で、失敗した例はないのでしょうか。",
            ["もちろんあります。", "休みだけ増やして仕事の中身を変えなかった会社は、ほぼ例外なく数カ月で元に戻りました。", "制度は道具にすぎません。", "先に変えるべきは、時間ではなく仕事の設計図なんです。"]],
          ["従業員の側からは、どんな声が聞かれますか。",
            ["最初の一カ月は、休み方がわからないという戸惑いが目立ちます。", "三カ月を過ぎるころには、家族との時間や趣味の予定が先に入るようになる。", "手帳の景色が変わると、仕事の景色も変わっていきますね。"]],
        ],
      },
      {
        title: "個人はどう備えるか",
        qas: [
          ["働く個人は、この流れにどう備えればよいですか。",
            ["自分の仕事を、時間ではなく成果で説明できるようにしておくことです。", "何時間頑張ったかではなく、何を動かしたか。", "その語彙を持っている人から順に、休みを増やしても評価される側に回っていきます。"]],
          ["最後に、経営者の読者へひと言お願いします。",
            ["休みは福利厚生ではなく投資です。", "回収の設計さえ怠らなければ、これほど利回りのいい投資はないと、データが示しています。"]],
          ["次の調査では、何を明らかにしたいですか。",
            ["休み方と離職率の関係を、五年単位で追いかけたいと考えています。", "採用の入口だけでなく、定着の出口まで含めて制度の価値を測るのが次の宿題です。"]],
        ],
      },
    ],
  },
];

const ACCENTS = ["#e8641b", "#d7263d", "#0e8f8b", "#c2185b"];
const PAPERS = ["#faf8f3", "#f8f7f2", "#fbfaf6"];

export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const rnd = (a, b) => a + rng() * (b - a);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const cp = (s) => [...s].length;

  // ---- page geometry (wide spread ~2:1.41, A3 landscape) ----
  const W = 1584, H = 1117;

  // ---- discrete layout mode ----
  const mode = ri(0, 2); // 0 photo-right, 1 photo-left (mirrored), 2 narrow photo + standfirst + profile

  // ---- content choices ----
  const pack = pick(PACKS);
  const headline = pick(pack.headlines);
  const person = pick(pack.persons);
  const lead = pack.lead(person);
  const accent = pick(ACCENTS);
  const paper = pick(PAPERS);

  const useFurn = rng() < 0.65;
  const useLens = rng() < 0.75;
  const pgBase = 2 * ri(1, 48); // right page number (RTL book: right < left)

  // sections: keep order, 3 with p=.75 else drop one
  let secs = pack.sections.slice();
  const threeSecs = rng() < 0.75;
  if (!threeSecs) secs.splice(ri(0, 2), 1);

  // ---- typography knobs ----
  let f = threeSecs ? rnd(10.5, 12.5) : rnd(13.0, 14.2); // body font px
  let lh = threeSecs ? rnd(1.72, 1.9) : rnd(1.88, 2.0);
  const emphU = rng() < 0.35; // underline vs bold key sentences
  const emphDensity = rnd(0.2, 0.6);
  const mtF = rnd(12, 13.5); // marker title font
  const hue = pick(["#3f3f3f", "#4a4a4a", "#37393b"]); // headline gray
  const grayBase = ri(118, 150); // photo tone
  const nameF = ri(52, 66);
  const nameLs = ri(4, 10);
  const lf = rnd(12.5, 14.5); // lead font (on-photo)
  const leadLh = 2.05;

  // ---- geometry derived ----
  const photoFrac = mode === 2 ? rnd(0.38, 0.42) : rnd(0.46, 0.51);
  const photoW = Math.round(W * photoFrac);
  const textPageW = W - photoW;
  const padOuter = 42, padGutter = 28, padTop = 32, padBottom = 48;
  const textW = textPageW - padOuter - padGutter;

  const maxLineChars = Math.max(...headline.map((ln) => cp(ln.map((s) => s[0]).join(""))));
  let hSize = ri(58, 74);
  hSize = Math.min(hSize, Math.floor((textW - 30) / maxLineChars));
  const headH = Math.round(headline.length * hSize * 1.18) + 6;
  const headGap = ri(16, 26);

  // standfirst (mode 2): lead rendered horizontally under headline
  let sfH = 0;
  const sfF = 13.5;
  if (mode === 2) {
    const charsPerLine = Math.floor((textW - 34) / sfF);
    sfH = Math.ceil(cp(lead) / charsPerLine + 1) * Math.round(sfF * 1.85) + 26;
  }

  const bodyH = H - padTop - headH - headGap - padBottom - (mode === 2 ? sfH + 14 : 0);

  // profile box (mode 2)
  const pbF = 11;
  let pbW = 0;
  if (mode === 2) {
    const pbRows = Math.floor(((bodyH - 26) * 0.9) / pbF);
    pbW = (Math.ceil(cp(person.bio) / pbRows) + 1) * Math.round(pbF * 1.75) + 24;
  }

  // ---- capacity-driven QA fill ----
  const markerW = 50, gap = 14;
  const chosen = secs.map((s) => ({ s, count: 1 }));
  const paraLens = (c) => {
    const out = [];
    for (let i = 0; i < c.count; i++) {
      out.push(cp("——" + c.s.qas[i][0]));
      out.push(cp(person.sei + "　" + c.s.qas[i][1].join("")));
    }
    return out;
  };
  let rows, effRows, pitch, pgap;
  const recalc = () => {
    rows = Math.max(20, Math.floor((bodyH - 8) / f));
    effRows = Math.max(14, Math.floor(rows * 0.92));
    pitch = f * lh;
    pgap = Math.round(pitch * 0.4);
  };
  const blockW = (lens) =>
    lens.reduce((s, L) => s + Math.ceil(L / effRows), 0) * pitch + (lens.length - 1) * pgap + pitch * 0.9;
  const totalW = () => {
    const items = chosen.length * 2 + (mode === 2 ? 1 : 0);
    return (
      chosen.reduce((s, c) => s + blockW(paraLens(c)), 0) +
      chosen.length * markerW + (items - 1) * gap + pbW
    );
  };
  recalc();
  let guard = 0;
  while (totalW() > textW && guard++ < 3) { f -= 0.6; recalc(); }
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of chosen) {
      if (c.count < c.s.qas.length) {
        c.count++;
        if (totalW() > textW - 8) c.count--;
        else changed = true;
      }
    }
  }

  // ---- build body HTML + GT (emphasis decided once, used in both) ----
  const gtParts = [];
  if (useFurn) gtParts.push(pack.furn);
  gtParts.push("# " + headline.map((ln) => ln.map((s) => s[0]).join("")).join(""));
  gtParts.push(lead);
  gtParts.push(person.affil);
  gtParts.push("## " + person.name);

  let bodyItems = "";
  const mic = `<div class="mic"><div class="micr"></div><div class="mich"></div></div>`;
  for (const c of chosen) {
    gtParts.push("### " + c.s.title);
    bodyItems += `<div class="marker">${mic}<div class="mtitle">${c.s.title}</div></div>`;
    let paras = "";
    const lens = [];
    for (let i = 0; i < c.count; i++) {
      const [q, sents] = c.s.qas[i];
      lens.push(cp("——" + q));
      lens.push(cp(person.sei + "　" + sents.join("")));
      paras += `<p class="q">——${q}</p>`;
      gtParts.push(`**——${q}**`);
      let emphIdx = -1;
      if (sents.length >= 2 && rng() < emphDensity) emphIdx = Math.floor(rng() * sents.length);
      const hSent = sents.map((s, j) => (j === emphIdx ? (emphU ? `<u>${s}</u>` : `<b>${s}</b>`) : s)).join("");
      const gSent = sents.map((s, j) => (j === emphIdx ? (emphU ? `<u>${s}</u>` : `**${s}**`) : s)).join("");
      paras += `<p><b class="sp">${person.sei}</b>　${hSent}</p>`;
      gtParts.push(`**${person.sei}**　${gSent}`);
    }
    const wpx = Math.ceil(blockW(lens));
    bodyItems += `<div class="tblock" style="width:${wpx}px">${paras}</div>`;
  }
  if (mode === 2) {
    gtParts.push("### プロフィール");
    gtParts.push(person.bio);
    bodyItems += `<div class="pbox" style="width:${pbW}px"><div class="pbt">プロフィール</div><div class="pbb">${person.bio}</div></div>`;
  }
  gtParts.push(String(pgBase));
  gtParts.push(String(pgBase + 1));
  const gt = gtParts.join("\n\n");

  // ---- headline HTML ----
  const indents = headline.map((_, i) => (i === 0 ? 0 : ri(0, Math.round(hSize * 0.8))));
  const headHtml = headline
    .map((ln, i) =>
      `<div class="hl" style="padding-left:${indents[i]}px">` +
      ln.map(([t, col]) => (col ? `<span class="hc">${t}</span>` : t)).join("") +
      `</div>`)
    .join("");

  // ---- photo page pieces ----
  const g0 = grayBase, g1 = grayBase + 24;
  const shelves = [0.18, 0.42, 0.66]
    .map((y) => `<div class="shelf" style="top:${Math.round(y * 100 + rnd(-4, 4))}%;opacity:${rnd(0.08, 0.16).toFixed(2)}"></div>`)
    .join("");
  const leadH = Math.min(Math.round(H * 0.53), ri(500, 580));
  const leadRows = Math.floor(((leadH - 24) * 0.92) / lf);
  const leadWpx = Math.ceil(Math.ceil(cp(lead) / leadRows) * lf * leadLh) + 20;
  const leadOnPhoto = mode !== 2;
  const leadBox = leadOnPhoto
    ? `<div class="leadbox" style="${mode === 0 ? "right:26px" : "left:26px"};width:${leadWpx}px;height:${leadH}px">${lead}</div>`
    : "";
  const nameSide = mode === 1 ? "right:40px" : "left:36px";
  const nameBlock =
    `<div class="nameblk" style="${nameSide}">` +
    `<div class="affil">${person.affil}</div>` +
    `<div class="bigname">${person.name}</div></div>`;

  // ---- furniture / lens icon ----
  const furnSide = mode === 1 ? "right" : "left";
  const furnHtml = useFurn ? `<div class="furn" style="${furnSide}:${padOuter}px">${pack.furn}</div>` : "";
  const lensSize = ri(110, 150);
  const lensHtml = useLens
    ? `<div class="lens" style="width:${lensSize}px;height:${lensSize}px;top:${ri(4, 40)}px;right:${ri(6, 60)}px">` +
      `<div class="lring"></div><div class="lhandle"></div></div>`
    : "";
  const sfHtml = mode === 2 ? `<div class="standfirst" style="height:${sfH}px">${lead}</div>` : "";

  // ---- assemble spread ----
  const textPage =
    `<div class="tpage">
      ${furnHtml}
      <div class="headwrap" style="height:${headH}px">${lensHtml}${headHtml}</div>
      ${sfHtml}
      <div class="body" style="height:${bodyH}px">${bodyItems}</div>
    </div>`;
  const photoPage =
    `<div class="ppage"><div class="photo">${shelves}</div>${leadBox}${nameBlock}</div>`;
  const pages = mode === 1 ? photoPage + textPage : textPage + photoPage;
  const gutterX = mode === 1 ? photoW : textPageW;
  const pnLeftCol = mode === 1 ? "#f2f2f2" : "#777";
  const pnRightCol = mode === 1 ? "#777" : "#f2f2f2";

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 420mm 297mm; margin: 0; }
* { margin:0; padding:0; box-sizing:border-box; }
body { width:${W}px; height:${H}px; background:${paper};
  font-family:"Hiragino Mincho ProN","Hiragino Mincho Pro","Yu Mincho",serif; color:#252525; }
.spread { position:relative; width:${W}px; height:${H}px; display:flex; overflow:hidden; }
.tpage { position:relative; width:${textPageW}px; height:100%;
  padding:${padTop}px ${mode === 1 ? padOuter : padGutter}px ${padBottom}px ${mode === 1 ? padGutter : padOuter}px; }
.ppage { position:relative; width:${photoW}px; height:100%; }
.photo { position:absolute; inset:0; background:linear-gradient(163deg, rgb(${g0},${g0 - 3},${g0 - 8}), rgb(${g1},${g1 - 2},${g1 - 6})); }
.shelf { position:absolute; left:0; right:0; height:14px; background:#fff; }
.furn { position:absolute; top:13px; font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;
  font-size:10.5px; letter-spacing:4px; color:#8a8a8a; }
.headwrap { position:relative; margin-bottom:${headGap}px; }
.hl { position:relative; z-index:2; font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;
  font-weight:800; font-size:${hSize}px; line-height:1.18; color:${hue}; letter-spacing:1px; }
.hc { color:${accent}; }
.lens { position:absolute; z-index:1; border-radius:50%;
  background:radial-gradient(circle at 38% 34%, #f8d878, #f2c33b 70%); }
.lring { position:absolute; top:22%; left:20%; width:38%; height:38%; border:${Math.round(lensSize * 0.055)}px solid rgba(255,255,255,.95); border-radius:50%; }
.lhandle { position:absolute; bottom:6%; right:2%; width:11%; height:34%; background:#8f8f8f; border-radius:7px; transform:rotate(-45deg); }
.body { position:relative; display:flex; flex-direction:row-reverse; justify-content:flex-start; gap:${gap}px; }
.marker { flex:0 0 ${markerW}px; display:flex; flex-direction:column; align-items:center; }
.mic { position:relative; width:32px; height:32px; border-radius:50%; background:${accent}; flex:0 0 32px; }
.micr { position:absolute; top:6px; left:6px; width:12px; height:12px; border:2.5px solid #fff; border-radius:50%; }
.mich { position:absolute; bottom:5px; right:6px; width:3.5px; height:9px; background:#fff; border-radius:2px; transform:rotate(-45deg); }
.mtitle { writing-mode:vertical-rl; margin-top:10px; font-family:"Hiragino Sans",sans-serif;
  font-weight:700; font-size:${mtF.toFixed(1)}px; line-height:1.3; color:${accent}; }
.tblock { writing-mode:vertical-rl; height:100%; flex:0 0 auto;
  font-size:${f.toFixed(1)}px; line-height:${lh.toFixed(2)}; }
.tblock p { margin-block-end:${pgap}px; }
.tblock p.q { font-weight:700; color:#161616; font-family:"Hiragino Sans",sans-serif; }
.sp { font-family:"Hiragino Sans",sans-serif; }
.standfirst { margin-bottom:14px; padding:13px 17px; background:${accent}14; border-left:4px solid ${accent};
  font-size:${sfF}px; line-height:1.85; }
.pbox { writing-mode:vertical-rl; height:100%; flex:0 0 auto; border:1px solid ${accent};
  background:#ffffffb8; padding:12px 10px; }
.pbt { font-family:"Hiragino Sans",sans-serif; font-weight:700; color:${accent};
  font-size:${(pbF + 1).toFixed(0)}px; margin-block-end:${Math.round(pbF * 0.8)}px; }
.pbb { font-size:${pbF}px; line-height:1.72; }
.leadbox { position:absolute; top:26px; writing-mode:vertical-rl; padding:12px 10px;
  font-size:${lf.toFixed(1)}px; line-height:${leadLh}; color:#fff; text-shadow:0 0 7px rgba(0,0,0,.5);
  font-family:"Hiragino Sans",sans-serif; font-weight:600; }
.nameblk { position:absolute; bottom:34px; display:flex; flex-direction:row-reverse; align-items:flex-start; gap:10px; }
.affil { writing-mode:vertical-rl; font-family:"Hiragino Sans",sans-serif; font-size:13px;
  letter-spacing:3px; color:#fff; text-shadow:0 0 6px rgba(0,0,0,.55); }
.bigname { writing-mode:vertical-rl; font-family:"Hiragino Sans",sans-serif; font-weight:800;
  font-size:${nameF}px; letter-spacing:${nameLs}px; color:#fff; text-shadow:0 1px 10px rgba(0,0,0,.45); }
.gutter { position:absolute; top:0; bottom:0; left:${gutterX - 2}px; width:4px; z-index:5;
  background:linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,.14), rgba(0,0,0,0)); }
.pn { position:absolute; bottom:12px; z-index:6; font-size:10px; font-family:Arial,sans-serif; }
</style></head><body>
<div class="spread">
${pages}
<div class="gutter"></div>
<div class="pn" style="right:16px;color:${pnRightCol}">${pgBase}</div>
<div class="pn" style="left:16px;color:${pnLeftCol}">${pgBase + 1}</div>
</div>
</body></html>`;

  return { html, gt, pageOpts: { width: "420mm", height: "297mm" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
