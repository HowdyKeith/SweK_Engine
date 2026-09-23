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
//   D  RTX round 10 -- makeRtSession's `material` validation throw removed entirely
//        -> exit=1, 1 red: section 1b's own "an unrecognized `material` value throws..." test, by name.
//   E  RTX round 10 -- the default (lambertian) branch's own `rgb: true` flipped to `rgb: false` in its
//      pipelineWgsl() call
//        -> exit=1, 2 red: section 1b's byte-identity check (the direct target), plus section 4b's own
//           "genuinely DIFFERENT from Lambertian" check as a real, traceable cascading effect (the mismatched
//           rgb/uniforms pairing degraded the Lambertian control render itself, not a false alarm).
//   F  RTX round 11 -- makeRtSession's `sky` validation throw removed entirely
//        -> exit=1, 1 red: section 1b's own "an unrecognized `sky` value throws..." test, by name.
//   G  RTX round 11 -- packAtlasHalfFloat's own toHalf()-based conversion replaced with a wrong ad-hoc
//      fixed-point encoding (`Math.round(x*4096) & 0xFFFF`)
//        -> exit=1, 1 red: section 1b's own packAtlasHalfFloat-vs-captureAtlasHalves codec check, by name --
//           the one check that exists specifically to catch this exact class of bug (see that section's own
//           comment on what it does and does not prove).
//   H  RTX round 11 -- makeRtSession's `envFaceSize` validation guard removed entirely (added after a
//      background adversarial review found this option, unlike `sky`/`material`, had none)
//        -> exit=1, 3 red: section 1b's own three envFaceSize:{0,-4,3.5} tests, each by name.
"use strict";

import { gateReport } from "./gateReport.mjs";
import { webgpuSkipReason, runWgslCompute, runInEngineOrigin } from "./webgpuHarness.mjs";
import * as V from "../../render/rtViewer.mjs";
import * as PTW from "../../physics/render/pathTracerWgsl.mjs";
import { pipelineWgsl } from "../../physics/render/rtPipeline.mjs";
import { captureAtlasHalves, captureBaseCubemap, packCapturedAtlas } from "../../physics/render/specularProbeCapture.mjs";
import { fromHalf } from "../../text/slugAtlas.js";
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

// ---- 1b. RTX ROUND 10 -- makeRtSession's OWN GENERATED WGSL, BY `material`, AGAINST pipelineWgsl() DIRECTLY ----
// No GPU needed: `device` is a stub that only RECORDS what makeRtSession() passes to device.compute(), so this
// checks the exact JS-level option-passing this round adds, decoupled from whether a real device is present.
console.log("\n1b. RTX ROUND 10 -- makeRtSession's material OPTION, AGAINST pipelineWgsl() DIRECTLY (NO GPU NEEDED)");
{
    const fakeMesh = {
        bvh: { nodeCount: 1, triCount: 1, bounds: new Float32Array(6), meta: new Float32Array(4),
                order: new Uint32Array(1), tris: new Float32Array(9) },
        bounds: { center: [0, 0, 0], radius: 1 }, vertexCount: 3, triangleCount: 1,
    };
    const stubDevice = () => {
        const wgsls = [];
        return { wgsls, device: {
            compute({ wgsl }) { wgsls.push(wgsl); return { bind() {}, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture() { return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };

    const d1 = stubDevice();
    V.makeRtSession(d1.device, { mesh: fakeMesh, w: 4, h: 4 });
    ok("!! material OMITTED (default) generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,rgb:true,gradient:true})",
        d1.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: true }),
        "the same opt-in rule every prior rtPipeline option already holds to -- a page that never passes `material` " +
        "must render exactly as it did before this round existed, verified by direct string equality, not assumed");

    const d2 = stubDevice();
    V.makeRtSession(d2.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet" });
    ok("!! material:\"microfacet\" generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,gradient:true,microfacet:\"bsdf\",msComp:true})",
        d2.wgsls[0] === pipelineWgsl({ bvh: true, gradient: true, microfacet: "bsdf", msComp: true }),
        "proves makeRtSession's own microfacet branch calls pipelineWgsl with exactly the options its own doc " +
        "claims (unconditional msComp, no rgb), not just similar-looking ones");

    ok("an unrecognized `material` value throws rather than silently falling back to lambertian",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, material: "mirror" }); return false; }
                 catch (e) { return /material must be/.test(e.message); } })(),
        "a typo in a future caller's `material` string should fail loud, not silently render Lambertian");

    // ---- RTX ROUND 11 -- `sky`, the SAME no-GPU option-passing check extended to envMap. ----
    const d3 = stubDevice();
    V.makeRtSession(d3.device, { mesh: fakeMesh, w: 4, h: 4, sky: "envMap" });
    ok("!! sky:\"envMap\" (material omitted) generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,rgb:true,gradient:false,envMap:true})",
        d3.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: false, envMap: true }),
        "proves sky:\"envMap\" actually turns gradient OFF and envMap ON in the generated text, not merely accepted as an option with no effect");

    const d4 = stubDevice();
    V.makeRtSession(d4.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet", sky: "envMap" });
    ok("!! material:\"microfacet\" + sky:\"envMap\" together generate BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,gradient:false,microfacet:\"bsdf\",msComp:true,envMap:true})",
        d4.wgsls[0] === pipelineWgsl({ bvh: true, gradient: false, microfacet: "bsdf", msComp: true, envMap: true }),
        "the two toggles are orthogonal -- envMap composes with microfacet+msComp exactly as pipelineWgsl() itself allows (it throws only on envMap+gradient together), proven here rather than assumed from the option names alone");

    ok("an unrecognized `sky` value throws rather than silently falling back to gradient",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, sky: "hdri" }); return false; }
                 catch (e) { return /sky must be/.test(e.message); } })(),
        "a typo in a future caller's `sky` string should fail loud, not silently render the gradient");

    // *** A BACKGROUND ADVERSARIAL REVIEW FOUND `envFaceSize` HAD NO GUARD, UNLIKE ITS SIBLING OPTIONS. ***
    // roughness/ior merely produce a numerically implausible but still well-formed material at any value; a
    // degenerate envFaceSize (0, negative, non-integer) instead produces a zero-length or ragged atlas with no
    // thrown error anywhere in captureBaseCubemap/packSpecularAtlas, which device.texture() then accepts with
    // no SYNCHRONOUS failure either -- confirmed by direct trace before this guard was added, not assumed.
    for (const bad of [0, -4, 3.5]) {
        ok(`envFaceSize:${bad} throws rather than silently baking a zero-length or ragged atlas`,
            (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, sky: "envMap", envFaceSize: bad }); return false; }
                     catch (e) { return /envFaceSize must be/.test(e.message); } })(),
            "a degenerate face size has no synchronous failure anywhere downstream of this guard -- device.texture() " +
            "accepts a 0 or negative width/height with no thrown error (WebGPU's own dimension validation is async)");
    }
    ok("envFaceSize is NOT checked when sky is \"gradient\" -- the option is meaningless there, not a caller mistake",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, envFaceSize: -1 }); return true; }
                 catch (e) { return false; } })(),
        "a caller who never asks for envMap should not be penalized for a leftover or irrelevant envFaceSize value");

    // ---- RTX ROUND 11 -- packAtlasHalfFloat()'s OWN APPLICATION of the half-float codec, checked against a
    // SEPARATE call site (captureAtlasHalves(), physics/render/specularProbeCapture.mjs) that applies the
    // IDENTICAL toHalf/fromHalf (text/slugAtlas.js) to the same atlas -- NOT an independently-implemented
    // codec. *** CORRECTED HERE AFTER A BACKGROUND ADVERSARIAL REVIEW FOUND THE ORIGINAL WORDING OVERCLAIMED
    // EXACTLY THAT. *** captureAtlasHalves() computes fromHalf(toHalf(x)) with the SAME imported functions
    // packAtlasHalfFloat() uses, so this is the same deterministic expression evaluated by two independent call
    // sites, not two different codecs cross-checked -- said plainly rather than left as the misleading original
    // claim. What it DOES still prove, and is the only thing it needs to: packAtlasHalfFloat() applies toHalf()
    // to the right values, at the right indices, over the right length -- a wrong scale, a channel swap, a
    // transposed index, or a length mismatch would diverge from captureAtlasHalves()'s own separate call even
    // though both ultimately call the identical toHalf(), exactly what the sabotage log above (entry G) demonstrates.
    // Baked at DEFAULT_ENV_FACE_SIZE (the SAME size makeRtSession's own production path uses), not an
    // arbitrary smaller size, so the reported texel-channel count matches what a real session actually bakes
    // (also corrected here: an earlier draft used a hardcoded 8, which does not match either the production
    // path or the number this round's own backlog entry cites). ----
    {
        const capture = captureBaseCubemap(V.envRadianceOf, [0, 0, 0], V.DEFAULT_ENV_FACE_SIZE);
        const atlas = packCapturedAtlas(capture);
        const half = V.packAtlasHalfFloat(atlas);
        const quantized = captureAtlasHalves(atlas);
        let mismatches = 0;
        for (let i = 0; i < half.length; i++) if (fromHalf(half[i]) !== quantized.data[i]) mismatches++;
        say(`packAtlasHalfFloat vs captureAtlasHalves (DEFAULT_ENV_FACE_SIZE=${V.DEFAULT_ENV_FACE_SIZE}): ${mismatches} of ${half.length} texel-channels mismatched`);
        ok("!! packAtlasHalfFloat() applies the SAME toHalf/fromHalf codec captureAtlasHalves() independently calls on the SAME atlas",
            half.length === atlas.data.length && mismatches === 0,
            "a wrong scale, a channel swap, a wrong index, or a length mismatch in packAtlasHalfFloat's own loop " +
            "would diverge from captureAtlasHalves()'s own separate call even though both reach the identical " +
            "toHalf() underneath -- NOT a comparison against a differently-implemented codec (both use text/" +
            "slugAtlas.js's own toHalf/fromHalf), said plainly after a review found the original wording here " +
            "implied otherwise; the sabotage log above (entry G) shows this still catches exactly the bug class it exists for");
    }
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

            // ---- 4b. RTX ROUND 10 -- the SAME fabricated cube, through material:"microfacet" (msComp:true, the
            // FIRST production caller of either) -- proves the real device path (msE buffer built and bound BY
            // NAME, roughness/ior packed into the bvh uniform slot each frame) actually executes end to end, not
            // just that the right JS options are chosen (section 1b's own, GPU-free claim). ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2, material: "microfacet" });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; }
                out.cubeMicrofacet = { nan, min, max, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 4c. RTX ROUND 11 -- the SAME fabricated cube, through sky:"envMap" (the FIRST production
            // caller of envMap) -- proves the real device path (the baked atlas uploaded as a real
            // rgba16float texture, bound BY NAME at "tAtlas") actually executes end to end, not just that the
            // right JS options are chosen (section 1b's own, GPU-free claim). ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2, sky: "envMap" });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; }
                out.cubeEnvMap = { nan, min, max, frameCount: session.frameCount() };
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
    const { present, cube, cubeMicrofacet, cubeEnvMap, mesh, city } = r.result;

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

    console.log("\n4b. RTX ROUND 10 -- THE SAME FABRICATED CUBE, THROUGH material:\"microfacet\" (msComp:true) -- THE FIRST PRODUCTION CALLER");
    say(`accumBuf: ${cubeMicrofacet.nan} NaN/Inf, range [${cubeMicrofacet.min.toFixed(4)}, ${cubeMicrofacet.max.toFixed(4)}], ${cubeMicrofacet.frameCount} frames`);
    REPORT_ROWS.push(["cube, microfacet+msComp", "unit cube", `${cubeMicrofacet.frameCount} frames`,
        `range [${cubeMicrofacet.min.toFixed(4)}, ${cubeMicrofacet.max.toFixed(4)}]`]);
    ok("!! the SAME cube, the msE buffer built and bound BY NAME, roughness/ior/msTable packed each frame, through a REAL WebGPU device -- no NaN, real range",
        cubeMicrofacet.nan === 0 && cubeMicrofacet.max > cubeMicrofacet.min && cubeMicrofacet.max <= 1.0 && cubeMicrofacet.min >= 0.0,
        "proves the WIRING this round adds -- not just the math physics/render/rtPipeline-selfcheck.mjs's own section 14 already " +
        "proved in isolation -- actually executes end to end on a real device: this session's own msE storage buffer, and the " +
        "roughness/ior/msTable this session packs into the bvh uniform slot every frame");
    ok("!! and reads genuinely DIFFERENT from the plain Lambertian render of the IDENTICAL cube and camera -- material " +
        "selection actually changes the picture, not just \"doesn't crash\"",
        Math.abs(cubeMicrofacet.max - cube.max) > 1e-4 || Math.abs(cubeMicrofacet.min - cube.min) > 1e-4,
        `microfacet range [${cubeMicrofacet.min.toFixed(4)}, ${cubeMicrofacet.max.toFixed(4)}] vs lambertian range ` +
        `[${cube.min.toFixed(4)}, ${cube.max.toFixed(4)}]`);

    console.log("\n4c. RTX ROUND 11 -- THE SAME FABRICATED CUBE, THROUGH sky:\"envMap\" -- THE FIRST PRODUCTION CALLER OF envMap");
    say(`accumBuf: ${cubeEnvMap.nan} NaN/Inf, range [${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}], ${cubeEnvMap.frameCount} frames`);
    REPORT_ROWS.push(["cube, envMap", "unit cube", `${cubeEnvMap.frameCount} frames`,
        `range [${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}]`]);
    ok("!! the SAME cube, the baked atlas uploaded as a real rgba16float texture and bound BY NAME, through a REAL WebGPU device -- no NaN, real range",
        cubeEnvMap.nan === 0 && cubeEnvMap.max > cubeEnvMap.min && cubeEnvMap.min >= 0.0,
        "proves the WIRING this round adds -- not just the math physics/render/rtPipeline-selfcheck.mjs's own section 12 already " +
        "proved in isolation -- actually executes end to end on a real device: the atlas this session bakes, half-float-packs, " +
        "and binds as \"tAtlas\". No upper bound asserted here on purpose -- envRadianceOf's own sun highlight peaks near 6.5, " +
        "well above the plain gradient's own [0.3,1.0] range, and a sky ray reading that value unclamped is the EXPECTED result, " +
        "not a defect (presentWgsl's own clamp only applies at the display step, never to accumBuf itself)");
    ok("!! and reads genuinely DIFFERENT from the plain gradient-sky render of the IDENTICAL cube and camera -- envMap selection " +
        "actually changes the picture, not just \"doesn't crash\"",
        Math.abs(cubeEnvMap.max - cube.max) > 1e-4 || Math.abs(cubeEnvMap.min - cube.min) > 1e-4,
        `envMap range [${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}] vs gradient range ` +
        `[${cube.min.toFixed(4)}, ${cube.max.toFixed(4)}]`);

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
    ok("!! RTX round 10 -- the page reads a `material` URL param and passes it into makeRtSession, not just the hardcoded default",
        /material.*==.*["']microfacet["']|["']microfacet["'].*material/.test(page) &&
        /material\s*:\s*MATERIAL/.test(page),
        "a page that never read the param would still call makeRtSession successfully (material defaults to " +
        "\"lambertian\") and every check above this one would still pass -- this is the one assertion that would " +
        "catch a demo wired to the JS module but never actually reachable from the page's own toggle");
    ok("!! RTX round 11 -- the page reads a `sky` URL param and passes it into makeRtSession, not just the hardcoded gradient default",
        /sky.*==.*["']envMap["']|["']envMap["'].*sky/.test(page) &&
        /sky\s*:\s*SKY/.test(page),
        "a page that never read the param would still call makeRtSession successfully (sky defaults to " +
        "\"gradient\") and every check above this one would still pass -- the same shape of gap round 10's own " +
        "material check exists to catch, extended to the third toggle");
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
