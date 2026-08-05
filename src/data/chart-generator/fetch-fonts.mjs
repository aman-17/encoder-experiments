// One-time downloader for the bundled Google Fonts (regular + bold woff2, latin
// subset) into ./fonts. Run:  node fetch-fonts.mjs
// Re-runs skip families already present.

import fs from "node:fs";
import path from "node:path";
import { ALL_FAMILIES, FONTS_DIR, slug } from "./googleFonts.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchText(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
    }
    return r.text();
}

async function fetchBuf(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
    }
    return Buffer.from(await r.arrayBuffer());
}

// Last woff2 in the css2 response is the 'latin' subset block.
function lastWoff2(css) {
    const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
    return urls.length ? urls[urls.length - 1] : null;
}

async function downloadOne(family, weight, pool) {
    const dest = path.join(FONTS_DIR, `${slug(family)}-${weight}.woff2`);
    if (fs.existsSync(dest)) {
        return "skip";
    }
    const css = await fetchText(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`);
    const url = lastWoff2(css);
    if (!url) {
        throw new Error("no woff2 in css");
    }
    fs.writeFileSync(dest, await fetchBuf(url));
    return "ok";
}

async function main() {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    const tasks = [];
    for (const fam of ALL_FAMILIES) {
        for (const w of [400, 700]) {
            tasks.push({ fam, w });
        }
    }
    let ok = 0;
    let skip = 0;
    let fail = 0;
    // modest concurrency to be polite
    const cc = 6;
    let next = 0;
    async function worker() {
        for (;;) {
            const i = next++;
            if (i >= tasks.length) {
                return;
            }
            const { fam, w } = tasks[i];
            try {
                const r = await downloadOne(fam, w);
                if (r === "ok") { ok++; } else { skip++; }
            } catch (e) {
                fail++;
                console.error(`  ! ${fam} ${w}: ${e.message}`);
            }
        }
    }
    await Promise.all(Array.from({ length: cc }, () => worker()));
    console.error(`fonts: ${ok} downloaded, ${skip} already present, ${fail} failed -> ${FONTS_DIR}`);
}

main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
});
