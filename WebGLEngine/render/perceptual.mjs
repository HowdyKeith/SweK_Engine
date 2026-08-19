// WebGLEngine/render/perceptual.mjs — v3337
// ---------------------------------------------------------------------------------------------------------------
// PERCEPTUAL IMAGE METRICS, BECAUSE A PIXEL DIFF IS THE WRONG QUESTION.
//
// physics/backendVisualDiff.mjs rasterises two physics scenes and counts pixels that differ by more than a
// threshold. That is a real check and it has two failure modes in opposite directions:
//
//   IT FAILS ON A ONE-PIXEL SHIFT. Translate an identical render by a single pixel and every edge pixel differs;
//   the diff fraction jumps while nothing about the physics changed.
//   IT PASSES A STRUCTURALLY WRONG RENDER that happens to land the same colours in the same places -- boxes in
//   the wrong ORDER, for instance, since the shade is a function of body index.
//
// So this adds signals that answer "does it look like the same thing" rather than "are the bytes equal". The
// idea is lifted from img2threejs's stage-4 evaluator (Apache 2.0), whose header independently arrives at this
// tree's own rule -- deterministic, zero-token, and hard gates that a soft average cannot wash out. NO CODE IS
// COPIED: that implementation is Python and this is JS, and the valuable part was the shape rather than the
// arithmetic.
//
// *** AND THEIR THRESHOLDS ARE DELIBERATELY NOT IMPORTED. *** IoU < 0.85 and scale delta > 0.08 are numbers
// tuned against photographs of knives. Adopting them here would be adopting a tolerance nobody in this tree
// measured, which is the defect this session has found four times over. Every constant below is either exact
// (pHash on identical input is 0 by construction) or earned from a measured floor in the gate.
//
// EVERY METRIC HAS AN EXACT KEY, which is the price of admission:
//   pHash        -- identical images differ by 0 bits, exactly. An inverted image differs by a computable count.
//   SSIM         -- an image against itself is exactly 1. Against a constant-offset copy it is a closed form.
//   edge overlap -- a shape against itself is exactly 1; against its complement, exactly 0.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

// *** TWO IMAGE SHAPES EXIST IN THIS TREE AND BOTH ARE LEGITIMATE. *** physics/backendVisualDiff rasterises to
// {data, w, h}; tools/render-qa/checks.mjs and the PNG decoder use {data, width, height}. Rather than convert at
// every call site -- which is where a w/width mix-up would eventually pass the wrong dimension and silently
// reinterpret the buffer as a different picture -- every entry point normalises once, here.
export const dims = (img) => ({ data: img.data, w: img.w != null ? img.w : img.width, h: img.h != null ? img.h : img.height });

/** Luma plane from an RGBA buffer. Rec. 601 weights, the same ones the rasterizer's shades assume. */
export function luma(img) {
    const { data, w, h } = dims(img);
    const out = new Float64Array(w * h);
    for (let i = 0, p = 0; p < w * h; i += 4, p++) out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return { g: out, w, h };
}

/** Box-average downscale to n x n. Deterministic, no interpolation library. */
export function downscale({ g, w, h }, n) {
    const out = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const x0 = Math.floor(x * w / n), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / n));
        const y0 = Math.floor(y * h / n), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / n));
        let s = 0, c = 0;
        for (let yy = y0; yy < y1 && yy < h; yy++) for (let xx = x0; xx < x1 && xx < w; xx++) { s += g[yy * w + xx]; c++; }
        out[y * n + x] = c ? s / c : 0;
    }
    return { g: out, w: n, h: n };
}

// ---- pHash --------------------------------------------------------------------------------------------------
// A 64-bit perceptual hash: downscale to 32x32, take the 2D DCT, keep the low-frequency 8x8 block (excluding the
// DC term, which is just overall brightness), and set one bit per coefficient above the median. Structure
// survives; brightness and small shifts do not affect it much. Hamming distance is the comparison.
function dct2(g, n) {
    const out = new Float64Array(n * n);
    const cos = new Float64Array(n * n);
    for (let u = 0; u < n; u++) for (let x = 0; x < n; x++) cos[u * n + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n));
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
        let s = 0;
        for (let y = 0; y < n; y++) { const cvy = cos[v * n + y]; for (let x = 0; x < n; x++) s += g[y * n + x] * cos[u * n + x] * cvy; }
        const au = u === 0 ? Math.SQRT1_2 : 1, av = v === 0 ? Math.SQRT1_2 : 1;
        out[v * n + u] = 0.25 * au * av * s;
    }
    return out;
}

export function pHash(img, { size = 32, keep = 8 } = {}) {
    const small = downscale(luma(img), size);
    const d = dct2(small.g, size);
    const vals = [];
    for (let v = 0; v < keep; v++) for (let u = 0; u < keep; u++) { if (u === 0 && v === 0) continue; vals.push(d[v * size + u]); }
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    let hi = 0n;
    for (let i = 0; i < vals.length; i++) if (vals[i] > med) hi |= (1n << BigInt(i));
    return hi;
}

export const hamming = (a, b) => { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };

/** Agreement in [0,1]: 1 when the hashes are identical, 0 when every bit differs. */
export const phashAgreement = (a, b, bits = 63) => 1 - hamming(a, b) / bits;

// ---- SSIM ---------------------------------------------------------------------------------------------------
// Global structural similarity on the luma plane, with the standard stabilising constants. An image against
// itself is EXACTLY 1 -- that is arithmetic, not a tolerance, because numerator and denominator become the same
// expression term for term.
export function ssim(a, b, { L = 255 } = {}) {
    const ga = luma(a).g, gb = luma(b).g;
    const n = Math.min(ga.length, gb.length);
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += ga[i]; mb += gb[i]; }
    ma /= n; mb /= n;
    let va = 0, vb = 0, cov = 0;
    for (let i = 0; i < n; i++) { const da = ga[i] - ma, db = gb[i] - mb; va += da * da; vb += db * db; cov += da * db; }
    va /= (n - 1); vb /= (n - 1); cov /= (n - 1);
    const c1 = (0.01 * L) ** 2, c2 = (0.03 * L) ** 2;
    return ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
}

// ---- Sobel edge overlap ---------------------------------------------------------------------------------------
// Where the linework is, rather than what colour it is. Threshold the gradient magnitude at a fraction of its own
// maximum, then take the Jaccard overlap of the two edge sets -- which is scale-free, so a brighter render with
// the same shape still agrees.
export function sobel(img) {
    const { data, w, h } = dims(img);
    const { g } = luma(img);
    const mag = new Float64Array(w * h);
    let max = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const at = (xx, yy) => g[yy * w + xx];
        const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const m = Math.hypot(gx, gy);
        mag[y * w + x] = m;
        if (m > max) max = m;
    }
    return { mag, w, h, max };
}

export function edgeOverlap(a, b, { frac = 0.25 } = {}) {
    const ea = sobel(a), eb = sobel(b);
    const ta = ea.max * frac, tb = eb.max * frac;
    let inter = 0, union = 0;
    for (let i = 0; i < ea.mag.length; i++) {
        const A = ea.mag[i] > ta, B = eb.mag[i] > tb;
        if (A && B) inter++;
        if (A || B) union++;
    }
    return union === 0 ? 1 : inter / union;      // two blank images agree perfectly, which is correct
}
