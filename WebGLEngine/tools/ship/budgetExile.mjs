// FILE: tools/ship/budgetExile.mjs -- v4425
//
// *** CROSSING THE SHIP-TIME BUDGET IS A ONE-WAY DOOR, AND NOTHING IN THE TREE CAN OPEN IT. ***
//
// tools/ship/quickSweep.mjs decides which gates a round runs:
//
//     selectGates:   timings[g] > budgetMs  ->  skipped, not run
//     runQuickSweep: for (const r of rows) timings[r.gate] = r.serialMs ?? r.parallelMs;
//
// and `rows` is built only from the gates it RAN. So a skipped gate's recorded time is never rewritten, and
// the only thing that could rewrite it is the sweep that just refused to run it. ONCE A GATE'S TIME CROSSES
// THE BUDGET, IT STAYS ACROSS FOREVER. A single slow observation -- eight-way contention, a cold cache, one
// unlucky minute -- exiles a gate from every future ship sweep, permanently, and no amount of the gate
// getting faster can bring it back.
//
// *** THIS IS NOT A THEORY ABOUT THE CODE. FOUR GATES ARE SITTING IN IT RIGHT NOW WITH A RECORDED FAILURE. ***
// v4424 found six gates carrying exit code 1 in sweep-timings.json and on no register at all. Run one at a
// time they ALL EXIT 0 -- the codes are stale, from whenever those gates last ran. Four of the six now finish
// in under the 3 s budget (fetchCap 5976 -> 2157, orrery 13931 -> 2369, splatSort 3615 -> 1230, typecheck
// 5292 -> 2391) and are STILL SKIPPED, on a number that has been wrong for as long as it has been unread.
// The record of their failure is preserved indefinitely by the same rule that guarantees it can never be
// corrected.
//
// ---- *** WHY THIS IS THE OTHER HALF OF v4424 AND NOT A REPEAT OF IT *** ---------------------------------------
//
// That round measured the 63 gates redCensus NAMES as unmeasured and found three standing reds. The wider
// fact it uncovered was that the ship gate runs 936 of 1446 gates, skips 510 over the budget, and 437 of
// those are on no register at all. v4424 said out loud that one red outside the bucket was an anecdote and
// not a rate. This round asks what the 510 actually are -- and the answer turns out to be less about what
// they contain than about how they got there and why they cannot leave.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runQuickSweep, selectGates, DEFAULTS } from "./quickSweep.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * *** THE RULE, WRITTEN DOWN SO A CHECK CAN FAIL ON IT RATHER THAN ON A PARAPHRASE OF IT. ***
 *
 * Both halves are needed and neither is enough alone: a budget that skips is fine if something re-measures,
 * and a rewrite that skips the skipped is fine if nothing is ever excluded. Together they absorb.
 */
export const ABSORBING = Object.freeze({
    skipRule: "selectGates: a gate is skipped when its LAST RECORDED time exceeds the budget",
    writeRule: "runQuickSweep: timings are rewritten only for gates that RAN",
    consequence: "a skipped gate's time can never decrease, so the skip is permanent",
    escapes: "raising --budget, or editing the file by hand. Nothing automatic, and no round has done either.",
});

/**
 * Demonstrate the absorbing state end to end against the real sweep.
 *
 * *** A PROPERTY ABOUT TWO FUNCTIONS COMPOSED IS NOT PROVED BY READING EITHER OF THEM. *** This seeds a
 * timings file that claims one cheap gate is slow, runs the actual quickSweep over that one gate, and reads
 * the file back: the gate is not run, and its lie survives the write.
 *
 * @param gate a CHEAP real gate. It must not be this module's own gate, which would recurse.
 */
export async function demonstrateAbsorbing({ gate = "ev/tools/es-tactics-selfcheck.mjs", staleMs = 999999,
                                             budgetMs = DEFAULTS.budgetMs, root = ENG } = {}) {
    const rel = path.join("tools", "ship", ".budgetExile-fixture-timings.json");
    const abs = path.join(root, rel);
    fs.writeFileSync(abs, JSON.stringify({ captured: null, budgetMs, capMs: DEFAULTS.capMs,
        timings: { [gate]: staleMs }, codes: { [gate]: 1 }, observed: { [gate]: "2020-01-01T00:00:00.000Z" } }, null, 1));
    try {
        const out = await runQuickSweep({ gates: [gate], budgetMs, timingsFile: rel, root, write: true, workers: 1 });
        const after = JSON.parse(fs.readFileSync(abs, "utf8"));
        return { ran: out.ran, skipped: out.skippedOverBudget, msAfter: after.timings[gate], codeAfter: after.codes[gate],
                 observedAfter: (after.observed || {})[gate], captured: after.captured };
    } finally {
        try { fs.unlinkSync(abs); } catch { /* the fixture is scratch: a failed unlink is not a finding */ }
    }
}

/** The skip decision alone, for a hand-made timings map. */
export function exiled(gates, timings, budgetMs = DEFAULTS.budgetMs) {
    return selectGates(gates, timings, budgetMs).skipped;
}

// ==== MEASURED_V4425 ====
export const MEASURED_V4425 = Object.freeze({
});
// ==== /MEASURED_V4425 ====

/**
 * *** THE SIX STALE FAILURES v4424 FOUND, WITH WHAT THEY ACTUALLY DO. ***
 *
 * Recorded exit 1 in sweep-timings.json, on no register, and green when run. `recordedMs` is what the file
 * says and `serialMs` what one run alone measures; four of the six are now under the budget that exiles them.
 */
export const STALE_FAILURES = Object.freeze([
    { gate: "tools/ship/fetchCap-selfcheck.mjs",        recordedMs: 5976,  recordedCode: 1, serialMs: 2157,  serialCode: 0 },
    { gate: "tools/ship/moduleHistory-selfcheck.mjs",   recordedMs: 19168, recordedCode: 1, serialMs: 18118, serialCode: 0 },
    { gate: "tools/ship/orrery-selfcheck.mjs",          recordedMs: 13931, recordedCode: 1, serialMs: 2369,  serialCode: 0 },
    { gate: "tools/ship/splatSort-selfcheck.mjs",       recordedMs: 3615,  recordedCode: 1, serialMs: 1230,  serialCode: 0 },
    { gate: "tools/ship/steamdeckLaunch-selfcheck.mjs", recordedMs: 5334,  recordedCode: 1, serialMs: 9146,  serialCode: 0 },
    { gate: "tools/ship/typecheck-selfcheck.mjs",       recordedMs: 5292,  recordedCode: 1, serialMs: 2391,  serialCode: 0 },
]);

/** Of the exiled gates measured alone, how many would clear the budget today. */
export function wouldRunNow(measured = MEASURED_V4425, budgetMs = DEFAULTS.budgetMs) {
    const done = Object.entries(measured).filter(([, m]) => m.verdict === "GREEN" || m.verdict === "RED");
    return { under: done.filter(([, m]) => m.ms <= budgetMs).length, measured: done.length };
}

/** recorded / serial, per gate: how much the eight-way sweep inflated the number that exiled it. */
export function inflation(recorded, measured = MEASURED_V4425) {
    const out = [];
    for (const [gate, m] of Object.entries(measured)) {
        if (!(m.verdict === "GREEN" || m.verdict === "RED")) continue;
        const r = recorded[gate];
        if (r == null || m.ms <= 0) continue;
        out.push({ gate, recorded: r, serial: m.ms, ratio: r / m.ms });
    }
    return out;
}

/**
 * *** THE ONE REPAIR THIS ROUND MAKES, AND IT IS NOT A POLICY DECISION. ***
 *
 * sweep-timings.json's note said its contents were "OBSERVED at the last quickSweep run". That was true of
 * the rows the run rewrote and FALSE of every other row -- and the other rows are exactly the exiled gates,
 * whose recorded time is the only reason they were not run. One whole-file `captured` date cannot say when
 * an individual row was seen, so the file now carries `observed` per gate: the run's stamp for a gate that
 * ran, whatever it had for a gate that did not, and `null` for a row written before the field existed.
 *
 * Choosing what the sweep should COST is a decision about the ship ritual and is not made here. Saying when
 * a number was taken is not a choice at all.
 */
export const RECORD_REPAIR = Object.freeze({
    field: "observed",
    was: "one `captured` date for the whole file, which dated the RUN and was read as dating the ROWS",
    now: "an ISO stamp per row, or null for a row older than the field",
    notAPolicy: "the budget, the cap and the sweep's cost are unchanged",
});

// ---- WHAT THIS ROUND DOES NOT CLAIM --------------------------------------------------------------------
//
// It does not raise the budget, and it does not rewrite sweep-timings.json to release the exiles. Choosing
// what the sweep should cost is a decision about the ship ritual, and making it inside the round that
// measured the exiles would be the same move v4424 refused: the granting and the resolving in one place.
//
// It does not claim the exiled gates are green. Most of them are, on this box, today; a verdict from one run
// on one machine is a measurement and not a guarantee, and the ones that ran past this round's cap have no
// verdict at all.
