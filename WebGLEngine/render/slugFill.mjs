// WebGLEngine/render/slugFill.mjs -- v4500
//
// *** A FILL INSIDE THE GLYPH: SLUG'S COVERAGE TIMES A TEXTURE SAMPLED AT THE EM COORDINATES (task 47). *** Slug's
// fragment ends in colour x coverage. Under `fill: true` (text/slugShader.js and text/slugShaderWgsl.js, both twins) it
// samples a texture NEAREST at the fragment's em coordinates mapped through fillRect -- an em rectangle sent to fill uv
// 0..1, v flipped so the fill's row 0 is the rectangle's top -- and multiplies it in before the coverage:
//     fragColor = colour * fill * coverage
// Without the flag the fragments are the reference's byte for byte. This module is the CPU side: the uv map, the
// nearest sample, the rectangle a layout's glyphs span, the Doom Fire automaton (render/doomFire.mjs) as the first
// fill -- its byte grid against its 37-colour palette, uploaded as an rgba8 texture each step -- and the key the gate
// holds the frame to: slugEval's coverage at the rasteriser model's texcoord times the fill's nearest texel there.
"use strict";
import { DoomFire } from "./doomFire.mjs";

/** em coordinates -> fill uv in [0, 1] through the rectangle; the same arithmetic as both fragments */
export function fillUv(tx, ty, rect) {
    const cl = (x) => Math.min(1, Math.max(0, x));
    const u = cl((tx - rect[0]) / (rect[2] - rect[0])), v = cl((ty - rect[1]) / (rect[3] - rect[1]));
    return [u, 1 - v];
}

/** the texel a nearest sample takes, clamped to the edge (the sampler's address mode) */
export function nearestTexel(u, v, w, h) {
    return [Math.min(w - 1, Math.max(0, Math.floor(u * w))), Math.min(h - 1, Math.max(0, Math.floor(v * h)))];
}

/** the fill's colour (0..1 x 4) at an em coordinate: nearest texel of an rgba8 buffer */
export function sampleFill(rgba, w, h, tx, ty, rect) {
    const [u, v] = fillUv(tx, ty, rect), [x, y] = nearestTexel(u, v, w, h), o = (y * w + x) * 4;
    return [rgba[o] / 255, rgba[o + 1] / 255, rgba[o + 2] / 255, rgba[o + 3] / 255];
}

/** the em rectangle a layout's inked glyphs span, glyph by glyph (each glyph's texcoords are its own em box, so the fill repeats per glyph) */
export function glyphRect(entry) { const b = entry.bbox; return [b.x0, b.y0, b.x1, b.y1]; }

/** a Doom Fire fill: the automaton at `width` x `height`, stepped `steps` times from a seed, as an rgba8 buffer */
export function fireFill({ width = 64, height = 48, seed = 7, steps = 40 } = {}) {
    const fire = new DoomFire({ width, height, seed }).light();
    for (let i = 0; i < steps; i++) fire.step();
    return { fire, rgba: fire.toRGBA(), w: width, h: height };
}

/** upload a fill as a nearest-sampled rgba8 texture; `rgba` is Uint8ClampedArray w * h * 4 */
export function fillTexture(device, rgba, w, h) {
    return device.texture({ format: "rgba8unorm", width: w, height: h, data: rgba, nearest: true });
}

/** the key: what the fragment returns at one texcoord -- colour * fill * coverage, as four channels 0..1 */
export function fillKey(coverage, colour, fill) { return [colour[0] * fill[0] * coverage, colour[1] * fill[1] * coverage, colour[2] * fill[2] * coverage, colour[3] * fill[3] * coverage]; }
