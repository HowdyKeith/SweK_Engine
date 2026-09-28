#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenLayerCost-selfcheck.mjs -- v4767
//
// WHAT THE TRANSLUCENT LAYER COSTS A GENERATED FRAME, AND WHAT IT COSTS NOT TO PAY IT. render/translucentLayer.mjs draws the
// opaque scene's depth before the translucent things (v4760) and before a lens (v4765): a whole geometry pass, each generated
// frame -- on this device as much as rendering a real frame. The generator already splats a depth at t (the clip depth of what
// lands at each pixel, fx/fsr/fsrFrameGenTsl.mjs's depthAt); `{ depth: gen.depthAt }` writes it with ONE full-screen quad instead.
//   1. the cost, 128 x 128, one knot (10,560 triangles) and a hundred (1,056,000): a real frame, the layer with the geometry
//      pass, the layer with the generator's depth -- medians of three, after the queue drains
//   2. what the quad gives up, on the two cases where an opaque thing stands in front: fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs's
//      glass behind a sliding box, fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs's lens behind one -- each generated both ways
// *** THIS DEVICE IS SWIFTSHADER, A CPU RASTERISER. *** Its milliseconds are a CPU's; what is asserted is how each grows with
// the scene -- the geometry pass with the triangles, the quad not at all -- which is the arithmetic of the two, not the device's.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: the layer's depth by a geometry pass and by the generator's own, in time and in dB");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const TL = await import("/render/translucentLayer.mjs");
        const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init(); const dev = renderer.backend.device;
        const done = async () => { await dev.queue.onSubmittedWorkDone(); return performance.now(); };
        const tgt = (n = D) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
            for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
        const cl = (v) => Math.min(1, Math.max(0, v)), out = { cost: {}, q: {} };
        const time = async (fn) => { const xs = []; for (let i = 0; i < 3; i++) { await done(); const t0 = performance.now(); await fn(); xs.push(await done() - t0); } xs.sort((p, q) => p - q); return xs[1]; };
        // ---- 1. the cost
        { const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 9); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
          for (const N of [1, 100]) {
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06); const geo = new THREE.TorusKnotGeometry(0.35, 0.1, 220, 24), mat = new THREE.MeshNormalNodeMaterial();
            const knots = []; for (let i = 0; i < N; i++) { const k = new THREE.Mesh(geo, mat); k.position.set(((i * 37) % 10 - 5) * 0.8, ((i * 53) % 8 - 4) * 0.8, -((i * 29) % 5)); scene.add(k); knots.push(k); }
            const glass = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicNodeMaterial({ transparent: true, color: 0x8cc0ff, opacity: 0.35 })); glass.position.z = 1; scene.add(glass);
            const pose = (t) => knots.forEach((k, i) => { k.rotation.set(t * 0.4 + i, t * 0.6, 0); k.updateMatrixWorld(); });
            const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl: false }), layer = TL.makeTranslucentLayer(THREE, { w: D, h: D }), g = FG.makeFrameGen(THREE, T, { w: D, h: D }), A = tgt(), B = tgt(), o2 = tgt();
            const draw = async (t, target) => { pose(t); const back = layer.hide(scene); renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam); back(); };
            const st = async (t) => { pose(t); const back = layer.hide(scene); await stage.render(renderer, scene, cam); back(); };
            await draw(0, A); await st(0); await draw(1, B); await st(1);
            await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture }, o2);
            pose(0.5); await layer.render(renderer, scene, cam); await layer.render(renderer, scene, cam, { depth: g.depthAt });   // compiled once each
            const c = { tris: geo.index.count / 3 * N };
            c.realFrame = await time(async () => { pose(0.3); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); });
            c.geometry = await time(async () => { pose(0.5); await layer.render(renderer, scene, cam); });
            c.depthAt = await time(async () => { pose(0.5); await layer.render(renderer, scene, cam, { depth: g.depthAt }); });
            out.cost["N" + N] = c; stage.dispose(); layer.dispose(); g.dispose(); for (const t of [A, B, o2]) t.dispose();
          } }
        // ---- 2. what the quad gives up, where an opaque box slides in front
        { const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
          const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl: false }), layer = TL.makeTranslucentLayer(THREE, { w: D, h: D });
          const A2 = tgt(), B2 = tgt(), o2 = tgt(), big = tgt(D * 4), older = tgt(), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
          const keepM = new THREE.NodeMaterial(); keepM.fragmentNode = T.textureLoad(stage.depth.texture, T.ivec2(T.int(T.screenCoordinate.x), T.int(T.screenCoordinate.y))); keepM.blending = THREE.NoBlending; keepM.depthTest = false; keepM.depthWrite = false;
          const keepScene = new THREE.Scene(); keepScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), keepM));
          for (const kind of ["glass", "lens"]) {
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
            const bm = new THREE.MeshBasicNodeMaterial(); bm.colorNode = T.Fn(() => { const q = T.uv().mul(T.vec2(14.0, 8.0)).mul(6.4); return T.vec3(0.4).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.25)); })();
            const bg = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), bm); scene.add(bg);
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.3), new THREE.MeshNormalNodeMaterial()); box.position.z = 1.0; scene.add(box);
            let pm; if (kind === "glass") { pm = new THREE.MeshBasicNodeMaterial({ transparent: true }); pm.colorNode = T.vec3(0.55, 0.75, 1.0); pm.opacityNode = T.float(0.35); }
            else { pm = new THREE.MeshBasicNodeMaterial(); pm.backdropNode = T.viewportSharedTexture(T.screenUV.add(T.vec2(T.sin(T.uv().y.mul(25.0)).mul(0.02), 0.0))).rgb.mul(T.vec3(0.7, 0.85, 1.0)); }
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), pm); pane.position.z = 0.5; scene.add(pane);
            const setT = (k) => { bg.position.x = k * 0.25; bg.updateMatrixWorld(); box.position.x = -0.9 + k * 0.3; box.updateMatrixWorld(); };
            const draw = async (k, target, without) => { setT(k); const back = without ? layer.hide(scene) : null; renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam); if (back) back(); };
            await draw(0, A2, true); await draw(1, B2, true); await draw(0.5, big); const t4 = await read(big, D * 4);
            const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
            await draw(0.5, o2, true); const nov = await read(o2, D); await draw(0.5, o2); const with1 = await read(o2, D);
            const mk = Uint8Array.from({ length: D * D }, (_, i) => (Math.abs(with1[i * 4] - nov[i * 4]) + Math.abs(with1[i * 4 + 1] - nov[i * 4 + 1]) + Math.abs(with1[i * 4 + 2] - nov[i * 4 + 2]) > 0.03 ? 1 : 0));
            const ps = (img, m) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (m && !m[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
            const st = async (k) => { setT(k); const back = layer.hide(scene); await stage.render(renderer, scene, cam); back(); };
            await st(0); renderer.setRenderTarget(older); await renderer.renderAsync(keepScene, ortho); await st(1);
            const res = {};
            for (const which of ["geometry", "depthAt"]) {
                const g = FG.makeFrameGen(THREE, T, { w: D, h: D }), opt = () => (which === "depthAt" ? { depth: g.depthAt } : {});
                const args = { prev: A2.texture, cur: B2.texture, motion: stage.motion.texture, depth: stage.depth.texture, depthPrev: older.texture };
                if (kind === "glass") args.ui = async (t) => { setT(t); await layer.render(renderer, scene, cam, opt()); return layer.texture; };
                else args.over = async (t, frame) => { setT(t); return layer.renderOver(renderer, scene, cam, frame, opt()); };
                await g.generate(renderer, args, o2); const img = await read(o2, D); res[which] = { see: ps(img, mk), all: ps(img) }; g.dispose();
            }
            out.q[kind] = res;
          }
          stage.dispose(); layer.dispose(); for (const t of [A2, B2, o2, big, older]) t.dispose(); }
        return out;
    }` });
    ok("the harness ran both measurements", r.ok && r.result && r.result.cost && r.result.cost.N100, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && r.result.cost && r.result.cost.N100) {
        const { cost: c, q } = r.result, f = (v) => v.toFixed(1), d = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
        for (const n of ["N1", "N100"]) say(`${c[n].tris} triangles: a real frame ${f(c[n].realFrame)} ms, the layer with the geometry pass ${f(c[n].geometry)} ms, with the generator's depth ${f(c[n].depthAt)} ms`);
        ok(`*** the layer's geometry pass grows with the scene as a real frame does -- ${f(c.N1.geometry)} to ${f(c.N100.geometry)} ms, a real frame ${f(c.N1.realFrame)} to ${f(c.N100.realFrame)} -- and with the generator's depth it does not: ${f(c.N1.depthAt)} to ${f(c.N100.depthAt)} ms ***`,
           c.N100.geometry > 10 * c.N1.geometry && c.N100.geometry > 0.5 * c.N100.realFrame && c.N100.depthAt < 2 * c.N1.depthAt + 1 && c.N100.depthAt < 0.1 * c.N100.geometry,
           "a hundredfold scene, and one quad against a pass over a million triangles -- SwiftShader's milliseconds, the ratio the arithmetic's");
        ok(`*** and on the translucent things' pixels, the generator's depth gives what the geometry pass gives: glass ${f(q.glass.depthAt.see)} against ${f(q.glass.geometry.see)} dB, a lens ${f(q.lens.depthAt.see)} against ${f(q.lens.geometry.see)} ***`,
           Math.abs(q.glass.depthAt.see - q.glass.geometry.see) < 0.01 && Math.abs(q.lens.depthAt.see - q.lens.geometry.see) < 0.01,
           "both behind a box sliding across -- where they show, they are drawn the same");
        ok(`  ...what moves is the frame at the box's edge, where the generated depth puts the box where the generated frame has it: glass ${d(q.glass.depthAt.all - q.glass.geometry.all)} dB, a lens ${d(q.lens.depthAt.all - q.lens.geometry.all)}`,
           Math.abs(q.glass.depthAt.all - q.glass.geometry.all) < 1.5 && Math.abs(q.lens.depthAt.all - q.lens.geometry.all) < 1.5,
           "so `depth: gen.depthAt` is the caller's choice, and fsr-three.html makes it: a quad a frame, against the scene's geometry");
    }
}

// ---- v4767 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/translucentLayer.mjs, here and in render/translucentLayer-selfcheck.mjs: C1 the quad writing the far plane
// -> 1, 2; C2 WebGL's clip z taken as window depth -> 0, 1 (the WebGL row; this gate is WebGPU); C3 the validity ignored -> 2
// there (red only since that gate's texture has an empty third under a spark); C4 the depth option ignored -> 1, 0. Against
// fx/fsr/fsrFrameGenTsl.mjs, here: C6 `ui` called before the splat, so depthAt is empty -> 1. *** C5 -- depthAt the splat
// before the fill -- IS EQUIVALENT HERE, measured: *** the four figures read the same to the hundredth (glass 34.4 dB and -0.29,
// a lens 29.5 and -0.81); the fill changes only the holes, and the box's holes lie where it hides the pane either way.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a real GPU's times -- the run in docs/real-hardware-fsr.md times this gate with the rest; a translucent thing " +
    "in front of a surface the splat did not reach (a hole the fill left), where the generated depth is the far plane; and the " +
    "motion stage's own geometry pass, which a real frame pays anyway.");
process.exitCode = fails ? 1 : 0;
