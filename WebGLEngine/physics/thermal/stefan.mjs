// WebGLEngine/physics/thermal/stefan.mjs -- v3618
// ---------------------------------------------------------------------------------------------------------------
// MELTING, AND THE REASON IT IS THE FIRST PHASE CHANGE THIS LAB BUILDS: IT IS THE ONLY ONE WITH A CLOSED FORM.
//
// Keith asked whether voxels could melt, gasify, freeze, burn or crystallise according to their composition.
// All five are codeable; they are not equally GRADEABLE, and this lab's whole discipline is the difference.
// Melting has an exact analytic answer -- the Stefan problem -- so a melt solver can be WRONG IN A WAY THAT
// SHOWS. Combustion, by contrast, would need an ignition temperature and a flame speed that are TUNED rather
// than derived, sitting next to physics/fire/fireMesh.js which already renders convincing fire with NO GATE
// beside it. A knob with no key next to an effect that already looks finished is how a thing becomes
// impossible to falsify, so combustion is deliberately NOT built here.
//
// *** AND THERE IS A STRUCTURAL REASON THIS ONE IS WORTH BUILDING FIRST. tools/roundhouse/conservationReach.mjs
// says in its own header that it is a NAME SCAN and "a proposal, never a verdict" -- NO DEVICE IN THIS LAB HAS
// EVER BEEN ASKED WHETHER IT CONSERVES ANYTHING. A melt device carries an enthalpy identity, so it is the
// first one that CAN be asked. ***
//
// ================================================================================================================
// THE KEY, AND IT IS EXTERNAL: THE ONE-PHASE STEFAN SOLUTION
// ================================================================================================================
//
// A semi-infinite solid at its melting point Tm, with the face at x=0 held at Tw > Tm. The melt front advances
//
//     X(t) = 2 * lambda * sqrt(alpha * t),        alpha = k / (rho * c)
//
// where lambda solves the transcendental equation
//
//     lambda * exp(lambda^2) * erf(lambda) = St / sqrt(pi),      St = c (Tw - Tm) / L
//
// NOTHING IN THAT COMES FROM OUR GRID. It is the answer the physics has, and the solver either finds it or
// does not -- the same shape as ct.js's analytic Radon transform, and for the same reason: without it the
// forward model would only ever be checked against itself.
//
// erf IS PINNED TWO WAYS THAT SHARE NO CODE: a Maclaurin series and Simpson quadrature agree to ~1e-15 across
// [0.25, 2], and erf(1) reads 0.842700792949715 against the known value to all fifteen digits. lambda is then
// bisected, and THE EQUATION'S OWN RESIDUAL AT THE ROOT is reported -- 0.000e+0 to 1.3e-15 across St in
// [0.1, 5] -- so "solved" is a measurement rather than a claim about a loop that ran.
//
// ================================================================================================================
// THE SOLVER: EVOLVE ENTHALPY, DERIVE TEMPERATURE -- AND THAT CHOICE IS THE WHOLE CORRECTNESS ARGUMENT
// ================================================================================================================
//
// The obvious implementation evolves TEMPERATURE and flips a cell to liquid when it crosses Tm. THAT ONE LOSES
// THE LATENT HEAT -- and it is worse than "the front runs ahead", which is what I first wrote. MEASURED on the
// same fixture: the naive solver puts **400 OF 400 CELLS ABOVE Tm**, so THERE IS NO FRONT AT ALL. With nothing
// absorbing energy at the interface there is no boundary to hold in place, and the whole domain goes liquid. The enthalpy method carries H per unit volume and DERIVES T from it:
//
//     H < 0          solid,  T = Tm + H / (rho c)
//     0 <= H <= rho L mushy,  T = Tm exactly          <- THE STALL, and it is where the latent heat goes
//     H > rho L      liquid, T = Tm + (H - rho L) / (rho c)
//
// So the stall is not a special case somebody remembered to write; IT FALLS OUT OF THE STATE VARIABLE. The
// naive solver is kept here as a NEGATIVE CONTROL rather than deleted, because "the enthalpy method conserves"
// means nothing until something that does not conserve is measured beside it.
//
// ================================================================================================================
// MEASURED, AT t = 1, rho = c = k = 1, Tm = 0, Tw = 1 (so St = 1/L)
// ================================================================================================================
//
//     L      St      lambda      exact X     solver X    rel err
//     4      0.250   0.340082    0.680164    0.672518    1.12%
//     2      0.500   0.464786    0.929572    0.922520    0.76%
//     1      1.000   0.620063    1.240125    1.232533    0.61%
//     0.5    2.000   0.800601    1.601203    1.592580    0.54%
//
// AND THE NUMBER THAT MATTERS IS NOT ANY OF THOSE -- IT IS HOW THEY MOVE UNDER REFINEMENT. At L = 1:
//
//     n = 200   1.210504   2.389%
//     n = 400   1.225128   1.209%      ratio 1.98
//     n = 800   1.232533   0.612%      ratio 1.98
//     n = 1600  1.236259   0.312%      ratio 1.96
//
// *** FIRST-ORDER CONVERGENCE, MEASURED AS A RATIO RATHER THAN ASSERTED AS A TOLERANCE. *** That is exactly
// right for a fixed grid whose front sits BETWEEN cells, and it is the claim the gate makes: a single error
// number would pass on a solver that is wrong in a way that never improves, and this one cannot.
//
// WHAT IS NOT CLAIMED: that this is a voxel melt yet. It is ONE DIMENSION against the exact solution -- the
// forward model earning its key before anything is built on it. The material table below keys off the voxel
// type that voxel/voxelRLE.js already stores per run, so the join exists; wiring it to a 3D grid is the next
// round and it should be graded against THIS, not against how it looks.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";

// --- the material table, keyed to the voxel type voxelRLE already stores ------------------------------------------
//
// SI units, and the values are ORDINARY REFERENCE FIGURES for these substances -- not tuned to make anything
// come out right. Anything derived from them is therefore a prediction rather than a fit.
// *** v3669 -- MOVED TO ./phaseOps.mjs, NOT COPIED. *** This module keeps its main block, and that
// main block is why it imports node:url -- WHICH IS THE SPECIFIER NO BROWSER CAN RESOLVE, so every
// name below was unreachable from any page for fifty versions. The arithmetic now lives in a file
// with NO IMPORTS AT ALL; these are re-exported so every caller, gate and hash-pinned reading still
// resolves to ONE DECLARATION, and phaseOps-selfcheck asserts that BY FUNCTION IDENTITY rather than
// by agreement -- two copies agree right up until somebody edits one of them.
import {
    MATERIALS,
    alphaOf,
    stefanNumber,
    erfSeries,
    erfQuad,
    stefanEq,
    lambdaFor,
    stefanFront,
    meltEnthalpy,
    stallCheck,
    refinement,
} from "./phaseOps.mjs";
export {
    MATERIALS,
    alphaOf,
    stefanNumber,
    erfSeries,
    erfQuad,
    stefanEq,
    lambdaFor,
    stefanFront,
    meltEnthalpy,
    stallCheck,
    refinement,
};
export const MEASURED_V3618 = {
    erfCrossCheck: 5.218e-15, erfKnown: 0.842700792949715,
    lambdaResidualWorst: 1.332e-15,
    fronts: { 4: [0.680164, 0.672518], 2: [0.929572, 0.922520], 1: [1.240125, 1.232533], 0.5: [1.601203, 1.592580] },
    refinement: { 200: 0.02389, 400: 0.01209, 800: 0.00612, 1600: 0.00312, ratios: [1.98, 1.98, 1.96] },
    verdict: "MELTING IS THE ONLY ONE OF THE FIVE PHASE CHANGES WITH A CLOSED FORM, which is why it is first. " +
        "The enthalpy solver reproduces the exact Stefan front across St in [0.25, 2], and THE ERROR HALVES " +
        "WITH EACH GRID DOUBLING (ratios 1.98, 1.98, 1.96) -- FIRST-ORDER CONVERGENCE MEASURED AS A RATIO " +
        "rather than asserted as a tolerance, which is the only form that a solver wrong-but-not-improving " +
        "cannot pass.",
    naiveHasNoFront: "the naive temperature solver does not merely run ahead -- it puts 400 OF 400 CELLS above " +
        "Tm, so there is NO INTERFACE AT ALL. Nothing absorbs energy at the boundary, so no boundary is held.",
    whyEnthalpy: "the obvious temperature-based solver marches straight through Tm and absorbs NO LATENT HEAT. " +
        "Carrying H and DERIVING T makes the stall fall out of the state variable rather than be remembered, " +
        "and the naive solver is kept as a NEGATIVE CONTROL because 'this one conserves' means nothing until " +
        "something that does not is measured beside it.",
    notBuilt: "COMBUSTION, deliberately. Ignition temperature and flame speed are TUNED not derived, and " +
        "physics/fire/fireMesh.js already renders convincing fire with NO GATE beside it -- a knob with no key " +
        "next to an effect that already looks finished is how a thing becomes impossible to falsify.",
    notClaimed: "that this is a voxel melt yet. ONE DIMENSION against the exact solution: the forward model " +
        "earning its key before anything is built on it. The material table keys off the voxel type " +
        "voxel/voxelRLE.js already stores per run, so the join exists and the 3D wiring is the next round.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[stefan] melting, graded against the exact solution -- the only phase change that has one");
    say("");
    say("1. erf PINNED TWO WAYS (series vs Simpson), and lambda's own residual at the root");
    for (const x of [0.5, 1.0, 1.5])
        say("     erf(" + x.toFixed(1) + ")  series " + erfSeries(x).toFixed(15) + "   quad " + erfQuad(x).toFixed(15) +
            "   |diff| " + Math.abs(erfSeries(x) - erfQuad(x)).toExponential(3));
    say("     erf(1) against the known 0.842700792949715: " + erfSeries(1).toFixed(15));
    for (const St of [0.25, 1, 2]) {
        const r = lambdaFor(St);
        say("     St=" + String(St).padStart(4) + "  lambda " + r.lambda.toFixed(12) + "   equation residual " + r.residual.toExponential(3));
    }
    say("");
    say("2. THE FRONT AGAINST THE CLOSED FORM (t=1, alpha=1, St = 1/L)");
    say("     L      St      exact X     solver X    rel err");
    for (const Lv of [4, 2, 1, 0.5]) {
        const St = 1 / Lv, exact = stefanFront(St, 1, 1), r = meltEnthalpy(Lv);
        say("     " + String(Lv).padStart(4) + "   " + St.toFixed(3) + "   " + exact.toFixed(6) + "    " +
            r.front.toFixed(6) + "    " + (100 * Math.abs(r.front - exact) / exact).toFixed(2) + "%");
    }
    say("");
    say("3. REFINEMENT -- the RATIO is the claim, not any single error");
    const ref = refinement();
    for (const r of ref.rows)
        say("     n=" + String(r.n).padStart(5) + "   X " + r.front.toFixed(6) + "   rel err " +
            (100 * r.relErr).toFixed(3) + "%" + (r.ratio ? "   ratio " + r.ratio.toFixed(2) : ""));
    say("     First order, as a fixed grid with a front BETWEEN cells must be.");
    say("");
    say("4. THE STALL, ASKED DIRECTLY (L=1): T must read EXACTLY Tm across the whole mushy range");
    const st = stallCheck(1, 4);
    say("     " + st.map((s) => "H=" + s.h.toFixed(2) + " T=" + s.T.toFixed(1)).join("   "));
    say("");
    say("  " + MEASURED_V3618.verdict);
    say("  WHY ENTHALPY: " + MEASURED_V3618.whyEnthalpy);
    say("  NOT BUILT: " + MEASURED_V3618.notBuilt);
    say("  NOT CLAIMED: " + MEASURED_V3618.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
