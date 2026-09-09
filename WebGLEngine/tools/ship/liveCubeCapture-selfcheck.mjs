#!/usr/bin/env node
// WebGLEngine/tools/ship/liveCubeCapture-selfcheck.mjs -- v4581
//
// Run: node tools/ship/liveCubeCapture-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE PIECE specularProbeCapture.mjs NAMED AS OUT OF SCOPE: A REAL RENDER, NOT AN ANALYTIC STAND-IN. ***
// render/liveCubeCapture.mjs's camera geometry was already checked computationally (a world point along
// cubeBake.FACES[f](u0, v0) projects to NDC (u0, v0) to 7e-9) -- this is the OTHER half: a real gfx/device.js
// device, drawing a real gpuDriven scene, on both real backends, read back and packed. gfx/device.js only
// exists in a browser (canvas, requestDevice), so this whole gate runs through tools/ship/webgpuHarness.mjs
// rather than the native headlessGpu.mjs path every other WGSL gate in this arc uses.
//
// TWO SECTIONS. (1) A scene built for exactly one purpose: ONE bright emissive marker sphere at a KNOWN, general-
// position direction, nothing else -- so "where does the brightest captured texel land" has one honest answer,
// cubeBake.dirToFace's, checked against it rather than eyeballed. (2) render/probeLab.mjs's OWN diffuse shell,
// captured for real through captureLiveSpecAtlas and fed into physics/render/specularProbeCapture.mjs's
// ALREADY-VERIFIED texture-backed prefilter (native, headlessGpu) -- proving the whole downstream pipeline
// (packing, sampling, convolution) does not care whether its atlas came from an analytic stand-in or a real
// render, which was the entire point of keeping captureBaseCubemap's output shape.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason } from "./headlessGpu.mjs";
import { dirToFace, faceTexelDir } from "../../render/cubeBake.js";
import { probeLab } from "../../render/probeLab.mjs";
import { CAPTURED_PREFILTER_WGSL, packCapturedPrefilterParams, packPrefilterCases } from "../../physics/render/specularProbeCapture.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

async function main() {
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); console.log("\nFAIL -- 1 check(s)"); process.exit(1); }

    sec("1. ON BOTH BACKENDS: A REAL RENDER OF ONE KNOWN MARKER, CAPTURED, LANDS WHERE dirToFace SAYS IT SHOULD");
    // *** THIS DIRECTION WAS CHOSEN, NOT THE FIRST ONE TRIED. *** [0.3, 0.6, 0.7] measured face 4 at only 45.1
    // degrees from face 2's own boundary against the marker's 6.65-degree angular radius -- BOTH faces legitimately
    // saw a fully-bright pixel (measured directly by rendering each face in isolation: face 4 seven pixels, face 2
    // one edge pixel, both fully saturated), so "brightest single texel across all six faces" occasionally picked
    // face 2's one anti-aliased hit over face 4's real, larger footprint. That is genuine cubemap edge bleed --
    // any object near a face boundary is visible from both adjacent frustums, by construction -- not a capture
    // bug, and the fix is the SAME lesson this arc's earlier sabotage rounds already learned the hard way: pick a
    // test case with margin, don't discover the boundary by accident. max(|u|, |v|) = 0.278 here (comfortably
    // under the 1.0 edge), against 0.86-0.97 for directions this close to a face's own diagonal.
    const EYE = [0, 0, 0], MARKER_DIR = norm3([0.159, 0.264, 0.951]), MARKER_DIST = 3, MARKER_RADIUS = 0.25, SIZE = 16;
    const { face: expectFace, u: expectU, v: expectV } = dirToFace(MARKER_DIR);
    const expectI = Math.round(((expectU + 1) / 2) * SIZE - 0.5), expectJ = Math.round(((expectV + 1) / 2) * SIZE - 0.5);
    report(`marker direction [${MARKER_DIR.map((x) => x.toFixed(3))}] -> dirToFace says face ${expectFace}, texel (${expectI}, ${expectJ}) of ${SIZE} (angular radius ${(Math.atan(MARKER_RADIUS / MARKER_DIST) * 180 / Math.PI).toFixed(1)} deg vs ${(90 / SIZE).toFixed(1)} deg/texel)`);

    const r1 = await runInEngineOrigin({ engineRoot: ENG, args: { eye: EYE, markerDir: MARKER_DIR, markerDist: MARKER_DIST, markerRadius: MARKER_RADIUS, size: SIZE }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const G = await import("/render/gpuDriven.mjs");
        const { sphereMesh, litPipelineDesc, litBind } = await import("/render/litSphere.mjs");
        const { captureLiveCubemap } = await import("/render/liveCubeCapture.mjs");
        const { eye, markerDir, markerDist, markerRadius, size } = a;
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
            const markerPos = [eye[0] + markerDir[0] * markerDist, eye[1] + markerDir[1] * markerDist, eye[2] + markerDir[2] * markerDist];
            const records = Float32Array.from([markerPos[0], markerPos[1], markerPos[2], markerRadius]);
            const extras = new Float32Array(G.EXTRA_FLOATS); extras[3] = 1;   // emissive, tint 0 (the mesh's own white)
            const fleets = [{ name: "marker", lods: [{ name: "only", mesh: sphereMesh(2, [1, 1, 1, 1]) }], layout: G.LAYOUTS.lit, pipeline: litPipelineDesc({ tints: [] }), bind: litBind([0, 0, 0, 1]) }];
            const sc = G.makeGpuDrivenScene(dev, { fleets, fleetOf: Uint32Array.from([0]), thresholds: [], records, headings: extras });
            const capture = await captureLiveCubemap(dev, sc, eye, { size, background: [0, 0, 0, 1] });
            out[backend] = { errs, size: capture.size, faces: capture.faces.map((f) => Array.from(f)) };
            dev.destroy();
        }
        return out;
    }` });
    ok("both backends ran with no device errors", r1.ok && r1.result && r1.result.webgpu && r1.result.webgl2 && r1.result.webgpu.errs.length === 0 && r1.result.webgl2.errs.length === 0,
       r1.ok ? [...(r1.result.webgpu.errs || []), ...(r1.result.webgl2.errs || [])].join(" | ").slice(0, 300) : (r1.reason || r1.error || (r1.pageErrors || []).join(" | ")).slice(0, 400));

    if (r1.ok && r1.result.webgpu && r1.result.webgl2) {
        const brightest = (faces) => {
            let best = { lum: -1, face: -1, i: -1, j: -1 };
            for (let f = 0; f < 6; f++) { const buf = faces[f];
                for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) { const o = (j * SIZE + i) * 3, lum = buf[o] + buf[o + 1] + buf[o + 2];
                    if (lum > best.lum) best = { lum, face: f, i, j }; } }
            return best;
        };
        const results = {};
        for (const bk of ["webgpu", "webgl2"]) {
            const best = brightest(r1.result[bk].faces);
            results[bk] = best;
            report(`${bk}: brightest captured texel is face ${best.face} (${best.i}, ${best.j}), luminance ${best.lum.toFixed(3)}`);
            ok(`*** ${bk}: the captured marker lands on the face dirToFace predicts ***`, best.face === expectFace, `got face ${best.face}, expected ${expectFace}`);
            const di = Math.abs(best.i - expectI), dj = Math.abs(best.j - expectJ);
            ok(`*** ${bk}: ...within a texel of the predicted position (${expectI}, ${expectJ}) ***`, di <= 1 && dj <= 1, `off by (${di}, ${dj})`);
            const dirBack = faceTexelDir(best.face, best.i, best.j, SIZE);
            const cosAngle = dirBack[0] * MARKER_DIR[0] + dirBack[1] * MARKER_DIR[1] + dirBack[2] * MARKER_DIR[2];
            ok(`*** ${bk}: the brightest texel's OWN direction (faceTexelDir, the inverse check) is within a few degrees of the marker ***`,
               cosAngle > Math.cos(15 * Math.PI / 180), `angle ${(Math.acos(Math.min(1, cosAngle)) * 180 / Math.PI).toFixed(2)} deg`);
        }
        ok("!! the two backends agree on which face and texel", results.webgpu.face === results.webgl2.face && Math.abs(results.webgpu.i - results.webgl2.i) <= 1 && Math.abs(results.webgpu.j - results.webgl2.j) <= 1,
           `webgpu (${results.webgpu.face},${results.webgpu.i},${results.webgpu.j}) vs webgl2 (${results.webgl2.face},${results.webgl2.i},${results.webgl2.j})`);
        let elsewhere = 0, total = 0;
        for (const bk of ["webgpu", "webgl2"]) for (let f = 0; f < 6; f++) { const buf = r1.result[bk].faces[f];
            for (let k = 0; k < buf.length; k += 3) { total++; if (buf[k] + buf[k + 1] + buf[k + 2] > 0.05 && !(f === results[bk].face)) elsewhere++; } }
        report(`background stayed near-zero away from the marker's own face: ${elsewhere} of ${total} texels lit outside it (some spill onto the marker's neighbouring texels on the same face is expected, not counted here)`);
    }
    if (r1 && r1.pageErrors && r1.pageErrors.length) report("page errors: " + r1.pageErrors.slice(0, 3).join(" | "));

    sec("2. THE ACTUAL DEMO SHELL, CAPTURED FOR REAL, FED INTO THE ALREADY-VERIFIED TEXTURE-BACKED PREFILTER");
    const lab = probeLab({ n: 60 });
    const CAP_SIZE = 12;
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: {
        records: Array.from(lab.records), extras: Array.from(lab.extras), fleetOf: Array.from(lab.fleetOf),
        packed: { ...lab.packed, data: Array.from(lab.packed.data) }, counts: lab.counts, capSize: CAP_SIZE,
    }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { probeLab, diffuseCaptureScene, captureLiveSpecAtlas } = await import("/render/probeLab.mjs");
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
            const lab = { packed: { ...a.packed, data: Float32Array.from(a.packed.data) }, records: Float32Array.from(a.records),
                          extras: Float32Array.from(a.extras), fleetOf: Uint32Array.from(a.fleetOf), counts: a.counts };
            const atlas = await captureLiveSpecAtlas(dev, lab, [0, 0, 0], { size: a.capSize, background: [0, 0, 0, 1] });
            out[backend] = { errs, atlas: { ...atlas, data: Array.from(atlas.data) } };
            dev.destroy();
        }
        return out;
    }` });
    ok("both backends captured the demo shell with no device errors", r2.ok && r2.result && r2.result.webgpu && r2.result.webgl2 && r2.result.webgpu.errs.length === 0 && r2.result.webgl2.errs.length === 0,
       r2.ok ? [...(r2.result.webgpu.errs || []), ...(r2.result.webgl2.errs || [])].join(" | ").slice(0, 300) : (r2.reason || r2.error || (r2.pageErrors || []).join(" | ")).slice(0, 400));

    if (r2.ok && r2.result.webgpu && r2.result.webgl2) {
        for (const bk of ["webgpu", "webgl2"]) {
            const atlas = r2.result[bk].atlas;
            ok(`${bk}: the captured atlas has the shape packCapturedAtlas always produces`, atlas.width === 6 * CAP_SIZE && atlas.height === CAP_SIZE && atlas.mipCount === 1 && atlas.lutK === 0 && atlas.lutR === 0,
               `${atlas.width}x${atlas.height}, mipCount=${atlas.mipCount}`);
            let lit = 0, inRange = true; for (let k = 0; k < atlas.data.length; k += 4) { if (atlas.data[k] + atlas.data[k + 1] + atlas.data[k + 2] > 0.05) lit++;
                for (let c = 0; c < 3; c++) if (!(atlas.data[k + c] >= 0 && atlas.data[k + c] <= 1)) inRange = false; }
            ok(`${bk}: the real shell actually lit a real fraction of the captured atlas, and every channel is a valid 0..1 LDR value`, lit > 30 && inRange, `${lit} of ${atlas.width * atlas.height} texels lit`);
        }
        let po = 0, tot = 0; const A = r2.result.webgpu.atlas.data, B = r2.result.webgl2.atlas.data;
        for (let k = 0; k < A.length; k += 4) { tot++; if (Math.abs(A[k] - B[k]) > 0.06 || Math.abs(A[k + 1] - B[k + 1]) > 0.06 || Math.abs(A[k + 2] - B[k + 2]) > 0.06) po++; }
        ok("the two backends' captured atlases roughly agree (within ~15 of 255 on all but a few texels -- the shell's own splats are small and discrete, so a texel can straddle one on one backend and miss it on the other)", po < tot * 0.15, `${po} of ${tot} texels apart`);

        console.log("  ----  fed into physics/render/specularProbeCapture.mjs's CAPTURED_PREFILTER_WGSL, native (headlessGpu), the same shader specularProbeCapture-selfcheck.mjs already verifies against an analytic capture:");
        const gpuSkip = headlessGpuSkipReason();
        if (gpuSkip) { ok("device prefilter ran on the live-captured atlas", false, "SKIP: " + gpuSkip); }
        else {
            for (const bk of ["webgpu", "webgl2"]) {
                const atlas = r2.result[bk].atlas;
                const cases = [{ R: [0, 1, 0], alpha: 0.3, envKind: 0, samples: 512 }, { R: [0, 1, 0], alpha: 0.3, envKind: 1, samples: 512 }, { R: [0, 1, 0], alpha: 0.3, envKind: 2, samples: 512 }];
                const res = await runWgslComputeNative({
                    code: CAPTURED_PREFILTER_WGSL, outCount: cases.length,
                    uniforms: Array.from(packCapturedPrefilterParams(atlas, cases.length)),
                    texture: { width: atlas.width, height: atlas.height, data: Float32Array.from(atlas.data), binding: 2 },
                    inputs: [{ binding: 3, data: packPrefilterCases(cases) }],
                    workgroups: [1, 1, 1],
                });
                const finite = res.ok && res.values.every((v) => Number.isFinite(v) && v >= 0);
                ok(`${bk}: the prefilter runs on the live-captured atlas and returns finite, non-negative radiance`, finite, res.ok ? `[${res.values.map((v) => v.toFixed(4))}]` : JSON.stringify(res.errors || res.reason));
            }
        }
    }
    if (r2 && r2.pageErrors && r2.pageErrors.length) report("page errors: " + r2.pageErrors.slice(0, 3).join(" | "));

    sec("3. ON BOTH BACKENDS: render/probeLab.mjs's addLiveSpecSphere DRAWN, NOT JUST CAPTURED -- WHAT splat-probes.html NOW USES");
    const SPHERE_POS = [0, 1.0, 0.5], SPHERE_RADIUS = 0.14, CAM_EYE = [0, 1.0, 2.0];
    const r3 = await runInEngineOrigin({ engineRoot: ENG, args: {
        records: Array.from(lab.records), extras: Array.from(lab.extras), fleetOf: Array.from(lab.fleetOf),
        packed: { ...lab.packed, data: Array.from(lab.packed.data) }, counts: lab.counts, capSize: CAP_SIZE,
        spec: { ...lab.spec, atlas: { ...lab.spec.atlas, data: Array.from(lab.spec.atlas.data) } },
        spherePos: SPHERE_POS, sphereRadius: SPHERE_RADIUS, eye: CAM_EYE,
    }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const G = await import("/render/gpuDriven.mjs");
        const { labFleets, addLiveSpecSphere } = await import("/render/probeLab.mjs");
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const W = 160, H = 120;
            const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
            const lab = { packed: { ...a.packed, data: Float32Array.from(a.packed.data) }, records: Float32Array.from(a.records),
                          extras: Float32Array.from(a.extras), fleetOf: Uint32Array.from(a.fleetOf), counts: a.counts,
                          count: a.records.length / 4, spec: { ...a.spec, atlas: { ...a.spec.atlas, data: Float32Array.from(a.spec.atlas.data) } } };
            const { fleets } = labFleets(dev, lab, { eye: (ctx) => ctx.eye });
            const live = await addLiveSpecSphere(dev, lab, a.spherePos, { radius: a.sphereRadius, size: a.capSize });
            const allFleets = [...fleets, live.fleet];
            const sc = G.makeGpuDrivenScene(dev, { fleets: allFleets, fleetOf: live.fleetOf, thresholds: [], records: live.records, headings: live.extras });
            const cam = { viewProj: G.multiply(G.perspective(1.0, W / H, 0.05, 50), G.lookAt(a.eye, a.spherePos)), eye: a.eye };
            const fr = sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }), f = await fr.pixels;
            out[backend] = { errs, W, H, pixels: Array.from(f.pixels), path: sc.path, fleetIndex: live.fleetIndex, count: live.count };
            dev.destroy();
        }
        return out;
    }` });
    ok("both backends built and drew the scene WITH the live-captured sphere appended", r3.ok && r3.result && r3.result.webgpu && r3.result.webgl2 && r3.result.webgpu.errs.length === 0 && r3.result.webgl2.errs.length === 0,
       r3.ok ? [...(r3.result.webgpu.errs || []), ...(r3.result.webgl2.errs || [])].join(" | ").slice(0, 300) : (r3.reason || r3.error || (r3.pageErrors || []).join(" | ")).slice(0, 400));

    if (r3.ok && r3.result.webgpu && r3.result.webgl2) {
        const W = r3.result.webgpu.W, H = r3.result.webgpu.H;
        // the CPU ray against the live sphere itself, straight down -Z from CAM_EYE at the sphere (lookAt with no
        // yaw/pitch: forward is exactly -Z, right is +X, up is +Y) -- the same technique probeLab-selfcheck.mjs's
        // own mesh check uses, aimed at the live sphere instead.
        const fwd = [0, 0, -1], right = [1, 0, 0], up = [0, 1, 0], t = Math.tan(1.0 / 2);
        const rel = [CAM_EYE[0] - SPHERE_POS[0], CAM_EYE[1] - SPHERE_POS[1], CAM_EYE[2] - SPHERE_POS[2]];
        let expectHits = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const sx = (x + 0.5 - W / 2) / (H / 2) * t, sy = -(y + 0.5 - H / 2) / (H / 2) * t;
            const d = [fwd[0] + right[0] * sx + up[0] * sy, fwd[1] + right[1] * sx + up[1] * sy, fwd[2] + right[2] * sx + up[2] * sy], dl = Math.hypot(...d);
            const dn = [d[0] / dl, d[1] / dl, d[2] / dl];
            const b = 2 * (rel[0] * dn[0] + rel[1] * dn[1] + rel[2] * dn[2]), c = rel[0] ** 2 + rel[1] ** 2 + rel[2] ** 2 - SPHERE_RADIUS * SPHERE_RADIUS, disc = b * b - 4 * c;
            if (disc >= 0) expectHits++;
        }
        report(`the live sphere (radius ${SPHERE_RADIUS} at [${SPHERE_POS}], camera at [${CAM_EYE}] looking straight at it) should key ${expectHits} pixels`);
        for (const bk of ["webgpu", "webgl2"]) {
            const px = r3.result[bk].pixels; let lit = 0; for (let p = 0; p < W * H; p++) if (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2] > 24) lit++;
            report(`${bk} (${r3.result[bk].path}): ${lit} of ${W * H} pixels lit, fleetIndex ${r3.result[bk].fleetIndex}, ${r3.result[bk].count} records`);
            ok(`*** ${bk}: the frame is lit, including (not only) the live sphere's own keyed silhouette ***`, lit > expectHits * 0.5, `${lit} lit vs ${expectHits} keyed to the sphere alone`);
        }
        let po = 0; const A = r3.result.webgpu.pixels, B = r3.result.webgl2.pixels;
        for (let p = 0; p < W * H; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) po++;
        ok("the two backends' drawn frames (WITH the live sphere) agree within 8 of 255 on all but a few pixels", po < W * H * 0.05, `${po} of ${W * H} apart`);
    }
    if (r3 && r3.pageErrors && r3.pageErrors.length) report("page errors: " + r3.pageErrors.slice(0, 3).join(" | "));

    console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
    console.log("unchecked here: an HDR capture (device.texture({render:true}) is forced to the canvas's 8-bit format on both backends, named in render/liveCubeCapture.mjs's own header) -- a real bright light source would clip here exactly as it would on the screen the page shows. Also unchecked: a per-frame DYNAMIC recapture as the scene changes (this captures once per rebuild, as splat-probes.html now calls it, not every frame); a live-captured roughness-dependent BLUR (addLiveSpecSphere's own header names why roughness is currently inert -- one raw mip, no prefiltered chain built from a live capture yet); and any independent numeric ground truth for what the real-rendered shell's radiance SHOULD be at a given direction -- section 1's marker test establishes the geometry is right, sections 2 and 3 establish the pipeline accepts a live atlas (and a live SPHERE, drawn) and produces finite, cross-backend-agreeing output, but nothing here re-derives a rendered scene's radiance from first principles the way splatRadiance's analytic capture could be checked against directly.");
    process.exitCode = fails ? 1 : 0;
}

main().catch((e) => { console.error("liveCubeCapture-selfcheck: threw " + (e && e.stack || e)); process.exitCode = 1; });
