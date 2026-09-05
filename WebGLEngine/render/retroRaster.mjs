// render/retroRaster.mjs -- v4442 -- the two PlayStation artefacts that have exact right answers.
//
// From DaveFace/UnrealRetroShaders (MIT). *** NOTHING IS PORTABLE AT THE FILE LEVEL AND THE LICENCE IS THE
// LEAST OF IT: *** it is UE4.27 Blueprint materials in binary .uasset, and its author states UE5 is
// unsupported because the rendering systems it relies on changed. So it is a dead-ended asset pack for one
// engine version. The TECHNIQUES are portable and are not the author's to license anyway -- they are 1994
// console constraints.
//
// ---- *** THE SPLIT THAT DECIDED WHAT THIS ROUND TAKES *** ------------------------------------------------
//
// This tree grades things that can be WRONG, and "does it look like a PlayStation" cannot be. Shipping an
// aesthetic behind a gate that cannot fail is the unfalsifiable-check problem v4435 and v4439 both found. So
// the pack was split by whether the technique has a right answer:
//
//   Bayer dithering        ALREADY HERE -- fx/dither.js, with tools/ship/dither-selfcheck.mjs. Not taken.
//   YUV / posterise        0 files in the tree, and AESTHETIC ONLY. There is no wrong answer to be caught,
//                          so it is not taken either, and that is a decision rather than an oversight.
//   Affine texture warping TAKEN. It is exactly "interpolate UV without dividing by w", so it has a closed
//                          form, an exact agreement limit, and an error that is exactly zero at the vertices.
//   Vertex wobble          TAKEN. It is exactly quantisation to a fixed-point lattice, so it is idempotent
//                          and bounded by half a step, both to machine precision.
//
// *** WHAT WAS ALREADY HERE AND IS NOT THIS: *** physics/mesh/meshCSG.mjs has snapVertices, which welds
// coincident vertices at a 1e-9 tolerance for boolean robustness. That is vertex snapping in the way a
// spelling checker is a dictionary -- same word, different job -- and it is named here so this file does not
// claim more absence than it measured. `perspectiveCorrect` and `noperspective` really are zero in the tree.

"use strict";

// ---- AFFINE VERSUS PERSPECTIVE-CORRECT INTERPOLATION ------------------------------------------------------
//
// A rasteriser walking screen space has barycentric weights b that are linear IN SCREEN SPACE. An attribute
// that is linear in WORLD space is not linear in screen space once perspective divides by w, so the correct
// interpolation carries the division:
//
//     correct = sum(b_i * a_i / w_i) / sum(b_i / w_i)          affine = sum(b_i * a_i)
//
// The PlayStation had no divider in its rasteriser and used the second. THAT IS THE WHOLE ARTEFACT: textures
// swim across a floor because the interpolation is right at the vertices and wrong in between.

/** Perspective-correct interpolation of a vector attribute. `w` are the clip-space w of the three vertices. */
export function perspectiveCorrect(attrs, w, b) {
    let denom = 0;
    for (let i = 0; i < 3; i++) denom += b[i] / w[i];
    if (denom === 0) return attrs[0].map(() => 0);
    return attrs[0].map((_, k) => {
        let num = 0;
        for (let i = 0; i < 3; i++) num += (b[i] * attrs[i][k]) / w[i];
        return num / denom;
    });
}

/** The affine one. No division by w anywhere -- which is the point, not an omission. */
export function affine(attrs, b) {
    return attrs[0].map((_, k) => b[0] * attrs[0][k] + b[1] * attrs[1][k] + b[2] * attrs[2][k]);
}

/** The artefact itself: how far the affine answer sits from the correct one, at one barycentric point. */
export function warpError(attrs, w, b) {
    const c = perspectiveCorrect(attrs, w, b), a = affine(attrs, b);
    return Math.hypot(...c.map((v, k) => v - a[k]));
}

/**
 * The largest warp error over the triangle, found on a barycentric lattice, with the point returned so a
 * check can assert WHERE it is rather than only how big. Zero at the three vertices for any w, so a maximum
 * sitting on a vertex would mean the interpolation is broken rather than merely affine.
 */
export function worstWarp(attrs, w, { steps = 64 } = {}) {
    let best = { err: -1, b: null };
    for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
            const b = [i / steps, j / steps, 1 - i / steps - j / steps];
            const err = warpError(attrs, w, b);
            if (err > best.err) best = { err, b };
        }
    }
    return best;
}

// ---- VERTEX WOBBLE: QUANTISATION TO A FIXED-POINT LATTICE -------------------------------------------------
//
// The PlayStation held screen-space vertex positions in fixed point with no sub-pixel fraction, so a vertex
// could only land on a lattice site. As the camera moves, a vertex crossing between sites JUMPS, which is
// the wobble. It is quantisation and nothing more, so it has the two properties every quantiser has and they
// are both exact.

/** Snap to a lattice of `1 / 2^bits` units. `bits = 0` is integer pixels, which is what the hardware did. */
export const quantise = (x, bits = 0) => {
    const scale = Math.pow(2, bits);
    return Math.round(x * scale) / scale;
};

/** Snap a position vector. Returns a new array -- a quantiser that mutated its input would be a filter. */
export const snapVertex = (p, bits = 0) => p.map((x) => quantise(x, bits));

/** The lattice step, exposed so a check asserts against the definition rather than against a repeat of it. */
export const latticeStep = (bits = 0) => Math.pow(2, -bits);

/**
 * How many DISTINCT positions a coordinate can take on [lo, hi] at this precision. Exact and countable:
 * a wobble that is subtler than it should be shows up here as a larger number, where an eyeball sees nothing.
 */
export function siteCount(lo, hi, bits = 0) {
    const seen = new Set();
    const step = latticeStep(bits) / 8;
    for (let x = lo; x <= hi + 1e-12; x += step) seen.add(quantise(x, bits));
    return seen.size;
}
