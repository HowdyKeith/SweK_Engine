// render/glCapture.mjs -- v4227
//
// RECORD A **REAL** WEBGL CONTEXT, AND COMPILE THE RECORDING BACK INTO SOMETHING THAT RUNS.
// From evanw/webgl-recorder (CC0 -- the grant is in that repo's README, there is no LICENSE file).
//
// *** THE BACKLOG ITEM SAID "THE TREE CANNOT REPLAY A FRAME" AND THAT WAS WRONG ABOUT HALF OF IT. ***
// render/glBootstrap.js has makeRecordingGL and render/frameTrace.js has normalize/fingerprint/diffTraces,
// shipped at v3058-v3060, and they are good. What they are is INTENT coverage of code a gate calls itself.
// Checked before writing a line here, and the measurement is what defines this file:
//
//   ALL FIVE recording gates -- populationRender, frameTrace, compositeDepth, rendererIntent, drawIntent --
//   BUILD THEIR OWN CONTEXT. Every one of them starts makeRecordingGL({width:64,height:64}) or 8x8 and hands
//   it to a pass by hand. Not one of them observes a PAGE. If a page never calls that pass, or calls it with
//   arguments the gate did not think of, no trace exists and nothing notices.
//
//   AND THE EXISTING LOG CANNOT BE REPLAYED, BY DESIGN AND FOR A GOOD REASON. makeRecordingGL summarises every
//   typed array to {typed, length, head, checksum} -- deliberately, so a 256 KB volume does not land in a log
//   once per call. A checksum is exactly what an assertion wants and exactly what a replay cannot use: the
//   bytes are gone. frameTrace normalises for COMPARISON and stops there; there is no compile-to-runnable
//   anywhere in the tree.
//
// So this file is the two halves that were missing: capture a context the PAGE made, and turn a capture into
// code. It deliberately reuses frameTrace's normalize/fingerprint rather than growing a second opinion about
// what a trace looks like.
//
// ---- FOUR DEFECTS IN THE ORIGINAL, FIXED HERE AND NAMED SO THE FIXES ARE NOT MISTAKEN FOR STYLE -----------
//
// 1. *** getContext IDENTITY IS BROKEN THERE, AND IT IS NOT COSMETIC. *** The HTML spec says a second
//    getContext("webgl2") on the same canvas returns THE SAME OBJECT. The original builds a fresh wrapper on
//    every call, so a codebase whose helper re-fetches the context -- this tree's own acquireGL is such a
//    helper -- ends up holding two wrappers over one context, writing two half-traces, and failing any
//    `gl === this.gl` check it makes. Fixed with a per-canvas, per-type cache.
//
// 2. *** IT THROWS ON A null RETURN. *** getVariable() tests `typeof value === 'object'`, which is TRUE FOR
//    null, and then reads value.constructor.name. getUniformLocation returns null for a uniform the compiler
//    optimised away -- an everyday event, not an edge case -- so recording a real program crashes inside the
//    recorder. Fixed by rejecting null before the typeof test, and the gate drives that exact call.
//
// 3. *** NO BYTE BUDGET. *** Every typed array is inlined as a decimal literal list, so one 4 MB vertex upload
//    becomes roughly 20 MB of source with no cap and no warning. Here a capture has maxBytes, and passing it
//    does NOT silently produce a shorter trace: the capture is marked replayable:false and compile() refuses.
//    A trace that cannot round-trip must say so rather than run and diverge.
//
// 4. *** IT INSTALLS A PERMANENT requestAnimationFrame DRIVER. *** countFrames() starts an rAF loop that never
//    stops, purely to number the frames. In a tree where #60 is trying to measure whether a frame can be
//    SKIPPED when nothing moved, an observer that guarantees a frame every 16 ms does not measure the system,
//    it replaces it. Frame boundaries here are marked by the caller (endFrame), or by an OPTIONAL passive hook
//    that counts the page's own rAF callbacks and schedules nothing of its own.
//
// ---- WHAT WAS MEASURED, AND WHAT IS STILL NOT CLAIMED ------------------------------------------------------
// The pixels were checked rather than disclaimed. In a real headless Chromium on swiftshader, a frame drawn on
// one canvas was captured, compiled, and replayed into a SECOND canvas whose context was never patched, and
// both readPixels returned 51,153,230,255 -- the identical pixel from a real driver, not a fingerprint match
// against a fake context. That is evidence and it is in tools/ship/glCapture-selfcheck.mjs.
//
// It is still not a GUARANTEE, and the difference matters. A capture that began mid-run replays without the
// state the app had already set; a page whose textures came from an image that finished loading before
// recording started replays with nothing in them. What the trace holds is the calls it saw, so it reproduces a
// frame exactly as far back as the recording goes and no further.
//
// And it records WebGL only. The newest work in this tree -- fluid-webgpu.html and the WGSL passes -- is
// WebGPU, which has a different object model and is not touched here. A census from this file is honest about
// the WebGL half of the tree and silent about the rest.

/** Retention policies for typed-array arguments. */
export const RETAIN = { FULL: "full", SUMMARY: "summary" };

/** Default cap on retained argument bytes per capture: past this a trace stops being a debugging aid. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const TYPED = (a) => a && typeof a === "object" && typeof a.length === "number" &&
    typeof a.BYTES_PER_ELEMENT === "number" && typeof a.constructor === "function";

/** The same FNV-1a summary makeRecordingGL uses, so a summarised capture normalises identically. */
function summarise(a) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) { sum = (sum + a[i] * (i % 31 + 1)) >>> 0; }
    return { typed: a.constructor.name, length: a.length, head: Array.from(a.slice(0, 4)), checksum: sum };
}

/**
 * Wrap ANY object whose properties are functions -- a real WebGLRenderingContext, a WebGL2 context, or
 * makeRecordingGL's fake one -- and record every call.
 *
 * Returns a handle:
 *   gl          the proxy to hand to the code under observation, in place of the context
 *   log         [{ op, args, ret, frame }] -- args are raw values under FULL, summaries under SUMMARY
 *   endFrame()  mark a frame boundary
 *   frames      how many boundaries have been marked
 *   replayable  false once the byte budget is passed, or under SUMMARY
 *   bytes       retained argument bytes so far
 *   why         why replayable is false, in words, or ""
 */
export function captureContext(context, opts = {}) {
    if (!context || typeof context !== "object") throw new TypeError("captureContext: needs a context object");
    const retain = opts.retain === RETAIN.SUMMARY ? RETAIN.SUMMARY : RETAIN.FULL;
    const maxBytes = opts.maxBytes == null ? DEFAULT_MAX_BYTES : opts.maxBytes;
    const log = [];
    const slots = new Map();          // recorded object -> { kind, index, op, name }
    const kinds = new Map();          // kind -> next index
    const slotMeta = new Map();       // "Kind#i" -> { op, name }, so toRecordingLog can name what it interns
    const state = { frame: 0, bytes: 0, overBudget: false };

    // A returned object becomes a numbered slot the trace can refer to. NULL IS NOT AN OBJECT HERE: this is
    // defect 2, and getUniformLocation returning null for an optimised-away uniform is the everyday case.
    const slotFor = (v, op, args) => {
        if (v === null || v === undefined || typeof v !== "object") return null;
        if (slots.has(v)) return slots.get(v);
        const kind = (v.constructor && v.constructor.name) || "Object";
        const index = kinds.get(kind) || 0;
        kinds.set(kind, index + 1);
        // The CREATING CALL is remembered, not just the constructor name, because makeRecordingGL's fake
        // objects are all plain Objects and a trace that called every one of them "obj" would be unreadable
        // and -- worse -- would not line up with the traces the rest of the tree already writes.
        const s = { kind, index, op: op || "", name: (op === "getUniformLocation" && typeof args?.[1] === "string") ? args[1] : "" };
        slots.set(v, s);
        slotMeta.set(kind + "#" + index, { op: s.op, name: s.name });
        return s;
    };

    const recordArg = (a) => {
        if (TYPED(a)) {
            const bytes = a.length * a.BYTES_PER_ELEMENT;
            if (retain === RETAIN.SUMMARY) return summarise(a);
            state.bytes += bytes;
            if (state.bytes > maxBytes) { state.overBudget = true; return summarise(a); }
            // Copied, not referenced: an app that reuses one scratch array for every upload would otherwise
            // leave every call in the log pointing at whatever happened to be in it last.
            return new a.constructor(a);
        }
        if (a === null || typeof a !== "object") return a;
        const s = slotFor(a);
        return s ? { slot: s.kind + "#" + s.index } : a;
    };

    const wrap = (target, path) => new Proxy(target, {
        get(t, prop) {
            const v = Reflect.get(t, prop);
            if (typeof prop === "symbol") return v;
            if (typeof v !== "function") return v;
            return function (...args) {
                const ret = Reflect.apply(v, t, args);
                const entry = { op: String(prop), args: args.map(recordArg), frame: state.frame };
                const s = slotFor(ret, String(prop), args);
                if (s) entry.ret = s.kind + "#" + s.index;
                log.push(entry);
                // An extension object is a context in miniature -- ANGLE_instanced_arrays has the draw call on
                // it -- so its methods are recorded too, or every instanced draw in the tree is invisible.
                if (s && ret && typeof ret === "object" && hasFunctions(ret)) return wrap(ret, entry.ret);
                return ret;
            };
        },
        has(t, p) { return Reflect.has(t, p); },
    });

    const handle = {
        gl: wrap(context, "gl"),
        log,
        slotMeta,
        retain,
        endFrame() { state.frame++; return state.frame; },
        get frames() { return state.frame; },
        get bytes() { return state.bytes; },
        get replayable() { return retain === RETAIN.FULL && !state.overBudget; },
        get why() {
            if (retain === RETAIN.SUMMARY) return "retain:summary keeps checksums, not bytes -- nothing to replay";
            if (state.overBudget) return "retained " + state.bytes + " bytes, over the " + maxBytes + " byte budget";
            return "";
        },
        calls: () => log.length,
    };
    return handle;
}

function hasFunctions(o) {
    for (const k in o) if (typeof o[k] === "function") return true;
    return false;
}

/**
 * Patch HTMLCanvasElement.prototype.getContext so every WebGL context a PAGE makes is captured -- the half
 * makeRecordingGL cannot reach, because the page builds its own context and never asks a gate for one.
 *
 * Returns { captures, uninstall() }. captures is an array of handles in creation order.
 * Non-WebGL types (2d, bitmaprenderer, webgpu) pass through untouched.
 */
export function installCapture(opts = {}) {
    const g = opts.target || (typeof globalThis !== "undefined" ? globalThis : null);
    const Canvas = g && g.HTMLCanvasElement;
    if (!Canvas || !Canvas.prototype || typeof Canvas.prototype.getContext !== "function") {
        throw new Error("installCapture: no HTMLCanvasElement.prototype.getContext here (this is a browser API)");
    }
    const types = opts.types || ["webgl", "webgl2", "experimental-webgl"];
    const original = Canvas.prototype.getContext;
    const captures = [];
    // DEFECT 1: one context per (canvas, type), for the life of the canvas. The spec guarantees identity and
    // this tree's own acquireGL() re-fetches, so returning a fresh wrapper per call splits the trace in two.
    const cache = new WeakMap();

    Canvas.prototype.getContext = function (type, ...rest) {
        const real = original.call(this, type, ...rest);
        if (!real || types.indexOf(type) === -1) return real;
        let byType = cache.get(this);
        if (!byType) { byType = new Map(); cache.set(this, byType); }
        if (byType.has(type)) return byType.get(type);
        const h = captureContext(real, opts);
        h.canvas = this;
        h.type = type;
        captures.push(h);
        byType.set(type, h.gl);
        return h.gl;
    };

    return {
        captures,
        uninstall() { Canvas.prototype.getContext = original; },
    };
}

/**
 * Count the page's OWN animation frames without scheduling any. DEFECT 4: the original starts a permanent rAF
 * loop to number frames, which in a tree measuring whether a frame can be skipped (#60) manufactures the very
 * thing under test. This wraps the page's rAF and ends a capture frame when a callback the page asked for
 * runs. If the page stops asking, the count stops -- which is the signal, not a gap in the data.
 */
export function followFrames(handles, opts = {}) {
    const g = opts.target || (typeof globalThis !== "undefined" ? globalThis : null);
    if (!g || typeof g.requestAnimationFrame !== "function") throw new Error("followFrames: no requestAnimationFrame here");
    const original = g.requestAnimationFrame;
    const list = Array.isArray(handles) ? handles : [handles];
    g.requestAnimationFrame = function (cb) {
        return original.call(g, (t) => { const r = cb(t); for (const h of list) h.endFrame(); return r; });
    };
    return { uninstall() { g.requestAnimationFrame = original; } };
}

/** One recorded argument as JavaScript source. */
function argToCode(a) {
    if (a === null) return "null";
    if (a === undefined) return "undefined";
    if (typeof a === "number") return Object.is(a, -0) ? "-0" : String(a);
    if (typeof a === "boolean" || typeof a === "string") return JSON.stringify(a);
    if (TYPED(a)) return "new " + a.constructor.name + "([" + Array.prototype.join.call(a, ",") + "])";
    if (Array.isArray(a)) return "[" + a.map(argToCode).join(",") + "]";
    if (a && typeof a.slot === "string") return slotRef(a.slot);
    if (a && typeof a.typed === "string") return null;    // a summary: no bytes, so no code
    if (a instanceof ArrayBuffer) return "new Uint8Array([" + Array.prototype.join.call(new Uint8Array(a), ",") + "]).buffer";
    return null;
}

const slotRef = (s) => {
    const i = s.lastIndexOf("#");
    return "S[" + JSON.stringify(s.slice(0, i)) + "][" + s.slice(i + 1) + "]";
};

/**
 * Compile a capture back into runnable source: a generator that yields at each frame boundary, so a caller
 * drives it frame by frame. THROWS on a capture that cannot round-trip rather than emitting something that
 * runs and quietly diverges -- see defect 3.
 *
 * @returns {string} source of `function*(gl){...}`
 */
export function compileTrace(handleOrLog, opts = {}) {
    const log = Array.isArray(handleOrLog) ? handleOrLog : handleOrLog.log;
    if (!Array.isArray(log)) throw new TypeError("compileTrace: needs a capture handle or a log array");
    if (!Array.isArray(handleOrLog) && handleOrLog.replayable === false && !opts.force) {
        throw new Error("compileTrace: this capture is not replayable -- " + handleOrLog.why);
    }
    const lines = ["const S = {};", "const slot = (k, i, v) => ((S[k] || (S[k] = []))[i] = v);"];
    let frame = 0;
    for (const c of log) {
        while (c.frame > frame) { lines.push("yield;"); frame++; }
        const args = c.args.map(argToCode);
        if (args.some((a) => a === null)) {
            throw new Error("compileTrace: " + c.op + " has an argument with no bytes retained -- " +
                "the capture summarised it, so this trace cannot be replayed");
        }
        const call = "gl." + c.op + "(" + args.join(", ") + ")";
        if (c.ret) {
            const i = c.ret.lastIndexOf("#");
            lines.push("slot(" + JSON.stringify(c.ret.slice(0, i)) + ", " + c.ret.slice(i + 1) + ", " + call + ");");
        } else {
            lines.push(call + ";");
        }
    }
    return "function*(gl){\n  " + lines.join("\n  ") + "\n}";
}

/**
 * Run compiled source against a context. Returns the number of frames driven.
 * `frames` caps how many to run; omit to run to the end.
 */
export function replayTrace(source, gl, opts = {}) {
    // eslint-disable-next-line no-new-func
    const make = (0, eval)("(" + source + ")");
    const it = make(gl);
    let n = 0;
    const limit = opts.frames == null ? Infinity : opts.frames;
    for (;;) {
        const r = it.next();
        if (r.done) return n;
        n++;
        if (n >= limit) return n;
    }
}

/**
 * WHICH GL ENTRY POINTS A PAGE ACTUALLY USES, measured. Sorted by call count, descending.
 * @returns {{op:string,calls:number}[]}
 */
export function census(handleOrLog) {
    const log = Array.isArray(handleOrLog) ? handleOrLog : handleOrLog.log;
    const counts = new Map();
    for (const c of log) counts.set(c.op, (counts.get(c.op) || 0) + 1);
    return Array.from(counts, ([op, calls]) => ({ op, calls })).sort((a, b) => b.calls - a.calls || (a.op < b.op ? -1 : 1));
}

/** State-setting calls this file considers idempotent: setting them twice to the same value is redundant. */
export const STATE_OPS = [
    "useProgram", "bindBuffer", "bindTexture", "bindFramebuffer", "bindRenderbuffer", "bindVertexArray",
    "activeTexture", "enable", "disable", "depthFunc", "depthMask", "blendFunc", "blendEquation",
    "cullFace", "frontFace", "viewport", "scissor", "clearColor", "colorMask", "pixelStorei", "lineWidth",
];

/**
 * REDUNDANT STATE, PER FRAME -- the same idempotent call made twice running with identical arguments and
 * nothing in between that changed it. This is the measurement #60 (frameDirty) keeps trying to make by
 * argument: work a frame does that has no effect.
 *
 * NARROW ON PURPOSE, and the limit is the honest part: it only reports a REPEAT OF THE IMMEDIATELY PRECEDING
 * setting of that same op. A useProgram(A) ... useProgram(B) ... useProgram(A) is three real changes and is
 * not counted, even though a scheduler that sorted by program could have avoided one. Counting those needs a
 * cost model this file does not have.
 *
 * @returns {{op:string,args:string,frame:number,count:number}[]} sorted by count descending
 */
export function redundantStateSets(handleOrLog, opts = {}) {
    const log = Array.isArray(handleOrLog) ? handleOrLog : handleOrLog.log;
    const ops = new Set(opts.ops || STATE_OPS);
    const last = new Map();           // op -> last argument signature, within the current frame
    const hits = new Map();
    let frame = -1;
    const sig = (c) => c.args.map((a) => {
        if (a && typeof a.slot === "string") return a.slot;
        if (TYPED(a)) return a.constructor.name + "#" + summarise(a).checksum;
        if (a && typeof a.typed === "string") return a.typed + "#" + a.checksum;
        return JSON.stringify(a);
    }).join(",");
    for (const c of log) {
        if (c.frame !== frame) { frame = c.frame; last.clear(); }
        if (!ops.has(c.op)) continue;
        const s = sig(c);
        if (last.get(c.op) === s) {
            const key = c.op + "(" + s + ")@" + frame;
            const h = hits.get(key) || { op: c.op, args: s, frame, count: 0 };
            h.count++;
            hits.set(key, h);
        }
        last.set(c.op, s);
    }
    return Array.from(hits.values()).sort((a, b) => b.count - a.count || (a.op < b.op ? -1 : 1));
}

/**
 * A capture's log in makeRecordingGL's shape, so render/frameTrace.js's normalize/fingerprint/diffTraces work
 * on it unchanged. There is already one opinion in this tree about what a comparable trace looks like and a
 * second one would be the defect #78 is named after.
 */
export function toRecordingLog(handleOrLog) {
    const log = Array.isArray(handleOrLog) ? handleOrLog : handleOrLog.log;
    const meta = Array.isArray(handleOrLog) ? new Map() : (handleOrLog.slotMeta || new Map());
    // *** ONE OBJECT PER SLOT, AND THE GATE CAUGHT ME NOT DOING IT. *** normalize() symbolises by object
    // IDENTITY, so handing it a fresh {slot:...} literal per call made the same program read as obj#1 and
    // obj#2 -- and a diff between two such traces would have been noise wearing the shape of evidence.
    const interned = new Map();
    const objFor = (ref) => {
        if (interned.has(ref)) return interned.get(ref);
        const m = meta.get(ref);
        // Rebuilt in makeRecordingGL's own vocabulary: __obj for a created resource, __uniform for a location.
        const o = (m && m.name) ? { __uniform: m.name }
            : (m && /^create/.test(m.op)) ? { __obj: m.op }
            : { __obj: "create" + ref.slice(0, ref.lastIndexOf("#")).replace(/^WebGL/, "") };
        interned.set(ref, o);
        return o;
    };
    const arg = (a) => {
        if (TYPED(a)) return summarise(a);
        if (a && typeof a.slot === "string") return objFor(a.slot);
        return a;
    };
    return log.map((c) => ({ op: c.op, args: c.args.map(arg) }));
}
