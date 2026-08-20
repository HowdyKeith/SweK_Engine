// processBridge.js — v1070
// Manage external programs on the rig from the engine (UI / voice / Twitch).
//
// SAFETY MODEL: an allow-list. The API starts programs by ID from a user-defined
// registry (processes.json) — it never runs a raw command string from the network.
// Editing the registry is itself privileged (same LAN exposure as the rest of the
// bridge). `shell:false`, so args are passed literally (no shell injection).
//
// Each entry: { id, label, cmd, args[], cwd, autoRestart }
// Capabilities: start / stop / restart / send-stdin / tail-output / status.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CFG = path.join(__dirname, "processes.json");
let registry = [];
let gate = { enabled: false, pin: "" };   // master execution switch + optional PIN
try {
    if (fs.existsSync(CFG)) {
        const raw = JSON.parse(fs.readFileSync(CFG, "utf8"));
        if (Array.isArray(raw)) { registry = raw; }
        else if (raw && typeof raw === "object") { registry = Array.isArray(raw.processes) ? raw.processes : []; if (raw.gate && typeof raw.gate === "object") gate = { enabled: !!raw.gate.enabled, pin: String(raw.gate.pin || "") }; }
    }
} catch {}
function save() { try { fs.writeFileSync(CFG, JSON.stringify({ processes: registry, gate }, null, 2)); } catch {} }

// Gate checks. `action` routes (start/stop/restart/send) need enabled AND (no pin
// or a matching pin). `config` needs only a matching pin (allowed while disabled,
// so you can set things up first). Read routes (list/tail/gate-status) are open.
function checkAction(pin) {
    if (!gate.enabled) return { ok: false, code: 403, error: "process control is turned off (Settings -> Processes & Commands -> master switch)" };
    if (gate.pin && String(pin || "") !== gate.pin) return { ok: false, code: 401, error: "PIN required or incorrect" };
    return { ok: true };
}
function checkConfig(pin) {
    if (gate.pin && String(pin || "") !== gate.pin) return { ok: false, code: 401, error: "PIN required or incorrect" };
    return { ok: true };
}
function getGate() { return { enabled: gate.enabled, hasPin: !!gate.pin }; }
function setGate(next) {
    next = next || {};
    // To change/clear the PIN when one is set, the current PIN must be supplied.
    if (gate.pin && next.pin !== undefined && String(next.currentPin || "") !== gate.pin) return { ok: false, code: 401, error: "current PIN required to change it" };
    // Toggling enabled also requires the PIN if one is set.
    if (gate.pin && next.enabled !== undefined && String(next.currentPin || "") !== gate.pin) return { ok: false, code: 401, error: "PIN required" };
    if (typeof next.enabled === "boolean") gate.enabled = next.enabled;
    if (next.pin !== undefined) gate.pin = String(next.pin || "");
    save();
    return { ok: true, gate: getGate() };
}

const running = new Map();   // id -> { child, pid, startedAt, lastExit, lastCode, log:[], stopping }
let log = () => {};
function setLogger(fn) { if (typeof fn === "function") log = fn; }

const byId = (id) => registry.find(p => p.id === id);
function _slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || ("proc-" + Date.now().toString(36)); }
// Resolve an id OR a spoken/typed name to the canonical id.
function _rid(idOrName) { const p = byId(idOrName) || resolveByName(idOrName); return p ? p.id : idOrName; }

function list() {
    return registry.map(p => {
        const r = running.get(p.id);
        return {
            id: p.id, label: p.label, cmd: p.cmd, args: p.args || [], cwd: p.cwd || null, autoRestart: !!p.autoRestart,
            running: !!(r && r.child), pid: (r && r.pid) || null, startedAt: (r && r.startedAt) || null,
            lastCode: (r && r.lastCode != null) ? r.lastCode : null, lastExit: (r && r.lastExit) || null,
        };
    });
}

function start(id) {
    id = _rid(id);
    const p = byId(id); if (!p) return { ok: false, error: "no such program: " + id };
    const cur = running.get(id); if (cur && cur.child) return { ok: false, error: "already running", pid: cur.pid };
    let child;
    try { child = spawn(p.cmd, p.args || [], { cwd: p.cwd || undefined, windowsHide: true, shell: false }); }
    catch (e) { return { ok: false, error: "spawn failed: " + e.message }; }
    const rec = { child, pid: child.pid, startedAt: Date.now(), lastExit: null, lastCode: null, log: [], stopping: false };
    running.set(id, rec);
    const push = (d) => { rec.log.push(d.toString()); while (rec.log.join("").length > 8000 && rec.log.length > 1) rec.log.shift(); };
    if (child.stdout) child.stdout.on("data", push);
    if (child.stderr) child.stderr.on("data", push);
    child.on("error", (e) => { rec.lastExit = Date.now(); rec.lastCode = -1; rec.child = null; log("proc " + id + " error: " + e.message); });
    child.on("close", (code) => {
        rec.lastExit = Date.now(); rec.lastCode = code; rec.child = null;
        log("proc " + id + " exited " + code);
        if (p.autoRestart && !rec.stopping) { setTimeout(() => { if (byId(id) && !((running.get(id) || {}).child)) start(id); }, 3000); }
    });
    log("proc " + id + " started pid " + child.pid);
    return { ok: true, id, pid: child.pid };
}

function stop(id) {
    id = _rid(id);
    const r = running.get(id); if (!r || !r.child) return { ok: false, error: "not running" };
    r.stopping = true;
    try {
        if (process.platform === "win32") { try { spawn("taskkill", ["/PID", String(r.pid), "/T", "/F"], { windowsHide: true }); } catch { try { r.child.kill(); } catch {} } }
        else { r.child.kill("SIGTERM"); }
    } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true, id };
}

function restart(id) {
    id = _rid(id);
    const r = running.get(id);
    if (r && r.child) { stop(id); return new Promise(res => setTimeout(() => res(start(id)), 1800)); }
    return Promise.resolve(start(id));
}

function send(id, text) {
    id = _rid(id);
    const r = running.get(id); if (!r || !r.child) return { ok: false, error: "not running" };
    if (!r.child.stdin || !r.child.stdin.writable) return { ok: false, error: "stdin not writable" };
    try { r.child.stdin.write(String(text) + "\n"); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

function tail(id, n) {
    id = _rid(id);
    const r = running.get(id); if (!r) return { ok: false, error: "never started" };
    const text = (r.log || []).join("");
    const lines = text.split(/\r?\n/);
    return { ok: true, id, lines: lines.slice(-(n || 40)), running: !!r.child, lastCode: r.lastCode };
}

// Resolve a spoken/typed name to a registry entry (id, exact label, then contains).
function resolveByName(name) {
    const q = String(name || "").toLowerCase().trim(); if (!q) return null;
    return byId(q)
        || registry.find(p => String(p.label || "").toLowerCase() === q)
        || registry.find(p => String(p.label || "").toLowerCase().includes(q) || p.id.includes(q.replace(/\s+/g, "-")))
        || null;
}

// Replace the whole registry (the UI sends the full list). Validates + slugs ids.
function setConfig(next) {
    if (next && Array.isArray(next.processes)) {
        const seen = new Set();
        registry = next.processes.map(p => {
            let id = p.id ? _slug(p.id) : _slug(p.label || p.cmd);
            while (seen.has(id)) id = id + "-2"; seen.add(id);
            return { id, label: p.label || p.cmd || id, cmd: String(p.cmd || "").trim(), args: Array.isArray(p.args) ? p.args.map(String) : [], cwd: (p.cwd && String(p.cwd)) || null, autoRestart: !!p.autoRestart };
        }).filter(p => p.cmd);
        save();
    }
    return { ok: true, processes: list() };
}

module.exports = { list, start, stop, restart, send, tail, resolveByName, setConfig, setLogger, getRegistry: () => registry.slice(), checkAction, checkConfig, getGate, setGate };
