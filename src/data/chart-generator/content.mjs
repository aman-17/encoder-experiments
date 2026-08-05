// Random cell-content generators and label pools. Each column is assigned a
// coherent "kind" so a column reads like real data (all currency, all dates,
// etc.), and the body cells for that column are generated from the kind.

const WORDS = [
    "alpha", "bravo", "delta", "north", "south", "east", "west", "prime", "core", "edge",
    "metro", "rural", "urban", "coastal", "inland", "summit", "valley", "ridge", "harbor",
    "atlas", "vega", "nova", "orion", "lumen", "quartz", "cedar", "maple", "birch", "aspen",
    "sterling", "granite", "marble", "cobalt", "indigo", "amber", "crimson", "ivory", "onyx",
    "pacific", "atlantic", "central", "western", "eastern", "northern", "southern", "global",
];

const NOUNS = [
    "revenue", "expenses", "margin", "units", "volume", "balance", "deposits", "premiums",
    "claims", "yield", "tier", "segment", "region", "branch", "account", "portfolio",
    "shipments", "orders", "returns", "headcount", "capacity", "uptime", "latency",
    "throughput", "coverage", "exposure", "reserve", "dividend", "rate", "tariff",
];

const FIRST = ["James", "Maria", "Wei", "Aisha", "Carlos", "Ingrid", "Tom", "Priya", "Lukas", "Sofia", "Omar", "Nina", "Diego", "Yuki", "Hassan", "Elena", "Noah", "Fatima"];
const LAST = ["Chen", "Patel", "Garcia", "Novak", "Okafor", "Tanaka", "Schmidt", "Rossi", "Andersson", "Kim", "Haddad", "Silva", "Murphy", "Larsen", "Mwangi", "Costa"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATES = ["AL", "AK", "AZ", "CA", "CO", "FL", "GA", "IL", "MA", "NY", "OH", "TX", "WA", "VA"];

// Header-label pools by column kind.
const HEADER_LABELS = {
    label: ["Item", "Name", "Category", "Description", "Product", "Segment", "Account", "Line"],
    name: ["Employee", "Owner", "Manager", "Contact", "Customer", "Representative"],
    id: ["ID", "Code", "Ref", "SKU", "Policy No.", "Account #", "Order ID"],
    category: ["Type", "Class", "Group", "Tier", "Status", "Region", "State"],
    date: ["Date", "As of", "Effective", "Period", "Posted"],
    month: ["Month", "Period", "Cycle"],
    int: ["Units", "Count", "Qty", "Volume", "Headcount", "Orders", "Days"],
    float: ["Score", "Index", "Rating", "Factor", "Ratio", "Avg"],
    currency: ["Amount", "Revenue", "Cost", "Balance", "Premium", "Total", "Price", "Value"],
    percent: ["%", "Rate", "Change", "Growth", "Share", "Margin", "Pct"],
    year: ["Year", "FY"],
    time: ["Time", "Departs", "Arrives", "ETA"],
    bool: ["Active", "Eligible", "Flagged", "Verified"],
};

const CURRENCY_SYMBOLS = ["$", "€", "£", "¥"];

function pad2(n) {
    return String(n).padStart(2, "0");
}

function thousands(n) {
    return n.toLocaleString("en-US");
}

// Build a column descriptor: header text + a per-cell generator + alignment.
// `currency` (optional) forces the currency symbol so every money column in a
// table shares one currency instead of mixing $/€/£ within the same table.
export function makeColumn(rng, kind, colIndex, currency = null) {
    const headerPool = HEADER_LABELS[kind] || HEADER_LABELS.label;
    let header = rng.pick(headerPool);
    // occasionally append a qualifier so headers vary even for the same kind
    if (rng.bool(0.3) && (kind === "currency" || kind === "int" || kind === "percent")) {
        header = `${header} ${rng.pick(["2023", "2024", "Q1", "Q2", "YTD", "(000s)", rng.pick(NOUNS)])}`;
    }

    const numeric = ["int", "float", "currency", "percent", "year"].includes(kind);
    const symbol = kind === "currency" ? (currency || rng.pick(CURRENCY_SYMBOLS)) : "";
    const negParens = kind === "currency" && rng.bool(0.3);
    const intMax = rng.pick([100, 1000, 50000, 1000000]);
    const floatMax = rng.pick([1, 10, 100]);

    const gen = () => {
        // sprinkle a few blanks for realism
        if (rng.bool(0.04)) {
            return "";
        }
        switch (kind) {
            case "label":
                return cap(`${rng.pick(WORDS)} ${rng.pick(NOUNS)}`);
            case "name":
                return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
            case "id":
                return `${rng.pick(["A", "B", "C", "X", "RX", "INV"])}${rng.int(1000, 99999)}`;
            case "category":
                return rng.pick([...STATES, "High", "Medium", "Low", "Open", "Closed", "Pending", "Tier 1", "Tier 2", "Tier 3"]);
            case "date": {
                const fmt = rng.weighted([["iso", 1], ["us", 1], ["mon", 1]]);
                const y = rng.int(2019, 2025);
                const m = rng.int(1, 12);
                const d = rng.int(1, 28);
                if (fmt === "iso") {
                    return `${y}-${pad2(m)}-${pad2(d)}`;
                }
                if (fmt === "us") {
                    return `${pad2(m)}/${pad2(d)}/${y}`;
                }
                return `${MONTHS[m - 1]} ${d}, ${y}`;
            }
            case "month":
                return `${rng.pick(MONTHS)} ${rng.int(2019, 2025)}`;
            case "year":
                return String(rng.int(2015, 2025));
            case "time":
                return `${pad2(rng.int(0, 23))}:${pad2(rng.pick([0, 5, 10, 15, 30, 45]))}`;
            case "int":
                return thousands(rng.int(0, intMax));
            case "float":
                return rng.float(0, floatMax, 2).toFixed(2);
            case "currency": {
                const v = rng.float(0, intMax, 2);
                const body = `${symbol}${thousands(Number(v.toFixed(2)))}`;
                return negParens && rng.bool(0.25) ? `(${body})` : body;
            }
            case "percent":
                return `${rng.float(0, 100, 1)}%`;
            case "bool":
                return rng.pick(["Yes", "No", "Y", "N", "—"]);
            default:
                return cap(rng.pick(WORDS));
        }
    };

    return { kind, header, gen, align: numeric ? "right" : "left", colIndex };
}

function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Kinds suitable for the first ("label") column vs. data columns.
export const LABEL_KINDS = ["label", "name", "id", "category", "date", "month"];
export const DATA_KINDS = ["int", "float", "currency", "percent", "bool", "category"];

// Document chrome ----------------------------------------------------------

const TITLE_PREFIX = ["Quarterly", "Annual", "Monthly", "Regional", "Consolidated", "Summary", "Detailed", "Comparative", "Preliminary"];
const TITLE_SUBJECT = ["Performance Report", "Financial Summary", "Operations Review", "Sales Analysis", "Rate Schedule", "Inventory Listing", "Claims Report", "Service Timetable", "Budget Allocation", "Coverage Matrix"];

export function randomDocTitle(rng) {
    return `${rng.pick(TITLE_PREFIX)} ${rng.pick(TITLE_SUBJECT)}`;
}

export function randomTableTitle(rng) {
    return cap(`${rng.pick(WORDS)} ${rng.pick(NOUNS)} by ${rng.pick(["region", "month", "segment", "tier", "year", "branch"])}`);
}

export function lorem(rng, sentences) {
    const out = [];
    for (let i = 0; i < sentences; i++) {
        const n = rng.int(8, 18);
        const w = [];
        for (let j = 0; j < n; j++) {
            w.push(rng.pick([...WORDS, ...NOUNS]));
        }
        out.push(cap(w.join(" ")) + ".");
    }
    return out.join(" ");
}
