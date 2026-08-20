// codegraphBridge.js — v1551
// Front-end for colbymchenry/codegraph (https://github.com/colbymchenry/codegraph, MIT):
// a local code knowledge-graph for AI coding agents. `codegraph init` builds a per-project
// SQLite graph under <project>/.codegraph/ (auto-syncs on file change); `codegraph status`
// reports health. It's a CLI/MCP tool, NOT a REST service — so there's no documented HTTP
// API to query the graph. To RENDER the graph in the engine we read the .codegraph/ SQLite
// directly via scrapers/codegraph_read.py (best-effort schema introspection — honest about it).
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = path.join(os.homedir(), ".voxelbridge", "codegraph.json");
const READ_PY = path.join(__dirname, "scrapers", "codegraph_read.py");
function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return {}; }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); return true; } catch { return false; } }
function getConfig() { const c = load(); return { ok: true, bin: c.bin || "", project: c.project || "", py: c.py || "" }; }
function setConfig(d) { const c = load(); if (d && typeof d.bin === "string") c.bin = String(d.bin).trim(); if (d && typeof d.project === "string") c.project = String(d.project).trim(); if (d && typeof d.py === "string") c.py = String(d.py).trim(); save(c); return getConfig(); }

function _pyCmd() { const c = load(); if (c.py && fs.existsSync(c.py)) return c.py; const v = process.env.VOXEL_VENV_PY; if (v && fs.existsSync(v)) return v; return process.platform === "win32" ? "python" : "python3"; }
function _cmd() {
    const c = load();
    if (c.bin) return { cmd: c.bin, pre: [] };
    return { cmd: process.platform === "win32" ? "codegraph.cmd" : "codegraph", pre: [], fallback: { cmd: process.platform === "win32" ? "npx.cmd" : "npx", pre: ["@colbymchenry/codegraph"] } };
}

function _spawn(cmd, args, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
        let child, out = "", err = "", done = false;
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "codegraph timed out", stdout: out.slice(-2000), stderr: err.slice(-800) }); } }, opts.timeoutMs || 60000);
        try { child = spawn(cmd, args, { cwd: opts.cwd || undefined, windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + (e && e.message) }); }
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "not found (" + (e && e.message) + ")", _enoent: true }); });
        child.stdout.on("data", d => out += d); child.stderr.on("data", d => err += d);
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ ok: code === 0, code, stdout: out, stderr: err }); });
    });
}
async function _cg(args, opts) {
    const c = _cmd();
    let r = await _spawn(c.cmd, [...c.pre, ...args], opts);
    if (r._enoent && c.fallback) r = await _spawn(c.fallback.cmd, [...c.fallback.pre, ...args], Object.assign({}, opts, { timeoutMs: (opts && opts.timeoutMs ? opts.timeoutMs + 30000 : 90000) }));
    return r;
}

function _projDir(p) { const c = load(); return (p && String(p).trim()) || c.project || ""; }
function _graphDb(projDir) {
    const dir = path.join(projDir, ".codegraph");
    if (!fs.existsSync(dir)) return "";
    let ents = []; try { ents = fs.readdirSync(dir); } catch { return ""; }
    // prefer the largest .db/.sqlite file in .codegraph/
    const dbs = ents.filter(f => /\.(db|sqlite|sqlite3)$/i.test(f)).map(f => { let s = 0; try { s = fs.statSync(path.join(dir, f)).size; } catch {} return { f, s }; }).sort((a, b) => b.s - a.s);
    return dbs.length ? path.join(dir, dbs[0].f) : "";
}

async function status(project) {
    const projDir = _projDir(project);
    const r = await _cg(["status"], { cwd: projDir || undefined, timeoutMs: 25000 });
    if (r._enoent) return { ok: true, installed: false, hint: "Install CodeGraph (npm i -g @colbymchenry/codegraph)" };
    const hasGraph = projDir ? !!_graphDb(projDir) : false;
    return { ok: true, installed: true, project: projDir, hasGraph, raw: String(r.stdout || r.stderr || "").trim().slice(0, 600) };
}

// npm i -g @colbymchenry/codegraph (the per-platform bundle carries the runtime + library).
function install() {
    return new Promise((resolve) => {
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        let child, buf = "", done = false;
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "npm install timed out" }); } }, 420000);
        try { child = spawn(npm, ["install", "-g", "@colbymchenry/codegraph"], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "npm not found (" + (e && e.message) + ")" }); }
        child.stdout.on("data", d => buf += d); child.stderr.on("data", d => buf += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "npm not found (" + (e && e.message) + ")" }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ ok: code === 0, code, log: String(buf).slice(-600) }); });
    });
}

// codegraph init — builds the local .codegraph/ graph for a project. Large repos take a while.
async function init(project) {
    const projDir = _projDir(project);
    if (!projDir) return { ok: false, error: "set a project folder first" };
    if (!fs.existsSync(projDir)) return { ok: false, error: "project folder not found: " + projDir };
    const r = await _cg(["init"], { cwd: projDir, timeoutMs: 900000 });
    if (r._enoent) return { ok: false, error: "CodeGraph not installed (npm i -g @colbymchenry/codegraph)", need: "install" };
    const db = _graphDb(projDir);
    return { ok: !!r.ok || !!db, project: projDir, graphDb: db, built: !!db, log: String(r.stdout || r.stderr || "").slice(-600) };
}

async function uninit(project) {
    const projDir = _projDir(project);
    if (!projDir) return { ok: false, error: "no project" };
    const r = await _cg(["uninit"], { cwd: projDir, timeoutMs: 60000 });
    if (r._enoent) return { ok: false, error: "CodeGraph not installed" };
    return { ok: !!r.ok, log: String(r.stdout || r.stderr || "").slice(-300) };
}

// Read the local .codegraph/ SQLite graph into nodes+edges (best-effort introspection).
function graph(project, nodeLimit, edgeLimit) {
    return new Promise((resolve) => {
        const projDir = _projDir(project);
        if (!projDir) return resolve({ ok: false, error: "set a project folder first" });
        const db = _graphDb(projDir);
        if (!db) return resolve({ ok: false, error: "no graph yet — run Build graph (codegraph init) first", need: "init" });
        let child, out = "", err = "", done = false;
        const args = [READ_PY, db, String(parseInt(nodeLimit, 10) || 1500), String(parseInt(edgeLimit, 10) || 3000)];
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "graph read timed out" }); } }, 60000);
        try { child = spawn(_pyCmd(), args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "python not found: " + (e && e.message) }); }
        child.stdout.on("data", d => out += d); child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "python not found (" + (e && e.message) + ")" }); });
        child.on("close", () => {
            if (done) return; done = true; clearTimeout(t);
            const line = out.trim().split("\n").filter(Boolean).pop() || "";
            try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: "bad reader output", raw: out.slice(0, 200), stderr: err.slice(0, 200) }); }
        });
    });
}

module.exports = { getConfig, setConfig, status, install, init, uninit, graph };
