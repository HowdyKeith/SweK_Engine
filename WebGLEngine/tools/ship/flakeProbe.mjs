#!/usr/bin/env node
// WebGLEngine/tools/ship/flakeProbe.mjs -- v4826
//
// Run: node tools/ship/flakeProbe.mjs --gates tools/ship/tslRace-selfcheck.mjs,... [--from-file list.txt] [--times 5] [--write [--merge]] [--out file.json]
//
// *** A GATE THAT PASSES ONE RUN IN EIGHT LESS THAN IT SHOULD IS NOT FOUND BY RUNNING IT ONCE, AND IT WAS NOT FOUND BY RUNNING IT ONCE. ***
// v4822's step 4b ran tools/ship/tslRace-selfcheck.mjs and it was red; run again it was green; run again, red. On main, with nothing of the round in it, it
// failed one run in eight. The row asked ONE pick of a live page for a Chaos ship, and the fleet is one to three pixels of a 640 x 480 pick, so the row read
// 0, 1, 2 or 3 depending on where the fleets were that frame. Nothing in the tree measured that: a gate is run once per sweep, and a once-run gate that is
// right 87% of the time is green 87% of the sweeps.
//
// So this runs a gate K times, serially (a parallel run makes its own flakes), parses the rows every gate prints (`  PASS  name   detail` /
// `  FAIL  name   detail`) and reports two things:
//   FLIPPED  a row that passed in some runs and failed in others. A flake, by definition, and the report names the row and the counts.
//   THIN     a row that PASSED every run but whose detail carries a number that VARIED between runs with a small value among them (3 or under): the species
//            that was the tslRace row before it failed -- a COUNT read from a moving scene that has room to be zero. It has not failed yet; it is one run
//            away. (A number that varies and is large is a timing in milliseconds or a hash fragment; one that varies and is not a whole number is a measured
//            fraction -- 0.2197, 0.2193 -- with no zero to fall to; neither is reported. The first full probe, over the live-page gates, reported eleven of those.)
// A gate that exits non-zero with no FAIL row (a crash, a timeout) is reported as CRASHED with its last line.
//
// WHAT IT DOES NOT DO: prove a gate stable. K clean runs bound the flake rate (5 clean runs: under 37% at 95% confidence, "rule of three" 3/K = 60% for 5)
// and no more; the report says the K it used, and the record keeps it, so a later run with a larger K can be read against this one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, refusalLines } from "./cliArgs.mjs";
import { stableWrite } from "./stableWrite.mjs";
import { compareRuns, parseRows, THIN_MAX } from "./flakeCompare.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECORD = path.join(ENG, "tools", "ship", "flake-probe.json");

/**
 * One serial run of a gate; { code, rows, last, ms }. spawnSync with a SIGKILL cap and not a timer that kills (a gate that catches SIGTERM -- every Playwright one --
 * outlives a polite kill, v4824; and the kill is the runtime's own, so there is no `.kill(` here whose effect nobody re-checks). A gate not finished in capMs has code null.
 */
function runGate(gate, { capMs = 900000, cwd = ENG } = {}) {
    const t0 = Date.now(), r = spawnSync(process.execPath, [path.resolve(ENG, gate)], { cwd, timeout: capMs, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = String(r.stdout || "") + String(r.stderr || ""), lines = out.split(/\r?\n/).filter(Boolean);
    return { code: r.status, rows: parseRows(out), last: lines[lines.length - 1] || (r.error ? String(r.error.message) : ""), ms: Date.now() - t0 };
}

const SPEC = Object.freeze({ values: Object.freeze({ "--gates": "string", "--from-file": "path", "--times": "number", "--out": "path" }), flags: Object.freeze(["--write", "--merge"]) });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const cli = parseArgs(process.argv.slice(2), SPEC), v = cli.values;
    if (!cli.errors.length && !v["--gates"] && !v["--from-file"]) cli.errors.push("--gates a,b,c or --from-file list.txt is required");
    if (cli.errors.length) { for (const l of refusalLines("flakeProbe", cli.errors, SPEC)) console.error(l); process.exit(2); }
    const gates = [...(v["--gates"] ? v["--gates"].split(",") : []), ...(v["--from-file"] ? fs.readFileSync(v["--from-file"], "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [])];
    const times = v["--times"] || 5, outFile = v["--out"] || RECORD;
    // --merge: the gates run now replace their own entries in the record and every other entry stays, each with the K IT was taken at -- so a few gates can be probed again (longer, or under a corrected rule) without losing the rest
    let record = { at: null, thinMax: THIN_MAX, gates: {} };
    if (cli.flags.has("--merge")) { try { record = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch (e) { /* none yet: a fresh record */ } record.thinMax = THIN_MAX; }
    record.at = new Date().toISOString().slice(0, 10);
    let flaky = 0, thinGates = 0, crashed = 0;
    for (const g of gates) {
        const runs = []; for (let k = 0; k < times; k++) runs.push(runGate(g));
        const c = compareRuns(runs), ms = Math.round(runs.reduce((a, r) => a + r.ms, 0) / runs.length);
        record.gates[g] = { times, flipped: c.flipped, thin: c.thin.map((t) => ({ name: t.name, min: t.min, max: t.max })), crashed: c.crashed.length };
        console.log(`${c.stable ? "stable " : c.flipped.length ? "FLIPPED" : c.crashed.length ? "CRASHED" : "THIN   "}  ${g}  (${times} runs, ${ms} ms each)`);
        for (const f of c.flipped) console.log(`    FLIPPED  ${f.name}  passed ${f.pass}, failed ${f.fail}`);
        for (const t of c.thin) console.log(`    THIN     ${t.name}  a number in its detail read ${t.seen.join(", ")}`);
        for (const x of c.crashed) console.log(`    CRASHED  run ${x.run} exit ${x.code}: ${x.last.slice(0, 160)}`);
        if (c.flipped.length) flaky++; else if (c.thin.length) thinGates++; if (c.crashed.length) crashed++;
    }
    console.log(`\n[flakeProbe] ${gates.length} gate(s) x ${times} run(s): ${flaky} flipped, ${thinGates} thin, ${crashed} crashed, ${gates.length - flaky - thinGates - crashed} stable`);
    if (cli.flags.has("--write")) {
        // the date is a stamp (tools/ship/stableWrite.mjs): a probe that finds what the record already says leaves the file alone. `ms` is not in the record -- a timing is the box's, not the gate's
        const w = stableWrite(outFile, (stamp) => ({ generatedFrom: "tools/ship/flakeProbe.mjs", at: stamp, thinMax: THIN_MAX, gates: record.gates }), { stampName: "at", stampValue: new Date().toISOString().slice(0, 10), newline: true });
        console.log(`[flakeProbe] ${w.wrote ? "wrote" : "left alone (nothing new)"} ${path.relative(ENG, outFile)} (${Object.keys(record.gates).length} gate(s))`);
    }
    process.exit(flaky || crashed ? 1 : 0);
}
