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
    const lost = measuredUnder.filter((r) => (timings[r.gate] || 0) >= budgetMs);
    // A gate the rotation wrote carries the rotation's stamp. UNKNOWN_AT on one of them is the fingerprint of
    // a file that was replaced rather than updated, which is a different fault from a gate that got slower.
    const unstamped = measuredUnder.filter((r) => (at[r.gate] || UNKNOWN_AT) === UNKNOWN_AT);
    return { measuredUnder: measuredUnder.length, lost, unstamped,
             held: measuredUnder.length - lost.length, rotatedAt: (rot && rot.at) || null };
}

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
