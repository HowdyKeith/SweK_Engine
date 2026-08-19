// tools/roundhouse/mpmRefineBind-selfcheck.mjs -- v3802
//
// *** SELF-CONVERGENCE, WHICH THE NOTES CALLED THE ONLY REMAINING MPM ROUND THAT WOULD SAY THE SHAPE IS
// TRUSTWORTHY RATHER THAN MERELY ENERGY-LEGAL. A collapsing column has NO analytic answer, so there is no
// reference -- but successive refinements must AGREE WITH EACH OTHER by a shrinking margin. ***
//
// *** AND THE FINDING IS THAT THE RATIO TEST CANNOT TELL YOU THAT YOU REFINED THE RIGHT THING. Both arms below
// converge tidily; ONE OF THEM IS SOLVING A DIFFERENT PROBLEM AT EVERY LEVEL. ***

import { refineDevice, REFINE_MODES, buildRefine, REST_TOL } from "./mpmRefineBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const good = await buildRefine({ mode: "refine", config: { levels: [1, 2, 4] } });
const bad = await buildRefine({ mode: "cellfloor", config: { levels: [1, 2, 4] } });

console.log("1. THE COLUMN CONVERGES UNDER REFINEMENT");
{
    ok("!! *** SUCCESSIVE REFINEMENTS AGREE BY A SHRINKING MARGIN ***",
        good.converges === true && good.diffs[1] < good.diffs[0],
        "com.y " + good.values.map((v) => v.toFixed(6)).join(" / ") + " at k = " + good.levels.join(", ") +
        "; differences " + good.diffs.map((d) => d.toExponential(3)).join(" then ") + ", ratio " +
        good.ratio.toFixed(3) + " (order " + good.order.toFixed(2) + "). *** THERE IS NO ANALYTIC ANSWER FOR A " +
        "COLLAPSING COLUMN, so this is the only kind of statement available: not 'it is right' but 'it is " +
        "STILL MOVING TOWARD SOMETHING, and less each time' ***");
    ok("!! and the order is first, which is what contact and plasticity give",
        good.order > 0.5 && good.order < 2.5,
        "order " + good.order.toFixed(2) + ". The TRANSFER alone is second order (v3782 measured 1.968 on " +
        "voxelize's tessellation) -- BOUNDARIES AND A YIELD SURFACE DEGRADE IT, and claiming second order here " +
        "would be quoting a property of one piece as a property of the whole");
}

console.log("\n1b. THE OBSERVABLE MUST BE AT REST, AND THE FIXTURE MUST BE ONE BODY");
{
    // *** v3846 -- BOTH OF THESE CAME OUT OF LIFTING THIS STUDY TO THE 3D LOOP, WHERE EACH ONE BIT. ***
    // The 3D column is still RINGING at t = 2 s -- com.y swinging 1.83 to 2.33, peak speed 3.9 -- and the ratio
    // came out 0.045, an apparent DIVERGENCE that was pure sampling phase. Run to t = 16 s, where every level
    // IS at rest, and the same solver gives ratio 3.691, order 1.88. THE SOLVER WAS NEVER THE PROBLEM; THE
    // SAMPLE WAS. A convergence study assumes its observable has stopped moving and never says so.
    ok("!! *** com.y HAS STOPPED MOVING AT THE SAMPLE, SO THE RATIO IS OF SETTLED STATES ***",
        good.restedAtSample === true,
        "drift " + good.comDrift.map((d) => d.toExponential(2)).join(" / ") + " world units per second against " +
        "a tolerance of " + REST_TOL + ". Peak PARTICLE speed is " + good.restVmax.map((v) => v.toExponential(2)).join(" / ") +
        " and is REPORTED NOT ASSERTED: one jittering particle sets that number while the body it belongs to " +
        "has stopped, which is why the first version of this check failed a study whose com.y is flat to six figures");

    // DRIVEN: sample the same run while it is still falling and the check must refuse it.
    const early = await buildRefine({ mode: "refine", config: { levels: [1, 2, 4], baseSteps: 120 } });
    ok("!! ...and sampling the SAME fixture mid-collapse is refused",
        early.restedAtSample === false,
        "at t = 0.5 s the drift is " + early.comDrift.map((d) => d.toExponential(2)).join(" / ") + ". *** AND IT " +
        "STILL PRODUCES A RATIO -- " + (early.ratio === null ? "n/a" : early.ratio.toFixed(3)) + " -- WHICH IS THE " +
        "WHOLE POINT: A TRANSIENT CONVERGES TIDILY TOO, exactly as the cellfloor arm below converges tidily on " +
        "the wrong problem ***");

    ok("!! *** THE BLOCK IS THE SAME SIZE AT EVERY LEVEL ***", good.extentInvariant === true,
        "extents " + good.blockExtents.map((e) => e.toFixed(4)).join(" / "));

    // DRIVEN, ARITHMETICALLY: the fixture this file shipped with, from v3802 to v3845.
    const legacy = good.levels.map((k) => (6 * k - 1) * (0.2 / k));
    const legacyInvariant = legacy.every((e) => Math.abs(e - legacy[0]) < 1e-9);
    ok("!! ...and it CATCHES the fixture this study shipped with for 44 versions", legacyInvariant === false,
        "n = 6k particles at spacing 0.2/k gives (6k-1)*0.2/k = " + legacy.map((e) => e.toFixed(4)).join(" / ") +
        " -- A BLOCK 15% BIGGER AT THE FINEST LEVEL, while mass and floor stayed invariant and both existing " +
        "checks passed. MEASURED BEFORE CHANGING IT: the old fixture gives ratio 2.188, the fixed one 2.162, so " +
        "it was IMMATERIAL HERE -- reported as the negative it is rather than dressed up as a catch");
}

console.log("\n2. THE FIXTURE MUST BE THE SAME PROBLEM AT EVERY LEVEL");
{
    ok("!! *** THE FLOOR STANDS AT THE SAME WORLD HEIGHT AT ALL THREE RESOLUTIONS ***",
        good.fixtureInvariant === true,
        "floor heights " + good.floorHeights.map((f) => f.toFixed(3)).join(" / ") + ". A WALL PINNED TO A CELL " +
        "COUNT MOVES WHEN THE CELLS DO");
    ok("!! and the total mass is invariant, so refining adds particles and not material",
        good.massInvariant === true,
        "per-particle mass and volume quarter as the count quadruples. *** v3790 MADE THE OPPOSITE MISTAKE -- " +
        "scaling the MATERIAL with the grid, which holds the very ratio under test constant. REFINING MEANS " +
        "MORE NODES OVER THE SAME MATERIAL ***");
    ok("!! the device DECLARES the plant, with `refine` first",
        DEVICE_NAMES.includes("mpmrefine") && refineDevice.plantMode === "cellfloor" &&
        refineDevice.plantFlips === "fixtureInvariant" && REFINE_MODES[0] === "refine");
}

console.log("\n3. AND THE RATIO CANNOT SEE THE PLANT");
{
    // the numbers live in the DETAIL, which is derived. v3846 moved the fixture and this heading still read
    // "2.018 AGAINST 2.188" from the old one -- a hardcoded measurement in a check name, one version after the
    // round whose subject is measurements that stop being true.
    ok("!! *** THE PLANTED ARM CONVERGES JUST AS TIDILY ***",
        bad.ratio > 1.5 && bad.ratio < 3,
        "planted com.y " + bad.values.map((v) => v.toFixed(4)).join(" / ") + ", ratio " + bad.ratio.toFixed(3) +
        " against the honest " + good.ratio.toFixed(3) + ". *** IT IS CONVERGING TO ZERO, BECAUSE THE FLOOR IS " +
        "GOING TO ZERO: floors " + bad.floorHeights.map((f) => f.toFixed(3)).join(" / ") + ". A DIFFERENT " +
        "PROBLEM AT EVERY LEVEL, EACH SOLVED CORRECTLY ***");
    ok("!! *** ONLY THE INVARIANCE CHECK CATCHES IT ***",
        bad.fixtureInvariant === false && bad.converges === false,
        "*** A CONVERGENCE TEST GRADES THE SOLVER AND ASSUMES THE FIXTURE. Richardson asks 'are these three " +
        "numbers settling' and CANNOT ASK 'are these three numbers about the same thing'. Shipping the ratio " +
        "alone would have certified a refinement study of three unrelated problems ***");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the limit is CORRECT. Self-convergence says the answer is settling, NOT that it is settling on the " +
    "truth -- the planted arm is proof of exactly that gap, and it settles beautifully on nonsense. WITH NO " +
    "ANALYTIC ANSWER AND NO REFERENCE IMPLEMENTATION, 'converges, to something, at first order' IS THE WHOLE " +
    "OF WHAT CAN BE SAID HERE. The angle of repose would be a real external check and still needs box3d, which " +
    "does not build in this sandbox.");

console.log("\nmpmRefineBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
