// FILE: ai-bridge/incrementalUpdate.js
// VERSION: v1 - incremental self-update: recognition + safety + planning (pure)
//
// An incremental update is ONE self-describing JSON package the engine can ingest without a zip library:
//   { type:"swek-incremental", toVersion:"v1749", fromVersion?:"v1748", note?:"...",
//     files:[ { path:"WebGLEngine/ui/foo.js", action:"write", content:"<base64>" },
//             { path:"WebGLEngine/ui/old.js", action:"delete" } ] }
// Paths are relative to the install root. "write" carries base64 `content`; "delete" removes the file.
//
// This module is PURE: it RECOGNISES a package, refuses unsafe paths (no traversal/absolute/outside the tree), refuses a
// package that isn't strictly newer, and turns a valid manifest into a concrete write/delete plan. The actual file I/O,
// backup/rollback, version bump, validation, and restart all live in server.js.

// vNNNN -> integer compare. -1 (a<b), 0 (equal), 1 (a>b).
// v1981 — compare version strings. Handles both SweK's monotonic single-int scheme ("v1980") AND
// dotted semver-ish versions ("v1.10" correctly beats "v1.9"): split on non-digit runs, compare
// segment-by-segment numerically. Missing trailing segments count as 0 ("1.2" < "1.2.1").
function compareVersions(a, b) {
    const seg = (v) => String(v || "").replace(/^[^0-9]*/, "").split(/[^0-9]+/).filter(s => s !== "").map(s => parseInt(s, 10) || 0);
    const sa = seg(a), sb = seg(b);
    const n = Math.max(sa.length, sb.length);
    for (let i = 0; i < n; i++) {
        const x = sa[i] || 0, y = sb[i] || 0;
        if (x < y) return -1;
        if (x > y) return 1;
    }
    return 0;
}

// Reject anything that could escape the install tree.
function safeRelPath(p) {
    const s = String(p || "");
    if (!s || s.length > 400) return false;
    if (/^[\\/]/.test(s)) return false;          // no absolute / leading slash
    if (/^[a-zA-Z]:/.test(s)) return false;       // no Windows drive letter
    if (/\\/.test(s)) return false;               // backslashes not allowed (paths use /)
    if (/\0/.test(s)) return false;
    if (s.split("/").some((seg) => seg === ".." || seg === "")) return false;   // no traversal / empty segments
    return true;
}

function parseManifest(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, error: "not an object" };
    if (obj.type !== "swek-incremental") return { ok: false, error: "not a swek-incremental package" };
    if (!obj.toVersion || !/^v?\d+/.test(String(obj.toVersion))) return { ok: false, error: "missing/invalid toVersion" };
    if (!Array.isArray(obj.files) || obj.files.length === 0) return { ok: false, error: "no files" };
    if (obj.files.length > 2000) return { ok: false, error: "too many files (" + obj.files.length + ")" };
    return { ok: true, manifest: obj };
}

// Validate + build a concrete plan, or reject with a reason. currentVersion like "v1748".
function planUpdate(obj, currentVersion) {
    const pm = parseManifest(obj);
    if (!pm.ok) return { ok: false, reason: pm.error };
    const m = pm.manifest;
    if (compareVersions(m.toVersion, currentVersion) <= 0) return { ok: false, reason: "package " + m.toVersion + " is not newer than " + currentVersion };
    const writes = [], deletes = [];
    for (const f of m.files) {
        if (!f || !safeRelPath(f.path)) return { ok: false, reason: "unsafe path: " + (f && f.path) };
        if (f.action === "write") {
            if (typeof f.content !== "string") return { ok: false, reason: "write missing content: " + f.path };
            writes.push({ path: f.path, content: f.content });
        } else if (f.action === "delete") {
            deletes.push(f.path);
        } else {
            return { ok: false, reason: "bad action '" + (f && f.action) + "' for " + (f && f.path) };
        }
    }
    return { ok: true, toVersion: String(m.toVersion), fromVersion: m.fromVersion ? String(m.fromVersion) : null, note: m.note ? String(m.note).slice(0, 300) : "", writes, deletes };
}

module.exports = { compareVersions, safeRelPath, parseManifest, planUpdate, applyPlan, rollback };

// ---- file I/O (kept here so it can be unit-tested on a temp tree; the orchestration lives in server.js) ----
const fs = require("fs"), path = require("path");
function _abs(root, rel) { return path.join(root, rel); }

// Back up everything the plan touches, then write/delete. Returns { backupDir, written, deleted, created } where `created`
// are paths that did NOT exist before (so a rollback removes them).
function applyPlan(plan, installRoot) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(installRoot, ".update-backups", stamp);
    fs.mkdirSync(backupDir, { recursive: true });
    const written = [], deleted = [], created = [];
    const touch = plan.writes.map((w) => w.path).concat(plan.deletes);
    for (const rel of touch) {
        const abs = _abs(installRoot, rel);
        if (fs.existsSync(abs)) {
            const dst = path.join(backupDir, rel);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(abs, dst);
        } else if (created.indexOf(rel) === -1) {
            created.push(rel);
        }
    }
    for (const w of plan.writes) {
        const abs = _abs(installRoot, w.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(w.content, "base64"));
        written.push(w.path);
    }
    for (const rel of plan.deletes) {
        const abs = _abs(installRoot, rel);
        try { if (fs.existsSync(abs)) { fs.unlinkSync(abs); deleted.push(rel); } } catch (e) {}
    }
    return { ok: true, backupDir, written, deleted, created };
}

// Restore every backed-up original, and remove files the failed update newly created.
function rollback(installRoot, backupDir, created) {
    function walk(dir, base) {
        let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const e of entries) {
            const src = path.join(dir, e.name), rel = path.join(base, e.name);
            if (e.isDirectory()) walk(src, rel);
            else { const dst = path.join(installRoot, rel); try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch (er) {} }
        }
    }
    walk(backupDir, "");
    for (const rel of (created || [])) { try { const abs = _abs(installRoot, rel); if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch (e) {} }
    return { ok: true };
}
