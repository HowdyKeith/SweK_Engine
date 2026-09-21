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
//
// ---- v4647i SABOTAGES, RESULTS BY NAME (gateSweep-selfcheck / quickSweep-selfcheck) ---------------------
//
//   VA. every non-zero code is a finding again           -> 3 / 4 RED
//   VB. every non-zero code is an os-kill                -> 4 / 4 RED
//   VC. an os-kill softens the verdict to GREEN          -> 1 / 0 RED
//   VD. the report spells a crash NEW again              -> 0 / 2 RED
//   VE. crashCount ignores a row with no kind            -> 0 / 4 RED
//   VF. a name is offered for every exit code            -> 1 / 0 RED
//   VG. reconcile stores a kind contradicting the code   -> 0 / 1 RED
//   VH. killed() trusts a stored kind over the code      -> 0 / 1 RED
//
// *** VG'S FIRST MEASUREMENT WENT ZERO RED IN BOTH GATES, AND IT WAS RIGHT TO. *** The first draft stored
// `kind` and `name` on every reconcile row; deleting both changed no output anywhere, because the report
// derives the classification from `code`. A second spelling of one rule, unreadable by any test -- so the
// fields were REMOVED rather than given a row, and VG/VH now guard their absence. What that buys is a
// property the extra fields could not: a result saved by ANY version of this tool classifies identically,
// because the exit code is the only input. Keith's w4b.json, written before `kind` existed, reads correctly.
//
// ---- v4647h SABOTAGES, RESULTS BY NAME ------------------------------------------------------------------
//
//   UA. readSaved JSON.parses with no recovery (the crash Keith hit)  -> 5 RED
//   UB. the skipped lines are swallowed, so the recovery is silent    -> 2 RED
//   UC. the shape check is dropped -- anything that parses is ours    -> 1 RED
//   UD. --out writes the file AND leaves the JSON on stdout           -> 2 RED
//   UE. the sweep prints its own line to stdout again                 -> 1 RED
//   UF. --no-write writes the timings file anyway                     -> 1 RED
//
// *** UA WAS MEASURED FIRST AT EXIT 1 WITH ZERO `^  FAIL` LINES, FOR THE SAME REASON AS SA ABOVE. *** The
// rows called Q.readSaved directly, so restoring the bare JSON.parse killed the gate instead of failing it.
// ELEVENTH crash-instead-of-a-finding this session and the THIRD ROUND RUNNING that I have made it inside a
// gate -- after `lines()` in section 8 and `run()` in cliArgs-selfcheck. Writing the rule down twice did not
// stop me writing the third one; every call to a never-throws function goes through a wrapper here now.
//
// *** AND UF DID REAL DAMAGE WHILE PROVING ITS ROW. *** With --no-write disarmed the run wrote
// `budgetMs: 1` into tools/ship/sweep-timings.json -- the tree's membership list, set to a budget that
// selects nothing. Restored from HEAD. That is exactly the harm --no-write exists to prevent, demonstrated
// by removing it, which is what a sabotage is for.
//
// ---- v4647f SABOTAGES, RESULTS BY NAME ------------------------------------------------------------------
//
//   SA. the two bare identifiers put back (`${capMs}`, `${workers}`)     -> 6 RED
//   SB. the FALSE RED line emitted unconditionally                       -> 1 RED  (the control)
//   SC. `--read` drops the saved false-red list                          -> 2 RED
//   SD. `--json` routes the report back to stdout, into the redirect     -> 1 RED
//   SE. the report printed only on the non-json branch, as before        -> 1 RED
//   SF. the foreign-timings NOTE printed unconditionally                 -> 1 RED  (the control)
//   SG. the per-gate rows lose the gate name                             -> 3 RED
//
// *** SA WAS MEASURED FIRST AT EXIT 1 WITH ZERO `^  FAIL` LINES. *** The gate DIED on the ReferenceError
// instead of reporting it -- the exact species section 8 is about, reproduced one level up, in the gate
// written to catch it. The rows now call reportLines through a `lines()` wrapper that turns a throw into a
// FAIL line, and SA lands on six named rows.
//
// *** AND THE HARNESS ATE THE ROUND'S OWN WORK ONCE. *** The first sabotage script restored with
// `git checkout -- <file>`, which reverts to HEAD -- so the first sabotage silently deleted the UNCOMMITTED
// repair it was testing, and SB then ran against the original file and reported 0 red as though the control
// were dead. Sabotage restores from a copy now. A harness that cannot tell "the fix is absent" from "the fix
// does not work" is the same defect as a sweep that cannot tell a crash from a green.
"use strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "./quickSweep.mjs";
import { VERDICT, SWEEP_V4297, REGRESSIONS_REPAIRED } from "./gateSweep.mjs";
import { RED_AT_V4279, RED_AT_V4408, RED_AT_V4424, RED_AT_V4476, UNCONFIRMED_SLOW, RED_AT_V4484, RED_AT_V4531,
         RED_AT_V4535, RED_AT_V4557, RED_AT_V4562, RED_AT_V4568 } from "./redCensus.mjs";

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
sec("1b. EVICTION TAKES TWO CROSSINGS, BECAUSE ONE IS A READING FROM ONE HOUR");
// ---------------------------------------------------------------------------------------------------------
// v4536. Driven on FIXTURES, not on the live timings file: the property is about the rule, and a rule tested
// against whatever the tree happens to hold today is tested against one sample of it.
{
    const all = ["over.mjs", "again.mjs", "under.mjs"];
    const timings = { "over.mjs": 4000, "again.mjs": 4000, "under.mjs": 100 };
    const first = Q.selectGates(all, timings, 3000, { crossings: { "over.mjs": 1, "again.mjs": 2 } });
    ok(first.run.includes("over.mjs") && first.skipped.includes("again.mjs") &&
       first.onProbation.join() === "over.mjs",
       "*** a gate over budget on its FIRST crossing still runs; on its SECOND it is evicted ***",
       `run ${first.run.join(",")}; skipped ${first.skipped.join(",")}; on probation ${first.onProbation.join(",")}`);
    // *** AND A GATE ALREADY OUT OF THE SWEEP STAYS OUT: PROBATION IS FOR A GATE THAT CROSSED. ***
    // The first draft ran anything over budget with no crossing count -- which is the whole over-budget pool,
    // about three hundred of the most expensive gates, twice over before the counts settled. That is the cost
    // sweepRotation exists to spread across rounds, and it would have been paid at ship time instead. A
    // MISSING count means "evicted before this rule existed", not "never crossed", and those stay out.
    // budgetExile-selfcheck found it inside the round by seeding a lie and watching the sweep go and run it.
    const exiled = Q.selectGates(["old.mjs"], { "old.mjs": 999999 }, 3000, { crossings: { other: 1 } });
    ok(exiled.skipped.join() === "old.mjs" && exiled.onProbation.length === 0,
       "!! a gate with a big recorded time and NO crossing count stays skipped -- the pool is not re-run",
       `skipped ${exiled.skipped.join(",")}, on probation ${exiled.onProbation.join(",") || "none"}. ` +
       "The rotation re-times that pool on its own schedule; this rule only holds open a door for a gate " +
       "that crossed under it");
    // the old behaviour is still available and is what every other caller gets: no crossings, no probation
    const old = Q.selectGates(all, timings, 3000);
    ok(old.skipped.length === 2 && old.onProbation.length === 0,
       "  without a crossings map the rule is exactly what it was, so no other caller changed",
       `${old.skipped.length} skipped, ${old.onProbation.length} on probation`);
    // *** AND THE COUNT MUST RESET, OR IT IS A LIFETIME TALLY AND EVERY STRADDLER EVICTS ITSELF EVENTUALLY. ***
    // This is the difference between "crossed twice in a row" and "crossed twice since the beginning of time",
    // and a straddler crosses about half the time, so the second rule evicts every one of them within a few
    // sweeps while claiming to be corroboration.
    //
    // *** THIS PARAGRAPH SAT HERE WITH NOTHING UNDER IT CHECKING IT, AND THE SABOTAGE THAT DELETED THE RESET
    // WENT 0 RED. *** The reset lived inside the writer where no fixture could reach it, and the row beside
    // this comment asserted the THRESHOLD instead -- prose promising a check the assertion did not have,
    // which is the defect v4536's own author found in RETURNED_AT_V4529 two rounds earlier. countCrossings is
    // pure and exported now, and the straddler is walked through four sweeps here rather than described.
    {
        const over = [{ gate: "s.mjs", serialMs: 4000 }], under = [{ gate: "s.mjs", serialMs: 2000 }];
        let c = {};
        c = Q.countCrossings(c, over, 3000);     const afterOver1 = c["s.mjs"];
        c = Q.countCrossings(c, under, 3000);    const afterUnder = c["s.mjs"];
        c = Q.countCrossings(c, over, 3000);     const afterOver2 = c["s.mjs"];
        c = Q.countCrossings(c, over, 3000);     const afterOver3 = c["s.mjs"];
        ok(afterOver1 === 1 && afterUnder === undefined && afterOver2 === 1 && afterOver3 === 2,
           "!! *** FIXTURE: a straddler that alternates over and under NEVER reaches two, and two in a row does ***",
           `over -> ${afterOver1}, under -> ${afterUnder === undefined ? "cleared" : afterUnder}, over -> ` +
           `${afterOver2}, over -> ${afterOver3}. A count that survived the under would read 3 by now and the ` +
           "gate would be evicted for having straddled, which is precisely what it must not mean");
        ok(Q.countCrossings({ "s.mjs": 5 }, under, 3000)["s.mjs"] === undefined,
           "  ...and coming back under clears the count outright rather than decrementing it",
           "a decrement would take five sweeps under budget to undo five crossings; the reading that matters " +
           "is the most recent run of them");
    }
    ok(Q.MIN_CROSSINGS_TO_EVICT === 2,
       "  the threshold is a named constant rather than a literal in the selection", `${Q.MIN_CROSSINGS_TO_EVICT}`);
    ok(Q.selectGates(all, timings, 3000, { crossings: { "over.mjs": 1 }, minCrossings: 1 }).skipped.includes("over.mjs"),
       "  ...and it is a PARAMETER, so the rule can be driven to its boundary here rather than argued about",
       "at minCrossings 1 the first crossing evicts, which is the pre-v4536 behaviour exactly");
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
    // v4531 -- AND IT HAPPENED AGAIN, ON SCHEDULE. RED_AT_V4531 joined for tslSource and this row went red
    // within the minute, before any sweep ran. Adding the list here is the deliberate act the row exists to
    // demand: the register is 91 gates where it held 90 an hour earlier, and the diff is where that is said.
    // v4562 -- AND AGAIN, WHICH IS THE ROW WORKING AND NOT THE ROW BREAKING. RED_AT_V4562 joined for
    // sweepCoverage-selfcheck, whose returnee roll cannot be made honest by bookkeeping -- both of its
    // branches are unreachable, one because RETURNED_AT_V4476.returnable is empty and the other because
    // meshLine measures 3049 / 3030 / 3080 serially and is genuinely over budget. I first read this row's
    // hand-spelled union as the maintained-in-step defect this tree keeps convicting and went to derive it
    // from REGISTER_LISTS; the comments above say plainly that the spelling is DELIBERATE and that adding a
    // list here is the act the row exists to demand. Deriving it would have removed the only place the
    // register's growth has to be admitted out loud.
    // AND AGAIN: RED_AT_V4557 and RED_AT_V4568 both joined REGISTER_LISTS in redCensus.mjs (the second is
    // empty today, and an empty list is still a list this row must know about) and this row went red on
    // both, exactly as designed -- so both are added to the union rather than the count being widened.
    ok(reg.size === new Set([...RED_AT_V4279.map((e) => e.gate), ...RED_AT_V4408.map((e) => e.gate),
                             ...RED_AT_V4424.map((e) => e.gate), ...RED_AT_V4476.map((e) => e.gate),
                             ...RED_AT_V4484.map((e) => e.gate), ...RED_AT_V4531.map((e) => e.gate),
                             ...RED_AT_V4535.map((e) => e.gate), ...RED_AT_V4557.map((e) => e.gate),
                             ...RED_AT_V4562.map((e) => e.gate), ...RED_AT_V4568.map((e) => e.gate),
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
// =============================================================================================================
// *** ALL FOUR ROWS BELOW WERE WRITTEN NAME-FIRST AND THIS FILE'S ok() TAKES THE CONDITION FIRST, SO ALL
// FOUR PASSED UNCONDITIONALLY -- a non-empty string is truthy. Nothing in the section could fail. It was
// caught by tools/ship/assertionShape-selfcheck.mjs, which exists for exactly this and named all four in
// one line ("78 gates in this tree take the condition first; a line pasted from the other 1,403 always
// passes"). Written down here because the lesson is not "be careful": it is that the instrument works and
// should be run before a gate is believed.
console.log("\n6. *** THE FILED NUMBER IS A CONTENDED SAMPLE AND THE COST IS A DIFFERENT NUMBER (v4562) ***");
{
    // costOf: three sources, each named rather than blended into one figure
    const fake = { timings: { a: 900, b: 500 }, at: { a: "T1", b: "T1" }, serial: { a: 400 }, serialAt: { a: "T2" } };
    const A = Q.costOf(fake, "a"), B = Q.costOf(fake, "b"), C = Q.costOf(fake, "zzz");
    ok(A.ms === 400 && A.source === "serial" && B.ms === 500 && B.source === "parallel" &&
       C.ms === null && C.source === "none",
       "!! costOf prefers the SERIAL reading, falls back to the filed one, and SAYS WHICH",
       `a: ${A.ms} (${A.source}), b: ${B.ms} (${B.source}), unknown: ${C.ms} (${C.source}). A consumer that ` +
       "cannot tell a cost from a sample will quote whichever it was handed, which is what put " +
       "recordReach-selfcheck's margin row on scheduling luck.");

    ok(Q.serialSliceOrder(["x", "y", "z"], { y: "2026-01-02", z: "2026-01-01" }).join(",") === "x,z,y" &&
       Q.serialSliceOrder(["x", "y", "z"], { y: "2026-01-02", z: "2026-01-01" }).join(",") ===
       Q.serialSliceOrder(["x", "y", "z"], { y: "2026-01-02", z: "2026-01-01" }).join(","),
       "!! the slice order owes the never-measured first, then the oldest, and is deterministic",
       "an absent reading sorts before any present one, ties keep enumeration order, and the same input " +
       "gives the same slice -- a rotation that shuffles cannot say when the tree last turned over.");

    // The two rows that grade SWEEP_CONTENTION_V4562 itself live in tools/ship/sweepCoverage-selfcheck.mjs,
    // beside the record, and NOT here -- this gate is 9.1 s serially and stays outside the ship-time sweep,
    // so a record guarded only from here is a record nothing checks at ship time. That is the population
    // tools/ship/recordReach-selfcheck.mjs counts, and it went red the moment the record landed here.
}

// ---- v4574: THE SKIP IS OPT-IN, AND THIS ROW EXISTS BECAUSE ARMING IT THE OTHER WAY BROKE A FIXTURE --------
{
    // *** ARMING MEANT FLIPPING runQuickSweep'S DEFAULT TO TRUE, AND THAT ARMED EVERY CALLER AT ONCE. ***
    // There are nine besides the command line: fixtures in this file and in sweepCoverage-selfcheck that drive
    // the sweep to watch what it does, tools/ship/budgetExile.mjs re-timing one named gate, and verify.mjs.
    // sweepCoverage-selfcheck went red within the minute and was RIGHT -- its 1 ms-budget fixture reported
    // "0 gates run at a 1 ms budget, 0 confirmed alone", because the sweep it was testing had skipped
    // everything. A FIXTURE THAT SKIPS ITS OWN SUBJECT IS VACUOUS, and it would have passed silently if the
    // fixture had asserted a little less.
    //
    // So the default lives in the CLI block and not in the function: typing `node tools/ship/quickSweep.mjs`
    // skips, calling runQuickSweep() does not, and the caller nobody has written yet inherits the safe one.
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    const sig = /export async function runQuickSweep\([\s\S]{0,600}?\)\s*\{/.exec(src);
    ok(!!sig && /skipUnchanged = false/.test(sig[0]),
       "!! *** runQuickSweep does NOT skip unless its caller asks -- the dangerous default is never inherited ***",
       "a programmatic caller that says nothing gets a full sweep. Nine call sites in this tree say nothing");
    // v4647g: the flag is read off the PARSED command line now, not off raw argv -- an unknown option is
    // refused before this line runs. The property is unchanged: the command line skips, the function does not.
    ok(/opts\.skipUnchanged = !cli\.flags\.has\("--full"\)/.test(src),
       "!! ...and the command line skips by default, which is the whole point of arming it",
       "the saving is for a human sweeping while working: 1,258 gates and 409 s becomes 332 and 233 s");
    const vsrc = fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8");
    ok(/runQuickSweep\(\{ budgetMs, skipUnchanged: false/.test(vsrc),
       "!! *** and the SHIP-TIME sweep passes skipUnchanged: false explicitly, belt and braces ***",
       "the saving buys iteration speed and spends a small measured chance that a gate which should have run " +
       "did not. The one run this tree must not spend that on is the one whose output is ALL GREEN");
}

// ---------------------------------------------------------------------------------------------------------
sec("8. THE REPORT IS A VALUE, AND IT IS EXERCISED WITH SOMETHING TO REPORT");
// ---------------------------------------------------------------------------------------------------------
// *** v4647f -- THE BLOCK THAT NAMES THE FALSE REDS THREW EXACTLY WHEN THERE WERE FALSE REDS. ***
// v4647d fixed "the sweep counted 143 starved gates and named none" and v4647e wrote `${capMs} ms CAP` and
// `${workers} of these at once` into the new block. Neither identifier exists at module scope -- the command
// line holds them as `opts.capMs` and `opts.workers` -- so the block was a ReferenceError, and it is guarded
// by `if (r.falseRedList.length)`. A green sweep printed. A sweep with a finding died at the line that would
// have named it. MEASURED by running the CLI tail byte-identical with a synthetic result: the summary line
// printed, then `ReferenceError: capMs is not defined`, exit 1.
//
// Eighth crash-instead-of-a-finding this session and the purest: the error path WAS the finding path. So the
// rows below drive reportLines() WITH false reds in hand -- the state that used to be fatal -- and the
// control beside them is a result with none, because a row that only ever passes an empty list is the same
// blindness in a gate instead of in a sweep.
//
// *** AND THEY CALL IT THROUGH `lines()`, WHICH TURNS A THROW INTO A FAIL LINE. *** Restoring the defect as
// a sabotage was measured FIRST at exit 1 with ZERO `^  FAIL` lines -- the gate died on the ReferenceError
// instead of reporting it, which is the very species the section is about, reproduced one level up. A row
// that can only be reached by code that does not throw cannot grade code that throws.
{
    const lines = (r) => { try { return Q.reportLines(r); } catch (e) { return ["THREW: " + (e && e.message)]; } };
    const threw = (ls) => ls.length === 1 && ls[0].startsWith("THREW: ");
    const capped = { gate: "a/b-selfcheck.mjs", parallelMs: 20000, serialMs: 900, capped: true, parallelCode: 124, ratio: null };
    const slowed = { gate: "c/d-selfcheck.mjs", parallelMs: 4100, serialMs: 1200, capped: false, parallelCode: 1, ratio: 3.42 };
    const base = { ran: 3, enumerated: 3, budgetMs: 3000, capMs: 20000, workers: 8, ms: 1000, green: 2, knownRed: [],
                   knownRedSkipped: 0, newRed: [], unmeasured: [], skippedOverBudget: 0, newGates: [], dropped: [],
                   unchangedInputs: 0, skippedUnchanged: false };
    const withFalse = lines({ ...base, falseReds: 2, falseRedList: [capped, slowed] });
    const none = lines({ ...base, falseReds: 0, falseRedList: [] });

    ok(!threw(withFalse),
       "!! *** reporting a result that HAS false reds does not throw -- the state that used to be fatal ***",
       threw(withFalse) ? withFalse[0] : "reportLines takes every number from the result object, so there is " +
       "no enclosing scope for it to reach past and miss");
    ok(withFalse.some((l) => l.includes("a/b-selfcheck.mjs")) && withFalse.some((l) => l.includes("c/d-selfcheck.mjs")),
       "!! ...and both false reds are NAMED", "a box that reports 143 of these and can list none has measured nothing");
    const capLine = withFalse.find((l) => l.includes("FALSE RED"));
    ok(!!capLine && capLine.includes("20000 ms CAP") && capLine.includes("8 of these at once"),
       "!! ...and the cap and the worker count -- the two names that did not exist -- are in the line",
       "a gate killed at the cap is a box that cannot run that many at once; a gate merely slowed is CPU " +
       "contention. Two causes, and the numbers are what tell them apart");
    ok(withFalse.some((l) => l.includes("CAPPED") && l.includes("a/b-selfcheck.mjs")) &&
       withFalse.some((l) => l.includes("3.42x") && l.includes("c/d-selfcheck.mjs")),
       "!! ...and each row says WHICH of the two it was: CAPPED, or the ratio it was slowed by",
       "budgetIsOwn: a cap reading is the cap's clock and never a runtime, so it gets no ratio at all");
    ok(!threw(none) && !none.some((l) => l.includes("FALSE RED")) && none.length >= 1,
       "CONTROL: a result with no false reds prints no FALSE RED line, and still prints its summary",
       "without this the rows above would pass on a reportLines that emitted the cap sentence unconditionally");

    // A sweep whose membership came from another box's stopwatch says so. Reported, not corrected: a foreign
    // box has nowhere to put a corrected membership (v4647), and the point is that it is no longer silent.
    const foreign = lines({ ...base, falseReds: 0, falseRedList: [], foreignTimings: true,
                            timingsHost: "linux-x64-4c-16096mb-142c0d", box: "win32-x64-8c-7908mb-fe8d9a", skippedOverBudget: 219 });
    ok(foreign.some((l) => l.includes("NOTE:") && l.includes("linux-x64-4c-16096mb-142c0d") && l.includes("win32-x64-8c-7908mb-fe8d9a")),
       "a foreign-timings run names BOTH boxes in the report", "219 gates skipped by a stopwatch that is not this box's");
    ok(!none.some((l) => l.includes("NOTE:")),
       "CONTROL: and the owning box gets no such note", "the note means something only where it is not always printed");
}

// ---------------------------------------------------------------------------------------------------------
sec("8b. --json NO LONGER SWALLOWS THE READING, AND A SAVED RUN CAN BE RE-READ");
// ---------------------------------------------------------------------------------------------------------
// *** THE SECOND WAY THE SAME BLOCK WAS UNREACHABLE. *** `--json` printed the JSON INSTEAD of the report, so
// the run that SAVES the data is the run that DISCARDS the reading. Keith ran `--workers 4 --json > w4.json`
// -- my instruction -- and was left with a pretty-printed file and a `findstr` that matched the key and none
// of the values. The measurement that decides #53 existed and could not be looked at.
//
// Driven through the REAL command line, because the defect was in the command line and a row that calls
// reportLines() directly would have passed on the broken build.
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qs-read-"));
    const saved = path.join(tmp, "saved.json");
    fs.writeFileSync(saved, JSON.stringify({
        ran: 1306, enumerated: 1757, budgetMs: 3000, capMs: 20000, workers: 4, ms: 412000, green: 1150,
        knownRed: [], knownRedSkipped: 0, newRed: [], unmeasured: [], skippedOverBudget: 219, newGates: [],
        dropped: [], unchangedInputs: 0, skippedUnchanged: false, falseReds: 1,
        falseRedList: [{ gate: "a/b-selfcheck.mjs", parallelMs: 20000, serialMs: 900, capped: true, parallelCode: 124, ratio: null }],
    }, null, 1));
    const r = spawnSync(process.execPath, [path.join(ENG, "tools", "ship", "quickSweep.mjs"), "--read", saved],
                        { cwd: ENG, encoding: "utf8", timeout: 60000 });
    ok(r.status === 0 && /FALSE RED/.test(r.stdout || "") && /a\/b-selfcheck\.mjs/.test(r.stdout || ""),
       "!! *** `--read <file>` prints the report from a run saved on another box, and exits 0 ***",
       `exit ${r.status}; ${String(r.stdout || "").split("\n").length} lines. A JSON file needs a JSON reader ` +
       "and the tool that wrote it is the one that has one");
    ok(/1306 of 1757/.test(r.stdout || "") && /20000 ms CAP/.test(r.stdout || ""),
       "...and the numbers are the SAVED run's, not this box's defaults",
       "capMs, workers and the budget all come out of the file -- reading a saved run must not silently " +
       "re-label it with the reader's own settings");
    fs.rmSync(tmp, { recursive: true, force: true });

    // Source-level, because the routing is what the redirect sees and no in-process row can observe it.
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    const cli = src.slice(src.indexOf("// ---- CLI ---"));
    // v4647h -- the same sink, widened: `quiet` is --json OR --out, and it now carries the SWEEP'S OWN
    // chatter as well as the report. Keeping stdout clean under --json was necessary and NOT sufficient;
    // `[sweep] NOT writing ...` still landed in the capture, which is what made w4.json unparseable.
    ok(/const quiet = cli\.flags\.has\("--json"\) \|\| !!outFile;/.test(cli) &&
       /const sink = quiet \? \(\(s\) => process\.stderr\.write/.test(cli) &&
       /opts\.log = quiet \?/.test(cli),
       "!! under --json or --out, the report AND the sweep's own lines go to STDERR",
       "a redirect that swallows the reading is how w4.json came to be unreadable -- and the line that " +
       "actually contaminated it was the sweep's, not the report's");
    ok(/for \(const line of reportLines\(r\)\) sink\(line\);/.test(cli) && !/\belse \{/.test(cli),
       "!! ...and there is ONE report path, not a json branch and a human branch",
       "the human branch was the only one exercised, so the json branch was free to rot -- and did");
}

// ---------------------------------------------------------------------------------------------------------
sec("8c. A FILE SOMETHING ELSE WROTE IS READ, OR REFUSED -- NEVER THROWN ON");
// ---------------------------------------------------------------------------------------------------------
// *** v4647h -- `--read` CRASHED ON THE FIRST REAL FILE IT WAS EVER POINTED AT. *** Keith pulled v4647g,
// ran `--read w4.json`, and got a bare `SyntaxError: Unexpected token 'q'` with a stack trace. TENTH
// crash-instead-of-a-finding this session, in the function written TWO ROUNDS AGO whose whole job is to
// make a saved run readable: a JSON.parse of a file produced by a shell redirect, with no guard at all.
//
// *** AND THE CONTAMINATION WAS THE TOOL'S OWN. *** `--json > file` was my instruction. A redirect captures
// whatever lands on stdout, and runQuickSweep had a console.log of its own -- `[sweep] NOT writing ...` --
// which fires on a FOREIGN box, the only kind whose result gets carried to another machine to be read. The
// line most likely to be in the capture was the one only the capturing box prints.
{
    // *** THROUGH A WRAPPER, BECAUSE THE CONTRACT UNDER TEST IS "NEVER THROWS". ***
    // The first draft of this section called Q.readSaved directly, and sabotage UA -- restoring the bare
    // JSON.parse -- produced exit 1 with ZERO `^  FAIL` lines: the gate DIED instead of reporting. ELEVENTH
    // crash-instead-of-a-finding this session and the third round running that I have made it in a gate,
    // after `lines()` in section 8 and `run()` in cliArgs-selfcheck. A row that can only be reached by code
    // that does not throw cannot grade code that throws, and writing that sentence twice did not stop me
    // writing the third one.
    const saved = (text) => { try { return Q.readSaved(text); } catch (e) { return { result: null, skipped: [], error: "THREW: " + (e && e.message), threw: true }; } };
    const capped = { gate: "a/b-selfcheck.mjs", parallelMs: 20000, serialMs: 900, capped: true, parallelCode: 124, ratio: null };
    const good = { ran: 3, enumerated: 3, budgetMs: 3000, capMs: 20000, workers: 8, ms: 1000, green: 2,
                   knownRed: [], knownRedSkipped: 0, newRed: [], unmeasured: [], skippedOverBudget: 0,
                   newGates: [], dropped: [], unchangedInputs: 0, skippedUnchanged: false, falseReds: 1,
                   falseRedList: [capped] };
    const json = JSON.stringify(good, null, 1);

    const clean = saved(json);
    ok(!clean.threw && clean.result && clean.result.ran === 3 && clean.skipped.length === 0 && !clean.error,
       "!! CONTROL: a clean result reads with nothing skipped, and readSaved does not throw on it either",
       "without this the recovery rows below would pass on a reader that always claims to have repaired something");

    // Keith's file, exactly: the progress writer's lines ahead of the JSON.
    const dirty = saved("[quickSweep] 1/427\n[quickSweep] 43/427\n" + json);
    ok(!dirty.threw && dirty.result && dirty.result.ran === 3,
       "!! *** a capture with the tool's own lines in it is RECOVERED, not thrown on ***",
       dirty.error || "32 minutes of somebody else's box is in that file, and a stack trace threw it away");
    ok(dirty.skipped.length === 2 && /1\/427/.test(dirty.skipped[0]),
       "!! ...and the lines it skipped are NAMED, so the recovery is evidence and not a silence",
       `${dirty.skipped.length} skipped. A recovery nobody is told about is how a contaminated file becomes ` +
       `a confident wrong answer`);

    // The line that actually did it, in the position it actually appears -- after the JSON has begun.
    const mid = saved(json.replace('\n "ran"', '\n[sweep] NOT writing tools/ship/sweep-timings.json: foreign\n "ran"'));
    ok(mid.result && mid.result.ran === 3 && mid.skipped.length === 1,
       "!! ...including a tool line INSIDE the JSON, which is where this one lands",
       "`[sweep] NOT writing ...` is printed part-way through the run, so it interleaves rather than leading");

    ok(!saved('{"name":"x","version":"1"}').result &&
       /not a quickSweep --json result/.test(saved('{"name":"x"}').error || ""),
       "!! *** a file that PARSES but is not one of ours is refused, and says what it is ***",
       "package.json parses. So does a half-written result from a killed run, and reportLines would then " +
       "read undefined.length -- the same crash one layer further in");
    ok(!saved("").result && /empty/.test(saved("").error || ""),
       "...and an empty file says it is empty", "a zero-byte capture is what a redirect leaves when the run died early");
    ok(!saved("[quickSweep] 1/427\n[quickSweep] 43/427\n").result,
       "...and a capture that is ONLY tool lines is a refusal, not an empty success",
       "stripping every line and finding nothing left must not read as a clean parse of nothing");
}

// ---------------------------------------------------------------------------------------------------------
sec("8d. --out: THE TOOL WRITES ITS OWN FILE, SO THERE IS NOTHING FOR A REDIRECT TO GET WRONG");
// ---------------------------------------------------------------------------------------------------------
// Driven through the REAL command line at a 1 ms budget -- 0 gates run, 0.7 s -- with --no-write, so the
// tree's timings file is not touched. A source row would pass on a build whose CLI never calls it, which is
// exactly how the --json branch came to rot two rounds ago in this same tool.
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qs-out-"));
    const out = path.join(tmp, "r.json");
    const timings = path.join(ENG, "tools", "ship", "sweep-timings.json");
    const before = fs.existsSync(timings) ? fs.statSync(timings).mtimeMs : null;
    const r = spawnSync(process.execPath,
        [path.join(ENG, "tools", "ship", "quickSweep.mjs"), "--budget", "1", "--no-write", "--out", out],
        { cwd: ENG, encoding: "utf8", timeout: 120000 });
    ok(r.status === 0 && fs.existsSync(out),
       "!! *** --out writes the result itself, with no shell redirect anywhere ***",
       `exit ${r.status}. cmd, PowerShell and bash do not agree about redirects; a tool that needs one to ` +
       `produce its output owns the bug when the shell does something else`);
    ok((r.stdout || "") === "",
       "!! ...and stdout is EMPTY, so there is nothing a capture could pick up",
       `${(r.stdout || "").length} byte(s) on stdout. The report and the sweep's own chatter both went to stderr`);
    const rd = (t) => { try { return Q.readSaved(t); } catch (e) { return { result: null, skipped: [], threw: true }; } };
    const parsed = fs.existsSync(out) ? rd(fs.readFileSync(out, "utf8")) : { result: null, skipped: [] };
    ok(!!parsed.result && parsed.skipped.length === 0,
       "!! ...and what it wrote reads back with NOTHING to skip",
       "the round trip is the claim: this tool's own writer against this tool's own reader");
    ok(before === null || fs.statSync(timings).mtimeMs === before,
       "!! --no-write leaves sweep-timings.json untouched",
       "a gate that rewrites the tree's timings file every run is worse than the row it buys");
    fs.rmSync(tmp, { recursive: true, force: true });

    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    ok(/if \(target\.foreign\) log\(/.test(src) && !/if \(target\.foreign\) console\.log\(/.test(src),
       "!! *** the sweep's own console.log is a caller-supplied sink now ***",
       "it fires on a FOREIGN box -- the only kind whose result is carried elsewhere to be read -- so under " +
       "--json it was the line most likely to land inside the capture and least likely to be noticed");
}

// ---------------------------------------------------------------------------------------------------------
sec("8e. A CRASH IN THE NEW-RED LIST, SPELLED AS A CRASH");
// ---------------------------------------------------------------------------------------------------------
// *** v4647i -- THREE GATES ON GEN-9 CAME BACK `exit 3221226505` AND WERE FILED AS NEW RED. *** 0xC0000409
// is Windows fail-fast: the process was killed before it printed anything. All three pass on this box in
// under 350 ms, so `grep -c '^  FAIL'` over their output returns ZERO -- the sweep sent a reader hunting
// for a line that was never written. Twelfth crash-instead-of-a-finding this session and the first that is
// NOT mine: it is in the gates, reported by a sweep that could not tell a kill from a verdict.
//
// tools/ship/failLines.mjs, in this same directory, has told RED from CRASHED since v4647d. Two instruments,
// one convention, opposite senses -- the species this session met in posixAssumption's separators, the two
// ground-limit contracts, and --gate against --gates.
{
    const base = { ran: 431, enumerated: 1758, budgetMs: 3000, capMs: 20000, workers: 4, ms: 2125000, green: 390,
                   knownRed: [], knownRedSkipped: 0, unmeasured: [], skippedOverBudget: 451, newGates: [],
                   dropped: [], unchangedInputs: 0, skippedUnchanged: false, falseReds: 0, falseRedList: [] };
    const killedRow = { gate: "ai-bridge/tools/range-selfcheck.mjs", code: 3221226505, ms: 724 };
    const findingRow = { gate: "tools/ship/capReading-selfcheck.mjs", code: 1, ms: 474 };
    const ls = (r) => { try { return Q.reportLines(r); } catch (e) { return ["THREW: " + (e && e.message)]; } };

    const mixed = ls({ ...base, newRed: [killedRow, findingRow] });
    ok(mixed.some((l) => /^  CRASH  ai-bridge\/tools\/range-selfcheck\.mjs/.test(l)),
       "!! *** the OS kill is spelled CRASH, not NEW ***",
       mixed.find((l) => /range-selfcheck/.test(l)) || "(absent)");
    ok(mixed.some((l) => /STATUS_STACK_BUFFER_OVERRUN/.test(l) && /no FAIL line was printed/.test(l)),
       "!! ...and the row names the kill and says why there is nothing to read",
       "`exit 3221226505` is a number nobody can act on; the name says where to look instead");
    ok(mixed.some((l) => /^  NEW    tools\/ship\/capReading-selfcheck\.mjs  exit 1 in 474 ms$/.test(l)),
       "CONTROL: an ordinary red is unchanged, byte for byte",
       "without this the rows above pass on a report that calls every red a crash");
    ok(/2 NEW red \(1 KILLED BY THE OS, not findings\)/.test(mixed[0] || ""),
       "!! and the summary counts them apart, where it used to count them together",
       mixed[0] || "(no summary)");
    ok(!/KILLED BY THE OS/.test(ls({ ...base, newRed: [findingRow] })[0] || ""),
       "CONTROL: a run with no kills says nothing about kills",
       "a parenthesis printed every time is a parenthesis nobody reads");

    // *** READ OFF A RESULT SAVED BEFORE `kind` EXISTED, because that is the file this round is about. ***
    // Keith's w4b.json was written by v4647h. A classifier that only understood rows written after the fix
    // could say nothing about the run that produced the finding.
    ok(Q.crashCount({ newRed: [killedRow, findingRow] }) === 1 && Q.crashCount({ newRed: [findingRow] }) === 0,
       "!! *** a result saved BEFORE this change is classified from the code alone ***",
       "the exit code is in every result this tool has ever written, so every saved run can be re-read");
    ok(Q.crashCount({}) === 0 && Q.crashCount(null) === 0,
       "...and a result with no newRed at all is zero rather than a throw",
       "reportLines is called on files somebody else wrote; see section 8c");
    // *** THE CODE IS THE ONLY INPUT, AND SABOTAGE VG IS WHY. *** The first draft also stored `kind` and
    // `name` on each reconcile row; deleting both went ZERO RED in both gates, because nothing read them.
    // The field is gone, and this row is what keeps it gone: a row carrying a contradictory kind must be
    // classified by its code regardless, so a saved result from any version reads the same.
    ok(Q.crashCount({ newRed: [{ ...killedRow, kind: "finding", name: null }] }) === 1 &&
       Q.crashCount({ newRed: [{ ...findingRow, kind: "os-kill", name: "MADE UP" }] }) === 0,
       "!! *** the exit code decides, and a stored kind cannot override it ***",
       "one derivation, not two spellings of it -- reconcile stores no kind at all, and sabotage VG " +
       "(deleting the fields) is what showed the stored copy was never read");
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    // *** v4648 -- THIS ROW SAID "only gate, code and ms" AND reconcile NOW STORES A FOURTH. ***
    // The rule it was written for is not "three fields"; it is "no field that nothing reads", which is what
    // sabotage VG established by deleting `kind` and `name` and watching two gates stay green. `fail` is the
    // opposite case: it cannot be derived from anything -- it is the gate's own output, alive only for the
    // length of that process -- and section 8g drives reportLines and requires it to be PRINTED. So the row
    // moves with the claim instead of being deleted with it: the stored set is exactly these four, and the
    // new one is read.
    // *** v4649 -- DRIVEN, NOT MATCHED. *** This row was a regex over the exact text of one line in
    // quickSweep.mjs, so adding a fifth field broke it for the wrong reason: it went red because the source
    // changed, not because anything arrived unread. gateQuality counts that shape as debt. The claim is
    // about the OBJECT, so the object is what it reads now -- and the fifth field, `died`, is the one that
    // carries where a gate that printed no row got to before it died.
    const storeRows = [
        { gate: "withrows.mjs", verdict: VERDICT.RED, serialMs: 3, serialCode: 1,
          serialTail: "1. A SECTION\n  FAIL  the row that broke   detail\n" },
        { gate: "died.mjs", verdict: VERDICT.RED, serialMs: 4, serialCode: 3221226505,
          serialTail: "1. THE FIRST SECTION\n  PASS  fine\n2. THE SECTION IT DIES IN\n" },
    ];
    const stored = Q.reconcile(storeRows, new Map()).newRed;
    const keysOf = (o) => Object.keys(o).sort().join(",");
    ok(stored.length === 2 && keysOf(stored[0]) === "code,died,fail,gate,ms",
       "...and reconcile stores exactly gate, code, ms, fail and died -- no sixth field arriving unread",
       `stored ${keysOf(stored[0] || {})}. A field nothing reads is a field that will disagree with the ` +
       "thing that does; 8g is what makes these the other kind, by failing if the report stops printing them");
    // The `died &&` is not defensive noise: without it, a `died` that comes back null makes THIS ROW THROW
    // and the gate exits 1 having printed no failing row -- a crash instead of a finding, in the row whose
    // whole subject is telling those two apart. Measured by sabotaging `died` to null and getting exit 1
    // with zero FAIL lines.
    const lastDied = (x) => (x && x.died && x.died.length) ? x.died[x.died.length - 1] : null;
    ok(stored[0].fail.length === 1 && stored[0].died === null &&
       stored[1].fail.length === 0 && lastDied(stored[1]) === "2. THE SECTION IT DIES IN",
       "*** a red with rows carries its ROWS and no tail; a red with none carries WHERE IT GOT TO ***",
       `${JSON.stringify(stored[1] && stored[1].died)} -- five gates on the Windows rig die with a fail-fast that writes ` +
       "nothing to stderr at all, so the last line they printed is the only diagnosis that exists");
    ok(/no failing row -- the last thing it printed before it went/.test(Q.reportLines({
           ran: 2, enumerated: 2, budgetMs: 3000, ms: 1, green: 0, knownRed: [], newRed: stored,
           falseReds: 0, unmeasured: [], dropped: [], newGates: [], skippedOverBudget: 0 }).join("\n")),
       "  and the report PRINTS it -- carried and not shown is the same as not carried",
       "v4648 wired a red gate's FAIL lines into this record and verify never printed them for a round");
}

// ---------------------------------------------------------------------------------------------------------
sec("8f. THE FIVE EXPORTS NO GATE NAMED, CLOSED BY ASSERTION");
// ---------------------------------------------------------------------------------------------------------
// definitionGates counts an exported symbol that no gate mentions, and five of this module's were on that
// list: contentionPairs, timingsTarget, readTimings, falseRedsOf and falseRedSplit. Three arrived during
// this session -- falseRedsOf and falseRedSplit at v4647d, timingsTarget at v4647 -- which is to say I added
// them to a module whose gate I was editing in the same round and did not notice the gate never called them.
//
// Closed the way the physics baseline went from 81 to 0: BY ASSERTION, not by mention. Each row calls the
// function and grades the answer, so a broken one fails here instead of being listed.
{
    // costOf's own note: `timings` is a contended sample and `serial` an uncontended one. contentionPairs is
    // the population a ratio may be taken over -- the gates where the two are genuinely DIFFERENT readings.
    // My first draft of this row asserted an ARRAY OF ROWS and read `pairs[0].gate`, which threw. It returns
    // a REPORT -- { pairs, inferred, eligible, excluded, ratios } -- and pairs holds gate NAMES. Same mistake
    // as section 2's first draft against classifyRows: I asserted a shape I had guessed at instead of reading
    // the one the function returns. The fixture below exercises every branch rather than the one I assumed.
    const file = { timings: { par: 2000, both: 1000, noprov: 3000, same: 1000, tiny: 40 },
                   serial:  { par:  800, both: 1000, noprov: 1000, same: 1000, tiny: 20 },
                   contended: { par: true, both: false } };
    const cp = Q.contentionPairs(file);
    ok(Array.isArray(cp.pairs) && cp.pairs.join(",") === "par,noprov",
       "!! *** contentionPairs takes only the gates whose two readings are DIFFERENT quantities ***",
       `pairs: [${cp.pairs.join(", ")}]. "both" has the SAME number filed in each field -- a serial reading ` +
       `copied into timings -- and dividing it by itself contributes exactly 1.00 and drags a median down, ` +
       `which is the defect v4556 measured across 164 entries`);
    ok(cp.inferred.join(",") === "noprov" && cp.eligible.length === 4 && cp.excluded === 2,
       "!! ...and it SAYS which of them had no provenance on file, and counts the exclusions over the same floor",
       `eligible ${cp.eligible.length}, pairs ${cp.pairs.length}, excluded ${cp.excluded}, inferred ` +
       `[${cp.inferred.join(", ")}]. "tiny" is under the 50 ms floor in both fields and is not eligible at ` +
       `all -- a ratio of two sub-50ms readings is process startup divided by process startup. The first ` +
       `draft of the repair took the two halves over DIFFERENT floors and reported 99 exclusions where the ` +
       `live record has 164, which is why the floor is a parameter and not a literal in each half`);
    ok(cp.ratios.length === 2 && cp.ratios[0] === 2.5 && cp.ratios[1] === 3,
       "...and the ratios come back sorted ASCENDING, one per pair, so a median may be taken over them",
       `[${cp.ratios.join(", ")}] -- par is 2000/800 and noprov is 3000/1000. My first draft asserted 2.5 ` +
       `LAST, having not checked which way the sort runs; a median taken off the wrong end is the same ` +
       `class of error as the two-floors one above`);

    // timingsTarget: whose stopwatch may write this record. A foreign box writes its own file instead.
    const own = Q.timingsTarget({ host: "boxA" }, { file: "t.json", id: "boxA" });
    const foreign = Q.timingsTarget({ host: "boxA" }, { file: "t.json", id: "boxB" });
    ok(own.foreign === false && own.file === "t.json" &&
       foreign.foreign === true && foreign.file === Q.LOCAL_TIMINGS && /boxA/.test(foreign.why),
       "!! *** timingsTarget sends a FOREIGN box's readings to its own file, and says whose record it is ***",
       `own -> ${own.file}; foreign -> ${foreign.file}. Two machines' runtimes in one set of fields is not a ` +
       `record, it is whichever ran last`);
    ok(Q.timingsTarget({}, { file: "t.json", id: "boxB" }).foreign === false,
       "...and a record with NO host is not foreign to anybody, so a first write is not refused",
       "an unstamped file is the state before any box has claimed it");

    // readTimings: the reader every consumer goes through, including on a file that is not there.
    const missing = Q.readTimings("tools/ship/__no_such_timings__.json", ENG);
    ok(missing && typeof missing === "object" && Object.keys(missing.timings || {}).length === 0,
       "!! readTimings answers with an EMPTY record rather than throwing when the file is absent",
       "a missing record makes selectGates run everything once, which is the first-run behaviour; a throw " +
       "would make the sweep unrunnable on a fresh checkout");
    const real = Q.readTimings(Q.DEFAULTS.timingsFile, ENG);
    ok(real && Object.keys(real.timings || {}).length > 100,
       "...and it reads the live record, so the row above is not passing on a reader that always returns nothing",
       `${Object.keys((real || {}).timings || {}).length} entries`);

    // falseRedsOf / falseRedSplit are graded in full in section 6 above, through the report; these rows name
    // them and check the two agree about one row, which is what the report's two halves rest on.
    const rows = [{ gate: "g", verdict: VERDICT.GREEN, from: "serial", parallelMs: 20000, serialMs: 900, parallelTimedOut: true }];
    const list = Q.falseRedsOf(rows, new Map([["g", { code: 124 }]]));
    const split = Q.falseRedSplit(list);
    ok(list.length === 1 && list[0].capped === true && list[0].ratio === null && list[0].parallelCode === 124,
       "!! *** falseRedsOf marks a CAP KILL as capped and gives it NO ratio ***",
       "budgetIsOwn: a reading the cap produced is the killer's clock and is never compared against a measurement");
    ok(split.capped === 1 && split.slowed === 0 && split.of === 1,
       "!! ...and falseRedSplit counts the two causes apart, over the same list",
       `${split.capped} capped, ${split.slowed} slowed, of ${split.of} -- a gate killed at the cap is a box ` +
       `that cannot run that many at once, not one fighting for CPU`);
}

// ---------------------------------------------------------------------------------------------------------
sec("8g. WHAT THE RED GATE SAID, CARRIED INTO THE REPORT (v4648)");
// ---------------------------------------------------------------------------------------------------------
// The v4648 ship stopped on "NEW RED tools/ship/sweepCoverage-selfcheck.mjs exit 1" and nothing else. That
// gate is GREEN run alone, so the evidence existed for the length of one process and was thrown away --
// runOneAsync has captured a 4 KB tail since v4582 and used it only to test for a skip line. A whole round
// went into inferring the cause and got it wrong twice. failLines.mjs's own header is about this exact
// problem one layer out: "AN EXIT CODE IS NOT A FINDING".
{
    const tail = "  PASS  ok\n  FAIL  !! the row that broke   detail\n  FAIL  second row\nALL GREEN\n";
    ok(JSON.stringify(Q.failLinesOf(tail)) === JSON.stringify(["  FAIL  !! the row that broke   detail", "  FAIL  second row"]),
       "!! *** the FAIL lines are pulled out of the tail the run already captured ***",
       "a path and an exit code cannot be acted on, compared between boxes, or told apart from the same " +
       "gate failing for a different reason");
    ok(!Q.failLinesOf(tail).some((l) => /PASS/.test(l)) && Q.failLinesOf("  PASS  all fine\n").length === 0,
       "CONTROL: a PASS line is not a FAIL line, and a clean tail yields nothing",
       "without this the row above passes on a function that returns every line it is given");
    const many = Array.from({ length: 9 }, (_, i) => `  FAIL  row ${i}`).join("\n");
    const cut = Q.failLinesOf(many);
    ok(cut.length === 5 && /and 5 more FAIL line\(s\)/.test(cut[4]),
       "!! ...and it is BOUNDED, saying how many it did not print rather than pasting forty",
       `${cut.length} lines for 9 FAILs -- a silent truncation would read as "that was all of them", which ` +
       `is the shape this file spent the session removing`);
    const R = (newRed) => ({ ran: 1, enumerated: 1, budgetMs: 3000, green: 0, knownRed: [], unmeasured: [],
                             dropped: [], falseRedList: [], falseRedSplit: { capped: 0, slowed: 0, of: 0 },
                             elapsedS: 1, skippedOverBudget: 0, newGates: [], newRed });
    const said = Q.reportLines(R([{ gate: "g-selfcheck.mjs", code: 1, ms: 9, fail: Q.failLinesOf(tail) }]));
    ok(said.some((l) => /the row that broke/.test(l)),
       "!! *** and the report PRINTS them under the NEW row ***",
       "this is what makes the field different from the `kind` and `name` that sabotage VG deleted with " +
       "nothing going red: those were derived from `code` elsewhere, and these exist nowhere else");
    ok(Q.reportLines(R([{ gate: "g-selfcheck.mjs", code: 1, ms: 9 }])).some((l) => /NEW/.test(l)),
       "CONTROL: a result saved by an OLDER version, with no `fail` field, still reports rather than throwing",
       "--read is pointed at captures from other boxes and earlier builds; see section 8c");

    // *** END TO END, BECAUSE SABOTAGE SF-3 WENT ZERO RED ON THE ROWS ABOVE. *** Deleting `tail` from
    // runOneAsync's resolve -- putting the file back in the exact state that made the v4648 ship
    // undiagnosable -- changed nothing any row could see, because every row above hands reportLines a
    // SYNTHETIC tail. The component was tested and the CONNECTION was not, which is the species this tree
    // names most. This row runs a REAL gate through the REAL sweep and requires its words to come back.
    const FX = path.join(ENG, "tools", "ship", "__failline_fixture-selfcheck.mjs");
    let through = null;
    try {
        fs.writeFileSync(FX, 'console.log("  FAIL  a planted assertion line");\nprocess.exit(1);\n');
        through = await Q.runQuickSweep({ gates: ["tools/ship/__failline_fixture-selfcheck.mjs"],
                                          capMs: 8000, write: false, workers: 1, root: ENG });
    } finally { try { fs.unlinkSync(FX); } catch { /* the row below fails on a null result */ } }
    const row = ((through || {}).newRed || [])[0];
    ok(!!row && (row.fail || []).some((l) => /a planted assertion line/.test(l)),
       "!! *** a REAL gate's FAIL line survives the whole path: spawn -> tail -> reconcile -> report ***",
       row ? `fail: ${JSON.stringify(row.fail)}` : "no newRed row came back at all");
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the gates over the budget THE ROTATION HAS NOT REACHED YET. v4408 answered the older " +
    "version of this line -- that a regression in a 40-second gate is found by the full sweep and by nothing at " +
    "ship time -- by re-timing the population a slice at a time: 138 of the first 140 came back UNDER budget, " +
    "because the reading that evicted them was the STARVED PARALLEL one. The pool is 234 and shrinking. Until it " +
    "is empty this line stands for what is left, and a gate that is genuinely slow stays out on purpose. " +
    "See tools/ship/sweepCoverage-selfcheck.mjs.");
process.exit(fails ? 1 : 0);
