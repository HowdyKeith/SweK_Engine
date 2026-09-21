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
export const FIXTURE_PREFIX = "__inputsets_";
export const LIVE_FIXTURES = new Set();

export const fixtureAbs = (rel) => path.join(ENG, rel);
export const writeFixture = (rel, src) => { LIVE_FIXTURES.add(rel); fs.writeFileSync(fixtureAbs(rel), src); return rel; };
export const dropFixture = (rel) => { try { fs.unlinkSync(fixtureAbs(rel)); } catch {} LIVE_FIXTURES.delete(rel); };

// Prefix-scoped on purpose: this unlinks inside a SOURCE directory, so the names it will remove are spelled
// here rather than left to a glob somebody widens later. The gate drives that scoping with its own control.
export function reclaimStranded() {
    let names = [];
    try { names = fs.readdirSync(fixtureAbs(FIXTURE_DIR)); } catch { return []; }
    const stranded = names.filter((n) => n.startsWith(FIXTURE_PREFIX));
    for (const n of stranded) { try { fs.unlinkSync(fixtureAbs(FIXTURE_DIR + "/" + n)); } catch {} }
    return stranded;
}

let armed = false;
export function armExitSweep() {
    if (armed) return false;
    armed = true;
    process.on("exit", () => { for (const rel of Array.from(LIVE_FIXTURES)) dropFixture(rel); });
    return true;
}

export const PROBE_REG = FIXTURE_DIR + "/" + FIXTURE_PREFIX + "litterprobe_fixture.txt";
export const PROBE_RAW = FIXTURE_DIR + "/" + FIXTURE_PREFIX + "rawprobe_fixture.txt";

// Run directly, this IS the probe the gate drives: strand a fixture and die, either registered or not. The
// main-module test is pathToFileURL's, because `import.meta.url === "file://" + process.argv[1]` is a POSIX
// spelling that never matches on Windows (v4646 fixed ten files of it).
if (pathToFileURL(process.argv[1] || "").href === import.meta.url) {
    reclaimStranded();
    armExitSweep();
    if (process.argv[2] === "raw") fs.writeFileSync(fixtureAbs(PROBE_RAW), "unregistered\n");
    else writeFixture(PROBE_REG, "registered\n");
    throw new Error("litter probe: dying with a fixture on disk");
}
