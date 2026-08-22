// physics/xpbd/muscleKey-selfcheck.mjs
//
// v3463 -- A MUSCLE BULGES BECAUSE IT CANNOT COMPRESS. Sixth of fifteen ungraded xpbd modules.
//
// muscleVolume.js composes a volume constraint with fibre contraction, and its header says the belly bulges
// "because the volume constraint will not let the enclosed volume shrink". Unusually the module ships its own
// counterfactual: opts.useVolume switches the volume constraint off, so both arms are first-class and neither
// has to be planted.
//
//     useVolume   volume/rest   length ratio   girth ratio
//     true        1.00000       0.6447         1.3671
//     false       0.52008       0.6139         1.1102
//
// Volume held to 1.8e-14 while the belly shortens 36% and thickens 37%. Without the constraint 48% of the volume
// is lost and the bulge is a third of the size -- the fibres simply pull the mesh in.
//
// *** THE GIRTH LAW IS APPROXIMATE AND IS GRADED AS SUCH. *** For an incompressible ellipsoid of revolution
// V = 4/3 pi a^2 c, so a scales as 1/sqrt(c): a length ratio of 0.6447 predicts girth 1.2454 against 1.3671
// measured, 10% high. The belly does not stay an ellipsoid -- it barrels, putting more material at the waist
// than the model allows. Volume conservation is the exact key; grading the girth law tightly would be grading
// the mesh rather than the physics, and the difference between those two is the whole reason for saying so.

import { contractionRun, volumeConstraintEffect, ellipsoidGirthRatio } from "./muscleKey.mjs";
import { auditConservation } from "../../tools/roundhouse/conservation.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const eff = volumeConstraintEffect();

// ---- 1. THE SERIES IS REAL BEFORE ANY VERDICT --------------------------------------------------------------------
{
    ok("the volume series is finite",
        eff.on.finite === true && eff.off.finite === true,
        "asserted first, as in every xpbd round since a NaN series produced a confident conservation verdict");
}

// ---- 2. VOLUME IS HELD, AND HELD THROUGHOUT rather than only at the end ------------------------------------------------
{
    ok("!! the enclosed volume is conserved to 1.8e-14 through a 36% contraction",
        eff.volumeHeld < 1e-10,
        `volume/rest = ${eff.on.volRatio.toFixed(12)} after 300 substeps. The fibres are pulling hard enough to ` +
        "shorten the belly by more than a third and the volume does not move");

    const a = auditConservation(eff.on.volSeries);
    ok("...and the whole trajectory is bounded, not just the endpoint",
        a.verdict === "bounded" || a.verdict === "exact",
        `conservation verdict "${a.verdict}" over the full series. An endpoint comparison would pass a run that ` +
        "ballooned mid-contraction and came back -- the instrument compares the two halves of the run instead");
}

// ---- 3. THE CONSTRAINT IS WHAT CAUSES THE BULGE, WHICH IS THE CLAIM -----------------------------------------------------
{
    ok("!! without the volume constraint the belly loses half its volume",
        eff.volumeLostWithout > 0.3,
        `${(eff.volumeLostWithout * 100).toFixed(1)}% lost with useVolume false. The contraction alone just pulls ` +
        "the mesh inward -- there is nothing to convert axial shortening into transverse growth");

    ok("!! and the bulge is amplified more than threefold by it",
        eff.bulgeAmplification > 2.5 && eff.bulgeOn > 0.2,
        `girth grows ${(eff.bulgeOn * 100).toFixed(1)}% with the constraint against ${(eff.bulgeOff * 100).toFixed(1)}% ` +
        `without -- ${eff.bulgeAmplification.toFixed(2)}x. Both arms shorten by a similar amount, so the girth ` +
        "difference isolates the volume constraint rather than the contraction");
}

// ---- 4. THE APPROXIMATE LAW, GRADED AS APPROXIMATE ---------------------------------------------------------------------
{
    const pred = ellipsoidGirthRatio(eff.on.lengthRatio);
    const rel = Math.abs(eff.on.girthRatio - pred) / pred;
    ok("!! the ellipsoid girth law holds to about 10%, and is not asserted more tightly than that",
        rel > 0.02 && rel < 0.25,
        `predicted ${pred.toFixed(4)} from a = 1/sqrt(c), measured ${eff.on.girthRatio.toFixed(4)} -- ` +
        `${(rel * 100).toFixed(1)}% high. The belly barrels rather than staying an ellipsoid, so the model is ` +
        "the wrong shape by construction. Asserting this to 1e-6 would be grading the mesh; asserting it loosely " +
        "and saying why keeps the exact claim (volume) separate from the indicative one (girth)");

    ok("...and the direction is right, which is the part that IS exact",
        eff.on.girthRatio > 1 && eff.on.lengthRatio < 1,
        "shorter and thicker. Incompressibility fixes the SIGN of the girth response exactly even where it does " +
        "not fix the magnitude");
}

console.log();
if (fails) { console.log("muscleKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("muscleKey-selfcheck: all checks pass");
