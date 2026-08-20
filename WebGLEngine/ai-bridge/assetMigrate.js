// FILE: ai-bridge/assetMigrate.js
// VERSION: v1557 - first-boot migration of user-added assets out of the internal GPU_Assets.
//
// THE PROBLEM: when assets are dropped into the GPU_Assets folder that lives INSIDE the
// versioned engine tree (EngineProject_vN/WebGLEngine/GPU_Assets), each self-update extracts a
// fresh sibling and those user assets are stranded in the old folder.
//
// WHAT IT DOES: on the new build's first boot (driven by the page once fully loaded), it sweeps
// the prior version's internal GPU_Assets for files the USER added and MOVES them to the live
// assets root - the EXTERNAL assets folder if one is set (so they're served first + survive all
// future updates), otherwise this build's internal GPU_Assets. Runs regardless of whether an
// external folder is set (per Geek): the internal folder may hold models the user dropped in by
// hand. When an external folder is set it ALSO sweeps THIS build's internal GPU_Assets for
// hand-dropped models and lifts them out to the external folder.
//
// "user-added vs default delivered" - two signals, unioned:
//   (1) RELPATH: a file in the old folder whose relative path is NOT in this build's GPU_Assets
//       is user content. (The ship ritual strips GPU_Assets/*.glb + mods, so a fresh build's
//       GPU_Assets IS the default set.)
//   (2) DATE: a file whose mtime is NEWER than the build's install time is user content - the
//       shipped files all carry the install/extract time; hand-dropped models are later. The
//       install baseline is the newest mtime among core shipped files (main.js/index.html/
//       server.html) in that build, which the user never edits.
//   Either signal flags a file, so an old model with an early mtime (caught by relpath) and a
//   same-named default REPLACEMENT (caught by date) are both handled. Shipped defaults are never
//   moved out of the current internal folder (excluded by relpath there).
//
// MOVE semantics (per Geek). The move runs at first boot of the NEW build, which has already
// proven it boots, so moving is safe. Resumable: moved files become part of the default/served
// set, so an interrupted run finishes the remainder next boot (state stamped only on a clean run).
"use strict";

const fs = require("fs"), path = require("path"), os = require("os");

let log = (...a) => { try { console.log("[assetMigrate]", ...a); } catch {} };
function setLogger(fn) { if (typeof fn === "function") log = fn; }

let _ctx = { engineRoot: path.resolve(__dirname, ".."), getExternalDir: () => "" };
function init(ctx) { _ctx = Object.assign(_ctx, ctx || {}); return _ctx; }

const STATE_PATH = path.join(os.homedir(), ".voxelbridge", "asset-migration.json");
function readState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch { return {}; } }
function writeState(obj) { try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(obj, null, 2)); return true; } catch (e) { log("state write failed:", e && e.message); return false; } }

const EPS_MS = 10000;   // grace so files written during the same extraction aren't flagged "newer"

function _curVersionNum() {
    const m = String(_ctx.engineRoot || "").replace(/\\/g, "/").match(/EngineProject[ _]v(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
}
function _newAssetsDir() { return path.join(_ctx.engineRoot, "GPU_Assets"); }
function _versionFolder() { return path.dirname(_ctx.engineRoot); }            // .../EngineProject_vN
function _container() { return path.dirname(_versionFolder()); }                // holds all EngineProject_v*

// install baseline for a build = newest mtime among its core shipped files (never user-edited).
function _installBaseline(webglRoot) {
    let best = 0;
    for (const f of ["main.js", "index.html", "server.html"]) {
        try { const m = fs.statSync(path.join(webglRoot, f)).mtimeMs; if (m > best) best = m; } catch {}
    }
    if (!best) { try { for (const e of fs.readdirSync(path.join(webglRoot, "GPU_Assets"), { withFileTypes: true })) { if (e.isFile()) { const m = fs.statSync(path.join(webglRoot, "GPU_Assets", e.name)).mtimeMs; if (m > best) best = m; } } } catch {} }
    return best;
}

function _priorSibling() {
    const cur = _curVersionNum();
    let best = null;
    let ents = []; try { ents = fs.readdirSync(_container(), { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
        if (!e.isDirectory()) continue;
        const m = e.name.match(/^EngineProject[ _]v(\d+)$/i); if (!m) continue;
        const v = parseInt(m[1], 10);
        if (!(v < cur)) continue;
        const webgl = path.join(_container(), e.name, "WebGLEngine");
        const ga = path.join(webgl, "GPU_Assets");
        if (!fs.existsSync(ga)) continue;
        if (!best || v > best.v) best = { v, dir: ga, webgl, root: path.join(_container(), e.name) };
    }
    return best;
}

function _relFiles(root) {
    const out = [];
    const walk = (d, rel, depth) => {
        if (depth > 12) return;
        let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) { const r = rel ? (rel + "/" + e.name) : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r, depth + 1); else out.push(r); }
    };
    try { if (fs.existsSync(root)) walk(root, "", 0); } catch {}
    return out;
}
function _freeBytesAt(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return -1; } }
function _sameRoot(a, b) { try { return path.parse(path.resolve(a)).root.toLowerCase() === path.parse(path.resolve(b)).root.toLowerCase(); } catch { return true; } }
function _mtime(p) { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }
function _size(p) { try { return fs.statSync(p).size; } catch { return 0; } }

// Build the move plan: { items:[{srcDir, rel, size}], bytes, target, toExternal, fromVersion }.
function _plan() {
    const ext = (_ctx.getExternalDir && _ctx.getExternalDir()) || "";
    const newGA = _newAssetsDir();
    const target = ext ? ext : newGA;                          // external wins (served first + permanent)
    const defaults = new Set(_relFiles(newGA).map(r => r.toLowerCase()));   // this build's shipped defaults
    const items = []; let bytes = 0; const seen = new Set();
    const add = (srcDir, rel, dstDir) => { const key = (srcDir + "::" + rel).toLowerCase(); if (seen.has(key)) return; const sz = _size(path.join(srcDir, rel)); items.push({ srcDir, rel, size: sz, dstDir }); bytes += sz; seen.add(key); };

    // SOURCE 1 - the most-recent prior version's internal GPU_Assets.
    const prior = _priorSibling();
    let fromVersion = null;
    if (prior) {
        fromVersion = "v" + prior.v;
        const base = _installBaseline(prior.webgl);
        for (const rel of _relFiles(prior.dir)) {
            const novel = !defaults.has(rel.toLowerCase());
            const newer = base ? (_mtime(path.join(prior.dir, rel)) > base + EPS_MS) : false;
            if (novel || newer) add(prior.dir, rel, target);
        }
    }
    // SOURCE 2 - this build's OWN internal GPU_Assets, ONLY when lifting out to an external folder
    // (otherwise internal IS the target, nothing to move). Hand-dropped models = newer than the
    // install baseline AND not a shipped default (so we never move a shipped default out).
    if (ext && fs.existsSync(newGA)) {
        const base = _installBaseline(_ctx.engineRoot);
        for (const rel of _relFiles(newGA)) {
            if (defaults.has(rel.toLowerCase())) { /* shipped default - but a default with a newer mtime is a user replacement */ }
            const novel = !defaults.has(rel.toLowerCase());
            const newer = base ? (_mtime(path.join(newGA, rel)) > base + EPS_MS) : false;
            if (novel || newer) add(newGA, rel, target);
        }
    }
    // SOURCE 3 (v1632) - the cataloged asset_library (ai-bridge/asset_library). The ship ritual EXCLUDES it,
    // so a fresh build ships none: EVERYTHING in an asset_library folder is user-accumulated. Lift the WHOLE
    // thing out to <external>/asset_library so it stops bloating the version tree. Only when an external folder
    // is set - there's no in-tree target worth moving to (that IS the bloat). Covers the prior version's
    // library AND this build's own internal one.
    const libTarget = ext ? path.join(ext, "asset_library") : "";
    if (libTarget) {
        const libSrcs = [];
        if (prior) libSrcs.push(path.join(prior.webgl, "ai-bridge", "asset_library"));
        libSrcs.push(path.join(_ctx.engineRoot, "ai-bridge", "asset_library"));
        for (const libSrc of libSrcs) {
            if (path.resolve(libSrc) === path.resolve(libTarget)) continue;   // already external - nothing to lift
            for (const rel of _relFiles(libSrc)) add(libSrc, rel, libTarget);
        }
    }
    return { items, bytes, target, toExternal: !!ext, fromVersion, defaults: defaults.size, libTarget };
}

function check() {
    try {
        const cur = "v" + _curVersionNum();
        const st = readState();
        if (st.migratedTo === cur) return { ok: true, pending: false, reason: "already migrated for " + cur, done: true, at: st.at, movedFiles: st.movedFiles };
        if (st.dismissedFor === cur) return { ok: true, pending: false, reason: "dismissed for " + cur, dismissed: true };
        const plan = _plan();
        if (!plan.items.length) return { ok: true, pending: false, reason: "no user-added assets found in the internal GPU_Assets folder(s)", toExternal: plan.toExternal };
        const free = _freeBytesAt(plan.target);
        const sameDrive = plan.items.every(it => _sameRoot(it.srcDir, it.dstDir || plan.target));
        const spaceWarning = (!sameDrive && free >= 0 && free < plan.bytes * 1.03);
        return {
            ok: true, pending: true,
            files: plan.items.length, bytes: plan.bytes,
            fromVersion: plan.fromVersion || "the internal assets folder",
            toExternal: plan.toExternal, toDir: plan.target, toVersion: cur,
            sameDrive, freeBytes: free, spaceWarning,
        };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

let _progress = { active: false, phase: "idle", done: 0, total: 0, movedBytes: 0, totalBytes: 0, current: "", errors: [], lastResult: null };
function progress() { return Object.assign({}, _progress, { errors: _progress.errors.slice(-20) }); }

function dismiss() { const cur = "v" + _curVersionNum(); const st = readState(); st.dismissedFor = cur; st.dismissedAt = Date.now(); writeState(st); return { ok: true, dismissedFor: cur }; }

function start() {
    if (_progress.active) return { ok: false, error: "a migration is already running", active: true };
    const c = check();
    if (!c.ok) return c;
    if (!c.pending) return { ok: false, error: c.reason || "nothing to migrate", pending: false };
    if (c.spaceWarning) return { ok: false, error: "not enough free space at the destination for a cross-drive move", neededBytes: c.bytes, freeBytes: c.freeBytes };
    const plan = _plan();
    if (!plan.items.length) return { ok: false, error: "nothing to migrate" };

    _progress = { active: true, phase: "moving", done: 0, total: plan.items.length, movedBytes: 0, totalBytes: plan.bytes, current: "", errors: [], lastResult: null, toExternal: plan.toExternal, fromVersion: plan.fromVersion, startedAt: Date.now() };
    const target = plan.target;

    (async () => {
        const touchedSrcDirs = new Set();
        for (const it of plan.items) {
            _progress.current = it.rel;
            const src = path.join(it.srcDir, it.rel), dst = path.join(it.dstDir || target, it.rel);
            try {
                if (path.resolve(src) === path.resolve(dst)) { _progress.done++; continue; }   // already in place
                if (fs.existsSync(dst)) {
                    // v1632 - identity check (per Geek): same name AND exact size = the same file is already at
                    // the destination, so just drop the internal copy (no needless re-copy of GBs). A size
                    // MISMATCH is a real conflict - leave the source in place and report it rather than lose data.
                    if (_size(src) === _size(dst)) { try { fs.rmSync(src, { force: true }); } catch {} _progress.movedBytes += it.size; touchedSrcDirs.add(it.srcDir); }
                    else { _progress.errors.push(it.rel + ": destination exists with a DIFFERENT size - left the source copy in place"); }
                } else {
                    fs.mkdirSync(path.dirname(dst), { recursive: true });
                    try { fs.renameSync(src, dst); }
                    catch (err) { if (err && err.code === "EXDEV") { fs.copyFileSync(src, dst); fs.unlinkSync(src); } else throw err; }
                    _progress.movedBytes += it.size; touchedSrcDirs.add(it.srcDir);
                }
            } catch (e) { _progress.errors.push(it.rel + ": " + ((e && e.message) || e)); }
            _progress.done++;
            await new Promise(r => setImmediate(r));
        }
        for (const d of touchedSrcDirs) { try { _pruneEmpty(d); } catch {} }
        _progress.active = false;
        _progress.phase = _progress.errors.length ? "done-with-errors" : "done";
        _progress.lastResult = { moved: _progress.done - _progress.errors.length, errors: _progress.errors.length, totalBytes: _progress.totalBytes, toExternal: plan.toExternal, fromVersion: plan.fromVersion };
        if (!_progress.errors.length) {
            const st = readState(); st.migratedTo = "v" + _curVersionNum(); st.at = Date.now(); st.movedFiles = _progress.done; st.toExternal = plan.toExternal; writeState(st);
            log("migrated", _progress.done, "file(s) ->", plan.toExternal ? "external folder" : "v" + _curVersionNum());
        } else { log("migration finished with", _progress.errors.length, "error(s); remainder retries next boot"); }
    })();

    return { ok: true, started: true, total: plan.items.length, bytes: plan.bytes, toExternal: plan.toExternal, fromVersion: plan.fromVersion };
}

function _pruneEmpty(root) {
    const walk = (d) => {
        let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) if (e.isDirectory()) walk(path.join(d, e.name));
        if (path.resolve(d) !== path.resolve(root)) { try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch {} }
    };
    walk(root);
}

module.exports = { init, setLogger, check, start, progress, dismiss };
