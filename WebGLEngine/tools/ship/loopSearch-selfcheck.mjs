// tools/ship/loopSearch-selfcheck.mjs -- v3753
//
// The gate for tools/ship/loopSearch.mjs -- scope 1 of the step-0 chart.
//
// *** SCOPE 1 NEEDS NO WRITE PATH, AND THAT IS THE WHOLE REASON IT IS AVAILABLE WITHOUT KEITH DECIDING
// ANYTHING. The searcher passes `opts` to the solver as ARGUMENTS; there is no file API in it. Asserted by
// mechanism below rather than promised in a comment. ***
//
// *** AND THE RESULT OF THE RUN IS THAT NOTHING IS ACCEPTED, WHICH IS A FINDING AND NOT A FAILURE. The best
// comparable candidate is omega 1.0 at 34 iterations against the shipped 36 -- A GAIN OF 2 AGAINST A NOISE
// FLOOR OF 3. THE SHIPPED DEFAULTS ARE ALREADY WITHIN THE FIXTURE SPREAD OF THE BEST CONFIGURATION THIS SPACE
// CONTAINS. Reporting that, rather than lowering the floor to manufacture a win, is what the four rounds
// before this were for. ***

import { CANDIDATES, BASELINE_OPTS, search } from "./loopSearch.mjs";
import { measure } from "./loopMetric.mjs";
import { resetTrace, entries } from "./loopTrace.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "loopSearch.mjs"), "utf8");

// ---- 1. NO WRITE PATH --------------------------------------------------------------------------------------
console.log("1. SCOPE 1 IS AVAILABLE BECAUSE IT CANNOT WRITE ANYTHING");
ok("!! *** the searcher has no file API at all ***",
    !/writeFileSync|appendFileSync|createWriteStream|unlinkSync|readFileSync|node:fs/.test(codeOnly(SRC)),
    "it passes `opts` as ARGUMENTS. NOT A PROMISE -- there is nothing in the module that could reach a source " +
    "file, which is why this scope needs no decision from Keith and no allowlist to enforce");
ok("!! and it reaches the holdout only through acceptWithHoldout",
    !/holdoutScore|blobField/.test(codeOnly(SRC)) && /acceptWithHoldout/.test(codeOnly(SRC)),
    "so every attempt is recorded and the eval-decides-first ordering (v3749) still holds for a search");

// ---- 2. EVERY ATTEMPT IS TRACED ----------------------------------------------------------------------------
console.log("\n2. A SEARCH LEAVES A COMPLETE RECORD, NOT A WINNER");
{
    resetTrace();
    const r = search({ scope: 1 });   // v3755 -- the scope is an ARGUMENT now; the gate states it explicitly
    ok("!! every candidate in the grid left a trace row",
        entries().length === CANDIDATES.length && r.rows.length === CANDIDATES.length,
        entries().length + " rows for " + CANDIDATES.length + " candidates. A search that recorded only its " +
        "winner would hide the shape the trace exists to show");
    ok("!! *** AND NOTHING WAS ACCEPTED -- REPORTED, NOT HIDDEN ***",
        r.rows.every((x) => x.accept === false) && r.trace.accepted === 0,
        "baseline " + r.baseline + " iterations; best comparable candidate 34 (omega 1.0), A GAIN OF 2 AGAINST " +
        "A FLOOR OF 3. *** THE SHIPPED DEFAULTS ARE ALREADY WITHIN THE FIXTURE SPREAD OF THE BEST THIS SPACE " +
        "HOLDS. If this check ever goes red, a candidate cleared the floor AND the holdout -- read the trace " +
        "before believing it, and do not weaken this line ***");
    ok("!! the near-miss is surfaced rather than buried",
        r.trace.nearMisses >= 1,
        "omega 1.0 is the one that got closest, and the summary names it. THAT is what a search circling a bar " +
        "looks like when there is genuinely nothing there -- one candidate near the floor, not fifty");
}

// ---- 3. THE GRID IS DECLARED AND KEEPS ITS INCOMPARABLE MEMBER --------------------------------------------
console.log("\n3. WHAT IS SEARCHABLE AFTER THE COST REFUSAL");
{
    const base = measure({ n: 24, tol: 1e-8, opts: BASELINE_OPTS });
    const rows = CANDIDATES.map((c) => ({ what: c.what, cost: measure({ n: 24, tol: 1e-8, opts: c.opts }).cost }));
    const comparable = rows.filter((x) => x.cost === base.cost);
    ok("!! most of the grid is comparable, and at least one member deliberately is not",
        comparable.length >= 5 && comparable.length < rows.length,
        comparable.length + " of " + rows.length + " comparable. *** THE INCOMPARABLE ROW IS KEPT ON PURPOSE: a " +
        "search that quietly dropped candidates it could not judge would report a smaller, cleaner space than " +
        "the one it actually looked at ***");
    ok("!! *** THE SWEEP SPLIT MATTERS ENORMOUSLY AT IDENTICAL COST -- 35 against 65 for the same four sweeps ***",
        measure({ n: 24, tol: 1e-8, opts: { pre: 1, post: 3 } }).score === 35 &&
        measure({ n: 24, tol: 1e-8, opts: { pre: 3, post: 1 } }).score === 65,
        "which is exactly what a search is for, and exactly what an iterations-only metric could not have told " +
        "apart from a cost change. v3752's refusal is what made this space legible");
    ok("the grid is deterministic -- no RNG anywhere",
        !/Math\.random|crypto\./.test(codeOnly(SRC)),
        "a random search would put run-to-run noise back into a stack whose floor was measured on the premise " +
        "that there is none");
}

// *** v3755 -- search() NOW REQUIRES A SCOPE AND THIS GATE CALLED THE OLD FORM: it THREW and printed ZERO
// "FAIL" LINES while exiting 1. THIRD SIGNATURE CHANGE IN THIS STACK TO DO EXACTLY THAT (v3748's floor,
// v3750's `what`, and now the scope), and caught the same way all three times: BY READING THE EXIT CODE. ***
ok("!! a search with no stated scope cannot run at all",
    (() => { try { search({}); return false; } catch (e) { return /scope 1/.test(e.message); } })(),
    "no default -- not scope 0 and not scope 1. THE SCOPE IS DECLARED IN server.html AND RE-CHECKED BY " +
    "loopScope.currentScope(); this module never reads the disk, which is what keeps its no-fs property true");

report("*** A DEFECT IN THE SHIPPED SOLVER, FOUND WHILE MAPPING THE SPACE, NOT FIXED HERE ***",
    "PoissonMG3D reads its knobs as `opts.pre || 2` and `opts.post || 2`, SO `pre: 0` IS SILENTLY REWRITTEN TO " +
    "2. MEASURED: { pre: 0, post: 4 } reports a cost signature of SIX sweeps rather than four and comes back " +
    "INCOMPARABLE, which is how it was noticed -- the request was rewritten and nothing said so. THE FALSY-ZERO " +
    "DEFAULT, and it is the v3712 shape (a clamp that rewrites an input and reports nothing) in shipped " +
    "physics. NOT FIXED IN THIS ROUND: `|| 2` -> `?? 2` changes how the solver reads every caller's options, " +
    "which is a decision about shipped physics and deserves its own round rather than riding along inside one " +
    "about a searcher. NAMED SO IT DOES NOT GET RE-DISCOVERED.");

report("WHAT THIS DOES NOT CLAIM",
    "That the space is well covered. EIGHT declared candidates on ONE fixture size, no interaction between " +
    "omega and the split, and nothing outside the knobs PoissonMG3D already exposes. A negative result over a " +
    "small grid is a statement about THE GRID, not about the solver -- and the honest reading is that the " +
    "shipped defaults survive everything tried here, not that they are optimal.");

console.log("\nloopSearch-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
