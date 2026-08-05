// test_geom.mjs — self-check for chartlib's structured geometry (no LLM, no
// browser). Builds a deterministic model for every chart type, renders it via
// renderChartWithGeom, and asserts:
//   (a) every cartesian mark falls inside plotRect,
//   (b) calibration round-trip: mapping each mark's axisValue (or dataX/dataY)
//       through the emitted axis lands within 1.5px of the emitted mark pixel,
//   (c) mark count matches the model's data count, and every chart_data_point
//       rule's locating labels appear among the marks,
//   (d) a sampled mark's coords appear as literal attributes in the SVG string.
//
//   node test_geom.mjs

import { CHART_TYPES, renderChartWithGeom, renderChart } from "./chartlib.mjs";
import { chartDataPoints } from "./figure.mjs";

const cats5 = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
const cats4 = ["North", "South", "East", "West"];
const v5a = [120, 260, 90, 310, 180];
const v5b = [60, 140, 220, 80, 200];
const v4a = [40, 75, 20, 55];
const v4b = [30, 45, 80, 25];
const pts8 = [
    { x: 5, y: 12 }, { x: 18, y: 44 }, { x: 27, y: 21 }, { x: 39, y: 67 },
    { x: 52, y: 38 }, { x: 66, y: 81 }, { x: 74, y: 55 }, { x: 91, y: 29 },
];

// Deterministic model + expected mark count per chart type.
export function testModels() {
    return [
        { type: "bar", expect: 5, model: { type: "bar", title: "Bar", categories: cats5, series: [{ name: "Revenue", values: v5a }], unit: "$", options: {} } },
        { type: "groupedBar", expect: 10, model: { type: "groupedBar", title: "Grouped", categories: cats5, series: [{ name: "A", values: v5a }, { name: "B", values: v5b }], unit: "", options: {} } },
        { type: "stackedBar", expect: 10, model: { type: "stackedBar", title: "Stacked", categories: cats5, series: [{ name: "A", values: v5a }, { name: "B", values: v5b }], unit: "", options: {} } },
        { type: "percentBar", expect: 10, model: { type: "percentBar", title: "Percent", categories: cats5, series: [{ name: "A", values: v5a }, { name: "B", values: v5b }], unit: "%", options: {} } },
        { type: "hbar", expect: 5, model: { type: "hbar", title: "HBar", categories: cats5, series: [{ name: "Value", values: v5a }], unit: "", options: {} } },
        { type: "stackedHBar", expect: 10, model: { type: "stackedHBar", title: "SHBar", categories: cats5, series: [{ name: "A", values: v5a }, { name: "B", values: v5b }], unit: "", options: {} } },
        { type: "line", expect: 5, model: { type: "line", title: "Line", categories: cats5, series: [{ name: "Value", values: v5a }], unit: "", options: {} } },
        { type: "multiLine", expect: 10, model: { type: "multiLine", title: "MultiLine", categories: cats5, series: [{ name: "A", values: v5a }, { name: "B", values: v5b }], unit: "", options: {} } },
        { type: "spline", expect: 5, model: { type: "spline", title: "Spline", categories: cats5, series: [{ name: "Value", values: v5a }], unit: "", options: {} } },
        { type: "stepLine", expect: 5, model: { type: "stepLine", title: "Step", categories: cats5, series: [{ name: "Value", values: v5a }], unit: "", options: {} } },
        { type: "area", expect: 5, model: { type: "area", title: "Area", categories: cats5, series: [{ name: "Value", values: v5a }], unit: "", options: {} } },
        { type: "stackedArea", expect: 10, model: { type: "stackedArea", title: "SArea", categories: cats5, series: [{ name: "A", values: v5a }, { name: "B", values: v5b }], unit: "", options: {} } },
        { type: "scatter", expect: 8, model: { type: "scatter", title: "Scatter", series: [{ name: "S1", points: pts8 }], options: {} } },
        { type: "bubble", expect: 8, model: { type: "bubble", title: "Bubble", series: [{ name: "S1", points: pts8.map((q, i) => ({ ...q, r: 5 + i * 9 })) }], options: {} } },
        { type: "pie", expect: 4, model: { type: "pie", title: "Pie", categories: cats4, series: [{ name: "Share", values: v4a }], unit: "", options: {} } },
        { type: "donut", expect: 4, model: { type: "donut", title: "Donut", categories: cats4, series: [{ name: "Share", values: v4a }], unit: "", options: {} } },
        { type: "radar", expect: 10, model: { type: "radar", title: "Radar", categories: cats5, series: [{ name: "A", values: [40, 75, 20, 55, 62] }, { name: "B", values: [30, 45, 80, 25, 51] }], unit: "", options: {} } },
        { type: "waterfall", expect: 5, model: { type: "waterfall", title: "Waterfall", categories: cats5, series: [{ name: "Bridge", values: [80, -25, 40, -15, 30] }], unit: "", options: {} } },
        { type: "funnel", expect: 4, model: { type: "funnel", title: "Funnel", categories: cats4, series: [{ name: "Stage", values: [900, 640, 320, 110] }], unit: "", options: {} } },
        { type: "histogram", expect: 8, model: { type: "histogram", title: "Hist", categories: ["0-1", "1-2", "2-3", "3-4", "4-5", "5-6", "6-7", "7-8"], series: [{ name: "Count", values: [3, 9, 17, 25, 21, 12, 6, 2] }], unit: "", options: {} } },
        { type: "lollipop", expect: 5, model: { type: "lollipop", title: "Lollipop", categories: cats5, series: [{ name: "Value", values: v5a }], unit: "", options: {} } },
        { type: "comboBarLine", expect: 12, model: { type: "comboBarLine", title: "Combo", categories: cats4, series: [{ name: "Rev", values: v4a.map((v) => v * 100), kind: "bar" }, { name: "Cost", values: v4b.map((v) => v * 100), kind: "bar" }, { name: "Margin %", values: [22, 31, 18, 27], kind: "line", axis: "right" }], unit: "$", unit2: "%", options: {} } },
        { type: "slope", expect: 6, model: { type: "slope", title: "Slope", categories: ["2019", "2024"], series: [{ name: "A", values: [30, 62] }, { name: "B", values: [55, 41] }, { name: "C", values: [70, 82] }], unit: "", options: {} } },
        { type: "heatmap", expect: 12, model: { type: "heatmap", title: "Heat", categories: cats4, series: [{ name: "R1", values: v4a }, { name: "R2", values: v4b }, { name: "R3", values: [65, 12, 48, 90] }], unit: "", options: {} } },
        { type: "gauge", expect: 1, model: { type: "gauge", title: "Gauge", gaugeMax: 100, categories: ["Utilization"], series: [{ name: "KPI", values: [64] }], unit: "%", options: {} } },
        { type: "pyramid", expect: 8, model: { type: "pyramid", title: "Pyramid", categories: cats4, series: [{ name: "Male", values: v4a }, { name: "Female", values: v4b }], unit: "", options: {} } },
        { type: "boxplot", expect: 15, model: { type: "boxplot", title: "Box", categories: ["G1", "G2", "G3"], series: [{ name: "Distribution", values: [{ min: 10, q1: 22, med: 30, q3: 41, max: 55 }, { min: 18, q1: 30, med: 39, q3: 52, max: 66 }, { min: 5, q1: 14, med: 20, q3: 28, max: 40 }] }], unit: "", options: {} } },
        { type: "candlestick", expect: 16, model: { type: "candlestick", title: "Candle", categories: cats4, series: [{ name: "Price", values: [{ o: 100, h: 112, l: 95, c: 108 }, { o: 108, h: 118, l: 104, c: 106 }, { o: 106, h: 109, l: 92, c: 96 }, { o: 96, h: 105, l: 94, c: 103 }] }], unit: "$", options: {} } },
    ];
}

// ---- assertions ------------------------------------------------------------

const TOL = 1.5;
function near(a, b, tol = TOL) { return Math.abs(a - b) <= tol; }

function yFor(axis, v, p) { return p.y + p.h - (p.h * (v - axis.yMin)) / (axis.yMax - axis.yMin); }
function y2For(axis, v, p) { return p.y + p.h - (p.h * (v - axis.y2Min)) / (axis.y2Max - axis.y2Min); }
function xFor(axis, v, p) { return p.x + (p.w * (v - axis.xMin)) / (axis.xMax - axis.xMin); }

// Containment is about the mark's POSITION (rect extent for bars/cells, center
// for points) — a point glyph's radius may legitimately overhang the plot edge
// when its center sits exactly on the boundary.
function inRect(m, p, eps) {
    const x1 = m.w != null ? m.x + m.w : m.x;
    const y1 = m.h != null ? m.y + m.h : m.y;
    return m.x >= p.x - eps && m.y >= p.y - eps && x1 <= p.x + p.w + eps && y1 <= p.y + p.h + eps;
}

// The literal SVG-attribute substring a sampled mark must appear as.
function literalNeedle(type, marks) {
    const m = marks[0];
    switch (type) {
        case "bar": case "groupedBar": case "stackedBar": case "percentBar":
        case "hbar": case "stackedHBar": case "waterfall": case "histogram":
        case "heatmap": case "pyramid":
            return `x="${m.x.toFixed(1)}" y="${m.y.toFixed(1)}"`;
        case "comboBarLine":
            return `x="${m.x.toFixed(1)}" y="${m.y.toFixed(1)}"`; // first mark is a bar
        case "line": case "multiLine": case "spline": case "stepLine": case "lollipop":
        case "scatter": case "bubble":
            return `cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}"`;
        case "area": case "stackedArea":
            return `${m.x.toFixed(1)},${m.y.toFixed(1)}`; // path vertex
        case "pie": case "donut":
            return `${m.arcEnd.x.toFixed(1)},${m.arcEnd.y.toFixed(1)}`;
        case "radar": case "funnel": case "gauge":
            return `${m.x.toFixed(1)},${m.y.toFixed(1)}`;
        case "slope":
            return `cy="${m.y.toFixed(1)}"`;
        case "boxplot": {
            const med = marks.find((k) => k.part === "med");
            return `y1="${med.y.toFixed(1)}"`;
        }
        case "candlestick": {
            const hi = marks.find((k) => k.part === "h");
            return `y1="${hi.y.toFixed(1)}"`;
        }
        default:
            return null;
    }
}

function checkOne({ type, model, expect }) {
    const errs = [];
    const { svg, geom } = renderChartWithGeom(model);
    const ok = (cond, msg) => { if (!cond) { errs.push(msg); } };

    ok(!geom.fallback, "renderer fell back to bar (threw)");
    ok(geom.chartType === type, `chartType ${geom.chartType} != ${type}`);
    ok(geom.marks.length === expect, `mark count ${geom.marks.length} != expected ${expect}`);

    // (a) containment. chartlib's extent() nice-rounding can leave the axis top
    // BELOW the data max when zero isn't included (e.g. data [12..81] -> axis
    // [0, 80]); such a point really is drawn outside the plot, so containment
    // only applies to marks whose data lies within the emitted axis range —
    // the round-trip check below still validates out-of-range marks exactly.
    const withinAxis = (m) => {
        const ax = geom.axis;
        if (!ax) { return true; }
        if (m.dataX != null) { return m.dataX >= ax.xMin && m.dataX <= ax.xMax && m.dataY >= ax.yMin && m.dataY <= ax.yMax; }
        if (m.axisValue == null) { return true; }
        if (ax.valueAxis === "x") { return m.axisValue >= ax.xMin && m.axisValue <= ax.xMax; }
        if (m.axis === "right") { return m.axisValue >= ax.y2Min && m.axisValue <= ax.y2Max; }
        return m.axisValue >= ax.yMin && m.axisValue <= ax.yMax;
    };
    if (geom.plotRect) {
        for (const m of geom.marks) {
            if (!withinAxis(m)) { continue; }
            ok(inRect(m, geom.plotRect, 1.1), `mark ${JSON.stringify(m.labels)} outside plotRect`);
        }
    } else {
        ok(["polar", "radial", "funnel"].includes(geom.geomKind), `no plotRect and geomKind=${geom.geomKind}`);
    }

    // (b) calibration round-trip
    const a = geom.axis; const p = geom.plotRect;
    if (a && p) {
        for (const m of geom.marks) {
            if (m.dataX != null) { // scatter/bubble: both axes numeric
                ok(near(xFor(a, m.dataX, p), m.anchor.x), `x round-trip off for ${JSON.stringify(m.labels)}`);
                ok(near(yFor(a, m.dataY, p), m.anchor.y), `y round-trip off for ${JSON.stringify(m.labels)}`);
            } else if (m.axisValue != null) {
                if (a.valueAxis === "x") {
                    ok(near(xFor(a, m.axisValue, p), m.anchor.x), `x round-trip off for ${JSON.stringify(m.labels)}`);
                } else if (m.axis === "right") {
                    ok(near(y2For(a, m.axisValue, p), m.anchor.y), `y2 round-trip off for ${JSON.stringify(m.labels)}`);
                } else {
                    ok(near(yFor(a, m.axisValue, p), m.anchor.y), `y round-trip off for ${JSON.stringify(m.labels)}`);
                }
            }
        }
        for (const t of a.yTicks || []) { ok(near(yFor(a, t.value, p), t.y), `yTick ${t.value} off`); }
        for (const t of a.y2Ticks || []) { ok(near(y2For(a, t.value, p), t.y), `y2Tick ${t.value} off`); }
        for (const t of a.xTicks || []) { if (a.xMin != null) { ok(near(xFor(a, t.value, p), t.x), `xTick ${t.value} off`); } }
    }

    // (c2) every chart_data_point rule is locatable: its leading labels match a mark
    const markKeys = new Set(geom.marks.map((m) => JSON.stringify(m.labels)));
    for (const r of chartDataPoints(model)) {
        const labs = r.labels;
        const direct = markKeys.has(JSON.stringify(labs));
        const parent = labs.length > 1 && markKeys.has(JSON.stringify(labs.slice(0, -1))); // scatter x/y/size
        ok(direct || parent, `rule ${JSON.stringify(labs)} has no matching mark`);
    }

    // (d) literal attributes in the SVG string
    const needle = literalNeedle(type, geom.marks);
    if (needle != null) { ok(svg.includes(needle), `literal "${needle}" not in svg`); }

    // renderChart (string API) must match
    ok(renderChart(model) === svg, "renderChart != renderChartWithGeom().svg");

    return errs;
}

function main() {
    const models = testModels();
    const covered = new Set(models.map((m) => m.type));
    const missing = CHART_TYPES.filter((t) => !covered.has(t));
    let failures = 0;
    for (const tc of models) {
        const errs = checkOne(tc);
        if (errs.length) {
            failures += 1;
            console.log(`FAIL ${tc.type}`);
            for (const e of errs) { console.log(`   - ${e}`); }
        } else {
            console.log(`ok   ${tc.type} (${tc.expect} marks)`);
        }
    }
    if (missing.length) { console.log(`MISSING coverage for: ${missing.join(", ")}`); failures += 1; }
    console.log(failures ? `\n${failures} FAILURES` : `\nall ${models.length} chart types passed`);
    process.exit(failures ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) { main(); }
