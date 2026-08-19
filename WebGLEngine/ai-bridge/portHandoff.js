// WebGLEngine/ai-bridge/portHandoff.js -- v2224 -- make auto-updates actually LAND.
//
// The launcher .bat is generated on the machine and not in the shipped zip, so we cannot fix the
// old->new handoff there. So the SERVER owns it. Before v2224, a freshly launched build hit
// EADDRINUSE (the old server still held :8787) and exited 1 -- the update did not land, and the
// churn spun windows. Now the new build, on EADDRINUSE, does NOT die: it WAITS for the old server
// to release the port (retrying the bind), and if the old one is still there after a grace period
// (the launcher's kill missed, or nothing killed it), it FREES THE PORT ITSELF -- kills the stale
// holder and binds. The new build always ends up on :8787. Because it never voluntarily gives up
// the old server until it has the port, there is no "no server" gap: if THIS process can't bind,
// the old one is still serving.
//
// bindDecision() is a pure function so the escalation (wait -> free-the-port -> give up) is
// unit-tested; freePort() is the OS-specific kill, best-effort and rig-verified.

"use strict";

// waitedMs since the first bind attempt -> what to do next.
//   "retry"  : just wait and try again (give the old server time to exit on its own)
//   "heal"   : it's been too long; free the port (kill the stale holder) then retry
//   "giveup" : it will never release; exit so we don't spin forever
function bindDecision(waitedMs, opts = {}) {
    const maxMs = opts.maxMs == null ? 25000 : opts.maxMs;
    const healAfterMs = opts.healAfterMs == null ? 8000 : opts.healAfterMs;
    if (waitedMs >= maxMs) return "giveup";
    if (waitedMs >= healAfterMs) return "heal";
    return "retry";
}

// Kill whatever is LISTENING on `port` (but never ourselves). Best-effort, cross-platform.
function freePort(port, log) {
    log = log || (() => {});
    const cp = require("child_process");
    const self = process.pid;
    try {
        if (process.platform === "win32") {
            const out = cp.execSync('netstat -ano | findstr :' + port, { encoding: "utf8", windowsHide: true, timeout: 8000 });
            const pids = new Set();
            for (const line of out.split(/\r?\n/)) {
                if (!/LISTENING/i.test(line)) continue;
                const m = line.trim().match(/(\d+)\s*$/);
                if (m) { const pid = parseInt(m[1], 10); if (pid && pid !== self) pids.add(pid); }
            }
            for (const pid of pids) { try { cp.execFileSync("taskkill", ["/F", "/PID", String(pid)], { windowsHide: true, timeout: 8000, stdio: "ignore" }); log("[bridge] freed :" + port + " (killed stale PID " + pid + ")"); } catch {} }
            return pids.size;
        } else {
            // lsof is on macOS + most Linux; fall back to fuser
            let out = "";
            try { out = cp.execSync("lsof -ti tcp:" + port + " -sTCP:LISTEN", { encoding: "utf8", timeout: 8000 }); } catch {}
            const pids = out.split(/\s+/).map(s => parseInt(s, 10)).filter(p => p && p !== self);
            let n = 0;
            for (const pid of pids) { try { process.kill(pid, "SIGKILL"); n++; log("[bridge] freed :" + port + " (killed stale PID " + pid + ")"); } catch {} }
            return n;
        }
    } catch { return 0; }
}

// Wire the retry/heal loop onto a server. Add this BEFORE calling appServer.listen(port, cb):
// the success callback you pass to listen() stays registered on 'listening' and fires once the
// bind finally succeeds (Node keeps a listen(port, cb) callback as a one-time 'listening' listener
// even across a failed attempt), so nothing about the success path changes.
function installHandoff(appServer, port, opts = {}) {
    const log = opts.log || (() => {});
    // v3522 -- THE PORT FIGHT NOW LEAVES A RECORD OFF THIS WINDOW. Every line below already went to
    // console.log, and the silent auto-update opens this window MINIMISED, so 21 hours of Keith's log contains
    // not one of them -- not because the contest was quiet but because nobody could hear it. `trace` is
    // injectable so the gate can watch the escalation without a real %TEMP%.
    const trace = opts.trace || ((ev, f) => { try { require("./bootTrace.js").record(ev, f); } catch {} });
    const root = opts.root || require("path").join(__dirname, "..");
    const start = Date.now();
    let lastHealAt = 0;
    appServer.on("error", (e) => {
        if (!e || e.code !== "EADDRINUSE") { log("[bridge] server error: " + (e && e.message)); return; }
        const waited = Date.now() - start;
        const d = bindDecision(waited, opts);
        trace("bind-" + d, { root, port, waitedMs: waited });
        if (d === "giveup") {
            console.error("[bridge] :" + port + " still in use after " + Math.round(waited / 1000) + "s \u2014 the other instance won't release it. Exiting.");
            process.exit(1);
            return;
        }
        if (d === "heal" && (Date.now() - lastHealAt) > 3000) {
            lastHealAt = Date.now();
            log("[bridge] :" + port + " still held after " + Math.round(waited / 1000) + "s \u2014 freeing it (killing the stale holder) so this build can land...");
            try { freePort(port, log); } catch {}
        } else {
            log("[bridge] :" + port + " busy \u2014 waiting for the old server to release it (" + Math.round(waited / 1000) + "s)...");
        }
        setTimeout(() => { try { appServer.listen(port); } catch {} }, 1000);
    });
}

module.exports = { bindDecision, freePort, installHandoff };
