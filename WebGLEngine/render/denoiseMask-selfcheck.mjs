// WebGLEngine/render/denoiseMask-selfcheck.mjs -- the denoiser arc, round 6
//
// Run: node render/denoiseMask-selfcheck.mjs
//
// GATES render/denoiseMask.mjs -- the emitter mask of pre-registration section 21 -- and the one rule both methods take
// from it: a pixel is never averaged with a neighbour on the other side of the mask. Its exports, each named here:
// MASK_STRIDE, MASK_CHANNEL, COVERAGE_GRID, emitterCoverage, maskChannelOf, withMask. Also held here: the rule inside render/denoiseFilter.mjs's jointBilateral and render/denoiseNet.mjs's kernel
// head, and render/denoiseStudy.mjs's masked pipeline on a miniature.
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** Every scene is seeded from 950000 up or built by hand.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   M1  the filter ignores the mask                                              2 RED
//   M2  the kernel head ignores the mask                                         2 RED
//   M3  maskChannelOf finds a mask in every input of nine channels or more       3 RED
//   M4  the coverage counts the sky as emitter too                               2 RED
//   M7  the coverage taken from the centre ray alone (a 0/1 mask)                2 RED
//   M5  withMask writes the mask over the normal's z                             4 RED
//   M6  the no-mask networks trained on the masked inputs                        1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { MASK_STRIDE, MASK_CHANNEL, COVERAGE_GRID, emitterCoverage, maskChannelOf, withMask } = await imp("render/denoiseMask.mjs");
const { CHANNELS, makeScene, renderImages, inputChannels } = await imp("render/denoiseScenes.mjs");
const { jointBilateral } = await imp("render/denoiseFilter.mjs");
const { makeDenoiser, denoise, lossAndGrads, INIT } = await imp("render/denoiseNet.mjs");
const { relMSE } = await imp("render/denoiseStats.mjs");
const { runStudy, renderSplit } = await imp("render/denoiseStudy.mjs");
const { intersect, cameraBasis, pixelRay } = await imp("physics/render/pathTracer.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const AB = { sS: 1, sN: 1, sA: 0.2, sI: 4 };   // the setting round 5 tuned on A+B, the one that failed on family C

console.log("1. THE LAYOUT");
{
    ok("  the mask is the tenth channel, after the nine every method reads: stride 10, channel 9; strides 9 and 13 carry none",
        MASK_STRIDE === CHANNELS + 1 && MASK_CHANNEL === CHANNELS && maskChannelOf(10) === 9 && maskChannelOf(9) === -1 && maskChannelOf(13) === -1);
    const x9 = Float64Array.from({ length: 4 * 9 }, (_, i) => i / 7), x = withMask(x9, [0, 1, 1, 0]);
    ok("!! withMask keeps the nine channels as they were and puts the mask in the tenth", x.length === 40 &&
        [0, 1, 2, 3].every((p) => [...Array(9).keys()].every((c) => x[p * 10 + c] === x9[p * 9 + c])) && [x[9], x[19], x[29], x[39]].join() === "0,1,1,0");
    const bad = [() => withMask(x9, [0, 1, 1.5, 0]), () => withMask(x9, [0, -0.1, 1, 0]), () => withMask(x9, [0, 1, 1])].filter((f) => { try { f(); return false; } catch { return true; } }).length;
    ok("  a mask outside [0, 1], or not one value per pixel, is refused", bad === 3);
}

console.log("\n2. THE GUIDE: EMITTER COVERAGE");
{
    // one emitter sphere on the camera's axis, nothing else: its silhouette is a circle on the image plane of radius
    // tan(asin(r / d)) in units where the half-height is tan(fov / 2), so its coverage must sum to that circle's area
    const S = { scene: [{ centre: [0, 0, 0], radius: 0.5, albedo: 0, emit: 10 }], eye: [0, 0, 5], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 40 };
    const cov = emitterCoverage(S, 32, 32), sum = cov.reduce((a, v) => a + v, 0);
    const rPx = Math.tan(Math.asin(0.5 / 5)) * 16 / Math.tan(20 * Math.PI / 180), area = Math.PI * rPx * rPx;
    const grid = COVERAGE_GRID * COVERAGE_GRID, steps = cov.every((v) => Number.isInteger(v * grid) && v >= 0 && v <= 1);
    const partial = Array.from(cov).filter((v) => v > 0 && v < 1).length;
    ok("!! an emitter's coverage sums to its projected area -- the analytic disc on the image plane -- in steps of 1/64, partial only at its rim",
        COVERAGE_GRID === 8 && steps && Math.abs(sum - area) / area < 0.01 && cov[16 * 32 + 16] === 1 && cov[0] === 0 && partial > 10 && partial < 40,
        `sum ${sum.toFixed(2)} against ${area.toFixed(2)} pixels; ${partial} partial pixels`);
    // a second sphere in front of half the emitter: coverage counts only what the camera sees of it
    const occ = { ...S, scene: [...S.scene, { centre: [0.5, 0, 2.5], radius: 0.5, albedo: [0.5, 0.5, 0.5] }] };
    const cov2 = emitterCoverage(occ, 32, 32), sum2 = cov2.reduce((a, v) => a + v, 0);
    ok("  ...and only what the camera SEES of it: a sphere in front hides part, the sky and the occluder carry none", sum2 < sum - 5 && cov2.every((v, i) => v <= cov[i]),
        `${sum2.toFixed(2)} of ${sum.toFixed(2)} still visible`);
}

// a hand-built frame: an emitter disc of irradiance 30 (mask 1) on a near-black sky of 0.03 (mask 0), both with albedo
// guide 1 -- round 5's failure, in miniature
// -- and around it a rim of pixels half covered (coverage 0.5, irradiance 15): bright, with the sky's guides
const W = 16, d2 = (x, y) => (x - 5) ** 2 + (y - 8) ** 2;
const frame = () => {
    const x9 = new Float64Array(W * W * 9), m = new Array(W * W).fill(0), ref = new Float64Array(W * W * 3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x, cov = d2(x, y) <= 9 ? 1 : d2(x, y) <= 16 ? 0.5 : 0, v = cov === 1 ? 30 : cov === 0.5 ? 15 : 0.03;
        for (let c = 0; c < 3; c++) { x9[p * 9 + c] = v; x9[p * 9 + 3 + c] = 1; ref[p * 3 + c] = v; }
        if (cov === 1) x9[p * 9 + 6] = 1;
        m[p] = cov;
    }
    return { x9, x: withMask(x9, m), m, ref };
};

console.log("\n3. THE FILTER'S RULE");
{
    const im = synthNoMask();
    ok("!! a mask of all zeros filters bit for bit as the nine channels alone -- the rule removes nothing when nothing is masked",
        same(jointBilateral(im.x9, 12, 12, AB), jointBilateral(withMask(im.x9, new Array(144).fill(0)), 12, 12, AB)));
    const F = frame(), un = jointBilateral(F.x9, W, W, AB), mk = jointBilateral(F.x, W, W, AB);
    let skyWorstUn = 0, skyWorstMk = 0, emWorstMk = 0;
    for (let p = 0; p < W * W; p++) for (let c = 0; c < 3; c++) {
        if (F.m[p]) emWorstMk = Math.max(emWorstMk, Math.abs(mk[p * 3 + c] - F.ref[p * 3 + c]));
        else { skyWorstUn = Math.max(skyWorstUn, un[p * 3 + c]); skyWorstMk = Math.max(skyWorstMk, Math.abs(mk[p * 3 + c] - 0.03)); }
    }
    ok("!! round 5's setting smears the emitter and its rim into the sky without the mask; with it the sky stays 0.03, the rim 15 and the emitter 30, exactly",
        skyWorstUn > 1 && skyWorstMk < 1e-15 && emWorstMk < 1e-12, `unmasked sky reaches ${skyWorstUn.toFixed(2)}; masked sky error ${skyWorstMk.toExponential(1)}`);
}

console.log("\n4. THE KERNEL HEAD'S RULE");
{
    const im = synthNoMask();
    const n9 = makeDenoiser(4, INIT, "kernel"), n10 = makeDenoiser(4, INIT, "kernel", 10);
    ok("!! a mask of all zeros: an untrained kernel network blends exactly what it blends without one",
        same(denoise(n9, im.x9, 12, 12).y, denoise(n10, withMask(im.x9, new Array(144).fill(0)), 12, 12).y));
    const F = frame(), he = makeDenoiser(5, "he", "kernel", 10), { w } = denoise(he, F.x, W, W);
    let cross = 0;
    for (let p = 0; p < W * W; p++) {
        const py = (p / W) | 0, px = p % W;
        for (let t = 0; t < 81; t++) { const qy = py + ((t / 9) | 0) - 4, qx = px + (t % 9) - 4;
            if (qy >= 0 && qy < W && qx >= 0 && qx < W && F.m[qy * W + qx] !== F.m[p] && w[p * 81 + t] !== 0) cross++; }
    }
    const y0 = denoise(makeDenoiser(5, INIT, "kernel", 10), F.x, W, W).y;
    let skyWorst = 0; for (let p = 0; p < W * W; p++) if (!F.m[p]) for (let c = 0; c < 3; c++) skyWorst = Math.max(skyWorst, Math.abs(y0[p * 3 + c] - 0.03));
    ok("!! with random logits no weight ever crosses the mask, and an untrained kernel keeps the sky at 0.03 beside a rim of 15 and an emitter of 30",
        cross === 0 && skyWorst < 1e-15, `${cross} crossing weights; sky error ${skyWorst.toExponential(1)}`);
    // the gradient through a kernel that the mask cuts, against central differences
    const g = makeDenoiser(6, "he", "kernel", 10), crop = (a, C) => { const o = new Float64Array(8 * 8 * C); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) for (let c = 0; c < C; c++) o[(y * 8 + x) * C + c] = a[((y + 4) * W + x + 1) * C + c]; return o; };
    const xs = crop(F.x, 10), rs = crop(F.ref, 3); for (let i = 0; i < xs.length; i += 10) for (let c = 0; c < 3; c++) xs[i + c] *= 1 + 0.2 * Math.sin(i + c);
    const L = lossAndGrads(g, xs, rs, 8, 8), h = 1e-6; let wr = 0, nn = 0;
    for (const [li, idxs] of [[0, [3, 77, 1400]], [3, [0, 500, 1295]]]) for (const i of idxs) {
        const Wt = g.layers[li].W, o = Wt[i]; Wt[i] = o + h; const a = lossAndGrads(g, xs, rs, 8, 8).loss; Wt[i] = o - h; const b = lossAndGrads(g, xs, rs, 8, 8).loss; Wt[i] = o;
        const fd = (a - b) / (2 * h); wr = Math.max(wr, Math.abs(fd - L.grads[li].dW[i]) / Math.max(1e-6, Math.abs(fd))); nn++; }
    ok(`  the gradient through a kernel the mask cuts, against central differences: worst relative ${wr.toExponential(2)} over ${nn}`, wr < 1e-4);
}

console.log("\n5. ROUND 5'S FAILURE, ON A FAMILY-C SCENE OUTSIDE EVERY SPLIT");
{
    const S = makeScene("C", 950203), I = renderImages("C", 950203, { sppRef: 128 }), x9 = inputChannels(I.input, I.albedo, I.normal), cov = emitterCoverage(S, 64, 64);
    const lit = cov.reduce((a, v) => a + v, 0), noisy = relMSE(I.input, I.ref);
    const un = relMSE(jointBilateral(x9, 64, 64, AB), I.ref), mk = relMSE(jointBilateral(withMask(x9, cov), 64, 64, AB), I.ref);
    ok("!! a visible emitter: round 5's setting without the mask is far worse than the noisy input; with the coverage mask it beats it",
        lit > 5 && un > 5 * noisy && mk < noisy, `coverage ${lit.toFixed(1)} pixels; noisy ${noisy.toFixed(4)}, unmasked ${un.toFixed(4)}, masked ${mk.toFixed(4)}`);
}

console.log("\n6. THE MASKED PIPELINE, ON A MINIATURE");
{
    const mix = { train: { family: "A+B", families: ["A", "B", "A"], seeds: [910040, 910041, 910042] }, val: { family: "A", seeds: [920040] },
                  T1: { family: "A+B", families: ["A", "B"], seeds: [930040, 930041] }, T2: { family: "C", seeds: [940040, 940041] } };
    const r = renderSplit(mix.T2, { harvest: false, image: 8, sppIn: 2, sppRef: 4, ref2: false, emitterMask: true });
    ok("  a masked split carries the 10-channel input, its mask the emission guide, and the 9-channel input beside it",
        r.every((im) => im.x.length === 64 * 10 && im.x9.length === 64 * 9 && [...Array(64).keys()].every((p) => im.x[p * 10 + 9] === im.emission[p] && im.x[p * 10 + 4] === im.x9[p * 9 + 4])));
    let out = null, err = null;
    try { out = runStudy({ splits: mix, image: 8, sppIn: 4, sppRef: 16, train: { steps: 2, batch: 1, crop: 8 }, secondarySpp: [], c0: false, head: "kernel", emitterMask: true, compareNoMask: true }); }
    catch (e) { err = e.message; }
    const N1 = out?.secondary["T1@noMask"], N2 = out?.secondary["T2@noMask"];
    ok("!! the no-mask comparison: the filter re-tuned and three networks trained on the 9-channel inputs, on the same test images",
        !!N1 && !!N2 && out.config.emitterMask === true && N1.filter.length === 2 && N1.net.length === 3 && typeof out.secondary.filterNoMask.sS === "number" &&
        [...N1.filter, ...N1.net.flat(), ...N2.filter, ...N2.net.flat()].every((v) => Number.isFinite(v) && v > 0), err);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether the mask lets either method transfer to family C. That is section 21's measurement.");
process.exit(fails ? 1 : 0);

function synthNoMask() {
    let k = 3; const u = () => ((k = (k * 1664525 + 1013904223) >>> 0) / 4294967296);
    const x9 = new Float64Array(144 * 9);
    for (let p = 0; p < 144; p++) { for (let c = 0; c < 3; c++) { x9[p * 9 + c] = 0.3 + u(); x9[p * 9 + 3 + c] = 0.2 + 0.6 * u(); } x9[p * 9 + 7] = 1; }
    return { x9 };
}
