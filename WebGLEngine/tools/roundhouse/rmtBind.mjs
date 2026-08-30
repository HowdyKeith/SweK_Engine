// tools/roundhouse/rmtBind.mjs
//
// v3291 -- RANDOM MATRIX THEORY JOINS THE ROUNDHOUSE. Sixth promotion, found by fixing the SWEEP rather than the
// tree: v3289 declared the recipe exhausted after searching for identifiers matching /exact[A-Z]/, and a search
// by PROPERTY -- "does this module export a named-wrong variant" -- returns fifteen candidates. Two rounds now
// have come from that correction.
//
// WHAT THIS DEVICE GRADES IS UNUSUAL AND WORTH STATING: it is a detector for CHAOS that looks only at a list of
// numbers. Wigner's claim is that the FLUCTUATIONS of a quantum spectrum depend on nothing about the system
// except its symmetry class and whether the classical dynamics is chaotic.
//
//   <r> = 4 - 2 sqrt(3) = 0.535898   chaotic with time-reversal symmetry (GOE): adjacent levels REPEL
//   <r> = 2 ln 2 - 1    = 0.386294   integrable: levels are uncorrelated and pile up at zero spacing
//
// THE r-STATISTIC IS THE RIGHT OBSERVABLE FOR A GRADED DEVICE, and the module says why: it is a ratio of
// ADJACENT gaps, so it is invariant under any smooth rescaling of the spectrum and needs NO UNFOLDING. Unfolding
// is where spectral analyses usually go wrong -- a badly chosen smooth density can manufacture repulsion or
// destroy it -- so an observable that skips the step skips the failure mode.
//
// MEASURED:
//   goeMatrix        <r> = 0.5342  against 0.5359 exact           (0.3%)
//   diagonalWRONG    <r> = 0.3691  -- collapses to the POISSON value, which is precisely what theory predicts
//                    for a matrix that is random but NOT a GOE: no level repulsion, so no correlation.
//   rectangleLevels  <r> = 0.4026  -- a real integrable billiard, near Poisson, from an independent construction
//   semicircle       R = 28.47 measured against 2 sigma sqrt(N) = 28.28 predicted
//
// The planted error is the sharpest in the lab: it does not produce a wrong number, it produces the OTHER
// TEXTBOOK NUMBER. A device that only checked "is <r> in a plausible range" would pass it.

import {
    ensembleStats, rStatistic, rectangleLevels, semicircleRadius,
    goeMatrix, diagonalWRONG,
} from "../../physics/quantum/rmt.js";

export const RMT_OBSERVABLES = [
    "rGoe", "rGoeErr", "rPoisson", "rPoissonErr", "smallGap",
    "semicircleMeasured", "semicirclePredicted", "semicircleErr", "n", "reps",
];

const GOE_EXACT = 4 - 2 * Math.sqrt(3);          // 0.535898...
const POISSON_EXACT = 2 * Math.log(2) - 1;       // 0.386294...
const DEF = { n: 200, reps: 4, seed: 5, count: 4000 };

function buildRmt({ mode = "repulsion", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "semicircle") {
        const s = ensembleStats({ n: c.n, reps: c.reps, seed: c.seed });
        const pred = semicircleRadius(c.n);
        return {
            rGoe: null, rGoeErr: null, rPoisson: null, rPoissonErr: null, smallGap: s.smallGap,
            semicircleMeasured: s.maxAbs, semicirclePredicted: pred,
            semicircleErr: Math.abs(s.maxAbs - pred) / pred,
            n: c.n, reps: c.reps,
        };
    }

    const build = config.planted ? diagonalWRONG : goeMatrix;
    const s = ensembleStats({ n: c.n, reps: c.reps, seed: c.seed, build });
    // an INDEPENDENT integrable spectrum, not a perturbation of the GOE one
    const poi = rStatistic(rectangleLevels({ count: c.count })).r;
    return {
        rGoe: s.r, rGoeErr: Math.abs(s.r - GOE_EXACT),
        rPoisson: poi, rPoissonErr: Math.abs(poi - POISSON_EXACT),
        smallGap: s.smallGap,
        semicircleMeasured: null, semicirclePredicted: null, semicircleErr: null,
        n: c.n, reps: c.reps,
    };
}

export const rmtDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4130 -- NAMED, THE SAME COMPLETION v3851/v4088-v4129 gave the rest of this family. MEASURED, repulsion
    // mode (default) both arms: rGoe 0.5342 -> 0.3691, matching the header's own quoted measurements exactly --
    // the planted ensemble does not merely move off the GOE value, it lands on the OTHER textbook number
    // (Poisson, 0.386294), which is why the header calls this "the sharpest plant in the lab": a device that
    // only checked "is <r> in a plausible range" would pass it.
    planted: { knob: "planted", observable: "rGoe",
               note: "diagonalWRONG replaces the GOE ensemble's off-diagonal coupling with a diagonal (uncoupled) construction, destroying level repulsion -- the r-statistic does not drift, it lands on the OTHER exact textbook value (Poisson, integrable systems), the strongest form of a plant this lab has" },
    modes: ["repulsion", "semicircle"],
    name: "random-matrix-spectra", observables: RMT_OBSERVABLES, build: buildRmt,
    defaults: ({ mode } = {}) => ({ mode: mode || "repulsion", config: { ...DEF } }),
};
