// ai-bridge/wasmDemoBridge.js — runs the vendored portable SHA-256 .wasm via Node's built-in
// WebAssembly. The point: ONE .wasm binary computes SHA-256 byte-identically on every box
// (Windows / Intel Mac / peers) with NO Docker and NO per-OS binary — the bridge's own Node
// executes it. This is the WASM proof-of-concept: the class of Docker/native compute that WASM
// genuinely replaces (stateless, portable, sandboxed compute), demonstrated end to end.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WASM_PATH = path.join(__dirname, "..", "vendor", "wasm", "sha256.wasm");

let _inst = null, _mem = null, _hash = null, _dptr = 0, _loadErr = null;

function _load() {
    if (_inst || _loadErr) return;
    try {
        const bytes = fs.readFileSync(WASM_PATH);
        const mod = new WebAssembly.Module(bytes);
        const inst = new WebAssembly.Instance(mod, { env: { abort: () => { throw new Error("wasm abort"); } } });
        _inst = inst;
        _mem = inst.exports.memory;
        _hash = inst.exports.hash;
        _dptr = inst.exports.digestPtr();
    } catch (e) { _loadErr = String((e && e.message) || e); }
}

// Compute SHA-256 of a UTF-8 string using the WASM module. Returns hex.
function sha256Wasm(str) {
    _load();
    if (_loadErr) throw new Error("wasm load failed: " + _loadErr);
    const input = Buffer.from(String(str == null ? "" : str), "utf8");
    const mem = new Uint8Array(_mem.buffer);
    if (input.length > 0x7000) throw new Error("input too large for demo module (32KB cap)");
    mem.set(input, 0);
    _hash(input.length);
    return Buffer.from(mem.slice(_dptr, _dptr + 32)).toString("hex");
}

// status: is the module present + loadable?
function status() {
    _load();
    return { ok: !_loadErr, present: fs.existsSync(WASM_PATH), loaded: !!_inst, error: _loadErr, module: "sha256.wasm", runtime: "node WebAssembly (no external runtime needed)" };
}

// The demo endpoint payload: run the SAME input through the WASM module AND Node crypto, and
// report whether they're byte-identical — the portable-compute proof.
function demo(text) {
    try {
        const wasm = sha256Wasm(text);
        const node = crypto.createHash("sha256").update(String(text == null ? "" : text), "utf8").digest("hex");
        return {
            ok: true, input: String(text == null ? "" : text).slice(0, 200),
            wasm, node, identical: wasm === node,
            note: "The same sha256.wasm runs byte-identically on every box via the bridge's Node WebAssembly - no Docker, no per-OS binary.",
        };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

module.exports = { sha256Wasm, demo, status };
