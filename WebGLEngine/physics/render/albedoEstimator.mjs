// physics/render/albedoEstimator.mjs -- v4438 -- the estimator the furnace should have been using all along.
//
// *** v4437 SAID IN WRITING THAT EVERY FURNACE NUMBER AT LOW ROUGHNESS AND GRAZING ANGLES SHOULD BE RE-CHECKED.
// THIS IS THAT CHECK, AND IT IS WORSE THAN THE ROUND THAT PREDICTED IT GUESSED. *** That round convicted
// principled.directionalAlbedo's default grid of a 3x error. The same defect reaches
// physics/render/energyCompensation.mjs, which BAKES A TABLE other modules consume:
//
//     buildTable's grid, against a converged value, at the table's own mu rows
//     alpha  mu       N=220      converged   error
//     0.02   0.0208   0.242842   0.892115    73%      <- the table row, not a synthetic worst case
//     0.05   0.0208   0.705248   0.926606    24%      <- and 0.05 is an alpha the GATES actually build at
//     0.05   0.0625   0.749025   0.890160    16%
//     0.1    0.0208   0.926412   0.954784     3%
//
// physics/render/msDirect-selfcheck.mjs builds at N=120, where alpha 0.05 is 40% wrong. These are green gates
// consuming a table that is wrong by a quarter in its first rows.
//
// ---- *** THE FIX IS NOT A BIGGER GRID, AND THE TIMING IS WHY *** -----------------------------------------
//
// Converging the grid at the worst cell needs N > 4800 and takes 3.5 SECONDS for ONE POINT. A 24-row table at
// six alphas would be minutes, in a tree whose sweep budget is three seconds a gate. So "just raise N" is not
// a fix that can ship, and that is worth saying plainly rather than discovering later.
//
// *** THE TREE ALREADY OWNED THE RIGHT ESTIMATOR AND WAS USING IT ONLY TO CHECK THE WRONG ONE. ***
// microfacet.sampleHalfVector draws from the GGX distribution and microfacet.bounceWeight is the throughput
// with the pdf cancelled ANALYTICALLY. Together they estimate the same integral by drawing from the lobe
// instead of marching past it -- which is exactly why the grid fails: a narrow lobe at a grazing angle falls
// BETWEEN grid lines, and a sampler cannot miss the thing it is drawing from.
//
//     alpha 0.02, mu 0.0208:  sampled 0.892536 (n=60k)  0.891673 (n=400k)  0.892115 (n=2M)   -- FLAT
//                             grid    0.685697 (N=1200) 0.845081 (N=2400)  0.888784 (N=4800) -- STILL CLIMBING
//                             cost    18 ms sampled, 3456 ms grid
//
// A HUNDRED TIMES CHEAPER AND RIGHT. The grid was not a better instrument being used carelessly; it was the
// wrong instrument for this integrand, and the tree has had the right one since v3495.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the grid is useless. It is DETERMINISTIC, which the sampler is not, and for a broad lobe it is exact
// where Monte Carlo carries noise -- above alpha 0.3 the two agree inside the sampler's own scatter and the
// grid is the better answer. What is claimed is narrower and checkable: THE GRID FAILS WHERE THE LOBE IS
// NARROW AND THE VIEW IS OBLIQUE, the sampler does not, and `trustworthy()` picks between them by a rule
// rather than by whichever one somebody typed at the call site.

import { sampledFurnace, directionalAlbedo } from "./microfacet.mjs";


"use strict";

// The sampler itself lives in microfacet.mjs beside sampleHalfVector and bounceWeight, because those two are
// what it is made of and a second copy here would be a second declaration of one estimator. What lives HERE is
// the RULE for when to reach for it, which is a policy rather than a piece of arithmetic.
// *** `export { x } from "y"` GIVES NO LOCAL BINDING, AND THIS FILE PROVED IT AGAIN. *** The first version
// re-exported sampledFurnace with that form; trustworthy() below then threw ReferenceError on every call, and
// physics/render/renderBsdf-selfcheck.mjs reported ZERO FAIL LINES WHILE EXITING 1 -- a crash, not a failed
// assertion. The tree has a written rule for exactly that ("a count of failures is not a verdict unless the
// process finished") and this is its seventh sighting. Import, then export, so the name exists here too.
export { sampledFurnace };
export const sampledAlbedo = sampledFurnace;

/** How wrong a given grid is at a given cell, measured against the sampler rather than against a finer grid. */
export function gridError(alpha, cosO, { N = 220, M = 220, n = 60000, seed = 1 } = {}) {
    const grid = directionalAlbedo(alpha, cosO, { N, M });
    const ref = sampledAlbedo(alpha, cosO, { n, seed }).value;
    return { grid, sampled: ref, rel: Math.abs(grid - ref) / Math.max(1e-12, ref) };
}

// *** THE RULE FOR WHICH ESTIMATOR TO BELIEVE, WRITTEN DOWN ONCE INSTEAD OF DECIDED AT EACH CALL SITE. ***
// It is a PRODUCT of two conditions, which v4437 established by showing each half alone is harmless: a narrow
// lobe at a head-on view resolves fine, and a broad lobe at a grazing view resolves fine. The boundary is not
// a cliff, so the threshold is deliberately generous -- being wrong here costs Monte Carlo noise, and being
// wrong the other way costs 73%.
export const NARROW_ALPHA = 0.3;
export const OBLIQUE_COS = 0.35;
export const gridIsUnsafe = (alpha, cosO) => alpha < NARROW_ALPHA && cosO < OBLIQUE_COS;

/**
 * The albedo, from whichever estimator is right for this cell. The DEFAULT is the rule; passing `force`
 * overrides it, which the gate uses to show the two disagreeing.
 */
export function trustworthy(alpha, cosO, { force = null, n = 60000, seed = 1, N = 220, M = 220 } = {}) {
    const which = force || (gridIsUnsafe(alpha, cosO) ? "sampled" : "grid");
    const value = which === "sampled"
        ? sampledAlbedo(alpha, cosO, { n, seed }).value
        : directionalAlbedo(alpha, cosO, { N, M });
    return { value, estimator: which };
}

// *** THE AUDIT, FROZEN BY NAME (v4399's rule). These are the tree's OWN call sites, not synthetic cases. ***
export const RISK_AT_V4438 = Object.freeze({
    at: "v4438",
    // buildTable's first mu row is (0 + 0.5) / K, which for K = 24 is 0.0208 -- THE MOST OBLIQUE ANGLE THERE
    // IS. A table that starts at grazing incidence starts in the regime the grid cannot integrate.
    tableFirstMu: 0.5 / 24,
    // The alphas the tree's gates actually build tables at. 0.05 is the one that matters: it is in the
    // failing regime and it is shipped.
    gateAlphas: Object.freeze([0.05, 0.2, 0.4, 0.6, 0.8, 1.0]),
    // *** TWO DIFFERENT LISTS, AND CONFLATING THEM IS WHAT THE GATE CAUGHT. *** The RULE is conservative:
    // it flags every alpha below NARROW_ALPHA at a grazing mu, which is {0.05, 0.2}. Only ONE of those is
    // MATERIALLY wrong -- 0.2's grid error is 0.84% where 0.05's is 24%. A conservative rule flagging more
    // than it must is the rule working, and the honest record says both numbers rather than tuning the
    // threshold down to match the measurement and calling that agreement.
    ruleFlags: Object.freeze([0.05, 0.2]),
    materiallyWrong: Object.freeze([0.05]),
    materialThreshold: 0.05,
    worst: Object.freeze({ alpha: 0.02, mu: 0.5 / 24, grid220: 0.242842, sampled: 0.892115, relError: 0.728 }),
    shipped: Object.freeze({ alpha: 0.05, mu: 0.5 / 24, grid220: 0.705248, grid120: 0.554880, sampled: 0.926606 }),
    cost: Object.freeze({ sampledMs: 18, gridMs: 3456, gridN: 4800, note: "one cell, alpha 0.02, mu 0.0208" }),
});

// ---- *** THE DOOR (v3327's split: a reporting function beside the gate, so the bench can serve this) *** ---
//
// v4461 -- registered as an instrument at v4460 and left with nothing to render, which registryOrphans caught
// as one of twenty modules in the mechanical remainder. It re-measures RISK_AT_V4438 LIVE rather than printing
// it, because a frozen record beside a live measurement is the only arrangement where drift is visible.

export function reportLines() {
    const L = [];
    L.push("[albedoEstimator] the grid against the sampler, at the rows the tree's own tables build");
    L.push("");
    const R = RISK_AT_V4438, mu = R.tableFirstMu;
    L.push("  mu = " + mu.toFixed(4) + " (buildTable's first row at K = 24 -- the most oblique angle there is)");
    L.push("  flagged when alpha < " + NARROW_ALPHA + " AND cos > " + OBLIQUE_COS + " is false; material at rel error >= " +
           R.materialThreshold);
    L.push("");
    L.push("   alpha      grid       sampled    rel error   rule    material");
    const flags = [], material = [];
    for (const alpha of R.gateAlphas) {
        const grid = trustworthy(alpha, mu, { force: "grid", N: 220, M: 220 }).value;
        const samp = trustworthy(alpha, mu, { force: "sampled", n: 60000, seed: 1 }).value;
        const rel = samp > 0 ? Math.abs(grid - samp) / samp : 0;
        const flagged = gridIsUnsafe(alpha, mu), isMaterial = rel >= R.materialThreshold;
        if (flagged) flags.push(alpha);
        if (isMaterial) material.push(alpha);
        L.push("   " + String(alpha).padStart(5) + "   " + grid.toFixed(6).padStart(9) + "   " +
               samp.toFixed(6).padStart(9) + "   " + (rel * 100).toFixed(2).padStart(7) + "%   " +
               (flagged ? "FLAG" : "  - ").padStart(5) + "   " + (isMaterial ? "YES" : " - ").padStart(6));
    }
    L.push("");
    // *** THE POINT OF PRINTING BOTH LISTS IS THAT THEY DIFFER AND THAT IS THE RULE WORKING. *** A
    // conservative rule flags more than is materially wrong; tuning the threshold until the two lists match
    // would be fitting the rule to this measurement and calling that agreement.
    L.push("  rule flags      " + (flags.join(", ") || "none") +
           "        recorded at " + R.at + ": " + R.ruleFlags.join(", ") +
           (flags.join() === R.ruleFlags.join() ? "   agrees" : "   *** MOVED ***"));
    L.push("  materially wrong " + (material.join(", ") || "none") +
           "             recorded at " + R.at + ": " + R.materiallyWrong.join(", ") +
           (material.join() === R.materiallyWrong.join() ? "   agrees" : "   *** MOVED ***"));
    L.push("  A conservative rule flagging MORE than it must is the rule working, not a miscalibration.");
    L.push("");
    L.push("  cost, recorded at " + R.at + ": sampled " + R.cost.sampledMs + " ms, grid " + R.cost.gridMs +
           " ms at N = " + R.cost.gridN + " (" + R.cost.note + ")");
    L.push("  which is why the fix is the other estimator and not a bigger grid -- a converged grid cannot ship.");
    return L;
}
