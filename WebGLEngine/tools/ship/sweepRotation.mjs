// WebGLEngine/tools/ship/sweepRotation.mjs
//
// Run: node tools/ship/sweepRotation.mjs [--budget-s 180] [--slots 24] [--gate <substring>] [--write]
//
// v4408 -- THE DOOR SWINGS BOTH WAYS. The quick sweep excludes a gate that measured over 3,000 ms and then
// never measures it again, so the exclusion is permanent and rests on a reading whose age the file could not
// state. This runs a SLICE of the over-budget population, stalest first, under a wall-clock budget, and
// rewrites those entries with a per-entry `at`. Over enough rounds every over-budget gate is re-timed, and the
// number of rounds that takes is DERIVED from the population and the slice rather than asserted.
//
// SERIAL ON PURPOSE. The budget is a serial number and v4297 measured what parallel starvation does to timings
// -- 38 of 107 phase-1 reds were starvation, not failure. A rotation that re-times under load would evict
// healthy gates on a manufactured reading, which is the defect it exists to undo.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { enumerateGates } from "./gateSweep.mjs";
import { ENG, census, rotation, readFile, backfillStamps, BUDGET_MS, CAP_MS } from "./sweepCoverage.mjs";
import { runGate } from "./redCensus.mjs";

export function runSlice(picked, { capMs = CAP_MS, onProgress = null } = {}) {
    const rows = [];
    for (let i = 0; i < picked.length; i++) {
        const g = picked[i];
        const t0 = Date.now();
        let code = 1;
        try { code = runGate(g, { timeoutMs: capMs }).code; } catch { code = 1; }
        const ms = Date.now() - t0;
        // *** v4568 -- WHETHER THE PROCESS FINISHED IS RECORDED, NOT INFERRED FROM THE NUMBER. ***
        // The whole defect in the killed bucket is that "at or over the cap" was read as "no verdict", so a
        // gate that ran to completion in 50 s and a gate cut off at 20 s were the same entry. runGate returns
        // "timeout/signal" as its code for a kill, which is the fact itself rather than a threshold test on
        // the clock -- a gate finishing 3 ms under the cap is finished, and a slow box does not change that.
        rows.push({ gate: g, ms, code, finished: code !== "timeout/signal" });
        if (onProgress) onProgress(i + 1, picked.length, rows[rows.length - 1]);
    }
    return rows;
}

// Returnees are the point: a gate whose fresh serial reading is UNDER the budget rejoins the ship-time sweep.
// `capMs` is a PARAMETER now, not the module constant: --killed runs at its own, larger cap, and a
// classifier testing 20,000 ms against a 90 s run would call a gate that finished in 25 s "killed" and a
// gate that really was cut off at 90 s a red. v4392's rule -- a count of failures is not a verdict unless
// the process finished -- is only enforceable if the classifier knows what finishing meant for that run.
// `finished` on the row is the fact itself and is preferred wherever it is present.
export function classifyRows(rows, { budgetMs = BUDGET_MS, priorMs = {}, capMs = CAP_MS } = {}) {
    const cut = (r) => (r.finished === undefined ? r.ms >= capMs : !r.finished);
    const returnees = rows.filter((r) => r.ms <= budgetMs && !cut(r));
    const reds = rows.filter((r) => r.code !== 0 && !cut(r));
    const killed = rows.filter(cut);
    const slower = rows.filter((r) => priorMs[r.gate] != null && r.ms > priorMs[r.gate] * 1.5);
    return { returnees, reds, killed, slower };
}

/**
 * *** REBUILDING `finished` FROM THIS FILE'S OWN LEDGER, AFTER A SWEEP ERASED IT. ***
 *
 * v4568 added `finished` to sweep-timings.json and quickSweep computed it and did not write it, so the first
 * full sweep after the killed pass deleted 140 rows of it. The pass itself is 75 minutes and re-running it to
 * recover a field is paying for a measurement twice.
 *
 * It does not need re-measuring, because sweep-rotation.json is this file's OWN ledger and holds the exit
 * code of every row the pass ran -- it survived exactly because ROTATION_LOST_V4461 gave it a separate
 * writer for this class of accident. `finished` is DERIVED from a code the ledger already holds.
 *
 * WHAT MAKES THIS A RECONSTRUCTION AND NOT A FABRICATION -- the 2026-09-03 fault is a number written by
 * something other than the thing that measured it -- is that a row is only rebuilt when the ledger and the
 * timings file still describe THE SAME RUN: same ms, same code. A gate re-timed since carries a different
 * reading and is left alone, because the ledger no longer knows anything about its current state.
 */
export function rebuildFinished(file, ledger) {
    const timings = file.timings || {}, codes = file.codes || {};
    const finished = { ...(file.finished || {}) };
    let rebuilt = 0, skipped = 0;
    for (const r of ledger.rotated || []) {
        if (timings[r.gate] !== r.ms || String(codes[r.gate]) !== String(r.code)) { skipped++; continue; }
        if (finished[r.gate] !== undefined) continue;
        finished[r.gate] = r.code !== "timeout/signal";
        rebuilt++;
    }
    return { finished, rebuilt, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
    const budgetMs = Number(arg("--budget-s", 180)) * 1000;
    const slots = Number(arg("--slots", 24));
    const file = readFile();
    if (process.argv.includes("--rebuild-finished")) {
        const led = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8"));
        const { finished, rebuilt, skipped } = rebuildFinished(file, led);
        console.log(`[rotation] --rebuild-finished: ${rebuilt} row(s) restored from this file's own ledger, ` +
            `${skipped} skipped because the timings no longer describe the run the ledger recorded`);
        if (process.argv.includes("--write")) {
            fs.writeFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"),
                JSON.stringify({ ...file, finished }, null, 1) + "\n");
            console.log("[rotation] wrote sweep-timings.json");
        } else console.log("[rotation] dry run -- pass --write to record");
        process.exit(0);
    }
    const gates = enumerateGates(ENG);
    const c = census(gates, file);
    // *** v4535 -- --gate: RE-TIME A NAMED GATE THROUGH THE OWNER INSTEAD OF TYPING ITS NUMBER BY HAND. ***
    // The stalest-first pick is right for covering the pool and useless for the case that turns up every time
    // somebody makes a gate FASTER: quickSweep will not re-time it (it is recorded over budget, so it is
    // skipped -- the one-way door this file exists to open), and the rotation will not reach it for rounds
    // because it was just measured. The only remaining way to correct the record was to edit
    // sweep-timings.json directly, WHICH IS THE 2026-09-03 FAULT sweepCoverage.mjs is built around: a number
    // written by something other than the thing that measured it, carrying a stamp it did not earn. Same
    // slice runner, same classifier, same writer, same per-entry stamp -- only the selection differs.
    const only = arg("--gate", null);
    // *** v4565 -- --band: SELECT BY RECORDED COST, FOR THE SAME REASON v4535 ADDED --gate. ***
    // The stalest-first pick is right for covering the pool and wrong for the bulk pass backlog item #14
    // asks for. The returnees live at the CHEAP end -- a gate recorded at 4 s that really takes 1 s -- and
    // those are also the fastest to measure, so stalest-first spends an hour on 20-second gates that were
    // never going to come back before it reaches them. Same slice runner, same classifier, same writer, same
    // per-entry stamp; only the selection differs, which is the rule --gate established.
    // *** v4568 -- --killed: THE BUCKET THE ROTATION COULD NEVER REACH. ***
    // OVER_BUDGET_PASS_V4565 named 140 gates that hit the 20,000 ms cap as "39% of everything outside the
    // sweep, behind a door with no handle", because rotation() walked c.over and c.killed is a different
    // bucket. Re-running them AT the cap they died on can only reproduce the death, so this mode takes its
    // own, larger cap. Everything else is the same slice runner, classifier, writer and per-entry stamp.
    const killedMode = process.argv.includes("--killed");
    const capMs = Number(arg("--cap-s", killedMode ? 90 : CAP_MS / 1000)) * 1000;
    const band = arg("--band", null);   // "3000-8000", in the units the timings file uses
    const inBand = (g) => {
        if (!band) return true;
        const [lo, hi] = band.split("-").map(Number);
        const ms = (file.timings || {})[g];
        return ms != null && ms > lo && ms <= hi;
    };
    const pickOpts = { slots, budgetMs, filter: inBand, includeKilled: killedMode };
    const picked = only ? gates.filter((g) => g.includes(only))
                        : killedMode ? c.killed.slice(0, slots)
                        : rotation(c, file, pickOpts).picked;
    if (killedMode) console.log(`[rotation] --killed: ${c.killed.length} gate(s) have hit the cap, taking ` +
        `${picked.length} at a ${capMs / 1000} s cap. ${(c.noVerdict || []).length} of them have NO VERDICT AT ALL.`);
    if (only && !picked.length) { console.error("[rotation] --gate " + only + " matched no gate"); process.exit(2); }
    if (only) console.log(`[rotation] --gate ${only}: ${picked.length} gate(s), selection by name rather than by staleness`);
    else if (killedMode) { /* its own line is printed above; the over-budget pool is not this run's subject */ }
    else {
        const rot = rotation(c, file, { slots, budgetMs, filter: inBand });
        if (band) console.log(`[rotation] --band ${band}: selection by recorded cost rather than by staleness`);
        console.log(`[rotation] over-budget pool ${rot.pool}, taking ${rot.picked.length} (est ${(rot.cost / 1000).toFixed(0)}s), ` +
            `covers the pool in ${rot.roundsToCover} round(s) at this slice size`);
    }
    const rows = runSlice(picked, { capMs, onProgress: (d, t, r) => process.stderr.write(`[rotation] ${d}/${t}  ${r.gate}  ${r.ms}ms exit ${r.code}\n`) });
    const k = classifyRows(rows, { priorMs: file.timings || {}, capMs });
    console.log(`[rotation] ran ${rows.length}: ${k.returnees.length} now UNDER budget, ${k.reds.length} red, ${k.killed.length} hit the cap, ${k.slower.length} materially slower`);
    for (const r of k.returnees) console.log(`[rotation]   returnee  ${r.gate}  ${(file.timings || {})[r.gate]} -> ${r.ms} ms`);
    for (const r of k.reds) console.log(`[rotation]   RED       ${r.gate}  exit ${r.code} in ${r.ms} ms`);
    if (killedMode) {
        const fin = rows.filter((r) => r.finished);
        console.log(`[rotation] ${fin.length} of ${rows.length} FINISHED and now have a verdict ` +
            `(${fin.filter((r) => r.code === 0).length} green, ${fin.filter((r) => r.code !== 0).length} red); ` +
            `${rows.length - fin.length} did not finish even at ${capMs / 1000} s`);
        for (const r of fin.filter((x) => x.ms < CAP_MS)) console.log(`[rotation]   under the old cap  ${r.gate}  ${r.ms} ms exit ${r.code}`);
    }
    if (process.argv.includes("--write")) {
        const stamp = new Date().toISOString();
        const timings = { ...(file.timings || {}) }, codes = { ...(file.codes || {}) }, at = { ...(file.at || {}) };
        const priorMs = {};
        const finished = { ...(file.finished || {}) };
        for (const r of rows) { priorMs[r.gate] = (file.timings || {})[r.gate]; timings[r.gate] = r.ms; codes[r.gate] = r.code; at[r.gate] = stamp;
            // Recorded either way: a gate that STOPS finishing must lose its verdict, not keep an old true.
            finished[r.gate] = !!r.finished; }
        backfillStamps(timings, at);
        fs.writeFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"),
            JSON.stringify({ ...file, timings, codes, at, finished }, null, 1) + "\n");
        // Its OWN file: quickSweep builds a fresh object each write and erased this ledger the first time it ran.
        // *** v4535 -- MERGED BY GATE, NOT REPLACED WHOLESALE. *** ROTATION_LOST_V4461 records that this ledger
        // "holds only the last run", and said so as a limitation it had to work around. A one-gate --write then
        // costs eighty rows to record two, and rotationHeld -- whose whole job is comparing this ledger against
        // the timings -- goes from checking eighty gates to checking two. Rows are keyed by gate and the newest
        // reading wins, so a re-run corrects its own entry and touches nothing else. EVERY ROW NOW CARRIES ITS
        // OWN `at`, for the reason v4408 gave the timings file one: a file-level stamp on rows a run did not
        // touch is a date they did not earn.
        // *** v4548 -- THE LINE ABOVE SAYS "EVERY ROW NOW CARRIES ITS OWN at" AND SEVENTY-EIGHT OF EIGHTY DID
        // NOT. *** v4535 started stamping rows and never backfilled the ones already in the file, so the
        // ledger held 2 stamped rows and 78 relying on the file-level date -- and sweepCoverage's
        // `freshlyRetimed` falls back to that file-level date for any row without its own. A --gate run that
        // re-times ONE gate rewrites it, so a two-gate rotation at v4548 re-dated all seventy-eight and made
        // TEN UNTOUCHED GATES read as LOST: their timings stamps sat between the old ledger date and the new
        // one, so they went from "re-timed since the rotation" to "the rotation's reading is gone" without
        // anything about them changing. Exactly the fault v4408 fixed in sweep-timings.json -- "a file-level
        // stamp on rows a run did not touch is a date they did not earn" -- surviving in the file that
        // quotes it. A legacy row is backfilled with the ledger's PREVIOUS date, which is its real
        // provenance, before the file-level one moves.
        let priorLedger = {};
        let priorAt = null;
        try {
            const prev = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8"));
            priorAt = prev.at || null;
            for (const r of prev.rotated || []) priorLedger[r.gate] = r.at ? r : { ...r, at: priorAt };
        } catch {}
        for (const r of rows) priorLedger[r.gate] = { gate: r.gate, ms: r.ms, code: r.code, priorMs: priorMs[r.gate], at: stamp };
        const merged = Object.values(priorLedger).sort((a, b) => a.gate < b.gate ? -1 : a.gate > b.gate ? 1 : 0);
        fs.writeFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), JSON.stringify({
            generatedFrom: "tools/ship/sweepRotation.mjs",
            note: "The over-budget gates this rotation re-timed SERIALLY, with the reading that had evicted each. " +
                  "Written only by tools/ship/sweepRotation.mjs -- sweep-timings.json has a different owner. " +
                  "MERGED BY GATE (v4535): `at` on the file is the LAST run, `at` on a row is the run that " +
                  "measured that row, and a row survives until its own gate is re-timed.",
            at: stamp, budgetMs: BUDGET_MS, lastRun: rows.length, rotated: merged,
        }, null, 1) + "\n");
        console.log(`[rotation] wrote ${rows.length} entries with at=${stamp}`);
    } else console.log("[rotation] dry run -- pass --write to record");
    process.exit(k.reds.length ? 1 : 0);
}
