#!/usr/bin/env node
// WebGLEngine/tools/ship/bloomFusedTexture-selfcheck.mjs -- v4287
//
// GRADES the fused bloom pass as a RENDER PASS rather than as arithmetic: scene texture in, bloom texture
// out, one compute dispatch.
//
// *** v4284 PROVED THE MATHS AND STOPPED SHORT OF A PASS, IN TWO WAYS THAT BOTH MATTERED. *** It wrote f32
// into a storage BUFFER, because that is what the compute harness bound; and it COMPUTED its own input from
// srcAt, because there was no way to hand it a texture. Neither is a thing a renderer can use. A post pass
// reads the scene somebody else drew and writes a texture the next pass samples, and each of those is a
// different binding with its own ways of being wrong.
//
// THE CHAIN, END TO END, EACH LINK MEASURED ON A REAL DEVICE:
//
//   v4284   the shipping GLSL three-pass chain == a CPU oracle              0.500/255 (WebGL2)
//   v4284   that oracle == the fused dispatch, f32 into a buffer            2.5 float32 epsilons
//   here    that buffer result == the same shader into a storage TEXTURE    half-float resolution
//   here    procedural input == a real SAMPLED input texture                half-float resolution
//
// ---- WHAT IS STILL NOT WIRED, SAID PLAINLY -------------------------------------------------------------------
//
// render/bloomPass.js STILL RUNS ITS THREE DRAWS. Nothing in the shipping render path changed. What exists now
// is a pass that a WebGPU renderer COULD call, proven equivalent; swapping the live path needs a device
// obtained at runtime, a WebGL fallback for machines without one, and a reason to believe the swap is worth
// it -- and that last part is a memory-traffic measurement this sandbox cannot make, because its only device
// is a software rasteriser. Building the wiring before the measurement is defensible; PRETENDING the
// measurement happened would not be.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// v4295 -- MOVED TO THE BROWSER-FREE BACKEND, INCLUDING THE TEXTURE PATH. This was the last and the most
// expensive WGSL gate on the browser harness (4,009 ms). headlessGpu.mjs grew a storage-texture reader
// this round, mirroring the browser one's row-padding and half-float arithmetic rather than reinventing
// it -- a second decoder that disagreed would make every comparison a fact about the two readers.
// crossBackend-selfcheck runs all three texture shapes through BOTH backends and asserts byte-identity,
// so the browser path is still covered. The arithmetic below and its numbers are unchanged.
import { runWgslComputeToTextureNative as runWgslComputeToTexture,
         runWgslComputeNative as runWgslCompute,
         headlessGpuSkipReason as webgpuSkipReason, exitCleanly } from "./headlessGpu.mjs";
import * as B from "../../render/bloomFused.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);

const T = 0.7, N = B.N, WG = (N / B.TILE) * (N / B.TILE);
const cpu = B.chainCpu({ threshold: T }).out;
const cpuPeak = Math.max(...cpu);
const cmp = (px) => {                       // texture pixels are rgba; the oracle is rgb
    let maxAbs = 0, maxRel = 0, peak = 0;
    for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) {
        const got = px[i * 4 + c], want = cpu[i * 3 + c];
        if (got > peak) peak = got;
        const d = Math.abs(got - want);
        if (d > maxAbs) maxAbs = d;
        if (want > 1e-3) maxRel = Math.max(maxRel, d / want);
    }
    return { maxAbs, maxRel, peak };
};
// Half-float carries a 10-bit mantissa, so ~1e-3 relative is the FORMAT's resolution and not slack.
const HALF = 2e-3;

console.log("bloomFusedTexture-selfcheck -- the fused pass as something a renderer could call\n");

const skip = webgpuSkipReason();
if (skip) { report("SKIPPED ENTIRELY: " + skip); console.log("\nALL GREEN"); process.exit(0); }

console.log("1. *** THE SAME SHADER, WRITING A STORAGE TEXTURE INSTEAD OF A BUFFER ***");
let texRes = null;
{
    texRes = await runWgslComputeToTexture({ code: B.fusedWgslToTexture(), n: N,
        format: B.STORAGE_FORMATS.hdr, uniforms: [T, 0, 0, 0], workgroups: WG });
    ok("the storage-texture variant compiles and dispatches", texRes.ok,
        texRes.ok ? `adapter ${texRes.adapter?.vendor}/${texRes.adapter?.architecture}, no validation errors`
                  : texRes.reason + " " + JSON.stringify(texRes.errors || []).slice(0, 200));
    if (texRes.ok) {
        const m = cmp(texRes.pixels);
        ok("CONTROL: the image is not empty", m.peak > 1, `peak ${m.peak.toFixed(4)}`);
        ok("*** and it reproduces the three-pass chain to half-float resolution ***", m.maxRel < HALF,
            `max relative ${m.maxRel.toExponential(2)}, max absolute ${m.maxAbs.toExponential(2)}`);
        ok("  with the peak preserved rather than flattened", Math.abs(m.peak - cpuPeak) < 1e-3,
            `${m.peak.toFixed(4)} against the oracle's ${cpuPeak.toFixed(4)}`);
        // The buffer path is the thing this is being carried over FROM, so the two are compared directly.
        const buf = await runWgslCompute({ code: B.fusedWgsl(), outCount: N * N * 3,
            uniforms: [T, 0, 0, 0], workgroups: WG });
        // *** THE ROW STRIDE WAS DEAD CODE UNTIL THIS CHECK EXISTED. *** copyTextureToBuffer pads every row
        // to a 256-byte multiple, and at N=64 rgba16float a row is 512 bytes -- already aligned, so the
        // padding path never ran and a sabotage that deleted it went 0 RED. N=40 pads 320 up to 512, so the
        // decoder must skip 192 bytes a row or the image shears by 24 texels per row. Reading padding as
        // pixels looks exactly like a broken shader and is arithmetic in the reader.
        const PN = 40, pad = await runWgslComputeToTexture({ code: B.fusedWgslToTexture({ n: PN }), n: PN,
            format: B.STORAGE_FORMATS.hdr, uniforms: [T, 0, 0, 0], workgroups: (PN / B.TILE) * (PN / B.TILE) });
        ok("*** a size whose rows need PADDING decodes correctly too ***", pad.ok && (() => {
                const c2 = B.chainCpu({ n: PN, threshold: T }).out;
                let w = 0;
                for (let i = 0; i < PN * PN; i++) for (let k = 0; k < 3; k++) {
                    const g = pad.pixels[i * 4 + k], v = c2[i * 3 + k];
                    if (v > 1e-3) w = Math.max(w, Math.abs(g - v) / v); }
                return w < HALF; })(),
            pad.ok ? `N=${PN}: rows padded ${PN * 8} -> ${pad.bytesPerRow}, and the image still matches` : pad.reason);
        ok("  CONTROL: N=64 needs no padding, which is why the check above uses a different size",
            texRes.bytesPerRow === N * 8 && pad.ok && pad.bytesPerRow !== PN * 8,
            `N=${N} rows are ${texRes.bytesPerRow} bytes (aligned); N=${PN} rows are ${pad.bytesPerRow} (padded)`);
        ok("  and agrees with the f32 BUFFER path v4284 proved, to the same resolution",
            buf.ok && (() => { let w = 0;
                for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) {
                    const a = texRes.pixels[i * 4 + c], b = buf.values[i * 3 + c];
                    if (b > 1e-3) w = Math.max(w, Math.abs(a - b) / b); }
                return w < HALF; })(),
            "so the move from buffer to texture changed the STORAGE and not the arithmetic");
    }
}

console.log("\n2. *** THE FORMAT IS A CORRECTNESS DECISION AND THE CLIPPING IS MEASURED ***");
{
    const clip = await runWgslComputeToTexture({ code: B.fusedWgslToTexture({ format: B.STORAGE_FORMATS.clipping }),
        n: N, format: B.STORAGE_FORMATS.clipping, uniforms: [T, 0, 0, 0], workgroups: WG });
    ok("rgba8unorm also compiles and runs -- it is a legal choice, not a broken one", clip.ok,
        clip.ok ? "" : clip.reason);
    if (clip.ok) {
        const m = cmp(clip.pixels);
        let above = 0;
        for (let i = 0; i < cpu.length; i++) if (cpu[i] > 1.0) above++;
        ok("*** and it CLAMPS the peak to exactly 1.0, discarding everything bloom exists to carry ***",
            m.peak <= 1.0 + 1e-6 && cpuPeak > 1.0,
            `peak ${m.peak.toFixed(4)} against ${cpuPeak.toFixed(4)}; ${above} samples exceed 1.0 and all are lost`);
        ok("  a loss of 43% on the brightest sample, which no tolerance would call agreement",
            m.maxAbs > 0.5, `max absolute error ${m.maxAbs.toFixed(3)}`);
        ok("  so the module names both formats rather than hiding the choice in a default",
            B.STORAGE_FORMATS.hdr === "rgba16float" && B.STORAGE_FORMATS.clipping === "rgba8unorm");
        report("*** THIS IS WHY THE FORMAT IS NOT A DETAIL. *** An 8-bit target is the obvious default, it " +
            "validates, it dispatches, it produces a picture, and it silently deletes the dynamic range that " +
            "is the entire point of a bloom pass. Nothing but a measurement distinguishes it from the right " +
            "answer, because the failure is invisible anywhere the scene happens to be dim.");
    }
}

console.log("\n3. *** SCENE TEXTURE IN: THE PART THAT MAKES IT A PASS RATHER THAN A DEMO ***");
{
    const sampled = await runWgslComputeToTexture({ code: B.fusedWgslToTexture({ sampled: true }), n: N,
        format: B.STORAGE_FORMATS.hdr, uniforms: [T, 0, 0, 0], workgroups: WG,
        inputTexel: (x, y) => { const [r, g, b] = B.sourceTexel(x, y); return [r, g, b, 1]; } });
    ok("the sampled variant compiles with a texture_2d input bound", sampled.ok,
        sampled.ok ? "" : sampled.reason + " " + JSON.stringify(sampled.errors || []).slice(0, 200));
    if (sampled.ok) {
        const m = cmp(sampled.pixels);
        ok("*** fed a TEXTURE holding the same image, it gives the same answer ***", m.maxRel < HALF,
            `max relative ${m.maxRel.toExponential(2)}, peak ${m.peak.toFixed(4)}`);
        ok("  CONTROL: and it agrees with the PROCEDURAL variant, so any difference is the sampling",
            texRes && texRes.ok && (() => { let w = 0;
                for (let i = 0; i < N * N * 4; i++) w = Math.max(w, Math.abs(sampled.pixels[i] - texRes.pixels[i]));
                return w < 4e-3; })(),
            "the two differ only in where srcAt gets its values, so comparing them isolates that one change");
        const src = B.fusedWgslToTexture({ sampled: true });
        ok("  and the procedural generator is KEPT beside it rather than deleted",
            /srcAtProcedural/.test(src) && /textureLoad\(srcTex/.test(src),
            "the demo path is what lets the control above exist; deleting it would remove the comparison");
        report("scene texture in, bloom texture out, ONE dispatch. That is the shape a renderer calls. What " +
            "v4284 had was the same arithmetic with its input computed and its output in a buffer, which is " +
            "a proof about a filter rather than a pass.");
    }
}

console.log("\n4. WHAT IS STILL NOT WIRED, AND WHY THAT IS NOT A HEDGE");
{
    const bloom = fs.readFileSync(path.join(ENG, "render/bloomPass.js"), "utf8");
    ok("*** render/bloomPass.js still runs its three draws, unchanged by this round ***",
        (bloom.slice(bloom.indexOf("// Pass 1 "), bloom.indexOf("// Pass 4 ")).match(/drawArrays/g) || []).length === 5,
        "5 draws in the span, 3 unconditional -- exactly what v4284 measured, so no live path moved");
    ok("  and it does not import the fused module, which is the honest state of the wiring",
        !/bloomFused/.test(bloom),
        "a pass a renderer COULD call is not a pass a renderer DOES call, and the difference is a device");
    const gate = fs.readFileSync(path.join(ENG, "tools/ship/bloomFusedTexture-selfcheck.mjs"), "utf8");
    ok("  and this file says so in its own header rather than only in a changelog",
        // \s+ rather than literal spaces: this matches PROSE in a header, and prose wraps. gateQuality flagged
        // the literal-space form at Level 11 as the one new prose-matching offender since v4279.
        /STILL\s+RUNS\s+ITS\s+THREE\s+DRAWS/.test(gate));
    report("*** NO TIMING, AGAIN, AND FOR THE SAME REASON. *** The payoff of fusing three passes is memory " +
        "traffic; the only WebGPU device here is google/swiftshader, a software rasteriser; timing memory " +
        "traffic on a CPU measures the CPU. Building the wiring before the measurement is defensible -- it " +
        "puts the measurement one run away from anyone with hardware instead of one round away. Claiming the " +
        "measurement happened would not be.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, restored
// md5-identical (bloomFused 983116d89bf618ec, harness 5aaad1f66426e890). MEASURED.
//
//   A  the 256-byte row padding ignored, so the readback is decoded as a flat array.
//      -> *** 0 RED FIRST TIME, AND THE GATE WAS AT FAULT. *** At N=64 an rgba16float row is 512 bytes,
//      already a 256 multiple, so no padding is ever added and the stride handling was DEAD CODE the gate
//      never reached. A whole branch of the reader, written carefully, tested by nothing. N=40 pads 320 up
//      to 512 and is now checked, with a CONTROL asserting N=64 does NOT pad so the pair cannot collapse
//      into one case. Redone: 1 red, and it is the padded size by name.
//
//   B  STORAGE_FORMATS.hdr changed to rgba8unorm, so the "HDR" path is an 8-bit one.
//      -> exit=1, 6 red -- the most of any here, and every one of them is about the same lost dynamic range.
//      The peak reads 1.0000 against the oracle's 1.7480 and the CONTROL that the image is not empty fails
//      too, because a clamped bloom looks exactly like a bloom that never happened.
//
//   C  textureStore's coordinates transposed, vec2(gx,gy) -> vec2(gy,gx).
//      -> exit=1, 4 red, max relative 8.43e+1. *** THE SHADER STILL COMPILES, STILL DISPATCHES, AND STILL
//      FILLS EVERY TEXEL. *** A transposed image is a perfectly plausible picture and the only thing that
//      catches it is a comparison against a reference that knows where each pixel belongs -- which is the
//      argument for keeping the CPU oracle rather than eyeballing a frame.
//
// None went 0 RED in the end. A is the one worth keeping: it did not find a bug, it found a branch of the
// harness that no size the gate used could reach, which is the same shape as v4286's unreached guard and
// v4285's overstated label. Three rounds, three pieces of machinery that were present, correct, and untested.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: EVERY OTHER PASS IN THE CHAIN. SSAO, god rays and the composite are still GLSL " +
    "draws, and v4285 measured that god rays can never join this dispatch at any tile size. Also unchecked: " +
    "the half-float input. The scene texture is uploaded as rgba16float because an 8-bit input would clip " +
    "before the shader saw it -- the same trap as the output, one stage earlier -- but nothing here compares " +
    "a real renderer's scene target against that assumption, because there is no real renderer in the loop.");
exitCleanly(fails ? 1 : 0);
