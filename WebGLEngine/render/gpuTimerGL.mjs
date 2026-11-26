// WebGLEngine/render/gpuTimerGL.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE GRAPHICS CARD SPENT, ON A WEBGL2 PAGE. render/gpuTimer.mjs times WebGPU passes by timestamp queries; a WebGL2 page has none. It has
// EXT_disjoint_timer_query_webgl2: a TIME_ELAPSED query around a stretch of commands, read back frames later. Keith: "The GPU timer on the WebGL2 pages."
// The same report as the WebGPU timer -- stats() and render/gpuTimer.mjs's timerLines() read it unchanged.
//
//   const t = createGpuTimerGL(gl)        gl a WebGL2 context; without the extension t.supported is false and everything below is a harmless no-op
//   t.begin("draw"); ...; t.end()          a stretch of commands under a label. WEBGL2 QUERIES CANNOT NEST OR OVERLAP: begin() while another is open ends that one first
//   t.time("draw", () => ...)               the same around a function
//   t.finish()                             at the end of the frame: the frame's queries go to the read-back queue (at most `ring` frames wait; past that the frame is
//                                          dropped rather than kept growing -- a card that is slow to answer costs readings, never memory)
//   t.collect()                            each frame, without waiting: every waiting frame whose queries have ALL answered is read, oldest first. If the driver says
//                                          the clock was DISJOINT (a power-state change, a context switch: GPU_DISJOINT_EXT), every waiting frame is thrown away, unread
//   onFrame(d)                             an option: called with each frame's own { label: ms } as it is read, oldest first
//   t.stats()                              { supported, frames, labels: { label: { ms (smoothed), last } }, totalMs, dropped }
//
// THE CLOCK. Browsers coarsen this query (Chrome to about 0.1 ms or worse) and some disable it entirely; a stretch shorter than the coarsening can read 0.
// The overlay shows what the driver reports, nothing more. A query covers the GPU time between begin and end, which for a WebGL stretch includes what the driver
// queued before it ran -- it is the card's time on that stretch, not a pass in the WebGPU sense.
"use strict";

export function createGpuTimerGL(gl, { ring = 3, smoothing = 0.1, maxPerFrame = 32, onFrame = null } = {}) {
    const ext = gl && typeof gl.getExtension === "function" ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : null;
    const st = { supported: !!ext, frames: 0, labels: {}, totalMs: 0, dropped: 0 };
    if (!ext) return { supported: false, begin() {}, end() {}, time: (_l, fn) => fn(), finish() {}, collect: () => st, stats: () => st, destroy() {} };
    const pool = [], take = () => pool.pop() || gl.createQuery(), give = (q) => pool.push(q);
    let frame = [], open = null; const waiting = [];
    const end = () => { if (!open) return; gl.endQuery(ext.TIME_ELAPSED_EXT); frame.push(open); open = null; };
    const begin = (label) => {
        end();
        if (frame.length >= maxPerFrame || waiting.length >= ring) return;   // nowhere to keep it: this stretch goes untimed
        const q = take(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = { label: String(label), q };
    };
    const finish = () => {
        end();
        if (!frame.length) return;
        if (waiting.length >= ring) { for (const f of frame) give(f.q); st.dropped++; } else waiting.push(frame);
        frame = [];
    };
    const collect = () => {
        if (!waiting.length) return st;
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { for (const w of waiting.splice(0)) for (const f of w) give(f.q); st.dropped++; return st; }   // the clock jumped: none of it is a time
        while (waiting.length && waiting[0].every((f) => gl.getQueryParameter(f.q, gl.QUERY_RESULT_AVAILABLE))) {
            const w = waiting.shift(), d = {};
            for (const f of w) { d[f.label] = (d[f.label] || 0) + Number(gl.getQueryParameter(f.q, gl.QUERY_RESULT)) / 1e6; give(f.q); }
            let total = 0;
            for (const [k, ms] of Object.entries(d)) { const p = st.labels[k]; st.labels[k] = { ms: p ? p.ms + (ms - p.ms) * smoothing : ms, last: ms }; total += ms; }
            st.totalMs = st.frames ? st.totalMs + (total - st.totalMs) * smoothing : total; st.frames++;
            if (onFrame) onFrame(d);   // each frame read, its own { label: ms }, oldest first (collect() may read several at once)
        }
        return st;
    };
    const time = (label, fn) => { begin(label); try { return fn(); } finally { end(); } };
    const destroy = () => { end(); for (const w of waiting.splice(0)) for (const f of w) gl.deleteQuery(f.q); for (const f of frame) gl.deleteQuery(f.q); frame = []; for (const q of pool.splice(0)) gl.deleteQuery(q); };
    return { supported: true, begin, end, time, finish, collect, stats: () => st, destroy };
}
