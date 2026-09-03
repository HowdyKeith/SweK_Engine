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
//
// *** AND SECTION 7 IS THE RECORD ITSELF. *** SWEEP_V4297 answers the UNKNOWN: six gates green at v4279 are
// red at v4297, and 38 of 107 phase-1 reds were starvation. Sabotaged before it was trusted:
//   A  confirmedRed 48 -> 47, parts untouched      -> 3 reds: sum-to-swept, sum-to-candidates, and the split
//   B  a standing red (unattendedHold) listed as a regression -> "already red at v4279" and regressionsAgainst()
//   C  regressions emptied, stillRed bumped to 43 to keep the sum -> "register minus repaired" and NON-EMPTY
//   D  one named path renamed                      -> the existence check, naming it
//   E  cover.covers flipped to false                -> the cover line
//   F  a false red moved into unmeasuredCount, lists untouched -> sum-to-swept and counts-vs-lists
//   Baseline 0 red. Also caught while writing: UNCONFIRMED_SLOW is a list of paths and RED_AT_V4279 a list of
//   {gate} records, and `.map(e => e.gate)` over the wrong one produced a set of undefineds that matched
//   nothing -- which read as two reds, not as a vacuous pass, because both checks were written to expect hits.
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
    // *** THIS PINNED A v4296 COUNT AGAINST A LIVE LIST, AND WENT RED THE FIRST TIME THE LIST SHRANK FOR A
    // GOOD REASON. *** RECHECK.checked is 37 because 37 gates were red then. RED_AT_V4279 is 33 now because
    // four have since been FIXED and pruned by hand, each naming its cause in FIXED_SINCE_V4279 -- which is
    // the mechanism redCensus demands ("a gate turning green is GOOD NEWS that must be recorded by hand").
    // A check with no term for that punishes the repair, which is the shape v4155's Arriving cap had and
    // corroborateFully's "two rejections" had. The term, not a looser comparison.
    // v4318: the register has now moved in BOTH directions, so this reads the ONE derived size rather than
    // rebuilding it here. Five assertions across three files reconcile against it; five copies of a two-term
    // correction is five chances to update four of them.
    ok(R.checked === RC.registerAtSweep(),
       "the checked count still matches the register AS IT STOOD when the re-check ran",
       `${R.checked} checked = registerAtSweep() ${RC.registerAtSweep()} (${standing.length} standing + ` +
       `${RC.FIXED_SINCE_V4279.length} fixed since - ${RC.RECOVERED_SINCE_V4279.length} recovered since)`);

    // *** AND THE RULE IS APPLIED TO EVERY RECHECK RECORD, DERIVED RATHER THAN NAMED. *** v4297 checked
    // RECHECK because RECHECK was the record that had the defect. Two more re-check records were written on a
    // branch in the meantime -- RECHECK_V4313 and RECHECK_V4314 -- and BOTH SHIPPED THE BARE `regressed: 0`
    // THIS SECTION EXISTS TO REFUSE, because a check that names one record cannot see the second copy. Same
    // shape as MODES in nine files and the gate-file walk in three: THE SECOND COPY IS NEVER THE ONE THAT GETS
    // UPDATED, and here the second copy was of the defect rather than of the fix.
    const rechecks = Object.entries(RC).filter(([k, v]) =>
        /^RECHECK/.test(k) && v && typeof v === "object" && typeof v.checked === "number");
    ok(rechecks.length >= 1, "every re-check record is found by SHAPE, not by name",
       rechecks.map(([k]) => k).join(", ") + " -- adding a RECHECK_V4400 puts it under this rule automatically");
    const bare = rechecks.filter(([, v]) => Object.prototype.hasOwnProperty.call(v, "regressed"));
    ok(bare.length === 0, "*** NO re-check record carries a bare `regressed` field ***",
       bare.length ? "STILL BARE: " + bare.map(([k]) => k).join(", ") : rechecks.length + " records, none of them");
    const unsplit = rechecks.filter(([, v]) =>
        !(v.regressedAmongChecked === 0 || typeof v.regressedAmongChecked === "number") ||
        !/unmeasur|unknown/i.test(String(v.regressedOverall)));
    ok(unsplit.length === 0,
       "...and each splits the measured figure from the one it says it cannot measure",
       unsplit.length ? "NOT SPLIT: " + unsplit.map(([k]) => k).join(", ")
                      : rechecks.map(([k, v]) => k + " amongChecked=" + v.regressedAmongChecked).join("; "));

    // A record MAY still answer the regression question -- if it names a SECOND method with real coverage.
    // RECHECK_V4314 does: a sweep of every gate reading server.html, most of them not red, which found one.
    // That is what coversRegressions() is for, so the exemption is a measurement rather than a sentence.
    const withWide = rechecks.filter(([, v]) => v.sweptOutsideTheCensus);
    ok(withWide.every(([, v]) => typeof v.sweptOutsideTheCensus.regressedFound === "number" &&
                                 v.sweptOutsideTheCensus.population),
       "a record that DOES answer it names the wider method and its population",
       withWide.length ? withWide.map(([k, v]) => k + ": " + v.sweptOutsideTheCensus.population + " -> " +
            v.sweptOutsideTheCensus.regressedFound + " regression(s)").join("; ")
                       : "none claims to, which is also a legal state");
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


// ---------------------------------------------------------------------------------------------------------
sec("7. THE v4297 RECORD RECONCILES, NAMES ITS REGRESSIONS, AND EVERY NAME STILL POINTS AT A FILE");
// ---------------------------------------------------------------------------------------------------------
{
    // The record is the deliverable. Sections 1-6 prove the METHOD can refuse; this proves the RESULT is the
    // method's output and not a retyped summary of it. Every line below is arithmetic over the frozen record,
    // so a hand-edit that changes one figure and not its parts fails here by name.
    const S = GS.SWEEP_V4297;
    // *** AND THIS ONE PINNED THE SIZE OF THE TREE. *** It read `swept === enumerateGates().length - 1`, true
    // on the day v4297 ran and false the moment anybody adds a gate -- which is the ordinary way this project
    // moves. What the check is actually FOR is that the sweep covered the whole tree rather than a subset, and
    // that survives as: the tree today holds at least what was swept, and the surplus is NAMED so nobody has
    // to wonder whether the sweep is one gate stale or forty.
    const gatesNow = GS.enumerateGates().length, surplus = gatesNow - (S.swept + 1);
    ok(surplus >= 0,
       "the sweep's population is not larger than the tree it swept",
       `${S.swept} swept + this gate = ${S.swept + 1}; ${gatesNow} in the tree now`);

    // *** v4317 -- THE SURPLUS IS NOT MERELY COUNTED NOW, IT IS ACCOUNTED FOR. *** v4315 stopped pinning this
    // equality and started naming the gap, which was the right first move and left a to-do behind: fourteen
    // gates the sweep had never executed. SWEEP_SINCE_V4297 is that sweep. So the check is no longer "is the
    // surplus named" but "is EVERY gate in the tree covered by one measurement or the other", which is the
    // property the original equality was reaching for and could not survive a growing tree to state.
    const SS = GS.SWEEP_SINCE_V4297;
    // v4322 -- a SECOND closing (SS.since2): the gates added after v4317's sweep, swept and named the same way; a red among
    // them must be named in redOnArrival with why, and is not counted as a regression of this tree
    // v4329 -- SUMMED OVER EVERY CLOSING RATHER THAN OVER A NAMED PAIR. Each round that adds gates adds a
    // closing, and reading only since2 meant the next one had to edit this arithmetic as well as the record.
    const closings = [SS.since2, SS.since3, SS.since4, SS.since5, SS.since6, SS.since7, SS.since8, SS.since9, SS.since10, SS.since11].filter(Boolean);
    const S2 = SS.since2 || { swept: 0, green: 0, red: 0, added: [], redOnArrival: [] };
    const closed = closings.reduce((n, c) => n + (c.swept || 0), 0);
    const uncovered = surplus - SS.swept - closed;
    ok(uncovered <= 0,
       "!! *** every gate in the tree has been swept by v4297 or by the round that closed its surplus ***",
       `${gatesNow} in the tree = ${S.swept} swept at v4297 + this gate + ${SS.swept} swept since + ${closed} across ${closings.length} closing(s)` +
       (uncovered > 0 ? `. ${uncovered} STILL UNSWEPT -- name them and run them; a surplus that is only ` +
                        `counted goes stale the way the equality it replaced did`
                      : `. Nothing is unaccounted for, and the next gate added makes this red until it is run.`));
    ok(closings.every((c) => c.green + c.red === c.swept && c.red === c.redOnArrival.length && c.added.length === c.swept &&
                             c.redOnArrival.every((r) => c.added.includes(r.gate) && typeof r.why === "string" && r.why.length > 40)),
       "...the second closing's reds are named with why (red on arrival, red on origin/main too), and its count adds up",
       `${S2.green} green, ${S2.red} red of ${S2.swept}: ` + S2.redOnArrival.map((r) => r.gate.split("/").pop() + " -- " + r.why).join("; "));
    ok(SS.green === SS.swept && SS.red === 0 && SS.regressions === 0,
       "...and none of them is red, so nothing has regressed since v4297 either",
       `${SS.green} green of ${SS.swept}, ${SS.falseReds} false red and ${SS.unmeasuredAtCap} unmeasured at ` +
       `the phase-1 cap, both resolved GREEN by the serial pass. ` + SS.verdict);
    ok(SS.resolvedByPhase2.every((r) => r.phase1 !== r.phase2 && typeof r.why === "string" && r.why.length > 40),
       "...and every candidate phase 2 overturned says so, with the reason",
       SS.resolvedByPhase2.map((r) => r.gate.split("/").pop() + ": " + r.phase1 + " -> " + r.phase2).join("; ") +
       ". A SWEEP THAT NEVER OVERTURNS ITS OWN PHASE 1 IS A SWEEP WITH ONE PHASE, and this one overturned both " +
       "of its candidates in the same direction the method predicts -- starvation manufactures failures.");
    ok(S.green + S.confirmedRed + S.unmeasuredCount === S.swept,
       "*** green + red + unmeasured = swept, with NO fourth bucket ***",
       `${S.green} + ${S.confirmedRed} + ${S.unmeasuredCount} = ${S.swept}`);
    ok(S.confirmedRed + S.falseReds + S.unmeasuredCount === S.candidates,
       "and every phase-1 candidate landed in exactly one of red / false red / unmeasured",
       `${S.confirmedRed} + ${S.falseReds} + ${S.unmeasuredCount} = ${S.candidates}`);
    ok(S.stillRed + S.fromSlowBucket.length + S.regressions.length === S.confirmedRed,
       "*** the red count splits into still-red + slow-bucket + REGRESSIONS, and the split reconciles ***",
       `${S.stillRed} + ${S.fromSlowBucket.length} + ${S.regressions.length} = ${S.confirmedRed}`);
    // Same correction as section 6's: the register shrinks when somebody FIXES a gate and prunes the entry,
    // so the reconciliation needs that term or it fails on progress. `repaired` is what THIS sweep found
    // repaired; `FIXED_SINCE_V4279` is what rounds after it repaired and removed.
    ok(S.stillRed === RC.registerAtSweep() - S.repaired.length,
       "still-red is the register as it stood at the sweep, minus what this sweep repaired",
       `registerAtSweep() ${RC.registerAtSweep()} - ${S.repaired.length} repaired = ${S.stillRed}`);
    ok(S.falseRedList.length === S.falseReds && S.unmeasured.length === S.unmeasuredCount,
       "the counts equal the lists they summarise", "a count beside a list it does not match is the v4296 mistake again");

    // *** THE REGRESSIONS ARE THE ANSWER TO v4296's UNKNOWN, AND THEY MUST BE NEW. *** A gate that was in
    // RED_AT_V4279 is not a regression, it is a standing failure; one from UNCONFIRMED_SLOW was never green.
    const wasRed = new Set(RC.RED_AT_V4279.map((e) => e.gate));
    const wasSlow = new Set(RC.UNCONFIRMED_SLOW); // plain paths, unlike RED_AT_V4279
    ok(S.regressions.length > 0,
       "*** the regression list is NON-EMPTY: the question v4296 could not answer has an answer ***",
       `${S.regressions.length} gates green at v4279 are red at v4297`);
    ok(S.regressions.every((g) => !wasRed.has(g) && !wasSlow.has(g)),
       "and none of them was already red or already unmeasured at v4279, so each one is a real regression",
       "otherwise it belongs in stillRed or fromSlowBucket and the split above is lying");
    ok(S.fromSlowBucket.every((g) => wasSlow.has(g)),
       "every slow-bucket red WAS in UNCONFIRMED_SLOW", "that is the definition of the bucket");
    ok(GS.regressionsAgainst(RC.RED_AT_V4279.map((e) => e.gate),
                             [...RC.RED_AT_V4279.map((e) => e.gate), ...S.fromSlowBucket, ...S.regressions])
         .filter((g) => !wasSlow.has(g)).length === S.regressions.length,
       "and the module's own regressionsAgainst() recovers the same six from the same inputs",
       "the record was built by this code, not beside it");
    const unm = new Set(S.unmeasured);
    ok(S.regressions.every((g) => !unm.has(g)) && S.fromSlowBucket.every((g) => !unm.has(g)),
       "nothing red is also unmeasured", "a gate that did not finish has no verdict to be red with");

    // v4331 -- THE CLOSINGS' OWN NAMES WERE NEVER IN THIS LIST, found by sabotaging a closing to name a file
    // that does not exist and watching this section stay GREEN. It checked the v4297 record's names and nothing
    // else, so since2's twenty-six, since3's and since4's could name deleted files forever and still look
    // falsifiable. A record whose names are not checked cannot go stale out loud. Written over `closings` rather
    // than over named terms, which is main's v4329 shape and is why this needs no edit when since5 arrives.
    const named = [...S.fromSlowBucket, ...S.regressions, ...S.unmeasured, ...S.falseRedList.map((e) => e.gate),
                   ...SS.added, ...closings.flatMap((c) => c.added || [])];
    const missing = named.filter((g) => !fs.existsSync(path.join(GS.ENG, g)));
    ok(missing.length === 0,
       "*** every gate the record names still exists, so every entry stays falsifiable ***",
       missing.length ? missing.join(", ") : `${named.length} paths checked`);

    // The cover figure is the thing RECHECK could not claim. It is derived here from the record, not read.
    const cover = GS.coversRegressions(Array(S.swept).fill(0).map((_, i) => "g" + i), []);
    const c = GS.coversRegressions(named.concat(RC.RED_AT_V4279.map((e) => e.gate)), RC.RED_AT_V4279.map((e) => e.gate));
    // FOURTH INSTANCE OF THE SAME THING IN THIS FILE, so it is worth naming as a pattern rather than patched
    // a fourth time in silence: this gate reconciles a FROZEN RECORD against LIVE LISTS, and every place it
    // does so needed a term for the register legitimately shrinking. RECHECK.checked, SWEEP.stillRed,
    // enumerateGates() and now cover.eligible -- four assertions, one missing term, all four red on the first
    // round that repaired and pruned four gates. The register's own rule is that it MAY ONLY SHRINK, so a
    // reader of this file should expect the term everywhere the register appears, and its absence is the bug.
    const registerAtV4297 = RC.registerAtSweep();
    ok(c.covers === true && S.cover.covers === true && S.cover.eligible === S.swept - registerAtV4297,
       "*** the sweep COVERS regressions: it ran gates that were not already red ***",
       `eligible ${S.cover.eligible} = ${S.swept} - ${registerAtV4297} (${RC.RED_AT_V4279.length} standing + ` +
       `${RC.FIXED_SINCE_V4279.length} fixed since - ${RC.RECOVERED_SINCE_V4279.length} recovered since); ` +
       cover.reason);
    ok(S.falseRedList.every((e) => e.serialMs > 0 && e.parallelMs > 0),
       "and each false red carries both timings, so the starvation claim can be re-read later",
       `${S.falseReds} of ${S.candidates} candidates, ${Math.round(100 * S.falseReds / S.candidates)}% of phase 1's reds were starvation`);
    ok(Object.isFrozen(S) && Object.isFrozen(S.regressions),
       "the record is frozen", "a gate's own record is not a place a run gets to write");
}
console.log(fails === 0 ? "\nALL GREEN" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
