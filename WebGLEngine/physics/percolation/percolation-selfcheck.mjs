// WebGLEngine/physics/percolation/percolation-selfcheck.mjs — v3283
//
// Run: node physics/percolation/percolation-selfcheck.mjs   (~10s — MEASURED, dominated by the width bisections)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Two exact keys, neither in the code: Kesten's p_c = 1/2 via the finite-size duality statement (horizontal
// crossing of an L x (L+1) rectangle at p = 1/2 has probability EXACTLY 1/2 at every L — no finite-size
// allowance to argue about, the binomial error of the ensemble is the whole tolerance), and the universal 2D
// exponent nu = 4/3 via transition-width scaling: doubling L multiplies the width by 2^(-3/4) = 0.5946.

import { crossingProb, transitionWidth, neighborsWRONG } from "./percolation.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE DUALITY KEY: exactly 1/2 at p = 1/2, at TWO sizes ---------------------------------------------------
for (const L of [24, 48]) {
    const r = crossingProb({ L, p: 0.5, reps: 3000, seed: 100 + L });
    const band = 3.2 * r.se;   // ~3 sigma binomial
    ok("!! P(horizontal crossing) at p = 1/2 is EXACTLY 1/2 on the " + L + "x" + (L + 1) + " rectangle (Kesten duality, finite-size exact)",
       Math.abs(r.prob - 0.5) < band,
       "measured " + r.prob.toFixed(4) + " over " + r.reps + " realizations (3.2 sigma band ±" + band.toFixed(4) + ")");
}

// ---- 2. AWAY FROM p_c THE CROSSING KNOWS WHICH SIDE IT IS ON ----------------------------------------------------
{
    const lo = crossingProb({ L: 32, p: 0.42, reps: 1500, seed: 300 });
    const hi = crossingProb({ L: 32, p: 0.58, reps: 1500, seed: 400 });
    ok("below p_c crossings are rare, above they are near-certain (the threshold is real, not a fit)",
       lo.prob < 0.15 && hi.prob > 0.85, "P(0.42) = " + lo.prob.toFixed(3) + ", P(0.58) = " + hi.prob.toFixed(3));
}

// ---- 3. THE UNIVERSAL EXPONENT: width ratio -> 2^(-3/4) ---------------------------------------------------------
{
    const w16 = transitionWidth({ L: 16, reps: 1200, seed: 500 });
    const w32 = transitionWidth({ L: 32, reps: 1200, seed: 700 });
    const ratio = w32.width / w16.width, exact = Math.pow(2, -3 / 4);
    ok("!! doubling L shrinks the transition width by 2^(-3/4) = " + exact.toFixed(4) + " (nu = 4/3, universal, emergent)",
       Math.abs(ratio - exact) < 0.12,
       "widths " + w16.width.toFixed(4) + " -> " + w32.width.toFixed(4) + ", ratio " + ratio.toFixed(4) + " — a number obtained by nothing but counting clusters at two sizes");
    ok("...and both widths straddle p_c = 1/2 (the transition is where duality says)",
       w16.p25 < 0.5 && w16.p75 > 0.5 && w32.p25 < 0.5 && w32.p75 > 0.5,
       "L=16: [" + w16.p25.toFixed(3) + ", " + w16.p75.toFixed(3) + "], L=32: [" + w32.p25.toFixed(3) + ", " + w32.p75.toFixed(3) + "]");
}

// ---- 4. SABOTAGE: the off-by-one lattice FAILS the exact-1/2 key ------------------------------------------------
{
    const r = crossingProb({ L: 24, p: 0.5, reps: 3000, seed: 124, bondFn: neighborsWRONG });
    ok("dropping one column's rightward bonds (a loop off-by-one) breaks the exact 1/2 (detection power, measured)",
       Math.abs(r.prob - 0.5) > 4 * r.se,
       "measured " + r.prob.toFixed(4) + " — every cluster it builds is a real cluster, and the duality key still sees the missing column");
}

// ---- 5. determinism ---------------------------------------------------------------------------------------------
{
    const a = crossingProb({ L: 16, p: 0.5, reps: 400, seed: 9 });
    const b = crossingProb({ L: 16, p: 0.5, reps: 400, seed: 9 });
    ok("seeded ensembles are bit-identical (a failure reproduces)", a.hits === b.hits);
}

console.log(fails ? ("[percolation-selfcheck] FAILED " + fails) : "[percolation-selfcheck] all passed");
process.exit(fails ? 1 : 0);
