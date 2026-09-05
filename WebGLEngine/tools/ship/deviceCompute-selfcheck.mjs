#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceCompute-selfcheck.mjs -- v4467
//
// GRADES render/computeRun.mjs -- THE ONE WAY A COMPUTE KERNEL RUNS THROUGH gfx/device.js -- BY RUNNING EVERY BUFFER
// ENTRY OF THE CROSS-BACKEND CORPUS THROUGH IT ON THE BROWSER'S WebGPU AND HOLDING EACH TO THE HEADLESS DAWN HARNESS,
// BYTE FOR BYTE.
//
// Until this round the physics kernels that reached a GPU did it four ways: two harnesses with a signature of their
// own, and two rig pages (hmc-bench.html, mpm-gpu-check.html) that built adapters, pipelines, bind groups and staging
// buffers by hand -- the second of them wrongly (v4466). computeRun binds a kernel's buffers BY THE NAMES ITS WGSL
// DECLARES, dispatches inside one device frame and reads back through the device; corpusSpec() maps the harnesses'
// one-buffer signature onto it by those same names. So the claim here is not "a kernel ran": it is that the corpus's
// eighteen runnable kernels -- the bloom, badTv, the path tracer's four, the cull probe, three physics probes, the
// furnace and the SBT pipeline, the Slug probes, the three XPBD passes and the HMC leapfrog -- return the SAME BYTES
// through the device as through the harness that has held the two backends to each other since v4294. A third path
// to the same numbers, and every entry that ever joins the corpus is covered by it for free.
//
// The two rig pages are read from source: both import the device and neither touches navigator.gpu or a pipeline.
//
// MEASURED AT v4467 (this box): 69,517 floats across 18 kernels identical through the device, 539 ms on the device
// for all of them, the largest (the bloom, 12,288 floats) 153 ms.
//
// SABOTAGE LOG (v4467) -- each applied to render/computeRun.mjs, gate run, exit read, file restored byte for byte:
//   A  corpusSpec drops outInit (the in-place kernel starts from zeros)  -> exit=1, 2 red: the XPBD solve at 11 of 100
//      and the summary; every other entry green, which is the right shape -- one option, one kernel that needs it.
//   B  one workgroup fewer than asked                                    -> exit=1, 12 red: every entry whose work
//      spans more than one workgroup ends short (the LCG at 1344 of 1536, coverage at 13504 of 13824 ...), the
//      single-workgroup entries green. The count travels through the device untouched, and this is the line that
//      says so.
//   C  the 16-byte uniform padding removed                               -> exit=1, 1 red, the source check only: THE
//      API ACCEPTED EVERY UNPADDED UNIFORM IN THE CORPUS. The floor is the harnesses' convention (headlessGpu pads to
//      16 and so does the browser harness), kept so the three paths hand the device the same bytes, not because a
//      kernel here needs it. Said here so the check is not mistaken for a correctness claim.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, storageWords } from "./headlessGpu.mjs";
import { nullBackend } from "../../gfx/device.js";
import { corpus } from "./wgslCorpus.mjs";
import { runCompute, corpusSpec, uniformBytes } from "../../render/computeRun.mjs";
import { WGSL_HMC, WGSL_HMC_PROBE, probeUniforms, makeBatch } from "../roundhouse/hmcGpu.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

console.log("\n1. THE RUNNER BINDS BY NAME, REFUSES BY NAME, AND THE TWO RIG PAGES GO THROUGH THE DEVICE");
{
    const nb = nullBackend();
    const { qin, pin, n } = makeBatch(64, 5);
    const r = await runCompute(nb, { code: WGSL_HMC, workgroups: 1, buffers: { P: { data: probeUniforms(n) }, qin: { data: qin }, pin: { data: pin }, qout: { size: 8 * n }, pout: { size: 8 * n } } });
    const binds = nb.ops.filter((o) => o[0] === "bind").map((o) => o[1]);
    ok("*** the shipped HMC kernel binds its five buffers by the names the WGSL declares, and dispatches once ***", binds.join() === "P,qin,pin,qout,pout" && nb.ops.filter((o) => o[0] === "dispatch").length === 1, binds.join(","));
    ok("  and reads back every read_write storage buffer by default, and only those", r.qout instanceof ArrayBuffer && r.pout instanceof ArrayBuffer && !("qin" in r) && !("pin" in r) && !("P" in r), "(the null backend holds no bytes for a size-only buffer; the browser section reads real ones)");
    let msg = ""; try { await runCompute(nb, { code: WGSL_HMC, buffers: { nope: { size: 4 } } }); } catch (e) { msg = e.message; }
    ok("*** an unknown buffer name is refused by name, listing what the kernel declares ***", /no storage or uniform binding named "nope"/.test(msg) && /P, qin, pin, qout, pout/.test(msg));
    try { msg = ""; await runCompute(nb, { code: WGSL_HMC, buffers: { P: { data: probeUniforms(n) } } }); } catch (e) { msg = e.message; }
    ok("  a bound-but-unsupplied buffer is refused too", /binds "qin" and no buffer was given/.test(msg), msg.slice(0, 80));
    const spec = corpusSpec({ code: WGSL_HMC_PROBE, outCount: 4 * n, uniforms: probeUniforms(n), workgroups: 1, inputs: [{ binding: 2, data: qin }, { binding: 3, data: pin }] });
    ok("corpusSpec maps the harness signature onto the kernel's own names: out at 0, uniform at 1, inputs by binding", Object.keys(spec.buffers).join() === "out,P,qin,pin" && spec.read.join() === "out" && spec.buffers.P.usage === "uniform");
    ok("  a uniform buffer is padded to a multiple of 16 bytes, never below 16", uniformBytes(new Float32Array(1)).byteLength === 16 && uniformBytes(new Float32Array(5)).byteLength === 32);
    const hmc = codeOf(read("hmc-bench.html")), mpm = codeOf(read("mpm-gpu-check.html"));
    ok("*** hmc-bench.html runs its kernel through requestDevice + runCompute and builds no pipeline of its own ***", /import \{ requestDevice \} from "\/gfx\/device\.js"/.test(hmc) && /runCompute\(dev, \{ code: WGSL_HMC/.test(hmc) && !/createComputePipeline|requestAdapter|createBindGroup/.test(hmc));
    ok("*** mpm-gpu-check.html runs its kernel through makeMpmDevice and builds no pipeline of its own ***", /import \{ makeMpmDevice \} from "\/physics\/mpm\/mpmDevice\.mjs"/.test(mpm) && /makeMpmDevice\(dev, \{ nx: NX, ny: NY, block, walls, mode \}/.test(mpm) && !/createComputePipeline|requestAdapter|createBindGroup/.test(mpm));
    ok("  and its stencil sabotage still reaches the kernel, as the runner's `wgsl` option", /wgsl: src/.test(mpm) && /o\.w1 = 0\.755 -/.test(mpm));
    const dev = codeOf(read("gfx/device.js"));
    ok("the device carries powerPreference to the adapter and the adapter's description on the handle", /powerPreference: opts\.powerPreference/.test(dev) && /adapterInfo/.test(dev));
}

console.log("\n2. EVERY RUNNABLE CORPUS ENTRY THROUGH THE DEVICE, HELD TO THE HEADLESS HARNESS BYTE FOR BYTE");
{
    const bSkip = webgpuSkipReason(), nSkip = headlessGpuSkipReason();
    if (bSkip || nSkip) { console.log(`  SKIP  browser: ${bSkip || "ok"} | native: ${nSkip || "ok"}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const entries = corpus().filter((e) => !e.compileOnly && !e.texture);
        const pack = (e) => ({ id: e.id, code: e.opts.code, entryPoint: e.opts.entryPoint || "main", outCount: e.opts.outCount, workgroups: e.opts.workgroups || 1,
            uniforms: e.opts.uniforms ? Array.from(e.opts.uniforms) : null,
            inputs: e.opts.inputs ? e.opts.inputs.map((i) => ({ binding: i.binding, words: Array.from(storageWords(i.data)) })) : null,
            outInit: e.opts.outInit ? Array.from(storageWords(e.opts.outInit)) : null });
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { entries: entries.map(pack) }, script: `async (a) => {
            const C = await import("/render/computeRun.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (dev.backend !== "webgpu") return { noWebgpu: dev.backend };
            const out = {};
            for (const e of a.entries) {
                const opts = { code: e.code, entryPoint: e.entryPoint, outCount: e.outCount, workgroups: e.workgroups, uniforms: e.uniforms ? new Float32Array(e.uniforms) : null,
                               inputs: e.inputs ? e.inputs.map((i) => ({ binding: i.binding, data: new Uint32Array(i.words) })) : null, outInit: e.outInit ? new Uint32Array(e.outInit) : null };
                const t0 = performance.now(); const res = await C.runCorpusEntry(dev, opts); const ms = performance.now() - t0;
                out[e.id] = res.ok ? { ok: true, values: Array.from(res.values), ms } : { ok: false, reason: res.reason };
            }
            dev.destroy(); return out;
        }`, timeoutMs: 180000 });
        ok("*** the corpus ran through the device on the browser's WebGPU ***", r.ok && r.result && !r.result.noWebgpu, r.ok ? (r.result && r.result.noWebgpu ? "no webgpu: " + r.result.noWebgpu : "") : r.reason);
        if (r.ok && r.result && !r.result.noWebgpu) {
            let allIdentical = true, floats = 0, msTotal = 0;
            for (const e of entries) {
                const d = r.result[e.id];
                const nat = await runWgslComputeNative(e.opts);
                if (!d || !d.ok || !nat.ok) { ok(`runs: ${e.id}`, false, (d && d.reason) || nat.reason); allIdentical = false; continue; }
                let same = 0, worst = 0, first = -1;
                for (let i = 0; i < nat.values.length; i++) { if (d.values[i] === nat.values[i]) same++; else { if (first < 0) first = i; worst = Math.max(worst, Math.abs(d.values[i] - nat.values[i])); } }
                const identical = same === nat.values.length && d.values.length === nat.values.length;
                if (!identical) allIdentical = false;
                floats += nat.values.length; msTotal += d.ms;
                ok(`identical through the device: ${e.id}`, identical, identical ? `${same}/${nat.values.length}, ${d.ms.toFixed(0)} ms` : `${same}/${nat.values.length}, first differs at ${first}, max ${worst.toExponential(3)}`);
            }
            ok("*** all of them: the device is a third path to the same bytes ***", allIdentical && entries.length >= 18, `${floats} floats across ${entries.length} kernels in ${msTotal.toFixed(0)} ms on the device`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the two rig pages RUNNING (they are read from source; hmc-bench.html's route is the runner this " +
    "gate drives and mpm-gpu-check.html's is mpmDevice-selfcheck's), the texture entries (the corpus's storage-texture " +
    "path has no device twin yet), and real hardware.");
process.exit(fails ? 1 : 0);
