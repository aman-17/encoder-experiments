// FAMILY GENERATOR — dense academic methods/results page (journal interior page).
//
// Genre anchor: a dense mid-document technical page (patent / journal interior) that fails
// ParseBench on FORMAT: tiny running header, wall-to-wall justified prose, numbered
// sections, bracketed citations, italic gene/species codes, long numeric runs (percent
// ladders, p-values, CIs), hanging dash lists, boxed protocol, footnote block, page
// furniture, and a mid-word cut at the page break.
//
// This is a FAMILY, not a replica. Four discrete layout modes:
//   0  single column, numbered headings on their own line
//   1  two column, run-in bold numbered headings, optional column rule
//   2  single column + boxed protocol inset (+ optional figure placeholder)
//   3  two column + figure placeholder(s)
// plus continuous jitter: font family/size/leading, margins/gutter, citation style
// (numeric vs author-year), emphasis density (underline/bold key-term probability),
// section numbering start and dot style, methods-only vs methods+results, indented vs
// spaced paragraphs, justification, footnote count/marker set, header/footer style,
// figure count 0-2, continuation opener, percent-ladder sentence.
//
// GT is built FIRST as markdown; the HTML is derived from the same strings by a
// marker->tag conversion, so render and GT emphasis cannot drift apart.
// All content is freshly invented (fictional journals, authors, species, genes, strains,
// vendors, accessions). Nothing is transcribed from any real page.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const rf = (a, b) => a + rng() * (b - a);
  const chance = (p) => rng() < p;
  const shuf = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  };
  const dec = (lo, hi, d) => rf(lo, hi).toFixed(d);

  // ================= layout mode + style knobs =================
  const mode = ri(0, 3);
  const cols = mode === 1 || mode === 3 ? 2 : 1;
  const runIn = mode === 1 ? chance(0.85) : chance(0.3);
  const hasBox = mode === 2 ? true : chance(0.18);
  const figCount = mode === 3 ? ri(1, 2) : mode === 2 ? ri(0, 1) : chance(0.28) ? 1 : 0;

  // per-font advance widths (em) by character class, measured in Chrome — the line-fit
  // model below needs them because this genre is digit- and code-heavy and digits are
  // much wider than average lowercase text.
  const FONTS = [
    ['"Times New Roman", Times, serif', { lc: 0.4593, uc: 0.6667, dg: 0.5000, sp: 0.2500, pu: 0.4202 }],
    ['"Times New Roman", Times, serif', { lc: 0.4593, uc: 0.6667, dg: 0.5000, sp: 0.2500, pu: 0.4202 }],
    ["Georgia, serif", { lc: 0.4991, uc: 0.6813, dg: 0.5478, sp: 0.2412, pu: 0.4743 }],
    ['"Palatino Linotype", Palatino, "Book Antiqua", serif', { lc: 0.5124, uc: 0.6885, dg: 0.5000, sp: 0.2500, pu: 0.4450 }],
    ["Arial, Helvetica, sans-serif", { lc: 0.4895, uc: 0.6774, dg: 0.5562, sp: 0.2778, pu: 0.4278 }],
  ];
  const [fontFam, FW] = pick(FONTS);
  const basePt = Number((cols === 2 ? rf(6.9, 7.9) : rf(7.4, 8.6)).toFixed(2));
  const lh = Number(rf(1.16, 1.30).toFixed(3));
  const marginX = ri(15, 21);
  const marginTop = ri(11, 15);
  const marginBot = ri(11, 15);
  const gutter = Number(rf(5, 8).toFixed(1));
  const colRule = cols === 2 && chance(0.45);
  const indentStyle = chance(0.62); // first-line indent, no inter-paragraph gap
  const indentMm = Number(rf(2.6, 4.4).toFixed(2));
  const paraGapMm = indentStyle ? 0 : Number(rf(0.6, 1.3).toFixed(2));
  const justify = chance(0.82);
  const smallCapsHead = chance(0.25);
  const headRule = chance(0.55);
  const boxShaded = chance(0.5);
  const phVert = chance(0.5);
  const fnRuleMm = ri(40, 70);

  // emphasis density (drift knob — this family exists to teach FORMAT fidelity)
  const emphLevel = pick(["sparse", "medium", "medium", "heavy"]);
  const uProb = { sparse: 0.05, medium: 0.28, heavy: 0.55 }[emphLevel];
  const bProb = { sparse: 0.10, medium: 0.22, heavy: 0.34 }[emphLevel];

  // ================= fictional identity pools =================
  const JOURNALS = [
    ["Journal of Applied Microbial Genomics", "J. Appl. Microb. Genomics"],
    ["Molecular Phytopathology Letters", "Mol. Phytopathol. Lett."],
    ["Archives of Environmental Biotechnology", "Arch. Environ. Biotechnol."],
    ["International Journal of Cellular Proteomics", "Int. J. Cell. Proteomics"],
    ["Biotechnology and Applied Enzymology", "Biotechnol. Appl. Enzymol."],
    ["Journal of Structural Glycobiology", "J. Struct. Glycobiol."],
    ["Plant Stress Physiology Reports", "Plant Stress Physiol. Rep."],
    ["Annals of Soil Microbial Ecology", "Ann. Soil Microb. Ecol."],
  ];
  const SURNAMES = ["Marchetti", "Oyelaran", "Duvall", "Kowalczyk", "Nsimba", "Prakash", "Rehberg",
    "Solheim", "Vantorre", "Yakushiji", "Almeida", "Bergqvist", "Ceccarelli", "Halvorsen",
    "Iribarren", "Mwangi", "Ostrowski", "Trevisan", "Ferraz", "Lindqvist"];
  const INITIALS = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "J.", "K.", "L.", "M.", "N.", "P.", "R.", "S.", "T.", "V."];
  const GENERA = ["Pseudomonas", "Paenibacillus", "Rhizobium", "Streptomyces", "Burkholderia",
    "Xanthomonas", "Bradyrhizobium", "Aspergillus", "Trichoderma", "Nicotiana", "Sorghum", "Medicago"];
  const EPITHETS = ["velutina", "fluvialis", "tenellum", "corymbosum", "cinereolum", "pallidum",
    "arenicola", "murinum", "saxatile", "hiemale", "obscurum", "praticola"];
  const GENES = ["pglR", "hrcB2", "mtdA", "cybX", "rlsK", "ftsQ2", "aphD", "nodZ2", "sptR", "velB1",
    "xylT", "cerM", "dgkA3", "wzyE", "abcT2", "lrpB"];
  const STRAIN_PRE = ["KX", "TR", "LMV", "BCC", "AQ", "MPX", "GV", "ZR", "HN", "CT"];
  const MEDIA = ["Lauria–Bertani", "tryptone–yeast extract", "minimal salts (M9-type)", "nutrient broth No. 2",
    "casein hydrolysate", "half-strength basal salt", "potato dextrose", "buffered peptone"];
  const ABX = ["kanamycin", "rifampicin", "spectinomycin", "gentamicin", "chloramphenicol", "hygromycin", "carbenicillin"];
  const INSTR = ["Quantiflex 480 cycler (Norvell Scientific)", "AxioSpec MS-9 spectrometer (Braemar Instruments)",
    "HeliScan 300 imager (Corvid Optics)", "Nanolyte D2 fluorometer (Westmark Bio)",
    "Chromaflow 12 chromatography system (Ardent Analytical)", "PolarView LX confocal platform (Corvid Optics)",
    "GelVision 700 documentation station (Westmark Bio)"];
  const SOFT = ["ALIGNRx v3.2", "SeqForge 2.7", "StatBench 4.1", "PhyloKit 1.9", "ImageParse 6.0",
    "MotifScope 2.4", "TraitStat 3.6"];
  const DBS = ["the superfamily reference set", "the orthology-family reference set", "the profile-HMM domain set",
    "the structural-domain assignment set", "the curated motif library"];
  const BUFFERS = ["50 mM HEPES (pH 7.4)", "20 mM Tris–HCl (pH 8.0), 150 mM NaCl", "phosphate-buffered saline",
    "25 mM MES (pH 6.2), 1 mM DTT", "10 mM sodium phosphate (pH 7.0)", "Tris-buffered saline with 0.1% Tween-20"];
  const TERMS = ["biofilm formation", "osmotic adjustment", "transcript stability", "membrane integrity",
    "stomatal conductance", "substrate turnover", "root colonisation", "oxidative burst",
    "vesicle trafficking", "cell-wall remodelling", "nitrogen partitioning", "photosystem II efficiency",
    "secretion competence", "chelator biosynthesis"];
  const TRAITS = ["shoot dry mass", "colonisation density", "lesion area", "specific activity",
    "chlorophyll retention", "spore yield", "exopolysaccharide content", "root length density",
    "electrolyte leakage", "seed set per panicle"];
  const CITIES = ["Wexford", "Karsten", "Palmeiras", "Norhaven", "Aurelia", "Brackenmoor", "Sant Ferrán", "Halstrup"];
  const DEPTS = ["Plant Molecular Physiology", "Microbial Ecology", "Structural Biochemistry",
    "Applied Genomics", "Environmental Microbiology"];
  const LATIN = ["*in vitro*", "*in planta*", "*de novo*", "*ad libitum*", "*in situ*", "*ex vivo*"];

  const [journalName, journalAbbr] = pick(JOURNALS);
  const year = ri(2027, 2034);
  const vol = ri(11, 96);
  const issue = ri(1, 12);
  const p1 = ri(102, 940);
  const p2 = p1 + ri(9, 24);
  const pageNo = p1 + ri(2, 8);
  const leadAuthor = `${pick(INITIALS)} ${pick(SURNAMES)}`;
  const spPool = shuf(GENERA).slice(0, 2).map((g, i) => [g, shuf(EPITHETS)[i]]);
  const genePool = shuf(GENES).slice(0, 5);
  const docTerms = shuf(TERMS);
  const docTraits = shuf(TRAITS);
  const strainOf = () => `${pick(STRAIN_PRE)}-${ri(11, 989)}`;
  const strains = [strainOf(), strainOf(), strainOf()];

  const spSeen = new Set();
  const spOne = (g) => {
    const key = g.join(" ");
    if (spSeen.has(key)) return `*${g[0][0]}. ${g[1]}*`;
    spSeen.add(key);
    return `*${g[0]} ${g[1]}*`;
  };
  const citStyle = chance(0.6) ? "num" : "ay";
  const citNum = () => {
    const a = ri(3, 46);
    const r = rng();
    if (r < 0.45) return `[${a}]`;
    if (r < 0.8) return `[${a},${a + ri(1, 6)}]`;
    return `[${a}–${a + ri(2, 5)}]`;
  };
  const citAY = () => {
    const s1 = pick(SURNAMES), s2 = pick(SURNAMES);
    const y = ri(year - 12, year - 1);
    return chance(0.6) ? `(${s1} et al., ${y})` : `(${s1} and ${s2}, ${y})`;
  };
  const keyTerm = () => {
    const t = pick(docTerms);
    if (rng() < uProb) return `<u>${t}</u>`;
    if (rng() < bProb) return `**${t}**`;
    return t;
  };
  const pval = () => (chance(0.3) ? `*P* < 0.0${ri(0, 4)}${ri(1, 9)}` : `*P* = 0.0${ri(10, 99)}`);
  const statPack = () => {
    const r = rng();
    if (r < 0.3) return `n = ${ri(4, 24)}; ${pval()}`;
    if (r < 0.55) return `*F*(${ri(1, 3)}, ${ri(18, 68)}) = ${dec(3.4, 21.9, 2)}, ${pval()}`;
    if (r < 0.8) return `${pval()}, 95% CI ${dec(0.08, 1.2, 2)}–${dec(1.3, 2.9, 2)}`;
    return `t = ${dec(2.1, 9.4, 2)}, df = ${ri(8, 46)}, ${pval()}`;
  };
  const accession = () => pick([
    `PF${String(ri(100, 9990)).padStart(5, "0")}`,
    `SSF${ri(50000, 59999)}`,
    `PTHR${ri(10000, 29999)}`,
    `G3DSA:${ri(1, 3)}.${ri(10, 99)}.${ri(100, 999)}.${ri(10, 99)}`,
    `ORF-${ri(1000, 4999)}`,
  ]);

  const S = {
    sp: () => spOne(chance(0.72) ? spPool[0] : spPool[1]),
    gene: () => `*${pick(genePool)}*`,
    prot: () => { const g = pick(genePool); return g[0].toUpperCase() + g.slice(1); },
    strain: () => `strain ${pick(strains)}`,
    plas: () => `p${pick(["MTX", "VLQ", "KQR", "BSN", "DHX", "TEM"])}-${ri(2, 138)}`,
    med: () => pick(MEDIA),
    ab: () => pick(ABX),
    temp: () => String(ri(18, 37)),
    temp2: () => String(ri(55, 64)),
    temp3: () => String(ri(14, 22)),
    rpm: () => String(ri(120, 240)),
    od: () => dec(0.3, 0.9, 2),
    h: () => String(ri(2, 48)),
    min: () => String(ri(5, 90)),
    sec: () => String(ri(20, 60)),
    cyc: () => String(ri(32, 45)),
    n: () => String(ri(3, 9)),
    n3: () => String(ri(10, 40)),
    bp: () => String(ri(180, 2400)),
    ng: () => String(ri(50, 950)),
    ug: () => String(ri(8, 60)),
    mg: () => String(ri(20, 220)),
    ml: () => String(ri(1, 12)),
    ul: () => String(ri(10, 50)),
    conc: () => dec(0.1, 9.9, 1),
    conc2: () => String(ri(25, 200)),
    dil: () => `1:${ri(2, 12) * 500}`,
    kda: () => String(ri(18, 96)),
    inst: () => pick(INSTR),
    soft: () => pick(SOFT),
    db: () => pick(DBS),
    acc: () => accession(),
    buffer: () => pick(BUFFERS),
    cit: () => (citStyle === "num" ? citNum() : citAY()),
    term: () => keyTerm(),
    lat: () => pick(LATIN),
    trait: () => pick(docTraits),
    Trait: () => { const t = pick(docTraits); return t[0].toUpperCase() + t.slice(1); },
    pct: () => String(ri(55, 99)),
    pct2: () => String(ri(4, 48)),
    stat: () => statPack(),
    pval: () => pval(),
    fold: () => dec(1.6, 9.4, 1),
    nm: () => String(ri(340, 690)),
    model: () => pick(["LG+G4", "WAG+I+G", "JTT+F+G4", "GTR+G"]),
    ev: () => `1e-${ri(4, 40)}`,
    alpha: () => pick(["*P* < 0.05", "*P* < 0.01", "an adjusted *P* of 0.05"]),
    sub: () => `${pick(["D", "E", "K", "R", "S", "T", "Y"])}${ri(41, 388)}${pick(["A", "N", "Q", "F"])}`,
    prom: () => pick(["constitutive", "native", "arabinose-inducible", "tetracycline-repressible"]),
    enz: () => pick(["BamHI", "EcoRV", "NdeI", "XhoI", "SacII", "KpnI"]),
    day: () => String(ri(8, 34)),
    g: () => String(ri(4, 20) * 1000),
    tab: () => `Table ${ri(1, 4)}`,
  };
  const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => S[k]());

  // ================= sentence bank (freshly written, slot-parameterised) =================
  const TOPICS = {
    strains: {
      titles: ["Bacterial strains, media and growth conditions", "Isolates and culture regimes", "Strains, plasmids and growth conditions"],
      sents: [
        "Working cultures of {sp} {strain} were revived from glycerol stocks held at −80 °C and streaked onto {med} agar {cit}.",
        "Liquid cultures were raised in {med} broth at {temp} °C with orbital shaking at {rpm} rpm until the optical density at 600 nm reached {od}.",
        "Where selection was required, {ab} and {ab} were added at {conc2} and {conc2} µg/ml respectively.",
        "Growth was recorded every {min} min in flat-bottom microplates, and every condition was represented by {n} independent biological replicates.",
        "For {term} assays, cells were harvested in mid-exponential phase, washed twice in {buffer} and resuspended to a fixed cell density.",
        "The identity of each working stock was confirmed by amplification and sequencing of the {gene} locus at the start of every experimental block.",
        "Plates were incubated at {temp} °C in darkness for {h} h before colonies were enumerated by two independent counters.",
        "Isolates that failed to reach the target density within {h} h were discarded rather than sub-cultured further.",
        "Assays performed {lat} used the same inoculum batch so that carry-over effects could be excluded.",
        "Culture collections are listed in {tab} together with the resistance markers carried by each background.",
      ],
    },
    cloning: {
      titles: ["Plasmid construction and transformation", "Vector assembly and genetic complementation", "Construct design and transformation"],
      sents: [
        "The coding sequence of {gene} was amplified with primers carrying {enz} and {enz} sites and ligated into {plas} downstream of the {prom} promoter.",
        "Deletion alleles were assembled by overlap extension from {n} fragments of roughly {bp} bp each.",
        "The substitution {sub} was introduced by site-directed mutagenesis and verified by sequencing across the entire insert.",
        "Constructs were delivered into {sp} {strain} by electroporation and transformants were recovered on {med} agar containing {conc2} µg/ml {ab}.",
        "Complementation lines carried {bp} bp of native upstream sequence fused to the full-length {gene} coding region.",
        "Empty-vector controls were produced in parallel and maintained under identical selection throughout the study {cit}.",
        "Single-copy insertion was confirmed for each line by quantitative amplification of the resistance cassette.",
        "Two independent transformants per construct were carried forward to guard against position effects.",
        "Plasmid maps and the full primer list are given in {tab} of the supplementary material.",
      ],
    },
    nucleic: {
      titles: ["Nucleic acid extraction", "Extraction of RNA and genomic DNA", "Sample preparation and nucleic acid recovery"],
      sents: [
        "Total RNA was extracted from {mg} mg of flash-frozen tissue on silica columns with an on-column DNase step.",
        "Integrity was checked on a {inst}; only preparations with an integrity score above {conc} were carried forward.",
        "Genomic DNA was recovered by a cetyltrimethylammonium bromide protocol and quantified fluorometrically in triplicate.",
        "Concentrations were normalised to {ng} ng/µl in nuclease-free water before any downstream reaction.",
        "Extractions from the {term} treatment were processed in the same batch as their matched controls to avoid confounding {cit}.",
        "Residual genomic contamination was assessed in reverse-transcriptase-minus controls and never exceeded background.",
        "Frozen material was ground under liquid nitrogen and kept below −70 °C until extraction.",
        "Yields varied between {ug} and {conc2} µg per gram of fresh weight across the sampling dates.",
      ],
    },
    qpcr: {
      titles: ["Quantification of transcript abundance", "Reverse-transcription quantitative PCR", "Transcript quantification"],
      sents: [
        "First-strand cDNA was synthesised from {ng} ng of total RNA in a {ul} µl reaction primed with random hexamers.",
        "Amplification was carried out on a {inst} in {ul} µl reactions with {min} min of initial denaturation followed by {cyc} cycles of 15 s at 95 °C and {sec} s at {temp2} °C.",
        "Relative abundance was derived by the comparative threshold approach using {gene} and {gene} as reference transcripts.",
        "Primer efficiencies lay between {pct}% and {pct}%, and dissociation analysis returned a single peak in every run.",
        "Each biological replicate was measured in {n} technical replicates, and no-template controls remained undetected up to cycle {cyc}.",
        "Amplicon identity was confirmed once per primer pair by sequencing of the purified product.",
        "Plates were arranged so that every treatment appeared once in each quadrant, which removes the position effect from the contrast of interest.",
        "Reference transcript stability across the sampling series was verified before any normalisation was applied {cit}.",
      ],
    },
    blot: {
      titles: ["Immunoblot analysis", "Protein extraction and immunodetection", "Immunoblotting"],
      sents: [
        "Total protein was extracted in {buffer} supplemented with a protease-inhibitor cocktail and cleared at {g} × g for {min} min at 4 °C.",
        "Aliquots containing {ug} µg of protein were resolved on {pct2}% polyacrylamide gels and transferred to nitrocellulose.",
        "Membranes were blocked for {min} min and probed overnight at 4 °C with antiserum raised against {prot}, diluted {dil}.",
        "Chemiluminescent signal was captured on a {inst} and band intensity was normalised to a {kda} kDa loading control.",
        "A single immunoreactive band close to the predicted mass of {kda} kDa was detected in extracts from all complemented lines.",
        "Exposure times were held constant within each membrane set so that intensities remained comparable across treatments.",
        "Densitometry was performed in {soft} on unsaturated exposures only.",
        "Pre-immune serum from the same animal served as the negative control on every membrane.",
      ],
    },
    purif: {
      titles: ["Recombinant protein expression and purification", "Heterologous expression and purification", "Protein production"],
      sents: [
        "Recombinant {prot} bearing an N-terminal hexahistidine tag was expressed in {sp} {strain} after induction at {temp} °C for {h} h.",
        "Cleared lysate was loaded onto a {ml} ml affinity column and eluted with a linear imidazole gradient.",
        "Peak fractions were pooled, concentrated by ultrafiltration and polished by size-exclusion chromatography in {buffer}.",
        "Final purity exceeded {pct}% by densitometry, and identity was confirmed by peptide mass fingerprinting {cit}.",
        "Protein was snap-frozen in single-use aliquots; repeated freeze–thaw cycles reduced specific activity by roughly {pct2}%.",
        "The tag was removed by protease cleavage where the assay required an untagged preparation.",
        "Expression trials compared three induction temperatures, of which {temp} °C gave the highest soluble yield.",
      ],
    },
    activity: {
      titles: ["Enzyme activity assays", "Kinetic characterisation", "Activity measurements"],
      sents: [
        "Activity was followed spectrophotometrically at {nm} nm in {ul} µl reactions containing {conc} mM substrate.",
        "One unit was defined as the amount of enzyme converting one micromole of substrate per minute at {temp} °C.",
        "Kinetic constants were estimated by fitting initial velocities to the Michaelis–Menten model in {soft}.",
        "Progress curves remained linear over the first {min} min, after which reactions were stopped with excess chelator.",
        "Assays on the {term} fraction were repeated on three separate preparations to exclude batch effects.",
        "Blank rates measured without enzyme were subtracted from every reading.",
        "The pH optimum was determined across the range 5.5 to 8.5 in overlapping buffer systems.",
      ],
    },
    micro: {
      titles: ["Microscopy and image analysis", "Confocal imaging", "Imaging and quantification"],
      sents: [
        "Sections were imaged on a {inst} with a {n}0× oil-immersion objective at an excitation wavelength of {nm} nm.",
        "Stacks were deconvolved and segmented in {soft} with identical thresholds applied across all treatments.",
        "At least {n3} fields per slide were scored by an operator who was blind to the treatment code.",
        "Fluorescence intensity is reported after subtraction of the mean background of an adjacent unlabelled region.",
        "Samples were fixed for {min} min, dehydrated through a graded ethanol series and embedded before sectioning at {n} µm.",
        "Colocalisation was quantified over {n3} regions of interest per genotype and expressed as a correlation coefficient.",
        "Representative fields are shown; quantification pools all replicates rather than the illustrated field alone.",
      ],
    },
    plant: {
      titles: ["Plant material and growth conditions", "Greenhouse trials and phenotyping", "Controlled-environment experiments"],
      sents: [
        "Plants were grown at {temp}/{temp3} °C (day/night) under a {h} h photoperiod and a relative humidity of {pct}%.",
        "Water was withheld from day {day} until volumetric soil water content fell below {pct2}% of field capacity.",
        "Each treatment comprised {n3} plants in a randomised block design with {n} blocks per chamber.",
        "{Trait} was recorded after drying at 65 °C to constant mass, and {term} was scored on the youngest fully expanded leaf.",
        "Positions within the chamber were re-randomised twice per week to reduce edge effects {cit}.",
        "Seed was surface-sterilised, stratified for {n} d at 4 °C and sown into a peat–perlite mixture.",
        "Nutrient solution was supplied {lat} through sub-irrigation and renewed every {n} d.",
        "Trials were repeated in two consecutive seasons with the same block structure.",
      ],
    },
    seqmotif: {
      titles: ["Sequence retrieval and motif detection", "Comparative sequence analysis", "Domain and motif assignment"],
      sents: [
        "Homologues were retrieved by iterative similarity search against a curated protein set with an expectation threshold of {ev}.",
        "Conserved motifs were derived with {soft} from the aligned set; at each position the residues shown are those present in the queried sequences at a frequency above 0.2, and residues in square brackets denote permitted alternatives.",
        "Domain assignments were taken from {db} under accession {acc}.",
        "Columns containing more than {pct2}% gaps were trimmed from the alignment before any downstream inference.",
        "Overall identity was computed with a global alignment algorithm using default gap penalties and mature protein sequences, that is, with signal peptides and transit peptides removed.",
        "A polypeptide is assigned to this class when it carries at least one of the motifs listed above together with the domain complement given in {tab}.",
        "Sequences shorter than {bp} residues were excluded because partial models inflate the apparent divergence of the family.",
        "The reference entry used throughout is {acc}, which is the best-characterised member of the group {cit}.",
      ],
    },
    phylo: {
      titles: ["Phylogenetic reconstruction", "Tree inference", "Evolutionary analysis"],
      sents: [
        "Maximum-likelihood trees were inferred under the {model} substitution model with {n3}0 bootstrap replicates.",
        "Nodes recovered in fewer than {pct}% of replicates were collapsed to polytomies before interpretation.",
        "The tree was rooted with two divergent sequences retrieved from the same search and is drawn to scale in {soft}.",
        "Model selection followed the corrected information criterion computed over the trimmed alignment.",
        "Branch lengths are given as expected substitutions per site and are reported to two decimal places in {tab}.",
        "An independent Bayesian run converged on the same topology for all deep nodes {cit}.",
      ],
    },
    stats: {
      titles: ["Statistical analysis", "Data handling and statistics", "Experimental design and statistics"],
      sents: [
        "All analyses were performed in {soft}; residuals were inspected for normality and homogeneity of variance before parametric testing.",
        "Treatment effects were assessed by two-way analysis of variance with genotype and regime as fixed factors ({stat}).",
        "Pairwise contrasts were corrected by a false-discovery-rate procedure and considered significant at {alpha}.",
        "Effect sizes are reported as standardised mean differences with the associated 95% confidence interval.",
        "Counts were analysed under a generalised linear model with a quasi-Poisson error structure to accommodate overdispersion.",
        "Replicates lost to contamination were treated as missing at random rather than imputed {cit}.",
        "Block was retained as a random term in every model even where its variance component approached zero.",
        "Where the interaction was not resolved, main effects are reported from the reduced model ({stat}).",
      ],
    },
    results: {
      titles: ["Transcript responses to the imposed regime", "Loss of function alters colonisation",
        "Domain architecture across the family", "Phenotypes of complemented lines", "Performance across two seasons",
        "Activity of the purified enzyme"],
      sents: [
        "Transcript abundance of {gene} rose {fold}-fold in {strain} relative to the parental background {h} h after transfer ({stat}).",
        "Deletion of {gene} lowered {trait} by {pct2}% ({stat}), and the defect was reversed in complemented lines.",
        "No difference was resolved between the empty-vector control and the parental strain for any trait scored ({stat}).",
        "The {prot} signal co-segregated with the {term} phenotype in {n} of {n3} independent transformants.",
        "Across both seasons {trait} differed among genotypes ({stat}), whereas the genotype × season interaction was not resolved ({stat}).",
        "The response was dose-dependent up to {conc} mM, beyond which {trait} declined sharply.",
        "Values quoted below are means of {n} biological replicates with the standard error of the mean in parentheses.",
        "Purified {prot} showed a specific activity of {conc} units per milligram, some {fold}-fold above the crude extract.",
        "{Trait} recovered to control levels within {h} h of rewatering in every line except the double mutant ({stat}).",
        "The ranking of genotypes was unchanged when the analysis was restricted to the {term} subset ({stat}).",
      ],
    },
  };
  const TOPIC_KEYS = Object.keys(TOPICS).filter((k) => k !== "results");

  const CONNECTORS = [
    "Unless stated otherwise, all reagents were of analytical grade and solutions were prepared in ultrapure water.",
    "The procedure follows the outline given above with the modifications set out in this section.",
    "Two independent operators repeated the complete workflow to confirm that the effect was reproducible.",
    "Raw measurements and the analysis scripts have been deposited in a public repository under the identifier given below.",
    "Deviations from this protocol are noted where they apply to a single experiment only.",
  ];

  // combinatorial filler: recombining clause fragments give effectively unlimited
  // non-repeating methods prose once the curated banks are spent (two-column modes
  // hold far more text than any hand-written bank).
  const FRAG = {
    subj: ["Aliquots of the crude extract", "Pooled fractions", "Replicate samples", "The washed pellets",
      "Supernatants from the first spin", "Frozen leaf discs", "Culture filtrates", "The resuspended cells",
      "Dialysed preparations", "Sub-samples of the homogenate"],
    act: ["were incubated", "were equilibrated", "were pre-treated", "were held", "were agitated gently",
      "were dialysed", "were pre-warmed", "were kept"],
    cond: ["in {buffer}", "in {med} broth", "under continuous illumination", "in darkness",
      "with {conc} mM chelator added", "against two changes of {buffer}", "under a stream of nitrogen"],
    dur: ["for {min} min at {temp} °C", "overnight at 4 °C", "for {h} h at {temp} °C", "for {min} min on ice",
      "for {min} min with shaking at {rpm} rpm"],
    tail: ["before the assay was started", "prior to loading", "and were then processed without delay",
      "after which the reaction was quenched", "before {trait} was recorded",
      "and stored at −20 °C until analysis", "and the {term} control was treated identically"],
    obs: ["The effect was reproduced in an independent block ({stat}).",
      "Readings were corrected against the matched blank of the same plate.",
      "Values that fell outside three standard deviations of the treatment mean were flagged but retained.",
      "The same operator performed all handling steps within a given block.",
      "Comparable results were obtained when the assay was run {lat} {cit}.",
      "Instrument calibration was checked against the internal standard before every session.",
      "Details of the settings used are given in {tab}."],
  };
  const procSeen = new Set();
  const procSentence = () => {
    for (let i = 0; i < 8; i++) {
      const s = chance(0.72)
        ? `${pick(FRAG.subj)} ${pick(FRAG.act)} ${pick(FRAG.cond)} ${pick(FRAG.dur)} ${pick(FRAG.tail)}.`
        : pick(FRAG.obs);
      if (!procSeen.has(s)) { procSeen.add(s); return fill(s); }
    }
    return fill(pick(FRAG.obs));
  };
  const FILLER_TITLES = ["Additional controls", "Method validation", "Data curation and availability",
    "Sampling schedule", "Quality control", "Calibration and standards", "Handling of replicates",
    "Ancillary measurements"];

  // per-document sentence pools: a curated sentence is never used twice on one page
  const pools = {};
  for (const k of Object.keys(TOPICS)) pools[k] = shuf(TOPICS[k].sents);
  const takeSent = (k) => (pools[k] && pools[k].length ? fill(pools[k].shift()) : procSentence());
  const connPool = shuf(CONNECTORS);

  // ================= geometry / capacity model =================
  const PW = 210, PH = 296;
  const textW = PW - 2 * marginX;
  const colW = cols === 2 ? (textW - gutter) / 2 : textW;
  const lineMm = basePt * lh * 0.35278;
  const headMm = 5.4;
  const footMm = 4.6;

  const plain = (md) => md.replace(/\*\*/g, "").replace(/\*/g, "").replace(/~~/g, "").replace(/<\/?u>/g, "");
  const emw = (s) => {
    let w = 0;
    for (const ch of s) {
      if (ch >= "a" && ch <= "z") w += FW.lc;
      else if (ch >= "A" && ch <= "Z") w += FW.uc;
      else if (ch >= "0" && ch <= "9") w += FW.dg;
      else if (ch === " ") w += FW.sp;
      else w += FW.pu;
    }
    return w;
  };
  const EFF = justify ? 0.972 : 0.944; // fraction of the measure a finished line actually uses
  const mmToEm = (mm) => mm / 0.35278 / basePt;
  const lineEm = mmToEm(colW) * EFF;
  const indentEm = indentStyle ? mmToEm(indentMm) : 0;
  const hangEm = mmToEm(indentMm + 2.4);
  const nlines = (t, capEm = lineEm, lead = 0) => Math.max(1, Math.ceil((emw(plain(t)) + lead) / capEm));

  // ---- footnotes (built first: they consume page height) ----
  const markers = pick([["†", "‡", "§", "¶"], ["a", "b", "c", "d"], ["1", "2", "3", "4"]]);
  const nFoot = chance(0.18) ? 0 : ri(1, 3);
  const footnotes = [];
  {
    const bank = [
      () => `Abbreviations: ${pick(["CFU", "SEM", "FDR", "OD"])}, ${pick(["colony-forming units", "standard error of the mean", "false discovery rate", "optical density"])}; ${pick(["WT", "EV", "RH"])}, ${pick(["wild type", "empty vector", "relative humidity"])}.`,
      () => `Sequence data described here have been deposited under accessions ${accession()}–${accession()}.`,
      () => `Present address: Department of ${pick(DEPTS)}, ${pick(CITIES)} Institute of Life Sciences, ${pick(CITIES)}.`,
      () => `Supplementary material associated with this article is available in the online version of the paper.`,
      () => `Corrected after first publication: the value quoted in Section ${ri(2, 3)}.${ri(1, 5)} should read ${dec(0.2, 0.9, 2)} and not ~~${dec(0.2, 0.9, 2)}~~.`,
      () => `These authors contributed equally to the work and are listed in alphabetical order.`,
      () => `Funded under grant ${pick(["RG", "BX", "NF"])}-${ri(1000, 9999)}; the funders had no role in study design or in the decision to publish.`,
    ];
    shuf(bank).slice(0, nFoot).forEach((f, i) => footnotes.push(`${markers[i]} ${f()}`));
  }
  const fnPt = Number((basePt * rf(0.82, 0.92)).toFixed(2));
  const fnLineEm = (textW / 0.35278 / fnPt) * EFF;
  const fnLineMm = fnPt * lh * 0.35278;
  const fnMm = footnotes.length
    ? footnotes.reduce((s, f) => s + nlines(f, fnLineEm), 0) * fnLineMm + 2.6
    : 0;

  const flowMm = PH - marginTop - headMm - marginBot - footMm - fnMm;
  const capLines = (flowMm / lineMm) * cols;
  // budget is expressed in modelled lines; the model runs ~8-13% pessimistic against
  // Chrome's real line breaking (and two-column pages lose a little more to
  // break-inside:avoid blocks), so the target sits slightly above 1.0.
  const fillTarget = cols === 1 ? rf(0.995, 1.035) : rf(0.945, 0.99);
  let used = 0;
  const budget = capLines * fillTarget;
  const room = () => budget - used;

  const cost = {
    h2: (t) => nlines(t, lineEm / 1.09) + 1.05,
    h3: (t) => nlines(t) + 0.62,
    p: (t) => nlines(t, lineEm, indentEm) + paraGapMm / lineMm,
    li: (t) => nlines(t, lineEm - hangEm),
    cap: (t) => nlines(t, lineEm / 0.9),
  };

  // ---- running header ----
  const headStyle = ri(0, 2);
  let headLeft, headRight;
  if (headStyle === 0) {
    headLeft = `${leadAuthor} et al. / ${journalAbbr} ${vol} (${year}) ${p1}–${p2}`;
    headRight = String(pageNo);
  } else if (headStyle === 1) {
    headLeft = `${journalName}, Vol. ${vol}, No. ${issue} (${year})`;
    headRight = `${pageNo}/${p2 + ri(40, 320)}`;
  } else {
    headLeft = String(pageNo);
    headRight = `${journalAbbr} ${vol} (${year}) ${p1}–${p2}`;
  }
  const headerGT = `${headLeft}    ${headRight}`;

  // ================= content assembly =================
  const blocks = [];
  let maj = ri(2, 3);
  let min = ri(1, 4);
  const dot = chance(0.6) ? "." : "";
  const withResults = chance(0.45);
  let resultsOpened = false;
  const usedTitles = new Set();

  const para = (key, want) => {
    const out = [];
    for (let i = 0; i < want; i++) {
      const s = takeSent(key);
      if (!s) break;
      out.push(s);
    }
    if (out.length && chance(0.12) && connPool.length) out.push(connPool.shift());
    return out.join(" ");
  };

  const dashList = () => {
    const n = ri(3, 5);
    const kind = chance(0.5) ? "dom" : "coord";
    const items = [];
    for (let i = 0; i < n; i++) {
      const end = i === n - 1 ? "." : ";";
      items.push(kind === "dom"
        ? fill(`a domain as defined against {db} and carrying accession ${accession()}${end}`)
        : fill(`residues ${ri(20, 180)} to ${ri(200, 470)} of the reference sequence (motif ${ri(6, 18)} – entry ${accession()})${end}`));
    }
    return items;
  };

  const ladderSentence = () => {
    const start = ri(40, 72);
    const runs = [];
    const lStep = pick([1, 1, 2, 3, 5]);
    const lFmt = lStep === 1
      ? pick([(v) => `${v} %`, (v) => `${v} per cent`])
      : pick([(v) => `${v}%`, (v) => `${v} %`, (v) => `${v} per cent`]);
    for (let v = start; v <= 99; v += lStep) runs.push(lFmt(v));
    return `In order of increasing preference, a qualifying polypeptide shares at least ${runs.join(", ")} overall identity with the reference sequence, provided that it also carries one or more of the conserved motifs outlined above.`;
  };

  const boxBlock = () => {
    const title = `Box ${ri(1, 3)}. ${pick(["Standard extraction protocol", "Scoring scheme for lesion development", "Quality thresholds applied to every run", "Workflow for the complementation screen"])}`;
    const stepBank = shuf([
      "Homogenise {mg} mg of frozen tissue under liquid nitrogen and transfer to pre-chilled {buffer}.",
      "Incubate for {min} min at {temp} °C with gentle inversion every {n} min.",
      "Centrifuge at {g} × g for {min} min at 4 °C and retain the supernatant.",
      "Score each replicate on a five-point scale, where 0 denotes no visible symptom and 4 denotes full collapse.",
      "Discard any run in which the reference transcript shifts by more than one cycle from the plate median.",
      "Record the reading only after the signal has been stable for {min} min.",
      "Normalise every plate to the internal calibrator supplied with the kit.",
    ]);
    return { t: "box", title, items: stepBank.slice(0, ri(3, 5)).map(fill) };
  };

  const figBlock = (i) => ({
    t: "fig",
    hMm: Number(rf(20, 34).toFixed(1)),
    cap: `**Fig. ${i}.** ` + fill(pick([
      "{trait} of the parental background (open bars) and of two independent deletion lines (filled bars) {h} h after transfer. Bars are means of {n} replicates; whiskers give the standard error.",
      "Immunodetection of {prot} in total extracts. The arrowhead marks the {kda} kDa product; the lower panel shows the loading control.",
      "Alignment of the conserved region across the family. Residues shaded in grey occur in more than {pct}% of the sequences examined.",
      "Relationship between {term} and {trait} across all treatments. The dashed line gives the fitted response ({stat}).",
    ])),
  });

  function balanced(s) {
    const b = (s.match(/\*\*/g) || []).length;
    const rest = (s.replace(/\*\*/g, "").match(/\*/g) || []).length;
    const t = (s.match(/~~/g) || []).length;
    const uo = (s.match(/<u>/g) || []).length, uc = (s.match(/<\/u>/g) || []).length;
    return b % 2 === 0 && rest % 2 === 0 && t % 2 === 0 && uo === uc;
  }
  function truncMd(md, maxEm) {
    const words = md.split(" ");
    const out = [];
    let len = indentEm;
    for (const w of words) {
      const add = emw(plain(w)) + FW.sp;
      if (len + add > maxEm) break;
      out.push(w); len += add;
    }
    while (out.length && !balanced(out.join(" "))) out.pop();
    if (!out.length) return "";
    const last = out[out.length - 1];
    if (/^[A-Za-z]{6,}$/.test(last)) out[out.length - 1] = last.slice(0, Math.max(3, Math.floor(last.length / 2))) + "-";
    return out.join(" ");
  }

  // opening: mid-sentence continuation from the previous page
  const continues = chance(0.62);
  if (continues) {
    const tail = pick(["taining", "quently", "sponding", "cubation", "ditions", "termined", "plicates", "gether"]);
    const body = para(pick(TOPIC_KEYS), ri(2, 3)).replace(/^[A-Z]/, (c) => c.toLowerCase());
    const opener = `${tail} ${body}`;
    blocks.push({ t: "p", md: opener });
    used += cost.p(opener);
  }

  let figUsed = 0, boxUsed = false, cut = false, guard = 0, li = 0;
  const usedTopics = new Set();
  const topicQueue = shuf(TOPIC_KEYS);

  while (room() > 3 && guard++ < 40) {
    if (withResults && !resultsOpened && guard > 2 && chance(0.34)) {
      const h = `${maj + 1}${dot} Results`;
      if (room() < cost.h2(h) + 4) break;
      blocks.push({ t: "h2", md: h });
      used += cost.h2(h);
      maj += 1; min = 1;
      resultsOpened = true;
    }
    const key = resultsOpened && pools.results.length && chance(0.78)
      ? "results"
      : (topicQueue.find((k) => !usedTopics.has(k) && pools[k].length) || "filler");
    usedTopics.add(key);
    const titleBank = key === "filler" ? FILLER_TITLES : TOPICS[key].titles;
    const tPool = titleBank.filter((t) => !usedTitles.has(t));
    const title = tPool.length ? pick(tPool) : pick(titleBank);
    usedTitles.add(title);
    const num = `${maj}.${min}${dot}`;
    min += 1;

    const nPar = cols === 1 ? ri(2, 3) : ri(1, 3);
    for (let pi = 0; pi < nPar; pi++) {
      let md = para(key, ri(2, 4));
      if (!md) break;
      if (pi === 0) {
        if (runIn) md = `**${num} ${title}.** ${md}`;
        else {
          const h = `${num} ${title}`;
          if (room() < cost.h3(h) + 2) { cut = true; break; }
          blocks.push({ t: "h3", md: h });
          used += cost.h3(h);
        }
      }
      if (key === "seqmotif" && pi === 0 && chance(0.45)) md += " " + ladderSentence();
      const c = cost.p(md);
      if (c > room()) {
        const keep = Math.max(1, Math.floor(room() - paraGapMm / lineMm)) * lineEm;
        const trunc = truncMd(md, keep);
        if (plain(trunc).length > 24) { blocks.push({ t: "p", md: trunc }); used += cost.p(trunc); }
        cut = true;
        break;
      }
      blocks.push({ t: "p", md });
      used += c;

      // interleaved furniture
      if (pi === 0 && (key === "seqmotif" || key === "cloning") && li < 2 && chance(0.5)) {
        const items = dashList();
        const c2 = items.reduce((s, it) => s + cost.li(it), 0) + 0.3;
        if (c2 < room() - 2) { blocks.push({ t: "ul", items }); used += c2; li++; }
      }
      if (hasBox && !boxUsed && chance(0.5)) {
        const b = boxBlock();
        const c3 = b.items.reduce((s, it) => s + cost.li(it), 0) + cost.li(b.title) + 2.0;
        if (c3 < room() - 2) { blocks.push(b); used += c3; boxUsed = true; }
      }
      if (figUsed < figCount && chance(0.55)) {
        const f = figBlock(figUsed + 1);
        const c4 = f.hMm / lineMm + cost.cap(f.cap) + 1.2;
        if (c4 < room() - 3) { blocks.push(f); used += c4; figUsed += 1; }
      }
    }
    if (cut) break;
  }
  if (hasBox && !boxUsed && room() > 8) {
    const b = boxBlock();
    blocks.push(b);
    used += b.items.reduce((s, it) => s + cost.li(it), 0) + cost.li(b.title) + 2.0;
  }

  // ================= markdown -> html =================
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const mdh = (s) => esc(s)
    .replace(/&lt;u&gt;/g, "<u>").replace(/&lt;\/u&gt;/g, "</u>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>");

  const bodyHtml = blocks.map((b) => {
    if (b.t === "h2") return `<h2>${mdh(b.md)}</h2>`;
    if (b.t === "h3") return `<h3>${mdh(b.md)}</h3>`;
    if (b.t === "p") return `<p>${mdh(b.md)}</p>`;
    if (b.t === "ul") return `<div class="lst">${b.items.map((i) => `<div class="li"><span class="dsh">–</span>${mdh(i)}</div>`).join("")}</div>`;
    if (b.t === "box") return `<div class="box"><div class="bt">${mdh(b.title)}</div>${b.items.map((s, i) => `<div class="li"><span class="dsh">${i + 1}.</span>${mdh(s)}</div>`).join("")}</div>`;
    if (b.t === "fig") return `<div class="figw"><div class="ph" style="height:${b.hMm}mm"></div><div class="cap">${mdh(b.cap)}</div></div>`;
    return "";
  }).join("\n");

  const fnHtml = footnotes.length
    ? `<div class="fn"><div class="fnrule"></div>${footnotes.map((f) => `<div class="fni">${mdh(f)}</div>`).join("")}</div>`
    : "";

  const footerStyle = ri(0, 2);
  const footerText = footerStyle === 2 ? `– ${pageNo} –` : String(pageNo);
  const footerAlign = footerStyle === 1 ? (pageNo % 2 === 0 ? "left" : "right") : "center";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>
  @page { size: 210mm 296mm; margin: 0 }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0 }
  body { width: 210mm; height: 296mm; font-family: ${fontFam}; font-size: ${basePt}pt;
         line-height: ${lh}; color: #000; }
  .page { position: relative; width: 210mm; height: 296mm; padding: ${marginTop}mm ${marginX}mm ${marginBot}mm; }
  .rh { display: flex; justify-content: space-between; font-size: ${(basePt * 0.84).toFixed(2)}pt;
        ${headStyle === 1 ? "font-style: italic;" : ""} padding-bottom: 1.1mm;
        border-bottom: ${headRule ? "0.4pt solid #000" : "0"}; letter-spacing: 0.01em; }
  .flow { height: ${flowMm.toFixed(2)}mm; overflow: hidden; margin-top: 1.6mm;
          ${cols === 2 ? `column-count: 2; column-gap: ${gutter}mm; column-fill: auto;` : ""}
          ${colRule ? "column-rule: 0.4pt solid #999;" : ""} }
  p { margin: 0 0 ${paraGapMm}mm; text-align: ${justify ? "justify" : "left"};
      text-indent: ${indentStyle ? indentMm : 0}mm; hyphens: auto; -webkit-hyphens: auto; }
  h2 { font-size: ${(basePt * 1.09).toFixed(2)}pt; font-weight: bold;
       margin: ${(lineMm * 0.6).toFixed(2)}mm 0 ${(lineMm * 0.25).toFixed(2)}mm;
       ${smallCapsHead ? "font-variant: small-caps; letter-spacing: 0.03em;" : ""} }
  h3 { font-size: ${basePt}pt; font-weight: bold;
       margin: ${(lineMm * 0.45).toFixed(2)}mm 0 ${(lineMm * 0.1).toFixed(2)}mm; }
  .lst { margin: ${(lineMm * 0.12).toFixed(2)}mm 0; }
  .li { padding-left: ${(indentMm + 2.4).toFixed(2)}mm; text-indent: -${(indentMm + 2.4).toFixed(2)}mm;
        text-align: ${justify ? "justify" : "left"}; hyphens: auto; -webkit-hyphens: auto; }
  .dsh { display: inline-block; min-width: ${(indentMm + 2.4).toFixed(2)}mm; text-indent: 0; }
  .box { border: 0.5pt solid #000; background: ${boxShaded ? "#f1f1f1" : "#fff"}; padding: 1.2mm 2mm;
         margin: ${(lineMm * 0.45).toFixed(2)}mm 0; break-inside: avoid; }
  .bt { font-weight: bold; margin-bottom: 0.5mm; }
  .figw { break-inside: avoid; margin: ${(lineMm * 0.6).toFixed(2)}mm 0; }
  .ph { background: repeating-linear-gradient(${phVert ? "90deg" : "0deg"}, #d4d4d4 0 1.6mm, #bfbfbf 1.6mm 3.2mm);
        border: 0.4pt solid #8a8a8a; }
  .cap { font-size: ${(basePt * 0.9).toFixed(2)}pt; margin-top: 0.6mm; text-align: ${justify ? "justify" : "left"}; }
  .fn { position: absolute; left: ${marginX}mm; right: ${marginX}mm; bottom: ${(marginBot + footMm).toFixed(2)}mm;
        font-size: ${fnPt}pt; }
  .fnrule { border-top: 0.4pt solid #000; width: ${fnRuleMm}mm; margin-bottom: 0.9mm; }
  .fni { text-indent: -1.6mm; padding-left: 1.6mm; text-align: ${justify ? "justify" : "left"}; }
  .pf { position: absolute; left: ${marginX}mm; right: ${marginX}mm; bottom: ${(marginBot - 3).toFixed(2)}mm;
        text-align: ${footerAlign}; font-size: ${(basePt * 0.86).toFixed(2)}pt; }
  </style></head><body><div class="page">
  <div class="rh"><span>${esc(headLeft)}</span><span>${esc(headRight)}</span></div>
  <div class="flow">${bodyHtml}</div>
  ${fnHtml}
  <div class="pf">${esc(footerText)}</div>
  </div></body></html>`;

  // ================= ground truth =================
  const gtParts = [headerGT];
  for (const b of blocks) {
    if (b.t === "h2") gtParts.push(`## ${b.md}`);
    else if (b.t === "h3") gtParts.push(`### ${b.md}`);
    else if (b.t === "p") gtParts.push(b.md);
    else if (b.t === "ul") gtParts.push(b.items.map((i) => `- ${i}`).join("\n"));
    else if (b.t === "box") gtParts.push(`**${b.title}**\n\n` + b.items.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    else if (b.t === "fig") gtParts.push(b.cap);
  }
  for (const f of footnotes) gtParts.push(f);
  gtParts.push(footerText);
  const gt = gtParts.filter((s) => s && s.trim()).join("\n\n");

  const dbg = { mode, cols, font: fontFam.split(",")[0], basePt, lh, cpl: +lineEm.toFixed(1), capLines: +capLines.toFixed(1), used: +used.toFixed(1), fillTarget: +fillTarget.toFixed(3), justify, indentStyle };
  return { html, gt, pageOpts: { width: "210mm", height: "296mm" }, dbg };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
