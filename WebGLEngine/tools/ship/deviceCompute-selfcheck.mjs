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
// rig run 13: launched with PARITY_ARGS, so the device's WebGPU and node-webgpu are one adapter (see crossBackend-selfcheck)
import { runInEngineOrigin, webgpuSkipReason, PARITY_ARGS } from "./webgpuHarness.mjs";
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

// *** v4814 -- ON A HARDWARE ADAPTER, TWO DAWN BUILDS MAY ROUND DIFFERENTLY, AND "SAME BYTES" IS NOT WHAT THE SPEC
// PROMISES THERE (Keith's call). *** The rig's GTX 1080 over D3D12 put the browser's WebGPU and node-webgpu on one
// adapter, and three of 48 kernels disagreed (tools/ship/deviceComputeDiag.mjs, 2026-10-05). holeFill was a compiler
// dropping a second store -- a real defect, repaired in render/holeFillWgsl.mjs and held to bytes as before. The other
// two -- splitSum's BRDF table, 1 to 64 ulp, and the F82 tint, 1 to 2 ulp, each path repeating itself exactly -- call
// pow, sqrt and trig, whose accuracy WGSL leaves to the implementation. So on hardware a kernel that carries an f64
// reference (its corpus entry's `f64`, the same answer and the same floor its own gate grades the device against) may
// differ between the paths ONLY IF BOTH PATHS SIT INSIDE THAT FLOOR. No tolerance is invented here: the floor is read
// from the kernel's module. Everything else stays byte-exact on hardware, and EVERYTHING stays byte-exact on software,
// where both paths are SwiftShader and the claim this gate was written for still holds.
// SABOTAGED v4814: only the device path graded against the floor -> the EITHER-path row red; software treated as
// hardware -> the SOFTWARE row red. Both by name, both restored byte for byte.
function pathsAgree({ device, native, software, f64 = null }) {
    let same = 0, worst = 0, first = -1;
    for (let i = 0; i < native.length; i++) { if (device[i] === native[i]) same++; else { if (first < 0) first = i; worst = Math.max(worst, Math.abs(device[i] - native[i])); } }
    const identical = same === native.length && device.length === native.length;
    if (identical) return { ok: true, how: "identical", same, n: native.length };
    const base = { same, n: native.length, first, worst };
    if (software !== false || !f64) return { ok: false, how: software !== false ? "differs on software" : "differs, no f64 reference", ...base };
    const exp = f64.expected();
    const off = (v) => { let w = 0; for (let i = 0; i < exp.length; i++) w = Math.max(w, Math.abs(v[i] - exp[i])); return w; };
    const wD = exp.length === device.length ? off(device) : Infinity, wN = exp.length === native.length ? off(native) : Infinity;
    return { ok: wD <= f64.tol && wN <= f64.tol, how: "within the f64 floor on hardware", ...base, worstDevice: wD, worstNative: wN, tol: f64.tol, gate: f64.gate };
}

console.log("\n0. *** THE HARDWARE RULE, DRIVEN ON FIXTURES -- THE SANDBOX IS SOFTWARE AND NEVER REACHES IT LIVE ***");
{
    const ref = { gate: "fixture", tol: 1e-4, expected: () => [0.5, 0.25, 1] };
    const a = [0.5, 0.25, 1], b = [0.50000006, 0.25, 0.99999994];
    ok("identical paths agree everywhere", pathsAgree({ device: a, native: a, software: true }).ok && pathsAgree({ device: a, native: a, software: false }).ok);
    ok("!! *** on SOFTWARE a one-ulp difference is still a red -- the byte claim stands where it was made ***",
       !pathsAgree({ device: a, native: b, software: true, f64: ref }).ok, "both paths are SwiftShader there; a difference is a defect, whatever its size");
    ok("!! on HARDWARE a rounding difference with BOTH paths inside the kernel's own f64 floor is accepted",
       pathsAgree({ device: a, native: b, software: false, f64: ref }).ok);
    ok("!! *** ...and refused when EITHER path leaves the floor, so the rule still has teeth ***",
       !pathsAgree({ device: a, native: [0.5, 0.25, 0.9998], software: false, f64: ref }).ok &&
       !pathsAgree({ device: [0.5003, 0.25, 1], native: a, software: false, f64: ref }).ok,
       "0.9998 against 1 is 2e-4, twice the fixture's floor -- a path that drifted is not excused by the other one being right");
    ok("!! ...and a kernel with NO f64 reference stays byte-exact on hardware -- holeFill's flags among them",
       !pathsAgree({ device: [0, 1], native: [1, 1], software: false }).ok);
}

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
            outInit: e.opts.outInit ? Array.from(storageWords(e.opts.outInit)) : null,
            // v4572 -- these two travel with the entry now. The temporal arc puts dst at bindings 1 to 4 and
            // the uniform last, and a packer that drops them hands the page an entry that cannot be bound:
            // adding the thirteen to the corpus turned this into twelve reds until BOTH this line and the
            // reconstruction inside the page carried them. A field that exists is not a field that travels.
            outBinding: e.opts.outBinding ?? 0, uniformBinding: e.opts.uniformBinding ?? 1 });
        const r = await runInEngineOrigin({ launchArgs: PARITY_ARGS, engineRoot: ENG, args: { entries: entries.map(pack) }, script: `async (a) => {
            const C = await import("/render/computeRun.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (dev.backend !== "webgpu") return { noWebgpu: dev.backend };
            const out = {};
            for (const e of a.entries) {
                const opts = { code: e.code, entryPoint: e.entryPoint, outCount: e.outCount, workgroups: e.workgroups, uniforms: e.uniforms ? new Float32Array(e.uniforms) : null,
                               inputs: e.inputs ? e.inputs.map((i) => ({ binding: i.binding, data: new Uint32Array(i.words) })) : null, outInit: e.outInit ? new Uint32Array(e.outInit) : null,
                               outBinding: e.outBinding, uniformBinding: e.uniformBinding };
                const t0 = performance.now(); const res = await C.runCorpusEntry(dev, opts); const ms = performance.now() - t0;
                out[e.id] = res.ok ? { ok: true, values: Array.from(res.values), ms } : { ok: false, reason: res.reason };
            }
            dev.destroy(); return out;
        }`, timeoutMs: 180000 });
        ok("*** the corpus ran through the device on the browser's WebGPU ***", r.ok && r.result && !r.result.noWebgpu, r.ok ? (r.result && r.result.noWebgpu ? "no webgpu: " + r.result.noWebgpu : "") : r.reason);
        if (r.ok && r.result && !r.result.noWebgpu) {
            const nat0 = await runWgslComputeNative(entries[0].opts), name = (a) => a ? `${a.vendor}/${a.architecture}` : "unread";
            ok("*** the device's WebGPU and node-webgpu report the SAME ADAPTER -- the rows below compare one rasteriser reached two ways ***",
               !!(r.adapter && nat0.ok && nat0.adapter && r.adapter.vendor === nat0.adapter.vendor && r.adapter.architecture === nat0.adapter.architecture),
               `device ${name(r.adapter)}, native ${nat0.ok ? name(nat0.adapter) : nat0.reason}`);
            let allIdentical = true, floats = 0, msTotal = 0, withinF64 = [];
            for (const e of entries) {
                const d = r.result[e.id];
                const nat = await runWgslComputeNative(e.opts);
                if (!d || !d.ok || !nat.ok) { ok(`runs: ${e.id}`, false, (d && d.reason) || nat.reason); allIdentical = false; continue; }
                // v4814: one rule, pathsAgree (section 0) -- bytes, except a kernel with an f64 reference on a hardware adapter
                const g = pathsAgree({ device: d.values, native: nat.values, software: r.software, f64: e.f64 || null });
                if (!g.ok) allIdentical = false;
                if (g.ok && g.how !== "identical") withinF64.push(e.id);
                floats += nat.values.length; msTotal += d.ms;
                ok(`identical through the device: ${e.id}`, g.ok,
                   g.how === "identical" ? `${g.same}/${g.n}, ${d.ms.toFixed(0)} ms`
                   : g.how === "within the f64 floor on hardware"
                       ? `${g.same}/${g.n} identical, first differs at ${g.first}, max ${g.worst.toExponential(3)} between the paths -- ` +
                         `${g.ok ? "BOTH" : "NOT both"} within ${g.tol} of the f64 reference ${g.gate} grades against ` +
                         `(device ${g.worstDevice.toExponential(3)}, native ${g.worstNative.toExponential(3)})`
                       : `${g.same}/${g.n}, first differs at ${g.first}, max ${g.worst.toExponential(3)} -- ${g.how}`);
            }
            ok("*** all of them: the device is a third path to the same bytes ***", allIdentical && entries.length >= 18,
               `${floats} floats across ${entries.length} kernels in ${msTotal.toFixed(0)} ms on the device` +
               (withinF64.length ? `; on this hardware adapter ${withinF64.length} differ by rounding with both paths inside their f64 floor: ${withinF64.join(", ")}` : ""));
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the two rig pages RUNNING (they are read from source; hmc-bench.html's route is the runner this " +
    "gate drives and mpm-gpu-check.html's is mpmDevice-selfcheck's), the texture entries (the corpus's storage-texture " +
    "path has no device twin yet), and real hardware.");
process.exit(fails ? 1 : 0);
