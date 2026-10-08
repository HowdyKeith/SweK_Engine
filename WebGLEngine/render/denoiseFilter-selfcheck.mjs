// WebGLEngine/render/denoiseFilter-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseFilter-selfcheck.mjs
//
// GATES render/denoiseFilter.mjs -- the hand-written baseline -- on synthetic images only. Its exports, each named
// here: RADIUS, GRID, jointBilateral, gridSettings, tuneFilter.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   F1  the normal guide reads the albedo channels                               1 RED
//   F2  the weights not normalised (a fixed 81 instead of their sum)             4 RED
//   F3  the tuner keeps the WORST setting                                        2 RED
//   F4  the filter reads a 13-channel input at stride 9                          1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { RADIUS, GRID, jointBilateral, gridSettings, tuneFilter } = await imp("render/denoiseFilter.mjs");
const { relMSE } = await imp("render/denoiseStats.mjs");
const { CHANNELS } = await imp("render/denoiseScenes.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
let seed = 5;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());

/** A synthetic 9-channel image: `irr(x, y)` the clean irradiance, `alb(x, y)` / `nrm(x, y)` the guides, noise sigma `s`. */
const image = (w, h, irr, alb, nrm, s) => {
    const x = new Float64Array(w * h * CHANNELS), clean = new Float64Array(w * h * 3);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const p = py * w + px, I = irr(px, py), A = alb(px, py), N = nrm(px, py);
        for (let c = 0; c < 3; c++) {
            x[p * CHANNELS + c] = Math.max(0, I + s * gauss());
            x[p * CHANNELS + 3 + c] = A[c]; x[p * CHANNELS + 6 + c] = N[c];
            clean[p * 3 + c] = I * A[c];
        }
    }
    return { x, ref: clean, w, h };
};
const noisyRadiance = (im) => { const y = new Float64Array(im.w * im.h * 3);
    for (let p = 0; p < im.w * im.h; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = im.x[p * CHANNELS + c] * im.x[p * CHANNELS + 3 + c]; return y; };

console.log("1. THE FILTER");
{
    const flat = image(12, 12, () => 0.7, () => [0.5, 0.6, 0.7], () => [0, 1, 0], 0);
    const y = jointBilateral(flat.x, 12, 12, { sS: 2, sN: 0.3, sA: 0.2, sI: 1 });
    let w = 0; for (let i = 0; i < y.length; i++) w = Math.max(w, Math.abs(y[i] - flat.ref[i]));
    ok("  a flat image passes through unchanged -- the weights are normalised", w < 1e-14, `worst ${w.toExponential(1)}`);
    const noisy = image(24, 24, () => 1, () => [0.5, 0.5, 0.5], () => [0, 1, 0], 0.3);
    const before = relMSE(noisyRadiance(noisy), noisy.ref), after = relMSE(jointBilateral(noisy.x, 24, 24, { sS: 2, sN: 0.3, sA: 0.2, sI: Infinity }), noisy.ref);
    ok("!! on a flat region with noise it reduces relMSE by more than 10x", after < before / 10, `${before.toFixed(5)} -> ${after.toFixed(5)}`);
    // an albedo step at x = 12 with the irradiance flat: a tight albedo sigma must not mix the two sides, a plain blur does
    const step = image(24, 8, () => 1, (px) => (px < 12 ? [0.1, 0.1, 0.1] : [0.9, 0.9, 0.9]), () => [0, 1, 0], 0);
    const edge = jointBilateral(step.x, 24, 8, { sS: 4, sN: Infinity, sA: 0.05, sI: Infinity });
    const blur = jointBilateral(step.x, 24, 8, { sS: 4, sN: Infinity, sA: Infinity, sI: Infinity });
    const at = (y, px) => y[(4 * 24 + px) * 3];
    ok("!! across an albedo edge the guide keeps both sides exact; the same window without the guide is exact too, BECAUSE the irradiance is flat",
        Math.abs(at(edge, 11) - 0.1) < 1e-9 && Math.abs(at(edge, 12) - 0.9) < 1e-9 && Math.abs(at(blur, 11) - 0.1) < 1e-9,
        "demodulation is why: the filter averages IRRADIANCE and re-applies each pixel's own albedo, so a texture edge is not an irradiance edge");
    const shadow = image(24, 8, (px) => (px < 12 ? 0.1 : 1), () => [0.5, 0.5, 0.5], (px) => (px < 12 ? [1, 0, 0] : [0, 1, 0]), 0);
    const sEdge = jointBilateral(shadow.x, 24, 8, { sS: 4, sN: 0.1, sA: Infinity, sI: Infinity });
    const sBlur = jointBilateral(shadow.x, 24, 8, { sS: 4, sN: Infinity, sA: Infinity, sI: Infinity });
    ok("!! across a NORMAL edge with an irradiance step, the normal guide keeps it sharp and the plain blur smears it",
        Math.abs(at(sEdge, 11) - 0.05) < 1e-6 && Math.abs(at(sBlur, 11) - 0.05) > 0.05, `x = 11: guided ${at(sEdge, 11).toFixed(4)}, unguided ${at(sBlur, 11).toFixed(4)}, true 0.0500`);
    const inf = jointBilateral(noisy.x, 24, 24, { sS: 2, sN: Infinity, sA: 0.2, sI: 1 }), big = jointBilateral(noisy.x, 24, 24, { sS: 2, sN: 1e12, sA: 0.2, sI: 1 });
    let dInf = 0; for (let i = 0; i < inf.length; i++) dInf = Math.max(dInf, Math.abs(inf[i] - big[i]));
    ok("  a sigma of Infinity switches its term off -- the same as an enormous one", dInf < 1e-12);
    ok(`  the window is 9 x 9 (RADIUS ${RADIUS}), the network's receptive field`, RADIUS === 4);
    // the temporal round's 13-channel input: the same first nine channels, then four the filter must not read
    const x13 = new Float64Array(24 * 24 * 13);
    for (let p = 0; p < 24 * 24; p++) { for (let c = 0; c < 9; c++) x13[p * 13 + c] = noisy.x[p * 9 + c]; for (let c = 9; c < 13; c++) x13[p * 13 + c] = 1e3 * (p % 7) + c; }
    const y9 = jointBilateral(noisy.x, 24, 24, { sS: 2, sN: 0.3, sA: 0.2, sI: 1 }), y13 = jointBilateral(x13, 24, 24, { sS: 2, sN: 0.3, sA: 0.2, sI: 1 });
    ok("!! a 13-channel input filters bit for bit as its first nine channels do -- the stride is read from the input, and the extra channels are not",
        y9.every((v, i) => Object.is(v, y13[i])));
}

console.log("\n2. THE TUNER, ON THE TRAINING SET IT IS GIVEN AND NOTHING ELSE");
{
    const settings = gridSettings();
    ok("  the grid is 3 x 3 x 3 x 4 = 108 settings, sS outermost and sI innermost", settings.length === 108 && GRID.sI.includes(Infinity) &&
        settings[0].sS === 1 && settings[1].sI === GRID.sI[1] && settings[107].sS === 4);
    const set = [0, 1, 2].map((k) => image(16, 16, (px, py) => 0.5 + 0.4 * Math.sin(px / 3 + k), (px) => (px < 8 ? [0.3, 0.4, 0.5] : [0.8, 0.7, 0.6]),
        (px, py) => (py < 8 ? [0, 1, 0] : [0, 0, 1]), 0.25));
    const T = tuneFilter(set, relMSE);
    const min = Math.min(...T.table.map((r) => r.score));
    ok("!! the setting it returns is the minimum of mean ln relMSE over the table it scored", T.best.score === min && T.table.length === 108,
        `best sS ${T.best.sS}, sN ${T.best.sN}, sA ${T.best.sA}, sI ${T.best.sI}, score ${T.best.score.toFixed(4)}`);
    const firstMin = T.table.find((r) => r.score === min);
    ok("  ties go to the earlier setting in the fixed order", firstMin.sS === T.best.sS && firstMin.sN === T.best.sN && firstMin.sA === T.best.sA && firstMin.sI === T.best.sI);
    const raw = set.reduce((a, im) => a + Math.log(relMSE(noisyRadiance(im), im.ref)), 0) / set.length;
    ok("  and the tuned filter beats the noisy input on the set it was tuned on", T.best.score < raw, `mean ln relMSE ${raw.toFixed(3)} -> ${T.best.score.toFixed(3)}`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: how well this filter does on the path tracer's scenes. That is the measurement, two rounds from now.");
process.exit(fails ? 1 : 0);
