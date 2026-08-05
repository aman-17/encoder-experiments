// Inline-markup-aware HTML escaping. Cell text and prose may contain a small
// whitelist of inline tags (emitted by Gemini where a real document would have
// them): <strong>, <em>, <u>, <s> (strikethrough), <sup>, <sub>, <br/>, and
// <a href> links. Everything else is escaped.
//
// CRITICAL: the ground-truth serializer and the rendered-document serializer
// BOTH call this on the SAME source string, so the answer and the PDF can never
// disagree about the markup.

export function inlineHtml(s) {
    let t = String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    // restore the whitelisted tags (b/i normalised to strong/em for consistency)
    t = t.replace(/&lt;br\s*\/?&gt;/gi, "<br/>");
    t = t.replace(/&lt;(\/?)b&gt;/gi, "<$1strong>");
    t = t.replace(/&lt;(\/?)i&gt;/gi, "<$1em>");
    t = t.replace(/&lt;(\/?)(strike|del)&gt;/gi, "<$1s>");
    t = t.replace(/&lt;(\/?)ins&gt;/gi, "<$1u>");
    t = t.replace(/&lt;(\/?)cite&gt;/gi, "<$1em>");
    t = t.replace(/&lt;(\/?)(strong|em|u|sup|sub|s)&gt;/gi, "<$1$2>");
    // Unwrap other harmless inline tags the model sometimes emits (small, mark,
    // abbr, span, code, …) — drop the tag but KEEP the text, so they never leak
    // into the page as literal "<ins>"-style markup.
    t = t.replace(/&lt;\/?(?:small|big|mark|abbr|q|span|code|tt|kbd|var|samp|dfn|time|bdi|font)(?:\s[^&]*?)?\/?&gt;/gi, "");
    // links: keep a SAFE http(s)/mailto href; any other anchor renders as styled
    // (colored/underlined) text with no href. Never allow javascript: etc.
    t = t.replace(/&lt;a\s+href=(["'])(.*?)\1&gt;/gi, (m, q, url) =>
        (/^(https?:\/\/|mailto:)/i.test(url) ? `<a href="${url.replace(/"/g, "%22")}">` : "<a>"));
    t = t.replace(/&lt;a(\s[^&]*)?&gt;/gi, "<a>");
    t = t.replace(/&lt;\/a&gt;/gi, "</a>");
    return t;
}
