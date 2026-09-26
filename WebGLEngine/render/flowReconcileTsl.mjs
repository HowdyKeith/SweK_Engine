// render/flowReconcileTsl.mjs -- v4741 -- WHICH OF TWO MOTION FIELDS TO BELIEVE, FOR A THREE.JS SCENE, AS TSL, TWO WAYS:
//   mode "block"  render/flowReconcile.mjs's reconcileFlowCPU -- FSR3's decision per block, the literal port -- and its
//                 decision applied per pixel (reconciledPixelFieldCPU)
//   mode "pixel"  reconcilePixelsCPU -- the decision per PIXEL, each pixel's own vector against its block's flow on the
//                 window about it; the default, and the reason is measured (below)
// Graded by render/flowReconcileTsl-selfcheck.mjs against all three mirrors on both of three's backends: every decision and
// every chosen vector exactly, the scores to f32.
//
// Per block, as the mirror: the application's vector is its NEAREST VALID pixel's (render/dilate.mjs's rule at block
// scale), both candidates are scored by a bilinear SAD of the block of `cur` against `prev` on the tree's luma, and the
// colour flow takes the block only by beating the application by `margin` -- STRICTLY, so on flat content, where every
// candidate scores the same, the application keeps it. A block with no valid vector at all is the flow's alone.
//
// ---- AND PER PIXEL, WHICH THE MIRROR DOES NOT HAVE AND THIS ROUND ADDED TO IT ----------------------------------------
// render/flowReconcile.mjs decides per BLOCK and returns a block field, and fx/fsr/fsrFrameGenTsl.mjs splats one vector a
// PIXEL: a three.js scene's motion field is exact at every pixel, and reducing it to 8 x 8 blocks to reconcile it would
// throw that away wherever the application is right, which is most of a scene. So the decision is taken per block and
// applied per pixel: a pixel in a block the application kept keeps ITS OWN vector (and its own validity); a pixel in a
// block the flow took takes the block's flow. reconciledPixelFieldCPU is that rule, in the mirror's module.
//
// *** AND THAT WAS MEASURED WORSE THAN NOT RECONCILING AT ALL, SO THE DEFAULT DECIDES PER PIXEL. *** On a knot turning over a
// wall whose texture scrolls (fx/fsr/fsrFrameGenFlow-selfcheck.mjs), a block straddling the silhouette holds two motions;
// its nearest pixel's vector is the knot's and cannot explain the wall, the flow takes the block, and its one vector -- the
// wall's -- overwrites knot pixels whose own vectors were exact. Per pixel, each pixel's window is scored with that pixel's
// own vector and with its block's flow, so a knot pixel keeps the knot's and a wall pixel takes the wall's. The block mode
// stays: it is FSR3's rule as the tree's mirror has it, and the measurement is only a measurement against it.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
import { SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY } from "./flowReconcile.mjs";

/**
 * The reconciler for w x h frames. reconcile(renderer, { lumaCur, lumaPrev, flow, motion, depth }) takes the two frames'
 * luma (x channel, render/opticalFlowTsl.mjs's pyramid level 0), the colour flow (bw x bh: fx, fy, conf, 1, forward),
 * the application's motion field (du, dv, valid, _) and the NEWER frame's depth, and writes targets.field, w x h:
 * (vx, vy, depth, valid), the splat's input. And, by mode:
 *   "pixel"  (radius, the window's; margin 0.9 unless given) with `audit`, targets.pixel, w x h: (source, sadApp, sadFlow,
 *            1) -- reconcilePixelsCPU
 *   "block"  (margin 0.05 unless given) targets.decision, bw x bh: (vx, vy, source, 1) -- reconcileFlowCPU's -- and with `audit`
 *            targets.app and .sad, bw x bh: (ax, ay, found, 1) and (sadApp, sadFlow, sadStill, 1); `nearerIsLess` is its
 */
export function makeFlowReconcile(THREE, TSL, { w, h, block = 8, margin = null, mode = "pixel", radius = 1, nearerIsLess = true, audit = false }) {
    requireTsl(TSL);
    // each mode's own mirror's default: 0.05 per block (reconcileFlowCPU), 0.9 per pixel (reconcilePixelsCPU, which says why)
    if (margin === null) margin = mode === "block" ? 0.05 : 0.9;
    if (!(block >= 2) || block !== Math.floor(block)) throw new Error(`render/flowReconcileTsl: block must be a whole number of pixels, at least 2 -- got ${block}`);
    if (!(margin >= 0) || !(margin < 1)) throw new Error(`render/flowReconcileTsl: margin must be in [0, 1) -- got ${margin}`);
    if (mode !== "pixel" && mode !== "block") throw new Error(`render/flowReconcileTsl: mode must be "pixel" or "block" -- got ${JSON.stringify(mode)}`);
    if (!(radius >= 0) || radius !== Math.floor(radius) || radius > 4) throw new Error(`render/flowReconcileTsl: radius must be a whole number of pixels from 0 to 4 -- got ${radius}`);
    const { Fn, Loop, float, int, vec4, ivec2, textureLoad, screenCoordinate, clamp, floor, abs, select } = TSL;
    const bw = Math.ceil(w / block), bh = Math.ceil(h / block), n = block;
    const rt = (tw, th) => new THREE.RenderTarget(tw, th, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const targets = { field: rt(w, h) };
    if (mode === "block") { targets.decision = rt(bw, bh); if (audit) { targets.app = rt(bw, bh); targets.sad = rt(bw, bh); } }
    else if (audit) targets.pixel = rt(w, h);
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pick = (a, b, k) => a.mul(float(1.0).sub(k)).add(b.mul(k));                  // exactly a at k = 0 and b at k = 1
    const ld = (tex, x, y) => textureLoad(tex, ivec2(int(clamp(x, 0.0, float(w - 1))), int(clamp(y, 0.0, float(h - 1)))));

    // sadAt: the k x k window of `cur` at the integer (ox, oy) against `prev` bilinearly at (sx, sy), edges clamped, the
    // mirror's order -- y outer, x inner -- and its lerp: (b00 (1 - tx) + b10 tx) (1 - ty) + (b01 (1 - tx) + b11 tx) ty
    const sadAt = (I, ox, oy, sx, sy, k) => {
        const fx = floor(sx), fy = floor(sy), tx = sx.sub(fx), ty = sy.sub(fy), s = float(0.0).toVar();
        Loop({ start: int(0), end: int(k * k), type: "int", condition: "<", name: "p" }, ({ p }) => {
            const yy = float(p.div(k)), xx = float(p.sub(p.div(k).mul(k)));
            const av = ld(I.lumaCur, ox.add(xx), oy.add(yy)).x;
            const b00 = ld(I.lumaPrev, fx.add(xx), fy.add(yy)).x, b10 = ld(I.lumaPrev, fx.add(xx).add(1.0), fy.add(yy)).x;
            const b01 = ld(I.lumaPrev, fx.add(xx), fy.add(yy).add(1.0)).x, b11 = ld(I.lumaPrev, fx.add(xx).add(1.0), fy.add(yy).add(1.0)).x;
            const bv = b00.mul(float(1.0).sub(tx)).add(b10.mul(tx)).mul(float(1.0).sub(ty)).add(b01.mul(float(1.0).sub(tx)).add(b11.mul(tx)).mul(ty));
            s.addAssign(abs(av.sub(bv)));
        });
        return s;
    };

    // one block's whole decision, and `which` of its four readouts
    const blockNode = (I, which) => Fn(() => {
        const bx = floor(screenCoordinate.x), by = floor(screenCoordinate.y), ox = bx.mul(block), oy = by.mul(block);
        const sadAtB = (sx, sy) => sadAt(I, ox, oy, sx, sy, n);
        // the application's vector: the block's nearest VALID pixel's, the first found on a tie, pixels past the frame's
        // edge not in the block at all
        const found = float(0.0).toVar(), bestD = float(0.0).toVar(), mx = float(0.0).toVar(), my = float(0.0).toVar();
        Loop({ start: int(0), end: int(n * n), type: "int", condition: "<", name: "q" }, ({ q }) => {
            const x = ox.add(float(q.sub(q.div(n).mul(n)))), y = oy.add(float(q.div(n)));
            const m = ld(I.motion, x, y), d = ld(I.depth, x, y).x;
            const inside = x.lessThan(float(w)).and(y.lessThan(float(h)));
            const nearer = nearerIsLess ? d.lessThan(bestD) : d.greaterThan(bestD);
            const take = inside.and(m.z.notEqual(0.0)).and(found.equal(0.0).or(nearer));
            mx.assign(select(take, m.x, mx)); my.assign(select(take, m.y, my)); bestD.assign(select(take, d, bestD)); found.assign(select(take, float(1.0), found));
        });
        const f = textureLoad(I.flow, ivec2(int(bx), int(by)));
        const ax = mx.negate().mul(float(w)), ay = my.negate().mul(float(h));           // THE ONE NEGATION: uv cur -> prev, to pixels prev -> cur
        // the search's sense is the negative of the output's, so a forward vector v scores at -v
        const sadFlow = sadAtB(ox.sub(f.x), oy.sub(f.y)), sadStill = sadAtB(ox, oy), sadApp = sadAtB(ox.sub(ax), oy.sub(ay));
        const beat = sadFlow.lessThan(sadApp.mul(1.0 - margin));                    // STRICTLY: a tie is the application's
        const src = select(found.equal(0.0), float(SRC_FLOW_ONLY), select(beat, float(SRC_FLOW_BEAT), float(SRC_APP)));
        // the chosen vector by an arithmetic weight -- v4737 found a select between two vec4s failing on WebGL2 -- and
        // written out, a (1 - k) + b k, because mix() is x + (y - x) k on a backend that likes it, and x + (y - x) is not
        // y: the first draft's mix() missed the application's vector by an ulp at 244 of 576 blocks. With k exactly 0 or 1
        // and both finite, the sum below is one of them exactly.
        const isApp = select(src.equal(float(SRC_APP)), float(1.0), float(0.0));
        if (which === "decision") return vec4(pick(f.x, ax, isApp), pick(f.y, ay, isApp), src, 1.0);
        if (which === "app") return vec4(ax, ay, found, 1.0);
        return vec4(sadApp, sadFlow, sadStill, 1.0);
    })();

    // per pixel: the pixel's own vector where its block kept the application's, the block's flow where the flow took it
    const fieldNode = (I) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), at = ivec2(int(x), int(y));
        const dec = textureLoad(targets.decision.texture, ivec2(int(floor(x.div(block))), int(floor(y.div(block)))));
        const m = textureLoad(I.motion, at), d = textureLoad(I.depth, at).x;
        const isApp = select(dec.z.equal(float(SRC_APP)), float(1.0), float(0.0)), valid = select(m.z.equal(0.0), float(0.0), float(1.0));
        return vec4(pick(dec.x, m.x.negate().mul(float(w)), isApp), pick(dec.y, m.y.negate().mul(float(h)), isApp), d, pick(float(1.0), valid, isApp));
    })();

    // per pixel, reconcilePixelsCPU: the pixel's own vector against its block's flow, each scored on the window about it
    const pixelNode = (I, which) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), at = ivec2(int(x), int(y)), k = 2 * radius + 1;
        const ox = x.sub(radius), oy = y.sub(radius);
        const f = textureLoad(I.flow, ivec2(int(floor(x.div(block))), int(floor(y.div(block))))), m = textureLoad(I.motion, at), d = textureLoad(I.depth, at).x;
        const ax = m.x.negate().mul(float(w)), ay = m.y.negate().mul(float(h));           // THE ONE NEGATION
        const sadFlow = sadAt(I, ox, oy, ox.sub(f.x), oy.sub(f.y), k), sadApp = sadAt(I, ox, oy, ox.sub(ax), oy.sub(ay), k);
        // and only where the window, carried back along the flow, was inside `prev` -- evidence from past the frame's edge is
        // a comparison with the clamped edge (reconcilePixelsCPU's note)
        const sx = ox.sub(f.x), sy = oy.sub(f.y);
        const seen = sx.greaterThanEqual(0.0).and(sy.greaterThanEqual(0.0)).and(sx.add(k).lessThanEqual(float(w - 1))).and(sy.add(k).lessThanEqual(float(h - 1)));
        const beat = seen.and(sadFlow.lessThan(sadApp.mul(1.0 - margin)));          // STRICTLY: a tie is the application's
        const src = select(m.z.equal(0.0), float(SRC_FLOW_ONLY), select(beat, float(SRC_FLOW_BEAT), float(SRC_APP)));
        const isApp = select(src.equal(float(SRC_APP)), float(1.0), float(0.0));
        if (which === "field") return vec4(pick(f.x, ax, isApp), pick(f.y, ay, isApp), d, 1.0);
        return vec4(src, sadApp, sadFlow, 1.0);
    })();

    const scenes = new Map();
    const keyOf = (I) => [I.lumaCur, I.lumaPrev, I.flow, I.motion, I.depth].map((t) => t.uuid).join("|");
    return {
        bw, bh, block, margin, mode, targets,
        async reconcile(renderer, inputs) {
            for (const k of ["lumaCur", "lumaPrev", "flow", "motion", "depth"]) if (!inputs[k]) throw new Error(`render/flowReconcileTsl: reconcile needs ${k}`);
            const key = keyOf(inputs);
            if (!scenes.has(key)) scenes.set(key, mode === "block"
                ? { decision: quad(blockNode(inputs, "decision")), field: quad(fieldNode(inputs)),
                    app: audit ? quad(blockNode(inputs, "app")) : null, sad: audit ? quad(blockNode(inputs, "sad")) : null }
                : { field: quad(pixelNode(inputs, "field")), pixel: audit ? quad(pixelNode(inputs, "pixel")) : null });
            const sc = scenes.get(key), keep = renderer.getRenderTarget();
            for (const k of ["decision", "app", "sad", "field", "pixel"]) if (sc[k]) { renderer.setRenderTarget(targets[k]); await renderer.renderAsync(sc[k], ortho); }
            renderer.setRenderTarget(keep);
        },
        dispose() { for (const t of Object.values(targets)) t.dispose(); },
    };
}
