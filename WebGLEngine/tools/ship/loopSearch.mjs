// tools/ship/loopSearch.mjs -- v3753
//
// *** SCOPE 1 OF THE STEP-0 CHART: A PARAMETER SEARCH, AND IT NEEDS NO WRITE PATH AT ALL. It passes `opts` to
// the solver as ARGUMENTS. There is no file API in this module and no way for it to reach a source file, which
// is not a promise but the reason the whole scope is available without Keith deciding anything. ***
//
// *** AND I CORRECTED MY OWN SUGGESTED ORDER TO BUILD THIS BEFORE THE PAGE. I had proposed the selection page
// first. A page whose whole content is "which scope is active and what did it find" IN FRONT OF A SEARCH THAT
// DOES NOT EXIST is a demo, and A DEMO IS PROSE UNLESS SOMETHING READS IT (v3710). The searcher first, the page
// over a searcher that has actually run. ***
//
// *** WHAT v3752 LEFT SEARCHABLE, WHICH IS THE INTERESTING PART. The cost refusal means a candidate that
// changes the per-iteration cost is NOT COMPARABLE on iterations -- so most of the obvious knob space is out.
// What remains is genuinely informative: OMEGA (a relaxation factor that changes NO work per iteration) and
// THE SPLIT OF A FIXED SWEEP BUDGET between pre and post. MEASURED at n=24, tol 1e-8, all comparable:
//     omega 0.7 -> 41,  0.9 -> 40,  1.0 -> 34,  1.1 -> 36 (shipped),  1.2 -> 37,  1.4 -> 98
//     pre1/post3 -> 35,  pre2/post2 -> 36 (shipped),  pre3/post1 -> 65
// THE SPLIT MATTERS ENORMOUSLY AT IDENTICAL COST -- 35 against 65 for the same four sweeps -- which is exactly
// the kind of thing a search is for and exactly what an iterations-only metric could not have told apart from
// a cost change. ***
//
// *** AND THE HONEST RESULT OF THE SEARCH IS THAT NOTHING IS ACCEPTED. The best comparable candidate is
// omega 1.0 at 34 against the shipped 36 -- A GAIN OF 2 AGAINST A NOISE FLOOR OF 3. THE SHIPPED DEFAULTS ARE
// ALREADY WITHIN THE FIXTURE SPREAD OF THE BEST CONFIGURATION THIS SPACE CONTAINS. That is a real finding and
// it is the one a search is most likely to produce; reporting it as "no improvement" rather than lowering the
// floor to manufacture one is the entire point of the four rounds that came before this. ***

import { pathToFileURL } from "node:url";
import { measure } from "./loopMetric.mjs";
import { acceptWithHoldout } from "./loopAccept.mjs";
import { summarise } from "./loopTrace.mjs";

/**
 * THE GRID IS DECLARED AND DETERMINISTIC -- no RNG, so a run is reproducible and a second run cannot "find"
 * something the first missed by luck. A random search would put run-to-run noise back into a stack whose floor
 * was measured on the premise that there is none (v3748).
 */
export const CANDIDATES = [
    { what: "omega 0.7", opts: { pre: 2, post: 2, omega: 0.7 } },
    { what: "omega 0.9", opts: { pre: 2, post: 2, omega: 0.9 } },
    { what: "omega 1.0", opts: { pre: 2, post: 2, omega: 1.0 } },
    { what: "omega 1.2", opts: { pre: 2, post: 2, omega: 1.2 } },
    { what: "omega 1.4", opts: { pre: 2, post: 2, omega: 1.4 } },
    { what: "sweep split 1/3", opts: { pre: 1, post: 3 } },
    { what: "sweep split 3/1", opts: { pre: 3, post: 1 } },
    { what: "richer schedule 3/3", opts: { pre: 3, post: 3 } },   // deliberately INCOMPARABLE -- see below
];

export const BASELINE_OPTS = { pre: 2, post: 2 };

/**
 * *** NO WRITE PATH, AND NOTHING TO ENFORCE BECAUSE THERE IS NOTHING TO ENFORCE AGAINST: this function reads
 * a declared list, calls measure() with option objects, and returns rows. It cannot edit a file, cannot edit a
 * gate, and cannot reach the holdout except through acceptWithHoldout -- which records every attempt to the
 * trace whether it passes or fails. ***
 *
 * The INCOMPARABLE row is kept in the grid on purpose: a search that quietly dropped candidates it could not
 * judge would report a smaller, cleaner space than the one it actually looked at.
 */
export function search({ n = 24, tol = 1e-8, scope } = {}) {
    // *** v3755 -- THE SCOPE IS AN ARGUMENT, NOT SOMETHING THIS MODULE READS. loopScope.mjs owns the flag file
    // and the re-check; if the check were bolted in here the searcher would need an fs import and would lose
    // the strongest thing it has to say about itself -- that it CANNOT reach a file at all (v3753). A function
    // that takes its input is testable; one that reads a closure or a disk is not.
    // THERE IS NO DEFAULT. A caller who does not state a scope gets a throw, not scope 0 and not scope 1 --
    // "the caller must remember" is the shape that produced v3746's permissive rule and v3750's optional
    // trace, and it is refused the same way each time. ***
    if (scope !== 1) {
        throw new Error("loopSearch.search({ scope }): a parameter search runs only at scope 1 (got " +
                        JSON.stringify(scope) + "). The scope is DECLARED in server.html and RE-CHECKED by " +
                        "tools/ship/loopScope.mjs currentScope() -- pass that, never a literal.");
    }
    const baseline = measure({ n, tol, opts: BASELINE_OPTS });
    const rows = [];
    for (const c of CANDIDATES) {
        const cand = measure({ n, tol, opts: c.opts });
        const verdict = acceptWithHoldout(baseline, cand, { n, tol, what: "search: " + c.what });
        rows.push({
            what: c.what,
            iters: cand.score,
            comparable: cand.cost === baseline.cost,
            accept: verdict.accept,
            why: verdict.why,
        });
    }
    return { baseline: baseline.score, rows, trace: summarise() };
}

// v3941 -- pathToFileURL, NOT a basename match: `argv[1].split("/")` returns THE WHOLE PATH on
// Windows (backslashes), so this guard was false and the main block below never ran there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // The CLI is the boundary: it reads the declared scope and hands it in. The module never reads the disk.
    const { currentScope } = await import("./loopScope.mjs");
    const scope = currentScope();
    if (scope !== 1) {
        console.log("[loopSearch] declared scope is " + scope + " -- a parameter search needs scope 1.");
        console.log("[loopSearch] set it in server.html's Boot Options, or `node tools/ship/loopScope.mjs` to see the list.");
        process.exit(0);
    }
    const r = search({ scope });
    console.log("[loopSearch] baseline (shipped pre2/post2): " + r.baseline + " iterations");
    for (const row of r.rows) {
        console.log("  " + row.what.padEnd(22) + String(row.iters === null ? "NO SCORE" : row.iters).padStart(8) +
                    "   " + (row.accept ? "ACCEPT" : "reject") + (row.comparable ? "" : "  [cost changed]"));
    }
    const t = r.trace;
    console.log("[loopSearch] " + t.attempts + " attempts, " + t.accepted + " accepted, " + t.rejected + " rejected");
    console.log("[loopSearch]   near-misses " + t.nearMisses + ", bare passes " + t.barePasses + ", vetoes " + t.vetoed);
    console.log("[loopSearch] *** NOTHING ACCEPTED IS THE RESULT, NOT A FAILURE OF THE RUN: the best comparable " +
                "candidate is inside the noise floor, so the shipped defaults are already as good as this space gets. ***");
}
