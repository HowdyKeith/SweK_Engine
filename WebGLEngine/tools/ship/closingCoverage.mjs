// tools/ship/closingCoverage.mjs -- v4456
//
// *** THE SWEEP LEDGER COUNTS GATES AND NEVER NAMES THEM, SO A DUPLICATE CLOSING IS A CREDIT RATHER THAN AN
// ERROR. *** main is carrying a gate, reportDoors-selfcheck.mjs, landed by an in-flight round on the other
// branch with no closing written for it, so gateSweep-selfcheck reads "1 STILL UNSWEPT" on the trunk right
// now. *** THE HAZARD IS NOT HYPOTHETICAL AND IT ALMOST HAPPENED THIS ROUND. *** The obvious repair
// -- write the closing here -- is the one thing that must not be done blind, because when that round ships it
// will write its own closing for the same gate. Two closings, one gate. The question is what the ledger does
// about that, and the answer is NOTHING, in a way that is worse than merely missing it.
//
// ---- *** THE ARITHMETIC IS A SUM, AND A SUM CANNOT TELL DOUBLE-COUNTING FROM COVERAGE *** -------------------
//
// gateSweep-selfcheck's coverage line is
//
//     uncovered = (gatesNow - 1366 - 1) - SWEEP_SINCE_V4297.swept - sum(closing.swept)      and asserts <= 0
//
// Every term is a COUNT. `added` holds the names, and the check never reads them. Measured against the real
// ledger (1480 gates on disk, 98 summed, 14 since, 1366 at v4297):
//
//     today, as the ledger stands                  uncovered =  1   FAIL   <- reportDoors, correctly red
//     two branches both close the SAME gate        uncovered =  0   PASS   <- THE RED GOES AWAY
//     one gate added and nobody sweeps it          uncovered =  2   FAIL
//     duplicate AND a second unswept gate          uncovered =  1   FAIL, reporting the wrong number
//
// *** THE SECOND ROW IS NOT A FUTURE RISK, IT IS THIS WEEK'S RED TURNING GREEN. *** And the fourth is worse
// than a wrong pass: two unswept gates and one duplicate read as "1 STILL UNSWEPT", a message that names no
// file, so the reader goes looking for one problem and there are three.
//
// A duplicate does not merely double-count once. It buys a PERMANENT CREDIT of one against every future
// unswept gate, because `<= 0` can never go red no matter how far over the sum runs. The check is built so
// that over-counting is not an error condition at all.
//
// ---- *** THE FIX IS THE TREE'S OWN RULE, WHICH THIS LINE IS THE LAST PLACE NOT TO FOLLOW *** ----------------
//
// v4399: FREEZE BY NAME, NOT BY COUNT. v4402: an absence read as a skip is an absence read as a pass. The
// ledger already HOLDS the names -- every closing carries `added` -- and gateSweep-selfcheck already asserts
// `added.length === swept` per closing, so the names and the counts are pinned to each other one closing at a
// time. What nobody checked is the union: that across ALL closings the names form a SET, that every name in it
// is a file that exists, and that the gates on disk minus the baseline are covered EXACTLY ONCE.
//
// So this module answers with sets and reports members, never a total on its own. Everything is injectable --
// the ledger, the v4297 record, the gate list -- because a check for double-counting that cannot be handed a
// double-counted ledger is a check nobody has run. That is v4435's and v4447's species and this tree has now
// found it five times.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ------------------------------------------------------------------------
//
// That the 1366 gates swept at v4297 are covered by name. They are not: that record is a count and rebuilding
// its membership after the fact would be fabrication. Coverage here is asserted only over the SURPLUS -- gates
// on disk beyond the v4297 population -- which is exactly the region the closings were invented to account
// for. `baselineByName` is reported as false so the limit is on the page rather than in this comment alone.
//
// *** AND ONE OBSERVATION ABOUT THE REGISTRY, FOUND BY BEING LIFTED INTO IT. *** registryOrphans'
// `headerClaim` drops any line matching /^tools\/|^physics\/|^WebGLEngine\//, on the reasoning that the path
// banner is not a claim -- but the filter runs over EVERY line, not just the first. This header originally
// opened its second paragraph with a filename, and the lifted claim came back as "main is carrying written
// for it", a sentence with its middle silently removed. Reworded here rather than repaired there, because the
// fix belongs to that gate and a mangled key would have been the more expensive thing to leave. Recorded so
// the next module lifted into the registry knows not to start a line with a path.
//
// That a gate named by one closing was actually RUN by that round. The ledger is a record somebody wrote, and
// this reads the record. What it rules out is arithmetic that cannot distinguish a covered tree from a
// double-counted one -- which is a smaller claim and a checkable one.

import fs from "fs";
import path from "path";
import * as GS from "./gateSweep.mjs";

export const ENG = GS.ENG;

/** The closings in ordinal order, read off the record rather than typed -- v4381's rule, one level down. */
export function closingsOf(ledger = GS.SWEEP_SINCE_V4297) {
    return Object.keys(ledger)
        .filter((k) => /^since\d+$/.test(k))
        .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
        .map((k) => ({ key: k, ...ledger[k] }));
}

/**
 * Coverage of the post-v4297 surplus, by NAME. Every input is injectable so the gate can hand this a ledger
 * that double-counts and watch what it says, rather than asserting about source text.
 *
 *   ledger  SWEEP_SINCE_V4297, or a synthetic one shaped like it
 *   base    SWEEP_V4297, or { swept } -- the baseline population, a count and only a count
 *   gates   the gate paths on disk; defaults to gateSweep's own enumeration, never a second walker
 */
export function coverage({ ledger = GS.SWEEP_SINCE_V4297, base = GS.SWEEP_V4297, gates = null } = {}) {
    const onDisk = gates || GS.enumerateGates(ENG);
    const onDiskSet = new Set(onDisk);
    const closings = closingsOf(ledger);

    // who claims what -- the attribution is the point, because "there is a duplicate" is not actionable and
    // "since41 and since72 both claim X" is.
    const claimedBy = new Map();
    for (const c of closings)
        for (const g of (c.added || [])) {
            if (!claimedBy.has(g)) claimedBy.set(g, []);
            claimedBy.get(g).push(c.key);
        }

    const duplicates = [...claimedBy].filter(([, by]) => by.length > 1).map(([gate, by]) => ({ gate, by }));
    const phantom = [...claimedBy.keys()].filter((g) => !onDiskSet.has(g) && !fs.existsSync(path.join(ENG, g)));

    const summed = closings.reduce((n, c) => n + (c.swept || 0), 0);
    const distinct = claimedBy.size;
    const surplus = onDisk.length - (base.swept + 1);          // +1: gateSweep's own gate, as it has always been
    const since = ledger.swept || 0;

    return Object.freeze({
        onDisk: onDisk.length,
        baselineSwept: base.swept,
        baselineByName: false,          // stated, not implied -- see the header's limits
        sinceSwept: since,
        closings: closings.length,
        surplus,
        summed,
        distinct,
        duplicates: Object.freeze(duplicates),
        phantom: Object.freeze(phantom),
        // the two arithmetics, side by side. They agree exactly when the names form a set.
        summedUncovered: surplus - since - summed,
        distinctUncovered: surplus - since - distinct,
        // *** the whole finding in one boolean ***
        creditFromDuplicates: summed - distinct,
        claimedBy,
    });
}

/**
 * Gates on disk that no closing names, as NAMES. gateSweep-selfcheck reports this as an integer and tells the
 * reader to "name them and run them"; the ledger has held the names all along.
 *
 * Only the surplus is nameable -- see the header. So this cannot return "the uncovered set" outright; it
 * returns the gates no closing claims, of which `baselineSwept` many are legitimately covered by the v4297
 * count. It is therefore a SUPERSET, and says so, which is why the gate uses it for attribution and the
 * arithmetic for the verdict.
 */
export function unclaimedOnDisk(opts = {}) {
    const c = coverage(opts);
    const gates = opts.gates || GS.enumerateGates(ENG);
    return gates.filter((g) => !c.claimedBy.has(g));
}

/** A ledger with one gate claimed twice, for driving the check that is supposed to notice. */
export function withDuplicate(gate, ledger = GS.SWEEP_SINCE_V4297, key = "since9001") {
    return { ...ledger, [key]: Object.freeze({
        at: "synthetic", swept: 1, green: 1, red: 0,
        added: Object.freeze([gate]), redOnArrival: Object.freeze([]), widened: Object.freeze([]),
        verdict: "a fixture: a second closing claiming a gate another closing already claims",
    }) };
}

export function reportLines() {
    const c = coverage();
    const L = [];
    L.push("closing coverage -- the ledger's names, as a set");
    L.push("  gates on disk: " + c.onDisk + " (baseline " + c.baselineSwept + " by COUNT, not by name)");
    L.push("  closings: " + c.closings + "; names " + c.summed + "; distinct " + c.distinct);
    L.push("  duplicate claims: " + (c.duplicates.length
        ? c.duplicates.map((d) => d.gate.split("/").pop() + " by " + d.by.join(" and ")).join("; ")
        : "none"));
    L.push("  claimed but not on disk: " + (c.phantom.length ? c.phantom.join(", ") : "none"));
    L.push("  uncovered by the SUM: " + c.summedUncovered + "; by DISTINCT NAMES: " + c.distinctUncovered);
    L.push("  credit bought by duplicates: " + c.creditFromDuplicates +
           (c.creditFromDuplicates ? "  *** this many future unswept gates would pass unseen ***" : ""));
    return L;
}

export const COVERAGE_AT_V4456 = Object.freeze({
    // Measured on the trunk the round opened against: main at 72ab924, three unnumbered commits ahead of v4453.
    onDisk: 1480, baselineSwept: 1366, sinceSwept: 14, closings: 75, summed: 98, distinct: 98,
    duplicates: 0, phantom: 0,
    summedUncoveredThen: 1,          // reportDoors-selfcheck.mjs, landed with no closing
    // The four rows the header states, as (summedDelta, gatesDelta) -> what the OLD check would have said.
    cancellation: Object.freeze([
        Object.freeze({ what: "as it stands", dSummed: 0, dGates: 0, uncovered: 1, oldCheck: "FAIL" }),
        Object.freeze({ what: "two branches close the same gate", dSummed: 2, dGates: 1, uncovered: 0, oldCheck: "PASS" }),
        Object.freeze({ what: "a gate nobody sweeps", dSummed: 0, dGates: 1, uncovered: 2, oldCheck: "FAIL" }),
        Object.freeze({ what: "both at once", dSummed: 2, dGates: 2, uncovered: 1, oldCheck: "FAIL, wrong number" }),
    ]),
});
