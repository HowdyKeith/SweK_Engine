// WebGLEngine/render/denoiseNet-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseNet-selfcheck.mjs
//
// GATES render/denoiseNet.mjs -- the pre-registered network and its training -- on SYNTHETIC images only (smooth
// irradiance fields with noise, no path-traced scene). Its exports, each named here: SHAPE, TRAIN, INITS, INIT, HEADS,
// KERNEL_RADIUS, KERNEL_TAPS, SHAPE_KERNEL, headOf, shapeFor, makeDenoiser, paramCount, denoise, lossAndGrads, cropAt, trainDenoiser.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   L1  the residual removed: the output IS the irradiance                       1 RED
//   L2  the loss gradient misses the albedo the output was multiplied by         1 RED
//   L3  the batch's image chosen by Math.random -- v4698's defect, planted       1 RED (C4)
//   L4  the default init back to "he"                                            3 RED
//   L5  zero-last draws its weights from another stream than round 1's          2 RED
//   K1  the softmax normalised over all 81 taps, outside the image included      3 RED
//   K2  the kernel blends the ALBEDO channels instead of the irradiance          4 RED
//   K3  the softmax's backward pass without its "- sum" term                     1 RED
//   K4  zero-last not applied to the kernel head                                 1 RED
//   K5  cropAt copies nine channels of a 13-channel input                        1 RED
//   K6  the trainer builds a 9-channel first layer for a 13-channel input        1 RED
//   K7  denoise() takes an input of another width than the network's             1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SHAPE, TRAIN, INITS, INIT, HEADS, KERNEL_RADIUS, KERNEL_TAPS, SHAPE_KERNEL, headOf, shapeFor, makeDenoiser, paramCount, denoise, lossAndGrads, cropAt,
        trainDenoiser } = await imp("render/denoiseNet.mjs");
const { cloneNet } = await imp("brain/convNet.mjs");
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

console.log("\n5. THE RE-RUN'S INITIALISATION (pre-registration section 13)");
{
    ok("  two inits, \"he\" (round 1) and \"zero-last\", and the default is zero-last", INITS.join() === "he,zero-last" && INIT === "zero-last");
    const he = makeDenoiser(4, "he"), zl = makeDenoiser(4), last = SHAPE.length - 1;
    const sameBut = he.layers.every((L, i) => i === last ? same(Array.from(L.b), Array.from(zl.layers[i].b)) : same(Array.from(L.W), Array.from(zl.layers[i].W)) && same(Array.from(L.b), Array.from(zl.layers[i].b)));
    ok("!! zero-last is round 1's draws with the last layer's weights set to zero: every other weight bit-identical, from the same stream",
        sameBut && zl.layers[last].W.every((v) => v === 0) && he.layers[last].W.some((v) => v !== 0));
    const im = synth(12, 10, 3), { y } = denoise(makeDenoiser(9), im.x, 10, 12);
    ok("!! an untrained default network IS the identity: its image is the noisy input, bit for bit -- round 1's started as noise",
        same(Array.from(y), Array.from(noisyRadiance(im))) && !same(Array.from(denoise(makeDenoiser(9, "he"), im.x, 10, 12).y), Array.from(noisyRadiance(im))));
    let threw = null; try { makeDenoiser(1, "xavier"); } catch (e) { threw = e.message; }
    ok("  an init that is neither is refused by name", /not one of he, zero-last/.test(threw || ""), threw);
}

console.log("\n6. THE KERNEL-PREDICTING HEAD (pre-registration section 15)");
{
    ok("  two heads; the kernel head is the same hidden layers and a 1 x 1 layer to 81 logits -- a 9 x 9 window, 7,329 parameters",
        HEADS.join() === "residual,kernel" && KERNEL_RADIUS === 4 && KERNEL_TAPS === 81 && JSON.stringify(SHAPE_KERNEL.slice(0, 3)) === JSON.stringify(SHAPE.slice(0, 3)) &&
        JSON.stringify(SHAPE_KERNEL[3]) === JSON.stringify([16, 81, "none", 1]) && paramCount(makeDenoiser(1, INIT, "kernel")) === 7329);
    const kn = makeDenoiser(2, INIT, "kernel");
    ok("  a network's head is read from its output width, so a clone keeps it", headOf(kn) === "kernel" && headOf(cloneNet(kn)) === "kernel" && headOf(makeDenoiser(2)) === "residual");
    // zero-last: every logit 0, so the weights are uniform over the taps INSIDE the image -- the 9 x 9 box mean
    const H = 11, W = 12, im = synth(W, H, 5), { y, w } = denoise(kn, im.x, H, W);
    const boxAt = (px, py) => { const out = [0, 0, 0]; let n = 0;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
            n++; for (let c = 0; c < 3; c++) out[c] += im.x[(qy * W + qx) * CHANNELS + c]; }
        return out.map((v, c) => v / n * Math.max(im.x[(py * W + px) * CHANNELS + 3 + c], 0.01)); };
    let worst = 0; for (const [px, py] of [[5, 5], [0, 0], [11, 10], [2, 9]]) { const b = boxAt(px, py); for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(y[(py * W + px) * 3 + c] - b[c])); }
    ok("!! an untrained kernel head is the 9 x 9 box mean of the noisy irradiance -- over the 81 taps inside, and over the 25 at a corner -- re-modulated by the pixel's albedo",
        worst < 1e-12, `worst ${worst.toExponential(1)} at the centre and three edge pixels`);
    let wmin = Infinity, dev = 0;
    const he = makeDenoiser(6, "he", "kernel"), hw = denoise(he, im.x, H, W).w;
    for (let p = 0; p < H * W; p++) { let sum = 0; for (let t = 0; t < 81; t++) { sum += hw[p * 81 + t]; wmin = Math.min(wmin, hw[p * 81 + t]); } dev = Math.max(dev, Math.abs(sum - 1)); }
    ok("  with random logits the weights are a distribution at every pixel: none negative, each pixel's summing to 1", wmin >= 0 && dev < 1e-12, `min ${wmin.toExponential(1)}, worst sum error ${dev.toExponential(1)}`);
    // one logit far above the rest: the output is that one tap's irradiance
    const one = makeDenoiser(2, INIT, "kernel"), t = (-1 + 4) * 9 + (2 + 4); one.layers[3].b[t] = 60;
    const yo = denoise(one, im.x, H, W).y, p0 = 5 * W + 5, q0 = 4 * W + 7;
    ok("  a logit 60 above the rest copies its tap: the pixel (5, 5) takes the irradiance at (7, 4)",
        [0, 1, 2].every((c) => Math.abs(yo[p0 * 3 + c] - im.x[q0 * CHANNELS + c] * Math.max(im.x[p0 * CHANNELS + 3 + c], 0.01)) < 1e-12));
    // the gradient through the weighted sum and the softmax, against central differences
    const g = makeDenoiser(3, "he", "kernel"), sm = synth(8, 7, 2), Lg = lossAndGrads(g, sm.x, sm.ref, 7, 8), h = 1e-6; let wr = 0, n = 0;
    for (const [li, idxs] of [[0, [0, 50, 1000]], [2, [5, 2000]], [3, [0, 100, 777, 1295]]]) for (const i of idxs) {
        const Wt = g.layers[li].W, o = Wt[i]; Wt[i] = o + h; const a = lossAndGrads(g, sm.x, sm.ref, 7, 8).loss; Wt[i] = o - h; const b = lossAndGrads(g, sm.x, sm.ref, 7, 8).loss; Wt[i] = o;
        const fd = (a - b) / (2 * h); wr = Math.max(wr, Math.abs(fd - Lg.grads[li].dW[i]) / Math.max(1e-6, Math.abs(fd))); n++; }
    for (const i of [0, 40, 80]) { const B = g.layers[3].b, o = B[i]; B[i] = o + h; const a = lossAndGrads(g, sm.x, sm.ref, 7, 8).loss; B[i] = o - h; const b = lossAndGrads(g, sm.x, sm.ref, 7, 8).loss; B[i] = o;
        const fd = (a - b) / (2 * h); wr = Math.max(wr, Math.abs(fd - Lg.grads[3].db[i]) / Math.max(1e-6, Math.abs(fd))); n++; }
    ok(`!! the gradient through the softmax, the weighted sum and all four layers, against central differences: worst relative ${wr.toExponential(2)} over ${n}`, wr < 1e-4);
    const tr = [0, 1].map((k) => synth(16, 16, k)), held = synth(16, 16, 7);
    const KR = trainDenoiser(tr, { seed: 5, head: "kernel", steps: 15, batch: 2, crop: 12 });
    const before = relMSE(denoise(makeDenoiser(5, INIT, "kernel"), held.x, 16, 16).y, held.ref), after = relMSE(denoise(KR.net, held.x, 16, 16).y, held.ref);
    ok("  it trains: 15 steps on synthetic images lower its error on one it never saw, from where the box started", after < before, `${before.toFixed(4)} -> ${after.toFixed(4)}`);
    let threw = null; try { makeDenoiser(1, INIT, "unet"); } catch (e) { threw = e.message; }
    ok("  a head that is neither is refused by name", /not one of residual, kernel/.test(threw || ""), threw);
}

console.log("\n7. THE TEMPORAL ROUND'S 13-CHANNEL INPUT (pre-registration section 17)");
{
    ok("  shapeFor(head, 13): the first layer takes 13 channels and every other layer is unchanged; 9 gives the shape itself",
        shapeFor("kernel", 9) === SHAPE_KERNEL && shapeFor("residual", 9) === SHAPE && shapeFor("kernel", 13)[0][0] === 13 &&
        JSON.stringify(shapeFor("kernel", 13).slice(1)) === JSON.stringify(SHAPE_KERNEL.slice(1)) && paramCount(makeDenoiser(1, INIT, "kernel", 13)) === 7329 + 4 * 16 * 9);
    const im = synth(10, 9, 4), x13 = new Float64Array(10 * 9 * 13);
    for (let p = 0; p < 90; p++) { for (let c = 0; c < 9; c++) x13[p * 13 + c] = im.x[p * 9 + c]; for (let c = 9; c < 13; c++) x13[p * 13 + c] = p + c / 10; }
    const C = cropAt(x13, im.ref, 10, 2, 3, 4);
    ok("  cropAt keeps all 13 channels at their stride", C.x.length === 4 * 4 * 13 && C.x[(1 * 4 + 2) * 13 + 11] === x13[((3 + 1) * 10 + (2 + 2)) * 13 + 11] && C.x[5 * 13 + 3] === x13[(4 * 10 + 3) * 13 + 3]);
    const y9 = denoise(makeDenoiser(3, INIT, "kernel"), im.x, 9, 10).y, y13 = denoise(makeDenoiser(3, INIT, "kernel", 13), x13, 9, 10).y;
    ok("!! an untrained kernel head blends the same first three channels whatever the stride: 13 channels and 9 give one image, bit for bit", y9.every((v, i) => Object.is(v, y13[i])));
    const tr = [0, 1].map((k) => { const a = synth(14, 14, k), x = new Float64Array(14 * 14 * 13); for (let p = 0; p < 196; p++) for (let c = 0; c < 9; c++) x[p * 13 + c] = a.x[p * 9 + c]; return { x, ref: a.ref, w: 14, h: 14 }; });
    const R = trainDenoiser(tr, { seed: 2, head: "kernel", steps: 2, batch: 1, crop: 12 });
    ok("  the trainer reads the stride from its images and builds a 13-channel first layer", R.net.layers[0].Cin === 13 && R.net.layers[0].W.length === 16 * 9 * 13);
    let threw = null; try { denoise(makeDenoiser(3, INIT, "kernel"), x13, 9, 10); } catch (e) { threw = e.message; }
    ok("!! a network refuses an input of another width by name -- read at the wrong stride it would return finite nonsense", /9 input channels was handed an input of 13/.test(threw || ""), threw);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether it beats the FILTER on the PATH TRACER. That is the pre-registered measurement, next round.");
process.exit(fails ? 1 : 0);
