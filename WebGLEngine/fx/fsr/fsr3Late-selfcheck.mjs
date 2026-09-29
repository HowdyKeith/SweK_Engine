#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr3Late-selfcheck.mjs -- v4747
//
// A LATE FRAME, ON THE DEVICE. fx/fsr/fsr3Pacing-selfcheck.mjs drives FSR3 with every real frame ready the moment it starts,
// on an even cadence; render/framePacer-selfcheck.mjs sends a late frame through the pacer and grades the schedule in ms.
// Nothing had put a late frame through the GENERATOR: the pacer asking, at each refresh, for an image fx/fsr/fsr3Tsl.mjs
// must make then -- between the two real frames it holds, and only those. Here real frames take two refreshes of a 60 Hz
// display (30 a second), each starting when the last is ready and sampling the scene then, except frame 7, which takes
// five. Every refresh's image is graded against the scene on that policy's own line, as fsr3Pacing grades them:
//   none      the newest ready real frame
//   midpoint  FSR3's half-way frame and the real frame after it
//   timed     a frame at the time each refresh stands for
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const DW = 128, RW = 64, LATE = 7, V = 34, WARM = 10;
// the durations in refreshes: two each, and frame LATE five
const DUR = Array.from({ length: 20 }, (_, k) => (k === LATE ? 5 : 2));

console.log("\n1. ON THE DEVICE: a late real frame, and what each policy shows around it");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { DW, RW, V, WARM, DUR, LATE }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const F3 = await import("/fx/fsr/fsr3Tsl.mjs"); const FP = await import("/render/framePacer.mjs"); const TC = await import("/render/temporalClipTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.DW, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
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
                const at = (ms) => { const t = ms / 1000 * 8; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); };
                const big = tgt(D * 4);
                const ss = async (ms) => { at(ms); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const tr = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; tr[(y * D + x) * 4 + c] = s / 16; } return tr; };
                const cl = (v) => Math.min(1, Math.max(0, v));
                const psnr = (b, truth) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(b[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                // the real frames: back to back, each sampling the scene when it starts
                const frames = []; { let s = 0; for (let k = 0; k < a.DUR.length; k++) { frames.push({ k, start: s * R, ready: (s + a.DUR[k]) * R }); s += a.DUR[k]; } }
                const fsr2 = { renderWidth: a.RW, renderHeight: a.RW, displayWidth: D, displayHeight: D, threshold, type: THREE.FloatType };
                const o = { lateAt: frames[a.LATE].ready / R };
                for (const policy of ["none", "midpoint", "timed"]) {
                    const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2 }), pacer = FP.makeFramePacer({ refresh: R, policy }), disp = tgt(D);
                    const log = []; let next = 0, refused = 0, back = 0, lastScene = null;
                    for (let v = 0; v < a.V; v++) {
                        const time = v * R;
                        // each real frame rendered at the refresh it is ready by -- its content the scene when it started
                        while (next < frames.length && frames[next].ready <= time + 1e-6) { const f = frames[next++]; at(f.start); await f3.render(scene, cam, false); pacer.real(f.k, f.start, f.ready); }
                        const s = pacer.at(time), fr = f3.frames;
                        if (s.kind === "gen") { if (s.k === fr - 1) await f3.generate(disp, { t: s.t }); else refused++; }
                        else if (s.kind === "real") { if (s.k === fr - 1 || s.k === fr - 2) await f3.show(s.k, disp); else refused++; }
                        if (s.scene != null) { if (lastScene != null && s.scene < lastScene - 1e-9) back++; lastScene = s.scene; }
                        if (v >= a.WARM) log.push({ v, time, kind: s.kind, k: s.k, t: s.t, scene: lastScene, img: await read(disp, D) });
                    }
                    const n = log.length, mx = log.reduce((q, e) => q + e.time, 0) / n, my = log.reduce((q, e) => q + e.scene, 0) / n;
                    let sxy = 0, sxx = 0; for (const e of log) { sxy += (e.time - mx) * (e.scene - my); sxx += (e.time - mx) ** 2; }
                    const slope = sxy / sxx, icpt = my - slope * mx, per = [];
                    for (const e of log) per.push(psnr(e.img, await ss(icpt + slope * e.time)));
                    o[policy] = { refused, back, per, v: log.map((e) => e.v), kinds: log.map((e) => e.kind[0]).join(""), gens: log.filter((e) => e.kind === "gen").map((e) => e.k + ":" + e.t.toFixed(2)),
                                  judder: Math.sqrt(log.reduce((q, e) => q + (e.scene - (icpt + slope * e.time)) ** 2, 0) / n) };
                    f3.dispose(); disp.dispose();
                }
                big.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every policy", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
        const P = ["none", "midpoint", "timed"], m = Object.fromEntries(P.map((p) => [p, { mean: mean(o[p].per), worst: Math.min(...o[p].per), judder: o[p].judder }]));
        for (const p of P) say(`${p.padEnd(8)} ${o[p].kinds}  judder ${f(m[p].judder)} ms, ${f(m[p].mean)} dB a refresh, worst ${f(m[p].worst)}; generated ${o[p].gens.join(" ") || "none"}`);
        gateReport("fx/fsr/fsr3Late-selfcheck.mjs").table("each policy around a real frame five refreshes late",
            ["policy", "judder ms", "dB a refresh", "worst refresh dB", "refused", "sent back"],
            P.map((p) => [p, m[p].judder, m[p].mean, m[p].worst, o[p].refused, o[p].back])).write();
        ok(`*** [webgpu] with frame ${LATE} five refreshes long, the pacer asks the device for nothing it does not hold and never sends the scene back: ${P.map((p) => `${p} ${o[p].refused} refused, ${o[p].back} back`).join("; ")} ***`,
           P.every((p) => o[p].refused === 0 && o[p].back === 0),
           "fx/fsr/fsr3Tsl.mjs makes a frame when it is shown and holds the newest pair. Under v4743's pacer the timed policy was refused 12 times here: its line, an interval, a render and a quarter refresh behind, sat in the pair before the newest after every new frame (render/framePacer.mjs, pairs \"newest\")");
        ok(`*** [webgpu] ...and timed generation carries the scene through the late frame best: judder ${f(m.timed.judder)} ms against ${f(m.midpoint.judder)} for the half-way frame and ${f(m.none.judder)} with none, and its WORST refresh ${f(m.timed.worst)} dB against ${f(m.midpoint.worst)} and ${f(m.none.worst)} ***`,
           m.timed.judder < 0.8 * m.midpoint.judder && m.midpoint.judder < m.none.judder && m.timed.worst > m.midpoint.worst && m.timed.worst > m.none.worst,
           "each refresh is graded against the scene on that policy's own line, so latency is not held against it -- only unevenness is");
        const lateGens = o.timed.gens.filter((g) => g.startsWith(`${LATE + 1}:`));
        ok(`  [webgpu] ...by generating inside the late pair itself: ${lateGens.length} frames between real ${LATE} and ${LATE + 1}, at t = ${lateGens.map((g) => g.split(":")[1]).join(", ")}, where the half-way frame makes one and no generation holds`,
           lateGens.length >= 2 && m.timed.mean > m.none.mean + 0.5, `${f(m.timed.mean)} dB a refresh against ${f(m.none.mean)} with none`);
    }
}
// ---- v4747 SABOTAGE LOG ----------------------------------------------------------------------------------------
// render/framePacer.mjs's are logged in render/framePacer-selfcheck.mjs; three were run here: the newest-pair clamp removed
// (P11) -> 1, the 12 refusals this gate found first; a real frame eligible before its own half-way frame (P15) -> 1; an older
// pair's frame kept (P13) -> 0 here, because nothing here costs time to generate, and 1 in the CPU gate.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real browser's frame timing -- the frames here are placed on the refresh grid by hand, their render " +
    "times the durations above, and the generation taken as free; a display that refreshes when it is told to, which the browser " +
    "does not expose and render/framePacer-selfcheck.mjs models on the CPU (scheduleVrrCPU); and more than one late frame in a row.");
process.exitCode = fails ? 1 : 0;
