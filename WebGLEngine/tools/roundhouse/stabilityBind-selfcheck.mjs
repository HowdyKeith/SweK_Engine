// tools/roundhouse/stabilityBind-selfcheck.mjs -- v3783
//
// *** THE KEY IS A DIRECTION, NOT A VALUE: A CLOSED SYSTEM WITH NO ENERGY INPUT CANNOT GAIN MECHANICAL
// ENERGY. Gravity converts PE to KE and viscosity dissipates; nothing puts any back. So energyRatio -- final
// (KE+PE) over initial -- MUST NOT EXCEED 1, and anything above it is the solver INVENTING energy. An
// INEQUALITY the code is never told, with no tolerance to argue about. ***
//
// *** THE SHIPPED VISCOSITY FAILS IT AND THAT IS NOT NEWS -- it is why viscosityThreshold exists. What is new
// is that the numbers are RE-DERIVED EVERY RUN rather than sitting in MEASURED_V3542 as readings somebody once
// took: visc 0.1 -> 2.734, 0.3 -> 1.550, 0.47 -> 0.775, 0.7 -> 0.692, 1.5 -> 0.346. ***

import { stabilityDevice, STABILITY_MODES, buildStability } from "./stabilityBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildStability({ mode: "response" });
const planted = await buildStability({ mode: "deafknob" });

console.log("1. THE LAW, AS AN INEQUALITY");
{
    const loose = await buildStability({ mode: "direction", config: { visc: 0.1 } });
    const damped = await buildStability({ mode: "direction", config: { visc: 0.7 } });
    ok("!! *** THE SHIPPED VISCOSITY CREATES ENERGY -- RATIO 2.734, NOT A ROUNDING ERROR ***",
        loose.createsEnergy === true && loose.ratio > 2,
        "final (KE+PE) is " + loose.ratio.toFixed(4) + "x the initial at visc 0.1. *** NOTHING PUTS ENERGY IN: " +
        "gravity CONVERTS potential to kinetic and viscosity REMOVES it. A ratio above 1 is energy that came " +
        "from nowhere, which is why this is an inequality and not a tolerance ***");
    ok("!! and enough damping satisfies the law, so the check is not simply always red",
        damped.createsEnergy === false && damped.ratio < 1,
        "visc 0.7 -> " + damped.ratio.toFixed(4) + ". A LAW THAT NOTHING PASSES IS INDISTINGUISHABLE FROM A " +
        "BROKEN CHECK, so both sides are exercised");
}

console.log("\n2. THE RESPONSE, AND THE PLANT THAT KILLS IT");
{
    ok("!! the ratio FALLS as viscosity RISES -- more damping, less energy left",
        honest.monotoneInViscosity === true && honest.respondsToViscosity === true,
        honest.ratioLadder.map((r) => r.visc + ":" + r.ratio.toFixed(3)).join("  ") + ", span " +
        honest.spanAcrossViscosity.toFixed(2) + "x");
    ok("!! *** A KNOB THAT REACHES THE API AND NOT THE SOLVER FLATTENS THE LADDER TO 1.0000x ***",
        planted.respondsToViscosity === false && planted.spanAcrossViscosity < 1.01,
        "every rung reads " + planted.ratioLadder[0].ratio.toFixed(3) + ". *** THIS TREE'S MOST REPEATED UI " +
        "SHAPE -- A CONTROL THAT DOES NOTHING -- IN A PHYSICS SETTING. Nothing throws, every run completes, " +
        "every number is finite, and the ONLY tell is that the answer stopped depending on the input ***");
    ok("!! *** AND monotoneInViscosity STAYS TRUE IN BOTH ARMS, BECAUSE A FLAT SEQUENCE IS TRIVIALLY MONOTONE ***",
        planted.monotoneInViscosity === true && honest.monotoneInViscosity === true,
        "*** THAT IS THE READING WORTH THE ROUND. 'Does the ratio decrease with damping' is satisfied VACUOUSLY " +
        "by a constant, so a check asking only that WOULD PASS A KNOB THAT DOES NOTHING. The span is what " +
        "separates them, and both are reported so the difference is visible in one reading -- the same shape " +
        "as v3781's Kraft sum staying exactly 1 on a tree built backwards ***");
    ok("!! the device DECLARES the plant, with `response` first",
        DEVICE_NAMES.includes("stability") && stabilityDevice.plantMode === "deafknob" &&
        stabilityDevice.plantFlips === "spanAcrossViscosity" && STABILITY_MODES[0] === "response",
        "the flip is the SPAN and not the boolean, because the census wants a finite number that moves -- and " +
        "the span is the quantity the vacuity argument turns on");
}

console.log("\n3. THE MODULE'S OWN FINDING, REPORTED RATHER THAN GRADED");
{
    const loose = await buildStability({ mode: "horizon", config: { visc: 0.1 } });
    const damped = await buildStability({ mode: "horizon", config: { visc: 0.47 } });
    ok("!! *** AT THE SHIPPED VISCOSITY THE RATIO GROWS WITH RUN LENGTH; NEAR THE THRESHOLD IT DOES NOT ***",
        loose.driftsWithHorizon === true && damped.driftsWithHorizon === false,
        "visc 0.1: " + loose.ratioShort.toFixed(4) + " -> " + loose.ratioLong.toFixed(4) + " (drift " +
        (100 * loose.horizonDrift).toFixed(1) + "%). visc 0.47: " + damped.ratioShort.toFixed(4) + " -> " +
        damped.ratioLong.toFixed(4) + " (drift " + (100 * damped.horizonDrift).toFixed(1) + "%). *** A SOLVER " +
        "THAT INVENTS ENERGY INVENTS MORE OF IT THE LONGER IT RUNS; one that dissipates settles. THE DRIFT " +
        "ITSELF DISTINGUISHES THE TWO REGIMES, which a single-horizon reading cannot ***");
}

report("WHY THE THRESHOLD'S VALUE IS NOT GRADED HERE",
    "stability.mjs's own note says it: THE THRESHOLD DOES NOT SURVIVE REFINING THE HORIZON -- the brackets at " +
    "T=1 and T=4 are DISJOINT, and viscosity 0.47 reads 0.7755 / 0.8182 / 1.0631 across T = 1/2/4, CROSSING " +
    "BACK OVER THE BOUNDARY once the run is long enough. A THRESHOLD THAT MOVES WITH RUN LENGTH IS NOT A " +
    "CONSTANT OF THE SOLVER, so this device grades the DIRECTION and the RESPONSE and leaves the number to the " +
    "module that already records how it drifts. Grading it would be pinning a value that is known to move.");

report("*** THIS GATE IS SLOW AND SO IS ITS SUBJECT'S -- MEASURED, NOT ESTIMATED ***",
    "Every check here runs a real SPH world for 1000 steps or more, and the response ladder runs FIVE of them. " +
    "The gate takes ROUGHLY FOUR MINUTES; physics/sph/stability-selfcheck.mjs is comparable. THREE TOOL CALLS " +
    "TIMED OUT AT v3783 BEFORE THE NUMBERS WERE IN. RUN BOTH THE WAY orphanTriage AND toolFrontDoor ARE RUN: " +
    "alone, in the background, never alongside another node process -- the sandbox kills a foreground call at " +
    "~300 s and A TIMEOUT PRINTS NO EXIT CODE, which reads exactly like a gate that never ran. " +
    "*** AND THE CENSUS PAYS FOR THE DEFAULT (v3774's lesson): `response` is this device's FIRST mode and it " +
    "is the five-run ladder, so plantedCoverage --verify carries that cost too. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That the shipped viscosity is wrong. 0.1 is a RENDERING choice -- a lively fluid that looks right -- and " +
    "the energy law is a statement about the SOLVER, not about taste. What the device fixes is that the two " +
    "are now separable: anybody can ask what this setting costs in physical fidelity and get a number back " +
    "instead of an opinion.");

console.log("\nstabilityBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
