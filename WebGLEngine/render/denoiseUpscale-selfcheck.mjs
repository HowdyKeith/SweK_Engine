// WebGLEngine/render/denoiseUpscale-selfcheck.mjs -- the denoiser arc, round 26 (pre-registration section 81)
//
// Run: node render/denoiseUpscale-selfcheck.mjs
//
// GATES render/denoiseUpscale.mjs: the transfer FSR1 runs in, the four upscales, the render seeds and the frames of one
// image of the upscale round. Its exports, each named here: GAMMA, RCAS_SHARPNESS, RCAS_DENOISE, UPSCALES, toPerceptual,
// fromPerceptual, upscale, renderSeedsUpscale, renderUpscaleImages.
//
// *** NOTHING HERE RENDERS A DATASET SEED, AND NOTHING HERE SCORES AN UPSCALE AGAINST A REFERENCE. *** Every scene is
// seeded from 990000 up, outside every split, and what is held is that each piece is the piece the pre-registration fixed --
// fx/fsr/fsr.js's own functions, in the stated space, on the arc's own inputs -- never how good a picture comes out.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   U1 the transfer's gamma dropped (t = x / (1 + x))                             3 RED -- the transfer, its inverse, the flat frame
//   U2 the clamp to the frame's brightest removed                                 2 RED -- RCAS's overshoot past it, and the
//      bit-for-bit row, whose reference keeps the clamp
//   U3 "fsr1" run without RCAS (EASU alone)                                        1 RED
//   U4 RCAS's denoise switched off in "fsr1"                                       2 RED -- the constant and the bit-for-bit row
//   U5 the half-size frame traced on the full-size frame's render seed            1 RED -- ZERO on the first draft, whose
//      seed row compared the two full-size inputs only; the row now re-traces each input on its own seed
//   U6 the dataset refusal switched off                                            1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const U = await imp("render/denoiseUpscale.mjs");
const { GAMMA, RCAS_SHARPNESS, RCAS_DENOISE, UPSCALES, toPerceptual, fromPerceptual, upscale, renderSeedsUpscale, renderUpscaleImages } = U;
const { fsr1CPU, easuCPU, bilinearCPU } = await imp("fx/fsr/fsr.js");
const { renderSeeds, isDatasetSeed, SPLITS_FSR1 } = await imp("render/denoiseScenes.mjs");
const { renderSplit } = await imp("render/denoiseStudy.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();

console.log("1. THE TRANSFER, AND THE CONSTANTS THE PRE-REGISTRATION FIXED");
{
    ok("  gamma 2.2; RCAS at 0.9 (AMD's 0.2 stops) with its denoise ON; four upscales, fsr1 first and bilinear its control",
        GAMMA === 2.2 && RCAS_SHARPNESS === 0.9 && RCAS_DENOISE === true && UPSCALES.join() === "fsr1,bilinear,easu,fsr1-nodenoise");
    const xs = [0, 1e-6, 1e-3, 0.05, 0.5, 1, 2, 7, 30, 300];
    const ts = xs.map(toPerceptual);
    ok("!! t = (x / (1 + x))^(1 / 2.2): 0 at 0, inside [0, 1), strictly increasing -- 1 at 1 is 0.5^(1/2.2)",
        ts[0] === 0 && ts.every((t) => t >= 0 && t < 1) && ts.every((t, i) => i === 0 || t > ts[i - 1]) && Math.abs(toPerceptual(1) - Math.pow(0.5, 1 / 2.2)) < 1e-15,
        ts.map((t) => t.toFixed(4)).join(" "));
    const worst = Math.max(...xs.slice(1).map((x) => Math.abs(fromPerceptual(toPerceptual(x)) - x) / x));
    ok("!! its inverse is exact in f64 over 1e-6 to 300 -- the round trip is the space, not a loss", worst < 1e-10, `worst relative ${worst.toExponential(2)}`);
    ok("  and a negative radiance (none should arrive) is treated as 0, not reflected", toPerceptual(-0.5) === 0);
}

console.log("\n2. EACH UPSCALE IS fx/fsr/fsr.js's OWN FUNCTION, IN THE TRANSFER'S SPACE, CLAMPED TO THE FRAME'S BRIGHTEST");
{
    // a small HDR picture: a ramp, an edge, and an emitter-bright patch -- planted, not rendered
    const w = 8, h = 6, W = 16, H = 12, img = new Float64Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) img[(y * w + x) * 3 + c] = (x < 4 ? 0.05 + 0.02 * x : 0.6 + 0.1 * c) + (x >= 6 && y < 2 ? 25 : 0);
    const src = new Float32Array(w * h * 4); let tMax = 0;
    for (let p = 0; p < w * h; p++) { for (let c = 0; c < 3; c++) { src[p * 4 + c] = toPerceptual(img[p * 3 + c]); tMax = Math.max(tMax, src[p * 4 + c]); } src[p * 4 + 3] = 1; }
    const back = (d) => Float64Array.from({ length: W * H * 3 }, (_, i) => fromPerceptual(Math.min(Math.max(d[Math.floor(i / 3) * 4 + (i % 3)], 0), tMax)));
    const want = { fsr1: back(fsr1CPU(src, w, h, W, H, 0.9, true).data), bilinear: back(bilinearCPU(src, w, h, W, H).data),
                   easu: back(easuCPU(src, w, h, W, H).data), "fsr1-nodenoise": back(fsr1CPU(src, w, h, W, H, 0.9, false).data) };
    const same = UPSCALES.every((k) => { const y = upscale(img, w, h, W, H, k); return y.length === W * H * 3 && y.every((v, i) => Object.is(v, want[k][i])); });
    ok("!! every upscale is the fsr.js function the round names -- fsr1 is EASU then RCAS at 0.9 with denoise, bilinear is bilinearCPU -- bit for bit", same);
    // to 1e-4, not 1e-9: the clamp is in the transfer's space, and inverting a FLOAT32 t near a bright emitter lands a few
    // parts in a million above the f64 input -- MEASURED, bilinear included, at 1e-9 nine values read "brighter". That is
    // the transfer's rounding, not light; RCAS's overshoot, unclamped, is orders past it (sabotage U2).
    const maxIn = Math.max(...img), over = UPSCALES.map((k) => [k, upscale(img, w, h, W, H, k).filter((v) => v > maxIn * (1 + 1e-4)).length]);
    ok("!! NOTHING comes out brighter than the brightest input: RCAS's overshoot is clamped, an upscaler may not make light",
        over.every(([, n]) => n === 0), over.map(([k, n]) => `${k} ${n}`).join(", "));
    const flat = new Float64Array(w * h * 3).fill(0.37);
    ok("  a flat frame stays flat through every upscale (to the transfer's float32 step)", UPSCALES.every((k) => upscale(flat, w, h, W, H, k).every((v) => Math.abs(v - 0.37) < 1e-6)));
    let threw = 0;
    try { upscale(img, w, h, W, H, "lanczos"); } catch { threw++; }
    try { upscale(img, w + 1, h, W, H, "fsr1"); } catch { threw++; }
    ok("  an upscale it does not know, or an image that is not the size it says, is refused", threw === 2);
}

console.log("\n3. ONE IMAGE OF THE ROUND: FIVE RENDER SEEDS, THREE INPUTS, THE ARC'S OWN INPUT BUILT AT EACH SIZE");
{
    const rs = renderSeedsUpscale(990010), base = renderSeeds(990010);
    ok("!! five render seeds an image -- renderSeeds' three, then the 1-sample input and the half-size input -- all distinct",
        rs.input === base.input && rs.ref === base.ref && rs.ref2 === base.ref2 && rs.full1 === 990010 * 8 + 4 && rs.half === 990010 * 8 + 5 && new Set(Object.values(rs)).size === 5);
    const all = SPLITS_FSR1.T1.seeds.flatMap((s) => Object.values(renderSeedsUpscale(s)));
    ok("  ...and across the round's 12 images, 60 distinct (C5)", all.length === 60 && new Set(all).size === 60);
    const im = renderUpscaleImages("R", 990010, { w: 16, h: 16, sppIn: 4, sppRef: 8 });
    ok("!! the three inputs: full size at 4 samples, full size at 1, HALF size at 4 -- each the arc's 10-channel input with the emitter mask",
        im.full4.w === 16 && im.full4.spp === 4 && im.full1.w === 16 && im.full1.spp === 1 && im.half4.w === 8 && im.half4.h === 8 && im.half4.spp === 4 &&
        im.full4.x.length === 16 * 16 * 10 && im.half4.x.length === 8 * 8 * 10 && im.ref.length === 16 * 16 * 3 && im.ref2.length === 16 * 16 * 3);
    const viaSplit = renderSplit({ family: "R", seeds: [990010] }, { harvest: false, image: 16, sppIn: 4, sppRef: 8, ref2: true, emitterMask: true })[0];
    ok("!! the full-size 4-sample frame IS the arc's own input for that scene -- renderSplit's, bit for bit -- and so is its reference",
        im.full4.x.every((v, i) => Object.is(v, viaSplit.x[i])) && im.ref.every((v, i) => Object.is(v, viaSplit.ref[i])) && im.ref2.every((v, i) => Object.is(v, viaSplit.ref2[i])));
    // re-traced here on the seeds section 81 named -- a first draft compared the two FULL-size inputs only, and tracing the
    // half-size frame on the full-size frame's seed went 0 red (sabotage U5); now each input is held to its own seed
    const { render } = await imp("physics/render/pathTracer.mjs"), { makeScene } = await imp("render/denoiseScenes.mjs");
    const S = makeScene("R", 990010), o = (W, spp, seed) => ({ w: W, h: W, spp, seed, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const eq = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    ok("!! each input is traced on its OWN pre-registered seed -- full size 4 samples on `input`, 1 sample on `full1`, half size on `half` -- re-traced here bit for bit",
        eq(im.full4.input, render(S.scene, o(16, 4, rs.input))) && eq(im.full1.input, render(S.scene, o(16, 1, rs.full1))) &&
        eq(im.half4.input, render(S.scene, o(8, 4, rs.half))) && !eq(im.half4.input, render(S.scene, o(8, 4, rs.input))));
    let refused = 0, odd = 0;
    for (const s of SPLITS_FSR1.T1.seeds) { try { renderUpscaleImages("R", s, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refused++; } }
    try { renderUpscaleImages("R", 990011, { w: 15, h: 16, sppIn: 1, sppRef: 1 }); } catch (e) { if (/no half size/.test(e.message)) odd++; }
    ok("!! every one of the round's seeds is REFUSED without { harvest: true }, and a frame with no half size is refused", refused === 12 && odd === 1 && SPLITS_FSR1.T1.seeds.every(isDatasetSeed), `${refused} of 12`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether FSR1 is the right upscaler, or 0.9 the right sharpness. Section 81 fixed both before any test scene existed; " +
    "this gate holds the code to them.");
process.exit(fails ? 1 : 0);
