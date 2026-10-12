// WebGLEngine/tools/ship/poolWatch.mjs -- v4832
//
// WHAT THE QUICK SWEEP DOES NOT RUN, SAID OUT LOUD. The sweep runs every gate under the budget (3,000 ms) and skips the rest -- 449 gates at v4831, the expensive ones -- and the rotation re-times 80 of them a
// ship. A red in that pool is invisible to the verdict unless somebody reads the rotation's log: at v4830 the rotation returned gfx/frontDoor-selfcheck.mjs red (a list of arrivals four modules short, red since
// at least 6 October) and tools/ship/definitionGates-selfcheck.mjs over its ceilings two ships before, and the only thing that stood between either and a SHIP verdict was the person reading the log.
//
// THREE KINDS OF THING LIVE IN THE POOL, and they are different findings:
//   RECORDED RED   the record holds a real exit code (1, 2, ...) for a skipped gate. Somebody ran it, it failed, and nothing re-ran it. If no register names it, it is a red the verdict cannot see -- and
//                  this is the one that FAILS the ship (tools/ship/verify.mjs calls census() after the sweep; poolWatch-selfcheck holds the committed record to the same rule).
//   CAPPED         the record holds exit 124 or "timeout/signal": the gate was killed at a cap before it said anything. Not a red -- NO VERDICT. Counted and named, never passed off as green.
//   STALE          a green reading is only as good as its age. The census prints how old the pool's readings are, because a gate whose reading predates the code it checks is unconfirmed whatever the record says.
//
// *** WHY THIS DOES NOT SKIP A GATE WHOSE INPUTS HAVE NOT CHANGED (tools/ship/inputSets.mjs's whyRun), WHICH WOULD BE THE FIX FOR STALENESS: MEASURED AT v4831, 444 OF THE 449 OVER-BUDGET GATES HAVE NO RECORDED
// INPUT SET. *** The input record covers the gates the quick sweep runs (1,461 of them); the pool is exactly the gates it does not. So "inputs unchanged" cannot say whether a pool reading is still true, and the
// age census is what is left: it makes the window visible instead of closing it. Closing it needs the rotation to record input sets as it runs the pool, which is a mechanism of its own (NOT DONE here).
"use strict";

/** What a recorded exit code means: "ok", "capped" (killed at a cap -- no verdict) or "red" (a real nonzero exit). */
export function kindOfCode(code) {
    if (code === 0) return "ok";
    if (code === 124 || code === "timeout/signal") return "capped";
    if (typeof code === "number" && Number.isFinite(code)) return "red";
    return "unknown";
}

const DAY = 86400000;
export const AGE_BUCKETS = Object.freeze([["within a day", 1 * DAY], ["within a week", 7 * DAY], ["within a month", 30 * DAY]]);

/**
 * The pool census. record: sweep-timings.json's parsed content; enumerated: the live gate list (a gate the tree no longer has is not a gate -- the record carries fixtures and dropped names);
 * register: redCensus' Map(gate -> record) or null. Returns { pool, recordedRed, unregisteredRed, capped, ages, oldest, unknown }.
 */
export function census(record, { enumerated = null, register = null, now = Date.now(), budgetMs = null } = {}) {
    const rec = record || {}, timings = rec.timings || {}, codes = rec.codes || {}, at = rec.at || {}, budget = budgetMs ?? rec.budgetMs ?? 3000;
    const live = enumerated ? new Set(enumerated) : null;
    const pool = Object.keys(timings).filter((g) => (!live || live.has(g)) && timings[g] > budget).sort();
    const recordedRed = [], capped = [];
    const ages = Object.fromEntries([...AGE_BUCKETS.map(([n]) => [n, 0]), ["older", 0], ["no date", 0]]);
    let oldest = null;
    for (const g of pool) {
        const kind = kindOfCode(codes[g]);
        if (kind === "red") recordedRed.push({ gate: g, code: codes[g], record: register && register.get(g) || null, readAt: at[g] || null });
        else if (kind === "capped") capped.push(g);
        const t = at[g] ? Date.parse(at[g]) : NaN;
        if (!Number.isFinite(t)) { ages["no date"]++; continue; }
        const age = now - t, b = AGE_BUCKETS.find(([, ms]) => age <= ms);
        ages[b ? b[0] : "older"]++;
        if (!oldest || t < oldest.t) oldest = { gate: g, t, at: at[g], days: Math.floor(age / DAY) };
    }
    return { pool, recordedRed, unregisteredRed: recordedRed.filter((r) => !r.record), capped, ages, oldest, budget };
}

/** One line for the verify log: what the sweep did not run, and the three things worth knowing about it. */
export function describe(c) {
    const a = Object.entries(c.ages).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
    return `${c.pool.length} over-budget gates were NOT run by this sweep: ${c.recordedRed.length} carry a recorded red (${c.unregisteredRed.length} no register names), ${c.capped.length} were capped before saying anything; ` +
        `readings: ${a || "none"}` + (c.oldest ? `; the oldest is ${c.oldest.gate}, ${c.oldest.days} day(s)` : "");
}

/** What to do about a red the register does not name -- the command is the point. */
export function advice(r) {
    return `${r.gate} (exit ${r.code}${r.readAt ? ", read " + r.readAt : ""}): re-run it alone with node tools/ship/sweepRotation.mjs --gate ${r.gate} --cap-s 300 --write -- if it is still red, FIX it; do not register it to get green`;
}
