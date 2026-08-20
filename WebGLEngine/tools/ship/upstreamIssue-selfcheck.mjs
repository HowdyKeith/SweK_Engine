// tools/ship/upstreamIssue-selfcheck.mjs
//
// Run: node tools/ship/upstreamIssue-selfcheck.mjs   (instant)
//
// v3135 -- A MEASUREMENT THAT NEVER LEAVES THE BOX IS A MEASUREMENT NOBODY ELSE CAN USE.
//
// Keith's clean baseline of Kalcode/spaceprojectsim has been sitting in chat and in one module's header comment
// for many rounds. Their CONTRIBUTING asks for exactly this shape of report. The draft now lives in
// docs/upstream/ where it can be copied out.
//
// *** AND THE NUMBERS IN IT MUST BE THE NUMBERS IN THE PROBE. *** They are two statements about ONE run.
// v3131, v3132 and v3134 were each a pair of declarations about one thing that had drifted apart and never been
// compared -- a predicate against its reason, a note against its value list, a nuisance base against a
// refinement register. THIS IS THE FOURTH PAIR, and it is checked from the day it is created rather than three
// rounds after somebody edits one side.
//
// PROVENANCE IS ASSERTED TOO. The run is Keith's, on his hardware; the waterfall analysis is ours and is a
// HYPOTHESIS. A document that blurred those would be claiming to have confirmed something inside a codebase we
// have only read traces from -- and the ask is for a bug report, not for a verdict we are not entitled to.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const doc = fs.readFileSync(path.join(ENG, "docs", "upstream", "spaceprojectsim-economy-does-not-converge.md"), "utf8");
const probe = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "economyProbe.mjs"), "utf8");

// ---- 1. ONE RUN, TWO DOCUMENTS, SAME NUMBERS -----------------------------------------------------------------
{
    const shared = ["213", "282", "133-138", "190", "5920"];
    const missing = shared.filter((n) => !(doc.includes(n) && probe.includes(n)));
    ok("!! every fleet-state number in the issue also appears in the probe",
        missing.length === 0,
        shared.join(", ") + (missing.length ? "; MISSING FROM ONE SIDE: " + missing.join(", ") : "") +
        ". Two statements about ONE run. The last three rounds were each a pair of declarations that had " +
        "drifted apart and never been compared -- this pair is checked from the day it exists");

    ok("...and the waterfall rungs match the module's own list",
        ["rest_crew", "refuel", "sell_cargo", "seek_retrofit"].every((r) => doc.includes(r) && probe.includes(r)),
        "the issue describes their goal ordering and the probe encodes it as WATERFALL. If somebody adds a rung " +
        "to one, the other is now wrong and this says so");
}

// ---- 2. THE PROBE'S VOCABULARY IS REPRODUCED HONESTLY ------------------------------------------------------------
{
    const outcomes = ["MOVED", "UNMOVED", "BLOCKED", "INSUFFICIENT", "NO-TRACE"];
    ok("!! all five probe outcomes are described, not just the interesting two",
        outcomes.every((o) => doc.includes(o) && probe.includes(o)),
        "UNMOVED versus BLOCKED is the whole point -- without it, 'the price change did nothing' is ambiguous " +
        "between an unresponsive market model and nobody listening, and those have different fixes. Listing " +
        "only MOVED and UNMOVED would have sold the probe as more decisive than it is");
}

// ---- 3. PROVENANCE, BECAUSE THE DOCUMENT LEAVES THE BUILDING -------------------------------------------------------
{
    ok("!! the run is attributed and the analysis is marked as a hypothesis",
        /Provenance/i.test(doc) && /hypothesis/i.test(doc) && /not\s+as\s+a\s+claim\s+we\s+have\s+confirmed/i.test(doc),
        "the numbers are Keith's measurements on his hardware; the waterfall reading is OURS, drawn from their " +
        "published traces. Blurring them would claim we confirmed something inside a codebase we have only " +
        "read traces from");

    ok("...and it asks questions rather than only asserting",
        /cannot answer from outside/i.test(doc) && (doc.match(/^\d\. /gm) || []).length >= 3,
        "three things only they can settle. A report that had answered them for them would be easy to dismiss " +
        "and would deserve to be");
}

// ---- 4. AND THE PAGE IS NOW EXERCISED ------------------------------------------------------------------------------
{
    const man = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
    const page = fs.readFileSync(path.join(ENG, "economy.html"), "utf8");
    ok("!! economy.html is in the render-qa manifest",
        man.pages.some((p) => p.name === "economy"),
        man.pages.length + " pages. It was linked from server.html and render-qa had never opened it -- v3123's " +
        "shape with the halves swapped: human-reachable and machine-unreachable");

    ok("...and it renders WITHOUT the simulator, so a sim-less QA box is a valid pass",
        /if\(!d\.ok\)\{/.test(page) && /the simulator is not answering on/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "economyBridge.js"), "utf8")),
        "every handler checks d.ok and shows the NAMED failure. A page that rendered blank without the sim " +
        "would fail QA for a reason that is not a defect, and would then be excluded and never checked again");
}

console.log();
if (fails) { console.log("upstreamIssue-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("upstreamIssue-selfcheck: all checks pass");
