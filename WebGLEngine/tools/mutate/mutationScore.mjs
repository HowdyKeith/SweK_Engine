// WebGLEngine/tools/mutate/mutationScore.mjs -- v4386
//
// *** THE MUTATION SCORE WAS PROSE, AND PROSE ROTS SILENTLY. ***
//
// tools/mutate/scan.mjs opened with "mutate.mjs runs ten mutations and catches all ten" -- a number written
// into a comment, never recorded, and never re-derived. It had been FALSE since v4162, and here is the chain:
//
//   * v4162 rewrote physics/sph/sph.js's shadow amplitude from Math.pow(o.h, 3) to (h * h * h). Same
//     arithmetic, different text, and a comment in that very commit explains why -- pow and multiplication need
//     not agree bit-for-bit. Nothing wrong with the change.
//   * The mutation for that constant looks for its find-string VERBATIM. A find-string is a COPY of source
//     text, not a reference to it, so the mutation stopped applying that day and stayed dead for 223 versions.
//   * tools/ship/mutationTable-selfcheck.mjs -- built at v2884 for exactly this rot, and whose header already
//     records a PREVIOUS occurrence of it (Math.pow(h, 6) -> _p6(h) in kernels.js) -- CAUGHT IT AND NAMED IT.
//     Then it stood red from v4279 to v4385: 106 versions of rounds shipping ALL GREEN past a register entry.
//
// So the harness was honest (mutate.mjs has a STALE branch and excludes a dead mutation from the score), the
// gate was right, and the only thing that failed was that nobody read it. A number in a comment cannot be
// checked by anything; a number in a record can.
//
// ---- WHAT THIS RECORD HAS TO SURVIVE, WHICH IS THE SAME ROT ONE LEVEL UP ---------------------------------------
//
// A recorded score is itself a claim about a tree, and it can go stale in exactly the two ways the find-string
// did. Both are made detectable rather than hoped about:
//
//   1. THE TABLE CHANGED. tableFingerprint() hashes every mutation's name, file, find, replace and breaks. Edit
//      any mutation and the fingerprint moves, and the gate refuses the record BY NAME instead of reporting a
//      score measured on a table that no longer exists.
//   2. THE CODE UNDER TEST CHANGED. `commit` is the HEAD the run was taken at, and the gate asks git whether any
//      TARGET FILE has changed since. That is precisely the v4162 event: sph.js changed, the score became a
//      statement about a tree that was gone, and nothing anywhere noticed. Now something does.
//
// *** WHAT THIS DELIBERATELY DOES NOT DO IS FAIL ON AGE. *** A score N versions old is not wrong, it is just
// older; failing on a version count would make every round either re-run a fifteen-minute suite or edit a
// number to go green, and this tree has already learnt what an editable threshold is worth. The trigger is a
// CHANGE TO A FILE THE SCORE IS ABOUT, which is the event that actually invalidates it.
"use strict";

import { createHash } from "node:crypto";

/**
 * The fingerprint of a mutation table. Every field a mutation can differ in goes in, in a stated order, so a
 * changed `replace` invalidates a score just as surely as a changed `file` -- a mutation that breaks something
 * ELSE is a different experiment even where the find-string is untouched.
 */
export function tableFingerprint(mutations) {
    const h = createHash("sha256");
    for (const m of [...mutations].sort((a, b) => a.name.localeCompare(b.name))) {
        h.update(m.name + " " + m.file + " " + m.find + " " + m.replace + " " + m.breaks + " ");
    }
    return h.digest("hex").slice(0, 16);
}

/** The files a table touches -- what the gate asks git about. Derived from the table, never listed by hand. */
export const targetsOf = (mutations) => [...new Set(mutations.map((m) => m.file))].sort();

/**
 * *** THE RECORD. MEASURED, NOT ASSERTED. ***
 *
 * Produced by `node tools/rig/run-mutate.mjs` at the commit below: each mutation costs a full verify and the
 * control costs one more. Every state here was printed by that run.
 *
 * The 10/10 is the FIRST TIME THIS NUMBER HAS BEEN TRUE SINCE v4162, and it is worth being precise about what
 * it does and does not mean. It does NOT mean the fluid-shadow behaviour was unguarded and is now guarded --
 * the restored mutation was CAUGHT on its first real run, so the net had that hole covered the whole time.
 * What was broken was the MEASUREMENT of it. The suite had been reporting nine experiments and one abstention
 * as though the abstention were a result.
 */
export const SCORE = Object.freeze({
    version: "v4385",
    commit: "24588e1c1e864388c7910e64aefe599629228f42",
    tableFingerprint: "02c74cac86aa6bfe",
    states: Object.freeze({
        "poly6's normalising constant is wrong by one part in 315": "CAUGHT",
        "the spiky kernel's constant is off by 1/15": "CAUGHT",
        "SPH pressure loses its density symmetry (momentum invented)": "CAUGHT",
        "the metaball shadow constant 32/35 becomes 33/35": "CAUGHT",
        "the fluid's shadow amplitude drops its 315/64pi": "CAUGHT",
        "FDTD's electric update loses its 1/eps": "CAUGHT",
        "the Ewald arc forgets it is an arc (flat = the slice theorem)": "CAUGHT",
        "lockstep stops resending inputs (v2493's fatal bug, restored)": "CAUGHT",
        "lockstep accepts inputs for ticks it already stepped": "CAUGHT",
        "the policy store accepts a worse policy": "CAUGHT",
    }),
    note: "the first run in which all ten mutations actually mutated something since v4162",
});

/**
 * Does the record still describe this tree? Returns the reasons it does not, so a caller reports which of the
 * two rots happened rather than a bare false.
 */
export function staleReasons(score, mutations, changedTargets = []) {
    const out = [];
    const fp = tableFingerprint(mutations);
    if (fp !== score.tableFingerprint) {
        out.push("the mutation table has changed since the score was taken (" +
                 score.tableFingerprint + " -> " + fp + ")");
    }
    const recorded = Object.keys(score.states).sort(), live = mutations.map((m) => m.name).sort();
    const gone = recorded.filter((n) => !live.includes(n)), added = live.filter((n) => !recorded.includes(n));
    if (gone.length) out.push("scored mutations no longer in the table: " + gone.join(", "));
    if (added.length) out.push("mutations in the table with no score: " + added.join(", "));
    if (changedTargets.length) {
        out.push("files the score is ABOUT have changed since " + score.commit.slice(0, 7) + ": " +
                 changedTargets.join(", "));
    }
    return out;
}

/**
 * The arithmetic, DERIVED from the states rather than carried beside them.
 *
 * *** THE FIRST DRAFT OF SCORE CARRIED caught/survived/stale/total AS FIELDS, AND THAT IS THE SAME DEFECT THIS
 * FILE EXISTS TO FIX, ONE SIZE SMALLER: *** a total typed next to the rows it totals can disagree with them,
 * and then the summary is prose again. There is one place the numbers live and it is the states map.
 */
export function tally(score) {
    const s = Object.values(score.states);
    return {
        caught: s.filter((v) => v === "CAUGHT").length,
        survived: s.filter((v) => v === "SURVIVED").length,
        stale: s.filter((v) => v === "STALE").length,
        total: s.length,
    };
}
