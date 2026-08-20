// WebGLEngine/tools/ship/multigrid3dTiming-selfcheck.mjs -- v3355
// *** THE HARNESS IS GATED ON ITS REFUSALS, NOT ON ITS NUMBERS. *** A benchmark that always produces a ranking
// is measuring something; whether it is the code or the machine is the only question that matters.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timeConfig, separated, compare, domain, usable, UNUSABLE_SPREAD } from "../multigrid3dTiming.mjs";
import { noComments, prose } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const src = fs.readFileSync(path.join(ENG, "tools", "multigrid3dTiming.mjs"), "utf8");

// ---- 1. THE SEPARATION RULE, ON SYNTHETIC BANDS WHERE THE ANSWER IS KNOWN ----------------------------------
const band = (min, p95) => ({ min, p95 });
// Bands kept INSIDE the usability rule on purpose: my first draft used 100..200 and 200..300, which span 2.0x
// and 1.5x, and the new refusal rejected them as unusable -- correctly. A synthetic fixture that could not occur
// in a real run is not a test of the real rule.
ok("!! *** overlapping bands are INDISTINGUISHABLE, which is a first-class answer ***",
    separated(band(100, 120), band(110, 130)) === null && separated(band(100, 120), band(119, 140)) === null,
    "a harness that always ranks is measuring its own noise. NULL IS A RESULT HERE, not a failure to produce one");

ok("...and non-overlapping bands ARE separated, in the right direction",
    separated(band(100, 120), band(200, 230)).faster === "a" &&
    separated(band(200, 230), band(100, 120)).faster === "b",
    "both directions driven -- a detector that fires on everything and one that fires on nothing look the same " +
    "until you try both");

// ---- 2. THE NULL TEST, DRIVEN FOR REAL. THIS IS THE ANSWER KEY. ---------------------------------------------
const n = 16;
const a = timeConfig(n, { pre: 2, post: 2 }, {}, { trials: 5, warm: 2 });
const b = timeConfig(n, { pre: 2, post: 2 }, {}, { trials: 5, warm: 2 });
say("null test at " + n + "^3: A [" + a.min + ".." + a.p95 + "] B [" + b.min + ".." + b.p95 + "]  -> " +
    (separated(a, b) ? "SEPARATED" : "indistinguishable"));
ok("!! *** the SAME config under two labels comes out indistinguishable ***",
    separated(a, b) === null,
    "THE ANSWER KEY, and the thing almost no benchmark has. If this ever separates, the harness is resolving " +
    "machine noise and every verdict it prints is suspect -- which is exactly what happened at v3354 when one " +
    "cold trial per config ranked five of them and produced an impossible row");

// ---- 3. WARM-UP IS DISCARDED **AND REPORTED** ---------------------------------------------------------------
ok("!! warm-up runs are discarded AND the count is returned",
    a.warm === 2 && a.trials === 5 && Array.isArray(a.runs) && a.runs.length === 5,
    "a discarded warm-up that is not reported is indistinguishable from no warm-up at all. multigrid.html " +
    "learned this on the 2D side: one cold pair made the gather path look 1.45x faster than scatter");

// ---- 4. ITERATIONS ARE NOT WORK, AND THE HARNESS SAYS SO ------------------------------------------------------
ok("!! *** it prints iterations and ranks only TIME ***",
    // MY OWN RECURRING SLIP, AGAIN: this sentence is printed by the tool, so it lives in a STRING. prose()
    // extracts COMMENTS and could never have seen it -- noComments keeps strings and is the right view.
    noComments(src).includes("ITERATIONS ARE NOT WORK") && /only the TIME is ranked/.test(noComments(src)),
    "v3354 measured pcCycles:2 taking 30% FEWER iterations and MORE wall time. A harness ranking the iteration " +
    "column would have recommended the slower config, which is the error the multigrid3d gate already pins");

// ---- 4b. A BAND TOO WIDE TO MEAN ANYTHING SEPARATES FROM NOTHING -------------------------------------------
const wide = { min: 147, p95: 247 }, tight = { min: 139, p95: 142 };
ok("!! *** a run whose own spread exceeds " + UNUSABLE_SPREAD + "x is UNUSABLE and ranks nothing ***",
    usable(tight) && !usable(wide) && separated(wide, tight) === null && separated(tight, wide) === null,
    "THESE ARE THE REAL NUMBERS FROM THE RUN THAT FAILED THIS GATE at v3355: the null test reported the same " +
    "config separated from itself because one side caught a GC outlier and spanned 1.68x. Re-measured, 0 of 3 " +
    "attempts separated across five warm-up/trial/size settings -- SO IT WAS NOT INSUFFICIENT WARM-UP, AND " +
    "BUMPING THE COUNT WOULD HAVE BEEN TUNING UNTIL GREEN. An intermittently failing gate teaches people to re-run");

// ---- 5. IT REUSES stats() RATHER THAN RE-DERIVING A MEDIAN -----------------------------------------------------
ok("!! the median comes from brain/bench.mjs, not a second implementation",
    /from "\.\.\/brain\/bench\.mjs"/.test(noComments(src)),
    "a second median is a second truth, and this tree has spent rounds on exactly that shape");

// ---- 6. FRONT DOOR: it PRINTS AND EXITS ZERO, so it is a report and not a gate ---------------------------------
const reg = fs.readFileSync(path.join(ENG, "tools", "ship", "reportingTools.mjs"), "utf8");
ok("!! it is registered as a REPORTING tool and names itself in its output",
    /multigrid3dTiming\.mjs/.test(noComments(reg)) && /\[multigrid3dTiming\]/.test(noComments(src)),
    "a measurement is not a pass or a fail, and dressing one up as a gate invites tuning the threshold until " +
    "it goes green");

console.log(failed ? "multigrid3dTiming-selfcheck: " + failed + " FAILED" : "multigrid3dTiming-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
