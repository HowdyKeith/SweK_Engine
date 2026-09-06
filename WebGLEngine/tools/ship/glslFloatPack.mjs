// WebGLEngine/tools/ship/glslFloatPack.mjs -- v4483
//
// *** A WebGL2 READBACK IS EIGHT BITS, SO NO GLSL RESULT IN THIS TREE HAS EVER BEEN GRADED FINER THAN 1/255. ***
//
// tools/ship/webgpuHarness.mjs has driven real GLSL on a real device since v4284 and every caller compares
// RGBA8 pixels, because that is what gl.readPixels returns from a default framebuffer. For a picture that is
// the right resolution -- v4481 measured what 8 bits costs a bloom chain and the answer was "nothing, until
// something exceeds 1.0". For an ARITHMETIC claim it is hopeless: "the shader agrees with the CPU to 1/255"
// cannot tell a correct projection from one wrong in the fourth decimal place.
//
// This packs a float across three channels before the framebuffer sees it, so a value comes back with ~23 bits
// instead of 8. It is gate infrastructure, not engine code: nothing shipped needs it, and every gate that wants
// to grade a GLSL number rather than a GLSL picture does.
//
// ---- THE OBVIOUS WAY TO WRITE THIS IS WRONG AT EXACTLY ONE INPUT, AND IT IS THE MAXIMUM --------------------
//
// The first draft was `floor(v * 16777215.0 + 0.5)`, which is the standard idiom and which MEASURED CORRECT on
// 255 of 256 test values. At v = 1.0 it returns 16777216, not 16777215: the product is 16777215, adding 0.5
// gives 16777215.5, AND THAT IS NOT REPRESENTABLE IN f32 -- it needs 25 mantissa bits, so it rounds to 2^24
// before floor() ever runs. The high byte then computes as 256, saturates to 255 on write, and both low bytes
// come out ZERO. The decoded value is 0.99609 instead of 1.0: an error of one whole 8-bit step, at the top of
// the range, from a rounding term that is correct everywhere else.
//
// *** THAT IS THE VALUE A PROJECTION TEST CARES ABOUT MOST. *** The extremes are where the horizon, the poles
// and the clamps live. A packer that is exact in the middle and wrong at the edge would have reported the
// interesting cases as failures and the boring ones as passes. The min() below is the fix and the gate holds
// the boundary by name.
//
// ---- WHAT THIS ACHIEVES, MEASURED RATHER THAN CLAIMED -------------------------------------------------------
//
// 24 bits is what the encoding HOLDS; 23 is what the round trip returned on this box. Over 256 exactly
// representable values the worst error was 2 steps of 2^-24, or 1.19e-7 absolute -- and those two steps are the
// f32 divide-then-multiply in the encode and decode, not the transport. A caller comparing over [-1, 1] doubles
// that to 2.38e-7, and MUST NOT report agreement tighter than it: a difference smaller than the instrument's
// own resolution is not a measurement of the shader, it is a measurement of the instrument.
"use strict";

/** The integer range three 8-bit channels hold. 2^24 - 1, and exactly representable in f32 -- 2^24 is not. */
export const PACK24_MAX = 16777215;

/**
 * GLSL ES 3.00 source for the encoder. Paste into a fragment shader and write `o = pack24(v)` with v in [0,1].
 * *** THE min() IS LOAD-BEARING. *** See the header: without it, v = 1.0 encodes as 2^24 and the low bytes
 * vanish. It is written as a clamp AFTER the round rather than a smaller scale, because a smaller scale would
 * silently lose a bit everywhere to fix one input.
 */
export const PACK24_GLSL = `
vec4 pack24(float v) {
    float s = min(floor(clamp(v, 0.0, 1.0) * ${PACK24_MAX}.0 + 0.5), ${PACK24_MAX}.0);
    float b0 = floor(s / 65536.0);
    float b1 = floor((s - b0 * 65536.0) / 256.0);
    float b2 = s - b0 * 65536.0 - b1 * 256.0;
    return vec4(b0, b1, b2, 255.0) / 255.0;
}`;

/** Decode one packed pixel back to [0,1]. `px` is the RGBA byte array, `i` the pixel index. */
export function unpack24(px, i) {
    const o = i * 4;
    return (px[o] * 65536 + px[o + 1] * 256 + px[o + 2]) / PACK24_MAX;
}

/** Decode a value a shader mapped from [-lo, +lo] into [0,1] with `v * 0.5 + 0.5`. */
export function unpack24Signed(px, i, scale = 1) {
    return (unpack24(px, i) * 2 - 1) * scale;
}

/**
 * *** THE RESOLUTION FLOOR A CALLER MAY NOT CLAIM PAST. *** Over a signed [-1, 1] remap the round trip's own
 * error doubles, so any "the shader agrees to X" with X below this is a statement about the packer.
 */
export const PACK24_FLOOR_SIGNED = 2 * 1.19e-7;

/** What v4483 measured, on the device the harness launches. */
export const MEASURED_AT_V4483 = Object.freeze({
    device: "chromium/swiftshader (WebKit WebGL)",
    bitsHeld: 24, bitsAchieved: 23,
    worstErrorSteps: 2,                 // of 2^-24, over 256 exactly representable values
    worstErrorAbsolute: 1.19e-7,
    eightBitStep: 1 / 255,              // what every other GLSL gate in this tree compares at
    improvementFactor: Math.round((1 / 255) / 1.19e-7),
    // The bug the obvious idiom carries, and the one input that shows it.
    naiveOverflowsAt: 1.0,
    naiveEncodesAs: 16777216,           // instead of 16777215
    // *** AND NOT EVEN THE SIZE OF THE BUG IS THE ROUND NUMBER IT LOOKS LIKE. *** The high byte saturates to 255
    // and both low bytes zero out, so the decode is 255*65536/(2^24-1) and the deficit is exactly 65535 steps of
    // 2^-24 -- 0.0039061906, against the 0.00390625 that "one 8-bit step" would be. The first freeze here said
    // 1/256 and the gate rejected it at 5.6e-7, which is the same shape as every other approximate constant this
    // session has had to re-derive: a number that is nearly right is a number nobody measured.
    naiveDecodedError: 65535 / 16777215,
    valuesCorrectBeforeFix: 255, valuesTested: 256,
});
