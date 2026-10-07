// WebGLEngine/render/denoiseNet.mjs -- the denoiser arc, round 2: the network the pre-registration fixed, and its training
//
// render/learned-denoiser-preregistration.md section 5, as code: four brain/conv2d.mjs layers, 9 -> 16 -> 16 -> 16 -> 3,
// whose output is ADDED to the noisy irradiance (a residual) and then re-modulated by the albedo; trained by Adam on
// relative MSE -- the verdict's own metric, render/denoiseStats.mjs's relMSE -- over batches of random crops, every
// random number from the run's one seeded stream. Gated by render/denoiseNet-selfcheck.mjs on synthetic data only.
"use strict";
import { seededRandom, initNet, netForward, netBackward, adamState, adamStep, ADAM, paramCount } from "../brain/convNet.mjs";
import { CHANNELS, ALBEDO_FLOOR } from "./denoiseScenes.mjs";
import { REL_EPS } from "./denoiseStats.mjs";

/** The pre-registered shape: [Cin, Cout, act] per 3 x 3 layer. 6,387 parameters. */
export const SHAPE = Object.freeze([Object.freeze([CHANNELS, 16, "relu"]), Object.freeze([16, 16, "relu"]), Object.freeze([16, 16, "relu"]), Object.freeze([16, 3, "none"])]);
/** The pre-registered schedule. */
export const TRAIN = Object.freeze({ steps: 1500, batch: 4, crop: 32 });

export const makeDenoiser = (seed) => initNet(SHAPE, seededRandom(seed));
export { paramCount };

/** The network's final image for a 9-channel input: (noisy irradiance + output) x max(albedo, floor), H x W x 3. */
export function denoise(net, x, H, W) {
    const acts = netForward(net, x, H, W), out = acts[acts.length - 1];
    return { y: remodulated(x, out, H * W), acts };
}
function remodulated(x, out, n) {
    const y = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = (x[p * CHANNELS + c] + out[p * 3 + c]) * Math.max(x[p * CHANNELS + 3 + c], ALBEDO_FLOOR);
    return y;
}

/**
 * relMSE of the denoised image against `ref`, and its gradient with respect to every weight. The loss's gradient
 * with respect to the network's output is 2 (y - r) / (r^2 + eps) / N times the albedo the output was multiplied by.
 */
export function lossAndGrads(net, x, ref, H, W) {
    const { y, acts } = denoise(net, x, H, W), N = y.length;
    let loss = 0;
    const dOut = new Float64Array(H * W * 3);
    for (let i = 0; i < N; i++) {
        const den = ref[i] * ref[i] + REL_EPS, e = y[i] - ref[i];
        loss += e * e / den;
        const p = (i / 3) | 0, c = i % 3;
        dOut[i] = 2 * e / den / N * Math.max(x[p * CHANNELS + 3 + c], ALBEDO_FLOOR);
    }
    return { loss: loss / N, ...netBackward(net, acts, H, W, dOut) };
}

/** A size x size window of a 9-channel input and its reference, at (cx, cy). */
export function cropAt(x, ref, W, cx, cy, size) {
    const cxs = new Float64Array(size * size * CHANNELS), crs = new Float64Array(size * size * 3);
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
        const s = (cy + y) * W + (cx + xx), d = y * size + xx;
        for (let c = 0; c < CHANNELS; c++) cxs[d * CHANNELS + c] = x[s * CHANNELS + c];
        for (let c = 0; c < 3; c++) crs[d * 3 + c] = ref[s * 3 + c];
    }
    return { x: cxs, ref: crs };
}

/**
 * Train a denoiser on `images` ([{ x, ref, w, h }]): `steps` Adam steps, each on `batch` crops of `crop` x `crop`,
 * the image and the crop corner drawn from the seed's stream AFTER the initial weights. The batch's gradient is the
 * mean of its crops'. Returns { net, losses } with the batch loss of every step.
 */
export function trainDenoiser(images, { seed, steps = TRAIN.steps, batch = TRAIN.batch, crop = TRAIN.crop, adam = ADAM, onStep = null } = {}) {
    if (!Number.isInteger(seed)) throw new Error("denoiseNet: training needs an integer seed -- it seeds the weights, the crops and the batch order");
    if (!images.length || images.some((im) => im.w < crop || im.h < crop)) throw new Error(`denoiseNet: every training image must be at least ${crop} x ${crop}`);
    const rand = seededRandom(seed), net = initNet(SHAPE, rand), state = adamState(net), losses = [];
    for (let step = 0; step < steps; step++) {
        let loss = 0, acc = null;
        for (let b = 0; b < batch; b++) {
            const im = images[Math.floor(rand.u() * images.length)];
            const cx = Math.floor(rand.u() * (im.w - crop + 1)), cy = Math.floor(rand.u() * (im.h - crop + 1));
            const C = cropAt(im.x, im.ref, im.w, cx, cy, crop), g = lossAndGrads(net, C.x, C.ref, crop, crop);
            loss += g.loss / batch;
            if (!acc) acc = g.grads.map((q) => ({ dW: q.dW.map((v) => v / batch), db: q.db.map((v) => v / batch) }));
            else g.grads.forEach((q, i) => { for (let j = 0; j < q.dW.length; j++) acc[i].dW[j] += q.dW[j] / batch; for (let j = 0; j < q.db.length; j++) acc[i].db[j] += q.db[j] / batch; });
        }
        adamStep(net, acc, state, adam);
        losses.push(loss);
        if (onStep) onStep(step, loss);
    }
    return { net, losses };
}
