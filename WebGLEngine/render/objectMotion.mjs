// render/objectMotion.mjs -- MOTION VECTORS FOR THINGS THAT MOVE, not just for a camera that does.
//
// *** render/motionVectors.mjs IS EXACTLY RIGHT AND EXACTLY HALF THE PROBLEM. *** It reprojects a depth buffer
// through the camera's own two matrices, which answers "where was this surface point on screen last frame" for
// a surface that did not move. For a surface that DID move it answers a different question and the caller
// cannot tell: the vector is well-formed, finite, valid, and points at the wrong pixel.
//
// MEASURED at v4646 before a line of this was written, at 96x64 through a perspective camera, on a slab
// translating 0.30 world units between frames:
//
//     static camera, slab moves    worst |cameraOnly - truth| = 2.51 px
//     camera pans, slab still      worst |cameraOnly - truth| = 0.00 px   (1.7e-8, f64 noise)
//     camera pans, slab moves      worst |cameraOnly - truth| = 2.51 px
//
// The middle row is the one that says motionVectors.mjs is not broken -- it is exact on its whole domain. The
// other two are the domain it does not cover, and 2.5 px of motion error is not a small number for a temporal
// pass: the history fetch lands two and a half pixels from the surface it is meant to follow, which is what
// ghosting is. fx/fsr's arc has been accumulating history against camera-only vectors on a synthetic scene
// where nothing moves but the camera, so nothing has paid for this yet.
//
// ---- WHAT IT TAKES, AND WHY IT IS A TABLE RATHER THAN A MATRIX -------------------------------------------
//
// A camera has one previous matrix. A scene has one PER OBJECT, so the per-pixel question needs to know which
// object it is looking at: an id buffer beside the depth buffer, and a table of matrices indexed by it. That
// is what a G-buffer velocity pass does at rasterisation time; doing it as a post-process needs the id.
//
// *** THE CAMERA-ONLY CASE IS THIS ONE WITH AN IDENTITY MODEL, AND THE GATE ASSERTS THAT EXACTLY. *** With one
// object whose model matrix is identity, invMVPCur[0] is inverse(vpCur) and mvpPrev[0] is vpPrev, the loop
// below becomes motionVectorsCPU's loop statement for statement, and the two agree BIT FOR BIT. That is the
// row that says this module did not quietly redefine a convention the rest of the arc depends on.
//
// *** AND THE TWO-STEP FORM IS KEPT ON PURPOSE, THOUGH ONE MATRIX WOULD DO. *** mvpPrev * inverse(mvpCur)
// collapses the unproject and the reproject into a single multiply, and is algebraically identical BECAUSE
// projective transforms are homogeneous -- the intermediate divide by w scales the vector and the next
// transform's own divide cancels it. What it is NOT identical in is the VALIDITY TEST: the sign of the
// intermediate w decides whether the point is in front of the camera, and a combined matrix has thrown that
// sign away by the time q.w is tested. So the divide stays, the guards stay where motionVectors.mjs put them,
// and the identity-parity row above stays exact rather than nearly.
"use strict";
import { mat4Multiply, mat4Invert, transform4 } from "./motionVectors.mjs";

/**
 * The per-object matrix pair each pixel needs, built once a frame.
 *
 * `models` is an array of column-major model matrices, indexed by the same id the id buffer stores; `prevModels`
 * is the same objects' matrices from LAST frame. An object that did not move passes the same matrix twice, and
 * a caller with no objects at all passes one identity pair and gets the camera-only case.
 *
 * Returns { invMVPCur, mvpPrev, count } -- arrays of Float32Array(16), NOT one flat buffer, because the id
 * indexes objects and a flat buffer would make an off-by-sixteen look like a different object rather than a
 * crash. The WGSL side flattens it, once, where the layout is the binding's business.
 */
export function buildObjectMatrices({ vpCur, vpPrev, models, prevModels }) {
    if (!Array.isArray(models) || !Array.isArray(prevModels))
        throw new Error("buildObjectMatrices: models and prevModels must both be arrays indexed by object id");
    if (models.length !== prevModels.length)
        throw new Error(`buildObjectMatrices: ${models.length} models against ${prevModels.length} prevModels -- ` +
            "an object present in one frame and not the other has no motion vector, and silently pairing it " +
            "with its neighbour's matrix is the failure this refuses");
    const invMVPCur = [], mvpPrev = [];
    for (let i = 0; i < models.length; i++) {
        const cur = mat4Multiply(vpCur, models[i]);
        const inv = mat4Invert(cur);
        if (!inv) throw new Error(`buildObjectMatrices: object ${i}'s current view-projection-model is singular -- ` +
            "a zero scale on a model matrix does this, and it cannot be unprojected through");
        invMVPCur.push(inv);
        mvpPrev.push(mat4Multiply(vpPrev, prevModels[i]));
    }
    return { invMVPCur, mvpPrev, count: models.length };
}

/**
 * Per-pixel motion vectors for a scene whose objects move, mirroring motionVectorsCPU's conventions exactly:
 * (du, dv, valid, zPrev) in UV units, uv (0,0) at top-left, ndc y flipped, depth passed through untouched in
 * whatever range the caller's projection produces. Read that module's header for all four; this one adds only
 * the id.
 *
 * `ids` is w*h object indices. An id outside the table is not a silent identity -- see the guard.
 */
export function objectMotionCPU({ depth, ids, w, h, invMVPCur, mvpPrev, invalidTo = 0 }) {
    if (!invMVPCur || !mvpPrev || invMVPCur.length !== mvpPrev.length)
        throw new Error("objectMotionCPU: invMVPCur and mvpPrev must be arrays of the same length -- pass buildObjectMatrices' output");
    const n = invMVPCur.length;
    const out = new Float32Array(w * h * 4);
    const valid = new Uint8Array(w * h);
    let outOfRange = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const d = depth[i];
        const id = ids[i];
        // *** AN ID OFF THE END OF THE TABLE IS COUNTED AND REJECTED, NOT CLAMPED. *** Clamping to 0 would give
        // the pixel the FIRST object's motion, which is a plausible-looking vector for the wrong surface -- the
        // same class of wrongness this whole module exists to remove.
        if (!(id >= 0 && id < n)) { out[i * 4] = invalidTo; out[i * 4 + 1] = invalidTo; out[i * 4 + 3] = invalidTo; valid[i] = 0; outOfRange++; continue; }
        const nx = 2 * u - 1, ny = 1 - 2 * v;
        const p = transform4(invMVPCur[id], nx, ny, d, 1);
        if (!p[3]) { out[i * 4] = invalidTo; out[i * 4 + 1] = invalidTo; out[i * 4 + 3] = invalidTo; valid[i] = 0; continue; }
        // OBJECT space, not world: the inverse carried the model matrix, so this point is where the surface sits
        // on the object -- which is the thing that does not change when the object moves.
        const ox = p[0] / p[3], oy = p[1] / p[3], oz = p[2] / p[3];
        const q = transform4(mvpPrev[id], ox, oy, oz, 1);
        if (q[3] <= 0) { out[i * 4] = invalidTo; out[i * 4 + 1] = invalidTo; out[i * 4 + 3] = invalidTo; valid[i] = 0; continue; }
        const pu = (q[0] / q[3] + 1) * 0.5, pv = (1 - q[1] / q[3]) * 0.5;
        out[i * 4] = pu - u;
        out[i * 4 + 1] = pv - v;
        out[i * 4 + 2] = 1;
        out[i * 4 + 3] = q[2] / q[3];
        valid[i] = 1;
    }
    return { data: out, valid, w, h, outOfRange };
}
