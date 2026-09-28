#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr3Pacing-selfcheck.mjs -- v4743
//
// WHAT THE VIEWER SEES, REFRESH BY REFRESH: fx/fsr/fsr3Tsl.mjs's FSR3 driven by render/framePacer.mjs, as fsr-three.html's paced
// view drives it -- a real FSR2 frame (64 -> 128) every third refresh of a 60 Hz display, the knot turning at 8x the page's
// rate, and at every refresh whatever the pacer shows. render/framePacer-selfcheck.mjs grades the schedules in ms of scene
// time; this grades the PICTURES: each refresh's image against a 4 x 4-supersampled render of the scene at the time smooth
// motion would show there -- the least-squares line through that policy's own shown scene times, so each policy is judged on
// its own latency and only its unevenness costs it. Three policies:
//   none      no generation: each real frame on screen for three refreshes
//   midpoint  FSR3's half-way frame, and the real frame after it
//   timed     frames at t = 1/3 and 2/3, each at the refresh it stands for
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const DW = 128, RW = 64, N = 3, V = 30, WARM = 18;

console.log("\n1. ON THE DEVICE: every refresh's image against the scene at that refresh's time");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { DW, RW, N, V, WARM }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const F3 = await import("/fx/fsr/fsr3Tsl.mjs"); const FP = await import("/render/framePacer.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.DW, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => new Float32Array(await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n));
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const st = new THREE.MeshBasicNodeMaterial();
                st.colorNode = T.Fn(() => { const s = T.floor(T.uv().x.mul(48.0).add(T.uv().y.mul(9.0))).mod(2.0); return T.mix(T.vec3(0.05, 0.08, 0.14), T.vec3(0.95, 0.72, 0.3), s); })();
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), st); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; scene.add(floor);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const vp = Array.from(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements);
                const threshold = TC.clipGapThreshold(vp, [0, 0, 1.2], [0, -1.3, -1.0]);
                const R = 1000 / 60;
                // the scene at a time in ms: the knot turning at 8x the page's rate
                const at = (ms) => { const t = ms / 1000 * 8; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); };
                const ss = async (ms) => { at(ms); const big = tgt(D * 4); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4); big.dispose();
                    const tr = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; tr[(y * D + x) * 4 + c] = s / 16; } return tr; };
                const cl = (v) => Math.min(1, Math.max(0, v));
                const psnr = (b, truth) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                const fsr2 = { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D, threshold, type: THREE.FloatType };
                const o = {};
                for (const policy of ["none", "midpoint", "timed"]) {
                    const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2 }), pacer = FP.makeFramePacer({ refresh: R, policy, margin: 0 }), disp = tgt(D);
                    const log = [], ts = [];
                    let lastScene = null, refused = 0, lastGenK = -1, pairDepth = null, pairChanged = 0, pairsAgain = 0;
                    const own = [], half = [];
                    for (let v = 0; v < a.V; v++) {
                        const time = v * R;
                        if (v % a.N === 0) { at(time); await f3.render(scene, cam, false); pacer.real(v / a.N, time, time); }
                        const s = pacer.at(time), fr = f3.frames;
                        if (s.kind === "gen") { if (s.k === fr - 1) {
                            const again = lastGenK === s.k;
                            await f3.generate(disp, { t: s.t }); ts.push(+s.t.toFixed(4));
                            // the pair's older depth must survive a second frame between the same two
                            const dp = await read(f3.frameGen.targets.depthPair, D);
                            if (again) { let diff = 0; for (let i = 0; i < D * D * 4; i += 4) if (dp[i] !== pairDepth[i]) diff++; pairChanged += diff; pairsAgain++; }
                            pairDepth = dp; lastGenK = s.k;
                            // and the frame is AT its t: against the scene at its own time and at the half-way time
                            if (policy === "timed" && v >= a.WARM && Math.abs(s.t - 0.5) > 0.1) {
                                const img = await read(disp, D);
                                own.push(psnr(img, await ss(s.scene))); half.push(psnr(img, await ss((s.k - 0.5) * a.N * R)));
                            }
                        } else refused++; }
                        else if (s.kind === "real") { if (s.k === fr - 1 || s.k === fr - 2) await f3.show(s.k, disp); else refused++; }
                        if (s.scene != null) lastScene = s.scene;
                        if (v >= a.WARM) log.push({ time, kind: s.kind, scene: lastScene, img: await read(disp, D) });
                    }
                    // the line through this policy's own shown scene times, and each refresh against the scene ON it
                    const n = log.length, mx = log.reduce((q, e) => q + e.time, 0) / n, my = log.reduce((q, e) => q + e.scene, 0) / n;
                    let sxy = 0, sxx = 0; for (const e of log) { sxy += (e.time - mx) * (e.scene - my); sxx += (e.time - mx) ** 2; }
                    const slope = sxy / sxx, icpt = my - slope * mx;
                    const per = [];
                    for (const e of log) per.push(psnr(e.img, await ss(icpt + slope * e.time)));
                    // a call without a t is the generator's own again, whatever the call before asked for
                    if (policy === "timed") { await f3.generate(disp); o.tAfter = f3.frameGen.uniforms.t.value; }
                    o[policy] = { own, half, pairChanged, pairsAgain, mean: per.reduce((q, v) => q + v, 0) / n, worst: Math.min(...per), per, kinds: log.map((e) => e.kind[0]).join(""), slope, refused,
                                  ts: [...new Set(ts)].sort(), judder: Math.sqrt(log.reduce((q, e) => q + (e.scene - (icpt + slope * e.time)) ** 2, 0) / n) };
                    f3.dispose(); disp.dispose();
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every policy", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const p of ["none", "midpoint", "timed"]) say(`${p.padEnd(8)} ${o[p].kinds}: each refresh against the scene at its time, mean ${f(o[p].mean)} dB (worst ${f(o[p].worst)}); judder ${f(o[p].judder)} ms of scene time; generated at t in {${o[p].ts.join(", ")}}`);
        ok(`*** timed generation shows the viewer the scene where it should be: ${f(o.timed.mean)} dB a refresh against ${f(o.midpoint.mean)} for FSR3's half-way frame (${d(o.timed.mean, o.midpoint.mean)}) and ${f(o.none.mean)} with no generation (${d(o.timed.mean, o.none.mean)}) ***`,
           o.timed.mean > o.midpoint.mean && o.midpoint.mean > o.none.mean,
           "with a real frame every third refresh the half-way frame is shown once and then shown again, and the real one after it; every refresh the scene is where it was not");
        ok(`  ...and its WORST refresh is better too: ${f(o.timed.worst)} against ${f(o.midpoint.worst)} and ${f(o.none.worst)}`, o.timed.worst > o.midpoint.worst && o.midpoint.worst > o.none.worst,
           "a staircase's worst step is the refresh before a new real frame, the scene furthest from where it has been drawn");
        ok(`  ...and the schedules are the ones render/framePacer-selfcheck.mjs grades: timed judder ${f(o.timed.judder)} ms and frames at t = ${o.timed.ts.join(" and ")}, the half-way frame's ${f(o.midpoint.judder)} ms, and every image the pacer asked for was one the driver held (${o.none.refused + o.midpoint.refused + o.timed.refused} refused)`,
           o.timed.judder < 0.5 && o.midpoint.judder > 2 && o.timed.ts.length === 2 && Math.abs(o.timed.ts[0] - 1 / 3) < 1e-3 && Math.abs(o.timed.ts[1] - 2 / 3) < 1e-3 && o.midpoint.ts.join() === "0.5"
           && o.none.refused + o.midpoint.refused + o.timed.refused === 0,
           "the pacer is run with margin 0 here, as fsr-three.html runs it: a real frame counts as ready the refresh it is rendered in, so the timed line never asks for a pair the two-frame driver has let go of");
        const T = o.timed, mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
        ok(`  ...and a generated frame is AT the time it was asked for: the timed frames read ${f(mean(T.own))} dB against the scene at their own t and ${f(mean(T.half))} against the half-way time (${T.own.length} frames)`,
           T.own.length >= 4 && T.own.every((v, i) => v > T.half[i]), "fx/fsr/fsr3Tsl.mjs's generate hands the pacer's t to the generator; a driver that dropped it would make half-way frames at every refresh and read the other way round");
        ok(`  ...and the second frame between the same two keeps the pair's older depth: ${T.pairChanged} texels changed across ${T.pairsAgain} repeats, and a call with no t afterwards is back at the generator's own (${o.tAfter})`,
           T.pairsAgain >= 3 && T.pairChanged === 0 && o.tAfter === 0.5, "the depth side mode reads the older frame's depth; a repeat that advanced it would compare the newer frame with itself");
    }
}

// ---- v4743 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsr3Tsl.mjs: P11 a second frame between the same pair told it is a new pair -> 1; P12 the pacer's t not
// handed to the generator -> 1; P13 show() drawing the other of the two frames it holds -> 1. Against fx/fsr/fsrFrameGenTsl.mjs:
// P14 `again` copying the depths anyway -> 1; P15 a call without t keeping the last call's -> 1. Against render/framePacer.mjs:
// P9 the snap to a real frame removed -> 3.
// *** P11, P12, P14 AND P15 SCORED 0 FIRST. *** Every quality row compares a policy's images with the scene, and a timed frame
// made at the half-way time instead of its own is still a frame near the right one; the fill's default blend never reads the
// pair's older depth; and every call here passed a t. Rows now compare each timed frame with the scene at its own t and at
// the half-way time, read the pair's depth across a repeat, and call once without a t.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real browser's refresh, which fsr-three.html's paced view runs under and this simulates at exactly 60 Hz; " +
    "real frames that take longer than their slot, which render/framePacer-selfcheck.mjs covers in ms and this does not draw; and the " +
    "timed policy's latency, the price of its smoothness, which that gate states and a picture cannot show.");
process.exitCode = fails ? 1 : 0;
