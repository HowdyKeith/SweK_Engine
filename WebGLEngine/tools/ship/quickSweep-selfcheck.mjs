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
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "./quickSweep.mjs";
import { VERDICT, SWEEP_V4297, REGRESSIONS_REPAIRED } from "./gateSweep.mjs";
import { RED_AT_V4279, RED_AT_V4408, RED_AT_V4424, UNCONFIRMED_SLOW } from "./redCensus.mjs";

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
    // v4408 -- a FIFTH list joined the register (RED_AT_V4408, the reds the first rotation surfaced), and this
    // row went red the moment it did. That is the check working: a register that knows one shape reports
    // everything else as absent, and the union is derived here precisely so a new list cannot arrive unnoticed.
    ok(RED_AT_V4408.every((e) => reg.get(e.gate) === "redCensus.RED_AT_V4408"),
       "every RED_AT_V4408 entry is known, credited to that record", `${RED_AT_V4408.length} entries -- gates the over-budget population hid until the rotation ran them`);
    ok(reg.size === new Set([...RED_AT_V4279.map((e) => e.gate), ...RED_AT_V4408.map((e) => e.gate), ...RED_AT_V4424.map((e) => e.gate), ...UNCONFIRMED_SLOW, ...SWEEP_V4297.fromSlowBucket, ...SWEEP_V4297.unmeasured]).size,
       "and the register's size is the union of those lists, nothing typed", `${reg.size} gates`);
    // *** v4424: A MEASURED RED OUTRANKS "NOBODY LOOKED", AND THE REASON STRING HAS TO SHOW IT. *** All three
    // are also in UNCONFIRMED_SLOW, so the register's SIZE cannot tell whether the reason was upgraded.
    ok(RED_AT_V4424.every((e) => reg.get(e.gate) === "redCensus.RED_AT_V4424" && UNCONFIRMED_SLOW.includes(e.gate)),
       "*** the three measured at v4424 are credited to their FAILURE, not to the bucket they came out of ***",
       `${RED_AT_V4424.length} gates, each still listed in UNCONFIRMED_SLOW and each reading RED_AT_V4424`);
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
    // *** v4470 -- THIS USED TO ASSERT ALL THREE WERE GREEN, AND THAT IS A CLAIM ABOUT THREE OTHER GATES
    // RATHER THAN ABOUT THE RUNNER. *** It went red twice in one day for reasons the runner had no part in:
    // windowsImport and citedSources arrived red from a main merge, and this section reported "1 green in
    // 3037 ms" as though the RUNNER were broken. A fixture that names gates it assumes are green is a fixture
    // that inherits every unrelated failure in the tree.
    //
    // What the runner owes is AGREEMENT, not greenness: whatever verdict it reports for a real gate must be
    // the verdict that gate gives when run by itself. So each one is re-run directly here and the two are
    // compared. The section keeps its real point -- the runner works on the actual tree and not only on the
    // temp-dir synthetics below -- and loses its dependence on what those three gates happen to be doing.
    // *** ONE re-runner, USED FOR BOTH THE REAL GATES AND THE SYNTHETIC CONTROL BELOW. *** The draft before
    // this had two copies -- one for the tree, one for the temp-dir pair -- so a comparator that answered
    // "green" unconditionally broke the real comparison while the control, running its own copy, still passed.
    // A control that exercises a DIFFERENT INSTANCE of the thing it controls is not a control.
    const runVerdict = (file, cwd) => {
        try { execFileSync(process.execPath, [file], { cwd, timeout: 60000, stdio: "ignore" }); return "green"; }
        catch (e) { return e.status === 0 ? "green" : "red"; }
    };
    const verdictOf = (g) => runVerdict(g, ENG);
    const reported = new Map(cheap.map((g) => [g, "green"]));
    for (const n of r.newRed) reported.set(n.gate, "red");
    for (const n of r.knownRed) reported.set(n.gate, "red");
    for (const g of r.unmeasured || []) reported.set(g, "unmeasured");
    // ONE comparison, used by the live check AND by the control below. The first draft wrote the filter out
    // twice -- once live, once in the control -- so a sabotage of the live one left the control passing on its
    // own copy. THE CHECK AND THE THING UNDER TEST WERE DIFFERENT OBJECTS, which is the defect this section is
    // about, committed inside the repair for it. Caught by sabotage, 0 red, twice.
    const disagreementsIn = (verdicts) =>
        cheap.filter((g) => verdicts.get(g) !== "unmeasured" && verdicts.get(g) !== verdictOf(g));
    const disagreed = disagreementsIn(reported);
    ok(r.ran === 3 && disagreed.length === 0,
       "*** the runner runs three REAL gates and its verdict for each is the verdict that gate gives alone ***",
       `${r.ran} run, ${r.green} green, ${r.newRed.length + r.knownRed.length} red -- ` +
       (disagreed.length ? "DISAGREED: " + disagreed.join(", ") : "no disagreement") + `, ${r.ms} ms`);
    // *** AND THE AGREEMENT CHECK ABOVE IS VACUOUS WHILE EVERYTHING AGREES, WHICH IS THE SHAPE IT REPLACED. ***
    // With three green gates and three green verdicts, a comparator that always answered "agree" would pass.
    // So it is driven the other way here: a verdict deliberately mis-stated for a gate whose real answer is
    // known must be caught. Same fixture, opposite expectation -- the control this section already applies to
    // the runner, applied to the check on the runner.
    const liedAbout = cheap[0];
    const lying = new Map(reported); lying.set(liedAbout, reported.get(liedAbout) === "green" ? "red" : "green");
    const caught = disagreementsIn(lying);
    ok(caught.length === 1 && caught[0] === liedAbout,
       "  ...and that comparison can FAIL: a mis-stated verdict for one real gate is caught",
       `${liedAbout.split("/").pop()} reported as ${lying.get(liedAbout)}, runs ${verdictOf(liedAbout)}`);
    ok(before === after, "and with write:false the timings file is byte-identical afterwards");
    // *** AND verdictOf NEEDS A CONTROL OF ITS OWN, BECAUSE EVERY REAL GATE HERE IS GREEN. *** A verdictOf
    // that answered "green" unconditionally would agree with three green gates AND with a lie about one of
    // them, and both checks above would pass. Two synthetics settle it: one that exits 1, one that exits 0.
    const vtmp = fs.mkdtempSync(path.join(os.tmpdir(), "quickSweep-v-"));
    fs.writeFileSync(path.join(vtmp, "red-selfcheck.mjs"), "process.exit(1);\n");
    fs.writeFileSync(path.join(vtmp, "green-selfcheck.mjs"), "process.exit(0);\n");
    ok(runVerdict("red-selfcheck.mjs", vtmp) === "red" && runVerdict("green-selfcheck.mjs", vtmp) === "green",
       "  ...and the direct re-run itself tells red from green, on two synthetics that cannot drift",
       "exit 1 reads red, exit 0 reads green -- and it is THE SAME runVerdict the real gates go through, so a comparator that always said green fails HERE");
    try { fs.rmSync(vtmp, { recursive: true, force: true }); } catch {}

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
console.log("unchecked here: the gates over the budget THE ROTATION HAS NOT REACHED YET. v4408 answered the older " +
    "version of this line -- that a regression in a 40-second gate is found by the full sweep and by nothing at " +
    "ship time -- by re-timing the population a slice at a time: 138 of the first 140 came back UNDER budget, " +
    "because the reading that evicted them was the STARVED PARALLEL one. The pool is 234 and shrinking. Until it " +
    "is empty this line stands for what is left, and a gate that is genuinely slow stays out on purpose. " +
    "See tools/ship/sweepCoverage-selfcheck.mjs.");
process.exit(fails ? 1 : 0);
