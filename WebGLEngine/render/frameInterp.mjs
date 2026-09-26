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
// ---- *** AND WHICH FRAME THE FIELD IS INDEXED IN IS A REQUIRED ARGUMENT, BECAUSE IT WAS WRONG (v4680). *** -
//
// This pass shipped at v4677 assuming the field was indexed by the block's position in `prev`. MEASURED at
// v4680 with a bright bar at x 4..7 in `prev` and x 12..15 in `cur`: `opticalFlowCPU` puts the +8 on the block
// covering x 12..15 -- its CUR position. The search walks blocks of `cur` and looks for them in `prev`, so its
// field is CUR-indexed, and so is render/flowReconcile.mjs's, whose `appFlow` comes from a per-pixel motion
// buffer indexed the same way. Feeding the arc's own producer to the v4677 splat misplaced every moving block
// by t*v.
//
// *** NOTHING IN THREE ROUNDS COULD HAVE CAUGHT IT. *** Under a rigid whole-frame translation every block
// holds the SAME vector, so the two indexings produce BIT-IDENTICAL fields -- which is every scene v4677
// measured. v4678's slab scene has non-uniform motion but supplies the field from the scene's own knowledge,
// prev-indexed by construction. The defect needed content with non-uniform motion AND an estimated field, and
// a gate row now builds exactly that. On the slab scene at block 1 the two indexings differ by 6.5 dB.
//
// `indexedBy` has NO DEFAULT. A default would let a caller be wrong for free in the one case where being
// wrong costs the whole displacement, and v4676 already recorded what a convention nothing forces to agree
// with its description does over time.
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
 *   indexedBy    "prev" or "cur": which frame the block grid indexes. REQUIRED -- see the header.
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
 * `toT` (v4744) is the ARC: bw*bh*2, each block's displacement from its CUR position to where its content is at time t,
 * which a rigid body turning between the frames reaches along an arc and not the chord. With it, a block lands at its cur
 * position plus toT, and each pixel samples `cur` and `prev` at the offsets that block carried there -- -toT and
 * -flow - toT -- instead of (1 - t) and -t of one vector. `flow` is then the displacement to `prev`, negated, as always.
 * It needs indexedBy "cur" and a fill, if any, whose side is "blend": the other side rules read one vector as a chord.
 * `vecPrev` is returned beside `vec`, the prev offsets the warp sampled along.
 *
 * `fill` is null by default and this function then behaves exactly as it did at v4677. Passing
 * { prefer, passes } runs render/holeFill.mjs between the scatter and the gather; see its header for why the
 * default neighbour is the FARTHER one and why the switch exists at all.
 */
export function interpolateFrameCPU({ prev, cur, w, h, flow, bw, bh, block, depthBlock, indexedBy,
                                     nearerIsLess = true, t = 0.5, fill = null, toT = null }) {
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
    if (indexedBy !== "prev" && indexedBy !== "cur")
        throw new Error(`interpolateFrameCPU: indexedBy must be "prev" or "cur" -- got ${JSON.stringify(indexedBy)}. ` +
            'render/opticalFlow.mjs and render/flowReconcile.mjs both return "cur"; a field built by walking the PREVIOUS frame is "prev". ' +
            "There is no default, because the two differ by the whole displacement wherever motion is not uniform and no measurement in this arc could tell them apart until v4680.");

    if (toT && (toT.length < bw * bh * 2 || indexedBy !== "cur"))
        throw new Error('interpolateFrameCPU: toT must be bw*bh*2 and the field indexedBy "cur" -- it is the displacement from each block\'s CUR position to time t');
    if (toT && fill && (fill.side === undefined ? "derived" : fill.side) !== "blend")
        throw new Error('interpolateFrameCPU: with toT the fill\'s side must be "blend" -- the other side rules read the splatted vector as a chord');
    const vec = new Float32Array(w * h * 2).fill(NaN);
    // v4744, the arc: the offset each landed pixel samples `prev` at (and `vec` then holds the one it samples `cur` at)
    const vecPrev = toT ? new Float32Array(w * h * 2).fill(NaN) : null;
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
        // *** WHERE THE BLOCK'S CONTENT IS AT TIME t DEPENDS ON WHICH FRAME THE BLOCK IS INDEXED IN (v4680). ***
        // A PREV-indexed block sits at its prev position and has travelled t*v by now. A CUR-indexed one sits
        // at its CUR position and still has (1-t)*v to go, so at time t it is (1-t)*v BEHIND that. The two
        // differ by the whole displacement, and see the header for the three rounds in which nothing could
        // tell them apart.
        const ax = toT ? toT[i * 2] : indexedBy === "prev" ? t * vx : -(1 - t) * vx;
        const ay = toT ? toT[i * 2 + 1] : indexedBy === "prev" ? t * vy : -(1 - t) * vy;
        if (toT && (!Number.isFinite(ax) || !Number.isFinite(ay))) continue;
        const sx = Math.round(bx * block + ax), sy = Math.round(by * block + ay);
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
                    zbuf[j] = d; hole[j] = 0;
                    if (toT) { vec[j * 2] = -ax; vec[j * 2 + 1] = -ay; vecPrev[j * 2] = -vx - ax; vecPrev[j * 2 + 1] = -vy - ay; }
                    else { vec[j * 2] = vx; vec[j * 2 + 1] = vy; }
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
        // the arc's prev offsets are filled by the same search -- blend's choice is the depth's, not the vector's, so the
        // same neighbour is taken for both
        if (toT) {
            const r2 = fillHolesCPU({ vec: vecPrev, hole: hole.slice(), zbuf: zbuf.slice(), w, h, nearerIsLess,
                                      radius: fill.radius === undefined ? 4 : fill.radius, growth: fill.growth === undefined ? "neighbourhood" : fill.growth,
                                      prefer: fill.prefer === undefined ? "farther" : fill.prefer, side: "blend", t });
            vecPrev.set(r2.vec);
        }
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
        if (toT) { fetch4(prev, w, h, x + vecPrev[j * 2], y + vecPrev[j * 2 + 1], a, 0); fetch4(cur, w, h, x + vx, y + vy, b, 0); }
        else {
            fetch4(prev, w, h, x - t * vx, y - t * vy, a, 0);
            fetch4(cur, w, h, x + (1 - t) * vx, y + (1 - t) * vy, b, 0);
        }
        // *** A DISOCCLUDED PIXEL'S CONTENT IS IN ONE FRAME ONLY, SO THE BLEND IS NOT ALWAYS THE ANSWER. ***
        // `side` is SIDE_BLEND everywhere the splat landed, so the symmetric blend is what a normal pixel
        // gets and no second mask is needed; only render/holeFill.mjs's filled pixels can carry anything
        // else, and its header measures what each setting is worth.
        const sd = side === null ? SIDE_BLEND : side[j];
        for (let c = 0; c < 4; c++)
            frame[j * 4 + c] = sd === SIDE_PREV ? a[c] : sd === SIDE_CUR ? b[c] : a[c] * (1 - t) + b[c] * t;
    }
    return { frame, hole, holes, vec, vecPrev, side, filled: filledCount, abstained, zbuf, w, h };
}
