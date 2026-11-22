// WebGLEngine/render/gpuTimerAuto.js -- UNNUMBERED (the version is chosen at ship time)
//
// THE GPU TIMER ON ANY WEBGL2 PAGE, IN ONE LINE. Keith: "GPU timer on the other WebGL2 pages." render/gpuTimerGL.mjs times stretches of WebGL2 commands the page
// marks; most pages have one loop and no reason to mark more than "the frame". This file does that without touching the page's code:
//
//   <script src="render/gpuTimerAuto.js"></script>      FIRST in the page's <head>, a CLASSIC script (it must run before the page makes its context;
//                                                       module scripts run after parsing, inline classic ones during it)
//
//   1  it wraps HTMLCanvasElement.prototype.getContext and keeps every "webgl2" context the page makes. THE ONE TIMED is, at each frame, the LARGEST whose canvas is
//      on the page and whose context is not lost (a page that probes for WebGL2 on a 2 x 2 canvas first -- index.html does -- is timed on the canvas it draws on;
//      the timer moves when that answer changes). One made in a worker or on an OffscreenCanvas is not seen
//   2  it runs ITS OWN animation-frame loop and keeps ONE TIME_ELAPSED query open from one frame boundary to the next, under the label "frame": whatever the
//      context does in between is timed -- in the page's animation frames, on an event, a timer, once at load. It touches neither the page's
//      requestAnimationFrame nor any other function the page calls (only getContext, which it hands straight through)
//   3  once there is a context, a small overlay in the bottom-left corner says what the card spent a frame -- or, when the page is idle (under 0.01 ms: it draws
//      on a change, not every frame), how long the last frame that drew took -- and window.__gpuTimerAuto reports
//      { state: "on" | "off" | "no WebGL2 context" | "this browser has no EXT_disjoint_timer_query_webgl2", frames, ms, last, busy, canvas }
//      (ms smoothed, last the latest frame's own, busy the latest frame that took 0.01 ms or more, canvas the timed canvas's size)
//
//   ?gputimer=0     installs nothing at all (no wrapper, no loop, no overlay); the state says "off"
//
// The timer itself (render/gpuTimerGL.mjs) is loaded by import() as this script runs; the first query opens the moment there is both a timer and a context, so
// a page that draws once while it loads is timed if the timer arrived first, and untimed (the overlay says nothing was drawn since it started) if not. A page that runs its own
// TIME_ELAPSED queries would collide with this one (WebGL2 allows one at a time): none of the pages that carry this line does, and the gate checks that.
// Held by tools/ship/gpuTimerAuto-selfcheck.mjs, which drives every page that carries this line.
(function () {
    "use strict";
    const report = { state: "no WebGL2 context", frames: 0, ms: null, last: null, busy: null, canvas: null };
    window.__gpuTimerAuto = report;
    if (new URLSearchParams(location.search).get("gputimer") === "0") { report.state = "off"; return; }
    const here = document.currentScript && document.currentScript.src ? document.currentScript.src : location.href;
    const origGet = HTMLCanvasElement.prototype.getContext, raf = window.requestAnimationFrame.bind(window);
    let timer = null, timed = null, make = null, box = null, ticks = 0;
    const contexts = [];
    const pick = () => {
        let best = null, area = -1;
        for (const gl of contexts) { const c = gl.canvas; if (!c.isConnected || gl.isContextLost()) continue; const a = c.width * c.height; if (a > area) { best = gl; area = a; } }
        return best || contexts[contexts.length - 1];
    };
    const paint = () => {
        if (!document.body) return;
        if (!box) {
            box = document.createElement("div"); box.id = "gpuTimerAuto";
            box.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:2147483647;pointer-events:none;font:11px ui-monospace,monospace;color:#cfe3ff;background:rgba(8,12,20,.72);padding:2px 6px;border-radius:4px;white-space:pre";
            document.body.appendChild(box);
        }
        box.textContent = report.state !== "on" ? `GPU timer: ${report.state}` : report.ms == null ? "GPU: waiting for the first frame"
            : report.last >= 0.01 ? `GPU ${report.ms.toFixed(2)} ms a frame on the card` : report.busy != null ? `GPU: idle; the last frame that drew took ${report.busy.toFixed(2)} ms` : "GPU: nothing drawn since the timer started (this page draws on a change)";
    };
    let looping = false;
    const tick = () => {
        if (timer) {
            timer.finish();   // ends the query open since the last boundary
            const s = timer.collect(), f = s.labels.frame;
            if (f) { report.frames = s.frames; report.ms = f.ms; report.last = f.last; }
        }
        const gl = pick();
        if (make && gl !== timed) {   // the first, or the canvas that matters changed: a new timer on it (no query is open here)
            if (timer) timer.destroy();
            timed = gl; timer = make(gl, { smoothing: 0.1, onFrame: (d) => { if (d.frame >= 0.01) report.busy = d.frame; } }); Object.assign(report, { frames: 0, ms: null, last: null, busy: null, canvas: gl.canvas.width + " x " + gl.canvas.height });
            report.state = timer.supported ? "on" : "this browser has no EXT_disjoint_timer_query_webgl2";
            paint();
        }
        if (timed) report.canvas = timed.canvas.width + " x " + timed.canvas.height;   // as it is now (a page sizes its canvas after making the context)
        if (timer && timer.supported) timer.begin("frame");
        if (++ticks % 15 === 1) paint();
        if (looping) raf(tick);
    };
    const start = () => { if (looping || !make || !contexts.length) return; looping = true; tick(); };   // the first query opens at once: what the page draws before its first frame is timed too
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        const c = origGet.call(this, type, attrs);
        if (c && type === "webgl2" && !contexts.includes(c)) {
            contexts.push(c);
            if (!make) report.state = "loading the timer";
            start();
        }
        return c;
    };
    // loaded at once, not when the first context appears: it is usually here before the page's own scripts make one, so their first draws are timed
    import(new URL("gpuTimerGL.mjs", here).href).then((m) => { make = m.createGpuTimerGL; start(); },
        (e) => { report.state = "the timer did not load: " + (e && e.message ? e.message : e); });
})();
