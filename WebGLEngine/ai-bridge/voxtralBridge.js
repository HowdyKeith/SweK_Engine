// WebGLEngine/ai-bridge/voxtralBridge.js -- v4116
//
// THE INSTALL BUTTON FOR voxtral.html'S ENGINE: clone, VERIFY, stage. Keith: "we have a button to do the
// install?" -- after v4115 shipped the page with the clone-and-copy written out as two shell lines for a
// person to run. A feature whose setup is a paste-this-into-a-terminal is a feature most people will not use.
//
// *** IT STAGES OUTSIDE THE TREE, AND THAT IS THE WHOLE REASON THIS FILE EXISTS RATHER THAN A COPY INTO
// vendor/. *** v4115's argument for not vendoring the 9.4 MB engine was that it would become the biggest file
// in a repo that publishes public release zips. MEASURED, not assumed: packagerBridge's SKIP_DIRS is
// node_modules, .git, __pycache__, asset_library, tts-out, doc-out, .kpop-wav -- `vendor/` IS NOT IN IT, so an
// install button that copied into vendor/voxtral/ would put 9.4 MB into every release from then on and quietly
// undo the reason the page was built the way it was. So the engine lands in ~/.voxelbridge/voxtral-engine,
// outside the tree entirely, and the bridge SERVES it. Same rule sharpBridge states for its checkout and
// githubBridge for its token: a file that is not in the tree cannot be swept into a release by anything.
//
// *** AND IT VERIFIES BEFORE IT STAGES, WHICH IS THE POINT OF HAVING PINNED DIGESTS AT ALL. *** The page
// already refuses bytes that do not match. Doing the same check HERE means a clone of an upstream that has
// moved past the pinned commit fails at install time, with a message naming the mismatch, instead of staging
// wrong bytes that the page then silently refuses later for reasons the person cannot see from the button.
// The digests are IMPORTED from ui/voxtralBrowser.js rather than retyped -- a pinned hash written twice is a
// pinned hash that will disagree with itself one day, which is the rule the page's own gate already enforces.
//
// *** THE BRIDGE IS A CONVENIENCE AND NEVER A REQUIREMENT. *** voxtral.html's whole point is that it needs no
// bridge, no local server and no Windows; if this file is missing, the server does not route it, or the user
// is on a box with no git, the page still works through its file picker. Nothing here may become load-bearing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const REPO = "https://github.com/TrevorS/voxtral-mini-realtime-rs";
// Overridable for the gate, same convention as sharpBridge's SHARP_SRC_DIR.
const SRC_DIR = process.env.VOXTRAL_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "voxtral-src");
const ENGINE_DIR = process.env.VOXTRAL_ENGINE_DIR || path.join(os.homedir(), ".voxelbridge", "voxtral-engine");
// Where the two artefacts live inside upstream's checkout -- the ASR space, not space-tts (TTS is refused by
// the page at RTF 104, so staging it would be staging something nothing can use).
const PKG_SUBDIR = path.join("space", "pkg");

let _job = null;   // one install job at a time; { kind, log[], done, code, startedAt }

/**
 * The pinned artefacts, read from the page's own module so there is ONE definition. Dynamic import because
 * that module is ESM and this bridge is CJS; cached after the first call.
 */
let _artefacts = null;
async function artefacts() {
    if (_artefacts) return _artefacts;
    const m = await import("../ui/voxtralBrowser.js");
    _artefacts = m.ARTEFACTS;
    return _artefacts;
}

/** The only two names this bridge will ever read or serve. A whitelist, so no caller can walk the disk. */
async function artefactNames() { const a = await artefacts(); return Object.values(a).map((x) => x.name); }

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

function sha256File(abs) {
    try { return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"); }
    catch { return null; }
}

/**
 * Copy the two artefacts out of the checkout -- but ONLY after each one's digest matches the pin.
 *
 * A mismatch is a REFUSAL and the job fails, rather than staging bytes the page will reject later. The message
 * names the likely cause, because "upstream moved past the pinned commit" is a thing a person can act on and
 * "sha mismatch" on its own is not.
 */
async function _stage() {
    const art = await artefacts();
    try { fs.mkdirSync(ENGINE_DIR, { recursive: true }); }
    catch (e) { _job.done = true; _job.code = -1; _appendLog("[stage] cannot create " + ENGINE_DIR + ": " + ((e && e.message) || e) + "\n"); return; }

    const staged = [];
    for (const a of Object.values(art)) {
        const src = path.join(SRC_DIR, PKG_SUBDIR, a.name);
        if (!fs.existsSync(src)) {
            _job.done = true; _job.code = -1;
            _appendLog("[stage] MISSING in the checkout: " + src + "\n" +
                       "        upstream's layout may have changed since the pinned commit.\n");
            return;
        }
        const got = sha256File(src);
        if (got !== a.sha256) {
            _job.done = true; _job.code = -1;
            _appendLog("[stage] REFUSED " + a.name + " -- digest does not match the pin.\n" +
                       "        expected " + a.sha256 + "\n" +
                       "        got      " + got + "\n" +
                       "        Nothing was staged. The most likely cause is that upstream has moved past the\n" +
                       "        pinned commit; the page will only ever execute the build these digests describe.\n");
            return;
        }
        try { fs.copyFileSync(src, path.join(ENGINE_DIR, a.name)); }
        catch (e) { _job.done = true; _job.code = -1; _appendLog("[stage] copy failed: " + ((e && e.message) || e) + "\n"); return; }
        staged.push(a.name + " (" + got.slice(0, 12) + "..., verified)");
    }
    _appendLog("[stage] verified and staged into " + ENGINE_DIR + ":\n  " + staged.join("\n  ") + "\n");
    _job.done = true; _job.code = 0;
}

/**
 * Clone (or reuse) upstream, then verify and stage. Returns the moment the job STARTS -- the panel polls
 * status().installJob, the same fire-and-poll shape sharpBridge and autoInstall use.
 *
 * An existing checkout SKIPS the clone, so a failed stage can be retried without re-downloading: the same
 * "resume rather than restart" the rest of this tree's installers use.
 */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install job is already running (" + _job.kind + ")" };
    try { fs.mkdirSync(path.dirname(SRC_DIR), { recursive: true }); }
    catch (e) { return { ok: false, error: "cannot create " + path.dirname(SRC_DIR) + ": " + ((e && e.message) || e) }; }

    _job = { kind: "clone", log: [], done: false, code: null, startedAt: Date.now() };
    if (!fs.existsSync(path.join(SRC_DIR, ".git"))) {
        _appendLog("[install] cloning " + REPO + " (shallow) into " + SRC_DIR + "\n");
        _runStep("clone", "git", ["clone", "--depth", "1", REPO, SRC_DIR], { cwd: path.dirname(SRC_DIR) },
            (code) => {
                if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] clone failed (" + code + ")\n"); return; }
                _job.kind = "verify";
                _stage().catch((e) => { _job.done = true; _job.code = -1; _appendLog("[stage] " + ((e && e.message) || e) + "\n"); });
            });
    } else {
        _appendLog("[install] checkout already present, skipping the clone\n");
        _job.kind = "verify";
        _stage().catch((e) => { _job.done = true; _job.code = -1; _appendLog("[stage] " + ((e && e.message) || e) + "\n"); });
    }
    return { ok: true, kind: _job.kind };
}

/** null when nothing has ever run; otherwise the live/finished state of the one job this bridge tracks. */
function installStatus() {
    return _job ? { kind: _job.kind, done: _job.done, code: _job.code,
                    uptimeMs: Date.now() - _job.startedAt, tail: _job.log.slice(-14).join("") } : null;
}

/**
 * What is staged right now, checked by DIGEST rather than by the file merely existing -- a truncated or
 * half-copied file is exactly the thing "it's there" would call installed.
 */
async function status() {
    const art = await artefacts();
    const files = Object.values(art).map((a) => {
        const abs = path.join(ENGINE_DIR, a.name);
        const there = fs.existsSync(abs);
        const got = there ? sha256File(abs) : null;
        return { name: a.name, present: there, bytes: there ? fs.statSync(abs).size : 0,
                 verified: got === a.sha256, expected: a.sha256, got };
    });
    return {
        ok: true, repo: REPO, engineDir: ENGINE_DIR, srcDir: SRC_DIR,
        installed: files.every((f) => f.verified),
        files, installJob: installStatus(),
        note: "staged OUTSIDE the engine tree on purpose -- vendor/ is not in the packager's SKIP_DIRS, so " +
              "installing there would add 9.4 MB to every release zip. The page works without this bridge.",
    };
}

/**
 * Absolute path of one staged artefact, for the server to serve -- or null.
 * *** NAME IS MATCHED AGAINST THE WHITELIST, NEVER JOINED FROM USER INPUT. *** A request path is attacker-
 * controlled, so `path.join(ENGINE_DIR, req)` would be a directory traversal waiting to happen; only the two
 * names the pinned artefacts declare can ever resolve, and anything else is null before touching the disk.
 */
async function engineFile(name) {
    const names = await artefactNames();
    if (!names.includes(name)) return null;
    const abs = path.join(ENGINE_DIR, name);
    return fs.existsSync(abs) ? abs : null;
}

module.exports = { install, installStatus, status, engineFile, artefactNames,
                   REPO, SRC_DIR, ENGINE_DIR, PKG_SUBDIR };
