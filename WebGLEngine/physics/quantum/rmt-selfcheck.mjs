// WebGLEngine/physics/quantum/rmt-selfcheck.mjs — v3284
//
// Run: node physics/quantum/rmt-selfcheck.mjs   (~30s — MEASURED; the 250x250 diagonalizations dominate)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// ORDER MATTERS HERE: the eigensolver is checked against spectra known in closed form BEFORE any statistical
// claim is built on it. A spectral-statistics result computed with a broken solver would look plausible and be
// worthless, so the solver earns trust first.
//
// Then the payload: <r>, the ratio of adjacent gaps, which needs NO UNFOLDING and therefore skips the step
// where these analyses usually go wrong. Two exact values, far apart: 4 - 2 sqrt(3) = 0.5359 for GOE level
// repulsion, 2 ln 2 - 1 = 0.3863 for uncorrelated levels. A real integrable billiard sits on one, a random
// matrix ensemble on the other, and a matrix that is RANDOM BUT NOT CORRELATED lands on Poisson -- which is the
// whole point: repulsion comes from the symmetry class, not from randomness.

import { symEigenvalues, goeMatrix, diagonalWRONG, rectangleLevels, rStatistic, smallGapFraction,
         wignerSurmiseCDF, poissonCDF, semicircleRadius, ensembleStats, R_GOE, R_POISSON , PHI } from "./rmt.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE SOLVER EARNS TRUST FIRST -----------------------------------------------------------------------------
{
    const diag = new Float64Array([3, 0, 0, 0, -1, 0, 0, 0, 7]);
    const dv = symEigenvalues(diag, 3);
    ok("eigensolver returns a diagonal matrix's own entries, sorted",
       Math.abs(dv[0] + 1) < 1e-12 && Math.abs(dv[1] - 3) < 1e-12 && Math.abs(dv[2] - 7) < 1e-12,
       dv.map((x) => x.toFixed(6)).join(", "));
    // [[2,1,0],[1,2,1],[0,1,2]] has eigenvalues 2 and 2 +- sqrt(2), in closed form
    const tri = new Float64Array([2, 1, 0, 1, 2, 1, 0, 1, 2]);
    const tv = symEigenvalues(tri, 3);
    const exact = [2 - Math.SQRT2, 2, 2 + Math.SQRT2];
    ok("!! ...and matches a 3x3 whose spectrum is known in closed form (2, 2 +- sqrt 2)",
       tv.every((x, i) => Math.abs(x - exact[i]) < 1e-12), tv.map((x) => x.toFixed(9)).join(", "));
    // trace is invariant under similarity: a cheap, strong check at full size
    const n = 120, A = goeMatrix(n, 3);
    let tr = 0; for (let i = 0; i < n; i++) tr += A[i * n + i];
    const sum = symEigenvalues(A, n).reduce((x, y) => x + y, 0);
    ok("...and conserves the trace at full size (sum of eigenvalues = sum of diagonal)",
       Math.abs(tr - sum) < 1e-9 * n, "trace " + tr.toFixed(9) + " vs eigenvalue sum " + sum.toFixed(9));
}

// ---- 2. WIGNER'S SEMICIRCLE --------------------------------------------------------------------------------------
{
    const g = ensembleStats({ n: 250, reps: 8, seed: 5 });
    const R = semicircleRadius(250);
    ok("!! the GOE spectrum fills a semicircle of radius 2 sigma sqrt(N) — predicted, not fitted",
       g.maxAbs > R * 0.95 && g.maxAbs < R * 1.10,
       "extreme eigenvalue " + g.maxAbs.toFixed(2) + " vs predicted radius " + R.toFixed(2) +
       " (the edge sits slightly outside: Tracy-Widom fluctuations, which is the correct behaviour)");

    // ---- 3. THE r-STATISTIC: GOE lands on 4 - 2 sqrt(3) ---------------------------------------------------------
    ok("!! GOE level statistics land on <r> = 4 - 2 sqrt(3), with no unfolding anywhere in the analysis",
       Math.abs(g.r - R_GOE) < 0.02, "measured " + g.r.toFixed(4) + " vs exact " + R_GOE.toFixed(4) +
       " over " + g.reps + " matrices of size " + g.n);
    ok("!! ...and small gaps are SUPPRESSED as the Wigner surmise says (levels repel)",
       Math.abs(g.smallGap - wignerSurmiseCDF(0.3)) < 0.03,
       "fraction of gaps below 0.3 of the mean: " + g.smallGap.toFixed(4) + " vs surmise " + wignerSurmiseCDF(0.3).toFixed(4) +
       " (Poisson would give " + poissonCDF(0.3).toFixed(4) + ")");

    // ---- 4. REAL PHYSICS ON THE OTHER SIDE: an integrable billiard ------------------------------------------------
    const rect = rectangleLevels({});
    const rr = rStatistic(rect).r, rs = smallGapFraction(rect);
    ok("!! an INTEGRABLE rectangular billiard lands on Poisson, <r> = 2 ln 2 - 1 — exactly solvable levels, no solver involved",
       Math.abs(rr - R_POISSON) < 0.03, "measured " + rr.toFixed(4) + " vs exact " + R_POISSON.toFixed(4));
    ok("!! ...and its small gaps are NOT suppressed (no repulsion: uncorrelated levels pile up at zero)",
       Math.abs(rs - poissonCDF(0.3)) < 0.05,
       "fraction below 0.3 mean: " + rs.toFixed(4) + " vs Poisson " + poissonCDF(0.3).toFixed(4));
    ok("!! THE DISCRIMINATOR WORKS: chaotic and integrable are separated by " + (g.r - rr).toFixed(3) + " in a statistic with no free parameters",
       g.r - rr > 0.09, "GOE " + g.r.toFixed(4) + " vs billiard " + rr.toFixed(4) +
       " — two opposite shapes, one number, nothing tuned");
}

// ---- 5. SABOTAGE: random is not the same as repelling -------------------------------------------------------------
{
    const d = ensembleStats({ n: 250, reps: 8, seed: 5, build: diagonalWRONG });
    ok("!! a matrix that is RANDOM but not a GOE (independent diagonal) shows NO repulsion — it lands on Poisson",
       Math.abs(d.r - R_POISSON) < 0.03 && Math.abs(d.r - R_GOE) > 0.12,
       "measured " + d.r.toFixed(4) + " vs Poisson " + R_POISSON.toFixed(4) + " and GOE " + R_GOE.toFixed(4) +
       " — every entry is a proper Gaussian, and repulsion still does not appear: it comes from the CORRELATIONS a symmetry class imposes, not from randomness");
    ok("...and its small-gap fraction is Poisson too (the sabotage fails both observables, not just one)",
       Math.abs(d.smallGap - poissonCDF(0.3)) < 0.05,
       "fraction below 0.3 mean: " + d.smallGap.toFixed(4) + " vs Poisson " + poissonCDF(0.3).toFixed(4));
}

// ---- 6. determinism -----------------------------------------------------------------------------------------------
{
    const a = ensembleStats({ n: 80, reps: 2, seed: 11 }), b = ensembleStats({ n: 80, reps: 2, seed: 11 });
    ok("seeded ensembles are bit-identical (a failure reproduces)", a.r === b.r && a.smallGap === b.smallGap);
}


// ---- v3321: PHI IS LOAD-BEARING, AND NOTHING TESTED IT --------------------------------------------------------------
//
// Found by sweeping for exported one-line definitions their own gate never mentions -- the pattern that let a 1%
// error in geodesic's horizon(M) pass five gates. PHI is the DEFAULT ASPECT RATIO of the rectangle billiard that
// supplies this device's integrable spectrum, and it looked like a constant too trivial to check.
//
// IT IS THE WHOLE REASON THE BILLIARD IS INTEGRABLE-BUT-NOT-DEGENERATE. A rectangle's levels go as
// (m/a)^2 + (n/b)^2. With a RATIONAL aspect ratio different (m,n) pairs land on identical energies, the spectrum
// acquires exact degeneracies, gaps of zero pile up, and the r-statistic collapses far BELOW Poisson. An
// irrational ratio makes those coincidences impossible.
//
// MEASURED:  PHI 0.4026 and sqrt(2) 0.3825 against Poisson 0.3863;  3/2 gives 0.1791 and 2 gives 0.1662.
//
// A quietly rationalised default would not throw, would not look wrong, and would drag the Poisson reference to
// roughly HALF its correct value -- while the GOE side kept passing, because that spectrum comes from a random
// matrix and never touches PHI.
{
    const POISSON = 2 * Math.log(2) - 1;
    const rOf = (ratio) => rStatistic(rectangleLevels({ ratio, count: 4000 })).r;

    ok("!! PHI is irrational, which is the property the integrable spectrum depends on",
        Math.abs(PHI - (1 + Math.sqrt(5)) / 2) < 1e-15,
        `${PHI}. The golden ratio is the hardest number to approximate by rationals, which is what a billiard ` +
        "needs if its levels are to avoid coincidences");

    ok("!! irrational aspect ratios give Poisson statistics, rational ones COLLAPSE",
        Math.abs(rOf(PHI) - POISSON) < 0.05 && Math.abs(rOf(Math.SQRT2) - POISSON) < 0.05 &&
        rOf(1.5) < POISSON * 0.6 && rOf(2) < POISSON * 0.6,
        `PHI ${rOf(PHI).toFixed(4)}, sqrt(2) ${rOf(Math.SQRT2).toFixed(4)} against Poisson ${POISSON.toFixed(4)}; ` +
        `3/2 gives ${rOf(1.5).toFixed(4)} and 2 gives ${rOf(2).toFixed(4)}. Rational ratios make different (m,n) ` +
        "pairs share an energy, so degeneracies pile gaps at zero and the statistic falls below Poisson rather " +
        "than scattering around it");

    ok("...so a quietly rationalised default would halve the reference and throw nothing",
        rOf(1.5) / rOf(PHI) < 0.6,
        `${(rOf(1.5) / rOf(PHI)).toFixed(3)} of the correct value. The GOE side keeps passing throughout, so only ` +
        "this assertion would notice");
}

console.log(fails ? ("[rmt-selfcheck] FAILED " + fails) : "[rmt-selfcheck] all passed");
process.exit(fails ? 1 : 0);
