#!/usr/bin/env node
// WebGLEngine/physics/render/splitSumWgsl-selfcheck.mjs -- v4576
//
// Run: node physics/render/splitSumWgsl-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE SPECULAR HALF OF IBL, ASKED ON A REAL DEVICE RATHER THAN A MODEL OF ONE. *** splitSum.mjs's own BRDF
// LUT and prefilterEnv are graded at f64 in splitSum-selfcheck.mjs. This dispatches the WGSL twin through
// tools/ship/headlessGpu.mjs's native Dawn/SwiftShader path (the same adapter the Chromium harness reaches,
// without launching a browser) and compares the DEVICE's f32 output against the SAME CPU calls, same K/R/
// samples/alpha/direction, same environment fixtures splitSum-selfcheck.mjs already uses (uniform/gradient/
// spot) -- not a fresh set invented for this file. Disagreement is reported as a number, not assumed to be zero
// and not assumed to be within some tolerance picked before the device answered.
"use strict";
import { runWgslComputeNative, headlessGpuSkipReason } from "../../tools/ship/headlessGpu.mjs";
import { BRDF_LUT_WGSL, PREFILTER_ENV_WGSL, packLutParams, packPrefilterCases, ENV_KIND } from "./splitSumWgsl.mjs";
import { brdfLut, prefilterEnv } from "./splitSum.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);

async function main() {
    const skip = headlessGpuSkipReason();
    if (skip) { ok("device jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here; this gate's whole subject is what f32 on a device does to the specular half of IBL"); console.log("\nsplitSumWgsl-selfcheck: 1 FAILED"); process.exit(1); }

    console.log("1. *** THE BRDF LUT ON A DEVICE, EVERY CELL, AGAINST THE SAME CALL splitSum-selfcheck.mjs USES ***");
    {
        const K = 16, R = 16, samples = 512;
        const cpu = brdfLut({ K, R, samples });
        const gpuW = Math.ceil(K / 8), gpuH = Math.ceil(R / 8);
        const res = await runWgslComputeNative({
            code: BRDF_LUT_WGSL, outCount: K * R * 2,
            uniforms: Array.from(packLutParams(K, R, samples)),
            workgroups: [gpuW, gpuH, 1],
        });
        ok("!! the shader compiles and runs", res.ok, res.ok ? "" : JSON.stringify(res.errors || res.reason));
        let worstA = 0, worstB = 0;
        if (res.ok) {
            let atA = "", atB = "";
            for (let j = 0; j < R; j++) for (let i = 0; i < K; i++) {
                const idx = (j * K + i) * 2;
                const dA = Math.abs(res.values[idx] - cpu.A[j * K + i]);
                const dB = Math.abs(res.values[idx + 1] - cpu.B[j * K + i]);
                if (dA > worstA) { worstA = dA; atA = `i${i} j${j}`; }
                if (dB > worstB) { worstB = dB; atB = `i${i} j${j}`; }
            }
            ok("!! *** DEVICE f32 AGREES WITH THE f64 CPU REFERENCE TO THE f32 FLOOR, NOT ASSUMED ***",
               worstA < 1e-4 && worstB < 1e-4,
               `256 cells: worst |A_gpu - A_cpu| = ${worstA.toExponential(3)} at ${atA}, worst |B_gpu - B_cpu| = ${worstB.toExponential(3)} at ${atB}. ` +
               "Same Hammersley sequence, same GGX half-vector sample, same G2 -- so a disagreement bigger than f32 rounding would name an actual algorithmic gap between the two, not a tolerance picked to pass.");
            report(`adapter: ${res.adapter ? res.adapter.description || res.adapter.vendor : "?"}`);
        }

        // splitSum-selfcheck.mjs's own sabotage log, item A: "the (1 - Fc) / Fc split swapped between A and B",
        // applied here to the WGSL twin rather than re-invented -- the same plant, the other language.
        const sabotagedLut = BRDF_LUT_WGSL
            .replace("A = A + (1.0 - Fc) * gVis;", "A = A + Fc * gVis;")
            .replace("B = B + Fc * gVis;", "B = B + (1.0 - Fc) * gVis;");
        if (sabotagedLut === BRDF_LUT_WGSL) throw new Error("LUT sabotage strings not found -- the shader text changed under this check");
        const resSab = await runWgslComputeNative({
            code: sabotagedLut, outCount: K * R * 2, uniforms: Array.from(packLutParams(K, R, samples)), workgroups: [gpuW, gpuH, 1],
        });
        const worstSab = resSab.ok ? Math.max(...cpu.A.map((a, k) => Math.abs(resSab.values[k * 2] - a))) : NaN;
        ok("!! *** SABOTAGE: SWAPPING THE (1-Fc)/Fc SPLIT BETWEEN A AND B IS CAUGHT ON THE DEVICE TOO ***",
           resSab.ok && worstSab > 1e-2,
           `worst |A_sabotaged - A_true| across 256 cells: ${worstSab.toExponential(3)} (the un-sabotaged shader measured ${worstA.toExponential(3)} above). Fc runs 0..1 and averages nowhere near (1-Fc), so the swap is not a rounding-sized disagreement.`);
    }

    console.log("\n2. *** THE PREFILTERED ENVIRONMENT, THE SAME THREE FIXTURES splitSum-selfcheck.mjs GRADES AGAINST ***");
    {
        const dirs = [[0, 0, 1], [1, 0, 0], [0.6, 0.6, 0.53]];
        const alphas = [0.05, 0.3, 0.7, 1.0];
        const samples = 512;
        const uniformCases = [];
        for (const a of alphas) for (const R of dirs) uniformCases.push({ R, alpha: a, envKind: ENV_KIND.uniform, samples });
        const packedU = packPrefilterCases(uniformCases);
        const resU = await runWgslComputeNative({
            code: PREFILTER_ENV_WGSL, outCount: uniformCases.length,
            uniforms: [uniformCases.length, 0, 0, 0],
            inputs: [{ binding: 2, data: packedU }],
            workgroups: [Math.ceil(uniformCases.length / 64), 1, 1],
        });
        ok("!! the prefilter shader compiles and runs", resU.ok, resU.ok ? "" : JSON.stringify(resU.errors || resU.reason));
        if (resU.ok) {
            let worstU = 0;
            for (const v of resU.values) worstU = Math.max(worstU, Math.abs(v - 1));
            ok("!! a constant environment prefilters to exactly itself ON THE DEVICE too, every roughness and direction",
               worstU < 1e-3,
               `worst deviation from 1 over ${uniformCases.length} (roughness, direction) pairs: ${worstU.toExponential(3)}. ` +
               "Identical identity to splitSum-selfcheck.mjs section 4's CPU check, asked of the device instead of the model.");
        }

        const crossCases = [
            { R: [0, 0, 1], alpha: 0.1, envKind: ENV_KIND.gradient, samples: 8192 },
            { R: [0, 0, 1], alpha: 0.5, envKind: ENV_KIND.gradient, samples: 8192 },
            { R: [0, 0, 1], alpha: 0.1, envKind: ENV_KIND.spot, samples: 8192 },
            { R: [0, 0, 1], alpha: 0.5, envKind: ENV_KIND.spot, samples: 8192 },
        ];
        const packedC = packPrefilterCases(crossCases);
        const resC = await runWgslComputeNative({
            code: PREFILTER_ENV_WGSL, outCount: crossCases.length,
            uniforms: [crossCases.length, 0, 0, 0],
            inputs: [{ binding: 2, data: packedC }],
            workgroups: [Math.ceil(crossCases.length / 64), 1, 1],
        });
        ok("!! the non-trivial fixtures compile and run (a bug that only a real gradient/spot exposes)", resC.ok, resC.ok ? "" : JSON.stringify(resC.errors || resC.reason));
        if (resC.ok) {
            const gradient = (d) => 0.5 + 0.5 * d[2];
            const spot = (d) => (d[2] > 0.98 ? 50 : 0.05);
            let worst = 0, at = "";
            const envs = [gradient, gradient, spot, spot];
            crossCases.forEach((c, i) => {
                const cpuVal = prefilterEnv(envs[i], c.R, c.alpha, { samples: c.samples });
                const d = Math.abs(resC.values[i] - cpuVal) / Math.max(1e-6, Math.abs(cpuVal));
                report(`${i === 0 || i === 1 ? "gradient" : "spot"} alpha ${c.alpha}: gpu ${resC.values[i].toFixed(6)} cpu ${cpuVal.toFixed(6)} rel ${d.toExponential(3)}`);
                if (d > worst) { worst = d; at = `case ${i}`; }
            });
            ok("!! *** AND ON A NON-CONSTANT ENVIRONMENT, WHERE THE TANGENT FRAME AND THE NoL WEIGHTING ACTUALLY MATTER ***",
               worst < 1e-4,
               `worst relative disagreement across gradient/spot x alpha 0.1/0.5: ${worst.toExponential(3)} at ${at}. ` +
               "The uniform-environment identity above cannot catch a swapped tangent axis or a wrong NoL weight -- both would still average a constant to that same constant. This can.");
        }
    }

    console.log("\n3. *** SABOTAGE: A WEIGHTING BUG THE UNIFORM IDENTITY CANNOT SEE, BY CONSTRUCTION -- AND THE CROSS-CHECK CAN ***");
    {
        // NoL weighted by H (the half-vector) instead of R (the reflection direction) -- a realistic copy-paste
        // bug, one line changed. For a CONSTANT environment this is invisible: sum = SUM(1 * w) and wsum = SUM(w)
        // for ANY positive per-sample weight w, so sum/wsum = 1 regardless of what w actually is -- the ratio
        // structure that makes the uniform identity a good exactness check is exactly what makes it blind to a
        // weighting bug. A real environment has no such symmetry.
        const sabotaged = PREFILTER_ENV_WGSL.replace(
            "let NoL = R.x * L.x + R.y * L.y + R.z * L.z;",
            "let NoL = H.x * L.x + H.y * L.y + H.z * L.z;",
        );
        if (sabotaged === PREFILTER_ENV_WGSL) throw new Error("sabotage string not found -- the shader text changed under this check");

        const dirs = [[0, 0, 1], [1, 0, 0], [0.6, 0.6, 0.53]];
        const uniformCases = [0.05, 0.3, 0.7, 1.0].flatMap((a) => dirs.map((R) => ({ R, alpha: a, envKind: ENV_KIND.uniform, samples: 512 })));
        const resU = await runWgslComputeNative({
            code: sabotaged, outCount: uniformCases.length, uniforms: [uniformCases.length, 0, 0, 0],
            inputs: [{ binding: 2, data: packPrefilterCases(uniformCases) }],
            workgroups: [Math.ceil(uniformCases.length / 64), 1, 1],
        });
        const worstUSab = resU.ok ? Math.max(...resU.values.map((v) => Math.abs(v - 1))) : NaN;
        ok("!! the sabotaged shader still passes the uniform-environment identity -- CONFIRMING IT IS BLIND, NOT JUST UNTESTED",
           resU.ok && worstUSab < 1e-3,
           `worst deviation from 1, sabotaged shader: ${worstUSab.toExponential(3)}. If this row failed, the sabotage broke something the identity WAS able to see, and section 2's claim that it can't would be untested rather than false.`);

        const crossCases = [{ R: [0, 0, 1], alpha: 0.5, envKind: ENV_KIND.gradient, samples: 8192 }, { R: [0, 0, 1], alpha: 0.5, envKind: ENV_KIND.spot, samples: 8192 }];
        const resC = await runWgslComputeNative({
            code: sabotaged, outCount: crossCases.length, uniforms: [crossCases.length, 0, 0, 0],
            inputs: [{ binding: 2, data: packPrefilterCases(crossCases) }],
            workgroups: [Math.ceil(crossCases.length / 64), 1, 1],
        });
        const gradient = (d) => 0.5 + 0.5 * d[2], spot = (d) => (d[2] > 0.98 ? 50 : 0.05);
        const cpuVals = [prefilterEnv(gradient, [0, 0, 1], 0.5, { samples: 8192 }), prefilterEnv(spot, [0, 0, 1], 0.5, { samples: 8192 })];
        const worstCSab = resC.ok ? Math.max(...resC.values.map((v, i) => Math.abs(v - cpuVals[i]) / Math.max(1e-6, Math.abs(cpuVals[i])))) : NaN;
        ok("!! *** ...AND THE SAME SABOTAGE FAILS THE GRADIENT/SPOT CROSS-CHECK, WHICH IS THE WHOLE POINT OF CARRYING BOTH ***",
           resC.ok && worstCSab > 1e-2,
           `worst relative disagreement, sabotaged shader vs CPU truth, gradient/spot at alpha 0.5: ${worstCSab.toExponential(3)} (the un-sabotaged shader measured 1e-6-scale agreement here in section 2). ` +
           "A gate that only carried the uniform identity would have shipped this bug.");
    }

    console.log(fails ? "\nsplitSumWgsl-selfcheck: " + fails + " FAILED" : "\nsplitSumWgsl-selfcheck: all checks pass");
    console.log("unchecked here: this file grades the SHADER's numbers against the CPU reference, not a baked cubemap -- physics/render/specularProbeBake-selfcheck.mjs bakes and verifies a real mip chain (CPU-side), physics/render/specularProbeLit.mjs packs and binds it to a real material now drawn by render/probeLab.mjs's scene on both backends, and physics/render/specularProbeCapture.mjs reuses this file's own prefilterCoreWgsl(envImpl) split to run the SAME convolution against a real captured texture instead. This file's own scope -- PREFILTER_ENV_WGSL, BRDF_LUT_WGSL -- stays the analytic-environment shader math unchanged.");
    process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error("splitSumWgsl-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
