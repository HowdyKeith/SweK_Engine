#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTemporalQuality-selfcheck.mjs -- v4731
//
// WHETHER FSR2 HELPS A THREE.JS SCENE, MEASURED RATHER THAN SHOWN. fx/fsr/fsrTemporalTsl-selfcheck.mjs proves the
// chain is fsr.html's chain; this asks what it buys. fsr-three.html's own scene -- the normal-shaded torus knot over
// a striped floor -- is rendered at 64x64 and brought to 128x128 three ways, each against a 4x4-supersampled 128x128
// render of the same scene:
//   bilinear   fx/fsr/fsrTsl.mjs's renderBilinear, the stretch everything else has to beat
//   FSR1       EASU then RCAS, one frame in and one frame out (makeFsrSpatial, transfer "srgb")
//   FSR2       fx/fsr/fsrTemporalTsl.mjs after 32 jittered frames of a still camera -- every jitter phase at 2x once
// PSNR is taken on [0, 1]-clamped values, which is what a display shows. The camera is still and the knot does not
// turn: the question is what the ACCUMULATION recovers, and motion is what the other gates are for.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const DW = 128, RW = 64, N = 32, SHARP = 0.5;

console.log("\n1. ON THE DEVICE: bilinear, FSR1 and FSR2 against a supersampled truth, on both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 240000, args: { DW, RW, N, SHARP }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const FS = await import("/fx/fsr/fsrTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                // fsr-three.html's scene, the knot held still
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); knot.rotation.set(0.4, 0.6, 0); scene.add(knot);
                const st = new THREE.MeshBasicNodeMaterial();
                st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 1.2], [0, -1.3, -1.0]);
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType });
                const read = async (t, n) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                const o = {};
                const f2 = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: a.DW, displayHeight: a.DW, threshold, sharpness: a.SHARP, type: THREE.FloatType });
                const o2 = tgt(a.DW);
                for (let k = 0; k < a.N; k++) { await f2.render(scene, cam, o2); if (k === 0) o.fsr2first = await read(o2, a.DW); }
                o.fsr2 = await read(o2, a.DW); o.fsr2hist = await read(f2.targets.history[(a.N - 1) % 2], a.DW); f2.dispose();
                const f1 = FS.makeFsrSpatial(THREE, T, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: a.DW, displayHeight: a.DW, sharpness: a.SHARP, transfer: "srgb", type: THREE.FloatType });
                const o1 = tgt(a.DW); await f1.render(renderer, scene, cam, o1); o.fsr1 = await read(o1, a.DW);
                const ob = tgt(a.DW); await f1.renderBilinear(renderer, scene, cam, ob); o.bil = await read(ob, a.DW);
                const big = tgt(a.DW * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); o.truth4 = await read(big, a.DW * 4);
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran all three on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, n) => { if (mode === "webgpu") return px; const f = []; for (let y = n - 1; y >= 0; y--) f.push(...px.slice(y * n * 4, (y + 1) * n * 4)); return f; };
        const t4 = up(o.truth4, DW * 4), truth = new Float32Array(DW * DW * 4);
        for (let y = 0; y < DW; y++) for (let x = 0; x < DW; x++) for (let c = 0; c < 3; c++) { let s = 0;
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * DW * 4 + x * 4 + sx) * 4 + c]; truth[(y * DW + x) * 4 + c] = s / 16; }
        const cl = (v) => Math.min(1, Math.max(0, v));
        const psnr = (px) => { const b = up(px, DW); let q = 0; for (let i = 0; i < DW * DW; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (DW * DW * 3))); };
        const pB = psnr(o.bil), p1 = psnr(o.fsr1), p2 = psnr(o.fsr2), pH = psnr(o.fsr2hist), pF = psnr(o.fsr2first);
        ok(`*** [${mode}] FSR2 on fsr-three.html's scene, 64 -> 128 after ${N} frames: ${p2.toFixed(2)} dB against the supersampled truth, where FSR1 reads ${p1.toFixed(2)} and a bilinear stretch ${pB.toFixed(2)} ***`,
           p2 > p1 && p2 > pB, `FSR2 ${(p2 - p1).toFixed(2)} dB over FSR1. FSR1 against bilinear is ${(p1 - pB).toFixed(2)} dB: EASU and RCAS change how an edge LOOKS far more than how far it is from the truth`);
        ok(`  [${mode}] ...and the gain is the ACCUMULATION's: the history before RCAS reads ${pH.toFixed(2)} dB, and FSR2's own FIRST frame -- one jittered frame, resolved and sharpened -- ${pF.toFixed(2)}`,
           pH > p1 && pF < p2, `RCAS adds ${(p2 - pH).toFixed(2)} dB on top; the first frame is below the accumulated one by ${(p2 - pF).toFixed(2)} dB`);
    }
}

// ---- v4731 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Each against fx/fsr/fsrTemporalTsl.mjs, the driver whose product this gate measures.
//   Q1  no accumulation (alpha forced to 1)  -> 4, FSR2 falls to 22.60 dB -- below FSR1: a jittered frame alone is worse
//   Q2  the colour pass not jittered         -> 4, 20.62 dB -- 32 copies of one frame, resolved as if they were not
//   Q3  the resolve told the jitter is zero  -> 4, 20.08 dB -- the samples move and the weights do not: a blur
// Each takes FSR2 BELOW FSR1, which is the claim's own shape: the gain is the accumulation of jittered samples, and
// removing any one of the three things that make it an accumulation of jittered samples removes the gain.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a MOVING scene's quality, where the reprojection, the clamp and the masks decide it and the answer " +
    "depends on content (fsr.html measured its own); HalfFloat targets; and perceived sharpness, which PSNR does not measure.");
process.exitCode = fails ? 1 : 0;
