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
    ok("!! *** STEPPED FAR PAST THE LIMIT THE FIXTURE REACHES 8.8e8 AND EVERY COORDINATE IS STILL FINITE ***",
        runaway.finiteButBroken === true && runaway.allFinite === true && runaway.maxSpeed > 1e4,
        "maxSpeed " + runaway.maxSpeed.toExponential(2) + ", allFinite " + runaway.allFinite + ". *** A CHECK " +
        "ASKING ONLY 'DID IT PRODUCE NaN' -- WHICH IS THE CHECK MOST PEOPLE REACH FOR -- PASSES A COMPLETELY " +
        "BROKEN RUN. cflNumber.ok requires courant <= 1 AND finite, so it catches this; the near-miss is " +
        "recorded because the cheaper check is the tempting one ***");
}

console.log("\n3. THE KEY: THE BREAK POINT SCALES WITH THE SOUND SPEED");
{
    const honest = await buildCfl({ mode: "sweep" });
    ok("!! *** break/(h/c) HOLDS ACROSS A 4x RANGE IN c -- 0.450, 0.600, 0.600 ***",
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
    ok("!! *** PREDICTING THE LIMIT FROM THE PARTICLE SPEED FAILS BY 45x, AND THE VERDICT FLIPS ***",
        planted.scalesWithC === false && planted.ratioSpread > honest.ratioSpread * 20,
        "spread " + honest.ratioSpread.toFixed(3) + " -> " + planted.ratioSpread.toFixed(3) + ", scalesWithC " +
        "true -> false. Ratios " + planted.ladder.map((r) => r.ratio.toFixed(3)).join(", ") + " -- they FAN OUT " +
        "because the max particle speed hardly changes with c while the true limit halves. *** THE PLANT IS " +
        "EXACTLY THE SHIPPED FORMULA'S CHOICE OF SPEED, WHICH IS WHY THE GAP IS WORTH REPORTING ***");
    ok("!! the break points themselves are IDENTICAL in both arms -- only the prediction moves",
        planted.ladder.every((r, i) => r.breakDt === honest.ladder[i].breakDt),
        "0.003 / 0.002 / 0.001 in both. THE SIMULATION IS UNTOUCHED: the plant changes what the limit is " +
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
    "this device reports both. Nor is the safety factor derived: 0.45-0.60 is MEASURED on THIS fixture at " +
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
