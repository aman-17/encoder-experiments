// Builds the logical MODEL of a math document: title/chrome, sections, prose
// paragraphs with inline math, display formulas, theorem/proof scaffolding,
// exam problems, handbook entries. Everything is procedural (NO LLM) and
// deterministic from the rng. The LaTeX strings stored here ARE the ground
// truth — the renderer and the gold markdown both consume this model.
//
// Every formula is validated through KaTeX at build time: a formula that would
// produce an error box is LOGGED and REGENERATED, so the model only ever
// contains cleanly renderable LaTeX.

import katex from "katex";
import { faker } from "@faker-js/faker";
import { displayFormula, inlineFormula, tierTopics } from "./formulas.mjs";
import { pickStyle } from "./mathStyles.mjs";

// ---- runs helpers (a paragraph is a list of text/math runs) ----------------
const T = (v) => ({ t: "text", v });
const M = (v) => ({ t: "math", v });

// ---- KaTeX validation -------------------------------------------------------
let rejected = 0;
export const katexRejectCount = () => rejected;

function rendersClean(latex, displayMode) {
    try {
        const html = katex.renderToString(latex, { throwOnError: false, displayMode, strict: "ignore" });
        return !html.includes("katex-error");
    } catch (e) {
        return false;
    }
}

// opts.seen: a doc-level Set of already-used display LaTeX — duplicates are
// re-rolled (a page showing the same formula twice reads as broken). On
// exhaustion the last clean formula is returned with dup:true so callers that
// can simply SKIP an item (handbook) do so.
function validDisplay(rng, tier, opts = {}) {
    let lastClean = null;
    for (let attempt = 0; attempt < 15; attempt++) {
        const f = displayFormula(rng, tier, opts.topic);
        if (opts.noWide && f.wide) { continue; }
        if (!rendersClean(f.latex, true)) {
            rejected += 1;
            console.error(`  ! katex reject (display, regenerating): ${f.latex}`);
            continue;
        }
        if (opts.seen && opts.seen.has(f.latex)) { lastClean = f; continue; }
        if (opts.seen) { opts.seen.add(f.latex); }
        return f;
    }
    if (lastClean) { return { ...lastClean, dup: true }; }
    return { latex: "x = 0", topic: "algebra", wide: false, dup: true };
}

function validInline(rng, tier) {
    for (let attempt = 0; attempt < 15; attempt++) {
        const latex = inlineFormula(rng, tier);
        if (rendersClean(latex, false)) { return latex; }
        rejected += 1;
        console.error(`  ! katex reject (inline, regenerating): ${latex}`);
    }
    return "x";
}

// ---- tier machinery ---------------------------------------------------------
// Batch mix: ~20% easy-dominant, ~45% medium-dominant, ~35% hard-dominant.
export function pickDocTier(rng) {
    return rng.weighted([["easy", 20], ["medium", 45], ["hard", 35]]);
}

// Each doc mixes tiers but is dominated by its own tier.
function tierFor(rng, docTier) {
    if (docTier === "easy") { return rng.weighted([["easy", 62], ["medium", 30], ["hard", 8]]); }
    if (docTier === "hard") { return rng.weighted([["hard", 58], ["medium", 32], ["easy", 10]]); }
    return rng.weighted([["medium", 60], ["easy", 22], ["hard", 18]]);
}

// ---- prose banks -------------------------------------------------------------
const NOUNS = ["state variable", "damping coefficient", "sample mean", "step size", "decay rate", "angular frequency", "diffusion constant", "boundary term", "residual", "eigenvalue", "normalising constant", "convergence rate", "perturbation parameter", "partition width", "initial condition", "regularisation weight", "phase offset", "scaling exponent", "error term", "coupling constant"];
const ADJS = ["bounded", "continuous", "strictly positive", "monotone", "measurable", "real-valued", "smooth", "integrable", "non-negative", "well-defined", "uniformly bounded", "finite"];
const OBJS = ["function", "sequence", "estimator", "operator", "integral", "series", "matrix", "random variable", "solution", "expression", "identity", "recurrence"];

const LEADINS = [
    "Expanding the product and collecting like terms gives",
    "Recall the standard identity",
    "The solution can be written in closed form as",
    "Differentiating both sides with respect to the free variable yields",
    "Applying the definition directly, we obtain",
    "Substituting back into the original equation gives",
    "This leads immediately to",
    "Combining the two estimates above, we find",
    "In particular, one has",
    "A direct computation shows that",
    "After a routine change of variables,",
    "By the usual telescoping argument,",
    "Passing to the limit, we conclude that",
    "The key relation is",
];

// A single prose sentence with 0-1 inline formulas. Returns a runs array.
// `used` (a Set) dedupes templates within one paragraph so the same phrasing
// never repeats back to back.
function sentence(rng, tier, used) {
    const noun = () => rng.pick(NOUNS);
    const adj = () => rng.pick(ADJS);
    const obj = () => rng.pick(OBJS);
    const inl = () => M(validInline(rng, tier));
    const templates = [
        () => [T(`We consider the ${obj()} `), inl(), T(`, where `), inl(), T(` denotes the ${noun()}.`)],
        () => [T(`Let `), inl(), T(` be a ${adj()} parameter, and write `), inl(), T(` for the ${noun()}.`)],
        () => [T(`Throughout this section we assume `), inl(), T(` and take the ${noun()} to be ${adj()}.`)],
        () => [T(`The quantity `), inl(), T(` plays the role of a ${noun()} in what follows.`)],
        () => [T(`Observe that the ${obj()} is ${adj()} whenever `), inl(), T(`.`)],
        () => [T(`By construction, `), inl(), T(` is ${adj()}, so the ${obj()} is well behaved.`)],
        () => [T(`A short computation shows that the ${noun()} depends only on `), inl(), T(`.`)],
        () => [T(`In practice one chooses `), inl(), T(` so that the ${noun()} remains small.`)],
        () => [T(`This bound is sharp up to a factor of `), inl(), T(`.`)],
        () => [T(`The same argument applies verbatim to any ${adj()} ${obj()}.`)],
        () => [T(`We now turn to the behaviour of the ${obj()} near the boundary of the domain.`)],
        () => [T(`Note that the ${noun()} is independent of the choice of `), inl(), T(`.`)],
        () => [T(`The condition `), inl(), T(` guarantees that the ${obj()} is ${adj()}.`)],
        () => [T(`It is convenient to normalise so that the ${noun()} equals one.`)],
    ];
    let idx = Math.floor(rng() * templates.length);
    if (used) {
        for (let tries = 0; tries < 6 && used.has(idx); tries++) { idx = Math.floor(rng() * templates.length); }
        used.add(idx);
    }
    return templates[idx]();
}

function joinSentences(parts) {
    const runs = [];
    parts.forEach((p, i) => {
        if (i > 0) { runs.push(T(" ")); }
        runs.push(...p);
    });
    return runs;
}

function paragraph(rng, docTier, nSent) {
    const parts = [];
    const used = new Set();
    for (let i = 0; i < nSent; i++) { parts.push(sentence(rng, tierFor(rng, docTier), used)); }
    return { type: "p", runs: joinSentences(parts) };
}

// Symbol-like inline math for "where X denotes ..." clauses — a quantity a
// sentence can plausibly NAME (a greek letter, a subscripted variable), not an
// arbitrary relation like `\det A \ne 0`.
const SYMBOLS = [
    "\\alpha", "\\beta", "\\gamma", "\\lambda", "\\mu", "\\theta", "\\sigma", "\\omega", "\\varepsilon", "\\kappa",
    "\\sigma^2", "\\lambda_1", "\\theta_0", "x_i", "a_{ij}", "\\mathcal{L}", "x^{\\mu}", "\\Delta t", "c_0", "\\hbar",
];

// "where x denotes the ..." follow-up right after a display formula.
function whereClause(rng, tier) {
    const [a, b] = rng.shuffle(SYMBOLS);
    const [n1, n2] = rng.shuffle(NOUNS);
    const templates = [
        () => [T("where "), M(a), T(` denotes the ${n1} and `), M(b), T(` is the ${n2}.`)],
        () => [T("Here "), M(a), T(` is the ${n1} introduced above.`)],
        () => [T("The right-hand side is "), T(`${rng.pick(ADJS)} for every choice of `), M(a), T(".")],
        () => [T("where the ") , T(`${n1} `), M(a), T(` is held fixed.`)],
    ];
    return { type: "p", runs: rng.pick(templates)() };
}

function eqRef(rng, eq) {
    const n = rng.int(1, eq.n);
    const templates = [
        `Combining this with equation (${n}) gives the desired bound.`,
        `Equation (${n}) shows that the ${rng.pick(NOUNS)} is ${rng.pick(ADJS)}.`,
        `This is precisely the situation covered by equation (${n}).`,
    ];
    return { type: "p", runs: [T(rng.pick(templates))] };
}

// ---- display blocks ----------------------------------------------------------
function displayBlock(ctx, opts = {}) {
    const tier = opts.tier || tierFor(ctx.rng, ctx.docTier);
    const f = validDisplay(ctx.rng, tier, { ...opts, seen: ctx.seen });
    let latex = f.latex;
    let tag = null;
    if (ctx.style.numberEqs > 0 && ctx.rng.bool(ctx.style.numberEqs)) {
        ctx.eq.n += 1;
        tag = ctx.eq.n;
        latex = `${latex}\\tag{${tag}}`;
        if (!rendersClean(latex, true)) {
            // \tag failed on this construct — keep the untagged formula.
            console.error(`  ! katex reject (tagged, dropping tag): ${latex}`);
            latex = f.latex;
            tag = null;
            ctx.eq.n -= 1;
        }
    }
    ctx.nFormulas += 1;
    return { type: "display", latex, tag, wide: f.wide, topic: f.topic };
}

// A "beat": optional intro paragraph, a lead-in line, a display formula, and an
// optional "where ..." follow-up — the basic rhythm of mathematical prose.
function beat(ctx, opts = {}) {
    const blocks = [];
    if (opts.para !== false && ctx.rng.bool(0.65)) {
        const p = paragraph(ctx.rng, ctx.docTier, ctx.rng.int(1, 3));
        ctx.nFormulas += p.runs.filter((x) => x.t === "math").length;
        blocks.push(p);
    }
    blocks.push({ type: "p", runs: [T(rng2colon(ctx.rng, ctx.rng.pick(LEADINS)))] });
    blocks.push(displayBlock(ctx, opts));
    if (ctx.rng.bool(0.45)) {
        const w = whereClause(ctx.rng, tierFor(ctx.rng, ctx.docTier));
        ctx.nFormulas += w.runs.filter((x) => x.t === "math").length;
        blocks.push(w);
    } else if (ctx.eq.n > 0 && ctx.rng.bool(0.25)) {
        blocks.push(eqRef(ctx.rng, ctx.eq));
    }
    return blocks;
}

const rng2colon = (rng, s) => (rng.bool(0.5) && !/[,.]$/.test(s) ? `${s}:` : s);

// ---- theorem/lemma/proof scaffolding ------------------------------------------
const ENV_KINDS = ["Theorem", "Lemma", "Definition", "Proposition", "Example", "Remark", "Corollary"];

function envBlock(ctx, secNum, kind) {
    const k = kind || ctx.rng.pick(ENV_KINDS);
    const label = ctx.rng.bool(0.8) ? `${secNum}.${ctx.envCount += 1}` : null;
    const p = paragraph(ctx.rng, ctx.docTier, ctx.rng.int(1, 2));
    ctx.nFormulas += p.runs.filter((x) => x.t === "math").length;
    const disp = ctx.rng.bool(0.7) ? displayBlock(ctx) : null;
    return { type: "env", kind: k, label, runs: p.runs, display: disp };
}

function proofBlock(ctx) {
    const p = paragraph(ctx.rng, ctx.docTier, ctx.rng.int(1, 2));
    ctx.nFormulas += p.runs.filter((x) => x.t === "math").length;
    const runs = [...p.runs];
    const disp = ctx.rng.bool(0.5) ? displayBlock(ctx) : null;
    if (!disp && ctx.rng.bool(0.5)) { runs.push(T(" ")); runs.push(M("\\blacksquare")); ctx.nFormulas += 1; }
    return { type: "env", kind: "Proof", label: null, runs, display: disp };
}

// ---- titles -------------------------------------------------------------------
const TOPIC_TITLES = {
    easy: ["Working with Fractions and Exponents", "Linear Equations and Their Graphs", "Sums, Sequences and Simple Series", "Introductory Trigonometric Identities", "Quadratic Equations in One Variable", "Foundations of Algebraic Manipulation"],
    medium: ["Techniques of Integration", "Limits and Continuity", "Partial Derivatives and the Chain Rule", "The Binomial Theorem and Counting", "Matrices and Linear Systems", "Expectation, Variance and Moments", "Definite Integrals in Applied Problems"],
    hard: ["Series Expansions and Convergence", "Determinants and Multilinear Forms", "Multiple Integrals in Curvilinear Coordinates", "Continued Fractions and Approximation", "Tensor Calculus on Curved Spaces", "Asymptotic Methods in Analysis", "Piecewise Structures and Case Analysis"],
};

const PAPER_TOPICS = ["Alternating Series", "Spectral Estimates", "Maximum-Likelihood Estimators", "Quadrature Rules", "Random Matrix Ensembles", "Boundary-Value Problems", "Curvature Invariants", "Nested Summation Identities", "Piecewise-Smooth Dynamics"];
const PAPER_FORMS = ["On the Convergence of %s", "A Note on %s", "Asymptotic Estimates for %s", "Sharp Bounds for %s", "An Elementary Approach to %s", "Remarks on %s"];

const SECTION_HEADS = ["Preliminaries", "Main Results", "Worked Examples", "The General Case", "Applications", "A Key Identity", "Estimates and Bounds", "Further Remarks", "Setting and Notation", "Consequences"];
const LECTURE_HEADS = ["Recap from last time", "Today's main identity", "A worked example", "Why this matters", "Common pitfalls", "A slicker proof", "Warm-up", "The main computation"];

const HB_TOPIC_HEADS = {
    algebra: "Algebraic Identities", trig: "Trigonometric Identities", sequences: "Sums and Sequences",
    geometry: "Geometry and Mensuration", calculus: "Differential and Integral Calculus",
    combinatorics: "Combinatorics", "linear-algebra": "Matrices and Determinants",
    probability: "Probability and Statistics", analysis: "Series and Analysis", physics: "Tensor and Field Equations",
};
// Handbook items are labelled in reference style ("2.3." or "Result 2.3") —
// enumerated labels are what real formula compendia use, and unlike semantic
// names they can never contradict the randomly drawn formula next to them.
const HB_LABEL_WORDS = ["Result", "Formula"];

// ---- per-archetype document builders -------------------------------------------

function textbookDoc(ctx) {
    const rng = ctx.rng;
    const chapter = rng.int(2, 14);
    const secBase = rng.int(1, 5);
    ctx.doc.kicker = `Chapter ${chapter} · Section ${chapter}.${secBase}`;
    ctx.doc.title = rng.pick(TOPIC_TITLES[ctx.docTier]);
    const nSec = rng.int(2, 3);
    const heads = rng.shuffle(SECTION_HEADS);
    for (let s = 1; s <= nSec; s++) {
        const blocks = [];
        if (s === 1) {
            const p = paragraph(rng, ctx.docTier, rng.int(2, 3));
            ctx.nFormulas += p.runs.filter((x) => x.t === "math").length;
            blocks.push(p);
            blocks.push(envBlock(ctx, s, rng.pick(["Definition", "Theorem"])));
            blocks.push(...beat(ctx, { para: false }));
        } else {
            const env = envBlock(ctx, s, rng.pick(["Theorem", "Lemma", "Example", "Proposition"]));
            blocks.push(env);
            if ((env.kind === "Theorem" || env.kind === "Lemma") && rng.bool(0.6)) {
                blocks.push(proofBlock(ctx));
            }
            blocks.push(...beat(ctx));
        }
        if (ctx.nFormulas < 15 && rng.bool(0.55)) { blocks.push(...beat(ctx)); }
        ctx.doc.sections.push({ heading: `${chapter}.${secBase + s - 1} ${heads[s - 1]}`, blocks });
    }
}

function paperDoc(ctx) {
    const rng = ctx.rng;
    faker.seed(Math.floor(rng() * 2 ** 31));
    const nAuth = rng.int(2, 4);
    const names = Array.from({ length: nAuth }, () => `${faker.person.firstName()[0]}. ${faker.person.lastName()}`);
    const inst = rng.pick(["Department of Mathematics, State University", "Institute for Applied Analysis", "School of Mathematical Sciences", "Center for Computational Mathematics", "Faculty of Science, Northern University"]);
    // Avoid form/topic word repetition ("Asymptotic Estimates for Spectral
    // Estimates"): re-pick the topic when it shares a word with the form.
    let form = rng.pick(PAPER_FORMS);
    let topic = rng.pick(PAPER_TOPICS);
    for (let tries = 0; tries < 6; tries++) {
        const shared = topic.toLowerCase().split(/\s+/).some((w) => form.toLowerCase().includes(w));
        if (!shared) { break; }
        topic = rng.pick(PAPER_TOPICS);
    }
    ctx.doc.title = form.replace("%s", topic);
    ctx.doc.byline = `${names.join(", ")} · ${inst}`;
    ctx.doc.meta = `arXiv:${2019 + rng.int(0, 6)}.${String(rng.int(1000, 99999)).padStart(5, "0")}v${rng.int(1, 3)} [math.CA] · ${2019 + rng.int(0, 6)}`;
    const ap = paragraph(rng, ctx.docTier, rng.int(2, 3));
    ctx.nFormulas += ap.runs.filter((x) => x.t === "math").length;
    ctx.doc.abstract = ap.runs;
    const heads = ["Introduction", rng.pick(["Main Result", "The Key Estimate", "Setting and Notation"])];
    if (rng.bool(0.6)) { heads.push(rng.pick(["Auxiliary Lemmas", "Two Examples", "The Boundary Case"])); }
    heads.push(rng.pick(["Discussion", "Applications", "Concluding Remarks"]));
    heads.forEach((h, i) => {
        const s = i + 1;
        const blocks = [];
        if (s === 1) {
            const p = paragraph(rng, ctx.docTier, rng.int(2, 3));
            ctx.nFormulas += p.runs.filter((x) => x.t === "math").length;
            blocks.push(p);
            blocks.push(...beat(ctx, { para: false }));
        } else if (s === 2) {
            const env = envBlock(ctx, s, rng.pick(["Theorem", "Lemma", "Proposition"]));
            blocks.push(env);
            if (rng.bool(0.7)) { blocks.push(proofBlock(ctx)); }
            blocks.push(...beat(ctx, { para: false }));
        } else {
            blocks.push(...beat(ctx));
        }
        if (ctx.nFormulas < 15 && rng.bool(0.85)) { blocks.push(...beat(ctx, { para: false })); }
        ctx.doc.sections.push({ heading: `${s}. ${h}`, blocks });
    });
}

function lectureDoc(ctx) {
    const rng = ctx.rng;
    faker.seed(Math.floor(rng() * 2 ** 31));
    ctx.doc.kicker = `MATH ${rng.int(2, 6)}${rng.int(0, 9)}${rng.int(0, 9)}0 · Lecture ${rng.int(3, 26)}`;
    ctx.doc.title = rng.pick(TOPIC_TITLES[ctx.docTier]);
    ctx.doc.meta = `Scribe: ${faker.person.firstName()} ${faker.person.lastName()} · ${rng.pick(["Fall", "Spring", "Winter"])} ${2020 + rng.int(0, 5)}`;
    const nSec = rng.int(3, 4);
    const heads = rng.shuffle(LECTURE_HEADS);
    for (let s = 1; s <= nSec; s++) {
        const blocks = [];
        blocks.push(...beat(ctx));
        if (rng.bool(0.4)) { blocks.push(envBlock(ctx, s, rng.pick(["Remark", "Example", "Lemma"]))); }
        if (ctx.nFormulas < 15 && rng.bool(0.5)) { blocks.push(...beat(ctx, { para: false })); }
        ctx.doc.sections.push({ heading: heads[s - 1], blocks });
    }
}

const EXAM_VERBS = [
    "Evaluate the following expression, showing all working:",
    "Simplify the expression below and justify each step:",
    "Prove the identity:",
    "Verify the following relation:",
    "Compute the value of the expression:",
    "Show that",
    "Derive the following result from first principles:",
    "State the conditions under which the following holds, and prove it:",
];

function examDoc(ctx) {
    const rng = ctx.rng;
    ctx.doc.title = `MATH ${rng.int(1, 4)}${rng.int(0, 9)}${rng.int(0, 9)}0 — ${rng.pick(["Midterm Examination", "Final Examination", "Problem Set " + rng.int(2, 9), "Practice Examination"])}`;
    // A 2-column exam page holds more problems than a 1-column one.
    const nProb = ctx.doc.ncols === 2 ? rng.int(8, 11) : rng.int(6, 8);
    const problems = [];
    let total = 0;
    for (let n = 1; n <= nProb; n++) {
        const points = rng.pick([5, 5, 8, 10, 10, 12, 15]);
        total += points;
        const runs = [T(rng.pick(EXAM_VERBS))];
        if (rng.bool(0.35)) {
            const s = sentence(rng, tierFor(rng, ctx.docTier));
            ctx.nFormulas += s.filter((x) => x.t === "math").length;
            runs.unshift(...s, T(" "));
        }
        const displays = [displayBlock(ctx)];
        if (rng.bool(0.35)) { displays.push(displayBlock(ctx)); }
        problems.push({ type: "problem", num: n, points, runs, displays });
    }
    ctx.doc.meta = `Time allowed: ${rng.pick([60, 90, 120])} minutes · Total: ${total} points`;
    ctx.doc.instructions = `Answer all ${nProb} questions. Show all working; unjustified answers receive no credit. ${rng.pick(["Calculators are not permitted.", "A formula sheet is provided.", "Standard results may be quoted without proof."])}`;
    ctx.doc.sections.push({ heading: null, blocks: problems });
}

function handbookDoc(ctx) {
    const rng = ctx.rng;
    ctx.doc.title = rng.pick(["Mathematical Formula Reference", "Handbook of Standard Results", "Quick Reference: Core Formulas", "Formula Compendium"]);
    ctx.doc.meta = `${rng.pick(["Compiled for review purposes", "Course companion", "Desk reference", "Revision sheet"])} · Edition ${rng.int(2, 9)} · ${2019 + rng.int(0, 6)}`;
    // Groups drawn from the topics available in this doc's tier mix.
    const topicPool = rng.shuffle([...new Set([...tierTopics(ctx.docTier), ...tierTopics(tierFor(rng, ctx.docTier))])]);
    const nGroups = Math.min(topicPool.length, rng.int(4, 5));
    const noWide = ctx.doc.ncols >= 3;
    // Per-doc label style: bare numbering ("2.3.") or worded ("Result 2.3").
    const labelWord = rng.bool(0.6) ? null : rng.pick(HB_LABEL_WORDS);
    for (let g = 0; g < nGroups; g++) {
        if (ctx.nFormulas >= 20) { break; } // stay in the 6-20 formulas band
        const topic = topicPool[g];
        const nItems = Math.min(rng.int(4, 6), 20 - ctx.nFormulas);
        const blocks = [];
        for (let i = 0; i < nItems; i++) {
            // The item's tier must actually CONTAIN the group's topic, or the
            // formula would silently fall back to another topic and no longer
            // match its label / group heading.
            let tier = tierFor(rng, ctx.docTier);
            if (!tierTopics(tier).includes(topic)) {
                const candidates = ["easy", "medium", "hard"].filter((t) => tierTopics(t).includes(topic));
                tier = rng.pick(candidates);
            }
            const f = validDisplay(rng, tier, { topic, noWide, seen: ctx.seen });
            if (f.dup) { continue; } // this (tier, topic) pool is exhausted
            ctx.nFormulas += 1;
            const num = `${ctx.doc.sections.length + 1}.${blocks.length + 1}`;
            blocks.push({ type: "item", label: labelWord ? `${labelWord} ${num}` : num, latex: f.latex, wide: f.wide });
        }
        // A (tier, topic, noWide) pool can be exhausted (e.g. a 3-column doc
        // whose medium-tier algebra entries are all wide) — never emit a group
        // heading with zero items under it.
        if (blocks.length) {
            ctx.doc.sections.push({ heading: HB_TOPIC_HEADS[topic] || "Standard Results", blocks });
        }
    }
}

// ---- MG_OLD_BOOK family: treatise18 / letterpress1900 / midcentury ------------
// Content builders for the "old scanned math book" substyles. They live in
// their own banks (NOT added to formulas.mjs' shared banks — that would shift
// rng.pick ranges and break same-seed reproducibility of flag-off runs).
const r = String.raw;

// LONG-S substitution for 18th-century body text: medial lowercase s -> ſ,
// never word-final, never uppercase, never inside math (only text runs pass
// through here). The gold markdown records the transformed text — the glyphs
// actually rendered are the ground truth.
export const longS = (s) => s.replace(/s(?=[a-zà-ÿ])/g, "ſ");

// Validate + dedupe a formula drawn from a substyle-specific bank.
function validCustom(ctx, bank) {
    for (let attempt = 0; attempt < 12; attempt++) {
        const latex = ctx.rng.pick(bank)(ctx.rng);
        if (!rendersClean(latex, true)) {
            rejected += 1;
            console.error(`  ! katex reject (old-book display, regenerating): ${latex}`);
            continue;
        }
        if (ctx.seen.has(latex)) { continue; }
        ctx.seen.add(latex);
        return latex;
    }
    return null; // bank exhausted -> caller falls back to the shared banks
}

// Wrap a custom LaTeX string as a display block, applying the same equation-
// numbering (\tag) contract as displayBlock().
function customDisplayBlock(ctx, latex) {
    let out = latex;
    let tag = null;
    if (ctx.style.numberEqs > 0 && ctx.rng.bool(ctx.style.numberEqs)) {
        ctx.eq.n += 1;
        tag = ctx.eq.n;
        const tagged = `${out}\\tag{${tag}}`;
        if (rendersClean(tagged, true)) {
            out = tagged;
        } else {
            console.error(`  ! katex reject (tagged, dropping tag): ${tagged}`);
            tag = null;
            ctx.eq.n -= 1;
        }
    }
    ctx.nFormulas += 1;
    return { type: "display", latex: out, tag, wide: false, topic: "old-book" };
}

// A display for an old-book doc: substyle bank with probability pBank, else the
// shared banks restricted to the substyle's preferred (topic, tier) pairs.
function oldDisplay(ctx, bank, pBank, topicPairs) {
    if (ctx.rng.bool(pBank)) {
        const latex = validCustom(ctx, bank);
        if (latex !== null) { return customDisplayBlock(ctx, latex); }
    }
    const [topic, tier] = ctx.rng.pick(topicPairs);
    return displayBlock(ctx, { topic, tier });
}

// ---- treatise18: 18th-century Latin-flavoured treatise -------------------------
// Anchors: "of the Binomial Theorem." p.11 and the Precession-of-the-Equinoxes
// page — long-ſ prose, italic running head, "§. N." section marks, bracket
// fractions/factorials, series with "&c.", catchword bottom right.
const TREATISE_DISPLAY = [
    (rng) => r`(1+x)^{n} = 1 + \frac{n}{1}x + \frac{n(n-1)}{1 \cdot 2}x^{2} + \frac{n(n-1)(n-2)}{1 \cdot 2 \cdot 3}x^{3} + \&c.`,
    (rng) => r`[m]^{${rng.pick(["r", "i"])}} = m(m-1)(m-2) \cdots (m-${rng.pick(["r", "i"])}+1)`,
    () => r`[m+r]^{r+s} = [m+r]^{r}\,[m]^{s}`,
    () => r`[m]^{-r} = \frac{1}{[m+r]^{r}}`,
    (rng) => { const k = rng.int(2, 3); return r`\left[\frac{i}{${k}}\right]^{${k}} = [\,i\,]`; },
    () => r`e^{x} = 1 + \frac{x}{1} + \frac{x^{2}}{1 \cdot 2} + \frac{x^{3}}{1 \cdot 2 \cdot 3} + \&c.`,
    () => r`\log(1+x) = x - \frac{x^{2}}{2} + \frac{x^{3}}{3} - \frac{x^{4}}{4} + \&c.`,
    () => r`\sqrt{1+x} = 1 + \frac{x}{2} - \frac{x^{2}}{8} + \frac{x^{3}}{16} - \&c.`,
    (rng) => { const a = rng.int(1, 9), b = rng.int(2, 9), c = rng.int(1, 9), d = rng.int(2, 9); return r`\frac{${a}}{${b}} \times \frac{${c}}{${d}} = \frac{${a * c}}{${b * d}}`; },
    () => r`\frac{\Pi m}{\Pi (m-r-s)} = \frac{\Pi m}{\Pi (m-r)} \cdot \frac{\Pi (m-r)}{\Pi (m-r-s)}`,
    (rng) => r`(1+x)^{\frac{m}{n}} = 1 + \frac{m}{n}x + \frac{m(m-n)}{n \cdot 2n}x^{2} + \&c.`,
    (rng) => { const n = rng.int(2, 4); return r`[\,${n}m\,]^{i} = [i] \left(1 + x\right)^{\frac{i}{${n}}}`; },
];
const TREATISE_TOPIC_PAIRS = [["sequences", "easy"], ["combinatorics", "medium"], ["analysis", "hard"], ["algebra", "easy"]];

const TREATISE_HEADS = [
    "of the Binomial Theorem.", "of Infinite Series.", "of the Method of Increments.",
    "of the Doctrine of Chances.", "of the Summation of Series.", "of the Quadrature of Curves.",
    "de Seriebus Infinitis.", "de Methodo Fluxionum.", "de Fractionibus Continuis.",
];
const TREATISE_CATCH = { latin: ["rus", "quo", "fit", "ergo", "unde", "tio", "quam", "cum", "se-", "ita"], english: ["where-", "there-", "shew-", "quan-", "expo-", "the", "which", "frac-", "rea-"] };
const TREATISE_LEADINS = {
    latin: ["Unde fit", "Quibus positis, sequitur", "Hinc colligimus", "Ergo habebimus", "Simili modo obtinemus", "Nanciscimur itaque", "Hinc radicem extrahendo fit"],
    english: ["Whence it appeareth that", "From whence we obtain", "Wherefore it followeth that", "In like manner we find", "And so we shall have", "By extraction of the root there ariseth"],
};

function treatiseInline(rng) {
    const gens = [
        () => r`\left[\frac{${rng.pick(["i", "m", "n", "r"])}}{${rng.int(2, 5)}}\right]`,
        () => r`(1+${rng.pick(["x", "z"])})^{${rng.pick(["n", "m", "i", r`\frac{m}{n}`, r`\frac{i}{2}`])}}`,
        () => r`\frac{${rng.pick(["m", "n", "i", "1", "r"])}}{${rng.pick(["2", "3", "n", "2n", "m"])}}`,
        () => `[${rng.pick(["m", "n", "m+r"])}]^{${rng.pick(["r", "s", "r+s", "-r", "i"])}}`,
        () => `${rng.pick(["x", "z", "v"])}^{${rng.int(2, 6)}}`,
        () => rng.pick(["n", "m", "i", "x", "s", "r", "z"]),
        () => r`\frac{1}{1+${rng.pick(["x", "z", "2x"])}}`,
        () => r`\sqrt{1+${rng.pick(["x", "z"])}}`,
        () => `${rng.int(2, 9)}m ${rng.bool() ? "+" : "-"} ${rng.int(1, 9)}`,
    ];
    return rng.pick(gens)();
}

// A treatise sentence: Latin or archaic-English voice, long-ſ applied to the
// TEXT runs only (math is never touched). ctx counts the inline formulas.
function treatiseSentence(ctx, latin, used, seenInline) {
    const rng = ctx.rng;
    const inl = () => {
        for (let attempt = 0; attempt < 10; attempt++) {
            const latex = treatiseInline(rng);
            if (!rendersClean(latex, false)) { rejected += 1; continue; }
            // Avoid the same inline formula echoing across neighbouring lines.
            if (seenInline && seenInline.has(latex) && attempt < 7) { continue; }
            if (seenInline) { seenInline.add(latex); }
            ctx.nFormulas += 1;
            return M(latex);
        }
        ctx.nFormulas += 1;
        return M("x");
    };
    const L = (s) => T(longS(s));
    const latinT = [
        () => [L("Sit "), inl(), L(" quantitas quaevis data, et ponatur "), inl(), L(".")],
        () => [L("Quibus positis, series in infinitum produci potest.")],
        () => [L("Si exponens "), inl(), L(" fuerit numerus integer et affirmativus, theorema semper verum est.")],
        () => [L("Unde patet summam seriei esse "), inl(), L(".")],
        () => [L("Simili modo si ponamus "), inl(), L(", altera formularum superiorum praebet "), inl(), L(".")],
        () => [L("Denotet "), inl(), L(" numerum terminorum, et sit "), inl(), L(" fractio quaecunque.")],
        () => [L("Evidens est hanc expressionem in omnibus casibus valere.")],
        () => [L("Superest igitur tantum, ut veritas quoque ostendatur pro casibus reliquis.")],
        () => [L("Hinc radicem quadratam extrahendo nanciscimur seriem quaesitam.")],
        () => [L("Jam tantum sumus consecuti, ut theorema etiam verum sit, si exponens fuerit hujusmodi fractio "), inl(), L(".")],
    ];
    const englishT = [
        () => [L("Let "), inl(), L(" be any quantity whatsoever, and let the exponent thereof be "), inl(), L(".")],
        () => [L("It is manifest that the series may be continued without end.")],
        () => [L("Whence it appeareth that the sum of the series is "), inl(), L(".")],
        () => [L("In like manner, if we suppose "), inl(), L(", the theorem is likewise true.")],
        () => [L("The same reasoning holdeth for every case which can be proposed.")],
        () => [L("And this expression agreeth with that which was before demonstrated.")],
        () => [L("Wherefore the rule delivereth the coefficients successively, as was to be shewn.")],
        () => [L("Now the fraction "), inl(), L(" being substituted, the series becometh "), inl(), L(".")],
    ];
    const bank = latin ? latinT : englishT;
    let idx = Math.floor(rng() * bank.length);
    if (used) {
        for (let tries = 0; tries < 6 && used.has(idx); tries++) { idx = Math.floor(rng() * bank.length); }
        used.add(idx);
    }
    return bank[idx]();
}

function treatiseDoc(ctx) {
    const rng = ctx.rng;
    // Latin-ish or archaic-English prose, seeded per doc; both use long ſ.
    const latin = rng.bool(0.55);
    const page = rng.int(3, 120);
    ctx.doc.title = null;
    ctx.doc.runhead = { left: "", center: longS(rng.pick(TREATISE_HEADS)), right: String(page) };
    let sec = rng.int(2, 30);
    const blocks = [];
    // Real treatise pages are FULL: 5-6 §-groups, several with a second display.
    const used = new Set(); // doc-level: don't repeat a sentence template
    const seenInline = new Set();
    const leadins = TREATISE_LEADINS[latin ? "latin" : "english"];
    const usedLead = new Set();
    const pickLead = () => {
        let l = rng.pick(leadins);
        for (let tries = 0; tries < 4 && usedLead.has(l); tries++) { l = rng.pick(leadins); }
        usedLead.add(l);
        return l;
    };
    const nGroups = rng.int(4, 5);
    for (let g = 0; g < nGroups; g++) {
        if (used.size >= 8) { used.clear(); }
        const parts = [];
        for (let s = 0, n = rng.int(2, 3); s < n; s++) { parts.push(treatiseSentence(ctx, latin, used, seenInline)); }
        blocks.push({ type: "leadp", lead: `§. ${sec}.`, strong: false, runs: joinSentences(parts) });
        blocks.push({ type: "p", runs: [T(longS(pickLead()))] });
        blocks.push(oldDisplay(ctx, TREATISE_DISPLAY, 0.6, TREATISE_TOPIC_PAIRS));
        if (rng.bool(0.35)) {
            blocks.push({ type: "p", runs: [T(longS(pickLead()))] });
            blocks.push(oldDisplay(ctx, TREATISE_DISPLAY, 0.6, TREATISE_TOPIC_PAIRS));
        }
        sec += 1;
    }
    while (ctx.nFormulas < 8) {
        blocks.push({ type: "p", runs: [T(longS(pickLead()))] });
        blocks.push(oldDisplay(ctx, TREATISE_DISPLAY, 0.6, TREATISE_TOPIC_PAIRS));
    }
    ctx.doc.sections.push({ heading: null, blocks });
    // CATCHWORD: first syllable of the (imaginary) next page's first word.
    ctx.doc.catchword = longS(rng.pick(TREATISE_CATCH[latin ? "latin" : "english"]));
}

// ---- letterpress1900: early-20th-century letterpress textbook ------------------
// Anchors: "Art. 3 ] EQUIVALENCE OF MATRICES 125" and "Art. 2 ] QUADRATIC
// FORMS 141" — running head with Art. N ] + caps title + page, loose uneven
// word spacing, big-paren integer matrices, "Example N :" small-caps lead-ins.
const LP_TITLES = [
    "EQUIVALENCE OF MATRICES", "QUADRATIC FORMS", "LINEAR SUBSTITUTIONS",
    "DETERMINANTS AND THEIR PROPERTIES", "SYSTEMS OF LINEAR EQUATIONS",
    "REDUCTION TO NORMAL FORM", "INVARIANT FACTORS", "BILINEAR FORMS",
    "ELEMENTARY TRANSFORMATIONS", "RANK AND SIGNATURE",
];

// Subscripted quadratic form with explicit signs, e.g. 2x_1x_2 - x_1x_3 + ...
function lpQuadForm(rng) {
    const v = rng.pick(["x", "y"]);
    const terms = [];
    for (let i = 1; i <= 3; i++) {
        for (let j = i + 1; j <= 4; j++) {
            if (!rng.bool(0.75)) { continue; }
            const c = rng.int(1, 8);
            const coef = c === 1 ? "" : String(c);
            terms.push({ sign: rng.bool(0.3) ? "-" : "+", body: `${coef}${v}_{${i}}${v}_{${j}}` });
        }
    }
    if (terms.length < 3) { return r`Q = 2${v}_{1}${v}_{2} - ${v}_{1}${v}_{3} + 6${v}_{1}${v}_{4} + ${v}_{2}${v}_{4}`; }
    const s = terms.map((t, i) => (i === 0 ? `${t.sign === "-" ? "-" : ""}${t.body}` : ` ${t.sign} ${t.body}`)).join("");
    return `Q = ${s}`;
}

function lpMatrix(rng) {
    const n = rng.pick([3, 4]);
    const rows = Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(1, 12) * 2).join(" & ")).join(r` \\ `);
    return r`A = \begin{pmatrix} ${rows} \end{pmatrix}`;
}

const LP_DISPLAY = [
    lpMatrix,
    lpQuadForm,
    () => r`b_{ik} = p\,b_{11} + c, \qquad c \ne 0, \qquad cN < b_{11}N`,
    () => r`x_{1} = y_{1}, \quad x_{2} = y_{1} + y_{2}, \quad x_{3} = y_{3}, \quad x_{4} = y_{4}`,
    () => r`C = \begin{pmatrix} e_{1} & O \\ O & C_{1} \end{pmatrix}`,
    () => r`D = \begin{pmatrix} e_{1} & & \\ & e_{2} & \\ & & D_{2} \end{pmatrix}`,
    (rng) => { const a = rng.int(2, 9); return r`u_{1} = \sqrt{${a}}\,z_{1} = \frac{\sqrt{${a}}}{${rng.int(2, 12)}} \left( ${rng.int(2, 6)}x_{1} + ${rng.int(2, 6)}x_{2} - ${rng.int(2, 6)}x_{3} \right)`; },
    () => r`D_{1} = \begin{pmatrix} e_{2} & 0 \\ 0 & D_{2} \end{pmatrix}`,
];
const LP_TOPIC_PAIRS = [["linear-algebra", "medium"], ["linear-algebra", "hard"], ["algebra", "medium"], ["calculus", "medium"]];

// Worked-example task text, paired with the KIND of formula shown under it so
// the lead-in never announces a matrix above a quadratic form (or vice versa).
const LP_EXAMPLE_TASKS = {
    matrix: [
        "To find the normal form of the matrix :",
        "To find the highest common factor of the elements of the matrix :",
        "To find the rank of the matrix :",
    ],
    form: [
        "To reduce the following quadratic form to a sum of squares :",
        "To determine the rank and signature of the form given below :",
    ],
};

// Period prose evoking the anchor pages (row/column operations, h.c.f., rank).
// `used` (doc-level Set) prevents the same template echoing across paragraphs.
function lpSentence(ctx, used) {
    const rng = ctx.rng;
    const inl = (latex) => { ctx.nFormulas += 1; return M(latex); };
    const templates = [
        () => [T("In fact, if "), inl(`b_{ik}`), T(" be not divisible by "), inl(`b_{11}`), T(", then a remainder "), inl("c"), T(" arises, where "), inl(r`c \ne 0`), T(".")],
        () => [T("Now, by adding the "), inl("i"), T("th row to the first row, and then adding "), inl("(-p)"), T(" times the first column to the "), inl("k"), T("th column, one obtains the element in the required position.")],
        () => [T("It can then be brought to the "), inl("(1,1)"), T("-position by an interchange of columns.")],
        () => [T("The h.c.f. of the elements in "), inl("A"), T(" remains unaltered by the row and column operations that have been applied.")],
        () => [T("By continuing this process, one obtains, in a finite number of steps, the diagonal matrix "), inl("S"), T(" with the required properties.")],
        () => [T("Next, by applying suitable row and column operations, without affecting the first row and the first column, the sub-matrix "), inl(`C_{1}`), T(" may be reduced to a simpler form.")],
        () => [T("The rank of the quadratic form is therefore "), inl(String(rng.int(2, 4))), T(", and its signature is "), inl(`${rng.int(2, 4)} - ${rng.int(0, 2)}`), T(".")],
        () => [T("To introduce a square term, a transformation of the variables is applied ; and the quadratic form is transformed accordingly.")],
        () => [T("The given form does not contain any square term, and the substitution must first supply one.")],
        () => [T("The reduction proceeds column by column, each step leaving the earlier rows undisturbed.")],
    ];
    let idx = Math.floor(rng() * templates.length);
    if (used) {
        for (let tries = 0; tries < 6 && used.has(idx); tries++) { idx = Math.floor(rng() * templates.length); }
        if (used.size >= templates.length - 2) { used.clear(); }
        used.add(idx);
    }
    return templates[idx]();
}

// Lead-in sentence that sits directly before a display (ends open, like the
// anchors' "may be transformed to one, say").
const LP_LEADINS = [
    "In this way the matrix B may be transformed to one, say",
    "The process then stands",
    "And then by sweeping out the first row and the first column, one obtains :",
    "The quadratic form is then transformed into",
];

function letterpressDoc(ctx) {
    const rng = ctx.rng;
    ctx.doc.title = null;
    ctx.doc.runhead = { left: `Art. ${rng.int(1, 9)} ]`, center: rng.pick(LP_TITLES), right: String(rng.int(90, 350)) };
    const blocks = [];
    // Dense full pages like the anchors: 5 prose+display groups, then the
    // worked examples.
    const used = new Set();
    const nGroups = rng.int(5, 7);
    for (let g = 0; g < nGroups; g++) {
        const parts = [];
        for (let s = 0, n = rng.int(2, 4); s < n; s++) { parts.push(rng.bool(0.75) ? lpSentence(ctx, used) : sentence(rng, tierFor(rng, ctx.docTier))); }
        if (rng.bool(0.55)) { parts.push([T(rng.pick(LP_LEADINS))]); }
        blocks.push({ type: "p", runs: joinSentences(parts) });
        blocks.push(oldDisplay(ctx, LP_DISPLAY, 0.6, LP_TOPIC_PAIRS));
        if (rng.bool(0.45)) {
            const w = whereClause(rng, tierFor(rng, ctx.docTier));
            ctx.nFormulas += w.runs.filter((x) => x.t === "math").length;
            blocks.push(w);
        }
    }
    // "EXAMPLE N :" worked-example lead-ins (small-caps in render, bold in gold).
    const nEx = rng.int(1, 2);
    for (let e = 1; e <= nEx; e++) {
        const kind = rng.bool(0.6) ? "matrix" : "form";
        blocks.push({ type: "leadp", lead: `Example ${e} :`, strong: true, runs: [T(rng.pick(LP_EXAMPLE_TASKS[kind]))] });
        const gen = kind === "matrix" ? lpMatrix : lpQuadForm;
        blocks.push(customDisplayBlock(ctx, validCustom(ctx, [gen]) || gen(rng)));
        if (rng.bool(0.6)) { blocks.push({ type: "p", runs: joinSentences([lpSentence(ctx, used), lpSentence(ctx, used)]) }); }
    }
    while (ctx.nFormulas < 13) { blocks.push(oldDisplay(ctx, LP_DISPLAY, 0.6, LP_TOPIC_PAIRS)); }
    ctx.doc.sections.push({ heading: null, blocks });
}

// ---- midcentury: 1950s Western textbook ----------------------------------------
// Anchors: "50 Basic Material from Linear Algebra", "n-Dimensional Vector
// Space 27", "186 Proper Numbers and Proper Vectors of a Matrix" — italic
// running head + page, justified em-indent text, italic theorem/definition
// lead-ins, BRACKETED matrices, right-aligned equation numbers "(12)".
const MC_TITLES = [
    "Basic Material from Linear Algebra", "n-Dimensional Vector Space",
    "Proper Numbers and Proper Vectors of a Matrix", "Linear Transformations and Their Matrices",
    "The Jordan Canonical Form", "Orthogonal Systems of Vectors",
    "Quadratic Forms and Their Reduction", "The Characteristic Polynomial",
];

function mcCanonicalBox(rng) {
    const l = rng.pick([r`\lambda_{i}`, r`\lambda_{1}`, r`\lambda`]);
    return r`\begin{bmatrix} ${l} & 0 & 0 & \dots & 0 \\ 1 & ${l} & 0 & \dots & 0 \\ 0 & 1 & ${l} & \dots & 0 \\ 0 & 0 & 0 & \dots & ${l} \end{bmatrix}`;
}

const MC_DISPLAY = [
    mcCanonicalBox,
    (rng) => { const rows = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => rng.int(-4, 8)).join(" & ")).join(r` \\ `); return r`A = \begin{bmatrix} ${rows} \end{bmatrix}`; },
    () => r`X = x_{1}e_{1} + x_{2}e_{2} + \cdots + x_{n}e_{n}`,
    () => r`X = \xi_{1}U_{1} + \xi_{2}U_{2} + \cdots + \xi_{n}U_{n}`,
    () => r`\xi_{1} - \xi_{1}' = 0, \; \dots, \; \xi_{n} - \xi_{n}' = 0`,
    (rng) => r`\frac{1}{uu'} = 1 + \sum_{r=1}^{${rng.int(3, 5)}} \frac{P_{r}P_{r}'}{(\lambda_{r} - \lambda)^{2}}`,
    (rng) => r`f'(\lambda) = 1 + \sum_{r=1}^{${rng.int(3, 5)}} \frac{P_{r}P_{r}'}{(\lambda_{r} - \lambda)^{2}}`,
    () => r`(\xi_{1} - \xi_{1}')U_{1} + \cdots + (\xi_{n} - \xi_{n}')U_{n} = 0`,
];
const MC_TOPIC_PAIRS = [["linear-algebra", "medium"], ["linear-algebra", "hard"], ["analysis", "hard"], ["probability", "medium"]];

function mcSentence(ctx, used) {
    const rng = ctx.rng;
    const inl = (latex) => { ctx.nFormulas += 1; return M(latex); };
    const templates = [
        () => [T("This we shall call the "), T("initial basis"), T(" of the space; such a basis is not the only one possible — quite the contrary.")],
        () => [T("The number of vectors forming a basis does not depend on its selection.")],
        () => [T("The coefficients of this resolution uniquely define the vector "), inl("X"), T(", for if two resolutions existed their difference would vanish identically.")],
        () => [T("In view of the linear independence of the vectors "), inl(r`U_{1}, \dots, U_{n}`), T(", the coefficients coincide.")],
        () => [T("On its principal diagonal the single number "), inl(r`\lambda_{i}`), T(" is everywhere to be found; directly under the diagonal are disposed elements that are all units.")],
        () => [T("A canonical box cannot be simplified by utilizing a similarity transformation.")],
        () => [T("It may be easily verified that a canonical box has only one proper vector.")],
        () => [T("Thus we will satisfy the normality condition with the choice made above.")],
        () => [T("Without sacrificing the generality, we may consider that "), inl(r`u = \pm u'`), T(", choosing the sign so that the expression will be positive.")],
    ];
    let idx = Math.floor(rng() * templates.length);
    if (used) {
        for (let tries = 0; tries < 6 && used.has(idx); tries++) { idx = Math.floor(rng() * templates.length); }
        if (used.size >= templates.length - 2) { used.clear(); }
        used.add(idx);
    }
    return templates[idx]();
}

function midcenturyDoc(ctx) {
    const rng = ctx.rng;
    ctx.doc.title = null;
    const page = rng.int(15, 320);
    const title = rng.pick(MC_TITLES);
    // Verso layout (page left) or recto layout (page right), like the anchors.
    ctx.doc.runhead = rng.bool(0.5)
        ? { left: String(page), center: title, right: "" }
        : { left: "", center: title, right: String(page) };
    const blocks = [];
    // Full pages like the anchors: 3-4 groups of prose / env / display.
    const nGroups = rng.int(3, 4);
    // Monotonic "chapter.n" env labels (a real page never shows 3.1 then 2.2).
    const chap = rng.int(1, 8);
    let envNum = rng.int(1, 4);
    const used = new Set();
    const usedLead = new Set();
    const pickLead = () => {
        let idx = Math.floor(rng() * LEADINS.length);
        for (let tries = 0; tries < 5 && usedLead.has(idx); tries++) { idx = Math.floor(rng() * LEADINS.length); }
        usedLead.add(idx);
        return LEADINS[idx];
    };
    for (let g = 0; g < nGroups; g++) {
        const parts = [];
        for (let s = 0, n = rng.int(3, 4); s < n; s++) { parts.push(rng.bool(0.55) ? mcSentence(ctx, used) : sentence(rng, tierFor(rng, ctx.docTier))); }
        blocks.push({ type: "p", runs: joinSentences(parts) });
        if (rng.bool(0.6)) {
            // Italic "Theorem 4.2." / "Definition 3.1." lead-in (env block; the
            // substyle CSS sets the head italic).
            const kind = rng.pick(["Theorem", "Definition", "Lemma"]);
            const p = joinSentences([rng.bool(0.5) ? mcSentence(ctx, used) : sentence(rng, tierFor(rng, ctx.docTier))]);
            blocks.push({ type: "env", kind, label: `${chap}.${envNum}`, runs: p, display: rng.bool(0.6) ? oldDisplay(ctx, MC_DISPLAY, 0.45, MC_TOPIC_PAIRS) : null });
            envNum += 1;
        }
        blocks.push({ type: "p", runs: [T(rng2colon(rng, pickLead()))] });
        blocks.push(oldDisplay(ctx, MC_DISPLAY, 0.45, MC_TOPIC_PAIRS));
        if (rng.bool(0.4)) {
            const w = whereClause(rng, tierFor(rng, ctx.docTier));
            ctx.nFormulas += w.runs.filter((x) => x.t === "math").length;
            blocks.push(w);
        }
    }
    while (ctx.nFormulas < 9) {
        blocks.push({ type: "p", runs: [T(rng2colon(rng, pickLead()))] });
        blocks.push(oldDisplay(ctx, MC_DISPLAY, 0.45, MC_TOPIC_PAIRS));
    }
    ctx.doc.sections.push({ heading: null, blocks });
}

// ---- entry point ----------------------------------------------------------------
export function buildMathDoc(rng, opts = {}) {
    const docTier = opts.tier || pickDocTier(rng);
    const style = opts.style || pickStyle(rng);
    const doc = {
        style: style.key,
        tier: docTier,
        title: "",
        kicker: null,
        byline: null,
        meta: null,
        abstract: null,
        instructions: null,
        sections: [],
        ncols: style.cols(rng, docTier),
        numberEqs: style.numberEqs,
    };
    const ctx = { rng, doc, docTier, style, eq: { n: 0 }, envCount: 0, nFormulas: 0, seen: new Set() };
    ({ textbook: textbookDoc, paper: paperDoc, lecture: lectureDoc, exam: examDoc, handbook: handbookDoc, treatise18: treatiseDoc, letterpress1900: letterpressDoc, midcentury: midcenturyDoc })[style.key](ctx);
    // Keep the total number of formulas in the 6-20 band: pad a thin doc with an
    // extra beat in the last prose-y section, and that's as far as we force it
    // (docs land in-band by construction almost always). Old-book builders pad
    // themselves in their own voice.
    while (ctx.nFormulas < 6) {
        const sec = doc.sections[doc.sections.length - 1];
        if (style.key === "exam" || style.key === "handbook" || style.oldBook) { break; }
        sec.blocks.push(...beat(ctx, { para: false }));
    }
    doc.nFormulas = ctx.nFormulas;
    return doc;
}
