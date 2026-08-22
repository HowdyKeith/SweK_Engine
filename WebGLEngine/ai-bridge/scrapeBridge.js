// ai-bridge/scrapeBridge.js — v952
// Node manager for the warm Camoufox daemon (camoufox_daemon.py). Owns the
// daemon lifecycle (lazy launch on first op, restart on death), speaks the
// JSON-line protocol, matches responses to requests by id, and exposes the
// IE-WebBrowser-control verbs as plain async functions:
//   goto · content (rendered source) · evaluate (inject/run JS) · screenshot ·
//   grab (capture a network resource — the Google-Maps trick) · click · fill
//
// All orchestration stays here in Node; the Python side only executes browser
// primitives on the warm page.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { VENV_PY } = require("./camoufoxBridge.js");   // single source of truth for the venv python

const DAEMON_SCRIPT = process.env.CAMOUFOX_DAEMON_SCRIPT || path.join(__dirname, "camoufox_daemon.py");
const LAUNCH_TIMEOUT_MS = 90000;   // Firefox cold start can be slow

let proc = null;
let ready = false;
let buf = "";
let seq = 0;
let readyWaiters = [];          // [{resolve, reject}]
const pending = new Map();      // id -> {resolve, reject, timer}

function teardown(err) {
    try { proc && proc.kill("SIGKILL"); } catch {}
    proc = null; ready = false; buf = "";
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(err || new Error("daemon closed")); }
    pending.clear();
}

function handleLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.ready) { ready = true; const w = readyWaiters; readyWaiters = []; w.forEach(x => x.resolve()); return; }
    if (msg.fatal) { const e = new Error(msg.fatal); const w = readyWaiters; readyWaiters = []; w.forEach(x => x.reject(e)); teardown(e); return; }
    if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id); clearTimeout(p.timer); pending.delete(msg.id); p.resolve(msg);
    }
}

function ensureReady() {
    if (ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
        readyWaiters.push({ resolve, reject });
        if (proc) return;                       // a launch is already in flight
        if (!fs.existsSync(VENV_PY)) { readyWaiters = []; return reject(new Error("Camoufox venv missing — install it at /camoufox.html first")); }
        try { proc = spawn(VENV_PY, [DAEMON_SCRIPT], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); }
        catch (e) { readyWaiters = []; return reject(new Error("daemon spawn failed: " + e.message)); }

        proc.stdout.on("data", d => {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, i).trim();
                buf = buf.slice(i + 1);
                if (line) handleLine(line);
            }
        });
        proc.stderr.on("data", () => { /* daemon diagnostics — swallow unless debugging */ });
        proc.on("close", () => { const w = readyWaiters; readyWaiters = []; const e = new Error("daemon exited before ready"); teardown(e); w.forEach(x => x.reject(e)); });

        setTimeout(() => {
            if (!ready) { const w = readyWaiters; readyWaiters = []; w.forEach(x => x.reject(new Error("daemon launch timed out"))); teardown(); }
        }, LAUNCH_TIMEOUT_MS);
    });
}

function cmd(op, args, timeoutMs = 60000) {
    return ensureReady().then(() => new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("scrape op '" + op + "' timed out")); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try { proc.stdin.write(JSON.stringify(Object.assign({ id, op }, args)) + "\n"); }
        catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
    }));
}

// ---- public verbs ----
async function goto(url) { return cmd("goto", { url }); }
async function content(url) { if (url) await cmd("goto", { url }); return cmd("content", {}); }
async function evaluate(expr) { return cmd("evaluate", { expr }); }
async function screenshot(fullPage) { return cmd("screenshot", { fullPage: !!fullPage }); }
async function grab(urlPattern, url) { return cmd("grab", { urlPattern, url }, 90000); }
async function click(selector) { return cmd("click", { selector }); }
async function fill(selector, value, submit) { return cmd("fill", { selector, value, submit: !!submit }); }
function status() { return { running: !!proc, ready, daemon: DAEMON_SCRIPT }; }
async function close() { try { await cmd("close", {}, 8000); } catch {} teardown(); return { ok: true }; }

module.exports = { goto, content, evaluate, screenshot, grab, click, fill, status, close, ensureReady };
