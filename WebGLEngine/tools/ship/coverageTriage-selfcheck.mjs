// WebGLEngine/tools/ship/coverageTriage-selfcheck.mjs — v3410
//
// Run: node tools/ship/coverageTriage-selfcheck.mjs   (~2s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// gateReach reported "63.3% of physics modules reachable from a gate" and was careful to call it A DENOMINATOR,
// NOT A VERDICT. Nobody looked inside it for three versions, and the number got quoted in three changelogs.

import { triage, triageLines, NON_SCENE, importsPhysics } from "./coverageTriage.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t = triage();

// ---- 1. THE POPULATION IS DOMINATED BY SCENE CODE ---------------------------------------------------------------
{
    ok("!! most of the ungated count is flat simulation scene files that import NO physics at all",
       t.scene > 100,
       t.scene + " of them — " + t.sceneSample.map((p) => p.split("/")[1]).join(", ") + ", ... — and the test is " +
       "EVIDENCE rather than taste: a file importing nothing from physics, lbm, em, tomo or cosmo is not a physics module");
    ok("...verified by import, not by directory or filename",
       t.sceneSample.every((p) => !importsPhysics(p)),
       "every sampled scene file was checked for a physics import and has none");
}

// ---- 2. SO THE HONEST COVERAGE FIGURE IS FAR HIGHER THAN THE QUOTED ONE ---------------------------------------------
{
    // *** v3853 -- THIS ASSERTED `rawFraction < 0.70` AND WENT RED BECAUSE THE TREE GOT BETTER. *** Raw
    // coverage was 63% when this was written and is 73.7% now: more modules are gated than were, and the
    // check read that improvement as a failure. A GATE THAT FORBIDS ITS OWN FIX IS A GATE THAT GETS EDITED TO
    // AGREE WITH WHATEVER SHIPPED (v3816's words, on a different file, in this same session's other red).
    //
    // THE CLAIM WAS NEVER ABOUT THE RAW NUMBER'S ABSOLUTE VALUE -- it is that EXCLUDING SCENE CODE CHANGES THE
    // PICTURE MATERIALLY, because PHYSICS_ROOTS sweeps in demo scenes. So the GAP is asserted, which is the
    // thing that must not close, and the honest figure keeps its floor. If the raw number ever reaches the
    // honest one the denominator has been fixed and THIS LINE SHOULD BE DELETED, NOT RELAXED.
    ok("!! excluding scene code moves the picture materially -- the honest figure is far above the raw one",
       t.honestFraction > 0.92 && (t.honestFraction - t.rawFraction) > 0.15,
       (t.rawFraction * 100).toFixed(1) + "% raw -> " + (t.honestFraction * 100).toFixed(1) + "% honest (" +
       t.physicsGated + " of " + t.physicsTotal + ") — the denominator swept in scene code because PHYSICS_ROOTS " +
       "includes simulation wholesale");
}

// ---- 3. THE REMAINDER IS SMALL ENOUGH TO READ, AND EVERY ONE IS CLASSIFIED --------------------------------------------
{
    ok("!! the non-scene remainder is a list somebody can read in a minute",
       t.nonScene.length < 15, t.nonScene.length + " modules");
    const unclassified = t.nonScene.filter((p) => !NON_SCENE[p]);
    ok("!! every one carries a verdict AND a reason, so none is silently omitted",
       unclassified.length === 0,
       unclassified.length ? "unclassified: " + unclassified.join(", ")
                           : Object.entries(t.counts).filter(([, n]) => n).map(([k, n]) => n + " " + k).join(", "));
    ok("...and the reasons are real sentences rather than labels",
       Object.values(NON_SCENE).every((e) => e.why.length > 50));
}

// ---- 4. THE ONE THAT MATTERED IS NOW GATED ---------------------------------------------------------------------------------
{
    const fs = await import("node:fs");
    ok("!! fluid/flip2d.mjs was GATEABLE and is now gated",
       NON_SCENE["fluid/flip2d.mjs"].verdict === "GATEABLE" && fs.existsSync("fluid/flip2d-selfcheck.mjs"),
       "a correct FLIP/PIC solver by its own description, with maxDivergence() sitting unexercised — invisible " +
       "inside a count of 125 and obvious inside a list of nine");
    ok("!! ...and flip3d is NAMED as still ungated rather than quietly left out",
       NON_SCENE["fluid/flip3d.mjs"].verdict === "GATEABLE",
       "so it is a decision somebody made rather than an oversight nobody noticed");
}

for (const l of triageLines(t)) console.log("        " + l);
console.log(fails ? ("[coverageTriage-selfcheck] FAILED " + fails) : "[coverageTriage-selfcheck] all passed");
process.exit(fails ? 1 : 0);
