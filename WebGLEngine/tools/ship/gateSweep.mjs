// FILE: tools/ship/gateSweep.mjs -- v4297
//
// *** THE SWEEP HAS ALWAYS BEEN A SHELL INCANTATION, AND ITS SECOND PHASE IS THE ONE THAT CAN BE SKIPPED. ***
//
// redCensus.METHOD writes the procedure down in prose: "phase 1: xargs -P 8 over every gate file... phase 2:
// re-run every candidate ONE AT A TIME. Phase 2 is what makes the number real." That sentence is correct and
// it is also unenforceable. Nothing in the tree can tell a number that came out of phase 2 from a number that
// came out of phase 1 and was typed into a field called `confirmedSerially`. The v4279 sweep did do both
// phases -- and the difference was SEVEN gates out of forty-six, 15% of the answer.
//
// This file makes the distinction structural instead of clerical. A phase-1 result is a CANDIDATE and carries
// no verdict. A candidate becomes RED only by being handed a serial re-run. `finalize()` refuses to produce a
// red set at all while any candidate is missing one, so the shape of the data cannot express the mistake.
//
// ---- *** AND THE RE-CHECK RECORDED A FIELD ITS OWN METHOD COULD NOT MEASURE *** ------------------------------
//
// v4296 shipped redCensus.RECHECK with `regressed: 0` beside `checked: 37`. Those two fields cannot both be
// about the same population. The 37 gates it re-ran were the 37 already recorded RED; a regression is by
// definition a gate that was GREEN and is now red, so not one of them was eligible. The method re-ran 37 of
// 1,366 gates and reported a zero over the other 1,329 it never executed.
//
// The prose in the same round said so outright -- "whether any gate GREEN at v4279 has since gone red needs
// the full sweep this file does not attempt -- that question's honest state is UNKNOWN rather than fine." So
// the caveat and the field disagreed with each other inside one commit, and the field is the half a reader
// greps. `coversRegressions()` below is the rule that would have caught it: a method can report on
// regressions only if the gates it ran include gates that were not already red.
//
// Same family as v4293's ROUND_TRIPS (one object, two draw spans) and v4295's MOMENTS (one record, two
// instants). A frozen record is read field by field, and every field carries the authority of the whole
// object whether or not it earned it.
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The two phases, and what each one is ALLOWED to conclude.
 *
 * The asymmetry is the point: phase 1 can rule a gate OUT (a gate that passes while eight workers fight over
 * the box passes on an idle one too), and it cannot rule one IN. Starvation only ever manufactures failures.
 */
export const PHASES = Object.freeze({
    parallel: Object.freeze({
        n: 1, jobs: 8, concludes: "GREEN is final; anything else is a CANDIDATE",
        why: "eight workers starve a gate that measures against the clock, so its red may be the box, not the code",
        evidence: "v4279: 46 parallel reds, 39 confirmed, 7 false -- a battle sim's 0.5 s clock assertion, a " +
                  "frame-budget check, a sort benchmark, three browser-driven gates, one fast-path timing check",
    }),
    serial: Object.freeze({
        n: 2, jobs: 1, concludes: "RED and GREEN are both final",
        why: "one gate at a time on an idle box is the only condition under which a timing assertion means what it says",
        optional: false,
    }),
});

/** A parallel timeout is the one outcome that is neither a pass nor a failure. */
export const TIMEOUT = Object.freeze({
    isVerdict: false,
    why: "a gate killed at the budget did not fail; it did not finish, and under -P 8 it may not have run",
    evidence: "v4279: two gates left the timeout bucket serially IN OPPOSITE DIRECTIONS -- referenceKind red " +
              "at 73.7 s, twoF green at 120.5 s. A bucket holding a red and a green with equal confidence is " +
              "not a bucket that may be waved through in either direction.",
});

export const VERDICT = Object.freeze({
    GREEN: "green", RED: "red", UNCONFIRMED: "unconfirmed",
});

/**
 * *** THE VERDICT FUNCTION. A CANDIDATE WITHOUT A SERIAL RE-RUN IS `unconfirmed`, NEVER `red`. ***
 *
 * `parallel` and `serial` are each {code, ms, timedOut} or null. The whole discipline of the two-phase method
 * lives in the four lines below, which is the reason it is a function and not a comment.
 */
export function classify(parallel, serial = null) {
    if (!parallel) throw new Error("classify: a phase-1 result is required");
    if (parallel.code === 0 && !parallel.timedOut)
        return { verdict: VERDICT.GREEN, from: "parallel", note: "passing under contention passes idle too" };
    if (!serial)
        return { verdict: VERDICT.UNCONFIRMED, from: "parallel",
                 note: parallel.timedOut ? "timed out under -P 8; not a verdict" : "parallel red is a hypothesis" };
    if (serial.timedOut)
        return { verdict: VERDICT.UNCONFIRMED, from: "serial", note: "timed out alone on an idle box; still unmeasured" };
    return serial.code === 0
        ? { verdict: VERDICT.GREEN, from: "serial", note: "false red -- starved in phase 1" }
        : { verdict: VERDICT.RED, from: "serial", note: "confirmed" };
}

/**
 * *** REFUSES TO PRODUCE A RED SET WHILE ANY CANDIDATE IS UNCONFIRMED. ***
 *
 * Not a warning and not a flag. The failure mode being prevented is a human reading a plausible number and
 * writing it down, and a plausible number is exactly what a warning still hands them.
 */
export function finalize(rows) {
    const out = { green: [], red: [], falseReds: [], unconfirmed: [] };
    for (const r of rows) {
        const c = classify(r.parallel, r.serial);
        const rec = { gate: r.gate, ...c, ms: (r.serial || r.parallel).ms };
        if (c.verdict === VERDICT.GREEN && c.from === "serial") out.falseReds.push(rec);
        if (c.verdict === VERDICT.GREEN) out.green.push(rec);
        else if (c.verdict === VERDICT.RED) out.red.push(rec);
        else out.unconfirmed.push(rec);
    }
    if (out.unconfirmed.length)
        throw new Error("gateSweep.finalize: " + out.unconfirmed.length + " candidate(s) never re-run serially: " +
                        out.unconfirmed.map((u) => u.gate).join(", ") +
                        " -- phase 2 is not optional, see PHASES.serial");
    return out;
}

/**
 * *** WHETHER A METHOD IS ENTITLED TO REPORT ON REGRESSIONS AT ALL. ***
 *
 * A regression is a gate that was green and is now red. A sweep that ran only gates already known red has no
 * eligible population and must report `unmeasurable`, not zero. This is the check v4296's RECHECK failed.
 */
export function coversRegressions(sweptGates, knownRedGates) {
    const known = new Set(knownRedGates);
    const eligible = sweptGates.filter((g) => !known.has(g));
    return {
        covers: eligible.length > 0,
        eligible: eligible.length,
        swept: sweptGates.length,
        reason: eligible.length
            ? "ran " + eligible.length + " gate(s) that were not already red, so a regression could have been seen"
            : "every gate run was already red; a regression could not have been seen, so the answer is unmeasurable",
    };
}

/** Gates green in the baseline and red now. Only meaningful when coversRegressions().covers is true. */
export function regressionsAgainst(baselineRed, confirmedRed) {
    const was = new Set(baselineRed);
    return confirmedRed.filter((g) => !was.has(g)).sort();
}

/** Gates red in the baseline and green now -- the direction that rots a register into fiction. */
export function repairsAgainst(baselineRed, confirmedRed) {
    const now = new Set(confirmedRed);
    return baselineRed.filter((g) => !now.has(g)).sort();
}

/** Every runnable gate file in the tree, sorted, so two boxes sweep the same population in the same order. */
export function enumerateGates(root = ENG) {
    const out = [];
    const skip = new Set(["node_modules", ".git", ".claude", "vendor"]);
    (function walk(dir) {
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
            if (e.name.startsWith(".") && e.name !== ".claude") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (!skip.has(e.name)) walk(full); }
            else if (e.name.endsWith("-selfcheck.mjs")) out.push(path.relative(root, full));
        }
    })(root);
    return out.sort();
}

/** One gate, once, with the wall time -- the same shape phase 1 and phase 2 both record. */
export function runOnce(rel, { timeoutMs = 180000, root = ENG } = {}) {
    const t0 = Date.now();
    try {
        execFileSync(process.execPath, [rel], { cwd: root, timeout: timeoutMs, stdio: "ignore" });
        return { code: 0, ms: Date.now() - t0, timedOut: false };
    } catch (e) {
        const ms = Date.now() - t0;
        const timedOut = e.killed === true || e.signal === "SIGTERM" || ms >= timeoutMs;
        return { code: e.status == null ? null : e.status, ms, timedOut };
    }
}

/** Parse the `<code>\t<ms>\t<gate>` lines a phase-1 run appends, so the record can be rebuilt from the log. */
export function parseSweepTsv(text, { timeoutMs = 180000 } = {}) {
    const rows = [];
    for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const [code, ms, ...rest] = line.split("\t");
        const gate = rest.join("\t").trim();
        if (!gate) continue;
        const n = Number(ms);
        rows.push({ gate, code: Number(code), ms: n, timedOut: Number(code) === 124 || n >= timeoutMs });
    }
    return rows;
}

// ---------------------------------------------------------------------------------------------------------
// CLI -- so phase 2 is a command rather than a thing somebody remembers to do.
//
//   node tools/ship/gateSweep.mjs --phase2 <phase1.tsv> [--out <phase2.tsv>] [--timeout 300000]
//
// Reads the phase-1 log, re-runs EVERY candidate one at a time, and appends `<code>\t<ms>\t<gate>` as each
// lands so progress is visible and a killed run loses nothing. It prints the finalize() verdict, or the
// refusal, which is the only thing that makes the number real.
// ---------------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === new URL("file://" + path.resolve(process.argv[1])).href) {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
    const p1 = arg("--phase2");
    if (!p1) { console.log("usage: node tools/ship/gateSweep.mjs --phase2 <phase1.tsv> [--out f] [--timeout ms]"); process.exit(2); }
    const timeoutMs = Number(arg("--timeout", 300000));
    const out = arg("--out", p1.replace(/\.tsv$/, "") + ".phase2.tsv");
    const par = parseSweepTsv(fs.readFileSync(p1, "utf8"));
    // Cheapest first, by the phase-1 runtime. Deterministic (ties broken by name), and it means a phase 2
    // that is killed part-way has resolved the MOST candidates it could have, rather than an arbitrary set.
    const cands = par.filter((r) => classify(r).verdict !== VERDICT.GREEN)
                     .sort((a, b) => a.ms - b.ms || a.gate.localeCompare(b.gate));
    const already = fs.existsSync(out) ? new Set(parseSweepTsv(fs.readFileSync(out, "utf8")).map((r) => r.gate)) : new Set();
    console.log(`phase 1: ${par.length} gates, ${cands.length} candidate(s); phase 2 budget ${timeoutMs} ms each`);
    const serial = new Map(fs.existsSync(out) ? parseSweepTsv(fs.readFileSync(out, "utf8")).map((r) => [r.gate, r]) : []);
    for (const c of cands) {
        if (already.has(c.gate)) continue;
        const r = runOnce(c.gate, { timeoutMs });
        const rr = { ...r, timedOut: r.timedOut || r.ms >= timeoutMs };
        serial.set(c.gate, rr);
        fs.appendFileSync(out, `${rr.code == null ? 124 : rr.code}\t${rr.ms}\t${c.gate}\n`);
        console.log(`  ${rr.code === 0 ? "GREEN (false red)" : rr.timedOut ? "TIMEOUT" : "RED  "}  ${rr.ms} ms  ${c.gate}`);
    }
    const rows = par.map((r) => ({ gate: r.gate, parallel: r, serial: serial.get(r.gate) || null }));
    try {
        const f = finalize(rows);
        console.log(`\nCONFIRMED RED ${f.red.length}   FALSE REDS ${f.falseReds.length}   GREEN ${f.green.length}`);
        for (const r of f.red) console.log("  RED   " + r.gate);
        for (const r of f.falseReds) console.log("  FALSE " + r.gate);
    } catch (e) { console.log("\n" + e.message); process.exit(1); }
}
