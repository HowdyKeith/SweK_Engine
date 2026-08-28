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

// *** v4038 -- `steps` WAS DECLARED, PASSED, AND READ BY NOBODY, AND IT IS THE REASON THIS DEVICE IS THE MOST
// EXPENSIVE IN THE LAB. ***
//
// runTwoF reads c.settle and c.record. makeRig spreads { ...DEFAULT_RIG, ...cfg }, so a `steps` handed to it
// lands on the config object and NOTHING EVER LOOKS AT IT -- while DEFAULT_RIG's own settle 6000 / record
// 18000 run regardless. The declared default of 12000 did not even name the real count, which is 24,000.
// MEASURED: steps 1000 and steps 500 both take ~117 s and return the recorded drift bit for bit.
//
// *** AND THE KNOB CENSUS COULD NOT FIND IT, BECAUSE THE DEVICE WAS TOO EXPENSIVE TO FINISH PROBING. *** The
// last full sweep records exactly that -- "twof: OVER BUDGET at 300000 ms -- probed 1 of 2 declared knobs" --
// and the one it never reached was this one. A dead knob that makes a device slow, hidden by the device being
// slow. The fix is not a cheaper default; it is DECLARING THE TWO KNOBS THAT ACTUALLY DRIVE THE SOLVER, at
// the values DEFAULT_RIG already uses, so every recorded number in this file is unchanged.
//
// *** THE COST IS NOT WASTE, AND THIS FILE OF ALL FILES MUST NOT BE "OPTIMISED" BY SHORTENING IT. *** The key
// is that the Zou-He inlet HOLDS: 1.45e-3 against the 12-21% every body-force-driven attempt showed. That
// number is a drift measured over a long run, and it needs the run. MEASURED at reduced settings:
//     settle  300 / record  900  ->   6.0 s, drift 1.649e-2   -- eleven times worse
//     settle  600 / record 1800  ->  21.4 s, drift 7.125e-3   -- five times worse
//     settle 6000 / record 18000 -> ~115 s, drift 1.452e-3    -- the recorded result
//
// v4073 -- RE-MEASURED ON THE APPLYING MACHINE, because a recorded number that nobody re-runs is a number
// nobody can check. *** THE LOAD-BEARING ROW REPRODUCES EXACTLY: the default gives 1.451886e-3 here against
// the 1.452e-3 above, so "the Zou-He inlet HOLDS at 1.45e-3" is confirmed rather than inherited. *** The two
// SHORT rows do not:
//
//     settle  300 / record  900  ->   4.7 s, drift 1.2421e-2  (table says 1.649e-2)
//     settle  600 / record 1800  ->  15.7 s, drift 5.5710e-3  (table says 7.125e-3)
//     settle 6000 / record 18000 ->  84.5 s, drift 1.451886e-3  -- AGREES
//
// The wall times are expected to differ and v4038a says so: the hint is machine-local. THE DRIFTS ARE NOT
// SUPPOSED TO. This device is deterministic here -- the same config run twice gives 1.242150e-2 both times,
// bit for bit -- so the short rows were measured against some other code state, not sampled from noise.
// NOT SILENTLY OVERWRITTEN: both sets are kept, because deleting the originals would destroy the evidence
// that they ever disagreed, and one of them may be right about a tree this one has not got.
//
// WHAT IS UNAFFECTED: the CONCLUSION the table exists to support. Shortening the run makes the drift much
// worse on both sets of numbers -- 1.24e-2 and 5.57e-3 here against 1.45e-3 -- so "shortened, it reports the
// inlet FAILING" holds, and the argument against a cheaper default stands on this machine's numbers too.
// A shortened run does not report a cheaper version of this answer, IT REPORTS THE INLET FAILING. v2797
// guessed "longer runs" would fix the shedding and v2834 disproved it with arithmetic; guessing "shorter
// runs" here would be the same error pointing the other way, and it would read as the boundary condition
// this module exists to defend having been broken.
// v4080 -- AND THIS DEVICE IS THE COUNTEREXAMPLE THAT SETTLED WHETHER rawCalls COULD STAND IN FOR THE ms ABOVE.
// corroborationCensus.mjs already counts every unspecified libm call this device (and every other) makes,
// which makes "derive a cost hint from rawCalls instead of asking every device to declare one" look free --
// the census counts it already, and this file's own inlet build makes well over a hundred million of them at
// 24,000 lattice steps. MEASURED instead of assumed (see costRecord.mjs's header for the full comparison):
// kuramoto.curve makes MORE libm calls than this device's inlet build and finishes in a small fraction of the
// wall time, because kuramoto's inner loop is close to nothing BUT trig while this one spends most of its time
// on the LBM lattice update between calls, which the counter cannot see. A rawCalls-derived hint would have
// ranked kuramoto as the pricier of the two and been backwards. costRecord.mjs measures wall time directly
// instead, and corroborationCensus.mjs's decline logic (v4037, extended this round) now falls back to that
// measured record for every device -- this one included -- that declares no costHint of its own.
const DEF = { runIndex: 0, settle: 6000, record: 18000 };
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
    const r = runTwoF({ tau: rec.tau, U: rec.U, D: 12, yOffset: rec.yOffset,
                        settle: c.settle, record: c.record,
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

    // *** v4038 -- WHAT THIS COSTS, DECLARED, SO A SURVEY CAN DECLINE IT INSTEAD OF DISCOVERING IT. ***
    // corroborationCensus's deadline bounds how many builds START and cannot interrupt one already running,
    // so a ten-second budget produced a 2m08s run entirely because this device sits at position 82. v4037 gave
    // the census a way to ask first; this is the answer.
    //
    // A HINT IS A SCHEDULING ESTIMATE, NOT A MEASUREMENT, and it is used for one thing only: deciding whether
    // to attempt a build. A wrong hint costs a skipped build or a long one and CAN NEVER CHANGE A REPORTED
    // NUMBER.
    //
    // *** THE RATE IS MACHINE-LOCAL *AND* LOAD-LOCAL, AND THE SECOND HALF IS NOT A QUIBBLE. *** The proof run
    // that established `steps` was inert timed the IDENTICAL 24,000-step build three times and got 117.0 s,
    // 205.0 s and 207.7 s -- a 1.8x spread from nothing but CPU contention. The 4.8 ms/step anchor here is
    // calibrated at the fast end (~115 s), so on a busy machine this UNDER-estimates by nearly a factor of
    // two. That is deliberate and it is the safe direction: an under-estimate lets a build start that does
    // not fit, which is exactly the pre-v4037 behaviour and costs time, while an over-estimate would decline
    // work that would have fitted. A scheduler that skips real work to protect a schedule has the priorities
    // backwards.
    //
    // The linear model is also honest about being one: the true cost has a superlinear component in `record`
    // (the recorded series is spectrally analysed), which pushes the same way.
    //
    // `envelope` returns numbers recorded at v2862 and runs no lattice at all, so its honest hint is nil.
    costHint: ({ mode = "inlet", config = {} } = {}) => {
        if (mode === "envelope") return 0;
        const c = { ...DEF, ...config };
        return (Number(c.settle) + Number(c.record)) * 4.8;
    },
};

export { RUNS_V2862 };
