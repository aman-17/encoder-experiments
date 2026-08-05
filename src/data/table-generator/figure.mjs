// Synthetic charts. Each chart is generated as a typed DATA MODEL first, then
// rendered to SVG by chartlib. The model IS the ground truth — chartDataPoints()
// recovers every plotted value exactly (charts_core v2.1 format).
//
// 28 chart types (chartlib.CHART_TYPES), multi-axis combos, multiple series.
// The chart type can be chosen by the LLM (doc.chartType) where it suits the
// page, else picked here.

import { CHART_TYPES, renderChart } from "./chartlib.mjs";

export { CHART_TYPES };

// Currency symbols the chart can render as an axis prefix.
const PREFIX_CCY = new Set(["$", "€", "£", "¥", "₹"]);
// Resolve a monetary axis unit from the document's currency: a renderable prefix
// symbol stays; a currency the chart can't prefix (kr, SEK, R$ …) becomes neutral
// (no symbol) rather than a wrong "$"; no context at all keeps the "$" default.
const resolveMoneyUnit = (c) => (!c ? "$" : PREFIX_CCY.has(c) ? c : "");

export function parseNum(s) {
    if (s == null) {
        return null;
    }
    const str = String(s).trim();
    if (!str) {
        return null;
    }
    const neg = /^\(.*\)$/.test(str);
    const cleaned = str.replace(/[^0-9.\-]/g, "");
    if (!/[0-9]/.test(cleaned)) {
        return null;
    }
    const n = Number(cleaned.replace(/(?!^)-/g, ""));
    return Number.isNaN(n) ? null : (neg ? -Math.abs(n) : n);
}

// A date/time string parses as a bare number ("02/04" -> 204) once separators
// are stripped, so it must NOT count as a chartable VALUE — otherwise a date
// column can win as the value axis and the chart plots 204, 504, … instead of
// the real numeric column. Dates make good category LABELS instead.
function isDateLike(s) {
    const t = String(s ?? "").trim();
    return /^\d{1,2}[:h]\d{2}([:.]\d{2})?$/.test(t)            // time 06:33[:00]
        || /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(t)           // 02/04 or 02/04/2001
        || /^\d{1,4}[.\-]\d{1,2}[.\-]\d{2,4}$/.test(t)        // 2021-09-17, 12.05.2001
        || /^\d{4}-\d{2}(-\d{2})?$/.test(t);                  // 2021-09[-17]
}

// ---- chart-type families --------------------------------------------------

const SINGLE_SERIES = new Set(["pie", "donut", "funnel", "gauge", "histogram", "waterfall", "lollipop", "hbar"]);
const MULTI_SERIES = new Set(["groupedBar", "stackedBar", "percentBar", "stackedHBar", "multiLine", "stackedArea", "radar", "heatmap"]);
const XY = new Set(["scatter", "bubble"]);
// Types that sensibly plot ONE (label, value) series pulled from a host table —
// so a figure accompanying a data table can chart the table's own numbers
// instead of unrelated synthetic categories.
const DERIVABLE_TYPES = new Set(["bar", "line", "hbar", "area", "lollipop", "spline", "stepLine", "pie", "donut", "funnel", "pyramid"]);

// Weighted pick favouring common, readable chart types.
function pickType(rng) {
    return rng.weighted([
        ["bar", 5], ["groupedBar", 4], ["stackedBar", 4], ["line", 5], ["multiLine", 4],
        ["area", 3], ["hbar", 3], ["pie", 3], ["donut", 3], ["comboBarLine", 3],
        ["percentBar", 2], ["spline", 2], ["stepLine", 2], ["stackedArea", 2],
        ["scatter", 2], ["bubble", 2], ["radar", 2], ["waterfall", 2], ["funnel", 2],
        ["lollipop", 2], ["stackedHBar", 1], ["heatmap", 1], ["slope", 1], ["gauge", 1],
        ["pyramid", 1], ["histogram", 1], ["boxplot", 1], ["candlestick", 1],
    ]);
}

const CAT_LABELS = {
    year: (n) => Array.from({ length: n }, (_, i) => String(2016 + i)),
    quarter: (n) => Array.from({ length: n }, (_, i) => `Q${(i % 4) + 1} '${String(19 + Math.floor(i / 4)).padStart(2, "0")}`),
    month: (n) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].slice(0, Math.min(12, n)),
    region: (n) => ["North", "South", "East", "West", "Central", "Nordic", "APAC", "EMEA", "LATAM", "Iberia", "Baltics", "Alpine", "Benelux", "DACH", "MENA", "Oceania"].slice(0, n),
    segment: (n) => ["Retail", "Wholesale", "Online", "Direct", "Partner", "OEM", "Public", "SMB", "Enterprise", "Govt", "Reseller", "Channel", "Strategic", "Mid-Market", "Field", "Inside"].slice(0, n),
    age: (n) => ["0-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"].slice(0, n),
};
const SERIES_NAMES = ["Revenue", "Cost", "EBITDA", "Units", "Margin", "Forecast", "Actual", "Budget", "Prior Year", "Plan", "Net", "Gross", "Region A", "Region B"];
const TITLES_X = ["Period", "Fiscal Year", "Quarter", "Category", "Segment", "Region", "Month", "Cohort"];
const TITLES_Y = ["Value", "Amount", "USD (millions)", "Units", "Share (%)", "Index", "Count", "Rate"];

function catKindFor(type, rng) {
    if (type === "pyramid") { return "age"; }
    if (["pie", "donut", "funnel", "heatmap"].includes(type)) { return rng.pick(["region", "segment"]); }
    return rng.pick(["year", "quarter", "month", "region", "segment"]);
}

function seriesValues(rng, n, type, max) {
    let v = rng.float(max * 0.2, max * 0.8, 0);
    return Array.from({ length: n }, () => {
        const trend = ["line", "multiLine", "spline", "area", "stackedArea", "stepLine"].includes(type);
        const drift = trend ? rng.float(-0.12, 0.16) : rng.float(-0.5, 0.55);
        v = Math.max(0, v * (1 + drift) + rng.float(-max * 0.04, max * 0.04));
        return Math.round(v);
    });
}

// Build a typed model. opts.type forces a type (e.g. the LLM's choice).
export function generateChartModel(rng, opts = {}) {
    const type = (opts.type && CHART_TYPES.includes(opts.type)) ? opts.type : pickType(rng);
    const dense = opts.dense || rng.bool(0.35);
    // A monetary axis must use the DOCUMENT's currency, not a random "$": a chart
    // inside a kr / € / ₹ document showing "$0–$200" is clearly wrong. opts.currency
    // is a prefix symbol the chart can render, "OTHER"/anything else for a currency
    // it can't (kr, SEK, R$ …) -> neutral no-currency axis, or null/undefined for no
    // context (chart-focus) -> keep the "$" default.
    let unit = rng.pick(["", "", "$", "%"]);
    if (unit === "$") { unit = resolveMoneyUnit(opts.currency); }
    const baseHue = rng.int(0, 359);
    const options = { legend: true, grid: true, valueLabels: rng.bool(0.25), baseHue };
    // y-axis title must agree with the unit — a money axis shouldn't be titled
    // "Index" or "Share (%)", and a "%"-valued axis shouldn't say "USD".
    const isMoney = PREFIX_CCY.has(unit);
    const yTitlePool = unit === "%" ? ["Share (%)", "Rate", "Proportion", "% of total"]
        : isMoney ? ["Amount", "Value", "Revenue", "Cost"]
            : ["Value", "Count", "Units", "Index", "Volume"];
    const m = { type, title: opts.title || "", unit, options, xTitle: rng.bool(0.4) ? rng.pick(TITLES_X) : "", yTitle: rng.bool(0.5) ? rng.pick(yTitlePool) : "" };

    if (XY.has(type)) {
        const ns = type === "bubble" ? rng.int(1, 3) : rng.int(1, 3);
        m.series = Array.from({ length: ns }, (_, si) => ({
            name: SERIES_NAMES[si] || `S${si + 1}`,
            points: Array.from({ length: dense ? rng.int(16, 30) : rng.int(8, 16) }, () => ({
                x: rng.float(0, 100, 1), y: rng.float(0, 100, 1), r: type === "bubble" ? rng.float(1, 100, 0) : undefined,
            })),
        }));
        // Scatter/bubble axes are numeric measures — label them with measure
        // names (Value/Units/Rate…), never a category dimension like "Region".
        m.xTitle = rng.pick(TITLES_Y);
        m.yTitle = rng.pick(TITLES_Y);
        return m;
    }

    let nCat = SINGLE_SERIES.has(type) ? (type === "histogram" ? rng.int(8, 14) : rng.int(3, 7))
        : type === "slope" ? 2
            : (dense ? rng.int(9, 16) : rng.int(5, 9));
    const catKind = catKindFor(type, rng);
    let categories = CAT_LABELS[catKind](nCat);
    // Never pad a short label pool with fake "Retail.1"/"Online.3" duplicates —
    // if the pool is smaller than nCat, just use the whole pool (fewer, but real,
    // categories). year/quarter are generated per-index so they never run short.
    if (categories.length < nCat) { nCat = categories.length; }
    categories = categories.slice(0, nCat);
    m.categories = categories;
    // The x-axis title must describe the categories actually plotted — a random
    // pool pick can label a month/date axis "Region". Keep the show/hide roll
    // from above, but make the shown title match the category kind.
    if (m.xTitle) {
        m.xTitle = { year: "Year", quarter: "Quarter", month: "Month", region: "Region", segment: "Segment", age: "Age Group" }[catKind] || m.xTitle;
    }
    const max = rng.pick([100, 1000, 50000, 1000000]);

    if (type === "comboBarLine") {
        m.series = [
            { name: "Revenue", values: seriesValues(rng, nCat, "bar", max), axis: "left", kind: "bar" },
            { name: "Cost", values: seriesValues(rng, nCat, "bar", max), axis: "left", kind: "bar" },
            { name: "Margin %", values: seriesValues(rng, nCat, "line", 100), axis: "right", kind: "line" },
        ];
        m.unit2 = "%"; m.y2Title = "Margin %";
        return m;
    }
    if (type === "candlestick") {
        let base = rng.float(50, 200, 2);
        m.series = [{ name: "Price", values: categories.map(() => { const o = base; const c = Math.max(1, o + rng.float(-8, 8)); const h = Math.max(o, c) + rng.float(0, 5); const l = Math.min(o, c) - rng.float(0, 5); base = c; return { o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2) }; }) }];
        m.unit = resolveMoneyUnit(opts.currency);
        // it's a price chart, so re-label the axis to match (keep show/hide).
        m.yTitle = m.yTitle ? "Price" : "";
        return m;
    }
    if (type === "boxplot") {
        m.series = [{ name: "Distribution", values: categories.map(() => { const med = rng.float(20, 80, 1); const q1 = med - rng.float(3, 12); const q3 = med + rng.float(3, 12); return { min: q1 - rng.float(2, 10), q1, med, q3, max: q3 + rng.float(2, 10) }; }) }];
        return m;
    }
    if (type === "gauge") {
        m.gaugeMax = 100; m.unit = "%";
        m.series = [{ name: "KPI", values: [rng.int(20, 95)] }];
        m.categories = [rng.pick(["Utilization", "SLA Attainment", "Capacity", "Efficiency", "Satisfaction"])];
        return m;
    }
    if (type === "pyramid") {
        m.series = [
            { name: "Male", values: categories.map(() => rng.int(20, 100)) },
            { name: "Female", values: categories.map(() => rng.int(20, 100)) },
        ];
        return m;
    }
    if (type === "waterfall") {
        m.series = [{ name: "Bridge", values: categories.map((_, i) => i === 0 ? rng.int(40, 90) : rng.int(-30, 35)) }];
        return m;
    }
    if (type === "slope") {
        m.series = Array.from({ length: rng.int(4, 7) }, (_, i) => ({ name: SERIES_NAMES[i] || `Item ${i + 1}`, values: [rng.int(20, 90), rng.int(20, 90)] }));
        return m;
    }

    const ns = SINGLE_SERIES.has(type) ? 1 : (MULTI_SERIES.has(type) ? rng.int(2, 4) : 1);
    const names = rng.shuffle(SERIES_NAMES).slice(0, ns);
    m.series = names.map((name) => ({ name: ns === 1 ? (unit === "%" ? "Share" : "Value") : name, values: seriesValues(rng, nCat, type, unit === "%" ? 100 : max) }));
    return m;
}

// Pull a chartable (labels,values) pair from a table cell model.
export function deriveChartData(model) {
    const bodyRows = model.rows.filter((r) => r.every((c) => c.tag === "td"));
    if (bodyRows.length < 2) { return null; }
    const ncols = model.ncols;
    const numericScore = Array(ncols).fill(0);
    for (const r of bodyRows) {
        for (let c = 0; c < Math.min(ncols, r.length); c++) {
            if (parseNum(r[c].text) != null && !isDateLike(r[c].text)) { numericScore[c] += 1; }
        }
    }
    let valCol = -1; let best = 0;
    for (let c = 0; c < ncols; c++) { if (numericScore[c] > best) { best = numericScore[c]; valCol = c; } }
    if (valCol < 0 || best < 2) { return null; }
    const labelCol = numericScore.findIndex((s) => s < bodyRows.length * 0.4);
    const lc = labelCol >= 0 && labelCol !== valCol ? labelCol : -1;
    const labels = []; const values = [];
    for (let i = 0; i < bodyRows.length && labels.length < 12; i++) {
        const v = parseNum(bodyRows[i][valCol]?.text);
        if (v == null) { continue; }
        labels.push(lc >= 0 ? (bodyRows[i][lc]?.text || `#${i + 1}`) : `#${i + 1}`);
        values.push(v);
    }
    return values.length >= 2 ? { labels, values } : null;
}

// Build a figure for a section. opts.type forces a chart type (LLM choice).
export function buildFigure(sectionModel, rng, accent, figNum, captionText, opts = {}) {
    let model;
    const derived = !opts.forceSynthetic && sectionModel && deriveChartData(sectionModel);
    // A figure next to a data table should chart THAT table's numbers, not random
    // synthetic categories — derive whenever we can, honouring the LLM's chosen
    // chart type when it plots a single category series. (Multi-series / XY / gauge
    // types and the remaining slice fall through to synthetic; chart-focus pages
    // force synthetic and still exercise all 28 types.)
    const typeDerivable = !opts.type || DERIVABLE_TYPES.has(opts.type);
    if (derived && typeDerivable && rng.bool(0.85)) {
        const type = (opts.type && DERIVABLE_TYPES.has(opts.type)) ? opts.type : rng.pick(["bar", "line", "hbar", "area", "lollipop"]);
        model = { type, title: captionText, categories: derived.labels.map(String), series: [{ name: "Value", values: derived.values }], unit: "", options: { legend: false, grid: true, baseHue: rng.int(0, 359) } };
    } else {
        // The LLM overwhelmingly defaults to "bar"; for a synthetic chart-focus
        // figure, diversify across the full palette so all 28 chart types get
        // exercised (a specific non-bar LLM choice is kept as-is).
        let chartType = opts.type;
        if ((!chartType || chartType === "bar") && rng.bool(0.7)) {
            chartType = rng.pick(CHART_TYPES);
        }
        model = generateChartModel(rng, { title: captionText, dense: opts.dense, type: chartType, currency: opts.currency });
    }
    return { svg: renderChart(model), model, caption: captionText, figNum };
}

// ---- chart ground truth (charts_core v2.1) --------------------------------
// One chart_data_point per plotted value; labels locate it (category / series /
// field). Captures every numeric value in the model.

function fmtVal(v, unit) {
    if (v == null) { return ""; }
    if (unit === "%") { return `${v}%`; }
    if (unit === "$" || unit === "€" || unit === "£" || unit === "¥" || unit === "₹") { return `${unit}${Number(v).toLocaleString("en-US")}`; }
    return Number(v).toLocaleString("en-US");
}

export function chartDataPoints(model) {
    const rules = [];
    let n = 0;
    const push = (labels, value) => rules.push({ type: "chart_data_point", labels, value: String(value), max_diffs: 0, normalize_numbers: true, verified: true, id: `cdp_${n++}` });
    const cats = model.categories || [];
    const multi = (model.series || []).length > 1;

    // Pie/donut slices are labelled with a percentage of the whole (not the raw
    // value), so the ground truth must be that same percentage — the raw value
    // is not recoverable from the rendered chart. Matches rPie's rounding.
    if ((model.type === "pie" || model.type === "donut") && model.series && model.series[0]) {
        const vals = model.series[0].values || [];
        const total = vals.reduce((a, b) => a + (b || 0), 0) || 1;
        vals.forEach((v, ci) => {
            const cat = cats[ci] != null ? String(cats[ci]) : `#${ci + 1}`;
            push([cat], `${Math.round(((v || 0) / total) * 100)}%`);
        });
        return rules;
    }

    // A 100%-stacked bar encodes each series as a percentage of its column
    // against a 0-100% axis — the raw value is not recoverable, so the GT is the
    // share, matching what the chart actually shows.
    if (model.type === "percentBar" && model.series && model.series.length) {
        const ncat = cats.length || (model.series[0].values || []).length;
        for (let ci = 0; ci < ncat; ci++) {
            const total = model.series.reduce((a, s) => a + (s.values[ci] || 0), 0) || 1;
            const cat = cats[ci] != null ? String(cats[ci]) : `#${ci + 1}`;
            for (const s of model.series) {
                push([cat, s.name], `${Math.round(((s.values[ci] || 0) / total) * 100)}%`);
            }
        }
        return rules;
    }

    for (const s of model.series || []) {
        if (s.points) { // scatter / bubble
            s.points.forEach((pt, i) => {
                const base = multi ? [s.name, `#${i + 1}`] : [`#${i + 1}`];
                push([...base, "x"], pt.x);
                push([...base, "y"], pt.y);
                if (pt.r != null) { push([...base, "size"], pt.r); }
            });
            continue;
        }
        // A right-axis series (e.g. the line in a dual-axis combo) is plotted
        // against its own axis/unit, so format it with that unit — not the
        // left-axis unit (which would label a "Margin %" line as "$55").
        const sUnit = (s.axis === "right" && model.unit2 != null) ? model.unit2 : model.unit;
        s.values.forEach((v, ci) => {
            const cat = cats[ci] != null ? String(cats[ci]) : `#${ci + 1}`;
            const base = multi ? [cat, s.name] : [cat];
            if (v != null && typeof v === "object") { // candlestick / boxplot
                for (const [k, val] of Object.entries(v)) { push([...base, k], fmtVal(val, sUnit)); }
            } else {
                push(base, fmtVal(v, sUnit));
            }
        });
    }
    return rules;
}
