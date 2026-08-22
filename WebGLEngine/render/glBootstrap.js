// render/glBootstrap.js
//
// Defensive WebGL2 acquisition (v2777). The engine shares ONE webgl2 context (main.js) across the voxel
// renderer, cape-shield, magic-carpet, P3dRenderer and more. Two failure modes were biting index.html:
//
//   1. LEAK -> EXHAUSTION: throwaway contexts (a debug-banner GPU-name probe re-run on every WS reconnect,
//      plus preview/avatar canvases) were created and never released. Chrome caps active WebGL contexts (~16);
//      once accumulated leaks hit the ceiling, Chrome starts LOSING contexts and new getContext() calls return
//      null. This is why it "works normally" and then fails deep into a long session.
//   2. NO DEFENCE: the shared getContext("webgl2") had no null guard and no context-loss listener, so a null or
//      lost context cascaded into uncaught errors (P3dRenderer calling createProgram on null) instead of one
//      clear message.
//
// This module fixes both: acquireGL guards + wires context-loss/restore, and probeGpuString reads the GPU name
// through a throwaway context that it RELEASES immediately and caches, so it can never leak a second one.
//
// Browser-safe: uses only DOM/WebGL globals, imports nothing.

// Acquire the shared WebGL2 context with a null guard and context-loss wiring. Returns { gl, ok, dispose }.
// On failure gl is null and ok is false -- callers MUST skip GPU init rather than pass null downstream.
export function acquireGL(canvas, opts = {}) {
    let gl = null;
    try { gl = opts.attributes ? canvas.getContext("webgl2", opts.attributes) : canvas.getContext("webgl2"); }
    catch (e) { gl = null; }

    if (!gl) {
        try { (opts.onUnavailable || _defaultUnavailable)(); } catch {}
        // Hand back a no-op stub instead of null: the engine builds ~15 renderers straight off this context at
        // load, most calling createProgram in their constructors. A stub lets them all construct and no-op
        // instead of throwing an uncaught TypeError that halts init. ok:false tells callers to skip OPTIONAL
        // effects; the 2D fallback (showGLUnavailable) paints the reason on the canvas.
        return { gl: makeStubGL(canvas), ok: false, dispose: () => {} };
    }

    const onLost = (e) => { try { e.preventDefault(); } catch {} try { opts.onLost && opts.onLost(); } catch {} };
    const onRestored = () => { try { opts.onRestored && opts.onRestored(); } catch {} };
    try { canvas.addEventListener("webglcontextlost", onLost, false); } catch {}
    try { canvas.addEventListener("webglcontextrestored", onRestored, false); } catch {}

    const dispose = () => {
        try { canvas.removeEventListener("webglcontextlost", onLost, false); } catch {}
        try { canvas.removeEventListener("webglcontextrestored", onRestored, false); } catch {}
    };
    return { gl, ok: true, dispose };
}

function _defaultUnavailable() {
    console.error("[gl] WebGL2 context unavailable -- hardware acceleration may be off, the GPU process may have " +
        "been lost, or too many WebGL contexts are open on this page (check for leaked preview/avatar canvases). " +
        "Open chrome://gpu and reload. GPU subsystems will be skipped this run.");
}

// Leak-free GPU renderer-name probe. Creates a throwaway context, reads the unmasked renderer, and RELEASES the
// context immediately via WEBGL_lose_context. Cached, so a second call never opens a second probe context --
// this is the fix for the debug banner that leaked one context per WS reconnect.
let _gpuStringCache = null;
export function probeGpuString() {
    if (_gpuStringCache !== null) return _gpuStringCache;
    let out = "no-webgl";
    try {
        const canv = (typeof document !== "undefined") ? document.createElement("canvas") : null;
        const gl = canv && (canv.getContext("webgl2") || canv.getContext("webgl"));
        if (gl) {
            const dbg = gl.getExtension("WEBGL_debug_renderer_info");
            out = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").slice(0, 60) : "gl-ok";
            try { const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext(); } catch {}   // RELEASE
        }
    } catch { out = "gl-err"; }
    _gpuStringCache = out;
    return out;
}

// test seam only
export function _resetGpuStringCache() { _gpuStringCache = null; }

// A no-op WebGL2 stub used when the real context is null. Every method is harmless: create* return a truthy
// dummy so link/compile checks pass, get*Parameter return true (pretend success), getExtension returns null,
// isContextLost returns true (context-loss-aware loops skip drawing), constants (UPPERCASE) are 0, everything
// else is a no-op. Renderers construct and "render" to nothing instead of throwing.
export function makeStubGL(canvas) {
    const dummy = () => ({});
    const noop = () => {};
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "canvas") return canvas || null;
            if (prop === "isContextLost") return () => true;
            if (prop === "getExtension") return () => null;
            if (prop === "getParameter") return () => 0;
            if (prop === "getShaderParameter" || prop === "getProgramParameter") return () => true;
            if (prop === "getShaderInfoLog" || prop === "getProgramInfoLog") return () => "";
            if (prop === "getAttribLocation") return () => -1;
            if (prop === "getUniformLocation") return () => null;
            if (typeof prop === "string" && /^create/.test(prop)) return dummy;
            if (typeof prop === "string" && prop.length > 1 && prop === prop.toUpperCase()) return 0;   // GL constant
            return noop;
        },
    });
}

// Graceful 2D fallback: when WebGL2 is genuinely unavailable, paint the reason on the (now context-free) canvas
// so the user sees a clear message instead of a black screen. Returns true if it drew.
export function showGLUnavailable(canvas, message) {
    try {
        const ctx = canvas && canvas.getContext && canvas.getContext("2d");
        if (!ctx) return false;
        const w = canvas.width || canvas.clientWidth || 800;
        const h = canvas.height || canvas.clientHeight || 600;
        ctx.fillStyle = "#0a0e0c"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#cfe9d8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const lines = String(message).split("\n");
        ctx.font = "bold 18px ui-monospace, Menlo, Consolas, monospace";
        lines.forEach((ln, i) => {
            ctx.font = i === 0 ? "bold 18px ui-monospace, monospace" : "14px ui-monospace, monospace";
            ctx.fillText(ln, w / 2, h / 2 - (lines.length - 1) * 14 + i * 28);
        });
        return true;
    } catch { return false; }
}

// --- RECORDING CONTEXT (v3058) -------------------------------------------------------------------------------
//
// Borrowed from GacUI. Its Remote Protocol splits UI logic from rendering, and on top of that it ships a MOCK
// RENDERER that captures what the UI asked to draw -- so a GUI is testable with no OS window and no pixels. The
// transferable part is the reframing: a renderer is a PROTOCOL, and a protocol can be recorded.
//
// This tree needed that badly. render-qa boots a real GPU Chromium, which the sandbox does not have, so
// raymarch-live.html could not be judged here at all -- and four separate guesses at why it drew nothing were
// wrong. What was missing was not a GPU. It was the ability to ask "what did the pass ASK the GPU to do?"
//
// makeRecordingGL answers exactly that. Every call lands in a log with its arguments; nothing renders. So
// "the pass issued drawArrays(TRIANGLES, 0, 3) with an R8UI 3D texture of 64x64x64 bound to unit 0" becomes a
// headless assertion, and the pixels stay a rig concern.
//
// WHAT IT IS NOT: a WebGL implementation. It cannot tell you the picture is right -- only that the right
// commands were issued with the right arguments. A shader that compiles here may still fail on a driver. Those
// are different claims and conflating them would make this worse than useless, because it would look like
// coverage. It is INTENT coverage, and the gate says so.
//
// CONSTANTS DECODE BACK TO NAMES. Every gl.FOO returns a distinct deterministic integer derived from "FOO", and
// nameOf() inverts it -- so a recorded call reads texImage3D(TEXTURE_3D, 0, R8UI, ...) instead of a row of
// magic numbers. Distinctness is what makes it a test: if R8UI and R8 collided, the format assertion would pass
// on the wrong one.

const _GL_NAMES = new Map();
function _constFor(name) {
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const v = (h % 0x7f000) + 0x1000;          // small, positive, and away from 0/1 so truthiness never lies
    if (!_GL_NAMES.has(v)) _GL_NAMES.set(v, name);
    return v;
}

/** Decode a recorded constant back to its WebGL name, or return the value unchanged. */
export function nameOf(v) { return _GL_NAMES.has(v) ? _GL_NAMES.get(v) : v; }

/**
 * A WebGL2-shaped context that RECORDS instead of drawing.
 * Returns { gl, log, calls, find, count, last, dump }.
 *   log    -- [{ op, args }] in order; typed arrays are summarised, not copied
 *   find/count/last(op) -- by method name
 *   dump() -- the sequence as readable lines, constants decoded
 */
export function makeRecordingGL(canvas, opts = {}) {
    const log = [];
    const w = (canvas && canvas.width) || 640, h = (canvas && canvas.height) || 480;

    // Typed arrays are summarised: length, first few bytes and a checksum. Copying a 256 KB volume into a log
    // per call would make the recorder the slowest thing in the suite, and the checksum is what an assertion
    // actually needs -- "the buffer that reached the GPU is the one we derived".
    const summarise = (a) => {
        if (!a || typeof a !== "object" || typeof a.length !== "number" || typeof a.BYTES_PER_ELEMENT !== "number") return a;
        let sum = 0;
        for (let i = 0; i < a.length; i++) { sum = (sum + a[i] * (i % 31 + 1)) >>> 0; }
        return { typed: a.constructor.name, length: a.length, head: Array.from(a.slice(0, 4)), checksum: sum };
    };

    const target = {
        canvas, drawingBufferWidth: w, drawingBufferHeight: h,
        isContextLost: () => false,
        getError: () => 0,
        getExtension: (n) => (opts.extensions && opts.extensions[n]) || null,
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getShaderInfoLog: () => "",
        getProgramInfoLog: () => "",
        getParameter: (p) => (p === _constFor("MAX_TEXTURE_SIZE") ? 16384 : 1),
        getUniformLocation: (prog, n) => ({ __uniform: n }),
        getAttribLocation: () => 0,
        checkFramebufferStatus: () => _constFor("FRAMEBUFFER_COMPLETE"),
    };
    for (const k of ["createShader", "createProgram", "createTexture", "createBuffer", "createVertexArray", "createFramebuffer"])
        target[k] = ((kind) => () => ({ __obj: kind }))(k);

    const gl = new Proxy(target, {
        get(t, prop) {
            if (prop === "__log") return log;
            if (prop in t) {
                const v = t[prop];
                if (typeof v !== "function") return v;
                return (...args) => { log.push({ op: String(prop), args: args.map(summarise) }); return v(...args); };
            }
            if (typeof prop === "string" && /^[A-Z][A-Z0-9_]*$/.test(prop)) return _constFor(prop);
            if (typeof prop === "symbol") return undefined;
            return (...args) => { log.push({ op: String(prop), args: args.map(summarise) }); };
        },
        has() { return true; },
    });

    const find = (op) => log.filter((c) => c.op === op);
    return {
        gl, log,
        calls: () => log.length,
        find,
        count: (op) => find(op).length,
        last: (op) => find(op).slice(-1)[0] || null,
        dump: () => log.map((c) => c.op + "(" + c.args.map((a) => (a && a.typed) ? (a.typed + "[" + a.length + "]#" + a.checksum) : JSON.stringify(nameOf(a))).join(", ") + ")").join("\n"),
    };
}
