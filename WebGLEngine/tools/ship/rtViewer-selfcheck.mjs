#!/usr/bin/env node
// WebGLEngine/tools/ship/rtViewer-selfcheck.mjs
//
// Run: node tools/ship/rtViewer-selfcheck.mjs
//
// Grades render/rtViewer.mjs -- RTX ROUND 3, THE PRESENT PATH. Rounds 1-2 (physics/render/rtPipeline.mjs) gave
// the mesh a BVH and real shading; neither drew a pixel. This wires that kernel, a new running-mean accumulate
// kernel and a new fullscreen-triangle present kernel through gfx/device.js and puts a real GLB on a canvas.
//
// *** SECTION 1 IS A REAL, PRE-EXISTING BUG THIS ROUND FOUND, NOT A ROUND-3 DEFECT. *** rtPipeline.mjs's own
// `import { LCG } from "./pathTracerWgsl.mjs"` made it impossible to import ANYTHING from rtPipeline.mjs, or
// from physics/render/pathTracerGpu.mjs (which it also imports), inside a browser page -- pathTracerWgsl.mjs
// reads furnace.mjs off disk with node:fs to derive LCG, and an ES module runs its whole top level on import,
// so even wanting one field failed with a disk read nobody asked for. Every existing caller of rtPipeline.mjs
// runs in Node (this tree's own gates, always) -- render/rtViewer.mjs is the FIRST to load it from inside a
// real page, and that is what surfaced it. Fixed by moving the two regex parsers into the new, genuinely
// browser-safe physics/render/lcgConstants.mjs, which also freezes the values they produce; section 1 below
// re-derives LCG/EPS the slow (disk-reading) way and asserts the frozen copy still agrees, so a future change
// to furnace.mjs's generator cannot drift silently out from under the frozen numbers the browser gets instead.
//
// *** SECTIONS 3-5 ARE THE FIRST TIME rtPipeline.mjs's bvh WGSL RUNS THROUGH gfx/device.js's NAME-based BINDING
// AT ALL. *** physics/render/rtPipeline-selfcheck.mjs's own runWgslCompute() binds by INDEX and hand-rolls its
// bind groups, bypassing gfx/device.js entirely -- appropriate for kernel correctness, not for proving the
// integration this round adds (device.compute()/classify()/bindByName, the same mechanism every other device-
// backed module in this tree uses). Section 3 proves that integration on a fabricated cube before section 5
// trusts it with a real GLB.
//
// *** WHAT THIS DOES NOT CLAIM. *** That per-frame progressive accumulation is bit-exact against one large-spp
// dispatch of the same total sample count -- it is not (rtViewer.mjs's own header explains why: rngState is
// seeded once per DISPATCH, so N frames of spp=1 walk a different sequence than one frame of spp=N). Section 2
// therefore grades the accumulate kernel's ARITHMETIC in isolation, against fabricated input decoupled from any
// path-tracing noise, which is an exact and total claim about that kernel; section 5's real-mesh render is
// graded only informally (no NaN/Inf, real spatial variance) because there is no oracle for what a path-traced
// picture of a real mesh should look like. A genuine statistical (measured-noise-bound) render gate is task #99.
//
// SABOTAGE LOG -- each applied to render/rtViewer.mjs, gate run, exit read, file restored byte for byte:
//   A  accumulateWgsl's n replaced with n-1 (an off-by-one on the running-mean denominator)
//        -> exit=1, 4 red, WORSE THAN GUESSED BEFORE RUNNING IT: not just section 2's two fabricated cases
//           (n=1 expected [2,2,2,2], got division by n-1=0; n=4 expected [8,0.5,-3.25,75.5], also wrong) but
//           sections 4 and 5 too -- their FIRST accumulate call is also n=1, so the same n-1=0 division poisons
//           the real-mesh render with NaN/Inf before a single frame is on screen. Written down because the
//           first draft of this log predicted n=1 would pass "by coincidence" without having run it; it did not.
//   B  presentWgsl's index swapped to (x*W+y) instead of (y*W+x) -- a row/column transpose
//        -> exit=1, 1 red: section 3's distinct-per-pixel fixture (a 4x2 frame with no repeated row) reads the
//           wrong pixel at 6 of 8 positions.
//   C  presentWgsl's clamp() removed entirely
//        -> exit=0, 0 red: A REAL FINDING, NOT A GAP IN THE GATE. rgba8unorm is the render target's format
//           (gfx/device.js's own `fmt`), and WebGPU converts an out-of-[0,1] float to that format by CLAMPING
//           at the API level regardless of what the shader does -- section 3's fixture deliberately includes
//           1.5 and -0.3 to catch a clamp regression, and it is still caught, just one layer down from where
//           the WGSL puts it. The shader-level clamp is therefore belt-and-suspenders against a future present
//           target that is NOT rgba8unorm (an HDR float target would not clamp for free); kept, and this is
//           why removing it is not this section's red.
"use strict";

import { gateReport } from "./gateReport.mjs";
import { webgpuSkipReason, runWgslCompute, runInEngineOrigin } from "./webgpuHarness.mjs";
import * as V from "../../render/rtViewer.mjs";
import * as PTW from "../../physics/render/pathTracerWgsl.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT = gateReport("tools/ship/rtViewer-selfcheck.mjs");
const REPORT_ROWS = [];

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// ---- 1. THE PORTABILITY FINDING -- lcgConstants.mjs's frozen values against the live, disk-reading source ----
console.log("1. THE BROWSER-SAFE LCG COPY, RE-CHECKED AGAINST THE REAL DISK READ");
{
    const liveLcg = PTW.parseLcg(), liveEps = PTW.parseEps();
    const { LCG: frozenLcg, EPS: frozenEps } = await import("../../physics/render/lcgConstants.mjs");
    say(`frozen LCG=${JSON.stringify(frozenLcg)} EPS=${frozenEps}; live (disk-read) LCG=${JSON.stringify(liveLcg)} EPS=${liveEps}`);
    ok("!! lcgConstants.mjs's frozen LCG matches a fresh parse of furnace.mjs off disk",
        frozenLcg.mul === liveLcg.mul && frozenLcg.inc === liveLcg.inc && frozenLcg.div === liveLcg.div,
        `frozen ${JSON.stringify(frozenLcg)} vs live ${JSON.stringify(liveLcg)} -- if these disagree, furnace.mjs's ` +
        "generator moved and lcgConstants.mjs's browser-safe copy was not updated to match");
    ok("!! and its frozen EPS matches a fresh parse of occlusion.mjs off disk",
        frozenEps === liveEps, `frozen ${frozenEps} vs live ${liveEps}`);
    ok("rtPipeline.mjs and pathTracerGpu.mjs both import LCG from lcgConstants.mjs, not pathTracerWgsl.mjs",
        /from ["']\.\/lcgConstants\.mjs["']/.test(read("physics/render/rtPipeline.mjs")) &&
        /from ["']\.\/lcgConstants\.mjs["']/.test(read("physics/render/pathTracerGpu.mjs")),
        "importing from pathTracerWgsl.mjs directly would reintroduce the node:fs chain this round removed");
    ok("pathTracerWgsl.mjs's own LCG/EPS are unchanged in VALUE by the refactor (still the disk-reading path)",
        PTW.LCG.mul === liveLcg.mul && PTW.EPS === liveEps,
        "every one of pathTracerWgsl.mjs's 11 other importers gets exactly the values it always got");
}

// ---- 2. THE ACCUMULATE KERNEL, EXACT, AGAINST FABRICATED INPUT -----------------------------------------------
console.log("\n2. accumulateWgsl -- A RUNNING MEAN, HELD TO HAND-COMPUTED EXPECTED VALUES");
{
    const src = V.accumulateWgsl(4);
    ok("declares accumBuf read_write at binding 0, F uniform at 1, frameBuf read at 2",
        /@binding\(0\)[^\n]*read_write>\s*accumBuf/.test(src) && /@binding\(1\)[^\n]*uniform>\s*F/.test(src) &&
        /@binding\(2\)[^\n]*read>\s*frameBuf/.test(src),
        "binding 0 is what runWgslCompute always reads back -- see this file's header on why the order matters here and nowhere else");

    const skip = webgpuSkipReason();
    if (skip) {
        console.log("  SKIP  no WebGPU device: " + skip);
        fails++;
    } else {
        const N = 4, prior = [10, 0, -5, 100], frame = [2, 2, 2, 2];
        const run = (n) => runWgslCompute({ code: V.accumulateWgsl(N), outCount: N, workgroups: 1,
            outInit: new Float32Array(prior), uniforms: new Float32Array([n, 0, 0, 0]),
            inputs: [{ binding: 2, data: new Float32Array(frame) }] });

        const r1 = await run(1);
        if (!r1.ok) throw new Error("accumulate n=1 GPU run failed: " + r1.reason);
        say(`n=1 (first sample): accumBuf ${JSON.stringify(r1.values)}`);
        ok("!! n=1 FULLY OVERWRITES regardless of the prior value -- this is what makes a camera-move reset just \"restart n at 1\"",
            r1.values.every((v, i) => v === frame[i]),
            `expected ${JSON.stringify(frame)} (the prior value ${JSON.stringify(prior)} must not leak through)`);

        const r4 = await run(4);
        if (!r4.ok) throw new Error("accumulate n=4 GPU run failed: " + r4.reason);
        const expect4 = prior.map((p, i) => p + (frame[i] - p) / 4);
        say(`n=4: accumBuf ${JSON.stringify(r4.values)}, hand-computed ${JSON.stringify(expect4)}`);
        REPORT_ROWS.push(["accumulate n=1", JSON.stringify(prior), JSON.stringify(frame), JSON.stringify(r1.values)]);
        REPORT_ROWS.push(["accumulate n=4", JSON.stringify(prior), JSON.stringify(frame), JSON.stringify(r4.values)]);
        ok("!! n=4 matches accumBuf[i] + (frameBuf[i]-accumBuf[i])/4, computed by hand off-GPU",
            r4.values.every((v, i) => Math.abs(v - expect4[i]) < 1e-5),
            "the Welford-style running mean, checked as arithmetic rather than trusted as an idiom");
    }
}

const skip = webgpuSkipReason();
if (skip) {
    console.log("\n3-5 SKIPPED -- no WebGPU device: " + skip);
    console.log("\nrtViewer-selfcheck: " + fails + " FAILED (short report, not a clean one)");
    process.exit(1);
}

console.log("\n3-5. THE PRESENT KERNEL, THE NAME-BASED DEVICE INTEGRATION, AND A REAL MESH -- ALL THREE THROUGH ONE PAGE");
{
    const r = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 90000,
        script: `async () => {
            const { requestDevice } = await import("/gfx/device.js");
            const { presentWgsl, loadMeshBvh, loadCityBvh, makeRtSession, orbitEye, meshBounds } = await import("/render/rtViewer.mjs");
            const { bvhBuffersFromMesh } = await import("/physics/render/rtPipeline.mjs");
            const out = {};

            // ---- 3. present kernel: a distinct-per-pixel accumBuf, fed directly (no raytrace/accumulate) ----
            {
                const w = 4, h = 2;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const accum = new Float32Array(w * h * 3);
                for (let i = 0; i < w * h; i++) { accum[i*3] = i / (w*h); accum[i*3+1] = 1.5; accum[i*3+2] = -0.3; }
                const accumBuf = device.buffer({ usage: "storage", data: accum });
                const pipe = device.pipeline({ shaders: { wgsl: presentWgsl(w, h) } });
                const frame = await device.frame(({ pass }) => {
                    pass.clear([0, 0, 0, 1]);
                    pass.use(pipe);
                    pass.storage("accumBuf", accumBuf);
                    pass.draw(3, 1);
                }, { offscreen: true, read: true });
                const expected = [];
                for (let i = 0; i < w * h; i++) expected.push(Math.round(Math.min(1, Math.max(0, accum[i*3])) * 255), 255, 0, 255);
                out.present = { px: Array.from(frame.pixels), expected, w, h };
            }

            // ---- 4. a fabricated cube through makeRtSession -- gfx/device.js's NAME-based bindByName, first use ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2 });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; }
                out.cube = { boundsRadius: mesh.bounds.radius, nan, min, max, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 5. the real GLB -- fetch, parse, BVH, render; informal sanity only (no radiance oracle for a mesh) ----
            {
                const res = await fetch("/vendor/kenney-city/models/pavement.glb");
                const buf = await res.arrayBuffer();
                const mesh = await loadMeshBvh(buf);
                const w = 48, h = 32;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2 });
                const view0 = orbitEye({ yaw: 0.7, pitch: 0.5, dist: mesh.bounds.radius * 3.2 + 0.5, center: mesh.bounds.center });
                const view = { w, h, ...view0, fovDeg: 45 };
                for (let i = 0; i < 8; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                const uniq = new Set();
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; uniq.add(Math.round(v * 1000)); }
                out.mesh = { byteLength: buf.byteLength, triangleCount: mesh.triangleCount, vertexCount: mesh.vertexCount,
                             bounds: mesh.bounds, nan, min, max, distinct: uniq.size, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 5b. RTX round 5 -- the procedurally generated scene, same shape as section 5's real GLB ----
            {
                const mesh = loadCityBvh();
                const w = 48, h = 32;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2 });
                const view0 = orbitEye({ yaw: 0.7, pitch: 0.5, dist: mesh.bounds.radius * 3.2 + 0.5, center: mesh.bounds.center });
                const view = { w, h, ...view0, fovDeg: 45 };
                for (let i = 0; i < 8; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                const uniq = new Set();
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; uniq.add(Math.round(v * 1000)); }
                out.city = { triangleCount: mesh.triangleCount, vertexCount: mesh.vertexCount, bounds: mesh.bounds,
                             nan, min, max, distinct: uniq.size, frameCount: session.frameCount() };
                session.destroy();
            }
            return out;
        }`,
    });
    if (!r.ok) throw new Error("runInEngineOrigin failed: " + r.reason + (r.pageErrors && r.pageErrors.length ? " | " + r.pageErrors.slice(0, 3).join(" | ") : ""));
    const { present, cube, mesh, city } = r.result;

    console.log("\n3. presentWgsl -- A DISTINCT-PER-PIXEL FRAME, PIXEL FOR PIXEL");
    say(`4x2, values include 1.5 and -0.3 to exercise the clamp`);
    ok("!! every pixel matches Math.round(clamp(accum.r,0,1)*255), g=255 (1.5 clamped), b=0 (-0.3 clamped), a=255",
        present.px.length === present.expected.length && present.px.every((v, i) => v === present.expected[i]),
        JSON.stringify(present.px) + " vs " + JSON.stringify(present.expected));

    console.log("\n4. A FABRICATED CUBE THROUGH makeRtSession -- device.compute()/device.pipeline() BOUND BY NAME");
    say(`bounds radius ${cube.boundsRadius.toFixed(4)} (expect sqrt(3)=${Math.sqrt(3).toFixed(4)}), ${cube.frameCount} frames accumulated`);
    say(`accumBuf: ${cube.nan} NaN/Inf, range [${cube.min.toFixed(4)}, ${cube.max.toFixed(4)}]`);
    ok("!! meshBounds() reads the BVH root's own box -- a unit cube's half-diagonal is exactly sqrt(3)",
        Math.abs(cube.boundsRadius - Math.sqrt(3)) < 1e-6, `${cube.boundsRadius} vs ${Math.sqrt(3)}`);
    ok("!! rtPipeline.mjs's bvh compute kernel, the accumulate kernel and the present kernel all bound BY NAME on one device -- no NaN, real range",
        cube.nan === 0 && cube.max > cube.min && cube.max <= 1.0 && cube.min >= 0.0,
        "this is the first time this WGSL has gone through gfx/device.js's classify()/bindByName rather than an index-based harness");

    console.log("\n5. A REAL GLB, THROUGH THE FULL loadMeshBvh -> makeRtSession -> device.frame PATH");
    say(`vendor/kenney-city/models/pavement.glb: ${mesh.byteLength} bytes -> ${mesh.triangleCount} triangles, ${mesh.vertexCount} vertices`);
    say(`bounds ${JSON.stringify(mesh.bounds)}`);
    say(`accumBuf after ${mesh.frameCount} frames: ${mesh.nan} NaN/Inf, range [${mesh.min.toFixed(4)}, ${mesh.max.toFixed(4)}], ${mesh.distinct} distinct (of 1000ths) values`);
    REPORT_ROWS.push(["pavement.glb", `${mesh.triangleCount} tris`, `${mesh.frameCount} frames`, `${mesh.distinct} distinct, range [${mesh.min.toFixed(3)}, ${mesh.max.toFixed(3)}]`]);
    ok("the parsed mesh is the file this gate actually asked for -- 20 triangles, 24 vertices, a thin tile",
        mesh.triangleCount === 20 && mesh.vertexCount === 24,
        "a wrong count here would mean colliderFromGLB.mjs's own bridge (GLBParser.parse -> meshTriples -> bvhBuffersFromMesh) stopped matching what loadMeshBvh calls");
    ok("!! real mesh, real camera, real accumulation: no NaN/Inf and genuine spatial variance -- not a blank or broken frame",
        mesh.nan === 0 && mesh.distinct > 20 && mesh.max > mesh.min,
        "informal by design -- there is no CPU radiance oracle for a triangle mesh (rtPipeline.mjs's own header); " +
        "what IS checked is that the whole present path produces a real, varied picture rather than sky, black, or NaN");

    console.log("\n5b. RTX ROUND 5 -- THE PROCEDURALLY GENERATED SCENE, THROUGH THE FULL loadCityBvh -> makeRtSession -> device.frame PATH");
    say(`world/cityChunkScene.mjs's citySceneMesh(): ${city.triangleCount} triangles, ${city.vertexCount} vertices`);
    say(`bounds ${JSON.stringify(city.bounds)}`);
    say(`accumBuf after ${city.frameCount} frames: ${city.nan} NaN/Inf, range [${city.min.toFixed(4)}, ${city.max.toFixed(4)}], ${city.distinct} distinct (of 1000ths) values`);
    REPORT_ROWS.push(["city scene", `${city.triangleCount} tris`, `${city.frameCount} frames`, `${city.distinct} distinct, range [${city.min.toFixed(3)}, ${city.max.toFixed(3)}]`]);
    ok("the generated scene is the fixture this gate actually asked for -- world/cityChunkScene.mjs's own DEFAULT_BUILDING, 120 triangles, 360 vertices",
        city.triangleCount === 120 && city.vertexCount === 360,
        "a wrong count here would mean CityGen.js, chunkMesherCore.js, or bvhBuffersFromTriSoup() stopped matching what world/cityChunkScene.mjs's own front door already measures (node world/cityChunkScene.mjs)");
    ok("!! real procedurally generated mesh, real camera, real accumulation: no NaN/Inf and genuine spatial variance",
        city.nan === 0 && city.distinct > 20 && city.max > city.min,
        "same informal-by-design reasoning as section 5's real GLB -- no CPU radiance oracle for a triangle mesh, so what's checked is a real, varied picture rather than sky, black, or NaN");

    console.log("\n6. THE LIVE PAGE ITSELF");
    const page = read("rtx-viewer.html");
    ok("carries demo:title/demo:desc/demo:category and imports render/rtViewer.mjs",
        /demo:title/.test(page) && /demo:desc/.test(page) && /demo:category/.test(page) && /render\/rtViewer\.mjs/.test(page));
    ok("presents to the canvas normally (no offscreen at requestDevice or per-frame) -- this gate's own device.frame " +
       "calls all pass {offscreen:true,read:true} explicitly, which the live page does not",
        /requestDevice\(/.test(page) && !/offscreen:\s*true/.test(page));
    ok("the front door links it", /href="\/rtx-viewer\.html"/.test(read("server.html")));
    ok("!! RTX round 5 -- the page imports loadCityBvh and reads the scene toggle from the URL, not just loadMeshBvh",
        /loadCityBvh/.test(page) && /scene.*==.*["']city["']|["']city["'].*scene/.test(page),
        "a page that only ever loaded the hardcoded pavement tile would still pass every check above this one");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"));
console.log("unchecked here: WHETHER LIVE CANVAS PRESENTATION ITSELF WORKS ON THIS BOX -- every device.frame call " +
    "above passes {offscreen:true,read:true} deliberately (tools/ship/devicePresent-selfcheck.mjs's own header: " +
    "this build box loses the WebGPU device on a render pass whose attachment is the canvas's current texture). " +
    "rtx-viewer.html itself presents normally, the way every other live demo page does, and only a real browser " +
    "on real hardware can confirm that picture. Also unchecked: bit-exactness of accumulation against a single " +
    "large-spp dispatch (not a claim this round makes -- see this file's header), multi-material SBT offset and " +
    "a genuine statistical render gate (task #99), and orbit-camera pointer handling in rtx-viewer.html itself " +
    "(pure event wiring, not rendering math -- nothing here simulates pointer events against a live page).");
REPORT.table("accumulate kernel and the real mesh render, measured", ["case", "input", "n / frames", "result"], REPORT_ROWS,
    "A number that only reached this terminal is a measurement nobody else can re-read.");
REPORT.write();
process.exit(fails ? 1 : 0);
