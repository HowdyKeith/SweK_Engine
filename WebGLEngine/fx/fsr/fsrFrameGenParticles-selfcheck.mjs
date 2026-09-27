#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFrameGenParticles-selfcheck.mjs -- v4752
//
// PARTICLES. A particle system is drawn one of two ways: an InstancedMesh, a quad and a matrix a particle, or every quad
// written into one buffer each frame. Neither had been through the generator. The first probe found three's velocity for an
// InstancedMesh broken: it keeps the previous instance matrices in an array it copies into BEFORE the draw and never uploads,
// so the vertex stage read the matrices as they were when the material was built, and particles moving 3 pixels a frame
// carried vectors of 103. render/temporalTsl.mjs's motion stage now keeps each instanced mesh's matrices from its own last
// draw (render/temporalTsl-selfcheck.mjs holds the field to three separate meshes' on both backends). The buffer's particles
// carry nothing: the object never moves, so every vector on them is zero.
//
// 160 small quads rising and drifting at their own speeds in front of a textured wall, the camera still; a frame generated
// between two and graded against the frame rendered at the midpoint (4 x 4 supersampled), over the whole frame and over the
// particles' pixels -- those where either real frame or the midpoint differs from the wall alone. Each way of drawing them:
//   vectors    the generator given the stage's vectors
//   flow       the same with the optical flow reconciled against them (flow: {}, the camera's motion given)
// and the engine's own answer for content the generator cannot follow: the frame generated WITHOUT the particles, and the
// particles drawn AT the generated time over it through the generator's composite -- the path the UI takes (v4745).
// *** WEBGPU ONLY. ***
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128, NP = 160;

console.log("\n1. ON THE DEVICE: particles drawn two ways, generated three ways");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D, NP }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.06, 0.09);
                const wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const q = T.positionWorld.xy.mul(1.4); return T.vec3(0.25).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.12)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), wm); wall.position.z = -2; scene.add(wall);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                // each particle rising and drifting at its own speed, with a sway: its centre at time k
                let sd = 3; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
                const P = Array.from({ length: a.NP }, () => ({ x: (rnd() - 0.5) * 3.2, y: (rnd() - 0.5) * 3.2, z: rnd() * 1.5, vy: 0.04 + rnd() * 0.06, vx: (rnd() - 0.5) * 0.04, s: 0.035 + rnd() * 0.04 }));
                const at = (p, k) => [p.x + p.vx * k + 0.05 * Math.sin(k * 0.7 + p.z * 5), p.y + p.vy * k, p.z];
                // the fastest particle's move from frame 0 to frame 1 on the screen, its centre projected
                const px = (v) => { const q = new THREE.Vector3(...v).project(cam); return [(q.x + 1) / 2 * D, (1 - q.y) / 2 * D]; };
                const fastest = Math.max(...P.map((p) => { const u = px(at(p, 0)), w = px(at(p, 1)); return Math.hypot(u[0] - w[0], u[1] - w[1]); }));
                const pm = new THREE.MeshBasicNodeMaterial({ color: 0xffd060 });
                const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), pm, a.NP); scene.add(inst);
                const quadsGeo = new THREE.BufferGeometry(), pos = new Float32Array(a.NP * 6 * 3); quadsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
                const baked = new THREE.Mesh(quadsGeo, pm); baked.frustumCulled = false; scene.add(baked);
                const mtx = new THREE.Matrix4(), corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
                let kind = "instanced", showParticles = true;
                const setT = (k) => {
                    P.forEach((p, i) => { const [x, y, z] = at(p, k); mtx.makeScale(p.s, p.s, 1).setPosition(x, y, z); inst.setMatrixAt(i, mtx);
                        corners.forEach(([u, v], j) => { const b = (i * 6 + j) * 3; pos[b] = x + u * p.s / 2; pos[b + 1] = y + v * p.s / 2; pos[b + 2] = z; }); });
                    inst.instanceMatrix.needsUpdate = true; quadsGeo.attributes.position.needsUpdate = true;
                    inst.visible = showParticles && kind === "instanced"; baked.visible = showParticles && kind === "baked"; };
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                const gv = FG.makeFrameGen(THREE, T, { w: D, h: D }), gf = FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} });
                const A = tgt(D), B = tgt(D), o2 = tgt(D), o3 = tgt(D), layer = tgt(D), big = tgt(D * 4), Ah = tgt(D), Bh = tgt(D), M = tgt(D), o = { fastest };
                const render = async (k, target) => { setT(k); renderer.setRenderTarget(target); await renderer.renderAsync(scene, cam); };
                // the stage's field at frame 1, with frame 0 its last: primed from frame -1
                const vectorsAt1 = async (g, prev, cur, camera) => {
                    setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                    await g.generate(renderer, { prev, cur: prev, motion: stage.motion.texture, depth: stage.depth.texture, camera: camera ? stage.camera.texture : null }, o2);
                    setT(1); await stage.render(renderer, scene, cam);
                    await g.generate(renderer, { prev, cur, motion: stage.motion.texture, depth: stage.depth.texture, camera: camera ? stage.camera.texture : null }, o2);
                };
                for (const k of ["instanced", "baked"]) {
                    kind = k; const res = o[k] = {};
                    await render(0, A); await render(1, B); await render(0.5, big); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    showParticles = false; await render(0.5, M); const wallOnly = await read(M, D); showParticles = true;
                    await render(0.5, M); const mid = await read(M, D), a0 = await read(A, D), b0 = await read(B, D);
                    const region = Uint8Array.from({ length: D * D }, (_, i) => [a0, b0, mid].some((f) => Math.abs(f[i * 4] - wallOnly[i * 4]) + Math.abs(f[i * 4 + 2] - wallOnly[i * 4 + 2]) > 0.05) ? 1 : 0);
                    const ps = (img, msk) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (msk && !msk[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
                    res.region = region.reduce((q, v) => q + v, 0);
                    for (const [an, g, withCam] of [["vectors", gv, false], ["flow", gf, true]]) {
                        await vectorsAt1(g, A.texture, B.texture, withCam);
                        if (an === "vectors") { const mo = await read(stage.motion, D); let mx = 0;
                            for (let i = 0; i < D * D; i++) if (region[i]) mx = Math.max(mx, Math.hypot(mo[i * 4] * D, mo[i * 4 + 1] * D)); res.largest = mx; }
                        const img = await read(o2, D); res[an] = [ps(img), ps(img, region)];
                    }
                    // the frame generated without the particles, and the particles drawn at the midpoint over it: premultiplied, on
                    // transparent black, as the composite takes a layer
                    showParticles = false; await render(0, Ah); await render(1, Bh);
                    await vectorsAt1(gv, Ah.texture, Bh.texture, false);
                    showParticles = true; setT(0.5); wall.visible = false; const bg = scene.background; scene.background = null;
                    renderer.setRenderTarget(layer); renderer.setClearColor(0x000000, 0); await renderer.clearAsync(); renderer.autoClear = false; await renderer.renderAsync(scene, cam); renderer.autoClear = true;
                    renderer.setClearColor(0x000000, 1); wall.visible = true; scene.background = bg;
                    await gv.composite(renderer, o2.texture, layer.texture, o3);
                    const img = await read(o3, D); res.drawnAtT = [ps(img), ps(img, region)]; res.drawnImg = Array.from(img);
                }
                let same = 0; for (let i = 0; i < D * D * 4; i++) if (o.instanced.drawnImg[i] === o.baked.drawnImg[i]) same++;
                o.drawnSame = same === D * D * 4; delete o.instanced.drawnImg; delete o.baked.drawnImg;
                gv.dispose(); gf.dispose(); stage.dispose(); for (const t of [A, B, o2, o3, layer, big, Ah, Bh, M]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran both kinds", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, I = o.instanced, B = o.baked, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const [k, x] of [["instanced", I], ["baked", B]])
            say(`${k.padEnd(9)} over the frame / the particles' ${x.region} pixels: vectors ${f(x.vectors[0])} / ${f(x.vectors[1])} dB, flow ${f(x.flow[0])} / ${f(x.flow[1])}, drawn at t ${f(x.drawnAtT[0])} / ${f(x.drawnAtT[1])}; largest vector on them ${f(x.largest)} px`);
        ok(`*** [webgpu] an instanced particle's vector is its motion: the largest on the particles' pixels ${f(I.largest)} px, the fastest particle's centre moving ${f(o.fastest)} px -- and the SAME particles in one buffer carry ${f(B.largest)} ***`,
           Math.abs(I.largest - o.fastest) < 0.5 && B.largest === 0,
           "at v4751 the instanced ones read 103 px: three's previous instance matrices were the ones the material was built with. The buffer's object never moves");
        ok(`*** [webgpu] so instanced particles generate ${d(I.vectors[1], B.vectors[1])} dB closer to the midpoint over their pixels than the same particles in one buffer, ${d(I.vectors[0], B.vectors[0])} over the frame ***`,
           I.vectors[1] - B.vectors[1] >= 1.5 && I.vectors[0] > B.vectors[0], "each quad splatted along its own vector, where the buffer's stay where they were in the newer frame");
        ok(`  [webgpu] ...and the flow finds what the buffer's particles do not carry: ${d(B.flow[1], B.vectors[1])} dB over their pixels, to ${d(B.flow[1], I.vectors[1])} of the instanced ones' vectors -- and adds ${d(I.flow[1], I.vectors[1])} to those`,
           B.flow[1] - B.vectors[1] >= 1.0 && I.flow[1] > I.vectors[1], "the flow searches the two frames, so it finds motion no vector carries, and the reconciliation takes it where it explains the pixels better");
        const best = Math.max(I.vectors[1], I.flow[1], B.vectors[1], B.flow[1]);
        ok(`*** [webgpu] and the particles DRAWN at the generated time over a frame generated without them are best: ${f(I.drawnAtT[1])} dB over their pixels, ${d(I.drawnAtT[1], best)} over the best generated -- the same frame to the bit either way they are drawn (${o.drawnSame}) ***`,
           I.drawnAtT[1] - best >= 1.0 && I.drawnAtT[0] > Math.max(I.flow[0], B.flow[0]) && o.drawnSame === true,
           "what the generator cannot follow it need not: the generator's composite lays a premultiplied layer over its frame, as fx/fsr/fsr3Tsl.mjs's `ui` does");
    }
}

// ---- v4752 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/temporalTsl.mjs's instance history, in render/temporalTsl-selfcheck.mjs (both backends, two rows each) and here:
//   P1 not read -- three's own positionPrevious                          -> 4, 2  (the particles' largest vector 102.85 px)
//   P2 the previous instance matrices the current ones                    -> 4, 2  (every vector on them 0)
//   P3 the last draw's matrices never recorded                            -> 4, 2
//   P4 `toward` ignored for instances                                     -> 2, 0  (the toward row, both backends)
//   P6 each instance's pose at 1 - t                                      -> 2, 0
//   P7 positionLocal -- already through THIS instance matrix -- through the previous one -> 4, 2
//   P9 one record for every instanced mesh                                -> 4, -  (two meshes share a geometry and a material)
// Against fx/fsr/fsrFrameGenTsl.mjs: C1 the layer added to the frame, not laid over it -> 1 here.
// *** TWO LINES OF THE FIRST DRAFT WERE DEAD, AND TWO SABOTAGES SAID SO. *** Flagging the buffer node for upload and setting
// its value each draw both left every gate green: three's Buffer binding reports itself changed at every draw, and the value
// was the same array. Both lines are gone.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: particles whose positions a compute pass writes, which carry nothing as the buffer's do; and a moving " +
    "camera. TRANSLUCENT particles are render/translucentLayer.mjs's since v4760 (fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs), " +
    "three's Points and Sprites render/temporalTslZoo-selfcheck.mjs's since v4761.");
process.exitCode = fails ? 1 : 0;
