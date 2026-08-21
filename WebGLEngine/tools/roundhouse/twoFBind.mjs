// tools/roundhouse/twoFBind.mjs
//
// v3297 -- THE TWO-FREQUENCY EXPERIMENT. Twelfth promotion, and the first found by WIDENING THE SEARCH beyond
// physics/ -- every previous sweep in this run only looked there, and this module lives in simulation/lbm/.
//
// FOUR ROUNDS OF HISTORY, AND THE DEVICE GRADES THE OUTCOME OF ALL OF THEM:
//   v2797  measured the vortex street twice, got agreement, and could NOT reproduce the textbook relation that
//          drag oscillates at TWICE the lift frequency. Recorded it honestly and guessed the fix: "longer runs".
//   v2834  proved that guess WRONG with arithmetic: in a body-force-driven channel, shedding modulates drag,
//          drag sets velocity, velocity sets shedding. The Reynolds number breathes -- every attempt drifted
//          12-21% -- and NO NUMBER OF EXTRA STEPS FIXES A FEEDBACK LOOP. Prescribed a fixed-velocity inlet.
//   v2835  built the Zou-He inlet and gated that it does not drift.
//   ...and then nobody ran the experiment. The tool was built for a question and the question was left open.
//
// WHAT THE RUN MEASURED, and both halves are graded here because both are results:
//
//   THE HALF THAT WORKED. The fixed inlet HOLDS. Prior attempts drifted 12-21%; measured here 0.145% and 0.114%.
//   The feedback loop is broken and v2835's boundary condition does what it was built to do. Re-measured at
//   v3297: 1.45e-3, matching the recorded 0.00145 exactly.
//
//   THE HALF THAT DID NOT. Neither run shed. No lift frequency was resolvable, so the drag/lift ratio has NO
//   VALUE -- not a wrong value, no value. Raising Re from 64.8 to 84.9 and breaking the symmetry grew the lift
//   amplitude 5x (0.023 -> 0.115), so the perturbation took and the asymmetry is real; it did not become a
//   sustained oscillation.
//
// AND THE CONCLUSION IS STATED NO MORE STRONGLY THAN IT DESERVES, which is why this module is worth grading:
// it does NOT show 2f is false. It extends v2749's measured finding that confinement raises the shedding onset
// -- no shedding by Re~58 at 21% blockage, none by Re~85 at 16%. Two points on the same boundary. The original
// question remains exactly as open as it was, with one fewer wrong explanation.

import { runTwoF, RUNS_V2862, nuOf, reOf, DEFAULT_RIG } from "../../simulation/lbm/twoFExperiment.mjs";

export const TWOF_OBSERVABLES = [
    "inletDriftFrac", "driftImprovementVsFeedback", "liftAmplitude", "liftSustained",
    "dragOverLift", "healthy", "reNominal", "blockageFrac", "recordedDrift", "recordedLift",
];

const DEF = { runIndex: 0, steps: 12000 };
const FEEDBACK_DRIFT = 0.12;   // the 12-21% every body-force-driven attempt showed before v2835

function buildTwoF({ mode = "inlet", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const rec = RUNS_V2862[c.runIndex] || RUNS_V2862[0];

    if (mode === "envelope") {
        // the divergent third run, recorded as a MEASUREMENT of the stable envelope rather than a failed attempt
        const bad = RUNS_V2862[2];
        return {
            inletDriftFrac: null, driftImprovementVsFeedback: null,
            liftAmplitude: bad.liftAmplitude, liftSustained: false, dragOverLift: null,
            healthy: bad.healthy, reNominal: bad.re, blockageFrac: bad.blockage,
            recordedDrift: null, recordedLift: null,
        };
    }

    // *** v3767 -- THE PLANT: `nofixedinlet` DROPS THE ZOU-HE INLET, which reverts the solver to exactly the
    // pre-v2835 one. THE INVITED REGRESSION IS SOMEBODY SIMPLIFYING THE BOUNDARY CONDITION BACK OUT -- it
    // reads as a tidy-up rather than a physics change, and the module's ENTIRE REASON TO EXIST is that
    // v2834 proved the feedback loop cannot be fixed by running longer. ONE-SIDED: recordedDrift is a number
    // from a real prior run and never sees this lattice. ***
    const r = runTwoF({ tau: rec.tau, U: rec.U, D: 12, yOffset: rec.yOffset, steps: c.steps,
                        dropInlet: mode === "nofixedinlet" });
    return {
        inletDriftFrac: r.inletDriftFrac,
        driftImprovementVsFeedback: FEEDBACK_DRIFT / r.inletDriftFrac,
        liftAmplitude: r.liftAmplitude, liftSustained: r.liftSustained,
        dragOverLift: r.dragOverLift, healthy: r.healthy,
        reNominal: r.reNominal, blockageFrac: r.blockageFrac,
        recordedDrift: rec.inletDriftFrac, recordedLift: rec.liftAmplitude,
    };
}

export const twoFDevice = {
    // v3767 -- "inlet" stays FIRST so the mode-plant contract compares the plant against the mode that owns
    // inletDriftFrac; the plant is a variant of inlet, so inlet is its correct baseline (v3762's lesson).
    modes: ["inlet", "envelope", "nofixedinlet"],
    plantMode: "nofixedinlet", plantFlips: "inletDriftFrac", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "inletDriftFrac is the fractional drift of the inlet condition the solver is supposed to hold fixed, ideally 0; releasing it takes the drift 1.45e-3 -> 1.02e-2 and kills vortex shedding, liftAmplitude 2.27e-2 -> 6.2e-12",
    name: "lbm-two-frequency-shedding", observables: TWOF_OBSERVABLES, build: buildTwoF,
    defaults: ({ mode } = {}) => ({ mode: mode || "inlet", config: { ...DEF } }),
};

export { RUNS_V2862 };
