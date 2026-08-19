// tools/roundhouse/mpmDruckerBind-selfcheck.mjs -- v3799
//
// *** DRUCKER-PRAGER: THE MODEL THAT GIVES GRANULAR MATERIAL A FRICTION ANGLE. v3792's return mapping was a
// SINGULAR-VALUE CLAMP with no friction in it, which is why v3797 had to say a pile with the wrong angle of
// repose would pass every check. ***
//
// *** I INTENDED TO GRADE THE PILE ANGLE AGAINST physics/mechanics/contactKeys.mjs, WHICH ADJUDICATES
// FRICTION AGAINST THE REAL box3d -- AND frictionRestitutionAvailable() READS FALSE HERE, because box3d WASM
// does not build in this sandbox. RATHER THAN INVENT A REFERENCE, the keys come from the yield surface
// itself, where they are exact. THE PILE ANGLE REMAINS UNGRADED AND IS SAID SO BELOW. ***

import { druckerDevice, DP_MODES, buildDrucker } from "./mpmDruckerBind.mjs";
import { alphaOf, yieldOf, dpReturn } from "../../physics/mpm/druckerPrager.mjs";
import { svd2 } from "../../physics/mpm/plasticity.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { frictionRestitutionAvailable } from "../../physics/mechanics/contactKeys.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const angle = await buildDrucker({ mode: "angle" });
const deaf = await buildDrucker({ mode: "deafangle" });
const surface = await buildDrucker({ mode: "surface" });
const tension = await buildDrucker({ mode: "tension" });

console.log("1. THE SURFACE, WHERE THE KEYS ARE EXACT");
{
    ok("!! *** INSIDE THE SURFACE THE RETURN MAPPING IS THE IDENTITY ***",
        surface.elasticUntouched === true,
        "a compressed-but-unyielded state comes back with THE SAME NUMBERS -- element by element, not within a " +
        "tolerance. Below yield the material is elastic and the mapping must change NOTHING");
    ok("!! *** OUTSIDE IT, THE PROJECTION LANDS THE YIELD FUNCTION AT ZERO ***",
        surface.landsOnSurface === true && Math.abs(surface.yieldAfter) < 1e-12,
        "f after return " + surface.yieldAfter.toExponential(3) + ". THE POINT OF A RETURN MAPPING IS TO LAND " +
        "ON the surface, not near it");
    ok("!! *** AND COHESIONLESS MATERIAL CANNOT PULL -- TENSION GOES TO THE APEX ***",
        tension.apexCase === "apex" && tension.landsOnSurface === true,
        "hydrostatic expansion returns to zero elastic strain: the material has SEPARATED. *** SAND HAS NO " +
        "TENSILE STRENGTH, and a model that lets it hang together under tension is modelling ROCK ***");
}

console.log("2. THE FRICTION ANGLE MUST REACH THE SURFACE");
{
    ok("!! *** A 40-DEGREE MATERIAL CARRIES 2.12x THE SHEAR OF A 20-DEGREE ONE ***",
        angle.angleMatters === true && angle.shearSpread > 1.5,
        "max elastic shear " + angle.shearAt20.toFixed(6) + " at 20 degrees against " +
        angle.shearAt40.toFixed(6) + " at 40, spread " + angle.shearSpread.toFixed(4) +
        ". THAT RATIO IS WHAT A FRICTION ANGLE IS FOR");
    ok("!! *** THE PLANT MAKES EVERY ANGLE IDENTICAL -- SPREAD EXACTLY 1.0000 ***",
        deaf.angleMatters === false && Math.abs(deaf.shearSpread - 1) < 1e-12,
        "spread " + angle.shearSpread.toFixed(4) + " -> " + deaf.shearSpread.toFixed(4) + ". *** THE ANGLE " +
        "REACHES THE API AND NOT THE YIELD SURFACE: every run completes, every number is finite, the surface " +
        "still projects correctly -- AND THE MATERIAL STOPS CARING WHAT KIND OF SAND IT IS. This tree's " +
        "deaf-knob shape (v3783 planted one, v3790 shipped one by accident) in a constitutive setting ***");
    ok("!! the device DECLARES the plant, with `angle` first",
        DEVICE_NAMES.includes("mpmdrucker") && druckerDevice.plantMode === "deafangle" &&
        druckerDevice.plantFlips === "shearSpread" && DP_MODES[0] === "angle");
}

console.log("3. TWO FIXTURE ERRORS THIS ROUND MADE, KEPT AS CHECKS");
{
    // *** A PURE SHEAR IS NOT EXPANSION. ***
    const par = { ...lame(500, 0.3), alpha: alphaOf(30) };
    const p2 = { mu: par.mu, lambda: par.lambda, alpha: par.alpha };
    const shear = dpReturn([1, 0.35, 0, 1], [1, 0, 0, 1], p2);
    ok("!! *** A VOLUME-PRESERVING SHEAR YIELDS RATHER THAN SEPARATING ***",
        shear.case === "yielded",
        "*** WRITTEN AS A STRICT `trace > 0` THE EXPANSION TEST SENT IT TO THE APEX: [1, 0.35; 0, 1] has " +
        "DETERMINANT 1, so the log-strain trace is ZERO -- and floating point made it a hair positive. " +
        "CALLING THAT SEPARATION WOULD HAVE MADE EVERY SHEARING PARTICLE DETACH. The tolerance is scaled by " +
        "the deviator, so it means 'negligible volume change relative to the shear being done' ***");
    // *** AND ZERO PRESSURE MEANS ZERO STRENGTH. ***
    const zeroP = yieldOf(svd2([1, 0.02, 0, 1]).S, p2);
    ok("!! *** AT ZERO CONFINING PRESSURE THE MATERIAL CARRIES NO SHEAR AT ALL ***",
        zeroP.f > 0,
        "any shear on an unconfined cohesionless material is already outside the surface (f " +
        zeroP.f.toExponential(3) + "). *** MEASURED ON A PURE SHEAR, BOTH FRICTION ANGLES RETURNED 0.000000 " +
        "AND THE ANGLE APPEARED NOT TO MATTER. IT WAS THE FIXTURE: dry sand on a table has no strength until " +
        "something presses on it, so the shear test is run UNDER COMPRESSION ***");
}

report("*** WHAT IS STILL NOT GRADED, AND IT IS THE THING THIS MODEL WAS BUILT FOR ***",
    "THE ANGLE OF REPOSE. physics/mechanics/contactKeys.mjs adjudicates friction against the REAL box3d and " +
    "would be the independent reference -- frictionRestitutionAvailable() reads " +
    String(frictionRestitutionAvailable()) + " HERE, because box3d WASM does not build in this sandbox. " +
    "*** SO THE SURFACE IS GRADED AND THE PILE IS NOT. A heap at the wrong angle would still pass every check " +
    "in this file, exactly as v3797 warned -- WHAT HAS CHANGED IS THAT THE MODEL NOW HAS AN ANGLE TO BE WRONG " +
    "ABOUT, WHERE THE SINGULAR-VALUE CLAMP HAD NONE. That is a step, not the answer. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That the constants are right. The Drucker-Prager alpha here is the standard Mohr-Coulomb fit, and the " +
    "2D plane-strain form of it -- NOT calibrated against any measured sand. Nor is the return mapping wired " +
    "into the step loop: v3792's singular-value clamp is still what physics/mpm/step.mjs calls, and SWAPPING " +
    "IT IS ITS OWN ROUND with its own effect on every number the column device reports.");

console.log("\nmpmDruckerBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
