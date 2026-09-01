#!/usr/bin/env node
// WebGLEngine/tools/ship/gateSweep-selfcheck.mjs -- v4297
//
// *** THE TWO-PHASE METHOD WAS PROSE, AND PROSE CANNOT REFUSE. *** redCensus.METHOD writes the procedure down
// correctly -- sweep wide in parallel, then confirm every candidate serially, "phase 2 is what makes the
// number real" -- and nothing in the tree could tell a serially-confirmed number from a parallel one typed
// into a field named `confirmedSerially`. At v4279 the difference was SEVEN of forty-six.
//
// So the discipline moves into the data. `classify()` cannot return RED without a serial result -- checked
// EXHAUSTIVELY here rather than sampled -- and `finalize()` THROWS rather than warns, because the failure
// being prevented is a human reading a plausible number, and a warning still hands them one.
//
// *** AND SECTION 5 IS A FIELD THAT COULD NOT HAVE BEEN MEASURED. *** v4296's RECHECK reported `regressed: 0`
// beside `checked: 37`. All 37 were already red, so not one was eligible to regress; the zero covers the
// 1,329 gates the method never ran. The prose in the same commit admitted the question was UNKNOWN. The
// caveat and the field disagreed inside one round, and the field is the half a reader greps.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as GS from "./gateSweep.mjs";
import * as RC from "./redCensus.mjs";

let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const P = (code, ms, timedOut = false) => ({ code, ms, timedOut });

// ---------------------------------------------------------------------------------------------------------
sec("1. THE POPULATION IS ENUMERATED FROM THE TREE, NOT FROM A LIST SOMEBODY TYPED");
// ---------------------------------------------------------------------------------------------------------
{
    const g = GS.enumerateGates();
    ok(g.length > 1000, "every -selfcheck.mjs in the tree is found", `${g.length} gates`);
    ok(g.every((r) => fs.existsSync(path.join(GS.ENG, r))), "and every path it returns exists");
    ok(g.every((r) => r.endsWith("-selfcheck.mjs")), "and nothing else got swept in");
    const again = GS.enumerateGates();
    ok(g.join("|") === again.join("|"), "the order is stable across calls",
       "two boxes that sweep in different orders cannot have their timeout buckets compared");
    ok(g.join("|") === g.slice().sort().join("|"), "and it is sorted, which is what makes that stability free");
    // *** THE SKIP LIST NEEDED A SYNTHETIC TREE TO BE TESTABLE AT ALL. ***
    // The first version of this check filtered the real result for node_modules and /.claude/ paths and
    // asserted the count was zero. It passed with the skip list emptied to {".git"} -- because there is not
    // one -selfcheck.mjs anywhere under node_modules, .claude or vendor in this tree today. The assertion was
    // true of a walk that skipped nothing, so it was measuring the tree, not the walker. Same shape as
    // v4290's eps sabotage, where every ray started outside the scene: an input that never reaches the branch
    // under test makes the check unfalsifiable no matter how the branch is written.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gatesweep-"));
    try {
        for (const rel of ["real/z-selfcheck.mjs", "node_modules/pkg/a-selfcheck.mjs",
                           ".claude/wt/b-selfcheck.mjs", "vendor/lib/c-selfcheck.mjs",
                           "real/notes.mjs", "real/d-selfcheck.js"]) {
            fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
            fs.writeFileSync(path.join(tmp, rel), "");
        }
        const found = GS.enumerateGates(tmp);
        ok(found.length === 1 && found[0] === path.join("real", "z-selfcheck.mjs"),
           "*** planted under node_modules, .claude and vendor, and the walk descends into NONE of them ***",
           `found ${JSON.stringify(found)} out of six planted files`);
        ok(!found.some((r) => r.endsWith("notes.mjs") || r.endsWith("-selfcheck.js")),
           "and a near-miss name is not a gate either", "notes.mjs and d-selfcheck.js were both refused");
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    ok(g.filter((r) => r.includes("node_modules") || r.includes("/.claude/")).length === 0,
       "the real sweep carries none of them -- v4279's duplicateFiles was a FALSE ATTRIBUTION from .claude worktrees",
       "true today of any walk at all, since the tree plants none; the synthetic root above is what checks it");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. A PARALLEL RED IS A HYPOTHESIS -- EXHAUSTIVELY, OVER EVERY COMBINATION OF INPUTS");
// ---------------------------------------------------------------------------------------------------------
{
    ok(GS.classify(P(0, 40)).verdict === GS.VERDICT.GREEN,
       "a gate that passes under contention needs no second run", "passing while starved passes idle too");
    ok(GS.classify(P(0, 40)).from === "parallel", "and phase 2 never sees it, which is what keeps phase 2 affordable");
    ok(GS.classify(P(1, 90)).verdict === GS.VERDICT.UNCONFIRMED,
       "*** a parallel FAILURE on its own is `unconfirmed`, not `red` ***", GS.classify(P(1, 90)).note);
    ok(GS.classify(P(1, 90), P(1, 88)).verdict === GS.VERDICT.RED,
       "it becomes red only once a serial run agrees", "confirmed");
    const fr = GS.classify(P(1, 90), P(0, 88));
    ok(fr.verdict === GS.VERDICT.GREEN && fr.from === "serial",
       "*** and a serial PASS overturns it -- this is the branch that found v4279's seven ***", fr.note);
    ok(GS.classify(P(124, 180000, true)).verdict === GS.VERDICT.UNCONFIRMED,
       "a parallel timeout is not a verdict either", GS.TIMEOUT.why);
    ok(GS.classify(P(124, 180000, true), P(124, 180000, true)).verdict === GS.VERDICT.UNCONFIRMED,
       "and a gate that times out ALONE is still unmeasured rather than red",
       "the honest word for a gate nobody has ever seen finish is `unknown`");
    ok(GS.classify(P(124, 180000, true), P(1, 73700)).verdict === GS.VERDICT.RED &&
       GS.classify(P(124, 180000, true), P(0, 120500)).verdict === GS.VERDICT.GREEN,
       "*** the timeout bucket resolves in BOTH directions, as v4279 measured it doing ***",
       GS.TIMEOUT.evidence.slice(0, 96));

    // EXHAUSTIVE, not sampled: every parallel x serial pair the shape admits.
    const codes = [0, 1, 2, 124, null];
    const outs = [null, ...codes.flatMap((c) => [P(c, 100, false), P(c, 100, true)])];
    let cases = 0, redWithoutSerial = 0, greenNeverOverturned = 0;
    for (const c of codes) for (const t of [false, true]) {
        const par = P(c, 100, t);
        for (const s of outs) {
            let v;
            try { v = GS.classify(par, s); } catch { continue; }
            cases++;
            if (v.verdict === GS.VERDICT.RED && !s) redWithoutSerial++;
            if (par.code === 0 && !par.timedOut && v.verdict !== GS.VERDICT.GREEN) greenNeverOverturned++;
        }
    }
    ok(cases >= 100, "every combination of the two results is enumerated", `${cases} cases`);
    ok(redWithoutSerial === 0,
       "*** NOT ONE of them returns RED without a serial re-run ***",
       "this is the property the prose asserted and nothing checked");
    ok(greenNeverOverturned === 0, "and a parallel green is never dragged back to red by phase 2",
       "the asymmetry runs one way only: starvation manufactures failures, never passes");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. finalize() REFUSES -- AND THE CONTROL RUNS FIRST, SO `IT THREW` IS NOT ENOUGH TO PASS");
// ---------------------------------------------------------------------------------------------------------
{
    const complete = [
        { gate: "a-selfcheck.mjs", parallel: P(0, 10), serial: null },
        { gate: "b-selfcheck.mjs", parallel: P(1, 20), serial: P(1, 19) },
        { gate: "c-selfcheck.mjs", parallel: P(1, 30), serial: P(0, 28) },
    ];
    // CONTROL FIRST. A finalize() that threw unconditionally would sail through the refusal check below.
    let done = null, threw = null;
    try { done = GS.finalize(complete); } catch (e) { threw = e; }
    ok(threw === null, "*** CONTROL: a COMPLETE candidate set finalizes rather than throwing ***",
       threw ? threw.message : "no throw");
    ok(done && done.red.length === 1 && done.red[0].gate === "b-selfcheck.mjs",
       "and the confirmed red is the one whose serial run agreed", "b");
    ok(done && done.green.length === 2 && done.falseReds.length === 1 &&
       done.falseReds[0].gate === "c-selfcheck.mjs",
       "the overturned one is reported AS a false red, not quietly dropped into green",
       "a false red that vanishes silently is how a method stops learning it has them");

    const incomplete = complete.map((r) => (r.gate === "b-selfcheck.mjs" ? { ...r, serial: null } : r));
    let msg = "";
    try { GS.finalize(incomplete); } catch (e) { msg = e.message; }
    ok(msg.includes("never re-run serially"), "*** and ONE missing serial run refuses the whole result ***",
       "not a flag on the row -- the red set cannot be obtained at all");
    ok(msg.includes("b-selfcheck.mjs"), "the refusal names the gate, so the fix is one command away");
    ok(msg.includes("phase 2 is not optional"), "and says which rule was broken");

    // *** UNCONFIRMED IS TWO DIFFERENT THINGS, AND CONFLATING THEM MADE THE METHOD UNUSABLE ON THIS TREE. ***
    // The v4297 sweep produced two gates that were re-run ALONE on an idle box and still did not finish in
    // 300 s. They have been all the way through phase 2; their verdict is UNMEASURED, which is a fact about
    // the gate rather than a procedural failure. Refusing over them would have made the cheapest route to an
    // answer "delete the entry", which is the incentive this whole file exists to remove.
    const withSerialTimeout = [
        { gate: "b-selfcheck.mjs", parallel: P(1, 20), serial: P(1, 19) },
        { gate: "slow-selfcheck.mjs", parallel: P(124, 180000, true), serial: P(124, 300108, true) },
    ];
    let g2 = null, threw2 = null;
    try { g2 = GS.finalize(withSerialTimeout); } catch (e) { threw2 = e; }
    ok(threw2 === null,
       "*** a candidate that RAN serially and still did not finish does NOT refuse the result ***",
       threw2 ? threw2.message : "phase 2 was performed; the outcome is unmeasured, not skipped");
    ok(g2 && g2.unmeasured.length === 1 && g2.unmeasured[0].gate === "slow-selfcheck.mjs",
       "it is reported by name in its own bucket", "never folded into red, never folded into green");
    ok(g2 && g2.red.length === 1 && g2.green.length === 0,
       "and it is counted in neither", `${g2.red.length} red, ${g2.green.length} green`);
    ok(g2 && g2.notRun.length === 0,
       "CONTROL: and `notRun` stays empty, so the two buckets are not the same bucket renamed");
    // ...while the gate that phase 2 never touched still refuses, which is the half that must not soften.
    let msg2 = "";
    try { GS.finalize([{ gate: "skipped-selfcheck.mjs", parallel: P(1, 20), serial: null }]); }
    catch (e) { msg2 = e.message; }
    ok(msg2.includes("skipped-selfcheck.mjs"),
       "*** and a SKIPPED candidate still refuses, which is the distinction doing work in both directions ***");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE v4279 ARITHMETIC IS THE SAME ARITHMETIC, RUN THROUGH THIS CODE");
// ---------------------------------------------------------------------------------------------------------
{
    const M = RC.METHOD;
    ok(M.sweptInParallel - M.confirmedSerially === M.falseRedsFromParallelism,
       "46 candidates - 39 confirmed = 7 false reds", `${M.sweptInParallel} - ${M.confirmedSerially} = ${M.falseRedsFromParallelism}`);
    const rows = [
        ...Array.from({ length: M.confirmedSerially }, (_, i) => (
            { gate: `red${i}-selfcheck.mjs`, parallel: P(1, 100), serial: P(1, 100) })),
        ...Array.from({ length: M.falseRedsFromParallelism }, (_, i) => (
            { gate: `false${i}-selfcheck.mjs`, parallel: P(1, 100), serial: P(0, 100) })),
    ];
    const f = GS.finalize(rows);
    ok(f.red.length === M.confirmedSerially && f.falseReds.length === M.falseRedsFromParallelism,
       "and running that sweep back through finalize() reproduces both halves",
       `${f.red.length} red, ${f.falseReds.length} false`);
    ok(rows.length === M.sweptInParallel, "over exactly the 46 candidates phase 1 produced");
    ok(GS.PHASES.serial.optional === false,
       "*** phase 2 is recorded as NOT optional, in the object rather than in a sentence ***");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. *** THE RE-CHECK REPORTED A FIELD ITS OWN METHOD COULD NOT HAVE MEASURED ***");
// ---------------------------------------------------------------------------------------------------------
{
    const standing = RC.RED_AT_V4279.map((e) => e.gate);
    // What v4296 actually did: re-ran the 37 recorded reds and nothing else.
    const asDone = GS.coversRegressions(standing, standing);
    ok(asDone.covers === false,
       "*** re-running only the gates already known red CANNOT see a regression ***", asDone.reason);
    ok(asDone.eligible === 0, "the eligible population is empty", `${asDone.swept} swept, 0 eligible`);

    // CONTROL: the same function says yes when the sweep is wide enough to answer.
    const all = GS.enumerateGates();
    const wide = GS.coversRegressions(all, standing);
    ok(wide.covers === true, "CONTROL: a FULL sweep is entitled to the answer",
       `${wide.swept} swept, ${wide.eligible} eligible`);
    ok(wide.eligible === all.length - standing.filter((g) => all.includes(g)).length,
       "and 'eligible' is every gate that was not already red", `${all.length} - ${standing.length}`);

    const R = RC.RECHECK;
    ok(!Object.prototype.hasOwnProperty.call(R, "regressed"),
       "*** the bare `regressed` field is GONE from RECHECK ***",
       "a zero over 1,329 gates nobody ran is not a zero");
    ok(R.regressedAmongChecked === 0 && typeof R.regressedOverall === "string",
       "replaced by one figure that is measured and one that says it is not",
       `amongChecked ${R.regressedAmongChecked}; overall: ${R.regressedOverall}`);
    ok(/unmeasur|unknown/i.test(R.regressedOverall),
       "and the unmeasured one says so in the word a reader greps for");
    ok(R.checked === standing.length,
       "the checked count still matches the list it checked", `${R.checked}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("6. THE SWEEP LOG PARSES BACK, SO A RECORD CAN BE REBUILT FROM IT RATHER THAN RETYPED");
// ---------------------------------------------------------------------------------------------------------
{
    const rows = GS.parseSweepTsv("0\t41\ta-selfcheck.mjs\n1\t912\tb-selfcheck.mjs\n124\t180031\tc-selfcheck.mjs\n\n");
    ok(rows.length === 3, "three lines, three rows", "blank lines are dropped");
    ok(rows[0].code === 0 && rows[0].ms === 41 && rows[0].timedOut === false, "a pass round-trips");
    ok(rows[2].code === 124 && rows[2].timedOut === true,
       "and 124 is recognised as a timeout", "coreutils timeout(1) exits 124, not the gate's verdict");
    // *** AND THE ROW ABOVE DOES NOT ACTUALLY TEST THAT. *** Its 180031 ms already exceeds the 180000 ms the
    // parser assumes, so the `ms >= budget` clause covers it and the `code === 124` clause is dead weight. A
    // log written with a SHORTER budget than the reader assumes is the case that separates them -- and it is
    // the realistic one, because the log records no budget at all.
    const short = GS.parseSweepTsv("124\t60012\tx-selfcheck.mjs");
    ok(short[0].timedOut === true,
       "*** a 124 from a 60 s log still reads as a timeout when the parser assumes 180 s ***",
       "the log does not record its own budget, so the exit code is the only thing that carries it");
    ok(GS.parseSweepTsv("1\t60012\ty-selfcheck.mjs")[0].timedOut === false,
       "CONTROL: and an ordinary exit 1 at the same runtime is NOT called a timeout",
       "otherwise the clause above would just be marking everything slow as unmeasured");
    ok(GS.classify(rows[2]).verdict === GS.VERDICT.UNCONFIRMED,
       "so a parsed timeout classifies as unconfirmed, end to end");
    ok(rows[1].ms === 912, "and the wall time survives, which is what the cheap-subset selection runs on");
}

console.log(fails === 0 ? "\nALL GREEN" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
