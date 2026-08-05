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
    ({ textbook: textbookDoc, paper: paperDoc, lecture: lectureDoc, exam: examDoc, handbook: handbookDoc })[style.key](ctx);
    // Keep the total number of formulas in the 6-20 band: pad a thin doc with an
    // extra beat in the last prose-y section, and that's as far as we force it
    // (docs land in-band by construction almost always).
    while (ctx.nFormulas < 6) {
        const sec = doc.sections[doc.sections.length - 1];
        if (style.key === "exam" || style.key === "handbook") { break; }
        sec.blocks.push(...beat(ctx, { para: false }));
    }
    doc.nFormulas = ctx.nFormulas;
    return doc;
}
