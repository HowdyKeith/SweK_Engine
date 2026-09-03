#!/usr/bin/env node
// WebGLEngine/physics/render/furnaceWgsl-selfcheck.mjs -- v4387
//
// *** THE FIRST PIECE OF THE PATH TRACER TO CROSS TO A DEVICE, AND IT IS GRADED AGAINST SIX CONSTANTS RATHER
// THAN AGAINST THE CPU. ***
//
// physics/render/pathTracerWgsl.mjs (v4290) ported the two DECIDABLE pieces of the tracer and closed by naming
// what it would not attempt: "`trace` is roughly three hundred lines of multiple importance sampling,
// microfacet lobes, Fresnel, energy compensation and Russian roulette... Porting it is a real round; porting it
// before anyone has established what f32 does to the primary ray would be building on an unmeasured floor."
// The floor is established. This is not that port either -- it is the piece of the tracer whose answer is a
// CLOSED FORM, which is the one piece that can cross without anybody inventing a tolerance first.
//
// ---- THE FOURTH CLAIM SHAPE IN THIS ARC ------------------------------------------------------------------------
//
//   v4370  smooth f32 arithmetic         -> bit-identical, and the claim would have survived at 1e-6
//   v4380  a decision ending in floor()  -> exact set equality against an f32 mirror
//   v4382  integer end to end            -> zero tolerance, because the kernel's own contract says so
//   v4385  a quadrature with sqrt in it  -> a measured f32 floor, earned before the first failure
//   v4387  a MONTE CARLO ESTIMATOR       -> NO comparison with the CPU at all. Six analytic constants.
//
// physics/render/furnace.mjs's key has no free parameters: a white furnace returns the albedo, and each named
// fault returns the albedo times a constant -- EXPECTED = { clean: 1, noPdf: 1/(2 PI), noCosine: 2,
// badSampler: 4/PI } and EXPECTED_COSINE = { clean: 1, wrongPdf: 4/3 }. So f32 against f64 never enters the
// grading. What enters is SAMPLING NOISE, which belongs to the estimator rather than the hardware, and section
// 1 measures it on the CPU before the device is asked anything.
//
// *** AND THE DEVICE CANNOT DRAW THE SAME RANDOM NUMBERS, WHICH IS WHY THIS IS THE RIGHT KEY. *** v4290
// measured it: the generator's state is portable and its output is NOT portable even between conformant
// devices -- 98.02% of the first 65536 draws differ, because f32(u32) rounds and WGSL leaves which neighbour
// you get implementation-defined. A pixel comparison would have been measuring the RNG. 4/PI is not.
// The port therefore does not even try to reproduce the CPU's stream: it splits the work across lanes, each
// with its own seed, which would be a defect if the key were the CPU's answer and is not one here.
//
// ---- WHAT THE TWO ZERO-VARIANCE CASES BUY, WHICH IS THE ROUND'S OTHER HALF -------------------------------------
//
// Two of the six estimators have NO sampling noise at all, and section 1 measures that rather than asserting
// it: over 48 seeds, `noCosine` and cosine-`clean` return the identical value every time, sigma EXACTLY 0.
// noCosine integrates the constant 2 PI; cosine-clean's integrand is constant once the pdf cancels. So in those
// two the entire error is ARITHMETIC, and the device's number is a statement about f32 with nothing to hide
// behind. It is not flat: it GROWS with the sample count -- 1.04e-7, 5.79e-7, 1.62e-6 at 65k, 262k and 1M --
// which is the per-lane f32 sum accumulating, while the CPU sits at 1.48e-12 throughout. The four noisy cases
// cannot say anything of the kind, and this file does not let them.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/furnaceWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a fail)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { FURNACE_WGSL, packFurnaceParams, estimateFrom, faultBits } from "./furnaceWgsl.mjs";
import { furnace, EXPECTED, EXPECTED_COSINE } from "./furnace.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const LANES = 4096, PER = 64, SAMPLES = LANES * PER;
const CASES = [
    { name: "clean",           opts: {},                                    want: EXPECTED.clean,          exact: false },
    { name: "noPdf",           opts: { noPdf: true },                       want: EXPECTED.noPdf,          exact: false },
    { name: "noCosine",        opts: { noCosine: true },                    want: EXPECTED.noCosine,       exact: true  },
    { name: "badSampler",      opts: { badSampler: true },                  want: EXPECTED.badSampler,     exact: false },
    { name: "cosine clean",    opts: { strategy: "cosine" },                want: EXPECTED_COSINE.clean,   exact: true  },
    { name: "cosine wrongPdf", opts: { strategy: "cosine", wrongPdf: true }, want: EXPECTED_COSINE.wrongPdf, exact: false },
];
// EARNED IN SECTION 1, NOT CHOSEN: the worst relative error over 48 CPU seeds at this sample count is 2.49e-3,
// so the noisy band is set at 5e-3 -- about twice the worst of 48 draws and roughly seven sigma above the mean.
// The two zero-variance cases get 1e-5, which is 17x tighter and is what makes them a separate statement.
const NOISY_TOL = 5e-3, EXACT_TOL = 1e-5, SEEDS = 48;

console.log("\n1. THE ESTIMATOR'S OWN SPREAD, MEASURED ON THE CPU BEFORE THE DEVICE IS ASKED ANYTHING");
const spread = {};
{
    for (const c of CASES) {
        const errs = [];
        for (let s = 1; s <= SEEDS; s++) errs.push(Math.abs(furnace(1, SAMPLES, { ...c.opts, seed: s }) - c.want) / c.want);
        const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
        const sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length);
        spread[c.name] = { mean, worst: Math.max(...errs), sd };
    }
    const noisy = CASES.filter((c) => !c.exact), exact = CASES.filter((c) => c.exact);
    ok(`*** two of the six estimators carry NO sampling noise: over ${SEEDS} seeds ${exact.map((c) => c.name).join(" and ")} return the identical value every time, sigma EXACTLY 0 ***`,
        exact.every((c) => spread[c.name].sd === 0 && spread[c.name].worst < 1e-11),
        exact.map((c) => `${c.name} sigma ${spread[c.name].sd.toExponential(2)} worst ${spread[c.name].worst.toExponential(2)}`).join("; ") +
        ". noCosine integrates the constant 2 PI and cosine-clean's integrand is constant once the pdf cancels, so their whole error is arithmetic");
    ok(`  and the other four do: worst over ${SEEDS} seeds ${noisy.map((c) => spread[c.name].worst.toExponential(2)).join(", ")}, which is where the ${NOISY_TOL} band comes from`,
        noisy.every((c) => spread[c.name].sd > 1e-5) && Math.max(...noisy.map((c) => spread[c.name].worst)) < NOISY_TOL,
        `the band is about twice the worst of ${SEEDS} draws. A tolerance earned from the estimator BEFORE the first device run is the rule magmapGpu.mjs states and this follows it`);
}

{
    // *** WHAT THIS KEY IS BLIND TO, PINNED AS A PROPERTY RATHER THAN LEFT IN PROSE. *** A sabotage that swapped
    // the shader's tangent from +Z to +X went 0 RED, and the reason is not luck: the furnace integrand is
    // azimuthally symmetric, so the estimator reads only cos(theta) = dot(dir, N) and every orthonormal tangent
    // frame about the same N gives the identical answer. Shown here in one line of arithmetic instead of asserted.
    const N = [0, 1, 0];
    const frames = [[[0, 0, 1], [1, 0, 0]], [[1, 0, 0], [0, 0, -1]], [[0, 0, -1], [-1, 0, 0]]];
    let worst = 0;
    for (const [Nt, Nb] of frames)
        for (const sv of [[0.3, 0.5, 0.81], [-0.6, 0.2, 0.77], [0.1, 0.99, 0.09]]) {
            const dir = [sv[0] * Nb[0] + sv[1] * N[0] + sv[2] * Nt[0],
                         sv[0] * Nb[1] + sv[1] * N[1] + sv[2] * Nt[1],
                         sv[0] * Nb[2] + sv[1] * N[2] + sv[2] * Nt[2]];
            worst = Math.max(worst, Math.abs((dir[0] * N[0] + dir[1] * N[1] + dir[2] * N[2]) - sv[1]));
        }
    ok("*** and the key is BLIND to the tangent frame, which is a property and not an oversight: cos(theta) comes out as sv.y for every orthonormal frame about the same N ***",
        worst === 0,
        `worst departure ${worst.toExponential(2)} over ${frames.length} frames including a left-handed one. A sabotage swapping the shader's tangent goes 0 red BECAUSE OF THIS; what the key does see is N, and leaving it non-unit at 0.9 moves four of the six cases to 1.90e-1`);
}

const skip = webgpuSkipReason();
console.log("\n2. THE DEVICE HITS ALL SIX CONSTANTS, and 3. WHAT THE ZERO-VARIANCE PAIR ISOLATES");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const perLanes = [16, 64, 256];
    const jobs = [];
    for (const per of perLanes) for (const c of CASES)
        jobs.push({ key: `${c.name}@${per}`, per, pack: [...new Uint32Array(packFurnaceParams({ seed: 1, perLane: per, faults: faultBits(c.opts), laneCount: LANES }))] });
    // and one extra seed at the reference count, to show the key does not depend on the stream
    for (const c of CASES)
        jobs.push({ key: `${c.name}@seed7`, per: PER, pack: [...new Uint32Array(packFurnaceParams({ seed: 7, perLane: PER, faults: faultBits(c.opts), laneCount: LANES }))] });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { LANES, jobs, wgsl: FURNACE_WGSL }, script: `async (a) => {
        const out = { parts: {} };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const mod = dev.createShaderModule({ code: a.wgsl });
            const info = await mod.getCompilationInfo?.();
            out.compileErrors = (info ? info.messages : []).filter((m) => m.type === "error").map((m) => m.message.slice(0, 200));
            if (out.compileErrors.length) return out;
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: "furnace" } });
            for (const j of a.jobs) {
                const uni = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint32Array(j.pack));
                const pb = dev.createBuffer({ size: a.LANES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } } ] });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(a.LANES / 64)); p.end();
                const rb = dev.createBuffer({ size: a.LANES * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, a.LANES * 4); dev.queue.submit([enc.finish()]);
                await rb.mapAsync(GPUMapMode.READ);
                out.parts[j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy();
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });
    ok("*** the furnace estimator COMPILES AND RUNS on a device -- the first piece of the path tracer to do so beyond v4290's two decidable fragments ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0 && r.result.parts,
        r.ok ? (r.result && r.result.error) || `compile errors: ${(r.result && r.result.compileErrors || []).join("; ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result;
        const est = (key, per) => estimateFrom(F.parts[key], { albedo: 1, samples: LANES * per });
        const errAt = (c, per) => Math.abs(est(`${c.name}@${per}`, per) - c.want) / c.want;

        const rows = CASES.map((c) => ({ c, e: errAt(c, PER), tol: c.exact ? EXACT_TOL : NOISY_TOL }));
        ok(`*** the device lands on all six analytic constants at ${SAMPLES.toLocaleString()} samples: ${rows.map((x) => `${x.c.name} ${x.e.toExponential(2)}`).join(", ")} ***`,
            rows.every((x) => x.e < x.tol),
            `each against its own earned band (${EXACT_TOL} for the zero-variance pair, ${NOISY_TOL} for the noisy four). No CPU value appears in this check -- the targets are 1, 1/(2 PI), 2, 4/PI, 1 and 4/3`);
        // THE KEY DOES NOT DEPEND ON THE STREAM
        const seedRows = CASES.map((c) => ({ c, e: Math.abs(estimateFrom(F.parts[`${c.name}@seed7`], { albedo: 1, samples: SAMPLES }) - c.want) / c.want }));
        ok(`  and a DIFFERENT SEED lands on the same six: ${seedRows.map((x) => x.e.toExponential(2)).join(", ")} -- so the agreement is not one lucky stream`,
            seedRows.every((x, i) => x.e < rows[i].tol),
            "v4290 measured that the generator's OUTPUT is not portable even between conformant devices; this is the reason that does not matter to a key like this one");

        console.log("\n3. THE ZERO-VARIANCE PAIR, WHERE THE ONLY THING LEFT IS f32");
        const exactCases = CASES.filter((c) => c.exact);
        const curve = exactCases.map((c) => perLanes.map((p) => errAt(c, p)));
        ok(`*** in the two estimators with sigma exactly 0, the device's error GROWS with the sample count -- ${curve[0].map((e) => e.toExponential(2)).join(" -> ")} at ${perLanes.map((p) => (LANES * p).toLocaleString()).join(", ")} samples -- which is the per-lane f32 sum accumulating, not sampling noise ***`,
            curve.every((row) => row[0] < row[1] && row[1] < row[2]) && curve.every((row) => row.every((e) => e < EXACT_TOL)),
            `${exactCases.map((c, i) => `${c.name}: ${curve[i].map((e) => e.toExponential(2)).join(", ")}`).join("; ")}. More samples is WORSE here, which is the opposite of what a noisy estimator does and is the signature that identifies it`);
        ok(`  while the CPU's error in the same two cases does not move at all: ${exactCases.map((c) => spread[c.name].worst.toExponential(2)).join(" and ")} at every seed, five orders below the device`,
            exactCases.every((c) => spread[c.name].worst < 1e-11),
            "f64 has room the sum does not exhaust; f32 does not. That comparison is only legible because the estimator contributes nothing -- in the other four it would be buried under 1e-4 of noise");
        report("WHAT THIS DOES NOT ESTABLISH, AND IT IS MOST OF THE TRACER. `trace` is still ~300 lines of MIS, " +
               "microfacet lobes, Fresnel, energy compensation and roulette, and none of it runs on a device. What " +
               "crosses here is the estimator those pieces are integrated BY, plus the sampling and the basis it " +
               "needs. The next piece with a closed form of its own is the one to take next, for the same reason " +
               "this one was takeable: a key beats a comparison whenever the two machines cannot agree by construction.");
    }
}

// SABOTAGE LOG -- applied to physics/render/furnaceWgsl.mjs, gate run, exit code read, restored.
//   A  the cosine read from r1 instead of from the DIRECTION -- furnace.mjs names this shortcut and says taking
//      it "would hide half the fault by making the estimator self-consistent" -> exit=1, 2 red: badSampler goes
//      to 2.15e-1 and cosine-wrongPdf to 2.50e-1, while clean stays at 3.86e-4. Exactly half the faults, which
//      is what that comment predicts, now measured on a device.
//   B  the cosine-weighted pdf multiplied by PI instead of divided -> exit=1, 3 red: cosine-clean leaves its
//      1e-5 band by four orders, and section 3 goes with it because that case is one of the zero-variance pair.
//   C  the shader's tangent swapped from +Z to +X -> 0 RED, AND IT IS A PROPERTY RATHER THAN A GAP. That is a
//      different, left-handed, still-orthonormal frame about the same N, and the furnace integrand is
//      azimuthally symmetric: the estimator reads only cos(theta) = dot(dir, N). Section 1 now pins that in
//      arithmetic. This file's own header USED TO BORROW pathTracerWgsl's argument that building the basis
//      in-shader puts a handedness error inside the comparison; for THIS key that is false, and the sabotage is
//      what found it. The claim is corrected in the module rather than left standing.
//   C' N itself left non-unit at 0.9, which is the one part of the basis the key can see -> exit=1, 2 red: the
//      four cosine-bearing cases all move to 1.90e-1 together. The zero-variance pair stays green, because
//      noCosine drops the cosine and cosine-clean cancels it against the pdf -- so even here, two of the six
//      cannot see it, and the gate does not pretend otherwise.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE TRACER, as above. A REAL card's f32 against SwiftShader's -- section 3's growth " +
    "curve is an accumulation fact and should hold anywhere, but the constant is this adapter's. The microfacet " +
    "lobes, which furnace.mjs's own white-furnace test can grade and this port does not carry yet: radiance() is " +
    "the constant 1 here, which is the furnace's simplest form. And SPEED, which nothing here times, on a software " +
    "rasteriser where a millisecond would be a fact about a CPU pretending to be a GPU.");
process.exit(fails ? 1 : 0);
