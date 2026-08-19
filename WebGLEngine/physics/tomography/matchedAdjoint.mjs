// WebGLEngine/physics/tomography/matchedAdjoint.mjs -- v3616
// ---------------------------------------------------------------------------------------------------------------
// v3615 SHOWED backProject IS NOT THE TRANSPOSE OF radon AND LEFT THE FIX AS KEITH'S CALL. THIS IS THE FIX --
// AND RUNNING IT PAST THE ITERATION COUNT v3613 HAPPENED TO CHOOSE SHOWS THE OLD PAIR DOES NOT MERELY LAND
// SOMEWHERE ELSE. IT WALKS AWAY FROM THE DATA.
//
// THE CONSTRUCTION IS MECHANICAL AND THEREFORE EXACT. radon() GATHERS: for each angle and detector it walks
// s = -half..half-1, computes px,py by the same expression, tests the same bounds, and ADDS img[py*N+px] into
// a sum. The adjoint of "sum a selected set of entries" is "scatter the value back over the same set", so the
// transpose is radon's own loop with the innermost line reversed:
//
//     radon:   sum += img[py * N + px]
//     adjoint: img[py * N + px] += v
//
// Same indices, same bounds test, same rounding. NOTHING IS DERIVED OR APPROXIMATED, so this is the transpose
// BY CONSTRUCTION rather than by intent -- which matters, because "I meant it to be the adjoint" is exactly
// what v3613 said about backProject.
//
// ================================================================================================================
// FINDING 1: IT IS THE ADJOINT, AND TWO INDEPENDENT CONSTRUCTIONS AGREE BIT FOR BIT
// ================================================================================================================
//
//     dot-product defect, shipped backProject        2.751e+1
//     dot-product defect, dense basis-vector matrix  8.304e-14
//     dot-product defect, THIS loop transpose        8.304e-14
//
//     CROSS-CHECK, dense matrix vs loop transpose:   worst |difference|  0.000e+0
//
// v3615's dense adjoint was built by applying radon to every basis vector; this one is built by reversing an
// assignment. THEY HAVE NO CODE IN COMMON AND THEY AGREE EXACTLY -- so the operator is pinned by two routes,
// and neither is a restatement of the other. The dense one cost O(N^2 * nAngles * nDet) and needed 0.11 GB at
// N = 96; this one costs what radon costs. AN INSTRUMENT BECOMES A SHIPPABLE OPERATOR.
//
// ================================================================================================================
// FINDING 2, AND IT IS THE ROUND: THE UNMATCHED PAIR DOES NOT CONVERGE. IT TURNS ROUND.
// ================================================================================================================
//
// N = 96, 16 angles, ellipse phantom, step DERIVED per operator by power iteration, residual / correlation:
//
//     iteration            1000        2000        3000        4000
//     shipped backProject  2.86 / 0.9763   2.95 / 0.9747   3.14 / 0.9722   3.43 / 0.9686
//     MATCHED adjoint      1.90 / 0.9655   0.677 / 0.9660  0.244 / 0.9661  0.0879 / 0.9661
//
// *** THE MATCHED ITERATION FALLS THREE ORDERS AND IS STILL FALLING. THE UNMATCHED ONE REACHES ITS BEST POINT
// AROUND ITERATION 1000 AND THEN WALKS AWAY FROM THE DATA -- residual RISING 2.86 -> 3.43 and correlation
// FALLING WITH IT. It is not a descent method that lands in the wrong place; it is not a descent method. ***
//
// *** SO v3613's SIRT MUST BE STOPPED EARLY, AND NOTHING SAID SO. It ran 300 iterations and got a good answer
// BY LUCK OF THE BUDGET. The apparent advantage the unmatched operator shows on correlation at larger N is
// EARLY STOPPING DOING THE REGULARISING -- at 4000 iterations it reads 0.9686 against the matched operator's
// steady 0.9661, with THIRTY-NINE TIMES the residual. A comparison at a fixed iteration count was comparing
// budgets, not operators. ***
//
// ================================================================================================================
// THE HONEST WRINKLE, WHICH IS v3612 ARRIVING FROM A NEW DIRECTION
// ================================================================================================================
//
// THE MATCHED OPERATOR IS NOT SIMPLY BETTER. Its correlation to truth settles at 0.9661, BELOW the 0.9763 the
// unmatched one touches at its best moment. CONVERGING ON THE OBJECTIVE IS NOT THE SAME AS BEING CLOSEST TO
// THE TRUTH: the least-squares solution of an underdetermined system is not the best picture, which is exactly
// what v3612 proved with two binary images having identical projections. Descending further on ||A x - b||
// buys you the data and does not buy you the object.
//
// SO WHICH ONE YOU WANT DEPENDS ON THE QUESTION, and both are now available with the difference measured.
//
// WHAT IS NOT CHANGED: sirt.mjs's DEFAULT is still backProject, so v3613's published readings stay
// reproducible and its hash-pinned checks stay green. The matched operator is an OPTION, its consequences are
// measured here, and moving the default is Keith's call -- v3603's idiom, and the same reason: the deciding
// half of "which reconstruction looks right" is not a number this sandbox can settle.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { radon, backProject, angleSet, scoreRecon, phantomField } from "./ct.js";
import { trueAdjoint, adjointDefect, rng, randSino } from "./adjoint.mjs";
// v3617 -- MOVED, NOT COPIED. matchedBackProject now lives in reconOps.mjs, which has NO node imports so a
// PAGE can reach it; this file re-exports it so every existing caller and gate keeps working against ONE
// declaration. The claims about it are still measured here.
import { matchedBackProject, powerStep } from "./reconOps.mjs";
export { matchedBackProject };

/**
 * THE TRANSPOSE OF radon, BY CONSTRUCTION. Every line mirrors radon's own loop; only the innermost assignment
 * is reversed. NO PI/nAngles SCALE -- that normalisation belongs to filtered back-projection as a
 * RECONSTRUCTION operator and has nothing to do with being an adjoint. backProject keeps it and keeps its job.
 */
/** Step derived per operator by power iteration on B A -- never typed, and it MOVES with the operator. */
export const stepFor = (adj, N, angles, nDet, opts) => powerStep(adj, N, angles, nDet, opts);

/** TWO INDEPENDENT CONSTRUCTIONS OF ONE OPERATOR. No code in common; they must agree exactly. */
export function crossCheckAgainstDense({ N = 32, nDet = 32, na = 16, trials = 5, seed = 3 } = {}) {
    const angles = angleSet(na), dense = trueAdjoint(N, angles, nDet), r = rng(seed);
    let worst = 0;
    for (let t = 0; t < trials; t++) {
        const y = randSino(na, nDet, r);
        const a = dense(y), b = matchedBackProject(y, N, angles, nDet);
        for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    }
    return worst;
}

export const PHANTOM = [
    { cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1, phi: 0 },
    { cx: 0.2, cy: -0.1, a: 0.25, b: 0.2, rho: -0.6, phi: 0.4 },
];

/**
 * THE TRAJECTORY, NOT A SINGLE READING. A comparison at one iteration count compares BUDGETS; what separates
 * these two operators is what the residual DOES as the budget grows, so both are reported as a series.
 */
export function trajectories({ N = 96, nDet = 96, na = 16, iters = 4000, every = 1000 } = {}) {
    const angles = angleSet(na), truth = phantomField(N, PHANTOM), b = radon(truth, N, angles, nDet);
    const resid = (x) => {
        const ax = radon(x, N, angles, nDet);
        let s = 0; for (let a = 0; a < na; a++) for (let d = 0; d < nDet; d++) { const e = b[a][d] - ax[a][d]; s += e * e; }
        return Math.sqrt(s);
    };
    const run = (adj) => {
        const lam = stepFor(adj, N, angles, nDet).step, x = new Float64Array(N * N), rows = [];
        for (let k = 0; k <= iters; k++) {
            if (k % every === 0) rows.push({ k, residual: resid(x), corr: scoreRecon(x, truth).corr });
            const ax = radon(x, N, angles, nDet);
            const r = ax.map((p, i) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = b[i][d] - p[d]; return q; });
            const g = adj(r);
            for (let j = 0; j < x.length; j++) x[j] += lam * g[j];
        }
        return { step: lam, rows };
    };
    return {
        unmatched: run((r) => backProject(r, N, angles, nDet)),
        matched: run((r) => matchedBackProject(r, N, angles, nDet)),
    };
}

export const MEASURED_V3616 = {
    defect: { shipped: 2.751e+1, dense: 8.304e-14, matched: 8.304e-14 },
    crossCheck: 0,
    trajectoryAt96: {
        unmatched: { 1000: [2.86, 0.9763], 2000: [2.95, 0.9747], 3000: [3.14, 0.9722], 4000: [3.43, 0.9686] },
        matched: { 1000: [1.90, 0.9655], 2000: [0.677, 0.9660], 3000: [0.244, 0.9661], 4000: [0.0879, 0.9661] },
    },
    verdict: "THE MATCHED ADJOINT IS radon's OWN LOOP WITH THE INNERMOST ASSIGNMENT REVERSED -- the transpose " +
        "BY CONSTRUCTION, reading 8.304e-14 on the dot-product test and agreeing with v3615's dense " +
        "basis-vector matrix to EXACTLY 0.000e+0 although the two share no code. AND RUN PAST v3613's " +
        "ITERATION COUNT THE OLD PAIR DOES NOT CONVERGE SOMEWHERE ELSE -- IT TURNS ROUND: residual RISING " +
        "2.86 -> 3.43 from iteration 1000 to 4000 while the matched one falls 1.90 -> 0.0879. IT IS NOT A " +
        "DESCENT METHOD.",
    whatItMeansForV3613: "SIRT with the shipped pair MUST BE STOPPED EARLY and nothing said so -- 300 " +
        "iterations got a good answer BY LUCK OF THE BUDGET. The unmatched operator's apparent edge on " +
        "correlation is EARLY STOPPING DOING THE REGULARISING: at 4000 iterations it reads 0.9686 against the " +
        "matched operator's steady 0.9661 with 39x the residual. A fixed-iteration comparison compared budgets.",
    scopedByV3617: "THE WRINKLE BELOW IS A FACT ABOUT SPARSE ANGLES, NOT A GENERAL LAW. Re-measured at " +
        "ct.html's own settings (N=96, nDet=130, the five-ellipse phantom) the matched operator wins on BOTH " +
        "residual AND correlation: at 30 angles it reaches 2.34 / 0.9835 against backProject's best 6.62 / " +
        "0.9862 then decaying to 6.84 / 0.9850, and at 90 angles 3.97 / 0.9992 against a best of 12.1 / " +
        "0.9972 decaying to 12.6 / 0.9966. The turn-round is REAL at both; the correlation trade is not.",
    theHonestWrinkle: "THE MATCHED OPERATOR IS NOT SIMPLY BETTER AT 16 ANGLES ON v3616's PHANTOM. Its correlation settles at 0.9661, BELOW the " +
        "0.9763 the unmatched one touches at its best moment. CONVERGING ON THE OBJECTIVE IS NOT BEING CLOSEST " +
        "TO THE TRUTH -- the least-squares solution of an underdetermined system is not the best picture, which " +
        "is v3612's result arriving from a new direction. Descending on ||Ax-b|| buys the data, not the object.",
    notChanged: "sirt.mjs's DEFAULT is still backProject, so v3613's readings stay reproducible and its " +
        "hash-pinned checks stay green. The matched operator is an OPTION with its consequences measured; " +
        "moving the default is Keith's call (v3603's idiom).",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    const A16 = angleSet(16);
    say("[matchedAdjoint] radon's own loop, transposed -- and what the unmatched pair was really doing");
    say("");
    say("1. IT IS THE ADJOINT, AND TWO CONSTRUCTIONS WITH NO CODE IN COMMON AGREE EXACTLY");
    say("     shipped backProject        " + adjointDefect((y) => backProject(y, 32, A16, 32)).toExponential(3));
    say("     dense basis-vector matrix  " + adjointDefect(trueAdjoint(32, A16, 32)).toExponential(3));
    say("     THIS loop transpose        " + adjointDefect((y) => matchedBackProject(y, 32, A16, 32)).toExponential(3));
    say("     cross-check dense vs loop transpose: worst |diff| " + crossCheckAgainstDense().toExponential(3));
    say("     The dense one needed 0.11 GB at N=96; this one costs what radon costs.");
    say("");
    say("2. THE TRAJECTORY -- a single reading compares BUDGETS, not operators");
    const t = trajectories();
    say("     step derived per operator: unmatched " + t.unmatched.step.toExponential(3) +
        "   matched " + t.matched.step.toExponential(3));
    for (const [nm, r] of [["shipped backProject", t.unmatched], ["MATCHED adjoint", t.matched]])
        say("     " + nm.padEnd(20) + r.rows.map((x) => x.k + ":" + x.residual.toExponential(2) + "/" + x.corr.toFixed(4)).join("  "));
    const u = t.unmatched.rows, m = t.matched.rows;
    say("     THE UNMATCHED RESIDUAL RISES AFTER ITS BEST POINT (" + u[1].residual.toFixed(2) + " -> " +
        u[u.length - 1].residual.toFixed(2) + ") WHILE THE MATCHED ONE FALLS (" + m[1].residual.toFixed(2) +
        " -> " + m[m.length - 1].residual.toExponential(2) + "). It is not a descent method.");
    say("");
    say("  " + MEASURED_V3616.verdict);
    say("  FOR v3613: " + MEASURED_V3616.whatItMeansForV3613);
    say("  THE WRINKLE: " + MEASURED_V3616.theHonestWrinkle);
    say("  NOT CHANGED: " + MEASURED_V3616.notChanged);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
