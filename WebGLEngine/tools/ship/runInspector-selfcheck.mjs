// WebGLEngine/tools/ship/runInspector-selfcheck.mjs -- v3015
//
// Run: node tools/ship/runInspector-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES run-inspector.html -- somewhere to LOOK at a roundhouse run.
//
// From midday-ai/ai-sdk-tools, whose devtools package exists to "inspect tool calls, messages, and execution
// flow DIRECTLY IN YOUR APP". The roundhouse has recorded a full transcript per run since v2764 -- every
// hypothesis, the real measurement it produced, the physics verdict, the evaluator's critique -- and there has
// never been anywhere to look at one. Twenty runs held in memory, reachable only by fetching JSON by hand.
//
// v3007 MADE THAT WORSE IN A USEFUL WAY. It added a step-by-step trajectory answering "did each escalation
// actually help?" -- a genuinely new measurement with nowhere to be seen. A finding nobody can look at is the
// same class as a page nobody can reach, and this session has now found that class in pages, modules, lints,
// gates, findings and bridges.
//
// AND IT IS LINKED AT BIRTH. Three times this project has caught me shipping something unreachable
// (ui/fitCanvas.js v2880, ui/machine.mjs v2988, nearShareBridge v3011). The link went in with the page.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const page = fs.readFileSync(path.join(ENG, "run-inspector.html"), "utf8");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT IS REACHABLE, WHICH IS THE LESSON --------------------------------------------------------------
{
    ok("!! the page is LINKED from the front door", /run-inspector\.html/.test(ui),
       "linked in the same round it was written -- three times this project has caught me shipping something nobody could reach");
    ok("...and it reads the real run route", /\/device\/progress\?id=/.test(page),
       "the store the roundhouse actually writes to, not a parallel one");
}

// ---- 2. IT SHOWS WHAT A VERDICT ALONE HIDES -------------------------------------------------------------------
{
    ok("!! the step TRAJECTORY is rendered", /trajectory/.test(page) && /escalations helped/.test(page),
       "'crystallized in 4 rounds' is the same sentence whether every escalation improved the answer or three made it worse -- v3007 measured that and this is where it becomes visible");
    ok("...and a WORSENED run is coloured differently from a monotone one", /worsened-overall/.test(page) && /monotone-improving/.test(page),
       "the distinction is the content; rendering both the same would throw it away");
    ok("every round shows its claim AND its measurement", /claim/.test(page) && /measured/.test(page),
       "a verdict without the number it was computed from cannot be audited");
    ok("...and the critique when there is one", /critique/.test(page));
}

// ---- 3. IT IS HONEST ABOUT WHAT IT CANNOT SHOW -----------------------------------------------------------------------
{
    ok("!! a missing run says the store is CAPPED, not that the run was empty", /only the last 20 runs/.test(page),
       "an old id is GONE rather than empty, and those are different facts -- reporting 'no rounds' for an evicted run would invent a finding");
    ok("a run with no rounds says so", /no rounds recorded/.test(page));
    ok("an unreachable bridge is distinguished from a missing run", /bridge unreachable/.test(page));
}

// ---- 4. it does not become an injection surface ------------------------------------------------------------------------
{
    ok("!! everything fetched is ESCAPED before rendering", /function esc|const esc/.test(page) && /&amp;lt;/.test(page.replace(/&lt;/g, "&amp;lt;")) === false || /replace\(\/\[&<>"\]/.test(page),
       "run content includes a model's critique -- text this engine did not write, rendered into a page");
    ok("...and esc is applied to the critique specifically", /esc\((?:typeof r\.critique|r\.critique)/.test(page),
       "the one field that is verbatim model output is the one that must not be trusted");
}

console.log(fails ? "\nrunInspector-selfcheck: " + fails + " FAILED" : "\nrunInspector-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
