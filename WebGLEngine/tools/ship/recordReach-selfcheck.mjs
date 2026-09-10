// WebGLEngine/tools/ship/recordReach-selfcheck.mjs -- v4548
//
// Run: node tools/ship/recordReach-selfcheck.mjs
//
// GATES tools/ship/recordReach.mjs -- the join between "which gates name which frozen records" and "which
// gates the ship sweep can afford to run", which nothing in this tree had ever put side by side.
//
// *** THE FAILURE THIS EXISTS TO REFUSE, IN THE WORDS OF THE ROUND THAT FOUND IT. *** BUDGET_DRIFT_V4536 was
// added to the tree at commit 4817a29b -- the round whose own subject was the sweep budget -- without
// re-taking the census that counts records. Nine rounds then shipped ALL GREEN over a number that was wrong,
// and it was found BY HAND at v4547. The reason nothing caught it is that the two gates which would have
// were themselves over the 3,000 ms budget, at 3,446 ms and 3,026 ms, so the ritual never ran them.
//
// Fixing those two was the round's starting point. The number below is what asking the general question
// found: FORTY-SEVEN PER CENT of this tree's frozen records were not checked at ship time by anything.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RR from "./recordReach.mjs";
import * as FR from "./frozenRecords.mjs";
import { costOf } from "./quickSweep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("recordReach-selfcheck -- how many frozen records the ship ritual actually checks\n");

const live = RR.reach();
const R = RR.REACH_AT_V4548;

// =============================================================================================================
console.log("1. *** THE CENSUS, DERIVED EVERY RUN -- A PINNED LIST WOULD BE THIS ROUND'S OWN DEFECT ***");
{
    for (const l of RR.reportLines()) say(l.replace(/^\[recordReach\] ?/, ""));
    // The sum must cover EVERY class. It read checked + overBudget + unguarded until v4550 split UNMEASURED
    // out, and then a torn-timings fixture failed HERE -- 0 + 0 + 20 = 94 -- instead of on the judgeable row
    // that exists to catch it. A completeness check that does not enumerate the classes is not one.
    ok("!! every record lands in exactly one class, and the classes add up to the population",
        live.checked + live.overBudget + live.unmeasured + live.unguarded === live.total &&
        live.unchecked === live.overBudget + live.unguarded,
        `${live.checked} checked + ${live.overBudget} over-budget + ${live.unmeasured} unmeasured + ` +
        `${live.unguarded} unguarded = ${live.total}`);
    // Through readTimings, NOT a second raw JSON.parse: the first draft did the latter, and on the very
    // fixture that tears the timings file this gate CRASHED with an unhandled SyntaxError before reaching
    // the row written to detect exactly that. A guard that only works on well-formed input is not a guard.
    ok("!! ...and the budget is READ from the sweep's own timings file, not retyped here",
        live.budgetMs === (RR.readTimings(ENG).budgetMs ?? 3000),
        `${live.budgetMs} ms. A second declaration of the budget is a second thing to keep in sync, and this ` +
        `gate's whole subject is a number that went stale while being recorded.`);
}

// =============================================================================================================
console.log("\n2. *** THE RATCHET: UNCHECKED MAY FALL AND MUST NOT RISE ***");
{
    // *** THE RATCHET REFUSES TO JUDGE ON AN UNREADABLE TIMINGS FILE, AND THAT IS WHY THIS GATE USED TO GO
    // RED AT RANDOM. *** tools/ship/quickSweep.mjs REWRITES sweep-timings.json at the end of a run; a read
    // that lands mid-write parses to nothing, every guardian then looks unmeasured, and `unchecked` jumps
    // from 43 to about 74. Measured: this gate went red twice inside full sweeps and passed all 68 runs
    // under 16-way CPU load afterwards -- the load was never the trigger, the concurrent WRITE was.
    ok("!! the ratchet has evidence to judge on -- a torn read is not a regression",
        live.judgeable && live.timingEntries > 100,
        live.judgeable ? `${live.timingEntries} timing entries read`
                       : `TIMINGS UNREADABLE (${live.timingEntries} entries). Reporting this rather than ` +
                         `ratcheting on it: an empty map makes every guardian look unmeasured and would ` +
                         `read as a catastrophic regression, which is the failure mode this row replaced.`);
    ok("!! *** THE NUMBER OF RECORDS THE RITUAL CANNOT CHECK HAS NOT GROWN SINCE v4548 ***",
        !live.judgeable || live.unchecked <= R.unchecked,
        `${live.unchecked} unchecked now against ${R.unchecked} recorded (${R.beforeThisRound.unchecked} ` +
        `before this round). *** THIS IS A CEILING AND NOT A TARGET: *** 40 records still go unchecked and ` +
        `this round did not fix them. What it refuses is the specific way the tree got here -- a record whose ` +
        `last guardian drifts over the budget with nothing anywhere saying so.`);
    ok("...and the recorded total still matches the tree, so the ratchet is not measured against a stale population",
        live.total === R.total, `${live.total} records against ${R.total} recorded`);
    // *** "NEVER TIMED" IS NOT "TOO SLOW", AND THE FIRST DRAFT COUNTED THEM AS ONE. *** A gate added this
    // round has no entry in sweep-timings.json until a sweep writes one, so adding a guardian made the
    // record it guards look WORSE until the next sweep -- the opposite of what a guardian does. quickSweep
    // has kept `unmeasured` apart from `skippedOverBudget` since it was written; this was the only place in
    // the tree that blurred them.
    ok("!! a guardian that has never been TIMED is counted apart from one that is too SLOW",
        live.unmeasured === 0 || live.unmeasured < live.overBudget,
        `${live.unmeasured} record(s) guarded only by gates with no recorded timing, against ` +
        `${live.overBudget} guarded only by gates measured over the budget. Removing one detector's timing ` +
        `from the table moves a record into the first bucket, not the second.`);
    // *** v4576 -- THE DEMOTED HALF IS A FACT ABOUT v4548 AND WAS BEING TESTED AGAINST TODAY. ***
    // This required every record the comment-strip demoted to be STILL unguarded. BUDGET_DRIFT_V4536 is not:
    // v4576 taught frozenRecords to follow one level of derivation within a defining file, and that record is
    // now guarded by three gates. A LATER ROUND RE-CLASSIFYING A RECORD IS THE OUTCOME THIS FILE EXISTS TO
    // PROMPT, and the row reddened on it -- the third time in this one round that a historical claim was being
    // asserted against live state, after budgetExile's cap row and its inflation row.
    //
    // So the claim is split the way tools/ship/budgetExile-selfcheck.mjs's section 3 prescribes: the RESCUED
    // half is still asserted live, because a record v4548 rescued going back to unchecked would be a real
    // regression; the DEMOTED half is asserted as v4548's finding -- the list is non-empty and disjoint from
    // the rescued one -- and each record's class TODAY is reported rather than required.
    const demotedNow = R.demotedByCommentStrip.map((n) => n + " " + (live.rows.find((r) => r.name === n)?.cls ?? "gone"));
    ok("!! the records this round rescued really are checked now, and the demoted ones are accounted for",
        R.rescued.every((n) => live.rows.find((r) => r.name === n)?.cls === RR.CLASS.CHECKED) &&
        R.demotedByCommentStrip.length > 0 &&
        R.rescued.every((n) => !R.demotedByCommentStrip.includes(n)),
        "rescued " + R.rescued.join(", ") + " -- all still checked, which is the half that would be a " +
        "regression. Demoted at v4548 and where they stand today: " + demotedNow.join(", ") + ". A record " +
        "leaving the demoted state is PROGRESS and this row no longer forbids it" +
        // *** THE RECORD NAMES BELOW ARE SPELT FROM `R`, NEVER TYPED, AND THAT IS NOT STYLE. *** `guardians`
        // asks which gates NAME a record, comment-stripped -- and a name in a STRING survives the strip,
        // because a string is where a real check lives too (`r.name === "FOO_V4500"`). The first draft of
        // this row narrated the raceKnob record BY NAME in its detail text, and the census promptly promoted
        // that record from unguarded to guarded on the strength of this gate's prose about it. Measured
        // tree-wide: 2 records are held up by a string mention alone, and this file was producing one of
        // them. Concatenating the name out of `R` keeps the literal off the page.
        ". *** THE LAST CLAUSE IS THERE BECAUSE THE FIRST DRAFT PUT " + R.demotedByCommentStrip[1] +
        " IN BOTH LISTS *** -- " +
        "rescued by the faster gate and demoted by the comment strip, which cannot both be true of one " +
        "record; its only guardian named it in a comment, so nothing was left to rescue. Recovered by " +
        "making frozenRecords-selfcheck 2.5x faster and " +
        "recordDrift-selfcheck 1.4x faster, NOT by widening the budget for them. A budget raised to admit " +
        "a slow gate admits every other slow gate too, and the ratio it hides -- six reads of the tree for " +
        "one read's worth of information -- would have grown back at the next census.");
}

// =============================================================================================================
console.log("\n3. *** THE JOIN DISCRIMINATES: A GATE'S TIMING REALLY DECIDES A RECORD'S CLASS ***");
{
    const census = FR.census();
    const guarded = census.records.filter((r) => r.guardians.length);
    const gates = [...new Set(guarded.flatMap((r) => r.guardians))];
    // Every guardian instantly cheap -> nothing can be over budget.
    const allFast = RR.reach({ census, timings: { budgetMs: 3000, timings: Object.fromEntries(gates.map((g) => [g, 1])) } });
    // Every guardian instantly slow -> every guarded record is over budget, and unguarded is untouched.
    const allSlow = RR.reach({ census, timings: { budgetMs: 3000, timings: Object.fromEntries(gates.map((g) => [g, 99999])) } });
    say(`all guardians at 1 ms: ${allFast.unchecked} unchecked; at 99,999 ms: ${allSlow.unchecked} unchecked`);
    ok("!! with every guardian cheap, the only unchecked records are the ones nothing guards",
        allFast.overBudget === 0 && allFast.unchecked === allFast.unguarded,
        `${allFast.unguarded} unguarded and ${allFast.overBudget} over budget`);
    ok("!! *** AND WITH EVERY GUARDIAN SLOW, EVERY GUARDED RECORD FALLS OUT -- so the classification is the ***" +
        " *** TIMING and not the guardian list ***",
        allSlow.checked === 0 && allSlow.overBudget === guarded.length,
        `${allSlow.overBudget} over budget against ${guarded.length} guarded records. A join that read only ` +
        `the guardian column would be identical under both fixtures.`);
    // A record needs only ONE affordable guardian, which is not the same as all of them being affordable.
    const multi = census.records.find((r) => r.guardians.length > 1);
    if (multi) {
        const mixed = RR.reach({ census, timings: { budgetMs: 3000, timings: Object.fromEntries(
            gates.map((g) => [g, g === multi.guardians[0] ? 1 : 99999])) } });
        ok("!! one affordable guardian is enough, and the code says `some` rather than `every`",
            mixed.rows.find((r) => r.name === multi.name).cls === RR.CLASS.CHECKED,
            `${multi.name} has ${multi.guardians.length} guardians; with only the first cheap it is still checked`);
    }
}

// =============================================================================================================
console.log("\n4. *** A GATE AT THE CAP IS NOT MERELY SLOW, AND IS COUNTED SEPARATELY ***");
{
    say("blockers, slowest first: " + live.blockers.slice(0, 5).map((b) => `${b.ms}ms ${path.basename(b.gate)}`).join(", "));
    // *** v4568 -- THIS ROW SAID THOSE THREE "DO NOT FINISH" AND ALL THREE FINISH. *** It read a timing at
    // or over the cap as proof the process was cut off, which is the proxy KILLED_PASS_V4568 exists to
    // separate, in the gate that reports on guardians. `finished` is recorded by whatever ran the gate, so
    // atCap now means CUT OFF and gradedOverCap means expensive-but-graded. The distinction is the point of
    // the row -- "a guard on paper and nothing that has run" is a different fact from "a slow guard" -- and
    // it was making exactly the blur it warns about.
    ok("!! *** NO GUARDIAN IS CUT OFF ANY MORE: the three at the cap all FINISH, and slow is not unjudged ***",
        live.atCap.length === 0 && live.gradedOverCap.length > 0 &&
        live.gradedOverCap.every((g) => R.atCapGates.includes(g)) &&
        R.atCapGatesFinish.finished === R.atCapGatesFinish.of && R.atCapGatesFinish.killed === 0,
        `${live.atCap.length} guardian(s) cut off; ${live.gradedOverCap.length} over the cap and GRADED: ` +
        live.gradedOverCap.map((g) => path.basename(g) + " " + live.blockers.find((b) => b.gate === g).ms + " ms").join(", ") +
        ". redCensus-selfcheck was 90,096 ms and killed until its register re-run was bounded by wall clock; " +
        "it is 45,245 ms exit 0 now. A record guarded only by a gate that is CUT OFF has a guard on paper and " +
        "nothing that has run; a record guarded by a slow gate has a verdict that costs too much to take at " +
        "ship time. Blurring those made the unchecked population look more uniform than it is.");
    ok("...and every at-cap gate is also counted among the blockers, so the two views cannot disagree",
        live.atCap.every((g) => live.blockers.some((b) => b.gate === g)));
    ok("!! the blocker list names records, not just a count",
        live.blockers.length > 0 && live.blockers.every((b) => b.records.length > 0) &&
        live.blockers.reduce((a, b) => a + b.records.length, 0) >= live.overBudget,
        "a count would leave the reader to go and find which records are behind which gate");
}

// =============================================================================================================
console.log("\n5. *** THE TWO GATES THIS ROUND WAS ABOUT ARE BACK INSIDE THE BUDGET, WITH MARGIN ***");
{
    const t = RR.readTimings(ENG);
    const pair = ["tools/ship/frozenRecords-selfcheck.mjs", "tools/ship/recordDrift-selfcheck.mjs"];
    const cost = Object.fromEntries(pair.map((g) => [g, costOf(t, g)]));
    for (const g of pair) say(`${g}: ${cost[g].ms} ms (${cost[g].source}) against a ${live.budgetMs} ms budget, ` +
        `filed at ${t.timings[g]} ms`);
    ok("!! *** BOTH STALE-RECORD DETECTORS RUN AT SHIP TIME AGAIN ***",
        pair.every((g) => t.timings[g] != null && t.timings[g] <= live.budgetMs),
        pair.map((g) => path.basename(g) + " " + t.timings[g] + " ms").join(", ") +
        ". They were 3,446 and 3,026, and the tree's ONLY two detectors for a stale record were both outside " +
        "the ritual that writes records. MEMBERSHIP is decided on the filed reading, so that is what this " +
        "row asks about -- it is the number the sweep will use next time, contended or not.");
    // *** THE MARGIN IS READ FROM THE UNCONTENDED COST, WHICH IS THE REPAIR v4562 EXISTS FOR. ***
    // This row used to subtract the FILED reading from the budget, and a filed reading is a sample taken
    // while seven other gates fought for a four-core box: measured across 1,011 gates, a median of 2.41x
    // the serial cost, p90 3.44x. frozenRecords-selfcheck was filed at 1,185, 1,217 and 2,931 ms on three
    // sweeps of byte-identical code while running 1,201 to 1,219 ms alone -- so this row went red on
    // scheduling luck and said the gate had lost its margin. costOf() prefers the serial reading the sweep
    // now accumulates, and falls back to the filed one while saying so.
    const margin = Math.min(...pair.map((g) => live.budgetMs - cost[g].ms));
    ok("!! ...and with real margin, because both are O(tree) and the tree grows every round",
        margin >= 800 && pair.every((g) => cost[g].source === "serial"),
        `worst margin ${margin} ms of ${live.budgetMs}, from ` +
        pair.map((g) => `${path.basename(g)} ${cost[g].ms} ms (${cost[g].source})`).join(" and ") +
        `. At the pre-round cost they were 446 ms and 26 ms OVER; 26 ms is close enough that a warm cache ` +
        `and a cold one land on opposite sides, which is how this drifted out unnoticed rather than failing ` +
        `loudly. A serial reading is REQUIRED here rather than merely preferred: falling back to the ` +
        `contended sample would put this row back on the luck it was just taken off.`);
}

console.log("\n6. *** \"UNGUARDED\" WAS ONE WORD FOR TWO FACTS, AND THE SMALLER ONE IS THE ACTIONABLE ONE ***");
{
    // For four rounds this file reported `unguarded` and every reader -- me included -- took it for a
    // coverage hole somebody forgot to close. Asked properly at v4577, with comments AND every record's own
    // declaration blanked so a declaration is not a read: nine of them are named by NO CODE ANYWHERE. They
    // are prose in object form. A guardian for one would have to re-derive a past round's measurement, which
    // is a round each, not a gap. The other two ARE read, by something that cannot fail on the value, and
    // that is a defect with a repair.
    const u = RR.splitUnguarded();
    // *** THE ROUND'S OWN RECORD, GRADED AGAINST THE LIVE TREE RATHER THAN READ OUT. *** Without this row the
    // record would be unguarded itself, which is the joke this file cannot afford to be the punchline of --
    // and the ratchet caught it: UNGUARDED_SPLIT_V4577 landed in recordReach.mjs and read as unguarded until
    // this row named it. Like the census re-takes in frozenRecords-selfcheck, A ROUND THAT ADDS A RECORD
    // RE-TAKES THIS, and that is the price of a number somebody re-derives.
    const R7 = RR.UNGUARDED_SPLIT_V4577;
    // *** ONLY THE TIMING-INDEPENDENT HALF IS ASSERTED, AND THE FIRST DRAFT ASSERTED BOTH. *** `unguarded`
    // asks which gates NAME a record and no clock enters it. `checked` and `overBudget` come from joining
    // that census to sweep-timings.json, which quickSweep writes from an 8-WAY pass. This row went red inside
    // the round's own closing sweep: 73/22/1 before it, 69/27/0 after, on code that had not changed, because
    // all five that moved are guarded by tools/ship/reportDoors-selfcheck.mjs and that gate reads 2877 / 2872
    // / 2939 / 3001 / 3025 ms over five SERIAL runs against a 3,000 ms budget. It straddles the line on its
    // own. A row asserting those five records' class was asserting a coin toss, which is precisely the "fails
    // a ship at random and never reproduces alone" shape this file's readTimings note already warns about.
    ok("!! *** the structural half of this round's reading is what the tree holds -- no clock enters it ***",
       R7.structural.total === live.total && R7.structural.unguarded === live.unguarded &&
       R7.structural.documentaryOfThose === u.documentary.length &&
       R7.structural.readByCodeOfThose === u.readUnchecked.length,
       `record ${R7.structural.unguarded} unguarded of ${R7.structural.total} (${R7.structural.documentaryOfThose} ` +
       `documentary, ${R7.structural.readByCodeOfThose} read) against live ${live.unguarded} of ${live.total} ` +
       `(${u.documentary.length} documentary, ${u.readUnchecked.length} read)`);
    say(`the timing-dependent half, REPORTED and not asserted: live ${live.checked} checked / ${live.overBudget} ` +
        `over budget / ${live.unmeasured} unmeasured. The record filed ${R7.after.checked}/${R7.after.overBudget}/` +
        `${R7.after.unmeasured} and, minutes earlier on the same code, ${R7.afterPriorSweep.checked}/` +
        `${R7.afterPriorSweep.overBudget}/${R7.afterPriorSweep.unmeasured} -- ${R7.contendedRecords} records ` +
        `whose class is decided by how loaded the box was when ${R7.contendedGuardian} was timed.`);
    ok("!! ...and the pair of readings really does straddle the budget, so the instability is measured",
       R7.contendedGuardianSerialMs.some((m) => m < live.budgetMs) &&
       R7.contendedGuardianSerialMs.some((m) => m > live.budgetMs) &&
       R7.afterPriorSweep.checked !== R7.after.checked,
       `${R7.contendedGuardian}: ${R7.contendedGuardianSerialMs.join(" / ")} ms serial against a ` +
       `${live.budgetMs} ms budget. If this ever reads all-under or all-over, the gate has moved off the ` +
       "line and the five records have a stable class again -- which is a repair, and this row should then " +
       "be replaced by an assertion rather than kept as a description of a wobble that stopped");
    ok("!! ...and the three records it says moved really did leave the unguarded set",
       Object.keys(R7.moved).every((n) => {
           const row = live.rows.find((r) => r.name === n);
           return row && row.cls !== "unguarded";
       }),
       Object.entries(R7.moved)
           .map(([n, c]) => n + " recorded " + c + ", live " + (live.rows.find((r) => r.name === n) || {}).cls)
           .join("; ") + ". LEAVING the unguarded set is the claim; WHICH class they landed in is the timing " +
       "join and is reported beside it, because \"no longer unguarded\" is not \"now checked\"");
    for (const r of u.readUnchecked) console.log(`     read by code: ${r.name}  in ${r.readBy.join(", ")}`);
    ok("!! *** a DOCUMENTARY record is named by no code at all -- not even its own module ***",
       u.documentary.every((n) => !u.rows.find((r) => r.name === n).readBy.length),
       `${u.documentary.length}: ${u.documentary.join(", ")}. Every one of them scored a hit before the ` +
       "declaration blanking went in, on its own `export const` line, which made the whole population read " +
       "as 'named somewhere' and the split as worthless");
    // *** THE CONTROL: the blanking must not be blanking everything. *** A splitter that returned
    // "documentary" for all eleven would pass the row above and mean nothing, which is this session's most
    // frequent single mistake -- a smaller number that looks like progress.
    const guarded = live.rows.filter((r) => r.cls !== "unguarded").slice(0, 6).map((r) => r.name);
    const sanity = FR.readSites(guarded);
    ok("!! *** CONTROL: the same scan finds the reads of records that ARE guarded ***",
       guarded.length > 0 && guarded.every((n) => sanity.get(n).length > 0),
       guarded.map((n) => n + " -> " + sanity.get(n).length + " file(s)").join("; ") +
       ". Without this row, a scan that blanked too much would report every record documentary and read as a " +
       "clean answer");
    // *** THIS BUCKET IS EMPTY TODAY AND THE ROW BELOW IS THEREFORE VACUOUS -- SAID, NOT HIDDEN. ***
    // v4577 found two in it and gave both a gate: MEASURED_AT_V4415, whose only reader handed it to a
    // FINITENESS check (`hit: 0.5` -> `hit: 0.77` left that gate green), now re-derived value for value in
    // physics/render/pathTracerGpu-selfcheck.mjs; and MEASURED_V4527, printed by physics/raceKnob.mjs's own
    // reportLines() and now held to LAP_BOUND, OFF_BOUND and CANDIDATES by physics/raceKnob-selfcheck.mjs.
    // The row stays as the guard for a refill. A zero here is a state of the tree, not a passing check, and
    // the row above -- which counts the documentary nine -- is the one carrying the weight.
    ok("  and the readUnchecked rows name real files that really contain the name",
       u.readUnchecked.every((r) => r.readBy.every((f) => fs.existsSync(path.join(ENG, f)) &&
                                                          fs.readFileSync(path.join(ENG, f), "utf8").includes(r.name))),
       u.readUnchecked.length
         ? u.readUnchecked.map((r) => r.name + " in " + r.readBy.join(", ")).join("; ")
         : "*** VACUOUS: the bucket is empty, so this row asserts nothing. *** v4577 emptied it by gating " +
           "both of its members; it is here to catch the next record that is read by something that cannot " +
           "fail on its value");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nSTILL TRUE AND NOT FIXED HERE: " + live.unchecked + " of " + live.total + " frozen records are not " +
    "checked at ship time -- " + live.overBudget + " guarded only by gates the sweep cannot afford and " +
    live.unguarded + " guarded by nothing at all. Three of the guardians do not finish at 20 s; one is a " +
    "14 s walk over a vendored repository's commit history. Those are separate rounds with separate causes, " +
    "and this file's job is to stop the number growing while nobody is looking, not to pretend it is small." +
    "\nAND A LIMIT ON THE GUARDIAN COLUMN ITSELF, MEASURED RATHER THAN WAVED AT: `guardians` asks which " +
    "gates NAME a record. v4548 made it strip COMMENTS first, which moved 11 records and took 2 of them to " +
    "unguarded -- prose about a record is never a check. It does NOT strip STRINGS, on purpose: a real check " +
    "reads `r.name === \"SOME_RECORD_V4500\"`, so a literal is exactly where a genuine reference lives too, " +
    "and a regex-level stripper cannot tell that from narration (an attempt to measure it here was itself " +
    "unreliable -- a regex literal containing a quote derails a character-scanner). 2 records tree-wide are " +
    "held up by a string mention alone. The EMPIRICAL answer already exists and is not this column: " +
    "PROBE_AT_V4536's method bumps a field by 7 and runs every gate that names the record, which is what " +
    "actually separates noticing from mentioning, and costs an hour.");
process.exit(fails ? 1 : 0);
