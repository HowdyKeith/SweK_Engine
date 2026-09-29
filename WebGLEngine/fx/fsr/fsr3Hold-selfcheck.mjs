#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr3Hold-selfcheck.mjs -- v4751
//
// HOLDING TWO PAIRS, ON THE DEVICE. fx/fsr/fsr3Late-selfcheck.mjs found the timed pacer asking, after a late frame, for frames
// between a pair the generator no longer held -- its line, an interval, a render and a quarter refresh behind, sits in the
// pair before the newest right after each real frame arrives -- and v4747 answered by confining the pacer to the newest pair
// and taking its margin away. v4751 answers the other way: fx/fsr/fsr3Tsl.mjs's makeFsr3({ hold: 2 }) keeps the two newest
// pairs -- three frames, and a copy of each one's field and depth -- and render/framePacer.mjs's pairs "two" asks for either,
// with the margin kept. The same late schedule as fsr3Late -- real frames two refreshes long, frame 7 five -- and two arms:
//   timed     v4747's: the newest pair, no margin
//   timed2    two pairs, a quarter refresh of margin
// each refresh graded against the scene on that arm's own line, as fsr3Late grades them.
//
// *** WHY NOT MAKE THE FRAMES WHEN THEIR PAIR ARRIVES, WHICH IS WHAT THIS ROUND SET OUT TO DO. *** Planned then, with the lag
// as it was, the frames go stale when a frame is late or uneven: on render/framePacer.mjs's model, 13.7 ms of judder on a
// late frame with a 4 ms generation, against 7.7 holding two pairs and 10.0 holding one (render/framePacer-selfcheck.mjs,
// section 9). Holding two pairs is what making them early was for, without the plan.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const DW = 128, RW = 64, LATE = 7, V = 30, WARM = 12;
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
                for (const arm of ["timed", "timed2"]) {
                    const two = arm === "timed2", policy = two ? "timed" : arm;
                    const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2, hold: two ? 2 : 1 }), pacer = FP.makeFramePacer({ refresh: R, policy, pairs: two ? "two" : "newest" }), disp = tgt(D);
                    const log = []; let next = 0, refused = 0, back = 0, lastScene = null, older = 0, wrongInputs = 0, wrongDepth = 0, badCopy = 0;
                    for (let v = 0; v < a.V; v++) {
                        const time = v * R;
                        // each real frame rendered at the refresh it is ready by -- its content the scene when it started
                        while (next < frames.length && frames[next].ready <= time + 1e-6) { const f = frames[next++]; at(f.start); await f3.render(scene, cam, false); pacer.real(f.k, f.start, f.ready);
                            // holding two, the frame's field and depth are copied as they are made: the copy IS the stage's
                            if (two) { const K = f3.targets.kept[f.k % 3], T2 = f3.fsr2.targets, a1 = await read(K.motion, D), b1 = await read(T2.motion, D), a2 = await read(K.depth, D), b2 = await read(T2.depth, D);
                                for (let i = 0; i < D * D * 4; i++) if (a1[i] !== b1[i] || a2[i] !== b2[i]) { badCopy++; break; } } }
                        const s = pacer.at(time), fr = f3.frames;
                        if (s.kind === "gen") { if (s.k === fr - 1 || (two && s.k === fr - 2)) { await f3.generate(disp, { t: s.t, pair: s.k });
                            if (s.k === fr - 2) { older++;
                                // the pair's OWN frames, field and older depth, and the generator's pair depth is the one handed over
                                const L = f3.lastInputs, K = f3.targets.kept, Nk = 3;
                                if (!(L.cur === f3.targets.frames[s.k % Nk].texture && L.prev === f3.targets.frames[(s.k - 1) % Nk].texture
                                      && L.motion === K[s.k % Nk].motion.texture && L.depth === K[s.k % Nk].depth.texture && L.depthPrev === K[(s.k - 1) % Nk].depth.texture)) wrongInputs++;
                                const dp = await read(f3.frameGen.targets.depthPair, D), dk = await read(K[(s.k - 1) % Nk].depth, D);
                                for (let i = 0; i < D * D * 4; i += 4) if (dp[i] !== dk[i]) { wrongDepth++; break; } } } else refused++; }
                        else if (s.kind === "real") { if (s.k <= fr - 1 && s.k >= fr - (two ? 3 : 2)) await f3.show(s.k, disp); else refused++; }
                        if (s.scene != null) { if (lastScene != null && s.scene < lastScene - 1e-9) back++; lastScene = s.scene; }
                        if (v >= a.WARM) log.push({ v, time, kind: s.kind, k: s.k, t: s.t, scene: lastScene, img: await read(disp, D) });
                    }
                    const n = log.length, mx = log.reduce((q, e) => q + e.time, 0) / n, my = log.reduce((q, e) => q + e.scene, 0) / n;
                    let sxy = 0, sxx = 0; for (const e of log) { sxy += (e.time - mx) * (e.scene - my); sxx += (e.time - mx) ** 2; }
                    const slope = sxy / sxx, icpt = my - slope * mx, per = [];
                    for (const e of log) per.push(psnr(e.img, await ss(icpt + slope * e.time)));
                    o[arm] = { refused, back, older, wrongInputs, wrongDepth, badCopy, per, v: log.map((e) => e.v), kinds: log.map((e) => e.kind[0]).join(""), gens: log.filter((e) => e.kind === "gen").map((e) => e.k + ":" + e.t.toFixed(2)),
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
        const P = ["timed", "timed2"], m = Object.fromEntries(P.map((p) => [p, { mean: mean(o[p].per), worst: Math.min(...o[p].per), judder: o[p].judder }]));
        for (const p of P) say(`${p.padEnd(8)} ${o[p].kinds}  judder ${f(m[p].judder)} ms, ${f(m[p].mean)} dB a refresh, worst ${f(m[p].worst)}; generated ${o[p].gens.join(" ") || "none"}`);
        gateReport("fx/fsr/fsr3Hold-selfcheck.mjs").table("holding one pair against two, around a late real frame",
            ["policy", "judder ms", "dB a refresh", "worst refresh dB", "refused", "sent back", "frames from the older pair"],
            P.map((p) => [p, m[p].judder, m[p].mean, m[p].worst, o[p].refused, o[p].back, o[p].older])).write();
        ok(`*** [webgpu] with frame ${LATE} five refreshes long, both arms ask the device for nothing it does not hold and never send the scene back: ${P.map((p) => `${p} ${o[p].refused} refused, ${o[p].back} back`).join("; ")} ***`,
           P.every((p) => o[p].refused === 0 && o[p].back === 0),
           "holding two, the pacer's requests for the older pair go to generate({ pair }), which makes them from that pair's own frames, field and depth");
        ok(`*** [webgpu] v4751: holding the TWO newest pairs, with the pacer's quarter refresh of margin, carries the late frame better: judder ${f(m.timed2.judder)} ms against ${f(m.timed.judder)} holding one -- ${o.timed2.older} of its frames made between the pair BEFORE the newest, which a generator holding one would have been refused ***`,
           m.timed2.judder < m.timed.judder && o.timed2.older > 0 && o.timed2.refused === 0 && m.timed2.mean >= m.timed.mean - 0.1,
           `${f(m.timed2.mean)} dB a refresh against ${f(m.timed.mean)}. render/framePacer-selfcheck.mjs, section 9: the CPU model reads the same, 5.62 against 6.84, and with a 4 ms generation 7.67 against 10.00`);
        ok(`  [webgpu] ...and each of those ${o.timed2.older} frames was made from ITS pair: that pair's two frames, the newer one's field and depth, and the older one's depth as the fill's (${o.timed2.wrongInputs} handed anything else, ${o.timed2.wrongDepth} with another depth in the generator), from copies that are the stage's own to the bit (${o.timed2.badCopy} differ)`,
           o.timed2.older > 0 && o.timed2.wrongInputs === 0 && o.timed2.wrongDepth === 0 && o.timed2.badCopy === 0,
           "on a knot turning at a steady rate one interval's field looks like the next, so no picture row can tell the older pair's from the newest's; this row compares the textures themselves");
        ok(`  [webgpu] ...and its WORST refresh is better too: ${f(m.timed2.worst)} dB against ${f(m.timed.worst)}`, m.timed2.worst > m.timed.worst,
           "the refreshes right after the late frame arrives are the ones whose line sits in the older pair; holding one pair, they showed its older real frame instead");
    }
}
// ---- v4751 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsr3Tsl.mjs: H5 the older pair made from the NEWEST field -> 1; H6 no older depth handed over -> 1; H7 the
// older pair's newer frame taken from the newest -> 2; H8 the copies never made -> 2. Against fx/fsr/fsrFrameGenTsl.mjs: H9
// depthPrev ignored -> 1. Against render/framePacer.mjs: H2 "two" treated as the newest -> 1; H1, the clamp to two pairs
// removed, -> 0 here, where no line reaches three back, and 1 in render/framePacer-selfcheck.mjs.
// *** H5, H6 AND H9 SCORED 0 FIRST. *** The knot turns at a steady rate, so one interval's field is nearly the next one's and
// the older depth nearly the newer: no picture row could tell. The identity row -- the textures handed over, and the
// generator's pair depth read back -- was added for them.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real browser's frame timing -- the frames here are placed on the refresh grid by hand, their render " +
    "times the durations above, and the generation taken as free; a display that refreshes when it is told to, which the browser " +
    "does not expose and render/framePacer-selfcheck.mjs models on the CPU (scheduleVrrCPU); and the three extra full-screen copies " +
    "a real frame that holding two costs, which on this device are lost in the FSR2 chain's own time.");
process.exitCode = fails ? 1 : 0;
