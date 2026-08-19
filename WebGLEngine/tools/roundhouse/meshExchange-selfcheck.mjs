// tools/roundhouse/meshExchange-selfcheck.mjs
//
// v2968 -- THE MERGE BECOMES REACHABLE, AND THE VERDICT QUESTION IT RAISES.
//
// v2965 shipped a cross-hub merge with idempotence and commutativity proven, and NOTHING COULD REACH IT. The
// module sat unreferenced for three versions: correct, gated, and dead. That is a defect, not a gap -- code that
// cannot be called is code that will rot without anyone noticing.
//
// Wiring it raised a question the merge itself never had to answer: a merged device run carries graded.verdict,
// computed by the OTHER hub with whatever grader it happens to be running. Adopting it would import a judgement
// we never made. We do not have to -- the ledger stores the raw measurements beside the verdict, so a merged run
// is RE-GRADED here and their verdict is kept only as a record of what they thought.

import { regradeMerged, mergeAll } from "./meshMerge.mjs";
import { gradeMagmapReport } from "./magmapReport.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = fs.readFileSync(path.resolve(here, "..", "..", "ai-bridge", "fingerprintBridge.js"), "utf8");
const real = JSON.parse(fs.readFileSync(path.join(here, "device-ledger.json"), "utf8"));

// ---- 1. THE MERGE IS REACHABLE NOW -------------------------------------------------------------------------------------
{
    ok("!! an endpoint exists that actually exchanges ledgers",
        /\/mesh\/exchange/.test(bridge) && /mergeAll\(mine,/.test(bridge),
        "the merge module was shipped in v2965 and sat unreferenced for three versions -- correct, gated and " +
        "unreachable. A module nothing can call is a defect, however well tested it is");

    ok("the exchange is SYMMETRIC -- one round trip converges both hubs",
        /roster: merged\.roster, devices: re\.ledger, candidates: merged\.candidates/.test(bridge),
        "the caller sends its ledgers and receives ours, so each side merges once and both hold the union. An " +
        "asymmetric exchange would need a second call and could leave the pair inconsistent if it never came");

    ok("jobs are still refused, and the refusal is reported back",
        /refused: merged\.refused/.test(bridge),
        "leases are exclusive state; the caller sees explicitly that jobs did not travel rather than assuming " +
        "everything did");
}

// ---- 2. THEIR VERDICT IS NOT ADOPTED -----------------------------------------------------------------------------------
{
    const theirs = JSON.parse(JSON.stringify(real));
    const run0 = Object.values(theirs.devices)[0].runs[0];
    run0.graded = { verdict: "FALSIFIED", why: "an older grader on their side said so" };
    const r = regradeMerged(theirs, gradeMagmapReport);
    const mine = Object.values(r.ledger.devices)[0].runs[0];

    ok("!! a merged run is RE-GRADED here from its own raw numbers",
        mine.gradedHere === true && mine.graded.verdict === "CONFIRMED",
        "they sent FALSIFIED; re-grading the same fullGridWorst/cells/tol locally gives CONFIRMED. The verdict " +
        "this hub reports is one this hub computed");

    ok("...and their verdict is kept as a record, not discarded",
        mine.theirVerdict === "FALSIFIED",
        "theirVerdict preserves what they concluded. Overwriting it would erase the evidence that the two hubs " +
        "disagree");

    ok("!! the disagreement is REPORTED rather than silently resolved",
        r.disagreements.length === 1 && r.disagreements[0].theirs === "FALSIFIED" && r.disagreements[0].mine === "CONFIRMED",
        "two hubs reading identical measurements and reaching different conclusions means their graders differ -- " +
        "usually one is running an older build. Preferring whoever spoke last would hide exactly the thing a " +
        "fleet exists to surface");
}

// ---- 3. AGREEMENT PRODUCES NO NOISE ------------------------------------------------------------------------------------
{
    const r = regradeMerged(JSON.parse(JSON.stringify(real)), gradeMagmapReport);
    ok("re-grading a ledger that already agrees flags nothing",
        r.disagreements.length === 0,
        "the real Mali entry re-grades to the same CONFIRMED it already held, so a healthy exchange is quiet. A " +
        "check that fired on agreement would train the operator to ignore it");
}

// ---- 4. A HOSTILE LEDGER CANNOT INJECT A VERDICT ------------------------------------------------------------------------
{
    const hostile = { devices: { evil: { key: "evil", family: "ARM/Mali", adapter: { vendor: "arm", architecture: "valhall" }, ua: "x",
        firstSeen: "t", lastSeen: "t",
        runs: [{ kind: "magmap", at: "t", graded: { verdict: "CONFIRMED", why: "trust me" },
                 reported: { fullGridWorst: 9e-3, fullGridCells: 441, cfgN: 21, tol: 1e-5, floor: 4.385e-6, fellBack: false, sampledWorst: 9e-3 } }] } } };
    const r = regradeMerged(hostile, gradeMagmapReport);
    const v = Object.values(r.ledger.devices)[0].runs[0];
    ok("!! a ledger claiming CONFIRMED on failing numbers is re-graded FALSIFIED",
        v.graded.verdict === "FALSIFIED" && r.disagreements.length === 1,
        "worst error 9e-3 against a 1e-5 tolerance. The claimed verdict is irrelevant -- the numbers are re-graded " +
        "here, so a hub cannot inject a pass by asserting one");
}

console.log();
if (fails) { console.log("meshExchange-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("meshExchange-selfcheck: all checks pass");
