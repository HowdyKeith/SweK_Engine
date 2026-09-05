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
