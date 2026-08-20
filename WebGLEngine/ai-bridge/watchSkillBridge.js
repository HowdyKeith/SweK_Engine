// ai-bridge/watchSkillBridge.js -- v2352 -- OPTIONAL, opt-in bridge to watch-skill (oxbshw/watch-skill), the
// video-understanding + self-verification tool (capture -> critique -> fix -> proof). It complements render-qa:
// render-qa asserts PIXEL invariants (not-black, expected colors), watch-skill critiques whether a recorded SweK
// session -- the LCARS UI, an EV dogfight, a ComfyUI art gen -- actually LOOKS RIGHT against plain-language criteria.
//
// This bridge only DETECTS the CLI and shells out to it; it does not bundle or auto-install watch-skill (that repo
// self-installs its own Python via `uv` and is young -- Keith vets it, then SweK uses it). Everything is gated
// trusted/local-only in server.js. UNTESTED in the sandbox (no watch-skill, no browser) -- this is the honest first
// integration point, structured so a rig with watch-skill on PATH can drive it, and a no-op (installed:false) otherwise.
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "tools", "watch-skill-out");
let _child = null, _log = [], _startedAt = 0, _lastExit = null, _installed = null;

function _push(chunk) { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) _log.push(line); if (_log.length > 400) _log = _log.slice(-400); }

// detect the CLI on PATH (cached). watch-skill installs a `watch-skill` executable.
function isInstalled() {
    if (_installed != null) return _installed;
    try { const isWin = process.platform === "win32"; const r = require("child_process").spawnSync(isWin ? "where" : "which", ["watch-skill"], { windowsHide: true }); _installed = r.status === 0; }
    catch { _installed = false; }
    return _installed;
}
function recheck() { _installed = null; return isInstalled(); }

// run watch-skill with a pass-through arg list (e.g. ["watch", "<video-or-url>", "--criteria", "..."]). Kept generic
// so we don't hard-code a guessed subcommand -- the caller supplies the exact CLI invocation the installed version wants.
function run(args) {
    if (_child) return { ok: false, error: "watch-skill already running", pid: _child.pid };
    if (!isInstalled()) return { ok: false, error: "watch-skill not found on PATH -- install it from oxbshw/watch-skill first, then it'll be detected here", needsInstall: true };
    if (!Array.isArray(args) || !args.length) return { ok: false, error: "no watch-skill args provided" };
    _log = []; _startedAt = Date.now(); _lastExit = null;
    _push("[watch-skill] " + ["watch-skill", ...args].join(" "));
    try { _child = spawn("watch-skill", args, { windowsHide: true }); }
    catch (e) { _child = null; return { ok: false, error: "spawn failed: " + e.message }; }
    _child.stdout && _child.stdout.on("data", _push);
    _child.stderr && _child.stderr.on("data", _push);
    _child.on("error", (e) => { _push("[watch-skill] error: " + e.message); });
    _child.on("exit", (code) => { _lastExit = code; _push("[watch-skill] exited with code " + code); _child = null; });
    return { ok: true, pid: _child.pid };
}
function stop() { if (_child) { try { _child.kill(); } catch {} _child = null; return { ok: true, stopped: true }; } return { ok: true, note: "not running" }; }

// higher-level QA helper: point watch-skill at a running SweK page and run THE LOOP against plain-language criteria
// (e.g. "the LCARS gauges are visible and not overlapping", "the two fleets visibly exchange fire and take damage").
// Records/inspects the page, critiques it, writes a report. Builds a sensible default CLI invocation; the exact
// subcommand/flags vary by watch-skill version, so callers can override with explicit extraArgs. RIG-only.
function watchPage({ url, criteria, seconds, extraArgs } = {}) {
    if (!url) return { ok: false, error: "no page url" };
    if (!isInstalled()) return { ok: false, error: "watch-skill not found on PATH -- install it from oxbshw/watch-skill first", needsInstall: true };
    const args = ["watch", url];
    if (criteria) args.push("--criteria", criteria);
    if (seconds) args.push("--seconds", String(seconds));
    args.push("--out", OUT_DIR);
    if (Array.isArray(extraArgs)) for (const a of extraArgs) args.push(String(a));
    return run(args);
}
function status() { return { ok: true, installed: isInstalled(), running: !!_child, pid: _child ? _child.pid : null, startedAt: _startedAt, lastExit: _lastExit, log: _log.slice(-40), repo: "https://github.com/oxbshw/watch-skill" }; }

module.exports = { isInstalled, recheck, run, watchPage, stop, status, OUT_DIR };
