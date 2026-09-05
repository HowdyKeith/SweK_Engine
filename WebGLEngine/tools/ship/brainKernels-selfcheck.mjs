#!/usr/bin/env node
// WebGLEngine/tools/ship/brainKernels-selfcheck.mjs -- v4470
//
// THE GPU BRAIN'S KERNELS, GRADED WHERE EVERY OTHER GPU GATE RUNS. brain/mlp.js held its layer kernel in a private
// `const WGSL` that tools/ship/brainTsl-page.js REGEXED OUT OF THE FILE'S SOURCE TEXT to run it; brain/flowfield.js
// held its four-entry solver the same way; and brain/gpu.js refused any software adapter by name, so the brain's own
// device could never be the one this build box has. Now: mlp.js renders ONE body in two binding layouts (the brain's
// and the harnesses'), exports both, and carries a probe manifest against render/brainTsl.mjs's f32 twin; flowfield.js
// exports its module; the corpus, the census (brain/ is a root) and the probe convention see all of it by name; and
// initGPU takes `allowSoftware` -- for a GATE's device, never the brain's, whose refusal stays the default.
//
// The claims: the probe layout returns the twin's bytes on Dawn (relu is a specified operation, so tolerance zero);
// the SHIPPED layout, bound by the names the brain binds, returns the probe layout's bytes on the browser's WebGPU
// through gfx/device.js -- the two renderings are one kernel on a real device; the flowfield module compiles on Dawn;
// and initGPU's refusal is exercised both ways on a stubbed adapter that says SwiftShader.
//
// MEASURED AT v4470 (this box): the probe layout on Dawn 128 of 128 exact; the shipped layout through the device on the
// browser 128 of 128; the gate about two seconds.
//
// SABOTAGE LOG (v4470) -- each applied, gate run, exit read, file restored byte for byte:
//   A  the bias dropped from the body (var acc = 0.0)          -> exit=1, 4 red: 65 of 128 on Dawn, the control (relu
//      left nothing positive), the shipped layout on the device, and the two-layouts line. One body, so both layouts
//      moved together -- which is what "one body" is for.
//   B  initGPU's allowSoftware branch disabled                 -> exit=1, 2 red: the flag and the environment variable.
//      *** THE FIRST RUN OF THIS SABOTAGE CRASHED THE GATE WITH NO RED LINE *** (the refusal threw past the check),
//      so the check catches now and names the refusal; a sabotage that exits 1 without a FAIL is a gate that
//      reports by accident.
//   C  brainTsl-page.js reverted to the regex                  -> exit=1, 1 red, the source line.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, storageWords } from "./headlessGpu.mjs";
import { MLP_LAYER_WGSL, mlpLayerWgsl, PROBES as MLP_PROBES, probeFixture, probeUniforms } from "../../brain/mlp.js";
import { FLOWFIELD_WGSL, PROBES as FF_PROBES } from "../../brain/flowfield.js";
import { initGPU } from "../../brain/gpu.js";
import { parseBindings } from "../../render/wgslSpec.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const sameBits = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++; return n; };

console.log("\n1. ONE BODY, TWO LAYOUTS, EXPORTED; THE PAGE IMPORTS INSTEAD OF REGEXING; THE FLAG IS IN THE DEVICE FILE");
{
    const shipped = parseBindings(MLP_LAYER_WGSL).sort((a, b) => a.binding - b.binding).map((b) => b.name).join(",");
    const probe = parseBindings(mlpLayerWgsl({ probe: true })).sort((a, b) => a.binding - b.binding).map((b) => b.name).join(",");
    ok("*** the shipped layout binds P, X, W, B, Y at 0..4 -- the order BatchedMLP has always bound ***", shipped === "P,X,W,B,Y", shipped);
    ok("*** the probe layout binds Y at 0 and P at 1 -- the harnesses' signature ***", probe === "Y,P,X,W,B", probe);
    const body = (t) => t.slice(t.indexOf("@" + "compute"));   // the marker assembled, so this gate is not counted as a shader bearer
    ok("  and the two renderings share the body, character for character", body(MLP_LAYER_WGSL) === body(mlpLayerWgsl({ probe: true })) && /fn k_layer/.test(body(MLP_LAYER_WGSL)));
    ok("  the manifest's twin is render/brainTsl.mjs's mlpLayerCpu, in the kernel's summation order", MLP_PROBES.length === 1 && MLP_PROBES[0].tol === 0 && /mlpLayerCpu/.test(codeOf(read("brain/mlp.js"))));
    ok("brain/flowfield.js exports its module and a device-graded manifest naming its CPU-twin gate", typeof FLOWFIELD_WGSL === "string" && /fn k_relax/.test(FLOWFIELD_WGSL) && FF_PROBES[0].device === true && fs.existsSync(path.join(ENG, FF_PROBES[0].graded.split(" ")[0])));
    const page = codeOf(read("tools/ship/brainTsl-page.js"));
    ok("*** tools/ship/brainTsl-page.js imports MLP_LAYER_WGSL and no longer regexes the module's source ***", /import\("\/brain\/mlp\.js"\)\)\.MLP_LAYER_WGSL/.test(page) && !/match\(\/const WGSL/.test(page));
    const gpu = codeOf(read("brain/gpu.js"));
    ok("brain/gpu.js takes allowSoftware (and SWEK_ALLOW_SOFTWARE_GPU), keeps the refusal as the default, and reports `software`", /allowSoftware = false/.test(gpu) && /SWEK_ALLOW_SOFTWARE_GPU/.test(gpu) && /Refusing to run on a SOFTWARE adapter/.test(gpu) && /software: !!\(adapter\.isFallbackAdapter \|\| soft\)/.test(gpu));
    const corpus = codeOf(read("tools/ship/wgslCorpus.mjs"));
    ok("  brain/ is a census root and the corpus carries the MLP probe and the flowfield module", /"brain"\]/.test(corpus) && /id: "mlp\.mlpLayerWgsl"/.test(corpus) && /id: "flowfield\.FLOWFIELD_WGSL"/.test(corpus));
}

console.log("\n2. initGPU ON A STUBBED SOFTWARE ADAPTER: REFUSED BY DEFAULT, ACCEPTED UNDER THE FLAG, AND SAYS WHICH");
{
    const stub = (desc, fallback = false) => ({ gpu: { requestAdapter: async () => ({ info: { vendor: "google", description: desc }, isFallbackAdapter: fallback, requestDevice: async () => ({ addEventListener() {} }) }) } });
    let installed = false;
    try { Object.defineProperty(globalThis, "navigator", { value: stub("SwiftShader driver 5.0.0"), configurable: true, writable: true }); installed = true; } catch (e) { report("cannot stub navigator here: " + e.message); }
    if (installed) {
        const quiet = console.warn; console.warn = () => {}; const quietLog = console.log; console.log = (...a) => { if (!/^\[gpu\]/.test(String(a[0]))) quietLog(...a); };
        let msg = ""; try { await initGPU(); msg = "no throw"; } catch (e) { msg = e.message; }
        ok("*** a SwiftShader adapter is refused by default, by name ***", /Refusing to run on a SOFTWARE adapter: .*SwiftShader/.test(msg), msg.split("\n")[0].slice(0, 90));
        let r = null, why = ""; try { r = await initGPU({ allowSoftware: true }); } catch (e) { why = e.message.split("\n")[0]; }
        ok("*** and accepted under allowSoftware, reporting software: true ***", r && r.software === true && r.device, why);
        Object.defineProperty(globalThis, "navigator", { value: stub("SwiftShader"), configurable: true, writable: true });
        process.env.SWEK_ALLOW_SOFTWARE_GPU = "1";
        let env = null; try { env = await initGPU(); } catch (e) { env = null; }
        delete process.env.SWEK_ALLOW_SOFTWARE_GPU;
        ok("  the environment variable is the same flag", !!(env && env.software === true));
        Object.defineProperty(globalThis, "navigator", { value: stub("NVIDIA GeForce"), configurable: true, writable: true });
        let hw = null; try { hw = await initGPU(); } catch (e) { hw = null; }
        ok("  a hardware adapter reports software: false, as before", hw && hw.software === false);
        Object.defineProperty(globalThis, "navigator", { value: stub("NVIDIA GeForce", true), configurable: true, writable: true });
        let fb = ""; try { await initGPU(); fb = "no throw"; } catch (e) { fb = e.message; }
        ok("  the spec's isFallbackAdapter flag is still a refusal by default", /Refusing/.test(fb));
        console.warn = quiet; console.log = quietLog;
    } else fails++;
}

console.log("\n3. THE PROBE LAYOUT ON DAWN AGAINST THE TWIN; THE SHIPPED LAYOUT ON THE BROWSER'S DEVICE AGAINST THE PROBE'S BYTES");
{
    const P = MLP_PROBES[0], a = P.args, twin = P.cpu(a);
    const nSkip = headlessGpuSkipReason();
    let native = null;
    if (nSkip) { console.log(`  SKIP  ${nSkip}`); fails++; }
    else {
        native = await runWgslComputeNative({ code: P.code(a), entryPoint: P.entryPoint, outCount: P.outCount(a), uniforms: P.pack(a), workgroups: P.workgroups(a), inputs: P.inputs(a) });
        ok("*** the probe layout runs on Dawn with a 2-D dispatch and returns the f32 twin's bytes, all 128 ***", native.ok && sameBits(native.values, twin) === twin.length, native.ok ? `${sameBits(native.values, twin)}/${twin.length}, workgroups ${P.workgroups(a).join("x")}` : native.reason);
        ok("  CONTROL: the layer did something (relu left some outputs at zero and some positive)", native.ok && native.values.some((v) => v === 0) && native.values.some((v) => v > 0));
        const ff = await runWgslComputeNative({ code: FLOWFIELD_WGSL, entryPoint: "k_relax", outCount: 1, compileOnly: true });
        ok("*** the flow-field module -- four entry points, seven bindings, two atomic -- compiles on Dawn ***", ff.ok, ff.ok ? "" : `${ff.reason} ${(ff.errors || []).join(" | ")}`);
    }
    const bSkip = webgpuSkipReason();
    if (bSkip) { console.log(`  SKIP  ${bSkip}`); fails++; }
    else {
        const F = probeFixture(a);
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { a, x: Array.from(F.x), W: Array.from(F.W), b: Array.from(F.b), uni: Array.from(storageWords(probeUniforms(a))) }, script: `async (g) => {
            const { MLP_LAYER_WGSL } = await import("/brain/mlp.js"); const { runCompute } = await import("/render/computeRun.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (dev.backend !== "webgpu") return { noWebgpu: dev.backend };
            const r = await runCompute(dev, { code: MLP_LAYER_WGSL, entryPoint: "k_layer", workgroups: [Math.ceil(g.a.nOut / 8), Math.ceil(g.a.batch / 8)],
                buffers: { P: { data: new Uint32Array(g.uni), usage: "uniform" }, X: { data: new Float32Array(g.x) }, W: { data: new Float32Array(g.W) }, B: { data: new Float32Array(g.b) }, Y: { size: g.a.batch * g.a.nOut * 4 } }, read: ["Y"] });
            dev.destroy(); return { y: Array.from(new Float32Array(r.Y)) };
        }` });
        ok("*** the SHIPPED layout, bound by the brain's own names through gfx/device.js, returns the twin's bytes on the browser's WebGPU ***", r.ok && r.result && !r.result.noWebgpu && sameBits(r.result.y, twin) === twin.length, r.ok ? (r.result.noWebgpu ? "no webgpu" : `${sameBits(r.result.y, twin)}/${twin.length}`) : r.reason);
        if (native && native.ok && r.ok && r.result.y) ok("  and the two layouts are one kernel: Dawn's probe bytes equal the browser's shipped bytes", sameBits(native.values, r.result.y) === twin.length);
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the brain PROCESS (Deno, its own device, brain/brain.js -- this grades the kernels it dispatches, not the loop that " +
    "dispatches them), the flow-field solver RUNNING on a device here (its module compiles; brain/tools/flowfield-selfcheck.mjs holds the " +
    "solver to its CPU twin), sigmoid layers (an unspecified operation, per render/brainTsl.mjs), and real hardware.");
process.exit(fails ? 1 : 0);
