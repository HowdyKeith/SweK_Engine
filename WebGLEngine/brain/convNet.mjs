// WebGLEngine/brain/convNet.mjs -- the denoiser arc, round 2: a stack of brain/conv2d.mjs layers, and how it learns
//
// Generic on purpose: a network of convolution layers, its seeded initialisation, its forward and backward pass, and
// Adam -- nothing about denoising. render/denoiseNet.mjs puts a loss and a training loop around it for the path-tracer
// denoiser, and an upscaler would put a different one around the same stack. f64 throughout: training runs on the
// CPU, against conv2d.mjs's reference passes; the device kernels are for inference.
//
// *** THE SEED SEEDS EVERYTHING, OR IT SEEDS NOTHING. *** v4698 found brain/learn.js's MLPTrainer drew its minibatches
// from Math.random, so "seed 1" fixed the initial weights and nothing after them -- two runs with one seed shared 0 of
// 192 weights. Here every random number a run consumes comes from one seededRandom() stream the caller passes in,
// and render/denoiseNet-selfcheck.mjs holds two runs of one seed to bit-identical weights (control C4).
"use strict";
import { conv2dForward, conv2dBackward } from "./conv2d.mjs";

/** Adam's defaults, as the pre-registration fixed them. */
export const ADAM = Object.freeze({ lr: 1e-3, beta1: 0.9, beta2: 0.999, eps: 1e-8 });

/** One deterministic stream: u() uniform in [0, 1), gauss() standard normal (Box-Muller, both values used). */
export function seededRandom(seed) {
    let s = (seed >>> 0) || 1, spare = null;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => {
        if (spare !== null) { const v = spare; spare = null; return v; }
        const a = Math.max(u(), 1e-300), b = u(), m = Math.sqrt(-2 * Math.log(a));
        spare = m * Math.sin(2 * Math.PI * b); return m * Math.cos(2 * Math.PI * b);
    };
    return { u, gauss };
}

/**
 * A network of k x k layers from [[Cin, Cout, act], ...]: He-normal weights (std sqrt(2 / (k k Cin))), zero biases. A
 * layer may name its own width as a fourth entry, [Cin, Cout, act, k] -- the kernel-predicting head's 1 x 1 output
 * layer does; a shape that names none draws exactly what it drew before.
 */
export function initNet(shape, rand, k = 3) {
    for (let i = 1; i < shape.length; i++) if (shape[i][0] !== shape[i - 1][1]) throw new Error(`convNet: layer ${i} takes ${shape[i][0]} channels, layer ${i - 1} gives ${shape[i - 1][1]}`);
    return { layers: shape.map(([Cin, Cout, act, kl = k]) => {
        const std = Math.sqrt(2 / (kl * kl * Cin)), W = new Float64Array(Cout * kl * kl * Cin);
        for (let i = 0; i < W.length; i++) W[i] = rand.gauss() * std;
        return { Cin, Cout, k: kl, W, b: new Float64Array(Cout), act };
    }) };
}
export const paramCount = (net) => net.layers.reduce((a, L) => a + L.W.length + L.b.length, 0);

/** The forward pass, keeping every activation: acts[0] is the input, acts[i + 1] layer i's output. */
export function netForward(net, x, H, W) {
    const acts = [x];
    for (const L of net.layers) acts.push(conv2dForward(acts[acts.length - 1], H, W, L));
    return acts;
}

/**
 * The backward pass from dOut, the loss's gradient with respect to the network's output. Uses the activations
 * netForward kept, so no layer's forward pass is run again. Returns per layer { dW, db }, and dX for the input.
 */
export function netBackward(net, acts, H, W, dOut) {
    const grads = new Array(net.layers.length);
    let d = dOut;
    for (let i = net.layers.length - 1; i >= 0; i--) {
        const g = conv2dBackward(acts[i], H, W, net.layers[i], d, { y: acts[i + 1] });
        grads[i] = { dW: g.dW, db: g.db };
        d = g.dX;
    }
    return { grads, dX: d };
}

/** Adam's state for a network: first and second moments for every weight and bias, and the step count. */
export function adamState(net) {
    return { t: 0, m: net.layers.map((L) => ({ W: new Float64Array(L.W.length), b: new Float64Array(L.b.length) })),
             v: net.layers.map((L) => ({ W: new Float64Array(L.W.length), b: new Float64Array(L.b.length) })) };
}
/** One Adam step, in place, with bias correction. */
export function adamStep(net, grads, state, { lr, beta1, beta2, eps } = ADAM) {
    state.t++;
    const c1 = 1 - beta1 ** state.t, c2 = 1 - beta2 ** state.t;
    net.layers.forEach((L, i) => {
        for (const [P, G, M, V] of [[L.W, grads[i].dW, state.m[i].W, state.v[i].W], [L.b, grads[i].db, state.m[i].b, state.v[i].b]])
            for (let j = 0; j < P.length; j++) {
                M[j] = beta1 * M[j] + (1 - beta1) * G[j];
                V[j] = beta2 * V[j] + (1 - beta2) * G[j] * G[j];
                P[j] -= lr * (M[j] / c1) / (Math.sqrt(V[j] / c2) + eps);
            }
    });
}
/** A deep copy of a network's weights, for comparing two runs or keeping a snapshot. */
export const cloneNet = (net) => ({ layers: net.layers.map((L) => ({ ...L, W: Float64Array.from(L.W), b: Float64Array.from(L.b) })) });
