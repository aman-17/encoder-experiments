// Layout sidecar support: a generic Canonical17 element sweep + sidecar builder.
// sweepLayout runs BROWSER-SIDE (passed to page.evaluate) against the print
// layout viewport — read-only, does not perturb the PDF. buildLayoutSidecar
// runs node-side and reuses the caller's fit-to-paper norm() (the corrected
// print-layout transform; see render.mjs) so layout.json coordinates are in
// the exact same normalized page space as cells.json.
//
// Emission contract (<id>.layout.json, version 1):
//   coords: normalized [0,1] over the page, x rightward, y downward
//   (top-left origin); bbox = [x, y, w, h] COCO-style. Canonical17 labels.
//   Every visible element is covered by exactly one item: the sweep either
//   emits an element (and never its ancestors/descendants) or recurses into
//   it, so text is never double-covered. Checkbox glyphs (☐/☑/☒) are the one
//   deliberate overlay: they are re-measured per-glyph on top of their host
//   Text/Form region, DocLayNet-style.

// Browser-side. arg = { pageW, pageH }: CSS-px size of ONE laid-out page (the
// print layout viewport), used to split multi-page flows and for the
// top/bottom running-head bands. Returns items in DOM (reading) order with
// bbox_px = [x0, y0, x1, y1] in layout CSS px.
export function sweepLayout({ pageW, pageH }) {
  const sx = window.scrollX, sy = window.scrollY;
  const out = [];
  let tableCount = 0;
  let seenTitle = false;

  const rect = (el) => { const r = el.getBoundingClientRect(); return [r.left + sx, r.top + sy, r.right + sx, r.bottom + sy]; };
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const toks = (el) => String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").toLowerCase().split(/\s+/).filter(Boolean);
  const has = (el, ...names) => toks(el).some((t) => names.includes(t));
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) { return false; }
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  // Intrinsically-inline tags stay "inline" even when a flex/grid parent
  // blockifies them — a label/value span row must stay one leaf item.
  const INLINE_TAGS = new Set(["span", "a", "b", "i", "u", "s", "em", "strong", "small", "big", "sub", "sup",
    "mark", "abbr", "cite", "q", "code", "kbd", "samp", "var", "time", "label", "data", "dfn", "bdi", "bdo"]);
  const blocky = (el) => {
    if (INLINE_TAGS.has(el.tagName.toLowerCase())) { return false; }
    const d = getComputedStyle(el).display;
    return !(d.startsWith("inline") || d === "contents");
  };
  // A visible box with no text: bars/rules/gutters are decoration (skip);
  // big styled boxes (figure placeholders, photo regions) are Pictures.
  const styled = (el) => {
    const cs = getComputedStyle(el);
    return cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none"
      || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0
      || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderRightWidth) > 0;
  };
  const MIN_PICTURE_AREA = 0.004 * pageW * pageH;

  const classify = (el, box, text) => {
    const tag = el.tagName.toLowerCase();
    const [, y0, , y1] = box;
    const pg = Math.max(0, Math.floor((y0 + y1) / 2 / pageH));
    const yTop = y0 - pg * pageH, yBot = y1 - pg * pageH, h = y1 - y0;
    // 1. explicit page-furniture / note classes
    if (has(el, "footnote", "fnote", "footnotes", "fn")) { return "Footnote"; }
    if (has(el, "runhead", "rh", "clsf", "letterhead", "pagehead")) { return "Page-header"; }
    if (has(el, "runfoot", "footer", "foot", "ftr", "pagenum", "pageno", "pn")) { return "Page-footer"; }
    if (has(el, "cap", "caption")) { return "Caption"; }
    // 2. headings
    const hTag = /^h([1-6])$/.exec(tag);
    const headingCls = has(el, "title", "ttl", "titles", "mtitle", "bigname", "banner", "h", "hd", "head", "heading",
      "sec", "lph", "nhead", "bt", "leglab", "exh", "forms");
    if (hTag || headingCls) {
      const big = hTag ? Number(hTag[1]) === 1 : has(el, "title", "ttl", "titles", "banner", "forms");
      if (big && !seenTitle && yTop < 0.3 * pageH) { seenTitle = true; return "Title"; }
      return "Section-header";
    }
    // 3. list items (tag, class, or a leading bullet/enumerator)
    if (tag === "li" || has(el, "it", "li", "bl", "dash")
      || /^([•·▪◦●○–—*-]|\(\d{1,2}\)|\d{1,2}[.)])\s/.test(text)) { return "List-item"; }
    // 4. form regions / key-value rows
    // NB: a bare "form" class is ambiguous (sec_cover_page's "FORM 10-K"
    // banner) — only unambiguous fill-in region classes map to Form.
    if (has(el, "fgrid", "fillin", "formrow", "fields")) { return "Form"; }
    const c0 = el.firstElementChild;
    if (has(el, "kv", "tf")
      || (c0 && /^(span|b|strong|label)$/.test(c0.tagName.toLowerCase()) && /:$/.test(clean(c0.textContent))
          && clean(c0.textContent).length <= 40)) { return "Key-Value Region"; }
    if (tag === "pre" || tag === "code") { return "Code"; }
    // 5. positional running head/foot bands (short blocks hugging a page edge)
    if (h < 0.05 * pageH && yBot < 0.05 * pageH) { return "Page-header"; }
    if (h < 0.05 * pageH && yTop > 0.94 * pageH) { return "Page-footer"; }
    return "Text";
  };

  const SKIP = new Set(["script", "style", "link", "meta", "template", "br", "wbr", "colgroup", "col", "title", "head"]);
  const walk = (el) => {
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || !vis(el)) { return; }
    const box = rect(el);
    if (tag === "table") { out.push({ cls: "Table", box, text: null, tableIndex: tableCount++ }); return; }
    if (tag === "img" || tag === "svg" || tag === "canvas" || tag === "figure") {
      out.push({ cls: "Picture", box, text: null }); return;
    }
    const text = clean(el.innerText);
    if (!text) {
      // no text anywhere below: decoration or picture — but never swallow a table
      if (el.querySelector("table")) { [...el.children].filter(vis).forEach(walk); return; }
      const area = (box[2] - box[0]) * (box[3] - box[1]);
      if (styled(el) && area >= MIN_PICTURE_AREA) { out.push({ cls: "Picture", box, text: null }); }
      return;
    }
    const kids = [...el.children].filter(vis);
    const blockKids = kids.filter(blocky);
    const directText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const inlineTextKids = kids.some((k) => !blocky(k) && clean(k.innerText || k.textContent));
    if (blockKids.length && !directText && !inlineTextKids) { blockKids.forEach(walk); return; }
    // leaf (or mixed inline/block content): one item covers the whole element
    const hTag = /^h([1-6])$/.exec(tag);
    const item = { cls: classify(el, box, text), box, text };
    if (hTag) { item.attrs = { level: Number(hTag[1]) }; }
    out.push(item);
  };
  walk(document.body);

  // Checkbox glyphs: per-glyph Range measurement, overlaid on their host region.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n; (n = walker.nextNode());) {
    const s = n.textContent;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== "☐" && s[i] !== "☑" && s[i] !== "☒") { continue; }
      range.setStart(n, i); range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        out.push({ cls: s[i] === "☐" ? "Checkbox-Unselected" : "Checkbox-Selected",
                   box: [r.left + sx, r.top + sy, r.right + sx, r.bottom + sy], text: s[i] });
      }
    }
  }
  return out;
}

// Node-side. swept: sweepLayout() output. norm([x0,y0,x1,y1]) -> {page, bbox:
// [X0,Y0,X1,Y1]} — the caller's corrected fit-to-paper transform. tables:
// optional pre-normalized table records ({page, bbox}) in DOM order (the
// cells.json measurement); when given, Table items reuse those exact bboxes.
export function buildLayoutSidecar({ swept, norm, tables, pageWPt, pageHPt }) {
  const r6 = (v) => Number(v.toFixed(6));
  const items = swept.map((it, i) => {
    const src = it.tableIndex != null && tables && tables[it.tableIndex] ? tables[it.tableIndex] : norm(it.box);
    const [x0, y0, x1, y1] = src.bbox;
    const item = {
      id: i,
      class: it.cls,
      page: (src.page ?? 0) + 1,
      bbox: [x0, y0, r6(Math.max(0, x1 - x0)), r6(Math.max(0, y1 - y0))],
      reading_order: i,
      text: it.text ?? null,
    };
    if (it.attrs) { item.attrs = it.attrs; }
    return item;
  });
  return {
    version: 1,
    coords: "normalized [0,1] over the page, x rightward, y downward (top-left origin); bbox=[x,y,w,h] COCO-style",
    ontology: "canonical17",
    page_w_px: Math.round(pageWPt / 0.75),
    page_h_px: Math.round(pageHPt / 0.75),
    items,
  };
}
