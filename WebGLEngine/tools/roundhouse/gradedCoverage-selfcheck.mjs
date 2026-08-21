// tools/roundhouse/gradedCoverage-selfcheck.mjs
//
// Run: node tools/roundhouse/gradedCoverage-selfcheck.mjs   (~0.1s)
//
// v3195 -- HOW MUCH OF THE PROVEN PHYSICS IS ACTUALLY GRADED? TWENTY-TWO OF NINETY-SIX.
//
// Keith asked whether proven physics modules are missing from the graded lab and named figureEight and
// gyroscope. *** BOTH ARE, AND SO ARE SEVENTY-TWO OTHERS. *** 96 physics modules carry their own selfcheck --
// proven in this tree's sense -- and only 22 are reachable from a device bind.
//
// *** REACHABILITY IS EXACT AND CLASSIFICATION IS NOT, WHICH IS WHY THIS REPORTS ONE AND REFUSES THE OTHER. ***
// "Some Bind.mjs imports this module" is a fact about the import graph, decidable by reading. "This ungraded
// module has an answer key" is not: I classified the 74 by keyword and it put GYROSCOPE IN THE WRONG PILE --
// its gate holds dL/dt = tau, proves that a FASTER SPIN PRECESSES SLOWER, and carries a sabotage that points
// the torque along the axis and watches the thing tip. THE KEYWORD PROBE HAS NOW MISLED THIS PROJECT THREE
// TIMES: v3174's mode count, v3189's census, and that. So this counts what it can count and NAMES the rest.
//
// *** AND THE RATCHET RUNS ONE WAY ONLY. *** Wiring a proven module into a device is the work this is meant to
// prompt, and a gate that failed when the ungraded count fell would punish exactly that. The assertion is that
// THE GRADED COUNT DOES NOT SHRINK -- unwiring is a regression, wiring is not.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const G = await import(pathToFileURL(path.join(HERE, "gradedCoverage.mjs")).href);
const BASE = path.join(HERE, "graded-coverage-baseline.json");

const cov = G.gradedCoverage(ENG);
if (!fsMod.existsSync(BASE) || process.env.SWEK_FREEZE_GRADED_COVERAGE === "1") {
    fsMod.writeFileSync(BASE, JSON.stringify({
        note: "v3195 -- THE GRADED COUNT MUST NOT SHRINK. Wiring a proven physics module into a device is the " +
              "work this census exists to prompt, so a FALLING ungraded count is progress and must never fail a " +
              "build. UNWIRING one is a regression and must. Re-freeze after a deliberate change with " +
              "SWEK_FREEZE_GRADED_COVERAGE=1 node tools/roundhouse/gradedCoverage-selfcheck.mjs",
        captured: "v3195", proven: cov.proven, graded: cov.graded.length, gradedList: cov.graded,
    }, null, 1));
    console.log("  ----  FROZEN at " + cov.graded.length + " graded of " + cov.proven + " proven.");
}
const base = JSON.parse(fsMod.readFileSync(BASE, "utf8"));

// ---- 1. THE COUNT IS REAL, AND IT IS A REACHABILITY FACT ---------------------------------------------------------
{
    // *** v3425 -- THIS ASSERTED `graded < proven/2` AND WENT RED BECAUSE THE NUMBER IMPROVED. *** It was true
    // when it was written and it is A ROUND'S OUTCOME FROZEN AS THE EXPECTATION -- the named species in this
    // project's own failure list, the one that reads "A STATE that progress was meant to change". Nine rounds of
    // binding work took graded from 65 to 75 of 150 and crossed it, and the gate called that a failure.
    //
    // THE PROPERTY IT ACTUALLY WANTED IS THAT THE NUMBER IS DERIVED AND WHOLE, not that it is small. A census
    // that partitions the proven set with no remainder is a measurement; a threshold on how good the answer is
    // allowed to be is a ceiling with a round's date on it. The RATCHET below is what guards direction, and it
    // already does that job properly by asserting the graded list cannot SHRINK.
    ok("!! *** the coverage number is DERIVED AND WHOLE: graded and ungraded partition the proven set ***",
        cov.proven > 80 && cov.graded.length + cov.ungraded.length === cov.proven &&
        cov.graded.length > 0 && cov.ungraded.length > 0,
        cov.graded.length + " graded of " + cov.proven + " proven, " + cov.ungraded.length + " ungraded. This " +
        "was a number Keith had to ASK FOR; it is now something the tree reports -- and it is a PARTITION, so " +
        "nothing can fall between the two lists and go uncounted");

    ok("!! graded means SOME BIND IMPORTS IT -- read from the import specifier, not the name",
        // v3298 -- this asserted the LITERAL TEXT of the old regex, which hardcoded "physics/". Widening the
        // matcher to the registered PHYSICS_ROOTS broke it, and that is the check being pinned to an
        // implementation rather than to its behaviour. The behaviour is what matters: graded must come from
        // reading an import SPECIFIER, not from matching a device name. Asserted directly now, by checking that
        // a module whose name shares nothing with its bind is still counted.
        // THE PROPERTY: a module counted as graded whose PATH shares no name with the bind that imports it.
        // simulation/lbm/twoFExperiment.mjs is imported by twoFBind.mjs from a different folder entirely, so it
        // can only be counted by reading the specifier. If the scan ever reverted to name-matching, this drops.
        // NOTE: cov.graded holds PLAIN STRINGS, not {mod} objects -- reading g.mod gave undefined and this
        // check failed twice on my mistake rather than the code's. Fourth wrong shape assumption this session.
        cov.graded.some((g) => /simulation\//.test(String(g))),
        "v3194 found that 'ct' lives in tomographyBind.mjs and 'windtunnel' is exported as fluidDevice -- A NAME " +
        "IS NOT A LOCATION, and a name-based scan misses real wiring");

    ok("!! *** it offers NO 'has an answer key' number, deliberately ***",
        !/hasKey|answerKey|keyed:/.test(fsMod.readFileSync(path.join(HERE, "gradedCoverage.mjs"), "utf8")),
        "I classified the 74 by keyword and it put GYROSCOPE IN THE WRONG PILE, though its gate proves " +
        "dL/dt = tau and that a faster spin precesses SLOWER. OFFERING THAT AS A FIELD WOULD INVITE SOMEBODY TO " +
        "TRUST IT, and the keyword probe has now misled this project three times");
}

// ---- 2. THE RATCHET RUNS ONE WAY --------------------------------------------------------------------------------
{
    const lost = base.gradedList.filter((m) => !cov.graded.includes(m));
    ok("!! *** no module has stopped being graded ***",
        lost.length === 0,
        lost.length ? "UNWIRED: " + lost.join(", ") : base.graded + " frozen, " + cov.graded.length + " now. " +
        "A FALLING UNGRADED COUNT IS PROGRESS AND MUST NEVER FAIL A BUILD -- so the assertion is on the graded " +
        "list shrinking, not on the ungraded one moving");

    ok("...and newly graded modules are reported, not silently absorbed",
        true,
        (() => { const gained = cov.graded.filter((m) => !base.gradedList.includes(m));
                 return gained.length ? "NEWLY GRADED: " + gained.join(", ") + " -- re-freeze with " +
                        "SWEK_FREEZE_GRADED_COVERAGE=1" : "none since the freeze"; })());
}

// ---- 3. THE TWO KEITH NAMED ---------------------------------------------------------------------------------------
{
    // *** v3196 -- v3195 ASSERTED THAT BOTH WERE UNGRADED, AND v3196 GRADED figureEight. THE STATE ENCODED AS
    // THE EXPECTATION, one round later, in the gate whose own ratchet was built to allow exactly this move. ***
    // The permanent property is that the two lists PARTITION the proven set: every module in exactly one, none
    // in both, none in neither. Which side a given module sits on is progress, not an invariant.
    ok("!! the graded and ungraded lists PARTITION the proven set",
        cov.graded.length + cov.ungraded.length === cov.proven &&
        cov.graded.every((m) => !cov.ungraded.includes(m)),
        cov.graded.length + " + " + cov.ungraded.length + " = " + cov.proven + ", disjoint. v3195 asserted that " +
        "figureEight and gyroscope were BOTH UNGRADED and v3196 graded figureEight -- WHICH SIDE A MODULE SITS " +
        "ON IS PROGRESS, NOT AN INVARIANT");

    // *** v3197 GRADED gyroscope, AND v3196'S LINE HERE SAID EXACTLY WHAT TO DO: "when it is graded this line
    // goes red and should be DELETED -- said out loud so the next person does not weaken it instead." DONE.
    // The instruction was written into the gate BECAUSE a red line invites a loosened threshold, and naming
    // the correct response in advance is the only thing that reliably prevents that. ***
}

console.log();
console.log("  ----  UNGRADED, " + cov.ungraded.length + " of them. Not a backlog -- a list somebody reads:");
for (let i = 0; i < cov.ungraded.length; i += 6) {
    console.log("  ----    " + cov.ungraded.slice(i, i + 6).map((m) => m.replace("physics/", "")).join(", ").slice(0, 108));
}
console.log("  ----  WHICH OF THESE DESERVE TO BE DEVICES IS NOT DERIVABLE AND IS NOT GUESSED AT HERE.");
if (fails) { console.log("gradedCoverage-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gradedCoverage-selfcheck: all checks pass");
