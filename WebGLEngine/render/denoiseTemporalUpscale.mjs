// WebGLEngine/render/denoiseTemporalUpscale.mjs -- the denoiser arc, round 32 (pre-registration section 95, backlog
// denoise-fsr2-temporal): round 30's half-size chain over a sequence of jittered frames, accumulated at full size.
//
// THE SEQUENCE is round 4's (render/denoiseTemporal.mjs): the camera orbits the scene's look point for FRAMES frames and
// arrives at the scene's own eye, so the measured (last) frame is seen from where rounds 26-31 saw it. Each frame is traced at
// half size at 4 samples, its pixel grid shifted by that frame's JITTER -- render/jitter.mjs's centred Halton(2, 3) sequence,
// in half-size pixels -- and run through round 30's chain up to EASU: the shipped network, the light sources filled out of the
// half-size frame (from that frame's own coverage, at its own offset), EASU to full size. Not composited per frame: see below.
//
// THE ACCUMULATION, at full size, on each frame's UNJITTERED grid:
//   1. the frame's upscaled image is resampled to its own unjittered grid -- a half-size offset (dx, dy) is (2dx, 2dy) full-size
//      pixels, and the value at pixel p is the image's bilinear tap at p - offset (shiftResample);
//   2. the history is reprojected from the previous frame by round 4's rule (reproject: each pixel's first hit projected into
//      the previous camera, its four bilinear taps kept only where they saw the same object, near the same point, facing the
//      same way), and clamped, per channel, to the current frame's 3 x 3 neighbourhood -- the clamp FSR2 and TAA use against
//      ghosting;
//   3. the running average with n = min(n_prev + 1, FRAMES), as round 4's: A = A_prev + (I - A_prev) / n. A pixel with no
//      valid tap restarts at its own value, n = 1.
// *** THE LIGHT SOURCES ARE PUT BACK ONCE, AFTER THE ACCUMULATION. *** Composited per frame, the history would carry each
// frame's emitter radiance through the clamp into the pixels beside it -- the leak round 30 took out of the upscale. The
// measured frame's emitterRadiance, unjittered, is composited onto the accumulated light, as round 30 composited the upscaled.
"use strict";
import { render } from "../physics/render/pathTracer.mjs";
import { makeScene, renderSeeds, guideBuffers, inputChannels, isDatasetSeed, IMAGE, SPP_IN, SPP_REF } from "./denoiseScenes.mjs";
import { emitterCoverage, emitterRadiance, withMask } from "./denoiseMask.mjs";
import { FRAMES, cameraPath, firstHits, reproject } from "./denoiseTemporal.mjs";
import { jitterSequence } from "./jitter.mjs";

/** Each frame's sub-pixel offset, f = 0 .. FRAMES - 1: the first FRAMES centred Halton(2, 3) offsets, in the frame's own pixels. */
export const JITTER = Object.freeze(jitterSequence(FRAMES).map((j) => Object.freeze(j)));
/** Round 32's render seeds live above every other round's: BASE + 16 s + k. */
export const TEMPORAL_UP_SEED_BASE = 2e7;

/** The render seeds of one image: FRAMES half-size frames, FRAMES full-size 1-sample frames, and renderSeeds' reference and second reference. */
export function temporalUpscaleSeeds(seed) {
    const r = renderSeeds(seed), b = TEMPORAL_UP_SEED_BASE + seed * 16;
    return { half: Array.from({ length: FRAMES }, (_, f) => b + f), full1: Array.from({ length: FRAMES }, (_, f) => b + FRAMES + f), ref: r.ref, ref2: r.ref2 };
}

/**
 * Render one image's sequence. Each frame f, from the camera path's eye f, at JITTER[f]: a half-size frame at sppIn samples
 * and a full-size frame at 1 sample (the same number of samples a full-size pixel gets from the half-size frame), each with
 * its guides and its emitter coverage at its own offset, as the network's input. The reference and the second reference are
 * full size at sppRef, from the measured frame's eye, unjittered; `full` is emitterRadiance there, the composite's guide.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. ***
 */
export function renderTemporalUpscaleImages(family, seed, { harvest = false, w = IMAGE, h = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`denoiseTemporalUpscale: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    if (w % 2 || h % 2) throw new Error(`denoiseTemporalUpscale: a ${w} x ${h} frame has no half size`);
    const S = makeScene(family, seed), rs = temporalUpscaleSeeds(seed), path = cameraPath(S);
    const opts = (W, H, spp, s, eye, off) => ({ w: W, h: H, spp, seed: s, rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: off });
    const frame = (W, H, spp, s, eye, off) => {
        const Sf = { ...S, eye }, input = render(S.scene, opts(W, H, spp, s, eye, off)), g = guideBuffers(Sf, W, H, off), cov = emitterCoverage(Sf, W, H, off);
        return { w: W, h: H, spp, input, cov, x: withMask(inputChannels(input, g.albedo, g.normal, W, H), cov) };
    };
    const frames = path.eyes.map((eye, f) => ({ eye, jitter: JITTER[f], half: frame(w / 2, h / 2, sppIn, rs.half[f], eye, JITTER[f]), full1: frame(w, h, 1, rs.full1[f], eye, JITTER[f]) }));
    return { family, seed, w, h, seeds: rs, path, frames, ref: render(S.scene, opts(w, h, sppRef, rs.ref, S.eye, null)), ref2: render(S.scene, opts(w, h, sppRef, rs.ref2, S.eye, null)),
             full: emitterRadiance(S, w, h) };
}

/** Where a half-size frame's jitter puts its EASU'd image at full size: a half-size pixel is two full-size ones, so (2 dx, 2 dy). */
export const halfShift = (j) => [2 * j[0], 2 * j[1]];

/** A W x H rgb image moved by (dx, dy) pixels: the value at pixel p is the image's bilinear tap at p - (dx, dy), its edges clamped. */
export function shiftResample(img3, W, H, dx, dy) {
    if (img3.length !== W * H * 3) throw new Error(`denoiseTemporalUpscale: ${img3.length} values are not a ${W} x ${H} rgb image`);
    const y = new Float64Array(W * H * 3), cl = (v, n) => Math.min(Math.max(v, 0), n - 1);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const X = px - dx, Y = py - dy, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
        const a = cl(x0, W), b = cl(x0 + 1, W), c = cl(y0, H), d = cl(y0 + 1, H), o = (py * W + px) * 3;
        for (let k = 0; k < 3; k++)
            y[o + k] = (1 - fy) * ((1 - fx) * img3[(c * W + a) * 3 + k] + fx * img3[(c * W + b) * 3 + k]) + fy * ((1 - fx) * img3[(d * W + a) * 3 + k] + fx * img3[(d * W + b) * 3 + k]);
    }
    return y;
}

/**
 * THE ACCUMULATION. `frames[f]` is { y (W x H rgb, on its jittered grid), shift [dx, dy] in full-size pixels } and `geo[f]` that
 * frame's unjittered first hits (render/denoiseTemporal.mjs's firstHits, W x H). Returns { A, n } on the last frame's
 * unjittered grid. `clamp` (on) holds the reprojected history inside the current frame's 3 x 3 per-channel range.
 */
export function accumulateUpscaled(frames, geo, W, H, { clamp = true } = {}) {
    if (frames.length !== geo.length || !frames.length) throw new Error(`denoiseTemporalUpscale: ${frames.length} frames against ${geo.length} first-hit buffers`);
    const N = W * H;
    let A = shiftResample(frames[0].y, W, H, frames[0].shift[0], frames[0].shift[1]), n = new Float64Array(N).fill(1);
    for (let f = 1; f < frames.length; f++) {
        const cur = shiftResample(frames[f].y, W, H, frames[f].shift[0], frames[f].shift[1]);
        const { taps, wts, valid } = reproject(geo[f - 1], geo[f], W, H), A2 = new Float64Array(N * 3), n2 = new Float64Array(N);
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
            const p = py * W + px;
            if (!valid[p]) { n2[p] = 1; for (let c = 0; c < 3; c++) A2[p * 3 + c] = cur[p * 3 + c]; continue; }
            let np = 0; const hist = [0, 0, 0];
            for (let k = 0; k < 4; k++) { const q = taps[4 * p + k]; if (q < 0) continue; const wk = wts[4 * p + k]; np += wk * n[q]; for (let c = 0; c < 3; c++) hist[c] += wk * A[q * 3 + c]; }
            if (clamp) for (let c = 0; c < 3; c++) {
                let lo = Infinity, hi = -Infinity;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const qx = px + dx, qy = py + dy;
                    if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
                    const v = cur[(qy * W + qx) * 3 + c]; if (v < lo) lo = v; if (v > hi) hi = v;
                }
                hist[c] = Math.min(Math.max(hist[c], lo), hi);
            }
            const nn = Math.min(np + 1, FRAMES);
            n2[p] = nn;
            for (let c = 0; c < 3; c++) A2[p * 3 + c] = hist[c] + (cur[p * 3 + c] - hist[c]) / nn;
        }
        A = A2; n = n2;
    }
    return { A, n };
}

/** The unjittered first hits of every frame of an image's sequence, at W x H: what accumulateUpscaled reprojects through. */
export function sequenceGeometry(family, seed, eyes, W, H) {
    const S = makeScene(family, seed);
    return eyes.map((eye) => firstHits(S, eye, W, H));
}
