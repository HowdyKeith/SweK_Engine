// WebGLEngine/tools/ship/gateBudget.mjs -- v3212
//
// HOW LONG IS A GATE ALLOWED TO TAKE, AND WHO SAYS SO.
//
// *** THE 60s BUDGET WAS DERIVED ONCE AND NEVER RE-DERIVED. *** selfchecks.mjs states the rule in its own
// header -- "3x the slowest measured run is the headroom" -- from a slowest measured run of 19.4s. That was
// true when it was written. The lab has since grown roughly four hundred versions of instruments, and when the
// full suite was finally run end to end at v3211 it reported 41 of 597 FAILED, of which THIRTEEN WERE TIMEOUTS
// AND EIGHT OF THOSE PASS GIVEN ROOM.
//
// *** THE SHARPEST ONE IS windTunnel AT 63.3s. IT MISSES THE BUDGET BY THREE SECONDS AND HAS BEEN COUNTED AS A
// FAILING CHECK. *** A TIMEOUT IS NOT A FAILURE (v3076) -- and a budget that has drifted out of date manufactures
// failures wholesale, which is precisely how a suite teaches people to ignore it.
//
// THE SHAPE OF THE SUITE IS WHY A BLANKET RAISE IS THE WRONG ANSWER. Measured across the 556 gates that
// recorded a time in the v3211 run:
//
//     under 1s   473        1-5s   48        5-15s   24        15-30s   3        over 30s   8
//
// FOUR HUNDRED AND SEVENTY-THREE SUB-SECOND GATES AND A TAIL OF ABOUT TWENTY. Raising everything to 300s does
// nothing for 99% of the suite and turns a genuinely hung gate into a five-minute stall. TWO POPULATIONS, TWO
// BUDGETS -- which is this project's most repeated shape (two things wearing one label) pointed at its own
// runner.

/**
 * THE SLOWEST GATE THAT PASSED INSIDE THE OLD BUDGET, measured in the v3211 full-suite run.
 *
 * This is the number the default is DERIVED from, and it is stored rather than folded into the answer so the
 * derivation can be re-checked instead of trusted. gateBudget-selfcheck asserts the default really is 3x this,
 * and that no gate in the general population has crept past a third of it -- WHICH IS THE CHECK THAT WOULD HAVE
 * CAUGHT THE DRIFT THIS FILE EXISTS TO REPAIR, four hundred versions ago.
 */
// *** THE VALUE IS THE MEASUREMENT, NOT A TIDY VERSION OF IT. *** I first typed 47700 because that is what
// "47.7s" reads as, and gateBudget-selfcheck went red comparing it against the 47729 actually recorded. A
// ROUNDED MEASUREMENT IS A DIFFERENT NUMBER FROM THE MEASUREMENT, and the gate caught it on its first honest
// run -- which is the entire argument for checking a derivation against an independent record.
export const SLOWEST_GENERAL = { gate: "tools/roundhouse/assumptionMap-selfcheck.mjs", ms: 47729 };

/** The factor selfchecks.mjs's own header already committed to. Kept as a named constant, not a multiplication. */
export const HEADROOM = 3;

/** 3 x 47.7s. NOT typed: computed, so the two halves cannot drift apart. */
export const DEFAULT_BUDGET_MS = SLOWEST_GENERAL.ms * HEADROOM;

/**
 * THE TAIL, EACH ENTRY CARRYING THE MEASUREMENT IT WAS DERIVED FROM.
 *
 * Every `measuredMs` below is a real completion on an idle box with a 300s ceiling, recorded in the v3211
 * session. A NUMBER WITH ITS MEASUREMENT ATTACHED CAN BE CONTRADICTED BY A RE-MEASURE; a bare number cannot,
 * and that is the whole difference between this table and the constant it replaces.
 *
 * THE HEADROOM HERE IS 2x, NOT 3x, AND THE REASON IS THAT THESE ARE NOT GUESSES. The global 3x absorbs the fact
 * that the general population's slowest member is only approximately known and the machine may be busy. For
 * these twelve the completion time is measured directly, so 2x is ample and it keeps a genuine hang bounded --
 * 3x on a 280s gate would stall a suite for fourteen minutes before admitting anything was wrong.
 */
export const MEASURED = {
    "tools/ship/windTunnel-selfcheck.mjs":            63300,
    "simulation/lbm/inflow-selfcheck.mjs":           111804,
    "tools/ship/sheddingSpectrum-selfcheck.mjs":     120946,
    "tools/roundhouse/thermalScaling-selfcheck.mjs": 232051,
    "tools/roundhouse/labExport-selfcheck.mjs":      241111,
    "tools/roundhouse/pipeFlowKey-selfcheck.mjs":    250473,
    "tools/ship/labDevices-selfcheck.mjs":           253635,
    "tools/roundhouse/rayleighOnset-selfcheck.mjs":  279845,
    // *** MEASURED AT v3213 AND MOVED HERE FROM UNRESOLVED, WHICH IS WHAT THAT TABLE SAID SHOULD HAPPEN. ***
    // 573s on an idle box, and it PASSES. Its own header said ~90s. The antidote fired on its own round: the
    // line below in UNRESOLVED was DELETED, not edited in place.
    "tools/roundhouse/khMichalke-selfcheck.mjs":     572948,
    // *** MEASURED LESS PRECISELY THAN THE REST, AND SAYING SO IS THE POINT. *** It PASSES, but the run that
    // proved it was not stopwatch-timed: the start is known to the second (17:08:26) and the finish only to the
    // minute from the log's mtime, so this is ~690s +/- 30s rather than a figure like khMichalke's 572948.
    // A MEASUREMENT WITH A COARSER METHOD IS STILL A MEASUREMENT, but it is not the same KIND of number and
    // rounding it into the column beside the others would hide that. The 2x headroom swallows the uncertainty.
    "tools/roundhouse/khGrowthKey-selfcheck.mjs":    690000,
    // MEASURED AT v3214, stopwatch-timed: 527s, and it PASSES. Header said ~90s.
    // *** THREE OF THE FOUR "UNRESOLVED" GATES HAVE NOW BEEN MEASURED AND ALL THREE PASS. They were never
    // broken; they were being killed at 60s. The Kelvin-Helmholtz cluster is one fixture cost, not three bugs.
    "tools/roundhouse/khConvergence-selfcheck.mjs":  527111,
    // *** MEASURED 94.3s ON THIS TREE, AND IT TIMED OUT PAST 300s ON PRISTINE v3210 -- A THREE-FOLD
    // DISCREPANCY I AM RECORDING RATHER THAN AVERAGING AWAY. *** Two plausible causes and I have not separated
    // them: the lab-results baseline was re-frozen at v3211/v3212 (a re-freeze does less work than a full
    // comparison against a stale one), and the earlier run shared a box with other measurements. IT RE-RUNS
    // EVERY DEVICE AT EVERY MODE, so it grows with the lab and will outrun any number written down; the 2x
    // headroom on the SMALLER measurement is deliberately the conservative choice, because being killed is a
    // visible failure and a budget nobody notices is not.
    "tools/roundhouse/labResults-selfcheck.mjs":      94282,
    // *** MEASURED AT v3853, STOPWATCH-TIMED ON AN IDLE BOX: 555s, AND IT PASSES. Its own header said
    // "~25s -- MEASURED". *** It spawns every row of reportingTools' REPORTING registry, so it grows
    // with the registry and the 25s was true of a much smaller one. THE COST OF THE MISSING ENTRY WAS
    // NOT SLOWNESS, IT WAS SILENCE: at 143s (the general default) the suite killed it, A TIMEOUT IS NOT
    // A FAILURE and NEVER RUN IS DISTINCT FROM PASS -- so the two real failures it was carrying went
    // unreported for as long as it has been over budget. This is the fourth gate the v3212 table has
    // caught being killed rather than broken.
    //
    // AND THE MEASUREMENT IS OF THE FIXED GATE, WHICH IS THE SMALLER NUMBER: v3853 also stopped section
    // 1 running every tool twice (562s with one run still red, 555s green), so this is not a budget
    // raised to fit a gate that was never trimmed.
    "tools/ship/toolFrontDoor-selfcheck.mjs":        555000,
};

export const TAIL_HEADROOM = 2;

/**
 * *** THE ONES THAT DID NOT FINISH, AND THEY GET NO BUDGET AT ALL. ***
 *
 * These four ran past a 300s ceiling on an idle box and never returned a verdict. I DO NOT KNOW HOW LONG THEY
 * NEED, so writing a number for them would be inventing a measurement -- the same fabrication this project
 * refuses when a claim's config is unknown. They stay on the default and TIME OUT LOUDLY, which is the correct
 * outcome for work nobody has characterised.
 *
 * *** WHEN ONE OF THESE IS MEASURED TO COMPLETION, IT MOVES INTO MEASURED ABOVE AND ITS LINE HERE IS DELETED,
 * NOT EDITED IN PLACE. *** Naming the correct response in advance is the only thing that has reliably stopped a
 * threshold being loosened in this tree.
 */
export const UNRESOLVED = {
};

/**
 * *** THE CEILING IS DERIVED, BECAUSE THE ONE I TYPED LAST ROUND WENT FALSE IN A SINGLE ROUND. ***
 *
 * v3212 clamped the bridge at 900s and justified it as "above the largest budget the table can currently
 * produce (560s)". Then khMichalke was measured at 573s, whose x2 budget is 1146s -- ABOVE THE CEILING MEANT TO
 * SIT ABOVE IT. A number that was true when written and is checked by nothing is exactly the defect the last two
 * rounds have been about, committed in the sentence that described the defect.
 *
 * So the ceiling is now COMPUTED from the table with room to grow, and gateBudget-selfcheck asserts the
 * relationship rather than the number.
 */
export function maxBudgetMs() {
    const biggest = Math.max(DEFAULT_BUDGET_MS, ...Object.values(MEASURED).map((m) => m * TAIL_HEADROOM));
    return Math.ceil(biggest * 1.5 / 60000) * 60000;   // 1.5x the largest, rounded up to a whole minute
}

/** The budget for one gate: its measured allowance if it has one, otherwise the derived default. */
export function budgetFor(rel) {
    const key = String(rel).replace(/\\/g, "/");
    const m = MEASURED[key];
    return m ? m * TAIL_HEADROOM : DEFAULT_BUDGET_MS;
}

/** Why a gate has the budget it has -- so a report can say "measured" rather than leaving a number unexplained. */
export function budgetReason(rel) {
    const key = String(rel).replace(/\\/g, "/");
    if (MEASURED[key]) return "measured " + (MEASURED[key] / 1000).toFixed(1) + "s, x" + TAIL_HEADROOM;
    if (UNRESOLVED[key]) return "UNRESOLVED (no measurement) -- on the default deliberately";
    return "default " + (DEFAULT_BUDGET_MS / 1000).toFixed(0) + "s (" + HEADROOM + "x the slowest general gate)";
}
