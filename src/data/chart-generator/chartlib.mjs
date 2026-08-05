// chartlib.mjs — a self-contained, DOM-free SVG charting library.
//
// renderChart(model) -> SVG string. The model is also the ground truth (every
// rendered value is present in model.series), so chartDataPoints() can recover
// every point exactly.
//
// Model shape:
//   {
//     type,                       // one of CHART_TYPES
//     title, xTitle, yTitle, y2Title,
//     categories: [string],       // x labels for categorical charts
//     series: [{ name, values, axis?, kind? }],
//        values: [number]                       (categorical charts)
//             or [{x,y,r?}]                      (scatter/bubble)
//             or [{o,h,l,c}]                     (candlestick)
//             or [{min,q1,med,q3,max}]           (boxplot)
//        axis:  'left' | 'right'  (multi-axis)
//        kind:  'bar' | 'line' | 'area'  (combo charts)
//     unit, unit2, options: { legend, grid, valueLabels, palette }
//   }

export const CHART_TYPES = [
    "bar", "groupedBar", "stackedBar", "percentBar", "hbar", "stackedHBar",
    "line", "multiLine", "spline", "stepLine", "area", "stackedArea",
    "scatter", "bubble", "pie", "donut", "radar", "waterfall", "funnel",
    "histogram", "lollipop", "comboBarLine", "slope", "heatmap", "gauge",
    "pyramid", "boxplot", "candlestick",
];

const W = 520;
const H = 300;

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function trunc(s, n) {
    const str = String(s);
    return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}
function fmt(v, unit) {
    if (v == null || Number.isNaN(v)) {
        return "";
    }
    const a = Math.abs(v);
    let s;
    if (a >= 1e9) { s = `${(v / 1e9).toFixed(1)}B`; }
    else if (a >= 1e6) { s = `${(v / 1e6).toFixed(1)}M`; }
    else if (a >= 1e4) { s = `${(v / 1e3).toFixed(0)}k`; }
    else { s = String(Math.round(v * 100) / 100); }
    if (unit === "%") { return `${s}%`; }
    if (unit === "$" || unit === "€" || unit === "£" || unit === "¥") { return `${unit}${s}`; }
    return s;
}
function hsl(h, s, l) { return `hsl(${h}, ${s}%, ${l}%)`; }

export function palette(n, base = 210) {
    const out = [];
    const step = n <= 1 ? 0 : 300 / n;
    for (let i = 0; i < n; i++) {
        out.push(hsl(Math.round((base + i * step) % 360), 55, 46));
    }
    return out;
}

// ---- geometry accumulator --------------------------------------------------
// While a renderer builds its SVG string it also records every mark's exact
// position (same locals, so float-identical to the emitted attributes) into a
// module-level accumulator. renderChartWithGeom() returns {svg, geom}:
//   geom = { chartType, geomKind, svgW, svgH, plotRect, axis, marks, legend,
//            fallback, (pie|gauge|radial|grid|funnel|pyramid natural geometry) }
// All coordinates are SVG user space (viewBox 0 0 520 300, y downward).
//   axis (cartesian only, else null):
//     { yMin, yMax, yTicks:[{value,label,y}], y2Min?, y2Max?, y2Ticks?,
//       xMin?, xMax?, xTicks:[{value,label,x}],
//       xCategories:[{label,xCenter}] | yCategories:[{label,yCenter}],
//       valueAxis: "y" | "x" | "xy" }
//   marks: [{ kind, seriesIndex, seriesName, labels (chart_data_point rule
//     labels convention), value, x, y, w?, h?, r?, color, anchor:{x,y},
//     axisValue (number the anchor maps to on the value axis), ...extras }]
let G = null;
function newGeom(chartType) {
    return { chartType, geomKind: null, svgW: W, svgH: H, plotRect: null, axis: null, marks: [], legend: [], fallback: false };
}
function gSet(patch) { if (G) { Object.assign(G, patch); } }
function gAxis(patch) { if (G) { G.axis = Object.assign(G.axis || {}, patch); } }
function gMark(m) { if (G) { G.marks.push(m); } }
function gAxisPush(key, entry) {
    if (G) {
        const a = (G.axis = G.axis || {});
        (a[key] = a[key] || []).push(entry);
    }
}
// Labels for a mark, matching the chartDataPoints() rule labels convention.
function ruleCat(model, ci) {
    const cats = model.categories || [];
    return cats[ci] != null ? String(cats[ci]) : `#${ci + 1}`;
}
function ruleLabels(model, ci, s) {
    return (model.series || []).length > 1 ? [ruleCat(model, ci), s.name] : [ruleCat(model, ci)];
}

function svg(inner, opts = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" width="100%" role="img">${opts.bg ? `<rect width="${W}" height="${H}" fill="${opts.bg}"/>` : ""}${inner}</svg>`;
}
function title(t) {
    return t ? `<text x="${W / 2}" y="17" font-size="12" font-weight="600" text-anchor="middle" fill="#222">${esc(trunc(t, 60))}</text>` : "";
}

// Plot rectangle (leaves room for title, axes, legend).
function plot(model, opts = {}) {
    const padT = (model.title ? 28 : 12) + (opts.top || 0);
    const padB = 46 + (model.xTitle ? 14 : 0);
    const padL = 48 + (model.yTitle ? 14 : 0) + (opts.left || 0);
    const padR = 16 + (opts.right || 0) + (model.series && model.series.some((s) => s.axis === "right") ? 34 : 0);
    return { x: padL, y: padT, w: W - padL - padR, h: H - padT - padB };
}

function legend(series, colors, p) {
    if (!series || series.length < 2) { return ""; }
    let out = "";
    series.forEach((s, i) => {
        const x = p.x + i * Math.min(110, (p.w) / series.length);
        if (G) { G.legend.push({ series: s.name, color: colors[i], swatchRect: { x, y: H - 14, w: 9, h: 9 } }); }
        out += `<rect x="${x}" y="${H - 14}" width="9" height="9" fill="${colors[i]}"/><text x="${x + 12}" y="${H - 6}" font-size="9" fill="#444">${esc(trunc(s.name, 13))}</text>`;
    });
    return out;
}

function axisTitles(model, p) {
    let out = "";
    if (model.yTitle) { out += `<text x="12" y="${p.y + p.h / 2}" font-size="9" fill="#555" text-anchor="middle" transform="rotate(-90 12 ${p.y + p.h / 2})">${esc(trunc(model.yTitle, 28))}</text>`; }
    if (model.y2Title) { out += `<text x="${W - 6}" y="${p.y + p.h / 2}" font-size="9" fill="#555" text-anchor="middle" transform="rotate(90 ${W - 6} ${p.y + p.h / 2})">${esc(trunc(model.y2Title, 28))}</text>`; }
    if (model.xTitle) {
        // When a legend occupies the bottom strip, lift the x-axis title onto its
        // own line above it so the two don't overlap (e.g. "Region" over "EBITDA").
        const hasLegend = model.series && model.series.length >= 2;
        const xy = hasLegend ? H - 18 : H - 4;
        out += `<text x="${p.x + p.w / 2}" y="${xy}" font-size="9" fill="#555" text-anchor="middle">${esc(trunc(model.xTitle, 36))}</text>`;
    }
    return out;
}

// y gridlines + axis ticks for [min,max] on the given side.
function yGrid(p, min, max, unit, side = "left") {
    const ticks = 4;
    let out = "";
    for (let i = 0; i <= ticks; i++) {
        const v = min + (max - min) * (i / ticks);
        const y = p.y + p.h - (p.h * i) / ticks;
        gAxisPush(side === "left" ? "yTicks" : "y2Ticks", { value: v, label: fmt(v, unit), y });
        if (side === "left") {
            out += `<line x1="${p.x}" y1="${y.toFixed(1)}" x2="${p.x + p.w}" y2="${y.toFixed(1)}" stroke="#eee"/>`;
            out += `<text x="${p.x - 4}" y="${(y + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#666">${esc(fmt(v, unit))}</text>`;
        } else {
            out += `<text x="${p.x + p.w + 4}" y="${(y + 3).toFixed(1)}" font-size="8" text-anchor="start" fill="#888">${esc(fmt(v, unit))}</text>`;
        }
    }
    return out;
}

function xCatLabels(cats, p) {
    const band = p.w / cats.length;
    return cats.map((c, i) => {
        const x = p.x + band * (i + 0.5);
        gAxisPush("xCategories", { label: String(c), xCenter: x });
        return `<text x="${x.toFixed(1)}" y="${p.y + p.h + 12}" font-size="8" text-anchor="end" transform="rotate(-32 ${x.toFixed(1)} ${p.y + p.h + 12})" fill="#555">${esc(trunc(c, 10))}</text>`;
    }).join("");
}

function valueLabel(x, y, v, unit) {
    // Use the full number (matching the chart ground truth fmtVal), not the
    // abbreviated axis form — a printed bar label must read exactly like its
    // chart_data_point ("12,049", not "12k").
    if (v == null || Number.isNaN(v)) { return ""; }
    const n = Number(v).toLocaleString("en-US");
    const s = unit === "%" ? `${v}%`
        : (unit === "$" || unit === "€" || unit === "£" || unit === "¥") ? `${unit}${n}` : n;
    return `<text x="${x.toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="7.5" text-anchor="middle" fill="#444">${esc(s)}</text>`;
}

// A "nice" round step (1/2/2.5/5 x 10^k) for splitting a range into ~`ticks`.
function niceStep(range, ticks) {
    const raw = range / ticks;
    const exp = Math.floor(Math.log10(raw));
    const base = Math.pow(10, exp);
    const f = raw / base;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * base;
}

function extent(values, includeZero = true) {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (min === max) { max = min + 1; }
    // Round to "nice" bounds so the 4 axis gridlines land on round numbers
    // (0/50/100/150 instead of 0/41.25/82.5/123.75). yGrid always draws 4
    // ticks, so make the span exactly 4 nice steps wide and still cover the data.
    const step = niceStep(max - min, 4);
    const niceMin = Math.floor(min / step) * step;
    return [niceMin, niceMin + step * 4];
}

// ---- renderers ------------------------------------------------------------

function rBars(model, colors, { grouped = false, stacked = false, percent = false } = {}) {
    const p = plot(model);
    const cats = model.categories;
    const ns = model.series.length;
    let colTotals = cats.map((_, ci) => model.series.reduce((s, se) => s + (se.values[ci] || 0), 0));
    let max;
    let min = 0;
    if (percent) { max = 1; } else if (stacked) { [min, max] = extent(colTotals); } else { [min, max] = extent(model.series.flatMap((s) => s.values)); }
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const band = p.w / cats.length;
    const bw = Math.min(50, band * 0.72);
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y" });
    let bars = "";
    cats.forEach((_, ci) => {
        if (stacked || percent) {
            let acc = 0;
            const total = percent ? (colTotals[ci] || 1) : 1;
            model.series.forEach((s, si) => {
                const val = percent ? (s.values[ci] || 0) / total : (s.values[ci] || 0);
                const h = (p.h * val) / (max - min);
                const x = p.x + band * ci + (band - bw) / 2;
                const y = sy(min + acc + val);
                bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${colors[si]}"/>`;
                gMark({ kind: "bar", seriesIndex: si, seriesName: s.name, labels: ruleLabels(model, ci, s), value: s.values[ci] || 0, plotted: val, x, y, w: bw, h: Math.max(0, h), color: colors[si], anchor: { x: x + bw / 2, y }, axisValue: min + acc + val });
                acc += val;
            });
        } else {
            const sub = grouped ? bw / ns : bw;
            model.series.forEach((s, si) => {
                const v = s.values[ci] || 0;
                const y0 = sy(0);
                const y1 = sy(v);
                const x = p.x + band * ci + (band - bw) / 2 + (grouped ? sub * si : 0);
                const dw = sub * (grouped ? 0.9 : 1);
                bars += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${dw.toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" fill="${colors[si]}"/>`;
                gMark({ kind: "bar", seriesIndex: si, seriesName: s.name, labels: ruleLabels(model, ci, s), value: v, x, y: Math.min(y0, y1), w: dw, h: Math.abs(y1 - y0), color: colors[si], anchor: { x: x + dw / 2, y: y1 }, axisValue: v });
                if (model.options?.valueLabels && ns === 1) { bars += valueLabel(x + sub / 2, y1, v, model.unit); }
            });
        }
    });
    return svg(title(model.title) + yGrid(p, min, percent ? 1 : max, percent ? "%" : model.unit) + bars + xCatLabels(cats, p) + axisTitles(model, p) + legend(model.series, colors, p));
}

function rHBars(model, colors, stacked = false) {
    // wider left gutter so horizontal-bar category labels (which can be long, e.g.
    // process / country names) aren't clipped.
    const p = plot(model, { right: 10, left: 46 });
    // Overlay-marker mode: keep the bar's palette colour but give the marker
    // series (2018 diamond, 2024 tick) fixed high-contrast colours so the
    // year-points are clearly readable — and the legend matches them.
    if (model.options && model.options.markers && !stacked) {
        colors = colors.slice();
        const mk = ["#111111", "#d1495b", "#2a9d8f", "#e9c46a"];
        for (let i = 1; i < colors.length; i++) { colors[i] = mk[(i - 1) % mk.length]; }
    }
    const cats = model.categories;
    const colTotals = cats.map((_, ci) => model.series.reduce((s, se) => s + (se.values[ci] || 0), 0));
    const [rawMin, dataMax] = stacked ? extent(colTotals) : extent(model.series.flatMap((s) => s.values));
    const min = stacked ? rawMin : Math.min(0, rawMin); // bars start at the 0 axis
    const step = niceStep((dataMax - min) || 1, 5);
    const max = Math.max(dataMax, min + step, Math.ceil(dataMax / step) * step); // round axis top
    const sx = (v) => p.x + (p.w * (v - min)) / (max - min);
    const band = p.h / cats.length;
    const bh = Math.min(22, band * 0.7);
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ xMin: min, xMax: max, valueAxis: "x" });
    // VALUE AXIS: vertical gridlines + bottom tick labels, so bar/marker values
    // can be read off the axis (needed for the estimate-from-axis chart profile).
    let bars = "";
    for (let v = min; v <= max + 1e-6; v += step) {
        const gx = sx(v);
        gAxisPush("xTicks", { value: v, label: fmt(v, model.unit), x: gx });
        bars += `<line x1="${gx.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${(p.y + p.h).toFixed(1)}" stroke="#e8e8e8"/>`;
        bars += `<text x="${gx.toFixed(1)}" y="${(p.y + p.h + 12).toFixed(1)}" font-size="8" text-anchor="middle" fill="#666">${esc(fmt(v, model.unit))}</text>`;
    }
    cats.forEach((c, ci) => {
        const y = p.y + band * ci + (band - bh) / 2;
        gAxisPush("yCategories", { label: String(c), yCenter: y + bh / 2 });
        if (stacked) {
            let acc = 0;
            model.series.forEach((s, si) => {
                const v = s.values[ci] || 0;
                const x0 = sx(min + acc);
                const w = (p.w * v) / (max - min);
                bars += `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[si]}"/>`;
                gMark({ kind: "bar", seriesIndex: si, seriesName: s.name, labels: ruleLabels(model, ci, s), value: v, x: x0, y, w: Math.max(0, w), h: bh, color: colors[si], anchor: { x: x0 + Math.max(0, w), y: y + bh / 2 }, axisValue: min + acc + v });
                acc += v;
            });
        } else {
            const v = model.series[0].values[ci] || 0;
            // per-bar colour (e.g. colour-code each bar by a category group)
            const barFill = (model.barColors && model.barColors[ci]) || colors[0];
            bars += `<rect x="${sx(0).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, sx(v) - sx(0)).toFixed(1)}" height="${bh.toFixed(1)}" fill="${barFill}"/>`;
            gMark({ kind: "bar", seriesIndex: 0, seriesName: model.series[0].name, labels: ruleLabels(model, ci, model.series[0]), value: v, x: sx(0), y, w: Math.max(0, sx(v) - sx(0)), h: bh, color: barFill, anchor: { x: sx(v), y: y + bh / 2 }, axisValue: v });
            // Overlay-marker series: series[0] is the bar; series[1..] are point
            // markers (diamond, then vertical tick) at their value on the same axis
            // — the "Score 2018 / Score 2024" scoreboard pattern.
            if (model.options && model.options.markers && model.series.length > 1) {
                const cy = y + bh / 2;
                for (let si = 1; si < model.series.length; si++) {
                    const mv = model.series[si].values[ci] || 0;
                    const mx = sx(mv);
                    gMark({ kind: "marker", seriesIndex: si, seriesName: model.series[si].name, labels: ruleLabels(model, ci, model.series[si]), value: mv, x: mx, y: cy, color: colors[si], anchor: { x: mx, y: cy }, axisValue: mv });
                    if (si % 2 === 1) {
                        const r = 3.6;
                        bars += `<path d="M${mx.toFixed(1)} ${(cy - r).toFixed(1)} L${(mx + r).toFixed(1)} ${cy.toFixed(1)} L${mx.toFixed(1)} ${(cy + r).toFixed(1)} L${(mx - r).toFixed(1)} ${cy.toFixed(1)} Z" fill="${colors[si]}"/>`;
                    } else {
                        bars += `<rect x="${(mx - 1).toFixed(1)}" y="${(cy - 5).toFixed(1)}" width="2" height="10" fill="${colors[si]}"/>`;
                    }
                }
            }
        }
        bars += `<text x="${p.x - 4}" y="${(y + bh / 2 + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#555">${esc(trunc(c, 22))}</text>`;
    });
    const leg = (model.options && model.options.customLegend) ? "" : legend(model.series, colors, p);
    return svg(title(model.title) + bars + axisTitles(model, p) + leg);
}

function linePath(pts, smooth) {
    if (!smooth || pts.length < 3) { return `M${pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" L")}`; }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const x0 = pts[i][0]; const y0 = pts[i][1]; const x1 = pts[i + 1][0]; const y1 = pts[i + 1][1];
        const cx = (x0 + x1) / 2;
        d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
}

function rLines(model, colors, { area = false, stacked = false, smooth = false, step = false } = {}) {
    const p = plot(model);
    const cats = model.categories;
    const n = cats.length;
    let stackAcc = cats.map(() => 0);
    let allVals;
    if (stacked) { allVals = cats.map((_, ci) => model.series.reduce((s, se) => s + (se.values[ci] || 0), 0)); }
    else { allVals = model.series.flatMap((s) => s.values); }
    const [min, max] = extent(allVals, area || stacked);
    const sx = (i) => p.x + (n > 1 ? (p.w * i) / (n - 1) : p.w / 2);
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y" });
    let out = "";
    const ordered = stacked ? [...model.series] : model.series;
    ordered.forEach((s, si) => {
        let axisVals;
        if (stacked) { axisVals = cats.map((_, ci) => { stackAcc[ci] += (s.values[ci] || 0); return stackAcc[ci]; }); }
        else { axisVals = cats.map((_, ci) => s.values[ci] || 0); }
        const pts = axisVals.map((av, ci) => [sx(ci), sy(av)]);
        pts.forEach((q, ci) => gMark({ kind: "point", seriesIndex: si, seriesName: s.name, labels: ruleLabels(model, ci, s), value: s.values[ci] || 0, x: q[0], y: q[1], r: area ? undefined : 2.2, color: colors[si], anchor: { x: q[0], y: q[1] }, axisValue: axisVals[ci] }));
        let d = step
            ? `M${pts.map((q, i) => i === 0 ? `${q[0].toFixed(1)},${q[1].toFixed(1)}` : `${pts[i - 1][0].toFixed(1)},${q[1].toFixed(1)} ${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" L")}`
            : linePath(pts, smooth);
        if (area) {
            const base = stacked ? (si === 0 ? sy(min) : null) : sy(Math.max(min, 0));
            out += `<path d="${d} L${pts[pts.length - 1][0].toFixed(1)},${(base ?? sy(min)).toFixed(1)} L${pts[0][0].toFixed(1)},${(base ?? sy(min)).toFixed(1)} Z" fill="${colors[si]}" opacity="0.3"/>`;
        }
        out += `<path d="${d}" fill="none" stroke="${colors[si]}" stroke-width="2"/>`;
        if (!area) { out += pts.map((q) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.2" fill="${colors[si]}"/>`).join(""); }
    });
    return svg(title(model.title) + yGrid(p, min, max, model.unit) + out + xCatLabels(cats, p) + axisTitles(model, p) + legend(model.series, colors, p));
}

function rScatter(model, colors, bubble = false) {
    const p = plot(model);
    const pts = model.series.flatMap((s, si) => s.points.map((pt, pi) => ({ ...pt, si, pi, sname: s.name })));
    const xs = pts.map((q) => q.x); const ys = pts.map((q) => q.y);
    const [xmin, xmax] = extent(xs, false); const [ymin, ymax] = extent(ys, false);
    const sx = (v) => p.x + (p.w * (v - xmin)) / (xmax - xmin);
    const sy = (v) => p.y + p.h - (p.h * (v - ymin)) / (ymax - ymin);
    const rmax = bubble ? Math.max(...pts.map((q) => q.r || 1)) : 1;
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ xMin: xmin, xMax: xmax, yMin: ymin, yMax: ymax, valueAxis: "xy", xTicks: [{ value: xmin, label: fmt(xmin, ""), x: p.x }, { value: xmax, label: fmt(xmax, ""), x: p.x + p.w }] });
    const multiS = model.series.length > 1;
    const dots = pts.map((q) => {
        const cx = sx(q.x); const cy = sy(q.y);
        const rr = bubble ? (3 + 9 * Math.sqrt((q.r || 1) / rmax)) : 3;
        gMark({ kind: bubble ? "bubble" : "point", seriesIndex: q.si, seriesName: q.sname, labels: multiS ? [q.sname, `#${q.pi + 1}`] : [`#${q.pi + 1}`], value: null, dataX: q.x, dataY: q.y, dataR: q.r ?? null, x: cx, y: cy, r: rr, color: colors[q.si], anchor: { x: cx, y: cy } });
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${bubble ? rr.toFixed(1) : 3}" fill="${colors[q.si]}" opacity="0.72"/>`;
    }).join("");
    return svg(title(model.title) + yGrid(p, ymin, ymax, model.unit) + `<text x="${p.x}" y="${p.y + p.h + 12}" font-size="8" fill="#666">${esc(fmt(xmin, ""))}</text><text x="${p.x + p.w}" y="${p.y + p.h + 12}" font-size="8" text-anchor="end" fill="#666">${esc(fmt(xmax, ""))}</text>` + dots + axisTitles(model, p) + legend(model.series, colors, p));
}

function rPie(model, colors, donut = false) {
    const cx = W / 2 - 36; const cy = (model.title ? 26 : 12) + (H - 38) / 2; const r = 92;
    const vals = model.series[0].values;
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    let ang = -Math.PI / 2; let slices = ""; let leg = "";
    gSet({ geomKind: "polar", pie: { cx, cy, r, holeR: donut ? Number((r * 0.55).toFixed(0)) : 0 } });
    model.categories.forEach((c, i) => {
        const frac = (vals[i] || 0) / total;
        const a2 = ang + frac * Math.PI * 2;
        const large = frac > 0.5 ? 1 : 0;
        const x1 = cx + r * Math.cos(ang); const y1 = cy + r * Math.sin(ang);
        const x2 = cx + r * Math.cos(a2); const y2 = cy + r * Math.sin(a2);
        const mid = (ang + a2) / 2;
        const cr = donut ? r * 0.775 : r * 0.6; // slice-centroid radius (mid-annulus for donut)
        gMark({ kind: "slice", seriesIndex: 0, seriesName: model.series[0].name, labels: [ruleCat(model, i)], value: `${Math.round(frac * 100)}%`, rawValue: vals[i] || 0, frac, startAngle: ang, endAngle: a2, x: cx + cr * Math.cos(mid), y: cy + cr * Math.sin(mid), color: colors[i % colors.length], anchor: { x: cx + cr * Math.cos(mid), y: cy + cr * Math.sin(mid) }, arcEnd: { x: x2, y: y2 } });
        if (G) { G.legend.push({ series: String(c), color: colors[i % colors.length], swatchRect: { x: W - 116, y: 24 + i * 15, w: 9, h: 9 } }); }
        slices += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${colors[i % colors.length]}"/>`;
        leg += `<rect x="${W - 116}" y="${24 + i * 15}" width="9" height="9" fill="${colors[i % colors.length]}"/><text x="${W - 103}" y="${32 + i * 15}" font-size="8.5" fill="#444">${esc(trunc(c, 14))} (${Math.round(frac * 100)}%)</text>`;
        ang = a2;
    });
    const hole = donut ? `<circle cx="${cx}" cy="${cy}" r="${(r * 0.55).toFixed(0)}" fill="#fff"/>` : "";
    return svg(title(model.title) + slices + hole + leg);
}

function rRadar(model, colors) {
    const cx = W / 2; const cy = (model.title ? 28 : 14) + (H - 30) / 2; const r = 96;
    const cats = model.categories; const n = cats.length;
    const max = Math.max(...model.series.flatMap((s) => s.values), 1);
    const ang = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const pt = (i, v) => [cx + (r * v / max) * Math.cos(ang(i)), cy + (r * v / max) * Math.sin(ang(i))];
    let grid = "";
    for (let g = 1; g <= 4; g++) {
        const rr = (r * g) / 4;
        grid += `<polygon points="${cats.map((_, i) => `${(cx + rr * Math.cos(ang(i))).toFixed(1)},${(cy + rr * Math.sin(ang(i))).toFixed(1)}`).join(" ")}" fill="none" stroke="#eee"/>`;
    }
    const axes = cats.map((c, i) => { const [x, y] = pt(i, max); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ddd"/><text x="${(cx + (r + 10) * Math.cos(ang(i))).toFixed(1)}" y="${(cy + (r + 10) * Math.sin(ang(i))).toFixed(1)}" font-size="7.5" text-anchor="middle" fill="#555">${esc(trunc(c, 8))}</text>`; }).join("");
    gSet({ geomKind: "radial", radial: { cx, cy, r, max } });
    const polys = model.series.map((s, si) => {
        const qs = cats.map((_, i) => pt(i, s.values[i] || 0));
        qs.forEach((q, i) => gMark({ kind: "vertex", seriesIndex: si, seriesName: s.name, labels: ruleLabels(model, i, s), value: s.values[i] || 0, x: q[0], y: q[1], angle: ang(i), color: colors[si], anchor: { x: q[0], y: q[1] } }));
        return `<polygon points="${qs.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ")}" fill="${colors[si]}" opacity="0.22" stroke="${colors[si]}" stroke-width="1.6"/>`;
    }).join("");
    return svg(title(model.title) + grid + axes + polys + legend(model.series, colors, { x: 40, w: W - 80 }));
}

function rWaterfall(model, colors) {
    const p = plot(model);
    const cats = model.categories; const vals = model.series[0].values;
    let cum = 0; const cums = [0]; vals.forEach((v) => { cum += v; cums.push(cum); });
    const all = cums.concat([0]);
    const [min, max] = extent(all);
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const band = p.w / cats.length; const bw = Math.min(40, band * 0.65);
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y" });
    let bars = "";
    vals.forEach((v, i) => {
        const x = p.x + band * i + (band - bw) / 2;
        const y0 = sy(cums[i]); const y1 = sy(cums[i + 1]);
        const col = v >= 0 ? colors[0] : colors[1] || "#c0504d";
        bars += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" fill="${col}"/>`;
        gMark({ kind: "bar", seriesIndex: 0, seriesName: model.series[0].name, labels: ruleLabels(model, i, model.series[0]), value: v, cumStart: cums[i], cumEnd: cums[i + 1], x, y: Math.min(y0, y1), w: bw, h: Math.max(1, Math.abs(y1 - y0)), color: col, anchor: { x: x + bw / 2, y: y1 }, axisValue: cums[i + 1] });
    });
    return svg(title(model.title) + yGrid(p, min, max, model.unit) + bars + xCatLabels(cats, p) + axisTitles(model, p));
}

function rFunnel(model, colors) {
    const vals = model.series[0].values; const cats = model.categories;
    const max = Math.max(...vals, 1); const padT = model.title ? 30 : 14;
    const rowH = (H - padT - 14) / vals.length; let out = "";
    gSet({ geomKind: "funnel", funnel: { maxValue: max, fullWidth: W - 160 } });
    vals.forEach((v, i) => {
        const w = (W - 160) * (v / max); const x = (W - 120 - w) / 2; const y = padT + i * rowH;
        const w2 = (W - 160) * ((vals[i + 1] ?? v) / max); const x2 = (W - 120 - w2) / 2;
        gMark({ kind: "segment", seriesIndex: 0, seriesName: model.series[0].name, labels: ruleLabels(model, i, model.series[0]), value: v, x, y, w, h: rowH - 3, x2, w2, color: colors[i % colors.length], anchor: { x: x + w / 2, y: y + (rowH - 3) / 2 } });
        out += `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(x + w).toFixed(1)},${y.toFixed(1)} ${(x2 + w2).toFixed(1)},${(y + rowH - 3).toFixed(1)} ${x2.toFixed(1)},${(y + rowH - 3).toFixed(1)}" fill="${colors[i % colors.length]}"/>`;
        out += `<text x="${W - 112}" y="${(y + rowH / 2).toFixed(1)}" font-size="8.5" fill="#444">${esc(trunc(cats[i], 16))} — ${esc(fmt(v, model.unit))}</text>`;
    });
    return svg(title(model.title) + out);
}

function rPyramid(model, colors) {
    // two series (e.g. male/female) diverging from a center axis over categories
    const p = plot(model, { right: 0 });
    const cats = model.categories;
    const left = model.series[0].values; const right = (model.series[1] || model.series[0]).values;
    const max = Math.max(...left, ...right, 1);
    const band = p.h / cats.length; const bh = Math.min(20, band * 0.74); const cxp = p.x + p.w / 2;
    gSet({ geomKind: "pyramid", plotRect: p, pyramid: { cx: cxp, max, halfW: p.w / 2 } });
    let out = "";
    cats.forEach((c, i) => {
        const y = p.y + band * i + (band - bh) / 2;
        const lw = (p.w / 2) * (left[i] / max); const rw = (p.w / 2) * (right[i] / max);
        gMark({ kind: "bar", side: "left", seriesIndex: 0, seriesName: model.series[0].name, labels: ruleLabels(model, i, model.series[0]), value: left[i], x: cxp - lw, y, w: lw, h: bh, color: colors[0], anchor: { x: cxp - lw, y: y + bh / 2 } });
        gMark({ kind: "bar", side: "right", seriesIndex: model.series[1] ? 1 : 0, seriesName: (model.series[1] || model.series[0]).name, labels: ruleLabels(model, i, model.series[1] || model.series[0]), value: right[i], x: cxp, y, w: rw, h: bh, color: colors[1] || colors[0], anchor: { x: cxp + rw, y: y + bh / 2 } });
        out += `<rect x="${(cxp - lw).toFixed(1)}" y="${y.toFixed(1)}" width="${lw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[0]}"/>`;
        out += `<rect x="${cxp.toFixed(1)}" y="${y.toFixed(1)}" width="${rw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[1] || colors[0]}"/>`;
        out += `<text x="${cxp.toFixed(1)}" y="${(y + bh / 2 + 3).toFixed(1)}" font-size="7" text-anchor="middle" fill="#fff">${esc(trunc(c, 8))}</text>`;
    });
    return svg(title(model.title) + out + legend(model.series, colors, p));
}

function rLollipop(model, colors) {
    const p = plot(model); const cats = model.categories; const vals = model.series[0].values;
    const [min, max] = extent(vals);
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const band = p.w / cats.length; let out = "";
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y" });
    cats.forEach((_, i) => {
        const x = p.x + band * (i + 0.5); const y = sy(vals[i]); const y0 = sy(0);
        gMark({ kind: "point", seriesIndex: 0, seriesName: model.series[0].name, labels: ruleLabels(model, i, model.series[0]), value: vals[i], x, y, r: 4, color: colors[0], anchor: { x, y }, axisValue: vals[i] });
        out += `<line x1="${x.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${colors[0]}" stroke-width="1.6"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${colors[0]}"/>`;
    });
    return svg(title(model.title) + yGrid(p, min, max, model.unit) + out + xCatLabels(cats, p) + axisTitles(model, p));
}

function rCombo(model, colors) {
    // dual axis: bar series on left, line series on right
    const p = plot(model);
    const barS = model.series.filter((s) => (s.kind || "bar") === "bar");
    const lineS = model.series.filter((s) => s.kind === "line");
    const cats = model.categories;
    const [lmin, lmax] = extent(barS.flatMap((s) => s.values));
    const [rmin, rmax] = lineS.length ? extent(lineS.flatMap((s) => s.values), false) : [0, 1];
    const syL = (v) => p.y + p.h - (p.h * (v - lmin)) / (lmax - lmin);
    const syR = (v) => p.y + p.h - (p.h * (v - rmin)) / (rmax - rmin);
    const band = p.w / cats.length; const bw = Math.min(42, band * 0.6 / Math.max(1, barS.length));
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: lmin, yMax: lmax, valueAxis: "y" });
    if (lineS.length) { gAxis({ y2Min: rmin, y2Max: rmax }); }
    let out = "";
    cats.forEach((_, ci) => {
        barS.forEach((s, si) => {
            const v = s.values[ci] || 0; const x = p.x + band * ci + (band - bw * barS.length) / 2 + bw * si;
            out += `<rect x="${x.toFixed(1)}" y="${Math.min(syL(0), syL(v)).toFixed(1)}" width="${(bw * 0.9).toFixed(1)}" height="${Math.abs(syL(v) - syL(0)).toFixed(1)}" fill="${colors[si]}"/>`;
            gMark({ kind: "bar", axis: "left", seriesIndex: model.series.indexOf(s), seriesName: s.name, labels: ruleLabels(model, ci, s), value: v, x, y: Math.min(syL(0), syL(v)), w: bw * 0.9, h: Math.abs(syL(v) - syL(0)), color: colors[si], anchor: { x: x + (bw * 0.9) / 2, y: syL(v) }, axisValue: v });
        });
    });
    lineS.forEach((s, si) => {
        const pts = cats.map((_, ci) => [p.x + band * (ci + 0.5), syR(s.values[ci] || 0)]);
        pts.forEach((q, ci) => gMark({ kind: "point", axis: "right", seriesIndex: model.series.indexOf(s), seriesName: s.name, labels: ruleLabels(model, ci, s), value: s.values[ci] || 0, x: q[0], y: q[1], r: 2.4, color: colors[barS.length + si], anchor: { x: q[0], y: q[1] }, axisValue: s.values[ci] || 0 }));
        out += `<path d="${linePath(pts, false)}" fill="none" stroke="${colors[barS.length + si]}" stroke-width="2"/>` + pts.map((q) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.4" fill="${colors[barS.length + si]}"/>`).join("");
    });
    return svg(title(model.title) + yGrid(p, lmin, lmax, model.unit, "left") + (lineS.length ? yGrid(p, rmin, rmax, model.unit2 || model.unit, "right") : "") + out + xCatLabels(cats, p) + axisTitles(model, p) + legend(model.series, colors, p));
}

function rSlope(model, colors) {
    // two categories (e.g. before/after), one line per series-name (here rows)
    const p = plot(model); const cats = model.categories.slice(0, 2);
    const rows = model.series; const [min, max] = extent(rows.flatMap((s) => s.values.slice(0, 2)));
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const x0 = p.x + 6; const x1 = p.x + p.w - 6; let out = "";
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y", xCategories: [{ label: String(cats[0] ?? ""), xCenter: x0 }, { label: String(cats[1] ?? ""), xCenter: x1 }] });
    rows.forEach((s, i) => {
        const y0 = sy(s.values[0]); const y1 = sy(s.values[1] ?? s.values[0]);
        gMark({ kind: "point", seriesIndex: i, seriesName: s.name, labels: ruleLabels(model, 0, s), value: s.values[0], x: x0, y: y0, r: 2.5, color: colors[i % colors.length], anchor: { x: x0, y: y0 }, axisValue: s.values[0] });
        gMark({ kind: "point", seriesIndex: i, seriesName: s.name, labels: ruleLabels(model, 1, s), value: s.values[1] ?? s.values[0], x: x1, y: y1, r: 2.5, color: colors[i % colors.length], anchor: { x: x1, y: y1 }, axisValue: s.values[1] ?? s.values[0] });
        out += `<line x1="${x0}" y1="${y0.toFixed(1)}" x2="${x1}" y2="${y1.toFixed(1)}" stroke="${colors[i % colors.length]}" stroke-width="1.6"/><circle cx="${x0}" cy="${y0.toFixed(1)}" r="2.5" fill="${colors[i % colors.length]}"/><circle cx="${x1}" cy="${y1.toFixed(1)}" r="2.5" fill="${colors[i % colors.length]}"/>`;
        out += `<text x="${x0 - 3}" y="${(y0 + 3).toFixed(1)}" font-size="7.5" text-anchor="end" fill="#555">${esc(trunc(s.name, 10))}</text>`;
    });
    out += `<text x="${x0}" y="${p.y + p.h + 12}" font-size="8" fill="#555">${esc(cats[0] || "")}</text><text x="${x1}" y="${p.y + p.h + 12}" font-size="8" text-anchor="end" fill="#555">${esc(cats[1] || "")}</text>`;
    return svg(title(model.title) + out);
}

function rHeatmap(model, colors) {
    const p = plot(model, { right: 0 });
    const cats = model.categories; const rows = model.series;
    const all = rows.flatMap((s) => s.values); const [min, max] = extent(all, false);
    const cw = p.w / cats.length; const ch = p.h / rows.length;
    const col = (v) => { const t = (v - min) / (max - min || 1); return hsl(210 - 180 * t, 65, 80 - 38 * t); };
    gSet({ geomKind: "grid", plotRect: p, grid: { cellW: cw, cellH: ch, vMin: min, vMax: max } });
    let out = "";
    rows.forEach((s, ri) => {
        out += `<text x="${p.x - 4}" y="${(p.y + ch * (ri + 0.5) + 3).toFixed(1)}" font-size="7.5" text-anchor="end" fill="#555">${esc(trunc(s.name, 12))}</text>`;
        cats.forEach((_, ci) => {
            gMark({ kind: "cell", seriesIndex: ri, seriesName: s.name, labels: ruleLabels(model, ci, s), value: s.values[ci] || 0, x: p.x + cw * ci, y: p.y + ch * ri, w: cw, h: ch, color: col(s.values[ci] || 0), anchor: { x: p.x + cw * (ci + 0.5), y: p.y + ch * (ri + 0.5) } });
            out += `<rect x="${(p.x + cw * ci).toFixed(1)}" y="${(p.y + ch * ri).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${col(s.values[ci] || 0)}" stroke="#fff" stroke-width="0.5"/>`;
        });
    });
    return svg(title(model.title) + out + xCatLabels(cats, p) + axisTitles(model, p));
}

function rGauge(model, colors) {
    const v = model.series[0].values[0] || 0; const max = model.gaugeMax || 100;
    const cx = W / 2; const cy = H - 40; const r = 96; const frac = Math.max(0, Math.min(1, v / max));
    const a0 = Math.PI; const a1 = Math.PI + frac * Math.PI;
    gSet({ geomKind: "radial", gauge: { cx, cy, r, max, startAngle: Math.PI, endAngle: 2 * Math.PI } });
    gMark({ kind: "arc", seriesIndex: 0, seriesName: model.series[0].name, labels: [ruleCat(model, 0)], value: v, frac, startAngle: a0, endAngle: a1, x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1), r, color: colors[0], anchor: { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) } });
    const arc = (from, to, color, width) => { const x0 = cx + r * Math.cos(from); const y0 = cy + r * Math.sin(from); const x1 = cx + r * Math.cos(to); const y1 = cy + r * Math.sin(to); return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`; };
    return svg(title(model.title) + arc(Math.PI, 2 * Math.PI, "#eee", 16) + arc(a0, a1, colors[0], 16) + `<text x="${cx}" y="${cy - 8}" font-size="26" font-weight="700" text-anchor="middle" fill="#333">${esc(fmt(v, model.unit))}</text><text x="${cx}" y="${cy + 14}" font-size="10" text-anchor="middle" fill="#888">${esc(model.categories?.[0] || "")}</text>`);
}

function rBox(model, colors) {
    const p = plot(model); const cats = model.categories; const boxes = model.series[0].values;
    const all = boxes.flatMap((b) => [b.min, b.max]); const [min, max] = extent(all);
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const band = p.w / cats.length; const bw = Math.min(34, band * 0.5); let out = "";
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y" });
    boxes.forEach((b, i) => {
        const x = p.x + band * (i + 0.5);
        for (const k of ["min", "q1", "med", "q3", "max"]) {
            gMark({ kind: "box-part", part: k, seriesIndex: 0, seriesName: model.series[0].name, labels: [...ruleLabels(model, i, model.series[0]), k], value: b[k], x, y: sy(b[k]), w: bw, color: colors[0], anchor: { x, y: sy(b[k]) }, axisValue: b[k] });
        }
        out += `<line x1="${x}" y1="${sy(b.min).toFixed(1)}" x2="${x}" y2="${sy(b.max).toFixed(1)}" stroke="#555"/>`;
        out += `<rect x="${(x - bw / 2).toFixed(1)}" y="${sy(b.q3).toFixed(1)}" width="${bw}" height="${Math.abs(sy(b.q1) - sy(b.q3)).toFixed(1)}" fill="${colors[0]}" opacity="0.5" stroke="${colors[0]}"/>`;
        out += `<line x1="${(x - bw / 2).toFixed(1)}" y1="${sy(b.med).toFixed(1)}" x2="${(x + bw / 2).toFixed(1)}" y2="${sy(b.med).toFixed(1)}" stroke="#222" stroke-width="1.5"/>`;
    });
    return svg(title(model.title) + yGrid(p, min, max, model.unit) + out + xCatLabels(cats, p) + axisTitles(model, p));
}

function rCandle(model, colors) {
    const p = plot(model); const cats = model.categories; const ohlc = model.series[0].values;
    const all = ohlc.flatMap((d) => [d.l, d.h]); const [min, max] = extent(all, false);
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const band = p.w / cats.length; const bw = Math.min(10, band * 0.5); let out = "";
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y" });
    ohlc.forEach((d, i) => {
        const x = p.x + band * (i + 0.5); const up = d.c >= d.o; const col = up ? "#2e8b57" : "#c0504d";
        for (const k of ["o", "h", "l", "c"]) {
            gMark({ kind: "candle-part", part: k, seriesIndex: 0, seriesName: model.series[0].name, labels: [...ruleLabels(model, i, model.series[0]), k], value: d[k], x, y: sy(d[k]), w: bw, color: col, anchor: { x, y: sy(d[k]) }, axisValue: d[k] });
        }
        out += `<line x1="${x}" y1="${sy(d.h).toFixed(1)}" x2="${x}" y2="${sy(d.l).toFixed(1)}" stroke="${col}"/>`;
        out += `<rect x="${(x - bw / 2).toFixed(1)}" y="${Math.min(sy(d.o), sy(d.c)).toFixed(1)}" width="${bw}" height="${Math.max(1, Math.abs(sy(d.o) - sy(d.c))).toFixed(1)}" fill="${col}"/>`;
    });
    return svg(title(model.title) + yGrid(p, min, max, model.unit) + out + xCatLabels(cats, p) + axisTitles(model, p));
}

function rHistogram(model, colors) {
    // treat values as bin counts; like a bar with no gaps
    const p = plot(model); const vals = model.series[0].values; const [min, max] = extent(vals);
    const sy = (v) => p.y + p.h - (p.h * (v - min)) / (max - min);
    const bw = p.w / vals.length; let out = "";
    gSet({ geomKind: "cartesian", plotRect: p });
    gAxis({ yMin: min, yMax: max, valueAxis: "y", xCategories: vals.map((_, i) => ({ label: ruleCat(model, i), xCenter: p.x + bw * (i + 0.5) })) });
    vals.forEach((v, i) => {
        gMark({ kind: "bar", seriesIndex: 0, seriesName: model.series[0].name, labels: ruleLabels(model, i, model.series[0]), value: v, x: p.x + bw * i, y: sy(v), w: bw - 1, h: Math.abs(sy(v) - sy(0)), color: colors[0], anchor: { x: p.x + bw * i + (bw - 1) / 2, y: sy(v) }, axisValue: v });
        out += `<rect x="${(p.x + bw * i).toFixed(1)}" y="${sy(v).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.abs(sy(v) - sy(0)).toFixed(1)}" fill="${colors[0]}"/>`;
    });
    return svg(title(model.title) + yGrid(p, min, max, model.unit) + out + axisTitles(model, p));
}

const RENDERERS = {
    bar: (m, c) => rBars(m, c),
    groupedBar: (m, c) => rBars(m, c, { grouped: true }),
    stackedBar: (m, c) => rBars(m, c, { stacked: true }),
    percentBar: (m, c) => rBars(m, c, { stacked: true, percent: true }),
    hbar: (m, c) => rHBars(m, c),
    stackedHBar: (m, c) => rHBars(m, c, true),
    line: (m, c) => rLines(m, c),
    multiLine: (m, c) => rLines(m, c),
    spline: (m, c) => rLines(m, c, { smooth: true }),
    stepLine: (m, c) => rLines(m, c, { step: true }),
    area: (m, c) => rLines(m, c, { area: true }),
    stackedArea: (m, c) => rLines(m, c, { area: true, stacked: true }),
    scatter: (m, c) => rScatter(m, c),
    bubble: (m, c) => rScatter(m, c, true),
    pie: (m, c) => rPie(m, c),
    donut: (m, c) => rPie(m, c, true),
    radar: (m, c) => rRadar(m, c),
    waterfall: (m, c) => rWaterfall(m, c),
    funnel: (m, c) => rFunnel(m, c),
    histogram: (m, c) => rHistogram(m, c),
    lollipop: (m, c) => rLollipop(m, c),
    comboBarLine: (m, c) => rCombo(m, c),
    slope: (m, c) => rSlope(m, c),
    heatmap: (m, c) => rHeatmap(m, c),
    gauge: (m, c) => rGauge(m, c),
    pyramid: (m, c) => rPyramid(m, c),
    boxplot: (m, c) => rBox(m, c),
    candlestick: (m, c) => rCandle(m, c),
};

// renderChart(model) -> SVG string (unchanged API).
// renderChartWithGeom(model) -> { svg, geom }: the same SVG plus the structured
// mark/axis geometry recorded while it was built (see the accumulator docs
// above). geom.fallback is true when the typed renderer threw and the chart
// fell back to a plain bar rendering.
export function renderChartWithGeom(model) {
    const ns = Math.max(model.series ? model.series.length : 1, model.categories ? model.categories.length : 1, 3);
    const colors = Array.isArray(model.options?.palette) ? model.options.palette : palette(ns, model.options?.baseHue ?? 210);
    const type = RENDERERS[model.type] ? model.type : "bar";
    let out;
    G = newGeom(type);
    try {
        out = RENDERERS[type](model, colors);
    } catch {
        G = newGeom("bar");
        G.fallback = true;
        out = RENDERERS.bar(model, colors);
    }
    const geom = G;
    G = null;
    return { svg: out, geom };
}

export function renderChart(model) {
    return renderChartWithGeom(model).svg;
}
