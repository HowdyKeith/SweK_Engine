// render/luminancePyramid.mjs -- FSR2's FIRST PASS: the mip chain of luminance, and the exposure from it.
//
// FSR2 dispatches ffx_fsr2_compute_luminance_pyramid before anything else. It halves the luminance of the
// current frame down to 1x1, and the bottom of that chain is the frame's average luminance, which drives
// AUTO-EXPOSURE. Everything after it -- the locks, the shading-change test, the accumulation -- works on
// exposed colour in the reference.
//
// *** AND ON THIS TREE'S CONTENT THE EXPOSURE HAS NOTHING TO DO, WHICH IS SAID HERE RATHER THAN DISCOVERED
// BY A READER. *** fsr.html's scene produces colour already in [0,1]: there is no HDR range to compress and
// no tone curve downstream. `exposureFrom` below returns a number, and on that content the number is near 1
// and multiplying by it changes the picture by nothing a PSNR can see. The pyramid is REAL and gradeable --
// the mips either are the averages of their parents or they are not -- and the exposure built on it is
// honest arithmetic on content that does not need it. A round claiming an image improvement from this pass
// on this page would be claiming something the content cannot supply, which is why no such claim is made
// and why render/luminancePyramid-selfcheck.mjs grades the CHAIN and not a picture.
//
// ---- THE PART THAT IS EASY TO GET WRONG AND EASY TO MISS --------------------------------------------------
//
// *** ODD SIZES. *** A 2x2 average of a 5-wide row has to do something with the fifth column. The naive
// `floor(w/2)` DROPS it, which looks entirely plausible -- the mips still halve, the chain still reaches 1x1,
// every pixel that survives is a correct average -- and the frame's mean quietly stops being the frame's
// mean. This uses `ceil`, so no column is ever dropped, and pays for it by CLAMPING at the edge, which
// double-counts the last row and column instead. That is a real bias and it is MEASURED rather than waved
// at: see the gate's section 2, which reports the drift at an odd size against a direct sum and holds a
// bound on it. Neither choice is exact; the difference is that this one is written down.
"use strict";
import { luma } from "./temporalReject.mjs";

/** How many mips a w x h image has, counting the full-size level, down to 1x1. */
export function levelsFor(w, h) {
    if (!(w >= 1 && h >= 1)) throw new Error(`levelsFor: need a positive size -- got ${w}x${h}`);
    let n = 1, ww = w, hh = h;
    while (ww > 1 || hh > 1) { ww = Math.ceil(ww / 2); hh = Math.ceil(hh / 2); n++; }
    return n;
}

/**
 * The luminance mip chain of an rgba frame.
 *
 * Returns { mips, sizes, levels, mean, exact }:
 *   mips[0]   w*h luminance, from render/temporalReject.mjs's `luma` -- NOT a second luma convention
 *   mips[n]   each the 2x2 average of mips[n-1], ceil-sized, clamped at the edge
 *   mean      the 1x1 bottom of the chain, which is what FSR2 reads for exposure
 *   exact     the true mean of mips[0], summed directly -- the control for `mean`
 *
 * *** `exact` IS NOT A DEBUG FIELD. *** At a power of two the chain's bottom and the direct sum agree to
 * float precision; at an odd size they do not, because the clamp double-counts an edge. Returning both is
 * what lets a caller -- or a gate -- see the size of that rather than trust that halving is averaging.
 */
export function luminancePyramidCPU({ src, w, h }) {
    if (!(w >= 1 && h >= 1)) throw new Error(`luminancePyramidCPU: need a positive size -- got ${w}x${h}`);
    if (!src || src.length < w * h * 4) throw new Error("luminancePyramidCPU: src must be w*h*4 rgba");
    const mips = [], sizes = [];
    const base = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) base[i] = luma(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]);
    mips.push(base); sizes.push([w, h]);
    let cw = w, ch = h;
    while (cw > 1 || ch > 1) {
        const nw = Math.ceil(cw / 2), nh = Math.ceil(ch / 2);
        const prev = mips[mips.length - 1], next = new Float32Array(nw * nh);
        for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
            // CLAMPED, not dropped: at an odd size the last row and column are read twice rather than once
            const x0 = Math.min(2 * x, cw - 1), x1 = Math.min(2 * x + 1, cw - 1);
            const y0 = Math.min(2 * y, ch - 1), y1 = Math.min(2 * y + 1, ch - 1);
            next[y * nw + x] = 0.25 * (prev[y0 * cw + x0] + prev[y0 * cw + x1] +
                                       prev[y1 * cw + x0] + prev[y1 * cw + x1]);
        }
        mips.push(next); sizes.push([nw, nh]);
        cw = nw; ch = nh;
    }
    let s = 0; for (let i = 0; i < w * h; i++) s += base[i];
    return { mips, sizes, levels: mips.length, mean: mips[mips.length - 1][0], exact: s / (w * h) };
}

/**
 * FSR2's exposure from the chain's bottom: a scale that brings the frame's average luminance to `target`.
 *
 * *** THE FLOOR IS NOT COSMETIC. *** A frame whose average luminance is zero -- a fade to black, a frame
 * before anything is drawn -- would give an infinite scale, and every consumer downstream would see NaN one
 * frame later with nothing to say where it came from. The refusal is a floor rather than a throw because a
 * black frame is a legitimate thing for content to contain, unlike a negative size.
 */
export function exposureFrom(mean, { target = 0.18, floor = 1e-4, maxScale = 64 } = {}) {
    if (!(target > 0)) throw new Error(`exposureFrom: target must be positive -- got ${target}`);
    if (!(mean >= 0)) throw new Error(`exposureFrom: mean luminance cannot be negative -- got ${mean}`);
    return Math.min(maxScale, target / Math.max(floor, mean));
}
