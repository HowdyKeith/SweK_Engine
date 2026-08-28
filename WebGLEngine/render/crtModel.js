// @ts-check
// WebGLEngine/render/crtModel.js -- v4119
//
// THE CRT TRANSFER FUNCTION, ON THE CPU. This is the ANSWER KEY for render/crtPass.js's GLSL.
//
// Keith parked this in August: a list of CRT-filter repos, then "the crt i would like to come back to later."
//
// *** NONE OF THOSE REPOS' CODE IS HERE, AND ONE OF THEM COULD NOT BE. *** All four were checked by reading
// the actual LICENSE file rather than inferring one: gingerbeardman/webgl-crt-shader, Ichiaka/CRTFilter and
// stefanlegg/crt-fx are MIT; *** bisqwit/crt-filter HAS NO LICENSE FILE AT ALL, *** which makes it
// all-rights-reserved and unusable in a tree that publishes public release zips -- the same finding as sileo
// two rounds ago, and the reason the check is done every time instead of assumed from a repo's reputation.
// The three MIT ones were read and contain nothing non-obvious: the standard parameter set (scanlines, bloom,
// curvature, vignette, rgb shift), and gingerbeardman's is Three.js-bound besides. What a CRT does is optics
// and raster geometry, which nobody owns, so this is written from that rather than lifted.
//
// *** AND WRITING IT MEANS IT CAN BE GRADED, WHICH IS THE ACTUAL REASON NOT TO LIFT ONE. *** A borrowed
// fragment shader can only ever be looked at. This tree already has the pattern for doing better -- qa-suite's
// "shader: wormhole+nebula shadow bit-identical to CPU" -- so the CRT is written TWICE: once here in plain
// JavaScript, once in GLSL, with the same operations in the same order. The gate renders a known image through
// the real GPU pass and through this, and requires them to agree. Then every parameter below is a MEASURABLE
// claim rather than a look: the scanline period is countable, the barrel displacement is a distance, the
// phosphor pitch is a pixel count.
//
// *** SAMPLING IS NEAREST, DELIBERATELY, AND THAT IS WHAT MAKES THE TWO COMPARABLE. *** With bilinear
// filtering the GPU interpolates in hardware at a precision this file cannot reproduce exactly, and the
// comparison would become "close enough" -- which is the kind of tolerance a real disagreement hides inside.
"use strict";

/**
 * @typedef {{ curvature: number, scanlines: number, scanDepth: number, maskPitch: number, maskDepth: number,
 *             vignette: number, bleed: number, gain: number, tint: [number, number, number] }} CrtParams
 */

/**
 * The parameter set is PHYSICAL: every field is a thing you could measure on a real tube with a ruler or an
 * oscilloscope, not a taste knob. That is what lets the gate check them.
 * @type {CrtParams}
 */
export const DEFAULTS = {
    curvature: 0.12,      // barrel coefficient k in r' = r * (1 + k*r^2); 0 is a flat panel
    scanlines: 240,       // RASTER LINES down the visible height -- a real count, not a frequency
    scanDepth: 0.35,      // how dark the gap between lines is, 0..1
    maskPitch: 3,         // phosphor triad pitch in OUTPUT PIXELS; 3 is one R,G,B stripe per pixel column
    maskDepth: 0.30,      // how strongly the mask tints, 0..1
    vignette: 0.35,       // corner falloff, 0..1
    bleed: 0.35,          // horizontal beam-spot width: how much a pixel smears into its neighbours, 0..1
    gain: 1.15,           // post-gain, because masking and scanlines both remove light
    tint: [0.35, 1.0, 0.55],   // phosphor colour. P1-ish green for a Pip-Boy; [1,1,1] leaves colour alone
};

/** Clamp helper shared by both halves so rounding cannot differ at the edges.
 * @param {number} v @returns {number} */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * BARREL DISTORTION. The glass is a section of a sphere, so a point at radius r from centre is displaced
 * outward by r*(1 + k*r^2). Inverted here: for an OUTPUT pixel we ask which INPUT pixel lands on it, which is
 * why the sign works out as a pull toward centre.
 *
 * Returns null when the sample falls outside the tube -- the black beyond the glass, which must be a hard edge
 * rather than a clamp. Clamping instead smears the border pixel outward and reads as a stretched image.
 * @param {number} u @param {number} v @param {number} curvature @returns {[number, number] | null}
 */
export function barrel(u, v, curvature) {
    const cx = u * 2 - 1, cy = v * 2 - 1;
    const r2 = cx * cx + cy * cy;
    const f = 1 + curvature * r2;
    const su = (cx * f) * 0.5 + 0.5, sv = (cy * f) * 0.5 + 0.5;
    if (su < 0 || su > 1 || sv < 0 || sv > 1) return null;
    return [su, sv];
}

/**
 * SCANLINES. The beam paints discrete lines with gaps between; brightness follows the beam profile across a
 * line, which is close enough to a raised cosine. `scanlines` is a LINE COUNT, so the period in the output is
 * height/scanlines pixels and the gate can literally count the dark rows.
 */
/**
 * *** THE PHASE IS TAKEN AT THE ROW'S TOP EDGE, NOT ITS CENTRE, AND THAT IS A BUG THE GATE CAUGHT AFTER BOTH
 * IMPLEMENTATIONS AGREED WITH EACH OTHER. *** Sampling at the pixel centre, (y+0.5)/h, is the right thing
 * everywhere else in this file -- and here it is catastrophic at the MOST NATURAL SETTING. With 240 scanlines
 * on 480 rows, exactly two rows per line, the phase is (y+0.5)*pi, whose cosine is ZERO FOR EVERY INTEGER y.
 * Measured: the whole image came out a flat 178/255 with no scanlines at all, and the GPU reproduced that
 * faithfully because the shader is a faithful mirror. Two implementations agreeing is not the same as being
 * right, which is exactly why section 2 of the gate counts the bands that actually appear instead of trusting
 * the shadow test.
 *
 * Using y/h aligns the raster grid to the pixel grid: cos(y*pi) alternates +1, -1, so one row is beam and the
 * next is gap, which is what two-rows-per-line is supposed to look like.
 * @param {number} vRow @param {number} lines @param {number} depth @returns {number}
 */
export function scanline(vRow, lines, depth) {
    const phase = vRow * lines * Math.PI * 2;
    return 1 - depth * 0.5 * (1 - Math.cos(phase));
}

/**
 * THE PHOSPHOR MASK. An aperture-grille tube has vertical R,G,B stripes; a pixel sitting on the red stripe
 * shows red brighter. Indexed by OUTPUT PIXEL COLUMN, not by uv, because the pitch is a property of the screen
 * and not of the image being shown.
 * @param {number} px @param {number} pitch @param {number} depth @returns {[number, number, number]}
 */
export function mask(px, pitch, depth) {
    const idx = Math.floor(px % pitch) % 3;
    /** @type {[number, number, number]} */
    const w = [1 - depth, 1 - depth, 1 - depth];
    w[idx] = 1 + depth * 2;
    return w;
}

/** VIGNETTE. Falls off with radius; monotonic by construction so the gate can require that it never brightens.
 * @param {number} u @param {number} v @param {number} strength @returns {number} */
export function vignette(u, v, strength) {
    const cx = u * 2 - 1, cy = v * 2 - 1;
    const r2 = cx * cx + cy * cy;
    return clamp01(1 - strength * r2 * 0.5);
}

/**
 * ONE OUTPUT PIXEL, from a nearest-neighbour sampler. `sample(x, y)` takes INTEGER source pixel coordinates
 * and returns [r,g,b] in 0..1; the GLSL does the same with texelFetch, which is also integer and unfiltered,
 * so the two agree by construction rather than by tuning a tolerance.
 * @param {number} px @param {number} py @param {number} w @param {number} h
 * @param {(x: number, y: number) => [number, number, number]} sample
 * @param {CrtParams} [p] @returns {[number, number, number]}
 */
export function crtPixel(px, py, w, h, sample, p = DEFAULTS) {
    const u = (px + 0.5) / w, v = (py + 0.5) / h;
    const b = barrel(u, v, p.curvature);
    if (!b) return [0, 0, 0];
    const sx = Math.min(w - 1, Math.max(0, Math.floor(b[0] * w)));
    const sy = Math.min(h - 1, Math.max(0, Math.floor(b[1] * h)));

    // Horizontal beam bleed: the spot has width, so a pixel carries some of each neighbour. Three taps, and
    // the weights sum to exactly 1 so a flat field keeps its brightness.
    const c = sample(sx, sy);
    let r = c[0], g = c[1], bl = c[2];
    if (p.bleed > 0) {
        const l = sample(Math.max(0, sx - 1), sy), rr = sample(Math.min(w - 1, sx + 1), sy);
        const side = p.bleed * 0.5, mid = 1 - p.bleed;
        r = l[0] * side + c[0] * mid + rr[0] * side;
        g = l[1] * side + c[1] * mid + rr[1] * side;
        bl = l[2] * side + c[2] * mid + rr[2] * side;
    }

    // Row EDGE for the scanline phase (see scanline()); pixel CENTRE for everything geometric.
    const sc = scanline(py / h, p.scanlines, p.scanDepth);
    const mk = mask(px, p.maskPitch, p.maskDepth);
    const vg = vignette(u, v, p.vignette);
    const k = p.gain * sc * vg;
    return [
        clamp01(r * mk[0] * k * p.tint[0]),
        clamp01(g * mk[1] * k * p.tint[1]),
        clamp01(bl * mk[2] * k * p.tint[2]),
    ];
}

/** Whole-image convenience: RGBA in, RGBA out, both Uint8ClampedArray. The gate's CPU side.
 * @param {Uint8ClampedArray} src @param {number} w @param {number} h @param {CrtParams} [p]
 * @returns {Uint8ClampedArray} */
export function crtImage(src, w, h, p = DEFAULTS) {
    const out = new Uint8ClampedArray(w * h * 4);
    /** @param {number} x @param {number} y @returns {[number, number, number]} */
    const sample = (x, y) => {
        const i = (y * w + x) * 4;
        return [src[i] / 255, src[i + 1] / 255, src[i + 2] / 255];
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c = crtPixel(x, y, w, h, sample, p);
            const i = (y * w + x) * 4;
            out[i] = Math.round(c[0] * 255);
            out[i + 1] = Math.round(c[1] * 255);
            out[i + 2] = Math.round(c[2] * 255);
            out[i + 3] = 255;
        }
    }
    return out;
}

/** Named looks. `off` exists so the page can A/B without a second code path. */
/** @type {Record<string, CrtParams>} */
export const PRESETS = {
    off:    { ...DEFAULTS, curvature: 0, scanDepth: 0, maskDepth: 0, vignette: 0, bleed: 0, gain: 1, tint: [1, 1, 1] },
    pipboy: { ...DEFAULTS },
    arcade: { ...DEFAULTS, curvature: 0.18, scanlines: 224, scanDepth: 0.45, maskDepth: 0.38, tint: [1, 1, 1], gain: 1.25 },
    trinitron: { ...DEFAULTS, curvature: 0.04, scanlines: 480, scanDepth: 0.22, maskPitch: 3, maskDepth: 0.22, tint: [1, 1, 1], gain: 1.1 },
};
