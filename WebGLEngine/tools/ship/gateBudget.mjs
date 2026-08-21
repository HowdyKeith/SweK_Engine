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
// *** v3913 -- RE-PINNED, BECAUSE THE GATE THIS NAMED HAD OUTGROWN THE BUDGET IT DEFINES. ***
// assumptionMap-selfcheck was measured at 47729ms in the v3211 run and stopwatch-measured at 284000ms now --
// SIX TIMES ITS RECORDED VALUE, and TWICE the 143s default derived from it. The constant that sets everyone
// else's budget named a gate that could no longer pass that budget, which is why four gates read as TIMEOUT on
// the rig while three of them were simply being killed.
//
// The re-pin is DERIVED, not chosen: every gate that had crept past the old line moved into the tail below
// (their measurements were already sitting in gate-timings.json), and this now names the slowest gate that is
// genuinely still in the general population. 1019 gates remain under it. THE DEFAULT BARELY MOVES -- 143.2s to
// 139.9s -- which is the point: the general population was never slow, it had eighteen tail gates hiding in it.
//
// The alternative was pinning to the observed worst, observableUnits at 131.9s, which would have made the
// default 396s for all 1019. This file's own header refuses that in advance: raising everything "turns a
// genuinely hung gate into a five-minute stall". TWO POPULATIONS, TWO BUDGETS -- so the fix is to put the tail
// gates in the tail, not to widen the budget for gates that never needed it.
export const SLOWEST_GENERAL = { gate: "tools/roundhouse/flip3dBind-selfcheck.mjs", ms: 46639 };

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
    // *** v3913 -- THE EIGHTEEN THAT HAD CREPT PAST THE GENERAL LINE, PLUS TWO MEASURED THIS ROUND. ***
    // Not one number here is invented: the seventeen below came straight out of gate-timings.json, which is the
    // record of what they ACTUALLY took in a full suite, and the three after them were stopwatch-timed on an
    // otherwise idle box this round. gateBudget-selfcheck had been red for exactly this -- "no gate in the
    // general population has crept past a third of the default" -- and the red was right for four hundred
    // versions while nobody moved the gates it was pointing at.
    "tools/roundhouse/observableUnits-selfcheck.mjs":     131866,
    "physics/thermal/stefan-selfcheck.mjs":               115861,
    "physics/sph/poolFixture-selfcheck.mjs":              103128,
    "tools/roundhouse/detectionMap-selfcheck.mjs":         90448,
    "tools/roundhouse/compose-selfcheck.mjs":              88058,
    "simulation/lbm/settleCurve-selfcheck.mjs":            82639,
    "tools/roundhouse/hydrostatic-selfcheck.mjs":          76003,
    "tools/ship/doorKinds-selfcheck.mjs":                  73762,
    "physics/astroparticle/jeans-selfcheck.mjs":           67863,
    "tools/render-qa/terminatorOracle-selfcheck.mjs":      63310,
    "tools/roundhouse/zeroRangeSweep-selfcheck.mjs":       62594,
    "tools/roundhouse/stabilityBind-selfcheck.mjs":        61987,
    "tools/ship/ddaPrecisionReport-selfcheck.mjs":         60804,
    "physics/sph/tiltPower-selfcheck.mjs":                 59456,
    "physics/sph/wideTilt-selfcheck.mjs":                  57318,
    "physics/mesh/weightScaling-selfcheck.mjs":            50562,
    "tools/ship/loopSearch-selfcheck.mjs":                 49899,
    // MEASURED AT v3913, stopwatch-timed, each run alone:
    // assumptionMap PASSES at 284s. It was the SLOWEST_GENERAL pin at 47729ms and had grown 6x underneath it.
    "tools/roundhouse/assumptionMap-selfcheck.mjs":  284000,
    // *** census FAILS at 717s, AND THAT IS THE FINDING. *** It was reported as TIMEOUT, and a timeout is not a
    // failure -- but it is not a pass either, and here it was hiding a REAL RED for as long as the budget killed
    // it. A gate that cannot finish cannot tell you it is broken. The failure is not fixed here; it is now
    // VISIBLE, which is the prerequisite.
    "tools/roundhouse/census-selfcheck.mjs":         717000,
    // v3917 -- measured at 534s on the run that first made it pass: 66 declared mode plants, two builds each.
    "tools/roundhouse/plantDirection-selfcheck.mjs": 534000,
    // v3924 -- twoFBind was NEVER TIMED AND NEVER BUDGETED, so it silently took the 139.9s general default while
    // taking 249s. It passes when nothing is watching a clock and is killed by the ritual and the rig alike. It
    // is absent from gate-timings.json for the reason that matters: A GATE THAT COULD NOT FINISH LEAVES NO ENTRY,
    // so the record cannot contain the gates it most needs to describe.
    "tools/roundhouse/twoFBind-selfcheck.mjs":       249000,
    // v3924 -- measured to completion at 195s, and it PASSES. Another gate that was never timed, never budgeted,
    // and silently killed at 139.9s by every runner.
    "physics/sph/packingTransfer-selfcheck.mjs":     195000,
    // *** v3924 -- AND THIS ONE IS WHY SLOWEST_GENERAL IS STILL 46.6s. *** Timing the never-timed 55 put
    // materialKnobs at 131.9s into the GENERAL population, and gateBudget-selfcheck immediately said so: the
    // recorded slowest general gate was no longer the slowest anybody had seen. The lever that check invites is
    // to re-pin SLOWEST_GENERAL, which would take the default from 139.9s to 396s FOR EVERY GATE IN THE TREE --
    // six minutes granted to gates that finish in forty milliseconds, and every future regression hidden under
    // it. OF THE 24 NEWLY-TIMED GATES ONLY THIS ONE IS OVER 46.6s; THE NEXT IS 23s. It is the slow tail, not the
    // population, and the tail is what MEASURED is for. Measured to completion, and it PASSES.
    "physics/sph/materialKnobs-selfcheck.mjs":       131900,
    // configContract PASSES at 78s here, against 74400 in the timings -- two independent runs agreeing within a
    // few seconds. IT NEVER NEEDED A BIGGER BUDGET AT ALL: 78s fits inside the 143s default with room, so its
    // TIMEOUT on the rig was not this gate being slow. Recorded anyway because it was over the general line, and
    // the larger of the two readings is used -- a budget derived from the faster of two measurements is a budget
    // that fails on the slower one.
    "tools/roundhouse/configContract-selfcheck.mjs":  78000,
    // *** MEASURED AT v3904 BECAUSE A NEW CHECK TIMED OUT AND THE GATE TURNED OUT TO HAVE BEEN DYING ALL ALONG.
    // 1058s stopwatch-timed on an otherwise idle box, and IT PASSES -- all checks. A contended run earlier the
    // same hour gave 1085s; the SMALLER, cleaner number is recorded here and the larger one is written down
    // rather than averaged in. This gate was never in this table, so it ran against the 143s default, so it was
    // being KILLED IN EVERY FULL SUITE at a seventh of the time it needs. *** A TIMEOUT IS NOT A FAILURE AND IT
    // IS NOT A PASS EITHER -- IT IS THE GATE NEVER HAVING RUN, and gate-timings.json proves this one never has:
    // 1049 timed entries in the shipped record and levelClaim-selfcheck is in NONE of them. Not slow in the
    // record -- ABSENT FROM IT, which is what being killed looks like from the outside and is why no amount of
    // reading the timings would ever have surfaced it. I found it by adding a check and blaming the check, then
    // did the honest thing and ran the PRISTINE file: 1085s, before any edit of mine. The reportLines check
    // added at v3904 costs nothing measurable against an 18-minute fixture -- which is exactly why its live arm
    // is not driven, and why the two numbers here differ by 27s of contention rather than by anything I wrote.
    "physics/sph/levelClaim-selfcheck.mjs":         1058000,
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
    // *** v3924 -- TEN GATES THAT EXCEEDED A 150s CAP AND HAVE NOT YET BEEN MEASURED TO COMPLETION. ***
    //
    // They were found by timing the 55 gates that had NEITHER a recorded time NOR a MEASURED budget -- a
    // population that existed because gate-timings.json CANNOT CONTAIN A GATE THAT DID NOT FINISH. Asked which
    // gates run over the default with no budget, the record answered ZERO, and that zero was a property of the
    // file. twoFBind is 249s and appears nowhere in it.
    //
    // The cap was 150s, just above the 139.9s general default, because that is all it takes to answer "does it
    // fit". IT IS NOT A RUNTIME. A LOWER BOUND IS NOT A MEASUREMENT -- the rule this table was created for --
    // so none of these gets a number in MEASURED until it has been watched to the end. packingTransfer was, and
    // moved out of this list to MEASURED at 195s on the same round, which is what that traffic should look like.
    "physics/sph/stability-selfcheck.mjs":
        "exceeded a 150s cap at v3924; never timed before that. Not measured to completion, so no budget is claimed",
    "tools/roundhouse/corroborationCensus-selfcheck.mjs":
        "exceeded a 150s cap at v3924. A census over the device registry, so it grows with the lab -- the same shape as labResults, whose entry records that it will outrun any number written down",
    "tools/roundhouse/libmSensitivity-selfcheck.mjs":
        "exceeded a 150s cap at v3924; never timed before that. Not measured to completion",
    "tools/roundhouse/plantedCoverage-selfcheck.mjs":
        "exceeded a 150s cap at v3924. It builds two arms of every declared plant across the whole registry, so its cost tracks the plant census rather than any fixture of its own",
    "tools/roundhouse/responseCensus-selfcheck.mjs":
        "exceeded a 150s cap at v3924. Another registry-wide census; cost grows with the device count",
    "tools/roundhouse/sensitivity-selfcheck.mjs":
        "exceeded a 150s cap at v3924; never timed before that. Not measured to completion",
    "tools/roundhouse/valueMatch-selfcheck.mjs":
        "exceeded a 150s cap at v3924; never timed before that. Not measured to completion",
    "tools/ship/orphanTriage-selfcheck.mjs":
        "exceeded a 150s cap at v3924. It walks the whole tree, so its cost is a file count rather than a physics fixture",
    "tools/ship/shaderRefs-selfcheck.mjs":
        "exceeded a 150s cap at v3924. It resolves every shader reference in the tree; cost is a file count",

    // *** v3913 -- claimTrace DID NOT COMPLETE IN THIRTY MINUTES, so there is no measurement to record. ***
    // A LOWER BOUND IS NOT A MEASUREMENT. Every entry in MEASURED above is a real completion; putting a guess
    // beside them would poison the one property that table has. This is the table for "we tried and it did not
    // finish", and it is why the table exists empty rather than not existing.
    //
    // What is known: >= 1800000ms with no output, run alone on an idle box, rc 124 from timeout(1). What is NOT
    // known is whether it would ever finish -- an 1800s bound cannot distinguish a very slow gate from a hung
    // one, and saying which would be a confident answer about unfinished work.
    //
    // THE NEXT STEP IS A SMALLER FIXTURE OR A PROFILE, NOT A BIGGER NUMBER. Three of the four gates that read as
    // TIMEOUT on the rig turned out to be fine once allowed to run; this is the one that is genuinely unresolved,
    // and calling it out separately is the whole point of keeping the two tables apart.
    // *** AND THE GATE CAUGHT ME SMUGGLING A NUMBER IN HERE. *** I first wrote this as
    // { atLeastMs: 1800000, measured: false, note: ... } and gateBudget-selfcheck refused it: the values in this
    // table must be STRINGS. That is not a formatting rule, it is the table's whole point -- a machine-readable
    // atLeastMs is a number something downstream can consume as a budget, which is exactly the fabrication this
    // table exists to refuse. THE BOUND BELONGS IN PROSE, WHERE NOTHING CAN MISTAKE IT FOR A MEASUREMENT.
    "tools/roundhouse/claimTrace-selfcheck.mjs":
        "v3913: did not complete in 1800s, run alone on an idle box, no output at all (rc 124 from timeout(1)). " +
        "That is a LOWER BOUND AND NOT A MEASUREMENT -- it cannot distinguish a very slow gate from a hung one, " +
        "and saying which would be a confident answer about unfinished work. Three of the four gates that read " +
        "as TIMEOUT on the rig turned out to be fine once allowed to run; this is the one that is genuinely " +
        "unresolved. THE NEXT STEP IS A SMALLER FIXTURE OR A PROFILE, NOT A BIGGER NUMBER.",
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
