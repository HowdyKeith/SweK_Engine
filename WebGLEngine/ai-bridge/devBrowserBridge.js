// devBrowserBridge.js — v1551
// Front-end for SawyerHood/dev-browser (https://github.com/SawyerHood/dev-browser, MIT):
// a CLI that runs sandboxed JS browser-automation scripts on Playwright/Chromium.
//   dev-browser --headless <<'EOF' ...script... EOF   (launches its own Chromium)
//   dev-browser --connect  <<'EOF' ...script... EOF   (drives your running Chrome via the extension)
// A script gets a `browser` global (browser.getPage/newPage/listPages/closePage); pages are
// full Playwright Page objects (goto/click/fill/evaluate/screenshot/snapshotForAI). console.log
// goes to stdout, which we capture and return. The engine spawns the CLI — it's an npm global.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = path.join(os.homedir(), ".voxelbridge", "devbrowser.json");
function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return {}; }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); return true; } catch (e) { return false; } }
function getConfig() { const c = load(); return { ok: true, bin: c.bin || "", defaultMode: c.defaultMode || "headless" }; }
function setConfig(d) { const c = load(); if (d && typeof d.bin === "string") c.bin = String(d.bin).trim(); if (d && (d.defaultMode === "headless" || d.defaultMode === "connect")) c.defaultMode = d.defaultMode; save(c); return getConfig(); }

// Resolve the command. Prefer a configured/installed `dev-browser`; fall back to `npx dev-browser`.
function _cmd() {
    const c = load();
    if (c.bin && fs.existsSync(c.bin)) return { cmd: c.bin, pre: [] };
    if (c.bin) return { cmd: c.bin, pre: [] };
    return { cmd: process.platform === "win32" ? "dev-browser.cmd" : "dev-browser", pre: [], fallback: { cmd: process.platform === "win32" ? "npx.cmd" : "npx", pre: ["dev-browser"] } };
}

function _run(args, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
        const { cmd, pre } = (opts._cmd || _cmd());
        let child, out = "", err = "", done = false;
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "dev-browser timed out", stdout: out.slice(-4000), stderr: err.slice(-1000) }); } }, opts.timeoutMs || 120000);
        try { child = spawn(cmd, [...pre, ...args], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn failed: " + (e && e.message) }); }
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "dev-browser not found (" + (e && e.message) + ") — Install it first, or set the path in config", _enoent: true }); });
        child.stdout.on("data", d => out += d); child.stderr.on("data", d => err += d);
        if (opts.stdin != null) { try { child.stdin.write(String(opts.stdin)); child.stdin.end(); } catch {} }
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ ok: code === 0, code, stdout: out, stderr: err }); });
    });
}

// status: does the CLI run? (--version). Tries dev-browser, then npx dev-browser.
async function status() {
    let r = await _run(["--version"], { timeoutMs: 20000 });
    if (r._enoent) { const f = _cmd().fallback; if (f) r = await _run(["--version"], { timeoutMs: 30000, _cmd: f }); }
    if (r._enoent || (!r.ok && !r.stdout)) return { ok: true, installed: false, hint: "Install dev-browser (npm i -g dev-browser, then dev-browser install for Chromium)" };
    return { ok: true, installed: true, version: String(r.stdout || "").trim().slice(0, 40) };
}

// install: npm i -g dev-browser (postinstall fetches the native binary), then
// `dev-browser install` to fetch Playwright + Chromium. Big download; long timeout.
function install() {
    return new Promise((resolve) => {
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        let child, buf = "", done = false;
        const t = setTimeout(() => { if (!done) { done = true; try { child && child.kill(); } catch {} resolve({ ok: false, error: "npm install timed out" }); } }, 600000);
        try { child = spawn(npm, ["install", "-g", "dev-browser"], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "npm not found (" + (e && e.message) + ")" }); }
        child.stdout.on("data", d => buf += d); child.stderr.on("data", d => buf += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: "npm not found (" + (e && e.message) + ")" }); });
        child.on("close", async code => {
            if (done) return; done = true; clearTimeout(t);
            if (code !== 0) return resolve({ ok: false, code, log: String(buf).slice(-600), error: "npm install failed" });
            // step 2: dev-browser install (Playwright + Chromium)
            const r2 = await _run(["install"], { timeoutMs: 900000 });
            resolve({ ok: r2.ok !== false, npmLog: String(buf).slice(-400), chromium: r2.ok ? "installed" : (r2.error || "run `dev-browser install` once to fetch Chromium"), code });
        });
    });
}

// run a sandboxed automation script. mode: "headless" (own Chromium) | "connect" (your Chrome).
async function runScript(script, opts) {
    opts = opts || {};
    if (!script || !String(script).trim()) return { ok: false, error: "empty script" };
    const mode = (opts.mode === "connect") ? "connect" : (opts.mode === "headless" ? "headless" : (load().defaultMode || "headless"));
    const flag = mode === "connect" ? "--connect" : "--headless";
    let r = await _run([flag], { stdin: script, timeoutMs: opts.timeoutMs || 120000 });
    if (r._enoent) { const f = _cmd().fallback; if (f) r = await _run([flag], { stdin: script, timeoutMs: opts.timeoutMs || 150000, _cmd: f }); }
    if (r._enoent) return { ok: false, error: "dev-browser not installed (npm i -g dev-browser)" };
    return { ok: !!r.ok, mode, stdout: String(r.stdout || ""), stderr: String(r.stderr || "").slice(-2000), code: r.code };
}

module.exports = { getConfig, setConfig, status, install, runScript };
