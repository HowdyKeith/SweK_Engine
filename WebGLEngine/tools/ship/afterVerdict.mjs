// WebGLEngine/tools/ship/afterVerdict.mjs -- v4835
//
// Run: node tools/ship/afterVerdict.mjs [--list] [--timeout-s 900]
//
// *** THE SHIP RITUAL'S STEP 4b WAS A REGEX IN A MARKDOWN FILE, AND IT ASKED ONE OF THE TWO QUESTIONS. ***
//
// Step 4b exists because a SHIP verdict runs its gates against the timing record from BEFORE its own sweep and
// then rewrites that record, so a gate that reads the record can be green in the verdict and red on the rig
// (v4815). The step was a shell one-liner in .claude/skills/ship/SKILL.md: a regex over every gate's text,
// then a loop. Two things were wrong with that, and v4819 met the second.
//
//   1. THE REGEX MATCHED COMMENTS. labResults-selfcheck names the record only in prose and costs about
//      fifteen minutes, so the step told the person running it to "read and set aside" what it had selected.
//      Here the match is made on the source with comments stripped, so a mention in prose selects nothing.
//
//   2. IT ASKED ONLY ABOUT THE TIMING RECORD. The verdict's quick sweep runs gates under 3,000 ms. A gate over
//      that line which guards a frozen record is not run by ANY ship-time step, and v4819 shipped two of them
//      red on the merge's first verdict: world/orreryFleet.mjs's commit belt (orreryFleet-selfcheck, 20.9 s)
//      and world/universeWire.mjs's key drift (universeWire-selfcheck, 5.4 s), both moved by the vendor
//      re-vendors the merge brought. universeWire was caught only because it ALSO reads the timing record;
//      orreryFleet was caught by hand. tools/ship/recordReach.mjs already derives exactly that population --
//      `blockers`, the gates that are the only guard of a record and are too slow for the sweep -- and its
//      ratchet holds the COUNT. Nothing ran them. This does.
//
// So the step is one command: the timing-record readers (the same pattern the skill carried, now held here)
// together with recordReach's blockers, each run alone, serially, with a timeout, and every red named. It
// exits 1 on any red. It grades the tree it is run in and writes nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { enumerateGates } from "./gateSweep.mjs";
import { reach } from "./recordReach.mjs";
import { noComments } from "./sourceScan.mjs";
import { parseOrExit } from "./cliArgs.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The pattern step 4b of .claude/skills/ship/SKILL.md carried until v4835, character for character. It lives here
// now and the skill names this command; afterVerdict-selfcheck holds both halves of that move.
export const TIMING_READER = /sweep-timings|quickSweep\.mjs|sweepCoverage\.mjs|sweepRotation\.mjs|recordReach\.mjs|declaredCost\.mjs|budgetExile\.mjs|redCensus\.mjs|timingsTarget|readTimings|capReading|gate-timings/;

const rel = (g) => path.relative(ENG, path.resolve(ENG, g)).split(path.sep).join("/");

/** Gates whose CODE (comments stripped) names the timing record or a module that reads it. */
export function timingReaders({ gates = null, read = (g) => fs.readFileSync(path.resolve(ENG, g), "utf8") } = {}) {
    const all = (gates || enumerateGates()).map(rel);
    return all.filter((g) => { try { return TIMING_READER.test(noComments(read(g))); } catch { return false; } });
}

/** The gates nothing at ship time runs that are a frozen record's only guard -- recordReach's `blockers`. */
export function recordGuardians(r = null) {
    const R = r || reach();
    return (R.blockers || []).map((b) => ({ gate: rel(b.gate), ms: b.ms, records: [...b.records] }));
}

/** Both lists, joined, each gate with why it is on the plan. Sorted by path so two boxes print the same order. */
export function plan({ gates = null, read, r = null } = {}) {
    const why = new Map();
    const add = (g, w) => { if (!why.has(g)) why.set(g, []); why.get(g).push(w); };
    for (const g of timingReaders({ gates, read })) add(g, "reads the timing record the verdict rewrote");
    for (const b of recordGuardians(r)) add(b.gate, "the only guard of " + b.records.join(", ") +
        " and over the sweep's line (" + (b.ms == null ? "never timed" : b.ms + " ms") + ")");
    return [...why.keys()].sort().map((g) => ({ gate: g, why: why.get(g) }));
}

/** Run each gate alone and serially. `run` is injectable so the gate can drive a red and a timeout cheaply. */
export function runAll(list, { timeoutMs = 900000, cwd = ENG, out = (m) => console.log(m),
                               run = (g) => spawnSync(process.execPath, [g], { cwd, timeout: timeoutMs, stdio: "ignore" }) } = {}) {
    const reds = [];
    for (const [i, p] of list.entries()) {
        const t0 = Date.now();
        const r = run(p.gate);
        const ms = Date.now() - t0;
        const code = r.signal ? "killed (" + r.signal + ")" : r.status;
        if (r.status === 0 && !r.signal) out(`  ok    ${i + 1}/${list.length}  ${p.gate}  ${ms} ms`);
        else { reds.push({ gate: p.gate, code, ms, why: p.why }); out(`  RED   ${i + 1}/${list.length}  ${p.gate}  exit ${code}  ${ms} ms  -- ${p.why.join("; ")}`); }
    }
    return reds;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const cli = parseOrExit("afterVerdict", { values: { "--timeout-s": "number" }, flags: ["--list"] });
    const timeoutMs = (cli.values["--timeout-s"] || 900) * 1000;
    const p = plan();
    const readers = p.filter((x) => x.why.some((w) => w.startsWith("reads"))).length;
    const guards = p.filter((x) => x.why.some((w) => w.startsWith("the only guard"))).length;
    console.log(`[afterVerdict] ${p.length} gates: ${readers} read the timing record, ${guards} are a frozen record's only guard and over the sweep's line`);
    if (cli.flags.has("--list")) { for (const x of p) console.log(`  ${x.gate}  -- ${x.why.join("; ")}`); }
    else {
        const reds = runAll(p, { timeoutMs });
        console.log(`[afterVerdict] ${reds.length ? reds.length + " RED -- fix before the rig is asked" : "all " + p.length + " green"}`);
        process.exitCode = reds.length ? 1 : 0;
    }
}
