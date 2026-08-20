// WebGLEngine/ai-bridge/brainBenchBridge.js -- run the GPU Brain benchmark on demand.
//
// Owns: GET /ai/brain/bench?sizes=64,96&iters=15&mode=both|cpu
//
// Spawns brain/bench.mjs --json and returns its parsed output. Mirrors the flags
// START_BRAIN.bat uses, including the WGPU_BACKEND=vulkan pin (Deno 2.0.0 on Windows
// panicked when wgpu picked the GL backend -- denoland/deno #26144).
//
// Honest behaviours:
//   - mode=cpu never needs a GPU and runs under plain node, so the button always works.
//   - if deno is missing, a "both" request degrades to the node CPU baseline and SAYS SO
//     rather than erroring out or silently pretending it measured the GPU.
//   - the child is hard-killed on timeout; a wedged benchmark can't hang the bridge.
//   - running the GPU bench while the brain is solving contends for the same adapter, so
//     the response carries a `note` about it rather than hiding it.

const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");            // WebGLEngine/
const BENCH = path.join(ROOT, "brain", "bench.mjs");
const TIMEOUT_MS = 180000;

function owns(url) {
    return (url || "").split("?")[0] === "/ai/brain/bench";
}

function _run(cmd, args, cb) {
    const child = execFile(cmd, args, {
        cwd: ROOT,
        timeout: TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        env: Object.assign({}, process.env, { WGPU_BACKEND: process.env.WGPU_BACKEND || "vulkan" }),
    }, (err, stdout, stderr) => cb(err, String(stdout || ""), String(stderr || "")));
    return child;
}

function _parse(stdout) {
    // bench.mjs --json prints exactly one JSON object; be forgiving about stray lines
    // (Deno likes to announce upgrades on stderr, but a warning can land on stdout too).
    const i = stdout.indexOf("{");
    const j = stdout.lastIndexOf("}");
    if (i === -1 || j <= i) throw new Error("benchmark produced no JSON");
    return JSON.parse(stdout.slice(i, j + 1));
}

function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(o));
    });

    if (!fs.existsSync(BENCH)) return sendJson({ ok: false, error: "brain/bench.mjs not found" }, 500);

    const url = new URL(req.url, "http://localhost");
    const sizes = (url.searchParams.get("sizes") || "64,96,128").replace(/[^0-9,]/g, "");
    const iters = String(Math.max(3, Math.min(100, parseInt(url.searchParams.get("iters") || "12", 10) || 12)));
    const mode = url.searchParams.get("mode") === "cpu" ? "cpu" : "both";

    const common = ["--json", "--sizes", sizes, "--iters", iters];
    const started = Date.now();

    const finish = (out, extra) => sendJson(Object.assign({ ok: true, ms: Date.now() - started }, out, extra || {}));

    const runNodeCpu = (why) => {
        _run(process.execPath, [BENCH, ...common, "--cpu-only"], (err, stdout, stderr) => {
            if (err) return sendJson({ ok: false, error: "cpu benchmark failed: " + (err.message || err), stderr: stderr.slice(0, 800) }, 500);
            try { finish(_parse(stdout), { engine: "node", mode: "cpu", note: why || null }); }
            catch (e) { sendJson({ ok: false, error: e.message, stdout: stdout.slice(0, 800) }, 500); }
        });
    };

    if (mode === "cpu") return runNodeCpu(null);

    // mode=both -> needs Deno + WebGPU
    _run("deno", ["run", "--unstable-webgpu", "--allow-read", "--allow-env", "--allow-write", BENCH, ...common],
        (err, stdout, stderr) => {
            if (err) {
                const missing = /ENOENT|not recognized|command not found/i.test((err.message || "") + stderr);
                return runNodeCpu(missing
                    ? "deno is not on PATH, so the GPU path could not run -- this is the CPU baseline only"
                    : "the GPU benchmark failed, so this is the CPU baseline only: " + (err.message || "").slice(0, 160));
            }
            try {
                finish(_parse(stdout), {
                    engine: "deno", mode: "both",
                    note: "if the GPU Brain is running, it shares this adapter -- expect some contention in the GPU column",
                });
            } catch (e) {
                runNodeCpu("the GPU benchmark produced no parseable JSON, so this is the CPU baseline only");
            }
        });
}

module.exports = { owns, handle };
