// WebGLEngine/tools/ship/economyBridge-selfcheck.mjs -- v3041
// This is the first bridge whose failure mode is DAMAGING A THIRD-PARTY SYSTEM. The checks are about what it
// refuses, not what it returns.
"use strict";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { prose } from "./sourceScan.mjs";
import { createRequire } from "node:module";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const B = createRequire(import.meta.url)(path.join(ENG, "ai-bridge", "economyBridge.js"));
let fails = 0; const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const allows = (p) => B.ALLOWED.some((re) => re.test(p));

// ---- 1. THE ALLOW-LIST IS THE SAFETY -----------------------------------------------------------------------
{
    for (const p of ["/api/health", "/api/ships", "/api/sim/pause", "/api/sim/step", "/api/sim/resume",
                     "/api/admin/markets/market-earth-station/supply", "/api/debug/agent/ship-7/trace"])
        if (!allows(p)) ok("allows the probe route " + p, false);
    ok("all five probe routes are reachable", true, "health, ships, sim/*, one market supply, one agent trace");
    const denied = ["/api/admin/save", "/api/admin/ships", "/api/admin/facilities", "/api/admin/tuning",
                    "/api/admin/factions/a/relations/b", "/api/sim/../admin/save", "/api/admin/markets/../../save",
                    "/api/report", "/api/contracts", "/"];
    for (const p of denied) if (allows(p)) { ok("!! REFUSES " + p, false); }
    ok("!! every other admin route is REFUSED", denied.every((p) => !allows(p)),
       "their API has 33 routes and 12 of them WRITE -- create ships, destroy facilities, rewrite faction relations, save over the world. This bridge reaches five, so an open localhost port does not become a general remote into someone else's simulation.");
    ok("!! traversal cannot escape the market pattern", !allows("/api/admin/markets/..%2f..%2fsave/supply") && !allows("/api/admin/markets/a/b/supply"),
       "the location segment is [A-Za-z0-9._-] only -- no slashes, so it cannot walk out of its own route");
}

// ---- 2. CLAMPS AND LOOPBACK -------------------------------------------------------------------------------
{
    ok("the delta is clamped", B.MAX_ABS_DELTA > 0 && B.MAX_ABS_DELTA <= 100000, "+-" + B.MAX_ABS_DELTA + " -- a typo cannot empty a market");
    ok("the step count is clamped", B.MAX_TICKS >= 1 && B.MAX_TICKS <= 1000, "<=" + B.MAX_TICKS + " ticks");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "economyBridge.js"), "utf8");
    ok("!! the base URL must be LOOPBACK", /127\\.0\\.0\\.1\|localhost/.test(src) && /must be loopback/.test(src),
       "this writes to an admin API; pointing it at a remote host would be aiming a mutation tool across a network");
    ok("it defaults to their documented port", B.DEFAULT_BASE === "http://127.0.0.1:8080");
}

// ---- 3. IT DOES NOT SCORE, AND IT DOES NOT HEAL -------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "economyBridge.js"), "utf8");
    ok("!! it imports the verdict rather than computing one", /P\.verdict\(/.test(src) && /P\.bandCensus\(/.test(src) && !/function verdict|function bandCensus/.test(src),
       "a dashboard that disagrees with its own gate is worse than none, because it is believed");
    ok("!! it NEVER auto-resumes after a probe", /simState: "PAUSED/.test(src) && !/sim\/resume".*probe/s.test(src.split("/economy/probe")[1] || ""),
       "silently restoring state is the same reflex as re-uploading a diverged cache -- it destroys the moment you wanted to look at");
    ok("resume is a separate, explicit route", /sp === "\/economy\/resume"/.test(src));
    ok("!! an unreachable sim REFUSES WITH THE FIX", /cargo run -p client_bevy -- --headless/.test(src),
       "an empty census would render as 'no ships in the band', which is a claim about their world rather than about ours not reaching it");
    ok("a changed /api/ships shape refuses rather than censusing nothing", /did not return an array/.test(src));

    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js dispatches it", /economyBridge\.owns\(req\.url\)/.test(srv) && /economyBridge\.handle\(/.test(srv));

    const page = path.join(ENG, "economy.html");
    ok("!! EVERY TOOL NEEDS A FRONT DOOR: economy.html exists", fs.existsSync(page));
    const html = fs.readFileSync(page, "utf8");
    ok("!! the page shows BAND POPULATION beside the verdict", /band size/.test(html) && /census\.band/.test(html),
       "an outcome without the band size is a claim about the planner made from a sample that may not exist");
    ok("the page says the sim is left PAUSED and offers an explicit resume", /simState/.test(html) && /Resume sim/.test(html));
    ok("it warns the sweep must be multiplicative", /multiplicatively/.test(html));
}
// v3045 -- THE CHECK THIS GATE WAS MISSING, and it is the one that would have bitten first.
//
// "it imports the verdict rather than computing one" is a SOURCE GREP. It passes whether or not the module being
// imported exists. economyProbe.mjs is loaded with a lazy `await import` inside handle(), so requiring the bridge
// succeeds, every other check here succeeds, the page loads, the button renders -- and the first press returns a
// 500 from a module resolution failure. A gate that proves delegation without proving the delegate EXISTS is
// checking the half that cannot fail.
{
    const probe = path.join(ENG, "tools", "roundhouse", "economyProbe.mjs");
    const there = fs.existsSync(probe);
    ok("!! the module the bridge delegates to actually EXISTS", there,
       there ? "tools/roundhouse/economyProbe.mjs" :
       "MISSING: tools/roundhouse/economyProbe.mjs -- the bridge lazy-imports it inside handle(), so everything " +
       "loads and the FIRST CENSUS PRESS 500s. It came from an earlier drop that never landed in this tree.");
    if (there) {
        const src2 = fs.readFileSync(probe, "utf8");
        for (const name of ["bandCensus", "perturbationPlan", "verdict"])
            ok("...and exports " + name, new RegExp("export (function|const) " + name + "\\b").test(src2));
    }
}

console.log("\neconomyBridge-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
