// brainProcess.js -- GPU Brain process lifecycle (v2086).
//
// THE BUG THIS FIXES: on a version update the old GPU Brain window kept
// running. Two paths caused it:
//   1. Start_Everything.bat used to `start` a NEW brain window every run
//      without killing the old one -> two windows, and the OLD brain (old
//      code) polling the NEW bridge = version skew. (Fixed in the .bat too.)
//   2. The engine's self-update respawns node directly (not the launcher),
//      so it never touched the brain at all -- old brain survived the update.
//
// This centralizes brain lifecycle so BOTH paths converge here:
//   killStaleBrain()  -- kill any deno process running brain.js (matched by
//                        command line, so we never kill unrelated deno procs),
//                        plus a lingering "SweK GPU Brain" window by title.
//   launchBrain()     -- start a fresh brain if Deno is available.
//   restartBrain()    -- kill then (optionally) relaunch.
//
// Safe by construction: if Deno is absent, launch is a no-op (the brain is
// optional). Nothing here throws into the caller.

const { spawn, spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";
// brain/ lives beside ai-bridge/ under WebGLEngine
const BRAIN_DIR = path.join(__dirname, "..", "brain");

function _hasDeno() {
    try {
        const r = spawnSync(IS_WIN ? "where" : "which", ["deno"], { timeout: 6000, windowsHide: true });
        return r.status === 0;
    } catch { return false; }
}

// Kill any brain process (deno running brain.js) + a lingering titled window.
// Returns { killed: <count-ish>, ok }. Never throws.
function killStaleBrain() {
    let killed = 0;
    try {
        if (IS_WIN) {
            // match deno.exe whose command line mentions brain.js -> kill only ours
            const ps =
                "Get-CimInstance Win32_Process -Filter \"Name='deno.exe'\" | " +
                "Where-Object { $_.CommandLine -match 'brain\\.js' } | " +
                "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; 'k' }";
            try {
                const out = execSync("powershell -NoProfile -Command \"" + ps + "\"", { timeout: 15000, windowsHide: true }).toString();
                killed += (out.match(/k/g) || []).length;
            } catch {}
            // also close the wrapper window by title (covers the cmd.exe host)
            try { execSync('taskkill /F /FI "WINDOWTITLE eq SweK GPU Brain" >nul 2>&1', { timeout: 8000, windowsHide: true }); } catch {}
        } else {
            // mac/linux: pkill the deno brain by command-line match
            try { execSync("pkill -f 'deno.*brain\\.js'", { timeout: 8000 }); killed += 1; } catch {}
        }
    } catch {}
    return { ok: true, killed };
}

// Launch a fresh brain if Deno is present. Uses the same launcher the batch
// file uses (START_BRAIN.bat on Windows) so env/flags stay identical; on
// mac/linux it runs the same deno command the .sh/.bat would.
// Returns { launched, reason }. Never throws.
function launchBrain(opts = {}) {
    if (!_hasDeno()) return { launched: false, reason: "deno not found (brain is optional)" };
    if (!fs.existsSync(BRAIN_DIR)) return { launched: false, reason: "brain dir missing: " + BRAIN_DIR };
    try {
        if (IS_WIN) {
            const bat = path.join(BRAIN_DIR, "START_BRAIN.bat");
            if (!fs.existsSync(bat)) return { launched: false, reason: "START_BRAIN.bat missing" };
            // new titled window, same as the launcher, detached so it outlives us
            const c = spawn("cmd", ["/c", "start", "SweK GPU Brain", "cmd", "/c", "cd /d \"" + BRAIN_DIR + "\" && START_BRAIN.bat"],
                { detached: true, stdio: "ignore", windowsHide: false });
            c.unref();
        } else {
            // mac/linux: run the brain directly, detached, matching START_BRAIN's flags
            const args = ["run", "--unstable-webgpu", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "brain.js"];
            const c = spawn("deno", args, { cwd: BRAIN_DIR, detached: true, stdio: "ignore", env: Object.assign({}, process.env) });
            c.unref();
        }
        return { launched: true };
    } catch (e) {
        return { launched: false, reason: String(e && e.message || e) };
    }
}

// Kill the old brain and optionally start a fresh one. Used by the self-update
// restart so an update never leaves a stale brain behind.
function restartBrain(opts = {}) {
    const k = killStaleBrain();
    if (opts.relaunch === false) return { ...k, launched: false };
    // brief settle so the process is really gone before we start a new one
    try { const t = Date.now(); while (Date.now() - t < 600) {} } catch {}
    const l = launchBrain(opts);
    return { ...k, ...l };
}

module.exports = { killStaleBrain, launchBrain, restartBrain, _hasDeno, BRAIN_DIR };
