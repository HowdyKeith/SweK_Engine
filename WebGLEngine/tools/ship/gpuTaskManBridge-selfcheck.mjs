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
//   THE WATCH (2026-11-08: "sample for N seconds", and the GPU brain run under the samples; sections 11 to 14, 457 rows in all; module 21fc08c26aa730a1...).
//     THE FIRST DRAFT of the digest searched each gputaskman snapshot's TEXT for words (Direct3D, Vulkan, CUDA, chrome...). THE REAL gputaskman 0.3.3, found installed in
//     the sandbox, printed a snapshot with a KEY called "cuda" in it, which that search would have counted as a runtime in every sample: the search was replaced, before
//     any row was written, by a defensive reading of the fields (read from the program's source), and the real output is a fixture in section 11.
//     sweep 5 (before the watch rows were closed): 976 mutants, 800 RED, 57 CRASH, 119 SURVIVORS. Read line by line; rows were added for the median (sorted, odd and even,
//     rounded), the busiest-GPU choice (ties, N/A, a garbled index, the fallback), every program aggregation (busiest process of a name, the during-only share, engine
//     peaks, the memory peak, onlyDuring, the runtimes map, the order and the cut at ten), the digest's corners, the size budget at its edge, the clock starting away from
//     zero, the sample cap, and the steps' verdicts. THE READ ALSO FOUND REAL FAULTS, fixed in the module: a phase that ended by its sample cap still waited one more
//     interval (the swarm started an interval late and the watch ended an interval late); the swarm's duration was timed to the END OF THE SAMPLING, not to the swarm's own
//     end (now stamped when its child resolves); the runtimes map came out in the order seen (now sorted); and dead code went: a loop guard the in-loop break made redundant,
//     a `|| 0` the default parameter already gave, and a comparator that returned 1 for 'greater' and for 'equal' alike.
//     sweep 6: 979 mutants, 865 RED, 57 CRASH, 57 survivors; sweep 7: 973 mutants, 868 RED, 57 CRASH, 48 survivors; then a targeted re-run of the 66 mutants of the sort and
//     aggregation lines after rows that put two programs in BOTH insertion orders (an `a`-side `|| 1` in a comparator only shows when the null one is the pivot) and a
//     300-program list: 55 caught. FINAL: 973 mutants, 926 caught, 47 survivors, ARGUED EQUIVALENT OR UNOBSERVABLE: the 29 above that are old (L77, L114, L130, L162, L170,
//     L185, L224, L234, L282, L287, L295, L298, L327, L329, L332, L494, L501, L510 and the `e && e.message || e` texts) and, new: L320 `sampleSecs > 0` as `> 1` (1 is below the
//     minimum of 3) and the budget's starting 0 as 1 (one byte of 3 MiB); L345 the digit count of a form string ({1,6} as {1,7}, {0,6}, {1,5}: a longer string is out of range
//     either way and an empty one is handled before); L380 a missing memory figure as 1 in a tie-break (differs only for a process with exactly ONE byte); L387 `g.raw || ""`
//     (the raw text is cut to 4,003 characters by snapshot(), so 120 of them never reach the budget); L424, L429 and L430 `>` as `>=` where the two values are equal;
//     L436 `<` as `<=`, `>` as `>=` and the returns of the name comparator (names are unique, and a sort that is told 'not before' for both greater and equal orders a
//     list of 300 the same); L459 and L490, L504 the initial `ok: false` (finish() overwrites it) and the error texts of a thrown non-Error.
//   Also run, not a row of this gate: the end-to-end smoke again with the watch (the real module, the real route lines out of server.js, real child processes: THE REAL
//     gputaskman 0.3.3 with no GPU, stand-in scripts printing busy snapshots in its real shape, and THE REAL swarm tool as the child). Refused modes, sizes and seconds;
//     a second start refused; a brain watch polled to its end: the swarm printed `*** SOFTWARE ADAPTER *** google swiftshader`, the watch read it, ended not ok saying the
//     card was not used, and still wrote its file; the stand-ins gave `runtimes: {Direct3D: [chrome.exe]}` with `onlyDuring: true`; a sample watch through the route line.
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
            gtCount++; events.push("gt-snapshot#" + gtCount); if (gtCount === (over.releaseAtGt || 3) && events.includes("generate-start")) releaseGen();
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
    return { events, exec, fetch, fsx, sleeps, release: () => releaseGen(), opts: { nowMs: over.virtual ? () => over.virtual.t : (() => { let t = 0; return () => (t += 1250); })(), execFileImpl: exec, fetchImpl: fetch, fsImpl: fsx, osImpl: fakeOs(), sleepImpl: async (ms) => { sleeps.push(ms); events.push("sleep"); if (over.virtual) over.virtual.t += ms; if (over.gt === "missing") releaseGen(); await tick(); }, now: clock(), platform: "win32", home: "C:\\Users\\k", root: "/eng", nodeVersion: "v22.0.0" } };
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


// ---- 11. watching: many snapshots over time, and the GPU brain under them ---------------------------------------------------------------------------
console.log("\n11. WATCHING (added 2026-11-08): sample for N seconds, and run the GPU brain under the samples");
/** The shape gputaskman 0.3.3 prints (read from its source): a busy card with a browser's GPU process under Direct3D, and an idle one. */
const busySnap = (busy) => ({ taken: 1, gpu: "NVIDIA GeForce GTX 1080", vram_total: 8589934592, vram_used: busy ? 1887436800 : 943718400, device: { index: 0, util_gpu: busy ? 71 : 4, sm_clock: busy ? 1700 : 300, power_w: busy ? 88.5 : 21, temp: busy ? 58 : 41 },
    processes: busy ? [{ pid: 99, name: "dwm.exe", runtimes: [], gpu_pct: 1.5, engines: { "3D": 1.5 }, vram_bytes: 104857600 }, { pid: 4242, name: "chrome.exe", runtimes: ["Direct3D"], gpu_pct: 62.5, engines: { "3D": 50, Compute_0: 12.5 }, vram_bytes: 314572800 }, { pid: 4243, name: "chrome.exe", runtimes: [], gpu_pct: 0, engines: {}, vram_bytes: 5242880 }, { pid: 7, name: "idle.exe", runtimes: [], gpu_pct: 0, vram_bytes: 0 }] : [{ pid: 99, name: "dwm.exe", runtimes: [], gpu_pct: 1, engines: { "3D": 1 }, vram_bytes: 104857600 }] });
/** A scripted machine for the watch: virtual time (a snapshot costs `cost` ms, a sleep advances it), gputaskman and nvidia-smi answering by call number, and a stand-in for the swarm that ends when `releaseAt` snapshots have been taken. */
function watchWorld(over = {}) {
    let gtN = 0, releaseChild; const T = { t: over.startT || 0 }, events = [], sleeps = [], childGate = new Promise((r) => { releaseChild = r; });
    const isBusy = (n) => n >= 3 && n <= 5, snapOf = over.snap || ((n) => busySnap(isBusy(n)));
    const exec = fakeExec(async (cmd, args) => {
        if (/gputaskman/.test(cmd)) {
            if (over.gt === "missing") return { err: errOf({ code: "ENOENT" }) };
            if (args.includes("--list-gpus")) return { stdout: "0: GTX 1080\n" };
            gtN++; events.push("gt#" + gtN); T.t += over.cost === undefined ? 100 : over.cost; if (over.releaseAt && gtN === over.releaseAt) releaseChild();
            return { stdout: JSON.stringify(snapOf(gtN)) };
        }
        if (cmd === "nvidia-smi") { if (over.smi === false) return { err: errOf({ code: "ENOENT" }) }; events.push("smi"); return { stdout: over.smiText ? over.smiText(gtN) : `0, NVIDIA GeForce GTX 1080, 552.44, 8192, ${isBusy(gtN) ? 1800 : 900}, ${isBusy(gtN) ? 73 : 3}, ${isBusy(gtN) ? 58 : 41}\n` }; }
        if (cmd === "fakenode") {
            events.push("swarm-start"); if (over.releaseAfterMs) setTimeout(() => releaseChild(), over.releaseAfterMs); if (!over.noGate) await childGate; events.push("swarm-end"); if (over.childMs) T.t += over.childMs;
            if (over.childErr) return { err: over.childErr, stdout: over.childOut || "", stderr: over.childStderr || "" };
            return { stdout: over.childOut === undefined ? "hardware adapter: nvidia pascal NVIDIA GeForce GTX 1080\n\nswarm flown by flyFleet\n   N | ticks\n" : over.childOut, stderr: "" };
        }
        return { err: errOf({ code: "ENOENT" }) };
    });
    const fsx = fakeFs(over.fs || {});
    return { events, exec, fsx, sleeps, T, release: () => releaseChild(), opts: { nowMs: () => T.t, execFileImpl: exec, fsImpl: fsx, osImpl: fakeOs(), sleepImpl: async (ms) => { T.t += ms; sleeps.push(ms); await tick(); }, now: clock(), platform: "win32", home: "C:\\Users\\k", root: "/eng", nodeVersion: "v22.0.0", nodeBin: "fakenode" } };
}
{
    // the limits and the parameter checks
    const I = (v) => G._intIn(v, { min: 3, max: 300, def: 20 });
    ok("intIn: nothing means the default; the two edges are accepted; a digit string is a number (and is trimmed)", I(undefined) === 20 && I(null) === 20 && I("") === 20 && I(3) === 3 && I(300) === 300 && I("20") === 20 && I(" 5 ") === 5);
    ok("!! intIn: outside the range, fractions, exponents, signs, words, booleans, lists and objects are NaN", [2, 301, -5, 2.5, "2.5", "1e2", "+5", "-5", "abc", true, false, [5], {}, NaN, Infinity, "1234567", "0x10"].every((x) => Number.isNaN(I(x))));
    ok("the session's option: nothing and 0 are off; 3 to 300 are seconds; the rest are NaN", [undefined, null, "", 0, "0"].every((x) => G._sampleSecondsOf(x) === 0) && G._sampleSecondsOf(3) === 3 && G._sampleSecondsOf("20") === 20 && G._sampleSecondsOf(300) === 300 && [2, 301, "x", -1, 1.5, true].every((x) => Number.isNaN(G._sampleSecondsOf(x))));
    ok("the limits are exported and frozen", Object.isFrozen(G.WATCH) && Object.isFrozen(G.WATCH.seconds) && Object.isFrozen(G.WATCH.intervalMs) && G.WATCH.seconds.min === 3 && G.WATCH.seconds.max === 300 && G.WATCH.seconds.def === 20 && G.WATCH.intervalMs.min === 500 && G.WATCH.intervalMs.max === 10000 && G.WATCH.intervalMs.def === 1000 && G.WATCH.maxSamples === 120 && G.WATCH.edgeSamples === 2 && G.WATCH.budgetBytes === 3145728 && Object.isFrozen(G.BRAIN) && Object.isFrozen(G.BRAIN.sizes) && Object.isFrozen(G.BRAIN.script) && eq(G.BRAIN.script, ["tools", "ship", "gpuSwarm.mjs"]) && eq(G.BRAIN.sizes, [64, 256, 1024, 2048, 4096, 8192]) && eq(G.BRAIN.defaultSizes, [4096, 8192]) && G.BRAIN.rounds.min === 1 && G.BRAIN.rounds.max === 5 && G.BRAIN.rounds.def === 2 && G.BRAIN.seconds.min === 1 && G.BRAIN.seconds.max === 20 && G.BRAIN.seconds.def === 10 && G.TIMEOUTS.brain === 1800000);
    const P = (p) => G._watchParams(p);
    for (const m of [undefined, null, "", "Sample", "BRAIN", "sample ", "__proto__", "constructor", "brain; rm -rf /", 5, {}, ["sample"]]) ok(`!! a watch with mode ${JSON.stringify(m)} is refused`, P({ mode: m }).ok === false && /mode must be/.test(P({ mode: m }).error));
    ok("sample: seconds and the interval default to 20 s and 1000 ms, the GPU to none, no swarm", eq(P({ mode: "sample" }), { ok: true, mode: "sample", seconds: 20, intervalMs: 1000, gpu: null, brain: null }));
    ok("sample: given values are read (strings from a form too)", eq(P({ mode: "sample", seconds: "45", intervalMs: "2000", gpu: "1" }), { ok: true, mode: "sample", seconds: 45, intervalMs: 2000, gpu: 1, brain: null }));
    for (const [k, v, re] of [["seconds", 2, /seconds must be a whole number from 3 to 300/], ["seconds", 301, /from 3 to 300/], ["seconds", "x", /from 3 to 300/], ["intervalMs", 499, /interval must be a whole number of milliseconds from 500 to 10000/], ["intervalMs", 10001, /500 to 10000/], ["gpu", 64, /GPU number must be a whole number from 0 to 63/], ["gpu", "1; ls", /GPU number/], ["gpu", [1], /GPU number/]]) { const r = P({ mode: "sample", [k]: v }); ok(`!! sample with ${k} ${JSON.stringify(v)} is refused with the range in the message`, r.ok === false && re.test(r.error), r.error); }
    ok("sample: the edges 3, 300, 500 and 10000 are accepted", P({ mode: "sample", seconds: 3, intervalMs: 500 }).ok && P({ mode: "sample", seconds: 300, intervalMs: 10000 }).ok);
    ok("brain: the defaults are sizes 4096 and 8192, 2 rounds, 10 simulated seconds, and no wall-clock seconds are asked of the caller", eq(P({ mode: "brain" }), { ok: true, mode: "brain", seconds: null, intervalMs: 1000, gpu: null, brain: { sizes: [4096, 8192], rounds: 2, swarmSeconds: 10 } }));
    ok("brain: sizes are sorted, and rounds and seconds are read", eq(P({ mode: "brain", sizes: [8192, 1024], rounds: "3", swarmSeconds: 20 }).brain, { sizes: [1024, 8192], rounds: 3, swarmSeconds: 20 }));
    ok("brain: the edges are accepted (rounds 1 and 5, seconds 1 and 20, every size)", P({ mode: "brain", rounds: 1, swarmSeconds: 1 }).ok && P({ mode: "brain", rounds: 5, swarmSeconds: 20, sizes: [64, 256, 1024, 2048, 4096, 8192] }).ok);
    for (const [label, body, re] of [["a size that is not on the list", { sizes: [4096, 5000] }, /distinct numbers from: 64, 256, 1024, 2048, 4096, 8192/], ["a size as a string", { sizes: ["4096"] }, /distinct numbers/], ["an empty list", { sizes: [] }, /distinct numbers/], ["a repeated size", { sizes: [4096, 4096] }, /distinct numbers/], ["sizes that are not a list", { sizes: "4096" }, /distinct numbers/], ["a number alone", { sizes: 4096 }, /distinct numbers/], ["a size with a flag in it", { sizes: ["4096 --write"] }, /distinct numbers/], ["rounds 0", { rounds: 0 }, /rounds must be a whole number from 1 to 5/], ["rounds 6", { rounds: 6 }, /from 1 to 5/], ["seconds 0", { swarmSeconds: 0 }, /swarm's seconds must be a whole number from 1 to 20/], ["seconds 21", { swarmSeconds: 21 }, /from 1 to 20/]]) { const r = P({ mode: "brain", ...body }); ok(`!! brain with ${label} is refused`, r.ok === false && re.test(r.error), r.error); }
    ok("brain: the swarm's seconds are not asked of a sample-mode request, and a brain request needs no seconds of its own", P({ mode: "sample", swarmSeconds: 999, rounds: 99, sizes: ["x"] }).ok === true && P({ mode: "brain", seconds: 1 }).ok === true);
}
{
    // sample mode
    const w = watchWorld(), { result, saved } = await G.runWatch({ mode: "sample", seconds: 20, intervalMs: 1000 }, w.opts);
    ok("sample: the watch succeeds, says what it is, and records the request", result.ok === true && result.error === "" && result.kind === "gputaskman-watch" && result.mode === "sample" && result.schema === 1 && eq(result.request, { seconds: 20, intervalMs: 1000, gpu: null, brain: null }) && result.brain === null);
    ok("!! sample: exactly one snapshot a second for 20 s, from t = 0 (a snapshot costs 100 ms, so the wait before the next is 900 ms, which is the interval less the cost)", result.samples.length === 20 && eq(result.samples.map((x) => x.tMs), Array.from({ length: 20 }, (_, i) => i * 1000)) && result.samples.every((x) => x.tookMs === 100 && x.phase === "sample") && w.sleeps.every((x) => x === 900) && w.sleeps.length === 20);
    ok("sample: each sample holds the gputaskman snapshot and the nvidia-smi answer, and the digest", result.samples.every((x) => x.gputaskman.ok && x.nvidiaSmi.ok && x.read && Array.isArray(x.read.processes)) && result.samples[2].gputaskman.json.device.util_gpu === 71 && result.samples[2].nvidiaSmi.gpus[0].utilizationPct === 73);
    ok("sample: a sample carries no private fields (the size counter is removed once the budget has been applied)", result.samples.every((x) => !("bytes" in x)) && result.samples.every((x) => eq(Object.keys(x).sort(), ["gputaskman", "nvidiaSmi", "phase", "read", "tMs", "tookMs"])));
    ok("sample: the steps read detect, sample, sample, and gputaskman was found", ["detect", "sample"].every((k) => result.steps.some((x) => x.step === k)) && /^gputaskman found$/.test(result.steps[0].note) && result.steps.some((x) => x.step === "sample" && x.note === "taking a snapshot every 1000 ms for 20 s") && result.steps.some((x) => x.step === "sample" && x.note === "20 snapshots" && x.ok === true));
    ok("sample: the file is gpuwatch-<time>-sample.json inside brain/rig-results/gpu-snapshots/, as 2-space JSON", saved.ok && /^brain\/rig-results\/gpu-snapshots\/gpuwatch-20261108-\d{6}-sample\.json$/.test(saved.relative) && path.dirname(saved.absolute) === path.join("/eng", "brain", "rig-results", "gpu-snapshots") && Object.keys(w.fsx.w.files).length === 1 && /^\{\n  "schema": 1,/.test(Object.values(w.fsx.w.files)[0]) && JSON.parse(Object.values(w.fsx.w.files)[0]).kind === "gputaskman-watch");
    const sm = result.summary;
    ok("sample: the summary counts the samples and both tools' answers, names the card and the busiest GPU, and the median gap", eq(sm.samples, { total: 20, before: 0, during: 20, after: 0 }) && sm.gputaskmanOk === 20 && sm.nvidiaSmiOk === 20 && sm.gpuIndex === 0 && sm.gpuName === "NVIDIA GeForce GTX 1080" && sm.intervalMsMedian === 1000 && sm.omittedSnapshots === 0);
    ok("sample: utilization and memory from nvidia-smi (the busy snapshots are the 3rd to 5th: median of all 20 is 3, the peak 73; memory peak 1800 MiB)", sm.utilizationPct.during === 3 && sm.utilizationPct.duringPeak === 73 && sm.utilizationPct.before === null && sm.utilizationPct.after === null && sm.memoryUsedMiB.duringPeak === 1800 && sm.memoryUsedMiB.rise === null && sm.temperatureCPeak === 58);
    ok("!! sample: gputaskman's own device readings (utilization, SM clock, power) are read from device.util_gpu, sm_clock and power_w", sm.gputaskmanDevice.utilGpuPct.duringPeak === 71 && sm.gputaskmanDevice.smClockMHz.duringPeak === 1700 && sm.gputaskmanDevice.powerW.duringPeak === 88.5 && sm.gputaskmanDevice.utilGpuPct.before === null);
    ok("!! sample: the programs that used the card, by name, with their runtimes: chrome.exe under Direct3D at 62.5 percent (engines 3D 50, Compute_0 12.5, 300 MiB), seen in 3 samples; dwm.exe first seen in all 20; the idle one is not listed", sm.programs.length === 2 && sm.programs[0].name === "chrome.exe" && eq(sm.programs[0].runtimes, ["Direct3D"]) && sm.programs[0].gpuPctDuringPeak === 62.5 && sm.programs[0].gpuPctDuringMedian === 62.5 && sm.programs[0].vramPeakMiB === 300 && eq(sm.programs[0].enginesPeak, { "3D": 50, Compute_0: 12.5 }) && eq(sm.programs[0].seen, { before: 0, during: 3, after: 0 }) && sm.programs[0].pids === 2 && sm.programs[1].name === "dwm.exe" && sm.programs[1].seen.during === 20 && sm.programs[1].gpuPctDuringPeak === 1.5);
    ok("sample: the runtimes map says which programs ran under which runtime during the watch, and onlyDuring needs a 'before' to compare with (a plain sample has none, so it is false)", eq(sm.runtimes, { Direct3D: ["chrome.exe"] }) && sm.programs.every((x) => x.onlyDuring === false));
}
{
    // sample mode: the cap, a slow snapshot, a request that is refused, tools that are missing
    const w = watchWorld({ cost: 0 }), { result } = await G.runWatch({ mode: "sample", seconds: 300, intervalMs: 500 }, w.opts);
    ok("!! sample: never more than 120 samples, however long it was asked to watch (300 s at 500 ms would be 600)", result.samples.length === 120 && result.ok);
    const w2 = watchWorld({ cost: 1500 }), r2 = await G.runWatch({ mode: "sample", seconds: 5, intervalMs: 1000 }, w2.opts);
    ok("sample: a snapshot slower than the interval is followed by NO wait (0, never negative), and the watch ends when the time is up: samples at 0, 1500, 3000, 4500", r2.result.samples.length === 4 && eq(r2.result.samples.map((x) => x.tMs), [0, 1500, 3000, 4500]) && w2.sleeps.every((x) => x === 0));
    const w3 = watchWorld({ cost: 400 }); await G.runWatch({ mode: "sample", seconds: 3, intervalMs: 1000 }, w3.opts);
    ok("sample: the wait is the interval less what the snapshot took (1000 - 400 = 600)", w3.sleeps[0] === 600);
    const w4 = watchWorld({ cost: 0 }), r4 = await G.runWatch({ mode: "sample", seconds: 3, intervalMs: 1000 }, w4.opts);
    ok("sample: 3 s at 1 s is samples at 0, 1000 and 2000 (the watch stops AT the end time, it does not take one more)", eq(r4.result.samples.map((x) => x.tMs), [0, 1000, 2000]));
    for (const bad of [{ mode: "x" }, { mode: "sample", seconds: 2 }, { mode: "sample", intervalMs: 100 }, { mode: "sample", gpu: 99 }]) {
        const wb = watchWorld(), rb = await G.runWatch(bad, wb.opts);
        ok(`!! a refused watch (${JSON.stringify(bad)}) runs no command, saves no file and says why`, rb.result.ok === false && rb.saved.ok === false && wb.exec.calls.length === 0 && Object.keys(wb.fsx.w.files).length === 0 && rb.result.steps.length === 1 && rb.result.steps[0].step === "check" && rb.result.steps[0].ok === false && rb.result.error === rb.result.steps[0].note && rb.result.request === null);
    }
    const wn = watchWorld({ gt: "missing", smi: false }), rn = await G.runWatch({ mode: "sample", seconds: 3 }, wn.opts);
    ok("sample: with no gputaskman and no nvidia-smi the watch is not ok, says there is nothing to read, and the file is still saved", !rn.result.ok && /neither gputaskman nor nvidia-smi answered/.test(rn.result.error) && rn.saved.ok && rn.result.gputaskman.installed === false && rn.result.samples.length > 0 && rn.result.samples.every((x) => !x.gputaskman.ok && !x.nvidiaSmi.ok));
    const wo = watchWorld({ gt: "missing" }), ro = await G.runWatch({ mode: "sample", seconds: 4 }, wo.opts);
    ok("sample: nvidia-smi alone is enough (ok), the gputaskman samples are marked not ok, and the digest is null", ro.result.ok && ro.result.samples.every((x) => !x.gputaskman.ok && x.read === null && x.nvidiaSmi.ok) && ro.result.summary.gputaskmanOk === 0 && ro.result.summary.nvidiaSmiOk === ro.result.samples.length && eq(ro.result.summary.programs, []));
    const wg = watchWorld({ smi: false }), rg = await G.runWatch({ mode: "sample", seconds: 4 }, wg.opts);
    ok("sample: gputaskman alone is enough (ok); the summary takes no utilization from nvidia-smi but reads the programs", rg.result.ok && rg.result.summary.utilizationPct.during === null && rg.result.summary.gpuIndex === null && rg.result.summary.gpuName === null && rg.result.summary.programs.length >= 1);
    const wd = watchWorld({ fs: { write: new Error("EACCES: no") } }), rd = await G.runWatch({ mode: "sample", seconds: 3 }, wd.opts);
    ok("sample: a disk that refuses the file leaves the watch ok, with the reason in saveError", rd.result.ok === true && rd.saved.ok === false && /EACCES/.test(rd.result.saveError) && rd.result.error === "");
    const wt = watchWorld(); wt.opts.sleepImpl = async () => { throw new Error("sleep exploded"); };
    const rt = await G.runWatch({ mode: "sample", seconds: 5 }, wt.opts).then((x) => ({ resolved: true, ...x }), () => ({ resolved: false }));
    ok("an unexpected throw inside a watch is caught: the promise resolves, the error says so, the file is still written", rt.resolved && !rt.result.ok && /^the watch failed: sleep exploded$/.test(rt.result.error) && rt.result.steps.some((x) => x.step === "error" && x.ok === false) && rt.saved.ok);
    const wh = watchWorld(); wh.opts.onStep = () => { throw new Error("hook exploded"); };
    ok("a progress hook that throws never stops a watch", (await G.runWatch({ mode: "sample", seconds: 3 }, wh.opts)).result.ok);
    const wq = watchWorld(), rq = await G.runWatch({ mode: "sample", seconds: 3, gpu: 1 }, wq.opts);
    ok("sample: a GPU number is passed to gputaskman as --gpu 1, and the summary reads that nvidia-smi row", wq.exec.calls.filter((c) => c.args.includes("--once")).every((c) => eq(c.args, ["--once", "--json", "--gpu", "1"])) && rq.result.request.gpu === 1);
    const two = (n) => `0, NVIDIA GeForce GTX 1080, 552.44, 8192, 900, 5, 40\n1, Second GPU, 552.44, 4096, 2000, 90, 70\n`;
    const w5 = watchWorld({ smiText: two }), r5 = await G.runWatch({ mode: "sample", seconds: 3 }, w5.opts), w6 = watchWorld({ smiText: two }), r6 = await G.runWatch({ mode: "sample", seconds: 3, gpu: 0 }, w6.opts);
    ok("!! with two GPUs and none asked for, the summary follows the one that was busiest; asked for GPU 0 it reads GPU 0", r5.result.summary.gpuIndex === 1 && r5.result.summary.gpuName === "Second GPU" && r5.result.summary.utilizationPct.duringPeak === 90 && r6.result.summary.gpuIndex === 0 && r6.result.summary.utilizationPct.duringPeak === 5);
}
{
    // the size budget
    const big = (n) => ({ pad: "x".repeat(n - 12), processes: [] });
    const w = watchWorld({ snap: () => big(1000000), cost: 0 }), { result } = await G.runWatch({ mode: "sample", seconds: 8, intervalMs: 1000 }, w.opts);
    const kept = result.samples.filter((x) => x.gputaskman.json), omitted = result.samples.filter((x) => x.gputaskman.omitted);
    ok("!! the size budget: the first three snapshots (about 1,000,000 characters each) are kept in full and the rest, which would pass 3 MiB, are marked omitted", result.samples.length === 8 && kept.length === 3 && omitted.length === 5 && kept.every((x, i) => result.samples.indexOf(x) === i), `${kept.length} kept, ${omitted.length} omitted`);
    ok("the omitted snapshots keep their verdict, time, command and size, and drop the body", omitted.every((x) => x.gputaskman.ok === true && x.gputaskman.omitted === true && x.gputaskman.bytes >= 999980 && x.gputaskman.bytes <= 1000020 && !("json" in x.gputaskman) && /^2026-/.test(x.gputaskman.at) && x.gputaskman.command === "gputaskman --once --json") && result.summary.omittedSnapshots === 5);
    const w2 = watchWorld({ snap: () => big(1000000), cost: 0 }), r2 = await G.runWatch({ mode: "sample", seconds: 8 }, w2.opts);
    ok("the file is still valid JSON of the whole result, and the digest of an omitted sample is kept", JSON.parse(Object.values(w2.fsx.w.files)[0]).samples.length === 8 && omitted.every((x) => x.read && Array.isArray(x.read.processes)));
    const w3 = watchWorld({ snap: () => ({ processes: [] }), cost: 0 }), r3 = await G.runWatch({ mode: "sample", seconds: 120, intervalMs: 1000 }, w3.opts);
    ok("small snapshots are never omitted", r3.result.samples.length === 120 && r3.result.samples.every((x) => x.gputaskman.json) && r3.result.summary.omittedSnapshots === 0);
    const w4 = watchWorld({ snap: () => big(1500000), cost: 0 }), r4 = await G.runWatch({ mode: "sample", seconds: 5, intervalMs: 1000 }, w4.opts);
    ok("the budget is a running total: two snapshots of 1,500,000 fit (3,000,000 < 3,145,728) and the third does not", r4.result.samples.filter((x) => x.gputaskman.json).length === 2 && r4.result.samples[2].gputaskman.omitted === true);
    const raw = watchWorld({ snap: () => "not json" }); raw.exec.calls.length = 0;
    const wr = watchWorld(); const rawEx = fakeExec((cmd, args) => (/gputaskman/.test(cmd) ? (args.includes("--list-gpus") ? { stdout: "0: x\n" } : { stdout: "this is not json at all" }) : { err: errOf({ code: "ENOENT" }) }));
    const rr = await G.runWatch({ mode: "sample", seconds: 3 }, { ...wr.opts, execFileImpl: rawEx });
    ok("a snapshot that is not JSON is a not-ok sample with its raw text, a null digest, and the watch is not ok (nothing usable)", rr.result.samples.every((x) => !x.gputaskman.ok && /not json/i.test(x.gputaskman.raw) && x.read === null) && !rr.result.ok);
}
{
    // the digest of one snapshot, taken defensively
    const R = G._readSnapshot;
    ok("readSnapshot: not a snapshot reads null (null, a string, a number, undefined)", [null, undefined, "x", 5].every((x) => R(x) === null));
    ok("readSnapshot: an object with nothing in it reads as an idle empty snapshot, not as null", eq(R({}), { utilGpuPct: null, smClockMHz: null, powerW: null, vramUsedBytes: null, processes: [] }) && eq(R([]), { utilGpuPct: null, smClockMHz: null, powerW: null, vramUsedBytes: null, processes: [] }));
    const real = { taken: 1794155424.1664827, gpu: null, driver: "", cuda: "", adapter: null, vram_total: 0, vram_used: null, shared_used: null, attributed: 0, backend: "nvml", shared_is_spill: true, host_status: null, process_status: null, counter_status: null, counter_adapter_matched: null, wsl_split: null, device: null, processes: [] };
    ok("!! readSnapshot: the REAL output of gputaskman 0.3.3 on a machine with no GPU (the sandbox's own) reads as empty, and the 'cuda' KEY is not mistaken for a runtime", eq(R(real), { utilGpuPct: null, smClockMHz: null, powerW: null, vramUsedBytes: null, processes: [] }));
    const d = R(busySnap(true));
    ok("readSnapshot: device readings and VRAM used", d.utilGpuPct === 71 && d.smClockMHz === 1700 && d.powerW === 88.5 && d.vramUsedBytes === 1887436800);
    ok("!! readSnapshot: only processes that use the card are kept (a gpu_pct or a vram_bytes above 0), busiest first, with pid, name, runtimes and engines", d.processes.length === 3 && d.processes[0].name === "chrome.exe" && d.processes[0].pid === 4242 && eq(d.processes[0].runtimes, ["Direct3D"]) && d.processes[0].gpuPct === 62.5 && d.processes[0].vramBytes === 314572800 && eq(d.processes[0].engines, { "3D": 50, Compute_0: 12.5 }) && d.processes[1].name === "dwm.exe" && d.processes[2].pid === 4243 && d.processes[2].gpuPct === 0 && d.processes[2].vramBytes === 5242880);
    const odd = R({ device: "no", processes: [null, 5, "x", { name: 7, pid: "1", runtimes: "Direct3D", gpu_pct: "50", vram_bytes: NaN, engines: [1] }, { name: "a".repeat(200), pid: 2, runtimes: ["Vulkan", 3, null], gpu_pct: 5, engines: { a: 1, b: "x", c: NaN } }] });
    ok("!! readSnapshot: junk is survived: a device that is not an object, entries that are not objects, a name that is not text, a pid or a percentage that is a string, runtimes that are not a list, engines that are not numbers; a name is cut to 80 characters", odd.utilGpuPct === null && odd.processes.length === 1 && odd.processes[0].name.length === 80 && eq(odd.processes[0].runtimes, ["Vulkan"]) && eq(odd.processes[0].engines, { a: 1 }) && odd.processes[0].gpuPct === 5 && odd.processes[0].pid === 2);
    const many = R({ processes: Array.from({ length: 30 }, (_, i) => ({ pid: i + 1, name: "p" + i, gpu_pct: i + 1 })) });
    ok("readSnapshot: at most 12 processes, the busiest 12", many.processes.length === 12 && many.processes[0].name === "p29" && many.processes[11].name === "p18");
    const eng = R({ processes: [{ pid: 1, name: "e", gpu_pct: 1, engines: Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["e" + i, i + 1])) }] });
    ok("readSnapshot: at most 12 engines, 8 runtimes", Object.keys(eng.processes[0].engines).length === 12 && R({ processes: [{ pid: 1, name: "e", gpu_pct: 1, runtimes: Array.from({ length: 20 }, (_, i) => "r" + i) }] }).processes[0].runtimes.length === 8);
    const tie = R({ processes: [{ pid: 1, name: "small", gpu_pct: 5, vram_bytes: 100 }, { pid: 2, name: "big", gpu_pct: 5, vram_bytes: 900 }, { pid: 3, name: "zero", gpu_pct: null, vram_bytes: 50 }] });
    ok("readSnapshot: equal percentages are ordered by VRAM, and a process with only VRAM is kept after those with a percentage", eq(tie.processes.map((x) => x.name), ["big", "small", "zero"]));
}


// ---- 12. the GPU brain under the samples ------------------------------------------------------------------------------------------------------------
console.log("\n12. THE GPU BRAIN RUN UNDER THE SAMPLES");
{
    const w = watchWorld({ releaseAt: 5 }), { result, saved } = await G.runWatch({ mode: "brain" }, w.opts);
    const sw = w.exec.calls.find((c) => c.cmd === "fakenode"), ev = w.events;
    ok("brain: the swarm is run with the node it was given, the engine's own tool by its absolute path, and the fixed arguments (--hardware, the sizes, the rounds, the simulated seconds)", sw && eq(sw.args, [path.join("/eng", "tools", "ship", "gpuSwarm.mjs"), "--hardware", "--sizes", "4096,8192", "--rounds", "2", "--seconds", "10"]));
    ok("!! brain: no shell, the engine's folder as the working directory, the 30-minute limit, and NEVER --write (so a watched swarm's timings cannot land in the rig's results file)", sw.opts.shell === false && sw.opts.cwd === "/eng" && sw.opts.timeout === 1800000 && !sw.args.includes("--write") && !/["']--write["']/.test(SRC));
    ok("!! brain: the ORDER is two snapshots, then the swarm starts, then samples while it runs, then it ends, then two snapshots after", ev.indexOf("gt#2") < ev.indexOf("swarm-start") && ev.indexOf("swarm-start") < ev.indexOf("gt#3") && ev.indexOf("swarm-end") > ev.indexOf("gt#5") - 1 && ev.indexOf("swarm-end") < ev.indexOf("gt#" + (result.samples.length - 1)) && ev.filter((e) => /^gt#/.test(e)).length === result.samples.length, ev.join(" "));
    const ph = (n) => result.samples.filter((x) => x.phase === n).length;
    ok("brain: two samples before, at least three during and two after, in time order, every one with both tools' answers", ph("before") === 2 && ph("during") >= 3 && ph("during") <= 4 && ph("after") === 2 && result.samples.every((x, i) => i === 0 || x.tMs >= result.samples[i - 1].tMs) && eq(result.samples.map((x) => x.phase).filter((v, i, a) => i === 0 || v !== a[i - 1]), ["before", "during", "after"]));
    ok("brain: the swarm's record: ok, exit code 0, the command text, the adapter line and 'not software', the output, and the note that it was NOT written to the results file", result.brain.ok === true && result.brain.exitCode === 0 && result.brain.command === "node tools/ship/gpuSwarm.mjs --hardware --sizes 4096,8192 --rounds 2 --seconds 10" && result.brain.adapterLine === "hardware adapter: nvidia pascal NVIDIA GeForce GTX 1080" && result.brain.software === false && /^hardware adapter/.test(result.brain.output) && /NOT written to brain\/rig-results\/gpuSwarm\.jsonl/.test(result.brain.note) && result.brain.timedOut === false && result.brain.notFound === false && result.brain.durationMs > 0 && result.brain.stderrTail === "");
    ok("brain: on a hardware adapter the watch is ok, and the request names the swarm's settings", result.ok === true && result.error === "" && eq(result.request.brain, { sizes: [4096, 8192], rounds: 2, swarmSeconds: 10 }) && result.mode === "brain" && saved.ok && /gpuwatch-20261108-\d{6}-brain\.json$/.test(saved.relative));
    const sm = result.summary;
    ok("!! brain: BEFORE versus DURING in the summary: nvidia-smi utilization 3 before, 73 at the peak during, 3 after; memory 900 MiB before and 1800 at the peak (a rise of 900)", sm.utilizationPct.before === 3 && sm.utilizationPct.duringPeak === 73 && sm.utilizationPct.after === 3 && sm.memoryUsedMiB.before === 900 && sm.memoryUsedMiB.duringPeak === 1800 && sm.memoryUsedMiB.after === 900 && sm.memoryUsedMiB.rise === 900 && eq(sm.samples, { total: result.samples.length, before: 2, during: ph("during"), after: 2 }));
    ok("!! brain: gputaskman's own readings agree: utilization 4 before and 71 at the peak, the SM clock 300 then 1700 MHz, the power 21 then 88.5 W", sm.gputaskmanDevice.utilGpuPct.before === 4 && sm.gputaskmanDevice.utilGpuPct.duringPeak === 71 && sm.gputaskmanDevice.smClockMHz.before === 300 && sm.gputaskmanDevice.smClockMHz.duringPeak === 1700 && sm.gputaskmanDevice.powerW.before === 21 && sm.gputaskmanDevice.powerW.duringPeak === 88.5);
    const chrome = sm.programs.find((x) => x.name === "chrome.exe"), dwm = sm.programs.find((x) => x.name === "dwm.exe");
    ok("!! brain: THE ANSWER TO 'DOES IT SHOW AS DIRECT3D UNDER THE BROWSER'S GPU PROCESS': chrome.exe appears under Direct3D, NOT before the swarm and during it (onlyDuring), while dwm.exe was there all along (not onlyDuring)", chrome && eq(chrome.runtimes, ["Direct3D"]) && chrome.seen.before === 0 && chrome.seen.during >= 3 && chrome.seen.after === 0 && chrome.onlyDuring === true && dwm.seen.before === 2 && dwm.seen.after === 2 && dwm.onlyDuring === false && eq(sm.runtimes, { Direct3D: ["chrome.exe"] }));
    ok("brain: the programs are listed busiest first", sm.programs[0].name === "chrome.exe" && sm.programs[0].gpuPctDuringPeak === 62.5);
    ok("brain: the steps tell the story (detect, before, swarm started with its command, swarm finished with the adapter line, after)", ["detect", "before", "swarm", "swarm", "after"].every((k, i) => result.steps[i].step === k) && result.steps[2].note === "starting: node tools/ship/gpuSwarm.mjs --hardware --sizes 4096,8192 --rounds 2 --seconds 10" && /^finished in [\d.]+ s; hardware adapter: nvidia pascal/.test(result.steps[3].note) && result.steps[1].note === "2 snapshots before the swarm starts" && result.steps[4].note === "2 snapshots after it ended" && result.steps.every((x) => x.ok === true));
}
{
    const w = watchWorld({ releaseAt: 5 }), { result } = await G.runWatch({ mode: "brain", sizes: [8192, 1024], rounds: 3, swarmSeconds: 4, intervalMs: 2000, gpu: 0 }, w.opts), sw = w.exec.calls.find((c) => c.cmd === "fakenode");
    ok("brain: the sizes go in sorted, the rounds, seconds and interval as given", eq(sw.args.slice(1), ["--hardware", "--sizes", "1024,8192", "--rounds", "3", "--seconds", "4"]) && result.request.intervalMs === 2000 && result.samples[1].tMs - result.samples[0].tMs === 2000);
    ok("brain: a GPU number goes to every gputaskman snapshot, not to the swarm", w.exec.calls.filter((c) => c.args.includes("--once")).every((c) => eq(c.args, ["--once", "--json", "--gpu", "0"])) && !sw.args.includes("--gpu"));
    const wo = watchWorld({ releaseAt: 5, childOut: "*** SOFTWARE ADAPTER *** google swiftshader\n(a CPU emulating a GPU)\n" }), ro = await G.runWatch({ mode: "brain" }, wo.opts);
    ok("!! brain: a SOFTWARE adapter is NOT ok: the error says the card was not used, the samples and the file are kept, and software is true", !ro.result.ok && /SOFTWARE adapter: the browser did not reach the graphics card/.test(ro.result.error) && ro.result.brain.software === true && ro.result.brain.ok === true && /SOFTWARE ADAPTER/.test(ro.result.brain.adapterLine) && ro.saved.ok && ro.result.samples.length >= 7);
    const wu = watchWorld({ releaseAt: 5, childOut: "something else entirely\n" }), ru = await G.runWatch({ mode: "brain" }, wu.opts);
    ok("brain: an output that names no adapter is ok but says so: software null, an empty adapter line, and the step says 'no adapter line'", ru.result.ok && ru.result.brain.software === null && ru.result.brain.adapterLine === "" && ru.result.steps.some((x) => x.step === "swarm" && /no adapter line/.test(x.note)));
    const wf = watchWorld({ releaseAt: 5, childErr: errOf({ code: 2 }, "exit 2"), childStderr: "TypeError: boom\n    at x" }), rf = await G.runWatch({ mode: "brain" }, wf.opts);
    ok("brain: a swarm that fails (exit code 2) is not ok: the error names the exit code and the stderr, the after samples are still taken, and the file is saved", !rf.result.ok && /^the GPU swarm did not finish \(exit code 2\): TypeError: boom/.test(rf.result.error) && rf.result.brain.ok === false && rf.result.brain.exitCode === 2 && rf.result.samples.filter((x) => x.phase === "after").length === 2 && rf.saved.ok && /boom/.test(rf.result.brain.stderrTail) && rf.result.steps.some((x) => x.step === "swarm" && x.ok === false && /^failed: TypeError: boom/.test(x.note)));
    const wt = watchWorld({ releaseAt: 5, childErr: errOf({ killed: true }, "killed") }), rt = await G.runWatch({ mode: "brain" }, wt.opts);
    ok("brain: a swarm killed at the time limit says it did not finish in time", !rt.result.ok && /^the GPU swarm did not finish in time:/.test(rt.result.error) && rt.result.brain.timedOut === true && rt.result.steps.some((x) => x.step === "swarm" && x.note === "did not finish within the time allowed"));
    const wn = watchWorld({ noGate: true, childErr: errOf({ code: "ENOENT" }, "spawn fakenode ENOENT") }), rn = await G.runWatch({ mode: "brain" }, wn.opts);
    ok("brain: node not found: not ok, notFound true, the step says so, and the after samples are still taken", !rn.result.ok && rn.result.brain.notFound === true && /^the GPU swarm did not finish:/.test(rn.result.error) && rn.result.steps.some((x) => x.step === "swarm" && x.note === "node was not found") && rn.result.samples.filter((x) => x.phase === "after").length === 2);
    const wm = watchWorld({ gt: "missing", smi: false }), rm = await G.runWatch({ mode: "brain" }, wm.opts);
    ok("!! brain: when NOTHING can be sampled the swarm is NOT started (a node call is never made) and the file says why", !rm.result.ok && /so the swarm was not started/.test(rm.result.error) && !wm.exec.calls.some((c) => c.cmd === "fakenode") && rm.result.brain === null && rm.saved.ok);
    const wc = watchWorld({ releaseAt: 118, cost: 0 }), rc = await G.runWatch({ mode: "brain", intervalMs: 500 }, wc.opts);
    ok("!! brain: the samples during the swarm stop at 116 (120 less the four before and after) and the swarm is still waited for: 2 + 116 + 2 = 120", rc.result.samples.filter((x) => x.phase === "during").length === 116 && rc.result.samples.length === 120 && rc.result.brain.ok === true);
    const wl = watchWorld({ releaseAt: 5 }); wl.opts.brainTimeoutMs = 4321; await G.runWatch({ mode: "brain" }, wl.opts);
    ok("brain: the time limit can be shortened by the caller's options (the gate uses it)", wl.exec.calls.find((c) => c.cmd === "fakenode").opts.timeout === 4321);
    const wb = watchWorld({ releaseAt: 5 }); const bo = { ...wb.opts }; delete bo.nodeBin;
    await G.runWatch({ mode: "brain" }, bo);
    const used = wb.exec.calls.find((c) => /gpuSwarm\.mjs$/.test(c.args[0])).cmd;
    ok("brain: with no node given it uses the bridge's own when that is node, else `node` from the PATH", used === (/^node(\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : "node") && G._nodeBin({}) === used && G._nodeBin({ nodeBin: "x" }) === "x");
    const wp = watchWorld({ releaseAt: 5, childOut: "hardware adapter: x\n" + "t".repeat(20000) }), rp = await G.runWatch({ mode: "brain" }, wp.opts);
    ok("brain: the swarm's output is kept to its first 8000 characters and its stderr to the last 1500", rp.result.brain.output.length === 8000 && G.BRAIN.outputChars === 8000);
    const wq = watchWorld({ releaseAt: 5, childErr: errOf({ code: 1 }), childStderr: "e".repeat(3000) }), rq = await G.runWatch({ mode: "brain" }, wq.opts);
    ok("brain: a long stderr is cut to its last 1500 characters behind '...'", rq.result.brain.stderrTail.length === 1503 && rq.result.brain.stderrTail.startsWith("..."));
    const wa = watchWorld({ releaseAt: 5, childOut: "x".repeat(400) + " adapter\n" }), ra = await G.runWatch({ mode: "brain" }, wa.opts);
    ok("brain: the adapter line is cut to 300 characters", ra.result.brain.adapterLine.length === 300);
    const wx = watchWorld({ releaseAt: 5 }); const bad = await G.runWatch({ mode: "brain", sizes: [4096, "8192"] }, wx.opts);
    ok("!! brain: a bad size list is refused with no command run at all (not even gputaskman)", !bad.result.ok && wx.exec.calls.length === 0 && bad.saved.ok === false);
}
{
    // the session's own option: sample while the answer is generated
    const v = { t: 0 }, w = sessionWorld({ virtual: v, releaseAtGt: 6 }), { result } = await G.runSession({ model: "q:7b", sampleSeconds: 10, sampleIntervalMs: 2000 }, w.opts);
    ok("session: with sampleSeconds the series is taken WHILE the answer is generated, labelled 'generate', and the request records the settings", result.ok && result.samples.length >= 3 && result.samples.every((x) => x.phase === "generate" && x.gputaskman.ok) && result.request.sampleSeconds === 10 && result.request.sampleIntervalMs === 2000, `${result.samples.length} samples`);
    ok("session: the series stops when the answer ends (the fake answer ends at the sixth snapshot), not at the 10 seconds", result.samples.length < 6 && result.samples.every((x, i) => i === 0 || x.tMs > result.samples[i - 1].tMs) && result.steps.some((x) => x.step === "samples" && x.ok === true && /^\d+ snapshots while the answer was generated$/.test(x.note)));
    ok("session: the summary carries the digest of the series (programs, runtimes and device readings)", result.summary.sampled && result.summary.sampled.samples.during === result.samples.length && Array.isArray(result.summary.sampled.programs) && result.summary.sampled.gputaskmanOk === result.samples.length);
    ok("session: the three labelled snapshots are still taken as before (baseline, loaded, busy)", ["baseline", "loaded", "busy"].every((k) => result.snapshots[k] && result.snapshots[k].ok));
    const w0 = sessionWorld(), r0 = await G.runSession({ model: "q:7b" }, w0.opts);
    ok("!! session: with the option OFF (the default) no series is taken, the request says 0, the summary has no 'sampled', and the steps have no 'samples' step", eq(r0.result.samples, []) && r0.result.request.sampleSeconds === 0 && r0.result.request.sampleIntervalMs === 1000 && r0.result.summary.sampled === null && !r0.result.steps.some((x) => x.step === "samples"));
    for (const bad of [{ sampleSeconds: 2 }, { sampleSeconds: 301 }, { sampleSeconds: "x" }, { sampleSeconds: 10, sampleIntervalMs: 100 }, { sampleSeconds: 10, sampleIntervalMs: 99999 }]) {
        const wb = sessionWorld(), rb = await G.runSession({ model: "q:7b", ...bad }, wb.opts);
        ok(`!! session with ${JSON.stringify(bad)}: refused before anything runs, no file, and the reason is the sampling message`, !rb.result.ok && rb.result.error === "the sampling settings must be whole numbers: seconds 0 (off) or 3 to 300, interval 500 to 10000 ms" && wb.exec.calls.length === 0 && wb.fetch.calls.length === 0 && Object.keys(wb.fsx.w.files).length === 0 && rb.result.steps.length === 1 && rb.result.steps[0].note === "the sampling settings are not valid");
    }
    const wz = sessionWorld({ gt: "missing" }), rz = await G.runSession({ model: "q:7b", sampleSeconds: 5 }, wz.opts);
    ok("session: with no gputaskman the series is nvidia-smi alone (still ok), the gputaskman samples are not ok", rz.result.ok && rz.result.samples.length >= 1 && rz.result.samples.every((x) => !x.gputaskman.ok && x.nvidiaSmi.ok));
}
{
    // the jobs: a watch is a job like a session
    G._reset();
    const w = watchWorld({ releaseAt: 5 }), a = G.startWatch({ mode: "brain" }, w.opts);
    ok("a watch starts as a job and returns an id; its kind is 'watch'", a.ok === true && /^gt1-/.test(a.id) && G.jobStatus(a.id).kind === "watch" && G.jobStatus(a.id).state === "running");
    const b = G.startWatch({ mode: "sample", seconds: 5 }, w.opts), c = G.startSession({ model: "q:7b" }, sessionWorld().opts);
    ok("!! while a watch runs, another watch AND a session are refused, each naming the one running ('a watch is already running')", b.ok === false && /^a watch is already running$/.test(b.error) && b.id === a.id && c.ok === false && /^a watch is already running$/.test(c.error) && c.id === a.id);
    for (let i = 0; i < 400 && G.jobStatus(a.id).state === "running"; i++) await tick();
    const s1 = G.jobStatus(a.id);
    ok("when it ends: done, the steps, the result, the relative path of the file", s1.state === "done" && s1.kind === "watch" && s1.steps.length >= 5 && s1.result.kind === "gputaskman-watch" && /^brain\/rig-results\/gpu-snapshots\/gpuwatch-/.test(s1.savedAs) && s1.error === "");
    const sess = G.startSession({ model: "q:7b" }, sessionWorld().opts), d = G.startWatch({ mode: "sample", seconds: 5 }, w.opts);
    ok("!! while a session runs, a watch is refused ('a session is already running') and the session's kind is 'session'", sess.ok && G.jobStatus(sess.id).kind === "session" && d.ok === false && /^a session is already running$/.test(d.error) && d.id === sess.id);
    for (let i = 0; i < 400 && G.jobStatus(sess.id).state === "running"; i++) await tick();
    for (const bad of [{ mode: "x" }, { mode: "sample", seconds: 1 }, { mode: "brain", sizes: [3] }]) { const r = G.startWatch(bad, watchWorld().opts); ok(`!! startWatch ${JSON.stringify(bad)} is refused at the start with the reason and no job`, r.ok === false && typeof r.error === "string" && r.id === undefined); }
    ok("!! a bad sampling option is refused at the start of a session", G.startSession({ model: "q:7b", sampleSeconds: 2 }, sessionWorld().opts).ok === false && /sampling settings/.test(G.startSession({ model: "q:7b", sampleIntervalMs: 1 }, sessionWorld().opts).error));
    G._reset();
    const sw = watchWorld({ releaseAt: 5, childOut: "*** SOFTWARE ADAPTER *** x\n" }), e = G.startWatch({ mode: "brain" }, sw.opts);
    for (let i = 0; i < 400 && G.jobStatus(e.id).state === "running"; i++) await tick();
    const se = G.jobStatus(e.id);
    ok("a watch that ran on a software adapter ends in state error with the reason, and still holds its result and its file", se.state === "error" && /SOFTWARE adapter/.test(se.error) && se.result && se.result.ok === false && se.savedAs);
    G._reset();
}
{
    // the route lines in server.js
    const line = (re) => SERVER.split("\n").find((l) => re.test(l)) || "";
    const W = line(/"\/gputaskman\/watch"/), S = line(/"\/gputaskman\/session"/);
    ok("POST /gputaskman/watch -> startWatch with the mode, seconds, intervalMs, gpu, sizes, rounds and swarmSeconds only, and nothing else from the body", /POST/.test(W) && /gpuTaskManBridge\.startWatch\(\{ mode: d\.mode, seconds: d\.seconds, intervalMs: d\.intervalMs, gpu: d\.gpu, sizes: d\.sizes, rounds: d\.rounds, swarmSeconds: d\.swarmSeconds \}\)/.test(W) && !/\.\.\.d\b/.test(W));
    ok("POST /gputaskman/session passes the two sampling options as well, and still only named fields", /sampleSeconds: d\.sampleSeconds, sampleIntervalMs: d\.sampleIntervalMs/.test(S) && !/\.\.\.d\b/.test(S));
    ok("server.js says six routes", /gputaskman\.html's six routes/.test(SERVER));
    ok("!! the module runs the swarm through execFile by a fixed script path (BRAIN.script) and never builds a command from a request field", /BRAIN\.script/.test(SRC) && !/exec\(|execSync|spawn\(/.test(SRC.replace(/execFileImpl|execFile|execOf/g, "")) && !/(p|v)\.(command|script|cmd|path|args)\b/.test(SRC.slice(SRC.indexOf("async function runWatch"), SRC.indexOf("// ---- jobs"))));
}


// ---- 13. added after the first sweep of the watch (each row closes surviving mutants; see the LOG in the header) --------------------------------------------
console.log("\n13. ADDED AFTER THE FIRST SWEEP OF THE WATCH");
{
    // hand-made samples, so every number the summary reads is known
    const smp = (phase, tMs, rows, read) => ({ tMs, tookMs: 0, phase, read: read === undefined ? { utilGpuPct: null, smClockMHz: null, powerW: null, vramUsedBytes: null, processes: [] } : read, gputaskman: { ok: true }, nvidiaSmi: rows === null ? { ok: false } : { ok: true, gpus: rows } });
    const row = (index, util, mem = 100, temp = 50) => ({ index, name: "GPU " + index, driver: "d", memoryTotalMiB: 8192, memoryUsedMiB: mem, utilizationPct: util, temperatureC: temp });
    const prog = (name, gpuPct, vramMiB, runtimes = [], pid = 1, engines = {}) => ({ pid, name, runtimes, gpuPct, vramBytes: vramMiB === null ? null : vramMiB * 1048576, engines });
    const rd = (...processes) => ({ utilGpuPct: null, smClockMHz: null, powerW: null, vramUsedBytes: null, processes });
    const utilSeries = (vals, phase = "during") => vals.map((v, i) => smp(phase, i * 1000, [row(0, v)]));
    const U = (vals, phase) => G.watchSummary(utilSeries(vals, phase), null).utilizationPct;
    ok("!! medians: an odd list reads its middle after SORTING (90 10 50 30 70 -> 50), an even list the mean of the two middle ones (90 10 50 30 -> 40), rounded to two decimals ((1.111 + 2.222) / 2 -> 1.67)", U([90, 10, 50, 30, 70]).during === 50 && U([90, 10, 50, 30]).during === 40 && U([1, 4]).during === 2.5 && U([1.111, 2.222]).during === 1.67 && U([7]).during === 7 && U([50, 10, 30]).during === 30 && U([2, 2, 9, 1, 1]).during === 2);
    ok("peaks: the largest of the during samples, a null is ignored, and an all-null series reads null", U([3, 90, 20]).duringPeak === 90 && U([null, 5, null]).duringPeak === 5 && U([null, null]).during === null && U([null, null]).duringPeak === null);
    ok("the generate and sample phases count as 'during' like the swarm's own; before and after are their own buckets", eq(G.watchSummary([smp("generate", 0, [row(0, 10)]), smp("generate", 1000, [row(0, 20)]), smp("generate", 2000, [row(0, 30)])], null).samples, { total: 3, before: 0, during: 3, after: 0 }) && G.watchSummary([smp("generate", 0, [row(0, 10)]), smp("generate", 1, [row(0, 20)]), smp("generate", 2, [row(0, 30)])], null).utilizationPct.during === 20 && eq(G.watchSummary([smp("before", 0, [row(0, 1)]), smp("during", 1, [row(0, 80)]), smp("after", 2, [row(0, 2)]), smp("sample", 3, [row(0, 60)])], null).samples, { total: 4, before: 1, during: 2, after: 1 }));
    ok("!! the GPU the summary follows: the busiest by peak; on a TIE the lower index (the first); an N/A (null) counts below any number; with every value null the first row's index", G.watchSummary([smp("during", 0, [row(0, 50), row(1, 50)])], null).gpuIndex === 0 && G.watchSummary([smp("during", 0, [row(0, null), row(1, 10)])], null).gpuIndex === 1 && G.watchSummary([smp("during", 0, [row(0, null), row(1, null)])], null).gpuIndex === 0 && G.watchSummary([smp("during", 0, [row(0, 5), row(1, 6)])], null).gpuIndex === 1 && G.watchSummary([smp("during", 0, [row(2, null), row(1, null)])], null).gpuIndex === 2);
    ok("!! a row with no index (a line nvidia-smi garbled) is never the followed GPU", G.watchSummary([smp("during", 0, [row(null, 99), row(1, 5)])], null).gpuIndex === 1);
    ok("!! with no 'during' samples at all the summary falls back to the FIRST nvidia-smi row seen (not the second), and with no nvidia-smi rows the index and name are null", G.watchSummary([smp("before", 0, [row(3, 5), row(7, 9)])], null).gpuIndex === 3 && G.watchSummary([smp("before", 0, null), smp("during", 1, [])], null).gpuIndex === null && G.watchSummary([smp("before", 0, null)], null).gpuName === null && G.watchSummary([smp("during", 0, [row(0, 5)])], 2).gpuIndex === 2);
    ok("the omitted-snapshot count is 0 when none is given and is what it is told otherwise", G.watchSummary([], null).omittedSnapshots === 0 && G.watchSummary([], null, 4).omittedSnapshots === 4);
    ok("memory and temperature: the median before, the peak during, the rise, the median after, the hottest during", eq(G.watchSummary([smp("before", 0, [row(0, 1, 100, 40)]), smp("before", 1, [row(0, 1, 300, 41)]), smp("during", 2, [row(0, 80, 500, 70)]), smp("during", 3, [row(0, 80, 900, 75)]), smp("after", 4, [row(0, 2, 200, 50)])], null).memoryUsedMiB, { before: 200, duringPeak: 900, after: 200, rise: 700 }) && G.watchSummary([smp("during", 0, [row(0, 1, 100, 70)]), smp("during", 1, [row(0, 1, 100, 75)])], null).temperatureCPeak === 75);

    // programs
    const P = (samples) => G.watchSummary(samples, null);
    const chromeS = P([smp("during", 0, [row(0, 5)], rd(prog("chrome.exe", 30, 100, ["Direct3D"], 1), prog("chrome.exe", 62.5, 50, [], 2))), smp("during", 1, [row(0, 5)], rd(prog("chrome.exe", 40, 150, [], 1))), smp("during", 2, [row(0, 5)], rd(prog("chrome.exe", 10, 200, ["Vulkan"], 1)))]).programs[0];
    ok("!! a program with several processes: in each sample its BUSIEST process counts (62.5, then 40, then 10), the peak is 62.5, the median 40, the memory peak the largest anywhere (200), two pids seen, the runtimes joined and sorted", chromeS.name === "chrome.exe" && chromeS.gpuPctDuringPeak === 62.5 && chromeS.gpuPctDuringMedian === 40 && chromeS.vramPeakMiB === 200 && chromeS.pids === 2 && eq(chromeS.runtimes, ["Direct3D", "Vulkan"]) && eq(chromeS.seen, { before: 0, during: 3, after: 0 }));
    const lowFirst = P([smp("during", 0, [row(0, 5)], rd(prog("a", 30, 10, [], 1), prog("a", 62.5, 90, [], 2)))]).programs[0], highFirst = P([smp("during", 0, [row(0, 5)], rd(prog("a", 62.5, 90, [], 1), prog("a", 30, 10, [], 2)))]).programs[0];
    ok("!! within one sample the larger share and the larger memory win whichever process comes first (list order does not matter)", lowFirst.gpuPctDuringPeak === 62.5 && lowFirst.vramPeakMiB === 90 && highFirst.gpuPctDuringPeak === 62.5 && highFirst.vramPeakMiB === 90);
    const growing = P([smp("during", 0, [row(0, 5)], rd(prog("g", 5, 100))), smp("during", 1, [row(0, 5)], rd(prog("g", 5, 200))), smp("during", 2, [row(0, 5)], rd(prog("g", 5, 150))), smp("during", 3, [row(0, 5)], rd(prog("g", 5, null)))]).programs[0];
    ok("memory peak across samples: 100, 200, 150, then a sample with no figure -> 200; a program that never gave a figure reads null; an equal figure is not a change", growing.vramPeakMiB === 200 && P([smp("during", 0, [row(0, 5)], rd(prog("h", 5, null)))]).programs[0].vramPeakMiB === null && P([smp("during", 0, [row(0, 5)], rd(prog("h", 5, 64)))]).programs[0].vramPeakMiB === 64);
    const dw = P([smp("before", 0, [row(0, 1)], rd(prog("dwm.exe", 1.0, 100))), smp("before", 1, [row(0, 1)], rd(prog("dwm.exe", 1.0, 100))), smp("during", 2, [row(0, 80)], rd(prog("dwm.exe", 1.5, 100))), smp("during", 3, [row(0, 80)], rd(prog("dwm.exe", 2.5, 100)))]).programs[0];
    ok("!! the share DURING counts only the during samples: dwm.exe at 1.0 before and 1.5 and 2.5 during has a median of 2 and a peak of 2.5 (the before values stay out)", dw.gpuPctDuringMedian === 2 && dw.gpuPctDuringPeak === 2.5 && eq(dw.seen, { before: 2, during: 2, after: 0 }));
    const nullShare = P([smp("during", 0, [row(0, 5)], rd(prog("n", null, 40)))]).programs[0];
    ok("a program with a memory figure and no share has no share (null), not 0", nullShare.gpuPctDuringPeak === null && nullShare.gpuPctDuringMedian === null && nullShare.vramPeakMiB === 40);
    const E = P([smp("during", 0, [row(0, 5)], rd(prog("e", 5, 1, [], 1, { "3D": 10, Compute_0: 5 }))), smp("during", 1, [row(0, 5)], rd(prog("e", 5, 1, [], 1, { "3D": 30 }), prog("e", 5, 1, [], 2, { "3D": 20, Copy: 2 }))), smp("during", 2, [row(0, 5)], rd(prog("e", 5, 1, [], 1, { "3D": 25 })))]).programs[0];
    ok("!! each engine keeps its peak across samples and across processes (3D 30, Compute_0 5, Copy 2)", eq(E.enginesPeak, { "3D": 30, Compute_0: 5, Copy: 2 }));
    const only = P([smp("before", 0, [row(0, 1)], rd(prog("always", 1, 1), prog("early", 1, 1, ["CUDA"]))), smp("during", 1, [row(0, 9)], rd(prog("always", 1, 1), prog("late", 1, 1, ["Vulkan"]))), smp("after", 2, [row(0, 1)], rd(prog("always", 1, 1), prog("ending", 1, 1)))]).programs, by = (n) => only.find((x) => x.name === n);
    ok("!! onlyDuring: a program first seen while it ran is true; one that was there before is false; one seen only before, or only after, is false (it was not seen during)", by("late").onlyDuring === true && by("always").onlyDuring === false && by("early").onlyDuring === false && by("ending").onlyDuring === false);
    ok("onlyDuring needs a 'before' to compare with: with none it is false; seen once during, with a before taken, it is true; a SINGLE before sample is a comparison too", P([smp("during", 0, [row(0, 9)], rd(prog("p", 1, 1)))]).programs[0].onlyDuring === false && P([smp("before", 0, [row(0, 1)], rd()), smp("during", 1, [row(0, 9)], rd(prog("p", 1, 1)))]).programs[0].onlyDuring === true);
    const rt = P([smp("before", 0, [row(0, 1)], rd(prog("early", 1, 1, ["CUDA"]))), smp("during", 1, [row(0, 9)], rd(prog("zeta", 1, 1, ["Vulkan"]), prog("alpha", 1, 1, ["Vulkan", "Direct3D"]))), smp("after", 2, [row(0, 1)], rd(prog("ending", 1, 1, ["HIP"])))]).runtimes;
    ok("!! the runtimes map lists only programs seen DURING, the names sorted ('alpha' before 'zeta' though 'zeta' came first), and a runtime seen only before or after is absent", eq(rt, { Direct3D: ["alpha"], Vulkan: ["alpha", "zeta"] }) && Object.keys(rt).length === 2);
    const one = P([smp("before", 0, [row(0, 1)], rd(prog("once", 1, 1, ["Direct3D"]))), smp("during", 1, [row(0, 9)], rd(prog("once", 1, 1, ["Direct3D"])))]).runtimes;
    ok("a program seen exactly once during is in the runtimes map", eq(one, { Direct3D: ["once"] }));
    ok("!! the programs are ordered by the share during (largest first), then memory (largest first), then name (alphabetical); a null share comes last", eq(P([smp("during", 0, [row(0, 5)], rd(prog("d", 5, 20), prog("c", 5, 20), prog("b", 5, 10), prog("a", null, 500), prog("z", 90, 1)))]).programs.map((x) => x.name), ["z", "c", "d", "b", "a"]));
    ok("a name that sorts first wins the last tie even when it came last (insertion order is not the order)", eq(P([smp("during", 0, [row(0, 5)], rd(prog("y", 5, 20), prog("x", 5, 20)))]).programs.map((x) => x.name), ["x", "y"]));
    ok("at most ten programs are listed, the ten busiest", P([smp("during", 0, [row(0, 5)], rd(...Array.from({ length: 12 }, (_, i) => prog("p" + String(i).padStart(2, "0"), i + 1, 1))))]).programs.length === 10 && P([smp("during", 0, [row(0, 5)], rd(...Array.from({ length: 12 }, (_, i) => prog("p" + String(i).padStart(2, "0"), i + 1, 1))))]).programs[9].name === "p02");
    ok("memory in MiB is the bytes over 1048576, rounded (314572800 -> 300; 100 MiB + 600000 bytes -> 101)", P([smp("during", 0, [row(0, 5)], rd({ pid: 1, name: "m", runtimes: [], gpuPct: 5, vramBytes: 314572800, engines: {} }))]).programs[0].vramPeakMiB === 300 && P([smp("during", 0, [row(0, 5)], rd({ pid: 1, name: "m", runtimes: [], gpuPct: 5, vramBytes: 100 * 1048576 + 600000, engines: {} }))]).programs[0].vramPeakMiB === 101);
    ok("a pid seen in every sample counts once", P([smp("during", 0, [row(0, 5)], rd(prog("k", 5, 1, [], 7))), smp("during", 1, [row(0, 5)], rd(prog("k", 5, 1, [], 7))), smp("during", 2, [row(0, 5)], rd(prog("k", 5, 1, [], 8)))]).programs[0].pids === 2);
    ok("a sample whose snapshot was not readable (digest null) adds no program and does not throw", P([smp("during", 0, [row(0, 5)], null), smp("during", 1, [row(0, 5)], rd(prog("q", 5, 1)))]).programs.length === 1);
    ok("the gputaskman device readings: the before median, the peak during, and a null where nothing was read", eq(G.watchSummary([smp("before", 0, [], { utilGpuPct: 4, smClockMHz: 300, powerW: 21, vramUsedBytes: null, processes: [] }), smp("before", 1, [], { utilGpuPct: 6, smClockMHz: 300, powerW: 21, vramUsedBytes: null, processes: [] }), smp("during", 2, [], { utilGpuPct: 71, smClockMHz: 1700, powerW: 88.5, vramUsedBytes: null, processes: [] }), smp("during", 3, [], { utilGpuPct: 60, smClockMHz: 1600, powerW: 80, vramUsedBytes: null, processes: [] })], null).gputaskmanDevice, { utilGpuPct: { before: 5, duringPeak: 71 }, smClockMHz: { before: 300, duringPeak: 1700 }, powerW: { before: 21, duringPeak: 88.5 } }) && G.watchSummary([smp("during", 0, [row(0, 5)])], null).gputaskmanDevice.utilGpuPct.duringPeak === null);
    ok("the median gap between samples is the median of the differences of their times", G.watchSummary([smp("sample", 0, [row(0, 5)]), smp("sample", 1000, [row(0, 5)]), smp("sample", 2500, [row(0, 5)]), smp("sample", 3500, [row(0, 5)])], null).intervalMsMedian === 1000 && G.watchSummary([smp("sample", 0, [row(0, 5)])], null).intervalMsMedian === null);
    ok("a sample with neither tool answering still counts in the totals but in neither 'ok' count", eq((({ gputaskmanOk, nvidiaSmiOk, samples }) => [gputaskmanOk, nvidiaSmiOk, samples.total])(G.watchSummary([{ ...smp("sample", 0, null), gputaskman: { ok: false } }, smp("sample", 1, [row(0, 1)])], null)), [1, 1, 2]));
}
{
    // the clock, the cut-offs and the swarm's own time
    const w = watchWorld({ startT: 5000 }), { result } = await G.runWatch({ mode: "sample", seconds: 3, intervalMs: 1000 }, w.opts);
    ok("!! tMs counts from the START of the watch, not from the clock's zero (a clock that starts at 5000 still gives samples at 0, 1000, 2000)", eq(result.samples.map((x) => x.tMs), [0, 1000, 2000]));
    const w2 = watchWorld({ cost: 0 }), r2 = await G.runWatch({ mode: "sample", seconds: 3, intervalMs: 999 }, w2.opts);
    ok("!! the watch lasts exactly `seconds` x 1000 ms: 3 s at 999 ms gives samples at 0, 999, 1998 and 2997 (the last begins before the 3000 ms are up)", eq(r2.result.samples.map((x) => x.tMs), [0, 999, 1998, 2997]));
    const w3 = watchWorld({ cost: 0 }), r3 = await G.runWatch({ mode: "sample", seconds: 300, intervalMs: 500 }, w3.opts);
    ok("!! a watch that ends by the sample cap does not wait one more interval after its last sample (120 samples, 119 waits)", r3.result.samples.length === 120 && w3.sleeps.length === 119);
    const w4 = watchWorld({ cost: 0 }), r4 = await G.runWatch({ mode: "sample", seconds: 4, intervalMs: 1000 }, w4.opts);
    ok("a watch that ends by TIME waits out the last interval (4 samples, 4 waits, the last one bringing the clock to the end time)", r4.result.samples.length === 4 && w4.sleeps.length === 4 && w4.T.t === 4000);
    ok("every step of a good sample watch is ok, including the one that announces it", r4.result.steps.every((x) => x.ok === true) && r4.result.steps.some((x) => x.step === "sample" && x.note === "taking a snapshot every 1000 ms for 4 s"));
    const wr1 = watchWorld(), rr1 = await G.runWatch({ mode: "x" }, wr1.opts), rr2 = await G.runWatch({ mode: "brain", sizes: [1] }, wr1.opts), rr3 = await G.runWatch({ mode: "sample", seconds: 1 }, wr1.opts);
    ok("a refused request still says which mode it asked for (brain, or sample for anything else)", rr1.result.mode === "sample" && rr2.result.mode === "brain" && rr3.result.mode === "sample");
    // the budget at its edge: three snapshots of exactly 1 MiB fit (3 x 1048576 = 3145728), the fourth does not
    const exact = (n) => { const base = JSON.stringify({ pad: "", processes: [] }).length; return { pad: "x".repeat(n - base), processes: [] }; };
    const w5 = watchWorld({ snap: () => exact(1048576), cost: 0 }), r5 = await G.runWatch({ mode: "sample", seconds: 5, intervalMs: 1000 }, w5.opts);
    ok("!! the size budget is spent exactly: snapshots of 1048576 characters each, three fit (their sum IS the budget), the fourth is omitted", r5.result.samples.filter((x) => x.gputaskman.json).length === 3 && r5.result.samples[3].gputaskman.omitted === true && r5.result.samples[3].gputaskman.bytes === 1048576 && r5.result.summary.omittedSnapshots === 2);
    const w6 = watchWorld({ snap: () => exact(1000000), cost: 0, releaseAt: 6 }), r6 = await G.runWatch({ mode: "brain" }, w6.opts);
    ok("brain: the omitted count is in the summary too (6 snapshots of 1,000,000: three kept, three omitted)", r6.result.summary.omittedSnapshots === r6.result.samples.filter((x) => x.gputaskman.omitted).length && r6.result.summary.omittedSnapshots >= 3);
    const w7 = watchWorld({ releaseAt: 5 }), r7 = await G.runWatch({ mode: "brain" }, w7.opts);
    ok("brain: with nothing omitted the summary says 0", r7.result.summary.omittedSnapshots === 0);
    const w8 = watchWorld({ gt: "missing", smi: false }), r8 = await G.runWatch({ mode: "brain" }, w8.opts);
    ok("brain: when nothing can be sampled the summary is still written, with 0 omitted", r8.result.summary && r8.result.summary.omittedSnapshots === 0 && r8.result.summary.samples.total === 2);
    // the cap on samples during the swarm, with the swarm still running when it is reached
    const w9 = watchWorld({ cost: 0, releaseAfterMs: 60 }), r9 = await G.runWatch({ mode: "brain", intervalMs: 500 }, w9.opts);
    ok("!! brain: the swarm is still running when the 116-sample cap is reached: exactly 116 samples during, 2 before and 2 after (120), and the swarm is still waited for", r9.result.samples.filter((x) => x.phase === "during").length === 116 && r9.result.samples.filter((x) => x.phase === "before").length === 2 && r9.result.samples.filter((x) => x.phase === "after").length === 2 && r9.result.samples.length === 120 && r9.result.brain.ok === true);
    // the swarm's own time and notes
    const wd = watchWorld({ cost: 0, noGate: true, childMs: 41234, childOut: "hardware adapter: nvidia pascal GTX 1080\n" }), rd2 = await G.runWatch({ mode: "brain" }, wd.opts);
    ok("!! the swarm's duration is the time from its start to its own end (41234 ms), not to the end of the sampling, and the step note reads it in tenths of a second", rd2.result.brain.durationMs === 41234 && rd2.result.steps.find((x) => x.step === "swarm" && x.note.startsWith("finished")).note === "finished in 41.2 s; hardware adapter: nvidia pascal GTX 1080");
    for (const [ms, text] of [[41249, "41.2"], [41250, "41.3"], [100, "0.1"], [49, "0"]]) { const wq = watchWorld({ cost: 0, noGate: true, childMs: ms }), rq = await G.runWatch({ mode: "brain" }, wq.opts); ok(`the swarm's seconds are rounded to a tenth: ${ms} ms reads ${text} s`, rq.result.steps.find((x) => x.step === "swarm" && x.note.startsWith("finished")).note.startsWith(`finished in ${text} s;`) && rq.result.brain.durationMs === ms); }
    const wl = watchWorld({ releaseAt: 5, childErr: errOf({ code: 2 }, "exit 2"), childStderr: "S".repeat(500) }), rl = await G.runWatch({ mode: "brain" }, wl.opts);
    ok("!! a failed swarm's reason is cut to its last 300 characters (+3) in the step note and in the error, and a stderr of exactly 300 is not cut", rl.result.steps.find((x) => x.step === "swarm" && x.ok === false).note === "failed: ..." + "S".repeat(300) && rl.result.error === "the GPU swarm did not finish (exit code 2): ..." + "S".repeat(300));
    const wm = watchWorld({ releaseAt: 5, childErr: errOf({ code: 2 }, "exit 2"), childStderr: "S".repeat(300) }), rm = await G.runWatch({ mode: "brain" }, wm.opts);
    ok("a stderr of exactly 300 characters is not cut", rm.result.error === "the GPU swarm did not finish (exit code 2): " + "S".repeat(300));
    const wn = watchWorld({ releaseAt: 5, childErr: errOf({ code: 2 }, "exit 2"), childStderr: "" }), rn = await G.runWatch({ mode: "brain" }, wn.opts);
    ok("with no stderr the reason is the error's own message", /^the GPU swarm did not finish \(exit code 2\): exit 2$/.test(rn.result.error));
}
{
    // the session's series: the steps and the refusal
    const v = { t: 0 }, w = sessionWorld({ virtual: v, gt: "missing", smi: false, releaseAtGt: 99 }), r = await G.runSession({ model: "q:7b", sampleSeconds: 3, sampleIntervalMs: 1000 }, w.opts);
    ok("session: with neither tool the series step says so (not ok) and the session itself goes on", r.result.steps.some((x) => x.step === "samples" && x.ok === false) && r.result.ok);
    const v2 = { t: 0 }, w2 = sessionWorld({ virtual: v2, gt: "missing", releaseAtGt: 99 }), r2 = await G.runSession({ model: "q:7b", sampleSeconds: 3, sampleIntervalMs: 1000 }, w2.opts);
    ok("session: nvidia-smi alone is enough for the series step to be ok", r2.result.steps.some((x) => x.step === "samples" && x.ok === true));
    const wb = sessionWorld(), rb = await G.runSession({ model: "q:7b", sampleSeconds: 2 }, wb.opts);
    ok("a refused sampling request logs its one failed 'check' step", rb.result.steps.length === 1 && rb.result.steps[0].step === "check" && rb.result.steps[0].ok === false);
    const wbad = sessionWorld(), rbad = await G.runSession({ model: "q:7b", sampleSeconds: 2 }, wbad.opts);
    ok("a refused sampling request records null for the settings that were not valid and the interval as given", rbad.result.request.sampleSeconds === null && rbad.result.request.sampleIntervalMs === 1000);
    const wi = sessionWorld(), ri = await G.runSession({ model: "q:7b", sampleSeconds: 5, sampleIntervalMs: 99999 }, wi.opts);
    ok("and a refused interval records null for it", ri.result.request.sampleIntervalMs === null && ri.result.request.sampleSeconds === 5);
}
{
    // readSnapshot: the corners the sweep found
    const R = G._readSnapshot;
    ok("!! readSnapshot: engines given as a LIST are not engines ({}), on a process that is otherwise kept", eq(R({ processes: [{ pid: 1, name: "e", gpu_pct: 5, engines: [1, 2] }] }).processes[0].engines, {}) && eq(R({ processes: [{ pid: 1, name: "e", gpu_pct: 5, engines: null }] }).processes[0].engines, {}) && eq(R({ processes: [{ pid: 1, name: "e", gpu_pct: 5 }] }).processes[0].engines, {}));
    ok("!! readSnapshot: a process with neither a share nor memory (both null, or 0 and null, or null and 0) is NOT kept", R({ processes: [{ pid: 1, name: "a", gpu_pct: null, vram_bytes: null }, { pid: 2, name: "b", gpu_pct: 0, vram_bytes: null }, { pid: 3, name: "c", gpu_pct: null, vram_bytes: 0 }, { pid: 4, name: "d" }] }).processes.length === 0);
    ok("!! readSnapshot: order is share first (0.5 before a bigger memory with no share), then memory; a missing share sorts as 0", eq(R({ processes: [{ pid: 1, name: "bigmem", gpu_pct: null, vram_bytes: 9000 }, { pid: 2, name: "small", gpu_pct: 0.5, vram_bytes: 1 }, { pid: 3, name: "zero", gpu_pct: 0, vram_bytes: 5000 }] }).processes.map((x) => x.name), ["small", "bigmem", "zero"]));
    ok("readSnapshot: a process with a share and no memory is kept; one with memory and no share is kept", R({ processes: [{ pid: 1, name: "a", gpu_pct: 3 }, { pid: 2, name: "b", vram_bytes: 7 }] }).processes.length === 2);
    ok("readSnapshot: a share given as a string is null and, with no memory, drops the process", R({ processes: [{ pid: 1, name: "a", gpu_pct: "50" }] }).processes.length === 0);
}


// ---- 14. added after the second sweep of the watch ------------------------------------------------------------------------------------------------------
console.log("\n14. ADDED AFTER THE SECOND SWEEP OF THE WATCH");
{
    const smp = (phase, tMs, read) => ({ tMs, tookMs: 0, phase, read, gputaskman: { ok: true }, nvidiaSmi: { ok: false } });
    const rd = (...processes) => ({ utilGpuPct: null, smClockMHz: null, powerW: null, vramUsedBytes: null, processes });
    const pr = (name, gpuPct, vramBytes, runtimes = []) => ({ pid: 1, name, runtimes, gpuPct, vramBytes, engines: {} });
    const names = (list) => G.watchSummary([smp("during", 0, rd(...list))], null).programs.map((x) => x.name);
    ok("!! the runtimes of a program are sorted whatever order they were seen in (Vulkan in one sample, then Direct3D in the next)", eq(G.watchSummary([smp("during", 0, rd(pr("a", 5, 1, ["Vulkan"]))), smp("during", 1, rd(pr("a", 5, 1, ["Direct3D"])))], null).programs[0].runtimes, ["Direct3D", "Vulkan"]));
    ok("!! memory in MiB is bytes over 1048576 and rounds at the half: 105381888 bytes (100.5 MiB) reads 101, 105381800 (just under) reads 100", G.watchSummary([smp("during", 0, rd(pr("m", 5, 105381888)))], null).programs[0].vramPeakMiB === 101 && G.watchSummary([smp("during", 0, rd(pr("m", 5, 105381800)))], null).programs[0].vramPeakMiB === 100);
    ok("!! a program with a share of 0.5 comes before one with no share and more memory (a missing share is 0, not 1)", eq(names([pr("nulls", null, 500 * 1048576), pr("half", 0.5, 1048576)]), ["half", "nulls"]));
    ok("!! with equal shares a program with 0 MiB of memory ties with one with no figure, and then the NAME decides ('a' before 'b' whichever has the figure)", eq(names([pr("b", 5, null), pr("a", 5, 1000)]), ["a", "b"]) && eq(names([pr("a", 5, null), pr("b", 5, 1000)]), ["a", "b"]));
    ok("with equal shares more memory comes first, and a figure beats no figure", eq(names([pr("small", 5, 10 * 1048576), pr("big", 5, 20 * 1048576), pr("none", 5, null)]), ["big", "small", "none"]));
    ok("!! thirty programs that tie on everything come out in alphabetical order, ten of them, whatever order they went in", eq(names(Array.from({ length: 30 }, (_, i) => pr("p" + String(29 - i).padStart(2, "0"), 5, 1048576))), Array.from({ length: 10 }, (_, i) => "p" + String(i).padStart(2, "0"))));
    ok("!! the ordering does not depend on which of two programs came first: a share of 0.5 beats no share and a figure beats none, in BOTH insertion orders", eq(names([pr("half", 0.5, 1048576), pr("nulls", null, 500 * 1048576)]), ["half", "nulls"]) && eq(names([pr("fig", 5, 10 * 1048576), pr("nofig", 5, null)]), ["fig", "nofig"]) && eq(names([pr("nofig", 5, null), pr("fig", 5, 10 * 1048576)]), ["fig", "nofig"]) && eq(names([pr("a", 5, 1000), pr("b", 5, null)]), ["a", "b"]) && eq(names([pr("small", 5, 10 * 1048576), pr("big", 5, 20 * 1048576)]), ["big", "small"]) && eq(names([pr("big", 5, 20 * 1048576), pr("small", 5, 10 * 1048576)]), ["big", "small"]));
    ok("three hundred programs that tie on everything, in reverse and in forward order, come out alphabetical (the sort is exercised beyond a short list)", eq(names(Array.from({ length: 300 }, (_, i) => pr("p" + String(299 - i).padStart(3, "0"), 5, 1048576))), Array.from({ length: 10 }, (_, i) => "p" + String(i).padStart(3, "0"))) && eq(names(Array.from({ length: 300 }, (_, i) => pr("p" + String(i).padStart(3, "0"), 5, 1048576))), Array.from({ length: 10 }, (_, i) => "p" + String(i).padStart(3, "0"))));
    const R = G._readSnapshot;
    ok("!! readSnapshot: a process with ONE byte of memory and no share is kept; with a tie on share the one WITH a memory figure comes before one with none", R({ processes: [{ pid: 1, name: "tiny", gpu_pct: 0, vram_bytes: 1 }] }).processes.length === 1 && eq(R({ processes: [{ pid: 1, name: "nofig", gpu_pct: 5, vram_bytes: null }, { pid: 2, name: "fig", gpu_pct: 5, vram_bytes: 1 }] }).processes.map((x) => x.name), ["fig", "nofig"]));
    // the watch ends AT its end time with no further wait
    const w = watchWorld({ cost: 1000 }), { result } = await G.runWatch({ mode: "sample", seconds: 3, intervalMs: 1000 }, w.opts);
    ok("!! a sample that ENDS exactly at the end time is the last, and there is no wait after it: samples at 0, 1000, 2000 each costing 1000 ms, and two waits (of 0) between them, none after", eq(result.samples.map((x) => x.tMs), [0, 1000, 2000]) && w.sleeps.length === 2 && w.sleeps.every((x) => x === 0) && w.T.t === 3000);
}

clearTimeout(WATCHDOG);
console.log(fails ? `\ngpuTaskManBridge-selfcheck: ${fails} FAILED` : "\ngpuTaskManBridge-selfcheck: all checks pass");
if (fails) process.exit(1);
