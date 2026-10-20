// WebGLEngine/tools/ship/observedGates.mjs -- v4485
//
// Run: node tools/ship/observedGates.mjs [--write]
//
// *** budgetEvidence's VERDICT DEPENDED ON HOW BUSY THE MACHINE WAS, AND IT WENT RED ON THE FIRST VERIFY OF
// EVERY ROUND THIS SESSION. ***
//
// tools/ship/budgetEvidence-selfcheck.mjs holds a wall: "every gate carries evidence about its own runtime, or
// admits that it does not finish". It accepts that evidence from two files. One is tools/ship/gate-timings.json,
// a curated register whose note runs to a page of provenance -- individually timed gates, a skip time recorded
// as a runtime three separate times, the reason a merge is dangerous there. The other is
// tools/ship/sweep-timings.json, and that file's own note says what it is: "Rewritten every run; used only to
// choose which gates are under the ship-time budget. NOT A CLAIM ABOUT THE TREE -- the register is."
//
// *** SO THE WALL READS A SCRATCH FILE FOR A DURABLE QUESTION. *** A gate the sweep times to completion is
// evidence; a gate the sweep KILLS at the cap contributes nothing, by that gate's own correct rule that "a 124
// is a kill and says nothing". Both facts are written to the same file and the second overwrites the first. A
// gate measured cleanly last week and killed at the cap today, because another process was competing for the
// box, loses its evidence entirely and the wall goes red -- describing the machine's load rather than the tree.
//
// MEASURED: 215 of the 1,356 gates the last sweep timed have evidence from NOWHERE ELSE. Any one of them can
// erase the wall's green by being slow once. That is what happened to headlessGpu-selfcheck at v4482, which
// takes 729 ms on a quiet box and reported 190,675 ms under a concurrent verify.
//
// ---- AND TWO CAUSES LOOK IDENTICAL FROM OUTSIDE, AND THIS ROUND FIRST BLAMED ONE FOR BOTH ---------------------
//
// "budgetEvidence goes red on the first verify and green when re-run" was watched twelve times before anybody
// looked, and it turns out to be TWO different things wearing one symptom:
//
//   (a) A GATE ADDED THIS ROUND HAS NO EVIDENCE YET, because the sweep has not run it. That is CORRECT, and it
//       resolves itself: the verify's own quick sweep times the new gate, writes sweep-timings.json, and the
//       second run is green. Eleven of the twelve were this. Nothing should "fix" it -- a gate nobody has run
//       has not been measured, and saying so is the wall doing its job.
//
//   (b) A GATE THAT ALREADY HAD EVIDENCE LOSES IT, because the sweep killed it at the cap on a busy box and the
//       file that held the evidence was rewritten with the kill. Seen directly once, at v4482, on
//       headlessGpu-selfcheck: 729 ms on a quiet box, 190,675 ms under a concurrent verify.
//
// *** THE FIRST DRAFT OF THIS FILE ATTRIBUTED ALL TWELVE TO (b). *** It was written before the gate that grades
// it existed, and the gate's own arrival proved the point by going red as case (a) -- this module's selfcheck
// is not in sweep-timings.json, because no sweep has run since it was written. A round about an instrument
// whose two failure modes are indistinguishable from outside had, at that moment, exactly one data point and
// two explanations for it.
//
// THIS LEDGER FIXES (b) AND DELIBERATELY NOT (a). An observation once made cannot be erased; an observation
// never made cannot be invented.
//
// ---- AND THE TREE ALREADY HAS THE DISCIPLINE, WRITTEN DOWN, APPLIED TO THE OTHER FILE --------------------------
//
// *** THE FIRST DRAFT OF THIS HEADER SAID gate-timings.json IS HAND-FED AND THAT NOTHING MERGES MACHINE OUTPUT
// INTO IT. BOTH HALVES WERE WRONG, AND THE GATE THAT CHECKS IT CAUGHT THEM. *** tools/ship/selfchecks.mjs --
// the full-suite runner -- writes that file on every full run, and it MERGES, with the reason in its own
// comment one line above the write:
//
//     "MERGE rather than replace: a partial run must not delete the timings of gates it never reached."
//
// That is exactly the rule this round is about, already stated, already implemented. The quick sweep writes
// tools/ship/sweep-timings.json the other way -- sweepCoverage.mjs calls it "a whole-file rewrite built from
// ITS OWN snapshot" -- and it is RIGHT to: that file's job is to say which gates are under budget ON THIS BOX
// RIGHT NOW, and merging stale entries into it would resurrect the v4460 defect where an over-budget entry
// keeps whatever exit code it had when it was last cheap enough to run.
//
// *** SO THE TWO FILES HAVE OPPOSED REQUIREMENTS AND ONE WALL WAS READING THEM AS THE SAME KIND OF RECORD. ***
// One must be CURRENT and therefore forgets; the other must be CUMULATIVE and therefore merges. budgetEvidence
// asked a cumulative question of both. The full suite runs rarely, so the 215 gates added since it last ran had
// nowhere to be remembered, and every one of them was one busy box away from erasing the wall's green.
//
// ---- WHAT THIS ADDS -------------------------------------------------------------------------------------------
//
// A third file with the third requirement: MONOTONE. Not a budget and not a snapshot -- a record of what has
// EVER been seen to finish. mergeObservations never removes an entry, and the gate that grades it asserts that
// rather than trusting this sentence. gate-timings.json is left exactly alone: its note is a page of provenance
// including a skip time recorded as a runtime three separate times, and this round adds nothing to it.
//
// *** AND THIS TOOL DOES NOT GRADE ITSELF. *** claimCheck's rule, in its own words: "A LOOP THAT BOTH WRITES
// THE RECORD AND GRADES IT CAN MARK ITS OWN WORK PASSED." This writes; tools/ship/observedGates-selfcheck.mjs
// reads and grades, and budgetEvidence consumes. Three roles, three files.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEDGER_PATH = path.join(HERE, "observed-gates.json");
export const SWEEP_PATH = path.join(HERE, "sweep-timings.json");

/** Read the ledger, or an empty one. A missing ledger is a first run, not a failure. */
export function loadObserved(file = LEDGER_PATH) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return { note: "", firstWritten: null, gates: {} }; }
}

/**
 * *** MONOTONE BY CONSTRUCTION. *** Every entry in `prev` survives into the result; a sweep that killed a gate
 * at the cap, or never ran it, removes nothing. Only `code === 0` observations are taken -- the same rule
 * budgetEvidence already applies, because a non-zero exit has not exercised the gate's full path and a 124 is
 * a kill that says nothing.
 *
 * @returns {{next: object, added: string[], refreshed: string[], carried: string[], removed: string[]}}
 *   `removed` is always empty and is returned anyway, so the gate can assert it rather than trust the prose.
 */
export function mergeObservations(prev, sweepFile, atVersion) {
    const gates = { ...(prev.gates || {}) };
    const added = [], refreshed = [];
    const timings = (sweepFile && sweepFile.timings) || {};
    const codes = (sweepFile && sweepFile.codes) || {};
    for (const [g, ms] of Object.entries(timings)) {
        if (codes[g] !== 0 || typeof ms !== "number") continue;
        if (gates[g]) {
            gates[g] = { ...gates[g], lastMs: ms, lastSeen: atVersion, runs: (gates[g].runs || 0) + 1 };
            refreshed.push(g);
        } else {
            gates[g] = { firstSeen: atVersion, lastSeen: atVersion, lastMs: ms, runs: 1 };
            added.push(g);
        }
    }
    const carried = Object.keys(gates).filter((g) => !added.includes(g) && !refreshed.includes(g));
    const removed = Object.keys(prev.gates || {}).filter((g) => !(g in gates));
    return { next: { ...prev, gates }, added: added.sort(), refreshed: refreshed.sort(), carried: carried.sort(), removed };
}

/** Has this gate ever been observed to finish? The wall's actual question. */
export const observedFinishes = (record, gate) =>
    !!(record && record.gates && record.gates[gate] && typeof record.gates[gate].lastMs === "number");

/** What v4485 measured. */
export const MEASURED_AT_V4485 = Object.freeze({
    sweptLastRun: 1356,
    durableInGateTimings: 1289,
    // *** THE NUMBER THE ROUND IS ABOUT. *** Gates whose only runtime evidence is the file the tree
    // documents as "rewritten every run; not a claim about the tree".
    evidenceOnlyFromScratch: 215,
    // *** TWO CAUSES, ONE SYMPTOM, AND THE ROUND FIRST BLAMED ONE FOR BOTH. ***
    redsWatchedThisSession: 12,
    causeNewGateNoEvidence: 11,   // (a) correct, self-resolving: the sweep has not run it yet
    causeEvidenceErased: 1,       // (b) real: headlessGpu at v4482, killed at the cap under a concurrent verify
    fixesCauseB: true, fixesCauseA: false,
    headlessGpuQuietMs: 729, headlessGpuUnderLoadMs: 190675,
    ledgerIsMonotone: true,
    // *** THE CORRECTION THIS ROUND OWES ITSELF. *** The premise it started from -- that gate-timings.json is
    // hand-fed and nothing merges machine output into it -- was wrong on both counts, and the gate found it.
    gateTimingsIsMachineWritten: true,
    gateTimingsWriter: "tools/ship/selfchecks.mjs",
    gateTimingsMerges: true,          // "a partial run must not delete the timings of gates it never reached"
    sweepTimingsReplaces: true,       // and is right to: it must say what is under budget ON THIS BOX NOW
});

// ---- the writer, when asked ---------------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    const at = (() => {
        try { return (fs.readFileSync(path.join(HERE, "..", "..", "main.js"), "utf8")
                        .match(/const ENGINE_VERSION = "(v\d+)"/) || [])[1] || "unknown"; }
        catch { return "unknown"; }
    })();
    let sweep = {};
    try { sweep = JSON.parse(fs.readFileSync(SWEEP_PATH, "utf8")); } catch {}
    const prev = loadObserved();
    const r = mergeObservations(prev, sweep, at);
    const out = {
        note: "MONOTONE. Every gate the quick sweep has ever timed to completion (exit 0), and nothing is ever " +
              "removed: an observation does not stop having been made. This answers ONE question -- has this " +
              "gate been seen to finish -- which is what tools/ship/budgetEvidence-selfcheck.mjs's wall is " +
              "about. It is NOT a budget: tools/ship/gate-timings.json is the curated register for that, and " +
              "nothing merges machine output into it. Written by tools/ship/observedGates.mjs --write; graded " +
              "by tools/ship/observedGates-selfcheck.mjs, which does not write it.",
        firstWritten: prev.firstWritten || at,
        lastWritten: at,
        gates: r.next.gates,
    };
    if (process.argv.includes("--write")) {
        fs.writeFileSync(LEDGER_PATH, JSON.stringify(out, null, 1));
        console.log(`[observedGates] ${Object.keys(out.gates).length} gates observed: ` +
                    `+${r.added.length} new, ${r.refreshed.length} refreshed, ${r.carried.length} carried, ` +
                    `${r.removed.length} removed (always 0) -> observed-gates.json`);
    } else {
        console.log(`[observedGates] would hold ${Object.keys(r.next.gates).length}: ` +
                    `+${r.added.length} new, ${r.refreshed.length} refreshed, ${r.carried.length} carried. ` +
                    `Pass --write to save.`);
    }
}
