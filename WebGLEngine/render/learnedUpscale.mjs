// WebGLEngine/render/learnedUpscale.mjs -- FSR4's first round, round 65 (pre-registration section 148)
//
// A LEARNED 2x UPSCALE IN EASU's PLACE. U is a small conv network -- brain/convNet.mjs's layers, as the denoiser's -- run at FULL
// size on guides the geometry gives there, which predicts for each full-size pixel a softmax over the 4 x 4 half-size texels
// nearest it. The pixel is their weighted sum. So U can only redistribute light the half-size frame has, as the denoiser's
// kernel head can only average real samples; what it learns is where to take it from, which is what EASU decides by hand.
//
// Its input per full-size pixel, UP_CHANNELS = 12:
//   0-2   the half-size frame bilinearly upsampled (the chain's denoised, filled frame -- light-free, as round 30 made it)
//   3-5   the full-size albedo, 6-8 the normal (render/denoiseScenes.mjs's guideBuffers at full size)
//   9     the depth along the camera's forward axis, as d / (1 + d) (0 on sky)
//   10-11 the pixel's sub-texel phase: where its centre falls in its half-size texel, -0.25 or +0.25 on each axis
// Its output: E + (1 - cov) x U, the chain's composite, and the loss is relMSE IN DISPLAY SPACE (round 26's transfer) of that
// against the full reference -- the grading rounds 61-62 used and section 148 fixed. Graded through the composite, U is asked
// only for the light the emitters do not cover, which is section 148's "light-free" without a light-free reference to make.
"use strict";
import { seededRandom, initNet, netForward, netBackward, adamState, adamStep, ADAM } from "../brain/convNet.mjs";
import { REL_EPS } from "./denoiseStats.mjs";
import { toPerceptual, GAMMA, upscale, fillEmitters, compositeEmitters, renderSeedsUpscale } from "./denoiseUpscale.mjs";
import { render } from "../physics/render/pathTracer.mjs";
import { makeScene, guideBuffers, inputChannels, isDatasetSeed } from "./denoiseScenes.mjs";
import { emitterCoverage, emitterRadiance, withMask } from "./denoiseMask.mjs";
import { firstHits } from "./denoiseTemporal.mjs";
import { denoise } from "./denoiseNet.mjs";
import { cameraBasis } from "../physics/render/pathTracer.mjs";

export const UP_CHANNELS = 12;
export const UP_TAPS = 16;
/** Three 3 x 3 layers of 16, then the 16-logit head as a 1 x 1 layer -- the denoiser's kernel network's shape at another width. */
export const UP_SHAPE = Object.freeze([Object.freeze([UP_CHANNELS, 16, "relu"]), Object.freeze([16, 16, "relu"]), Object.freeze([16, 16, "relu"]), Object.freeze([16, UP_TAPS, "none", 1])]);
/** Section 148's schedule: the denoiser's TRAIN (1500 steps, batches of 4 crops of 32), the crop at FULL size, on even corners. */
export const UP_TRAIN = Object.freeze({ steps: 1500, batch: 4, crop: 32 });

/** A fresh U: the shape's weights from the seed's stream, the last layer's set to zero -- so an untrained U is the 4 x 4 box. */
export function makeUpscaler(seed) { const net = initNet(UP_SHAPE, seededRandom(seed)); net.layers[net.layers.length - 1].W.fill(0); return net; }

// ---- ROUND 68 (section 157): U_E, a learned correction of EASU --------------------------------------------------------------
/** U_E's 17th tap: EASU's own light-free output at the pixel. Its logit's starting bias, so an untrained U_E is EASU to within 16 / (16 + e^8). */
export const UPE_TAPS = UP_TAPS + 1, UPE_EASU_BIAS = -8;
/** Three 3 x 3 layers of 32, then the 17-logit head as 1 x 1. */
export const UPE_SHAPE = Object.freeze([Object.freeze([UP_CHANNELS, 32, "relu"]), Object.freeze([32, 32, "relu"]), Object.freeze([32, 32, "relu"]), Object.freeze([32, UPE_TAPS, "none", 1])]);
/** The two designs' start: "box" (round 65/67's U, the head zero) or "easu" (U_E: the head zero, so the sixteen start as the box, and EASU's
 * logit biased -8, offered rather than imposed -- section 157 found a start at EASU never left it). */
export const UP_VARIANTS = Object.freeze(["box", "easu"]);
function initVariant(rand, variant, easuBias = UPE_EASU_BIAS) {
    if (!UP_VARIANTS.includes(variant)) throw new Error(`learnedUpscale: the variant is "box" or "easu" -- got ${JSON.stringify(variant)}`);
    const net = initNet(variant === "easu" ? UPE_SHAPE : UP_SHAPE, rand), last = net.layers[net.layers.length - 1];
    last.W.fill(0);
    if (variant === "easu") last.b[UP_TAPS] = easuBias;
    return net;
}
/** A fresh U_E from a seed: its untrained pixel is round 67's box start, with e^-8 / (16 + e^-8) = 2.1e-5 of it on EASU. */
export const makeUpscalerE = (seed) => initVariant(seededRandom(seed), "easu");
/** A net's tap count: 16 for U, 17 for U_E. */
export const tapsOf = (net) => net.layers[net.layers.length - 1].Cout;

/** The 4 x 4 half-size texels nearest full-size pixel (X, Y) of a W x H frame (half w x h), clamped at the edges, row by row. */
export function upTaps(X, Y, w, h) {
    const u = (X + 0.5) / 2 - 0.5, v = (Y + 0.5) / 2 - 0.5, x0 = Math.floor(u) - 1, y0 = Math.floor(v) - 1, out = new Int32Array(UP_TAPS);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) out[j * 4 + i] = Math.min(h - 1, Math.max(0, y0 + j)) * w + Math.min(w - 1, Math.max(0, x0 + i));
    return out;
}

/**
 * U's input, W x H x UP_CHANNELS: `half` (w x h x 3, the chain's frame before the upscale), `albedo` and `normal` (W x H x 3) and
 * `depth` (W x H, SKY or any value >= 1e8 read as sky). W = 2w and H = 2h.
 */
export function upscaleInput(half, w, h, albedo, normal, depth) {
    const W = 2 * w, H = 2 * h, x = new Float64Array(W * H * UP_CHANNELS);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const p = Y * W + X, o = p * UP_CHANNELS;
        // the bilinear upsample, at the pixel centre's half-size position, clamped
        const u = Math.min(w - 1, Math.max(0, (X + 0.5) / 2 - 0.5)), v = Math.min(h - 1, Math.max(0, (Y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = u - x0, ty = v - y0;
        for (let c = 0; c < 3; c++) x[o + c] = (half[(y0 * w + x0) * 3 + c] * (1 - tx) + half[(y0 * w + x1) * 3 + c] * tx) * (1 - ty) + (half[(y1 * w + x0) * 3 + c] * (1 - tx) + half[(y1 * w + x1) * 3 + c] * tx) * ty;
        for (let c = 0; c < 3; c++) { x[o + 3 + c] = albedo[p * 3 + c]; x[o + 6 + c] = normal[p * 3 + c]; }
        const d = depth[p]; x[o + 9] = d >= 1e8 || !(d > 0) ? 0 : d / (1 + d);
        x[o + 10] = X % 2 ? 0.25 : -0.25; x[o + 11] = Y % 2 ? 0.25 : -0.25;
    }
    return x;
}

/**
 * U applied: the softmax of each pixel's logits over its 4 x 4 taps -- and, for U_E, EASU's light-free pixel (`easuUp`, W x H x 3)
 * as a 17th -- and the weighted sum. { y (W x H x 3), w (weights, W x H x the net's taps), acts }.
 */
export function learnedUpscale(net, x, half, w, h, easuUp = null) {
    const K = tapsOf(net);
    if (K === UPE_TAPS && !easuUp) throw new Error("learnedUpscale: U_E's 17th tap is EASU's output -- pass easuUp");
    const W = 2 * w, H = 2 * h, acts = netForward(net, x, H, W), z = acts[acts.length - 1], y = new Float64Array(W * H * 3), wt = new Float64Array(W * H * K);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const p = Y * W + X, T = upTaps(X, Y, w, h);
        let m = -Infinity; for (let t = 0; t < K; t++) m = Math.max(m, z[p * K + t]);
        let s = 0; for (let t = 0; t < K; t++) s += (wt[p * K + t] = Math.exp(z[p * K + t] - m));
        for (let t = 0; t < K; t++) { const a = (wt[p * K + t] /= s); if (t < UP_TAPS) { const q = T[t]; for (let c = 0; c < 3; c++) y[p * 3 + c] += a * half[q * 3 + c]; } else for (let c = 0; c < 3; c++) y[p * 3 + c] += a * easuUp[p * 3 + c]; }
    }
    return { y, w: wt, acts };
}

// round 26's transfer and its derivative: t(v) = (v / (1 + v))^(1 / GAMMA), t'(v) = t(v) / (GAMMA v (1 + v)); at v <= 0 the transfer
// is flat (toPerceptual clamps), and the derivative is taken from a floor so the loss's gradient stays finite where light is zero
const T_FLOOR = 1e-6;
const dToPerceptual = (v) => { const a = Math.max(v, T_FLOOR); return v <= 0 ? 0 : toPerceptual(a) / (GAMMA * a * (1 + a)); };

/**
 * The loss and its gradients: O = E + (1 - cov) U(x), graded as relMSE(toPerceptual(O), toPerceptual(ref)) -- display space --
 * and carried back through the transfer, the composite, the weighted sum and the softmax to the logits, then through the network.
 */
export function upLossAndGrads(net, x, half, w, h, ref, cov, E, easuUp = null) {
    const K = tapsOf(net), W = 2 * w, H = 2 * h, N = W * H * 3, { y, w: wt, acts } = learnedUpscale(net, x, half, w, h, easuUp);
    let loss = 0; const gY = new Float64Array(N);
    for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) {
        const i = p * 3 + c, o = E[i] + (1 - cov[p]) * y[i], to = toPerceptual(o), tr = toPerceptual(ref[i]), den = tr * tr + REL_EPS, e = to - tr;
        loss += e * e / den;
        gY[i] = 2 * e / den / N * dToPerceptual(o) * (1 - cov[p]);
    }
    const dz = new Float64Array(W * H * K);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const p = Y * W + X, T = upTaps(X, Y, w, h), g = new Float64Array(K);
        let s = 0;
        for (let t = 0; t < K; t++) { const src = t < UP_TAPS ? half : easuUp, q = t < UP_TAPS ? T[t] : p;
            g[t] = gY[p * 3] * src[q * 3] + gY[p * 3 + 1] * src[q * 3 + 1] + gY[p * 3 + 2] * src[q * 3 + 2]; s += wt[p * K + t] * g[t]; }
        for (let t = 0; t < K; t++) dz[p * K + t] = wt[p * K + t] * (g[t] - s);
    }
    return { loss: loss / N, ...netBackward(net, acts, H, W, dz) };
}

/** A crop of an example at an even full-size corner (cx, cy): the full-size input, reference, coverage and emission, and the half-size frame it reads. */
export function upCrop(ex, cx, cy, size) {
    const eu = ex.easuUp ? new Float64Array(size * size * 3) : null;
    const { w } = ex, W = 2 * w, hs = size / 2, C = UP_CHANNELS, x = new Float64Array(size * size * C), ref = new Float64Array(size * size * 3), cov = new Float64Array(size * size), E = new Float64Array(size * size * 3);
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
        const s = (cy + y) * W + (cx + xx), d = y * size + xx;
        for (let c = 0; c < C; c++) x[d * C + c] = ex.x[s * C + c];
        for (let c = 0; c < 3; c++) { ref[d * 3 + c] = ex.ref[s * 3 + c]; E[d * 3 + c] = ex.E[s * 3 + c]; }
        cov[d] = ex.cov[s];
        if (eu) for (let c = 0; c < 3; c++) eu[d * 3 + c] = ex.easuUp[s * 3 + c];
    }
    // the half-size frame under the crop, and two texels round it so the edge taps read what the whole frame would -- clamped at the frame's edge
    const pad = 2, hx = cx / 2 - pad, hy = cy / 2 - pad, hw = hs + 2 * pad, half = new Float64Array(hw * hw * 3);
    for (let y = 0; y < hw; y++) for (let xx = 0; xx < hw; xx++) { const sy = Math.min(ex.h - 1, Math.max(0, hy + y)), sx = Math.min(w - 1, Math.max(0, hx + xx));
        for (let c = 0; c < 3; c++) half[(y * hw + xx) * 3 + c] = ex.half[(sy * w + sx) * 3 + c]; }
    return { x, ref, cov, E, half, hs, pad, hw, easuUp: eu };
}

/**
 * Train U on `examples` ([{ x, half, w, h, ref, cov, E }], each at full size 2w x 2h): `steps` Adam steps on `batch` crops of `crop`
 * (even corners), the image and corner from the seed's stream after the weights. A crop's taps are read from the half-size frame
 * round it (upCrop), so a crop grades as the whole frame would at those pixels.
 */
export function trainUpscaler(examples, { seed, steps = UP_TRAIN.steps, batch = UP_TRAIN.batch, crop = UP_TRAIN.crop, adam = ADAM, onStep = null, variant = "box", easuBias = UPE_EASU_BIAS } = {}) {
    if (!Number.isInteger(seed)) throw new Error("learnedUpscale: training needs an integer seed");
    if (crop % 2 || examples.some((e) => 2 * e.w < crop || 2 * e.h < crop)) throw new Error(`learnedUpscale: an even crop no larger than every frame -- got ${crop}`);
    // round 68: the variant's start -- "box" draws round 65's weights from the stream exactly as before
    if (variant === "easu" && examples.some((e) => !e.easuUp)) throw new Error("learnedUpscale: U_E trains on examples that carry easuUp");
    const rand = seededRandom(seed), net = initVariant(rand, variant, easuBias), state = adamState(net), losses = [];
    for (let step = 0; step < steps; step++) {
        let loss = 0, acc = null;
        for (let b = 0; b < batch; b++) {
            const ex = examples[Math.floor(rand.u() * examples.length)];
            const cx = 2 * Math.floor(rand.u() * (ex.w - crop / 2 + 1)), cy = 2 * Math.floor(rand.u() * (ex.h - crop / 2 + 1));
            const g = cropLoss(net, ex, cx, cy, crop);
            loss += g.loss / batch;
            if (!acc) acc = g.grads.map((q) => ({ dW: q.dW.map((v) => v / batch), db: q.db.map((v) => v / batch) }));
            else g.grads.forEach((q, i) => { for (let j = 0; j < q.dW.length; j++) acc[i].dW[j] += q.dW[j] / batch; for (let j = 0; j < q.db.length; j++) acc[i].db[j] += q.db[j] / batch; });
        }
        adamStep(net, acc, state, adam);
        losses.push(loss);
        if (onStep) onStep(step, loss, net);
    }
    return { net, losses };
}

/** One crop's loss and gradients, its taps read from the padded half-size frame upCrop gives (offset by its two-texel pad). */
export function cropLoss(net, ex, cx, cy, size) {
    const C = upCrop(ex, cx, cy, size), W = size, H = size;
    // the crop's own half frame, as a (size/2) x (size/2) image whose taps the network reads -- re-indexed into the padded copy
    const view = { half: C.half, w: C.hw, h: C.hw, off: C.pad };
    return upLossAndGradsAt(net, C.x, view, W, H, C.ref, C.cov, C.E, C.easuUp);
}

// upLossAndGrads over a crop whose half-size frame is a padded window: full-size pixel (X, Y) of the crop reads its taps at
// half-size (X / 2 + off) in the window -- the same 4 x 4 the whole frame's pixel reads, unclamped except at the frame's own edge
function upLossAndGradsAt(net, x, view, W, H, ref, cov, E, easuUp = null) {
    const K = tapsOf(net), N = W * H * 3, acts = netForward(net, x, H, W), z = acts[acts.length - 1], { half, w: hw, off } = view;
    const taps = (X, Y) => { const u = (X + 0.5) / 2 - 0.5 + off, v = (Y + 0.5) / 2 - 0.5 + off, x0 = Math.floor(u) - 1, y0 = Math.floor(v) - 1, o = new Int32Array(UP_TAPS);
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) o[j * 4 + i] = (y0 + j) * hw + (x0 + i); return o; };
    let loss = 0; const gY = new Float64Array(N), dz = new Float64Array(W * H * K);
    const val = (t, p, T, c) => (t < UP_TAPS ? half[T[t] * 3 + c] : easuUp[p * 3 + c]);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const p = Y * W + X, T = taps(X, Y), wt = new Float64Array(K);
        let m = -Infinity; for (let t = 0; t < K; t++) m = Math.max(m, z[p * K + t]);
        let s = 0; for (let t = 0; t < K; t++) s += (wt[t] = Math.exp(z[p * K + t] - m));
        const yv = [0, 0, 0]; for (let t = 0; t < K; t++) { wt[t] /= s; for (let c = 0; c < 3; c++) yv[c] += wt[t] * val(t, p, T, c); }
        for (let c = 0; c < 3; c++) { const i = p * 3 + c, o = E[i] + (1 - cov[p]) * yv[c], to = toPerceptual(o), tr = toPerceptual(ref[i]), den = tr * tr + REL_EPS, e = to - tr;
            loss += e * e / den; gY[i] = 2 * e / den / N * dToPerceptual(o) * (1 - cov[p]); }
        const g = new Float64Array(K); let sg = 0;
        for (let t = 0; t < K; t++) { g[t] = gY[p * 3] * val(t, p, T, 0) + gY[p * 3 + 1] * val(t, p, T, 1) + gY[p * 3 + 2] * val(t, p, T, 2); sg += wt[t] * g[t]; }
        for (let t = 0; t < K; t++) dz[p * K + t] = wt[t] * (g[t] - sg);
    }
    return { loss: loss / N, ...netBackward(net, acts, H, W, dz) };
}

// ---- THE PATH TRACER's FRAMES (section 148's examples) --------------------------------------------------------------------
/**
 * One example of round 65: scene `family`/`seed` at W x H (W = 2w): its half-size frame at sppIn through the shipped network and
 * the emitter fill (the chain's frame before the upscale, light-free), the full-size guides U reads, the light sources at full
 * size, and the references. With it the round's arms: `easu` and `bilinear` -- the chain with each upscale in U's place,
 * composited -- and `noisy`, the half-size input upscaled bilinearly and composited (C1's floor). `net` is the shipped denoiser.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. ***
 */
export function upscaleExample(family, seed, net, { harvest = false, W = 256, H = 256, sppIn = 4, sppRef = 32, ref2 = false } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`learnedUpscale: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    if (W % 2 || H % 2) throw new Error(`learnedUpscale: a ${W} x ${H} frame has no half size`);
    const S = makeScene(family, seed), rs = renderSeedsUpscale(seed), w = W / 2, h = H / 2;
    const opts = (ww, hh, spp, sd) => ({ w: ww, h: hh, spp, seed: sd, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const input = render(S.scene, opts(w, h, sppIn, rs.half)), gh = guideBuffers(S, w, h), covHalf = emitterCoverage(S, w, h);
    const x = withMask(inputChannels(input, gh.albedo, gh.normal, w, h), covHalf), den = denoise(net, x, h, w).y, half = fillEmitters(den, covHalf, w, h);
    const g = guideBuffers(S, W, H), hits = firstHits(S, S.eye, W, H), B = cameraBasis(S), depth = new Float64Array(W * H).fill(1e9);
    for (let p = 0; p < W * H; p++) if (hits.obj[p] >= 0) depth[p] = (hits.pos[p * 3] - S.eye[0]) * B.fwd[0] + (hits.pos[p * 3 + 1] - S.eye[1]) * B.fwd[1] + (hits.pos[p * 3 + 2] - S.eye[2]) * B.fwd[2];
    const full = emitterRadiance(S, W, H), noisyHalf = fillEmitters(Float64Array.from(input), covHalf, w, h), easuUp = upscale(half, w, h, W, H, "easu");
    return { family, seed, w, h, half, easuUp, x: upscaleInput(half, w, h, g.albedo, g.normal, depth), cov: full.cov, E: full.E,
             ref: render(S.scene, opts(W, H, sppRef, rs.ref)), ...(ref2 ? { ref2: render(S.scene, opts(W, H, sppRef, rs.ref2)) } : {}),
             easu: compositeEmitters(easuUp, full), bilinear: compositeEmitters(upscale(half, w, h, W, H, "bilinear"), full),
             noisy: compositeEmitters(upscale(noisyHalf, w, h, W, H, "bilinear"), full) };
}
/** U's chain on an example: U in the upscale's place, composited as the others are. */
export const upscaleChain = (net, ex) => compositeEmitters(learnedUpscale(net, ex.x, ex.half, ex.w, ex.h, tapsOf(net) === UPE_TAPS ? ex.easuUp : null).y, { cov: ex.cov, E: ex.E });
