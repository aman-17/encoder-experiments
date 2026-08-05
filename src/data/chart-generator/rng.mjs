// Seeded deterministic RNG (mulberry32) + sampling helpers.
// Seeding makes a whole dataset reproducible from a single --seed.

export function makeRng(seed) {
    let s = seed >>> 0;
    const rng = () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
    rng.float = (min, max, digits = 2) => Number((rng() * (max - min) + min).toFixed(digits));
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.bool = (p = 0.5) => rng() < p;
    rng.shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    // weighted pick: pairs is [[value, weight], ...]
    rng.weighted = (pairs) => {
        const total = pairs.reduce((acc, [, w]) => acc + w, 0);
        let r = rng() * total;
        for (const [v, w] of pairs) {
            r -= w;
            if (r <= 0) {
                return v;
            }
        }
        return pairs[pairs.length - 1][0];
    };
    return rng;
}
