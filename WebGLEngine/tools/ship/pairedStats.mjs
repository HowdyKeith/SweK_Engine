// tools/ship/pairedStats.mjs -- THE FIRST RECOMPUTABLE STATISTICS IN THIS TREE.
//
// *** FOUR PRE-REGISTERED ROUNDS QUOTED p-VALUES NO GATE CAN CHECK. *** v4658, v4660, v4665 and v4671 each
// fixed a hypothesis and a threshold in advance, collected paired frames, and computed the tests in a
// throwaway driver whose numbers reached the tree only as prose in a commit message and a closing line. The
// discipline was real and the arithmetic is unverifiable: "paired t = 6.73 (p = 7.9e-9), sign test 43/51
// (p = 3.4e-7)" is a claim about a computation nobody can re-run. This module is that computation, and
// tools/ship/pairedStats-selfcheck.mjs holds it to published t-tables, to exact binomial fractions, and to
// v4665's own numbers.
//
// *** IT IS DELIBERATELY SMALL AND DELIBERATELY NOT A STATISTICS LIBRARY. *** Two tests, one-sided, paired.
// The tree's pre-registrations have asked for exactly these two every time, and a general library would be a
// large surface whose unused parts nothing measures.
"use strict";

/**
 * The regularized incomplete beta function I_x(a, b), by the continued fraction in Numerical Recipes.
 *
 * *** THIS IS THE ONE PIECE OF REAL NUMERICS HERE AND IT IS WHY THE GATE CHECKS AGAINST TABLES. *** Student's
 * t CDF is an incomplete beta, and a continued fraction that has not converged returns a plausible number
 * rather than an error -- so the gate grades this against values a reader can look up, not against itself.
 */
function betacf(a, b, x) {
    const TINY = 1e-30, EPS = 3e-16, MAXIT = 500;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
        c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
        d = 1 / d; h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
        c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
        d = 1 / d;
        const del = d * c; h *= del;
        if (Math.abs(del - 1) < EPS) return h;
    }
    // *** A FRACTION THAT DID NOT CONVERGE THROWS RATHER THAN RETURNING ITS LAST GUESS. *** A p-value that is
    // quietly the 500th iterate of a diverging sequence is the kind of number this module exists to stop.
    throw new Error(`pairedStats: the incomplete beta continued fraction did not converge at a=${a}, b=${b}, x=${x} -- no p-value is returned rather than an unconverged one`);
}

/** log Gamma, Lanczos. Used only by the beta prefactor. */
function lgamma(z) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** I_x(a, b), the regularized incomplete beta. */
export function ibeta(a, b, x) {
    if (!(x >= 0) || !(x <= 1)) throw new Error(`pairedStats.ibeta: x must be in [0, 1] -- got ${x}`);
    if (x === 0 || x === 1) return x;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/**
 * One-sided paired t-test on the differences, testing mean > 0.
 *
 * Returns { n, mean, sd, t, df, p }. `p` is P(T >= t) under the null, so a LARGE positive t gives a small p
 * and a negative t gives p above a half -- the direction is part of the answer and is not taken as absolute.
 */
export function pairedT(d) {
    const n = d.length;
    if (!(n >= 2)) throw new Error(`pairedStats.pairedT: needs at least 2 paired observations -- got ${n}`);
    if (!d.every(Number.isFinite)) throw new Error("pairedStats.pairedT: every observation must be finite -- a NaN in the sample is not a small effect");
    const mean = d.reduce((s, v) => s + v, 0) / n;
    const ss = d.reduce((s, v) => s + (v - mean) * (v - mean), 0);
    const sd = Math.sqrt(ss / (n - 1));
    const df = n - 1;
    // *** A SAMPLE WITH NO VARIANCE HAS NO t, AND ZERO IS NOT THE ANSWER. *** Every frame moving by exactly
    // the same amount is a deterministic pipeline telling you the effect is real and the test is the wrong
    // instrument; reporting t = Infinity with p = 0 would be arithmetic standing in for judgement.
    //
    // *** AND `sd > 0` IS NOT THE TEST FOR IT, WHICH THIS MODULE'S OWN GATE FOUND. *** Twenty copies of 0.3
    // sum to 6.000000000000001, so the mean is 0.30000000000000004, every residual is -5.5e-17, and the
    // sample standard deviation comes out 1.7e-17 -- strictly positive. The first draft sailed past this guard
    // and reported t = 2.4e16 with p = 1e-300: a constant sample presented as the most significant result in
    // the history of the tree. So a CONSTANT sample is detected by exact equality, and a sample whose spread
    // is negligible beside its own mean is refused on the same grounds, because a t built on a denominator
    // that is pure rounding error is not a measurement of anything.
    const constant = d.every((v) => v === d[0]);
    if (constant || !(sd > 1e-12 * Math.max(Math.abs(mean), 1))) return { n, mean, sd, t: null, df, p: null,
        why: constant
            ? "zero variance: every paired difference is identical, so a t-test has no denominator. The effect's SIZE is the mean and its reliability is not a p-value."
            : `negligible variance: the sample sd is ${sd.toExponential(2)} against a mean of ${mean.toExponential(2)}, which is rounding error and not spread. A t of ${(mean / (sd / Math.sqrt(n))).toExponential(2)} would be a statement about floating point.` };
    const t = mean / (sd / Math.sqrt(n));
    // P(T >= t) = 1 - F(t);  F(t) for t > 0 is 1 - 0.5 * I_{df/(df+t^2)}(df/2, 1/2)
    const x = df / (df + t * t);
    const half = 0.5 * ibeta(df / 2, 0.5, x);
    const p = t > 0 ? half : 1 - half;
    return { n, mean, sd, t, df, p };
}

/**
 * One-sided EXACT sign test: P(at least `up` successes in n fair trials).
 *
 * *** EXACT, NOT NORMAL-APPROXIMATED, AND THE GATE CHECKS IT AGAINST A FRACTION. *** At the twenty-to-fifty
 * frame windows this tree's pre-registrations use, a normal approximation is wrong in the third digit and the
 * thresholds are declared to two. Ties are DISCARDED and n is reduced, which is the standard treatment and is
 * reported so a caller can see how many there were.
 */
export function signTest(d) {
    if (!d.every(Number.isFinite)) throw new Error("pairedStats.signTest: every observation must be finite");
    let up = 0, down = 0, ties = 0;
    for (const v of d) { if (v > 0) up++; else if (v < 0) down++; else ties++; }
    const n = up + down;
    if (n === 0) return { up, down, ties, n: 0, p: null,
        why: "every difference is exactly zero, so there are no signs to test" };
    // *** EXACT IN INTEGERS UP TO n = 1024, WHICH IS EVERY WINDOW THIS TREE HAS EVER DECLARED. *** The first
    // draft accumulated C(n,k)/2^n in log space and read 0.01074218750000378 for nine of ten, where the
    // answer is the rational 11/1024 = 0.0107421875 exactly. Four parts in 10^15 changes no verdict, and it
    // also means the gate can only ever check this against a tolerance -- so the sum is done in BigInt and
    // divided once, and the gate asserts the FRACTION. Above 1024 the log-space path takes over and says so.
    if (n <= 1024) {
        let num = 0n;
        // C(n, k) built by the multiplicative recurrence, which stays exact in BigInt
        let c = 1n;
        for (let k = 0; k <= n; k++) {
            if (k >= up) num += c;
            c = c * BigInt(n - k) / BigInt(k + 1);
        }
        const den = 1n << BigInt(n);
        // one division at the end: Number(num) and Number(den) both overflow past n = 1024, so scale first
        const p = Number(num * 2n ** 53n / den) / Number(2n ** 53n);
        return { up, down, ties, n, p: Math.min(1, p), exact: true };
    }
    let logSum = -Infinity;
    const lchoose = (nn, kk) => lgamma(nn + 1) - lgamma(kk + 1) - lgamma(nn - kk + 1);
    for (let k = up; k <= n; k++) {
        const lt = lchoose(n, k) - n * Math.LN2;
        logSum = logSum === -Infinity ? lt : Math.max(logSum, lt) + Math.log1p(Math.exp(Math.min(logSum, lt) - Math.max(logSum, lt)));
    }
    return { up, down, ties, n, p: Math.min(1, Math.exp(logSum)), exact: false };
}

/**
 * Both tests plus the conjunction this tree's pre-registrations declare.
 *
 * `alpha` defaults to 0.05. `cleared` is true only if BOTH tests have a p below it -- the rule v4665 fixed
 * because v4658's t-test cleared at twenty-one frames while its sign test did not, and that round could have
 * quoted whichever it preferred. A null p (zero variance, or no signs) does NOT clear: an untestable sample
 * is not a passed test.
 */
export function pairedBoth(d, alpha = 0.05) {
    if (!(alpha > 0) || !(alpha < 1)) throw new Error(`pairedStats.pairedBoth: alpha must be in (0, 1) -- got ${alpha}`);
    const t = pairedT(d), s = signTest(d);
    const cleared = t.p !== null && s.p !== null && t.p < alpha && s.p < alpha;
    return { t, sign: s, alpha, cleared };
}
