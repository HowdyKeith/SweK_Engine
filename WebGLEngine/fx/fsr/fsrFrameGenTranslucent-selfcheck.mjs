#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs -- v4760
//
// TRANSLUCENT THINGS IN THE WORLD, IN THE GENERATOR: glass, water, sparks. A generated pixel under a pane shows two things that
// move otherwise, and the generator splats one vector a pixel. render/temporalTsl.mjs's motion stage draws a translucent thing
// as a surface of its own -- the field says the pane's motion, and what is behind it is cross-faded in place; skipping them in
// that pass says what is behind, and drags the pane. Six cases, a background moving 8.45 px a frame unless said: a plain pane,
// still, over a smooth wall and over a fine one; an etched pane (stripes of its own); six additive sparks; the etched pane
// MOVING over a still wall; and the plain pane behind an opaque box that slides across it. Four arms, graded against the
// midpoint 4 x 4-supersampled, on the translucent things' pixels and over the frame:
//   drawn    the vectors, the stage drawing them as it does       flow     the flow on the same, reconciled (`flow: {}`)
//   skipped  the vectors, the stage's pass drawn without them
//   layered  frames and the stage's pass WITHOUT them, and render/translucentLayer.mjs's layer drawn AT t and composited --
//            through fx/fsr/fsrFrameGenTsl.mjs's `ui` as a function of t (v4755), the path a HUD takes
// *** NO ONE FIELD IS RIGHT, AND THE LAYER BEATS EVERY FIELD ON EVERY CASE. *** WEBGPU ONLY: render/translucentLayer-selfcheck.mjs
// holds the layer to the frame drawn with them on both backends.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128, CASES = ["glass", "glassFine", "etched", "sparks", "window", "occluded"], ARMS = ["drawn", "flow", "skipped", "layered"];

console.log("\n1. ON THE DEVICE: panes, sparks and a box, generated four ways");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const TL = await import("/render/translucentLayer.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true }), layer = TL.makeTranslucentLayer(THREE, { w: D, h: D });
                // a generator an arm: the two arms on one stage pass are primed and generated together
                const gen = { drawn: FG.makeFrameGen(THREE, T, { w: D, h: D }), flow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }), skipped: FG.makeFrameGen(THREE, T, { w: D, h: D }), layered: FG.makeFrameGen(THREE, T, { w: D, h: D }) };
                const A = tgt(D), B = tgt(D), A2 = tgt(D), B2 = tgt(D), o2 = tgt(D), big = tgt(D * 4), older = tgt(D);
                // the pair's older depth, kept from the stage's pass at frame 0 and given as depthPrev (v4751) -- no priming generation
                const cm0 = new THREE.NodeMaterial(); cm0.fragmentNode = T.textureLoad(stage.depth.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y))); cm0.blending = THREE.NoBlending; cm0.depthTest = false; cm0.depthWrite = false;
                const keepScene = new THREE.Scene(); keepScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cm0)); const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const o = { pxPerFrame: 0.25 * D / (2 * 5.2 * Math.tan(20 * Math.PI / 180)) };
                const cases = { glass: { bg: 0.25, pane: 0, kind: "plain", fq: 1.6 }, glassFine: { bg: 0.25, pane: 0, kind: "plain", fq: 6.4 }, etched: { bg: 0.25, pane: 0, kind: "etched", fq: 6.4 },
                    sparks: { bg: 0.25, pane: 0, kind: "sparks", fq: 6.4 }, window: { bg: 0, pane: 0.25, kind: "etched", fq: 6.4 }, occluded: { bg: 0.25, pane: 0, kind: "plain", fq: 6.4, box: 0.3 } };
                for (const [cn, cs] of Object.entries(cases)) {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                    const bm = new THREE.MeshBasicNodeMaterial(); bm.colorNode = T.Fn(() => { const q = T.uv().mul(T.vec2(14.0, 8.0)).mul(cs.fq); return T.vec3(0.4).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.25)); })();
                    const bg = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), bm); scene.add(bg);
                    const box = cs.box ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.3), new THREE.MeshNormalNodeMaterial()) : null; if (box) { box.position.z = 1.0; scene.add(box); }
                    const see = [];
                    if (cs.kind === "sparks") for (let i = 0; i < 6; i++) { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
                        m.colorNode = T.Fn(() => { const d = T.uv().sub(0.5); return T.vec3(1.0, 0.6, 0.2).mul(T.exp(d.dot(d).div(-0.02))); })();
                        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), m); s.position.set(-1.1 + (i % 3) * 1.1, -0.5 + Math.floor(i / 3) * 1.0, 0.5); scene.add(s); see.push(s); }
                    else { const m = new THREE.MeshBasicNodeMaterial({ transparent: true });
                        if (cs.kind === "plain") { m.colorNode = T.vec3(0.55, 0.75, 1.0); m.opacityNode = T.float(0.35); }
                        else { const st = T.step(0.5, T.fract(T.uv().x.mul(9.0))); m.colorNode = T.mix(T.vec3(0.55, 0.75, 1.0), T.vec3(1.0), st); m.opacityNode = T.mix(T.float(0.2), T.float(0.6), st); }
                        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), m); p.position.z = 0.5; scene.add(p); see.push(p); }
                    const base = see.map((s) => s.position.x);
                    const setT = (k) => { bg.position.x = k * cs.bg; bg.updateMatrixWorld(); see.forEach((s, i) => { s.position.x = base[i] + k * cs.pane; s.updateMatrixWorld(); });
                        if (box) { box.position.x = -0.9 + k * cs.box; box.updateMatrixWorld(); } };
                    const draw = async (k, target, without) => { setT(k); const back = without ? layer.hide(scene) : null; renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam); if (back) back(); };
                    await draw(0, A); await draw(1, B); await draw(0, A2, true); await draw(1, B2, true);
                    await draw(0.5, big); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    // the translucent things' pixels, and the frame really rendered at the midpoint at this resolution
                    await draw(0.5, o2, true); const nov = await read(o2, D); await draw(0.5, o2); const truth1 = await read(o2, D);
                    const mk = Uint8Array.from({ length: D * D }, (_, i) => (Math.abs(truth1[i * 4] - nov[i * 4]) + Math.abs(truth1[i * 4 + 1] - nov[i * 4 + 1]) + Math.abs(truth1[i * 4 + 2] - nov[i * 4 + 2]) > 0.03 ? 1 : 0));
                    const ps = (img, tr, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(tr[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
                    const c = { px: mk.reduce((q, v) => q + v, 0) };
                    // one stage pass for the arms on the field drawn with them (drawn, flow), one for those on the field without them
                    // (skipped, layered); the frames without them are the layered arm's alone
                    for (const [stageWithout, names] of [[false, ["drawn", "flow"]], [true, ["skipped", "layered"]]]) {
                        const st = async (k) => { setT(k); const back = stageWithout ? layer.hide(scene) : null; await stage.render(renderer, scene, cam); if (back) back(); };
                        const fr = (n) => (n === "layered" ? [A2, B2] : [A, B]), cm = (g) => (g.reconcile ? stage.camera.texture : null);
                        await st(0); renderer.setRenderTarget(older); await renderer.renderAsync(keepScene, ortho);
                        await st(1);
                        for (const n of names) {
                            const ui = n === "layered" ? async (t) => { setT(t); await layer.render(renderer, scene, cam); return layer.texture; } : null;
                            await gen[n].generate(renderer, { prev: fr(n)[0].texture, cur: fr(n)[1].texture, motion: stage.motion.texture, depth: stage.depth.texture, depthPrev: older.texture, camera: cm(gen[n]), ui }, o2);
                            const img = await read(o2, D); c[n] = { all: ps(img, truth), see: ps(img, truth, mk), see1: ps(img, truth1, mk) };
                        }
                    }
                    o[cn] = c;
                }
                for (const g of Object.values(gen)) g.dispose(); stage.dispose(); layer.dispose(); for (const t of [A, B, A2, B2, o2, big, older]) t.dispose(); cm0.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran all six cases", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => (v === Infinity ? "exact" : v.toFixed(2)), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        say(`the background moves ${o.pxPerFrame.toFixed(2)} px a frame; dB on the translucent things' pixels (over the frame):`);
        for (const cn of CASES) say(`${cn.padEnd(9)} ${String(o[cn].px).padStart(4)} px  ${ARMS.map((k) => `${k} ${f(o[cn][k].see)} (${f(o[cn][k].all)})`).join("  ")}`);
        const drawnWins = ["glass", "etched", "sparks", "window"], skipWins = ["glassFine", "occluded"];
        ok(`*** no one field is right: drawn beats skipped where the pane or the sparks keep still over a smooth wall or move themselves -- ${drawnWins.map((cn) => `${cn} ${d(o[cn].drawn.see, o[cn].skipped.see)}`).join(", ")} -- and skipped beats drawn over a fine wall and behind the box -- ${skipWins.map((cn) => `${cn} ${d(o[cn].skipped.see, o[cn].drawn.see)}`).join(", ")} ***`,
           drawnWins.every((cn) => o[cn].drawn.see - o[cn].skipped.see > 5) && skipWins.every((cn) => o[cn].skipped.see - o[cn].drawn.see > 2),
           "so render/temporalTsl.mjs's stage keeps drawing them, as it does: what is less wrong turns on the content, and neither is right");
        ok(`  ...and the flow on the drawn field sides with the other: above the vectors where skipping them is -- ${skipWins.map((cn) => `${cn} ${d(o[cn].flow.see, o[cn].drawn.see)}`).join(", ")} -- and below them where drawing them is, ${drawnWins.map((cn) => `${cn} ${d(o[cn].flow.see, o[cn].drawn.see)}`).join(", ")}`,
           skipWins.every((cn) => o[cn].flow.see - o[cn].drawn.see > 3) && drawnWins.every((cn) => o[cn].flow.see < o[cn].drawn.see), "a pixel under a pane holds two motions and the flow, like the field, finds one -- the background's, where it is the stronger");
        const best = (cn) => Math.max(o[cn].drawn.see, o[cn].flow.see, o[cn].skipped.see), bestAll = (cn) => Math.max(o[cn].drawn.all, o[cn].flow.all, o[cn].skipped.all);
        ok(`*** the LAYER beats the best field on every case's translucent pixels -- ${CASES.map((cn) => `${cn} ${d(o[cn].layered.see, best(cn))}`).join(", ")} -- and over the frame, ${CASES.map((cn) => d(o[cn].layered.all, bestAll(cn))).join(", ")} ***`,
           CASES.every((cn) => o[cn].layered.see - best(cn) > 2 && o[cn].layered.all - bestAll(cn) > 0.5),
           "frames and the stage's pass without them; render/translucentLayer.mjs's layer drawn at t, through the generator's `ui` as a function of t");
        ok(`  ...and against the frame rendered at the midpoint at this resolution, the moving pane over a still wall is ${f(o.window.layered.see1)}, the etched pane over a moving one ${f(o.etched.layered.see1)} against ${f(o.etched.layered.see)} supersampled`,
           o.window.layered.see1 === Infinity && o.etched.layered.see1 - o.etched.layered.see > 20,
           "where what is behind stands still the generated frame IS the real one; what the layer loses against the supersampled truth is the pane's own aliasing, which a real frame has");
    }
}

// ---- v4760 SABOTAGE LOG ----------------------------------------------------------------------------------------
// The module's seventeen are in render/translucentLayer-selfcheck.mjs's log, with what each reads here: the depth pass, the
// additive swap (the sparks' pixels 7.92 dB, -14.55 against the best field), a layer cleared opaque, the background drawn into
// it and hide() hiding nothing all turn a row here red. Nothing in fx/fsr/fsrFrameGenTsl.mjs changed: the layer goes through
// `ui` as a function of t, whose sabotages are fx/fsr/fsrFrameGenUi-selfcheck.mjs's (v4755).
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: refraction and anything else that reads the frame behind it (a transmission material, a backdrop node) -- " +
    "the layer draws over transparent black, where there is nothing behind to read; a translucent thing's cost against the flow's, " +
    "on a real device; and fsr-three.html, whose scene has none.");
process.exitCode = fails ? 1 : 0;
