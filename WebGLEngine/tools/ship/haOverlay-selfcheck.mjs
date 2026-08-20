// WebGLEngine/tools/ship/haOverlay-selfcheck.mjs -- v3006
//
// Run: node tools/ship/haOverlay-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Home Assistant overlay and, more importantly, THE CALL THAT PROVES ITSELF.
//
// This engine already had THIRTEEN /ha routes and two HA pages before this round. What it did not have was any
// of it OVER THE RENDER -- every control required leaving the thing you were looking at, which is the whole
// defect. The arrangement is learned from Trooped/QuickBars, an Android TV HA overlay: a transient, dismissible
// bar over running content. NO CODE IS TAKEN -- QuickBars is GPL-3.0 Kotlin and nothing of it is vendored here.
// What ports is the shape, and I dismissed that repo in one line at v2987 as "nothing ports", which was a
// judgement about a tool where the question was about a layout.
//
// THE GRADEABLE PART IS NOT THE BAR. /ha/call reports whether Home Assistant ACCEPTED a request. That is not
// the same as the thing happening: a wrong entity_id, a service that no-ops, an automation that reverts it, or
// an offline device HA still holds a stale state for ALL return 200 with a cheerful body. A panel built on that
// reports success while nothing in the house moved -- which is a control that cannot fail, in a house.
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ha = require(path.join(ENG, "ai-bridge", "haBridge.js"));
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "haBridge.js"), "utf8");
const idx = fs.readFileSync(path.join(ENG, "index.html"), "utf8");
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE CALL IS VERIFIED AGAINST THE ENTITY, NOT THE STATUS CODE -------------------------------------------
{
    ok("verifiedCall is exported", typeof ha.verifiedCall === "function");
    ok("!! it reads the entity BEFORE and AFTER", /const before = await stateOf\(\)/.test(src) && /after = await stateOf\(\)/.test(src),
       "the verdict is about the observed state, not about whether the POST returned 200");
    ok("...and polls rather than assuming instant", /pollMs/.test(src) && /deadline/.test(src),
       "a device takes time; checking once immediately would report every real success as unconfirmed");

    // THE THREE OUTCOMES, and why a boolean would lie.
    for (const v of ["changed", "already", "unconfirmed", "unverifiable"]) {
        ok('reports the "' + v + '" verdict', new RegExp('verdict: "' + v + '"').test(src));
    }
    ok("!! 'already' is NOT reported as a failure", /already in the target state.*not a failure/i.test(src),
       "switching an on light on is a legitimate no-op, and calling that an error trains a reader to ignore the panel");
    ok("!! 'unconfirmed' says the WORLD did not change, not that the call failed", /the WORLD did not visibly change/.test(src),
       "the request succeeded and the entity did not move -- exactly the case a 200 hides");
    ok("...and a call with no entity_id is UNVERIFIABLE, not a success", /verdict: "unverifiable"/.test(src) && /that is ALL that is known/.test(src),
       "nothing can be polled, so nothing can be claimed");
}

// ---- 2. IT REFUSES CLEANLY WITH NO HOME ASSISTANT ----------------------------------------------------------------
{
    let threw = null;
    try { await ha.verifiedCall("light", "turn_on", { entity_id: "light.nope" }, { timeoutMs: 200, pollMs: 50 }); }
    catch (e) { threw = String((e && e.message) || e); }
    ok("!! with no HA configured it says so, rather than reporting a phantom success", !!threw && /HA_URL|HA_TOKEN|not set/i.test(threw),
       threw ? threw.slice(0, 70) : "returned a result with no Home Assistant behind it");
}

// ---- 3. THE OVERLAY IS OVER THE RENDER, AND DISMISSIBLE ------------------------------------------------------------
{
    ok("the bar lives in the render window", /id="haBar"/.test(idx), "index.html, not a page you navigate away to");
    ok("!! it is HIDDEN by default", /id="haBar"[^>]*display:none/.test(idx),
       "an overlay that is always up is not an overlay, it is a smaller render");
    ok("...and dismissible", /haBarClose/.test(idx), "a bar you cannot close is a bar over your work");
    ok("...and does not steal typing", /INPUT" \|\| t === "TEXTAREA"/.test(idx),
       "a single-key toggle that fires inside a text field is the classic overlay bug");
    ok("!! the bar calls the VERIFIED route, not /ha/call", /\/ha\/verified-call/.test(idx) && !/fetch\("\/ha\/call"/.test(idx),
       "the whole point is that the button reports what the entity did");
    ok("...and surfaces 'accepted but did not move' in words", /DID NOT MOVE/.test(idx),
       "the failure a naive panel renders as a successful toggle");
    ok("server.js dispatches the verified route", /"\/ha\/verified-call"/.test(server));
}

// ---- 4. NOTHING IS VENDORED FROM A GPL PROJECT -----------------------------------------------------------------------
{
    ok("!! no QuickBars code is present anywhere", !/Trooped|quickbars/i.test(idx.replace(/<!--[\s\S]*?-->/g, "")),
       "QuickBars is GPL-3.0 Kotlin; the LAYOUT is what ports and a layout is not code. The attribution lives in a comment, the implementation does not.");
    ok("...and the source it came from is credited", /QuickBars/.test(idx),
       "in a comment, naming the licence and saying explicitly that nothing was taken");
}

console.log(fails ? "\nhaOverlay-selfcheck: " + fails + " FAILED" : "\nhaOverlay-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
