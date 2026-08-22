// ai-bridge/quantBridge.js — v1890
// Interfaces for two GitHub "stock apps" as SweK quant tools:
//   - microsoft/qlib            : AI quant platform. pip install pyqlib; prepare data via
//                                 scripts/get_data.py; run a workflow with `qrun <config.yaml>`
//                                 (train + backtest + evaluate). We detect/install/prep/qrun.
//   - zhulinsen/daily_stock_analysis : a Python daily-analysis script repo. We clone it, install
//                                 its requirements, and run its entry script; output is streamed back.
// Verified interfaces (qlib docs + repo): `qrun config.yaml`, `python scripts/get_data.py
// qlib_data --target_dir ~/.qlib/qlib_data/<region>_data --region <cn|us>`.
// Config in ~/.voxelbridge/quant.json. Runs are spawned; a single run at a time, log tailed.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const WIN = process.platform === "win32";
const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "quant.json");
const QLIB_DATA = path.join(os.homedir(), ".qlib", "qlib_data");
const DEF = {
    pyExe: WIN ? "python" : "python3",
    region: "us",                                       // cn | us
    dsaDir: path.join(CFG_DIR, "daily_stock_analysis"),  // clone target for daily_stock_analysis
    qlibExamples: "",                                    // optional path to a checkout of qlib/examples for qrun configs
};
const DSA_REPO = "https://github.com/zhulinsen/daily_stock_analysis.git";

function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return Object.assign({}, DEF); } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch {} }
function getConfig() { const c = load(); return { ok: true, config: c }; }
function setConfig(p) {
    const c = load();
    for (const k of ["pyExe", "region", "dsaDir", "qlibExamples"]) if (p && p[k] != null) c[k] = String(p[k]);
    if (c.region !== "cn" && c.region !== "us") c.region = "us";
    save(c);
    return getConfig();
}

// ---- run state (single active run, tailed log) ----
let _proc = null;
let _log = [];                 // ring of {t, stream, text}
let _run = null;               // { tool, cmd, startedAt, finishedAt, exitCode }
const LOG_MAX = 4000;
function _push(stream, text) {
    for (const line of String(text).split(/\r?\n/)) {
        if (line.length || stream === "info") { _log.push({ t: Date.now(), stream, text: line }); }
    }
    if (_log.length > LOG_MAX) _log.splice(0, _log.length - LOG_MAX);
}
function status() { return { ok: true, running: !!_proc, run: _run, logTail: _log.slice(-60) }; }
function log(sinceTs) { const s = sinceTs || 0; return { ok: true, running: !!_proc, lines: _log.filter(l => l.t > s), run: _run }; }
function stop() { if (_proc) { try { _proc.kill(); } catch {} _proc = null; } return { ok: true, stopped: true }; }

function _spawnShell(cmdStr, tool, cwd) {
    if (_proc) return { ok: false, error: "a quant run is already in progress" };
    _log = []; _run = { tool, cmd: cmdStr, startedAt: Date.now(), finishedAt: null, exitCode: null };
    _push("info", "$ " + cmdStr);
    try {
        _proc = spawn(WIN ? "cmd" : "bash", WIN ? ["/c", cmdStr] : ["-lc", cmdStr], { cwd: cwd || undefined, windowsHide: true });
    } catch (e) { _proc = null; _run.finishedAt = Date.now(); _run.exitCode = -1; _push("stderr", "spawn failed: " + (e && e.message)); return { ok: false, error: "spawn failed" }; }
    _proc.stdout.on("data", d => _push("stdout", d.toString()));
    _proc.stderr.on("data", d => _push("stderr", d.toString()));
    _proc.on("close", code => { _run.finishedAt = Date.now(); _run.exitCode = code; _push("info", "[exit " + code + "]"); _proc = null; });
    return { ok: true, started: true, tool };
}

// ---- qlib ----
function qlibDetect() {
    const c = load();
    return new Promise((resolve) => {
        const probe = "import importlib.util,sys; m=importlib.util.find_spec('qlib'); print('qlib', (m is not None))";
        const child = spawn(c.pyExe, ["-c", probe], { windowsHide: true });
        let out = "", err = "";
        child.stdout.on("data", d => out += d); child.stderr.on("data", d => err += d);
        child.on("close", () => {
            const installed = /qlib True/.test(out);
            const dataReady = fs.existsSync(path.join(QLIB_DATA, c.region + "_data"));
            resolve({ ok: true, installed, dataReady, region: c.region, dataDir: path.join(QLIB_DATA, c.region + "_data"), detail: installed ? null : (err || out).slice(0, 200) });
        });
        child.on("error", e => resolve({ ok: true, installed: false, dataReady: false, error: String(e && e.message || e) }));
    });
}
function qlibInstall() { const c = load(); return _spawnShell(`"${c.pyExe}" -m pip install pyqlib`, "qlib-install"); }
function qlibPrepareData() {
    const c = load();
    // qlib ships scripts/get_data.py; if the user has a qlib checkout, use it; else the module path works post-install.
    const target = path.join(QLIB_DATA, c.region + "_data");
    const cmd = `"${c.pyExe}" -c "from qlib.tests.data import GetData; GetData().qlib_data(target_dir=r'${target}', region='${c.region}', exists_skip=True)"`;
    return _spawnShell(cmd, "qlib-prepare-data");
}
function qlibRun(configPath) {
    const c = load();
    if (!configPath || /[;&|`$]/.test(configPath)) return { ok: false, error: "give a workflow .yaml config path (no shell metachars)" };
    if (!fs.existsSync(configPath)) return { ok: false, error: "config not found: " + configPath };
    // qrun is the qlib CLI entry; run it on the given workflow yaml.
    return _spawnShell(`qrun "${configPath}"`, "qlib-qrun", path.dirname(configPath));
}

// ---- daily_stock_analysis ----
function dsaDetect() {
    const c = load();
    const cloned = fs.existsSync(c.dsaDir) && fs.existsSync(path.join(c.dsaDir, ".git"));
    let entry = null;
    if (cloned) {
        for (const cand of ["main.py", "run.py", "app.py", "daily_stock_analysis.py"]) {
            if (fs.existsSync(path.join(c.dsaDir, cand))) { entry = cand; break; }
        }
    }
    return { ok: true, cloned, dir: c.dsaDir, entry, hasRequirements: cloned && fs.existsSync(path.join(c.dsaDir, "requirements.txt")) };
}
function dsaInstall() {
    const c = load();
    // clone (or pull) then pip install requirements if present
    const gitCmd = fs.existsSync(path.join(c.dsaDir, ".git"))
        ? `cd "${c.dsaDir}" && git pull`
        : `git clone ${DSA_REPO} "${c.dsaDir}"`;
    const reqCmd = ` && ([ -f "${c.dsaDir}/requirements.txt" ] && "${c.pyExe}" -m pip install -r "${c.dsaDir}/requirements.txt" || echo "no requirements.txt")`;
    return _spawnShell(WIN ? gitCmd : (gitCmd + reqCmd), "dsa-install");
}
function dsaRun(entry) {
    const c = load();
    const det = dsaDetect();
    if (!det.cloned) return { ok: false, error: "daily_stock_analysis not cloned yet — Install first" };
    const e = entry || det.entry;
    if (!e) return { ok: false, error: "no entry script found (main.py/run.py/app.py) — check the repo layout" };
    if (/[;&|`$]/.test(e)) return { ok: false, error: "bad entry name" };
    return _spawnShell(`"${c.pyExe}" "${e}"`, "dsa-run", c.dsaDir);
}

module.exports = {
    getConfig, setConfig, status, log, stop,
    qlibDetect, qlibInstall, qlibPrepareData, qlibRun,
    dsaDetect, dsaInstall, dsaRun,
};
