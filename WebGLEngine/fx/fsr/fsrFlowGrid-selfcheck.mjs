#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFlowGrid-selfcheck.mjs -- v4753
//
// THE OPTICAL FLOW WITH EACH LEVEL ON ITS OWN BLOCK GRID, IN THE GENERATOR. render/opticalFlow.mjs's `grid: "level"` gives
// each level of the pyramid a quarter of the blocks of the one below, each covering exactly the blocks below it, where the
// search had run every level on the finest grid with each coarse patch anchored at its block's corner. On the mirror it
// finds the same shifts for 46 % of the search's reads and follows a zoom, a turn and two motions better
// (render/flowCost-selfcheck.mjs); on this device its time follows its reads (fx/fsr/fsrFlowCost-selfcheck.mjs). What it is
// worth in a generated frame is measured here, and it is why fx/fsr/fsrFrameGenTsl.mjs's flow runs on it by default.
//
// fx/fsr/fsrFrameGenFlow-selfcheck.mjs's knot turning in front of a wall whose texture scrolls, each case a frame generated
// between two and graded against the frame rendered at the midpoint (4 x 4 supersampled), the camera's own motion given:
//   scroll       the texture scrolling behind the knot, the camera still
//   panScroll    the same under a pan
//   dollyScroll  the camera moving in, so the wall's motion grows from the centre out -- a zoom
//   dollyFast    moving in twice as fast, the knot turning at six times the page's rate, the texture still
// and three arms, each the generator with `flow`: { grid: "block" }, the search to v4752; {}, the level grid; and
// { refineRadius: 2 } on it.
// *** WEBGPU ONLY. *** render/opticalFlowTsl-selfcheck.mjs holds the level grid to the mirror at every block on both backends.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { flowCostModel } from "../../render/flowCost.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128, CASES = ["scroll", "panScroll", "dollyScroll", "dollyFast"];

console.log("\n1. ON THE DEVICE: the flow on either grid, in a generated frame");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const D = a.D, canvas = document.createElement("canvas"); canvas.width = D; canvas.height = D;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const tgt = (n) => new THREE.RenderTarget(n, n, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (t, n) => await renderer.readRenderTargetPixelsAsync(t, 0, 0, n, n);
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const scroll = T.uniform(0.0), wm = new THREE.MeshBasicNodeMaterial();
                wm.colorNode = T.Fn(() => { const q = T.vec2(T.uv().x.mul(14.0).add(scroll), T.uv().y.mul(8.0)).mul(1.6);
                    const n3 = T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).add(T.mx_noise_vec3(T.vec3(q.x.mul(2.1), q.y.mul(2.1), 4.1)).mul(0.5));
                    return T.vec3(0.5).add(n3.mul(0.3)); })();
                const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), wm); wall.position.z = -2; scene.add(wall);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50), gl = TT.glClip(THREE, renderer);
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                const arms = { block: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { grid: "block" } }), level: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }),
                               levelR2: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { refineRadius: 2 } }) };
                const A = tgt(D), B = tgt(D), out2 = tgt(D), big = tgt(D * 4), cl = (v) => Math.min(1, Math.max(0, v));
                const o = { grids: Object.fromEntries(Object.entries(arms).map(([k, g]) => [k, g.opticalFlow.grid])) };
                for (const [cn, sc, spin, pan, dolly] of [["scroll", 0.12, 6, 0, 0], ["panScroll", 0.12, 1, 0.05, 0], ["dollyScroll", 0.12, 1, 0, 0.3], ["dollyFast", 0, 6, 0, 0.6]]) {
                    const setT = (k) => { const t = k / 60 * spin; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); scroll.value = k * sc;
                        cam.position.set(k * pan, 0.6, 5.2 - k * dolly); cam.lookAt(k * pan, 0, 0); cam.updateMatrixWorld(); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam);
                    setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam);
                    const t4 = await read(big, D * 4), truth = new Float32Array(D * D * 4);
                    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const psnr = (img) => { let q = 0; for (let i = 0; i < D * D; i++) for (let ch = 0; ch < 3; ch++) q += (cl(img[i * 4 + ch]) - cl(truth[i * 4 + ch])) ** 2; return 10 * Math.log10(1 / (q / (D * D * 3))); };
                    const c = {};
                    for (const [an, g] of Object.entries(arms)) {
                        // primed with frame 0's own field, so the older depth is frame 0's, as it is in use
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: stage.camera.texture }, out2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: stage.camera.texture }, out2);
                        c[an] = psnr(await read(out2, D));
                    }
                    o[cn] = c;
                }
                for (const g of Object.values(arms)) g.dispose(); stage.dispose(); for (const t of [A, B, out2, big]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        const reads = (s) => flowCostModel({ w: D, h: D, ...s }).search, share = (s) => reads(s) / reads({});
        for (const cn of CASES) say(`${cn.padEnd(12)} block grid ${f(o[cn].block)} dB, level grid ${f(o[cn].level)} (${d(o[cn].level, o[cn].block)}), refining within 2 on it ${f(o[cn].levelR2)} (${d(o[cn].levelR2, o[cn].block)})`);
        ok(`  [webgpu] the generator's flow is on the level grid unless asked otherwise: ${JSON.stringify(o.grids).replace(/"/g, "")}`,
           o.grids.block === "block" && o.grids.level === "level" && o.grids.levelR2 === "level", "fx/fsr/fsrFrameGenTsl.mjs passes { grid: flow.grid ?? \"level\" } to render/opticalFlowTsl.mjs");
        ok(`*** [webgpu] each level on its own grid makes no case worse and the scrolling ones better -- ${CASES.map((cn) => `${cn} ${d(o[cn].level, o[cn].block)}`).join(", ")} dB -- for ${(share({ grid: "level" }) * 100).toFixed(0)}% of the search's reads here ***`,
           CASES.every((cn) => o[cn].level >= o[cn].block - 0.03) && o.scroll.level - o.scroll.block >= 0.1 && o.panScroll.level - o.panScroll.block >= 0.1,
           "the block grid's coarse patch measured the motion 12 pixels from its block (render/flowCost-selfcheck.mjs's zoom, turn and two motions); here is what that cost a generated frame");
        ok(`  [webgpu] ...and refining within 2 on it is no worse than the block grid's full search on any case either -- ${CASES.map((cn) => `${cn} ${d(o[cn].levelR2, o[cn].block)}`).join(", ")} -- for ${(share({ grid: "level", refineRadius: 2 }) * 100).toFixed(0)}%`,
           CASES.every((cn) => o[cn].levelR2 >= o[cn].block - 0.05), "fsr-three.html's 'cheaper flow' is this");
    }
}

// ---- v4753 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/opticalFlow.mjs, in render/flowCost-selfcheck.mjs and render/opticalFlowTsl-selfcheck.mjs (whose parity row
// reads a sabotaged mirror against the device's search, both backends):
//   M1 the level grid's origin the block grid's      -> 2, 2     M5 a neighbour taken on a tie            -> 0, 2
//   M2 the parent read at the block's own index      -> 1, 2     M6 every level on the finest grid's size -> 1, 2
//   M3 the neighbours never scored                   -> 2, 4     M7 one guess read counted, not four      -> 1, 0
//   M4 the neighbours on the far side                -> 0, 2
// Against render/flowCost.mjs, in render/flowCost-selfcheck.mjs: K6 the level grid counted on the finest grid -> 2; K7 one
// guess, not four -> 1.
// Against render/opticalFlowTsl.mjs, in render/opticalFlowTsl-selfcheck.mjs and here:
//   T1 the parent read at the block's own index      -> 2, 0     T5 the level grid's origin the block grid's -> 2, 2
//   T2 the neighbours never scored                   -> 2, 0     T6 a neighbour taken on a tie             -> 2, 0
//   T3 the neighbours on the far side                -> 2, 0     T7 every level's target at the finest size -> 0, 0
//   T4 the neighbours not clamped                    -> 2, 0        (WebGPU 1 block, WebGL2 13: Dawn clamps a load itself)
// *** T7 IS NO ANSWER'S AND THE ANSWER WAS NEVER WHERE IT WOULD SHOW. *** Every level drawn into a target the finest grid's size
// computes blocks past the level's own grid that nothing reads -- the parent is at half the index and its neighbours are
// clamped to the level's grid -- so every vector is the same. What it changes is the cost, and fx/fsr/fsrFlowCost-selfcheck.mjs
// is where the cost is held to the reads: 1 red there, the level grid's time no longer its reads' share.
// Against fx/fsr/fsrFrameGenTsl.mjs: G18 the flow on the block grid by default -> 2 here.
// And fx/fsr/fsrFrameGenFlow-selfcheck.mjs's refinement row was TWO-SIDED -- within 0.1 dB of the full window -- and went red
// with the level grid the default: refining within 2 came out 0.14 dB ABOVE it where the texture scrolls. It is one-sided now,
// which is what it was for.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a fourth level, which the level grid makes cheap -- 47 % of the block grid's reads with three at 256 x 160, " +
    "finding 36 pixels of shift at 92 % of blocks -- and which on BOTH grids loses a small square moving across a background: it is " +
    "coarser than the square, and the square's own motion is outside the window its guess leaves (render/flowCost-selfcheck.mjs " +
    "does not grade it, and fast motion is a later round's); and a GPU's time, where fx/fsr/fsrFlowCost-selfcheck.mjs holds only this device's.");
process.exitCode = fails ? 1 : 0;
