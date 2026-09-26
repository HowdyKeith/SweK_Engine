// render/temporalLockTsl.mjs -- v4730
//
// THE LOCK RING FOR A THREE.JS SCENE, AS TSL: render/temporalLock.mjs's pushLuma and shadingShiftCPU. Graded by
// render/temporalLockTsl-selfcheck.mjs. Written into render/temporalTsl.mjs first and split out the same round, when
// that module's gate grew past the sweep's 20 s cap.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
// ================================================================================================================
// v4730 -- THE LOCK RING: render/temporalLock.mjs's pushLuma and shadingShiftCPU -- what fsr.html's chain runs for
// FSR2's lock stage. A per-pixel ring of 2 x period lumas, REPROJECTED through the motion field every frame, whose
// newer half against its older half is the shading-shift mask the history factor takes. (temporalLock.mjs's
// advanceLocks and lockRelaxation -- lock life and the clamp relaxation -- have no caller in this tree, fsr.html
// included, so they are not the chain and are not ported here. v4728 measured what they are for: the neighbourhood
// clamp takes half the accumulation's gain on detail finer than the render resolution.)
//
// *** THE RING IS PACKED FOUR SLOTS TO A TEXEL, ONE SLICE PER FOUR SLOTS STACKED DOWN THE TARGET. *** Texel
// (x, s*h + y) holds slots 4s..4s+3 of pixel (x, y), so a w x h ring of F slots is one w x (h * ceil(F/4)) float
// target -- 64 slots at a 2x upscale is sixteen slices. The push shifts every slot down by one: slots 4s..4s+2 read
// the NEXT component of the same slice and slot 4s+3 reads the first of the next slice, so each output texel is two
// bilinear fetches, not four. The fourth channel is data, so the pass is NoBlending like every pass here.
//
// The fill count is its own target (pushLuma's `filled`, capped at 255, read at the NEAREST texel -- floor(u*w), the
// rule temporalLock.mjs chose over round() for the tie reason v4728 met again in the resolve).
// ================================================================================================================

/**
 * The ring for one w x h field: `push(renderer)` reprojects it through `motionTex` and appends this frame's luma of
 * `currentTex`; `shading(renderer, target)` writes shadingShiftCPU's mask as vec4(mask, 0, 0, 1). `period` must be
 * jitterPhaseCount(ratio), as makeLumaState requires. Targets ping-pong internally.
 */
export function makeLumaRing(THREE, TSL, { w, h, period, currentTex, motionTex, scale = 1, strength = 1 }) {
    requireTsl(TSL);
    if (!Number.isInteger(period) || period < 1) throw new Error("render/temporalLockTsl: makeLumaRing's period must be a positive integer -- pass jitterPhaseCount(ratio), as makeLumaState requires");
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, min, abs, select } = TSL;
    const F = 2 * period, S = Math.ceil(F / 4);
    const flat = (hh) => new THREE.RenderTarget(w, hh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const ring = [flat(h * S), flat(h * S)], filled = [flat(h), flat(h)];
    const u = { w: uniform(float(w)), h: uniform(float(h)), n: uniform(float(0)), F: uniform(float(F)),
                scale: uniform(float(scale)), strength: uniform(float(strength)) };
    const px = (y) => ivec2(int(floor(screenCoordinate.x)), int(y));
    // shared: where this pixel's surface was last frame, and whether that is usable (pushLuma's `usable`)
    const reproject = (x, y) => {
        const m = textureLoad(motionTex, ivec2(int(x), int(y)));
        const hu = x.add(0.5).div(u.w).add(m.x), hv = y.add(0.5).div(u.h).add(m.y);
        const usable = u.n.greaterThan(0.5).and(m.z.notEqual(0.0)).and(hu.greaterThanEqual(0.0)).and(hu.lessThan(1.0))
            .and(hv.greaterThanEqual(0.0)).and(hv.lessThan(1.0));
        return { hu, hv, usable };
    };
    const lumaAt = (x, y) => { const c = textureLoad(currentTex, ivec2(int(x), int(y))).xyz; return c.x.mul(0.25).add(c.y.mul(0.5)).add(c.z.mul(0.25)); };
    const pushNode = (prevRing) => Fn(() => {
        const row = floor(screenCoordinate.y), s = floor(row.div(u.h)), y = row.sub(s.mul(u.h)), x = floor(screenCoordinate.x);
        const l = lumaAt(x, y), { hu, hv, usable } = reproject(x, y);
        // sampleScalar, over a whole slice at once
        const bx = hu.mul(u.w).sub(0.5), by = hv.mul(u.h).sub(0.5), x0 = floor(bx), y0 = floor(by), fx = bx.sub(x0), fy = by.sub(y0);
        const at = (xx, yy, slice) => textureLoad(prevRing, ivec2(int(clamp(xx, 0.0, u.w.sub(1.0))), int(slice.mul(u.h).add(clamp(yy, 0.0, u.h.sub(1.0))))));
        const bil = (slice) => at(x0, y0, slice).mul(float(1.0).sub(fx)).mul(float(1.0).sub(fy)).add(at(x0.add(1.0), y0, slice).mul(fx).mul(float(1.0).sub(fy)))
            .add(at(x0, y0.add(1.0), slice).mul(float(1.0).sub(fx)).mul(fy)).add(at(x0.add(1.0), y0.add(1.0), slice).mul(fx).mul(fy));
        const here = bil(s), next = bil(min(s.add(1.0), float(S - 1)));
        const shifted = [here.y, here.z, here.w, next.x];
        const out = shifted.map((v, c) => {
            const k = s.mul(4.0).add(c);
            const val = select(k.equal(u.F.sub(1.0)), l, select(k.greaterThanEqual(u.F), float(0.0), v));
            return select(usable, val, select(k.greaterThanEqual(u.F), float(0.0), l));
        });
        return vec4(out[0], out[1], out[2], out[3]);
    })();
    const filledNode = (prevFilled) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), { hu, hv, usable } = reproject(x, y);
        const nx = clamp(floor(hu.mul(u.w)), 0.0, u.w.sub(1.0)), ny = clamp(floor(hv.mul(u.h)), 0.0, u.h.sub(1.0));   // nearestTexel
        const was = textureLoad(prevFilled, ivec2(int(nx), int(ny))).x;
        return vec4(select(usable, min(float(255.0), was.add(1.0)), float(0.0)), 0.0, 0.0, 1.0);
    })();
    const shadingNode = (ringTex, filledTex) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        const P = period;
        let mNew = float(0.0), mOld = float(0.0);
        // lumaMean and lumaMeanPrev, summed in slot order as the mirror sums them; each slice fetched once
        for (let sl = 0; sl < S; sl++) {
            const v = textureLoad(ringTex, ivec2(int(x), int(y.add(u.h.mul(sl)))));
            for (let c = 0; c < 4; c++) { const k = sl * 4 + c; if (k >= F) break;
                const comp = [v.x, v.y, v.z, v.w][c];
                if (k >= P) mNew = mNew.add(comp); else mOld = mOld.add(comp); }
        }
        const full = textureLoad(filledTex, ivec2(int(x), int(y))).x.greaterThanEqual(u.F);
        const r = clamp(u.strength.mul(abs(mNew.div(P).sub(mOld.div(P)))).div(u.scale), 0.0, 1.0);
        return vec4(select(full, r, float(0.0)), 0.0, 0.0, 1.0);
    })();
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    // push k writes ring[k % 2] from ring[1 - k % 2]; the scenes are built once per direction
    const pushSc = [quad(pushNode(ring[1].texture)), quad(pushNode(ring[0].texture))];
    const fillSc = [quad(filledNode(filled[1].texture)), quad(filledNode(filled[0].texture))];
    const shadeSc = [quad(shadingNode(ring[0].texture, filled[0].texture)), quad(shadingNode(ring[1].texture, filled[1].texture))];
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let pushes = 0;
    return {
        F, S, period, uniforms: u,
        get pushes() { return pushes; },
        /** The target holding the NEWEST ring and fill count (valid after the first push). */
        get ring() { return ring[(pushes + 1) % 2]; },
        get filled() { return filled[(pushes + 1) % 2]; },
        async push(renderer) {
            const prev = renderer.getRenderTarget(), k = pushes % 2;
            u.n.value = pushes;
            renderer.setRenderTarget(ring[k]); await renderer.renderAsync(pushSc[k], ortho);
            renderer.setRenderTarget(filled[k]); await renderer.renderAsync(fillSc[k], ortho);
            renderer.setRenderTarget(prev);
            pushes++;
        },
        async shading(renderer, target) {
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(target); await renderer.renderAsync(shadeSc[(pushes + 1) % 2], ortho);
            renderer.setRenderTarget(prev);
        },
        dispose() { for (const t of [...ring, ...filled]) t.dispose(); },
    };
}
