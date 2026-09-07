// tools/ship/vacuity-selfcheck.mjs -- v4459 -- the gate for tools/ship/vacuity.mjs.
//
// *** A FILE ABOUT CONTROLS THAT CANNOT FAIL HAD BETTER NOT SHIP ONE. *** Every check here is driven on a
// fixture that makes its branch reachable, because the subject of this module is exactly the failure of
// writing an assertion whose input never arrives.
//
// ---- *** SABOTAGES, RESULTS BY NAME *** ---------------------------------------------------------------------
//
//   A. overNonEmpty stops rejecting the empty list           -> 1 RED
//   B. overNonEmpty ignores the predicate                    -> 1 RED
//   C. emptyOfNonEmpty drops the populated-source requirement -> 1 RED
//   D. a mechanism is dropped from the record                -> 1 RED
//   E. the refused-scan number loses its denominator          -> 1 RED
//
// These were written as 2/1/1/2/1 before they were run. THE MEASURED ANSWER IS 1/1/1/1/1, and the difference
// is the whole habit this file is about: a number stated from the armchair, in a header about controls that
// cannot fail, in the round that found four of them.
"use strict";

import { overNonEmpty, emptyOfNonEmpty, VACUITY_AT_V4459 as REC, reportLines } from "./vacuity.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("vacuity-selfcheck -- one symptom, four causes, and the scan that is refused\n");

// ---- 1. THE ONE MECHANISM THAT CAN BE PREVENTED ------------------------------------------------------------
console.log("1. overNonEmpty, driven on the case that motivates it");
{
    const truthy = () => true;
    ok("!! *** THE EMPTY LIST IS THE WHOLE POINT: every() says yes and overNonEmpty says no ***",
       [].every(truthy) === true && overNonEmpty([], truthy) === false,
       "`[].every(p)` is TRUE -- that is the language being correct about the empty set, and it is why a guard " +
       "built on it stops being able to fail the moment its collection empties. reportDoors' never-call list " +
       "and knobLiveness's row census both did exactly that, in the same session, in gates written that session.");
    ok("...and a populated list still behaves like every()",
       overNonEmpty([1, 2, 3], (x) => x > 0) === true && overNonEmpty([1, -2], (x) => x > 0) === false,
       "true for all-pass, false for any-fail -- so adopting it is a strictly stronger assertion, not a different one");
    ok("...and it refuses a non-array rather than throwing",
       overNonEmpty(null, truthy) === false && overNonEmpty(undefined, truthy) === false,
       "a guard whose collection went missing entirely must fail, not crash the gate around it");

    // The mirror case: sometimes EMPTY is the pass, and then the guard is that the source was ever populated.
    ok("!! emptyOfNonEmpty: empty is the pass, so the SOURCE has to be non-empty for the check to mean anything",
       emptyOfNonEmpty([], [1, 2]) === true && emptyOfNonEmpty([], []) === false && emptyOfNonEmpty([1], [1, 2]) === false,
       "\"no offenders\" over a population of zero is the same defect wearing the opposite sign -- it is how a " +
       "census that stopped enumerating reports a clean tree");
}

// ---- 2. THE RECORD IS FOUR MECHANISMS, NOT ONE, WHICH IS WHY THERE IS NO SCANNER --------------------------
console.log("\n2. the record");
{
    say(`${REC.mechanisms.length} mechanisms recorded, each with an instance and its own repair`);
    for (const m of REC.mechanisms) say(`  ${m.kind}  --  ${m.repair}`);
    ok("!! *** FOUR MECHANISMS, FOUR DIFFERENT REPAIRS, ONE IDENTICAL SYMPTOM ***",
       REC.mechanisms.length === 4 && new Set(REC.mechanisms.map((m) => m.repair)).size === 4 &&
       REC.mechanisms.every((m) => m.kind && m.instance && m.repair),
       "a 0-RED sabotage names one of four repairs and the reading does not say which. Picking the wrong one " +
       "leaves the guard decorative -- fixtures will not fix an empty collection, and overNonEmpty will not " +
       "fix a branch an earlier test already implies.");
    ok("...and every mechanism carries a real instance rather than a category",
       REC.mechanisms.every((m) => /reportDoors|knobLiveness|contractOf|BTDF|harness|runner/.test(m.instance)),
       "each one happened, in this tree, in one session -- a taxonomy with no instances is a guess about " +
       "what might go wrong");
    ok("!! the refused scan carries its denominator, not just its count",
       /3,206/.test(REC.scanRefused) && /948/.test(REC.scanRefused) && /1,482/.test(REC.scanRefused) &&
       /64%/.test(REC.scanRefused),
       "3,206 of them across 948 of 1,482 gates. THE NUMBER IS THE ARGUMENT: a census flagging two thirds of " +
       "the tree is refused for the same reason orphanScan refused its own first draft at 113.");
    ok("...and the front door reports the same four rather than a second list",
       (() => { const L = reportLines(); return REC.mechanisms.every((m) => L.some((x) => x.includes(m.kind))); })(),
       "the report is DERIVED from the record, so a mechanism added to one appears in the other by construction");
}

console.log(`\nvacuity-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
