// math/meijerG.js
//
// The Meijer G-function (v3055), evaluated by RESIDUE SUM rather than by numerically integrating the
// Mellin-Barnes contour.
//
//     G^{m,n}_{p,q}( z | a_1..a_p ; b_1..b_q )  =  (1/2pi i) INT_L  PROD Gamma(b_j - s) PROD Gamma(1-a_j+s)
//                                                              -------------------------------------------- z^s ds
//                                                              PROD Gamma(1-b_j+s) PROD Gamma(a_j - s)
//
// WHY NOT THE CONTOUR. The path L has to separate the poles of Gamma(b_j - s) from those of Gamma(1 - a_j + s),
// and a naive numerical quadrature along it is unstable -- the integrand oscillates and the two pole families
// approach each other. Closing the contour and summing residues at the poles of the first m gamma factors gives
// an EXACT closed form: a linear combination of generalized hypergeometric functions. That is what this file
// computes, and it is worth being blunt that it is a different algorithm with different limits, not a shortcut
// to the same one.
//
// WHAT IT REFUSES, BY NAME.
//   * DEGENERATE b: if b_h - b_j is an integer for any h != j within the first m, the poles COLLIDE, the residues
//     are no longer simple, and logarithmic terms appear. That is a genuinely different implementation -- not a
//     tolerance, not an epsilon. This refuses and says which pair collided. Returning a plausible number there is
//     exactly the "decoration" the lab's governing rule exists to prevent.
//   * p > q: the series does not converge.
//   * p == q with |z| >= 1: the inner hypergeometric has radius of convergence 1. (Analytic continuation past it
//     is a separate piece of work.)
//   * z <= 0: this evaluates real positive z. z^{b_h} is multivalued otherwise.
//
// THE FORMULA (DLMF 16.17.2 / Luke), valid when the b_h are non-degenerate:
//
//   G = SUM_{h=1..m}  [ PROD_{j!=h}^{m} G(b_j-b_h) * PROD_{j=1}^{n} G(1+b_h-a_j) ]
//                     / [ PROD_{j=m+1}^{q} G(1+b_h-b_j) * PROD_{j=n+1}^{p} G(a_j-b_h) ]
//                     * z^{b_h}
//                     * pFq-1( 1+b_h-a_1 .. 1+b_h-a_p ; 1+b_h-b_1 .. [omit h] .. 1+b_h-b_q ; (-1)^{p-m-n} z )
//
// The sign (-1)^{p-m-n} on the argument is load-bearing and easy to drop: with p=0,m=1,n=0 it makes 0F0(;;-z) =
// exp(-z), and with p=0,m=2,n=0 it makes 0F1(;1+v;+z) = the MODIFIED Bessel I that K_v is built from. Get it
// wrong and e^{-z} becomes e^{z} while every structural check still passes.
//
// Browser-safe: no imports, no DOM, no node builtins.

const LANCZOS = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log|Gamma(x)| and the sign of Gamma(x), for real x. Reflection handles x < 0.5. */
export function lgammaSign(x) {
    if (Number.isInteger(x) && x <= 0) return { log: Infinity, sign: 0, pole: true };
    if (x < 0.5) {
        // Gamma(x)Gamma(1-x) = pi / sin(pi x)
        const r = lgammaSign(1 - x);
        const s = Math.sin(Math.PI * x);
        return { log: Math.log(Math.PI / Math.abs(s)) - r.log, sign: (s > 0 ? 1 : -1) * r.sign, pole: false };
    }
    const g = 7;
    let a = 0.99999999999980993;
    const t = x - 1;
    for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (t + i + 1);
    const u = t + g + 0.5;
    return { log: 0.5 * Math.log(2 * Math.PI) + (t + 0.5) * Math.log(u) - u + Math.log(a), sign: 1, pole: false };
}

export function gamma(x) {
    const r = lgammaSign(x);
    if (r.pole) return Infinity;
    return r.sign * Math.exp(r.log);
}

/**
 * Generalized hypergeometric pFq(A ; B ; x) by its defining series.
 * Returns { value, terms, converged, maxTerm, cancellation }.
 * cancellation = log10(maxTerm / |value|) -- the number of decimal digits lost to sign cancellation. It is
 * REPORTED rather than silently absorbed, because a result that looks fine and has lost eleven digits is the
 * failure mode a "value" alone cannot show.
 */
export function pFq(A, B, x, opts = {}) {
    const maxTerms = opts.maxTerms || 2000;
    const tol = opts.tol || 1e-16;
    let term = 1, sum = 1, maxTerm = 1, k = 0;
    for (; k < maxTerms; k++) {
        let num = 1, den = 1;
        for (const a of A) num *= (a + k);
        for (const b of B) den *= (b + k);
        if (den === 0) return { value: NaN, terms: k, converged: false, maxTerm, cancellation: Infinity, reason: "a lower parameter hit a non-positive integer" };
        term *= (num / den) * x / (k + 1);
        sum += term;
        const at = Math.abs(term);
        if (at > maxTerm) maxTerm = at;
        if (at <= tol * Math.abs(sum) && k > 2) { k++; break; }
        if (!isFinite(sum)) return { value: sum, terms: k, converged: false, maxTerm, cancellation: Infinity, reason: "series overflowed" };
    }
    return {
        value: sum, terms: k, converged: k < maxTerms, maxTerm,
        cancellation: Math.abs(sum) > 0 ? Math.log10(maxTerm / Math.abs(sum)) : Infinity,
    };
}

/** Which pairs of the first m b-parameters differ by an integer. Empty means the residues are simple. */
export function degeneratePairs(b, m, tol = 1e-12) {
    const out = [];
    for (let h = 0; h < m; h++)
        for (let j = h + 1; j < m; j++) {
            const d = b[j] - b[h];
            if (Math.abs(d - Math.round(d)) < tol) out.push({ h, j, bh: b[h], bj: b[j], diff: d });
        }
    return out;
}

/**
 * G^{m,n}_{p,q}(z | a ; b).
 * spec: { m, n, a: [...p], b: [...q], z }
 * Returns { ok, value, terms, cancellation, worstTerm, reason }.
 * Every refusal names what is wrong and what would be needed instead -- never a number.
 */
export function meijerG(spec) {
    const { m, n, a = [], b = [], z } = spec;
    const p = a.length, q = b.length;

    if (!(Number.isInteger(m) && Number.isInteger(n) && m >= 0 && n >= 0 && m <= q && n <= p))
        return { ok: false, reason: "need integers 0 <= m <= q and 0 <= n <= p (got m=" + m + ", n=" + n + ", p=" + p + ", q=" + q + ")" };
    if (m === 0) return { ok: false, reason: "m = 0 has no poles to sum: the residue expansion is empty. That case needs the other closure (poles of Gamma(1-a_j+s)), which is a separate implementation." };
    if (!(z > 0)) return { ok: false, reason: "this evaluates real z > 0; z^{b_h} is multivalued otherwise (got z=" + z + ")" };
    if (p > q) return { ok: false, reason: "p > q: the residue series diverges for every z. Only p <= q is evaluated here." };
    if (p === q && Math.abs(z) >= 1)
        return { ok: false, reason: "p == q == " + p + " gives an inner hypergeometric with radius of convergence 1, and z=" + z + " is outside it. Analytic continuation past |z|=1 is not implemented." };

    const deg = degeneratePairs(b, m);
    if (deg.length) {
        const d = deg[0];
        return {
            ok: false, degenerate: deg,
            reason: "DEGENERATE: b[" + d.h + "]=" + d.bh + " and b[" + d.j + "]=" + d.bj + " differ by the integer " +
                Math.round(d.diff) + ", so those poles COLLIDE and the residues are not simple -- the true answer " +
                "picks up logarithmic terms. That is a different implementation, not a tolerance to widen.",
        };
    }

    const sign = ((p - m - n) % 2 === 0) ? 1 : -1;   // (-1)^{p-m-n}; see the header, this is load-bearing
    const arg = sign * z;

    let total = 0, terms = 0, worstCancel = 0, worstTerm = 0;
    for (let h = 0; h < m; h++) {
        const bh = b[h];

        // log of the gamma prefactor, accumulated in logs so a product of large gammas cannot overflow before
        // the division that would have made it finite.
        let logAbs = 0, sgn = 1, poled = false;
        const mul = (x) => { const r = lgammaSign(x); if (r.pole) { poled = true; return; } logAbs += r.log; sgn *= r.sign; };
        const div = (x) => { const r = lgammaSign(x); if (r.pole) { logAbs = -Infinity; return; } logAbs -= r.log; sgn *= r.sign; };

        for (let j = 0; j < m; j++) if (j !== h) mul(b[j] - bh);
        for (let j = 0; j < n; j++) mul(1 + bh - a[j]);
        for (let j = m; j < q; j++) div(1 + bh - b[j]);
        for (let j = n; j < p; j++) div(a[j] - bh);

        if (poled) return { ok: false, reason: "a gamma factor in the residue at h=" + h + " hit a pole; that parameter set needs the degenerate treatment" };
        if (logAbs === -Infinity) continue;   // a pole in the DENOMINATOR kills this term exactly -- legitimate

        const A = a.map((aj) => 1 + bh - aj);
        const B = [];
        for (let j = 0; j < q; j++) if (j !== h) B.push(1 + bh - b[j]);

        const F = pFq(A, B, arg);
        if (!F.converged) return { ok: false, reason: "inner " + p + "F" + B.length + " did not converge at h=" + h + (F.reason ? " (" + F.reason + ")" : "") };
        terms += F.terms;
        if (F.cancellation > worstCancel) worstCancel = F.cancellation;

        const t = sgn * Math.exp(logAbs) * Math.pow(z, bh) * F.value;
        if (Math.abs(t) > worstTerm) worstTerm = Math.abs(t);
        total += t;
    }

    // Cancellation ACROSS the residue terms matters as much as inside the series -- K_nu is a difference of two
    // large I terms, and near integer nu that difference is where the digits go.
    const outerCancel = Math.abs(total) > 0 ? Math.log10(worstTerm / Math.abs(total)) : Infinity;
    const cancellation = Math.max(worstCancel, outerCancel, 0);

    // v3055 -- A VALUE WHOSE EVERY DIGIT IS CANCELLATION NOISE MUST NOT BE HANDED BACK LOOKING LIKE A
    // MEASUREMENT. Double precision carries about 16 decimal digits; an alternating series that peaks at 10^c
    // times its own sum has spent c of them. So digitsLeft = 16 - c, and at c >= 16 there is nothing left: the
    // returned number is noise with the right units.
    //
    // This was found by the gate rather than reasoned out in advance. exp(-z) through its own alternating series
    // is exact at z=2, wrong in the 10th digit at z=8, and at z=20 the answer is off by MORE THAN ITSELF -- while
    // still being a finite, plausible-looking float. The cancellation number predicted all three.
    //
    // It still RETURNS the value. Refusing would hide a result that is fine for a plot and useless for a
    // comparison; flagging lets the caller decide, and makes the difference visible either way.
    const digitsLeft = Math.max(0, 16 - cancellation);
    return {
        ok: true, value: total, terms,
        cancellation, digitsLeft,
        reliable: digitsLeft >= 1,
        innerCancellation: worstCancel, outerCancellation: Math.max(outerCancel, 0),
        worstTerm,
    };
}

/** Convenience: the value, or NaN. Callers that need to know WHY must use meijerG(). */
export function meijerGValue(spec) { const r = meijerG(spec); return r.ok ? r.value : NaN; }
