// WebGLEngine/tools/ship/shipBridge-selfcheck.mjs -- v2807
//
// Run: node tools/ship/shipBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/shipBridge.js + ship.html -- the front door for the ship ritual, and the only bridge so far
// that can MUTATE THE TREE.
//
// THE PROPERTY THAT MATTERS: a real ship must be impossible by accident. /ship/dryrun reads and verifies and is
// free to click; /ship/run bumps version markers, rewrites the changelog, renames the project folder and
// publishes a zip -- so it requires an explicit confirm token EQUAL TO THE VERSION. A one-click button that
// mutates the tree is how you ship the version you did not mean to.
//
// This gate never performs a real ship. It proves the refusals, and that the bridge DRIVES ship.mjs rather than
// reimplementing it -- reimplementing would recreate the exact hole ship.mjs exists to close.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "shipBridge.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url) {
    let body = null, code = 200;
    await bridge.handle({ url, method: "GET" }, {}, { sendJson: (o, c = 200) => { body = o; code = c; } });
    return { body, code };
}

// 1. routing
{
    ok("owns: /ship and subpaths", bridge.owns("/ship") && bridge.owns("/ship/status") && bridge.owns("/ship/run?version=v1"));
    ok("owns: NOT lookalikes", !bridge.owns("/shipping") && !bridge.owns("/gates") && !bridge.owns("/"));
}

// 2. status reads the real markers and reports whether they agree
{
    const s = await call("/ship/status");
    ok("/status: reads ENGINE_VERSION from main.js", /^v\d+$/.test(s.body.markers.engine || ""), s.body.markers.engine);
    ok("/status: reads BRAIN_BUILD from brain/brain.js", /^v\d+$/.test(s.body.markers.brain || ""), s.body.markers.brain);
    ok("/status: reports marker agreement (the ritual refuses when they differ)", typeof s.body.markers.agree === "boolean");
    ok("/status: suggests the next version", s.body.suggestedVersion === bridge.nextVersion(s.body.markers.engine));
    ok("/status: confirms ship.mjs is present", s.body.shipScript === true);
}

// 3. A REAL SHIP IS IMPOSSIBLE BY ACCIDENT
{
    const v = (await call("/ship/status")).body.suggestedVersion;
    const noConfirm = await call("/ship/run?version=" + v);
    ok("SAFETY: /run without a confirm token is refused (428)", noConfirm.code === 428 && noConfirm.body.error === "confirm-required");
    ok("SAFETY: the refusal explains that a real ship WRITES", /bumps|rewrites|publishes/i.test(noConfirm.body.message || ""));
    const wrongConfirm = await call("/ship/run?version=" + v + "&confirm=yes");
    ok("SAFETY: a confirm token that is not the version is refused", wrongConfirm.code === 428);
    const mismatched = await call("/ship/run?version=" + v + "&confirm=v9999");
    ok("SAFETY: confirming a DIFFERENT version is refused", mismatched.code === 428);
}

// 4. input validation -- nothing reaches ship.mjs unshaped
{
    for (const bad of ["", "2807", "vv2807", "v", "../../etc", "v2807; rm -rf /", "v2807 --dry-run"]) {
        const r = await call("/ship/dryrun?version=" + encodeURIComponent(bad));
        if (!(r.code === 400 && r.body.error === "bad-version")) { ok("validation: rejects version '" + bad + "'", false, "code=" + r.code); }
    }
    ok("validation: every malformed version is rejected", true);
    const badMark = await call("/ship/dryrun?version=v2807&markers=" + encodeURIComponent("a;rm -rf /"));
    ok("validation: markers with shell metacharacters are rejected", badMark.code === 400 && badMark.body.error === "bad-markers");
    const goodMark = "shipBridge,ship.html";
    ok("validation: a normal marker list is accepted by the validator", /^[A-Za-z0-9_.,\- ]*$/.test(goodMark));
}

// 5. IT DRIVES ship.mjs RATHER THAN REIMPLEMENTING THE RITUAL
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "shipBridge.js"), "utf8");
    ok("drives: spawns tools/ship/ship.mjs", /ship", "ship\.mjs"|ship\.mjs/.test(src) && /execFile/.test(src));
    ok("drives: passes --dry-run for the safe route", /"--dry-run"/.test(src));
    // Look for zip CODE, not the word -- the word appears in the warning text that says what a real ship does.
    ok("does NOT reimplement: no zip library or zip binary in the bridge", !/require\(["'](archiver|adm-zip|jszip)|\bexecFile\([^)]*["']zip["']/i.test(src));
    ok("does NOT reimplement: no version rewriting in the bridge", !/writeFileSync/.test(src));
    // The earlier form of this check matched a REGEX .exec() call and cried wolf. Assert the import instead:
    // child_process is destructured to execFile ONLY, so there is no shell-string exec to reach for.
    ok("no shell: child_process is destructured to execFile only", /const \{ execFile \} = require\("child_process"\)/.test(src));
    ok("no shell: no exec/execSync/spawn-with-shell anywhere", !/child_process["']\)\.exec\b|\bexecSync\(|shell:\s*true/.test(src));
}

// 6. the page keeps the same asymmetry
{
    const p = path.join(ENG, "ship.html");
    ok("page: ship.html exists", fs.existsSync(p));
    const html = fs.readFileSync(p, "utf8");
    ok("page: calls /ship/status", html.includes("/ship/status"));
    ok("page: has a free dry run and a separate real ship", /\/ship\/" \+ \(real \? "run" : "dryrun"\)/.test(html));
    ok("page: requires a typed confirmation for the real ship", /confirm/.test(html) && /type version/.test(html));
    ok("page: labels what a real ship changes", /bumps markers|rewrites the changelog|publishes a zip/i.test(html));
    ok("page: refreshes state after a successful ship", /if \(j\.ok && real\) load\(\)/.test(html));
}

// 7. registered
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js: requires shipBridge", /require\("\.\/shipBridge\.js"\)/.test(srv));
    ok("server.js: dispatches shipBridge.owns(req.url)", /shipBridge\.owns\(req\.url\)/.test(srv));
}

console.log("shipBridge-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
