#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenWorld-selfcheck.mjs -- v4750
//
// A STILL SURFACE UNDER A MOVING CAMERA. v4745 gave the reconciliation a smaller margin where a surface stood still, because
// whatever moved there is shading -- a shadow, a reflection -- and judged "still" on the SCREEN: a pixel whose vector is under
// 0.05 pixels. A camera that moves makes every surface move on screen, so under a pan a shadow or a reflection got the full
// 0.9 and v4745's gain was gone (its gate's unchecked line said so). v4750 judges it in the WORLD: render/temporalTsl.mjs's
// makeMotionStage({ camera: true }) renders the camera's own motion at every pixel, and a pixel whose vector is within
// 0.05 pixels of it is a surface that did not move, whatever the camera did (render/flowReconcile.mjs).
//
// fx/fsr/fsrFrameGenScene-selfcheck.mjs's scenes, the camera panning 0.06 a frame, each a frame generated between two and
// graded against the frame rendered at the midpoint (4 x 4 supersampled), with the flow reconciled in two ways:
//   screen   flow: {} and no camera motion given -- v4745's test
//   world    the same generator, handed the stage's camera motion
// and the reflection with the camera STILL, where the two tests are one test. The camera's motion comes from the same stage
// that makes the vectors, so nothing else is rendered.
// *** WEBGPU ONLY. *** render/flowReconcileTsl-selfcheck.mjs holds the world test to its mirror on both backends and
// render/temporalTsl-selfcheck.mjs the camera target to motionVectorsCPU on both.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";
const REPORT = gateReport("fx/fsr/fsrFrameGenWorld-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: shadows and a reflection under a panning camera");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const F3 = await import("/fx/fsr/fsr3Tsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                // the canvas is 512 square: three's reflector sizes its target from the drawing buffer (fsrFrameGenScene-selfcheck.mjs)
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init(); renderer.setSize(512, 512, false); renderer.shadowMap.enabled = true;
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                const noise = (scale) => T.Fn(() => { const q = T.positionWorld.xz.mul(scale);
                    const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5)); return T.vec3(0.5).add(n3.mul(0.3)); })();
                const camAt = (cam, x) => { cam.position.set(x, 3.2, 4.2); cam.lookAt(x, 0, 0); cam.updateMatrixWorld(); };
                const shadowScene = (textured, pan) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const fm = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 }); fm.colorNode = textured ? noise(1.6) : T.vec3(0.75, 0.72, 0.68);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fm); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
                    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 16), new THREE.MeshStandardNodeMaterial({ color: 0xcc4422 })); ball.castShadow = true; scene.add(ball);
                    const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(-3, 5, 1); light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
                    Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 }); light.shadow.camera.updateProjectionMatrix();
                    scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, 0.5));
                    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                    return { scene, cam, setT: (k) => { ball.position.set(-0.6 + k * 0.12, 1.6, -0.2); ball.updateMatrixWorld(); camAt(cam, k * pan); } };
                };
                const reflectionScene = (pan) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const refl = T.reflector({ resolutionScale: 1 }); refl.target.rotateX(-Math.PI / 2); scene.add(refl.target);
                    const fm = new THREE.MeshBasicNodeMaterial(); fm.colorNode = T.mix(T.vec3(0.25, 0.27, 0.3), refl.rgb, 0.8);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fm); floor.rotation.x = -Math.PI / 2; scene.add(floor);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 120, 16), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                    return { scene, cam, setT: (k) => { knot.position.set(-0.4 + k * 0.1, 0.9, -1.2); knot.rotation.set(0, k * 0.1, 0); knot.updateMatrixWorld(); camAt(cam, k * pan); } };
                };
                // the control: a textured floor under the pan and a turning knot, every vector exact -- the case a low margin costs
                const floorScene = (pan) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const fm = new THREE.MeshBasicNodeMaterial(); fm.colorNode = noise(1.6);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), fm); floor.rotation.x = -Math.PI / 2; scene.add(floor);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 120, 16), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                    return { scene, cam, setT: (k) => { knot.position.set(0, 0.8, 0); knot.rotation.set(k * 0.1, k * 0.15, 0); knot.updateMatrixWorld(); camAt(cam, k * pan); } };
                };
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                // ONE generator for both arms, the camera's motion handed to it or not call by call -- as a caller switching the
                // world test on would use it; its passes are cached by their inputs, and the camera is one of them
                const gen = FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }), arms = { screen: gen, world: gen };
                const A = tgt(D), B = tgt(D), o2 = tgt(D), big = tgt(D * 4), o = {};
                for (const [cn, S] of [["reflectionStill", reflectionScene(0)], ["reflectionPan", reflectionScene(0.06)], ["shadowTexturedPan", shadowScene(true, 0.06)],
                                       ["shadowPlainPan", shadowScene(false, 0.06)], ["floorPan", floorScene(0.06)]]) {
                    const { scene, cam, setT } = S;
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam);
                    setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const psnr = (img) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                    const c = { imgs: {} };
                    for (const [an, g] of Object.entries(arms)) {
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        const camera = an === "world" ? stage.camera.texture : null;
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera }, o2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera }, o2);
                        const img = await read(o2, D); c[an] = psnr(img); c.imgs[an] = img;
                    }
                    // how much of the frame the world test calls still, from the stage's own two fields
                    const mo = await read(stage.motion, D), ca = await read(stage.camera, D); let still = 0;
                    for (let i = 0; i < D * D; i++) if (Math.hypot((mo[i * 4] - ca[i * 4]) * D, (mo[i * 4 + 1] - ca[i * 4 + 1]) * D) < 0.05) still++;
                    let same = 0; for (let i = 0; i < D * D * 4; i++) if (c.imgs.screen[i] === c.imgs.world[i]) same++;
                    o[cn] = { screen: c.screen, world: c.world, still, identical: same === D * D * 4 };
                }
                // FSR3 hands its generator the camera's motion when the flow is on, and not otherwise
                const fsr2 = { renderWidth: 32, renderHeight: 32, displayWidth: 64, displayHeight: 64, threshold: 1e-3, type: THREE.FloatType };
                const S = floorScene(0.06), f3a = F3.makeFsr3(THREE, T, renderer, { fsr2, frameGen: { flow: {} } }), f3b = F3.makeFsr3(THREE, T, renderer, { fsr2 }), s64 = tgt(64);
                for (const f of [f3a, f3b]) for (let k = 0; k < 2; k++) { S.setT(k); await f.render(S.scene, S.cam, false); await f.generate(s64); }
                o.fsr3 = { withFlow: !!f3a.lastInputs.camera && f3a.lastInputs.camera === f3a.fsr2.stage.camera.texture, without: f3b.lastInputs.camera === undefined && f3b.fsr2.stage.camera === null };
                f3a.dispose(); f3b.dispose(); s64.dispose();
                gen.dispose(); stage.dispose(); for (const t of [A, B, o2, big]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        const cs = ["reflectionStill", "reflectionPan", "shadowTexturedPan", "shadowPlainPan", "floorPan"];
        for (const cn of cs) say(`${cn.padEnd(18)} screen ${f(o[cn].screen)}, world ${f(o[cn].world)} (${d(o[cn].world, o[cn].screen)} dB); still in the world: ${o[cn].still} of ${D * D} pixels`);
        REPORT.table("a still surface judged on screen against in the world", ["case", "screen dB", "world dB", "still in the world px", "pixels"],
            cs.map((cn) => [cn, o[cn].screen, o[cn].world, o[cn].still, D * D]));
        const R = o.reflectionPan, ST = o.shadowTexturedPan, SP = o.shadowPlainPan, F = o.floorPan;
        ok(`*** [webgpu] under a pan the world test gives back what v4745's gave with the camera still: the reflection ${d(R.world, R.screen)} dB over the screen test, the textured shadow ${d(ST.world, ST.screen)}, the plain one ${d(SP.world, SP.screen)} ***`,
           R.world - R.screen >= 2.5 && ST.world - ST.screen >= 1.2 && SP.world - SP.screen >= 0.2,
           "the floor's vectors are the camera's, so on the screen they moved and were judged at 0.9; in the world they did not, and the shading that moved across them is the flow's to take at 0.5");
        ok(`  [webgpu] ...and where every vector is exact it costs nothing -- ${d(F.world, F.screen)} dB on a textured floor under the pan with a knot turning over it`,
           F.world - F.screen >= -0.05, "the knot moved in the world and keeps 0.9; the floor's exact vectors explain its windows, so even at 0.5 the flow seldom beats them");
        ok(`  [webgpu] ...and with the camera STILL the two tests are one: the reflection's frame identical to the bit (${o.reflectionStill.identical}), ${f(o.reflectionStill.world)} dB both`,
           o.reflectionStill.identical === true, "a still camera's own motion is zero at every pixel, which is what the screen test measured against");
        ok(`  [webgpu] ...and FSR3 hands its generator the camera's motion from FSR2's own stage when the flow is on (${o.fsr3.withFlow}), and renders none without it (${o.fsr3.without})`,
           o.fsr3.withFlow === true && o.fsr3.without === true, "fx/fsr/fsr3Tsl.mjs asks makeFsrTemporal for cameraMotion when frameGen.flow is set: one more full-screen pass a real frame");
    }
}

// ---- v4750 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/flowReconcileTsl.mjs, in render/flowReconcileTsl-selfcheck.mjs and here: W2 the camera's motion ignored -> 2, 1;
// W3 added, not taken away -> 2, 1; W8 the pass cache blind to the camera -> 0, 0 FIRST, when each arm here had its own
// generator -- it reads 1 now that one generator serves both, as a caller would use it. Against render/flowReconcile.mjs:
// W1 the mirror ignores it -> 3 there. Against render/temporalTsl.mjs, in render/temporalTsl-selfcheck.mjs and here: W4 the
// camera target at the far plane's depth only -> 2, 1; W9 never drawn -> 1, 1. Against fx/fsr/fsrFrameGenTsl.mjs: W5 the
// camera not handed on -> 1. fx/fsr/fsr3Tsl.mjs not asking for it (W6) -> 1; fx/fsr/fsrTemporalTsl.mjs ignoring the
// request (W7) -> 1.
REPORT.write();
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a surface that moves in the world AND has shading moving across it -- a shadow on a moving car -- which is " +
    "judged at 0.9 either way; skinned and morphed meshes, whose vectors the stage does not yet cover; and an orthographic camera.");
process.exitCode = fails ? 1 : 0;
