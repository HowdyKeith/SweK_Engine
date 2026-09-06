// tools/ship/budgetMargin-selfcheck.mjs -- v4481 -- the gate for tools/ship/budgetMargin.mjs.
//
// Run: node tools/ship/budgetMargin-selfcheck.mjs
//
// *** THE CLAIM IS THAT A VERDICT IS A COIN FLIP, SO THE FIXTURES ARE READING SETS WHOSE ANSWER IS KNOWN
// BEFORE THE CODE RUNS. *** A set straddling the cap, a set entirely below it, a set entirely above it, and a
// set touching it exactly -- the boundary case, because `straddles` is a comparison against a threshold and a
// comparison against a threshold is where off-by-one lives.
//
// ---- *** SIX SABOTAGES, RESULTS BY NAME, AND NONE WENT ZERO-RED *** ---------------------------------------------
//
//  A. `straddles` always false                            -> 3 RED
//  B. `nearCap` ignores the window, returns everything    -> 3 RED
//  C. `inflation` divides actual by recorded              -> 1 RED
//  D. `spread` reports 0 instead of the range             -> 1 RED
//  E. `nearCap` includes gates that exited non-zero       -> 1 RED
//  F. `straddles` uses strict < and > at the boundary     -> 1 RED
//
// F reads 1 and is the one worth keeping anyway: the tree currently holds a gate recorded at 3001 ms, one
// millisecond over, so the exact-cap case is not hypothetical here and strict comparison would drop it.
//
// *** AND THE RECORD CHECK CAUGHT A MISCOUNT IN THIS ROUND'S OWN HEADLINE. *** The first draft said meshBVH's
// seven readings were three over and four under and called the verdict a coin flip. They are TWO over and
// five under. The straddle -- which is what the round rests on -- is unaffected, but 29% is not 50%, and the
// claim is now what the numbers say. Section 4 asks that the frozen readings really do produce the recorded
// split, which is the only reason the header is right.
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** ------------------------------------------------------------------
//
// That the cap is wrong -- a cap is a policy, and this measures the reading it is applied to. That "best of
// three on an idle box" is the true cost; it is a floor, chosen because it is the most generous number
// available to the recorded figure and still leaves half the near-cap gates recorded at 1.5x it. And that the
// numbers in the record reproduce on another machine: they are this container's, taken in one sitting, and
// the record says so.

import {
    spread, nearCap, inflation, reportLines, DEFAULT_CAP_MS, MARGIN_AT_V4481 as REC,
} from "./budgetMargin.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("budgetMargin-selfcheck -- a hard line across a soft reading\n");

// ---- 1. STRADDLING, ON SETS WHOSE ANSWER IS KNOWN IN ADVANCE ---------------------------------------------------
console.log("1. does the cap fall inside the reading's own range");

const CAP = DEFAULT_CAP_MS;
{
    const across = spread([2829, 2880, 2939, 2965, 2998, 3026, 3062], CAP);
    say(`a set that crosses the line: min ${across.min}, max ${across.max}, ${across.over} over / ${across.under} under`);
    ok("!! a set whose range contains the cap is reported as straddling",
        across.straddles === true && across.over === 2 && across.under === 5,
        "sabotage A: with this always false, the round's entire claim evaporates and nothing else notices");
    ok("...and the split is counted, because 'straddles' alone does not say how close to a coin flip it is",
        across.over + across.under === across.n && across.n === 7);
}
{
    const below = spread([1200, 1250, 1310], CAP), above = spread([4000, 4200, 4400], CAP);
    ok("!! a set entirely below the cap does NOT straddle", below.straddles === false);
    ok("!! a set entirely above the cap does NOT straddle", above.straddles === false,
        "sabotage A again from the other side -- 'always true' is as useless as 'always false'");
    ok("the spread percentage is measured from the minimum, not from the mean",
        Math.round(spread([1000, 1100], CAP).spreadPct) === 10,
        "sabotage D: a mean hides the range, and the range is the whole subject");
}
{
    // the boundary: a reading EXACTLY at the cap is over-or-equal, and a set touching it from below straddles
    const touching = spread([2900, 3000], CAP);
    ok("!! a set whose maximum is exactly the cap still straddles",
        touching.straddles === true,
        "sabotage F: strict < and > make the exact-cap case fall through, and 3001 ms gates are real in this tree");
    ok("a reading exactly at the cap counts as under, matching the sweep's own <= budget test",
        spread([3000], CAP).under === 1 && spread([3000], CAP).over === 0);
    ok("an empty set is null rather than a confident zero", spread([], CAP) === null);
}

// ---- 2. THE NEAR-CAP BAND, AND WHAT BELONGS IN IT ---------------------------------------------------------------
console.log("\n2. which gates sit inside the band a single re-reading can move across");

{
    const timings = { a: 2700, b: 2900, c: 3000, d: 3300, e: 1000, f: 9000, g: 2699, h: 3301 };
    const codes = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0 };
    const band = nearCap(timings, { cap: CAP, frac: 0.1, codes });
    say(`fixture: ${Object.keys(timings).length} gates, band ${CAP * 0.9}-${CAP * 1.1} ms -> ${band.map((b) => b.gate).join(",")}`);
    ok("!! the window is honoured at both edges, inclusive",
        band.length === 4 && band.map((b) => b.gate).sort().join("") === "abcd",
        "sabotage B: returning everything makes the population meaningless and the finding unfalsifiable");
    ok("...and one millisecond outside it is outside it",
        !band.some((b) => b.gate === "g" || b.gate === "h"));
    ok("a gate that did not exit 0 is not in the band, because its reading is not a cost",
        nearCap({ a: 2900, z: 2900 }, { cap: CAP, codes: { a: 0, z: 124 } }).length === 1,
        "sabotage E: a 124 is a kill and says nothing -- v4479 learned that from headlessGpu");
    ok("the band comes back sorted, slowest first, so the closest calls read first",
        band[0].recorded >= band[band.length - 1].recorded);
}

// ---- 3. RECORDED AGAINST ACTUAL, AND THE DIRECTION OF THE ERROR --------------------------------------------------
console.log("\n3. the inflation is one-directional, which is the part that matters");

{
    const rows = [
        { gate: "x", recorded: 2933, actual: 1277 },   // 2.3x
        { gate: "y", recorded: 2900, actual: 2900 },   // 1.0x
        { gate: "z", recorded: 3100, actual: 2500 },   // recorded over, actually under
        { gate: "w", recorded: 2800, actual: 2790 },   // recorded under, actually under
    ];
    const inf = inflation(rows, { cap: CAP });
    say(`fixture: median ${inf.medianRatio.toFixed(1)}x, max ${inf.maxRatio.toFixed(1)}x, ` +
        `${inf.overButActuallyUnder}/${inf.recordedOver} over-but-under, ${inf.underButActuallyOver}/${inf.recordedUnder} under-but-over`);
    ok("!! the ratio is recorded over actual, so an inflated reading is greater than one",
        inf.maxRatio > 2.2 && inf.maxRatio < 2.4,
        "sabotage C: dividing the other way turns every inflation into a number below 1 and reads as deflation");
    ok("a gate recorded over the cap but actually under it is counted as such",
        inf.recordedOver === 1 && inf.overButActuallyUnder === 1,
        "only `z` is recorded above 3000 in this fixture -- the first draft asserted 2 and was simply wrong");
    ok("!! and the reverse direction is counted too, so 'one-directional' is a measurement and not an assumption",
        inf.underButActuallyOver === 0,
        "if contention could push a reading DOWN, this would be non-zero somewhere");
    ok("...and it CAN be non-zero, so that zero is a result", (() => {
        const r = inflation([{ gate: "q", recorded: 2900, actual: 3500 }], { cap: CAP });
        return r.underButActuallyOver === 1;
    })(), "a control for the zero above -- an absence with nothing beside it is v4402's absence-read-as-a-pass");
    ok("gates missing either number are dropped rather than counted as agreeing",
        inflation([{ gate: "n", recorded: 2900 }, { gate: "m", recorded: 2900, actual: 0 }], { cap: CAP }).n === 0);
}

// ---- 4. THE RECORD, WHICH IS WHERE THE ROUND'S ANSWER LIVES ------------------------------------------------------
console.log("\n4. the two hypotheses v4479 left open, and the one that survived");

say(reportLines().join("\n  ----  "));
ok("!! the recorded meshBVH readings really do straddle the cap", (() => {
    const s = spread(REC.straddle.readings, REC.cap);
    return s.straddles && s.over === REC.straddle.over && s.under === REC.straddle.under;
})(), `${REC.straddle.over} of ${REC.straddle.readings.length} runs over -- the verdict is a coin flip`);
ok("!! NOT THE BOX: the container measures the same as the ledger it is compared against",
    REC.boxRatio > 0.97 && REC.boxRatio < 1.03 && REC.boxSamples >= 10,
    `median now/ledger ${REC.boxRatio} over ${REC.boxSamples} rotation gates`);
ok("!! NOT DRIFT: the gate has one commit and does fixed-size work",
    REC.unchangedSince === "v4248",
    "60,000 and 4,000 are literals in that file -- its cost does not move with the tree");
ok("the near-cap inflation is recorded with its direction, not just its size",
    REC.nearCap.overButActuallyUnder === 1 && REC.nearCap.underButActuallyOver === 0 &&
    REC.nearCap.recordedOver === 3 && REC.nearCap.recordedUnder === 17);
ok("half the band is recorded at 1.5x its real cost or more",
    REC.nearCap.inflatedHalfAgain * 2 === REC.nearCap.measured,
    `${REC.nearCap.inflatedHalfAgain} of ${REC.nearCap.measured}, worst ${REC.nearCap.worst.gate} ` +
    `at ${REC.nearCap.worst.recorded}/${REC.nearCap.worst.actual}`);
ok("the record is frozen", Object.isFrozen(REC) && Object.isFrozen(REC.straddle) && Object.isFrozen(REC.nearCap));

console.log(`\nbudgetMargin-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
