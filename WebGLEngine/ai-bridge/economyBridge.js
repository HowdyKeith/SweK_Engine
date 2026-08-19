// WebGLEngine/ai-bridge/economyBridge.js -- v3041. Front door at /economy for the spaceprojectsim probe.
//
// IT WRITES TO SOMEONE ELSE'S WORLD. /api/admin/markets/{location}/supply mutates a running simulation, so this
// is the first bridge in the tree whose failure mode is DAMAGING A THIRD-PARTY SYSTEM rather than returning a
// wrong number. It is therefore narrower than the others on purpose:
//   - an ALLOW-LIST of the five routes the probe needs. Nothing else is reachable, so this cannot become a
//     general proxy into their admin API just because the URL is open on localhost.
//   - the delta is CLAMPED. A typo cannot empty a market.
//   - it NEVER auto-resumes. A probe leaves the sim paused and says so, because silently restoring state is the
//     same reflex as re-uploading a diverged cache: it destroys the moment you wanted to look at.
//
// IT NEVER RECOMPUTES THE VERDICT. bandCensus / perturbationPlan / verdict are imported from economyProbe.mjs,
// which the gate grades headlessly. A bridge that scored the result itself could disagree with its own gate,
// and a dashboard that disagrees with the gate is worse than none because it is believed.
"use strict";
const DEFAULT_BASE = "http://127.0.0.1:8080";
const ALLOWED = [/^\/api\/health$/, /^\/api\/ships$/, /^\/api\/sim\/(pause|resume|step)$/,
                 /^\/api\/admin\/markets\/[A-Za-z0-9._-]+\/supply$/, /^\/api\/debug\/agent\/[A-Za-z0-9._-]+\/trace$/];
const MAX_ABS_DELTA = 5000, MAX_TICKS = 50;

function owns(url) { return String(url || "").split("?")[0].startsWith("/economy"); }

async function call(base, path, method, body) {
    if (!ALLOWED.some((re) => re.test(path))) throw new Error("refused: " + path + " is not on the probe's allow-list. This bridge reaches exactly the five routes the measurement needs, so it cannot become a general proxy into their admin API.");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
        const r = await fetch(base + path, { method, signal: ctrl.signal, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
        const text = await r.text();
        let json = null; try { json = JSON.parse(text); } catch {}
        return { status: r.status, ok: r.ok, body: json, text: json ? null : text.slice(0, 400) };
    } finally { clearTimeout(t); }
}

const unreachable = (base, e) => ({
    ok: false, base,
    error: "the simulator is not answering on " + base,
    detail: String((e && e.message) || e),
    // REFUSE WITH THE FIX, not with an empty census a page would render as "no ships in the band".
    fix: "cd spaceprojectsim && set WORLD_SPEED=4.0 && cargo run -p client_bevy -- --headless",
});

async function handle(req, res, { sendJson }) {
    // v3165 -- START AND STATUS, so the panel can launch what it drives.
    const _p = String(req.url || "").split("?")[0];
    if (_p === "/economy/simstatus") { sendJson(await status()); return true; }
    // v3169 -- the phone-peer front door asks here. Beside the sim status because this bridge already owns
    // /economy* and a second route owner for one prefix is the six-copies mistake wearing a URL.
    if (_p === "/economy/copyparty") { sendJson(await require("./copypartyBridge.js").status()); return true; }
    if (_p === "/economy/start" && req.method === "POST") {
        const r = await start();
        sendJson({ ...r, status: await status() });
        return true;
    }
    const u = new URL(req.url, "http://x");
    const sp = u.pathname;
    const base = (u.searchParams.get("base") || DEFAULT_BASE).replace(/\/+$/, "");
    if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) return sendJson({ ok: false, error: "base must be loopback -- this bridge writes to an admin API and is not pointed at anything remote" }, 400);
    const P = await import("../tools/roundhouse/economyProbe.mjs");

    if (sp === "/economy/status") {
        try {
            const h = await call(base, "/api/health", "GET");
            return sendJson({ ok: true, base, reachable: h.ok, health: h.body || h.text, maxDelta: MAX_ABS_DELTA, maxTicks: MAX_TICKS });
        } catch (e) { return sendJson(unreachable(base, e), 424); }
    }

    if (sp === "/economy/census") {
        try {
            const s = await call(base, "/api/ships", "GET");
            const ships = (s.body && (s.body.ships || s.body)) || [];
            if (!Array.isArray(ships)) return sendJson({ ok: false, base, error: "/api/ships did not return an array -- the shape changed, and guessing at it would produce a census over nothing", sample: JSON.stringify(s.body).slice(0, 200) }, 502);
            const hist = {};
            for (const sh of ships) { const g = sh && (sh.goal || sh.plan || sh.current_goal); if (g) hist[g] = (hist[g] || 0) + 1; }
            return sendJson({ ok: true, base, ships: ships.length, histogram: hist, census: P.bandCensus(hist) });
        } catch (e) { return sendJson(unreachable(base, e), 424); }
    }

    if (sp === "/economy/probe") {
        const location = u.searchParams.get("location"), commodity = u.searchParams.get("commodity");
        const shipId = u.searchParams.get("ship");
        let delta = Number(u.searchParams.get("delta")), ticks = Number(u.searchParams.get("ticks") || 1);
        if (!Number.isFinite(delta)) return sendJson({ ok: false, error: "delta must be a finite number" }, 400);
        delta = Math.max(-MAX_ABS_DELTA, Math.min(MAX_ABS_DELTA, delta));      // clamp: a typo cannot empty a market
        ticks = Math.max(1, Math.min(MAX_TICKS, Math.round(ticks) || 1));
        let plan;
        try { plan = P.perturbationPlan({ location, commodity, delta, shipId, ticks }); }
        catch (e) { return sendJson({ ok: false, error: String(e.message) }, 400); }
        try {
            const census = (await (async () => {
                const s = await call(base, "/api/ships", "GET");
                const ships = (s.body && (s.body.ships || s.body)) || [];
                const hist = {}; for (const sh of (Array.isArray(ships) ? ships : [])) { const g = sh && (sh.goal || sh.plan || sh.current_goal); if (g) hist[g] = (hist[g] || 0) + 1; }
                return P.bandCensus(hist);
            })());
            const steps = [];
            for (const s of plan) { const r = await call(base, s.path, s.method, s.body); steps.push({ path: s.path, status: r.status, why: s.why }); if (!r.ok && s.method === "POST") throw new Error(s.path + " returned " + r.status); if (s.path.indexOf("/trace") > 0) s._trace = r.body; }
            const before = plan[1]._trace, after = plan[4]._trace;
            return sendJson({
                ok: true, base, delta, ticks, clamped: delta !== Number(u.searchParams.get("delta")),
                census, steps,
                verdict: P.verdict({ before: before && (before.decision || before), after: after && (after.decision || after), census }),
                // NOT auto-resumed, and said out loud.
                simState: "PAUSED -- deliberately left that way so the perturbed state can be inspected. POST /economy/resume when done.",
            });
        } catch (e) { return sendJson(unreachable(base, e), 424); }
    }

    if (sp === "/economy/resume") {
        try { const r = await call(base, "/api/sim/resume", "POST"); return sendJson({ ok: r.ok, base, status: r.status }); }
        catch (e) { return sendJson(unreachable(base, e), 424); }
    }
    return sendJson({ ok: false, error: "unknown /economy route" }, 404);
}
module.exports = { owns, handle, ALLOWED, MAX_ABS_DELTA, MAX_TICKS, DEFAULT_BASE };

// ---------------------------------------------------------------------------------------------------------
// v3165 -- STARTING THE SIMULATOR, AND PROVING IT STARTED.
//
// The page could DRIVE a simulator it could not LAUNCH: economy.html has Status, Census, Resume and Probe, and
// "Resume" resumes a sim that is ALREADY RUNNING. The launch command has sat in this file as a `fix:` STRING
// since v3041 -- printed as advice, never executed.
//
// *** SPAWNING IS NOT RUNNING. *** v3107 found ninety-nine kill sites that signalled a process and reported
// stopped:true without ever checking, and the fix was to attach a listener BEFORE signalling and report
// signalled rather than stopped. THE SAME MISTAKE IN REVERSE IS EASIER TO MAKE: spawn() returns a child object
// immediately whether or not the binary exists, whether or not it compiles, whether or not it binds the port.
// A start that reports success on a successful spawn() is reporting that Node managed to ask.
//
// So start() SPAWNS, THEN POLLS THE SIM'S OWN HEALTH ROUTE UNTIL IT ANSWERS -- and until it answers, it has not
// started. The three outcomes are kept apart the way v3120 established: ALREADY-RUNNING (nothing to do),
// STARTED (it answered), FAILED (with the reason, and the child's stderr if there is any).
const { spawn } = require("child_process");
const fsMod = require("fs");
const pathMod = require("path");

const SIM_BASE = "http://127.0.0.1:8080";
let _child = null, _lastErr = null;

/** Where the checkout is expected. NOT guessed: an absent repo is reported as absent, never installed silently. */
function repoDir() {
    const env = process.env.SPACESIM_DIR;
    if (env && fsMod.existsSync(env)) return env;
    for (const c of [pathMod.join(process.cwd(), "..", "spaceprojectsim"),
                     pathMod.join(require("os").homedir(), "spaceprojectsim")]) {
        try { if (fsMod.existsSync(pathMod.join(c, "Cargo.toml"))) return c; } catch {}
    }
    return null;
}

async function answering(timeoutMs = 1500) {
    try {
        const r = await fetch(SIM_BASE + "/api/sim/status", { signal: AbortSignal.timeout(timeoutMs) });
        return r.ok;
    } catch { return false; }
}

function haveCargo() {
    try { return require("child_process").spawnSync("cargo", ["--version"], { timeout: 4000 }).status === 0; }
    catch { return false; }
}

/**
 * THREE DIFFERENT ABSENCES, NAMED SEPARATELY, because they send you to three different places: no checkout
 * (clone it), no cargo (install Rust), checkout present and not running (start it). Collapsing them into
 * "not available" is the failure this project has now named a dozen times.
 */
async function status() {
    const dir = repoDir();
    return {
        running: await answering(),
        repo: dir,
        haveRepo: !!dir,
        haveCargo: haveCargo(),
        managed: !!(_child && _child.exitCode === null),
        lastError: _lastErr,
        base: SIM_BASE,
        fix: "cd spaceprojectsim && set WORLD_SPEED=4.0 && cargo run -p client_bevy -- --headless",
    };
}

/** Spawn, then WAIT FOR THE SIM TO ANSWER. Reports started only when it does. */
async function start({ waitMs = 180000, worldSpeed = "4.0" } = {}) {
    if (await answering()) return { ok: true, state: "ALREADY-RUNNING", why: "the simulator already answers on " + SIM_BASE };
    const dir = repoDir();
    if (!dir) return { ok: false, state: "NO-CHECKOUT", why: "no spaceprojectsim checkout found -- set SPACESIM_DIR or clone it beside the engine" };
    if (!haveCargo()) return { ok: false, state: "NO-CARGO", why: "cargo is not on PATH -- Rust is not installed, which is a different problem from a missing checkout" };

    let stderr = "";
    try {
        _child = spawn("cargo", ["run", "-p", "client_bevy", "--", "--headless"],
            { cwd: dir, windowsHide: true, env: { ...process.env, WORLD_SPEED: String(worldSpeed) },
              stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
        _lastErr = String((e && e.message) || e);
        return { ok: false, state: "SPAWN-FAILED", why: _lastErr };
    }
    _child.stderr.on("data", (d) => { stderr = (stderr + String(d)).slice(-4000); });
    // THE FIRST BUILD IS A CARGO BUILD and can take minutes; the wait is long ON PURPOSE and the reason is
    // stated rather than left as a mystery timeout.
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        if (_child.exitCode !== null) {
            _lastErr = "the process exited with code " + _child.exitCode + (stderr ? " -- " + stderr.slice(-600) : "");
            return { ok: false, state: "EXITED", why: _lastErr };
        }
        if (await answering()) return { ok: true, state: "STARTED", why: "answered on " + SIM_BASE, waitedMs: waitMs - (deadline - Date.now()) };
        await new Promise((r) => setTimeout(r, 1500));
    }
    _lastErr = "spawned but did not answer within " + Math.round(waitMs / 1000) + "s" + (stderr ? " -- " + stderr.slice(-600) : "");
    // NOT KILLED: a cargo build that is still linking is not a failure, it is slow. Saying so beats killing it.
    return { ok: false, state: "NO-ANSWER", why: _lastErr, stillRunning: _child.exitCode === null };
}

module.exports.status = status;
module.exports.start = start;
module.exports.repoDir = repoDir;
