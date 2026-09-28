#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTemporalHalfQuality-selfcheck.mjs -- v4733
//
// WHAT HALF FLOAT COSTS FSR2 ON A THREE.JS SCENE. fx/fsr/fsrTemporalTsl.mjs's makeFsrTemporal defaults its colour
// targets to HalfFloatType; fx/fsr/fsrTemporalHalf-selfcheck.mjs proves the half chain is the CPU chain rounded to half
// where the device writes half, and derives where a half history stops converging -- ulp / (2 alpha), five ulps at
// alpha 0.1. This measures what that is worth: the driver at FloatType and at its default, 32 -> 64 over 32 frames,
// on fsr-three.html's scene still and on seven wires sliding past the turning knot, against a 4x4-supersampled truth
// -- the PSNR gap, and how many history values the stall bound fails to account for. Split out of
// fsrTemporalHalf-selfcheck.mjs at v4733, when the two together took 49 s. First measured at 64 -> 128: half 25.273 dB
// against float's 25.272 on the still scene, 19.493 against 19.493 on the moving one, on both backends.
//
// *** THE PSNR ROWS CANNOT TELL HALF FROM 8-BIT, AND THE STALL ROWS ARE THE GRADE BECAUSE OF IT. *** Sabotage H7 made the
// default 8-bit: PSNR moved 0.003 dB. Against a truth ~20 dB away the precision is not what limits the picture -- the
// resolve, the clamp and the sampling are. What half buys is measured where it is visible: a half history sits within
// ulp / (2 alpha) of float's (2.4e-3 at 0.5), where an 8-bit one stalls at (1/255) / (2 alpha) = 2.0e-2 -- and 8-bit
// clips everything above 1, which a lit three.js scene before tone mapping is not obliged to stay under.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { fromHalf } from "../../text/slugAtlas.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const ulp = (v) => { const a = Math.abs(v); if (a < 2 ** -14) return 2 ** -24; return 2 ** (Math.floor(Math.log2(a)) - 10); };
const skip = webgpuSkipReason();

console.log("\n1. ON THE DEVICE: what half costs, against float and against a supersampled truth");
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const DW = 64, RW = 32, N = 32;
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { DW, RW, N }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const D = a.DW, tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType });
                const read = async (t, n) => Array.from(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                // fsr-three.html's scene, still; and the same with seven wires sliding and the knot at the page's spin
                const build = (withWires) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                    const st = new THREE.MeshBasicNodeMaterial();
                    st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
                    const wires = new THREE.Group(); scene.add(wires);
                    if (withWires) { const wm = new THREE.MeshBasicNodeMaterial(); wm.colorNode = T.vec3(0.95, 0.9, 0.8);
                        for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 4, 8), wm); c.position.set(-1.6 + i * 0.53, 0, 0.5); c.rotation.z = (i - 3) * 0.12; wires.add(c); } }
                    return { scene, knot, wires };
                };
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 1.2], [0, -1.3, -1.0]);
                const o = {};
                for (const [cn, ww, spin, slide] of [["still", false, 0, 0], ["moving", true, 1, 0.01]]) {
                    const { scene, knot, wires } = build(ww);
                    const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); wires.position.x = k * slide; wires.updateMatrixWorld(); };
                    setT(a.N - 1);
                    const big = tgt(D * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4); big.dispose();
                    const c = { truth4: t4 };
                    for (const [fn, type] of [["float", THREE.FloatType], ["half", null]]) {
                        const f2 = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D, threshold, type });
                        const o2 = tgt(D);
                        for (let k = 0; k < a.N; k++) { setT(k); await f2.render(scene, cam, o2); }
                        c[fn] = { out: await read(o2, D), hist: await read(f2.targets.history[(a.N - 1) % 2], D), alpha: f2.uniforms.accumulate[0].alpha.value };
                        f2.dispose(); o2.dispose();
                    }
                    o[cn] = c;
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran float and half on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        for (const cn of ["still", "moving"]) {
            const c = o[cn], D = DW;
            // truth, float output, float history and the half history all read the same way, so row order cancels
            const truth = new Float32Array(D * D * 4);
            for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let q = 0; q < 3; q++) { let s = 0;
                for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += c.truth4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + q]; truth[(y * D + x) * 4 + q] = s / 16; }
            const cl = (v) => Math.min(1, Math.max(0, v));
            const psnr = (b) => { let q = 0; for (let i = 0; i < D * D; i++) for (let k = 0; k < 3; k++) q += (cl(b[i * 4 + k]) - cl(truth[i * 4 + k])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
            const pF = psnr(c.float.out), pH = psnr(c.half.out);
            const hh = c.half.hist.map(fromHalf), hf = c.float.hist, a = c.half.alpha;
            let inside = 0, n = 0, worstU = 0, over = 0;
            for (let i = 0; i < D * D; i++) for (let k = 0; k < 3; k++) { const x = hh[i * 4 + k], y = hf[i * 4 + k], u = ulp(Math.max(Math.abs(x), Math.abs(y)));
                const e = Math.abs(x - y) / u; n++; worstU = Math.max(worstU, e); if (e <= 1 / (2 * a) + 1) inside++; else over++; }
            ok(`*** [${mode}] ${cn === "still" ? "fsr-three.html's scene, still" : "moving wires and a turning knot"}: HALF reads ${pH.toFixed(3)} dB against FLOAT's ${pF.toFixed(3)} -- a ${(pH - pF >= 0 ? "+" : "") + (pH - pF).toFixed(3)} dB difference ***`,
               Math.abs(pH - pF) < 0.01, "32 frames at 2x, 32 -> 64, against a 4x4-supersampled truth");
            ok(`  [${mode}] ...and ${inside} of ${n} history values sit within fsrTemporalHalf-selfcheck.mjs's stall bound of float's (ulp / (2 alpha) + 1 = ${(1 / (2 * a) + 1).toFixed(0)} ulps), worst ${worstU.toFixed(1)} ulps`,
               over <= n * 0.001 && worstU > 0.5, `${over} outside -- a lock or a mask that went one way at half and the other at float can move a pixel further than the stall does`);
        }
    }
}

// ---- v4733 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrTemporalTsl.mjs (the full table is in fx/fsr/fsrTemporalHalf-selfcheck.mjs):
//   H1 the default precision float -> 4    H2 the histories float, the colour half -> 4
//   H3 the resolved frame float    -> 0    H7 the default precision 8-bit         -> 4 (the stall rows only; see the header)
// H3 is invisible here and red in the composition gate, which rounds where the device writes and nowhere else.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the page at 3x; perceived quality, which PSNR does not measure; and half with the lock ring on.");
process.exitCode = fails ? 1 : 0;
