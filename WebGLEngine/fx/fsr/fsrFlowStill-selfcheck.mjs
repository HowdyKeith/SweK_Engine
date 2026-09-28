#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFlowStill-selfcheck.mjs -- v4759
//
// A SMALL THING THAT MOVES OTHERWISE THAN WHAT IS BEHIND IT, IN THE GENERATOR. render/flowCost-selfcheck.mjs (section 5) measures
// the flow's pyramid losing it: at the coarse levels its blocks are mostly background and take the background's motion, and
// the windows below reach 12 px back from that. `stillGuess` (render/opticalFlow.mjs, v4759) scores standing still as a guess at
// every level below the coarsest, for 1.1 % more reads: a still 16 or 24 px square over a background moving 16 px goes from 0 of
// its blocks right to all of them. What that is worth in a generated frame is measured here, on the case it is for where the
// application's vectors are WRONG -- a still highlight on a moving surface, a lamp's reflection on a conveyor: the belt moves 8 or
// 16 px a frame and its vectors carry it, the highlight (radius 0.25 world units) stays where it is. Three arms: the vectors, the
// flow, and the flow with standing still guessed; graded against the midpoint, over the frame and over the highlight's pixels.
// *** IT IS WORTH NOTHING HERE, SO IT IS NOT THE DEFAULT. *** The flow already finds the highlight or does not for other reasons.
// *** WEBGPU ONLY. *** render/opticalFlowTsl-selfcheck.mjs holds `stillGuess` to the mirror at every block on both backends.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const D = 128;

console.log("\n1. ON THE DEVICE: a still highlight on a moving belt");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { D }, script: `async (a) => {
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
                const stage = TT.makeMotionStage(THREE, T, { w: D, h: D, gl, camera: true });
                const arms = { vectors: FG.makeFrameGen(THREE, T, { w: D, h: D }), flow: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: {} }), still: FG.makeFrameGen(THREE, T, { w: D, h: D, flow: { stillGuess: true } }) };
                const A = tgt(D), B = tgt(D), o2 = tgt(D), big = tgt(D * 4);
                const o = { flags: { flow: arms.flow.opticalFlow.stillGuess, still: arms.still.opticalFlow.stillGuess } };
                for (const [cn, speed] of [["belt8", 0.33], ["belt16", 0.66]]) {
                    // the belt: a noise texture on a plane that translates, and a highlight fixed in the world -- a lamp's reflection
                    const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06), m = new THREE.MeshBasicNodeMaterial();
                    m.colorNode = T.Fn(() => { const q = T.uv().mul(T.vec2(14.0, 8.0)).mul(1.6), base = T.vec3(0.4).add(T.mx_noise_vec3(T.vec3(q.x, q.y, 0.37)).mul(0.25));
                        const d = T.positionWorld.xy.sub(T.vec2(0.3, 0.2)); return base.add(T.vec3(0.9, 0.85, 0.6).mul(T.exp(d.dot(d).div(-0.0625)))); })();
                    const belt = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), m); scene.add(belt);
                    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                    const setT = (k) => { belt.position.x = k * speed; belt.updateMatrixWorld(); };
                    setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam);
                    setT(0.5); renderer.setRenderTarget(big); await renderer.renderAsync(scene, cam); const t4 = await read(big, D * 4);
                    const truth = new Float32Array(D * D * 4); for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < 3; c++) { let s = 0;
                        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) s += t4[((y * 4 + sy) * D * 4 + x * 4 + sx) * 4 + c]; truth[(y * D + x) * 4 + c] = s / 16; }
                    const hl = Uint8Array.from({ length: D * D }, (_, i) => (truth[i * 4] > 0.75 ? 1 : 0));
                    const ps = (img, mk) => { let q = 0, n = 0; for (let i = 0; i < D * D; i++) { if (mk && !mk[i]) continue; n++; for (let c = 0; c < 3; c++) q += (cl(img[i * 4 + c]) - cl(truth[i * 4 + c])) ** 2; } return 10 * Math.log10(1 / (q / (n * 3))); };
                    const c = { hlPx: hl.reduce((q, v) => q + v, 0) };
                    for (const [an, g] of Object.entries(arms)) {
                        setT(-1); await stage.render(renderer, scene, cam); setT(0); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: A.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: g.reconcile ? stage.camera.texture : null }, o2);
                        setT(1); await stage.render(renderer, scene, cam);
                        await g.generate(renderer, { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture, camera: g.reconcile ? stage.camera.texture : null }, o2);
                        const img = await read(o2, D); c[an] = { all: ps(img), hl: ps(img, hl) };
                    }
                    o[cn] = c;
                }
                for (const g of Object.values(arms)) g.dispose(); stage.dispose(); for (const t of [A, B, o2, big]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran both belts", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (v) => v.toFixed(2), d = (x, y) => (x - y >= 0 ? "+" : "") + (x - y).toFixed(2);
        for (const cn of ["belt8", "belt16"]) say(`${cn}: the highlight's ${o[cn].hlPx} pixels -- vectors ${f(o[cn].vectors.hl)} dB, the flow ${f(o[cn].flow.hl)}, standing still guessed ${f(o[cn].still.hl)}; the frame ${f(o[cn].vectors.all)}, ${f(o[cn].flow.all)}, ${f(o[cn].still.all)}`);
        ok(`  [webgpu] the generator asks for standing still only when told: ${JSON.stringify(o.flags).replace(/"/g, "")}`, o.flags.flow === false && o.flags.still === true,
           "fx/fsr/fsrFrameGenTsl.mjs passes { stillGuess: !!flow.stillGuess } to render/opticalFlowTsl.mjs");
        ok(`*** [webgpu] the flow finds the still highlight the belt's vectors drag -- ${d(o.belt8.flow.hl, o.belt8.vectors.hl)} and ${d(o.belt16.flow.hl, o.belt16.vectors.hl)} dB on its pixels -- and standing still guessed adds ${d(o.belt8.still.hl, o.belt8.flow.hl)} and ${d(o.belt16.still.hl, o.belt16.flow.hl)} ***`,
           o.belt8.flow.hl - o.belt8.vectors.hl > 3 && o.belt16.flow.hl - o.belt16.vectors.hl > 1 && Math.abs(o.belt8.still.hl - o.belt8.flow.hl) < 0.05 && Math.abs(o.belt16.still.hl - o.belt16.flow.hl) < 0.05,
           "so `flow: { stillGuess: true }` is there and is not the default: what it rescues on the mirror is not what limits a generated frame here -- what does was not measured");
    }
}

// ---- v4759 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/opticalFlow.mjs, in render/flowCost-selfcheck.mjs and render/opticalFlowTsl-selfcheck.mjs (the parity row, both
// backends): V1 standing still never guessed -> 3, 4; V2 guessed at the coarsest level too -> 1, 0 -- the count only: the
// coarsest level's first guess IS standing still, so a second look at it is never strictly better; V3 a tie taken -> 0, 0.
// Against render/opticalFlowTsl.mjs: T12 never guessed -> 4; T13 at the coarsest level too -> 0 and T14 a tie taken -> 0.
// *** V2, T13, V3 AND T14 ARE EQUIVALENT, AND WHY. *** At the coarsest level the guess is zero -- or the seed, which only replaces
// it by beating it -- so standing still scored there again ties what it tied; and a tie between standing still and a guess
// that is NOT standing still needs two different windows to score to the bit the same, which a textured frame does not give.
// T13 still costs the device a score a block, which no gate here times.
// Against render/flowCost.mjs: K10 standing still not counted -> 1. Against fx/fsr/fsrFrameGenTsl.mjs, here: G21 never asked
// for -> 1.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what limits the highlight's frame at 16 px of belt, 11.9 dB on its pixels. A small thing MOVING fast over a " +
    "still background, which standing still does not find, v4768 measured with the flow's retry: fx/fsr/fsrFlowRetry-selfcheck.mjs.");
process.exitCode = fails ? 1 : 0;
