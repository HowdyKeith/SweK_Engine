// WebGLEngine/render/strengthField.mjs -- v4299 (Level 11)
//
// EFFECT STRENGTH AS A SPATIAL FIELD.
//
// badTv and crt took scalar knobs only: one number for the whole frame. A field is a small texture whose red
// channel is the strength s in [0, 1] at that point of the picture, sampled at the pixel's uv. The shaders
// (badTvWgsl.mjs FIELD_FRAGMENT_WGSL, badTvDevicePass.mjs FIELD_FRAGMENT_GLSL, crtPass.js) read it; the CPU
// models (badTvModel.mjs sampleAt, crtModel.js crtPixel) take the same s as an argument; this file is where
// the fields are MADE and where the CPU reads one back the way the GPU does.
//
// *** fieldAt() SAMPLES NEAREST, AND THE FIELD SHOULD BE BOUND NEAREST FOR AN EXACT COMPARISON. *** A field the
// size of the frame with nearest sampling means every pixel reads its own texel, and a gate can demand the
// GPU and the model agree exactly. A small field bound linear is the pleasant case for a page -- a 16x16
// gradient stretched over the screen -- and there the model is an approximation by half a texel, which is
// said here rather than discovered in a diff.
"use strict";

/** A field is { width, height, data }: RGBA8, red = strength. The other channels are copies so it views as grey. */
export function makeField(width, height, fn) {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const s = Math.max(0, Math.min(1, fn((x + 0.5) / width, (y + 0.5) / height, x, y)));
        const v = Math.round(s * 255), i = (y * width + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    return { width, height, data };
}

/** The scalar effect, as a field: 1x1, strength v everywhere. The default any consumer should bind. */
export function constantField(v = 1) { return makeField(1, 1, () => v); }

/**
 * Strength by distance from the centre: `min` inside radius `inner`, `max` outside `outer`, linear between.
 * Radius is in units where 1 reaches the midpoint of an edge, so corners are at ~1.41.
 */
export function radialField(width, height, { inner = 0.25, outer = 0.9, min = 0, max = 1 } = {}) {
    return makeField(width, height, (u, v) => {
        const r = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
        const t = outer === inner ? (r >= outer ? 1 : 0) : Math.max(0, Math.min(1, (r - inner) / (outer - inner)));
        return min + (max - min) * t;
    });
}

/** A horizontal band: strength `inside` for v in [v0, v1], `outside` elsewhere. */
export function bandField(width, height, { v0 = 0.4, v1 = 0.6, inside = 1, outside = 0 } = {}) {
    return makeField(width, height, (u, v) => (v >= v0 && v < v1 ? inside : outside));
}

/** The strength at (u, v), nearest-sampled and clamped to the edge -- what a NEAREST/CLAMP sampler returns. */
export function fieldAt(field, u, v) {
    const x = Math.max(0, Math.min(field.width - 1, Math.floor(u * field.width)));
    const y = Math.max(0, Math.min(field.height - 1, Math.floor(v * field.height)));
    return field.data[(y * field.width + x) * 4] / 255;
}
