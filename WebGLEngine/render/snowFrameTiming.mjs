// WebGLEngine/render/snowFrameTiming.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// THE SNOW FRAME, TIMED ON A NATIVE DEVICE: what snow-gpu.html cannot say on the Windows rig. The 2026-10-23 rig run measured every snow kernel on D3D12 (all passed) but the browser half landed on the
// SOFTWARE adapter -- Playwright's headless shell does not get the GPU for WebGPU there -- so the only frame rate in the report was a CPU rasteriser's, 0.4 fps. node-webgpu does reach D3D12, and
// createSnowGpu(device, { canvas: null }) renders the whole frame graph (deform step, sky bake when the sun moves, three shadow passes, the clipmap, TAA) without presenting, so a native device can time it.
//
// WHAT IS TIMED, AND WHAT IS NOT. Each frame is `await g.frame(...)` and then `await device.queue.onSubmittedWorkDone()`, the wall clock around both: encode plus GPU execution, the latency of one
// frame. A second figure submits the same number of frames back to back and waits once: the THROUGHPUT, which is what a pipelined loop would see. Neither is a GPU timestamp (node-webgpu offers none
// here), so each includes the CPU's encoding, which is small beside a GPU-bound frame and large beside a fast one -- the encode-and-submit time is reported separately so a CPU-bound frame shows as one.
// NOT presented: the present pass is skipped (no canvas), a few hundredths of the frame. NOT stamped: the page lays a footprint every 0.7 m of walking; this orbit stamps none, so the deform step runs
// on an empty brush queue. The first frames pay shader compilation and are WARMUP, not data.
//
// The library takes the DEVICE (and builds nothing node-webgpu-specific), so the gate (render/snowFrameTiming-selfcheck.mjs) and the command (tools/ship/takeSnowFrameTiming.mjs) each make their own.
"use strict";
import { createSnowGpu } from "./snowGpu.mjs";

export const WARMUP_FRAMES = 2, TIMED_FRAMES = 30, DEFAULT_SIZES = Object.freeze([Object.freeze([320, 180]), Object.freeze([1280, 720])]);
/** snow-gpu.html's walker: a circle of radius 8 m at 2.4 m/s, the camera 3 m behind and 4 m to the side, 2.6 m up, looking at 0.4 m. */
export const RADIUS = 8, SPEED = 2.4;

/** The orbit at frame `i`, 1/60 s a frame: { focus: {x, z}, cam: { pos, target, fovY } } -- the page's camFor, line for line. */
export function orbitAt(i, dt = 1 / 60) {
    const a = SPEED / RADIUS * dt * i, x = Math.cos(a) * RADIUS, z = Math.sin(a) * RADIUS;
    return { focus: { x, z }, cam: { pos: [x - Math.cos(a) * 3 - Math.cos(a + 0.5) * 4, 2.6, z - Math.sin(a) * 3 - Math.sin(a + 0.5) * 4], target: [x, 0.4, z], fovY: 60 } };
}

/** Order statistics of a list of milliseconds. Refuses an empty list and any value that is not a positive finite number (a clock that ran backwards is not a timing). */
export function summarise(ms) {
    if (!Array.isArray(ms) || !ms.length) throw new Error("summarise: no timings");
    for (const v of ms) if (!Number.isFinite(v) || v <= 0) throw new Error("summarise: " + v + " is not a positive finite time");
    const s = [...ms].sort((a, b) => a - b), n = s.length, at = (q) => s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
    const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return { n, min: s[0], max: s[n - 1], mean: s.reduce((a, b) => a + b, 0) / n, median, p95: at(0.95), fps: 1000 / median };
}

const f1 = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
/**
 * The line a real-hardware report keeps (tools/ship/realGpuRun.mjs keeps `----` lines and the gate prints this one under that prefix). One line a size:
 *   reading snowFrame: native 320x180 latency median 3.21 ms (311 fps), p95 4.10, min 2.9, max 5.0 over 30 frames; throughput 2.80 ms/frame; encode+submit median 0.90 ms; adapter NAME
 */
export function timingLine(r, adapter) {
    const s = summarise(r.perFrame), e = summarise(r.encode);
    return `reading snowFrame: native ${r.width}x${r.height} latency median ${f1(s.median)} ms (${s.fps.toFixed(s.fps >= 100 ? 0 : 1)} fps), p95 ${f1(s.p95)}, min ${f1(s.min)}, max ${f1(s.max)} over ${s.n} frames; ` +
           `throughput ${f1(r.batchedMs / r.batchedFrames)} ms/frame; encode+submit median ${f1(e.median)} ms; adapter ${adapter}`;
}
/** The line's fields back out, for the gate's round trip and for anything that reads a report. */
export function parseTimingLine(line) {
    const m = /reading snowFrame: native (\d+)x(\d+) latency median ([\d.]+) ms \(([\d.]+) fps\), p95 ([\d.]+), min ([\d.]+), max ([\d.]+) over (\d+) frames; throughput ([\d.]+) ms\/frame; encode\+submit median ([\d.]+) ms; adapter (.*)$/.exec(line);
    return m ? { width: +m[1], height: +m[2], median: +m[3], fps: +m[4], p95: +m[5], min: +m[6], max: +m[7], frames: +m[8], throughput: +m[9], encode: +m[10], adapter: m[11] } : null;
}

/**
 * Warm up, then time `frames` frames one at a time (latency) and `frames` more submitted back to back (throughput), on `device`, at width x height. `now` and `idle` are injectable so the rules are
 * driven on fixtures; live they are performance.now and device.queue.onSubmittedWorkDone. Returns the raw lists and the GPU errors the device raised (an uncaptured error is a failed frame, not a slow one).
 */
export async function timeFrames(device, { width = 320, height = 180, warmup = WARMUP_FRAMES, frames = TIMED_FRAMES, now = () => performance.now(), idle = () => device.queue.onSubmittedWorkDone(), create = createSnowGpu } = {}) {
    const g = await create(device, { canvas: null, width, height });
    let i = 0;
    for (let k = 0; k < warmup; k++, i++) { const o = orbitAt(i); await g.frame(1 / 60, o.focus, o.cam); await idle(); }
    const perFrame = [], encode = [];
    for (let k = 0; k < frames; k++, i++) {
        const o = orbitAt(i), t0 = now(); await g.frame(1 / 60, o.focus, o.cam); const t1 = now(); await idle(); const t2 = now();
        encode.push(t1 - t0); perFrame.push(t2 - t0);
    }
    const b0 = now();
    for (let k = 0; k < frames; k++, i++) { const o = orbitAt(i); await g.frame(1 / 60, o.focus, o.cam); }
    await idle();
    const batchedMs = now() - b0;
    return { width, height, perFrame, encode, batchedMs, batchedFrames: frames, errors: [...g.errors], framesRun: g.stats.frames, triangles: g.stats.triangles };
}
