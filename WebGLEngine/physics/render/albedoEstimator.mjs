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

import { sampleHalfVector, bounceWeight, directionalAlbedo } from "./microfacet.mjs";

"use strict";

/** Deterministic RNG, so a gate reporting a sampled number reports the same one every run. */
export function rng(seed = 1) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The directional albedo, estimated by drawing from the GGX lobe itself.
 * Reports `escaped` -- draws whose reflected direction went below the horizon -- rather than hiding them,
 * because a sampler that rejects most of its draws is a different animal from one that rejects none, and
 * dividing by the survivors would turn that difference into silence (v4402, and v4437's own first probe).
 */
export function sampledAlbedo(alpha, cosO, { n = 60000, seed = 1 } = {}) {
    const r = rng(seed);
    const sinO = Math.sqrt(Math.max(0, 1 - cosO * cosO));
    const wo = [sinO, cosO, 0];
    let sum = 0, escaped = 0;
    for (let k = 0; k < n; k++) {
        const h = sampleHalfVector(r(), r(), alpha);
        const dot = wo[0] * h[0] + wo[1] * h[1] + wo[2] * h[2];
        if (dot <= 0) { escaped++; continue; }
        const cosI = 2 * dot * h[1] - wo[1];
        if (cosI <= 0) { escaped++; continue; }
        sum += bounceWeight(cosO, cosI, h[1], dot, alpha);
    }
    return { value: sum / n, n, escaped };
}

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
