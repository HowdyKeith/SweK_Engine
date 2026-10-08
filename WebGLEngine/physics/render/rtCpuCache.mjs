// WebGLEngine/physics/render/rtCpuCache.mjs -- the f64 reference means rtPipeline-selfcheck compares its GPU means
// against, kept between runs.
//
// Run: node physics/render/rtCpuCache.mjs              what the caches hold, for this box's math and today's renderer
//      node physics/render/rtCpuCache.mjs --promote    fold this box's local entries into the committed cache
//
// *** WHY. *** tools/ship/rtPipelineDiag.mjs, run whole at v4814, put the gate at 66 s here, and 34 s of it was the gate's
// own CPU work: renderSbtCpu, 139 calls and 26 s, of which 129 had distinct inputs. A memo inside one run saves the 10
// repeats (2.3 s) and nothing else. The renders are deterministic -- seeded, f64, no clock -- so the same inputs on the
// same code and the same math give the same mean, and a run that has already paid for one has no reason to pay again.
//
// *** WHAT MAKES A CACHED MEAN THE SAME MEAN, AND THE KEY CARRIES ALL THREE. ***
//   1. THE INPUTS -- the scene record, view, spp, seed and options, serialised. A callback (a sky) cannot be serialised
//      faithfully, so a call that passes one is never cached; it is computed and counted.
//   2. THE RENDERER -- a hash of physics/render/rtPipeline.mjs's text and of every module its static imports reach. A
//      change to any of them is a different renderer, and every key misses.
//   3. THE MATH -- a fingerprint of Math.sin, log, pow, hypot and the rest on fixed inputs. V8 implements these itself and
//      has changed their last bit between versions (Chrome 153's log10 moved the frame caches' dB by an ulp), and the rig
//      runs another Node than this box. A different fingerprint reads its own entries, never another's. MEASURED: Node
//      22 (V8 12.4, this box) and Node 24 (V8 13.6, the rig's line) differ in Math.pow on 19 of the fingerprint's 144
//      inputs and in nothing else it asks -- and all 112 cached means came out identical on both. So the separation
//      is a guard and not, for these renders today, a necessity; the committed file carries both sections.
//
// *** AND IT IS CHECKED, NOT TRUSTED. *** Every run recomputes a slice of what it served -- the entries whose key falls in
// this run's eighth, rotating -- and each must come back bit for bit. A mismatch is the gate's red, not a log line.
//
// Misses go to a per-box file beside the committed one (gitignored), so a box pays for each mean once; --promote moves
// them into the committed file, which then serves every clone with the same renderer and math. Node-only (fs, crypto).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const ENTRY = "physics/render/rtPipeline.mjs";
export const COMMITTED = "physics/render/rtPipeline-cpu-cache.json";
export const LOCAL = "physics/render/rtPipeline-cpu-cache.local.json";
export const SLICES = 8;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Every module ENTRY's static imports reach, inside the tree, sorted, with its text's hash. */
export function sourceClosure(entry = ENTRY, root = ENG, read = (p) => fs.readFileSync(p, "utf8")) {
    const seen = new Map(), stack = [path.join(root, entry)];
    while (stack.length) {
        const abs = stack.pop();
        if (seen.has(abs)) continue;
        const text = read(abs);
        seen.set(abs, sha(text));
        for (const m of text.matchAll(/^\s*import\s+(?:[^"';]*?\sfrom\s+)?["'](\.{1,2}\/[^"']+)["']/gm))
            stack.push(path.resolve(path.dirname(abs), m[1]));
    }
    const files = [...seen].map(([abs, h]) => [path.relative(root, abs).split(path.sep).join("/"), h]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return { files: files.map((f) => f[0]), hash: sha(JSON.stringify(files)).slice(0, 16) };
}

/** The last bits of the Math functions V8 implements itself, on fixed inputs. */
export function mathPrint(M = Math) {
    const xs = [];
    for (let i = 1; i <= 48; i++) xs.push(i * 0.7368421 - 17.3, 1 / (i * 1.618033988749895), i * 1e-3 + 0.5);
    const out = [];
    for (const x of xs) out.push(M.sin(x), M.cos(x), M.tan(x), M.exp(x / 20), M.log(Math.abs(x) + 1e-9), M.pow(Math.abs(x) + 0.1, 2.4),
        M.atan2(x, 0.37), M.acos(Math.max(-1, Math.min(1, x / 18))), M.asin(Math.max(-1, Math.min(1, x / 18))), M.atan(x),
        M.hypot(x, 0.6, 1.3), M.cbrt(x), M.expm1(x / 30), M.log1p(Math.abs(x)), M.sinh(x / 9), M.cosh(x / 9), M.tanh(x));
    const buf = new Float64Array(out);
    return sha(Buffer.from(buf.buffer)).slice(0, 16);
}

const ser = (v) => JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x));
/** The cache key for one call's parts -- exported so the gate can show a seed or a view moves it. */
export const keyOf = (parts) => sha(ser(parts)).slice(0, 24);
const hasFn = (v) => typeof v === "function" || (v && typeof v === "object" && !ArrayBuffer.isView(v) && Object.values(v).some(hasFn));
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8")); } catch { return null; } };

/**
 * Open the cache for this renderer and this math. `mean(parts, compute)` returns the cached mean for `parts` or computes
 * it; `report()` says what happened; `finish()` writes this box's misses (and the rotation) to the local file.
 */
export function openCpuCache({ committed = COMMITTED, local = LOCAL, slices = SLICES, write = true } = {}) {
    const src = sourceClosure(), math = mathPrint(), section = `${src.hash}:${math}`;
    const C = readJson(committed) || { sections: {} }, L = readJson(local) || { sections: {}, rotation: 0 };
    const fromCommitted = (C.sections[section] || {}).means || {}, fromLocal = (L.sections[section] || {}).means || {};
    const slice = (L.rotation || 0) % slices;
    const stats = { section, slice, hits: 0, misses: 0, uncacheable: 0, checked: 0, mismatched: [], fresh: {}, msComputed: 0 };
    const mean = (parts, compute) => {
        if (hasFn(parts)) { stats.uncacheable++; return compute(); }
        const key = keyOf(parts);
        const have = Object.prototype.hasOwnProperty.call(fromCommitted, key) ? fromCommitted[key]
                   : Object.prototype.hasOwnProperty.call(fromLocal, key) ? fromLocal[key] : undefined;
        if (have !== undefined) {
            stats.hits++;
            if (parseInt(key.slice(0, 6), 16) % slices === slice) {        // this run's slice: recompute and compare
                const t0 = performance.now(), v = compute(); stats.msComputed += performance.now() - t0;
                stats.checked++;
                if (!Object.is(v, have)) stats.mismatched.push({ key, cached: have, now: v });
                return v;
            }
            return have;
        }
        stats.misses++;
        const t0 = performance.now(), v = compute(); stats.msComputed += performance.now() - t0;
        stats.fresh[key] = v;
        return v;
    };
    const finish = () => {
        if (!write) return;
        const sec = L.sections[section] || (L.sections[section] = { renderer: src.files.length + " files", means: {} });
        Object.assign(sec.means, stats.fresh);
        L.rotation = (L.rotation || 0) + 1;
        for (const k of Object.keys(L.sections)) if (!k.startsWith(src.hash + ":")) delete L.sections[k];   // another renderer's means are dead
        try { fs.writeFileSync(path.join(ENG, local), JSON.stringify(L, null, 1) + "\n"); } catch {}
    };
    return { section, src, math, mean, stats, finish, sizes: { committed: Object.keys(fromCommitted).length, local: Object.keys(fromLocal).length } };
}

/** Move this box's local means for today's renderer and math into the committed file, dropping dead renderers there. */
export function promote({ committed = COMMITTED, local = LOCAL } = {}) {
    const src = sourceClosure(), section = `${src.hash}:${mathPrint()}`;
    const C = readJson(committed) || { note: "rtCpuCache.mjs -- see its header. Keyed renderer-hash:math-print; a mean is a double, JSON round-trips it exactly.", sections: {} };
    const L = readJson(local) || { sections: {} };
    const mine = (L.sections[section] || {}).means || {};
    const sec = C.sections[section] || (C.sections[section] = { renderer: src.files.length + " files", means: {} });
    const before = Object.keys(sec.means).length;
    Object.assign(sec.means, mine);
    for (const k of Object.keys(C.sections)) if (!k.startsWith(src.hash + ":")) delete C.sections[k];
    const sorted = {}; for (const k of Object.keys(sec.means).sort()) sorted[k] = sec.means[k]; sec.means = sorted;
    fs.writeFileSync(path.join(ENG, committed), JSON.stringify(C, null, 1) + "\n");
    return { section, before, after: Object.keys(sec.means).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes("--promote")) { const r = promote(); console.log(`[rtCpuCache] ${r.section}: committed ${r.before} -> ${r.after} means`); }
    else {
        const c = openCpuCache({ write: false });
        console.log(`[rtCpuCache] renderer ${c.src.hash} over ${c.src.files.length} files, math ${c.math}`);
        console.log(`[rtCpuCache] for this pair: ${c.sizes.committed} committed means, ${c.sizes.local} local`);
    }
}
