// WebGLEngine/render/exactHash.mjs -- v4569
//
// *** A HASH A CPU AND A GPU DRAW THE SAME NUMBER FROM. ***
//
// fract(sin(dot(p, K)) * 43758.5453) is the shape used all over the web, and it is not an approximation of a
// random number -- it is a DIFFERENT random number in float32 than in float64. sin(x) * 43758 amplifies the
// last bits of x by four orders of magnitude, so a float32 GPU and a float64 CPU twin do not round the same
// value differently, they draw unrelated values. v4558 measured it over 20,000 sample points for the BCS
// shader family: 79.4% diverged by more than 0.1 and the worst pair was 0.9960 against 0.0000.
//
// THE CONSEQUENCE IS NOT ALWAYS COSMETIC. render/grassModel.mjs exists to mirror render/grassField.js "so the
// two can be compared term by term", and its bladeHash decides `if (bladeHash < slopeSuppress) return
// { drawn: false }` -- whether a blade of grass exists. Measured over 32,000 blade origins on the 0.25 m
// lattice the field actually uses: the two halves disagree by more than 0.1 on 65.0% of them, worst delta
// 1.0000, and THE DRAWN DECISION FLIPS ON 65.4%. A model that is wrong about two thirds of the grass is not
// a model, and nothing noticed because its gate checks a different hash.
//
// ---- WHY THIS IS A THIRD COPY, AND WHY THAT IS NOT DUPLICATION ------------------------------------------
//
// v4558 shipped this arithmetic twice on purpose: bcsHash/bcsUMix in render/swiftShaderModel.mjs and
// bcs_hash/bcs_umix in the GLSL inside render/swiftShaderPass.js, with a comment on the second saying it
// "MUST stay character-for-character equivalent" and tools/ship/swiftShaders-selfcheck.mjs running both and
// comparing. That pair is gated, working, and not worth reopening to thread an import through a shader
// string. So this module is the home for every OTHER user, and the tie is a measurement rather than a
// promise: tools/ship/exactHash-selfcheck.mjs asserts exactHash2(x, y) equals bcsHash(x, y) across a sweep.
// Three copies held to one answer by two gates beats two copies and a new idiom.
//
// ---- WHAT IT DOES ---------------------------------------------------------------------------------------
//
// Quantise to a 1/256 lattice, then run an INTEGER avalanche (Wang / lowbias32). Integer arithmetic is exact
// in both precisions, so the two agree BIT FOR BIT wherever the quantised coordinate agrees -- which turns an
// everywhere-different number into an occasional boundary pixel.
//
// BOUNDED ON PURPOSE: the lattice coordinate wraps into 2^24 before the integer conversion, because 2^24 is
// the largest integer float32 represents exactly. Above it a float32 input has already lost the precision
// this hash needs, so the wrap is where the guarantee ends -- stated rather than left to be discovered. It is
// also what keeps the GLSL `uvec2(q)` conversion defined: the wrap yields a NON-NEGATIVE q, and converting a
// negative float to uint is undefined behaviour.
//
// *** IT CHANGES WHAT THE SHADERS LOOK LIKE, AND THAT IS THE TRADE. *** A different hash is a different noise
// field: grain, thinning and every fbm built on them draw a new pattern. The STRUCTURE is unchanged -- same
// lattice, same octaves, same amplitudes -- and a pattern two halves can be held to is worth more than a
// prettier one neither can.
"use strict";

/** 32-bit avalanche (Wang / lowbias32). Integer-only, so float32 and float64 agree BIT FOR BIT. */
export function umix(h) {
    h = h >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;   h = Math.imul(h, 0x7feb352d) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;   h = Math.imul(h, 0x846ca68b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The 2-D hash. `seed` decorrelates two hashes at the same coordinate, which is what the old idiom used its
 * magic constants for -- voxelrenderer draws three of them from one cell and they must not agree.
 *
 * AT seed = 0 THIS IS EXACTLY swiftShaderModel.bcsHash, because `x ^ 0` is `x`. That is deliberate: the
 * proven function is the seed-0 case of this one rather than a thing this one resembles.
 */
export function exactHash2(x, y, seed = 0) {
    let qx = Math.floor(x * 256), qy = Math.floor(y * 256);
    qx -= 16777216 * Math.floor(qx / 16777216);
    qy -= 16777216 * Math.floor(qy / 16777216);
    const hy = umix(((Math.imul(qy, 0xd8163841) >>> 0) ^ (seed >>> 0)) >>> 0);
    return umix(((Math.imul(qx, 0x8da6b343) >>> 0) ^ hy) >>> 0) / 4294967296;
}

/** The 1-D form, for callers that already reduced a coordinate to one number. */
export function exactHash1(x, seed = 0) { return exactHash2(x, 0, seed); }

/**
 * The same arithmetic as GLSL, to be spliced into a shader that needs it. Character-for-character equivalent
 * to the functions above -- tools/ship/exactHash-selfcheck.mjs holds the two to each other on a device.
 */
/**
 * The WGSL form. Same arithmetic, and the differences from the GLSL are the language's, not the hash's:
 * u32 rather than uint, vec2u rather than uvec2, and `>>` on u32 is already logical so no `u` suffixes.
 */
export const EXACT_HASH_WGSL = `
fn exact_umix(hi: u32) -> u32 {
    var h = hi;
    h ^= h >> 16u;   h *= 0x7feb352du;
    h ^= h >> 15u;   h *= 0x846ca68bu;
    h ^= h >> 16u;
    return h;
}
fn exact_hash(p: vec2f, seed: u32) -> f32 {
    var q = floor(p * 256.0);
    q -= 16777216.0 * floor(q * (1.0 / 16777216.0));   // 2^24: the last integer f32 holds exactly
    let u = vec2u(q);                                   // defined only because the wrap made q non-negative
    return f32(exact_umix((u.x * 0x8da6b343u) ^ exact_umix((u.y * 0xd8163841u) ^ seed))) * (1.0 / 4294967296.0);
}
`;

export const EXACT_HASH_GLSL = `
uint exact_umix(uint h) {
    h ^= h >> 16u;   h *= 0x7feb352du;
    h ^= h >> 15u;   h *= 0x846ca68bu;
    h ^= h >> 16u;
    return h;
}
float exact_hash(vec2 p, uint seed) {
    vec2 q = floor(p * 256.0);
    q -= 16777216.0 * floor(q * (1.0 / 16777216.0));   // 2^24: the last integer float32 holds exactly
    uvec2 u = uvec2(q);                                 // defined only because the wrap made q non-negative
    return float(exact_umix((u.x * 0x8da6b343u) ^ exact_umix((u.y * 0xd8163841u) ^ seed))) * (1.0 / 4294967296.0);
}
`;
