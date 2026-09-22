// tools/ship/wasmExitHook.cjs -- WATCH A GATE COMPILE WASM AND THEN WATCH HOW IT LEAVES.
//
// Loaded with `node --require`, so it is in place before the gate's first import runs and cannot miss a module
// compiled at import time -- which is when box3d's is. It writes one JSON marker to $SWEK_WASM_EXIT_OUT from an
// `exit` handler, which runs for BOTH ways out: process.exit() fires it, and so does falling off the end.
//
// WHY A RUNTIME HOOK RATHER THAN A SOURCE SCAN. "Does this gate compile a WebAssembly module" cannot be read
// off the imports: 206 gates in this tree can REACH a file that calls WebAssembly.instantiate -- taichi,
// quickjs, three's basis/meshopt/zstd decoders -- and almost none of them compile anything, because reaching a
// compiler is not calling one. A static superset used as a population is a count standing in for a property,
// and the property here is about what the process DID.
//
// WHAT IT CANNOT SEE: a gate that spawns a node CHILD which compiles wasm. The child is the process that exits,
// and this hook is not in it unless NODE_OPTIONS carries it. That gap is named in wasmTeardown.mjs rather than
// papered over.
"use strict";
const fs = require("fs");

const seen = { wasmCalls: 0, wasmBytes: 0, how: [], exitCalled: false, exitAfterWasm: false, exitCode: null };
const size = (a) => {
    try {
        if (a instanceof ArrayBuffer) return a.byteLength;
        if (ArrayBuffer.isView(a)) return a.byteLength;
    } catch { /* a Response, a Module, something exotic: the byte count is a report, not a verdict */ }
    return 0;
};
const note = (how, bytes) => { seen.wasmCalls++; seen.wasmBytes += bytes; if (!seen.how.includes(how)) seen.how.push(how); };

const W = WebAssembly;
for (const k of ["instantiate", "compile"]) {
    const real = W[k];
    if (typeof real !== "function") continue;
    W[k] = function (...a) { note(k, size(a[0])); return real.apply(this, a); };
}
for (const k of ["instantiateStreaming", "compileStreaming"]) {
    const real = W[k];
    if (typeof real !== "function") continue;
    W[k] = function (...a) { note(k, 0); return real.apply(this, a); };
}
// `new WebAssembly.Module(bytes)` is the synchronous door and is a CONSTRUCTOR, so it is proxied rather than
// wrapped -- a plain function wrapper would break `instanceof` for every consumer.
const RealModule = W.Module;
if (typeof RealModule === "function") {
    W.Module = new Proxy(RealModule, {
        construct(t, a, nt) { note("new Module", size(a[0])); return Reflect.construct(t, a, nt); },
    });
}

// *** THE MEASUREMENT THE WHOLE FILE IS FOR: DID IT CALL process.exit() WITH A COMPILED MODULE BEHIND IT. ***
const realExit = process.exit.bind(process);
process.exit = function (code) {
    seen.exitCalled = true;
    seen.exitAfterWasm = seen.wasmCalls > 0;
    seen.exitCode = code === undefined ? null : code;
    return realExit(code);
};

process.on("exit", (code) => {
    if (seen.exitCode === null) seen.exitCode = code;
    try { fs.writeFileSync(process.env.SWEK_WASM_EXIT_OUT, JSON.stringify(seen)); } catch { /* no marker is a reading too */ }
});
