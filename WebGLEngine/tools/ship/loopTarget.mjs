// tools/ship/loopTarget.mjs -- v3747
//
// *** STEP 3 OF THE SIX: A TARGET WHOSE EVAL IS FAST ENOUGH TO BE WORTH RUNNING. *** v3742's timing census
// said the top 5 gates are 51.2% of the suite at 232-280 SECONDS each, and v3746 built the metric. This names
// what the loop would actually run, and it is the OPPOSITE END of that census -- MEASURED HERE, ONE CORE:
//     n=16  339 ms  31 iterations      n=24  610 ms  36 iterations      n=32  1925 ms  46 iterations
// (module load 15 ms). *** SO THE LOOP'S BEST TARGET IS NOT THE SLOWEST GATE, WHICH IS THE OPPOSITE OF WHERE
// THE RUNTIME IS -- and that is exactly why "optimise the suite" was the wrong framing. An eval costing 250 s
// per attempt makes a loop useless no matter how good the metric is. ***
//
// *** THERE IS NO BASELINE FILE, AND THAT IS A DECISION. A stored baseline is A SECOND DECLARATION ABOUT ONE
// THING, and this session has found five of those go stale -- including this project's own notes, twice. The
// baseline is MEASURED, every run, from whatever the solver is right now. It costs 610 ms. NOTHING THAT CHEAP
// SHOULD BE REMEMBERED INSTEAD OF ASKED. (frozenReferee's manifest is the opposite case and earns its file:
// hashing 1006 gates is not free, and its whole purpose is to compare against a PAST state.) ***
//
// *** THE HOLDOUT IS DECLARED HERE BUT NOT YET ENFORCED -- that is step 5, and saying so is the point. What
// step 3 owes is that the split EXISTS and is DISJOINT before any loop is written, because a holdout chosen
// after seeing the results is not a holdout. n=32 is held out: it is the largest, the slowest, and the one
// whose ITERATION GROWTH (31 -> 36 -> 46) a candidate tuned to n=24 would be most likely to wreck. ***

import { pathToFileURL } from "node:url";
import { measure, repeat, better } from "./loopMetric.mjs";
import { floorIters } from "./loopNoise.mjs";

/** What a loop would be allowed to see. Two sizes, so a candidate cannot be tuned to a single grid. */
export const EVAL_SPECS = [
    { id: "mg24", n: 24, tol: 1e-8, maxIters: 400 },
    { id: "mg16", n: 16, tol: 1e-8, maxIters: 400 },
];

/** What it must never see until an accept is being decided. ONE spec, the largest. */
export const HOLDOUT_SPEC = { id: "mg32", n: 32, tol: 1e-8, maxIters: 400 };

/**
 * *** THE BUDGET IS AN UPPER BOUND DERIVED FROM MEASUREMENT, NOT A TYPED PREFERENCE -- and it is stated in the
 * unit that travels. 610 ms + 339 ms was measured ON ONE CORE with 4 GB; Keith's rig is faster, so this is a
 * CEILING everywhere, which is the safe direction for a budget. IT IS NOT A CLAIM ABOUT HIS MACHINE. ***
 * If a future target blows this, the answer is a SMALLER FIXTURE, never a bigger budget: the budget exists to
 * keep an attempt cheap, and raising it silently converts a loop into something nobody runs.
 */
export const EVAL_BUDGET_MS = 3000;

/** Measure every eval spec. Returns { specs, total, ms, allScored }. */
export function evalRun() {
    const t0 = Date.now();
    const specs = EVAL_SPECS.map((s) => ({ ...s, result: measure(s) }));
    const ms = Date.now() - t0;
    const allScored = specs.every((s) => s.result.score !== null);
    // *** THE TOTAL IS null WHEN ANY ARM FAILED TO CONVERGE, NOT A SUM OVER THE ONES THAT WORKED. Summing the
    // survivors would let a candidate that broke one grid look like a smaller number than one that solved
    // both. UNKNOWN IS NOT A DEFAULT, and a partial sum is the flattering kind of unknown. ***
    return { specs, ms, allScored, total: allScored ? specs.reduce((a, s) => a + s.result.score, 0) : null };
}

/** The holdout, measured separately and NEVER folded into the eval total. */
export function holdoutRun() { return measure(HOLDOUT_SPEC); }

/**
 * *** THE SPLIT IS CHECKED, NOT TRUSTED. A holdout that shares a spec with the eval set is not a holdout, and
 * the failure is silent -- the numbers still come out and still look like a generalisation test. ***
 */
export function splitIsDisjoint() {
    const key = (s) => [s.n, s.tol, s.maxIters].join("/");
    return !EVAL_SPECS.some((s) => key(s) === key(HOLDOUT_SPEC));
}

/**
 * *** v3748 -- THE ACCEPT DECISION LIVES WITH THE TARGET, WHICH IS WHERE IT BELONGS. better() requires a floor
 * and refuses to guess one; before this, a caller had to import THREE modules and REMEMBER to fetch the floor
 * from a fourth place. "The caller must remember" is the shape that produced v3746's too-permissive rule in the
 * first place. The target defines the eval, so the target owns what counts as a win on it. ***
 * The floor is MEASURED at call time from loopNoise, never cached -- same reason there is no baseline file.
 */
export function acceptable(baselineResult, candidateResult, { n = 24, tol = 1e-8 } = {}) {
    const f = floorIters(n, tol);
    if (f.floor === null) return { accept: false, why: "no noise floor: " + f.why, floor: null };
    return { ...better(baselineResult, candidateResult, f.floor), floor: f.floor, floorWhy: f.why };
}

// v3941 -- pathToFileURL, NOT a basename match: `argv[1].split("/")` returns THE WHOLE PATH on
// Windows (backslashes), so this guard was false and the main block below never ran there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const r = evalRun();
    for (const s of r.specs) {
        console.log("  " + s.id.padEnd(6) + (s.result.score === null ? "NO SCORE (" + s.result.reason + ")"
            : String(s.result.score).padStart(3) + " iterations   residual " + s.result.res.toExponential(3)));
    }
    console.log("[loopTarget] eval total " + (r.total === null ? "null (an arm did not converge)" : r.total) +
                "   " + r.ms + " ms of a " + EVAL_BUDGET_MS + " ms budget");
    const h = holdoutRun();
    console.log("[loopTarget] HOLDOUT " + HOLDOUT_SPEC.id + ": " +
                (h.score === null ? "NO SCORE" : h.score + " iterations") + "   -- NOT part of the eval total");
    const d = repeat(EVAL_SPECS[0], 2);
    console.log("[loopTarget] eval spec 0 deterministic across 2 runs: " + d.deterministic);
}
