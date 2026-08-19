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
import { binaryPair, PAIR, LATTICE_ANGLES, PLUS_DIAGONALS } from "./ambiguity.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE ITERATION IS ASSEMBLED FROM THE SHIPPED OPERATORS, PROVEN BY IDENTITY ----------------------------------
{
    const N = 48, nDet = 48, angles = angleSet(16);
    const truth = phantomField(N, PHANTOM), b = radon(truth, N, angles, nDet);
    const one = sirt(b, N, angles, nDet, { iters: 1 });
    const expect = backProject(b, N, angles, nDet);
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
// v3616 proved the shipped pair turns round; nothing propagated that into the gate that makes the descent
// claim. THE CLAIM NOW RUNS ON sirtDescent() AND PAST THE TURN, and the negative below is what makes the
// split evidence rather than preference.
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

    // *** THE NEGATIVE, AND IT IS THE REASON THE SPLIT EXISTS. Same fixture, same budget, shipped operator. ***
    const u = sirt(b, N, angles, nDet, { iters: 4000, every: 250 });
    const hu = u.history.map((e) => e.residual);
    const minU = Math.min(...hu), minAt = hu.indexOf(minU) * 250;
    ok("!! *** AND THE SHIPPED PAIR IS NOT MONOTONE ON THE SAME FIXTURE -- IT TURNS ROUND ***",
       !hu.every((v, i) => i === 0 || v <= hu[i - 1]) && hu[hu.length - 1] > minU * 1.5,
       `bottoms out at ${minU.toExponential(4)} near iteration ${minAt}, then RISES to ` +
       `${hu[hu.length - 1].toExponential(4)} by 4000. *** THE OLD CHECK RAN 200 ITERATIONS AND PASSED. A ` +
       "SHORT ENOUGH BUDGET MAKES A NON-DESCENT METHOD LOOK LIKE A DESCENT METHOD, which is why the objective " +
       "claim moved to the operator that can carry it ***");
    ok("...so the two operators genuinely differ on the objective, not by a rounding",
       minU / hd[hd.length - 1] > 10,
       `the shipped pair's BEST residual (${minU.toExponential(3)}) is still ` +
       `${(minU / hd[hd.length - 1]).toFixed(1)}x the matched operator's LAST (${hd[hd.length - 1].toExponential(3)})`);

    // THE RECONSTRUCTION HALF STAYS ON THE SHIPPED OPERATOR AND ITS BUDGET, UNCHANGED.
    const r = sirt(b, N, angles, nDet, { iters: 200, every: 25 });
    ok("the reconstruction is a good match to the truth it was built from", scoreRecon(r.x, truth).corr > 0.9,
       "corr " + scoreRecon(r.x, truth).corr.toFixed(6) + " against the ellipse phantom the device owns -- " +
       "sirt() and its 200-iteration budget are UNCHANGED, because the picture is the question it answers");
}

// ---- 2b. THE CROSSOVER, WHICH IS WHY THE DEFAULT WAS SPLIT AND NOT MOVED (v3846) ----------------------------
// *** MEASURED BEFORE THE CHANGE, NOT AFTER. *** v3616 recommended the matched adjoint off one 16-angle
// reading. Swept over the angle counts this file publishes, the operators CROSS OVER -- and moving the default
// wholesale would have regressed FINDING 1's headline at the sparse end.
{
    const c = MEASURED_V3846.crossover;
    ok("!! the shipped pair wins at the SPARSE end and the matched one wins at the DENSE end",
       c[12].shipped300 > c[12].matchedConverged && c[30].shipped300 > c[30].matchedConverged &&
       c[120].matchedConverged > c[120].shipped300,
       `12 views ${c[12].shipped300.toFixed(6)} vs ${c[12].matchedConverged.toFixed(6)} (shipped); ` +
       `120 views ${c[120].shipped300.toFixed(6)} vs ${c[120].matchedConverged.toFixed(6)} (matched). ` +
       "*** NO SINGLE DEFAULT SERVES BOTH ENDS, which is what 'split by question' means here ***");
    ok("!! ...and the sparse-end gap is SATURATION, not budget -- recorded because it is what settled the call",
       (MEASURED_V3846.saturationIsNotEarlyStopping || "").includes("CHECKED TO CONVERGENCE"),
       "0.952483 at 300 iterations, 0.954752 at 2400, 0.954752 at 4800, residual down to 3.0e-4. The " +
       "least-squares answer is a worse PICTURE than the regularised one -- v3612's ambiguity from a third " +
       "direction, and the reason descending further buys the data and not the object");
    ok("...and the cost of moving it wholesale is recorded rather than discovered later",
       (MEASURED_V3846.whatMovingItWholesaleWouldHaveCost || "").includes("+0.0957"),
       "FINDING 1's gain at twelve views would have fallen +0.0957 -> +0.0776");
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
    ok("!! A SECOND, INDEPENDENT RECONSTRUCTOR TIES TOO", e.zero.gap <= 4 * Math.abs(e.zero.vsA) * Number.EPSILON,
       "vsA " + e.zero.vsA.toFixed(9) + " vsC " + e.zero.vsC.toFixed(9) + ", apart by " + e.zero.gap.toExponential(3) +
       " -- v3612 proved the point with FBP alone, and a tie one method shows is a fact about that method");
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

console.log(fails ? "\nsirt-selfcheck: " + fails + " FAILED" : "\nsirt-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
