// FAMILY GENERATOR — dense EU-gazette-style regulatory page (DRIFT sibling of the
// German patent-gazette page 0.000_text_dense__de.pdf).
//
// Genre: one interior page of an official journal act — running header with the
// gazette signature + date, bold display title block, "Having regard to ..." /
// "gestützt auf ..." / "vu ..." preamble, wall-to-wall justified 7.5-9.5pt body,
// hanging-indent numbered recitals (1)(2)(3)..., "Article N" / "Artikel N" headings
// with numbered paragraphs and (a)(b)(c) sub-points, dash sub-lists, footnote rule
// with OJ-style citations at the page foot, signature block, page ending mid-
// hyphenated word on continuation pages.
//
// Failure mode being trained: FORMAT/emphasis fidelity inside a solid text wall —
// bold recital tokens and defined terms, italic Latin tags and instrument short
// names, superscript footnote calls, and (in the amending mode) underlined
// insertions + struck-through deletions inside quoted amendment text.
//
// DRIFT: 4 discrete layout modes (act / twocol / amend / contin) x 3 languages
// (EN/DE/FR) x 8 invented regulatory subject areas, plus continuous jitter on font
// family & size, line height, margins, column gap + rule, justification, recital
// numbering range and start, emphasis density, article count, definition count,
// footnote presence, header/footer furniture and signature style. The Union, its
// gazette, its institutions, all instrument numbers, agencies, cities and
// signatories are FICTIONAL; no sentence from the anchor page is reused.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const rf = (lo, hi, d) => (lo + rng() * (hi - lo)).toFixed(d);
  const chance = (p) => rng() < p;
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  // ---------------- inline markup (one source -> md + html) ----------------
  const OP = "\u0001", CL = "\u0002";
  const B = (s) => `${OP}B${s}${CL}`;
  const I = (s) => `${OP}I${s}${CL}`;
  const U = (s) => `${OP}U${s}${CL}`;
  const S = (s) => `${OP}S${s}${CL}`;
  const F = (s) => `${OP}F${s}${CL}`;           // superscript footnote call: md keeps "(1)"
  const rawLen = (s) => s.replace(/\u0001[BIUSF]/g, "").replace(/\u0002/g, "").length;
  const strip = (s) => s.replace(/\u0001[BIUSF]/g, "").replace(/\u0002/g, "");
  const OPEN = { B: ["**", "<b>"], I: ["*", "<i>"], U: ["<u>", "<u>"], S: ["~~", "<s>"], F: ["", "<sup>"] };
  const CLOSE = { B: ["**", "</b>"], I: ["*", "</i>"], U: ["</u>", "</u>"], S: ["~~", "</s>"], F: ["", "</sup>"] };
  function emit(s, k) { // k=0 markdown, k=1 html
    let out = "", stack = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === OP) { const t = s[++i]; stack.push(t); out += OPEN[t][k]; }
      else if (c === CL) { const t = stack.pop(); out += CLOSE[t][k]; }
      else out += (k === 1 ? (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c) : c);
    }
    return out;
  }
  const md = (s) => emit(s, 0);
  const ht = (s) => emit(s, 1);

  // ---------------- seed knobs: language + layout mode ----------------
  const lang = pick(["en", "en", "de", "de", "fr", "fr"]);
  const mr = rng();
  const mode = mr < 0.32 ? "act" : mr < 0.57 ? "twocol" : mr < 0.79 ? "contin" : "amend";
  const twoCol = mode === "twocol";

  // ---------------- invented subject areas ----------------
  const TOPICS = [{
    en: { S: "thermal insulation products", A: "the declared thermal conductivity", B: "the Meridian Agency for Construction Products", BS: "the Agency",
      M: "the harmonised test method set out in Annex II", AC: "manufacturers", AC1: "manufacturer", T: "declared value", U: "W/(m·K)",
      ACT: "the making available on the market of construction products", FIELD: "construction products" },
    de: { S: "Wärmedämmstoffe", Sd: "Wärmedämmstoffen", A: "die erklärte Wärmeleitfähigkeit", Ag: "der erklärten Wärmeleitfähigkeit",
      B: "die Meridian-Agentur für Bauprodukte", BS: "die Agentur", M: "das in Anhang II festgelegte harmonisierte Prüfverfahren",
      Md: "dem in Anhang II festgelegten harmonisierten Prüfverfahren", AC: "Hersteller", AC1: "Hersteller", T: "erklärter Wert", U: "W/(m·K)",
      ACT: "die Bereitstellung von Bauprodukten auf dem Markt", FIELD: "Bauprodukte" },
    fr: { S: "produits d'isolation thermique", A: "la conductivité thermique déclarée", B: "l'Agence méridienne des produits de construction", BS: "l'Agence",
      M: "la méthode d'essai harmonisée figurant à l'annexe II", AC: "fabricants", AC1: "fabricant", T: "valeur déclarée", U: "W/(m·K)",
      ACT: "la mise à disposition sur le marché de produits de construction", FIELD: "produits de construction" },
  }, {
    en: { S: "cereals and cereal products", A: "the maximum residue level", B: "the Meridian Authority for Food Safety", BS: "the Authority",
      M: "the analytical method referred to in Annex I", AC: "food business operators", AC1: "food business operator", T: "residue definition", U: "mg/kg",
      ACT: "the placing on the market of food of plant origin", FIELD: "food of plant origin" },
    de: { S: "Getreide und Getreideerzeugnisse", Sd: "Getreide und Getreideerzeugnissen", A: "die Rückstandshöchstmenge", Ag: "der Rückstandshöchstmenge",
      B: "die Meridian-Behörde für Lebensmittelsicherheit", BS: "die Behörde", M: "das in Anhang I genannte Analyseverfahren",
      Md: "dem in Anhang I genannten Analyseverfahren", AC: "Lebensmittelunternehmer", AC1: "Lebensmittelunternehmer", T: "Rückstandsdefinition", U: "mg/kg",
      ACT: "das Inverkehrbringen von Lebensmitteln pflanzlichen Ursprungs", FIELD: "Lebensmittel pflanzlichen Ursprungs" },
    fr: { S: "céréales et produits céréaliers", A: "la limite maximale de résidus", B: "l'Autorité méridienne de sécurité des aliments", BS: "l'Autorité",
      M: "la méthode d'analyse visée à l'annexe I", AC: "exploitants du secteur alimentaire", AC1: "exploitant du secteur alimentaire",
      T: "définition du résidu", U: "mg/kg", ACT: "la mise sur le marché de denrées alimentaires d'origine végétale", FIELD: "denrées d'origine végétale" },
  }, {
    en: { S: "electric propulsion units", A: "the declared continuous power output", B: "the Meridian Type-Approval Board", BS: "the Board",
      M: "the measurement procedure laid down in Annex III", AC: "vehicle manufacturers", AC1: "vehicle manufacturer", T: "reference test cycle", U: "kW",
      ACT: "the type-approval of motor vehicles and their systems", FIELD: "motor vehicle systems" },
    de: { S: "elektrische Antriebseinheiten", Sd: "elektrischen Antriebseinheiten", A: "die angegebene Dauerleistung", Ag: "der angegebenen Dauerleistung",
      B: "die Meridian-Typgenehmigungsstelle", BS: "die Stelle", M: "das in Anhang III festgelegte Messverfahren",
      Md: "dem in Anhang III festgelegten Messverfahren", AC: "Fahrzeughersteller", AC1: "Fahrzeughersteller", T: "Bezugsprüfzyklus", U: "kW",
      ACT: "die Typgenehmigung von Kraftfahrzeugen und ihren Systemen", FIELD: "Fahrzeugsysteme" },
    fr: { S: "unités de propulsion électrique", A: "la puissance continue déclarée", B: "l'Autorité méridienne de réception par type", BS: "l'Autorité",
      M: "la procédure de mesure établie à l'annexe III", AC: "constructeurs de véhicules", AC1: "constructeur de véhicules", T: "cycle d'essai de référence",
      U: "kW", ACT: "la réception par type des véhicules à moteur et de leurs systèmes", FIELD: "systèmes de véhicules" },
  }, {
    en: { S: "ballast water treatment systems", A: "the maximum admissible organism concentration", B: "the Meridian Maritime Safety Agency", BS: "the Agency",
      M: "the sampling protocol set out in Annex IV", AC: "shipowners", AC1: "shipowner", T: "representative sample", U: "organisms per cubic metre",
      ACT: "the prevention of the transfer of harmful aquatic organisms", FIELD: "maritime environmental protection" },
    de: { S: "Ballastwasser-Behandlungssysteme", Sd: "Ballastwasser-Behandlungssystemen", A: "die höchstzulässige Organismenkonzentration",
      Ag: "der höchstzulässigen Organismenkonzentration", B: "die Meridian-Agentur für die Sicherheit des Seeverkehrs", BS: "die Agentur",
      M: "das in Anhang IV festgelegte Probenahmeprotokoll", Md: "dem in Anhang IV festgelegten Probenahmeprotokoll", AC: "Schiffseigner",
      AC1: "Schiffseigner", T: "repräsentative Probe", U: "Organismen je Kubikmeter", ACT: "die Verhinderung der Verschleppung schädlicher Wasserorganismen",
      FIELD: "Meeresumweltschutz" },
    fr: { S: "systèmes de traitement des eaux de ballast", A: "la concentration maximale admissible d'organismes",
      B: "l'Agence méridienne pour la sécurité maritime", BS: "l'Agence", M: "le protocole d'échantillonnage figurant à l'annexe IV",
      AC: "armateurs", AC1: "armateur", T: "échantillon représentatif", U: "organismes par mètre cube",
      ACT: "la prévention du transfert d'organismes aquatiques nuisibles", FIELD: "protection du milieu marin" },
  }, {
    en: { S: "digital identity wallets", A: "the assurance level of the authentication mechanism", B: "the Meridian Board for Digital Trust", BS: "the Board",
      M: "the conformity assessment scheme described in Annex V", AC: "wallet providers", AC1: "wallet provider", T: "qualified attestation",
      U: "attestations per user per year", ACT: "the provision of electronic identification means", FIELD: "electronic identification" },
    de: { S: "digitale Identitätsbrieftaschen", Sd: "digitalen Identitätsbrieftaschen", A: "die Sicherheitsstufe des Authentifizierungsverfahrens",
      Ag: "der Sicherheitsstufe des Authentifizierungsverfahrens", B: "die Meridian-Stelle für digitales Vertrauen", BS: "die Stelle",
      M: "das in Anhang V beschriebene Konformitätsbewertungsschema", Md: "dem in Anhang V beschriebenen Konformitätsbewertungsschema",
      AC: "Anbieter von Brieftaschen", AC1: "Anbieter", T: "qualifizierte Attestierung", U: "Attestierungen je Nutzer und Jahr",
      ACT: "die Bereitstellung elektronischer Identifizierungsmittel", FIELD: "elektronische Identifizierung" },
    fr: { S: "portefeuilles d'identité numérique", A: "la garantie du mécanisme d'authentification", B: "l'Autorité méridienne pour la confiance numérique",
      BS: "l'Autorité", M: "le schéma d'évaluation de la conformité décrit à l'annexe V", AC: "fournisseurs de portefeuilles",
      AC1: "fournisseur de portefeuilles", T: "attestation qualifiée", U: "attestations par utilisateur et par an",
      ACT: "la fourniture de moyens d'identification électronique", FIELD: "identification électronique" },
  }, {
    en: { S: "fertilising products", A: "the maximum cadmium content", B: "the Meridian Agency for Chemicals", BS: "the Agency",
      M: "the digestion and detection method set out in Annex VI", AC: "importers", AC1: "importer", T: "component material category", U: "mg/kg dry matter",
      ACT: "the making available on the market of fertilising products", FIELD: "fertilising products" },
    de: { S: "Düngeprodukte", Sd: "Düngeprodukten", A: "die höchstzulässige Cadmiumkonzentration", Ag: "der höchstzulässigen Cadmiumkonzentration",
      B: "die Meridian-Agentur für Chemikalien", BS: "die Agentur", M: "das in Anhang VI festgelegte Aufschluss- und Nachweisverfahren",
      Md: "dem in Anhang VI festgelegten Aufschluss- und Nachweisverfahren", AC: "Einführer", AC1: "Einführer", T: "Komponentenmaterialkategorie",
      U: "mg/kg Trockenmasse", ACT: "die Bereitstellung von Düngeprodukten auf dem Markt", FIELD: "Düngeprodukte" },
    fr: { S: "fertilisants", A: "la teneur maximale en cadmium", B: "l'Agence méridienne des produits chimiques", BS: "l'Agence",
      M: "la méthode de minéralisation et de détection figurant à l'annexe VI", AC: "importateurs", AC1: "importateur",
      T: "catégorie de matières constitutives", U: "mg/kg de matière sèche", ACT: "la mise à disposition sur le marché des fertilisants",
      FIELD: "fertilisants" },
  }, {
    en: { S: "trackside signalling subsystems", A: "the declared braking curve tolerance", B: "the Meridian Railway Agency", BS: "the Agency",
      M: "the verification procedure set out in Annex II", AC: "infrastructure managers", AC1: "infrastructure manager", T: "authorised placing in service",
      U: "per cent of the nominal deceleration", ACT: "the interoperability of the rail system", FIELD: "rail interoperability" },
    de: { S: "streckenseitige Zugsicherungs-Teilsysteme", Sd: "streckenseitigen Zugsicherungs-Teilsystemen", A: "die angegebene Bremskurventoleranz",
      Ag: "der angegebenen Bremskurventoleranz", B: "die Meridian-Eisenbahnagentur", BS: "die Agentur",
      M: "das in Anhang II festgelegte Prüfverfahren", Md: "dem in Anhang II festgelegten Prüfverfahren", AC: "Infrastrukturbetreiber",
      AC1: "Infrastrukturbetreiber", T: "Inbetriebnahmegenehmigung", U: "Prozent der Nennverzögerung",
      ACT: "die Interoperabilität des Eisenbahnsystems", FIELD: "Eisenbahninteroperabilität" },
    fr: { S: "sous-systèmes de signalisation au sol", A: "la tolérance déclarée de la courbe de freinage", B: "l'Agence méridienne des chemins de fer",
      BS: "l'Agence", M: "la procédure de vérification figurant à l'annexe II", AC: "gestionnaires d'infrastructure", AC1: "gestionnaire d'infrastructure",
      T: "autorisation de mise en service", U: "pour cent de la décélération nominale", ACT: "l'interopérabilité du système ferroviaire",
      FIELD: "interopérabilité ferroviaire" },
  }, {
    en: { S: "industrial battery packs", A: "the declared recycled content share", B: "the Meridian Agency for Circular Materials", BS: "the Agency",
      M: "the calculation and verification rules set out in Annex I", AC: "economic operators", AC1: "economic operator", T: "recycled content",
      U: "per cent by mass", ACT: "the placing on the market of batteries", FIELD: "batteries" },
    de: { S: "Industriebatterien", Sd: "Industriebatterien", A: "die angegebene Rezyklatquote", Ag: "der angegebenen Rezyklatquote",
      B: "die Meridian-Agentur für Kreislaufmaterialien", BS: "die Agentur", M: "die in Anhang I festgelegten Berechnungs- und Überprüfungsregeln",
      Md: "den in Anhang I festgelegten Berechnungs- und Überprüfungsregeln", AC: "Wirtschaftsakteure", AC1: "Wirtschaftsakteur", T: "Rezyklatanteil",
      U: "Massenprozent", ACT: "das Inverkehrbringen von Batterien", FIELD: "Batterien" },
    fr: { S: "batteries industrielles", A: "la part déclarée de contenu recyclé", B: "l'Agence méridienne des matériaux circulaires", BS: "l'Agence",
      M: "les règles de calcul et de vérification figurant à l'annexe I", AC: "opérateurs économiques", AC1: "opérateur économique",
      T: "contenu recyclé", U: "pour cent en masse", ACT: "la mise sur le marché des batteries", FIELD: "batteries" },
  }];
  const T = pick(TOPICS)[lang];

  // ---------------- union / gazette identity (fictional) ----------------
  const UNION = {
    en: { journal: "Official Journal of the Meridian Union", jab: "OJ MU", code: "EN", union: "Meridian Union",
      area: "(Text with MEA relevance)", comm: "THE COMMISSION OF THE MERIDIAN UNION," },
    de: { journal: "Amtsblatt der Meridian-Union", jab: "ABl. MU", code: "DE", union: "Meridian-Union",
      area: "(Text von Bedeutung für den MWR)", comm: "DIE KOMMISSION DER MERIDIAN-UNION —" },
    fr: { journal: "Journal officiel de l'Union méridienne", jab: "JO UM", code: "FR", union: "Union méridienne",
      area: "(Texte présentant de l'intérêt pour l'EEM)", comm: "LA COMMISSION DE L'UNION MÉRIDIENNE," },
  }[lang];

  const MONTH = {
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  }[lang];
  const dateLong = (d, m, y) => lang === "en" ? `${d} ${MONTH[m]} ${y}` : lang === "de" ? `${d}. ${MONTH[m]} ${y}` : `${d}${d === 1 ? "er" : ""} ${MONTH[m]} ${y}`;
  const dateShort = (d, m, y) => `${d}.${m + 1}.${y}`;
  const dec = (v) => lang === "en" ? String(v) : String(v).replace(".", ",");

  const baseYear = 2029 + ri(0, 6);
  const actMonth = ri(0, 11), actDay = ri(1, 28);
  const actDate = dateLong(actDay, actMonth, baseYear);
  const oldStyle = chance(0.45);   // "(MU) No 442/2029" vs "(MU) 2029/442"

  // instrument factory: returns {n, g, base} forms per language
  function makeInstr(kind) {
    const y = baseYear - ri(0, 6), n = ri(102, 1994);
    let base;
    if (lang === "en") {
      base = kind === "dir" ? `Directive ${y}/${ri(4, 96)}/MU`
        : kind === "impl" ? `Implementing Regulation (MU) ${y}/${n}`
          : kind === "del" ? `Delegated Regulation (MU) ${y}/${n}`
            : kind === "dec" ? `Decision (MU) ${y}/${n}`
              : oldStyle ? `Regulation (MU) No ${n}/${y}` : `Regulation (MU) ${y}/${n}`;
      return { n: base, g: base, c: base };
    }
    if (lang === "de") {
      base = kind === "dir" ? `Richtlinie ${y}/${ri(4, 96)}/MU`
        : kind === "impl" ? `Durchführungsverordnung (MU) ${y}/${n}`
          : kind === "del" ? `Delegierte Verordnung (MU) ${y}/${n}`
            : kind === "dec" ? `Beschluss (MU) ${y}/${n}`
              : oldStyle ? `Verordnung (MU) Nr. ${n}/${y}` : `Verordnung (MU) ${y}/${n}`;
      const fem = kind !== "dec";
      return { n: `${fem ? "die" : "der"} ${base}`, g: `${fem ? "der" : "des"} ${base}`, c: `${fem ? "Die" : "Der"} ${base}` };
    }
    base = kind === "dir" ? `directive ${y}/${ri(4, 96)}/UM`
      : kind === "impl" ? `règlement d'exécution (UM) ${y}/${n}`
        : kind === "del" ? `règlement délégué (UM) ${y}/${n}`
          : kind === "dec" ? `décision (UM) ${y}/${n}`
            : oldStyle ? `règlement (UM) n° ${n}/${y}` : `règlement (UM) ${y}/${n}`;
    const fem = kind === "dir" || kind === "dec";
    return { n: `${fem ? "la" : "le"} ${base}`, g: `${fem ? "de la" : "du"} ${base}`, c: `${fem ? "La" : "Le"} ${base}` };
  }
  const INSTR = makeInstr(chance(0.6) ? "reg" : "dir");
  const INSTR2 = makeInstr(pick(["impl", "del", "dec", "dir", "reg"]));
  const INSTR3 = makeInstr(pick(["impl", "reg", "dir"]));

  const artRef = () => lang === "en" ? `Article ${ri(2, 34)}(${ri(1, 7)})`
    : lang === "de" ? `Artikel ${ri(2, 34)} Absatz ${ri(1, 7)}`
      : `l'article ${ri(2, 34)}, paragraphe ${ri(1, 7)}`;

  const q = (s) => lang === "en" ? `‘${s}’` : lang === "de" ? `„${s}“` : `« ${s} »`;

  // ---------------- footnotes ----------------
  const wantFn = chance(0.82);
  const fnLines = [];
  const fnSeen = new Map();
  function fnCall(key) {
    if (!wantFn || fnLines.length >= 3) return "";
    if (!fnSeen.has(key)) {
      const n = fnLines.length + 1;
      fnSeen.set(key, n);
      const d = ri(1, 28), m = ri(0, 11), y = baseYear - ri(0, 6);
      const cite = lang === "en" ? `${UNION.jab} L ${ri(64, 348)}, ${dateShort(d, m, y)}, p. ${ri(1, 74)}.`
        : lang === "de" ? `${UNION.jab} L ${ri(64, 348)} vom ${dateShort(d, m, y)}, S. ${ri(1, 74)}.`
          : `${UNION.jab} L ${ri(64, 348)} du ${dateShort(d, m, y)}, p. ${ri(1, 74)}.`;
      fnLines.push(`(${n}) ${cite}`);
    }
    return ` ${F(`(${fnSeen.get(key)})`)}`;
  }

  // ---------------- token fill ----------------
  const MSx = { en: "Member States", de: "Mitgliedstaaten", fr: "États membres" }[lang];
  const dynamic = {
    P: () => `${ri(2, 48)} %`,
    V: () => dec(rf(0.02, 48, chance(0.5) ? 2 : 1)),
    N: () => String(ri(3, 24)),
    D: () => dateLong(ri(1, 28), ri(0, 11), baseYear - ri(0, 4)),
    D2: () => dateLong(ri(1, 28), ri(0, 11), baseYear + ri(1, 3)),
    AR: () => artRef(),
    AR2: () => artRef(),
    I: () => INSTR.n + fnCall("i1"),
    Ic: () => INSTR.c + fnCall("i1"),
    IG: () => INSTR.g + fnCall("i1"),
    I2: () => INSTR2.n + fnCall("i2"),
    I2c: () => INSTR2.c + fnCall("i2"),
    I2G: () => INSTR2.g + fnCall("i2"),
    I3: () => INSTR3.n + fnCall("i3"),
    I3G: () => INSTR3.g + fnCall("i3"),
    MS: () => MSx,
  };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (dynamic[k] ? dynamic[k]() : (T[k] ?? T[k[0]] ?? `{${k}}`)));

  // ---------------- recital template banks ----------------
  const REC = {
    en: [
      `{Ic} establishes the general framework applicable to {ACT} and empowers the Commission to adopt implementing acts specifying {A} of {S}.`,
      `Experience gained in the application of {I} has shown that the reporting arrangements for {S} are insufficiently harmonised across the {MS}, which impairs the comparability of the results obtained under {M}.`,
      `In order to ensure uniform conditions for the implementation of {AR} of {I}, detailed rules should be laid down concerning {A} and the corresponding verification intervals.`,
      `{B} delivered its opinion on {D}, in which it concluded that {A}, where determined in accordance with {M}, provides a reliable basis for market surveillance.`,
      `It is appropriate to provide for a transitional period allowing {AC} to adapt their production processes and to exhaust stocks of {S} lawfully placed on the market before {D}.`,
      `The measures provided for in this Regulation are in accordance with the opinion of the standing committee referred to in {AR} of {I}.`,
      `Since the objective of this Regulation cannot be sufficiently achieved by the {MS} acting alone but can rather, by reason of the scale of its effects, be better achieved at the level of the Union, this Regulation does not go beyond what is necessary in order to achieve that objective.`,
      `For reasons of legal certainty, the term ${I("{T}")} should be defined by reference to {M}, and the tolerance applicable to {A} should be fixed at {P}.`,
      `An examination of the notifications submitted under {AR} of {I2} revealed that {P} of the samples analysed between {D} and {D2} exceeded the threshold of {V} {U}, which justifies a shorter verification cycle.`,
      `Where {AC} rely on {M}, the results should be expressed in {U} and rounded to two decimal places, so as to avoid divergent interpretations by the competent authorities of the {MS}.`,
      `{BS} should be granted access to the underlying test reports, without prejudice to the protection of commercially sensitive information and to the confidentiality obligations laid down in {AR} of {I}.`,
      `Consultation of the expert group on {FIELD} confirmed that the existing sampling plan should be supplemented by provisions on the traceability of {S} throughout the supply chain.`,
      `{I2c} applies ${I("mutatis mutandis")} to the exchange of information between the competent authorities, and it is therefore unnecessary to reproduce those provisions in this Regulation.`,
      `In the interest of clarity and rational administration, the provisions applicable to {S} should be consolidated in a single act, and references to the repealed provisions should be construed as references to this Regulation.`,
      `Given the technical nature of the requirements set out in the Annex, and in order to allow the {MS} to adapt their control programmes, the application of those requirements should be deferred until {D2}.`,
      `{AC} placing {S} on the market should draw up a declaration stating that {A} has been determined in accordance with {M}, and should keep that declaration at the disposal of the competent authorities for a period of {N} years.`,
      `Those measures should, ${I("inter alia")}, specify the minimum number of samples per production batch, the conditions under which samples are to be stored and the procedure to be followed where {A} cannot be determined.`,
      `The evaluation carried out under {AR} of {I3} concluded that the existing thresholds no longer reflect the state of the art and that {A} should be reviewed at intervals not exceeding {N} months.`,
      `In accordance with the principle of proportionality, the additional administrative burden imposed on small and medium-sized {AC} should be limited to the information strictly necessary for the verification of {A}.`,
      `{I} should therefore be amended accordingly.`,
    ],
    de: [
      `Mit {IG} wurde der allgemeine Rahmen für {ACT} festgelegt; die Kommission wird darin ermächtigt, Durchführungsrechtsakte zur näheren Bestimmung {Ag} von {Sd} zu erlassen.`,
      `Die bei der Anwendung {IG} gewonnenen Erfahrungen haben gezeigt, dass die Meldeverfahren für {S} in den {MS} nicht hinreichend harmonisiert sind, was die Vergleichbarkeit der nach {Md} ermittelten Ergebnisse beeinträchtigt.`,
      `Zur Gewährleistung einheitlicher Bedingungen für die Durchführung von {AR} {IG} sollten ausführliche Vorschriften über {A} sowie über die entsprechenden Überprüfungsintervalle festgelegt werden.`,
      `{B} hat am {D} eine Stellungnahme abgegeben, in der sie zu dem Schluss kam, dass {A}, sofern sie nach {Md} bestimmt wird, eine verlässliche Grundlage für die Marktüberwachung darstellt.`,
      `Es ist angezeigt, einen Übergangszeitraum vorzusehen, damit {AC} ihre Produktionsverfahren anpassen und die vor dem {D} rechtmäßig in Verkehr gebrachten Bestände an {Sd} abverkaufen können.`,
      `Die in dieser Verordnung vorgesehenen Maßnahmen entsprechen der Stellungnahme des in {AR} {IG} genannten Ständigen Ausschusses.`,
      `Da das Ziel dieser Verordnung von den {MS} allein nicht ausreichend verwirklicht werden kann, sondern wegen des Umfangs seiner Wirkungen auf Unionsebene besser zu verwirklichen ist, geht diese Verordnung nicht über das für die Verwirklichung dieses Ziels erforderliche Maß hinaus.`,
      `Aus Gründen der Rechtssicherheit sollte der Begriff ${I("{T}")} unter Bezugnahme auf {M} definiert und die für {A} geltende Toleranz auf {P} festgesetzt werden.`,
      `Die Auswertung der gemäß {AR} {I2G} übermittelten Meldungen hat ergeben, dass bei {P} der zwischen dem {D} und dem {D2} untersuchten Proben der Schwellenwert von {V} {U} überschritten wurde, was einen kürzeren Überprüfungszyklus rechtfertigt.`,
      `Stützen sich {AC} auf {M}, so sollten die Ergebnisse in {U} ausgedrückt und auf zwei Dezimalstellen gerundet werden, um abweichende Auslegungen durch die zuständigen Behörden der {MS} zu vermeiden.`,
      `{BS} sollte Zugang zu den zugrunde liegenden Prüfberichten erhalten, unbeschadet des Schutzes wirtschaftlich sensibler Informationen und der in {AR} {IG} festgelegten Vertraulichkeitspflichten.`,
      `Die Anhörung der Sachverständigengruppe für {FIELD} hat bestätigt, dass der bestehende Probenahmeplan durch Bestimmungen über die Rückverfolgbarkeit von {Sd} entlang der Lieferkette ergänzt werden sollte.`,
      `{I2c} gilt ${I("entsprechend")} für den Informationsaustausch zwischen den zuständigen Behörden; diese Bestimmungen brauchen daher in der vorliegenden Verordnung nicht wiederholt zu werden.`,
      `Im Interesse der Klarheit und der Verwaltungsvereinfachung sollten die für {S} geltenden Bestimmungen in einem einzigen Rechtsakt zusammengefasst werden; Bezugnahmen auf die aufgehobenen Bestimmungen gelten als Bezugnahmen auf die vorliegende Verordnung.`,
      `Angesichts des technischen Charakters der im Anhang festgelegten Anforderungen und um den {MS} die Anpassung ihrer Kontrollprogramme zu ermöglichen, sollte die Anwendung dieser Anforderungen bis zum {D2} aufgeschoben werden.`,
      `{AC}, die {S} in Verkehr bringen, sollten eine Erklärung ausstellen, aus der hervorgeht, dass {A} nach {Md} bestimmt wurde, und diese Erklärung den zuständigen Behörden {N} Jahre lang zur Verfügung halten.`,
      `Diese Maßnahmen sollten ${I("unter anderem")} die Mindestzahl der Proben je Produktionslos, die Bedingungen für die Aufbewahrung der Proben sowie das Verfahren für den Fall festlegen, dass {A} nicht bestimmt werden kann.`,
      `Die gemäß {AR} {I3G} durchgeführte Bewertung ergab, dass die geltenden Schwellenwerte dem Stand der Technik nicht mehr entsprechen und dass {A} in Abständen von höchstens {N} Monaten überprüft werden sollte.`,
      `Nach dem Grundsatz der Verhältnismäßigkeit sollte der zusätzliche Verwaltungsaufwand für kleine und mittlere {AC} auf die für die Überprüfung {Ag} unbedingt erforderlichen Angaben beschränkt werden.`,
      `{Ic} sollte daher entsprechend geändert werden.`,
    ],
    fr: [
      `{I2c} établit le cadre général applicable à {ACT} et habilite la Commission à adopter des actes d'exécution précisant {A} des {S}.`,
      `L'expérience acquise dans l'application {IG} a montré que les modalités de déclaration applicables aux {S} ne sont pas suffisamment harmonisées entre les {MS}, ce qui nuit à la comparabilité des résultats obtenus selon {M}.`,
      `Afin d'assurer des conditions uniformes d'exécution de {AR}, {IG}, il convient d'arrêter des règles détaillées concernant {A} et les intervalles de vérification correspondants.`,
      `{B} a rendu un avis le {D}, dans lequel elle a conclu que {A}, lorsqu'elle est déterminée conformément à {M}, constitue une base fiable pour la surveillance du marché.`,
      `Il convient de prévoir une période transitoire permettant aux {AC} d'adapter leurs procédés de production et d'écouler les stocks de {S} légalement mis sur le marché avant le {D}.`,
      `Les mesures prévues au présent règlement sont conformes à l'avis du comité permanent visé à {AR}, {IG}.`,
      `Étant donné que l'objectif du présent règlement ne peut pas être atteint de manière suffisante par les {MS} mais peut, en raison de l'ampleur de ses effets, l'être mieux au niveau de l'Union, le présent règlement n'excède pas ce qui est nécessaire pour atteindre cet objectif.`,
      `Pour des raisons de sécurité juridique, il y a lieu de définir la notion de ${I("{T}")} par référence à {M} et de fixer à {P} la tolérance applicable à {A}.`,
      `L'examen des notifications transmises au titre de {AR}, {I2G} a révélé que {P} des échantillons analysés entre le {D} et le {D2} dépassaient le seuil de {V} {U}, ce qui justifie un cycle de vérification plus court.`,
      `Lorsque les {AC} recourent à {M}, les résultats devraient être exprimés en {U} et arrondis à deux décimales, afin d'éviter des interprétations divergentes de la part des autorités compétentes des {MS}.`,
      `{BS} devrait avoir accès aux rapports d'essai sous-jacents, sans préjudice de la protection des informations commercialement sensibles et des obligations de confidentialité prévues à {AR}, {IG}.`,
      `La consultation du groupe d'experts sur les {FIELD} a confirmé que le plan d'échantillonnage existant devrait être complété par des dispositions relatives à la traçabilité des {S} tout au long de la chaîne d'approvisionnement.`,
      `{I2c} s'applique ${I("mutatis mutandis")} à l'échange d'informations entre les autorités compétentes; il n'est dès lors pas nécessaire de reproduire ces dispositions dans le présent règlement.`,
      `Dans un souci de clarté et de rationalité administrative, il convient de regrouper dans un acte unique les dispositions applicables aux {S}, les références aux dispositions abrogées s'entendant comme faites au présent règlement.`,
      `Compte tenu du caractère technique des exigences énoncées à l'annexe et afin de permettre aux {MS} d'adapter leurs programmes de contrôle, l'application de ces exigences devrait être différée jusqu'au {D2}.`,
      `Les {AC} qui mettent des {S} sur le marché devraient établir une déclaration attestant que {A} a été déterminée conformément à {M} et tenir cette déclaration à la disposition des autorités compétentes pendant {N} ans.`,
      `Ces mesures devraient notamment préciser le nombre minimal d'échantillons par lot de production, les conditions de conservation des échantillons et la procédure à suivre lorsque {A} ne peut être déterminée.`,
      `L'évaluation réalisée au titre de {AR}, {I3G} a conclu que les seuils en vigueur ne reflètent plus l'état de la technique et que {A} devrait être réexaminée à des intervalles n'excédant pas {N} mois.`,
      `Conformément au principe de proportionnalité, la charge administrative supplémentaire imposée aux petits et moyens {AC} devrait être limitée aux informations strictement nécessaires à la vérification {Ade}.`,
      `Il convient dès lors de modifier {I} en conséquence.`,
    ],
  }[lang];
  // fr genitive of the attribute ("de la ...")
  if (lang === "fr") T.Ade = T.A.replace(/^la /, "de la ");

  const ARTP = {
    en: [
      `This Regulation lays down rules on {A} of {S} made available on the market of the Union, and on the methods for verifying compliance with those rules.`,
      `This Regulation shall not apply to {S} manufactured exclusively for research purposes, for display in a museum collection or for export to third countries.`,
      `{AC} shall ensure, before placing {S} on the market, that {A} has been determined in accordance with {M} and that the supporting documentation is complete, legible and drawn up in an official language of the Member State concerned.`,
      `Where a competent authority establishes that {A} deviates from the declared value by more than {P}, it shall inform {BS} within {N} working days and shall indicate the corrective measures required.`,
      `{BS} shall record the information received under paragraph 1 in the electronic register established under {AR} of {I} and shall publish the aggregated data once a year.`,
      `The {MS} shall designate the competent authorities responsible for the controls provided for in this Regulation and shall communicate their names and addresses to the Commission by {D2}.`,
      `Samples shall be taken in accordance with {M} at a frequency of not less than one sample per {N} production batches, and shall be kept available for control purposes for {N} months.`,
      `By way of derogation from paragraph 1, {AC} may rely on results obtained under an equivalent method, provided that the equivalence has been demonstrated to the satisfaction of {BS} and that the deviation does not exceed {P}.`,
    ],
    de: [
      `Diese Verordnung enthält Vorschriften über {A} von {Sd}, die auf dem Unionsmarkt bereitgestellt werden, sowie über die Verfahren zur Überprüfung der Einhaltung dieser Vorschriften.`,
      `Diese Verordnung gilt nicht für {S}, die ausschließlich zu Forschungszwecken, zur Ausstellung in einer Museumssammlung oder zur Ausfuhr in Drittländer hergestellt werden.`,
      `{AC} stellen vor dem Inverkehrbringen von {Sd} sicher, dass {A} nach {Md} bestimmt wurde und dass die Begleitunterlagen vollständig und lesbar sind sowie in einer Amtssprache des betreffenden Mitgliedstaats abgefasst sind.`,
      `Stellt eine zuständige Behörde fest, dass {A} um mehr als {P} vom erklärten Wert abweicht, so unterrichtet sie {BS} innerhalb von {N} Arbeitstagen und gibt die erforderlichen Abhilfemaßnahmen an.`,
      `{BS} erfasst die nach Absatz 1 übermittelten Angaben in dem gemäß {AR} {IG} eingerichteten elektronischen Register und veröffentlicht die aggregierten Daten einmal jährlich.`,
      `Die {MS} benennen die für die in dieser Verordnung vorgesehenen Kontrollen zuständigen Behörden und teilen der Kommission deren Namen und Anschriften bis zum {D2} mit.`,
      `Die Proben werden nach {Md} in einem Turnus von mindestens einer Probe je {N} Produktionslose entnommen und {N} Monate lang für Kontrollzwecke aufbewahrt.`,
      `Abweichend von Absatz 1 können sich {AC} auf Ergebnisse stützen, die nach einem gleichwertigen Verfahren ermittelt wurden, sofern die Gleichwertigkeit gegenüber {BS} nachgewiesen wurde und die Abweichung {P} nicht überschreitet.`,
    ],
    fr: [
      `Le présent règlement établit les règles relatives à {A} des {S} mis à disposition sur le marché de l'Union ainsi que les méthodes de vérification du respect de ces règles.`,
      `Le présent règlement ne s'applique pas aux {S} fabriqués exclusivement à des fins de recherche, en vue d'une exposition muséale ou pour l'exportation vers des pays tiers.`,
      `Les {AC} veillent, avant de mettre des {S} sur le marché, à ce que {A} ait été déterminée conformément à {M} et à ce que la documentation justificative soit complète, lisible et rédigée dans une langue officielle de l'État membre concerné.`,
      `Lorsqu'une autorité compétente constate que {A} s'écarte de la valeur déclarée de plus de {P}, elle en informe {BS} dans un délai de {N} jours ouvrables et indique les mesures correctives requises.`,
      `{BS} consigne les informations reçues au titre du paragraphe 1 dans le registre électronique établi en vertu de {AR}, {IG} et publie les données agrégées une fois par an.`,
      `Les {MS} désignent les autorités compétentes chargées des contrôles prévus par le présent règlement et communiquent leurs noms et adresses à la Commission au plus tard le {D2}.`,
      `Les échantillons sont prélevés conformément à {M}, à raison d'au moins un échantillon par {N} lots de production, et sont conservés à des fins de contrôle pendant {N} mois.`,
      `Par dérogation au paragraphe 1, les {AC} peuvent se fonder sur des résultats obtenus selon une méthode équivalente, pour autant que l'équivalence ait été démontrée à la satisfaction de {BS} et que l'écart n'excède pas {P}.`,
    ],
  }[lang];

  const PTS = {
    en: [
      `the identification of the production batch and the date of manufacture;`,
      `the reference of {M} and the identity of the laboratory that carried out the determination;`,
      `the value obtained, expressed in {U}, together with the associated measurement uncertainty;`,
      `the name and address of the {AC1} responsible for the declaration;`,
      `any departure from the sampling plan set out in the Annex, together with the reasons for that departure;`,
      `the period during which the samples are to be kept available for control purposes.`,
      `the corrective measures taken and the date on which they were implemented;`,
    ],
    de: [
      `die Identifizierung des Produktionsloses und das Herstellungsdatum;`,
      `die Fundstelle {Md} sowie die Bezeichnung des Labors, das die Bestimmung durchgeführt hat;`,
      `den ermittelten Wert, ausgedrückt in {U}, zusammen mit der zugehörigen Messunsicherheit;`,
      `Name und Anschrift des für die Erklärung verantwortlichen {AC1}s;`,
      `jede Abweichung vom Probenahmeplan des Anhangs sowie die Gründe für diese Abweichung;`,
      `den Zeitraum, in dem die Proben für Kontrollzwecke aufzubewahren sind.`,
      `die getroffenen Abhilfemaßnahmen und den Zeitpunkt ihrer Durchführung;`,
    ],
    fr: [
      `l'identification du lot de production et la date de fabrication;`,
      `la référence de {M} ainsi que l'identité du laboratoire ayant procédé à la détermination;`,
      `la valeur obtenue, exprimée en {U}, accompagnée de l'incertitude de mesure associée;`,
      `le nom et l'adresse du {AC1} responsable de la déclaration;`,
      `tout écart par rapport au plan d'échantillonnage figurant à l'annexe, ainsi que les motifs de cet écart;`,
      `la période pendant laquelle les échantillons doivent être tenus à disposition à des fins de contrôle.`,
      `les mesures correctives prises et la date de leur mise en œuvre;`,
    ],
  }[lang];

  const DEFS = {
    en: [
      [`{T}`, `the value of {A} determined in accordance with {M} and declared by the {AC1};`],
      [`production batch`, `a quantity of {S} manufactured under uniform conditions during a single production run;`],
      [`verification body`, `a body notified under {AR} of {I} for the performance of the tasks referred to in Article 4;`],
      [`competent authority`, `the authority designated by each Member State for the purposes of {AR} of {I};`],
      [`significant deviation`, `a deviation exceeding {P} of the declared value, measured under the reference conditions;`],
      [`supporting documentation`, `the technical file, the test reports and the records of the sampling operations.`],
    ],
    de: [
      [`{T}`, `den nach {Md} bestimmten und vom {AC1} erklärten Wert {Ag};`],
      [`Produktionslos`, `eine Menge an {Sd}, die unter einheitlichen Bedingungen in einem einzigen Produktionsdurchgang hergestellt wurde;`],
      [`Prüfstelle`, `eine gemäß {AR} {IG} notifizierte Stelle für die Wahrnehmung der in Artikel 4 genannten Aufgaben;`],
      [`zuständige Behörde`, `die von jedem Mitgliedstaat für die Zwecke {IG} benannte Behörde;`],
      [`erhebliche Abweichung`, `eine Abweichung von mehr als {P} vom erklärten Wert, gemessen unter Referenzbedingungen;`],
      [`Begleitunterlagen`, `die technischen Unterlagen, die Prüfberichte und die Aufzeichnungen über die Probenahmen.`],
    ],
    fr: [
      [`{T}`, `la valeur {Ade} déterminée conformément à {M} et déclarée par le {AC1};`],
      [`lot de production`, `une quantité de {S} fabriquée dans des conditions uniformes au cours d'une même série de production;`],
      [`organisme de vérification`, `un organisme notifié au titre de {AR}, {IG} pour l'exécution des tâches visées à l'article 4;`],
      [`autorité compétente`, `l'autorité désignée par chaque État membre aux fins de {AR}, {IG};`],
      [`écart significatif`, `un écart supérieur à {P} de la valeur déclarée, mesuré dans les conditions de référence;`],
      [`documentation justificative`, `le dossier technique, les rapports d'essai et les enregistrements des opérations d'échantillonnage.`],
    ],
  }[lang];

  const ARTTITLE = {
    en: ["Subject matter and scope", "Definitions", "Obligations of manufacturers", "Verification of the declared value",
      "Notification of results", "Controls by the competent authorities", "Transitional measures", "Reporting and review"],
    de: ["Gegenstand und Anwendungsbereich", "Begriffsbestimmungen", "Pflichten der Hersteller", "Überprüfung des erklärten Wertes",
      "Mitteilung der Ergebnisse", "Kontrollen durch die zuständigen Behörden", "Übergangsmaßnahmen", "Berichterstattung und Überprüfung"],
    fr: ["Objet et champ d'application", "Définitions", "Obligations des fabricants", "Vérification de la valeur déclarée",
      "Notification des résultats", "Contrôles par les autorités compétentes", "Mesures transitoires", "Rapports et réexamen"],
  }[lang];

  const L = {
    en: {
      whereas: "Whereas:", adopted: "HAS ADOPTED THIS REGULATION:",
      hr1: `Having regard to the Treaty establishing the ${UNION.union}, and in particular Article ${ri(94, 216)} thereof,`,
      hr2: () => fill(`Having regard to {I} of the Assembly and of the Council of ${dateLong(ri(1, 28), ri(0, 11), baseYear - ri(1, 6))} on {ACT}, and in particular {AR} thereof,`),
      hr3: () => fill(`Having regard to {I2}, and in particular {AR} thereof,`),
      art: (n) => `Article ${n}`,
      defsIntro: "For the purposes of this Regulation, the following definitions apply:",
      amendIntro: () => fill(`{I2c} is amended as follows:`),
      force: () => `This Regulation shall enter into force on the ${pick(["twentieth", "third", "seventh"])} day following that of its publication in the ${UNION.journal}.`,
      apply: () => `It shall apply from ${dateLong(ri(1, 28), ri(0, 11), baseYear + ri(0, 2))}.`,
      binding: "This Regulation shall be binding in its entirety and directly applicable in all Member States.",
      done: (c) => `Done at ${c}, ${actDate}.`,
      forc: "For the Commission", pres: pick(["The President", "The President", "For the President"]),
      cont: "means", of: "of",
    },
    de: {
      whereas: "in Erwägung nachstehender Gründe:", adopted: "HAT FOLGENDE VERORDNUNG ERLASSEN:",
      hr1: `gestützt auf den Vertrag über die Arbeitsweise der ${UNION.union}, insbesondere auf Artikel ${ri(94, 216)},`,
      hr2: () => fill(`gestützt auf {I} der Versammlung und des Rates vom ${dateLong(ri(1, 28), ri(0, 11), baseYear - ri(1, 6))} über {ACT}, insbesondere auf {AR},`),
      hr3: () => fill(`gestützt auf {I2}, insbesondere auf {AR},`),
      art: (n) => `Artikel ${n}`,
      defsIntro: "Für die Zwecke dieser Verordnung bezeichnet der Ausdruck",
      amendIntro: () => fill(`{I2c} wird wie folgt geändert:`),
      force: () => `Diese Verordnung tritt am ${pick(["zwanzigsten", "dritten", "siebten"])} Tag nach ihrer Veröffentlichung im ${UNION.journal} in Kraft.`,
      apply: () => `Sie gilt ab dem ${dateLong(ri(1, 28), ri(0, 11), baseYear + ri(0, 2))}.`,
      binding: "Diese Verordnung ist in allen ihren Teilen verbindlich und gilt unmittelbar in jedem Mitgliedstaat.",
      done: (c) => `Geschehen zu ${c} am ${actDate}.`,
      forc: "Für die Kommission", pres: pick(["Die Präsidentin", "Der Präsident", "Im Namen der Präsidentin"]),
      cont: "bezeichnet", of: "der",
    },
    fr: {
      whereas: "considérant ce qui suit:", adopted: "A ADOPTÉ LE PRÉSENT RÈGLEMENT:",
      hr1: `vu le traité instituant l'${UNION.union}, et notamment son article ${ri(94, 216)},`,
      hr2: () => fill(`vu {I} de l'Assemblée et du Conseil du ${dateLong(ri(1, 28), ri(0, 11), baseYear - ri(1, 6))} relatif à {ACT}, et notamment {AR},`),
      hr3: () => fill(`vu {I2}, et notamment {AR},`),
      art: (n) => n === 1 ? "Article premier" : `Article ${n}`,
      defsIntro: "Aux fins du présent règlement, on entend par:",
      amendIntro: () => fill(`{I2c} est modifié comme suit:`),
      force: () => `Le présent règlement entre en vigueur le ${pick(["vingtième", "troisième", "septième"])} jour suivant celui de sa publication au ${UNION.journal}.`,
      apply: () => `Il est applicable à partir du ${dateLong(ri(1, 28), ri(0, 11), baseYear + ri(0, 2))}.`,
      binding: "Le présent règlement est obligatoire dans tous ses éléments et directement applicable dans tout État membre.",
      done: (c) => `Fait à ${c}, le ${actDate}.`,
      forc: "Par la Commission", pres: pick(["La présidente", "Le président", "Pour la présidente"]),
      cont: "on entend par", of: "du",
    },
  }[lang];

  const ACTKIND = {
    en: pick(["COMMISSION IMPLEMENTING REGULATION", "COMMISSION DELEGATED REGULATION", "COMMISSION REGULATION", "COMMISSION IMPLEMENTING DECISION"]),
    de: pick(["DURCHFÜHRUNGSVERORDNUNG (MU) DER KOMMISSION", "DELEGIERTE VERORDNUNG (MU) DER KOMMISSION", "VERORDNUNG (MU) DER KOMMISSION"]),
    fr: pick(["RÈGLEMENT D'EXÉCUTION (UM) DE LA COMMISSION", "RÈGLEMENT DÉLÉGUÉ (UM) DE LA COMMISSION", "RÈGLEMENT (UM) DE LA COMMISSION"]),
  }[lang];
  const actNo = `${baseYear}/${ri(102, 2480)}`;
  const titleLine1 = lang === "en" ? `${ACTKIND} (MU) ${actNo}` : ACTKIND.replace("(MU)", `(MU) ${actNo}`).replace("(UM)", `(UM) ${actNo}`);
  const titleLine2 = lang === "en" ? `of ${actDate}` : lang === "de" ? `vom ${actDate}` : `du ${actDate}`;
  const TITLE3 = {
    en: [`laying down detailed rules for the application of {I2} as regards {A} of {S}`,
      `establishing technical specifications for {S} as regards {A}`,
      `specifying the verification methods applicable to {A} of {S}`,
      `amending {I2} as regards {A} of {S}`],
    de: [`mit Durchf\u00fchrungsbestimmungen zur Bestimmung {Ag} von {Sd}`,
      `zur Festlegung technischer Spezifikationen f\u00fcr {S} hinsichtlich {Ag}`,
      `zur Festlegung der Pr\u00fcfverfahren f\u00fcr {S} hinsichtlich {Ag}`,
      `zur \u00c4nderung {I2G} hinsichtlich {Ag} von {Sd}`],
    fr: [`portant modalit\u00e9s d'application {I2G} en ce qui concerne {A} des {S}`,
      `\u00e9tablissant des sp\u00e9cifications techniques pour les {S} en ce qui concerne {A}`,
      `pr\u00e9cisant les m\u00e9thodes de v\u00e9rification applicables \u00e0 {A} des {S}`,
      `modifiant {I2} en ce qui concerne {A} des {S}`],
  }[lang];
  const titleLine3 = fill(pick(TITLE3));

  const CITIES = ["Vireux", "Salvane", "Port-Aubel", "Kerhaven", "Nordstrand", "Alveria", "Marbec", "Ostenhelm"];
  const NAMES = ["A. LORENTZEN", "M. DELACROIX", "R. HALVORSEN", "I. FONTANA", "K. WEBER-MARSH", "T. OYELARAN", "S. VANTHOOR", "P. KIRILOVA"];
  const city = pick(CITIES), signer = pick(NAMES);

  // ---------------- typography knobs ----------------
  const serif = chance(0.55);
  const fontFam = serif ? pick([`"Times New Roman", Times, serif`, `Georgia, "Times New Roman", serif`])
    : pick([`Arial, Helvetica, sans-serif`, `Helvetica, Arial, sans-serif`]);
  const charW = /Georgia/.test(fontFam) ? 0.495 : serif ? 0.452 : 0.497;
  const fontPt = Number((twoCol ? 7.6 + rng() * 1.0 : 8.3 + rng() * 1.3).toFixed(2));
  const lh = Number((1.15 + rng() * 0.16).toFixed(3));
  const padTopMm = 11 + rng() * 6, padBotMm = 11 + rng() * 5;
  const padSideMm = twoCol ? 12 + rng() * 4 : 17 + rng() * 6;
  const colGapMm = 5 + rng() * 4;
  const colRule = twoCol && chance(0.4);
  const justify = chance(0.86);
  const hangMm = 5.5 + rng() * 3;
  const paraGapPt = Number((fontPt * (0.35 + rng() * 0.45)).toFixed(2));
  const numBold = chance(0.5);                 // bold recital tokens, anchor-style
  const defsBold = chance(0.6);
  const artTitleItal = chance(0.45);
  const ulEvery = ri(4, 14);                   // editorial underline density (contin/act)
  const editorialUl = mode !== "amend" && chance(0.45);
  const hyphTail = mode !== "act" || chance(0.4);
  const wantArtTitles = chance(0.8);

  // ---------------- page furniture ----------------
  const pgSec = `L ${ri(58, 344)}`;
  const pgNo = ri(4, 168);
  const gazDate = dateShort(ri(1, 28), ri(0, 11), baseYear);
  const headStyle = pick(["oj", "oj", "ojcode", "plain"]);
  const footStyle = pick(["none", "none", "num", "numtot"]);
  const footTot = pgNo + ri(6, 210);
  const headRule = chance(0.55);

  // ---------------- geometry / line budget ----------------
  const MM = 2.83465;
  const pageWpt = 210 * MM, pageHpt = 297 * MM;
  const usableWpt = pageWpt - 2 * padSideMm * MM;
  const colWpt = twoCol ? (usableWpt - colGapMm * MM) / 2 : usableWpt;
  const CAL = Number(process.env.RR_CAL || 0) || (twoCol ? 0.95 : 1.04);  // line-budget calibration (measured)
  const cplEff = (colWpt / (fontPt * charW)) * 0.962 * CAL;
  const cplFull = (usableWpt / (fontPt * charW)) * 0.962 * CAL;
  const linePt = fontPt * lh;
  const headFontPt = fontPt * 0.94;
  const headBlockPt = headStyle === "none" ? 0 : headFontPt * lh + (headRule ? 6.5 : 4.5) + fontPt * 0.6;
  const fnFontPt = fontPt * 0.88;
  // the footnote block is bottom-anchored inside the lower margin; reserve only the
  // part of it that reaches up into the text column
  const fnAnchorMm = padBotMm * (footStyle === "none" ? 0.40 : 0.62);
  const fnBlockPt = wantFn ? Math.max(0, 3 * fnFontPt * 1.14 + 5 - (padBotMm - fnAnchorMm) * MM) : 0;
  const bodyHpt = pageHpt - (padTopMm + padBotMm) * MM - headBlockPt - fnBlockPt;
  const linesPerCol = Math.floor(bodyHpt / linePt);
  const totalLines = linesPerCol * (twoCol ? 2 : 1) - 0.6;

  let colBoxPt = bodyHpt;
  const gapL = paraGapPt / linePt;
  const WIDTH = { "": 1, rec: 0.985, art: 0.985, pt: 0.93, dash: 0.955, quote: 0.9, ctr: 1, sig: 1, open: 1 };
  const ceilL = (s, w) => Math.max(1, Math.ceil(rawLen(s) / w));

  function estLines(b) {
    if (b.k === "h") return (b.lvl === 1 ? 1.35 : 1.1) + gapL + (b.lvl === 1 ? 1.1 : 0.5);
    if (b.k === "p") return ceilL(b.text, cplEff * WIDTH[b.cls || ""]) + (b.tight ? 0.06 : gapL);
    if (b.k === "list") return b.items.reduce((s, t) => s + ceilL(t, cplEff * WIDTH[b.cls]), 0) + gapL;
    if (b.k === "sig") return b.lines.length + 1.2 + gapL;
    return 1;
  }

  // ---------------- document assembly ----------------
  const head = [];             // full-width blocks above the columns (twocol title block)
  const flow = [];
  let used = 0;
  const push = (b) => { flow.push(b); used += estLines(b); };
  const pushHead = (b) => { head.push(b); used += estLinesFull(b) * (twoCol ? 2 : 1); };
  function estLinesFull(b) {
    if (b.k === "h") return (b.lvl === 1 ? 1.35 : 1.1) + gapL + (b.lvl === 1 ? 1.1 : 0.5);
    return ceilL(b.text, cplFull * WIDTH[b.cls || ""]) + gapL;
  }
  const room = () => totalLines - used;

  // editorial underline sprinkling (consolidated-text markup look)
  let sentN = 0;
  const depthAt = (s) => (s.match(/\u0001/g) || []).length - (s.match(/\u0002/g) || []).length;
  const hasMark = (s) => /[\u0001\u0002]/.test(s);
  function maybeUl(s) {
    sentN++;
    if (!editorialUl || sentN % ulEvery !== 0) return s;
    const words = s.split(" ");
    if (words.length < 17) return s;
    const a = ri(3, words.length - 10), n = ri(3, 6);
    const seg = words.slice(a, a + n).join(" ");
    if (hasMark(seg) || depthAt(words.slice(0, a).join(" ")) !== 0) return s;
    return words.slice(0, a).concat([U(seg)], words.slice(a + n)).join(" ");
  }

  // recital engine
  const capF = (s) => s.replace(/^((?:\u0001[BIUSF])*)([a-z\u00e0-\u00ff])/, (m, pre, c) => pre + c.toUpperCase());
  let recOrder = shuffle(REC.map((_, i) => i)), recPos = 0;
  function recSentence() {
    if (recPos >= recOrder.length) { recOrder = shuffle(REC.map((_, i) => i)); recPos = 0; }
    return capF(fill(REC[recOrder[recPos++]]));
  }
  let recN = mode === "contin" ? ri(9, 44) : 1;
  function recital() {
    const k = ri(1, 3);
    const parts = [];
    for (let i = 0; i < k; i++) parts.push(recSentence());
    const tok = `(${recN++})`;
    return { k: "p", cls: "rec", text: `${numBold ? B(tok) : tok} ${maybeUl(parts.join(" "))}` };
  }

  let artOrder = shuffle(ARTP.map((_, i) => i)), artPos = 0;
  const artSentence = () => { if (artPos >= artOrder.length) { artOrder = shuffle(ARTP.map((_, i) => i)); artPos = 0; } return capF(fill(ARTP[artOrder[artPos++]])); };

  let artN = mode === "contin" ? ri(1, 9) : 1;
  const titlePool = shuffle(ARTTITLE);
  let titleIdx = 0;
  function article(kind) {
    const out = [];
    const n = artN++;
    out.push({ k: "h", lvl: 2, text: L.art(n), align: "center" });
    if (wantArtTitles) {
      const t = kind === "defs" ? ARTTITLE[1] : kind === "final" ? { en: "Entry into force", de: "Inkrafttreten", fr: "Entrée en vigueur" }[lang] : titlePool[titleIdx++ % titlePool.length];
      out.push({ k: "h", lvl: 3, text: t, align: "center" });
    }
    if (kind === "defs") {
      out.push({ k: "p", cls: "", text: L.defsIntro });
      const nd = ri(3, 5);
      const items = shuffle(DEFS).slice(0, nd).map(([t, d], i) => {
        const term = q(fill(t));
        const lead = defsBold ? B(term) : I(term);
        return `(${String.fromCharCode(97 + i)}) ${lead} ${L.cont === "on entend par" ? "" : L.cont + " "}${fill(d)}`;
      });
      out.push({ k: "list", cls: "pt", items });
      return out;
    }
    if (kind === "final") {
      out.push({ k: "p", cls: "art", text: `1. ${L.force()}` });
      if (chance(0.7)) out.push({ k: "p", cls: "art", text: `2. ${L.apply()}` });
      out.push({ k: "p", cls: "", text: L.binding });
      return out;
    }
    const np = ri(2, 3);
    for (let i = 0; i < np; i++) {
      out.push({ k: "p", cls: "art", text: `${i + 1}. ${maybeUl(artSentence())}` });
      if (i === 0 && chance(0.45)) {
        const items = shuffle(PTS).slice(0, ri(3, 5)).map((t, j) => `(${String.fromCharCode(97 + j)}) ${fill(t)}`);
        out.push({ k: "list", cls: "pt", items });
      }
    }
    return out;
  }

  function amendPoints() {
    const A = {
      en: [
        () => `(${amN++}) in ${artRef()}, point (b) is replaced by the following:`,
        () => `(${amN++}) the following paragraph is added to ${artRef()}:`,
        () => `(${amN++}) in ${artRef()}, the words ${S(q(fill("within 30 days of the date of sampling")))} are replaced by ${U(q(fill("within 20 working days of the date of sampling")))};`,
        () => `(${amN++}) in the Annex, the entry relating to {S} is replaced by the text set out in the Annex to this Regulation;`,
        () => `(${amN++}) ${artRef()} is deleted;`,
      ],
      de: [
        () => `(${amN++}) In ${artRef()} erhält Buchstabe b folgende Fassung:`,
        () => `(${amN++}) Dem ${artRef()} wird folgender Absatz angefügt:`,
        () => `(${amN++}) In ${artRef()} werden die Worte ${S(q(fill("innerhalb von 30 Tagen nach der Probenahme")))} durch die Worte ${U(q(fill("innerhalb von 20 Arbeitstagen nach der Probenahme")))} ersetzt;`,
        () => `(${amN++}) Im Anhang erhält der Eintrag zu {Sd} die Fassung des Anhangs der vorliegenden Verordnung;`,
        () => `(${amN++}) ${artRef()} wird gestrichen;`,
      ],
      fr: [
        () => `(${amN++}) à ${artRef()}, le point b) est remplacé par le texte suivant:`,
        () => `(${amN++}) le paragraphe suivant est ajouté à ${artRef()}:`,
        () => `(${amN++}) à ${artRef()}, les termes ${S(q(fill("dans un délai de 30 jours à compter du prélèvement")))} sont remplacés par ${U(q(fill("dans un délai de 20 jours ouvrables à compter du prélèvement")))};`,
        () => `(${amN++}) à l'annexe, l'entrée relative aux {S} est remplacée par le texte figurant à l'annexe du présent règlement;`,
        () => `(${amN++}) ${artRef()} est supprimé;`,
      ],
    }[lang];
    return A;
  }
  let amN = 1, annexN = 1, tailKind = "rec";
  const sigBlock = () => ({ k: "sig", lines: [L.done(city), L.forc, L.pres, signer] });
  function annexBlocks() {
    const out = [];
    out.push({ k: "h", lvl: 2, text: { en: "ANNEX", de: "ANHANG", fr: "ANNEXE" }[lang], align: "center" });
    out.push({
      k: "h", lvl: 3, align: "center", text: fill({
        en: `Verification requirements applicable to {S}`,
        de: `Anforderungen an die \u00dcberpr\u00fcfung von {Sd}`,
        fr: `Exigences de v\u00e9rification applicables aux {S}`,
      }[lang]),
    });
    out.push({
      k: "p", cls: "", text: fill({
        en: `The requirements set out in this Annex apply to the determination of {A} of {S} referred to in {AR} of this Regulation. Point 1 applies from {D2}.`,
        de: `Die Anforderungen dieses Anhangs gelten f\u00fcr die Bestimmung {Ag} von {Sd} gem\u00e4\u00df {AR} der vorliegenden Verordnung. Nummer 1 gilt ab dem {D2}.`,
        fr: `Les exigences \u00e9nonc\u00e9es \u00e0 la pr\u00e9sente annexe s'appliquent \u00e0 la d\u00e9termination {Ade} des {S} vis\u00e9e \u00e0 {AR} du pr\u00e9sent r\u00e8glement. Le point 1 est applicable \u00e0 partir du {D2}.`,
      }[lang]),
    });
    return out;
  }
  function quotedAmendment() {
    const body = fill(artSentence());
    const words = body.split(" ");
    const a = ri(2, Math.max(3, words.length - 8)), n = ri(3, 6);
    const seg = words.slice(a, a + n).join(" ");
    const safe = words.length > 14 && !hasMark(seg) && depthAt(words.slice(0, a).join(" ")) === 0;
    const del = S(lang === "en" ? "and shall notify the Commission accordingly"
      : lang === "de" ? "und unterrichten die Kommission entsprechend" : "et en informent la Commission");
    const txt = safe ? words.slice(0, a).concat([U(seg)], words.slice(a + n)).join(" ") : body;
    return q(`${ri(2, 6)}. ${txt} ${del}`);
  }

  // ---- header / footer strings (spaced with literal runs so GT == DOM) ----
  const hcpl = usableWpt / (headFontPt * charW);
  function spread(parts) {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const gaps = parts.length - 1;
    const sp = Math.max(3, Math.floor((hcpl - len) / Math.max(1, gaps)));
    return parts.join(" ".repeat(sp));
  }
  let headLine = "";
  if (headStyle === "oj") headLine = pgNo % 2 === 0 ? spread([`${pgSec}/${pgNo}`, UNION.journal, gazDate]) : spread([gazDate, UNION.journal, `${pgSec}/${pgNo}`]);
  else if (headStyle === "ojcode") headLine = pgNo % 2 === 0 ? spread([`${pgSec}/${pgNo}`, UNION.code, UNION.journal, gazDate]) : spread([gazDate, UNION.code, UNION.journal, `${pgSec}/${pgNo}`]);
  else headLine = spread([UNION.journal, gazDate]);
  const footLine = footStyle === "none" ? "" : footStyle === "num" ? `${pgNo}` : `${pgNo}/${footTot}`;

  // ---- title block ----
  const titleBlocks = [];
  if (mode !== "contin") {
    if (chance(0.55)) titleBlocks.push({ k: "h", lvl: 2, text: { en: "REGULATIONS", de: "VERORDNUNGEN", fr: "RÈGLEMENTS" }[lang], align: "center" });
    titleBlocks.push({ k: "h", lvl: 1, text: titleLine1, align: "center" });
    titleBlocks.push({ k: "h", lvl: 2, text: titleLine2, align: "center" });
    titleBlocks.push({ k: "h", lvl: 2, text: titleLine3, align: "center" });
    if (chance(0.5)) titleBlocks.push({ k: "p", cls: "ctr", text: I(UNION.area) });
  }
  if (twoCol) titleBlocks.forEach(pushHead); else titleBlocks.forEach(push);

  // ---- body ----
  if (mode === "contin") {
    // continuation page: opens mid-sentence, carried over from the previous page
    const frag = strip(recSentence() + " " + recSentence());
    const sp = frag.indexOf(" ", ri(8, 26));
    const w = sp > 0 ? frag.slice(sp + 1).split(" ")[0] : "";
    const startAt = sp < 0 ? 12 : w.length >= 7 ? sp + 1 + ri(2, Math.min(5, w.length - 3)) : sp + 1;
    push({ k: "p", cls: "", text: frag.slice(startAt) });
  } else {
    push({ k: "p", cls: "open", text: UNION.comm });
    push({ k: "p", cls: "", text: L.hr1 });
    push({ k: "p", cls: "", text: L.hr2() });
    if (chance(0.45)) push({ k: "p", cls: "", text: L.hr3() });
    push({ k: "p", cls: "", text: L.whereas });
  }

  if (mode === "amend") {
    const nrec = ri(3, 5);
    for (let i = 0; i < nrec && room() > 6; i++) push(recital());
    push({ k: "p", cls: "", text: L.adopted });
    push({ k: "h", lvl: 2, text: L.art(artN++), align: "center" });
    push({ k: "p", cls: "", text: L.amendIntro() });
    tailKind = "amend";
    const bank = amendPoints();
    let order = shuffle(bank.map((_, i) => i)), oi = 0, guard = 0;
    while (room() > 6.5 && guard++ < 24) {
      if (oi >= order.length) { order = shuffle(order); oi = 0; }
      const f = bank[order[oi++]];
      const lead = fill(f());
      push({ k: "p", cls: "art", text: lead });
      if (/:$/.test(strip(lead))) push({ k: "p", cls: "quote", text: quotedAmendment() });
    }
    if (room() > 5) {
      article("final").forEach(push);
      if (room() > 3.4) { push(sigBlock()); tailKind = "rec"; }
    }
  } else {
    const completes = mode !== "contin" && chance(0.35);
    const wantAnnex = completes && chance(0.55);   // act closes, its annex starts below
    const reserve = completes ? (wantAnnex ? 46 : 20) : 0;
    // recitals fill the page (or up to the reserved article space)
    while (room() - reserve > 4.5) {
      const r = recital();
      if (estLines(r) > room() - reserve + 2) break;
      push(r);
    }
    if (completes || (mode === "contin" && room() > 16)) {
      if (mode !== "contin") push({ k: "p", cls: "", text: L.adopted });
      const kinds = shuffle(["scope", "defs", "obl", "obl"]).slice(0, wantAnnex ? 1 : 2);
      for (const kd of kinds) {
        const blocks = article(kd);
        const cost = blocks.reduce((s, b) => s + estLines(b), 0);
        if (cost > room() - (completes ? 9 : 0)) break;
        blocks.forEach(push);
      }
      if (completes && room() > 8) {
        article("final").forEach(push);
        push(sigBlock());
      } else if (mode === "contin") {
        while (room() > 4.5) {
          const blocks = article(pick(["obl", "obl", "scope"]));
          const cost = blocks.reduce((s, b) => s + estLines(b), 0);
          if (cost > room() + 3) break;
          blocks.forEach(push);
        }
      }
    }
  }

  // an act that closes mid-page is followed by its annex, exactly as in the gazette
  if (room() > 9 && flow.some((b) => b.k === "sig")) {
    annexBlocks().forEach(push);
    tailKind = "annex";
    while (room() > 4.2 && annexN < 12) {
      push({ k: "p", cls: "art", text: `${annexN++}. ${artSentence()}` });
      if (room() > 6 && chance(0.4)) {
        const items = shuffle(PTS).slice(0, ri(3, 4)).map((t, j) => `(${String.fromCharCode(97 + j)}) ${fill(t)}`);
        const lb = { k: "list", cls: "pt", items };
        if (estLines(lb) < room() - 1.5) push(lb);
      }
    }
  }

  // fill the remaining sliver with a recital cut mid-word (gazette continuation look)
  if (hyphTail && room() > 1.3 && flow[flow.length - 1]?.k !== "sig") {
    const rem = room();
    const inArticle = tailKind !== "rec";
    let long = "";
    while (rawLen(long) < rem * cplEff + 200) long += (long ? " " : "") + (inArticle ? artSentence() : recSentence());
    long = strip(long);
    const budget = Math.floor(rem * cplEff) - 10;
    if (budget > 45) {
      const tokTxt = tailKind === "amend" ? `(${amN++})` : tailKind === "annex" ? `${annexN++}.` : `(${recN++})`;
      // cut inside a word, so the page breaks mid-hyphenation as gazette pages do
      let ls = long.slice(0, Math.max(20, budget - 6)).lastIndexOf(" ");
      for (let t = 0; t < 6; t++) {
        const w0 = long.slice(ls + 1).split(" ")[0] || "";
        if (w0.length >= 7 || ls < 30) break;
        ls = long.slice(0, ls).lastIndexOf(" ");
      }
      const w = long.slice(ls + 1).split(" ")[0] || "";
      const body = w.length >= 7 ? long.slice(0, ls + 1) + w.slice(0, Math.max(3, Math.floor(w.length / 2))) + "-" : long.slice(0, ls);
      push({ k: "p", cls: tailKind === "rec" ? "rec" : "art", text: `${numBold && tailKind === "rec" ? B(tokTxt) : tokTxt} ${body}` });
    }
  }

  // ---------------- HTML ----------------
  const TOKRE = /^((?:<b>)?(?:\((?:\d{1,3}|[a-z])\)|\d{1,3}\.)(?:<\/b>)?) /;
  const tokWrap = (h, cls) => (cls === "rec" || cls === "art" || cls === "pt")
    ? h.replace(TOKRE, `<span class="${cls === "pt" ? "tokp" : "tok"}">$1</span> `) : h;
  const blockHtml = (b) => {
    if (b.k === "h") return `<div class="h h${b.lvl}" style="text-align:${b.align || "center"}">${ht(b.text)}</div>`;
    if (b.k === "p") return `<p class="${b.cls || "b0"}">${tokWrap(ht(b.text), b.cls)}</p>`;
    if (b.k === "list") return `<div class="lst">${b.items.map((t) => `<p class="${b.cls}">${b.cls === "dash" ? "– " : ""}${tokWrap(ht(t), b.cls)}</p>`).join("\n")}</div>`;
    if (b.k === "sig") return `<div class="sigb">${b.lines.map((t) => `<p class="sig">${ht(t)}</p>`).join("")}</div>`;
    return "";
  };
  const headHtml = head.map(blockHtml).join("\n");
  const flowHtml = flow.map(blockHtml).join("\n");
  colBoxPt -= head.reduce((a, b) => a + estLinesFull(b), 0) * linePt;
  const feather = !twoCol && flow.length >= 5;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0 }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: ${fontFam}; font-size: ${fontPt}pt; line-height: ${lh};
         color: #000; -webkit-font-smoothing: antialiased; }
  .page { box-sizing: border-box; width: 210mm; height: 297mm; position: relative;
          padding: ${padTopMm.toFixed(1)}mm ${padSideMm.toFixed(1)}mm ${padBotMm.toFixed(1)}mm; overflow: hidden; }
  .hdr { white-space: pre; font-size: ${headFontPt.toFixed(2)}pt; margin-bottom: ${(fontPt * 0.6).toFixed(1)}pt;
         ${headRule ? "border-bottom: 0.7pt solid #000; padding-bottom: 2.2pt;" : ""} }
  .cols { height: ${colBoxPt.toFixed(1)}pt; ${twoCol
    ? `column-count: 2; column-fill: auto; column-gap: ${colGapMm.toFixed(1)}mm; ${colRule ? "column-rule: 0.4pt solid #666;" : ""}`
    : `display: flex; flex-direction: column; ${feather ? "justify-content: space-between;" : ""}`} }
  .cols > * { flex: 0 0 auto; }
  .lst { margin-bottom: ${paraGapPt}pt; }
  .sigb { margin-top: ${(fontPt * 0.9).toFixed(1)}pt; }
  .sigb p { margin: 0; }
  p { margin: 0 0 ${paraGapPt}pt 0; text-align: ${justify ? "justify" : "left"}; text-align-last: left;
      hyphens: auto; -webkit-hyphens: auto; orphans: 1; widows: 1; }
  p.rec, p.art { padding-left: ${hangMm.toFixed(1)}mm; }
  p.pt { padding-left: ${(hangMm + 4).toFixed(1)}mm; margin-bottom: 0; }
  p.dash { padding-left: ${(hangMm + 2).toFixed(1)}mm; margin-bottom: 0; }
  p.quote { padding-left: ${(hangMm + 3).toFixed(1)}mm; }
  p.ctr { text-align: center; text-align-last: center; }
  p.sig { text-align: right; text-align-last: right; margin-bottom: 0; }
  p.open { font-weight: ${chance(0.5) ? "bold" : "normal"}; }
  .h { font-weight: bold; break-after: avoid; }
  .h1 { font-size: ${(fontPt * 1.16).toFixed(2)}pt; margin: ${(fontPt * 0.9).toFixed(1)}pt 0 ${(fontPt * 0.3).toFixed(1)}pt; }
  .h2 { margin: ${(fontPt * 0.55).toFixed(1)}pt 0 ${(fontPt * 0.25).toFixed(1)}pt; }
  .h3 { margin: ${(fontPt * 0.3).toFixed(1)}pt 0 ${(fontPt * 0.3).toFixed(1)}pt; ${artTitleItal ? "font-style: italic;" : ""} }
  .fn { position: absolute; left: ${padSideMm.toFixed(1)}mm; right: ${padSideMm.toFixed(1)}mm;
        bottom: ${fnAnchorMm.toFixed(1)}mm; font-size: ${fnFontPt.toFixed(2)}pt; line-height: 1.14; }
  .fn .rule { border-top: 0.6pt solid #000; width: ${ri(24, 46)}mm; margin-bottom: 2pt; }
  .fn p { margin: 0; text-align: left; }
  .ftr { position: absolute; left: ${padSideMm.toFixed(1)}mm; right: ${padSideMm.toFixed(1)}mm;
         bottom: ${(padBotMm * 0.45).toFixed(1)}mm; text-align: center; }
  .tok { display: inline-block; min-width: ${Math.max(2.4, hangMm - 1.4).toFixed(1)}mm; margin-left: -${hangMm.toFixed(1)}mm; }
  .tokp { display: inline-block; min-width: ${Math.max(2.4, hangMm - 1.9).toFixed(1)}mm; margin-left: -${(hangMm - 0.5).toFixed(1)}mm; }
  sup { font-size: 0.72em; vertical-align: super; line-height: 0; }
  </style></head><body><div class="page">
  ${headStyle === "none" ? "" : `<div class="hdr">${ht(headLine)}</div>`}
  ${headHtml}
  <div class="cols">
${flowHtml}
  </div>
  ${fnLines.length ? `<div class="fn"><div class="rule"></div>${fnLines.map((l) => `<p>${ht(l)}</p>`).join("")}</div>` : ""}
  ${footLine ? `<div class="ftr">${ht(footLine)}</div>` : ""}
  </div></body></html>`;

  // ---------------- GT (markdown text, logical reading order) ----------------
  const gtParts = [];
  if (headStyle !== "none") gtParts.push(md(headLine));
  for (const b of head.concat(flow)) {
    if (b.k === "h") gtParts.push(`${"#".repeat(b.lvl)} ${md(b.text)}`);
    else if (b.k === "p") gtParts.push(md(b.text));
    else if (b.k === "list") gtParts.push(b.items.map((t) => `${b.cls === "dash" ? "- " : ""}${md(t)}`).join("\n"));
    else if (b.k === "sig") gtParts.push(b.lines.map(md).join("\n\n"));
  }
  for (const l of fnLines) gtParts.push(md(l));
  if (footLine) gtParts.push(md(footLine));
  const gt = gtParts.join("\n\n");

  return { html, gt, pageOpts: { format: "A4" }, dbg: { cplEff, cplFull, linePt, totalLines, used, mode, twoCol, gapL, WIDTH, roomLeft: room(), hasSig: flow.some((b) => b.k === "sig") } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
