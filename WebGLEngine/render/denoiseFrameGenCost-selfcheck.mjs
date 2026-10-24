#!/usr/bin/env node
// WebGLEngine/render/denoiseFrameGenCost-selfcheck.mjs -- the denoiser arc, round 63 (pre-registration section 143)
//
// WHAT A GENERATED FRAME COSTS ON THE DEVICE. Section 143 sums four parts against T, a traced frame (the half-size chain with its
// history, render/denoiseUpscaleGPU-selfcheck.mjs's section 103 line): the generator, the field, the light at the generated time
// (covFullB) and the composite (restComp). The last two and T are that gate's lines. This gate measures the other two:
//   1. MOTION_WGSL against motionField on the CPU, at 64 x 48 -- given the CPU's first hits (the kernel alone), and given the
//      device's own (FIRSTHITS_WGSL then MOTION_WGSL, the round's path)
//   2. the field on the device at 1920 x 1080 -- first hits then the motion pass, the motion pass timed
//   3. the generator, fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen with its default fill, at 1920 x 1080, fed THAT field -- timed on
//      the wall clock after the queue drains, median of seven
// and readH63, section 143's rule over a report, on fixtures. The scene is family R's seed 990914, outside every split.
// *** ON SWIFTSHADER THE MILLISECONDS ARE A CPU's. *** Nothing here asserts a time; section 143 reads the rig's. And on a software
// adapter the generator and the field run at 480 x 270, not 1920 x 1080: the first run here took 42 s a generated frame at full size,
// nine of them in a gate. Their lines then name 480 x 270, which readH63's patterns do not read, so a software report gives no G.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); return !!cond; };
const say = (s) => console.log(`  ----  ${s}`);
const t0 = Date.now();

const { makeScene } = await imp("render/denoiseScenes.mjs");
const { cameraPath, firstHits } = await imp("render/denoiseTemporal.mjs");
const { motionField, PREV_FRAME, CUR_FRAME, SKY_DEPTH } = await imp("render/denoiseFrameGen.mjs");
const { packSpheres, packGeometry, GEO_STRIDE } = await imp("render/denoiseUpscaleGPU.mjs");
const FGG = await imp("render/denoiseFrameGenGPU.mjs");

const SEED = 990914, S = makeScene("R", SEED), P = cameraPath(S), e6 = P.eyes[PREV_FRAME], e7 = P.eyes[CUR_FRAME];
const w = 64, h = 48, W = 1920, H = 1080, Ws = 480, Hs = 270;

console.log("1. ON THE CPU: the fixture, the textures the generator is fed, and section 143's rule");
const M = motionField(S, e6, e7, w, h), hits = firstHits(S, e7, w, h);
ok("  the fixture: family R's seed 990914, outside every split, its last orbit step moving the camera, sky and hits both in view",
    M.sky > 0 && M.sky < w * h && Array.from(M.flow).some((v) => Number.isFinite(v) && Math.abs(v) > 0.5), `${M.sky} of ${w * h} sky`);
{
    const T = FGG.generatorTextures(Float32Array.from([2, -3, NaN, NaN]), Float32Array.from([1, SKY_DEPTH]), 2, 1);
    ok("  generatorTextures: the flow negated over the frame's size and valid 1, a NaN flow valid 0, the depth d / (1 + d)",
        T.motion[0] === -1 && T.motion[1] === 3 && T.motion[2] === 1 && T.motion[6] === 0 && T.invalid === 1 && T.depth[0] === 0.5 && T.depth[4] > 0.999999);
}
{
    const line = { up: ["section 103: the default fill listedTile, coverage bound, rest fused, accumulation tiled; the half-size chain 35.669 ms, ratio 2.099 x; with its history 37.483 ms, ratio 1.998 x",
                        "section 107: the bounded coverage -- covHalf 4.269 ms (device); covHalfB 0.354 ms (device); covFull 17.117 ms (device); covFullB 1.231 ms (device); traced 27023 of 518400",
                        "section 110: rest's passes -- rest 1.016 ms (device); restToT 0.083 ms (device); restEasu 0.592 ms (device); restComp 0.341 ms (device); restToTFree 0.068 ms (device)"],
                   cost: ["section 143: the generator at 1920 x 1080 4.000 ms (wall, median of 7)", "section 143: the field on the device at 1920 x 1080 0.500 ms (device)"] };
    const rep = (cost, ok2 = true) => ({ commit: "abcdef12 x", gates: [{ gate: "render/denoiseUpscaleGPU-selfcheck.mjs", ok: true, exit: { status: 0 }, measured: line.up },
        { gate: "render/denoiseFrameGenCost-selfcheck.mjs", ok: ok2, exit: { status: ok2 ? 0 : 1 }, measured: cost }] });
    const a = FGG.readH63(rep(line.cost)), b = FGG.readH63(rep([line.cost[0].replace("4.000", "8.000"), line.cost[1]])), c = FGG.readH63(rep(line.cost, false)), d = FGG.readH63(rep([line.cost[0]]));
    const G = 4 + 0.5 + 1.231 + 0.341;
    ok("!! readH63, section 143's rule, on fixtures: G the four parts summed (generator 4.0, field 0.5, covFullB 1.231, restComp 0.341), T 37.483, the ratio G / T; a red gate does not count; a missing part gives no ratio",
        Math.abs(a.G - G) < 1e-12 && a.T === 37.483 && Math.abs(a.ratio - G / 37.483) < 1e-12 && a.counts && a.clocks.covFullB === "device" && !c.counts && d.ratio === null && d.G === null &&
        FGG.h63([a, a]) === "holds" && b.ratio > 0.25 && FGG.h63([a, b]) === "fails" && FGG.h63([a, c]) === "no verdict" && FGG.h63([a, d]) === "no verdict" && FGG.H63_RATIO === 0.25,
        `G ${a.G.toFixed(3)} / T ${a.T} = ${a.ratio.toFixed(4)}`);
}

{
    // and on a real report: section 137's full 1080 run, which has the chain's lines and no generator -- T, covFullB and restComp
    // read off it by the patterns readH63 holds the rig to, and no ratio, as a report without this gate must give
    const rep = JSON.parse(fs.readFileSync(path.join(ENG, "render/fsr-rig-s135-gtx1080.json"), "utf8")), x = FGG.readH63(rep);
    ok("  ...and on section 137's committed 1080 report: T 37.475, covFullB 1.226 and restComp 0.341 on the device's clock, no generator line, so no G and no ratio -- and it does not count (two gates red)",
        x.T === 37.475 && x.parts.covFullB === 1.226 && x.parts.restComp === 0.341 && x.clocks.covFullB === "device" && x.clocks.restComp === "device" && x.parts.generator === null && x.ratio === null && !x.counts,
        JSON.stringify(x.parts));
}
{
    // SECTION 146: H63 over the 1080's committed reports (section 144's): both pre-registered runs count and read G / T 0.574 and
    // 0.531, so H63 fails -- it needed G <= 0.25 T on both GPUs, and no Intel run can rescue it
    const R = ["a-gtx1080", "b-gtx1080", "a-gtx10802", "b-gtx10802"].map((k) => FGG.readH63(JSON.parse(fs.readFileSync(path.join(ENG, `render/denoise-rig-s141-${k}.json`), "utf8"))));
    const r3 = (x) => Math.round(x * 1000) / 1000;
    ok("!! *** section 146: H63 FAILS ON THE 1080 -- both pre-registered runs count, G / T 0.574 and 0.531 (the second pair 0.540, 0.554), against 0.25; the generator 90-91 % of G ***",
        FGG.h63(R.slice(0, 2)) === "fails" && FGG.h63(R) === "fails" && R.every((x) => x.counts && x.commit === "3d215c83" && x.clocks.field === "device") &&
        JSON.stringify(R.map((x) => r3(x.ratio))) === "[0.574,0.531,0.54,0.554]" && JSON.stringify(R.map((x) => x.parts.generator)) === "[19.9,18.3,18.3,18.7]" &&
        R.every((x) => x.parts.generator / x.G > 0.9 && x.parts.generator / x.G < 0.92),
        R.map((x) => `G ${x.G.toFixed(3)} / T ${x.T} = ${x.ratio.toFixed(3)}`).join("; "));
    ok("  ...and what that presents: 2T / (T + G) = 1.27-1.31 x the traced rate, against the 1.6 x H63 asked",
        R.every((x) => { const g = 2 * x.T / (x.T + x.G); return g > 1.26 && g < 1.32; }), R.map((x) => (2 * x.T / (x.T + x.G)).toFixed(3)).join(", "));
}
console.log("\n2. ON THE DEVICE: the field against the CPU's, then the field and the generator at 1920 x 1080, timed");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const payload = { sph: Array.from(packSpheres(S.scene)), w, h, W, H, GEO_STRIDE, MS: FGG.MOT_STRIDE,
                      geoCpu: Array.from(packGeometry(hits, w * h)), uSmall: Array.from(FGG.motionUniform(S, e6, e7, w, h)), uBig: Array.from(FGG.motionUniform(S, e6, e7, W, H)), uSoft: Array.from(FGG.motionUniform(S, e6, e7, Ws, Hs)), Ws, Hs };
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { payload }, script: `async (a) => {
        const P = a.payload, { requestDevice } = await import("/gfx/device.js"), UG = await import("/render/denoiseUpscaleGPU.mjs"), FGG = await import("/render/denoiseFrameGenGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true }), errs = [];
        if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const hitsK = dev.compute({ wgsl: UG.FIRSTHITS_WGSL }), motK = dev.compute({ wgsl: FGG.MOTION_WGSL });
        if (hitsK.error || motK.error) return { compileError: String(hitsK.error || motK.error).slice(0, 300) };
        const G = (n, m) => [Math.ceil(n / 8), Math.ceil(m / 8)], stamps = !!(dev.capabilities && dev.capabilities.timestamps);
        const bS = dev.buffer({ data: new Float32Array(P.sph), usage: ["storage"] });
        const field = async (ww, hh, uMot, geoGiven) => {
            const geo = dev.buffer({ data: geoGiven ? new Float32Array(geoGiven) : new Float32Array(ww * hh * P.GEO_STRIDE), usage: ["storage"] });
            const mot = dev.buffer({ data: new Float32Array(ww * hh * P.MS), usage: ["storage"] }), uM = dev.buffer({ data: new Uint8Array(uMot), usage: "uniform" });
            // FIRSTHITS_WGSL's uniform is the newer camera's -- the first 96 bytes of the motion uniform
            const uH = dev.buffer({ data: new Uint8Array(uMot.slice(0, 96)), usage: "uniform" });
            const hitsOps = (pass) => { hitsK.bind("sph", bS).bind("geo", geo).bind("c", uH); pass.dispatch(hitsK, G(ww, hh)); };
            const motOps = (pass) => { motK.bind("geo", geo).bind("mot", mot).bind("c", uM); pass.dispatch(motK, G(ww, hh)); };
            dev.frame(({ pass }) => { if (!geoGiven) hitsOps(pass); motOps(pass); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            const out = new Float32Array(await dev.read(mot)), g = new Float32Array(await dev.read(geo));
            return { out, g, geo, mot, uM, uH, motOps };
        };
        const kernelOnly = await field(P.w, P.h, P.uSmall, P.geoCpu), devicePath = await field(P.w, P.h, P.uSmall, null);
        // the size: 1920 x 1080 on hardware, 480 x 270 on a software adapter (the header says why)
        const ad = await navigator.gpu.requestAdapter(), info = (ad && ad.info) || {}, soft = !!(ad && ad.isFallbackAdapter) || /swiftshader|llvmpipe|software/i.test([info.vendor, info.architecture, info.description].join(" "));
        P.W = soft ? P.Ws : P.W; P.H = soft ? P.Hs : P.H; const uBig = soft ? P.uSoft : P.uBig;
        // 1920 x 1080: the device's own first hits, the motion pass, then the motion pass timed alone
        const big = await field(P.W, P.H, uBig, null), xs = [];
        for (let i = 0; i < 8; i++) {
            await dev.gpu.queue.onSubmittedWorkDone(); const q0 = performance.now();
            const res = dev.frame(({ pass }) => { big.motOps(pass); pass.clear([0, 0, 0, 1]); }, { offscreen: true, ...(stamps ? { timing: true } : {}) });
            if (stamps) xs.push((await res).gpuMs.compute); else { await dev.gpu.queue.onSubmittedWorkDone(); xs.push(performance.now() - q0); }
        }
        const kept = xs.slice(1).sort((p, q) => p - q), motionMs = kept[Math.floor(kept.length / 2)];
        // the field's holes before the fill, as interpolateFrameCPU's splat counts them at t = 0.5, block 1, indexed by the newer frame
        const n = P.W * P.H, landed = new Uint8Array(n), f = big.out;
        let invalid = 0;
        for (let y = 0; y < P.H; y++) for (let x = 0; x < P.W; x++) { const p = y * P.W + x, fx = f[p * P.MS], fy = f[p * P.MS + 1];
            if (f[p * P.MS + 3] === 0) { invalid++; continue; }
            const sx = Math.round(x - 0.5 * fx), sy = Math.round(y - 0.5 * fy); if (sx >= 0 && sy >= 0 && sx < P.W && sy < P.H) landed[sy * P.W + sx] = 1; }
        let holes = 0; for (let p = 0; p < n; p++) if (!landed[p]) holes++;
        // the generator, as fsr-three.html runs it, fed that field -- prev and cur shaded from the device's own normals
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"), T = await import("/vendor/three-webgpu/three.tsl.js"), FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init(); const rdev = renderer.backend.device, rerr = [];
        rdev.addEventListener("uncapturederror", (e) => rerr.push(String(e.error && e.error.message).slice(0, 200)));
        const flow = new Float32Array(n * 2), depth = new Float32Array(n);
        for (let p = 0; p < n; p++) { const v = f[p * P.MS + 3] !== 0; flow[p * 2] = v ? f[p * P.MS] : NaN; flow[p * 2 + 1] = v ? f[p * P.MS + 1] : NaN; depth[p] = f[p * P.MS + 2]; }
        const TX = FGG.generatorTextures(flow, depth, P.W, P.H), g = big.g;
        const shade = (k) => { const c = new Float32Array(n * 4); for (let p = 0; p < n; p++) { const o = p * P.GEO_STRIDE, hit = g[o + 6] >= 0;
            for (let ch = 0; ch < 3; ch++) c[p * 4 + ch] = hit ? 0.5 + 0.5 * g[o + 3 + ch] * k : 0.2 + 0.1 * ch; c[p * 4 + 3] = 1; } return c; };
        const tex = (data) => { const t = new THREE.DataTexture(data, P.W, P.H, THREE.RGBAFormat, THREE.FloatType); t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
        const prev = tex(shade(0.9)), cur = tex(shade(1.0)), motion = tex(TX.motion), dTex = tex(TX.depth);
        const out = new THREE.RenderTarget(P.W, P.H, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
        const gen = FG.makeFrameGen(THREE, T, { w: P.W, h: P.H }), ys = [];
        const one = async () => { await gen.generate(renderer, { prev: prev.texture || prev, cur: cur.texture || cur, motion, depth: dTex }, out); };
        for (let i = 0; i < 9; i++) { await rdev.queue.onSubmittedWorkDone(); const q0 = performance.now(); await one(); await rdev.queue.onSubmittedWorkDone(); ys.push(performance.now() - q0); }
        const keptG = ys.slice(2).sort((p, q) => p - q), genMs = keptG[Math.floor(keptG.length / 2)];
        // a strip of the generated frame read back, so a generator that wrote nothing is seen
        const strip = await renderer.readRenderTargetPixelsAsync(out, 0, P.H >> 1, 64, 1);
        gen.dispose(); out.dispose(); for (const t of [prev, cur, motion, dTex]) t.dispose();
        return { kernelOnly: Array.from(kernelOnly.out), devicePath: Array.from(devicePath.out), deviceObj: Array.from({ length: P.w * P.h }, (_, p) => devicePath.g[p * P.GEO_STRIDE + 6]),
                 motionMs, motionClock: stamps ? "device" : "wall", genMs, invalid, holes, texInvalid: TX.invalid, strip: Array.from(strip), errs, rerr, fill: gen.fill,
                 adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / "), soft, W: P.W, H: P.H };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else if (!r.ok || !r.result || r.result.compileError) ok("!! the device ran the field and the generator", false, `${r.reason || (r.result && r.result.compileError) || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`);
    else {
        const R = r.result, n = w * h;
        say(`adapter: ${R.adapter || "unnamed"}`);
        ok("  no uncaptured WebGPU error on either device -- the compute device's, three.js's", !R.errs.length && !R.rerr.length, [...R.errs, ...R.rerr].join("; "));
        // the kernel alone, on the CPU's first hits: the flow within 1e-3 px and the depth within 1e-5 relative, no vector exactly where the CPU's is NaN
        const MS = FGG.MOT_STRIDE, cmp = (dev, mask) => { let nanDiff = 0, fw = 0, dw = 0, used = 0;
            for (let p = 0; p < n; p++) { if (mask && !mask(p)) continue; used++;
                const cf = [M.flow[p * 2], M.flow[p * 2 + 1]], has = dev[p * MS + 3] !== 0;
                if (Number.isFinite(cf[0]) !== has || Number.isFinite(cf[1]) !== has) { nanDiff++; continue; }
                if (has) fw = Math.max(fw, Math.abs(cf[0] - dev[p * MS]), Math.abs(cf[1] - dev[p * MS + 1]));
                dw = Math.max(dw, Math.abs(M.depth[p] - dev[p * MS + 2]) / Math.abs(M.depth[p])); }
            return { nanDiff, fw, dw, used }; };
        const K = cmp(R.kernelOnly);
        ok("!! MOTION_WGSL on the CPU's first hits is motionField: every pixel's flow within 1e-3 px, its depth within 1e-5 relative, a vector missing exactly where the CPU's is",
            K.nanDiff === 0 && K.fw <= 1e-3 && K.dw <= 1e-5 && K.used === n, `worst flow ${K.fw.toExponential(2)} px, depth ${K.dw.toExponential(2)}, ${K.nanDiff} NaN differences`);
        // the round's path, the device's own first hits: where the device and the CPU hit the same sphere (or both sky), the same bounds
        const same = (p) => (R.deviceObj[p] >= 0 ? R.deviceObj[p] : -1) === hits.obj[p], agree = Array.from({ length: n }, (_, p) => same(p)).filter(Boolean).length;
        const D2 = cmp(R.devicePath, same);
        // the device's hit is found in f32 (FIRSTHITS_WGSL's quadratic), so its depth is f32's, not the kernel's: the first run read 2.94e-5
        // relative against f64 -- held at 1e-4, where the kernel alone, above, is held at 1e-5
        ok("  ...and on the device's own first hits (FIRSTHITS_WGSL then MOTION_WGSL): the same object as the CPU's at all but 1 in 500 pixels, and there the flow within 1e-3 px, the depth within 1e-4 (an f32 hit)",
            n - agree <= Math.floor(n / 500) && D2.nanDiff === 0 && D2.fw <= 1e-3 && D2.dw <= 1e-4, `${n - agree} of ${n} pixels on another object; worst flow ${D2.fw.toExponential(2)} px, depth ${D2.dw.toExponential(2)}`);
        ok("  the generator ran with round 59's fill and wrote the frame -- finite, not all zero, on its middle row",
            R.fill && R.fill.radius === 4 && R.fill.reach === 16 && R.fill.side === "blend" && R.fill.prefer === "farther" && R.strip.every(Number.isFinite) && R.strip.some((v) => v > 0),
            JSON.stringify(R.fill));
        say(`section 143: the generator at ${R.W} x ${R.H} ${R.genMs.toFixed(3)} ms (wall, median of 7)`);
        say(`section 143: the field on the device at ${R.W} x ${R.H} ${R.motionMs.toFixed(3)} ms (${R.motionClock})`);
        say(`section 143: the field's holes at ${R.W} x ${R.H}: ${R.holes} of ${R.W * R.H} before the fill, ${R.invalid} pixels with no vector`);
        ok(`  ...and its three lines are printed, at ${R.soft ? "480 x 270 on this software adapter, which readH63 does not read" : "1920 x 1080 on hardware, which readH63 reads"}`,
            Number.isFinite(R.genMs) && R.genMs > 0 && Number.isFinite(R.motionMs) && R.motionMs > 0 && R.holes > 0 && R.holes < R.W * R.H && (R.soft ? R.W === Ws && R.H === Hs : R.W === W && R.H === H));
    }
}

// ---- SECTION 143 SABOTAGE LOG ---------------------------------------------------------------------------------------
// Each restored byte-identical (sha-256): M1 MOTION_WGSL's sky depth 1e8 -> 2 red (both field rows); M2 the older camera's Y
// unflipped -> 2 red; M3 motionUniform's cameras swapped -> 2 red; M4 readH63 dropping restComp from G -> 1 red (the rule's
// fixtures); M5 H63_RATIO 0.3 -> 1 red; M6 a red gate counted -> 1 red; M7 generatorTextures not negating the flow -> 1 red;
// M8 the generator built with a fill of radius 2 -> 1 red (the fill row); M9 readH63's T taken from the chain without its history
// -> 2 red (the fixtures and section 137's report).
// SECTION 146: V146a H63_RATIO 0.6 -> 2 red (the rule's fixtures, the verdict row); V146b run a's generator typed 9.900 in its
// committed report -> 2 red (the verdict, the presented rate); V146c the verdict's first ratio typed 0.575 -> 1 red.
console.log(fails ? `FAIL -- ${fails} check(s) (${Date.now() - t0} ms)` : `ALL GREEN (${Date.now() - t0} ms)`);
process.exit(fails ? 1 : 0);
