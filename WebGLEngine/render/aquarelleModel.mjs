// FILE: render/aquarelleModel.mjs -- v4177
//
// CPU reference for render/aquarellePass.js, ported from Ramotion/aquarelle (MIT (c) 2016 Ramotion).
// *** NOT crtModel.js's MASK. *** (v4302, #144.) The mask here is aquarelle's dissolve texture; crtModel.js's
// mask() is the aperture grille. Same word, unrelated things -- see the paragraph in render/aquarellePass.js.
//
// What the effect is: one image dissolves into another along a MASK, and the mask's edge is warped by two
// octaves of simplex noise so it creeps and feathers like ink through paper instead of cross-fading. Three
// things happen per pixel and only the middle one is obvious:
//
//   1. the SOURCE is sampled at a slightly rotated offset  -- a gentle wobble in the image itself
//   2. the MASK is sampled at a heavily warped position     -- the ragged bleeding edge, and the whole effect
//   3. the output is the source's colour with the MASK's alpha
//
// *** THE TWO WARPS ARE DIFFERENT IN KIND AND THE ORIGINAL'S CONSTANTS SAY SO. *** The image warp is
// Amplitude * 0.001 -- at the default Amplitude of 50 that is 0.05 of a UV, a nudge. The mask warp is two
// fixed octaves at 0.07 and 0.02, roughly THREE TIMES larger, and at fixed frequencies 20 and 70 that the
// original does not expose as knobs. Reproduced here at those values rather than tidied into one
// parameterised warp: the asymmetry IS the look, and a "cleaner" version with one shared amplitude would
// dissolve evenly and stop looking like paper.
"use strict";

import { snoise3 } from "../shaders/ashimaNoise.mjs";

/** The original's defaults, kept exactly -- see the v4169 lesson about a flat knob map losing per-effect values. */
export const DEFAULTS = Object.freeze({
    amplitude: 50,     // image-warp strength; multiplied by 0.001 before use
    frequency: 10,     // image-warp noise frequency
});

/** The two mask octaves. Fixed in the original and NOT exposed as uniforms; named here so they are visible. */
export const MASK_OCTAVES = Object.freeze([
    Object.freeze({ frequency: 20, amplitude: 0.07 }),   // large: the overall creep of the edge
    Object.freeze({ frequency: 70, amplitude: 0.02 }),   // small: the fibrous fringe on top of it
]);

/** The angle multiplier the original applies to the noise. See ashimaNoise.mjs on why this does not span one turn. */
export const ANGLE_SCALE = 3.14;

/**
 * Where the SOURCE image is sampled for the pixel at uv. Returns [u, v].
 * noise -> angle -> a unit vector at that angle, scaled. A rotation, not a displacement along the gradient,
 * which is why the wobble curls rather than pushing everything one way.
 */
export function sourceOffset(u, v, opts = {}) {
    const amplitude = opts.amplitude ?? DEFAULTS.amplitude;
    const frequency = opts.frequency ?? DEFAULTS.frequency;
    const angle = snoise3(u * frequency, v * frequency, 0) * ANGLE_SCALE;
    return [u + Math.cos(angle) * amplitude * 0.001, v + Math.sin(angle) * amplitude * 0.001];
}

/**
 * Where the MASK is sampled for the pixel at uv. Returns [u, v].
 * Both octaves are accumulated onto the SAME shift, and each reads the noise at the ORIGINAL uv rather than
 * at the running shifted one -- so this is two independent displacements summed, not a domain warp fed
 * through itself. Reproducing that faithfully matters: chaining them would smear far more and is the obvious
 * "improvement" to make by accident.
 */
export function maskShift(u, v) {
    let su = u, sv = v;
    for (const o of MASK_OCTAVES) {
        const n = snoise3(u * o.frequency, v * o.frequency, 0);
        su += Math.cos(n) * o.amplitude;
        sv += Math.sin(n) * o.amplitude;
    }
    return [su, sv];
}

/**
 * The whole per-pixel operation, given samplers for the two textures.
 * @param sampleSource (u,v) => [r,g,b,a]
 * @param sampleMask   (u,v) => [r,g,b,a]
 * @returns [r,g,b,a] -- the SOURCE's colour with the MASK's alpha, which is the original's last line.
 */
export function aquarellePixel(u, v, sampleSource, sampleMask, opts = {}) {
    const [su, sv] = sourceOffset(u, v, opts);
    const src = sampleSource(su, sv);
    const [mu, mv] = maskShift(u, v);
    const msk = sampleMask(mu, mv);
    return [src[0], src[1], src[2], msk[3]];
}

/**
 * How far, in UV, this effect can reach outside the pixel it is shading. A caller needs it to decide texture
 * wrapping: with CLAMP_TO_EDGE the border smears, with REPEAT it wraps around. The original sets neither and
 * inherits whatever the textures happened to have, which is how the same shader looks different in two apps.
 * Worst case is every octave pulling the same direction at once.
 */
export function maxReach(opts = {}) {
    const amplitude = opts.amplitude ?? DEFAULTS.amplitude;
    return { source: amplitude * 0.001,
             mask: MASK_OCTAVES.reduce((n, o) => n + o.amplitude, 0) };
}
