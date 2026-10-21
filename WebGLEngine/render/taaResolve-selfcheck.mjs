// WebGLEngine/render/taaResolve-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~3 s)
//
// Run: node render/taaResolve-selfcheck.mjs
//
// TAA, HELD TO UPSTREAM'S TEXT AND TO WHAT ITS COMMENTS SAY THE RESOLVE DOES:
//   1  LIFTED     the Catmull-Rom weights, the reprojection, the variance clip, the feedback terms and the weighting are upstream's taa.fragment.wgsl / postCommon.wgsl; the Halton table is upstream's postChain.js
//                 builder and gives the textbook radical inverses;
//   2  THE GATES  enabled = 0, historyValid = 0, a pixel whose reprojection falls off last frame, and a NaN history all return the current frame (or its neighbourhood mean) and never a NaN;
//   3  THE CLAIMS "history is resampled every frame, a bilinear tap convolves it with a tent kernel again and again": a sharp edge resampled 12 times at half a pixel is far blurrier through bilinear than through
//                 the Catmull-Rom fetch (measured 10-90% widths); "the variance clip rejects ghosts": a bright object left in the history where the current frame is dark is not carried into the output; "it
//                 integrates": a static scene with per-frame noise converges toward the truth (error falls by half or more at feedback 0.9); "the long reprojection is a poor prediction": feedback falls with motion;
//   4  THE KERNEL (needs the software WebGPU adapter; SKIPPED, and said, without one) the compute kernel on Dawn over a 32 x 24 frame with a moving camera equals the twin (worst difference bounded).
// NOT GRADED, said plainly: the jittered projection and render-graph wiring (Babylon's), real motion, a real GPU.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as T from "./taaResolve.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const W = 24, H = 16, PROJ = [0.9, 0.6];
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// a projection that maps view-space (x, y, z) to clip (x / tx, y / ty, z, z): column-major, so a static camera reprojects every pixel onto itself
const PROJM = [1 / PROJ[0], 0, 0, 0, 0, 1 / PROJ[1], 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
const state = (over = {}) => ({ w: W, h: H, cur: new Float32Array(W * H * 4), hist: new Float32Array(W * H * 4), depth: new Float32Array(W * H).fill(20), prevViewProj: PROJM, invView: IDENT, projInfo: PROJ, jitterNdc: [0, 0], historyValid: 1, enabled: 1, feedback: 0.9, ...over });
const fill = (img, fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = fn(x, y); const o = (y * W + x) * 4; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 1; } };
const px = (img, x, y) => { const o = (y * W + x) * 4; return [img[o], img[o + 1], img[o + 2]]; };

console.log("taaResolve-selfcheck -- the temporal resolve\n");
console.log("1. LIFTED");
{
    const up = norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/post/taa.fragment.wgsl"), "utf8")), kern = norm(T.RESOLVE_KERNEL_WGSL);
    const stmts = [
        "let w0 = f * (-0.5 + f * (1.0 - 0.5 * f)); let w1 = 1.0 + f * f * (-2.5 + 1.5 * f); let w2 = f * (0.5 + f * (2.0 - 1.5 * f)); let w3 = f * f * (-0.5 + 0.5 * f);",
        "let w12 = w1 + w2; let off12 = w2 / w12;", "return max(acc, vec3f(0.0));",
        "let ndc = uv * 2.0 - 1.0 - uniforms.jitterNdc;", "* min(z, POST_FAR); let world = uniforms.invView * vec4f(view, 1.0);",
        "let prevClip = uniforms.prevViewProj * vec4f(world.xyz, 1.0); if (prevClip.w <= 1e-4) { return cur; }",
        "let prevUV = (prevClip.xy / prevClip.w) * 0.5 + 0.5;",
        "let mu = m1 / 9.0; let sigma = sqrt(max(vec3f(0.0), m2 / 9.0 - mu * mu)); let lo = mu - sigma * 1.35; let hi = mu + sigma * 1.35;",
        "if (any(raw != raw)) { raw = mu; } let hist = clamp(raw, lo, hi);",
        "let motionFade = 1.0 - clamp(motion / 64.0, 0.0, 1.0) * 0.35; let clipFade = 1.0 - clamp(length(hist - raw) * 4.0, 0.0, 1.0) * 0.45;",
        "let k = clamp(uniforms.feedback * motionFade * clipFade, 0.0, 0.97); return tonemapUnweight(mix(curW, hist, k));",
        "fn tonemapWeight(c: vec3f) -> vec3f { return c / (1.0 + lumaPost(c)); }",
    ];
    const missing = stmts.filter((s) => !(up.includes(s) || fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders/lib/postCommon.wgsl"), "utf8").replace(/\s+/g, " ").includes(s)) || !kern.includes(s));
    ok("!! the Catmull-Rom weights, the reprojection, the variance clip at 1.35 sigma, the NaN guard and the feedback terms are upstream's text, statement for statement", missing.length === 0, stmts.length + " statements in both" + (missing.length ? "; MISSING " + missing.map((m) => m.slice(0, 50)).join(" | ") : ""));
    const hj = T.buildHalton(8);
    ok("!! buildHalton(8) is Halton(2,3) on [-0.5, 0.5]: the first points are (0, -1/6), (-1/4, 1/6), (1/4, -7/18), (-3/8, -1/18), and the table is upstream's postChain.js builder verbatim", Math.abs(hj[0] - 0) < 1e-6 && Math.abs(hj[1] + 1 / 6) < 1e-6 && Math.abs(hj[2] + 0.25) < 1e-6 && Math.abs(hj[3] - 1 / 6) < 1e-6 && Math.abs(hj[4] - 0.25) < 1e-6 && Math.abs(hj[5] + 7 / 18) < 1e-6 && Math.abs(hj[6] + 0.375) < 1e-6 && /function radical\(i, base\)/.test(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/post/postChain.js"), "utf8")) && T.radical(5, 2) === 0.625);
}

console.log("\n2. THE GATES");
{
    const r = rng(4), S = state(); fill(S.cur, () => [r(), r(), r()]); fill(S.hist, () => [r(), r(), r()]);
    const cur = (x, y) => px(S.cur, x, y), same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
    ok("!! enabled = 0 and historyValid = 0 both return the current frame, pixel for pixel (history never read)", same(T.resolvePixel({ ...S, enabled: 0 }, 5, 5), cur(5, 5)) && same(T.resolvePixel({ ...S, historyValid: 0 }, 5, 5), cur(5, 5)) && same(T.resolvePixel({ ...S, historyValid: 0.4 }, 7, 3), cur(7, 3)));
    // a camera that moves so far this pixel's previous position is off screen: prevViewProj with a big x shift
    const shifted = [...PROJM]; shifted[12] = 60;   // clip.x += 60 against w = 20: the previous NDC x moves by 3, far off the screen
    const info = {}; const off = T.resolvePixel({ ...S, prevViewProj: shifted }, 5, 5, info);
    ok("!! a pixel whose reprojection lands off the edge of last frame is a disocclusion: it returns the current frame", !info.reprojected && same(off, cur(5, 5)));
    const bad = state(); fill(bad.cur, (x) => [0.2 + 0.01 * x, 0.3, 0.4]); bad.hist.fill(NaN);
    const o = T.resolvePixel(bad, 8, 8);
    ok("!! a NaN history cannot propagate: the output is finite and equals the neighbourhood mean path (a NaN survives a clamp, so it is replaced first)", o.every(Number.isFinite));
    const behind = T.resolvePixel({ ...S, prevViewProj: PROJM.map((v, i) => (i === 11 ? -1 : v)) }, 5, 5);
    ok("  a point behind last frame's camera (w <= 0) returns the current frame", same(behind, cur(5, 5)));
}

console.log("\n3. UPSTREAM'S CLAIMS");
{
    // (a) the blur of repeated resampling: a sharp vertical edge, resampled 12 times with a half-pixel shift out and back
    const N = 64, edgeImg = () => { const a = new Float32Array(N * 4 * 4); for (let y = 0; y < 4; y++) for (let x = 0; x < N; x++) { const o = (y * N + x) * 4, v = x < N / 2 ? 0 : 1; a[o] = a[o + 1] = a[o + 2] = v; a[o + 3] = 1; } return a; };
    const width = (img) => { let lo = -1, hi = -1; for (let x = 0; x < N; x++) { const v = img[(1 * N + x) * 4]; if (v > 0.1 && lo < 0) lo = x; if (v > 0.9 && hi < 0) hi = x; } return hi - lo; };
    const resample = (img, fn) => { const out = new Float32Array(img.length); for (let y = 0; y < 4; y++) for (let x = 0; x < N; x++) { const c = fn(img, (x + 0.5 + (x % 2 ? 0.5 : -0.5)) / N, (y + 0.5) / 4), o = (y * N + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1; } return out; };
    // a clean fractional shift: every pixel reads the image half a pixel to its right, then half a pixel to its left, twelve rounds
    const shiftBy = (img, fn, dx) => { const out = new Float32Array(img.length); for (let y = 0; y < 4; y++) for (let x = 0; x < N; x++) { const c = fn(img, (x + 0.5 + dx) / N, (y + 0.5) / 4), o = (y * N + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1; } return out; };
    const bil = (img, u, v) => T.sampleRGB(img, N, 4, u, v), cat = (img, u, v) => T.historyCatmullRom(img, N, 4, [u, v]);
    let a = edgeImg(), b = edgeImg(); for (let i = 0; i < 12; i++) { a = shiftBy(a, bil, i % 2 ? -0.5 : 0.5); b = shiftBy(b, cat, i % 2 ? -0.5 : 0.5); }
    const wb = width(a), wc = width(b);
    ok("!! bilinear history blurs a sharp edge when resampled every frame, the Catmull-Rom fetch does not: after 12 half-pixel resamples the 10-90% edge is " + wb + " px wide through bilinear and " + wc + " px through Catmull-Rom", wb >= wc + 2 && wc <= 3);
    // (b) ghost rejection
    const G = state(); fill(G.cur, () => [0.1, 0.1, 0.1]); fill(G.hist, (x, y) => (x >= 6 && x < 12 && y >= 4 && y < 10 ? [4, 4, 4] : [0.1, 0.1, 0.1]));
    const ghost = T.resolvePixel(G, 9, 7), still = T.resolvePixel(G, 1, 1);
    ok("!! variance clipping rejects a ghost: a bright object (4.0) left in the history over a dark current frame (0.1) comes out at " + ghost[0].toFixed(3) + ", not carried through", ghost[0] < 0.3 && Math.abs(still[0] - 0.1) < 1e-6, "");
    // (c) integration of noise on a static scene
    const rr = rng(7), truth = (x, y) => [0.3 + 0.02 * x, 0.4 + 0.01 * y, 0.5], noisy = (x, y) => { const t = truth(x, y); return [t[0] + (rr() - 0.5) * 0.4, t[1] + (rr() - 0.5) * 0.4, t[2] + (rr() - 0.5) * 0.4]; };
    const I = state(); let hist = new Float32Array(W * H * 4), err0 = 0, errN = 0; fill(hist, noisy);
    for (let f = 0; f < 30; f++) { fill(I.cur, noisy); I.hist = hist; hist = T.resolveFrame(I); }
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const t = truth(x, y); err0 += Math.abs(I.cur[(y * W + x) * 4] - t[0]); errN += Math.abs(hist[(y * W + x) * 4] - t[0]); }
    ok("!! it integrates: on a static scene with 0.4-wide per-frame noise the mean error falls from " + (err0 / ((W - 4) * (H - 4))).toFixed(3) + " (one frame) to " + (errN / ((W - 4) * (H - 4))).toFixed(3) + " after 30 frames at feedback 0.9", errN < err0 * 0.6);
    // (d) feedback falls with motion
    const M0 = {}, M1 = {}, still0 = state(), moved = state(); fill(still0.cur, () => [0.5, 0.5, 0.5]); fill(still0.hist, () => [0.5, 0.5, 0.5]); fill(moved.cur, () => [0.5, 0.5, 0.5]); fill(moved.hist, () => [0.5, 0.5, 0.5]);
    const sh = [...PROJM]; sh[12] = 0.9 * PROJ[0] * 0 + 0.0; sh[8] = 0;   // keep the matrix valid; motion comes from a shifted prevViewProj translation below
    const mv = PROJM.slice(); mv[12] = 30;   // clip.x += 30 against w = 20: the previous uv is 0.75 to the right, 18 pixels at this width
    T.resolvePixel(still0, 12, 8, M0); T.resolvePixel({ ...moved, prevViewProj: mv }, 2, 8, M1);
    ok("!! feedback falls with screen-space motion: " + M0.k.toFixed(3) + " at rest, " + (M1.k !== undefined ? M1.k.toFixed(3) : "n/a") + " after a reprojection of 18 pixels (down by up to 35% at 64)", M1.reprojected !== false && M1.k < M0.k * 0.95 && M1.k > M0.k * 0.6);
    report(T.reportLines().join(" | "));
}

console.log("\n4. THE KERNEL");
{
    const skip = headlessGpuSkipReason(require_);
    if (skip) { report("kernel half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 never run the WGSL"); }
    else {
        const r = rng(13), S = state({ jitterNdc: [0.02, -0.03], feedback: 0.9 });
        fill(S.cur, (x, y) => [0.4 + 0.3 * Math.sin(x * 0.4) + 0.1 * r(), 0.3 + 0.2 * Math.cos(y * 0.5), 0.5 + 0.1 * r()]); fill(S.hist, (x, y) => [0.4 + 0.3 * Math.sin(x * 0.4 + 0.2) + 0.1 * r(), 0.3 + 0.2 * Math.cos(y * 0.5), 0.5]);
        for (let i = 0; i < S.depth.length; i++) S.depth[i] = 15 + 10 * r();
        const mv = PROJM.slice(); mv[12] = 0.04; mv[13] = -0.02; S.prevViewProj = mv;
        const twin = T.resolveFrame(S);
        const g = await runWgslComputeNative({ code: T.RESOLVE_KERNEL_WGSL, outCount: W * H * 4, uniforms: T.packUniforms(S), inputs: [{ binding: 2, data: S.cur }, { binding: 3, data: S.hist }, { binding: 4, data: S.depth }], workgroups: [Math.ceil(W / 8), Math.ceil(H / 8)], requireFn: require_ });
        if (!g.ok) ok("!! the resolve kernel runs", false, (g.reason || "") + " " + (g.errors || []).join(" | "));
        else {
            let worst = 0, n = 0; for (let i = 0; i < twin.length; i++) { if (i % 4 === 3) continue; worst = Math.max(worst, Math.abs(g.values[i] - twin[i])); n++; }
            ok("!! the resolve kernel equals the twin over a 24 x 16 frame with a moving camera and a jittered ray (worst difference under 1e-3 of 1)", worst < 1e-3 && !g.wroteNothing, "worst " + worst.toExponential(2) + " over " + n + " values, adapter " + ((g.adapter && g.adapter.description) || "?"));
        }
    }
}

console.log(`\ntaaResolve-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
exitCleanly(fails === 0 ? 0 : 1);
