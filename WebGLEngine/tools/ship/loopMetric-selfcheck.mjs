// tools/ship/loopMetric-selfcheck.mjs -- v3746
//
// The gate for tools/ship/loopMetric.mjs -- step 2 of the six-step loop plan.
//
// *** THE ONE NUMBER THAT JUSTIFIES THE WHOLE DESIGN: a solver planted to loosen its OWN convergence test by
// 1e4 finishes in 20 ITERATIONS WHERE THE HONEST ONE TAKES 36. A METRIC THAT COUNTED ITERATIONS WOULD HAVE
// CALLED THAT A 44% IMPROVEMENT AND KEPT IT. Its residual is 5.454e-5 against a tolerance of 1e-8 -- three and
// a half orders out. The metric here scores it NULL and better() rejects it outright. ***
//
// THAT IS THE tennis-XGBoost FAILURE (v3742, awesome-autoresearch) in miniature and on this tree's own ground:
// the loop does not cheat by being clever, it cheats by finding that the metric and the goal were different
// things. HERE THEY ARE HELD TOGETHER BY THE TOLERANCE, AND THE TOLERANCE IS THE CALLER'S.
//
// WHY THIS SOLVER: PoissonMG3D.solveCG already takes `tol` as an OPTION and reports .iters and .res, so the
// separation between "what is measured" and "what counts as correct" is structural rather than a convention
// somebody has to remember. And fluid/multigridGPU-selfcheck runs in 0.47 s (v3742's timing census), which is
// the order an eval has to be for a loop to be worth running at all -- unlike the five gates that are 51% of
// the suite.

import { measure, repeat, better, fixture, costSignature } from "./loopMetric.mjs";
import { floorIters } from "./loopNoise.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "loopMetric.mjs"), "utf8");

// ---- 1. THE HONEST RUN SCORES -----------------------------------------------------------------------------
console.log("1. AN HONEST SOLVE SCORES, AND THE SCORE IS ITS ITERATION COUNT");
const base = measure({ n: 24, tol: 1e-8 });
const NOISE = floorIters(24, 1e-8);   // v3748 -- the measured floor, not a typed one
ok("!! the solver reaches the caller's tolerance and the run is scored",
    base.met === true && base.score === base.iters && base.score > 0,
    base.iters + " iterations, residual " + base.res.toExponential(3) + " against tol 1e-8. THE TOLERANCE CAME " +
    "FROM HERE, NOT FROM THE SOLVER -- solveCG takes it as an option, so what counts as correct is the " +
    "caller's to name and the solver's only job is to report what it took");

// ---- 2. THE REFUSAL, WHICH IS THE POINT -------------------------------------------------------------------
console.log("\n2. A RUN THAT DID NOT CONVERGE SCORES NOTHING -- NOT A WORSE NUMBER");
{
    // maxIters below what the problem needs: the same shape as a solver that stops early, reached without
    // touching the solver at all (v3725: a plant on the setup, not the readback).
    const cut = measure({ n: 24, tol: 1e-8, maxIters: 8 });
    ok("!! *** FEWER ITERATIONS WITHOUT THE RESIDUAL IS NO SCORE ***",
        cut.score === null && cut.iters < base.iters && cut.met === false,
        cut.iters + " iterations (fewer than " + base.iters + ") but residual " + cut.res.toExponential(3) +
        " -- score null, reason: " + cut.reason + ". *** MEASURED WITH THE SOLVER'S OWN CONVERGENCE TEST " +
        "LOOSENED BY 1e4 AND REVERTED: 20 ITERATIONS AGAINST THE HONEST 36, residual 5.454e-5. A METRIC THAT " +
        "COUNTED ITERATIONS WOULD HAVE CALLED THAT A 44% IMPROVEMENT ***");

    ok("!! the score is null and NOT a large sentinel",
        cut.score === null && !/Infinity|Number\.MAX/.test(codeOnly(SRC)),
        "a big number would make 'did not converge' SORTABLE against real results, and any minimiser would " +
        "then treat a broken solver as merely bad rather than disqualified. UNKNOWN IS NOT A DEFAULT");

    // v3748 -- better() now REQUIRES a floor; NOISE.floor comes from the measured fixture spread.
    ok("!! ...and better() REJECTS it rather than ranking it",
        better(base, cut, NOISE.floor).accept === false && /did not meet tol/.test(better(base, cut, NOISE.floor).why),
        "rejected outright, never 'worse' -- 'worse' is a direction a loop can walk toward");
}

// ---- 3. THE ACCEPT RULE ------------------------------------------------------------------------------------
console.log("\n3. WHAT COUNTS AS AN IMPROVEMENT");
{
    ok("!! an improvement CLEARING THE MEASURED NOISE FLOOR is accepted",
        better({ score: 40, tol: 1e-8 }, { score: 30, tol: 1e-8, met: true }, NOISE.floor).accept === true,
        "gain 10 against a floor of " + NOISE.floor + " (" + NOISE.why + ")");
    ok("!! the same count is NOT an improvement",
        better({ score: 30, tol: 1e-8 }, { score: 30, tol: 1e-8, met: true }, NOISE.floor).accept === false);
    // *** THE CHECK v3746 COULD NOT HAVE WRITTEN, BECAUSE ITS RULE WAS "STRICTLY FEWER". ***
    ok("!! *** A GAIN SMALLER THAN THE FIXTURE SPREAD IS REFUSED, NOT RANKED ***",
        better({ score: 36, tol: 1e-8 }, { score: 35, tol: 1e-8, met: true }, NOISE.floor).accept === false,
        "36 -> 35 is one iteration against a floor of " + NOISE.floor + ". The iteration count moves across " +
        "EIGHT FIXTURES OF THE SAME KIND (33..38, sd 1.50), SO A ONE-ITERATION WIN ON ONE FIXTURE IS " +
        "INDISTINGUISHABLE FROM HAVING PICKED A DIFFERENT PROBLEM. v3746's rule WOULD HAVE ACCEPTED IT");
    ok("!! and calling better() WITHOUT a floor THROWS rather than defaulting to zero",
        (() => { try { better({ score: 36, tol: 1e-8 }, { score: 35, tol: 1e-8 }); return false; }
                 catch (e) { return /floor is required/.test(e.message); } })(),
        "a default of 0 would have reproduced v3746's rule SILENTLY for any caller who did not know to pass one");
    ok("!! *** AND A CANDIDATE MEASURED AT A DIFFERENT TOLERANCE IS REFUSED AS NOT COMPARABLE ***",
        better({ score: 40, tol: 1e-8 }, { score: 5, tol: 1e-4, met: true }, NOISE.floor).accept === false,
        "the cheapest cheat available to anything editing the harness is to relax the bar and report the " +
        "smaller number. FIVE ITERATIONS AT 1e-4 IS NOT AN IMPROVEMENT ON FORTY AT 1e-8, and the comparison " +
        "is refused rather than silently allowed");
}

// ---- 4. DETERMINISM IS A PRECONDITION ----------------------------------------------------------------------
console.log("\n3b. ITERATIONS ARE NOT WORK, AND A COMPARISON ACROSS COSTS IS REFUSED (v3752)");
{
    const shipped = measure({ n: 24, tol: 1e-8 });
    const richer = measure({ n: 24, tol: 1e-8, opts: { pre: 3, post: 3 } });
    ok("!! *** THE 36 -> 29 'WIN' IS REFUSED AS NOT COMPARABLE, NOT ACCEPTED ***",
        richer.score < shipped.score && better(shipped, richer, NOISE.floor).accept === false &&
        /different per-iteration cost/.test(better(shipped, richer, NOISE.floor).why),
        shipped.score + " -> " + richer.score + " is a gain of " + (shipped.score - richer.score) + " against a " +
        "floor of " + NOISE.floor + ", SO v3746'S RULE WOULD HAVE BANKED IT -- while pre 3 / post 3 does HALF " +
        "AGAIN AS MUCH SMOOTHING INSIDE EVERY ITERATION. *** FOUND BY ASKING KEITH'S STEP-0 QUESTION: a " +
        "parameter search needs no write path and would have exploited this on its first pass ***");
    ok("!! the signature is DERIVED from the solver's own level structure, not typed",
        /13824\/1728\/216\/27/.test(costSignature({ n: 24 }).cells) && costSignature({ n: 24 }).sweeps === 4,
        costSignature({ n: 24 }).key + " -- levels and cell counts come from mg.levels, and the sweeps from the " +
        "solver's own pre/post");
    ok("!! two runs with the SAME schedule stay comparable",
        measure({ n: 24, tol: 1e-8 }).cost === measure({ n: 24, tol: 1e-8, opts: { pre: 2, post: 2 } }).cost,
        "the refusal must fire on a CHANGED cost and not on every comparison -- asserted both ways");
    report("*** AND THE OBVIOUS FIX WAS TRIED AND FALSIFIED IN THE SAME ROUND ***",
        "A cost MODEL derived from the level sizes -- sum over levels of (pre+post) x cells, plus the coarse " +
        "solve, plus CG's fine apply -- was measured against wall time on one core: pre4/post4 models at 4.49M " +
        "against pre2/post2's 3.30M, 36% MORE WORK, AND RUNS IN THE SAME 487 ms vs 510 ms. THE MODEL DOES NOT " +
        "PREDICT THE TIME, SO IT MUST NOT SCORE. It is used for the ONE judgement it makes reliably -- DID THE " +
        "COST CHANGE AT ALL -- which is enough to refuse a comparison. Wall time would score honestly and is " +
        "machine-dependent on this box; that is the rig's measurement, not this sandbox's.");
}

console.log("\n4. THE MEASUREMENT REPEATS EXACTLY, OR A LOOP WOULD BE OPTIMISING NOISE");
{
    const d = repeat({ n: 24, tol: 1e-8 }, 3);
    ok("!! three identical specs give an IDENTICAL iteration count, not a close one",
        d.deterministic === true && d.counts.length === 1,
        "counts " + d.counts.join(",") + ". The fixture is a fixed analytic divergence field with NO RNG. If " +
        "this ever varies, THE RIGHT RESPONSE IS TO FIND THE NONDETERMINISM, NOT TO AVERAGE IT AWAY -- an " +
        "averaged metric hides the thing that made it vary");
    ok("the fixture itself is reproducible cell for cell",
        (() => { const a = fixture(8), b = fixture(8);
                 return a.div.every((v, i) => v === b.div[i]) && a.type.every((v, i) => v === b.type[i]); })(),
        "asserted rather than assumed, because 'no RNG in it' is a claim about code and this is a claim about output");
}

// ---- 5. IT MEASURES ITERATIONS, NOT SECONDS ---------------------------------------------------------------
console.log("\n5. NO CLOCK ANYWHERE IN THE METRIC");
ok("!! *** the metric never reads a clock -- iterations are machine-independent, seconds are not ***",
    !/Date\.now|performance\.now|hrtime/.test(codeOnly(SRC)),
    "v3742: this sandbox is ONE CORE, so a runtime measured here is not a runtime for the rig, and a loop " +
    "driven by sandbox seconds would optimise for a machine nobody uses. An iteration count is the same " +
    "number on every box");

report("WHAT THIS DOES NOT CLAIM",
    "That fewer iterations is always better engineering -- an iteration of a cheaper cycle may cost more " +
    "wall time, and this metric cannot see that. It also grades ONE fixture at ONE size on ONE solver: it is " +
    "step 2 of six, and steps 5 (a HOLDOUT the loop never sees) and 6 (a trace) are exactly what stop a " +
    "candidate that is tuned to this single problem from being called an improvement to the solver.");

console.log("\nloopMetric-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
