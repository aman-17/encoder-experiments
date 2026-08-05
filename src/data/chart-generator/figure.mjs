// Synthetic charts. Each chart is generated as a typed DATA MODEL first, then
// rendered to SVG by chartlib. The model IS the ground truth — chartDataPoints()
// recovers every plotted value exactly (charts_core v2.1 format).
//
// 28 chart types (chartlib.CHART_TYPES), multi-axis combos, multiple series.
// The chart type can be chosen by the LLM (doc.chartType) where it suits the
// page, else picked here.

import { CHART_TYPES, renderChartWithGeom } from "./chartlib.mjs";
import { loc, catLabels } from "./locales.mjs";

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

// CG_HARD palette: bias HEAVILY toward the failing-chart profile (multi-series
// grouped/stacked bars + multi-line/area), while still covering all 28 types so
// the hard set isn't just bars. ~75% land on the MULTI_SERIES family.
export const HARD_CHARTS = process.env.CG_HARD === "1" || process.env.CG_HARD === "true";
function pickHardType(rng) {
    return rng.weighted([
        ["groupedBar", 6], ["stackedBar", 6], ["stackedHBar", 4], ["percentBar", 4],
        ["multiLine", 5], ["stackedArea", 4], ["radar", 2], ["heatmap", 2],
        ["comboBarLine", 3], ["waterfall", 2],
        ["bar", 2], ["line", 2], ["hbar", 2], ["area", 1], ["pie", 1], ["donut", 1],
        ["scatter", 1], ["bubble", 1], ["funnel", 1], ["lollipop", 1], ["spline", 1],
        ["stepLine", 1], ["slope", 1], ["gauge", 1], ["pyramid", 1], ["histogram", 1],
        ["boxplot", 1], ["candlestick", 1],
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
    const type = (opts.type && CHART_TYPES.includes(opts.type)) ? opts.type : (HARD_CHARTS ? pickHardType(rng) : pickType(rng));
    // CG_HARD: dense (8-16 categories) so points-per-chart is high.
    const dense = opts.dense || HARD_CHARTS || rng.bool(0.35);
    // A monetary axis must use the DOCUMENT's currency, not a random "$": a chart
    // inside a kr / € / ₹ document showing "$0–$200" is clearly wrong. opts.currency
    // is a prefix symbol the chart can render, "OTHER"/anything else for a currency
    // it can't (kr, SEK, R$ …) -> neutral no-currency axis, or null/undefined for no
    // context (chart-focus) -> keep the "$" default.
    let unit = rng.pick(["", "", "$", "%"]);
    if (unit === "$") { unit = resolveMoneyUnit(opts.currency); }
    const baseHue = rng.int(0, 359);
    // multilingual: all chart labels come from the deterministic locale pack (gold-safe).
    const locale = opts.locale || "en";
    const T = loc(locale);
    // CG_HARD: values are NEVER printed on the chart -> must be read off the axis
    // (the need_estimate profile, 153/171 of the failing set).
    const options = { legend: true, grid: true, valueLabels: HARD_CHARTS ? false : rng.bool(0.25), baseHue };
    const isMoney = PREFIX_CCY.has(unit);
    const yTitlePool = unit === "%" ? [T.yTitles[3]] : isMoney ? [T.yTitles[1], T.yTitles[0]] : T.yTitles;
    const m = { type, title: opts.title || "", unit, options, xTitle: rng.bool(0.4) ? "x" : "", yTitle: rng.bool(0.5) ? rng.pick(yTitlePool) : "" };

    if (XY.has(type)) {
        const ns = type === "bubble" ? rng.int(1, 3) : rng.int(1, 3);
        m.series = Array.from({ length: ns }, (_, si) => ({
            name: T.series[si] || `S${si + 1}`,
            points: Array.from({ length: dense ? rng.int(16, 30) : rng.int(8, 16) }, () => ({
                x: rng.float(0, 100, 1), y: rng.float(0, 100, 1), r: type === "bubble" ? rng.float(1, 100, 0) : undefined,
            })),
        }));
        m.xTitle = rng.pick(T.yTitles);
        m.yTitle = rng.pick(T.yTitles);
        return m;
    }

    let nCat = SINGLE_SERIES.has(type) ? (type === "histogram" ? rng.int(8, 14) : rng.int(3, 7))
        : type === "slope" ? 2
            : (dense ? rng.int(9, 16) : rng.int(5, 9));
    const catKind = opts.catKind || catKindFor(type, rng);
    // catOffset shifts the category window so sibling charts on a multi-chart page
    // use DIFFERENT categories (distinct [cat,series] labels -> no gold collision).
    const catOffset = Math.max(0, opts.catOffset || 0);
    let categories = catLabels(locale, catKind, nCat + catOffset).slice(catOffset);
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
        m.xTitle = T.axis[catKind] || "";
    }
    const max = rng.pick([100, 1000, 50000, 1000000]);

    if (type === "comboBarLine") {
        m.series = [
            { name: T.series[0], values: seriesValues(rng, nCat, "bar", max), axis: "left", kind: "bar" },
            { name: T.series[1], values: seriesValues(rng, nCat, "bar", max), axis: "left", kind: "bar" },
            { name: `${T.series[4]} %`, values: seriesValues(rng, nCat, "line", 100), axis: "right", kind: "line" },
        ];
        m.unit2 = "%"; m.y2Title = `${T.series[4]} %`;
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
        m.series = Array.from({ length: rng.int(4, 7) }, (_, i) => ({ name: T.series[i] || `Item ${i + 1}`, values: [rng.int(20, 90), rng.int(20, 90)] }));
        return m;
    }

    // harder: 2-5 series for the multi-series family (more dimensions).
    const ns = SINGLE_SERIES.has(type) ? 1 : (MULTI_SERIES.has(type) ? rng.int(2, 5) : 1);
    const names = rng.shuffle(T.series).slice(0, ns);
    m.series = names.map((name) => ({ name: ns === 1 ? (unit === "%" ? T.yTitles[3] : T.yTitles[0]) : name, values: seriesValues(rng, nCat, type, unit === "%" ? 100 : max) }));
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
    // CG_HARD: always synthetic (derived charts are single-series [Value] — easy);
    // the hard profile is synthetic multi-series.
    // non-English -> always synthetic so labels come from the locale pack (derived
    // labels are the LLM table's language and would mismatch the chosen chart locale).
    const derived = !opts.forceSynthetic && !HARD_CHARTS && (opts.locale || "en") === "en" && sectionModel && deriveChartData(sectionModel);
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
        if (HARD_CHARTS && (!chartType || chartType === "bar")) {
            chartType = pickHardType(rng);
        } else if ((!chartType || chartType === "bar") && rng.bool(0.7)) {
            chartType = rng.pick(CHART_TYPES);
        }
        model = generateChartModel(rng, { title: captionText, dense: opts.dense, type: chartType, currency: opts.currency, catKind: opts.catKind, catOffset: opts.catOffset, locale: opts.locale });
    }
    const { svg, geom } = renderChartWithGeom(model);
    return { svg, geom, model, caption: captionText, figNum };
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

// Human-readable ground truth (chart->table markdown) — the chart analog of a
// table's expected_markdown. Built from the SAME chartDataPoints() the reward
// scores, so it can never diverge from the gold. One titled table per chart.
export function chartGoldMarkdown(models) {
    const out = [];
    (models || []).forEach((m, mi) => {
        const rules = chartDataPoints(m);
        if (!rules.length) { return; }
        const rows = []; const cols = []; const cell = {};
        for (const r of rules) {
            const labs = r.labels || [];
            const row = String(labs[0] ?? "");
            const col = labs.length > 1 ? labs.slice(1).join(" / ") : "Value";
            if (!rows.includes(row)) { rows.push(row); }
            if (!cols.includes(col)) { cols.push(col); }
            cell[`${row} ${col}`] = r.value;
        }
        const title = (m.title && String(m.title).trim()) || m.type || `Chart ${mi + 1}`;
        out.push(`### ${title} (${m.type})`, "");
        out.push(`| Category | ${cols.join(" | ")} |`);
        out.push(`| ${Array(cols.length + 1).fill("---").join(" | ")} |`);
        for (const row of rows) {
            out.push(`| ${row} | ${cols.map((c) => cell[`${row} ${c}`] ?? "").join(" | ")} |`);
        }
        out.push("");
    });
    return out.join("\n");
}

// ---- pixel-space chart geometry sidecar (<id>.pixels.json) -----------------
// Maps chartlib's SVG-user-space geometry (viewBox 520x300) into NORMALIZED
// PAGE coordinates: [0,1] over the whole page, x rightward, y DOWNWARD
// (top-left origin) — the probe convention in encoder_experiments/sites.py.
// Raw svg-space values are kept under svg_* keys for debugging. Emitted as a
// NEW per-doc sidecar; the existing test.json / gold.md schemas are untouched.
//
//   models   chart data models in on-page order (documentHtml's `figures`)
//   geoms    matching geometry from renderChartWithGeom (`figGeoms`)
//   svgRects viewport-px rects of each on-page chart <svg>, same order
//   scale    print scale applied by Chrome's pdf (fitScale result)
//   pageW/H  full page size in px (viewport == printed page @96dpi)
//   rotate   doc.rotate — a rotated/skewed page keeps svg-space geometry but
//            the linear svg->page mapping is invalid (page fields null).
export function chartPixelsSidecar({ models, geoms, svgRects, scale, pageW, pageH, rotate = null }) {
    const valid = !rotate;
    const round = (v) => (v == null || Number.isNaN(v) ? null : +Number(v).toFixed(6));
    const charts = models.map((m, i) => {
        const g = geoms[i] || {};
        const rect = svgRects[i];
        const svgW = g.svgW || 520;
        const svgH = g.svgH || 300;
        // svg user space -> viewport px. Prefer the measured getScreenCTM (it
        // accounts for the letterboxing "meet" adds when CSS breaks the box's
        // 520:300 aspect, e.g. slide max-height); fall back to the rect ratio.
        // Axis-aligned only — rotated/skewed pages are already page-invalid.
        const ctm = rect.ctm && Math.abs(rect.ctm.b) < 1e-6 && Math.abs(rect.ctm.c) < 1e-6 ? rect.ctm : null;
        const fx = ctm ? ctm.a : rect.w / svgW;
        const fy = ctm ? ctm.d : rect.h / svgH;
        const ox = ctm ? ctm.e : rect.x;
        const oy = ctm ? ctm.f : rect.y;
        const px = (v) => round(((ox + v * fx) * scale) / pageW);
        const py = (v) => round(((oy + v * fy) * scale) / pageH);
        const pw = (v) => round((v * fx * scale) / pageW);
        const ph = (v) => round((v * fy * scale) / pageH);
        const nRect = (r) => (valid && r ? { x: px(r.x), y: py(r.y), w: pw(r.w), h: ph(r.h) } : null);
        const nPt = (pt) => (valid && pt ? { x: px(pt.x), y: py(pt.y) } : null);

        let axis = null;
        if (g.axis) {
            axis = {};
            for (const k of ["valueAxis", "yMin", "yMax", "y2Min", "y2Max", "xMin", "xMax"]) {
                if (g.axis[k] != null) { axis[k] = g.axis[k]; }
            }
            if (g.axis.yTicks) { axis.yTicks = g.axis.yTicks.map((t) => ({ value: t.value, label: t.label, y: valid ? py(t.y) : null, svg_y: t.y })); }
            if (g.axis.y2Ticks) { axis.y2Ticks = g.axis.y2Ticks.map((t) => ({ value: t.value, label: t.label, y: valid ? py(t.y) : null, svg_y: t.y })); }
            if (g.axis.xTicks) { axis.xTicks = g.axis.xTicks.map((t) => ({ value: t.value, label: t.label, x: valid ? px(t.x) : null, svg_x: t.x })); }
            if (g.axis.xCategories) { axis.xCategories = g.axis.xCategories.map((c) => ({ label: c.label, xCenter: valid ? px(c.xCenter) : null, svg_xCenter: c.xCenter })); }
            if (g.axis.yCategories) { axis.yCategories = g.axis.yCategories.map((c) => ({ label: c.label, yCenter: valid ? py(c.yCenter) : null, svg_yCenter: c.yCenter })); }
        }

        // Marks: normalized page coords under x/y/w/h/r/anchor; the exact
        // svg-space values under svg_*. Any OTHER spatial field (arcEnd,
        // angles, x2/w2 …) is raw svg-space debug info.
        const marks = (g.marks || []).map((mk) => {
            const { x, y, w, h, r, anchor, ...rest } = mk;
            return {
                ...rest,
                x: valid && x != null ? px(x) : null,
                y: valid && y != null ? py(y) : null,
                w: valid && w != null ? pw(w) : null,
                h: valid && h != null ? ph(h) : null,
                r: valid && r != null ? pw(r) : null,
                anchor: nPt(anchor),
                svg_x: x ?? null, svg_y: y ?? null, svg_w: w ?? null, svg_h: h ?? null, svg_r: r ?? null,
                svg_anchor: anchor || null,
            };
        });

        const natural = {};
        for (const k of ["pie", "gauge", "radial", "grid", "funnel", "pyramid"]) {
            if (g[k]) { natural[k] = g[k]; }
        }

        return {
            chartType: g.chartType || m.type,
            geomKind: g.geomKind || null,
            title: m.title || "",
            svg_w: svgW,
            svg_h: svgH,
            svg_rect: valid ? { x: round((rect.x * scale) / pageW), y: round((rect.y * scale) / pageH), w: round((rect.w * scale) / pageW), h: round((rect.h * scale) / pageH) } : null,
            svg_rect_px: rect,
            plotRect: nRect(g.plotRect),
            svg_plotRect: g.plotRect || null,
            axis,
            svg_natural: Object.keys(natural).length ? natural : null,
            marks,
            legend: (g.legend || []).map((l) => ({ series: l.series, color: l.color, swatchRect: nRect(l.swatchRect), svg_swatchRect: l.swatchRect })),
        };
    });
    return {
        version: 1,
        convention: "normalized [0,1] over the page; x rightward, y downward (top-left origin)",
        page_w_px: pageW,
        page_h_px: pageH,
        print_scale: scale,
        rotate: rotate || null,
        page_coords_valid: valid,
        charts,
    };
}
