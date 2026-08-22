// WebGLEngine/tools/ship/gateBudget-selfcheck.mjs
//
// Run: node tools/ship/gateBudget-selfcheck.mjs   (~0.05s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3212 -- THE BUDGET WENT STALE FOR FOUR HUNDRED VERSIONS AND NOTHING COULD HAVE NOTICED.
//
// selfchecks.mjs stated its rule in a comment -- "3x the slowest measured run is the headroom" -- from a
// slowest measured run of 19.4s, giving 60s. The rule was never wrong. NOBODY RE-APPLIED IT. By the time the
// full suite was first run end to end (v3211) the slowest passing gate was 47.7s, and THIRTEEN of the 41
// reported failures were timeouts, EIGHT OF WHICH PASS GIVEN ROOM. windTunnel missed by THREE SECONDS.
//
// *** A RULE IN A COMMENT IS NOT A RULE. *** This gate makes the derivation executable, so the next time the
// lab outgrows its budget the suite says so instead of manufacturing failures. It is the same move as every
// other ratchet here: the thing that was true once is now the thing that is checked.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import {
    SLOWEST_GENERAL, HEADROOM, DEFAULT_BUDGET_MS, MEASURED, TAIL_HEADROOM, UNRESOLVED,
    budgetFor, budgetReason, maxBudgetMs,
} from "./gateBudget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE DEFAULT IS DERIVED, NOT TYPED -------------------------------------------------------------------------
{
    ok("!! *** the default budget IS the rule applied, not a number somebody chose ***",
        DEFAULT_BUDGET_MS === SLOWEST_GENERAL.ms * HEADROOM,
        (DEFAULT_BUDGET_MS / 1000).toFixed(1) + "s = " + (SLOWEST_GENERAL.ms / 1000).toFixed(1) + "s x " + HEADROOM +
        ", from " + SLOWEST_GENERAL.gate + ". THE MEASUREMENT IS STORED BESIDE THE ANSWER so the derivation can " +
        "be re-checked instead of trusted -- the 60s it replaces was 3x a 19.4s slowest run and the two halves " +
        "drifted apart for four hundred versions with nothing able to say so");

    ok("...and selfchecks.mjs no longer carries a second copy of the number",
        !/const TIMEOUT = parseInt\(\(process\.argv\.includes\("--timeout"\) \? [^)]*"60000"/.test(
            noComments(fs.readFileSync(path.join(HERE, "selfchecks.mjs"), "utf8"))),
        "TWO DECLARATIONS ABOUT ONE THING THAT NOBODY EVER COMPARED is this tree's most repeated defect. The " +
        "runner imports the table; it does not keep its own constant");
}

// ---- 2. EVERY TAIL BUDGET CARRIES THE MEASUREMENT IT CAME FROM ----------------------------------------------------
{
    const names = Object.keys(MEASURED);
    ok("!! *** every named budget is derived from a recorded completion, not a guess ***",
        names.length > 0 && names.every((k) => Number.isFinite(MEASURED[k]) && MEASURED[k] > 0 &&
                                               budgetFor(k) === MEASURED[k] * TAIL_HEADROOM),
        names.length + " gates with measured times from " + (Math.min(...names.map((k) => MEASURED[k])) / 1000).toFixed(1) +
        "s to " + (Math.max(...names.map((k) => MEASURED[k])) / 1000).toFixed(1) + "s, each budgeted at x" +
        TAIL_HEADROOM + ". A NUMBER WITH ITS MEASUREMENT ATTACHED CAN BE CONTRADICTED BY A RE-MEASURE; a bare " +
        "number cannot, which is the whole difference between this table and the constant it replaces");

    ok("!! ...and every one of them names a gate that EXISTS",
        names.every((k) => fs.existsSync(path.join(ROOT, k))),
        "a budget for a gate that has been renamed or deleted is a suppression holding nothing -- v3195's " +
        "stale-baseline finding, arriving in a new table before it has had a chance to rot. " +
        names.filter((k) => !fs.existsSync(path.join(ROOT, k))).join(", ") || "all present");

    ok("!! ...and so does every UNRESOLVED entry, which is where the honest gap lives",
        Object.keys(UNRESOLVED).every((k) => fs.existsSync(path.join(ROOT, k))) &&
        Object.values(UNRESOLVED).every((v) => typeof v === "string" && v.length > 20),
        Object.keys(UNRESOLVED).length + " gates ran past a 300s ceiling and never returned a verdict, so they " +
        "get NO BUDGET AT ALL and time out loudly. WRITING A NUMBER FOR THEM WOULD BE INVENTING A MEASUREMENT " +
        "-- the same fabrication this project refuses when a claim's config is unknown");

    ok("...and no gate is in both tables",
        !Object.keys(MEASURED).some((k) => UNRESOLVED[k]),
        "MEASURED means it finished and we know when; UNRESOLVED means it did not. A gate in both would be two " +
        "answers to one question");
}

// ---- 3. THE CHECK THAT WOULD HAVE CAUGHT THE DRIFT -----------------------------------------------------------------
{
    // *** MY FIRST VERSION OF THIS CHECK COULD NOT FAIL, AND I ALMOST SHIPPED IT. *** It asserted
    // SLOWEST_GENERAL.ms <= DEFAULT_BUDGET_MS / HEADROOM -- and DEFAULT_BUDGET_MS *is* SLOWEST_GENERAL.ms *
    // HEADROOM, so the two sides are the same number by construction and it prints "47.7s against a 47.7s line"
    // forever. A CONTROL THAT CANNOT FAIL, in the very gate written to stop a rule rotting in a comment.
    //
    // A DERIVATION CAN ONLY BE CHECKED AGAINST AN INDEPENDENT MEASUREMENT. gate-timings.json carries what the
    // suite ACTUALLY OBSERVED, written by selfchecks.mjs on a full run, and the assertion is that the recorded
    // slowest is still the real slowest in the general population.
    const timingsPath = path.join(HERE, "gate-timings.json");
    const observed = JSON.parse(fs.readFileSync(timingsPath, "utf8")).timings;
    const general = Object.entries(observed).filter(([k]) => !MEASURED[k] && !UNRESOLVED[k]);
    const worst = general.reduce((a, b) => (b[1] > a[1] ? b : a), ["(none)", 0]);
    ok("!! *** the recorded slowest gate is still the slowest one anybody has SEEN ***",
        worst[1] <= SLOWEST_GENERAL.ms && general.length > 100,
        "observed worst in the general population: " + worst[0] + " at " + (worst[1] / 1000).toFixed(1) +
        "s, against a recorded " + (SLOWEST_GENERAL.ms / 1000).toFixed(1) + "s over " + general.length +
        " timed gates. THIS IS THE CHECK THAT DID NOT EXIST -- and it needed an INDEPENDENT measurement to " +
        "mean anything, because the first version compared the derivation against itself. WHEN IT GOES RED THE " +
        "ANSWER IS TO RAISE SLOWEST_GENERAL FROM THE NEW MEASUREMENT, NOT TO LOWER THIS LINE");

    ok("...and the timings file ships with data rather than waiting to be fed",
        general.length > 100 && Object.keys(observed).length > 500,
        Object.keys(observed).length + " gates timed. A CHECK FED BY A FILE NOBODY HAS PRODUCED IS A CONTROL " +
        "THAT CANNOT FAIL -- the same shape as the one this replaced, one level up. The file is regenerated by " +
        "every full run of selfchecks.mjs, so it cannot silently describe a tree that no longer exists");

    ok("!! ...and a slower gate than the recorded slowest would be a REAL finding, not a tolerance to widen",
        HEADROOM >= 2 && TAIL_HEADROOM >= 2,
        "headroom " + HEADROOM + "x general, " + TAIL_HEADROOM + "x measured. The tail is measured directly so " +
        "it needs less; 3x on a 280s gate would stall a suite for fourteen minutes before admitting anything " +
        "was wrong, which is a different failure from the one being fixed");
}

// ---- 4. THE FRONT DOOR CAN NOW ASK FOR WHAT THE SUITE NEEDS --------------------------------------------------------
{
    const bridge = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "gatesBridge.js"), "utf8"));

    ok("!! *** the button's budget comes from the SAME table the ship uses ***",
        /gateBudget\.mjs/.test(bridge) && /budgetFor\(name\)/.test(bridge),
        "gates.html has had a Run all button since v3075 and IT COULD NOT FINISH THE SUITE: the page sends no " +
        "timeout, so every gate ran at 60s, and the bridge CLAMPED any request to 120s -- so no value the page " +
        "was capable of sending would have let a 232s or 280s gate complete. THE FRONT DOOR EXISTED AND " +
        "STRUCTURALLY COULD NOT EXPRESS THE BUDGET");

    ok("!! ...and the ceiling is COMPUTED from the table, not a number that was true once",
        !/Math\.min\(120000/.test(bridge) && !/Math\.min\(900000/.test(bridge) && /maxBudgetMs\(\)/.test(bridge),
        "ceiling " + (maxBudgetMs() / 1000).toFixed(0) + "s against a largest budget of " +
        (Math.max(...Object.values(MEASURED).map((m) => m * TAIL_HEADROOM)) / 1000).toFixed(0) + "s. *** THE 900s " +
        "I TYPED LAST ROUND WENT FALSE IN ONE ROUND: it was justified as sitting above the largest budget the " +
        "table could produce, and then khMichalke measured 573s whose budget is 1146s. A NUMBER THAT WAS TRUE " +
        "WHEN WRITTEN AND IS CHECKED BY NOTHING is the defect this whole arc is about, committed in the sentence " +
        "that described it ***");

    ok("!! ...and the ceiling really does sit above every budget the table can produce",
        maxBudgetMs() >= Math.max(DEFAULT_BUDGET_MS, ...Object.values(MEASURED).map((m) => m * TAIL_HEADROOM)),
        "asserted as a RELATIONSHIP, so it cannot go false when a gate is measured -- which is exactly how the " +
        "typed one went false");

    const page = fs.readFileSync(path.join(ROOT, "gates.html"), "utf8");
    ok("!! *** and the page counts a TIMEOUT apart from a FAILURE ***",
        /timedOut\)\.length/.test(page) && /timeout<\/b>/.test(page) && /budgetMs/.test(page),
        "the ROWS have distinguished them since v3076 and the TALLY still folded them together, so the headline " +
        "on the page told the same lie the runner's did. The budget travels with the verdict too: windTunnel " +
        "missed the old line by THREE SECONDS, and a bare TIMEOUT cannot tell that from a gate that never had " +
        "a chance");
}

// ---- 5. AND THE REASON A CRASHED GATE GIVES IS NO LONGER ITS NODE VERSION ------------------------------------------
{
    const runner = noComments(fs.readFileSync(path.join(HERE, "selfchecks.mjs"), "utf8"));
    ok("!! *** a crashed gate reports its ERROR, not the last line of the crash dump ***",
        /Node\\\.js v/.test(runner) && /errLines\.find/.test(runner),
        "the last non-empty line of a Node crash dump is the VERSION BANNER, and a gate that dies on module " +
        "resolution writes nothing to stdout -- so SEVENTEEN CRASHED GATES WERE FILED UNDER 'Node.js v22.22.2' " +
        "in the v3211 run. The reason was sitting in stderr and was thrown away. Same class as ship.mjs printing " +
        "an EMPTY failure list at v3203: A REPORT THAT CANNOT SAY WHY IS INDISTINGUISHABLE FROM ONE WITH " +
        "NOTHING TO SAY");

    ok("...and the runner separates the two counts in its headline",
        /TIMED OUT, of/.test(runner) && /const broke = failures\.filter/.test(runner),
        "'41 of 597 FAILED' made a budget problem look like a wall of broken checks. BOTH STILL EXIT NONZERO -- " +
        "a gate that did not finish has not passed -- but the report says which pile you are looking at");
}

console.log();
console.log("  ----  v3214: ALL FOUR FORMERLY-UNRESOLVED GATES HAVE NOW BEEN MEASURED AND ALL FOUR PASS.");
console.log("  ----  khMichalke 573s, khGrowthKey ~690s, khConvergence 527s, labResults 94s -- against headers");
console.log("  ----  claiming 90s, 40s, 90s and 35s. NONE OF THEM WAS EVER BROKEN; they were being killed at");
console.log("  ----  60s and counted among 41 FAILED. The Kelvin-Helmholtz cluster is ONE FIXTURE COST, not");
console.log("  ----  three bugs. UNRESOLVED is now empty, so the check above passes VACUOUSLY -- it prints its");
console.log("  ----  zero rather than hiding it, because a check with nothing to check should say so.");
console.log("  ----  AND THE SUITE GETS LONGER: the v3211 run was 1719s with thirteen gates dying early.");
console.log("  ----  Letting the eight measured ones finish costs about 26 more minutes of real work.");
if (fails) { console.log("gateBudget-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gateBudget-selfcheck: all checks pass");
