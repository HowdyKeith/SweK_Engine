// WebGLEngine/render/ssimWindowed.mjs — v3691
// ---------------------------------------------------------------------------------------------------------------
// SSIM AS WANG ET AL. DEFINE IT: A LOCAL MAP, AVERAGED. THE ONE ALREADY HERE IS GLOBAL, AND THE DIFFERENCE IS
// NOT COSMETIC.
//
// render/perceptual.mjs has had an ssim() since v3337 and its header is honest about what it is -- "Global
// structural similarity on the luma plane" -- ONE window over the whole image. Wang, Bovik, Sheikh &
// Simoncelli (IEEE TIP 13(4), 2004) define it as an 11x11 CIRCULAR-SYMMETRIC GAUSSIAN window with sigma = 1.5,
// slid over the image, producing a LOCAL SSIM MAP whose MEAN is the reported figure. The local map is the whole
// idea: a metric that averages statistics over an entire render cannot see a defect confined to part of it.
//
// *** MEASURED BEFORE THIS FILE EXISTED, WHICH IS WHY IT EXISTS. *** Invert one corner of a 256x256 render and
// the global figure reads 0.99872 at 8x8 (0.10% of the pixels), 0.99068 at 16x16, 0.97469 at 32x32. A RENDER
// BUG CONFINED TO ONE REGION IS EXACTLY WHAT RENDER QA IS FOR, and the number barely moves. That is not a bug in
// the global form -- it is the correct behaviour of a global statistic, and it is the wrong instrument for the
// question render QA asks.
//
// NOTHING IS VENDORED. The prompt for this was teimurjan/blazediff (MIT), which ships @blazediff/ssim; no code
// was read from it and it is not a dependency. ONLY THE PUBLISHED DEFINITION TRAVELLED, which is the same rule
// heidler's physics and math/elliptic.js's Carlson algorithm came in under.
//
// *** THE KEYS ARE CLOSED FORMS THIS FILE IS NEVER TOLD, AND THEY ARE THE REASON TO TRUST IT. *** For b = a + d
// (a constant offset) the contrast and structure terms are EXACTLY 1 -- sigma_b = sigma_a and sigma_ab =
// sigma_a^2 -- so SSIM collapses to the luminance term alone, in closed form. For b = k*a (a gain) the structure
// term is exactly 1 and both others are closed forms in k. Neither is a number produced by this code, and
// ssimWindowed-selfcheck grades against both. The tolerance-free one is SSIM(x, x) = 1, which is arithmetic:
// numerator and denominator become the same expression term for term.
"use strict";
import { luma } from "./perceptual.mjs";

/**
 * The 1-D half of the separable Gaussian, normalised. The paper specifies an 11x11 circularly symmetric
 * Gaussian with sigma = 1.5; a symmetric 2-D Gaussian IS separable, so this is the same window and not an
 * approximation of it -- worth stating because a "fast Gaussian" that is NOT the paper's window would change
 * the number while looking like an optimisation.
 */
export function gaussian1d(win = 11, sigma = 1.5) {
    const k = new Float64Array(win), c = (win - 1) / 2;
    let sum = 0;
    for (let i = 0; i < win; i++) { const d = i - c; k[i] = Math.exp(-(d * d) / (2 * sigma * sigma)); sum += k[i]; }
    for (let i = 0; i < win; i++) k[i] /= sum;
    return k;
}

/**
 * Separable weighted blur with EDGE CLAMPING and per-pixel renormalisation. The alternative -- dropping pixels
 * whose window falls off the edge -- silently shrinks the averaged region and makes the result depend on image
 * size in a way the paper's definition does not. Renormalising keeps every output a true weighted mean.
 */
function blur(src, w, h, k) {
    const win = k.length, c = (win - 1) / 2;
    const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, wsum = 0;
        for (let i = 0; i < win; i++) {
            const xx = x + i - c;
            if (xx < 0 || xx >= w) continue;
            s += k[i] * src[y * w + xx]; wsum += k[i];
        }
        tmp[y * w + x] = s / wsum;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, wsum = 0;
        for (let i = 0; i < win; i++) {
            const yy = y + i - c;
            if (yy < 0 || yy >= h) continue;
            s += k[i] * tmp[yy * w + x]; wsum += k[i];
        }
        out[y * w + x] = s / wsum;
    }
    return out;
}

/**
 * @returns {{mssim:number, map:Float64Array, w:number, h:number, min:number, minAt:{x:number,y:number}}}
 * mssim is the mean of the local map -- the figure the paper reports. THE MAP AND ITS MINIMUM ARE RETURNED
 * BECAUSE THEY ARE THE POINT: the mean is what a global statistic could also have produced, and the worst
 * local window is what a global statistic can never produce.
 */
export function ssimWindowed(a, b, { L = 255, win = 11, sigma = 1.5 } = {}) {
    const la = luma(a), lb = luma(b);
    const w = Math.min(la.w, lb.w), h = Math.min(la.h, lb.h);
    if (w !== la.w || w !== lb.w || h !== la.h || h !== lb.h) {
        throw new Error("ssimWindowed: images differ in size (" + la.w + "x" + la.h + " vs " + lb.w + "x" + lb.h + ")");
    }
    // A window wider than the image is not the paper's estimator -- refuse rather than silently degrade into
    // the global form, which is the very thing this file exists to be distinguishable from.
    if (win > w || win > h) throw new Error("ssimWindowed: window " + win + " exceeds image " + w + "x" + h);

    const k = gaussian1d(win, sigma);
    const x = la.g, y = lb.g, n = w * h;
    const xx = new Float64Array(n), yy = new Float64Array(n), xy = new Float64Array(n);
    for (let i = 0; i < n; i++) { xx[i] = x[i] * x[i]; yy[i] = y[i] * y[i]; xy[i] = x[i] * y[i]; }

    const mx = blur(x, w, h, k), my = blur(y, w, h, k);
    const mxx = blur(xx, w, h, k), myy = blur(yy, w, h, k), mxy = blur(xy, w, h, k);

    const c1 = (0.01 * L) ** 2, c2 = (0.03 * L) ** 2;
    const map = new Float64Array(n);
    let sum = 0, min = Infinity, minAt = { x: 0, y: 0 };
    for (let i = 0; i < n; i++) {
        const ux = mx[i], uy = my[i];
        // The paper's local variances are the WEIGHTED second moments about the weighted mean.
        const vx = mxx[i] - ux * ux, vy = myy[i] - uy * uy, cxy = mxy[i] - ux * uy;
        const s = ((2 * ux * uy + c1) * (2 * cxy + c2)) / ((ux * ux + uy * uy + c1) * (vx + vy + c2));
        map[i] = s; sum += s;
        if (s < min) { min = s; minAt = { x: i % w, y: (i / w) | 0 }; }
    }
    return { mssim: sum / n, map, w, h, min, minAt };
}

/**
 * *** THE CLOSED FORM FOR A CONSTANT OFFSET, WHICH THE ESTIMATOR IS NEVER TOLD. *** With b = a + d the contrast
 * and structure terms are exactly 1, so SSIM is the luminance term at every window: it depends only on the local
 * mean. For a FLAT patch of value v this is a single number, and that is what the gate grades against.
 */
export function offsetKey(v, d, L = 255) {
    const c1 = (0.01 * L) ** 2, u = v, uy = v + d;
    return (2 * u * uy + c1) / (u * u + uy * uy + c1);
}

/** The closed form for a GAIN, b = k*a, on a flat patch: structure is exactly 1, the other two are exact in k. */
export function gainKey(v, kk, L = 255) {
    const c1 = (0.01 * L) ** 2, u = v, uy = kk * v;
    return (2 * u * uy + c1) / (u * u + uy * uy + c1);
}
