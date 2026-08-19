// FILE: ai-bridge/terrainBuildBridge.js
//
// v2858 - front door for the terrain-wasm build. box3d has had a real build route (POST /box3d/build) with prereq
// probing and a log ring since v2289; terrain had NOTHING equivalent. benchmarks.html could only print the command
// and tell you to go type it in a console -- which, by the standing rule, means the terrain fast path was never
// finished. Keith asked which SweK page builds terrain_wasm on the Mac. The honest answer was "none". This is it.
//
// WHAT IT DRIVES, AND WHAT IT REFUSES TO REIMPLEMENT: wasm-terrain/build_wasm.sh (and build_wasm.bat on Windows).
// The script already knows the flags, the simd128 default, the nosimd hatch, the native `cargo test` first, and
// where to install the artefacts. Reimplementing any of that here is the exact hole ship.mjs exists to close.
//
// THE PATH PROBLEM, AGAIN, AND THIS IS THE FOURTH TIME. build_wasm.sh needs `cargo` and `wasm-pack`. rustup puts
// both in ~/.cargo/bin. A server started from a Finder-launched .command inherits a minimal PATH -- no ~/.cargo/bin,
// no /opt/homebrew/bin -- so the script would die on "ERROR: cargo not found. Install Rust first" on a Mac where
// Rust is installed and working in Terminal. That is the same failure that made cloudflared unspawnable (v2856)
// and made the launcher tell Keith to reinstall Node he already had (v2857). Same fix: build the child's PATH
// explicitly instead of inheriting whatever launchd handed us.
//
// So the prereq probe and the build BOTH run with the augmented PATH. A probe that searched a different PATH from
// the build would report "ready" and then fail, or vice versa -- and a status that disagrees with the thing it
// describes is worse than no status, because it gets believed.

const path = require("path");
const os = require("os");   // v3033 -- WAS MISSING. os.homedir() is used in the WINDOWS-ONLY branch of the
                            // pathNote, so every Linux run took the other branch and never evaluated it. The gate
                            // passed on three platforms and the bridge threw ReferenceError on the fourth.
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const PREFIX = "/terrain";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const WIN = process.platform === "win32";
const ENGINE = path.join(__dirname, "..");
const CRATE = path.join(ENGINE, "wasm-terrain");
const OUT_DIR = path.join(ENGINE, "world", "wasm");

// Directories a GUI-launched process does not inherit but a login shell would.
function buildEnv() {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const extra = WIN ? [] : [
        path.join(home, ".cargo", "bin"),
        "/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin",
    ].filter((d) => { try { return fs.existsSync(d); } catch { return false; } });
    const cur = process.env.PATH || "";
    const merged = extra.filter((d) => !cur.split(path.delimiter).includes(d)).concat(cur.split(path.delimiter)).join(path.delimiter);
    return Object.assign({}, process.env, { PATH: merged });
}

function which(cmd) {
    const env = buildEnv();
    try {
        const r = WIN
            ? spawnSync("where", [cmd], { encoding: "utf8", timeout: 6000, env, windowsHide: true })
            : spawnSync("/bin/sh", ["-c", "command -v " + cmd], { encoding: "utf8", timeout: 6000, env });
        const out = String((r && r.stdout) || "").trim().split("\n")[0].trim();
        return out || null;
    } catch { return null; }
}

function artefacts() {
    const js = path.join(OUT_DIR, "terrain_wasm.js");
    const wasm = path.join(OUT_DIR, "terrain_wasm_bg.wasm");
    const st = (f) => { try { const s = fs.statSync(f); return { size: s.size, mtime: s.mtimeMs }; } catch { return null; } };
    const a = st(js), b = st(wasm);
    return { js: a, wasm: b, ready: !!(a && b) };
}

// One build at a time, with a bounded log ring -- same discipline as _box3dBuild.
const B = { running: false, log: "", exit: null, startedAt: 0, finishedAt: 0 };
const push = (d) => { B.log = (B.log + String(d)).slice(-32768); };

function status() {
    const cargo = which("cargo"), wasmPack = which("wasm-pack");
    const script = WIN ? path.join(CRATE, "build_wasm.bat") : path.join(CRATE, "build_wasm.sh");
    const missing = [];
    if (!cargo) missing.push("cargo");
    if (!wasmPack) missing.push("wasm-pack");
    return {
        ok: true,
        platform: process.platform,
        crate: fs.existsSync(CRATE),
        script: fs.existsSync(script) ? script : null,
        prereqs: { cargo, wasmPack },
        missing,
        // The engine RUNS without this. Say so, or a red "not built" reads as a broken engine.
        optional: "The engine runs fine without this build -- world/terrainWasm.js detects the missing pkg and uses the JS terrain path. This is the opt-in fast path.",
        install: missing.length
            ? "Install the toolchain first:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   then:  cargo install wasm-pack"
            : null,
        // If a tool is missing but the user knows it is installed, this is the PATH story, not a missing install.
        // v3004 -- WINDOWS GOT NO PATH NOTE AT ALL, and Windows has the sharper version of this problem.
        //
        // The note was written for a Finder-launched .command on macOS and excluded win32 outright, so the ONE
        // platform where "I installed it and it still cannot be seen" is a weekly experience got a null. On
        // Windows the PATH IS READ WHEN A PROCESS STARTS AND IS NEVER RE-READ: rustup appends ~/.cargo/bin to
        // the USER path, and every shell, editor and service already running keeps the PATH it was born with.
        // The tool is installed, the installer succeeded, and this process cannot see it until it is RESTARTED
        // -- which is the expensive failure precisely because nothing about it looks like a PATH problem.
        pathNote: !missing.length ? null
            : WIN
                ? "If these DO work in a NEW terminal, this server just cannot see them. On Windows the PATH is read when a process STARTS and never re-read, so rustup adding ~/.cargo/bin to your user PATH does not reach anything already running -- INCLUDING THIS SERVER. Restart the server itself, not just the shell. This bridge already prepends " + path.join(os.homedir(), ".cargo", "bin") + "; if it still cannot find them, they are installed somewhere else."
                : "If these DO work in a Terminal, this server just cannot see them: a Finder-launched process does not source your login profile, so ~/.cargo/bin is off its PATH. This bridge already prepends ~/.cargo/bin, /opt/homebrew/bin and /usr/local/bin -- if it still cannot find them, they are installed somewhere else.",
        artefacts: artefacts(),
        build: { running: B.running, exit: B.exit, startedAt: B.startedAt, finishedAt: B.finishedAt },
    };
}

function startBuild(opts = {}) {
    if (B.running) return { ok: false, error: "a build is already running" };
    const script = WIN ? path.join(CRATE, "build_wasm.bat") : path.join(CRATE, "build_wasm.sh");
    if (!fs.existsSync(script)) return { ok: false, error: "build script missing: " + script };
    const st = status();
    if (st.missing.length) {
        // Refuse with the fix rather than spawning something that will fail in ten seconds with a worse message.
        return { ok: false, error: "missing-prereqs", missing: st.missing, message: st.install, pathNote: st.pathNote };
    }
    const nosimd = !!opts.nosimd;
    B.running = true; B.exit = null; B.startedAt = Date.now(); B.finishedAt = 0;
    B.log = "[terrain-build] started " + new Date().toISOString() + (nosimd ? " (nosimd)" : " (simd128)") + "\n";
    let child;
    try {
        child = WIN
            ? spawn("cmd", ["/c", script].concat(nosimd ? ["nosimd"] : []), { cwd: CRATE, windowsHide: true, env: buildEnv() })
            : spawn("bash", [script].concat(nosimd ? ["nosimd"] : []), { cwd: CRATE, windowsHide: true, env: buildEnv() });
    } catch (e) {
        B.running = false; B.exit = -1; B.finishedAt = Date.now();
        push("spawn failed: " + (e && e.message) + "\n");
        return { ok: false, error: "could not spawn the build: " + (e && e.message) };
    }
    child.on("error", (e) => {
        B.running = false; B.exit = -1; B.finishedAt = Date.now();
        push("\n[terrain-build] error: " + (e && e.message) + (WIN ? "" : " (is bash present?)") + "\n");
    });
    if (child.stdout) child.stdout.on("data", push);
    if (child.stderr) child.stderr.on("data", push);
    child.on("exit", (code) => {
        B.running = false; B.exit = code; B.finishedAt = Date.now();
        const a = artefacts();
        push("\n[terrain-build] exited " + code +
             (code === 0 && a.ready ? " -- artefacts installed at world/wasm/ (reload the engine to pick them up)"
              : code === 0 ? " -- but the artefacts are NOT at world/wasm/. The build reported success and installed nothing; check the log above."
              : "") + "\n");
    });
    return { ok: true, started: true, nosimd };
}

function readBody(req, limit = 65536) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    if (route === "/status" || route === "/") return sendJson(status());
    if (route === "/log") return sendJson({ ok: true, running: B.running, exit: B.exit, log: B.log.slice(-32768) });
    if (route === "/build") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST to /terrain/build" }, 405);
        const body = await readBody(req);
        const r = startBuild({ nosimd: !!body.nosimd });
        return sendJson(r, r.ok ? 200 : 400);
    }
    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, status, startBuild, buildEnv, artefacts };
