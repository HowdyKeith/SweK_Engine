// tools/roundhouse/mpmPlasticBind-selfcheck.mjs -- v3792
//
// *** THE FOURTH AND LAST OF MPM'S BASIC PIECES. v3791 shipped a perfectly ELASTIC material and said outright
// that squeezing it makes it spring back FOR EVER -- exactly what snow and sand do not do. This is the return
// mapping that makes deformation PERMANENT past a threshold. ***
//
// *** TWO KEYS THAT DISAGREE ABOUT THE PLANT, WHICH IS WHY THE DEVICE EXISTS.
//   THE CLAMP IS A VERDICT and it is THE CHECK MOST PEOPLE WRITE.
//   THE SPLIT IS AN IDENTITY: F_e * F_p MUST STILL EQUAL THE TOTAL F. The multiplicative split is BOOKKEEPING,
//     NOT A PHYSICAL PROCESS -- moving deformation between factors cannot create or destroy any of it.
// Skipping the F_p update leaves THE CLAMP PERFECT -- singular values 0.975000 IN BOTH ARMS -- while the split
// drifts. A SNOWBALL SHRINKS WITH NO FORCE ACTING ON IT AND THE OBVIOUS CHECK SAYS EVERYTHING IS FINE. ***

import { mpmPlasticDevice, MPMPLASTIC_MODES, buildMpmPlastic } from "./mpmPlasticBind.mjs";
import { svd2, fromSvd, returnMap, splitDrift } from "../../physics/mpm/plasticity.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildMpmPlastic({ mode: "split" });
const planted = await buildMpmPlastic({ mode: "nofp" });
const svd = await buildMpmPlastic({ mode: "svd" });

console.log("1. THE DECOMPOSITION UNDERNEATH");
{
    ok("!! *** THE SVD REBUILDS THE ORIGINAL MATRIX TO ROUND-OFF ***",
        svd.svdResidual < 1e-12,
        "residual " + svd.svdResidual.toExponential(3) + ". *** THIS CHECK EXISTS BECAUSE MY FIRST VERSION " +
        "FAILED IT AT 1.808 ON A MATRIX WHOSE ENTRIES ARE ALL BELOW 1: svd2's half-angle construction returns " +
        "V ALREADY TRANSPOSED, and I wrote U S V^T by habit. Verified against the alternatives -- U S V gives " +
        "1.110e-16 while U S V^T and V S U^T both give 1.808 ***");
}

console.log("\n2. THE TWO KEYS, AND WHAT EACH CAN SEE");
{
    ok("!! the clamp is a VERDICT: every elastic singular value lands in range",
        honest.clampHolds === true && honest.clamped === true,
        "singulars [" + honest.singularMin.toFixed(6) + ", " + honest.singularMax.toFixed(6) + "] inside " +
        "[" + (1 - honest.thetaC).toFixed(4) + ", " + (1 + honest.thetaS).toFixed(4) + "]. BY CONSTRUCTION -- " +
        "a value outside means the clamp did not run at all");
    ok("!! *** AND THE SPLIT IS AN IDENTITY: F_e * F_p STILL EQUALS THE TOTAL F ***",
        honest.splitHolds === true && honest.splitDrift < 1e-9,
        "drift " + honest.splitDrift.toExponential(3) + ", volume change " + honest.volumeChange.toExponential(2) +
        ". THE SPLIT IS BOOKKEEPING, NOT A PHYSICAL PROCESS: moving deformation between the two factors cannot " +
        "create or destroy any of it");
    ok("!! *** THE PLANT BREAKS THE IDENTITY WHILE THE CLAMP STAYS PERFECT ***",
        planted.splitHolds === false && planted.splitDrift > 1e-3 && planted.clampHolds === true,
        "drift " + honest.splitDrift.toExponential(3) + " -> " + planted.splitDrift.toExponential(3) +
        ", and the singular values read [" + planted.singularMin.toFixed(6) + ", " +
        planted.singularMax.toFixed(6) + "] -- IDENTICAL TO THE HONEST ARM. *** THE VERDICT-STYLE CHECK, WHICH " +
        "IS THE ONE MOST PEOPLE WRITE, PASSES ON A MATERIAL THAT IS SILENTLY LOSING DEFORMATION ***");
    ok("!! the device DECLARES the plant, with `split` first",
        DEVICE_NAMES.includes("mpmplastic") && mpmPlasticDevice.plantMode === "nofp" &&
        mpmPlasticDevice.plantFlips === "splitDrift" && MPMPLASTIC_MODES[0] === "split");
}

console.log("\n3. WHAT THE SPLIT IDENTITY CANNOT SEE");
{
    // F_p is built as the inverse of the SAME U and V the clamp used, so they cancel: the identity holds for
    // ANY orthogonal pair, correct or not.
    ok("!! *** THE SPLIT IDENTITY IS BLIND TO A WRONG SVD, AND THAT IS WHY THE SVD IS CHECKED SEPARATELY ***",
        (() => { const r = returnMap([0.85, 0.05, -0.03, 0.92], [1, 0, 0, 1]);
                 return splitDrift(r.Fe, r.Fp, r.total) < 1e-9; })() && svd.svdResidual < 1e-12,
        "*** F_p IS BUILT FROM THE INVERSE OF THE SAME U AND V THE CLAMP USED, SO THEY CANCEL: " +
        "F_e * F_p = U Sc V * V^T Sc^-1 U^T * total = total FOR ANY ORTHOGONAL PAIR, RIGHT OR WRONG. " +
        "MEASURED WITH THE BROKEN SVD IN PLACE, THE SPLIT DRIFT WAS STILL 1.110e-16 -- the identity said the " +
        "code was fine while the decomposition under it was wrong by 1.808. A SELF-CONSISTENCY CHECK IS NOT A " +
        "SECOND ROUTE (v3765), a third time ***");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the plasticity is physically calibrated. thetaC and thetaS are the snow-like defaults from the " +
    "literature's shape, NOT measured against any material, and this device grades whether the RETURN MAPPING " +
    "IS SELF-CONSISTENT rather than whether snow behaves like this. Nor is the yield model general: a " +
    "singular-value clamp is not Drucker-Prager and does not model friction angle at all.");

report("AND WHAT MPM NOW HAS, HONESTLY",
    "FOUR PIECES, EACH GRADED ON IDENTITIES: the APIC transfer (v3789), the grid step (v3790), neo-Hookean " +
    "stress (v3791) and this return mapping. *** THAT IS NOT A RUNNING SIMULATION: nothing yet assembles them " +
    "into a step loop, computes grid forces from the stress, or draws anything. It is four correct pieces with " +
    "no assembly, and saying otherwise would be the overselling this arc has avoided at every step. ***");

console.log("\nmpmPlasticBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
