// WebGLEngine/physics/tomography/adjoint-selfcheck.mjs -- v3615
//
// Run: node physics/tomography/adjoint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/tomography/adjoint.mjs -- the dot-product test, the scalar fit, and the cost measurement.
//
// THE CHECK THIS FILE EXISTS FOR is the POSITIVE CONTROL in section 1. "backProject is not the transpose" is
// a claim that a test FAILED, and a failing test proves nothing until the same test is shown PASSING on
// something that should pass. The control is the transpose OF THE SHIPPED radon, built by applying it to
// every basis vector -- not a textbook adjoint, because a mismatch against a textbook could always be blamed
// on the textbook.
//
// AND SECTION 5 IS THE ONE THAT MATTERS FOR THE ARC: v3613's central result is re-proved WITHOUT the adjoint,
// by driving the fixed point with a DELIBERATELY ABSURD backprojector.
import { radon, backProject, angleSet, phantomField, scoreRecon } from "./ct.js";
import { binaryPair, PAIR, LATTICE_ANGLES } from "./ambiguity.mjs";
import {
    dotImage, dotSino, rng, randImage, randSino, trueAdjoint, adjointDefect, scalarFit, costOfMismatch,
    MEASURED_V3615, reportLines,
} from "./adjoint.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const A16 = angleSet(16);

// ---- 1. THE TEST CAN PASS, SHOWN ON THE TRANSPOSE OF THE OPERATOR ACTUALLY UNDER TEST ----------------------------------
{
    const control = adjointDefect(trueAdjoint(32, A16, 32));
    ok("!! POSITIVE CONTROL: the TRUE transpose of the SHIPPED radon reads MACHINE ZERO", control < 1e-10,
       control.toExponential(3) + " -- built by applying radon to every basis vector, so it is the transpose " +
       "OF THE OPERATOR UNDER TEST rather than of a textbook one");
    const shipped = adjointDefect((y) => backProject(y, 32, A16, 32));
    ok("!! ...and the SHIPPED backProject DOES NOT", shipped > 1,
       shipped.toExponential(3) + " -- the defect is larger than the inner product itself, so this is not " +
       "'slightly off'");
    ok("...and the two differ by orders, asserted as a RATIO rather than against a threshold I chose",
       shipped / control > 1e10, (shipped / control).toExponential(2) + "x");
}

// ---- 2. NO SCALAR REPAIRS IT ------------------------------------------------------------------------------------------
{
    const f = scalarFit();
    ok("the two inner products are strongly CORRELATED, so backProject is not nonsense", f.correlation > 0.5,
       "correlation " + f.correlation.toFixed(6) + " over " + f.trials + " random pairs");
    ok("!! ...but NO SCALAR MULTIPLE REPAIRS IT", f.residualAfterScaling > 0.1,
       "best scalar " + f.bestScalar.toFixed(6) + " still leaves " + (100 * f.residualAfterScaling).toFixed(1) +
       "% relative -- so the mismatch is not a missing constant");
    ok("...and the best scalar is not the scale backProject already applies", Math.abs(f.bestScalar - Math.PI / 16) > 1,
       "c = " + f.bestScalar.toFixed(6) + " against PI/nAngles = " + (Math.PI / 16).toFixed(6));
}

// ---- 3. THE MISMATCH IS STRUCTURAL, AND THE COST FALLS ON THE OBJECTIVE ------------------------------------------------
{
    const c = costOfMismatch();
    ok("!! the TRUE gradient descends FURTHER on the objective", c.trueAdjoint.residual < c.shipped.residual,
       "residual " + c.trueAdjoint.residual.toExponential(3) + " against " + c.shipped.residual.toExponential(3) +
       " -- " + (c.shipped.residual / c.trueAdjoint.residual).toFixed(1) + "x, and the residual is the thing " +
       "the iteration CLAIMS to minimise");
    ok("!! ...while the correlation to truth BARELY MOVES", Math.abs(c.trueAdjoint.corr - c.shipped.corr) < 0.01,
       c.trueAdjoint.corr.toFixed(6) + " against " + c.shipped.corr.toFixed(6) +
       " -- WHICH IS WHY IT SURVIVED UNNOTICED: every observable v3613 reported was insensitive to it");
    ok("...and both still beat FBP, so neither is broken", c.shipped.corr > c.fbp.corr && c.trueAdjoint.corr > c.fbp.corr,
       "FBP " + c.fbp.corr.toFixed(6));
}

// ---- 4. THE DOT-PRODUCT TEST IS THE REAL ONE, NOT A RESHAPING ACCIDENT --------------------------------------------------
{
    const r = rng(11), x = randImage(32 * 32, r), y = randSino(16, 32, r);
    const adj = trueAdjoint(32, A16, 32);
    const lhs = dotSino(radon(x, 32, A16, 32), y), rhs = dotImage(x, adj(y));
    ok("the two sides are both far from zero, so agreement is not agreement about nothing",
       Math.abs(lhs) > 1e-6 && Math.abs(rhs) > 1e-6,
       "<Ax,y> " + lhs.toExponential(3) + "   <x,A^T y> " + rhs.toExponential(3));
    const bad = (yy) => { const o = adj(yy); const c = Float64Array.from(o); c[0] += 1e3; return c; };
    ok("!! POSITIVE CONTROL: perturbing the control adjoint by one entry FAILS the test", adjointDefect(bad) > 1e-6,
       "so the test is sensitive to a single wrong number, not just to gross mismatch");
}

// ---- 5. THE ARC'S CENTRAL RESULT NEVER DEPENDED ON THE ADJOINT, AND HERE IS THE PROOF -----------------------------------
//
// v3613 read the seeded fixed points as a fact about SIRT. They are a fact about THE DATA: at either truth
// b - A x is EXACTLY zero, so the update is B(0) = 0 for ANY B. Driven with a deliberately absurd operator.
{
    const { N, nDet } = PAIR, { a, c } = binaryPair(), b = radon(a, N, LATTICE_ANGLES, nDet);
    // THE OPERATOR MUST BE ABSURD **AND LINEAR**, AND MY FIRST VERSION WAS NEITHER USEFUL NOR HONEST. It
    // returned a CONSTANT vector ignoring its input, so B(0) was not zero and I had to SHORT-CIRCUIT the
    // update when the residual was all-zero -- which made the check pass BY MY OWN CODE rather than by the
    // maths. A QUESTION WHOSE ANSWER IS STRUCTURALLY GUARANTEED IS NOT EVIDENCE, this tree's own rule, and I
    // wrote one into the section proving the arc's central result. The claim is "for any LINEAR B, B(0) = 0",
    // so the fixture is a real backprojector with a scrambling diagonal: absurd, plainly not an adjoint, and
    // LINEAR -- and the short-circuit is gone, so the operator really is called with the zero residual.
    const absurd = (y) => { const bp = backProject(y, N, LATTICE_ANGLES, nDet); const o = new Float64Array(bp.length);
        for (let i = 0; i < bp.length; i++) o[i] = bp[i] * ((i % 7) - 3); return o; };
    const step = (x0, adj) => {
        const x = Float64Array.from(x0);
        for (let k = 0; k < 5; k++) {
            const ax = radon(x, N, LATTICE_ANGLES, nDet);
            const r = ax.map((p, i) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = b[i][d] - p[d]; return q; });
            const g = adj(r);
            for (let j = 0; j < x.length; j++) x[j] += 0.001 * g[j];
        }
        return x;
    };
    const fromA = step(a, absurd), fromC = step(c, absurd);
    ok("!! SEEDED AT A, AN ABSURD BACKPROJECTOR STILL LEAVES IT EXACTLY WHERE IT STARTED",
       fromA.every((v, i) => v === a[i]), "because b - A x is EXACTLY zero there, so the update is B(0) = 0");
    ok("!! ...AND SEEDED AT C TOO", fromC.every((v, i) => v === c[i]),
       "SO THE FIXED-POINT RESULT IS A FACT ABOUT THE DATA, NOT ABOUT SIRT -- it holds for EVERY method of " +
       "this shape, and v3613's central finding never depended on the adjoint at all");
    ok("...and the two seeds really are different images", !fromA.every((v, i) => v === c[i]),
       "so the check is not passing because the pair collapsed");
    // AND THE OPERATOR IS SHOWN TO BE CAPABLE OF MOVING SOMETHING, or "it did not move" proves nothing.
    const off = Float64Array.from(a); off[0] += 0.5;
    ok("!! POSITIVE CONTROL: the same absurd operator DOES move a point that does NOT fit the data",
       !step(off, absurd).every((v, i) => v === off[i]),
       "so the two results above are about b - A x being EXACTLY zero, not about a dead operator");
    ok("the correction to v3613 is recorded rather than quietly applied",
       (MEASURED_V3615.v3613Corrected || "").includes("A^T A"),
       "'backProject is A^T' and 'power iteration on A^T A' were both wrong; sirt.mjs says so in place");
}

// ---- 6. WHAT IS NOT CLAIMED, AND THE ANTIDOTE ----------------------------------------------------------------------------
//
// ANTIDOTE: if somebody ships a MATCHED splatting backprojector, section 1's shipped reading collapses to
// machine zero -- REWRITE IT TO ASSERT THE MATCH AND NAME WHO FIXED IT, do not delete the section, because
// the property worth guarding is that the pair is checked at all. And re-run section 3: the cost measurement
// becomes a regression test on the new operator.
{
    ok("no replacement is proposed", (MEASURED_V3615.notClaimed || "").includes("DENSE MATRIX"),
       "the true adjoint is O(N^2 * nAngles * nDet) memory -- fine at 32, hopeless at the device's 96. An " +
       "INSTRUMENT for grading the shipped pair, not a shipped operator.");
    ok("the mismatch is named as STRUCTURAL rather than as a bug",
       (MEASURED_V3615.verdict || "").includes("unmatched pair"),
       "radon GATHERS by sampling, backProject SPLATS with Math.round -- real CT codes ship this on purpose");
    const rep = reportLines();
    ok("the report renders and names the control", rep.length > 15 && rep.join("\n").includes("POSITIVE CONTROL"), rep.length + " lines");
}

console.log(fails ? "\nadjoint-selfcheck: " + fails + " FAILED" : "\nadjoint-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
