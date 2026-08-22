// FILE: ai-bridge/shipBridge.js
//
// v2807 - front door for the ship ritual. tools/ship/ship.mjs is already the whole ritual behind one command and
// one exit code; this does not reimplement it, it drives it. Reimplementing would recreate the exact hole that
// script exists to close -- a ritual assembled from memory, step by step, passing by habit.
//
// THE ASYMMETRY THAT SHAPES THIS FILE: --dry-run reads and verifies; a real ship WRITES -- it bumps version
// markers, regenerates the changelog, renames the project folder, builds a zip and publishes it. So:
//
//   /ship/status  and  /ship/dryrun   are free. Click them as often as you like.
//   /ship/run                         requires an explicit confirm token equal to the version being shipped.
//
// A one-click button that mutates the tree is how you ship the version you did not mean to. Typing the version
// is the smallest honest confirmation: it proves you know which one you are shipping.

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const ENGINE = path.join(__dirname, "..");
const PREFIX = "/ship";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const VERSION_RE = /^v\d{3,6}$/;

function readMarkers() {
    const grab = (rel, re) => {
        try { const m = fs.readFileSync(path.join(ENGINE, rel), "utf8").match(re); return m ? m[1] : null; }
        catch { return null; }
    };
    const engine = grab("main.js", /const ENGINE_VERSION\s*=\s*"(v\d+)"/);
    const brain = grab("brain/brain.js", /const BRAIN_BUILD\s*=\s*"(v\d+)"/);
    return { engine, brain, agree: !!engine && engine === brain };
}

function nextVersion(cur) {
    const n = cur && /^v(\d+)$/.exec(cur);
    return n ? "v" + (parseInt(n[1], 10) + 1) : null;
}

function runShip(args, timeoutMs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        execFile(process.execPath, [path.join(ENGINE, "tools", "ship", "ship.mjs"), ...args],
            { cwd: ENGINE, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
            (err, stdout, stderr) => resolve({
                pass: !err,
                exitCode: err && typeof err.code === "number" ? err.code : (err ? 1 : 0),
                timedOut: !!(err && (err.killed || err.signal === "SIGTERM")),
                ms: Date.now() - t0,
                output: (String(stdout || "") + String(stderr || "")).trim().slice(-40000),
            }));
    });
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    if (route === "/status" || route === "/") {
        const m = readMarkers();
        return sendJson({
            ok: true,
            markers: m,
            suggestedVersion: nextVersion(m.engine),
            note: m.agree ? null : "ENGINE_VERSION and BRAIN_BUILD disagree -- the ritual will refuse until they match.",
            shipScript: fs.existsSync(path.join(ENGINE, "tools", "ship", "ship.mjs")),
        });
    }

    if (route === "/dryrun" || route === "/run") {
        const version = (url.searchParams.get("version") || "").trim();
        const markers = (url.searchParams.get("markers") || "").trim();
        if (!VERSION_RE.test(version)) {
            return sendJson({ ok: false, error: "bad-version", message: "Version must look like v2807." }, 400);
        }
        // markers are passed to ship.mjs as one --markers value; keep it to a safe comma list, no shell involved
        if (markers && !/^[A-Za-z0-9_.,\- ]*$/.test(markers)) {
            return sendJson({ ok: false, error: "bad-markers", message: "Markers may contain letters, digits, dot, dash, underscore, comma, space." }, 400);
        }

        const isReal = route === "/run";
        if (isReal) {
            const confirm = (url.searchParams.get("confirm") || "").trim();
            if (confirm !== version) {
                return sendJson({
                    ok: false, error: "confirm-required",
                    message: "A real ship writes: it bumps markers, rewrites the changelog, renames the folder and publishes a zip. Re-send with confirm set to the exact version to proceed.",
                }, 428);
            }
        }

        const args = ["--version", version, ...(markers ? ["--markers", markers] : []), ...(isReal ? [] : ["--dry-run"])];
        const r = await runShip(args, isReal ? 900000 : 600000);
        return sendJson({ ok: r.pass, dryRun: !isReal, version, markers, ...r });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, readMarkers, nextVersion, PREFIX };
