// ai-bridge/cellTrackingBridge.js — v1804
// Launcher for the standalone Python cell-tracking pipeline (cell-tracking/src/*.py).
// This bridge does NOT reimplement any tracking logic — it only spawns the existing
// Python scripts as a child process and streams their stdout/stderr into a ring log
// the UI can poll, same pattern as kpopBridge/mlxInstallBridge's install flows but
// kept running (not a one-shot install) since a pipeline run can take a while.
//
// Honest scope: this is a launcher, not an integration. The Python side is unaware
// of SweK Engine and the engine is unaware of cell-tracking internals — they meet
// only at "spawn this command, show me the log, tell me when it's done."
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
// v1882 — the global "auto-install as needed" toggle (Settings → Auto-Install) lives here.
let _autoInstall = null; try { _autoInstall = require("./autoInstall.js"); } catch { _autoInstall = null; }
function _autoInstallEnabled() { try { return !!(_autoInstall && _autoInstall.prefs && _autoInstall.prefs().enabled); } catch { return false; } }

const IS_WIN = process.platform === "win32";
const CT_DIR = path.join(__dirname, "..", "cell-tracking");
const SRC_DIR = path.join(CT_DIR, "src");

// v1834 — resolve a WORKING Python interpreter, returning { cmd, base } where `base` is
// any leading args (e.g. the Windows `py -3` launcher). On Windows, a bare `python` /
// `python3` usually hits the Microsoft Store app-execution-alias STUB, which prints
// "Python was not found…" and exits 9009 — it isn't a real interpreter. So we probe
// candidates and only accept one that actually runs and prints a real version.
// Order: VOXEL_VENV_PY (explicit) → Windows: `py -3`, `py`, `python`, `python3` →
// Unix: `python3`, `python`. Cached after first success.
// v3948 -- THE PROBE MOVED TO ai-bridge/pythonResolve.js AND THIS FILE NOW IMPORTS IT.
//
// The verification below was written here at v1834 and was RIGHT: it is the only one of the four python
// resolvers in this directory that checked its own answer. The other three -- agentReachBridge, autoInstall,
// camoufoxBridge -- pick an interpreter by name and hand it back unverified, which is exactly the Store-stub
// bug the comment above diagnoses. Measured at v3948: `grep -c PYOK` over the four reads 0, 0, 0, 3.
//
// Being right in one file is what this tree keeps calling a fact rather than a fix. The probe is now a module,
// so a fifth caller (sharpBridge) could not repeat it a fifth time -- same argument as playwrightResolve.mjs.
// The behaviour is unchanged: the candidate order and the PYOK test moved verbatim.
const _pyMod = require("./pythonResolve.js");
async function _resolvePy() { return _pyMod.resolve(); }
const _pyCandidates = _pyMod.candidates;

// legacy shape for log lines: a printable command string
function _pyLabel(cand) { return cand ? [cand.cmd, ...cand.base].join(" ") : (IS_WIN ? "py -3" : "python3"); }

// in-memory state for the (at most one) currently-tracked run; resets on bridge restart.
// A real multi-job queue isn't needed here — this is a manual launcher, one run at a time.
let _state = {
    running: false,
    pid: null,
    script: null,       // "run_pipeline" | "evaluate" | "make_synthetic_data"
    args: [],
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    log: [],             // ring buffer of {t, stream, text}
    error: null,
};

const LOG_MAX_LINES = 2000;

function _pushLog(stream, text) {
    for (const line of String(text).split(/\r?\n/)) {
        if (!line) continue;
        _state.log.push({ t: Date.now(), stream, text: line });
    }
    if (_state.log.length > LOG_MAX_LINES) _state.log.splice(0, _state.log.length - LOG_MAX_LINES);
}

function isAvailable() {
    return fs.existsSync(SRC_DIR) && fs.existsSync(path.join(SRC_DIR, "run_pipeline.py"));
}

// v1805 — dependency check + pip install. Imports each required package in a short-lived
// python -c probe (fast, no side effects) rather than parsing `pip list`, since that's
// the same check the actual scripts would hit on import.
const REQUIRED_IMPORTS = [
    { pkg: "numpy", import_as: "numpy" },
    { pkg: "pandas", import_as: "pandas" },
    { pkg: "scipy", import_as: "scipy" },
    { pkg: "scikit-image", import_as: "skimage" },
    { pkg: "networkx", import_as: "networkx" },
    { pkg: "zarr", import_as: "zarr" },
    { pkg: "pillow", import_as: "PIL" },
    { pkg: "matplotlib", import_as: "matplotlib" },
];

function checkDeps() {
    return new Promise((resolve) => {
        (async () => {
            const cand = await _resolvePy();
            if (!cand) {
                resolve({ ok: true, py: null, allInstalled: false, results: REQUIRED_IMPORTS.map((r) => ({ pkg: r.pkg, ok: false, detail: "no Python found" })),
                    error: IS_WIN ? "No working Python found. The `python` command on Windows usually opens the Microsoft Store stub. Install Python from python.org (check \u2018Add to PATH\u2019) or the Store, then it'll be found via the `py` launcher. You can also set VOXEL_VENV_PY to a python.exe." : "No python3 found. Install Python 3, or set VOXEL_VENV_PY to its path." });
                return;
            }
            const probe = REQUIRED_IMPORTS.map((r) => `\ntry:\n import ${r.import_as}\n print("OK ${r.pkg}")\nexcept Exception as e:\n print("MISSING ${r.pkg} " + str(e))`).join("");
            const { execFile } = require("child_process");
            execFile(cand.cmd, [...cand.base, "-c", probe], { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
                const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
                const results = REQUIRED_IMPORTS.map((r) => {
                    const line = lines.find((l) => l.includes(r.pkg));
                    const ok = !!line && line.startsWith("OK");
                    return { pkg: r.pkg, ok, detail: line || "" };
                });
                const allOk = results.every((r) => r.ok);
                resolve({ ok: true, py: _pyLabel(cand), allInstalled: allOk, results, error: err ? String(stderr || err.message) : null });
            });
        })();
    });
}

async function installDeps() {
    if (_state.running) return { ok: false, error: "a run is already in progress — stop it first" };
    if (!fs.existsSync(path.join(CT_DIR, "requirements.txt"))) {
        return { ok: false, error: "requirements.txt not found in cell-tracking/" };
    }
    const cand = await _resolvePy();
    if (!cand) {
        return { ok: false, error: IS_WIN ? "No working Python found. On Windows, `python` usually opens the Microsoft Store stub instead of a real interpreter (that's the exit-9009 error). Install Python from python.org (tick \u2018Add python.exe to PATH\u2019) or the Microsoft Store, then click Install again \u2014 it'll be found via the `py` launcher. Or set VOXEL_VENV_PY to your python.exe." : "No python3 found. Install Python 3 or set VOXEL_VENV_PY." };
    }
    const args = [...cand.base, "-m", "pip", "install", "-r", "requirements.txt"];
    if (!IS_WIN) args.push("--break-system-packages");   // PEP 668 — needed on many Linux/Mac system pythons

    _state = {
        running: true, pid: null, script: "install_deps", args,
        startedAt: Date.now(), finishedAt: null, exitCode: null, log: [], error: null,
    };
    _pushLog("info", `$ ${_pyLabel(cand)} ${["-m", "pip", "install", "-r", "requirements.txt"].join(" ")}`);
    _pushLog("info", `(cwd: ${CT_DIR})`);

    let child;
    try {
        child = spawn(cand.cmd, args, { cwd: CT_DIR, windowsHide: true });
    } catch (e) {
        _state.running = false;
        _state.error = "spawn failed: " + e.message;
        _pushLog("error", _state.error);
        return { ok: false, error: _state.error };
    }
    _state.pid = child.pid;
    child.stdout.on("data", (d) => _pushLog("stdout", d));
    child.stderr.on("data", (d) => _pushLog("stderr", d));
    child.on("error", (e) => { _state.error = String(e.message || e); _pushLog("error", "process error: " + _state.error); });
    child.on("close", (code) => {
        _state.running = false;
        _state.finishedAt = Date.now();
        _state.exitCode = code;
        _pushLog("info", `--- pip install finished (exit code ${code}) ---`);
    });
    return { ok: true, started: true, pid: child.pid, script: "install_deps" };
}

// scripts the launcher is allowed to run — a fixed allowlist, never arbitrary user input,
// since this spawns a real subprocess on the host.
const SCRIPTS = {
    make_synthetic: { file: "make_synthetic_data.py", label: "Generate synthetic test data" },
    run_pipeline: { file: "run_pipeline.py", label: "Run detection + tracking pipeline" },
    evaluate: { file: "evaluate.py", label: "Evaluate against ground truth (train split)" },
    visualize: { file: "visualize.py", label: "Render detection + track images" },
    export_volume: { file: "export_volume.py", label: "Export density volume for the WebGPU viewer" },
    dataset_tool: { file: "dataset_tool.py", label: "Fetch/pack/unpack the competition dataset" },
};

function status() {
    return {
        ok: true,
        available: isAvailable(),
        running: _state.running,
        script: _state.script,
        args: _state.args,
        startedAt: _state.startedAt,
        finishedAt: _state.finishedAt,
        exitCode: _state.exitCode,
        error: _state.error,
        logTail: _state.log.slice(-200),
        dataDirExists: fs.existsSync(path.join(CT_DIR, "test_data")),
        // v2348 — absolute path of the latest run result, so the UI can offer a one-click P2P "Share this run".
        outPath: (() => { const s = findLatestSubmission(); return s ? s.full : null; })(),
        outName: (() => { const s = findLatestSubmission(); return s ? s.name : null; })(),
    };
}

function log(sinceTs) {
    const lines = sinceTs ? _state.log.filter((l) => l.t > sinceTs) : _state.log;
    return { ok: true, lines, running: _state.running };
}

// builds the argv for a known script + a small set of allowed flags. Values are
// validated/coerced (numbers stay numbers, strings are passed as-is to argv array
// elements, never through a shell, so there's no injection surface).
function _buildArgs(scriptKey, opts) {
    opts = opts || {};
    const args = [];
    if (scriptKey === "run_pipeline" || scriptKey === "evaluate" || scriptKey === "visualize" || scriptKey === "export_volume") {
        args.push("--data_dir", String(opts.dataDir || "../test_data"));
        args.push("--split", String(opts.split || "train"));
        if (scriptKey === "run_pipeline") args.push("--out", String(opts.out || "../submission.csv"));
        if (scriptKey === "run_pipeline" && opts.samples) args.push("--samples", String(opts.samples));   // v1881 — cluster subset
        if (scriptKey === "run_pipeline" && opts.workers != null) args.push("--workers", String(parseInt(opts.workers, 10)));
        if (scriptKey === "run_pipeline" && opts.gpu) args.push("--gpu");   // v2078 -- GPU-accelerated smoothing (falls back to CPU automatically)
        if (scriptKey === "run_pipeline" && opts.adaptive) args.push("--adaptive");   // v2080 -- per-frame adaptive threshold
        if (scriptKey === "run_pipeline" && opts.subvoxel) args.push("--subvoxel");   // v2080 -- sub-voxel centroids
        if (scriptKey === "run_pipeline" && opts.learned) args.push("--learned");     // v2080 -- learned detector (falls back to classical)
        if (scriptKey === "run_pipeline" && opts.maxGap != null) args.push("--max_gap", String(parseInt(opts.maxGap, 10)));
        if (scriptKey === "export_volume") {   // v2079 -- viz transfer knobs (defaults already improve readability)
            if (opts.maxDim != null) args.push("--max_dim", String(parseInt(opts.maxDim, 10)));
            if (opts.gamma != null) args.push("--gamma", String(Number(opts.gamma)));
            if (opts.clipPct != null) args.push("--clip_pct", String(Number(opts.clipPct)));
        }
        if (scriptKey === "visualize") { args.push("--out", String(opts.vizOut || "../viz")); if (opts.frame != null) args.push("--frame", String(parseInt(opts.frame, 10))); if (opts.sample) args.push("--sample", String(opts.sample)); }
        if (scriptKey === "export_volume") { args.push("--out", String(opts.volOut || "../volumes")); if (opts.maxDim != null) args.push("--max_dim", String(parseInt(opts.maxDim, 10))); if (opts.sample) args.push("--sample", String(opts.sample)); }
        if (opts.sigma != null) args.push("--sigma", String(Number(opts.sigma)));
        if (opts.minDistance != null) args.push("--min_distance", String(parseInt(opts.minDistance, 10)));
        if (opts.maxLinkDistance != null && scriptKey !== "visualize") args.push("--max_link_distance", String(Number(opts.maxLinkDistance)));
        if (opts.divisionDistance != null && scriptKey !== "visualize") args.push("--division_distance", String(Number(opts.divisionDistance)));
    }
    // v1885 — dataset_tool has a subcommand form: dataset_tool.py <cmd> --...
    if (scriptKey === "dataset_tool") {
        const cmd = String(opts.datasetCmd || "pack");
        args.push(cmd);
        if (cmd === "fetch") { args.push("--competition", String(opts.competition || "")); args.push("--stage", String(opts.stage || "../_kaggle_stage")); }
        else if (cmd === "pack") { args.push("--stage", String(opts.stage || "../_kaggle_stage")); args.push("--split", String(opts.split || "train")); args.push("--out", String(opts.out || "../_dataset_tars")); }
        else if (cmd === "unpack") { args.push("--tars", String(opts.tars || "../_dataset_tars")); args.push("--split", String(opts.split || "train")); args.push("--data_dir", String(opts.dataDir || "../test_data")); }
    }
    return args;
}

// v1882 — run pip install and RESOLVE when it finishes (promise form of installDeps),
// so run() can ensure deps before spawning the actual script. Returns { ok, exitCode }.
function installDepsAwait() {
    return new Promise(async (resolve) => {
        const r = await installDeps();
        if (!r || !r.ok) { resolve({ ok: false, error: (r && r.error) || "install failed to start" }); return; }
        // installDeps sets _state.script="install_deps"; wait for that run to close.
        const started = Date.now();
        const iv = setInterval(() => {
            if (_state.script === "install_deps" && !_state.running && _state.finishedAt) {
                clearInterval(iv);
                resolve({ ok: _state.exitCode === 0, exitCode: _state.exitCode });
            } else if (Date.now() - started > 600000) {   // 10 min hard cap
                clearInterval(iv);
                resolve({ ok: false, error: "install timed out" });
            }
        }, 500);
    });
}

async function run(scriptKey, opts) {
    if (_state.running) return { ok: false, error: "a run is already in progress — stop it first" };
    const entry = SCRIPTS[scriptKey];
    if (!entry) return { ok: false, error: "unknown script: " + scriptKey };
    if (!isAvailable()) return { ok: false, error: "cell-tracking/src not found next to the engine — was it packaged in this build?" };

    const scriptPath = path.join(SRC_DIR, entry.file);
    if (!fs.existsSync(scriptPath)) return { ok: false, error: "missing " + entry.file };

    // v1882 — optional auto-install of missing Python deps BEFORE the run. This is what
    // makes a dispatched/cluster run self-heal on a peer (e.g. PurtyGF) that's never had
    // its Cell Tracking deps installed by hand — no one is watching that peer's panel to
    // click Install. Fires when the caller asks OR this box's global "auto-install as
    // needed" toggle is on. The box honors its OWN setting. Only pips when something's missing.
    if ((opts && opts.autoInstall) || _autoInstallEnabled()) {
        try {
            const deps = await checkDeps();
            if (deps && deps.py && !deps.allInstalled) {
                const missing = (deps.results || []).filter(r => !r.ok).map(r => r.pkg);
                _pushLog("info", "[deps] missing on this box: " + (missing.join(", ") || "?") + " — auto-installing before the run…");
                const ins = await installDepsAwait();
                if (!ins.ok) return { ok: false, error: "auto-install of Python deps failed" + (ins.error ? (": " + ins.error) : (" (exit " + ins.exitCode + ")")) + ". Install them on this box and retry." };
                _pushLog("info", "[deps] auto-install finished OK — starting the run.");
            }
        } catch (e) { /* fall through and let the run surface any import error */ }
    }

    const args = _buildArgs(scriptKey, opts);
    const cand = await _resolvePy();
    if (!cand) return { ok: false, error: IS_WIN ? "No working Python found (on Windows `python` opens the Microsoft Store stub). Install Python from python.org or the Store, or set VOXEL_VENV_PY." : "No python3 found. Install Python 3 or set VOXEL_VENV_PY." };

    _state = {
        running: true, pid: null, script: scriptKey, args,
        startedAt: Date.now(), finishedAt: null, exitCode: null, log: [], error: null,
    };
    _pushLog("info", `$ ${_pyLabel(cand)} ${entry.file} ${args.join(" ")}`);
    _pushLog("info", `(cwd: ${SRC_DIR})`);

    let child;
    try {
        child = spawn(cand.cmd, [...cand.base, entry.file, ...args], { cwd: SRC_DIR, windowsHide: true });
    } catch (e) {
        _state.running = false;
        _state.error = "spawn failed: " + e.message;
        _pushLog("error", _state.error);
        return { ok: false, error: _state.error };
    }
    _state.pid = child.pid;

    child.stdout.on("data", (d) => _pushLog("stdout", d));
    child.stderr.on("data", (d) => _pushLog("stderr", d));
    child.on("error", (e) => {
        _state.error = String(e.message || e);
        _pushLog("error", "process error: " + _state.error);
    });
    child.on("close", (code) => {
        _state.running = false;
        _state.finishedAt = Date.now();
        _state.exitCode = code;
        _pushLog("info", `--- finished (exit code ${code}) ---`);
    });

    return { ok: true, started: true, pid: child.pid, script: scriptKey, args };
}

function stop() {
    if (!_state.running || !_state.pid) return { ok: false, error: "nothing running" };
    try {
        process.kill(_state.pid, IS_WIN ? undefined : "SIGTERM");
        _pushLog("info", "--- stop requested ---");
        return { ok: true, stopped: true };
    } catch (e) {
        return { ok: false, error: String(e.message || e) };
    }
}

// finds the most recently written submission CSV in the cell-tracking folder, for
// the "download result" link in the UI. Returns null if none exists yet.
function findLatestSubmission() {
    try {
        const candidates = fs.readdirSync(CT_DIR)
            .filter((f) => f.endsWith(".csv"))
            .map((f) => {
                const full = path.join(CT_DIR, f);
                return { name: f, full, mtime: fs.statSync(full).mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);
        return candidates[0] || null;
    } catch {
        return null;
    }
}

// v1878 — list the rendered visualization PNGs (from visualize.py, default ../viz).
function listViz() {
    const vizDir = path.join(CT_DIR, "viz");
    if (!fs.existsSync(vizDir)) return { ok: true, images: [] };
    let files = [];
    try {
        files = fs.readdirSync(vizDir)
            .filter(f => /\.png$/i.test(f))
            .map(f => { const st = fs.statSync(path.join(vizDir, f)); return { name: f, mtime: st.mtimeMs, size: st.size }; })
            .sort((a, b) => b.mtime - a.mtime);
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true, images: files };
}

// Read one viz PNG by name (name-only, no path traversal) — returns a Buffer or null.
function readViz(name) {
    if (!name || /[\\/]/.test(name) || !/\.png$/i.test(name)) return null;
    const fp = path.join(CT_DIR, "viz", name);
    if (!fs.existsSync(fp)) return null;
    try { return fs.readFileSync(fp); } catch (e) { return null; }
}

// v1879 — parse the latest submission.csv into per-dataset {nodes, edges} JSON for the
// WebGL2 viewer. Kept in the bridge (not the engine) so no tracking logic leaks in.
function tracksJson() {
    const latest = findLatestSubmission();
    if (!latest) return { ok: false, error: "no submission CSV yet — run the pipeline first" };
    let text;
    try { text = fs.readFileSync(latest.full, "utf8"); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { ok: false, error: "submission CSV is empty" };
    const header = lines[0].split(",");
    const col = {}; header.forEach((h, i) => { col[h.trim()] = i; });
    const datasets = {};
    let tmax = 0;
    const bounds = { z: [Infinity, -Infinity], y: [Infinity, -Infinity], x: [Infinity, -Infinity] };
    for (let i = 1; i < lines.length; i++) {
        const f = lines[i].split(",");
        const ds = f[col.dataset];
        if (!ds) continue;
        if (!datasets[ds]) datasets[ds] = { nodes: [], edges: [] };
        const rowType = f[col.row_type];
        if (rowType === "node") {
            const t = +f[col.t], z = +f[col.z], y = +f[col.y], x = +f[col.x];
            datasets[ds].nodes.push([+f[col.node_id], t, z, y, x]);
            if (t > tmax) tmax = t;
            if (z < bounds.z[0]) bounds.z[0] = z; if (z > bounds.z[1]) bounds.z[1] = z;
            if (y < bounds.y[0]) bounds.y[0] = y; if (y > bounds.y[1]) bounds.y[1] = y;
            if (x < bounds.x[0]) bounds.x[0] = x; if (x > bounds.x[1]) bounds.x[1] = x;
        } else if (rowType === "edge") {
            datasets[ds].edges.push([+f[col.source_id], +f[col.target_id]]);
        }
    }
    return { ok: true, file: latest.name, tmax, bounds, voxel_scale: { z: 1.625, y: 0.40625, x: 0.40625 }, datasets };
}

// v1881 — list sample IDs in a split (the *.zarr stems), so the cluster scheduler can
// split the workload across peers. Mirrors io_utils.discover_samples without spawning Python.
function listSamples(split) {
    split = String(split || "train").replace(/[^a-z0-9_-]/gi, "");
    const dir = path.join(CT_DIR, "test_data", split);
    if (!fs.existsSync(dir)) return { ok: true, split, samples: [] };
    let samples = [];
    try {
        samples = fs.readdirSync(dir)
            .filter(f => /\.zarr$/i.test(f))
            .map(f => f.replace(/\.zarr$/i, ""))
            .sort();
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true, split, samples };
}

// v1881 — merge several submission CSVs (from cluster peers) into one combined CSV.
// Each part is the standard id,dataset,row_type,node_id,t,z,y,x,source_id,target_id format;
// we concatenate rows and renumber the leading id column so it stays unique/sequential.
function mergeSubmissions(csvTexts, outPath) {
    let header = null;
    const rows = [];
    for (const text of csvTexts) {
        if (!text) continue;
        const lines = String(text).split(/\r?\n/).filter(Boolean);
        if (!lines.length) continue;
        if (!header) header = lines[0];
        for (let i = 1; i < lines.length; i++) rows.push(lines[i]);
    }
    if (!header) return { ok: false, error: "no rows to merge" };
    const idCol = header.split(",").indexOf("id");
    const out = [header];
    let idx = 0;
    for (const r of rows) {
        if (idCol >= 0) {
            const f = r.split(",");
            f[idCol] = String(idx++);
            out.push(f.join(","));
        } else {
            out.push(r);
        }
    }
    const dest = outPath || path.join(CT_DIR, "submission.csv");
    try { fs.writeFileSync(dest, out.join("\n") + "\n"); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true, rows: out.length - 1, path: dest, name: path.basename(dest) };
}

// v1882 — serve the exported density volume for the WebGPU viewer.
function volumeMeta(sample) {
    if (!sample || /[\\/]/.test(sample)) return null;
    const fp = path.join(CT_DIR, "volumes", sample + ".json");
    if (!fs.existsSync(fp)) return null;
    try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
}
function listVolumes() {
    const dir = path.join(CT_DIR, "volumes");
    if (!fs.existsSync(dir)) return { ok: true, volumes: [] };
    let vols = [];
    try {
        vols = fs.readdirSync(dir).filter(f => /\.json$/i.test(f)).map(f => f.replace(/\.json$/i, "")).sort();
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true, volumes: vols };
}
function readVolumeBytes(sample) {
    if (!sample || /[\\/]/.test(sample)) return null;
    const fp = path.join(CT_DIR, "volumes", sample + ".vol");
    if (!fs.existsSync(fp)) return null;
    try { return fs.readFileSync(fp); } catch { return null; }
}

// v1883 — read ONE timepoint's bytes (positioned read, so a big .vol isn't loaded whole).
// Enables on-demand per-frame streaming in the WebGPU viewer for real, large volumes.
function readVolumeFrame(sample, t) {
    if (!sample || /[\\/]/.test(sample)) return null;
    const meta = volumeMeta(sample);
    if (!meta || !Array.isArray(meta.dims)) return null;
    const [D, H, W] = meta.dims;
    const frameSize = D * H * W;
    const T = meta.t || 1;
    let ti = parseInt(t, 10); if (!Number.isFinite(ti)) ti = 0;
    ti = Math.max(0, Math.min(T - 1, ti));
    const fp = path.join(CT_DIR, "volumes", sample + ".vol");
    if (!fs.existsSync(fp)) return null;
    try {
        const fd = fs.openSync(fp, "r");
        const buf = Buffer.alloc(frameSize);
        const read = fs.readSync(fd, buf, 0, frameSize, ti * frameSize);
        fs.closeSync(fd);
        return read === frameSize ? buf : buf.subarray(0, read);
    } catch { return null; }
}

module.exports = { status, log, run, stop, isAvailable, findLatestSubmission, SCRIPTS, checkDeps, installDeps, installDepsAwait, listViz, readViz, tracksJson, listSamples, mergeSubmissions, volumeMeta, listVolumes, readVolumeBytes, readVolumeFrame };
