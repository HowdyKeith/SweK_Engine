// fx/fsr/fsr.js -- EASU, the upscale half of AMD FidelityFX Super Resolution 1 (FSR1), reimplemented NATIVELY for
// SweK. No aggregator, no external deps -- just the algorithm, as a pass. The same choice fx/anime4k made, and for
// the same reason, MEASURED here rather than assumed: @pmndrs/upscaler@0.2.0 ships 2,743 lines of WGSL that import
// no three at all and 3,331 lines of three.js DRIVER around them (Upscaler.ts, UpscalerNode.ts, types.ts,
// TemporalGuidesNode.ts, UpscalePass.ts, MomentsPass.ts, internal/threeWebGPU.ts). gfx/device.js already IS that
// driver. Taking the package would take the wrapper for the sake of the kernel.
//
// EASU -- Edge Adaptive Spatial Upsampling -- is a faithful transcription of the f32 reference `FsrEasuF` from AMD's
// ffx_fsr1.h (MIT, Advanced Micro Devices). Per output pixel:
//   1. analyse the local luma gradient at the 4 nearest texels to find the dominant edge DIRECTION and STRENGTH;
//   2. evaluate a 12-tap Lanczos-like kernel ROTATED to that direction and stretched along it / squeezed across it;
//   3. DERING by clamping the result to the componentwise min/max of the 4 nearest texels.
// It is spatial: one frame in, one frame out, no history, no depth, no motion vectors. FSR's temporal path (FSR2/3)
// needs all three and this tree has none of them -- there is no previous-frame view-projection matrix anywhere in
// it -- so that is a later rung and this file does not pretend otherwise.
//
// Two departures from the reference, both deliberate and both stated where a reader will look for them:
//   * the `APrxLo*` reciprocal bit-tricks are exact 1/x and 1/sqrt(x) here. They are an approximation the reference
//     takes for speed on hardware that wants it; taking it would make the CPU mirror and the GPU disagree for a
//     reason that is not the algorithm.
//   * taps are clamped loads, not packed textureGathers. The picture is the same; the packing is a perf-only
//     optimisation, and this rung is about the picture.
//
// EASU expects PERCEPTUAL input, as FSR1 does. This file does not choose or bake a transfer function; a caller
// handing it linear-light values gets a technically-correct answer to a different question, and that is the
// caller's to decide.
//
// rgba buffers are Float32 in [0, 1], the same shape fx/anime4k uses, so the two upscalers can be fed one picture.
"use strict";

const EPS = 1e-5;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v | 0);

/** EASU's luma is GREEN-WEIGHTED (0.5r + g + 0.5b), not Rec.709 -- the reference's own weighting, kept. */
function easuLuma(r, g, b) { return 0.5 * r + g + 0.5 * b; }

/**
 * Gradient analysis at one of the 4 nearest texels, bilinearly weighted (FsrEasuSetF). `c` is the centre of a `+`
 * of lumas: a above, b left, d right, e below. Accumulates an unnormalised edge direction and an edge strength.
 */
function easuSet(acc, w, lA, lB, lC, lD, lE) {
    let lenX = Math.max(Math.abs(lD - lC), Math.abs(lC - lB));
    lenX = 1 / Math.max(lenX, EPS);
    const dirX = lD - lB;
    acc.dirX += dirX * w;
    lenX = clamp(Math.abs(dirX) * lenX, 0, 1);
    acc.len += lenX * lenX * w;

    let lenY = Math.max(Math.abs(lE - lC), Math.abs(lC - lA));
    lenY = 1 / Math.max(lenY, EPS);
    const dirY = lE - lA;
    acc.dirY += dirY * w;
    lenY = clamp(Math.abs(dirY) * lenY, 0, 1);
    acc.len += lenY * lenY * w;
}

/** One kernel tap: rotate the offset into edge space, stretch it, then weight by Lanczos2's polynomial form (FsrEasuTapF). */
function easuTap(acc, offX, offY, dirX, dirY, lenX, lenY, lob, clp, r, g, b) {
    const vx = (offX * dirX + offY * dirY) * lenX;
    const vy = (offX * -dirY + offY * dirX) * lenY;
    let d2 = vx * vx + vy * vy;
    d2 = d2 < clp ? d2 : clp;
    let wB = (2 / 5) * d2 - 1, wA = lob * d2 - 1;
    wB *= wB; wA *= wA;
    wB = (25 / 16) * wB - (25 / 16 - 1);
    const w = wB * wA;
    acc.r += r * w; acc.g += g * w; acc.b += b * w; acc.w += w;
}

/**
 * EASU on the CPU: the ground truth the WGSL is held to. `src` is rgba Float32 at w x h; the result is rgba Float32
 * at W x H, alpha 1. Upscaling is the point but nothing here forbids W < w; the kernel is the same either way.
 */
function easuCPU(src, w, h, W, H) {
    const out = new Float32Array(W * H * 4);
    const S = (x, y, c) => src[(clampi(y, 0, h - 1) * w + clampi(x, 0, w - 1)) * 4 + c];
    const sx = w / W, sy = h / H;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        let ppx = (px + 0.5) * sx - 0.5, ppy = (py + 0.5) * sy - 0.5;
        const fx = Math.floor(ppx), fy = Math.floor(ppy);
        ppx -= fx; ppy -= fy;

        //     b c            the 12-tap footprint, in the reference's own lettering
        //   e f g h
        //   i j k l
        //     n o
        const OFF = [[0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
        const c = OFF.map(([ox, oy]) => [S(fx + ox, fy + oy, 0), S(fx + ox, fy + oy, 1), S(fx + ox, fy + oy, 2)]);
        const L = c.map(([r, g, b]) => easuLuma(r, g, b));
        const [B, C, E, F, G, Hh, I, J, K, Lp, N, O] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

        // edge analysis at f, g, j, k, blended by the sub-texel position
        const acc = { dirX: 0, dirY: 0, len: 0 };
        easuSet(acc, (1 - ppx) * (1 - ppy), L[B], L[E], L[F], L[G], L[J]);
        easuSet(acc, ppx * (1 - ppy), L[C], L[F], L[G], L[Hh], L[K]);
        easuSet(acc, (1 - ppx) * ppy, L[F], L[I], L[J], L[K], L[N]);
        easuSet(acc, ppx * ppy, L[G], L[J], L[K], L[Lp], L[O]);

        // kernel shaping: normalise the direction (a flat region falls back to axis-aligned, zero strength),
        // square the strength, then stretch along the edge and squeeze across it
        let dirX = acc.dirX, dirY = acc.dirY;
        let dirR = dirX * dirX + dirY * dirY;
        const zro = dirR < 1 / 32768;
        dirR = 1 / Math.sqrt(Math.max(dirR, 1e-12));
        if (zro) { dirR = 1; dirX = 1; }   // dirY keeps its (tiny) value, as the reference's select() does
        dirX *= dirR; dirY *= dirR;
        let len = acc.len * 0.5; len *= len;
        const stretch = (dirX * dirX + dirY * dirY) / Math.max(Math.abs(dirX), Math.abs(dirY));
        const lenX = 1 + (stretch - 1) * len, lenY = 1 - 0.5 * len;
        const lob = 0.5 + ((1 / 4 - 0.04) - 0.5) * len, clp = 1 / lob;

        // accumulation, then the dering clamp over the 4 NEAREST texels only
        const a = { r: 0, g: 0, b: 0, w: 0 };
        for (let t = 0; t < 12; t++) easuTap(a, OFF[t][0] - ppx, OFF[t][1] - ppy, dirX, dirY, lenX, lenY, lob, clp, c[t][0], c[t][1], c[t][2]);
        const near = [F, G, J, K];
        const o = (py * W + px) * 4;
        for (let ch = 0; ch < 3; ch++) {
            let lo = c[near[0]][ch], hi = lo;
            for (let n = 1; n < 4; n++) { const v = c[near[n]][ch]; if (v < lo) lo = v; if (v > hi) hi = v; }
            const v = [a.r, a.g, a.b][ch] / a.w;
            out[o + ch] = Math.min(hi, Math.max(lo, v));
        }
        out[o + 3] = 1;
    }
    return { data: out, w: W, h: H };
}

/** Plain bilinear, for the gate to hold EASU against: the thing EASU has to beat on an edge. */
function bilinearCPU(src, w, h, W, H) {
    const out = new Float32Array(W * H * 4);
    const S = (x, y, c) => src[(clampi(y, 0, h - 1) * w + clampi(x, 0, w - 1)) * 4 + c];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const sx = (px + 0.5) * w / W - 0.5, sy = (py + 0.5) * h / H - 0.5;
        const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (py * W + px) * 4;
        for (let c = 0; c < 3; c++)
            out[o + c] = S(x0, y0, c) * (1 - fx) * (1 - fy) + S(x0 + 1, y0, c) * fx * (1 - fy)
                       + S(x0, y0 + 1, c) * (1 - fx) * fy + S(x0 + 1, y0 + 1, c) * fx * fy;
        out[o + 3] = 1;
    }
    return { data: out, w: W, h: H };
}

export { easuCPU, bilinearCPU, easuLuma, easuSet, easuTap };
