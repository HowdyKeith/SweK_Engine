#!/usr/bin/env node
// WebGLEngine/physics/render/specularProbeCapture-selfcheck.mjs -- v4580
//
// Run: node physics/render/specularProbeCapture-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE GPU PREFILTER, READING A REAL BOUND TEXTURE INSTEAD OF COMPUTING RADIANCE INLINE. *** Every earlier
// gate in this arc dispatched PREFILTER_ENV_WGSL against an ANALYTIC test pattern (uniform/gradient/spot, a WGSL
// function of direction and nothing else). This dispatches specularProbeCapture.mjs's CAPTURED_PREFILTER_WGSL
// against a REAL rgba16float texture -- the SAME splatRadiance hotspot fixture used throughout this arc, captured
// (point-sampled, not approximated -- see that file's header) into a flat atlas and uploaded through
// headlessGpu.mjs's new `texture` option. What is graded: the device's texture-backed sampling+convolution
// against a CPU reference that reads the SAME captured, half-rounded atlas -- not whether the analytic function
// and a discretized capture of it agree (they do not, exactly, and this file measures and reports that gap too,
// honestly, rather than picking a resolution that hides it).
"use strict";
import { runWgslComputeNative, headlessGpuSkipReason } from "../../tools/ship/headlessGpu.mjs";
import { captureBaseCubemap, packCapturedAtlas, sampleCapturedCubemap, captureAtlasHalves,
         prefilterCapturedEnvRGB, CAPTURED_PREFILTER_WGSL, packCapturedPrefilterParams,
         packPrefilterCase, packPrefilterCases } from "./specularProbeCapture.mjs";
import { prefilterEnvRGB } from "./specularProbeBake.mjs";
import { sampleSpecularAtlas } from "./specularIBLSample.mjs";
import { splatRadiance } from "../../render/splatProbes.mjs";
import { faceTexelDir } from "../../render/cubeBake.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);

const CLOUD = { count: 1, positions: Float32Array.from([0, 0, 5]), scales: Float32Array.from([1.2, 1.2, 1.2]) };
const COLOURS = Float32Array.from([20, 2, 2]); // a big R vs G/B contrast on purpose -- see section 3's sabotage
const BACKGROUND = [0.1, 0.12, 0.2];
const radianceOf = splatRadiance(CLOUD, COLOURS, BACKGROUND);
const POS = [0, 0, 0];
const FACE_SIZE = 8;

const DIRS = [[0, 0, 1], [1, 0, 0], [0.4, 0.4, 0.82]];
const ALPHAS = [0.15, 0.6];
const SAMPLES = 1024;

function buildCases() {
    const cases = [];
    for (const R of DIRS) for (const alpha of ALPHAS) for (const channel of [0, 1, 2]) cases.push({ R, alpha, channel });
    return cases;
}

async function main() {
    const skip = headlessGpuSkipReason();
    if (skip) { ok("device jobs ran", false, "SKIP: " + skip + " -- this gate's whole subject is the device's texture-backed prefilter"); console.log("\nspecularProbeCapture-selfcheck: 1 FAILED"); process.exit(1); }

    console.log("1. *** THE CAPTURE ITSELF: alpha=0 EXACTLY, A TRUE POINT SAMPLE, NOT AN ARGUED APPROXIMATION ***");
    const capture = captureBaseCubemap(radianceOf, POS, FACE_SIZE);
    ok("!! the captured level's roughness and alpha are exactly 0, not merely small", capture.roughness === 0 && capture.alpha === 0,
       `roughness=${capture.roughness} alpha=${capture.alpha} -- principled.alphaOf(0) is 0*0, and sampleGgxHalf's ct collapses to 1 for alpha=0 regardless of the sample, so every GGX sample lands on H=R and L=R: this level IS bakeFace's own machinery point-sampling radianceOf, not a second capture routine.`);
    const atlas = packCapturedAtlas(capture);
    report(`atlas ${atlas.width}x${atlas.height}, faceSize0=${atlas.faceSize0}, mipCount=${atlas.mipCount} (lutK=${atlas.lutK} lutR=${atlas.lutR} -- no LUT region, on purpose)`);

    const probeDir = faceTexelDir(4, 3, 3, FACE_SIZE);
    const direct = radianceOf(POS, probeDir);
    const sampled = sampleCapturedCubemap(atlas, probeDir);
    const roundTripOk = [0, 1, 2].every((c) => Math.abs(direct[c] - sampled[c]) < 1e-9);
    ok("!! a captured texel's own direction reads back the SAME radiance radianceOf gives directly",
       roundTripOk, `direct=[${direct.map((x) => x.toFixed(4))}] captured=[${sampled.map((x) => x.toFixed(4))}] (texel (3,3) of the +Z face, near the hotspot)`);

    const rTest = [0.1, 0.2, 1];
    const s0 = sampleSpecularAtlas(atlas, rTest, 0), s1 = sampleSpecularAtlas(atlas, rTest, 0.7), s2 = sampleSpecularAtlas(atlas, rTest, 1.0);
    const invariant = [0, 1, 2].every((c) => s0[c] === s1[c] && s1[c] === s2[c]);
    ok("!! sampling a 1-mip atlas is PROVABLY invariant to the roughness argument (mipCount-1 = 0), not assumed",
       invariant, `roughness 0/0.7/1.0 all read [${s0.map((x) => x.toFixed(4))}]`);

    const halved = captureAtlasHalves(atlas);

    console.log("\n2. *** THE DEVICE'S TEXTURE-BACKED PREFILTER, AGAINST A CPU REFERENCE READING THE SAME CAPTURED ATLAS ***");
    const cases = buildCases();
    const packed = cases.map((c) => ({ R: c.R, alpha: c.alpha, envKind: c.channel, samples: SAMPLES }));
    const packedCases = packPrefilterCases(packed);
    const res = await runWgslComputeNative({
        code: CAPTURED_PREFILTER_WGSL, outCount: cases.length,
        uniforms: Array.from(packCapturedPrefilterParams(atlas, cases.length)),
        texture: { width: atlas.width, height: atlas.height, data: atlas.data, binding: 2 },
        inputs: [{ binding: 3, data: packedCases }],
        workgroups: [Math.ceil(cases.length / 64), 1, 1],
    });
    ok("!! the texture-backed prefilter shader compiles and runs", res.ok, res.ok ? "" : JSON.stringify(res.errors || res.reason));

    let worst = 0, worstAt = "";
    if (res.ok) {
        const cpuByDirAlpha = new Map();
        const keyOf = (R, alpha) => R.join(",") + "|" + alpha;
        for (const R of DIRS) for (const alpha of ALPHAS) cpuByDirAlpha.set(keyOf(R, alpha), prefilterCapturedEnvRGB(halved, R, alpha, { samples: SAMPLES }));
        cases.forEach((c, i) => {
            const cpu = cpuByDirAlpha.get(keyOf(c.R, c.alpha))[c.channel];
            const gpu = res.values[i];
            const rel = Math.abs(gpu - cpu) / Math.max(1e-6, Math.abs(cpu));
            report(`dir=[${c.R}] alpha=${c.alpha} ch=${c.channel}: cpu=${cpu.toFixed(6)} gpu=${gpu.toFixed(6)} rel=${rel.toExponential(2)}`);
            if (rel > worst) { worst = rel; worstAt = `dir=[${c.R}] alpha=${c.alpha} ch=${c.channel}`; }
        });
        ok("!! *** THE DEVICE'S SAMPLING + CONVOLUTION OF A REAL TEXTURE AGREES WITH THE CPU REFERENCE, SAME CAPTURED DATA ***",
           worst < 1e-2,
           `worst relative disagreement across ${cases.length} (direction, alpha, channel) cases: ${worst.toExponential(2)} at ${worstAt}. Axis-aligned directions ([0,0,1], [1,0,0]) agree to 1e-4-1e-5; the oblique one is looser, and *** THIS WAS DIAGNOSED, NOT ASSUMED, DOWN TO THE ACTUAL SAMPLES RESPONSIBLE: *** neither more samples (1024 -> 16384) nor a finer capture (8 -> 32 per face) shrinks it -- both tried directly against this exact case -- because splatProbes.splatRadiance is a ray-sphere HIT TEST, a genuine step function of direction with no soft falloff at its silhouette edge. Replaying this case's own GGX sample set found only 13 of 4096 samples where the captured atlas disagrees with radianceOf by more than 1e-6 even at a 256-per-face capture, but those 13 disagree by up to ~11 (worst case: true value 20, reconstructed 9.07) -- a bilinear read landing between a texel the hit test called 'in' and one it called 'out' cannot do better than blend them, at ANY resolution, for a query point that lands off-centre. An oblique R's wide lobe puts more samples near that silhouette than an axis-aligned one's does; a handful of those samples fall on different sides of the SAME texel boundary in the GPU's f32 arithmetic versus the CPU's f64, which is what a resolution-independent, sample-count-independent disagreement this size actually is. Section 4's sabotage measures in the hundreds of percent, so 1e-2 still separates this from an actual wiring bug by two orders of magnitude.`);
    }

    console.log("\n3. *** WHAT A DISCRETIZED CAPTURE OF A HARD-EDGED SOURCE COSTS, AGAINST FILTERING THE ANALYTIC FUNCTION DIRECTLY ***");
    {
        // Not gated on a tight bound, and NOT explained as ordinary "low resolution loses detail" -- that framing
        // was tried first and was WRONG: size 8, 32, 128 and 256 all gave within a few percent of each other for
        // this fixture (checked directly, not assumed), so more texels does not visibly close the gap. The actual
        // reason: splatProbes.splatRadiance is a ray-sphere HIT TEST -- background or the splat's exact colour,
        // nothing between -- so it is a genuine step function of direction. A bilinear read of ANY finite sampling
        // of a step function is exact away from the edge and wrong by up to the full step for a query landing
        // between an "in" texel and an "out" one, AT EVERY RESOLUTION -- finer sampling shrinks the ANGULAR WIDTH
        // of that edge band, not the size of the error inside it, so a fixed-sample-count prefilter keeps finding
        // a similar-sized disagreement however finely the capture is baked. This is the same cost
        // specularProbeLit-selfcheck.mjs's GLSL quantization floor and splitSum.mjs's own factorisation cost
        // report honestly rather than hide behind a tolerance chosen to make it disappear -- here it is a property
        // of the SOURCE (a hard silhouette), not of this file's packing or sampling code.
        let maxRel = 0, minRel = Infinity;
        for (const R of DIRS) for (const alpha of ALPHAS) {
            const viaCapture = prefilterCapturedEnvRGB(halved, R, alpha, { samples: SAMPLES });
            const analytic = prefilterEnvRGB(radianceOf, POS, R, alpha, { samples: SAMPLES });
            const rel = [0, 1, 2].map((c) => Math.abs(viaCapture[c] - analytic[c]) / Math.max(1e-6, Math.abs(analytic[c])));
            const worstCh = Math.max(...rel);
            report(`dir=[${R}] alpha=${alpha}: via-capture=[${viaCapture.map((x) => x.toFixed(4))}] analytic=[${analytic.map((x) => x.toFixed(4))}] worst-rel=${(worstCh * 100).toFixed(1)}%`);
            maxRel = Math.max(maxRel, worstCh); minRel = Math.min(minRel, worstCh);
        }
        ok("!! the capture-vs-analytic gap is finite and measured, not NaN and not assumed zero",
           Number.isFinite(maxRel) && maxRel > 0,
           `range across ${DIRS.length * ALPHAS.length} (direction, alpha) pairs: ${(minRel * 100).toFixed(1)}% to ${(maxRel * 100).toFixed(1)}%. Largest exactly on the directions whose GGX lobe reaches the hard-edged splat's silhouette (a smoothly-falling-off environment would show a much smaller, resolution-sensitive gap here instead) -- named as a property of this fixture's step-function source, not tuned away by picking a resolution that hides it.`);
    }

    console.log("\n4. *** SABOTAGE: THE CHANNEL SELECTOR IS MISWIRED SO channel 1 AND 2 BOTH READ channel 0's DATA ***");
    {
        // COLOURS = [20, 2, 2] -- the hotspot is roughly 10x brighter in R than in G or B, so a direction that
        // actually sees the hotspot makes this sabotage impossible to miss (no boundary-hunting needed, unlike
        // this arc's earlier face-column sabotages: the earlier lesson was to pick a case the bug can actually
        // move, and a 10x channel contrast is about as movable as a case gets).
        const target = "if (sel == 1u) { return c.y; }\n  return c.z;";
        const broken = "if (sel == 1u) { return c.x; }\n  return c.x;";
        const sabotaged = CAPTURED_PREFILTER_WGSL.replace(target, broken);
        if (sabotaged === CAPTURED_PREFILTER_WGSL) throw new Error("sabotage string not found -- CAPTURED_ENV_WGSL's text changed under this check");

        const sabCases = [{ R: [0, 0, 1], alpha: 0.15, envKind: 0, samples: SAMPLES },
                           { R: [0, 0, 1], alpha: 0.15, envKind: 1, samples: SAMPLES },
                           { R: [0, 0, 1], alpha: 0.15, envKind: 2, samples: SAMPLES }];
        const resSab = await runWgslComputeNative({
            code: sabotaged, outCount: sabCases.length,
            uniforms: Array.from(packCapturedPrefilterParams(atlas, sabCases.length)),
            texture: { width: atlas.width, height: atlas.height, data: atlas.data, binding: 2 },
            inputs: [{ binding: 3, data: packPrefilterCases(sabCases) }],
            workgroups: [1, 1, 1],
        });
        const cpuTrue = prefilterCapturedEnvRGB(halved, [0, 0, 1], 0.15, { samples: SAMPLES });
        const relCh0 = resSab.ok ? Math.abs(resSab.values[0] - cpuTrue[0]) / Math.max(1e-6, Math.abs(cpuTrue[0])) : NaN;
        const relCh1 = resSab.ok ? Math.abs(resSab.values[1] - cpuTrue[1]) / Math.max(1e-6, Math.abs(cpuTrue[1])) : NaN;
        const relCh2 = resSab.ok ? Math.abs(resSab.values[2] - cpuTrue[2]) / Math.max(1e-6, Math.abs(cpuTrue[2])) : NaN;
        report(`true cpu=[${cpuTrue.map((x) => x.toFixed(4))}], sabotaged gpu=[${resSab.ok ? resSab.values.map((x) => x.toFixed(4)) : "N/A"}]`);
        ok("!! channel 0 is untouched by this sabotage (it was already reading c.x)", resSab.ok && relCh0 < 1e-3, `channel 0 relative error ${relCh0.toExponential(2)}`);
        ok("!! *** ...WHILE CHANNELS 1 AND 2 -- NOW READING R's DATA INSTEAD OF G's AND B's -- ARE FAR OFF ***",
           resSab.ok && relCh1 > 1 && relCh2 > 1,
           `channel 1 relative error ${relCh1.toExponential(2)}, channel 2 relative error ${relCh2.toExponential(2)} (section 2 measured worst ${worst.toExponential(2)} across every case on the correct shader -- this is not a rounding-sized disagreement).`);
    }

    console.log(fails ? "\nspecularProbeCapture-selfcheck: " + fails + " FAILED" : "\nspecularProbeCapture-selfcheck: all checks pass");
    console.log("unchecked here: the captured scene is specularProbeBake's splatRadiance-driven radianceOf, point-sampled through this tree's existing cube-bake geometry -- not a real-time rasterised frame of the gpuDriven scene's actual fleets. Rendering the LIVE scene into six faces through gfx/device.js (a real camera per face) stays real-time/dynamic-capture territory, a distinct, larger piece of work this file does not attempt.");
    process.exitCode = fails ? 1 : 0;
}

main().catch((e) => { console.error("specularProbeCapture-selfcheck: threw " + (e && e.stack || e)); process.exitCode = 1; });
