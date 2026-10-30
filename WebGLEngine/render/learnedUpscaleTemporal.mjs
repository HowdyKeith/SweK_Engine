// WebGLEngine/render/learnedUpscaleTemporal.mjs -- FSR4 round 70 (pre-registration section 161): a learned correction of the
// temporal upscale
//
// Round 32's Bt is the arc's hand-written temporal upscale: eight jittered half-size frames through the shipped denoiser, the
// emitter fill and EASU, reprojected and clamped into a running average at full size. U_T is section 159's held residual put on
// Bt's light-free accumulation A instead of on EASU's frame:
//
//     y = A * (1 + 0.5 tanh(r)),   r = U_T(the 17 channels below), a 3-channel head started at zero -- so an untrained U_T is Bt
//
// Its input per full-size pixel, UT_CHANNELS = 17:
//   0-2   A, the clamped accumulation          3-5   the same accumulation unclamped (where the clamp acted, it differs)
//   6-8   the measured frame's EASU, on the unjittered grid                            9     the history length n / FRAMES
//   10-12 albedo, 13-15 normal, 16 depth d / (1 + d) (0 on sky) -- the measured frame's guides at full size, unjittered
// The loss is rounds 65-69's: display-space relMSE of the composite E + (1 - cov) y against the reference.
"use strict";
import { seededRandom, initNet, netForward, netBackward, adamState, adamStep, ADAM } from "../brain/convNet.mjs";
import { REL_EPS } from "./denoiseStats.mjs";
import { toPerceptual, GAMMA, upscale, fillEmitters, compositeEmitters } from "./denoiseUpscale.mjs";
import { render, cameraBasis } from "../physics/render/pathTracer.mjs";
import { makeScene, guideBuffers, inputChannels, isDatasetSeed } from "./denoiseScenes.mjs";
import { emitterCoverage, emitterRadiance, withMask } from "./denoiseMask.mjs";
import { FRAMES, cameraPath, firstHits } from "./denoiseTemporal.mjs";
import { JITTER, temporalUpscaleSeeds, accumulateUpscaled, shiftResample, halfShift } from "./denoiseTemporalUpscale.mjs";
import { denoise } from "./denoiseNet.mjs";
import { UP_TRAIN } from "./learnedUpscale.mjs";

export const UT_CHANNELS = 17;
/** The correction's hold, as section 159's: each channel of A scaled by 1 + UT_SCALE tanh(r), 0.5 to 1.5 at most. */
export const UT_SCALE = 0.5;
/** Three 3 x 3 layers of 32, then the 3-channel residual head as 1 x 1. */
export const UT_SHAPE = Object.freeze([Object.freeze([UT_CHANNELS, 32, "relu"]), Object.freeze([32, 32, "relu"]), Object.freeze([32, 32, "relu"]), Object.freeze([32, 3, "none", 1])]);

// ---- ROUNDS 72-73 (section 167): U_TH, the network at half size and 16 wide ------------------------------------------------
/** U_TH's width, and its shape: three 3 x 3 layers of 16, then the 3-channel head as 1 x 1 -- run on the 17 channels averaged to half size. */
export const UTH_WIDTH = 16;
export const UTH_SHAPE = Object.freeze([Object.freeze([UT_CHANNELS, UTH_WIDTH, "relu"]), Object.freeze([UTH_WIDTH, UTH_WIDTH, "relu"]), Object.freeze([UTH_WIDTH, UTH_WIDTH, "relu"]), Object.freeze([UTH_WIDTH, 3, "none", 1])]);
/** The two variants: "full" (round 70's U_T) and "half" (U_TH). A net is U_TH when its first layer is 16 wide. */
export const UT_VARIANTS = Object.freeze(["full", "half"]);
export const isHalfT = (net) => net.layers[0].Cout === UTH_WIDTH;
/** The 17 channels of a W x H input averaged over 2 x 2: (W / 2) x (H / 2) x 17. */
export function halfInput(x, W, H) {
    if (W % 2 || H % 2) throw new Error(`learnedUpscaleTemporal: a ${W} x ${H} input has no half size`);
    const w = W / 2, h = H / 2, C = UT_CHANNELS, o = new Float64Array(w * h * C);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) for (let c = 0; c < C; c++)
        o[(y * w + xx) * C + c] = (x[((2 * y) * W + 2 * xx) * C + c] + x[((2 * y) * W + 2 * xx + 1) * C + c] + x[((2 * y + 1) * W + 2 * xx) * C + c] + x[((2 * y + 1) * W + 2 * xx + 1) * C + c]) / 4;
    return o;
}
// a full-size pixel's bilinear taps into the half-size grid: its centre at half-size (X + 0.5) / 2 - 0.5, clamped -- U's bilinear channel's rule
function upTapsH(X, Y, w, h) {
    const u = Math.min(w - 1, Math.max(0, (X + 0.5) / 2 - 0.5)), v = Math.min(h - 1, Math.max(0, (Y + 0.5) / 2 - 0.5));
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = u - x0, ty = v - y0;
    return [[y0 * w + x0, (1 - tx) * (1 - ty)], [y0 * w + x1, tx * (1 - ty)], [y1 * w + x0, (1 - tx) * ty], [y1 * w + x1, tx * ty]];
}
/** A half-size 3-channel field upsampled bilinearly to 2w x 2h. */
export function upHalf(rh, w, h) {
    const W = 2 * w, H = 2 * h, r = new Float64Array(W * H * 3);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { const p = Y * W + X; for (const [q, a] of upTapsH(X, Y, w, h)) for (let c = 0; c < 3; c++) r[p * 3 + c] += a * rh[q * 3 + c]; }
    return r;
}
/** upHalf's transpose: a full-size gradient gathered back onto the half-size field. */
export function upHalfT(g, w, h) {
    const W = 2 * w, H = 2 * h, o = new Float64Array(w * h * 3);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { const p = Y * W + X; for (const [q, a] of upTapsH(X, Y, w, h)) for (let c = 0; c < 3; c++) o[q * 3 + c] += a * g[p * 3 + c]; }
    return o;
}

/** A fresh U_T (or, `variant` "half", U_TH) from a seed's stream: the head's weights and biases zero, so its untrained frame is A exactly. */
export function makeUpscalerT(rand, variant = "full") {
    if (!UT_VARIANTS.includes(variant)) throw new Error(`learnedUpscaleTemporal: the variant is "full" or "half" -- got ${JSON.stringify(variant)}`);
    const net = initNet(variant === "half" ? UTH_SHAPE : UT_SHAPE, typeof rand === "number" ? seededRandom(rand) : rand), last = net.layers[net.layers.length - 1];
    last.W.fill(0); last.b.fill(0);
    return net;
}

/** The 17 channels from their parts (all W x H; rgb parts x 3). */
export function temporalInput(A, Au, C, n, albedo, normal, depth, W, H) {
    const x = new Float64Array(W * H * UT_CHANNELS);
    for (let p = 0; p < W * H; p++) {
        const o = p * UT_CHANNELS;
        for (let c = 0; c < 3; c++) { x[o + c] = A[p * 3 + c]; x[o + 3 + c] = Au[p * 3 + c]; x[o + 6 + c] = C[p * 3 + c]; x[o + 10 + c] = albedo[p * 3 + c]; x[o + 13 + c] = normal[p * 3 + c]; }
        x[o + 9] = n[p] / FRAMES;
        const d = depth[p]; x[o + 16] = d >= 1e8 || !(d > 0) ? 0 : d / (1 + d);
    }
    return x;
}

const T_FLOOR = 1e-6;
const dToPerceptual = (v) => { const a = Math.max(v, T_FLOOR); return v <= 0 ? 0 : toPerceptual(a) / (GAMMA * a * (1 + a)); };

/** U_T applied to a W x H input: { y (W x H x 3), r (the residual at full size), acts }. The base A is the input's channels 0-2. U_TH runs on the
 * half-size input and its residual is upsampled (rh beside it). */
export function temporalUpscale(net, x, W, H) {
    const half = isHalfT(net), acts = half ? netForward(net, halfInput(x, W, H), H / 2, W / 2) : netForward(net, x, H, W), rh = acts[acts.length - 1];
    const r = half ? upHalf(rh, W / 2, H / 2) : rh, y = new Float64Array(W * H * 3);
    for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = x[p * UT_CHANNELS + c] * (1 + UT_SCALE * Math.tanh(r[p * 3 + c]));
    return { y, r, acts, ...(half ? { rh } : {}) };
}

/** The loss and its gradients on a W x H frame or crop: display-space relMSE of E + (1 - cov) y, back through the hold to r and the network. */
export function temporalLoss(net, x, W, H, ref, cov, E) {
    const N = W * H * 3, { y, r, acts } = temporalUpscale(net, x, W, H), dz = new Float64Array(N);
    let loss = 0;
    for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) {
        const i = p * 3 + c, o = E[i] + (1 - cov[p]) * y[i], to = toPerceptual(o), tr = toPerceptual(ref[i]), den = tr * tr + REL_EPS, e = to - tr, t = Math.tanh(r[i]);
        loss += e * e / den;
        dz[i] = 2 * e / den / N * dToPerceptual(o) * (1 - cov[p]) * x[p * UT_CHANNELS + c] * UT_SCALE * (1 - t * t);
    }
    // U_TH: the full-size gradient on r carried back through the upsample onto the half-size head
    return { loss: loss / N, ...(isHalfT(net) ? netBackward(net, acts, H / 2, W / 2, upHalfT(dz, W / 2, H / 2)) : netBackward(net, acts, H, W, dz)) };
}

/** A size x size crop of an example at (cx, cy): its input, reference, coverage and emission. */
export function temporalCrop(ex, cx, cy, size) {
    const W = ex.W, C = UT_CHANNELS, x = new Float64Array(size * size * C), ref = new Float64Array(size * size * 3), cov = new Float64Array(size * size), E = new Float64Array(size * size * 3);
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
        const s = (cy + y) * W + (cx + xx), d = y * size + xx;
        for (let c = 0; c < C; c++) x[d * C + c] = ex.x[s * C + c];
        for (let c = 0; c < 3; c++) { ref[d * 3 + c] = ex.ref[s * 3 + c]; E[d * 3 + c] = ex.E[s * 3 + c]; }
        cov[d] = ex.cov[s];
    }
    return { x, ref, cov, E };
}

/** Train U_T on `examples` ([{ x, W, H, ref, cov, E }]): `steps` Adam steps on `batch` crops of `crop`, the image and corner from the seed's stream after the weights. */
export function trainTemporal(examples, { seed, steps = UP_TRAIN.steps, batch = UP_TRAIN.batch, crop = UP_TRAIN.crop, adam = ADAM, variant = "full", onCrop = null } = {}) {
    if (!Number.isInteger(seed)) throw new Error("learnedUpscaleTemporal: training needs an integer seed");
    if (examples.some((e) => e.W < crop || e.H < crop)) throw new Error(`learnedUpscaleTemporal: a crop no larger than every frame -- got ${crop}`);
    if (variant === "half" && crop % 2) throw new Error(`learnedUpscaleTemporal: U_TH trains on even crops -- got ${crop}`);
    const rand = seededRandom(seed), net = makeUpscalerT(rand, variant), state = adamState(net), losses = [];
    for (let step = 0; step < steps; step++) {
        let loss = 0, acc = null;
        for (let b = 0; b < batch; b++) {
            const ex = examples[Math.floor(rand.u() * examples.length)];
            // round 70's corners as they were; U_TH's on even pixels, so a crop's 2 x 2 blocks are the frame's
            const cx = variant === "half" ? 2 * Math.floor(rand.u() * ((ex.W - crop) / 2 + 1)) : Math.floor(rand.u() * (ex.W - crop + 1));
            const cy = variant === "half" ? 2 * Math.floor(rand.u() * ((ex.H - crop) / 2 + 1)) : Math.floor(rand.u() * (ex.H - crop + 1)), C = temporalCrop(ex, cx, cy, crop);
            if (onCrop) onCrop(cx, cy);
            const g = temporalLoss(net, C.x, crop, crop, C.ref, C.cov, C.E);
            loss += g.loss / batch;
            if (!acc) acc = g.grads.map((q) => ({ dW: q.dW.map((v) => v / batch), db: q.db.map((v) => v / batch) }));
            else g.grads.forEach((q, i) => { for (let j = 0; j < q.dW.length; j++) acc[i].dW[j] += q.dW[j] / batch; for (let j = 0; j < q.db.length; j++) acc[i].db[j] += q.db[j] / batch; });
        }
        adamStep(net, acc, state, adam);
        losses.push(loss);
    }
    return { net, losses };
}

/**
 * One example of round 70: scene `family`/`seed`'s sequence at W x W -- round 32's path and jitter, each frame at half size at
 * sppIn through the shipped network (`net`), the emitter fill and EASU -- accumulated clamped (A, Bt's light) and unclamped, the
 * measured frame's EASU unjittered (C), the guides, the light sources, and the references at the measured eye. The arms:
 * `bt` (Bt, A composited), `b1` (the measured frame alone, C composited) and `noisy` (its half-size input, bilinear, composited).
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. ***
 */
export function temporalExample(family, seed, net, { harvest = false, W = 256, sppIn = 4, sppRef = 32, ref2 = false } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`learnedUpscaleTemporal: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    if (W % 2) throw new Error(`learnedUpscaleTemporal: a ${W} x ${W} frame has no half size`);
    const H = W, w = W / 2, h = H / 2, S = makeScene(family, seed), rs = temporalUpscaleSeeds(seed), path = cameraPath(S);
    const opts = (ww, hh, spp, sd, eye, off) => ({ w: ww, h: hh, spp, seed: sd, rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: off });
    const frames = path.eyes.map((eye, f) => {
        const Sf = { ...S, eye }, input = render(S.scene, opts(w, h, sppIn, rs.half[f], eye, JITTER[f])), g = guideBuffers(Sf, w, h, JITTER[f]), cov = emitterCoverage(Sf, w, h, JITTER[f]);
        const den = denoise(net, withMask(inputChannels(input, g.albedo, g.normal, w, h), cov), h, w).y, filled = fillEmitters(den, cov, w, h);
        return { input, cov, y: upscale(filled, w, h, W, H, "easu"), shift: halfShift(JITTER[f]) };
    });
    const geo = path.eyes.map((eye) => firstHits(S, eye, W, H)), acc = accumulateUpscaled(frames, geo, W, H), Au = accumulateUpscaled(frames, geo, W, H, { clamp: false }).A;
    const last = frames[FRAMES - 1], C = shiftResample(last.y, W, H, ...last.shift);
    const g = guideBuffers(S, W, H), B = cameraBasis(S), hits = geo[FRAMES - 1], depth = new Float64Array(W * H).fill(1e9);
    for (let p = 0; p < W * H; p++) if (hits.obj[p] >= 0) depth[p] = (hits.pos[p * 3] - S.eye[0]) * B.fwd[0] + (hits.pos[p * 3 + 1] - S.eye[1]) * B.fwd[1] + (hits.pos[p * 3 + 2] - S.eye[2]) * B.fwd[2];
    const full = emitterRadiance(S, W, H), noisyHalf = fillEmitters(Float64Array.from(last.input), last.cov, w, h);
    return { family, seed, W, H, x: temporalInput(acc.A, Au, C, acc.n, g.albedo, g.normal, depth, W, H), cov: full.cov, E: full.E,
             ref: render(S.scene, opts(W, H, sppRef, rs.ref, S.eye, null)), ...(ref2 ? { ref2: render(S.scene, opts(W, H, sppRef, rs.ref2, S.eye, null)) } : {}),
             bt: compositeEmitters(acc.A, full), b1: compositeEmitters(C, full),
             noisy: compositeEmitters(shiftResample(upscale(noisyHalf, w, h, W, H, "bilinear"), W, H, ...last.shift), full) };
}

/** U_T's chain on an example: its frame composited with the light sources, as Bt's is. */
export const temporalChain = (net, ex) => compositeEmitters(temporalUpscale(net, ex.x, ex.W, ex.H).y, { cov: ex.cov, E: ex.E });
/** An example's mean correction, |0.5 tanh r| over its pixels and channels (section 161's P4). */
export function temporalCorrection(net, ex) {
    const r = temporalUpscale(net, ex.x, ex.W, ex.H).r; let s = 0;
    for (let i = 0; i < r.length; i++) s += Math.abs(UT_SCALE * Math.tanh(r[i]));
    return s / r.length;
}
