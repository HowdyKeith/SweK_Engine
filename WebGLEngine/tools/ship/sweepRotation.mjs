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
// v4647 -- whose stopwatch. A box that does not own the record writes its own file rather than
// overwriting one produced on different silicon. See quickSweep.timingsTarget.
import { timingsTarget, KIND } from "./quickSweep.mjs";
import { parseArgs, refusalLines } from "./cliArgs.mjs";

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
/**
 * *** v4647j -- NINETY-EIGHT GATES ARE OUTSIDE THE SHIP-TIME SWEEP ON A NUMBER NOTHING HAS EVER DATED. ***
 *
 * tools/ship/sweepCoverage-selfcheck.mjs has been FIVE RED on clean HEAD for weeks, and it was right every
 * time. Its returnee rows say the rotation's readings were lost and that the entries now carry the
 * pre-v4408 stamp -- "the fingerprint of a file that was REPLACED rather than updated". Measured:
 *
 *   98 gates sit over the 3,000 ms budget in `timings` and under it in `serial`
 *   98 of 98 carry at[g] === "unknown -- before v4408"      <- no run ever dated the membership number
 *   98 of 98 are in sweep-rotation.json, all rotated 2026-09-09
 *   the ledger reading and the LATER serial-slice reading agree: median 0.91x, 83 of 98 within 20%
 *
 * So the 2026-09-09 rotation measured them alone and wrote `timings` and `at`; that write was lost when the
 * file was replaced; the ledger kept it; a later serial slice re-measured them into `serial` and confirmed
 * it. Only the membership field still holds the original undated number, which is 1.5x to 5x larger.
 *
 * SECOND TIME THIS SESSION A RECORD-CHECKING GATE WAS RIGHT AND WAS FILED AS BROKEN (recordDrift was the
 * first). Five red rows, five weeks, one real fault underneath all of them.
 *
 * *** THIS IS NOT A MEMBERSHIP CHANGE. *** quickSweep.costOf()'s own contract says "timings[] remains the
 * membership number it always was", and that stands. What is restored is the membership number itself, from
 * a measurement that exists twice -- and the stamp written is `serialAt`, the date of the run that actually
 * took the surviving reading, never today's and never the ledger's. A number written by something other
 * than the thing that measured it, carrying a stamp it did not earn, is the 2026-09-03 fault this file is
 * built around; restoring one by hand-editing the JSON would have been that fault exactly.
 *
 * REFUSES rather than guesses. A row whose two independent readings disagree by more than `band` is left
 * alone and NAMED: one of the two is wrong and this function cannot say which.
 */
export const CORROBORATION_BAND = 0.2;
export const UNDATED = "unknown -- before v4408";

export function restoreLost(file, ledger, { budgetMs = BUDGET_MS, band = CORROBORATION_BAND } = {}) {
    // *** IT PRODUCES ROWS AND HANDS THEM TO mergeTimings, AND THAT IS A MEASURED CORRECTION. ***
    // The first draft wrote `timings` and `at` by hand. timingKind-selfcheck went red -- 83 entries claiming
    // a LOADED kind while holding a serial number. So it also wrote `kinds` and `contended`. Then
    // skipReading-selfcheck went red -- placementRender at 45 ms carrying code 124, a killer's clock's exit
    // status against a runtime. FOUR MAPS, THREE ROUNDS OF WHACK-A-MOLE, and the sweep's own writer has
    // warned about this shape three times already: "a writer that spells its fields by hand is a list that
    // has to be maintained in step with every reader of the file".
    //
    // mergeTimings is that list, in one place, and it already writes all nine maps plus kindsInferred. A
    // restored reading IS a row: a gate, a serial ms, its exit code, and finished. So the restore decides
    // WHICH gates and mergeTimings decides what a row means -- one writer, and the next map somebody adds
    // arrives here for free.
    const timings = file.timings || {}, at = file.at || {};
    const serial = file.serial || {}, serialAt = file.serialAt || {};
    const led = new Map((ledger.rotated || []).map((r) => [r.gate, r]));
    const rows = [], refused = [], unwitnessed = [], restored = [];
    for (const [gate, row] of led) {
        const now = timings[gate];
        if (now == null || now <= budgetMs) continue;              // already in the sweep; nothing lost
        if (String(at[gate] || UNDATED) !== UNDATED) continue;     // a DATED reading is an observation, not a loss
        // *** A CAP OR A SKIP IS NOT A STALE RUNTIME -- IT IS NO RUNTIME AT ALL, AND THERE IS NOTHING TO
        // RESTORE. *** The first draft restored over both, and tools/ship/placementRender-selfcheck.mjs came
        // out of it holding 45 ms with kind ALONE. It runs in 52-54 ms and PRINTS
        // "placementRender-selfcheck: skipped (jsdom absent)" -- so the number is right and the kind is a
        // lie, and neither this function nor mergeTimings can write KIND.SKIPPED, because only the sweep
        // reads a gate's OUTPUT and only output says a gate declined. tools/ship/skipReading-selfcheck.mjs
        // went red naming it, and it was right.
        //
        // budgetIsOwn already says what a cap reading is: "a reading it produces is the cap's clock rather
        // than a runtime, and is NEVER COMPARED AGAINST A MEASUREMENT". A gate whose membership number is a
        // cap has never been measured, so it needs a RUN -- `--gate` -- and not a restore. This function
        // restores STALE RUNTIMES, which is a smaller and honest claim.
        const priorKind = (file.kinds || {})[gate];
        if (priorKind === KIND.CAPPED || priorKind === KIND.SKIPPED) {
            refused.push({ gate, ledger: row.ms, serial: serial[gate] ?? null, ratio: null, why: `prior reading is a ${priorKind}, not a runtime` });
            continue;
        }
        // A gate the rotation found RED is not a membership candidate, whatever its clock said.
        if (row.code !== 0) { refused.push({ gate, ledger: row.ms, serial: serial[gate] ?? null, ratio: null, why: "not green" }); continue; }
        const s = serial[gate];
        // One reading is an assertion; two independent ones days apart are evidence. Without the second, the
        // ledger alone does not get to move a membership number -- it is the file that was already replaced.
        if (s == null || !serialAt[gate]) { unwitnessed.push(gate); continue; }
        const ratio = s / row.ms;
        if (!(ratio > 1 - band && ratio < 1 + band)) { refused.push({ gate, ledger: row.ms, serial: s, ratio: +ratio.toFixed(2) }); continue; }
        if (s > budgetMs) { refused.push({ gate, ledger: row.ms, serial: s, ratio: +ratio.toFixed(2), why: "over budget" }); continue; }
        rows.push({ gate, ms: s, code: 0, finished: true, stamp: serialAt[gate] });
        restored.push({ gate, from: now, to: s, at: serialAt[gate], ledger: row.ms, ratio: +ratio.toFixed(2) });
    }
    // *** ONE ROW AT A TIME, EACH UNDER ITS OWN STAMP. *** mergeTimings takes one stamp for a whole pass,
    // which is right for a pass; these readings come from different serial slices days apart, and giving
    // them all one date would be the 2026-09-03 fault -- a stamp the reading did not earn.
    let merged = file;
    for (const r of rows) merged = mergeTimings(merged, [r], r.stamp).merged;
    return { merged, restored, refused, unwitnessed };
}

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

/**
 * Fold this pass's readings into sweep-timings.json's maps. PURE, and exported, so the claim below can be
 * driven on a fixture rather than only by running eighty gates for five minutes.
 *
 * *** v4556 -- THIS PASS TAKES THE EXACT MEASUREMENT `serial` EXISTS TO HOLD AND FILED IT NOWHERE. ***
 * The header at the top of this file says "SERIAL ON PURPOSE. The budget is a serial number", and every
 * reading here is uncontended by construction -- and the merge wrote `timings`, `codes`, `at` and
 * `finished`, never `serial`. So quickSweep.costOf(), the accessor v4562 built to tell the two measurements
 * apart, answered `source: "parallel"` for 210 OF THE 237 ROTATION READINGS ON FILE: it labelled the
 * trustworthy number as the contended one, across the whole exiled pool -- which is the population this
 * pass exists to serve, and the only population nothing else ever measures alone (quickSweep's serial slice
 * draws from `sel.run`, and an over-budget gate is by definition not in it).
 *
 * The reading now goes in BOTH fields, with `contended: false` saying the copy in `timings` is not a
 * sample. Writing it to `serial` alone would have been wrong in the other direction: `timings` is still the
 * membership number every consumer reads, and a rotation that stopped updating it would stop returning
 * gates to the sweep, which is the whole point of the pass.
 */
/**
 * *** v4640 -- THIS IS THE SECOND WRITER OF sweep-timings.json AND IT WAS WRITING A PARTIAL TUPLE. ***
 *
 * Seven maps went out and two did not: `kinds` and `capAt`. So every gate this rotation timed got a
 * millisecond with NO KIND -- which is exactly the state v4579 built `kinds` to end, in its own words "a ms
 * without one is two quantities" -- and no record of the cap it ran under, which is the field v4637 added
 * because one file holds rows from runs with different caps and the rotation is the run most likely to use a
 * different one (`--cap-s`, 90 s in killed mode against quickSweep's 20).
 *
 * FOUND BY THE PRE-FLIGHT REFUSING TO GO GREEN. v4639 gave tools/ship/recordDrift.mjs a runner; adding one
 * gate this round left it reporting `sweep timings` stale after the rotation had just written that gate's
 * row, because the row was missing the kind the pre-flight asks for. The instrument worked.
 *
 * THE FILE'S OWN HISTORY IS THE PRECEDENT: quickSweep.mjs records that v4568 added `finished`, wrote it into
 * a local in its loop, left it out of the object it actually persisted, and "the first full sweep after the
 * killed pass silently deleted 140 rows of it". A writer that spells its fields by hand is a list that has to
 * be maintained in step with every reader, and this is that same list, one process over.
 *
 * The kind is not inferred here: a rotation row is ALWAYS a serial re-run, so it is ALONE when it finished
 * and CAPPED when it did not, and both are known at the moment of writing rather than derived later from
 * which side of a budget the number fell on.
 */
export function mergeTimings(file, rows, stamp, capMs = null) {
    const timings = { ...(file.timings || {}) }, codes = { ...(file.codes || {}) }, at = { ...(file.at || {}) };
    const finished = { ...(file.finished || {}) };
    const serial = { ...(file.serial || {}) }, serialAt = { ...(file.serialAt || {}) };
    const contended = { ...(file.contended || {}) };
    const kinds = { ...(file.kinds || {}) }, capAt = { ...(file.capAt || {}) };
    const inferred = new Set(file.kindsInferred || []);
    const priorMs = {};
    for (const r of rows) {
        priorMs[r.gate] = (file.timings || {})[r.gate];
        timings[r.gate] = r.ms; codes[r.gate] = r.code; at[r.gate] = stamp;
        serial[r.gate] = r.ms; serialAt[r.gate] = stamp; contended[r.gate] = false;
        // Recorded either way: a gate that STOPS finishing must lose its verdict, not keep an old true.
        finished[r.gate] = !!r.finished;
        // OBSERVED, not inferred -- so the entry leaves kindsInferred, which is what watching it means.
        kinds[r.gate] = r.finished ? "alone" : "capped";
        inferred.delete(r.gate);
        if (capMs != null) capAt[r.gate] = capMs;
    }
    backfillStamps(timings, at);
    return { merged: { ...file, timings, codes, at, capAt, finished, serial, serialAt, contended, kinds,
                       kindsInferred: [...inferred].sort() }, priorMs };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    // *** v4647g -- THIS IS THE TOOL MY TYPO RAN. *** I meant one gate and typed `--gates`, which is
    // failLines' and recordInputs' spelling of a LIST. The old `indexOf` arg reader matched nothing,
    // returned null, and the ROTATION RAN -- 21 gates instead of the one asked for -- and recorded eulerGpu
    // at the 20,000 ms cap, a cap reading filed as a runtime, which budgetIsOwn forty lines into quickSweep
    // says must never happen. The two spellings are NOT unified (a list and one gate are different asks);
    // `--gates` is now refused here and told that this tool's option is `--gate`, which nearestOption gives
    // for an edit distance of one.
    //
    // This file WRITES sweep-timings.json, so an argument it misreads becomes a number the tree carries.
    const CLI = Object.freeze({
        values: Object.freeze({ "--budget-s": "number", "--slots": "number", "--gate": "path",
                                "--cap-s": "number", "--band": "string" }),
        flags: Object.freeze(["--rebuild-finished", "--restore-lost", "--write", "--killed"]),
    });
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("rotation", cli.errors, CLI)) console.error(l); process.exit(2); }
    const arg = (n, d) => (n in cli.values ? cli.values[n] : d);
    const budgetMs = arg("--budget-s", 180) * 1000;
    const slots = arg("--slots", 24);
    const file = readFile();
    if (cli.flags.has("--restore-lost")) {
        const led = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8"));
        const { merged, restored, refused, unwitnessed } = restoreLost(file, led);
        console.log(`[rotation] --restore-lost: ${restored.length} membership number(s) restored from a reading ` +
            `that exists TWICE -- the 2026-09-09 ledger and a later serial slice -- against ${refused.length} refused ` +
            `and ${unwitnessed.length} with no second witness`);
        for (const r of restored.slice(0, 10))
            console.log(`[rotation]   + ${r.gate}  ${r.from} -> ${r.to} ms  @${String(r.at).slice(0, 16)}  (ledger ${r.ledger}, ratio ${r.ratio})`);
        if (restored.length > 10) console.log(`[rotation]   ... ${restored.length - 10} more`);
        const disagreed = refused.filter((x) => !x.why);
        console.log(`[rotation]   ${refused.length - disagreed.length} refused because BOTH readings are over budget ` +
            `(correctly outside the sweep), ${disagreed.length} because the two readings disagree by more than ` +
            `${Math.round(CORROBORATION_BAND * 100)}% and this cannot say which is wrong`);
        for (const x of disagreed.slice(0, 6))
            console.log(`[rotation]   ? ${x.gate}  ledger ${x.ledger} vs serial ${x.serial} (${x.ratio}x) -- re-time it with --gate`);
        if (cli.flags.has("--write")) {
            const t = timingsTarget(file);
            if (t.foreign) console.log(`[rotation] NOT writing sweep-timings.json: ${t.why}`);
            fs.writeFileSync(path.join(ENG, t.file),
                JSON.stringify({ ...merged, host: t.host }, null, 1) + "\n");
            console.log(`[rotation] wrote ${t.file}`);
        } else console.log("[rotation] dry run -- pass --write to record");
        process.exit(0);
    }
    if (cli.flags.has("--rebuild-finished")) {
        const led = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8"));
        const { finished, rebuilt, skipped } = rebuildFinished(file, led);
        console.log(`[rotation] --rebuild-finished: ${rebuilt} row(s) restored from this file's own ledger, ` +
            `${skipped} skipped because the timings no longer describe the run the ledger recorded`);
        if (cli.flags.has("--write")) {
            const t = timingsTarget(file);
            if (t.foreign) console.log(`[rotation] NOT writing sweep-timings.json: ${t.why}`);
            fs.writeFileSync(path.join(ENG, t.file),
                JSON.stringify({ ...file, host: t.host, finished }, null, 1) + "\n");
            console.log(`[rotation] wrote ${t.file}`);
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
    const killedMode = cli.flags.has("--killed");
    const capMs = arg("--cap-s", killedMode ? 90 : CAP_MS / 1000) * 1000;
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
    if (cli.flags.has("--write")) {
        const stamp = new Date().toISOString();
        const { merged: mergedTimings, priorMs } = mergeTimings(file, rows, stamp, capMs);
        const target = timingsTarget(file);
        if (target.foreign) console.log(`[rotation] NOT writing sweep-timings.json: ${target.why}`);
        fs.writeFileSync(path.join(ENG, target.file),
            JSON.stringify({ ...mergedTimings, host: target.host }, null, 1) + "\n");
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
        console.log(`[rotation] wrote ${rows.length} entries with at=${stamp} to ${target.file}`);
    } else console.log("[rotation] dry run -- pass --write to record");
    process.exit(k.reds.length ? 1 : 0);
}
