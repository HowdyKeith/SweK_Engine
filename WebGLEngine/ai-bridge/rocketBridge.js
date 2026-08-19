// WebGLEngine/ai-bridge/rocketBridge.js -- v2217 -- the buttons for the Rocket League RL spike.
//
// The spike (brain/rl/) could only be driven from a terminal. This gives it the same treatment the
// Endless Sky and BZFlag panels got: point at your dumped collision meshes, prepare (probe that
// RocketSim can load them), and execute a training run -- watching its progress -- without a shell.
//
// Owns:
//   GET  /rocket/status          -> meshes path, whether RocketSim is importable + meshes load, run state + last log
//   GET  /rocket/output          -> the training run's captured log (tail)
//   POST /rocket/prepare         -> {meshes} : validate the folder, remember it, and PROBE RocketSim + init(meshes)
//   POST /rocket/install         -> pip install RocketSim (long-running; progress in /rocket/status.install)
//   POST /rocket/train/start     -> {backend,iters,pairs,episodes,save?} : spawn brain/rl/rocketLoop.mjs
//   POST /rocket/train/stop
//
// THESE ROUTES SPAWN PROCESSES (node, python, pip). Every one is behind `_isTrustedReq`, handed in by
// server.js so the bridge cannot decide for itself who is trusted -- localhost, an authenticated session,
// or a LAN peer when the operator has exempted the LAN. Same rule as bzBridge: a route that starts a
// program must not be reachable from the internet, and the check lives in one place.
//
// SAFETY, same discipline as bzBridge/bzProxy:
//   * NO SHELL. spawn() with an argv ARRAY; nothing is ever concatenated into a command line.
//   * The meshes PATH is validated against a pattern (no newline, no shell metachars) and, crucially, is
//     never interpolated into code: the RocketSim probe is a FIXED `python -c` string that reads the path
//     from an ENV VAR, so even a pathological path cannot become python.
//   * Training params are parsed as bounded integers before they become argv entries.

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ENGINE = path.resolve(__dirname, "..");                                   // WebGLEngine
const LOOP = path.join(ENGINE, "brain", "rl", "rocketLoop.mjs");
const BRIDGE_PY = path.join(ENGINE, "brain", "rl", "rocketsim_bridge.py");

const RE_PATH = /^[A-Za-z0-9 _.:\\/()-]{1,400}$/;   // a filesystem path: no newline, no ; | & ` $ ' " * ?
const BACKENDS = new Set(["stub", "rocketsim"]);
const LOG_LINES = 500;
const PROBE_MS = 20000;

let meshesPath = process.env.ROCKETSIM_MESHES || "";
let simReady = null;        // last probe: { ok, detail, at }
let train = null;           // { child, backend, startedAt, log:[], exited, latest:{iter,base}, baseline }
let install = null;         // { child, startedAt, log:[], exited }

function alive(child) { return !!child && child.exitCode === null && !child.killed; }
function capture(child, sink) {
    const feed = (b) => String(b).split("\n").map((s) => s.trim()).filter(Boolean).forEach(sink);
    if (child.stdout) child.stdout.on("data", feed);
    if (child.stderr) child.stderr.on("data", feed);
}
function readBody(req) {
    return new Promise((resolve) => {
        let b = "";
        req.on("data", (c) => { b += c; if (b.length > 65536) b = b.slice(0, 65536); });
        req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
    });
}
function pyExe() { return process.platform === "win32" ? "python" : "python3"; }

// --- validate + remember a meshes folder ----------------------------------------------------------------
function setMeshes(p) {
    p = String(p || "").trim();
    if (!p) return { ok: true, meshes: meshesPath };   // clearing/omitting keeps the current one
    if (!RE_PATH.test(p) || p.includes("..")) return { ok: false, error: "that is not a folder path (no .. and no shell characters)" };
    if (!fs.existsSync(p)) return { ok: false, error: "no such folder: " + p };
    let st; try { st = fs.statSync(p); } catch { return { ok: false, error: "cannot read: " + p }; }
    if (!st.isDirectory()) return { ok: false, error: "collision meshes are a FOLDER, not a file" };
    meshesPath = p;
    return { ok: true, meshes: meshesPath };
}

// --- probe: can python import RocketSim AND load the meshes? --------------------------------------------
// The path travels in an ENV VAR, never in the code string -- so it cannot be interpreted as python.
function probeSim() {
    return new Promise((resolve) => {
        if (!fs.existsSync(BRIDGE_PY)) { simReady = { ok: false, detail: "rocketsim_bridge.py is not in this tree", at: Date.now() }; return resolve(simReady); }
        const code = "import os,sys\n" +
            "try:\n" +
            "    import RocketSim as rs\n" +
            "except Exception as e:\n" +
            "    print('NO_ROCKETSIM: '+str(e)); sys.exit(0)\n" +
            "m=os.environ.get('ROCKETSIM_MESHES','collision_meshes')\n" +
            "try:\n" +
            "    rs.init(m); print('SIMOK '+m)\n" +
            "except Exception as e:\n" +
            "    print('NO_MESHES: '+str(e))\n";
        const env = { ...process.env, ROCKETSIM_MESHES: meshesPath || "collision_meshes" };
        let out = "", done = false;
        const child = spawn(pyExe(), ["-c", code], { env, stdio: ["ignore", "pipe", "pipe"] });
        const finish = (detail, ok) => { if (done) return; done = true; try { child.kill(); } catch {} simReady = { ok, detail, at: Date.now() }; resolve(simReady); };
        const to = setTimeout(() => finish("probe timed out (python not responding)", false), PROBE_MS);
        child.stdout.on("data", (d) => { out += d; });
        child.stderr.on("data", (d) => { out += d; });
        child.on("error", (e) => { clearTimeout(to); finish("python not found: " + e.message + " (install Python, then RocketSim)", false); });
        child.on("exit", () => {
            clearTimeout(to);
            const t = out.trim();
            if (/^SIMOK/.test(t)) finish("RocketSim loaded the meshes -- real physics is ready", true);
            else if (/NO_ROCKETSIM/.test(t)) finish("RocketSim not installed: " + t.replace(/^.*NO_ROCKETSIM:\s*/, "") + " -- use Install, or `pip install RocketSim`", false);
            else if (/NO_MESHES/.test(t)) finish("RocketSim is installed but could not load meshes at '" + (meshesPath || "collision_meshes") + "': " + t.replace(/^.*NO_MESHES:\s*/, "") + " -- point at your dumped collision_meshes", false);
            else finish(t || "python produced no output", false);
        });
    });
}

async function prepare(body) {
    const m = setMeshes(body.meshes);
    if (!m.ok) return m;
    const probe = await probeSim();
    return { ok: true, meshes: meshesPath, sim: probe };
}

// --- pip install RocketSim (long-running) ---------------------------------------------------------------
function startInstall() {
    if (install && alive(install.child)) return { ok: false, error: "an install is already running" };
    const args = ["-m", "pip", "install", "--upgrade", "RocketSim"];
    const child = spawn(pyExe(), args, { stdio: ["ignore", "pipe", "pipe"] });
    install = { child, startedAt: Date.now(), log: [], exited: null };
    capture(child, (l) => { install.log.push(l); if (install.log.length > LOG_LINES) install.log.shift(); });
    child.on("exit", (code) => { if (install && install.child === child) install.exited = code; });
    return { ok: true, pid: child.pid, command: "pip install --upgrade RocketSim" };
}

// --- the training run -----------------------------------------------------------------------------------
function validateTrain(body) {
    const backend = String(body.backend || "stub");
    if (!BACKENDS.has(backend)) return { ok: false, error: `backend must be one of ${[...BACKENDS].join(", ")}` };
    const iters = parseInt(body.iters, 10);
    if (!Number.isFinite(iters) || iters < 1 || iters > 5000) return { ok: false, error: "iters is 1..5000" };
    const pairs = parseInt(body.pairs, 10);
    if (!Number.isFinite(pairs) || pairs < 2 || pairs > 128) return { ok: false, error: "pairs is 2..128" };
    const episodes = parseInt(body.episodes, 10);
    if (!Number.isFinite(episodes) || episodes < 1 || episodes > 32) return { ok: false, error: "episodes is 1..32" };
    let save = String(body.save || "").trim();
    if (save) {
        if (!RE_PATH.test(save) || save.includes("..")) return { ok: false, error: "that is not a save path" };
        const abs = path.resolve(ENGINE, save);
        if (!abs.startsWith(ENGINE + path.sep)) return { ok: false, error: "a save file lives inside the engine directory" };
        save = abs;
    }
    if (backend === "rocketsim" && !(simReady && simReady.ok))
        return { ok: false, error: "real physics is not ready: Prepare with your collision meshes first (or run the stub backend)" };
    return { ok: true, backend, iters, pairs, episodes, save };
}

function startTrain(body) {
    if (train && alive(train.child)) return { ok: false, error: "a training run is already going: stop it first" };
    if (!fs.existsSync(LOOP)) return { ok: false, error: "brain/rl/rocketLoop.mjs is not in this tree" };
    const v = validateTrain(body);
    if (!v.ok) return v;

    // argv is BUILT, never formatted. process.execPath is node; the loop runs the stub itself and, for
    // rocketsim, spawns rocketsim_bridge.py which inherits ROCKETSIM_MESHES from the env we set here.
    const args = [LOOP, "--backend", v.backend, "--iters", String(v.iters), "--pairs", String(v.pairs), "--episodes", String(v.episodes)];
    if (v.save) args.push("--save", v.save);
    const env = { ...process.env, ROCKETSIM_MESHES: meshesPath || "collision_meshes" };

    const child = spawn(process.execPath, args, { cwd: ENGINE, env, stdio: ["ignore", "pipe", "pipe"] });
    train = { child, backend: v.backend, iters: v.iters, startedAt: Date.now(), log: [], exited: null, latest: null, baseline: null };
    const reBase = /\[rl-es\]\s+iter\s+(\d+)[^]*?base=(-?\d+(?:\.\d+)?)/;
    const reBaseline = /\[rl-es\]\s+iter\s+0\s+\(baseline\)\s+base=(-?\d+(?:\.\d+)?)/;
    capture(child, (l) => {
        train.log.push(l); if (train.log.length > LOG_LINES) train.log.shift();
        const mb = reBaseline.exec(l); if (mb) train.baseline = parseFloat(mb[1]);
        const m = reBase.exec(l); if (m) train.latest = { iter: parseInt(m[1], 10), base: parseFloat(m[2]) };
    });
    child.on("exit", (code) => { if (train && train.child === child) train.exited = code; });
    const shown = ["node", "brain/rl/rocketLoop.mjs", ...args.slice(1)].join(" ");
    return { ok: true, pid: child.pid, backend: v.backend, command: shown };
}

function stopTrain() { if (!train) return { ok: true, already: true }; try { train.child.kill(); } catch {} return { ok: true }; }

// --- status ---------------------------------------------------------------------------------------------
function status() {
    return {
        ok: true,
        meshes: meshesPath || null,
        sim: simReady,                                   // null until first probe
        install: install ? { running: alive(install.child), exited: install.exited, uptimeMs: Date.now() - install.startedAt, last: install.log[install.log.length - 1] || null } : null,
        train: train ? {
            running: alive(train.child), backend: train.backend, iters: train.iters,
            uptimeMs: Date.now() - train.startedAt, exited: train.exited,
            baseline: train.baseline, latest: train.latest,
            delta: (train.baseline != null && train.latest) ? +(train.latest.base - train.baseline).toFixed(3) : null,
            last: train.log[train.log.length - 1] || null,
        } : null,
    };
}
function output() { return { ok: true, running: train ? alive(train.child) : false, exited: train ? train.exited : null, log: train ? train.log.slice() : [] }; }

// --- routing --------------------------------------------------------------------------------------------
const ROUTES = new Set(["/rocket/status", "/rocket/output", "/rocket/prepare", "/rocket/install", "/rocket/train/start", "/rocket/train/stop"]);
function owns(url) { return ROUTES.has((url || "").split("?")[0]); }

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const p = (req.url || "").split("?")[0];

    const trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : false;
    if (!trusted) return sendJson({ ok: false, error: "not trusted: /rocket/* controls processes and is host, session or LAN only" }, 403);

    if (req.method === "GET" && p === "/rocket/status") return sendJson(status());
    if (req.method === "GET" && p === "/rocket/output") return sendJson(output());

    if (req.method !== "POST") return sendJson({ ok: false, error: "POST" }, 405);
    const body = await readBody(req);

    if (p === "/rocket/prepare") return sendJson(await prepare(body));
    if (p === "/rocket/install") return sendJson(startInstall());
    if (p === "/rocket/train/start") return sendJson(startTrain(body));
    if (p === "/rocket/train/stop") return sendJson(stopTrain());

    return sendJson({ ok: false, error: "no such route" }, 404);
}

function shutdown() { try { if (train) train.child.kill(); } catch {} try { if (install) install.child.kill(); } catch {} }

module.exports = { owns, handle, status, output, prepare, setMeshes, probeSim, startInstall, startTrain, stopTrain, validateTrain, shutdown, _routes: ROUTES };
