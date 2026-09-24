// render/holeFill.mjs -- WHAT GOES IN THE 3-6% OF AN INTERPOLATED FRAME THAT NO MOTION PASSES THROUGH.
//
// render/frameInterp.mjs splats a block motion field forward to time t and leaves at ZERO every pixel no
// block's footprint reached. On a rigid camera slide that is 3.1% of the frame, all of it at the edge the
// content vacated. On content with a SILHOUETTE it is every DISOCCLUSION: a foreground object pulling away
// from the background behind it, opening a strip that neither frame's motion field describes.
//
// *** THE HOLES ARE NOT MISSING PIXELS, THEY ARE MISSING VECTORS. *** Both source frames still exist and are
// still samplable there; what is absent is any statement about where the content came from. So this pass does
// not invent colour. It extends the VECTOR field into the holes and lets the same warp run -- same bilinear
// fetch, same blend, same sub-pixel accuracy.
//
// ---- *** THE OBVIOUS ALGORITHM IS WORSE THAN DOING NOTHING, WHICH IS THIS ROUND'S FIRST FINDING. *** -------
//
// The obvious fill is iterative dilation: grow the field one ring per pass, each hole pixel taking a filled
// neighbour's vector. MEASURED on a rendered disocclusion, against the frame that was really drawn at t = 0.5:
//
//     holes left at zero and cross-faded (v4677's control)   30.8217 dB on the holes
//     ring dilation, then the warp                           27.2034 dB   -- 3.6 dB WORSE
//
// Because a ring front grows from BOTH sides of the strip. Half of a four-pixel hole ends up holding the
// OCCLUDER's vector, and warping background along a foreground vector drags the foreground into the gap --
// precisely the smear the hole was. `growth: "ring"` is kept so that number stays reproducible.
//
// *** WHAT WORKS IS TO LOOK AT THE WHOLE NEIGHBOURHOOD AND TAKE THE FARTHEST VECTOR IN IT. *** A hole in a
// disocclusion is background, so the vector it wants is the background's, and the background is the FARTHER
// of the two surfaces bounding the gap. Searched over a radius rather than grown from a front, every hole
// pixel can see both candidates and choose:
//
//     neighbourhood search, farthest vector                  30.8217 dB   -- exactly ties the control
//     neighbourhood search, NEAREST vector                   25.1001 dB   -- 5.7 dB worse
//
// So `prefer` is load-bearing to 5.7 dB, and it is inert under `growth: "ring"` for the reason above: on a
// four-pixel strip a ring front's pixels only ever see one kind of neighbour, so the preference never binds.
// Measured, both settings of it produce bit-identical frames there.
//
// ---- *** AND TYING THE CONTROL IS NOT WINNING. THE BLEND IS WHAT IS LEFT WRONG. *** ------------------------
//
// A disoccluded pixel's content is visible in ONE frame only -- the occluder was over it in the other. The
// symmetric (1-t)*prev + t*cur therefore mixes the right answer with the occluder at full strength, which is
// exactly what a cross-fade does, which is why the two tie. Sampling one side alone:
//
//     one-sided, the correct side chosen by an ORACLE         EXACT -- zero error on all 256 hole pixels
//     one-sided, `cur` everywhere                            EXACT on this scene, where the occluder moves right
//     one-sided, the DERIVED rule below                       34.5802 dB   -- +3.76 over the blend
//
// The derived rule: the hole's occluder is the NEAREST filled pixel in the neighbourhood, and if the
// occluder's own vector carries it AWAY from the hole then the hole is uncovered by time t and the content is
// in `cur`; if it carries the occluder TOWARD the hole, the hole is about to be covered and the content is in
// `prev`. Where the projection is zero -- the occluder is directly above or below and its motion is sideways,
// which is 128 of these 256 pixels -- the rule ABSTAINS and the blend is used. That abstention is the whole
// remaining gap to the oracle, and it is a gap in the SIDE decision and not in the vector.
//
// *** WHAT WOULD CLOSE IT IS ALREADY IN THIS TREE AND IS NOT WIRED HERE. *** render/motionVectors.mjs's fourth
// channel is zPrev, the depth a surface WOULD have had last frame, and render/temporalReject.mjs already
// compares it against the depth actually recorded to decide disocclusion per pixel. That is the signal this
// rule is approximating with a dot product. Wiring it is the next round and is named in the gate's closing
// line rather than claimed here.
"use strict";

/**
 * Nearest-texel depth fetch with clamped edges. NEAREST and not bilinear, deliberately: a depth buffer at a
 * silhouette holds two surfaces a long way apart in z, and their average is a depth no surface has -- the
 * classic reason a depth test must not be filtered. render/frameInterp.mjs filters COLOUR bilinearly for the
 * opposite reason.
 */
function depthAt(d, w, h, x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    const xc = xi < 0 ? 0 : xi > w - 1 ? w - 1 : xi;
    const yc = yi < 0 ? 0 : yi > h - 1 ? h - 1 : yi;
    return d[yc * w + xc];
}

export const SIDE_BLEND = 0;   // the symmetric (1-t)*prev + t*cur
export const SIDE_PREV = 1;    // prev alone -- the hole is about to be covered
export const SIDE_CUR = 2;     // cur alone -- the hole has been uncovered

/**
 * Extend a sparse warped vector field into its holes.
 *
 * Inputs:
 *   vec      w*h*2, the splatted field; hole entries are overwritten
 *   hole     w*h, 1 where there is no vector
 *   zbuf     w*h, the depth each vector arrived with -- which candidate a hole takes is a depth question
 *   radius   how far to look, in pixels (Chebyshev). A hole no filled pixel reaches within it stays a hole.
 *   growth   "neighbourhood" (the default) or "ring" -- see the header; "ring" is kept to reproduce a result
 *   prefer   "farther" (the default) or "nearer"
 *   side     "derived" (the default), "depth" (v4679), "blend", "prev" or "cur"
 *   depthPrev, depthCur   w*h each, REQUIRED by side "depth" -- the two frames' own depth buffers
 *   t        where the generated frame sits, needed by side "depth" to know where to sample
 *
 * Returns { vec, hole, zbuf, side, filled, abstained }, all fresh:
 *   side       w*h Int8Array of SIDE_* codes; SIDE_BLEND outside the holes, so a consumer needs no second mask
 *   filled     how many pixels gained a vector
 *   abstained  how many of those the derived side rule could not decide, and handed to the blend. It is the
 *              instrument: a rule that decided everything and a rule that decided nothing both produce a
 *              frame, and on this content the abstentions are the entire gap to a perfect answer.
 */
export function fillHolesCPU({ vec, hole, zbuf, w, h, radius = 4, growth = "neighbourhood",
                               prefer = "farther", side = "derived", nearerIsLess = true,
                               depthPrev = null, depthCur = null, t = 0.5 }) {
    if (!(radius >= 1) || radius !== Math.floor(radius))
        throw new Error(`fillHolesCPU: radius must be a whole number of pixels, at least 1 -- got ${radius}`);
    if (growth !== "neighbourhood" && growth !== "ring")
        throw new Error(`fillHolesCPU: growth must be "neighbourhood" or "ring" -- got ${JSON.stringify(growth)}`);
    if (prefer !== "farther" && prefer !== "nearer")
        throw new Error(`fillHolesCPU: prefer must be "farther" or "nearer" -- got ${JSON.stringify(prefer)}`);
    if (!["depth", "derived", "blend", "prev", "cur"].includes(side))
        throw new Error(`fillHolesCPU: side must be "depth", "derived", "blend", "prev" or "cur" -- got ${JSON.stringify(side)}`);
    if (side === "depth" && (!depthPrev || depthPrev.length < w * h || !depthCur || depthCur.length < w * h))
        throw new Error('fillHolesCPU: side "depth" needs depthPrev and depthCur, each w*h -- it is render/temporalReject.mjs\'s disocclusion comparison and there is nothing to compare without them');
    if (!(t >= 0) || !(t <= 1))
        throw new Error(`fillHolesCPU: t must be in [0, 1] -- got ${t}`);
    if (!vec || vec.length < w * h * 2) throw new Error("fillHolesCPU: vec must be w*h*2");
    if (!hole || hole.length < w * h) throw new Error("fillHolesCPU: hole must be w*h");
    if (!zbuf || zbuf.length < w * h)
        throw new Error("fillHolesCPU: zbuf must be w*h -- which candidate a hole takes is a depth question, and without it the answer is the scan order's");

    const V = Float32Array.from(vec.subarray(0, w * h * 2));
    const Z = Float32Array.from(zbuf.subarray(0, w * h));
    const H = Uint8Array.from(hole.subarray(0, w * h));
    const S = new Int8Array(w * h);
    // "farther" wants the LARGER depth where nearer is less, and the smaller where it is more
    const farther = (a, b) => (nearerIsLess ? a > b : a < b);
    const wants = prefer === "farther" ? farther : (a, b) => farther(b, a);
    let filled = 0, abstained = 0;

    if (growth === "ring") {
        // *** THE SNAPSHOT IS WHAT MAKES A PASS A RING RATHER THAN A SCAN. *** Filling in place would let a
        // pass read its own writes, so the field would grow faster with the scan than against it and the
        // answer would depend on which corner the loop started from. This is the algorithm the header
        // measures as WORSE than doing nothing; it is order-independent, and still wrong.
        for (let p = 1; p <= radius; p++) {
            const was = Uint8Array.from(H);
            let any = 0;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const j = y * w + x;
                if (!was[j]) continue;
                let bj = -1, bz = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const yy = y + dy; if (yy < 0 || yy >= h) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx; if (xx < 0 || xx >= w) continue;
                        const k = yy * w + xx; if (was[k]) continue;
                        if (bj < 0 || wants(Z[k], bz)) { bj = k; bz = Z[k]; }
                    }
                }
                if (bj < 0) continue;
                V[j * 2] = V[bj * 2]; V[j * 2 + 1] = V[bj * 2 + 1];
                Z[j] = bz; H[j] = 0; filled++; any++;
            }
            if (!any) break;
        }
    } else {
        // *** ONE PASS, READING ONLY THE ORIGINAL MASK, SO EVERY HOLE PIXEL SEES BOTH CANDIDATES. *** This is
        // what makes `prefer` bind at all: a front only ever offers one kind of neighbour.
        const was = Uint8Array.from(H);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const j = y * w + x;
            if (!was[j]) continue;
            let bj = -1, bz = 0;                       // the chosen (by `prefer`) vector's source
            let oj = -1, oz = 0, od = Infinity;        // the NEAREST-depth source: the occluder, for the side
            for (let dy = -radius; dy <= radius; dy++) {
                const yy = y + dy; if (yy < 0 || yy >= h) continue;
                for (let dx = -radius; dx <= radius; dx++) {
                    const xx = x + dx; if (xx < 0 || xx >= w) continue;
                    const k = yy * w + xx; if (was[k]) continue;
                    if (bj < 0 || wants(Z[k], bz)) { bj = k; bz = Z[k]; }
                    const d2 = dx * dx + dy * dy;
                    // the nearest surface, and among equally near ones the spatially closest, so the
                    // occluder's position is the scene's and not the scan's
                    if (oj < 0 || farther(oz, Z[k]) || (Z[k] === oz && d2 < od)) { oj = k; oz = Z[k]; od = d2; }
                }
            }
            if (bj < 0) continue;                      // nothing within the radius; stays a hole
            V[j * 2] = V[bj * 2]; V[j * 2 + 1] = V[bj * 2 + 1];
            Z[j] = bz; H[j] = 0; filled++;
            if (side === "blend") { S[j] = SIDE_BLEND; continue; }
            if (side === "prev") { S[j] = SIDE_PREV; continue; }
            if (side === "cur") { S[j] = SIDE_CUR; continue; }
            if (side === "depth") {
                // *** THE DISOCCLUSION TEST, WHICH CONSULTS NO OCCLUDER GEOMETRY AT ALL (v4679). *** The
                // background's position in `prev` is p - t*v and in `cur` is p + (1-t)*v. A depth recorded
                // there that is NEARER than the background's own depth means something was in front of it,
                // so that frame does not show this content. This is render/temporalReject.mjs's comparison
                // applied to a hole instead of to a history sample, and it is why v4679 replaced the dot
                // product: deciding the side no longer requires the search to REACH the occluder, so the
                // radius stops carrying two unrelated jobs.
                const vx = V[j * 2], vy = V[j * 2 + 1];
                const pOcc = farther(bz, depthAt(depthPrev, w, h, x - t * vx, y - t * vy));
                const cOcc = farther(bz, depthAt(depthCur, w, h, x + (1 - t) * vx, y + (1 - t) * vy));
                if (pOcc && !cOcc) S[j] = SIDE_CUR;
                else if (cOcc && !pOcc) S[j] = SIDE_PREV;
                else { S[j] = SIDE_BLEND; abstained++; }   // both clear, or both blocked: nothing better
                continue;
            }
            // "derived": does the occluder's own motion carry it AWAY from this hole, or TOWARD it?
            const qx = oj % w, qy = (oj - qx) / w;
            const dot = V[oj * 2] * (x - qx) + V[oj * 2 + 1] * (y - qy);
            if (dot < 0) S[j] = SIDE_CUR;              // moving away: uncovered by time t
            else if (dot > 0) S[j] = SIDE_PREV;        // moving toward: about to be covered
            else { S[j] = SIDE_BLEND; abstained++; }   // no signed answer -- see the header
        }
    }
    return { vec: V, hole: H, zbuf: Z, side: S, filled, abstained };
}
