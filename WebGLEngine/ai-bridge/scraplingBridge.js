// ai-bridge/scraplingBridge.js — v1027
// Install + detect + run for Scrapling (github.com/D4Vinci/Scrapling), an
// adaptive web-scraping framework. Same shape as camoufoxBridge: a dedicated
// venv (SCRAPLING_VENV) so it never touches the ComfyUI python_embeded env.
//   basic   = Scrapling Fetcher (httpx/curl_cffi; fast, no browser)
//   stealth = StealthyFetcher (camoufox-backed; needs the browser step)
// Install steps (idempotent):
//   venv    → <BASE_PY> -m venv <SCRAPLING_VENV>
//   pkg     → <venv>/python -m pip install -U "scrapling[fetchers]"
//   browser → <venv>/python -m scrapling install   (browsers for stealth mode)

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IS_WIN = process.platform === "win32";
const BASE_PY = process.env.SCRAPLING_BASE_PY || (IS_WIN ? "python" : "python3");
const VENV_DIR = process.env.SCRAPLING_VENV || (IS_WIN ? "C:\\scrapling_env" : "/tmp/scrapling_env");
const VENV_PY = IS_WIN ? path.join(VENV_DIR, "Scripts", "python.exe") : path.join(VENV_DIR, "bin", "python");
const SCRAPER = path.join(__dirname, "scrapers", "scrapling_fetch.py");

function runProc(cmd, args, timeoutMs) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ code: -2, stdout: out, stderr: err + " [timeout]" }); }, timeoutMs || 30000);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ code: -1, stdout: out, stderr: String(e && e.message) }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ code, stdout: out, stderr: err }); });
    });
}

function pyForRun() { return fs.existsSync(VENV_PY) ? VENV_PY : BASE_PY; }   // prefer the dedicated venv; fall back to base if scrapling is global

async function detect() {
    const r = { ok: true, platform: process.platform, venvDir: VENV_DIR, venvPython: VENV_PY,
        base: {}, venv: { exists: fs.existsSync(VENV_PY) }, package: { installed: false }, browser: { fetched: false }, ready: false };
    const bp = await runProc(BASE_PY, ["--version"], 8000);
    r.base = { ok: bp.code === 0, version: ((bp.stdout || "") + (bp.stderr || "")).trim() };
    const py = pyForRun();
    const pk = await runProc(py, ["-c", "import scrapling; print(getattr(scrapling,'__version__','installed'))"], 30000);
    if (pk.code === 0) r.package = { installed: true, version: (pk.stdout || "").trim() || "installed", python: py };
    else r.package = { installed: false, error: ((pk.stderr || "").trim().split("\n").pop() || "import failed"), hint: 'install step "pkg"' };
    // basic mode needs only the package; check the stealth browser separately
    if (r.package.installed) {
        const fp = await runProc(py, ["-c", "import os;from scrapling.engines.toolbelt import __file__ as f;print('ok')"], 15000);
        r.browser = { fetched: fp.code === 0, note: "stealth mode also needs `python -m scrapling install` (browser step)" };
    }
    r.ready = !!r.package.installed;   // basic fetch ready once the package imports
    return r;
}

async function install(step) {
    if (step === "venv") {
        if (fs.existsSync(VENV_PY)) return { ok: true, step, skipped: true, stdout: "venv already present at " + VENV_DIR };
        const x = await runProc(BASE_PY, ["-m", "venv", VENV_DIR], 180000);
        return { ok: x.code === 0 && fs.existsSync(VENV_PY), step, stdout: x.stdout, stderr: x.stderr };
    }
    if (step === "pkg") {
        const py = pyForRun();
        const x = await runProc(py, ["-m", "pip", "install", "-U", "scrapling[fetchers]"], 900000);
        return { ok: x.code === 0, step, stdout: (x.stdout || "").slice(-1500), stderr: (x.stderr || "").slice(-1500) };
    }
    if (step === "browser") {
        const py = pyForRun();
        const x = await runProc(py, ["-m", "scrapling", "install"], 1800000);
        return { ok: x.code === 0, step, stdout: (x.stdout || "").slice(-1500), stderr: (x.stderr || "").slice(-1500) };
    }
    return { ok: false, error: "unknown step (venv|pkg|browser)" };
}

// fetch({url, mode, selector, timeout, maxLinks}) -> scraper JSON
async function fetchUrl({ url = "", mode = "basic", selector = "", timeout = 20, maxLinks = 60 } = {}) {
    url = String(url || "").trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "url must start with http(s)://" };
    const args = [SCRAPER, "--url", url, "--mode", mode === "stealth" ? "stealth" : "basic", "--timeout", String(timeout), "--max-links", String(maxLinks)];
    if (selector) args.push("--selector", selector);
    const r = await runProc(pyForRun(), args, Math.max(30000, timeout * 1000 + 30000));
    if (r.code !== 0 && !r.stdout) return { ok: false, error: (r.stderr || "scrapling run exit " + r.code + " — installed? (run detect/install)").slice(0, 300) };
    try { return JSON.parse((r.stdout || "").trim().split("\n").pop()); }
    catch (e) { return { ok: false, error: "bad scraper output: " + ((r.stderr || r.stdout || "").slice(0, 200)) }; }
}

module.exports = { detect, install, fetchUrl, VENV_DIR, VENV_PY };
