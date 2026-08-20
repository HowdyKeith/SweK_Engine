// ai-bridge/wasmSandboxWorker.js — runs ONE untrusted wasm module inside a worker thread.
//
// This is where the actual sandboxing happens, and it's real, not decorative:
//   * The module is instantiated with a LOCKED import object — only env.memory plus two pure
//     output functions (emitInt / emitByte). It has NO filesystem, NO network, NO host access.
//     A module that tries to import anything else fails to instantiate (LinkError) — it cannot
//     acquire a capability the host didn't hand it. That's the WASM security model: without
//     explicit grants a module can't touch the kernel at all.
//   * Memory is a WebAssembly.Memory with a hard `maximum`, so a module that tries to grow
//     memory without bound is stopped by the cap (grow returns -1 / traps) instead of eating RAM.
//   * The wall-clock TIMEOUT is enforced by the PARENT terminating this whole worker — a runaway
//     (infinite loop) can't be interrupted from inside plain Node WebAssembly, so isolating it in
//     a killable worker is what makes the time bound real.
"use strict";
const { parentPort, workerData } = require("worker_threads");

(function () {
    const out = [];               // collected output (ints / bytes the module emits)
    const bytes = [];
    const MAX_OUT = 4096;         // don't let a module flood output unbounded
    let emitted = 0;

    // The ONLY capabilities granted to untrusted code. Both are pure: they append to a buffer.
    const memory = new WebAssembly.Memory({ initial: 1, maximum: workerData.maxPages || 16 });
    const imports = {
        env: {
            memory,
            emitInt: function (v) { if (emitted < MAX_OUT) { out.push(v | 0); emitted++; } },
            emitByte: function (b) { if (emitted < MAX_OUT) { bytes.push(b & 0xff); emitted++; } },
            abort: function () { throw new Error("module called abort()"); },
        },
    };

    try {
        const mod = new WebAssembly.Module(Buffer.from(workerData.wasmB64, "base64"));

        // Report what the module tried to import — a sandbox transparency detail. Anything outside
        // the granted surface means instantiation will fail below (which we surface as an error).
        const wanted = WebAssembly.Module.imports(mod).map(function (i) { return i.module + "." + i.name; });

        const inst = new WebAssembly.Instance(mod, imports);
        const run = inst.exports.run;
        if (typeof run !== "function") throw new Error("module has no exported run() function");

        const started = Date.now();
        const rc = run((workerData.input | 0) || 0);   // untrusted code executes here
        const ms = Date.now() - started;

        let text = "";
        try { if (bytes.length) text = Buffer.from(bytes).toString("utf8"); } catch (e) {}
        parentPort.postMessage({ ok: true, rc: (rc === undefined ? null : (rc | 0)), out: out.slice(0, 256), text: text.slice(0, 2000), imports: wanted, ms });
    } catch (e) {
        parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
    }
})();
