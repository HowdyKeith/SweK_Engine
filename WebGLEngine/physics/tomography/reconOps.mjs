// WebGLEngine/physics/tomography/reconOps.mjs -- v3617
// ---------------------------------------------------------------------------------------------------------------
// THE THREE MODULES THIS SESSION SHIPPED CANNOT BE IMPORTED BY A PAGE, AND I DID NOT NOTICE UNTIL KEITH ASKED
// WHERE TO COMPARE THEM.
//
// sirt.mjs, adjoint.mjs, matchedAdjoint.mjs and ambiguity.mjs EACH `import { pathToFileURL } from "node:url"`
// at module scope, for the main-block guard. A browser cannot resolve that specifier, so every one of them is
// STRUCTURALLY UNREACHABLE FROM ANY PAGE -- not "has a text-only front door", which is what I called it, but
// CANNOT HAVE A VISUAL ONE AT ALL. ct.js has no such import, which is exactly why ct.html has existed since
// v2814 and the four modules built on top of it have never been seen.
//
// This file holds the operators a page needs, WITH NO NODE IMPORTS AND NO MAIN BLOCK. Everything here was
// MOVED, not copied: matchedBackProject comes out of matchedAdjoint.mjs and the Landweber loop out of
// sirt.mjs, and both of those files now import from here and re-export their old names, so every existing
// caller and gate keeps working against ONE declaration.
//
// *** AND MOVING IT CLOSED A DUPLICATION I CREATED MYSELF LAST ROUND: stepFor existed in BOTH sirt.mjs and
// matchedAdjoint.mjs -- the same power iteration written twice, differing only in whether the operator was a
// parameter. Two declarations of one thing, in the arc whose whole subject is two declarations of one thing.
// The general form (operator as a parameter) lives here now and both import it. ***
//
// WHAT IS NOT CLAIMED: that any of this is new maths. It is the same code in a place a page can reach.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { radon, backProject } from "./ct.js";

/**
 * THE TRANSPOSE OF radon, BY CONSTRUCTION (v3616). radon GATHERS `sum += img[py*N+px]`; this SCATTERS
 * `img[py*N+px] += v` over the same indices, the same bounds test and the same rounding. NO PI/nAngles scale:
 * that normalisation belongs to filtered back-projection as a RECONSTRUCTION operator, not to an adjoint.
 * Its dot-product defect is 8.304e-14 against backProject's 2.751e+1, and it agrees with the dense
 * basis-vector adjoint to EXACTLY 0 -- both measured in matchedAdjoint.mjs, which still owns those claims.
 */
export function matchedBackProject(sino, N, angles, nDet) {
    const img = new Float64Array(N * N), half = N / 2;
    for (let a = 0; a < angles.length; a++) {
        const ct = Math.cos(angles[a]), st = Math.sin(angles[a]), proj = sino[a];
        for (let d = 0; d < nDet; d++) {
            const t = (d - nDet / 2 + 0.5) / (nDet / 2) * half, v = proj[d];
            for (let s = -half; s < half; s++) {
                const px = (half + t * ct - s * st) | 0, py = (half + t * st + s * ct) | 0;
                if (px >= 0 && px < N && py >= 0 && py < N) img[py * N + px] += v;
            }
        }
    }
    return img;
}

/** The residual the iteration claims to minimise, ||b - A x||. */
export function residual(x, sino, N, angles, nDet) {
    const ax = radon(x, N, angles, nDet);
    let s = 0;
    for (let i = 0; i < ax.length; i++) for (let d = 0; d < nDet; d++) { const e = sino[i][d] - ax[i][d]; s += e * e; }
    return Math.sqrt(s);
}

/**
 * THE STEP, DERIVED PER OPERATOR by power iteration on B A -- never typed, and it MOVES with the operator and
 * with N. v3616 measured what happens when it is typed instead: a comparison at a fixed step compares BUDGETS
 * rather than operators, and reverses its own answer at a different size.
 */
export function powerStep(adjoint, N, angles, nDet, { iters = 14, seed = 12345 } = {}) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296 - 0.5);
    let v = new Float64Array(N * N).map(rnd), lam = 0;
    for (let k = 0; k < iters; k++) {
        const w = adjoint(radon(v, N, angles, nDet));
        let n = 0; for (const x of w) n += x * x; n = Math.sqrt(n);
        if (!(n > 0)) break;
        lam = n / Math.sqrt(v.reduce((a, x) => a + x * x, 0));
        for (let i = 0; i < w.length; i++) w[i] /= n;
        v = w;
    }
    return { lambdaMax: lam, step: lam > 0 ? 1 / lam : 0 };
}

/**
 * x <- x + step * B (b - A x).
 *
 * *** v3847 -- B NOW DEFAULTS TO matchedBackProject. THE DEFAULT MOVED, AND THE SPARSE-ANGLE REGRESSION IS
 * ACCEPTED RATHER THAN WORKED AROUND. *** v3846 measured the crossover and split the entry points by question;
 * Keith read the numbers and chose ONE default. The reasoning is that a fixed-point iteration that WALKS AWAY
 * FROM THE DATA is not a defensible default whatever it scores on one phantom -- v3616's finding stands, and a
 * method that is not a descent method should not be the thing this tree hands out by name.
 *
 * WHAT IT COSTS, AND IT IS A REAL COST PAID ON PURPOSE (see sirt.mjs's header for the full table):
 *     12 views   correlation 0.970618 -> 0.952483     30 views   0.987556 -> 0.979565
 *    120 views   correlation 0.996503 -> 0.996897 (the matched operator wins here)
 * FINDING 1's headline gain falls +0.0957 -> +0.0776 at twelve views, and its ORDERING and every assertion
 * built on it still hold -- the sparse end is still where a method choice buys most, by 7.86x rather than 10.1x.
 *
 * WHAT IT BUYS: the residual actually descends, monotonically, for as long as you run it. The budget stops
 * being load-bearing -- 300 iterations is now merely a budget rather than an accidental regulariser.
 *
 * Pass `adjoint: (r) => backProject(r, N, angles, nDet)` for the old operator; the gates do exactly that to
 * hold the turn-round on the record.
 */
export function landweber(sino, N, angles, nDet, { iters = 300, step = null, x0 = null, every = 50, adjoint = null } = {}) {
    const B = adjoint || ((r) => matchedBackProject(r, N, angles, nDet));   // v3847 -- was backProject
    const lam = step === null ? powerStep(B, N, angles, nDet).step : step;
    const x = x0 ? Float64Array.from(x0) : new Float64Array(N * N);
    const history = [];
    for (let k = 0; k < iters; k++) {
        const ax = radon(x, N, angles, nDet);
        const r = ax.map((p, i) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = sino[i][d] - p[d]; return q; });
        if (k % every === 0) { let s = 0; for (const q of r) for (const e of q) s += e * e; history.push({ k, residual: Math.sqrt(s) }); }
        const g = B(r);
        for (let j = 0; j < x.length; j++) x[j] += lam * g[j];
    }
    return { x, step: lam, history, residual: residual(x, sino, N, angles, nDet) };
}

/**
 * ================================================================================================================
 * v3846 -- THE OBJECTIVE ENTRY POINT. SPLIT BY QUESTION, NOT BY VERDICT.
 * ================================================================================================================
 *
 * v3616 left "move the default" as Keith's call and it is now settled, but NOT as "matched wins". Measured
 * across the angle counts sirt.mjs actually publishes, on its own phantom at N = 96, the two operators CROSS
 * OVER and no single default serves both ends:
 *
 *     nAngles      FBP        shipped @300      matched (converged)
 *        12      0.874950     0.970618          0.954752   (residual 3.0e-4)
 *        30      0.956257     0.987556          0.981497
 *       120      0.987036     0.996503          0.999732   (residual 1.29)
 *
 * *** THE MATCHED OPERATOR'S CORRELATION SATURATES BELOW THE SHIPPED PAIR AT SPARSE ANGLES AND MORE BUDGET
 * DOES NOT CLOSE IT -- 0.952483 at 300 iterations, 0.954752 at 2400, 0.954752 at 4800. That is not early
 * stopping, it was checked to convergence. *** It is v3612's ambiguity from a third direction: the
 * least-squares solution of an underdetermined system is not the best picture, so DESCENDING FURTHER ON
 * ||Ax - b|| BUYS THE DATA AND DOES NOT BUY THE OBJECT. At 120 views the system is determined enough that the
 * two agree about what the data means, and the matched operator wins outright on both numbers.
 *
 * SO THE SPLIT IS BY QUESTION AND BOTH DEFAULTS ARE RIGHT FOR THEIRS:
 *
 *     landweber()         RECONSTRUCTION. Defaults to backProject. v3613's published correlations stay
 *                         reproducible and its hash-pinned table does not move. Must be STOPPED EARLY --
 *                         this pair turns round, and that is now gated rather than remembered.
 *     landweberDescent()  THE OBJECTIVE. Defaults to matchedBackProject. Anything that claims to MINIMISE
 *                         a residual belongs here, because the other pair provably does not minimise it.
 *
 * *** THE CONCRETE DEFECT THIS FIXES IS IN A GATE, NOT IN A PAGE. sirt-selfcheck's section 2 asserted "the
 * residual falls at every checkpoint" over 200 iterations USING THE OPERATOR THAT DOES NOT DESCEND. Measured
 * on that gate's own fixture (N = 48, 24 angles): the shipped pair bottoms out at iteration ~750 and RISES
 * from 4.345 to 7.556 by 4000, while the matched operator falls monotonically to 0.2945 and is still falling.
 * THE CLAIM WAS TRUE ONLY INSIDE A BUDGET THAT HID THE DEFECT, which is the same shape as a tolerance chosen
 * by looking at where the measurement landed. ***
 */
/**
 * *** v3847 -- THIS IS NOW THE SAME OPERATOR AS THE DEFAULT, AND IT IS KEPT ANYWAY. *** v3846 split the entry
 * points by question; v3847 moved the default to the matched operator, so `landweberDescent` and `landweber`
 * now agree. It is RETAINED rather than deleted for two reasons: v3846's callers and gates keep working
 * against ONE declaration (the rule reconOps.mjs was created to enforce), and the NAME still carries the
 * claim -- code that means "I am minimising a residual" says so, and stays correct if a future round ever
 * reopens the default. IT IS AN ALIAS, NOT A SECOND IMPLEMENTATION; there is no way for the two to drift.
 */
export function landweberDescent(sino, N, angles, nDet, opts = {}) {
    const adjoint = opts.adjoint || ((r) => matchedBackProject(r, N, angles, nDet));
    return landweber(sino, N, angles, nDet, { ...opts, adjoint });
}
