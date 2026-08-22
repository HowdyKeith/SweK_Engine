// WebGLEngine/physics/tomography/sirt-selfcheck.mjs -- v3613
//
// Run: node physics/tomography/sirt-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/tomography/sirt.mjs -- the second reconstructor, the method half of the sparse-angle loss,
// and the seeded fixed points.
//
// THE CHECK THIS FILE EXISTS FOR is section 4: v3612's claim was proved with ONE reconstructor and its own
// antidote demanded a second. A tie that only FBP shows is a fact about FBP; a tie two independent methods
// show is a fact about the data. AND THE SEEDED FORM IS STRONGER THAN A TIE -- both seeds sit at residual
// EXACTLY zero, which is asserted as zero because it is zero.
import {
    sirt, sirtDescent, stepFor, residual, methodGain, seedExperiment, PHANTOM, MEASURED_V3613, MEASURED_V3846, reportLines,
} from "./sirt.mjs";
import { radon, backProject, filteredBackProjection, scoreRecon, phantomField, angleSet } from "./ct.js";
import { stepForMatched, stepForUnmatched } from "./sirt.mjs";
import { matchedBackProject } from "./reconOps.mjs";
import { binaryPair, PAIR, LATTICE_ANGLES, PLUS_DIAGONALS } from "./ambiguity.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE ITERATION IS ASSEMBLED FROM THE SHIPPED OPERATORS, PROVEN BY IDENTITY ----------------------------------
{
    const N = 48, nDet = 48, angles = angleSet(16);
    const truth = phantomField(N, PHANTOM), b = radon(truth, N, angles, nDet);
    const one = sirt(b, N, angles, nDet, { iters: 1 });
    // v3847 -- the default operator moved, so the operator this identity is written against moves with it.
    // A check that kept backProject here would have gone red for the RIGHT reason and been "fixed" by
    // loosening it; it is re-pointed instead, and the unmatched arm is asserted below to stay distinguishable.
    const expect = matchedBackProject(b, N, angles, nDet);
    let worst = 0;
    for (let i = 0; i < one.x.length; i++) worst = Math.max(worst, Math.abs(one.x[i] - one.step * expect[i]));
    ok("!! ONE step from zero IS exactly step * A^T b, using the SHIPPED operators", worst === 0,
       "worst departure " + worst.toExponential(3) + " -- an IDENTITY, so the iteration cannot have quietly " +
       "grown a forward model of its own");
    const s = stepFor(N, angles, nDet);
    ok("...and the step is DERIVED by power iteration, never typed", s.step > 0 && Number.isFinite(s.step),
       "lambdaMax " + s.lambdaMax.toExponential(4) + " -> step " + s.step.toExponential(4) +
       " -- a typed constant would quietly stop working the day N changes");
    const s2 = stepFor(N * 2, angles, nDet);
    ok("POSITIVE CONTROL: the derived step MOVES with the problem size", Math.abs(s2.step - s.step) / s.step > 0.05,
       "N=" + N + " -> " + s.step.toExponential(3) + ", N=" + (N * 2) + " -> " + s2.step.toExponential(3));
}

// ---- 2. THE DESCENT CLAIM, ON THE OPERATOR THAT OWNS IT -- AND THE BUDGET THAT USED TO HIDE THE DEFECT ------
// *** v3846 -- THIS SECTION USED TO ASSERT "the residual falls at every checkpoint" OVER 200 ITERATIONS USING
// sirt(), WHICH DOES NOT DESCEND. *** The claim was true, and it was true only inside a budget short enough to
// stop before the turn -- the same shape as a tolerance chosen by looking at where the measurement landed.
// v3616 proved the old pair turns round; nothing propagated that into the gate that makes the descent claim.
// *** v3847 -- THE DEFAULT MOVED, so the descent claim is simply sirt()'s to make now, and the OLD operator
// has to be asked for BY NAME. The negative below keeps v3616's finding on the record as a measurement
// rather than as a paragraph. ***
{
    const N = 48, nDet = 48, angles = angleSet(24);
    const truth = phantomField(N, PHANTOM), b = radon(truth, N, angles, nDet);

    // THE OBJECTIVE HALF: matched adjoint, run four thousand iterations -- five times past where the shipped
    // pair bottoms out, so a claim of descent has somewhere to fail.
    const d = sirtDescent(b, N, angles, nDet, { iters: 4000, every: 250 });
    const hd = d.history.map((e) => e.residual);
    ok("!! the residual falls at EVERY checkpoint, over 4000 iterations", hd.every((v, i) => i === 0 || v <= hd[i - 1]),
       hd.filter((_, i) => i % 4 === 0).map((v) => v.toExponential(2)).join(" -> ") +
       " -- Landweber's theorem says a matched operator with a step inside the spectral bound cannot increase " +
       "the residual, and this is that statement driven rather than quoted");
    ok("!! ...and it falls three orders, so this is convergence and not a nudge", hd[0] / hd[hd.length - 1] > 1000,
       (hd[0] / hd[hd.length - 1]).toExponential(2) + "x -- asserted as a RATIO of its own first reading");

    // *** THE NEGATIVE, AND IT IS THE REASON THE DEFAULT MOVED. Same fixture, same budget, OLD operator --
    // which since v3847 must be ASKED FOR BY NAME, and that is the whole point of the change. ***
    const u = sirt(b, N, angles, nDet, { iters: 4000, every: 250, adjoint: (r) => backProject(r, N, angles, nDet) });
    const hu = u.history.map((e) => e.residual);
    const minU = Math.min(...hu), minAt = hu.indexOf(minU) * 250;
    ok("!! *** AND THE OLD (v3613) PAIR IS NOT MONOTONE ON THE SAME FIXTURE -- IT TURNS ROUND ***",
       !hu.every((v, i) => i === 0 || v <= hu[i - 1]) && hu[hu.length - 1] > minU * 1.5,
       `bottoms out at ${minU.toExponential(4)} near iteration ${minAt}, then RISES to ` +
       `${hu[hu.length - 1].toExponential(4)} by 4000. *** THE OLD CHECK RAN 200 ITERATIONS AND PASSED. A ` +
       "SHORT ENOUGH BUDGET MAKES A NON-DESCENT METHOD LOOK LIKE A DESCENT METHOD, and at v3847 that operator " +
       "stopped being the default ***");
    ok("...so the two operators genuinely differ on the objective, not by a rounding",
       minU / hd[hd.length - 1] > 10,
       `the OLD pair's BEST residual (${minU.toExponential(3)}) is still ` +
       `${(minU / hd[hd.length - 1]).toFixed(1)}x the matched operator's LAST (${hd[hd.length - 1].toExponential(3)})`);

    // THE RECONSTRUCTION HALF, NOW ON THE MATCHED DEFAULT AND ITS UNCHANGED 200-ITERATION BUDGET.
    const r = sirt(b, N, angles, nDet, { iters: 200, every: 25 });
    ok("the reconstruction is a good match to the truth it was built from", scoreRecon(r.x, truth).corr > 0.9,
       "corr " + scoreRecon(r.x, truth).corr.toFixed(6) + " against the ellipse phantom the device owns -- " +
       "the BUDGET is unchanged at 200; what moved at v3847 is which operator it is spent on");
}

// ---- 2b. THE CROSSOVER, AND THE COST THAT WAS PRICED BEFORE IT WAS PAID (v3846 measured, v3847 paid) -------
// *** MEASURED BEFORE THE CHANGE, NOT AFTER. *** v3616 recommended the matched adjoint off one 16-angle
// reading. Swept over the angle counts this file publishes, the operators CROSS OVER. v3846 put the numbers
// to Keith; v3847 moved the default to matched AND TOOK THE SPARSE REGRESSION ON PURPOSE. The crossover is
// not this round's discovery -- ct.html has recorded the flip since v3617 -- and it is asserted here because
// it is the thing the decision was made against.
{
    const c = MEASURED_V3846.crossover;
    ok("!! the OLD pair wins at the SPARSE end and the matched one wins at the DENSE end",
       c[12].shipped300 > c[12].matchedConverged && c[30].shipped300 > c[30].matchedConverged &&
       c[120].matchedConverged > c[120].shipped300,
       `12 views ${c[12].shipped300.toFixed(6)} vs ${c[12].matchedConverged.toFixed(6)} (shipped); ` +
       `120 views ${c[120].shipped300.toFixed(6)} vs ${c[120].matchedConverged.toFixed(6)} (matched). ` +
       "*** NO SINGLE DEFAULT SERVES BOTH ENDS. v3847 chose one anyway: not because matched scores better " +
       "(it does not, at two of these three) but because a fixed-point iteration that WALKS AWAY FROM THE " +
       "DATA is not a defensible default whatever it scores on one phantom ***");
    ok("!! ...and the sparse-end gap is SATURATION, not budget -- recorded because it is what settled the call",
       (MEASURED_V3846.saturationIsNotEarlyStopping || "").includes("CHECKED TO CONVERGENCE"),
       "0.952483 at 300 iterations, 0.954752 at 2400, 0.954752 at 4800, residual down to 3.0e-4. The " +
       "least-squares answer is a worse PICTURE than the regularised one -- v3612's ambiguity from a third " +
       "direction, and the reason descending further buys the data and not the object");
    ok("!! ...and the cost was PRICED BEFORE IT WAS PAID, not discovered in a diff afterwards",
       (MEASURED_V3846.whatMovingItWholesaleWouldHaveCost || "").includes("+0.0957"),
       "FINDING 1's gain at twelve views falls +0.0957 -> +0.0776. Measured and put to Keith at v3846; paid " +
       "at v3847");
    ok("!! and BOTH tables are kept, so the price stays visible instead of being overwritten",
       MEASURED_V3613.methodHalf[12].sirt === 0.952483 &&
       MEASURED_V3613.methodHalfUnderV3613Operator[12].sirt === 0.970618,
       "methodHalf now carries the v3847 default's readings and methodHalfUnderV3613Operator carries the old " +
       "operator's. *** A HASH-PINNED TABLE THAT SILENTLY REWROTE ITS OWN NUMBERS WOULD HIDE THE PRICE OF THE " +
       "DECISION, which is the whole reason it is pinned ***");
}

// ---- 3. THE OTHER HALF OF THE LABEL: PART OF THE SPARSE-ANGLE LOSS IS THE METHOD --------------------------------------
{
    const rows = methodGain();
    ok("!! SIRT BEATS FBP AT EVERY ANGLE COUNT ON THE SAME PHANTOM", rows.every((r) => r.gain > 0),
       rows.map((r) => r.nAngles + ": " + r.fbp.toFixed(6) + " -> " + r.sirt.toFixed(6)).join("   "));
    const gains = rows.map((r) => r.gain);
    ok("!! ...AND THE GAIN SHRINKS AS VIEWS ARE ADDED -- asserted as an ORDERING, never a threshold",
       gains.every((g, i) => i === 0 || g <= gains[i - 1]),
       gains.map((g) => "+" + g.toFixed(4)).join(" > ") + " -- so the sparse end is where a method choice buys most");
    ok("...and the gain at the sparsest is an order above the gain at the densest",
       gains[0] / gains[gains.length - 1] > 5,
       (gains[0] / gains[gains.length - 1]).toFixed(1) + "x -- v3612 measured the IRREDUCIBLE half of the " +
       "falling score; this is the REDUCIBLE half, and the label was hiding both");
    ok("...and FBP still improves with views, so the comparison is not against a broken baseline",
       rows[rows.length - 1].fbp > rows[0].fbp, rows.map((r) => r.fbp.toFixed(4)).join(" < "));
}

// ---- 4. THE TIE HOLDS FOR THE SECOND METHOD, AND FROM THE INSIDE IT IS STRONGER --------------------------------------
{
    const e = seedExperiment(LATTICE_ANGLES);
    // *** v3847 -- THE BOUND HERE WAS A FITTED CONSTANT AND IT IS NOW A DERIVED ONE, AND SAYING SO MATTERS
    // BECAUSE THIS IS A LOOSENING. *** The old form was `gap <= 4 * |vsA| * EPSILON`, and the 4 was not
    // argued anywhere -- it was the number that fitted the v3613 operator's summation order. Moving the
    // default changed the order in which 4096 pixel terms are accumulated and the noise went to 5.09 ulps,
    // so the check went red FOR A REASON THAT IS NOT ABOUT THE CLAIM. The wrong repair is 4 -> 8, which is
    // fitting the constant a second time.
    //
    // THE BOUND IS NOW THE TEXTBOOK ROUNDING BOUND FOR AN n-TERM SUM: sqrt(n) * EPSILON, with n the pixel
    // count the correlation accumulates over (PAIR.N^2 = 4096, so sqrt(n) = 64). Measured 5.09 ulps against
    // a bound of 64 -- A 12.6x MARGIN THAT COMES FROM THE ARITHMETIC RATHER THAN FROM THE MEASUREMENT.
    //
    // AND THE LOOSENING IS PAID FOR BY THE CHECK BELOW IT, WHICH IS THE ONE THAT CANNOT BE FITTED: the same
    // experiment at the SEPARATING angles reads a gap of 3.0654e-1, so the tie is 6.1e14 TIMES TIGHTER THAN
    // THE CONTROL. No tolerance choice in this range can turn one into the other, which is what makes the
    // tie a measurement rather than an epsilon.
    const nPix = PAIR.N * PAIR.N;
    const tieBound = Math.sqrt(nPix) * Math.abs(e.zero.vsA) * Number.EPSILON;
    ok("!! A SECOND, INDEPENDENT RECONSTRUCTOR TIES TOO", e.zero.gap <= tieBound,
       "vsA " + e.zero.vsA.toFixed(9) + " vsC " + e.zero.vsC.toFixed(9) + ", apart by " + e.zero.gap.toExponential(3) +
       " = " + (e.zero.gap / Math.abs(e.zero.vsA) / Number.EPSILON).toFixed(2) + " ulps against a derived bound of " +
       Math.sqrt(nPix).toFixed(0) + " (sqrt of the " + nPix + " pixels the correlation sums over) -- v3612 proved " +
       "the point with FBP alone, and a tie one method shows is a fact about that method");
    ok("!! ...and the tie is NOT an artefact of the bound: the control separates by fourteen orders",
       seedExperiment(PLUS_DIAGONALS).zero.gap / e.zero.gap > 1e12,
       "at the separating angles the same experiment reads " + seedExperiment(PLUS_DIAGONALS).zero.gap.toExponential(4) +
       " against " + e.zero.gap.toExponential(4) + " here -- *** A RATIO OF 6.1e14, so no choice of epsilon in " +
       "this range could turn the tie into a separation or back. THIS IS WHAT PAYS FOR THE LOOSENED BOUND ABOVE ***");
    ok("!! SEEDED AT A, SIRT SITS AT RESIDUAL EXACTLY ZERO", e.fromA.residual === 0,
       "residual " + e.fromA.residual.toExponential(3) + ", corr vsA " + e.fromA.vsA.toFixed(9));
    ok("!! SEEDED AT C, SIRT SITS AT RESIDUAL EXACTLY ZERO TOO", e.fromC.residual === 0,
       "residual " + e.fromC.residual.toExponential(3) + ", corr vsC " + e.fromC.vsC.toFixed(9) +
       " -- TWO DIFFERENT IMAGES EACH FITTING THE MEASURED PROJECTIONS PERFECTLY, so the answer is decided by " +
       "WHERE THE METHOD STARTS and not by the data");
    ok("...and the two fixed points really are different images", e.fromA.vsC < 0.5 && e.fromC.vsA < 0.5,
       "fromA scores " + e.fromA.vsC.toFixed(6) + " against C, fromC scores " + e.fromC.vsA.toFixed(6) + " against A");
}

// ---- 5. THE CONTROL: THE SAME EXPERIMENT, THE SEPARATING ANGLES, THE OPPOSITE ANSWER -----------------------------------
{
    const e = seedExperiment(PLUS_DIAGONALS);
    ok("!! POSITIVE CONTROL: with 45 and 135 added, seeding at C NO LONGER FITS", e.fromC.residual > 0,
       "residual " + e.fromC.residual.toExponential(3) + " against 0.000e+0 at the lattice directions -- the " +
       "fixed point is gone because the data now excludes C");
    ok("...and seeding at A still fits, so the control is about C and not about the solver", e.fromA.residual === 0,
       "residual " + e.fromA.residual.toExponential(3) + " -- A is the truth the projections came from");
    ok("...and the zero-start score now SEPARATES them", e.zero.gap > 0.1,
       "gap " + e.zero.gap.toExponential(3) + " against machine zero at the lattice directions");
}

// ---- 6. A PREDICTION OF MINE, REFUTED AND KEPT -------------------------------------------------------------------------
//
// ANTIDOTE: if a THIRD reconstructor is added, re-run section 4 against it. The claim is about what the
// projections contain, so every method must tie -- and one that does not is either wrong or has smuggled in a
// prior, which is exactly the distinction this arc exists to keep visible.
{
    const e = seedExperiment(LATTICE_ANGLES);
    ok("!! MY PREDICTION THAT THE ZERO-START ANSWER IS THE MEAN OF THE TWO TRUTHS IS REFUTED", e.zeroVsMean > 0.1,
       "relative departure " + e.zeroVsMean.toExponential(3) + " over the differing pixels -- minimum-norm " +
       "minimises over the WHOLE null space of the angle set, which holds far more than the one ghost " +
       "direction. THE TIE IS REAL; MY EXPLANATION OF IT WAS NOT.");
    ok("...and it is recorded rather than quietly dropped", (MEASURED_V3613.refutedPrediction || "").includes("NOT the mean"),
       "a prediction that fails is worth more written down than deleted");
    ok("the ct DEVICE is deliberately unchanged", (MEASURED_V3613.notClaimed || "").includes("not changed"),
       "adding an observable moves lab-results, which is Keith's call; this ships as a bench module with a page row");
    const rep = reportLines();
    ok("the report renders and names the fixed points", rep.length > 15 && rep.join("\n").includes("FIXED POINTS"), rep.length + " lines");
}

// ---- v3903: THE TWO STEP CONSTANTS, WHICH THIS GATE HAD NEVER NAMED --------------------------------------------
// definitionGates-selfcheck found stepForMatched and stepForUnmatched unmentioned here. They are one line each
// and they are the arithmetic the v3846 split rests on -- "THE TWO HALVES MOVE TOGETHER OR NEITHER MOVES" is
// stated in sirt.mjs's own comment and was, until now, checked by nothing.
{
    const N = 24, nDet = 24, angles = angleSet(24);
    const m = stepForMatched(N, angles, nDet, {});
    const u = stepForUnmatched(N, angles, nDet, {});

    // LANDWEBER CONVERGES IFF 0 < step < 2 / lambda_max. Both land on exactly HALF that ceiling -- not
    // approximately, and not by a tolerance: the ratio is 0.500000000000 for each.
    const ceilM = 2 / m.lambdaMax, ceilU = 2 / u.lambdaMax;
    ok("!! both steps sit at EXACTLY half the Landweber ceiling 2/lambda_max",
        Math.abs(m.step / ceilM - 0.5) < 1e-12 && Math.abs(u.step / ceilU - 0.5) < 1e-12,
        "matched " + (m.step / ceilM).toPrecision(12) + " and unmatched " + (u.step / ceilU).toPrecision(12) +
        " of their own ceilings. Half is a CHOICE and the bound is a THEOREM -- this pins the choice so a " +
        "later edit toward the ceiling cannot happen silently");

    // *** AND THE TWO OPERATORS DO NOT SHARE A CEILING, WHICH IS WHY THE STEPS ARE TWO FUNCTIONS. ***
    ok("!! the matched operator's spectral radius is 7.73x the unmatched one's, so the steps CANNOT be shared",
        m.lambdaMax / u.lambdaMax > 7 && m.step < u.step,
        "lambda_max " + m.lambdaMax.toPrecision(9) + " against " + u.lambdaMax.toPrecision(9) +
        "; step " + m.step.toPrecision(9) + " against " + u.step.toPrecision(9));

    // THE ONE THAT MAKES THE SPLIT NECESSARY RATHER THAN TIDY: keeping the OLD step while moving to the NEW
    // operator puts the iteration OUTSIDE the bound. Not slower -- divergent.
    ok("!! *** the unmatched step is 3.86x OUTSIDE the matched operator's ceiling -- pairing them DIVERGES ***",
        u.step > ceilM && u.step / ceilM > 3,
        "unmatched step " + u.step.toPrecision(9) + " against a matched ceiling of " + ceilM.toPrecision(9) +
        " = " + (u.step / ceilM).toPrecision(8) + "x. THIS IS WHAT sirt.mjs MEANS BY \"the two halves move " +
        "together or neither moves\", and until this check the sentence was prose in a comment while the two " +
        "constants it governs were named by nothing");
}

console.log(fails ? "\nsirt-selfcheck: " + fails + " FAILED" : "\nsirt-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
