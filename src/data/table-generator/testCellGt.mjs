// Unit test for the per-cell table ground truth:
//   node testCellGt.mjs
// Loads a constructed page with two table.gen of known span structure (one
// with separate colspan=2 / rowspan=2 cells, one with a combined
// rowspan=2+colspan=2 cell), runs the patched measureElements in
// page.evaluate, and asserts:
//   1) slot coverage: sum over cells of rowspan*colspan == gridRows*gridCols,
//      and the occupancy rebuilt from (grid_row, grid_col, spans) tiles the
//      logical grid exactly (no gaps, no double-fills),
//   2) cell rects tile the table bbox: exact rect-union area ~= table area and
//      pairwise overlaps are no more than collapsed-border slivers,
//   3) logical grid indices are correct for the spanned cells (incl. DOM
//      cellIndex != grid_col after a rowspan intrusion),
//   4) tableCellsGt normalizes to [0,1], x rightward / y DOWNWARD (top-left
//      origin — the sites.py probe convention),
//   5) without {tableCells} the measurement is unchanged (no cells key).

import assert from "node:assert/strict";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { measureElements, tableCellsGt } from "./groundTruth.mjs";

function resolveExecutablePath() {
    const candidates = [];
    if (process.env.PUPPETEER_EXECUTABLE_PATH) { candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH); }
    if (process.platform === "darwin") {
        candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
        candidates.push("/Applications/Chromium.app/Contents/MacOS/Chromium");
    } else {
        candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");
    }
    const cacheRoot = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
    if (fssync.existsSync(cacheRoot)) {
        for (const ver of fssync.readdirSync(cacheRoot).sort().reverse()) {
            candidates.push(path.join(cacheRoot, ver, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
            candidates.push(path.join(cacheRoot, ver, "chrome-linux64", "chrome"));
        }
    }
    return candidates.find((p) => p && fssync.existsSync(p)) || null;
}

// t1: colspan=2 (B, J) and rowspan=2 (E) in separate cells; I sits after E's
// intrusion so its DOM cellIndex (0) != grid_col (1). Logical grid 3x4.
// t2: one cell with BOTH rowspan=2 and colspan=2 (X); C2 (cellIndex 0) lands
// at grid_col 2. Logical grid 3x3.
const HTML = `<!doctype html><html><head><style>
  body { margin: 24px; font: 13px Arial, sans-serif; }
  table.gen { border-collapse: collapse; margin-bottom: 32px; }
  table.gen th, table.gen td { border: 1px solid #333; padding: 6px 10px; }
</style></head><body>
<table class="gen" id="t1">
  <tr><th>A</th><th colspan="2">B</th><th>D</th></tr>
  <tr><td rowspan="2">E</td><td>F</td><td>G</td><td>H</td></tr>
  <tr><td>I</td><td colspan="2">J</td></tr>
</table>
<table class="gen" id="t2">
  <tr><td rowspan="2" colspan="2">X</td><td>C1</td></tr>
  <tr><td>C2</td></tr>
  <tr><td>C3</td><td>C4</td><td>C5</td></tr>
</table>
</body></html>`;

// Exact area of a union of axis-aligned rects via coordinate compression.
function unionArea(rects) {
    const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
    const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < ys.length - 1; j++) {
            const cx = (xs[i] + xs[i + 1]) / 2;
            const cy = (ys[j] + ys[j + 1]) / 2;
            if (rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) {
                area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
            }
        }
    }
    return area;
}

function checkTable(t, label) {
    // ---- 1) logical slot coverage --------------------------------------------
    const slots = t.cells.reduce((s, c) => s + c.rowspan * c.colspan, 0);
    assert.equal(slots, t.gridRows * t.gridCols,
        `${label}: cell slot sum ${slots} != grid ${t.gridRows}x${t.gridCols}`);
    const occ = Array.from({ length: t.gridRows }, () => Array(t.gridCols).fill(0));
    for (const c of t.cells) {
        for (let dr = 0; dr < c.rowspan; dr++) {
            for (let dc = 0; dc < c.colspan; dc++) {
                occ[c.grid_row + dr][c.grid_col + dc] += 1;
            }
        }
    }
    assert.ok(occ.every((row) => row.every((n) => n === 1)),
        `${label}: logical grid not tiled exactly once: ${JSON.stringify(occ)}`);

    // ---- 2) cell rects tile the table bbox -----------------------------------
    const tableArea = t.w * t.h;
    const union = unionArea(t.cells);
    assert.ok(Math.abs(union - tableArea) / tableArea < 0.03,
        `${label}: union ${union.toFixed(1)} vs table ${tableArea.toFixed(1)}`);
    for (const c of t.cells) {  // every cell inside the table bbox (+1px border slack)
        assert.ok(c.x >= t.x - 1 && c.y >= t.y - 1
            && c.x + c.w <= t.x + t.w + 1 && c.y + c.h <= t.y + t.h + 1,
            `${label}: cell "${c.text}" leaks outside the table bbox`);
    }
    // no pairwise overlap beyond collapsed-border slivers (<= 2px in x or y)
    for (let i = 0; i < t.cells.length; i++) {
        for (let j = i + 1; j < t.cells.length; j++) {
            const a = t.cells[i];
            const b = t.cells[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            assert.ok(ox <= 2 || oy <= 2,
                `${label}: cells "${a.text}"/"${b.text}" overlap ${ox.toFixed(1)}x${oy.toFixed(1)}px`);
        }
    }
}

const byText = (t, s) => t.cells.find((c) => c.text === s);

function expectCell(t, text, exp, label) {
    const c = byText(t, text);
    assert.ok(c, `${label}: cell "${text}" missing`);
    for (const [k, v] of Object.entries(exp)) {
        assert.equal(c[k], v, `${label}: cell "${text}" ${k}=${c[k]}, expected ${v}`);
    }
}

async function main() {
    const execPath = resolveExecutablePath();
    const browser = await puppeteer.launch(execPath
        ? { headless: "new", executablePath: execPath, args: ["--no-sandbox"] }
        : { headless: "new", args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage();
        const vw = 794;   // A4 @ 96dpi portrait, as pagePx() uses
        const vh = 1123;
        await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
        await page.setContent(HTML, { waitUntil: "load" });

        const measured = await page.evaluate(measureElements, { tableCells: true });
        const tables = measured.filter((e) => e.tag === "table");
        assert.equal(tables.length, 2, `expected 2 tables, got ${tables.length}`);
        const [t1, t2] = tables;

        // ---- t1: separate colspan=2 / rowspan=2 cells ------------------------
        assert.equal(t1.gridRows, 3, "t1 gridRows");
        assert.equal(t1.gridCols, 4, "t1 gridCols");
        assert.equal(t1.cells.length, 9, "t1 cell count");
        checkTable(t1, "t1");
        expectCell(t1, "B", { row: 0, col: 1, grid_row: 0, grid_col: 1, rowspan: 1, colspan: 2, tag: "th" }, "t1");
        expectCell(t1, "D", { row: 0, col: 2, grid_row: 0, grid_col: 3 }, "t1");
        expectCell(t1, "E", { row: 1, col: 0, grid_row: 1, grid_col: 0, rowspan: 2, colspan: 1, tag: "td" }, "t1");
        // I: DOM slot 0 in its row, but grid col 1 (E's rowspan occupies col 0)
        expectCell(t1, "I", { row: 2, col: 0, grid_row: 2, grid_col: 1, rowspan: 1, colspan: 1 }, "t1");
        expectCell(t1, "J", { row: 2, col: 1, grid_row: 2, grid_col: 2, colspan: 2 }, "t1");

        // ---- t2: one cell with rowspan=2 AND colspan=2 -----------------------
        assert.equal(t2.gridRows, 3, "t2 gridRows");
        assert.equal(t2.gridCols, 3, "t2 gridCols");
        assert.equal(t2.cells.length, 6, "t2 cell count");
        checkTable(t2, "t2");
        expectCell(t2, "X", { row: 0, col: 0, grid_row: 0, grid_col: 0, rowspan: 2, colspan: 2 }, "t2");
        expectCell(t2, "C1", { row: 0, col: 1, grid_row: 0, grid_col: 2 }, "t2");
        // C2: DOM slot 0, but X covers grid cols 0-1 of its row
        expectCell(t2, "C2", { row: 1, col: 0, grid_row: 1, grid_col: 2 }, "t2");
        expectCell(t2, "C5", { row: 2, col: 2, grid_row: 2, grid_col: 2 }, "t2");

        // ---- 4) sidecar normalization (scale=1 over the viewport page) -------
        const gt = tableCellsGt(measured, 1, vw, vh);
        assert.equal(gt.tables.length, 2, "sidecar table count");
        assert.equal(gt.tables[0].table_index, 0);
        assert.equal(gt.tables[1].table_index, 1);
        for (const st of gt.tables) {
            for (const c of st.cells) {
                assert.ok(c.bbox.every((v) => v >= 0 && v <= 1), `bbox out of [0,1]: ${c.bbox}`);
            }
        }
        const st1 = gt.tables[0];
        const nA = st1.cells.find((c) => c.text === "A");
        const nD = st1.cells.find((c) => c.text === "D");
        const nI = st1.cells.find((c) => c.text === "I");
        assert.ok(nA.bbox[0] < nD.bbox[0], "x must increase rightward (A left of D)");
        assert.ok(nA.bbox[1] < nI.bbox[1], "y must increase DOWNWARD (header above body)");
        // exact normalization formula against the raw px measurement
        const pA = byText(t1, "A");
        assert.ok(Math.abs(nA.bbox[0] - pA.x / vw) < 1e-9 && Math.abs(nA.bbox[1] - pA.y / vh) < 1e-9
            && Math.abs(nA.bbox[2] - pA.w / vw) < 1e-9 && Math.abs(nA.bbox[3] - pA.h / vh) < 1e-9,
        "normalized bbox != px/page");
        // t2 sidecar spans survive the mapping
        const nX = gt.tables[1].cells.find((c) => c.text === "X");
        assert.equal(nX.rowspan, 2);
        assert.equal(nX.colspan, 2);

        // ---- 5) default call (no opts) is unchanged --------------------------
        const plain = await page.evaluate(measureElements);
        assert.ok(plain.filter((e) => e.tag === "table").every((e) => !("cells" in e) && !("gridRows" in e)),
            "measureElements without opts must not attach cells");
        const strip = (m) => m.map(({ cells, gridRows, gridCols, ...rest }) => rest);
        assert.deepEqual(strip(measured), plain, "non-cell fields must be identical with/without opts");

        console.log("PASS testCellGt");
        console.log(`  t1: ${t1.cells.length} cells, grid ${t1.gridRows}x${t1.gridCols}, union/table area = ${(unionArea(t1.cells) / (t1.w * t1.h)).toFixed(4)}`);
        console.log(`  t2: ${t2.cells.length} cells, grid ${t2.gridRows}x${t2.gridCols}, union/table area = ${(unionArea(t2.cells) / (t2.w * t2.h)).toFixed(4)}`);
    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
