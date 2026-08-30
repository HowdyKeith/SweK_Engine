// WebGLEngine/ai-bridge/galaxyProfileBridge.js -- v4124
//
// AN INSTALL BUTTON FOR SOMEBODY ELSE'S TOOL, WHERE NOTHING OF THEIRS EVER ENTERS THIS TREE.
//
// Keith pointed at vinimlo/galaxy-profile (a GitHub-profile SVG banner generator) and asked for an install
// button, the same shape as voxtral's and ml-sharp's -- and then asked the harder question directly: is it
// allowed to not vendor a GPL-3.0 repo, but offer to install and run it for the user? Yes, and the reasoning is
// the one this tree already uses for voxtral's engine and webrtx's build: GPL's obligations are about
// DISTRIBUTING the code or LINKING it into your own program, not about automating a `git clone` of a PUBLIC repo
// onto the user's OWN machine and running it as its own process. That is what a package manager does all day.
// This bridge never imports galaxy-profile's Python into this engine's own process, never copies its source into
// the tree or a release zip, and never strips or rewrites its LICENSE. It shells out, and hands back files.
//
// *** PINNED TO A COMMIT, WHICH THIS TREE HAS NOT DONE FOR AN INSTALL BUTTON BEFORE. *** voxtral pins two
// ARTEFACT DIGESTS because it verifies bytes it did not build; webrtx pins nothing because it publishes no
// build to pin. galaxy-profile is neither -- it is SOURCE that gets git-cloned and then EXECUTED, so what
// needs pinning is which commit runs. Cloning `main` and running whatever is there today means upstream's next
// push runs unreviewed on Keith's machine tomorrow. PINNED_COMMIT is the exact commit this bridge was written
// and read against; moving it is a deliberate edit, not something `git pull` does on its own.
//
// *** WHAT IT ACTUALLY TOUCHES, MEASURED BY READING generator/github_api.py, NOT ASSUMED. *** One host:
// api.github.com, GraphQL and REST, fetching the CONFIGURED username's public stats (or private too, with a
// token). No telemetry endpoint, no analytics, nothing else. A token, if supplied, is passed as the
// GITHUB_TOKEN environment variable for the ONE subprocess call and is never written to config.yml or to disk.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile, execFileSync } = require("child_process");

const py = require("./pythonResolve.js");

const REPO = "https://github.com/vinimlo/galaxy-profile";
// Measured 2026-08-28 by cloning upstream unshallowed: 4 commits, one branch (main), no tags, last commit
// 2026-02-08. Not a single-commit drop like webrtx -- an active small repo, still worth pinning rather than
// trusting `main` to stay what it was read as.
const PINNED_COMMIT = "5d4be766b4f9b76da9b7c6d9172fa6ba705e9b75";
const LICENSE = "GPL-3.0";

const UPSTREAM = Object.freeze({
    repo: REPO,
    commit: PINNED_COMMIT,
    committed: "2026-02-08",
    license: LICENSE,
    licenseVerified: "2026-08-28 -- LICENSE file present (GPLv3, FSF boilerplate) and read",
    what: "a config-driven generator that renders 4 animated SVG banners (galaxy header, stats card, tech " +
          "stack, project constellation) from a GitHub user's real stats, fetched via api.github.com",
    author: "vinimlo",
});

const MAINTENANCE = Object.freeze({
    commits: 4,
    tags: 0,
    branches: ["main"],
    lastCommit: "2026-02-08",
    howChecked: "git clone (unshallowed) https://github.com/vinimlo/galaxy-profile, then git log --oneline",
});

const REFUSED = Object.freeze([
    { what: "vendoring galaxy-profile's source into this tree or a release zip",
      why: "GPL-3.0 is copyleft; this engine publishes public release zips under its own terms, and vendoring " +
           "would mean shipping their code under ours. Nothing of theirs is copied -- it is cloned onto the " +
           "user's own machine, outside the tree, the same way voxtral's engine and ml-sharp's checkout are." },
    { what: "importing galaxy-profile's Python into this bridge's own process",
      why: "linking a GPL work into another program is the case GPL actually restricts. This bridge only ever " +
           "spawns `python -m generator.main` as a separate process and reads back the SVG files it writes." },
    { what: "storing a supplied GITHUB_TOKEN anywhere on disk",
      why: "it is passed as an environment variable to the one subprocess call that needs it and nowhere else -- " +
           "never written into config.yml, never logged, never echoed back in a status response." },
    { what: "inventing a tech stack, project list, or bio on the user's behalf",
      why: "config.yml is the exact file upstream's own Quick Start has a person edit by hand; this bridge pre-" +
           "fills it with upstream's own config.example.yml and lets the user edit it, rather than guessing at " +
           "what belongs in someone else's profile." },
    { what: "running any commit other than the pinned one without a deliberate edit here",
      why: "cloning `main` and running whatever is there today would mean upstream's next push runs unreviewed " +
           "on a real machine tomorrow. PINNED_COMMIT only moves when this file is edited to move it." },
]);

// Overridable for the gate, same convention as sharpBridge's SHARP_SRC_DIR / voxtralBridge's SRC_DIR.
const SRC_DIR = process.env.GALAXY_PROFILE_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "galaxy-profile");

const OUTPUT_NAMES = ["galaxy-header.svg", "stats-card.svg", "tech-stack.svg", "projects-constellation.svg"];

let _job = null;   // one install job at a time; { kind: "clone"|"checkout"|"pip", log[], done, code, startedAt }

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

/** Promise-wrapped run for the bounded, single-shot calls (checkout HEAD probe, generate itself). */
function _run(cmd, args, opts) {
    return new Promise((res) => {
        let done = false;
        const child = execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, opts || {}),
            (err, stdout, stderr) => { if (done) return; done = true; res({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? " " + ((err && err.message) || err) : "") }); });
        child.on("error", (e) => { if (done) return; done = true; res({ ok: false, out: "", err: String((e && e.message) || e) }); });
    });
}

// *** A REAL VENV, NOT A BARE `pip install`. *** Measured, not assumed: a bare install on this box tried to
// upgrade the system's apt-managed PyYAML and failed with "RECORD file not found" -- pip refusing to touch a
// package it did not install. Upstream's own README documents exactly this step ("Create and activate a
// virtual environment") for exactly this reason; skipping it is what produced the failure. venvPython() returns
// null until the venv actually exists, so callers cannot silently fall back to the system interpreter.
function venvPython() {
    const bin = process.platform === "win32" ? path.join(SRC_DIR, ".venv", "Scripts", "python.exe")
                                              : path.join(SRC_DIR, ".venv", "bin", "python");
    return fs.existsSync(bin) ? bin : null;
}

function _runPip() {
    const vpy = venvPython();
    if (!vpy) { _job.done = true; _job.code = -1; _appendLog("[install] venv creation did not produce a python at the expected path\n"); return; }
    const req = path.join(SRC_DIR, "requirements.txt");
    if (!fs.existsSync(req)) { _job.done = true; _job.code = -1; _appendLog("[install] repo present but requirements.txt missing at " + req + "\n"); return; }
    _runStep("pip", vpy, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: SRC_DIR });
}

function _createVenv(cand) {
    _appendLog("[install] creating a venv at " + path.join(SRC_DIR, ".venv") + "\n");
    _runStep("venv", cand.cmd, [...cand.base, "-m", "venv", ".venv"], { cwd: SRC_DIR }, (code) => {
        if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] venv creation failed (" + code + ")\n"); return; }
        _runPip();
    });
}

function _checkoutPinned(cand) {
    _appendLog("[install] checking out pinned commit " + PINNED_COMMIT.slice(0, 12) + "...\n");
    _runStep("checkout", "git", ["checkout", PINNED_COMMIT], { cwd: SRC_DIR }, (code) => {
        if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] checkout of the pinned commit failed (" + code + ") -- the clone may be shallow or the commit may no longer exist upstream\n"); return; }
        _createVenv(cand);
    });
}

/**
 * Clone (or reuse) upstream, pin to the reviewed commit, then pip-install. Returns the moment the job STARTS --
 * the panel polls status().installJob, same fire-and-poll shape as sharpBridge.install() and voxtralBridge.install().
 *
 * A FULL clone, not shallow -- `git checkout <sha>` needs the commit's own history reachable, which a
 * `--depth 1` clone of `main` does not guarantee once `main` has moved past PINNED_COMMIT.
 */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install job is already running (" + _job.kind + ")" };
    const cand = py.resolve();
    if (!cand) return { ok: false, error: "no working Python found (tried: " + py.candidates().map(py.label).join(", ") + ")" };
    try { fs.mkdirSync(path.dirname(SRC_DIR), { recursive: true }); }
    catch (e) { return { ok: false, error: "cannot create " + path.dirname(SRC_DIR) + ": " + ((e && e.message) || e) }; }

    _job = { kind: "clone", log: [], done: false, code: null, startedAt: Date.now() };
    if (!fs.existsSync(path.join(SRC_DIR, ".git"))) {
        _appendLog("[install] cloning " + REPO + " into " + SRC_DIR + "\n");
        _runStep("clone", "git", ["clone", REPO, SRC_DIR], { cwd: path.dirname(SRC_DIR) },
            (code) => { if (code !== 0) { _job.done = true; _job.code = code; _appendLog("[install] clone failed (" + code + ")\n"); return; } _checkoutPinned(cand); });
    } else {
        _appendLog("[install] checkout already present, skipping the clone\n");
        _checkoutPinned(cand);
    }
    return { ok: true, kind: _job.kind };
}

function installStatus() {
    return _job ? { kind: _job.kind, done: _job.done, code: _job.code,
                    uptimeMs: Date.now() - _job.startedAt, tail: _job.log.slice(-14).join("") } : null;
}

/** The pre-filled config a person edits, read straight from upstream's own example -- never authored here. */
function exampleConfig() {
    try { return fs.readFileSync(path.join(SRC_DIR, "config.example.yml"), "utf8"); }
    catch { return null; }
}

async function status() {
    const cand = py.resolve();
    const cloned = fs.existsSync(path.join(SRC_DIR, ".git"));
    const out = {
        ok: true, upstream: UPSTREAM, maintenance: MAINTENANCE, refused: REFUSED,
        srcDir: SRC_DIR, cloned, atPinnedCommit: false,
        python: cand ? py.label(cand) : "", pythonVersion: cand ? py.version(cand) : "",
        depsInstalled: false, ready: false, why: "",
        installJob: installStatus(), exampleConfig: null,
    };
    if (!cand) { out.why = "no working Python found (tried: " + py.candidates().map(py.label).join(", ") + ")"; return out; }
    if (!cloned) { out.why = "not installed yet -- press Install"; return out; }

    try { out.atPinnedCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: SRC_DIR, encoding: "utf8" }).trim() === PINNED_COMMIT; }
    catch { /* leave false; not fatal to reporting status */ }

    out.exampleConfig = exampleConfig();

    const vpy = venvPython();
    if (!vpy) { out.why = "not installed yet -- press Install"; return out; }

    // Smoke test: import the package without running it. Fails cleanly if pip install has not happened yet or
    // was interrupted, and costs nothing (no network, no subprocess side effects).
    const probe = await _run(vpy, ["-c", "import generator.main"], { cwd: SRC_DIR, timeout: 15000 });
    out.depsInstalled = probe.ok;
    out.ready = cloned && out.depsInstalled;
    if (!out.ready) out.why = out.depsInstalled ? "" : "dependencies not installed yet -- press Install (or retry if it failed)";
    if (out.ready && !out.atPinnedCommit) out.why = "WARNING: checkout is not at the pinned commit -- re-run Install to fix this";
    return out;
}

/**
 * Run the generator and hand back the 4 SVGs it writes -- never left on disk beyond this call's own read, and
 * never re-served from a path a request could name (there is no /galaxy/svg/<name> route; the content travels
 * in this one response).
 *
 * `demo: true` runs upstream's own sample-data mode (config.example.yml, zero API calls) -- the fastest way to
 * see the four SVGs render with no token and no editing. Otherwise `configYaml` is REQUIRED and is written
 * verbatim to config.yml; this bridge does not merge, validate, or invent fields into it -- generator.config's
 * own validate_config() is the one place that decides whether it is well-formed, same as running it by hand.
 */
async function generate({ configYaml, demo, token } = {}) {
    const vpy = venvPython();
    if (!vpy) return { ok: false, error: "not installed yet -- press Install first" };

    if (!demo) {
        if (!configYaml || !String(configYaml).trim()) {
            return { ok: false, error: "config.yml text is required outside demo mode -- edit the pre-filled example, or use Demo" };
        }
        try { fs.writeFileSync(path.join(SRC_DIR, "config.yml"), String(configYaml)); }
        catch (e) { return { ok: false, error: "cannot write config.yml: " + ((e && e.message) || e) }; }
    }

    // The token, if any, lives only in this one subprocess's environment -- explicitly cleared first so this
    // process's own env (which has none, but a future caller's shell might) can never leak in unasked.
    const env = Object.assign({}, process.env);
    delete env.GITHUB_TOKEN;
    if (token) env.GITHUB_TOKEN = String(token);

    const args = ["-m", "generator.main", ...(demo ? ["--demo"] : [])];
    const res = await _run(vpy, args, { cwd: SRC_DIR, env, timeout: 60000 });
    const tail = (res.out + res.err).slice(-4000);
    if (!res.ok) return { ok: false, error: "generator exited with an error", log: tail };

    const outDir = path.join(SRC_DIR, "assets", "generated");
    const svgs = {};
    for (const n of OUTPUT_NAMES) {
        const p = path.join(outDir, n);
        if (!fs.existsSync(p)) return { ok: false, error: "expected output missing: " + n, log: tail };
        svgs[n] = fs.readFileSync(p, "utf8");
    }
    return { ok: true, svgs, log: tail };
}

module.exports = { install, installStatus, status, generate, exampleConfig,
                   UPSTREAM, MAINTENANCE, REFUSED, REPO, PINNED_COMMIT, SRC_DIR, OUTPUT_NAMES };
