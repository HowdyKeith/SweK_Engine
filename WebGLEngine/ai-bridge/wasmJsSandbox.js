// ai-bridge/wasmJsSandbox.js — run untrusted JAVASCRIPT inside QuickJS-in-WASM.
//
// This is the arbitrary-language version of the WASM sandbox: instead of running a wasm module
// directly, we run a JS engine (QuickJS) compiled to wasm, and eval the caller's JavaScript inside
// it. Same isolation model, richer input:
//   * The guest JS has NO host bindings — no require, no fetch, no process, no filesystem. It can
//     only compute and return a value. (QuickJS exposes nothing to the guest unless the host wires
//     it, and we wire nothing.)
//   * MEMORY is bounded by rt.setMemoryLimit — a script that allocates without bound is stopped.
//   * TIME is bounded by rt.setInterruptHandler(deadline) — an infinite loop is interrupted. (QuickJS
//     checks the interrupt handler between operations, so unlike a raw wasm module this needs no
//     worker to be time-bounded — though the route still guards with an overall wall-clock cap.)
"use strict";
const path = require("path");

const QJS_LOADER = path.join(__dirname, "..", "vendor", "wasm", "quickjs", "loader.cjs");

let _mod = null, _loadErr = null, _loading = null;

// Load the QuickJS wasm module once (async: emscripten instantiation). Cached.
async function _ensure() {
    if (_mod) return _mod;
    if (_loadErr) throw new Error(_loadErr);
    if (!_loading) {
        _loading = (async () => {
            const { core, variant } = require(QJS_LOADER).load();
            _mod = await core.newQuickJSWASMModuleFromVariant(variant);
            return _mod;
        })().catch((e) => { _loadErr = String((e && e.message) || e); throw e; });
    }
    return _loading;
}

// Run untrusted JS. opts: { memBytes, timeoutMs, stackBytes }. Always resolves.
async function run(code, opts) {
    opts = opts || {};
    const memBytes = Math.min(Math.max(opts.memBytes | 0 || (1 << 20), 64 * 1024), 64 * 1024 * 1024); // 64KB..64MB
    const timeoutMs = Math.min(Math.max(opts.timeoutMs | 0 || 1000, 50), 5000);
    const stackBytes = Math.min(Math.max(opts.stackBytes | 0 || (256 * 1024), 32 * 1024), 4 * 1024 * 1024);

    let QuickJS;
    try { QuickJS = await _ensure(); }
    catch (e) { return { ok: false, error: "quickjs load failed: " + String((e && e.message) || e) }; }

    const started = Date.now();
    const rt = QuickJS.newRuntime();
    let ctx = null;
    try {
        rt.setMemoryLimit(memBytes);
        rt.setMaxStackSize(stackBytes);
        const deadline = Date.now() + timeoutMs;
        let interrupted = false;
        rt.setInterruptHandler(() => { if (Date.now() > deadline) { interrupted = true; return true; } return false; });

        ctx = rt.newContext();
        const res = ctx.evalCode(String(code == null ? "" : code));
        const ms = Date.now() - started;

        if (res.error) {
            let msg;
            try { const d = ctx.dump(res.error); msg = (d && (d.message || d.name)) ? ((d.name ? d.name + ": " : "") + (d.message || "")) : String(d); }
            catch (e) { msg = "evaluation error"; }
            res.error.dispose();
            return { ok: false, ms, timeoutMs, memBytes, killed: interrupted,
                     error: interrupted ? ("interrupted — exceeded " + timeoutMs + "ms or the memory limit (the sandbox bound working)") : msg };
        }
        let value;
        try { value = ctx.dump(res.value); } catch (e) { value = "(unserializable value)"; }
        res.value.dispose();
        // Keep the returned value modest so a script can't flood the response.
        let out = value;
        try { const s = JSON.stringify(value); if (s && s.length > 4000) out = s.slice(0, 4000) + "…(truncated)"; } catch (e) { out = String(value).slice(0, 4000); }
        return { ok: true, ms, timeoutMs, memBytes, value: out, type: typeof value };
    } catch (e) {
        return { ok: false, ms: Date.now() - started, error: String((e && e.message) || e) };
    } finally {
        try { ctx && ctx.dispose(); } catch (e) {}
        try { rt.dispose(); } catch (e) {}
    }
}

function status() {
    const fs = require("fs");
    const present = fs.existsSync(path.join(__dirname, "..", "vendor", "wasm", "quickjs", "quickjs-wasmfile-release-sync", "dist", "emscripten-module.wasm"));
    return { ok: !_loadErr, present, loaded: !!_mod, error: _loadErr, engine: "QuickJS (quickjs-emscripten) in WASM", note: "runs untrusted JavaScript with memory limit + interrupt timeout + no host bindings" };
}

module.exports = { run, status };
