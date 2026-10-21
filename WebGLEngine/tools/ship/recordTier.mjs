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
import { mergeTimings } from "./sweepRotation.mjs";
import { readFile } from "./sweepCoverage.mjs";
import { timingsTarget, SKIP_LINE, DEFAULTS } from "./quickSweep.mjs";

// ---- THE CAP, WHICH WAS A TYPED 60,000 AND SAT BELOW THIS TIER'S OWN SLOWEST MEMBER --------------------------
//
// *** v4674 -- MEASURED: THE TIER KILLED A GREEN GATE BY 196 MILLISECONDS AND TOOK SIX RECORDS WITH IT. ***
// This tier's slowest member came back NO VERDICT at 60,063 ms against the typed cap of 60,000. Run alone it
// finishes in 60,196 ms and is ALL GREEN, and on a loaded box it took 105,810 ms. Six records -- the six that
// gate guards -- lost their verdict to a 0.3% margin, and a no-verdict is not a pass: it fails this step, so
// the ritual was red for a reason that was nobody's code.
//
// THE GATE IS NOT NAMED HERE, and that is section 1's rule rather than discretion: this module must not carry
// a single tier gate's path, because a typed name is a second declaration that rots the first time a gate
// crosses the budget in either direction. The first draft of this note named it and section 1 caught it.
// tools/ship/recordTier-selfcheck.mjs carries the name and the numbers.
//
// *** AND THE CAP WAS DOING TWO JOBS UNDER ONE NAME. *** In the PARALLEL sweep a cap is a budget -- it bounds
// what the ship spends. Here the gates run ONE AT A TIME because they are the expensive tail, so nothing is
// competing and a cap bounds nothing except the damage a HANG can do. Pricing a serial backstop with a
// budget's number is the two-things-one-label fault this tree names most often, and it cost six records.
//
// DERIVED, NOT TYPED. The floor is 3x the slowest member ever measured here (quickSweep-selfcheck at
// 60,196 ms), and above that the cap tracks twice the slowest reading the tier itself has FILED -- see
// runTier, which now records what it observes instead of discarding it. A tree whose guardians get slower
// raises its own backstop; a hung gate still dies.
export const TIER_CAP_FLOOR_MS = 180000;
export const TIER_CAP_MARGIN = 2;

/** The backstop for this run, from the tier's own filed readings. Pure, so a gate can drive it on a fixture. */
export function tierCapMs(file, gates) {
    const serial = (file && file.serial) || {};
    const known = gates.map((g) => serial[g.gate]).filter((v) => typeof v === "number" && v > 0);
    const slowest = known.length ? Math.max(...known) : null;
    return Object.freeze({
        capMs: Math.max(TIER_CAP_FLOOR_MS, Math.ceil((slowest || 0) * TIER_CAP_MARGIN)),
        slowest, measured: known.length, of: gates.length,
        why: known.length
            ? `${TIER_CAP_MARGIN}x the slowest of ${known.length} filed tier reading(s), floored at ${TIER_CAP_FLOOR_MS} ms`
            : `no tier reading filed yet, so the floor stands at ${TIER_CAP_FLOOR_MS} ms`,
    });
}

/** The gates that guard a record and cannot be afforded by the sweep, newest reading first. */
export function tierGates({ root = ENG } = {}) {
    return reach({ root }).blockers.slice().sort((a, b) => b.ms - a.ms);
}

/**
 * Run them. Serially and with a cap, because they are the expensive tail -- eight at a time is what
 * SWEEP_CONTENTION_V4562 measured inflating a serial reading by a 2.41x median, and a tier that produced a
 * false red on its own parallelism would be worse than no tier.
 */
export function runTier({ root = ENG, capMs = null, onProgress = null, write = true } = {}) {
    const gates = tierGates({ root });
    const prior = readFile();
    const cap = tierCapMs(prior, gates);
    const capUsed = capMs == null ? cap.capMs : capMs;
    const t0 = Date.now();
    const rows = [];
    for (const b of gates) {
        const t = Date.now();
        // *** v4674 -- THE OUTPUT IS READ NOW, AND NOT BECAUSE THE REPORT WANTED PROSE. *** This was
        // stdio:"ignore", which makes a SKIP indistinguishable from a run: a gate that declines prints its
        // declaration and exits 0 in milliseconds, and filing that as a runtime is what put placementRender
        // in the timings at its skip cost THREE TIMES (quickSweep's KIND note). The tier files readings now,
        // so it has to be able to tell.
        const r = spawnSync(process.execPath, [path.join(root, b.gate)], { cwd: root, encoding: "utf8", timeout: capUsed });
        const ms = Date.now() - t;
        // *** A TIMEOUT IS NOT A FAILURE AND IS NOT A PASS. *** v4392's rule, and the reason KILLED_PASS_V4568
        // exists: a count of failures is not a verdict unless the process finished. spawnSync reports a kill
        // through `signal`, and an `error` for a spawn that never started.
        const killed = !!r.signal || (r.error && /ETIMEDOUT/.test(String(r.error.code)));
        const out = ((r.stdout || "") + "\n" + (r.stderr || ""));
        const skipped = !killed && SKIP_LINE.test(out);
        rows.push({ gate: b.gate, records: b.records, ms, code: killed ? null : (r.status ?? 1), killed, skipped,
                    tail: killed || (r.status ?? 1) !== 0 ? out.trim().split("\n").slice(-12).join("\n") : null });
        if (onProgress) onProgress(rows.length, gates.length, b.gate);
    }
    // *** v4674 -- AND THE READINGS ARE FILED RATHER THAN DISCARDED. ***
    //
    // This loop already produces the single best timing in the tree for every gate it runs: UNCONTENDED (one
    // at a time, by design), COMPLETE (or explicitly killed), and taken at ship time on the ship box. It threw
    // every one of them away. THE COST OF THAT, MEASURED: one member was carrying a recorded 5,981 ms against
    // the 60,196 ms it actually takes -- a ten-fold understatement in the number that decides tier membership
    // and that a reader uses to predict what the tier costs. Named in this module's gate, not here, per
    // section 1's no-typed-names rule.
    //
    // Written through sweepRotation.mergeTimings, which is the rotation's writer and already knows the rules
    // this file would otherwise have to restate: serial and serialRing get the reading, `contended` is false,
    // `finished` records whether a verdict exists, and `kinds` distinguishes alone / capped / skipped. Through
    // timingsTarget, so v4647's rule holds -- a FOREIGN box writes its own file instead of overwriting this one.
    let wrote = null;
    if (write && rows.length) {
        const target = timingsTarget(prior, { file: DEFAULTS.timingsFile });
        const stamp = new Date().toISOString();
        const { merged } = mergeTimings(prior, rows, stamp, capUsed);
        fs.writeFileSync(path.join(root, target.file), JSON.stringify(merged, null, 1) + "\n");
        wrote = { file: target.file, foreign: !!target.foreign, why: target.why || null, stamp, gates: rows.length };
    }
    const red = rows.filter((r) => !r.killed && r.code !== 0);
    const noVerdict = rows.filter((r) => r.killed);
    return { rows, red, noVerdict, ms: Date.now() - t0, cap, capUsed, wrote,
             skipped: rows.filter((r) => r.skipped).map((r) => r.gate),
             records: rows.reduce((a, r) => a + r.records.length, 0),
             ok: red.length === 0 && noVerdict.length === 0 };
}

export function reportLines(r = null) {
    const res = r || runTier();
    const L = [];
    L.push(`[recordTier] ${res.rows.length} guardian gate(s) the sweep cannot afford, covering ${res.records} ` +
           `record(s), in ${(res.ms / 1000).toFixed(0)} s: ${res.rows.length - res.red.length - res.noVerdict.length} ` +
           `green, ${res.red.length} red, ${res.noVerdict.length} no verdict.`);
    // *** THE BACKSTOP SAYS WHERE IT CAME FROM. *** A typed 60,000 killed a green gate by 196 ms and nothing
    // in the report said what the number was or why, so the six records it cost looked like a gate's fault.
    if (res.cap)
        L.push(`[recordTier] backstop ${res.capUsed} ms -- ${res.cap.why}` +
               (res.cap.slowest ? ` (slowest filed: ${res.cap.slowest} ms over ${res.cap.measured} of ${res.cap.of})` : ""));
    if (res.wrote)
        L.push(`[recordTier] filed ${res.wrote.gates} uncontended reading(s) into ${res.wrote.file}` +
               (res.wrote.foreign ? ` -- FOREIGN BOX, its own file: ${res.wrote.why}` : "") +
               `. These are the cleanest timings this tree takes: one gate at a time, run to completion, at ship time.`);
    if (res.skipped && res.skipped.length)
        L.push(`[recordTier] ${res.skipped.length} gate(s) DECLINED rather than ran, and are filed as skips ` +
               `rather than as runtimes: ${res.skipped.join(", ")}`);
    for (const row of res.rows)
        L.push(`   ${row.killed ? "NO VERDICT" : row.code === 0 ? "green     " : "RED       "} ` +
               `${String(row.ms).padStart(6)} ms  ${row.gate}  (${row.records.length} record(s))`);
    if (res.red.length) {
        L.push("[recordTier] *** A RECORD'S GUARDIAN IS RED. *** These gates are outside the sweep, so nothing");
        L.push("[recordTier] else at ship time was going to say so.");
        for (const row of res.red) {
            L.push("      " + row.gate + "  guards " + row.records.join(", "));
            // v4648's finding, applied here: the evidence exists for the length of one process and is
            // available nowhere else once it is gone. A ship that stops on this line should not have to
            // re-run a 60-second gate to find out what it said.
            for (const l of (row.tail || "").split("\n").filter((x) => /FAIL|Error|error/.test(x)).slice(-3))
                L.push("          " + l.trim().slice(0, 150));
        }
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
