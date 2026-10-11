// render/dilate.mjs -- DILATED DEPTH AND MOTION: the earliest of FSR2's passes this tree did not have.
//
// *** WHAT IT IS FOR. *** FSR2 does not hand the depth-clip and lock passes the raw per-pixel depth and
// motion. It first DILATES them: each pixel takes the NEAREST depth found in its 3x3 neighbourhood, and the
// motion vector of whichever pixel that depth came from. The effect is that a silhouette edge reprojects
// with the FOREGROUND object rather than with the background behind it. A thin or fast-moving object's edge
// pixels are the ones the accumulator most often gets wrong, because a half-covered pixel's depth belongs to
// whichever surface won the rasteriser's coin toss, and its motion vector then sends the history somewhere
// neither surface went.
//
// *** THE ARC ALREADY HAS A MEASUREMENT THAT SAYS THIS POPULATION MATTERS. *** v4663 split the reconstruction
// error by where the reactive mask fires and found the mask's whole effect -- help AND harm -- living in
// about ONE PERCENT of the picture, roughly four hundred pixels, at the moving slab's silhouette. That is
// the same population this pass exists to fix. Whether dilation actually moves that number is a PAIRED
// MEASUREMENT on a page and is deliberately NOT claimed here; this module is the pass, not the verdict.
//
// ---- THE CONVENTIONS, WHICH ARE THE ARC'S AND NOT NEW ONES ----------------------------------------------------
//
//   * `nearerIsLess` IS THE CALLER'S, exactly as disocclusionCPU's and reactiveCPU's are. A [0,1] projection
//     and a [-1,1] one disagree about which way is nearer, and a module that guessed would produce the exact
//     COMPLEMENT of this pass -- dilating the BACKGROUND over the foreground -- which looks like a working
//     feature until something counts it.
//   * MOTION IS COPIED WHOLE. All four channels (du, dv, valid, zPrev) come from the SAME source pixel. Taking
//     du/dv from the nearest neighbour and zPrev from the centre would build a vector that describes no
//     surface at all, and the depth-clip pass downstream compares exactly those two against each other. The
//     `source` buffer below exists so a caller can check that rather than trust it.
//   * TIES GO TO THE CENTRE. A neighbour must be STRICTLY nearer to win. Ties are common on flat geometry --
//     most of any frame -- and a rule that let a tie displace the centre would dilate the whole picture by a
//     pixel while measuring as "nearest depth wins" either way.
"use strict";

/**
 * Dilate `depth` and `motion` over a (2*radius+1)^2 neighbourhood.
 *
 * Returns { depth, motion, source, moved, w, h }:
 *   depth   the nearest depth in each neighbourhood
 *   motion  the four channels of whichever pixel that depth came from
 *   source  WHICH pixel each output was taken from -- source[i] === i where the centre kept its own
 *   moved   how many pixels took a neighbour's data
 *
 * *** `source` IS THE INSTRUMENT AND IT IS NOT A DEBUG AID. *** A dilation that fired everywhere and a
 * dilation that fired nowhere both produce a plausible-looking depth field, and on flat geometry they produce
 * the IDENTICAL one. Nothing in the output buffers distinguishes "this pixel kept its own depth because
 * nothing was nearer" from "this pixel took a neighbour's depth that happened to be equal" -- the same defect
 * render/reactive.mjs's three declines had, where every outcome wrote the same float. The choice exists only
 * at the moment it is made.
 */
export function dilateCPU({ depth, motion, w, h, nearerIsLess = true, radius = 1 }) {
    if (!(radius >= 1) || radius !== Math.floor(radius))
        throw new Error(`dilateCPU: radius must be a positive whole number of pixels -- got ${radius}`);
    if (!depth || depth.length < w * h) throw new Error("dilateCPU: depth must be w*h");
    if (!motion || motion.length < w * h * 4) throw new Error("dilateCPU: motion must be w*h*4 -- (du, dv, valid, zPrev)");
    const oDepth = new Float32Array(w * h);
    const oMotion = new Float32Array(w * h * 4);
    const source = new Int32Array(w * h);
    let moved = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let best = i, bestD = depth[i];
        for (let dy = -radius; dy <= radius; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= h) continue;          // the frame's edge is not a surface
            for (let dx = -radius; dx <= radius; dx++) {
                const xx = x + dx; if (xx < 0 || xx >= w) continue;
                const j = yy * w + xx, d = depth[j];
                // STRICTLY nearer, so a tie leaves the centre alone -- see the header
                if (nearerIsLess ? d < bestD : d > bestD) { best = j; bestD = d; }
            }
        }
        oDepth[i] = bestD;
        source[i] = best;
        if (best !== i) moved++;
        // ALL FOUR CHANNELS FROM THE SAME PIXEL. See the header: a mixed vector describes no surface.
        for (let c = 0; c < 4; c++) oMotion[i * 4 + c] = motion[best * 4 + c];
    }
    return { depth: oDepth, motion: oMotion, source, moved, w, h };
}
