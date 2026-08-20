// tools/ship/loopAccept-selfcheck.mjs -- v3749
//
// The gate for tools/ship/loopAccept.mjs -- step 5 of the six-step loop plan.
//
// *** THE ORDER IS THE ARGUMENT: THE EVAL DECIDES FIRST AND THE HOLDOUT ONLY VETOES. A holdout consulted
// BEFORE the eval verdict is just a third eval arm, and a candidate could then be selected FOR its holdout
// score -- the exact thing a holdout exists to prevent. The ledger proves the ordering rather than asserting
// it: a rejected candidate leaves the peek count at ZERO. ***
//
// *** AND THIS ROUND CLOSED THE GAP v3747 NAMED ABOUT ITSELF -- the holdout was a different SIZE, not a
// different KIND. Measured at n=24, tol 1e-8: smooth 36, step 33, blob 40, checker 25. FOUR PROBLEM CLASSES
// SPANNING 25..40, WIDER THAN THE WITHIN-KIND SPREAD OF 33..38, so "a different size" was never enough. ***

import { HOLDOUT_MEMBERS, holdoutScore, holdoutPeeks, resetHoldoutLedger, acceptWithHoldout, blobField } from "./loopAccept.mjs";
import { fieldFor, FIXTURE_FAMILY } from "./loopNoise.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "loopAccept.mjs"), "utf8");

// ---- 1. THE ORDERING, PROVEN BY THE LEDGER ----------------------------------------------------------------
console.log("1. A CANDIDATE THE EVAL REJECTS NEVER TOUCHES THE HOLDOUT");
{
    resetHoldoutLedger();
    const r = acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 35, tol: 1e-8, met: true }, { what: "gate: rejected on the eval" });
    ok("!! *** REJECTED ON THE EVAL, AND THE HOLDOUT WAS NEVER READ ***",
        r.accept === false && r.holdout === null && holdoutPeeks().length === 0,
        "peeks " + holdoutPeeks().length + ". A holdout consulted BEFORE the eval verdict is just a third eval " +
        "arm, and a candidate could then be selected FOR its holdout score. THE LEDGER PROVES THE ORDER RATHER " +
        "THAN THE COMMENT CLAIMING IT");

    resetHoldoutLedger();
    const w = acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 31, tol: 1e-8, met: true }, { what: "gate: accepted on the eval" });
    ok("!! an accepted candidate reads every holdout member for BOTH arms, and no more",
        w.accept === true && holdoutPeeks().length === HOLDOUT_MEMBERS.length * 2,
        holdoutPeeks().length + " peeks = " + HOLDOUT_MEMBERS.length + " members x 2 arms. Comparing a " +
        "candidate against a REMEMBERED baseline score would be cheaper and would compare against a number " +
        "measured under different code");
    ok("every peek is attributed",
        holdoutPeeks().every((p) => p.by && p.by !== "unattributed"),
        "an unattributed count cannot be audited, and step 6's trace is what will read this");
}

// ---- 2. THE VETO -------------------------------------------------------------------------------------------
console.log("\n2. THE HOLDOUT VETOES, AND A NON-CONVERGING ARM IS THE STRONGEST VETO OF ALL");
{
    // Driven through the real rows the module builds, with the comparison arithmetic exercised directly --
    // the SHIPPED path cannot manufacture a regression, because both arms measure the same solver (below).
    const m = HOLDOUT_MEMBERS[0];
    const regressed = (before, after, floor) => (before === null || after === null) || (after - before > floor);
    ok("!! a rise larger than the member's own floor is a regression",
        regressed(46, 46 + m.floor + 1, m.floor) === true && regressed(46, 46 + m.floor, m.floor) === false,
        "floor " + m.floor + " for " + m.id + ". *** THE HOLDOUT HAS ITS OWN FLOOR AND IT IS NOT THE EVAL'S: " +
        "measured across the eight-fixture ensemble at n=32 the sd is 2.32 (floor 5) against the eval's 1.50 " +
        "(floor 3). Judging a holdout regression against the EVAL's floor would be the v3724 mistake -- TWO " +
        "NUMBERS ARE ONLY COMPARABLE IF THE THING LIMITING THEM IS THE SAME ***");
    ok("!! *** null IS A VETO, NOT A SKIP ***",
        regressed(46, null, m.floor) === true && regressed(null, 46, m.floor) === true,
        "a holdout arm that STOPPED CONVERGING is the single most important thing a candidate can do, and " +
        "treating an unreadable arm as 'no objection' would invert it -- the same direction claimCheck's " +
        "UNCHECKABLE and loopTarget's null total refuse");
    ok("the shipped code uses that rule and does not re-spell it loosely",
        /after - before > m\.floor/.test(codeOnly(SRC)) && /before === null \|\| after === null/.test(codeOnly(SRC)));
}

// ---- 3. THE HOLDOUT IS A DIFFERENT KIND, NOT JUST A DIFFERENT SIZE ----------------------------------------
console.log("\n3. THE GAP v3747 NAMED ABOUT ITSELF, CLOSED");
{
    ok("!! the holdout carries BOTH a different size and a different kind",
        HOLDOUT_MEMBERS.some((h) => h.n === 32) && HOLDOUT_MEMBERS.some((h) => h.kind === "blob"),
        HOLDOUT_MEMBERS.map((h) => h.id + " (" + h.why + ")").join("; "));
    ok("!! *** the blob field is genuinely not a sine product, asserted on the ARRAYS ***",
        (() => { const b = blobField(16).div, s = fieldFor(16, FIXTURE_FAMILY[0]).div;
                 const bVals = new Set([...b].map((v) => Math.round(v * 1000)));
                 return bVals.size <= 2 && new Set([...s].map((v) => Math.round(v * 1000))).size > 10
                        && [...b].some((v, i) => v !== s[i]); })(),
        "the blob takes TWO values (0 and 1) where the sine field takes many -- a claim about the OUTPUT, not " +
        "about the parameters. MEASURED: smooth 36, step 33, blob 40, checker 25 at n=24, spanning 25..40 " +
        "against a within-kind spread of 33..38");
}

// ---- 4. THE HOLDOUT ACTUALLY DETECTS THINGS ----------------------------------------------------------------
console.log("\n4. THE ARMS ARE LIVE, NOT CONSTANTS");
{
    resetHoldoutLedger();
    const now = HOLDOUT_MEMBERS.map((h) => holdoutScore(h, "gate:live"));
    ok("!! both holdout arms return finite counts today",
        now.every((v) => Number.isFinite(v) && v > 0),
        now.join(", ") + ". *** SHOWN TO HAVE DETECTION POWER BY PLANTING THE SMOOTHER RELAXATION 1.1 -> 0.25 " +
        "IN THE SHIPPED SOLVER AND REVERTING: size32 46 -> 117, kindBlob 40 -> 83, and the eval 36 -> 90. " +
        "EVERY ARM RESPONDED. A first plant (coarseIters 40 -> 2) MOVED NOTHING AT ALL and was a BADLY CHOSEN " +
        "PLANT rather than a finding -- the coarse solve is a few cells and CG only needs its preconditioner " +
        "to be A preconditioner. RULE OUT THE BAD PLANT FIRST ***");
}

// *** v3750 -- acceptWithHoldout NOW REQUIRES `what` AND RECORDS THE ATTEMPT. This gate called the old
// two-argument form, the new code THREW, AND THE GATE PRINTED ZERO "FAIL" LINES WHILE EXITING 1 -- the same
// break as v3748's signature change, one round later, and caught the same way: BY READING THE EXIT CODE. ***
ok("!! an attempt with no name cannot get a verdict at all",
    (() => { try { acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 31, tol: 1e-8, met: true }); return false; }
             catch (e) { return /`what` is required/.test(e.message); } })(),
    "a trace the caller must REMEMBER to write is a trace with holes exactly where a search went wrong");

report("*** THE LIMIT THAT MATTERS MOST, AND IT IS STRUCTURAL ***",
    "BOTH ARMS MEASURE THE SAME SOLVER, because there is no candidate code -- nothing here can run a modified " +
    "build in-process. So the shipped path always reports before === after, and THE VETO HAS NEVER FIRED ON A " +
    "REAL REGRESSION, only on the arithmetic above. The case that matters -- a candidate that IMPROVES THE " +
    "EVAL AND WRECKS THE HOLDOUT -- is exactly what a loop would discover and CANNOT BE DEMONSTRATED WITHOUT " +
    "ONE. That is step 0's territory, and it is named here rather than papered over.");

report("AND THE LEDGER IS A LEDGER, NOT A LOCK",
    "Nothing in JavaScript stops a search from importing loopNoise and building the holdout field itself; a " +
    "module-scope counter cannot prevent that. What it does is make peeking VISIBLE, so a gate can assert the " +
    "count and step 6's trace can show any run that consulted it more. AN UNENFORCEABLE RULE THAT IS RECORDED " +
    "BEATS ONE THAT IS ONLY WRITTEN DOWN -- but do not describe this as enforcement.");

console.log("\nloopAccept-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
