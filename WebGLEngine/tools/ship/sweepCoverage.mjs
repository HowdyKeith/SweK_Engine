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
    notClaimed: "that the 22 are the whole of it. This measured the 371 entries recorded GREEN; the 144 " +
                "recorded nonzero and the `killed` bucket were not re-run, and a gate that is red for a " +
                "reason this sandbox creates (no GPU, no network) is separated above rather than counted in.",
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
