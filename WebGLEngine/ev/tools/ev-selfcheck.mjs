#!/usr/bin/env node
// Rig-side EV data-file sanity check.  Usage:  node ev/tools/ev-selfcheck.mjs <path-to-EV-data-file>
//
// Loads the file with the exact same parser the engine uses (resource fork / .ndat / .rez / MacBinary / AppleDouble),
// builds the universe, then runs referential-integrity checks that catch byte-offset drift. Exits 0 if clean, 1 if any
// hard check fails, 2 on a load error. Bring your own EV data file (clean-room: the engine ships none of its own).
import { readFileSync } from "node:fs";
import { loadResourceFork } from "../resourceFork.js";
import { buildUniverse } from "../evData.js";
import { runEvChecks } from "../evChecks.mjs";

const path = process.argv[2];
if (!path) { console.log("[ev] SKIPPED: no EV data file given -- pass a path to a real EV/EV Nova data file to run this check. The parser is exercised by its own unit checks; this gate validates against real game data when available."); process.exit(0); }

let uni;
try {
    const buf = readFileSync(path);
    const rf = loadResourceFork(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    uni = buildUniverse(rf);
    console.log("loaded " + path + "  (" + rf.container + ", " + rf.count + " resources)\n");
} catch (e) { console.error("parse failed: " + e.message); process.exit(2); }

const rep = runEvChecks(uni);
const mark = { pass: "  ok  ", warn: " WARN ", fail: " FAIL " };
for (const c of rep.checks) console.log(mark[c.level] + c.name + "  -  " + c.detail);
console.log("\n" + (rep.ok ? "PASS" : "FAIL") + "  -  " + rep.fails + " fail, " + rep.warns + " warn, " + rep.total + " checks");
process.exit(rep.ok ? 0 : 1);
