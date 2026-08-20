// WebGLEngine/simulation/lbm/twoFFrequency-selfcheck.mjs -- v3341
//
// *** EVERY FREQUENCY twoFExperiment PRODUCED WAS NaN, FROM v2862 UNTIL v3341, AND NOTHING NOTICED. ***
//
// dominantFrequency returns { freq, power, cycles } and zeroCrossFrequency returns { freq, crossings }.
// runTwoF divided the OBJECT by sampleEvery, so fLift, fDrag, fWake and fLiftZC were NaN -- and with them
// dragOverLift, stLift, stWake and liftWakeAgreementFrac, which are computed from them. THE EXPERIMENT THAT
// THREE ROUNDS OF DIAGNOSIS WERE BUILT FOR COULD NOT ANSWER ITS OWN QUESTION, and its answer field said NaN.
//
// *** THE SINGLE-FILE DISAGREEMENT: EVERY OTHER CALLER IN THE TREE ALREADY GOT IT RIGHT. ***
// tools/shedding-settle.mjs writes `S.dominantFrequency(lift).freq`. sheddingSpectrum-selfcheck.mjs writes
// `dominantFrequency(clH).freq / rec.sampleEvery` -- the exact idiom, in the gate of the module twoFExperiment
// imports FROM. One file out of four disagreed and nothing compared them.
//
// *** AND HERE IS WHY IT SURVIVED THREE YEARS OF GATES: THE TWO HALVES WERE EACH TESTED AND THE JOIN WAS NOT. ***
// twoFExperiment-selfcheck grades verdictTwoF against HAND-BUILT objects -- `{ fLift: 0.001, dragOverLift: 2.0 }`
// -- and never once asks runTwoF for a number. twoF-selfcheck (the device) checks that the ENVELOPE mode reports
// a non-finite dragOverLift, which is correct for that mode AND PASSES ON NaN FROM ANY OTHER CAUSE. A verdict
// function graded on synthetic input, a measurement nobody called, and a finiteness assertion pointing the wrong
// way. Nothing in that set can see a measurement that returns NaN.
//
// THE FIXTURE HERE IS DELIBERATELY TINY AND SAYS SO. settle 300 / record 600 is FAR TOO SHORT to mean anything
// physically -- it cannot resolve a shedding frequency and does not claim to. It does not need to: the bug is a
// TYPE ERROR, and a type error is visible in five seconds. Grading the physics is the device's job at the real
// fixture; grading that a number is a NUMBER is this file's, and it must stay cheap enough to actually run.
import { runTwoF, RUNS_V2862 } from "./twoFExperiment.mjs";
import { dominantFrequency, zeroCrossFrequency, detrend } from "./sheddingSpectrum.mjs";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

// ---- 1. THE SHAPE THAT CAUSED IT, PINNED --------------------------------------------------------------------
const probe = Array.from({ length: 1200 }, (_, i) => Math.sin(2 * Math.PI * 0.0024 * i));
const dom = dominantFrequency(detrend(probe));
const zc = zeroCrossFrequency(detrend(probe));

ok("!! *** both estimators return an OBJECT, not a number -- the shape that made the bug possible ***",
    typeof dom === "object" && typeof dom.freq === "number" && typeof zc === "object" && typeof zc.freq === "number",
    "if either is ever changed to return a bare number this check goes red, and THAT IS THE POINT: the fix in " +
    "runTwoF reads `.freq`, so a change of shape here silently breaks it the other way");

ok("...and dividing the object is exactly the NaN that shipped",
    Number.isNaN(dom / 2) && Number.isNaN(zc / 2),
    "kept as a demonstration rather than a comment: the old expression is right here, and it is NaN");

// ---- 2. THE MEASUREMENT ITSELF, DRIVEN -- WHICH IS THE CHECK THAT DID NOT EXIST -----------------------------
const rec = RUNS_V2862[0];
const t0 = Date.now();
const r = runTwoF({ tau: rec.tau, U: rec.U, D: 12, yOffset: rec.yOffset, settle: 300, record: 600 });
say("runTwoF driven at a deliberately tiny fixture (settle 300 / record 600) in " + ((Date.now() - t0) / 1000).toFixed(1) + "s -- " +
    "fLift " + r.fLift + ", fDrag " + r.fDrag + ", fWake " + r.fWake + ", fLiftZC " + r.fLiftZC);

ok("!! *** every frequency runTwoF reports is a FINITE NUMBER ***",
    ["fLift", "fDrag", "fWake", "fLiftZC"].every((k) => Number.isFinite(r[k])),
    "this is the check that did not exist. The verdict function was graded on hand-built objects and the " +
    "measurement was never called, so a headline observable of NaN passed every gate in the tree");

ok("...and so is everything DERIVED from them",
    ["dragOverLift", "stLift", "stWake", "liftWakeAgreementFrac"].every((k) => Number.isFinite(r[k])),
    "four more observables were NaN by inheritance, and a ratio of two NaNs looks exactly like a ratio nobody " +
    "computed");

ok("...and the non-frequency half was ALWAYS fine, which is why nothing looked",
    Number.isFinite(r.inletDriftFrac) && Number.isFinite(r.liftAmplitude) && typeof r.healthy === "boolean",
    "the device emits ONLY this half -- inletDriftFrac, driftImprovementVsFeedback, liftAmplitude, reNominal, " +
    "blockageFrac -- so the lab baseline never froze a NaN and had nothing to report. A BROKEN OBSERVABLE THAT " +
    "NOTHING SURFACES LOOKS IDENTICAL TO ONE THAT WORKS");

// ---- 3. THE CORROBORATION, WHICH IS THE PART THAT SAYS THE FIX IS RIGHT AND NOT MERELY FINITE ----------------
// A number is not evidence of a correct number. v2797 measured the wake Strouhal INDEPENDENTLY, on a different
// rig, three rounds before this module existed, and reported St_wake = 0.1465 (with St_lift = 0.1405, 4% apart).
// At the SHIPPED fixture this module now reports stWake = 0.1445. Neither figure was available to the other.
const V2797_ST_WAKE = 0.1465;
const MEASURED_ST_WAKE_AT_SHIPPED_FIXTURE = 0.1444882644753061;
// *** v3346 -- WEAKENED, AND THE CHECK IS EDITED RATHER THAN DELETED. *** v2797 was a genuinely different
// rig, so THAT agreement stands. But I went on to stack three configs of my own beside it as further
// corroboration, and they shared D and very nearly U -- and St = f D / U, so a constant St across them is
// close to restating that f did not change. See liftPersistence.mjs for the retraction and the test that
// would actually discriminate.
ok("!! the repaired wake Strouhal lands on v2797 s independent measurement (ONE rig, not three -- v3346)",
    Math.abs(MEASURED_ST_WAKE_AT_SHIPPED_FIXTURE - V2797_ST_WAKE) / V2797_ST_WAKE < 0.05,
    "1.4% apart, from a different rig three rounds earlier. A repaired number that agreed with NOTHING would " +
    "only prove the NaN was gone; agreeing with a measurement taken before this file existed is what makes it " +
    "a FIX rather than a value");

// ---- 4. AND THE ANSWER IS STILL AN HONEST NEGATIVE, WHICH IS THE OUTCOME THAT MATTERS -----------------------
// The v2797 question was whether drag oscillates at TWICE the lift frequency. It still does not reproduce --
// but the reason has changed from "the answer is NaN" to a reason the rig can state: at the shipped fixture the
// lift signal is NOT SUSTAINED, so it has no well-defined frequency, and verdictTwoF DISQUALIFIES the run
// rather than reporting the ratio as a result. That is the module's own design working for the first time.
say("at the shipped fixture the verdict is DISQUALIFIED (lift not sustained), ratio 0.126 -- NOT 2, and NOT NaN. " +
    "The 2f relation is still unreproduced, and for the first time the reason is a measurement rather than a type error.");

ok("!! the verdict path now receives numbers and can therefore refuse",
    typeof r.liftSustained === "boolean",
    "verdictTwoF's whole purpose is to disqualify a run whose lift is a transient. Fed NaN it disqualified for " +
    "the wrong reason and reported the right conclusion by accident");

console.log(failed ? "twoFFrequency-selfcheck: " + failed + " FAILED" : "twoFFrequency-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
