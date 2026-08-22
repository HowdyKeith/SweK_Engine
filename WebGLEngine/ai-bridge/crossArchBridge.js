// FILE: ai-bridge/crossArchBridge.js
//
// v2865 - front door for tools/macSession.mjs at /crossarch.
//
// Keith asked whether the cross-arch session could be a clicked link on server.html, on the Mac but NOT the PC.
// A link cannot execute a .command from a browser, so the button needs a route -- this is it. The Mac-only part
// is honest platform reporting, not a trick: /crossarch/status reports process.platform and the page decides.
//
// WHY MAC-ONLY IS THE RIGHT DEFAULT AND NOT A LIMITATION: the x86_64 side of the comparison already ships in the
// tree as tools/crossarch-baseline.json, so the machine that has something NEW to say is the arm64 one. The
// route itself is not platform-locked -- running it on Galaxina is genuinely informative, because that is
// win32/x64 against a linux/x64 baseline and the PLATFORM differs even though the arch does not. So the button
// is hidden on Windows and the endpoint still answers; hiding a control is a UI choice, and refusing to run
// would have been a different and worse one.
//
// It DRIVES macSession.mjs and reimplements none of it -- same rule as every other bridge here.

const path = require("path");
const { spawn } = require("child_process");

const PREFIX = "/crossarch";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const ENGINE = path.join(__dirname, "..");
const SCRIPT = path.join(ENGINE, "tools", "macSession.mjs");

// One run at a time with a bounded log -- the session shells out to five real measurements and some take a while.
const R = { running: false, log: "", exit: null, startedAt: 0, finishedAt: 0 };
const push = (d) => { R.log = (R.log + String(d)).slice(-65536); };

function status() {
    const fs = require("fs");
    return {
        ok: true,
        platform: process.platform,          // "darwin" on the Mac -- the page keys off this
        arch: process.arch,
        isMac: process.platform === "darwin",
        script: fs.existsSync(SCRIPT),
        baseline: fs.existsSync(path.join(ENGINE, "tools", "crossarch-baseline.json")),
        run: { running: R.running, exit: R.exit, startedAt: R.startedAt, finishedAt: R.finishedAt },
        note: "Runs every cross-architecture measurement this machine can settle and compares them against the x86_64 baseline shipped in the tree. Eight open claims live here.",
    };
}

function start() {
    const fs = require("fs");
    if (R.running) return { ok: false, error: "a session is already running" };
    if (!fs.existsSync(SCRIPT)) return { ok: false, error: "tools/macSession.mjs is missing" };
    R.running = true; R.exit = null; R.startedAt = Date.now(); R.finishedAt = 0;
    R.log = "[crossarch] started " + new Date().toISOString() + " on " + process.platform + "/" + process.arch + "\n";
    let child;
    try {
        child = spawn(process.execPath, [SCRIPT], { cwd: ENGINE, windowsHide: true });
    } catch (e) {
        R.running = false; R.exit = -1; R.finishedAt = Date.now();
        push("spawn failed: " + (e && e.message) + "\n");
        return { ok: false, error: "could not spawn: " + (e && e.message) };
    }
    child.on("error", (e) => { R.running = false; R.exit = -1; R.finishedAt = Date.now(); push("\nerror: " + (e && e.message) + "\n"); });
    if (child.stdout) child.stdout.on("data", push);
    if (child.stderr) child.stderr.on("data", push);
    child.on("exit", (c) => {
        R.running = false; R.exit = c; R.finishedAt = Date.now();
        // A non-zero exit means a stage FAILED (not merely skipped) -- macSession is explicit about that split.
        push("\n[crossarch] exited " + c + (c === 0 ? "" : " -- at least one stage FAILED; a SKIPPED stage would have exited 0") + "\n");
    });
    return { ok: true, started: true };
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";
    if (route === "/status" || route === "/") return sendJson(status());
    if (route === "/log") return sendJson({ ok: true, running: R.running, exit: R.exit, log: R.log.slice(-65536) });
    if (route === "/run") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST to /crossarch/run" }, 405);
        const r = start();
        return sendJson(r, r.ok ? 200 : 400);
    }
    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, status, start };
