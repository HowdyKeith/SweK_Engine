// ===================================================================
// math/solverFit.mjs -- v4262
// -------------------------------------------------------------------
// *** DOES A SUBLINEAR SOLVER FIT ANYTHING THIS TREE ACTUALLY DOES? ***
//
// Backlog #133 named ruvnet/sublinear-time-solver (MIT/Apache-2.0)
// and wrote its own discipline into the title: FIND THE CONSUMER
// BEFORE TAKING THE SOLVER. This file is that search, done as a
// measurement instead of a browse, and the answer is NO -- for a
// reason sharper than "nothing needs it".
//
// ---- WHAT THE SOLVER IS FOR ---------------------------------------
//
// A local/sublinear solver for a linear system Mx = b returns ONE
// COORDINATE x_i without ever forming the whole vector, by walking
// the matrix outward from i. It buys something only when THREE
// things hold at once:
//
//   (A) M is DIAGONALLY DOMINANT. The walk's contributions have to
//       shrink or it never terminates. This is a precondition, not a
//       preference -- it is what makes the series converge at all.
//   (B) The consumer wants k << n coordinates. Ask for all n and you
//       have done n local solves to replace one global one.
//   (C) n is large enough that the constant factors lose.
//
// ---- WHAT THIS TREE HAS, MEASURED ---------------------------------
//
// *** THE TWO PROPERTIES ARE IN DIFFERENT FILES, AND THAT IS THE
// *** WHOLE FINDING. ***
//
// Every diagonally dominant system here is consumed IN FULL:
// fluid/multigrid.mjs's 5-point Poisson operator has a worst-row
// ratio of exactly 1.0000 with every row dominant, and its consumer
// (fluid/flip2d.mjs's pressure projection) needs every cell, because
// making a velocity field divergence-free touches all of them.
//
// And the ONE consumer in the tree that genuinely reads a single
// coordinate -- tools/roundhouse/beamBind.mjs, which computes
// `solve(K, unit(N, i2))[i1]` for Maxwell-Betti reciprocity and
// discards the other 159 numbers -- is solving a matrix that is not
// diagonally dominant and cannot be made so. Beam bending is a
// FOURTH-order operator: the interior stencil is [1, -4, 6, -4, 1],
// so 6 on the diagonal against 10 off it, a ratio of 0.6. *** AND THE
// *** WORST ROW IS NOT THE INTERIOR ONE. *** physics/elasticity/beam.js
// gives the free end a half-cell-scaled row -- 1 against |-2| + |1| --
// which reads 0.3333, and that is the row this file records. Measured
// worst ratio 0.3333 with ONE ROW OF 160 dominant, and *** the same
// 0.3333 at n = 8, 20, 60 AND 160, *** because the free-end row is
// identical at every n: refining the mesh does not approach the
// precondition, so there is no larger version of this that qualifies.
// (The first draft of this file wrote "6 against 10" as the worst
// case. It is the interior case; the gate re-measures from the matrix
// and caught it.)
//
// The third candidate is the one worth naming because it is the trap
// the backlog item was written against. The module import graph WOULD
// fit, and the ORIENTATION MATTERS, which the first draft of this file
// got wrong: (I - alpha P) is dominant BY ROWS -- measured worst 1.1765
// with all 3,467 rows dominant -- while (I - alpha P^T), the form
// personalized PageRank is usually written in, is dominant by COLUMNS
// and reads 0.0075 by rows with only 3,018 of 3,467 dominant. Same
// matrix family, and one of the two orientations satisfies the
// precondition. "How much does module X influence Y" is a single
// coordinate of it.
// But *** NOTHING IN THIS TREE ASKS THAT QUESTION. *** gateReach does
// reachability with a BFS, not an influence score. Inventing a
// consumer to justify a taking is precisely the failure #133 exists
// to prevent, so it is recorded as ABSENT rather than as a plan. And
// even if it existed, the full solve over all 3,465 modules takes
// 2.95 ms, which is the budget any replacement would have to beat.
//
// ---- THE VERDICT --------------------------------------------------
//
// REFUSED, with reasons, and the reasons are structural rather than
// about the solver's quality. Nothing is vendored and nothing is
// ported. What is kept is `dominance()` -- the measurement that
// decided it -- because "will an iterative method converge on this
// matrix" is a question this tree could not previously answer about
// its own operators, and it turns out to have four different answers.
// ===================================================================
"use strict";

/**
 * Row-wise diagonal dominance of a dense matrix: min over rows of |a_ii| / sum_{j != i} |a_ij|.
 *
 * >= 1 in every row is the precondition every local solver and most stationary iterations need. A row with no
 * off-diagonal entries is Infinity (trivially dominant) rather than a division by zero, which matters because
 * a fixed boundary row is exactly that and would otherwise poison the minimum.
 */
export function dominance(rows) {
    const n = rows.length;
    let worst = Infinity, worstRow = -1, dominantRows = 0;
    for (let i = 0; i < n; i++) {
        const r = rows[i];
        let off = 0;
        for (let j = 0; j < r.length; j++) if (j !== i) off += Math.abs(r[j]);
        const ratio = off === 0 ? Infinity : Math.abs(r[i]) / off;
        if (ratio >= 1) dominantRows++;
        if (ratio < worst) { worst = ratio; worstRow = i; }
    }
    return { worst, worstRow, dominantRows, n, allDominant: dominantRows === n };
}

/**
 * The same measurement on a sparse row-list, so a graph can be tested without ever forming n^2 entries.
 * `rowsOf(i)` returns [[j, value], ...] including the diagonal.
 */
export function dominanceSparse(n, rowsOf) {
    let worst = Infinity, worstRow = -1, dominantRows = 0;
    for (let i = 0; i < n; i++) {
        let diag = 0, off = 0;
        for (const [j, v] of rowsOf(i)) { if (j === i) diag += v; else off += Math.abs(v); }
        const ratio = off === 0 ? Infinity : Math.abs(diag) / off;
        if (ratio >= 1) dominantRows++;
        if (ratio < worst) { worst = ratio; worstRow = i; }
    }
    return { worst, worstRow, dominantRows, n, allDominant: dominantRows === n };
}

/** The three things that must hold at once. Named so a verdict cites a criterion instead of a mood. */
export const CRITERIA = Object.freeze({
    DOMINANT: "the matrix is diagonally dominant (the walk converges at all)",
    FEW_COORDS: "the consumer wants k << n coordinates",
    LARGE_N: "n is large enough that the constant factors lose",
});

export const VERDICT = Object.freeze({ FITS: "FITS", REFUSED: "REFUSED", ABSENT: "ABSENT" });

/**
 * The census, as DATA. Each entry records a system this tree really solves, the consumer that reads its
 * answer, and which criterion it fails -- with the numbers that were measured rather than adjectives.
 *
 * `coordsRead` is the honest one to argue about: it is what the CALLING CODE uses, not what the solver
 * returns. beamBind's solve returns 160 numbers and its next character is `[i1]`.
 */
export const SYSTEMS = Object.freeze([
    {
        name: "poisson-pressure",
        system: "fluid/multigrid.mjs -- 5-point Poisson operator",
        consumer: "fluid/flip2d.mjs pressure projection",
        // *** A NAMED CONSUMER MUST BE FINDABLE IN THE FILE IT NAMES. *** The gate greps for this exact
        // string, so an entry cannot claim a consumer that is not there -- see the note on `consumer: null`.
        consumerFile: "fluid/flip2d.mjs",
        consumerEvidence: "for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++)",
        n: 16384,                       // 128x128, the size flip2d runs
        dominanceWorst: 1.0,            // measured: every row exactly 1.0
        allDominant: true,
        coordsRead: 16384,              // every cell: a divergence-free projection touches all of them
        fullSolveMs: 200.56,            // measured, 128x128, 8 V-cycles
        fails: [CRITERIA.FEW_COORDS],
        verdict: VERDICT.REFUSED,
        why: "The precondition holds perfectly and the consumer needs the whole field. Asking for 16,384 " +
             "single coordinates is 16,384 local solves in place of one global one.",
    },
    {
        name: "beam-reciprocity",
        system: "physics/elasticity/beam.js -- 4th-order bending stiffness [1,-4,6,-4,1]",
        consumer: "tools/roundhouse/beamBind.mjs -- solve(K, unit(N,i2))[i1]",
        consumerFile: "tools/roundhouse/beamBind.mjs",
        consumerEvidence: "solve(K, unit(N, i2))[i1]",
        n: 160,
        dominanceWorst: 0.3333333333333333,   // the free-end row: 1 against |-2|+|1|. Interior is 6/10 = 0.6.
        allDominant: false,
        dominantRows: 1,                      // of 160
        coordsRead: 1,                        // *** the only genuine single-coordinate consumer in the tree ***
        fullSolveMs: 4.17,
        fails: [CRITERIA.DOMINANT, CRITERIA.LARGE_N],
        verdict: VERDICT.REFUSED,
        why: "The consumer is exactly right and the matrix is exactly wrong. Bending is fourth-order, so the " +
             "diagonal loses 6 to 10 -- and the ratio is 0.3333 at n = 8, 20, 60 and 160 alike, so refinement " +
             "never approaches the precondition. There is no larger version of this problem that qualifies.",
    },
    {
        name: "module-influence",
        system: "the module import graph as (I - alpha P), alpha = 0.85 -- the ROW-dominant orientation",
        // *** THE POINT, AND THE REASON consumerEvidence EXISTS. *** A null consumer is the honest record of
        // a hole. Sabotage C in the gate fills this in with a plausible-looking file and, on the first
        // writing of that gate, ONE assertion noticed -- too few for the exact failure backlog #133 names.
        // Every non-null consumer now has to produce a line of real source, which a fabrication cannot.
        consumer: null,
        consumerFile: null,
        consumerEvidence: null,
        n: 3467,
        dominanceWorst: 1.1765,         // measured in the gate, for (I - alpha P) BY ROWS. The transpose
                                        // form reads 0.0075 by rows -- it is column-dominant, not row-dominant.
        allDominant: true,
        coordsRead: null,
        fullSolveMs: 2.95,              // all 3,465 coordinates, 200 power iterations
        fails: [CRITERIA.LARGE_N],
        verdict: VERDICT.ABSENT,
        why: "The one shape that would fit, and NOTHING ASKS FOR IT. tools/ship/gateReach.mjs does " +
             "reachability with a BFS, not an influence score, and a tree-wide scan finds ZERO files computing " +
             "one. Inventing this consumer to justify the taking is the failure backlog #133 was written to " +
             "prevent, so it is recorded as absent rather than as a plan -- and the full solve over all " +
             "3,465 coordinates is 2.95 ms, which is the budget a replacement would have to beat.",
    },
]);

/** Does this system clear all three criteria? Returns the failing criteria, so a caller cannot get a bare no. */
export function fits(entry) {
    const failed = [];
    if (!entry.allDominant) failed.push(CRITERIA.DOMINANT);
    if (entry.consumer === null) return { fits: false, failed: [CRITERIA.FEW_COORDS], absentConsumer: true };
    if (!(entry.coordsRead * 8 < entry.n)) failed.push(CRITERIA.FEW_COORDS);
    if (!(entry.n >= 10000)) failed.push(CRITERIA.LARGE_N);
    return { fits: failed.length === 0, failed, absentConsumer: false };
}

/** The round's answer in one call. */
export function verdict() {
    const fitting = SYSTEMS.filter((s) => fits(s).fits);
    return {
        examined: SYSTEMS.length,
        fitting: fitting.length,
        taken: false,
        summary: fitting.length === 0
            ? "REFUSED: no system in this tree clears all three criteria. Every diagonally dominant one is " +
              "consumed in full; the only single-coordinate consumer solves a matrix at 0.333 dominance."
            : "one or more systems fit -- re-read the census before taking anything",
    };
}
