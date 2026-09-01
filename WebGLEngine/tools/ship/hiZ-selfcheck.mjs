#!/usr/bin/env node
// WebGLEngine/tools/ship/hiZ-selfcheck.mjs -- v4299 (Level 12)
//
// GRADES LEVEL 12's OCCLUSION: A DEPTH PYRAMID BUILT BY COMPUTE, AND A CULL THAT DROPS WHAT IS HIDDEN BEHIND IT.
//
// The oracle is the twin again, and this time the twin is handed the GPU's OWN DEPTH IMAGE: gfx/device.js reads
// the depth32float attachment back with the frame, render/gpuDriven.mjs hizPyramidCpu() max-reduces it the way
// the compute pass does, and the two pyramids have to agree to the bit -- max is exact, so anything but 0
// differing is a wrong index, not rounding. Then the twin's per-instance verdicts, with the same view and
// projection, predict which records the GPU kept, and the strongest claim of all: THE PICTURE DOES NOT CHANGE.
// Occlusion culling saves work, never pixels; frame 2 (culled) must equal frame 1 (not culled) exactly.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";
import { CAPABILITIES } from "../../gfx/device.js";
import { census } from "./wgslCorpus.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 128, CAM = { eye: [0, 0, 3], target: [0, 0, -5], fov: Math.PI / 3, near: 0.1, far: 100 };
/** One wall (radius 1 at z = -3) and an 8x8 grid of small bodies at z = -12; the middle 4x4 sit in its shadow. */
const scene = () => { const r = [0, 0, -3, 1.0]; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) r.push((x - 3.5) * 1.2, (y - 3.5) * 1.2, -12, 0.3); return new Float32Array(r); };
const records = scene(), COUNT = records.length / 4;
const proj = G.perspective(CAM.fov, 1, CAM.near, CAM.far), view = G.lookAt(CAM.eye, CAM.target), viewProj = G.multiply(proj, view);

console.log("\n1. THE SHADERS, THE BINDINGS, THE TWIN");
{
    ok("the occluding cull validates", validateWgsl(G.cullLodWgsl({ occlusion: true })).length === 0);
    ok("  and adds exactly three bindings to the plain one: the occlusion uniforms, the pyramid, the rejected set",
        parseBindings(G.cullLodWgsl({ occlusion: true })).map((b) => `${b.binding}:${b.name}`).join(",") === "0:cull,1:inst,2:cmds,3:records,4:occ,5:hiz,6:rejected" && parseBindings(G.cullLodWgsl()).length === 4);
    ok("  the two pyramid builders validate and declare only what they read", validateWgsl(G.hizLevel0Wgsl()).length === 0 && validateWgsl(G.hizReduceWgsl()).length === 0 &&
        parseBindings(G.hizLevel0Wgsl()).some((b) => b.type === "texture_depth_2d") && !parseBindings(G.hizReduceWgsl()).some((b) => /texture/.test(b.type)));
    const un = census().filter((f) => !f.accounted && /gpuDriven/.test(f.file));
    ok("  every WGSL producer in render/gpuDriven.mjs is accounted for in the corpus", un.length === 0, un.map((u) => u.symbol).join(", ") || "all accounted");
    ok("gfx/device.js reports depth on both backends and depth READBACK on WebGPU only", CAPABILITIES.webgpu.depth && CAPABILITIES.webgl2.depth && CAPABILITIES.webgpu.depthRead && !CAPABILITIES.webgl2.depthRead);
    // the twin's pyramid on a synthetic image: the top level is the image max, every level is a max of the one below
    const w = 7, h = 5, img = new Float32Array(w * h).map((_, i) => ((i * 37) % 101) / 101);
    const P = G.hizPyramidCpu(img, w, h);
    ok("hizPyramidCpu: odd sizes reduce to 1x1 and the top is the image's maximum", P.layout.levels.at(-1).w === 1 && P.pyramid[P.layout.total - 1] === Math.max(...img), `${P.layout.levels.map((l) => l.w + "x" + l.h).join(" > ")}`);
    let mono = true; for (let l = 1; l < P.layout.levels.length; l++) { const d = P.layout.levels[l]; for (let i = 0; i < d.w * d.h; i++) if (P.pyramid[d.off + i] > P.pyramid[P.layout.total - 1]) mono = false; }
    ok("  no level exceeds the top", mono);
    // A flat pyramid at the depth of a point 10 units out. Depth is NOT linear in distance -- with near 0.1 and
    // far 100 a depth of 0.5 is about 0.3 units from the eye, which is why the value is projected, not guessed.
    const flat = G.project(proj, [0, 0, -10])[2];
    const pyr = new Float32Array(G.hizLayout(N, N).total).fill(flat);
    const u = G.packOccUniforms({ view, proj, w: N, h: N, levels: G.hizLayout(N, N).levels.length, enabled: true });
    const near = G.hizOccludedCpu([0, 0, -1, 0.2], u, pyr), far = G.hizOccludedCpu([0, 0, -50, 0.2], u, pyr);
    ok("CONTROL: against a flat pyramid 10 units out, a sphere at 4 is visible and one at 53 is occluded", near.occluded === false && far.occluded === true, `flat ${flat.toFixed(4)}, near depth ${near.depth.toFixed(4)}, far depth ${far.depth.toFixed(4)}`);
    ok("  a sphere touching the camera plane is never judged occluded", G.hizOccludedCpu([0, 0, 2.9, 0.5], u, pyr).occluded === false);
    ok("  and with the pyramid disabled nothing is", G.hizOccludedCpu([0, 0, -50, 0.2], G.packOccUniforms({ view, proj, w: N, h: N, levels: 8, enabled: false }), pyr).occluded === false);
}

console.log("\n2. ON THE GPU: BUILD THE PYRAMID, CULL WITH IT, AND CHANGE NOTHING VISIBLE");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CAM, scene: Array.from(records) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = new Float32Array(a.scene);
        const lods = () => [{ name: "coarse", mesh: G.quadMesh(1, [1, 0, 0, 1]) }, { name: "fine", mesh: G.quadMesh(2, [0, 1, 0, 1]) }];
        const proj = G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), view = G.lookAt(a.CAM.eye, a.CAM.target), viewProj = G.multiply(proj, view);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: [0.1], records, occlusion: true });
            const o = { backend: dev.backend, occlusion: sc.occlusion };
            const f1 = sc.frame({ viewProj, view, proj, eye: a.CAM.eye, read: true }); const p1 = await f1.pixels;
            o.counts1 = await sc.readCounts(); o.used1 = f1.pyramidUsed; o.built1 = f1.pyramidBuilt;
            const pyr = await sc.readPyramid();
            const f2 = sc.frame({ viewProj, view, proj, eye: a.CAM.eye, read: true }); const p2 = await f2.pixels;
            o.counts2 = await sc.readCounts(); o.used2 = f2.pyramidUsed; o.occU = f2.occUniforms ? Array.from(f2.occUniforms) : null;
            o.records2 = Array.from(await sc.readRecords());
            let diff = 0; for (let i = 0; i < p1.pixels.length; i++) if (p1.pixels[i] !== p2.pixels[i]) diff++;
            o.diff12 = diff; o.pixels = Array.from(p2.pixels); o.depth1 = p1.depth ? Array.from(p1.depth) : null;
            o.pyramid = pyr ? Array.from(pyr.pyramid) : null; o.levels = pyr ? pyr.layout.levels.length : 0;
            o.depthWallCentre = p1.depth ? p1.depth[(a.N / 2) * a.N + a.N / 2] : null; o.depthCorner = p1.depth ? p1.depth[0] : null;
            sc.destroy(); dev.destroy(); out[backend] = o;
        }
        return out;
    }` });
    ok("*** both backends draw the occluding scene ***", r.ok, r.ok ? "" : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, L = r.result.webgl2;
        ok("WebGPU took occlusion and WebGL2 recorded the flag off (no compute to build a pyramid)", W.occlusion === true && L.occlusion === false);
        ok("*** frame 1 has no pyramid and draws everything in the frustum; frame 2 uses the one frame 1 built ***", W.used1 === false && W.built1 === true && W.used2 === true && W.counts1.join() === "1,64", `frame 1 counts ${W.counts1.join("/")}`);
        ok("CONTROL: the depth image has the wall in the middle and nothing at the corner", W.depthWallCentre < 1 && W.depthCorner === 1, `centre ${W.depthWallCentre.toFixed(4)}, corner ${W.depthCorner}`);
        const P = G.hizPyramidCpu(new Float32Array(W.depth1), N, N);
        let pd = 0; for (let i = 0; i < P.pyramid.length; i++) if (P.pyramid[i] !== W.pyramid[i]) pd++;
        ok("*** the GPU's pyramid equals the CPU reduction of the GPU's own depth image, TO THE BIT ***", pd === 0 && W.pyramid.length === P.layout.total, `${P.layout.total} values over ${W.levels} levels, ${pd} differ`);
        const u = new Float32Array(W.occU);
        let occl = 0, minMargin = Infinity; const keep = [];
        for (let i = 0; i < COUNT; i++) { const c = [records[i * 4], records[i * 4 + 1], records[i * 4 + 2], records[i * 4 + 3]]; const v = G.hizOccludedCpu(c, u, P.pyramid);
            if (v.occluded) occl++; else keep.push(c.join(",")); if (v.depth != null) minMargin = Math.min(minMargin, Math.abs(v.depth - v.far)); }
        ok("*** frame 2 kept exactly the instances the twin says are not hidden ***", W.counts2.join() === `1,${64 - occl}`, `gpu ${W.counts2.join("/")}, twin hides ${occl} of 64 behind the wall`);
        ok("CONTROL: the twin hides the 4x4 in the wall's shadow and no others", occl === 16);
        ok("CONTROL: the closest verdict is well clear of a tie", minMargin > 1e-4, `min |depth - far| ${minMargin.toExponential(2)}`);
        const cap = COUNT, gotSet = []; for (let l = 0; l < 2; l++) for (let k = 0; k < W.counts2[l]; k++) gotSet.push(W.records2.slice((l * cap + k) * G.OUT_RECORD_FLOATS, (l * cap + k) * G.OUT_RECORD_FLOATS + 4).join(","));
        ok("  and they are the SAME instances, as a set", gotSet.sort().join("|") === keep.sort().join("|"));
        ok("*** the culled frame is pixel-identical to the unculled one: occlusion saved work and no pixels ***", W.diff12 === 0, `${W.diff12} of ${N * N} differ between frame 1 and frame 2`);
        ok("  WebGL2 drew all 65 both frames and the depth test hid the same 16", L.counts1.join() === "1,64" && L.counts2.join() === "1,64" && L.diff12 === 0);
        const hist = (P2) => { const c = {}; for (let i = 0; i < P2.length; i += 4) { const k = P2[i] + "," + P2[i + 1] + "," + P2[i + 2]; c[k] = (c[k] || 0) + 1; } return JSON.stringify(c, Object.keys(c).sort()); };
        const colAt = (P2, x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? -1 : P2[(y * N + x) * 4] * 65536 + P2[(y * N + x) * 4 + 1] * 256 + P2[(y * N + x) * 4 + 2];
        const boundary = (P2, x, y) => { const c = colAt(P2, x, y); return colAt(P2, x + 1, y) !== c || colAt(P2, x - 1, y) !== c || colAt(P2, x, y + 1) !== c || colAt(P2, x, y - 1) !== c; };
        let diff = 0, interior = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (colAt(W.pixels, x, y) !== colAt(L.pixels, x, y)) { diff++; if (!(boundary(W.pixels, x, y) && boundary(L.pixels, x, y))) interior++; }
        ok("  the two backends draw the same number of pixels per colour, differing only on quad edges", hist(W.pixels) === hist(L.pixels) && interior === 0, `${diff} of ${N * N} differ, ${interior} interior`);
        ok("  the wall's green covers the centre on both", colAt(W.pixels, N / 2, N / 2) === 0x00ff00 && colAt(L.pixels, N / 2, N / 2) === 0x00ff00);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, file restored (cmp-identical). MEASURED at Level 12.
//   A  the reduce's max replaced by min -> exit=1, 1 red: the pyramid disagrees with the CPU reduction on 554 of
//      21,845 values. Nothing else moves: a min-pyramid occludes NOTHING here, so counts, sets and pixels stay
//      right for the wrong reason, and only the bit-exact comparison sees it.
//   B  the verdict inverted (depth < far) -> exit=1, 5 red: frame 2 keeps 0/16 (the 16 hidden ones and none of
//      the visible), the record set differs, 2,594 pixels change between frames, and 2,233 interior pixels differ
//      from WebGL2 -- the picture line is the one a user would see.
//   C  the pyramid never rebuilt -> exit=1, 3 red: frame 2 has no pyramid to use, the pyramid readback is the
//      1x1 placeholder (21,845 differ over 1 level), and the twin's 16 are not found.
//   D  (Level 13) the second phase's dispatch removed -> exit=1, 2 red: the two-phase frame differs from the
//      unoccluded one by the same 228 pixels a single phase does, and phase 2 draws 0/0 against the 12 it owed.
//   0  (found, not planted) one module with two entry points: the level0 pipeline demanded a depth texture that
//      reduce cannot bind -- gfx/device.js builds a bind group from every binding a MODULE declares. Two modules.
console.log("\n3. THE MOVING CAMERA: ONE PHASE DROPS WHAT JUST CAME INTO VIEW, TWO PHASES DO NOT");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    // Frame 1 from CAM: the wall hides the middle 4x4. Frame 2 from CAM2, three units to the side: the wall's
    // shadow has moved, and bodies that were hidden are in plain view -- but last frame's pyramid still says
    // hidden. A single phase culls them (the picture is wrong for a frame); the second phase re-tests them
    // against THIS frame's pyramid and draws them on top. The reference is the same frame with no occlusion.
    const CAM2 = { ...CAM, eye: [3, 0, 3], target: [3, 0, -5] };
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CAM, CAM2, scene: Array.from(records) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = new Float32Array(a.scene);
        const lods = () => [{ name: "coarse", mesh: G.quadMesh(1, [1, 0, 0, 1]) }, { name: "fine", mesh: G.quadMesh(2, [0, 1, 0, 1]) }];
        const cam = (C) => { const proj = G.perspective(C.fov, 1, C.near, C.far), view = G.lookAt(C.eye, C.target); return { proj, view, viewProj: G.multiply(proj, view), eye: C.eye }; };
        const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const out = {};
        for (const mode of [false, true, "twoPhase"]) {
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: [0.1], records, occlusion: mode });
            const c1 = cam(a.CAM), c2 = cam(a.CAM2);
            await sc.frame({ ...c1, read: true }).pixels;
            const f2 = sc.frame({ ...c2, read: true }); const p2 = await f2.pixels;
            out[String(mode)] = { pixels: Array.from(p2.pixels), counts: await sc.readCounts(), counts2: await sc.readCounts2(), phase2Ran: f2.phase2Ran, twoPhase: sc.twoPhase };
            sc.destroy();
        }
        dev.destroy(); return out;
    }` });
    ok("*** the scene renders in all three modes ***", r.ok, r.ok ? "" : r.reason);
    if (r.ok) {
        const ref = r.result["false"], one = r.result["true"], two = r.result["twoPhase"];
        const diff = (A, B) => { let d = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) d++; return d; };
        ok("*** a single phase DROPS bodies the moved camera revealed: its frame differs from the unoccluded one ***", diff(one.pixels, ref.pixels) > 0 && one.counts[1] < ref.counts[1], `${diff(one.pixels, ref.pixels)} pixels wrong, ${ref.counts[1] - one.counts[1]} bodies missing`);
        ok("*** two phases draw them in the same frame: pixel-identical to the unoccluded frame ***", diff(two.pixels, ref.pixels) === 0 && two.phase2Ran === true && two.twoPhase === true, `${diff(two.pixels, ref.pixels)} pixels differ`);
        ok("  and phase 2 drew exactly the bodies phase 1 lost", two.counts2 && two.counts[1] + two.counts2[1] === ref.counts[1] && two.counts2[1] === ref.counts[1] - one.counts[1], `phase 1 ${two.counts.join("/")} + phase 2 ${(two.counts2 || []).join("/")} = reference ${ref.counts.join("/")}`);
        ok("CONTROL: phase 2 did not simply redraw everything", two.counts2 && two.counts2[1] < two.counts[1]);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what the second phase COSTS -- it re-culls the rejected set and draws again, which is " +
    "the price of never dropping a frame's worth of bodies, and this box cannot time it. Level 13 closed the " +
    "moving-camera gap Level 12 named (section 3); a phase-0 body that moved BEHIND something this frame is still " +
    "drawn, which the depth test hides at the cost of its pixels. Also unchecked: the pyramid's cost at a real resolution, and the " +
    "GL-style projection's z range on WebGPU (clip z < 0 is discarded there, so a sphere closer than ~2x near " +
    "is clipped on one backend and not the other; this scene keeps clear of it).");
process.exit(fails ? 1 : 0);
