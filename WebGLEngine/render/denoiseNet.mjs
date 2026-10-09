// WebGLEngine/render/denoiseNet.mjs -- the denoiser arc, round 2: the network the pre-registration fixed, and its training
//
// render/learned-denoiser-preregistration.md section 5, as code: four brain/conv2d.mjs layers, 9 -> 16 -> 16 -> 16 -> 3,
// whose output is ADDED to the noisy irradiance (a residual) and then re-modulated by the albedo; trained by Adam on
// relative MSE -- the verdict's own metric, render/denoiseStats.mjs's relMSE -- over batches of random crops, every
// random number from the run's one seeded stream. Gated by render/denoiseNet-selfcheck.mjs on synthetic data only.
"use strict";
import { seededRandom, initNet, netForward, netBackward, adamState, adamStep, ADAM, paramCount } from "../brain/convNet.mjs";
import { CHANNELS, ALBEDO_FLOOR, strideOf } from "./denoiseScenes.mjs";
import { maskChannelOf } from "./denoiseMask.mjs";
import { REL_EPS } from "./denoiseStats.mjs";

/** The pre-registered shape: [Cin, Cout, act] per 3 x 3 layer. 6,387 parameters. */
export const SHAPE = Object.freeze([Object.freeze([CHANNELS, 16, "relu"]), Object.freeze([16, 16, "relu"]), Object.freeze([16, 16, "relu"]), Object.freeze([16, 3, "none"])]);
/** The pre-registered schedule. */
export const TRAIN = Object.freeze({ steps: 1500, batch: 4, crop: 32 });
/** Section 28's longer schedule: the same batches and crops, three times the steps. */
export const TRAIN_LONG = Object.freeze({ steps: 4500, batch: 4, crop: 32 });

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

/**
 * Section 28's larger kernel network: FOUR 3 x 3 layers of 32, so its receptive field is 9 x 9 -- exactly the window
 * whose weights it predicts (the small one's three layers see 7 x 7) -- then the same 1 x 1 head. 33,329 parameters
 * with the mask (the small one: 7,473). Its hidden width is the device kernel's COUT_MAX.
 */
export const SHAPE_KERNEL_LARGE = Object.freeze([Object.freeze([CHANNELS, 32, "relu"]), Object.freeze([32, 32, "relu"]), Object.freeze([32, 32, "relu"]),
                                                 Object.freeze([32, 32, "relu"]), Object.freeze([32, KERNEL_TAPS, "none", 1])]);
export const SIZES = Object.freeze(["small", "large"]);

/**
 * The shape for a head, an input width and a size: the first layer takes `cin` channels (9, the mask's 10, or the
 * temporal round's 13). "large" exists for the kernel head only.
 */
export function shapeFor(head, cin = CHANNELS, size = "small") {
    if (!SIZES.includes(size)) throw new Error(`denoiseNet: size "${size}" is not one of ${SIZES.join(", ")}`);
    if (size === "large" && head !== "kernel") throw new Error("denoiseNet: the large network is a kernel-predicting network");
    const base = size === "large" ? SHAPE_KERNEL_LARGE : head === "kernel" ? SHAPE_KERNEL : SHAPE;
    return cin === CHANNELS ? base : Object.freeze([Object.freeze([cin, ...base[0].slice(1)]), ...base.slice(1)]);
}
function initDenoiser(rand, init, head = "residual", cin = CHANNELS, size = "small") {
    if (!INITS.includes(init)) throw new Error(`denoiseNet: init "${init}" is not one of ${INITS.join(", ")}`);
    if (!HEADS.includes(head)) throw new Error(`denoiseNet: head "${head}" is not one of ${HEADS.join(", ")}`);
    const net = initNet(shapeFor(head, cin, size), rand);
    if (init === "zero-last") net.layers[net.layers.length - 1].W.fill(0);
    return net;
}
export const makeDenoiser = (seed, init = INIT, head = "residual", cin = CHANNELS, size = "small") => initDenoiser(seededRandom(seed), init, head, cin, size);
export { paramCount };

/**
 * The network's final image for a 9-channel input, H x W x 3: (noisy irradiance + output) x max(albedo, floor) for the
 * residual head; (the kernel-weighted noisy irradiance) x max(albedo, floor) for the kernel head, which also returns
 * its per-pixel weights `w` (H x W x KERNEL_TAPS, zero on taps outside the image).
 */
export function denoise(net, x, H, W) {
    // the input's width must be the network's: a 9-channel network handed a 10-channel image would read it at the wrong
    // stride and return finite nonsense (round 7 found exactly that, unseen, in a comparison path)
    const C = strideOf(x, H * W);
    if (net.layers[0].Cin !== C) throw new Error(`denoiseNet: a network of ${net.layers[0].Cin} input channels was handed an input of ${C}`);
    const acts = netForward(net, x, H, W), out = acts[acts.length - 1];
    if (headOf(net) === "kernel") return { ...kernelApply(x, out, H, W), acts };
    return { y: remodulated(x, out, H * W), acts };
}
function kernelApply(x, logits, H, W) {
    const C = strideOf(x, H * W), mc = maskChannelOf(C), R = KERNEL_RADIUS, D = 2 * R + 1, T = KERNEL_TAPS, y = new Float64Array(H * W * 3), w = new Float64Array(H * W * T);
    // a tap the kernel may weigh: inside the image and -- with an emitter mask (section 21) -- on the pixel's own side of it
    const ok = (p, qy, qx) => qy >= 0 && qy < H && qx >= 0 && qx < W && (mc < 0 || x[(qy * W + qx) * C + mc] === x[p * C + mc]);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const p = py * W + px;
        let m = -Infinity;
        for (let t = 0; t < T; t++) { const qy = py + ((t / D) | 0) - R, qx = px + (t % D) - R; if (ok(p, qy, qx)) m = Math.max(m, logits[p * T + t]); }
        let sum = 0;
        for (let t = 0; t < T; t++) { const qy = py + ((t / D) | 0) - R, qx = px + (t % D) - R; if (ok(p, qy, qx)) sum += (w[p * T + t] = Math.exp(logits[p * T + t] - m)); }
        let r = 0, g = 0, b = 0;
        for (let t = 0; t < T; t++) {
            const wt = (w[p * T + t] /= sum);
            if (wt === 0) continue;
            const q = (py + ((t / D) | 0) - R) * W + (px + (t % D) - R);
            r += wt * x[q * C]; g += wt * x[q * C + 1]; b += wt * x[q * C + 2];
        }
        y[p * 3] = r * Math.max(x[p * C + 3], ALBEDO_FLOOR); y[p * 3 + 1] = g * Math.max(x[p * C + 4], ALBEDO_FLOOR);
        y[p * 3 + 2] = b * Math.max(x[p * C + 5], ALBEDO_FLOOR);
    }
    return { y, w };
}
/** dL/dlogits for the kernel head, from gIrr = dL/d(weighted irradiance): the softmax's Jacobian, tap by tap. */
function kernelBackward(x, w, gIrr, H, W) {
    const C = strideOf(x, H * W), R = KERNEL_RADIUS, D = 2 * R + 1, T = KERNEL_TAPS, dz = new Float64Array(H * W * T), g = new Float64Array(T);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const p = py * W + px;
        let s = 0;
        for (let t = 0; t < T; t++) {
            if (w[p * T + t] === 0) { g[t] = 0; continue; }
            const q = (py + ((t / D) | 0) - R) * W + (px + (t % D) - R);
            g[t] = gIrr[p * 3] * x[q * C] + gIrr[p * 3 + 1] * x[q * C + 1] + gIrr[p * 3 + 2] * x[q * C + 2];
            s += w[p * T + t] * g[t];
        }
        for (let t = 0; t < T; t++) dz[p * T + t] = w[p * T + t] * (g[t] - s);
    }
    return dz;
}
function remodulated(x, out, n) {
    const C = strideOf(x, n), y = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = (x[p * C + c] + out[p * 3 + c]) * Math.max(x[p * C + 3 + c], ALBEDO_FLOOR);
    return y;
}

/**
 * relMSE of the denoised image against `ref`, and its gradient with respect to every weight. The loss's gradient
 * with respect to the network's output is 2 (y - r) / (r^2 + eps) / N times the albedo the output was multiplied by;
 * the kernel head carries it on through the weighted sum and the softmax to its logits.
 */
export function lossAndGrads(net, x, ref, H, W) {
    const { y, acts, w } = denoise(net, x, H, W), N = y.length, C = strideOf(x, H * W);
    let loss = 0;
    const dOut = new Float64Array(H * W * 3);
    for (let i = 0; i < N; i++) {
        const den = ref[i] * ref[i] + REL_EPS, e = y[i] - ref[i];
        loss += e * e / den;
        const p = (i / 3) | 0, c = i % 3;
        dOut[i] = 2 * e / den / N * Math.max(x[p * C + 3 + c], ALBEDO_FLOOR);
    }
    // dOut is dL/d(irradiance before remodulation): the residual's output itself, or the kernel's weighted sum
    return { loss: loss / N, ...netBackward(net, acts, H, W, w ? kernelBackward(x, w, dOut, H, W) : dOut) };
}

/** A size x size window of an input (every channel, at its stride) and its reference, at (cx, cy). */
export function cropAt(x, ref, W, cx, cy, size) {
    const C = strideOf(x, ref.length / 3), cxs = new Float64Array(size * size * C), crs = new Float64Array(size * size * 3);
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
        const s = (cy + y) * W + (cx + xx), d = y * size + xx;
        for (let c = 0; c < C; c++) cxs[d * C + c] = x[s * C + c];
        for (let c = 0; c < 3; c++) crs[d * 3 + c] = ref[s * 3 + c];
    }
    return { x: cxs, ref: crs };
}

/**
 * Train a denoiser on `images` ([{ x, ref, w, h }]): `steps` Adam steps, each on `batch` crops of `crop` x `crop`,
 * the image and the crop corner drawn from the seed's stream AFTER the initial weights. The batch's gradient is the
 * mean of its crops'. Returns { net, losses } with the batch loss of every step.
 */
export function trainDenoiser(images, { seed, steps = TRAIN.steps, batch = TRAIN.batch, crop = TRAIN.crop, adam = ADAM, init = INIT, head = "residual", size = "small", onStep = null,
                                         checkpoint = null } = {}) {
    if (!Number.isInteger(seed)) throw new Error("denoiseNet: training needs an integer seed -- it seeds the weights, the crops and the batch order");
    if (!images.length || images.some((im) => im.w < crop || im.h < crop)) throw new Error(`denoiseNet: every training image must be at least ${crop} x ${crop}`);
    const rand = seededRandom(seed), net = initDenoiser(rand, init, head, strideOf(images[0].x, images[0].w * images[0].h), size), state = adamState(net), losses = [];
    // section 30: with `checkpoint` ({ every, load, save }), the training's whole state -- weights, Adam's moments and
    // step, the stream's position, the losses so far -- is saved every `every` steps, and a saved one is picked up where
    // it stopped. The state is restored AFTER the network is initialised, so the stream is where an unbroken run's is.
    let start = 0;
    const saved = checkpoint ? checkpoint.load() : null;
    if (saved) {
        if (!(saved.step > 0 && saved.step < steps) || saved.layers.length !== net.layers.length ||
            saved.layers.some((L, i) => L.W.length !== net.layers[i].W.length || L.b.length !== net.layers[i].b.length)) throw new Error("denoiseNet: a checkpoint for another training");
        net.layers.forEach((L, i) => { L.W.set(saved.layers[i].W); L.b.set(saved.layers[i].b); });
        state.t = saved.adam.t;
        for (const k of ["m", "v"]) state[k].forEach((q, i) => { q.W.set(saved.adam[k][i].W); q.b.set(saved.adam[k][i].b); });
        rand.restore(saved.rng);
        losses.push(...saved.losses);
        start = saved.step;
    }
    for (let step = start; step < steps; step++) {
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
        if (checkpoint && (step + 1) % checkpoint.every === 0 && step + 1 < steps)
            checkpoint.save({ step: step + 1, layers: net.layers.map((L) => ({ W: L.W, b: L.b })), adam: { t: state.t, m: state.m, v: state.v }, rng: rand.state(),
                              losses: Float64Array.from(losses) });
        if (onStep) onStep(step, loss, net);
    }
    return { net, losses };
}
