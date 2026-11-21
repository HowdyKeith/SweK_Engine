// WebGLEngine/render/gpuTimer.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE GRAPHICS CARD SPENT, PASS BY PASS, ON SCREEN. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `gpu-timer-overlay` (PlayCanvas's mini-stats GPU timer,
// src/extras/mini-stats/gpu-timer.js). Keith: "6". A frame's time on the CPU says little about the card; WebGPU's timestamp queries say how long each pass
// took on the card itself. The real-GPU gates already time passes this way (tools/ship/realGpuRun.mjs); this puts the same numbers live on a page.
//
//   const t = createGpuTimer(device)                 needs the device made with requiredFeatures: ["timestamp-query"]; without it t.supported is false and
//                                                    everything below is a harmless no-op (the overlay says so)
//   pass({ ..., timestampWrites: t.writes("sort") }) a slot for one pass under a label; several passes may share one label (they are summed)
//   t.finish(encoder)                                at the end of the frame's encoding: resolve the frame's slots into one of a few read-back buffers
//   t.collect()                                      each frame: read back whatever frames have finished, without waiting for any (no stall)
//   t.stats()                                        { supported, frames, labels: { label: { ms (smoothed), last } }, totalMs }
//   timerLines(stats)                                the overlay's text, one line a label, largest first
//
// THE CLOCK. Dawn rounds a timestamp down to 65,536 ns unless timestamp quantization is off (tools/ship/headlessGpu.mjs FINE_CLOCK_FLAG for node-webgpu; Chrome
// with --enable-unsafe-webgpu does not round). A pass shorter than that can read 0 on a rounded clock; the overlay shows what the card reports, nothing more.
"use strict";

/** Per-label milliseconds from resolved timestamps (BigInt64 pairs, begin and end of each pass) and the labels in slot order. Pure. */
export function durationsOf(stamps, labels) {
    const out = {};
    labels.forEach((label, i) => { const a = stamps[2 * i], b = stamps[2 * i + 1]; if (typeof a !== "bigint" || typeof b !== "bigint" || b < a) return; out[label] = (out[label] || 0) + Number(b - a) / 1e6; });
    return out;
}
/** The overlay's lines: each label's smoothed time, largest first, then the total. Pure. */
export function timerLines(st) {
    if (!st || !st.supported) return ["GPU timer: this device has no timestamp-query (ask for it when the device is made)"];
    const rows = Object.entries(st.labels).sort((a, b) => b[1].ms - a[1].ms);
    if (!rows.length) return ["GPU timer: waiting for the first frame"];
    return [...rows.map(([k, v]) => `${k.padEnd(8)} ${v.ms.toFixed(2).padStart(7)} ms`), `${"total".padEnd(8)} ${st.totalMs.toFixed(2).padStart(7)} ms on the card`];
}

export function createGpuTimer(device, { capacity = 128, ring = 3, smoothing = 0.1, usage = globalThis.GPUBufferUsage, mapMode = globalThis.GPUMapMode } = {}) {
    const supported = !!(device && device.features && device.features.has("timestamp-query"));
    const st = { supported, frames: 0, labels: {}, totalMs: 0 };
    if (!supported) return { supported, writes: () => undefined, finish() {}, collect: async () => st, stats: () => st, destroy() {} };
    const qs = device.createQuerySet({ type: "timestamp", count: capacity * 2 }), bytes = capacity * 2 * 8;
    const resolve = device.createBuffer({ size: bytes, usage: usage.QUERY_RESOLVE | usage.COPY_SRC });
    const slots = Array.from({ length: ring }, () => ({ buf: device.createBuffer({ size: bytes, usage: usage.COPY_DST | usage.MAP_READ }), labels: null, busy: false }));
    let labels = [];
    const writes = (label) => {
        if (labels.length >= capacity) return undefined;   // more passes than slots this frame: the rest go untimed rather than overwrite
        const i = labels.length; labels.push(String(label));
        return { querySet: qs, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 };
    };
    const finish = (encoder) => {
        if (!labels.length) return;
        const slot = slots.find((s) => !s.busy && !s.labels);
        if (!slot) { labels = []; return; }   // every read-back buffer is still waiting: drop this frame's times rather than stall
        encoder.resolveQuerySet(qs, 0, labels.length * 2, resolve, 0);
        encoder.copyBufferToBuffer(resolve, 0, slot.buf, 0, labels.length * 16);
        slot.labels = labels; labels = [];
    };
    const collect = async () => {
        const ready = slots.filter((s) => s.labels && !s.busy);
        await Promise.all(ready.map(async (s) => {
            s.busy = true;
            try {
                await s.buf.mapAsync(mapMode.READ, 0, s.labels.length * 16);
                const d = durationsOf(new BigInt64Array(s.buf.getMappedRange(0, s.labels.length * 16).slice(0)), s.labels); s.buf.unmap();
                let total = 0;
                for (const [k, ms] of Object.entries(d)) { const p = st.labels[k]; st.labels[k] = { ms: p ? p.ms + (ms - p.ms) * smoothing : ms, last: ms }; total += ms; }
                st.totalMs = st.frames ? st.totalMs + (total - st.totalMs) * smoothing : total; st.frames++;
            } catch { /* a lost device: the overlay keeps its last numbers */ }
            s.labels = null; s.busy = false;
        }));
        return st;
    };
    return { supported, writes, finish, collect, stats: () => st, destroy: () => { qs.destroy(); resolve.destroy(); for (const s of slots) s.buf.destroy(); } };
}
