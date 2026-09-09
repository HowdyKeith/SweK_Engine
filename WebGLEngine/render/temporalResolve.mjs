// render/temporalResolve.mjs -- THE JITTER-AWARE LANCZOS2 RESOLVE: the piece that makes this upscaling rather than
// anti-aliasing, and the one place a render-resolution sample has to land between display pixels.
//
// render/temporalAccumulate.mjs accumulates at ratio 1, where the jittered samples and the output share a grid and
// the accumulation IS the super-sample. Above 1 they do not share a grid: each frame's samples land at
// render-resolution positions, offset by that phase's jitter, and every display pixel has to be built from the
// render texels around it. This is that resolve.
//
// *** THE WHOLE RUNG IS ONE SUBTRACTION. *** srcPos = uv * renderSize - 0.5 - JITTER. The kernel weights are
// distances from the display pixel to where the samples ACTUALLY LANDED, not to the render texel grid. Drop the
// jitter term and you get a fixed Lanczos upsample of a wobbling image: the samples move every frame and the
// weights do not, so the accumulation averages misaligned taps and converges to a blur. With it, the weights track
// the samples and the accumulation resolves detail the render resolution cannot carry. The gate measures both.
//
// A departure from the reference, stated where a reader looks for it: FSR does the dering clamp in YCoCg, which
// shapes the box perceptually. This does it in RGB. The clamp still does its job -- Lanczos2's negative lobes
// overshoot and the box is what stops it -- but the two will not agree to the bit, and a YCoCg box is its own rung.
"use strict";

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Lanczos2: 2 sin(pi x) sin(pi x / 2) / (pi x)^2. One at x = 0, zero at every other integer, and zero beyond 2 --
 * which is why a 3x3 footprint is enough when the sample is within half a texel of the centre tap.
 */
export function lanczos2(x) {
    const ax = Math.abs(x);
    if (ax < 1e-4) return 1;
    if (ax >= 2) return 0;
    const px = Math.PI * ax;
    return 2 * Math.sin(px) * Math.sin(px * 0.5) / (px * px);
}

/**
 * Resolve one jittered render-resolution frame to display resolution.
 *
 * `jitter` is [jx, jy] in RENDER-resolution pixels, the same units and orientation render/jitter.mjs produces.
 * Returns { data, confidence }: the resolved rgba at display resolution, and per display pixel how near a real
 * sample landed -- 1 when one landed on it, falling to 0.25 when the pixel sits between samples. FSR uses that to
 * weight the blend; this module reports it and lets the caller decide.
 *
 * `jitterAware` exists so the gate can measure what the subtraction buys. Nothing else should ever pass false.
 */
export function resolveJitterAwareCPU({ src, rw, rh, dw, dh, jitter, jitterAware = true, dering = true }) {
    const out = new Float32Array(dw * dh * 4);
    const confidence = new Float32Array(dw * dh);
    const [jx, jy] = jitter;
    const at = (x, y, c) => src[(clampi(y, 0, rh - 1) * rw + clampi(x, 0, rw - 1)) * 4 + c];
    for (let py = 0; py < dh; py++) for (let px = 0; px < dw; px++) {
        const u = (px + 0.5) / dw, v = (py + 0.5) / dh;
        // the display pixel in RENDER texel-index space, shifted to where the samples actually landed
        const sx = u * rw - 0.5 - (jitterAware ? jx : 0);
        const sy = v * rh - 0.5 - (jitterAware ? jy : 0);
        const bx = Math.round(sx), by = Math.round(sy);

        let wsum = 0; const csum = [0, 0, 0];
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const cx = clampi(bx + dx, 0, rw - 1), cy = clampi(by + dy, 0, rh - 1);
            const w = lanczos2(sx - (bx + dx)) * lanczos2(sy - (by + dy));
            wsum += w;
            for (let c = 0; c < 3; c++) {
                const s = at(cx, cy, c);
                csum[c] += s * w;
                if (s < lo[c]) lo[c] = s;
                if (s > hi[c]) hi[c] = s;
            }
        }
        const o = (py * dw + px) * 4;
        for (let c = 0; c < 3; c++) {
            let val = csum[c] / (Math.abs(wsum) > 1e-4 ? wsum : 1e-4);
            // Lanczos2's lobes go NEGATIVE, so the weighted sum can leave the range of its own taps. The box of
            // the 3x3 is what stops it; without this a hard edge rings.
            if (dering) val = val < lo[c] ? lo[c] : val > hi[c] ? hi[c] : val;
            out[o + c] = val;
        }
        out[o + 3] = 1;
        // how near a real sample landed on this display pixel
        const d = Math.hypot(sx - bx, sy - by);
        confidence[py * dw + px] = Math.min(1, Math.max(0.25, 1 - d));
    }
    return { data: out, confidence, w: dw, h: dh };
}
