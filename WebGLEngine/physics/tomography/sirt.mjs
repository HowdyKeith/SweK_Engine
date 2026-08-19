// WebGLEngine/physics/tomography/sirt.mjs -- v3613
// ---------------------------------------------------------------------------------------------------------------
// v3612 PROVED THAT TWO DIFFERENT BINARY IMAGES HAVE IDENTICAL PROJECTIONS, AND IT PROVED IT WITH ONE
// RECONSTRUCTOR. Its own antidote said so: "if a second reconstruction method is ever added to the ct device,
// the tie must be RE-RUN against it -- the claim is about what the projections contain, so a new method must
// tie too, and if it does not then the ghost was not what it seemed." THIS IS THAT SECOND METHOD.
//
// The ct device has had ONLY filtered back-projection since v2814. Landweber/SIRT is the smallest honest
// addition: x <- x + lambda * B (b - A x), and BOTH OPERATORS ALREADY SHIP -- radon() is A and backProject()
// is B. Nothing new is modelled; the iteration is assembled from the forward model already under test.
//
// *** v3615 CORRECTION, AND IT IS ABOUT THIS FILE'S OWN CLAIMS. THIS HEADER SAID backProject() "IS A^T" AND
// NOBODY HAD CHECKED IT. IT IS NOT. *** The dot-product test <A x, y> == <x, A^T y> reads a defect of
// 8.304e-14 for the TRUE transpose of the shipped radon and **2.751e+1** for backProject -- larger than the
// inner product itself -- and no scalar repairs it (correlation 0.867, best scalar leaves 48.3%). radon
// GATHERS by sampling while backProject SPLATS with Math.round: the classic unmatched projector/backprojector
// pair, STRUCTURAL rather than a bug. TWO CLAIMS BELOW ARE THEREFORE WRONG AND ARE CORRECTED IN PLACE:
//   - this iteration is NOT gradient descent on ||A x - b||^2. It is a fixed-point iteration with an
//     unmatched backprojector, and it converges to the solution of a different normal equation.
//   - the power iteration below estimates the largest eigenvalue of **B A**, which is NOT symmetric, so
//     "A^T A" was a description of a different matrix. The step still works; the justification did not.
// WHAT THE MISMATCH COSTS, MEASURED: the true adjoint reaches residual 1.208e+0 against this file's 3.229e+0
// on the same fixture -- 2.7x further on the objective -- while the correlation to truth moves 0.970729 ->
// 0.972272. IT COSTS THE THING THE ITERATION CLAIMS TO MINIMISE AND ALMOST NOTHING IN THE THING ANYBODY
// LOOKS AT, which is exactly why it survived unnoticed here. -> physics/tomography/adjoint.mjs ***
//
// *** v3616 BUILT THE MATCHED ADJOINT AND FOUND SOMETHING WORSE THAN "IT LANDS SOMEWHERE ELSE". Run past the
// 300 iterations this file happens to use, THE SHIPPED PAIR TURNS ROUND: at N=96 the residual RISES 2.86 ->
// 3.43 from iteration 1000 to 4000 and the correlation FALLS 0.9763 -> 0.9686, while the matched operator
// falls 1.90 -> 0.0879 and holds its correlation steady. IT IS NOT A DESCENT METHOD. SO THIS FILE'S DEFAULT
// MUST BE STOPPED EARLY, AND 300 ITERATIONS GOT A GOOD ANSWER BY LUCK OF THE BUDGET -- the apparent edge the
// unmatched operator shows on correlation is EARLY STOPPING DOING THE REGULARISING. THE DEFAULT IS LEFT
// UNCHANGED HERE ON PURPOSE so this round's readings stay reproducible and its hash-pinned checks stay green;
// physics/tomography/matchedAdjoint.mjs exports the alternative with its consequences measured, and moving
// the default is Keith's call (v3603's idiom). ***
//
// ================================================================================================================
// FINDING 1: THE OTHER HALF OF THE LABEL. PART OF THE SPARSE-ANGLE LOSS **IS** THE METHOD.
// ================================================================================================================
//
// v3612 showed a falling fbpCorr is TWO THINGS WEARING ONE LABEL and measured only the irreducible half. Here
// is the other half, on the ellipse phantom the device already owns:
//
//     nAngles     FBP corr     SIRT corr     gain
//        12       0.874950     0.970618     +0.0957
//        30       0.956257     0.987556     +0.0313
//       120       0.987036     0.996503     +0.0095
//
// *** THE ADVANTAGE IS LARGEST WHERE THE DATA IS SPARSEST, AND IT SHRINKS BY AN ORDER OVER A TENFOLD ANGLE
// RANGE. *** So the sparse-angle deficit fbpCorr has always reported is PARTLY FBP's -- a second method
// recovers a tenth of the correlation at twelve views -- and partly irreducible, which the ghost proves. BOTH
// HALVES ARE NOW MEASURED, which is what the label was hiding. Asserted as an ORDERING (the gain falls with
// angle count), never as a threshold.
//
// ================================================================================================================
// FINDING 2: THE TIE HOLDS FOR THE SECOND METHOD -- AND FROM THE INSIDE IT IS STRONGER THAN A TIE
// ================================================================================================================
//
// On v3612's binary pair at the two lattice directions:
//
//     SIRT from ZERO      vsA 0.439922948   vsC 0.439922948   gap 3.331e-16 (machine zero)
//     SIRT seeded at A    vsA 1.000000000   RESIDUAL EXACTLY 0.000e+0
//     SIRT seeded at C    vsC 1.000000000   RESIDUAL EXACTLY 0.000e+0
//
// *** BOTH SEEDS ARE FIXED POINTS WITH ZERO RESIDUAL. Two different images each fit the measured projections
// PERFECTLY -- not "to within a tolerance", exactly. So the method's answer is decided by WHERE IT STARTS and
// not by the data, and that is the ambiguity seen from inside an algorithm rather than argued from outside. ***
//
// THE CONTROL IS THE SAME EXPERIMENT WITH THE SEPARATING ANGLES: seeded at C the residual is 1.010e+0, NOT
// zero -- C stops fitting, the fixed point is gone, and the score gap opens to 3.403e-1. One experiment, two
// angle sets, opposite answers.
//
// ================================================================================================================
// A PREDICTION OF MINE, REFUTED BY THE MEASUREMENT AND KEPT
// ================================================================================================================
//
// I expected the zero-start answer to be the MEAN of the two truths, on the reasoning that Landweber from zero
// lands on the minimum-norm solution and the pair differs by one ghost. Measured over the differing pixels the
// relative departure is 5.596e-1 -- NOT the mean, and not nearly. The reasoning was wrong in a specific way:
// minimum-norm minimises over the WHOLE null space of this angle set, which contains far more than the single
// ghost direction that separates these two images. THE TIE IS REAL AND MY EXPLANATION OF ITS VALUE WAS NOT.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { radon, backProject, filteredBackProjection, scoreRecon, phantomField, angleSet } from "./ct.js";
// v3617 -- MOVED, NOT COPIED: the Landweber loop, the residual and the power-iteration step now live in
// reconOps.mjs, which has NO node imports so a PAGE can reach them. This file re-exports its old names, so
// every caller and every hash-pinned check here keeps working against ONE declaration. AND IT CLOSED A
// DUPLICATION I CREATED AT v3616: stepFor existed in this file AND in matchedAdjoint.mjs -- the same power
// iteration written twice, in the arc whose whole subject is two declarations of one thing.
import { landweber, powerStep, residual } from "./reconOps.mjs";
export { residual };
import { binaryPair, PAIR, LATTICE_ANGLES, PLUS_DIAGONALS } from "./ambiguity.mjs";

/**
 * THE STEP IS DERIVED, NOT TYPED. Power iteration on the SHIPPED operators estimates the largest eigenvalue
 * of **B A** -- v3615 corrected this: B is NOT A^T (see the header), so this is not A^T A and the classical
 * Landweber bound 0 < lambda < 2 / sigma_max(A)^2 does not strictly apply. What the estimate still gives is
 * the growth factor of the actual iteration matrix, which is what the step needs to stay bounded, and the
 * convergence section of the gate measures it rather than assuming it. A typed 0.002 would have been a magic
 * number that quietly stops working the day N changes.
 */
export const stepFor = (N, angles, nDet, opts) => powerStep((r) => backProject(r, N, angles, nDet), N, angles, nDet, opts);

/** x <- x + step * A^T (b - A x). Both operators are the SHIPPED ones; nothing new is modelled here. */
export const sirt = (sino, N, angles, nDet, opts) => landweber(sino, N, angles, nDet, opts);

// --- FINDING 1: the half of the label that IS the method ----------------------------------------------------------

export const PHANTOM = [
    { cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1, phi: 0 },
    { cx: 0.2, cy: -0.1, a: 0.25, b: 0.2, rho: -0.6, phi: 0.4 },
    { cx: -0.3, cy: 0.25, a: 0.15, b: 0.3, rho: 0.5, phi: -0.7 },
];

export function methodGain(counts = [12, 30, 120], { N = 96, nDet = 96, iters = 300 } = {}) {
    const truth = phantomField(N, PHANTOM);
    return counts.map((na) => {
        const angles = angleSet(na), b = radon(truth, N, angles, nDet);
        const fbp = scoreRecon(filteredBackProjection(b, N, angles, nDet), truth).corr;
        const it = scoreRecon(sirt(b, N, angles, nDet, { iters }).x, truth).corr;
        return { nAngles: na, fbp, sirt: it, gain: it - fbp };
    });
}

// --- FINDING 2: the ambiguity from the inside ----------------------------------------------------------------------

/** Seeded at each truth in turn: both are fixed points with zero residual when the angle set admits the ghost. */
export function seedExperiment(angles = LATTICE_ANGLES, { iters = 300 } = {}) {
    const { N, nDet } = PAIR, { a, c } = binaryPair();
    const b = radon(a, N, angles, nDet);
    const run = (x0) => { const r = sirt(b, N, angles, nDet, { iters, x0 }); return { ...r, vsA: scoreRecon(r.x, a).corr, vsC: scoreRecon(r.x, c).corr }; };
    const zero = run(null), fromA = run(a), fromC = run(c);
    let num = 0, den = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) { const m = (a[i] + c[i]) / 2; num += (zero.x[i] - m) ** 2; den += m * m; }
    return {
        angles: angles.length,
        zero: { vsA: zero.vsA, vsC: zero.vsC, gap: Math.abs(zero.vsA - zero.vsC), residual: zero.residual },
        fromA: { vsA: fromA.vsA, vsC: fromA.vsC, residual: fromA.residual },
        fromC: { vsA: fromC.vsA, vsC: fromC.vsC, residual: fromC.residual },
        zeroVsMean: den > 0 ? Math.sqrt(num / den) : null,
    };
}

export const MEASURED_V3613 = {
    supersededByV3616: "run past 300 iterations the shipped pair DIVERGES -- residual rising and correlation " +
        "falling -- so this iteration must be STOPPED EARLY and the budget was doing the regularising. The " +
        "matched adjoint in matchedAdjoint.mjs converges instead. Default unchanged here on purpose.",
    supersededByV3615: "the claims that backProject is A^T and that the power iteration is on A^T A are BOTH " +
        "WRONG -- see the header and physics/tomography/adjoint.mjs. The readings below are correct for the " +
        "OPERATOR PAIR THEY WERE TAKEN WITH; what changes is what the iteration can be said to be MINIMISING. " +
        "The seeded fixed points are UNAFFECTED and in fact stronger: b - A x is exactly zero there, so the " +
        "update is B(0) = 0 for ANY LINEAR B, which v3615 drives with a deliberately absurd one.",
    methodHalf: { 12: { fbp: 0.874950, sirt: 0.970618 }, 30: { fbp: 0.956257, sirt: 0.987556 }, 120: { fbp: 0.987036, sirt: 0.996503 } },
    bothSeedsFitExactly: { fromAResidual: 0, fromCResidual: 0, atLatticeAngles: 2 },
    controlWithDiagonals: { fromCResidual: 1.010, scoreGap: 0.3403 },
    refutedPrediction: "I expected the zero-start answer to be the MEAN of the two truths, since Landweber from " +
        "zero lands on the minimum-norm solution and the pair differs by one ghost. Measured departure over the " +
        "differing pixels: 5.596e-1 -- NOT the mean. Minimum-norm minimises over the WHOLE null space of the " +
        "angle set, which holds far more than the one ghost direction. THE TIE IS REAL; MY EXPLANATION WAS NOT.",
    verdict: "A SECOND, INDEPENDENT RECONSTRUCTOR TIES TOO -- and from the inside it is stronger than a tie: " +
        "SEEDED AT EITHER TRUTH, SIRT SITS AT A FIXED POINT WITH RESIDUAL EXACTLY ZERO. Two different images " +
        "each fit the measured projections PERFECTLY, so the answer is decided by where the method starts and " +
        "not by the data. AND THE OTHER HALF OF THE LABEL IS NOW MEASURED: SIRT recovers +0.0957 correlation at " +
        "twelve views against +0.0095 at a hundred and twenty, so part of the sparse-angle loss IS the method.",
    notClaimed: "the ct DEVICE is not changed -- adding an observable moves lab-results and that is Keith's " +
        "call, so this ships as a bench module with a page row. And SIRT is not offered as a better " +
        "reconstructor in general: it is measured on ONE phantom at three angle counts, which is a reading, " +
        "not a benchmark.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[sirt] a second reconstructor -- and the ambiguity seen from inside an algorithm");
    say("");
    say("1. THE OTHER HALF OF THE LABEL: part of the sparse-angle loss IS the method");
    say("     nAngles     FBP corr     SIRT corr     gain");
    for (const r of methodGain())
        say("     " + String(r.nAngles).padStart(5) + "     " + r.fbp.toFixed(6) + "     " + r.sirt.toFixed(6) +
            "     " + (r.gain >= 0 ? "+" : "") + r.gain.toFixed(4));
    say("     The gain SHRINKS as views are added -- an ordering, not a threshold. v3612 measured the");
    say("     irreducible half; this is the reducible one, and the label was hiding both.");
    say("");
    say("2. THE AMBIGUITY FROM THE INSIDE");
    for (const [nm, ang] of [["the two lattice directions", LATTICE_ANGLES], ["with 45 and 135 added", PLUS_DIAGONALS]]) {
        const e = seedExperiment(ang);
        say("   " + nm + " (" + e.angles + " angles):");
        say("     from ZERO   vsA " + e.zero.vsA.toFixed(9) + "  vsC " + e.zero.vsC.toFixed(9) +
            "   gap " + e.zero.gap.toExponential(3));
        say("     seeded at A  residual " + e.fromA.residual.toExponential(3) + "   corr vsA " + e.fromA.vsA.toFixed(9));
        say("     seeded at C  residual " + e.fromC.residual.toExponential(3) + "   corr vsC " + e.fromC.vsC.toFixed(9));
    }
    say("     BOTH SEEDS ARE FIXED POINTS WITH ZERO RESIDUAL at the lattice directions -- two different images");
    say("     each fitting the projections EXACTLY. Add the diagonals and C stops fitting.");
    say("");
    say("  " + MEASURED_V3613.verdict);
    say("  REFUTED, AND KEPT: " + MEASURED_V3613.refutedPrediction);
    say("  NOT CLAIMED: " + MEASURED_V3613.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
