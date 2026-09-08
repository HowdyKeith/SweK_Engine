// WebGLEngine/tools/ship/sweepCoverage.mjs
//
// v4408 -- *** ONCE OVER BUDGET, NEVER RE-TIMED, THEREFORE OVER BUDGET FOREVER. ***
//
// The quick sweep (v4303) runs every gate under 3,000 ms at ship time and skips the rest. It is honest about
// being quick and the full two-phase sweep covers the remainder -- but the full sweep runs when somebody
// decides to run it, and v4406 found orreryFleet-selfcheck had been red for eight rounds inside that gap.
//
// THE GAP IS NOT THE FINDING. THE MECHANISM IS. tools/ship/sweep-timings.json carries ONE `captured` date for
// all 1,440 entries, and the run rewrites only the entries it ran. So 502 readings are stamped with a capture
// they were not part of -- and the budget decision is made FROM those readings. A gate that got faster is
// never re-measured, so it is never re-included. The exclusion is a one-way door, and it swings on a number
// whose age the file cannot state.
//
// That is item 1's defect at a different site: A STORED PROJECTION WHOSE PROVENANCE IS A SINGLE FROZEN FIELD.
// The register kept a quoted failing line under one `at:`; this keeps 1,440 timings under one `captured:`.
//
// FOUR BUCKETS AND NOT TWO, for v4401's reason -- one bucket for several species sends different work to the
// same place:
//   under  -- run at ship time. Nothing to do.
//   over   -- finished under the cap, above the budget. RE-TIMEABLE, and the rotation is for exactly these.
//   killed -- hit the 20 s cap. ITS EXIT CODE IS NOT A VERDICT (v4392's rule) and it cannot be re-timed by a
//             runner that would kill it again; it needs the full sweep's longer cap. 130 entries sit here.
//   never  -- no reading at all. A NEW gate, which the sweep measures on its next run. Distinguishing this
//             from `over` matters: an absence read as a skip is an absence read as a pass.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BUDGET_MS = 3000;
export const CAP_MS = 20000;
export const UNKNOWN_AT = "unknown -- before v4408";

export function classify(ms, { budgetMs = BUDGET_MS, capMs = CAP_MS } = {}) {
    if (ms === null || ms === undefined) return "never";
    if (ms >= capMs) return "killed";
    if (ms > budgetMs) return "over";
    return "under";
}

// gates: the enumerated tree. timings/codes/at: the file's three maps. Returns a PARTITION -- the four buckets
// sum to the tree, and `ghosts` (entries naming no gate) are reported separately rather than folded in, because
// a stale entry is a different problem from a stale reading and v4406 found one of each.
export function census(gates, { timings = {}, codes = {}, at = {} } = {}, opts = {}) {
    const set = new Set(gates);
    const buckets = { under: [], over: [], killed: [], never: [] };
    for (const g of gates) buckets[classify(timings[g], opts)].push(g);
    const ghosts = Object.keys(timings).filter((k) => !set.has(k));
    const sum = buckets.under.length + buckets.over.length + buckets.killed.length + buckets.never.length;
    return { ...buckets, ghosts, enumerated: gates.length, sum, partitions: sum === gates.length,
             ageOf: (g) => at[g] || UNKNOWN_AT, codeOf: (g) => codes[g], msOf: (g) => timings[g] };
}

// *** A KILLED PROCESS'S NONZERO CODE IS NOT A RED. *** 130 of the 143 nonzero over-budget entries hit the cap,
// and reading them as failures would report a red tree from a file that only says "this did not finish".
export function standingReds(c, { codes = {} } = {}) {
    return c.over.filter((g) => codes[g] !== 0 && codes[g] !== undefined);
}
export function notVerdicts(c, { codes = {} } = {}) {
    return c.killed.filter((g) => codes[g] !== 0 && codes[g] !== undefined);
}

// *** v4460 -- standingReds HAD NO MIRROR, AND THE MIRROR IS WHERE THE TREE'S RED GATES WERE HIDING. ***
//
// The comment above standingReds is careful in one direction: a nonzero code beside a killed process is not a
// failure. NOBODY ASKED THE OTHER DIRECTION. A ZERO beside an over-budget reading is not a pass either -- it
// is the exit status the gate had THE LAST TIME IT WAS CHEAP ENOUGH TO RUN, carried forward untouched by
// every sweep since (quickSweep.mjs writes `codes[r.gate]` only for gates in `rows`). Once a gate crosses the
// budget its verdict freezes, and the file goes on reporting it.
//
// MEASURED AT v4460, and see STALE_GREENS_V4460 for the whole table: 371 over-budget entries carry code 0,
// 360 of them stamped UNKNOWN_AT. Run one at a time, TWENTY-TWO ARE RED -- eighteen in no register at all.
//
// *** AND TWELVE OF THE TWENTY-TWO NOW FINISH UNDER THE 3,000 ms BUDGET. *** So v4408's one-way door and this
// stale verdict are the same defect seen twice: the door is shut on a time the gate no longer has, and what
// it shuts in is a green nobody has re-observed. box3dFilter is recorded at 3,763 ms and runs in 89.
export function standingGreens(c, { codes = {} } = {}) {
    return c.over.filter((g) => codes[g] === 0);
}

// A verdict whose age the file cannot state. `at` was made per-entry at v4408 and used only for the
// MILLISECONDS; the exit code sitting beside it has the same provenance and nothing ever paired them.
export function undatedVerdicts(c, { codes = {}, at = {} } = {}) {
    return c.over.filter((g) => codes[g] !== undefined && (at[g] || UNKNOWN_AT) === UNKNOWN_AT);
}

// The three verdict classes over `over`, as a PARTITION -- v4401's rule applied to codes rather than to
// times. An entry with no code at all is its own class, because "never observed" and "observed green" are
// the two things this file spent a round proving are different.
export function verdictClasses(c, { codes = {} } = {}) {
    const green = [], red = [], none = [];
    for (const g of c.over) (codes[g] === undefined ? none : codes[g] === 0 ? green : red).push(g);
    return { green, red, none, sum: green.length + red.length + none.length, partitions: green.length + red.length + none.length === c.over.length };
}

// *** THE MEASUREMENT, FROZEN BY NAME (v4399's rule), BECAUSE A GATE CANNOT AFFORD TO RE-TAKE IT. ***
// Every number below was taken by running the gate in its own process with a wall clock around it.
/**
 * *** v4476 -- THE TWELVE, RETURNED. *** STALE_GREENS_V4460's `returnable` row was built to go red the day
 * somebody fixed it: "the recorded time is checked against the live file here, so a re-timing that fixes it
 * FAILS THIS ROW rather than leaving a record nobody re-derives." This is that day, and this is the record.
 *
 * Eleven of the twelve were re-timed by hand and their rows in sweep-timings.json now carry what they cost.
 * The twelfth is named rather than quietly dropped: crossBackend was recorded at 13,851 ms, main measured it
 * at 376, and it runs at 12,851 ms HERE -- genuinely over the 3,000 ms budget on this box, so it stays out
 * and its number is at least true now. A disagreement that large between two boxes is worth stating and is
 * not resolved here.
 *
 * *** AND THE RE-TIMING PUT FOUR REDS BACK IN THE SWEEP'S SIGHT, WHICH IS THE POINT. *** A stale green over
 * an evicting time hides a red twice over. box3dFilter was already on RED_AT_V4408; physicsReach and wgslSpec
 * are the two debts budgetExile recorded as OWED at v4472 with reasons, now visible instead of hidden; and
 * sweepBudget and corpusFilters were REPAIRED in this round rather than registered -- sweepBudget by
 * restoring the 4.79 hours of device measurement a v4420 re-freeze had overwritten with {}, and corpusFilters
 * by asserting its shortfall from the whole census instead of grepping a windowed table for a spelling.
 */
// v4529 -- A RETURNEE THAT MEASURES OVER THE BUDGET ON THIS BOX, NAMED WITH ITS READINGS. The v4528 quick sweep recorded
// meshLine, traderGraph and policyPilot over budget under 8-way parallel load ("3 dropped from budget"), and the
// sweepCoverage gate named the file's own instrument as the lost one; re-timed SERIALLY with sweepRotation's runSlice,
// policyPilot (2,617 ms) and traderGraph (2,933) came back under, and meshLine did not: 3,083 / 3,073 / 3,154 ms alone,
// three runs, 2,929 at v4476. It is over by a few percent of the budget, not by a factor, and the honest record is the
// reading and the box rather than a number rounded down to fit.
/**
 * *** v4535 -- BOTH ENTRIES RETURNED, AND THE RECORD SAID IN ADVANCE WHAT WOULD RETIRE THEM. ***
 *
 * meshLine's entry: "a sweep that finds it under returns it by the row's other branch." It has been found
 * under, three times serially on a quiet box, and so has traderGraph. The readings, against the five and three
 * serial samples that put each on this list:
 *
 *     meshLine      over at v4529/v4530: 3083 / 3073 / 3154        under now: 2515 / 2480 / 2757
 *     traderGraph   over at v4529/v4530: 2933 3083 2719 3123 3152  under now: 2729 / 2344 / 2659
 *
 * *** THE STRADDLE WAS NEVER A PROPERTY OF EITHER GATE. *** Eight straddlers were named across v4529, v4531
 * and v4533 -- these two and the six in ROTATION_BOUNDARY_RETIRED_V4535 -- each with serial evidence, each
 * filed as "this gate genuinely sits just over on this box", and ALL EIGHT come back under on a quiet one.
 * Eight independent gates do not improve by 15-30% in the same week; ONE BOX GOT QUIETER. The measurement was
 * honest every time and the attribution was wrong every time, which is the difference between a reading and a
 * conclusion -- and the only reason it could be caught is that every entry carried its gate name and its
 * numbers, so eight claims could be re-run in ninety seconds.
 */
export const RETURNED_AT_V4529 = Object.freeze({
    at: "v4529",
    // *** v4536 -- meshLine WAS RETIRED THIS MORNING AND IS BACK BY THE EVENING, WHICH IS THE ENTRY. *** Its
    // v4535 retirement was honest -- three serial readings under budget on a quiet box, 2515/2480/2757 -- and
    // the ship sweep hours later wrote 3,014 for the same unchanged file. A record that flips a gate on and off
    // a roll every time the machine's load changes is recording the machine, so the roll keeps it with BOTH
    // sets of numbers rather than picking whichever half was measured most recently.
    stillOver: Object.freeze([
        Object.freeze({ gate: "tools/ship/meshLine-selfcheck.mjs", recordedWas: 4404, v4476Ms: 2929, hereMs: 3014,
            quietMs: Object.freeze([2515, 2480, 2757]),
            why: "straddles the 3,000 ms budget, and which side it lands on is a fact about the hour: 3,083 / " +
                 "3,073 / 3,154 ms at v4529, then 2,515 / 2,480 / 2,757 ms serially on a quiet box at v4535, " +
                 "then 3,014 ms from the v4536 ship sweep -- one file, unchanged throughout. Retiring it on the " +
                 "quiet readings was right on the evidence available and wrong within a day, so it is recorded " +
                 "here with both rather than moved a third time." }),
        // *** AND traderGraph, THE SECOND OF THE TWO RETIRED AT v4536, BACK BY THE SAME ROUTE TWO DAYS LATER. ***
        // Both gates retired that day have now returned to this roll, which is the clearest statement yet that
        // the roll is tracking the machine: 3,096 / 2,460 / 2,631 ms across three serial runs TAKEN TOGETHER --
        // a 26% spread within one minute on one unchanged file, straddling the budget inside a single sample.
        Object.freeze({ gate: "tools/ship/traderGraph-selfcheck.mjs", recordedWas: 3368, v4461Ms: 2793, hereMs: 3008,
            quietMs: Object.freeze([2729, 2344, 2659]),
            why: "straddles the 3,000 ms budget and cannot be pinned either side of it: 2,933 / 3,083 / 2,719 / " +
                 "3,123 / 3,152 ms at v4529, 2,729 / 2,344 / 2,659 quiet at v4536, 3,008 from the v4538 sweep, " +
                 "and 3,096 / 2,460 / 2,631 serially straight after -- a 26% spread inside ONE minute. Retiring " +
                 "it on the quiet readings was right on the evidence and wrong within two days, exactly as " +
                 "meshLine was, so it is recorded with both rather than moved a third time." }),
        // *** v4541 -- TWO MORE, AND THESE ARE NOT STRADDLERS: THEY ARE GENUINELY SLOW AND GENUINELY FASTER. ***
        // Both were v4460 returnees recorded at the time that evicted them, both have since been re-timed, and
        // both improved a lot without reaching the budget -- which is the third state this roll exists for and
        // the one that is easiest to confuse with the oscillation above. Three serial runs each, on the same
        // loaded box that took 403 s over a sweep it usually finishes in 220:
        Object.freeze({ gate: "tools/roundhouse/sweepBudget-selfcheck.mjs", recordedWas: 5526, hereMs: 3172,
            serialMs: Object.freeze([3165, 3266, 3273]),
            why: "re-timed from the 5,526 ms that evicted it to about 3,200 -- a 42% improvement that still does " +
                 "not clear 3,000. Every one of three serial runs is over, none of them marginally, so this is " +
                 "not the box: it is a gate that got much faster and is still too slow." }),
        Object.freeze({ gate: "tools/ship/wgslSpec-selfcheck.mjs", recordedWas: 5162, hereMs: 4242,
            serialMs: Object.freeze([3922, 3658, 3906]),
            why: "re-timed from 5,162 ms to 3,658-3,922 across three serial runs -- 27% faster and 22% over the " +
                 "budget. The widest margin on this roll, and the least ambiguous: no reading of it has ever " +
                 "been under 3,000." }),
    ]),
    returnedAt_v4535: Object.freeze([
        Object.freeze({ gate: "tools/ship/traderGraph-selfcheck.mjs", overMs: 3152,
            serialNow: Object.freeze([2729, 2344, 2659]),
            why: "named still-over at v4529/v4530 on five serial readings spanning 2,719 to 3,152 ms -- itself " +
                 "a straddle wide enough to have been the answer -- and re-measured at v4535 at 2,729 / 2,344 / " +
                 "2,659 ms with the timings file at 2,726. Under on every sample of the later run." }),
    ]),
});

export const RETURNED_AT_V4476 = Object.freeze({
    at: "v4476",
    ofTwelve: 12,
    reTimed: 11,
    stillOver: Object.freeze([
        Object.freeze({ gate: "tools/ship/crossBackend-selfcheck.mjs", recordedWas: 13851, mainMeasured: 376,
            hereMs: 12851, why: "over the 3,000 ms budget on this box by a factor of four. Main's 376 ms and " +
            "this 12,851 ms are two boxes disagreeing by 34x on one gate, which is a finding of its own and " +
            "is recorded rather than averaged away." }),
    ]),
    repairedHere: Object.freeze({
        "tools/roundhouse/sweepBudget-selfcheck.mjs":
            "every row read 0 -- 0 measured, 0.00 h across 0 devices -- because tools/roundhouse/" +
            "device-cost-baseline.json held entries: 0 and three empty maps. v4420 RE-FROZE IT AND CAPTURED " +
            "NOTHING: 484 entries and 116 sweep costs, 4.79 hours of device measurement, replaced with {} in a " +
            "round about comparing predicates whose message never mentions the file. Restored from 740dd6f^ -- " +
            "the exact bytes, not a reconstruction -- and the gate's own prose corroborates them to two " +
            "decimals: it claims 4.79 hours and the restored record sums to 4.79 hours across 116 devices.",
        "tools/ship/corpusFilters-selfcheck.mjs":
            "its row grepped the report for \"MISSES\", a spelling only the TOP-TWELVE table emits, so it " +
            "asserted that a narrow group happens to RANK in that window. The tree grew, the narrow groups " +
            "fell out of it, and the row went red WHILE THE SHORTFALL WAS STILL THERE -- six pure-extension " +
            "groups narrower than SOURCE_EXT, the largest missing 456 html files across 41 tools. It asserts " +
            "the shortfall from the whole census now, where it cannot fall out of a window.",
    }),
    reds: Object.freeze({
        "tools/ship/box3dFilter-selfcheck.mjs": "already on redCensus.RED_AT_V4408 -- visible, not hidden",
        "tools/ship/physicsReach-selfcheck.mjs": "budgetExile's OWED at v4472: a door for seven WGSL modules under physics/render/, which is a round",
        "tools/ship/wgslSpec-selfcheck.mjs": "budgetExile's OWED at v4472: requiredLimits at device creation, an engine decision",
    }),
    notClaimed: "that the other ten of the twenty-two reds are fixed. This round returned the twelve that " +
                "FINISH under budget; the rest are over it for real and are a separate question.",
});

export const STALE_GREENS_V4460 = Object.freeze({
    at: "v4460",
    population: 371,          // over-budget entries carrying code 0
    undated: 360,             // ...of which stamped UNKNOWN_AT: a green whose age the file cannot state
    // *** THE FIRST PASS WAS 8-WAY PARALLEL AND IT WAS THE WRONG INSTRUMENT, WHICH quickSweep ALREADY SAYS
    // IN ITS OWN GATE: "a parallel FAILURE on its own is `unconfirmed`, not `red`". I ran it anyway, and then
    // ran it a SECOND time by accident -- and the two passes of the same 371 gates disagreed on FIVE. ***
    parallelPassA: Object.freeze({ green: 333, nonGreen: 38 }),
    parallelPassB: Object.freeze({ green: 328, nonGreen: 43, exit1: 27, killedAt45s: 16 }),
    passesDisagreeOn: 5,
    // The serial re-run is the verdict. Every one of pass B's 43 finished inside 150 s.
    serial: Object.freeze({ ofParallelNonGreen: 43, greenAlone: 21, redAlone: 22, unresolved: 0 }),
    falseRedRate: "21 of 43 -- 49% of an 8-way parallel pass's non-greens were the parallelism",
    // What the 22 actually are, because "22 red gates" is a headline and the split is the fact.
    confirmed: Object.freeze({ total: 22, realAssertion: 17, needsGpuAbsentHere: 3, networkDependent: 2,
                              unregistered: 18, nowUnderBudget: 12 }),
    unregistered: Object.freeze([
        "gfx/frontDoor-selfcheck.mjs", "tools/mutate/shadowedDefaults-selfcheck.mjs",
        "tools/roundhouse/sweepBudget-selfcheck.mjs", "tools/ship/citedSources-selfcheck.mjs",
        "tools/ship/corpusFilters-selfcheck.mjs", "tools/ship/gateReport-selfcheck.mjs",
        "tools/ship/gitEconomy-selfcheck.mjs", "tools/ship/headlessGpu-selfcheck.mjs",
        "tools/ship/meshLine-selfcheck.mjs", "tools/ship/orreryFleet-selfcheck.mjs",
        "tools/ship/orreryPost-selfcheck.mjs", "tools/ship/orreryReached-selfcheck.mjs",
        "tools/ship/physicsReach-selfcheck.mjs", "tools/ship/quickSweep-selfcheck.mjs",
        "tools/ship/releasePanelRoute-selfcheck.mjs", "tools/ship/traderGraph-selfcheck.mjs",
        "tools/ship/wgslSpec-selfcheck.mjs", "tools/ship/windowsImport-selfcheck.mjs",
    ]),
    // The door and the verdict are the same defect: excluded by a time they no longer have.
    returnable: Object.freeze([
        Object.freeze({ gate: "tools/ship/box3dFilter-selfcheck.mjs", nowMs: 89, recordedMs: 3763 }),
        Object.freeze({ gate: "tools/ship/headlessGpu-selfcheck.mjs", nowMs: 107, recordedMs: 4518 }),
        Object.freeze({ gate: "tools/roundhouse/sweepBudget-selfcheck.mjs", nowMs: 316, recordedMs: 5526 }),
        Object.freeze({ gate: "tools/ship/crossBackend-selfcheck.mjs", nowMs: 376, recordedMs: 13851 }),
        Object.freeze({ gate: "tools/ship/physicsReach-selfcheck.mjs", nowMs: 537, recordedMs: 3143 }),
        Object.freeze({ gate: "tools/ship/windowsImport-selfcheck.mjs", nowMs: 629, recordedMs: 3089 }),
        Object.freeze({ gate: "tools/ship/citedSources-selfcheck.mjs", nowMs: 979, recordedMs: 3103 }),
        Object.freeze({ gate: "tools/ship/corpusFilters-selfcheck.mjs", nowMs: 1244, recordedMs: 3141 }),
        Object.freeze({ gate: "tools/ship/traderGraph-selfcheck.mjs", nowMs: 1677, recordedMs: 3368 }),
        Object.freeze({ gate: "tools/ship/orreryEjecta-selfcheck.mjs", nowMs: 1717, recordedMs: 3314 }),
        Object.freeze({ gate: "tools/ship/wgslSpec-selfcheck.mjs", nowMs: 2618, recordedMs: 5162 }),
        Object.freeze({ gate: "tools/ship/meshLine-selfcheck.mjs", nowMs: 2929, recordedMs: 4404 }),
    ]),
    // *** REPAIRED SINCE, NAMED RATHER THAN QUIETLY REMOVED FROM THE LIST ABOVE. *** The census stays as it
    // was measured at v4460 -- a snapshot edited to agree with today is not a snapshot -- and what has been
    // fixed since is recorded beside it. AND FIXING ONE DOES NOT MAKE IT VISIBLE: quickSweep-selfcheck still
    // costs about six seconds, still sits above the 3,000 ms ship-time budget, and is still run by no
    // ship-time step, so its NEXT regression is invisible exactly as this one was. The repair is to the gate,
    // not to the hole it was hiding in.
    fixedSince: Object.freeze([
        Object.freeze({ gate: "tools/ship/quickSweep-selfcheck.mjs", at: "v4461",
            was: "its section 4 named three live gates and asserted all three GREEN -- a claim about the " +
                 "tree, in the block whose stated purpose is proving the runner runs. Two had gone red.",
            now: "the positive case is hermetic (synthetic gates in a temp root) and the live run is graded " +
                 "on AGREEMENT with each gate taken alone, so it passes on a red tree and fails on a wrong " +
                 "runner -- which is the way round it was not",
            stillOverBudget: true }),
    ]),
    // *** v4461 RETURNED SIX OF THE TWELVE, AND THE ROW BELOW FIRED WHEN THEY MOVED -- WHICH IS WHAT IT WAS
    // BUILT FOR. *** v4460 wrote: "the recorded time is checked against the live file here, so a re-timing
    // that fixes it fails this row rather than leaving a record nobody re-derives." The repair rotation
    // re-timed six, their recorded times stopped matching, and the gate said so on the next run. The
    // measurement stays as taken; what changed is named here, and FIVE OF THE SIX ARE RED AND UNREGISTERED,
    // so returning them makes the next ship report new reds. That is the instrument working, not a
    // regression: they were red the whole time and nothing could see them.
    // `nowMs` is the reading AT THE MOMENT OF RETURN, kept as evidence rather than as a target -- the gate
    // checks these against the BUDGET, because a re-timed gate gets a new number every run.
    returnedAt_v4461: Object.freeze([
        Object.freeze({ gate: "tools/ship/physicsReach-selfcheck.mjs", recordedMs: 3143, nowMs: 518, red: true }),
        Object.freeze({ gate: "tools/ship/windowsImport-selfcheck.mjs", recordedMs: 3089, nowMs: 610, red: true }),
        Object.freeze({ gate: "tools/ship/citedSources-selfcheck.mjs", recordedMs: 3103, nowMs: 1023, red: true }),
        Object.freeze({ gate: "tools/ship/corpusFilters-selfcheck.mjs", recordedMs: 3141, nowMs: 1179, red: true }),
        Object.freeze({ gate: "tools/ship/orreryEjecta-selfcheck.mjs", recordedMs: 3314, nowMs: 1726, red: true }),
        Object.freeze({ gate: "tools/ship/traderGraph-selfcheck.mjs", recordedMs: 3368, nowMs: 2793, red: true }),
        // *** THE SEVENTH, RETURNED BY THE SECOND ROTATION IN THE SAME VERSION, AND IT IS THE EXTREME CASE
        // THIS WHOLE RECORD IS ABOUT. *** box3dFilter was evicted at 3763 ms and runs in 185 -- a factor of
        // twenty -- so the budget had been hiding a gate that costs a fifth of a second. It is RED, and it was
        // red the entire time it was invisible: RED_AT_V4408 names it with a reason (two build scripts
        // disagreeing about the wasm export set, which needs the rig). Naming it here does not fix that and
        // does not pretend to; it stops the eviction being the reason nobody sees it.
        Object.freeze({ gate: "tools/ship/box3dFilter-selfcheck.mjs", recordedMs: 3763, nowMs: 185, red: true }),
    ]),
    notClaimed: "that the 22 are the whole of it. This measured the 371 entries recorded GREEN; the 144 " +
                "recorded nonzero and the `killed` bucket were not re-run, and a gate that is red for a " +
                "reason this sandbox creates (no GPU, no network) is separated above rather than counted in.",
});

// *** v4461 -- THE DOOR SWINGS BOTH WAYS, IT WAS WALKED THROUGH ONCE, AND THE WALK WAS UNDONE INSIDE THE
// SAME VERSION. *** The rotation ran on 2026-09-03 and re-timed 150 over-budget gates SERIALLY. 146 of them
// came back under the budget that had evicted them -- median 2.80x faster than the reading that shut the
// door, worst 29.12x -- and it wrote them into sweep-timings.json with fresh stamps, so they were back in the
// ship-time sweep. The very next commit to touch that file is titled "the sweep timings as verify left them",
// and in it all 146 are back at EXACTLY their pre-rotation readings, carrying the stamp
// "unknown -- before v4408" -- a stamp no post-v4408 writer can produce for an entry that had a real one.
// The writer had read a file that did not contain the rotation's work.
//
// *** IT HAS READ 3002 ms EVER SINCE, IDENTICAL ACROSS THIRTY COMMITS, BECAUSE ONCE OVER BUDGET NOTHING RUNS
// IT AGAIN -- so the number cannot be corrected by the mechanism that recorded it. *** referenceScan really
// takes 733 ms. And the rotation has not run in the 49 shipped versions since.
//
// WHAT IS NOT CLAIMED: which mechanism reverted it. The stamp proves the writer read a file lacking the
// rotation's entries; whether that was a stale checkout, a merge, or something else is not recoverable from
// here and is not asserted.
//
// THE POINT IS THAT NOTHING NOTICED FOR FORTY-NINE VERSIONS, AND THE EVIDENCE WAS IN THE TREE THE WHOLE TIME:
// the rotation keeps its OWN ledger, sweep-rotation.json, which survived. Comparing the two files is the
// check -- a gate the rotation measured under budget must still be under budget in the timings, or the
// timings have lost work somebody paid for. It costs a file read, and it would have caught this in one round.
export function rotationHeld(file, rot, { budgetMs = BUDGET_MS } = {}) {
    const timings = (file && file.timings) || {}, at = (file && file.at) || {};
    const rows = (rot && rot.rotated) || [];
    const measuredUnder = rows.filter((r) => r && typeof r.ms === "number" && r.ms < budgetMs);
    // *** v4531 -- A ROTATION READING IS ONE SAMPLE, AND A GATE WHOSE TRUE COST STRADDLES THE BUDGET WILL
    // CROSS IT BY LUCK. *** This row fired on physics/render/misWgsl-selfcheck.mjs, rotation 2966 against a
    // 3000 ms budget and 3480 in the timings -- and re-measured SERIALLY, three runs in a row, it takes 3075,
    // 3102 and 3134 ms. The rotation's 2966 was the outlier, so "restore it" would have meant writing a number
    // already measured to be false. That is v4458's own finding -- an observation promoted to a property --
    // and the sibling row two sections up carries the rule this one was missing: A THRESHOLD IS THE PROPERTY,
    // A MILLISECOND IS AN OBSERVATION.
    //
    // *** THE TEETH ARE KEPT BY NAMING THE OUTLIERS RATHER THAN BY WIDENING THE RULE. *** No tolerance band is
    // introduced -- a band would forgive every future boundary case silently, which is the escape hatch this
    // file has caught three times. An entry here is a MEASUREMENT somebody took and wrote down, and the fault
    // this row exists for is untouched: the 2026-09-03 loss was 146 gates reverted wholesale to their
    // pre-rotation readings carrying a stale stamp, and no list of individually re-measured gates can hide
    // that.
    // *** v4536 -- "LOST" IS A QUESTION ABOUT PROVENANCE, AND IT HAD BEEN ASKED IN MILLISECONDS. ***
    //
    // This row was named for a real fault: 146 gates put back at their pre-rotation readings, wholesale, by a
    // writer that was not the thing that measured them. It was implemented as "the rotation said under and the
    // timings say over", and that catches the fault -- along with every gate that was simply MEASURED AGAIN
    // AND CAME OUT SLOWER, which is not a loss at all. In one day this session named eight straddlers, retired
    // all eight on serial evidence, and watched four cross back; each crossing fired this row and each was
    // answered by adding a name to a list. Three rounds of that is a treadmill, and the treadmill is what says
    // the question was wrong rather than the answer.
    //
    // A LOSS AND A RE-MEASUREMENT ARE TOLD APART BY THE STAMP, WHICH v4408 PUT THERE FOR EXACTLY THIS. An entry
    // re-timed AFTER the rotation carries a newer `at` and is a fresh observation, whoever it disagrees with.
    // An entry sitting over budget with a stamp NO NEWER than the rotation's is the fault: the rotation's
    // reading is gone and nothing has looked since. Measured on the 2026-09-03 loss, the 146 carried a stamp
    // from before v4408 -- older, every one. Measured on this round's crossings, meshLine / microfacetVndf /
    // slugReupload carry 2026-09-08T00:03 and 00:10 against a rotation at 2026-09-07T22:31 -- newer, every one.
    // The two faults separate cleanly on the field that was already in the file.
    //
    // *** WHAT THIS DOES NOT CLAIM: that a wholesale revert carrying FRESH stamps would be caught here. *** It
    // would not, and that is why `reverted` below exists rather than a wider version of this rule -- a revert
    // is many gates at once and a re-measurement is a handful, so the second fault is caught by its SHAPE
    // instead of by its stamp, and neither test is asked to do the other's job.
    const rotAt = Date.parse((rot && rot.at) || "") || 0;
    const freshlyRetimed = (g, rowAt) => {
        const t = Date.parse(at[g] || "") || 0;
        const since = Date.parse(rowAt || "") || rotAt;
        return t > 0 && since > 0 && t > since;
    };
    // *** AND THE THREE NAME-LISTS COME OUT OF THE RULE ENTIRELY, WHICH IS THE POINT. *** v4531, v4533 and
    // v4535 each answered a crossing by naming the gate that crossed; measured just now, with all three
    // exclusions removed and only the stamp test left, this reads 43 measured under, 7 back over, ZERO LOST.
    // Every name on those lists was a workaround for the wrong question, so none of them is load-bearing any
    // more. They are kept as a RECORD -- they hold the serial readings that make the oscillation checkable,
    // and they are the evidence for the calibration round in nextRounds.mjs -- and the selfcheck asserts they
    // are no longer needed, so if a change ever makes them load-bearing again that fact is visible instead of
    // silent. ONE MECHANISM, not one mechanism and a list of apologies.
    const lost = measuredUnder.filter((r) => (timings[r.gate] || 0) >= budgetMs && !freshlyRetimed(r.gate, r.at));
    // *** THE ORIGINAL FAULT, CAUGHT BY ITS SHAPE RATHER THAN BY ANY GATE'S NAME. *** 146 of 150 went back at
    // once. A stamp cannot see that and a per-gate rule should not try: if MOST of what the rotation brought
    // under budget is over budget again, that is a rewrite whatever any individual entry claims. Half is the
    // line because the fault was 97% and the largest honest crossing this session has produced is 4 of 44 (9%);
    // nothing observed lies between, and the gap is stated so a later reading inside it is visible as new.
    const backOver = measuredUnder.filter((r) => (timings[r.gate] || 0) >= budgetMs);
    const reverted = measuredUnder.length > 0 && backOver.length > measuredUnder.length / 2 ? backOver : [];
    // A gate the rotation wrote carries the rotation's stamp. UNKNOWN_AT on one of them is the fingerprint of
    // a file that was replaced rather than updated, which is a different fault from a gate that got slower.
    const unstamped = measuredUnder.filter((r) => (at[r.gate] || UNKNOWN_AT) === UNKNOWN_AT);
    return { measuredUnder: measuredUnder.length, lost, unstamped, reverted, backOver: backOver.length,
             held: measuredUnder.length - lost.length, rotatedAt: (rot && rot.at) || null };
}

/**
 * Gates whose rotation reading crossed the budget by luck, each with the serial re-measurement that says so.
 * A gate leaves this list by being re-measured under budget, not by being deleted.
 */
/**
 * *** v4533 -- FIVE AT ONCE, AND THE HONEST NAME FOR IT IS NOT "OUTLIER". ***
 *
 * v4531 excluded ONE gate whose rotation reading crossed the budget by luck. This round's sweep reported
 * FIVE lost, and re-measuring them serially says something different from five coincidences:
 *
 *     microfacetVndf   rotation 2560   serial now 3152, 3216
 *     reportDoors      rotation 2262   serial now 3158, 2965
 *     slugReupload     rotation 2734   serial now 3133, 3124
 *     water2d          rotation 2551   serial now 3132, 3153
 *     probeLab         rotation 2870   serial now 3189, 3197
 *
 * Every one landed in 2.2-2.9s at rotation time and every one lands at ~3.1s now, SERIALLY, with nothing in
 * this round touching any of them. That is not five gates flapping independently; it is ONE BOX MEASURED AT
 * TWO DIFFERENT TIMES, and the 3,000 ms budget sits exactly where this machine's noise lives. Calling them
 * outliers would file a property of the hardware as five properties of five gates.
 *
 * *** SO THE ENTRY IS THE CLUSTER, AND WHAT IT ADMITS IS THAT THE ROTATION LEDGER IS STALE RATHER THAN THAT
 * THE TIMINGS ARE WRONG. *** The durable repair is a re-run of step 3b on a quiet box, which re-times
 * serially and writes today's numbers back; until somebody does that, these five are recorded here WITH the
 * measurements that justify each one, so a reader can check the claim rather than take it. A gate leaves this
 * list by being re-measured under budget, never by being deleted.
 */
/**
 * *** v4535 -- EMPTY, AND THAT IS THE EXIT CONDITION BEING MET RATHER THAN THE LIST BEING TIDIED. ***
 *
 * v4533's own words: "the durable repair is a re-run of step 3b on a quiet box, which re-times serially and
 * writes today's numbers back". Somebody did that. All six entries -- five here and v4531's one -- were
 * re-measured THREE TIMES SERIALLY, the same instrument that put them on the list, and every one of the
 * eighteen readings came back under budget:
 *
 *     misWgsl          serial then 3075/3102/3134   serial now 2638/2822/2809
 *     microfacetVndf   serial then 3152/3216        serial now 2157/2136/2363
 *     reportDoors      serial then 3158/2965        serial now 1848/2016/1883
 *     slugReupload     serial then 3133/3124        serial now 2521/2441/2391
 *     water2d          serial then 3132/3153        serial now 2400/2427/2369
 *     probeLab         serial then 3189/3197        serial now 2523/2465/2503
 *
 * *** SO v4533 WAS RIGHT ABOUT THE CLUSTER AND v4531 WAS WRONG ABOUT THE OUTLIER, AND ONLY THE SECOND
 * MEASUREMENT COULD TELL THEM APART. *** Five gates moving together said "one box measured at two different
 * times"; the sixth was filed as a property of misWgsl -- "the gate genuinely sits just OVER budget on this
 * box" -- and it moves with the other five. Three serial samples were enough to refute a single sub-budget
 * rotation reading and NOT enough to establish a gate's cost, because the noise this budget sits in has a
 * period longer than three consecutive runs of one gate.
 *
 * THE LIST IS WHAT MADE THAT CHECKABLE. Both entries carried the gate names and the numbers behind them, so
 * the claim could be refuted by re-running six commands; a tolerance band -- the repair v4531 declined --
 * would have forgiven all six silently and left nothing to re-run. Empty is the state a record like this is
 * supposed to reach, and rotationHeld now runs with no exemptions at all.
 */
export const ROTATION_BOUNDARY_V4533 = Object.freeze([]);

/** The retired entries, kept with BOTH measurements so the retirement is as checkable as the entry was. */
export const ROTATION_BOUNDARY_RETIRED_V4535 = Object.freeze([
    Object.freeze({ gate: "physics/render/misWgsl-selfcheck.mjs",        at: "v4531", rotationMs: 2966, serialThen: Object.freeze([3075, 3102, 3134]), serialNow: Object.freeze([2638, 2822, 2809]) }),
    Object.freeze({ gate: "physics/render/microfacetVndf-selfcheck.mjs", at: "v4533", rotationMs: 2560, serialThen: Object.freeze([3152, 3216]),       serialNow: Object.freeze([2157, 2136, 2363]) }),
    Object.freeze({ gate: "tools/ship/reportDoors-selfcheck.mjs",        at: "v4533", rotationMs: 2262, serialThen: Object.freeze([3158, 2965]),       serialNow: Object.freeze([1848, 2016, 1883]) }),
    Object.freeze({ gate: "tools/ship/slugReupload-selfcheck.mjs",       at: "v4533", rotationMs: 2734, serialThen: Object.freeze([3133, 3124]),       serialNow: Object.freeze([2521, 2441, 2391]) }),
    Object.freeze({ gate: "tools/ship/water2d-selfcheck.mjs",            at: "v4533", rotationMs: 2551, serialThen: Object.freeze([3132, 3153]),       serialNow: Object.freeze([2400, 2427, 2369]) }),
    Object.freeze({ gate: "tools/ship/probeLab-selfcheck.mjs",           at: "v4533", rotationMs: 2870, serialThen: Object.freeze([3189, 3197]),       serialNow: Object.freeze([2523, 2465, 2503]) }),
]);

export const ROTATION_OUTLIERS_V4531 = Object.freeze([]);   // retired at v4535 -- see the note above; misWgsl
                                                            // re-measured 2638/2822/2809 serially, under budget.

/**
 * *** v4535 -- ONE GATE THAT REALLY DOES STRADDLE, AND IT TOOK EMPTYING THE LIST TO SEE IT. ***
 *
 * Eight entries were retired this round because a quiet box put all eight back under budget, and the same
 * round's sweep produced exactly ONE new lost gate -- and this one does not move when the box quiets down:
 * 3,065 / 2,823 / 3,208 / 3,269 / 3,000 ms across five serial runs, median 3,065 against a 3,000 ms budget.
 * The rotation caught it at 2,991 and the sweep wrote 3,115; BOTH READINGS ARE HONEST AND THE GATE IS THE
 * COIN, not the box. That is what the eight false straddlers were being confused with, and the difference is
 * five samples rather than one.
 *
 * NOTHING IS FORGIVEN BY THIS ENTRY. The gate stays out of the quick sweep, because 3,065 ms IS over the
 * budget and the budget is not the thing under negotiation here; what the entry says is that a 2,991 ms
 * rotation reading followed by a 3,115 ms sweep reading is one gate sampled twice, not a measurement lost
 * between them. It leaves this list the way the other eight did -- by being re-measured under budget, or by
 * being made cheaper. winPathGuard was made cheaper in this same round (3,033 -> 1,675 ms, by deleting a
 * second walk of the tree it did not need), which is the repair this one has not had yet.
 */
/**
 * *** v4536 -- THREE OF THE EIGHT RETIRED ONE ROUND AGO ARE BACK, AND THAT IS THE MECHANISM'S OWN FINDING
 * RATHER THAN A MISTAKE IN EITHER ROUND. ***
 *
 * v4535 emptied both boundary lists on the argument that eight straddlers moving together meant ONE BOX GOT
 * QUIETER, with three serial readings each to prove it. The box got loud again inside a day, and the same
 * three serial runs on the same unchanged code read:
 *
 *     misWgsl      v4535 quiet: 2638 / 2822 / 2809      v4536 loud: 4026 / 3992 / 4015
 *     probeLab     v4535 quiet: 2523 / 2465 / 2503      v4536 loud: 3211 / 3157 / 3167
 *     water2d      v4535 quiet: 2400 / 2427 / 2369      v4536 loud: 3048 / 3027 / 3042
 *
 * misWgsl is 43% slower than it was, with not one byte of it changed, and the sweep that surfaced this took
 * 265 s against 197 s for the identical work. BOTH ROUNDS MEASURED HONESTLY AND BOTH ATTRIBUTED TO THE GATE.
 *
 * *** SO THIS LIST IS A LOG OF THE BOX'S WEATHER WEARING THE NAME OF A GATE PROPERTY, AND NO NUMBER OF
 * RE-MEASUREMENTS FIXES THAT. *** rotationHeld compares a rotation reading against a timings reading taken at
 * a different hour under different load; for anything within ~30% of the budget the comparison is decided by
 * which hour, and this session has now watched eight gates cross in one direction and three cross back. A
 * tolerance band is still the wrong repair (v4531's argument stands: it forgives every future case silently).
 * The repair that would actually work is CALIBRATION -- time a fixed reference workload during the sweep and
 * normalise every reading by it, so a slow hour moves all 1,595 numbers together instead of moving thirty of
 * them across a line. That is a round of its own and is filed as one in tools/ship/nextRounds.mjs; until it
 * exists, these three are named here WITH BOTH READINGS, so the next reader inherits the oscillation as
 * evidence rather than re-deriving it from an empty list for the third time.
 */
/**
 * *** v4536 -- THE BACKLOG ASKED FOR A REFERENCE WORKLOAD. IT WAS BUILT, MEASURED, AND IT DOES NOT WORK. ***
 *
 * nextRounds' `sweep-budget-calibration` is right about the disease: "a millisecond on a loaded box and a
 * millisecond on a quiet one are being compared as if they were the same quantity". It proposes normalising
 * every reading by a fixed workload timed during the sweep. Two candidates were built and driven under a
 * synthetic 8-hog load on this 4-core box:
 *
 *     refCompute   a pure integer loop over a 16 KB working set     moved 1.02x while gates moved 1.22-2.26x
 *     refSpawn     `node -e 0`, the cost every gate pays first      moved 2.43x while gates moved 1.22-2.26x
 *
 * NEITHER TRACKS. A single-threaded ALU loop keeps its own core and barely notices; process spawn is far more
 * contended than the gates are. Normalising by the first changes nothing and by the second overcorrects by
 * about 2x. The residual spread after normalising is 1.15x and 1.9x respectively -- both larger than the
 * margin that decides eviction, so the treadmill would continue with an extra number in the file.
 *
 * *** AND THE DRIFT IS NOT A COMMON FACTOR, WHICH IS THE DEEPER REASON. *** Serial against serial, on gates
 * whose gate file and subject are BYTE-IDENTICAL since the earlier reading (checked with git, not assumed):
 *
 *     microfacetVndf   3184 -> 3613   1.13x        probeLab   3193 -> 4337   1.36x
 *     water2d          3143 -> 3546   1.13x        meshLine   2792 -> 3804   1.36x
 *     slugReupload     3129 -> 3507   1.12x
 *
 * Three at 1.12-1.13 and two at 1.36 is not one number the box is multiplied by; a scalar cannot carry it.
 * AND AT LEAST ONE OF THE OUTLIERS IS NOT THE BOX AT ALL: meshLine WALKS THE TREE (three readdir sites), so
 * its cost grows as the tree grows, and that growth is real work. *** A REFERENCE NORMALISER WOULD HAVE
 * DIVIDED THAT AWAY AND FILED GENUINE GROWTH AS A SLOW HOUR, *** which is a worse fault than the one it was
 * sent to fix.
 *
 * WHAT WAS DONE INSTEAD is in quickSweep.mjs: a crossing must be reproduced on a later sweep before it evicts.
 * Within one hour these gates repeat to about 2% (probeLab 4398 / 4425 / 4337); across hours they move up to
 * 36%. So one crossing is a reading and two are a property -- v4297's rule for reds, applied to time.
 *
 * ONE MORE READING, KEPT BECAUSE IT IS LARGER THAN EVERYTHING ABOVE: twelve gates from a single capture,
 * unchanged code, re-measured serially, came in at 0.41x to 0.92x of their recorded time -- A 2.24x SPREAD --
 * because the file mixes 8-way parallel readings with serial ones and compares both against one budget. That
 * is not repaired here and is the next thing to look at.
 */
export const BUDGET_DRIFT_V4536 = Object.freeze({
    at: "v4536", box: "4 cores", budgetMs: BUDGET_MS,
    referenceWorkloadsTried: Object.freeze([
        Object.freeze({ name: "refCompute", what: "pure integer loop, 16 KB working set", movedUnderLoad: 1.02 }),
        Object.freeze({ name: "refSpawn", what: "node -e 0", movedUnderLoad: 2.43 }),
    ]),
    gatesMovedUnderLoadFrom: 1.22, gatesMovedUnderLoadTo: 2.26,
    // serial-against-serial, code byte-identical, hours apart
    hourDrift: Object.freeze([
        Object.freeze({ gate: "physics/render/microfacetVndf-selfcheck.mjs", was: 3184, now: 3613 }),
        Object.freeze({ gate: "tools/ship/water2d-selfcheck.mjs", was: 3143, now: 3546 }),
        Object.freeze({ gate: "tools/ship/slugReupload-selfcheck.mjs", was: 3129, now: 3507 }),
        Object.freeze({ gate: "tools/ship/probeLab-selfcheck.mjs", was: 3193, now: 4337 }),
        Object.freeze({ gate: "tools/ship/meshLine-selfcheck.mjs", was: 2792, now: 3804 }),
    ]),
    withinHourSpreadPct: 2,        // probeLab 4398 / 4425 / 4337 across three consecutive runs
    growthNotDrift: "tools/ship/meshLine-selfcheck.mjs walks the tree, so part of its 1.36x is the tree " +
                    "growing rather than the box slowing. A scalar normaliser cannot tell those apart and " +
                    "would file the first as the second.",
    parallelToSerialSpread: 2.24,  // twelve unchanged gates, one capture, re-measured alone: 0.41x to 0.92x
    repairShipped: "quickSweep.MIN_CROSSINGS_TO_EVICT -- a crossing must be reproduced on a later sweep",
    // *** AND THE FIRST DRAFT OF THAT REPAIR WOULD HAVE RUN THE WHOLE OVER-BUDGET POOL AT SHIP TIME. ***
    // It gave probation to any gate over budget whose crossing count was MISSING, and a missing count is the
    // normal state of the ~300 gates evicted before this rule existed -- the expensive ones, twice over
    // before the counts settled, which is exactly the cost sweepRotation exists to spread across rounds.
    // budgetExile-selfcheck caught it inside the round by seeding a gate with a 999,999 ms lie and watching
    // the sweep go and run it. Probation is for a gate that crossed UNDER this rule; a missing count means
    // "evicted before it existed" and those stay out.
    firstDraftFault: "probation on a MISSING count is probation for the entire over-budget pool",
    notClaimed: "that two crossings prove a gate is over budget on a quiet box. They prove the reading " +
                "reproduced. What this removes is the eviction that rests on ONE hour, which is the one the " +
                "straddler lists have been undoing by hand for three rounds.",
});

export const ROTATION_BOUNDARY_V4535 = Object.freeze([
    Object.freeze({ gate: "physics/render/albedoEstimator-selfcheck.mjs", rotationMs: 2991, sweepMs: 3115,
        serialMs: Object.freeze([3065, 2823, 3208, 3269, 3000]),
        why: "straddles the 3,000 ms budget on a QUIET box, which is what distinguishes it from the eight " +
             "entries retired this round: five serial runs read 3,065 / 2,823 / 3,208 / 3,269 / 3,000 ms, " +
             "median 3,065 and over. The rotation's 2,991 and the sweep's 3,115 are two samples of that " +
             "spread rather than a reading lost between two writers." }),
    Object.freeze({ gate: "physics/render/misWgsl-selfcheck.mjs", rotationMs: 2746, sweepMs: 3810,
        serialMs: Object.freeze([4026, 3992, 4015]), quietMs: Object.freeze([2638, 2822, 2809]),
        why: "retired at v4535 on three serial readings under budget and back over on three more the next " +
             "day, unchanged: 2638/2822/2809 quiet against 4026/3992/4015 loud, a 43% swing with no code in " +
             "between. Named with BOTH, because either set alone is a confident wrong answer." }),
    Object.freeze({ gate: "tools/ship/probeLab-selfcheck.mjs", rotationMs: 2474, sweepMs: 3090,
        serialMs: Object.freeze([3211, 3157, 3167]), quietMs: Object.freeze([2523, 2465, 2503]),
        why: "the same swing on the same day as misWgsl and water2d -- 2523/2465/2503 quiet, 3211/3157/3167 " +
             "loud. Three gates moving together is the box, which is exactly what v4533 said about five." }),
    Object.freeze({ gate: "tools/ship/meshLine-selfcheck.mjs", rotationMs: 2457, sweepMs: 3014,
        serialMs: Object.freeze([3014]), quietMs: Object.freeze([2515, 2480, 2757]),
        why: "the fourth oscillator of the day, and the one that crossed DURING the ship sweep rather than " +
             "before it: green while the sweep ran, red the moment the sweep's own write landed. The sweep " +
             "rewrites the record this gate reads, so a verdict and the gate behind it can disagree by " +
             "construction -- which is a property of the ordering, not a flake." }),
    Object.freeze({ gate: "tools/ship/water2d-selfcheck.mjs", rotationMs: 2401, sweepMs: 3015,
        serialMs: Object.freeze([3048, 3027, 3042]), quietMs: Object.freeze([2400, 2427, 2369]),
        why: "2400/2427/2369 quiet against 3048/3027/3042 loud. The narrowest of the three and still a clean " +
             "27% -- it straddles nothing; it is measured on two different machines that share a name." }),
]);

// *** THE MEASUREMENT OF THE LOSS, FROZEN BY NAME, because the ledger that proves it is REWRITTEN BY THE NEXT
// ROTATION -- sweep-rotation.json holds only the last run, so this is the one place the 2026-09-03 run
// survives outside git. ***
export const ROTATION_LOST_V4461 = Object.freeze({
    at: "v4461",
    ranAt: "2026-09-03T18:15:21.194Z",
    rotated: 150,
    cameBackUnderBudget: 146,
    stillUnderBudgetInTheTimings: 0,      // measured before this round re-ran the rotation
    recordedAtExactlyThePreRotationReading: 146,
    carryingTheStamp: "unknown -- before v4408",
    speedupVsTheEvictingReading: Object.freeze({ median: 2.80, max: 29.12 }),
    witness: Object.freeze({ gate: "tools/render-qa/referenceScan-selfcheck.mjs",
        evictedAt: 3002, serialTruth: 733, atV4410: 1815, everySinceV4431: 3002,
        note: "identical across thirty commits, because once over budget nothing runs it again -- so the " +
              "number cannot be corrected by the mechanism that recorded it" }),
    versionsWithNoRotation: 49,           // v4410 to v4460 inclusive of neither end's rotation
    // WHAT THIS ROUND DID ABOUT IT, and the numbers are from the run, not from the plan.
    // The numbers are from the SECOND run -- the first was clobbered mid-round (see secondInstance) and
    // re-running it against the other session's file is the honest repair, not resurrecting my snapshot.
    // A FOUR-WAY SPLIT, because "returned" and "red" overlap and a two-number summary hid that: a gate can
    // come back under budget AND be red, which is the population that changes what the next ship reports.
    repair: Object.freeze({ slots: 80, ran: 80, killed: 0, materiallySlower: 1,
        underGreen: 66, underRed: 6, overGreen: 7, overRed: 1,
        cameBackUnder: 72, red: 7,
        poolBefore: 386, poolAfter: 314,
        redsAllPreviouslyNamed: true,     // all 7 are in STALE_GREENS_V4460's list of 22, found independently
        newlyVisibleReds: 5 }),           // under budget, red, and in no register: these turn the next ship red
    // *** AND IT HAPPENED AGAIN, LIVE, WHILE THIS GUARD WAS BEING WRITTEN -- WHICH IS HOW THE MECHANISM
    // STOPPED BEING A GUESS. *** v4461's rotation ran at 14:24 and returned 72 gates. A CONCURRENT SESSION,
    // shipping the releaseLedger fix from a tree checked out before that, ran verify at 15:56 and pushed its
    // sweep-timings.json -- a whole-file rewrite built from ITS OWN snapshot. In that file all 72 are back
    // over budget, 69 of them carrying "unknown -- before v4408", and referenceScan reads 3002 again against
    // the 675 ms this round measured. The guard above went RED on it by name, on its first exposure to a real
    // instance rather than a fixture.
    //
    // *** SO THE MECHANISM IS A CONCURRENT WHOLE-FILE WRITER, AND IT IS NOT ANYBODY'S MISTAKE. *** quickSweep
    // reads the timings once, carries `{...prior.timings}` forward, and rewrites the entire file at the end.
    // Two ships in flight at once means the later push wins wholesale and any rotation work in the loser is
    // erased -- silently, because a measurement file has no merge semantics and, until this round, nothing
    // that compared it against what had been paid for.
    //
    // *** AND I NEARLY COMMITTED THE SAME CLOBBER RESOLVING IT. *** `git checkout --theirs` during a REBASE
    // takes the commit being applied, not the upstream, so it kept this round's file and discarded the other
    // session's fresh sweep of the whole tree. Caught by checking the `captured` stamps rather than trusting
    // the flag. The resolution is the honest one: take their file, then RE-RUN THE ROTATION, so the returnees
    // are re-established by measurement instead of by resurrecting a stale snapshot.
    secondInstance: Object.freeze({
        at: "v4461, during this round",
        rotatedAt: "2026-09-05T14:24:02.657Z", clobberedBy: "2026-09-05T15:56:53.330Z",
        returned: 72, lost: 72, unstamped: 69,
        witness: Object.freeze({ gate: "tools/render-qa/referenceScan-selfcheck.mjs", measured: 675, restoredTo: 3002 }),
        mechanism: "a concurrent ship's whole-file rewrite of sweep-timings.json, built from a snapshot taken " +
                   "before the rotation ran. The later push wins the whole file.",
        caughtBy: "rotationHeld, both rows, by name -- its first real instance",
    }),
    notClaimed: "that the FIRST instance had the same cause. The 2026-09-03 stamp evidence is consistent with " +
                "it and the second instance is proof the mechanism exists, but the branch state of that day " +
                "is not recoverable from here and is not asserted. What IS asserted for the first: that it " +
                "happened, that nothing noticed for 49 versions, and that the evidence sat in the tree.",
});

// The door: entries the sweep excludes, ordered by how cheaply they might come back. A gate recorded just over
// the budget is the likeliest returnee, and v4406 measured three that finish in 1.3-2.2 s.
export function doorCandidates(c, { timings = {} } = {}, { lo = BUDGET_MS, hi = 6000 } = {}) {
    return c.over.filter((g) => timings[g] >= lo && timings[g] < hi).sort((a, b) => timings[a] - timings[b]);
}

// The rotation, stalest first. `at` is a per-entry provenance string; entries with none are the stalest there
// are, which is why UNKNOWN_AT sorts before every real capture.
export function rotation(c, { at = {}, timings = {} } = {}, { slots = 24, budgetMs = 120000 } = {}) {
    const pool = [...c.over].sort((a, b) => {
        const aa = at[a] || "", bb = at[b] || "";
        if (aa !== bb) return aa < bb ? -1 : 1;
        return (timings[a] || 0) - (timings[b] || 0);
    });
    const picked = [];
    let cost = 0;
    for (const g of pool) {
        const ms = timings[g] || BUDGET_MS;
        if (picked.length >= slots || cost + ms > budgetMs) break;
        picked.push(g); cost += ms;
    }
    return { picked, cost, pool: pool.length, roundsToCover: roundsToCover(pool.length, picked.length) };
}

export function roundsToCover(population, perRound) {
    if (!perRound) return Infinity;
    return Math.ceil(population / perRound);
}

// The provenance question the file could not answer before this round: WHICH entries did the last run observe?
export function provenance(file) {
    const at = file.at || {};
    const entries = Object.keys(file.timings || {});
    const newest = file.captured || file.at_ || null;
    const stamped = entries.filter((g) => at[g] === newest);
    return { entries: entries.length, withAt: entries.filter((g) => at[g]).length,
             withoutAt: entries.filter((g) => !at[g]).length, newest, stamped: stamped.length };
}

// ONE RULE, ONE PLACE. Both writers (quickSweep and sweepRotation) call this, so a file written by either is
// complete: every entry has a stamp, and an entry nobody has observed says UNKNOWN_AT rather than borrowing the
// file's date. Two copies of this rule would be two chances to disagree, which is v3584's second-copy defect.
export function backfillStamps(timings, at) {
    for (const g of Object.keys(timings)) if (!at[g]) at[g] = UNKNOWN_AT;
    return at;
}

// *** ONE RECORD, ONE OWNER. *** The rotation's ledger lived in sweep-timings.json for one run and the next
// quickSweep write erased it -- the writer builds a fresh object and does not know about fields it did not put
// there. Two writers on one file is the shape that loses a record silently, so the rotation keeps its own.
export function readRotation(p = path.join(ENG, "tools", "ship", "sweep-rotation.json")) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return { at: null, rotated: [] }; }
}

export function readFile(p = path.join(ENG, "tools", "ship", "sweep-timings.json")) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return { timings: {}, codes: {}, at: {} }; }
}
