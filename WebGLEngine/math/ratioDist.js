// math/ratioDist.js
//
// RATIOS (v3057). Z = X/Y with X ~ Gamma(a,1), Y ~ Gamma(b,1) independent. Like the product, the law is a
// Meijer G -- but unlike the product it ALSO has an elementary closed form, and that is what makes this the
// better test of the two.
//
//     via G:          f(z) = 1 / (z Gamma(a) Gamma(b))  *  G^{1,1}_{1,1}( 1/z | 1-a ; b )
//     elementary:     f(z) = z^{a-1} / ( B(a,b) (1+z)^{a+b} )          [the beta-prime density]
//
// The product instrument could only ever check G against G, plus moments. Here the reference contains NO special
// function harder than a Beta -- so a residue-sum bug has nowhere to hide. It also exercises a G family the
// product never touches: n=1 (an upper parameter is actually used) and the argument is 1/z, not z.
//
// THE CONVERGENCE WALL, AND THE HONEST WAY AROUND IT. This is p = q = 1, so the inner hypergeometric has radius
// of convergence 1 and the G is only evaluable for |1/z| < 1, i.e. z > 1. That is half the distribution. The way
// out is not a hack: if Z = X/Y then 1/Z = Y/X is the same law with the shapes SWAPPED, so
//
//     f_Z(z) = f_{Z'}(1/z) / z^2       with Z' ~ ratio(b, a)
//
// which turns any z < 1 into a z' > 1.
//
// CORRECTION TO WHAT I FIRST WROTE HERE: I claimed the two branches "tile the line and meet at z = 1". They do
// not. Measured, they cover up to z = 0.95 and from z = 1.05, and BOTH REFUSE in between -- because z near 1
// means |1/z| near 1, which is the radius of convergence itself, from whichever side you approach. Swapping the
// shapes moves the argument to the other side of 1; it does not make it smaller. There is a real HOLE around
// z = 1 in the G route, and it is inherent to the residue expansion at p = q, not a tuning problem.
//
// That is fine, and saying so is the whole point: the ELEMENTARY form covers the hole and is what a caller
// should use, while the G is the thing being CHECKED wherever it converges. An instrument that quietly returned
// a divergent series across that gap would look complete and be wrong exactly where it was hardest to notice.
// nearBoundary is reported so the gap is visible rather than inferred from a refusal.
//
// Browser-safe: imports only math/meijerG.js.

import { meijerG, gamma } from "./meijerG.js";
import { mulberry32, sampleGamma } from "./productDist.js";

export { mulberry32 };

/** Shapes that would make the G degenerate. b-list is (b) with m=1, so there is no pair to collide -- but the
 *  residue prefactor carries Gamma(1 + b - (1-a)) = Gamma(a+b), and a+b at a non-positive integer is a pole. */
export function ratioShapeProblems(a, b) {
    const bad = [];
    if (!(a > 0)) bad.push("shape a=" + a + " must be positive");
    if (!(b > 0)) bad.push("shape b=" + b + " must be positive");
    return bad;
}

const logBeta = (a, b) => Math.log(gamma(a)) + Math.log(gamma(b)) - Math.log(gamma(a + b));

/** The elementary beta-prime density. No Meijer G anywhere -- this is the independent witness. */
export function ratioPdfExact(z, a, b) {
    if (!(z > 0)) return 0;
    return Math.exp((a - 1) * Math.log(z) - (a + b) * Math.log1p(z) - logBeta(a, b));
}

/**
 * The same density through the Meijer G, tiling both sides of z = 1 by the reciprocal identity.
 * Returns { ok, value, branch, reliable, cancellation, reason }.
 */
export function ratioPdfG(z, a, b) {
    const bad = ratioShapeProblems(a, b);
    if (bad.length) return { ok: false, reason: bad[0] };
    if (!(z > 0)) return { ok: false, reason: "z must be positive (got " + z + ")" };

    // How close to the convergence boundary this z sits. 0 is z=1 (worst); 1 is far away.
    const nearBoundary = Math.abs(Math.log(z));
    if (z >= 1) {
        // direct branch: argument 1/z is inside the unit disc
        const r = meijerG({ m: 1, n: 1, a: [1 - a], b: [b], z: 1 / z });
        if (!r.ok) return { ok: false, reason: r.reason, branch: "direct", nearBoundary };
        return { ok: true, value: r.value / (z * gamma(a) * gamma(b)), branch: "direct", reliable: r.reliable, cancellation: r.cancellation, nearBoundary };
    }
    // reciprocal branch: 1/z > 1, shapes swapped, Jacobian 1/z^2
    const w = 1 / z;
    const r = meijerG({ m: 1, n: 1, a: [1 - b], b: [a], z: 1 / w });
    if (!r.ok) return { ok: false, reason: r.reason, branch: "reciprocal", nearBoundary };
    const fw = r.value / (w * gamma(b) * gamma(a));
    return { ok: true, value: fw / (z * z), branch: "reciprocal", reliable: r.reliable, cancellation: r.cancellation, nearBoundary };
}

/** Exact cdf, elementary: the regularized incomplete beta at z/(1+z). Independent of every G. */
export function ratioCdfExact(z, a, b) {
    if (!(z > 0)) return 0;
    return regIncBeta(z / (1 + z), a, b);
}

/** Regularized incomplete beta by continued fraction (Lentz), with the standard symmetry swap. */
export function regIncBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lbeta = logBeta(a, b);
    const front = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - lbeta);
    if (x > (a + 1) / (a + b + 2)) return 1 - regIncBeta(1 - x, b, a);
    let f = 1, c = 1, d = 0;
    for (let i = 0; i <= 400; i++) {
        const m = Math.floor(i / 2);
        let num;
        if (i === 0) num = 1;
        else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
        else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
        c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        const cd = c * d;
        f *= cd;
        if (Math.abs(1 - cd) < 1e-15) break;
    }
    return front * (f - 1) / a;
}

export function sampleRatio(a, b, rng) { return sampleGamma(a, rng) / sampleGamma(b, rng); }

/** E[Z^k] = Gamma(a+k)Gamma(b-k) / (Gamma(a)Gamma(b)) -- finite only for k < b, which is worth refusing over. */
export function ratioMoment(a, b, k) {
    if (k >= b) return { ok: false, reason: "E[Z^" + k + "] diverges: it needs k < b, and b=" + b + ". A heavy tail is a property of the law, not a numerical problem." };
    return { ok: true, value: gamma(a + k) * gamma(b - k) / (gamma(a) * gamma(b)) };
}

/** KS against the ELEMENTARY cdf -- so the instrument's grader is independent of the thing being graded. */
export function ksRatio(samples, a, b) {
    const xs = [...samples].sort((p, q) => p - q);
    const n = xs.length;
    let D = 0;
    for (let i = 0; i < n; i++) {
        const F = ratioCdfExact(xs[i], a, b);
        D = Math.max(D, Math.abs((i + 1) / n - F), Math.abs(F - i / n));
    }
    const en = Math.sqrt(n);
    const t = (en + 0.12 + 0.11 / en) * D;
    let p = 0;
    for (let k = 1; k <= 100; k++) p += 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * t * t);
    p = Math.min(1, Math.max(0, p));
    return { D, n, pValue: p, critical95: 1.36 / en, reject: p < 0.05 };
}
