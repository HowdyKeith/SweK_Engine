#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrFlowCost-selfcheck.mjs -- v4748
//
// WHAT THE OPTICAL FLOW COSTS ON THE DEVICE, HELD TO render/flowCost.mjs's COUNT. Each setting's flow -- both pyramids and the
// search, render/opticalFlowTsl.mjs -- timed at 256 x 256 as the median of five, the queue drained before and after
// (GPUQueue.onSubmittedWorkDone), and its time against the default's held to its reads against the default's.
//
// *** THIS DEVICE IS SWIFTSHADER, A CPU RASTERISER, AND THE MILLISECONDS ARE ITS OWN. *** They are not a GPU's, and one
// thing here is upside down on a GPU: the generator's splat -- 65 536 instanced quads at this size -- costs a CPU rasteriser
// far more than the flow does. That is reported, not asserted as a property of the method. What IS asserted is that the
// flow's time follows its read count across settings, which is what makes the count worth trusting where there is no GPU
// to time.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { flowCostModel } from "../../render/flowCost.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const W = 256, H = 256, REP = 5;
const SETTINGS = { default: {}, refine2: { refineRadius: 2 }, refine1: { refineRadius: 1 }, radius2: { searchRadius: 2 }, levels2: { levels: 2 } };

console.log("\n1. ON THE DEVICE: the flow's time under five settings, against its reads");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { W, H, REP, SETTINGS }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const TT = await import("/render/temporalTsl.mjs"); const FG = await import("/fx/fsr/fsrFrameGenTsl.mjs"); const OF = await import("/render/opticalFlowTsl.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                const { W, H } = a, canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const dev = renderer.backend.device, drained = () => dev.queue.onSubmittedWorkDone();
                const tgt = () => new THREE.RenderTarget(W, H, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 220, 24), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const setT = (k) => { const t = k / 60 * 6; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); };
                const median = async (f, n = a.REP) => { await f(); const xs = []; for (let i = 0; i < n; i++) { await drained(); const t0 = performance.now(); await f(); await drained(); xs.push(performance.now() - t0); }
                    xs.sort((p, q) => p - q); return xs[xs.length >> 1]; };
                const A = tgt(), B = tgt(), outT = tgt(), stage = TT.makeMotionStage(THREE, T, { w: W, h: H, gl: TT.glClip(THREE, renderer) });
                setT(0); renderer.setRenderTarget(A); await renderer.renderAsync(scene, cam); await stage.render(renderer, scene, cam);
                setT(1); renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam); await stage.render(renderer, scene, cam);
                const o = { flow: {} };
                for (const [nm, s] of Object.entries(a.SETTINGS)) {
                    const F = OF.makeOpticalFlow(THREE, T, { w: W, h: H, ...s });
                    o.flow[nm] = await median(() => F.flow(renderer, B.texture, A.texture)); F.dispose();
                }
                // the generator itself, vectors only, and the scene's own render: this device's proportions, reported
                const g = FG.makeFrameGen(THREE, T, { w: W, h: H }), inputs = { prev: A.texture, cur: B.texture, motion: stage.motion.texture, depth: stage.depth.texture };
                await g.generate(renderer, inputs, outT);
                o.generate = await median(() => g.generate(renderer, inputs, outT), 3);
                o.scene = await median(async () => { renderer.setRenderTarget(B); await renderer.renderAsync(scene, cam); });
                g.dispose(); stage.dispose(); for (const t of [A, B, outT]) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every setting", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, model = Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, flowCostModel({ w: W, h: H, ...s })]));
        const rows = Object.keys(SETTINGS).map((k) => ({ k, ms: o.flow[k], reads: model[k].search + model[k].pyramid, tr: o.flow[k] / o.flow.default, rr: (model[k].search + model[k].pyramid) / (model.default.search + model.default.pyramid) }));
        for (const x of rows) say(`${x.k.padEnd(8)} ${x.ms.toFixed(1)} ms, ${(x.reads / 1e6).toFixed(1)}M reads -- ${(x.tr * 100).toFixed(0)}% of the default's time, ${(x.rr * 100).toFixed(0)}% of its reads; reach by the sum ${model[x.k].reach} px`);
        const worst = Math.max(...rows.map((x) => Math.abs(x.tr / x.rr - 1)));
        ok(`*** the flow's time on the device follows its read count: every setting's share of the default's time within ${(worst * 100).toFixed(0)}% of its share of the reads -- ${rows.slice(1).map((x) => `${x.k} ${(x.tr * 100).toFixed(0)}% / ${(x.rr * 100).toFixed(0)}%`).join(", ")} ***`,
           worst < 0.2 && rows.every((x) => x.ms > 0), "the search is texture reads and nothing else, so on any device its time should scale with them; on this one it does, which is what the count is for where there is no GPU to time");
        say(`this device's proportions, reported and not asserted of the method: the flow ${o.flow.default.toFixed(0)} ms, generating a frame from the vectors alone ${o.generate.toFixed(0)} ms, rendering the scene ${o.scene.toFixed(1)} ms -- a CPU rasteriser pays for the splat's ${W * H} instanced quads what a GPU does not`);
        ok(`  ...so the count can say what the page's flow costs a generated frame, where nothing times it: ${(flowCostModel({ w: 960, h: 540 }).total / 1e6).toFixed(0)}M at 960 x 540, ${(flowCostModel({ w: 960, h: 540, refineRadius: 2 }).total / 1e6).toFixed(0)}M refining within 2`,
           flowCostModel({ w: 960, h: 540, refineRadius: 2 }).total < 0.6 * flowCostModel({ w: 960, h: 540 }).total, "fsr-three.html's frame-generation views print it when the flow is on");
    }
}

// ---- v4748 SABOTAGE LOG ----------------------------------------------------------------------------------------
// render/opticalFlowTsl.mjs ignoring the refinement radius (T4) -> 1 here -- every refining setting then takes the default's
// time and not its reads' share -- and 2 in render/opticalFlowTsl-selfcheck.mjs, whose v4748 cases it no longer matches.
// fx/fsr/fsrFrameGenTsl.mjs dropping `refineRadius` (G17) -> 1 in fx/fsr/fsrFrameGenFlow-selfcheck.mjs, whose arms row reads it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a GPU, where the splat's cost against the flow's is not this device's -- nothing in this sandbox has one; " +
    "and the time of the reconciliation and the fill, which are a few reads a pixel and were not worth timing against the search.");
process.exitCode = fails ? 1 : 0;
