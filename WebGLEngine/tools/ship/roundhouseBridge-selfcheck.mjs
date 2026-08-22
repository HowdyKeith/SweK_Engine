// WebGLEngine/tools/ship/roundhouseBridge-selfcheck.mjs -- v2804
//
// Run: node tools/ship/roundhouseBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/roundhouseBridge.js + roundhouse.html -- the front door that makes the agent runnable from the
// engine instead of a console.
//
// THE SECURITY PROPERTY THIS EXISTS FOR: the API key must never reach the browser. The page asks the bridge to
// run a route; the bridge resolves the key server-side (credential vault, else env) and returns only the route
// RESULT. /status reports availability as a boolean. This gate drives the real handler with a fake key in the
// environment and asserts the key value appears in NO response.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "roundhouseBridge.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// tiny harness: call handle() and capture what sendJson would have written
async function call(url, method = "GET", body = null) {
    let captured = null, code = 200;
    const req = { url, method, on(ev, cb) { if (ev === "data" && body) cb(JSON.stringify(body)); if (ev === "end") cb(); return req; } };
    const sendJson = (obj, c = 200) => { captured = obj; code = c; };
    await bridge.handle(req, {}, { sendJson });
    return { body: captured, code };
}

// 1. ROUTING: owns() claims its prefix and nothing else
{
    ok("owns: /roundhouse and subpaths", bridge.owns("/roundhouse") && bridge.owns("/roundhouse/status") && bridge.owns("/roundhouse/run?dry=1"));
    ok("owns: NOT a lookalike path", !bridge.owns("/roundhouseX") && !bridge.owns("/services") && !bridge.owns("/"));
    ok("owns: tolerates a non-string url", !bridge.owns(undefined) && !bridge.owns(null));
}

// 2. THE KEY NEVER REACHES THE BROWSER
{
    const FAKE = "sk-ant-THIS-MUST-NEVER-APPEAR-IN-A-RESPONSE";
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = FAKE;

    const status = await call("/roundhouse/status");
    const leakedStatus = JSON.stringify(status.body).includes(FAKE);
    ok("SECURITY: /status never returns the key value", !leakedStatus);
    ok("/status reports key availability as a BOOLEAN", status.body && status.body.key && status.body.key.available === true && typeof status.body.key.available === "boolean");

    const run = await call("/roundhouse/run", "POST", { dry: true });
    const leakedRun = JSON.stringify(run.body).includes(FAKE);
    ok("SECURITY: /run never returns the key value", !leakedRun);

    const bench = await call("/roundhouse/bench", "POST", { dry: true, count: 3 });
    ok("SECURITY: /bench never returns the key value", !JSON.stringify(bench.body).includes(FAKE));

    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
}

// 3. keyAvailable() itself returns availability, not the secret
{
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-SECRET-VALUE";
    const k = bridge.keyAvailable();
    ok("keyAvailable(): reports availability without the value", k.available === true && !JSON.stringify(k).includes("SECRET-VALUE"));
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
}

// 4. DRY RUN works end to end through the bridge (no key, no network)
{
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await call("/roundhouse/run", "POST", { dry: true });
    ok("dry run: succeeds with no key at all", r.body && r.body.ok === true && r.body.dry === true);
    ok("dry run: returns the SweK gate truth for the task", r.body.truth === 94, "truth=" + (r.body && r.body.truth));
    ok("dry run: reports per-model gate verdicts", Array.isArray(r.body.steps) && r.body.steps.length >= 1 && typeof r.body.steps[0].verified === "boolean");
    ok("dry run: reports the replay audit", typeof r.body.replayConsistent === "boolean" && r.body.replayConsistent === true);
    ok("dry run: reports savings arithmetic", typeof r.body.saved === "number" && r.body.ifAlwaysStrongest > 0);
    const b = await call("/roundhouse/bench", "POST", { dry: true, count: 4 });
    ok("dry bench: runs the requested batch", b.body && b.body.ok === true && b.body.stats.tasks === 4);
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
}

// 5. NO KEY + live request -> a clear refusal, not a crash or a silent dry run
{
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await call("/roundhouse/run", "POST", { dry: false });
    const refused = r.body && r.body.ok === false && r.body.error === "no-key";
    // on a machine WITH a vault key this legitimately succeeds; only assert the refusal shape when it refused
    ok("no key: live run refuses clearly (or a vault key was found)", refused ? r.code === 400 && /key/i.test(r.body.message) : (r.body && r.body.ok === true), refused ? "refused as expected" : "vault supplied a key");
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
}

// 6. unknown subroute is a 404, not a 200 with junk
{
    const r = await call("/roundhouse/nope");
    ok("unknown subroute -> 404", r.code === 404 && r.body.ok === false);
}

// 7. THE PAGE exists and drives the real endpoints
{
    const p = path.join(ENG, "roundhouse.html");
    ok("page: roundhouse.html exists", fs.existsSync(p));
    const html = fs.readFileSync(p, "utf8");
    for (const ep of ["/roundhouse/status", "/roundhouse/"]) ok(`page: calls ${ep}`, html.includes(ep));
    ok("page: offers the no-key dry run", /Dry run/i.test(html));
    ok("page: disables live buttons when no key is available", /disabled\s*=\s*!keyReady/.test(html));
    ok("page: never asks the user to paste a key into the browser", !/type="password"/i.test(html) && !/ANTHROPIC_API_KEY\s*=/.test(html.replace(/set ANTHROPIC_API_KEY/g, "")));
}

// 8. the bridge is registered in the server dispatch
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js: requires roundhouseBridge", /require\("\.\/roundhouseBridge\.js"\)/.test(srv));
    ok("server.js: dispatches roundhouseBridge.owns(req.url)", /roundhouseBridge\.owns\(req\.url\)/.test(srv));
}

// 9. stale model identifiers are gone from the shipping call paths
{
    for (const rel of ["ai-bridge/aiProviders.js", "tools/roundhouse/roundhouse.mjs"]) {
        const s = fs.readFileSync(path.join(ENG, rel), "utf8");
        ok(`${rel}: no retired model strings`, !/claude-sonnet-4-6|claude-opus-4-1\b/.test(s));
    }
}

console.log("roundhouseBridge-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
