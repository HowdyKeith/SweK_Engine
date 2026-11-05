// WebGLEngine/tools/roundhouse/angularImpulseWatch.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PART OF THE ANGULAR-IMPULSE CENSUS'S HOOK THAT NODE AND A PAGE SHARE, as physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md
// registers the census. It wraps box3d's own export, _swk_body_ang_impulse, on one box3d instance; after each call it reads the body's
// spin back from box3d and puts the call to its site, the first frame of the call's stack outside the hook and the three pass-throughs.
//
// PLAIN JAVASCRIPT, NO NODE IMPORTS: a page imports this file as it is, from /tools/roundhouse/angularImpulseWatch.mjs. Node's half
// (the loader hook, the tallies written to disk) is angularImpulseHook.mjs; the census itself is angularImpulseCensus.mjs.
"use strict";

/** Jolt's default max angular velocity, rad/s, and debrisPhysics.js's slack: a call is PAST THE CAP when it leaves more than PAST. */
export const MAX_SPIN = 15 * Math.PI, SPIN_SLACK = 1.001, PAST = MAX_SPIN * SPIN_SLACK;
/** Three functions that hand a call on to box3d unchanged: a call through one belongs to whoever called it. Matched by file and name. */
export const PASS_THROUGHS = Object.freeze([
    Object.freeze({ file: "physics/box3d/box3dLoader.js", fn: "angularImpulse", what: "the facade" }),
    Object.freeze({ file: "render/slugTicker.mjs", fn: "angularImpulse", what: "the slug ticker's raw world, which skips the loader" }),
    Object.freeze({ file: "physics/kaijuBox3d.js", fn: "angularImpulse", what: "the kaiju's angularImpulse(rec, v)" }),
]);
/** The hook's own files: their frames are never a site. */
export const HOOK_FILES = Object.freeze(["tools/roundhouse/angularImpulseWatch.mjs", "tools/roundhouse/angularImpulseHook.mjs"]);

/** One V8 stack line -> { fn, url, line, col }, or null for a line that is not a frame. */
export function parseFrame(text) {
    const m = /^\s*at (?:async )?(?:(.+?) \()?((?:[a-z][a-z0-9+.-]*:)?[^()]*?):(\d+):(\d+)\)?\s*$/i.exec(text);
    return m ? { fn: m[1] || "", url: m[2], line: +m[3], col: +m[4] } : null;
}
/** A frame's file, relative to the tree when its URL begins with one of `roots` (a page's own origin, or the tree's file URL). */
export function relOf(url, roots) {
    const u = String(url).split(/[?#]/)[0];
    for (const r of roots) if (u.startsWith(r)) return decodeURIComponent(u.slice(r.length));
    return u;
}
const isPass = (f) => PASS_THROUGHS.some((p) => f.file === p.file && (f.fn === p.fn || f.fn.endsWith("." + p.fn)));
/**
 * A call's site from its stack: the first frame outside the hook's own files and the pass-throughs. `via` is the pass-throughs it went
 * through, innermost first; `above` the frames after the site, for context.
 */
export function siteOf(stack, roots) {
    const frames = String(stack).split("\n").map(parseFrame).filter(Boolean).map((f) => ({ ...f, file: relOf(f.url, roots) }));
    const via = [];
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (HOOK_FILES.includes(f.file)) continue;
        if (isPass(f)) { via.push(`${f.file}:${f.line}`); continue; }
        return { site: `${f.file}:${f.line}`, file: f.file, line: f.line, via, above: frames.slice(i + 1, i + 5).map((g) => `${g.file}:${g.line}`) };
    }
    return { site: "(no frame)", file: "", line: 0, via, above: [] };
}

/** A tally: what one process (or one page) saw. */
export function newTally(run = null) { return { run, instances: 0, calls: 0, unread: 0, sites: {} }; }

/** Merge tallies site by site: calls and counts add, the largest spin and where it was seen are kept. */
export function mergeTallies(tallies) {
    const out = newTally(null);
    for (const t of tallies) {
        if (!t) continue;
        out.instances += t.instances || 0; out.calls += t.calls || 0; out.unread += t.unread || 0;
        for (const [site, e] of Object.entries(t.sites || {})) {
            const o = out.sites[site] || (out.sites[site] = { calls: 0, past: 0, nan: 0, max: -1, maxAt: null });
            o.calls += e.calls; o.past += e.past; o.nan += e.nan || 0;
            if (e.max > o.max) { o.max = e.max; o.maxAt = { ...e.maxAt, run: e.maxAt && e.maxAt.run != null ? e.maxAt.run : t.run }; }
        }
    }
    return out;
}

/**
 * Wrap box3d's _swk_body_ang_impulse on module `m`, recording into tally `T`. The call goes through to box3d unchanged and its result is
 * returned; the spin is then read back through _swk_ang_velocities into a buffer of the hook's own. `roots` names the tree for siteOf.
 */
export function watchModule(m, T, roots) {
    if (!m || typeof m._swk_body_ang_impulse !== "function" || m.__angWatched) return m;
    const orig = m._swk_body_ang_impulse;
    let ptr = 0, cap = 0;
    const spinOf = (idx) => {
        if (typeof m._swk_ang_velocities !== "function" || typeof m._swk_body_count !== "function") return null;
        const n = m._swk_body_count(), bytes = Math.max(1, n) * 12;
        if (bytes > cap) { if (ptr) m._free(ptr); ptr = m._malloc(bytes); cap = bytes; }
        m._swk_ang_velocities(ptr);
        const f = new Float32Array(m.HEAPF32.buffer, ptr, n * 3);
        return { spin: Math.hypot(f[idx * 3], f[idx * 3 + 1], f[idx * 3 + 2]), bodies: n };
    };
    m._swk_body_ang_impulse = function (idx, x, y, z) {
        const r = orig.call(this, idx, x, y, z);
        const read = spinOf(idx);
        const limit = Error.stackTraceLimit; Error.stackTraceLimit = 40;
        const stack = new Error().stack;
        Error.stackTraceLimit = limit;
        const s = siteOf(stack, roots);
        T.calls++;
        const e = T.sites[s.site] || (T.sites[s.site] = { calls: 0, past: 0, nan: 0, max: -1, maxAt: null });
        e.calls++;
        if (!read) { T.unread++; return r; }
        if (Number.isNaN(read.spin)) e.nan++;
        else {
            if (read.spin > PAST) e.past++;
            if (read.spin > e.max) e.max = read.spin, e.maxAt = { spin: read.spin, impulse: [x, y, z], idx, bodies: read.bodies, via: s.via, above: s.above, run: T.run };
        }
        return r;
    };
    m.__angWatched = true;
    T.instances++;
    return m;
}
