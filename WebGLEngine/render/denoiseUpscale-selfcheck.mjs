// WebGLEngine/render/denoiseUpscale-selfcheck.mjs -- the denoiser arc, round 26 (pre-registration section 81)
//
// Run: node render/denoiseUpscale-selfcheck.mjs
//
// GATES render/denoiseUpscale.mjs: the transfer FSR1 runs in, the four upscales, the render seeds and the frames of one
// image of the upscale round, and round 30's emitter-aware chain (section 91). Its exports, each named here: GAMMA,
// RCAS_SHARPNESS, RCAS_DENOISE, UPSCALES, toPerceptual, fromPerceptual, upscale, fillEmitters, compositeEmitters,
// emitterAwareUpscale, nearEmitterShare, renderSeedsUpscale, renderUpscaleImages.
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
//   U7 (section 91) the fill reads emitter pixels too                              3 RED -- never-reads, ring by ring, the chain's leak
//   U8 the fill written in place as it goes, in scan order                         1 RED -- ring by ring (the mirror disagrees)
//   U9 the composite without (1 - cov)                                             1 RED
//   U10 the aware upscale without its fill                                         1 RED -- the chain row: the emitter leaks out again
//   U11 the share near an emitter ignoring its reach                               1 RED
//   U12 only whole emitter pixels filled (cov >= 1), the rim kept                  3 RED -- never-reads, ring by ring, the chain's leak
//   U13 (round 31) fillEmittersBounded leaves an unreached pixel at its value      1 RED -- the bounded row
//   U14 (round 31) the bound runs one ring fewer than asked                         1 RED -- the bounded row
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const U = await imp("render/denoiseUpscale.mjs");
const { GAMMA, RCAS_SHARPNESS, RCAS_DENOISE, UPSCALES, toPerceptual, fromPerceptual, upscale, renderSeedsUpscale, renderUpscaleImages, fillEmitters, fillEmittersBounded, compositeEmitters, emitterAwareUpscale, nearEmitterShare } = U;
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
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

console.log("\n4. SECTION 91: THE EMITTERS TAKEN OUT OF THE UPSCALE -- THE FILL, THE COMPOSITE, THE CHAIN, THE SHARE NEAR AN EMITTER");
{
    // a planted 8 x 6 half-size frame: a ramp, and an emitter patch of 25 at the top right whose own coverage marks it
    const w = 8, h = 6, W = 16, H = 12, img = new Float64Array(w * h * 3), cov = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x, e = x >= 5 && y < 3;
        cov[p] = e ? (x === 5 || y === 2 ? 0.5 : 1) : 0;
        for (let c = 0; c < 3; c++) img[p * 3 + c] = e ? 25 : 0.05 + 0.03 * x + 0.01 * y + 0.002 * c;
    }
    const F = fillEmitters(img, cov, w, h), holes = [...cov.keys()].filter((p) => cov[p] > 0);
    const known = (p) => cov[p] === 0;
    ok("!! the fill leaves every pixel no emitter touches as it was, bit for bit, and comes back unchanged from a frame with no emitter in it",
        [...cov.keys()].filter(known).every((p) => [0, 1, 2].every((c) => Object.is(F[p * 3 + c], img[p * 3 + c]))) &&
        fillEmitters(img, new Float64Array(w * h), w, h).every((v, i) => Object.is(v, img[i])));
    // the emitter's own radiance is NEVER read: the same frame with the patch at 1e9 fills to the same bits
    const loud = Float64Array.from(img, (v, i) => (cov[(i / 3) | 0] > 0 ? 1e9 : v));
    const maxKnown = Math.max(...[...cov.keys()].filter(known).flatMap((p) => [0, 1, 2].map((c) => img[p * 3 + c])));
    ok("!! *** and it never reads an emitter pixel's own value: the patch at 25 or at 1e9 fills to the same bits, every filled value inside the range of the light beside it ***",
        same(fillEmitters(loud, cov, w, h), F) && holes.every((p) => [0, 1, 2].every((c) => F[p * 3 + c] <= maxKnown && F[p * 3 + c] > 0)), `${holes.length} holes`);
    // round 31: the bounded form a device runs (render/denoiseUpscaleGPU.mjs) -- with rings to spare it is fillEmitters to the
    // bit; one ring short it stops, and what no ring reached is 0, never the patch's 25
    const B8 = fillEmittersBounded(img, cov, w, h, 8), B1 = fillEmittersBounded(img, cov, w, h, B8.rings - 1);
    ok("!! round 31: fillEmittersBounded with rings to spare is fillEmitters bit for bit; one ring short, it leaves the last ring's pixels at 0",
        B8.left === 0 && B8.rings >= 2 && same(B8.y, F) && B1.rings === B8.rings - 1 && B1.left > 0 &&
        holes.every((p) => [0, 1, 2].every((c) => B1.y[p * 3 + c] === 0 || Object.is(B1.y[p * 3 + c], F[p * 3 + c]))),
        `${B8.rings} rings; ${B1.left} of ${holes.length} left one ring short`);
    // ring by ring: a first-ring pixel is the mean of its KNOWN 8-neighbours as they were, and the order of visit does not
    // matter -- the frame mirrored left to right fills to the mirror, to the last few bits of a reordered sum
    const q0 = 2 * w + 5, ns = [];   // (5, 2): a rim pixel of the patch, filled in the first ring
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (2 + dy) * w + 5 + dx; if ((dx || dy) && known(q)) ns.push(q); }
    const mirror = (a, C) => Float64Array.from(a, (_, i) => { const p = (i / C) | 0, c = i % C, x = p % w, y = (p / w) | 0; return a[(y * w + (w - 1 - x)) * C + c]; });
    const back = mirror(fillEmitters(mirror(img, 3), mirror(cov, 1), w, h), 3);
    ok("!! ring by ring, each filled pixel the mean of the neighbours known after the last ring -- and the result does not depend on the order pixels are visited",
        cov[q0] > 0 && ns.length === 5 && [0, 1, 2].every((c) => Math.abs(F[q0 * 3 + c] - ns.reduce((a, q) => a + img[q * 3 + c], 0) / ns.length) < 1e-15) &&
        back.every((v, i) => Math.abs(v - F[i]) <= 1e-12 * Math.abs(F[i])), `(5, 2) from its ${ns.length} known neighbours`);
    let threw = 0;
    try { fillEmitters(img, new Float64Array(w * h).fill(1), w, h); } catch (e) { if (/nothing to fill from/.test(e.message)) threw++; }
    try { fillEmitters(img, cov, w + 1, h); } catch { threw++; }
    ok("  a frame that is all emitter, or not the size it says, is refused", threw === 2);
    // the composite: E + (1 - cov) x frame -- E exactly where covered whole, the frame exactly where nothing is
    const n = W * H, fc = new Float64Array(n), fE = new Float64Array(n * 3), up = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) { const x = p % W, y = (p / W) | 0; fc[p] = x >= 11 && y < 6 ? (x === 11 || y === 5 ? 0.25 : 1) : 0; for (let c = 0; c < 3; c++) { fE[p * 3 + c] = fc[p] * (20 + c); up[p * 3 + c] = 0.1 + 0.01 * x + 0.001 * c; } }
    const full = { cov: fc, E: fE }, comp = compositeEmitters(up, full);
    ok("!! the composite is E + (1 - cov) x the frame: the emission alone where covered whole, the frame alone where no emitter is, the blend at the rim",
        [...Array(n).keys()].every((p) => [0, 1, 2].every((c) => Object.is(comp[p * 3 + c], fE[p * 3 + c] + (1 - fc[p]) * up[p * 3 + c]))) &&
        [...Array(n).keys()].every((p) => fc[p] !== 1 || [0, 1, 2].every((c) => Object.is(comp[p * 3 + c], fE[p * 3 + c]))) &&
        [...Array(n).keys()].every((p) => fc[p] !== 0 || [0, 1, 2].every((c) => Object.is(comp[p * 3 + c], up[p * 3 + c]))));
    // the chain is those three in that order, bit for bit; and it keeps the emitter's light OUT of the pixels no emitter
    // covers, where the plain upscale carries it in
    const kinds = ["easu", "bilinear"], chainOk = kinds.every((k) => same(emitterAwareUpscale(img, cov, w, h, W, H, k, full), compositeEmitters(upscale(F, w, h, W, H, k), full)));
    const outside = [...Array(n).keys()].filter((p) => fc[p] === 0);
    const leak = (y) => outside.filter((p) => [0, 1, 2].some((c) => y[p * 3 + c] > maxKnown * (1 + 1e-4))).length;
    const awareLeak = kinds.map((k) => leak(emitterAwareUpscale(img, cov, w, h, W, H, k, full))), plainLeak = kinds.map((k) => leak(upscale(img, w, h, W, H, k)));
    ok("!! *** the emitter-aware upscale IS fill, then `upscale`, then the composite -- and no pixel outside the emitter comes out brighter than the light beside it, where the plain upscale's do ***",
        chainOk && awareLeak.every((v) => v === 0) && plainLeak.every((v) => v > 0), `aware ${awareLeak.join("/")} against plain ${plainLeak.join("/")} pixels past the brightest non-emitter value`);
    let threw2 = 0;
    try { emitterAwareUpscale(img, cov, w, h, W + 2, H, "easu", full); } catch { threw2++; }
    try { compositeEmitters(up.subarray(3), full); } catch { threw2++; }
    ok("  a full-size coverage of the wrong size, or a frame that does not match it, is refused", threw2 === 2);
    // the share near an emitter: planted errors, one pixel each, at Chebyshev distance 2 and 3 from the only covered pixel
    const r = new Float64Array(n * 3).fill(1), c1 = new Float64Array(n), at = (x, y) => y * W + x;
    c1[at(4, 4)] = 0.5;
    const err = (ps) => { const y = Float64Array.from(r); for (const p of ps) y[p * 3] = 2; return y; };
    const s2 = nearEmitterShare(err([at(6, 4)]), r, c1, W, H), s3 = nearEmitterShare(err([at(7, 4)]), r, c1, W, H), sHalf = nearEmitterShare(err([at(6, 6), at(10, 10)]), r, c1, W, H);
    ok("!! the share of relMSE's sum within 2 px of an emitter pixel (Chebyshev): an error 2 away counts, 3 away does not, one of each is a half, and no emitter in view is 0",
        s2 === 1 && s3 === 0 && Math.abs(sHalf - 0.5) < 1e-15 && nearEmitterShare(err([at(6, 4)]), r, new Float64Array(n), W, H) === 0, `${s2} ${s3} ${sHalf}`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether FSR1 is the right upscaler, or 0.9 the right sharpness. Section 81 fixed both before any test scene existed; " +
    "this gate holds the code to them.");
process.exit(fails ? 1 : 0);
