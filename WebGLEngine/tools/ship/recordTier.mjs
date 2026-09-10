// WebGLEngine/tools/ship/recordTier.mjs -- v4576
//
// Run: node tools/ship/recordTier.mjs [--json]
//
// *** A SECOND TIER FOR THE GATES THAT GUARD A RECORD AND COST MORE THAN THE SWEEP BUDGET. ***
//
// tools/ship/recordReach.mjs joins the frozen-record census to the sweep timings and asks which records the
// ship ritual actually checks. The answer at v4576 is 72 of 104, and of the 32 it does not, TWENTY have a
// guardian that works perfectly and is simply too expensive: nine gates, 3.7 s to 21.5 s each, all over the
// 3,000 ms sweep budget. A gate over budget is not run at ship time, so the record it guards is checked by
// nothing when it matters most.
//
// ---- THE TWO FIXES THE BACKLOG PROPOSED WERE BOTH MEASURED AND ONE OF THEM WAS ALREADY TRIED ----------------
//
// The entry offered "bring both under 3,000 ms, or give the ritual a second tier". v4548 took the first for
// two gates and found the right answer was neither: they were not doing expensive work, they were doing the
// SAME work six times over, and memoising one tree read took 3,289 -> 1,255 ms.
//
// *** SO THAT MEDICINE WAS TRIED HERE FIRST, AND IT DOES NOT APPLY. *** Counting fs CALLS against UNIQUE PATHS
// for the cheapest four of the nine:
//
//     albedoEstimator   696 readFileSync over 696 unique   1.0x
//     raceReplayBake    368 over 324                       1.1x
//     budgetExile         9 over 5, and 340 readdir over 340
//     samplerCheck        0 reads at all -- 9,004 ms of pure arithmetic
//
// There is no redundancy to remove. These gates are slow because their work is slow, and samplerCheck settles
// it: a gate that touches no file at all cannot be sped up by memoising a file read.
//
// So the second tier is right, and it is right for the reason the backlog gave: these are not ordinary gates,
// they are the ritual's own integrity check, and pricing them by the same clock as a geometry fixture is what
// produced the failure it records -- BUDGET_DRIFT_V4536 shipped ALL GREEN for nine rounds over a census that
// was wrong, and was found by hand.
//
// ---- THE LIST IS DERIVED, WHICH IS THE WHOLE DIFFERENCE BETWEEN THIS AND A LIST OF NINE NAMES ---------------
//
// recordReach computes the blockers from the record census and the live timings. Naming them here would be a
// second declaration that goes stale the first time a gate crosses the budget in either direction -- which is
// the fault tools/ship/shipRitual-selfcheck.mjs exists to refuse, and which this file would otherwise be a
// fresh instance of.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reach, ENG } from "./recordReach.mjs";

/** The gates that guard a record and cannot be afforded by the sweep, newest reading first. */
export function tierGates({ root = ENG } = {}) {
    return reach({ root }).blockers.slice().sort((a, b) => b.ms - a.ms);
}

/**
 * Run them. Serially and with a cap, because they are the expensive tail -- eight at a time is what
 * SWEEP_CONTENTION_V4562 measured inflating a serial reading by a 2.41x median, and a tier that produced a
 * false red on its own parallelism would be worse than no tier.
 */
export function runTier({ root = ENG, capMs = 60000, onProgress = null } = {}) {
    const gates = tierGates({ root });
    const t0 = Date.now();
    const rows = [];
    for (const b of gates) {
        const t = Date.now();
        const r = spawnSync(process.execPath, [path.join(root, b.gate)], { cwd: root, stdio: "ignore", timeout: capMs });
        const ms = Date.now() - t;
        // *** A TIMEOUT IS NOT A FAILURE AND IS NOT A PASS. *** v4392's rule, and the reason KILLED_PASS_V4568
        // exists: a count of failures is not a verdict unless the process finished. spawnSync reports a kill
        // through `signal`, and an `error` for a spawn that never started.
        const killed = !!r.signal || (r.error && /ETIMEDOUT/.test(String(r.error.code)));
        rows.push({ gate: b.gate, records: b.records, ms, code: killed ? null : (r.status ?? 1), killed });
        if (onProgress) onProgress(rows.length, gates.length, b.gate);
    }
    const red = rows.filter((r) => !r.killed && r.code !== 0);
    const noVerdict = rows.filter((r) => r.killed);
    return { rows, red, noVerdict, ms: Date.now() - t0,
             records: rows.reduce((a, r) => a + r.records.length, 0),
             ok: red.length === 0 && noVerdict.length === 0 };
}

export function reportLines(r = null) {
    const res = r || runTier();
    const L = [];
    L.push(`[recordTier] ${res.rows.length} guardian gate(s) the sweep cannot afford, covering ${res.records} ` +
           `record(s), in ${(res.ms / 1000).toFixed(0)} s: ${res.rows.length - res.red.length - res.noVerdict.length} ` +
           `green, ${res.red.length} red, ${res.noVerdict.length} no verdict.`);
    for (const row of res.rows)
        L.push(`   ${row.killed ? "NO VERDICT" : row.code === 0 ? "green     " : "RED       "} ` +
               `${String(row.ms).padStart(6)} ms  ${row.gate}  (${row.records.length} record(s))`);
    if (res.red.length) {
        L.push("[recordTier] *** A RECORD'S GUARDIAN IS RED. *** These gates are outside the sweep, so nothing");
        L.push("[recordTier] else at ship time was going to say so.");
        for (const row of res.red) L.push("      " + row.gate + "  guards " + row.records.join(", "));
    }
    if (res.noVerdict.length)
        L.push("[recordTier] a gate that hit the cap has NO VERDICT -- neither red nor green, and not counted as either.");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const res = runTier({ onProgress: (d, t, g) => process.stderr.write(`[recordTier] ${d}/${t} ${g}\n`) });
    if (process.argv.includes("--json")) console.log(JSON.stringify(res, null, 1));
    else for (const l of reportLines(res)) console.log(l);
    process.exit(res.ok ? 0 : 1);
}
