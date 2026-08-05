// Builds a logical table as an explicit list of visual rows, where each row is
// a list of cells { tag: 'th'|'td', text, colspan, rowspan, align }. Both the
// ground-truth serializer and the styled-document renderer iterate this same
// structure, so the rendered PDF and the ground truth can never disagree.

import { Faker, en } from "@faker-js/faker";
import { makeColumn, LABEL_KINDS, DATA_KINDS, randomTableTitle } from "./content.mjs";

// A body cell whose entire content is the token "<<" (one or more) is a
// horizontal merge marker: it is absorbed into the real cell on its left,
// widening that cell's colspan. Used by the complex-cells LLM table path.
const isMergeLeft = (s) => /^<{2,}$/.test(String(s ?? "").trim());

// Leading spaces in a first-column label encode hierarchy depth (2 spaces per
// level, e.g. "  Cash" under "Current Assets"). Returns the nesting level; the
// spaces are stripped from the text and re-expressed as a render-only `indent`
// (the PDF indents the cell, the ground-truth cell text stays clean — same as
// how `align` is render-only). A single stray space (level 0) is ignored.
const indentLevel = (s) => {
    const m = /^( +)/.exec(String(s ?? ""));
    return m ? Math.min(4, Math.floor(m[1].length / 2)) : 0;
};

export function generateTableModel(rng) {
    const ncols = rng.weighted([
        [2, 1], [3, 3], [4, 4], [5, 4], [6, 3], [7, 2], [8, 2], [10, 1], [12, 1],
    ]);
    const nrows = rng.weighted([
        [3, 2], [4, 3], [6, 4], [8, 4], [10, 3], [14, 2], [20, 2], [28, 1],
    ]);

    // One currency per table so money columns don't mix $/€/£ within one table.
    const tableCurrency = rng.pick(["$", "€", "£", "¥"]);
    // Column profiles: first column is a label-ish kind, the rest are data kinds.
    const columns = [];
    columns.push(makeColumn(rng, rng.pick(LABEL_KINDS), 0, tableCurrency));
    for (let c = 1; c < ncols; c++) {
        columns.push(makeColumn(rng, rng.pick(DATA_KINDS), c, tableCurrency));
    }

    const rows = [];

    // (1) Optional spanning title row across the full width.
    const hasTitle = rng.bool(0.4);
    const titleRows = hasTitle ? 1 : 0;
    if (hasTitle) {
        rows.push([{ tag: "th", text: randomTableTitle(rng), colspan: ncols, rowspan: 1, align: "center", role: "title" }]);
    }

    // (2) Optional two-level column-group header (colspan groups), only for wider tables.
    const hasGroups = ncols >= 4 && rng.bool(0.28);
    if (hasGroups) {
        rows.push(buildGroupHeaderRow(rng, ncols));
    }

    // (3) The column header row.
    rows.push(columns.map((col) => ({ tag: "th", text: col.header, colspan: 1, rowspan: 1, align: col.align, role: "header" })));

    // (4) Body rows. Optionally group consecutive rows under a rowspan label in col 0.
    const hasRowspan = !hasGroups && ncols >= 3 && nrows >= 6 && rng.bool(0.22);
    if (hasRowspan) {
        buildGroupedBody(rng, columns, nrows, rows);
    } else {
        for (let r = 0; r < nrows; r++) {
            rows.push(columns.map((col) => ({ tag: "td", text: col.gen(), colspan: 1, rowspan: 1, align: col.align, role: "body" })));
        }
    }

    const difficulty = classifyDifficulty({ ncols, nrows, hasTitle, hasGroups, hasRowspan });

    const flags = { table_difficulty: difficulty };
    if (titleRows > 0) {
        flags.max_top_title_rows = titleRows;
    }

    return {
        ncols,
        nrows,
        rows,
        columns,
        flags,
        meta: { hasTitle, hasGroups, hasRowspan },
    };
}

// A group-header row: partition the columns into 2-4 spans whose colspans sum
// to ncols. The first column is usually left as a standalone label spacer.
function buildGroupHeaderRow(rng, ncols) {
    const cells = [];
    let remaining = ncols;
    // leading standalone cell for the row-label column
    if (rng.bool(0.6)) {
        cells.push({ tag: "th", text: "", colspan: 1, rowspan: 1, align: "left", role: "group" });
        remaining -= 1;
    }
    const groupNames = rng.shuffle(["2023", "2024", "Actual", "Budget", "Forecast", "Domestic", "International", "H1", "H2", "Prior", "Current"]);
    let gi = 0;
    while (remaining > 0) {
        const span = remaining <= 2 ? remaining : rng.int(1, Math.min(3, remaining - 1));
        cells.push({ tag: "th", text: groupNames[gi % groupNames.length], colspan: span, rowspan: 1, align: "center", role: "group" });
        remaining -= span;
        gi += 1;
    }
    return cells;
}

// Body where the first column is a rowspan label spanning a group of rows.
function buildGroupedBody(rng, columns, nrows, rows) {
    const labelCol = columns[0];
    let produced = 0;
    while (produced < nrows) {
        const groupSize = Math.min(rng.int(2, 4), nrows - produced);
        const groupLabel = labelCol.gen() || "Group";
        for (let i = 0; i < groupSize; i++) {
            const cells = [];
            if (i === 0) {
                cells.push({ tag: "td", text: groupLabel, colspan: 1, rowspan: groupSize, align: labelCol.align, role: "body" });
            }
            // remaining columns (skip col 0, which is covered by the rowspan)
            for (let c = 1; c < columns.length; c++) {
                cells.push({ tag: "td", text: columns[c].gen(), colspan: 1, rowspan: 1, align: columns[c].align, role: "body" });
            }
            rows.push(cells);
        }
        produced += groupSize;
    }
}

function classifyDifficulty({ ncols, nrows, hasTitle, hasGroups, hasRowspan }) {
    if (hasGroups || hasRowspan || ncols >= 8) {
        return "hard";
    }
    if (hasTitle || ncols >= 6 || nrows >= 12) {
        return "medium";
    }
    return "easy";
}

// ---- Convert an LLM-produced section.table into a cell model. -------------

const NUMERIC_RE = /^[\s(]*[-+$€£¥₹]?\s*\d[\d,.\s]*%?\)?$|^\(?\$?[\d,.]+\)?$|:\d\d$/;

function columnIsNumeric(rows, colIndex) {
    let numeric = 0;
    let nonEmpty = 0;
    for (const r of rows) {
        // Strip inline markup before testing: a bold total (<strong>1,234</strong>)
        // or a footnote-marked figure (84.7%<sup>1</sup>) is still a number, so the
        // column must read as numeric (and right-align). Drop <sup>…</sup> markers
        // whole; keep the content of emphasis tags.
        const v = (r[colIndex] || "").replace(/<sup>.*?<\/sup>/gi, "").replace(/<[^>]+>/g, "").trim();
        if (!v) {
            continue;
        }
        nonEmpty += 1;
        if (NUMERIC_RE.test(v)) {
            numeric += 1;
        }
    }
    return nonEmpty > 0 && numeric / nonEmpty >= 0.6;
}

// --- Programmatic row generation for huge dense tables ----------------------
// The LLM returns column "spec" strings + a rowCount instead of writing every
// cell, so we can synthesize 20x200 tables cheaply and deterministically.

const GEN_FIRST = ["James", "Maria", "Wei", "Aisha", "Carlos", "Ingrid", "Tom", "Priya", "Lukas", "Sofia", "Omar", "Nina", "Diego", "Yuki", "Hassan", "Elena", "Sven", "Mei", "Raj", "Anna", "Pavel", "Leila", "Marco", "Fatima", "Kenji", "Grace", "Tariq", "Olga", "Hugo", "Sara", "Niall", "Zoe", "Felix", "Amara", "Bjorn", "Lucia", "Idris", "Greta", "Pedro", "Hana"];
const GEN_LAST = ["Chen", "Patel", "Garcia", "Novak", "Okafor", "Tanaka", "Schmidt", "Rossi", "Andersson", "Kim", "Haddad", "Silva", "Murphy", "Larsen", "Ferrari", "Nguyen", "Dubois", "Costa", "Walsh", "Ivanov", "Mwangi", "Bauer", "Reyes", "Khan", "Olsen", "Marino", "Fischer", "Santos", "Wright", "Hoffmann", "Mendez", "Park", "Lindqvist", "Abbas", "Romano"];
const GEN_WORDS = ["alpha", "north", "summit", "cedar", "atlas", "vega", "cobalt", "harbor", "pacific", "granite", "delta", "orion", "metro", "ridge", "aspen", "crimson", "ivory", "onyx", "willow", "basalt", "umber", "saffron", "indigo", "cinder", "marble", "quartz", "amber", "sable", "verde", "slate", "coral", "linen", "maple", "birch", "flint", "ember", "lunar", "solar", "terra", "nimbus"];

function gthousands(n) {
    // Group with thousands separators while PRESERVING the input's decimal places
    // — a plain toLocaleString re-parses through Number and drops trailing zeros,
    // so a currency formatted to 2 dp (e.g. "4410.30") would render "$4,410.3"
    // (or "$1,800" for ".00"). Keep exactly as many decimals as the input has.
    const s = String(n);
    const dot = s.indexOf(".");
    const dec = dot >= 0 ? s.length - dot - 1 : 0;
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function gnum(s) {
    const neg = /^\(.*\)$/.test(String(s));
    const v = Number(String(s).replace(/[^0-9.\-]/g, "")) || 0;
    return neg ? -Math.abs(v) : v;
}

// Generate one cell from a colon-delimited spec string. `prior` holds the
// already-generated cells in the current row (for formula columns); `faker` is a
// seeded Faker instance for realistic names/companies/strings.
function genCell(spec, i, rng, prior, faker) {
    const p = String(spec || "text").split(":");
    const kind = p[0];
    switch (kind) {
        case "int": return gthousands(rng.int(Number(p[1]) || 0, Number(p[2]) || 100));
        case "float": return gthousands((rng() * ((Number(p[2]) || 100) - (Number(p[1]) || 0)) + (Number(p[1]) || 0)).toFixed(Number(p[3]) ?? 2));
        case "currency": { const v = rng() * ((Number(p[2]) || 1000) - (Number(p[1]) || 0)) + (Number(p[1]) || 0); return `${p[4] || "$"}${gthousands(v.toFixed(Number(p[3]) ?? 2))}`; }
        case "percent": return `${(rng() * ((Number(p[2]) || 100) - (Number(p[1]) || 0)) + (Number(p[1]) || 0)).toFixed(Number(p[3]) ?? 1)}%`;
        case "seq": { const start = (p[1] === undefined || p[1] === "" || !Number.isFinite(Number(p[1]))) ? 1 : Number(p[1]); return `${p[3] || ""}${start + i * (Number(p[2]) || 1)}`; }
        case "cat": return rng.pick(p.slice(1).join(":").split("|").filter(Boolean));
        case "bool": { const v = p.slice(1).join(":").split("|").filter(Boolean); return rng.pick(v.length ? v : ["Yes", "No"]); }
        case "id": { const d = Math.min(12, Math.max(1, Number(p[2]) || 5)); return `${p[1] || "ID"}${String(rng.int(0, 10 ** d - 1)).padStart(d, "0")}`; }
        // realistic strings via faker (seeded per table for determinism)
        case "name": return faker ? faker.person.fullName() : `${rng.pick(GEN_FIRST)} ${rng.pick(GEN_LAST)}`;
        case "company": return faker ? faker.company.name() : `${rng.pick(GEN_WORDS)} ${rng.pick(["Inc.", "Ltd.", "Group", "Co."])}`;
        case "city": return faker ? faker.location.city() : rng.pick(GEN_WORDS);
        case "country": return faker ? faker.location.country() : rng.pick(GEN_WORDS);
        case "street": return faker ? faker.location.streetAddress() : `${rng.int(1, 999)} ${rng.pick(GEN_WORDS)} St`;
        case "product": return faker ? faker.commerce.productName() : `${rng.pick(GEN_WORDS)} ${rng.pick(GEN_WORDS)}`;
        case "email": return faker ? faker.internet.email().toLowerCase() : `${rng.pick(GEN_WORDS)}@example.com`;
        case "phone": return faker ? faker.phone.number() : `555-${String(rng.int(0, 9999)).padStart(4, "0")}`;
        case "department": return faker ? faker.commerce.department() : rng.pick(["Sales", "Ops", "R&D", "Finance"]);
        // English words/products (never Latin lorem)
        case "text": return faker ? gcap(faker.word.words(rng.int(2, 3))) : `${rng.pick(GEN_WORDS)} ${rng.pick(GEN_WORDS)}`;
        case "time": {
            // Clock time HH:MM (24h). `time` alone = random; time:HH:MM:STEPMIN =
            // a sequence from HH:MM advancing STEPMIN minutes per row (wraps at 24h).
            let mins;
            if (p[1] !== undefined && p[1] !== "") {
                const start = (Number(p[1]) || 0) * 60 + (Number(p[2]) || 0);
                mins = ((start + i * (Number(p[3]) || 30)) % 1440 + 1440) % 1440;
            } else {
                mins = rng.int(0, 1439);
            }
            return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        }
        case "date": {
            const base = Date.parse(`${p[1] || "2020-01-01"}T00:00:00Z`);
            const step = (Number(p[2]) || 1) * 86400000;
            const d = new Date(base + i * step);
            return Number.isNaN(d.getTime()) ? (p[1] || "") : d.toISOString().slice(0, 10);
        }
        case "formula": {
            const x = gnum(prior[Number(p[2])]);
            const y = gnum(prior[Number(p[3])]);
            const op = p[1];
            const r = op === "mul" ? x * y : op === "add" ? x + y : op === "sub" ? x - y : op === "div" ? (y ? x / y : 0) : 0;
            return `${p[5] || ""}${gthousands(r.toFixed(Number(p[4]) ?? 2))}`;
        }
        case "pctof": {
            // RATE% of an EARLIER column's value: pctof:COL:RATE:DEC:SYM — for
            // tax / VAT / duty / commission columns (e.g. VAT = 12% of Unit Price
            // = pctof:2:12:2:$). Without this they were specced as int:0:0 -> 0.
            const base = gnum(prior[Number(p[1])]);
            const r = base * (Number(p[2]) || 0) / 100;
            return `${p[4] || ""}${gthousands(r.toFixed(Number(p[3]) ?? 2))}`;
        }
        default: return faker ? faker.commerce.productName() : `${rng.pick(GEN_WORDS)}`;
    }
}

function gcap(s) {
    return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

const KNOWN_KINDS = new Set(["int", "float", "currency", "percent", "seq", "cat", "bool", "id", "name", "text", "date", "time", "formula", "pctof", "company", "city", "country", "street", "product", "email", "phone", "department"]);
const NUM_HEADER = /amount|total|price|cost|value|revenue|balance|qty|quantity|unit|units|count|number|\bno\.?\b|#|sum|fee|rate|pct|percent|%|score|hours|hrs|days|salary|wage|tax|\bnet\b|gross|margin|ebitda|\beps\b|income|expense|debit|credit|budget|spend|paid|due/i;
// Clock-time columns (HH:MM), checked BEFORE the date/number routes so a
// "Departure Time" column doesn't fall through to int and render as 0633872.
const TIME_HEADER = /\btime\b|departure|arrival|\beta\b|\betd\b|check.?in|check.?out|clock|start time|end time/i;
const DATE_HEADER = /date|period|day|month|year|posted|effective|as.of/i;

function defaultNumSpec(header, rng) {
    if (/%|percent|rate|margin|growth|pct|utili|yield/i.test(header)) {
        return `percent:0:100:${rng.pick([1, 1, 2])}`;
    }
    if (/amount|price|cost|value|revenue|balance|total|salary|wage|fee|tax|income|expense|sum|gross|\bnet\b|eps|ebitda|budget|spend|paid|due/i.test(header)) {
        return `currency:${rng.pick([10, 100, 1000])}:${rng.pick([10000, 100000, 1000000])}:2:$`;
    }
    return `int:0:${rng.pick([100, 1000, 10000])}`;
}

// Repair a per-column spec so numeric-looking headers never fall back to text /
// word-salad (a common LLM mistake that made tables look repetitive).
function repairSpec(spec, header, rng) {
    const kind = String(spec || "").split(":")[0];
    // A clock-time column (Departure, Arrival, "... Time") must render HH:MM, not a
    // padded int / id (which looked like 0633872). Force `time` unless the model
    // already picked it; leave true dates (DATE_HEADER) alone.
    if (TIME_HEADER.test(header) && !DATE_HEADER.test(header) && kind !== "time"
        && (!KNOWN_KINDS.has(kind) || ["int", "float", "id", "seq", "currency", "percent", "text"].includes(kind))) {
        return "time";
    }
    if (!KNOWN_KINDS.has(kind)) {
        if (NUM_HEADER.test(header)) { return defaultNumSpec(header, rng); }
        if (DATE_HEADER.test(header)) { return "date:2019-01-01:1"; }
        return "text";
    }
    if ((kind === "text" || kind === "cat") && NUM_HEADER.test(header) && !/status|class|type|category|region|grade|tier/i.test(header)) {
        return defaultNumSpec(header, rng);
    }
    return spec;
}

function generateRows(gen, ncols, rng, headers) {
    // cap raised 220 -> 400 for the hard-long trainable-zone tall tables.
    const rowCount = Math.min(400, Math.max(1, Number(gen.rowCount) || 0));
    const raw = Array.isArray(gen.columns) ? gen.columns : [];
    if (raw.length !== ncols) {
        return null;
    }
    const faker = new Faker({ locale: [en] });
    faker.seed(rng.int(1, 2147483646));
    const specs = raw.map((s, c) => repairSpec(s, headers[c] || "", rng));
    const rows = [];
    for (let i = 0; i < rowCount; i++) {
        const row = [];
        for (let c = 0; c < ncols; c++) {
            // Cap cell length as a safety net against malformed specs (e.g. an id
            // column with a huge digit count producing thousands of characters).
            row.push(String(genCell(specs[c], i, rng, row, faker) ?? "").slice(0, 80));
        }
        rows.push(row);
    }
    return rows;
}

// Returns a cell model { ncols, nrows, rows, flags, meta } from a validated
// section table, or null if the table is too degenerate to use.
// opts: { maxRows = 24, rowspan = false, rng }
// Conditional cell colouring (RENDER-ONLY, like alignment — never in the GT).
// A negative number, or a status word in a status column, gets a colour class.
const RAG_GOOD = /\b(pass(ed)?|ok|on[- ]?track|achiev\w*|complet\w*|complian\w*|approv\w*|active|met|in[- ]?stock|available|paid|cleared|resolved|good|normal|stable)\b/i;
const RAG_WARN = /\b(at[- ]?risk|pending|in[- ]?review|in[- ]?progress|partial|moderate|watch|caution|delay\w*|monitor\w*|backorder|amber|medium|warning|on[- ]?hold)\b/i;
const RAG_BAD = /\b(fail\w*|overdue|critical|non[- ]?complian\w*|reject\w*|breach|late|blocked|out[- ]?of[- ]?stock|unpaid|escalat\w*|high[- ]?risk|severe|expired|cancel\w*)\b/i;
function ragColor(t) {
    const s = String(t).replace(/<[^>]+>/g, "").trim();
    if (!s) { return null; }
    if (RAG_BAD.test(s)) { return "bad"; }
    if (RAG_WARN.test(s)) { return "warn"; }
    if (RAG_GOOD.test(s)) { return "good"; }
    return null;
}
function isNegNumber(t) {
    const raw = String(t).replace(/<[^>]+>/g, "").trim();
    // Codes like "FERT-101" or "C-01" must NOT read as negatives — a real number
    // cell has no letters.
    if (!raw || /[A-Za-z]/.test(raw)) { return false; }
    const s = raw.replace(/[^\d.,()\-−]/g, "");
    return (/^\(.+\)$/.test(s) || /^[-−]\s*\d/.test(s)) && /\d/.test(s);
}

export function modelFromSection(table, opts = {}) {
    const maxRows = opts.maxRows ?? 24;
    const rowspanGroups = Boolean(opts.rowspan);
    const headers = Array.isArray(table.headers) ? table.headers.map((h) => String(h ?? "")) : [];
    const ncols = headers.length;
    if (ncols < 2) {
        return null;
    }
    // Huge tables only: synthesize rows from per-column generator specs. (The
    // schema always carries a `generator`, so we must NOT use it for normal
    // tables — that would replace the LLM's real rows with synthetic filler.)
    let sourceRows = Array.isArray(table.rows) ? table.rows : [];
    if (opts.useGenerator && table.generator && opts.rng && Number(table.generator.rowCount) > 0) {
        const gen = generateRows(table.generator, ncols, opts.rng, headers);
        if (gen) {
            sourceRows = gen;
        }
    }
    // Triangular fill (actuarial loss-development style): row i keeps its label
    // (col 0) plus the first (ncols-1-i) value columns; the rest go EMPTY, so the
    // data fills the upper-left triangle and trails off — the "incomplete" look.
    if (opts.triangle && sourceRows.length) {
        sourceRows = sourceRows.map((row, i) => {
            const keep = Math.max(1, ncols - 1 - i);
            return row.map((cell, c) => ((c === 0 || c <= keep) ? cell : ""));
        });
    }
    // Keep only well-formed body rows; coerce to strings and fix width.
    const body = sourceRows
        // A literal newline in a cell means a multi-line / multi-field cell
        // (address, contact, value + note); render it as a hard break. <br/> the
        // model already carries survives untouched (the esc() whitelist keeps it).
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").replace(/\r?\n/g, "<br/>")) : []))
        .map((r) => {
            if (r.length === ncols) {
                return r;
            }
            if (r.length > ncols) {
                return r.slice(0, ncols);
            }
            return [...r, ...Array(ncols - r.length).fill("")];
        })
        .filter((r) => r.some((c) => c.trim() !== ""));
    if (body.length < 1) {
        return null;
    }

    // A cell holding only the token "<<" (one or more) means "merge me into the
    // cell on my left" — a horizontal body merge (colspan). Blank those out for
    // the numeric check so a "<<" in a number column doesn't flip its alignment.
    const numBody = body.map((r) => r.map((x) => (isMergeLeft(x) ? "" : x)));
    const aligns = headers.map((_, c) => (columnIsNumeric(numBody, c) ? "right" : "left"));
    // A cross-tab/matrix centres its intersection columns (marks/short values),
    // keeping only the row-label column left-aligned.
    if (opts.matrix) {
        for (let c = 1; c < aligns.length; c++) { aligns[c] = "center"; }
    }
    // A center-label-spine table has its row-LABEL column in the middle (the most
    // alphabetic column); everything else is numeric and right-aligned.
    let labelCol = 0;
    if (opts.spine && ncols >= 3) {
        const txt = (v) => String(v).replace(/<[^>]+>/g, "").trim();
        const alpha = headers.map((_, c) => body.reduce((n, r) => {
            const t = txt(r[c]);
            return n + (/[A-Za-z]/.test(t) && !/^[\d(.,−-]/.test(t) ? 1 : 0);
        }, 0));
        labelCol = alpha.indexOf(Math.max(...alpha));
        if (labelCol < 0) { labelCol = 0; }
        for (let c = 0; c < aligns.length; c++) { aligns[c] = c === labelCol ? "left" : "right"; }
    }

    const rows = [];
    const title = String(table.title || "").trim();
    if (title) {
        rows.push([{ tag: "th", text: title, colspan: ncols, rowspan: 1, align: "center", role: "title" }]);
    }

    // Multi-tier column header. Top tier = super-groups, then column groups,
    // then the leaf header row.
    const supers = Array.isArray(table.superGroups) ? table.superGroups : [];
    const superSpanSum = supers.reduce((s, g) => s + (Number(g.span) || 0), 0);
    const hasSupers = supers.length > 0 && superSpanSum === ncols;

    const groups = Array.isArray(table.columnGroups) ? table.columnGroups : [];
    const groupSpanSum = groups.reduce((s, g) => s + (Number(g.span) || 0), 0);
    const hasGroups = groups.length > 0 && groupSpanSum === ncols;

    const tierCount = (hasSupers ? 1 : 0) + (hasGroups ? 1 : 0);
    // When the first column is a row-label stub, real multi-tier tables keep it
    // OUT of the column groups: it becomes a single header cell spanning the
    // tier rows, so the group labels sit only over the data columns. Otherwise a
    // named group (e.g. "Q1 2024") ends up absorbing the label column, which no
    // real document does. Carve the stub out most of the time (some real docs do
    // group from column 0, so keep a little variety).
    const rng = opts.rng;
    const stubFirst = tierCount > 0
        && aligns[0] === "left" && headers[0].trim() !== ""
        && (!hasSupers || Number(supers[0].span) >= 2)
        && (!hasGroups || Number(groups[0].span) >= 2)
        && (!rng || rng.bool(0.85));

    // Build one tier row from {label, span} defs; when carving out the stub the
    // first group loses its leading column (which the stub cell now covers).
    const buildTier = (defs, role) => {
        const cells = [];
        defs.forEach((g, i) => {
            const span = Number(g.span) - (stubFirst && i === 0 ? 1 : 0);
            if (span <= 0) { return; }
            cells.push({ tag: "th", text: String(g.label ?? ""), colspan: span, rowspan: 1, align: "center", role });
        });
        return cells;
    };

    if (tierCount > 0) {
        const tierRows = [];
        if (hasSupers) { tierRows.push(buildTier(supers, "super")); }
        if (hasGroups) { tierRows.push(buildTier(groups, "group")); }
        const leaf = headers.map((h, c) => ({ tag: "th", text: h, colspan: 1, rowspan: 1, align: aligns[c], role: "header" }));
        if (stubFirst) {
            // Stub cell spans every tier row plus the leaf header row.
            tierRows[0].unshift({ tag: "th", text: headers[0], colspan: 1, rowspan: tierCount + 1, align: aligns[0], role: "header" });
            rows.push(...tierRows);
            rows.push(leaf.slice(1));
        } else {
            rows.push(...tierRows);
            rows.push(leaf);
        }
    } else {
        rows.push(headers.map((h, c) => ({ tag: "th", text: h, colspan: 1, rowspan: 1, align: aligns[c], role: "header" })));
    }

    // Cap very tall tables so the page stays readable at single-page scale.
    const capped = body.slice(0, maxRows);
    // Classify each row: section subheader (first cell only) vs normal.
    const classified = capped.map((r) => {
        const firstFilled = r[0].trim() !== "";
        const restEmpty = r.slice(1).every((c) => c.trim() === "");
        return { r, section: !opts.spine && ncols >= 3 && firstFilled && restEmpty };
    });

    // Optional rowspan grouping: merge consecutive normal rows that repeat the
    // same first-cell value into one rowspanned label cell.
    let rowspanCount = 0;
    if (rowspanGroups) {
        let i = 0;
        while (i < classified.length) {
            if (classified[i].section) { i += 1; continue; }
            const key = classified[i].r[0].trim();
            let j = i + 1;
            if (key) {
                while (j < classified.length && !classified[j].section && classified[j].r[0].trim() === key) { j += 1; }
            }
            const span = j - i;
            if (span > 1) {
                // The label cell may be widened by "<<" merges (label | << | << | …),
                // giving it a colspan > 1. The rows it spans must then drop that MANY
                // leading columns, not just column 0 — otherwise their cells overflow
                // past the table width (the covered columns are occupied by the label).
                let labelCols = 1;
                while (labelCols < ncols && isMergeLeft(classified[i].r[labelCols])) { labelCols += 1; }
                classified[i].rowspanFirst = span;
                for (let k = i + 1; k < j; k++) { classified[k].dropCols = labelCols; }
                rowspanCount += 1;
            }
            i = j;
        }
    }

    // Row-header tables: for a subset of label-first tables, render the first
    // column as <th> row headers — a common real-document structure (spec sheets,
    // comparison tables, line-item statements) that the grid-only default never
    // produces, so the dataset's tables stop all looking alike. GT reflects it via
    // cell.tag; the visual treatment is the render-only "rowhead" role/class.
    // A matrix ALWAYS has row-axis labels as <th> row headers; other tables get
    // them ~25% of the time when the first column is a textual label.
    // A 2-column form section is a FIELD BLOCK (label : filled-in value): the label
    // column is a <th>, the value cells get a boxed "field" treatment, and the
    // Field/Value header row is dropped (real forms don't show it).
    const fieldBlock = Boolean(opts.form) && ncols === 2;
    const rowHeaderCol = opts.spine ? labelCol : 0;
    const rowHeaderTable = Boolean(rng) && (headers[rowHeaderCol] || "").trim() !== "" && ncols >= 2
        && !rowspanGroups && !opts.useGenerator
        && (opts.matrix || opts.spine || fieldBlock || (aligns[0] === "left" && rng.bool(0.25)));
    // Numbered-column tier: a leading header row of column numbers (1..N), the way
    // regulatory/statistical forms number their columns. (form grids only.)
    const numberedCols = Boolean(opts.numberedCols) && ncols >= 3 && !fieldBlock;
    // Conditional cell colouring (render-only): some docs show negatives in red,
    // and a Status/Result/Risk column gets RAG (red/amber/green) backgrounds.
    const colorNeg = Boolean(rng) && rng.bool(0.3);
    const statusCol = headers.map((h) => /status|result|rating|risk|priorit|complian|grade\b|state\b|condition|outcome|standing|health|flag/i.test(String(h)));
    const colorRag = Boolean(rng) && statusCol.some(Boolean) && rng.bool(0.6);
    let sectionRows = 0;
    let colspanCells = 0;
    for (const c of classified) {
        if (c.section) {
            const sInd = indentLevel(c.r[0]);
            const sCell = { tag: "td", text: sInd ? c.r[0].replace(/^ +/, "") : c.r[0], colspan: ncols, rowspan: 1, align: "left", role: "section" };
            if (sInd) { sCell.indent = sInd; }
            rows.push([sCell]);
            sectionRows += 1;
            continue;
        }
        const cells = [];
        let prevCell = null;
        let rowMerges = 0;
        c.r.forEach((cell, ci) => {
            if (c.dropCols && ci < c.dropCols) { return; }
            // "<<" absorbs into the cell on its left (a body colspan). With no real
            // cell to its left yet, it degrades to an empty cell rather than leaking.
            if (isMergeLeft(cell)) {
                if (prevCell) { prevCell.colspan += 1; rowMerges += 1; return; }
                cell = "";
            }
            // First-column labels may carry leading-space indentation (hierarchy).
            let indent = 0;
            if (ci === 0) {
                indent = indentLevel(cell);
                if (indent) { cell = cell.replace(/^ +/, ""); }
            }
            const obj = { tag: "td", text: cell, colspan: 1, rowspan: 1, align: aligns[ci], role: "body" };
            if (indent) { obj.indent = indent; }
            if (ci === 0 && c.rowspanFirst) { obj.rowspan = c.rowspanFirst; }
            // First column of a row-header table becomes a <th> row header.
            if (rowHeaderTable && ci === rowHeaderCol && cell.trim() !== "") { obj.tag = "th"; obj.role = "rowhead"; }
            // A form field block's value column (col 1) renders as a boxed field.
            if (fieldBlock && ci === 1) { obj.role = "field"; }
            // Render-only conditional colour (ignored by the GT serializer).
            if (obj.tag === "td" && colorNeg && aligns[ci] === "right" && isNegNumber(cell)) {
                obj.color = "neg";
            } else if (colorRag && statusCol[ci]) {
                const rc = ragColor(cell);
                if (rc) { obj.color = rc; }
            }
            cells.push(obj);
            prevCell = obj;
        });
        // A "<<" run that swallows the whole row leaves one full-width body cell.
        // When its text is a bare label (no digits, <=3 words) that's an LLM
        // artifact — e.g. a "Subtotal" with no totals — so drop it rather than
        // render an empty band. Genuine full-width notes are sentences (with
        // digits or >3 words) and survive.
        if (cells.length === 1 && cells[0].colspan === ncols) {
            const t = cells[0].text.replace(/<[^>]+>/g, "").trim();
            if (t && !/\d/.test(t) && t.split(/\s+/).length <= 3) { continue; }
        }
        colspanCells += rowMerges;
        rows.push(cells);
    }

    // Headerless: a continuation fragment (or a bare data grid) shows NO column
    // header — the header only appeared on the table's first page. Drop the
    // leading title/header tier rows; tableHtml auto-detects the header as the
    // leading all-<th> rows, so with them gone both the render and the GT are
    // headerless from the same model (render==GT holds).
    // Numbered-column tier: insert a row of column numbers (1..N) above the header,
    // below any spanning title row. A real header row, so it appears in the GT too.
    if (numberedCols) {
        const numRow = headers.map((_, c) => ({ tag: "th", text: String(c + 1), colspan: 1, rowspan: 1, align: "center", role: "colnum" }));
        const at = (rows[0] && rows[0][0] && rows[0][0].role === "title") ? 1 : 0;
        rows.splice(at, 0, numRow);
    }

    let headerless = false;
    if (opts.headerless || fieldBlock) {
        const isHeaderTier = (r) => r.length > 0 && r.every((c) => c.tag === "th" && ["title", "super", "group", "header"].includes(c.role));
        while (rows.length > 1 && isHeaderTier(rows[0])) { rows.shift(); }
        headerless = true;
    }

    const complexStruct = hasGroups || hasSupers || sectionRows > 0 || rowspanCount > 0 || colspanCells > 0;
    const flags = { table_difficulty: classifyDifficulty({ ncols, nrows: capped.length, hasTitle: Boolean(title), hasGroups: complexStruct, hasRowspan: rowspanCount > 0 }) };
    if (title && !headerless) {
        flags.max_top_title_rows = 1;
    }

    return { ncols, nrows: capped.length, rows, headerless, matrix: Boolean(opts.matrix), rotatedHeaders: Boolean(opts.matrix && opts.rotatedHeaders), form: Boolean(opts.form), fieldBlock, flags, meta: { hasTitle: Boolean(title) && !headerless, hasGroups: hasGroups && !headerless, hasSupers: hasSupers && !headerless, hasRowspan: rowspanCount > 0, bodyColspan: colspanCells > 0, sectionRows } };
}
