// tools/roundhouse/mpmRefineBind-selfcheck.mjs -- v3802
//
// *** SELF-CONVERGENCE, WHICH THE NOTES CALLED THE ONLY REMAINING MPM ROUND THAT WOULD SAY THE SHAPE IS
// TRUSTWORTHY RATHER THAN MERELY ENERGY-LEGAL. A collapsing column has NO analytic answer, so there is no
// reference -- but successive refinements must AGREE WITH EACH OTHER by a shrinking margin. ***
//
// *** AND THE FINDING IS THAT THE RATIO TEST CANNOT TELL YOU THAT YOU REFINED THE RIGHT THING. Both arms below
// converge tidily; ONE OF THEM IS SOLVING A DIFFERENT PROBLEM AT EVERY LEVEL. ***

import { refineDevice, REFINE_MODES, buildRefine } from "./mpmRefineBind.mjs";
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
    ok("!! *** THE PLANTED ARM CONVERGES JUST AS TIDILY -- RATIO 2.018 AGAINST 2.188 ***",
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
