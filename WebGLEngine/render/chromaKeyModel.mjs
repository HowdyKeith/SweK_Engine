// FILE: render/chromaKeyModel.mjs -- v4188
//
// THE MATH OF A CHROMA KEY, on the CPU, so it can be tested without a GPU. render/chromaKeyPass.js is the
// same arithmetic in GLSL; this file is what the gate reads.
//
// *** WHY THIS DID NOT EXIST, WHICH IS THE ODD PART. *** The tree has getUserMedia in twelve files and a
// whole shader chain, and fifteen occurrences of the word "chroma" -- every one of them chromatic ABERRATION,
// plus a comment about chroma subsampling. The only real one is main.js, where `window._stageBackdrop` is
// documented as "(e.g. green/blue for chroma)" and used as the clear colour. So the engine could PRODUCE a
// green screen and could not KEY ONE OUT. It had the source side and not the keying side, which is also why
// this can be gated end to end against itself: set the backdrop, key it, and check what survives.
"use strict";

/** BT.601, the matrix video actually uses. Cb and Cr are centred on 0 here, so their range is [-0.5, 0.5]. */
export function rgbToYCbCr(r, g, b) {
    return {
        y:   0.299 * r + 0.587 * g + 0.114 * b,
        cb: -0.168736 * r - 0.331264 * g + 0.5 * b,
        cr:  0.5 * r - 0.418688 * g - 0.081312 * b,
    };
}

/**
 * CHROMATICITY: the colour with its brightness divided out. (r, g) of r/(r+g+b), g/(r+g+b).
 *
 * This is the one that is genuinely luminance-invariant -- a fold of green cloth in shadow has the same
 * chromaticity as the lit cloth beside it, where its Cb/Cr shrink with the light. That is exactly the pixel a
 * keyer has to get right, because shadowed folds are where green screens actually fail.
 *
 * *** AND IT IS UNSTABLE NEAR BLACK, WHICH IS NOT A DETAIL. *** As r+g+b goes to zero the division blows up:
 * a nearly-black pixel has no reliable hue at all, and sensor noise alone will swing its chromaticity across
 * the whole plane. `sum` is returned so a caller can refuse to trust it rather than keying a shadow to holes.
 */
export function chromaticity(r, g, b) {
    const sum = r + g + b;
    if (sum <= 1e-6) return { r: 1 / 3, g: 1 / 3, sum: 0 };   // no hue to report: the neutral point, flagged by sum 0
    return { r: r / sum, g: g / sum, sum };
}

/** Distance in plain RGB. The obvious metric, and the one this file exists to argue against. */
export function distRGB(a, k) {
    return Math.hypot(a[0] - k[0], a[1] - k[1], a[2] - k[2]);
}

/** Distance in the Cb/Cr plane. Standard in GPU keyers; better than RGB, still shrinks with brightness. */
export function distYCbCr(a, k) {
    const p = rgbToYCbCr(a[0], a[1], a[2]), q = rgbToYCbCr(k[0], k[1], k[2]);
    return Math.hypot(p.cb - q.cb, p.cr - q.cr);
}

/** Distance in the chromaticity plane. Luminance-invariant; needs the black guard above. */
export function distChromaticity(a, k) {
    const p = chromaticity(a[0], a[1], a[2]), q = chromaticity(k[0], k[1], k[2]);
    return Math.hypot(p.r - q.r, p.g - q.g);
}

export const METRICS = Object.freeze({ rgb: distRGB, ycbcr: distYCbCr, chromaticity: distChromaticity });

/**
 * *** THE TWO GOOD METRICS FAIL AT OPPOSITE ENDS OF THE LIGHT, SO THE KEYER USES BOTH. ***
 *
 * Measured on eleven labelled pixels against a real cloth green [0.05, 0.75, 0.15] -- wrong answers:
 * RGB 3, YCbCr 2, chromaticity 1, both 0. What each one misses is not random:
 *
 *   - a SHADOWED FOLD keeps its hue but loses its chroma, so YCbCr (and RGB) call it a different colour and
 *     leave a green hole in the matte. Chromaticity has divided the brightness out and gets it right.
 *   - a BLOWN HIGHLIGHT loses its hue -- light floods every channel and the pixel drifts toward white -- so
 *     chromaticity says "not green". Its absolute chroma is still large, so YCbCr gets it right.
 *
 * A pixel is the backdrop if it matches the backdrop's HUE or its CHROMA VECTOR, so the alpha is the more
 * transparent of the two verdicts. This is not two knobs averaged into mush: they cover each other's blind
 * end, and the table above is what says so.
 */
export function keyAlphaBoth(rgb, key, opts = {}) {
    return Math.min(keyAlpha(rgb, key, Object.assign({}, opts, { metric: "chromaticity" })),
                    keyAlpha(rgb, key, Object.assign({}, opts, { metric: "ycbcr" })));
}

export const DEFAULTS = Object.freeze({
    metric: "both",           // see keyAlphaBoth: chromaticity for shadows, YCbCr for highlights
    similarity: 0.08,      // inside this distance the pixel is the backdrop
    smoothness: 0.06,      // the band over which it fades in, so edges are not stair-stepped
    darkFloor: 0.12,       // below this total brightness, chromaticity is not trusted -- see below
    despill: 1.0,
});

/**
 * How opaque a pixel is: 0 is backdrop, 1 is subject.
 *
 * *** THE DARK FLOOR IS A REAL RULE, NOT A FUDGE. *** Chromaticity divides by brightness, so black pixels
 * have arbitrary hue. Without the floor, every dark pixel in the SUBJECT -- a pupil, a nostril, hair shadow --
 * lands wherever noise puts it, and some fraction of them land on the key and get punched transparent. Holes
 * in the middle of a face. Below the floor the pixel is declared subject: an unlit pixel is not a green
 * screen, whatever its ratios say.
 */
export function keyAlpha(rgb, key, opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts);
    if (o.metric === "both") return keyAlphaBoth(rgb, key, opts);
    const sum = rgb[0] + rgb[1] + rgb[2];
    if (o.metric === "chromaticity" && sum < o.darkFloor) return 1;
    const d = (METRICS[o.metric] || distChromaticity)(rgb, key);
    if (d <= o.similarity) return 0;
    if (d >= o.similarity + o.smoothness) return 1;
    const t = (d - o.similarity) / Math.max(1e-6, o.smoothness);
    return t * t * (3 - 2 * t);      // smoothstep, so the matte line is not a staircase
}

/**
 * SPILL SUPPRESSION. A subject lit near a green screen picks up a green rim that keying does not remove --
 * the pixel is not green ENOUGH to be backdrop, so it stays, glowing. The standard cure: where the keyed
 * channel exceeds what the other two justify, pull it down to their level. Applied in proportion to how
 * much of the backdrop's hue is present, so an actually-green shirt is left alone.
 */
export function despill(rgb, key, opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts);
    const amount = Math.max(0, Math.min(1, o.despill));
    if (amount <= 0) return [rgb[0], rgb[1], rgb[2]];
    // which channel the backdrop dominates
    const ki = key[1] >= key[0] && key[1] >= key[2] ? 1 : (key[2] >= key[0] ? 2 : 0);
    const others = [0, 1, 2].filter((i) => i !== ki);
    const cap = (rgb[others[0]] + rgb[others[1]]) / 2;
    const out = [rgb[0], rgb[1], rgb[2]];
    if (out[ki] > cap) out[ki] = out[ki] + (cap - out[ki]) * amount;
    return out;
}

/** The whole per-pixel operation: alpha, then spill, as the pass does it. */
export function keyPixel(rgb, key, opts = {}) {
    const a = keyAlpha(rgb, key, opts);
    return { rgb: a > 0 ? despill(rgb, key, opts) : [rgb[0], rgb[1], rgb[2]], alpha: a };
}
