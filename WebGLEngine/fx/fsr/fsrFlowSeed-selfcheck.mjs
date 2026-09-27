#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFlowSeed-selfcheck.mjs -- v4758
//
// THE OPTICAL FLOW SEEDED WITH THE APPLICATION'S OWN VECTORS, IN THE GENERATOR. render/opticalFlow.mjs's `seed` (v4758) gives
// the coarsest level a second guess: the pixel's own vector at each block's centre, taken where it explains the block better
// than standing still. On the mirror it brings in what the pyramid cannot reach: a camera's 21 px with 3 px of scroll on top
// is found at 100 % of blocks seeded and 0 % unseeded, for 0.1 % more reads (render/opticalFlowTsl-selfcheck.mjs holds the
// device to it at every block). Here is what that is worth in a generated frame, under camera pans fast enough to need it:
//   scroll 27 / 40   fsr-three.html's knot over the scrolling wall, the camera panning 0.6 and 0.9 a frame (up to 27 and 40 px)
//   reflection 44    the knot over a reflecting floor, the camera panning 0.9 a frame
//   slow             the wall at the pan fx/fsr/fsrFrameGenFlow-selfcheck.mjs runs, 2 px -- where a seed has nothing to bring
// three arms: the vectors alone, the flow as it is (flow: {}), and seeded (flow: { seed: true }); the camera's motion given.
// *** THE SEED FINDS THE SHIFTS AND THE FRAMES DO NOT FOLLOW, SO IT IS NOT THE DEFAULT. ***
// *** WEBGPU ONLY. ***
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128, CASES = ["scroll27", "scroll40", "reflection44", "slow"];

console.log("\n1. ON THE DEVICE: fast pans, with the flow seeded and not");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                // the canvas is 512 square: three's reflector sizes its target from the drawing buffer
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init(); renderer.setSize(512, 512, false);
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => { const px = await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n), s = Math.ceil(n / 16) * 16, o = new Float32Array(n * n * 4);
                    for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) o[y * n * 4 + x] = px[y * s * 4 + x]; return o; };
                const cl = (v) => Math.min(1, Math.max(0, v)), gl = TT.glClip(THREE, renderer);
                const knotWall = (sc, pan) => { const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                    const scroll = T.uniform(0.0), wm = new THREE.MeshBasicNodeMaterial();
                    wm.colorNode = T.Fn(() => { const q = T.vec2(T.uv().x.mul(14.0).add(scroll), T.uv().y.mul(8.0)).mul(1.6);
                        const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5)); return T.vec3(0.5).add(n3.mul(0.3)); })();
                    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wm); wall.position.z = -2; scene.add(wall); const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                    return { scene, cam, setT: (k) => { const t = k / 60; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); scroll.value = k * sc;
                        cam.position.set(k * pan, 0.6, 5.2); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); } }; };
                const reflection = (pan) => { const scene = new THREE.Scene(); scene.background = new THREE.Color(0.1, 0.12, 0.16);
                    const refl = T.reflector({ resolutionScale: 1 }); refl.target.rotateX(-Math.PI / 2); scene.add(refl.target);
                    const fm = new THREE.MeshBasicNodeMaterial(); fm.colorNode = T.mix(T.vec3(0.25, 0.27, 0.3), refl.rgb, 0.8);
                    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), fm); floor.rotation.x = -Math.PI / 2; scene.add(floor);
                    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 120, 16), new THREE.MeshNormalNodeMaterial()); scene.add(knot); const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
                    return { scene, cam, setT: (k) => { knot.position.set(-0.4 + k * 0.1, 0.9, -1.2); knot.rotation.set(0, k * 0.1, 0); knot.updateMatrixWorld();
                        cam.position.set(k * pan, 3.2, 4.2); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); } }; };
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                const arms = { vectors: FG.makeFrameGen(THREE, T, { w: D, h: D }), flow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }), seeded: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { seed: true } }) };
                const A = tgt(D), B = tgt(D), o2 = tgt(D), big = tgt(D * 4);
                const o = { seedFlags: { flow: arms.flow.opticalFlow.seed, seeded: arms.seeded.opticalFlow.seed } };
                for (const [cn, S] of [["scroll27", knotWall(0.12, 0.6)], ["scroll40", knotWall(0.12, 0.9)], ["reflection44", reflection(0.9)], ["slow", knotWall(0.12, 0.05)]]) {
                    const { scene, cam, setT } = S;
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const ps = (img) => { let q = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                    const c = {};
                    for (const [an, g] of Object.entries(arms)) {
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: g.reconcile ? stage.camera.texture : null }, o2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: g.reconcile ? stage.camera.texture : null }, o2);
                        c[an] = ps(await read(o2, D));
                    }
                    { const m = await read(stage.motion, D); let mx = 0; for (let i = 0; i < D * D; i++) mx = Math.max(mx, Math.hypot(m[i * 4] * D, m[i * 4 + 1] * D)); c.maxVectorPx = mx; }
                    o[cn] = c;
                }
                for (const g of Object.values(arms)) g.dispose(); stage.dispose(); for (const t of [A, B, o2, big]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const cn of CASES) say(`${cn.padEnd(12)} vectors up to ${o[cn].maxVectorPx.toFixed(1)} px: the vectors ${f(o[cn].vectors)} dB, the flow ${f(o[cn].flow)}, seeded ${f(o[cn].seeded)} (${d(o[cn].seeded, o[cn].flow)})`);
        ok(`  [webgpu] the seed is asked for and nothing else changes it: ${JSON.stringify(o.seedFlags).replace(/"/g, "")} -- and at 2 px, where it has nothing to bring, the frame is the unseeded one's to ${Math.abs(o.slow.seeded - o.slow.flow).toExponential(1)} dB`,
           o.seedFlags.flow === false && o.seedFlags.seeded === true && Math.abs(o.slow.seeded - o.slow.flow) < 0.01, "a vector of 2 px is 0 or 1 at the coarsest level, a quarter of the size, and the search around it finds what it found around zero");
        ok(`*** [webgpu] where the pan is fastest the seed pays on a reflection -- ${d(o.reflection44.seeded, o.reflection44.flow)} dB at ${o.reflection44.maxVectorPx.toFixed(0)} px -- and COSTS on the scrolling wall, ${d(o.scroll27.seeded, o.scroll27.flow)} at ${o.scroll27.maxVectorPx.toFixed(0)} px and ${d(o.scroll40.seeded, o.scroll40.flow)} at ${o.scroll40.maxVectorPx.toFixed(0)} ***`,
           o.reflection44.seeded - o.reflection44.flow >= 0.2 && o.scroll27.seeded < o.scroll27.flow && o.scroll40.seeded < o.scroll40.flow,
           "so `flow: { seed: true }` is there and is not the default: on the mirror it finds the shifts the pyramid cannot reach, and in these frames that is not what decides them -- what does was not measured here");
    }
}

// ---- v4758 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/opticalFlow.mjs, in render/opticalFlowTsl-selfcheck.mjs (the parity row, both backends) and
// render/flowCost-selfcheck.mjs: S1 the seed never scored -> 2, 1; S2 its validity ignored -> 2, 0; S3 read at the block's corner,
// not its centre -> 2, 0; S4 its sign flipped -> 2, 0.
// Against render/opticalFlowTsl.mjs, in render/opticalFlowTsl-selfcheck.mjs: T8 the seed's nodes made with the placeholder -> 4;
// T9 its validity ignored -> 2; T10 not taken to the level (not divided by the scale) -> 4; T11 a tie taken -> 0, EQUIVALENT:
// a seed tying the guess scores what standing still scores, and at the coarsest level standing still IS the guess.
// Against render/flowCost.mjs: K9 the seed not counted -> 1. Against fx/fsr/fsrFrameGenTsl.mjs, here: G19 the motion field not
// handed to the flow -> 1 (the flow refuses a seeded call without it); G20 the seed never asked for -> 2.
// *** S2, S3 AND T9 SCORED 0 FIRST, AND THE FIXTURE WAS WHY. *** Its invalid seed pixels carried a ZERO vector, which ties
// standing still and is never taken, validity or not; and its partly valid seed changed at a coarsest block's edge, where the
// block's centre and corner agree. An invalid pixel carries a junk (40, -30) now, and the seed is valid from x = 40, inside a
// block. S2 and T9 were also re-aimed: both files zero an invalid seed twice, so dropping one of the two changed nothing.
// *** AND THE FIRST SEEDED CALL SEARCHED UNSEEDED. *** The seed's texture nodes are made when the pass is BUILT, during the
// first flow() -- after that call had set the seed on the nodes that existed, which were none. They are made with the
// seed of the call that builds them now (T8 is the regression).
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHY the flow LOSES to the vectors at a 13 px pan with the texture scrolling -- 27.61 dB against 31.36, found " +
    "while measuring this -- and on a wall whose texture is stretched to 40 units wide, 28.25 against 36.98 at 2 px, on either block " +
    "grid: a low, anisotropic texture where the aperture problem lets a wrong shift explain the 3 x 3 window better. A later round's.");
process.exitCode = fails ? 1 : 0;
