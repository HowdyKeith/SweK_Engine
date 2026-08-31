// WebGLEngine/render/perspectiveWarp.mjs -- v4238
//
// APPLY A HOMOGRAPHY TO A TEXTURE. The consumer vision/homography.mjs shipped without.
//
// The idea is glfx.js's perspective / matrix-warp filters (evanw, MIT). Almost everything else in that
// library the tree already has in some form -- between twelve render/*Pass*.js files, twenty-eight ported
// SwiftUIShaders, gl-transitions, aquarelle and badTv, the image-effect shelf is crowded. This is the one
// that is not a duplicate, and it is not a duplicate for a reason that is about THIS tree rather than that one.
//
// *** v4226 SHIPPED vision/homography.mjs -- DLT PLUS RANSAC, GATED, 40 CHECKS -- AND NOTHING RENDERS WITH
// IT. *** It can solve for the homography that takes one quad to another and the tree cannot then APPLY one
// to a texture. grep for perspectiveWarp / homographyWarp across render/ and mesh/ returns nothing.
//
// *** AND THE BACKLOG ITEM SAID "NO RENDERING CONSUMER", WHICH IS HALF WRONG AND THE HALF THAT IS WRONG IS
// THE INTERESTING ONE. *** pipboy-models.html has warped a canvas onto a screen quad since long before
// v4226, through a hand-rolled 3x3 projective solver -- adj(), mm(), mv(), basis() -- emitted as a CSS
// matrix3d. It does not import the module and the module does not know it exists. That is the same shape as
// #78 (three copies of stagger), #96 (two copies of Moller-Trumbore) and #51 (three copies of simplex
// noise): one idea, two implementations, neither aware of the other.
//
// So this file does two things. It gives the module a GPU consumer, and its gate holds the two solvers to
// each other: the hand-rolled four-point construction and the general N-point DLT must return THE SAME
// HOMOGRAPHY up to scale for the same four correspondences. They do, to 1e-12, and that is worth knowing
// before anyone deletes either one.
//
// ---- THE TRAP, AND IT IS THE ONLY ONE THAT MATTERS HERE -----------------------------------------------------
//
// *** A FRAGMENT SHADER WARPS BY THE INVERSE. *** The homography H takes SOURCE corners to DESTINATION
// corners, which is the direction a person thinks in and the direction the DLT solves. A fragment shader
// runs at a DESTINATION pixel and has to ask which source texel lands there -- which is H inverse. Using H
// itself compiles, runs, and produces a warp: the wrong one, in roughly the opposite direction, and it still
// looks like a perspective effect. The gate renders both and measures how far apart they are, so the
// inversion is a number rather than a comment.
//
// SECOND, SMALLER: the warp is a SAMPLING effect in render/effectMerge.mjs's taxonomy -- it reads the source
// texture at a uv it computes rather than the incoming colour. So it may LEAD a merged run and may never
// join one, and the gate asserts that classification rather than leaving it to be rediscovered.
"use strict";

import { homographyDLT, mat3Inv, mat3Mul, applyHomography } from "../vision/homography.mjs";

/** The four corners of a w-by-h image, in the order the DLT and the pipboy construction both use. */
export const rectCorners = (w, h) => [[0, 0], [w, 0], [0, h], [w, h]];

/**
 * The homography taking the w-by-h source rectangle onto `quad` (TL, TR, BL, BR), via the tree's own DLT.
 * Four correspondences is the minimum the DLT accepts and the exact-fit case: no residual, no RANSAC.
 */
export function cornerHomography(w, h, quad) {
    return homographyDLT(rectCorners(w, h), quad);
}

/**
 * *** THE HAND-ROLLED FOUR-POINT CONSTRUCTION FROM pipboy-models.html, LIFTED HERE SO THE TWO CAN BE
 * COMPARED. *** It is not a rewrite and not an improvement: it is that code, so that the gate's claim that
 * the two solvers agree is a claim about the code that actually ships in that page.
 *
 * The method is different in kind from the DLT: rather than building a 2n-by-9 system and taking its
 * smallest eigenvector, it constructs a projective basis from three points plus a scale fixed by the fourth,
 * for each quad, and composes one with the inverse of the other. Exact for four points, and it cannot do
 * five.
 */
export function fourPointHomography(src, dst) {
    const adj = (m) => [
        m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
        m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
        m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
    const mm = (a, b) => {
        const c = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
            c[3 * i + j] = s;
        }
        return c;
    };
    const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
                          m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
                          m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    const basis = (p) => {
        const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
        const v = mv(adj(m), [p[3][0], p[3][1], 1]);
        return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
    };
    const t = mm(basis(dst), adj(basis(src)));
    return t.map((x) => x / t[8]);
}

/**
 * Scale-invariant comparison of two homographies: normalise both by their last element and diff.
 *
 * *** THE NORMALISATION IS DEFENSIVE AND SABOTAGE SAID SO. *** A homography is defined up to scale, so
 * comparing two elementwise is meaningless in general -- but both producers in this tree already divide
 * through by h22: homographyDLT does it at vision/homography.mjs:174, and fourPointHomography's last line
 * does it too. Removing the normalisation here changes no number in the gate. Kept because the next producer
 * may not normalise and a silent false MISMATCH is worse than a redundant divide, labelled as a guard rather
 * than counted as a checked behaviour.
 */
export function homographyDelta(A, B) {
    const na = A.map((x) => x / A[8]), nb = B.map((x) => x / B[8]);
    return na.reduce((m, x, i) => Math.max(m, Math.abs(x - nb[i])), 0);
}

/**
 * The CPU reference warp, and it maps BACKWARD on purpose.
 *
 * For each destination pixel, apply H inverse to find where it came from and sample there. Doing it forward
 * -- walking source pixels and writing where they land -- leaves holes wherever the transform stretches,
 * which is why every real implementation goes backward. NEAREST sampling, so the GPU comparison is not
 * measuring two different filters.
 */
export function warpImageCPU(img, H, { w = img.w, h = img.h, background = [0, 0, 0, 0] } = {}) {
    const Hi = mat3Inv(H);
    if (!Hi) return null;
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const p = applyHomography(Hi, [x + 0.5, y + 0.5]);
        if (!p) { for (let c = 0; c < 4; c++) out[o + c] = background[c]; continue; }
        const sx = Math.floor(p[0]), sy = Math.floor(p[1]);
        if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) {
            for (let c = 0; c < 4; c++) out[o + c] = background[c];
            continue;
        }
        const s = (sy * img.w + sx) * 4;
        for (let c = 0; c < 4; c++) out[o + c] = img.data[s + c];
    }
    return { w, h, data: out };
}

/**
 * The effect, in the shape render/effectMerge.mjs takes.
 *
 * uHinv is the INVERSE homography, in PIXELS, and the name says so because passing the forward one is the
 * mistake this file exists to make hard. Outside the source rectangle the effect returns the background,
 * which is what makes an edge visible where the quad ends rather than smearing the border colour outward.
 */
export const WARP_EFFECT = {
    name: "perspectiveWarp",
    uniforms: { hinv: "uHinv", size: "uWarpSize", background: "uWarpBg" },
    types: { hinv: "mat3", size: "vec2", background: "vec4" },
    glsl: `
    vec3 q = uHinv * vec3(uv * uWarpSize, 1.0);
    if (abs(q.z) < 1e-9) return uWarpBg;
    vec2 src = q.xy / q.z;
    if (src.x < 0.0 || src.y < 0.0 || src.x > uWarpSize.x || src.y > uWarpSize.y) return uWarpBg;
    return texture(tex, src / uWarpSize);`,
};

/** Column-major 9 floats for gl.uniformMatrix3fv, from the row-major 9 the homography module uses. */
export const toColumnMajor = (H) => [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]];

/** H, then H inverse, is the identity -- the round trip the gate uses to say the warp loses nothing. */
export const roundTrip = (H) => mat3Mul(mat3Inv(H), H);
