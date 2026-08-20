// WebGLEngine/tools/ship/detectionFloor-selfcheck.mjs -- v2989
//
// Run: node tools/ship/detectionFloor-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// WIRES tools/roundhouse/plantedError.mjs, the third of the orphaned utilities the census named -- and it is the
// one whose argument is sharpest:
//
//   "Every gate in this tree has only ever passed. That is a pleasant fact and an epistemically empty one: a
//    check that has never failed on real physics has never demonstrated it CAN. And the tolerances make it worse
//    rather than better -- every tolerance was chosen during calibration by looking at where the measurement
//    landed. A bound justified by 'this is what we measured' cannot tell you what it would have caught. It is
//    circular, and the circle is invisible from inside."
//
// I WROTE EXACTLY SUCH A TOLERANCE FIVE ROUNDS AGO. fleetBench decides a peer is "correct" if its Poiseuille
// residual is under 0.05, and I picked 0.05 by eye: loose enough that a healthy peer passes, tight enough that a
// broken one does not. No statement anywhere about what it would catch.
//
// MEASURED, by planting an error of known size in tau -- a real physics knob the profile depends on -- and
// sweeping upward until the gate noticed:
//     DETECTION FLOOR 1.28% in tau. Blind below it. GAIN 5.07x.
//
// The gain is the part worth keeping: the observable moves five times further than the error that caused it, so
// a loose-LOOKING 5% band on the residual is a much tighter band on the physics. That is knowable only by
// planting the error; it cannot be read off the tolerance.
import { detectionFloor, sensitivityLine } from "../roundhouse/plantedError.mjs";
import { WORKLOAD, runWorkload, CORRECTNESS_TOL, CORRECTNESS_FLOOR } from "../bench/fleetBench.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the recorded floor still reproduces ------------------------------------------------------------------
{
    const measure = async (eps) => runWorkload({ ...WORKLOAD, tau: WORKLOAD.tau * (1 + eps) }).residual;
    const r = await detectionFloor({ id: "fleetBench-poiseuille", measure, tol: CORRECTNESS_TOL,
                                     knob: "tau", epsMin: 1e-4, epsMax: 0.2, ratio: 2 });
    console.log("        " + sensitivityLine(r));

    ok("!! the gate is NOT blind -- it detects a planted error", r.floor != null && r.floor > 0,
       "a check that cannot be made to fail has never demonstrated it can");
    ok("...and the floor matches what was recorded", Math.abs(r.floor - CORRECTNESS_FLOOR.detects) / CORRECTNESS_FLOOR.detects < 0.6,
       "measured " + (100 * r.floor).toFixed(2) + "% against " + (100 * CORRECTNESS_FLOOR.detects).toFixed(2) + "% recorded at v2989");
    ok("!! ...and an UNPERTURBED run does not trip the gate", !r.nullTrips,
       "if a clean run already failed, nothing measured above it would mean anything");
    ok("the floor is a real bound, not the sweep's edge", r.floor < 0.2,
       "a floor equal to epsMax would mean the gate never noticed at all");
}

// ---- 2. THE TOLERANCE NOW CARRIES ITS JUSTIFICATION ----------------------------------------------------------------
{
    ok("fleetBench exports its tolerance as a named constant", CORRECTNESS_TOL === 0.05);
    ok("!! ...and the measured floor beside it", CORRECTNESS_FLOOR && CORRECTNESS_FLOOR.knob === "tau" && CORRECTNESS_FLOOR.detects > 0,
       "so the bound is a statement about what it CATCHES, not about where a number happened to land");
    ok("...naming the knob the error was planted in", (CORRECTNESS_FLOOR.knob || "").length > 0,
       "a floor with no knob is a number without an experiment");
    ok("...and the round it was measured in", /^v\d+$/.test(CORRECTNESS_FLOOR.measuredAt || ""),
       "so a future reader knows how stale the characterisation is");
    ok("!! the GAIN is recorded, not just the floor", CORRECTNESS_FLOOR.gain > 1,
       CORRECTNESS_FLOOR.gain + "x -- the observable moves further than the error, so a loose-looking band on the residual is a tight band on the physics. Unknowable without planting the error.");
}

console.log(fails ? "\ndetectionFloor-selfcheck: " + fails + " FAILED" : "\ndetectionFloor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
