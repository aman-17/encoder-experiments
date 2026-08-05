// KaTeX stylesheet with its webfonts inlined as base64 data URIs (mirrors how
// googleFonts.mjs embeds the body fonts) so the rendered HTML is fully
// self-contained and headless Chrome needs no network access.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

let _cached = null;

export function katexCss() {
    if (_cached) {
        return _cached;
    }
    const cssPath = require.resolve("katex/dist/katex.min.css");
    const fontsDir = path.join(path.dirname(cssPath), "fonts");
    let css = fs.readFileSync(cssPath, "utf-8");
    // Each @font-face src lists woff2, woff and ttf; keep only the woff2 source,
    // inlined. Example source text:
    //   src:url(fonts/KaTeX_AMS-Regular.woff2) format("woff2"),url(...woff) ...
    css = css.replace(/src:url\(fonts\/([A-Za-z0-9_-]+\.woff2)\) format\("woff2"\)[^;}]*/g, (m, file) => {
        const p = path.join(fontsDir, file);
        if (!fs.existsSync(p)) {
            throw new Error(`katex font missing: ${p}`);
        }
        const b64 = fs.readFileSync(p).toString("base64");
        return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
    });
    if (/url\(fonts\//.test(css)) {
        throw new Error("katexCss: unresolved font url() left in stylesheet");
    }
    _cached = css;
    return _cached;
}
