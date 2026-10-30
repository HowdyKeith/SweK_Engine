// WebGLEngine/render/temporalLive.mjs -- path-tracer.html's temporal view (backlog fsr4-temporal-page, section 163)
//
// Round 70's chain, live: the camera orbits a scene a step a frame; each real frame is traced at half size on round 32's jitter,
// through the shipped denoiser, the emitter fill and EASU (liveFrame); the last FRAMES of them are accumulated into Bt and U_T's
// input exactly as round 70's examples were (liveExample, held bit for bit to temporalExample by the gate); and U_T corrects Bt --
// on the page's WebGPU device (render/learnedUpscaleTemporalGPU.mjs) where it has one, else here on the CPU (temporalChain).
// A sliding window: frame k's example is frames k - 7 .. k, so each has the eight jitter phases round 70 trained on.
// Gated by render/temporalLive-selfcheck.mjs. Pure: the worker (render/temporalLive-worker.mjs) and the page are wiring over it.
"use strict";
import { render, cameraBasis } from "../physics/render/pathTracer.mjs";
import { makeScene, guideBuffers, inputChannels } from "./denoiseScenes.mjs";
import { emitterCoverage, emitterRadiance, withMask } from "./denoiseMask.mjs";
import { FRAMES, firstHits } from "./denoiseTemporal.mjs";
import { JITTER, accumulateUpscaled, shiftResample, halfShift } from "./denoiseTemporalUpscale.mjs";
import { upscale, fillEmitters, compositeEmitters } from "./denoiseUpscale.mjs";
import { denoise } from "./denoiseNet.mjs";
import { temporalInput, temporalChain } from "./learnedUpscaleTemporal.mjs";
import { orbitEye } from "./frameGenLive.mjs";

/** The view's defaults: 128 x 128 (64 x 64 traced), 4 samples, 2.5 degrees a frame (round 32's orbit steps 1.5-4), a non-dataset scene. */
export const LIVE_T = Object.freeze({ W: 128, sppIn: 4, stepDeg: 2.5, family: "R", seed: 990990, seedBase: 4e7, net: "render/denoise-net-r11.json", ut: "render/upscale-net-r70.json" });

/**
 * One real frame of the chain: the scene from `eye` at half size, at `sppIn` samples with render seed `seed`, its grid shifted by
 * `jitter`, through the shipped network `net`, the emitter fill and EASU to W x W; with that eye's first hits at full size, which
 * the accumulation reprojects through. { eye, y, shift, input, cov, geo }.
 */
export function liveFrame(S, net, { eye, jitter, seed, W, sppIn }) {
    const w = W / 2, Sf = { ...S, eye };
    const input = render(S.scene, { w, h: w, spp: sppIn, seed, rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: jitter });
    const g = guideBuffers(Sf, w, w, jitter), cov = emitterCoverage(Sf, w, w, jitter);
    const den = denoise(net, withMask(inputChannels(input, g.albedo, g.normal, w, w), cov), w, w).y;
    return { eye, input, cov, y: upscale(fillEmitters(den, cov, w, w), w, w, W, W, "easu"), shift: halfShift(jitter), geo: firstHits(S, eye, W, W) };
}

/**
 * U_T's example from the last FRAMES real frames (oldest first), as round 70's temporalExample builds one: Bt's light accumulated
 * clamped and unclamped, the newest frame's EASU unjittered, the history length, the newest eye's guides and depth, and the
 * light sources from there. { W, H, x, cov, E, bt, b1 }.
 */
export function liveExample(S, frames, W) {
    if (frames.length !== FRAMES) throw new Error(`temporalLive: an example is ${FRAMES} frames -- got ${frames.length}`);
    const H = W, geo = frames.map((f) => f.geo), acc = accumulateUpscaled(frames, geo, W, H), Au = accumulateUpscaled(frames, geo, W, H, { clamp: false }).A;
    const last = frames[FRAMES - 1], Sl = { ...S, eye: last.eye }, C = shiftResample(last.y, W, H, ...last.shift);
    const g = guideBuffers(Sl, W, H), B = cameraBasis(Sl), hits = last.geo, depth = new Float64Array(W * H).fill(1e9);
    for (let p = 0; p < W * H; p++) if (hits.obj[p] >= 0) depth[p] = (hits.pos[p * 3] - last.eye[0]) * B.fwd[0] + (hits.pos[p * 3 + 1] - last.eye[1]) * B.fwd[1] + (hits.pos[p * 3 + 2] - last.eye[2]) * B.fwd[2];
    const full = emitterRadiance(Sl, W, H);
    return { W, H, x: temporalInput(acc.A, Au, C, acc.n, g.albedo, g.normal, depth, W, H), cov: full.cov, E: full.E, bt: compositeEmitters(acc.A, full), b1: compositeEmitters(C, full) };
}

/** The live orbit's frame k: its eye (orbitEye, k steps round), its jitter (round 32's, k mod 8) and its render seed. */
export const liveFrameSpec = (S, k, { stepDeg = LIVE_T.stepDeg, seedBase = LIVE_T.seedBase } = {}) => ({ eye: orbitEye(S, k * stepDeg), jitter: JITTER[k % FRAMES], seed: seedBase + k });

/**
 * The worker's state machine, pure: makeLiveState({ family, seed, W, sppIn, stepDeg, net, ut }) then step(state, k) traces frame k
 * (they must come in order), keeps the last FRAMES, and once it has them returns the example -- with U_T's chain on the CPU when
 * `cpuUT` (the page's fallback). Each step's ms are returned beside it.
 */
export function makeLiveState({ family = LIVE_T.family, seed = LIVE_T.seed, W = LIVE_T.W, sppIn = LIVE_T.sppIn, stepDeg = LIVE_T.stepDeg, net, ut = null }) {
    if (!net) throw new Error("temporalLive: the live view needs the shipped denoiser");
    if (W % 2) throw new Error(`temporalLive: a ${W} x ${W} frame has no half size`);
    return { S: makeScene(family, seed), W, sppIn, stepDeg, net, ut, frames: [], next: 0 };
}
export function liveStep(state, k, { cpuUT = false, now = () => (globalThis.performance ?? Date).now() } = {}) {
    if (k !== state.next) throw new Error(`temporalLive: frames come in order -- expected ${state.next}, got ${k}`);
    const t0 = now(), f = liveFrame(state.S, state.net, { ...liveFrameSpec(state.S, k, { stepDeg: state.stepDeg }), W: state.W, sppIn: state.sppIn }), t1 = now();
    state.frames.push(f); if (state.frames.length > FRAMES) state.frames.shift(); state.next = k + 1;
    if (state.frames.length < FRAMES) return { k, ready: false, have: state.frames.length, ms: { frame: t1 - t0 } };
    const ex = liveExample(state.S, state.frames, state.W), t2 = now();
    const ut = cpuUT && state.ut ? temporalChain(state.ut, ex) : null, t3 = now();
    return { k, ready: true, ex, ut, ms: { frame: t1 - t0, accumulate: t2 - t1, ...(ut ? { ut: t3 - t2 } : {}) } };
}
