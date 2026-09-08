// WebGLEngine/tools/ship/recordReach.mjs -- v4548
//
// *** THE SHIP RITUAL CHECKS 49 OF THIS TREE'S 93 FROZEN RECORDS. THE OTHER 44 IT DOES NOT TOUCH. ***
//
// The round that produced this file started from two gates. tools/ship/frozenRecords-selfcheck.mjs and
// tools/ship/recordDrift-selfcheck.mjs measured 3,446 ms and 3,026 ms against a 3,000 ms ship-time sweep
// budget, so neither ran at ship time -- and BUDGET_DRIFT_V4536 was added to the tree at commit 4817a29b
// without its census being re-taken, after which nine rounds shipped ALL GREEN over a record that was wrong.
// Fixing those two was the obvious job. Asking how many OTHER records are in the same position was not, and
// it is where the number is:
//
//     93 frozen records
//     49  checked at ship time -- at least one guardian gate is under the budget
//     25  guarded ONLY by gates over the budget, so the guard exists and never runs
//     19  guarded by nothing at all
//     --  44 of 93, FORTY-SEVEN PER CENT, unchecked by the ritual
//
// *** AND THREE OF THE GUARDS ARE NOT MERELY SLOW, THEY ARE AT THE TIMEOUT CAP. *** redCensus-selfcheck,
// transmission-selfcheck and dockFraming-selfcheck are recorded at 20,021 / 20,015 / 20,009 ms against a
// 20,000 ms cap -- they do not finish. FIXED_AT_V4279, BTDF_VERDICT_V4458 and NOISE_FLOOR_V4304 have a
// guardian on paper and nothing that has run in a very long time.
//
// ---- WHAT THIS MODULE IS FOR, AND WHAT IT DELIBERATELY IS NOT ----------------------------------------------
//
// It is a RATCHET, not a target. It does not claim 44 is acceptable and it does not try to fix them: three of
// those gates are at the cap and one is a twenty-second commit walk over a vendored repository, which are
// four separate rounds and not this one. What it refuses is the failure that produced it -- a record whose
// last guardian quietly drifts over the budget, and nothing anywhere says so.
//
// The population is DERIVED on every run, from tools/ship/frozenRecords.mjs's census joined to
// tools/ship/sweep-timings.json, because the whole subject of this file is a number that went stale while
// being recorded. A pinned list of unreachable records would be the same defect one level up.
//
// *** THE JOIN IS THE WHOLE INSTRUMENT AND EITHER HALF ALONE SAYS NOTHING. *** frozenRecords already knew
// which gates name which records; quickSweep already knew which gates it can afford. Neither knew that
// twenty-five records sit in the gap, because nothing had ever put the two tables next to each other.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FR from "./frozenRecords.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The sweep's own default, read rather than retyped -- see quickSweep.DEFAULTS.budgetMs. */
export const TIMINGS = "tools/ship/sweep-timings.json";

export function readTimings(root = ENG) {
    try { return JSON.parse(fs.readFileSync(path.join(root, TIMINGS), "utf8")); }
    catch { return { timings: {}, codes: {}, budgetMs: null, capMs: null }; }
}

export const CLASS = Object.freeze({
    CHECKED: "checked",            // at least one guardian gate runs at ship time
    OVER_BUDGET: "over-budget",    // guarded, but every guardian is too slow for the sweep
    UNGUARDED: "unguarded",        // no gate anywhere names it
});

/**
 * Join the record census to the sweep timings and classify every record.
 *
 * `timings` and `census` are injectable so the gate can hand this a world where one gate got slower and
 * watch the count move -- a ratchet that cannot be shown to move is a number nobody has tested.
 */
export function reach({ budgetMs = null, timings = null, census = null, root = ENG } = {}) {
    const t = timings || readTimings(root);
    const budget = budgetMs ?? t.budgetMs ?? 3000;
    const c = census || FR.census();
    const runsAtShipTime = (g) => t.timings?.[g] != null && t.timings[g] <= budget;
    const rows = c.records.map((r) => {
        const cls = !r.guardians.length ? CLASS.UNGUARDED
            : r.guardians.some(runsAtShipTime) ? CLASS.CHECKED
            : CLASS.OVER_BUDGET;
        return Object.freeze({
            name: r.name, file: r.file, guardians: r.guardians, cls,
            // the cheapest guardian, so a reader knows how far from the budget the record actually is
            bestMs: r.guardians.length ? Math.min(...r.guardians.map((g) => t.timings?.[g] ?? Infinity)) : null,
        });
    });
    const by = (k) => rows.filter((r) => r.cls === k);
    const overBudget = by(CLASS.OVER_BUDGET), unguarded = by(CLASS.UNGUARDED);
    // Gates that are the ONLY thing standing between a record and nobody checking it, and are too slow to
    // stand there. Sorted slowest first, because the three at the cap are a different problem from the
    // three that are a few hundred milliseconds over.
    const blockers = new Map();
    for (const r of overBudget) for (const g of r.guardians) {
        if (!blockers.has(g)) blockers.set(g, { gate: g, ms: t.timings?.[g] ?? null, records: [] });
        blockers.get(g).records.push(r.name);
    }
    return Object.freeze({
        budgetMs: budget, capMs: t.capMs ?? null,
        total: rows.length,
        checked: by(CLASS.CHECKED).length,
        overBudget: overBudget.length,
        unguarded: unguarded.length,
        unchecked: overBudget.length + unguarded.length,
        rows: Object.freeze(rows),
        blockers: Object.freeze([...blockers.values()].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))),
        // A gate recorded AT OR OVER the cap did not finish; it is a different fact from "slow" and is
        // counted separately so a report cannot blur them.
        atCap: Object.freeze([...blockers.values()].filter((b) => t.capMs != null && b.ms >= t.capMs).map((b) => b.gate)),
    });
}

/**
 * *** THE RATCHET. *** Measured at v4548, on the tree as this round left it. It is a CEILING that may fall
 * and must not rise: a round that puts a record's last guardian over the budget moves `unchecked` up and the
 * gate goes red, which is exactly what nothing did when frozenRecords-selfcheck crossed at v4536.
 *
 * These are not a target. 44 was the number BEFORE this round; the four rescued here are the two record
 * detectors' own records, recovered by making those gates 2.5x and 1.4x faster rather than by widening the
 * budget for them.
 */
export const REACH_AT_V4548 = Object.freeze({
    at: "v4548",
    budgetMs: 3000,
    total: 94,
    // *** READ OFF THE INSTRUMENT, NOT PREDICTED. *** The first draft of this record guessed 53/21/19/40 from
    // which gates the round had sped up, and was wrong on three of the four: the comment-strip fix below
    // moved two records the other way at the same time, and a guess cannot see two changes at once.
    // BEFORE (93 records, both detectors over budget): 49 checked, 25 over-budget, 19 unguarded, 44 unchecked.
    beforeThisRound: Object.freeze({ total: 93, checked: 49, overBudget: 25, unguarded: 19, unchecked: 44 }),
    // AFTER, and the two movements are in opposite directions and both real:
    //   frozenRecords-selfcheck 3,289 -> 1,255 ms and recordDrift-selfcheck 3,164 -> 1,820 ms brought four
    //   records back inside the budget;
    //   stripping comments before the guardian search took TWO records OUT of "guarded" altogether, because
    //   they were credited to gates that only MENTION them in prose.
    checked: 51, overBudget: 23, unguarded: 20, unchecked: 43,
    // THREE, not four. The first draft of this list said four and put MEASURED_V4527 in BOTH -- rescued by
    // the faster gate AND demoted by the comment strip -- which cannot both be true of one record and was
    // caught by the gate rather than by re-reading. Its only guardian named it in a COMMENT, so the strip
    // took the guardian away entirely and there was nothing left for the speedup to rescue.
    rescued: Object.freeze(["PROBE_AT_V4536", "PROBE_AT_V4487", "DRIFT_AT_V4482"]),
    demotedByCommentStrip: Object.freeze(["BUDGET_DRIFT_V4536", "MEASURED_V4527"]),
    // The three whose guardian does not merely miss the budget but never finishes at all.
    atCapGates: Object.freeze([
        "tools/ship/redCensus-selfcheck.mjs",
        "physics/render/transmission-selfcheck.mjs",
        "tools/ship/dockFraming-selfcheck.mjs",
    ]),
});

export function reportLines() {
    const r = reach();
    const out = [
        "[recordReach] which frozen records the ship ritual actually checks",
        `  ${r.total} records at a ${r.budgetMs} ms budget: ${r.checked} checked, ${r.overBudget} guarded only by ` +
        `over-budget gates, ${r.unguarded} guarded by nothing`,
        `  => ${r.unchecked} of ${r.total} (${(100 * r.unchecked / r.total).toFixed(0)}%) not checked at ship time`,
    ];
    for (const b of r.blockers.slice(0, 8))
        out.push(`    ${String(b.ms).padStart(6)} ms  ${b.gate}  (${b.records.length} record(s))`);
    if (r.atCap.length) out.push(`  AT THE ${r.capMs} ms CAP -- these do not finish: ${r.atCap.join(", ")}`);
    return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
    for (const l of reportLines()) console.log(l);
