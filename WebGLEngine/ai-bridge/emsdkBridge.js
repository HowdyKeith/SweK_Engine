// ai-bridge/emsdkBridge.js — v2278
//
// One-click Emscripten (emcc) install, so a fresh box can build the box3d WASM without hand-running emsdk.
// It clones emscripten-core/emsdk to ~/emsdk, runs `emsdk install latest` (downloads the toolchain, ~1GB) and
// `emsdk activate latest`. After that emcc lives at ~/emsdk/upstream/emscripten/emcc even though it isn't on
// the already-running bridge's PATH -- so emccPath() reports it, /box3d/status uses it, and the build script
// sources ~/emsdk/emsdk_env.sh before compiling. One install at a time; poll status() for progress.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WIN = process.platform === "win32";
const EMSDK_DIR = path.join(os.homedir(), "emsdk");

function emccPath() {
    const names = WIN ? ["emcc.bat", "emcc.py", "emcc"] : ["emcc"];
    for (const sub of [["upstream", "emscripten"], ["fastcomp", "emscripten"]]) {
        for (const n of names) {
            const c = path.join(EMSDK_DIR, ...sub, n);
            try { if (fs.existsSync(c)) return c; } catch {}
        }
    }
    return null;
}
function isInstalled() { try { return fs.existsSync(path.join(EMSDK_DIR, WIN ? "emsdk.bat" : "emsdk")); } catch { return false; } }

// v2279 -- free disk where emsdk installs, so the button can show it + refuse when there's not enough room.
function freeDiskGb() {
    try { const s = fs.statfsSync(os.homedir()); return +(((s.bavail || s.bfree) * s.bsize) / 1e9).toFixed(1); } catch { return null; }
}
// rough, honest numbers: the toolchain download is a few hundred MB to ~1 GB, installs to ~1.5 GB, minutes on
// a normal connection. Need ~2 GB free to be safe.
const ESTIMATE = { downloadGb: 1, installGb: 1.5, needFreeGb: 2, minutes: "3-10" };

let _state = { running: false, log: "", code: null, phase: null, startedAt: 0, finishedAt: 0 };
function _push(t) { _state.log += t; if (_state.log.length > 60000) _state.log = _state.log.slice(-60000); }

function status() {
    return {
        ok: true, installed: isInstalled(), emcc: emccPath(),
        running: _state.running, phase: _state.phase, code: _state.code,
        startedAt: _state.startedAt, finishedAt: _state.finishedAt,
        logTail: _state.log.slice(-4000), dir: EMSDK_DIR,
        freeDiskGb: freeDiskGb(), estimate: ESTIMATE,
    };
}
function log() { return { ok: true, log: _state.log }; }

function _run(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
        _push("$ " + cmd + " " + args.join(" ") + "\n");
        let child;
        try { child = spawn(cmd, args, { cwd, shell: WIN, windowsHide: true }); }
        catch (e) { return reject(new Error("spawn failed: " + (e && e.message))); }
        if (child.stdout) child.stdout.on("data", (d) => _push(String(d)));
        if (child.stderr) child.stderr.on("data", (d) => _push(String(d)));
        child.on("error", (e) => reject(e));
        child.on("close", (c) => (c === 0 ? resolve() : reject(new Error(cmd + " exited " + c))));
    });
}

function _hasGit() {
    return new Promise((res) => {
        try { const c = spawn(WIN ? "where" : "which", ["git"], { shell: WIN, windowsHide: true }); c.on("close", (code) => res(code === 0)); c.on("error", () => res(false)); }
        catch { res(false); }
    });
}
// Get the emsdk repo WITHOUT git: download the GitHub tar.gz + extract with tar (Windows 10+, macOS, Linux all
// ship a tar that handles .tar.gz). The repo is only ~200KB -- the ~1GB is the toolchain emsdk downloads next.
async function _downloadEmsdkZip() {
    const tgz = path.join(os.tmpdir(), "emsdk-swek.tgz");
    _push("[emsdk] git not found; downloading emsdk tarball (~200KB) instead...\n");
    const r = await fetch("https://codeload.github.com/emscripten-core/emsdk/tar.gz/refs/heads/main");
    if (!r || !r.ok) throw new Error("emsdk tarball download failed: HTTP " + (r && r.status));
    fs.writeFileSync(tgz, Buffer.from(await r.arrayBuffer()));
    _push("[emsdk] extracting with tar...\n");
    await _run("tar", ["-xzf", tgz, "-C", os.homedir()], os.homedir());   // -> emsdk-main/
    const extracted = path.join(os.homedir(), "emsdk-main");
    if (!fs.existsSync(extracted)) throw new Error("emsdk tarball extracted but emsdk-main/ not found");
    fs.renameSync(extracted, EMSDK_DIR);
    try { fs.unlinkSync(tgz); } catch {}
}

function install() {
    if (_state.running) return { ok: false, error: "emsdk install already running", running: true };
    if (emccPath()) return { ok: true, alreadyInstalled: true, emcc: emccPath() };
    const free = freeDiskGb();
    if (free != null && free < ESTIMATE.needFreeGb) return { ok: false, error: "low disk: " + free + " GB free where emsdk installs (" + EMSDK_DIR + "), need ~" + ESTIMATE.needFreeGb + " GB. Free some space and retry." };
    _state = { running: true, log: "", code: null, phase: "clone", startedAt: Date.now(), finishedAt: 0 };
    (async () => {
        try {
            const emsdk = WIN ? path.join(EMSDK_DIR, "emsdk.bat") : path.join(EMSDK_DIR, "emsdk");
            if (!isInstalled()) {
                if (await _hasGit()) {
                    _push("[emsdk] cloning emscripten-core/emsdk to " + EMSDK_DIR + " ...\n");
                    await _run("git", ["clone", "--depth", "1", "https://github.com/emscripten-core/emsdk.git", EMSDK_DIR], os.homedir());
                } else {
                    await _downloadEmsdkZip();
                }
            } else {
                _push("[emsdk] emsdk already present at " + EMSDK_DIR + "\n");
            }
            _state.phase = "install";
            _push("\n[emsdk] installing latest toolchain (downloads ~1GB, several minutes)...\n");
            await _run(emsdk, ["install", "latest"], EMSDK_DIR);
            _state.phase = "activate";
            _push("\n[emsdk] activating latest...\n");
            await _run(emsdk, ["activate", "latest"], EMSDK_DIR);
            const e = emccPath();
            _push("\n[emsdk] done. emcc: " + (e || "(NOT FOUND - check the log)") + "\n");
            _state.code = e ? 0 : 1;
        } catch (err) {
            _push("\n[emsdk] FAILED: " + (err && err.message) + "\n");
            _state.code = 1;
        } finally {
            _state.running = false; _state.finishedAt = Date.now(); _state.phase = "done";
        }
    })();
    return { ok: true, started: true };
}

module.exports = { status, log, install, emccPath, isInstalled, EMSDK_DIR };
