// render/temporalLockSumsTsl.mjs -- THE LOCK'S SUMS FOR A THREE.JS SCENE, AS TSL: render/temporalLockSums.mjs's makeLumaSums,
// with render/temporalLockTsl.mjs's makeLumaRing's interface, so fx/fsr/fsrTemporalTsl.mjs drives either. Graded by
// render/temporalLockSumsTsl-selfcheck.mjs on both backends.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
// ================================================================================================================
// THE SUMS: render/temporalLockSums.mjs's makeLumaSums, pushLumaSums, lumaSumsShiftCPU and lumaSumsMean -- the ring's two
// windows kept as three running sums. ONE FLOAT TEXEL A PIXEL: (cur, prev, prev2, filled), ping-ponged, so the whole
// state is 2 x w x h x 16 bytes -- 16.6 MB at 960x540 at ANY upscale ratio, where the ring is 265 MB at 2x and 597 MB
// at 3x. The sums are fetched bilinearly at the reprojected uv (the ring's sampleScalar, over three channels at once)
// and the fill count at the nearest texel, from the same texel's fourth channel. The period in progress and whether
// this push closes it are uniforms: the windows tumble for every pixel on the same frame.
// ================================================================================================================

/**
 * The sums for one w x h field, with makeLumaRing's interface: `push(renderer)`, `shading(renderer, target)` (the mask
 * as vec4(mask, 0, 0, 1)) and `mean(renderer, target)` (the last closed period's mean). No `instability`: a sum has no
 * spread. `period` must be jitterPhaseCount(ratio).
 */
export function makeLumaSums(THREE, TSL, { w, h, period, currentTex, motionTex, scale = 1, strength = 1 }) {
    requireTsl(TSL);
    if (!Number.isInteger(period) || period < 1) throw new Error("render/temporalLockSumsTsl: makeLumaSums's period must be a positive integer -- pass jitterPhaseCount(ratio), as makeLumaSums requires");
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, min, abs, select } = TSL;
    const flat = () => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const state = [flat(), flat()];
    // phaseIn: frames the period in progress held BEFORE this push; held: AFTER it (what the shading test reads)
    const u = { w: uniform(float(w)), h: uniform(float(h)), n: uniform(float(0)), P: uniform(float(period)),
                phaseIn: uniform(float(0)), held: uniform(float(0)), scale: uniform(float(scale)), strength: uniform(float(strength)) };
    const pushNode = (prev) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        const c = textureLoad(currentTex, ivec2(int(x), int(y))).xyz, l = c.x.mul(0.25).add(c.y.mul(0.5)).add(c.z.mul(0.25));
        const m = textureLoad(motionTex, ivec2(int(x), int(y)));
        const hu = x.add(0.5).div(u.w).add(m.x), hv = y.add(0.5).div(u.h).add(m.y);
        const usable = u.n.greaterThan(0.5).and(m.z.notEqual(0.0)).and(hu.greaterThanEqual(0.0)).and(hu.lessThan(1.0))
            .and(hv.greaterThanEqual(0.0)).and(hv.lessThan(1.0));
        const bx = hu.mul(u.w).sub(0.5), by = hv.mul(u.h).sub(0.5), x0 = floor(bx), y0 = floor(by), fx = bx.sub(x0), fy = by.sub(y0);
        const at = (xx, yy) => textureLoad(prev, ivec2(int(clamp(xx, 0.0, u.w.sub(1.0))), int(clamp(yy, 0.0, u.h.sub(1.0)))));
        const b = at(x0, y0).mul(float(1.0).sub(fx)).mul(float(1.0).sub(fy)).add(at(x0.add(1.0), y0).mul(fx).mul(float(1.0).sub(fy)))
            .add(at(x0, y0.add(1.0)).mul(float(1.0).sub(fx)).mul(fy)).add(at(x0.add(1.0), y0.add(1.0)).mul(fx).mul(fy));
        const nx = clamp(floor(hu.mul(u.w)), 0.0, u.w.sub(1.0)), ny = clamp(floor(hv.mul(u.h)), 0.0, u.h.sub(1.0));   // nearestTexel
        const was = textureLoad(prev, ivec2(int(nx), int(ny))).w;
        const cur = select(usable, b.x.add(l), l.mul(u.phaseIn.add(1.0)));
        const p = select(usable, b.y, l.mul(u.P)), q = select(usable, b.z, l.mul(u.P));
        const f = select(usable, min(float(255.0), was.add(1.0)), float(0.0));
        const tumble = u.phaseIn.add(1.0).equal(u.P);   // the period in progress is complete: it becomes prev, prev becomes prev2
        return vec4(select(tumble, float(0.0), cur), select(tumble, cur, p), select(tumble, p, q), f);
    })();
    const shadingNode = (st) => Fn(() => {
        const v = textureLoad(st, ivec2(int(floor(screenCoordinate.x)), int(floor(screenCoordinate.y))));
        const known = v.w.add(1.0).greaterThanEqual(u.held.add(u.P.mul(2.0)));   // sumsKnown
        const r = clamp(u.strength.mul(abs(v.y.div(u.P).sub(v.z.div(u.P)))).div(u.scale), 0.0, 1.0);
        return vec4(select(known, r, float(0.0)), 0.0, 0.0, 1.0);
    })();
    const meanNode = (st) => Fn(() => {
        const v = textureLoad(st, ivec2(int(floor(screenCoordinate.x)), int(floor(screenCoordinate.y))));
        return vec4(v.y.div(u.P), 0.0, 0.0, 1.0);
    })();
    const quad = (node) => { const mm = new THREE.NodeMaterial(); mm.fragmentNode = node; mm.blending = THREE.NoBlending; mm.depthTest = false; mm.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mm)); return sc; };
    const pushSc = [quad(pushNode(state[1].texture)), quad(pushNode(state[0].texture))];
    const shadeSc = [quad(shadingNode(state[0].texture)), quad(shadingNode(state[1].texture))];
    const meanSc = [quad(meanNode(state[0].texture)), quad(meanNode(state[1].texture))];
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let pushes = 0, phase = 0;
    const draw = async (renderer, scs, target) => {
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(target); await renderer.renderAsync(scs[(pushes + 1) % 2], ortho);
        renderer.setRenderTarget(prev);
    };
    return {
        period, uniforms: u, bytesPerPixel: 2 * 16,
        get pushes() { return pushes; },
        /** Frames the period in progress holds after the last push -- pushLumaSums' `phase`. */
        get phase() { return phase; },
        /** The target holding the NEWEST state, (cur, prev, prev2, filled) per texel (valid after the first push). */
        get state() { return state[(pushes + 1) % 2]; },
        async push(renderer) {
            const prev = renderer.getRenderTarget(), k = pushes % 2;
            u.n.value = pushes; u.phaseIn.value = phase;
            renderer.setRenderTarget(state[k]); await renderer.renderAsync(pushSc[k], ortho);
            renderer.setRenderTarget(prev);
            pushes++; phase = (phase + 1) % period; u.held.value = phase;
        },
        async shading(renderer, target) { await draw(renderer, shadeSc, target); },
        /** lumaSumsMean, as vec4(mean, 0, 0, 1) -- the field lockCandidatesFromSums takes. */
        async mean(renderer, target) { await draw(renderer, meanSc, target); },
        dispose() { for (const t of state) t.dispose(); },
    };
}

