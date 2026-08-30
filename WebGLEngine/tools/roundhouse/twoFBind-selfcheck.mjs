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
// v4038 -- a deliberately SHORT arm, ~6 s, to pin that shortening the run breaks the key rather than cheapening it
const short900 = await twoFDevice.build({ mode: "inlet", config: { settle: 300, record: 900 } });
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
    "*** v4038 STRUCK WHAT USED TO FOLLOW HERE. It read: 'AND THE COST IS NOT IN THE STEP LOOP: at steps " +
    "2000 the honest run STILL takes 96 s, so shortening the run does not help.' THE OBSERVATION WAS RIGHT " +
    "AND THE CONCLUSION WAS BACKWARDS. It still took 96 s because `steps` WAS READ BY NOBODY -- runTwoF uses " +
    "c.settle and c.record, makeRig spreads { ...DEFAULT_RIG, ...cfg }, and a passed `steps` landed on the " +
    "config object and was never looked at, so steps 2000 and steps 12000 ran the identical 24,000 lattice " +
    "steps. The round that wrote this line MEASURED THE SYMPTOM OF A DEAD KNOB AND RECORDED IT AS A PROPERTY " +
    "OF THE SOLVER. Shortening the run does help, enormously, once you turn something that is read: settle " +
    "300 / record 900 is 6.0 s. ***");

report("AND WHAT DECLARING THE PLANT COSTS THE CENSUS, MEASURED",
    "plantedCoverage --verify now takes 472 s end to end and completes (EXIT 0, 50 of 85). It was already a " +
    ">285 s tool that must be run alone, so the declaration adds to a bill that was already being paid that " +
    "way -- but the number is written down here rather than discovered by whoever next watches it hang.");

console.log("\nv4038. THE DEAD KNOB THAT MADE THIS THE MOST EXPENSIVE DEVICE IN THE LAB");
{
    const cfg = twoFDevice.defaults({ mode: "inlet" }).config;
    ok("!! *** THE FICTIONAL KNOB IS GONE AND THE TWO REAL ONES ARE DECLARED ***",
        !("steps" in cfg) && "settle" in cfg && "record" in cfg &&
        cfg.settle === 6000 && cfg.record === 18000,
        "declares " + Object.keys(cfg).join(", ") + ". `steps` defaulted to 12000 AND NAMED NOTHING -- the run " +
        "is settle 6000 + record 18000 = 24,000 lattice steps, fixed by DEFAULT_RIG, and the declared 12000 " +
        "was neither of those. The new defaults ARE DEFAULT_RIG's own values, so every recorded number in " +
        "this file is unchanged.");

    // *** THE CENSUS COULD NOT HAVE FOUND THIS, AND SAID SO IN ITS OWN NOTE. *** The last full sweep printed
    // "twof: OVER BUDGET at 300000 ms -- probed 1 of 2 declared knobs". The one it never reached was `steps`.
    // A dead knob that makes a device slow, hidden by the device being slow.
    // *** v4162 -- THIS ASSERTED TWO ABSOLUTE MILLISECOND THRESHOLDS AND WENT RED WHEN THE BASELINE MOVED. ***
    // It required costHint(default) > 100000 and costHint(short) < 10000. costHint is `base * (steps/24000)`
    // where base is READ FROM THE FROZEN COST RECORD -- so both numbers move with whatever machine last froze
    // it. This box's record now holds twof.inlet = 212479 ms, not the 115200 the prose below was written
    // against, and 212479/20 = 10623.95 -- SIX PERCENT OVER A CEILING OF 10000, so the check failed on a
    // perfectly good record. The gate's own note already said the same build timed 117.0 s, 205.0 s and
    // 207.7 s under contention, a 1.8x spread; 212 s sits inside that band. IT WROTE DOWN THE REASON IT WOULD
    // FAIL AND THEN ASSERTED AGAINST IT ANYWAY.
    //
    // *** THE CLAIM WAS NEVER ABOUT THE ABSOLUTE COST. *** It is that THE KNOBS MOVE IT -- that is what makes
    // the device schedulable, and it is what the dead `steps` knob at v4038 failed to do. That property is a
    // RATIO, and the ratio is exactly (settle+record) / (300+900) because `base` cancels: 24000/1200 = 20.
    // Machine-independent, baseline-independent, and it fails for the one reason worth failing for -- a knob
    // that stops being read. THE SAME CORRECTION AS v4161's, in a different lab: assert what does not depend
    // on whose stopwatch it was.
    const hintDefault = twoFDevice.costHint({ mode: "inlet" });
    const hintShort = twoFDevice.costHint({ mode: "inlet", config: { settle: 300, record: 900 } });
    const knobRatio = (hintDefault != null && hintShort) ? hintDefault / hintShort : null;
    ok("!! and the real knobs move the cost, which is what makes the device schedulable at all",
        knobRatio !== null && Math.abs(knobRatio - 20) < 1e-6,
        knobRatio === null
            ? "costHint returned null -- THIS BOX HAS NO FROZEN COST RECORD for twof.inlet, which is a " +
              "missing baseline and not a dead knob. Freeze one (SWEK_FREEZE_DEVICE_COST=1) rather than " +
              "loosening this line."
            : "costHint " + Math.round(hintDefault).toLocaleString() + " ms at the default against " +
              Math.round(hintShort).toLocaleString() + " ms at settle 300 / record 900 = " +
              knobRatio.toFixed(2) + "x, against 24000/1200 = 20x BY CONSTRUCTION. *** THE NUMBERS ARE " +
              "PRINTED RATHER THAN REMEMBERED: the old text quoted 115,200 and 5,760, which this record has " +
              "not said since it was re-frozen, so a reader of the FAILING line was told figures nobody " +
              "measured. *** The hint is a SCHEDULING AID and a wrong one can never change a reported " +
              "number; what it must not do is stop responding to the knobs.");
    ok("...and the base it scales is a real frozen measurement, not a guess",
        hintDefault !== null && hintDefault > 0,
        hintDefault === null ? "no record" : "twof.inlet base " + Math.round(hintDefault).toLocaleString() +
        " ms, read from the cost record -- an ABSOLUTE cost stays reportable, it is just not assertable");
    ok("...and `envelope` declares nil, because it runs no lattice at all",
        twoFDevice.costHint({ mode: "envelope" }) === 0,
        "it returns numbers recorded at v2862. A cost hint that charged for a replay would push a free mode " +
        "out of every budgeted sweep.");

    ok("!! *** AND THE LONG RUN IS NOT WASTE: A SHORT ONE REPORTS THE INLET FAILING ***",
        honest.inletDriftFrac < 2e-3 && short900.inletDriftFrac > 5e-3,
        "settle 6000/18000 -> " + honest.inletDriftFrac.toExponential(4) + " (the recorded 1.45e-3); settle " +
        "300/900 -> " + short900.inletDriftFrac.toExponential(4) + ", an order of magnitude worse. *** THE KEY " +
        "IS THAT THE ZOU-HE INLET HOLDS, AND THAT IS A DRIFT MEASURED OVER A LONG RUN. A shortened run does " +
        "not report a cheaper version of this answer, IT REPORTS THE BOUNDARY CONDITION THIS MODULE EXISTS TO " +
        "DEFEND HAVING BROKEN. v2797 guessed longer runs would fix the shedding and v2834 disproved it with " +
        "arithmetic; guessing shorter runs here is the same error pointing the other way. ***");
}

report("WHAT THIS DOES NOT CLAIM",
    "That twoF's negative results are tested. liftSustained is FALSE and dragOverLift has NO VALUE -- not a " +
    "wrong value, no value -- and the plant does not touch either. ONE PLANT TESTS ONE CLAIM.");

console.log("\ntwoFBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
