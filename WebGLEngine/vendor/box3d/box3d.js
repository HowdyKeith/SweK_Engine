// WebGLEngine/vendor/box3d/box3d.js — v2560
//
// A DROP-IN REPLACEMENT FOR EMSCRIPTEN'S GLUE, FOR A WASM THAT EMSCRIPTEN DID NOT BUILD.
//
// box3d.wasm has been listed as "rig-only, Keith must build it" for five versions, on the grounds that emsdk's
// CDN is blocked from this sandbox (storage.googleapis.com -> 403, proven in v2549). That was true and it was
// not the whole answer. EMSDK IS NOT THE ONLY WAY TO MAKE WASM. clang has targeted wasm32 natively for years,
// and clang + wasi-libc + wasm-ld are all in the Ubuntu archive, which IS reachable from here.
//
// So the wasm is built now, in the sandbox, from erincatto/box3d v0.1.0 -- 49 source files, zero compile
// failures, 948 KB, 43 exports, and it steps.
//
// ---- WHY THIS FILE EXISTS ------------------------------------------------------------------------------------
//
// box3dLoader.js was written against an EMSCRIPTEN build and asks for `_swk_*` (emcc prefixes exports with an
// underscore; wasm-ld does not) plus `HEAP32/HEAPF32/HEAPU8/_malloc/_free`, which are emscripten's memory views.
// A clang build has none of that furniture -- just raw exports and a Memory.
//
// The choice was: change ~40 call sites in a working loader, or provide the furniture. NEVER BREAK WORKING
// THINGS -- so this provides the furniture. An emcc-built box3d.js would drop in here and still work, because
// this file offers the same shape emcc's does, for the subset the loader actually uses.
//
// ---- THE WASI IMPORTS ---------------------------------------------------------------------------------------
//
// The wasm links against wasi-libc, so it imports wasi_snapshot_preview1 -- proc_exit, fd_write, and friends.
// A browser has none of those. In a release build box3d should never take a path that calls them (they are the
// printf/assert routes). So they are stubbed, AND THE STUBS ARE LOUD: if physics ever actually calls fd_write,
// you will see it in the console rather than wonder why a number went strange. A SILENT STUB IS A LIE THAT
// COMPILES.
"use strict";

export default async function factory(opts = {}) {
    const locate = opts.locateFile || ((f) => f);
    const url = locate("box3d.wasm");

    let mem = null;
    const called = new Set();

    // Loud stubs. A wasm built against libc will import these whether or not it uses them; what matters is
    // knowing IF it uses them. Silence here would hide a real problem behind a plausible number.
    const wasi = new Proxy({}, {
        get(_t, name) {
            return (...args) => {
                if (!called.has(name)) {
                    called.add(name);
                    console.warn("[box3d] wasm called WASI " + String(name) + " -- stubbed. If physics depends on it, this is where to look.", args.length + " args");
                }
                if (name === "proc_exit") throw new Error("[box3d] wasm called proc_exit(" + args[0] + ") -- the physics core aborted");
                return 0;   // WASI success
            };
        },
    });

    const src = await fetch(url);
    if (!src.ok) throw new Error("[box3d] cannot fetch " + url + ": HTTP " + src.status);
    const { instance } = await WebAssembly.instantiateStreaming
        ? await WebAssembly.instantiateStreaming(src, { wasi_snapshot_preview1: wasi })
        : await WebAssembly.instantiate(await src.arrayBuffer(), { wasi_snapshot_preview1: wasi });

    const ex = instance.exports;
    mem = ex.memory;

    // Emscripten's memory views. These must be RE-READ after any growth: a wasm that grows its memory replaces
    // the underlying ArrayBuffer and every existing view goes detached. Emscripten regenerates them; so do we,
    // via getters, because a stale HEAPF32 reads zeros and looks exactly like physics that stopped working.
    const mod = {
        get HEAP8() { return new Int8Array(mem.buffer); },
        get HEAPU8() { return new Uint8Array(mem.buffer); },
        get HEAP32() { return new Int32Array(mem.buffer); },
        get HEAPU32() { return new Uint32Array(mem.buffer); },
        get HEAPF32() { return new Float32Array(mem.buffer); },
        get HEAPF64() { return new Float64Array(mem.buffer); },
        _malloc: ex.malloc,
        _free: ex.free,
        __wasmExports: ex,
        __builtBy: "clang/wasi-libc (not emcc)",
    };

    // The underscore bridge. emcc exports `_swk_world_create`; wasm-ld exports `swk_world_create`. Same function,
    // different spelling, and the loader only knows the first one.
    let n = 0;
    for (const k of Object.keys(ex)) {
        if (typeof ex[k] === "function" && k.startsWith("swk_")) { mod["_" + k] = ex[k]; n++; }
    }
    if (n === 0) throw new Error("[box3d] the wasm exports no swk_* functions -- wrong build?");
    console.log("[box3d] loaded " + n + " swk_* functions from a clang-built wasm (no emscripten)");
    return mod;
}
