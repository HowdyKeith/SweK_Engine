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
//   runWatch(...)     SAMPLING OVER TIME (added 2026-11-08, "build 'sample for N seconds'" and "have gputaskman show the GPU brain"):
//                     one JSON file of many snapshots, each a gputaskman --once --json and an nvidia-smi query taken together and stamped with
//                     the milliseconds since the start. Two modes. "sample": watch the card for N seconds while the owner runs something
//                     (nothing is started). "brain": run the engine's own GPU-brain swarm (`node tools/ship/gpuSwarm.mjs --hardware`, a FIXED
//                     argument vector with only whole numbers from small allow-lists, NEVER --write, so its timings, taken while being watched, can
//                     never land in brain/rig-results/gpuSwarm.jsonl) with two snapshots before it, one every interval while it runs, and two
//                     after. The Ollama session takes the same option (sampleSeconds): a series while the test answer is generated.
//                     From each snapshot it reads a few fields, defensively (written against gputaskman 0.3.3, whose source was read on 2026-11-08:
//                     device.util_gpu / sm_clock / power_w and, per process, name, pid, runtimes, gpu_pct, engines, vram_bytes) so that the answer to
//                     "which program used the card, under which runtime (Direct3D, Vulkan, CUDA...)" is in the summary; the snapshots themselves are
//                     stored whole as they came, up to a size budget (the rest are marked omitted, with their sizes). Each gputaskman snapshot
//                     takes at least a second and usually two or three (it samples twice, a second apart, and starts Python), so the interval is a floor.
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
// tools/ship/gpuTaskManBridge-selfcheck.mjs drives every branch without a graphics card, an Ollama server, pip or a gigabyte of weights.
//
// NOT DONE, said plainly: it was never exercised against a real gputaskman, a real Ollama or a real graphics card (the machine that wrote it
// lacks all three); the JSON shape of `gputaskman --json` is not described in its README, so the snapshot is stored as it comes.
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
const TIMEOUTS = Object.freeze({ version: 4000, tags: 6000, ps: 6000, load: 15 * 60 * 1000, generate: 20 * 60 * 1000, unload: 60000, listGpus: 15000, versionCmd: 8000, snapshot: 45000, nvidiaSmi: 15000, install: 5 * 60 * 1000, cmd: 30000, brain: 30 * 60 * 1000 });
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
const msOf = (o) => (o && o.nowMs) || Date.now;

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
            execFileImpl(cmd, args, { timeout: o.timeoutMs || TIMEOUTS.cmd, windowsHide: true, maxBuffer: o.maxBuffer || 16 * 1024 * 1024, shell: false, env: o.env || process.env, ...(o.cwd ? { cwd: o.cwd } : {}) }, (err, stdout, stderr) => {
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
/** A GPU number for `--gpu`: nothing (undefined, null, "") is { ok: true, n: null }; a number, or a one- or two-digit string, from 0 to 63 is { ok: true, n }; anything else is { ok: false }. */
function gpuArg(v) {
    if (v === undefined || v === null || v === "") return { ok: true, n: null };
    const n = typeof v === "number" ? v : (typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : NaN);
    return Number.isInteger(n) && n >= 0 && n <= 63 ? { ok: true, n } : { ok: false, n: null };
}

/** `gputaskman --once --json` (plus `--gpu N` for a whole number 0 to 63): { ok, at, command, json | raw, stderr, error }. */
async function snapshot(o = {}) {
    const loc = o.bin ? { installed: true, path: o.bin } : await locate(o);
    if (!loc.installed) return { ok: false, at: iso(nowOf(o)), command: "gputaskman --once --json", error: "gputaskman is not installed, or this bridge cannot find it on its PATH (restart the bridge after installing)" };
    const args = ["--once", "--json"];
    const g = gpuArg(o.gpu);
    if (!g.ok) return { ok: false, at: iso(nowOf(o)), command: "gputaskman --once --json", error: "the GPU number must be a whole number from 0 to 63" };
    if (g.n !== null) args.push("--gpu", String(g.n));
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
/** Write the session's JSON under <root>/brain/rig-results/gpu-snapshots/. The name is built from a prefix of ours, a timestamp and safeName(model or mode): nothing the caller sends can leave that folder. */
function save(result, model, o = {}, prefix = "gpusnap") {
    const fs = o.fsImpl || nodeFs, root = o.root || nodePath.resolve(__dirname, ".."), dir = nodePath.join(root, ...SNAPSHOT_DIR);
    const name = prefix + "-" + stamp(result.startedAt) + "-" + safeName(model) + ".json", abs = nodePath.join(dir, name);
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
    const sampleSecs = sampleSecondsOf(p.sampleSeconds), sampleEvery = intIn(p.sampleIntervalMs, WATCH.intervalMs);
    const result = { schema: FILE_SCHEMA, kind: "gputaskman-session", startedAt, finishedAt: null, ok: false, error: "", saveError: "", request: { model: typeof model === "string" ? model : null, base, numPredict, prompt: PROMPT, unloadWhenDone: !!p.unloadWhenDone, sampleSeconds: Number.isNaN(sampleSecs) ? null : sampleSecs, sampleIntervalMs: Number.isNaN(sampleEvery) ? null : sampleEvery }, host: safeHost(o), ollama: null, gputaskman: null, nvidiaSmi: {}, snapshots: {}, samples: [], steps, summary: null };
    const finish = (error, refused) => { result.error = error || ""; result.finishedAt = iso(nowOf(o)); result.ok = !error; if (refused) return { result, saved: { ok: false, error: "nothing was saved: the request was refused" } }; const saved = save(result, model, o); if (!saved.ok) result.saveError = saved.error; return { result, saved }; };
    try {
        if (!validModel(model)) { log("check", false, "the model name is not valid"); return finish("the model name is not valid (letters, digits and . _ : / @ + - only)", true); }
        if (!base) { log("check", false, "the Ollama address is not a loopback address"); return finish("the Ollama address must be http://127.0.0.1:PORT or http://localhost:PORT", true); }
        if (Number.isNaN(sampleSecs) || Number.isNaN(sampleEvery)) { log("check", false, "the sampling settings are not valid"); return finish(SAMPLE_ERROR, true); }
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
        const series = sampleSecs > 0 ? sampleLoop({ o: ob, bin: d.gputaskman.installed ? d.gputaskman.path : null, gpu: null, state: { used: 0 } }, { phase: "generate", seconds: sampleSecs, intervalMs: sampleEvery, stop: gen, max: WATCH.maxSamples, t0: msOf(o)() }) : null;
        await sleepOf(o)(p.settleMs === undefined || p.settleMs === null ? DEFAULT_SETTLE_MS : Math.min(MAX_SETTLE_MS, Math.max(0, Number(p.settleMs) || 0)));
        result.ollama.ps.busy = await ollamaPs(ob); await shoot("busy");
        const G = await gen; result.ollama.generate = G;
        if (series) { result.samples = await series; log("samples", result.samples.some((x) => x.gputaskman.ok || x.nvidiaSmi.ok), `${result.samples.length} snapshots while the answer was generated`); }
        log("generate", G.ok, G.ok ? `${G.evalCount} tokens at ${G.tokensPerSecond === null ? "?" : G.tokensPerSecond} tokens/s (prompt ${G.promptTokensPerSecond === null ? "?" : G.promptTokensPerSecond}/s)` : G.error);
        result.ollama.ps.after = await ollamaPs(ob);
        const mine = (list) => { if (!list || !list.ok) return null; return list.models.find((m) => m.name === model) || list.models.find((m) => m.name === model + ":latest") || null; };
        const m = mine(result.ollama.ps.busy) || mine(result.ollama.ps.loaded);
        result.summary = { modelSizeGB: m ? gb(m.sizeBytes) : null, inVramGB: m ? gb(m.sizeVramBytes) : null, onGpuPct: m && m.sizeBytes > 0 ? Math.round((m.sizeVramBytes / m.sizeBytes) * 1000) / 10 : null, tokensPerSecond: G.ok ? G.tokensPerSecond : null, loadSeconds: L.ms === undefined ? null : Math.round(L.ms / 100) / 10, gputaskmanInstalled: d.gputaskman.installed, sampled: result.samples.length ? watchSummary(result.samples, null) : null };
        if (p.unloadWhenDone) { const U = await ollamaUnload(model, ob); result.ollama.unloaded = U.ok; log("unload", U.ok, U.ok ? "unloaded" : U.error); }
        return finish(G.ok ? "" : "the model loaded but the test generation failed: " + G.error);
    } catch (e) { log("error", false, String((e && e.message) || e)); return finish("the session failed: " + String((e && e.message) || e)); }
}

// ---- watching: many snapshots over time, and the GPU brain run under them ------------------------------------------------------------------------------------------------------------------
/** The limits of a watch. A sample is a gputaskman snapshot and an nvidia-smi query taken together, which costs about a second on Windows (a Python start), so the interval floor is half of that. */
const WATCH = Object.freeze({ seconds: Object.freeze({ min: 3, max: 300, def: 20 }), intervalMs: Object.freeze({ min: 500, max: 10000, def: 1000 }), maxSamples: 120, edgeSamples: 2, budgetBytes: 3 * 1024 * 1024 });
/** The GPU brain run: the engine's own swarm tool, with whole numbers from these lists and nothing else. `seconds` are SIMULATED seconds of flight (30 ticks each), not wall time. */
const BRAIN = Object.freeze({ script: Object.freeze(["tools", "ship", "gpuSwarm.mjs"]), sizes: Object.freeze([64, 256, 1024, 2048, 4096, 8192]), defaultSizes: Object.freeze([4096, 8192]), rounds: Object.freeze({ min: 1, max: 5, def: 2 }), seconds: Object.freeze({ min: 1, max: 20, def: 10 }), outputChars: 8000 });
const SAMPLE_ERROR = "the sampling settings must be whole numbers: seconds 0 (off) or " + WATCH.seconds.min + " to " + WATCH.seconds.max + ", interval " + WATCH.intervalMs.min + " to " + WATCH.intervalMs.max + " ms";

/** A whole number in range from a number or a digit string; the default when nothing was given; NaN for anything else. */
function intIn(v, r) {
    if (v === undefined || v === null || v === "") return r.def;
    const n = typeof v === "number" ? v : (typeof v === "string" && /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : NaN);
    return Number.isInteger(n) && n >= r.min && n <= r.max ? n : NaN;
}
/** The session's option: 0 (or nothing) is off, else a whole number of seconds in the watch range; NaN for anything else. */
function sampleSecondsOf(v) { return v === undefined || v === null || v === "" || v === 0 || v === "0" ? 0 : intIn(v, WATCH.seconds); }

/** Check a watch request: { ok: true, mode, seconds, intervalMs, gpu, brain } or { ok: false, error }. Nothing is run here. */
function watchParams(p = {}) {
    if (p.mode !== "sample" && p.mode !== "brain") return { ok: false, error: 'the mode must be "sample" or "brain"' };
    const seconds = intIn(p.seconds, WATCH.seconds), intervalMs = intIn(p.intervalMs, WATCH.intervalMs), g = gpuArg(p.gpu);
    if (p.mode === "sample" && Number.isNaN(seconds)) return { ok: false, error: "seconds must be a whole number from " + WATCH.seconds.min + " to " + WATCH.seconds.max };
    if (Number.isNaN(intervalMs)) return { ok: false, error: "the interval must be a whole number of milliseconds from " + WATCH.intervalMs.min + " to " + WATCH.intervalMs.max };
    if (!g.ok) return { ok: false, error: "the GPU number must be a whole number from 0 to 63" };
    let brain = null;
    if (p.mode === "brain") {
        const sizes = p.sizes === undefined || p.sizes === null ? BRAIN.defaultSizes.slice() : p.sizes, rounds = intIn(p.rounds, BRAIN.rounds), swarmSeconds = intIn(p.swarmSeconds, BRAIN.seconds);
        if (!Array.isArray(sizes) || !sizes.length || new Set(sizes).size !== sizes.length || !sizes.every((x) => BRAIN.sizes.includes(x))) return { ok: false, error: "the swarm sizes must be distinct numbers from: " + BRAIN.sizes.join(", ") };
        if (Number.isNaN(rounds)) return { ok: false, error: "rounds must be a whole number from " + BRAIN.rounds.min + " to " + BRAIN.rounds.max };
        if (Number.isNaN(swarmSeconds)) return { ok: false, error: "the swarm's seconds must be a whole number from " + BRAIN.seconds.min + " to " + BRAIN.seconds.max };
        brain = { sizes: sizes.slice().sort((a, b) => a - b), rounds, swarmSeconds };
    }
    return { ok: true, mode: p.mode, seconds: p.mode === "sample" ? seconds : null, intervalMs, gpu: g.n, brain };
}

const medianOf = (a) => { const x = a.filter(Number.isFinite).sort((p, q) => p - q); if (!x.length) return null; const m = x.length >> 1; return x.length % 2 ? x[m] : Math.round(((x[m - 1] + x[m]) / 2) * 100) / 100; };
const peakOf = (a) => { const x = a.filter(Number.isFinite); return x.length ? Math.max(...x) : null; };

const finite = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
/** The few things worth reading out of one gputaskman snapshot, taken defensively: anything missing reads null or an empty list, a snapshot of another shape reads as an empty one. */
function readSnapshot(j) {
    if (!j || typeof j !== "object") return null;
    const d = j.device && typeof j.device === "object" ? j.device : {}, list = Array.isArray(j.processes) ? j.processes : [];
    const processes = list.filter((p) => p && typeof p === "object").map((p) => ({
        pid: finite(p.pid), name: typeof p.name === "string" ? p.name.slice(0, 80) : "", runtimes: Array.isArray(p.runtimes) ? p.runtimes.filter((x) => typeof x === "string").slice(0, 8) : [],
        gpuPct: finite(p.gpu_pct), vramBytes: finite(p.vram_bytes), engines: p.engines && typeof p.engines === "object" && !Array.isArray(p.engines) ? Object.fromEntries(Object.entries(p.engines).filter((e) => finite(e[1]) !== null).slice(0, 12)) : {},
    })).filter((p) => (p.gpuPct || 0) > 0 || (p.vramBytes || 0) > 0).sort((a, b) => (b.gpuPct || 0) - (a.gpuPct || 0) || (b.vramBytes || 0) - (a.vramBytes || 0)).slice(0, 12);
    return { utilGpuPct: finite(d.util_gpu), smClockMHz: finite(d.sm_clock), powerW: finite(d.power_w), vramUsedBytes: finite(j.vram_used), processes };
}
/** One sample: gputaskman and nvidia-smi together, with the digest readSnapshot makes of the snapshot. ctx: { o, bin (a path or null), gpu }. Never throws (both calls resolve). */
async function takeSample(ctx, phase, t0) {
    const ms = msOf(ctx.o), a = ms();
    const [g, n] = await Promise.all([ctx.bin ? snapshot({ ...ctx.o, bin: ctx.bin, gpu: ctx.gpu }) : Promise.resolve({ ok: false, error: "gputaskman is not installed" }), nvidiaSmi(ctx.o)]);
    const text = g.json !== undefined && g.json !== null ? JSON.stringify(g.json) : String(g.raw || "");
    return { tMs: a - t0, tookMs: ms() - a, phase, read: readSnapshot(g.json), gputaskman: g, nvidiaSmi: n, bytes: text.length };
}
/** Keep a sample's snapshot in full while the file's size budget lasts; after that mark it omitted, with its size and its verdict. */
function fit(sample, state) {
    const b = sample.bytes; delete sample.bytes;
    if (state.used + b > WATCH.budgetBytes) { const g = sample.gputaskman; sample.gputaskman = { ok: g.ok, at: g.at, command: g.command, error: g.error, omitted: true, bytes: b }; state.omitted = (state.omitted || 0) + 1; }
    else state.used += b;
    return sample;
}
/** Take samples one after another until `stop` (a promise) settles, `seconds` have passed (0 or undefined: no time limit) or `max` are taken. q: { phase, seconds, intervalMs, stop, max, t0 }. */
async function sampleLoop(ctx, q) {
    const ms = msOf(ctx.o), sleep = sleepOf(ctx.o), out = [], end = q.seconds ? ms() + q.seconds * 1000 : Infinity, stop = q.stop ? q.stop.then(() => {}, () => {}) : new Promise(() => {});
    let stopped = false; stop.then(() => { stopped = true; });
    while (!stopped && ms() < end) {
        const a = ms(); out.push(fit(await takeSample(ctx, q.phase, q.t0), ctx.state));
        if (stopped || out.length >= q.max || ms() >= end) break;
        await Promise.race([sleep(Math.max(0, q.intervalMs - (ms() - a))), stop]);
    }
    return out;
}

/** What the samples say in numbers: nvidia-smi's columns, gputaskman's device readings, and which programs used the card under which runtime. */
function watchSummary(samples, gpuWanted, omitted = 0) {
    const during = ["during", "sample", "generate"], of = (names) => samples.filter((s) => names.includes(s.phase)), bucket = (ph) => (during.includes(ph) ? "during" : ph);
    const rows = (s) => (s.nvidiaSmi && s.nvidiaSmi.ok ? s.nvidiaSmi.gpus : []);
    let idx = gpuWanted;
    if (idx === null || idx === undefined) { let best = -Infinity; for (const s of of(during)) for (const r of rows(s)) if (r.index !== null && (r.utilizationPct === null ? -1 : r.utilizationPct) > best) { best = r.utilizationPct === null ? -1 : r.utilizationPct; idx = r.index; } }
    if (idx === null || idx === undefined) { const first = samples.flatMap(rows)[0]; idx = first ? first.index : null; }
    const col = (names, f) => of(names).map((s) => { const r = rows(s).find((x) => x.index === idx); return r ? r[f] : null; }).filter((x) => x !== null);
    const dev = (names, f) => of(names).map((s) => (s.read ? s.read[f] : null)).filter((x) => x !== null);
    const gpuName = (samples.flatMap(rows).find((r) => r.index === idx) || {}).name || null;
    const memBefore = medianOf(col(["before"], "memoryUsedMiB")), memPeak = peakOf(col(during, "memoryUsedMiB"));
    const gaps = samples.slice(1).map((s, i) => s.tMs - samples[i].tMs);
    const seen = new Map();   // program name -> what it did across the samples
    for (const s of samples) {
        const mine = new Map();
        for (const p of (s.read ? s.read.processes : [])) { const m = mine.get(p.name) || { gpuPct: null, vram: null, runtimes: new Set(), engines: {}, pids: new Set() }; if (p.gpuPct !== null && (m.gpuPct === null || p.gpuPct > m.gpuPct)) m.gpuPct = p.gpuPct; if (p.vramBytes !== null && (m.vram === null || p.vramBytes > m.vram)) m.vram = p.vramBytes; p.runtimes.forEach((r) => m.runtimes.add(r)); for (const [k, v] of Object.entries(p.engines)) if (!(k in m.engines) || v > m.engines[k]) m.engines[k] = v; if (p.pid !== null) m.pids.add(p.pid); mine.set(p.name, m); }
        for (const [name, m] of mine) {
            const g = seen.get(name) || { name, runtimes: new Set(), pids: new Set(), seen: { before: 0, during: 0, after: 0 }, duringPct: [], vramPeak: null, enginesPeak: {} };
            g.seen[bucket(s.phase)]++; m.runtimes.forEach((r) => g.runtimes.add(r)); m.pids.forEach((x) => g.pids.add(x));
            if (bucket(s.phase) === "during" && m.gpuPct !== null) g.duringPct.push(m.gpuPct);
            if (m.vram !== null && (g.vramPeak === null || m.vram > g.vramPeak)) g.vramPeak = m.vram;
            for (const [k, v] of Object.entries(m.engines)) if (!(k in g.enginesPeak) || v > g.enginesPeak[k]) g.enginesPeak[k] = v;
            seen.set(name, g);
        }
    }
    const hasBefore = of(["before"]).length > 0;
    const programs = [...seen.values()].map((g) => ({ name: g.name, runtimes: [...g.runtimes].sort(), pids: g.pids.size, seen: g.seen, gpuPctDuringPeak: peakOf(g.duringPct), gpuPctDuringMedian: medianOf(g.duringPct), vramPeakMiB: g.vramPeak === null ? null : Math.round(g.vramPeak / 1048576), enginesPeak: g.enginesPeak, onlyDuring: hasBefore && g.seen.before === 0 && g.seen.during > 0 }))
        .sort((a, b) => (b.gpuPctDuringPeak || 0) - (a.gpuPctDuringPeak || 0) || (b.vramPeakMiB || 0) - (a.vramPeakMiB || 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, 10);
    const found = {}, runtimes = {};   // runtime -> the programs seen under it while it ran, in a stable (sorted) order
    for (const g of seen.values()) if (g.seen.during > 0) for (const r of g.runtimes) (found[r] = found[r] || []).push(g.name);
    for (const r of Object.keys(found).sort()) runtimes[r] = found[r].sort();
    return {
        samples: { total: samples.length, before: of(["before"]).length, during: of(during).length, after: of(["after"]).length },
        gputaskmanOk: samples.filter((s) => s.gputaskman.ok).length, nvidiaSmiOk: samples.filter((s) => s.nvidiaSmi.ok).length, omittedSnapshots: omitted,
        gpuIndex: idx === undefined ? null : idx, gpuName, intervalMsMedian: medianOf(gaps),
        utilizationPct: { before: medianOf(col(["before"], "utilizationPct")), during: medianOf(col(during, "utilizationPct")), duringPeak: peakOf(col(during, "utilizationPct")), after: medianOf(col(["after"], "utilizationPct")) },
        memoryUsedMiB: { before: memBefore, duringPeak: memPeak, after: medianOf(col(["after"], "memoryUsedMiB")), rise: memBefore !== null && memPeak !== null ? memPeak - memBefore : null },
        temperatureCPeak: peakOf(col(during, "temperatureC")),
        gputaskmanDevice: { utilGpuPct: { before: medianOf(dev(["before"], "utilGpuPct")), duringPeak: peakOf(dev(during, "utilGpuPct")) }, smClockMHz: { before: medianOf(dev(["before"], "smClockMHz")), duringPeak: peakOf(dev(during, "smClockMHz")) }, powerW: { before: medianOf(dev(["before"], "powerW")), duringPeak: peakOf(dev(during, "powerW")) } },
        programs, runtimes,
    };
}

/** The node to run the swarm with: the bridge's own when it is node, else `node` from the PATH (the swarm drives a browser through a node-only harness). */
function nodeBin(o) { if (o.nodeBin) return o.nodeBin; return /^node(\.exe)?$/i.test(nodePath.basename(process.execPath)) ? process.execPath : "node"; }

/** A watch: { result, saved }; never rejects. p: { mode: "sample" | "brain", seconds, intervalMs, gpu, sizes, rounds, swarmSeconds }. */
async function runWatch(p = {}, o = {}) {
    const startedAt = iso(nowOf(o)), steps = [], v = watchParams(p), mode = v.ok ? v.mode : (p.mode === "brain" ? "brain" : "sample");
    const log = (step, ok, note) => { const e = { at: iso(nowOf(o)), step, ok, note: String(note || "") }; steps.push(e); if (typeof o.onStep === "function") { try { o.onStep(e); } catch (x) { /* a progress hook must never stop the run */ } } };
    const result = { schema: FILE_SCHEMA, kind: "gputaskman-watch", mode, startedAt, finishedAt: null, ok: false, error: "", saveError: "", request: v.ok ? { seconds: v.seconds, intervalMs: v.intervalMs, gpu: v.gpu, brain: v.brain } : null, host: safeHost(o), gputaskman: null, samples: [], brain: null, steps, summary: null };
    const finish = (error, refused) => { result.error = error || ""; result.finishedAt = iso(nowOf(o)); result.ok = !error; if (refused) return { result, saved: { ok: false, error: "nothing was saved: the request was refused" } }; const saved = save(result, mode, o, "gpuwatch"); if (!saved.ok) result.saveError = saved.error; return { result, saved }; };
    try {
        if (!v.ok) { log("check", false, v.error); return finish(v.error, true); }
        const ms = msOf(o), t0 = ms(), loc = await locate(o), ctx = { o, bin: loc.installed ? loc.path : null, gpu: v.gpu, state: { used: 0 } };
        result.gputaskman = { installed: loc.installed, works: loc.works, gpus: loc.gpus, error: loc.error };
        log("detect", true, `gputaskman ${loc.installed ? (loc.works ? "found" : "found but not working") : "not found"}`);
        const usable = (list) => list.some((s) => s.gputaskman.ok || s.nvidiaSmi.ok);
        if (v.mode === "sample") {
            log("sample", true, `taking a snapshot every ${v.intervalMs} ms for ${v.seconds} s`);
            result.samples = await sampleLoop(ctx, { phase: "sample", seconds: v.seconds, intervalMs: v.intervalMs, max: WATCH.maxSamples, t0 });
            log("sample", usable(result.samples), `${result.samples.length} snapshots`);
            result.summary = watchSummary(result.samples, v.gpu, ctx.state.omitted);
            return finish(usable(result.samples) ? "" : "neither gputaskman nor nvidia-smi answered: there is nothing in the file to read");
        }
        const edge = { phase: "before", intervalMs: v.intervalMs, max: WATCH.edgeSamples, t0 };
        result.samples = await sampleLoop(ctx, edge); log("before", usable(result.samples), `${result.samples.length} snapshots before the swarm starts`);
        if (!usable(result.samples)) { result.summary = watchSummary(result.samples, v.gpu, ctx.state.omitted); return finish("neither gputaskman nor nvidia-smi answered, so the swarm was not started (nothing could have been watched)"); }
        const root = o.root || nodePath.resolve(__dirname, ".."), argv = [nodePath.join(root, ...BRAIN.script), "--hardware", "--sizes", v.brain.sizes.join(","), "--rounds", String(v.brain.rounds), "--seconds", String(v.brain.swarmSeconds)];
        const command = "node " + [...BRAIN.script].join("/") + " " + argv.slice(1).join(" ");
        log("swarm", true, "starting: " + command);
        const tStart = ms(), child = runCmd(execOf(o), nodeBin(o), argv, { timeoutMs: o.brainTimeoutMs || TIMEOUTS.brain, cwd: root, env: o.env }).then((r) => ({ ...r, endMs: ms() }));
        const during = await Promise.all([sampleLoop(ctx, { phase: "during", intervalMs: v.intervalMs, stop: child, max: WATCH.maxSamples - 2 * WATCH.edgeSamples, t0 }), child]);
        const R = during[1]; result.samples.push(...during[0]);
        const out = R.stdout, soft = /SOFTWARE ADAPTER/.test(out) ? true : /^hardware adapter:/m.test(out) ? false : null;
        result.brain = { command, ok: R.ok, exitCode: R.code, timedOut: R.timedOut, notFound: R.notFound, durationMs: R.endMs - tStart, adapterLine: (out.split(/\r?\n/).find((l) => /adapter/i.test(l)) || "").slice(0, 300), software: soft, output: out.slice(0, BRAIN.outputChars), stderrTail: tail(R.stderr, 1500), note: "the timings in this output were taken while gputaskman and nvidia-smi were sampling; they are not a registered result and were NOT written to brain/rig-results/gpuSwarm.jsonl" };
        log("swarm", R.ok, R.ok ? `finished in ${Math.round(result.brain.durationMs / 100) / 10} s; ${result.brain.adapterLine || "no adapter line"}` : (R.timedOut ? "did not finish within the time allowed" : R.notFound ? "node was not found" : "failed: " + tail(R.stderr.trim() || R.error, 300)));
        const after = await sampleLoop(ctx, { phase: "after", intervalMs: v.intervalMs, max: WATCH.edgeSamples, t0 }); result.samples.push(...after);
        log("after", usable(after), `${after.length} snapshots after it ended`);
        result.summary = watchSummary(result.samples, v.gpu, ctx.state.omitted);
        return finish(!R.ok ? "the GPU swarm did not finish" + (R.timedOut ? " in time" : R.code !== null ? " (exit code " + R.code + ")" : "") + ": " + tail(R.stderr.trim() || R.error, 300) : soft === true ? "the swarm ran on a SOFTWARE adapter: the browser did not reach the graphics card, so the card was not used and the samples show nothing of the brain (the first line of the swarm's output names the adapter)" : "");
    } catch (e) { log("error", false, String((e && e.message) || e)); return finish("the watch failed: " + String((e && e.message) || e)); }
}

// ---- jobs: a page starts a session and polls it -------------------------------------------------------------------------------------------------------------------------------------------------
const _jobs = new Map(); let _seq = 0;
const MAX_JOBS = 5;
function _reset() { _jobs.clear(); _seq = 0; }

const runningJob = () => { for (const j of _jobs.values()) if (j.state === "running") return j; return null; };
/** Register a job and run it: `run(onStep)` resolves to { result, saved }. */
function launch(kind, run, o) {
    const id = "gt" + (++_seq) + "-" + new Date(nowOf(o)).getTime().toString(36), job = { id, kind, state: "running", startedAt: iso(nowOf(o)), steps: [], result: null, saved: null, error: "" };
    _jobs.set(id, job); while (_jobs.size > MAX_JOBS) _jobs.delete(_jobs.keys().next().value);
    run((e) => job.steps.push(e)).then((r) => { job.result = r.result; job.saved = r.saved; job.error = r.result.error; job.state = r.result.ok ? "done" : "error"; })
        .catch((e) => { job.state = "error"; job.error = String((e && e.message) || e); });
    return { ok: true, id };
}

function startSession(p = {}, o = {}) {
    const busy = runningJob(); if (busy) return { ok: false, error: "a " + busy.kind + " is already running", id: busy.id };
    if (!validModel(p.model)) return { ok: false, error: "the model name is not valid (letters, digits and . _ : / @ + - only)" };
    if (!loopbackBase(p.base)) return { ok: false, error: "the Ollama address must be http://127.0.0.1:PORT or http://localhost:PORT" };
    if (Number.isNaN(sampleSecondsOf(p.sampleSeconds)) || Number.isNaN(intIn(p.sampleIntervalMs, WATCH.intervalMs))) return { ok: false, error: SAMPLE_ERROR };
    return launch("session", (onStep) => runSession(p, { ...o, onStep }), o);
}

function startWatch(p = {}, o = {}) {
    const busy = runningJob(); if (busy) return { ok: false, error: "a " + busy.kind + " is already running", id: busy.id };
    const v = watchParams(p); if (!v.ok) return { ok: false, error: v.error };
    return launch("watch", (onStep) => runWatch(p, { ...o, onStep }), o);
}

function jobStatus(id) {
    const j = typeof id === "string" ? _jobs.get(id) : null;
    if (!j) return { ok: false, error: "no such session (the bridge keeps the last " + MAX_JOBS + ")" };
    const fin = j.state !== "running";
    return { ok: true, id: j.id, kind: j.kind, state: j.state, startedAt: j.startedAt, steps: j.steps.slice(), error: j.error, savedAs: fin && j.saved && j.saved.ok ? j.saved.relative : null, savedAbsolute: fin && j.saved && j.saved.ok ? j.saved.absolute : null, result: fin ? j.result : null };
}

module.exports = {
    PACKAGE, REPO_URL, DEFAULT_BASE, INSTALLERS, TIMEOUTS, PROMPT, SNAPSHOT_DIR, FILE_SCHEMA, KEEP_ALIVE,
    WATCH, BRAIN,
    detect, install, snapshot, nvidiaSmi, hostInfo, locate, ollamaStatus, ollamaLoad, ollamaPs, ollamaGenerate, ollamaUnload, runSession, startSession, jobStatus, save, runWatch, startWatch, watchSummary,
    _intIn: intIn, _gpuArg: gpuArg, _watchParams: watchParams, _sampleSecondsOf: sampleSecondsOf, _sampleLoop: sampleLoop, _nodeBin: nodeBin, _readSnapshot: readSnapshot,
    _validModel: validModel, _safeName: safeName, _loopbackBase: loopbackBase, _binCandidates: binCandidates, _parseJsonLoose: parseJsonLoose, _runCmd: runCmd, _reset,
};
