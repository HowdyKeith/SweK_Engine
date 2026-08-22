// ai-bridge/wasmSandbox.js — the WASM untrusted-code sandbox harness (the flagship WASM use case).
//
// Runs a caller-supplied wasm module with ZERO host access, a memory ceiling, and a hard wall-clock
// timeout. The isolation is genuine: the module only ever sees the locked import surface defined in
// wasmSandboxWorker.js (memory + emitInt/emitByte), and the timeout is enforced by terminating the
// worker, so even an infinite loop is bounded. This is the class of workload WASM replaces Docker for:
// running code you don't trust, portably, without spinning up a container.
"use strict";
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");

const WORKER = path.join(__dirname, "wasmSandboxWorker.js");
const EX_DIR = path.join(__dirname, "..", "vendor", "wasm", "sandbox-examples");

// Run untrusted wasm (base64). opts: { input, timeoutMs, maxPages }. Always resolves (never throws).
function run(wasmB64, opts) {
    opts = opts || {};
    const timeoutMs = Math.min(Math.max(opts.timeoutMs | 0 || 1000, 50), 5000);
    const maxPages = Math.min(Math.max(opts.maxPages | 0 || 16, 1), 256); // 1 page = 64KB, cap 16MB
    return new Promise((resolve) => {
        let done = false;
        const started = Date.now();
        let worker;
        const finish = (r) => { if (done) return; done = true; try { worker && worker.terminate(); } catch (e) {} resolve(r); };

        try {
            worker = new Worker(WORKER, { workerData: { wasmB64, input: opts.input | 0, maxPages } });
        } catch (e) { return resolve({ ok: false, error: "worker spawn failed: " + String((e && e.message) || e) }); }

        // THE hard timeout: if untrusted code runs too long, kill the whole worker.
        const timer = setTimeout(() => {
            finish({ ok: false, killed: true, timeoutMs, ms: Date.now() - started,
                     error: "execution exceeded " + timeoutMs + "ms — worker terminated by the sandbox (this is the time bound working, e.g. an infinite loop)" });
        }, timeoutMs);

        worker.on("message", (m) => { clearTimeout(timer); finish(Object.assign({ ms: Date.now() - started, timeoutMs, maxPages }, m)); });
        worker.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: String((e && e.message) || e) }); });
        worker.on("exit", (code) => { if (!done) { clearTimeout(timer); finish({ ok: false, error: "worker exited early (code " + code + ")" }); } });
    });
}

// The bundled example modules (compiled by us from AssemblyScript; sources shipped alongside).
function examples() {
    try {
        const meta = JSON.parse(fs.readFileSync(path.join(EX_DIR, "index.json"), "utf8"));
        return { ok: true, examples: meta };
    } catch (e) { return { ok: true, examples: [] }; }
}

function exampleWasmB64(id) {
    if (!/^[a-z0-9_-]+$/i.test(String(id || ""))) return null;
    try { return fs.readFileSync(path.join(EX_DIR, id + ".wasm")).toString("base64"); } catch (e) { return null; }
}

function status() {
    let n = 0; try { n = (examples().examples || []).length; } catch (e) {}
    return { ok: true, worker: fs.existsSync(WORKER), exampleCount: n, note: "runs untrusted wasm with locked imports + memory cap + hard timeout via worker terminate" };
}

module.exports = { run, examples, exampleWasmB64, status };
