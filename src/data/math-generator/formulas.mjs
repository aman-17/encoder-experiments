// Procedural LaTeX formula bank at three difficulty tiers. Every generator is
// deterministic from the rng and returns { latex, topic, wide }. `wide` marks
// formulas (long aligned derivations, big matrices) that should span all
// columns in a multi-column layout. NO LLM anywhere.
//
// The LaTeX strings here ARE the ground truth (the gold markdown embeds them
// verbatim), so generators must emit exactly what should be recovered.

const r = String.raw;

const VARS = ["x", "y", "z", "t", "u", "v", "w", "s"];
const IDX = ["i", "j", "k", "m"];
const GREEK = [r`\alpha`, r`\beta`, r`\gamma`, r`\lambda`, r`\mu`, r`\theta`, r`\sigma`, r`\omega`, r`\varepsilon`, r`\rho`, r`\kappa`, r`\delta`];
const FUNCS = ["f", "g", "h", "F", "G", r`\varphi`, r`\psi`];

const pickVar = (rng) => rng.pick(VARS);
const pickFn = (rng) => rng.pick(FUNCS);
const pickGreek = (rng) => rng.pick(GREEK);

// ---------------------------------------------------------------------------
// EASY: fractions, powers/subscripts, simple sums, quadratics, basic trig.
// ---------------------------------------------------------------------------
const EASY = [
    // fraction arithmetic (numerically correct)
    { topic: "algebra", gen: (rng) => {
        const a = rng.int(1, 9), b = rng.int(2, 9), c = rng.int(1, 9), d = rng.int(2, 9);
        return r`\frac{${a}}{${b}} + \frac{${c}}{${d}} = \frac{${a * d + c * b}}{${b * d}}`;
    } },
    { topic: "algebra", gen: (rng) => {
        const v = pickVar(rng), a = rng.int(2, 9), b = rng.int(2, 9);
        return r`${v} = \frac{${a}${v === "a" ? "b" : "a"} + ${b}}{${rng.int(2, 7)}}`;
    } },
    // exponent laws (correct)
    { topic: "algebra", gen: (rng) => {
        const v = pickVar(rng), a = rng.int(2, 6), b = rng.int(2, 6);
        return rng.pick([
            r`${v}^{${a}} \cdot ${v}^{${b}} = ${v}^{${a + b}}`,
            r`\left(${v}^{${a}}\right)^{${b}} = ${v}^{${a * b}}`,
            r`\frac{${v}^{${a + b}}}{${v}^{${b}}} = ${v}^{${a}}`,
        ]);
    } },
    // subscripted sequences
    { topic: "sequences", gen: (rng) => {
        const d = rng.int(2, 9), a = rng.int(1, 9);
        return rng.pick([
            r`a_{n+1} = a_n + ${d}, \qquad a_1 = ${a}`,
            r`a_n = a_1 + (n-1)d`,
            r`b_{n+1} = ${d}\,b_n, \qquad b_0 = ${a}`,
        ]);
    } },
    // simple summations
    { topic: "sequences", gen: (rng) => rng.pick([
        r`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`,
        r`\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}`,
        r`\sum_{k=1}^{n} k^3 = \left( \frac{n(n+1)}{2} \right)^2`,
        r`\sum_{k=0}^{n} r^k = \frac{1 - r^{n+1}}{1 - r}`,
        r`\sum_{i=1}^{n} (2i - 1) = n^2`,
    ]) },
    // quadratic-style equations
    { topic: "algebra", gen: (rng) => {
        const a = rng.int(1, 5), b = rng.int(2, 12), c = rng.int(1, 9);
        return rng.pick([
            r`${a === 1 ? "" : a}x^2 ${rng.bool() ? "+" : "-"} ${b}x + ${c} = 0`,
            r`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
            r`x^2 - ${b}x + ${c} = (x - r_1)(x - r_2)`,
        ]);
    } },
    // basic trig identities
    { topic: "trig", gen: (rng) => rng.pick([
        r`\sin^2\theta + \cos^2\theta = 1`,
        r`\tan\theta = \frac{\sin\theta}{\cos\theta}`,
        r`\cos 2\theta = 1 - 2\sin^2\theta`,
        r`\sin 2\theta = 2\sin\theta\cos\theta`,
        r`1 + \tan^2\theta = \sec^2\theta`,
        r`\sin(\alpha + \beta) = \sin\alpha\cos\beta + \cos\alpha\sin\beta`,
        r`\cos(\alpha - \beta) = \cos\alpha\cos\beta + \sin\alpha\sin\beta`,
    ]) },
    // geometry / physics one-liners
    { topic: "geometry", gen: (rng) => rng.pick([
        r`A = \pi r^2`,
        r`V = \frac{4}{3}\pi r^3`,
        r`c^2 = a^2 + b^2`,
        r`A = \frac{1}{2}bh`,
        r`s = \frac{a + b + c}{2}`,
        r`d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}`,
    ]) },
    // lines & logs
    { topic: "algebra", gen: (rng) => {
        const m = rng.int(2, 9), b = rng.int(1, 9);
        return rng.pick([
            r`y = ${m}x + ${b}`,
            r`\log(ab) = \log a + \log b`,
            r`\ln e^{x} = x`,
            r`\log_{${rng.int(2, 5)}} ${rng.int(2, 5)}^{n} = n`,
            r`y - y_1 = m(x - x_1)`,
        ]);
    } },
];

// ---------------------------------------------------------------------------
// MEDIUM: definite integrals, partials, limits, binomials, 2x2 matrices,
// short aligned equations, expectation/variance.
// ---------------------------------------------------------------------------
const MEDIUM = [
    // definite integrals (correct)
    { topic: "calculus", gen: (rng) => {
        const n = rng.int(2, 6), a = rng.int(2, 5);
        return rng.pick([
            r`\int_{0}^{1} x^{${n}} \, dx = \frac{1}{${n + 1}}`,
            r`\int_{a}^{b} f(x)\,dx = F(b) - F(a)`,
            r`\int_{0}^{\pi} \sin x \, dx = 2`,
            r`\int e^{${a}x} \, dx = \frac{1}{${a}} e^{${a}x} + C`,
            r`\int \frac{dx}{x} = \ln |x| + C`,
            r`\int_{0}^{\infty} e^{-${a}t} \, dt = \frac{1}{${a}}`,
        ]);
    } },
    // partial derivatives (correct symbolic pairs)
    { topic: "calculus", gen: (rng) => {
        const k = rng.pick([r`\alpha`, "k", "D"]);
        return rng.pick([
            r`\frac{\partial u}{\partial t} = ${k} \, \frac{\partial^2 u}{\partial x^2}`,
            r`\frac{\partial^2 u}{\partial t^2} = c^2 \, \frac{\partial^2 u}{\partial x^2}`,
            r`f(x, y) = x^2 y + x y^2, \qquad \frac{\partial f}{\partial x} = 2xy + y^2`,
            r`\frac{\partial}{\partial y}\left( x^3 y^2 \right) = 2 x^3 y`,
            r`\nabla f = \left( \frac{\partial f}{\partial x}, \; \frac{\partial f}{\partial y} \right)`,
        ]);
    } },
    // limits
    { topic: "calculus", gen: (rng) => {
        const a = rng.int(2, 7), c = rng.int(2, 7);
        return rng.pick([
            r`\lim_{x \to 0} \frac{\sin x}{x} = 1`,
            r`\lim_{n \to \infty} \left( 1 + \frac{1}{n} \right)^{n} = e`,
            r`\lim_{x \to \infty} \frac{${a}x^2 + 1}{${c}x^2 - ${rng.int(1, 9)}} = \frac{${a}}{${c}}`,
            r`\lim_{h \to 0} \frac{f(x+h) - f(x)}{h} = f'(x)`,
            r`\lim_{x \to 0^{+}} x \ln x = 0`,
        ]);
    } },
    // binomial / combinatorial
    { topic: "combinatorics", gen: (rng) => rng.pick([
        r`\binom{n}{k} = \frac{n!}{k! \, (n-k)!}`,
        r`(x + y)^n = \sum_{k=0}^{n} \binom{n}{k} x^{n-k} y^{k}`,
        r`\binom{n}{k} + \binom{n}{k+1} = \binom{n+1}{k+1}`,
        r`\sum_{k=0}^{n} \binom{n}{k} = 2^n`,
        r`P(n, k) = \frac{n!}{(n-k)!}`,
    ]) },
    // 2x2 matrices (det computed correctly)
    { topic: "linear-algebra", gen: (rng) => {
        const a = rng.int(1, 9), b = rng.int(1, 9), c = rng.int(1, 9), d = rng.int(1, 9);
        // coefficient formatter: never emit a literal "1x"
        const cf = (n) => (n === 1 ? "" : String(n));
        return rng.pick([
            r`A = \begin{pmatrix} ${a} & ${b} \\ ${c} & ${d} \end{pmatrix}, \qquad \det A = ${a * d - b * c}`,
            r`A^{-1} = \frac{1}{ad - bc} \begin{pmatrix} d & -b \\ -c & a \end{pmatrix}`,
            r`\begin{pmatrix} ${a} & ${b} \\ ${c} & ${d} \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} ${cf(a)}x + ${cf(b)}y \\ ${cf(c)}x + ${cf(d)}y \end{pmatrix}`,
        ]);
    } },
    // short aligned expansion (numerically correct)
    { topic: "algebra", wide: true, gen: (rng) => {
        const a = rng.int(2, 9);
        return rng.pick([
            r`\begin{aligned} (x + ${a})^2 &= x^2 + 2 \cdot ${a} x + ${a}^2 \\ &= x^2 + ${2 * a}x + ${a * a} \end{aligned}`,
            r`\begin{aligned} (x + ${a})(x - ${a}) &= x^2 - ${a}x + ${a}x - ${a * a} \\ &= x^2 - ${a * a} \end{aligned}`,
        ]);
    } },
    // expectation / variance / probability
    { topic: "probability", gen: (rng) => rng.pick([
        r`\mathbb{E}[X] = \sum_{i} x_i \, p_i`,
        r`\operatorname{Var}(X) = \mathbb{E}[X^2] - \left( \mathbb{E}[X] \right)^2`,
        r`P(A \mid B) = \frac{P(B \mid A) \, P(A)}{P(B)}`,
        r`f(x) = \frac{1}{\sigma \sqrt{2\pi}} \exp\!\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)`,
        r`\operatorname{Cov}(X, Y) = \mathbb{E}[XY] - \mathbb{E}[X]\,\mathbb{E}[Y]`,
        r`\mathbb{E}[aX + b] = a\,\mathbb{E}[X] + b`,
    ]) },
    // derivative rules
    { topic: "calculus", gen: (rng) => rng.pick([
        r`(fg)' = f'g + fg'`,
        r`\left( \frac{f}{g} \right)' = \frac{f'g - fg'}{g^2}`,
        r`\frac{dy}{dx} = \frac{dy}{du} \cdot \frac{du}{dx}`,
        r`\frac{d}{dx} \sin x = \cos x, \qquad \frac{d}{dx} \cos x = -\sin x`,
        r`\frac{d}{dx} \ln x = \frac{1}{x}`,
    ]) },
];

// ---------------------------------------------------------------------------
// HARD: continued fractions, long aligned derivations, 3x3 matrices, cases,
// multiple integrals, nested big operators, tensors, series expansions.
// ---------------------------------------------------------------------------

// numerically correct 3x3 determinant via cofactor expansion
function det3(rng) {
    const m = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => rng.int(-4, 6)));
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const rows = m.map((row) => row.join(" & ")).join(r` \\ `);
    return r`\det A = \begin{vmatrix} ${rows} \end{vmatrix} = ${det}`;
}

function continuedFraction(rng) {
    if (rng.bool(0.4)) {
        return rng.pick([
            r`\sqrt{2} = 1 + \cfrac{1}{2 + \cfrac{1}{2 + \cfrac{1}{2 + \ddots}}}`,
            r`\varphi = 1 + \cfrac{1}{1 + \cfrac{1}{1 + \cfrac{1}{1 + \ddots}}}`,
            r`e = 2 + \cfrac{1}{1 + \cfrac{1}{2 + \cfrac{2}{3 + \cfrac{3}{4 + \ddots}}}}`,
        ]);
    }
    const depth = rng.int(3, 4);
    const a = Array.from({ length: depth + 1 }, () => rng.int(1, 7));
    let tail = rng.bool(0.5) ? r`\ddots` : String(a[depth]);
    for (let i = depth - 1; i >= 1; i--) {
        tail = r`${a[i]} + \cfrac{1}{${tail}}`;
    }
    return r`x = ${a[0]} + \cfrac{1}{${tail}}`;
}

// multi-line aligned derivations (3-6 steps), each internally consistent
function derivation(rng) {
    const a = rng.int(2, 6), b = rng.int(1, 9);
    const choices = [
        // variance expansion
        r`\begin{aligned} \operatorname{Var}(X) &= \mathbb{E}\left[ (X - \mu)^2 \right] \\ &= \mathbb{E}\left[ X^2 - 2\mu X + \mu^2 \right] \\ &= \mathbb{E}[X^2] - 2\mu \, \mathbb{E}[X] + \mu^2 \\ &= \mathbb{E}[X^2] - \mu^2 \end{aligned}`,
        // geometric series
        r`\begin{aligned} S_n &= a + ar + ar^2 + \cdots + ar^{n-1} \\ r S_n &= ar + ar^2 + \cdots + ar^{n} \\ S_n - r S_n &= a - a r^{n} \\ S_n &= \frac{a \left( 1 - r^{n} \right)}{1 - r} \end{aligned}`,
        // integration by parts on x e^x
        r`\begin{aligned} \int x e^{x} \, dx &= x e^{x} - \int e^{x} \, dx \\ &= x e^{x} - e^{x} + C \\ &= (x - 1) e^{x} + C \end{aligned}`,
        // completing the square (numerically correct)
        r`\begin{aligned} x^2 + ${2 * a}x + ${b} &= x^2 + ${2 * a}x + ${a * a} - ${a * a} + ${b} \\ &= (x + ${a})^2 ${a * a - b >= 0 ? "-" : "+"} ${Math.abs(a * a - b)} \end{aligned}`,
        // telescoping sum
        r`\begin{aligned} \sum_{k=1}^{n} \frac{1}{k(k+1)} &= \sum_{k=1}^{n} \left( \frac{1}{k} - \frac{1}{k+1} \right) \\ &= 1 - \frac{1}{n+1} \\ &= \frac{n}{n+1} \end{aligned}`,
        // Gaussian integral polar trick
        r`\begin{aligned} I^2 &= \int_{-\infty}^{\infty} \int_{-\infty}^{\infty} e^{-(x^2 + y^2)} \, dx \, dy \\ &= \int_{0}^{2\pi} \int_{0}^{\infty} e^{-r^2} \, r \, dr \, d\theta \\ &= 2\pi \cdot \frac{1}{2} \\ &= \pi \end{aligned}`,
        // derivative from first principles for x^2
        r`\begin{aligned} f'(x) &= \lim_{h \to 0} \frac{(x + h)^2 - x^2}{h} \\ &= \lim_{h \to 0} \frac{2xh + h^2}{h} \\ &= \lim_{h \to 0} \left( 2x + h \right) \\ &= 2x \end{aligned}`,
        // log-likelihood of a normal sample
        r`\begin{aligned} \ell(\mu, \sigma^2) &= \ln \prod_{i=1}^{n} \frac{1}{\sigma\sqrt{2\pi}} \exp\!\left( -\frac{(x_i - \mu)^2}{2\sigma^2} \right) \\ &= -\frac{n}{2} \ln (2\pi) - n \ln \sigma - \frac{1}{2\sigma^2} \sum_{i=1}^{n} (x_i - \mu)^2 \\ \frac{\partial \ell}{\partial \mu} &= \frac{1}{\sigma^2} \sum_{i=1}^{n} (x_i - \mu) = 0 \\ \hat{\mu} &= \frac{1}{n} \sum_{i=1}^{n} x_i \end{aligned}`,
    ];
    return rng.pick(choices);
}

const HARD = [
    { topic: "analysis", gen: continuedFraction },
    { topic: "analysis", wide: true, gen: derivation },
    // 3x3 matrices / determinants
    { topic: "linear-algebra", wide: true, gen: (rng) => rng.pick([
        det3(rng),
        r`J = \begin{pmatrix} \frac{\partial f_1}{\partial x} & \frac{\partial f_1}{\partial y} & \frac{\partial f_1}{\partial z} \\ \frac{\partial f_2}{\partial x} & \frac{\partial f_2}{\partial y} & \frac{\partial f_2}{\partial z} \\ \frac{\partial f_3}{\partial x} & \frac{\partial f_3}{\partial y} & \frac{\partial f_3}{\partial z} \end{pmatrix}`,
        r`\begin{vmatrix} a & b & c \\ d & e & f \\ g & h & i \end{vmatrix} = a(ei - fh) - b(di - fg) + c(dh - eg)`,
        r`R_{\theta} = \begin{pmatrix} \cos\theta & -\sin\theta & 0 \\ \sin\theta & \cos\theta & 0 \\ 0 & 0 & 1 \end{pmatrix}`,
    ]) },
    // cases environments
    { topic: "analysis", gen: (rng) => {
        const a = rng.int(2, 6), l = pickGreek(rng);
        return rng.pick([
            r`f(x) = \begin{cases} x^2, & x \ge 0 \\ -x, & x < 0 \end{cases}`,
            r`\operatorname{sgn}(x) = \begin{cases} 1, & x > 0 \\ 0, & x = 0 \\ -1, & x < 0 \end{cases}`,
            r`\delta_{ij} = \begin{cases} 1, & i = j \\ 0, & i \ne j \end{cases}`,
            r`f(x) = \begin{cases} ${l} e^{-${l} x}, & x \ge 0 \\ 0, & x < 0 \end{cases}`,
            r`u_n = \begin{cases} \dfrac{n}{2}, & n \equiv 0 \pmod 2 \\ ${a}n + 1, & n \equiv 1 \pmod 2 \end{cases}`,
        ]);
    } },
    // double/triple integrals & nested big operators with limits
    { topic: "calculus", gen: (rng) => rng.pick([
        r`V = \iiint_{V} r^2 \sin\theta \, dr \, d\theta \, d\phi`,
        r`\iint_{D} \left( x^2 + y^2 \right) dA = \int_{0}^{2\pi} \int_{0}^{R} r^3 \, dr \, d\theta = \frac{\pi R^4}{2}`,
        r`\int_{0}^{1} \int_{0}^{1-x} \int_{0}^{1-x-y} dz \, dy \, dx = \frac{1}{6}`,
        r`Q(x, y) = \sum_{i=1}^{n} \sum_{j=1}^{m} a_{ij} \, x_i \, y_j`,
        r`\prod_{k=1}^{n} \left( 1 - \frac{1}{k+1} \right) = \frac{1}{n+1}`,
        r`\sum_{i=1}^{n} \sum_{j=1}^{i} 1 = \frac{n(n+1)}{2}`,
        r`\oint_{\partial \Sigma} \mathbf{F} \cdot d\mathbf{r} = \iint_{\Sigma} \left( \nabla \times \mathbf{F} \right) \cdot d\mathbf{S}`,
    ]) },
    // tensor-ish sub/superscript chains
    { topic: "physics", wide: true, gen: (rng) => rng.pick([
        r`R^{\rho}{}_{\sigma\mu\nu} = \partial_{\mu} \Gamma^{\rho}{}_{\nu\sigma} - \partial_{\nu} \Gamma^{\rho}{}_{\mu\sigma} + \Gamma^{\rho}{}_{\mu\lambda} \Gamma^{\lambda}{}_{\nu\sigma} - \Gamma^{\rho}{}_{\nu\lambda} \Gamma^{\lambda}{}_{\mu\sigma}`,
        r`G_{\mu\nu} + \Lambda g_{\mu\nu} = \frac{8 \pi G}{c^4} T_{\mu\nu}`,
        r`\Gamma^{\lambda}{}_{\mu\nu} = \frac{1}{2} g^{\lambda\rho} \left( \partial_{\mu} g_{\nu\rho} + \partial_{\nu} g_{\mu\rho} - \partial_{\rho} g_{\mu\nu} \right)`,
        r`T'^{i}{}_{j} = \frac{\partial x'^{i}}{\partial x^{k}} \frac{\partial x^{l}}{\partial x'^{j}} \, T^{k}{}_{l}`,
        r`ds^2 = g_{\mu\nu} \, dx^{\mu} dx^{\nu}`,
        r`F^{\mu\nu} = \partial^{\mu} A^{\nu} - \partial^{\nu} A^{\mu}`,
    ]) },
    // series expansions
    { topic: "analysis", wide: true, gen: (rng) => rng.pick([
        r`e^{x} = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots`,
        r`f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!} (x - a)^n`,
        r`\sin x = x - \frac{x^3}{3!} + \frac{x^5}{5!} - \frac{x^7}{7!} + \cdots`,
        r`\zeta(s) = \sum_{n=1}^{\infty} \frac{1}{n^s} = \prod_{p \ \mathrm{prime}} \frac{1}{1 - p^{-s}}`,
        r`\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}`,
        r`f(x) = \frac{a_0}{2} + \sum_{n=1}^{\infty} \left( a_n \cos \frac{n \pi x}{L} + b_n \sin \frac{n \pi x}{L} \right)`,
        r`\ln(1 + x) = x - \frac{x^2}{2} + \frac{x^3}{3} - \cdots, \qquad |x| < 1`,
    ]) },
    // nested fractions (non-continued)
    { topic: "algebra", gen: (rng) => {
        const a = rng.int(2, 7), b = rng.int(2, 7);
        return rng.pick([
            r`R = \frac{1}{\dfrac{1}{R_1} + \dfrac{1}{R_2} + \dfrac{1}{R_3}}`,
            r`x = \frac{\dfrac{a}{b} + \dfrac{c}{d}}{\dfrac{a}{b} - \dfrac{c}{d}} = \frac{ad + bc}{ad - bc}`,
            r`k = \frac{${a} + \dfrac{1}{${b}}}{1 - \dfrac{1}{${a * b}}}`,
        ]);
    } },
];

// ---------------------------------------------------------------------------
// Inline formulas ($...$ inside prose) per tier — deliberately compact.
// ---------------------------------------------------------------------------
const INLINE = {
    easy: [
        (rng) => `${pickVar(rng)}_${rng.pick(IDX)}`,
        (rng) => r`n \ge ${rng.int(1, 3)}`,
        (rng) => pickGreek(rng),
        (rng) => `${pickFn(rng)}(${pickVar(rng)})`,
        (rng) => `${pickVar(rng)}^${rng.int(2, 4)}`,
        (rng) => `a_n`,
        (rng) => `[${rng.int(0, 1)}, ${rng.int(2, 9)}]`,
        (rng) => r`${rng.int(0, 2)} \le ${pickVar(rng)} \le ${rng.int(3, 9)}`,
        (rng) => `y = ${pickFn(rng)}(x)`,
        (rng) => r`\theta`,
        (rng) => r`\pi r^2`,
    ],
    medium: [
        (rng) => r`\mathbb{E}[X]`,
        (rng) => r`\sigma^2`,
        (rng) => r`O(n \log n)`,
        (rng) => r`\partial f / \partial ${pickVar(rng)}`,
        (rng) => r`\binom{n}{k}`,
        (rng) => r`\lim_{n \to \infty} a_n`,
        (rng) => r`\mathbb{R}^${rng.pick(["2", "3", "n"])}`,
        (rng) => r`A^{-1}`,
        (rng) => r`\det A \ne 0`,
        (rng) => r`X \sim \mathcal{N}(\mu, \sigma^2)`,
        (rng) => r`f \in C^{${rng.int(1, 2)}}`,
        (rng) => r`\int_a^b f`,
    ],
    hard: [
        (rng) => r`g_{\mu\nu}`,
        (rng) => r`\nabla^2 \phi`,
        (rng) => r`\mathcal{L}(\theta)`,
        (rng) => r`T^{ij}{}_{k}`,
        (rng) => r`\mathcal{O}(\varepsilon^2)`,
        (rng) => r`\hbar \omega`,
        (rng) => r`\sum_{i,j} a_{ij}`,
        (rng) => r`\Gamma^{\lambda}{}_{\mu\nu}`,
        (rng) => r`\delta_{ij}`,
        (rng) => r`x^{\mu}`,
        (rng) => r`\|x\|_2`,
        (rng) => r`\varepsilon > 0`,
    ],
};

const BANKS = { easy: EASY, medium: MEDIUM, hard: HARD };

// A display formula for the given tier. Returns { latex, topic, wide }.
// `topic` optionally restricts to bank entries of that topic (falls back to
// the whole tier bank when the topic has no entries in this tier).
export function displayFormula(rng, tier, topic) {
    let bank = BANKS[tier] || MEDIUM;
    if (topic) {
        const filtered = bank.filter((e) => e.topic === topic);
        if (filtered.length) {
            bank = filtered;
        }
    }
    const entry = rng.pick(bank);
    return { latex: entry.gen(rng), topic: entry.topic, wide: Boolean(entry.wide) };
}

// Topics available per tier (used by the handbook archetype to build groups).
export function tierTopics(tier) {
    const bank = BANKS[tier] || MEDIUM;
    return [...new Set(bank.map((e) => e.topic))];
}

// A compact inline formula for the given tier.
export function inlineFormula(rng, tier) {
    const bank = INLINE[tier] || INLINE.medium;
    return rng.pick(bank)(rng);
}

export const TIERS = ["easy", "medium", "hard"];
