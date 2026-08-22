// tools/roundhouse/flip2dBind-selfcheck.mjs -- v3806
//
// *** flip2d WAS GRADED AND NOT PLANTED, AND ITS OWN BIND SAID SO: "the curriculum asked for a GRADE and this
// is a grade; a plant for flip2d is a separate round". THIS IS THAT ROUND. A KEY THAT HAS NEVER BEEN SHOWN TO
// FAIL IS A KEY NOBODY HAS TESTED. ***
//
// *** THE PLANT IS AN ORDER OF OPERATIONS: gravity applied AFTER the pressure projection instead of before, so
// THE PROJECTION NEVER SEES IT and no hydrostatic gradient can develop. THE SAME LINES IN A DIFFERENT ORDER --
// the shape v3790 found in MPM's grid step -- WHICH IS WHY READING THE CODE DOES NOT CATCH IT. ***

import { buildFlip2D, flip2dDevice, FLIP2D_MODES } from "./flip2dBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildFlip2D({ mode: "hydrostatic" });
const planted = await buildFlip2D({ mode: "forceslate" });

console.log("1. THE KEY STILL HOLDS");
{
    ok("!! the hydrostatic slope matches rho*g per cell",
        honest.slopeErrFrac < 1e-3,
        "slope " + honest.slopePerCell.toFixed(6) + " against an exact " + honest.slopeExact.toFixed(6) +
        ", errFrac " + honest.slopeErrFrac.toExponential(3) + ", R^2 " + honest.linearityR2.toFixed(6));
}

console.log("\n2. AND IT CAN NOW BE MADE TO FAIL");
{
    ok("!! *** GRAVITY AFTER THE PROJECTION BREAKS THE SLOPE -- A 2427x SEPARATION ***",
        planted.slopeErrFrac > honest.slopeErrFrac * 100,
        "slopeErrFrac " + honest.slopeErrFrac.toExponential(3) + " -> " + planted.slopeErrFrac.toExponential(3) +
        ". *** THE PROJECTION NEVER SEES THE GRAVITY. Same shape as v3790's MPM grid step ***");
    ok("!! *** AND R^2 STAYS AT 0.999997, SO LINEARITY IS NOT THE DISCRIMINATOR ***",
        planted.linearityR2 > 0.9999,
        "R^2 " + planted.linearityR2.toFixed(6) + ": the planted profile is still beautifully LINEAR and simply " +
        "has the WRONG SLOPE. A check on FIT QUALITY alone would pass this arm outright -- and the bind already " +
        "said so about a different defect, which is why the slope is the graded number");
    ok("!! the device DECLARES the plant, with `hydrostatic` first",
        DEVICE_NAMES.includes("flip2d") && flip2dDevice.plantMode === "forceslate" &&
        flip2dDevice.plantFlips === "slopeErrFrac" && FLIP2D_MODES[0] === "hydrostatic");
    ok("!! *** AND THE MODE VALIDATOR ADMITS THE PLANT, WHICH IT DID NOT AT FIRST ***",
        planted.slopeErrFrac > 1e-4,
        "*** WRITTEN AS `if (mode !== \"hydrostatic\") mode = \"hydrostatic\"` THE VALIDATOR SILENTLY REVERTED THE " +
        "PLANT AND BOTH ARMS READ AN IDENTICAL 6.584e-7 -- a plant firing at nothing because IT NEVER RAN. " +
        "Caught only because the two numbers matched to EVERY DIGIT. REACHABLE AND FINDABLE ARE TWO DIFFERENT " +
        "EDITS (v3766) ***");
}

report("*** THE PLANT IS STRONG AND THE BAR IS WEAK, AND THOSE READ IDENTICALLY IN A PASS/FAIL LINE ***",
    "The honest run sits at 6.584e-7 against a claim bar of 1e-3 -- FIFTEEN HUNDRED TIMES SLACKER THAN THE " +
    "MEASUREMENT SUPPORTS -- so this plant clears the bar by only 1.6x despite a 2427x separation from the " +
    "honest value. The bind had already measured a SECOND defect at 1.347e-3, 1.35x the bar, and called that " +
    "narrow. *** IT IS NOT THE PLANTS THAT ARE MARGINAL; IT IS THE BAR. NOT TIGHTENED HERE: the bar is a " +
    "SHIPPED CLAIM and moving it could redden configurations nobody in this sandbox can run. NAMED AS DEBT, " +
    "with the number that would justify the change already measured. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That flip2d is verified. The bind says it plainly: grading the HYDROSTATIC LIMIT does not grade the " +
    "SOLVER -- advection, the FLIP/PIC blend, the free surface and two-way coupling all remain ungraded, and a " +
    "fluid AT REST exercises the projection and the boundary conditions and nothing else. WHAT CHANGED TODAY " +
    "IS THAT THE ONE KEY IT DOES HAVE HAS NOW BEEN SHOWN TO FAIL.");

console.log("\nflip2dBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
