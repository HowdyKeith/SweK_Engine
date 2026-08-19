// WebGLEngine/ai-bridge/freshMachine-selfcheck.mjs — v2545
//
// Run: node ai-bridge/freshMachine-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE SERVER MUST COME UP ON A MACHINE THAT HAS NEVER RUN `npm install`.
//
// This is not hypothetical: the engine is being installed on a machine in another house, to sit there for days.
// Measured before writing this — a fresh copy with node_modules deleted serves HTTP 200, loses only mDNS (and
// says so: "[mdns] bonjour-service not installed"), and POST /sync/peers/add with a tailnet address still returns
// {"ok":true,...}. THE ONE THING YOU WALK INTO ANOTHER HOUSE TO DO WORKS WITH NOTHING INSTALLED.
//
// Nothing protects that. Every machine this is developed on already has node_modules, so one top-level
// `require("some-npm-package")` would kill the fresh-machine path AND NOBODY WOULD NOTICE until they were
// standing in someone else's kitchen with a laptop that will not start.
//
// ---- WHY THIS BOOTS A SERVER INSTEAD OF READING THE SOURCE -------------------------------------------------
//
// The first version of this file counted braces to find top-level requires, on the theory that booting inside the
// gate would fight the developer's own server on :8787. It reported "0 top-level requires, all node core" AND
// PASSED. server.js has 168 requires at line-start. It found NONE of them, because a regex literal containing a
// brace (/\d{2}/) breaks brace-counting, so depth never returns to zero and every line looks nested.
//
// It passed BECAUSE it found nothing. That is precisely what v2541's claims gate refuses -- "a gate that silently
// finds nothing to check is theatre with a green light on it" -- and I wrote that sentence four versions ago and
// then built the thing it describes.
//
// The deeper error: I BUILT A PROXY FOR A PROPERTY I CAN TEST DIRECTLY. The property is "it boots with no
// node_modules". The test for that is to boot it with no node_modules. Brace-counting was a clever way of not
// doing the experiment. The port fight was a real objection with a boring answer: PORT is an env var.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8791;   // not 8787: the gate must never fight a server the developer is already running

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// v3003 -- REPORT WHY, NOT JUST THAT. This used to `catch { return { code: 0 } }`, throwing the cause away.
// Keith's Windows rig reported "...and the sync surface answers -- HTTP 0" and that sentence contains no
// information: HTTP 0 is not a status, it is the absence of one. It could be a refused connection, a timeout, a
// reset socket or a DNS failure, and those are four different bugs with four different fixes.
//
// IT PASSES ON LINUX (HTTP 200 here), so this is Windows-only -- the second such defect this rig run has
// surfaced, after the ERR_UNSUPPORTED_ESM_URL_SCHEME crash. I cannot reproduce it and I am not going to guess at
// it. WHAT I CAN DO IS MAKE THE FAILURE DIAGNOSABLE ON THE MACHINE THAT HAS IT, which is the only honest move
// available: the next run will name the cause instead of erasing it.
//
// The timeout is called out separately because it is the one candidate the code itself suggests: /sync/status
// calls listModels(root), which walks the asset tree, and a slow walk on a cold Windows filesystem would
// produce exactly this symptom while nothing was actually broken.
const TIMEOUT_MS = 4000;
const get = async (p) => {
    try {
        const r = await fetch("http://127.0.0.1:" + PORT + p, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        return { code: r.status, text: await r.text(), why: null };
    } catch (e) {
        const name = (e && e.name) || "Error";
        const cause = e && e.cause ? (e.cause.code || e.cause.message || String(e.cause)) : null;
        const why = name === "TimeoutError"
            ? "TIMED OUT after " + TIMEOUT_MS + "ms -- the server did not answer in time, which is different from refusing"
            : (cause ? name + " / " + cause : name + ": " + ((e && e.message) || "no message"));
        return { code: 0, text: "", why };
    }
};

// ---- build a fresh machine: a copy with no node_modules -----------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "freshmac-"));
const dst = path.join(tmp, "WebGLEngine");
fs.cpSync(path.join(here, ".."), dst, { recursive: true, filter: (s) => !s.includes("node_modules") });
const hadModules = fs.existsSync(path.join(dst, "ai-bridge", "node_modules"));

let log = "";
const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(dst, "ai-bridge"),
    env: { ...process.env, PORT: String(PORT), BRAIN_TRACE: "" },
    stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
// The sabotage test exposed this: when a top-level require fails, node dies FAST and the failure message came out
// as "log: undefined" -- useless. Capture the exit so the gate can say WHY, not just that.
let exited = null;
child.on("exit", (code, sig) => (exited = { code, sig }));

try {
    ok("the fresh copy really has no node_modules", !hadModules, hadModules ? "the filter did not work -- this test would prove nothing" : "deleted");

    let up = { code: 0 };
    for (let i = 0; i < 20 && !up.code; i++) { await sleep(600); up = await get("/"); }

    // ---- THE ONE THAT MATTERS ------------------------------------------------------------------------------
    ok("THE SERVER BOOTS WITH NO npm install", up.code === 200,
       up.code ? "HTTP " + up.code
               : "NEVER CAME UP" + (exited ? " (exit " + exited.code + ")" : "") +
                 ((log.match(/Cannot find module '([^']+)'/) || [])[1]
                    ? " -- a top-level require of '" + log.match(/Cannot find module '([^']+)'/)[1] + "' would strand a fresh machine"
                    : (log.split("\n").find((l) => /error/i.test(l)) || "no output captured").trim().slice(0, 70)));

    // ---- the thing he walked into another house to do -------------------------------------------------------
    if (up.code === 200) {
        let added = { ok: false };
        try {
            const r = await fetch("http://127.0.0.1:" + PORT + "/sync/peers/add", {
                method: "POST", headers: { "Content-Type": "application/json" },
                // 8s, not 4: v2545 made the add DIAL the peer (3s bound), and a test whose timeout is shorter
                // than the thing it tests measures its own timeout. The 4s version failed for exactly that.
                body: JSON.stringify({ url: "http://100.90.1.5:8787" }), signal: AbortSignal.timeout(8000),
            });
            added = await r.json();
        } catch (e) { added = { ok: false, error: String(e.message).slice(0, 40) }; }
        const took = added.ok && Array.isArray(added.peers) && added.peers.some((p) => String(p).includes("100.90.1.5"));
        // and the honesty of the answer matters as much as the answer: nothing is listening on 100.90.1.5 here,
        // so `reachable` MUST be false. If it ever says true, the probe is not probing.
        ok("...and it does NOT claim an absent peer is reachable", added.reachable === false,
           "reachable=" + added.reachable + " -- nothing is listening on that address, and an add that says otherwise is lying");
        ok("A TAILNET PEER CAN BE ADDED ON A MACHINE WITH NOTHING INSTALLED", took,
           took ? "POST /sync/peers/add -> " + JSON.stringify(added.peers.filter((p) => String(p).includes("100."))) : JSON.stringify(added).slice(0, 60));
        await fetch("http://127.0.0.1:" + PORT + "/sync/peers/remove", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "http://100.90.1.5:8787" }),
        }).catch(() => {});

        // The diagnosis path must WORK, or the next Windows run reports a bare 0 again. Proven against a port
        // nothing listens on: a failure has to arrive carrying a reason, not an empty string.
        const dead = await get.call(null, "/definitely-not-a-route-9f3a");
        ok("!! a failed request reports a CAUSE, not just a code", dead.code === 404 || (dead.code === 0 && !!dead.why),
           dead.code === 404 ? "404 (route missing, server healthy)" : "code 0 with: " + dead.why);

        const sync = await get("/sync/status");
        ok("...and the sync surface answers", sync.code === 200,
           sync.code === 200 ? "HTTP 200" : "HTTP " + sync.code + (sync.why ? " -- " + sync.why : "") +
           ". This passes on Linux; a bare 0 here names nothing, so the cause is now reported instead of discarded.");
    }

    // ---- what it LOSES must be said out loud, not silently skipped ------------------------------------------
    ok("the missing dep announces itself instead of failing silently", /mdns|bonjour/i.test(log),
       (log.split("\n").find((l) => /mdns|bonjour/i.test(l)) || "no [mdns] line").trim().slice(0, 76));
    // This must not pass when the server never booted. The sabotage run showed it doing exactly that -- it saw no
    // MODULE_NOT_FOUND in an empty log and called that success. A check that passes on no evidence is theatre.
    ok("...and nothing crashed on the way up", up.code === 200 && !/MODULE_NOT_FOUND/.test(log),
       up.code !== 200 ? "cannot say -- the server never booted (this check requires evidence, not the absence of it)"
                       : "no MODULE_NOT_FOUND");

    // ---- the advice in the warning must be true --------------------------------------------------------------
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));
    ok("the dep the warning tells you to install is actually declared", !!(pkg.dependencies || {})["bonjour-service"],
       "the [mdns] line says `npm install bonjour-service` -- if it is not in package.json that advice is a lie");
} finally {
    child.kill("SIGKILL");
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

console.log(fails ? "\nfreshMachine-selfcheck: " + fails + " FAILED" : "\nfreshMachine-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
