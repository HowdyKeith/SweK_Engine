#!/usr/bin/env node
// WebGLEngine/tools/mutate/mechanical.mjs -- v4388
//
// *** scan.mjs HAS BEEN ABLE TO NAME THE MUTATIONS SINCE THE DAY IT WAS WRITTEN AND HAS NEVER RUN ONE. ***
//
// Its own header says why it exists, and the sentence is the best argument in this directory: "a hand-picked
// mutation set measures the AUTHOR'S IMAGINATION, not the gate ... I chose the ways in which the code might be
// wrong, so I could only discover the wrongness I had already thought of." So it walks the source and perturbs
// every numeric literal mechanically. What it does NOT do -- what nothing in the tree did -- is APPLY one, run
// anything, and find out. It enumerates and prints. v4387 registered that as #151; this is the runner.
//
// MEASURED FIRST, BECAUSE THE GAP IS THE WHOLE MOTIVATION: across the eight files tools/mutate/mutate.mjs's
// hand-picked ten touch, scan.mjs finds 106 numeric constants. Ten of a hundred and six. *** THE SUITE THAT
// SCORES 10/10 IS EXAMINING NINE PERCENT OF THE NUMBERS IN ITS OWN TARGET FILES, *** and that ratio is not
// visible anywhere in the 10/10.
//
// ---- WHY THIS IS AFFORDABLE AND THE HAND-PICKED SUITE IS NOT ---------------------------------------------------
//
// tools/mutate/mutate.mjs runs a FULL VERIFY per mutation -- about ninety seconds, so its ten cost fourteen
// minutes. A hundred and six at that rate is two and a half hours, and a whole-tree sweep is out of reach
// entirely. That arithmetic is presumably why the mechanical scanner was never run.
//
// *** BUT A MUTATION TO ONE FILE CANNOT BE SEEN BY A GATE THAT DOES NOT REACH THAT FILE. *** tools/ship/
// affected.mjs has known which gates depend on which sources since v3041, and nothing in the mutation
// directory had ever asked it. brain/blobPolicyStore.js is reached by ONE gate out of 1425. physics/
// box3dLockstep.js by four. Running the affected set instead of the whole tree is not an approximation, it is
// the same answer computed without the 1421 gates that could not possibly have noticed.
//
// THE HONEST LIMIT OF THAT, STATED HERE RATHER THAN DISCOVERED LATER: the graph carries 427 unresolved imports,
// and affected.mjs's own header says unresolved imports WIDEN the answer. Widening is the safe direction -- a
// gate wrongly included costs time and cannot manufacture a CAUGHT -- but a gate wrongly EXCLUDED would turn a
// caught mutation into a false survivor. So a SURVIVED verdict from this tool is a CANDIDATE, and section 5 of
// its gate re-runs survivors against the full verify to confirm them. A survivor is an accusation; the full
// run is the trial.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mutationsFor } from "./scan.mjs";
import { affectedGates, buildGraph } from "../ship/affected.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MARKER = path.join(ENG, "tools", "mutate", ".mechanical-stranded.json");

/**
 * *** THE MARKER GOES DOWN BEFORE THE SOURCE IS TOUCHED, EXACTLY AS mutate.mjs DOES IT. ***
 * A finally block does not survive SIGKILL, and this tool writes real changes into real files. mutate.mjs
 * learnt that the hard way and left a mutated constant in the tree; the fix is a file on disk holding the
 * original text, recovered by the next run. A SEPARATE marker path from mutate.mjs's, so a stranded run of one
 * is never silently "recovered" using the other's snapshot.
 */
export function recoverStranded() {
    if (!fs.existsSync(MARKER)) return false;
    try {
        const s = JSON.parse(fs.readFileSync(MARKER, "utf8"));
        fs.writeFileSync(path.join(ENG, s.file), s.original);
        fs.unlinkSync(MARKER);
        console.log("[mechanical] recovered a stranded mutation in " + s.file + " (line " + s.line + ")");
        return true;
    } catch (e) {
        console.log("[mechanical] a stranded marker exists but could not be applied: " + e.message);
        return false;
    }
}

/**
 * *** THE AFFECTED SET IS ORDERED CHEAPEST FIRST, AND THAT IS NOT A MICRO-OPTIMISATION. ***
 *
 * A mutation is CAUGHT the moment ANY gate goes red, so the loop stops at the first one. Which gate that is
 * decides the cost of the whole sweep. Run the set in name order -- the first draft did -- and a mutation that
 * three-millisecond gates would have caught instantly can sit behind the slowest gate in the tree.
 *
 * MEASURED, and it is why this exists: the first run of simulation/tomo/diffraction.js was killed at 27 MINUTES
 * without producing a single verdict for its three constants, because its 98-gate set is sorted alphabetically
 * and holds several multi-minute gates. tools/ship/sweep-timings.json already carries the observed millisecond
 * cost of every gate the last quick sweep ran, and nothing in the mutation directory had ever read it.
 *
 * A gate with no recorded time sorts LAST rather than first. An unmeasured gate is not a cheap gate, and
 * guessing it cheap is how the 27-minute run happened.
 */
export function gateCosts() {
    try {
        const t = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/sweep-timings.json"), "utf8"));
        return t.timings || {};
    } catch { return {}; }
}

export function gatesFor(file, graph = null, costs = null) {
    const c = costs || gateCosts();
    const gates = affectedGates([file], graph || buildGraph()).gates;
    return gates.slice().sort((a, b) => (c[a] ?? Infinity) - (c[b] ?? Infinity) || a.localeCompare(b));
}

/** What the ordering is worth on one file, without running anything: the whole set against its cheap half. */
export function costProfile(file, graph = null) {
    const c = gateCosts();
    const gates = gatesFor(file, graph, c);
    const known = gates.filter((g) => c[g] != null);
    return {
        gates: gates.length, timed: known.length,
        cheapestMs: known.length ? c[known[0]] : null,
        dearestMs: known.length ? c[known[known.length - 1]] : null,
        totalMs: known.reduce((n, g) => n + c[g], 0),
        order: gates,
    };
}

/** One gate, as a yes/no. A gate that cannot run is NOT a pass -- it is reported as its own state. */
export function runGate(gate, timeout = 120000) {
    try {
        execFileSync(process.execPath, [gate], { cwd: ENG, timeout, stdio: ["ignore", "pipe", "pipe"] });
        return "GREEN";
    } catch (e) {
        if (e.killed || e.signal) return "TIMEOUT";
        return "RED";
    }
}

/**
 * *** THE CONTROL IS PAID LAZILY, AT THE MOMENT IT MATTERS, AND THAT IS WHAT MAKES THIS AFFORDABLE. ***
 *
 * mutate.mjs asks "is the gate green on the untouched tree" ONCE, up front, because it runs one gate. The
 * obvious translation here -- run all 98 gates first to check they are green -- was the second draft, and it
 * costs the FULL SET before a single mutation is tried: 794 seconds for diffraction.js, which is most of the
 * 27 minutes the first run burned without a verdict.
 *
 * But the control only matters for a gate that actually goes red. A gate that stays green under mutation
 * cannot have been "already red", and one that never runs at all needs no verdict. So: order cheapest first,
 * stop at the first red, and only THEN ask whether that gate was red before the mutation too. A pre-existing
 * red is dropped from the set BY NAME and the loop continues; a gate that was green and is now red is a catch.
 *
 * The cost of correctness is now proportional to the number of gates that fire, not to the size of the set.
 */
export function alreadyRed(gate, file, original) {
    const full = path.join(ENG, file);
    const mutated = fs.readFileSync(full, "utf8");
    fs.writeFileSync(full, original);
    try { return runGate(gate) !== "GREEN"; }
    finally { fs.writeFileSync(full, mutated); }
}

/**
 * Sweep one file: perturb every numeric constant in turn, run the gates that can see it, restore.
 *
 * A mutation is CAUGHT if any usable gate goes red. SURVIVED means every gate that could have seen the change
 * stayed green -- which is scan.mjs's whole point: "a constant whose value can be changed without any gate
 * noticing is a constant nothing is checking".
 */
export function sweepFile(file, { graph = null, onResult = null, costs = null } = {}) {
    recoverStranded();
    const full = path.join(ENG, file);
    const original = fs.readFileSync(full, "utf8");
    const order = gatesFor(file, graph, costs);
    const dropped = [];
    const muts = mutationsFor(full);
    const results = [];
    for (const m of muts) {
        let state = "SURVIVED", by = null, ran = 0;
        try {
            fs.writeFileSync(MARKER, JSON.stringify({ file, original, line: m.line }));
            fs.writeFileSync(full, m.mutated);
            for (const g of order) {
                if (dropped.some((d) => d.gate === g)) continue;
                ran++;
                const s = runGate(g);
                if (s === "TIMEOUT") { state = "UNMEASURED"; by = g; break; }
                if (s === "RED") {
                    // The lazy control: was it red WITHOUT the mutation? If so it proves nothing, ever again.
                    if (alreadyRed(g, file, original)) {
                        dropped.push({ gate: g, why: "already red on the untouched tree" });
                        continue;
                    }
                    state = "CAUGHT"; by = g; break;
                }
            }
        } finally {
            fs.writeFileSync(full, original);
            if (fs.readFileSync(full, "utf8") !== original) {
                throw new Error("RESTORE FAILED for " + file + " -- the tree is now mutated. Fix by hand.");
            }
            try { fs.unlinkSync(MARKER); } catch {}
        }
        const row = { file, line: m.line, was: m.was, now: m.now, context: m.context, state, by, gatesRun: ran };
        results.push(row);
        if (onResult) onResult(row);
    }
    return { file, order, dropped, results };
}

/** The buckets, derived from the rows. No count is carried beside the rows it counts -- v4387's lesson. */
export function tallySweep(results) {
    return {
        caught: results.filter((r) => r.state === "CAUGHT").length,
        survived: results.filter((r) => r.state === "SURVIVED").length,
        unmeasured: results.filter((r) => r.state === "UNMEASURED").length,
        total: results.length,
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
    if (!files.length) {
        console.log("usage: node tools/mutate/mechanical.mjs <source file> [...]");
        console.log("  perturbs every numeric constant and runs ONLY the gates that reach the file.");
        process.exit(2);
    }
    console.log("[mechanical] THIS EDITS SOURCE FILES IN PLACE, one constant at a time, restoring each before");
    console.log("[mechanical] the next. A marker at tools/mutate/.mechanical-stranded.json survives a kill.\n");
    const graph = buildGraph();
    const costs = gateCosts();
    const all = [];
    for (const f of files) {
        const p = costProfile(f, graph);
        console.log(f + ": " + p.gates + " gate(s) reach it, cheapest " + p.cheapestMs + " ms, dearest " +
                    p.dearestMs + " ms, whole set " + (p.totalMs / 1000).toFixed(1) + " s");
        const r = sweepFile(f, { graph, costs, onResult: (row) =>
            console.log("   " + row.state.padEnd(10) + String(row.gatesRun).padStart(3) + " gate(s)  line " +
                        String(row.line).padStart(4) + "  " + row.was + " -> " + row.now + "   " + row.context) });
        if (r.dropped.length) console.log("   dropped as already red: " + r.dropped.map((d) => d.gate).join(", "));
        all.push(...r.results);
    }
    const t = tallySweep(all);
    console.log("\n[mechanical] " + t.caught + "/" + t.total + " caught, " + t.survived + " SURVIVED" +
                (t.unmeasured ? ", " + t.unmeasured + " unmeasured" : ""));
    if (t.survived) {
        console.log("\n   A SURVIVING CONSTANT IS A NUMBER NOTHING IS CHECKING. Candidates, to be confirmed");
        console.log("   against a full verify before they are believed:");
        for (const r of all.filter((x) => x.state === "SURVIVED")) {
            console.log("      " + r.file + ":" + r.line + "  " + r.was + "   " + r.context);
        }
    }
}
