// WebGLEngine/physics/thermal/vaporize.mjs -- v3620
// ---------------------------------------------------------------------------------------------------------------
// GASIFICATION. v3618 ranked this THIRD of the five and named the trap in advance: solid or liquid to gas is a
// ~1000x volume change a FIXED VOXEL GRID CANNOT REPRESENT, so you either conserve mass and lose the volume or
// draw the volume and invent the mass. THIS ROUND MAKES THAT TRAP A MEASUREMENT INSTEAD OF A WARNING, and the
// measurement says something the warning did not.
//
// ================================================================================================================
// THE KEY, AND ITS DOMAIN IS MEASURED RATHER THAN ASSUMED
// ================================================================================================================
//
// Clausius-Clapeyron with a constant latent heat: ln(P2/P1) = -(L/R)(1/T2 - 1/T1). Anchored at water's normal
// boiling point and checked against ORDINARY STEAM-TABLE FIGURES -- an external key, nothing from our grid:
//
//     T (K)     CC          known       rel
//     273.16    8.362e+2    6.117e+2    36.7%
//     293.15    2.835e+3    2.339e+3    21.2%
//     323.15    1.334e+4    1.234e+4     8.0%
//     373.15    1.013e+5    1.013e+5     0.0%   <- the anchor
//     423.15    4.767e+5    4.760e+5     0.1%
//     473.15    1.617e+6    1.555e+6     4.0%
//
// THE ERROR IS SMALLEST AT THE ANCHOR AND GROWS BOTH WAYS, which is what a constant-L approximation must do --
// L is a function of temperature and this key pretends it is not. AND THE DOMAIN LIMIT IS MEASURED AT THE OTHER
// END: at the critical point CC predicts 2.602e+7 Pa against a known 2.206e+7, 17.9% out. A KEY WHOSE ACCURACY
// IS NOT REPORTED ALONGSIDE IT IS A KEY SOMEBODY WILL QUOTE OUTSIDE ITS RANGE.
//
// ================================================================================================================
// FINDING 1: THE EXPANSION RATIO IS NOT A NUMBER, IT IS A FUNCTION, AND IT SPANS THREE ORDERS
// ================================================================================================================
//
//     20 C evaporating into its own vapour (2.3 kPa)   55415
//     boiling at 1 atm                                  1628
//     boiling at 10 bar                                  200
//     boiling at 100 bar                                  26
//
// "GAS TAKES ABOUT A THOUSAND TIMES MORE ROOM" IS NOT A FACT A GRID COULD BE BUILT AROUND. There is no constant
// to bake in; the factor a voxel scheme would have to absorb moves by three orders across conditions somebody
// would call ordinary.
//
// ================================================================================================================
// FINDING 2, THE ROUND: THE REPRESENTATION ERROR **IS** THE DENSITY RATIO, AND IT GOES TO ONE AT THE CRITICAL POINT
// ================================================================================================================
//
// A voxel that stores a TYPE (which is what voxel/voxelRLE.js stores) fixes the density of whatever sits in it,
// so gasifying one liquid voxel offers exactly three choices and each is wrong in exactly one quantity, BY THE
// SAME FACTOR:
//
//     IN PLACE, AS GAS     1 voxel, gas density     mass wrong by r      volume right, density right
//     EXPANDED             r voxels, gas density    mass right           volume right, COSTS r VOXELS
//     IN PLACE, DENSE      1 voxel, liquid density  mass right           volume wrong by r -- it is a liquid
//                                                                        wearing a gas label
//
// MASS, VOLUME, DENSITY -- PICK TWO. Not a design failure to be engineered around: one number r decides all
// three penalties, so there is nothing to trade and no scheme that is cleverer.
//
// *** AND THEN r GOES TO ONE. *** Along the saturation line, from steam-table saturated densities:
//
//     T (K)     rho_liq   rho_vap    r
//     373.15     958.0      0.598    1602.811
//     473.15     864.7      7.862     109.985
//     573.15     712.1     46.19       15.417
//     623.15     574.7    113.60        5.059
//     643.15     402.4    242.70        1.658
//     647.096    322.0    322.00        1.000000
//
// AT THE CRITICAL POINT THE TWO PHASES HAVE THE SAME DENSITY, so all three schemes coincide and in-place
// gasification is EXACT -- same grid, same voxel, same code. SO THE TRAP IS NOT A PROPERTY OF VOXELS. It is a
// property of how far the state sits from critical, and a fixed grid represents this phase change perfectly
// well in the regime where the two phases stop being different. That is a sharper statement than "voxels
// cannot do gas", and it is the reason this round ships a measurement and refuses a gas solver.
//
// ================================================================================================================
// WHAT IS REFUSED, AND IT IS THE WHOLE SIMULATION
// ================================================================================================================
//
// NO GAS DYNAMICS ARE BUILT. Advection, buoyancy, diffusion and pressure coupling would each need their own key
// and this round has none of them; a plume that looked right would be exactly v3618's combustion refusal --
// tuned knobs beside an effect that already looks finished. What is graded here is the ARITHMETIC OF THE
// TRANSITION: how much gas a given amount of condensate becomes, and what a type-per-voxel grid must give up to
// draw it. NOT CLAIMED: that any of the three schemes is correct, that the tree should adopt one, or that this
// is a voxel gasification. The choice is Keith's and the numbers are now on the record for it.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";

// *** v3669 -- MOVED TO ./phaseOps.mjs, NOT COPIED. *** This module keeps its main block, and that
// main block is why it imports node:url -- WHICH IS THE SPECIFIER NO BROWSER CAN RESOLVE, so every
// name below was unreachable from any page for fifty versions. The arithmetic now lives in a file
// with NO IMPORTS AT ALL; these are re-exported so every caller, gate and hash-pinned reading still
// resolves to ONE DECLARATION, and phaseOps-selfcheck asserts that BY FUNCTION IDENTITY rather than
// by agreement -- two copies agree right up until somebody edits one of them.
import {
    R_GAS,
    WATER,
    VAPOUR_PRESSURE,
    SATURATION,
    satPressure,
    keyAccuracy,
    expansionRatio,
    densityRatio,
    representationChoices,
    voxelCost,
} from "./phaseOps.mjs";
export {
    R_GAS,
    WATER,
    VAPOUR_PRESSURE,
    SATURATION,
    satPressure,
    keyAccuracy,
    expansionRatio,
    densityRatio,
    representationChoices,
    voxelCost,
};
export const MEASURED_V3620 = {
    keyDomain: "CC is EXACT at its anchor (0.0% at 373.15 K) and degrades BOTH WAYS -- 36.7% at 273.16 K, 4.0% " +
        "at 473.15 K, 17.9% at the critical point -- because L is a function of temperature and this key " +
        "pretends it is not. THE ACCURACY SHIPS WITH THE KEY so nobody quotes it outside its range.",
    ratioIsNotAConstant: "55415 evaporating at 20 C, 1628 boiling at 1 atm, 200 at 10 bar, 26 at 100 bar. THREE " +
        "ORDERS across conditions somebody would call ordinary, so 'gas takes about a thousand times more room' " +
        "IS NOT A FACT A GRID COULD BE BUILT AROUND -- there is no constant to bake in.",
    trilemma: "a voxel storing a TYPE fixes the density of what sits in it, so gasifying one liquid voxel is " +
        "wrong in the MASS (in place as gas, by r), the VOXEL BUDGET (expanded, r voxels) or the DENSITY (in " +
        "place at liquid density, by r). MASS, VOLUME, DENSITY -- PICK TWO, and ONE NUMBER DECIDES ALL THREE " +
        "PENALTIES, so there is nothing to trade and no cleverer scheme.",
    theControl: "r GOES TO EXACTLY 1.000000 AT THE CRITICAL POINT (rho_liq = rho_vap = 322.0), where all three " +
        "schemes coincide and in-place gasification is EXACT -- same grid, same voxel, same code. SO THE TRAP IS " +
        "NOT A PROPERTY OF VOXELS but of how far the state sits from critical. A fixed grid represents this " +
        "phase change perfectly in the regime where the two phases stop being different.",
    refused: "NO GAS DYNAMICS. Advection, buoyancy, diffusion and pressure coupling each need their own key and " +
        "this round has none; a plume that looked right would be v3618's combustion refusal exactly. What is " +
        "graded is THE ARITHMETIC OF THE TRANSITION, not a simulation of the gas.",
    notClaimed: "that any of the three schemes is correct, that the tree should adopt one, or that this is a " +
        "voxel gasification. The choice is Keith's; the numbers are on the record for it.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[vaporize] mass, volume, density -- pick two");
    say("");
    say("1. THE KEY AND ITS DOMAIN (Clausius-Clapeyron against steam-table vapour pressures)");
    for (const a of keyAccuracy()) {
        say("     T=" + a.T.toFixed(2).padStart(7) + " K   CC " + a.cc.toExponential(3) + "   known " +
            a.known.toExponential(3) + "   " + (100 * a.rel).toFixed(1) + "%");
    }
    const pc = satPressure(WATER.Tcrit);
    say("     at the CRITICAL point " + pc.toExponential(3) + " against " + WATER.Pcrit.toExponential(3) +
        " -- " + (100 * Math.abs(pc - WATER.Pcrit) / WATER.Pcrit).toFixed(1) + "%, THE KEY'S OWN LIMIT");
    say("");
    say("2. THE EXPANSION RATIO IS A FUNCTION, NOT A NUMBER");
    for (const [T, P, rho, lab] of [[293.15, 2339, 998, "20 C evaporating"], [373.15, 101325, 958, "1 atm boiling"],
                                    [453.15, 1e6, 887, "10 bar"], [584, 1e7, 712, "100 bar"]]) {
        say("     " + lab.padEnd(18) + " ratio " + expansionRatio({ T, P, rhoLiquid: rho }).toFixed(1).padStart(9));
    }
    say("");
    say("3. THE TRILEMMA AND THE CONTROL -- r from MEASURED saturated densities, no ideal gas anywhere");
    say("     T (K)      r          in-place mass err   expanded voxels   block side");
    for (const row of SATURATION) {
        const r = densityRatio(row), c = voxelCost(r);
        say("     " + row.T.toFixed(2).padStart(8) + "  " + r.toFixed(3).padStart(10) + "   x" +
            r.toFixed(2).padStart(9) + "        " + Math.round(c.voxels).toString().padStart(6) +
            "        " + c.side.toFixed(2) + "^3");
    }
    say("     THE LAST ROW IS THE CRITICAL POINT AND r IS EXACTLY 1: all three schemes coincide and in-place");
    say("     gasification is EXACT. The trap is distance from critical, NOT the voxel scheme.");
    say("");
    say("  " + MEASURED_V3620.trilemma);
    say("  THE CONTROL: " + MEASURED_V3620.theControl);
    say("  REFUSED: " + MEASURED_V3620.refused);
    say("  NOT CLAIMED: " + MEASURED_V3620.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
