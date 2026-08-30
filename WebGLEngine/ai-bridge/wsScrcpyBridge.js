// WebGLEngine/ai-bridge/wsScrcpyBridge.js -- v4144
//
// AN INSTALL BUTTON FOR NetrisTV/ws-scrcpy -- BROWSER-BASED ANDROID SCREEN MIRRORING AND CONTROL -- WHERE
// NOTHING OF THEIRS EVER ENTERS THIS TREE.
//
// Keith pasted a research dump comparing several Android remote-control projects and, asked which shape, chose
// "browser-based (ws-scrcpy-style)". Two real candidates were researched first, not guessed between: NetrisTV/
// ws-scrcpy itself (MIT, 2.5k stars, 492 commits, dependabot-patched, last commit 2026-08-24) and a fork,
// bilbospocketses/ws-scrcpy-web (GPL-3.0-only, 43 stars, a single-maintainer bus factor, a Rust-based Windows
// service/tray/auto-updater bolted on top). The fork's GPL-3.0 would obligate releasing this engine's own
// integrating code under GPL too if vendored or linked; NetrisTV's MIT has no such encumbrance, is the more
// maintained project by every measure that matters, and is 3x smaller with none of the fork's extra attack
// surface (an auto-updater that downloads and runs new code post-install). NetrisTV is the one built here.
//
// Same non-vendoring reasoning as grdpwasm and galaxy-profile: cloning a PUBLIC repo onto the user's OWN
// machine and running it as its own process is not distributing it. This bridge never copies their source into
// the tree or a release zip, never imports their TypeScript into this engine's process, never touches their
// LICENSE.
//
// *** AND THEN I ACTUALLY RAN THE BUILD, NOT JUST READ THE README, WHICH IS WHY THIS IS SHAPED LIKE IT IS. ***
// install() is FIVE real stages, not one `make`: clone, checkout the pinned commit, `npm install` at the repo
// root (measured here: 41s, 681 packages -- node-pty is a native module needing node-gyp + a C/C++ toolchain,
// and it compiled cleanly; a `postinstall` script also runs that tries to stage an optional iOS/Appium driver,
// which is harmless and self-skips when Appium isn't present, per its own header comment), `npm run dist`
// (webpack build, measured: ~20s, produces dist/index.js + dist/public/* + the vendored, prebuilt, UNMODIFIED
// Genymobile scrcpy-server.jar -- no JDK needed, upstream ships the jar already built), and a SECOND
// `npm install` INSIDE dist/ (measured: ~4s) because webpack marks dist/'s runtime deps (adbkit, express,
// node-pty, ws, ...) as external rather than bundling them, and ships dist/ with its own package.json.
//
// *** THE EXPOSURE IS REAL AND CANNOT BE MITIGATED WITHOUT PATCHING THEIR CODE, SO IT IS NOT MITIGATED. ***
// grdpwasm's proxy took a `-listen` flag this bridge could point at loopback using THEIR OWN mechanism,
// unmodified. ws-scrcpy's HttpServer.ts calls `server.listen(port, callback)` with NO host argument anywhere
// and no config field for one (Config.ts's ServerItem type has no `host` key) -- read directly, not assumed --
// so there is no flag, no env var, no config key that restricts the bind address. The default build config
// (webpack/default.build.config.json, unmodified here) also sets SCRCPY_LISTENS_ON_ALL_INTERFACES: true. There
// is ALSO no authentication of any kind: upstream's own README calls this out ("no login"). Patching either
// property would be modifying their code, which every install button on this shelf refuses to do. Keith's
// explicit choice, asked directly rather than assumed: auto-start on all interfaces, with a warning shown
// EVERY TIME rather than once -- see REFUSED and the page's own alarm card.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

const REPO = "https://github.com/NetrisTV/ws-scrcpy";
// Measured 2026-08-29 by cloning upstream unshallowed: 492 commits, master branch, last commit 2026-08-24.
const PINNED_COMMIT = "8855ad1184ec7b41f1b28d1b899856f828e09c3e";
const DEFAULT_BRANCH = "master";
const LICENSE = "MIT";

const UPSTREAM = Object.freeze({
    repo: REPO,
    commit: PINNED_COMMIT,
    branch: DEFAULT_BRANCH,
    committed: "2026-08-24",
    license: LICENSE,
    licenseVerified: "2026-08-29 -- LICENSE fetched from the master branch and read: 1059 bytes, \"Copyright " +
                     "(C) 2021 by Netris, JSC.\", MIT boilerplate. Not inferred from a badge.",
    what: "a web client for scrcpy: mirrors and controls an Android device (over adb/USB or Wi-Fi) from any " +
          "browser on the LAN, using WebSockets + a vendored, unmodified, prebuilt Genymobile scrcpy-server.jar",
    author: "Sergey Volkov (Netris, JSC)",
    consideredAndRejected: "bilbospocketses/ws-scrcpy-web (GPL-3.0-only, single-maintainer bus factor, an " +
                            "auto-updater that downloads and runs new code post-install) -- researched and " +
                            "compared before choosing this repo, not assumed to be the only option",
});

const MAINTENANCE = Object.freeze({
    commits: 492,
    tags: ["v0.6.1", "v0.7.0", "v0.7.1", "v0.8.0", "v0.8.1", "(HEAD is past the latest tag)"],
    branches: ["master"],
    lastCommit: "2026-08-24",
    howChecked: "git clone (unshallowed) " + REPO + ", then git rev-list --count / git branch -r / git tag",
});

const REFUSED = Object.freeze([
    { what: "vendoring ws-scrcpy's source into this tree or a release zip",
      why: "cloned onto the user's own machine, outside the tree, exactly as grdpwasm and galaxy-profile's " +
           "checkouts are. Nothing of theirs is imported into this engine's own process." },
    { what: "patching HttpServer.ts to accept a loopback-only bind address",
      why: "*** THE ONE THAT MATTERS. *** server.listen(port, callback) is called with no host argument " +
           "anywhere in their code, and Config.ts's ServerItem type has no host field to set one through -- " +
           "read directly from src/server/services/HttpServer.ts, not assumed. There is no flag, no env var, " +
           "no config key this bridge could pass to restrict it the way grdpwasm's -listen 127.0.0.1 does. " +
           "Adding one would mean editing their TypeScript and running a fork of their behaviour, which every " +
           "install button on this shelf refuses to do. Keith chose to accept the real exposure and show a " +
           "warning on every start instead of silently narrowing what upstream actually does." },
    { what: "patching webpack/default.build.config.json to turn off SCRCPY_LISTENS_ON_ALL_INTERFACES",
      why: "that flag ships true in upstream's own default build config, used here UNMODIFIED. Same reasoning " +
           "as the bind-address entry above: changing it would be running code that is no longer theirs." },
    { what: "adding authentication in front of their server",
      why: "upstream's own README states there is none by design (\"no login\"). Bolting a login page on top " +
           "would be new attack surface this bridge did not review, and would misrepresent what a person " +
           "clicking through to upstream's own docs would find. The warning names this instead of hiding it." },
    { what: "running any commit other than the pinned one without a deliberate edit here",
      why: "this is source that gets built and EXECUTED, with network exposure by default. Cloning master and " +
           "running whatever is there today means upstream's next push runs unreviewed on a real machine " +
           "tomorrow. PINNED_COMMIT only moves when this file is edited to move it." },
    { what: "leaving the server running after the engine stops",
      why: "an unauthenticated, all-interfaces screen-control server nobody remembers starting is the hazard " +
           "this bridge's stop() exists to avoid. The child is spawned WITHOUT detached, so it dies with this " +
           "process, same as grdpwasm's proxy." },
]);

// Overridable for the gate, same convention as grdpwasmBridge's GRDPWASM_SRC_DIR.
const SRC_DIR = process.env.WS_SCRCPY_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "ws-scrcpy");
const DEFAULT_PORT = 8000; // upstream's own default (Config.ts's DEFAULT_PORT) -- kept, not renumbered, since
                            // there is no bind-address protection to lose by matching their own default.

// Every artefact `npm run dist` + the dist-local `npm install` are supposed to produce, checked by EXISTENCE.
const ARTEFACTS = [
    "dist/index.js", "dist/package.json",
    "dist/public/index.html", "dist/public/bundle.js",
    "dist/vendor/Genymobile/scrcpy/scrcpy-server.jar",
    "dist/node_modules/express", "dist/node_modules/ws",
];

let _job = null;      // one install job at a time
let _proc = null;     // the running server, if any
let _procInfo = null; // { port, startedAt, log[] }

function _appendLog(s) { if (_job) { _job.log.push(s); if (_job.log.length > 600) _job.log.shift(); } }

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
        const child = execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 20000 }, opts || {}),
            (err) => { if (done) return; done = true; res(!err); });
        child.on("error", () => { if (done) return; done = true; res(false); });
    });
}

/** Every artefact both build stages are supposed to produce, checked by EXISTENCE rather than exit code. */
function built() {
    return ARTEFACTS.every((rel) => fs.existsSync(path.join(SRC_DIR, rel)));
}

function _npmInstallDist() {
    _appendLog("[install] npm install inside dist/ (runtime-only deps: adbkit, express, node-pty, ws, ...)\n");
    _runStep("npm-install-dist", "npm", ["install", "--no-audit", "--no-fund"], { cwd: path.join(SRC_DIR, "dist") },
        (code) => {
            _job.done = true; _job.code = code;
            if (code === 0 && !built()) {
                _job.code = -1;
                _appendLog("[install] npm reported success but an expected artefact is missing: " +
                           ARTEFACTS.filter((r) => !fs.existsSync(path.join(SRC_DIR, r))).join(", ") + "\n");
            }
        });
}

function _webpackDist() {
    _appendLog("[install] npm run dist -- webpack production build (measured here: ~20s)\n");
    _runStep("dist", "npm", ["run", "dist"], { cwd: SRC_DIR }, (code) => {
        if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] webpack build failed (" + code + ")\n"); return; }
        _npmInstallDist();
    });
}

function _npmInstallRoot() {
    _appendLog("[install] npm install (root) -- pulls devDependencies for the build; node-pty needs a C/C++ " +
               "toolchain (node-gyp) and compiled cleanly when this was measured (~41s, 681 packages). A " +
               "postinstall script tries to stage an optional iOS/Appium driver and self-skips if Appium " +
               "isn't present; it never fails the install.\n");
    _runStep("npm-install-root", "npm", ["install", "--no-audit", "--no-fund"], { cwd: SRC_DIR }, (code) => {
        if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] root npm install failed (" + code + ")\n"); return; }
        _webpackDist();
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
        _npmInstallRoot();
    });
}

/**
 * Clone (or reuse) upstream, pin to the reviewed commit, `npm install`, `npm run dist`, then `npm install`
 * again inside dist/. Returns as soon as the job STARTS; the panel polls installStatus(), the same fire-and-
 * poll shape grdpwasmBridge/galaxyProfileBridge use. FIVE real stages, not simulated -- see this file's header
 * for what each one was measured to actually do.
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
                              ms: Date.now() - _job.startedAt, log: _job.log.join("").slice(-10000) } };
}

async function adbAvailable() {
    return _run("adb", ["version"]);
}

/**
 * Start their server. NO host override exists to pass -- see REFUSED. Not detached: a server nobody remembers
 * starting is the hazard this bridge's stop() exists to avoid, same as grdpwasm.
 */
function start(o = {}) {
    if (_proc) return { ok: false, error: "already running", running: status().running };
    if (!built()) return { ok: false, error: "not built yet -- run install() first" };
    const port = Math.min(65535, Math.max(1, parseInt(o.port, 10) || DEFAULT_PORT));
    let child;
    try {
        child = spawn(process.execPath, ["index.js"],
                      { cwd: path.join(SRC_DIR, "dist"), env: Object.assign({}, process.env, { PORT: String(port) }), windowsHide: true });
    } catch (e) { return { ok: false, error: "spawn failed: " + ((e && e.message) || e) }; }
    _proc = child;
    _procInfo = { port, startedAt: Date.now(), log: [] };
    const cap = (b) => { _procInfo.log.push(b.toString()); if (_procInfo.log.length > 200) _procInfo.log.shift(); };
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    child.on("exit", () => { _proc = null; });
    child.on("error", () => { _proc = null; });
    return {
        ok: true, url: "http://127.0.0.1:" + port + "/", port,
        // ALWAYS a warning -- there is no configuration under which this is loopback-only. See REFUSED.
        warning: "BOUND TO ALL INTERFACES (no loopback option exists upstream, see REFUSED). Anything on this " +
                 "LAN that reaches port " + port + " can view AND CONTROL any Android device this server can " +
                 "see over adb -- there is no login. Stop it when you are not actively using it.",
    };
}

function stop() {
    if (!_proc) return { ok: true, running: false, note: "nothing was running" };
    try { _proc.kill(); } catch {}
    return { ok: true, stopping: true, verifyWith: "status().running" };
}

async function status() {
    const cloned = fs.existsSync(path.join(SRC_DIR, ".git"));
    return {
        ok: true,
        srcDir: SRC_DIR,
        cloned,
        built: cloned && built(),
        missingArtefacts: cloned ? ARTEFACTS.filter((r) => !fs.existsSync(path.join(SRC_DIR, r))) : ARTEFACTS,
        adbAvailable: await adbAvailable(),
        running: !!_proc,
        port: _proc && _procInfo ? _procInfo.port : null,
        url: _proc && _procInfo ? "http://127.0.0.1:" + _procInfo.port + "/" : null,
        defaultPort: DEFAULT_PORT,
        upstream: UPSTREAM,
        maintenance: MAINTENANCE,
        refused: REFUSED,
        installJob: installStatus().job,
    };
}

module.exports = { install, installStatus, status, start, stop, built, adbAvailable,
                   UPSTREAM, MAINTENANCE, REFUSED, REPO, PINNED_COMMIT, DEFAULT_BRANCH,
                   SRC_DIR, DEFAULT_PORT, ARTEFACTS };
