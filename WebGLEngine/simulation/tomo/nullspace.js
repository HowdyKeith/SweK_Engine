// WebGLEngine/simulation/tomo/nullspace.js — v2543
//
// WHAT AM I NOT SEEING?
//
// Every limited-angle reconstruction has a NULL SPACE: a set of images that project to EXACTLY ZERO at every
// angle you measured. Add any of them to your answer and the data agrees just as well. Subtract one and it still
// agrees. The measurement cannot see them, and no amount of iterating changes that -- it is a property of the
// operator, not of the algorithm.
//
// So every reconstruction has to pick one answer out of an infinite family, and it picks with a PRIOR. This
// engine already ships two of them, right next to the projector: tvGradient and smoothGradient. They are what
// "connects the missing tissue". Then the reconstruction is handed over as ONE IMAGE WITH NO SEAM SHOWING, and
// nobody can tell which voxels were MEASURED and which the regulariser INVENTED.
//
// That is the thing worth objecting to. Not that a prior is used -- you cannot avoid it -- but that its
// contribution is INVISIBLE in the output.
//
// ---- THE MOVE: TAKE SLICES WHERE YOU EXPECT NOTHING --------------------------------------------------------
//
// A null-space image is A CONTROL, in this engine's oldest sense: it MUST project to zero. If it does not, the
// construction is wrong. And if you reconstruct one and SEE STRUCTURE, that structure came from the prior, not
// from the object -- because the data for it is identically zero.
//
// That is the honest version of "what am I not seeing": not a better picture, but a MAP OF WHERE THE PICTURE IS
// NOT EVIDENCE.
//
// ---- HOW ---------------------------------------------------------------------------------------------------
//
// Landweber: x <- x - lambda * A^T(A x). Each step pushes x's projections toward zero and leaves whatever the
// operator is blind to untouched. Run it from noise and what survives IS the null space -- no priors, no
// inversion, no matrix ever formed. The operator is only ever applied, never stored: an n=64 image against 60
// angles would be a 3840 x 4096 matrix, and forming it to take an SVD is how this becomes a supercomputer
// problem instead of a page.
//
// A CONVERGENCE CAVEAT, STATED RATHER THAN HIDDEN: Landweber leaves the null space untouched and shrinks the
// rest at a rate set by the singular values. Directions with TINY singular values shrink very slowly, so a finite
// run returns the true null space PLUS the nearly-invisible directions. That is arguably the more useful object
// -- a direction the data constrains at 1e-9 is not evidence either -- but it is not the textbook null space, and
// calling it one would be a lie. residualOf() reports how far it got.
"use strict";

import { project, backProject } from "./iterative.js";

/**
 * Build an image the measurements cannot see.
 * @param {number} n        image is n x n
 * @param {number[]} angles the angles you ACTUALLY measured, radians
 * @param {{iters?: number, lambda?: number, seed?: number, nDet?: number}} [opts]
 * @returns {{img: Float64Array, residual: number, iters: number}}
 */
export function nullSpaceImage(n, angles, opts = {}) {
    const iters = opts.iters ?? 260;
    const nDet = opts.nDet ?? n;
    const lambda = opts.lambda ?? 1.6 / (angles.length || 1);
    let s = (opts.seed ?? 12345) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };

    const x = new Float64Array(n * n);
    for (let i = 0; i < x.length; i++) x[i] = rnd();
    // Start from noise, not from a picture: a picture would bias which null direction we land in, and the whole
    // point is that the data does not choose one.

    for (let it = 0; it < iters; it++) {
        const g = new Float64Array(n * n);
        for (const th of angles) {
            const p = project(x, n, th, nDet);   // A x -- the shadow this image casts
            backProject(p, n, th, nDet, g);      // A^T (A x), ACCUMULATED into g (it takes an out buffer and
        }                                        // returns nothing -- read the signature, do not assume)
        for (let i = 0; i < x.length; i++) x[i] -= lambda * g[i];
    }
    normalise(x);
    return { img: x, residual: residualOf(x, n, angles, nDet), iters };
}

/**
 * THE CONTROL. How much shadow does this image cast at the angles you measured? For a true null-space image the
 * answer is zero. This is the number that decides whether any of the rest is honest.
 * @returns {number} max |projection| over all measured angles, relative to the image's own scale
 */
export function residualOf(img, n, angles, nDet = n) {
    let peak = 0;
    for (let i = 0; i < img.length; i++) peak = Math.max(peak, Math.abs(img[i]));
    if (peak <= 0) return 0;
    let worst = 0;
    for (const th of angles) {
        const p = project(img, n, th, nDet);
        for (let i = 0; i < p.length; i++) worst = Math.max(worst, Math.abs(p[i]));
    }
    // relative to what the image's own peak WOULD cast if it were solid: otherwise a tiny image looks null
    return worst / (peak * n);
}

/**
 * THE DEMONSTRATION, and it is the whole argument in one call: two images, the SAME measurements.
 * Returns the truth, the truth plus a null-space image, and the projection difference between them.
 * If `projDiff` is ~0 while the images differ visibly, then NO ALGORITHM CAN TELL THEM APART FROM THE DATA. Any
 * that claims to is reporting its prior.
 */
export function indistinguishablePair(truth, n, angles, opts = {}) {
    const ns = nullSpaceImage(n, angles, opts);
    const amp = opts.amp ?? 0.6;
    const other = new Float64Array(n * n);
    let peak = 0;
    for (let i = 0; i < truth.length; i++) peak = Math.max(peak, Math.abs(truth[i]));
    for (let i = 0; i < other.length; i++) other[i] = truth[i] + amp * peak * ns.img[i];

    let projDiff = 0, projScale = 0;
    for (const th of angles) {
        const a = project(truth, n, th, n), b = project(other, n, th, n);
        for (let i = 0; i < a.length; i++) {
            projDiff = Math.max(projDiff, Math.abs(a[i] - b[i]));
            projScale = Math.max(projScale, Math.abs(a[i]));
        }
    }
    let imgDiff = 0;
    for (let i = 0; i < truth.length; i++) imgDiff = Math.max(imgDiff, Math.abs(truth[i] - other[i]));
    return {
        truth, other, nullImg: ns.img,
        projDiff: projScale > 0 ? projDiff / projScale : projDiff,   // relative: "how different is the DATA"
        imgDiff: peak > 0 ? imgDiff / peak : imgDiff,                // "how different is the PICTURE"
        residual: ns.residual,
    };
}

/**
 * Where is a reconstruction NOT EVIDENCE? Runs the null-space construction from several seeds and reports, per
 * pixel, how much the answer is free to move without changing a single measurement.
 *
 * This is the map that should ship beside every reconstruction and never does. Bright = the data does not
 * constrain this pixel; whatever is there came from the prior.
 */
export function uncertaintyMap(n, angles, opts = {}) {
    const k = opts.samples ?? 6;
    const acc = new Float64Array(n * n);
    let worstResidual = 0;
    for (let j = 0; j < k; j++) {
        const ns = nullSpaceImage(n, angles, { ...opts, seed: (opts.seed ?? 12345) + j * 7919 });
        worstResidual = Math.max(worstResidual, ns.residual);
        for (let i = 0; i < acc.length; i++) acc[i] += Math.abs(ns.img[i]);
    }
    for (let i = 0; i < acc.length; i++) acc[i] /= k;
    normalise(acc);
    return { map: acc, samples: k, residual: worstResidual };
}

function normalise(a) {
    let m = 0;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
    if (m > 0) for (let i = 0; i < a.length; i++) a[i] /= m;
    return a;
}
