// ai-bridge/markitdownBridge.js — v1547
// Front-end Microsoft markitdown (github.com/microsoft/markitdown, MIT) FROM the engine:
// pick a document (PDF / DOCX / PPTX / XLSX / HTML / image / etc.) and get clean Markdown back.
//
// Verified (pypi markitdown 0.1.6, Python 3.10+):
//   pip install 'markitdown[all]'
//   python: from markitdown import MarkItDown; MarkItDown().convert(path).text_content
//
// We run it as a subprocess against whatever Python we can find, preferring (in order): an
// explicitly configured python (~/.voxelbridge/markitdown.json {py}), the engine venv
// (VOXEL_VENV_PY), the ComfyUI portable embedded python, then system python / the py launcher.
// markitdown is pure-Python for the common formats (no GPU / no model downloads), so it runs
// fine on the embedded interpreter once pip-installed there.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const IS_WIN = process.platform === "win32";
const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "markitdown.json");

function load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")) || {}; } catch { return {}; } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2)); } catch {} }
function getConfig() { return { ok: true, config: load() }; }
function setConfig(p) { const c = load(); if (p && p.py != null) c.py = String(p.py).trim(); save(c); return { ok: true, config: c }; }

function _pyCandidates() {
    const out = []; const c = load();
    if (c.py && fs.existsSync(c.py)) out.push(c.py);
    const venv = process.env.VOXEL_VENV_PY; if (venv && fs.existsSync(venv)) out.push(venv);
    for (const base of ["C:\\VoxelBAK\\ComfyUI_windows_portable", "C:\\ComfyUI_windows_portable"]) {
        const p = path.join(base, "python_embeded", "python.exe");
        try { if (fs.existsSync(p)) out.push(p); } catch {}
    }
    out.push(IS_WIN ? "python" : "python3");
    if (IS_WIN) out.push("py");   // the Python launcher (NOT the Store alias)
    return [...new Set(out)];
}

function spawnP(cmd, args, opts) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ code: -2, out, err: "timeout" }); }, (opts && opts.timeout) || 60000);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, out: "", err: cmd + " spawn: " + e.message }); }
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { err += d; });
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ code: -1, out, err: cmd + ": " + e.message }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ code, out, err: (err || "").trim() }); });
    });
}

async function _hasMarkitdown(py) {
    const r = await spawnP(py, ["-c", "import markitdown,sys;sys.stdout.write(getattr(markitdown,'__version__','?'))"], { timeout: 20000 });
    return { ok: r.code === 0, version: (r.out || "").trim(), err: r.err };
}

async function status() {
    const cands = _pyCandidates();
    for (const py of cands) {
        const r = await _hasMarkitdown(py);
        if (r.ok) { const c = load(); c.py = py; save(c); return { ok: true, installed: true, py, version: r.version, candidates: cands }; }
    }
    for (const py of cands) {
        const r = await spawnP(py, ["--version"], { timeout: 8000 });
        if (r.code === 0) return { ok: true, installed: false, py, pythonVersion: ((r.out || "") + (r.err || "")).trim(), candidates: cands };
    }
    return { ok: true, installed: false, py: "", error: "no Python found (tried: " + cands.join(", ") + ")", candidates: cands };
}

async function install() {
    const cands = _pyCandidates(); let py = "";
    for (const cd of cands) { const r = await spawnP(cd, ["--version"], { timeout: 8000 }); if (r.code === 0) { py = cd; break; } }
    if (!py) return { ok: false, error: "no Python found to install into (tried: " + cands.join(", ") + ")" };
    // 30-min budget; [all] is heavy but pure-python for the common formats
    const r = await spawnP(py, ["-m", "pip", "install", "--upgrade", "markitdown[all]"], { timeout: 1800000 });
    const h = await _hasMarkitdown(py);
    if (h.ok) { const c = load(); c.py = py; save(c); }
    if (!h.ok) return { ok: false, py, error: ((r.err || r.out || "pip install failed") + "").slice(-600) };
    return { ok: true, py, version: h.version, log: ((r.out || "") + "").slice(-300) };
}

async function convert(file) {
    if (!file) return { ok: false, error: "no file path" };
    if (!fs.existsSync(file)) return { ok: false, error: "file not found: " + file };
    const c = load(); let py = c.py;
    if (!py || !fs.existsSync(py)) {
        const s = await status();
        if (!s.installed) return { ok: false, error: "markitdown isn't installed yet \u2014 press Install first" };
        py = s.py;
    }
    const SCRIPT = [
        "import sys",
        "try:",
        "    sys.stdout.reconfigure(encoding='utf-8')",
        "except Exception:",
        "    pass",
        "from markitdown import MarkItDown",
        "r = MarkItDown(enable_plugins=False).convert(sys.argv[1])",
        "sys.stdout.write(r.text_content or '')",
    ].join("\n");
    const r = await spawnP(py, ["-c", SCRIPT, file], { timeout: 300000 });
    if (r.code !== 0) return { ok: false, error: ((r.err || "markitdown failed") + "").slice(-500), py };
    const md = r.out || "";
    return { ok: true, markdown: md, file: path.basename(file), chars: md.length, py };
}

module.exports = { status, install, convert, getConfig, setConfig };
