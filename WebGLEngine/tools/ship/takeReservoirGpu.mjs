// WebGLEngine/tools/ship/takeReservoirGpu.mjs -- UNNUMBERED (export-free on purpose; the kernel is brain/reservoirGpu.mjs, its gate brain/reservoirGpu-selfcheck.mjs, the note brain/RESERVOIR_GPU_WIP.md)
//   node tools/ship/takeReservoirGpu.mjs [--batches 1,16,128,1024,4096] [--ticks 100]
// THE RIG'S MEASUREMENT OF THE RESERVOIR KERNEL: the fly reservoir's step (1,729 weights, brain/pilotSubFlyCxWip.json) for a batch of reservoirs on this machine's WebGPU device (Dawn in Node, through
// tools/ship/headlessGpu.mjs's lookup) against the CPU twin, per batch size, and the first batch at which the device is faster. It prints the adapter first and says SOFTWARE ADAPTER when it is one: the sandbox's
// SwiftShader numbers (brain/RESERVOIR_GPU_WIP.md) say nothing about a card, and this command on the rig is the number owed. It writes nothing.
"use strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as H from "./headlessGpu.mjs";
import * as G from "../../brain/reservoirGpu.mjs";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const batches = val("--batches", "1,16,128,1024,4096").split(",").map(Number), ticks = Number(val("--ticks", 100));
const rd = (f) => JSON.parse(fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8")), cj = rd("vendor/hemibrain/hemibrain-cx-heading-loop.json"), C = { neurons: cj.neurons, edges: cj.edges, io: cj.io }, w = rd("brain/pilotSubFlyCxWip.json").weights;
const req = createRequire(import.meta.url), skip = H.headlessGpuSkipReason(req);
if (skip) { console.log("[takeReservoirGpu] no device: " + skip); H.exitCleanly(2); }
H.configureVulkanIcd(); const { mod } = H.resolveWebgpu(req), gpu = mod.create([]), adapter = await gpu.requestAdapter();   // the instance is KEPT in `gpu`: dropped, V8 finalises it under a live device and Dawn segfaults (tools/ship/headlessGpu.mjs v4691; measured here, exit 139)
if (!adapter) { console.log("[takeReservoirGpu] requestAdapter() returned null"); H.exitCleanly(2); }
const device = await adapter.requestDevice(), g0 = mod.globals || globalThis; device.__usage = g0.GPUBufferUsage || globalThis.GPUBufferUsage; device.__mapMode = g0.GPUMapMode || globalThis.GPUMapMode;
const info = adapter.info || {}, desc = [info.vendor, info.architecture, info.description].filter(Boolean).join(" / "), software = /swiftshader|llvmpipe|lavapipe|software|warp|basic render/i.test(desc);
console.log(`[takeReservoirGpu] adapter: ${desc}${software ? "  -- A SOFTWARE ADAPTER: these numbers say nothing about a graphics card" : ""}`);
const pol = CS.createStatePolicy(C, "twin"), r = mulberry(15); let first = null;
for (const batch of batches) {
    const xs = Array.from({ length: batch }, () => Array.from({ length: 15 }, () => (r() - 0.5) * 3)), g = await G.GpuReservoirBatch.create(device, C, w, { batch });
    g.step(xs); await g.read(); let t0 = performance.now(); for (let t = 0; t < ticks; t++) g.step(xs); await g.read(); const gpuMs = (performance.now() - t0) / ticks; g.destroy();
    const hs = Array.from({ length: batch }, () => new Float64Array(148)); t0 = performance.now(); for (let t = 0; t < ticks; t++) for (let b = 0; b < batch; b++) hs[b] = pol.update(w, xs[b], hs[b]); const cpu = (performance.now() - t0) / ticks;
    if (first === null && gpuMs < cpu) first = batch;
    console.log(`  batch ${String(batch).padStart(6)}: device ${gpuMs.toFixed(3)} ms a tick, CPU twin ${cpu.toFixed(3)} ms a tick, device ${(cpu / gpuMs).toFixed(2)} x as fast`);
}
console.log(`[takeReservoirGpu] the first batch at which the device is faster: ${first === null ? "none of " + batches.join(", ") : first}${software ? " (SOFTWARE ADAPTER)" : ""}`);
H.exitCleanly(0);
