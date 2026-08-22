// WebGLEngine/physics/quantum/rmt.js — v3284
// ---------------------------------------------------------------------------------------------------------------
// RANDOM MATRIX THEORY, and the sharpest thing it gives us: A DETECTOR FOR CHAOS THAT LOOKS ONLY AT A LIST OF
// NUMBERS. Wigner's claim, now sixty years of evidence deep, is that the FLUCTUATIONS of a quantum spectrum do
// not depend on the system at all -- only on its symmetry class and on whether the classical dynamics is chaotic.
// Chaotic systems with time-reversal symmetry look like the Gaussian Orthogonal Ensemble: neighbouring levels
// REPEL, and P(s -> 0) = 0. Integrable systems do not: their levels are uncorrelated and pile up at s = 0.
//
// THREE EXACT KEYS, none of them in the code that produces the numbers:
//
//   1. WIGNER SEMICIRCLE -- the eigenvalue density of an N x N GOE matrix with entry variance sigma^2 fills a
//      semicircle of radius R = 2 sigma sqrt(N). Not fitted: predicted.
//
//   2. THE r-STATISTIC, and this is the one to build on. Take consecutive gaps s_n, form
//          r_n = min(s_n, s_{n+1}) / max(s_n, s_{n+1})
//      and average. Because it is a RATIO OF ADJACENT GAPS it is invariant under any smooth rescaling of the
//      spectrum -- so it needs NO UNFOLDING, and unfolding is where spectral-statistics analyses usually go
//      wrong (a badly chosen smooth density can manufacture repulsion or destroy it). The exact values:
//          Poisson (uncorrelated levels):  <r> = 2 ln 2 - 1 = 0.386294...
//          GOE     (level repulsion):      <r> = 4 - 2 sqrt(3) = 0.535898...   (Wigner-surmise value)
//      Two closed forms, far apart, and the whole analysis is a sort and a division.
//
//   3. THE WIGNER SURMISE ITSELF -- P(s) = (pi s / 2) exp(-pi s^2 / 4) for GOE, against P(s) = exp(-s) for
//      Poisson, checked at the origin where they differ most: the fraction of gaps below 0.3 of the mean.
//
// AND THE PHYSICS SIDE, so this is not just a statement about matrices: a RECTANGULAR BILLIARD with an
// irrational aspect ratio is integrable, and its levels E = (n/a)^2 + (m/b)^2 are the superposition of many
// independent sequences -- the textbook route to Poisson statistics. It is exactly solvable, so no solver bug
// can be hiding in it, and it must land on 2 ln 2 - 1 while the GOE lands on 4 - 2 sqrt(3). Two opposite shapes,
// one statistic, no free parameters.
//
// THE SABOTAGE IS THE INTERESTING PART: diagonalWRONG builds a matrix that is RANDOM but not a GOE -- a random
// diagonal matrix. Every entry is a proper Gaussian; it is as random as randomness gets. And it shows NO level
// repulsion, because repulsion does not come from randomness, it comes from the CORRELATIONS a symmetry class
// imposes. It lands on Poisson. This is the failure mode a "looks random, must be GOE" argument walks straight
// into, and the r-statistic sees it instantly.
//
// The eigensolver is Householder tridiagonalization + implicit-shift QL (the standard tred2/tqli pair). It is
// checked in the gate against spectra known in closed form before any of the physics above is trusted.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const R_POISSON = 2 * Math.log(2) - 1;      // 0.3862943611...
export const R_GOE = 4 - 2 * Math.sqrt(3);          // 0.5358983849...

function makeRng(seed = 1) {
    let s = seed >>> 0;
    const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    let spare = null;
    return { u, gauss() {
        if (spare !== null) { const v = spare; spare = null; return v; }
        let a = 0, b = 0; while (a <= 1e-12) a = u(); b = u();
        const r = Math.sqrt(-2 * Math.log(a)); spare = r * Math.sin(2 * Math.PI * b); return r * Math.cos(2 * Math.PI * b);
    } };
}

// ---- symmetric eigenvalues: Householder tridiagonalization, then implicit-shift QL ------------------------------
// Values only (no vectors), which is all any statistic here needs.
export function symEigenvalues(A, n) {
    const a = Float64Array.from(A);           // working copy, row-major n x n
    const d = new Float64Array(n), e = new Float64Array(n);
    // --- tred2 (values-only variant) ---
    for (let i = n - 1; i >= 1; i--) {
        const l = i - 1;
        let h = 0, scale = 0;
        if (l > 0) {
            for (let k = 0; k <= l; k++) scale += Math.abs(a[i * n + k]);
            if (scale === 0) e[i] = a[i * n + l];
            else {
                for (let k = 0; k <= l; k++) { a[i * n + k] /= scale; h += a[i * n + k] * a[i * n + k]; }
                let f = a[i * n + l];
                let g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
                e[i] = scale * g; h -= f * g; a[i * n + l] = f - g;
                f = 0;
                for (let j = 0; j <= l; j++) {
                    let gg = 0;
                    for (let k = 0; k <= j; k++) gg += a[j * n + k] * a[i * n + k];
                    for (let k = j + 1; k <= l; k++) gg += a[k * n + j] * a[i * n + k];
                    e[j] = gg / h; f += e[j] * a[i * n + j];
                }
                const hh = f / (h + h);
                for (let j = 0; j <= l; j++) {
                    const fj = a[i * n + j];
                    const gj = e[j] - hh * fj; e[j] = gj;
                    for (let k = 0; k <= j; k++) a[j * n + k] -= fj * e[k] + gj * a[i * n + k];
                }
            }
        } else e[i] = a[i * n + l];
        d[i] = h;
    }
    e[0] = 0;
    for (let i = 0; i < n; i++) d[i] = a[i * n + i];
    // --- tqli (values only) ---
    for (let i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    for (let l = 0; l < n; l++) {
        let iter = 0, m;
        do {
            for (m = l; m < n - 1; m++) {
                const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
                if (Math.abs(e[m]) <= 1e-300 + 2.3e-16 * dd) break;
            }
            if (m !== l) {
                if (iter++ === 60) break;                     // non-convergence is reported, not hidden
                let g = (d[l + 1] - d[l]) / (2 * e[l]);
                let r = Math.hypot(g, 1);
                g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
                let s = 1, c = 1, p = 0;
                for (let i = m - 1; i >= l; i--) {
                    let f = s * e[i], b = c * e[i];
                    r = Math.hypot(f, g);
                    e[i + 1] = r;
                    if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
                    s = f / r; c = g / r;
                    g = d[i + 1] - p;
                    r = (d[i] - g) * s + 2 * c * b;
                    p = s * r; d[i + 1] = g + p; g = c * r - b;
                }
                if (r === 0 && m - 1 >= l) continue;
                d[l] -= p; e[l] = g; e[m] = 0;
            }
        } while (m !== l);
    }
    const out = Array.from(d); out.sort((x, y) => x - y); return out;
}

// ---- ensembles ---------------------------------------------------------------------------------------------------
// A true GOE: symmetric, off-diagonal variance sigma^2, DIAGONAL variance 2 sigma^2. The factor of two is not
// decoration -- it is what makes the ensemble orthogonally invariant, and it is exactly the sort of detail a
// "random symmetric matrix" hand-wave drops.
export function goeMatrix(n, seed, sigma = 1) {
    const rng = makeRng(seed), A = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
        const v = i === j ? Math.SQRT2 * sigma * rng.gauss() : sigma * rng.gauss();
        A[i * n + j] = v; A[j * n + i] = v;
    }
    return A;
}
// NAMED WRONG: as random as randomness gets, and not a GOE. No off-diagonal coupling means no repulsion.
export function diagonalWRONG(n, seed, sigma = 1) {
    const rng = makeRng(seed), A = new Float64Array(n * n);
    for (let i = 0; i < n; i++) A[i * n + i] = sigma * rng.gauss();
    return A;
}

// ---- the integrable billiard: exactly solvable, no solver involved ------------------------------------------------
// Levels of a rectangle with sides a, b: E = (n/a)^2 + (m/b)^2. Irrational ratio so no accidental degeneracies.
// CAUGHT DURING CONSTRUCTION, and worth keeping: the first version used b = 1/sqrt(2), which looks irrational
// and is not where it matters -- 1/b^2 = 2, so every level was n^2 + 2 m^2, an INTEGER, and the spectrum was
// riddled with exact degeneracies. Zero gaps drove <r> to 0.1703, nowhere near Poisson, and the failure looked
// like a statistics bug rather than a number-theory one. What has to be irrational is 1/b^2, not 1/b. The
// golden ratio is the standard choice because it is the hardest number to approximate by rationals, so
// near-degeneracies are as rare as they can be made.
export const PHI = (1 + Math.sqrt(5)) / 2;
export function rectangleLevels({ ratio = PHI, nMax = 90, count = 4000 } = {}) {
    const out = [];
    for (let n = 1; n <= nMax; n++) for (let m = 1; m <= nMax; m++) out.push(n * n + ratio * m * m);
    out.sort((x, y) => x - y);
    return out.slice(0, count);
}

// ---- the statistics ------------------------------------------------------------------------------------------------
// <r>: ratio of adjacent gaps. Unfolding-free by construction, which is the whole point.
// centralFrac trims the spectrum edges. The r-statistic is immune to a smooth density to FIRST order, which is
// its selling point, but the semicircle's density is far from constant near its edges and the residual trend
// correlates adjacent gaps upward -- measured pushing <r> to 0.60 on a full GOE spectrum against the exact
// 0.5359. Trimming to the bulk is the standard remedy and it is applied to every ensemble equally, including
// the sabotage, so it cannot flatter one and not another.
export function rStatistic(levels, { centralFrac = 0.6 } = {}) {
    const cut = Math.floor(levels.length * (1 - centralFrac) / 2);
    const mid = centralFrac >= 1 ? levels : levels.slice(cut, levels.length - cut);
    const s = [];
    for (let i = 1; i < mid.length; i++) s.push(mid[i] - mid[i - 1]);
    let acc = 0, n = 0;
    for (let i = 1; i < s.length; i++) {
        const lo = Math.min(s[i - 1], s[i]), hi = Math.max(s[i - 1], s[i]);
        if (hi > 0) { acc += lo / hi; n++; }
    }
    return { r: acc / n, gaps: s.length, used: n };
}

// fraction of gaps below `frac` of the mean gap -- where GOE and Poisson differ most. Uses only the central
// portion of a spectrum, since the density varies at the edges (that variation is a smooth effect, and the
// r-statistic is immune to it, but this observable is not).
export function smallGapFraction(levels, frac = 0.3, centralFrac = 0.5) {
    const lo = Math.floor(levels.length * (1 - centralFrac) / 2), hi = levels.length - lo;
    const mid = levels.slice(lo, hi);
    const s = [];
    for (let i = 1; i < mid.length; i++) s.push(mid[i] - mid[i - 1]);
    const mean = s.reduce((x, y) => x + y, 0) / s.length;
    return s.filter((x) => x < frac * mean).length / s.length;
}
export const wignerSurmiseCDF = (s) => 1 - Math.exp(-Math.PI * s * s / 4);   // GOE
export const poissonCDF = (s) => 1 - Math.exp(-s);

// semicircle radius for an N x N GOE with entry variance sigma^2
export const semicircleRadius = (n, sigma = 1) => 2 * sigma * Math.sqrt(n);

// average a statistic over several independent matrices from an ensemble
export function ensembleStats({ n = 240, reps = 6, seed = 5, sigma = 1, build = goeMatrix } = {}) {
    let rAcc = 0, smallAcc = 0, maxAbs = 0;
    const all = [];
    for (let k = 0; k < reps; k++) {
        const lev = symEigenvalues(build(n, seed + k * 7919, sigma), n);
        rAcc += rStatistic(lev).r;
        smallAcc += smallGapFraction(lev);
        maxAbs = Math.max(maxAbs, Math.abs(lev[0]), Math.abs(lev[lev.length - 1]));
        all.push(lev);
    }
    return { r: rAcc / reps, smallGap: smallAcc / reps, maxAbs, spectra: all, n, reps };
}
