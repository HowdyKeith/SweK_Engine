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
 *   flow   2 floats per block: the displacement in FULL-RESOLUTION pixels, refined to a FRACTION at the
 *          finest level (v4675), that takes the block in `prev` to where it is in `cur` -- see the note on
 *          `sense` below, WHICH SAID THE WRONG THING UNTIL v4676
 *   conf   per block, in [0, 1]: how much better the winning match is than standing still. 0 means the
 *          block is as happy where it was, which is what a flat region reports and is not a failure
 *
 * `subpixel` defaults to true and exists so the refinement's worth is MEASURABLE rather than asserted --
 * the control-arm discipline this arc applies to every switchable thing on its page. Off, the field is
 * whole pixels, which is what v4673 shipped.
 *   bw,bh  the block grid's dimensions
 *
 * *** THE SENSE IS THE CONTENT'S FORWARD DISPLACEMENT, prev -> cur, AND IT IS THE NEGATIVE OF
 * render/motionVectors.mjs's -- WHICH THIS HEADER DENIED FOR THREE ROUNDS. ***
 *
 * A block matcher naturally answers "where did this block COME FROM", cur -> prev being searched, and that
 * is also the arc's motion-vector convention: `du = uvPrev - uvCurr`, `hu = u + du` samples the history.
 * The negation at the bottom of the loop turns the search's answer into the OPPOSITE of that, not into it.
 * From v4673 to v4675 this paragraph claimed the negation made the two agree, and v4676 measured it:
 * content displaced by (+3, -2) pixels makes this function report (+3, -2) on all 64 blocks, where the
 * application's vector for the same content is (-3, +2).
 *
 * The negation is kept and the sentence is what changed. Frame interpolation asks where content is GOING,
 * so a forward field is the one its consumer wants, and render/flowReconcile.mjs -- which is the module that
 * has to hold both fields at once -- negates the application's vector on the way in, at one site, and says
 * so. What v4638 recorded is not that a tree may have only one convention; it is that a convention nothing
 * forces to agree with its own description will drift from it, which is exactly what happened here.
 */
export function opticalFlowCPU({ cur, prev, w, h, block = 8, searchRadius = 4, levels = 3,
                                 subpixel = true }) {
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
            let bdx = gx, bdy = gy, subx = 0, suby = 0;
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
            // *** v4675 -- SUB-PIXEL REFINEMENT, AND ONLY AT THE FINEST LEVEL. ***
            //
            // A whole-pixel field is unusable for frame generation: an interpolated frame placed on integer
            // motion judders, because the true displacement between two frames is almost never a whole
            // number of pixels and the error is a fraction of a pixel of misplacement EVERY frame.
            //
            // The SAD surface near its minimum is approximately a parabola, so three samples along an axis
            // -- the winner and its two neighbours -- locate the vertex:  d = (s- - s+) / (2(s- - 2s0 + s+)).
            // This is the standard refinement and it is the one FSR3 uses.
            //
            // *** IT IS DONE AT L === 0 ONLY, AND THAT IS NOT AN OPTIMISATION. *** A fraction found on a
            // quarter-resolution mip is a fraction OF FOUR PIXELS, and the level below would then search
            // around a non-integer guess it cannot represent -- the guess is rounded on the way down, so
            // the refinement would be computed, scaled up, and thrown away. Refining only the last level
            // is the only place the answer survives.
            //
            // *** AND IT IS CLAMPED TO HALF A PIXEL. *** The parabola is a local model; when the surface is
            // flat or the winner sits at the edge of the search window the denominator goes small and the
            // vertex flies off. A displacement more than half a pixel from the winning integer means the
            // NEIGHBOUR should have won, so anything beyond that is the model failing rather than a real
            // sub-pixel offset, and the honest response is to keep the integer.
            if (L === 0 && subpixel) {
                const px = (dx, dy) => sad(a, b, lw, lh, ox, oy, ox + bdx + dx, oy + bdy + dy, n);
                const s0 = best, sxm = px(-1, 0), sxp = px(1, 0), sym = px(0, -1), syp = px(0, 1);
                const vertex = (m, c, p) => { const den = m - 2 * c + p;
                    // *** THIS GUARD IS DEFENCE IN DEPTH AND NOT LOAD-BEARING, WHICH A SABOTAGE ESTABLISHED
                    // RATHER THAN ARGUED. *** Removing it scores ZERO failing rows: on a flat surface every
                    // SAD is equal, den is exactly 0, d is 0/0 = NaN, and `Math.abs(NaN) <= 0.5` is FALSE --
                    // so the clamp below already returns the integer. The guard is kept because a reader
                    // should not have to reason about NaN comparison to see that the degenerate case is
                    // handled, but it is the CLAMP that handles it, and claiming otherwise would be
                    // crediting the wrong line.
                    if (!(Math.abs(den) > 1e-9)) return 0;
                    const d = (m - p) / (2 * den);
                    return Math.abs(d) <= 0.5 ? d : 0; };
                subx = vertex(sxm, s0, sxp);
                suby = vertex(sym, s0, syp);
            }
            const still = sad(a, b, lw, lh, ox, oy, ox, oy, n);
            // the negation: the search answers cur -> prev, this function's output is prev -> cur, which is
            // the NEGATIVE of render/motionVectors.mjs's sense and not the same as it -- see the header
            // the sub-pixel part is already at full resolution (L === 0, scale 1) and is negated with
            // the integer part, at this one site, so the whole vector stays in one sense
            flow[i * 2] = -(bdx * scale + subx);
            flow[i * 2 + 1] = -(bdy * scale + suby);
            // how much better than standing still, normalised by standing still. A flat block has
            // still ~ best ~ 0 and reports 0, which is the truthful answer and not a failure.
            conf[i] = still > 1e-6 ? Math.max(0, Math.min(1, (still - best) / still)) : 0;
        }
    }
    return { flow, conf, bw, bh, block, levels: top + 1 };
}
