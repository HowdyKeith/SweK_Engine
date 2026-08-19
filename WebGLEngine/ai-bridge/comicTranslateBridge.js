// ai-bridge/comicTranslateBridge.js -- a front door for ogkalu2/comic-translate, the SOTA comic/manga translator
// (RT-DETR bubble detection -> OCR -> lama inpaint cleaning -> LLM translation; it can even translate with Claude).
// It is a heavy rig-side Python desktop app with its own models and LLM keys -- SweK does NOT reimplement it. This
// bridge is orchestration only: detect whether it is installed, offer to clone + install it, and launch it. The
// actual OCR/clean/translate runs the Python app on the rig; everything here is honest about that.
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = "https://github.com/ogkalu2/comic-translate";
const CT_DIR = process.env.SWEK_COMIC_DIR || path.join(os.homedir(), ".voxelbridge", "comic-translate");
let job = null;   // one install/launch job at a time; { kind, child, log, done, code }

function pythonBin() { for (const p of ["python3", "python"]) { try { require("child_process").execSync(p + " --version", { stdio: "ignore" }); return p; } catch {} } return null; }

// is comic-translate present, and can we run it?
function detect() {
    const entry = path.join(CT_DIR, "comic.py");
    const installed = (() => { try { return fs.existsSync(entry); } catch { return false; } })();
    const py = pythonBin();
    const venv = installed && (() => { try { return fs.existsSync(path.join(CT_DIR, "venv")) || fs.existsSync(path.join(CT_DIR, ".venv")); } catch { return false; } })();
    return { installed, dir: CT_DIR, entry: installed ? entry : null, python: py, venv, repo: REPO,
        hint: installed ? "installed -- Launch opens the app; OCR/clean/translate run here on the rig (needs an LLM key configured in the app)." : "not installed -- Install clones " + REPO + " into " + CT_DIR + " and pip-installs its requirements. Large download (models are fetched on first run)." };
}

function _spawnJob(kind, cmd, args, opts) {
    if (job && !job.done) return { ok: false, reason: "a comic-translate job is already running", kind: job.kind };
    const child = spawn(cmd, args, Object.assign({ cwd: CT_DIR }, opts || {}));
    job = { kind, child, log: [], done: false, code: null, startedAt: Date.now() };
    const cap = (b) => { const s = b.toString(); job.log.push(s); if (job.log.length > 400) job.log.shift(); };
    if (child.stdout) child.stdout.on("data", cap); if (child.stderr) child.stderr.on("data", cap);
    child.on("exit", (code) => { job.done = true; job.code = code; });
    child.on("error", (e) => { job.done = true; job.code = -1; job.log.push("[spawn error] " + (e && e.message || e)); });
    return { ok: true, kind, pid: child.pid };
}

// clone the repo (if absent) then pip-install its requirements. Long-running; poll status().
function install() {
    const py = pythonBin(); if (!py) return { ok: false, reason: "no python3 on this box" };
    try { fs.mkdirSync(path.dirname(CT_DIR), { recursive: true }); } catch {}
    if (!fs.existsSync(path.join(CT_DIR, ".git")) && !fs.existsSync(path.join(CT_DIR, "comic.py"))) {
        return _spawnJob("clone", "git", ["clone", "--depth", "1", REPO, CT_DIR], { cwd: path.dirname(CT_DIR) });
    }
    const req = path.join(CT_DIR, "requirements.txt");
    if (!fs.existsSync(req)) return { ok: false, reason: "repo present but requirements.txt missing at " + req };
    return _spawnJob("pip", py, ["-m", "pip", "install", "-r", "requirements.txt"]);
}

// launch the app (opens its window on the rig). Not headless -- comic-translate is a desktop GUI.
function launch() {
    const d = detect(); if (!d.installed) return { ok: false, reason: "not installed; run install first" };
    if (!d.python) return { ok: false, reason: "no python3 on this box" };
    return _spawnJob("launch", d.python, ["comic.py"]);
}

function status() { const d = detect(); return { detect: d, job: job ? { kind: job.kind, done: job.done, code: job.code, uptimeMs: Date.now() - job.startedAt, tail: job.log.slice(-12).join("") } : null }; }
function stop() { if (job && job.child && !job.done) { try { job.child.kill("SIGTERM"); } catch {} return { ok: true }; } return { ok: false, reason: "no running job" }; }

module.exports = { detect, install, launch, status, stop, REPO, CT_DIR };
