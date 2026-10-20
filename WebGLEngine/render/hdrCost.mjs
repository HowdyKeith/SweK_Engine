// WebGLEngine/render/hdrCost.mjs -- v4481
//
// *** WHAT THE 8-BIT ROUND TRIP COSTS THE BLOOM CHAIN, MEASURED BEFORE ANY FORMAT WAS ADDED. ***
//
// The TSL/WebGPU survey said "texture formats: 8-bit only, in a tree with bloom, atmosphere and a blackbody
// ramp", and the task attached to it refused to let the fix be built on that sentence: measure what the round
// trip actually loses -- banding in the ramp, clamped highlights, or nothing visible -- and let the number decide
// whether this is a fix or a decoration. This file is that measurement, as operators a check can re-run rather
// than as numbers a check can only read back.
//
// ---- THE ANSWER, AND IT IS NOT THE ONE I WOULD HAVE GUESSED ---------------------------------------------------
//
// BANDING IS A NON-ISSUE. On a smooth ramp that never leaves 0..1, storing all four intermediates at 8 bits moves
// the final 8-bit picture by at most ONE least-significant bit, rms 0.45 -- under the noise of the output
// quantiser the float chain also has to pass through. Four extra quantisations of an in-range signal cost
// essentially nothing, because the last one dominates.
//
// *** CLIPPING IS THE WHOLE COST, AND IT SATURATES. *** A small emissive disc on a dim background produces a halo
// that grows with the disc: 25.3 output levels at peak 1.0, 34.5 at 2.0, 45.6 at 4.0, 67.7 at 16.0. The 8-bit
// chain gives 25.4 AT EVERY PEAK FROM 2.0 UPWARD -- bit-identical, because the very first store clamps to 1.0 and
// nothing downstream can tell a 2x sun from a 16x sun. The eight-bit chain's HDR dynamic range is 1.0:1.
//
// AND THE CLIP IS AT THE FIRST STORE, NOT IN THE BLUR. At peak 4.0 the float chain carries 4.0 into the scene
// target, 4.0 out of the brightness extract and 3.73 out of the second blur; the 8-bit chain reads 1.0, 1.0, 0.92.
// Promoting the blur targets alone would buy nothing: the highlight is already gone by then.
//
// HALF FLOAT IS ENOUGH. rgba16float tracks the float chain to within 0.005 of one output level on every probe
// here. Nothing in this measurement wants rgba32float, which is twice the bandwidth for a difference no 8-bit
// display can show.
//
// ---- SO IT IS A FIX, AND THE TREE ALREADY SHIPPED IT ONCE, AND I CLAIMED OTHERWISE ------------------------------
//
// *** THE SURVEY'S "NO HDR RENDER TARGET ANYWHERE" WAS ITS FIFTH OVERCLAIM. *** render/bloomPass.js has rendered
// into RGBA16F since Round 136 -- and not just the scene target: sceneFBO, brightFBO, blurFBO_H, blurFBO_V, the
// SSAO and god-ray halves and the colour copy ALL come out of one _createColorTex(), so the whole chain is
// half-float together or 8-bit together. My follow-up guess -- that the scene target was HDR and the blur chain
// was not -- was wrong too, and it was wrong because I read two texImage2D calls that create depthCopyColor, a
// completeness-only attachment the code says it never writes to. Two guesses, both about the same file, both
// settled by reading it. The 8-bit-only finding is true of gfx/device.js and of the FALLBACK PATH here, and those
// are the two places the number above applies to.
//
// ---- AND ONE ROUND HAD ALREADY MEASURED A PIECE OF THIS, WHICH IS WORTH SAYING OUT LOUD --------------------------
//
// v4287 uploaded a scene texture to the fused bloom pass at rgba8unorm on a real device and recorded the clip:
// a peak of 1.7480 stored as 1.0000, 181 samples above 1.0 destroyed, 43% off the brightest. That is ONE store
// of ONE texture, and tools/ship/passFootprint-selfcheck.mjs has cited it since. What was never measured is what
// the WHOLE chain does with the loss, and that is the part that turns "43% off the brightest" into the sharper
// statement above: it is not that bright things get dimmer, it is that ALL of them get the same brightness.
//
// ---- AND THE FLAG THAT KNOWS WHICH PATH IS RUNNING IS WRITTEN TWICE AND READ NOWHERE ---------------------------
//
// bloomPass sets this._hdrEnabled true or false in _createColorTex and NOTHING ANYWHERE READS IT. A field written
// on both branches of the decision that matters, with no reader, is the second-declaration defect this tree keeps
// finding -- and it is the second one in this same file, after v4288 found the overview saying RGBA8 while the
// code did RGBA16F. This round gives it a reader and gives the warning beside it the number above, because
// "bloom will be weaker" is not a measurement and "every highlight above 1.0 collapses to the same halo" is.
//
// ---- THE PALETTE HAS THE HEADROOM, AND THE WORD "EMISSIVE" MEANS TWO THINGS -----------------------------------
//
// #133's rule is to find the consumer before taking the solver, so: SIX OF TWELVE palette entries exceed 1.0 after
// the voxel shader's emissive boost, peaking at 2.5. The consumer is real and the fix is not a decoration.
//
// *** BUT THE SHADER'S `emissive` IS NOT THE PALETTE'S `emissive`. *** #144's family, fourth entry. The shader
// gates on smoothstep(0.85, 0.95, MAX CHANNEL) -- a saturation test, not an emission test -- so SNOW, ICE,
// FLOWING_WATER, SCREEN and SAND are all boosted, none of which emits anything. And MEMORY, one of the two
// entries the palette itself labels "emissive", sits at max channel 0.85, exactly the smoothstep's lower edge,
// and receives A BOOST OF ZERO. The one thing named emissive in the data is the one thing the shader does not
// treat as emissive. That is recorded here and not silently repaired: moving the gate would change the colour of
// every snowfield in the tree, which is Keith's call and not a side effect of a measurement round.
// ---- WHAT THIS EXPORTS ----------------------------------------------------------------------------------------
//
// The storage behaviours: F16_MAX, toHalfBits, fromHalfBits, f16, unorm8, FORMATS. The shipped constants this
// models, as a second copy the gate holds against the first: SHIPPED. The arithmetic each pass does: smoothstep,
// luminance, aces, brightWeight, emissiveMultiplier. The consumer census: paletteHeadroom. The images and the
// five steps: image, px, setPx, store, halfRes, brightPass, blurPass, compositePass, bloomChain. The two probes
// and their reading: emissiveDisc, greyRamp, haloMean, PROBE. And the numbers, re-derived rather than read back
// by tools/ship/hdrCost-selfcheck.mjs: MEASURED_AT_V4481.
"use strict";

/** The largest finite half float. Above this an rgba16float target stores Infinity, which is its own defect. */
export const F16_MAX = 65504;

/** IEEE 754 binary16, round-to-nearest-even, as bits. Node 22 has neither Float16Array nor getFloat16. */
export function toHalfBits(val) {
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    f[0] = val;
    const x = u[0], sign = (x >>> 16) & 0x8000, exp = (x >>> 23) & 0xff;
    let man = x & 0x7fffff;
    if (exp === 0xff) return sign | 0x7c00 | (man ? 0x200 : 0);     // Inf / NaN
    const e = exp - 127 + 15;
    if (e >= 0x1f) return sign | 0x7c00;                            // overflow -> Inf
    if (e <= 0) {
        if (e < -10) return sign;                                   // underflow -> signed zero
        man |= 0x800000;
        const shift = 14 - e, rem = man & ((1 << shift) - 1), half = 1 << (shift - 1);
        let h = man >>> shift;
        if (rem > half || (rem === half && (h & 1))) h++;
        return sign | h;
    }
    let h = (e << 10) | (man >>> 13);
    const rem = man & 0x1fff;
    if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h++;           // a carry here lands in the exponent, correctly
    return sign | h;
}

/** binary16 bits back to a Number. */
export function fromHalfBits(h) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >>> 10) & 0x1f, m = h & 0x3ff;
    if (e === 0) return s * m * Math.pow(2, -24);                   // subnormal
    if (e === 0x1f) return m ? NaN : s * Infinity;
    return s * (1 + m / 1024) * Math.pow(2, e - 15);
}

/** What an rgba16float target stores. */
export const f16 = (x) => fromHalfBits(toHalfBits(x));

/** What an rgba8unorm target stores: clamped to 0..1 AND quantised to 1/255. The clamp is the expensive half. */
export const unorm8 = (x) => { const c = x < 0 ? 0 : x > 1 ? 1 : x; return Math.round(c * 255) / 255; };

/** The three storage behaviours the probes compare. `float` is the reference no real target offers. */
export const FORMATS = Object.freeze({ float: (x) => x, f16, unorm8 });

/**
 * *** EVERY CONSTANT HERE IS A SECOND COPY OF ONE IN render/bloomPass.js OR render/voxelrenderer.js. ***
 * That is deliberate and it is why the gate exists: it parses both source files and asserts each value below
 * still matches the shipped one. A model of a pass that silently drifts from the pass is worse than no model.
 */
export const SHIPPED = Object.freeze({
    blurWeights: Object.freeze([0.227027, 0.194594, 0.121622, 0.054054, 0.016216]),  // BLUR_FS W0..W4
    luma: Object.freeze([0.299, 0.587, 0.114]),          // BRIGHT_FS dot(c, vec3(...))
    softWidth: 0.15,                                     // smoothstep(uThreshold, uThreshold + 0.15, lum)
    threshold: 0.55,                                     // BloomPass constructor
    intensity: 0.70,
    exposure: 1.05,
    aces: Object.freeze({ a: 2.51, b: 0.03, c: 2.43, d: 0.59, e: 0.14 }),            // COMPOSITE_FS aces()
    emissiveGate: Object.freeze([0.85, 0.95]),           // voxelrenderer smoothstep(0.85, 0.95, maxC)
    emissiveBoost: 2.5,                                  // renderer.emissiveBoost ?? 2.5
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const luminance = (rgb) => rgb[0] * SHIPPED.luma[0] + rgb[1] * SHIPPED.luma[1] + rgb[2] * SHIPPED.luma[2];

/** The ACES curve from COMPOSITE_FS, clamped as it is there. */
export function aces(x) {
    const { a, b, c, d, e } = SHIPPED.aces;
    return clamp01((x * (a * x + b)) / (x * (c * x + d) + e));
}

/** BRIGHT_FS's soft threshold: the weight the extract multiplies the colour by. */
export const brightWeight = (rgb, threshold = SHIPPED.threshold) =>
    smoothstep(threshold, threshold + SHIPPED.softWidth, luminance(rgb));

/**
 * The voxel shader's lit multiplier, mix(1.0, boost, smoothstep(gate, maxC)).
 * *** IT KEYS ON THE MAX CHANNEL, WHICH IS SATURATION AND NOT EMISSION. *** See the header.
 */
export function emissiveMultiplier(rgb) {
    const [g0, g1] = SHIPPED.emissiveGate;
    const e = smoothstep(g0, g1, Math.max(rgb[0], rgb[1], rgb[2]));
    return 1 + (SHIPPED.emissiveBoost - 1) * e;
}

/** How far past 1.0 each palette entry lands, and how many do. Rows in, census out; nothing is remembered. */
export function paletteHeadroom(entries) {
    const rows = entries.map((p) => {
        const maxC = Math.max(p.rgb[0], p.rgb[1], p.rgb[2]);
        const mul = emissiveMultiplier(p.rgb);
        return { name: p.name, rgb: p.rgb, maxC, mul, peak: maxC * mul, overOne: maxC * mul > 1 };
    });
    const over = rows.filter((r) => r.overOne);
    return { rows, total: rows.length, overOne: over.length,
             peak: rows.reduce((m, r) => Math.max(m, r.peak), 0),
             unboosted: rows.filter((r) => r.mul === 1).map((r) => r.name) };
}

// ---- the chain, as images -------------------------------------------------------------------------------------

/** A planar RGB image. Float64 throughout so the only precision loss is the one a probe asks for. */
export const image = (w, h) => ({ w, h, d: new Float64Array(w * h * 3) });
export const px = (im, x, y, k) => im.d[(y * im.w + x) * 3 + k];
export const setPx = (im, x, y, k, v) => { im.d[(y * im.w + x) * 3 + k] = v; };

/** Store an image through a format's quantiser -- what happens on every framebuffer write. */
export function store(im, q) {
    const o = image(im.w, im.h);
    for (let i = 0; i < im.d.length; i++) o.d[i] = q(im.d[i]);
    return o;
}

/** LINEAR minification by exactly 2, which is a 2x2 box average. The bright pass runs at half resolution. */
export function halfRes(im) {
    const o = image(im.w >> 1, im.h >> 1);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) for (let k = 0; k < 3; k++)
        setPx(o, x, y, k, (px(im, 2*x, 2*y, k) + px(im, 2*x+1, 2*y, k) +
                           px(im, 2*x, 2*y+1, k) + px(im, 2*x+1, 2*y+1, k)) / 4);
    return o;
}

/** BRIGHT_FS over a whole image. */
export function brightPass(im, threshold = SHIPPED.threshold) {
    const o = image(im.w, im.h);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const c = [px(im, x, y, 0), px(im, x, y, 1), px(im, x, y, 2)];
        const w = brightWeight(c, threshold);
        for (let k = 0; k < 3; k++) setPx(o, x, y, k, c[k] * w);
    }
    return o;
}

/** One BLUR_FS pass along (dx, dy), clamped to the edge as tapClamped is on a full-target eye rect. */
export function blurPass(im, dx, dy, W = SHIPPED.blurWeights) {
    const o = image(im.w, im.h);
    const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) for (let k = 0; k < 3; k++) {
        let s = px(im, x, y, k) * W[0];
        for (let i = 1; i <= 4; i++)
            s += (px(im, cl(x + dx*i, im.w), cl(y + dy*i, im.h), k)
                + px(im, cl(x - dx*i, im.w), cl(y - dy*i, im.h), k)) * W[i];
        setPx(o, x, y, k, s);
    }
    return o;
}

/** COMPOSITE_FS's core: (scene + bloom * intensity) * exposure, tone mapped. The optional effects are off. */
export function compositePass(scene, bloomHalf) {
    const o = image(scene.w, scene.h);
    const bw = bloomHalf.w - 1, bh = bloomHalf.h - 1;
    for (let y = 0; y < scene.h; y++) for (let x = 0; x < scene.w; x++) for (let k = 0; k < 3; k++) {
        const b = px(bloomHalf, Math.min(x >> 1, bw), Math.min(y >> 1, bh), k);
        setPx(o, x, y, k, aces((px(scene, x, y, k) + b * SHIPPED.intensity) * SHIPPED.exposure));
    }
    return o;
}

/**
 * The five shipped steps with every intermediate stored at `format`, ending on the screen -- which is 8 bits
 * whatever the intermediates are, because the default framebuffer has no other option. Returns the stage maxima
 * too, so a caller can see WHERE a highlight was lost rather than only that it was.
 */
export function bloomChain(sceneHDR, format) {
    const q = FORMATS[format];
    if (!q) throw new Error(`render/hdrCost: unknown format "${format}" -- one of ${Object.keys(FORMATS).join(", ")}`);
    const scene = store(sceneHDR, q);
    const bright = store(brightPass(halfRes(scene)), q);
    const blurH = store(blurPass(bright, 1, 0), q);
    const blurV = store(blurPass(blurH, 0, 1), q);
    const out = store(compositePass(scene, blurV), unorm8);
    const mx = (im) => im.d.reduce((m, v) => (v > m ? v : m), 0);
    return { out, stageMax: { scene: mx(scene), bright: mx(bright), blurH: mx(blurH), blurV: mx(blurV) } };
}

// ---- the two probes, defined once so the gate re-derives the frozen numbers rather than reading them back -----

/** A small emissive disc of radius N/16 at `peak`, on a dim 0.06 background, warm-tinted like lava. */
export function emissiveDisc(N, peak) {
    const im = image(N, N), c = N / 2, r = N / 16, tint = [1, 0.85, 0.55];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = Math.hypot(x - c, y - c) <= r ? peak : 0.06;
        for (let k = 0; k < 3; k++) setPx(im, x, y, k, v * tint[k]);
    }
    return im;
}

/** A grey ramp 0..top across x. Nothing in it exceeds 1.0, so it isolates banding from clipping. */
export function greyRamp(N, top) {
    const im = image(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        for (let k = 0; k < 3; k++) setPx(im, x, y, k, (x / (N - 1)) * top);
    return im;
}

/** Mean red output level over the annulus just outside the disc: the halo, in 8-bit units. */
export function haloMean(out, N) {
    let s = 0, n = 0;
    const c = N / 2, inner = N / 16, outer = N / 5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - c, y - c);
        if (d > inner && d <= outer) { s += px(out, x, y, 0) * 255; n++; }
    }
    return s / n;
}

/** The probe grid the numbers below come from. N = 128 full res, 64 half res. */
export const PROBE = Object.freeze({ n: 128, peaks: Object.freeze([0.8, 1.0, 2.0, 4.0, 8.0, 16.0]),
                                     rampTops: Object.freeze([1.0, 0.6]) });

/**
 * *** WHAT v4481 MEASURED. *** Every number here is re-derived by tools/ship/hdrCost-selfcheck.mjs from the
 * operators above -- it does not read these back, it computes them and compares.
 */
export const MEASURED_AT_V4481 = Object.freeze({
    // Halo level (8-bit units) by scene peak, per storage format.
    haloFloat: Object.freeze([22.6052, 25.3466, 34.4619, 45.6330, 56.6309, 67.6883]),
    haloF16: Object.freeze([22.6052, 25.3455, 34.4662, 45.6288, 56.6309, 67.6840]),
    haloUnorm8: Object.freeze([22.3997, 25.1856, 25.4163, 25.4163, 25.4163, 25.4163]),
    // *** THE FINDING. *** Every peak from 2.0 up gives the SAME 8-bit halo, to every decimal place.
    unorm8SaturatesAtPeak: 2.0,
    unorm8SaturatedHalo: 25.4163,
    unorm8DistinctHalosAbovePeak1: 1,   // 2.0, 4.0, 8.0 and 16.0 are one value
    worstHaloLossLevels: 42.27,         // at peak 16.0, out of 67.69
    // Banding, on a ramp that never leaves 0..1: below the output quantiser's own step.
    rampMaxLossLsb: 1, rampRmsLossLsb: 0.530, rampWorstTop: 0.6,
    // Half float is enough; nothing here asks for 32.
    f16WorstHaloErrorLevels: 0.0043,
    // Where the clip happens, at peak 4.0: the FIRST store, not the blur.
    stageMaxFloatAt4: Object.freeze({ scene: 4, bright: 4, blurH: 3.9361, blurV: 3.7337 }),
    stageMaxUnorm8At4: Object.freeze({ scene: 1, bright: 1, blurH: 0.9804, blurV: 0.9176 }),
    // The consumer, from world/chunkMesherCore.js through the voxel shader's boost.
    paletteEntries: 12, paletteOverOne: 6, palettePeak: 2.5,
    // #144's family, fourth entry: the palette says emissive, the shader means saturated.
    paletteSaysEmissive: 2,            // LAVA and MEMORY
    memoryMaxChannel: 0.85,             // exactly the smoothstep's lower edge
    memoryBoost: 1,                     // *** ZERO EXTRA. The named emissive gets none. ***
    boostedWithoutBeingNamed: Object.freeze(["SAND", "SNOW", "FLOWING_WATER", "ICE", "SCREEN"]),
    // The flag this round gave a reader.
    hdrEnabledWritesBefore: 2, hdrEnabledReadsBefore: 0,
});
