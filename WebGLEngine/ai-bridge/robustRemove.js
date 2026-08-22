// WebGLEngine/ai-bridge/robustRemove.js -- v2222 -- delete a folder Windows won't let go of.
//
// THE BUG: pruning old EngineProject_vNNN folders fails on Windows with
//   EPERM, Permission denied: \\?\C:\Drivers\EngineProject_v2185
// even with "no task running" and even when the folder looks empty. fs.rmSync({recursive,force})
// already deletes DEPTH-FIRST, so "delete the deepest file first, then work back up" is not the
// missing piece -- the missing piece is that force does NOT clear the Windows READ-ONLY ATTRIBUTE,
// and unlink/rmdir on a read-only entry throws EPERM however many times you retry. Files unpacked
// from a zip routinely carry read-only. The other cause is a TRANSIENT lock (Defender/Search
// indexing the freshly-written tree), which a short retry-with-backoff clears.
//
// THE FIX, combining both: walk depth-first (children before their parent -- your instinct), make
// each entry WRITABLE first (fs.chmod clears the read-only attribute on Windows and the write bit
// on POSIX), then unlink/rmdir, RETRYING EPERM/EBUSY/EACCES/ENOTEMPTY with growing backoff. As a
// last resort on Windows, hand a truly stubborn folder to `cmd /c rmdir /s /q`, which the shell can
// often remove when Node cannot.
//
// Pure, synchronous (the prune runs synchronously at boot), and self-contained. Returns a report
// so the caller can log exactly what went and what stayed.

"use strict";
const fs = require("fs");
const path = require("path");

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY", "EMFILE", "ENFILE"]);

// A clean synchronous sleep (no busy spin): block this thread for `ms` on an un-notified futex.
function _sleep(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms | 0)); }
    catch { const end = Date.now() + ms; while (Date.now() < end) { /* fallback busy-wait */ } }
}

function _makeWritable(p, isDir) {
    // 0o777 for dirs (so their children can be unlinked on POSIX too), 0o666 for files. On Windows
    // any write bit clears FILE_ATTRIBUTE_READONLY, which is what actually unblocks the delete.
    try { fs.chmodSync(p, isDir ? 0o777 : 0o666); } catch { /* best effort */ }
}

function _removeEntry(p, isDir, retries, delayMs) {
    for (let i = 0; i <= retries; i++) {
        try {
            _makeWritable(p, isDir);
            if (isDir) fs.rmdirSync(p); else fs.unlinkSync(p);
            return null;                                   // gone
        } catch (e) {
            if (e.code === "ENOENT") return null;          // already gone -> success
            if (i < retries && RETRYABLE.has(e.code)) { _sleep(delayMs * (i + 1)); continue; }
            return e;                                      // give up on this entry
        }
    }
    return new Error("unreachable");
}

function _walk(target, ctx) {
    let st;
    try { st = fs.lstatSync(target); }
    catch (e) { if (e.code === "ENOENT") return; ctx.failed.push({ path: target, error: e.code || e.message }); return; }

    const isDir = st.isDirectory() && !st.isSymbolicLink();
    if (isDir) {
        _makeWritable(target, true);                       // writable BEFORE reading, so children can go (POSIX)
        let entries = [];
        try { entries = fs.readdirSync(target); } catch { /* unreadable -> try to rmdir it anyway below */ }
        for (const name of entries) _walk(path.join(target, name), ctx);   // deepest first, then back up
    }
    const err = _removeEntry(target, isDir, ctx.retries, ctx.delayMs);
    if (err) ctx.failed.push({ path: target, error: err.code || err.message });
    else ctx.removed.push(target);
}

// Last-ditch Windows shell delete. `cmd /c rmdir /s /q` removes read-only trees the Node fs
// sometimes still refuses. Only used when the Node pass left the folder behind, and only on win32.
function _winRmdir(target) {
    try {
        require("child_process").execFileSync("cmd", ["/c", "rmdir", "/s", "/q", target], { stdio: "ignore", timeout: 20000 });
    } catch { /* best effort; existence is re-checked by the caller */ }
}

// robustRemove(target, { retries=5, delayMs=120, winFallback=false, log })
//   -> { ok, removed:[paths], failed:[{path,error}], fellBackToShell:bool }
function robustRemove(target, opts = {}) {
    const ctx = { retries: opts.retries == null ? 5 : opts.retries, delayMs: opts.delayMs == null ? 120 : opts.delayMs, removed: [], failed: [] };
    try { fs.lstatSync(target); }
    catch (e) { if (e.code === "ENOENT") return { ok: true, removed: [], failed: [], skipped: "absent" }; }

    _walk(target, ctx);

    let fellBackToShell = false;
    if (fs.existsSync(target) && opts.winFallback && process.platform === "win32") {
        if (opts.log) opts.log("robustRemove: node pass left it behind, trying `rmdir /s /q`:", target);
        _winRmdir(target);
        fellBackToShell = true;
        if (!fs.existsSync(target)) { ctx.failed = ctx.failed.filter(f => f.path !== target); if (!ctx.removed.includes(target)) ctx.removed.push(target); }
    }

    const ok = !fs.existsSync(target);
    return { ok, removed: ctx.removed, failed: ctx.failed, fellBackToShell };
}

module.exports = { robustRemove, _removeEntry, _sleep };
