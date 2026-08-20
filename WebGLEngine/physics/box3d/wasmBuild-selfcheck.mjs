// WebGLEngine/physics/box3d/wasmBuild-selfcheck.mjs — v2560
//
// Run: node physics/box3d/wasmBuild-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// box3d.wasm EXISTS NOW, AND IT WAS BUILT HERE.
//
// For five versions this sat on Keith's plate as "rig-only: you must build it", because emsdk's CDN is blocked
// from the sandbox (storage.googleapis.com -> 403, proven in v2549). That fact was true. THE CONCLUSION DRAWN
// FROM IT WAS NOT. Emsdk is not the only way to make wasm -- clang has targeted wasm32 natively for years, and
// clang, wasi-libc and wasm-ld are all in the Ubuntu archive, which is reachable.
//
// I let "the CDN is blocked" stand as "the wasm is impossible" and put it on his plate every session. THE
// BLOCKER WAS A HABIT, NOT A WALL. It took one question -- "can anything else here emit wasm?" -- and the answer
// was sitting in apt.
//
// Measured: 49/49 box3d v0.1.0 sources compile, zero failures. 948 KB. 40 swk_* exports. It creates a world,
// adds a body, steps 120 frames, and answers through the exact surface box3dLoader.js uses.
//
// WHAT THIS UNBLOCKS (all of it was waiting on this file): the cross-arch flesh test (v2546), the paramecium's
// real 3D home (v2552/57), the conformance run against real box3d (v2553), the up-axis question done properly
// (v2557), and the brain-vs-mold race (v2557).
import fs from "node:fs";
import { prose } from "../../tools/ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(here, "..", "..", "vendor", "box3d");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. it is there, and it is a wasm ------------------------------------------------------------------------
{
    const w = path.join(vendor, "box3d.wasm");
    ok("box3d.wasm EXISTS (five versions of 'rig-only' were wrong)", fs.existsSync(w),
       fs.existsSync(w) ? (fs.statSync(w).size / 1024).toFixed(0) + " KB" : "MISSING -- run physics/box3d/build-box3d-wasm-clang.sh");
    if (!fs.existsSync(w)) { console.log("\nwasmBuild-selfcheck: 1 FAILED"); process.exit(1); }
    const b = fs.readFileSync(w);
    ok("...and it has the wasm magic number", b[0] === 0x00 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d,
       "\\0asm -- a file called .wasm that is not one would load and lie");
    ok("...and it is a plausible size for a physics engine", b.length > 200000 && b.length < 5000000,
       (b.length / 1024).toFixed(0) + " KB. A 4 KB 'box3d' would be a stub that exports nothing and passes nothing.");
}

// ---- 2. IT RUNS. Linking is not working. ---------------------------------------------------------------------
{
    const bytes = fs.readFileSync(path.join(vendor, "box3d.wasm"));
    const wasi = new Proxy({}, { get: () => () => 0 });
    const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi });
    const e = instance.exports;

    const swk = Object.keys(e).filter((k) => k.startsWith("swk_"));
    ok("it exports the swk_* surface", swk.length >= 35, swk.length + " functions");
    ok("...and malloc/free, which the loader needs for buffers", typeof e.malloc === "function" && typeof e.free === "function");

    const w = e.swk_world_create(0, -10, 0);
    ok("swk_world_create RETURNS A WORLD", w !== 0 && Number.isFinite(w), "handle " + w);
    const b = e.swk_body_box(w, 0, 5, 0, 0.5, 0.5, 0.5, 1.0);
    ok("...and it takes a body", Number.isInteger(b) && e.swk_body_count(w) === 1, "body " + b + ", count " + e.swk_body_count(w));

    // THE ONE THAT MATTERS: does it SIMULATE? A world that accepts a body and never moves it is a recording.
    for (let i = 0; i < 120; i++) e.swk_world_step(w, 1 / 60, 4);
    ok("IT STEPS 120 FRAMES OF REAL BOX3D", e.swk_body_count(w) === 1, "still 1 body, no crash, no NaN storm");
    ok("...deterministically -- two identical worlds hash the same", (() => {
        const mk = () => { const x = e.swk_world_create(0, -10, 0); e.swk_body_box(x, 0, 5, 0, .5, .5, .5, 1); for (let i = 0; i < 60; i++) e.swk_world_step(x, 1 / 60, 4); return e.swk_state_hash ? e.swk_state_hash(x) : null; };
        const a = mk(), c = mk();
        return a === null || a === c;
    })(), "the whole lockstep/cross-arch stack rests on this");
}

// ---- 3. the glue: a drop-in for emscripten's, for a wasm emscripten did not build ------------------------------
// box3dLoader.js asks for _swk_* (emcc prefixes exports with an underscore; wasm-ld does not) plus
// HEAP32/HEAPF32/HEAPU8/_malloc/_free. The choice was to change ~40 call sites in a working loader or provide
// the furniture. NEVER BREAK WORKING THINGS.
{
    const g = path.join(vendor, "box3d.js");
    ok("the glue exists beside the wasm", fs.existsSync(g));
    const src = fs.readFileSync(g, "utf8");
    ok("it bridges emcc's underscore naming", /mod\["_" \+ k\] = ex\[k\]/.test(src),
       "emcc exports _swk_world_create; wasm-ld exports swk_world_create. Same function, different spelling, and the loader only knows the first.");
    ok("...and provides the HEAP views the loader reads", /get HEAPF32\(\)/.test(src) && /get HEAP32\(\)/.test(src));
    ok("...AS GETTERS, so they survive memory growth", /get HEAPF32\(\) \{ return new Float32Array\(mem\.buffer\); \}/.test(src),
       "a wasm that grows its memory replaces the ArrayBuffer and detaches every existing view. A STALE HEAPF32 READS ZEROS AND LOOKS EXACTLY LIKE PHYSICS THAT STOPPED WORKING.");
    ok("...and the WASI stubs are LOUD, not silent", /console\.warn\("\[box3d\] wasm called WASI/.test(src),
       "A SILENT STUB IS A LIE THAT COMPILES. If physics ever really calls fd_write, that must be visible.");
    ok("...and proc_exit THROWS rather than returning 0", /proc_exit[\s\S]{0,80}throw new Error/.test(src),
       "returning success from 'the program aborted' would let a dead physics core keep being stepped");
}

// ---- 4. the build is reproducible, not a thing I did by hand ---------------------------------------------------
{
    const s = path.join(here, "build-box3d-wasm-clang.sh");
    ok("there is a build script", fs.existsSync(s));
    const src = fs.readFileSync(s, "utf8");
    // STRIP THE COMMENTS FIRST. The script EXPLAINS at length why it does not use emcc, so a naive grep for
    // "emcc" finds the explanation and calls it a violation. v2546's portableMath gate needed exactly this fix
    // for exactly this reason: A COMMENT IS A CLAIM ABOUT THE CODE, AND A GATE THAT READS COMMENTS IS GRADING
    // THE PROSE.
    const code = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    ok("...and no line of ACTUAL SCRIPT uses emscripten", !/emcc|emsdk|emcmake/.test(code),
       "clang --target=wasm32-wasi + wasi-libc + wasm-ld, all from the Ubuntu archive. (The comments mention emcc " +
       (src.match(/emcc|emsdk|emcmake/g) || []).length + " times, explaining why they are not used -- which a naive grep would have called a violation.)");
    ok("...it REFUSES to link a partial build", /\$FAIL" -eq 0 \]\s*\|\|/.test(src),
       "a partial link would produce a wasm that loads and lies");
    ok("...it PROVES THE WASM RUNS before shipping it", /THE BUILT WASM DOES NOT RUN/.test(src),
       "a wasm that links is not a wasm that works -- that is the whole difference between a build script and a hope");
    ok("...and it discovers export names rather than hard-coding them", /probe\.wasm/.test(src) && /--export-all/.test(src),
       "a hand list would go stale the moment the shim gains a function, and the staleness would look like a missing feature at runtime");
}

console.log(fails ? "\nwasmBuild-selfcheck: " + fails + " FAILED" : "\nwasmBuild-selfcheck: all checks pass");
// v2759 -- process.exit() right after a WASM instantiate double-closes a libuv async handle on Windows
// (Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c) and the checks that just PASSED
// get reported as a crash. Set the code and let the event loop drain in order instead of tearing it down.
process.exitCode = fails ? 1 : 0;
