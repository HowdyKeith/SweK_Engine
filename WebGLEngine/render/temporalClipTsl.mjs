// render/temporalClipTsl.mjs -- v4729, split out of render/temporalTsl.mjs at v4730
//
// THE DEPTH CLIP FOR A THREE.JS SCENE, AS TSL: render/dilate.mjs's dilateCPU and render/temporalReject.mjs's
// disocclusionCPU and historyFactorCPU, over the motion field and clip depth render/temporalTsl.mjs's input stage
// writes. Graded by render/temporalClipTsl-selfcheck.mjs. It lived in render/temporalTsl.mjs for one round; that
// module's gate grew past the sweep's 20 s cap at v4730 and was split one module per concern, the way render/ holds
// the CPU references (temporalReject.mjs, dilate.mjs, temporalLock.mjs, reactive.mjs).
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
// ================================================================================================================
// v4729 -- THE DEPTH CLIP: render/dilate.mjs's dilateCPU, render/temporalReject.mjs's disocclusionCPU and
// historyFactorCPU. FSR2's reconstruct-and-dilate and depth-clip passes, in the tree's form.
//
// *** DILATION'S NEIGHBOURS OFF THE FRAME ARE SKIPPED, NOT CLAMPED, AND A TIE KEEPS THE CENTRE. *** Both are
// dilateCPU's rules ("the frame's edge is not a surface"; "STRICTLY nearer"), and both are where a port goes quietly
// wrong: a clamped neighbour is the centre's own column read twice, and a <= test hands a flat region's every pixel
// to its top-left neighbour. The search visits the nine in dilateCPU's order and keeps the best TEXEL, so depth and
// all four motion channels come from ONE pixel -- "a mixed vector describes no surface".
//
// nearerIsLess is true for three's perspective cameras in both clip conventions: the near plane is clip z 0 on
// WebGPU and -1 on WebGL, and z grows away from the eye in both. A reversed-Z camera would pass false.
//
// The THRESHOLD is the caller's and is required, as disocclusionCPU requires it: a clip-z gap means a different
// distance at every depth of a perspective projection. clipGapThreshold below derives one the way fsr.html does --
// a quarter of the clip-z gap between two surfaces the caller names.
// ================================================================================================================

/**
 * dilateCPU as two fragment nodes over one search: `motionNode` (the four channels of the nearest pixel in the 3x3)
 * and `depthNode` (vec4(that depth, 0, 0, 1)). `depthTex` holds CLIP z in .x (makeMotionStage's `depth`).
 */
export function dilateNodes(TSL, depthTex, motionTex, { w, h, nearerIsLess = true }) {
    requireTsl(TSL);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, floor, select, clamp } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)) };
    const search = () => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        const bx = x.toVar(), by = y.toVar();
        const bestD = textureLoad(depthTex, ivec2(int(x), int(y))).x.toVar();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;      // the centre is where the search starts; it cannot beat itself
            const xx = x.add(dx), yy = y.add(dy);
            const inFrame = xx.greaterThanEqual(0.0).and(xx.lessThan(u.w)).and(yy.greaterThanEqual(0.0)).and(yy.lessThan(u.h));
            // the load is clamped so it stays a legal texel; inFrame is what decides whether it may win
            const d = textureLoad(depthTex, ivec2(int(clamp(xx, 0.0, u.w.sub(1.0))), int(clamp(yy, 0.0, u.h.sub(1.0))))).x;
            const better = inFrame.and(nearerIsLess ? d.lessThan(bestD) : d.greaterThan(bestD));
            bestD.assign(select(better, d, bestD)); bx.assign(select(better, xx, bx)); by.assign(select(better, yy, by));
        }
        return { bx, by, bestD };
    };
    const motionNode = Fn(() => { const s = search(); return textureLoad(motionTex, ivec2(int(s.bx), int(s.by))); })();
    const depthNode = Fn(() => { const s = search(); return vec4(s.bestD, 0.0, 0.0, 1.0); })();
    return { motionNode, depthNode, uniforms: u };
}

/**
 * disocclusionCPU as a node: vec4(mask, 0, 0, 1), mask 1 where the history is WRONG -- no reprojection, off the
 * frame, or the recorded depth at the reprojected texel NEARER than this surface expected by more than threshold.
 * `prevDepthTex` is LAST frame's dilated clip depth (.x). uniforms.threshold is the caller's, in clip z.
 */
export function disocclusionNode(TSL, motionTex, prevDepthTex, { w, h, threshold, nearerIsLess = true }) {
    requireTsl(TSL);
    if (!(threshold > 0)) throw new Error("render/temporalClipTsl: disocclusionNode's threshold must be a positive clip-z gap -- disocclusionCPU refuses a default for the same reason");
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, select } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), threshold: uniform(float(threshold)) };
    const node = Fn(() => {
        const m = textureLoad(motionTex, ivec2(int(screenCoordinate.x), int(screenCoordinate.y)));
        const uu = screenCoordinate.x.div(u.w).add(m.x), vv = screenCoordinate.y.div(u.h).add(m.y);
        const off = uu.lessThan(0.0).or(uu.greaterThanEqual(1.0)).or(vv.lessThan(0.0)).or(vv.greaterThanEqual(1.0));
        const px = clamp(floor(uu.mul(u.w)), 0.0, u.w.sub(1.0)), py = clamp(floor(vv.mul(u.h)), 0.0, u.h.sub(1.0));
        const was = textureLoad(prevDepthTex, ivec2(int(px), int(py))).x;
        const gap = nearerIsLess ? m.w.sub(was) : was.sub(m.w);
        const flagged = m.z.equal(0.0).or(off).or(gap.greaterThan(u.threshold));
        return vec4(select(flagged, 1.0, 0.0), 0.0, 0.0, 1.0);
    })();
    return { node, uniforms: u };
}

/**
 * historyFactorCPU as a node: the product of (1 - clamp(mask, 0, 1)) over whichever of the three masks is given
 * (each a texture whose .x is the mask), as vec4(f, 0, 0, 1) -- the `factor` accumulateNode reads.
 */
export function historyFactorNode(TSL, { disocclusion = null, reactive = null, shading = null }) {
    requireTsl(TSL);
    const { Fn, float, int, vec4, ivec2, textureLoad, screenCoordinate, clamp } = TSL;
    const node = Fn(() => {
        const t = ivec2(int(screenCoordinate.x), int(screenCoordinate.y));
        let f = float(1.0);
        for (const m of [disocclusion, reactive, shading]) if (m) f = f.mul(float(1.0).sub(clamp(textureLoad(m, t).x, 0.0, 1.0)));
        return vec4(f, 0.0, 0.0, 1.0);
    })();
    return { node };
}

/**
 * A disocclusion threshold for a perspective camera, fsr.html's way: a quarter of the clip-z gap between two world
 * points the caller names (a near surface and the one behind it). `vp` is the camera's view-projection as a
 * column-major array. Returns null when the gap is under 1e-4, where the clip test cannot separate them.
 */
export function clipGapThreshold(vp, near, far) {
    const z = ([x, y, zz]) => { const cz = vp[2] * x + vp[6] * y + vp[10] * zz + vp[14], cw = vp[3] * x + vp[7] * y + vp[11] * zz + vp[15]; return cz / cw; };
    const gap = Math.abs(z(near) - z(far));
    return gap > 1e-4 ? 0.25 * gap : null;
}
