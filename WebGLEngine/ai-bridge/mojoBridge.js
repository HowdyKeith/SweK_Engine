// mojoBridge.js -- Mojo (Modular) detect + scripted install + run-the-benchmark.
//
// EXPERIMENTAL. Nothing in the engine depends on Mojo; this exists to run the
// experiments/mojo-subvoxel benchmark and decide, from real numbers on the
// user's hardware, whether Mojo earns a place in the pipeline.
//
// Install commands are the ones VERIFIED from Modular's own docs (July 2026),
// not guessed:
//   uv:  uv pip install mojo --extra-index-url https://modular.gateway.scarf.sh/simple/ --prerelease allow
//        (--prerelease allow is required because the current release is 1.0.0b2, a beta)
//   pixi: curl -fsSL https://pixi.sh/install.sh | sh ; pixi add mojo (channel: conda.modular.com/max)
// Mojo is Linux/macOS only (Windows needs WSL2). We refuse to invent flags.

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IS_WIN = process.platform === "win32";
const EXP_DIR = path.join(__dirname, "..", "experiments", "mojo-subvoxel");

function _which(bin) {
    try {
        const r = spawnSync(IS_WIN ? "where" : "which", [bin], { timeout: 6000, encoding: "utf8", windowsHide: true });
        if (r.status === 0 && r.stdout) {
            const line = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
            if (line) return line;
        }
    } catch {}
    return null;
}

function _version(bin) {
    try {
        const r = spawnSync(bin, ["--version"], { timeout: 10000, encoding: "utf8", windowsHide: true });
        return ((r.stdout || r.stderr || "").split(/\r?\n/)[0] || "").slice(0, 80) || null;
    } catch { return null; }
}

function status() {
    const mojo = _which("mojo");
    const uv = _which("uv");
    const pixi = _which("pixi");
    return {
        platform: process.platform,
        windowsNote: IS_WIN ? "Mojo does not run natively on Windows -- use WSL2 (a Linux shell). Detect/install here only work inside WSL." : null,
        installed: !!mojo,
        mojo: mojo ? { path: mojo, version: _version("mojo") } : null,
        installers: { uv: !!uv, pixi: !!pixi },
        experimentDir: EXP_DIR,
        note: mojo
            ? "Mojo detected. Use 'Run benchmark' to compare the sub-voxel loop head-to-head against NumPy."
            : "Mojo not detected. Install it (uv or pixi), then Detect again. Beta (1.0.0b2), Linux/macOS only.",
    };
}

// Scripted install via uv (the lightest path -- drops `mojo` into a venv beside
// the numpy the benchmark needs). Streams into the shared build-log object.
// Returns the child; the route manages state. We do NOT run this on Windows.
function install(logPush) {
    if (IS_WIN) throw new Error("Mojo has no native Windows build -- run this inside WSL2.");
    const uv = _which("uv");
    if (!uv) {
        // install uv first, then mojo, in one shell script (verified commands).
        const sh = [
            'set -e',
            'echo "[mojo-install] installing uv (astral.sh)"',
            'curl -LsSf https://astral.sh/uv/install.sh | sh',
            'export PATH="$HOME/.local/bin:$PATH"',
            'echo "[mojo-install] installing mojo (beta) via uv"',
            'uv tool install mojo --extra-index-url https://modular.gateway.scarf.sh/simple/ --prerelease allow || \\',
            '  uv pip install --system mojo --extra-index-url https://modular.gateway.scarf.sh/simple/ --prerelease allow',
            'echo "[mojo-install] done -- run: mojo --version"',
        ].join("\n");
        return spawn("bash", ["-lc", sh], { windowsHide: true });
    }
    const sh = [
        'set -e',
        'echo "[mojo-install] installing mojo (beta) via uv"',
        'uv tool install mojo --extra-index-url https://modular.gateway.scarf.sh/simple/ --prerelease allow || \\',
        '  uv pip install --system mojo --extra-index-url https://modular.gateway.scarf.sh/simple/ --prerelease allow',
        'echo "[mojo-install] done -- run: mojo --version"',
    ].join("\n");
    return spawn("bash", ["-lc", sh], { windowsHide: true });
}

// Run the benchmark. Prefers `mojo run bench.py` (so the .mojo module is built +
// importable); if the mojo module fails to build, bench.py itself falls back to
// NumPy-only and reports why -- so this always returns useful output.
function runBenchmark() {
    return new Promise((resolve) => {
        const bench = path.join(EXP_DIR, "bench.py");
        if (!fs.existsSync(bench)) { resolve({ ok: false, error: "bench.py missing at " + bench }); return; }
        const mojo = _which("mojo");
        // If mojo is present, `mojo run` gives the .mojo module a chance to build;
        // otherwise plain python3 runs the NumPy baseline (still useful).
        const cmd = mojo ? mojo : (_which("python3") || "python3");
        const args = mojo ? ["run", "bench.py"] : ["bench.py"];
        let out = "";
        let child;
        try { child = spawn(cmd, args, { cwd: EXP_DIR, windowsHide: true }); }
        catch (e) { resolve({ ok: false, error: "spawn failed: " + (e && e.message) }); return; }
        const to = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 300000);   // 5 min cap
        child.stdout.on("data", d => out += d.toString());
        child.stderr.on("data", d => out += d.toString());
        child.on("error", e => { clearTimeout(to); resolve({ ok: false, error: String(e && e.message), output: out }); });
        child.on("exit", code => { clearTimeout(to); resolve({ ok: code === 0, exit: code, output: out, ranWith: mojo ? "mojo" : "python3 (NumPy baseline only)" }); });
    });
}

module.exports = { status, install, runBenchmark, EXP_DIR, _which };
