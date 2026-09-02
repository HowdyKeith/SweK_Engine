#!/usr/bin/env node
// WebGLEngine/tools/ship/quickSweep-selfcheck.mjs -- v4303
//
// GATES tools/ship/quickSweep.mjs -- the ship-time sweep that closes #134. The pure parts are checked as
// arithmetic on hand-made inputs: selection by budget (and that a gate with no timing is always run),
// reconciliation against the red register (a red the register names is KNOWN, one it does not is NEW, and
// a serial timeout is neither), and that the register is built from the records it says it is built from.
// Then a REAL run over a handful of cheap gates, with the timings file left untouched, proves the runner
// runs -- and a control with a gate that always exits 1 proves it can report a NEW red, because a runner
// that reports green for everything would pass every other line here.
//
// Run: node tools/ship/quickSweep-selfcheck.mjs
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "./quickSweep.mjs";
import { VERDICT, SWEEP_V4297, REGRESSIONS_REPAIRED } from "./gateSweep.mjs";
import { RED_AT_V4279, UNCONFIRMED_SLOW } from "./redCensus.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);

// ---------------------------------------------------------------------------------------------------------
sec("1. SELECTION: UNDER BUDGET RUNS, OVER BUDGET IS SKIPPED, NO TIMING ALWAYS RUNS");
// ---------------------------------------------------------------------------------------------------------
{
    const all = ["a.mjs", "b.mjs", "c.mjs", "d.mjs"], timings = { "a.mjs": 100, "b.mjs": 3000, "c.mjs": 3001 };
    const s = Q.selectGates(all, timings, 3000);
    ok(JSON.stringify(s.run) === JSON.stringify(["a.mjs", "b.mjs", "d.mjs"]) && JSON.stringify(s.skipped) === JSON.stringify(["c.mjs"]),
       "*** 100 and 3000 ms run at a 3000 ms budget, 3001 is skipped, and the gate with no timing runs ***", `run ${s.run.join(",")}; skipped ${s.skipped.join(",")}`);
    ok(JSON.stringify(s.unmeasured) === JSON.stringify(["d.mjs"]), "the unmeasured gate is named as such", "a new gate earns a timing on its first ship");
    const none = Q.selectGates(all, {}, 3000);
    ok(none.run.length === 4 && none.skipped.length === 0, "with no timings file at all, everything runs once", "the first run is the full census");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE REGISTER IS BUILT FROM THE RECORDS IT NAMES, AND THE SIX REGRESSIONS ARE DELIBERATELY NOT IN IT");
// ---------------------------------------------------------------------------------------------------------
{
    const reg = Q.redRegister();
    ok(RED_AT_V4279.every((e) => reg.get(e.gate) === "redCensus.RED_AT_V4279"), "every RED_AT_V4279 entry is known, credited to that record", `${RED_AT_V4279.length} entries`);
    ok(SWEEP_V4297.unmeasured.every((g) => reg.has(g)) && SWEEP_V4297.fromSlowBucket.every((g) => reg.has(g)),
       "the v4297 unmeasured and slow-bucket gates are known too", `${SWEEP_V4297.unmeasured.length} + ${SWEEP_V4297.fromSlowBucket.length}`);
    ok(SWEEP_V4297.regressions.every((g) => !reg.has(g)),
       "*** the six v4297 regressions are NOT in the register: their red is the thing to repair, not to accept ***", SWEEP_V4297.regressions.map((g) => g.split("/").pop()).join(", "));
    ok(reg.size === new Set([...RED_AT_V4279.map((e) => e.gate), ...UNCONFIRMED_SLOW, ...SWEEP_V4297.fromSlowBucket, ...SWEEP_V4297.unmeasured]).size,
       "and the register's size is the union of those lists, nothing typed", `${reg.size} gates`);
    const repaired = Object.keys(REGRESSIONS_REPAIRED.gates).sort();
    ok(JSON.stringify(repaired) === JSON.stringify([...SWEEP_V4297.regressions].sort()) && repaired.every((g) => /v43\d\d/.test(REGRESSIONS_REPAIRED.gates[g])),
       "*** and every one of the six is recorded as REPAIRED, with the round that did it ***", `${repaired.length} of ${SWEEP_V4297.regressions.length}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. RECONCILIATION: KNOWN, NEW, AND NOT-A-VERDICT ARE THREE DIFFERENT THINGS");
// ---------------------------------------------------------------------------------------------------------
{
    const reg = new Map([["old.mjs", "test"]]);
    const rows = [
        { gate: "old.mjs", verdict: VERDICT.RED, serialMs: 5, serialCode: 1 },
        { gate: "fresh.mjs", verdict: VERDICT.RED, serialMs: 7, serialCode: 1 },
        { gate: "slow.mjs", verdict: VERDICT.UNCONFIRMED },
        { gate: "fine.mjs", verdict: VERDICT.GREEN },
    ];
    const r = Q.reconcile(rows, reg);
    ok(r.known.length === 1 && r.known[0].gate === "old.mjs" && r.known[0].record === "test", "a red the register names is KNOWN, with its record");
    ok(r.newRed.length === 1 && r.newRed[0].gate === "fresh.mjs" && r.newRed[0].code === 1, "*** a red the register does not name is NEW -- the finding ***");
    ok(r.unmeasured.length === 1 && r.unmeasured[0] === "slow.mjs", "a serial timeout is UNMEASURED, never red and never green");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. A REAL RUN OVER THREE CHEAP GATES, THE TIMINGS FILE UNTOUCHED; AND A CONTROL THAT MUST GO RED");
// ---------------------------------------------------------------------------------------------------------
{
    // not staleness: it compares case-study.html's gate count with the tree and is red mid-round by design, until the ritual runs --fix
    const cheap = ["tools/ship/windowsImport-selfcheck.mjs", "tools/ship/backendParity-selfcheck.mjs", "tools/ship/citedSources-selfcheck.mjs"];
    const before = fs.existsSync(path.join(ENG, Q.DEFAULTS.timingsFile)) ? fs.readFileSync(path.join(ENG, Q.DEFAULTS.timingsFile), "utf8") : null;
    const r = await Q.runQuickSweep({ gates: cheap, budgetMs: 60000, workers: 3, capMs: 60000, write: false });
    const after = fs.existsSync(path.join(ENG, Q.DEFAULTS.timingsFile)) ? fs.readFileSync(path.join(ENG, Q.DEFAULTS.timingsFile), "utf8") : null;
    ok(r.ran === 3 && r.green === 3 && r.newRed.length === 0 && r.knownRed.length === 0,
       "*** three green gates run green: the runner runs and classifies ***", `${r.green} green in ${r.ms} ms`);
    ok(before === after, "and with write:false the timings file is byte-identical afterwards");
    // the control: a gate that always fails, outside the register, in a temp dir that enumerates as a root
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quickSweep-"));
    fs.writeFileSync(path.join(tmp, "always-selfcheck.mjs"), "process.exit(1);\n");
    fs.writeFileSync(path.join(tmp, "never-selfcheck.mjs"), "process.exit(0);\n");
    const c = await Q.runQuickSweep({ root: tmp, gates: ["always-selfcheck.mjs", "never-selfcheck.mjs"], budgetMs: 60000, workers: 2, capMs: 20000, write: false });
    ok(c.newRed.length === 1 && c.newRed[0].gate === "always-selfcheck.mjs" && c.green === 1,
       "*** CONTROL: a gate that exits 1 and is in no register is reported as NEW red, and its neighbour green ***", JSON.stringify(c.newRed));
    fs.writeFileSync(path.join(tmp, "hang-selfcheck.mjs"), "setTimeout(() => {}, 60000);\n");
    const h = await Q.runQuickSweep({ root: tmp, gates: ["hang-selfcheck.mjs"], budgetMs: 60000, workers: 1, capMs: 1500, write: false });
    ok(h.unmeasured.length === 1 && h.newRed.length === 0, "a gate that hangs past the cap is UNMEASURED, not red", `${h.ms} ms`);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------------------------------------
sec("5. verify.mjs RUNS IT, AND FAILS ON NEW REDS ONLY");
// ---------------------------------------------------------------------------------------------------------
{
    const v = fs.readFileSync(path.join(ENG, "tools/ship/verify.mjs"), "utf8");
    ok(/runQuickSweep\(/.test(v), "*** verify.mjs calls runQuickSweep -- the ship gate now runs the cheap tree, not one named gate ***");
    ok(/newRed\.length === 0/.test(v), "and the check that fails is on NEW reds, so the standing register does not make every ship red");
    ok(/knownRed/.test(v), "and it reports the known reds by count rather than hiding them");
    const skill = fs.readFileSync(path.join(ENG, "..", ".claude", "skills", "ship", "SKILL.md"), "utf8");
    ok(/quickSweep|quick sweep/i.test(skill), "the ship skill knows the sweep is part of verify now");
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  reconcile() treats every red as KNOWN.
//      -> exit=1, three lines: sections 3 and 4's control both see the NEW red vanish into "known". This is
//      the failure the register invites -- widen it and every ship is green -- and the control gate that
//      exits 1 in a temp dir is what makes it visible.
//
//   B  selectGates() skips a gate with no timing instead of running it.
//      -> exit=1, four lines: section 1 twice, and the control and the hang test in section 4, because a
//      temp-dir gate has no timing and would never run. A new gate that never earns a timing is a gate the
//      sweep never sees; that is the v4257 hole in a new coat.
//
//   C  verify.mjs's check no longer fails on a new red.
//      -> exit=1, one line, section 5. The sweep can find a regression and the ship still says ALL GREEN.
//
//   D  a serial timeout reported as a NEW red.
//      -> exit=1, three lines: section 3, and section 4's hang test. A timeout alone is not a verdict --
//      v4297's UNMEASURED bucket exists so that "did not finish" is never folded into "failed".
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the gates OVER the budget. A regression in a 40-second gate is still found by the " +
    "full two-phase sweep and by nothing at ship time; the budget is a measured trade, recorded in the changelog, " +
    "not a claim that the slow gates are fine.");
process.exit(fails ? 1 : 0);
