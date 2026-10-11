#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsrGPU-selfcheck.mjs -- v4588
//
// Run: node fx/fsr/fsrGPU-selfcheck.mjs
// RUNTIME 3084 ms ALONE (median of 3132/3084/3017), just over the 3000 ms sweep budget: it spawns a browser
// origin and a real adapter, like fx/fsr/fsr-selfcheck.mjs, and times 60 dispatches inside it. quickSweep will
// re-run it serially per v4408 and file an ALONE reading.
//
// *** THE KERNELS WERE PROVEN ON A DEVICE AND NOTHING OUTSIDE THE GATE COULD RUN THEM. ***
//
// fx/fsr/fsr-selfcheck.mjs holds EASU and RCAS to the CPU reference to 3e-7 on a real adapter -- and it does it
// by building the buffers, the pipeline and the dispatch INLINE, twice, inside a page it spawns itself. That was
// the only code in the tree that ran the WGSL. A gate is not a caller: it proves a kernel and ships nothing.
// That gate's own closing line named the gap twice, in its own words: "no caller in this tree yet uses it", and
// "SPEED -- nobody has timed either kernel against bilinear or against anime4k".
//
// fx/fsr/fsrGPU.js is the caller. This gate is about the three things the port adds that the kernel gate could
// not ask, because it had no runner to ask them of:
//
//   1. THE CHAIN. fsr1() runs EASU and RCAS on ONE encoder, so the display-resolution intermediate never crosses
//      back to the CPU. Nobody had run the two kernels back to back on the device at all -- the kernel gate runs
//      each alone against its own CPU mirror. Asserted BIT-IDENTICAL against the same two passes run separately
//      with a readback between them: same kernels, same order, and the only difference is where the intermediate
//      lives, so anything but equality means the chaining changed the picture.
//   2. SPEED, which is the gap the other gate names and does not fill.
//   3. THE OVERSHOOT, AT A CALLER. RCAS takes 1.000 to 1.166 at a local peak: RCAS_LIMIT keeps the resolve off
//      the pole of 1/(4*lobe+1), it does not bound the range. The kernel gate measured that and then wrote "no
//      caller in this tree yet clamps it, because no caller in this tree yet uses it". There is one now, so the
//      question is live: fsr1() must NOT clamp (that would change the algorithm for every caller) and must
//      report the range, and clampForDisplay must bound it for the caller writing 8 bits.
//
// AND ONE STALE SENTENCE FIXED NEXT DOOR: fsr-selfcheck's header and closing say the temporal path is unreachable
// because "this tree has NO motion vectors and no previous-frame view-projection matrix anywhere in it". Both
// arrived after that was written -- render/motionVectors.mjs takes `vpPrev` and render/jitter.mjs exports
// frameMatrices -- and fsr.html now runs the whole temporal path every frame. A stated limit that outlived the
// limit still reads as current, which is how the FSR page came to be described as impossible while it existed.
// SABOTAGE: 6 mutations, 6 caught, no 0-RED. Applied to fx/fsr/fsrGPU.js and fx/fsr/fsrKernels.js, gate run, red
// count read, both restored and md5-checked against a sentinel taken first.
//   S1  the chain's second pass bound to `src` instead of `mid` -- the pass ordering broken while the picture
//       stays plausible. The bit-identical row caught it with 48,589 of 49,152 channels differing, which is the
//       row that exists for exactly this and could not have been asked before there was a runner to ask it of.
//   S2  fsr1() clamps into [0,1] inside the pass -> 5 rows red, including the overshoot row going to "0 of 49152
//       above 1.0". A silent clamp is the failure this file's whole third section is about, and it is loud.
//   S3  the device refusal turned into `!device && ...` -> the driven refusal row red with "device.compute is
//       not a function", which is the failure-at-the-first-frame the door check exists to move to the door.
//   S4  denoise and sharp swapped in the RCAS uniform -> 2 rows red at 8.22e-1. *** THE FIRST ATTEMPT AT THIS ONE
//       DID NOT APPLY -- its anchor was wrong, python raised, and the pass scored FAIL=0. That is a NO-OP, NOT A
//       0-RED, *** and scoring it as one would have recorded the uniform layout as untested while calling it
//       tested. Re-applied against the real line and caught.
//   S5  clampForDisplay halves alpha -> the alpha row red, alone, which is what says that row is not a duplicate
//       of the row above it.
//   S6  the EASU kernel's workgroup narrowed to (4,8,1) so half the output is never written -> 3 rows red at
//       1.00e+0. The mutation is in the KERNEL rather than the runner, because a runner gate that only ever
//       breaks its own file has not shown it would notice the thing it wraps changing underneath it.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { codeOnly, noComments } from "../../tools/ship/sourceScan.mjs";
import { easuCPU, rcasCPU, fsr1CPU } from "./fsr.js";
import { clampForDisplay } from "./fsrGPU.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 64, M = 128;                       // render 64x64 -> display 128x128
const SRC = new Float32Array(N * N * 4);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    // a diagonal edge, a chequer corner and a bright spike -- the spike is what makes RCAS overshoot, and the
    // overshoot is one of the three things this gate exists to measure rather than a picture chosen to be tidy
    let r = x + y > N ? 0.85 : 0.12;
    let g = ((x >> 2) + (y >> 2)) & 1 ? 0.7 : 0.2;
    let b = 0.5 + 0.4 * Math.sin(x * 0.4) * Math.cos(y * 0.3);
    if (x === 40 && y === 24) { r = g = b = 1; }
    SRC[o] = r; SRC[o + 1] = g; SRC[o + 2] = b; SRC[o + 3] = 1;
}

console.log("fsrGPU-selfcheck -- the kernels had no caller; this is the caller\n");

console.log("1. THE RUNNER EXISTS AND IS THE ONLY DISPATCHER -- no second copy of gfx/device.js's job");
{
    const runnerRaw = fs.readFileSync(path.join(ENG, "fx", "fsr", "fsrGPU.js"), "utf8");
    // *** codeOnly, AND THE FIRST DRAFT USED THE RAW SOURCE AND WENT RED ON ITS OWN COMMENT. ***
    // The runner's header EXPLAINS that it does not call createComputePipeline/createBindGroup/mapAsync, and
    // naming them there put all three in the file. That is the absence-check trap this session has now paid for
    // five times across the arc -- a check for removed text finding it in the sentence recording the removal.
    // codeOnly() strips comments AND empties string literals, which is right here because what is being asked
    // is whether these functions are CALLED; a mention inside a string would not be a call either.
    const runner = codeOnly(runnerRaw);
    // AND noComments FOR ANYTHING QUOTED, WHICH THE NEXT ROW NEEDED AND DID NOT HAVE. codeOnly EMPTIES string
    // literals as well as stripping comments, so `backend !== "webgpu"` reads as `backend !== ""` through it and
    // the refusal row went red against a runner that refuses correctly. Three instruments, three questions:
    // codeOnly for "is this CALLED", noComments for "is this STRING in live code", prose for "is this SAID".
    const runnerCode = noComments(runnerRaw);
    // `createComputePipeline` is what fx/anime4k/anime4k.js's Anime4KGPU calls -- raw WebGPU, under a comment
    // saying it is correct by construction and has never run headless. The rule is not "anime4k is wrong"; it
    // is that this tree has one device layer and a second one would drift from it.
    ok("!! *** the runner goes through gfx/device.js and does NOT open raw WebGPU ***",
        !/createComputePipeline|createBindGroup|createShaderModule|mapAsync/.test(runner) &&
        /device\.compute\(|dev\.buffer\(|pass\.dispatch\(|dev\.read\(/.test(runner),
        "Anime4KGPU calls createComputePipeline/createBindGroup/mapAsync directly and carries the comment " +
        "\"correct-by-construction; no WebGPU headless here\" -- the second dispatcher in the tree, and the one " +
        "that has never run. gfx/device.js is the driver; the FSR gate already drove the kernels through it.");
    ok("...and it refuses a device that cannot run compute, rather than degrading quietly",
        /backend !== "webgpu"/.test(runnerCode) && /There is no compute stage in WebGL2/.test(runnerCode),
        "a WebGL2 device has no compute stage at all, so there is nothing to fall back TO. The caller picks " +
        "easuCPU/rcasCPU by asking; being handed a silent CPU path under a GPU name is how a port stops being one.");
    ok("!! ...and fsr1() does not clamp, because the algorithm's answer is not the display's",
        !/Math\.min\(1|> 1 \? 1/.test(runner.slice(runner.indexOf("async fsr1"), runner.indexOf("clampForDisplay"))) &&
        /export function clampForDisplay/.test(runner),
        // `runner` (code only) on both halves: the clamp question is about statements, and the header sentence
        // explaining why fsr1 does not clamp would answer the first half of it wrongly.
        "RCAS_LIMIT keeps the resolve off the pole of 1/(4*lobe+1); it does NOT bound the range. Clamping in the " +
        "pass would change the algorithm for every caller and hide it -- so the range is reported and the " +
        "clamping happens where the 8 bits are.");
}

console.log("\n2. ON THE DEVICE: the runner's three entry points against the CPU reference");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Nothing here has run."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, M, src: Array.from(SRC) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { FSRGPU } = await import("/fx/fsr/fsrGPU.js");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const src = new Float32Array(a.src);
        const G = new FSRGPU(dev);

        const easu = await G.easu(src, a.N, a.N, a.M, a.M);

        // THE SAME KERNEL DISPATCHED INLINE, the way fx/fsr/fsr-selfcheck.mjs does it -- the runner has to be
        // held to something that is not the CPU, or a difference cannot be attributed. Same WGSL, same device,
        // same picture; anything but bit-equality is the RUNNER, and equality leaves only f32-against-f64.
        const { EASU_WGSL } = await import("/fx/fsr/fsrKernels.js");
        const inlineOut = await (async () => {
            const u = dev.buffer({ data: new Uint32Array([a.N, a.N, a.M, a.M]), usage: "uniform" });
            const s2 = dev.buffer({ data: src, usage: ["storage"] });
            const d2 = dev.buffer({ data: new Float32Array(a.M * a.M * 4), usage: ["storage"] });
            const p2 = dev.compute({ wgsl: EASU_WGSL });
            p2.bind("src", s2).bind("dst", d2).bind("u", u);
            const g2 = Math.ceil(a.M / 8);
            dev.frame(({ pass }) => { pass.dispatch(p2, [g2, g2]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(d2)));
        })();
        const rcas = await G.rcas(easu.data, a.M, a.M, 1, false);
        const chain = await G.fsr1(src, a.N, a.N, a.M, a.M, 1, false);

        // *** THE PAGE'S OWN BRING-UP SEQUENCE, RUN VERBATIM. *** fsr.html decides between the runner and the
        // CPU reference in four steps, and every one of them is a place a rig can fail where this box cannot:
        // navigator.gpu present, requestDevice on an 8x8 offscreen canvas, the constructor, and READING
        // dev.adapterInfo for the engine line. The last is the one that bites -- adapterInfo is optional in the
        // spec and a page that prints it unguarded throws on an adapter that withholds it.
        let pageBringUp = null;
        try {
            const cv2 = document.createElement("canvas"); cv2.width = 8; cv2.height = 8;
            const d2 = await requestDevice(cv2, { backend: "webgpu", offscreen: true });
            const g2 = new FSRGPU(d2);
            const who = (d2.adapterInfo && (d2.adapterInfo.description || d2.adapterInfo.vendor)) || "webgpu";
            const out2 = await g2.fsr1(src, a.N, a.N, a.M, a.M, 1, false);
            pageBringUp = { ok: !!navigator.gpu, who: String(who), n: out2.data.length, hasRange: !!out2.range };
        } catch (e) { pageBringUp = { error: String(e && e.message).slice(0, 160) }; }

        // the refusal, driven rather than read from the source
        let refused = null;
        try { new FSRGPU({ backend: "webgl2" }); } catch (e) { refused = String(e.message).slice(0, 160); }

        // SPEED. Each timed over repeats after a warm-up, because the first submit carries pipeline creation
        // and would be timing the compile. CPU time around the submit and the readback -- gfx/device.js refuses
        // timestamp queries unless the adapter has the feature, and this measures what a caller waits for.
        const time = async (fn, reps) => { await fn(); const t0 = performance.now(); for (let i = 0; i < reps; i++) await fn(); return (performance.now() - t0) / reps; };
        const REPS = 20;
        const msChain = await time(() => G.fsr1(src, a.N, a.N, a.M, a.M, 1, false), REPS);
        const msTwo = await time(async () => { const e = await G.easu(src, a.N, a.N, a.M, a.M); return G.rcas(e.data, a.M, a.M, 1, false); }, REPS);
        const msEasu = await time(() => G.easu(src, a.N, a.N, a.M, a.M), REPS);

        return { easu: Array.from(easu.data), rcas: Array.from(rcas.data), chain: Array.from(chain.data), inlineOut,
                 chainRange: chain.range, easuRange: easu.range, rcasRange: rcas.range,
                 refused, errs, backend: dev.backend, msChain, msTwo, msEasu, reps: REPS, pageBringUp,
                 adapter: (dev.adapterInfo && (dev.adapterInfo.description || dev.adapterInfo.vendor)) || "unknown" };
    }` });

    ok("the runner ran on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && (r.result.errs || []).length === 0,
       r.ok ? `${r.result && r.result.backend}, adapter ${r.result && r.result.adapter}; errors ${(r.result && r.result.errs || []).join(" | ")}`
            : (r.reason || (r.pageErrors || []).join("; ")));

    if (r.ok && r.result) {
        const R = r.result;
        // POSITIONAL, because that is what fsr.js declares: rcasCPU(src, w, h, sharpness = 1, denoise = false)
        // and fsr1CPU(src, w, h, W, H, sharpness = 1, denoise = false). The first draft passed { denoise: true }
        // and { sharpness: 1 } -- an object landed in fsr1CPU's positional `sharpness`, reached arithmetic, and
        // the row reported "worst NaN". THE CRASH WAS THE SMALL HALF: the runner had been written with an
        // options object and a denoise default of true, so the GPU path answered a different question from the
        // reference it mirrors for the same call. The signature is fsr.js's now, positionally and by default.
        const cE = easuCPU(SRC, N, N, M, M), cR = rcasCPU(cE.data, M, M, 1, false), cF = fsr1CPU(SRC, N, N, M, M, 1, false);
        const worst = (a, b) => { let w = 0; for (let i = 0; i < M * M; i++) for (let c = 0; c < 3; c++) w = Math.max(w, Math.abs(a[i * 4 + c] - b[i * 4 + c])); return w; };

        const wE = worst(R.easu, cE.data), wR = worst(R.rcas, cR.data), wF = worst(R.chain, cF.data);

        // *** THE RUNNER ADDS NOTHING: held to the SAME kernel dispatched inline, not to the CPU. ***
        // This row exists because the CPU rows below could not tell a runner bug from arithmetic. They came in
        // at 1.0e-5 against the kernel gate's 2.98e-7 and the tempting move was to widen the tolerance and call
        // it f32 -- a number chosen to fit the answer. Equality here says the buffers, the uniform layout, the
        // workgroup count and the readback are exactly the inline path's, so whatever is left is arithmetic.
        let runnerDiff = 0;
        for (let i = 0; i < M * M * 4; i++) if (R.easu[i] !== R.inlineOut[i]) runnerDiff++;
        ok("!! *** the runner's picture is BIT-IDENTICAL to the same kernel dispatched inline ***",
           runnerDiff === 0,
           `${runnerDiff} of ${M * M * 4} floats differ from the inline dispatch fx/fsr/fsr-selfcheck.mjs uses. ` +
           "Held against the INLINE path rather than the CPU, because a CPU comparison cannot separate a wiring " +
           "mistake from f32 against f64 -- and the difference below is 34x the kernel gate's on its own picture.");

        // AND THE TOLERANCE IS THE PICTURE'S, MEASURED, NOT THE OTHER GATE'S COPIED. 1e-6 was lifted from
        // fx/fsr/fsr-selfcheck.mjs, which measures 2.98e-7 on a 32x32 -> 64x64 picture with no high-frequency
        // content. This gate's picture carries sin(0.4x)cos(0.3y) in blue and a lone white spike, so EASU's
        // 1/max(len, 1e-5) normalisation runs against much smaller denominators and f32 loses more there. The
        // claim is 1e-4 and the DETAIL is the fact, which is the shape the kernel gate uses for the same reason.
        ok(`*** easu() is the CPU reference's picture, to ${wE.toExponential(2)} on every one of ${M * M * 3} channels ***`,
           wE < 1e-4, `worst ${wE.toExponential(3)} -- f32 on the device against f64 in JS through a 12-tap ` +
           "accumulation. 34x the kernel gate's 2.98e-7, on a picture built to be harder rather than tidier.");
        ok(`*** rcas() is the CPU reference's picture, to ${wR.toExponential(2)} ***`, wR < 1e-4,
           `worst ${wR.toExponential(3)} -- RCAS runs on EASU's output, so it inherits that error and its own ` +
           "1/(4*lobe+1) resolve amplifies it near a peak.");
        ok(`*** fsr1() CHAINED ON ONE ENCODER is fsr1CPU's picture, to ${wF.toExponential(2)} ***`, wF < 1e-4,
           `worst ${wF.toExponential(3)}. NOBODY HAD RUN THE TWO KERNELS BACK TO BACK ON THE DEVICE AT ALL -- ` +
           "the kernel gate runs each alone against its own mirror, so the pass ordering on one encoder was " +
           "assumed rather than measured until this row.");

        // *** AND THE CHAIN AGAINST THE SAME TWO PASSES RUN SEPARATELY, WHICH IS THE STRONGER CLAIM. ***
        // Equality with the CPU is bounded by f32-against-f64. Equality with the SAME kernels in the SAME order
        // on the SAME device has no such excuse: the only difference is whether the intermediate crossed to the
        // CPU and back, so anything but BIT-identical means the second dispatch read something else.
        let diff = 0, worstChain = 0;
        for (let i = 0; i < M * M; i++) for (let c = 0; c < 3; c++) {
            const d = Math.abs(R.chain[i * 4 + c] - R.rcas[i * 4 + c]);
            if (d !== 0) diff++; worstChain = Math.max(worstChain, d);
        }
        ok("!! *** the chained result is BIT-IDENTICAL to the two passes run separately with a readback between ***",
           diff === 0,
           `${diff} of ${M * M * 3} channels differ (worst ${worstChain.toExponential(2)}). Same kernels, same ` +
           "order, same device -- the only difference is where the intermediate lives, so f32-against-f64 is no " +
           "excuse here and equality is exact or the ordering is wrong.");

        // ---- THE OVERSHOOT, AT A CALLER -------------------------------------------------------------------
        let over = 0, under = 0;
        for (let i = 0; i < M * M; i++) for (let c = 0; c < 3; c++) { const v = R.chain[i * 4 + c]; if (v > 1) over++; if (v < 0) under++; }
        ok(`!! *** RCAS OVERSHOOTS AT A REAL CALLER, and the runner reports it instead of hiding it ***`,
           R.chainRange.max > 1 && R.chainRange.overshot === true && over > 0,
           `${over} of ${M * M * 3} channels above 1.0 and ${under} below 0.0; range ` +
           `[${R.chainRange.min.toFixed(4)}, ${R.chainRange.max.toFixed(4)}]. The kernel gate measured 1.000 -> ` +
           "1.166 on a synthetic peak and wrote \"no caller in this tree yet clamps it, because no caller in " +
           "this tree yet uses it\". This is the caller, and the picture is an ordinary one.");

        const clamped = clampForDisplay(new Float32Array(R.chain));
        let stillOut = 0, moved = 0;
        for (let i = 0; i < M * M; i++) for (let c = 0; c < 3; c++) {
            if (clamped[i * 4 + c] > 1 || clamped[i * 4 + c] < 0) stillOut++;
            if (clamped[i * 4 + c] !== R.chain[i * 4 + c]) moved++;
        }
        ok("...and clampForDisplay bounds exactly the channels that were out, and no others",
           stillOut === 0 && moved === over + under && moved > 0,
           `${moved} channels moved, ${stillOut} still outside [0,1]. A clamp that moved MORE than the ` +
           "out-of-range channels would be quietly reshaping the picture rather than fitting it to 8 bits.");

        ok("...and the alpha channel is not touched by the clamp",
           (() => { for (let i = 0; i < M * M; i++) if (clamped[i * 4 + 3] !== R.chain[i * 4 + 3]) return false; return true; })(),
           "rgb is what RCAS moves; clamping alpha would be a second, unannounced change.");

        // ---- SPEED, THE GAP THE KERNEL GATE NAMES AND DOES NOT FILL ---------------------------------------
        const t0 = performance.now(); for (let i = 0; i < 5; i++) fsr1CPU(SRC, N, N, M, M, 1, false); const msCPU = (performance.now() - t0) / 5;
        report(`SPEED at ${N}x${N} -> ${M}x${M}, mean of ${R.reps} after a warm-up: fsr1 chained ${R.msChain.toFixed(2)} ms, ` +
               `the same two passes separately ${R.msTwo.toFixed(2)} ms, easu alone ${R.msEasu.toFixed(2)} ms, fsr1CPU ${msCPU.toFixed(2)} ms (mean of 5, this process)`);
        report(`the chain saves ${(R.msTwo - R.msChain).toFixed(2)} ms against the two-call form (${(100 * (R.msTwo - R.msChain) / R.msTwo).toFixed(0)}%), ` +
               `which is one ${M}x${M} readback and one upload of ${(M * M * 16 / 1024).toFixed(0)} KB not taken`);

        // *** THE SPEED NUMBERS ARE REPORTED AND NOT ASSERTED, AND THAT IS A DECISION. ***
        // A row like "the GPU beats the CPU" would be a ratchet on somebody else's hardware: this box has a
        // software adapter, the rig has a real one, and at 64x64 -> 128x128 the whole picture is 64 KB, which is
        // small enough that the submit and the readback dominate the arithmetic. What IS asserted is the only
        // part that is a property of the code rather than of the machine: the chain does strictly less I/O than
        // the two-call form, so it cannot be slower for a reason this file controls.
        ok("!! the chain does strictly less work than the two-call form, which is the part that is not hardware",
           R.msChain <= R.msTwo * 1.2,
           `chained ${R.msChain.toFixed(2)} ms against ${R.msTwo.toFixed(2)} ms. The 1.2 is slack for timing ` +
           "noise on a software adapter, not a performance claim -- the claim is that one submit and one " +
           "readback cannot cost more than two of each except by noise.");

        ok("!! *** fsr.html's own bring-up runs: navigator.gpu, requestDevice, the constructor, adapterInfo ***",
           !!R.pageBringUp && !R.pageBringUp.error && R.pageBringUp.ok === true &&
           R.pageBringUp.n === M * M * 4 && R.pageBringUp.hasRange === true,
           R.pageBringUp && R.pageBringUp.error ? "THREW: " + R.pageBringUp.error
             : `adapter "${R.pageBringUp && R.pageBringUp.who}", ${R.pageBringUp && R.pageBringUp.n} floats back, ` +
               "range reported. adapterInfo is OPTIONAL in the spec, so the page reads it through two fallbacks " +
               "and this row runs that read rather than trusting it.");

        ok("...and the refusal is DRIVEN, not read: a non-webgpu device throws at construction",
           typeof R.refused === "string" && /webgpu/.test(R.refused),
           R.refused || "constructing FSRGPU on a webgl2 device did NOT throw -- a runner that accepts a device " +
           "it cannot dispatch on hands the caller a failure at the first frame instead of at the door");
    }
}

console.log(fails ? `\nfsrGPU-selfcheck: ${fails} FAILED` : "\nfsrGPU-selfcheck: ALL GREEN");
console.log("unchecked here: the TEMPORAL path on the device -- render/temporalResolve.mjs and " +
            "render/temporalAccumulate.mjs are CPU-only and have no WGSL, so fsr.html's temporal pane stays on " +
            "the CPU whatever the adapter does; a storage-TEXTURE path, since gfx/device.js binds storage buffers " +
            "and the reference writes textureStore; and the timings above on real hardware, which this box does " +
            "not have -- they are this adapter's numbers and are labelled with it.");
// *** v4677 -- process.exitCode, NOT process.exit(). MEASURED, NOT ASSUMED. ***
// libuv aborts a Windows process.exit() taken while the platform still has queued work:
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c   (exit 0xC0000409)
// after a clean scoreline. v4663 picked its 48 conversions by asking DOES THIS GATE COMPILE A WASM MODULE -- a
// CAUSE. This one was found by measuring the SYMPTOM with tools/ship/exitBusy.mjs: process CPU across an
// awaited 300 ms window starting at this line, taken twice.
//   window 1: 1.0 ms     window 2: 15.3 ms
// *** THE SECOND WINDOW IS THE BUSIER ONE. *** The work is queued but has not STARTED inside the first 300 ms,
// so a single-window screen reads this gate as quiet. It is not quiet, and that is why the round's population
// estimate is stated as a floor rather than a count.
// Against a same-process control of 0.9 ms on this box. ONE READING, ON LINUX, where the identical teardown is
// SILENT -- unix/async.c carries no such assertion. So this is a CANDIDATE, not a confirmed crash, and the
// rig's clone-verify remains the instrument for the fact. The conversion costs nothing either way.
process.exitCode = fails ? 1 : 0;
