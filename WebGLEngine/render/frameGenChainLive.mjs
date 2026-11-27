// WebGLEngine/render/frameGenChainLive.mjs -- frame generation on the arc's WHOLE chain, live (backlog denoise-framegen-page-chain)
//
// render/frameGenLive.mjs generates between raw 2-spp traces. This is the same view on what the arc measured: each REAL frame is the
// chain -- the half-size trace through the shipped denoiser, the emitter fill and EASU (render/temporalLive.mjs's liveFrame), then Bt's
// history over the last FRAMES of them (render/denoiseTemporalUpscale.mjs's accumulateUpscaled, round 32). Between two real frames the
// half-way one is generated from their LIGHT-FREE histories (frameGenFrames' L6 and L7, round 60) with the scene's own motion field, at
// FRAMEGEN_FILL with the holes it leaves cross-faded (sections 147 and 152), then composited with the light sources at the half-way eye.
// The page hands the pair to render/denoiseFrameGenGPU.mjs's compute generator where WebGPU exists, generateChainCPU otherwise; the gate
// holds the two to section 147's bound.
//
// WITH U_TH (round 72's candidate, `ut`): once the chain has FRAMES real frames, each real frame is U_TH's light-free image over Bt's history
// (render/temporalLive.mjs's liveExample, then learnedUpscaleTemporal.mjs's temporalUpscale -- temporalChain's image before its lights), and
// the half-way frame is generated between two of them. Before FRAMES frames there is no example, and the frame is Bt's (`uth` false).
//
// Gated by render/frameGenChainLive-selfcheck.mjs. Pure: no DOM, no Worker -- the page and the worker are thin wiring over this.
"use strict";
import { makeScene } from "./denoiseScenes.mjs";
import { FRAMES } from "./denoiseTemporal.mjs";
import { JITTER, accumulateUpscaled } from "./denoiseTemporalUpscale.mjs";
import { motionField, FRAMEGEN_FILL } from "./denoiseFrameGen.mjs";
import { emitterRadiance } from "./denoiseMask.mjs";
import { compositeEmitters } from "./denoiseUpscale.mjs";
import { interpolateFrameCPU } from "./frameInterp.mjs";
import { liveFrame, liveExample, LIVE_T } from "./temporalLive.mjs";
import { temporalUpscale } from "./learnedUpscaleTemporal.mjs";
import { orbitEye } from "./frameGenLive.mjs";

/** The chain view's defaults: 128 x 128 traced at 64 x 64, 4 samples, 2.5 degrees a frame (round 32's range), a non-dataset scene, the shipped denoiser, and the generator at FRAMEGEN_FILL with cross-faded holes. */
export const LIVE_C = Object.freeze({ W: 128, sppIn: 4, stepDeg: 2.5, family: "R", seed: 990990, seedBase: 5e7, net: "render/denoise-net-r11.json",
    fill: FRAMEGEN_FILL, holes: "crossfade", t: 0.5, ut: LIVE_T.ut });

const rgba = (img3, n) => { const o = new Float32Array(n * 4); for (let p = 0; p < n; p++) { o[p * 4] = img3[p * 3]; o[p * 4 + 1] = img3[p * 3 + 1]; o[p * 4 + 2] = img3[p * 3 + 2]; o[p * 4 + 3] = 1; } return o; };
const rgb = (img4, n) => { const o = new Float64Array(n * 3); for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) o[p * 3 + c] = img4[p * 4 + c]; return o; };

/** The chain's state: makeChainState({ family, seed, W, sppIn, stepDeg, seedBase, net, ut }); chainStep(state, k) makes real frame k. `ut` (decoded U_TH, optional) puts U_TH on each real frame. */
export function makeChainState({ family = LIVE_C.family, seed = LIVE_C.seed, W = LIVE_C.W, sppIn = LIVE_C.sppIn, stepDeg = LIVE_C.stepDeg, seedBase = LIVE_C.seedBase, net, ut = null }) {
    if (!net) throw new Error("frameGenChainLive: the chain needs the shipped denoiser, decoded by its caller");
    if (W % 2) throw new Error(`frameGenChainLive: a ${W} x ${W} frame has no half size`);
    return { S: makeScene(family, seed), W, sppIn, stepDeg, seedBase, net, ut, frames: [], next: 0 };
}

/**
 * Real frame k of the chain (they come in order): its half-size trace through the denoiser, the fill and EASU at eye k (k steps round
 * the orbit, round 32's jitter k mod 8, render seed seedBase + k), then Bt's history over the last FRAMES frames. Returns
 * { k, W, eye, A (light-free history, W x W x 4), frame (A composited with the light sources at eye k), n (history lengths), uth } and,
 * from k = 1, the scene's motion field from eye k - 1 (flow, depth, indexed by this frame) and the light sources at the half-way eye.
 */
export function chainStep(state, k) {
    if (k !== state.next) throw new Error(`frameGenChainLive: frames come in order -- expected ${state.next}, got ${k}`);
    const { S, W, sppIn, stepDeg, seedBase, net, ut } = state, N = W * W, eye = orbitEye(S, k * stepDeg);
    state.frames.push(liveFrame(S, net, { eye, jitter: JITTER[k % FRAMES], seed: seedBase + k, W, sppIn }));
    if (state.frames.length > FRAMES) state.frames.shift();
    state.next++;
    const acc = accumulateUpscaled(state.frames, state.frames.map((f) => f.geo), W, W);
    // with U_TH and a full history, the real frame is U_TH's light-free image (A stays the light-free image the generator reads)
    const uth = !!ut && state.frames.length === FRAMES, img = uth ? temporalUpscale(ut, liveExample(S, state.frames, W).x, W, W).y : acc.A;
    const out = { k, W, eye, A: rgba(img, N), n: acc.n, uth, frame: rgba(compositeEmitters(img, emitterRadiance({ ...S, eye }, W, W)), N) };
    if (k > 0) {
        const prevEye = orbitEye(S, (k - 1) * stepDeg), m = motionField(S, prevEye, eye, W, W);
        out.flow = m.flow; out.depth = m.depth;
        out.mid = emitterRadiance({ ...S, eye: orbitEye(S, (k - 0.5) * stepDeg) }, W, W);
    }
    return out;
}

/** The half-way frame between chain frames a and b (b carrying the field from a), on the CPU: interpolateFrameCPU over their light-free histories at LIVE_C's fill and holes, composited at the half-way eye. { frame, gen, holes, filled }. */
export function generateChainCPU(a, b, { fill = LIVE_C.fill, holes = LIVE_C.holes, t = LIVE_C.t } = {}) {
    if (!b.flow) throw new Error("frameGenChainLive: the newer frame carries the motion field from the older -- frame 0 has none");
    if (b.k !== a.k + 1) throw new Error(`frameGenChainLive: a pair is two consecutive real frames -- got ${a.k} and ${b.k}`);
    const W = b.W, g = interpolateFrameCPU({ prev: a.A, cur: b.A, w: W, h: W, flow: b.flow, bw: W, bh: W, block: 1, depthBlock: b.depth, indexedBy: "cur", t,
        fill: { radius: fill.radius, reach: fill.reach, side: fill.side, prefer: fill.prefer }, holes });
    return { gen: g.frame, frame: composeMid(g.frame, b), holes: g.holes, filled: g.filled };
}

/** A generated light-free frame (W x W x 4, from either generator) composited with the light sources at the half-way eye -- the image the page shows. */
export function composeMid(gen, b) { const N = b.W * b.W; return rgba(compositeEmitters(rgb(gen, N), b.mid), N); }
