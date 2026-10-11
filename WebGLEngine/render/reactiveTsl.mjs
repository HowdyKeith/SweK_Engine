// render/reactiveTsl.mjs -- v4731
//
// THE REACTIVE MASK FOR A THREE.JS SCENE, AS TSL: render/reactive.mjs's reactiveCPU, the derived mask fsr.html's chain
// feeds the history factor -- where the colour disagrees with its reprojected history AND the depth says the
// reprojection was sound. Graded by render/reactiveTsl-selfcheck.mjs.
//
// *** ITS BILINEAR IS NOT THE ACCUMULATE'S, AND THE PORT KEEPS THE DIFFERENCE -- FOR FIDELITY, NOT BECAUSE A ROW CAN
// SEE IT. *** reactive.mjs's sample3 blends along x and then along y -- a = s00(1-fx) + s10 fx, b = s01(1-fx) +
// s11 fx, a(1-fy) + b fy -- where temporalReject.mjs's sampleBilinear3 sums four weighted taps. The same function in
// exact arithmetic, different in floating point. This header first said a port sharing one sampler "would agree with
// one mirror and not the other"; the gate's sabotage X1 put the four-tap form here and scored 0 RED -- the difference
// is rounding, under the gate's 1e-5 -- so the separate order is kept to read like the mirror, and that is all.
//
// The THREE DECLINES reactiveCPU counts (invalid, offscreen, depth-gated) are not counted here -- a fragment pass has
// no counter -- and all three write 0, as the mirror writes 0. The gate recovers the depth-gated set from the mirror
// to prove the gate declined pixels at all.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";

/**
 * reactiveCPU as a node: vec4(r, 0, 0, 1), r in [0, 1]. `current` and `history` are display-resolution colour,
 * `motion` the (dilated) field, `prevDepth` LAST frame's dilated clip depth. uniforms.hasHistory is 0 on the first
 * frame, where every pixel is declined; threshold (clip z) and scale are the caller's, as reactiveCPU requires.
 */
export function reactiveNode(TSL, { current, history, motion, prevDepth }, { w, h, threshold, scale = 1, strength = 1, nearerIsLess = true }) {
    requireTsl(TSL);
    if (!(threshold > 0)) throw new Error("render/reactiveTsl: threshold must be a positive clip-z gap -- reactiveCPU refuses a default for the reason disocclusionCPU does");
    if (!(scale > 0)) throw new Error(`render/reactiveTsl: scale must be positive -- got ${scale}; it is the caller's colour range, as reactiveCPU says`);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, abs, max, select } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), threshold: uniform(float(threshold)), scale: uniform(float(scale)),
                strength: uniform(float(strength)), hasHistory: uniform(float(0)) };
    const node = Fn(() => {
        const px = floor(screenCoordinate.x), py = floor(screenCoordinate.y);
        const at = (tex, x, y) => textureLoad(tex, ivec2(int(clamp(x, 0.0, u.w.sub(1.0))), int(clamp(y, 0.0, u.h.sub(1.0)))));
        const m = at(motion, px, py);
        const uu = screenCoordinate.x.div(u.w).add(m.x), vv = screenCoordinate.y.div(u.h).add(m.y);
        const off = uu.lessThan(0.0).or(uu.greaterThanEqual(1.0)).or(vv.lessThan(0.0)).or(vv.greaterThanEqual(1.0));
        const was = at(prevDepth, floor(uu.mul(u.w)), floor(vv.mul(u.h))).x;
        const gap = nearerIsLess ? m.w.sub(was) : was.sub(m.w);
        // sample3, in its own order
        const x = uu.mul(u.w).sub(0.5), y = vv.mul(u.h).sub(0.5), x0 = floor(x), y0 = floor(y), fx = x.sub(x0), fy = y.sub(y0);
        const ifx = float(1.0).sub(fx);
        const a = at(history, x0, y0).xyz.mul(ifx).add(at(history, x0.add(1.0), y0).xyz.mul(fx));
        const b = at(history, x0, y0.add(1.0)).xyz.mul(ifx).add(at(history, x0.add(1.0), y0.add(1.0)).xyz.mul(fx));
        const h3 = a.mul(float(1.0).sub(fy)).add(b.mul(fy));
        const dv = abs(at(current, px, py).xyz.sub(h3));
        const d = max(max(dv.x, dv.y), dv.z);
        const r = clamp(u.strength.mul(d).div(u.scale), 0.0, 1.0);
        const declined = u.hasHistory.lessThan(0.5).or(m.z.equal(0.0)).or(off).or(gap.greaterThan(u.threshold));
        return vec4(select(declined, float(0.0), r), 0.0, 0.0, 1.0);
    })();
    return { node, uniforms: u };
}
