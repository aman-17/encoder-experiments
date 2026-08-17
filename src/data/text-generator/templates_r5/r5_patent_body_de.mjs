// FAMILY GENERATOR — German patent description body page (DE ... T5 / A1 / B4 style).
// Dense single- or two-column justified body text: bold [00NN] paragraph markers, motif
// blocks with (i)/(ii)/(iii) labels + long uppercase bracket-code sequences, run-on
// percentage enumerations, en-dash sub-lists of database accessions and amino-acid
// coordinates, "N/NNN" page footer. GT = markdown TEXT with exact emphasis fidelity.
//
// Training-data mode: 4 discrete layout modes (motif-top / mid-page-continuation /
// two-column / sectioned-with-heading) plus continuous jitter on font family+size,
// leading, margins, column gap, paragraph gap, emphasis density (bold/italic/underline),
// motif count, list lengths, percentage-list step+format, header/footer style and the
// paragraph-number range. All prose is freshly composed German; every enzyme, species,
// database, algorithm, program, author and accession number is FICTIONAL. Pages fill to
// the bottom margin and break mid-word with a hyphen, as real patent body pages do.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const chance = (p) => rng() < p;
  const shuffle = (a) => {
    const c = a.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  };

  // ---------------------------------------------------------------- emphasis markup
  // One authored string carries emphasis as §b{..} §i{..} §u{..}; expand to HTML or MD.
  const expand = (s, t) =>
    s.replace(/§([biu])\{([^}]*)\}/g, (_, k, x) =>
      t === "h"
        ? k === "b" ? `<b>${x}</b>` : k === "i" ? `<i>${x}</i>` : `<u>${x}</u>`
        : k === "b" ? `**${x}**` : k === "i" ? `*${x}*` : `<u>${x}</u>`);
  const bare = (s) => s.replace(/§[biu]\{([^}]*)\}/g, "$1");
  const S = (s) => ({ raw: s, h: expand(s, "h"), m: expand(s, "m"), len: bare(s).length, plain: !/§/.test(s) });

  // ---------------------------------------------------------------- fictional pools
  const enzymes = ["Sulfotransferase", "Transaldolase", "Peroxiredoxin", "Decarboxylase",
    "Aminotransferase", "Hydratase", "Thioesterase", "Glucosyltransferase", "Oxidoreduktase",
    "Carboxylesterase", "Phosphodiesterase", "Deaminase", "Acyltransferase", "Dehydratase"];
  const polySuffix = ["-Related-Like-Polypeptid", "-Homolog-Polypeptid", "-Like-Polypeptid", "-Typ-Polypeptid"];
  const POLY = pick(enzymes) + pick(polySuffix);
  const PROT = POLY.replace("Polypeptid", "Protein");
  const POLYG = POLY + "s";
  const PROTG = PROT + "s";

  const species = shuffle(["Nicotiana pallida", "Hordeum ferox", "Zea kalmensis", "Brassica velutina",
    "Solanum arenicola", "Triticum boreale", "Oryza fuscata", "Medicago petraea", "Sorghum halinum"]);
  const SP1 = species[0], SP2 = species[1], SP3 = species[2];

  const dbs = [
    ["Superfamilien-Datenbank", () => "SSF " + ri(41000, 79000)],
    ["HMMProfil-Datenbank", () => "PF" + String(ri(120, 9400)).padStart(5, "0")],
    ["PANTHERA-Datenbank", () => "PTHR" + ri(10200, 48900)],
    ["Gene4D-Datenbank", () => "G4DSA: " + `${ri(1, 4)}.${ri(10, 90)}.${ri(110, 940)}.${ri(10, 90)}`],
    ["DomainScan-Datenbank", () => "DS" + ri(1200, 9800)],
    ["ProSite-Plus-Datenbank", () => "PSP" + String(ri(140, 9100)).padStart(5, "0")],
    ["InterDom-Datenbank", () => "IDR" + ri(102000, 989000)],
    ["PfamX-Datenbank", () => "PFX" + String(ri(110, 9300)).padStart(5, "0")],
  ];
  const algos = ["PATSCAN", "MOTIFINDER", "CONSENS-B", "PROFILEX", "SEQMOTIF-II", "DOMSCAN", "BLOCKFIT"];
  const alignAlgos = ["Halvorsen-Ito", "Bräuer-Sato", "Lindqvist-Amrani", "Nowak-Feldman", "Okonkwo-Vasquez"];
  const programs = ["ALIGNIX (Vantera-Suite, Kelbrook)", "GLOBALIGN (Meridia-Paket, Delft)",
    "SEQMATCH (Nordhoff-Werkzeugsammlung)", "PROTALIGN (Aurel-Softwarepaket, Trient)"];
  const authors = ["Halvorsen und Ito", "Bräuer et al.", "Lindqvist und Amrani", "Tessaro und Bhatt",
    "Nowak und Feldman", "Rutkowski et al.", "Okonkwo und Bergmann", "Vasquez und Lindner"];
  const venues = ["Proceedings of the Fifth Workshop on Computational Sequence Analysis",
    "Proceedings of the Third International Symposium on Protein Motif Discovery",
    "Journal of Applied Bioinformatics", "Annals of Computational Proteomics",
    "Proceedings of the Ninth Conference on Structural Genomics"];
  const pubs = ["Marlow Press", "Vandermeer Verlag", "Kelbrook Academic", "Aurel Press", "Nordhoff Verlag"];
  const cities = ["Genf", "Leuven", "Uppsala", "Trient", "Delft", "Aarhus"];
  const tables = ["Tabelle A", "Tabelle B", "Tabelle C", "Tabelle D", "Tabelle E1", "Tabelle F2"];
  const promoters = ["NpAct7", "HfUbi3", "ZkRbcS2", "pMel4", "TbGlu1", "OfSuc2"];
  const terminators = ["tNpA", "tHfU", "tZkR", "tMel4", "tBv9"];
  const methods = ["Agrobacterium-vermittelte Transformation", "biolistischen Partikeltransfer",
    "Protoplastentransformation", "Vakuuminfiltration der Blütenstände"];
  const traits = ["Samenausbeute", "Biomasse der oberirdischen Organe", "Trockenstresstoleranz",
    "Wurzellänge unter Nährstoffmangel", "Tausendkornmasse", "Blattflächenzuwachs", "Keimungsrate bei Kältestress"];
  const acts = ["Enzymaktivität", "spezifischen Umsatzrate", "Substratumsetzung", "Restaktivität nach Hitzeeinwirkung"];
  const buffers = ["HEPES", "MOPS", "Tris-HCl", "Kaliumphosphat", "Bis-Tris"];
  const substrates = ["UDP-Glucose", "Malonyl-CoA", "4-Nitrophenylacetat", "Coniferylalkohol", "Phosphoenolpyruvat"];

  const TAB = pick(tables), TAB2 = pick(tables);
  const ALGO = pick(algos), ALGN = pick(alignAlgos), PROG = pick(programs);
  const cite = () => `${pick(authors)}, ${pick(venues)}, S. ${ri(14, 240)}–${ri(250, 396)}, ${pick(pubs)}, ${pick(cities)}, ${ri(1996, 2009)}`;
  const CITE = cite();
  const sid = ri(58, 412);              // main SEQ ID NR
  const motifBase = ri(3, 26);          // motif numbering
  const seqBase = ri(180, 390);         // motif SEQ ID NRs
  const coordMotif = motifBase + ri(3, 6);
  const coordSeq = seqBase + ri(4, 9);

  // ------------------------------------------------------------------- emphasis knobs
  const uMode = ri(0, 3);               // 0 none, 1 db names, 2 table refs, 3 both
  const boldTerm = chance(0.45);        // bold the defined term in quotes
  const boldMotifLabel = chance(0.4);   // bold "Motiv 7:" labels
  const italSpecies = true;
  const U = (t, on) => (on ? `§u{${t}}` : t);
  const dbRef = (name) => U(name, uMode === 1 || uMode === 3);
  const tabRef = (name) => U(name, uMode === 2 || uMode === 3);
  const spRef = (s) => (italSpecies ? `§i{${s}}` : s);

  // ---------------------------------------------------------------- layout + geometry
  // Balanced across consecutive seeds so a 50-seed batch covers every layout evenly.
  const mode = seed % 4;                // 0 motif-top, 1 continuation, 2 two-column, 3 sectioned
  const twoCol = mode === 2;
  // CW = mean rendered char width in em for German patent prose, measured per stack in
  // this Chromium build (see _probe3); line estimates depend on it, so keep them in sync.
  const fonts = [
    ['Arial, Helvetica, sans-serif', 0.490],
    ['"Helvetica Neue", Helvetica, Arial, sans-serif', 0.492],
    ['Tahoma, Geneva, sans-serif', 0.484],
    ['Georgia, "Times New Roman", serif', 0.492],
    ['"Times New Roman", Times, serif', 0.450],
  ];
  const fIdx = chance(0.76) ? ri(0, 2) : ri(3, 4);
  const [FONT, CW] = fonts[fIdx];

  const PT = 0.3528;                    // mm per pt
  const pageW = 210, pageH = 297;
  const mx = 17 + rng() * 7;            // side margin 17-24mm
  const mTop = 11 + rng() * 5;
  const mBot = 10 + rng() * 5;
  const fs = twoCol ? 6.9 + rng() * 1.1 : 7.5 + rng() * 1.5;
  const lhF = 1.25 + rng() * 0.17;
  const lh = fs * lhF;                  // pt
  const lhMm = lh * PT;
  const hdrFs = fs * (1.12 + rng() * 0.24);
  const ftrFs = fs * (0.94 + rng() * 0.18);
  const hdrGap = 4 + rng() * 4;
  const ftrGap = 3 + rng() * 3.5;
  const gapFrac = 0.42 + rng() * 0.36;  // inter-paragraph gap in line units
  const indentMm = 3.4 + rng() * 2.4;   // dash-list indent
  const motifScale = 1.0 + rng() * 0.14;
  const hdrStyle = ri(0, 2);            // 0 centred, 1 split L/R, 2 centred + rule
  const ftrStyle = chance(0.82) ? 0 : 1;

  const bodyTop = mTop + hdrFs * PT * 1.25 + hdrGap;
  const bodyBot = pageH - mBot - ftrFs * PT * 1.3 - ftrGap;
  const bodyH = bodyBot - bodyTop;
  const budget = Math.floor(bodyH / lhMm);
  // The fill loop targets bodyH, but per-block line estimates can accumulate a little
  // short; let the clip box reach one line further into the footer gap so a rare
  // underestimate spills instead of losing the last line of text.
  const clipPad = Math.min(lhMm, ftrGap * 0.9);
  const contentW = pageW - 2 * mx;
  const colGap = twoCol ? 5.5 + rng() * 4 : 0;
  const colW = twoCol ? (contentW - colGap) / 2 : contentW;
  const cpl = colW / (CW * fs * PT);                       // chars per justified line
  // Justification leaves ragged space at line ends that an average-char model cannot see,
  // so prose gets a 2.8% capacity haircut: estimates must never fall short of the render,
  // or the last paragraph in a column loses a line to the overflow clip.
  const cplP = cpl * 0.972;
  const cplIndent = cpl * (colW - indentMm) / colW;
  // Motif lines hold one long uppercase bracket token whose only break opportunities are
  // after "]" and at spaces, so an average-char-width model mispredicts them badly. Wrap
  // them for real, using per-character em widths scaled off the family's measured CW.
  const emScale = CW / 0.490;
  const chw = (c) => {
    if (c === "[" || c === "]" || c === "(" || c === ")" || c === "-") return 0.333 * emScale;
    if (c === " " || c === ":" || c === "," || c === ".") return 0.278 * emScale;
    if (c >= "0" && c <= "9") return 0.556 * emScale;
    if (c >= "A" && c <= "Z") return 0.70 * emScale;
    return 0.5 * emScale;
  };
  const emWidth = (s) => { let w = 0; for (const c of s) w += chw(c); return w; };
  const lblEm = 0.9 / PT;                                 // .lb min-width, in body-em
  // The sequence span is word-break:break-all (matching the anchor, which breaks mid-run),
  // so it contributes one chunk per character; prefix and tail break at spaces.
  function motifLines(it) {
    const lineEm = colW / (fs * motifScale * PT);         // line width in motif-em
    const chunks = [];
    for (const w of bare(it.nm).split(" ")) chunks.push(w + " ");
    for (const t of it.seq.match(/\[[^\]]+\]|./g) || []) chunks.push(t);
    for (const w of it.tail.trim().split(" ")) chunks.push(" " + w);
    let lines = 1, w = Math.max(emWidth(it.label), lblEm / motifScale);
    for (const c of chunks) {
      const cw = emWidth(c);
      if (w > 0 && w + cw > lineEm) { lines++; w = cw; } else w += cw;
    }
    return lines;
  }

  // ------------------------------------------------------------------ page furniture
  const kinds = ["T5", "A1", "B4", "T2", "A9"];
  const kindCode = pick(kinds);
  const y1 = ri(2011, 2019);
  const docNo = (kindCode === "T5" || kindCode === "T2")
    ? `DE 11 ${y1} ${String(ri(1, 9)).padStart(3, "0")} ${String(ri(1, 999)).padStart(3, "0")} ${kindCode}`
    : `DE 10 ${y1} ${String(ri(1, 99)).padStart(3, "0")} ${String(ri(1, 999)).padStart(3, "0")} ${kindCode}`;
  const pubDate = `${y1 + ri(1, 3)}.${String(ri(1, 12)).padStart(2, "0")}.${String(ri(1, 28)).padStart(2, "0")}`;
  const headerLine = `${docNo}    ${pubDate}`;
  const totPages = ri(48, 340);
  const curPage = ri(4, totPages - 3);
  const footerLine = ftrStyle === 0 ? `${curPage}/${totPages}` : `– ${curPage}/${totPages} –`;

  // ---------------------------------------------------------------- content builders
  const AA = "ACDEFGHIKLMNPQRSTVWY";
  function motifSeq(len) {
    let s = "", plain = 0;
    while (plain < len) {
      const r = rng();
      if (r < 0.26) {
        const k = ri(2, 3), used = new Set();
        let g = "";
        while (g.length < k) { const c = AA[Math.floor(rng() * 20)]; if (!used.has(c)) { used.add(c); g += c; } }
        s += "[" + g + "]"; plain += 1;
      } else if (r < 0.29) { s += "x"; plain += 1; }
      else { s += AA[Math.floor(rng() * 20)]; plain += 1; }
    }
    return s;
  }

  // Percentage run-on. Step 1 always uses the German "N %" spacing; compact "N%" only
  // ever appears with a step > 1, so no seed reproduces the anchor's literal run.
  function pctRun(start) {
    const step = chance(0.62) ? 1 : pick([2, 5, 5, 10]);
    const sp = step === 1 ? " %" : "%";
    const parts = [];
    for (let p = start; p < 99; p += step) parts.push(p + sp);
    parts.push("99" + sp);
    const last = parts.pop();
    return parts.join(", ") + (chance(0.55) ? " oder " : ", ") + last;
  }

  const romans = ["(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)"];
  const letters = ["a)", "b)", "c)", "d)", "e)", "f)"];
  const labelSet = chance(0.72) ? romans : letters;

  function motifBlock() {
    const n = ri(2, 4);
    const items = [];
    for (let i = 0; i < n; i++) {
      const nm = boldMotifLabel ? `§b{Motiv ${motifBase + i}:}` : `Motiv ${motifBase + i}:`;
      const seq = motifSeq(ri(44, 82));
      const tail = ` (SEQ ID NR: ${seqBase + i})${i === n - 1 ? "." : ","}`;
      items.push({
        label: labelSet[i], nm, seq, tail,
        h: `<span class="lb">${labelSet[i]}</span> ${expand(nm, "h")} <span class="sq">${seq.replace(/\[[^\]]+\]/g, (g) => `<span class="ng">${g}</span>`)}</span>${tail}`,
        m: `${labelSet[i]} ${expand(nm, "m")} ${seq}${tail}`,
      });
    }
    return { type: "motif", items };
  }

  function headBlock() {
    const t = pick([
      `Beispiel ${ri(2, 14)}: Bestimmung der ${pick(acts)} in transgenen Linien`,
      `Ausführungsbeispiele`,
      `Beschreibung der bevorzugten Ausführungsformen`,
      `Beispiel ${ri(2, 14)}: Herstellung des Expressionskonstrukts`,
      `Definitionen`,
    ]);
    return { type: "head", level: chance(0.55) ? 2 : 3, text: t };
  }

  // ------------------------------------------------------------- paragraph kind pool
  function kMotifDeriv() {
    const s = [pick([
      S(`Die Motive ${motifBase} bis ${motifBase + 2} wurden mit Hilfe des ${ALGO}-Algorithmus (${CITE}) hergeleitet.`),
      S(`Zur Ableitung der Motive ${motifBase} bis ${motifBase + 2} wurde der ${ALGO}-Algorithmus (${CITE}) herangezogen.`),
      S(`Die vorstehend wiedergegebenen Motive gingen aus einem Abgleich von ${ri(18, 260)} Volllängensequenzen mit dem ${ALGO}-Verfahren (${CITE}) hervor.`),
    ])];
    const follow = shuffle([
      S(`Für die jeweiligen Positionen eines ${ALGO}-Motivs sind diejenigen Reste wiedergegeben, die im abgefragten Sequenzsatz mit einem Anteil von mehr als 0,${ri(15, 45)} auftreten.`),
      S(`Reste in eckigen Klammern bezeichnen an der jeweiligen Position zulässige Alternativen.`),
      S(`Ein kleingeschriebenes x steht dabei für eine beliebige proteinogene Aminosäure.`),
      S(`Positionen ohne erkennbare Präferenz wurden in der Konsensusdarstellung ausgespart.`),
    ]).slice(0, ri(2, 3));
    return { type: "para", sents: s.concat(follow) };
  }
  function kPreference() {
    const n = ri(3, 6);
    return { type: "para", sents: [pick([
      S(`Besonders bevorzugt umfasst das ${POLY} mit zunehmender Bevorzugung mindestens ${ri(1, 2)}, mindestens ${ri(2, 3)} oder sämtliche ${n} Motive.`),
      S(`Bevorzugt liegen in dem ${POLY} wenigstens ${ri(1, 2)} der genannten Motive vor, stärker bevorzugt ${ri(2, 3)} und am stärksten bevorzugt alle ${n}.`),
      S(`Zweckmäßigerweise enthält das ${POLY} mindestens ${ri(1, 3)} der vorstehend angegebenen Motive in der genannten Reihenfolge.`),
    ])] };
  }
  function kDomainList() {
    const intro = pick([
      S(`Nach einer weiteren Ausgestaltung weist ein ${POLY} im hier verwendeten Sinne eine oder mehrere der in ${tabRef(TAB)} zusammengestellten Domänen auf, insbesondere eine oder mehrere der nachstehend aufgeführten Domänen:`),
      S(`In einer zusätzlichen Ausgestaltung enthält ein ${POLY} im hier verwendeten Sinne wenigstens eine der folgenden, durch Profilabgleich bestimmbaren Domänen:`),
      S(`Ein ${POLY} im Sinne der vorliegenden Anmeldung zeichnet sich ferner durch das Vorliegen einer oder mehrerer der nachstehenden, in ${tabRef(TAB2)} näher bezeichneten Domänen aus:`),
    ]);
    const sel = shuffle(dbs).slice(0, ri(3, 5));
    const items = sel.map(([name, acc], i) => {
      const a = acc();
      const tmpl = pick([
        `eine Domäne, die anhand der ${dbRef(name)} bestimmt wurde, mit der Zugangsnummer ${a}`,
        `eine über die ${dbRef(name)} ermittelte Domäne mit der Zugangsnummer ${a}`,
        `eine Domäne, die in der ${dbRef(name)} unter der Zugangsnummer ${a} geführt wird`,
        `eine mittels ${dbRef(name)} identifizierte Domäne der Zugangsnummer ${a}`,
      ]);
      const term = i === sel.length - 1 ? "." : i === sel.length - 2 ? "; und" : ";";
      return S(tmpl + term);
    });
    return { type: "para", sents: [intro], items };
  }
  function kPctDomain() {
    const intro = pick([
      S(`In einer weiteren bevorzugten Ausgestaltung umfasst ein ${POLY} im hier verwendeten Sinne einen konservierten Bereich, dessen Sequenzidentität zu einer der nachfolgend bezeichneten Domänen mindestens ${pctRun(ri(45, 62))} beträgt, oder besteht aus einem solchen Bereich:`),
      S(`Bevorzugt liegt in dem ${POLY} eine konservierte Domäne vor, deren Sequenzidentität mit steigender Bevorzugung mindestens ${pctRun(ri(48, 66))} beträgt, bezogen auf eine der folgenden Angaben:`),
    ]);
    const n = ri(3, 5);
    const items = [];
    for (let i = 0; i < n; i++) {
      const a = ri(11, 180), b = a + ri(120, 340);
      const tmpl = pick([
        `den Aminosäurekoordinaten ${a} bis ${b} in SEQ ID NR: ${sid} (Motiv ${coordMotif + i} – SEQ ID NR: ${coordSeq + i})`,
        `dem Abschnitt von Position ${a} bis Position ${b} der SEQ ID NR: ${sid} (Motiv ${coordMotif + i} – SEQ ID NR: ${coordSeq + i})`,
        `den Resten ${a} bis ${b} der Sequenz gemäß SEQ ID NR: ${sid} (Motiv ${coordMotif + i} – SEQ ID NR: ${coordSeq + i})`,
      ]);
      const term = i === n - 1 ? "." : i === n - 2 ? "; und" : ";";
      items.push(S(tmpl + term));
    }
    return { type: "para", sents: [intro], items };
  }
  function kHomologPct() {
    return { type: "para", sents: [
      pick([
        S(`Ergänzend oder alternativ weist das Homolog eines ${PROTG} mit zunehmender Bevorzugung mindestens ${pctRun(ri(38, 58))} Gesamtsequenzidentität zu der Aminosäuresequenz gemäß SEQ ID NR: ${sid} auf, mit der Maßgabe, dass das homologe Protein wenigstens eines der vorstehend beschriebenen konservierten Motive enthält.`),
        S(`Das Homolog eines ${PROTG} besitzt vorzugsweise eine Gesamtsequenzidentität von mindestens ${pctRun(ri(40, 60))} gegenüber SEQ ID NR: ${sid}, sofern zugleich mindestens eine der vorstehend umrissenen Domänen erhalten bleibt.`),
      ]),
      pick([
        S(`Fragmente, denen mehr als ${ri(20, 60)} aufeinanderfolgende Reste des N-Terminus fehlen, bleiben bei dieser Betrachtung unberücksichtigt.`),
        S(`Bei der Berechnung werden Lücken, die auf Insertionen von mehr als ${ri(4, 20)} Resten zurückgehen, nicht gewertet.`),
      ]),
    ] };
  }
  function kAlignment() {
    return { type: "para", sents: shuffle([
      S(`Die Gesamtsequenzidentität wird mit einem globalen Abgleichverfahren bestimmt, beispielsweise mit dem ${ALGN}-Algorithmus des Programms ${PROG}, und zwar vorzugsweise unter den Voreinstellungen sowie anhand der Sequenzen reifer Proteine, also ohne Signalpeptide und Transitpeptide.`),
      S(`Das Identitätsniveau wird ermittelt, indem die Polypeptidsequenzen über ihre gesamte Länge mit SEQ ID NR: ${sid} verglichen werden.`),
      S(`Im Vergleich zur Gesamtsequenzidentität liegen die ermittelten Werte typischerweise höher, sofern allein die bewahrten Bereiche beziehungsweise Signaturen in die Auswertung eingehen.`),
    ]).slice(0, ri(2, 3)) };
  }
  function kDefTerm() {
    const q = boldTerm ? `„§b{${POLY}}”` : `„${POLY}”`;
    return { type: "para", sents: [
      pick([
        S(`Der Ausdruck ${q} im hier verwendeten Sinne soll auch Homologe erfassen, wie sie nachstehend näher definiert werden.`),
        S(`Unter dem Begriff ${q} werden im Rahmen der vorliegenden Anmeldung ferner Varianten verstanden, die durch konservative Substitutionen aus SEQ ID NR: ${sid} hervorgehen.`),
      ]),
      pick([
        S(`Hierunter fallen insbesondere Allelvarianten, Spleißvarianten sowie durch gerichtete Mutagenese gewonnene Abwandlungen.`),
        S(`Nicht erfasst sind demgegenüber Sequenzen, die lediglich eines der genannten Motive in verkürzter Form enthalten.`),
      ]),
    ] };
  }
  function kExpression() {
    return { type: "para", sents: [
      S(`Die für ein ${POLY} kodierende Nukleinsäure wird zweckmäßigerweise unter der Kontrolle des ${pick(promoters)}-Promotors in ein Expressionskonstrukt eingebracht.`),
      pick([
        S(`Als Terminator eignet sich insbesondere der ${pick(terminators)}-Terminator; weitere brauchbare Regulationselemente sind in ${tabRef(pick(tables))} angegeben.`),
        S(`Die Wahl des Terminators ist unkritisch; bewährt hat sich der ${pick(terminators)}-Terminator.`),
      ]),
      S(`Die Übertragung in ${spRef(SP1)} erfolgt vorzugsweise durch ${pick(methods)}.`),
    ] };
  }
  function kPlantApp() {
    const a = ri(6, 22), b = a + ri(4, 26);
    return { type: "para", sents: [
      S(`Pflanzen mit einer gesteigerten Expression eines ${POLYG} weisen gegenüber Kontrollpflanzen eine erhöhte ${pick(traits)} auf.`),
      S(`Der Zuwachs betrug unter den geprüften Anzuchtbedingungen zwischen ${a} % und ${b} % und war in ${ri(3, 9)} von ${ri(10, 16)} unabhängigen Linien statistisch abgesichert.`),
      S(`Entsprechende Befunde wurden für ${spRef(SP2)} und ${spRef(SP3)} erhalten.`),
    ] };
  }
  function kAssay() {
    return { type: "para", sents: [
      S(`Die Bestimmung der ${pick(acts)} erfolgte photometrisch bei ${ri(280, 620)} nm in einem Puffer aus ${ri(10, 100)} mM ${pick(buffers)} (pH ${ri(6, 8)},${ri(0, 9)}).`),
      S(`Ein Reaktionsansatz enthielt ${ri(2, 40)} µg Gesamtprotein sowie ${ri(20, 400)} µM ${pick(substrates)} als Substrat.`),
      S(`Die spezifische Aktivität ist in nkat je mg Protein angegeben; die Messwerte sind in ${tabRef(pick(tables))} zusammengefasst.`),
    ] };
  }
  function kSubcell() {
    return { type: "para", sents: [
      S(`Die subzelluläre Lokalisierung wurde anhand eines translationalen Reporterkonstrukts überprüft.`),
      S(`Das Fusionsprotein war überwiegend im ${pick(["Stroma der Plastiden", "Cytosol", "Apoplasten", "peroxisomalen Kompartiment", "endoplasmatischen Retikulum"])} nachweisbar, was mit der rechnerisch vorhergesagten Zielsteuerung übereinstimmt.`),
      S(`Ein Transitpeptid der Länge ${ri(28, 78)} Reste wird von den gängigen Vorhersageprogrammen übereinstimmend angezeigt.`),
    ] };
  }
  function kOrtholog() {
    return { type: "para", sents: [
      S(`Orthologe eines ${POLYG} lassen sich durch reziproken Abgleich gegen die Gesamtheit der translatierten Leserahmen der jeweiligen Art auffinden.`),
      S(`Für ${spRef(SP2)} wurden auf diesem Wege ${ri(2, 9)} Kandidaten ermittelt, von denen ${ri(1, 4)} sämtliche der vorstehend genannten Motive tragen.`),
      S(`Paraloge werden dabei durch die Forderung eines wechselseitig besten Treffers ausgeschlossen.`),
    ] };
  }
  function kNucleic() {
    return { type: "para", sents: [
      S(`Der Begriff Nukleinsäure umfasst im hier verwendeten Sinne einzelsträngige wie doppelsträngige Moleküle sowie deren komplementäre Gegenstränge.`),
      S(`Bevorzugt hybridisiert die Nukleinsäure unter stringenten Bedingungen, also bei ${ri(58, 68)} °C in ${ri(1, 6)} × SSC und ${ri(0, 1)},${ri(1, 9)} % SDS, mit dem Gegenstrang der SEQ ID NR: ${sid + ri(1, 6)}.`),
    ] };
  }
  function kProse() {
    return { type: "para", sents: shuffle([
      S(`Die vorstehenden Angaben gelten sinngemäß für sämtliche in ${tabRef(pick(tables))} aufgeführten Sequenzen.`),
      S(`Abweichungen von den genannten Bereichsgrenzen sind zulässig, soweit die biologische Aktivität des Polypeptids erhalten bleibt.`),
      S(`Der Fachmann erkennt, dass die angegebenen Bedingungen an die jeweilige Wirtspflanze anzupassen sind.`),
      S(`Alle Prozentangaben beziehen sich, sofern nichts anderes vermerkt ist, auf das Gewicht der Trockenmasse.`),
      S(`Weitere Einzelheiten ergeben sich aus den nachfolgenden Beispielen, die den Gegenstand der Anmeldung nicht beschränken.`),
    ]).slice(0, ri(2, 3)) };
  }

  const kindFns = [kMotifDeriv, kPreference, kDomainList, kPctDomain, kHomologPct, kAlignment,
    kDefTerm, kExpression, kPlantApp, kAssay, kSubcell, kOrtholog, kNucleic, kProse];

  // ------------------------------------------------------------------- block queue
  const paraStart = ri(11, 940);
  let paraNo = paraStart;
  let bag = [];
  const nextKind = () => { if (!bag.length) bag = shuffle(kindFns); return bag.pop(); };
  const queue = [];

  const contOpeners = [
    [S(`ner bevorzugten Ausgestaltung liegen die konservierten Motive innerhalb eines zusammenhängenden Abschnitts von weniger als ${ri(180, 420)} Resten.`),
     S(`Flankierende Bereiche sind demgegenüber nur schwach konserviert und für die Aktivität entbehrlich.`)],
    [S(`tidsequenzen über ihre gesamte Länge miteinander verglichen werden, wobei endständige Lücken nicht in die Wertung eingehen.`),
     S(`Die auf diese Weise erhaltenen Werte sind in ${tabRef(pick(tables))} zusammengestellt.`)],
    [S(`schen Kontrollen unterschieden sich die transgenen Linien weder im Habitus noch im Blühzeitpunkt.`),
     S(`Ein nachteiliger Einfluss auf die Fertilität wurde in keinem der geprüften Ansätze beobachtet.`)],
    [S(`lichen Bedingungen wurde die Expression des Transgens durch quantitative Bestimmung der Transkriptmenge überprüft.`),
     S(`Die ermittelten Werte lagen um das ${ri(2, 18)}-fache über denen der nicht transformierten Ausgangslinie.`)],
    [S(`gen Domänen ist in der nachfolgenden Aufstellung jeweils die Zugangsnummer der zugehörigen Datenbank angegeben.`),
     S(`Die Zuordnung erfolgte anhand der voreingestellten Signifikanzschwelle des jeweiligen Profilverfahrens.`)],
  ];

  if (mode === 0) queue.push(motifBlock());
  if (mode === 1) queue.push({ type: "para", sents: pick(contOpeners), noMarker: true });
  if (mode === 3 && chance(0.45)) queue.push(headBlock());

  const midMotifAt = mode === 1 ? ri(2, 5) : mode === 2 ? ri(1, 6) : mode === 3 ? ri(3, 7) : -1;
  const midHeadAt = mode === 3 ? ri(2, 6) : mode === 2 && chance(0.4) ? ri(2, 6) : -1;
  const extraMotifAt = mode === 0 && chance(0.35) ? ri(5, 10) : -1;

  for (let i = 0; i < 90; i++) {
    if (i === midMotifAt || i === extraMotifAt) queue.push(motifBlock());
    if (i === midHeadAt) queue.push(headBlock());
    const b = nextKind()();
    if (!b.noMarker) b.marker = `[${String(paraNo++).padStart(4, "0")}]`;
    queue.push(b);
  }

  // ------------------------------------------------------------------ block rendering
  // Cost model, in units of one body line. Every term mirrors a real CSS box: text line
  // boxes, the per-item .ml margin, and the block's own margin-bottom. Keep in sync with
  // the stylesheet below — a missing gap here shows up as an overflowing column.
  const MK = 9;                                     // bold marker in char-equivalents
  const TIGHT = 0.1;                                // .p margin when a list follows
  const sumLen = (ss) => ss.reduce((a, s) => a + s.len + 1, 0);
  const paraLines = (b) => Math.ceil((sumLen(b.sents) + (b.marker ? MK : 0)) / cplP);
  const itemLines = (items) => items.reduce((a, it) => a + Math.ceil(it.len / cplIndent), 0);
  const listCost = (items) => itemLines(items) + 0.2 + gapFrac;
  const motifItemCost = (it) => motifLines(it) * motifScale + 0.12;
  const motifCost = (items) => items.reduce((a, it) => a + motifItemCost(it), 0) + gapFrac + 0.55;
  function costOf(b) {
    if (b.type === "motif") return motifCost(b.items);
    if (b.type === "head") return 1.15 + gapFrac + 0.3;
    const hasItems = b.items && b.items.length;
    if (!b.sents.length) return hasItems ? listCost(b.items) : gapFrac;
    return paraLines(b) + (hasItems ? TIGHT + listCost(b.items) : gapFrac);
  }
  function renderPara(b) {
    const mkH = b.marker ? `<b>${b.marker}</b>&#160;&#160;` : "";
    const mkM = b.marker ? `**${b.marker}** ` : "";
    const out = [];
    const hasItems = b.items && b.items.length;
    if (b.sents.length) {
      out.push({
        html: `<p class="p${hasItems ? " pt" : ""}">` +
          `${mkH}${b.sents.map((s) => s.h).join(" ")}</p>`,
        md: mkM + b.sents.map((s) => s.m).join(" "),
      });
    }
    if (hasItems) {
      out.push({
        html: `<div class="lst">${b.items.map((s) => `<div class="it">– ${s.h}</div>`).join("")}</div>`,
        md: b.items.map((s) => "- " + s.m).join("\n"),
      });
    }
    return out;
  }
  function renderBlock(b) {
    if (b.type === "head") return [{
      html: `<p class="h${b.level}">${b.text}</p>`,
      md: (b.level === 2 ? "## " : "### ") + b.text,
    }];
    if (b.type === "motif") return [{
      html: `<div class="mot">${b.items.map((it) => `<div class="ml">${it.h}</div>`).join("")}</div>`,
      md: b.items.map((it) => it.m).join("\n\n"),
    }];
    return renderPara(b);
  }

  // Raw index at which `remBare` bare characters have been consumed, or -1 when that
  // position falls inside an emphasis group (cutting there would corrupt the markup).
  function safeCut(raw, remBare) {
    let n = 0, i = 0, inGroup = false;
    while (i < raw.length && n < remBare) {
      if (!inGroup && raw[i] === "§" && "biu".includes(raw[i + 1]) && raw[i + 2] === "{") { inGroup = true; i += 3; continue; }
      if (inGroup && raw[i] === "}") { inGroup = false; i++; continue; }
      n++; i++;
    }
    return inGroup ? -1 : i;
  }
  // Split a block at the bottom of a column: sentence granularity, with a mid-word
  // hyphen cut when the straddling sentence carries no emphasis markup.
  function splitBlock(b, avail) {
    if (b.type === "head") return { head: null, rest: b };
    if (b.type === "motif") {
      let used = 0, k = 0;
      for (const it of b.items) {
        const c = motifItemCost(it);
        if (used + c > avail) break;
        used += c; k++;
      }
      if (!k) return { head: null, rest: b };
      const head = { type: "motif", items: b.items.slice(0, k) };
      const rest = k < b.items.length ? { type: "motif", items: b.items.slice(k) } : null;
      return { head, rest };
    }
    // Whole lines only: a head sized to a fractional line budget rounds up and clips.
    const availLines = Math.floor(avail);
    if (!b.sents.length && b.items) {          // list carried over from a previous column
      let sp = availLines, k = 0;
      for (const it of b.items) { const c = Math.ceil(it.len / cplIndent); if (sp - c < 0) break; sp -= c; k++; }
      if (!k) return { head: null, rest: b };
      return { head: { type: "para", sents: [], items: b.items.slice(0, k) },
               rest: k < b.items.length ? { type: "para", sents: [], items: b.items.slice(k) } : null };
    }
    const maxChars = Math.floor(availLines * cplP) - (b.marker ? MK : 0) - 2;
    if (maxChars < 55) return { head: null, rest: b };
    const keep = [];
    let total = 0, i = 0;
    for (; i < b.sents.length; i++) {
      const s = b.sents[i];
      if (total + s.len + 1 <= maxChars) { keep.push(s); total += s.len + 1; }
      else break;
    }
    let restSents = b.sents.slice(i);
    if (i < b.sents.length) {
      const s = b.sents[i];
      const rem = maxChars - total;
      const ci = rem > 45 ? safeCut(s.raw, rem) : -1;
      if (ci > 0) {
        const frag = s.raw.slice(0, ci);
        const close = frag.lastIndexOf("}");   // cuts must stay past the last emphasis span
        const m = /^([\s\S]*\s)(\S{3,})$/.exec(frag);
        let cut = -1, hyphen = false;
        if (m && m[1].length > close) {
          const ws = m[1].length;
          const full = s.raw.slice(ws).split(/\s/)[0];
          if (full.length - (ci - ws) >= 3 && /[a-zäöüß]$/.test(frag)) { cut = ci; hyphen = true; }
        }
        if (cut < 0) {                          // no clean hyphenation point: break at a space
          const sp = frag.lastIndexOf(" ");
          if (sp > close && sp > 40) cut = sp;
        }
        if (cut > 0) {
          keep.push(S(s.raw.slice(0, cut) + (hyphen ? "-" : "")));
          restSents = [S(s.raw.slice(hyphen ? cut : cut + 1))].concat(b.sents.slice(i + 1));
        }
      }
    }
    if (!keep.length) return { head: null, rest: b };
    const head = { type: "para", marker: b.marker, sents: keep };
    let rest = null;
    if (restSents.length || (b.items && b.items.length)) {
      // any remaining sentences carry over unnumbered; the list follows them
      const after = { type: "para", sents: restSents, items: b.items };
      if (restSents.length || (b.items && b.items.length)) rest = after;
    } else if (i >= b.sents.length && b.items) {
      rest = { type: "para", sents: [], items: b.items };
    }
    // if the whole intro fitted, try to place list items in the remaining space
    if (!restSents.length && b.items && b.items.length) {
      let sp = Math.floor(avail - paraLines(head) - TIGHT), k = 0;
      for (const it of b.items) {
        const c = Math.ceil(it.len / cplIndent);
        if (sp - c < 0) break;
        sp -= c; k++;
      }
      if (k) {
        head.items = b.items.slice(0, k);
        rest = k < b.items.length ? { type: "para", sents: [], items: b.items.slice(k) } : null;
      }
    }
    return { head, rest };
  }

  function fillColumn(lineBudget) {
    const out = [];
    let used = 0, swaps = 0;
    while (queue.length && used < lineBudget - 0.45) {
      const b = queue[0];
      const c = costOf(b);
      if (used + c <= lineBudget) { out.push(...renderBlock(b)); used += c; queue.shift(); continue; }
      const { head, rest } = splitBlock(b, lineBudget - used);
      if (head) { out.push(...renderBlock(head)); if (rest) queue[0] = rest; else queue.shift(); break; }
      // A motif block or heading that cannot be broken here would leave a hole; neither
      // carries a paragraph number, so defer it past the next block instead of stopping.
      if ((b.type === "motif" || b.type === "head") && queue.length > 1 && swaps < 6) {
        queue.splice(1, 0, queue.shift());
        swaps++;
        continue;
      }
      break;
    }
    return out;
  }

  const col1 = fillColumn(budget);
  const col2 = twoCol ? fillColumn(budget) : [];

  // ------------------------------------------------------------------------- markup
  const r2 = (x) => Math.round(x * 100) / 100;
  const hdrHtml =
    hdrStyle === 1
      ? `<div class="hdr split"><span>${docNo}</span><span>${pubDate}</span></div>`
      : `<div class="hdr${hdrStyle === 2 ? " ruled" : ""}">${docNo}&#160;&#160;&#160;&#160;${pubDate}</div>`;

  const colsHtml = twoCol
    ? `<div class="cols"><div class="col">${col1.map((x) => x.html).join("")}</div>` +
      `<div class="col">${col2.map((x) => x.html).join("")}</div></div>`
    : `<div class="col">${col1.map((x) => x.html).join("")}</div>`;

  const html = `<meta charset="utf-8"><style>
@page { size: A4; margin: 0 }
html, body { margin: 0; padding: 0 }
body { width: ${pageW}mm; height: ${pageH}mm; font-family: ${FONT}; color: #000; background: #fff;
  -webkit-font-smoothing: antialiased; }
.page { position: relative; width: ${pageW}mm; height: ${pageH}mm; overflow: hidden; }
.hdr { position: absolute; top: ${r2(mTop)}mm; left: ${r2(mx)}mm; right: ${r2(mx)}mm;
  text-align: center; font-size: ${r2(hdrFs)}pt; line-height: 1.2; }
.hdr.split { display: flex; justify-content: space-between; }
.hdr.ruled { border-bottom: 0.35pt solid #000; padding-bottom: ${r2(hdrGap * 0.28)}mm; }
.ftr { position: absolute; bottom: ${r2(mBot)}mm; left: ${r2(mx)}mm; right: ${r2(mx)}mm;
  text-align: center; font-size: ${r2(ftrFs)}pt; line-height: 1.2; }
.body { position: absolute; top: ${r2(bodyTop)}mm; left: ${r2(mx)}mm; width: ${r2(contentW)}mm;
  height: ${r2(bodyH + clipPad)}mm; overflow: hidden; font-size: ${r2(fs)}pt; line-height: ${r2(lh)}pt; }
.cols { display: flex; gap: ${r2(colGap)}mm; height: 100%; }
.col { width: ${r2(colW)}mm; overflow: hidden; }
.p { margin: 0 0 ${r2(lhMm * gapFrac)}mm 0; text-align: justify; -webkit-hyphens: none; hyphens: none; }
.p.pt { margin-bottom: ${r2(lhMm * TIGHT)}mm; }
.lst { margin: 0 0 ${r2(lhMm * (gapFrac + 0.2))}mm 0; }
.it { margin: 0 0 0 ${r2(indentMm)}mm; text-align: justify; }
.mot { margin: 0 0 ${r2(lhMm * (gapFrac + 0.55))}mm 0; font-size: ${r2(fs * motifScale)}pt;
  line-height: ${r2(lh * motifScale)}pt; }
.ml { margin: 0 0 ${r2(lhMm * 0.12)}mm 0; text-align: left; }
.sq { word-break: break-all; }
.ng { white-space: nowrap; }
.lb { display: inline-block; min-width: ${r2(fs * 0.9)}mm; }
.h2 { margin: ${r2(lhMm * 0.35)}mm 0 ${r2(lhMm * gapFrac)}mm 0; font-weight: bold; font-size: ${r2(fs * 1.06)}pt; }
.h3 { margin: ${r2(lhMm * 0.3)}mm 0 ${r2(lhMm * gapFrac)}mm 0; font-weight: bold; }
b { font-weight: bold } i { font-style: italic } u { text-decoration: underline }
</style>
<div class="page">${hdrHtml}<div class="body">${colsHtml}</div>
<div class="ftr">${footerLine}</div></div>`;

  const gt = [headerLine]
    .concat(col1.map((x) => x.md))
    .concat(col2.map((x) => x.md))
    .concat([footerLine])
    .join("\n\n");

  return { html, gt, pageOpts: { format: "A4", preferCSSPageSize: true },
    dbg: { mode, fs: r2(fs), lh: r2(lh), cpl: r2(cpl), budget, bodyTop: r2(bodyTop), bodyH: r2(bodyH), font: fIdx } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
