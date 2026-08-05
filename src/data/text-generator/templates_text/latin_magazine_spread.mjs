// FAMILY GENERATOR — latin-script magazine feature spread (dense-TEXT family).
// DRIFT sibling of a Japanese magazine interview-spread anchor: one wide 420x297mm
// spread page, huge display headline (one accent-colored word), dense multi-column
// tiny body text, colored section kickers, pull quotes (GT = blockquote), full-bleed
// photo placeholder with caption / name band, folio strips, center fold shading.
//
// 3 discrete layout modes (seed-selected):
//   0 = interview Q&A, photo right with name band   (EN only, anchor-like)
//   1 = feature prose, drop cap, crossheads, optional sidebar box, photo right
//   2 = banner headline across full spread, 5-7 columns, bottom photo band
// Language: EN mostly, occasional FR / ES seed (feature modes).
// Continuous jitter: column count, font family/scale, emphasis density (u/b/i mix),
// pull-quote count+style, sidebar presence+list type, furniture style, photo width,
// palette, page numbers. All prose freshly written & fictional (slot-filled cores).
// GT = markdown in logical reading order; emphasis mirrors render byte-exactly.
export function generate(seed) {
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const rf = (a, b) => a + rng() * (b - a);
  const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const MM = 0.3528; // mm per pt

  // ---------------- content pools (all fictional) ----------------
  const EN = {
    cores: [
      "When {p1} first pushed open the door of {org}’s {city} workshop, the {thing} was [[little more than a sketch taped to a wall]].",
      "{org} now counts {num} members across the region, and the waiting list for its {thing} runs well into next {season}.",
      "The first {thing} failed within a week, and the second lasted barely a month.",
      "Neighbors were skeptical at first, then curious, and finally [[impossible to keep away]].",
      "A grant of {money} in {year} changed the arithmetic almost overnight.",
      "By {year}, the group had outgrown two buildings and worn out three vans.",
      "“We kept the ugly prototypes on purpose,” {p1} says. “They remind everyone that none of this was inevitable.”",
      "{p2}, who joined in {year}, still handles the morning shift and most of the paperwork.",
      "Roughly {pct} of the budget goes to materials; the rest is [[stubbornness and borrowed tools]].",
      "On a good week the team turns out {num} {unit}, each one logged by hand in a canvas notebook.",
      "The city offered a lease on an empty depot, provided the group could make the roof watertight by {season}.",
      "Critics in the trade press called the idea quaint; {p1} prefers the word [[patient]].",
      "There were setbacks nobody advertises: a flooded cellar, a lost contract, a winter without heat.",
      "What visitors notice first is the smell — resin, damp rope, strong coffee — and then the noise.",
      "Apprentices start on sweeping duty and graduate to the {thing} only after a full season.",
      "Orders now arrive from as far away as {far}, which still makes {p2} laugh.",
      "The ledger for {year} shows a modest surplus — [[the first in the group’s history]].",
      "Every Friday ends the same way: tools oiled, floor swept, and one long argument about the radio station.",
      "{p1} grew up two streets from the site and remembers when the building stood empty.",
      "A retired engineer taught the crew to read the old drawings, most of them stamped {year}.",
      "Insurance nearly sank the project twice; a sympathetic broker in {city} finally wrote the policy.",
      "The {thing} is not fast work, and [[nobody involved pretends otherwise]].",
      "School groups visit on Tuesdays, and at least one child a month asks to stay.",
      "“People assume there is a trick to it,” says {p2}. “The trick is [[showing up in February]].”",
      "Local suppliers extend credit on a handshake, an arrangement {p1} refuses to formalize.",
      "The waiting room doubles as an archive, its shelves bowed under {num} boxes of records.",
      "A documentary crew spent a week on site in {year} and left with more questions than footage.",
      "Membership dues cover barely {pct} of costs, so the annual auction has become [[a small legend]].",
      "Rivals have copied the model in three towns, which the group takes as a compliment.",
      "The oldest volunteer is eighty-one and still climbs the ladder, against everyone’s advice.",
      "Nothing on site is thrown away; even failed castings end up as doorstops and paperweights.",
      "{p1} keeps a list of mistakes pinned above the bench, updated [[more often than anyone would like]].",
      "The next ambition is a second site across the river, budgeted at {money} and already behind schedule.",
      "Grant officers ask for metrics; the crew answers with photographs and a tour.",
      "In {season}, the whole operation shifts to earlier hours to catch the light.",
      "A profile in *The Coastal Register* brought a week of phone calls and at least one marriage proposal.",
      "Whatever happens next, the {thing} has already outlived every prediction made about it.",
    ],
    openers: [
      "When {p1} first pushed open the door of {org}’s {city} workshop, the {thing} was [[little more than a sketch taped to a wall]].",
      "The first thing {p1} shows a visitor to {org} is not the {thing} but the ledger.",
      "{p1} grew up two streets from {org}’s {city} site and remembers when the building stood empty.",
    ],
    acores: [
      "We started with {num} kids and a borrowed room; the whole plan fit on an index card.",
      "Parents want a schedule and a guarantee, and honestly we can offer neither.",
      "The change usually comes in the second season, when they stop asking permission [[to try things]].",
      "I tell every new family the same thing: boredom is not an emergency.",
      "Around {year} we nearly closed — funding fell through and the roof leaked into the workbenches.",
      "What saved us was {p2}, who ran the books for nothing for two years.",
      "Teenagers can smell a script a mile off, so we stopped writing scripts.",
      "Maybe {pct} of what we do looks like teaching; the rest is [[standing back on purpose]].",
      "A kid who has soldered a joint badly forty times owns the forty-first in a way no lecture can give.",
      "We lose a few every year to exams, and the door stays open when the exams are done.",
      "My rule for parents is simple: praise the attempt in public and [[save the advice for the car]].",
      "The {thing} is just a pretext — the real curriculum is patience.",
      "I was a terrible student myself, which the kids find endlessly reassuring.",
      "Once a month we break something expensive, and that is a line item now.",
      "If a fifteen-year-old can explain it to a nine-year-old, then it is truly learned.",
      "The quiet ones worry me least; quiet is often [[where the work happens]].",
      "We ask alumni to come back and fail at something new in front of everyone.",
      "Screens are not the enemy; a day with no unscheduled hour is the enemy.",
      "By {season} the room smells of flux and oranges, and nobody wants to leave at closing.",
      "You cannot rush trust, and you cannot fake it — [[teenagers audit everything]].",
    ],
    qs: [
      "— How did {org} begin?",
      "— What do parents most often get wrong?",
      "— Was there a moment you nearly gave up?",
      "— How do you measure progress without grades?",
      "— What changes when a student turns sixteen?",
      "— Who taught you to teach this way?",
      "— What does a typical evening at {org} look like?",
      "— How do you handle a student who refuses to participate?",
      "— What should families be doing at home?",
      "— Where does the money come from?",
      "— What is next for {org}?",
      "— What would you tell your younger self?",
    ],
    pqs: [
      "“The trick, if there is one, is showing up in February.”",
      "“Boredom is not an emergency.”",
      "“Nobody here is in a hurry, and somehow everything gets done.”",
      "“Every mistake is pinned above the bench.”",
      "“We measure the year in repaired things.”",
      "“Quaint is just patient, said faster.”",
      "“The building taught us most of what we know.”",
      "“You cannot fake it — they audit everything.”",
    ],
    kick: ["THE FIRST WINTER", "A ROOM OF MACHINES", "WHAT THE LEDGER SAYS", "LESSONS FROM THE FLOOR", "THE LONG APPRENTICESHIP", "AFTER THE GRANT", "THE NEXT RIVER", "OPEN DOORS, ODD HOURS"],
    ikick: ["THE EARLY YEARS", "ON PARENTS", "ON MONEY", "ON QUITTING", "WHAT COMES NEXT", "THE USES OF BOREDOM"],
    sbT: ["BY THE NUMBERS", "AT A GLANCE"],
    sbI: [
      "{num} members on the current roster",
      "{num} {unit} finished since {year}",
      "{money} raised at the annual auction",
      "{pct} of costs covered by dues",
      "{num} school visits each season",
      "3 buildings, 1 leaking roof, {num} keys",
      "{num} boxes of records in the archive",
    ],
    sf: [
      "Inside {org}, the {city} outfit that turned patience into a working business model — and what its slow arithmetic says about second chances.",
      "{org} was supposed to fail within a year. A decade on, its {city} workshop has a waiting list, a ledger in the black and a stubborn theory of work.",
      "No investors, no hurry, no plan B. How a shed in {city} became {org} — and why its members would not have it any other way.",
    ],
    sfi: [
      "Two decades of evenings at {org} have left {P1} with firm opinions about teenagers, parents and the uses of boredom. A conversation.",
      "{P1} has watched a generation pass through {org}’s {city} workshop. We asked what parents keep getting wrong.",
    ],
    edited: [
      "This conversation has been edited for length and clarity.",
      "The conversation below has been condensed and lightly edited.",
    ],
    mags: ["MERIDIAN MONTHLY", "THE LEDGER REVIEW", "COAST & CANOPY", "BASELINE QUARTERLY"],
    secs: ["PROFILES", "FIELDWORK", "MAKERS", "LOCAL ECONOMIES"],
    months: ["MARCH", "APRIL", "MAY", "JUNE", "SEPTEMBER", "OCTOBER", "NOVEMBER"],
    authors: [["Camille", "Theroux"], ["Douglas", "Rand"], ["Priya", "Nair-Whitfield"], ["Sam", "Okonkwo"]],
    by: (a, ph, caps) => caps ? `BY ${a.toUpperCase()} · PHOTOGRAPHS BY ${ph.toUpperCase()}` : `By ${a} · Photographs by ${ph}`,
    caps1: [
      "{P1} at the {org} site in {city}, photographed last {season}.",
      "The {city} workshop of {org}, an hour before opening.",
      "Morning at {org}: coffee first, then the ledger.",
    ],
    caps0: [
      "{P1} at the {org} workshop in {city}, photographed by {photog}.",
      "{P1}, photographed at the {city} site last {season} by {photog}.",
    ],
    capsBand: [
      "Above: the workshop floor on a Tuesday evening.",
      "Tools logged and oiled at closing time.",
      "The {year} ledger, kept in pencil.",
      "Members at the {city} site before the morning shift.",
      "The waiting list, pinned by the door.",
    ],
    money: ["$40,000", "$85,000", "£18,500", "€60,000", "$120,000", "$9,500"],
    far: ["Osaka", "Reykjavik", "Valparaíso", "Tallinn", "Anchorage", "Perth"],
    seasons: ["spring", "summer", "autumn", "winter"],
    pctS: "%",
  };
  const FR = {
    cores: [
      "Quand {p1} a poussé la porte du site de {org}, à {city}, tout tenait encore sur un carnet à spirale.",
      "L’équipe compte aujourd’hui {num} membres, et la liste d’attente s’allonge chaque mois.",
      "Le premier essai a tenu une semaine ; le deuxième, à peine un mois.",
      "Les voisins étaient sceptiques, puis curieux, puis [[impossibles à tenir à l’écart]].",
      "Une subvention de {money} obtenue en {year} a changé la donne du jour au lendemain.",
      "Dès {year}, il a fallu déménager deux fois et user trois camionnettes.",
      "« On garde les prototypes ratés exprès, dit {p1}. Ils rappellent que rien n’était gagné. »",
      "{p2}, qui a rejoint l’équipe en {year}, assure encore l’ouverture et l’essentiel de la paperasse.",
      "Environ {pct} du budget part dans les matériaux ; le reste, c’est [[de l’entêtement et des outils prêtés]].",
      "Une bonne semaine, l’atelier sort {num} pièces, toutes notées à la main dans un cahier de toile.",
      "La mairie a proposé un bail sur un dépôt vide, à condition de refaire la toiture avant l’hiver.",
      "La presse spécialisée a parlé d’une idée désuète ; {p1} préfère le mot [[patiente]].",
      "Il y a eu des revers dont personne ne se vante : une cave inondée, un contrat perdu, un hiver sans chauffage.",
      "Ce qui frappe d’abord le visiteur, c’est l’odeur — la résine, la corde humide, le café fort — puis le bruit.",
      "Les commandes arrivent désormais de {far}, ce qui fait toujours rire {p2}.",
      "Le registre de {year} affiche un modeste excédent, [[le premier de l’histoire du groupe]].",
      "Rien ne se jette ici ; les pièces manquées finissent en cale-portes et en presse-papiers.",
      "{p1} garde une liste des erreurs punaisée au-dessus de l’établi, mise à jour [[plus souvent qu’on ne voudrait]].",
      "La prochaine ambition : un second site de l’autre côté de la rivière, budgété à {money} et déjà en retard.",
      "Un portrait dans *La Dépêche des Ateliers* a valu à l’équipe une semaine d’appels.",
      "Quoi qu’il arrive ensuite, le projet a déjà survécu à toutes les prédictions.",
    ],
    openers: [
      "Quand {p1} a poussé la porte du site de {org}, à {city}, tout tenait encore sur un carnet à spirale.",
      "La première chose que {p1} montre au visiteur de {org}, ce n’est pas l’atelier : c’est le registre.",
    ],
    acores: [], qs: [],
    pqs: [
      "« L’astuce, s’il y en a une, c’est d’être là en février. »",
      "« Personne ne se presse, et tout se fait. »",
      "« Chaque erreur est punaisée au-dessus de l’établi. »",
      "« On mesure l’année en choses réparées. »",
    ],
    kick: ["LE PREMIER HIVER", "CE QUE DIT LE REGISTRE", "L’ATELIER À L’AUBE", "LA SUITE DU CHANTIER", "UN LONG APPRENTISSAGE"],
    ikick: [],
    sbT: ["EN CHIFFRES", "REPÈRES"],
    sbI: [
      "{num} adhérents à ce jour",
      "{money} récoltés à la vente annuelle",
      "{pct} des coûts couverts par les cotisations",
      "{num} visites scolaires par saison",
      "{num} boîtes d’archives sous les combles",
    ],
    sf: [
      "Au cœur de {org}, à {city}, la patience est devenue un modèle économique. Récit d’une obstination.",
      "{org} devait fermer en un an. Dix ans plus tard, l’atelier de {city} affiche liste d’attente et comptes à l’équilibre.",
    ],
    sfi: [], edited: [],
    mags: ["REVUE HORIZON", "LES CAHIERS DU NORD"],
    secs: ["PORTRAITS", "TERRAIN"],
    months: ["MARS", "AVRIL", "MAI", "JUIN", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE"],
    authors: [["Claire", "Vasseur"], ["Marc-Antoine", "Deniau"]],
    by: (a, ph, caps) => caps ? `PAR ${a.toUpperCase()} · PHOTOGRAPHIES DE ${ph.toUpperCase()}` : `Par ${a} · Photographies de ${ph}`,
    caps1: [
      "{P1} sur le site de {org}, à {city}.",
      "L’atelier de {org} à {city}, une heure avant l’ouverture.",
    ],
    caps0: [],
    capsBand: [
      "Ci-dessus : l’atelier un mardi soir.",
      "Les outils huilés à la fermeture.",
      "Le registre de {year}, tenu au crayon.",
      "L’équipe de {city} avant la première tournée.",
    ],
    money: ["45 000 €", "120 000 €", "18 500 €", "60 000 €"],
    far: ["Kyoto", "Montréal", "Helsinki", "Porto"],
    seasons: ["au printemps", "en été", "à l’automne", "en hiver"],
    pctS: " %",
  };
  const ES = {
    cores: [
      "Cuando {p1} abrió por primera vez la nave de {org}, en {city}, todo cabía en una libreta de espiral.",
      "El grupo suma hoy {num} socios, y la lista de espera crece cada mes.",
      "El primer intento duró una semana; el segundo, apenas un mes.",
      "Los vecinos pasaron del recelo a la curiosidad, y de ahí a [[no faltar ni un sábado]].",
      "Una ayuda de {money} concedida en {year} cambió las cuentas de la noche a la mañana.",
      "Para {year} ya habían mudado dos veces de local y gastado tres furgonetas.",
      "«Guardamos los prototipos feos a propósito», dice {p1}. «Recuerdan que nada de esto era seguro».",
      "{p2}, que se incorporó en {year}, sigue abriendo por las mañanas y llevando el papeleo.",
      "Cerca del {pct} del presupuesto se va en materiales; el resto es [[terquedad y herramientas prestadas]].",
      "En una buena semana salen {num} piezas, todas anotadas a mano en un cuaderno de lona.",
      "El ayuntamiento ofreció la cesión de un depósito vacío, a cambio de arreglar el tejado antes del invierno.",
      "La prensa del gremio habló de una idea anticuada; {p1} prefiere la palabra [[paciente]].",
      "Hubo tropiezos que nadie presume: un sótano inundado, un contrato perdido, un invierno sin estufa.",
      "Lo primero que nota el visitante es el olor — resina, cuerda húmeda, café cargado — y luego el ruido.",
      "Ahora llegan encargos desde {far}, algo que a {p2} todavía le hace gracia.",
      "El libro de cuentas de {year} arroja un pequeño superávit, [[el primero de la historia del grupo]].",
      "Aquí no se tira nada; las piezas falladas acaban de tope de puerta o de pisapapeles.",
      "{p1} tiene una lista de errores clavada sobre el banco, actualizada [[más a menudo de lo que quisiera]].",
      "La próxima meta es una segunda nave al otro lado del río, presupuestada en {money} y ya con retraso.",
      "Un reportaje en *El Faro Semanal* trajo una semana de llamadas.",
      "Pase lo que pase, el proyecto ya ha sobrevivido a todos los pronósticos.",
    ],
    openers: [
      "Cuando {p1} abrió por primera vez la nave de {org}, en {city}, todo cabía en una libreta de espiral.",
      "Lo primero que {p1} enseña al visitante de {org} no es el taller: es el cuaderno de cuentas.",
    ],
    acores: [], qs: [],
    pqs: [
      "«El truco, si lo hay, es venir también en febrero.»",
      "«Aquí nadie corre, y todo se acaba haciendo.»",
      "«Cada error está clavado encima del banco.»",
      "«Medimos el año en cosas reparadas.»",
    ],
    kick: ["EL PRIMER INVIERNO", "LO QUE DICE EL CUADERNO", "EL TALLER AL ALBA", "LA PRÓXIMA NAVE", "UN LARGO APRENDIZAJE"],
    ikick: [],
    sbT: ["EN CIFRAS", "DE UN VISTAZO"],
    sbI: [
      "{num} socios en activo",
      "{money} recaudados en la subasta anual",
      "{pct} de los costes cubiertos por cuotas",
      "{num} visitas escolares por temporada",
      "{num} cajas de archivo en el altillo",
    ],
    sf: [
      "Dentro de {org}, en {city}, la paciencia se volvió oficio. Crónica de una terquedad.",
      "{org} iba a cerrar en un año. Una década después, la nave de {city} tiene lista de espera y cuentas en orden.",
    ],
    sfi: [], edited: [],
    mags: ["REVISTA COMARCA", "GACETA DEL SUR"],
    secs: ["PERFILES", "OFICIOS"],
    months: ["MARZO", "ABRIL", "MAYO", "JUNIO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE"],
    authors: [["Lucía", "Ferrán"], ["Pablo", "Iriarte"]],
    by: (a, ph, caps) => caps ? `POR ${a.toUpperCase()} · FOTOGRAFÍAS DE ${ph.toUpperCase()}` : `Por ${a} · Fotografías de ${ph}`,
    caps1: [
      "{P1} en la nave de {org}, en {city}.",
      "La nave de {org} en {city}, una hora antes de abrir.",
    ],
    caps0: [],
    capsBand: [
      "Arriba: el taller un martes por la tarde.",
      "Las herramientas, al cierre.",
      "El cuaderno de {year}, llevado a lápiz.",
      "El equipo de {city} antes del primer turno.",
    ],
    money: ["45.000 €", "120.000 €", "18.500 €", "60.000 €"],
    far: ["Kioto", "Rotterdam", "Montevideo", "Nápoles"],
    seasons: ["en primavera", "en verano", "en otoño", "en invierno"],
    pctS: " %",
  };

  const TOPICS_EN = [
    { org: "Fundy Loom Energy", city: "Parrsboro", p: [["Marguerite", "Ellison", "co-founder"], ["Tomas", "Reyes", "operations lead"]], things: ["tidal loom", "turbine cradle", "shore station"], unit: "cradles", iv: false,
      hl: ["What the Tide Knows —/and What It {Owes} Us", "The Slow {Current}/of Parrsboro", "Waiting on the {Water}/to Pay"] },
    { org: "Aurora Rail Collective", city: "Innsbruck", p: [["Petra", "Lindqvist", "founder"], ["Marco", "Sassoli", "timetable chief"]], things: ["night service", "sleeper carriage", "dining car"], unit: "carriages", iv: false,
      hl: ["Sleeping Through {Borders}", "The 23:40/to {Anywhere}", "Second Life of the/{Night} Train"] },
    { org: "Spore & Vault", city: "Detroit", p: [["Aisha", "Bell", "co-founder"], ["Ray", "Kowalski", "grow-room manager"]], things: ["grow room", "fruiting tunnel", "spawn library"], unit: "trays", iv: false,
      hl: ["A Harvest/Under the {Street}", "Mushrooms in/the {Vault}", "The Basement That/Feeds a {Block}"] },
    { org: "Scaffold Lab", city: "Dearborn", p: [["Harlan", "Voss", "founder and lead instructor"], ["June", "Okafor", "program director"]], things: ["evening workshop", "build floor", "tool library"], unit: "kits", iv: true,
      hl: ["What Teenagers Build/When {Nobody}/Grades Them", "The Case for/{Unfinished} Things", "After School,/the {Real} Curriculum"] },
    { org: "Lantern Ledger Project", city: "Aberdeen", p: [["Fiona", "Macrae", "archivist"], ["Ewan", "Petrie", "volunteer coordinator"]], things: ["keeper’s log", "scanning bench", "salt-stained page"], unit: "logs", iv: false,
      hl: ["Reading the/{Storm} Years", "Every Keeper/Kept a {Secret}", "The Lighthouse/Wrote It {Down}"] },
    { org: "Pannier & Co.", city: "Portland", p: [["Dov", "Aronson", "frame builder"], ["Lena", "Marsh", "paint-shop lead"]], things: ["frame jig", "brazing bench", "paint booth"], unit: "frames", iv: false,
      hl: ["Steel Is {Patient}", "A Bicycle Takes/a {Year}", "The Last Frame Builders/of {Oak} Street"] },
    { org: "Harbor Apprentice School", city: "Gloucester", p: [["Nora", "Calloway", "director"], ["Sam", "Duarte", "boatwright"]], things: ["boat shed", "bevel gauge", "launch day"], unit: "skiffs", iv: true,
      hl: ["The School Where/the {Test} Floats", "Teenagers, Tide Tables/and {Trust}", "Building a Boat,/{Backwards}"] },
  ];
  const TOPICS_FR = [
    { org: "la Coopérative du Val Doré", city: "Poligny", p: [["Élodie", "Marchand", ""], ["Bastien", "Roche", ""]], things: [], unit: "meules", iv: false,
      hl: ["Le temps long/du {Val} Doré", "La cave/qui {attend}", "Vingt mois/sous la {montagne}"] },
    { org: "l’Atelier des Berges", city: "Lille", p: [["Nour", "Benali", ""], ["Théo", "Lefebvre", ""]], things: [], unit: "pièces", iv: false,
      hl: ["Rendre le canal/aux {riverains}", "L’eau revient/à {Lille}", "Chantier sur/la {Deûle}"] },
  ];
  const TOPICS_ES = [
    { org: "Taller Esparto Vivo", city: "Cieza", p: [["Remedios", "Ortega", ""], ["Julián", "Cano", ""]], things: [], unit: "piezas", iv: false,
      hl: ["El oficio que/no quiso {morir}", "Esparto, paciencia/y {agua}", "Las manos/de {Cieza}"] },
    { org: "Colectivo Marisma", city: "Cádiz", p: [["Marina", "Robles", ""], ["Andrés", "Quintero", ""]], things: [], unit: "fichas", iv: false,
      hl: ["Contar pájaros/para {salvarlos}", "La marisma llevaba/la {cuenta}", "Amanecer en/la {salina}"] },
  ];
  const PHOTOGS = ["D. Okafor", "R. Salvesen", "T. Ibáñez", "K. Marchetti"];
  const NUMS = [12, 18, 24, 30, 40, 48, 60, 80, 90, 120, 150, 200, 240, 300, 360, 420];
  const PCTS = [15, 20, 25, 30, 35, 40, 45, 55, 60, 70, 80];

  // ---------------- seed knobs ----------------
  const langR = rng();
  const lang = langR < 0.72 ? "en" : langR < 0.86 ? "fr" : "es";
  const L = lang === "en" ? EN : lang === "fr" ? FR : ES;
  let mode = ri(0, 2);                       // 0 interview / 1 feature-photoRight / 2 banner
  if (lang !== "en" && mode === 0) mode = ri(1, 2);
  const T = mode === 0 ? pick(TOPICS_EN.filter((t) => t.iv))
    : pick(lang === "en" ? TOPICS_EN : lang === "fr" ? TOPICS_FR : TOPICS_ES);
  const p1 = { f: T.p[0][0], l: T.p[0][1], role: T.p[0][2] };
  const p2 = { f: T.p[1][0], l: T.p[1][1] };

  const serifBody = rng() < 0.62;
  const bodyFam = serifBody ? "Georgia, 'Times New Roman', serif" : "Helvetica, Arial, sans-serif";
  const dispPick = ri(0, 2);
  const dispFam = ["Georgia, 'Times New Roman', serif", "Helvetica, Arial, sans-serif", "'Arial Narrow', Arial, sans-serif"][dispPick];
  const dispCw = [0.55, 0.54, 0.47][dispPick];
  const bodyCw = serifBody ? 0.55 : 0.53;
  const accent = pick(["#e07020", "#0f7f7a", "#b3282d", "#1f4e8c", "#7a4b9b", "#b8860b"]);
  const paper = pick(["#ffffff", "#fffdf6", "#fbfaf5"]);
  const ink = pick(["#1a1a1a", "#222222", "#26221e"]);
  const bodyPt = (mode === 2 ? rf(7.3, 8.3) : rf(6.7, 7.7));
  const cols = mode === 2 ? ri(5, 7) : ri(3, 4);
  const colRule = rng() < 0.5;
  const pqCount = ri(1, 2);
  const pqItalic = rng() < 0.6;
  const pqAttr = rng() < 0.45;
  const sidebar = mode !== 0 && rng() < 0.65;
  const sbOrdered = rng() < 0.3;
  const capsByline = rng() < 0.55;
  const footStyle = ri(0, 1);                 // 0 numbers only, 1 num+mag / issue+num
  const fold = rng() < 0.7;
  const accentHead = rng() < 0.75;
  // emphasis-marker resolution weights ([[..]] -> u / b / i / plain)
  const eu = rf(0.1, 0.5), eb = rf(0.05, 0.3), eiW = rf(0.05, 0.25);
  const statBoldP = rf(0, 0.3);

  // ---------------- slot filling ----------------
  let m1 = false, m2 = false;
  const season = () => pick(L.seasons);
  const mention1 = () => { if (!m1) { m1 = true; return `**${p1.f} ${p1.l}**`; } return p1.l; };
  const mention2 = () => { if (!m2) { m2 = true; return `**${p2.f} ${p2.l}**`; } return p2.l; };
  const stat = (s) => (rng() < statBoldP ? `**${s}**` : s);
  function fill(t) {
    return t
      .replace(/\[\[(.+?)\]\]/g, (m, x) => { const r = rng(); return r < eu ? `<u>${x}</u>` : r < eu + eb ? `**${x}**` : r < eu + eb + eiW ? `*${x}*` : x; })
      .replace(/\{p1\}/g, () => mention1())
      .replace(/\{p2\}/g, () => mention2())
      .replace(/\{P1\}/g, () => `${p1.f} ${p1.l}`)
      .replace(/\{org\}/g, () => T.org)
      .replace(/\{city\}/g, () => T.city)
      .replace(/\{thing\}/g, () => (T.things.length ? pick(T.things) : "projet"))
      .replace(/\{unit\}/g, () => T.unit)
      .replace(/\{far\}/g, () => pick(L.far))
      .replace(/\{num\}/g, () => stat(String(pick(NUMS))))
      .replace(/\{pct\}/g, () => stat(pick(PCTS) + L.pctS))
      .replace(/\{money\}/g, () => stat(pick(L.money)))
      .replace(/\{year\}/g, () => String(ri(2003, 2024)))
      .replace(/\{season\}/g, () => season())
      .replace(/\{photog\}/g, () => pick(PHOTOGS));
  }
  function deck(arr) {
    // round-robin blocks: each block is one full shuffled copy, so a given core
    // can only recur ~arr.length draws later (no A-B-A clusters within a page)
    let d = [];
    return () => {
      if (!d.length) d = shuffle(arr);
      return d.pop();
    };
  }
  const coreDraw = deck(L.cores);
  const aDraw = lang === "en" ? deck(EN.acores) : null;

  const mdInline = (s) => s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");

  // ---------------- furniture / head matter ----------------
  const mag = pick(L.mags);
  const sec = pick(L.secs);
  const issue = `${pick(L.months)} ${ri(2019, 2025)}`;
  const headerMd = `**${mag}** · ${sec} · ${issue}`;
  const author = pick(L.authors).join(" ");
  const photog = pick(PHOTOGS);
  const bylineTxt = L.by(author, photog, capsByline);
  const hlRaw = pick(T.hl);
  const hlLines = hlRaw.split("/").map((s) => s.trim());
  const hlMd = `# ${hlLines.join(" ").replace(/[{}]/g, "")}`;
  const sfRaw = fill(mode === 0 ? pick(EN.sfi) : pick(L.sf));
  const pageL = ri(2, 40) * 2, pageR = pageL + 1;
  const footLMd = footStyle === 0 ? `${pageL}` : `${pageL} · ${mag}`;
  const footRMd = footStyle === 0 ? `${pageR}` : `${issue} · ${pageR}`;

  // ---------------- geometry (mm) ----------------
  const PW = 420, PH = 297, PADX = 10, PADT = 9, PADB = 8;
  const lineH = bodyPt * 1.34 * MM;
  let regionW, colsH, photoW = 0, bandH = 0, bandN = 0;
  if (mode !== 2) {
    photoW = ri(152, 176);
    regionW = PW - photoW - PADX - 6;
  } else {
    regionW = PW - 2 * PADX;
    bandH = ri(55, 72);
    bandN = ri(2, 3);
  }
  const hlMaxChars = Math.max(...hlLines.map((s) => s.replace(/[{}]/g, "").length));
  const headBase = mode === 2 ? rf(40, 52) : rf(28, 38);
  const headPt = Math.max(22, Math.min(headBase, (mode === 2 ? regionW * 0.94 : regionW) / (hlMaxChars * MM * dispCw)));
  const headH = hlLines.length * headPt * 1.06 * MM + 4;
  const sfPt = rf(10, 11.8);
  const sfW = mode === 2 ? regionW * 0.62 : regionW;
  const sfLines = Math.ceil(sfRaw.replace(/\*\*|\*|<\/?u>/g, "").length / (sfW / (sfPt * MM * 0.52)));
  const sfH = sfLines * sfPt * 1.35 * MM + 3;
  const bylineH = 6;
  const headerH = 6.5;
  const colsTop = PADT + headerH + headH + sfH + bylineH + 3;
  colsH = PH - PADB - colsTop - 5 - (mode === 2 ? bandH + 4 : 0);
  const colGap = rf(4, 5.5);
  const colW = (regionW - colGap * (cols - 1)) / cols;
  const cpl = Math.max(18, Math.floor(colW / (bodyPt * MM * bodyCw)));
  const capacity = Math.floor(colsH / lineH) * cols;
  const budget = capacity * (mode === 2 ? 0.94 : 0.9);

  // ---------------- body build ----------------
  const blocks = []; // {html, md}
  let used = 0;
  const paraGap = mode === 0 ? 0.45 : 0.15;
  const est = (txt) => Math.ceil(txt.replace(/\*\*|\*|<\/?u>/g, "").length / cpl) + paraGap;
  const kickDeck = deck(mode === 0 ? EN.ikick : L.kick);
  const pqDeck = deck(L.pqs);
  const pqAt = [0.3, 0.66].slice(0, pqCount).map((f) => f * budget);
  let pqDone = 0;
  let sbAt = sidebar ? 0.5 * budget : -1;

  function pushPara(txt, cls) {
    blocks.push({ html: `<p${cls ? ` class="${cls}"` : ""}>${mdInline(txt)}</p>`, md: txt, t: "p" });
    used += est(txt);
  }
  function pushKick() {
    const k = kickDeck();
    blocks.push({ html: `<div class="kick"><span class="ksq"></span><b>${k}</b></div>`, md: `## ${k}`, t: "k" });
    used += 3;
  }
  function pushPQ() {
    const q = pqDeck();
    const inner = pqItalic ? `*${q}*` : q;
    let md = `> ${inner}`;
    let attrHtml = "";
    if (pqAttr) { const who = `— ${p1.f} ${p1.l}`; md += `\n> ${who}`; attrHtml = `<div class="pqa">${who}</div>`; }
    blocks.push({ html: `<div class="pq"><div class="pqt">${mdInline(inner)}</div>${attrHtml}</div>`, md, t: "q" });
    used += 11 + (pqAttr ? 2 : 0);
  }
  function pushSidebar() {
    const title = pick(L.sbT);
    const items = shuffle(L.sbI).slice(0, ri(4, 6)).map((i) => fill(i));
    const tag = sbOrdered ? "ol" : "ul";
    const lis = items.map((i) => `<li>${mdInline(i)}</li>`).join("");
    const mdList = items.map((i, ix) => (sbOrdered ? `${ix + 1}. ${i}` : `- ${i}`)).join("\n");
    blocks.push({ html: `<div class="sb"><div class="sbt">${title}</div><${tag}>${lis}</${tag}></div>`, md: `### ${title}\n\n${mdList}`, t: "s" });
    used += 5 + items.length * 1.7;
  }
  const maybeInserts = () => {
    if (pqDone < pqAt.length && used >= pqAt[pqDone]) { pushPQ(); pqDone++; }
    if (sbAt > 0 && used >= sbAt) { pushSidebar(); sbAt = -1; }
  };

  if (mode === 0) {
    // ---- interview: intro narrator paras, edited-note, kickered Q&A ----
    pushPara(fill(pick(EN.openers)) + " " + [fill(coreDraw()), fill(coreDraw())].join(" "), "dc");
    pushPara([fill(coreDraw()), fill(coreDraw()), fill(coreDraw())].join(" "));
    const edited = pick(EN.edited);
    blocks.push({ html: `<p class="ed"><i>${edited}</i></p>`, md: `*${edited}*`, t: "p" });
    used += est(edited) + 0.6;
    const qDeck = deck(EN.qs, 1);
    let qSince = 0, qN = 0;
    pushKick();
    let guard = 0;
    while (used < budget - 8 && qN < 12 && guard++ < 200) {
      if (qSince >= ri(3, 4) && used < budget - 20) { pushKick(); qSince = 0; }
      const q = fill(qDeck());
      blocks.push({ html: `<p class="qq"><b>${q}</b></p>`, md: `**${q}**`, t: "p" });
      used += est(q) + 0.5;
      const n = ri(3, 6);
      const sents = [];
      for (let i = 0; i < n; i++) sents.push(fill(aDraw()));
      pushPara(`**${p1.l}:** ` + sents.join(" "), "ans");
      if (rng() < 0.3 && used < budget - 16) {
        const m = ri(2, 4), s2 = [];
        for (let i = 0; i < m; i++) s2.push(fill(aDraw()));
        pushPara(s2.join(" "), "ans");
      }
      maybeInserts();
      qSince++; qN++;
    }
    // narrator coda if the question deck ran out before the budget did
    if (used < budget - 14) pushKick();
    let coda = 0;
    while (used < budget - 8 && coda++ < 6) {
      const n = ri(3, 5), sents = [];
      for (let i = 0; i < n; i++) sents.push(fill(coreDraw()));
      pushPara(sents.join(" "));
    }
  } else {
    // ---- feature: drop cap, crossheads, pull quotes, sidebar ----
    pushPara(fill(pick(L.openers)) + " " + [fill(coreDraw()), fill(coreDraw()), fill(coreDraw())].join(" "), "dc");
    let sinceHead = 0, guard = 0;
    while (used < budget - 6 && guard++ < 300) {
      if (blocks.length >= 2 && sinceHead >= ri(3, 5) && used < budget - 16) { pushKick(); sinceHead = 0; }
      const n = ri(3, 6);
      const sents = [];
      for (let i = 0; i < n; i++) sents.push(fill(coreDraw()));
      pushPara(sents.join(" "));
      maybeInserts();
      sinceHead++;
    }
  }
  // end mark on last paragraph
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].t === "p") {
      blocks[i].md += " ■";
      blocks[i].html = blocks[i].html.replace(/<\/p>$/, `<span style="color:${accent}"> ■</span></p>`);
      break;
    }
  }

  // ---------------- photo / captions ----------------
  const pal = pick([["#8a8f83", "#5c6157", "#3f443c"], ["#9a8f7a", "#6e6353", "#4a4238"], ["#7d8b95", "#54616c", "#39424a"], ["#8f7f88", "#5f5560", "#403944"]]);
  const photoBg = `linear-gradient(${ri(130, 200)}deg, ${pal[0]} 0%, ${pal[1]} 55%, ${pal[2]} 100%)`;
  const photoShapes = `<div class="ph-sh" style="left:${ri(8, 40)}%;top:${ri(6, 30)}%;width:${ri(18, 40)}%;height:${ri(20, 46)}%"></div><div class="ph-sh" style="left:${ri(45, 70)}%;top:${ri(35, 60)}%;width:${ri(14, 30)}%;height:${ri(16, 34)}%"></div>`;
  let photoHtml = "", tailMd = [];
  if (mode === 0) {
    const nameCaps = `${p1.f} ${p1.l}`.toUpperCase();
    const role = p1.role.charAt(0).toUpperCase() + p1.role.slice(1) + ", " + T.org;
    const cap = fill(pick(EN.caps0));
    photoHtml = `<div class="photo"><div class="ph-fill"></div>${photoShapes}<div class="band"><div class="nm"><b>${nameCaps}</b></div><div class="rl">${role}</div><div class="cap"><i>${cap}</i></div></div></div>`;
    tailMd = [`**${nameCaps}**`, role, `*${cap}*`];
  } else if (mode === 1) {
    const cap = fill(pick(L.caps1));
    photoHtml = `<div class="photo"><div class="ph-fill"></div>${photoShapes}<div class="band"><div class="cap"><i>${cap}</i></div></div></div>`;
    tailMd = [`*${cap}*`];
  } else {
    const capsPool = shuffle(L.capsBand);
    let cells = "";
    for (let i = 0; i < bandN; i++) {
      const cap = fill(capsPool[i % capsPool.length]);
      const p2c = pick([["#8a8f83", "#5c6157", "#3f443c"], ["#9a8f7a", "#6e6353", "#4a4238"], ["#7d8b95", "#54616c", "#39424a"]]);
      cells += `<div class="bph" style="width:${(100 / bandN - 1.2).toFixed(2)}%"><div class="bph-img" style="background:linear-gradient(${ri(130, 200)}deg,${p2c[0]},${p2c[1]} 55%,${p2c[2]})"></div><div class="bcap"><i>${cap}</i></div></div>`;
      tailMd.push(`*${cap}*`);
    }
    photoHtml = `<div class="bandrow">${cells}</div>`;
  }

  // ---------------- GT assembly ----------------
  const gtBlocks = [headerMd, hlMd, `*${sfRaw}*`, `**${bylineTxt}**`];
  for (const b of blocks) gtBlocks.push(b.md);
  gtBlocks.push(...tailMd, footLMd, footRMd);
  const gt = gtBlocks.join("\n\n");

  // ---------------- HTML ----------------
  const hlHtml = hlLines.map((ln) =>
    `<div>${ln.replace(/\{(.+?)\}/g, accentHead ? `<span style="color:${accent}">$1</span>` : "$1")}</div>`).join("");
  const bodyHtml = blocks.map((b) => b.html).join("\n");
  const txtLeft = mode !== 2;
  const html = `<meta charset="utf-8">
<style>
@page { size: 420mm 297mm; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; width: 420mm; height: 297mm; background: ${paper}; color: ${ink}; font-family: ${bodyFam}; }
.pg { position: relative; width: 420mm; height: 297mm; overflow: hidden; }
.txt { position: absolute; top: ${PADT}mm; left: ${txtLeft ? PADX + "mm" : PADX + "mm"}; width: ${regionW}mm; }
.hdr { height: ${headerH}mm; font-family: Helvetica, Arial, sans-serif; font-size: 7pt; letter-spacing: 0.12em; color: #555; border-bottom: 0.25mm solid ${accent}; padding-bottom: 1mm; }
.hdr b { color: ${ink}; }
.hl { height: ${headH.toFixed(1)}mm; overflow: hidden; font-family: ${dispFam}; font-weight: 800; font-size: ${headPt.toFixed(1)}pt; line-height: 1.04; letter-spacing: -0.012em; margin-top: 1.5mm; ${mode === 2 ? "text-align:center;" : ""} }
.sf { height: ${sfH.toFixed(1)}mm; overflow: hidden; font-size: ${sfPt.toFixed(1)}pt; line-height: 1.32; font-style: italic; color: #3a3a3a; ${mode === 2 ? `width:${sfW.toFixed(1)}mm;margin:0 auto;text-align:center;` : `width:${sfW.toFixed(1)}mm;`} }
.by { height: ${bylineH}mm; font-family: Helvetica, Arial, sans-serif; font-size: 6.8pt; letter-spacing: 0.1em; font-weight: bold; padding-top: 1.2mm; ${mode === 2 ? "text-align:center;" : ""} }
.cols { height: ${colsH.toFixed(1)}mm; overflow: hidden; column-count: ${cols}; column-gap: ${colGap.toFixed(1)}mm; ${colRule ? "column-rule: 0.15mm solid #c9c5bc;" : ""} column-fill: auto; font-size: ${bodyPt.toFixed(2)}pt; line-height: 1.3; text-align: justify; margin-top: 2mm; }
.cols p { margin: 0 0 ${mode === 0 ? "0.45em" : "0"}; ${mode !== 0 ? "text-indent: 3.2mm;" : ""} }
.cols p.dc { text-indent: 0; }
.cols p.dc::first-letter { float: left; font-family: ${dispFam}; font-size: 3.6em; line-height: 0.82; padding: 0.02em 0.08em 0 0; font-weight: 800; color: ${accentHead ? accent : ink}; }
.cols p.ed { text-indent: 0; margin: 0.5em 0 0.9em; color: #555; }
.cols p.qq { text-indent: 0; margin: 0.9em 0 0.35em; ${rng() < 0.4 ? `color:${accent};` : ""} }
.kick { margin: ${mode === 0 ? "1.4em 0 0.6em" : "1.2em 0 0.5em"}; font-family: Helvetica, Arial, sans-serif; font-size: ${(bodyPt + 0.8).toFixed(1)}pt; letter-spacing: 0.14em; color: ${accent}; break-after: avoid; }
.ksq { display: inline-block; width: 2.4mm; height: 2.4mm; background: ${accent}; margin-right: 1.6mm; vertical-align: -0.25mm; ${rng() < 0.5 ? "border-radius:50%;" : ""} }
.pq { break-inside: avoid; border-top: 0.5mm solid ${accent}; border-bottom: 0.15mm solid #bbb; padding: 2.2mm 1mm 2.4mm; margin: 2.4mm 0; font-family: ${dispFam}; font-size: ${(bodyPt * 1.75).toFixed(1)}pt; line-height: 1.18; font-weight: ${rng() < 0.5 ? 700 : 400}; text-align: left; text-indent: 0; }
.pq .pqt i { font-style: italic; }
.pqa { font-family: Helvetica, Arial, sans-serif; font-size: ${(bodyPt * 0.95).toFixed(1)}pt; font-weight: 400; letter-spacing: 0.08em; color: #666; margin-top: 1.6mm; }
.sb { break-inside: avoid; background: ${pick(["#f4f1e8", "#eef2f1", "#f5eee9"])}; border: 0.3mm solid ${accent}; padding: 2.4mm 2.6mm; margin: 2.4mm 0; text-align: left; }
.sbt { font-family: Helvetica, Arial, sans-serif; font-weight: bold; font-size: ${(bodyPt + 0.6).toFixed(1)}pt; letter-spacing: 0.14em; color: ${accent}; margin-bottom: 1.4mm; }
.sb ul, .sb ol { margin: 0; padding-left: 4mm; }
.sb li { margin: 0 0 0.9mm; text-indent: 0; text-align: left; }
.photo { position: absolute; top: 0; right: 0; width: ${photoW}mm; height: 297mm; background: ${photoBg}; }
.ph-fill { position: absolute; inset: 0; background: radial-gradient(ellipse at ${ri(20, 80)}% ${ri(15, 45)}%, rgba(255,255,255,0.22), rgba(0,0,0,0) 55%); }
.ph-sh { position: absolute; background: rgba(255,255,255,0.09); border: 0.3mm solid rgba(255,255,255,0.13); }
.band { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(15,17,20,0.6); color: #fff; padding: 3mm 5mm 6mm; }
.nm { font-family: ${dispFam}; font-size: ${rf(15, 20).toFixed(1)}pt; letter-spacing: 0.06em; }
.rl { font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; letter-spacing: 0.08em; margin-top: 1mm; color: #e8e4da; }
.cap { font-size: 6.6pt; margin-top: 1.6mm; color: #cfcabe; }
.bandrow { position: absolute; left: ${PADX}mm; right: ${PADX}mm; bottom: ${PADB + 4}mm; height: ${bandH}mm; display: flex; justify-content: space-between; }
.bph { height: 100%; }
.bph-img { height: calc(100% - 7mm); }
.bcap { font-size: 6.6pt; color: #444; padding-top: 1mm; }
.footL { position: absolute; left: ${PADX}mm; bottom: 2.6mm; font-family: Helvetica, Arial, sans-serif; font-size: 6.5pt; letter-spacing: 0.08em; color: #444; }
.footR { position: absolute; right: ${mode === 2 ? PADX + "mm" : "5mm"}; bottom: 2.6mm; font-family: Helvetica, Arial, sans-serif; font-size: 6.5pt; letter-spacing: 0.08em; color: ${mode === 2 ? "#444" : "#f0ede6"}; ${mode !== 2 ? "text-shadow: 0 0 1mm rgba(0,0,0,0.5);" : ""} }
.fold { position: absolute; left: 205mm; top: 0; width: 10mm; height: 297mm; background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.07) 45%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.07) 55%, rgba(0,0,0,0) 100%); pointer-events: none; }
</style>
<div class="pg">
${mode !== 2 ? photoHtml : ""}
<div class="txt">
<div class="hdr"><b>${mag}</b> · ${sec} · ${issue}</div>
<div class="hl">${hlHtml}</div>
<div class="sf">${mdInline(sfRaw)}</div>
<div class="by">${bylineTxt}</div>
<div class="cols">
${bodyHtml}
</div>
</div>
${mode === 2 ? photoHtml : ""}
${fold ? '<div class="fold"></div>' : ""}
<div class="footL">${footLMd}</div>
<div class="footR">${footRMd}</div>
</div>`;

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
