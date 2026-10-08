// WebGLEngine/render/denoiseCache.mjs -- the denoiser arc: a harvest that can be interrupted and resumed, exactly
//
// Gated by render/denoiseCache-selfcheck.mjs. Round 7's harvest needs about 2.1 hours on a slow box, and a background
// run is stopped at 2: its first run reached "measured" and was stopped in the secondaries, before the results file is
// written, so nothing was read (pre-registration section 24). Containers have restarted under two earlier harvests.
// This module lets render/denoiseStudy.mjs keep every expensive DETERMINISTIC piece -- a rendered scene, a tuned filter,
// a trained network -- in a directory, keyed by everything that piece depends on, so the same command run again
// resumes where the last one stopped and computes nothing twice.
//
// EXACT, NOT CLOSE. Every Float64Array is written as its own bytes, so -0, NaN payloads and every last bit come back
// as they went. Numbers outside arrays go through JSON, which gives every finite double back exactly; -0 and the
// non-finite ones, which JSON would turn into 0 and null, are tagged. Anything else it could not give back as it was
// -- another typed array, a function, a Map, a class instance -- is refused when it is saved, not lost. A record that
// does not read back exactly is a different computation, and the gate holds a resumed run to the uninterrupted one,
// bit for bit.
"use strict";
import fs from "node:fs";
import path from "node:path";

/**
 * A 64-bit FNV-1a-style hash, as 16 hex digits, of a list of Float64Arrays, numbers and strings -- over their exact
 * bytes, so two inputs that differ in one bit (or in -0 against 0) hash apart. It is a cache key, not a security property.
 */
export function hashArrays(items) {
    let h1 = 0x811c9dc5 >>> 0, h2 = 0xcbf29ce4 >>> 0;
    const mix = (u) => {
        h1 = Math.imul(h1 ^ (u & 0xffff), 0x01000193) >>> 0; h1 = Math.imul(h1 ^ (u >>> 16), 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ (u >>> 16), 0x01000193) >>> 0; h2 = Math.imul(h2 ^ (u & 0xffff) ^ h1, 0x01000193) >>> 0;
    };
    for (const it of items) {
        if (typeof it === "string") { mix(0xfffffffe); mix(it.length); for (let i = 0; i < it.length; i++) mix(it.charCodeAt(i)); continue; }
        const a = typeof it === "number" ? Float64Array.of(it) : it;
        if (!(a instanceof Float64Array)) throw new Error("denoiseCache: hashArrays takes Float64Arrays, numbers and strings");
        const u = new Uint32Array(a.buffer, a.byteOffset, a.length * 2);
        mix(a.length);
        for (let i = 0; i < u.length; i++) mix(u[i]);
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// A record is any mix of plain values, arrays, plain objects and Float64Arrays. Float64Arrays go to one binary blob; the
// rest to JSON, with each array replaced by its place in the blob and -0 and each non-finite number tagged.
function encode(v, blobs) {
    if (v instanceof Float64Array) { blobs.push(v); return { __f64: blobs.length - 1 }; }
    if (v instanceof Int32Array || v instanceof Uint8Array) return { __int: v.constructor.name, v: Array.from(v) };
    if (ArrayBuffer.isView(v)) throw new Error(`denoiseCache: a ${v.constructor.name} is not kept exactly -- only Float64Array, Int32Array and Uint8Array are`);
    if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") throw new Error(`denoiseCache: a ${typeof v} cannot be saved`);
    if (typeof v === "number" && !Number.isFinite(v)) return { __num: String(v) };
    if (typeof v === "number" && Object.is(v, -0)) return { __num: "-0" };
    if (Array.isArray(v)) return v.map((x) => encode(x, blobs));
    if (v && typeof v === "object") {
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) throw new Error(`denoiseCache: a ${v.constructor?.name ?? "class"} instance is not a plain object and cannot be saved`);
        const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = encode(x, blobs); return o;
    }
    return v;
}
function decode(v, arrays) {
    if (Array.isArray(v)) return v.map((x) => decode(x, arrays));
    if (v && typeof v === "object") {
        if ("__f64" in v) return arrays[v.__f64];
        if ("__int" in v) return v.__int === "Int32Array" ? Int32Array.from(v.v) : Uint8Array.from(v.v);
        if ("__num" in v) return v.__num === "-0" ? -0 : Number(v.__num);
        const o = {}; for (const [k, x] of Object.entries(v)) o[k] = decode(x, arrays); return o;
    }
    return v;
}

const fileOf = (dir, key) => path.join(dir, key.replace(/[^A-Za-z0-9._-]/g, "_"));

/** Write a record under `key` in `dir`: <key>.bin, then <key>.json -- the JSON last, so a write torn between them reads as none. */
export function saveRecord(dir, key, value) {
    fs.mkdirSync(dir, { recursive: true });
    const blobs = [], meta = encode(value, blobs), base = fileOf(dir, key);
    const total = blobs.reduce((a, b) => a + b.length, 0), all = new Float64Array(total);
    let at = 0; const offsets = blobs.map((b) => { all.set(b, at); const o = at; at += b.length; return o; });
    fs.rmSync(base + ".json", { force: true });
    fs.writeFileSync(base + ".bin", Buffer.from(all.buffer, all.byteOffset, all.byteLength));
    fs.writeFileSync(base + ".json.tmp", JSON.stringify({ key, offsets, lengths: blobs.map((b) => b.length), meta }));
    fs.renameSync(base + ".json.tmp", base + ".json");
}

/** The record under `key` in `dir`, exactly as saved, or null when there is none (or it is another key's). */
export function loadRecord(dir, key) {
    const base = fileOf(dir, key);
    if (!fs.existsSync(base + ".json") || !fs.existsSync(base + ".bin")) return null;
    const head = JSON.parse(fs.readFileSync(base + ".json", "utf8"));
    if (head.key !== key) return null;
    const buf = fs.readFileSync(base + ".bin");
    if (buf.byteLength !== 8 * head.lengths.reduce((a, n) => a + n, 0)) return null;
    const all = new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const arrays = head.offsets.map((o, i) => all.slice(o, o + head.lengths[i]));
    return decode(head.meta, arrays);
}

/**
 * A cache in `dir` for one run: { dir, hits, misses }. `stamp` names the run (the results file, the commit); a
 * directory stamped for another run is refused, so a cache never serves one round's pieces to another, or one
 * commit's to the next.
 */
export function openCache(dir, stamp) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "stamp.json"), want = JSON.stringify(stamp);
    if (fs.existsSync(file)) {
        const have = fs.readFileSync(file, "utf8");
        if (have !== want) throw new Error(`denoiseCache: ${dir} is stamped ${have}, not ${want} -- another run's cache`);
    } else fs.writeFileSync(file, want);
    return { dir, hits: 0, misses: 0 };
}

/** compute() once per key: the saved record when the cache holds one, else compute, save and return it. No cache, no saving. */
export function cached(cache, key, compute) {
    if (!cache) return compute();
    const hit = loadRecord(cache.dir, key);
    if (hit !== null) { cache.hits++; return hit; }
    const v = compute();
    saveRecord(cache.dir, key, v);
    cache.misses++;
    return v;
}
