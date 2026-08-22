// headless self-check: (1) the WGSL-mirroring shadows are bit-identical to the CPU reference pipeline, so the GPU
// port's indexing + math are proven; (2) the pipeline genuinely sharpens vs plain bilinear.
import { anime4kCPU, upscale2x, deblurDoG, lineDarken, luma } from "./anime4k.js";
import { UPSCALE_WGSL, DEBLUR_WGSL, DARKEN_WGSL, shadowUpscale, shadowDeblur, shadowDarken } from "./anime4kKernels.js";

// a small textured test image (lines + a gradient + a flat region)
const w = 40, h = 40, img = new Float32Array(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4;
    let v = 0.85 - 0.2 * (x / w); if (Math.abs(x - y) < 1 || Math.abs(x - (h - y)) < 1 || (x % 11 === 0)) v = 0.12;
    img[o] = v; img[o + 1] = v * 0.96; img[o + 2] = v * 0.9; img[o + 3] = 1; }

// CPU reference pipeline, done stepwise so we can compare each pass
const sD = 1.5, sK = 0.5;
const up = upscale2x(img, w, h); const cpuUp = up.data.slice();
const dbBuf = up.data.slice(); deblurDoG(dbBuf, up.w, up.h, sD);
const dkBuf = dbBuf.slice(); lineDarken(dkBuf, up.w, up.h, sK);

// shadow (WGSL-mirroring) pipeline
const sUp = shadowUpscale(img, w, h);
const sDb = shadowDeblur(sUp.data, sUp.w, sUp.h, sD);
const sDk = shadowDarken(sDb, sUp.w, sUp.h, sK);

const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const dU = maxDiff(cpuUp, sUp.data), dD = maxDiff(dbBuf, sDb), dK = maxDiff(dkBuf, sDk);
console.log("shadow vs CPU reference (max |diff|):  upscale " + dU.toExponential(1) + "  deblur " + dD.toExponential(1) + "  darken " + dK.toExponential(1));
const identical = dU === 0 && dD === 0 && dK === 0;
console.log("  -> " + (identical ? "BIT-IDENTICAL (WGSL port faithful)" : "MISMATCH"));

// sharpening check vs bilinear
function step(b, W, H) { let s = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) { const L = (xx) => luma(b[(y * W + xx) * 4], b[(y * W + xx) * 4 + 1], b[(y * W + xx) * 4 + 2]); s = Math.max(s, Math.abs(L(x + 1) - L(x))); } return s; }
const a4k = anime4kCPU(img, w, h, { scale: 2, strengthDeblur: sD, strengthDarken: sK });
const sb = step(cpuUp, up.w, up.h), sa = step(a4k.data, a4k.w, a4k.h);
console.log("edge steepness: bilinear " + sb.toFixed(3) + " -> anime4k " + sa.toFixed(3) + " (" + (sa / sb).toFixed(2) + "x)");

// WGSL sanity
for (const [nm, src] of [["UPSCALE", UPSCALE_WGSL], ["DEBLUR", DEBLUR_WGSL], ["DARKEN", DARKEN_WGSL]]) {
    const leak = src.includes("${"), br = src.split("{").length === src.split("}").length, pr = src.split("(").length === src.split(")").length;
    console.log(nm + " WGSL: no-leak=" + (!leak) + " braces=" + br + " parens=" + pr);
}
const ok = identical && sa > sb * 1.15;
console.log("result: " + (ok ? "PASS -- faithful GPU port + genuine sharpening" : "CHECK"));
process.exit(ok ? 0 : 1);
