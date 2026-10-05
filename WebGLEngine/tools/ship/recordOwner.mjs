// WebGLEngine/tools/ship/recordOwner.mjs -- v4813
//
// WHO OWNS tools/ship/sweep-timings.json, AND WHAT ITS MEMBERSHIP LINE MEANS IN THAT OWNER'S STOPWATCH.
//
// The handover table lived in quickSweep.mjs from v4778. It moved here at v4813 because sweepCoverage,
// recordReach and declaredCost now need the owner's budget too, and quickSweep already imports
// sweepCoverage -- a reader importing quickSweep back would be a cycle. quickSweep re-exports all of it, so
// every existing `import { RECORD_HANDOVERS, ownerOf } from "./quickSweep.mjs"` reads the same objects.
// No imports: this is a leaf, which is the whole point of the move.

// *** v4778 -- THE OWNER BOX RETIRED, SO OWNERSHIP MOVES BY A DATED RECORD, NEVER BY EDITING `host`. ***
//
// boxTimings.mjs's v4679 header saw this coming: the record's host is "a LINUX 4-core container ... ephemeral
// and gone, and a new one hashes differently because boxId() includes an md5 of the CPU model". At v4778 it
// happened. The container restarted mid-round as linux-x64-4c-16096mb-420793, the shared record still named
// linux-x64-4c-16096mb-142c0d, and every writer here refused it -- correctly -- so the rotation that
// capReading, sweepCoverage and recordReach read could no longer be recorded by anyone, on any box.
//
// The one-line fix, rewriting `host` to the new box, is the thing v4647 exists to forbid: it would file one
// machine's runtimes under another's name. A handover is different in kind -- it says WHO may write next and
// leaves every existing entry attributed to the box that measured it (each carries its own `at`). Keith chose
// the rig as the new owner at v4778, because it is the only box that persists: a sandbox changes silicon on
// every restart, so handing the record to one would strand it again at the next. Every other box, the retired
// one included, keeps writing its own file.
//
// The chain is followed, so a later handover appends a row rather than editing this one, and a box that has
// handed the record on is refused like any stranger -- two owners is the defect, not a convenience.
export const RECORD_HANDOVERS = Object.freeze([
    Object.freeze({ at: "v4778", from: "linux-x64-4c-16096mb-142c0d", to: "win32-x64-12c-32678mb-b70b27",
        decidedBy: "Keith",
        evidence: "142c0d is the host of every sandbox reading from v4647 to the post-merge full sweep of " +
                  "2026-09-29T03:33Z; the container restarted at about 15:20Z and came back as 420793. The rig's " +
                  "id is read off its own v4777 clone verify, where it reports itself 13 times.",
        // v4813: the last moment the OLD box wrote this record. An entry stamped after it was taken on the new
        // owner's stopwatch, one at or before it on the old one's. Read off the record at 4c904f50: its
        // `captured` is this instant and 1,481 entries carry it; nothing between it and the rig's first write.
        fromLastWriteAt: "2026-09-29T03:33:20.949Z",
        // v4813, Keith's decision: the membership line moves with the owner. See membershipBudgetMs below.
        budgetScale: 1.57,
        budgetEvidence: "345 gates timed ALONE by the rig at edf582b6 (2026-10-05, two clone verifies of " +
                  "4c904f50) that the sandbox had timed under 3000 ms at 4c904f50: rig/sandbox p25 1.10, " +
                  "MEDIAN 1.57, p75 2.05. Over all 1,109 pairs, loaded included, the median is 1.38. Checked " +
                  "against the population it is meant to keep: at 3000 x 1.57 the rig record leaves 468 of " +
                  "1,926 gates outside the sweep, against the 464 the sandbox left at 3000." }),
]);

/** The box that may write a record whose `host` reads `host`, after following every handover. */
export function ownerOf(host, handovers = RECORD_HANDOVERS) {
    let h = host;
    const seen = new Set();
    for (;;) {
        const next = handovers.find((x) => x.from === h);
        if (!next || seen.has(h)) return h;
        seen.add(h);
        h = next.to;
    }
}

// *** v4813 -- THE MEMBERSHIP LINE IS IN THE OWNER'S STOPWATCH, AND AT v4778 THE OWNER CHANGED. ***
//
// quickSweep's 3000 ms was measured at v4303 on the sandbox and every reading in this record was the sandbox's
// until the handover. The rig's first two clone verifies of 4c904f50 re-timed 1,482 gates in ITS milliseconds
// and evicted 152 of them on the second crossing -- every one confirmed ALONE, none a loaded artefact -- so the
// population outside the ship-time sweep went from 464 to 606 and three ratchets that were frozen on the
// sandbox's population went red (recordReach 76/50, declaredCost 167/138, sweepCoverage on four rows). No gate
// had changed; the stopwatch had.
//
// Keith chose between two answers at v4813. Keep 3000 on the rig, so ~150 more gates run only in the full sweep
// and the three ratchets must be raised to match; or move the line with the owner, so the same gates are
// checked at ship time and verify costs about 1-2 minutes more. He chose the second.
//
// *** THIS IS NOT THE SCALING hostScale-selfcheck's CONTROL REFUSES, AND THE DIFFERENCE IS THE POINT. *** That
// row refuses to scale the budget by the box that happens to be RUNNING ("a slower machine should run FEWER
// gates"), and it still holds: a foreign box reads the owner's line unchanged, and nothing here asks which
// machine this is. What scales is the record's OWNER, by one number frozen in a dated row with its evidence --
// a property of whose milliseconds the record holds, not of who is reading it. Nor is it v4536's rejected
// reference workload (sweepCoverage.BUDGET_DRIFT_V4536): no reading is normalised, every entry stays in the
// milliseconds that measured it, and the scale is two boxes compared on the same gates once, not a live
// probe dividing every number every hour. The spread v4536 measured is real here too (p25 1.10, p75 2.05), so
// individual gates still cross the line in both directions; what the median preserves is the POPULATION.
//
// An old box's entries are compared against the same line and are not converted: 34 sandbox readings sit
// between 3000 and 4710 ms, about 128 s of work, and the next owner sweep re-times them into its own
// milliseconds. Converting them instead would put a guessed number in a record of measured ones.
export function membershipBudgetMs(record, { handovers = RECORD_HANDOVERS, base = 3000 } = {}) {
    const host = record && record.host;
    if (!host) return base;
    const owner = ownerOf(host, handovers);
    const h = [...handovers].reverse().find((x) => x.to === owner && Number.isFinite(x.budgetScale));
    return h ? Math.round(base * h.budgetScale) : base;
}

// Which box's stopwatch took this entry, as the scale of that box against the first owner: 1 for a reading
// taken before any scaled handover, the handover's budgetScale for one stamped after the old box's last write.
// For a reader comparing a reading against a claim made on the FIRST box (declaredCost's headers were all
// measured in the sandbox), not for membership -- membership compares raw readings against the line above.
// An entry with no ISO stamp ("unknown -- before v4408") predates every handover and is the first box's.
export function readingScale(record, gate, { handovers = RECORD_HANDOVERS } = {}) {
    const at = record && record.at && record.at[gate];
    if (typeof at !== "string" || !/^\d{4}-\d\d-\d\dT/.test(at)) return 1;
    let scale = 1;
    for (const h of handovers) if (Number.isFinite(h.budgetScale) && h.fromLastWriteAt && at > h.fromLastWriteAt) scale = h.budgetScale;
    return scale;
}
