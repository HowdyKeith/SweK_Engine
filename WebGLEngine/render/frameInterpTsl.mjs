// render/frameInterpTsl.mjs -- v4736 -- FRAME GENERATION FOR A THREE.JS SCENE, AS TSL: render/frameInterp.mjs's
// interpolateFrameCPU -- the scatter of a block motion field forward to time t, and the gather that warps `prev` back
// and `cur` forward along it -- and crossFadeCPU, its control arm. Graded by render/frameInterpTsl-selfcheck.mjs, on
// both of three's backends, against the CPU reference exactly: the hole mask, the splatted field and its depth.
//
// ---- *** THE SCATTER IS A RASTERISATION, BECAUSE WEBGL2 HAS NO ATOMICS. *** ----------------------------------------
// render/frameInterpWgsl.mjs scatters with atomicMin on a storage buffer -- a depth key, then an owner index -- and
// three's WebGL2 backend has no compute stage and no atomics to lend it. But "each block writes its footprint where its
// content is at time t, the nearer one winning, and on a TIE the first writer keeping it" is exactly what a depth-tested
// draw does. So each block is ONE INSTANCE of a quad: the vertex stage places it at the block's landing, the fragment
// stage writes (vx, vy, depth, 1) and a depth key, and the depth test settles who owns a pixel:
//   * LessDepth, STRICT, so an equal key leaves the first writer alone -- interpolateFrameCPU's `d < zbuf[j]`;
//   * instances in index order, which every API's rasterisation-order guarantee makes the order the depth test sees
//     them in -- the CPU's loop order, and render/frameInterpWgsl.mjs's atomicMin-on-index;
//   * a FLOAT depth target, so the key is the block's depth rather than a 24-bit quantisation of it.
// Measured first on both backends: two blocks at equal depth overlapping (the first keeps the overlap), and a nearer
// third over both (it wins everywhere it lands).
//
// *** THE DEPTH KEY IS 0.5 + 0.25 d (0.5 - 0.25 d WHEN NEARER IS MORE), SO IT HOLDS CLIP z FROM EITHER CONVENTION. ***
// Both of three's clip-z conventions ([0, 1] and [-1, 1]) land strictly inside (0, 1), below the cleared 1.0 that stands
// for the CPU's Infinity. The scale is a power of two and exact; the 0.5 offset is not, and two depths closer together
// than about 6e-8 become one key -- a tie the CPU would call a strict order. That is the precision of the key, stated;
// depths outside (-2, 2) are outside its domain.
//
// *** THE LANDING IS floor(x + 0.5), Math.round, AND NOT round(). *** v4734 found render/frameInterpWgsl.mjs rounding the
// same landing with WGSL's round(), which ties to even, and at t = 0.5 an odd whole-pixel flow lands every block on a
// half. render/shaderRound-selfcheck.mjs's census reads shader text, not TSL graphs, so this module says it instead.
//
// THE FIELD is one texture, bw x bh, a texel per block: (vx, vy, depth, valid) -- the forward displacement prev -> cur
// in full-resolution pixels (render/opticalFlow.mjs's output sense, the NEGATIVE of render/motionVectors.mjs's), the
// depth of the surface the vector belongs to, and 0 in `valid` where the field declines to answer (interpolateFrameCPU's
// NaN). flowFromMotionNode builds one from this tree's motion field at a block of 1.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
import { fillHolesNodes } from "./holeFillTsl.mjs";
import { SIDE_PREV } from "./holeFill.mjs";

/**
 * A per-pixel field (block 1) from a three.js motion field: vec4(vx, vy, depth, valid) with (vx, vy) = -(du * w, dv * h)
 * -- render/temporalTsl.mjs's motion is uvPrev - uvCurr, so the forward displacement is its negative in pixels -- and
 * `depthTex`.x the surface's clip depth. The motion field is indexed by the frame it was drawn for, so the field is
 * CUR-indexed and interpolateFrameCPU's `indexedBy` is "cur".
 */
export function flowFromMotionNode(TSL, motionTex, depthTex, { w, h }) {
    requireTsl(TSL);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, select } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)) };
    const node = Fn(() => {
        const at = ivec2(int(screenCoordinate.x), int(screenCoordinate.y));
        const m = textureLoad(motionTex, at), d = textureLoad(depthTex, at).x;
        return vec4(m.x.negate().mul(u.w), m.y.negate().mul(u.h), d, select(m.z.equal(0.0), float(0.0), float(1.0)));
    })();
    return { node, uniforms: u };
}

/** crossFadeCPU as a node: (1 - t) prev + t cur, the control arm every generated frame is measured against. */
export function crossFadeNode(TSL, prevTex, curTex, { t = 0.5 } = {}) {
    requireTsl(TSL);
    const { Fn, float, int, ivec2, uniform, textureLoad, screenCoordinate } = TSL;
    const u = { t: uniform(float(t)) };
    const node = Fn(() => {
        const at = ivec2(int(screenCoordinate.x), int(screenCoordinate.y));
        return textureLoad(prevTex, at).mul(float(1.0).sub(u.t)).add(textureLoad(curTex, at).mul(u.t));
    })();
    return { node, uniforms: u };
}

/**
 * interpolateFrameCPU: splat(renderer, fieldTex) scatters the field into `targets.vec` -- vec4(vx, vy, zbuf, 1) where a
 * block landed and alpha 0 in a hole -- and, when `fill` is given, extends it into the holes (render/holeFillTsl.mjs)
 * into `targets.filled` and `targets.side`; gather(renderer, prevTex, curTex, output) warps along whichever is last.
 * uniforms.t is the time, shared by all of them. `indexedBy` ("prev" or "cur") is REQUIRED, as interpolateFrameCPU
 * requires it. `fill` is interpolateFrameCPU's: { radius, prefer, side, depthPrev, depthCur } -- the two depths as
 * TEXTURES here -- and null by default, when this is v4736's pass exactly.
 */
export function makeFrameInterp(THREE, TSL, { w, h, block, indexedBy, nearerIsLess = true, t = 0.5, fill = null }) {
    requireTsl(TSL);
    if (!(block >= 1) || block !== Math.floor(block)) throw new Error(`render/frameInterpTsl: block must be a whole number of pixels, at least 1 -- got ${block}`);
    if (indexedBy !== "prev" && indexedBy !== "cur")
        throw new Error(`render/frameInterpTsl: indexedBy must be "prev" or "cur" -- got ${JSON.stringify(indexedBy)}; there is no default, for render/frameInterp.mjs's reason (v4680)`);
    if (!(t >= 0) || !(t <= 1)) throw new Error(`render/frameInterpTsl: t must be in [0, 1] -- got ${t}`);
    const { Fn, float, int, uint, vec4, ivec2, uniform, textureLoad, screenCoordinate, instanceIndex, positionGeometry,
            varying, floor, min, select, clamp, abs } = TSL;
    const bw = Math.ceil(w / block), bh = Math.ceil(h / block);
    const u = { t: uniform(float(t)), w: uniform(float(w)), h: uniform(float(h)), block: uniform(float(block)), bw: uniform(uint(bw)) };
    const depthTexture = new THREE.DepthTexture(w, h); depthTexture.type = THREE.FloatType;
    const vecT = new THREE.RenderTarget(w, h, { type: THREE.FloatType, depthTexture, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const flat = () => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const fillN = fill ? fillHolesNodes(TSL, vecT.texture, { w, h, nearerIsLess, t, radius: fill.radius === undefined ? 4 : fill.radius,
        prefer: fill.prefer || "farther", side: fill.side || "derived", depthPrev: fill.depthPrev || null, depthCur: fill.depthCur || null }) : null;
    if (fillN) fillN.uniforms.t = u.t;   // one time for the splat, the fill's side test and the warp
    const filledT = fill ? flat() : null, sideT = fill ? flat() : null;
    const field = fill ? filledT : vecT;
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ---- SCATTER: one quad per block, placed where the block's content is at time t ----
    const splatScene = (fieldTex) => {
        const g = new THREE.InstancedBufferGeometry(), pg = new THREE.PlaneGeometry(1, 1);
        g.index = pg.index; g.setAttribute("position", pg.getAttribute("position")); g.instanceCount = bw * bh;
        const m = new THREE.NodeMaterial();
        m.blending = THREE.NoBlending; m.side = THREE.DoubleSide;
        m.depthTest = true; m.depthWrite = true; m.depthFunc = THREE.LessDepth;   // STRICT: a tie keeps the first writer
        const byU = instanceIndex.div(u.bw), bxU = instanceIndex.sub(byU.mul(u.bw));
        const bx = float(bxU), by = float(byU);
        const f = textureLoad(fieldTex, ivec2(int(bxU), int(byU)));
        const ax = indexedBy === "prev" ? u.t.mul(f.x) : float(1.0).sub(u.t).mul(f.x).negate();
        const ay = indexedBy === "prev" ? u.t.mul(f.y) : float(1.0).sub(u.t).mul(f.y).negate();
        const sx = floor(bx.mul(u.block).add(ax).add(0.5)), sy = floor(by.mul(u.block).add(ay).add(0.5));   // Math.round
        // the block's own extent in `prev` stops at the frame edge, so its tail does not splat
        const fw = min(u.block, u.w.sub(bx.mul(u.block))), fh = min(u.block, u.h.sub(by.mul(u.block)));
        const corner = positionGeometry.xy.add(0.5);   // 0 or 1 at each corner of the unit quad
        const px = sx.add(corner.x.mul(fw)), py = sy.add(corner.y.mul(fh));
        // a declined block is sent off the frame rather than discarded, so no fragment of it exists at all
        const nx = select(f.w.greaterThan(0.5), px.div(u.w).mul(2.0).sub(1.0), float(4.0));
        m.vertexNode = vec4(nx, float(1.0).sub(py.div(u.h).mul(2.0)), 0.5, 1.0);
        const fv = varying(f);
        m.fragmentNode = vec4(fv.x, fv.y, fv.z, 1.0);
        m.depthNode = nearerIsLess ? float(0.5).add(fv.z.mul(0.25)) : float(0.5).sub(fv.z.mul(0.25));
        const sc = new THREE.Scene(), mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; sc.add(mesh);
        return { sc, dispose: () => { g.dispose(); pg.dispose(); m.dispose(); } };
    };

    // ---- GATHER: each pixel with a vector samples `prev` backwards and `cur` forwards along it, in fetch4's order ----
    const fetch4 = (tex, x, y) => {
        const fx = floor(x), fy = floor(y), tx = x.sub(fx), ty = y.sub(fy);
        const x0 = clamp(fx, 0.0, u.w.sub(1.0)), x1 = clamp(fx.add(1.0), 0.0, u.w.sub(1.0));
        const y0 = clamp(fy, 0.0, u.h.sub(1.0)), y1 = clamp(fy.add(1.0), 0.0, u.h.sub(1.0));
        const at = (xx, yy) => textureLoad(tex, ivec2(int(xx), int(yy)));
        const itx = float(1.0).sub(tx);
        return at(x0, y0).mul(itx).add(at(x1, y0).mul(tx)).mul(float(1.0).sub(ty)).add(at(x0, y1).mul(itx).add(at(x1, y1).mul(tx)).mul(ty));
    };
    const gatherNode = (prevTex, curTex) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        const v = textureLoad(field.texture, ivec2(int(x), int(y)));
        const a = fetch4(prevTex, x.sub(u.t.mul(v.x)), y.sub(u.t.mul(v.y)));
        const b = fetch4(curTex, x.add(float(1.0).sub(u.t).mul(v.x)), y.add(float(1.0).sub(u.t).mul(v.y)));
        // a filled pixel's content may be in ONE frame only -- the side the fill decided; everything else blends.
        // *** THE WEIGHTS ARE ARITHMETIC, NOT select(), AND TWO DRAFTS SAY WHY. *** The first chose a vec4 with a select
        // nested in a select -- v4733's WebGL2 defect, and every WebGL2 frame came back as the target's clear colour. The
        // second chose SCALAR weights the same way and failed the same way, with a TSL build error on WebGL2 only
        // ("reading 'addToStack'"), so the draw never happened. For side codes 0, 1 and 2 these give exactly (1-t, t),
        // (1, 0) and (0, 1) -- every term is a product with an exact 0 or 1 -- so the blend is the mirror's a(1-t) + bt.
        let wa = float(1.0).sub(u.t), wb = u.t;
        if (sideT) {
            const sd = textureLoad(sideT.texture, ivec2(int(x), int(y))).x;
            const isB = clamp(float(1.0).sub(sd), 0.0, 1.0), isP = clamp(float(1.0).sub(abs(sd.sub(float(SIDE_PREV)))), 0.0, 1.0),
                  isC = clamp(sd.sub(float(SIDE_PREV)), 0.0, 1.0);
            wa = isB.mul(float(1.0).sub(u.t)).add(isP); wb = isB.mul(u.t).add(isC);
        }
        return select(v.w.lessThan(0.5), vec4(0.0), a.mul(wa).add(b.mul(wb)));   // a hole stays ZERO
    })();
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };

    const splats = new Map(), gathers = new Map();
    const fillScenes = fill ? { field: quad(fillN.fieldNode), side: quad(fillN.sideNode) } : null;
    const once = (map, key, make) => { if (!map.has(key)) map.set(key, make()); return map.get(key); };
    return {
        bw, bh, uniforms: u, targets: { vec: vecT, filled: filledT, side: sideT },
        /** Scatter `fieldTex` (bw x bh: vx, vy, depth, valid) into targets.vec, clearing it and its depth first. */
        async splat(renderer, fieldTex) {
            const s = once(splats, fieldTex, () => splatScene(fieldTex));
            const prev = renderer.getRenderTarget(), pc = new THREE.Color(), pa = renderer.getClearAlpha(); renderer.getClearColor(pc);
            renderer.setRenderTarget(vecT); renderer.setClearColor(0x000000, 0); await renderer.clearAsync();
            await renderer.renderAsync(s.sc, ortho);
            if (fillScenes) {
                renderer.setRenderTarget(filledT); await renderer.renderAsync(fillScenes.field, ortho);
                renderer.setRenderTarget(sideT); await renderer.renderAsync(fillScenes.side, ortho);
            }
            renderer.setClearColor(pc, pa); renderer.setRenderTarget(prev);
        },
        /** Warp `prevTex` and `curTex` along the splatted field into `output` (null for the canvas). */
        async gather(renderer, prevTex, curTex, output) {
            const sc = once(gathers, prevTex.uuid + "|" + curTex.uuid, () => quad(gatherNode(prevTex, curTex)));
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(output); await renderer.renderAsync(sc, ortho); renderer.setRenderTarget(prev);
        },
        dispose() { vecT.dispose(); depthTexture.dispose(); if (filledT) { filledT.dispose(); sideT.dispose(); } for (const s of splats.values()) s.dispose(); },
    };
}
