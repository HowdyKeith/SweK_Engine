#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrTemporalLocks-selfcheck.mjs -- v4732
//
// WHAT FSR2'S LOCKS BUY A THREE.JS SCENE, MEASURED ON THE DEVICE. render/temporalLockTsl-selfcheck.mjs proves the lock
// passes are render/temporalLock.mjs's, and fx/fsr/fsrTemporalTsl-selfcheck.mjs that the driver composes them in its
// order; this asks what they are worth, and it is the gate fx/fsr/fsrTemporalTsl.mjs's lock DEFAULTS rest on.
//
// v4728 measured the neighbourhood clamp taking half the accumulation's gain on detail finer than the render
// resolution -- the history holds a feature the current 3x3 does not, and the clamp throws it away. A lock marks a
// pixel holding such a feature and relaxes the clamp there. So the rows draw what a lock is FOR -- wires 0.4 render
// pixels wide, still and then moving -- and what it is NOT for, fsr-three.html's knot turning fast with nothing thin
// in the picture, where the only thing a lock can do is hold the clamp open on a surface that is changing.
// 64 -> 128 against a 4x4-supersampled render of the last frame, PSNR on [0, 1]-clamped values, RCAS output.
//
// *** THE CPU MEASURED IT FIRST, AND THE DEVICE AGREES TO THE THIRD DECIMAL. *** v4732 ran the chain on the CPU from
// the device's own renders before any of the TSL existed: locks from the ring took still wires from 16.838 to 17.932
// dB (history, 48 frames); the TSL driver, when it existed, read 17.932.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const DW = 128, RW = 64, N = 40;

console.log("\n1. ON THE DEVICE: FSR2 with and without its locks, on wires thinner than a render pixel and on a knot with nothing thin");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { DW, RW, N }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FT = await import("/fx/fsr/fsrTemporalTsl.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.DW; canvas.height = a.DW;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const D = a.DW, tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType });
                const read = async (t, n) => new Float32Array(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                // fsr-three.html's scene -- the knot and the striped floor -- with or without seven vertical and three
                // horizontal WIRES 0.024 units across: 0.4 of a render pixel at this camera
                const build = (withKnot, withWires) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); if (withKnot) scene.add(knot);
                    const st = new THREE.MeshBasicNodeMaterial();
                    st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
                    const wires = new THREE.Group(); scene.add(wires);
                    if (withWires) { const wm = new THREE.MeshBasicNodeMaterial(); wm.colorNode = T.vec3(0.95, 0.9, 0.8);
                        for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 4, 8), wm); c.position.set(-1.6 + i * 0.53, 0, 0.5); c.rotation.z = (i - 3) * 0.12; wires.add(c); }
                        for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 4, 8), wm); c.position.set(0, -0.7 + i * 0.6, 0.6); c.rotation.z = Math.PI / 2 + (i - 1) * 0.07; wires.add(c); } }
                    return { scene, knot, wires };
                };
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 1.2], [0, -1.3, -1.0]);
                // [knot, wires, spin (x the page's rate), wire slide per frame] and the configurations each is run under
                const cases = { wires: [false, true, 0, 0, ["none", "frame", "ring", "frame32"]],
                                knot: [true, false, 4, 0, ["none", "frame", "frame32"]],
                                moving: [true, true, 1, 0.01, ["none", "frame"]] };
                const configs = { none: { lockFrom: null }, frame: {}, ring: { lock: true, lockFrom: "ring" }, frame32: { lockLife: 32 } };
                const o = { life: null, from: null };
                for (const [cn, [wk, ww, spin, slide, use]] of Object.entries(cases)) {
                    const { scene, knot, wires } = build(wk, ww);
                    const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); wires.position.x = k * slide; wires.updateMatrixWorld(); };
                    setT(a.N - 1);
                    const big = tgt(D * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4); big.dispose();
                    const truth = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    // the readback's row order does not matter here: truth and output are read the same way
                    const cl = (v) => Math.min(1, Math.max(0, v));
                    const psnr = (b) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                    o[cn] = {};
                    for (const fn of use) {
                        const f2 = FT.makeFsrTemporal(THREE, T, renderer, { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D, threshold, type: THREE.FloatType, ...configs[fn] });
                        if (fn === "frame") { o.life = f2.locks ? f2.locks.life : null; o.from = f2.lockFrom; }
                        const o2 = tgt(D);
                        for (let k = 0; k < a.N; k++) { setT(k); await f2.render(scene, cam, o2); }
                        o[cn][fn] = psnr(await read(o2, D));
                        f2.dispose(); o2.dispose();
                    }
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const f = (v) => v.toFixed(2), d = (a, b) => (a - b >= 0 ? "+" : "") + (a - b).toFixed(3);
        const w = o.wires, k = o.knot, m = o.moving;
        ok(`[${mode}] the driver's DEFAULT is locks from the frame, life ${o.life}`, o.from === "frame" && o.life === 8,
           "the rows below are what that default rests on; lockFrom: null is the chain without locks");
        ok(`*** [${mode}] on still WIRES 0.4 render pixels wide the locks are worth ${d(w.frame, w.none)} dB (${f(w.none)} -> ${f(w.frame)}), and from the ring ${d(w.ring, w.none)} ***`,
           w.frame - w.none > 0.5 && w.ring - w.none > 0.5,
           "the history holds the wire through the jitter phases that miss it, and the clamp -- relaxed where a lock holds -- no longer throws it away");
        ok(`*** [${mode}] where the wires MOVE and the knot turns, the frame's locks still buy ${d(m.frame, m.none)} dB (${f(m.none)} -> ${f(m.frame)}) ***`,
           m.frame - m.none > 0.2, "a lock is reprojected with its surface and dies on disocclusion, so it follows the wire rather than smearing it");
        ok(`*** [${mode}] and where there is NOTHING thin -- the knot at four times the page's spin -- they cost ${d(k.frame, k.none)} dB (${f(k.none)} -> ${f(k.frame)}) ***`,
           Math.abs(k.frame - k.none) < 0.05, "a ridge on a turning surface holds the clamp open for its life; at this spin that is noise against what the wires gain");
        const keep = (w.frame - w.none) / (w.frame32 - w.none), cost = (k.frame - k.none) / (k.frame32 - k.none);
        ok(`  [${mode}] LIFE IS A TRADE, NOT A FREE PARAMETER: 32 frames buy ${d(w.frame32, w.frame)} dB more on the wires and cost ${d(k.frame32, k.frame)} more on the knot -- the default's 8 keeps ${(keep * 100).toFixed(0)}% of what 32 buys at ${(cost * 100).toFixed(0)}% of its cost`,
           w.frame32 > w.frame && k.frame32 < k.frame && keep > 0.75 && cost < 0.6,
           "a longer life keeps more of a feature the detector misses, and holds the clamp open longer on a ridge that has moved on");
    }
}

// ---- v4732 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrTemporalTsl.mjs; the full table, with fx/fsr/fsrTemporalTsl-selfcheck.mjs's column beside this one,
// is in that gate. Red here: D17 the relax not given to the accumulate (6), D18 the frame's candidates from the
// render-resolution colour (6), D20 the caller's life ignored (4), D21 the default no locks (8 -- it first CRASHED this
// gate, 1 red, and a missing lock state is now read as null), D22 the ring's mean not refreshed (2). The four
// composition errors that score 0 here (D14, D15, D16, D19) are red in the composition gate, which is what it is for.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what the locks cost where a pixel-scale TEXTURE sits under a moving occluder -- fx/fsr/fsrTemporalLockGhost-selfcheck.mjs " +
    "draws that (render/temporalLock-selfcheck.mjs section 5's ghost), and finds both masks are what make the default safe; " +
    "and perceived sharpness, which PSNR does not measure.");
process.exitCode = fails ? 1 : 0;
