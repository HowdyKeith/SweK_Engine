// tools/ship/loopTarget-selfcheck.mjs -- v3747
//
// The gate for tools/ship/loopTarget.mjs -- step 3 of the six-step loop plan.
//
// *** THE NUMBER STEP 3 TURNS ON: THE EVAL RUNS IN 871 ms ON ONE CORE, against a suite whose top five gates
// are 232-280 SECONDS EACH and 51.2% of the total. THE LOOP'S BEST TARGET IS AT THE OPPOSITE END OF THE
// TIMING CENSUS FROM WHERE THE RUNTIME IS -- which is precisely why "optimise the suite" was the wrong
// framing, and why an eval budget belongs in the design rather than in a hope. ***

import { EVAL_SPECS, HOLDOUT_SPEC, EVAL_BUDGET_MS, evalRun, holdoutRun, splitIsDisjoint, acceptable } from "./loopTarget.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "loopTarget.mjs"), "utf8");

// ---- 1. THE EVAL IS CHEAP ---------------------------------------------------------------------------------
console.log("1. AN ATTEMPT HAS TO BE CHEAP OR THE LOOP IS NOT WORTH RUNNING");
const run = evalRun();
ok("!! the whole eval finishes inside its budget",
    run.ms < EVAL_BUDGET_MS && run.allScored,
    run.ms + " ms of " + EVAL_BUDGET_MS + " ms, both arms scored, total " + run.total + " iterations. *** THE " +
    "BUDGET IS AN UPPER BOUND DERIVED FROM MEASUREMENT ON ONE CORE, so it is a CEILING everywhere and NOT a " +
    "claim about Keith's rig. If a future target blows it, the answer is A SMALLER FIXTURE, never a bigger " +
    "budget -- raising it silently converts a loop into something nobody runs ***");

ok("!! the eval uses MORE THAN ONE grid, so a candidate cannot be tuned to a single fixture",
    EVAL_SPECS.length >= 2 && new Set(EVAL_SPECS.map((s) => s.n)).size === EVAL_SPECS.length,
    EVAL_SPECS.map((s) => s.id + "(n=" + s.n + ")").join(", "));

// ---- 2. THE SPLIT ---------------------------------------------------------------------------------------
console.log("\n2. THE HOLDOUT IS DISJOINT, AND THAT IS CHECKED RATHER THAN TRUSTED");
ok("!! *** the holdout shares no spec with the eval set ***",
    splitIsDisjoint() === true,
    "a holdout that shares a spec is not a holdout, AND THE FAILURE IS SILENT -- the numbers still come out " +
    "and still look like a generalisation test. n=" + HOLDOUT_SPEC.n + " against eval n=" +
    EVAL_SPECS.map((s) => s.n).join(",") );

// *** MY FIRST VERSION OF THIS CHECK WAS VACUOUS: it asserted `run.total !== run.total + h.score`, WHICH
// CANNOT FAIL unless the holdout scores exactly zero. A check whose answer is structurally guaranteed is not
// evidence -- the failure mode with the most instances in these notes, and it landed in the gate for the
// module about not fooling yourself. THE REAL PROPERTY IS THAT THE TOTAL IS BUILT FROM THE EVAL ARMS AND
// THAT NO EVAL ARM IS THE HOLDOUT. ***
{
    const h = holdoutRun();
    const sumEval = run.specs.reduce((a, s) => a + s.result.score, 0);
    ok("!! the eval total is built from the EVAL arms, and no eval arm is the holdout",
        h.score !== null && run.specs.length === EVAL_SPECS.length && run.total === sumEval
        && !run.specs.some((s) => s.n === HOLDOUT_SPEC.n),
        "total " + run.total + " = " + run.specs.map((s) => s.result.score).join(" + ") + " over n=" +
        run.specs.map((s) => s.n).join(",") + "; holdout n=" + HOLDOUT_SPEC.n + " scored " + h.score +
        " SEPARATELY. Folding it in would make it an eval arm with extra steps, which is the whole way a " +
        "holdout stops being one");
}

report("STEP 3 DECLARES THE SPLIT; STEP 5 ENFORCES IT",
    "Nothing here stops a future loop from calling holdoutRun() during a search -- that check belongs with " +
    "the accept rule and is step 5. *** WHAT STEP 3 OWES IS THAT THE SPLIT EXISTS AND IS DISJOINT BEFORE ANY " +
    "LOOP IS WRITTEN, because A HOLDOUT CHOSEN AFTER SEEING THE RESULTS IS NOT A HOLDOUT. *** n=32 is held " +
    "out because it is the largest, the slowest, and the one whose ITERATION GROWTH (31 -> 36 -> 46 across " +
    "16/24/32) a candidate tuned to n=24 would be likeliest to wreck.");

// ---- 3. A PARTIAL SUM IS NOT A SCORE ---------------------------------------------------------------------
console.log("\n3. IF ONE ARM DOES NOT CONVERGE, THE TOTAL IS null -- NOT A SUM OVER THE SURVIVORS");
ok("!! *** the total is gated on ALL arms scoring ***",
    /allScored \? specs\.reduce/.test(codeOnly(SRC)) && /allScored: false|allScored\b/.test(SRC),
    "summing the survivors would let a candidate that BROKE ONE GRID report a SMALLER NUMBER than one that " +
    "solved both -- and smaller is the direction a minimiser walks. UNKNOWN IS NOT A DEFAULT, and a partial " +
    "sum is the flattering kind of unknown");

// ---- 4. NO STORED BASELINE -------------------------------------------------------------------------------
console.log("\n4. THE BASELINE IS MEASURED, NOT REMEMBERED");
ok("!! *** this module writes no baseline file at all ***",
    !/writeFileSync|appendFileSync|createWriteStream/.test(codeOnly(SRC)),
    "A STORED BASELINE IS A SECOND DECLARATION ABOUT ONE THING, and this session found five of those go " +
    "stale -- including this project's own notes, twice. It costs 610 ms to ask the solver directly. NOTHING " +
    "THAT CHEAP SHOULD BE REMEMBERED INSTEAD OF ASKED. (frozenReferee's manifest is the opposite case and " +
    "earns its file: hashing 1006 gates is not free, and its purpose IS to compare against a past state.)");

// ---- 5. THE ACCEPT DECISION LIVES WITH THE TARGET (v3748) -------------------------------------------------
console.log("\n5. THE TARGET OWNS WHAT COUNTS AS A WIN ON IT");
{
    const small = acceptable({ score: 36, tol: 1e-8 }, { score: 35, tol: 1e-8, met: true });
    const real = acceptable({ score: 36, tol: 1e-8 }, { score: 31, tol: 1e-8, met: true });
    ok("!! *** A ONE-ITERATION GAIN IS REFUSED AND A FIVE-ITERATION ONE IS ACCEPTED, AGAINST A MEASURED FLOOR ***",
        small.accept === false && real.accept === true && small.floor === real.floor && small.floor >= 2,
        "floor " + small.floor + " from loopNoise (" + small.floorWhy + "). *** BEFORE THIS, A CALLER HAD TO " +
        "IMPORT THREE MODULES AND REMEMBER TO FETCH THE FLOOR FROM A FOURTH PLACE -- and 'the caller must " +
        "remember' is the shape that produced v3746's too-permissive rule in the first place ***");
    ok("!! the floor is measured at call time, not cached",
        !/floorCache|_floor\s*=/.test(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "loopTarget.mjs"), "utf8")),
        "same reason there is no baseline file: it costs 610 ms to ask, and a cache is a second declaration");
}

report("WHAT THIS DOES NOT CLAIM",
    "That 871 ms is what Keith's rig would see -- it is one core, 4 GB, and the honest direction is that his " +
    "is faster, which keeps the budget a ceiling. Nor that these three sizes are the right ones: they are the " +
    "sizes multigrid3d's own gate already uses, chosen so the loop measures the problem the tree already " +
    "grades rather than one invented for flattering numbers.");

console.log("\nloopTarget-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
