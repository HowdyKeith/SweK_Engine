// fx/dither.js -- ORDERED DITHERING: TRADE AMPLITUDE RESOLUTION YOU DO NOT HAVE FOR SPATIAL RESOLUTION YOU DO.
//
// v4031 -- Keith, on lifting from https://github.com/lenxism/dither (a Canvas2D playground; the ALGORITHM is
// classic Bayer and is what transfers -- none of that repo's React/particle code is here, and its
// Floyd-Steinberg half deliberately is not either, see the bottom of this header).
//
// *** THE PROBLEM IS BANDING, AND BANDING IS NOT A BUG IN THE SHADER -- IT IS THE DISPLAY TELLING THE TRUTH. ***
// wormholeNebula's sky is a smooth 3-octave fbm ramp. An 8-bit channel has 256 levels. Where the nebula's density
// ramps slowly across many pixels, consecutive pixels round to the SAME level for a while and then jump -- so a
// mathematically smooth gradient renders as visible flat plateaus separated by hard edges. Nothing is wrong with
// the gradient; there is simply no 8-bit value between 0.2510 and 0.2549 to render.
//
// ORDERED DITHERING adds a per-pixel threshold from a fixed matrix BEFORE quantising, so pixels that would all
// round down together instead split: some round up, some round down, in a proportion that tracks the true value.
// The plateau becomes a fine stipple whose LOCAL AVERAGE is much closer to the real gradient than the plateau was.
//
// *** WHAT IT DOES AND DOES NOT BUY, STATED HERE BECAUSE THE GATE MEASURES BOTH. ***
//   - It does NOT reduce per-pixel error. It cannot: no information is added, and per-pixel error gets slightly
//     WORSE (the dither offset is, per pixel, a deliberate error). ditherSelfcheck MEASURES this and expects it.
//   - It DOES reduce the error of the LOCAL SPATIAL AVERAGE by a large factor, which is what the eye integrates
//     and therefore what "banding" actually is. That factor is the number the gate holds.
// A claim of "looks better" would be untestable; "the 8x8-block mean tracks the true ramp N times more closely"
// is a measurement, so that is the claim this file makes.
//
// *** THE MATRIX IS GENERATED, NOT TYPED, AND THE SHADERS ARE GENERATED FROM THE SAME ARRAY. ***
// A hand-typed 8x8 matrix is 64 chances to transpose a digit, and a hand-typed GLSL copy of it is 64 more --
// with nothing comparing the two. So BAYER8 is built from the recurrence below, checked against the published
// matrix in the gate, and the GLSL and WGSL sources are BUILT FROM BAYER8 by string-joining that same array.
// There is no second copy of these numbers anywhere for v3527's rule to bite: the shader cannot drift from the
// JS because the shader is a function of the JS.
//
// THE RECURRENCE (Bayer 1973), in its BLOCK form -- quadrants, not interleaved. Getting this wrong produces a
// matrix that is a valid dither pattern and is NOT the canonical Bayer matrix (the interleaved variant is the
// transpose-like cousin), which is exactly the sort of "plausible and wrong" the gate's published-value check
// exists to catch:
//
//     M_1 = [0]
//     M_2n = [ 4*M_n + 0   4*M_n + 2 ]
//            [ 4*M_n + 3   4*M_n + 1 ]
//
// FLOYD-STEINBERG IS DELIBERATELY ABSENT. Error diffusion pushes each pixel's residual into its NOT-YET-DRAWN
// neighbours, which is inherently sequential: pixel (x,y) cannot be computed until (x-1,y) is. A fragment shader
// runs every pixel independently and in unspecified order, so error diffusion does not exist as a fragment
// shader -- it needs a multi-pass compute scan. Ordered dithering is stateless per pixel and is the reason THIS
// is the half that ports. Naming the absent half is cheaper than someone rediscovering why it never landed.
"use strict";

const N = 8;                       // matrix edge. The recurrence works for any power of two; 8 is what ships.
const LEVELS_8BIT = 256;

/** Build the Bayer matrix of edge `n` (a power of two) by the block recurrence above. Returns a flat array of
 *  n*n integers, each in 0..n*n-1, indexed [y*n + x]. */
function buildBayer(n) {
    if (n === 1) return [0];
    const h = n / 2, m = buildBayer(h), out = new Array(n * n);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const q = (y < h ? 0 : 2) + (x < h ? 0 : 1);          // quadrant: TL, TR, BL, BR
            const add = q === 0 ? 0 : q === 1 ? 2 : q === 2 ? 3 : 1;
            out[y * n + x] = 4 * m[(y % h) * h + (x % h)] + add;
        }
    }
    return out;
}

/** The 8x8 Bayer matrix, integers 0..63, row-major. THE ONE DECLARATION -- the shaders below are built from it. */
const BAYER8 = buildBayer(N);

/**
 * The dither threshold for a pixel, in [0,1). Centred so the mean offset over a full 8x8 tile is ZERO, not 0.5:
 * `(v + 0.5)/64 - 0.5` rather than `v/64`. AN UNCENTRED MATRIX BIASES THE WHOLE IMAGE BRIGHTER BY HALF A LEVEL,
 * which is a constant error the local-average test would show as a floor it could never get under. The +0.5
 * makes the 64 offsets symmetric about zero (-31.5/64 .. +31.5/64) instead of lopsided (0/64 .. 63/64).
 */
function bayerOffset(x, y) {
    const v = BAYER8[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
    return (v + 0.5) / (N * N) - 0.5;
}

/**
 * Quantise `value` (0..1) to `levels` steps at pixel (x,y), with the ordered-dither offset applied first.
 * Returns the quantised value in 0..1. `levels` is the number of representable steps (256 for an 8-bit channel).
 */
function ditherQuantize(value, x, y, levels = LEVELS_8BIT) {
    const step = 1 / (levels - 1);
    const q = Math.round((value + bayerOffset(x, y) * step) / step) * step;
    return q < 0 ? 0 : q > 1 ? 1 : q;
}

/** Plain quantisation with no dither -- the thing being improved on, kept here so the gate compares like with
 *  like rather than against a reimplementation that might differ in its rounding. */
function plainQuantize(value, levels = LEVELS_8BIT) {
    const step = 1 / (levels - 1);
    const q = Math.round(value / step) * step;
    return q < 0 ? 0 : q > 1 ? 1 : q;
}

// ---------------------------------------------------------------------------------------------------------
// SHADER SOURCES, BUILT FROM BAYER8 RATHER THAN TRANSCRIBED FROM IT.
//
// `bayerOffset` in GLSL/WGSL is the same arithmetic as the JS above, and the 64 constants are the SAME ARRAY
// serialised -- so a change to the recurrence changes all three at once and cannot change only one.
const BAYER8_LIST = BAYER8.join(",");

/**
 * GLSL ES 3.00 snippet: `float ditherOffset(vec2 fragCoord)` plus `vec3 ditherQuantize(vec3 c, vec2 fc, float levels)`.
 * Paste into a fragment shader and call it on the final colour, immediately before writing it out.
 *
 * *** COMPILED, LINKED AND RENDERED FOR REAL, v4031 -- not merely string-checked. *** Real WebGL2 (Chromium 141,
 * SwiftShader), this snippet spliced into a live fragment shader over a 512x64 quad running the same slow ramp
 * the gate measures:
 *   - compile + link: OK
 *   - a horizontal row: 14 DISTINCT 8-bit values where undithered quantisation gives a handful of flat plateaus
 *   - a column whose true value sits nearest a HALF-LEVEL: exactly 2 values, alternating 76,77,76,77... down the
 *     8-row Bayer period -- the stipple, doing precisely what the matrix says it should
 *   - a column whose true value sits ~0.99 of the way to a level: 1 value, UNCHANGED. Correct, not a failure:
 *     no dither offset there is large enough to cross the midpoint, so nothing should move.
 * The gate does not re-run a browser on every ship (a GPU launch per ship to re-learn a written-down fact is
 * the trade persistTruth-selfcheck already refused); it checks the arithmetic and that the constants are still
 * generated. This is the measurement it rests on.
 */
const DITHER_GLSL = `
// --- ordered dither (Bayer 8x8), generated by fx/dither.js -- do not hand-edit these constants ---
const float DITHER_N = ${N}.0;
const int DITHER_BAYER[${N * N}] = int[${N * N}](${BAYER8_LIST});
float ditherOffset(vec2 fragCoord){
  int x = int(mod(fragCoord.x, DITHER_N));
  int y = int(mod(fragCoord.y, DITHER_N));
  return (float(DITHER_BAYER[y * ${N} + x]) + 0.5) / ${N * N}.0 - 0.5;
}
vec3 ditherQuantize(vec3 c, vec2 fragCoord, float levels){
  float step = 1.0 / (levels - 1.0);
  vec3 q = floor((c + ditherOffset(fragCoord) * step) / step + 0.5) * step;
  return clamp(q, 0.0, 1.0);
}`;

/** WGSL mirror of the same, for the WebGPU path. */
const DITHER_WGSL = `
// --- ordered dither (Bayer 8x8), generated by fx/dither.js -- do not hand-edit these constants ---
const DITHER_N: f32 = ${N}.0;
const DITHER_BAYER = array<i32, ${N * N}>(${BAYER8_LIST});
fn ditherOffset(fragCoord: vec2f) -> f32 {
  // *** FLOOR-WRAP, NOT \`%\`, AND v4487 MEASURED WHY. *** WGSL's remainder keeps the DIVIDEND's sign, so a
  // negative coordinate indexed the matrix negatively; GLSL's mod() floors and the JS above writes
  // ((v % N) + N) % N. Three spellings of one wrap, and the WGSL was the odd one out: on a device the two
  // shaders disagreed by 0.984375 -- the full span of the offset -- at all 192 of 256 probe points where
  // either coordinate was negative, while agreeing exactly everywhere else.
  let x = i32(fragCoord.x - DITHER_N * floor(fragCoord.x / DITHER_N));
  let y = i32(fragCoord.y - DITHER_N * floor(fragCoord.y / DITHER_N));
  return (f32(DITHER_BAYER[y * ${N} + x]) + 0.5) / ${N * N}.0 - 0.5;
}
fn ditherQuantize(c: vec3f, fragCoord: vec2f, levels: f32) -> vec3f {
  let stepSize = 1.0 / (levels - 1.0);
  let q = floor((c + ditherOffset(fragCoord) * stepSize) / stepSize + 0.5) * stepSize;
  return clamp(q, vec3f(0.0), vec3f(1.0));
}`;

export { BAYER8, N, LEVELS_8BIT, buildBayer, bayerOffset, ditherQuantize, plainQuantize, DITHER_GLSL, DITHER_WGSL, BAYER8_LIST };
if (typeof module !== "undefined" && module.exports) {
    module.exports = { BAYER8, N, LEVELS_8BIT, buildBayer, bayerOffset, ditherQuantize, plainQuantize, DITHER_GLSL, DITHER_WGSL, BAYER8_LIST };
}
