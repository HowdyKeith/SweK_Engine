// tools/roundhouse/wolffBind.mjs
//
// v3295 -- THE WOLFF CLUSTER ALGORITHM JOINS THE ROUNDHOUSE. Tenth promotion, and the first graded on an
// EFFICIENCY claim as well as a correctness one.
//
// CRITICAL SLOWING DOWN IS THE FAILURE THAT DOES NOT LOOK LIKE ONE. Near T_c the correlation length diverges,
// so single-spin Metropolis needs an enormous number of sweeps to produce a genuinely NEW configuration. The
// samples keep arriving; they simply stop being independent. Acceptance rate: fine. Energy: fine. The error bar,
// computed as if the samples were independent, is a lie -- and nothing in the run says so.
//
// THREE CLAIMS, ALL FALSIFIABLE:
//
//   1. WOLFF SAMPLES THE SAME DISTRIBUTION. Graded against Yang's exact spontaneous magnetisation,
//      |M| = (1 - sinh^-4(2/T))^(1/8). Measured error 4e-4 at T=2.0, 5e-4 at 2.1, 1.5e-3 at 2.2. A faster
//      algorithm that samples a slightly different distribution is worthless, and only an exact key sees it.
//
//   2. WOLFF DOES NOT CRITICALLY SLOW DOWN. Effective sample size per unit WORK, with work counted in SPIN
//      FLIPS rather than sweeps -- counting per-sweep would flatter Wolff, since a cluster move touches many
//      spins. Measured at T_c: Wolff 0.353, Metropolis 0.023. A factor of 15, with the denominator chosen to
//      argue AGAINST the result rather than for it.
//
//   3. P_add = 1 - exp(-2J/T) IS LOAD-BEARING, not a tuning knob. It is the unique value satisfying detailed
//      balance for the Boltzmann distribution. pAddWRONG uses 1 - exp(-J/T) -- one character of difference --
//      and magnetisation collapses from 0.911 to 0.043 while the algorithm still builds clusters, still flips
//      them, and still runs to completion looking healthy.

import {
    wolffMeasure, metropolisMeasure, essPerWork, pAddCorrect, pAddWRONG,
} from "../../physics/statmech/wolff.js";

export const WOLFF_OBSERVABLES = [
    "absM", "yangExact", "magErr", "U4", "T", "L",
    "essPerWorkWolff", "essPerWorkMetropolis", "speedup", "flipsPerSpin",
];

const DEF = { L: 32, T: 2.0, moves: 3000, seed: 12345 };
const TC = 2 / Math.log(1 + Math.SQRT2);   // 2.269185...

/** Yang (1952): exact spontaneous magnetisation of the 2D Ising model below T_c. */
export function yangM(T) {
    const s = Math.sinh(2 / T);
    return s > 1 ? Math.pow(1 - Math.pow(s, -4), 0.125) : 0;
}

function buildWolff({ mode = "magnetisation", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "efficiency") {
        // at T_c, where critical slowing down actually bites
        const w = wolffMeasure({ L: c.L, T: TC, moves: c.moves, seed: c.seed });
        const m = metropolisMeasure({ L: c.L, T: TC, sweeps: c.moves, seed: c.seed });
        const ew = essPerWork(w), em = essPerWork(m);
        return {
            absM: null, yangExact: null, magErr: null, U4: null, T: TC, L: c.L,
            essPerWorkWolff: ew.essPerWork, essPerWorkMetropolis: em.essPerWork,
            speedup: ew.essPerWork / em.essPerWork, flipsPerSpin: w.flipsPerSpin,
        };
    }

    const pAdd = config.planted ? pAddWRONG : pAddCorrect;
    const w = wolffMeasure({ L: c.L, T: c.T, moves: c.moves, seed: c.seed, pAdd });
    const exact = yangM(c.T);
    return {
        absM: w.absM, yangExact: exact, magErr: Math.abs(w.absM - exact), U4: w.U4, T: c.T, L: c.L,
        essPerWorkWolff: null, essPerWorkMetropolis: null, speedup: null, flipsPerSpin: w.flipsPerSpin,
    };
}

export const wolffDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    modes: ["magnetisation", "efficiency"],
    name: "wolff-cluster-ising", observables: WOLFF_OBSERVABLES, build: buildWolff,
    defaults: ({ mode } = {}) => ({ mode: mode || "magnetisation", config: { ...DEF } }),
};
