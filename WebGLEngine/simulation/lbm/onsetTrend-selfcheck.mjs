// WebGLEngine/simulation/lbm/onsetTrend-selfcheck.mjs -- v3344
//
// THREE CLAIMS, GRADED AT THREE DIFFERENT COSTS ON PURPOSE.
//   1. the CORNER is arithmetic  -> checked against the module's own declared limits, free
//   2. the DETECTOR is arithmetic -> proved on synthetic damped / neutral / growing series, free
//   3. the SWEEP is physics       -> one real point re-run here, the other three read from the record
//
// A gate that re-ran the whole sweep would cost four minutes and stop being run, which is the failure the
// 179-second lab sweep already demonstrates. One point proves the wiring; the record carries the result.
import { SWEEP_V3344, trendFactor, approachesOnset, sweepU } from "./onsetTrend.mjs";
import { RUNS_V2862, reOf, nuOf, STABLE_TAU_FLOOR, VALIDITY_U } from "./twoFExperiment.mjs";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

const r = RUNS_V2862[0], D = 12, NY = 81;

// ---- 1. THE CORNER, FROM THE MODULE'S OWN DECLARED LIMITS ---------------------------------------------------
say("rig run 0: tau=" + r.tau + " (STABLE_TAU_FLOOR=" + STABLE_TAU_FLOOR + "), U=" + r.U + " (VALIDITY_U=" +
    VALIDITY_U + "), D=" + D + ", blockage " + (D / NY * 100).toFixed(2) + "%, Re " + reOf(r.U, D, r.tau).toFixed(1));

ok("!! *** tau is AT the declared stability floor -- that knob has no room ***",
    r.tau <= STABLE_TAU_FLOOR + 1e-12,
    "and going below it is what diverged at Re 120, which is why the floor exists");

ok("!! *** raising U to its validity ceiling buys 11% of Reynolds and nothing more ***",
    Math.abs(reOf(VALIDITY_U, D, r.tau) / reOf(r.U, D, r.tau) - 1.111) < 0.01,
    "Re " + reOf(r.U, D, r.tau).toFixed(1) + " -> " + reOf(VALIDITY_U, D, r.tau).toFixed(1) + ". THE SWEEP " +
    "COVERS THE ENTIRE ACCESSIBLE WINDOW AT THIS BLOCKAGE, not a sample of it");

ok("!! *** and the only knob with headroom RAISES THE ONSET IT IS CHASING ***",
    reOf(r.U, 20, r.tau) > reOf(r.U, D, r.tau) && 20 / NY > D / NY,
    "D 12 -> 20 takes Re 64.8 -> 108.0 and blockage 14.8% -> 24.7%, and v2749 measured that CONFINEMENT RAISES " +
    "ONSET. Every route to a higher Reynolds number moves the target with it");

// ---- 2. THE DETECTOR, ON SERIES WHOSE ANSWER IS KNOWN BY CONSTRUCTION ---------------------------------------
const damped = [4.0, 2.0, 1.0, 0.5], neutral = [2.0, 2.0, 2.0, 2.0], growing = [0.5, 1.0, 2.0, 4.0];
say("trendFactor -- damped " + trendFactor(damped).toFixed(4) + ", neutral " + trendFactor(neutral).toFixed(4) +
    ", growing " + trendFactor(growing).toFixed(4));

ok("!! the trend factor separates damping, neutrality and growth",
    trendFactor(damped) < 1 && Math.abs(trendFactor(neutral) - 1) < 1e-12 && trendFactor(growing) > 1,
    "1.0 EXACTLY is the bifurcation: a perturbation that neither grows nor dies. The factor is the distance " +
    "from it AND the side, which one number can carry and a threshold cannot");

ok("...and approachesOnset reads the DIRECTION, not just the sign",
    approachesOnset([{ re: 1, factor: 0.4 }, { re: 2, factor: 0.6 }, { re: 3, factor: 0.9 }]).weakensWithRe === true &&
    approachesOnset([{ re: 1, factor: 0.9 }, { re: 2, factor: 0.6 }, { re: 3, factor: 0.4 }]).strengthensWithRe === true,
    "damping toward 1.0 as Re rises IS the approach to an onset; damping away from it is the opposite, and a " +
    "detector that only reported 'still damped' could not tell those apart");

// ---- 3. THE RESULT ------------------------------------------------------------------------------------------
const a = approachesOnset(SWEEP_V3344);
say("recorded sweep factors by rising Re: " + a.factors.map((x) => x.toFixed(4)).join(" -> "));

// v3345 -- THE TREND IS REAL AND IT IS A TREND IN THE WRONG QUANTITY. These are INLET-probe numbers, so they
// describe how fast the DRIVE settles, not whether the wake is stable. The check is kept -- the arithmetic did
// happen -- and RENAMED so nothing reads it as an onset result.
ok("!! the recorded INLET-probe trend strengthens with Reynolds (WITHDRAWN as an onset claim, v3345)",
    a.strengthensWithRe === true && a.weakensWithRe === false && a.anyGrowth === false,
    "0.5306 -> 0.5175 -> 0.5020 -> 0.4570 across Re 57.6 to 72.0 -- MEASURED ONE CELL FROM A PINNED INLET, " +
    "sixty-nine cells upstream of the body. At the WAKE probe the same rig reports 0.9908 at yOffset 0 and " +
    "1.4504 at yOffset 1.5 -- FLAT, THEN GROWING, which is the signature of being ABOVE onset. The closure " +
    "this file drew is withdrawn; the corner and the shedOnset observation above are not");

// One real point, to prove the recorded numbers came from this code path and not from a paragraph.
const t0 = Date.now();
const live = sweepU({ tau: r.tau, yOffset: r.yOffset }, [0.100], { steps: 8000, D });
say("one live point re-run in " + ((Date.now() - t0) / 1000).toFixed(0) + "s: U=0.100 factor " +
    live[0].factor.toFixed(4) + " against the recorded " + SWEEP_V3344[3].factor);

ok("!! the recorded sweep reproduces from this code path",
    Math.abs(live[0].factor - SWEEP_V3344[3].factor) < 0.01 && live[0].factor < 1,
    "a table of numbers in a header that nothing regenerates is a story. This re-derives the endpoint -- the " +
    "one that carries the conclusion -- and leaves the other three to the record");

say("NOT CLAIMED: WHY the damping strengthens. The Zou-He inlet PINS a parabolic profile, so a stronger drive " +
    "may re-impose it faster than the yOffset perturbation can break symmetry -- meaning the boundary condition " +
    "v2835 built to kill the feedback loop might also be suppressing the instability. Testing that means " +
    "varying the PERTURBATION rather than the drive, and it is a different round.");

console.log(failed ? "onsetTrend-selfcheck: " + failed + " FAILED" : "onsetTrend-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
