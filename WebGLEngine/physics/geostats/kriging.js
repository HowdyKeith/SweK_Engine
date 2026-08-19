// physics/geostats/kriging.js
//
// ORDINARY KRIGING -- v2840. Geostatistical interpolation, and it earns a place in a graded lab because it is
// not merely "a smooth interpolator". It is the BEST LINEAR UNBIASED ESTIMATOR, and each of those three words
// is a property that can be MEASURED rather than asserted:
//
//   LINEAR      the prediction is a weighted sum of the observations. Nothing else.
//   UNBIASED    the weights sum to EXACTLY 1, which is what makes the estimator carry no systematic offset.
//               That is not a happy accident of the maths; it is imposed as a constraint, which is precisely
//               why the system has a Lagrange multiplier in it.
//   BEST        of every weight set satisfying that constraint, kriging's minimises the prediction variance.
//               THIS IS THE CHECKABLE ONE, and it is the reason kriging is worth more than inverse-distance
//               weighting: perturb the weights any way you like, keep them summing to 1, and the variance MUST
//               go up. A gate can try a thousand perturbations and watch it fail to find a better one.
//
//   AND IT INTERPOLATES EXACTLY. Predict at a location where you already have an observation and you must get
//   that observation back, with variance zero. An interpolator that smooths through its own data points is
//   lying about what it knows.
//
// THE VARIOGRAM IS THE MODEL, AND IT IS NOT DERIVED FROM THE DATA HERE. gamma(h) says how quickly the field
// decorrelates with distance; choosing it is a modelling decision the caller makes, and pretending otherwise
// would hide the one judgement call in the method. Three standard shapes are provided.
//
// COMBINING TWO PREDICTIONS is the other half of what Keith asked for, and it has a closed form: given two
// unbiased estimates with variances s1^2 and s2^2, the minimum-variance combination weights each by its INVERSE
// VARIANCE. The confident one dominates, the uncertain one is discounted, and the combined variance is lower
// than EITHER input -- which is the whole reason to combine rather than pick.
//
// Pure, no imports, browser-safe.

// ---- variogram models -----------------------------------------------------------------------------------
// Each returns gamma(h): 0 at h=0, rising to (nugget + sill) far away. The nugget is the discontinuity at the
// origin -- measurement error, or variation below the sampling scale.
export const spherical = ({ nugget = 0, sill = 1, range = 1 } = {}) => (h) =>
    h <= 0 ? 0 : h >= range ? nugget + sill : nugget + sill * (1.5 * (h / range) - 0.5 * Math.pow(h / range, 3));

export const exponential = ({ nugget = 0, sill = 1, range = 1 } = {}) => (h) =>
    h <= 0 ? 0 : nugget + sill * (1 - Math.exp(-3 * h / range));

export const gaussian = ({ nugget = 0, sill = 1, range = 1 } = {}) => (h) =>
    h <= 0 ? 0 : nugget + sill * (1 - Math.exp(-3 * h * h / (range * range)));

export const MODELS = { spherical, exponential, gaussian };

const dist = (a, b) => { let s = 0; for (let d = 0; d < a.length; d++) { const t = a[d] - b[d]; s += t * t; } return Math.sqrt(s); };

// ---- a small dense solver -------------------------------------------------------------------------------
// Gaussian elimination with PARTIAL PIVOTING. The kriging matrix is symmetric but not positive definite once
// the Lagrange row is bordered on, so Cholesky does not apply and pivoting is not optional.
export function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (Math.abs(M[piv][c]) < 1e-14) return null;      // singular: say so rather than return noise
        if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t; }
        for (let r = c + 1; r < n; r++) {
            const f = M[r][c] / M[c][c];
            if (f === 0) continue;
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let s = M[r][n];
        for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
        x[r] = s / M[r][r];
    }
    return x;
}

// ---- ordinary kriging -----------------------------------------------------------------------------------
// samples: [{ at: [x,y,...], value }]
// Returns { value, variance, weights, lagrange, exact } -- or null when the system cannot be solved.
export function ordinaryKriging(samples, query, gamma, { exactTol = 1e-12 } = {}) {
    const n = samples.length;
    if (n === 0) return null;

    // EXACT INTERPOLATION is handled explicitly rather than left to the solver. Two coincident points make the
    // matrix singular, so a query sitting on a sample would otherwise fail -- and "fail at the one place you
    // have data" is the worst possible behaviour for an interpolator.
    for (let i = 0; i < n; i++) {
        if (dist(samples[i].at, query) <= exactTol) {
            const w = new Array(n).fill(0); w[i] = 1;
            return { value: samples[i].value, variance: 0, weights: w, lagrange: 0, exact: true };
        }
    }

    // Bordered system: [ G 1 ; 1' 0 ] [ w ; mu ] = [ g0 ; 1 ]
    // The last row and column impose sum(w) = 1 -- unbiasedness as a hard constraint, not a hope.
    const A = [];
    for (let i = 0; i < n; i++) {
        const row = new Array(n + 1);
        for (let j = 0; j < n; j++) row[j] = gamma(dist(samples[i].at, samples[j].at));
        row[n] = 1;
        A.push(row);
    }
    A.push([...new Array(n).fill(1), 0]);
    const b = samples.map((s) => gamma(dist(s.at, query)));
    b.push(1);

    const x = solve(A, b);
    if (!x) return null;
    const weights = x.slice(0, n), lagrange = x[n];

    let value = 0;
    for (let i = 0; i < n; i++) value += weights[i] * samples[i].value;
    // sigma^2 = sum_i w_i gamma(x_i, x0) + mu
    let variance = lagrange;
    for (let i = 0; i < n; i++) variance += weights[i] * b[i];
    return { value, variance: Math.max(0, variance), weights, lagrange, exact: false };
}

// The variance a GIVEN weight set would produce, for the same system. This exists so the "BEST" in Best Linear
// Unbiased Estimator can be TESTED rather than believed: hand it a perturbed weight vector and watch the number
// rise. sigma^2(w) = 2 sum_i w_i gamma_i0 - sum_i sum_j w_i w_j gamma_ij
export function varianceOfWeights(samples, query, gamma, weights) {
    const n = samples.length;
    let a = 0;
    for (let i = 0; i < n; i++) a += weights[i] * gamma(dist(samples[i].at, query));
    let b = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b += weights[i] * weights[j] * gamma(dist(samples[i].at, samples[j].at));
    return 2 * a - b;
}

// ---- combining two predictions --------------------------------------------------------------------------
// The minimum-variance combination of two unbiased estimates weights each by its INVERSE VARIANCE. This is a
// closed form, not a heuristic: it is the weighting that minimises the variance of the result, and the combined
// variance is LOWER THAN EITHER INPUT -- which is why combining beats choosing.
//
// It assumes the two estimates are INDEPENDENT. Correlated ones need the covariance, and pretending otherwise
// would make the combined variance look better than it is; so a correlation may be supplied.
export function combine(a, b, { correlation = 0 } = {}) {
    const va = a.variance, vb = b.variance;
    if (!(va >= 0) || !(vb >= 0)) return null;
    if (va === 0 && vb === 0) return { value: (a.value + b.value) / 2, variance: 0, weightA: 0.5, weightB: 0.5 };
    // A zero-variance estimate is a measurement, not a prediction: it wins outright.
    if (va === 0) return { value: a.value, variance: 0, weightA: 1, weightB: 0 };
    if (vb === 0) return { value: b.value, variance: 0, weightA: 0, weightB: 1 };

    const cov = correlation * Math.sqrt(va * vb);
    const denom = va + vb - 2 * cov;
    if (Math.abs(denom) < 1e-15) return { value: (a.value + b.value) / 2, variance: va, weightA: 0.5, weightB: 0.5 };
    const wa = (vb - cov) / denom, wb = 1 - wa;
    const variance = (va * vb - cov * cov) / denom;
    return { value: wa * a.value + wb * b.value, variance: Math.max(0, variance), weightA: wa, weightB: wb };
}

// Kriging over a LOCAL neighbourhood. Distant samples contribute almost nothing to a prediction but cost O(n^3)
// in the solve, so a k-nearest subset is both faster AND better conditioned. nearestFn is injected so this file
// carries no dependency on the k-d tree while still being able to use one.
export function localKriging(samples, query, gamma, { k = 12, nearestFn = null } = {}) {
    if (samples.length <= k) return ordinaryKriging(samples, query, gamma);
    const picked = nearestFn
        ? nearestFn(query, k)
        : samples.map((s, i) => ({ i, d: dist(s.at, query) })).sort((p, q) => p.d - q.d).slice(0, k).map((p) => samples[p.i]);
    return ordinaryKriging(picked, query, gamma);
}

// A neighbourhood finder backed by a k-d tree, built ONCE for a sample set and reused across many queries.
//
// THIS IS THE ONE PLACE THE TREE ACTUALLY FITS, and v2841 established the rule that says so rather than
// assuming it: a k-nearest query over a large STATIC sample set touches a tiny fraction of it, which is exactly
// the selectivity a spatial index needs to pay. The boids flock failed that test and the wiring was reverted;
// this passes it, so it is wired -- and the decision is made BY THE RULE, not by taste.
//
// buildKd is injected, so this file still imports nothing.
export function kdNeighbourhood(samples, { buildKd, kNearest, k = 12, worthIndexing = null }) {
    if (worthIndexing) {
        const verdict = worthIndexing(samples.length, k);
        // Below the threshold a linear scan is competitive AND keeps summation order, so say no rather than
        // build an index that costs more than it saves.
        if (!verdict.worth) return { use: false, reason: verdict.reason, nearestFn: null };
    }
    const tree = buildKd(samples.map((s) => s.at));
    return {
        use: true,
        tree,
        nearestFn: (query, kk) => kNearest(tree, query, kk || k).map((hit) => samples[hit.index]),
    };
}
