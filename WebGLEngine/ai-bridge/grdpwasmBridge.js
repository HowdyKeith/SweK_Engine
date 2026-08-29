// WebGLEngine/ai-bridge/grdpwasmBridge.js -- v4138
//
// AN INSTALL BUTTON FOR nakagami/grdpwasm -- AN RDP CLIENT THAT RUNS IN THE BROWSER -- WHERE NOTHING OF THEIRS
// EVER ENTERS THIS TREE.
//
// Keith pointed at the repo. It is the same shape as galaxy-profile's button and the reasoning is v4124's,
// unchanged: GPL-3.0's obligations are about DISTRIBUTING the code or LINKING it into your own program, not
// about automating a `git clone` of a PUBLIC repo onto the user's OWN machine and running it as its own
// process. This bridge never copies their source into the tree or a release zip, never imports their Go into
// this engine, and never touches their LICENSE. It shells out to `make`, then spawns their binary.
//
// *** AND THEN I READ proxy/main.go, WHICH IS THE WHOLE REASON THIS FILE LOOKS DIFFERENT FROM ITS SIBLINGS. ***
// It is 110 lines and it does three things that are individually reasonable and jointly an OPEN TCP RELAY:
//
//     listen := flag.String("listen", ":8080", ...)          // ALL interfaces, not loopback
//     upgrader.CheckOrigin = func(r) bool { return true }    // any origin may open the WebSocket
//     target := r.URL.Query().Get("target"); dialer.Dial("tcp", target)   // caller picks the destination
//
// So anything that can reach the port can ask that process to open a TCP connection to any host:port the
// machine can see -- including hosts behind the rig's own firewall that the asker cannot reach directly. That
// is a textbook pivot. IT IS NOT A BUG IN THEIR PROJECT: the README says `make serve` and browse to
// localhost:8080, and for a tool you run on your own desktop for a minute this is the correct amount of
// ceremony. It only becomes a problem the moment a button starts it unattended on a machine that sits on a
// LAN, which is exactly what this bridge would otherwise do.
//
// *** SO IT IS LAUNCHED ON LOOPBACK, AND THAT IS AN ARGUMENT RATHER THAN A PATCH. *** `-listen 127.0.0.1:PORT`
// uses THEIR OWN FLAG, the one they wrote for this purpose. Their code is unmodified, unvendored, unpatched --
// this bridge simply declines to pass the argument that publishes it to the network. Choosing a flag value is
// not forking somebody's project, and it is the difference between "a remote desktop client on your desktop"
// and "an unauthenticated relay on your network". The bind address is overridable, because refusing to let the
// user make their own decision on their own machine would be a different kind of dishonesty -- but it is
// overridden DELIBERATELY, never by default, and status() always reports what it is actually bound to.
//
// WHAT IT TOUCHES, MEASURED BY READING THE SOURCE RATHER THAN THE README: the proxy dials exactly one place --
// whatever `target` the page asks for, which is the RDP host the user types into their own browser. There is
// no telemetry, no analytics, no callback. The BUILD is where the network goes: go.mod declares `go 1.26.3`
// (not the 1.24 the README claims), so the Go toolchain downloads itself, plus four modules -- gorilla/
// websocket, nakagami/grdp, lunixbochs/struc, golang.org/x/crypto. Measured on this box: the whole build
// produced a 10.5 MB static/main.wasm and a 9.4 MB proxy/proxy in a few minutes from a cold module cache.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

const REPO = "https://github.com/nakagami/grdpwasm";
// Measured 2026-08-29 by cloning upstream unshallowed: 25 commits, TWO branches (master and clipboard), no
// tags, last commit 2026-08-23. *** THE DEFAULT BRANCH IS `master`, NOT `main` *** -- raw.githubusercontent
// 404s on main, which is the sort of detail that turns a clone into a confusing failure six months from now.
const PINNED_COMMIT = "e10016bae8253111973d368722520e6c48e54c05";
const DEFAULT_BRANCH = "master";
const LICENSE = "GPL-3.0";

const UPSTREAM = Object.freeze({
    repo: REPO,
    commit: PINNED_COMMIT,
    branch: DEFAULT_BRANCH,
    committed: "2026-08-23",
    license: LICENSE,
    licenseVerified: "2026-08-29 -- LICENSE fetched from the master branch and read: 35146 bytes, GNU GENERAL " +
                     "PUBLIC LICENSE Version 3, FSF boilerplate. Not inferred from a badge.",
    what: "a web-based RDP client: Go compiled to WebAssembly speaks RDP in the browser, and a small Go proxy " +
          "bridges its WebSocket to the RDP server's TCP port",
    author: "nakagami",
    upstreamOf: "github.com/nakagami/grdp, the RDP protocol library this is built on and inherits GPLv3 from",
});

const MAINTENANCE = Object.freeze({
    commits: 25,
    tags: 0,
    branches: ["master", "clipboard"],
    lastCommit: "2026-08-23",
    howChecked: "git clone (unshallowed) " + REPO + ", then git rev-list --count / git branch -r / git tag",
});

const REFUSED = Object.freeze([
    { what: "vendoring grdpwasm's source into this tree or a release zip",
      why: "GPL-3.0 is copyleft and this engine publishes public release zips under its own terms. Nothing of " +
           "theirs is copied -- it is cloned onto the user's own machine, outside the tree, exactly as " +
           "galaxy-profile and voxtral's engine are." },
    { what: "binding the proxy to all interfaces, which is upstream's own default",
      why: "*** THE ONE THAT MATTERS. *** proxy/main.go defaults to `:8080`, accepts WebSocket upgrades from " +
           "ANY origin (CheckOrigin returns true), and dials whatever host:port the query string names. Those " +
           "three together are an unauthenticated open TCP relay: anything that can reach the port can pivot " +
           "through it to hosts behind the machine's firewall. Fine for `make serve` on your own desktop for a " +
           "minute -- not fine started by a button on a box that lives on a LAN. Launched on 127.0.0.1 using " +
           "THEIR OWN -listen flag; their code is not modified, patched or forked." },
    { what: "storing RDP hostnames, usernames or passwords",
      why: "the credentials are typed into their page, in the user's browser, and go to the RDP server through " +
           "the proxy. This bridge never sees them, never logs them and has nowhere to put them." },
    { what: "leaving the proxy running after the engine stops",
      why: "a relay nobody remembers starting is the same hazard as one bound to the world. stop() kills the " +
           "child, and the child is spawned WITHOUT detached so it dies with this process." },
    { what: "running any commit other than the pinned one without a deliberate edit here",
      why: "this is SOURCE that gets built and EXECUTED. Cloning master and running whatever is there today " +
           "means upstream's next push runs unreviewed on a real machine tomorrow. PINNED_COMMIT only moves " +
           "when this file is edited to move it." },
]);

// Overridable for the gate, same convention as galaxyProfileBridge's GALAXY_PROFILE_SRC_DIR.
const SRC_DIR = process.env.GRDPWASM_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "grdpwasm");

// NOT 8080. Upstream's default collides with half the dev tools ever written, and this one is a relay -- a
// collision that silently attaches a browser to the WRONG listener is worse here than it would be elsewhere.
const DEFAULT_PORT = 8088;
const LOOPBACK = "127.0.0.1";

const ARTEFACTS = ["static/main.wasm", "static/wasm_exec.js", "proxy/proxy"];

let _job = null;      // one install job at a time
let _proc = null;     // the running proxy, if any
let _procInfo = null; // { host, port, startedAt, log[] }

function _appendLog(s) { if (_job) { _job.log.push(s); if (_job.log.length > 400) _job.log.shift(); } }

function _runStep(kind, cmd, args, opts, onDone) {
    _job.kind = kind;
    let child;
    try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
    catch (e) { _job.done = true; _job.code = -1; _appendLog("[spawn error] " + ((e && e.message) || e) + "\n"); return; }
    const cap = (b) => _appendLog(b.toString());
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    child.on("exit", (code) => { if (onDone) onDone(code); else { _job.done = true; _job.code = code; } });
    child.on("error", (e) => { _job.done = true; _job.code = -1; _appendLog("[spawn error] " + ((e && e.message) || e) + "\n"); });
}

function _run(cmd, args, opts) {
    return new Promise((res) => {
        let done = false;
        const child = execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, opts || {}),
            (err, stdout, stderr) => { if (done) return; done = true; res({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? " " + ((err && err.message) || err) : "") }); });
        child.on("error", (e) => { if (done) return; done = true; res({ ok: false, out: "", err: String((e && e.message) || e) }); });
    });
}

/** Every artefact `make all` is supposed to produce, checked by EXISTENCE rather than by the make exit code. */
function built() {
    return ARTEFACTS.every((rel) => fs.existsSync(path.join(SRC_DIR, rel)));
}

function _make() {
    _appendLog("[install] building -- go.mod declares go 1.26.3, so the toolchain may download itself first\n");
    // GOFLAGS=-mod=mod: the repo ships go.sum, and a read-only module mode turns a first build into a
    // confusing failure about an unwritable cache rather than a download.
    _runStep("make", "make", ["all"], { cwd: SRC_DIR, env: Object.assign({}, process.env, { GOFLAGS: "-mod=mod" }) },
        (code) => {
            _job.done = true; _job.code = code;
            if (code === 0 && !built()) {
                _job.code = -1;
                _appendLog("[install] make reported success but an expected artefact is missing: " +
                           ARTEFACTS.filter((r) => !fs.existsSync(path.join(SRC_DIR, r))).join(", ") + "\n");
            }
        });
}

function _checkoutPinned() {
    _appendLog("[install] checking out pinned commit " + PINNED_COMMIT.slice(0, 12) + "...\n");
    _runStep("checkout", "git", ["checkout", PINNED_COMMIT], { cwd: SRC_DIR }, (code) => {
        if (code !== 0) {
            _job.done = true; _job.code = code;
            _appendLog("[install] checkout of the pinned commit failed (" + code + ") -- the clone may be shallow, " +
                       "or the commit may no longer exist upstream\n");
            return;
        }
        _make();
    });
}

/**
 * Clone (or reuse) upstream, pin to the reviewed commit, then `make all`. Returns as soon as the job STARTS;
 * the panel polls installStatus(), the same fire-and-poll shape galaxyProfileBridge and voxtralBridge use.
 *
 * A FULL clone, not shallow: `git checkout <sha>` needs that commit's history reachable, which `--depth 1`
 * of a moving branch does not guarantee.
 */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install is already running", job: installStatus().job };
    _job = { kind: "clone", log: [], done: false, code: null, startedAt: Date.now() };
    try { fs.mkdirSync(path.dirname(SRC_DIR), { recursive: true }); } catch {}
    if (fs.existsSync(path.join(SRC_DIR, ".git"))) {
        _appendLog("[install] reusing the existing clone at " + SRC_DIR + "\n");
        _checkoutPinned();
    } else {
        _appendLog("[install] cloning " + REPO + " (branch " + DEFAULT_BRANCH + ") into " + SRC_DIR + "\n");
        _runStep("clone", "git", ["clone", "--branch", DEFAULT_BRANCH, REPO + ".git", SRC_DIR], {}, (code) => {
            if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] clone failed (" + code + ")\n"); return; }
            _checkoutPinned();
        });
    }
    return { ok: true, started: true, srcDir: SRC_DIR };
}

function installStatus() {
    if (!_job) return { ok: true, job: null };
    return { ok: true, job: { kind: _job.kind, done: _job.done, code: _job.code,
                              ms: Date.now() - _job.startedAt, log: _job.log.join("").slice(-8000) } };
}

/**
 * Start their proxy. `host` defaults to LOOPBACK and the caller has to mean it to change that -- see REFUSED.
 * Not detached: a relay that outlives the engine that started it is the hazard this bridge exists to avoid.
 */
function start(o = {}) {
    if (_proc) return { ok: false, error: "already running", running: status().running };
    if (!built()) return { ok: false, error: "not built yet -- run install() first" };
    const port = Math.min(65535, Math.max(1, parseInt(o.port, 10) || DEFAULT_PORT));
    const host = typeof o.host === "string" && o.host.trim() ? o.host.trim() : LOOPBACK;
    const listen = host + ":" + port;
    const bin = path.join(SRC_DIR, "proxy", "proxy");
    let child;
    try {
        child = spawn(bin, ["-listen", listen, "-static", path.join(SRC_DIR, "static")],
                      { cwd: SRC_DIR, windowsHide: true });
    } catch (e) { return { ok: false, error: "spawn failed: " + ((e && e.message) || e) }; }
    _proc = child;
    _procInfo = { host, port, listen, startedAt: Date.now(), log: [] };
    const cap = (b) => { _procInfo.log.push(b.toString()); if (_procInfo.log.length > 200) _procInfo.log.shift(); };
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    child.on("exit", () => { _proc = null; });
    child.on("error", () => { _proc = null; });
    return { ok: true, url: "http://" + (host === "0.0.0.0" ? LOOPBACK : host) + ":" + port + "/",
             listen, loopbackOnly: host === LOOPBACK,
             warning: host === LOOPBACK ? undefined
                 : "BOUND BEYOND LOOPBACK (" + listen + "). This proxy accepts any origin and dials any " +
                   "host:port a caller names -- on a reachable interface that is an open TCP relay." };
}

function stop() {
    if (!_proc) return { ok: true, running: false, note: "nothing was running" };
    try { _proc.kill(); } catch {}
    // The handle is KEPT and the exit listener above clears it -- a kill SENDS a signal, and nulling the
    // reference here would destroy the only way to find out whether it landed (v4132's rule, same as
    // pairlaneBridge.stop()).
    return { ok: true, stopping: true, verifyWith: "status().running" };
}

function status() {
    const cloned = fs.existsSync(path.join(SRC_DIR, ".git"));
    return {
        ok: true,
        srcDir: SRC_DIR,
        cloned,
        built: cloned && built(),
        missingArtefacts: cloned ? ARTEFACTS.filter((r) => !fs.existsSync(path.join(SRC_DIR, r))) : ARTEFACTS,
        running: !!_proc,
        listen: _proc && _procInfo ? _procInfo.listen : null,
        loopbackOnly: _proc && _procInfo ? _procInfo.host === LOOPBACK : null,
        url: _proc && _procInfo ? "http://" + LOOPBACK + ":" + _procInfo.port + "/" : null,
        defaultPort: DEFAULT_PORT,
        upstream: UPSTREAM,
        maintenance: MAINTENANCE,
        refused: REFUSED,
        installJob: installStatus().job,
    };
}

module.exports = { install, installStatus, status, start, stop, built,
                   UPSTREAM, MAINTENANCE, REFUSED, REPO, PINNED_COMMIT, DEFAULT_BRANCH,
                   SRC_DIR, DEFAULT_PORT, LOOPBACK, ARTEFACTS };
