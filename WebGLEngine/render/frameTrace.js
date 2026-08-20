// render/frameTrace.js
//
// A FRAME AS A REPLAYABLE ARTIFACT (v3060). The other half of the GacUI idea: their Remote Protocol lets a run
// be "written down as a trace of all UI activities". v3058 recorded the calls; this makes the recording
// COMPARABLE, which is what turns a log into evidence.
//
// This tree already has the discipline twice over and neither instance covered rendering:
//   box3dSyncCompare  -- physics lockstep, reports divergedAt rather than resynchronising past it
//   brain-replay      -- the brain's own steps, replayed and audited
// A frame is the third thing that should be diffable, and until now it was the only one that needed a GPU to
// look at. It does not. What a frame IS, is the sequence of commands it issues.
//
// THE WHOLE PROBLEM IS NORMALISATION. A raw log is not comparable with itself: gl.createProgram() returns a
// fresh object every run, so two identical frames produce two logs full of distinct object identities and every
// diff is 100% different. Normalising replaces each handle with a stable symbolic name assigned in order of
// first appearance -- prog#1, tex#2, u:uVolume -- so identity becomes STRUCTURE. Two runs of the same frame then
// produce byte-identical traces, and any difference that survives is a real one.
//
// WHAT A TRACE PROVES, and what it does not: that two frames issued the same commands. Not that either drew the
// right picture. It is the rendering equivalent of a lockstep hash -- enormously useful for "did this change
// alter the frame?" and silent about "is the frame correct?". Pixels remain a rig concern.
//
// Browser-safe: imports only ./glBootstrap.js.

import { makeRecordingGL, nameOf } from "./glBootstrap.js";

/** Normalise one recorded log into a stable, comparable trace. */
export function normalize(log, opts = {}) {
    const ids = new Map();          // object -> symbolic name
    const counters = {};
    const symbol = (o) => {
        if (ids.has(o)) return ids.get(o);
        const kind = o.__uniform ? "u" : (o.__obj ? String(o.__obj).replace(/^create/, "").toLowerCase() : "obj");
        const nm = o.__uniform ? ("u:" + o.__uniform) : (kind + "#" + (counters[kind] = (counters[kind] || 0) + 1));
        ids.set(o, nm);
        return nm;
    };
    const arg = (a) => {
        if (a === null) return null;
        if (typeof a === "object") {
            if (a.typed) return a.typed + "[" + a.length + "]#" + a.checksum;   // summarised buffer
            return symbol(a);
        }
        if (typeof a === "number") {
            const n = nameOf(a);
            if (typeof n === "string") return n;                                 // a GL constant, by name
            // Float noise would make every trace differ for no reason; the precision is a stated choice, not a
            // fudge, and traces record it so two traces at different precisions are never compared.
            return Number.isInteger(a) ? a : +a.toFixed(opts.precision == null ? 6 : opts.precision);
        }
        return a;
    };
    return log.map((c) => c.op + "(" + c.args.map(arg).map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ") + ")");
}

/**
 * Run a frame against a recording context and return { trace, log, calls, fingerprint, precision }.
 * fn receives the gl and does whatever a frame does.
 */
export function traceFrame(fn, opts = {}) {
    const rec = makeRecordingGL(opts.canvas || { width: 64, height: 64 }, opts);
    fn(rec.gl, rec);
    const precision = opts.precision == null ? 6 : opts.precision;
    const trace = normalize(rec.log, { precision });
    return { trace, log: rec.log, calls: rec.log.length, fingerprint: fingerprint(trace), precision };
}

/** FNV-1a over the normalised trace. Equal fingerprints mean equal traces; unequal means look at the diff. */
export function fingerprint(trace) {
    let h = 2166136261;
    for (const line of trace) for (let i = 0; i < line.length; i++) { h ^= line.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Compare two traces and report WHERE they part company, not merely that they do.
 * Returns { same, index, a, b, lengthA, lengthB, reason }.
 *
 * The divergedAt discipline, deliberately: box3dSyncCompare exists because "these two runs differ" is not
 * actionable and "they differ first at step 41, here is each side" is. A boolean would have been less code and
 * no use.
 */
export function diffTraces(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) return { same: false, index: i, a: a[i], b: b[i], lengthA: a.length, lengthB: b.length, reason: "first differing command" };
    }
    if (a.length !== b.length) {
        return {
            same: false, index: n, a: a[n] || null, b: b[n] || null, lengthA: a.length, lengthB: b.length,
            reason: "identical for " + n + " commands, then one side " + (a.length > b.length ? "continued" : "stopped"),
        };
    }
    return { same: true, index: -1, a: null, b: null, lengthA: a.length, lengthB: b.length, reason: "identical" };
}

export function describeDiff(d) {
    if (d.same) return "traces identical (" + d.lengthA + " commands)";
    return "DIVERGED at command " + d.index + " of " + d.lengthA + "/" + d.lengthB + " -- " + d.reason +
        "\n    A: " + (d.a === null ? "(end)" : d.a) +
        "\n    B: " + (d.b === null ? "(end)" : d.b);
}
