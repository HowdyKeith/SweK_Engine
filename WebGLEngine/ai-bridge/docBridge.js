// ai-bridge/docBridge.js — v1028
// Document create + read for xlsx / docx / pptx / pdf, via tools/doc_tool.py.
// Built for the Mercor Excel work: design task fixtures + answer keys, then read
// back an AI's output to check formulas, values, and structure. xlsx is the star
// (formulas preserved on create; formula + cached value surfaced on read).
//   libs: openpyxl, python-docx, python-pptx, fpdf2, pypdf
// Uses base python by default; set DOC_VENV to isolate. install() pip-installs.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IS_WIN = process.platform === "win32";
const BASE_PY = process.env.DOC_PY || (IS_WIN ? "python" : "python3");
const VENV_DIR = process.env.DOC_VENV || "";   // optional isolation
const VENV_PY = VENV_DIR ? (IS_WIN ? path.join(VENV_DIR, "Scripts", "python.exe") : path.join(VENV_DIR, "bin", "python")) : "";
const TOOL = path.join(__dirname, "tools", "doc_tool.py");
const OUT_DIR = process.env.DOC_OUT || path.join(__dirname, "..", "doc-out");   // under WebGLEngine -> served at /doc-out/
const OUT_URL = "/doc-out";
const LIBS = ["openpyxl", "docx", "pptx", "fpdf", "pypdf"];
const PIP_NAMES = ["openpyxl", "python-docx", "python-pptx", "fpdf2", "pypdf"];
const EXT = { xlsx: ".xlsx", docx: ".docx", pptx: ".pptx", pdf: ".pdf" };

function pyForRun() { return (VENV_PY && fs.existsSync(VENV_PY)) ? VENV_PY : BASE_PY; }

function runProc(cmd, args, timeoutMs, stdin) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ code: -2, stdout: out, stderr: err + " [timeout]" }); }, timeoutMs || 60000);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        if (stdin != null) { try { child.stdin.write(stdin); child.stdin.end(); } catch {} }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ code: -1, stdout: out, stderr: String(e && e.message) }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ code, stdout: out, stderr: err }); });
    });
}

async function detect() {
    const py = pyForRun();
    const r = { ok: true, platform: process.platform, python: py, venv: VENV_DIR || "(base python)", libs: {} };
    const code = "import json\nout={}\nfor m in " + JSON.stringify(LIBS) + ":\n try:\n  __import__(m); out[m]=True\n except Exception:\n  out[m]=False\nprint(json.dumps(out))";
    const pk = await runProc(py, ["-c", code], 20000);
    try { r.libs = JSON.parse((pk.stdout || "{}").trim()); } catch { r.libs = {}; }
    r.ready = LIBS.every(m => r.libs[m]);
    r.missing = LIBS.filter(m => !r.libs[m]);
    return r;
}

async function install(step) {
    if (step === "venv") {
        if (!VENV_DIR) return { ok: false, error: "set DOC_VENV to use a venv (default uses base python)" };
        if (fs.existsSync(VENV_PY)) return { ok: true, step, skipped: true, stdout: "venv present" };
        const x = await runProc(BASE_PY, ["-m", "venv", VENV_DIR], 180000);
        return { ok: x.code === 0 && fs.existsSync(VENV_PY), step, stdout: x.stdout, stderr: x.stderr };
    }
    // pkg
    const x = await runProc(pyForRun(), ["-m", "pip", "install", "-U", ...PIP_NAMES], 600000);
    return { ok: x.code === 0, step: "pkg", stdout: (x.stdout || "").slice(-1200), stderr: (x.stderr || "").slice(-1200) };
}

// create({kind, spec}) -> {ok, url, bytes, ...}
async function create({ kind = "xlsx", spec = {} } = {}) {
    if (!EXT[kind]) return { ok: false, error: "kind must be xlsx|docx|pptx|pdf" };
    try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch {}
    const name = "doc_" + Date.now() + EXT[kind];
    const outAbs = path.join(OUT_DIR, name);
    const r = await runProc(pyForRun(), [TOOL, "--op", "create", "--kind", kind, "--stdin", "--out", outAbs], 120000, JSON.stringify(spec || {}));
    let res; try { res = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch { return { ok: false, error: (r.stderr || r.stdout || "create failed; run detect/install").slice(0, 300) }; }
    if (res && res.ok) { res.url = OUT_URL + "/" + name; res.filename = name; }
    return res;
}

// read({kind, path, max}) -> structured dump
async function read({ kind = "xlsx", path: p = "", max = 300 } = {}) {
    if (!EXT[kind]) return { ok: false, error: "kind must be xlsx|docx|pptx|pdf" };
    if (!p) return { ok: false, error: "path required" };
    const r = await runProc(pyForRun(), [TOOL, "--op", "read", "--kind", kind, "--path", p, "--max", String(max)], 120000);
    try { return JSON.parse((r.stdout || "").trim().split("\n").pop()); }
    catch { return { ok: false, error: (r.stderr || r.stdout || "read failed").slice(0, 300) }; }
}

// readUpload({kind, filename, dataBase64, max}) — read a file the browser uploaded
// (base64) without needing a path on the bridge PC. Writes to a temp file, reads,
// cleans up. Kind is inferred from the filename extension if not supplied.
async function readUpload({ kind = "", filename = "", dataBase64 = "", max = 300 } = {}) {
    if (!dataBase64) return { ok: false, error: "no file data" };
    if (!EXT[kind]) {
        const ext = ((String(filename).match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
        kind = ({ xlsx: "xlsx", xlsm: "xlsx", docx: "docx", pptx: "pptx", pdf: "pdf" })[ext] || "";
    }
    if (!EXT[kind]) return { ok: false, error: "unsupported file type — need xlsx/docx/pptx/pdf" };
    let buf;
    try { buf = Buffer.from(String(dataBase64).replace(/^data:[^,]*,/, ""), "base64"); }
    catch (e) { return { ok: false, error: "bad base64" }; }
    if (!buf.length) return { ok: false, error: "empty file" };
    if (buf.length > 25 * 1024 * 1024) return { ok: false, error: "file too large (>25MB)" };
    const tmp = path.join(os.tmpdir(), "docup_" + Date.now() + EXT[kind]);
    try { fs.writeFileSync(tmp, buf); } catch (e) { return { ok: false, error: "temp write: " + e.message }; }
    try { const r = await read({ kind, path: tmp, max }); if (r) r.filename = filename; return r; }
    finally { try { fs.unlinkSync(tmp); } catch {} }
}

module.exports = { detect, install, create, read, readUpload, OUT_DIR, OUT_URL };
