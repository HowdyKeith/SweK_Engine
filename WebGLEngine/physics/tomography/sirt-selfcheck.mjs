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
    sirt, stepFor, residual, methodGain, seedExperiment, PHANTOM, MEASURED_V3613, reportLines,
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

// ---- 2. IT CONVERGES, AND THE RESIDUAL IS THE THING THAT FALLS -------------------------------------------------------
{
    const N = 48, nDet = 48, angles = angleSet(24);
    const truth = phantomField(N, PHANTOM), b = radon(truth, N, angles, nDet);
    const r = sirt(b, N, angles, nDet, { iters: 200, every: 25 });
    const h = r.history.map((e) => e.residual);
    ok("the residual falls at every checkpoint", h.every((v, i) => i === 0 || v <= h[i - 1]),
       h.map((v) => v.toExponential(2)).join(" -> "));
    ok("...and it falls a long way, so this is convergence and not a nudge", h[0] / h[h.length - 1] > 10,
       (h[0] / h[h.length - 1]).toExponential(2) + "x -- asserted as a RATIO of its own first reading");
    ok("the reconstruction is a good match to the truth it was built from", scoreRecon(r.x, truth).corr > 0.9,
       "corr " + scoreRecon(r.x, truth).corr.toFixed(6) + " against the ellipse phantom the device owns");
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
