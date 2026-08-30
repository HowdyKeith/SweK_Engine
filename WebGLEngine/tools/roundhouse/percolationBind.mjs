// tools/roundhouse/percolationBind.mjs
//
// v3292 -- BOND PERCOLATION JOINS THE ROUNDHOUSE. Seventh promotion, and it brings the cleanest tolerance
// argument in the lab.
//
// THE PROBLEM WITH EMERGENT-THRESHOLD CLAIMS is that they are almost always statements about L -> infinity, so
// grading one at finite L means arguing about how much finite-size drift to allow -- and that argument is where
// a tolerance stops being measured and starts being chosen. This device does not have that problem:
//
//     ON AN L x (L+1) RECTANGLE, P(horizontal crossing at p = 1/2) = 1/2 EXACTLY, FOR EVERY L.
//
// The horizontal crossing and the dual lattice's vertical crossing are complementary events of identical
// distribution at p = 1/2 (self-duality; p_c = 1/2 is Kesten's theorem). There is no L in the statement. So the
// ENTIRE tolerance is the binomial standard error of the ensemble, sqrt(0.25/reps), which the module computes
// itself -- nothing is left for judgement.
//
// MEASURED, 4000 repetitions each:
//     L=16  P = 0.4958   0.54 sigma      L=32  P = 0.5068   0.85 sigma      L=64  P = 0.4868   1.68 sigma
//
// SECOND KEY -- THE EXPONENT nu = 4/3, obtained by nothing but counting clusters at two sizes. The transition
// width (the p-range over which crossing climbs 25% -> 75%) shrinks as L^(-1/nu), so doubling L multiplies it
// by 2^(-3/4) = 0.5946. Measured 0.0688 -> 0.0402, ratio 0.5852. A universal critical exponent, from counting.
//
// THE PLANTED ERROR: neighborsWRONG drops the crossing probability to EXACTLY ZERO -- 63 sigma. A broken
// neighbour rule does not shift the threshold, it destroys connectivity, so nothing ever spans. Blunt rather
// than subtle, which is worth saying: this is a weaker planted error than rmt's, where the wrong build returned
// the OTHER textbook constant.

import { crossingProb, transitionWidth, neighborsWRONG } from "../../physics/percolation/percolation.js";

export const PERCOLATION_OBSERVABLES = [
    "prob", "dev", "sigmaOff", "se", "reps", "L",
    "widthSmall", "widthLarge", "widthRatio", "widthRatioExact", "nuErr",
];

const DEF = { L: 32, reps: 4000, seed: 100 };
const RATIO_EXACT = Math.pow(2, -0.75);   // 2^(-1/nu) with nu = 4/3

function buildPercolation({ mode = "crossing", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "exponent") {
        const a = transitionWidth({ L: 16, reps: config.reps || 1500, seed: 500 });
        const b = transitionWidth({ L: 32, reps: config.reps || 1500, seed: 500 });
        const ratio = b.width / a.width;
        return {
            prob: null, dev: null, sigmaOff: null, se: null, reps: config.reps || 1500, L: null,
            widthSmall: a.width, widthLarge: b.width,
            widthRatio: ratio, widthRatioExact: RATIO_EXACT,
            nuErr: Math.abs(ratio - RATIO_EXACT) / RATIO_EXACT,
        };
    }

    const r = crossingProb({
        L: c.L, p: 0.5, reps: c.reps, seed: c.seed + c.L,
        ...(config.planted ? { bondFn: neighborsWRONG } : {}),
    });
    return {
        prob: r.prob, dev: Math.abs(r.prob - 0.5), sigmaOff: Math.abs(r.prob - 0.5) / r.se,
        se: r.se, reps: r.reps, L: c.L,
        widthSmall: null, widthLarge: null, widthRatio: null, widthRatioExact: null, nuErr: null,
    };
}

export const percolationDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4098 -- NAMED, THE SAME COMPLETION v3851/v4088-v4097 gave the rest of this family. MEASURED, crossing
    // mode both arms: sigmaOff 0.85 -> 63.2, matching the header's own quoted "63 sigma" exactly.
    planted: { knob: "planted", observable: "sigmaOff",
               note: "neighborsWRONG breaks the bond neighbour rule, destroying connectivity rather than shifting the threshold -- crossing probability collapses to exactly 0 instead of drifting near the exact P=1/2 self-duality result" },
    modes: ["crossing", "exponent"],
    name: "bond-percolation", observables: PERCOLATION_OBSERVABLES, build: buildPercolation,
    defaults: ({ mode } = {}) => ({ mode: mode || "crossing", config: { ...DEF } }),
};
