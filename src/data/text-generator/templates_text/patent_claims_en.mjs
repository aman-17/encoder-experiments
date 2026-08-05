// FAMILY GENERATOR — dense English patent page (DRIFT sibling of the German
// biotech patent-publication page 0.000_text_dense__de.pdf).
//
// Genre: a single interior page of a patent publication / prosecution document —
// wall-to-wall justified body type at 8-10pt, bold paragraph tokens [00NN], hanging
// -indent dash clauses, numbered claims with (a)/(b) sub-items, "characterized in
// that" boilerplate, dependent-claim cross references, running header with the
// publication number + date, page-of-total footer, page ending mid-hyphenated-word.
//
// Failure mode being trained: FORMAT/emphasis fidelity inside a solid text wall —
// bold paragraph numbers, italic Latin terms / journal citations, underlined defined
// terms, and (in the amendment mode) underlined insertions + struck-through deletions.
//
// DRIFT: 4 discrete layout modes (desc / claims / twocol / amend) x 5 invented
// technical domains (mechanical, software, biotech, materials, power electronics),
// plus continuous jitter on font family & size, line height, margins, paragraph
// style (block vs first-line-indent), emphasis density, sub-item lettering, header /
// footer furniture, figure + box presence, paragraph-number range and claim count.
// All subject matter, companies, journals and inventors are FICTIONAL; no sentence
// from the anchor page is reused.
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
  const rawLen = (s) => s.replace(/\u0001[BIUS]/g, "").replace(/\u0002/g, "").length;
  const OPEN = { B: ["**", "<b>"], I: ["*", "<i>"], U: ["<u>", "<u>"], S: ["~~", "<s>"] };
  const CLOSE = { B: ["**", "</b>"], I: ["*", "</i>"], U: ["</u>", "</u>"], S: ["~~", "</s>"] };
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

  // ---------------- invented technical domains ----------------
  const DOMAINS = [{
    key: "mech",
    subjects: ["vibration-damping bearing carrier", "planetary reduction assembly", "self-aligning conveyor idler",
      "magnetorheological damper cartridge", "modular hydraulic manifold block", "turbine blade root retention arrangement"],
    field: ["mechanical power transmission", "vibration isolation in rotating machinery", "fluid power distribution"],
    parts: ["housing", "rotor hub", "retaining collar", "thrust washer", "outer bearing race", "annular flange",
      "splined input shaft", "sealing lip", "preload spring", "coupling sleeve", "damping element", "mounting bracket",
      "lubricant gallery", "clamping ring", "guide rail"],
    plurals: ["bearing carriers", "damper cartridges", "idler assemblies"],
    mats: ["17-4 PH precipitation-hardened stainless steel", "nitrided 42CrMo4 alloy steel", "glass-filled polyamide 6.6",
      "sintered bronze impregnated with a solid lubricant", "anodised 6061-T6 aluminium", "a carbon-fibre reinforced epoxy laminate"],
    props: [{ n: "radial clearance", u: "mm", lo: 0.02, hi: 0.9, d: 2 }, { n: "axial preload force", u: "N", lo: 40, hi: 900, d: 0 },
      { n: "surface roughness Ra", u: "micrometres", lo: 0.2, hi: 3.2, d: 1 }, { n: "torsional stiffness", u: "kNm per radian", lo: 3, hi: 90, d: 1 },
      { n: "case hardness", u: "HRC", lo: 45, hi: 62, d: 0 }],
    clauses: ["axial play is substantially eliminated over the whole of the specified thermal cycling range",
      "the transmitted vibration amplitude at the first bending mode is materially attenuated",
      "misalignment of up to half a degree can be accommodated without edge loading of the raceway",
      "the running torque remains substantially constant as the lubricant viscosity falls",
      "fretting corrosion at the interface is suppressed during prolonged idling",
      "the assembly can be serviced without removal of the driven machine from its foundation"],
    arrangements: ["arranged coaxially with", "positioned radially outwardly of", "seated against a shoulder formed on",
      "clamped axially between the flange and", "journalled for rotation within"],
    features: ["a substantially cylindrical bore", "a radially extending flange", "a plurality of circumferentially spaced webs",
      "an annular groove of part-circular section", "at least three angularly distributed relief passages", "a frusto-conical seating face"],
    verbs: ["transmit torque between the input flange and the driven hub", "accommodate thermal growth of the shaft in the axial direction",
      "limit axial displacement of the rotor under shock loading", "meter lubricant to the loaded zone of the raceway",
      "damp torsional oscillation arising from cyclic combustion events"],
    steps: ["locating the retaining collar against the shoulder", "applying a controlled axial preload by tightening the clamping ring",
      "measuring the residual run-out at the pilot diameter", "curing the bonded joint at elevated temperature"],
    avoid: ["a separate shimming operation at final assembly", "the use of a dedicated alignment fixture", "any secondary machining of the housing bore"],
    gerunds: ["assembling a bearing carrier", "damping torsional oscillation in a drive train", "retaining a blade root in a rotor disc"],
    journals: ["Journal of Tribology and Machine Elements", "Transactions on Rotating Machinery", "Proceedings of the Institute of Mechanical Design"],
    terms: [["interference fit", "an assembled condition in which the nominal diameter of the male member exceeds that of the female member before assembly"],
      ["run-out", "the total indicated reading obtained when a dial gauge is traversed over one complete revolution of the component"],
      ["preload", "the axial force applied to the bearing set before any external working load is imposed"]],
    conds: ["a shaft speed of 3 600 rev/min", "a sustained sump temperature of 105 degrees Celsius", "the accelerated dust ingress schedule of Example 2"],
  }, {
    key: "soft",
    subjects: ["distributed cache coherence controller", "adaptive telemetry sampling system", "low-latency packet classification engine",
      "federated model-update scheduler", "content-addressable index shard manager", "multi-tenant admission control gateway"],
    field: ["distributed data processing", "network traffic classification", "machine-learning infrastructure"],
    parts: ["ingestion module", "shard coordinator", "coherence directory", "ring buffer", "hash bucket array", "tenant queue",
      "checkpoint store", "arbitration unit", "telemetry agent", "compaction worker", "lease manager", "routing table",
      "admission controller", "replay log", "bloom filter stage"],
    plurals: ["coherence controllers", "sampling systems", "classification engines"],
    mats: ["a commodity x86 server class", "a field-programmable gate array fabric", "an ARM-based edge appliance",
      "a container runtime scheduled by a cluster orchestrator", "a non-volatile byte-addressable memory tier"],
    props: [{ n: "tail latency at the ninety-ninth percentile", u: "milliseconds", lo: 0.4, hi: 180, d: 1 },
      { n: "sustained throughput", u: "requests per second", lo: 1200, hi: 96000, d: 0 },
      { n: "cache hit ratio", u: "per cent", lo: 62, hi: 99, d: 0 },
      { n: "checkpoint interval", u: "seconds", lo: 2, hi: 240, d: 0 },
      { n: "directory occupancy", u: "per cent", lo: 12, hi: 88, d: 0 }],
    clauses: ["the number of cross-node invalidation messages falls by roughly an order of magnitude under skewed key access",
      "stale reads are bounded by the configured lease interval even when a coordinator fails",
      "the working set of a noisy tenant no longer evicts entries belonging to unrelated tenants",
      "recovery after an ungraceful restart completes without replaying the entire write-ahead log",
      "the sampling rate adapts to the observed variance rather than to a fixed wall-clock schedule",
      "back-pressure propagates to the producer before the ingestion buffer is exhausted"],
    arrangements: ["co-located with", "instantiated on each node participating in", "logically interposed between the client library and",
      "sharded by consistent hashing across", "replicated in a quorum together with"],
    features: ["a monotonically increasing epoch counter", "a fixed-capacity circular buffer", "a per-tenant token bucket",
      "a two-level lookup structure", "an append-only segment file", "a probabilistic membership summary"],
    verbs: ["invalidate stale directory entries without a global barrier", "admit requests only while the queue depth remains below a configured watermark",
      "emit a compact digest of the observed key distribution", "merge partial model updates received from participating nodes",
      "defer compaction until the segment count exceeds a threshold"],
    steps: ["computing a digest over the candidate segment set", "acquiring a lease from the coordinator for a bounded interval",
      "durably recording the epoch counter before acknowledging the write", "reconciling the local directory against the authoritative replica"],
    avoid: ["a global barrier across all participating nodes", "any change to the client library", "a separate coordination service"],
    gerunds: ["maintaining coherence across a plurality of cache nodes", "scheduling model updates in a federated learning system",
      "classifying packets at line rate"],
    journals: ["Transactions on Distributed Systems Engineering", "Journal of Storage and Retrieval Architecture", "Review of Applied Network Computing"],
    terms: [["epoch", "a monotonically increasing integer that is advanced whenever the membership of the replica set changes"],
      ["lease", "a time-bounded grant of authority to serve reads for a specified key range without further coordination"],
      ["tail latency", "the response time observed at or above the ninety-ninth percentile of the measured distribution"]],
    conds: ["a uniform key distribution over sixteen million keys", "a read-to-write ratio of nine to one", "the synthetic burst workload of Example 4"],
  }, {
    key: "bio",
    subjects: ["thermostable ligase variant", "engineered promoter cassette for oilseed crops", "drought-tolerance regulatory polypeptide",
      "monoclonal antibody drug conjugate", "recombinant host cell for terpenoid production"],
    field: ["molecular biology and plant biotechnology", "recombinant protein expression", "targeted therapeutic conjugates"],
    parts: ["expression cassette", "signal peptide", "flexible linker region", "catalytic domain", "terminator sequence",
      "selectable marker gene", "host cell", "fermentation broth", "regulatory element", "codon-optimised coding sequence",
      "purification tag", "chaperone co-expression construct"],
    plurals: ["ligase variants", "promoter cassettes", "conjugates"],
    mats: ["a defined mineral medium supplemented with glycerol", "a chemically defined feed containing no animal-derived component",
      "an agrobacterium-mediated transformation vector", "a stably transfected mammalian cell line"],
    props: [{ n: "specific activity", u: "units per milligram", lo: 12, hi: 640, d: 0 },
      { n: "melting temperature", u: "degrees Celsius", lo: 52, hi: 96, d: 1 },
      { n: "volumetric yield", u: "grams per litre", lo: 0.4, hi: 18, d: 1 },
      { n: "residual activity after thermal challenge", u: "per cent", lo: 35, hi: 98, d: 0 },
      { n: "optimum pH", u: "pH units", lo: 5.2, hi: 9.4, d: 1 }],
    clauses: ["ligation efficiency is retained after incubation for thirty minutes at elevated temperature",
      "transcript abundance in root tissue increases markedly relative to a wild-type control",
      "seed weight per plant is increased under a controlled water-deficit regime without any yield penalty under well-watered conditions",
      "aggregation of the purified polypeptide during storage is substantially reduced",
      "the conjugate retains antigen binding after four cycles of freezing and thawing",
      "expression of the marker gene remains undetectable in reproductive tissue"],
    arrangements: ["operably linked to", "positioned immediately upstream of", "fused in frame with",
      "flanked at each end by recombination sites derived from", "expressed under the transcriptional control of"],
    features: ["a conserved acidic loop", "at least three consecutive hydrophobic residues", "a cleavable secretion signal",
      "an intron retained in the untranslated leader", "a pair of engineered disulphide bridges"],
    verbs: ["direct expression preferentially to vascular tissue", "restore activity after transient exposure to denaturing conditions",
      "release the payload only within the endosomal compartment", "confer resistance to the selection agent during regeneration"],
    steps: ["transforming a host cell with the expression construct", "selecting transformants on a medium containing the selection agent",
      "recovering the polypeptide from the clarified culture supernatant", "assaying residual activity after the thermal challenge"],
    avoid: ["the use of an antibiotic resistance marker in the final event", "a separate refolding step", "any animal-derived component in the feed"],
    gerunds: ["increasing yield-related traits in a plant", "producing a thermostable ligase", "preparing an antibody drug conjugate"],
    journals: ["Journal of Applied Plant Molecular Biology", "Archives of Protein Engineering and Design", "Reports in Industrial Biocatalysis"],
    terms: [["operably linked", "a linkage in which the described elements are in a relationship permitting them to function in the intended manner"],
      ["stringent conditions", "hybridisation in the presence of the stated salt concentration followed by two washes at the stated temperature"],
      ["homologue", "a polypeptide having the stated degree of overall sequence identity and retaining at least one of the conserved motifs identified above"]],
    conds: ["a cultivation temperature of 28 degrees Celsius", "the water-deficit protocol described in Example 5", "a substrate concentration of 2 millimolar"],
  }, {
    key: "matl",
    subjects: ["flame-retardant polyolefin compound", "ceramic-coated separator membrane", "low-shrinkage cementitious grout",
      "abrasion-resistant barrier coating", "recyclable multilayer packaging laminate"],
    field: ["polymer compounding", "electrochemical separator manufacture", "protective surface coatings"],
    parts: ["matrix resin", "mineral filler", "coupling agent", "coating layer", "substrate web", "curing agent",
      "tie layer", "dispersion aid", "release liner", "primer stratum", "sacrificial interlayer"],
    plurals: ["compounds", "separator membranes", "barrier coatings"],
    mats: ["a metallocene-catalysed linear low-density polyethylene", "a surface-treated aluminium trihydroxide",
      "a silane-functionalised oligomer", "a boehmite of narrow particle size distribution", "a bio-derived polyamide"],
    props: [{ n: "coating thickness", u: "micrometres", lo: 1.5, hi: 48, d: 1 },
      { n: "tensile strength at break", u: "megapascals", lo: 8, hi: 210, d: 0 },
      { n: "filler loading", u: "per cent by weight", lo: 5, hi: 62, d: 0 },
      { n: "glass transition temperature", u: "degrees Celsius", lo: -35, hi: 145, d: 0 },
      { n: "oxygen transmission rate", u: "cubic centimetres per square metre per day", lo: 0.3, hi: 46, d: 1 }],
    clauses: ["dripping during the vertical burn test is suppressed without recourse to a halogenated additive",
      "thermal shrinkage of the coated web at 150 degrees Celsius remains below one per cent in both directions",
      "the coated article survives the specified number of taber cycles without exposure of the substrate",
      "delamination is not observed after the boiling water immersion described below",
      "the laminate remains mechanically recyclable within a single polyolefin stream"],
    arrangements: ["applied directly to", "laminated between the substrate web and", "dispersed uniformly throughout",
      "deposited in register with", "cured in contact with"],
    features: ["a substantially continuous porous stratum", "a gradient in filler concentration through the thickness",
      "a plurality of discrete domains of sub-micrometre size", "an interpenetrating network of the two polymers"],
    verbs: ["resist ignition when exposed to the standard flame source", "maintain dimensional stability at the shutdown temperature",
      "promote adhesion between chemically dissimilar layers", "arrest crack propagation within the coating stratum"],
    steps: ["compounding the constituents in a co-rotating twin-screw extruder", "casting the dispersion onto the moving web",
      "drying the coated web in a multi-zone oven", "conditioning the specimens for forty-eight hours before testing"],
    avoid: ["the use of a halogenated flame retardant", "a solvent-based primer", "an additional lamination pass"],
    gerunds: ["preparing a flame-retardant compound", "coating a separator membrane", "recycling a multilayer laminate"],
    journals: ["Journal of Compounding and Additive Science", "Reports on Barrier and Separator Technology", "Annals of Applied Polymer Processing"],
    terms: [["parts by weight", "parts by weight referred to one hundred parts by weight of the total composition, unless expressly stated otherwise"],
      ["substantially free", "present, if at all, in an amount of less than 0.5 per cent by weight of the composition"],
      ["areal weight", "the mass of the applied layer per unit area of the substrate after drying"]],
    conds: ["a line speed of 45 metres per minute", "a relative humidity of 50 per cent", "the conditioning schedule of Example 1"],
  }, {
    key: "elec",
    subjects: ["bidirectional inverter control arrangement", "solid-state circuit protection module", "battery module thermal management arrangement",
      "resonant wireless power transfer coupler", "gate-drive isolation stage for wide-bandgap devices"],
    field: ["power electronics", "energy storage management", "contactless power transfer"],
    parts: ["switching leg", "gate driver", "laminated busbar", "cold plate", "cell stack", "supervisory controller",
      "current sensor", "snubber network", "resonant tank", "isolation barrier", "precharge contactor", "thermistor string"],
    plurals: ["inverter stages", "protection modules", "thermal management arrangements"],
    mats: ["a silicon carbide metal-oxide-semiconductor field-effect transistor", "a gallium nitride high electron mobility transistor",
      "a sintered silver die attach", "a direct-bonded copper substrate", "a dielectric fluid of low electrical conductivity"],
    props: [{ n: "switching frequency", u: "kilohertz", lo: 16, hi: 480, d: 0 },
      { n: "junction-to-coolant thermal resistance", u: "kelvin per watt", lo: 0.08, hi: 1.6, d: 2 },
      { n: "direct-current link voltage", u: "volts", lo: 320, hi: 1400, d: 0 },
      { n: "conducted emission margin", u: "decibel microvolts", lo: 3, hi: 22, d: 0 },
      { n: "state of charge spread across the stack", u: "per cent", lo: 0.5, hi: 9, d: 1 }],
    clauses: ["turn-off overshoot at the device terminals is held below the rated blocking voltage at the maximum load current",
      "the temperature spread across the cell stack remains within the band required for balanced ageing",
      "the fault is cleared before the let-through energy reaches the withstand limit of the downstream harness",
      "common-mode current circulating through the isolation barrier is materially reduced",
      "the converter remains in soft switching over the whole of the specified load range"],
    arrangements: ["connected in anti-series with", "mounted directly on the cold plate together with",
      "galvanically isolated from", "referenced to the source terminal of", "clamped by a transient voltage suppressor across"],
    features: ["a low-inductance commutation loop", "a pair of complementary switching devices", "a temperature-compensated shunt reference",
      "a plurality of parallel coolant channels", "an auxiliary winding magnetically coupled to the main inductor"],
    verbs: ["interrupt the fault current within a few microseconds of detection", "equalise the state of charge across the cell stack during standstill",
      "sense the device temperature without an additional isolation channel", "maintain zero-voltage switching down to light load"],
    steps: ["measuring the shunt voltage during the blanking interval", "commanding the gate driver into the soft turn-off state",
      "logging the event record in non-volatile memory", "verifying the isolation resistance before closing the main contactor"],
    avoid: ["a mechanical contactor in the main current path", "an additional isolated supply rail", "a separate balancing converter per cell"],
    gerunds: ["protecting a direct-current distribution network", "managing the temperature of a battery module", "transferring power across an air gap"],
    journals: ["Transactions on Power Conversion Engineering", "Journal of Energy Storage Systems", "Review of Applied Magnetics and Drives"],
    terms: [["let-through energy", "the integral of the square of the current with respect to time from the initiation of the fault until it is cleared"],
      ["soft switching", "a switching transition occurring while the voltage across, or the current through, the device is substantially zero"],
      ["state of charge", "the ratio of the presently available charge to the rated charge of the cell at the reference temperature"]],
    conds: ["an ambient temperature of 40 degrees Celsius", "a coolant inlet temperature of 65 degrees Celsius", "the load profile of Example 3"],
  }];

  const D = pick(DOMAINS);
  const subj = pick(D.subjects);
  const numBase = pick([10, 100, 102, 200, 20]);
  const numStep = pick([2, 2, 2, 4, 10]);
  const parts = shuffle(D.parts).slice(0, 10).map((n, i) => ({ n, r: numBase + numStep * (i + 1) }));
  const subjNum = numBase;
  const P = (i) => parts[i % parts.length];
  const twoParts = () => { const i = ri(0, parts.length - 1); let j = ri(0, parts.length - 1); if (j === i) j = (j + 3) % parts.length; return [parts[i], parts[j]]; };
  const prop = () => pick(D.props);
  const range2 = (p) => {
    const a = Number(rf(p.lo, p.hi * 0.6, p.d)), b = Number(rf(Math.max(a, p.hi * 0.6), p.hi, p.d));
    const c = Number(rf(a, b, p.d)), e = Number(rf(Math.max(c, (a + b) / 2), b, p.d));
    return [a.toFixed(p.d), b.toFixed(p.d), c.toFixed(p.d), e.toFixed(p.d)];
  };

  // ---------------- seed knobs ----------------
  const mode = pick(["desc", "desc", "desc", "claims", "claims", "twocol", "amend"]);
  const twoCol = mode === "twocol";
  const serif = chance(mode === "amend" ? 0.75 : 0.5);
  const fontFam = serif ? pick([`"Times New Roman", Times, serif`, `Georgia, "Times New Roman", serif`])
    : pick([`Arial, Helvetica, sans-serif`, `Helvetica, Arial, sans-serif`]);
  // mean glyph width as a fraction of the em, calibrated on rendered output for this
  // prose (2 per cent conservative so the page under-fills rather than clips)
  const charW = /Times/.test(fontFam) && !/Georgia/.test(fontFam) ? 0.414 : /Georgia/.test(fontFam) ? 0.448 : 0.452;
  const fontPt = Number((twoCol ? 8.0 + rng() * 1.1 : 8.4 + rng() * 1.5).toFixed(2));
  const lh = Number((1.16 + rng() * 0.17).toFixed(3));
  const padTopMm = 14 + rng() * 8, padBotMm = 12 + rng() * 7;
  const padSideMm = twoCol ? 13 + rng() * 4 : 17 + rng() * 6;
  const justify = chance(0.8);
  const paraIndent = mode === "amend" ? false : chance(0.3);      // first-line indent, tight gaps
  const paraGapPt = paraIndent ? Number((rng() * 1.2).toFixed(2)) : Number((fontPt * (0.42 + rng() * 0.5)).toFixed(2));
  const colGapMm = 5 + rng() * 4;
  const colRule = twoCol && chance(0.45);
  const subLetter = pick(["alpha", "alpha", "roman", "none"]);
  const claimStyle = chance(0.45) ? "ep" : "us";
  const boldTransition = chance(0.5);   // bold "characterized in that" / "wherein"
  const ulClaimTerm = chance(0.45);      // underline the first recited element of a dependent claim
  const italEvery = ri(3, 9);          // sentences between italic injections
  const boldTermP = 0.2 + rng() * 0.35;
  const ulTermP = 0.15 + rng() * 0.4;
  const wantFigure = mode !== "amend" && chance(0.3);
  const wantBox = chance(0.22);
  const hyphTail = mode !== "amend" && chance(0.65);
  const paraStart = ri(11, 292);

  // ---------------- page furniture ----------------
  const monthsAbbr = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
  const monthsFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const yr = 2016 + ri(0, 10);
  const mi = ri(0, 11), dd = ri(1, 28);
  const pubNum = pick([
    `US ${yr}/0${ri(100000, 899999)} A1`,
    `US ${ri(9, 12)},${ri(100, 999)},${ri(100, 999)} B2`,
    `EP ${ri(2, 4)} ${ri(100, 999)} ${ri(100, 999)} B1`,
    `WO ${yr}/${ri(100000, 299999)} A1`,
    `GB ${ri(2500, 2699)} ${ri(100, 999)} A`,
  ]);
  const pgNo = ri(4, 118), pgTot = pgNo + ri(6, 140);
  const docket = `${ri(1000, 9999)}-${ri(10, 99)}${ri(100, 999)}${pick(["US1", "US2", "WO", "EP"])}`;
  const appNo = `${ri(15, 18)}/${ri(200, 899)},${ri(100, 999)}`;
  let headLines, footLine, headAlign, footAlign, headRule;
  if (mode === "amend") {
    headLines = [`Application No. ${appNo}`, `Reply to Office Action of ${monthsFull[mi]} ${dd}, ${yr}`, `Attorney Docket No. ${docket}`];
    headAlign = "left"; headRule = true;
    footLine = pick([`Page ${pgNo} of ${pgTot}`, `- ${pgNo} -`, `${pgNo}`]);
    footAlign = pick(["center", "right"]);
  } else {
    const dateStr = pick([`${monthsAbbr[mi]} ${dd}, ${yr}`, `${dd}.${String(mi + 1).padStart(2, "0")}.${yr}`, `${yr}-${String(mi + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`]);
    const sep = " ".repeat(ri(3, 8));
    headLines = chance(0.25) ? [] : [`${pubNum}${sep}${dateStr}`];
    headAlign = chance(0.65) ? "center" : "left";
    headRule = chance(0.4);
    footLine = pick([`${pgNo}/${pgTot}`, `${pgNo}/${pgTot}`, `Page ${pgNo} of ${pgTot}`, `- ${pgNo} -`, `${pubNum}${" ".repeat(ri(2, 6))}${pgNo}`]);
    footAlign = chance(0.7) ? "center" : "right";
  }

  // ---------------- sentence engine ----------------
  let sentCount = 0;
  const conn = () => pick(["In some embodiments", "In certain embodiments", "In one or more embodiments", "In a particular embodiment",
    "According to one aspect", "In the illustrated embodiment", "In a yet further embodiment"]);
  const TEMPL = [
    () => { const [a, b] = twoParts(); return `${conn()}, the ${a.n} ${a.r} is ${pick(["coupled to", "supported by", "carried by", "received within", "held captive relative to"])} the ${b.n} ${b.r} so that ${pick(D.clauses)}.`; },
    () => { const a = P(ri(0, 9)); return `The ${a.n} ${a.r} may be ${pick(["formed from", "fabricated from", "constituted by", "implemented on"])} ${pick(D.mats)}, although any equivalent exhibiting comparable ${prop().n} may be substituted without departing from the present teaching.`; },
    () => { const a = P(ri(0, 9)), p = prop(), [v1, v2, v3, v4] = range2(p); return `${pick(["Preferably", "More preferably", "Suitably", "Advantageously"])}, the ${p.n} of the ${a.n} ${a.r} lies in the range of from about ${v1} to about ${v2} ${p.u}, and ${pick(["most preferably", "still more preferably", "in a particularly preferred embodiment"])} from about ${v3} to about ${v4} ${p.u}.`; },
    () => { const [a, b] = twoParts(); return `It has been found, ${I(pick(["inter alia", "surprisingly", "unexpectedly"]))}, that ${pick(D.clauses)} when the ${a.n} ${a.r} is ${pick(D.arrangements)} the ${b.n} ${b.r}.`; },
    () => { const t = pick(D.terms); const w = chance(0.5) ? B(`"${t[0]}"`) : U(t[0]); return `As used herein, the term ${w} refers to ${t[1]}, unless the context clearly requires otherwise.`; },
    () => `Referring now to FIG. ${ri(1, 9)}, a ${subj} ${subjNum} according to a ${pick(["further", "second", "alternative", "presently preferred"])} embodiment is shown in ${pick(["partial cross-section", "exploded form", "schematic form", "diagrammatic elevation"])}, like reference numerals denoting like parts throughout.`,
    () => `Without wishing to be bound by any particular theory, it is presently believed that ${pick(D.clauses)}.`,
    () => { const a = P(ri(0, 9)); return `Suitable materials for the ${a.n} ${a.r} include, without limitation, ${shuffle(D.mats).slice(0, 3).join(", ")}.`; },
    () => `In a further aspect there is provided a method of ${pick(D.gerunds)}, the method comprising ${pick(D.steps)}, and thereafter ${pick(D.steps)}.`,
    () => { const p = prop(); return `Compared with conventional ${pick(D.plurals)}, the arrangement described above ${pick(["improves", "reduces", "increases"])} the ${p.n} by at least ${ri(4, 46)} per cent when measured at ${pick(D.conds)}.`; },
    () => `See, for example, ${I(pick(D.journals))}, Vol. ${ri(3, 88)}, pp. ${ri(11, 480)} to ${ri(481, 960)} (${1994 + ri(0, 28)}), the disclosure of which is incorporated herein by reference in its entirety.`,
    () => { const [a, b] = twoParts(); return `The ${a.n} ${a.r} and the ${b.n} ${b.r} may be formed integrally with one another, or may alternatively be provided as discrete components that are ${pick(["welded", "bonded", "fastened", "press-fitted", "clamped"])} together during assembly.`; },
    () => `${pick(["Advantageously", "Conveniently", "Beneficially", "Usefully"])}, ${pick(D.clauses)}, which ${pick(["obviates the need for", "dispenses with", "avoids"])} ${pick(D.avoid)}.`,
    () => { const a = P(ri(0, 9)); return `The ${a.n} ${a.r} is ${pick(["configured", "arranged", "adapted", "operable"])} to ${pick(D.verbs)}.`; },
    () => `The values reported in this specification were determined at ${pick(D.conds)} unless otherwise indicated, and all percentages are ${pick(["by weight", "by volume", "expressed relative to the corresponding reference value"])}.`,
    () => { const a = P(ri(0, 9)); return `In a modification, the ${a.n} ${a.r} comprises ${pick(D.features)}, whereby ${pick(D.clauses)}.`; },
  ];
  let tOrder = shuffle(TEMPL.map((_, i) => i)), tPos = 0;
  function sentence() {
    if (tPos >= tOrder.length) { tOrder = shuffle(TEMPL.map((_, i) => i)); tPos = 0; }
    let s = TEMPL[tOrder[tPos++]]();
    sentCount++;
    if (sentCount % italEvery === 0 && !s.includes(OP + "I")) {
      s += " " + pick([
        `The same considerations apply ${I("mutatis mutandis")} to each of the further embodiments described below.`,
        `The converse arrangement is also contemplated, and ${I("vice versa")}.`,
        `Where practicable the determination is carried out ${I("in situ")}, that is to say without disassembly of the apparatus.`,
        `The reference is to the component ${I("per se")} and not to any sub-assembly in which it may be mounted.`,
        `Values prefixed by ${I("ca.")} are to be read as approximate values only.`,
        `See ${I("supra")} in relation to the corresponding feature of the first embodiment.`,
      ]);
    }
    return s;
  }
  function paragraph(n) {
    const k = ri(2, 5);
    let body = [];
    for (let i = 0; i < k; i++) body.push(sentence());
    let txt = body.join(" ");
    if (chance(boldTermP)) {
      const a = P(ri(0, 9));
      txt += ` The expression ${B(`"${a.n}"`)} is used throughout this specification in its broadest sense.`;
    }
    if (chance(ulTermP)) {
      const t = pick(D.terms);
      txt += ` For the avoidance of doubt, ${U(t[0])} has the meaning given above wherever it appears in the claims.`;
    }
    return `${B(`[${String(n).padStart(4, "0")}]`)} ${txt}`;
  }
  function saturationParagraph(n) {
    const p = pick(D.props.filter((x) => /cent|identity/.test(x.u)) .length ? D.props.filter((x) => /cent/.test(x.u)) : D.props);
    const lo = ri(40, 62), a = P(ri(0, 9)), b = P(ri(0, 9));
    const list = [];
    const pStep = pick([1, 1, 2, 3, 5]);
    // step-1 ladders never use the bare "NN%" form (keeps long runs from aligning
    // verbatim with any other step-1 enumeration of the same range)
    const pFmt = pStep === 1
      ? pick([(v) => `${v} %`, (v) => `${v} per cent`])
      : pick([(v) => `${v}%`, (v) => `${v} %`, (v) => `${v} per cent`]);
    for (let v = lo; v <= 99; v += pStep) list.push(pFmt(v));
    const bio = D.key === "bio";
    const head = bio
      ? `In a further preferred embodiment the polypeptide comprises an amino acid sequence having, in increasing order of preference, at least `
      : `In a further embodiment the ${a.n} ${a.r} exhibits a ${p.n} of at least `;
    const tail = bio
      ? ` sequence identity to the sequence of SEQ ID NO: ${ri(12, 480)}, provided that the polypeptide retains at least one of the conserved motifs identified above.`
      : ` of the value measured for the reference ${b.n} ${b.r} at ${pick(D.conds)}.`;
    return `${B(`[${String(n).padStart(4, "0")}]`)} ${head}${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}${tail}`;
  }
  function dashItems() {
    const k = ri(2, 5);
    const out = [];
    const pp = shuffle(parts), ff = shuffle(D.features), dbs = shuffle(["HMMPfam", "Gene3D", "PANTHER", "SUPERFAMILY", "InterPro"]);
    for (let i = 0; i < k; i++) {
      const a = pp[i % pp.length];
      const last = i === k - 1;
      if (D.key === "bio" && chance(0.5))
        out.push(`a domain as determined by the ${dbs[i % dbs.length]} database and bearing the accession number ${pick(["PF", "G3DSA:", "PTHR", "SSF", "IPR"])}${ri(1000, 99999)}${last ? "." : ";"}`);
      else
        out.push(`a ${a.n} ${a.r} ${pick(["defining", "having", "providing", "carrying"])} ${ff[i % ff.length]}${last ? "." : ";"}`);
    }
    return out;
  }
  const gerundRing = shuffle(D.gerunds); let gerundIx = 0;
  const nextGerund = () => gerundRing[gerundIx++ % gerundRing.length];
  function claim(n, refs, forceDep) {
    const dep = n > 1 && (refs.length > 0) && (forceDep || chance(0.72));
    const whTxt = claimStyle === "ep" ? "characterized in that" : "wherein";
    const wh = boldTransition ? B(whTxt) : whTxt;
    if (!dep) {
      const isMethod = n > 1 && chance(0.5);
      const nsub = ri(3, 5);
      const subs = [];
      const pp = shuffle(parts), ff = shuffle(D.features), ss = shuffle(D.steps), ar = shuffle(D.arrangements);
      for (let i = 0; i < nsub; i++) {
        const a = pp[i % pp.length], b = pp[(i + 4) % pp.length];
        const tag = subLetter === "alpha" ? `(${String.fromCharCode(97 + i)}) ` : subLetter === "roman" ? `(${["i", "ii", "iii", "iv", "v", "vi"][i]}) ` : "";
        const t = isMethod
          ? `${tag}${ss[i % ss.length]}`
          : `${tag}a ${a.n} ${pick(["defining", "having", "comprising", "carrying"])} ${ff[i % ff.length]}, the ${a.n} being ${ar[i % ar.length]} the ${b.n}`;
        subs.push(t + (i === nsub - 2 ? "; and" : i === nsub - 1 ? "," : ";"));
      }
      const lead = isMethod
        ? `A method of ${nextGerund()}, the method comprising:`
        : `A ${subj}${claimStyle === "ep" ? ` (${subjNum})` : ""} comprising:`;
      const tail = `${wh} ${pick(D.clauses)}.`;
      return { kind: "claim", n, lead, subs, tail, indep: true };
    }
    const r1 = pick(refs);
    const multi = chance(0.3) && refs.length > 3;
    const ref = multi ? `any one of claims ${refs[0]} to ${refs[refs.length - 1]}` : `claim ${r1}`;
    const a = P(ri(0, 9)), b = P(ri(0, 9)), p = prop(), [v1, v2] = range2(p);
    const feat = pick([
      `is formed at least in part from ${pick(D.mats)}`,
      `has a ${p.n} of from about ${v1} to about ${v2} ${p.u}`,
      `is ${pick(D.arrangements)} the ${b.n}`,
      `comprises ${pick(D.features)}`,
      `is configured to ${pick(D.verbs)}`,
    ]);
    const an = ulClaimTerm && chance(0.4) ? U(a.n) : a.n;
    const lead = `The ${subj} ${claimStyle === "ep" ? "according to" : "of"} ${ref}, ${wh} the ${an}${claimStyle === "ep" ? ` (${a.r})` : ""} ${feat}.`;
    return { kind: "claim", n, lead, subs: [], tail: "", indep: false };
  }
  function amendClaim(n, refs, late) {
    const pool = late ? ["(New)", "(New)", "(Currently Amended)", "(Previously Presented)"]
      : ["(Currently Amended)", "(Original)", "(Previously Presented)", "(Currently Amended)", "(Canceled)"];
    const status = pick(pool);
    if (status === "(Canceled)") return { kind: "claim", n, lead: `${B(status)}`, subs: [], tail: "", raw: true };
    const a = P(ri(0, 9)), b = P(ri(0, 9)), p = prop(), [v1, v2] = range2(p);
    const back = refs.filter((r) => r < n);
    let txt;
    if (n === 1) {
      // claim 1 of a listing is independent
      txt = `A ${subj} comprising a ${a.n} ${U(pick(D.arrangements))} the ${b.n}, `
        + `${S("the " + b.n + " being mounted directly on the " + P(ri(0, 9)).n)} ${U(`the ${b.n} having a ${p.n} of from about ${v1} to about ${v2} ${p.u}`)}, wherein ${pick(D.clauses)}.`;
      return { kind: "claim", n, lead: `${B(status === "(Canceled)" ? "(Currently Amended)" : status)} ${txt}`, subs: [], tail: "", raw: true };
    }
    if (status === "(Currently Amended)") {
      txt = `The ${subj} of claim ${pick(back.length ? back : [1])}, wherein the ${a.n} is ${S("mounted on")} ${U(pick(D.arrangements))} the ${b.n}, `
        + `${U(`the ${b.n} having a ${p.n} of from about ${v1} to about ${v2} ${p.u},`)} such that ${S(pick(D.clauses))} ${U(pick(D.clauses))}.`;
    } else if (status === "(New)") {
      txt = `A ${subj} according to claim ${pick(back.length ? back : [1])}, wherein the ${a.n} comprises ${pick(D.features)} and is configured to ${pick(D.verbs)}.`;
    } else {
      txt = `The ${subj} of claim ${pick(back.length ? back : [1])}, wherein the ${a.n} is ${pick(D.arrangements)} the ${b.n} and ${pick(D.clauses)}.`;
    }
    return { kind: "claim", n, lead: `${B(status)} ${txt}`, subs: [], tail: "", raw: true };
  }

  // ---------------- geometry / line budget ----------------
  const MM = 2.83465;
  const pageWpt = 210 * MM, pageHpt = 297 * MM;
  const usableWpt = pageWpt - 2 * padSideMm * MM;
  const colWpt = twoCol ? (usableWpt - colGapMm * MM) / 2 : usableWpt;
  const cplEff = (colWpt / (fontPt * charW)) * 0.995;
  const linePt = fontPt * lh;
  const headBlockPt = headLines.length ? headLines.length * linePt + (headRule ? 7 : 5) + fontPt * 0.7 : 0;
  // the footer is absolutely positioned inside the bottom padding; it only eats body
  // height if it reaches above the padding box
  const footBlockPt = footLine ? Math.max(0, linePt + fontPt * 0.6 - padBotMm * 0.5 * MM) : 0;
  const bodyHpt = pageHpt - (padTopMm + padBotMm) * MM - headBlockPt - footBlockPt;
  const linesPerCol = Math.floor(bodyHpt / linePt);
  const totalLines = linesPerCol * (twoCol ? 2 : 1) - 0.5;
  const gapLines = paraGapPt / linePt;
  const ceilL = (s, w) => Math.max(1, Math.ceil(rawLen(s) / w));
  // fractional estimator for wrapping blocks: on average a wrapped block ends mid-line
  const fitL = (s, w) => Math.max(1, rawLen(s) / w + 0.55);

  function estLines(b) {
    if (b.kind === "heading") return 1 + gapLines + 0.55;
    if (b.kind === "para" || b.kind === "plain") return fitL(b.text, cplEff) + gapLines;
    if (b.kind === "dash") return b.items.reduce((s, t) => s + ceilL(t, cplEff * 0.95), 0) + gapLines;
    if (b.kind === "claim") return fitL(b.lead, cplEff * (b.indep === false || b.raw ? 0.99 : 1)) + b.subs.reduce((s, t) => s + fitL(t, cplEff * 0.93), 0) + (b.tail ? fitL(b.tail, cplEff * 0.93) : 0) + gapLines;
    if (b.kind === "figure") return b.figLines + 1 + 2 * gapLines;
    if (b.kind === "box") return b.paras.reduce((s, t) => s + ceilL(t, cplEff * 0.9), 0) + 2 + 2 * gapLines + (b.title ? 1.4 : 0);
    return 1;
  }

  // ---------------- document assembly ----------------
  const blocks = [];
  let used = 0;
  const push = (b) => { blocks.push(b); used += estLines(b); };
  const room = () => totalLines - used;

  const headPoolDesc = ["DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS", "DESCRIPTION OF THE EMBODIMENTS",
    "Detailed description of the invention", "SUMMARY OF THE DISCLOSURE", "Brief description of the drawings",
    "Definitions", "EXAMPLES", "Description of the preferred embodiments"];

  let pn = paraStart, lastClaimNo = 1;
  const nextPara = () => pn++;

  if (mode === "amend") {
    push({ kind: "heading", text: pick(["Amendments to the Claims", "AMENDMENTS TO THE CLAIMS", "Listing of Claims"]) });
    push({ kind: "plain", text: `This listing of claims will replace all prior versions, and listings, of claims in the above-identified application. Claims ${ri(1, 4)} to ${ri(12, 24)} are pending in the application; claims ${ri(2, 6)} and ${ri(7, 11)} stand rejected under the provisions cited in the Office Action. No new matter has been added by the present amendment.` });
    const refs = [];
    let cn = 1, misses = 0;
    while (room() > 1.6 && cn <= 24 && misses < 14) {
      const c = amendClaim(cn, refs, cn > 7 + ri(0, 4));
      if (estLines(c) > room()) { misses++; continue; }
      refs.push(cn); push(c); cn++;
    }
  } else if (mode === "claims") {
    if (chance(0.5)) {
      push({ kind: "plain", text: `${B(`[${String(nextPara()).padStart(4, "0")}]`)} ${sentence()} ${sentence()} ${sentence()}` });
    }
    push({ kind: "heading", text: pick(["CLAIMS", "Claims", "WHAT IS CLAIMED IS:", "The invention claimed is:"]) });
    const refs = [];
    let cn = 1, misses = 0;
    while (room() > 1.6 && cn <= 28 && misses < 14) {
      const c = claim(cn, refs.slice(), room() < 9);   // short dependent claims pack the tail
      if (estLines(c) > room()) { misses++; continue; }
      refs.push(cn); push(c); cn++;
    }
    lastClaimNo = cn;
  } else {
    // desc / twocol: paragraph body with headings, dash lists, optional figure + box
    if (chance(0.55)) push({ kind: "plain", text: `${sentence()} ${sentence()}` }); // carried-over fragment
    let sinceHead = 0, sinceDash = 9, didSat = false, didFig = false, didBox = false;
    while (room() > 3.2) {
      const r = rng();
      if (sinceHead > ri(3, 7) && chance(0.5) && room() > 8) { push({ kind: "heading", text: pick(headPoolDesc) }); sinceHead = 0; continue; }
      if (wantFigure && !didFig && room() > 14 && chance(0.25)) {
        didFig = true; sinceDash++;
        push({ kind: "figure", figLines: ri(5, 9), caption: `FIG. ${ri(1, 9)}${pick([" — ", ".  ", ": "])}${pick(["Exploded view", "Schematic representation", "Cross-section", "Block diagram", "Flow diagram"])} of the ${subj} ${subjNum} of the first embodiment.` });
        sinceHead++; continue;
      }
      if (wantBox && !didBox && room() > 12 && chance(0.22)) {
        didBox = true; sinceDash++;
        push({ kind: "box", title: pick(D.key === "bio" ? ["Table of sequence identifiers", "Summary of test conditions", "Definitions applicable to the claims"] : ["Summary of test conditions", "Nomenclature used in this specification", "Definitions applicable to the claims", "Reference numerals used in the drawings"]),
          paras: [`${sentence()}`, `${sentence()}`] });
        sinceHead++; continue;
      }
      if (!didSat && room() > 12 && r < 0.22) { didSat = true; push({ kind: "para", text: saturationParagraph(nextPara()) }); sinceHead++; sinceDash++; continue; }
      if (r < 0.30 && room() > 6 && sinceDash >= 2) {
        const n = nextPara();
        const stem = D.key === "bio"
          ? `a ${subj} as used herein comprises one or more of the domains listed in Table ${pick(["B", "C", "D"])}, and in particular one or more of the following domains:`
          : pick([
            `the ${subj} ${subjNum} comprises, in combination:`,
            `the ${subj} ${subjNum} further comprises at least one of the following:`,
            `there is provided a ${subj} ${subjNum} having:`,
            `the apparatus described above may be modified by the addition of any one or more of:`,
          ]);
        push({ kind: "para", text: `${B(`[${String(n).padStart(4, "0")}]`)} ${conn()}, ${stem}` });
        push({ kind: "dash", items: dashItems() });
        sinceDash = 0; sinceHead++; continue;
      }
      const p = { kind: "para", text: paragraph(nextPara()) };
      if (estLines(p) > room() + 2.5) break;
      push(p); sinceHead++; sinceDash++;
    }
  }

  // fill the remaining sliver with text cut mid-word (continuation-page look)
  function cutToFit(remLines, lead) {
    let long = "";
    while (rawLen(long) < remLines * cplEff + 200) long += (long ? " " : "") + sentence();
    long = long.replace(/\u0001[BIUS]/g, "").replace(/\u0002/g, "");
    const budget = Math.floor(remLines * cplEff) - rawLen(lead) - 4;
    if (budget < 40) return null;
    const cut = long.slice(0, budget);
    const ls = cut.lastIndexOf(" ");
    const w = long.slice(ls + 1).split(" ")[0] || "";
    if (w.length >= 7) return long.slice(0, ls + 1) + w.slice(0, Math.max(3, Math.floor(w.length / 2))) + "-";
    return long.slice(0, ls);
  }
  if (room() > 1.6) {
    if (mode === "amend" && room() > 3.2) {
      push({ kind: "heading", text: pick(["REMARKS", "Remarks", "REMARKS/ARGUMENTS"]) });
      const body = cutToFit(room(), "");
      if (body) push({ kind: "plain", text: `Applicant thanks the Examiner for the courtesies extended during the interview of record. ${body}` });
    } else if (mode === "claims") {
      const body = cutToFit(room(), `${lastClaimNo}. `);
      if (body) push({ kind: "claim", n: lastClaimNo, lead: `The ${subj} ${claimStyle === "ep" ? "according to" : "of"} claim ${ri(1, Math.max(1, lastClaimNo - 1))}, ${claimStyle === "ep" ? "characterized in that" : "wherein"} ${body}`, subs: [], tail: "", indep: false });
    } else if (hyphTail) {
      const n = nextPara();
      const tok = `[${String(n).padStart(4, "0")}] `;
      const body = cutToFit(room(), tok);
      if (body) push({ kind: "para", text: `${B(tok.trim())} ${body}` });
    }
  }

  // ---------------- HTML ----------------
  const alignCss = justify ? "justify" : "left";
  const htmlBlocks = blocks.map((b) => {
    if (b.kind === "heading") return `<div class="h">${ht(b.text)}</div>`;
    if (b.kind === "para" || b.kind === "plain") return `<p>${ht(b.text)}</p>`;
    if (b.kind === "dash") return `<div class="dashes">` + b.items.map((t) => `<p class="dash">– ${ht(t)}</p>`).join("\n") + `</div>`;
    if (b.kind === "claim") {
      const subs = b.subs.map((t) => `<p class="sub">${ht(t)}</p>`).join("\n");
      const tail = b.tail ? `<p class="sub">${ht(b.tail)}</p>` : "";
      return `<div class="clm"><p class="lead">${b.n}. ${ht(b.lead)}</p>\n${subs}\n${tail}</div>`;
    }
    if (b.kind === "figure")
      return `<div class="figw"><div class="fig" style="height:${(b.figLines * linePt).toFixed(1)}pt"></div><p class="cap">${ht(b.caption)}</p></div>`;
    if (b.kind === "box")
      return `<div class="box">${b.title ? `<p class="bt">${ht(b.title)}</p>` : ""}${b.paras.map((t) => `<p>${ht(t)}</p>`).join("")}</div>`;
    return "";
  }).join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0 }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: ${fontFam}; font-size: ${fontPt}pt;
         line-height: ${lh}; color: #000; -webkit-font-smoothing: antialiased; }
  .page { box-sizing: border-box; width: 210mm; height: 297mm; position: relative;
          padding: ${padTopMm.toFixed(1)}mm ${padSideMm.toFixed(1)}mm ${padBotMm.toFixed(1)}mm; overflow: hidden; }
  .hdr { white-space: pre; text-align: ${headAlign}; margin-bottom: ${(fontPt * 0.7).toFixed(1)}pt;
         ${headRule ? "border-bottom: 0.6pt solid #000; padding-bottom: 2.5pt;" : ""} }
  .ftr { position: absolute; left: ${padSideMm.toFixed(1)}mm; right: ${padSideMm.toFixed(1)}mm;
         bottom: ${(padBotMm * 0.5).toFixed(1)}mm; white-space: pre; text-align: ${footAlign}; }
  .body { ${twoCol ? `column-count: 2; column-gap: ${colGapMm.toFixed(1)}mm; ${colRule ? "column-rule: 0.5pt solid #999;" : ""}` : ""} }
  p { margin: 0 0 ${paraGapPt}pt 0; text-align: ${alignCss}; hyphens: auto; -webkit-hyphens: auto;
      ${paraIndent ? "text-indent: " + (3 + rng() * 3).toFixed(1) + "mm;" : ""} orphans: 1; widows: 1; }
  p.dash { text-indent: 0; padding-left: ${(3.5 + rng() * 2.5).toFixed(1)}mm; text-indent: -2.2mm; margin-bottom: 0; }
  .dashes { margin-bottom: ${paraGapPt}pt; }
  .h { font-weight: bold; text-align: ${chance(0.5) ? "left" : "center"}; margin: ${(fontPt * 0.9).toFixed(1)}pt 0 ${(fontPt * 0.35).toFixed(1)}pt;
       ${chance(0.4) ? "letter-spacing: 0.3pt;" : ""} }
  .clm { margin-bottom: ${Math.max(paraGapPt, fontPt * 0.35).toFixed(1)}pt; break-inside: avoid-column; }
  .clm p { margin-bottom: 0; text-indent: 0; }
  p.lead { padding-left: ${(6 + rng() * 3).toFixed(1)}mm; text-indent: -${(6 + rng() * 3).toFixed(1)}mm; }
  p.sub { padding-left: ${(9 + rng() * 4).toFixed(1)}mm; text-indent: -${(3 + rng() * 2).toFixed(1)}mm; }
  .figw { margin: ${(fontPt * 0.6).toFixed(1)}pt 0; }
  .fig { border: 0.6pt solid #444; background: repeating-linear-gradient(135deg,#e9e9e9 0 6px,#dcdcdc 6px 12px); }
  .cap { text-align: center; font-size: ${(fontPt * 0.94).toFixed(2)}pt; margin-top: 2pt; text-indent: 0; }
  .box { border: 0.7pt solid #000; padding: ${(fontPt * 0.5).toFixed(1)}pt ${(fontPt * 0.6).toFixed(1)}pt;
         margin: ${(fontPt * 0.6).toFixed(1)}pt 0; break-inside: avoid-column; }
  .box p { text-indent: 0; margin-bottom: ${(fontPt * 0.3).toFixed(1)}pt; }
  .box p:last-child { margin-bottom: 0; }
  .bt { font-weight: bold; }
  </style></head><body><div class="page">
  ${headLines.length ? `<div class="hdr">${headLines.map((l) => ht(l)).join("<br>")}</div>` : ""}
  <div class="body">
${htmlBlocks}
  </div>
  ${footLine ? `<div class="ftr">${ht(footLine)}</div>` : ""}
  </div></body></html>`;

  // ---------------- GT (markdown text, logical reading order) ----------------
  const gtParts = [];
  if (headLines.length) gtParts.push(headLines.map((l) => md(l)).join("\n"));
  for (const b of blocks) {
    if (b.kind === "heading") gtParts.push(`## ${md(b.text)}`);
    else if (b.kind === "para" || b.kind === "plain") gtParts.push(md(b.text));
    else if (b.kind === "dash") gtParts.push(b.items.map((t) => `- ${md(t)}`).join("\n"));
    else if (b.kind === "claim") {
      const lines = [`${b.n}. ${md(b.lead)}`];
      for (const s of b.subs) lines.push(`  ${md(s)}`);
      if (b.tail) lines.push(`  ${md(b.tail)}`);
      gtParts.push(lines.join("\n"));
    } else if (b.kind === "figure") gtParts.push(md(b.caption));
    else if (b.kind === "box") {
      const lines = [];
      if (b.title) lines.push(`### ${md(b.title)}`);
      gtParts.push(lines.concat(b.paras.map((t) => md(t))).join("\n\n"));
    }
  }
  if (footLine) gtParts.push(md(footLine));
  const gt = gtParts.join("\n\n");

  return { html, gt, pageOpts: { format: "A4" } };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
