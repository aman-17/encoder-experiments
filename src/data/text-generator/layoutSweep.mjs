// Layout sidecar support: a generic Canonical17 element sweep + sidecar builder.
// sweepLayout runs BROWSER-SIDE (passed to page.evaluate) against the print
// layout viewport — read-only, does not perturb the PDF. buildLayoutSidecar
// runs node-side and reuses the caller's fit-to-paper norm() (the corrected
// print-layout transform; see render.mjs) so layout.json coordinates are in
// the exact same normalized page space as cells.json.
//
// Emission contract (<id>.layout.json, version 2):
//   coords: INTEGER 0-1000 over the page (Qwen-VL grounding convention),
//   x rightward, y downward (top-left origin); bbox = [x, y, w, h] COCO-style.
//   Canonical17 labels. All internal math stays normalized float — the int
//   rounding happens only at the final emission point (intBbox below).
//   Box-tightness: a box is the INK extent of its element — text leaves are
//   glyph-tight (union of Range rects, plus any ink the element paints itself:
//   borders, backgrounds, and the <li> ::marker), while Tables, Pictures and
//   Form regions keep their border boxes. See inkBox()/markerX0() below.
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
  let firstText = null; // first non-furniture text leaf: promotion candidate metadata

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

  // ---- ink-tight boxes (box = ink extent of the element) --------------------
  // Text-bearing leaves are re-measured to the union of Range client rects over
  // their visible text (all text nodes, inline descendants included) PLUS the
  // border boxes of any node that paints ink of its own — visible border,
  // non-transparent background, background-image — or is a replaced graphic.
  // So a centered Title tightens to its glyphs, while a KV row with a
  // full-width underline stays full-width and a bordered panel keeps its panel
  // box. Tables, Pictures and Form regions keep border-box measurement. The
  // tight box is clamped to the element's border box so it can only tighten;
  // the one sanctioned extension is the <li> ::marker (markerX0 below).
  const inkless = (c) => c === "transparent" || /^rgba\(.+,\s*0\)$/.test(c);
  const paintsInk = (e) => {
    const cs = getComputedStyle(e);
    return cs.backgroundImage !== "none" || !inkless(cs.backgroundColor)
      || ["Top", "Right", "Bottom", "Left"].some((s) =>
        parseFloat(cs[`border${s}Width`]) > 0 && !inkless(cs[`border${s}Color`]));
  };
  const inkBox = (el, box) => {
    const rects = [];
    const rg = document.createRange();
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) {
      if (!/\S/.test(n.textContent) || getComputedStyle(n.parentElement).visibility === "hidden") { continue; }
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) { if (q.width > 0.5 && q.height > 0.5) { rects.push(q); } }
    }
    for (const e of [el, ...el.querySelectorAll("*")]) {
      if (e !== el && !vis(e)) { continue; }
      const tg = e.tagName.toLowerCase();
      if (tg === "img" || tg === "svg" || tg === "canvas" || paintsInk(e)) {
        const q = e.getBoundingClientRect();
        if (q.width > 0.5 && q.height > 0.5) { rects.push(q); }
      }
    }
    if (!rects.length) { return box.slice(); }
    const x0 = Math.max(box[0], Math.min(...rects.map((q) => q.left)) + sx);
    const y0 = Math.max(box[1], Math.min(...rects.map((q) => q.top)) + sy);
    const x1 = Math.min(box[2], Math.max(...rects.map((q) => q.right)) + sx);
    const y1 = Math.min(box[3], Math.max(...rects.map((q) => q.bottom)) + sy);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : box.slice();
  };
  // <li> ::marker left edge (page coords), or null when there is no marker.
  // Markers are pseudo-elements a Range cannot select; same marker-advance
  // trick as layoutSidecar.mjs: toggling the SAME element to
  // list-style-position:inside pushes the first line right by exactly the
  // outside marker's advance. The inline style is saved and restored, so the
  // layout Chrome prints is untouched.
  const markerX0 = (el) => {
    const firstLineX = () => {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const q = [...rg.getClientRects()].filter((k) => k.width > 0.5 && k.height > 0.5);
      return q.length ? q[0].x : el.getBoundingClientRect().x;
    };
    const prevPos = el.style.listStylePosition;
    el.style.listStylePosition = "outside";
    const xOut = firstLineX();
    el.style.listStylePosition = "inside";
    const xIn = firstLineX();
    el.style.listStylePosition = prevPos;
    const advance = xIn - xOut; // 0 when there is no marker
    return advance > 0.5 ? firstLineX() - advance + sx : null;
  };

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
    // Ink-tight re-measure (Form regions keep their border box; Tables and
    // Pictures never reach this branch). Stored aside, NOT applied yet: the
    // positional classify() bands above and the Title promotion below must
    // keep judging the original block boxes, so classes stay identical.
    if (item.cls !== "Form") {
      const tight = inkBox(el, box);
      if (getComputedStyle(el).display === "list-item") {
        const mx = markerX0(el);
        if (mx != null) { tight[0] = Math.min(tight[0], mx); }
      }
      item.tight = tight;
    }
    // Remember the first text block (page furniture aside) for the centered-
    // title promotion below: its font + the glyph-ink extent (a full-width
    // text-align:center block has a full-width border box, so centering must
    // be judged on the ink, not the box).
    if (!firstText && item.cls !== "Page-header" && item.cls !== "Page-footer") {
      const cs = getComputedStyle(el);
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const rects = [...rg.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
      firstText = {
        idx: out.length,
        fs: parseFloat(cs.fontSize) || 0,
        fw: parseInt(cs.fontWeight, 10) || 400,
        centered: cs.textAlign === "center",
        ink: rects.length
          ? [Math.min(...rects.map((q) => q.left)) + sx, Math.max(...rects.map((q) => q.right)) + sx]
          : [box[0], box[2]],
      };
    }
    out.push(item);
  };
  walk(document.body);

  // Multi-line centered exhibit/document titles: replica templates typically
  // set the page title as a styled <div>/<p>, not an <h*>, so classify() fell
  // through to Text. DocLayNet labels these Title — promote the FIRST text
  // block when it is centered, starts in the top 30% of page one, sits above
  // every table, and is set larger or bolder than the document body. A real
  // <h1>/title-classed heading anywhere still wins (no promotion once
  // seenTitle). The promotion is heuristic (no heading markup behind it), so
  // attrs.prev_class preserves the class the block would otherwise have kept.
  if (firstText && !seenTitle && out[firstText.idx].cls === "Text") {
    const it = out[firstText.idx];
    const [, y0, , y1] = it.box;
    const bodyCs = getComputedStyle(document.body);
    const bodyFs = parseFloat(bodyCs.fontSize) || 16;
    const bodyFw = parseInt(bodyCs.fontWeight, 10) || 400;
    const inkW = firstText.ink[1] - firstText.ink[0];
    const centered = firstText.centered
      || (inkW < 0.85 * pageW && Math.abs((firstText.ink[0] + firstText.ink[1]) / 2 - pageW / 2) < 0.05 * pageW);
    const aboveTables = out.every((o) => o.tableIndex == null || o.box[1] >= y1);
    if (centered && y0 < 0.3 * pageH && y1 <= pageH && aboveTables
        && (firstText.fs > bodyFs + 0.5 || firstText.fw > bodyFw)) {
      it.cls = "Title";
      it.attrs = { ...it.attrs, prev_class: "Text" };
    }
  }

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
  // Swap in the ink-tight boxes now that every box-driven decision (classify
  // positional bands, Title promotion, aboveTables) has run on the original
  // block boxes. Only bboxes change; class/text/reading order are untouched.
  for (const o of out) { if (o.tight) { o.box = o.tight; delete o.tight; } }
  return out;
}

// Final emission: normalized-float [x,y,w,h] -> INTEGER 0-1000 page coords.
// Each value = Math.round(norm*1000) clamped to [0,1000]; then w,h are floored
// at 1 (no zero-size boxes) and x,y re-clamped so x+w<=1000, y+h<=1000.
export function intBbox(x, y, w, h) {
  const q = (v) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
  const W = Math.max(1, q(w));
  const H = Math.max(1, q(h));
  const X = Math.min(q(x), 1000 - W);
  const Y = Math.min(q(y), 1000 - H);
  return [X, Y, W, H];
}

export const COORDS_V2 = "integer 0-1000 scale over the page, x rightward, y downward (top-left origin); bbox=[x,y,w,h]";

// Node-side. swept: sweepLayout() output. norm([x0,y0,x1,y1]) -> {page, bbox:
// [X0,Y0,X1,Y1]} — the caller's corrected fit-to-paper transform. tables:
// optional pre-normalized table records ({page, bbox}) in DOM order (the
// cells.json measurement); when given, Table items reuse those exact bboxes
// (float internally; integerized only by intBbox at emission).
export function buildLayoutSidecar({ swept, norm, tables, pageWPt, pageHPt }) {
  const items = swept.map((it, i) => {
    const src = it.tableIndex != null && tables && tables[it.tableIndex] ? tables[it.tableIndex] : norm(it.box);
    const [x0, y0, x1, y1] = src.bbox;
    const item = {
      id: i,
      class: it.cls,
      page: (src.page ?? 0) + 1,
      bbox: intBbox(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)),
      reading_order: i,
      text: it.text ?? null,
    };
    if (it.attrs) { item.attrs = it.attrs; }
    return item;
  });
  return {
    version: 2,
    coords: COORDS_V2,
    ontology: "canonical17",
    page_w_px: Math.round(pageWPt / 0.75),
    page_h_px: Math.round(pageHPt / 0.75),
    items,
  };
}
