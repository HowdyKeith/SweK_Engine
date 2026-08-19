// tools/ship/loopNoise.mjs -- v3748
//
// *** STEP 4 OF THE SIX: A NOISE FLOOR. And the first thing measured was that THE OBVIOUS TOOL CANNOT BE USED
// HERE. tools/roundhouse/seedSpread.mjs varies a `seed` in a device's config; loopMetric's fixture is a fixed
// analytic divergence field with NO RNG AND NO SEED, so feeding it seeds returns sd = 0 -- "NO NOISE" AND "NO
// EXPERIMENT" WEARING ONE LABEL, and a confident zero is exactly the reading relSpread's own error path exists
// to refuse. POINTING seedSpread AT THIS WOULD HAVE PRODUCED A NUMBER AND MEASURED NOTHING. ***
//
// *** SO THE HONEST QUESTION FOR A DETERMINISTIC SOLVER IS NOT RUN-TO-RUN JITTER -- v3746 already asserted that
// is exactly zero, 36 iterations every time -- IT IS FIXTURE SENSITIVITY: how much does the iteration count
// move across DIFFERENT PROBLEMS OF THE SAME KIND? That is the spread a candidate improvement has to clear,
// because an improvement smaller than it is indistinguishable from HAVING PICKED A DIFFERENT PROBLEM. ***
//
// MEASURED over eight fixtures at n=24, tol 1e-8: 36, 35, 36, 34, 34, 34, 33, 38.
//     mean 35.00   sd 1.50   rel 4.29%   range 33..38
// *** SO v3746'S ACCEPT RULE -- STRICTLY FEWER ITERATIONS -- WOULD HAVE ACCEPTED 36 -> 35, A CHANGE WELL
// INSIDE THE SPREAD. A one-iteration "win" on one fixture is not a win. THAT IS WHAT THIS FILE FIXES. ***
//
// THE FAMILY IS DETERMINISTIC AND VARIED ON PURPOSE: different wavenumbers and a phase offset, so each member
// is a genuinely different Poisson problem while remaining exactly reproducible. NO RNG ANYWHERE -- a random
// family would put run-to-run noise back into a measurement whose whole point is that there is none.

import { PoissonMG3D, AIR, FLUID, SOLID } from "../../fluid/multigrid3d.mjs";

/**
 * Eight problems of the same kind. [kx, ky, kz, phase] -- the wavenumbers of the divergence field.
 * *** MEMBER 0 IS loopMetric's OWN FIXTURE (1,2,3, phase 0), so the ensemble CONTAINS the thing being graded
 * rather than sitting beside it. An ensemble that excluded the eval fixture would be measuring a different
 * population from the one the loop optimises. ***
 */
export const FIXTURE_FAMILY = [
    [1, 2, 3, 0], [2, 1, 3, 0], [3, 2, 1, 0], [1, 3, 2, 0],
    [2, 3, 1, 0], [1, 2, 3, 0.7], [2, 2, 2, 0.3], [1, 1, 4, 0],
];

export function fieldFor(n, [kx, ky, kz, phase]) {
    const N = n * n * n, type = new Uint8Array(N), div = new Float32Array(N);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = i + n * (j + n * k);
        const wall = (i === 0 || j === 0 || k === 0 || i === n - 1 || k === n - 1);
        type[c] = wall ? SOLID : (j >= n - 3 ? AIR : FLUID);
        if (type[c] === FLUID) {
            div[c] = Math.sin(kx * Math.PI * i / n + phase) * Math.sin(ky * Math.PI * j / n) * Math.sin(kz * Math.PI * k / n);
        }
    }
    return { type, div, N };
}

/** Iterations for one family member, or null if it did not reach tol -- never a number that pretends. */
export function itersFor(n, member, tol = 1e-8, maxIters = 400) {
    const { type, div, N } = fieldFor(n, member);
    const mg = new PoissonMG3D(n, n, n, { pre: 2, post: 2 });
    mg.solveCG(type, div, 1 / 60, new Float32Array(N), { maxIters, tol });
    return (Number.isFinite(mg.res) && mg.res <= tol) ? mg.iters : null;
}

/**
 * @returns {{ values, mean, sd, rel, min, max, allConverged }}
 * *** IF ANY MEMBER FAILS TO CONVERGE THE SPREAD IS null. A spread computed over the survivors would shrink
 * exactly when the solver got worse -- the flattering direction, and the same partial-sum trap loopTarget
 * refuses. UNKNOWN IS NOT A DEFAULT. ***
 */
export function spread(n = 24, tol = 1e-8) {
    const values = FIXTURE_FAMILY.map((m) => itersFor(n, m, tol));
    if (values.some((v) => v === null)) {
        return { values, mean: null, sd: null, rel: null, min: null, max: null, allConverged: false };
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    return { values, mean, sd, rel: sd / mean, min: Math.min(...values), max: Math.max(...values), allConverged: true };
}

/**
 * *** THE FLOOR: THE SMALLEST IMPROVEMENT THAT IS NOT FIXTURE NOISE. k standard deviations, and k IS STATED
 * RATHER THAN TUNED -- 2 is the conventional two-sigma bar and nothing here has the statistics to justify a
 * cleverer one with eight samples. IT IS ROUNDED UP TO A WHOLE ITERATION, because iterations are integers and
 * a floor of 2.99 accepts a 3 that a floor of 3 refuses. RAISING k IS A DECISION; LOWERING IT TO MAKE A
 * CANDIDATE PASS IS THE THING THIS FILE EXISTS TO STOP. ***
 */
export function floorIters(n = 24, tol = 1e-8, k = 2) {
    const s = spread(n, tol);
    if (!s.allConverged) return { floor: null, why: "an ensemble member did not converge -- no floor", spread: s };
    return { floor: Math.ceil(k * s.sd), k, why: k + " sigma of " + s.sd.toFixed(2) + " over " + s.values.length + " fixtures", spread: s };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const f = floorIters();
    const s = f.spread;
    console.log("[loopNoise] " + s.values.length + " fixtures at n=24: " + s.values.join(", "));
    console.log("[loopNoise] mean " + s.mean.toFixed(2) + "  sd " + s.sd.toFixed(2) + "  rel " +
                (100 * s.rel).toFixed(2) + "%  range " + s.min + ".." + s.max);
    console.log("[loopNoise] FLOOR " + f.floor + " iterations (" + f.why + ") -- an improvement smaller than " +
                "this is indistinguishable from having picked a different problem");
}
