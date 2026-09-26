#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenScene-selfcheck.mjs -- v4745
//
// SHADOWS, REFLECTIONS AND UI: what a three.js scene's motion vectors do not see, drawn by three.js itself rather than
// stood in for by a scrolling texture (fx/fsr/fsrFrameGenFlow-selfcheck.mjs's wall). Each is a frame generated between two
// frames and graded against the frame rendered at the midpoint, 4 x 4 supersampled:
//   shadowPlain     a ball high over a plain floor, moving; its shadow crosses floor the ball never covers. The floor's
//                   vectors are zero and the shadow moved
//   shadowTextured  the same over a noise-textured floor, where the flow has to tell the shadow's motion from the floor's
//                   standing texture inside one window
//   reflection      a turning knot above a mirror floor (three's reflector): the reflection moves the other way from the
//                   knot, on a surface whose vectors are zero
//   ui              a HUD over a pan: the HUD's pixels stand still, and every vector under them is the floor's
// The arms, each fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen:
//   vectors     flow: null -- the application's field alone
//   moved       flow: { marginStill: 0.9 } -- v4741's reconciliation, 0.9 at every pixel
//   default     flow: {} -- v4745's: 0.9 where the pixel's own vector moved, 0.5 where it is under 0.05 pixels
//   composite   (ui only) the generator given HUD-LESS frames and the newer frame's HUD as `ui`, composited over -- FSR3's
//               UI composition; compositeFlow is the same with the default flow
// and the two controls every generator is measured against: repeating the older frame, and a cross-fade.
//
// *** THE MARGIN WAS CHOSEN ON THESE SCENES. *** The still-surface margin, 0.5, is a sweep over these four and the v4741
// gate's four (render/flowReconcile.mjs's note); the thresholds below are about half the gains that sweep read, so a row
// here fails only if the choice stops being worth what the note says it is. fx/fsr/fsrFrameGenFlow-selfcheck.mjs holds the
// cases it was NOT chosen on, at their own speeds.
// *** WEBGPU ONLY. *** The passes are held to their mirrors on both backends by render/opticalFlowTsl-selfcheck.mjs,
// render/flowReconcileTsl-selfcheck.mjs and render/frameInterpTsl-selfcheck.mjs; the composite is held to
// render/frameInterp.mjs's compositeUiCPU here.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { compositeUiCPU } from "../../render/frameInterp.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: shadows, a reflection and a HUD, each between two frames");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const FI = await import("/render/frameInterpTsl.mjs");
        const D = a.D, out = {};
        for (const mode of ["webgpu"]) {
            try {
                // *** THE CANVAS IS 512 SQUARE, AND NOT FOR SHOWING ANYTHING. *** three's reflector sizes its target from the
                // renderer's drawing buffer, not from the target being rendered; on the 8 x 8 canvas the other gates use, the
                // mirror is an 8 x 8 blur, and the first run graded that (the default +2.18 dB over 0.9 everywhere, not +5)
                const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init(); renderer.setSize(512, 512, false); renderer.shadowMap.enabled = true;
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                // tight rows, top first: WebGPU pads a row to 256 bytes
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v));
                const gl = TT.glClip(THREE, renderer), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const noise = (scale) => T.Fn(() => { const q = T.positionWorld.xz.mul(scale);
                    const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5)); return T.vec3(0.5).add(n3.mul(0.3)); })();
                const cam0 = (x = 0) => { const c = new THREE.PerspectiveCamera(40, 1, 0.1, 50); c.position.set(x, 3.2, 4.2); c.lookAt(x, 0, 0); c.updateMatrixWorld(); return c; };
                const shadowScene = (textured) => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const fm = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 }); fm.colorNode = textured ? noise(1.6) : T.vec3(0.75, 0.72, 0.68);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fm); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
                    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 16), new THREE.MeshStandardNodeMaterial({ color: 0xcc4422 })); ball.castShadow = true; scene.add(ball);
                    const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(-3, 5, 1); light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
                    Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 }); light.shadow.camera.updateProjectionMatrix();
                    scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, 0.5));
                    // the ball high above the floor, moving; its shadow crosses floor the ball never covers from this camera
                    return { scene, cam: cam0(), setT: (k) => { ball.position.set(-0.6 + k * 0.12, 1.6, -0.2); ball.updateMatrixWorld(); } };
                };
                const reflectionScene = () => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const refl = T.reflector({ resolutionScale: 1 }); refl.target.rotateX(-Math.PI / 2); scene.add(refl.target);
                    const fm = new THREE.MeshBasicNodeMaterial(); fm.colorNode = T.mix(T.vec3(0.25, 0.27, 0.3), refl.rgb, 0.8);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), fm); floor.rotation.x = -Math.PI / 2; scene.add(floor);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 120, 16), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                    return { scene, cam: cam0(), setT: (k) => { knot.position.set(-0.4 + k * 0.1, 0.9, -1.2); knot.rotation.set(0, k * 0.1, 0); knot.updateMatrixWorld(); } };
                };
                const uiScene = () => {
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const fm = new THREE.MeshBasicNodeMaterial(); fm.colorNode = noise(1.6);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), fm); floor.rotation.x = -Math.PI / 2; scene.add(floor);
                    const cam = cam0();
                    const hud = new THREE.Scene(), hm = new THREE.MeshBasicNodeMaterial(); hm.colorNode = T.vec3(0.95, 0.9, 0.2);
                    for (const [x, y, w, h] of [[-0.7, 0.85, 0.5, 0.06], [0.6, 0.85, 0.3, 0.1], [-0.8, -0.8, 0.12, 0.25], [0, -0.85, 0.9, 0.04]]) {
                        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hm); m.position.set(x, y, 0); hud.add(m); }
                    return { scene, cam, hud, setT: (k) => { cam.position.set(k * 0.12, 3.2, 4.2); cam.lookAt(k * 0.12, 0, 0); cam.updateMatrixWorld(); } };
                };
                // one generator per arm, reused across the scenes; the ui arms get their own, so a generator's composite target
                // is never shared with an arm that has none
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl });
                const arms = { vectors: FG.makeFrameGen(THREE, T, { w: D, h: D }), moved: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { marginStill: 0.9 } }),
                               default: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }) };
                const uiArms = { composite: FG.makeFrameGen(THREE, T, { w: D, h: D }), compositeFlow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }) };
                const A = tgt(D), B = tgt(D), Ah = tgt(D), Bh = tgt(D), U = tgt(D), o2 = tgt(D), big = tgt(D * 4), one = tgt(D);
                const cross = (p, c) => { const m = new THREE.NodeMaterial(); m.fragmentNode = FI.crossFadeNode(T, p.texture, c.texture).node; m.blending = THREE.NoBlending;
                    const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
                const o = {};
                for (const [cn, build] of [["shadowPlain", () => shadowScene(false)], ["shadowTextured", () => shadowScene(true)], ["reflection", reflectionScene], ["ui", uiScene]]) {
                    const S = build(), { scene, cam, setT, hud } = S;
                    const renderAt = async (k, target, withHud = true) => { setT(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam);
                        if (hud && withHud) { renderer.autoClear = false; await renderer.renderAsync(hud, ortho); renderer.autoClear = true; } };
                    await renderAt(0, A); await renderAt(1, B);
                    await renderAt(0.5, one); const truth1 = await read(one, D);
                    await renderAt(0.5, big); const t4 = await read(big, D * 4), truth = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const a0 = await read(A, D), b0 = await read(B, D);
                    // the region graded on its own: every pixel that changed between the two frames, or the HUD's
                    let region;
                    if (hud) {
                        renderer.setRenderTarget(U); renderer.setClearColor(0x000000, 0); await renderer.clearAsync(); renderer.autoClear = false; await renderer.renderAsync(hud, ortho); renderer.autoClear = true;
                        renderer.setClearColor(0x000000, 1);
                        const u = await read(U, D); region = Uint8Array.from({ length: D * D }, (_, i) => (u[i * 4 + 3] > 0.5 ? 1 : 0));
                        await renderAt(0, Ah, false); await renderAt(1, Bh, false);
                    } else region = Uint8Array.from({ length: D * D }, (_, i) => (Math.abs(a0[i * 4] - b0[i * 4]) + Math.abs(a0[i * 4 + 1] - b0[i * 4 + 1]) + Math.abs(a0[i * 4 + 2] - b0[i * 4 + 2]) > 0.03 ? 1 : 0));
                    const psnr = (img, tr, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++;
                        for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(tr[i * 4 + c])) ** 2; } return n ? (q === 0 ? Infinity : 10 * Math.log10(1 / (q / (n * 3)))) : null; };
                    const worst = (img, tr, m) => { let e = 0; for (let i = 0; i < D * D; i++) if (m[i]) for (let c = 0; c < 3; c++) e = Math.max(e, Math.abs(img[i * 4 + c] - tr[i * 4 + c])); return e; };
                    const imgs = { repeat: a0 };
                    renderer.setRenderTarget(o2); await renderer.renderAsync(cross(A, B), ortho); imgs.crossFade = await read(o2, D);
                    const all = hud ? { ...arms, ...uiArms } : arms, c = { regionPx: region.reduce((q, v) => q + v, 0) };
                    for (const [an, g] of Object.entries(all)) {
                        const ui = an in uiArms ? U.texture : null, P = ui ? Ah : A, C = ui ? Bh : B;
                        // primed with frame k's own field, so the older depth is frame k's, as it is in use
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: P.texture, cur: P.texture, motion: stage.motion.texture, depth: stage.depth.texture, ui }, o2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: P.texture, cur: C.texture, motion: stage.motion.texture, depth: stage.depth.texture, ui }, o2);
                        imgs[an] = await read(o2, D);
                        if (ui && an === "composite") {
                            // the composite held to its mirror: the frame before the UI, the UI, and what the device made of them
                            c.mirror = { pre: Array.from(await read(g.targets.pre, D)), ui: Array.from(await read(U, D)), out: Array.from(imgs[an]) };
                            let refused = "no throw"; const small = tgt(D / 2);
                            try { await g.generate(renderer, { prev: P.texture, cur: C.texture, motion: stage.motion.texture, depth: stage.depth.texture, ui: small.texture }, o2); } catch (e) { refused = String(e.message); }
                            small.dispose(); c.refused = refused;
                        }
                    }
                    c.all = {}; c.region = {}; c.hud1 = {}; c.hudWorst = {};
                    for (const [k, img] of Object.entries(imgs)) { c.all[k] = psnr(img, truth); c.region[k] = psnr(img, truth, region);
                        if (hud) { c.hud1[k] = psnr(img, truth1, region); c.hudWorst[k] = worst(img, truth1, region); } }
                    o[cn] = c;
                }
                for (const g of [...Object.values(arms), ...Object.values(uiArms)]) g.dispose(); stage.dispose();
                for (const t of [A, B, Ah, Bh, U, o2, big, one]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const f = (v) => (v === Infinity ? "exact" : v.toFixed(2)), d = (x, y) => (x === Infinity ? "exact" : (x - y >= 0 ? "+" : "") + (x - y).toFixed(2));
        for (const cn of ["shadowPlain", "shadowTextured", "reflection", "ui"]) {
            const c = o[cn], extra = cn === "ui" ? `, composite ${d(c.all.composite, c.all.vectors)}, compositeFlow ${d(c.all.compositeFlow, c.all.vectors)}` : "";
            say(`[${mode}] ${cn.padEnd(14)} whole frame: vectors ${f(c.all.vectors)}, moved ${d(c.all.moved, c.all.vectors)}, default ${d(c.all.default, c.all.vectors)}${extra} (cross-fade ${f(c.all.crossFade)}, repeat ${f(c.all.repeat)}); ` +
                `${cn === "ui" ? "the HUD" : "what changed"} (${c.regionPx} px): vectors ${f(c.region.vectors)}, moved ${d(c.region.moved, c.region.vectors)}, default ${d(c.region.default, c.region.vectors)}`);
        }
        const R = o.reflection, ST = o.shadowTextured, SP = o.shadowPlain, U = o.ui;
        ok(`*** [${mode}] a REFLECTION the vectors call still: the default is ${d(R.region.default, R.region.vectors)} dB over the vectors where the frame changed, and ${d(R.region.default, R.region.moved)} over v4741's 0.9 everywhere (${d(R.all.default, R.all.moved)} on the whole frame) ***`,
           R.region.default - R.region.vectors >= 3 && R.region.default - R.region.moved >= 2.5 && R.all.default - R.all.moved >= 2,
           "the mirror floor's vectors are zero and its reflection moved the other way from the knot; at 0.9 the flow had to explain a window ten times better than zero motion, and a reflection's soft edge seldom lets it");
        ok(`*** [${mode}] a SHADOW crossing a textured floor: ${d(ST.region.default, ST.region.vectors)} dB where the frame changed, ${d(ST.region.default, ST.region.moved)} over 0.9 everywhere -- and on a plain floor ${d(SP.region.default, SP.region.vectors)} and ${d(SP.region.default, SP.region.moved)} ***`,
           ST.region.default - ST.region.vectors >= 2.5 && ST.region.default - ST.region.moved >= 2.5 && SP.region.default - SP.region.vectors >= 3.5 && SP.region.default - SP.region.moved >= 1.5,
           "the floor stands still and the shadow moved; the textured floor is the harder, where the window sees the standing texture and the moving shadow at once");
        ok(`  [${mode}] ...and none of it costs the whole frame: default over vectors ${["shadowPlain", "shadowTextured", "reflection", "ui"].map((k) => d(o[k].all.default, o[k].all.vectors)).join(", ")} dB, and over 0.9 everywhere ${["shadowPlain", "shadowTextured", "reflection", "ui"].map((k) => d(o[k].all.default, o[k].all.moved)).join(", ")}`,
           ["shadowPlain", "shadowTextured", "reflection", "ui"].every((k) => o[k].all.default >= o[k].all.vectors - 0.05 && o[k].all.default >= o[k].all.moved - 0.05),
           "a pan is a moving surface, so the ui scene's floor is judged at 0.9 as before -- and the HUD over it is the next row's");
        ok(`*** [${mode}] a HUD over a pan, COMPOSITED as FSR3 does -- generated from HUD-less frames with the newer frame's HUD laid over -- is the HUD exactly: worst error ${U.hudWorst.composite.toExponential(1)} against the midpoint frame, where the vectors drag it with the floor (${f(U.hud1.vectors)} dB, worst ${U.hudWorst.vectors.toFixed(2)}) and the flow does not rescue it (${f(U.hud1.default)} dB) ***`,
           U.hudWorst.composite < 1e-6 && U.hudWorst.compositeFlow < 1e-6 && U.hud1.vectors < 30 && U.hud1.default < 30,
           "every vector under the HUD is the floor's, so the HUD's pixels are warped along the pan; the flow sees the HUD stand still but judges it at 0.9, because its vectors moved. Graded here against the one-sample midpoint frame, since the HUD is drawn without anti-aliasing in every frame");
        ok(`  [${mode}] ...and the whole frame follows: composited ${d(U.all.composite, U.all.vectors)} dB over the vectors, ${d(U.all.compositeFlow, U.all.vectors)} with the flow as well, against ${d(U.all.default, U.all.vectors)} for the flow alone`,
           U.all.composite > U.all.default + 1 && U.all.compositeFlow >= U.all.composite - 0.05,
           "the HUD is a few percent of the frame and most of the error: a warped HUD is a hard yellow edge in the wrong place");
        // the composite against its mirror
        const m = U.mirror, cpu = compositeUiCPU({ frame: Float32Array.from(m.pre), ui: Float32Array.from(m.ui), w: D, h: D });
        let dmax = 0, opaque = 0; for (let i = 0; i < D * D * 4; i++) dmax = Math.max(dmax, Math.abs(cpu[i] - m.out[i])); for (let i = 0; i < D * D; i++) if (m.ui[i * 4 + 3] === 1) opaque++;
        ok(`  [${mode}] ...and the device's composite is render/frameInterp.mjs's compositeUiCPU to ${dmax.toExponential(1)} over all ${D * D} pixels, ${opaque} of them under the HUD`,
           dmax < 1e-6 && opaque === U.regionPx && opaque > 0, "ui + frame * (1 - ui alpha), premultiplied");
        ok(`  [${mode}] ...and a UI that is not the generated frame's size is refused`, /ui must be a 128 x 128 texture/.test(U.refused), U.refused);
    }
}

// ---- v4745 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against fx/fsr/fsrFrameGenTsl.mjs, here, in fx/fsr/fsrFrameGenFlow-selfcheck.mjs and in fx/fsr/fsr3Tsl-selfcheck.mjs:
//   G12 the generator drops `marginStill`                       -> 2 here, 3, 0
//   G13 the composite without (1 - alpha)                       -> 3 here, 0, 1
//   G14 the frame gathered to the output, the UI laid over a    -> 1 here, 0, 0
//       frame never drawn
//   G15 a UI of the wrong size accepted                         -> 1 here
//   G16 the UI laid under the frame, not over                   -> 3 here, 0, 1
// *** G14 WAS AN EQUIVALENT MUTANT ON ITS FIRST DRAFT. *** Gathering into the output AS WELL as under the UI is a pass the
// composite overwrites; it scored 0 everywhere and was right to. Gathering ONLY into the output leaves the composite reading
// a target nothing drew, and the whole-frame row sees a black floor under the HUD. fx/fsr/fsr3Tsl-selfcheck.mjs cannot: it
// holds the output to compositeUiCPU of the frame under the UI, which is the same black frame on both sides.
// And against render/frameInterp.mjs's compositeUiCPU, I1 (alpha kept, not 1 - alpha) -> 1 here; its own gate holds the rest.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a HUD that CHANGES between frames -- the composite lays the newer frame's over the generated one, so a " +
    "counter or a growing bar is shown half a frame early, as FSR3's is; UI that is not opaque over a moving scene, where the " +
    "HUD-less frames are what makes it right and nothing here grades a half-transparent panel; particles, which move and have " +
    "no vectors of their own; and a shadow or a reflection under a moving CAMERA, where every surface moved on screen and the " +
    "still-surface margin never applies -- render/flowReconcile.mjs's note says so.");
process.exitCode = fails ? 1 : 0;
