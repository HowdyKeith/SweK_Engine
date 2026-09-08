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
    ok("!! every record lands in exactly one class, and the classes add up to the population",
        live.checked + live.overBudget + live.unguarded === live.total &&
        live.unchecked === live.overBudget + live.unguarded,
        `${live.checked} + ${live.overBudget} + ${live.unguarded} = ${live.total}`);
    ok("!! ...and the budget is READ from the sweep's own timings file, not retyped here",
        live.budgetMs === (JSON.parse(fs.readFileSync(path.join(ENG, RR.TIMINGS), "utf8")).budgetMs),
        `${live.budgetMs} ms. A second declaration of the budget is a second thing to keep in sync, and this ` +
        `gate's whole subject is a number that went stale while being recorded.`);
}

// =============================================================================================================
console.log("\n2. *** THE RATCHET: UNCHECKED MAY FALL AND MUST NOT RISE ***");
{
    ok("!! *** THE NUMBER OF RECORDS THE RITUAL CANNOT CHECK HAS NOT GROWN SINCE v4548 ***",
        live.unchecked <= R.unchecked,
        `${live.unchecked} unchecked now against ${R.unchecked} recorded (${R.beforeThisRound.unchecked} ` +
        `before this round). *** THIS IS A CEILING AND NOT A TARGET: *** 40 records still go unchecked and ` +
        `this round did not fix them. What it refuses is the specific way the tree got here -- a record whose ` +
        `last guardian drifts over the budget with nothing anywhere saying so.`);
    ok("...and the recorded total still matches the tree, so the ratchet is not measured against a stale population",
        live.total === R.total, `${live.total} records against ${R.total} recorded`);
    ok("!! the records this round rescued really are checked now, and the demoted ones really are unguarded",
        R.rescued.every((n) => live.rows.find((r) => r.name === n)?.cls === RR.CLASS.CHECKED) &&
        R.demotedByCommentStrip.every((n) => live.rows.find((r) => r.name === n)?.cls === RR.CLASS.UNGUARDED) &&
        R.rescued.every((n) => !R.demotedByCommentStrip.includes(n)),
        "rescued " + R.rescued.join(", ") + "; demoted " + R.demotedByCommentStrip.join(", ") +
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
    ok("!! *** THREE GUARDIAN GATES ARE RECORDED AT OR OVER THE 20,000 ms CAP -- THEY DO NOT FINISH ***",
        live.atCap.length >= 3 && live.atCap.every((g) => R.atCapGates.includes(g)),
        live.atCap.map((g) => g + " " + live.blockers.find((b) => b.gate === g).ms + " ms").join(", ") +
        ". A record with one of these as its only guardian has a guard on paper and nothing that has run in " +
        "a long time -- a different fact from 'a few hundred milliseconds over', and blurring the two would " +
        "make the 40 look more uniform than it is.");
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
    const t = JSON.parse(fs.readFileSync(path.join(ENG, RR.TIMINGS), "utf8"));
    const pair = ["tools/ship/frozenRecords-selfcheck.mjs", "tools/ship/recordDrift-selfcheck.mjs"];
    for (const g of pair) say(`${g}: ${t.timings[g]} ms against a ${live.budgetMs} ms budget`);
    ok("!! *** BOTH STALE-RECORD DETECTORS RUN AT SHIP TIME AGAIN ***",
        pair.every((g) => t.timings[g] != null && t.timings[g] <= live.budgetMs),
        pair.map((g) => path.basename(g) + " " + t.timings[g] + " ms").join(", ") +
        ". They were 3,446 and 3,026, and the tree's ONLY two detectors for a stale record were both outside " +
        "the ritual that writes records.");
    // Margin, not merely under: a gate one millisecond inside the budget is a gate about to leave it, and
    // these two are O(tree) walkers in a tree that grows every round.
    const margin = Math.min(...pair.map((g) => live.budgetMs - t.timings[g]));
    ok("!! ...and with real margin, because both are O(tree) and the tree grows every round",
        margin >= 800,
        `worst margin ${margin} ms of ${live.budgetMs}. At the pre-round cost they were 446 ms and 26 ms ` +
        `OVER; 26 ms is close enough that a warm cache and a cold one land on opposite sides, which is how ` +
        `this drifted out unnoticed rather than failing loudly.`);
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
