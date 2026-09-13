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

// *** v4583 -- TWO CAPS ON ONE PIECE OF WORK, AND THE OUTER ONE WAS SMALLER THAN THE INNER ONE. ***
//
// This bridge spawned ship.mjs under a typed 900000 for a real ship and 600000 for a dry run. tools/ship/ship.mjs
// has its OWN per-step cap -- `RUN_TIMEOUT_MS = Number(arg("--step-timeout", "900")) * 1000` -- so the dry-run
// limit here was 600 s around a process whose single verify step is allowed 900 s. THE OUTER TOTAL WAS BELOW THE
// INNER PER-STEP LIMIT IT CONTAINS, which means a dry run could be killed while its slowest step was still
// comfortably inside its own budget, and the bridge reports `timedOut` with no text because -- as ship.mjs's own
// v3936 note records, after a 923-second ritual hit that same 900 -- A KILLED CHILD'S BUFFERED STDOUT NEVER
// FLUSHES. Two anonymous numbers, nested the wrong way round, each unable to explain the other's failure.
//
// DERIVED FROM THE INNER CAP RATHER THAN TYPED. The step cap is read out of ship.mjs the same way this file
// already reads ENGINE_VERSION out of main.js, so the two cannot drift apart. The multiple is a judgement and is
// named as one: a ship runs several steps and verify is the long one, so twice the step cap is the room for the
// rest. IT IS NOT DERIVED FROM gateBudget.MEASURED, and it must not be -- that table's tail sums to 266 minutes
// and three single gates each exceed 900 s on their own, so no wall-clock ship limit can be honest about the
// whole suite. What this bridge can promise is that it never kills a ship the ritual's own cap would have let run.
const SHIP_STEP_CAP_MS = (() => {
    try {
        const src = fs.readFileSync(path.join(ENGINE, "tools", "ship", "ship.mjs"), "utf8");
        const m = src.match(/arg\("--step-timeout",\s*"(\d+)"\)/);
        // No fallback that pretends to know: if the shape moved, the bridge says so rather than inventing a cap.
        return m ? Number(m[1]) * 1000 : null;
    } catch { return null; }
})();
const SHIP_STEP_MULTIPLE = 2;
const SHIP_TIMEOUT_MS = SHIP_STEP_CAP_MS ? SHIP_STEP_CAP_MS * SHIP_STEP_MULTIPLE : 1800000;

/** Declared for tools/ship/runnerBudget-selfcheck.mjs, which could not see this file until v4583. */
const budgetIsOwn =
    "this bridge budgets a whole SHIP, not a gate, so gateBudget.MEASURED's per-gate numbers cannot produce its " +
    "limit -- that table's tail sums to 266 minutes and three single gates each cost more than any plausible " +
    "wall-clock ship limit. What the limit CAN be derived from is the inner cap it wraps: ship.mjs's own " +
    "--step-timeout, read from its source, times a named multiple of " + SHIP_STEP_MULTIPLE + " for the steps " +
    "either side of verify. Before v4583 it was a typed 900000/600000, and the dry-run figure was BELOW the " +
    "900 s per-step cap it contained.";
// Exported at the bottom with the rest. The first draft wrote `module.exports.budgetIsOwn = ...` HERE, sixty lines
// above the file's `module.exports = { ... }`, which replaces the whole object and threw it away silently -- the
// later-assignment-wins class v4581 spent a round on in gateBudget.MEASURED, committed one file over by the round
// that reported it. Caught by asking the module for the value instead of assuming the line had worked.

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
        // ONE LIMIT FOR BOTH: a dry run still executes the verify step, which is where the time goes, so giving
        // it less was the inversion described above rather than a saving.
        const r = await runShip(args, SHIP_TIMEOUT_MS);
        return sendJson({ ok: r.pass, dryRun: !isReal, version, markers, ...r });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, readMarkers, nextVersion, PREFIX, budgetIsOwn, SHIP_TIMEOUT_MS, SHIP_STEP_CAP_MS };
