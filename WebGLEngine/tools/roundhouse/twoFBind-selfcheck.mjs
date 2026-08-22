// tools/roundhouse/twoFBind-selfcheck.mjs -- v3767
//
// *** THIS DEVICE HAD NO GATE OF ITS OWN, AND ITS KEYS ARE RECORDED MEASUREMENTS RATHER THAN CLOSED FORMS:
// recordedDrift (0.00145) is a number from a real prior run, and FEEDBACK_DRIFT (0.12) is the 12-21% every
// body-force-driven attempt showed before v2835. THAT MAKES IT A REPLAY DEVICE, and a replay device's plant
// has to break the thing being replayed. ***
//
// *** THE PLANT RE-CREATES THE EXACT DEFECT THE MODULE WAS BUILT TO FIX. lbm2d.js says it plainly: ABSENT
// opts.inflow THAT BLOCK NEVER RUNS AND THE SOLVER IS EXACTLY THE PRE-v2835 ONE. v2834 proved by arithmetic
// that a body-force-driven channel cannot hold its Reynolds number, and v2835 built the Zou-He inlet to break
// that loop. THE INVITED REGRESSION IS SOMEBODY SIMPLIFYING THE BOUNDARY CONDITION BACK OUT -- it reads as a
// tidy-up rather than a physics change, which is exactly why it needs a gate rather than a comment. ***

import { twoFDevice, TWOF_OBSERVABLES } from "./twoFBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await twoFDevice.build({ mode: "inlet" });
const planted = await twoFDevice.build({ mode: "nofixedinlet" });

console.log("1. THE FIXED INLET HOLDS, AND THE PLANT TAKES IT AWAY");
{
    ok("!! the honest run reproduces the recorded drift",
        Math.abs(honest.inletDriftFrac - honest.recordedDrift) / honest.recordedDrift < 0.05,
        "measured " + honest.inletDriftFrac.toExponential(4) + " against a recorded " + honest.recordedDrift +
        " -- a REPLAY of a real prior run, not a closed form. That is what this device grades");
    ok("!! *** DROPPING THE ZOU-HE INLET MOVES THE DRIFT BY 7x ***",
        planted.inletDriftFrac > honest.inletDriftFrac * 5,
        honest.inletDriftFrac.toExponential(4) + " -> " + planted.inletDriftFrac.toExponential(4) +
        ", and the improvement over the feedback baseline falls " + honest.driftImprovementVsFeedback.toFixed(2) +
        "x -> " + planted.driftImprovementVsFeedback.toFixed(2) + "x");
    ok("!! it is ONE-SIDED: the recorded numbers never see this lattice",
        planted.recordedDrift === honest.recordedDrift && planted.recordedLift === honest.recordedLift,
        "a plant that moved the record too would cancel and prove nothing (v3733)");
}

console.log("\n2. WHAT THE PLANT REVEALS ABOUT THE DEVICE'S OWN VERDICT");
{
    // *** THE FINDING WORTH MORE THAN THE PLANT. ***
    ok("!! *** `healthy` STAYS TRUE IN BOTH ARMS, SO THE VERDICT DOES NOT NOTICE ***",
        planted.healthy === honest.healthy && honest.healthy === true,
        "true in both. THE OBSERVABLE THAT SAYS 'IS THIS RIG SOUND?' IS UNMOVED BY REMOVING THE BOUNDARY " +
        "CONDITION THE RIG WAS REBUILT AROUND. *** THIS CHECK ASSERTS THE BLINDNESS RATHER THAN HIDING IT: if " +
        "`healthy` is ever tightened to include the drift, THIS LINE GOES RED AND SHOULD BE REWRITTEN TO SAY " +
        "SO, not weakened. A verdict that survives its own subject being deleted is a verdict worth narrowing ***");
    ok("!! and the drift observable DOES notice, which is why the device is not blind overall",
        planted.inletDriftFrac !== honest.inletDriftFrac,
        "the evidence is in inletDriftFrac and driftImprovementVsFeedback -- the gap is that nothing SUMMARISES " +
        "them into the health verdict");
    ok("!! the device DECLARES the plant, with `inlet` first so the contract compares like with like",
        twoFDevice.plantMode === "nofixedinlet" && twoFDevice.plantFlips === "inletDriftFrac" &&
        twoFDevice.plantKind === "mode" && twoFDevice.modes[0] === "inlet",
        "v3762's lesson, applied rather than re-learned for the fifth round running");
}

report("*** AND THE PLANT IS NOT THE ORIGINAL DEFECT, WHICH IS STATED RATHER THAN GLOSSED ***",
    "v2834's regime was a BODY-FORCE-DRIVEN channel drifting 12-21%. Dropping opts.inflow does not restore a " +
    "body force -- it removes the drive ENTIRELY, and the measured 1.02% drift is the flow DECAYING, not the " +
    "Reynolds number breathing. SO THIS PLANT PROVES inletDriftFrac RESPONDS TO LOSING THE INLET; IT DOES NOT " +
    "REPRODUCE THE FEEDBACK LOOP, and calling it that would be claiming a regime nobody re-ran. The 12-21% " +
    "figure remains a recorded historical measurement, not something this gate re-derives.");

report("*** THIS GATE IS SLOW ENOUGH TO NEED RUNNING ALONE -- MEASURED, NOT ESTIMATED ***",
    "Two lattice runs: the honest arm ~95 s and the PLANTED arm ~175 s, because without the inlet the flow " +
    "does not settle and the solver works harder. TOTAL ~270 s, WHICH IS AT THE SANDBOX'S ~300 s FOREGROUND " +
    "LIMIT -- it timed out at 250 s once and passed at 280 s once. RUN IT THE WAY orphanTriage AND " +
    "toolFrontDoor ARE RUN: alone, in the background, never alongside another node process. " +
    "*** AND THE COST IS NOT IN THE STEP LOOP: at steps 2000 the honest run STILL takes 96 s, so shortening " +
    "the run does not help, and the replay cannot be shrunk anyway without breaking the recorded numbers it " +
    "grades against. The separation is actually LARGER at 2000 steps (1.54e-4 -> 1.34e-2, 87x against 7x at " +
    "12000), so the long run is the CONSERVATIVE choice, not the sensitive one. ***");

report("AND WHAT DECLARING THE PLANT COSTS THE CENSUS, MEASURED",
    "plantedCoverage --verify now takes 472 s end to end and completes (EXIT 0, 50 of 85). It was already a " +
    ">285 s tool that must be run alone, so the declaration adds to a bill that was already being paid that " +
    "way -- but the number is written down here rather than discovered by whoever next watches it hang.");

report("WHAT THIS DOES NOT CLAIM",
    "That twoF's negative results are tested. liftSustained is FALSE and dragOverLift has NO VALUE -- not a " +
    "wrong value, no value -- and the plant does not touch either. ONE PLANT TESTS ONE CLAIM.");

console.log("\ntwoFBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
