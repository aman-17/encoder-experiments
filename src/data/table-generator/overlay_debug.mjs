// Draw the layout-GT boxes on each saved page HTML at the exact measured pixels
// (same coordinate space as measureElements), then screenshot — a pixel-perfect
// overlay independent of the PDF fit-scaling.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const SRC = process.argv[2];   // e.g. /tmp/tg_show2/src
const OUT = process.argv[3];   // e.g. /tmp/tg_show2/overlay
fs.mkdirSync(OUT, { recursive: true });
// Regions are drawn thick (they CONTAIN widgets); widgets are tight boxes.
const COL = { "Form":"#e8730a","Key-Value Region":"#d81b60","Document Index":"#8e44ad",
  "TextBox":"#1565c0","Checkbox-Selected":"#2e7d32","Checkbox-Unselected":"#2e7d32","Signature":"#00897b",
  "Table":"#b48c00","Title":"#8a8a92","Text":"#c8d0d8","Section":"#8a8a92","List-item":"#c8d0d8",
  "Page-header":"#9696a0","Page-footer":"#9696a0","Footnote":"#c8d0d8","Picture":"#78aa78" };
const REGION = new Set(["Form","Key-Value Region","Document Index"]);
const WIDGET = new Set(["TextBox","Checkbox-Selected","Checkbox-Unselected","Signature"]);

const browser = await puppeteer.launch({ headless: "new", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args:["--no-sandbox"] });
const htmls = fs.readdirSync(SRC).filter((f) => f.endsWith(".html")).sort();
let i = 0;
for (const h of htmls) {
    i++;
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(fs.readFileSync(path.join(SRC, h), "utf8"), { waitUntil: "networkidle0" });
    await page.evaluate((COL, REGION, WIDGET) => {
        const sel = "h1,h2,h3,p,ul,table.gen,figure.fig,.runhead,.runfoot,.footer,.footnote,.pagenum,.dateline,.subtitle,.kv-region,.form-region,.gen-toc,.ff-blank,.cb-box,.sig-line";
        const cls = (el) => { const c = el.className || ""; const t = el.tagName.toLowerCase();
            if (c.includes("cb-box")) return c.includes("cb-sel") ? "Checkbox-Selected" : "Checkbox-Unselected";
            if (c.includes("ff-blank")) return "TextBox"; if (c.includes("sig-line")) return "Signature";
            if (c.includes("form-region")) return "Form"; if (c.includes("kv-region")) return "Key-Value Region";
            if (c.includes("gen-toc")) return "Document Index";
            if (t==="table") return "Table"; if (t==="figure"||c.includes("fig")) return "Picture";
            if (t==="h1") return "Title"; if (t==="h2"||t==="h3") return "Section";
            if (t==="ul") return "List-item"; if (c.includes("runhead")) return "Page-header";
            if (c.includes("runfoot")||c.includes("footer")||c.includes("pagenum")) return "Page-footer";
            if (c.includes("footnote")) return "Footnote"; return "Text"; };
        const isReg = (k) => REGION.includes(k), isWid = (k) => WIDGET.includes(k);
        for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect(); if (r.width<=0||r.height<=0) continue;
            const k = cls(el); const color = COL[k] || "#888"; const reg = isReg(k), wid = isWid(k);
            const box = document.createElement("div");
            box.style.cssText = `position:absolute;left:${r.x+window.scrollX}px;top:${r.y+window.scrollY}px;width:${r.width}px;height:${r.height}px;border:${reg?3:wid?2:1}px solid ${color};box-sizing:border-box;pointer-events:none;z-index:${reg?9998:9999};`;
            document.body.appendChild(box);
            // Region label above the box; widget label only when wide enough to not crowd (skips tiny checkboxes).
            if (reg || (wid && r.width > 46)) { const lab=document.createElement("div");
                lab.textContent=k; lab.style.cssText=`position:absolute;left:${r.x+window.scrollX}px;top:${r.y+window.scrollY-14}px;background:${color};color:#fff;font:${reg?11:9}px Helvetica;padding:1px 4px;z-index:10000;pointer-events:none;white-space:nowrap;`;
                document.body.appendChild(lab); }
        }
    }, COL, [...REGION], [...WIDGET]);
    await page.screenshot({ path: path.join(OUT, `overlay_${i}.png`), fullPage: true });
    await page.close();
    console.log("overlay_"+i, h);
}
await browser.close();
