// tools/roundhouse/mpmStressBind-selfcheck.mjs -- v3791
//
// *** THE THIRD OF MPM'S FOUR PIECES: THE CONSTITUTIVE MODEL, which is what makes material RESIST deformation.
// v3789 built the transfer and v3790 the grid step, and both said plainly that a block would simply fall
// because nothing produced stress. STILL NO PLASTICITY: this material is perfectly elastic and springs back
// for ever, which is the next round. ***
//
// *** AND THE FINDING IS ABOUT FIXTURES RATHER THAN ABOUT THE MODEL. The plant writes P*F instead of P*F^T --
// the slip the formula invites, since P and F are the same shape and both products are defined -- and WHETHER
// IT CAN BE SEEN AT ALL DEPENDS ENTIRELY ON THE DEFORMATION CHOSEN. THE TWO FIXTURES ANYBODY REACHES FOR
// FIRST ARE THE TWO THAT CANNOT SEE IT PROPERLY. ***

import { mpmStressDevice, MPMSTRESS_MODES, buildMpmStress } from "./mpmStressBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildMpmStress({ mode: "symmetry" });
const planted = await buildMpmStress({ mode: "transposed" });
const rest = await buildMpmStress({ mode: "rest" });
const dil = await buildMpmStress({ mode: "dilation" });
const blind = await buildMpmStress({ mode: "blindfixtures" });

console.log("1. THE ANALYTIC STRESSES");
{
    ok("!! *** UNDEFORMED MEANS UNSTRESSED -- EXACTLY ZERO, NOT NEARLY ***",
        rest.restHolds === true && rest.restStressMax === 0,
        "max |sigma| " + rest.restStressMax + " at F = I. *** === 0, NOT < 1e-12: a model that puts stress in " +
        "undisturbed material is broken, and this is the cheapest test that finds it ***");
    ok("!! pure dilation is isotropic: shears exactly zero, normals exactly equal",
        dil.dilationHolds === true && dil.dilationShearMax === 0 && dil.dilationNormalsEqual === true,
        "J " + dil.J.toFixed(4) + ", shear components " + dil.dilationShearMax + ", normals equal " +
        dil.dilationNormalsEqual + ". BOTH ARE VERDICTS -- squeezing a block uniformly cannot produce shear, " +
        "and the two axes cannot disagree");
    ok("!! *** THE CAUCHY STRESS IS SYMMETRIC ON A COMPOSED DEFORMATION ***",
        honest.symmetryHolds === true && honest.asymmetry < 1e-9,
        "asymmetry " + honest.asymmetry.toExponential(2) + ". SYMMETRY IS ANGULAR MOMENTUM BALANCE EXPRESSED " +
        "POINTWISE -- not a numerical nicety but the same conservation law v3789 graded on the transfer, one " +
        "level down");
}

console.log("\n2. THE PLANT, AND THE FIXTURES THAT CANNOT SEE IT");
{
    ok("!! *** WRITING P*F INSTEAD OF P*F^T BREAKS SYMMETRY BY 72.6 ***",
        planted.symmetryHolds === false && planted.asymmetry > 1,
        "asymmetry " + honest.asymmetry.toExponential(2) + " -> " + planted.asymmetry.toFixed(3) +
        " on a stretch composed with a shear");
    ok("!! *** BUT ON PURE DILATION THE PLANT IS COMPLETELY INVISIBLE -- 0.0000 ***",
        blind.dilationPlantDelta === 0,
        "max |sigma difference| " + blind.dilationPlantDelta.toFixed(4) + ". *** A DIAGONAL F IS ITS OWN " +
        "TRANSPOSE, so P*F and P*F^T ARE THE SAME PRODUCT. DILATION IS THE STANDARD SANITY CHECK FOR A " +
        "CONSTITUTIVE MODEL AND IT CANNOT SEE THIS BUG AT ALL -- not weakly, NOT AT ALL ***");
    ok("!! *** AND ON PURE SHEAR THE STRESS MOVES BUT SYMMETRY SURVIVES ***",
        blind.shearPlantDelta > 1 && blind.shearAsymmetry === 0,
        "the stress moves by " + blind.shearPlantDelta.toFixed(4) + " while asymmetry stays at " +
        blind.shearAsymmetry + ". *** THE PLANT MERELY SWAPS THE DIAGONAL: sigma_xx and sigma_yy land on the " +
        "WRONG AXES and a symmetry check passes anyway. A SECOND OBVIOUS FIXTURE, AND IT IS BLIND TO THE KEY " +
        "IT LOOKS LIKE IT SHOULD CATCH ***");
    ok("!! the device DECLARES the plant, with `symmetry` first",
        DEVICE_NAMES.includes("mpmstress") && mpmStressDevice.plantMode === "transposed" &&
        mpmStressDevice.plantFlips === "asymmetry" && MPMSTRESS_MODES[0] === "symmetry");
}

report("*** A KEY IS ONLY AS GOOD AS THE STATE IT IS EVALUATED IN ***",
    "v3763 learned this from one side -- a key evaluated only where its parameter is ZERO is blind, which is " +
    "why kerrladder's ISCO key had to sweep the spin. THIS IS THE SAME LESSON FROM THE OTHER SIDE: the key " +
    "here (symmetry) is sound, and TWO OF THE THREE OBVIOUS FIXTURES CANNOT EXERCISE IT. Had this device been " +
    "built with dilation as its deformation -- the natural first choice, and the one every textbook checks " +
    "first -- IT WOULD HAVE SHIPPED A PLANT THAT MOVES NOTHING AND CALLED THE MODEL VERIFIED.");

report("WHAT THIS DOES NOT CLAIM",
    "That the material behaves correctly under motion. This grades STRESS FOR A GIVEN DEFORMATION GRADIENT, " +
    "not the F update, not the force it becomes on the grid, and not stability. Nor is neo-Hookean claimed to " +
    "be the right model for anything in particular -- it is the one whose closed forms are checkable, which is " +
    "why it went first. AND THERE IS NO PLASTICITY: squeeze this material and it springs back for ever, which " +
    "is exactly what snow and sand do not do.");

console.log("\nmpmStressBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
