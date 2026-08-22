import path from "node:path";
// WebGLEngine/tools/ship/gateSelection.mjs — v3285
// ---------------------------------------------------------------------------------------------------------------
// WHICH GATES TO RUN WHEN THERE IS NOT TIME FOR ALL OF THEM — the measurement-budget handshake pointed at the
// suite itself. The Binder allocator chose which TEMPERATURE to measure next; this chooses which CHECK to spend
// the next three minutes on. Same three-part shape, and it registers on the proposer interface as a third
// instrument.
//
// *** NAMED gateSelection AND NOT gateBudget ON PURPOSE. *** tools/ship/gateBudget.mjs already exists and
// answers a DIFFERENT question: how long is any ONE gate allowed to take before it is killed. This answers which
// gates to start at all. Two things wearing one label is this project's most repeated defect, and the two would
// have drifted into each other within a round. The per-gate timings live THERE and are IMPORTED here -- there is
// one table of measured completion times in this tree and this is not a second one.
//
// THE PROBLEM IS MEASURED, NOT ASSUMED: the serial suite runs ~26 minutes. In practice a change is defended by
// whatever its author remembered to run, which means a suite that exists and is not used. A 3-minute subset that
// reliably contains the gates a change can reach is worth more than a 26-minute one that gets skipped.
//
// IMPORTED, NOT REBUILT:
//   affected.mjs        -- which gates a change reaches through the real import graph (a dependency analysis,
//                          not a heuristic). This is the proposer's main evidence.
//   gateBudget.MEASURED -- real completion times for the slow tail, recorded in the v3211 full-suite run.
//   staleness.gateFiles -- the one authoritative definition of what a gate IS. Three definitions of that once
//                          disagreed for 153 versions; there is exactly one now, and this uses it.
//
// WHY THE ADJUDICATOR IS NOT OPTIONAL: a selector is rewarded for fitting inside the budget, and the cheapest
// way to fit inside ANY budget is to run nothing. Every degenerate policy this lab has measured has had that
// shape -- the acceptance-only HMC reward, the easy-data budget policy, the delete-the-burn-in proposer. So the
// falsifier is a MISS: name a break and the gate that catches it, and ask whether the selection contains that
// gate. A plan that finishes fast and misses the break is the failure this exists to measure.
//
// SCOPE, STATED PLAINLY: this decides what to RUN. It is not a claim that unrun gates pass. "not run" is a third
// state beside pass and fail, and collapsing it into "fine" is the same error the boot sidecar refuses to make
// about a missing report and the runner refuses to make about a timeout (v3076).
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { affectedGates, buildGraph, importsOf, resolveSpec } from "./affected.mjs";
import { gateFiles } from "./staleness.mjs";
import { MEASURED } from "./gateBudget.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";

// The general population is overwhelmingly sub-second: 473 of 556 timed gates in the v3211 run came in under 1s,
// with a tail of about twenty. So an untimed gate is ASSUMED CHEAP, which is true for ~85% of them, and the
// assumption is REPORTED rather than hidden -- a plan built partly on guesses that presents itself as measured
// is the failure the perf ledger exists to end.
export const ASSUMED_CHEAP_MS = 1000;

// *** TWO PATH CONVENTIONS IN ONE TREE, AND THE FIRST RUN OF THIS FILE WALKED STRAIGHT INTO IT. ***
// gateFiles() returns ABSOLUTE paths; affectedGates() returns ENGINE-RELATIVE ones. Nothing threw: the
// reachability set simply never matched a single candidate, so the selector cheerfully reported "180 gates
// selected, 64 reachable from the change" while the reachable band was EMPTY and every one of those 64 sat in
// missedReachable. A plan that looks full and covers nothing is the empty-radar failure wearing a schedule, and
// the only reason it was caught is that missedReachable is a NAMED FIELD instead of a log line -- 64 out of 64
// missed is impossible to read as success.
//
// Everything is normalised to engine-relative here, once, at the boundary.
// v3937 -- fileURLToPath, NOT .pathname. On Windows `new URL(...).pathname` yields "/C:/dir" and
// path.join then prepends the current drive, giving "C:\\C:\\dir" -- every read fails ENOENT.
const ENG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => {
    let x = String(p).replace(/\\/g, "/").replace(/^\.\//, "");
    if (x.startsWith(ENG_ROOT + "/")) x = x.slice(ENG_ROOT.length + 1);
    return x;
};

/**
 * Cost per gate in ms. Priority: the perf ledger's median for THIS host (real, recent, local) > the v3211
 * MEASURED tail (real, but another box) > ASSUMED_CHEAP_MS (a guess, and flagged as one).
 */
// v3285 -- *** THE OBSERVED-TIMINGS FILE IS THE COST SOURCE, AND IT ALREADY EXISTED. ***
// The first version of this file read gateBudget.MEASURED, which is the SLOW-TAIL table used to grant extra
// timeout, and fell back to a 1s guess for everything else. That produced a "45 second plan" whose first ten
// gates included a 27s one -- honest that it was guessing, and wrong by a factor of thirty. tools/ship/
// gate-timings.json has carried OBSERVED runtimes for 564 gates since v3212, written by every full suite run.
// Reading it turns the plan from mostly-guess into mostly-measured without adding a second timing table.
let OBSERVED = {};
try { OBSERVED = JSON.parse(fs.readFileSync(new URL("./gate-timings.json", import.meta.url), "utf8")).timings || {}; }
catch { OBSERVED = {}; }

export function costsFor(gates, { ledger = null, host = null } = {}) {
    const costs = {}, guessed = [];
    const checks = (ledger && ledger.checks) || {};
    for (const g of gates) {
        const key = rel(g);
        const name = key.split("/").pop();
        const samples = checks[name] || checks[key] || null;
        const useable = samples ? (host ? samples.filter((s) => s.host === host) : samples) : null;
        if (useable && useable.length) {
            const ms = useable.map((s) => s.ms).sort((a, b) => a - b);
            costs[key] = ms[ms.length >> 1];       // median: a slow outlier is usually a background process
        } else if (OBSERVED[key] != null) {
            costs[key] = OBSERVED[key];          // observed on a real full-suite run
        } else if (MEASURED[key] != null) {
            costs[key] = MEASURED[key];          // slow tail, measured on a quiet box
        } else {
            costs[key] = ASSUMED_CHEAP_MS; guessed.push(key);
        }
    }
    return { costs, guessed };
}

/**
 * THE PROPOSER. Ordered selection under a wall-clock budget. Never decides whether the selection was any good;
 * a proposer that graded itself would grade itself generously.
 *
 * Order: reachable-from-the-change first, then cheapest first inside each band. Cheapest-first inside a band
 * means a run that is cut short still covers as much ground as it could have.
 */
export function selectGates({ changed = [], budgetMs = 180000, ledger = null, host = null,
                              graph = null, allGates = null, includeUnreachable = true } = {}) {
    const all = (allGates || gateFiles()).map(rel);
    const reach = changed.length ? new Set(affectedGates(changed, graph || buildGraph()).gates.map(rel)) : new Set();
    const { costs, guessed } = costsFor(all, { ledger, host });
    // v3285 -- THREE BANDS, NOT TWO, AND THE THIRD ONE WAS FOUND BY RUNNING THIS.
    // With one reachable band ordered cheapest-first, a 45s plan for a change to ising.js dropped
    // ising-selfcheck.mjs itself in favour of eighteen cheaper gates that merely reach it transitively. The
    // gate for the file you actually edited is not interchangeable with a gate four imports away, and sorting
    // purely by cost said it was.
    //
    // Band 0 is a DEPENDENCY FACT, not a filename heuristic: gates whose DIRECT imports include a changed file.
    // Band 1 is everything else the change reaches transitively. Band 2 is the rest of the suite.
    const changedSet = new Set(changed.map(rel));
    const directlyTests = new Set();
    if (changedSet.size) {
        for (const g of all) {
            if (!reach.has(g)) continue;
            let direct = false;
            // importsOf returns RAW SPECIFIERS ("./ising.js"), so they must be resolved against the importing
            // file before comparison -- comparing a specifier to a repo path matches nothing and would have
            // silently emptied band 0, which is the same shape as the absolute-vs-relative bug earlier in this
            // round. Two path conventions, twice, in one file.
            try { for (const spec of importsOf(g) || []) {
                const r = resolveSpec(g, spec);
                if (r && changedSet.has(rel(r))) { direct = true; break; }
            } } catch {}
            if (direct || changedSet.has(g)) directlyTests.add(g);
        }
    }
    const band = (g) => (directlyTests.has(g) ? 0 : reach.has(g) ? 1 : 2);
    const ranked = all
        .filter((g) => includeUnreachable || reach.has(g))
        .sort((a, b) => (band(a) - band(b)) || (costs[a] - costs[b]) || a.localeCompare(b));

    const selected = [], skipped = [];
    let spent = 0;
    for (const g of ranked) {
        if (spent + costs[g] <= budgetMs) { selected.push(g); spent += costs[g]; }
        else skipped.push(g);
    }
    const sel = new Set(selected);
    return {
        selected, skipped, spentMs: spent, budgetMs, costs,
        reachable: [...reach].sort(),
        directlyTests: [...directlyTests].sort(),
        // NAMED, never buried: a reachable gate that did not fit is the ONLY kind of omission that can hide a
        // break this change caused, so it is a field of its own rather than a line in a log.
        missedReachable: [...reach].filter((g) => !sel.has(g)).sort(),
        guessedCost: guessed.filter((g) => sel.has(g)),
        coverage: all.length ? selected.length / all.length : 0,
        total: all.length,
    };
}

/**
 * THE ADJUDICATOR. `breaks` maps a described corruption to the gate that catches it. A selection passes only if
 * every named break is covered. Returns EVIDENCE, never a bare boolean, so it can buy a licence in the proposer
 * registry -- which refuses bare booleans by design.
 */
export function adjudicateSelection(selection, breaks) {
    const sel = new Set(selection.selected.map(rel));
    const missed = [], caught = [];
    for (const [what, gate] of Object.entries(breaks)) (sel.has(rel(gate)) ? caught : missed).push({ what, gate: rel(gate) });
    return {
        pass: missed.length === 0,
        evidence: { caught: caught.length, missed: missed.map((m) => m.what), spentMs: selection.spentMs,
                    budgetMs: selection.budgetMs, missedReachable: selection.missedReachable.length },
        why: missed.length === 0
            ? "every seeded break is covered by the selection"
            : "the selection fits the budget and MISSES " + missed.map((m) => m.what).join(", "),
    };
}

/** Report lines. "not run" stays a third state. */
export function selectionLines(s) {
    const out = [];
    out.push(`selected ${s.selected.length}/${s.total} gates, ~${Math.round(s.spentMs / 1000)}s of a ${Math.round(s.budgetMs / 1000)}s budget` +
             (s.reachable.length ? ` (${s.reachable.length} reachable from the change)` : " (no change set given -- cheapest-first over the whole suite)"));
    out.push(`  ${s.skipped.length} gates NOT RUN -- this is not a claim that they pass`);
    if (s.missedReachable.length) out.push(`  WARNING: ${s.missedReachable.length} gate(s) the change CAN REACH did not fit: ${s.missedReachable.slice(0, 4).join(", ")}`);
    if (s.guessedCost.length) out.push(`  ${s.guessedCost.length} selected gate(s) have no measured timing; ${ASSUMED_CHEAP_MS}ms assumed -- the plan is part guess and says so`);
    return out;
}

// ---- CLI: print a plan without running anything ------------------------------------------------------------------
// `node tools/ship/gateSelection.mjs --budget 180 physics/statmech/ising.js`
// Dry by design: seeing the plan is a separate act from executing it, and a planner that ran things would be two
// tools in one file. Execution lives in selfchecks.mjs behind --budget.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const argv = process.argv.slice(2);
    const bi = argv.indexOf("--budget");
    const secs = bi >= 0 ? parseFloat(argv[bi + 1]) : 180;
    const changed = argv.filter((a, i) => !a.startsWith("--") && i !== bi + 1);
    let ledger = null;
    try { ledger = JSON.parse(fs.readFileSync(new URL("../roundhouse/perf-ledger.json", import.meta.url), "utf8")); } catch {}
    const plan = selectGates({ changed, budgetMs: secs * 1000, ledger });
    for (const l of selectionLines(plan)) console.log(l);
    console.log("");
    for (const g of plan.selected.slice(0, 40)) console.log("  " + (plan.reachable.includes(g) ? "*" : " ") + " " + g + "  (" + Math.round(plan.costs[g]) + "ms)");
    if (plan.selected.length > 40) console.log("  ... and " + (plan.selected.length - 40) + " more");
    console.log("\n  * = reachable from the changed files given. Run them with:");
    console.log("      node tools/ship/selfchecks.mjs --budget " + secs + (changed.length ? " --affected " + changed.join(" ") : ""));
}
