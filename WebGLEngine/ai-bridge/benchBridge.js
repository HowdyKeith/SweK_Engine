// FILE: ai-bridge/benchBridge.js
//
// v2805 - front door for the two measurement tools that were console-only: tools/bench/meshPerf.mjs (greedy vs
// RLE vs optimised-RLE chunk meshing) and tools/terrain-parity.mjs (JS vs WASM terrain, which also prints the
// speedup the whole Rust port exists for).
//
// Both are Node-side by nature -- meshPerf imports the world modules and times them off the render thread, and
// parity needs the built wasm binary on disk -- so the page cannot run them itself. This bridge runs them and
// returns structured results.
//
// HONESTY ABOUT WHAT IS RUNNABLE: /bench/status reports parity as unavailable when world/wasm/terrain_wasm.js is
// absent, and hands back the exact build command instead of letting the page offer a button that would fail.
// A benchmark that silently reports nothing is worse than one that says it cannot run.

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { pathToFileURL } = require("url");

const ENGINE = path.join(__dirname, "..");
const esm = (rel) => import(pathToFileURL(path.join(ENGINE, rel)).href);

const PREFIX = "/bench";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const WASM_JS = path.join(ENGINE, "world", "wasm", "terrain_wasm.js");
function parityAvailable() { return fs.existsSync(WASM_JS); }

function runParity(args, timeoutMs = 300000) {
    return new Promise((resolve) => {
        execFile(process.execPath, [path.join(ENGINE, "tools", "terrain-parity.mjs"), ...args],
            { cwd: ENGINE, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
            (err, stdout, stderr) => {
                resolve({
                    exitCode: err && typeof err.code === "number" ? err.code : (err ? 1 : 0),
                    stdout: String(stdout || ""),
                    stderr: String(stderr || ""),
                    timedOut: !!(err && err.killed),
                });
            });
    });
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    if (route === "/status" || route === "/") {
        return sendJson({
            ok: true,
            mesh: { available: true, what: "greedy vs RLE vs optimised-RLE chunk meshing, adjudicated against an independent exposed-face reference" },
            parity: parityAvailable()
                ? { available: true, what: "JS vs WASM terrain: divergence within thresholds, plus the speedup" }
                : { available: false, reason: "wasm crate not built", build: "cd WebGLEngine/wasm-terrain && build_wasm.bat   (or ./build_wasm.sh on Mac/Linux)" },
        });
    }

    if (route === "/mesh") {
        const iters = Math.max(3, Math.min(60, parseInt(url.searchParams.get("iters") || "15", 10)));
        try {
            const M = await esm("tools/bench/meshPerf.mjs");
            const t0 = Date.now();
            const rows = M.runAll(undefined, iters);
            return sendJson({ ok: true, iters, elapsedMs: Date.now() - t0, rows, note: "CPU meshing only -- excludes GPU upload and draw. Timings are machine-dependent." });
        } catch (e) {
            return sendJson({ ok: false, error: "mesh", message: String(e && e.message || e) }, 500);
        }
    }

    if (route === "/parity") {
        if (!parityAvailable()) {
            return sendJson({
                ok: false, error: "not-built",
                message: "The wasm crate is not built, so there is nothing to compare against. Build it, then retry.",
                build: "cd WebGLEngine/wasm-terrain && build_wasm.bat   (or ./build_wasm.sh on Mac/Linux)",
            }, 409);
        }
        const args = [];
        if (url.searchParams.get("worley") === "1") args.push("--worley");
        const radius = parseInt(url.searchParams.get("radius") || "0", 10);
        if (radius > 0) args.push("--radius", String(Math.min(12, radius)));
        const r = await runParity(args);
        return sendJson({ ok: r.exitCode === 0, exitCode: r.exitCode, timedOut: r.timedOut, output: (r.stdout + r.stderr).trim(), args });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, parityAvailable, PREFIX };
