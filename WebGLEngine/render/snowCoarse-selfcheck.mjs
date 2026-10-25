// WebGLEngine/render/snowCoarse-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowCoarse-selfcheck.mjs      (native; software adapter here)
//
// (The picture section runs FIRST on purpose: runWgslComputeNative makes a Dawn instance of its own, and one that is collected while the frame graph's device is live is the segfault headlessGpu.mjs's v4691 note measured.)
// GATES snow-beauty-pass-cost ITEM 3, the coarser forms of the detail layers and the haze (createSnowGpu's `coarseForms`, the COARSE_FORMS override). The rig put detail at 24% and aerial at 21% of the beauty pass at
// 720p on the Intel. Two changes, each with the reason it should not show:
//   AERIAL  applyAerialLean (render/aerial.mjs) is the upstream arithmetic with two reads removed: an extinction under 0.002 returns the colour (the mix moves it by under 0.2% of its distance to the sky), and the
//           crossfade reads only the sky sample that has weight (k is 0 under extinction 0.55, 1 over 0.995). Section 2 grades it on the GPU against applyAerial over a table of queries that visits all three branches.
//   DETAIL  the 0.31 layer (the one active across the whole view) fades out by a footprint of 0.45 m where it faded by 0.7, and is not read at a weight under 0.03 where it was read down to 0.001. That is a CHANGE of the
//           picture, a small one, so section 1 measures it against the exact picture in three views (the bound is 0.1/255 on average where removing the WHOLE detail term moves the orbit view by 1.33/255, measured once with the ablation: a cut that costs a tenth of the term is the most it may do) and the look gates (snowGpuLookA/B) are run with it on, below.
// THE LOOK GATES WITH IT ON (one-off, createSnowGpu's default temporarily flipped to coarseForms = true, then restored identical): snowGpu, snowGpuLookA, snowGpuLookB, snowGpuLive and snowGpuTaa all read `all passed`. This gate holds the arithmetic and the picture.
//
// SABOTAGES, RESULTS BY NAME (against render/aerial.mjs or snowGpu.mjs, this gate run, restored identical):
//   S1 applyAerialLean's early return raised to an extinction of 0.2                          -> 2 RED: the lean-against-exact row and the picture row (the haze is visibly cut)
//   S2 applyAerialLean reads the near sky only (the exact read dropped)                        -> 1 RED: the lean-against-exact row (hazed queries are the wrong colour)
//   S3 the detail layer's fade end pulled in from 0.45 to 0.15                                  -> 1 RED: the picture row (0.145/255 against the bound of 0.1; a cut at weight 0.6 instead read 0.037 and stayed green, which is why the fade end is the sabotage)
//   S4 createSnowGpu passes COARSE_FORMS: 0 whatever coarseForms says                          -> 1 RED: the coarse-reaches-the-picture row
//   S5 the default coarseForms put back to false                                              -> 2 RED: the shipped-defaults row and the reaches-the-picture row (the default graph IS the exact one)
"use strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, noteNativeAdapter, runWgslComputeNative, exitCleanly } from "../tools/ship/headlessGpu.mjs";
import * as A from "./aerial.mjs";
import * as SB from "./skyBake.mjs";
import { createSnowGpu } from "./snowGpu.mjs";
import { orbitAt } from "./snowFrameTiming.mjs";

const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const t0 = performance.now();

console.log("snowCoarse-selfcheck -- the detail layers and the haze, cheaper\n");
const skip = headlessGpuSkipReason(require_);

console.log("1. THE COARSE PICTURE AGAINST THE EXACT ONE");
if (skip) report("native half SKIPPED -- " + skip);
else {
    configureVulkanIcd();
    const { mod } = resolveWebgpu(require_);
    Object.assign(globalThis, mod.globals || {});
    const gpu = mod.create([]);   // reachable for the whole run (headlessGpu.mjs's v4691 note)
    const adapter = await gpu.requestAdapter();
    const info = adapter ? adapter.info || {} : {}, name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
    ok("a native adapter answered", !!adapter, name);
    if (adapter) {
        noteNativeAdapter(adapter, { gate: fileURLToPath(import.meta.url) });
        const device = await adapter.requestDevice();
        const W = 320, H = 180;
        const mk = async (coarseForms) => { const g = await createSnowGpu(device, { canvas: null, width: W, height: H, coarseForms }); g.state.taa = false; g.state.jitter = false; return g; };
        const exact = await mk(false), coarse = await mk(undefined);   // the DEFAULT graph: coarseForms is not passed
        const o4 = orbitAt(400);
        const views = {
            "the orbit, ground to the horizon": { focus: o4.focus, cam: o4.cam },
            "a low camera looking along the ground, the haze at work": { focus: { x: 0, z: 0 }, cam: { pos: [0, 1.6, 0], target: [300, 3, 120], fovY: 60 } },
            "a high camera looking down at the mid ground": { focus: { x: 0, z: 0 }, cam: { pos: [0, 45, 0], target: [60, 0, 40], fovY: 60 } },
        };
        const res = {};
        for (const [label, o] of Object.entries(views)) {
            const px = [];
            for (const g of [exact, coarse]) { g.state.frame = 100; await g.frame(1 / 60, o.focus, o.cam, { present: false }); g.state.frame = 101; px.push((await g.shot(1 / 60, o.focus, o.cam)).pixels); }
            let sum = 0, n = 0, big = 0, max = 0;
            for (let k = 0; k < px[0].length; k += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(px[0][k + c] - px[1][k + c]); sum += d; n++; if (d > 8) big++; if (d > max) max = d; }
            res[label] = { mean: sum / n, big: big / n, max };
            report(label + ": mean absolute difference " + (sum / n).toFixed(3) + "/255, largest " + max + ", " + (100 * big / n).toFixed(2) + "% of values over 8");
        }
        const worstMean = Math.max(...Object.values(res).map((v) => v.mean)), worstBig = Math.max(...Object.values(res).map((v) => v.big));
        ok("!! in three views the coarse picture is the exact one to within " + worstMean.toFixed(3) + "/255 on average (bound 0.1) with at most " + (worstBig * 100).toFixed(2) + "% of values off by more than 8 (bound 0.05%)", worstMean < 0.1 && worstBig < 0.0005);
        ok("the coarse forms REACH the picture: at least one view is not identical (a pipeline that ignored coarseForms would read zero)", worstMean > 0.001, "worst mean " + worstMean.toFixed(4));
        ok("!! THE SHIPPED DEFAULTS (v4897, after the Intel and GTX 1080 readings): a graph made with no form options has the coarse forms ON (saves 9.4% / 6.4% of the beauty pass), the hardware TAA history ON (-33% / -36% of the taa pass) and the hoist OFF (slower on the Intel at 720p, noise on the 1080)", coarse.stats.coarseForms === true && coarse.stats.taaHwHistory === true && coarse.stats.hoistFine === false && exact.stats.coarseForms === false);
        ok("neither frame graph raised a GPU error", exact.errors.length === 0 && coarse.errors.length === 0, [...exact.errors, ...coarse.errors].slice(0, 2).join(" | ").slice(0, 200));
        report("reading snowCoarse: native " + W + "x" + H + " worst mean difference " + worstMean.toFixed(3) + "/255, worst share over 8 " + (worstBig * 100).toFixed(2) + "%; adapter " + name + "; gate wall time " + ((performance.now() - t0) / 1000).toFixed(1) + " s");
    }
}

console.log("\n2. applyAerialLean AGAINST applyAerial, ON THE GPU");
if (skip) {
    report("native half SKIPPED -- " + skip);
    report("*** THAT IS A SKIP AND NOT A PASS: neither kernel ran");
} else {
    const W = 64, H = 32, SUN = SB.sunFrom(13, 60), SUNC = [3, 2.85, 2.55], chain = SB.buildSkyMips(SB.bakeSky(W, H, SUN, 20, [0.55, 0.62, 0.74]), W, H);
    let seed = 77; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const N = 300, Q = new Float32Array(N * A.AERIAL_QSTRIDE), exts = [];
    for (let i = 0; i < N; i++) {
        const az = r() * 360, el = r() * 40 - 3, d = [Math.cos(el * Math.PI / 180) * Math.sin(az * Math.PI / 180), Math.sin(el * Math.PI / 180), Math.cos(el * Math.PI / 180) * Math.cos(az * Math.PI / 180)];
        const dist = 5 + Math.pow(r(), 2) * 4000, density = 0.0004 + r() * 0.006, col = [r() * 3, r() * 3, r() * 3], cam = [0, 1 + r() * 4, 0], world = [d[0] * dist, Math.max(0, cam[1] + d[1] * dist), d[2] * dist];
        Q.set([...col, ...cam, ...world, ...d, ...SUN, ...SUNC, density, 0.012, 12, 1], i * A.AERIAL_QSTRIDE);
        exts.push(1 - Math.pow(SB.aerialTransmittance(cam, world, density, 0.012, 12), 1));
    }
    const lo = exts.filter((e) => e < 0.002).length, mid = exts.filter((e) => e >= 0.002 && e < 0.995 && e >= 0.55).length, clear = exts.filter((e) => e >= 0.002 && e < 0.55).length, hi = exts.filter((e) => e >= 0.995).length;
    ok("the table visits every branch: " + lo + " queries under the early-out, " + clear + " in the clear (near sky only), " + mid + " in the crossfade, " + hi + " at total extinction (exact sky only)", lo >= 10 && clear >= 10 && mid >= 10 && hi >= 10);
    const run = (code) => runWgslComputeNative({ code, outCount: N * 3, inputs: [{ binding: 1, data: chain }, { binding: 2, data: Q }], workgroups: Math.ceil(N / 64), requireFn: require_ });
    const exact = await run(A.AERIAL_KERNEL_WGSL), lean = await run(A.AERIAL_LEAN_KERNEL_WGSL);
    if (!exact.ok || !lean.ok) ok("!! both aerial kernels run", false, [exact.reason, lean.reason, ...(exact.errors || []), ...(lean.errors || [])].filter(Boolean).join(" | ").slice(0, 300));
    else {
        let worstCut = 0, worstRest = 0;
        for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
            const d = Math.abs(exact.values[i * 3 + c] - lean.values[i * 3 + c]), scale = Math.max(Math.abs(exact.values[i * 3 + c]), 0.05);
            if (exts[i] < 0.002) worstCut = Math.max(worstCut, d / scale); else worstRest = Math.max(worstRest, d / scale);
        }
        ok("!! the lean haze is the exact haze: under the early-out the colour differs by at most " + (worstCut * 100).toFixed(3) + "% (bound 0.5%), and everywhere else by " + (worstRest * 100).toExponential(1) + "% (the same arithmetic; bound 0.001%)", worstCut < 5e-3 && worstRest < 1e-5 && !lean.wroteNothing, "adapter " + ((lean.adapter && lean.adapter.description) || "?"));
    }
}

console.log(`\nsnowCoarse-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: what the coarse forms SAVE on a real GPU (a software rasteriser's split is a CPU's) -- `takeSnowFrameTiming.mjs --ablate --terms coarse` on the rig; and how they LOOK at 4K, where the detail cut sits at a different distance.");
exitCleanly(fails === 0 ? 0 : 1);
