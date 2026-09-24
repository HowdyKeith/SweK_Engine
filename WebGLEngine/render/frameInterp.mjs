// render/frameInterp.mjs -- THE THING EVERY ROUND SINCE v4673 HAS BEEN FOR: A FRAME THAT WAS NEVER RENDERED.
//
// FSR2 makes a rendered frame bigger. FSR3 adds FRAME GENERATION: between two rendered frames it inserts one
// that no rasteriser ever drew, doubling the presented rate without doubling the work. render/opticalFlow.mjs
// estimated motion from colour, render/flowReconcile.mjs decided which of the two available motion fields to
// believe per block, and neither of them produces a pixel. This does.
//
// ---- *** THE CONTROL ARM IS THE CROSS-FADE, AND IT IS NOT A STRAW MAN. *** -------------------------------
//
// The cheapest possible interpolated frame is (1-t)*prev + t*cur: no motion field, no search, no
// reconciliation, four instructions per pixel. It is also completely correct wherever nothing moved, which is
// most of most frames, and it never invents a pixel that is not a mixture of two real ones. A motion-
// compensated frame is worth its cost only where it beats that, so `interpolateFrameCPU` returns what it
// needs for the comparison to be made on the same pixels, and the gate makes it.
//
// This is the same discipline the reactive-mask arc spent five rounds learning: v4658 through v4663 measured
// a feature against NO feature, frame by frame and then pixel by pixel, and the honest answer turned out to
// be smaller and more local than the first look suggested. A frame generator that is only ever compared to
// nothing is a frame generator nobody has measured.
//
// ---- HOW A MOTION FIELD BECOMES A FRAME, AND WHY IT IS A SCATTER AND NOT A GATHER --------------------------
//
// The flow is indexed by the block's position in `prev`: block (bx, by) holds the displacement that takes its
// content forward to `cur`. The output frame is at time t between them, and its pixels are NOT indexed by
// anything the flow holds -- the content that passes through output pixel p came from p - t*v for a v this
// field does not know at p. So the field is SPLATTED forward: each block's vector is written into the output
// grid at the block's position advanced by t*v, which is where its content is at time t. Then each output
// pixel that received a vector samples `prev` backwards along it and `cur` forwards along it, and blends.
//
// *** THE PIXELS THAT RECEIVE NOTHING ARE HOLES, AND THIS PASS DOES NOT FILL THEM. *** Where content diverges
// -- a silhouette pulling away from a background, anything leaving the frame's edge -- no block's footprint
// lands, and there is no vector to sample along. A cross-fade would go there and look plausible, which is
// exactly why it is not written: a hole filled silently is a hole nobody measures. `hole` is returned as a
// mask and `holes` as a count, the output frame is left at zero in them, and filling them is the next pass.
// render/dilate.mjs's `source` and render/flowReconcile.mjs's SRC_ codes are the same instrument: the choice
// exists only at the moment it is made.
//
// *** AND WHERE TWO BLOCKS LAND ON THE SAME PIXEL, THE NEARER ONE WINS. *** Content converges as often as it
// diverges, and two vectors arriving at one output pixel is one surface passing in front of another. Last
// writer wins would make the answer depend on the loop order, which is the defect render/dilate.mjs and
// render/opticalFlow.mjs each had to have a tie rule written for. So a per-block depth is REQUIRED, not
// optional: the same nearest-surface rule the rest of the arc uses, at the same block scale
// render/flowReconcile.mjs reduces the application's vectors on.
"use strict";
import { fillHolesCPU, SIDE_BLEND, SIDE_PREV, SIDE_CUR } from "./holeFill.mjs";

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Bilinear rgba fetch with clamped edges. The frame is w*h*4; `out` receives 4 floats at `o`. */
function fetch4(src, w, h, x, y, out, o) {
    const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy;
    const x0 = clampi(fx, 0, w - 1), x1 = clampi(fx + 1, 0, w - 1);
    const y0 = clampi(fy, 0, h - 1) * w, y1 = clampi(fy + 1, 0, h - 1) * w;
    for (let c = 0; c < 4; c++) {
        const a = src[(y0 + x0) * 4 + c], b = src[(y0 + x1) * 4 + c];
        const d = src[(y1 + x0) * 4 + c], e = src[(y1 + x1) * 4 + c];
        out[o + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
    }
}

/** (1-t)*prev + t*cur, the control arm. Its own function so the gate cannot accidentally grade a variant. */
export function crossFadeCPU({ prev, cur, w, h, t = 0.5 }) {
    const out = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h * 4; i++) out[i] = prev[i] * (1 - t) + cur[i] * t;
    return out;
}

/**
 * One interpolated frame at time `t` in (0, 1) between `prev` and `cur`.
 *
 * Inputs:
 *   prev, cur    the two rendered frames, w*h*4
 *   flow, bw, bh, block   a block motion field in render/opticalFlow.mjs's OUTPUT sense -- the content's
 *                FORWARD displacement in full-resolution pixels, prev -> cur, which is the NEGATIVE of
 *                render/motionVectors.mjs's sense. render/flowReconcile.mjs returns exactly this.
 *   depthBlock   bw*bh: the depth of the surface each block's vector belongs to. REQUIRED -- see the header.
 *   t            0 returns `prev` and 1 returns `cur`, both exactly, which is a gate row and not a nicety
 *
 * Returns { frame, hole, holes, vec, w, h }:
 *   frame   w*h*4, ZERO in the holes rather than cross-faded -- the header says why
 *   hole    w*h Uint8Array, 1 where no block's footprint landed
 *   holes   how many, so a caller sees the cost of the field it supplied without walking the mask
 *   vec     w*h*2, the splatted field the warp actually sampled along, for auditing a frame rather than
 *           trusting it. NaN in the holes, for the same reason flowReconcile's `appFlow` is.
 *   side    null unless `fill` was given, then render/holeFill.mjs's SIDE_* code per pixel
 *   filled  how many pixels the filler gave a vector to, 0 when `fill` is null
 *   abstained  how many of those the derived side rule could not decide; see holeFill's header
 *   zbuf    the splat's depth buffer, extended by the filler -- what the tie between two arriving blocks
 *           was settled on, so a frame can be audited rather than trusted
 *
 * `fill` is null by default and this function then behaves exactly as it did at v4677. Passing
 * { prefer, passes } runs render/holeFill.mjs between the scatter and the gather; see its header for why the
 * default neighbour is the FARTHER one and why the switch exists at all.
 */
export function interpolateFrameCPU({ prev, cur, w, h, flow, bw, bh, block, depthBlock,
                                     nearerIsLess = true, t = 0.5, fill = null }) {
    if (!(block >= 1) || block !== Math.floor(block))
        throw new Error(`interpolateFrameCPU: block must be a whole number of pixels, at least 1 -- got ${block}`);
    if (bw !== Math.ceil(w / block) || bh !== Math.ceil(h / block))
        throw new Error(`interpolateFrameCPU: the block grid does not cover the frame -- got ${bw}x${bh} for ${w}x${h} at block ${block}, expected ${Math.ceil(w / block)}x${Math.ceil(h / block)}`);
    if (!flow || flow.length < bw * bh * 2) throw new Error("interpolateFrameCPU: flow must be bw*bh*2");
    if (!prev || prev.length < w * h * 4 || !cur || cur.length < w * h * 4)
        throw new Error("interpolateFrameCPU: prev and cur must each be w*h*4 rgba floats");
    if (!depthBlock || depthBlock.length < bw * bh)
        throw new Error("interpolateFrameCPU: depthBlock must be bw*bh -- two blocks landing on one pixel is one surface passing in front of another, and last-writer-wins makes the answer depend on loop order");
    if (!(t >= 0) || !(t <= 1))
        throw new Error(`interpolateFrameCPU: t must be in [0, 1] -- got ${t}`);

    const vec = new Float32Array(w * h * 2).fill(NaN);
    const zbuf = new Float32Array(w * h).fill(nearerIsLess ? Infinity : -Infinity);
    const hole = new Uint8Array(w * h).fill(1);

    // ---- SCATTER: each block's vector is written where its content IS at time t ----
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const i = by * bw + bx;
        const vx = flow[i * 2], vy = flow[i * 2 + 1], d = depthBlock[i];
        // *** A FIELD MAY DECLINE TO ANSWER -- render/flowReconcile.mjs's `appFlow` IS NaN WHERE THE
        // APPLICATION HAD NO VALID VECTOR -- AND THIS GUARD IS NOT WHAT KEEPS THE NaN OUT. *** Measured by
        // removing it: 0 failing rows. Math.round(NaN) is NaN, `py < 0 || py >= h` is FALSE for NaN so the
        // bounds test does not stop it, `j` is NaN, and `zbuf[NaN]` reads undefined -- against which both
        // `d < undefined` and `d > undefined` are false, so nothing is written and the block's pixels stay
        // holes. The outcome is identical; what the guard buys is not correctness but 64 skipped iterations
        // per declined block and a reader who does not have to reason about indexing a typed array with NaN
        // to see that the case is handled. Same shape as render/opticalFlow.mjs's denominator guard, which
        // v4675 established was defence in depth in exactly this way, and it is recorded here for the same
        // reason: crediting this line with the behaviour would be crediting the wrong line.
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
        // *** THE FOOTPRINT IS ROUNDED, AND THAT IS A LIMIT AND NOT A CHOICE. *** A block advanced by t*v
        // covers a fractional rectangle; splatting it onto whole pixels quantises WHERE the vector lands
        // while leaving the vector itself fractional, so the warp is sub-pixel accurate and the mask that
        // says which pixels have a vector is not. At block 8 a half-pixel error on a 64-pixel edge is 1% of
        // the mask; on a silhouette it is the difference between a hole and a smear. A real splatter
        // accumulates coverage per pixel. This one is stated in the closing line as unfinished.
        const sx = Math.round(bx * block + t * vx), sy = Math.round(by * block + t * vy);
        for (let y = 0; y < block; y++) {
            const py = sy + y; if (py < 0 || py >= h) continue;
            for (let x = 0; x < block; x++) {
                const px = sx + x; if (px < 0 || px >= w) continue;
                // the block's own extent in `prev` stops at the frame edge, so its tail must not splat
                if (bx * block + x >= w || by * block + y >= h) continue;
                const j = py * w + px;
                // STRICTLY nearer, so ties leave the first writer alone -- dilate.mjs's rule, and the reason
                // it has one: on equal depths whichever block the loop reaches first would otherwise win
                // everywhere, which is an answer that depends on the iteration order and not on the scene
                if (nearerIsLess ? d < zbuf[j] : d > zbuf[j]) {
                    zbuf[j] = d; vec[j * 2] = vx; vec[j * 2 + 1] = vy; hole[j] = 0;
                }
            }
        }
    }

    // ---- OPTIONAL: EXTEND THE FIELD INTO THE HOLES (v4678) ----
    // *** DEFAULT OFF, AND THAT IS THE CONTROL ARM AND NOT TIMIDITY. *** v4677 shipped with the holes left at
    // zero and measured what that costs; `fill` is the switch that makes the filler's worth a subtraction
    // rather than a claim, exactly as `subpixel` does on the flow and `margin` on the reconciliation. With
    // `fill` null this function behaves as it did at v4677, bit for bit, which is its own gate row.
    let side = null, filledCount = 0, abstained = 0;
    if (fill) {
        const r = fillHolesCPU({ vec, hole, zbuf, w, h, nearerIsLess,
                                 radius: fill.radius === undefined ? 4 : fill.radius,
                                 growth: fill.growth === undefined ? "neighbourhood" : fill.growth,
                                 prefer: fill.prefer === undefined ? "farther" : fill.prefer,
                                 side: fill.side === undefined ? "derived" : fill.side,
                                 depthPrev: fill.depthPrev || null, depthCur: fill.depthCur || null, t });
        vec.set(r.vec); hole.set(r.hole); zbuf.set(r.zbuf);
        side = r.side; filledCount = r.filled; abstained = r.abstained;
    }

    // ---- GATHER: each pixel with a vector samples backwards in `prev` and forwards in `cur` ----
    const frame = new Float32Array(w * h * 4);
    const a = new Float32Array(4), b = new Float32Array(4);
    let holes = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (hole[j]) { holes++; continue; }             // left at zero on purpose -- see the header
        const vx = vec[j * 2], vy = vec[j * 2 + 1];
        fetch4(prev, w, h, x - t * vx, y - t * vy, a, 0);
        fetch4(cur, w, h, x + (1 - t) * vx, y + (1 - t) * vy, b, 0);
        // *** A DISOCCLUDED PIXEL'S CONTENT IS IN ONE FRAME ONLY, SO THE BLEND IS NOT ALWAYS THE ANSWER. ***
        // `side` is SIDE_BLEND everywhere the splat landed, so the symmetric blend is what a normal pixel
        // gets and no second mask is needed; only render/holeFill.mjs's filled pixels can carry anything
        // else, and its header measures what each setting is worth.
        const sd = side === null ? SIDE_BLEND : side[j];
        for (let c = 0; c < 4; c++)
            frame[j * 4 + c] = sd === SIDE_PREV ? a[c] : sd === SIDE_CUR ? b[c] : a[c] * (1 - t) + b[c] * t;
    }
    return { frame, hole, holes, vec, side, filled: filledCount, abstained, zbuf, w, h };
}
