// WebGLEngine/render/snowFrameTiming-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowFrameTiming-selfcheck.mjs      (about 8 s on the software adapter, most of it the sky-bake compile on the first frame)
//
// GATES render/snowFrameTiming.mjs -- the snow frame graph timed on a NATIVE device -- and its command tools/ship/takeSnowFrameTiming.mjs. This file makes its own node-webgpu device (resolveWebgpu below), which is what
// puts it in tools/ship/realGpuRun.mjs's native sweep: `realGpuRun.mjs --native --only render/` on the Windows rig runs it on D3D12, and the reading line it prints is the first honest look at what the frame costs
// on a real GPU (the browser route there lands on the software adapter). On the software adapter the reading is a CPU's, and the line names the adapter so it cannot be mistaken.
//
// SABOTAGES, RESULTS BY NAME (each against render/snowFrameTiming.mjs, this gate run, restored identical):
//   S1 the median of an even-length list takes the upper middle value         -> 2 RED: the even-list row, and the line's round trip (its median is read back wrong)
//   S2 timeFrames leaves the warm-up out (no warm-up run)                      -> 2 RED: the fake-clock call-count row and the live frame-count row (7 frames expected, 6 run)
//   S3 the latency list is the encode-only time                                -> 2 RED: the fake-clock row (latency must be encode PLUS the wait) and the live row (encode must sit below latency)
//   S4 orbitAt's camera offset 3 -> 2                                          -> 1 RED: the orbitAt(0) numeric row. The page-twin row reads the PAGE's text, so it guards the page moving, not this file; the two together hold the pair
//   S5 timingLine drops the adapter name                                       -> 3 RED: the line row, the round trip and the live row (a reading that does not say what ran is the 0.4 fps lie again)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, exitCleanly } from "../tools/ship/headlessGpu.mjs";
import { summarise, timingLine, parseTimingLine, orbitAt, timeFrames, RADIUS, SPEED, WARMUP_FRAMES, TIMED_FRAMES, DEFAULT_SIZES } from "./snowFrameTiming.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const throws = (f) => { try { f(); return false; } catch { return true; } };
const t0 = performance.now();

console.log("snowFrameTiming-selfcheck -- the snow frame graph on a native device\n");

console.log("1. THE ORDER STATISTICS, EXACT");
{
    const s = summarise([5, 1, 3, 2, 4]), e = summarise([1, 2, 3, 4]);
    ok("an odd list: min, max, mean, median and p95 are the values they name", s.n === 5 && s.min === 1 && s.max === 5 && s.mean === 3 && s.median === 3 && s.p95 === 5 && Math.abs(s.fps - 1000 / 3) < 1e-9, JSON.stringify(s));
    ok("an even list takes the MEAN of the two middle values (2.5, not 2 or 3)", e.median === 2.5 && Math.abs(e.fps - 400) < 1e-9, "median " + e.median);
    ok("p95 of twenty is the nineteenth value, not the maximum", summarise(Array.from({ length: 20 }, (_, i) => i + 1)).p95 === 19);
    ok("an empty list, a NaN, a zero, a negative and a string are each refused", [[], [NaN], [0], [-1], ["3"], [1, Infinity]].every((l) => throws(() => summarise(l))), "a timing that is not a positive finite number is a broken clock, not a fast frame");
    ok("the defaults are the ones the report promises: 2 warm-up frames, 30 timed, 320x180 and 1280x720", WARMUP_FRAMES === 2 && TIMED_FRAMES === 30 && DEFAULT_SIZES.length === 2 && DEFAULT_SIZES[0].join("x") === "320x180" && DEFAULT_SIZES[1].join("x") === "1280x720");
}

console.log("\n2. THE READING LINE, AND BACK");
{
    const r = { width: 320, height: 180, perFrame: [3.1, 2.9, 3.3, 3.0, 5.0, 3.2], encode: [0.8, 0.9, 1.0, 0.9, 0.8, 0.9], batchedMs: 16.8, batchedFrames: 6 };
    const line = timingLine(r, "intel gen-9 D3D12 driver 31.0.101.2137"), p = parseTimingLine(line);
    ok("the line starts `reading snowFrame:` (the shape realGpuRun's `----` lines carry) and names the adapter", line.startsWith("reading snowFrame: native 320x180 latency median") && line.endsWith("adapter intel gen-9 D3D12 driver 31.0.101.2137"), line);
    ok("and it parses back to the numbers it was built from: size, median, p95, min, max, frames, throughput, encode, adapter", p && p.width === 320 && p.height === 180 && p.frames === 6 && p.adapter === "intel gen-9 D3D12 driver 31.0.101.2137" &&
        Math.abs(p.median - 3.15) < 0.01 && Math.abs(p.max - 5) < 0.01 && Math.abs(p.min - 2.9) < 0.01 && Math.abs(p.throughput - 2.8) < 0.01 && Math.abs(p.encode - 0.9) < 0.01, JSON.stringify(p));
    ok("a line that is not ours does not parse (null, not a half-filled object)", parseTimingLine("reading aerial: worst 9e-4") === null && parseTimingLine("") === null);
}

console.log("\n3. THE ORBIT IS THE PAGE'S");
{
    const dist = (i) => { const o = orbitAt(i), c = o.cam; return { r: Math.hypot(o.focus.x, o.focus.z), back: Math.hypot(c.pos[0] - o.focus.x, c.pos[2] - o.focus.z) }; };
    const d0 = dist(0), d900 = dist(900);
    ok("the walker stays on a circle of RADIUS " + RADIUS + " m at every frame, and the camera stays the same distance from it", Math.abs(d0.r - RADIUS) < 1e-9 && Math.abs(d900.r - RADIUS) < 1e-9 && Math.abs(d0.back - d900.back) < 1e-9, `r ${d0.r.toFixed(3)} / ${d900.r.toFixed(3)}, camera ${d0.back.toFixed(3)} m behind`);
    ok("one frame at 1/60 s advances the angle by SPEED / RADIUS / 60 radians", Math.abs(Math.atan2(orbitAt(1).focus.z, orbitAt(1).focus.x) - SPEED / RADIUS / 60) < 1e-12);
    const html = fs.readFileSync(path.join(ENG, "snow-gpu.html"), "utf8");
    ok("!! the page's walker and camera are the ones this orbit copies: RADIUS = 8, SPEED = 2.4 and the camFor line, character for character", html.includes("RADIUS = 8, SPEED = 2.4") &&
        html.includes("pos: [walker.x - Math.cos(walker.a) * 3 - Math.cos(walker.a + 0.5) * 4, 2.6, walker.z - Math.sin(walker.a) * 3 - Math.sin(walker.a + 0.5) * 4], target: [walker.x, 0.4, walker.z], fovY: 60"),
        "if the page's camera moves, the timing is of a different picture and this row says so");
    const o = orbitAt(0);
    ok("and orbitAt(0) puts the camera where that line does at angle 0: x = 8, camera at (8 - 3 - 4 cos 0.5, 2.6, -4 sin 0.5)", Math.abs(o.cam.pos[0] - (8 - 3 - 4 * Math.cos(0.5))) < 1e-9 && Math.abs(o.cam.pos[2] - (-4 * Math.sin(0.5))) < 1e-9 && o.cam.pos[1] === 2.6 && o.cam.fovY === 60);
}

console.log("\n4. THE LOOP, DRIVEN ON A FAKE CLOCK");
{
    let clock = 0, frameCalls = 0, idleCalls = 0, created = null;
    const fakeCreate = async (dev, opts) => { created = opts; return { errors: ["e0"], stats: { frames: 0, triangles: 77 }, frame: async () => { frameCalls++; clock += 2; } }; };
    const r = await timeFrames({ queue: {} }, { width: 64, height: 32, warmup: 3, frames: 5, now: () => clock, idle: async () => { idleCalls++; clock += 3; }, create: fakeCreate });
    ok("the frame function runs warm-up + timed + batched times (3 + 5 + 5), and the queue is waited on once a warm-up frame, once a timed frame and once for the batch (3 + 5 + 1)", frameCalls === 13 && idleCalls === 9, `${frameCalls} frames, ${idleCalls} waits`);
    ok("each latency is the encode time PLUS the wait on the queue (2 + 3 = 5), each encode time alone is 2", r.perFrame.length === 5 && r.perFrame.every((v) => v === 5) && r.encode.every((v) => v === 2), JSON.stringify(r.perFrame));
    ok("the batched figure is five encodes and ONE wait (5 x 2 + 3 = 13), not five waits", r.batchedMs === 13 && r.batchedFrames === 5, "batched " + r.batchedMs);
    ok("the size is passed to the renderer with no canvas (a native device has none to present to), and the device's errors and triangle count come back", created && created.canvas === null && created.width === 64 && created.height === 32 && r.errors.length === 1 && r.triangles === 77);
}

console.log("\n5. THE COMMAND REFUSES WHAT IT DOES NOT UNDERSTAND");
{
    const run = (...a) => spawnSync(process.execPath, [path.join(ENG, "tools", "ship", "takeSnowFrameTiming.mjs"), ...a], { encoding: "utf8", timeout: 30000 });
    const a = run("--an-option-nobody-has-spelled"), b = run("--sizes", "8x8"), c = run("--frames", "1");
    ok("an unknown option is refused with exit 2 and `nothing was run`", a.status === 2 && /unknown option --an-option-nobody-has-spelled/.test(a.stderr + a.stdout) && /nothing was run/.test(a.stderr + a.stdout));
    ok("a size under 16 and a frame count under 3 are refused with exit 2, before any device is asked for", b.status === 2 && /WIDTHxHEIGHT/.test(b.stderr) && c.status === 2 && /--frames wants/.test(c.stderr));
}

console.log("\n6. THE FRAME, TIMED ON A NATIVE DEVICE");
const skip = headlessGpuSkipReason(require_);
if (skip) {
    report("native half SKIPPED -- " + skip);
    report("*** THAT IS A SKIP AND NOT A PASS: nothing here has shown one frame of the snow graph on a native device");
} else {
    configureVulkanIcd();
    const { mod } = resolveWebgpu(require_);
    Object.assign(globalThis, mod.globals || {});
    const gpu = mod.create([]);   // reachable for the whole run (headlessGpu.mjs's v4691 note: a collected instance under a live device crashes the process)
    const adapter = await gpu.requestAdapter();
    const info = adapter ? adapter.info || {} : {}, name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
    ok("a native adapter answered, and has a name to put on the reading", !!adapter && name.length > 0, name);
    if (adapter) {
        const device = await adapter.requestDevice();
        const r = await timeFrames(device, { width: 160, height: 90, warmup: 1, frames: 3 });
        await new Promise((res) => setTimeout(res, 50));
        const s = summarise(r.perFrame);
        ok("!! the whole frame graph ran on the native device with no GPU error: deform, sky bake, three shadow passes, the clipmap and TAA, 1 + 3 + 3 frames", r.errors.length === 0 && r.framesRun === 7 && r.triangles > 1000, `${r.framesRun} frames, ${r.triangles} triangles, errors: ${r.errors.join(" | ").slice(0, 200) || "none"}`);
        ok("every timed frame is a positive finite time, the encode time is below the latency it is part of, and the batch figure is a time too", r.perFrame.length === 3 && r.encode.every((v, k) => v > 0 && v < r.perFrame[k]) && r.batchedMs > 0, `median ${s.median.toFixed(1)} ms`);
        const line = timingLine(r, name), p = parseTimingLine(line);
        ok("the reading line parses and carries this adapter's name", p && p.adapter === name && p.width === 160 && p.height === 90 && p.frames === 3, line.slice(0, 120));
        report(line);
        report("(a 160x90 reading from this gate, 3 timed frames: the rig's figures come from the command at 320x180 and 1280x720 over 30. On the software adapter every number here is a CPU's.)");
        report("gate wall time " + ((performance.now() - t0) / 1000).toFixed(1) + " s");
    }
}

console.log(`\nsnowFrameTiming-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: A REAL GPU. Both the sandbox's and this gate's native run land on the software adapter; the D3D12 figure comes from `realGpuRun.mjs --native --only render/` or the command on the rig. Also unchecked: the frame WITH footprints (this orbit stamps none, so the deform step runs on an empty brush queue) and the present pass (no canvas).");
exitCleanly(fails === 0 ? 0 : 1);
