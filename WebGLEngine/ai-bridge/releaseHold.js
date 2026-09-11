// WebGLEngine/ai-bridge/releaseHold.js -- a cross-process hold for the one caller runBusy.js's
// RUNNERS table structurally cannot see: a release build running in ANOTHER node process.
//
// *** WHY THE EXISTING GUARD DOES NOT COVER THIS. *** runBusy.js is "one answer to is long work
// in flight, for every updater" -- but every one of its runners (renderQaBridge, gatesBridge,
// rigRunner, sourceChainBridge, githubBridge) answers from THIS process's own in-memory state.
// verify.mjs / ship.mjs are a SEPARATE node process, almost always in a FRESH CLONE in a
// different folder entirely (that is the whole point of "clone, verify, pack, publish" as a
// terminal workflow). No in-process runner can ever see that. Keith hit exactly this: ran
// `node tools/ship/verify.mjs` from a fresh clone while an already-running SweK instance's own
// startUpdatePoller() found a real, valid zip in Downloads, asked runBusy (which truthfully saw
// nothing busy -- it cannot see a sibling process), and applied it mid-sweep. He never started
// the engine that opened; a different, already-running SweK instance's poller did, on schedule,
// blind to the terminal doing the actual release.
//
// *** THE FIX: A LOCK ON DISK, NOT IN MEMORY. *** The lock lives in the OS temp dir (the same
// place launchGuard.js's cooldown lock lives) so every SweK instance on the box, of any version,
// running from any folder, reads the SAME file. A release script acquire()s it once at the top
// and release()s it in a `finally` or `process.on("exit", ...)` so it lifts even on a throw.
//
// *** SELF-HEALING, NOT A PERMANENT LOCK. *** A crashed release script (killed terminal, power
// loss) must not wedge auto-update forever -- that would trade one rare surprise for a permanent
// one. running() checks the recorded pid is still alive and the record is not absurdly old
// (MAX_AGE_MS); either failing, it clears the stale lock itself rather than reporting held.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOCK = path.join(os.tmpdir(), "swek_release.hold");
const MAX_AGE_MS = 2 * 60 * 60 * 1000;   // 2h backstop for a crash that never released; a real run takes minutes

function _read() {
    try { return JSON.parse(fs.readFileSync(LOCK, "utf8")); } catch { return null; }
}

function _alive(pid) {
    try { process.kill(pid, 0); return true; } catch { return false; }
}

/** True while a release build is genuinely in flight: recorded, fresh, and its process still alive. */
function running() {
    const rec = _read();
    if (!rec || !rec.pid) return false;
    if (Date.now() - (rec.at || 0) > MAX_AGE_MS || !_alive(rec.pid)) {
        try { fs.unlinkSync(LOCK); } catch {}
        return false;
    }
    return true;
}

function busyWhat() {
    const rec = _read();
    return (rec && rec.what) || "a release build (verify/ship) in progress on this machine";
}

/**
 * Call once, at the start of a release script. Writes the lock under THIS process's pid and
 * returns a release() function -- idempotent, safe to call from both a `finally` and
 * `process.on("exit", ...)`. Never throws: a release script's exit code must depend on the
 * ritual, never on this file.
 */
function acquire(what) {
    try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now(), what: what || busyWhat() })); } catch {}
    let released = false;
    return function release() {
        if (released) return;
        released = true;
        try { const cur = _read(); if (cur && cur.pid === process.pid) fs.unlinkSync(LOCK); } catch {}
    };
}

module.exports = { acquire, running, busyWhat, LOCK, MAX_AGE_MS };
