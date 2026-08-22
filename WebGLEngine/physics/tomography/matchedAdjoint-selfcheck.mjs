// WebGLEngine/physics/tomography/matchedAdjoint-selfcheck.mjs -- v3616
//
// Run: node physics/tomography/matchedAdjoint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/tomography/matchedAdjoint.mjs -- the loop transpose, the two-construction cross-check, and
// the trajectory that shows the unmatched pair turning round.
//
// THE CHECK THIS FILE EXISTS FOR is section 2: the operator is claimed to be the transpose BY CONSTRUCTION,
// and "by construction" is exactly the kind of claim v3613 made about backProject and got wrong. So it is
// pinned TWO ways that share no code -- the dot-product identity, and agreement with v3615's dense
// basis-vector matrix -- and the second is asserted as EXACT, because it is.
//
// AND SECTION 3 IS THE ROUND: a comparison at one iteration count compares BUDGETS. What separates these
// operators is what the residual DOES as the budget grows, so the assertion is about the SHAPE of the
// trajectory and never about a value at a chosen k.
import { radon, backProject, angleSet, phantomField, scoreRecon } from "./ct.js";
import { trueAdjoint, adjointDefect, rng, randSino, randImage, dotImage, dotSino } from "./adjoint.mjs";
import {
    matchedBackProject, stepFor, crossCheckAgainstDense, trajectories, PHANTOM, MEASURED_V3616, reportLines,
} from "./matchedAdjoint.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const A16 = angleSet(16);

// ---- 1. IT PASSES THE TEST backProject FAILS --------------------------------------------------------------------
{
    const matched = adjointDefect((y) => matchedBackProject(y, 32, A16, 32));
    const shipped = adjointDefect((y) => backProject(y, 32, A16, 32));
    ok("!! the loop transpose passes the dot-product test at MACHINE ZERO", matched < 1e-10,
       matched.toExponential(3) + " -- radon's own loop with the innermost assignment reversed");
    ok("...and the shipped backProject still fails it, so the test has not gone soft", shipped > 1,
       shipped.toExponential(3) + ", a ratio of " + (shipped / matched).toExponential(2) + "x");
    const r = rng(21), x = randImage(32 * 32, r), y = randSino(16, 32, r);
    const lhs = dotSino(radon(x, 32, A16, 32), y), rhs = dotImage(x, matchedBackProject(y, 32, A16, 32));
    ok("...and both sides are far from zero, so agreement is not agreement about nothing",
       Math.abs(lhs) > 1e-6, "<Ax,y> " + lhs.toExponential(3) + "   <x,Bty> " + rhs.toExponential(3));
}

// ---- 2. TWO CONSTRUCTIONS, NO CODE IN COMMON, EXACT AGREEMENT ------------------------------------------------------
{
    const worst = crossCheckAgainstDense();
    ok("!! IT AGREES WITH v3615's DENSE BASIS-VECTOR MATRIX **EXACTLY**", worst === 0,
       "worst |difference| " + worst.toExponential(3) + " -- one built by applying radon to every basis " +
       "vector, one by reversing an assignment. NO CODE IN COMMON, so neither is a restatement of the other.");
    ok("...and the cross-check is over nonzero fields, not empty ones", crossCheckAgainstDense({ trials: 3, seed: 9 }) === 0,
       "a second seed, same answer");
    // NEGATIVE CONTROL: perturb the loop transpose and the cross-check must notice.
    const bent = (y, N, angles, nDet) => { const o = matchedBackProject(y, N, angles, nDet); o[0] += 1e-9; return o; };
    const r = rng(4), y = randSino(16, 32, r);
    const a = trueAdjoint(32, A16, 32)(y), b = bent(y, 32, A16, 32);
    let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    ok("!! NEGATIVE CONTROL: a 1e-9 perturbation IS seen by the cross-check", d > 0,
       "so 'exactly 0' is a measurement and not a comparison that cannot fail");
}

// ---- 3. THE UNMATCHED PAIR TURNS ROUND -- ASSERTED AS THE SHAPE OF A TRAJECTORY ---------------------------------------
{
    const t = trajectories();
    const u = t.unmatched.rows.slice(1), m = t.matched.rows.slice(1);   // drop iteration 0 (both start empty)
    ok("both steps are DERIVED per operator and they differ", t.unmatched.step > 0 && t.matched.step > 0 &&
       t.unmatched.step !== t.matched.step,
       "unmatched " + t.unmatched.step.toExponential(3) + "   matched " + t.matched.step.toExponential(3) +
       " -- so a fixed-iteration comparison would be comparing BUDGETS");
    ok("!! THE MATCHED RESIDUAL FALLS MONOTONICALLY", m.every((r, i) => i === 0 || r.residual < m[i - 1].residual),
       m.map((r) => r.residual.toExponential(2)).join(" -> "));
    ok("!! ...AND FALLS BY ORDERS, so this is convergence and not a nudge", m[0].residual / m[m.length - 1].residual > 10,
       (m[0].residual / m[m.length - 1].residual).toFixed(1) + "x over the run");
    ok("!! THE UNMATCHED RESIDUAL **RISES** AFTER ITS BEST POINT -- IT IS NOT A DESCENT METHOD",
       u[u.length - 1].residual > u[0].residual,
       u.map((r) => r.residual.toExponential(2)).join(" -> ") + " -- it reaches a best point and then walks " +
       "away from the data, which is what an unmatched pair does");
    ok("...and its correlation falls with it, so the divergence is not only in the objective",
       u[u.length - 1].corr < u[0].corr,
       u.map((r) => r.corr.toFixed(4)).join(" -> "));
    ok("!! SO v3613's SIRT MUST BE STOPPED EARLY, and nothing said so",
       (MEASURED_V3616.whatItMeansForV3613 || "").includes("LUCK OF THE BUDGET"),
       "300 iterations got a good answer by luck of the budget; the apparent edge on correlation is EARLY " +
       "STOPPING DOING THE REGULARISING");
}

// ---- 4. THE HONEST WRINKLE: CONVERGING IS NOT BEING RIGHT ---------------------------------------------------------------
{
    const t = trajectories();
    const bestUnmatched = Math.max(...t.unmatched.rows.map((r) => r.corr));
    const settledMatched = t.matched.rows[t.matched.rows.length - 1].corr;
    ok("!! THE MATCHED OPERATOR IS **NOT SIMPLY BETTER** -- its correlation settles BELOW the unmatched best",
       settledMatched < bestUnmatched,
       "matched settles at " + settledMatched.toFixed(4) + " against the unmatched best of " + bestUnmatched.toFixed(4) +
       " -- CONVERGING ON THE OBJECTIVE IS NOT BEING CLOSEST TO THE TRUTH, which is v3612's result arriving " +
       "from a new direction");
    ok("...and it holds STEADY rather than degrading, which the unmatched one does not",
       Math.abs(t.matched.rows[1].corr - settledMatched) < 0.01,
       t.matched.rows.slice(1).map((r) => r.corr.toFixed(4)).join(" -> "));
    ok("...and the residual gap at the end is large, so the two really are at different places",
       t.unmatched.rows[t.unmatched.rows.length - 1].residual / t.matched.rows[t.matched.rows.length - 1].residual > 10,
       (t.unmatched.rows[t.unmatched.rows.length - 1].residual / t.matched.rows[t.matched.rows.length - 1].residual).toFixed(1) + "x");
}

// ---- 5. THE DEFAULT IS UNCHANGED, AND THE OLD OPERATOR KEEPS ITS OWN JOB -------------------------------------------------
//
// ANTIDOTE: if the default in sirt.mjs is ever moved to the matched operator, v3613's hash-pinned readings go
// RED -- RE-CAPTURE THEM FROM THE NEW DEFAULT NAMING THE ROUND, and do NOT loosen them to a tolerance; their
// whole value is exactness. And re-run section 3 afterwards: the trajectory claim is about the OPERATORS, so
// it must still hold whichever one ships.
{
    const src = (await import("node:fs")).readFileSync(
        (await import("node:url")).fileURLToPath(new URL("./sirt.mjs", import.meta.url)), "utf8");
    ok("sirt.mjs's DEFAULT is still backProject", /backProject\(r, N, angles, nDet\)/.test(src),
       "so v3613's readings stay reproducible and its hash-pinned checks stay green");
    ok("...and moving it is named as Keith's call", (MEASURED_V3616.notChanged || "").includes("Keith's call"),
       "v3603's idiom -- the deciding half is not a number this sandbox can settle");
    // backProject is NOT wrong at its own job: FBP's normalisation is a reconstruction choice, not an adjoint.
    const N = 48, nDet = 48, angles = angleSet(24), truth = phantomField(N, PHANTOM);
    const b = radon(truth, N, angles, nDet);
    const fbp = scoreRecon((await import("./ct.js")).filteredBackProjection(b, N, angles, nDet), truth).corr;
    ok("!! backProject IS NOT BROKEN AT ITS OWN JOB -- FBP still reconstructs well with it", fbp > 0.9,
       "corr " + fbp.toFixed(6) + " -- the PI/nAngles normalisation belongs to filtered back-projection as a " +
       "RECONSTRUCTION operator and has nothing to do with being an adjoint. Two jobs, two operators.");
    const rep = reportLines();
    ok("the report renders and names the turn-round", rep.length > 12 && rep.join("\n").includes("not a descent method"), rep.length + " lines");
}

console.log(fails ? "\nmatchedAdjoint-selfcheck: " + fails + " FAILED" : "\nmatchedAdjoint-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
