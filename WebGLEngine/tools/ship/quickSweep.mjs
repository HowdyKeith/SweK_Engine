#!/usr/bin/env node
// WebGLEngine/tools/ship/quickSweep.mjs -- v4303
//
// *** THE SHIP GATE RUNS A NARROWER SET THAN THE SUITE, AND THAT IS HOW SIX GATES WENT RED UNDER ALL GREEN. ***
// #134, measured at v4257: verify.mjs names one selfcheck explicitly and runs the fast physics suites; the
// 1,300-gate tree is swept by hand, when someone remembers, which at v4297 turned out to be eighteen rounds
// apart. Every regression the v4297 sweep named -- backendParity, copiedOutsideVendor, gateQuality,
// postChain, staleness, windowsImport -- was a gate that WORKED, was broken by a round that shipped ALL
// GREEN, and cost under a second to run. Five of the six cost under a second. They were cheap to run and
// nobody ran them.
//
// This is the cheap running. Given a timings file, every gate that finished under `budgetMs` last time is
// run again, `workers` at a time, with a hard cap; every red is then re-run ALONE, because v4297 measured
// that 36% of parallel reds are starvation and not failure (gateSweep.classify is the rule). The result is
// reconciled against the RED REGISTER: a red that redCensus or the v4297 record already lists is KNOWN and
// reported; a red that neither lists is NEW and is the finding this file exists to raise. verify.mjs fails
// on NEW reds only, so the 37 standing reds do not make every ship red, and a gate that goes red in a
// round is caught in that round rather than eighteen later.
//
// *** WHAT A TIMINGS FILE IS FOR, AND WHAT IT IS NOT. *** It chooses which gates are cheap enough to run
// at ship time; it is NOT a promise about the tree. The file is rewritten after every run with what was
// just observed, so a gate that has grown past the budget drops out and is NAMED in the summary as dropped,
// never silently. A gate with no timing at all -- new this round -- is always run once, so it earns one.
//
// Measured at v4303 with a 20 s cap and 8 workers over all 1,383 gates: see the changelog for the buckets.
//
// Run:  node tools/ship/quickSweep.mjs [--budget 3000] [--workers 8] [--cap 20000] [--timings <file>] [--json]
// Exit: 0 when no NEW red; 1 when a gate outside the register is red; 2 when the runner itself failed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { backfillStamps } from "./sweepCoverage.mjs";
import { enumerateGates, classify, VERDICT, SWEEP_V4297, ENG } from "./gateSweep.mjs";
import { RED_AT_V4279, RED_AT_V4408, RED_AT_V4424, UNCONFIRMED_SLOW } from "./redCensus.mjs";

export const DEFAULTS = Object.freeze({ budgetMs: 3000, workers: 8, capMs: 20000, timingsFile: "tools/ship/sweep-timings.json" });

/** The register: every gate whose red is already on record, with the record that names it. */
export function redRegister() {
    const reg = new Map();
    for (const e of RED_AT_V4279) reg.set(e.gate, "redCensus.RED_AT_V4279");
    // *** BOTH MEASURED SETS BEFORE THE BUCKET, BECAUSE A MEASURED RED OUTRANKS "NOBODY LOOKED". ***
    // Two rounds on two branches each filed a set of reds the bucket had been hiding, and they name different
    // gates: v4408 took the ones the first rotation surfaced, v4424 ran all 63 of UNCONFIRMED_SLOW one at a
    // time and found three exiting 1. Neither round repaired its set -- they stay on the register, but under a
    // reason that names the failure instead of the absence of a measurement.
    for (const e of RED_AT_V4408) reg.set(e.gate, "redCensus.RED_AT_V4408");
    for (const e of RED_AT_V4424) reg.set(e.gate, "redCensus.RED_AT_V4424");
    for (const g of UNCONFIRMED_SLOW) if (!reg.has(g)) reg.set(g, "redCensus.UNCONFIRMED_SLOW");
    for (const g of SWEEP_V4297.fromSlowBucket) if (!reg.has(g)) reg.set(g, "gateSweep.SWEEP_V4297.fromSlowBucket");
    for (const g of SWEEP_V4297.unmeasured) if (!reg.has(g)) reg.set(g, "gateSweep.SWEEP_V4297.unmeasured");
    // the six regressions are NOT in the register on purpose: they are the reds a round is meant to repair,
    // and listing them here would make their red acceptable again.
    return reg;
}

/** Read a timings file: { captured, timings: {gate:ms}, codes: {gate:exitCode}, observed: {gate:iso|null} }. Missing -> empty. */
export function readTimings(file = DEFAULTS.timingsFile, root = ENG) {
    try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); } catch { return { captured: null, timings: {}, codes: {}, observed: {} }; }
}

/**
 * Which gates to run: every enumerated gate whose last observed time is under the budget, plus every gate
 * with no observation at all (new gates always earn one). Returns { run, skipped, dropped, unmeasured }.
 */
export function selectGates(all, timings, budgetMs) {
    const run = [], skipped = [], unmeasured = [];
    for (const g of all) {
        const ms = timings[g];
        if (ms == null) { unmeasured.push(g); run.push(g); }
        else if (ms <= budgetMs) run.push(g);
        else skipped.push(g);
    }
    return { run, skipped, unmeasured };
}

/** Reconcile serial reds against the register: known (with the record that names them) versus new. */
export function reconcile(rows, register = redRegister()) {
    const known = [], fresh = [], unmeasured = [];
    for (const r of rows) {
        if (r.verdict === VERDICT.UNCONFIRMED) { unmeasured.push(r.gate); continue; }   // timed out alone: not a verdict
        if (r.verdict !== VERDICT.RED) continue;
        if (register.has(r.gate)) known.push({ gate: r.gate, record: register.get(r.gate), ms: r.serialMs });
        else fresh.push({ gate: r.gate, code: r.serialCode, ms: r.serialMs });
    }
    return { known, newRed: fresh, unmeasured };
}

function runOneAsync(rel, capMs, root) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const p = spawn(process.execPath, [rel], { cwd: root, stdio: "ignore" });
        const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, capMs);
        p.on("exit", (code, sig) => { clearTimeout(timer); const ms = Date.now() - t0; resolve({ code: sig ? 124 : (code ?? 1), ms, timedOut: !!sig || ms >= capMs }); });
        p.on("error", () => { clearTimeout(timer); resolve({ code: 1, ms: Date.now() - t0, timedOut: false }); });
    });
}

/**
 * The whole thing. Phase 1 in parallel, phase 2 serial for every phase-1 red, classify(), reconcile(), and
 * the timings file rewritten with what was seen. `onProgress(done, total)` is optional.
 */
export async function runQuickSweep({ budgetMs = DEFAULTS.budgetMs, workers = DEFAULTS.workers, capMs = DEFAULTS.capMs,
                                      timingsFile = DEFAULTS.timingsFile, root = ENG, gates = null, write = true, onProgress = null } = {}) {
    const t00 = Date.now();
    const all = gates || enumerateGates(root);
    const prior = readTimings(timingsFile, root);
    const sel = selectGates(all, prior.timings || {}, budgetMs);
    const phase1 = new Map();
    let next = 0, done = 0;
    async function worker() {
        while (next < sel.run.length) {
            const rel = sel.run[next++];
            phase1.set(rel, await runOneAsync(rel, capMs, root));
            done++; if (onProgress) onProgress(done, sel.run.length);
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, workers) }, worker));
    // phase 2: every candidate alone, at the same cap (a gate under budget has no business needing more)
    const rows = [];
    for (const rel of sel.run) {
        const p1 = phase1.get(rel);
        const parallel = { code: p1.code, ms: p1.ms, timedOut: p1.timedOut };
        if (p1.code === 0) {
            // v4408 -- *** A GREEN GATE'S PARALLEL TIME IS NOT ITS COST, AND THIS IS WHERE THE DOOR USED TO SHUT. ***
            // The recorded timing decides membership next run, and until now a green gate never earned a serial
            // reading -- so one that passed 8-way at 3,002 ms was filed at 3,002 ms and evicted forever. v4297
            // already refused to call a starved parallel run a FAILURE; it is no better as a COST. The first
            // rotation measured the size of the error: 138 of 140 evicted gates came back at a median 2.85x
            // faster serially. So a green gate that CROSSES the budget in parallel is confirmed alone before it
            // is filed, which is the same two-phase discipline reds have had since v4297, applied to timings.
            if (p1.ms > budgetMs) {
                const conf = await runOneAsync(rel, capMs, root);
                rows.push({ gate: rel, verdict: VERDICT.GREEN, parallelMs: p1.ms, serialMs: conf.ms, serialCode: conf.code, from: "budget-confirm" });
            } else rows.push({ gate: rel, verdict: VERDICT.GREEN, parallelMs: p1.ms });
            continue;
        }
        const p2 = await runOneAsync(rel, capMs, root);
        const serial = { code: p2.code, ms: p2.ms, timedOut: p2.timedOut };
        const c = classify(parallel, serial);   // { verdict, from, note } -- gateSweep's rule, not a copy of it
        rows.push({ gate: rel, verdict: c.verdict, from: c.from, parallelMs: p1.ms, serialMs: p2.ms, serialCode: p2.code });
    }
    const out0 = { at: new Date().toISOString() };
    const rec = reconcile(rows);
    const green = rows.filter((r) => r.verdict === VERDICT.GREEN).length;
    const falseReds = rows.filter((r) => r.verdict === VERDICT.GREEN && r.from === "serial").length;   // red under -P, green alone
    // the timings file, rewritten with what was just seen (serial time where there was one)
    // v4408 -- *** PER-ENTRY PROVENANCE. *** This file used to stamp ONE `captured` date on all 1,440 entries
    // while rewriting only the ones it ran, so 502 readings carried a date they did not earn -- and the budget
    // decision is made FROM those readings, which made the exclusion a one-way door. `at` records, per entry,
    // the capture that actually observed it. Entries this run did not touch KEEP their old stamp, and an entry
    // that has never had one gets UNKNOWN_AT rather than a fabricated date: an unknown age is a finding, not a
    // default. See tools/ship/sweepCoverage.mjs.
    const timings = { ...(prior.timings || {}) }, codes = { ...(prior.codes || {}) };
    // *** v4470 MERGE -- TWO BRANCHES INVENTED THE SAME FIELD IN THE SAME WEEK, AND ONLY ONE SPELLING SURVIVES.
    // *** v4408 called it `at` and v4425 called it `observed`, for the identical reason: a row is rewritten only
    // when its gate RAN, so a whole-file `captured` date was being read as if it dated the rows. Two names for
    // one fact is how a field quietly stops being found in one of the two places -- this file's own argument
    // about ENGINE_VERSION, one level down -- so `at` is kept (it is what main ships and what backfillStamps
    // already fills) and tools/ship/budgetExile.mjs was changed to read it.
    const at = { ...(prior.at || {}) };
    const stamp = out0.at;
    for (const r of rows) { timings[r.gate] = r.serialMs ?? r.parallelMs; codes[r.gate] = r.serialCode ?? 0; at[r.gate] = stamp; }
    backfillStamps(timings, at);
    const dropped = sel.run.filter((g) => (prior.timings || {})[g] != null && timings[g] > budgetMs);
    const out = {
        at: out0.at, budgetMs, workers, capMs, ms: Date.now() - t00,
        enumerated: all.length, ran: sel.run.length, skippedOverBudget: sel.skipped.length, newGates: sel.unmeasured,
        green, falseReds, knownRed: rec.known, newRed: rec.newRed, unmeasured: rec.unmeasured, dropped,
        // v4408: green gates whose PARALLEL time crossed the budget and were re-run alone before being filed,
        // and how many of those the serial reading brought back under. The second number is the starvation.
        budgetConfirmed: rows.filter((r) => r.from === "budget-confirm").length,
        budgetRescued: rows.filter((r) => r.from === "budget-confirm" && r.serialMs <= budgetMs).length,
    };
    if (write) {
        fs.writeFileSync(path.join(root, timingsFile), JSON.stringify({
            note: "OBSERVED at the last quickSweep run: ms per gate (serial where a serial re-run happened) and exit code. Rewritten every run; " +
                  "used only to choose which gates are under the ship-time budget. Not a claim about the tree -- the register is. " +
                  "`at` is PER ENTRY (v4408): the capture that actually observed that gate. `captured` is this run's stamp and " +
                  "applies ONLY to entries whose `at` equals it -- the rest were not run and say so.",
            captured: out.at, budgetMs, capMs, timings, codes, at,
        }, null, 1) + "\n");
    }
    return out;
}

// ---- CLI ------------------------------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
    const opts = { budgetMs: Number(arg("--budget", DEFAULTS.budgetMs)), workers: Number(arg("--workers", DEFAULTS.workers)),
                   capMs: Number(arg("--cap", DEFAULTS.capMs)), timingsFile: arg("--timings", DEFAULTS.timingsFile) };
    let lastPct = -1;
    const r = await runQuickSweep({ ...opts, onProgress: (d, t) => { const pct = Math.floor(100 * d / t); if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; process.stderr.write(`[quickSweep] ${d}/${t}\n`); } } })
        .catch((e) => { console.error("[quickSweep] runner failed: " + (e && e.message)); process.exit(2); });
    if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 1));
    else {
        console.log(`[quickSweep] ${r.ran} of ${r.enumerated} gates under ${r.budgetMs} ms ran in ${(r.ms / 1000).toFixed(0)} s: ` +
            `${r.green} green, ${r.knownRed.length} known red, ${r.newRed.length} NEW red, ${r.falseReds} false red, ${r.unmeasured.length} unmeasured; ` +
            `${r.skippedOverBudget} over budget skipped, ${r.newGates.length} new gates measured, ${r.dropped.length} dropped from budget`);
        for (const k of r.knownRed) console.log(`  known  ${k.gate}  (${k.record})`);
        for (const n of r.newRed) console.log(`  NEW    ${n.gate}  exit ${n.code} in ${n.ms} ms`);
        for (const d of r.dropped) console.log(`  slower ${d}  now over budget`);
    }
    process.exit(r.newRed.length ? 1 : 0);
}
