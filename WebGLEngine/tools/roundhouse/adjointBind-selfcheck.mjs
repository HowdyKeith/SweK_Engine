// tools/roundhouse/adjointBind-selfcheck.mjs -- v3768
//
// *** TIER 2, AND THE KEY IS AN IDENTITY RATHER THAN A MEASUREMENT: <A x, y> = <x, A^T y> for every x and y.
// A correct transpose satisfies it to round-off; anything else does not, and THE SIZE OF THE MISS IS A
// MEASUREMENT RATHER THAN A JUDGEMENT. No tolerance is argued for anywhere in this file. ***
//
// *** WHAT IS NEW HERE IS NOT THE FINDING BUT THE WIRING. adjoint.mjs has been fully measured since
// v3613-v3617 and NO DEVICE REACHED IT, so gradedCoverage counted it among the 136 ungraded and the roundhouse
// could not be graded on it at all. This device does not discover the mismatch; IT MAKES THE MISMATCH
// SOMETHING A GATE RE-DERIVES EVERY TIME rather than a number in a comment. ***

import { adjointDevice, ADJOINT_MODES, buildAdjoint } from "./adjointBind.mjs";
import { MEASURED_V3615 } from "../../physics/tomography/adjoint.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildAdjoint({ mode: "identity" });
const planted = await buildAdjoint({ mode: "rowmajor" });

console.log("1. THE IDENTITY IS EXACT, SO THE VERDICT IS A BINARY");
{
    ok("!! *** THE TRUE TRANSPOSE SATISFIES <Ax,y> = <x,A^T y> TO ROUND-OFF ***",
        honest.identityHolds === true && honest.controlDefect < 1e-9,
        "defect " + honest.controlDefect.toExponential(4) + " on a dense matrix of this size. NO TOLERANCE IS " +
        "ARGUED FOR: an identity either holds or the operator is not the transpose");
    ok("!! and it reproduces the v3615 record exactly",
        honest.controlErrFrac < 1e-3 && honest.shippedErrFrac < 1e-3,
        "control " + honest.controlDefect.toExponential(4) + " against a recorded " + MEASURED_V3615.control +
        ", shipped " + honest.shippedDefect.toFixed(3) + " against " + MEASURED_V3615.shipped +
        ". *** THE RECORD IS NOW RE-DERIVED RATHER THAN QUOTED -- which is the whole reason to wire a measured " +
        "module into a device ***");
}

console.log("\n2. THE SHIPPED PAIR IS NOT A TRANSPOSE, AND THAT IS A STRUCTURAL FACT");
{
    ok("!! *** backProject MISSES THE IDENTITY BY 27.5 -- TWENTY-SEVEN TIMES THE INNER PRODUCT ITSELF ***",
        honest.shippedDefect > 1 && honest.shippedDefect / honest.controlDefect > 1e12,
        honest.shippedDefect.toFixed(3) + " against the control's " + honest.controlDefect.toExponential(2) +
        ". *** 27.5 IS NOT 'A BIGGER ERROR', IT IS A DIFFERENT OPERATOR: radon GATHERS by sampling and " +
        "backProject SPLATS into the nearest bin with Math.round -- the classic unmatched pair ***");
    const f = await buildAdjoint({ mode: "scalar" });
    ok("!! and it is not a scalar multiple either -- the cheapest possible excuse, measured and refused",
        f.correlation < 0.95 && f.residualAfterScaling > 0.3,
        "over the fit the two correlate at " + f.correlation.toFixed(6) + " and the best scalar (" +
        f.bestScalar.toFixed(4) + ") STILL LEAVES " + (100 * f.residualAfterScaling).toFixed(1) + "%. " +
        "'It is A^T up to a constant' is the first thing anybody would say, and it is false");
}

console.log("\n3. THE PLANT -- THE SLIP THAT LEAVES EVERY OTHER CHECK HAPPY");
{
    ok("!! *** FLATTENING THE SINOGRAM d*na + a INSTEAD OF a*nDet + d BREAKS THE IDENTITY BY 1.8e3 ***",
        planted.controlDefect > 1e2 && planted.identityHolds === false,
        honest.controlDefect.toExponential(4) + " -> " + planted.controlDefect.toExponential(4) +
        ", identityHolds true -> false. *** THE CLASSIC ROW-MAJOR / COLUMN-MAJOR SLIP: THE SAME NUMBERS, " +
        "PERMUTED. The loop still covers every element exactly once, the array is still the right length, " +
        "nothing throws, and the result is STILL A LINEAR OPERATOR -- it is simply not the transpose, and only " +
        "the identity says so ***");
    ok("!! it is ONE-SIDED: the shipped operator's defect is untouched",
        planted.shippedDefect === honest.shippedDefect,
        "27.510 in both arms. The plant sits on the CONTROL, so the two numbers this device compares move " +
        "independently -- a plant that moved both would prove nothing (v3733)");
    ok("!! the default is CORRECT, so the option changes no existing caller",
        (await buildAdjoint({ mode: "identity" })).controlDefect === honest.controlDefect,
        "`rowMajorSlip` defaults to false and only this device's plant mode passes true");
    ok("!! the device is REGISTERED and DECLARES its plant, with `identity` first",
        DEVICE_NAMES.includes("adjoint") && adjointDevice.plantMode === "rowmajor" &&
        adjointDevice.plantFlips === "controlDefect" && ADJOINT_MODES[0] === "identity",
        "registered means gradedCoverage and plantedCoverage can both see it -- MAKING SOMETHING REACHABLE AND " +
        "MAKING IT FINDABLE ARE TWO DIFFERENT EDITS, learned three times in the Tier 1 arc");
}

report("WHAT THIS DOES NOT CLAIM",
    "That backProject should be replaced. THE TRUE ADJOINT IS A DENSE MATRIX -- fine at N=32 and hopeless at " +
    "the CT device's N=96 -- so it is AN INSTRUMENT FOR GRADING THE SHIPPED PAIR, NOT A SHIPPED OPERATOR, and " +
    "adjoint.mjs said so first. Nor does it re-open v3613's central result: seeded at either truth of the " +
    "ambiguous pair, b - Ax is EXACTLY ZERO, so the update is B(0) = 0 FOR ANY B WHATSOEVER -- that is a fact " +
    "about THE DATA and never depended on the adjoint.");

console.log("\nadjointBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
