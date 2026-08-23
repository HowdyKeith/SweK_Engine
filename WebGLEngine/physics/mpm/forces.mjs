// physics/mpm/forces.mjs -- v3793
//
// *** THE PIECE THAT CONNECTS THE STRESS TO THE GRID, AND THE FIRST ONE IN THIS ARC THAT IS ASSEMBLY RATHER
// THAN A NEW IDEA. v3791 computes a stress for a deformation gradient and v3790 steps a grid; NOTHING JOINED
// THEM, so the stress was a number nobody spent. This scatters it as force. ***
//
// *** THE KEY IS NEWTON'S THIRD LAW AND IT IS EXACT: THE INTERNAL FORCES SUM TO ZERO OVER THE WHOLE GRID.
// Internal stress cannot accelerate the centre of mass -- a block cannot push itself across the room -- so
// sum(f_i) over every node is EXACTLY zero to round-off, whatever the stress, whatever the deformation and
// however the particles are arranged. NOT A TOLERANCE.
//
// The mechanism is worth stating because it is why the identity is exact rather than approximate: each
// particle scatters -V0 * P * F0^T * gradW to its nine nodes, and THE QUADRATIC B-SPLINE GRADIENTS SUM TO
// EXACTLY ZERO over the stencil (they are the derivative of weights that sum to a constant 1). So every
// particle's contribution cancels within its own stencil, and the total cancels term by term. *** A PLANT
// THAT BREAKS THE GRADIENT SUM BREAKS THE THIRD LAW, AND THE BLOCK STARTS PUSHING ITSELF. ***

import { quadWeights } from "./transfer.mjs";
import { mul, transpose, det } from "./constitutive.mjs";

/** Quadratic B-spline weights AND their derivatives for one axis. */
export function quadWeightsGrad(x, h) {
    const xi = x / h;
    const base = Math.floor(xi - 0.5);
    const fx = xi - base;
    const w = [0.5 * (1.5 - fx) * (1.5 - fx), 0.75 - (fx - 1) * (fx - 1), 0.5 * (fx - 0.5) * (fx - 0.5)];
    // d/dx of the above, remembering the 1/h from the chain rule
    const dw = [(fx - 1.5) / h, (-2 * (fx - 1)) / h, (fx - 0.5) / h];
    return { base, w, dw };
}

/**
 * Scatter internal stress as force onto the grid.
 *
 * *** `skipChainRule` DEFAULTS TO FALSE AND IS THE PLANT: it drops the 1/h from the weight DERIVATIVE while
 * leaving the weights themselves alone. That is a units error, not a scramble -- the forces keep their shape
 * and their sign and are merely mis-scaled by the cell size -- AND IT DOES NOT BREAK THE THIRD LAW, because
 * scaling every gradient by the same constant leaves a sum of zero at zero. IT IS THE WRONG PLANT and is kept
 * here NAMED AS SUCH, because finding that out is what the round is about. `breakStencil` is the plant that
 * works: it perturbs ONE gradient of the nine, so they no longer sum to zero. ***
 *
 * @param particles each with {x, y, vol0, F} -- reference volume and deformation gradient
 * @returns {{fx: Float64Array, fy: Float64Array, netX, netY}} nodal forces and their sum
 */
export function stressForces(particles, g, stressOf, { skipChainRule = false, breakStencil = false } = {}) {
    const fx = new Float64Array(g.n), fy = new Float64Array(g.n);
    for (const p of particles) {
        const { P } = stressOf(p.F, p);
        if (!P || !Number.isFinite(P[0])) continue;         // an inverted particle contributes NOTHING, loudly
        // the Cauchy-equivalent scatter: -V0 * P * F0^T, with F0 the reference (identity here) so it is -V0*P
        const S = mul(P, transpose(p.F0 || [1, 0, 0, 1]));
        const X = quadWeightsGrad(p.x, g.h), Y = quadWeightsGrad(p.y, g.h);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
            const i = X.base + a, j = Y.base + b;
            if (i < 0 || j < 0 || i > g.nx || j > g.ny) continue;
            let gx = X.dw[a] * Y.w[b], gy = X.w[a] * Y.dw[b];
            if (skipChainRule) { gx *= g.h; gy *= g.h; }     // the units error: undo the 1/h
            if (breakStencil && a === 0 && b === 0) { gx *= 1.05; gy *= 1.05; }   // one leg of nine, 5% off
            const k = j * (g.nx + 1) + i;
            fx[k] -= p.vol0 * (S[0] * gx + S[1] * gy);
            fy[k] -= p.vol0 * (S[2] * gx + S[3] * gy);
        }
    }
    let netX = 0, netY = 0;
    for (let k = 0; k < g.n; k++) { netX += fx[k]; netY += fy[k]; }
    return { fx, fy, netX, netY };
}

/** The nine quadratic gradients over a full stencil, which must sum to zero on each axis. */
export function stencilGradientSum(x, h) {
    const { dw, w } = quadWeightsGrad(x, h);
    return { dSum: dw[0] + dw[1] + dw[2], wSum: w[0] + w[1] + w[2] };
}

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
// v3941 -- SEPARATOR-TOLERANT AND ANCHORED. `split("/")` returns THE WHOLE PATH on Windows, so this
// guard was false and the block below never ran there. The leading "/" matters too: without it
// `.../loopScope.mjs`.endsWith("Scope.mjs") is true, and a sibling could wake somebody else's main
// block. THIS FILE MAY NOT IMPORT node:url -- a browser page imports it -- so a basename compare is
// the strongest form available here, and winPathGuard re-derives that exemption rather than trusting it.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith("/" + process.argv[1].split(/[\\/]/).pop())) {
    Promise.all([import("./transfer.mjs"), import("./constitutive.mjs")]).then(([T, C]) => {
        const g = T.makeGrid(12, 12, 1);
        const par = C.lame(1000, 0.3);
        const ps = T.rotatingBlock({ nx: 5, ny: 5, spacing: 0.5 }).map((p) => ({
            ...p, vol0: 0.25, F: [1.08, 0.04, -0.02, 0.95], F0: [1, 0, 0, 1],
        }));
        const stressOf = (F) => C.firstPiola(F, par);
        for (const opts of [{}, { skipChainRule: true }, { breakStencil: true }]) {
            const r = stressForces(ps, g, stressOf, opts);
            const tag = Object.keys(opts)[0] || "honest";
            console.log("[forces] " + tag.padEnd(16) + " net (" + r.netX.toExponential(3) + ", " +
                        r.netY.toExponential(3) + ")");
        }
        const s = stencilGradientSum(3.37, 1);
        console.log("[forces] stencil: weights sum " + s.wSum.toFixed(12) + "   gradients sum " + s.dSum.toExponential(3));
    });
}
