// tools/ship/closingCoverage-selfcheck.mjs -- v4456 -- the gate for tools/ship/closingCoverage.mjs.
//
// Run: node tools/ship/closingCoverage-selfcheck.mjs
//
// *** THE CLAIM UNDER TEST IS ABOUT A CHECK THAT ALREADY EXISTS AND PASSES. *** gateSweep-selfcheck's coverage
// line has been green for every round since v4317 that did not add an unswept gate, and this file says it is
// green in a way that cannot distinguish a covered tree from a double-counted one. A claim like that is only
// worth anything if the OLD check is run, here, against the same fixture, and observed to pass while the new
// one fails. Section 4 does exactly that -- it reimplements nothing, it recomputes the shipped expression from
// the shipped record and shows the two verdicts side by side.
//
// ---- *** SIX SABOTAGES, RESULTS BY NAME *** ----------------------------------------------------------------
//
//  A. Count names with .length instead of a Set             -> 4 RED
//  B. Report `duplicates` without the attribution           -> 1 RED
//  C. Let `phantom` skip existsSync and trust the caller    -> 0 RED, THEN 2 RED AFTER THE REPAIR
//  D. Walk the tree here instead of enumerateGates          -> 1 RED
//  E. Make the set-level answer inherit the SUM             -> 1 RED
//  F. Ignore the injected ledger and read the real one      -> 9 RED
//
// *** C WENT ZERO-RED IN THE GATE WHOSE WHOLE SUBJECT IS A CHECK THAT CANNOT SEE WHAT IT IS FOR. *** Deleting
// the filesystem clause cost nothing, because both phantom fixtures named a gate absent from `enumerateGates`
// as well as from the disk -- so `!onDiskSet.has(g)` convicted it alone and the second half never ran. The
// clause is load-bearing in exactly one direction, a claimed gate the CALLER'S LIST omits but the disk holds,
// and neither fixture went that way. An empty population drives it now: all 98 claimed names would read as
// missing, and every one of them is a real file. *** THAT IS THE FIFTH UNREACHABLE CHECK THIS SESSION AND THE
// FIRST ONE INSIDE A ROUND ABOUT UNREACHABLE CHECKS *** -- v4435 (a path check that could not fail), v4436 and
// v4447 (branches nothing reached), v4443 and v4445 (checks grading their own copy). Writing the rule down is
// not the same as being immune to it, and an earlier draft of this header said all six went red.
//
// B reads 1 because attribution appears in one assertion; the duplicate itself is caught by three others, so
// dropping the names degrades the REPORT rather than the detection. That is the honest reading of a low count
// and it is why the number is printed rather than the word "caught".
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** ------------------------------------------------------------------
//
// That the v4297 baseline is covered by name -- it is a count, rebuilding its membership would be fabrication,
// and section 1 asserts `baselineByName === false` so the limit is graded rather than merely written down.
// That a gate a closing names was actually RUN. And that gateSweep-selfcheck is wrong to pass today: it is
// right today, on a ledger with no duplicates. What is wrong is that it would be right for the same reason on
// a ledger with one.

import fs from "fs";
import path from "path";
import * as GS from "./gateSweep.mjs";
import { codeOnly } from "./sourceScan.mjs";
import {
    coverage, closingsOf, unclaimedOnDisk, withDuplicate, reportLines, ENG,
    COVERAGE_AT_V4456 as REC,
} from "./closingCoverage.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("closingCoverage-selfcheck -- the ledger holds names and the arithmetic reads counts\n");

// ---- 1. THE INSTRUMENT SHARES ITS SOURCES RATHER THAN RE-DERIVING THEM ------------------------------------
console.log("1. one enumeration, one baseline, and the limit stated as a value");

const live = coverage();
say(reportLines().join("\n  ----  "));
ok("!! the gate population comes from gateSweep's enumerateGates and is not walked again here",
    live.onDisk === GS.enumerateGates(ENG).length &&
    !/readdirSync/.test(fs.readFileSync(path.join(ENG, "tools", "ship", "closingCoverage.mjs"), "utf8")),
    "sabotage D: a SECOND walker re-deriving the gate-file pattern is a defect this tree has already named");
// *** THE FIRST VERSION OF THIS CHECK GREPPED THE WHOLE FILE AND WENT RED ON ITS OWN HEADER. *** 1366 appears
// in closingCoverage.mjs exactly once, in a comment describing the measurement -- which is the file SAYING the
// number, not USING it. v4435's rule is two strippers and two questions: `noComments` for what a file says,
// `codeOnly` for what it does, and a check about duplication of a VALUE is a question about what it does.
ok("the baseline is read from SWEEP_V4297 rather than typed as a second copy of 1366", (() => {
    const code = codeOnly(fs.readFileSync(path.join(ENG, "tools", "ship", "closingCoverage.mjs"), "utf8"))
        .replace(/COVERAGE_AT_V4456[\s\S]*$/, "");         // the frozen record is history, not a live copy
    return live.baselineSwept === GS.SWEEP_V4297.swept && !/\b1366\b/.test(code);
})(), "a second copy of a number that lives elsewhere is the drift this tree keeps finding");
ok("!! the limit is a graded value and not a sentence in a comment",
    live.baselineByName === false,
    "the 1366 swept at v4297 are covered by COUNT; rebuilding that membership now would be fabrication");
ok("the closings are read off the record in ordinal order, not typed",
    closingsOf().length === live.closings && closingsOf()[0].key === "since2");

// ---- 2. THE LEDGER AS IT STANDS ---------------------------------------------------------------------------
console.log("\n2. today's ledger is a set, and that is a measurement rather than an assumption");

ok("every name a closing claims is a file that exists", live.phantom.length === 0,
    live.phantom.length ? live.phantom.join(", ") : `${live.distinct} names, all present`);
ok("no gate is claimed by two closings", live.duplicates.length === 0,
    live.duplicates.length
        ? live.duplicates.map((d) => `${d.gate} by ${d.by.join(" and ")}`).join("; ")
        : `${live.summed} names, ${live.distinct} distinct -- the sum and the set agree`);
ok("!! and BECAUSE they agree, the two arithmetics give the same answer today",
    live.summedUncovered === live.distinctUncovered && live.creditFromDuplicates === 0,
    `summed ${live.summedUncovered}, distinct ${live.distinctUncovered}. THE OLD CHECK IS RIGHT TODAY. ` +
    "Section 4 is about the reason it is right");
ok("each closing's names and its count are pinned to each other", (() => {
    for (const c of closingsOf()) if ((c.added || []).length !== (c.swept || 0)) return false;
    return true;
})(), "gateSweep-selfcheck already asserts this per closing; what nobody checked is the UNION");

// ---- 3. THE DETECTOR CAN BE DRIVEN, WHICH IS WHAT MAKES SECTION 2 MEAN ANYTHING ---------------------------
console.log("\n3. handed a broken ledger it says so, and says WHICH -- the positive controls");

const someGate = closingsOf().flatMap((c) => c.added || [])[0];
{
    const dup = coverage({ ledger: withDuplicate(someGate) });
    say(`fixture: ${someGate.split("/").pop()} claimed twice`);
    ok("!! a gate claimed by two closings is found", dup.duplicates.length === 1);
    ok("!! and ATTRIBUTED to both claimants by name", (() => {
        const d = dup.duplicates[0];
        return d && d.gate === someGate && d.by.length === 2 && d.by.includes("since9001");
    })(), `sabotage B: "there is a duplicate" is not actionable; "${(dup.duplicates[0] || {}).by || []}" is`);
    ok("the duplicate is visible as CREDIT, which is the quantity that matters",
        dup.creditFromDuplicates === 1 && dup.summed - dup.distinct === 1,
        "one future unswept gate would now pass unseen");
}
{
    const ghost = "tools/ship/__no-such-gate-selfcheck.mjs";
    const phantomLedger = withDuplicate(ghost, GS.SWEEP_SINCE_V4297, "since9002");
    const p = coverage({ ledger: phantomLedger });
    ok("!! a closing naming a gate that does not exist is found", p.phantom.includes(ghost),
        "sabotage C: trusting the caller's on-disk list would miss a name deleted after it was claimed");
    // *** THIS CHECK EXISTS BECAUSE ITS FIRST VERSION WAS UNREACHABLE AND THE SABOTAGE PROVED IT. ***
    // Deleting the existsSync clause cost NOTHING: the ghost is absent from enumerateGates either way, so
    // `!onDiskSet.has(g)` alone was enough to convict it, and the filesystem half never ran. The clause is
    // load-bearing in exactly one direction -- a claimed gate the CALLER'S LIST omits but the disk holds --
    // so that is the case to drive. It is the difference between "the passed list is the authority" and
    // "the passed list is a hint and the filesystem decides", which is the whole point of having it.
    ok("!! the filesystem, not the caller's list, decides what is missing",
        coverage({ ledger: GS.SWEEP_SINCE_V4297, gates: [] }).phantom.length === 0,
        "sabotage C: with an EMPTY population every one of the " + live.distinct + " claimed names would be " +
        "reported missing, and every one of them is a real file");
    ok("...and the two directions are different answers, so the clause is not decorative",
        coverage({ ledger: phantomLedger, gates: [] }).phantom.length === 1,
        "same empty population, one genuinely absent name: 1 phantom rather than 0 or all of them");
}
// Pinned to a RELATIONSHIP rather than to 75, which is the same mistake section 4's first draft made and
// which this round then made a second time: writing this round's own closing moved the count to 76 and reds a
// check about nothing else. An injected empty ledger must yield nothing, and the real one must yield what
// reading the real one yields -- both true at any tree size.
ok("the injected ledger is actually used and not quietly ignored",
    coverage({ ledger: { swept: 0 } }).closings === 0 &&
    live.closings === closingsOf().length && live.closings > 0,
    "sabotage F: a fixture the code does not read makes every control above vacuous");

// ---- 4. *** THE OLD CHECK, RUN HERE, PASSING ON A LEDGER THAT DOUBLE-COUNTS *** ----------------------------
//
// *** THE FIXTURE IS CONSTRUCTED, NOT BORROWED FROM TODAY'S TREE, AND THE FIRST DRAFT GOT THAT WRONG. *** It
// pinned the rows to the trunk's live numbers -- and then this round added its own gate, the uncovered count
// went from 1 to 2, and five checks went red on a tree that had not developed a single new defect. A fixture
// that moves when the thing around it moves is not a fixture. So the population below is chosen so that
// exactly one gate is uncovered, whatever the real tree happens to hold, and the deltas are applied to that.
console.log("\n4. the shipped coverage line and this one, on the same four fixtures");

{
    // The shipped expression, recomputed from the shipped record -- not a paraphrase of it.
    const oldCheck = (summed, gatesNow, since = GS.SWEEP_SINCE_V4297.swept) =>
        (gatesNow - (GS.SWEEP_V4297.swept + 1)) - since - summed;
    // a population with EXACTLY ONE uncovered gate, by construction
    const gates0 = GS.SWEEP_V4297.swept + 1 + GS.SWEEP_SINCE_V4297.swept + live.summed + 1;
    say(`fixture: a tree of ${gates0} gates against today's ledger -- one gate uncovered, by construction`);
    const rows = REC.cancellation.map((r) => {
        const u = oldCheck(live.summed + r.dSummed, gates0 + r.dGates);
        return { ...r, u, old: u <= 0 ? "PASS" : "FAIL" };
    });
    for (const r of rows)
        say(`${r.what.padEnd(36)} uncovered ${String(r.u).padStart(2)}   old check: ${r.old}`);
    ok("!! the recomputed expression is the shipped one: it reads the fixture's single gap",
        rows[0].u === 1 && rows[0].old === "FAIL",
        "and it reproduced the trunk's own red the day this round opened -- reportDoors-selfcheck.mjs, " +
        "landed on main with no closing, which is what sent this round looking");
    ok("!! *** TWO BRANCHES CLOSING THE SAME GATE TURNS THAT RED INTO A PASS ***",
        rows[1].u === 0 && rows[1].old === "PASS",
        "one duplicate, one real gap, and the arithmetic reports a covered tree");
    ok("a gate nobody sweeps at all still reds, so the check is not simply broken",
        rows[2].u === 2 && rows[2].old === "FAIL");
    ok("the fourth row reds for the wrong reason, naming one gap where there are three problems",
        rows[3].u === 1 && rows[3].old.startsWith("FAIL"),
        "two unswept gates and a duplicate read as '1 STILL UNSWEPT', a message naming no file");
    ok("the recorded table is what the code produces", rows.every((r) => r.u === r.uncovered));
    ok("!! and the set-level view sees the fixture the sum cannot", (() => {
        const dup = coverage({ ledger: withDuplicate(someGate) });
        return dup.creditFromDuplicates === 1 && dup.distinctUncovered > dup.summedUncovered;
    })(), "the names were in the record the whole time");
    ok("the credit is exactly one per duplicate, which is why one duplicate hides one gate", (() => {
        let led = GS.SWEEP_SINCE_V4297, n = 0;
        for (const g of closingsOf().flatMap((c) => c.added || []).slice(0, 3)) {
            led = withDuplicate(g, led, "since90" + (10 + n));
            n++;
            if (coverage({ ledger: led }).creditFromDuplicates !== n) return false;
        }
        return n === 3;
    })(), "three duplicates buy three, so the quantity is linear and nameable rather than a threshold");
}

// ---- 5. THE ASYMMETRY THAT MAKES A DUPLICATE PERMANENT ----------------------------------------------------
console.log("\n5. `<= 0` is not a tolerance, it is a hole with no bottom");

ok("!! once the sum reaches coverage, no amount of further over-counting reds the old check", (() => {
    const u = live.summedUncovered;
    for (const extra of [u, u + 1, u + 10, u + 100, u + 1000])
        if (!((live.summedUncovered - extra) <= 0)) return false;
    return true;
})(), "sabotage E: a set-level check that also says <= 0 inherits the same hole and tests nothing new");
ok("the credit is reported as its own number rather than folded into the uncovered total", (() => {
    const c = coverage({ ledger: withDuplicate(someGate) });
    return c.creditFromDuplicates === 1 && live.creditFromDuplicates === 0;
})());
ok("...and naming does not make the arithmetic optional: the unclaimed set is a SUPERSET and says so",
    unclaimedOnDisk().length === live.onDisk - live.distinct && live.baselineByName === false,
    `${unclaimedOnDisk().length} gates no closing names, of which ${live.baselineSwept} are the v4297 count -- ` +
    "the baseline has no membership to subtract, so this is reported for attribution and never as a verdict");

// ---- 6. THE RECORD ----------------------------------------------------------------------------------------
console.log("\n6. the frozen record: history as history, and today's invariants as invariants");

ok("the recorded trunk snapshot is labelled as one and not re-derived",
    REC.onDisk === 1480 && REC.summed === 98 && REC.distinct === 98 && REC.summedUncoveredThen === 1,
    "measured at main 72ab924, before this round added its own gate -- a number this file must NOT recompute, " +
    "because the tree it describes no longer exists");
ok("!! the invariants that must hold on ANY ledger hold on today's",
    live.duplicates.length === 0 && live.phantom.length === 0 && live.summed === live.distinct &&
    live.creditFromDuplicates === 0,
    `${live.onDisk} gates, ${live.summed} names, ${live.distinct} distinct -- these are the checks that survive ` +
    "the tree growing, which is what section 4's first draft got wrong");
ok("the record is frozen and so are its rows",
    Object.isFrozen(REC) && Object.isFrozen(REC.cancellation) && REC.cancellation.every(Object.isFrozen));

console.log(`\nclosingCoverage-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
