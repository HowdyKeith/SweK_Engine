#!/usr/bin/env node
// WebGLEngine/physics/render/specularIBLWgsl-selfcheck.mjs -- v4578
//
// Run: node physics/render/specularIBLWgsl-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE WHOLE PIPELINE, END TO END, ON A REAL DEVICE: BAKE -> PACK -> SAMPLE. *** A real mip chain and BRDF
// LUT (the same splatRadiance hotspot fixture specularProbeBake-selfcheck.mjs uses, for continuity across this
// arc) are packed into one flat atlas and handed to the WGSL sampler through tools/ship/headlessGpu.mjs's native
// path. The CPU reference (specularIBLSample.mjs) reads the SAME packed atlas, not the unpacked mip/lut data, so
// what is graded is the SAMPLING logic -- dirToFace, bilinear-per-mip, mip blend, LUT lookup, BRDF combine --
// not whether packing round-trips (specularProbeBake-selfcheck.mjs and the CPU checks in this file already
// cover that separately).
"use strict";
import { runWgslComputeNative, headlessGpuSkipReason } from "../../tools/ship/headlessGpu.mjs";
import { SPECULAR_IBL_VERIFY_WGSL, packSpecularParams, packSpecularCases } from "./specularIBLWgsl.mjs";
import { packSpecularAtlas, sampleSpecularAtlas, evaluateSpecularIBL } from "./specularIBLSample.mjs";
import { bakeMipChain } from "./specularProbeBake.mjs";
import { brdfLut } from "./splitSum.mjs";
import { splatRadiance } from "../../render/splatProbes.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);

const CLOUD = { count: 1, positions: Float32Array.from([0, 0, 5]), scales: Float32Array.from([1.2, 1.2, 1.2]) };
const COLOURS = Float32Array.from([20, 2, 2]);
const BACKGROUND = [0.1, 0.12, 0.2];
const radianceOf = splatRadiance(CLOUD, COLOURS, BACKGROUND);
const PROBE_POS = [0, 0, 0];

async function main() {
    const skip = headlessGpuSkipReason();
    if (skip) { ok("device jobs ran", false, "SKIP: " + skip + " -- this gate's whole subject is the device sampler"); console.log("\nspecularIBLWgsl-selfcheck: 1 FAILED"); process.exit(1); }

    console.log("1. *** BAKE, PACK, AND DISPATCH THE WHOLE SPECULAR-IBL SAMPLER AGAINST THE CPU REFERENCE ***");
    const mips = bakeMipChain(radianceOf, PROBE_POS, { mipCount: 4, faceSize0: 6, minFaceSize: 3, samples: 32 });
    const lut = brdfLut({ K: 8, R: 8, samples: 128 });
    const atlas = packSpecularAtlas(mips, lut);
    report(`atlas ${atlas.width}x${atlas.height}, ${mips.length} mips, faceSize0=${atlas.faceSize0}, LUT ${atlas.lutK}x${atlas.lutR} at y=${atlas.lutYOffset}`);

    const cases = [
        { dir: [0, 0, 1], roughness: 0.0, mu: 0.9, F0: [0.04, 0.04, 0.04] },   // near-mirror, straight at the hotspot's face
        { dir: [0, 0, 1], roughness: 0.5, mu: 0.9, F0: [0.9, 0.6, 0.6] },       // mid-rough, coloured metal-ish F0
        { dir: [0, 0, 1], roughness: 1.0, mu: 0.5, F0: [1.0, 1.0, 1.0] },       // fully rough, mirror F0
        { dir: [1, 0, 0], roughness: 0.33, mu: 0.7, F0: [0.04, 0.04, 0.04] },  // a different face entirely
        { dir: [0.5, 0.5, 0.707], roughness: 0.66, mu: 0.3, F0: [0.2, 0.5, 0.8] }, // an oblique direction, no face axis-aligned
        { dir: [-1, 0, 0], roughness: 0.15, mu: 0.95, F0: [0.04, 0.04, 0.04] },
    ];
    const packedCases = packSpecularCases(cases);
    const res = await runWgslComputeNative({
        code: SPECULAR_IBL_VERIFY_WGSL, outCount: cases.length * 3,
        uniforms: Array.from(packSpecularParams(atlas, cases.length)),
        inputs: [{ binding: 2, data: atlas.data }, { binding: 3, data: packedCases }],
        workgroups: [Math.ceil(cases.length / 32), 1, 1],
    });
    ok("!! the shader compiles and runs", res.ok, res.ok ? "" : JSON.stringify(res.errors || res.reason));

    if (res.ok) {
        let worst = 0, worstAt = "";
        cases.forEach((c, i) => {
            const n = Math.hypot(...c.dir), dir = c.dir.map((x) => x / n);
            const cpu = evaluateSpecularIBL(atlas, dir, c.roughness, c.mu, c.F0);
            const gpu = [res.values[i * 3], res.values[i * 3 + 1], res.values[i * 3 + 2]];
            const relErr = [0, 1, 2].map((ch) => Math.abs(gpu[ch] - cpu[ch]) / Math.max(1e-6, Math.abs(cpu[ch])));
            const worstCh = Math.max(...relErr);
            report(`case ${i} dir=[${dir.map((x) => x.toFixed(2))}] rough=${c.roughness}: cpu=[${cpu.map((x) => x.toFixed(5))}] gpu=[${gpu.map((x) => x.toFixed(5))}] worst-rel=${worstCh.toExponential(2)}`);
            if (worstCh > worst) { worst = worstCh; worstAt = `case ${i}`; }
        });
        ok("!! *** DEVICE SAMPLER AGREES WITH THE CPU REFERENCE ACROSS EVERY CASE -- SAME PACKED ATLAS, INDEPENDENT SAMPLING CODE ***",
           worst < 1e-4,
           `worst relative disagreement across ${cases.length} cases: ${worst.toExponential(2)} at ${worstAt}. dirToFace, bilinear-per-mip, the mip blend and the BRDF-LUT lookup are all exercised by these six cases (three faces, five roughness levels, one oblique direction with no axis alignment).`);
    }

    console.log("\n2. *** SABOTAGE: A WRONG FACE-COLUMN OFFSET (faceSize0 UNDERSTATED) IS CAUGHT ***");
    {
        // A realistic packing/sampling mismatch: the sampler is told each face column is NARROWER than it
        // really is (faceSize0 - 1 instead of faceSize0), so every face past the first reads a few columns
        // shifted -- a one-line transcription error between the packer and the shader's own copy of the layout.
        //
        // *** THE FIRST TWO DRAFTS OF THIS SABOTAGE DID NOT CATCH IT, FOR TWO DIFFERENT REASONS, BOTH KEPT. ***
        // Draft 1 tested dir=[-1,0,0]: face -X's exact CENTRE, which also points AWAY from the scene's one
        // hotspot -- flat background end to end, and a flat region cannot tell you WHERE it was sampled. Draft 2
        // moved to +Z (the face staring at the hotspot) but picked [0.5,0.5,1], which turned out to miss the
        // hotspot's ~14-degree cone entirely (still flat background) -- off-centre is not the same as
        // "near the actual edge of the bright region". Fixed by reading the baked mip-0 +Z face directly (six
        // rows printed, hotspot exactly at texels (2,2)-(3,3) of 6, background 0.1 elsewhere) and choosing
        // u=v=-0.3 -- the boundary BETWEEN texel 1 (background) and texel 2 (hotspot), the one place a
        // one-column shift is guaranteed to cross from one value to the other rather than land inside either.
        const sabCase = { dir: [-0.3, 0.3, 1], roughness: 0.0, mu: 0.9, F0: [1, 1, 1] }; // +Z, u=v=-0.3, mip 0
        const sabCases = packSpecularCases([sabCase]);
        const sabotagedParams = packSpecularParams(atlas, 1);
        sabotagedParams[2] = atlas.faceSize0 - 1; // v[0].z, the faceSize0 slot
        const resSab = await runWgslComputeNative({
            code: SPECULAR_IBL_VERIFY_WGSL, outCount: 3,
            uniforms: Array.from(sabotagedParams),
            inputs: [{ binding: 2, data: atlas.data }, { binding: 3, data: sabCases }],
            workgroups: [1, 1, 1],
        });
        const n = Math.hypot(...sabCase.dir), ndir = sabCase.dir.map((x) => x / n);
        const cpuTrue = evaluateSpecularIBL(atlas, ndir, sabCase.roughness, sabCase.mu, sabCase.F0);
        const gpuSab = resSab.ok ? [resSab.values[0], resSab.values[1], resSab.values[2]] : [NaN, NaN, NaN];
        const relErrSab = Math.max(...[0, 1, 2].map((ch) => Math.abs(gpuSab[ch] - cpuTrue[ch]) / Math.max(1e-6, Math.abs(cpuTrue[ch]))));
        ok("!! the sabotaged column offset moves an off-centre, mip-0, +Z-face sample far from the true value",
           resSab.ok && relErrSab > 0.05,
           `off-centre +Z at mip 0: true cpu=[${cpuTrue.map((x) => x.toFixed(5))}] sabotaged gpu=[${gpuSab.map((x) => x.toFixed(5))}] relative error ${relErrSab.toExponential(2)} (section 1 measured worst 1e-7-scale agreement on the correct params -- six orders of magnitude tighter).`);
    }

    console.log(fails ? "\nspecularIBLWgsl-selfcheck: " + fails + " FAILED" : "\nspecularIBLWgsl-selfcheck: all checks pass");
    console.log("unchecked here: THIS file's atlas travels as a storage BUFFER, not a texture -- physics/render/specularProbeLit.mjs and its own selfcheck are the ones that pack a real gfx/device.js texture and bind it to a real material, now wired into render/probeLab.mjs's actually-drawn scene (tools/ship/probeLab-selfcheck.mjs renders it on both backends). This file's own scope stays the verification-only shim.");
    process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error("specularIBLWgsl-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
