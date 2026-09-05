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
    SLOWEST_GENERAL, HEADROOM, DEFAULT_BUDGET_MS, MEASURED, MEASURED_RUNS, TAIL_HEADROOM, UNRESOLVED,
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
console.log("\n*** THE BUDGET BASIS AND THE OBSERVED RUNTIME ARE TWO RECORDINGS OF ONE QUANTITY ***");
{
    // *** v4171 -- NOBODY HAD EVER COMPARED THEM, AND 26 OF 42 DISAGREED. ***
    //
    // MEASURED[g] is what budgetFor multiplies by TAIL_HEADROOM. timings[g] is what the gate was observed to
    // take. They are the same number recorded twice, and they had drifted: weightScaling was budgeted from
    // 50.6s while running 76.8s, jeans 67.9s against 98.9s, twoFBind 249.0s against 352.3s. ONLY ONE OF THE
    // FORTY-TWO AGREED WITHIN 1%.
    //
    // *** THE HEADROOM WAS BEING SPENT BEFORE THE GATE EVEN RAN. *** TAIL_HEADROOM is 2, and it exists so a
    // gate can have a slow day. Where the basis is 1.4x under the truth, the real margin is 1.4x, not 2x --
    // and v4166 narrowed the host-scale band at the same time (a timeout now needs 2 x scale rather than the
    // inflated 8, so the danger threshold moved from 16x its recorded time down to ~4.1x). Two safety factors
    // quietly eating each other is how a suite starts timing out for no reason anybody can name.
    //
    // The basis is RAISED to the observation, never lowered: this module's own header says the scale only ever
    // GROWS a budget, because "shortening one is how you manufacture a timeout out of a machine that was doing
    // fine". A gate that got FASTER keeps its older, larger basis and simply gains margin.
    const T = JSON.parse(fs.readFileSync(path.join(HERE, "gate-timings.json"), "utf8")).timings;
    const under = [];
    for (const [g, base] of Object.entries(MEASURED)) {
        const obs = T[g];
        if (!(obs > 0)) continue;
        if (obs > base * 1.01) under.push(g + " basis " + (base / 1000).toFixed(1) + "s < observed " +
                                         (obs / 1000).toFixed(1) + "s (" + (obs / base).toFixed(2) + "x)");
    }
    ok("!! *** no gate is budgeted from a basis its own recorded runtime already exceeds ***",
        under.length === 0,
        under.length ? under.length + " under-budgeted: " + under.slice(0, 4).join("; ") +
            (under.length > 4 ? " ... and " + (under.length - 4) + " more" : "")
          : Object.keys(MEASURED).filter((g) => T[g] > 0).length + " gates cross-checked against " +
            "gate-timings.json, none under-budgeted. THE FIX IS TO RAISE THE BASIS, never to widen " +
            "TAIL_HEADROOM: the multiplier is the safety margin and the basis is the measurement, and " +
            "loosening the first to cover an error in the second spends the margin on nothing");

    // *** AND A GATE THAT HAS BEEN MEASURED MAY NOT STILL BE SITTING IN UNRESOLVED. ***
    // That table's own header says so in as many words -- "WHEN ONE OF THESE IS MEASURED TO COMPLETION, IT
    // MOVES INTO MEASURED ABOVE AND ITS LINE HERE IS DELETED, NOT EDITED IN PLACE" -- and two had been
    // measured and left there anyway, on the 309s default with 1.21x and 1.07x of headroom. shaderRefs duly
    // timed out on Keith's rig. A DEFAULT IS WHAT A GATE GETS WHILE NOBODY KNOWS, and these were known.
    const stale = Object.keys(UNRESOLVED).filter((g) => T[g] > 0);
    ok("!! *** nothing sits in UNRESOLVED that gate-timings.json has already measured ***",
        stale.length === 0,
        stale.length ? stale.map((g) => g + " ran " + (T[g] / 1000).toFixed(1) + "s").join("; ") +
            " -- move each into MEASURED and DELETE the UNRESOLVED line, which is that table's own instruction"
          : Object.keys(UNRESOLVED).length + " still genuinely unmeasured; a SKIP (~0.05s) is excluded from " +
            "the record by selfchecks, so a time here is a real completion");
}

// ---- THE RUNS BEHIND THE BASIS ---------------------------------------------------------------------------
// *** THIS SECTION EXISTS BECAUSE TWO SABOTAGES OF THIS FILE'S OWN NEW ENTRIES SURVIVED WITH ZERO REDS. ***
// A basis of 1 ms for a 29 s gate passed everything; so did recording the fastest of three runs instead of the
// slowest. The cross-check above cannot help: it compares against gate-timings.json, and a gate is IN MEASURED
// precisely because gate-timings.json has never timed it, so THAT CHECK CAN ONLY VALIDATE THE ENTRIES THAT DID
// NOT NEED IT. gateBudget.MEASURED_RUNS now carries the individual runs as data, and this section reads them.
//
// *** THE MAXIMUM IS RE-DERIVED HERE, NOT BORROWED. *** gateBudget exports `slowestRun`, and calling it would
// make this check assert that a function equals itself -- the derivation and its verification would be one
// object. So the reduction is written out again below. If somebody changes `slowestRun` to take the mean or
// the fastest, these lines go red; if they were a call to it, they would not.
{
    const rows = Object.entries(MEASURED_RUNS);
    const maxOf = (runs) => runs.reduce((m, r) => (r.ms > m ? r.ms : m), 0);

    // A run that did not complete has not exercised the gate's full path -- the same rule that keeps failures
    // out of gate-timings.json, applied to the rows this file curates by hand.
    const nonZero = rows.filter(([, row]) => row.runs.some((r) => r.code !== 0));
    ok("!! *** every recorded run behind a derived basis is a COMPLETION ***",
        nonZero.length === 0,
        nonZero.length ? nonZero.map(([g]) => g).join(", ") + " -- a budget derived from a run that died early is derived from how long the gate took to break"
          : rows.length + " gate(s), " + rows.reduce((n, [, row]) => n + row.runs.length, 0) +
            " runs, every one exit 0. THIS CHECK IS THE ONLY PLACE THAT REFUSES ONE, and that is deliberate: " +
            "the first version of slowestRun threw on a bad row instead, which took the whole tree down at " +
            "import and meant THIS LINE NEVER RAN in the one condition it exists for. Deriving is conservative " +
            "(the max over all runs, so a kill can only raise a budget); refusing is here, where it is a red line and not a dead tree");

    // The sabotage this catches: any basis that is not the slowest recorded run. Both surviving sabotages were
    // exactly that -- 1 ms, and the fastest-of-three.
    const wrong = rows.filter(([g, row]) => MEASURED[g] !== maxOf(row.runs));
    ok("!! *** each derived basis IS the slowest run recorded for that gate, re-derived here ***",
        wrong.length === 0,
        wrong.length ? wrong.map(([g, row]) => g + " budgeted from " + MEASURED[g] + " against a slowest run of " + maxOf(row.runs)).join("; ")
          : rows.map(([g, row]) => g.split("/").pop().replace("-selfcheck.mjs", "") + " " + maxOf(row.runs) + "ms of " + row.runs.length).join(", ") +
            " -- the SLOWEST, never the mean, because a budget set to the average of a contended measurement re-creates the timeout it is meant to prevent");

    // Evidence for a gate that is not budgeted is evidence nobody consults. This is the direction the two
    // tables can drift that the check above cannot see, since it only walks rows that exist in both.
    const orphan = rows.filter(([g]) => MEASURED[g] === undefined);
    ok("...and no gate has recorded runs without a budget derived from them",
        orphan.length === 0,
        orphan.length ? orphan.map(([g]) => g).join(", ") + " -- runs recorded, basis not derived from them"
          : "every MEASURED_RUNS row feeds a MEASURED entry");

    // *** WHAT THIS ROUND DID NOT DO, NAMED RATHER THAN COUNTED. *** Most of MEASURED is older than
    // MEASURED_RUNS and its readings live in prose. Those entries are NOT converted here and are not asserted
    // over; the number is reported so the gap is visible and shrinking, and it is deliberately not a floor --
    // a threshold here would turn "we converted five" into a contract nobody agreed to.
    const transcribed = rows.filter(([, row]) => row.observedHere !== true).map(([g]) => g);
    console.log("  ----  " + rows.length + " of " + Object.keys(MEASURED).length + " MEASURED entries derive their basis from recorded runs; " +
        "the rest carry their measurement in a comment, where nothing can check it.");
    console.log("  ----  Of the " + rows.length + ", " + transcribed.length + " is transcribed from an earlier round's note rather than run: " +
        (transcribed.join(", ") || "none") + ". Its only corroboration is that the basis that note recorded already equals the maximum of the readings it listed.");
}

console.log("  ----  AND THE SUITE GETS LONGER: the v3211 run was 1719s with thirteen gates dying early.");
console.log("  ----  Letting the eight measured ones finish costs about 26 more minutes of real work.");
if (fails) { console.log("gateBudget-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gateBudget-selfcheck: all checks pass");
