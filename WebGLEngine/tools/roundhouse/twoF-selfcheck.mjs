// tools/roundhouse/twoF-selfcheck.mjs
//
// v3297 -- THE TWO-FREQUENCY EXPERIMENT BECOMES THE 46th GRADED DEVICE, AND IT IS THE FIRST FOUND BY WIDENING
// THE SEARCH. Every sweep in this run had looked only at physics/. This module lives in simulation/lbm/, and it
// had been sitting there ungraded the whole time.
//
// FOUR ROUNDS LED HERE:
//   v2797  couldn't reproduce the textbook relation that DRAG oscillates at TWICE the lift frequency. Recorded
//          it honestly, guessed the fix: "longer runs at lower blockage".
//   v2834  proved that guess wrong WITH ARITHMETIC. In a body-force-driven channel, shedding modulates drag,
//          drag sets velocity, velocity sets shedding -- the Reynolds number breathes, every attempt drifted
//          12-21%, and NO NUMBER OF EXTRA STEPS FIXES A FEEDBACK LOOP.
//   v2835  built the prescribed fix -- a Zou-He fixed-velocity inlet -- and gated that it holds.
//   ...and nobody ran the experiment. The tool was built for a question and the question was left open.
//
// BOTH HALVES OF THE RESULT ARE GRADED, because both are results.
//
//   THE HALF THAT WORKED: the inlet holds to 0.145% where the feedback loop gave 12-21%. An 83x improvement,
//   and it re-measures at v3297 as 1.45e-3 -- EXACTLY the recorded 0.00145, four hundred versions later.
//
//   THE HALF THAT DID NOT: no shedding. No lift frequency was resolvable, so the drag/lift ratio has NO VALUE.
//   Not a wrong value -- no value. That distinction is the whole reason this device exists: a lab that reported
//   a ratio here would be inventing one.
//
// *** AND THE CLAIM IS DELIBERATELY WEAK. *** This does NOT show 2f is false. It extends v2749's finding that
// confinement raises the shedding onset: no shedding by Re~58 at 21% blockage, none by Re~85 at 16%. Two points
// on a boundary, measured on this solver, against an unconfined textbook onset of ~47. The original question is
// exactly as open as it was, with one fewer wrong explanation -- and asserting that weakness is what keeps the
// next round from inheriting an impression instead of the numbers.

import { getDevice } from "./devices.mjs";
import { verdictTwoF } from "../../simulation/lbm/twoFExperiment.mjs";  // v3341 -- the verdict decides, not an arithmetic accident
import { RUNS_V2862 } from "../../simulation/lbm/twoFExperiment.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("twof");
const o = await dev.build({ mode: "inlet" });

// ---- 1. THE HALF THAT WORKED, RE-MEASURED ---------------------------------------------------------------------
{
    ok("!! the fixed-velocity inlet still holds, and reproduces its recorded drift exactly",
        Math.abs(o.inletDriftFrac - o.recordedDrift) / o.recordedDrift < 0.05,
        `drift ${o.inletDriftFrac.toExponential(3)} against the recorded ${o.recordedDrift} -- the same number. ` +
        "Three rounds of diagnosis were spent getting here, and the boundary condition does what it was built to do");

    ok("!! and it is 83x better than the feedback loop it replaced",
        o.driftImprovementVsFeedback > 20,
        `every body-force-driven attempt drifted 12-21%; this drifts ${(o.inletDriftFrac * 100).toFixed(3)}%. ` +
        "v2834's arithmetic said extra steps could never fix a coupled loop, and the fix was a different boundary " +
        "condition rather than more compute -- that prediction is what this number confirms");
}

// ---- 2. THE HALF THAT DID NOT, AND THE DISTINCTION THAT MATTERS ----------------------------------------------------
{
    // *** v3341 -- THIS CHECK WAS PASSING BECAUSE OF A BUG, AND ITS WORDING HID THAT. *** It required
    // dragOverLift to be NON-FINITE, and until v3341 every frequency in twoFExperiment was NaN (the `.freq`
    // property of dominantFrequency's return object was never read), so NaN satisfied it. The sentence read as
    // a principle and was being met by a type error.
    //
    // THE PRINCIPLE IS RIGHT AND THE ASSERTION WAS WRONG. "The arithmetic produced no value" and "the value does
    // not qualify as a result" are DIFFERENT CLAIMS, and this conflated them. The ratio is now a real number --
    // 0.126 at the shipped fixture -- and it still means nothing, because the lift is a transient. That is what
    // verdictTwoF exists to say, and saying it is the job of the VERDICT, not of an arithmetic accident.
    ok("!! no sustained lift oscillation, so the drag/lift ratio DOES NOT QUALIFY as a result",
        o.liftSustained === false && !verdictTwoF({ ...o, fLift: o.dragOverLift ? 1 : 0 }).qualified,
        `liftSustained=${o.liftSustained}, ratio=${o.dragOverLift}. NOT a wrong ratio and no longer a MISSING ` +
        "one -- a computed number the pre-registered criterion refuses. A decaying transient has no well-defined " +
        "frequency, so the arithmetic still runs and the verdict throws the answer out");

    ok("...and it is NOT near 2, which is the relation still unreproduced",
        !Number.isFinite(o.dragOverLift) || Math.abs(o.dragOverLift - 2) > 1,
        "v2797 asked whether drag oscillates at TWICE the lift frequency. It still does not reproduce -- and " +
        "for the first time the reason is a MEASUREMENT (an unsustained lift) rather than a type error that " +
        "made every frequency NaN");

    ok("...yet the perturbation DID take, which is why this is a negative and not a null run",
        o.liftAmplitude > 0.02 && Math.abs(o.liftAmplitude - o.recordedLift) / o.recordedLift < 0.05,
        `lift amplitude ${o.liftAmplitude.toFixed(4)}, matching the recorded ${o.recordedLift}. The asymmetry is ` +
        "real and grew 5x when Re rose from 64.8 to 84.9 -- it simply never became a sustained oscillation. A " +
        "run with zero lift would have meant the symmetry break failed, which is a different and less useful result");
}

// ---- 3. THE ENVELOPE, RECORDED AS A MEASUREMENT ---------------------------------------------------------------------
{
    const e = await dev.build({ mode: "envelope" });
    ok("!! the divergent run is kept as a measurement of the stable envelope, not discarded",
        e.healthy === false && e.liftAmplitude === null,
        `Re 120 at 9.9% blockage: U sat exactly on the 0.1 compressibility ceiling and tau just above the 0.54 ` +
        "inlet floor, and the field diverged. Three constraints that sheddingDesign predicted would FIGHT, " +
        "measured fighting. A deleted failed run would have left the next person to rediscover the boundary");
}

// ---- 4. THE CLAIM IS BOUNDED ----------------------------------------------------------------------------------------------
{
    const shedAny = RUNS_V2862.some((r) => r.shed);
    ok("!! nothing here claims 2f is false -- the test has still not run where a vortex street exists",
        !shedAny,
        "no run shed, so the original question is untouched. What IS supported is narrower: confinement raises " +
        "the shedding onset. v2749 found none by Re~58 at 21% blockage; this finds none by Re~85 at 16%. Two " +
        "points on the same boundary against an unconfined onset of ~47. Stating it that weakly is the finding");
}

// ---- 5. DECLARED --------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    // CORRECTION: this first said "46 graded of 113". It is NOT 46. gradedCoverage scans physics/ only -- by
    // design, since that is the census it was built to be -- and this module lives in simulation/lbm/, so the
    // count stays 45 and this device is invisible to it. Worth stating rather than quietly renumbering: the
    // census measures what it says it measures, and widening the SEARCH does not widen the CENSUS. The tree now
    // has a graded device the coverage number does not know about, which is a gap in the number, not the device.
    // *** v3930 -- THE COUNT WAS PINNED AT TWO AND A THIRD MODE ARRIVED, WHICH IS PROGRESS. ***
    // `nofixedinlet` is this device's PLANT -- it releases the inlet condition the solver must hold, taking
    // inletDriftFrac 1.45e-3 -> 1.02e-2 and killing vortex shedding. Adding a plant to a device is the thing
    // this lab spends rounds doing, and it turned this line red. THE NAMES ARE THE CHECK, NOT THE COUNT, which
    // is rootLayout's rule two rounds ago and applies verbatim: pinning a total means the gate fires on
    // enrichment, while a NAMED set still fails the day a mode disappears -- which is the loss worth catching.
    ok("twof declares its modes -- and the physics/ census does NOT count it, correctly",
        m.source === "exported" && ["inlet", "envelope"].every((k) => m.declared.includes(k)),
        `source "${m.source}", modes ${JSON.stringify(m.declared)}. gradedCoverage still reads 45 of 113 because ` +
        "it scans physics/ and this lives in simulation/lbm/. Found only because the sweep widened past physics/ " +
        "-- the search space was the limit, not the tree, and the coverage number carries the same limit");
}

console.log();
if (fails) { console.log("twoF-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("twoF-selfcheck: all checks pass");
