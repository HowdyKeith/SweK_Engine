// WebGLEngine/ai-bridge/launchGuard.js -- v2223 -- stop the relaunch/port-collision loop.
//
// THE LOOP: auto-apply spawns a NEW launcher window; its ai-bridge tries to bind :8787, but the
// OLD server still holds the port, so it dies with EADDRINUSE (server.js exits 1). If nothing
// stops the OLD server from spawning ANOTHER launcher, you get a storm of console windows that
// each open, collide on 8787, and die -- and the churn keeps old-version child processes alive,
// which is exactly why their folders then refuse to delete (EBUSY).
//
// THE GUARD: a machine-wide cooldown. Any launch drops a lock file with a timestamp; a launch
// requested while that lock is fresh is SUPPRESSED. So after one relaunch fires, no second one
// can fire for `cooldownMs`, which breaks the storm. Worst case a genuinely-needed update waits
// out the cooldown, then proceeds -- strictly better than a window flood. The lock is shared by
// every instance on the box (it lives in the OS temp dir), so the old server and the just-spawned
// new server see the same cooldown and neither re-spams.

"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOCK = path.join(os.tmpdir(), "swek_launch.lock");
const COOLDOWN_MS = 90000;   // 90s: long enough to outlast an old->new port handoff + a dead-window retry

function lockAgeMs(now, lockPath) {
    now = now == null ? Date.now() : now;
    try { return now - fs.statSync(lockPath || LOCK).mtimeMs; } catch { return Infinity; }
}
// true when a launch fired recently -> the caller should NOT spawn another one yet.
function shouldSuppress(now, lockPath, cooldownMs) {
    return lockAgeMs(now, lockPath) < (cooldownMs == null ? COOLDOWN_MS : cooldownMs);
}
function markLaunch(v, lockPath) {
    try { fs.writeFileSync(lockPath || LOCK, JSON.stringify({ v: (v | 0), at: Date.now() })); return true; } catch { return false; }
}
function lastLaunchedVersion(lockPath) {
    try { return (JSON.parse(fs.readFileSync(lockPath || LOCK, "utf8")).v) | 0; } catch { return 0; }
}
function clear(lockPath) { try { fs.unlinkSync(lockPath || LOCK); } catch {} }

module.exports = { shouldSuppress, markLaunch, lockAgeMs, lastLaunchedVersion, clear, LOCK, COOLDOWN_MS };
