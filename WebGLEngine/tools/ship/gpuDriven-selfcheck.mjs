#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuDriven-selfcheck.mjs -- v4299 (Level 11)
//
// GRADES render/gpuDriven.mjs: COMPUTE CULL + LOD + drawIndexedIndirect, AGAINST ITS CPU TWIN, ON A REAL GPU.
//
// A compute shader that appends to a compacted list through an atomic has no output a person can read, so the
// oracle is the twin: cullLodCpu() over the same records and the same 36 uniform floats. Counts must match
// exactly; the records in each LOD region must match AS A SET (the order within a region is whatever the
// atomics made it); and the picture must match the twin's prediction at every instance's projected centre.
// Then the same scene is drawn through the WebGL2 route -- twin + drawIndexed -- and the two frames diffed.
//
// The device here is requested offscreen on WebGPU (see deviceTexture-selfcheck: a canvas-targeted pass loses
// the device in this shell) and WebGL2 reads its canvas in the same task.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";
import { nullBackend, CAPABILITIES } from "../../gfx/device.js";
import { census } from "./wgslCorpus.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const CAM = { eye: [0, 0, 6], target: [0, 0, 0], fov: Math.PI / 3, near: 0.1, far: 100 };
const N = 256, THRESHOLDS = [0.025, 0.04];   // typed out of order on purpose; rankLods sorts them
const LODS = () => [{ name: "mid", mesh: G.quadMesh(2, [0, 1, 0, 1]) }, { name: "coarse", mesh: G.quadMesh(1, [0, 0, 1, 1]) }, { name: "fine", mesh: G.quadMesh(4, [1, 0, 0, 1]) }];
const COLOR = { fine: [255, 0, 0], mid: [0, 255, 0], coarse: [0, 0, 255] };
const viewProj = G.multiply(G.perspective(CAM.fov, 1, CAM.near, CAM.far), G.lookAt(CAM.eye, CAM.target));
const records = G.gridScene({});
const ranked = G.rankLods(LODS(), THRESHOLDS);
const U = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: ranked.thresholds, count: records.length / 4, lodCount: 3, cap: records.length / 4 });
const twin = G.cullLodCpu(records, U);

console.log("\n1. THE SHADERS ARE VALID, SHARE ONE CULL FUNCTION, AND ARE ACCOUNTED FOR");
{
    for (const [n, src] of [["cullLodWgsl", G.cullLodWgsl()], ["cullProbeWgsl", G.cullProbeWgsl()], ["RENDER_WGSL", G.RENDER_WGSL]])
        ok(`${n} passes render/wgslSpec.mjs`, validateWgsl(src).length === 0, validateWgsl(src).join("; "));
    ok("*** the real shader and the probe splice in the SAME cullLod text ***", G.cullLodWgsl().includes(G.CULL_FN_WGSL) && G.cullProbeWgsl().includes(G.CULL_FN_WGSL));
    const b = parseBindings(G.cullLodWgsl());
    ok("  the cull pass declares uniform, instances, commands, records at bindings 0..3, and (v4317) the extras -- the headings -- at 4", b.map((x) => `${x.binding}:${x.name}`).join(",") === "0:cull,1:inst,2:cmds,3:records,4:extras");
    ok("  the indirect command is five u32 with instanceCount second, as drawIndexedIndirect reads it", G.INDIRECT_STRIDE_U32 === 5 && /instanceCount: atomic<u32>/.test(G.cullLodWgsl()) && /struct Cmd \{ indexCount: u32, instanceCount/.test(G.cullLodWgsl()));
    const un = census().filter((f) => !f.accounted && /gpuDriven/.test(f.file));
    ok("  every WGSL producer in render/gpuDriven.mjs is in the cross-backend corpus or excluded with a reason", un.length === 0, un.map((u) => u.symbol).join(", ") || "all accounted");
    const dev = codeOf(fs.readFileSync(path.join(ENG, "gfx/device.js"), "utf8"));
    ok("gfx/device.js refuses compute and indirect on WebGL2 BY NAME and points at the twin", /has no \$\{what\}/.test(dev) && /cullLodCpu\(\)/.test(dev) && CAPABILITIES.webgl2.compute === false && CAPABILITIES.webgl2.indirect === false);
    ok("  and dispatch() before clear() is enforced, so the cull is ordered before the draw", /dispatch\(\) must come before pass\.clear\(\)/.test(dev));
}

console.log("\n2. THE TWIN, WITH ANALYTIC CONTROLS");
{
    const count = records.length / 4;
    ok("the scene is 256 instances in a 16x16 grid at z = -2", count === 256 && records[2] === -2);
    ok("*** LOD 0 is the finest mesh whatever order the levels were typed in ***", ranked.lods.map((l) => l.name).join(",") === "fine,mid,coarse", ranked.lods.map((l) => `${l.name}(${l.cost})`).join(" > "));
    ok("  thresholds sorted descending", ranked.thresholds.join(",") === "0.04,0.025");
    ok("some instances are culled and some survive in every LOD", twin.visible > 0 && twin.visible < count && twin.counts.every((c) => c > 0), `visible ${twin.visible}/${count}, per LOD ${Array.from(twin.counts).join("/")}`);
    // controls: a camera looking away sees nothing; one far back with a wide view sees everything
    const away = G.multiply(G.perspective(CAM.fov, 1, 0.1, 100), G.lookAt([0, 0, 6], [0, 0, 12]));
    const uAway = G.packCullUniforms({ planes: G.frustumPlanes(away), eye: [0, 0, 6], thresholds: ranked.thresholds, count, lodCount: 3, cap: count });
    ok("CONTROL: a camera facing the other way culls all 256", G.cullLodCpu(records, uAway).visible === 0);
    const wide = G.multiply(G.perspective(2.6, 1, 0.1, 100), G.lookAt([0, 0, 6], [0, 0, 0]));
    const uWide = G.packCullUniforms({ planes: G.frustumPlanes(wide), eye: [0, 0, 6], thresholds: ranked.thresholds, count, lodCount: 3, cap: count });
    ok("CONTROL: a 149-degree camera keeps all 256", G.cullLodCpu(records, uWide).visible === count);
    // LOD is monotone in distance: the same instance further away never gets a finer LOD
    let mono = true;
    for (let d = 8; d < 40; d += 2) { const a = G.cullLodCpuOne([0, 0, -2, 0.4], G.packCullUniforms({ planes: U.subarray(0, 24), eye: [0, 0, d - 2], thresholds: ranked.thresholds, count, lodCount: 3, cap: count }));
        const b = G.cullLodCpuOne([0, 0, -2, 0.4], G.packCullUniforms({ planes: U.subarray(0, 24), eye: [0, 0, d], thresholds: ranked.thresholds, count, lodCount: 3, cap: count })); if (b < a) mono = false; }
    ok("  LOD index never decreases with distance", mono);
    // the margin control: no instance sits on a threshold, so f32 vs f64 cannot decide a LOD
    let margin = Infinity;
    for (let i = 0; i < count; i++) { const m = records[i * 4 + 3] / Math.hypot(records[i * 4] - CAM.eye[0], records[i * 4 + 1] - CAM.eye[1], records[i * 4 + 2] - CAM.eye[2]); for (const t of ranked.thresholds) margin = Math.min(margin, Math.abs(m - t)); }
    ok("CONTROL: the closest metric to a threshold is well clear of f32 rounding", margin > 1e-5, `min margin ${margin.toExponential(2)}`);
    ok("the null backend runs the twin route and records one drawIndexed per non-empty LOD", (() => { const nb = nullBackend(); const sc = G.makeGpuDrivenScene(nb, { lods: LODS(), thresholds: THRESHOLDS, records }); sc.frame({ viewProj, eye: CAM.eye });
        return sc.path === "cpu-twin+drawIndexed" && nb.ops.filter((o) => o[0] === "drawIndexed").length === twin.counts.filter((c) => c > 0).length; })());
}

const skip = webgpuSkipReason();
console.log("\n3. THE PROBE ON A REAL GPU AGREES WITH THE TWIN, INSTANCE FOR INSTANCE");
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
else {
    const count = 768, probeRecords = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) probeRecords.set(G.probeInstance(i), i * 4);
    const uP = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: ranked.thresholds, count, lodCount: 3, cap: count });
    const r = await runWgslCompute({ code: G.cullProbeWgsl(), entryPoint: "probe", outCount: count * 2, uniforms: uP, workgroups: Math.ceil(count / G.CULL_WORKGROUP) });
    ok("the probe compiles and runs", r.ok, r.ok ? `adapter ${r.adapter.vendor}/${r.adapter.architecture}` : `${r.reason} ${(r.errors || []).join(" | ")}`);
    if (r.ok) {
        let lodMismatch = 0, worstMetric = 0, culled = 0, byLod = [0, 0, 0];
        for (let i = 0; i < count; i++) {
            const c = [probeRecords[i * 4], probeRecords[i * 4 + 1], probeRecords[i * 4 + 2], probeRecords[i * 4 + 3]];
            const lod = G.cullLodCpuOne(c, uP), metric = c[3] / Math.max(Math.hypot(c[0] - CAM.eye[0], c[1] - CAM.eye[1], c[2] - CAM.eye[2]), 1e-6);
            if (r.values[i * 2] !== lod) lodMismatch++;
            worstMetric = Math.max(worstMetric, Math.abs(r.values[i * 2 + 1] - metric) / metric);
            if (lod < 0) culled++; else byLod[lod]++;
        }
        ok("*** every one of 768 instances gets the same LOD (or cull) on the GPU as on the CPU ***", lodMismatch === 0, `${lodMismatch} mismatches`);
        ok("  the angular-size metric agrees to f32", worstMetric < 2e-6, `worst relative ${worstMetric.toExponential(2)}`);
        ok("CONTROL: the probe scene exercises culling and all three LODs", culled > 0 && byLod.every((b) => b > 0), `culled ${culled}, per LOD ${byLod.join("/")}`);
    }
}

console.log("\n4. THE REAL THING: DISPATCH, INDIRECT DRAW, READ THE COUNTS AND THE PICTURE BACK");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CAM, THRESHOLDS }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = G.gridScene({});
        const lods = () => [{ name: "mid", mesh: G.quadMesh(2, [0, 1, 0, 1]) }, { name: "coarse", mesh: G.quadMesh(1, [0, 0, 1, 1]) }, { name: "fine", mesh: G.quadMesh(4, [1, 0, 0, 1]) }];
        const viewProj = G.multiply(G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), G.lookAt(a.CAM.eye, a.CAM.target));
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const o = { backend: dev.backend };
            const scene = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: a.THRESHOLDS, records });
            o.path = scene.path; o.order = scene.order.lods.map((l) => l.name);
            const f1 = scene.frame({ viewProj, eye: a.CAM.eye, read: true }); const p1 = await f1.pixels;
            o.counts1 = await scene.readCounts();
            const f2 = scene.frame({ viewProj, eye: a.CAM.eye, read: true }); const p2 = await f2.pixels;
            o.counts2 = await scene.readCounts();
            o.records = Array.from(await scene.readRecords());
            o.pixels = Array.from(p2.pixels); o.w = p2.width;
            let same = 0; for (let i = 0; i < p1.pixels.length; i++) if (p1.pixels[i] === p2.pixels[i]) same++; o.frameStable = same === p1.pixels.length;
            if (backend === "webgl2") {
                try { dev.compute({ wgsl: G.cullLodWgsl() }); o.computeRefusal = "no throw"; } catch (e) { o.computeRefusal = e.message; }
                try { dev.buffer({ size: 64, usage: "indirect" }); o.indirectRefusal = "no throw"; } catch (e) { o.indirectRefusal = e.message; }
            }
            scene.destroy(); dev.destroy();
            out[backend] = o;
        }
        return out;
    }` });
    ok("*** the scene draws through gfx/device.js on both backends ***", r.ok && r.result.webgpu && r.result.webgl2, r.ok ? `${r.result.webgpu.path} | ${r.result.webgl2.path}` : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, L = r.result.webgl2;
        ok("  WebGPU took the compute + drawIndexedIndirect route and WebGL2 the twin", W.path === "compute+drawIndexedIndirect" && L.path === "cpu-twin+drawIndexed");
        ok("  both derived the same LOD order", W.order.join() === L.order.join() && W.order.join() === "fine,mid,coarse");
        ok("*** the instance counts READ BACK FROM THE INDIRECT BUFFER equal the twin's ***", W.counts1.join() === Array.from(twin.counts).join(), `gpu ${W.counts1.join("/")} vs twin ${Array.from(twin.counts).join("/")}`);
        ok("  and a second frame gets the same counts, so the commands are reset each frame and not accumulated", W.counts2.join() === W.counts1.join() && W.frameStable, `frame 2: ${W.counts2.join("/")}`);
        ok("  WebGL2's counts are the twin's", L.counts1.join() === Array.from(twin.counts).join());
        // record SETS per LOD region
        const cap = records.length / 4;
        const setOf = (arr, l, n) => { const s = []; for (let k = 0; k < n; k++) s.push(Array.from(arr.slice((l * cap + k) * G.OUT_RECORD_FLOATS, (l * cap + k) * G.OUT_RECORD_FLOATS + 6)).join(",")); return s.sort().join("|"); };
        let setsMatch = true;
        for (let l = 0; l < 3; l++) if (setOf(W.records, l, W.counts1[l]) !== setOf(twin.compact, l, twin.counts[l])) setsMatch = false;
        ok("*** the compacted records in each LOD region are the twin's, as sets ***", setsMatch, "order within a region is the atomics' and is not asserted");
        // the picture
        let centreOk = 0, centreBad = 0, inside = 0, diff = 0, culledInside = 0;
        for (let i = 0; i < W.pixels.length; i += 4) if (W.pixels[i] !== L.pixels[i] || W.pixels[i + 1] !== L.pixels[i + 1] || W.pixels[i + 2] !== L.pixels[i + 2]) diff++;
        for (let i = 0; i < cap; i++) {
            const c = [records[i * 4], records[i * 4 + 1], records[i * 4 + 2]], lod = G.cullLodCpuOne([...c, records[i * 4 + 3]], U);
            const p = G.project(viewProj, c); if (Math.abs(p[0]) >= 1 || Math.abs(p[1]) >= 1) continue;
            inside++;
            const px = Math.floor((p[0] * 0.5 + 0.5) * N), py = Math.floor((1 - (p[1] * 0.5 + 0.5)) * N), j = (py * N + px) * 4;
            if (lod < 0) { culledInside++; continue; }
            const want = COLOR[ranked.lods[lod].name];
            const hit = (px4) => px4[j] === want[0] && px4[j + 1] === want[1] && px4[j + 2] === want[2];
            if (hit(W.pixels) && hit(L.pixels)) centreOk++; else centreBad++;
        }
        ok("*** every visible instance's centre pixel shows its LOD's colour, on both backends ***", centreBad === 0 && centreOk > 0, `${centreOk} centres right, ${centreBad} wrong, of ${inside} inside the view`);
        ok("  no instance whose centre is on screen was culled", culledInside === 0);
        // *** THE TWO BACKENDS DO NOT AGREE PIXEL FOR PIXEL, AND THE REASON IS MEASURED RATHER THAN TOLERATED. ***
        // With MSAA off on GL (gfx/device.js's default since this round) the per-colour pixel totals are IDENTICAL
        // and 216 of 65,536 pixels still differ: every one is a quad edge that lands on a pixel centre, where the
        // two rasterisers break the tie differently. So the claim is: same histogram, and every differing pixel is
        // a boundary pixel in BOTH images. A pixel that differs in the interior of a quad would fail this.
        const hist = (P) => { const c = {}; for (let i = 0; i < P.length; i += 4) { const k = P[i] + "," + P[i + 1] + "," + P[i + 2]; c[k] = (c[k] || 0) + 1; } return JSON.stringify(c, Object.keys(c).sort()); };
        const colAt = (P, x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? -1 : P[(y * N + x) * 4] * 65536 + P[(y * N + x) * 4 + 1] * 256 + P[(y * N + x) * 4 + 2];
        const boundary = (P, x, y) => { const c = colAt(P, x, y); return colAt(P, x + 1, y) !== c || colAt(P, x - 1, y) !== c || colAt(P, x, y + 1) !== c || colAt(P, x, y - 1) !== c; };
        let interiorDiff = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (colAt(W.pixels, x, y) !== colAt(L.pixels, x, y) && !(boundary(W.pixels, x, y) && boundary(L.pixels, x, y))) interiorDiff++;
        ok("*** the two backends draw the same number of pixels in every LOD colour ***", hist(W.pixels) === hist(L.pixels), hist(W.pixels));
        ok("  and every differing pixel is a quad edge on both sides (rasteriser tie-break), none interior", interiorDiff === 0 && diff < N * N * 0.01, `${diff} of ${N * N} differ, ${interiorDiff} interior`);
        ok("CONTROL: the frame is not blank and not all one colour", W.pixels.some((v, i) => i % 4 === 0 && v > 0) && W.pixels.some((v, i) => i % 4 === 1 && v > 0) && W.pixels.some((v, i) => i % 4 === 2 && v > 0));
        ok("  WebGL2 refuses a compute pipeline by name, pointing at the twin", /has no compute pipelines/.test(L.computeRefusal) && /cullLodCpu/.test(L.computeRefusal), String(L.computeRefusal).slice(0, 90));
        ok("  and an indirect buffer", /storage or indirect buffers/.test(L.indirectRefusal));
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, restored. MEASURED at Level 11.
//   A  the plane test's sign flipped in CULL_FN_WGSL (`< c.w` for `< -c.w`) -> exit=1, 7 red: 88 of 768 probe
//      instances disagree with the twin, the indirect buffer reads back 21/21/22 against the twin's 33/33/34,
//      the record sets differ, the centre-pixel check loses the instances the GPU culled, and the histogram and
//      cross-backend lines go red because WebGL2 runs the twin and still draws them.
//   B  the indirect template not rewritten each frame -> exit=1, 2 red: frame 2 reads back 66/66/68 -- the
//      counts ACCUMULATE, and the "second frame gets the same counts" line is the only thing that sees it,
//      because frame 1 is perfect. That line exists for this sabotage.
//   0  (found before the gate was finished, not planted) a uniform field named `meta`, a reserved word in
//      WGSL: the compute module failed to compile, createShaderModule said nothing, and the GPU drew NOTHING
//      while the twin drew 100. gfx/device.js now watches every module's compilation and refuses by name.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: SPEED. A GPU-driven path exists to keep the CPU out of the per-instance loop, and " +
    "SwiftShader is not the box that would show the difference. Also unchecked: a cap smaller than the count " +
    "(the module refuses one). Depth: Level 12 gave the WebGPU backend a depth attachment (hiZ-selfcheck draws an " +
    "overlapping scene on both backends and they agree); this scene predates it and is still built not to overlap.");
process.exit(fails ? 1 : 0);
