// WebGLEngine/physics/discovery/symbolicFit.js -- v2867
//
// DEVICE 21: AUTOMATIC EQUATION DISCOVERY, GRADED ON LAWS WE ALREADY KNOW EXACTLY.
//
// WHY THIS IS AN INSTRUMENT AND NOT A TOY. Symbolic regression is usually unfalsifiable in practice: you fit an
// equation, it looks plausible, and nobody can say whether the FINDER works or whether that dataset happened to
// be easy. This lab is in a rare position -- it already owns about twenty laws measured to their exact closed
// forms. So the question is not "can it discover physics", it is:
//
//     DOES THE DISCOVERER REDISCOVER WHAT WE ALREADY KNOW EXACTLY, AND DOES IT STAY SILENT WHERE THERE IS NO LAW?
//
// Both halves have answer keys. The second is the load-bearing one: A REGRESSOR THAT ALWAYS RETURNS AN EQUATION
// IS DECORATION, and finding a confident law in chaos is the exact failure mode this has to refuse.
//
// THE HONEST LIMIT, STATED FIRST BECAUSE IT IS ROUTINELY OVERSOLD. Sparse regression does NOT invent the
// vocabulary. Hand it a library containing x^2 and it can "discover" x^2; hand it one without, and it cannot.
// What it genuinely does is decide WHICH of the offered terms matter and WITH WHAT COEFFICIENTS -- which is a
// real and useful thing, and is not the same as deriving physics from nothing. The library is an input, and the
// physics knowledge hides there.
//
// METHOD: sequential thresholded least squares (fit, zero the small coefficients, refit on what survives,
// repeat). Chosen over genetic programming deliberately -- GP is stochastic, so it answers differently per run
// and cannot be gated deterministically; it needs a dependency; and its output is hard to audit. This is about
// two hundred lines, has no dependencies, is deterministic, and every step is inspectable.
//
// TWO DESIGN DECISIONS THAT DECIDE WHETHER IT WORKS AT ALL:
//
//   LOG SPACE. A power law T ~ a^(3/2) is not linear in ANY polynomial library, so a plain fit cannot find
//   Kepler's third law however many terms you offer. But log T = log c + (3/2) log a IS linear. So power laws
//   are fitted in log space and the exponent falls out as a coefficient.
//
//   VALIDATION BY EXTRAPOLATION, NOT INTERPOLATION. The split is by RANGE: fit on the low part of the parameter
//   span, validate on the high part the fit never saw. A law that only holds where it was fitted is a lookup
//   table, and a random train/test split would hide exactly that -- interpolating between points you already
//   have is nearly free, and it is not what a physical law claims.
"use strict";

// ---- linear algebra (no dependencies) --------------------------------------------------------------------------
/** Solve A x = b for a small square system by Gaussian elimination with partial pivoting. */
export function solveSquare(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (Math.abs(M[piv][col]) < 1e-14) return null;          // singular: say so rather than returning noise
        if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
        for (let r = col + 1; r < n; r++) {
            const f = M[r][col] / M[col][col];
            if (f === 0) continue;
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let s = M[r][n];
        for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
        x[r] = s / M[r][r];
    }
    return x.every(Number.isFinite) ? x : null;
}

/**
 * Ordinary least squares via the normal equations, with COLUMN SCALING. The scaling matters: a library mixing
 * x and x^3 over a wide range produces a badly conditioned Gram matrix, and the symptom is not an error -- it is
 * a confident set of wrong coefficients.
 */
export function lstsq(Theta, y) {
    const n = Theta.length, m = Theta[0].length;
    const scale = new Array(m).fill(0);
    for (let j = 0; j < m; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += Theta[i][j] * Theta[i][j];
        scale[j] = Math.sqrt(s) || 1;
    }
    const G = Array.from({ length: m }, () => new Array(m).fill(0));
    const rhs = new Array(m).fill(0);
    for (let j = 0; j < m; j++) {
        for (let k = j; k < m; k++) {
            let s = 0;
            for (let i = 0; i < n; i++) s += (Theta[i][j] / scale[j]) * (Theta[i][k] / scale[k]);
            G[j][k] = s; G[k][j] = s;
        }
        let s = 0;
        for (let i = 0; i < n; i++) s += (Theta[i][j] / scale[j]) * y[i];
        rhs[j] = s;
    }
    const z = solveSquare(G, rhs);
    return z ? z.map((v, j) => v / scale[j]) : null;
}

/**
 * SEQUENTIAL THRESHOLDED LEAST SQUARES. Fit, zero the coefficients below threshold, refit on the survivors,
 * repeat. The zeroing is what produces a SPARSE law rather than a dense one that fits everything -- and sparsity
 * is most of the defence against overfitting.
 */
export function stlsq(Theta, y, { threshold = 1e-6, iterations = 12 } = {}) {
    const m = Theta[0].length;
    let active = Array.from({ length: m }, (_, j) => j);
    let coeffs = new Array(m).fill(0);
    for (let it = 0; it < iterations; it++) {
        if (!active.length) break;
        const sub = Theta.map((row) => active.map((j) => row[j]));
        const c = lstsq(sub, y);
        if (!c) break;
        coeffs = new Array(m).fill(0);
        active.forEach((j, k) => { coeffs[j] = c[k]; });
        const keep = active.filter((j) => Math.abs(coeffs[j]) >= threshold);
        if (keep.length === active.length) break;                 // converged
        active = keep;
        for (let j = 0; j < m; j++) if (!active.includes(j)) coeffs[j] = 0;
    }
    return coeffs;
}

// ---- feature libraries -------------------------------------------------------------------------------------------
/** Polynomial library in one variable: 1, x, x^2, ... Explicit, because a library nobody can read is a black box. */
export function polyLibrary(varName = "x", degree = 3) {
    const lib = [{ name: "1", fn: () => 1 }];
    for (let d = 1; d <= degree; d++) {
        lib.push({ name: d === 1 ? varName : varName + "^" + d, fn: (v) => Math.pow(v[0], d) });
    }
    return lib;
}

/**
 * MULTI-VARIABLE LIBRARY. v2867 shipped single-variable only, and named that as the honest limit: a law over two
 * quantities was simply out of reach however many polynomial terms you offered. This is that limit lifted.
 *
 * Terms are given as explicit {name, fn} pairs over the whole row, so the library stays READABLE -- the physics
 * knowledge lives here and burying it in a term-generating loop would hide the one input that decides what can
 * be found at all. `vars` names the columns purely so the printed equation is legible.
 *
 * Example -- the vis-viva library: 1, 1/r, 1/a. The exact law v^2 = 2GM/r - GM/a is then coefficients [0, 2, -1]
 * at GM = 1, which is a two-variable law no single-variable library can express.
 */
export function multiLibrary(terms) {
    return terms.map((t) => ({ name: t.name, fn: (row) => t.fn(row) }));
}

/** Common building blocks, so the usual libraries do not have to be retyped (and mistyped) per call site. */
export const TERM = {
    one: { name: "1", fn: () => 1 },
    col: (i, name) => ({ name, fn: (r) => r[i] }),
    inv: (i, name) => ({ name: "1/" + name, fn: (r) => 1 / r[i] }),
    sq: (i, name) => ({ name: name + "^2", fn: (r) => r[i] * r[i] }),
    prod: (i, j, name) => ({ name, fn: (r) => r[i] * r[j] }),
    invSq: (i, name) => ({ name: "1/" + name + "^2", fn: (r) => 1 / (r[i] * r[i]) }),
};

export function designMatrix(X, library) {
    // Array.from, not X.map: THIS ENGINE HANDS OUT TYPED ARRAYS EVERYWHERE (lbm fields, logistic orbits, brain
    // weights), and Float64Array.prototype.map returns ANOTHER Float64Array -- so every row of the design matrix
    // would be coerced to a single NaN instead of staying an array. The symptom was "row.reduce is not a
    // function" two calls later, which points at the wrong place entirely.
    return Array.from(X, (row) => library.map((t) => t.fn(Array.isArray(row) || ArrayBuffer.isView(row) ? row : [row])));
}

// ---- goodness of fit ------------------------------------------------------------------------------------------
export function rSquared(yTrue, yPred) {
    const n = yTrue.length;
    const mean = yTrue.reduce((a, b) => a + b, 0) / n;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) { ssRes += (yTrue[i] - yPred[i]) ** 2; ssTot += (yTrue[i] - mean) ** 2; }
    if (ssTot === 0) return ssRes === 0 ? 1 : 0;
    return 1 - ssRes / ssTot;
}

export function predict(Theta, coeffs) {
    return Theta.map((row) => row.reduce((s, v, j) => s + v * coeffs[j], 0));
}

// ---- the fit --------------------------------------------------------------------------------------------------
export const VERDICT = { LAW: "law", NO_LAW: "no-law", DEGENERATE: "degenerate" };

/**
 * @param {object} o
 * @param {Array} o.X          inputs: array of numbers, or array of arrays for multiple variables
 * @param {number[]} o.y       target
 * @param {Array} o.library    [{name, fn}]
 * @param {boolean} [o.logSpace]  fit log(y) against a library evaluated on log(x) -- for power laws
 * @param {number} [o.splitFrac]  fraction used for FITTING; the remainder (higher range) validates. 0.6 default.
 * @param {number} [o.threshold]  sparsity threshold
 * @param {number} [o.minValR2]   below this on the HELD-OUT range, the answer is "no law", not a worse law
 */
export function fit({ X, y, library, logSpace = false, splitFrac = 0.6, threshold = 1e-6, minValR2 = 0.99 }) {
    if (!X || !y || X.length !== y.length || X.length < 4) return { verdict: VERDICT.DEGENERATE, reason: "need at least 4 points with matching lengths" };
    // Normalise typed arrays to plain arrays once, here, rather than defending against them at every call site.
    X = Array.from(X, (r) => (ArrayBuffer.isView(r) ? Array.from(r) : r));
    y = Array.from(y);

    let Xu = X, yu = y;
    if (logSpace) {
        const bad = X.some((r) => (Array.isArray(r) ? r : [r]).some((v) => !(v > 0))) || y.some((v) => !(v > 0));
        if (bad) return { verdict: VERDICT.DEGENERATE, reason: "log space needs strictly positive x and y" };
        Xu = X.map((r) => (Array.isArray(r) ? r.map(Math.log) : [Math.log(r)]));
        yu = y.map(Math.log);
    }

    // SPLIT BY RANGE, NOT AT RANDOM. Sort by the first input and fit the low part; the high part is unseen.
    const order = Xu.map((r, i) => ({ k: Array.isArray(r) ? r[0] : r, i })).sort((a, b) => a.k - b.k).map((e) => e.i);
    const cut = Math.max(3, Math.floor(order.length * splitFrac));
    const fitIdx = order.slice(0, cut), valIdx = order.slice(cut);
    if (valIdx.length < 1) return { verdict: VERDICT.DEGENERATE, reason: "not enough points to hold any back" };

    const Theta = designMatrix(Xu, library);
    const coeffs = stlsq(fitIdx.map((i) => Theta[i]), fitIdx.map((i) => yu[i]), { threshold });
    if (!coeffs) return { verdict: VERDICT.DEGENERATE, reason: "the least-squares system was singular" };

    const r2Fit = rSquared(fitIdx.map((i) => yu[i]), predict(fitIdx.map((i) => Theta[i]), coeffs));
    const r2Val = rSquared(valIdx.map((i) => yu[i]), predict(valIdx.map((i) => Theta[i]), coeffs));

    const terms = library.map((t, j) => ({ name: t.name, coeff: coeffs[j] })).filter((t) => t.coeff !== 0);
    const verdict = r2Val >= minValR2 ? VERDICT.LAW : VERDICT.NO_LAW;
    return {
        verdict, coeffs, terms, r2Fit, r2Val, logSpace,
        nTerms: terms.length, nFit: fitIdx.length, nVal: valIdx.length,
        equation: formatEquation(terms, { logSpace }),
        // The reason travels with the refusal, so "no law" is informative rather than a shrug.
        // TWO DIFFERENT REFUSALS, AND CONFLATING THEM WOULD BE A LIE. My first draft said "fitted well" in both
        // cases, which is nonsense when the training R2 is 0.005. "It could not fit at all" and "it fitted and
        // then failed to generalise" are different findings with different fixes -- the first wants a richer
        // library, the second wants fewer terms.
        reason: verdict !== VERDICT.NO_LAW ? undefined
            : r2Fit < minValR2
                ? "no fit even on the training range (R2=" + r2Fit.toFixed(4) + "): the offered library cannot express this, or there is nothing to express"
                : "fitted the training range (R2=" + r2Fit.toFixed(4) + ") and FAILED on the unseen range (R2=" + r2Val.toFixed(4) + ") -- that is a lookup table, not a law",
    };
}

export function formatEquation(terms, { logSpace = false } = {}) {
    if (!terms.length) return logSpace ? "log y = 0" : "y = 0";
    const body = terms.map((t, i) => {
        const c = t.coeff;
        const sign = i === 0 ? (c < 0 ? "-" : "") : (c < 0 ? " - " : " + ");
        const mag = Math.abs(c);
        const num = Math.abs(mag - Math.round(mag)) < 1e-9 ? String(Math.round(mag)) : mag.toPrecision(6);
        return sign + (t.name === "1" ? num : num + "*" + t.name);
    }).join("");
    return (logSpace ? "log y = " : "y = ") + body;
}

/** Convenience: fit a pure power law y = c * x^k and return the exponent. Kepler, the inverse-square area law. */
export function powerLaw(x, y, opts = {}) {
    const lib = [{ name: "1", fn: () => 1 }, { name: "log x", fn: (v) => v[0] }];
    const r = fit({ X: x, y, library: lib, logSpace: true, ...opts });
    if (r.verdict !== VERDICT.LAW) return r;
    const k = (r.terms.find((t) => t.name === "log x") || { coeff: 0 }).coeff;
    return { ...r, exponent: k, equation: "y ~ x^" + (Math.abs(k - Math.round(k)) < 1e-9 ? Math.round(k) : k.toPrecision(8)) };
}

// ---- ROLLING-ORIGIN EVALUATION: A VERDICT WITH A SPREAD, NOT A BOOLEAN (v2978) ------------------------------------
//
// The idea is GluonTS's (awslabs): do not report a point forecast, report a DISTRIBUTION -- and evaluate by
// ROLLING THE ORIGIN, refitting at successive cut points rather than trusting one arbitrary split.
//
// WHY THIS ENGINE NEEDS IT, MEASURED RATHER THAN ASSUMED. fit() cuts once, at splitFrac 0.6. So the verdict is a
// property of the DATA and of WHERE YOU HAPPENED TO CUT IT, and nothing here ever separated the two. Sweeping the
// cut over exp(x/3) fitted by a degree-5 polynomial:
//
//     splitFrac   0.4   0.5   0.6   0.7   0.8
//     verdict     no    no    no    no    LAW
//
// At 0.8 the fit sees 80% of the range and is asked to extrapolate over the last 20% -- a short enough reach that
// a polynomial survives it. THE SAME DATA, THE SAME LIBRARY, AND THE ANSWER FLIPS ON THE CUT. The default happens
// to give the right answer there, by luck rather than by principle.
//
// SO THERE IS A THIRD VERDICT, AND IT IS THE INTERESTING ONE. Not "law" and not "no law" but FRAGILE: some
// origins find it and some do not. A single split reports that case as a confident answer in whichever direction
// it lands, which is the failure mode a point verdict cannot even express.
//
// AND THE SPREAD IS THE MEASUREMENT. For a real power law the exponent recovered from ANY window is the same
// number, so the standard deviation across origins is ~0. That is a sharper statement than "R2 was high": it says
// the law does not depend on which part of the range you looked at, which is what a law MEANS.

export const ROLLING = { LAW: "law", FRAGILE: "fragile", NO_LAW: "no-law", DEGENERATE: "degenerate" };

/**
 * Refit at several origins and report the distribution of the answer.
 *
 * @param {object} o            same shape as fit(), minus splitFrac
 * @param {number[]} [o.origins] cut fractions to evaluate. Default spans a genuinely wide range, because a narrow
 *                               sweep would agree with itself and prove nothing.
 * @returns {{verdict, lawFraction, origins, exponentMean, exponentSd, spreadFrac, reason}}
 */
export function rollingFit({ origins = [0.4, 0.5, 0.6, 0.7, 0.8], powerLawMode = false, ...opts }) {
    const runs = [];
    for (const splitFrac of origins) {
        const r = powerLawMode ? powerLaw(opts.X, opts.y, { ...opts, splitFrac })
                               : fit({ ...opts, splitFrac });
        runs.push({ splitFrac, verdict: r.verdict, r2Val: r.r2Val, exponent: r.exponent, terms: r.nTerms });
    }
    const usable = runs.filter((r) => r.verdict !== VERDICT.DEGENERATE);
    if (!usable.length) return { verdict: ROLLING.DEGENERATE, runs, reason: "every origin was degenerate" };

    const laws = usable.filter((r) => r.verdict === VERDICT.LAW);
    const lawFraction = laws.length / usable.length;

    // Spread of the recovered exponent, where there is one. This is the confidence interval GluonTS would report,
    // and for a real law it collapses to zero.
    const exps = laws.map((r) => r.exponent).filter((e) => typeof e === "number" && Number.isFinite(e));
    let mean = null, sd = null, spreadFrac = null;
    if (exps.length) {
        mean = exps.reduce((a, b) => a + b, 0) / exps.length;
        sd = Math.sqrt(exps.reduce((a, b) => a + (b - mean) ** 2, 0) / exps.length);
        spreadFrac = Math.abs(mean) > 1e-12 ? sd / Math.abs(mean) : sd;
    }

    let verdict, reason;
    if (lawFraction === 1) {
        verdict = ROLLING.LAW;
        reason = "every origin found it" + (sd !== null ? ", exponent sd " + sd.toExponential(2) : "");
    } else if (lawFraction === 0) {
        verdict = ROLLING.NO_LAW;
        reason = "no origin found a law -- the refusal does not depend on where the data was cut";
    } else {
        verdict = ROLLING.FRAGILE;
        reason = laws.length + " of " + usable.length + " origins found a law. THE ANSWER DEPENDS ON WHERE YOU CUT, " +
                 "which means it is a property of the split and not of the data. A single-split fit would have reported " +
                 "a confident verdict in whichever direction it happened to land.";
    }
    return { verdict, lawFraction, runs, exponentMean: mean, exponentSd: sd, spreadFrac, reason };
}
