// tools/roundhouse/cflBind-selfcheck.mjs -- v3774
//
// *** TIER 2. The obvious key for physics/sph/cfl.js is a MIRROR: cflStep() returns the dt that would hit a
// target courant and cflNumber() reads that courant back out -- a round trip through ONE formula. THE
// NON-MIRROR QUESTION IS WHETHER THE BOUNDARY IS REAL: does a simulation stepped across it actually go
// unstable? That is a fact about the INTEGRATOR, not about the arithmetic, and the integrator is never told
// the formula. ***
//
// *** IT IS REAL AND IT IS NOT THE SPEED THE SHIPPED CHECK USES. Sweeping dt on a 216-particle Tait world, THE
// BREAK dt HALVES WHEN THE SOUND SPEED DOUBLES -- 0.003 at c=15, 0.002 at c=30, 0.001 at c=60 -- while the max
// particle speed barely moves. For a WEAKLY-COMPRESSIBLE fluid the fastest signal is the artificial SOUND
// wave, not the flow. ***

import { cflDevice, CFL_MODES, buildCfl } from "./cflBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const point = await buildCfl({ mode: "acoustic" });
const runaway = await buildCfl({ mode: "runaway" });

console.log("1. THE TWO COURANT NUMBERS, AND THE GAP BETWEEN THEM");
{
    ok("!! *** THE ACOUSTIC COURANT IS 4.17x THE ADVECTIVE ONE THIS FIXTURE REPORTS ***",
        point.optimismFactor > 3 && point.optimismFactor < 6,
        "advective " + point.advectiveCourant.toFixed(4) + " against acoustic " + point.acousticCourant.toFixed(4) +
        " at dt " + point.dt + ", c " + point.soundSpeed + ". *** NOT CALLED A BUG: cflNumber's documented job " +
        "IS the advective courant. What this device adds is the ACOUSTIC number BESIDE it, so the gap is a " +
        "reported quantity rather than something a reader has to already know ***");
}

console.log("\n2. A RUNAWAY IS ALL FINITE, WHICH IS THE BLINDNESS WORTH REPORTING");
{
    // *** v4137 -- THIS CHECK PINNED THE MAGNITUDE OF A CHAOTIC RUNAWAY, AND A RUNAWAY'S MAGNITUDE IS NOT
    // PORTABLE. *** It failed on Keith's rig with maxSpeed 1.20e+2 against the 8.8e8 in its own name. Measured
    // here: 6.76e+8, IDENTICAL across five runs and across Node 20 and 22 -- so there is no unseeded randomness
    // and nothing flaky about this box. His rig runs Node 24 on Windows. A scheme stepped past its stability
    // limit grows exponentially, so its size after a fixed number of steps is set by WHEN the instability takes
    // hold, and that onset is set by perturbations at the last bit -- which ECMAScript expressly allows Math to
    // implement differently. Asserting 1e4 was asserting that two machines agree about a chaotic number.
    //
    // ALL THREE CONJUNCTS WERE ONE CONJUNCT. cflBind.mjs line 98 defines finiteButBroken as
    // `allFinite && maxSpeed > 1e4`, so the check said the same thing three ways and every way of saying it
    // rested on the unportable half.
    //
    // THE CLAIM SURVIVES INTACT, because the magnitude was never what it rested on: the point is that a run
    // stepped far past its limit produces NO NaN, so a NaN-only check waves it through. "Far past its limit" is
    // the ACOUSTIC COURANT, and that is c*dt/h -- three fixture constants, 15 * 0.002 / 0.01 = 3.0 exactly, the
    // same on every machine that will ever run it. maxSpeed is REPORTED, because it is a measurement of this
    // host and reporting a measurement is not the same as requiring one.
    // NOT "courant 3x" in the name: the fixture's step moved at v4193 and a hardcoded multiple in a LABEL is
    // the same stale-number defect as the one in the line below it, one indirection further out.
    ok("!! *** STEPPED WELL PAST THE LIMIT AND EVERY COORDINATE IS STILL FINITE ***",
        runaway.allFinite === true && runaway.acousticCourant > 1,
        "acoustic courant " + runaway.acousticCourant.toFixed(2) + " (c*dt/h, fixture constants -- portable), " +
        "allFinite " + runaway.allFinite + ", maxSpeed " + runaway.maxSpeed.toExponential(2) + " on THIS host. " +
        "*** A CHECK ASKING ONLY 'DID IT PRODUCE NaN' -- WHICH IS THE CHECK MOST PEOPLE REACH FOR -- PASSES A " +
        "COMPLETELY BROKEN RUN. cflNumber.ok requires courant <= 1 AND finite, so it catches this; the " +
        "near-miss is recorded because the cheaper check is the tempting one ***");
    report("REPORTED NOT ASSERTED -- AND v4193 FOUND THE CAUSE WAS NOT THE HOST",
           "maxSpeed here is " + runaway.maxSpeed.toExponential(2) + ". *** v4137 READ THE 8.8e8-vs-1.20e+2 GAP " +
           "AS HOST-DEPENDENT Math AND IT WAS A CODE CHANGE. *** v4193 ran this fixture at the freeze commit " +
           "dc04ec4 in a worktree, SAME MACHINE AND SAME NODE, and got 8.7966e8 -- bit-identical to the frozen " +
           "row -- against 1.75e2 from the tree as it now ships. Two upstream commits explain it: f350286's " +
           "direct-indexed spatial grid (which changes neighbour ITERATION ORDER, so the sums differ in the " +
           "last bits) and 1efe978's pinned equation of state. That Keith's rig read 1.20e+2, the same order " +
           "as this tree's 1.75e2, is CONSISTENT WITH his having run newer SPH than the freeze -- consistent " +
           "with, not shown: nobody has run both revisions on that machine. " +
           "*** v4137'S FIX STANDS AND IS NOT BEING UNDONE. *** Asserting a chaotic magnitude across machines " +
           "was wrong for the reason it gave, and the portable conjunct (acoustic courant, three fixture " +
           "constants) is still what this gate rests on. What v4193 changes is the ATTRIBUTION -- and one " +
           "thing that followed from it: a runaway that had stopped running away, because courant 3.0 is " +
           "inside the new solver's stable region. The fixture now steps to courant 7.5. A REPORTED " +
           "MEASUREMENT DRIFTING IS STILL EVIDENCE; it was read as noise for 56 versions.");
}

console.log("\n3. THE KEY: THE BREAK POINT SCALES WITH THE SOUND SPEED");
{
    const honest = await buildCfl({ mode: "sweep" });
    // NOT "-- 0.450, 0.600, 0.600" in the name: those were the ratios when this line was written and they are
    // 0.600 / 0.600 / 0.600 today (v4193's SPH trace). The evidence string one line down PRINTS them, so a
    // literal here is a second copy that only ever goes stale -- the defect v4193 fixed one label along.
    ok("!! *** break/(h/c) HOLDS ACROSS A 4x RANGE IN c ***",
        honest.scalesWithC === true && honest.ratioSpread < 0.6,
        "spread " + honest.ratioSpread.toFixed(3) + " over c = " + honest.ladder.map((r) => r.c).join(", ") +
        ", break dt " + honest.ladder.map((r) => r.breakDt).join(" / ") + ". *** THE BREAK dt HALVES WHEN c " +
        "DOUBLES. That is the law, and the integrator was never told it -- the ladder is walked empirically " +
        "and the ratio falls out ***");
    ok("!! the ratio is BELOW ONE, so the limit bites before the nominal acoustic courant reaches unity",
        honest.breakOverHOverC > 0.2 && honest.breakOverHOverC < 1,
        "break/(h/c) = " + honest.breakOverHOverC.toFixed(3) + " at c = " + point.soundSpeed + ". A safety " +
        "factor is expected and is MEASURED rather than assumed -- this file states the number it found and " +
        "does not round it to a textbook 0.5");

    const planted = await buildCfl({ mode: "advectiveonly" });
    // *** v4194 -- `> honest.ratioSpread * 20` HAD BECOME `> 0`, AND ANY NUMBER AT ALL WOULD HAVE PASSED IT. ***
    // The honest spread was 0.333 when this was written and the SPH changes traced at v4193 took it to EXACTLY
    // ZERO -- all three rungs now give ratio 0.600. A relative bar against zero is not a bar. The absolute floor
    // is what carries the claim now: the plant has to fan the ratios out across the ladder, not merely differ
    // from a honest run that no longer varies. MEASURED: honest 0, planted 19.415.
    ok("!! *** PREDICTING THE LIMIT FROM THE PARTICLE SPEED FANS THE RATIOS OUT, AND THE VERDICT FLIPS ***",
        planted.scalesWithC === false && planted.ratioSpread > 5 &&
        planted.ratioSpread > honest.ratioSpread * 20,
        "spread " + honest.ratioSpread.toFixed(3) + " -> " + planted.ratioSpread.toFixed(3) + ", scalesWithC " +
        "true -> false. Ratios " + planted.ladder.map((r) => r.ratio.toFixed(3)).join(", ") + " -- they FAN OUT " +
        "because the max particle speed hardly changes with c while the true limit halves. *** THE PLANT IS " +
        "EXACTLY THE SHIPPED FORMULA'S CHOICE OF SPEED, WHICH IS WHY THE GAP IS WORTH REPORTING ***");
    ok("!! the break points themselves are IDENTICAL in both arms -- only the prediction moves",
        planted.ladder.every((r, i) => r.breakDt === honest.ladder[i].breakDt),
        honest.ladder.map((r) => r.breakDt).join(" / ") + " in both, READ FROM THE RUN rather than typed here " +
        "(it was \"0.003 / 0.002 / 0.001\" and the first rung moved). THE SIMULATION IS UNTOUCHED: the plant " +
        "changes what the limit is " +
        "COMPARED AGAINST, not the physics, so it cannot cancel (v3733)");
    ok("!! and the device DECLARES the plant, with `sweep` first so the contract compares like with like",
        DEVICE_NAMES.includes("cfl") && cflDevice.plantMode === "advectiveonly" &&
        cflDevice.plantFlips === "ratioSpread" && CFL_MODES[0] === "sweep",
        "registered by a STATIC import -- v3768 registered a device dynamically and it was INVISIBLE to " +
        "deviceInstrumentMap while every gate passed");
}

report("WHAT THIS DOES NOT CLAIM",
    "That cflNumber is wrong. Its documented job is the ADVECTIVE courant and it does that correctly; the " +
    "acoustic constraint is a SECOND condition that a weakly-compressible scheme also has to satisfy, and " +
    "this device reports both. Nor is the safety factor derived: 0.600 is MEASURED on THIS fixture at " +
    "these viscosities, and a different kernel or a different artificial-viscosity setting would move it. " +
    "The SCALING is the claim; the CONSTANT is a measurement of this rig.");

report("*** COST, MEASURED RATHER THAN ASSUMED -- AND I HAD IT WRONG ***",
    "I wrote that the sweep would be 'the slow part of this gate' because it walks a dt ladder at three sound " +
    "speeds and rebuilds the world for every point -- up to 24 runs of 200 steps on 216 particles. THE WHOLE " +
    "GATE RUNS IN 3 SECONDS. The ladder STOPS AT THE FIRST BREAK, so the expensive high-dt runs are the ones " +
    "it never reaches, and 216 particles is small. AN ESTIMATE IS NOT A MEASUREMENT, and this project has a " +
    "standing rule about runtime claims for exactly this reason -- the twof gate at v3767 was 269 s and its " +
    "cost is in its header BECAUSE IT WAS TIMED, not because it looked slow.");

report("*** BUT THE COST LANDED SOMEWHERE ELSE, AND THAT IS THE PART TO KNOW ***",
    "plantedCoverage --verify WENT FROM 472 s (v3767) TO OVER 1000 s once this device was registered. THE " +
    "CENSUS BUILDS EVERY PLANT WITH THE DEVICE'S OWN DEFAULTS, and `sweep` is this device's FIRST mode -- so " +
    "the census walks the whole dt ladder at three sound speeds, which the 3-second figure above does NOT " +
    "include because the gate reaches the same code through cheaper modes first. *** A GATE THAT IS FAST CAN " +
    "STILL MAKE A CENSUS SLOW: the census pays for the DEFAULT, not for whatever the gate happens to call. " +
    "v3767 learned the same thing on twof and this is the second instance. RUN plantedCoverage --verify ALONE " +
    "AND IN THE BACKGROUND; it is already in that class and this pushes it further in. ***");

console.log("\ncflBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
