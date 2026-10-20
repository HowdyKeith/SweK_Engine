#!/usr/bin/env node
// WebGLEngine/render/denoiseTemporalUpscale-selfcheck.mjs -- round 32 (pre-registration section 95): the temporal upscale's
// pieces held before any of its test scenes is rendered. Every scene here is outside every split.
//
//   1. the jitter and the seeds: render/jitter.mjs's centred Halton offsets, one a frame; every render seed distinct
//   2. the shifts: shiftResample's direction, and halfShift's factor of two, read off a smooth sky rendered at an offset
//   3. the accumulation: a still camera averages, an invalid pixel restarts, the clamp holds the history in the current range
//   4. the study's arms on a tiny sequence: finite, deterministic, the dataset refused
//   5. the split: twelve new seeds, six R and six C, reserved
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const T = await imp("render/denoiseTemporalUpscale.mjs");
const { JITTER, TEMPORAL_UP_SEED_BASE, temporalUpscaleSeeds, renderTemporalUpscaleImages, shiftResample, halfShift, accumulateUpscaled, sequenceGeometry } = T;
const { FRAMES, firstHits } = await imp("render/denoiseTemporal.mjs");
const { jitterSequence } = await imp("render/jitter.mjs");
const { render } = await imp("physics/render/pathTracer.mjs");
const { upscale } = await imp("render/denoiseUpscale.mjs");
const D = await imp("render/denoiseScenes.mjs");
const St = await imp("render/denoiseStudy.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs");
const fs = await import("node:fs");

let fails = 0;
const t0 = Date.now();
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("denoiseTemporalUpscale-selfcheck -- round 32's temporal upscale, held before any test scene is rendered\n");

console.log("1. THE JITTER AND THE SEEDS");
{
    const J = jitterSequence(FRAMES);
    ok("one jitter a frame: render/jitter.mjs's first FRAMES centred Halton(2, 3) offsets, each in [-0.5, 0.5), all distinct",
        JITTER.length === FRAMES && FRAMES === 8 && JITTER.every((j, f) => j[0] === J[f][0] && j[1] === J[f][1] && j.every((v) => v >= -0.5 && v < 0.5)) &&
        new Set(JITTER.map((j) => j.join())).size === FRAMES && Object.isFrozen(JITTER), JITTER.map((j) => j.map((v) => v.toFixed(3)).join(",")).join(" | "));
    const all = D.SPLITS_TEMPORALUP.T1.seeds.flatMap((s) => { const r = temporalUpscaleSeeds(s); return [...r.half, ...r.full1, r.ref, r.ref2]; });
    ok("  every render seed of the round's twelve images distinct -- 16 frames each above every other round's, and renderSeeds' two references",
        new Set(all).size === all.length && all.length === 12 * 18 && D.SPLITS_TEMPORALUP.T1.seeds.every((s) => temporalUpscaleSeeds(s).half.every((v) => v >= TEMPORAL_UP_SEED_BASE)),
        `${all.length} seeds`);
}

console.log("\n2. THE SHIFTS, READ OFF A SMOOTH SKY");
{
    // a smooth sky and nothing in view, every ray at its pixel's centre: a frame rendered at an offset and shifted back is the
    // unjittered frame up to bilinear's error, and shifted the wrong way, or by the wrong amount, it is not
    const scene = [{ centre: [0, -1000, 0], radius: 1, albedo: [0.5, 0.5, 0.5] }];
    const sky = (d) => 1 + Math.sin(9 * d[0]) * 0.5 + Math.cos(7 * d[1]) * 0.4;
    const o = (W, x) => ({ w: W, h: W, spp: 1, strat: true, plantNoJitter: true, maxDepth: 1, nee: false, rgb: true, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 60, sky, seed: 5, ...x });
    const ref = render(scene, o(64, {})), s = [0.37, -0.29];
    const err = (a) => { let e = 0; for (let y = 4; y < 60; y++) for (let x = 4; x < 60; x++) for (let c = 0; c < 3; c++) { const i = (y * 64 + x) * 3 + c; e += (a[i] - ref[i]) ** 2; } return e; };
    const f1 = render(scene, o(64, { pixelOffset: s })), back = err(shiftResample(f1, 64, 64, s[0], s[1]));
    ok("!! shiftResample moves an image by +offset: a frame rendered at an offset and shifted by it is the unjittered frame, and shifted by -offset it is not",
        back < 0.02 && err(shiftResample(f1, 64, 64, -s[0], -s[1])) > 100 * back && shiftResample(ref, 64, 64, 0, 0).every((v, i) => Object.is(v, ref[i])),
        `shifted back ${back.toFixed(4)}, the wrong way ${err(shiftResample(f1, 64, 64, -s[0], -s[1])).toFixed(3)}`);
    const hj = upscale(render(scene, o(32, { pixelOffset: s })), 32, 32, 64, 64, "bilinear"), at = (k) => err(shiftResample(hj, 64, 64, k * s[0], k * s[1]));
    const hs = halfShift(s), got = err(shiftResample(hj, 64, 64, hs[0], hs[1]));
    ok("!! *** halfShift: a half-size frame's offset is twice that at full size -- the upscaled frame shifted by halfShift is nearer the unjittered frame than at 1 x or 3 x the offset ***",
        hs[0] === 2 * s[0] && hs[1] === 2 * s[1] && got < 0.5 * at(1.5) && got < 0.5 * at(2.5) && got < 0.1 * at(1),
        `at 1 x ${at(1).toFixed(3)}, 1.5 x ${at(1.5).toFixed(3)}, halfShift ${got.toFixed(3)}, 2.5 x ${at(2.5).toFixed(3)}`);
}

console.log("\n3. THE ACCUMULATION");
{
    const S = D.makeScene("R", 990000), W = 24, H = 24, eye = S.eye, geo = Array.from({ length: FRAMES }, () => firstHits(S, eye, W, H));
    const lit = geo[0].obj.reduce((k, o) => k + (o >= 0 ? 1 : 0), 0);
    let sd = 7; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const fr = Array.from({ length: FRAMES }, () => ({ y: Float64Array.from({ length: W * H * 3 }, () => 0.5 + rnd()), shift: [0, 0] }));
    const { A, n } = accumulateUpscaled(fr, geo, W, H, { clamp: false }), mean = new Float64Array(W * H * 3);
    for (const f of fr) for (let i = 0; i < mean.length; i++) mean[i] += f.y[i] / FRAMES;
    let worst = 0, inval = 0;
    for (let p = 0; p < W * H; p++) {
        if (geo[0].obj[p] < 0) { inval += n[p] === 1 && [0, 1, 2].every((c) => Object.is(A[p * 3 + c], fr[FRAMES - 1].y[p * 3 + c])) ? 1 : 0; continue; }
        if (n[p] === FRAMES) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(A[p * 3 + c] - mean[p * 3 + c]));
    }
    const full = [...n].filter((v, p) => geo[0].obj[p] >= 0 && v === FRAMES).length;
    ok("!! a still camera, no clamp: every pixel that saw geometry reaches n = FRAMES and is the mean of its frames; a pixel that saw sky restarts at its own sample",
        full > 0.5 * lit && worst < 1e-12 && inval === W * H - lit, `${full} of ${lit} lit pixels at n = ${FRAMES}, worst ${worst.toExponential(1)}; ${inval} sky pixels restarted`);
    // the clamp: a history far above every current value comes back no higher than the current 3 x 3 maximum
    const hot = [{ y: new Float64Array(W * H * 3).fill(50), shift: [0, 0] }, { y: new Float64Array(W * H * 3).fill(1), shift: [0, 0] }];
    const c1 = accumulateUpscaled(hot, geo.slice(0, 2), W, H), c0 = accumulateUpscaled(hot, geo.slice(0, 2), W, H, { clamp: false });
    // the pixels that carried history (n = 2); a lit pixel with no valid tap restarts at its own value, which is 1 either way
    const litP = [...Array(W * H).keys()].filter((p) => c0.n[p] === 2);
    ok("  ...and the clamp holds the reprojected history inside the current frame's 3 x 3 range: a history of 50 over a frame of 1 is 1 clamped, 25.5 unclamped",
        litP.length > 400 && litP.every((p) => c1.A[p * 3] === 1) && litP.every((p) => Math.abs(c0.A[p * 3] - 25.5) < 1e-9), `${litP.length} pixels with history`);
}

console.log("\n4. THE STUDY'S ARMS ON A TINY SEQUENCE");
{
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const seq = renderTemporalUpscaleImages("R", 990000, { w: 24, h: 24, sppIn: 2, sppRef: 8 });
    const F = St.temporalUpFrames(seq, net), again = St.temporalUpFrames(seq, net), arms = ["Bt", "B1", "Dt", "D1", "BtNoClamp", "DtAware", "noisyHalf", "noisyFull1"];
    ok("every arm a finite 24 x 24 rgb image, the whole chain bit for bit the same twice, and the history counted",
        arms.every((k) => F[k].length === 24 * 24 * 3 && F[k].every(Number.isFinite)) && arms.every((k) => F[k].every((v, i) => Object.is(v, again[k][i]))) &&
        F.history.meanN > 1 && F.history.meanN <= FRAMES && seq.frames.length === FRAMES && seq.frames.every((f, i) => f.jitter === JITTER[i]),
        `mean history ${F.history.meanN.toFixed(2)} frames`);
    // the candidate is the CLAMPED accumulation, and its light sources are composited once: where the emitters cover a pixel whole, Bt
    // is their emission exactly, as round 30's B was
    const whole = [...seq.full.cov.keys()].filter((p) => seq.full.cov[p] === 1);
    ok("  Bt takes the clamp (it differs from the unclamped accumulation), and where a light covers a pixel whole Bt is its emission, bit for bit",
        F.Bt.some((v, i) => !Object.is(v, F.BtNoClamp[i])) && whole.length > 0 && whole.every((p) => [0, 1, 2].every((c) => Object.is(F.Bt[p * 3 + c], seq.full.E[p * 3 + c]))),
        `${whole.length} pixels a light covers whole`);
    // ...and the light accumulated before that composite carries no light source's own radiance: where a light covers a pixel whole the
    // fill put the light beside it there, which is far below the emission (S7 -- compositing every frame before the accumulation -- went
    // 0 RED before this row: the final composite writes E over a whole pixel either way). Measured here: the light beside a light source
    // reaches 0.206 of its emission; under S7 it is 1.000 -- the bound is half
    ok("  the accumulated light holds no light source's radiance: at every pixel a light covers whole it is below half the emission there",
        whole.every((p) => [0, 1, 2].every((c) => F.light[p * 3 + c] < 0.5 * seq.full.E[p * 3 + c])),
        `worst ${Math.max(...whole.map((p) => F.light[p * 3] / seq.full.E[p * 3])).toFixed(3)} of the emission`);
    const sets = St.temporalUpSets({ noisyHalf: 1, B1: 2, Bt: 3, noisyFull1: 4, Dt: 5, floor: 6 });
    ok("  the two hypotheses' columns: H1 Bt against B1 over the half-size noisy frame, H2 Bt against Dt over the 1-sample one",
        sets.H1.filter === 2 && sets.H1.net[0] === 3 && sets.H1.noisy === 1 && sets.H2.filter === 5 && sets.H2.net[0] === 3 && sets.H2.noisy === 4 && sets.H1.floor === 6);
    let refused = null; try { renderTemporalUpscaleImages("R", 46000, { w: 8, h: 8, sppIn: 1, sppRef: 1 }); } catch (e) { refused = e.message; }
    ok("  ...and a dataset seed is refused without { harvest: true }", /dataset seed/.test(refused || ""), refused || "rendered");
}

console.log("\n5. THE SPLIT");
{
    const T1 = D.SPLITS_TEMPORALUP.T1, old = new Set(D.SPLITS_EMITTER.T1.seeds);
    ok("twelve new images, six R and six C, every seed reserved and none of round 30's",
        T1.seeds.length === 12 && T1.families.filter((f) => f === "R").length === 6 && T1.families.filter((f) => f === "C").length === 6 &&
        T1.seeds.every((s) => D.isDatasetSeed(s) && !old.has(s)), T1.seeds.join(","));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether the temporal upscale helps. That is section 95's harvest's to say, on images this gate never renders.");
process.exit(fails ? 1 : 0);
