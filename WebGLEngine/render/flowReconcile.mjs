// render/flowReconcile.mjs -- FSR3'S SECOND PASS: DECIDING WHICH OF TWO MOTION FIELDS TO BELIEVE.
//
// render/opticalFlow.mjs estimates motion from COLOUR. render/motionVectors.mjs (dilated by
// render/dilate.mjs) gets motion from the APPLICATION. FSR3 has both on every frame and they disagree, and
// frame generation needs ONE field. This is the pass that picks.
//
// *** THE TWO FIELDS ARE NOT TWO ESTIMATES OF THE SAME THING, WHICH IS WHY NEITHER WINS EVERYWHERE. ***
//
//   * The application's vector is EXACT where it applies. It is not an estimate at all -- it is a
//     reprojection through matrices the application knows, and on a moving camera over static geometry it is
//     right to the last bit while a block matcher is guessing.
//   * And it is SILENT about everything that is not geometry. A shadow crossing a wall, a reflection tracking
//     in a mirror, a scrolling texture, an animated emissive: the surface did not move, so the application's
//     vector is zero, and it is zero with full confidence. The colour moved anyway.
//
// So the question per block is not "which estimator is better" but "did the application's vector EXPLAIN
// WHAT HAPPENED TO THE PICTURE". That is a measurable question -- displace the block by each candidate and
// see which displacement the two frames actually support -- and this pass answers it by measuring rather
// than by a heuristic on confidence.
//
// ---- *** THE TWO FIELDS POINT IN OPPOSITE DIRECTIONS, AND opticalFlow.mjs's HEADER SAID THEY DID NOT. *** --
//
// render/motionVectors.mjs returns `du = uvPrev - uvCurr`: the arc's convention, `hu = u + du` samples the
// history, pointing from this frame BACK to the last one. render/opticalFlow.mjs negates its search's answer
// and its header says that negation puts it in "the same sense render/motionVectors.mjs uses". MEASURED:
// content displaced by (+3, -2) pixels between two frames makes `opticalFlowCPU` report (+3, -2) on all 64
// blocks. The application's vector for that same content is (-3, +2). They are NEGATIVES OF EACH OTHER, and
// this module's first gate row is that measurement, because the comment that got it wrong is the exact
// hazard v4638 recorded when two motion conventions shared a tree with nothing forcing them to agree.
//
// opticalFlow.mjs's header is corrected in the same commit as this file. The convention kept here is
// opticalFlow's OUTPUT, the content's forward displacement prev -> cur, because the reconciled field feeds
// frame interpolation, which asks "where is this going", and because a field that is a drop-in replacement
// for the flow it reconciles is one convention rather than two. The application's vector is negated on the
// way in, at ONE site, and `appFlow` is returned in the output sense so a caller can see what was compared.
//
// ---- THE SELECTION BIAS, WHICH IS REAL AND IS WHAT `margin` IS FOR ----------------------------------------
//
// *** THE FLOW ARM HAS BEEN OPTIMISED ON THE STATISTIC USED TO JUDGE IT. *** `opticalFlowCPU` searched a
// window for the displacement that MINIMISES the block's sum of absolute differences. The application's
// vector got one shot at the same statistic. Scoring them head to head and taking the lower SAD therefore
// favours the flow even where the application is exactly right, and the amount by which it does is not
// small: the search has (2r+1)^2 tries per block and the noise floor of a real image is not zero.
//
// So the application is the INCUMBENT and the flow is the CHALLENGER: the flow takes a block only by beating
// the application's score by `margin`, a fraction. `margin = 0` is the naive rule and section 4 of the gate
// measures what it costs on content where the application is known to be right.
//
// `margin` is a defence against a bias, not a tuning knob, and it does not make the comparison unbiased --
// it makes the bias's direction a declared choice with a measured cost.
//
// ---- AND THE TIE GOES TO THE APPLICATION, WHICH IS WHAT HANDLES THE APERTURE PROBLEM -----------------------
//
// opticalFlow.mjs's header warns that a caller reading its vectors without its `conf` has a field that is
// confidently wrong across every flat region of the frame, which is most of most frames. This pass does not
// read `conf`, deliberately: `conf` is derived from the winning SAD against standing still, and this pass
// measures the winning SAD against a THIRD candidate the flow never saw. It is the same evidence, used more
// directly. `conf` is passed through untouched so the consumer still has it.
//
// What protects the flat region is the comparison being STRICTLY better. On flat content every candidate
// scores the same, so `sadFlow < sadApp * (1 - margin)` is false even at `margin = 0`, and the block keeps
// the application's vector. MEASURED: a uniform grey pair, 16 blocks, `conf` 0 on every one of them -- 16
// application blocks and 0 flow blocks at margin 0. Relaxing that one comparison to `<=` hands all sixteen
// to a search that reported no motion for want of anything to see, which is the whole failure the warning
// describes, arriving through a single character.
"use strict";
import { luminancePyramidCPU } from "./luminancePyramid.mjs";

/** Which field the block's vector came from. Distinguishable on purpose -- see the note below. */
export const SRC_APP = 1;        // the application's vector, kept
export const SRC_FLOW_BEAT = 2;  // the colour flow, having beaten the application's score by the margin
export const SRC_FLOW_ONLY = 3;  // the colour flow, because the application had no valid vector here

// *** `source` IS THE INSTRUMENT, AND THE TWO FLOW CODES ARE NOT PEDANTRY. *** render/dilate.mjs recorded
// why: a pass whose every outcome writes the same float cannot be told from a pass that never fired. Here
// it is worse than that. A block that took the flow because the application was WRONG and a block that took
// the flow because the application was ABSENT hold the same vector and mean opposite things -- the first is
// this pass doing its job, the second is this pass having no job to do. Collapsing them would make "the
// flow won 40% of blocks" a number with two readings, which is the defect fsr2Coverage.mjs exists to avoid.

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Sum of absolute differences between the block of `a` at integer (ax, ay) and the block of `b` at possibly
 * FRACTIONAL (bx, by), bilinearly sampled, edges clamped.
 *
 * *** BILINEAR, NOT ROUNDED, AND THAT CHOICE IS LOAD-BEARING TWICE. *** The application's vector is
 * fractional by nature and the flow is fractional since v4675; rounding both to score them would throw away
 * the sub-pixel work this arc just built and would also quantise the two arms onto the same integer grid,
 * hiding real disagreements smaller than a pixel. It also slightly REDUCES the selection bias described in
 * the header: the flow's integer part was chosen to minimise the INTEGER SAD, and it is re-scored here on a
 * surface it was not fitted to.
 */
function sadAt(a, b, w, h, ax, ay, bx, by, n) {
    let s = 0;
    const fx = Math.floor(bx), fy = Math.floor(by);
    const tx = bx - fx, ty = by - fy;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const av = a[clampi(ay + y, 0, h - 1) * w + clampi(ax + x, 0, w - 1)];
        const x0 = clampi(fx + x, 0, w - 1), x1 = clampi(fx + x + 1, 0, w - 1);
        const y0 = clampi(fy + y, 0, h - 1) * w, y1 = clampi(fy + y + 1, 0, h - 1) * w;
        const b00 = b[y0 + x0], b10 = b[y0 + x1], b01 = b[y1 + x0], b11 = b[y1 + x1];
        const bv = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;
        s += Math.abs(av - bv);
    }
    return s;
}

/**
 * Reconcile a colour flow field with the application's motion vectors.
 *
 * Inputs:
 *   cur, prev    the two rgba frames the flow was estimated from, w*h*4 floats
 *   flow, conf, bw, bh, block   exactly what `opticalFlowCPU` returned for those frames
 *   motion       the application's per-pixel field, w*h*4 -- (du, dv, valid, zPrev), UV units, cur -> prev.
 *                Feed it DILATED (render/dilate.mjs) if the pipeline dilates; this pass does not dilate.
 *   depth        w*h, used only to choose WHICH pixel of a block speaks for it -- see below
 *   margin       the fraction by which the flow must beat the application to take a block. See the header.
 *
 * Returns { flow, appFlow, source, sadApp, sadFlow, sadStill, counts, bw, bh, block }:
 *   flow      the reconciled field, 2 floats per block, in `opticalFlowCPU`'s output sense AND ITS INDEXING:
 *             the block grid indexes positions in `cur`, not in `prev`, because the search walks blocks of
 *             `cur` and looks for them in `prev` and the application's per-pixel field is indexed the same
 *             way. render/frameInterp.mjs takes that as `indexedBy: "cur"`; v4680 measured what feeding it
 *             the other answer costs
 *   appFlow   the application's vector reduced to the block grid, SAME sense, NaN where no valid vector
 *   source    SRC_APP / SRC_FLOW_BEAT / SRC_FLOW_ONLY per block
 *   sad*      the three scores per block, so a caller can audit a decision instead of trusting it
 *   counts    { app, flowBeat, flowOnly } -- the census the gate's sections 2 to 4 read
 *
 * *** THE BLOCK'S APPLICATION VECTOR IS ITS NEAREST PIXEL'S, WHICH IS render/dilate.mjs's RULE AT BLOCK
 * SCALE. *** A block straddling a silhouette contains two surfaces moving differently; their mean describes
 * neither, and the mean of a foreground vector and a background one is the classic smear a dilation pass
 * exists to prevent. The nearest surface is the one whose motion a viewer sees, so the block takes the
 * vector of its nearest VALID pixel. `nearerIsLess` matches dilateCPU's flag for the same reason it has one.
 */
export function reconcileFlowCPU({ cur, prev, w, h, flow, conf, bw, bh, block,
                                  motion, depth, margin = 0.05, nearerIsLess = true }) {
    if (!(block >= 2) || block !== Math.floor(block))
        throw new Error(`reconcileFlowCPU: block must be a whole number of pixels, at least 2 -- got ${block}`);
    if (bw !== Math.ceil(w / block) || bh !== Math.ceil(h / block))
        throw new Error(`reconcileFlowCPU: the block grid does not cover the frame -- got ${bw}x${bh} for ${w}x${h} at block ${block}, expected ${Math.ceil(w / block)}x${Math.ceil(h / block)}`);
    if (!flow || flow.length < bw * bh * 2) throw new Error("reconcileFlowCPU: flow must be bw*bh*2");
    if (!motion || motion.length < w * h * 4)
        throw new Error("reconcileFlowCPU: motion must be w*h*4 -- (du, dv, valid, zPrev)");
    if (!depth || depth.length < w * h)
        throw new Error("reconcileFlowCPU: depth must be w*h -- the block's vector is its NEAREST pixel's, which needs depth");
    if (!(margin >= 0) || !(margin < 1))
        throw new Error(`reconcileFlowCPU: margin must be in [0, 1) -- got ${margin}`);

    // the same luminance the search scored on, from the same pyramid, so the arms are compared on one signal
    const A = luminancePyramidCPU({ src: cur, w, h }).mips[0];
    const B = luminancePyramidCPU({ src: prev, w, h }).mips[0];

    const out = new Float32Array(bw * bh * 2);
    const appFlow = new Float32Array(bw * bh * 2).fill(NaN);
    const source = new Int32Array(bw * bh);
    const sadApp = new Float32Array(bw * bh).fill(NaN);
    const sadFlow = new Float32Array(bw * bh);
    const sadStill = new Float32Array(bw * bh);
    const counts = { app: 0, flowBeat: 0, flowOnly: 0 };

    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const i = by * bw + bx;
        const ox = bx * block, oy = by * block;
        const n = block;

        // ---- the application's vector for this block: its nearest VALID pixel's ----
        let bestJ = -1, bestD = 0;
        for (let y = oy; y < Math.min(oy + n, h); y++) for (let x = ox; x < Math.min(ox + n, w); x++) {
            const j = y * w + x;
            if (!motion[j * 4 + 2]) continue;                 // valid === 0: no answer, not a zero answer
            const d = depth[j];
            if (bestJ < 0 || (nearerIsLess ? d < bestD : d > bestD)) { bestJ = j; bestD = d; }
        }

        const fx = flow[i * 2], fy = flow[i * 2 + 1];
        // the SEARCH's sense is the negative of the output sense, so a forward vector v scores at -v
        sadFlow[i] = sadAt(A, B, w, h, ox, oy, ox - fx, oy - fy, n);
        sadStill[i] = sadAt(A, B, w, h, ox, oy, ox, oy, n);

        if (bestJ < 0) {
            // *** NO VALID APPLICATION VECTOR ANYWHERE IN THE BLOCK. *** Nothing to reconcile against, so
            // the flow is not winning here -- it is all there is. SRC_FLOW_ONLY, and appFlow stays NaN so a
            // caller that reads it gets an arithmetic result it cannot mistake for a measured zero.
            out[i * 2] = fx; out[i * 2 + 1] = fy;
            source[i] = SRC_FLOW_ONLY; counts.flowOnly++;
            continue;
        }
        // THE ONE NEGATION: UV cur -> prev becomes pixels prev -> cur, this module's convention
        const ax = -motion[bestJ * 4] * w, ay = -motion[bestJ * 4 + 1] * h;
        appFlow[i * 2] = ax; appFlow[i * 2 + 1] = ay;
        sadApp[i] = sadAt(A, B, w, h, ox, oy, ox - ax, oy - ay, n);

        if (sadFlow[i] < sadApp[i] * (1 - margin)) {
            out[i * 2] = fx; out[i * 2 + 1] = fy;
            source[i] = SRC_FLOW_BEAT; counts.flowBeat++;
        } else {
            out[i * 2] = ax; out[i * 2 + 1] = ay;
            source[i] = SRC_APP; counts.app++;
        }
    }
    return { flow: out, appFlow, source, sadApp, sadFlow, sadStill, counts, bw, bh, block, conf };
}
