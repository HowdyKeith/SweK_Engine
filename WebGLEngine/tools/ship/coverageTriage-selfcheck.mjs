// WebGLEngine/tools/ship/coverageTriage-selfcheck.mjs — v3410
//
// Run: node tools/ship/coverageTriage-selfcheck.mjs   (~25s — MEASURED individually)
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
    ok("!! excluding scene code, coverage is 96% and not 63%",
       t.honestFraction > 0.92 && t.rawFraction < 0.70,
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
