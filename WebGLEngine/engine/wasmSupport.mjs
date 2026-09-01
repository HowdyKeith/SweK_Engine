// engine/wasmSupport.mjs -- v4229
//
// ONE PLACE THAT ASKS WHETHER WebAssembly IS ACTUALLY USABLE, and one place that says which of two independent
// things went wrong -- because this tree has now shipped the SAME misattribution defect three times, in three
// files, and twice it was "fixed" in the file where it was noticed and did not travel.
//
// *** WHAT WAS MEASURED, IN A REAL HEADLESS CHROMIUM, BEFORE A LINE OF THIS WAS WRITTEN ***
// The tree was served over http and each loader was called twice: once normally, and once on a page where
// `delete globalThis.WebAssembly` had run first -- which is what Apple's Lockdown Mode does to Safari.
//
//   physics/box3d/box3dLoader.js   WASM present -> ready:true
//                                  WASM absent  -> ready:false, and the reason it gives is:
//     "Box3D WASM not built yet -- run physics/box3d/build-box3d-wasm-clang.sh on a box with clang +
//      wasi-libc, which outputs /vendor/box3d/box3d.{js,wasm}. (WebAssembly is not defined)"
//     *** THE BUILD IS RIGHT THERE AND WORKS. *** vendor/box3d/box3d.wasm is present, and the very same
//     loader returned ready:true from it seconds earlier. The one line a person reads to find out what went
//     wrong sends them to spend an afternoon installing clang and wasi-libc to rebuild a file that is already
//     on disk and already correct. The true cause is four words in a parenthesis after 130 characters of
//     wrong advice.
//
//   physics/jolt/joltLoader.js     WASM absent  -> THROWS a raw "WebAssembly is not defined". Its try/catch
//                                  covers only the choice between the vendored copy and the npm package; the
//                                  init() that actually touches WebAssembly is outside it.
//
//   world/terrainWasm.js           WASM absent  -> ready:false, warns once, JS path. THE MODEL, and it was
//                                  already right. It is not changed by this round.
//
// *** AND THE TREE ALREADY NAMED THIS EXACT DEFECT, TWICE, AND WROTE THE FIX DOWN. ***
// tools/ship/playwrightResolve.mjs exists because browserSafety-selfcheck printed "no chromium at <SHELL>"
// whenever EITHER playwright or the shell was missing, and on that box the shell existed while playwright did
// not -- so the one line anybody reads pointed at a file sitting right there. Its own header says the fix was
// "a LIST tried in order rather than one path, in that one file. IT DID NOT TRAVEL", and then mpmGpuPage was
// found doing it a second time. browserSkipReason() is the answer it settled on: report two independent facts
// on their own evidence rather than collapsing them into one guess. THIS FILE IS THAT ANSWER FOR WASM, and it
// is a shared module for the same reason -- a fix written into box3dLoader.js would be the fourth instance
// waiting to happen.
//
// *** WHAT THIS IS NOT: A POLYFILL. *** evanw/polywasm (MIT) is what prompted the look, and it is REFUSED:
// 3,725 lines of TypeScript that translates .wasm into JavaScript functions with, by its own README, no
// validation and no traps, and "extremely slow". The wasm in this tree is a physics engine, a JavaScript
// engine and a mesh decoder -- exactly the perf-critical kind an interpreter cannot carry. What polywasm is
// FOR is the case where WebAssembly is switched off, and checking the tree against that case is what found
// the misattribution. The finding was worth the look; the polyfill was not worth vendoring.

const EMPTY_MODULE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

let _cache = null;

/**
 * Probe, once, and cache. Two questions, not one:
 *   present -- is there a WebAssembly object with the constructors at all (Lockdown Mode removes it)
 *   usable  -- does compiling the smallest legal module actually succeed
 *
 * THE SECOND IS NOT PEDANTRY. A Content-Security-Policy without 'wasm-unsafe-eval' leaves the WebAssembly
 * object in place and makes every compile throw, so a `typeof WebAssembly` check reports fine and the loader
 * fails anyway -- which is the same misattribution one level down.
 *
 * @returns {{present:boolean, usable:boolean, reason:string, error:string}}
 */
export function probeWasm() {
    if (_cache) return _cache;
    const present = typeof WebAssembly === "object" && WebAssembly !== null &&
        typeof WebAssembly.Module === "function" && typeof WebAssembly.Instance === "function";
    if (!present) {
        _cache = {
            present: false, usable: false, error: "",
            reason: "WebAssembly is not available in this browser. It is switched off, not missing: Apple's " +
                    "Lockdown Mode disables it in Safari, and some hardened enterprise policies do the same. " +
                    "Nothing needs building or reinstalling.",
        };
        return _cache;
    }
    // The eight bytes of a legal empty module: the magic and the version, and nothing else.
    try {
        new WebAssembly.Module(EMPTY_MODULE);
        _cache = { present: true, usable: true, reason: "", error: "" };
    } catch (e) {
        _cache = {
            present: true, usable: false, error: String((e && e.message) || e),
            reason: "WebAssembly exists here but refuses to compile even an empty module, which is what a " +
                    "Content-Security-Policy without 'wasm-unsafe-eval' does. This is a page policy, not a " +
                    "missing build.",
        };
    }
    return _cache;
}

/** True when wasm can actually be compiled here. */
export function wasmUsable() { return probeWasm().usable; }

/** Why not, in words a person can act on -- or "" when it is fine. */
export function wasmUnavailableReason() { return probeWasm().reason; }

/**
 * *** THE WHOLE POINT, AND THE DIRECT ANALOGUE OF browserSkipReason(). ***
 * A loader catches an error and has to say what went wrong. There are two independent facts -- "wasm works
 * here" and "this particular module loaded" -- and reporting them as one guess is how you tell somebody to
 * rebuild a file that is already correct.
 *
 * @param {any} err the caught error
 * @param {string} ownReason what the caller would say if wasm itself were fine (a missing build, a bad path)
 * @returns {string} the reason, attributed to whichever fact is actually false
 */
export function explainWasmFailure(err, ownReason) {
    const msg = String((err && err.message) || err || "");
    const p = probeWasm();
    if (!p.usable) return p.reason + (msg ? " (the loader reported: " + msg + ")" : "");
    return (ownReason || "the module failed to load") + (msg ? " (" + msg + ")" : "");
}

/** Test seam: the probe caches, and a gate needs to run it against more than one environment. */
export function _resetWasmProbe() { _cache = null; }
