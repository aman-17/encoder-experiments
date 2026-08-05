// Heron delta-class components (--delta-mix): the six classes the prod worker
// consumes downstream but which no training data supervised — layout-driven
// OCR targets Form / Key-Value Region and has dedicated Checkbox crop logic,
// the fast-markdown gate disqualifies pages containing form/checkbox/KV/index
// regions, and layout attribution cites them. Fine-tunes without supervision
// erode exactly these classes (measured: Form max score 0.89->0.61,
// Checkbox 0.78->0.28 after scan_v2_hardmix), so the generator must emit them
// with ground truth:
//   checkboxes -> Checkbox-Selected / Checkbox-Unselected — box covers the
//                 GLYPH + DESCRIPTION row (heron's convention: stock heron
//                 predicts 147x15px label-inclusive boxes at 0.9 confidence;
//                 glyph-only 12px GT scored 0.00 against every model)
//   kv_region  -> Key-Value Region (one box per pair block)
//   form       -> Form (wrapper box; may contain checkbox children)
//   code       -> Code (monospace block)
//   toc        -> Document Index (dot-leader contents block)

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CHECK_ITEMS = [
    "Applicant is a first-time filer", "Include supporting schedules", "Certified copy requested",
    "Direct deposit", "Notify by email", "Hazardous materials on site", "Smoke detectors installed",
    "Accessible entrance", "Renewal application", "Amended return", "Joint filing", "Third-party designee",
    "Equipment inspected and tagged", "Safety briefing completed", "Insurance certificate attached",
    "Background check authorized", "Terms and conditions accepted", "Subscribe to updates",
];
const KV_KEYS = [
    ["Invoice No.", () => `INV-${r4()}`], ["Date", dateStr], ["Due Date", dateStr],
    ["Customer ID", () => `C-${r4()}`], ["Account", () => `${r4()}-${r3()}`], ["PO Number", () => `PO-${r4()}`],
    ["Terms", () => pick(["Net 30", "Net 60", "Due on receipt", "2/10 Net 30"])],
    ["Reference", () => `REF/${r3()}/${r3()}`], ["Case Number", () => `2024-CV-${r4()}`],
    ["Policy No.", () => `PL-${r4()}-${r3()}`], ["Tax ID", () => `${r2()}-${r4()}${r3()}`],
    ["Currency", () => pick(["USD", "EUR", "GBP"])], ["Page", () => `${1 + (rnd() * 9 | 0)} of ${10 + (rnd() * 30 | 0)}`],
];
const FORM_TITLES = [
    "Section A — Applicant Information", "Part I: General Information", "Section 2 — Property Details",
    "Part B — Employer Certification", "Section 1: Contact Details", "Schedule C — Declarations",
];
const FORM_FIELDS = [
    "Full legal name", "Street address", "City / State / ZIP", "Date of birth", "Phone number",
    "Email address", "Employer name", "Occupation", "License number", "Signature", "Date signed",
    "Emergency contact", "Vehicle identification number", "Parcel number", "Gross annual income",
];
const TOC_TITLES = ["Table of Contents", "Contents", "Index of Sections"];
const TOC_ROWS = [
    "Executive Summary", "Introduction and Scope", "Definitions", "Governance Framework",
    "Risk Assessment", "Financial Statements", "Notes to the Accounts", "Compliance Requirements",
    "Implementation Timeline", "Monitoring and Review", "Appendix A: Data Tables",
    "Appendix B: Methodology", "Glossary of Terms", "References",
];
const CODE_SNIPPETS = [
    ["def compute_totals(rows):", "    total = 0.0", "    for row in rows:", "        total += row.amount * row.qty",
     "    return round(total, 2)", "", "result = compute_totals(load_rows())", "print(f\"Total: {result}\")"],
    ["SELECT account_id,", "       SUM(amount) AS total,", "       COUNT(*) AS n_tx", "FROM ledger",
     "WHERE posted_at >= '2024-01-01'", "GROUP BY account_id", "HAVING SUM(amount) > 10000", "ORDER BY total DESC;"],
    ["const rates = await fetchRates(base);", "const converted = items.map((it) => ({", "  ...it,",
     "  amount: it.amount * rates[it.ccy],", "}));", "export default converted;"],
    ["for f in reports/*.csv; do", "  awk -F, '{s+=$3} END {print FILENAME, s}' \"$f\"", "done | sort -k2 -rn | head -20"],
];

// tiny local RNG plumbing: callers pass their rng once per build
let rnd = Math.random;
const pick = (a) => a[(rnd() * a.length) | 0];
const r2 = () => String((rnd() * 89 + 10) | 0);
const r3 = () => String((rnd() * 899 + 100) | 0);
const r4 = () => String((rnd() * 8999 + 1000) | 0);
function dateStr() {
    const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(rnd() * 12) | 0];
    return `${m} ${1 + ((rnd() * 27) | 0)}, ${2019 + ((rnd() * 7) | 0)}`;
}

export const DELTA_KINDS = ["checkboxes", "kv_region", "form", "code", "toc"];

export function generateDeltaBlock(rng, kind) {
    rnd = rng;
    if (kind === "checkboxes") {
        const n = 3 + ((rng() * 6) | 0);
        const items = [];
        const pool = [...CHECK_ITEMS];
        for (let i = 0; i < n && pool.length; i++) {
            const item = pool.splice((rng() * pool.length) | 0, 1)[0];
            items.push({ label: item, checked: rng() < 0.45 });
        }
        return { kind, items, twoCol: n >= 6 && rng() < 0.5 };
    }
    if (kind === "kv_region") {
        const n = 3 + ((rng() * 6) | 0);
        const pool = [...KV_KEYS];
        const pairs = [];
        for (let i = 0; i < n && pool.length; i++) {
            const [k, gen] = pool.splice((rng() * pool.length) | 0, 1)[0];
            pairs.push({ k, v: gen() });
        }
        return { kind, pairs, boxed: rng() < 0.4, leaders: rng() < 0.35 };
    }
    if (kind === "form") {
        const n = 3 + ((rng() * 5) | 0);
        const pool = [...FORM_FIELDS];
        const fields = [];
        for (let i = 0; i < n && pool.length; i++) {
            const label = pool.splice((rng() * pool.length) | 0, 1)[0];
            fields.push({ label, filled: rng() < 0.35 ? dateStr() : "" });
        }
        const cbs = rng() < 0.6
            ? Array.from({ length: 1 + ((rng() * 3) | 0) }, () => ({ label: pick(CHECK_ITEMS), checked: rng() < 0.4 }))
            : [];
        return { kind, title: pick(FORM_TITLES), fields, cbs };
    }
    if (kind === "code") {
        return { kind, lines: pick(CODE_SNIPPETS), shaded: rng() < 0.6 };
    }
    // toc
    const n = 6 + ((rng() * 9) | 0);
    const rows = [];
    let page = 1 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
        page += 1 + ((rng() * 9) | 0);
        rows.push({ num: `${i + 1}.`, title: TOC_ROWS[i % TOC_ROWS.length], page });
    }
    return { kind, title: pick(TOC_TITLES), rows };
}

const cbSpan = (checked) => `<span class="cbx">${checked ? "✕" : ""}</span>`;

export function deltaHtml(block) {
    if (block.kind === "checkboxes") {
        const rows = block.items.map((it) => `<div class="cbrow ${it.checked ? "sel" : "uns"}">${cbSpan(it.checked)} <span>${esc(it.label)}</span></div>`).join("\n");
        return `<div class="cbgroup${block.twoCol ? " twocol" : ""}">\n${rows}\n</div>`;
    }
    if (block.kind === "kv_region") {
        const rows = block.pairs.map((p) =>
            `<div class="kvrow${block.leaders ? " lead" : ""}"><span class="kvk">${esc(p.k)}:</span><span class="kvfill"></span><span class="kvv">${esc(p.v)}</span></div>`).join("\n");
        return `<div class="kvregion${block.boxed ? " boxed" : ""}">\n${rows}\n</div>`;
    }
    if (block.kind === "form") {
        const fields = block.fields.map((f) =>
            `<div class="frow"><span class="flabel">${esc(f.label)}</span><span class="ffill">${esc(f.filled)}</span></div>`).join("\n");
        const cbs = block.cbs.length
            ? `\n<div class="fcbs">${block.cbs.map((c) => `<span class="cbitem ${c.checked ? "sel" : "uns"}">${cbSpan(c.checked)} <span class="fcbl">${esc(c.label)}</span></span>`).join("  ")}</div>`
            : "";
        return `<div class="formblock">\n<div class="ftitle">${esc(block.title)}</div>\n${fields}${cbs}\n</div>`;
    }
    if (block.kind === "code") {
        return `<pre class="codeblock${block.shaded ? " shaded" : ""}">${esc(block.lines.join("\n"))}</pre>`;
    }
    const rows = block.rows.map((r) =>
        `<div class="tocrow"><span>${esc(r.num)} ${esc(r.title)}</span><span class="tocfill"></span><span class="tocpg">${r.page}</span></div>`).join("\n");
    return `<div class="tocblock">\n<div class="toctitle">${esc(block.title)}</div>\n${rows}\n</div>`;
}

export function deltaCss(accent) {
    const acc = accent || "#444";
    return `
  .cbgroup { margin: 8px 0 12px; }
  .cbgroup.twocol { column-count: 2; column-gap: 28px; }
  .cbrow { margin: 3px 0; break-inside: avoid; }
  .cbx { display: inline-block; width: 0.85em; height: 0.85em; border: 1.4px solid #333;
         vertical-align: -0.08em; margin-right: 6px; text-align: center; line-height: 0.8em;
         font-size: 0.9em; font-weight: 700; color: #222; }
  .kvregion { margin: 8px 0 12px; max-width: 46%; }
  .kvregion.boxed { border: 1px solid ${acc}; padding: 8px 12px; }
  .kvrow { display: flex; align-items: baseline; gap: 6px; margin: 2.5px 0; }
  .kvk { font-weight: 600; }
  .kvrow.lead .kvfill { flex: 1; border-bottom: 1px dotted #999; }
  .formblock { border: 1.4px solid #333; padding: 10px 14px; margin: 10px 0 14px; max-width: 72%; }
  .ftitle { font-weight: 700; margin-bottom: 7px; border-bottom: 1px solid #333; padding-bottom: 3px; }
  .frow { display: flex; align-items: baseline; gap: 8px; margin: 6px 0; }
  .flabel { white-space: nowrap; }
  .ffill { flex: 1; border-bottom: 1px solid #444; min-height: 1em; padding: 0 4px; }
  .fcbs { margin-top: 8px; }
  .fcbl { margin-right: 14px; }
  pre.codeblock { font-family: 'Courier New', Menlo, monospace; font-size: 0.82em; line-height: 1.45;
                  padding: 10px 14px; margin: 8px 0 12px; overflow: hidden; }
  pre.codeblock.shaded { background: #f2f2f0; border: 1px solid #ddd; }
  .tocblock { margin: 10px 0 14px; max-width: 78%; }
  .toctitle { font-weight: 700; font-size: 1.05em; margin-bottom: 6px; }
  .tocrow { display: flex; align-items: baseline; gap: 6px; margin: 3px 0; }
  .tocfill { flex: 1; border-bottom: 1.3px dotted #888; }
  .tocpg { font-variant-numeric: tabular-nums; }`;
}
