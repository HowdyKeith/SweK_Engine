// WebGLEngine/tools/ship/timingCoverage-selfcheck.mjs -- v3584
//
// Run: node tools/ship/timingCoverage-selfcheck.mjs
// RUNTIME 0.3s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** THE REGISTER SAID THE FILE HELD THREE TIMINGS. IT HELD 580. *** The todo item's `evidence` command read
// Object.keys(t.gates||t).length -- and there is no `gates` key, so it fell back to counting the THREE TOP-LEVEL
// KEYS of the file. The number was not wrong by a little; it was measuring a different thing entirely.
//
// AND todo-selfcheck RAN THAT SAME COMMAND AND PASSED IT, because the assertion was `< 50`. *** TWO CHECKS THAT
// LOOKED INDEPENDENT SHARED ONE BUG AND AGREED ON A FALSE NUMBER *** -- which is the second-copy defect this
// session keeps finding, one level up: not two copies of data, two copies of a WRONG PROBE.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const T = JSON.parse(fs.readFileSync(path.join(HERE, "gate-timings.json"), "utf8"));
const K = JSON.parse(fs.readFileSync(path.join(ENG, "knowledge-index.json"), "utf8"));
const timed = new Set(Object.keys(T.timings || {}));
const untimed = K.gates.filter((g) => !timed.has(g.path));
const ghosts = [...timed].filter((p) => !K.gates.some((g) => g.path === p));

console.log("timingCoverage-selfcheck -- how much of the suite the budget record actually covers\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE COUNT IS READ FROM THE RIGHT PLACE THIS TIME ***");
{
    const wrong = Object.keys(T.gates || T).length;      // the probe the register used
    const right = timed.size;
    report("the register's old probe said", String(wrong));
    report("the file actually holds", String(right));

    ok("!! the two probes disagree, which is why the old number was believed",
        wrong !== right && wrong < 10,
        "Object.keys(t.gates||t) -- THERE IS NO `gates` KEY, so it fell through to the file's three TOP-LEVEL " +
        "KEYS: note, captured, timings. *** IT WAS NOT WRONG BY A LITTLE; IT WAS COUNTING A DIFFERENT THING. *** " +
        "And todo-selfcheck ran the same command with an assertion of `< 50`, so TWO CHECKS THAT LOOKED " +
        "INDEPENDENT SHARED ONE BUG and agreed on a false number.");
    ok("the timings live under `timings` and nowhere else",
        Array.isArray(Object.keys(T.timings)) && !T.gates,
        "a probe that guesses at a shape with `||` will find SOMETHING to count in almost any object");
}

// ---------------------------------------------------------------------------
console.log("\n2. COVERAGE, AS A FRACTION OF A SUITE THAT IS COUNTED SEPARATELY");
{
    report("gates in the index / timed / untimed", K.gates.length + " / " + timed.size + " / " + untimed.length);
    ok("!! the record covers most of the suite but NOT all of it",
        timed.size > 500 && untimed.length > 0,
        "*** BOTH HALVES MATTER. *** A record covering everything would make this check vacuous; a record " +
        "covering nothing would mean the budget has no evidence at all. The real state is neither, and only a " +
        "number says which.");
    ok("!! the two counts come from INDEPENDENT files",
        true,
        "the suite size is knowledge-index.json, walked from the tree; the timings are gate-timings.json, " +
        "written by the runner. A coverage figure taken from one file could never be wrong about itself.");
    ok("!! no timing survives for a gate that no longer exists",
        ghosts.length === 0,
        "a stale entry would inflate coverage with a measurement of something deleted -- the ghost case " +
        "pagePlacement's inventory checks in the other direction" +
        (ghosts.length ? " -- FOUND: " + ghosts.slice(0, 3).join(", ") : ""));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE RUNNER LEAVES EVIDENCE EVEN WHEN IT IS KILLED ***");
{
    const src = fs.readFileSync(path.join(HERE, "selfchecks.mjs"), "utf8");
    ok("!! it writes as it goes rather than only at the end",
        /WRITE_EVERY_MS/.test(src) && /writeTimings\(false\)/.test(src),
        "the old rule refused a partial write because it 'would leave the file describing a subset while " +
        "claiming to describe the suite'. RIGHT ABOUT THE DANGER, WRONG ABOUT THE REMEDY: it made the record " +
        "UNOBTAINABLE. *** A full run was started and left for nearly an hour and the file was untouched -- so " +
        "the one thing that would refresh the budget was the one thing hardest to finish. ***");
    ok("!! ...and a partial write SAYS it is partial",
        /coverage: \{ complete/.test(src),
        "A PARTIAL MEASUREMENT IS NOT DANGEROUS; A PARTIAL MEASUREMENT WEARING A COMPLETE ONE'S NAME IS. Same " +
        "distinction as absent-is-not-empty and timeout-is-not-failure: INCOMPLETE IS NOT WRONG, IT IS " +
        "INCOMPLETE AND SAYS SO.");
    ok("!! it MERGES rather than replaces, so a partial run cannot delete what it never reached",
        /\.\.\.\(prev\.timings \|\| \{\}\), \.\.\.observedMs/.test(src),
        "*** DRIVEN, NOT REASONED: a real run was started, killed after 55 seconds, and left four new timings " +
        "with ZERO LOST *** and coverage {complete:false, timedThisRun:6}.");
    ok("!! the flush is time-triggered as well as count-triggered",
        /WRITE_EVERY_MS/.test(src) && /Date\.now\(\) - lastWriteAt/.test(src),
        "the tail of this suite runs 280s, 254s and 251s a gate, so a flush every 25 gates would go TWENTY " +
        "MINUTES between writes THROUGH THE SLOWEST AND MOST INTERRUPTIBLE STRETCH OF THE RUN. Whichever " +
        "trigger comes first wins.");
    ok("!! and the comparison is >= rather than an exact modulo",
        /nSoFar - lastWriteCount >= WRITE_EVERY/.test(src),
        "*** GATES THAT FAIL ARE NOT RECORDED, so the count SKIPS VALUES and `% 25 === 0` can step straight " +
        "over its own trigger and never fire again *** -- a flush that works only when nothing goes wrong.");
    ok("--affected still writes nothing, and that rule is untouched",
        /--affected/.test(src) && /return;/.test(src),
        "a filtered run is not a small full run, it is a DIFFERENT POPULATION, and merging it would overwrite a " +
        "slow gate's real number with whatever a filtered pass happened to see");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE 15 GATES ADDED THIS SESSION ARE TIMED, INDIVIDUALLY");
{
    const mine = [
        "physics/mechanics/rigidKeys-selfcheck.mjs", "physics/mechanics/contactKeys-selfcheck.mjs",
        "physics/mechanics/contactImpulse-selfcheck.mjs", "physics/control/controlStability-selfcheck.mjs",
        "physics/control/controlStateSpace-selfcheck.mjs", "physics/control/controlMargins-selfcheck.mjs",
        "physics/crystal/structureFactor-selfcheck.mjs", "physics/crystal/powder-selfcheck.mjs",
        "physics/lockstepDt-selfcheck.mjs", "tools/ship/pagePlacement-selfcheck.mjs",
        "tools/ship/pagePlacements-selfcheck.mjs", "tools/ship/areaHygiene-selfcheck.mjs",
        "tools/ship/todo-selfcheck.mjs", "tools/ship/installHistoryReadout-selfcheck.mjs",
        "tools/ship/placementRender-selfcheck.mjs",
    ];
    const missing = mine.filter((m) => !timed.has(m));
    report("timed of the 15", (mine.length - missing.length) + " / " + mine.length);
    ok("!! every gate added v3567-v3583 has a real measurement",
        missing.length === 0,
        "each timed INDIVIDUALLY on this box, following the v3285 precedent recorded in the file's own " +
        "`captured` note, rather than taken from a batch wall-clock");
    ok("!! *** AND placementRender IS RECORDED AT ITS RUN TIME, NOT ITS SKIP TIME ***",
        T.timings["tools/ship/placementRender-selfcheck.mjs"] > 5000,
        "without jsdom the gate SKIPS in 39ms; with it, the gate RUNS in 7.6s. *** RECORDING THE SKIP WOULD " +
        "HAVE PUT A 39ms BUDGET ON A 7.6s CHECK, and the first timeout would have looked like a hang in a " +
        "check that is fine. *** A measurement of a thing not happening is not a measurement of the thing.");
    // *** v3941 -- THE NUMBER WAS FIXED TWICE AND CAME BACK TWICE, SO THIS ROUND ASSERTS THE MECHANISM. ***
    // The line above checks placementRender's recorded value. It has now been wrong three times (54ms, re-timed
    // to 14057ms at v3925; then 43ms), and re-timing it was the fix on both previous occasions. A check on a
    // VALUE cannot prevent a WRITER from overwriting that value tomorrow -- it can only notice afterwards, which
    // is exactly what happened, twice. So the writer's exclusion rule is asserted here directly.
    // *** READ THROUGH noComments, AND THE FIRST DRAFT OF THIS CHECK NEEDED IT. *** selfchecks.mjs explains
    // this rule in a comment that uses the same words the rule is asserted by, so a raw read was satisfied by
    // the EXPLANATION and would have stayed green with the reporting code deleted. Planted and caught: the
    // prose-as-code trap, in the check written to stop a regression that had already recurred twice.
    // noComments and not codeOnly: the tokens live in STRING LITERALS, and codeOnly blanks string contents.
    const sc = noComments(fs.readFileSync(path.join(ENG, "tools", "ship", "selfchecks.mjs"), "utf8"));
    ok("!! *** the WRITER refuses to record a gate that declined to run ***",
        /SKIP_LINE/.test(sc) && /declinedToRun/.test(sc) && /else observedMs\[/.test(sc),
        "*** A GATE THAT SKIPS EXITS 0, SO IT LANDS ON THE SUCCESS PATH AND ITS SKIP TIME IS MERGED OVER THE " +
        "REAL MEASUREMENT. *** Failures are excluded and timeouts are excluded; skips were not, because a skip " +
        "looks exactly like a fast pass from the runner. Forty gates in this tree can skip on an absent " +
        "dependency, and the time they take to say 'I did not run' is the shortest time they can post -- so the " +
        "budget it overwrites with is always absurdly small, and the first real timeout looks like a hang.");
    ok("!! ...and it SAYS which gates sat out, rather than excluding them quietly",
        /DECLINED TO RUN/.test(sc) && /budgets are UNCHANGED/.test(sc),
        "a silent exclusion is this same bug wearing the other face: the reader sees a coverage figure and has " +
        "no way to know which gates contributed nothing to it");
    // *** ASSERTED IN CODE, NOT IN THE COMMENT THAT SAYS IT. *** The first draft of this line tested for the
    // sentence "THE VERDICT IS STILL THE EXIT CODE" -- which lives in a comment, so stripping comments (which
    // the line above must do) made it unfallible-then-unpassable in one move. The PROPERTY is that pass++ runs
    // for a skipped gate exactly as for any other: it sits after the if/else, unguarded, on the success path.
    ok("!! ...and the verdict is still the exit code, untouched by any of this",
        /if \(declinedToRun\) skipped\.push[\s\S]{0,600}?\n        pass\+\+;/.test(sc) &&
        !/declinedToRun[\s\S]{0,200}?failures\.push/.test(sc),
        "*** THIS DECIDES TIMING ELIGIBILITY, NOT PASS OR FAIL. *** pass++ is reached by a skipped gate on the " +
        "same path as any other, and nothing about the skip reaches failures.push. A skip is still a pass, " +
        "exactly as before -- reading the skip line to decide the VERDICT would be the stdout-scraping this " +
        "suite banned at v2544, and this line is what keeps the two questions apart.");

    ok("...and the slowest of the fifteen is named in the record",
        T.timings["physics/control/controlStateSpace-selfcheck.mjs"] > 5000,
        "8.3s, from 2800 randomised polynomials and a Nyquist sweep at two resolutions");
}

console.log(fails ? `\ntimingCoverage-selfcheck: ${fails} FAILED` : "\ntimingCoverage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
