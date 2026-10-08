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

/**
 * The initialisation. Round 1 drew He-normal weights for every layer ("he"); its harvest found the residual's He-drawn
 * LAST layer adds noise at step 0 and Adam settles in the identity (pre-registration section 12). Section 13 fixes
 * "zero-last": the same draws from the same stream, then the last layer's weights set to zero, so an untrained network
 * is exactly the identity and every later draw (crops, batch order) is the one round 1 made.
 */
export const INITS = Object.freeze(["he", "zero-last"]);
export const INIT = "zero-last";

/**
 * The output heads. "residual" (rounds 1 and 2): three channels ADDED to the noisy irradiance. "kernel" (section 15):
 * the same three hidden layers, then a 1 x 1 layer to KERNEL_TAPS logits per pixel; a softmax over the taps that fall
 * inside the image turns them into weights, and the output irradiance is the weighted sum of the NOISY irradiance
 * over the 9 x 9 window -- the filter's window -- one kernel shared by r, g and b. Its output is always an average of
 * real samples. A network's head is read from its last layer's width, so a cloned or deserialised net keeps it.
 */
export const HEADS = Object.freeze(["residual", "kernel"]);
export const KERNEL_RADIUS = 4;
export const KERNEL_TAPS = (2 * KERNEL_RADIUS + 1) ** 2;
export const SHAPE_KERNEL = Object.freeze([...SHAPE.slice(0, -1), Object.freeze([16, KERNEL_TAPS, "none", 1])]);
export const headOf = (net) => (net.layers[net.layers.length - 1].Cout === KERNEL_TAPS ? "kernel" : "residual");

function initDenoiser(rand, init, head = "residual") {
    if (!INITS.includes(init)) throw new Error(`denoiseNet: init "${init}" is not one of ${INITS.join(", ")}`);
    if (!HEADS.includes(head)) throw new Error(`denoiseNet: head "${head}" is not one of ${HEADS.join(", ")}`);
    const net = initNet(head === "kernel" ? SHAPE_KERNEL : SHAPE, rand);
    if (init === "zero-last") net.layers[net.layers.length - 1].W.fill(0);
    return net;
}
export const makeDenoiser = (seed, init = INIT, head = "residual") => initDenoiser(seededRandom(seed), init, head);
export { paramCount };

/**
 * The network's final image for a 9-channel input, H x W x 3: (noisy irradiance + output) x max(albedo, floor) for the
 * residual head; (the kernel-weighted noisy irradiance) x max(albedo, floor) for the kernel head, which also returns
 * its per-pixel weights `w` (H x W x KERNEL_TAPS, zero on taps outside the image).
 */
export function denoise(net, x, H, W) {
    const acts = netForward(net, x, H, W), out = acts[acts.length - 1];
    if (headOf(net) === "kernel") return { ...kernelApply(x, out, H, W), acts };
    return { y: remodulated(x, out, H * W), acts };
}
function kernelApply(x, logits, H, W) {
    const R = KERNEL_RADIUS, D = 2 * R + 1, T = KERNEL_TAPS, y = new Float64Array(H * W * 3), w = new Float64Array(H * W * T);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const p = py * W + px;
        let m = -Infinity;
        for (let t = 0; t < T; t++) { const qy = py + ((t / D) | 0) - R, qx = px + (t % D) - R; if (qy >= 0 && qy < H && qx >= 0 && qx < W) m = Math.max(m, logits[p * T + t]); }
        let sum = 0;
        for (let t = 0; t < T; t++) { const qy = py + ((t / D) | 0) - R, qx = px + (t % D) - R; if (qy >= 0 && qy < H && qx >= 0 && qx < W) sum += (w[p * T + t] = Math.exp(logits[p * T + t] - m)); }
        let r = 0, g = 0, b = 0;
        for (let t = 0; t < T; t++) {
            const wt = (w[p * T + t] /= sum);
            if (wt === 0) continue;
            const q = (py + ((t / D) | 0) - R) * W + (px + (t % D) - R);
            r += wt * x[q * CHANNELS]; g += wt * x[q * CHANNELS + 1]; b += wt * x[q * CHANNELS + 2];
        }
        y[p * 3] = r * Math.max(x[p * CHANNELS + 3], ALBEDO_FLOOR); y[p * 3 + 1] = g * Math.max(x[p * CHANNELS + 4], ALBEDO_FLOOR);
        y[p * 3 + 2] = b * Math.max(x[p * CHANNELS + 5], ALBEDO_FLOOR);
    }
    return { y, w };
}
/** dL/dlogits for the kernel head, from gIrr = dL/d(weighted irradiance): the softmax's Jacobian, tap by tap. */
function kernelBackward(x, w, gIrr, H, W) {
    const R = KERNEL_RADIUS, D = 2 * R + 1, T = KERNEL_TAPS, dz = new Float64Array(H * W * T), g = new Float64Array(T);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const p = py * W + px;
        let s = 0;
        for (let t = 0; t < T; t++) {
            if (w[p * T + t] === 0) { g[t] = 0; continue; }
            const q = (py + ((t / D) | 0) - R) * W + (px + (t % D) - R);
            g[t] = gIrr[p * 3] * x[q * CHANNELS] + gIrr[p * 3 + 1] * x[q * CHANNELS + 1] + gIrr[p * 3 + 2] * x[q * CHANNELS + 2];
            s += w[p * T + t] * g[t];
        }
        for (let t = 0; t < T; t++) dz[p * T + t] = w[p * T + t] * (g[t] - s);
    }
    return dz;
}
function remodulated(x, out, n) {
    const y = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = (x[p * CHANNELS + c] + out[p * 3 + c]) * Math.max(x[p * CHANNELS + 3 + c], ALBEDO_FLOOR);
    return y;
}

/**
 * relMSE of the denoised image against `ref`, and its gradient with respect to every weight. The loss's gradient
 * with respect to the network's output is 2 (y - r) / (r^2 + eps) / N times the albedo the output was multiplied by;
 * the kernel head carries it on through the weighted sum and the softmax to its logits.
 */
export function lossAndGrads(net, x, ref, H, W) {
    const { y, acts, w } = denoise(net, x, H, W), N = y.length;
    let loss = 0;
    const dOut = new Float64Array(H * W * 3);
    for (let i = 0; i < N; i++) {
        const den = ref[i] * ref[i] + REL_EPS, e = y[i] - ref[i];
        loss += e * e / den;
        const p = (i / 3) | 0, c = i % 3;
        dOut[i] = 2 * e / den / N * Math.max(x[p * CHANNELS + 3 + c], ALBEDO_FLOOR);
    }
    // dOut is dL/d(irradiance before remodulation): the residual's output itself, or the kernel's weighted sum
    return { loss: loss / N, ...netBackward(net, acts, H, W, w ? kernelBackward(x, w, dOut, H, W) : dOut) };
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
export function trainDenoiser(images, { seed, steps = TRAIN.steps, batch = TRAIN.batch, crop = TRAIN.crop, adam = ADAM, init = INIT, head = "residual", onStep = null } = {}) {
    if (!Number.isInteger(seed)) throw new Error("denoiseNet: training needs an integer seed -- it seeds the weights, the crops and the batch order");
    if (!images.length || images.some((im) => im.w < crop || im.h < crop)) throw new Error(`denoiseNet: every training image must be at least ${crop} x ${crop}`);
    const rand = seededRandom(seed), net = initDenoiser(rand, init, head), state = adamState(net), losses = [];
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
