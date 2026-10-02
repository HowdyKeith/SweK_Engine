#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenUi-selfcheck.mjs -- v4755
//
// A UI THAT CHANGES, AND ONE YOU CAN SEE THROUGH. v4745 composited a HUD as FSR3 composes UI: generate from HUD-less frames
// and lay the newer frame's UI over the generated one, premultiplied (fx/fsr/fsrFrameGenScene-selfcheck.mjs). Its HUD was
// opaque and stood still. A UI is seldom only that: panels are translucent over the scene, and things in it move -- a
// marker, a cursor, a bar filling. Here, over fsr-three.html's knot turning in front of a textured wall under a pan:
//   two TRANSLUCENT panels (alpha 0.45 and 0.7), an opaque crosshair, a translucent bar, and on it a marker sliding 6 pixels
//   a real frame
// and a frame generated between two, graded against the scene rendered at the midpoint (4 x 4 supersampled) with the UI at
// the midpoint laid over it as a UI is drawn -- at display size, premultiplied. The UI shown on the generated frame:
//   baked   drawn into both frames and generated with the scene
//   newer   HUD-less frames, the newer frame's UI composited -- v4745's, and FSR3's
//   older   the older frame's
//   atT     the UI drawn at t, handed to the generator as a function of t (v4755)
// *** WEBGPU ONLY. *** fx/fsr/fsrFrameGenScene-selfcheck.mjs holds the composite exact against compositeUiCPU.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";
const REPORT = gateReport("fx/fsr/fsrFrameGenUi-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: a translucent, moving UI over a generated frame");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const F3 = await import("/fx/fsr/fsr3Tsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const wm = new THREE.MeshBasicNodeMaterial(); wm.colorNode = T.Fn(() => { const q = T.positionWorld.xy.mul(1.6); return T.vec3(0.5).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.3)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wm); wall.position.z = -2; scene.add(wall);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                // the UI: its own scene, through an orthographic camera
                const ui = new THREE.Scene(), ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                // every piece TRANSPARENT, so three draws them in the order they are added -- an opaque marker would be drawn
                // first, and the translucent bar over it
                const panel = (x, y, w, h, col, alpha) => { const m = new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: alpha, depthTest: false, depthWrite: false });
                    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); me.position.set(x, y, 0); ui.add(me); return me; };
                panel(-0.55, -0.62, 0.7, 0.5, 0x2266cc, 0.45); panel(0.6, 0.55, 0.6, 0.6, 0xcc5522, 0.7);
                panel(0, 0, 0.02, 0.2, 0xffffff, 1); panel(0, 0, 0.2, 0.02, 0xffffff, 1);
                panel(0, 0.88, 1.6, 0.06, 0x223344, 0.8); const marker = panel(0, 0.88, 0.08, 0.1, 0x66ff88, 1);
                const setScene = (k) => { const t = k / 60 * 6; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld();
                    cam.position.set(k * 0.05, 0.6, 5.2); cam.lookAt(k * 0.05, 0, 0); cam.updateMatrixWorld(); };
                const setUi = (k) => { marker.position.x = -0.7 + k * (6 / D * 2); marker.updateMatrixWorld(); };
                const setT = (k) => { setScene(k); setUi(k); };
                const drawScene = async (target) => { renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam); };
                const drawUi = async (target) => { renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); await renderer.clearAsync(); renderer.setClearColor(0x000000, 1);
                    renderer.autoClear = false; await renderer.renderAsync(ui, ocam); renderer.autoClear = true; };
                const drawBoth = async (target) => { await drawScene(target); renderer.autoClear = false; await renderer.renderAsync(ui, ocam); renderer.autoClear = true; };
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                const gen = FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} });
                const A = tgt(D), B = tgt(D), o2 = tgt(D), o3 = tgt(D), U0 = tgt(D), U1 = tgt(D), Ut = tgt(D), big = tgt(D * 4);
                const truthAt = async (k) => { setT(k); await drawScene(big); const t4 = await read(big, D * 4); await drawUi(o3); const u = await read(o3, D), tr = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c];
                        const i = y * D + x; tr[i * 4 + c] = u[i * 4 + c] + (s / 16) * (1 - u[i * 4 + 3]); } return tr; };
                const truth = await truthAt(0.5);
                const uis = []; for (const k of [0, 0.5, 1]) { setUi(k); await drawUi(o3); uis.push(await read(o3, D)); }
                // the translucent panels' pixels -- alpha strictly between in every UI -- and the marker's, wherever it is in any
                const glass = Uint8Array.from({ length: D * D }, (_, i) => uis.every((u) => u[i * 4 + 3] > 0.05 && u[i * 4 + 3] < 0.95) ? 1 : 0);
                const mark = Uint8Array.from({ length: D * D }, (_, i) => uis.some((u) => u[i * 4 + 1] > 0.9 && u[i * 4 + 3] > 0.99 && u[i * 4] < 0.5) ? 1 : 0);
                const ps = (img, tr, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(tr[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
                const o = { glassPx: glass.reduce((q, v) => q + v, 0), markPx: mark.reduce((q, v) => q + v, 0), imgs: {} };
                // the stage primed from frame -1, the generator from frame 0, then the pair 0 -> 1
                const pair = async (prevT, curT, extra, t = null) => {
                    setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                    await gen.generate(renderer, { prev: prevT.texture, cur: prevT.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: stage.camera.texture }, o2);
                    setT(1); await stage.render(renderer, scene, cam);
                    await gen.generate(renderer, { prev: prevT.texture, cur: curT.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: stage.camera.texture, ...extra }, o2, t === null ? {} : { t });
                    return read(o2, D);
                };
                setT(0); await drawBoth(A); setT(1); await drawBoth(B); o.imgs.baked = await pair(A, B, {});
                setT(0); await drawScene(A); await drawUi(U0); setT(1); await drawScene(B); await drawUi(U1);
                o.imgs.newer = await pair(A, B, { ui: U1.texture }); o.imgs.older = await pair(A, B, { ui: U0.texture });
                const asked = [], uiAt = async (t) => { asked.push(t); setUi(t); await drawUi(Ut); return Ut.texture; };
                o.imgs.atT = await pair(A, B, { ui: uiAt });
                // the function at another t, against the texture path with the UI drawn at that t by hand
                o.imgs.fn03 = await pair(A, B, { ui: uiAt }, 0.3);
                setUi(0.3); await drawUi(U0); o.imgs.tex03 = await pair(A, B, { ui: U0.texture }, 0.3);
                o.asked = asked.slice();
                o.score = {}; for (const [k, img] of Object.entries(o.imgs)) if (k !== "fn03" && k !== "tex03") o.score[k] = { all: ps(img, truth), glass: ps(img, truth, glass), mark: ps(img, truth, mark) };
                let same03 = 0; for (let i = 0; i < D * D * 4; i++) if (o.imgs.fn03[i] === o.imgs.tex03[i]) same03++;
                let sameGlass = 0, nGlass = 0; for (let i = 0; i < D * D; i++) if (glass[i]) { nGlass++; let e = true; for (const k of ["older", "atT"]) for (let c = 0; c < 4; c++) if (o.imgs[k][i * 4 + c] !== o.imgs.newer[i * 4 + c]) e = false; if (e) sameGlass++; }
                o.same03 = same03 === D * D * 4; o.sameGlass = [sameGlass, nGlass];
                // FSR3 takes the function too: at the t it is asked for, and with one real frame the frame's own UI, at t = 1
                const f3asked = [], s64 = tgt(64), U64 = new THREE.RenderTarget(64, 64, { type: THREE.FloatType });
                const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2: { renderWidth: 32, renderHeight: 32, displayWidth: 64, displayHeight: 64, threshold: 1e-3, type: THREE.FloatType } });
                const ui64 = async (t) => { f3asked.push(t); renderer.setRenderTarget(U64); renderer.setClearColor(0x000000, 0); await renderer.clearAsync(); renderer.setClearColor(0x000000, 1); return U64.texture; };
                setScene(0); await f3.render(scene, cam, false); await f3.generate(s64, { ui: ui64 });
                setScene(1); await f3.render(scene, cam, false); await f3.generate(s64, { ui: ui64, t: 0.25 });
                o.f3asked = f3asked.slice(); f3.dispose(); s64.dispose(); U64.dispose();
                delete o.imgs; gen.dispose(); stage.dispose(); for (const t of [A, B, o2, o3, U0, U1, Ut, big]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every arm", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, S = o.score, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const k of ["baked", "newer", "older", "atT"]) say(`${k.padEnd(6)} whole frame ${f(S[k].all)} dB, the translucent panels' ${o.glassPx} pixels ${f(S[k].glass)}, the marker's ${o.markPx} ${f(S[k].mark)}`);
        REPORT.table("a UI that moves: dB by how it is composited", ["UI", "whole frame dB", "translucent panels dB", "moving marker dB"],
            ["baked", "newer", "older", "atT"].map((k) => [k, S[k].all, S[k].glass, S[k].mark]), `panels ${o.glassPx} px, marker ${o.markPx} px`);
        ok(`*** [webgpu] a TRANSLUCENT panel composited over the generated frame is ${d(S.newer.glass, S.baked.glass)} dB over one drawn into the frames and generated with the scene, on the panels' pixels -- and the same to the bit whichever frame's UI it is, at ${o.sameGlass[0]} of ${o.sameGlass[1]} ***`,
           S.newer.glass - S.baked.glass >= 3 && o.sameGlass[0] === o.sameGlass[1] && o.sameGlass[1] > 1000,
           "the panel's colour is laid over the scene behind as it is, where drawn in it is carried by the scene's vectors and the flow with what shows through");
        ok(`*** [webgpu] but a UI that MOVES is half a frame off in either real frame's UI -- the marker ${f(S.newer.mark)} dB on its pixels in the newer frame's, ${f(S.older.mark)} in the older's -- and where it is when drawn at t: ${f(S.atT.mark)}, and ${d(S.atT.all, S.newer.all)} on the whole frame ***`,
           S.newer.mark < 20 && S.older.mark < 20 && S.atT.mark > 60 && S.atT.all - S.newer.all >= 3,
           "6 pixels a real frame is 3 at the midpoint; `ui` as a function of t draws it there, one UI draw a generated frame");
        ok(`  [webgpu] ...and the function is asked for the time generated -- ${o.asked.join(", ")} -- and at t = 0.3 its frame is the texture path's with the UI drawn at 0.3 by hand, to the bit (${o.same03})`,
           JSON.stringify(o.asked) === "[0.5,0.3]" && o.same03 === true, "makeFrameGen's own t when none is given, the call's when one is");
        ok(`  [webgpu] ...and FSR3 takes it the same way: asked for ${o.f3asked.join(", ")} -- its one real frame's own UI at t = 1, then the pair's at the t the pacer asked`,
           JSON.stringify(o.f3asked) === "[1,0.25]", "fx/fsr/fsr3Tsl.mjs hands the function to the generator, and with one real frame -- where the generator is only primed -- composites the frame it shows with the UI at t = 1, and asks for nothing else");
    }
}

// ---- v4755 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrFrameGenTsl.mjs: U1 the function not called -> 1 (the harness: a function is no texture); U2 called with the
// made-with t always -> 2; U3 called with 1 - t -> 2; C1 the composite adding the layer, not laying it over -> 2.
// Against fx/fsr/fsr3Tsl.mjs: F1 one real frame's composite handed the function as it is -> 1 (the harness); F2 its UI at
// t = 0 -> 1; F3 the UI handed to the priming call too -> 1 (a UI drawn for a frame nobody shows).
// *** THE FIRST RUN READ 33 MARKER PIXELS, NOT 77, AND +2.8 dB ON THE PANELS, NOT +4.6. *** The probe had drawn every piece of the
// UI transparent; this gate drew the opaque ones opaque, and three draws opaque objects BEFORE transparent ones -- so the
// translucent bar went over the marker it carries, and the marker was mostly the bar. Every piece is transparent now, drawn
// in the order it is added. fsr-three.html's marker has renderOrder 1 for the same reason.
// And fsr-three.html's paced view, with the HUD on and the timed policy, composited real frame k from targets.frames[k % 2]
// while makeFsr3({ hold: 2 }) keeps THREE (v4751): the wrong frame, a third of the time. It reads the ring's own length now.
// No gate draws that view to the refresh a real frame is shown on -- this device takes seconds a frame at 960 x 540.
REPORT.write();
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a UI that changes in STEPS -- a counter, a line of text -- where the newer frame's UI shows the change half a " +
    "frame early and the older's half a frame late, and which is right is the application's to say; and translucent surfaces IN the " +
    "world, glass or water, which are not UI and which the motion stage draws as opaque.");
process.exitCode = fails ? 1 : 0;
