// ai-bridge/renderQaBridge.js — v1983
// Drives the headless render-QA harness (tools/render-qa/) from the bridge so you can run it and read the
// results from server.html instead of the command line. It's a thin controller: spawn the Playwright child,
// capture its log, and surface out/report.json. The harness itself + Chromium must be installed on THIS box
// first (`npm install` in tools/render-qa/) — this module reports that state instead of failing cryptically.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const QA_DIR = path.join(__dirname, "..", "tools", "render-qa");
const OUT_DIR = path.join(QA_DIR, "out");

let _child = null, _log = [], _startedAt = 0, _lastExit = null, _lastMode = "";

function isInstalled() {
    try { return fs.existsSync(path.join(QA_DIR, "node_modules", "playwright")) && fs.existsSync(path.join(QA_DIR, "render-qa.mjs")); }
    catch { return false; }
}
function _push(chunk) { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) _log.push(line); if (_log.length > 600) _log = _log.slice(-600); }

// v3563 -- `all` ADDED, AND ITS ABSENCE WAS A REAL HOLE RATHER THAN A MISSING CONVENIENCE.
//
// render-qa.mjs caches by page FINGERPRINT (v2598, Keith's own request: 239 pages at ~3.5s of settle each is
// fourteen minutes, so do not re-run what has not changed) and its own header names --all as the override,
// because A CACHE THAT CANNOT BE OVERRIDDEN IS A BUG THAT CANNOT BE FIXED. This bridge never passed it.
//
// *** SO THE BUTTON COULD NOT DO THE ONE THING THAT MATTERS AFTER A RUN OF ROUNDS TOUCHES MANY PAGES, and the
// only way to get a full sweep was the command line -- which is exactly the CLI-only deliverable this project
// refuses. A FRONT DOOR THAT CANNOT REACH A FLAG THE TOOL DOCUMENTS IS HALF A DOOR. ***
function run({ only, updateBaselines, base, video, all } = {}) {
    if (_child) return { ok: false, error: "render QA already running", pid: _child.pid };
    if (!isInstalled()) return { ok: false, error: "render-qa not installed on this box - run `npm install` in tools/render-qa/ first (it downloads Chromium)", needsInstall: true };
    const args = ["render-qa.mjs"];
    if (only) args.push("--only", String(only));
    if (updateBaselines) args.push("--update-baselines");
    if (base) args.push("--base", String(base));
    if (video) args.push("--video");
    if (all) args.push("--all");                 // v3563 -- bypass the fingerprint cache; see the note above
    _log = []; _startedAt = Date.now(); _lastExit = null; _lastMode = updateBaselines ? "baseline" : video ? "qa+video" : all ? "qa (all pages)" : "qa";
    _push("[render-qa] starting: node " + args.join(" "));
    try { _child = spawn(process.execPath, args, { cwd: QA_DIR, windowsHide: true }); }
    catch (e) { _child = null; return { ok: false, error: "spawn failed: " + e.message }; }
    _child.stdout && _child.stdout.on("data", _push);
    _child.stderr && _child.stderr.on("data", _push);
    _child.on("error", (e) => { _push("[render-qa] error: " + e.message); });
    _child.on("exit", (code) => { _lastExit = code; _push("[render-qa] exited with code " + code); _child = null; });
    return { ok: true, pid: _child.pid, mode: _lastMode };
}

function stop() { if (_child) { try { _child.kill(); } catch {} _child = null; return { ok: true, stopped: true }; } return { ok: true, note: "not running" }; }

function status() {
    let report = null;
    try { report = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "report.json"), "utf8")); } catch {}
    let summary = null;
    if (report && Array.isArray(report.results)) {
        summary = {
            when: report.when, base: report.base,
            passed: report.results.filter(r => r.ok).length, total: report.results.length,
            pages: report.results.map(r => ({
                name: r.name, ok: r.ok,
                fails: (r.checks || []).filter(c => !c.ok).map(c => c.type),
                stats: r.stats || null,
                diff: (r.diff && typeof r.diff === "object") ? r.diff : (r.diff || null),
                errors: (r.errors || []).slice(0, 2),
            })),
        };
    }
    return {
        ok: true, installed: isInstalled(), installing: !!_installChild, installLog: _installLog.slice(-30), installExit: _installExit,
        running: !!_child, pid: _child ? _child.pid : null,
        startedAt: _startedAt || null, lastExit: _lastExit, mode: _lastMode,
        log: _log.slice(-50), summary,
        reportUrl: (report ? "/render-qa/out/report.html" : null),
    };
}

// v3048 -- THE DISCOVERABLE PAGE LIST, which nothing has ever exposed.
//
// status() reports pages from out/report.json -- i.e. pages that have already RUN. Before a full sweep there is
// nothing to choose from, so "run just this one" was impossible from the page even after v3044 added the filter
// box: you had to already know a name to type. discover.mjs has always known the full set.
//
// IT IMPORTS discover(), IT DOES NOT WALK. A second walk here would be a fourth definition of "which pages exist"
// and would drift from the one the harness actually runs -- the same mistake three gate-counters made for 153
// versions. If this list ever disagreed with what a run covers, the page would be lying about coverage, which is
// worse than showing nothing.
async function pages() {
    if (!isInstalled()) return { ok: false, error: "render-qa not installed on this box - press Install first", needsInstall: true, pages: [] };
    let d;
    try {
        const disc = await import(pathToFileUrl(path.join(QA_DIR, "discover.mjs")));
        const manifest = JSON.parse(fs.readFileSync(path.join(QA_DIR, "manifest.json"), "utf8"));
        d = disc.discover({ dir: path.join(QA_DIR, "..", ".."), manifest });
    } catch (e) {
        return { ok: false, error: "could not read the page list: " + e.message, pages: [] };
    }
    let last = {};
    try {
        const rep = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "report.json"), "utf8"));
        for (const r of (rep.results || [])) last[r.name] = { ok: !!r.ok, when: rep.when };
    } catch {}
    const baselineDir = path.join(QA_DIR, "baselines");
    const hasBaseline = (n) => { try { return fs.existsSync(path.join(baselineDir, n + ".png")); } catch { return false; } };
    return {
        ok: true,
        counts: { tuned: d.kept.length, discovered: d.added.length, total: d.pages.length, excluded: d.skipped.length },
        // Excluded pages are RETURNED WITH THEIR REASONS rather than hidden. A page missing from a QA list looks
        // identical to a page that passed, and the difference is the whole point of an exclusion having a reason.
        excluded: d.skipped.map((s) => ({ file: s.file, reason: s.reason })),
        pages: d.pages.map((p) => ({
            name: p.name, url: p.url,
            baseline: hasBaseline(p.name),
            last: last[p.name] || null,
        })),
    };
}
function pathToFileUrl(p) { return "file://" + (p.startsWith("/") ? "" : "/") + p.split(path.sep).join("/"); }

// Traversal-guarded resolve of a file under out/ (report.html + the screenshots it references).
function outFile(name) {
    const rel = String(name || "").replace(/\\/g, "/");
    if (rel.includes("..") || rel.startsWith("/")) return null;
    const p = path.normalize(path.join(OUT_DIR, rel));
    if (p !== OUT_DIR && !p.startsWith(OUT_DIR + path.sep)) return null;
    return fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
}

// v2239 — install the harness (npm install in tools/render-qa/, which pulls Chromium) straight from the
// panel, so "not installed" is a one-click fix instead of a trip to a terminal. One-time, non-blocking.
let _installChild = null, _installLog = [], _installExit = null;
function _pushI(chunk) { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) _installLog.push(line); if (_installLog.length > 400) _installLog = _installLog.slice(-400); }
function installing() { return !!_installChild; }
function installState() { return { installing: !!_installChild, installLog: _installLog.slice(-30), installExit: _installExit }; }
function install() {
    if (_installChild) return { ok: false, error: "install already running", pid: _installChild.pid };
    if (isInstalled()) return { ok: true, already: true };
    _installLog = []; _installExit = null;
    _pushI("[render-qa] npm install (downloads Chromium, one-time)...");
    const isWin = process.platform === "win32";
    try { _installChild = spawn(isWin ? "npm.cmd" : "npm", ["install"], { cwd: QA_DIR, windowsHide: true, shell: isWin }); }
    catch (e) { _installChild = null; return { ok: false, error: "spawn failed: " + e.message + " (is Node/npm on PATH?)" }; }
    _installChild.stdout && _installChild.stdout.on("data", _pushI);
    _installChild.stderr && _installChild.stderr.on("data", _pushI);
    _installChild.on("error", (e) => { _pushI("[render-qa] install error: " + e.message); });
    _installChild.on("exit", (code) => { _installExit = code; _pushI("[render-qa] install exited with code " + code); _installChild = null; });
    return { ok: true, pid: _installChild.pid };
}

module.exports = { pages, run, stop, status, isInstalled, install, installing, installState, outFile, OUT_DIR };
