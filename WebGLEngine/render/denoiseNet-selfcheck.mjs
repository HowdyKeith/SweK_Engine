// WebGLEngine/render/denoiseNet-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseNet-selfcheck.mjs
//
// GATES render/denoiseNet.mjs -- the pre-registered network and its training -- on SYNTHETIC images only (smooth
// irradiance fields with noise, no path-traced scene). Its exports, each named here: SHAPE, TRAIN, makeDenoiser,
// paramCount, denoise, lossAndGrads, cropAt, trainDenoiser.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   L1  the residual removed: the output IS the irradiance                       1 RED
//   L2  the loss gradient misses the albedo the output was multiplied by         1 RED
//   L3  the batch's image chosen by Math.random -- v4698's defect, planted       1 RED (C4)
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SHAPE, TRAIN, makeDenoiser, paramCount, denoise, lossAndGrads, cropAt, trainDenoiser } = await imp("render/denoiseNet.mjs");
const { relMSE } = await imp("render/denoiseStats.mjs");
const { CHANNELS } = await imp("render/denoiseScenes.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// a synthetic image: a smooth irradiance field, a two-tone albedo, an up normal, noise of sigma `s`
let seed = 41;
const u = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const synth = (w, h, k, s = 0.3) => {
    const x = new Float64Array(w * h * CHANNELS), ref = new Float64Array(w * h * 3);
    for (let p = 0; p < w * h; p++) {
        const px = p % w, py = (p / w) | 0, I = 0.5 + 0.4 * Math.sin(px / 5 + k) * Math.cos(py / 7 + k);
        for (let c = 0; c < 3; c++) {
            const a = px < w / 2 ? 0.3 + 0.2 * c : 0.8 - 0.2 * c;
            x[p * CHANNELS + c] = Math.max(0, I + s * (u() - 0.5) * 2); x[p * CHANNELS + 3 + c] = a; x[p * CHANNELS + 6 + c] = c === 1 ? 1 : 0;
            ref[p * 3 + c] = I * a;
        }
    }
    return { x, ref, w, h };
};
const noisyRadiance = (im) => { const y = new Float64Array(im.w * im.h * 3);
    for (let p = 0; p < im.w * im.h; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = im.x[p * CHANNELS + c] * im.x[p * CHANNELS + 3 + c]; return y; };

console.log("1. THE NETWORK THE PRE-REGISTRATION FIXED");
{
    ok("  9 -> 16 -> 16 -> 16 -> 3, relu, relu, relu, none: 6,387 parameters", JSON.stringify(SHAPE) === JSON.stringify([[9, 16, "relu"], [16, 16, "relu"], [16, 16, "relu"], [16, 3, "none"]]) &&
        paramCount(makeDenoiser(1)) === 6387);
    ok("  1,500 steps of 4 crops of 32 x 32", TRAIN.steps === 1500 && TRAIN.batch === 4 && TRAIN.crop === 32);
    const net = makeDenoiser(1); net.layers.forEach((L) => { L.W.fill(0); L.b.fill(0); });
    const im = synth(12, 10, 0), { y } = denoise(net, im.x, 10, 12);
    ok("!! with every weight zero the output is the noisy image itself -- the RESIDUAL: an untrained network adds nothing, it does not black the frame out",
        same(Array.from(y), Array.from(noisyRadiance(im))));
}

console.log("\n2. THE LOSS AND ITS GRADIENT");
{
    const net = makeDenoiser(3), im = synth(8, 7, 1);
    const L = lossAndGrads(net, im.x, im.ref, 7, 8);
    ok("!! the training loss IS the verdict's metric: relMSE of the denoised image, from render/denoiseStats.mjs", Math.abs(L.loss - relMSE(denoise(net, im.x, 7, 8).y, im.ref)) < 1e-15);
    const h = 1e-6; let worst = 0, n = 0;
    for (const [li, idxs] of [[0, [0, 7, 100, 1295]], [1, [3, 999]], [2, [11, 2000]], [3, [0, 200, 431]]]) for (const i of idxs) {
        const Wt = net.layers[li].W, o = Wt[i];
        Wt[i] = o + h; const a = lossAndGrads(net, im.x, im.ref, 7, 8).loss; Wt[i] = o - h; const b = lossAndGrads(net, im.x, im.ref, 7, 8).loss; Wt[i] = o;
        worst = Math.max(worst, Math.abs((a - b) / (2 * h) - L.grads[li].dW[i]) / Math.max(1e-6, Math.abs(L.grads[li].dW[i]))); n++;
    }
    for (const li of [0, 3]) { const B = net.layers[li].b, o = B[0];
        B[0] = o + h; const a = lossAndGrads(net, im.x, im.ref, 7, 8).loss; B[0] = o - h; const b = lossAndGrads(net, im.x, im.ref, 7, 8).loss; B[0] = o;
        worst = Math.max(worst, Math.abs((a - b) / (2 * h) - L.grads[li].db[0]) / Math.max(1e-6, Math.abs(L.grads[li].db[0]))); n++; }
    ok(`!! the gradient of relMSE through the remodulation and all four layers, against central differences: worst relative error ${worst.toExponential(2)} over ${n} parameters`, worst < 1e-5);
    const big = synth(10, 9, 2), C = cropAt(big.x, big.ref, 10, 3, 2, 4);
    ok("  cropAt takes the window at (cx, cy), every channel of input and reference", C.x[0] === big.x[(2 * 10 + 3) * CHANNELS] && C.x[(3 * 4 + 3) * CHANNELS + 8] === big.x[(5 * 10 + 6) * CHANNELS + 8] &&
        C.ref[(1 * 4 + 2) * 3 + 1] === big.ref[(3 * 10 + 5) * 3 + 1]);
}

console.log("\n3. *** C4: ONE SEED TWICE IS ONE NETWORK, BIT FOR BIT ***");
{
    const imgs = [0, 1].map((k) => synth(20, 20, k));
    const o = { steps: 8, batch: 2, crop: 12 };
    const a = trainDenoiser(imgs, { seed: 1, ...o }), b = trainDenoiser(imgs, { seed: 1, ...o }), c = trainDenoiser(imgs, { seed: 2, ...o });
    const flat = (net) => net.layers.flatMap((L) => [...L.W, ...L.b]);
    ok("!! seed 1 twice: identical weights after training and identical losses at every step", same(flat(a.net), flat(b.net)) && same(a.losses, b.losses),
        "the seed draws the weights, then every image choice and crop corner, from one stream -- v4698's MLPTrainer seeded only the first");
    const fa = flat(a.net), fc = flat(c.net); let differ = 0; for (let i = 0; i < fa.length; i++) if (fa[i] !== fc[i]) differ++;
    ok("  seed 2 is a different network", differ > 6000, `${differ} of ${fa.length} parameters differ`);
    let t1 = null; try { trainDenoiser(imgs, { steps: 1 }); } catch (e) { t1 = e.message; }
    let t2 = null; try { trainDenoiser([synth(8, 8, 0)], { seed: 1, steps: 1 }); } catch (e) { t2 = e.message; }
    ok("  training without a seed, or on an image smaller than a crop, is refused by name", /integer seed/.test(t1 || "") && /at least 32/.test(t2 || ""));
}

console.log("\n4. IT LEARNS -- ON A SYNTHETIC TASK, NOT THE DATASET");
{
    const train = [0, 1, 2].map((k) => synth(24, 24, k)), held = synth(24, 24, 7);
    const R = trainDenoiser(train, { seed: 5, steps: 120, batch: 2, crop: 16 });
    const noisy = relMSE(noisyRadiance(held), held.ref), out = relMSE(denoise(R.net, held.x, 24, 24).y, held.ref);
    const first = R.losses.slice(0, 10).reduce((a, v) => a + v, 0) / 10, last = R.losses.slice(-10).reduce((a, v) => a + v, 0) / 10;
    ok("!! 120 steps: the training loss falls, and on a synthetic image it never saw, the network beats the noisy input",
        last < first * 0.7 && out < noisy, `loss ${first.toFixed(4)} -> ${last.toFixed(4)}; held-out relMSE noisy ${noisy.toFixed(4)}, denoised ${out.toFixed(4)}`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether it beats the FILTER on the PATH TRACER. That is the pre-registered measurement, next round.");
process.exit(fails ? 1 : 0);
