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

/**
 * The flat rasteriser model the Slug gates share (v4501, lifted from the fill gate's body so the melt gate can use it): a glyph's
 * quad placed orthographically at `origin` (baseline pixel, y down) at `size` px an em, its corners dilated half a pixel per axis
 * and snapped to 1/16 px, texcoords affine per triangle. Returns texAt(x, y) -> { tx, ty, fw } for a pixel centre inside the quad,
 * null outside. fw is the 2 x 2 quad's |d/dx| + |d/dy| per axis, what the fragment's fwidth reads.
 */
export function flatModel(bbox, size, origin) {
    const s = size, [ox, oy] = origin, bb = bbox;
    const C = [[bb.x0, bb.y0, -1, -1], [bb.x1, bb.y0, 1, -1], [bb.x1, bb.y1, 1, 1], [bb.x0, bb.y1, -1, 1]].map(([ex, ey, nx, ny]) => ({ sx: Math.round((ox + ex * s + 0.5 * nx) * 16) / 16, sy: Math.round((oy - (ey * s + 0.5 * ny)) * 16) / 16, tx: ex + 0.5 * nx / s, ty: ey + 0.5 * ny / s }));
    return (x, y) => {
        for (const [a1, b1, c1] of [[0, 2, 3], [0, 1, 2]]) {
            const A = C[a1], B = C[b1], K = C[c1];
            const det = (B.sx - A.sx) * (K.sy - A.sy) - (K.sx - A.sx) * (B.sy - A.sy);
            const s1 = (B.sx - A.sx) * (y - A.sy) - (B.sy - A.sy) * (x - A.sx), s2 = (K.sx - B.sx) * (y - B.sy) - (K.sy - B.sy) * (x - B.sx), s3 = (A.sx - K.sx) * (y - K.sy) - (A.sy - K.sy) * (x - K.sx);
            if (!((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))) continue;
            const dx = (k) => ((B[k] - A[k]) * (K.sy - A.sy) - (K[k] - A[k]) * (B.sy - A.sy)) / det, dy = (k) => ((K[k] - A[k]) * (B.sx - A.sx) - (B[k] - A[k]) * (K.sx - A.sx)) / det;
            const txdx = dx("tx"), txdy = dy("tx"), tydx = dx("ty"), tydy = dy("ty");
            return { tx: A.tx + txdx * (x - A.sx) + txdy * (y - A.sy), ty: A.ty + tydx * (x - A.sx) + tydy * (y - A.sy), fw: [Math.abs(txdx) + Math.abs(txdy), Math.abs(tydx) + Math.abs(tydy)] };
        }
        return null;
    };
}

/**
 * Grade a filled frame against the key: slugEval's coverage at the model's texcoord times the fill's nearest texel there. A pixel
 * off by more than tol must be the key with one of the four NEIGHBOURING texels (f32 landing a nearest sample across a texel
 * boundary from f64 -- a fill colour, never a blend); anything else is unexplained. Returns { exact, boundary, unexplained, worst, lit, tinted }.
 */
export function gradeFilled(pixels, W, H, texAt, coverageAt, fire, rect, colour, tol = 2) {
    let exact = 0, boundary = 0, unexplained = 0, worst = 0, lit = 0, tinted = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const t = texAt(i + 0.5, j + 0.5), o4 = (j * W + i) * 4;
        const cov = t ? coverageAt(t.tx, t.ty, t.fw) : 0;
        const fill = t ? sampleFill(fire.rgba, fire.w, fire.h, t.tx, t.ty, rect) : [0, 0, 0, 1], key = fillKey(cov, colour, fill);
        let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(pixels[o4 + c] - Math.round(key[c] * 255)));
        if (cov > 0.02) { lit++; if (pixels[o4] !== pixels[o4 + 2]) tinted++; }
        if (d === 0) exact++; if (d > worst) worst = d;
        if (d > tol) {
            const [u, v] = fillUv(t.tx, t.ty, rect), [x0, y0] = nearestTexel(u, v, fire.w, fire.h); let matched = false;
            for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const xx = Math.min(fire.w - 1, Math.max(0, x0 + ddx)), yy = Math.min(fire.h - 1, Math.max(0, y0 + ddy)), oo = (yy * fire.w + xx) * 4;
                const k2 = fillKey(cov, colour, [fire.rgba[oo] / 255, fire.rgba[oo + 1] / 255, fire.rgba[oo + 2] / 255, 1]);
                let d2 = 0; for (let c = 0; c < 3; c++) d2 = Math.max(d2, Math.abs(pixels[o4 + c] - Math.round(k2[c] * 255)));
                if (d2 <= tol) { matched = true; break; }
            }
            if (matched) boundary++; else unexplained++;
        }
    }
    return { exact, boundary, unexplained, worst, lit, tinted };
}
