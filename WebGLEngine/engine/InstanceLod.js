// FILE: engine/InstanceLod.js
// VERSION: v1 — round 355
//
// Distance-based LoD for instanced renderers (OVM/MOL/MTO). The core
// idea: render only a prefix of the instance buffer when an entity is
// far from the camera, but make sure ANY prefix is a visually uniform
// subset of the full set — not just "the first N items in some sweep
// order" which would bias toward one corner of the entity.
//
// We achieve this with a bit-reversal permutation applied at add()
// time. For N=8: [0,4,2,6,1,5,3,7]. Any prefix is approximately
// uniformly distributed across the original index range. Works for
// non-power-of-2 N too — we use bit-reversal modulo the next power of
// 2 and filter out the over-range hits, keeping uniformity.

/** LoD fractions for each tier (0=close, 3=very far). */
export const LOD_FRACTIONS = [1.0, 0.5, 0.25, 0.125];
export const LOD_LEVELS = LOD_FRACTIONS.length;

/**
 * Default LoD-level thresholds in entity-radius multiples. An entity
 * is LOD0 if the camera is within radius * 3 of its bounding sphere
 * surface, LOD1 within radius * 8, etc.
 */
export const DEFAULT_LOD_THRESHOLDS = [3, 8, 20];

/**
 * Compute LoD level given world-space distance from camera to entity
 * center, the entity's world-space radius, and threshold multipliers.
 *
 * @returns {0|1|2|3}
 */
export function computeLodLevel(distance, radius, thresholds = DEFAULT_LOD_THRESHOLDS) {
    if (radius <= 0) return 0;
    const surfaceDist = Math.max(0, distance - radius);
    const ratio = surfaceDist / radius;
    if (ratio < thresholds[0]) return 0;
    if (ratio < thresholds[1]) return 1;
    if (ratio < thresholds[2]) return 2;
    return 3;
}

/**
 * Bit-reversal permutation of [0, n). Any prefix is a visually
 * uniform subset of the original. Non-power-of-2 n is handled by
 * computing bit-reversal modulo the next power of 2 and skipping
 * values that would fall out of range.
 *
 * @returns Uint32Array(n) — perm[i] gives the original index that
 *          should be placed at scrambled position i.
 */
export function bitReverseIndices(n) {
    if (n <= 1) {
        const out = new Uint32Array(n);
        for (let i = 0; i < n; i++) out[i] = i;
        return out;
    }
    const bits = Math.ceil(Math.log2(n));
    const limit = 1 << bits;
    const perm = new Uint32Array(n);
    let outIdx = 0;
    for (let i = 0; i < limit && outIdx < n; i++) {
        let rev = 0, x = i;
        for (let b = 0; b < bits; b++) {
            rev = (rev << 1) | (x & 1);
            x >>>= 1;
        }
        if (rev < n) perm[outIdx++] = rev;
    }
    return perm;
}

/**
 * Apply a permutation to an interleaved instance array. The array is
 * assumed to be `n × stride` elements; this rewrites it as
 * `out[i*stride + s] = src[perm[i]*stride + s]`.
 *
 * Allocates a fresh typed-array of the same constructor as src.
 */
export function applyPermutation(src, perm, stride) {
    const Ctor = src.constructor;
    const n = perm.length;
    const out = new Ctor(n * stride);
    for (let i = 0; i < n; i++) {
        const srcBase = perm[i] * stride;
        const outBase = i * stride;
        for (let s = 0; s < stride; s++) {
            out[outBase + s] = src[srcBase + s];
        }
    }
    return out;
}

/**
 * Reorder a single-value-per-instance typed array (e.g., the AO
 * bitmask array in OVM, or the radius array in MOL).
 */
export function applyPermutation1(src, perm) {
    return applyPermutation(src, perm, 1);
}
