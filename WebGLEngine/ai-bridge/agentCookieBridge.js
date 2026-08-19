// agentCookieBridge.js — v1136
// Controls AgentCookie (mvanhorn/agentcookie) — a macOS-only CLI that syncs browser
// session state (Chrome cookies + per-CLI secrets) between Macs over Tailscale so an
// agent on a second Mac wakes up authenticated. This is gated to darwin: on Windows/
// Linux every action returns supported:false (Geek's friend runs the Mac build).

const { spawn, execFile } = require("child_process");

const isMac = process.platform === "darwin";
let _proc = null;   // running `agentcookie agent-sync`

function _which() {
    return new Promise((resolve) => {
        if (!isMac) return resolve(false);
        execFile("which", ["agentcookie"], (err, out) => resolve(!err && !!String(out).trim()));
    });
}

async function status() {
    const installed = await _which();
    return { ok: true, platform: process.platform, supported: isMac, installed, running: !!(_proc && !_proc.killed), pid: _proc ? _proc.pid : null };
}

async function start(opts = {}) {
    if (!isMac) return { ok: false, supported: false, error: "AgentCookie is macOS-only \u2014 run this on the Mac build" };
    if (_proc && !_proc.killed) return { ok: true, already: true, pid: _proc.pid };
    if (!(await _which())) return { ok: false, error: "agentcookie not found on PATH (install it first)" };
    const args = ["agent-sync"];
    if (opts.headed) args.push("--headed");
    if (opts.domain) args.push("--domain", String(opts.domain));
    if (opts.port) args.push("--port", String(parseInt(opts.port, 10) || 9400));
    try {
        _proc = spawn("agentcookie", args, { detached: false, windowsHide: true });
        _proc.on("exit", () => { _proc = null; });
        _proc.stderr && _proc.stderr.on("data", () => {});
        return { ok: true, pid: _proc.pid, args };
    } catch (e) { _proc = null; return { ok: false, error: "spawn: " + e.message }; }
}

let _lastExit = null;          // v3107 -- what the process ACTUALLY did, filled in by the listener below
function stop() {
    if (!_proc) return { ok: true, running: false };
    // v3107 -- SIGNALLING IS NOT STOPPING, AND NULLING THE HANDLE THREW AWAY THE ONLY WAY TO TELL.
    // kill() sends a signal. The child may ignore it, may take seconds, may become a zombie. This returned
    // stopped:true synchronously AND discarded the handle in the same breath, so nothing could ever check --
    // the claim was unfalsifiable by construction. The listener below records the REAL exit; the return value
    // now says what is actually true at that instant, which is that a signal was sent.
    const p = _proc;
    _lastExit = null;
    try { p.once("exit", (code, sig) => { _lastExit = { at: Date.now(), code, sig }; }); } catch {}
    try { p.kill("SIGINT"); } catch {}
    _proc = null;
    return { ok: true, signalled: "SIGINT", stopped: false, note: "signal sent; exit is reported by lastExit()" };
}
/** v3107 -- the honest answer to "did it stop", available because the handle is no longer thrown away blind. */
function lastExit() { return _lastExit; }

module.exports = { status, start, stop, lastExit };
