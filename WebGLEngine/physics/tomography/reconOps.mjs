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
 * x <- x + step * B (b - A x). B DEFAULTS TO backProject, which is what sirt.mjs shipped at v3613 and what its
 * hash-pinned checks still hold -- and v3616 measured that THIS PAIR TURNS ROUND past ~1000 iterations, so the
 * default must be stopped early. Pass matchedBackProject for the operator that descends instead.
 */
export function landweber(sino, N, angles, nDet, { iters = 300, step = null, x0 = null, every = 50, adjoint = null } = {}) {
    const B = adjoint || ((r) => backProject(r, N, angles, nDet));
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
