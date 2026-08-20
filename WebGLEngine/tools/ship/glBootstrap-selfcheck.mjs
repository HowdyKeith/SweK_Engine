// WebGLEngine/tools/ship/glBootstrap-selfcheck.mjs -- v2777
//
// Run: node tools/ship/glBootstrap-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/glBootstrap.js -- the defensive WebGL2 acquisition + leak-free GPU probe. Pins: a null context
// returns ok:false WITHOUT throwing (the cascade this replaces); context-loss fires the callback with
// preventDefault; and probeGpuString RELEASES its throwaway context and CACHES -- so it can never leak a
// context per WS reconnect (the root exhaustion cause). SABOTAGE mirror: a probe that skips loseContext leaks
// one context per call.

import { acquireGL, probeGpuString, _resetGpuStringCache, showGLUnavailable } from "../../render/glBootstrap.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// --- mock canvas whose getContext returns null (GPU off / context limit hit) ---
{
    let unavailableCalled = 0, threw = false;
    const canvas = { getContext: () => null, addEventListener: () => {}, removeEventListener: () => {} };
    let res;
    try { res = acquireGL(canvas, { onUnavailable: () => unavailableCalled++ }); } catch { threw = true; }
    ok("null context: acquireGL does NOT throw (no cascade)", !threw);
    ok("null context: returns ok:false with a no-op STUB gl (not null)", res && res.ok === false && res.gl && typeof res.gl.createProgram === "function");
    ok("null context: onUnavailable diagnostic fired", unavailableCalled === 1);
    // the stub must let a full renderer-like ctor+draw sequence run without throwing (the whack-a-mole fix)
    let stubThrew = false;
    try {
        const g = res.gl;
        const prog = g.createProgram(); const sh = g.createShader(g.VERTEX_SHADER);
        g.shaderSource(sh, ""); g.compileShader(sh);
        if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error("compile");
        g.attachShader(prog, sh); g.linkProgram(prog);
        if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error("link");
        g.useProgram(prog);
        const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf);
        g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 0]), g.STATIC_DRAW);
        const loc = g.getAttribLocation(prog, "a_pos"); g.enableVertexAttribArray(loc);
        g.vertexAttribPointer(loc, 3, g.FLOAT, false, 0, 0);
        g.drawArrays(g.TRIANGLES, 0, 3);
    } catch { stubThrew = true; }
    ok("null context: stub survives a full renderer build + draw without throwing", !stubThrew);
}

// --- mock canvas with a fake gl + event capture: context loss/restore wiring ---
{
    const listeners = {};
    const fakeGl = { FAKE: true };
    const canvas = {
        getContext: () => fakeGl,
        addEventListener: (t, fn) => { listeners[t] = fn; },
        removeEventListener: (t) => { delete listeners[t]; },
    };
    let lost = 0, restored = 0;
    const res = acquireGL(canvas, { onLost: () => lost++, onRestored: () => restored++ });
    ok("valid context: returns ok:true with the gl", res.ok === true && res.gl === fakeGl);
    ok("valid context: context-loss + restore listeners registered", !!listeners["webglcontextlost"] && !!listeners["webglcontextrestored"]);
    // fire a loss event; the handler must preventDefault (so the context CAN be restored) and call onLost
    let prevented = 0;
    listeners["webglcontextlost"]({ preventDefault: () => prevented++ });
    ok("context lost: preventDefault called (allows restore) + onLost fired", prevented === 1 && lost === 1);
    listeners["webglcontextrestored"]();
    ok("context restored: onRestored fired", restored === 1);
    res.dispose();
    ok("dispose: listeners removed", !listeners["webglcontextlost"] && !listeners["webglcontextrestored"]);
}

// --- probeGpuString: releases the throwaway context and caches (no per-call leak) ---
{
    let created = 0, released = 0;
    const makeGl = () => ({
        getExtension: (n) => n === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
            : n === "WEBGL_lose_context" ? { loseContext: () => released++ } : null,
        getParameter: () => "FakeGPU Adapter",
    });
    globalThis.document = { createElement: () => ({ getContext: () => { created++; return makeGl(); } }) };
    _resetGpuStringCache();
    const s1 = probeGpuString();
    ok("probe: returns the GPU renderer string", s1 === "FakeGPU Adapter", "got=" + s1);
    ok("probe: released its throwaway context (WEBGL_lose_context)", released === 1);
    const s2 = probeGpuString();
    ok("probe: cached -- a second call opens NO new context (no leak per reconnect)", created === 1 && s2 === s1, "created=" + created);
    delete globalThis.document;
}

// --- SABOTAGE: a probe that forgets loseContext leaks one context per call ---
{
    let created = 0, released = 0;
    const leakyProbe = () => {
        const canv = { getContext: () => ({ getExtension: (n) => n === "WEBGL_lose_context" ? { loseContext: () => released++ } : null, getParameter: () => "x" }) };
        created++;
        canv.getContext();   // no loseContext -> leak
    };
    leakyProbe(); leakyProbe(); leakyProbe();
    ok("SABOTAGE: a probe without loseContext leaks every call (released stays 0)", created === 3 && released === 0, "created=" + created + " released=" + released);
}

// --- graceful 2D fallback paints the canvas ---
{
    let rect = 0, filled = 0; const texts = [];
    const ctx2d = { fillRect: () => rect++, fillText: (t) => { filled++; texts.push(t); } };
    Object.defineProperties(ctx2d, { fillStyle: { set() {} }, font: { set() {} }, textAlign: { set() {} }, textBaseline: { set() {} } });
    const canvas = { width: 800, height: 600, getContext: (t) => t === "2d" ? ctx2d : null };
    const drew = showGLUnavailable(canvas, "WebGL2 unavailable\nline two\nline three");
    ok("fallback: showGLUnavailable painted background + all 3 lines", drew === true && rect === 1 && filled === 3, "rect=" + rect + " lines=" + filled);
    ok("fallback: first line is the headline", texts[0] === "WebGL2 unavailable");
    ok("fallback: no 2d context -> returns false, no throw", showGLUnavailable({ getContext: () => null }, "x") === false);
}

// --- browser-safe ---
{
    const src = (await import("node:fs")).readFileSync(new URL("../../render/glBootstrap.js", import.meta.url), "utf8");
    ok("source: glBootstrap imports no Node builtin at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url|crypto|net|dgram|zlib)/m.test(src));
}

console.log("glBootstrap-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
