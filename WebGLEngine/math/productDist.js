// math/productDist.js
//
// THE INSTRUMENT (v3056). v3055 built a Meijer G evaluator. An evaluator is not an instrument -- it computes a
// function, it does not MEASURE anything, and the lab's governing rule is that a readout without a checkable
// answer is decoration. This is the measurement it makes possible.
//
// If X_1..X_n are independent Gamma(a_i, 1), the product Y = X_1 * ... * X_n has an EXACT closed-form law, and
// that law is a Meijer G:
//
//     pdf:  f(y) = 1/PROD Gamma(a_i)  *  G^{n,0}_{0,n}  ( y |    ; a_1-1, ..., a_n-1 )
//     cdf:  F(y) = 1/PROD Gamma(a_i)  *  G^{n,1}_{1,n+1}( y | 1  ; a_1,   ..., a_n, 0 )
//
// So the instrument is: SAMPLE the product by Monte Carlo, and grade the samples against a law nobody tabulated.
// That is the wind-tunnel shape pointed at statistics -- the key is DERIVED, and the thing being measured
// (a distribution) is genuinely simulated rather than asserted.
//
// WHY THIS IS A REAL TEST AND NOT A DEMO. Three independent things must agree, and they are computed by
// completely different routes:
//   1. the MC samples          -- a gamma sampler and a product, no special functions anywhere
//   2. the pdf                 -- G^{n,0}_{0,n}, an m=n residue sum with no upper parameters
//   3. the cdf                 -- G^{n,1}_{1,n+1}, a DIFFERENT (m,n,p,q) with an upper parameter
// Plus exact moments, E[Y^k] = PROD Gamma(a_i+k)/Gamma(a_i), which involve no G at all. A bug in the residue
// sum would have to corrupt two different parameter families and the moments identically to survive.
//
// THE DEGENERACY CONSTRAINT IS INHERITED AND REAL: the pdf's b-list is (a_i - 1) and the cdf's is (a_i, 0), both
// with m = n, so the shapes must not differ by integers -- and for the cdf no a_i may be a non-negative integer
// either, since that collides with the trailing 0. This does not "usually work"; it refuses. Shapes like
// [1.3, 2.7] are fine, [1.5, 2.5] are not, and the caller is told which pair.
//
// Browser-safe: imports only math/meijerG.js.

import { meijerG, gamma } from "./meijerG.js";

/** Deterministic RNG, so a failing run is reproducible from its seed rather than "sometimes". */
export function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t = (t + 0x6D2B79F5) >>> 0;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function normal(rng) {
    // Box-Muller. Rejecting u=0 keeps the log finite.
    let u = 0; while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Marsaglia-Tsang gamma sampler, shape a > 0, scale 1. */
export function sampleGamma(a, rng) {
    if (a < 1) return sampleGamma(a + 1, rng) * Math.pow(rng(), 1 / a);   // Boost, Devroye
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
        let x, v;
        do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const u = rng();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
}

export function sampleProduct(shapes, rng) {
    let y = 1;
    for (const a of shapes) y *= sampleGamma(a, rng);
    return y;
}

/** Shapes that would make the G degenerate, named rather than approximated away. */
export function shapeProblems(shapes) {
    const bad = [];
    for (let i = 0; i < shapes.length; i++) {
        if (!(shapes[i] > 0)) bad.push("shape[" + i + "]=" + shapes[i] + " must be positive");
        // the cdf's b-list ends in 0, so an integer shape collides with it
        if (Number.isInteger(shapes[i])) bad.push("shape[" + i + "]=" + shapes[i] + " is an integer, which collides with the trailing 0 in the cdf's b-list");
        for (let j = i + 1; j < shapes.length; j++) {
            const d = shapes[j] - shapes[i];
            if (Math.abs(d - Math.round(d)) < 1e-12) bad.push("shapes " + i + " and " + j + " (" + shapes[i] + ", " + shapes[j] + ") differ by the integer " + Math.round(d) + ", so the poles collide");
        }
    }
    return bad;
}

const norm = (shapes) => { let d = 1; for (const a of shapes) d *= gamma(a); return 1 / d; };

/** Exact pdf of the product. Returns { ok, value, reliable, cancellation, reason }. */
export function productPdf(y, shapes) {
    const bad = shapeProblems(shapes);
    if (bad.length) return { ok: false, reason: bad[0] };
    const r = meijerG({ m: shapes.length, n: 0, a: [], b: shapes.map((a) => a - 1), z: y });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, value: norm(shapes) * r.value, reliable: r.reliable, cancellation: r.cancellation };
}

/** Exact cdf of the product -- a DIFFERENT G family, which is what makes the pdf/cdf agreement a real check. */
export function productCdf(y, shapes) {
    const bad = shapeProblems(shapes);
    if (bad.length) return { ok: false, reason: bad[0] };
    const r = meijerG({ m: shapes.length, n: 1, a: [1], b: shapes.concat([0]), z: y });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, value: norm(shapes) * r.value, reliable: r.reliable, cancellation: r.cancellation };
}

/** Exact k-th moment: E[Y^k] = PROD Gamma(a_i + k) / Gamma(a_i). No G involved -- an independent witness. */
export function exactMoment(shapes, k) {
    let m = 1;
    for (const a of shapes) m *= gamma(a + k) / gamma(a);
    return m;
}

/**
 * Kolmogorov-Smirnov against the exact cdf. Returns { D, n, pValue, critical95, reject, evaluated, refused }.
 *
 * The p-value is the asymptotic Kolmogorov limit, which is what makes this a TEST rather than a look at a
 * picture: D alone always shrinks with n and always looks small, so quoting D without its null distribution is
 * the statistical version of a control that cannot fail.
 *
 * Points where the cdf is unreliable (cancellation has eaten every digit) are COUNTED AND EXCLUDED rather than
 * compared against noise -- and the count is returned, because silently dropping samples would flatter the test.
 */
export function ksTest(samples, shapes) {
    const xs = [...samples].sort((p, q) => p - q);
    const n = xs.length;
    let D = 0, evaluated = 0, refused = 0;
    for (let i = 0; i < n; i++) {
        const F = productCdf(xs[i], shapes);
        if (!F.ok || !F.reliable) { refused++; continue; }
        evaluated++;
        const d1 = Math.abs((i + 1) / n - F.value);
        const d2 = Math.abs(F.value - i / n);
        if (d1 > D) D = d1;
        if (d2 > D) D = d2;
    }
    const en = Math.sqrt(evaluated);
    // Kolmogorov distribution: Q(t) = 2 * SUM (-1)^{k-1} exp(-2 k^2 t^2)
    const t = (en + 0.12 + 0.11 / en) * D;
    let p = 0;
    for (let k = 1; k <= 100; k++) p += 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * t * t);
    p = Math.min(1, Math.max(0, p));
    return { D, n, evaluated, refused, pValue: p, critical95: 1.36 / en, reject: p < 0.05 };
}
