// WebGLEngine/tools/ship/takeSnowFrameTiming.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/takeSnowFrameTiming.mjs [--sizes 320x180,1280x720] [--frames 30] [--warmup 2] [--out snow-frame-timing.json]
//
// THE COMMAND FOR render/snowFrameTiming.mjs: the snow frame graph timed on a NATIVE device (D3D12 on Windows, the Vulkan software adapter on this sandbox), one reading line a size. NO EXPORTS ON PURPOSE
// (the library is held by this file and graded by render/snowFrameTiming-selfcheck.mjs). It is the answer to the browser route on the Windows rig landing on the software adapter: this one reaches the GPU.
// Send back the JSON it writes (adapter name, sizes, per-frame milliseconds -- nothing else). Exits 1 on a GPU error or no adapter, 0 otherwise; it ends through headlessGpu's exitCleanly (Dawn's teardown race).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseOrExit } from "./cliArgs.mjs";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, exitCleanly } from "./headlessGpu.mjs";
import { timeFrames, timingLine, summarise, DEFAULT_SIZES, TIMED_FRAMES, WARMUP_FRAMES } from "../../render/snowFrameTiming.mjs";

const cli = parseOrExit("takeSnowFrameTiming", { values: { "--sizes": "string", "--frames": "number", "--warmup": "number", "--out": "path" }, flags: [] });
const frames = cli.values["--frames"] ?? TIMED_FRAMES, warmup = cli.values["--warmup"] ?? WARMUP_FRAMES;
const sizes = cli.values["--sizes"] ? cli.values["--sizes"].split(",").map((s) => s.trim().split("x").map(Number)) : DEFAULT_SIZES.map((s) => [...s]);
if (sizes.some((s) => s.length !== 2 || !s.every((v) => Number.isInteger(v) && v >= 16 && v <= 4096))) { console.error("[takeSnowFrameTiming] --sizes wants WIDTHxHEIGHT pairs, 16..4096 each, e.g. 320x180,1280x720"); exitCleanly(2); }
if (!(Number.isInteger(frames) && frames >= 3 && Number.isInteger(warmup) && warmup >= 1)) { console.error("[takeSnowFrameTiming] --frames wants an integer >= 3 and --warmup an integer >= 1"); exitCleanly(2); }

const require_ = createRequire(import.meta.url);
const skip = headlessGpuSkipReason(require_);
if (skip) { console.log("[takeSnowFrameTiming] SKIPPED -- " + skip); exitCleanly(0); }
configureVulkanIcd();
const { mod } = resolveWebgpu(require_);
Object.assign(globalThis, mod.globals || {});
const gpu = mod.create([]);   // kept reachable on purpose: a Dawn instance collected under a live device is the 0xC0000005 / SIGSEGV headlessGpu.mjs's v4691 note measured
const adapter = await gpu.requestAdapter();
if (!adapter) { console.log("[takeSnowFrameTiming] requestAdapter() returned null -- no GPU to time"); exitCleanly(1); }
const info = adapter.info || {}, name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unknown adapter";
console.log("[takeSnowFrameTiming] adapter: " + name + (/swiftshader|llvmpipe|software/i.test(name) ? "  *** SOFTWARE: these times are a CPU's ***" : ""));
const device = await adapter.requestDevice();
const out = { generatedFrom: "tools/ship/takeSnowFrameTiming.mjs", at: new Date().toISOString(), platform: process.platform + " " + process.arch, adapter: name, frames, warmup, runs: [] };
let bad = 0;
for (const [w, h] of sizes) {
    const r = await timeFrames(device, { width: w, height: h, warmup, frames });
    await new Promise((res) => setTimeout(res, 50));   // an uncaptured error arrives after the queue is idle
    if (r.errors.length) bad++;
    console.log("  ----  " + timingLine(r, name));
    if (r.errors.length) console.log("  FAIL  GPU errors at " + w + "x" + h + ": " + r.errors.slice(0, 3).join(" | ").slice(0, 300));
    out.runs.push({ width: w, height: h, perFrame: r.perFrame, encode: r.encode, batchedMs: r.batchedMs, batchedFrames: r.batchedFrames, errors: r.errors, summary: summarise(r.perFrame) });
}
if (cli.values["--out"]) { fs.writeFileSync(path.resolve(cli.values["--out"]), JSON.stringify(out, null, 1)); console.log("[takeSnowFrameTiming] wrote " + cli.values["--out"]); }
exitCleanly(bad ? 1 : 0);
