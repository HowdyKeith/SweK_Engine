// fx/fsr/fsrTemporalTsl.mjs -- v4731 -- FSR2'S CHAIN FOR A THREE.JS SCENE: the temporal passes of render/*Tsl.mjs
// composed in the order fsr.html runs them, driving a WebGPURenderer scene.
//
// Per frame, fsr.html's order (its dolly camera, the path with every pass on):
//   1. the scene at RENDER resolution through a JITTERED projection (render/jitter.mjs's Halton phase, applyJitter)
//   2. the motion field and clip depth at DISPLAY resolution through the unjittered camera (makeMotionStage)
//   3. DILATION of both (dilateNodes); the dilated depth is this frame's record, read as prevDepth next frame
//   4. the jitter-aware RESOLVE of step 1 to display resolution (resolveNode) -- "current"
//   5. the LOCK RING pushed with current and the dilated field, and its SHADING-SHIFT mask (makeLumaRing) -- OPTIONAL
//   6. the REACTIVE mask: current against last frame's history through the dilated field, depth-gated (reactiveNode)
//   7. DISOCCLUSION against last frame's record (disocclusionNode), and the three masks' HISTORY FACTOR
//   8. the RECTIFIED ACCUMULATE: history through the field, YCoCg-clamped to current, factor-weighted (accumulateNode)
//   9. RCAS on the accumulated history to the output (fx/fsr/fsrTsl.mjs's rcasNode) -- FSR2's final sharpen
// Every pass is graded against its CPU mirror in its own gate; fx/fsr/fsrTemporalTsl-selfcheck.mjs grades the
// COMPOSITION -- the whole chain run on the CPU from the device's renders, frame by frame, against the device.
//
// *** THE LOCK RING IS OFF BY DEFAULT, AND ITS COST IS WHY. *** Its period must be the jitter's phase count or the
// mask reads sampling as shading (fsr.html: "may not be chosen for cost"), which at 2x is 64 lumas a pixel: 265 MB of
// float at 960x540 across the ping-pong pair. render/temporalLock.mjs keeps every luma where FSR2 keeps a lock and a
// short history. `lock: true` turns it on and `memory` reports what it costs.
//
// *** THE THRESHOLD IS REQUIRED. *** disocclusionCPU and reactiveCPU both refuse a default -- a clip-z gap means a
// different distance at every depth -- so the caller passes one, typically render/temporalClipTsl.mjs's
// clipGapThreshold between the nearest surface that moves and the one behind it.
//
// COLOUR: the chain runs on the LINEAR values a three.js target holds, as fsr.html's runs on its own; the output goes
// through three's output transform when `output` is the canvas. RCAS's under- and overshoot are left to that clamp.
"use strict";
import { makeJitterState, jitterCurrent, advanceJitter, jitterPhaseCount } from "../../render/jitter.mjs";
import { applyJitter, restoreProjection, glClip, makeMotionStage, resolveNode, accumulateNode } from "../../render/temporalTsl.mjs";
import { dilateNodes, disocclusionNode, historyFactorNode } from "../../render/temporalClipTsl.mjs";
import { makeLumaRing } from "../../render/temporalLockTsl.mjs";
import { reactiveNode } from "../../render/reactiveTsl.mjs";
import { rcasNode } from "./fsrTsl.mjs";

/**
 * Build the chain. `ratio` is the upscale factor the jitter's phase count is taken at (displayWidth / renderWidth
 * unless given). Returns { render(scene, camera, output), targets, jitter, memory, frames, dispose }.
 */
export function makeFsrTemporal(THREE, TSL, renderer, { renderWidth, renderHeight, displayWidth, displayHeight, ratio = null,
                                                         threshold, alpha = 0.1, reactive = true, lock = false,
                                                         sharpness = 0.5, rcas = true, type = null } = {}) {
    if (!(threshold > 0)) throw new Error("fx/fsr/fsrTemporalTsl: threshold must be a positive clip-z gap -- see clipGapThreshold in render/temporalClipTsl.mjs");
    const rw = renderWidth, rh = renderHeight, dw = displayWidth, dh = displayHeight;
    const up = ratio == null ? dw / rw : ratio;
    const colType = type == null ? THREE.HalfFloatType : type;
    const flat = () => new THREE.RenderTarget(dw, dh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const col = () => new THREE.RenderTarget(dw, dh, { type: colType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const gl = glClip(THREE, renderer);
    const t = {
        colour: new THREE.RenderTarget(rw, rh, { type: colType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
        resolved: col(), dMotion: flat(), record: [flat(), flat()], disocclusion: flat(), reactive: reactive ? flat() : null,
        shading: lock ? flat() : null, factor: flat(), history: [col(), col()],
    };
    const stage = makeMotionStage(THREE, TSL, { w: dw, h: dh, gl });
    t.motion = stage.motion; t.depth = stage.depth;
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const dil = dilateNodes(TSL, stage.depth.texture, stage.motion.texture, { w: dw, h: dh });
    const res = resolveNode(TSL, t.colour.texture, { rw, rh, dw, dh });
    const period = jitterPhaseCount(up);
    const ring = lock ? makeLumaRing(THREE, TSL, { w: dw, h: dh, period, currentTex: t.resolved.texture, motionTex: t.dMotion.texture }) : null;
    // one graph per ping-pong direction: frame k writes record[k % 2] and history[k % 2] and reads the other two
    const rx = reactive ? [0, 1].map((k) => reactiveNode(TSL, { current: t.resolved.texture, history: t.history[1 - k].texture, motion: t.dMotion.texture, prevDepth: t.record[1 - k].texture },
                                                          { w: dw, h: dh, threshold })) : null;
    const dis = [0, 1].map((k) => disocclusionNode(TSL, t.dMotion.texture, t.record[1 - k].texture, { w: dw, h: dh, threshold }));
    const fac = historyFactorNode(TSL, { disocclusion: t.disocclusion.texture, reactive: reactive ? t.reactive.texture : null, shading: lock ? t.shading.texture : null });
    const acc = [0, 1].map((k) => accumulateNode(TSL, { current: t.resolved.texture, history: t.history[1 - k].texture, motion: t.dMotion.texture, factor: t.factor.texture }, { w: dw, h: dh, alpha }));
    const sharp = rcas ? [0, 1].map((k) => rcasNode(TSL, t.history[k].texture, { w: dw, h: dh, sharpness, transfer: "none" })) : null;
    const copy = [0, 1].map((k) => quad(TSL.textureLoad(t.history[k].texture, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)))));
    const sc = { dM: quad(dil.motionNode), dD: quad(dil.depthNode), res: quad(res.node), rx: rx ? rx.map((x) => quad(x.node)) : null,
                 dis: dis.map((x) => quad(x.node)), fac: quad(fac.node), acc: acc.map((x) => quad(x.node)), out: sharp ? sharp.map((x) => quad(x.node)) : copy };
    // *** THE RECORD STARTS AT THE FAR PLANE. *** Frame one's disocclusion reads a record nothing has written. Left as
    // zeros, every pixel is "nearer than expected" and flagged, the factor goes to 0 and the history is discarded --
    // right answer, wrong reason: hasHistory is what should decide frame one, and the gate's sabotage D11 (frame one
    // told it HAS a history) scored 0 RED behind that accident. Clip z 1 is the far plane in both conventions.
    const farScene = quad(TSL.vec4(1.0, 0.0, 0.0, 1.0));
    const jit = makeJitterState(up), base = new THREE.Matrix4();
    let frames = 0;
    const draw = async (scene, target) => { renderer.setRenderTarget(target); await renderer.renderAsync(scene, ortho); };
    const px = dw * dh, floatBytes = 16;
    return {
        targets: t, stage, ring, jitter: jit, period,
        uniforms: { resolve: res.uniforms, accumulate: acc.map((x) => x.uniforms), rcas: sharp ? sharp.map((x) => x.uniforms) : null, reactive: rx ? rx.map((x) => x.uniforms) : null },
        /** What the chain's float state costs in bytes, the ring separately because it is the part that is large. */
        memory: { ring: lock ? 2 * dw * dh * Math.ceil(2 * period / 4) * floatBytes + 2 * px * floatBytes : 0, period },
        get frames() { return frames; },
        /** This frame's jitter, as the colour pass will be offset by it -- [jx, jy] in render pixels. */
        get phase() { return jitterCurrent(jit); },
        async render(scene, camera, output = null) {
            const prev = renderer.getRenderTarget(), k = frames % 2, hist = frames > 0 ? 1 : 0;
            if (frames === 0) await draw(farScene, t.record[1]);
            camera.updateMatrixWorld(); base.copy(camera.projectionMatrix);
            const [jx, jy] = jitterCurrent(jit);
            applyJitter(camera, base, jx, jy, rw, rh);
            renderer.setRenderTarget(t.colour); await renderer.renderAsync(scene, camera);
            restoreProjection(camera, base);
            await stage.render(renderer, scene, camera);
            await draw(sc.dM, t.dMotion); await draw(sc.dD, t.record[k]);
            res.uniforms.jx.value = jx; res.uniforms.jy.value = jy; await draw(sc.res, t.resolved);
            if (ring) { await ring.push(renderer); await ring.shading(renderer, t.shading); }
            if (rx) { rx[k].uniforms.hasHistory.value = hist; await draw(sc.rx[k], t.reactive); }
            await draw(sc.dis[k], t.disocclusion);
            await draw(sc.fac, t.factor);
            acc[k].uniforms.hasHistory.value = hist; acc[k].uniforms.alpha.value = alpha; await draw(sc.acc[k], t.history[k]);
            await draw(sc.out[k], output);
            renderer.setRenderTarget(prev);
            frames++; advanceJitter(jit);
        },
        dispose() {
            stage.dispose(); if (ring) ring.dispose();
            for (const v of Object.values(t)) for (const x of [].concat(v)) if (x && x.dispose && x !== stage.motion && x !== stage.depth) x.dispose();
        },
    };
}
