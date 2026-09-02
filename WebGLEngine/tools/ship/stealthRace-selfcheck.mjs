#!/usr/bin/env node
// WebGLEngine/tools/ship/stealthRace-selfcheck.mjs -- v4318
//
// GRADES A RACE THAT LIVES IN THE DEPTH PYRAMID. Level 13's Hi-Z cull hides a record whose nearest point is behind
// everything in front of it (depth > far over its footprint, far the max-depth pyramid of the last frame). v4318
// gives every record a STEALTH BIAS in extra.w: a positive bias hides it when it is within that margin of being
// occluded -- level with or just in front of whatever covers its footprint -- and never against the open sky.
// No CPU logic: the cull reads the pyramid, the pyramid is the last frame's depth. The claim is counted on
// WebGPU (the only backend with the pyramid) and checked record by record against the twin with the pyramid
// the device built: a stealth record just in front of a wall vanishes, the same record with bias 0 does not,
// and a stealth record over open sky stays.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
// the scene: a wall (one big record) at z = -4, a stealth record just in front of it, the same place with bias 0, and a stealth record over open sky
const BIAS = 0.05;
const records = Float32Array.from([0, 0, -4, 2,   0, 0.4, -1.9, 0.15,   0, -0.4, -1.9, 0.15,   1.8, 0, -1.9, 0.15]);
const names = ["wall", "stealth-before-wall", "plain-before-wall", "stealth-over-sky"];
const extras = G.defaultExtras(4); extras[1 * G.EXTRA_FLOATS + 3] = BIAS; extras[3 * G.EXTRA_FLOATS + 3] = BIAS;
const CAM = { eye: [0, 0, 3], target: [0, 0, -4], fov: 0.9, near: 0.1, far: 100 };

console.log("\n1. THE TEST ON THE CPU: the bias is in the WGSL and in the twin, and the twin's verdicts are the story");
{
    const w = G.cullLodWgsl({ occlusion: true });
    ok("the occluding cull passes extra.w to hizOccluded as the bias, and validates", /hizOccluded\(c, occ, &hiz, extras\[i\]\.w\)/.test(w) && /far < 1\.0 && depth \+ bias > far/.test(w) && validateWgsl(w).length === 0);
    // a synthetic pyramid: a 16x16 depth image with the wall's depth over the middle and 1 (sky) around
    const N = 16, proj = G.perspective(CAM.fov, 1, CAM.near, CAM.far), view = G.lookAt(CAM.eye, CAM.target), vp = G.multiply(proj, view);
    const wallDepth = G.project(vp, [0, 0, -4])[2], frontDepth = G.project(vp, [0, 0.4, -1.9])[2];   // the pipeline's depth: clip z, 0..1
    const depth = new Float32Array(N * N).fill(1); for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) depth[y * N + x] = wallDepth;
    const built = G.hizPyramidCpu(depth, N, N), pyr = built.pyramid || built, L = G.hizLayout(N, N), u = G.packOccUniforms({ view, proj, w: N, h: N, levels: L.levels.length, enabled: true });
    const v1 = G.hizOccludedCpu([0, 0.4, -1.9, 0.15], u, pyr, BIAS), v2 = G.hizOccludedCpu([0, -0.4, -1.9, 0.15], u, pyr, 0), v3 = G.hizOccludedCpu([1.8, 0, -1.9, 0.15], u, pyr, BIAS);
    ok(`the front record's depth is within the bias of the wall's (${(wallDepth - frontDepth).toFixed(4)} apart, bias ${BIAS}) and not behind it`, frontDepth < wallDepth && wallDepth - frontDepth < BIAS);
    ok("*** the twin: the stealth record before the wall is HIDDEN, the plain one at the same depth is NOT, the stealth one over the sky is NOT ***", v1.occluded === true && v2.occluded === false && v3.occluded === false, `stealth ${v1.occluded} (depth ${v1.depth.toFixed(4)}, far ${v1.far.toFixed(4)}), plain ${v2.occluded}, sky ${v3.occluded} (far ${v3.far})`);
}

console.log("\n2. ON WEBGPU, WITH THE PYRAMID THE DEVICE BUILT: frame 2 drops the stealth record and only it, and the twin agrees record by record");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 128, CAM, records: Array.from(records), extras: Array.from(extras) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = new Float32Array(a.records), extras = new Float32Array(a.extras);
        const lods = () => [{ name: "coarse", mesh: G.quadMesh(1, [1, 0, 0, 1]) }, { name: "fine", mesh: G.quadMesh(2, [0, 1, 0, 1]) }];
        const proj = G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), view = G.lookAt(a.CAM.eye, a.CAM.target), viewProj = G.multiply(proj, view);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: [0.1], records, occlusion: true, headings: extras });
            const f1 = sc.frame({ viewProj, view, proj, eye: a.CAM.eye }); const c1 = await sc.readCounts();
            const pyr = await sc.readPyramid();
            const f2 = sc.frame({ viewProj, view, proj, eye: a.CAM.eye }); const c2 = await sc.readCounts();
            const kept = []; const rec = await sc.readRecords(); const cap = 4; for (let l = 0; l < 2; l++) for (let k = 0; k < c2[l]; k++) kept.push(rec[(l * cap + k) * G.OUT_RECORD_FLOATS + 4]);
            out[backend] = { backend: dev.backend, occlusion: sc.occlusion, c1, c2, used2: f2.pyramidUsed, occU: f2.occUniforms ? Array.from(f2.occUniforms) : null, pyramid: pyr ? Array.from(pyr.pyramid) : null, kept: kept.sort() };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu) {
        const W = r.result.webgpu, sum = (c) => c.reduce((x, y) => x + y, 0);
        ok("webgpu: frame 1 has no pyramid and draws all four; frame 2 uses the pyramid frame 1 built", W.occlusion && sum(W.c1) === 4 && W.used2 === true, `frame 1 ${W.c1.join("/")}, frame 2 ${W.c2.join("/")}`);
        ok("*** webgpu: frame 2 draws THREE -- the wall, the plain record before it and the stealth record over the sky; the stealth record before the wall is gone, with no CPU deciding it ***", sum(W.c2) === 3 && W.kept.join() === "0,2,3", `kept records ${W.kept.join(", ")} (${W.kept.map((i) => names[i]).join(", ")})`);
        if (W.occU && W.pyramid) { const u = new Float32Array(W.occU); const verdicts = [];
            for (let i = 0; i < 4; i++) verdicts.push(G.hizOccludedCpu([records[i * 4], records[i * 4 + 1], records[i * 4 + 2], records[i * 4 + 3]], u, new Float32Array(W.pyramid), extras[i * G.EXTRA_FLOATS + 3]).occluded);
            ok("  the twin, given the device's own pyramid, hides exactly the record the device hid", verdicts.join() === "false,true,false,false", verdicts.map((v, i) => `${names[i]}: ${v ? "hidden" : "kept"}`).join(", ")); }
        const L = r.result.webgl2;
        ok("webgl2 is said to be what it is: no pyramid (the flag is recorded and ignored), all four drawn on both frames, the depth test hiding nothing here because nothing is behind the wall", L.occlusion === false && sum(L.c1) === 4 && sum(L.c2) === 4, `frame 2 ${L.c2.join("/")}`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4318.
//   A  the sky guard removed (hidden whenever depth + bias > far, far = 1 included) -> exit=1, 2 red: frame 2 keeps only the
//      wall and the plain record -- the stealth record over open sky is hidden by the sky itself -- and the source line that
//      names the guard is gone.
//   B  the cull passing 0 for the bias (extra.w ignored) -> exit=1, 2 red: frame 2 keeps all four; the stealth record before the
//      wall is drawn, because without the bias it is what it geometrically is, 0.006 in front of the wall and not occluded.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a RACE wearing it in the page (the fleets carry extra.w = 0; a Stealth race would set it from its policy, which nobody has " +
    "written); the bias against a moving occluder over many frames (one frame's lag is Level 13's known gap, and stealth inherits it); " +
    "and WebGL2, which has no pyramid and so no stealth -- said in the gate, not hidden.");
process.exit(fails ? 1 : 0);
