// ai-bridge/camoufoxBridge.js — v951
// Install + detect for Camoufox (the anti-detect Firefox fork we're using to
// replace the dead IE WebBrowser control for reliable scraping). Self-contained:
// it owns a DEDICATED venv (default C:\camoufox_env, override with env
// CAMOUFOX_VENV) so it never touches the ComfyUI python_embeded environment.
//
// Detect mirrors the AI-model-detect probes: it runs the real Camoufox CLI
// (python -m camoufox version|path) in the venv and reports what's actually on
// disk. Install runs three idempotent steps:
//   venv    → python -m venv <dir>            (skipped if it already exists)
//   pkg     → <venv>/python -m pip install -U camoufox
//   browser → <venv>/python -m camoufox fetch (300–400MB custom Firefox build)
//
// Everything here is Windows-first (Keith's rig) but degrades cleanly on other
// platforms — detect just reports "not found" instead of crashing.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";
const VENV_DIR = process.env.CAMOUFOX_VENV || (IS_WIN ? "C:\\camoufox_env" : "/tmp/camoufox_env");
const VENV_PY = IS_WIN ? path.join(VENV_DIR, "Scripts", "python.exe") : path.join(VENV_DIR, "bin", "python");
const BASE_PY = IS_WIN ? "python" : "python3";

// Run a process to completion. NEVER throws or rejects — always resolves
// { code, stdout, stderr }. code -1 = spawn/runtime error, -2 = timed out.
function runProc(cmd, args, timeoutMs) {
    return new Promise((resolve) => {
        let out = "", err = "", done = false, child;
        const finish = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, stdout: out, stderr: err }); };
        const t = setTimeout(() => { try { child && child.kill("SIGKILL"); } catch {} finish(-2); }, timeoutMs);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        child.stdout && child.stdout.on("data", d => { out += d; });
        child.stderr && child.stderr.on("data", d => { err += d; });
        child.on("error", e => { err += (err ? "\n" : "") + (e && e.message); finish(-1); });
        child.on("close", code => finish(code == null ? -1 : code));
    });
}

async function detect() {
    const r = {
        ok: true, platform: process.platform, venvDir: VENV_DIR, venvPython: VENV_PY,
        basePython: { found: false }, venv: { exists: false },
        package: { installed: false }, browser: { fetched: false }, ready: false,
    };
    // 1) a base python to build the venv with
    const bp = await runProc(BASE_PY, ["--version"], 8000);
    const bpText = ((bp.stdout || "") + (bp.stderr || "")).trim();   // some pythons print --version to stderr
    if (bp.code === 0 || /python\s+\d/i.test(bpText)) r.basePython = { found: true, cmd: BASE_PY, version: bpText };

    // 2) the dedicated venv
    r.venv.exists = fs.existsSync(VENV_PY);
    if (r.venv.exists) {
        // 3) the camoufox package inside it
        const pk = await runProc(VENV_PY, ["-c", "import camoufox; print(getattr(camoufox,'__version__','installed'))"], 20000);
        if (pk.code === 0) r.package = { installed: true, version: (pk.stdout || "").trim() || "installed" };
        else r.package = { installed: false, error: ((pk.stderr || "").trim().split("\n").pop() || "import failed") };

        // 4) the fetched browser binary
        if (r.package.installed) {
            // `camoufox path` can interleave banner lines with the path (and the
            // path may be a directory), so scan every output line for one that
            // actually exists on disk instead of trusting the whole stdout.
            const pa = await runProc(VENV_PY, ["-m", "camoufox", "path"], 20000);
            const lines = ((pa.stdout || "") + "\n" + (pa.stderr || "")).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            let exe = "";
            for (const l of lines) { try { if (fs.existsSync(l)) { exe = l; break; } } catch {} }
            // Fallback: `camoufox version` saying "up to date" (or printing a
            // concrete version with no "not installed") means the binary IS
            // fetched even when `path` output doesn't resolve cleanly.
            const ve = await runProc(VENV_PY, ["-m", "camoufox", "version"], 20000);
            const veText = ((ve.stdout || "") + " " + (ve.stderr || "")).trim();
            const verMatch = /v?\d+\.\d+[\w.\-]*/.exec(veText);
            const saysMissing = /not installed|not found|no.*binar|fetch the browser|please run.*fetch/i.test(veText);
            const versionOK = ve.code === 0 && !saysMissing && (/\bup to date\b/i.test(veText) || !!verMatch);
            if (exe || versionOK) {
                r.browser = { fetched: true };
                if (exe) r.browser.path = exe;
                if (verMatch) r.browser.version = verMatch[0];
            } else {
                r.browser = { fetched: false, hint: "run the 'Fetch browser' step (python -m camoufox fetch)" };
            }
        }
    }
    r.ready = !!(r.venv.exists && r.package.installed && r.browser.fetched);
    return r;
}

const STEPS = {
    venv: async () => {
        if (fs.existsSync(VENV_PY)) return { ok: true, step: "venv", skipped: true, stdout: "venv already present at " + VENV_DIR };
        const x = await runProc(BASE_PY, ["-m", "venv", VENV_DIR], 180000);
        return { ok: x.code === 0, step: "venv", code: x.code, stdout: x.stdout, stderr: x.stderr };
    },
    pkg: async () => {
        if (!fs.existsSync(VENV_PY)) return { ok: false, step: "pkg", error: "venv missing — run the 'Create venv' step first" };
        const x = await runProc(VENV_PY, ["-m", "pip", "install", "-U", "camoufox"], 900000);
        return { ok: x.code === 0, step: "pkg", code: x.code, stdout: x.stdout, stderr: x.stderr };
    },
    browser: async () => {
        if (!fs.existsSync(VENV_PY)) return { ok: false, step: "browser", error: "venv missing — run the 'Create venv' step first" };
        const x = await runProc(VENV_PY, ["-m", "camoufox", "fetch"], 1800000);   // 30 min ceiling for the 300–400MB download
        return { ok: x.code === 0, step: "browser", code: x.code, stdout: x.stdout, stderr: x.stderr };
    },
};

async function install(step) {
    const fn = STEPS[step];
    if (!fn) return { ok: false, error: "unknown step '" + step + "' (expected venv | pkg | browser)" };
    try { return await fn(); }
    catch (e) { return { ok: false, step, error: (e && e.message) || String(e) }; }
}

module.exports = { detect, install, VENV_DIR, VENV_PY };
