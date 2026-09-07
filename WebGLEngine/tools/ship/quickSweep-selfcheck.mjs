#!/usr/bin/env node
// WebGLEngine/tools/ship/quickSweep-selfcheck.mjs -- v4461 (was v4303)
//
// GATES tools/ship/quickSweep.mjs -- the ship-time sweep that closes #134. The pure parts are checked as
// arithmetic on hand-made inputs: selection by budget (and that a gate with no timing is always run),
// reconciliation against the red register (a red the register names is KNOWN, one it does not is NEW, and
// a serial timeout is neither), and that the register is built from the records it says it is built from.
// Then a REAL run over a handful of cheap gates, with the timings file left untouched, proves the runner
// runs -- and a control with a gate that always exits 1 proves it can report a NEW red, because a runner
// that reports green for everything would pass every other line here.
//
// ---- *** v4461 -- THE POSITIVE ROW WAS EXACTLY BACKWARDS, AND ITS CONTROL SAT THREE LINES BELOW IT *** ----
//
// Section 4 named three live gates and asserted `r.green === 3`. That is a claim about THE TREE; the header
// two paragraphs up says the block exists to prove "the runner runs". Two of the three have since gone red,
// so this gate was RED -- and at 5,981 ms it is above the 3,000 ms ship-time budget, so the sweep it grades
// never runs it. *** THE GATE THAT GRADES THE SWEEP THAT GATES EVERY SHIP WAS RED AND INVISIBLE, and it took
// v4460's census of stale green verdicts to find it. ***
//
// MEASURED BOTH WAYS, which is the only thing that settles what a row is actually testing:
//
//     runner CORRECT, two named gates red        -> the row FAILS
//     runner SABOTAGED to call EVERYTHING green  -> the row PASSES
//
// Under that one sabotage the two rows moved in OPPOSITE directions -- the hermetic control PASS -> FAIL and
// this row FAIL -> PASS. A runner that reports green for everything is the exact failure the header says the
// control exists to catch, and this row was not merely blind to it, it was REPAIRED by it.
//
// v4461 SABOTAGES, RESULTS BY NAME:
//   BA. the runner calls EVERYTHING green (the one that used to repair the row) -> 4 RED
//   BB. the runner calls everything RED                                         -> 4 RED
//   BC. write:false writes the timings file anyway                              -> 2 RED
//   BD. one hermetic gate exits 1 instead of 0                                  -> 2 RED
//   BE. the agreement row reads greenness instead of agreement                  -> 2 RED
//   BF. the hermetic row is pointed back at real tree gates                     -> 2 RED
//
// *** BC WAS A CRASH BEFORE IT WAS A VERDICT, AND MY OWN HARNESS READ THE CRASH AS 0 RED. *** Forcing the
// write made the hermetic run die on ENOENT -- no tools/ship/ under the temp root -- so the gate exited 1
// while naming nothing, and a sabotage harness that counts FAIL lines saw zero. A CRASH IS NOT A VERDICT
// (v3201), and counting the wrong thing is the same defect as this round's subject, committed by me inside
// the round about it. The harness reads the exit code now, the temp root carries its directory, and BC lands
// on the row whose name it belongs to.
//
// Run: node tools/ship/quickSweep-selfcheck.mjs
"use strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "./quickSweep.mjs";
import { VERDICT, SWEEP_V4297, REGRESSIONS_REPAIRED } from "./gateSweep.mjs";
import { RED_AT_V4279, RED_AT_V4408, RED_AT_V4424, RED_AT_V4476, UNCONFIRMED_SLOW , RED_AT_V4484} from "./redCensus.mjs";

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
    // v4476 -- A SEVENTH LIST JOINED, AND THIS ROW WENT RED THE MOMENT IT DID, EXACTLY AS THE NOTE ABOVE
    // PROMISES. RED_AT_V4424 (v4471) and RED_AT_V4476 are both here now. The union is derived rather than
    // typed precisely so a register that quietly grows cannot pass as one that did not.
    ok(reg.size === new Set([...RED_AT_V4279.map((e) => e.gate), ...RED_AT_V4408.map((e) => e.gate),
                             ...RED_AT_V4424.map((e) => e.gate), ...RED_AT_V4476.map((e) => e.gate),
                             ...RED_AT_V4484.map((e) => e.gate),
                             ...UNCONFIRMED_SLOW, ...SWEEP_V4297.fromSlowBucket, ...SWEEP_V4297.unmeasured]).size,
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
sec("4. THE RUNNER RUNS AND CLASSIFIES -- HERMETICALLY, THEN AGAINST REAL GATES BY AGREEMENT");
// ---------------------------------------------------------------------------------------------------------
// *** v4461 -- THE POSITIVE ROW HERE WAS EXACTLY BACKWARDS, AND ITS OWN CONTROL SAT THREE LINES BELOW IT. ***
//
// It named three live gates -- windowsImport, backendParity, citedSources -- and asserted `r.green === 3`.
// That is a claim about THE TREE, not about the runner, and this file's header says the block exists to
// prove "the runner runs". Two of the three have since gone red, so the row was red; and because this gate
// costs 5,981 ms it sits above the 3,000 ms ship-time budget, so the sweep it grades never runs it and
// nobody saw. *** THE GATE THAT GRADES THE SWEEP THAT GATES EVERY SHIP WAS RED AND INVISIBLE. ***
//
// MEASURED BOTH WAYS, which is the only thing that settles what a row is really testing:
//
//   the runner is CORRECT and two named gates are red   -> the row FAILS
//   the runner is SABOTAGED to call EVERYTHING green    -> the row PASSES
//
// A runner that reports green for everything is the exact failure this file's header says the control exists
// to catch -- and this row is not merely blind to it, it is REPAIRED by it. Under that one sabotage the two
// rows moved in opposite directions: the hermetic control PASS -> FAIL, this row FAIL -> PASS.
//
// So the positive case is hermetic now, and the live-tree run stays -- because synthetic one-line gates do
// not exercise real imports, real paths or real durations -- but its claim is AGREEMENT rather than
// greenness: every gate the runner called green must exit 0 when run alone, and every gate it called red
// must not. That grades the runner on real modules and says nothing whatever about whether the tree is
// healthy, so it cannot rot when an unrelated gate goes red.
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quickSweep-"));
    // *** THE TIMINGS DIRECTORY EXISTS UNDER THE HERMETIC ROOT ON PURPOSE. *** Without it, a runner that
    // writes when told not to dies on ENOENT before any row runs -- and A CRASH IS NOT A VERDICT (v3201): it
    // exits 1 while naming nothing, so the "byte-identical afterwards" row below could never be driven and
    // was asserted rather than exercised. With the directory here, a forced write lands in the temp tree, the
    // gate keeps running, and that row FAILS BY NAME. Found by sabotage, and by a harness of my own that read
    // the crash as 0 RED because it counted FAIL lines instead of the exit code.
    fs.mkdirSync(path.join(tmp, "tools", "ship"), { recursive: true });
    const mk = (n, body) => fs.writeFileSync(path.join(tmp, n), body);
    mk("g1-selfcheck.mjs", "process.exit(0);\n");
    mk("g2-selfcheck.mjs", "process.exit(0);\n");
    mk("g3-selfcheck.mjs", "process.exit(0);\n");
    const before = fs.existsSync(path.join(ENG, Q.DEFAULTS.timingsFile)) ? fs.readFileSync(path.join(ENG, Q.DEFAULTS.timingsFile), "utf8") : null;
    const g = await Q.runQuickSweep({ root: tmp, gates: ["g1-selfcheck.mjs", "g2-selfcheck.mjs", "g3-selfcheck.mjs"], budgetMs: 60000, workers: 3, capMs: 20000, write: false });
    ok(g.ran === 3 && g.green === 3 && g.newRed.length === 0 && g.knownRed.length === 0 && g.unmeasured.length === 0,
       "*** three gates that exit 0 run green: the runner runs and classifies ***",
       `${g.green} green of ${g.ran} in ${g.ms} ms, and NOT ONE OF THEM IS A GATE IN THIS TREE -- the old ` +
       "version of this row named three real gates and went red when two of them did");

    // *** THE LIVE RUN, GRADED ON AGREEMENT. *** Real modules, real imports, real durations -- and the
    // assertion is that the runner AGREES with each gate taken alone, whatever that gate's verdict is.
    const live = ["tools/ship/windowsImport-selfcheck.mjs", "tools/ship/backendParity-selfcheck.mjs", "tools/ship/citedSources-selfcheck.mjs"];
    const r = await Q.runQuickSweep({ gates: live, budgetMs: 60000, workers: 3, capMs: 60000, write: false });
    const said = new Map();
    for (const x of r.newRed) said.set(x.gate, "red");
    for (const x of r.knownRed) said.set(typeof x === "string" ? x : x.gate, "red");
    for (const x of r.unmeasured) said.set(typeof x === "string" ? x : x.gate, "unmeasured");
    for (const x of live) if (!said.has(x)) said.set(x, "green");
    const alone = new Map(live.map((x) => {
        const p = spawnSync(process.execPath, [x], { cwd: ENG, timeout: 120000, stdio: "ignore" });
        return [x, p.signal ? "unmeasured" : p.status === 0 ? "green" : "red"];
    }));
    const disagree = live.filter((x) => said.get(x) !== alone.get(x));
    ok(r.ran === live.length && disagree.length === 0 && said.size === live.length,
       "*** ON REAL GATES THE RUNNER AGREES WITH EACH ONE RUN ALONE -- WHATEVER ITS VERDICT ***",
       live.map((x) => x.split("/").pop().replace("-selfcheck.mjs", "") + " " + said.get(x)).join(", ") +
       (disagree.length ? ` -- DISAGREES ON ${disagree.join(", ")}` : "") +
       ". This row passes on a red tree and fails on a wrong runner, which is the way round it was not.");
    ok(before === (fs.existsSync(path.join(ENG, Q.DEFAULTS.timingsFile)) ? fs.readFileSync(path.join(ENG, Q.DEFAULTS.timingsFile), "utf8") : null),
       "and with write:false the timings file is byte-identical afterwards");

    // the control: a gate that always fails, outside the register, in a temp dir that enumerates as a root
    mk("always-selfcheck.mjs", "process.exit(1);\n");
    mk("never-selfcheck.mjs", "process.exit(0);\n");
    const c = await Q.runQuickSweep({ root: tmp, gates: ["always-selfcheck.mjs", "never-selfcheck.mjs"], budgetMs: 60000, workers: 2, capMs: 20000, write: false });
    ok(c.newRed.length === 1 && c.newRed[0].gate === "always-selfcheck.mjs" && c.green === 1,
       "*** CONTROL: a gate that exits 1 and is in no register is reported as NEW red, and its neighbour green ***", JSON.stringify(c.newRed));
    mk("hang-selfcheck.mjs", "setTimeout(() => {}, 60000);\n");
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
