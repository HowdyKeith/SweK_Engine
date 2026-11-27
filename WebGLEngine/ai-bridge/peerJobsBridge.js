// FILE: ai-bridge/peerJobsBridge.js
//
// UNNUMBERED -- THE BRAIN JOB REPO REPORT RUNNER: the SweK server's front door and service for tools/ship/peerJobsCmd.mjs (docs/PEER_JOBS.md).
//
// A peer that turns this on watches a git branch for signed training jobs, claims one when it is free and fits the job's target (a GPU box, the Intel CPU box), runs it in a clean checkout of the job's commit, and
// pushes the result back to the same branch. Keith (2026-11-23): "there can be a default off checkbox in the Server.html Boot-Up Options, something like 'Brain Job Repo Report Runner'".
//
// *** IT DRIVES THE COMMAND AND REIMPLEMENTS NOTHING *** -- the queue, the signature check, the claim protocol and the command line of a job are tools/ship/peerJobs*.mjs, graded by their own gate. This bridge starts and
// stops `peerJobsCmd.mjs watch` as a child process, keeps its output, and runs the one-shot commands (`submit`, `cancel`, `status`) with an ARGUMENT LIST (no shell), after validating every field it was handed.
// *** OFF BY DEFAULT, AND OFF MEANS NO PROCESS AND NO NETWORK *** -- nothing starts at boot unless the saved config says enabled. *** EVERY ROUTE IS TRUSTED-ONLY ***: the queue address, the peer's name and the run log belong to the
// owner, and a submit or a start is code that runs on this machine; `isTrusted` is handed in by server.js so the bridge cannot authorise itself. The signing key is WRITE-ONLY: a route stores it, none returns it.
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");

const PREFIX = "/peerjobs";
const ENGINE = path.join(__dirname, "..");
const PEER = /^[A-Za-z0-9][\w.-]{0,39}$/, URLRE = /^[A-Za-z0-9_\/~.\\][\w.\/:@~+\\-]{0,299}$/, JOBID = /^[a-z0-9][a-z0-9-]{2,62}$/, ROUND = /^\d{1,3}$/, TEXT = /^[\x20-\x7e]{0,200}$/, CPU = /^[\w .()@-]{1,40}$/, SHA = /^[0-9a-f]{40}$/;
const GPUS = ["auto", "yes", "no"], TARGETS = ["any", "required", "forbidden"];
const DEFAULTS = Object.freeze({ enabled: false, url: "", name: "", gpu: "auto", intervalS: 120, engineUrl: "" });
const LOG_MAX = 65536, RESTART_MS = 30000, MAX_FAST_FAILS = 5;

function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

/** The reasons a config patch is refused (an empty list: it is fine). Strict: an unknown field is refused. */
function validatePatch(p) {
    const e = [];
    if (!p || typeof p !== "object" || Array.isArray(p)) return ["the config is not an object"];
    for (const k of Object.keys(p)) if (!(k in DEFAULTS)) e.push("unknown field " + JSON.stringify(k));
    if (p.enabled !== undefined && typeof p.enabled !== "boolean") e.push("enabled must be true or false");
    if (p.url !== undefined && !(p.url === "" || (typeof p.url === "string" && URLRE.test(p.url)))) e.push("url must be a git address or path (letters, digits and . / \\ : @ ~ + -, no spaces, not starting with -)");
    if (p.engineUrl !== undefined && !(p.engineUrl === "" || (typeof p.engineUrl === "string" && URLRE.test(p.engineUrl)))) e.push("engineUrl must be a git address or path (letters, digits and . / \\ : @ ~ + -, no spaces, not starting with -)");
    if (p.name !== undefined && !(p.name === "" || (typeof p.name === "string" && PEER.test(p.name)))) e.push("name must be a short name (letters, digits, . _ -)");
    if (p.gpu !== undefined && !GPUS.includes(p.gpu)) e.push("gpu must be one of " + GPUS.join(", "));
    if (p.intervalS !== undefined && !(Number.isInteger(p.intervalS) && p.intervalS >= 30 && p.intervalS <= 3600)) e.push("intervalS must be a whole number of seconds from 30 to 3600");
    return e;
}
/** The argument list of a `submit` from a request body, or { error }: every field is checked before it can reach the command line. */
function submitArgs(b) {
    if (!b || typeof b !== "object") return { error: "the body is not an object" };
    if (typeof b.id !== "string" || !JOBID.test(b.id)) return { error: "id must be 3 to 63 characters of a-z, 0-9 and -" };
    const a = ["--id", b.id];
    if (b.kind === "selftest") a.push("--selftest");
    else {
        if (!Array.isArray(b.rounds) || b.rounds.length < 1 || b.rounds.length > 8 || !b.rounds.every((r) => typeof r === "string" && ROUND.test(r))) return { error: "rounds must be 1 to 8 strings of 1 to 3 digits" };
        a.push("--rounds", b.rounds.join(","));
    }
    if (b.gpu !== undefined) { if (!TARGETS.includes(b.gpu)) return { error: "gpu must be one of " + TARGETS.join(", ") }; a.push("--gpu", b.gpu); }
    if (b.minCores !== undefined) { if (!Number.isInteger(b.minCores) || b.minCores < 1 || b.minCores > 256) return { error: "minCores must be a whole number from 1 to 256" }; a.push("--min-cores", String(b.minCores)); }
    if (b.cpuMatch !== undefined && b.cpuMatch !== "") { if (typeof b.cpuMatch !== "string" || !CPU.test(b.cpuMatch) || b.cpuMatch.startsWith("--")) return { error: "cpuMatch must be 1 to 40 plain characters" }; a.push("--cpu-match", b.cpuMatch); }
    if (b.peers !== undefined) { if (!Array.isArray(b.peers) || b.peers.length < 1 || b.peers.length > 16 || !b.peers.every((x) => typeof x === "string" && PEER.test(x))) return { error: "peers must be 1 to 16 peer names" }; a.push("--peers", b.peers.join(",")); }
    if (b.priority !== undefined) { if (!Number.isInteger(b.priority) || b.priority < -9 || b.priority > 9) return { error: "priority must be a whole number from -9 to 9" }; a.push("--priority", String(b.priority)); }
    if (b.after !== undefined) { if (!Array.isArray(b.after) || b.after.length < 1 || b.after.length > 8 || !b.after.every((x) => typeof x === "string" && JOBID.test(x))) return { error: "after must be 1 to 8 job ids" }; a.push("--after", b.after.join(",")); }
    if (b.note !== undefined && b.note !== "") { if (typeof b.note !== "string" || !TEXT.test(b.note) || b.note.startsWith("--")) return { error: "note must be up to 200 printable ASCII characters" }; a.push("--note", b.note); }
    if (b.commit !== undefined && b.commit !== "") { if (typeof b.commit !== "string" || !SHA.test(b.commit)) return { error: "commit must be 40 lowercase hex characters" }; a.push("--commit", b.commit); }
    return { args: a };
}

function createBridge(deps) {
    const d = Object.assign({ spawn: cp.spawn, home: process.env.SWEK_PEERJOBS_HOME || path.join(os.homedir(), ".voxelbridge"), now: Date.now, setTimeout, clearTimeout, platform: process.platform, kill: (pid, sig) => process.kill(pid, sig), isGit: null }, deps || {});
    const cfgFile = path.join(d.home, "peerjobs.json"), keyFile = path.join(d.home, "peerjobs.key"), queueDir = path.join(d.home, "peerjobs", "queue"), engineClone = path.join(d.home, "peerjobs", "engine");
    const cli = path.join(ENGINE, "tools", "ship", "peerJobsCmd.mjs");
    const S = { child: null, startedAt: 0, exit: null, log: "", stopping: false, fastFails: 0, timer: null, phase: "off" };
    const push = (t) => { S.log = (S.log + String(t)).slice(-LOG_MAX); };
    const load = () => { try { const j = JSON.parse(fs.readFileSync(cfgFile, "utf8")); return Object.assign({}, DEFAULTS, validatePatch(j).length ? {} : j); } catch (e) { return Object.assign({}, DEFAULTS); } };
    const save = (c) => { fs.mkdirSync(d.home, { recursive: true }); fs.writeFileSync(cfgFile + ".tmp", JSON.stringify(c, null, 1) + "\n"); fs.renameSync(cfgFile + ".tmp", cfgFile); };
    const keySet = () => { try { return fs.statSync(keyFile).size > 0; } catch (e) { return false; } };
    const isGit = () => { if (typeof d.isGit === "function") return !!d.isGit(); try { return fs.existsSync(path.join(ENGINE, "..", ".git")); } catch (e) { return false; } };
    const engineArgs = (c) => (isGit() ? [] : ["--engine-dir", engineClone, ...(c.engineUrl ? ["--engine-url", c.engineUrl] : [])]);
    const common = (c) => ["--dir", queueDir, "--key-file", keyFile, ...(c.name ? ["--name", c.name] : []), ...engineArgs(c)];
    /** Runs the command once with an argument list and gives { code, out } (no shell; a timeout kills it). */
    const once = (args, ms) => new Promise((resolve) => {
        let out = "", done = false, ch;
        const fin = (code) => { if (done) return; done = true; d.clearTimeout(t); resolve({ code, out: out.slice(-LOG_MAX) }); };
        try { ch = d.spawn(process.execPath, [cli, ...args], { cwd: ENGINE, windowsHide: true }); } catch (e) { return resolve({ code: -1, out: String(e && e.message) }); }
        const t = d.setTimeout(() => { try { ch.kill(); } catch (e) {} fin(-2); }, ms || 60000);
        if (ch.stdout) ch.stdout.on("data", (x) => { out += x; }); if (ch.stderr) ch.stderr.on("data", (x) => { out += x; });
        ch.on("error", (e) => { out += String(e && e.message); fin(-1); }); ch.on("close", (c) => fin(c === null ? 1 : c));
    });
    const killTree = (ch) => { try { if (d.platform === "win32") d.spawn("taskkill", ["/pid", String(ch.pid), "/T", "/F"], { windowsHide: true }); else d.kill(-ch.pid, "SIGTERM"); } catch (e) { try { ch.kill(); } catch (e2) {} } };
    async function start() {
        const c = load();
        if (S.child) return { ok: false, error: "running", message: "the runner is already running" };
        if (!c.url) return { ok: false, error: "no-url", message: "set the queue repo address first" };
        if (!keySet()) return { ok: false, error: "no-key", message: "save the signing key first (the same secret on every peer)" };
        S.phase = "starting"; S.stopping = false; S.exit = null;
        const ini = await once(["init", "--url", c.url, "--dir", queueDir], 120000);
        push("[peerjobs] init: " + ini.out.trim() + "\n");
        if (ini.code !== 0) { S.phase = "off"; return { ok: false, error: "init", message: "could not open the queue branch: " + ini.out.trim().slice(-200) }; }
        let ch;
        try { ch = d.spawn(process.execPath, [cli, "watch", "--interval", String(c.intervalS), ...(c.gpu === "yes" ? ["--gpu"] : c.gpu === "no" ? ["--no-gpu"] : []), ...common(c)], { cwd: ENGINE, windowsHide: true, detached: d.platform !== "win32" }); }
        catch (e) { S.phase = "off"; return { ok: false, error: "spawn", message: String(e && e.message) }; }
        S.child = ch; S.startedAt = d.now(); S.phase = "watching";
        if (ch.stdout) ch.stdout.on("data", push); if (ch.stderr) ch.stderr.on("data", push);
        ch.on("error", (e) => { push("[peerjobs] error: " + (e && e.message) + "\n"); });
        ch.on("close", (code) => {
            const life = d.now() - S.startedAt; S.child = null; S.exit = code; S.phase = "off";
            push("[peerjobs] the watcher exited " + code + "\n");
            if (S.stopping || !load().enabled) return;
            S.fastFails = life < 10000 ? S.fastFails + 1 : 0;
            if (S.fastFails >= MAX_FAST_FAILS) { push("[peerjobs] it keeps stopping at once; not restarting. Look at the log above.\n"); return; }
            S.timer = d.setTimeout(() => { S.timer = null; start().catch(() => {}); }, RESTART_MS);
        });
        return { ok: true, started: true };
    }
    function stop() {
        S.stopping = true; if (S.timer) { d.clearTimeout(S.timer); S.timer = null; }
        if (S.child) { killTree(S.child); push("[peerjobs] stop requested\n"); }
        S.phase = "off";
        return { ok: true, stopped: true };
    }
    function status() {
        const c = load();
        return { ok: true, config: c, keySet: keySet(), running: !!S.child, phase: S.child ? S.phase : "off", pid: S.child ? S.child.pid : 0, startedAt: S.startedAt, exit: S.exit, engineIsGit: isGit(), queueDir, home: d.home,
                 note: "Off by default. On: this peer watches the queue branch for signed jobs, runs one at a time in a clean checkout of the job's commit, and pushes the result back. docs/PEER_JOBS.md." };
    }
    function readBody(req, limit) {
        return new Promise((resolve) => { let s = ""; req.on("data", (x) => { s += x; if (s.length > (limit || 16384)) { s = s.slice(0, limit || 16384); req.destroy(); } }); req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { resolve({ __bad: true }); } }); req.on("error", () => resolve({ __bad: true })); });
    }
    async function handle(req, res, ctx) {
        const { sendJson, isTrusted } = ctx || {};
        if (typeof isTrusted !== "function" || !isTrusted(req)) return sendJson({ ok: false, error: "forbidden", message: "the peer job runner is for this machine's owner" }, 403);
        const url = new URL(req.url, "http://x"), route = url.pathname.slice(PREFIX.length) || "/", post = req.method === "POST";
        if (route === "/status" || route === "/") return sendJson(status());
        if (route === "/log") return sendJson({ ok: true, running: !!S.child, log: S.log });
        if (route === "/queue") { const c = load(); const r = await once(["status", ...common(c)], 90000); return sendJson({ ok: r.code === 0, out: r.out }); }
        if (!["/config", "/key", "/start", "/stop", "/submit", "/cancel"].includes(route)) return sendJson({ ok: false, error: "unknown-route", route }, 404);
        if (!post) return sendJson({ ok: false, error: "method", message: "POST to " + PREFIX + route }, 405);
        const body = await readBody(req);
        if (body.__bad) return sendJson({ ok: false, error: "bad-json" }, 400);
        if (route === "/config") {
            const errs = validatePatch(body); if (errs.length) return sendJson({ ok: false, error: "config", message: errs[0] }, 400);
            const before = load(), next = Object.assign({}, before, body); save(next);
            if (body.enabled === true && !S.child) { const r = await start(); if (!r.ok) save(Object.assign({}, load(), { enabled: false })); return sendJson(Object.assign({}, status(), { start: r })); }
            if (body.enabled === false) stop();
            return sendJson(status());
        }
        if (route === "/key") {
            if (typeof body.key !== "string" || body.key.length < 8 || body.key.length > 200 || /[\r\n\0]/.test(body.key)) return sendJson({ ok: false, error: "key", message: "the key is 8 to 200 characters on one line" }, 400);
            fs.mkdirSync(d.home, { recursive: true }); fs.writeFileSync(keyFile, body.key + "\n", { mode: 0o600 });
            return sendJson({ ok: true, keySet: true });
        }
        if (route === "/start") { const r = await start(); return sendJson(r, r.ok ? 200 : 400); }
        if (route === "/stop") return sendJson(stop());
        if (route === "/submit") { const a = submitArgs(body); if (a.error) return sendJson({ ok: false, error: "submit", message: a.error }, 400); const r = await once(["submit", ...a.args, ...common(load())], 90000); return sendJson({ ok: r.code === 0, out: r.out.trim() }, r.code === 0 ? 200 : 400); }
        if (route === "/cancel") { if (typeof body.id !== "string" || !JOBID.test(body.id)) return sendJson({ ok: false, error: "cancel", message: "id must be a job id" }, 400); const r = await once(["cancel", "--id", body.id, ...common(load())], 90000); return sendJson({ ok: r.code === 0, out: r.out.trim() }, r.code === 0 ? 200 : 400); }
        return sendJson({ ok: false, error: "unknown-route", route }, 404);
    }
    /** At boot: starts the watcher ONLY when the saved config says enabled (the default is off). */
    function startIfEnabled() { if (load().enabled) return start().catch((e) => ({ ok: false, error: String(e && e.message) })); return Promise.resolve({ ok: true, started: false, reason: "disabled" }); }
    return { owns, handle, status, start, stop, startIfEnabled, load, validatePatch, submitArgs, _state: S, PREFIX };
}
const bridge = createBridge();
module.exports = Object.assign({}, bridge, { createBridge, validatePatch, submitArgs, DEFAULTS, PREFIX, owns });
