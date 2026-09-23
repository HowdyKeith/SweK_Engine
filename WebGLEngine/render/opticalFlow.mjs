// render/opticalFlow.mjs -- FSR3's FIRST PASS, AND THE FIRST THING IN THIS TREE THAT IS NOT FSR2.
//
// *** WHY AN UPSCALER THAT ALREADY HAS MOTION VECTORS COMPUTES ITS OWN MOTION. ***
//
// FSR2 is given the application's motion vectors and trusts them. FSR3 adds FRAME GENERATION -- inventing a
// frame between two real ones -- and for that the application's vectors are not enough, because they
// describe where GEOMETRY went and not where the PICTURE went. A shadow sliding across a wall, a reflection
// tracking in a mirror, a scrolling texture: the surface did not move, so the motion vector is zero, and an
// interpolated frame built on it holds the shadow still while everything around it slides. So FSR3 estimates
// a second field from the COLOUR of two frames, and reconciles the two.
//
// This is that estimator: a pyramidal block matcher on luminance, which is what FSR3's optical flow is.
//
// *** AND IT IS WHY render/luminancePyramid.mjs EXISTS. *** v4668 built FSR2's mip chain and could not wire
// it -- the exposure it drives has nothing to do on [0,1] content, so the runner was left gate-only with
// the reason recorded and runnerCallers' ratchet widened rather than satisfied by a decorative call. That
// gate's closing line named this: "FSR3's frame interpolation wants the same chain for a different reason
// and is where it earns its keep next." A coarse-to-fine search needs exactly a luminance pyramid.
//
// ---- WHAT A BLOCK MATCHER CAN AND CANNOT KNOW ---------------------------------------------------------------
//
// *** THE APERTURE PROBLEM IS NOT A BUG AND MUST NOT BE HIDDEN. *** A block of flat colour matches equally
// well everywhere; a block containing a single straight edge matches equally well anywhere along that edge.
// The search will return SOMETHING for both, and that something is arbitrary. Every block therefore carries
// the SAD it settled at and the SAD of standing still, and `confidence` is derived from the two. A caller
// that reads the vectors and ignores the confidence has a motion field that is confidently wrong across
// every flat region of the frame, which is most of most frames.
"use strict";
import { luminancePyramidCPU } from "./luminancePyramid.mjs";

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Sum of absolute differences between a block of `a` at (ax, ay) and one of `b` at (bx, by). */
function sad(a, b, w, h, ax, ay, bx, by, n) {
    let s = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const av = a[clampi(ay + y, 0, h - 1) * w + clampi(ax + x, 0, w - 1)];
        const bv = b[clampi(by + y, 0, h - 1) * w + clampi(bx + x, 0, w - 1)];
        s += Math.abs(av - bv);
    }
    return s;
}

/**
 * Coarse-to-fine block-matching optical flow between two rgba frames.
 *
 * Returns { flow, conf, bw, bh, block, levels }:
 *   flow   2 floats per block: the displacement in FULL-RESOLUTION pixels that takes the block in `prev`
 *          to where it is in `cur` -- the same sense render/motionVectors.mjs uses, prev -> cur reversed,
 *          see the note on `sense` below
 *   conf   per block, in [0, 1]: how much better the winning match is than standing still. 0 means the
 *          block is as happy where it was, which is what a flat region reports and is not a failure
 *   bw,bh  the block grid's dimensions
 *
 * *** THE SENSE IS uvPrev - uvCurr, MATCHING render/motionVectors.mjs, AND THAT IS NOT THE NATURAL OUTPUT
 * OF A SEARCH. *** A block matcher naturally answers "where did this block GO", cur -> prev being searched.
 * The arc's motion convention is the reverse: `hu = u + du` samples the history. Returning the search's own
 * sense here would put a second convention in a tree whose every other module shares one, and v4638 already
 * recorded what two conventions cost when nothing forces them to agree. The negation is at the bottom of
 * `refine` and it is the only place it happens.
 */
export function opticalFlowCPU({ cur, prev, w, h, block = 8, searchRadius = 4, levels = 3 }) {
    if (!(block >= 2) || block !== Math.floor(block))
        throw new Error(`opticalFlowCPU: block must be a whole number of pixels, at least 2 -- got ${block}`);
    if (!(searchRadius >= 1) || searchRadius !== Math.floor(searchRadius))
        throw new Error(`opticalFlowCPU: searchRadius must be a whole number of pixels, at least 1 -- got ${searchRadius}`);
    if (!(levels >= 1) || levels !== Math.floor(levels))
        throw new Error(`opticalFlowCPU: levels must be a whole number, at least 1 -- got ${levels}`);
    // *** THE PYRAMID IS render/luminancePyramid.mjs's, NOT A SECOND ONE. *** Its base level imports the
    // arc's `luma`, its edge handling is measured, and a matcher that built its own would be a third
    // definition of brightness in a pipeline that has spent rounds getting down to one.
    const P = luminancePyramidCPU({ src: cur, w, h });
    const Q = luminancePyramidCPU({ src: prev, w, h });
    const top = Math.min(levels, P.levels) - 1;      // the coarsest level this search will start from

    const bw = Math.ceil(w / block), bh = Math.ceil(h / block);
    const flow = new Float32Array(bw * bh * 2);
    const conf = new Float32Array(bw * bh);

    // coarse to fine: each level starts from the level above's answer, doubled
    for (let L = top; L >= 0; L--) {
        const [lw, lh] = P.sizes[L], a = P.mips[L], b = Q.mips[L];
        const scale = 1 << L;                        // full-res pixels per pixel at this level
        for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
            const i = by * bw + bx;
            // the block's origin at THIS level
            const ox = Math.round((bx * block) / scale), oy = Math.round((by * block) / scale);
            // the guess carried down, expressed at this level and in the SEARCH's sense (cur -> prev)
            const gx = Math.round(-flow[i * 2] / scale), gy = Math.round(-flow[i * 2 + 1] / scale);
            // *** THE PATCH IS `block` PIXELS AT EVERY LEVEL, NOT `block / scale`. *** Shrinking it with the
            // mip is the obvious reading of "the same block, coarser" and it is wrong: at three levels a
            // block of 8 becomes 2x2, a 2x2 SAD on a smoothed field is nearly flat, the coarse level
            // returns noise, and the noise is propagated DOWN as the guess the fine level starts from.
            // MEASURED on a non-periodic field with a known shift of (3, -2): 64 blocks of 64 exactly
            // right at one level, 59 at two, and 24 at THREE -- a pyramid making the answer worse the
            // deeper it went, which is the reverse of what it is for. Held constant, the patch covers
            // block * scale full-resolution pixels at level L, which is what makes a coarse level able to
            // see a large displacement at all.
            const n = block;
            // *** SEEDED WITH THE GUESS'S OWN SCORE, AND IT WAS NOT. *** `best` began at Infinity, so the
            // FIRST candidate scanned won every tie -- not the guess. On flat content, where every
            // candidate ties, that handed every block the corner of its search window (-4, -4), and the
            // header claimed "a tie leaves the centre alone" while the code did the opposite. The gate row
            // written to check that claim is what found it: 0 blocks reporting no motion and 64 reporting
            // the corner. Seeding with the guess makes the sentence true.
            let bdx = gx, bdy = gy;
            let best = sad(a, b, lw, lh, ox, oy, ox + gx, oy + gy, n);
            for (let dy = -searchRadius; dy <= searchRadius; dy++)
                for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                    const s = sad(a, b, lw, lh, ox, oy, ox + gx + dx, oy + gy + dy, n);
                    // STRICTLY better, so a tie leaves the guess alone -- which is only true because
                    // `best` is seeded with the guess's score above. render/dilate.mjs takes the same rule
                    // for the same reason: on flat content every candidate ties, and whichever candidate
                    // the loop happens to reach first would otherwise win everywhere.
                    if (s < best) { best = s; bdx = gx + dx; bdy = gy + dy; }
                }
            const still = sad(a, b, lw, lh, ox, oy, ox, oy, n);
            // the negation: the search answers cur -> prev, the arc's convention is prev -> cur
            flow[i * 2] = -bdx * scale;
            flow[i * 2 + 1] = -bdy * scale;
            // how much better than standing still, normalised by standing still. A flat block has
            // still ~ best ~ 0 and reports 0, which is the truthful answer and not a failure.
            conf[i] = still > 1e-6 ? Math.max(0, Math.min(1, (still - best) / still)) : 0;
        }
    }
    return { flow, conf, bw, bh, block, levels: top + 1 };
}
