#!/usr/bin/env node
// WebGLEngine/tools/ship/fixtureLitter.mjs -- v4649
//
// *** A GATE THAT LITTERS THE TREE IT GRADES MANUFACTURES ITS OWN FALSE SIGNAL. ***
// inputSets-selfcheck writes five `__inputsets_*` fixtures into tools/ship and unlinks each one on a later
// line. Every one of those unlinks sits on the happy path. probeOne THROWS on Windows (task #62) and the
// sweep SIGKILLs at the cap (241 kills in one run on that box), so the fixture outlived the run that wrote
// it -- and the capture of the next sweep came back stamped WORKING TREE DIRTY across 44 reds that had
// nothing to do with any edit.
//
// Two mechanisms, because they answer two different deaths:
//   * REGISTER on write, drop on exit. Node runs `exit` listeners for an uncaught throw, so that death is
//     covered by the process that caused it.
//   * RECLAIM on the way in. A SIGKILL at the cap and a Windows fail-fast (0xC0000409, task #65) run no
//     handler at all, so the only process that can clean up after them is the NEXT one.
//
// It lives in its own module for a measured reason: inputSets-selfcheck drives both mechanisms on REAL
// children rather than on a copy of the sweep graded by whoever wrote it, and a child of the GATE pays that
// gate's whole import graph three times -- enough to push it over the 20 s cap on the rig. A child of THIS
// module imports three builtins and the same code the parent runs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FIXTURE_DIR = "tools/ship";
// v4663 -- rigRunner copies a gate to sabotage it, and the copy has to sit BESIDE the original or its
// relative imports do not resolve. So the reclaim covers the directories that actually carry transient
// fixtures rather than one of them. The `__` prefix is still what bounds it, and gateSweep refuses to
// enumerate a `__` file as a gate wherever it lives.
export const FIXTURE_DIRS = Object.freeze(["tools/ship", "physics"]);
// `__` is the tree's OWN mark for a transient fixture, not a name invented here: gateSweep's walk
// refuses to enumerate `__`-prefixed files as gates for exactly this reason, and nothing tracked in
// tools/ship carries it. So the reclaim covers every gate that leaves one -- inputSets writes five,
// sweepCoverage writes __sweepcov_leaker_fixture.mjs and unlinks it on its happy path only, and that
// one was sitting in Keith's tree when this was written.
export const FIXTURE_PREFIX = "__";
export const PROBE_PREFIX = "__inputsets_";
export const LIVE_FIXTURES = new Set();

export const fixtureAbs = (rel) => (path.isAbsolute(rel) ? rel : path.join(ENG, rel));
export const writeFixture = (rel, src) => { LIVE_FIXTURES.add(rel); fs.writeFileSync(fixtureAbs(rel), src); return rel; };
export const dropFixture = (rel) => { try { fs.unlinkSync(fixtureAbs(rel)); } catch {} LIVE_FIXTURES.delete(rel); };

// Prefix-scoped on purpose: this unlinks inside a SOURCE directory, so the names it will remove are spelled
// here rather than left to a glob somebody widens later. The gate drives that scoping with its own control.
export function reclaimStranded() {
    const stranded = [];
    for (const dir of FIXTURE_DIRS) {
        let names = [];
        try { names = fs.readdirSync(fixtureAbs(dir)); } catch { continue; }
        for (const nm of names.filter((x) => x.startsWith(FIXTURE_PREFIX))) {
            try { fs.unlinkSync(fixtureAbs(dir + "/" + nm)); stranded.push(dir + "/" + nm); } catch {}
        }
    }
    return stranded;
}


// ---------------------------------------------------------------------------------------------------------
// *** AND THE OTHER THING A KILLED RUN LEAVES: A GATE IT WAS HALF-WAY THROUGH SABOTAGING. ***
//
// rigRunner-selfcheck proves the rig page can go red by EDITING physics/upAxis-selfcheck.mjs -- replacing
// the assertion with `false` -- running it, and restoring the original in a `finally`. A finally covers a
// throw. It does not cover a SIGKILL at the sweep's cap, and Keith's box took 241 of those in one run.
//
// What that cost, measured rather than imagined: one killed run left upAxis sabotaged, so upAxis read RED in
// every sweep afterwards. Worse, the next rigRunner run snapshotted the ALREADY-SABOTAGED file as its
// original, found its own sabotage string missing, threw, and its finally wrote the sabotage back. The
// corruption was self-perpetuating, it survived a hand restore, and it cost two rounds of reading "y = 5.000
// after 1s at 5 m/s" as a Windows physics finding when the physics was right all along.
//
// So a mutation is LEDGERED BEFORE IT IS MADE, in a file outside the engine tree (captures/ is already the
// place for that, established when a capture of gate output was flagged as an unlicensed copy by the very
// gate it quoted). A process that dies in any way leaves the ledger, and the next run restores from it.
export const MUTATION_LEDGER = path.join(path.resolve(ENG, ".."), "captures", ".stranded-mutations.json");

function readLedger() {
    try { return JSON.parse(fs.readFileSync(MUTATION_LEDGER, "utf8")); } catch { return {}; }
}
function writeLedger(obj) {
    if (!Object.keys(obj).length) { try { fs.unlinkSync(MUTATION_LEDGER); } catch {} return; }
    fs.mkdirSync(path.dirname(MUTATION_LEDGER), { recursive: true });
    fs.writeFileSync(MUTATION_LEDGER, JSON.stringify(obj, null, 1) + "\n");
}

const MUTATED = new Map();

/** Write `text` over `rel`, having first recorded the original where a LATER PROCESS can find it. */
export function mutateFile(rel, text) {
    const original = fs.readFileSync(fixtureAbs(rel), "utf8");
    const led = readLedger();
    led[rel] = { at: new Date().toISOString(), pid: process.pid, original };
    writeLedger(led);            // ledger FIRST: a death between these two lines loses nothing
    MUTATED.set(rel, original);
    fs.writeFileSync(fixtureAbs(rel), text);
    return original;
}

/** Put `rel` back the way mutateFile found it, and drop it from the ledger. */
export function restoreMutation(rel) {
    const led = readLedger();
    const original = MUTATED.get(rel) ?? (led[rel] && led[rel].original);
    if (typeof original === "string") { try { fs.writeFileSync(fixtureAbs(rel), original); } catch {} }
    MUTATED.delete(rel);
    delete led[rel];
    writeLedger(led);
    return typeof original === "string";
}

/**
 * Restore everything a PREVIOUS process left mutated, and say what it was. Non-empty means a run died
 * between a mutation and its restore -- which is a corrupted tree, not a tidy-up, and the caller should say
 * so out loud rather than swallow it.
 */
export function reclaimMutations() {
    const led = readLedger();
    const back = [];
    for (const [rel, rec] of Object.entries(led)) {
        if (!rec || typeof rec.original !== "string") continue;
        try { fs.writeFileSync(fixtureAbs(rel), rec.original); back.push(rel); } catch {}
    }
    writeLedger({});
    return back;
}

let armed = false;
export function armExitSweep() {
    if (armed) return false;
    armed = true;
    process.on("exit", () => {
        for (const rel of Array.from(LIVE_FIXTURES)) dropFixture(rel);
        for (const rel of Array.from(MUTATED.keys())) restoreMutation(rel);
    });
    return true;
}

export const PROBE_REG = FIXTURE_DIR + "/" + PROBE_PREFIX + "litterprobe_fixture.txt";
export const PROBE_RAW = FIXTURE_DIR + "/" + PROBE_PREFIX + "rawprobe_fixture.txt";

// Run directly, this IS the probe the gate drives: strand a fixture and die, either registered or not. The
// main-module test is pathToFileURL's, because `import.meta.url === "file://" + process.argv[1]` is a POSIX
// spelling that never matches on Windows (v4646 fixed ten files of it).
if (pathToFileURL(process.argv[1] || "").href === import.meta.url) {
    reclaimStranded();
    armExitSweep();
    if (process.argv[2] === "mutate-kill" || process.argv[2] === "rawmutate-kill") {
        // The death a finally cannot survive, on the real mechanism: ledger a mutation and take SIGKILL.
        // The `rawmutate` twin writes the same bytes WITHOUT ledgering, which is what the code did before
        // v4649 -- it is the control that proves the ledger is what brings the file back.
        if (process.argv[2] === "mutate-kill") mutateFile(process.argv[3], "MUTATED BY THE LITTER PROBE\n");
        else fs.writeFileSync(fixtureAbs(process.argv[3]), "MUTATED BY THE LITTER PROBE\n");
        process.kill(process.pid, "SIGKILL");
    } else if (process.argv[2] === "raw") fs.writeFileSync(fixtureAbs(PROBE_RAW), "unregistered\n");
    else writeFixture(PROBE_REG, "registered\n");
    throw new Error("litter probe: dying with a fixture on disk");
}
