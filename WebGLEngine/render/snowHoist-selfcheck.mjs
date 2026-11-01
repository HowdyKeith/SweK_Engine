// WebGLEngine/render/snowHoist-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowHoist-selfcheck.mjs      (native, software adapter here: two frame graphs, two shots each)
//
// GATES snow-beauty-pass-cost ITEM 2, the fine-relief hoist: render/snowGpu.mjs can read the two SLOW fields of the fine relief (windLocal's veer and stretch, and the scour) from the vertex stage, interpolated, instead of
// evaluating their noise at every pixel (the HOIST_FINE override, createSnowGpu's `hoistFine`). Hoisted values are an approximation, so this gate is what says how good: (1) the hoisted copy of the filtered relief
// (snowFine's terrainFineFilteredWith) is the upstream body with exactly two lines swapped for its arguments -- it cannot drift from the function the twin grades; (2) the hoisted picture against the exact one, near the
// origin and 3 km out; (3) the vertex stage really writes the fields (a hoist that reaches nothing reads as "free and identical").
// THE MEASURED SHAPE, said plainly because it decides whether this ships on: the fields are interpolated and then multiplied by the WORLD position (windMat(w + veer) * p turns an angle error into a phase error of
// |p| / 2.3 times the angle), so the picture agrees to a hair near the origin and the sastrugi RIDGES SLIDE sideways a little the farther out the camera is: mean 0.006/255 near the origin, 0.67/255 at 3 km, 1.2/255 at 30 km
// (this gate prints the first two). It is a shift of the pattern, never a hole or a seam; whether the saving justifies it is the rig's `takeSnowFrameTiming --ablate --terms hoist`, never this gate.
//
// SABOTAGES, RESULTS BY NAME (each against render/snowGpu.mjs or snowFine.mjs, this gate run, restored identical):
//   S1 createSnowGpu passes HOIST_FINE: 0 whatever hoistFine says                       -> 1 RED: the hoist-reaches-the-picture row (the two pictures are identical at 3 km; the agreement rows stay green, as they should)
//   S2 the vertex stage writes vec3f(0.0) for the fields while hoisting                 -> 3 RED: the call-site row and the near and far agreement rows (veer 0, stretch 0, scour 0 is a different relief)
//   S3 terrainFineFilteredWith's sastrugi amplitude 0.125 altered to 0.13               -> 1 RED: the same-function row
//   S4 the fragment reads the fields swapped (wl.yx)                                    -> 3 RED: the call-site row (it reads the call as written) and the near and far agreement rows
"use strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, noteNativeAdapter, exitCleanly } from "../tools/ship/headlessGpu.mjs";
import { FINE_TERRAIN_WGSL } from "./snowFine.mjs";
import { createSnowGpu, TERRAIN_VERTEX_WGSL, BEAUTY_WGSL } from "./snowGpu.mjs";
import { orbitAt } from "./snowFrameTiming.mjs";

const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const t0 = performance.now();

console.log("snowHoist-selfcheck -- the fine relief's slow fields from the vertex stage\n");

console.log("1. THE HOISTED COPY IS THE UPSTREAM FUNCTION WITH TWO LINES SWAPPED");
{
    const grab = (src, name) => { const i = src.indexOf("fn " + name + "("); if (i < 0) return null; const j = src.indexOf("\n}\n", i); return src.slice(i, j + 3); };
    const up = grab(FINE_TERRAIN_WGSL, "terrainFineFiltered"), mine = grab(FINE_TERRAIN_WGSL, "terrainFineFilteredWith");
    // the header is rewritten by pattern (the name, then the arguments it already has, then the two it is given), not by quoting a signature: a gate that quotes a whole WGSL signature reads to render/shaderEmitters.mjs's census as an emitter of shader text, which it is not
    const derived = up && up.replace(/^fn terrainFineFiltered\(([^)]*)\)/, (m, args) => "fn terrainFineFilteredWith(" + args + ", wl: vec2f, scour: f32)")
        .replace("    let wl = windLocal(p);\n", "").replace("        let scour = 0.45 + 0.55 * smoothstep(-0.25, 0.35, noise2(p * 0.021));\n", "");
    ok("!! terrainFineFilteredWith equals terrainFineFiltered with its signature widened by (wl, scour) and the two lines that computed them removed -- character for character", !!mine && mine === derived, mine && derived && mine !== derived ? "first difference at char " + [...mine].findIndex((c, i) => c !== derived[i]) : "");
    const scour = grab(FINE_TERRAIN_WGSL, "scourAt");
    ok("scourAt is the scour expression the upstream body holds, and the vertex stage and the fragment both call the hoisted pair", !!scour && /0\.45 \+ 0\.55 \* smoothstep\(-0\.25, 0\.35, noise2\(p \* 0\.021\)\)/.test(scour) && /windLocal\(s\.world\.xz\), scourAt\(s\.world\.xz\)/.test(TERRAIN_VERTEX_WGSL) && /terrainFineFilteredWith\(p, F\.wind\.x, exposure, F\.wind\.y, footprint, wl\.xy, wl\.z\)/.test(BEAUTY_WGSL));
    ok("both stages declare the override and the vertex output carries the fields at location 3", /override HOIST_FINE: bool/.test(TERRAIN_VERTEX_WGSL) && /override HOIST_FINE: bool/.test(BEAUTY_WGSL) && /@location\(3\) fineWl: vec3f/.test(TERRAIN_VERTEX_WGSL) && /@location\(3\) fineWl: vec3f/.test(BEAUTY_WGSL));
}

const skip = headlessGpuSkipReason(require_);
console.log("\n2. THE HOISTED PICTURE AGAINST THE EXACT ONE");
if (skip) {
    report("native half SKIPPED -- " + skip);
    report("*** THAT IS A SKIP AND NOT A PASS: no frame was drawn with the hoist on");
} else {
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
        const mk = async (hoistFine) => { const g = await createSnowGpu(device, { canvas: null, width: W, height: H, hoistFine }); g.state.taa = false; g.state.jitter = false; return g; };
        const exact = await mk(false), hoist = await mk(true);
        const view = (off) => { const o = orbitAt(400); return { focus: { x: o.focus.x + off, z: o.focus.z + off }, cam: { ...o.cam, pos: [o.cam.pos[0] + off, o.cam.pos[1], o.cam.pos[2] + off], target: [o.cam.target[0] + off, o.cam.target[1], o.cam.target[2] + off] } }; };
        const compare = async (off) => {
            const o = view(off), px = [];
            for (const g of [exact, hoist]) { g.state.frame = 100; await g.frame(1 / 60, o.focus, o.cam, { present: false }); g.state.frame = 101; px.push((await g.shot(1 / 60, o.focus, o.cam)).pixels); }
            let sum = 0, n = 0, big = 0, max = 0;
            for (let k = 0; k < px[0].length; k += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(px[0][k + c] - px[1][k + c]); sum += d; n++; if (d > 8) big++; if (d > max) max = d; }
            return { mean: sum / n, big: big / n, max };
        };
        const near = await compare(0), far = await compare(3000);
        report("hoisted against exact, mean absolute difference per channel (of 255): near the origin " + near.mean.toFixed(3) + " (largest " + near.max + ", " + (near.big * 100).toFixed(2) + "% of values over 8), 3 km out " + far.mean.toFixed(3) + " (largest " + far.max + ", " + (far.big * 100).toFixed(2) + "% over 8)");
        ok("!! near the origin the hoisted picture is the exact one to a hair: mean difference " + near.mean.toFixed(3) + "/255 (bound 0.2) and under 0.1% of values off by more than 8", near.mean < 0.2 && near.big < 0.001);
        ok("!! 3 km out, where the world-position product turns the interpolated angle into a sliding ridge, it is still the same picture: mean " + far.mean.toFixed(3) + "/255 (bound 2) and under 3% of values off by more than 8", far.mean < 2 && far.big < 0.03);
        ok("the hoist REACHES the picture: 3 km out the two are not identical (a pipeline that ignored hoistFine would read zero here)", far.mean > 0.01, "mean " + far.mean.toFixed(3));
        ok("neither frame graph raised a GPU error", exact.errors.length === 0 && hoist.errors.length === 0, [...exact.errors, ...hoist.errors].slice(0, 2).join(" | ").slice(0, 200));
        report("reading snowHoist: native " + W + "x" + H + " mean difference " + near.mean.toFixed(3) + "/255 near, " + far.mean.toFixed(3) + "/255 at 3 km; adapter " + name + "; gate wall time " + ((performance.now() - t0) / 1000).toFixed(1) + " s");
    }
}

console.log(`\nsnowHoist-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: what the hoist SAVES on a real GPU (the sandbox's adapter is a software rasteriser) -- that is `takeSnowFrameTiming.mjs --ablate --terms hoist` on the rig, never this gate.");
exitCleanly(fails === 0 ? 0 : 1);
