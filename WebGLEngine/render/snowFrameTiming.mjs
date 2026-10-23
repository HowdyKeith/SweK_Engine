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

// v4896 -- WARMUP 2 -> 10: the first rig run (Intel gen-9, D3D12) read 72 ms for the first fifteen frames at 1280x720 and 61 ms for the last fifteen, and 13.8 ms falling to 9.6 over the first eight at 320x180 --
// the GPU's clock still ramping, so two frames of warm-up timed the ramp. The summary now carries the two halves' medians so a ramp that is still going is a number on the line.
export const WARMUP_FRAMES = 10, TIMED_FRAMES = 30, DEFAULT_SIZES = Object.freeze([Object.freeze([320, 180]), Object.freeze([1280, 720])]);
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
    const med = (l) => { const t = [...l].sort((x, y) => x - y), m = t.length; return m % 2 ? t[(m - 1) / 2] : (t[m / 2 - 1] + t[m / 2]) / 2; };
    const h = n >> 1, halves = h >= 2 ? [med(ms.slice(0, h)), med(ms.slice(n - h))] : null;   // chronological: the first and the last h frames, the middle one left out when n is odd
    return { n, min: s[0], max: s[n - 1], mean: s.reduce((a, b) => a + b, 0) / n, median, p95: at(0.95), fps: 1000 / median, halves };
}

const f1 = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
/**
 * The line a real-hardware report keeps (tools/ship/realGpuRun.mjs keeps `----` lines and the gate prints this one under that prefix). One line a size:
 *   reading snowFrame: native 320x180 shadowRes 2048 latency median 3.21 ms (311 fps), p95 4.10, min 2.9, max 5.0 over 30 frames; throughput 2.80 ms/frame; encode+submit median 0.90 ms; first/last half median 3.4/3.0 ms; adapter NAME
 */
export function timingLine(r, adapter) {
    const s = summarise(r.perFrame), e = summarise(r.encode);
    return `reading snowFrame: native ${r.width}x${r.height} shadowRes ${r.shadowRes || 2048} latency median ${f1(s.median)} ms (${s.fps.toFixed(s.fps >= 100 ? 0 : 1)} fps), p95 ${f1(s.p95)}, min ${f1(s.min)}, max ${f1(s.max)} over ${s.n} frames; ` +
           `throughput ${r.batchedMs == null ? "n/a (pass-timed)" : f1(r.batchedMs / r.batchedFrames) + " ms/frame"}; encode+submit median ${f1(e.median)} ms; first/last half median ${s.halves ? f1(s.halves[0]) + "/" + f1(s.halves[1]) + " ms" : "n/a"}; adapter ${adapter}`;
}
/** The line's fields back out, for the gate's round trip and for anything that reads a report. */
export function parseTimingLine(line) {
    const m = /reading snowFrame: native (\d+)x(\d+) shadowRes (\d+) latency median ([\d.]+) ms \(([\d.]+) fps\), p95 ([\d.]+), min ([\d.]+), max ([\d.]+) over (\d+) frames; throughput (?:([\d.]+) ms\/frame|n\/a \(pass-timed\)); encode\+submit median ([\d.]+) ms; first\/last half median (?:([\d.]+)\/([\d.]+) ms|n\/a); adapter (.*)$/.exec(line);
    return m ? { width: +m[1], height: +m[2], shadowRes: +m[3], median: +m[4], fps: +m[5], p95: +m[6], min: +m[7], max: +m[8], frames: +m[9], throughput: m[10] ? +m[10] : null, encode: +m[11], halves: m[12] ? [+m[12], +m[13]] : null, adapter: m[14] } : null;
}

/**
 * Warm up, then time `frames` frames one at a time (latency) and `frames` more submitted back to back (throughput), on `device`, at width x height. `now` and `idle` are injectable so the rules are
 * driven on fixtures; live they are performance.now and device.queue.onSubmittedWorkDone. Returns the raw lists and the GPU errors the device raised (an uncaptured error is a failed frame, not a slow one).
 */
export async function timeFrames(device, { width = 320, height = 180, warmup = WARMUP_FRAMES, frames = TIMED_FRAMES, shadowRes, passTimers = false, now = () => performance.now(), idle = () => device.queue.onSubmittedWorkDone(), create = createSnowGpu } = {}) {
    const g = await create(device, { canvas: null, width, height, ...(shadowRes ? { shadowRes } : {}), ...(passTimers ? { passTimers: true } : {}) });
    let i = 0;
    for (let k = 0; k < warmup; k++, i++) { const o = orbitAt(i); await g.frame(1 / 60, o.focus, o.cam); await idle(); }
    const perFrame = [], encode = [], passes = {};
    for (let k = 0; k < frames; k++, i++) {
        const o = orbitAt(i), t0 = now(); await g.frame(1 / 60, o.focus, o.cam); const t1 = now(); await idle(); const t2 = now();
        encode.push(t1 - t0); perFrame.push(t2 - t0);
        if (g.stats.passMs) for (const [n, v] of Object.entries(g.stats.passMs)) (passes[n] || (passes[n] = [])).push(v);
    }
    // the batched figure is a THROUGHPUT, and a timed frame waits on a buffer map every frame, so with pass timers on there is no batch: batchedMs is null and the frame is a measurement frame
    let batchedMs = null;
    if (!passTimers) {
        const b0 = now();
        for (let k = 0; k < frames; k++, i++) { const o = orbitAt(i); await g.frame(1 / 60, o.focus, o.cam); }
        await idle();
        batchedMs = now() - b0;
    }
    return { width, height, shadowRes: shadowRes || null, perFrame, encode, passes, passTimers: !!g.stats.passTimers, batchedMs, batchedFrames: frames, errors: [...g.errors], framesRun: g.stats.frames, triangles: g.stats.triangles };
}

/** The order the frame runs its passes in, for printing; a name not listed (a future pass) sorts after these, alphabetically. */
export const PASS_ORDER = Object.freeze(["deform", "skyBake", "skyMip1", "skyMip2", "skyMip3", "skyMip4", "shadow0", "shadow1", "shadow2", "beauty", "taa", "present"]);
/**
 * GPU milliseconds per pass, from the per-pass timers: the MEDIAN of each pass over the frames it ran in (the sky bake runs only when the sun moves, so it is absent from a steady orbit), the sum of those medians,
 * and what share of the frame's wall-clock latency the sum is -- the rest is what the GPU timestamps do not see (queue gaps between passes, the buffer map, the CPU). One line a size:
 *   reading snowPasses: native 320x180 shadowRes 2048 GPU ms per pass (median over 30 frames): deform 0.05, shadow0 1.20, shadow1 0.90, shadow2 0.80, beauty 3.10, taa 0.40; sum 6.45 ms of a 10.3 ms frame (63%); adapter NAME
 */
export function passLine(r, adapter, frameMedianMs) {
    const names = Object.keys(r.passes).filter((n) => r.passes[n].length * 2 >= r.perFrame.length)   // a pass that ran in under half the frames (the sky bake) is not part of the steady frame
        .sort((a, b) => { const ia = PASS_ORDER.indexOf(a), ib = PASS_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); });
    const meds = names.map((n) => summarise(r.passes[n].map((v) => Math.max(v, 1e-6))).median), sum = meds.reduce((a, b) => a + b, 0);
    const share = frameMedianMs > 0 ? ` of a ${f1(frameMedianMs)} ms frame (${Math.round(100 * sum / frameMedianMs)}%)` : "";
    return `reading snowPasses: native ${r.width}x${r.height} shadowRes ${r.shadowRes || 2048} GPU ms per pass (median over ${r.perFrame.length} frames): ` + names.map((n, k) => `${n} ${meds[k].toFixed(2)}`).join(", ") + `; sum ${sum.toFixed(2)} ms${share}; adapter ${adapter}`;
}
/** The pass line back out: { width, height, shadowRes, frames, passes: {name: ms}, sum, adapter }, or null for a line that is not ours. */
export function parsePassLine(line) {
    const m = /reading snowPasses: native (\d+)x(\d+) shadowRes (\d+) GPU ms per pass \(median over (\d+) frames\): (.*); sum ([\d.]+) ms(?: of a [\d.]+ ms frame \((\d+)%\))?; adapter (.*)$/.exec(line);
    if (!m) return null;
    const passes = {}; for (const part of m[5].split(", ")) { const [n, v] = part.split(" "); passes[n] = +v; }
    return { width: +m[1], height: +m[2], shadowRes: +m[3], frames: +m[4], passes, sum: +m[6], share: m[7] ? +m[7] : null, adapter: m[8] };
}
