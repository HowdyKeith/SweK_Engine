// fx/fsr/fsrTemporalTsl.mjs -- v4731, v4732 -- FSR2'S CHAIN FOR A THREE.JS SCENE: the temporal passes of render/*Tsl.mjs
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
//   8. LOCK LIFE -- OPTIONAL, v4732: candidates (a ridge test over this frame's luma, or over the ring's jitter-free
//      mean), advanced through the dilated field and killed by this frame's disocclusion, and their RELAXATION
//      (render/temporalLockTsl.mjs's makeLockLife) -- the order render/temporalLock-selfcheck.mjs drives the CPU in
//   9. the RECTIFIED ACCUMULATE: history through the field, YCoCg-clamped to current -- the clamp relaxed where a lock
//      holds -- factor-weighted (accumulateNode)
//  10. RCAS on the accumulated history to the output (fx/fsr/fsrTsl.mjs's rcasNode) -- FSR2's final sharpen
// Every pass is graded against its CPU mirror in its own gate; fx/fsr/fsrTemporalTsl-selfcheck.mjs grades the
// COMPOSITION -- the whole chain run on the CPU from the device's renders, frame by frame, against the device.
//
// *** THE LOCK RING WAS OFF BY DEFAULT, AND ITS COST WAS WHY. *** Its period must be the jitter's phase count or the
// mask reads sampling as shading (fsr.html: "may not be chosen for cost"), which at 2x is 64 lumas a pixel: 265 MB of
// float at 960x540 across the ping-pong pair. render/temporalLock.mjs keeps every luma where FSR2 keeps a lock and a
// short history. `lock: true` (or "ring") builds it and `memory` reports what it costs.
// *** THE DEFAULT IS NOW THE SUMS (`lock: "sums"`), AND WHAT IT BUYS WAS MEASURED BEFORE IT WAS MADE ONE. *** On
// fsr-three.html's scene at 2x, 128 frames, PSNR against a 4x4-supersampled render every 4th frame from 64 (the mask
// is unknown everywhere before 63): still -- the same picture to the bit, the mask never fires; the knot turning,
// +0.014 dB; a slow pan, -0.006; the knot's light dropped to 55%, -0.010; dimmed to 85%, -0.005; pulsing 15% with a
// period near the jitter's, nothing, because a whole window averages the pulse out. The clamp and the reactive mask
// already discard what the shading mask would, so on this scene it is NEUTRAL -- the default costs 16.6 MB at 960x540
// and two full-screen passes a frame for it, and render/temporalLockSumsTsl-selfcheck.mjs section 4 holds the still
// picture's identity and that the mask is live. `lock: false` is the chain without it. *** NOTHING ELSE IN THE TREE
// COULD SEE THE CHANGE: *** every quality gate runs 24-40 frames at 2x, inside the sums' 63-frame warm-up, and all
// twenty-two gates that build this driver read the same output to the digit with either default.
// *** AND A SMALLER MASK SCALE IS WORSE, NOT BETTER -- MEASURED SO IT IS NOT TRIED AGAIN. *** The lock gates run the
// mask at scale 0.25 where this driver leaves it at 1, so the same scene and cases were run at 1, 0.5, 0.25 and 0.125
// (dB against no lock, frames 64-127): knot turning +0.013 / -0.020 / -0.155 / -0.340, slow pan -0.006 / -0.045 /
// -0.166 / -0.426, light to 55% -0.010 / -0.024 / -0.065 / -0.189, dimmed to 85% -0.005 / -0.011 / -0.026 / -0.064;
// still and the pulse unchanged. Worse at every step, including the light changes the mask exists for, and the ring at
// 0.25 is no better (turning -0.144, light to 55% -0.129). Two reasons, both the mask's and not the sums': moving, it
// reads reprojection blur on the floor's stripes as light (4904 of 16384 pixels firing at 0.25 with the knot turning,
// 3038 at 1), and each pixel it fires on drops toward one jittered frame; after a real change it stays on for about
// two periods, while its windows straddle the change, though the clamp removed the ghost within a frame or two -- so it
// mostly discards good history for ~60 frames. Scale 1 is the least harmful setting measured, and it is neutral.
//
// *** `lock: "sums"` IS THE SAME TWO WINDOWS IN ONE TEXEL A PIXEL. *** render/temporalLockSums.mjs's makeLumaSums keeps
// each window's running sum instead of its lumas: 16.6 MB at 960x540 at any ratio. At a period boundary the sums ARE
// the ring's two halves summed (bilinear reprojection is linear), so the mean and the mask agree with the ring's there
// to f32 rounding; between boundaries the sums' windows have not moved, so a light change is reported up to P - 1
// frames late. render/temporalLockSums-selfcheck.mjs holds both. `lockFrom: "ring"` reads whichever history `lock`
// built -- the ring's newer period, or the sums' last closed one.
// *** AND AT 2x THE RING DOES NOT FIT IN A TEXTURE. *** It packs ceil(2P/4) slices down one target: 16 at 2x, so 540
// rows become 8640, past the 8192 WebGPU allowed here -- fsr-three.html's lock ring at 2x drew validation errors on
// every frame, measured when the sums were built, and it does on the unmodified page too. The sums are one slice at
// every ratio. *** SO THE RING IS REFUSED WHERE IT CANNOT EXIST *** (ringFitsDevice, below): the driver reads the
// device's own 2D texture limit -- maxTextureDimension2D on WebGPU, MAX_TEXTURE_SIZE on WebGL2 -- and throws before
// allocating anything, naming the size, the limit and "sums". A device that does not say is not refused.
//
// *** LOCKS ARE `lockFrom`, AND WHAT THEY BUY IS THE CONTENT'S. *** null (no locks), "frame" (newLocksCPU: the ridge test
// over this frame's resolved luma, which needs no ring) or "ring" (lockCandidatesFromRing: over the ring's mean, which
// needs `lock: true`). v4732 measured the chain on the CPU from device renders: on fsr-three.html's own scene no clamp
// at all moves the still picture 0.013 dB, so there is nothing for a lock to recover; on wires 0.4 render pixels wide
// the ring's locks buy 1.09 dB. fx/fsr/fsrTemporalLocks-selfcheck.mjs holds that on the device, and the DEFAULTS are
// its rows': "frame", because it buys most of what the ring's locks do (0.97 of 1.12 dB on still wires, and MORE than
// them once the wires move) without the ring's 64 slots a pixel, and costs 0.03 dB at worst where there is nothing
// thin; and a life of 8 frames, the knee -- a life of 32 buys 0.14 dB more on the wires and costs three times as much
// on the fast-turning knot, where a lock outlives the ridge it was set on. `lockFrom: null` is the chain without locks.
// *** THE DEFAULT IS SAFE BECAUSE OF THE MASKS, AND ONLY WITH BOTH. *** On a pixel-scale chequer every cell is a ridge
// and the frame's locks hold the clamp open on 70% of the picture; with a box sliding across it and only the clamp
// between the history and a ghost, they cost the uncovered trail 0.94 dB. As shipped they move it +0.09 -- the depth
// clip and the reactive mask discard the trail's history before the relaxation can let it through, and taking either
// away leaves a cost (fx/fsr/fsrTemporalLockGhost-selfcheck.mjs). A caller turning `reactive` off turns that off too.
// The instability kill (advanceLocks' instabilityKill) is not wired: its default is off.
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
import { makeLumaRing, makeLockLife, ridgesNode, newLocksNode } from "../../render/temporalLockTsl.mjs";
import { makeLumaSums } from "../../render/temporalLockSumsTsl.mjs";
import { reactiveNode } from "../../render/reactiveTsl.mjs";
import { rcasNode } from "./fsrTsl.mjs";

/**
 * *** v4778 RIG RUN 5 -- HOW THIS RENDERER WRITES HALF. *** makeFsrTemporal's colour targets default to HalfFloatType, and
 * how a device rounds into them is not one rule: SwiftShader rounds to nearest even, Direct3D (WebGL2 through ANGLE D3D11,
 * WebGPU through Dawn D3D12) toward zero. Renders `values` into a one-row HalfFloatType target, one per texel, and returns
 * the raw binary16 words; text/slugAtlas.js's halfRuleOf names the rule from HALF_PROBE_VALUES' words. One row, so WebGPU's
 * 256-byte row padding never applies and WebGL2's flipped rows are the same row.
 *
 * A SUM OF ONE-LEVEL SELECTS, each its value at its own texel and 0 elsewhere -- adding zeros is exact in f32. Nested
 * selects are the obvious spelling, and the WebGL2 backend's node builder throws on them in this three.js ("Cannot read
 * properties of undefined (reading 'addToStack')"): the target was never written and the probe read six zeros.
 */
export async function probeHalfWrite(THREE, TSL, renderer, values) {
    const n = values.length;
    const rt = new THREE.RenderTarget(n, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const x = TSL.int(TSL.screenCoordinate.x);
    let v = TSL.float(0);
    for (let i = 0; i < n; i++) v = v.add(TSL.select(x.equal(TSL.int(i)), TSL.float(values[i]), TSL.float(0)));
    const m = new THREE.NodeMaterial(); m.fragmentNode = TSL.vec4(v, v, v, 1); m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); await renderer.renderAsync(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(was);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, n, 1);
    rt.dispose(); m.dispose();
    return Array.from({ length: n }, (_, i) => px[i * 4]);
}

/**
 * The largest 2D texture `renderer`'s device allows, or null when it does not say -- read from three's backend as
 * WebGPU (device.limits.maxTextureDimension2D) and WebGL2 (MAX_TEXTURE_SIZE) expose it. Call after renderer.init().
 */
export function maxTexture2D(renderer) {
    const b = renderer && renderer.backend;
    const lim = b && b.device && b.device.limits ? b.device.limits.maxTextureDimension2D : null;
    if (lim > 0) return lim;
    const gl = b && b.gl;
    if (gl && typeof gl.getParameter === "function") { const v = gl.getParameter(gl.MAX_TEXTURE_SIZE); if (v > 0) return v; }
    return null;
}

/** Whether the lock RING's packed target -- w wide, h * ceil(2 * period / 4) tall -- fits a texture of side `limit`. */
export function ringFitsDevice(w, h, period, limit) {
    const rows = h * Math.ceil(2 * period / 4);
    return { rows, fits: limit == null || (w <= limit && rows <= limit) };
}

/**
 * Build the chain. `ratio` is the upscale factor the jitter's phase count is taken at (displayWidth / renderWidth
 * unless given). Returns { render(scene, camera, output), targets, jitter, memory, frames, dispose }.
 */
export function makeFsrTemporal(THREE, TSL, renderer, { renderWidth, renderHeight, displayWidth, displayHeight, ratio = null,
                                                         threshold, alpha = 0.1, reactive = true, lock = "sums",
                                                         lockFrom = "frame", lockLife = 8, lockMargin = 0.05,
                                                         sharpness = 0.5, rcas = true, type = null, cameraMotion = false } = {}) {
    if (!(threshold > 0)) throw new Error("fx/fsr/fsrTemporalTsl: threshold must be a positive clip-z gap -- see clipGapThreshold in render/temporalClipTsl.mjs");
    if (![null, "frame", "ring"].includes(lockFrom)) throw new Error(`fx/fsr/fsrTemporalTsl: lockFrom must be null, "frame" or "ring" -- got ${JSON.stringify(lockFrom)}`);
    if (![false, true, "ring", "sums"].includes(lock)) throw new Error(`fx/fsr/fsrTemporalTsl: lock must be false, true (the ring), "ring" or "sums" -- got ${JSON.stringify(lock)}`);
    if (lockFrom === "ring" && !lock) throw new Error('fx/fsr/fsrTemporalTsl: lockFrom "ring" reads the lock ring, which is what lock: true builds -- pass it, or lockFrom "frame", which needs no ring');
    const history = lock === "sums" ? "sums" : lock ? "ring" : null;
    const rw = renderWidth, rh = renderHeight, dw = displayWidth, dh = displayHeight;
    const up = ratio == null ? dw / rw : ratio;
    if (history === "ring") {
        const limit = maxTexture2D(renderer), fit = ringFitsDevice(dw, dh, jitterPhaseCount(up), limit);
        if (!fit.fits) throw new Error(`fx/fsr/fsrTemporalTsl: the lock ring at ${up}x packs into a ${dw}x${fit.rows} target, past this device's ${limit} -- lock "sums" keeps the same two windows in one texel a pixel at any ratio`);
    }
    const colType = type == null ? THREE.HalfFloatType : type;
    const flat = () => new THREE.RenderTarget(dw, dh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const col = () => new THREE.RenderTarget(dw, dh, { type: colType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const gl = glClip(THREE, renderer);
    const t = {
        colour: new THREE.RenderTarget(rw, rh, { type: colType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
        resolved: col(), dMotion: flat(), record: [flat(), flat()], disocclusion: flat(), reactive: reactive ? flat() : null,
        shading: lock ? flat() : null, factor: flat(), history: [col(), col()],
        candidates: lockFrom ? flat() : null, lumaMean: lockFrom === "ring" ? flat() : null, relax: lockFrom ? flat() : null,
    };
    // v4750: `cameraMotion` also renders the camera's own motion (stage.camera) -- fx/fsr/fsr3Tsl.mjs asks for it when its
    // generator reconciles with the optical flow, for the world-still test
    const stage = makeMotionStage(THREE, TSL, { w: dw, h: dh, gl, camera: cameraMotion });
    t.motion = stage.motion; t.depth = stage.depth;
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const dil = dilateNodes(TSL, stage.depth.texture, stage.motion.texture, { w: dw, h: dh });
    const res = resolveNode(TSL, t.colour.texture, { rw, rh, dw, dh });
    const period = jitterPhaseCount(up);
    const ring = !history ? null : (history === "sums" ? makeLumaSums : makeLumaRing)(THREE, TSL, { w: dw, h: dh, period, currentTex: t.resolved.texture, motionTex: t.dMotion.texture });
    // one graph per ping-pong direction: frame k writes record[k % 2] and history[k % 2] and reads the other two
    const rx = reactive ? [0, 1].map((k) => reactiveNode(TSL, { current: t.resolved.texture, history: t.history[1 - k].texture, motion: t.dMotion.texture, prevDepth: t.record[1 - k].texture },
                                                          { w: dw, h: dh, threshold })) : null;
    const dis = [0, 1].map((k) => disocclusionNode(TSL, t.dMotion.texture, t.record[1 - k].texture, { w: dw, h: dh, threshold }));
    const fac = historyFactorNode(TSL, { disocclusion: t.disocclusion.texture, reactive: reactive ? t.reactive.texture : null, shading: lock ? t.shading.texture : null });
    const cand = lockFrom === "ring" ? ridgesNode(TSL, t.lumaMean.texture, { w: dw, h: dh, margin: lockMargin })
               : lockFrom === "frame" ? newLocksNode(TSL, t.resolved.texture, { w: dw, h: dh, margin: lockMargin }) : null;
    const locks = lockFrom ? makeLockLife(THREE, TSL, { w: dw, h: dh, motionTex: t.dMotion.texture, candidatesTex: t.candidates.texture,
                                                        disocclusionTex: t.disocclusion.texture, life: lockLife }) : null;
    const acc = [0, 1].map((k) => accumulateNode(TSL, { current: t.resolved.texture, history: t.history[1 - k].texture, motion: t.dMotion.texture, factor: t.factor.texture,
                                                        relax: lockFrom ? t.relax.texture : null }, { w: dw, h: dh, alpha }));
    const sharp = rcas ? [0, 1].map((k) => rcasNode(TSL, t.history[k].texture, { w: dw, h: dh, sharpness, transfer: "none" })) : null;
    const copy = [0, 1].map((k) => quad(TSL.textureLoad(t.history[k].texture, TSL.ivec2(TSL.int(TSL.screenCoordinate.x), TSL.int(TSL.screenCoordinate.y)))));
    const sc = { dM: quad(dil.motionNode), dD: quad(dil.depthNode), res: quad(res.node), rx: rx ? rx.map((x) => quad(x.node)) : null,
                 dis: dis.map((x) => quad(x.node)), fac: quad(fac.node), acc: acc.map((x) => quad(x.node)), out: sharp ? sharp.map((x) => quad(x.node)) : copy,
                 cand: cand ? quad(cand.node) : null };
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
        targets: t, stage, ring, history, locks, lockFrom, jitter: jit, period,
        uniforms: { resolve: res.uniforms, accumulate: acc.map((x) => x.uniforms), rcas: sharp ? sharp.map((x) => x.uniforms) : null, reactive: rx ? rx.map((x) => x.uniforms) : null,
                    candidates: cand ? cand.uniforms : null },
        /** What the chain's float state costs in bytes, the lock history (`ring`, whichever `lock` built) separately because it can be large. */
        memory: { ring: history === "ring" ? 2 * dw * dh * Math.ceil(2 * period / 4) * floatBytes + 2 * px * floatBytes : history === "sums" ? 2 * px * floatBytes : 0, period, history,
                  locks: lockFrom ? (lockFrom === "ring" ? 5 : 4) * px * floatBytes : 0 },
        get frames() { return frames; },
        /** This frame's jitter, as the colour pass will be offset by it -- [jx, jy] in render pixels. */
        get phase() { return jitterCurrent(jit); },
        async render(scene, camera, output = null) {
            const prev = renderer.getRenderTarget(), k = frames % 2, hist = frames > 0 ? 1 : 0;
            if (frames === 0) await draw(farScene, t.record[1]);
            // *** THE CAMERA IN THE RENDERER'S COORDINATE SYSTEM BEFORE ITS PROJECTION IS READ. *** three switches a camera
            // to WebGPU's clip convention (z in [0, 1]) the first time a WebGPU renderer draws it, and rebuilds its projection
            // there -- inside the colour pass below, AFTER this driver had copied the old matrix and jittered it. So frame 0
            // was drawn UNJITTERED (0.93 from its period's twin, the same phase; the shading mask read it as a light change
            // for two periods), and restoreProjection then wrote the WebGL-convention matrix back onto a camera already
            // marked WebGPU, which three never rebuilds again: every later frame on WebGPU was drawn with z in [-1, 1]
            // (elements 10/14 -1.0040/-0.2004 where WebGPU's are -1.0020/-0.1002). WebGL2 was never affected. Measured in the
            // lock-sums round; render/temporalLockSumsTsl-selfcheck.mjs and fx/fsr/fsrTemporalTsl-selfcheck.mjs hold both.
            if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateProjectionMatrix(); }
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
            if (locks) {
                if (lockFrom === "ring") await ring.mean(renderer, t.lumaMean);
                await draw(sc.cand, t.candidates); await locks.advance(renderer); await locks.relaxation(renderer, t.relax);
            }
            acc[k].uniforms.hasHistory.value = hist; acc[k].uniforms.alpha.value = alpha; await draw(sc.acc[k], t.history[k]);
            await draw(sc.out[k], output);
            renderer.setRenderTarget(prev);
            frames++; advanceJitter(jit);
        },
        dispose() {
            stage.dispose(); if (ring) ring.dispose(); if (locks) locks.dispose();
            for (const v of Object.values(t)) for (const x of [].concat(v)) if (x && x.dispose && x !== stage.motion && x !== stage.depth) x.dispose();
        },
    };
}
