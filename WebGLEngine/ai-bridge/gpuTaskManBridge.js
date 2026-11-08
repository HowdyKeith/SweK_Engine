// WebGLEngine/ai-bridge/gpuTaskManBridge.js -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------
// THE ENGINE'S SIDE OF gputaskman (github.com/shanselman/gputaskman, MIT, a Python terminal monitor for what is inside a
// GPU: per-process VRAM, "Spill", engine activity, the runtime and the model file). It is somebody else's early software
// and nothing of it is in this tree. This module does four things for gputaskman.html, and NOTHING ELSE:
//
//   detect()          what is on this machine: uv / pipx / python (versions), gputaskman (where, and whether it can list
//                     the GPUs), and Ollama (up? version? which models are pulled?). Never throws, never installs.
//   install(method)   `uv tool install gputaskman` or `pipx install gputaskman`, from a FIXED ALLOW-LIST of two argument
//                     vectors, run with execFile (no shell, so nothing the caller sends can become a command).
//   snapshot()        `gputaskman --once --json` (and `--gpu N` for a whole number), parsed.
//   runSession(...)   THE ONE THE OWNER ASKED FOR ("have swek start the model, run gputaskman, save a snapshot, and give me
//                     the json to send"): baseline snapshot -> load an Ollama model through Ollama's own HTTP API (an empty
//                     prompt loads it; no process is spawned for Ollama) -> snapshot with the model resident -> a short
//                     generation, with a snapshot taken WHILE it runs -> Ollama's own /api/ps (how much of the model sits in
//                     VRAM) -> one JSON file in brain/rig-results/gpu-snapshots/. The jobs wrapper (startSession/jobStatus)
//                     lets a page watch a load that can take minutes.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not start Ollama (a stopped Ollama is reported, with how to start it; the
// Windows app serves on 11434 by itself). It does not pull weights (a missing model is reported with the `ollama pull`
// line). It talks only to a LOOPBACK Ollama (127.0.0.1 / localhost / ::1): a page cannot aim it at another host. It does
// not put the machine's name, the user's name or any absolute path into the saved JSON; the file's RELATIVE path is
// returned beside it. What gputaskman itself reports (the programs using the GPU) is passed through untouched, so the page
// tells the reader to look before sending.
//
// Everything that touches the world takes it as an OPTIONAL injected param (execFileImpl, fetchImpl, fsImpl, osImpl,
// sleepImpl, now, platform, env, home, root) and defaults to the real thing, the pattern of mlxInstallBridge.js, so
// tools/ship/gpuTaskManBridge-selfcheck.mjs drives every branch with no GPU, no Ollama, no pip and no gigabyte of weights.
//
// NOT DONE, said plainly: it has not run against a real gputaskman, a real Ollama or a real GPU (the sandbox that wrote it
// has none); the JSON shape of `gputaskman --json` is not described in its README, so the snapshot is stored as it comes.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

const nodeCp = require("child_process");
const nodeFs = require("fs");
const nodePath = require("path");
const nodeOs = require("os");

const PACKAGE = "gputaskman";
const REPO_URL = "https://github.com/shanselman/gputaskman";
const DEFAULT_BASE = "http://127.0.0.1:11434";
const SNAPSHOT_DIR = Object.freeze(["brain", "rig-results", "gpu-snapshots"]);
const FILE_SCHEMA = 1;
const KEEP_ALIVE = "15m";
const DEFAULT_NUM_PREDICT = 200, MIN_NUM_PREDICT = 16, MAX_NUM_PREDICT = 1024;
const DEFAULT_SETTLE_MS = 2500, MAX_SETTLE_MS = 60000;
/** Every wait this module sets, in ms: pinned by the gate at the place each one is used. */
const TIMEOUTS = Object.freeze({ version: 4000, tags: 6000, ps: 6000, load: 15 * 60 * 1000, generate: 20 * 60 * 1000, unload: 60000, listGpus: 15000, versionCmd: 8000, snapshot: 45000, nvidiaSmi: 15000, install: 5 * 60 * 1000, cmd: 30000 });
const PROMPT = "Write a Python function that returns the n-th Fibonacci number iteratively, with a docstring and three assert-based tests. Then explain it in two sentences.";

const mk = (id, cmd, args) => Object.freeze({ id, cmd, args: Object.freeze(args), text: [cmd, ...args].join(" ") });
/** The ONLY commands install() will run. A method name is looked up here and nowhere is a string built into a command. */
const INSTALLERS = Object.freeze({
    uv: mk("uv", "uv", ["tool", "install", PACKAGE]),
    pipx: mk("pipx", "pipx", ["install", PACKAGE]),
});

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const tail = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? "..." + s.slice(s.length - n) : s; };
const nowOf = (o) => (o && typeof o.now === "function" ? o.now() : new Date());
const iso = (d) => new Date(d).toISOString();
const stamp = (d) => iso(d).replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
const gb = (n) => (Number.isFinite(n) ? Math.round((n / 1073741824) * 100) / 100 : null);
const sleepOf = (o) => (o && o.sleepImpl) || ((ms) => new Promise((r) => setTimeout(r, ms)));

/** A model name safe to put in a JSON body for Ollama: letters, digits and . _ : / @ + - only, starting with a letter or digit. */
function validModel(name) { return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._:\/@+-]{0,199}$/.test(name); }

/** A name safe to put in a file name: everything outside [A-Za-z0-9._-] becomes '-', no leading '-' or '.', at most 80 characters. */
function safeName(s) { return String(s == null ? "" : s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 80) || "model"; }

/** The origin of a LOOPBACK http base ("http://127.0.0.1:11434"), or null. No credentials, no path, no other host. */
function loopbackBase(base) {
    let u; try { u = new URL(String(base == null || base === "" ? DEFAULT_BASE : base)); } catch (e) { return null; }
    if (u.protocol !== "http:" || u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost" && u.hostname !== "[::1]") return null;
    return u.origin;
}

/** The places gputaskman may be: the PATH first, then ~/.local/bin (where uv and pipx put tools on every OS, Windows included). */
function binCandidates(o = {}) {
    const platform = o.platform || process.platform, win = platform === "win32", pm = win ? nodePath.win32 : nodePath.posix;
    const home = o.home !== undefined ? o.home : (nodeOs.homedir ? nodeOs.homedir() : "");
    const exe = win ? PACKAGE + ".exe" : PACKAGE;
    const list = [PACKAGE];
    if (home) list.push(pm.join(home, ".local", "bin", exe));
    return list;
}

/** Run a command, ALWAYS resolving (never rejecting): { ok, code, errCode, notFound, timedOut, stdout, stderr, error }. No shell. */
function runCmd(execFileImpl, cmd, args, o = {}) {
    return new Promise((resolve) => {
        const fin = resolve;   // a Promise settles once: a callback that fires twice changes nothing
        const bad = (e, stdout, stderr) => ({
            ok: false, code: typeof e.code === "number" ? e.code : null, errCode: typeof e.code === "string" ? e.code : null,
            notFound: e.code === "ENOENT", timedOut: e.killed === true, stdout: String(stdout || ""), stderr: String(stderr || ""), error: String((e && e.message) || e),
        });
        try {
            execFileImpl(cmd, args, { timeout: o.timeoutMs || TIMEOUTS.cmd, windowsHide: true, maxBuffer: o.maxBuffer || 16 * 1024 * 1024, shell: false, env: o.env || process.env }, (err, stdout, stderr) => {
                if (err) fin(bad(err, stdout, stderr));
                else fin({ ok: true, code: 0, errCode: null, notFound: false, timedOut: false, stdout: String(stdout || ""), stderr: String(stderr || ""), error: "" });
            });
        } catch (e) { fin(bad(e || {}, "", "")); }
    });
}
const execOf = (o) => (o && o.execFileImpl) || nodeCp.execFile;
const fetchOf = (o) => (o && o.fetchImpl) || (typeof fetch === "function" ? fetch : null);

/** JSON from a command's stdout: the whole text, or failing that the span from the first { or [ to the last } or ]. */
function parseJsonLoose(text) {
    const t = String(text == null ? "" : text).trim();
    if (!t) return { ok: false, value: null };
    try { return { ok: true, value: JSON.parse(t) }; } catch (e) { /* fall through */ }
    const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return { ok: true, value: JSON.parse(t.slice(a, b + 1)) }; } catch (e) { /* fall through */ } }
    return { ok: false, value: null };
}

// ---- gputaskman, uv, pipx, python ----------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Find gputaskman: { installed, works, path, gpus (the --list-gpus text), error, tried }. ENOENT everywhere = not installed; a binary that runs and fails = installed, not working. */
async function locate(o = {}) {
    const ex = execOf(o), tried = [];
    for (const cand of binCandidates(o)) {
        const r = await runCmd(ex, cand, ["--list-gpus"], { timeoutMs: TIMEOUTS.listGpus, env: o.env });
        tried.push(cand === PACKAGE ? "PATH" : "~/.local/bin");
        if (r.notFound) continue;
        return { installed: true, works: r.ok, path: cand, gpus: r.ok ? tail(r.stdout.trim(), 1500) : null, error: r.ok ? "" : (r.timedOut ? "timed out listing the GPUs" : tail(r.stderr.trim() || r.error, 600)), tried };
    }
    return { installed: false, works: false, path: null, gpus: null, error: "", tried };
}

async function versionOf(o, cmd, args = ["--version"]) {
    const r = await runCmd(execOf(o), cmd, args, { timeoutMs: TIMEOUTS.versionCmd, env: o.env });
    return r.ok ? { found: true, version: tail((r.stdout || r.stderr).trim().split(/\r?\n/)[0], 120) } : { found: !r.notFound, version: "", error: r.notFound ? "not found" : tail(r.stderr.trim() || r.error, 200) };
}

async function pythonVersion(o) {
    for (const cmd of ["python", "python3", "py"]) { const v = await versionOf(o, cmd); if (v.found && v.version) return { ...v, cmd }; }
    return { found: false, version: "", cmd: "" };
}

// ---- Ollama, through its HTTP API only --------------------------------------------------------------------------------------------------------------------------------------------------------------
async function http(o, method, url, body, timeoutMs) {
    const f = fetchOf(o); if (!f) return { ok: false, status: 0, json: null, error: "no fetch in this runtime (the engine needs Node 18 or later)", ms: 0, noFetch: true };
    const clock = (o && o.nowMs) || Date.now, st = (o && o.setTimeoutImpl) || setTimeout, ct = (o && o.clearTimeoutImpl) || clearTimeout;
    const t0 = clock(), ac = typeof AbortController === "function" ? new AbortController() : null, timer = ac ? st(() => ac.abort(), timeoutMs) : null;
    if (timer && typeof timer.unref === "function") timer.unref();   // a request timeout must never be what keeps the process alive
    try {
        const init = { method, headers: body === undefined ? {} : { "Content-Type": "application/json" } };
        if (body !== undefined) init.body = JSON.stringify(body);
        if (ac) init.signal = ac.signal;
        const r = await f(url, init);
        let json = null; try { json = await r.json(); } catch (e) { json = null; }
        return { ok: !!r.ok, status: r.status, json, error: r.ok ? "" : String((json && json.error) || ("HTTP " + r.status)), ms: clock() - t0 };
    } catch (e) { return { ok: false, status: 0, json: null, error: ac && ac.signal.aborted ? "timed out" : String((e && e.message) || e), ms: clock() - t0 }; }
    finally { if (timer) ct(timer); }
}

async function ollamaStatus(o = {}) {
    const base = loopbackBase(o.base); if (!base) return { up: false, base: null, error: "the Ollama address must be http://127.0.0.1:PORT or http://localhost:PORT (a loopback address)", models: [] };
    const v = await http(o, "GET", base + "/api/version", undefined, TIMEOUTS.version);
    if (!v.ok) return { up: false, base, error: v.noFetch ? v.error : v.error === "timed out" || v.status === 0 ? "nothing answered at " + base + " (is Ollama running? the Windows app starts it; otherwise run `ollama serve`)" : v.error, models: [] };
    const t = await http(o, "GET", base + "/api/tags", undefined, TIMEOUTS.tags);
    const models = t.ok && t.json && Array.isArray(t.json.models) ? t.json.models.map((m) => ({ name: String(m.name || m.model || ""), sizeBytes: Number(m.size) || 0 })).filter((m) => m.name) : [];
    return { up: true, base, version: String((v.json && v.json.version) || ""), models, error: "" };
}

async function ollamaLoad(model, o = {}) {
    const base = loopbackBase(o.base); if (!base) return { ok: false, error: "the Ollama address must be a loopback address" };
    if (!validModel(model)) return { ok: false, error: "that is not a model name Ollama could have (letters, digits and . _ : / @ + - only)" };
    const r = await http(o, "POST", base + "/api/generate", { model, prompt: "", stream: false, keep_alive: KEEP_ALIVE }, o.loadTimeoutMs || TIMEOUTS.load);
    if (r.ok) return { ok: true, ms: r.ms, doneReason: String((r.json && r.json.done_reason) || ""), error: "" };
    return { ok: false, ms: r.ms, status: r.status, error: r.error, hint: r.status === 404 ? "Ollama does not have that model: pull it first with  ollama pull " + model : "" };
}

async function ollamaPs(o = {}) {
    const base = loopbackBase(o.base); if (!base) return { ok: false, error: "the Ollama address must be a loopback address", models: [] };
    const r = await http(o, "GET", base + "/api/ps", undefined, TIMEOUTS.ps);
    if (!r.ok) return { ok: false, error: r.error, models: [] };
    const list = r.json && Array.isArray(r.json.models) ? r.json.models : [];
    return { ok: true, error: "", models: list.map((m) => ({ name: String(m.name || m.model || ""), sizeBytes: Number(m.size) || 0, sizeVramBytes: Number(m.size_vram) || 0, expiresAt: m.expires_at || null, contextLength: m.context_length === undefined ? null : m.context_length, details: m.details || null })) };
}

async function ollamaGenerate(model, prompt, numPredict, o = {}) {
    const base = loopbackBase(o.base); if (!base) return { ok: false, error: "the Ollama address must be a loopback address" };
    if (!validModel(model)) return { ok: false, error: "that is not a model name Ollama could have" };
    const n = Math.min(MAX_NUM_PREDICT, Math.max(MIN_NUM_PREDICT, Math.floor(Number(numPredict) || DEFAULT_NUM_PREDICT)));
    const r = await http(o, "POST", base + "/api/generate", { model, prompt, stream: false, keep_alive: KEEP_ALIVE, options: { num_predict: n, temperature: 0 } }, o.generateTimeoutMs || TIMEOUTS.generate);
    if (!r.ok) return { ok: false, ms: r.ms, status: r.status, error: r.error, numPredict: n };
    const j = r.json || {}, per = (c, d) => (Number(d) > 0 ? Math.round((Number(c) / (Number(d) / 1e9)) * 100) / 100 : null);
    return {
        ok: true, ms: r.ms, numPredict: n, responseHead: String(j.response || "").slice(0, 400),
        evalCount: Number(j.eval_count) || 0, evalDurationNs: Number(j.eval_duration) || 0, promptEvalCount: Number(j.prompt_eval_count) || 0, promptEvalDurationNs: Number(j.prompt_eval_duration) || 0,
        loadDurationNs: Number(j.load_duration) || 0, totalDurationNs: Number(j.total_duration) || 0,
        tokensPerSecond: per(j.eval_count, j.eval_duration), promptTokensPerSecond: per(j.prompt_eval_count, j.prompt_eval_duration), error: "",
    };
}

async function ollamaUnload(model, o = {}) {
    const base = loopbackBase(o.base); if (!base || !validModel(model)) return { ok: false, error: "refused" };
    const r = await http(o, "POST", base + "/api/generate", { model, prompt: "", stream: false, keep_alive: 0 }, TIMEOUTS.unload);
    return { ok: r.ok, error: r.ok ? "" : r.error };
}

// ---- the monitor, the snapshot, the host ----------------------------------------------------------------------------------------------------------------------------------------------------------
/** `gputaskman --once --json` (plus `--gpu N` for a whole number 0 to 63): { ok, at, command, json | raw, stderr, error }. */
async function snapshot(o = {}) {
    const loc = o.bin ? { installed: true, path: o.bin } : await locate(o);
    if (!loc.installed) return { ok: false, at: iso(nowOf(o)), command: "gputaskman --once --json", error: "gputaskman is not installed, or this bridge cannot find it on its PATH (restart the bridge after installing)" };
    const args = ["--once", "--json"];
    if (o.gpu !== undefined && o.gpu !== null && o.gpu !== "") {
        const n = typeof o.gpu === "number" ? o.gpu : (typeof o.gpu === "string" && /^\d{1,2}$/.test(o.gpu) ? Number(o.gpu) : NaN);
        if (!Number.isInteger(n) || n < 0 || n > 63) return { ok: false, at: iso(nowOf(o)), command: "gputaskman --once --json", error: "the GPU number must be a whole number from 0 to 63" };
        args.push("--gpu", String(n));
    }
    const at = iso(nowOf(o)), r = await runCmd(execOf(o), loc.path, args, { timeoutMs: o.timeoutMs || TIMEOUTS.snapshot, env: o.env }), p = parseJsonLoose(r.stdout);
    const command = "gputaskman " + args.join(" ");
    if (r.ok && p.ok) return { ok: true, at, command, json: p.value, error: "" };
    return { ok: false, at, command, json: p.ok ? p.value : null, raw: p.ok ? undefined : tail(r.stdout, 4000), stderr: tail(r.stderr, 1500), error: r.timedOut ? "gputaskman did not answer within the time allowed" : (r.ok ? "gputaskman printed something that is not JSON" : tail(r.stderr.trim() || r.error, 600)) };
}

/** What nvidia-smi says (a plain second opinion, present only where the driver's tool is): { ok, gpus:[{index,name,driver,memoryTotalMiB,memoryUsedMiB,utilizationPct,temperatureC}] | error }. */
async function nvidiaSmi(o = {}) {
    const q = "--query-gpu=index,name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu";
    const r = await runCmd(execOf(o), "nvidia-smi", [q, "--format=csv,noheader,nounits"], { timeoutMs: TIMEOUTS.nvidiaSmi, env: o.env });
    if (!r.ok) return { ok: false, error: r.notFound ? "nvidia-smi not found" : tail(r.stderr.trim() || r.error, 300) };
    const num = (s) => { const x = Number(String(s).trim()); return Number.isFinite(x) ? x : null; };
    const gpus = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const c = l.split(",").map((x) => x.trim()); return { index: num(c[0]), name: c[1] || "", driver: c[2] || "", memoryTotalMiB: num(c[3]), memoryUsedMiB: num(c[4]), utilizationPct: num(c[5]), temperatureC: num(c[6]) }; });
    return { ok: true, gpus, error: "" };
}

/** The machine in numbers: no host name, no user name, no path. */
function hostInfo(o = {}) {
    const os = o.osImpl || nodeOs, cpus = (os.cpus && os.cpus()) || [];
    return { platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: cpus[0] ? String(cpus[0].model || "").trim() : "", cpuCount: cpus.length, totalMemGB: gb(os.totalmem()), freeMemGB: gb(os.freemem()), node: o.nodeVersion || process.version };
}

// ---- detect and install --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function detect(o = {}) {
    const [uv, pipx, python, g, ollama] = await Promise.all([versionOf(o, "uv"), versionOf(o, "pipx"), pythonVersion(o), locate(o), ollamaStatus(o)]);
    return { ok: true, platform: o.platform || process.platform, repo: REPO_URL, package: PACKAGE, installers: { uv: { ...uv, command: INSTALLERS.uv.text }, pipx: { ...pipx, command: INSTALLERS.pipx.text } }, python, gputaskman: g, ollama };
}

async function install(method, o = {}) {
    if (typeof method !== "string" || !hasOwn(INSTALLERS, method)) return { ok: false, refused: true, error: "unknown installer " + JSON.stringify(method) + " (the choices are: " + Object.keys(INSTALLERS).join(", ") + ")" };
    const inst = INSTALLERS[method], r = await runCmd(execOf(o), inst.cmd, inst.args, { timeoutMs: o.timeoutMs || TIMEOUTS.install, env: o.env });
    if (r.notFound) return { ok: false, method, command: inst.text, error: inst.cmd + " is not installed on this machine", hint: method === "uv" ? "install uv first (https://docs.astral.sh/uv/), or use pipx" : "install pipx first (https://pipx.pypa.io/), or use uv" };
    const g = await locate(o);
    return {
        ok: r.ok, method, command: inst.text, exitCode: r.code, timedOut: r.timedOut, stdout: tail(r.stdout, 3000), stderr: tail(r.stderr, 3000), installed: g.installed, path: g.installed ? g.path : null,
        error: r.ok ? "" : (r.timedOut ? "the install did not finish within five minutes" : tail(r.stderr.trim() || r.error, 600)),
        hint: r.ok && !g.installed ? "it installed, but this bridge cannot find it yet: uv and pipx add ~/.local/bin to the PATH for NEW terminals only, so restart the bridge from a new terminal" : "",
    };
}

// ---- the session ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Write the session's JSON under <root>/brain/rig-results/gpu-snapshots/. The name is built from a timestamp and safeName(model): nothing the caller sends can leave that folder. */
function save(result, model, o = {}) {
    const fs = o.fsImpl || nodeFs, root = o.root || nodePath.resolve(__dirname, ".."), dir = nodePath.join(root, ...SNAPSHOT_DIR);
    const name = "gpusnap-" + stamp(result.startedAt) + "-" + safeName(model) + ".json", abs = nodePath.join(dir, name);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(abs, JSON.stringify(result, null, 2) + "\n"); }
    catch (e) { return { ok: false, error: "could not write the snapshot file: " + String((e && e.message) || e) }; }
    return { ok: true, relative: SNAPSHOT_DIR.join("/") + "/" + name, absolute: abs, error: "" };
}

/** hostInfo that never throws: a machine that will not say what it is does not stop the session. */
function safeHost(o) { try { return hostInfo(o); } catch (e) { return { error: "could not read the machine: " + String((e && e.message) || e) }; } }

/** The session: baseline -> load -> loaded -> busy -> after. Resolves to { result, saved }; never rejects. */
async function runSession(p = {}, o = {}) {
    const startedAt = iso(nowOf(o)), model = p.model, steps = [];
    const log = (step, ok, note) => { const e = { at: iso(nowOf(o)), step, ok, note: String(note || "") }; steps.push(e); if (typeof o.onStep === "function") { try { o.onStep(e); } catch (x) { /* a progress hook must never stop the run */ } } };
    const base = loopbackBase(p.base || o.base), numPredict = Math.min(MAX_NUM_PREDICT, Math.max(MIN_NUM_PREDICT, Math.floor(Number(p.numPredict) || DEFAULT_NUM_PREDICT)));
    const result = { schema: FILE_SCHEMA, kind: "gputaskman-session", startedAt, finishedAt: null, ok: false, error: "", saveError: "", request: { model: typeof model === "string" ? model : null, base, numPredict, prompt: PROMPT, unloadWhenDone: !!p.unloadWhenDone }, host: safeHost(o), ollama: null, gputaskman: null, nvidiaSmi: {}, snapshots: {}, steps, summary: null };
    const finish = (error, refused) => { result.error = error || ""; result.finishedAt = iso(nowOf(o)); result.ok = !error; if (refused) return { result, saved: { ok: false, error: "nothing was saved: the request was refused" } }; const saved = save(result, model, o); if (!saved.ok) result.saveError = saved.error; return { result, saved }; };
    try {
        if (!validModel(model)) { log("check", false, "the model name is not valid"); return finish("the model name is not valid (letters, digits and . _ : / @ + - only)", true); }
        if (!base) { log("check", false, "the Ollama address is not a loopback address"); return finish("the Ollama address must be http://127.0.0.1:PORT or http://localhost:PORT", true); }
        const ob = { ...o, base };
        const d = await detect(ob);
        result.gputaskman = { installed: d.gputaskman.installed, works: d.gputaskman.works, gpus: d.gputaskman.gpus, error: d.gputaskman.error };
        result.ollama = { up: d.ollama.up, version: d.ollama.version || "", error: d.ollama.error || "", modelPulled: d.ollama.up ? d.ollama.models.some((m) => m.name === model || m.name === model + ":latest") : null, loadMs: null, ps: {}, generate: null, unloaded: null };
        log("detect", true, `gputaskman ${d.gputaskman.installed ? (d.gputaskman.works ? "found" : "found but not working") : "not found"}; Ollama ${d.ollama.up ? "up (" + (d.ollama.version || "?") + ")" : "NOT answering"}`);
        const shoot = async (label) => {
            const [g, n] = await Promise.all([d.gputaskman.installed ? snapshot({ ...ob, bin: d.gputaskman.path }) : Promise.resolve({ ok: false, error: "gputaskman is not installed" }), nvidiaSmi(ob)]);
            result.snapshots[label] = g; result.nvidiaSmi[label] = n;
            log("snapshot-" + label, g.ok || n.ok, `${g.ok ? "gputaskman ok" : "gputaskman: " + g.error}; ${n.ok ? "nvidia-smi ok" : "nvidia-smi: " + n.error}`);
        };
        await shoot("baseline");
        if (!d.ollama.up) return finish("Ollama is not answering at " + base + (d.ollama.error ? ": " + d.ollama.error : ""));
        log("load", true, "loading " + model + " (a large model can take minutes)");
        const L = await ollamaLoad(model, ob); result.ollama.loadMs = L.ms === undefined ? null : L.ms;
        if (!L.ok) { log("load", false, L.error + (L.hint ? " -- " + L.hint : "")); return finish("Ollama could not load " + model + ": " + L.error + (L.hint ? " (" + L.hint + ")" : "")); }
        log("load", true, `loaded in ${Math.round(L.ms / 100) / 10} s`);
        result.ollama.ps.loaded = await ollamaPs(ob); await shoot("loaded");
        log("generate", true, `asking for up to ${numPredict} tokens and taking a snapshot while it runs`);
        const gen = ollamaGenerate(model, PROMPT, numPredict, ob);
        await sleepOf(o)(p.settleMs === undefined || p.settleMs === null ? DEFAULT_SETTLE_MS : Math.min(MAX_SETTLE_MS, Math.max(0, Number(p.settleMs) || 0)));
        result.ollama.ps.busy = await ollamaPs(ob); await shoot("busy");
        const G = await gen; result.ollama.generate = G;
        log("generate", G.ok, G.ok ? `${G.evalCount} tokens at ${G.tokensPerSecond === null ? "?" : G.tokensPerSecond} tokens/s (prompt ${G.promptTokensPerSecond === null ? "?" : G.promptTokensPerSecond}/s)` : G.error);
        result.ollama.ps.after = await ollamaPs(ob);
        const mine = (list) => { if (!list || !list.ok) return null; return list.models.find((m) => m.name === model) || list.models.find((m) => m.name === model + ":latest") || null; };
        const m = mine(result.ollama.ps.busy) || mine(result.ollama.ps.loaded);
        result.summary = { modelSizeGB: m ? gb(m.sizeBytes) : null, inVramGB: m ? gb(m.sizeVramBytes) : null, onGpuPct: m && m.sizeBytes > 0 ? Math.round((m.sizeVramBytes / m.sizeBytes) * 1000) / 10 : null, tokensPerSecond: G.ok ? G.tokensPerSecond : null, loadSeconds: L.ms === undefined ? null : Math.round(L.ms / 100) / 10, gputaskmanInstalled: d.gputaskman.installed };
        if (p.unloadWhenDone) { const U = await ollamaUnload(model, ob); result.ollama.unloaded = U.ok; log("unload", U.ok, U.ok ? "unloaded" : U.error); }
        return finish(G.ok ? "" : "the model loaded but the test generation failed: " + G.error);
    } catch (e) { log("error", false, String((e && e.message) || e)); return finish("the session failed: " + String((e && e.message) || e)); }
}

// ---- jobs: a page starts a session and polls it -------------------------------------------------------------------------------------------------------------------------------------------------
const _jobs = new Map(); let _seq = 0;
const MAX_JOBS = 5;
function _reset() { _jobs.clear(); _seq = 0; }

function startSession(p = {}, o = {}) {
    for (const j of _jobs.values()) if (j.state === "running") return { ok: false, error: "a session is already running", id: j.id };
    if (!validModel(p.model)) return { ok: false, error: "the model name is not valid (letters, digits and . _ : / @ + - only)" };
    if (!loopbackBase(p.base)) return { ok: false, error: "the Ollama address must be http://127.0.0.1:PORT or http://localhost:PORT" };
    const id = "gt" + (++_seq) + "-" + new Date(nowOf(o)).getTime().toString(36), job = { id, state: "running", startedAt: iso(nowOf(o)), steps: [], result: null, saved: null, error: "" };
    _jobs.set(id, job); while (_jobs.size > MAX_JOBS) _jobs.delete(_jobs.keys().next().value);
    runSession(p, { ...o, onStep: (e) => job.steps.push(e) }).then((r) => { job.result = r.result; job.saved = r.saved; job.error = r.result.error; job.state = r.result.ok ? "done" : "error"; })
        .catch((e) => { job.state = "error"; job.error = String((e && e.message) || e); });
    return { ok: true, id };
}

function jobStatus(id) {
    const j = typeof id === "string" ? _jobs.get(id) : null;
    if (!j) return { ok: false, error: "no such session (the bridge keeps the last " + MAX_JOBS + ")" };
    const fin = j.state !== "running";
    return { ok: true, id: j.id, state: j.state, startedAt: j.startedAt, steps: j.steps.slice(), error: j.error, savedAs: fin && j.saved && j.saved.ok ? j.saved.relative : null, savedAbsolute: fin && j.saved && j.saved.ok ? j.saved.absolute : null, result: fin ? j.result : null };
}

module.exports = {
    PACKAGE, REPO_URL, DEFAULT_BASE, INSTALLERS, TIMEOUTS, PROMPT, SNAPSHOT_DIR, FILE_SCHEMA, KEEP_ALIVE,
    detect, install, snapshot, nvidiaSmi, hostInfo, locate, ollamaStatus, ollamaLoad, ollamaPs, ollamaGenerate, ollamaUnload, runSession, startSession, jobStatus, save,
    _validModel: validModel, _safeName: safeName, _loopbackBase: loopbackBase, _binCandidates: binCandidates, _parseJsonLoose: parseJsonLoose, _runCmd: runCmd, _reset,
};
