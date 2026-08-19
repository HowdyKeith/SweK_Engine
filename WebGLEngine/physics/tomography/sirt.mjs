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
// *** v3846 -- KEITH SETTLED IT, AND MEASURING IT FIRST CHANGED WHAT "SETTLED" MEANT. SPLIT BY QUESTION. ***
// ================================================================================================================
//
// v3616 recommended the matched adjoint off ONE reading -- 16 angles at N = 96 -- and that reading is real but
// it is not the whole shape. Swept across the angle counts THIS FILE ACTUALLY PUBLISHES, on this file's own
// phantom, run to convergence rather than to a budget:
//
//     nAngles      FBP        shipped @300      matched (converged)        winner
//        12      0.874950     0.970618          0.954752  (resid 3.0e-4)   SHIPPED
//        30      0.956257     0.987556          0.981497                   SHIPPED
//       120      0.987036     0.996503          0.999732  (resid 1.29)     MATCHED
//
// *** THE TWO OPERATORS CROSS OVER WITH ANGLE COUNT -- AND I NEARLY REPORTED THAT AS A DISCOVERY WHEN THE
// TREE ALREADY KNEW IT. ct.html HAS SAID SO SINCE v3617, in its own words: "It holds at 30 angles here and
// REVERSES at 90 ... the correlation comparison FLIPS with angle count while the residual comparison does
// not -- the wrinkle is an effect of SPARSE angles, not a general law." *** THAT IS THIS FINDING, WRITTEN
// DOWN THIRTY VERSIONS AGO, ON A PAGE. *** It is v2881/v2883's shape exactly -- reading one file and missing
// the correction already recorded in another -- and it was caught here only because toolFrontDoor's tool
// registry was being read for an unrelated reason. WHAT IS ACTUALLY NEW IN THIS ROUND IS TWO THINGS, AND
// NEITHER IS THE CROSSOVER:
//
//   (1) THE CROSSOVER NEVER LEFT THE PAGE. It is in ct.html's prose and in reportingTools' blurb, and it is
//       in NEITHER this header, NOR sirt-selfcheck, NOR the standing "moving the default is Keith's call"
//       that three module headers kept repeating. The fact that decides the question sat in the one place
//       nobody re-reads when deciding it. REACHABLE AND FINDABLE, AGAIN.
//   (2) *** THE SPARSE-SIDE GAP IS SATURATION, NOT BUDGET, AND THAT IS THE PART ct.html DID NOT ESTABLISH. ***
//       Its numbers are taken at a fixed budget, so "matched loses the correlation at 30" leaves open the
//       reading that it simply had not arrived yet -- which is exactly what v3616 said about the OTHER
//       operator. Run to convergence it does not close: see below.
//
// The matched operator
// correlation SATURATES below the shipped pair where the data is sparse, and more budget does not close the
// gap: 0.952483 at 300 iterations, 0.954752 at 2400, 0.954752 at 4800 -- CHECKED TO CONVERGENCE, so this is
// not early stopping wearing a disguise. It is v3612's ambiguity arriving from a third direction: the
// least-squares solution of an underdetermined system is not the best picture, so DESCENDING FURTHER ON
// ||Ax - b|| BUYS THE DATA AND DOES NOT BUY THE OBJECT. At 120 views the system is determined enough that the
// two agree about what the data means, and there the matched operator wins on both numbers at once.
//
// *** SO MOVING THE DEFAULT WHOLESALE WOULD HAVE REGRESSED THIS FILE'S OWN HEADLINE FINDING. *** FINDING 1
// below is "the advantage is largest where the data is sparsest", and at twelve views the gain would have
// fallen +0.0957 -> +0.0776. A round must not move a verdict it is not about (v3679), and this round is about
// which operator answers which question -- not about whether SIRT beats FBP.
//
// ================================================================================================================
// *** v3847 -- THE SPLIT LASTED ONE ROUND. KEITH READ THE NUMBERS AND CHOSE ONE DEFAULT: MATCHED, EVERYWHERE. ***
// ================================================================================================================
//
// v3846 measured the crossover and offered three ways to spend it; the call was TAKE THE REGRESSION. The
// reasoning is not that the matched operator scores better -- IT DOES NOT, at two of the three angle counts
// below -- but that A FIXED-POINT ITERATION THAT WALKS AWAY FROM THE DATA IS NOT A DEFENSIBLE DEFAULT
// WHATEVER IT SCORES ON ONE PHANTOM. v3616's finding stands: the old pair is not a descent method, and a
// method that is not a descent method should not be the thing this tree hands out by name.
//
// *** THE COST IS PAID ON PURPOSE AND IS WRITTEN DOWN RATHER THAN ABSORBED: ***
//
//     nAngles     FBP        v3613 operator     v3847 default (matched)     delta
//        12     0.874950     0.970618           0.952483                    -0.018135
//        30     0.956257     0.987556           0.979565                    -0.007991
//       120     0.987036     0.996503           0.996897                    +0.000394
//
// FINDING 1's headline gain falls +0.0957 -> +0.0776 at twelve views. *** ITS ORDERING AND EVERY ASSERTION
// BUILT ON IT STILL HOLD -- the sparse end is still where a method choice buys most, now by 7.86x rather than
// 10.1x, and SIRT still beats FBP at every angle count. THE FINDING SURVIVES; ITS NUMBERS MOVED. *** Both
// tables are kept in MEASURED_V3613 (methodHalf and methodHalfUnderV3613Operator) so the cost stays visible
// instead of being quietly overwritten.
//
// WHAT IT BUYS: the residual descends monotonically for as long as it is run, so the BUDGET STOPS BEING
// LOAD-BEARING. 300 iterations is now merely a budget rather than an accidental regulariser, and running
// longer is now a straightforward improvement instead of a way to make the answer worse.
//
// THE OLD OPERATOR IS NOT GONE, IT IS UNNAMED: pass `adjoint: (r) => backProject(...)`, and stepForUnmatched
// derives its step. The gates drive it that way to keep the turn-round on the record rather than in prose.
//
// v3846's SPLIT ENTRY POINTS SURVIVE AS ALIASES. sirtDescent() and landweberDescent() now agree with the
// default; they are kept because the NAME still carries the claim, and they are aliases rather than second
// implementations, so there is no way for them to drift.
//
// ---------------------------------------------------------------------------------------------------------
// v3846's SPLIT, FOR THE RECORD -- SUPERSEDED BY THE ABOVE:
//
//     sirt()         RECONSTRUCTION -- "what does the object look like". Defaults to backProject, UNCHANGED,
//                    so every published correlation here stays reproducible. It must be STOPPED EARLY.
//     sirtDescent()  THE OBJECTIVE -- "how small can ||Ax - b|| get". Defaults to matchedBackProject, because
//                    the other pair provably does not minimise the thing the claim names.
//
// *** AND THE DEFECT THIS ACTUALLY FIXES WAS IN A GATE. sirt-selfcheck's section 2 asserted "the residual
// falls at every checkpoint" over 200 iterations WITH THE OPERATOR THAT DOES NOT DESCEND. On that gate's own
// fixture (N = 48, 24 angles) the shipped pair bottoms out around iteration 750 and RISES 4.345 -> 7.556 by
// 4000, while the matched operator falls monotonically to 0.2945 and is still falling. THE CLAIM WAS TRUE
// ONLY INSIDE A BUDGET THAT HID THE DEFECT -- the same shape as a tolerance chosen by looking at where the
// measurement landed. The descent claim now runs on the operator that owns it, and past the turn. ***
//
// NOT CLAIMED: that the matched operator is worse at reconstruction. At N = 48 / 24 angles it reads 0.983912
// against the shipped pair's 0.904417 over the same 4000 iterations -- the crossover is about HOW
// UNDERDETERMINED the system is, not about the operator being good or bad, and two of this file's three
// published angle counts happen to sit on the sparse side.
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
import { landweber, landweberDescent, matchedBackProject, powerStep, residual } from "./reconOps.mjs";
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
// *** v3847 -- stepFor FOLLOWS THE DEFAULT OPERATOR, because the step IS a property of the operator. *** The
// power iteration estimates lambda_max(B A), and B changed, so the number changes: at N = 48 / 24 angles the
// step moves 7.2226e-3 -> 9.4431e-4 and at N = 96 it moves 3.6240e-3 -> 4.7575e-4. LEAVING stepFor ON
// backProject WOULD HAVE HANDED THE MATCHED ITERATION A STEP DERIVED FOR A DIFFERENT MATRIX -- roughly 7.6x
// its own ceiling, which is outside Landweber's bound and diverges. THE TWO HALVES MOVE TOGETHER OR NEITHER
// MOVES.
export const stepFor = (N, angles, nDet, opts) => powerStep((r) => matchedBackProject(r, N, angles, nDet), N, angles, nDet, opts);

/** The OLD step, for the OLD operator. Kept so the gates can drive the unmatched pair on the record. */
export const stepForUnmatched = (N, angles, nDet, opts) => powerStep((r) => backProject(r, N, angles, nDet), N, angles, nDet, opts);

/** x <- x + step * A^T (b - A x). Both operators are the SHIPPED ones; nothing new is modelled here. */
export const sirt = (sino, N, angles, nDet, opts) => landweber(sino, N, angles, nDet, opts);

/**
 * v3846 -- THE OBJECTIVE HALF OF THE SPLIT. Same iteration, matched adjoint, so ||Ax - b|| actually descends.
 * Use this wherever the claim is about the RESIDUAL; use sirt() wherever it is about the PICTURE. Reaching for
 * the wrong one is not a style question -- it is the difference between a claim that is true and one that is
 * true only inside its budget.
 */
export const sirtDescent = (sino, N, angles, nDet, opts) => landweberDescent(sino, N, angles, nDet, opts);

/** The step for the MATCHED operator, derived the same way and NOT the same number -- it moves with B. */
export const stepForMatched = (N, angles, nDet, opts) =>
    powerStep((r) => matchedBackProject(r, N, angles, nDet), N, angles, nDet, opts);

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

/**
 * v3846 -- THE CROSSOVER, MEASURED BEFORE THE DEFAULT WAS MOVED RATHER THAN AFTER. Kept separate from
 * MEASURED_V3613 because it does not correct those readings -- every one of them still stands, taken with the
 * operator that still ships. What it corrects is v3616's RECOMMENDATION, which was right about convergence
 * and silent about the regime where convergence is not what you want.
 */
export const MEASURED_V3846 = {
    crossover: {
        12:  { fbp: 0.874950, shipped300: 0.970618, matchedConverged: 0.954752, winner: "shipped" },
        30:  { fbp: 0.956257, shipped300: 0.987556, matchedConverged: 0.981497, winner: "shipped" },
        120: { fbp: 0.987036, shipped300: 0.996503, matchedConverged: 0.999732, winner: "matched" },
    },
    creditWhereItIsDue:
        "*** THE CROSSOVER IS NOT THIS ROUND'S DISCOVERY. ct.html has recorded it since v3617 -- 'it holds at " +
        "30 angles here and REVERSES at 90 ... the wrinkle is an effect of SPARSE angles, not a general law' " +
        "-- and I nearly shipped it as new. v2881/v2883's shape: reading one file and missing the correction " +
        "already written in another. WHAT IS NEW IS THAT IT NEVER LEFT THE PAGE (not this header, not the " +
        "gate, not the standing default question three headers kept repeating) AND THAT THE SPARSE-SIDE GAP " +
        "IS SATURATION RATHER THAN BUDGET, which ct.html's fixed-budget numbers could not establish. ***",
    saturationIsNotEarlyStopping:
        "the matched operator's correlation at 12 views reads 0.952483 at 300 iterations, 0.954752 at 2400 " +
        "and 0.954752 at 4800, with the residual down to 3.0e-4. CHECKED TO CONVERGENCE. The gap to the " +
        "shipped pair's 0.970618 is not a budget artefact -- it is the least-squares answer being a worse " +
        "PICTURE than the regularised one, which is v3612's ambiguity from a third direction.",
    whatMovingItWholesaleWouldHaveCost:
        "FINDING 1's headline -- 'the advantage is largest where the data is sparsest' -- would have gone " +
        "+0.0957 -> +0.0776 at twelve views. A ROUND MUST NOT MOVE A VERDICT IT IS NOT ABOUT (v3679), and " +
        "this round is about which operator answers which question.",
    theDefectItActuallyFixed:
        "sirt-selfcheck section 2 asserted 'the residual falls at every checkpoint' over 200 iterations using " +
        "the operator that does not descend. On that gate's own fixture (N = 48, 24 angles) the shipped pair " +
        "bottoms out near iteration 750 and RISES 4.345 -> 7.556 by 4000; the matched operator falls " +
        "monotonically to 0.2945 and is still falling. A TRUE CLAIM INSIDE A BUDGET THAT HID THE DEFECT.",
    notClaimed:
        "that the matched operator reconstructs worse. At N = 48 / 24 angles it reads 0.983912 against the " +
        "shipped pair's 0.904417 over the same 4000 iterations. The crossover is about HOW UNDERDETERMINED " +
        "the system is, and two of this file's three published angle counts sit on the sparse side.",
};

export const MEASURED_V3613 = {
    supersededByV3616: "run past 300 iterations the shipped pair DIVERGES -- residual rising and correlation " +
        "falling -- so this iteration must be STOPPED EARLY and the budget was doing the regularising. The " +
        "matched adjoint in matchedAdjoint.mjs converges instead. Default unchanged here on purpose.",
    supersededByV3615: "the claims that backProject is A^T and that the power iteration is on A^T A are BOTH " +
        "WRONG -- see the header and physics/tomography/adjoint.mjs. The readings below are correct for the " +
        "OPERATOR PAIR THEY WERE TAKEN WITH; what changes is what the iteration can be said to be MINIMISING. " +
        "The seeded fixed points are UNAFFECTED and in fact stronger: b - A x is exactly zero there, so the " +
        "update is B(0) = 0 for ANY LINEAR B, which v3615 drives with a deliberately absurd one.",
    // *** v3847 -- REWRITTEN. These are the readings under the MATCHED default; the v3613 column is kept
    // beside them because a table that silently changed its own numbers would hide the cost of the decision.
    methodHalf: { 12: { fbp: 0.874950, sirt: 0.952483 }, 30: { fbp: 0.956257, sirt: 0.979565 }, 120: { fbp: 0.987036, sirt: 0.996897 } },
    methodHalfUnderV3613Operator: { 12: { fbp: 0.874950, sirt: 0.970618 }, 30: { fbp: 0.956257, sirt: 0.987556 }, 120: { fbp: 0.987036, sirt: 0.996503 } },
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
