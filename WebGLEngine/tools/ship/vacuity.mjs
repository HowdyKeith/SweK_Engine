// tools/ship/vacuity.mjs -- v4459 -- the 0-RED sabotage, and why it cannot be found by scanning.
//
// *** THIS TREE'S STANDING RULE IS "A CONTROL THAT CANNOT FAIL IS DECORATION", AND ONE SESSION PRODUCED FOUR
// INSTANCES OF IT IN GATES WRITTEN THAT SAME SESSION. *** Every one surfaced the same way and only that way:
// a sabotage that went 0 RED. The ship ritual already says a 0-RED sabotage is a finding rather than a pass.
// What it does not say -- and what cost four rounds to learn -- is that THE SYMPTOM IS ONE AND THE CAUSES ARE
// FOUR, so there is nothing to search for.
//
// ---- *** THE FOUR MECHANISMS, EACH FROM A REAL INSTANCE *** ------------------------------------------------
//
//   1. THE COLLECTION IS EMPTY.       `xs.every(p)` is true of nothing. reportDoors' NEVER_CALL guard passed
//                                     with the list emptied; knobLiveness's "not reached is not dead" passed
//                                     on a census that produced zero rows. THE ONLY MECHANICALLY PREVENTABLE
//                                     ONE, and overNonEmpty below is the prevention.
//   2. THE POPULATION NEVER PRODUCES THE INPUT.   contractOf's four failure branches are unreachable from a
//                                     population in which every member returns a well-formed report. The
//                                     collection is not empty; the BRANCH is never entered. Fixed by
//                                     fixtures, which is a different repair entirely.
//   3. AN EARLIER TEST ALREADY IMPLIES IT.        The BTDF's chi+ back-face check: with the half-vector up
//                                     and the incident side positive, the outgoing side follows, so deleting
//                                     it changed nothing on 460,800 configurations. It became reachable only
//                                     when the PREDICATE was corrected for the other index direction.
//   4. THE HARNESS CORRUPTED WHAT IT MEASURED.    Not an assertion at all: a sabotage runner that edited two
//                                     modules and restored a third, so the next two sabotages AND the closing
//                                     baseline were taken on a damaged tree and read 0.
//
// ---- *** AND THE SCAN IS REFUSED, WITH THE NUMBER AS THE REASON *** ----------------------------------------
//
// The obvious instrument is a census of assertions that rest on `.every(`, `.length === 0` or `!xs.length`.
// MEASURED ACROSS THE TREE: 3,206 such assertions in 948 of 1,482 gates -- SIXTY-FOUR PER CENT OF THE GATES.
// A scanner that cried wolf three thousand times would be switched off in a week, which orphanScan's header
// says in as many words about its own 113 candidates. AND IT WOULD BE WRONG BY CONSTRUCTION ANYWAY: whether
// `xs.every(p)` is vacuous is a fact about xs AT RUN TIME, and mechanisms 2, 3 and 4 are not that shape at all.
//
// SO THE INSTRUMENT IS THE SABOTAGE, WHICH THE TREE ALREADY REQUIRES, AND WHAT THIS FILE ADDS IS THE READING:
// a 0-RED result names one of four different repairs, and picking the wrong one leaves the guard decorative.
"use strict";

/**
 * True only if `list` is non-empty AND every member satisfies `pred`.
 *
 * *** THE POINT IS THE EMPTY CASE, WHICH IS WHY THIS EXISTS RATHER THAN `xs.every(p)`. *** An assertion built
 * on every() reports success when the list it was given is empty, which is the commonest way a guard in this
 * tree stops being able to fail. Use it wherever the collection is DERIVED -- from a registry, a census, a
 * filter -- because that is exactly where it can silently become empty later.
 */
export const overNonEmpty = (list, pred) => Array.isArray(list) && list.length > 0 && list.every(pred);

/** The same for a list that must stay empty: empty is the PASS, so the guard is that it was ever populated. */
export const emptyOfNonEmpty = (list, source) =>
    Array.isArray(list) && Array.isArray(source) && source.length > 0 && list.length === 0;

export const VACUITY_AT_V4459 = Object.freeze({
    at: "v4459",
    symptom: "a sabotage that goes 0 RED",
    mechanisms: Object.freeze([
        Object.freeze({ kind: "empty collection", instance: "reportDoors NEVER_CALL, knobLiveness rows",
                        repair: "overNonEmpty, or assert the population size beside the predicate" }),
        Object.freeze({ kind: "population never produces the input", instance: "contractOf's failure branches",
                        repair: "fixtures, one per branch" }),
        Object.freeze({ kind: "implied by an earlier test", instance: "the BTDF chi+ back-face check",
                        repair: "correct the predicate until the branch is reachable, or delete it" }),
        Object.freeze({ kind: "the harness corrupted what it measured", instance: "a sabotage runner restoring the wrong file",
                        repair: "restore the file that was edited, and re-take the baseline" }),
    ]),
    scanRefused: "3,206 assertions resting on .every( / .length === 0 / !xs.length, in 948 of 1,482 gates -- " +
                 "64% of them. A census that flags two thirds of the tree is orphanScan's 113 candidates again, " +
                 "and vacuity is a run-time fact about the collection rather than a shape in the source, so " +
                 "three of the four mechanisms are invisible to it in principle.",
});

/** Front door: this module is a member of the reportLines convention it was written alongside. */
export function reportLines() {
    const L = [];
    L.push("[vacuity] the 0-RED sabotage: one symptom, four causes, and no scanner");
    L.push("");
    for (const m of VACUITY_AT_V4459.mechanisms) {
        L.push("  " + m.kind);
        L.push("      seen in   " + m.instance);
        L.push("      repair    " + m.repair);
    }
    L.push("");
    L.push("  the scan is REFUSED: " + VACUITY_AT_V4459.scanRefused);
    return L;
}
