// WebGLEngine/tools/ship/gpuTaskManBridge-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------------------------
// GATES ai-bridge/gpuTaskManBridge.js (the engine's side of github.com/shanselman/gputaskman) and the five routes that expose it
// in ai-bridge/server.js. Nothing here touches a GPU, Ollama, pip or the disk: every command, every HTTP call, the clock, the
// operating system and the file system are scripted fakes handed to the module's own injection seams, so each branch (a method
// that is not on the allow-list, a binary that is not installed, an Ollama that is down, a model that is not pulled, a snapshot
// that prints a banner before its JSON, a disk that refuses the file) is held by a check that needs no machine.
//
// Run: node tools/ship/gpuTaskManBridge-selfcheck.mjs      (about 1 s)
//
// WHAT THE CHECKS HOLD, the ones a quiet edit would break:
//   1 THE ALLOW-LIST  install() runs one of TWO fixed argument vectors by name; any other string, "__proto__" and "constructor"
//                     included, is refused WITHOUT a command being run, and no command goes through a shell.
//   2 THE ADDRESS     the only Ollama this module will speak to is a loopback one; a LAN host, a lookalike, https, credentials and
//                     a path are refused before a request is made.
//   3 THE FILE NAME   whatever model name a caller sends, the saved file is inside brain/rig-results/gpu-snapshots/ and no saved
//                     byte names the machine, the user or a path.
//   4 THE ORDER       the session takes its baseline BEFORE the load, its "loaded" snapshot AFTER it, and its "busy" snapshot
//                     while the generation is still running (the fake generation does not finish until the busy snapshot has
//                     been taken, so a session that waited for the answer first would hang and fail here).
//   5 THE JOBS        one session at a time, readable while it runs and after it, and a job id is a Map key, not an object key.
//
// SABOTAGE (2026-11-08, the harness of /tmp/claude-0/sab: gen_mutants_lines.py + mut_run_render.py, sha256 of the module before and
// after in the log line below; a survivor is a finding, a mutant that makes the gate THROW or TIME OUT is caught). See the LOG
// at the foot of this header, written when the sweep finished.
//
// LOG (2026-11-08; harness /tmp/claude-0/sab: gen_mutants_lines.py + mut_run_render.py, 4 slices, isolated trees; RED and CRASH are caught).
//   sha256 of ai-bridge/gpuTaskManBridge.js 476ba7d2cbae4061... at the last sweep and at the end (the harness writes only into its own trees).
//   FOUR SWEEPS, each followed by the gate rows that closed its survivors.
//   sweep 1: 544 mutants, 273 RED, 35 CRASH, 236 SURVIVORS (80 lines). Read line by line; rows were added for: a username or a password alone in the Ollama
//     address, trailing text after JSON, every command's timeout, every truncation length, the shapes of a failing version or tags answer, the refusals of ps,
//     generate and unload, the fields of ps, the nvidia-smi columns, the session's step notes and flags, the settleMs clamps, which model the summary reads,
//     the catch-all, and the jobs' retention and rejection paths. THE READ ALSO FOUND FOUR FAULTS IN THE MODULE, fixed there: a failed file save left
//     ok:true beside an error string (now a separate saveError); a model of another tag (q:3b for q:7b) could be taken for the one asked about; gpu [1] and true
//     were accepted as GPU 1 (now numbers and one- or two-digit strings only); a host that would not say what it is could reject the whole session (safeHost).
//   sweep 2: 544, 403 RED, 44 CRASH, 97 SURVIVORS. It showed my own rows were weak: every "no command or request was made" row used a fake that THROWS, which the
//     module's own error handling swallows, so a mutant that made the call still passed (now counting spies, read from the call count); and a timeout mutant
//     passed by waiting 30 s, because the gate's own 60 s watchdog kept the event loop alive (timers and the clock are now injectable; each wait is pinned at
//     the place it is used, and a fired fake timer replaces real waiting). Dead code the sweep exposed was removed (a default parameter, a done flag, a
//     redundant tail() around a slice, a base-name model match that could borrow another tag).
//   sweep 3: 541, 453 RED, 51 CRASH, 37 SURVIVORS. sweep 4: 541, 461 RED, 51 CRASH, 29 SURVIVORS.
//   THE 29 THAT REMAIN, ARGUED EQUIVALENT OR UNOBSERVABLE (each changes nothing the module returns or does):
//     L64 the bytes-per-GB constant +-1 (the result is rounded to two decimals); L97, L156, L263, L268, L309 and L324 the `e && e.message || e` text of an error
//     that already has its words (the branches that matter are held); L100 `o.env || process.env` (execFile's own default is process.env); L116 `b > a` (no
//     character is both the first opening and the last closing bracket) and `a >= 0 && b > a` as `||` (with no opening bracket the slice is empty and the
//     parse fails inside its try); L148 the `unref` guard (a Node timer always has unref); L171, L278, L319 a `+` inside a message string; L213 `{1,2}` as
//     `{0,2}` (an empty string is handled before the pattern); L214 the `0` inside the message "0 to 63"; L275 `ok: false` as the initial value (finish()
//     overwrites it); L304 `!list || !list.ok` as `&&` (a failed ps returns an empty list, which finds nothing); L306 `sizeBytes > 0` as `> 1` (a model of one
//     byte); L313 `_seq = 0` as 1 (_reset sets it); L321 `toString(36)` as 35 (the spelling of an id).
//   Also run, not a row of this gate: an end-to-end smoke (the real module, the five real route lines taken out of server.js, real child processes for
//     gputaskman, nvidia-smi and uv, a real HTTP server on loopback for Ollama): status, install, a refused method, snapshot, a refused gpu, a session polled
//     to its end, a second start refused, a model that is not pulled, a LAN address refused, the file written and equal to the result. All as expected.
// ---------------------------------------------------------------------------------------------------------------------------------
"use strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const G = require(path.join(ENG, "ai-bridge", "gpuTaskManBridge.js"));
const SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "gpuTaskManBridge.js"), "utf8");
const SERVER = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise((r) => setImmediate(r));

const WATCHDOG = setTimeout(() => { console.log("  FAIL  the gate did not finish within 60 s (something waited for an event that never came)"); process.exit(1); }, 60000);

console.log("gpuTaskManBridge-selfcheck -- install, detect, snapshot, and the Ollama session\n");

// ---- the fakes ----------------------------------------------------------------------------------------------------------------------------
const errOf = (props, msg = "boom") => Object.assign(new Error(msg), props);
/** A scripted execFile: handler(cmd, args) -> { stdout, stderr, err } | a Promise of one. Records every call with its options. */
function fakeExec(handler) {
    const calls = [];
    const impl = (cmd, args, opts, cb) => {
        calls.push({ cmd, args: [...args], opts });
        Promise.resolve().then(() => handler(cmd, args, opts)).then((r) => { r = r || {}; setImmediate(() => cb(r.err || null, r.stdout || "", r.stderr || "")); }, (e) => setImmediate(() => cb(e, "", "")));
    };
    impl.calls = calls; return impl;
}
/** A scripted fetch: handler(method, url, body) -> { status, json } (or a Promise of one, or a throw). Records every call. */
function fakeFetch(handler) {
    const calls = [];
    const impl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : undefined; calls.push({ method: init.method, url, body, headers: init.headers });
        const r = await handler(init.method, url, body);
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
    };
    impl.calls = calls; return impl;
}
/** Spies that answer harmlessly and COUNT: a throwing fake is swallowed by the module's own error handling, so "nothing was run" must be read from the count. */
const spyExec = () => fakeExec(() => ({ err: errOf({ code: "ENOENT" }) }));
const spyFetch = () => fakeFetch(() => ({ status: 200, json: {} }));
const fakeOs = (over = {}) => ({
    platform: () => "win32", release: () => "10.0.19045", arch: () => "x64", cpus: () => [{ model: "  Intel(R) Xeon(R) E5  " }, { model: "x" }], totalmem: () => 34359738368, freemem: () => 17179869184,
    hostname: () => { throw new Error("the host name must not be read"); }, userInfo: () => { throw new Error("the user must not be read"); }, homedir: () => { throw new Error("the home must not be read"); }, ...over,
});
const fakeFs = (over = {}) => { const w = { dirs: [], files: {} }; return { w, mkdirSync: (d, o) => { if (over.mkdir) throw over.mkdir; w.dirs.push([d, o]); }, writeFileSync: (f, t) => { if (over.write) throw over.write; w.files[f] = String(t); } }; };
const clock = (t0 = Date.UTC(2026, 10, 8, 5, 12, 30)) => { let t = t0; return () => new Date((t += 1000)); };

// ---- 1. the pure helpers -----------------------------------------------------------------------------------------------------------------------
console.log("1. THE PURE HELPERS");
{
    for (const m of ["qwen2.5-coder:7b", "llama3.1:8b-t0", "hf.co/ggml-org/Qwen3.8-27B-GGUF:Q4_K_M", "a", "library/x@sha256+1"]) ok(`a model name Ollama can have is accepted: ${m}`, G._validModel(m));
    for (const m of ["", "-x", ".x", " x", "x y", "x;rm", "x$(id)", "x`id`", 'x"y', "x\ny", "x'y", "x|y", "x&y", "x>y", "a".repeat(201), null, undefined, 7, {}]) ok(`!! a name that could be anything else is refused: ${JSON.stringify(m)}`, !G._validModel(m));
    ok("a name of exactly 200 characters is accepted (the limit is 200, not 199)", G._validModel("a".repeat(200)));
    ok("safeName turns separators into dashes", G._safeName("hf.co/ggml-org/Q:4") === "hf.co-ggml-org-Q-4");
    ok("!! safeName leaves no path separator and no leading dot or dash", !/[\\/]/.test(G._safeName("../../etc/passwd")) && !/^[-.]/.test(G._safeName("../../etc/passwd")), G._safeName("../../etc/passwd"));
    ok("safeName never returns an empty name", G._safeName("") === "model" && G._safeName("///") === "model" && G._safeName(undefined) === "model");
    ok("safeName is at most 80 characters", G._safeName("a".repeat(500)).length === 80);
    ok("loopbackBase: the default and 127.0.0.1, localhost, [::1]", G._loopbackBase() === "http://127.0.0.1:11434" && G._loopbackBase("") === "http://127.0.0.1:11434" && G._loopbackBase("http://localhost:11434") === "http://localhost:11434" && G._loopbackBase("http://[::1]:11434") === "http://[::1]:11434" && G._loopbackBase("http://127.0.0.1:8080/") === "http://127.0.0.1:8080");
    for (const b of ["http://192.168.1.20:11434", "http://10.0.0.1:11434", "http://0.0.0.0:11434", "http://127.0.0.1.evil.com:11434", "http://evil.com", "https://127.0.0.1:11434", "http://u:p@127.0.0.1:11434", "http://127.0.0.1:11434/api", "http://127.0.0.1:11434/?x=1", "http://127.0.0.1:11434/#x", "ftp://127.0.0.1", "not a url", "localhost:11434"]) ok(`!! not a loopback http address: ${b}`, G._loopbackBase(b) === null);
    ok("binCandidates (posix): the PATH name, then ~/.local/bin", eq(G._binCandidates({ platform: "linux", home: "/home/k" }), ["gputaskman", "/home/k/.local/bin/gputaskman"]));
    ok("binCandidates (windows): .exe, backslashes", eq(G._binCandidates({ platform: "win32", home: "C:\\Users\\k" }), ["gputaskman", "C:\\Users\\k\\.local\\bin\\gputaskman.exe"]));
    ok("binCandidates with no home: the PATH name only", eq(G._binCandidates({ platform: "linux", home: "" }), ["gputaskman"]));
    ok("parseJsonLoose: clean object, array, and with a banner either side", G._parseJsonLoose('{"a":1}').value.a === 1 && G._parseJsonLoose("[1,2]").value.length === 2 && G._parseJsonLoose('hello\n{"a":{"b":2}}\nbye').value.a.b === 2);
    ok("parseJsonLoose: garbage, empty, null and a truncated object are not ok", !G._parseJsonLoose("nope").ok && !G._parseJsonLoose("").ok && !G._parseJsonLoose(null).ok && !G._parseJsonLoose('{"a":').ok);
    ok("the two installers are exactly the two documented commands", G.INSTALLERS.uv.text === "uv tool install gputaskman" && G.INSTALLERS.pipx.text === "pipx install gputaskman" && Object.keys(G.INSTALLERS).length === 2);
    ok("the installers cannot be edited from outside (frozen)", Object.isFrozen(G.INSTALLERS) && Object.isFrozen(G.INSTALLERS.uv) && Object.isFrozen(G.INSTALLERS.uv.args));
}

// ---- 2. runCmd --------------------------------------------------------------------------------------------------------------------------------------
console.log("\n2. runCmd: ALWAYS RESOLVES, NEVER A SHELL");
{
    const ex = fakeExec((c) => ({ stdout: "out", stderr: "err" }));
    const r = await G._runCmd(ex, "x", ["a b", "c;d"], { timeoutMs: 1234 });
    ok("success: ok, code 0, the text", r.ok && r.code === 0 && r.stdout === "out" && r.stderr === "err" && !r.notFound && !r.timedOut);
    ok("!! the arguments go through as ONE vector each, shell false, the timeout and windowsHide set", eq(ex.calls[0].args, ["a b", "c;d"]) && ex.calls[0].opts.shell === false && ex.calls[0].opts.timeout === 1234 && ex.calls[0].opts.windowsHide === true);
    const nf = await G._runCmd(fakeExec(() => ({ err: errOf({ code: "ENOENT" }) })), "x", []);
    ok("ENOENT reads notFound (and not a numeric code)", !nf.ok && nf.notFound && nf.errCode === "ENOENT" && nf.code === null);
    const bad = await G._runCmd(fakeExec(() => ({ err: errOf({ code: 2 }), stderr: "bad" })), "x", []);
    ok("a non-zero exit reads its code and is not notFound or timedOut", !bad.ok && bad.code === 2 && !bad.notFound && !bad.timedOut && bad.stderr === "bad");
    const to = await G._runCmd(fakeExec(() => ({ err: errOf({ killed: true, signal: "SIGTERM" }) })), "x", []);
    ok("a killed process reads timedOut", !to.ok && to.timedOut === true);
    const th = await G._runCmd(() => { throw errOf({ code: "EACCES" }, "denied"); }, "x", []);
    ok("an impl that THROWS still resolves, with the error", !th.ok && th.errCode === "EACCES" && /denied/.test(th.error));
    let twice = 0; const dbl = await G._runCmd((c, a, o, cb) => { cb(null, "1", ""); cb(null, "2", ""); twice++; }, "x", []);
    ok("a callback that fires twice resolves once, with the first", dbl.stdout === "1" && twice === 1);
}

// ---- 3. install --------------------------------------------------------------------------------------------------------------------------------------
console.log("\n3. install: A TWO-ENTRY ALLOW-LIST");
{
    for (const m of ["pip", "UV", "uv ", "uv; rm -rf /", "uv tool install evil", "__proto__", "constructor", "toString", "hasOwnProperty", "", null, undefined, 5, {}, ["uv"]]) {
        const sp = spyExec(), r = await G.install(m, { execFileImpl: sp, fetchImpl: spyFetch() });
        ok(`!! ${JSON.stringify(m)} is refused with no command run`, r.ok === false && r.refused === true && /unknown installer/.test(r.error) && sp.calls.length === 0);
    }
    const calls = [];
    const mkEx = (present) => fakeExec((cmd, args) => { calls.push([cmd, ...args].join(" ")); if (cmd === "uv" && args[0] === "tool") return { stdout: "installed gputaskman\n", stderr: "" }; if (cmd === "pipx") return { stdout: "done", stderr: "" }; if (cmd === "gputaskman" || /gputaskman/.test(cmd)) return present ? { stdout: "GPU 0: GTX 1080\n" } : { err: errOf({ code: "ENOENT" }) }; return { err: errOf({ code: "ENOENT" }) }; });
    const ex1 = mkEx(true), u = await G.install("uv", { execFileImpl: ex1, platform: "linux", home: "/h" });
    ok("uv: runs exactly `uv tool install gputaskman`, no shell", ex1.calls[0].cmd === "uv" && eq(ex1.calls[0].args, ["tool", "install", "gputaskman"]) && ex1.calls[0].opts.shell === false);
    ok("uv: ok, the command text, installed and found on the PATH afterwards", u.ok && u.command === "uv tool install gputaskman" && u.installed && u.path === "gputaskman" && u.hint === "" && /installed gputaskman/.test(u.stdout));
    const ex2 = mkEx(true), p = await G.install("pipx", { execFileImpl: ex2, platform: "linux", home: "/h" });
    ok("pipx: runs exactly `pipx install gputaskman`", ex2.calls[0].cmd === "pipx" && eq(ex2.calls[0].args, ["install", "gputaskman"]) && p.ok && p.command === "pipx install gputaskman");
    const ex3 = mkEx(false), n = await G.install("uv", { execFileImpl: ex3, platform: "linux", home: "/h" });
    ok("it installed but the bridge cannot find it: ok true, installed false, the restart hint", n.ok && !n.installed && /new terminal|restart the bridge/.test(n.hint));
    const ex4 = fakeExec((cmd) => ({ err: errOf({ code: "ENOENT" }) })), nf = await G.install("pipx", { execFileImpl: ex4 });
    ok("pipx itself missing: not ok, says so, points at pipx", !nf.ok && /pipx is not installed/.test(nf.error) && /pipx/.test(nf.hint) && ex4.calls.length === 1);
    const nfu = await G.install("uv", { execFileImpl: fakeExec(() => ({ err: errOf({ code: "ENOENT" }) })) });
    ok("uv itself missing: the hint names uv's page", !nfu.ok && /docs\.astral\.sh\/uv/.test(nfu.hint));
    const fl = await G.install("uv", { execFileImpl: fakeExec((c) => (c === "uv" ? { err: errOf({ code: 1 }), stderr: "no matching distribution" } : { err: errOf({ code: "ENOENT" }) })) });
    ok("a failing install: not ok, the stderr is the error, exit code 1", !fl.ok && fl.exitCode === 1 && /no matching distribution/.test(fl.error) && !fl.installed);
    const tmo = await G.install("uv", { execFileImpl: fakeExec((c) => (c === "uv" ? { err: errOf({ killed: true }) } : { err: errOf({ code: "ENOENT" }) })) });
    ok("a timed-out install says it did not finish", !tmo.ok && tmo.timedOut && /did not finish/.test(tmo.error));
    const long = "x".repeat(9000), tl = await G.install("uv", { execFileImpl: fakeExec((c) => (c === "uv" ? { stdout: long } : { err: errOf({ code: "ENOENT" }) })) });
    ok("a long install log is cut to its tail", tl.stdout.length <= 3003 && tl.stdout.startsWith("..."));
}

// ---- 4. detect ---------------------------------------------------------------------------------------------------------------------------------------
console.log("\n4. detect: WHAT IS ON THE MACHINE");
{
    const world = (over = {}) => ({
        execFileImpl: fakeExec((cmd, args) => {
            const key = cmd.replace(/^.*[\\/]/, "");
            if (key === "uv") return over.uv === false ? { err: errOf({ code: "ENOENT" }) } : { stdout: "uv 0.5.1 (abc)\n" };
            if (key === "pipx") return over.pipx === false ? { err: errOf({ code: "ENOENT" }) } : { stdout: "1.7.1\n" };
            if (key === "python") return over.python === false ? { err: errOf({ code: "ENOENT" }) } : { stdout: "Python 3.12.1\n" };
            if (key === "python3" || key === "py") return { err: errOf({ code: "ENOENT" }) };
            if (key.startsWith("gputaskman")) { if (over.gt === "missing") return { err: errOf({ code: "ENOENT" }) }; if (over.gt === "broken") return { err: errOf({ code: 1 }), stderr: "no NVML" }; if (over.gt === "home" && cmd === "gputaskman") return { err: errOf({ code: "ENOENT" }) }; return { stdout: "0: NVIDIA GeForce GTX 1080 (8 GB)\n" }; }
            return { err: errOf({ code: "ENOENT" }) };
        }),
        fetchImpl: fakeFetch((m, url) => { if (over.ollama === "down") throw new Error("ECONNREFUSED"); if (/\/api\/version$/.test(url)) return { status: 200, json: { version: "0.9.2" } }; if (/\/api\/tags$/.test(url)) return { status: 200, json: { models: [{ name: "qwen2.5-coder:7b", size: 4700000000 }, { model: "llama3.1:8b", size: 4900000000 }, {}] } }; return { status: 404, json: {} }; }),
        platform: "win32", home: "C:\\Users\\k",
    });
    const all = await G.detect(world());
    ok("everything present: versions read, gputaskman works with its GPU list", all.ok && all.installers.uv.found && /0\.5\.1/.test(all.installers.uv.version) && all.installers.pipx.found && all.python.found && all.python.cmd === "python" && /3\.12/.test(all.python.version) && all.gputaskman.installed && all.gputaskman.works && /GTX 1080/.test(all.gputaskman.gpus));
    ok("each installer carries its literal command for the page to show", all.installers.uv.command === "uv tool install gputaskman" && all.installers.pipx.command === "pipx install gputaskman");
    ok("Ollama up: the version and the pulled models (names, sizes; an entry with no name is dropped)", all.ollama.up && all.ollama.version === "0.9.2" && eq(all.ollama.models.map((m) => m.name), ["qwen2.5-coder:7b", "llama3.1:8b"]) && all.ollama.models[0].sizeBytes === 4700000000);
    ok("the repository and the package are named", all.repo === "https://github.com/shanselman/gputaskman" && all.package === "gputaskman" && all.platform === "win32");
    const none = await G.detect(world({ uv: false, pipx: false, python: false, gt: "missing", ollama: "down" }));
    ok("nothing present: not found, not installed, Ollama down with a reason, and it still returns ok", none.ok && !none.installers.uv.found && !none.installers.pipx.found && !none.python.found && !none.gputaskman.installed && !none.ollama.up && /nothing answered/.test(none.ollama.error));
    const broken = await G.detect(world({ gt: "broken" }));
    ok("gputaskman present but failing: installed true, works false, the reason", broken.gputaskman.installed && !broken.gputaskman.works && /no NVML/.test(broken.gputaskman.error) && broken.gputaskman.gpus === null);
    const home = await G.detect(world({ gt: "home" }));
    ok("not on the PATH but in ~/.local/bin: found there", home.gputaskman.installed && home.gputaskman.works && /\.local\\bin\\gputaskman\.exe$/.test(home.gputaskman.path) && eq(home.gputaskman.tried, ["PATH", "~/.local/bin"]));
    const sfl = spyFetch(), lan = await G.detect({ ...world(), base: "http://192.168.1.5:11434", fetchImpl: sfl });
    ok("!! a LAN Ollama address is refused before any request", !lan.ollama.up && /loopback/.test(lan.ollama.error) && sfl.calls.length === 0);
}

// ---- 5. snapshot -------------------------------------------------------------------------------------------------------------------------------------
console.log("\n5. snapshot: gputaskman --once --json");
{
    const snapEx = (stdout, extra = {}) => fakeExec((cmd) => (/gputaskman/.test(cmd) ? { stdout, ...extra } : { err: errOf({ code: "ENOENT" }) }));
    const ex = snapEx('{"gpus":[{"name":"GTX 1080","vram_used":1200}],"processes":[]}');
    const s = await G.snapshot({ execFileImpl: ex, platform: "linux", home: "/h", now: clock() });
    const snapCall = ex.calls.find((c) => c.args.includes("--once"));
    ok("the arguments are exactly --once --json, no shell", eq(snapCall.args, ["--once", "--json"]) && snapCall.opts.shell === false);
    ok("ok, the parsed JSON, the command text and an ISO time", s.ok && s.json.gpus[0].name === "GTX 1080" && s.command === "gputaskman --once --json" && /^2026-11-08T05:12:3\d\.\d{3}Z$/.test(s.at));
    const g1 = snapEx("{}"), s1 = await G.snapshot({ execFileImpl: g1, platform: "linux", home: "/h", gpu: 1 });
    ok("--gpu 1 is added as two arguments", eq(g1.calls.find((c) => c.args.includes("--once")).args, ["--once", "--json", "--gpu", "1"]) && s1.command === "gputaskman --once --json --gpu 1");
    const g0 = snapEx("{}"); await G.snapshot({ execFileImpl: g0, platform: "linux", home: "/h", gpu: "0" });
    ok("the gpu may be the string '0' (a form field), which means GPU 0", eq(g0.calls.find((c) => c.args.includes("--once")).args, ["--once", "--json", "--gpu", "0"]));
    for (const bad of ["1; rm -rf /", -1, 64, 1.5, "abc", "1 2", NaN, {}, [1]]) {
        const ex2 = snapEx("{}"), r = await G.snapshot({ execFileImpl: ex2, platform: "linux", home: "/h", gpu: bad });
        ok(`!! gpu ${JSON.stringify(bad)} is refused and gputaskman is not run for a snapshot`, !r.ok && /whole number/.test(r.error) && !ex2.calls.some((c) => c.args.includes("--once")));
    }
    const noGpu = snapEx("{}"), r3 = await G.snapshot({ execFileImpl: noGpu, platform: "linux", home: "/h", gpu: "" });
    ok("an empty gpu field means no --gpu", eq(noGpu.calls.find((c) => c.args.includes("--once")).args, ["--once", "--json"]) && r3.ok);
    const ban = await G.snapshot({ execFileImpl: snapEx('warning: early software\n{"a":1}\n'), platform: "linux", home: "/h" });
    ok("a banner before the JSON is skipped", ban.ok && ban.json.a === 1);
    const nj = await G.snapshot({ execFileImpl: snapEx("this is not json at all"), platform: "linux", home: "/h" });
    ok("text that is not JSON: not ok, the raw text kept, nothing invented", !nj.ok && nj.json === null && /not json/i.test(nj.raw) && /not JSON/.test(nj.error));
    const nz = await G.snapshot({ execFileImpl: fakeExec((c) => (/gputaskman/.test(c) ? { err: errOf({ code: 3 }), stdout: '{"partial":true}', stderr: "driver error" } : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("a non-zero exit with JSON: not ok, the JSON still returned, the stderr named", !nz.ok && nz.json && nz.json.partial === true && /driver error/.test(nz.error));
    const tmo = await G.snapshot({ execFileImpl: fakeExec((c) => (/gputaskman/.test(c) ? { err: errOf({ killed: true }) } : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("a hang reads as not answering in time", !tmo.ok && /did not answer/.test(tmo.error));
    const missing = await G.snapshot({ execFileImpl: fakeExec(() => ({ err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("not installed: says so and mentions restarting the bridge", !missing.ok && /not installed/.test(missing.error) && /restart the bridge/.test(missing.error));
    const smi = await G.nvidiaSmi({ execFileImpl: fakeExec((cmd, args) => (cmd === "nvidia-smi" ? { stdout: "0, NVIDIA GeForce GTX 1080, 552.44, 8192, 1500, 12, 45\n1, Other GPU, 552.44, 4096, 100, [N/A], 30\n" } : { err: errOf({ code: "ENOENT" }) })) });
    ok("nvidia-smi: the CSV becomes numbers (an [N/A] is null)", smi.ok && smi.gpus.length === 2 && smi.gpus[0].name === "NVIDIA GeForce GTX 1080" && smi.gpus[0].memoryTotalMiB === 8192 && smi.gpus[0].memoryUsedMiB === 1500 && smi.gpus[0].utilizationPct === 12 && smi.gpus[1].utilizationPct === null);
    const smiEx = fakeExec(() => ({ stdout: "" })); await G.nvidiaSmi({ execFileImpl: smiEx });
    ok("nvidia-smi is called with one fixed query and no shell", smiEx.calls[0].cmd === "nvidia-smi" && smiEx.calls[0].args.length === 2 && smiEx.calls[0].args[1] === "--format=csv,noheader,nounits" && smiEx.calls[0].opts.shell === false);
    const smiNo = await G.nvidiaSmi({ execFileImpl: fakeExec(() => ({ err: errOf({ code: "ENOENT" }) })) });
    ok("no nvidia-smi: not ok, says not found (an AMD or Intel machine)", !smiNo.ok && /not found/.test(smiNo.error));
    const hi = G.hostInfo({ osImpl: fakeOs(), nodeVersion: "v22.0.0" });
    ok("hostInfo: platform, release, arch, the CPU trimmed, memory in GB, and it reads no host name, user or home", hi.platform === "win32" && hi.cpuModel === "Intel(R) Xeon(R) E5" && hi.cpuCount === 2 && hi.totalMemGB === 32 && hi.freeMemGB === 16 && hi.node === "v22.0.0");
}

// ---- 6. the Ollama calls ------------------------------------------------------------------------------------------------------------------------------
console.log("\n6. THE OLLAMA CALLS (its HTTP API only)");
{
    const okGen = { status: 200, json: { response: "def fib(n): ...", eval_count: 100, eval_duration: 5e9, prompt_eval_count: 40, prompt_eval_duration: 2e9, load_duration: 1e9, total_duration: 9e9 } };
    const f = fakeFetch((m, url) => (/\/api\/generate$/.test(url) ? { status: 200, json: { done: true, done_reason: "load" } } : { status: 404, json: {} }));
    const L = await G.ollamaLoad("qwen2.5-coder:7b", { fetchImpl: f });
    ok("load: POST /api/generate with an EMPTY prompt, stream false, keep_alive 15m", f.calls.length === 1 && f.calls[0].method === "POST" && f.calls[0].url === "http://127.0.0.1:11434/api/generate" && eq(f.calls[0].body, { model: "qwen2.5-coder:7b", prompt: "", stream: false, keep_alive: "15m" }));
    ok("load: ok with the done reason", L.ok && L.doneReason === "load");
    const nf = await G.ollamaLoad("nope:1b", { fetchImpl: fakeFetch(() => ({ status: 404, json: { error: "model 'nope:1b' not found" } })) });
    ok("load of a model that is not pulled: not ok, Ollama's words, and the ollama pull line", !nf.ok && /not found/.test(nf.error) && /ollama pull nope:1b/.test(nf.hint));
    const dn = await G.ollamaLoad("x", { fetchImpl: fakeFetch(() => { throw new Error("ECONNREFUSED"); }) });
    ok("load with Ollama down: not ok, the reason, no throw", !dn.ok && /ECONNREFUSED/.test(dn.error));
    const sfa = spyFetch();
    ok("!! load refuses a bad model name or a non-loopback base without a request", (await G.ollamaLoad("x y", { fetchImpl: sfa })).ok === false && (await G.ollamaLoad("x", { fetchImpl: sfa, base: "http://10.0.0.2:11434" })).ok === false && sfa.calls.length === 0);
    const to = await G.ollamaLoad("x", { fetchImpl: (u, i) => new Promise((res, rej) => { i.signal.addEventListener("abort", () => rej(new Error("aborted"))); }), loadTimeoutMs: 20 });
    ok("a load that never answers is aborted at its timeout", !to.ok && /timed out/.test(to.error));
    const ps = await G.ollamaPs({ fetchImpl: fakeFetch(() => ({ status: 200, json: { models: [{ name: "q:7b", size: 5000000000, size_vram: 4000000000, expires_at: "2026-11-08T06:00:00Z", context_length: 4096, details: { quantization_level: "Q4_K_M" }, digest: "abc" }] } })) });
    ok("ps: name, size, size_vram, expiry, context length, details (the digest is not carried)", ps.ok && ps.models[0].name === "q:7b" && ps.models[0].sizeBytes === 5000000000 && ps.models[0].sizeVramBytes === 4000000000 && ps.models[0].contextLength === 4096 && ps.models[0].details.quantization_level === "Q4_K_M" && !("digest" in ps.models[0]));
    const psNo = await G.ollamaPs({ fetchImpl: fakeFetch(() => ({ status: 500, json: { error: "oops" } })) });
    ok("ps failing: not ok, an empty list", !psNo.ok && psNo.models.length === 0 && /oops/.test(psNo.error));
    const g = fakeFetch(() => okGen), R = await G.ollamaGenerate("q:7b", "hello", 150, { fetchImpl: g });
    ok("generate: the body (stream false, temperature 0, num_predict 150, keep_alive 15m)", eq(g.calls[0].body, { model: "q:7b", prompt: "hello", stream: false, keep_alive: "15m", options: { num_predict: 150, temperature: 0 } }));
    ok("generate: tokens per second = eval_count / eval_duration (100 tokens in 5 s = 20), the prompt rate (40 in 2 s = 20)", R.ok && R.tokensPerSecond === 20 && R.promptTokensPerSecond === 20 && R.evalCount === 100 && R.totalDurationNs === 9e9 && R.loadDurationNs === 1e9);
    ok("generate: only the head of the reply is kept", R.responseHead === "def fib(n): ...");
    for (const [asked, want] of [[5, 16], [5000, 1024], [undefined, 200], [0, 200], ["x", 200], [16, 16], [1024, 1024], [300.7, 300]]) { const gg = fakeFetch(() => okGen); await G.ollamaGenerate("q", "p", asked, { fetchImpl: gg }); ok(`num_predict ${JSON.stringify(asked)} -> ${want}`, gg.calls[0].body.options.num_predict === want); }
    const zero = await G.ollamaGenerate("q", "p", 50, { fetchImpl: fakeFetch(() => ({ status: 200, json: { response: "", eval_count: 0, eval_duration: 0 } })) });
    ok("no timing in the reply: the rates are null, not Infinity or NaN", zero.ok && zero.tokensPerSecond === null && zero.promptTokensPerSecond === null);
    const un = fakeFetch(() => ({ status: 200, json: {} })); await G.ollamaUnload("q:7b", { fetchImpl: un });
    ok("unload: keep_alive 0 with an empty prompt", eq(un.calls[0].body, { model: "q:7b", prompt: "", stream: false, keep_alive: 0 }));
    const sfu = spyFetch();
    ok("!! unload refuses a bad name without a request", (await G.ollamaUnload("a b", { fetchImpl: sfu })).ok === false && sfu.calls.length === 0);
}

// ---- 7. the session ----------------------------------------------------------------------------------------------------------------------------------
console.log("\n7. THE SESSION: baseline, load, loaded, busy");
/** One scripted machine for the session: gputaskman and nvidia-smi present, Ollama up with the model pulled, a generation that does not finish until the busy snapshot has been taken. */
function sessionWorld(over = {}) {
    const events = []; let gtCount = 0, releaseGen; const genGate = new Promise((r) => { releaseGen = r; });
    const exec = fakeExec((cmd, args) => {
        if (/gputaskman/.test(cmd)) {
            if (over.gt === "missing") return { err: errOf({ code: "ENOENT" }) };
            if (args.includes("--list-gpus")) return { stdout: "0: GTX 1080\n" };
            gtCount++; events.push("gt-snapshot#" + gtCount); if (gtCount === 3 && events.includes("generate-start")) releaseGen();
            return { stdout: JSON.stringify({ n: gtCount, gpus: [{ name: "GTX 1080", vram_used_mb: 1000 * gtCount }], processes: [{ name: "ollama.exe" }] }) };
        }
        if (cmd === "nvidia-smi") { events.push("smi"); return over.smi === false ? { err: errOf({ code: "ENOENT" }) } : { stdout: "0, NVIDIA GeForce GTX 1080, 552.44, 8192, 2000, 55, 61\n" }; }
        if (cmd === "uv" || cmd === "pipx" || cmd === "python" || cmd === "python3" || cmd === "py") return { err: errOf({ code: "ENOENT" }) };
        return { err: errOf({ code: "ENOENT" }) };
    });
    const psList = { models: [{ name: "q:7b", size: 17000000000, size_vram: 7000000000, expires_at: "x", context_length: 4096, details: {} }] };
    const fetch = fakeFetch(async (m, url, body) => {
        if (over.down) throw new Error("ECONNREFUSED");
        if (/\/api\/version$/.test(url)) return { status: 200, json: { version: "0.9.2" } };
        if (/\/api\/tags$/.test(url)) return { status: 200, json: { models: over.notPulled ? [] : [{ name: over.tagName || "q:7b", size: 17000000000 }] } };
        if (/\/api\/ps$/.test(url)) { events.push("ps"); const phase = events.includes("generate-end") ? "after" : events.includes("generate-start") ? "busy" : "loaded"; return { status: 200, json: (over.ps && over.ps[phase]) || psList }; }
        if (/\/api\/generate$/.test(url)) {
            if (body.keep_alive === 0) { events.push("unload"); return { status: 200, json: {} }; }
            if (body.prompt === "") { events.push("load"); return over.notPulled ? { status: 404, json: { error: "model 'q:7b' not found" } } : { status: 200, json: { done: true, done_reason: "load" } }; }
            events.push("generate-start"); await genGate; events.push("generate-end");
            return over.genFails ? { status: 500, json: { error: "out of memory" } } : { status: 200, json: { response: "def fib", eval_count: 60, eval_duration: 20e9, prompt_eval_count: 30, prompt_eval_duration: 1e9, load_duration: 0, total_duration: 22e9 } };
        }
        return { status: 404, json: {} };
    });
    const fsx = fakeFs(over.fs || {}), sleeps = [];
    return { events, exec, fetch, fsx, sleeps, release: () => releaseGen(), opts: { nowMs: (() => { let t = 0; return () => (t += 1250); })(), execFileImpl: exec, fetchImpl: fetch, fsImpl: fsx, osImpl: fakeOs(), sleepImpl: async (ms) => { sleeps.push(ms); events.push("sleep"); if (over.gt === "missing") releaseGen(); await tick(); }, now: clock(), platform: "win32", home: "C:\\Users\\k", root: "/eng", nodeVersion: "v22.0.0" } };
}
{
    const w = sessionWorld(), { result, saved } = await G.runSession({ model: "q:7b", numPredict: 128 }, w.opts);
    ok("the session succeeds and says so", result.ok === true && result.error === "" && result.kind === "gputaskman-session" && result.schema === 1);
    const idx = (e) => w.events.indexOf(e), gen = w.events.indexOf("generate-start");
    ok("!! THE ORDER: baseline snapshot, then the load, then the 'loaded' snapshot", idx("gt-snapshot#1") < idx("load") && idx("load") < idx("gt-snapshot#2"), w.events.join(" "));
    ok("!! THE ORDER: the generation starts, the settle wait runs, THEN the 'busy' snapshot, THEN the generation ends", gen > idx("gt-snapshot#2") && w.events.indexOf("sleep") > gen && idx("gt-snapshot#3") > w.events.indexOf("sleep") && w.events.indexOf("generate-end") > idx("gt-snapshot#3"), w.events.join(" "));
    ok("the three snapshots are kept under their labels with their own JSON", result.snapshots.baseline.json.n === 1 && result.snapshots.loaded.json.n === 2 && result.snapshots.busy.json.n === 3 && result.snapshots.busy.ok);
    ok("nvidia-smi is read at the same three points", ["baseline", "loaded", "busy"].every((k) => result.nvidiaSmi[k].ok && result.nvidiaSmi[k].gpus[0].memoryUsedMiB === 2000));
    ok("Ollama's ps is kept after the load, during the generation and after it", result.ollama.ps.loaded.ok && result.ollama.ps.busy.ok && result.ollama.ps.after.ok);
    ok("the settle wait is the default 2500 ms", eq(w.sleeps, [2500]));
    ok("the generation's own numbers are kept (60 tokens in 20 s = 3 tokens/s)", result.ollama.generate.ok && result.ollama.generate.tokensPerSecond === 3 && result.ollama.generate.numPredict === 128);
    ok("the summary: 17 GB model, 7 GB in VRAM, 41.2 percent on the GPU, 3 tokens/s", result.summary.modelSizeGB === 15.83 && result.summary.inVramGB === 6.52 && result.summary.onGpuPct === 41.2 && result.summary.tokensPerSecond === 3 && result.summary.gputaskmanInstalled === true);
    ok("the request is recorded, with the fixed prompt, and nothing the caller did not send", result.request.model === "q:7b" && result.request.numPredict === 128 && result.request.prompt === G.PROMPT && result.request.base === "http://127.0.0.1:11434" && result.request.unloadWhenDone === false);
    ok("the steps list reads detect, snapshots, load, generate in order and every step has a time and a verdict", ["detect", "snapshot-baseline", "load", "snapshot-loaded", "generate", "snapshot-busy"].every((s) => result.steps.some((x) => x.step === s)) && result.steps.every((x) => /^2026-/.test(x.at) && typeof x.ok === "boolean"));
    ok("the file is written inside brain/rig-results/gpu-snapshots/ with a time-and-model name", saved.ok && saved.relative === "brain/rig-results/gpu-snapshots/gpusnap-20261108-051233-q-7b.json".replace("051233", saved.relative.match(/-(\d{6})-/)[1]) && /^gpusnap-20261108-\d{6}-q-7b\.json$/.test(path.basename(saved.absolute)));
    const text = Object.values(w.fsx.w.files)[0];
    ok("the saved file is the result, as JSON, one file only, the folder made recursively", Object.keys(w.fsx.w.files).length === 1 && JSON.parse(text).kind === "gputaskman-session" && JSON.parse(text).snapshots.busy.json.n === 3 && w.fsx.w.dirs[0][1].recursive === true);
    ok("!! nothing saved names the machine, a user or a path (the fake OS throws if asked)", !/KEITH|C:\\\\Users|\/home\//.test(text) && !/hostname|userInfo/.test(text));
}
{
    const w = sessionWorld({ down: true }), { result, saved } = await G.runSession({ model: "q:7b" }, w.opts);
    ok("Ollama down: the baseline snapshot is still taken and saved, nothing is loaded, the reason is the error", !result.ok && /not answering/.test(result.error) && result.snapshots.baseline.ok && !w.events.includes("load") && !w.events.includes("generate-start") && saved.ok);
}
{
    const w = sessionWorld({ notPulled: true }), { result } = await G.runSession({ model: "q:7b" }, w.opts);
    ok("model not pulled: the load fails with the pull hint, no generation starts, the baseline is kept", !result.ok && /ollama pull q:7b/.test(result.error) && !w.events.includes("generate-start") && result.snapshots.baseline.ok && result.ollama.modelPulled === false);
}
{
    const w = sessionWorld({ gt: "missing", smi: false }), { result, saved } = await G.runSession({ model: "q:7b" }, w.opts);
    ok("no gputaskman and no nvidia-smi: the session still runs the model and reports the timing, with the snapshots marked not ok", result.ok && result.gputaskman.installed === false && result.snapshots.busy.ok === false && /not installed/.test(result.snapshots.busy.error) && result.ollama.generate.ok && result.summary.gputaskmanInstalled === false && saved.ok);
}
{
    const w = sessionWorld({ genFails: true }), { result } = await G.runSession({ model: "q:7b" }, w.opts);
    ok("a generation that fails: the session is not ok, says the model loaded, and keeps what it measured", !result.ok && /loaded but the test generation failed/.test(result.error) && /out of memory/.test(result.error) && result.snapshots.busy.ok);
}
{
    const w = sessionWorld(), { result } = await G.runSession({ model: "q:7b", unloadWhenDone: true, settleMs: 0 }, w.opts);
    ok("unloadWhenDone: the model is unloaded at the end, and settleMs 0 is honoured", result.ok && result.ollama.unloaded === true && w.events[w.events.length - 1] === "unload" && eq(w.sleeps, [0]) && result.request.unloadWhenDone === true);
}
{
    const w = sessionWorld({ fs: { write: new Error("EACCES: permission denied") } }), { result, saved } = await G.runSession({ model: "q:7b" }, w.opts);
    ok("a disk that refuses the file: saved.ok false, the session itself still ok, and the reason is in result.saveError (not in error)", !saved.ok && /EACCES/.test(saved.error) && result.ok === true && result.error === "" && /EACCES/.test(result.saveError));
}
{
    const w = sessionWorld({ fs: { mkdir: new Error("ENOSPC") } }), { saved } = await G.runSession({ model: "q:7b" }, w.opts);
    ok("a folder that cannot be made is reported the same way", !saved.ok && /ENOSPC/.test(saved.error));
}
{
    const w = sessionWorld(), bad = await G.runSession({ model: "x; rm -rf /" }, w.opts);
    ok("!! a bad model name: refused, no command, no request, no file", !bad.result.ok && /not valid/.test(bad.result.error) && w.exec.calls.length === 0 && w.fetch.calls.length === 0 && Object.keys(w.fsx.w.files).length === 0 && bad.saved.ok === false);
    const w2 = sessionWorld(), lan = await G.runSession({ model: "q:7b", base: "http://10.1.1.1:11434" }, w2.opts);
    ok("!! a non-loopback Ollama: refused before anything runs", !lan.result.ok && /127\.0\.0\.1|localhost/.test(lan.result.error) && w2.exec.calls.length === 0 && w2.fetch.calls.length === 0 && Object.keys(w2.fsx.w.files).length === 0);
}
{
    const w = sessionWorld(), { saved } = await G.runSession({ model: "../../../a/../../etc/passwd:x" }, w.opts);
    ok("!! a model name full of dots and slashes cannot leave the folder (it is refused, being no model name)", saved.ok === false && Object.keys(w.fsx.w.files).length === 0);
    const w2 = sessionWorld(), r2 = await G.runSession({ model: "a/../../b" }, w2.opts);
    ok("!! a name that IS valid but holds '/..' is saved INSIDE the folder, as one file", r2.saved.ok && path.dirname(r2.saved.absolute) === path.join("/eng", "brain", "rig-results", "gpu-snapshots") && !/[\\/]/.test(path.basename(r2.saved.absolute)));
}
{
    const w = sessionWorld(); w.opts.osImpl = { ...fakeOs(), cpus: () => { throw new Error("cpus exploded"); } };
    const r = await G.runSession({ model: "q:7b" }, w.opts).then((x) => ({ resolved: true, ...x }), () => ({ resolved: false }));
    ok("a machine that will not say what it is (the OS read throws) does not stop or reject the session: the host reads an error and the run goes on", r.resolved && r.result.ok && typeof r.result.host.error === "string" && /cpus exploded/.test(r.result.host.error) && r.saved.ok);
}

// ---- 10. added after the first sweep ----------------------------------------------------------------------------------------------------------------
console.log("\n10. ADDED AFTER THE FIRST SWEEP (each closes surviving mutants; see the LOG in the header)");
{
    ok("!! a username alone, or a password alone, in the Ollama address is refused", G._loopbackBase("http://u@127.0.0.1:11434") === null && G._loopbackBase("http://:p@127.0.0.1:11434") === null);
    ok("parseJsonLoose: JSON at the very start followed by trailing text is still read", G._parseJsonLoose('{"a":1}\ntrailing words').value.a === 1 && G._parseJsonLoose('[1,2]\nbye').value.length === 2);

    // the timeouts the module promises, read from the options each command is run with
    const found = (calls, pred) => (calls.find(pred) || { opts: {} }).opts;
    const exA = fakeExec((cmd, args) => (/gputaskman/.test(cmd) ? { stdout: "{}" } : cmd === "nvidia-smi" ? { stdout: "" } : { stdout: "v1" }));
    await G.detect({ execFileImpl: exA, fetchImpl: fakeFetch(() => ({ status: 200, json: {} })), platform: "linux", home: "/h" });
    await G.snapshot({ execFileImpl: exA, platform: "linux", home: "/h" }); await G.nvidiaSmi({ execFileImpl: exA }); await G.install("uv", { execFileImpl: exA, platform: "linux", home: "/h" });
    ok("timeouts: --list-gpus 15 s, --version 8 s, the snapshot 45 s, nvidia-smi 15 s, an install 5 minutes", found(exA.calls, (c) => c.args.includes("--list-gpus")).timeout === 15000 && found(exA.calls, (c) => c.cmd === "uv" && c.args[0] === "--version").timeout === 8000 && found(exA.calls, (c) => c.args.includes("--once")).timeout === 45000 && found(exA.calls, (c) => c.cmd === "nvidia-smi").timeout === 15000 && found(exA.calls, (c) => c.cmd === "uv" && c.args[0] === "tool").timeout === 300000);
    const exB = fakeExec(() => ({ stdout: "x" })); await G._runCmd(exB, "x", []);
    ok("a command given no timeout gets 30 s and a 16 MiB output buffer", exB.calls[0].opts.timeout === 30000 && exB.calls[0].opts.maxBuffer === 16777216);

    // truncation: every cut keeps exactly the tail it promises, behind '...'
    const big = (n, ch = "g") => ch.repeat(n);
    const lg = await G.locate({ execFileImpl: fakeExec((c) => (/gputaskman/.test(c) ? { stdout: big(5000) } : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("the GPU list is cut to its last 1500 characters behind '...'", lg.gpus.length === 1503 && lg.gpus.startsWith("..."));
    const lg2 = await G.locate({ execFileImpl: fakeExec((c) => (/gputaskman/.test(c) ? { err: errOf({ code: 1 }), stderr: big(2000, "e") } : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("a failing monitor's reason is cut to its last 600 characters", lg2.installed && !lg2.works && lg2.error.length === 603);
    const dv = await G.detect({ execFileImpl: fakeExec((c, a) => (c === "uv" ? { stdout: big(500, "v") } : c === "pipx" ? { err: errOf({ code: 1 }), stderr: big(1000, "p") } : { err: errOf({ code: "ENOENT" }) })), fetchImpl: spyFetch(), platform: "linux", home: "/h", base: "http://10.0.0.1:1" });
    ok("a version line is cut to 120 characters (+3) and a failing installer's reason to 200 (+3)", dv.installers.uv.version.length === 123 && dv.installers.pipx.error.length === 203 && dv.installers.pipx.found === true);
    const snapBig = await G.snapshot({ execFileImpl: fakeExec((c) => (/gputaskman/.test(c) ? (/--list-gpus/.test(c) ? { stdout: "" } : { stdout: big(9000, "r"), stderr: big(3000, "s") }) : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("text that is not JSON: the raw text is cut to its last 4000 characters and the stderr to 1500", !snapBig.ok && snapBig.raw.length === 4003 && snapBig.stderr.length === 1503);
    const snapErr = await G.snapshot({ execFileImpl: fakeExec((c, a) => (/gputaskman/.test(c) ? (a.includes("--list-gpus") ? { stdout: "" } : { err: errOf({ code: 2 }), stderr: big(2000, "z") }) : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("a failing snapshot's reason is cut to its last 600 characters", !snapErr.ok && snapErr.error.length === 603);
    const smiErr = await G.nvidiaSmi({ execFileImpl: fakeExec(() => ({ err: errOf({ code: 9 }), stderr: big(1000, "n") })) });
    ok("nvidia-smi's failure reason is cut to its last 300 characters", !smiErr.ok && smiErr.error.length === 303);
    const insBig = await G.install("pipx", { execFileImpl: fakeExec((c) => (c === "pipx" ? { err: errOf({ code: 1 }), stdout: big(9000, "o"), stderr: big(9000, "x") } : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("a failed install: stdout and stderr each cut to 3000 (+3), the error to 600 (+3)", insBig.stdout.length === 3003 && insBig.stderr.length === 3003 && insBig.error.length === 603);
    const genBig = await G.ollamaGenerate("q", "p", 50, { fetchImpl: fakeFetch(() => ({ status: 200, json: { response: big(1000, "t"), eval_count: 1, eval_duration: 1e9 } })) });
    ok("the head of the reply is exactly 400 characters", genBig.responseHead.length === 400);

    // the monitor: not installed, python fallback, boundaries
    const none = await G.detect({ execFileImpl: fakeExec(() => ({ err: errOf({ code: "ENOENT" }) })), fetchImpl: spyFetch(), platform: "linux", home: "/h", base: "http://10.0.0.1:1" });
    ok("not installed reads works false and no GPU list", none.gputaskman.installed === false && none.gputaskman.works === false && none.gputaskman.gpus === null);
    const py = await G.detect({ execFileImpl: fakeExec((c) => (c === "python" ? { stdout: "" } : c === "python3" ? { stdout: "Python 3.11.2\n" } : { err: errOf({ code: "ENOENT" }) })), fetchImpl: spyFetch(), platform: "linux", home: "/h", base: "http://10.0.0.1:1" });
    ok("a python that prints no version is skipped for the next (python3)", py.python.found && py.python.cmd === "python3" && /3\.11/.test(py.python.version));
    const e63 = fakeExec((c) => (/gputaskman/.test(c) ? { stdout: "{}" } : { err: errOf({ code: "ENOENT" }) })), r63 = await G.snapshot({ execFileImpl: e63, platform: "linux", home: "/h", gpu: 63 });
    ok("--gpu 63 is the last accepted number", r63.ok && eq(e63.calls.find((c) => c.args.includes("--once")).args, ["--once", "--json", "--gpu", "63"]));
    const e07 = fakeExec((c) => (/gputaskman/.test(c) ? { stdout: "{}" } : { err: errOf({ code: "ENOENT" }) })); await G.snapshot({ execFileImpl: e07, platform: "linux", home: "/h", gpu: "07" });
    ok("a two-digit string is a number (07 is GPU 7), three digits are not", eq(e07.calls.find((c) => c.args.includes("--once")).args, ["--once", "--json", "--gpu", "7"]) && !(await G.snapshot({ execFileImpl: e07, platform: "linux", home: "/h", gpu: "100" })).ok);
    const smi = await G.nvidiaSmi({ execFileImpl: fakeExec((c) => ({ stdout: "0, NVIDIA GeForce GTX 1080, 552.44, 8192, 1500, 12, 45\n1, Other GPU, 551.1, 4096, 100, [N/A], 30\n" })) });
    ok("nvidia-smi: every column lands in its field (index, name, driver, totals, used, utilization, temperature)", eq(smi.gpus[0], { index: 0, name: "NVIDIA GeForce GTX 1080", driver: "552.44", memoryTotalMiB: 8192, memoryUsedMiB: 1500, utilizationPct: 12, temperatureC: 45 }) && eq(smi.gpus[1], { index: 1, name: "Other GPU", driver: "551.1", memoryTotalMiB: 4096, memoryUsedMiB: 100, utilizationPct: null, temperatureC: 30 }));

    // Ollama: failure shapes
    const v500 = await G.ollamaStatus({ fetchImpl: fakeFetch(() => ({ status: 500, json: {} })) });
    ok("a version endpoint that answers 500: not up, 'HTTP 500' (not 'nothing answered')", !v500.up && v500.error === "HTTP 500" && !/nothing answered/.test(v500.error));
    const t500 = await G.ollamaStatus({ fetchImpl: fakeFetch((m, url) => (/version/.test(url) ? { status: 200, json: { version: "1" } } : { status: 500, json: {} })) });
    ok("a tags endpoint that fails: Ollama is up with no models listed", t500.up === true && t500.models.length === 0);
    const tnull = await G.ollamaStatus({ fetchImpl: fakeFetch((m, url) => (/version/.test(url) ? { status: 200, json: { version: "1" } } : { status: 200, json: null })) });
    ok("a tags answer with no JSON: up, no models, no throw", tnull.up && tnull.models.length === 0);
    const tbad = await G.ollamaStatus({ fetchImpl: fakeFetch((m, url) => (/version/.test(url) ? { status: 200, json: { version: "1" } } : { status: 200, json: { models: "nope" } })) });
    ok("a tags answer whose models is not a list: no models", tbad.up && tbad.models.length === 0);
    const sfr = spyFetch(), LAN = "http://10.0.0.2:11434";
    const refusals = [await G.ollamaPs({ fetchImpl: sfr, base: LAN }), await G.ollamaGenerate("q", "p", 50, { fetchImpl: sfr, base: LAN }), await G.ollamaGenerate("a b", "p", 50, { fetchImpl: sfr }), await G.ollamaUnload("q", { fetchImpl: sfr, base: LAN }), await G.ollamaUnload("a b", { fetchImpl: sfr })];
    ok("!! ps, generate and unload refuse a non-loopback base OR a bad name WITHOUT a request (read from the request count)", refusals.every((x) => x.ok === false) && sfr.calls.length === 0);
    const psNull = await G.ollamaPs({ fetchImpl: fakeFetch(() => ({ status: 200, json: null })) });
    const psNone = await G.ollamaPs({ fetchImpl: fakeFetch(() => ({ status: 200, json: { models: "x" } })) });
    ok("ps with no JSON or a models that is not a list: ok, an empty list", psNull.ok && psNull.models.length === 0 && psNone.ok && psNone.models.length === 0);
    const psOld = await G.ollamaPs({ fetchImpl: fakeFetch(() => ({ status: 200, json: { models: [{ model: "only:model" }, { name: "n:1", size: 5 }, {}] } })) });
    ok("ps: the name from `model` when there is no `name`, missing sizes read 0, context length null when absent", psOld.models[0].name === "only:model" && psOld.models[0].sizeBytes === 0 && psOld.models[0].sizeVramBytes === 0 && psOld.models[0].contextLength === null && psOld.models[1].sizeBytes === 5 && psOld.models[2].name === "");
    const gz = await G.ollamaGenerate("q", "p", 50, { fetchImpl: fakeFetch(() => ({ status: 200, json: {} })) });
    ok("a generate answer with no fields: every count and duration reads 0, the rates null, the head empty", gz.ok && gz.evalCount === 0 && gz.evalDurationNs === 0 && gz.promptEvalCount === 0 && gz.promptEvalDurationNs === 0 && gz.loadDurationNs === 0 && gz.totalDurationNs === 0 && gz.tokensPerSecond === null && gz.responseHead === "");
    const gd = await G.ollamaGenerate("q", "p", 50, { fetchImpl: fakeFetch(() => ({ status: 200, json: { eval_count: 3, eval_duration: 2e9, prompt_eval_count: 9, prompt_eval_duration: 3e9, load_duration: 7, total_duration: 11 } })) });
    ok("generate: each duration lands in its own field", gd.evalDurationNs === 2e9 && gd.promptEvalDurationNs === 3e9 && gd.loadDurationNs === 7 && gd.totalDurationNs === 11 && gd.promptEvalCount === 9 && gd.tokensPerSecond === 1.5 && gd.promptTokensPerSecond === 3);
}
{
    // every wait the module sets, read at the place it is used (an injected timer records the ms it is asked for)
    const rec = [], timers = (immediate = false) => ({ setTimeoutImpl: (fn, ms) => { rec.push(ms); if (immediate) setImmediate(fn); return { unref() {} }; }, clearTimeoutImpl: () => {} });
    const okF = (json) => fakeFetch(() => ({ status: 200, json }));
    const waits = async (call) => { rec.length = 0; await call(); return rec.slice(); };
    ok("waits: the version check 4 s and the tags 6 s", eq(await waits(() => G.ollamaStatus({ fetchImpl: okF({ version: "1", models: [] }), ...timers() })), [4000, 6000]));
    ok("waits: a load 15 minutes (or what the caller gives), ps 6 s, a generation 20 minutes (or what the caller gives), an unload 60 s", eq(await waits(() => G.ollamaLoad("q", { fetchImpl: okF({}), ...timers() })), [900000]) && eq(await waits(() => G.ollamaLoad("q", { fetchImpl: okF({}), ...timers(), loadTimeoutMs: 20 })), [20]) && eq(await waits(() => G.ollamaPs({ fetchImpl: okF({}), ...timers() })), [6000]) && eq(await waits(() => G.ollamaGenerate("q", "p", 50, { fetchImpl: okF({}), ...timers() })), [1200000]) && eq(await waits(() => G.ollamaGenerate("q", "p", 50, { fetchImpl: okF({}), ...timers(), generateTimeoutMs: 21 })), [21]) && eq(await waits(() => G.ollamaUnload("q", { fetchImpl: okF({}), ...timers() })), [60000]));
    ok("the table of waits is exported and frozen, with those numbers", Object.isFrozen(G.TIMEOUTS) && G.TIMEOUTS.version === 4000 && G.TIMEOUTS.tags === 6000 && G.TIMEOUTS.ps === 6000 && G.TIMEOUTS.load === 900000 && G.TIMEOUTS.generate === 1200000 && G.TIMEOUTS.unload === 60000);
    const hung = (u, i) => new Promise((res, rej) => { i.signal.addEventListener("abort", () => rej(new Error("aborted"))); });
    const ab = await G.ollamaLoad("q", { fetchImpl: hung, ...timers(true), loadTimeoutMs: 20 });
    ok("a request that never answers is aborted when its timer fires, and says 'timed out' (a fired fake timer, no real waiting)", !ab.ok && /timed out/.test(ab.error));
    const hungStatus = await G.ollamaStatus({ fetchImpl: hung, ...timers(true) });
    ok("a version check that times out says nothing answered, with how to start Ollama", !hungStatus.up && /nothing answered at http:\/\/127\.0\.0\.1:11434 \(is Ollama running\? the Windows app starts it; otherwise run `ollama serve`\)/.test(hungStatus.error));
    // the clock: 1250 ms a step
    const clk = () => { let t = 0; return () => (t += 1250); };
    const lo = await G.ollamaLoad("q", { fetchImpl: okF({}), nowMs: clk() }), lf = await G.ollamaLoad("q", { fetchImpl: fakeFetch(() => ({ status: 404, json: { error: "x" } })), nowMs: clk() }), lt = await G.ollamaLoad("q", { fetchImpl: fakeFetch(() => { throw new Error("down"); }), nowMs: clk() });
    ok("the time a call took is the clock's difference: on success, on an error status and on a throw", lo.ms === 1250 && lf.ms === 1250 && lt.ms === 1250);
    // fetch: absent, present only as a global, and what it is sent
    const keepFetch = globalThis.fetch; let nf1, nf2, gl;
    try {
        globalThis.fetch = undefined; nf1 = await G.ollamaPs({}); nf2 = await G.ollamaStatus({});
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ models: [{ name: "viaGlobal:1b" }] }) }); gl = await G.ollamaPs({});
    } finally { globalThis.fetch = keepFetch; }
    ok("with no fetch at all the calls say so (and say Node 18), and the version check does not blame Ollama", nf1.ok === false && /no fetch in this runtime \(the engine needs Node 18 or later\)/.test(nf1.error) && nf2.up === false && /no fetch in this runtime/.test(nf2.error) && !/nothing answered/.test(nf2.error));
    ok("with no injected fetch the global one is used", gl.ok && gl.models[0].name === "viaGlobal:1b");
    const hf = fakeFetch(() => ({ status: 200, json: { version: "1", models: [] } })); await G.ollamaStatus({ fetchImpl: hf }); await G.ollamaLoad("q", { fetchImpl: hf });
    ok("a GET carries no body headers and a POST says it is JSON", hf.calls[0].method === "GET" && eq(hf.calls[0].headers, {}) && hf.calls[2].method === "POST" && hf.calls[2].headers["Content-Type"] === "application/json");
    ok("parseJsonLoose: the span stops at the last bracket (a character right after it is not read)", G._parseJsonLoose('{"a":1}!').value.a === 1 && G._parseJsonLoose('[1]x').value.length === 1);
    const psE = await G.ollamaPs({ fetchImpl: okF({ models: [{ name: "a", expires_at: "2026-11-08T06:00:00Z" }, { name: "b" }] }) });
    ok("ps: the expiry time is kept, and null when absent", psE.models[0].expiresAt === "2026-11-08T06:00:00Z" && psE.models[1].expiresAt === null);
    const g1 = await G.ollamaGenerate("q", "p", 50, { fetchImpl: okF({ eval_count: 1, eval_duration: 1, prompt_eval_count: 1, prompt_eval_duration: 1 }) });
    ok("a duration of one nanosecond still gives a rate (only zero gives null)", g1.tokensPerSecond === 1e9 && g1.promptTokensPerSecond === 1e9);
    const e0 = fakeExec((c) => (/gputaskman/.test(c) ? { stdout: "{}" } : { err: errOf({ code: "ENOENT" }) })); await G.snapshot({ execFileImpl: e0, platform: "linux", home: "/h", gpu: 0 });
    ok("--gpu may be the NUMBER 0 (GPU 0)", eq(e0.calls.find((c) => c.args.includes("--once")).args, ["--once", "--json", "--gpu", "0"]));
    const e3 = fakeExec((c) => (/gputaskman/.test(c) ? { stdout: "{}" } : { err: errOf({ code: "ENOENT" }) })), r3 = await G.snapshot({ execFileImpl: e3, platform: "linux", home: "/h", gpu: "007" });
    const exact = await G.locate({ execFileImpl: fakeExec((c) => (/gputaskman/.test(c) ? { stdout: "g".repeat(1500) } : { err: errOf({ code: "ENOENT" }) })), platform: "linux", home: "/h" });
    ok("a GPU list of exactly 1500 characters is not cut (the cut is for MORE than the limit)", exact.gpus.length === 1500 && !exact.gpus.startsWith("..."));
    const nfl = await (async () => { const keep = globalThis.fetch; globalThis.fetch = undefined; try { return await G.ollamaLoad("q", {}); } finally { globalThis.fetch = keep; } })();
    ok("with no fetch a load fails at once with status 0 and no time taken", nfl.ok === false && nfl.status === 0 && nfl.ms === 0);
    const ts = await G.ollamaStatus({ fetchImpl: fakeFetch((m, url) => (/version/.test(url) ? { status: 200, json: { version: "1" } } : { status: 200, json: { models: [{ name: "nosize:1b" }, { name: "sz:2b", size: 7 }] } })) });
    ok("pulled models with no size read 0 bytes", ts.models[0].sizeBytes === 0 && ts.models[1].sizeBytes === 7);
    ok("a three-digit gpu string is refused even when it reads as a small number", !r3.ok && /whole number/.test(r3.error));
    const one = G.hostInfo({ osImpl: fakeOs({ cpus: () => [{ model: "Only CPU" }] }), nodeVersion: "v1" });
    ok("hostInfo with one CPU names it; with none it reads an empty name and a count of 0", one.cpuModel === "Only CPU" && one.cpuCount === 1 && G.hostInfo({ osImpl: fakeOs({ cpus: () => [] }) }).cpuModel === "" && G.hostInfo({ osImpl: fakeOs({ cpus: () => [] }) }).cpuCount === 0);
}
{
    // the session's notes, flags and corners
    const w = sessionWorld(), { result, saved } = await G.runSession({ model: "q:7b", numPredict: 128 }, w.opts);
    ok("in a good session every step is ok, and the first note says what was found", result.steps.every((x) => x.ok === true) && /^gputaskman found; Ollama up \(0\.9\.2\)$/.test(result.steps[0].note));
    ok("the load step says how long it took, the generate step says the speed and the prompt speed", result.steps.some((x) => x.step === "load" && x.note === "loaded in 1.3 s") && result.steps.some((x) => x.step === "generate" && /^60 tokens at 3 tokens\/s \(prompt 30\/s\)$/.test(x.note)));
    ok("the load time is in the result and the summary (the fake clock steps 1250 ms a call: 1250 ms, 1.3 s)", result.ollama.loadMs === 1250 && result.summary.loadSeconds === 1.3);
    ok("the model is found among the pulled models", result.ollama.modelPulled === true);
    const fileText = Object.values(w.fsx.w.files)[0];
    ok("the saved file is 2-space JSON ending in a newline", /^\{\n  "schema": 1,\n/.test(fileText) && fileText.endsWith("}\n"));
    const lt = sessionWorld({ tagName: "q:latest" }), rl = await G.runSession({ model: "q" }, lt.opts);
    ok("a model asked for without a tag matches the :latest that Ollama lists", rl.result.ollama.modelPulled === true);
    const wm = sessionWorld({ gt: "missing" }), rm = await G.runSession({ model: "q:7b" }, wm.opts);
    ok("with no gputaskman but a working nvidia-smi the snapshot steps are still ok (either one is enough)", rm.result.steps.filter((x) => /^snapshot-/.test(x.step)).every((x) => x.ok === true));
    const wn = sessionWorld({ gt: "missing", smi: false }), rn = await G.runSession({ model: "q:7b" }, wn.opts);
    ok("with neither, the snapshot steps are marked not ok", rn.result.steps.filter((x) => /^snapshot-/.test(x.step)).every((x) => x.ok === false));
    const wd = sessionWorld({ down: true, fs: { write: new Error("EACCES: no") } }), rd = await G.runSession({ model: "q:7b" }, wd.opts);
    ok("Ollama down AND a disk that refuses: the error is about Ollama, the saveError about the disk, and the reason Ollama gave is in the error", !rd.result.ok && /not answering at http:\/\/127\.0\.0\.1:11434: nothing answered at http:\/\/127\.0\.0\.1:11434/.test(rd.result.error) && /EACCES/.test(rd.result.saveError) && !/EACCES/.test(rd.result.error));
    const wl = sessionWorld({ notPulled: true }), rlf = await G.runSession({ model: "q:7b" }, wl.opts);
    ok("a load failure's error carries Ollama's words and the pull hint, in that order, and the load step is marked failed", /^Ollama could not load q:7b: model 'q:7b' not found \(Ollama does not have that model: pull it first with  ollama pull q:7b\)$/.test(rlf.result.error) && rlf.result.steps.some((x) => x.step === "load" && x.ok === false && /not found -- Ollama does not have that model/.test(x.note)) && rlf.result.steps.find((x) => x.step === "load").ok === true);
    const wb = sessionWorld(), rb = await G.runSession({ model: "x y" }, wb.opts), wb2 = sessionWorld(), rb2 = await G.runSession({ model: "q", base: "http://9.9.9.9:1" }, wb2.opts);
    ok("a refused request logs one failed 'check' step", rb.result.steps.length === 1 && rb.result.steps[0].step === "check" && rb.result.steps[0].ok === false && rb2.result.steps.length === 1 && rb2.result.steps[0].ok === false && /loopback/.test(rb2.result.steps[0].note));
    for (const [asked, want] of [[-5, 0], [999999, 60000], [null, 2500], ["abc", 0], [1234, 1234], [60000, 60000], [60001, 60000]]) { const ws = sessionWorld(); await G.runSession({ model: "q:7b", settleMs: asked }, ws.opts); ok(`settleMs ${JSON.stringify(asked)} waits ${want} ms`, eq(ws.sleeps, [want])); }
    // which model the summary reads: the one asked for, from the busy list first and the loaded list otherwise
    const psA = { models: [{ name: "other:1b", size: 1e9, size_vram: 1e9 }, { name: "q:7b", size: 17e9, size_vram: 8e9 }] };
    const wsA = sessionWorld({ ps: { busy: psA } }), rA = await G.runSession({ model: "q:7b" }, wsA.opts);
    ok("the summary reads the busy list when it has the model, and skips another model that comes first", rA.result.summary.inVramGB === 7.45 && rA.result.summary.modelSizeGB === 15.83);
    const wsB = sessionWorld({ ps: { busy: { models: [] } } }), rB = await G.runSession({ model: "q:7b" }, wsB.opts);
    ok("when the busy list no longer holds the model the loaded list is used", rB.result.summary.inVramGB === 6.52);
    const wsC = sessionWorld({ ps: { busy: { models: [{ name: "q:latest", size: 17e9, size_vram: 9e9 }] }, loaded: { models: [] } } }), rC = await G.runSession({ model: "q" }, wsC.opts);
    ok("a model asked for as q matches q:latest in the list", rC.result.summary.inVramGB === 8.38);
    const wsD = sessionWorld({ ps: { busy: { models: [{ name: "zzz:1", size: 1e9, size_vram: 1e9 }] }, loaded: { models: [{ name: "zzz:1", size: 1e9, size_vram: 1e9 }] } } }), rD = await G.runSession({ model: "q:7b" }, wsD.opts);
    ok("!! a model that is not in either list leaves the summary's size and VRAM null and does not borrow another model's", rD.result.summary.modelSizeGB === null && rD.result.summary.inVramGB === null && rD.result.summary.onGpuPct === null);
    const wsE = sessionWorld({ ps: { busy: { models: [{ name: "q:7b", size: 0, size_vram: 0 }] } } }), rE = await G.runSession({ model: "q:7b" }, wsE.opts);
    ok("a model of size 0 gives a null percentage, not NaN", rE.result.summary.onGpuPct === null);
    const wv = sessionWorld(), rv = await G.runSession({ model: "q:7b" }, wv.opts);
    ok("the Ollama version is kept in the result; the step notes name what was done", rv.result.ollama.version === "0.9.2" && rv.result.steps.some((x) => x.step === "load" && x.note === "loading q:7b (a large model can take minutes)") && rv.result.steps.some((x) => x.step === "generate" && x.note === "asking for up to 200 tokens and taking a snapshot while it runs") && rv.result.steps.some((x) => x.step === "snapshot-busy" && x.note === "gputaskman ok; nvidia-smi ok"));
    const wg = sessionWorld({ gt: "missing" }), rg = await G.runSession({ model: "q:7b" }, wg.opts);
    ok("a snapshot step says what failed: gputaskman's reason beside nvidia-smi's verdict", rg.result.steps.some((x) => x.step === "snapshot-busy" && x.note === "gputaskman: gputaskman is not installed; nvidia-smi ok"));
    const wdn = sessionWorld({ down: true }), rdn = await G.runSession({ model: "q:7b" }, wdn.opts);
    ok("Ollama down: the result keeps the reason Ollama's check gave, and no version", rdn.result.ollama.up === false && /nothing answered/.test(rdn.result.ollama.error) && rdn.result.ollama.version === "");
    const wo = sessionWorld({ ps: { busy: { models: [{ name: "q:3b", size: 3e9, size_vram: 3e9 }] }, loaded: { models: [{ name: "q:3b", size: 3e9, size_vram: 3e9 }] } } }), ro = await G.runSession({ model: "q:7b" }, wo.opts);
    ok("!! another tag of the same model (q:3b for q:7b) is NOT taken for it: the summary's sizes stay null", ro.result.summary.modelSizeGB === null && ro.result.summary.inVramGB === null);
    const step = (n) => { let t = 0; return () => (t += n); };
    const wr = sessionWorld(); wr.opts.nowMs = step(1240); const rr = await G.runSession({ model: "q:7b" }, wr.opts);
    ok("another clock step (1240 ms) reads 1.2 s in the step note and the summary (so the rounding is by 100 ms, not by 99 or 101)", rr.result.steps.some((x) => x.step === "load" && x.note === "loaded in 1.2 s") && rr.result.summary.loadSeconds === 1.2 && rr.result.ollama.loadMs === 1240);
    const pct = async (vram) => { const w2 = sessionWorld({ ps: { busy: { models: [{ name: "q:7b", size: 1e10, size_vram: vram }] } } }); return (await G.runSession({ model: "q:7b" }, w2.opts)).result.summary.onGpuPct; };
    ok("the share on the GPU is rounded to one decimal of a percent (41.24 -> 41.2, 41.28 -> 41.3)", (await pct(4.124e9)) === 41.2 && (await pct(4.128e9)) === 41.3);
    const wsm = sessionWorld({ smi: false }), rsm = await G.runSession({ model: "q:7b" }, wsm.opts);
    ok("a missing nvidia-smi beside a working gputaskman: the note names it and the step is still ok", rsm.result.steps.some((x) => x.step === "snapshot-busy" && x.ok === true && x.note === "gputaskman ok; nvidia-smi: nvidia-smi not found"));
    // a throw inside the session is caught, logged, and the file is still written
    const wt = sessionWorld(); wt.opts.sleepImpl = async () => { throw new Error("sleep exploded"); };
    const rt = await G.runSession({ model: "q:7b" }, wt.opts); wt.release();
    ok("an unexpected throw inside the session: the promise resolves, the error says so, the 'error' step is logged failed, the file is still written", !rt.result.ok && /^the session failed: sleep exploded$/.test(rt.result.error) && rt.result.steps.some((x) => x.step === "error" && x.ok === false && /sleep exploded/.test(x.note)) && rt.saved.ok);
    const wh = sessionWorld(); wh.opts.onStep = () => { throw new Error("hook exploded"); };
    const rh = await G.runSession({ model: "q:7b" }, wh.opts);
    ok("a progress hook that throws never stops the run", rh.result.ok && rh.result.steps.length >= 6);
}

// ---- 8. the jobs ---------------------------------------------------------------------------------------------------------------------------------------
console.log("\n8. THE JOBS: A PAGE STARTS A SESSION AND POLLS IT");
{
    G._reset();
    const w = sessionWorld(), a = G.startSession({ model: "q:7b" }, w.opts);
    ok("a start returns ok and an id", a.ok === true && /^gt1-/.test(a.id));
    const b = G.startSession({ model: "q:7b" }, w.opts);
    ok("!! a second start while one runs is refused and names the running one", b.ok === false && /already running/.test(b.error) && b.id === a.id);
    const s0 = G.jobStatus(a.id);
    ok("while it runs: state running, the steps so far, no result yet, no file yet", s0.ok && s0.state === "running" && s0.result === null && s0.savedAs === null);
    for (let i = 0; i < 200 && G.jobStatus(a.id).state === "running"; i++) await tick();
    const s1 = G.jobStatus(a.id);
    ok("when it ends: state done, the steps, the result, the relative path of the file", s1.state === "done" && s1.steps.length >= 6 && s1.result.ok && /^brain\/rig-results\/gpu-snapshots\/gpusnap-/.test(s1.savedAs) && s1.error === "");
    ok("the steps were readable DURING the run (the first status already held 'detect' or more is allowed, but never the result)", s0.steps.length <= s1.steps.length);
    const c = G.startSession({ model: "q:7b" }, sessionWorld().opts);
    ok("after one ends the next may start, with the next id", c.ok && /^gt2-/.test(c.id));
    for (let i = 0; i < 200 && G.jobStatus(c.id).state === "running"; i++) await tick();
    ok("!! unknown ids, and ids that are object keys, are 'no such session'", [G.jobStatus("nope"), G.jobStatus("__proto__"), G.jobStatus("constructor"), G.jobStatus("toString"), G.jobStatus(undefined), G.jobStatus(null), G.jobStatus(5), G.jobStatus({})].every((x) => x.ok === false && /no such session/.test(x.error)));
    ok("!! a bad model or a non-loopback base is refused at the start", G.startSession({ model: "a b" }, sessionWorld().opts).ok === false && G.startSession({ model: "q:7b", base: "http://8.8.8.8:11434" }, sessionWorld().opts).ok === false);
    const bad = G.startSession({ model: "q:7b" }, sessionWorld({ notPulled: true }).opts);
    for (let i = 0; i < 200 && G.jobStatus(bad.id).state === "running"; i++) await tick();
    const sb = G.jobStatus(bad.id);
    ok("a failed session ends in state error with the reason, and still holds its result and file", sb.state === "error" && /ollama pull/.test(sb.error) && sb.result && sb.result.ok === false && sb.savedAs);
    G._reset(); const idsK = [];
    for (let k = 0; k < 8; k++) { const j = G.startSession({ model: "q:7b" }, sessionWorld().opts); idsK.push(j.id); for (let i = 0; i < 200 && G.jobStatus(j.id).state === "running"; i++) await tick(); }
    ok("!! exactly the last five sessions are kept: the three oldest are gone, the five newest are readable", idsK.slice(0, 3).every((x) => G.jobStatus(x).ok === false) && idsK.slice(3).every((x) => G.jobStatus(x).ok === true) && idsK.length === 8);
    G._reset();
    let calls = 0; const oc = sessionWorld().opts; oc.now = () => { if (++calls === 3) throw new Error("clock exploded"); return new Date(Date.UTC(2026, 10, 8, 5, 0, calls)); };
    const cj = G.startSession({ model: "q:7b" }, oc);
    for (let i = 0; i < 200 && G.jobStatus(cj.id).state === "running"; i++) await tick();
    const cs = G.jobStatus(cj.id);
    ok("a session that rejects (the clock throws inside it) ends the job in state error with the message, never hanging in 'running'", cs.state === "error" && /clock exploded/.test(cs.error) && cs.result === null);
    G._reset();
    const wf = sessionWorld({ fs: { write: new Error("EACCES") } }), fj = G.startSession({ model: "q:7b" }, wf.opts);
    for (let i = 0; i < 200 && G.jobStatus(fj.id).state === "running"; i++) await tick();
    const fs1 = G.jobStatus(fj.id);
    ok("a session whose file could not be written is done, with no savedAs and no savedAbsolute, and the result carries the saveError", fs1.state === "done" && fs1.savedAs === null && fs1.savedAbsolute === null && /EACCES/.test(fs1.result.saveError));
    G._reset();
}

// ---- 9. the source and the routes -----------------------------------------------------------------------------------------------------------------
console.log("\n9. THE SOURCE AND THE ROUTES IN THE BRIDGE");
{
    ok("!! the module never turns a shell on and never uses exec, execSync or spawn", /shell: false/.test(SRC) && !/shell:\s*true/.test(SRC) && !/execSync|spawnSync|\bspawn\s*\(|\bexec\s*\(|\.exec\(/.test(SRC.replace(/execFileImpl|execFile|execOf/g, "")));
    ok("the module speaks only to the loopback (the one place a URL is built is behind loopbackBase)", (SRC.match(/loopbackBase\(/g) || []).length >= 8 && !/https?:\/\/[^"'`\s]*\$\{/.test(SRC));
    ok("the module writes no absolute path or host name into the result (hostInfo reads no hostname, userInfo or homedir for it)", !/os\.hostname|userInfo\(|hostname\(\)/.test(SRC.slice(SRC.indexOf("function hostInfo"), SRC.indexOf("// ---- detect and install"))));
    const req = /const gpuTaskManBridge = require\("\.\/gpuTaskManBridge\.js"\)/.test(SERVER);
    ok("server.js requires the module", req);
    const line = (re) => SERVER.split("\n").find((l) => re.test(l)) || "";
    const L = { status: line(/"\/gputaskman\/status"/), install: line(/"\/gputaskman\/install"/), snapshot: line(/"\/gputaskman\/snapshot"/), session: line(/"\/gputaskman\/session"/), job: line(/"\/gputaskman\/job"/) };
    ok("GET /gputaskman/status -> detect()", /GET/.test(L.status) && /gpuTaskManBridge\.detect\(/.test(L.status));
    ok("POST /gputaskman/install -> install(method) and only the method is passed on", /POST/.test(L.install) && /gpuTaskManBridge\.install\(\(d \|\| \{\}\)\.method\)/.test(L.install));
    ok("POST /gputaskman/snapshot -> snapshot({ gpu }) and nothing else from the body", /POST/.test(L.snapshot) && /gpuTaskManBridge\.snapshot\(\{ gpu: \(d \|\| \{\}\)\.gpu \}\)/.test(L.snapshot));
    ok("POST /gputaskman/session -> startSession with the model, base, numPredict, settleMs and unloadWhenDone only", /POST/.test(L.session) && /gpuTaskManBridge\.startSession\(/.test(L.session) && /model: /.test(L.session) && /unloadWhenDone/.test(L.session) && !/\.\.\.d\b/.test(L.session));
    ok("GET /gputaskman/job -> jobStatus(id)", /GET/.test(L.job) && /gpuTaskManBridge\.jobStatus\(/.test(L.job));
}

clearTimeout(WATCHDOG);
console.log(fails ? `\ngpuTaskManBridge-selfcheck: ${fails} FAILED` : "\ngpuTaskManBridge-selfcheck: all checks pass");
if (fails) process.exit(1);
