// tools/ship/loopNoise-selfcheck.mjs -- v3748
//
// The gate for tools/ship/loopNoise.mjs -- step 4 of the six-step loop plan.
//
// *** THE FINDING THIS FILE GUARDS: THE OBVIOUS TOOL WOULD HAVE MEASURED NOTHING. tools/roundhouse/seedSpread
// .mjs varies a `seed` in a device's config, and loopMetric's fixture is a fixed analytic field with NO RNG AND
// NO SEED -- so it would have returned sd = 0 and been read as "no noise" when it means "no experiment". A
// CONFIDENT ZERO IS THE MOST EXPENSIVE READING BECAUSE IT LOOKS LIKE THE BEST POSSIBLE ONE. ***
//
// *** SO THE SPREAD THAT MATTERS FOR A DETERMINISTIC SOLVER IS FIXTURE SENSITIVITY, NOT RUN-TO-RUN JITTER --
// v3746 already asserted the jitter is exactly zero. MEASURED across eight problems of the same kind at n=24:
// 36, 35, 36, 34, 34, 34, 33, 38 -- mean 35.00, sd 1.50, range 33..38. SO v3746'S ACCEPT RULE (STRICTLY FEWER
// ITERATIONS) WOULD HAVE CALLED 36 -> 35 A WIN WHILE IT SITS INSIDE THE SPREAD BETWEEN PROBLEMS. ***

import { FIXTURE_FAMILY, fieldFor, itersFor, spread, floorIters } from "./loopNoise.mjs";
import { measure } from "./loopMetric.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "loopNoise.mjs"), "utf8");

// ---- 1. THE FAMILY IS GENUINELY VARIED --------------------------------------------------------------------
console.log("1. AN ENSEMBLE OF ONE PROBLEM RELABELLED WOULD REPORT A CONFIDENT ZERO");
const s = spread(24, 1e-8);
ok("!! every member converged, so the spread is over real answers",
    s.allConverged === true && s.values.every((v) => typeof v === "number"),
    s.values.join(", ") + " -- IF ANY MEMBER FAILED, spread() RETURNS null RATHER THAN A FIGURE OVER THE " +
    "SURVIVORS, which would SHRINK exactly when the solver got worse");

ok("!! *** THE MEMBERS ARE DIFFERENT PROBLEMS, ASSERTED RATHER THAN ASSUMED ***",
    new Set(s.values).size > 1 && s.sd > 0,
    "sd " + s.sd.toFixed(2) + " over " + s.values.length + " fixtures. A family that produced ONE repeated " +
    "value would give sd = 0 and a floor of 0, which ACCEPTS EVERY CANDIDATE -- the confident zero again, this " +
    "time inside the tool built to prevent it");

ok("!! the fields really differ cell by cell, not just in their labels",
    (() => { const a = fieldFor(8, FIXTURE_FAMILY[0]), b = fieldFor(8, FIXTURE_FAMILY[1]);
             return a.div.some((v, i) => v !== b.div[i]); })(),
    "checked on the ARRAYS, because 'different wavenumbers' is a claim about the parameters and this is a " +
    "claim about the output");

ok("!! and the ensemble CONTAINS the fixture the loop actually optimises",
    (() => { const m = measure({ n: 24, tol: 1e-8 }); return s.values.includes(m.score); })(),
    "member 0 is loopMetric's own field (1,2,3, phase 0). An ensemble that EXCLUDED the eval fixture would be " +
    "measuring a different population from the one the loop works on");

// ---- 2. THE FLOOR -----------------------------------------------------------------------------------------
console.log("\n2. THE FLOOR IS MEASURED, AND IT IS BIGGER THAN ONE ITERATION");
const f = floorIters(24, 1e-8);
ok("!! *** THE FLOOR EXCEEDS A ONE-ITERATION CHANGE, WHICH IS THE WHOLE POINT ***",
    f.floor >= 2,
    "floor " + f.floor + " iterations (" + f.why + "). *** v3746 ACCEPTED ANY STRICTLY-FEWER COUNT, so it " +
    "would have banked 36 -> 35 as a win. AN IMPROVEMENT SMALLER THAN THE FIXTURE SPREAD IS INDISTINGUISHABLE " +
    "FROM HAVING PICKED A DIFFERENT PROBLEM ***");

ok("!! the floor is a WHOLE number of iterations",
    Number.isInteger(f.floor),
    "iterations are integers, and a floor of 2.99 accepts a 3 that a floor of 3 refuses");

ok("!! k is stated, not tuned, and raising it is the only direction that is a decision",
    f.k === 2 && /k IS STATED\s*\n?.*RATHER THAN TUNED|k IS STATED/.test(SRC.replace(/\s+/g, " ")),
    "two sigma over EIGHT samples -- nothing here has the statistics to justify a cleverer bar. LOWERING k TO " +
    "MAKE A CANDIDATE PASS IS THE THING THIS FILE EXISTS TO STOP");

// ---- 3. NO RNG, BECAUSE THE POINT IS THAT THERE IS NONE ---------------------------------------------------
console.log("\n3. THE FAMILY IS VARIED BUT NOT RANDOM");
ok("!! *** no RNG anywhere in the module ***",
    !/Math\.random|crypto\.getRandomValues/.test(codeOnly(SRC)),
    "a RANDOM family would put run-to-run noise back into a measurement whose whole point is that there is " +
    "none -- and then the floor itself would need a floor");

ok("!! the spread repeats exactly",
    (() => { const a = spread(24, 1e-8), b = spread(24, 1e-8);
             return a.values.every((v, i) => v === b.values[i]) && a.sd === b.sd; })(),
    "asserted on the OUTPUT, because 'no RNG in it' is a claim about code and this is a claim about results");

report("WHY seedSpread IS NOT USED HERE, AND IT WAS CHECKED RATHER THAN ASSUMED",
    "tools/roundhouse/seedSpread.mjs relSpread() takes a DEVICE NAME and varies `seed` in its config. " +
    "loopMetric's fixture has NO seed and NO RNG, so it would have returned sd = 0 -- and relSpread's own " +
    "error path exists to refuse a field the device does not report, which is the SAME failure one step " +
    "removed. THE RIGHT REUSE WAS THE IDEA (is a trend larger than the noise it sits in), NOT THE FUNCTION.");

report("WHAT THIS DOES NOT CLAIM",
    "That eight fixtures is enough, or that this family spans the problems a real solver meets -- they are all " +
    "smooth sine products on one domain shape at one size. A candidate that improved these eight and wrecked a " +
    "discontinuous field would pass here. THAT IS WHAT STEP 5's HOLDOUT IS FOR, and the holdout (n=32) is a " +
    "different SIZE rather than a different KIND, which is a gap worth naming before anything is accepted.");

console.log("\nloopNoise-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
