// WebGLEngine/simulation/lbm/settleCurve-selfcheck.mjs -- v3343
//
// TWO CLAIMS, AND THEY ARE GRADED DIFFERENTLY ON PURPOSE.
//
// The FIRST is arithmetic and is proved on a SYNTHETIC series where the answer is known by construction: a
// successive-difference test cannot distinguish a settling signal from a settled oscillating one. That needs no
// fluid at all, and building it out of a real run would have made a cheap fact expensive.
//
// The SECOND is physics and is MEASURED: in this rig the oscillation decays monotonically. A short run shows it;
// the full 24,000-step numbers are recorded in the module header and are not re-derived here, because a gate
// that takes two minutes stops being run -- the lesson of the 179-second sweep nobody could run.
import { analyse, settleCurve } from "./settleCurve.mjs";
import { RUNS_V2862 } from "./twoFExperiment.mjs";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

// ---- 1. THE CONFLATION, PROVED WHERE THE TRUTH IS KNOWN BY CONSTRUCTION -------------------------------------
// A signal that has ALREADY SETTLED -- constant mean, constant-amplitude oscillation, nothing changing -- fed to
// a successive-difference test. If that test were measuring settling it would report zero.
const N = 4800, PERIOD = 260;
const settledOscillation = Array.from({ length: N }, (_, i) => 0.09 + 0.0004 * Math.sin(2 * Math.PI * i / PERIOD));
const A = analyse(settledOscillation, 5, 2000);
say("a PERFECTLY settled oscillation (constant mean, constant amplitude) -> naive difference test reports " +
    A.naive.map((d) => d.toExponential(1)).join(", "));

ok("!! *** the naive test reports MOTION in a signal that is not moving ***",
    A.naive.some((d) => d > 1e-6),
    "the mean is constant to the last bit by construction, and the difference between two windows is NOT zero, " +
    "because each window's mean depends on where in the cycle it was cut. THIS IS THE WHOLE ERROR: the test " +
    "answers a question about the CYCLE while being read as an answer about SETTLING");

ok("...and the amplitude measure correctly reports NO decay for the same signal",
    A.monotoneDecay === false && Math.abs(A.amps[0] - A.amps[A.amps.length - 1]) / A.amps[0] < 0.05,
    "the split is only worth anything if BOTH halves are right: the oscillation measure must refuse to see a " +
    "decay that is not there, or it would just be a different way of being fooled");

// A genuinely DECAYING oscillation on a constant mean -- the shape the rig actually shows.
const decaying = Array.from({ length: N }, (_, i) => 0.09 + 0.004 * Math.exp(-i / 1200) * Math.sin(2 * Math.PI * i / PERIOD));
const B = analyse(decaying, 5, 2000);
ok("!! ...and it DOES see a decay that is there", B.monotoneDecay === true,
    "positive and negative both driven, because a detector that fires on everything and one that fires on " +
    "nothing are equally useless and look different only when you try both");

// ---- 2. THE PHYSICS, MEASURED SHORT -------------------------------------------------------------------------
const rec = RUNS_V2862[0];
const t0 = Date.now();
// v3345 -- THE PROBE IS NAMED NOW. This decay is a fact about the INLET, and calling it a fact about the wake
// is what v3343 and v3344 did.
const r = settleCurve({ tau: rec.tau, U: rec.U, D: 12, yOffset: rec.yOffset }, { steps: 8000, sampleEvery: 5, windowSteps: 2000, at: "inlet" });
const wake = settleCurve({ tau: rec.tau, U: rec.U, D: 12, yOffset: 1.5 }, { steps: 6000, sampleEvery: 5, windowSteps: 2000, at: "wake" });
say("8000 steps in " + ((Date.now() - t0) / 1000).toFixed(1) + "s -- amp/mean per window: " +
    r.amps.map((a) => (a * 100).toFixed(3) + "%").join(" -> ") + "   ratios " + r.ratios.map((x) => x.toFixed(2)).join(" "));

ok("!! *** the INLET transient decays -- and this says NOTHING about the wake ***",
    r.monotoneDecay === true && r.amps[0] > r.amps[r.amps.length - 1] * 2,
    "this is what liftSustained=false has been reporting since v2862. FIVE ATTEMPTS AT THE 2f RELATION " +
    "PRESCRIBED MORE WARMUP, and more warmup SHRINKS THE SIGNAL the experiment needs. Over the full 24,000 " +
    "steps it falls 4.639% -> 0.070%, monotone across all twelve windows");

ok("...and the MEAN is steady across the same run while the oscillation is not",
    r.windows.every((w) => Math.abs(w.mean - r.windows[r.windows.length - 1].mean) / r.windows[r.windows.length - 1].mean < 3e-3),
    "TWO OBSERVABLES, OPPOSITE STORIES, and the difference test averaged them into noise. Over the full run " +
    "the mean holds to 1e-4 from 16,000 steps on -- which is LATER than it looks by eye, and the eye was mine");

// *** I ASSERTED THIS AND THE FIXTURE COULD NOT SUPPORT IT. *** The claim -- that the naive test goes
// non-monotone on the real fluid too -- is TRUE over 24,000 steps (1.7e-3, 1.5e-4, 5.6e-5, 1.5e-6, 4.7e-5,
// 5.1e-6, 3.6e-5, 6.1e-5, 2.6e-5, 2.4e-5, 6.6e-7 -- it climbs repeatedly). Over the 8,000 steps this gate can
// afford there are only three differences, all taken while the mean is still genuinely moving, so they fall
// monotonically and the check went red. THE CODE WAS RIGHT AND THE ASSERTION WAS WRONG: a property that needs
// a long run must not be asserted at a short one. Reported here against the recorded numbers instead, and the
// synthetic case above proves the same failure where the truth is known by construction.
say("on the real fluid the naive test is monotone over the first 8,000 steps and NON-monotone over 24,000 -- " +
    "over the short window the mean really is still moving, so the alias is hidden behind a real signal. " +
    "naiveMonotone at this fixture: " + r.naiveMonotone + " (expected true, and it does NOT contradict the " +
    "24,000-step result)");

// *** WHAT THIS DOES NOT CLAIM. *** v2749 measured that CONFINEMENT RAISES THE SHEDDING ONSET -- a confined
// cylinder did not shed by Re~58 against the textbook unconfined ~47. This rig is Re 64.8 at 14.8% blockage, and
// a damped oscillation is what a rig below its confined onset looks like. THAT IS A CANDIDATE, NOT A RESULT:
// establishing it needs an onset sweep at this blockage, which is a different round.
say("NOT CLAIMED: that the rig is below its confined shedding onset. v2749 measured that confinement RAISES " +
    "onset and this rig is Re 64.8 at 14.8% blockage, so it is the obvious candidate -- and naming a candidate " +
    "is not measuring one. An onset sweep at this blockage is the round that would settle it.");

say("SAME RIG, TWO PROBES, OPPOSITE STORIES -- inlet half-ranges fall while the wake at x=" + wake.probe.x +
    " reports growthRatio " + wake.growthRatio.toFixed(4));
ok("!! *** and the WAKE does not decay at all -- at a larger perturbation it GROWS ***",
    wake.growthRatio > 1.1,
    "1.4504 measured. THIS IS THE CHECK THAT WOULD HAVE CAUGHT v3343 AND v3344 ON THE DAY. A wrong probe in a " +
    "working instrument does not look broken -- it looks like an answer, and the inlet's clean monotone decay " +
    "was the most convincing wrong answer available");

console.log(failed ? "settleCurve-selfcheck: " + failed + " FAILED" : "settleCurve-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
