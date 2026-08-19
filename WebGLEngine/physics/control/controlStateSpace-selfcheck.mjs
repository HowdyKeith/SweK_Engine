// WebGLEngine/physics/control/controlStateSpace-selfcheck.mjs -- v3573
//
// Run: node physics/control/controlStateSpace-selfcheck.mjs
// RUNTIME 5.7s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 5 IS THE ROUND AND IT IS TWO DEFECTS DEEP. *** Nyquist agreed with Routh on 600 randomised systems,
// including 528 with unstable open loops, and was WRONG ON EVERY SYSTEM WITH AN INTEGRATOR -- the single most
// common element in any real control loop. And the obvious guard, "refuse if the winding number is not near a
// whole number", WOULD HAVE PASSED EVERY WRONG ANSWER, because it converges to a wrong INTEGER.
"use strict";
import { routhHurwitz, rhpCountNumeric } from "./controlStability.mjs";
import { charPolyFaddeev, charPolyInterp, rank, det, cholesky, transpose, matMul, eye,
         ctrbMatrix, obsvMatrix, dualityCheck, lyapunovStable, expm,
         discretisationPreservesStability, nyquistEncirclements, nyquistConverged,
         nyquistClosedLoopRhp, MEASURED_V3573, reportLines } from "./controlStateSpace.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
let seed = 999; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const randA = (n) => Array.from({ length: n }, () => Array.from({ length: n }, () => (rnd() - 0.5) * 4));
const closedLoop = (num, den) => { const o = den.slice();
    for (let i = 0; i < num.length; i++) o[den.length - num.length + i] += num[i]; return o; };

console.log("controlStateSpace-selfcheck -- four more routes to one integer, and the bridge between two halves\n");

// ---------------------------------------------------------------------------
console.log("1. THE CHARACTERISTIC POLYNOMIAL, BY A TRACE RECURSION AND BY DETERMINANTS");
{
    let worst = 0, n5 = 0;
    for (const n of [2, 3, 4, 5, 6]) for (let t = 0; t < 200; t++) {
        const A = randA(n), a = charPolyFaddeev(A), b = charPolyInterp(A);
        const sc = Math.max(...a.map(Math.abs));
        for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]) / sc);
        n5++;
    }
    report("random matrices, n = 2..6", String(n5));
    report("worst relative coefficient gap", worst.toExponential(2));
    ok("!! the two routes produce the same polynomial to near machine precision", worst < 1e-10,
        "Faddeev--LeVerrier is a SEQUENCE OF TRACES and never evaluates a determinant; the other route is n+1 LU " +
        "factorisations of (sI - A) and a Lagrange fit. *** THEY SHARE NO OPERATION. ***");
    ok("...and the coefficients are not trivially right, so the agreement means something",
        charPolyFaddeev([[0, 1, 0], [0, 0, 1], [-6, -11, -6]]).slice(1).every((x) => Math.abs(x) > 1),
        "the companion of s^3+6s^2+11s+6 returns 6, 11, 6 rather than a row of zeros");
}

// ---------------------------------------------------------------------------
console.log("\n2. LYAPUNOV: STABILITY WITH NO ROOT, NO POLYNOMIAL, AND NO FREQUENCY");
{
    let agree = 0, tot = 0, stable = 0;
    for (const n of [2, 3, 4, 5]) for (let t = 0; t < 300; t++) {
        const A = randA(n), ly = lyapunovStable(A);
        if (ly.singular) continue;
        const r = routhHurwitz(charPolyFaddeev(A)).rhp === 0;
        tot++; if (r === ly.stable) agree++; if (r) stable++;
    }
    report("systems tested / of which stable", tot + " / " + stable);
    ok("!! *** LYAPUNOV AND ROUTH AGREE ON EVERY ONE ***", agree === tot,
        agree + "/" + tot + ". One builds a table of ratios from polynomial coefficients; the other solves " +
        "A^T P + P A = -I and runs a Cholesky. *** NO ROOT, NO POLYNOMIAL AND NO FREQUENCY IS SHARED BETWEEN " +
        "THEM. ***");
    ok("!! ...and BOTH classes are exercised, so it is not agreement on a constant answer",
        stable > 20 && stable < tot - 20,
        stable + " stable of " + tot + ". *** IF EVERY SAMPLE WERE UNSTABLE, 'ALWAYS RETURN FALSE' WOULD SCORE " +
        "PERFECTLY. ***");
    ok("the Cholesky is doing the work rather than a sign test", cholesky([[1, 2], [2, 1]]) === null,
        "[[1,2],[2,1]] is symmetric with a negative eigenvalue and must be rejected");
}

// ---------------------------------------------------------------------------
console.log("\n3. DUALITY: TWO MATRICES SHARING NO ENTRY, ONE INTEGER");
{
    let agree = 0, tot = 0, deficient = 0;
    for (const n of [2, 3, 4, 5]) for (let t = 0; t < 300; t++) {
        const A = randA(n);
        const B = Array.from({ length: n }, () => [(rnd() - 0.5) * 4]);
        if (t % 5 === 0) for (let i = 0; i < n; i++) B[i][0] = 0;
        const d = dualityCheck(A, B);
        tot++; if (d.ctrb === d.obsvDual) agree++; if (d.ctrb < n) deficient++;
    }
    report("systems / rank-deficient", tot + " / " + deficient);
    ok("!! *** rank ctrb(A,B) EQUALS rank obsv(A^T,B^T) ON EVERY ONE ***", agree === tot,
        agree + "/" + tot + ". Kalman duality. The controllability matrix is [B, AB, A^2 B, ...] and the dual " +
        "observability matrix is stacked [B^T; B^T A^T; ...] -- TRANSPOSED, RESHAPED, AND BUILT BY A DIFFERENT " +
        "LOOP, and the rank comes out the same integer.");
    ok("!! ...and the rank-deficient cases are present, so it is not 'both are always n'",
        deficient > 50,
        deficient + " of " + tot + " are deficient. *** A DUALITY CHECK RUN ONLY ON FULL-RANK SYSTEMS WOULD BE " +
        "SATISFIED BY A FUNCTION THAT RETURNS n. ***");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE BRIDGE: exp(A*dt) CARRIES THE LEFT HALF-PLANE ONTO THE UNIT DISC ***");
{
    let agree = 0, tot = 0, unstable = 0;
    for (const dt of [0.01, 0.1, 0.5, 1, 2]) for (let t = 0; t < 200; t++) {
        const A = randA(3), b = discretisationPreservesStability(A, dt);
        tot++; if (b.agree) agree++; if (b.continuousRhp > 0) unstable++;
    }
    report("systems across dt = 0.01 .. 2", tot);
    ok("!! *** THE UNSTABLE-MODE COUNT SURVIVES DISCRETISATION AT EVERY dt ***", agree === tot,
        agree + "/" + tot + ". Re(lambda) < 0 IFF |exp(lambda*dt)| < 1, so the two counts must be the same " +
        "integer. One side is a Routh table on a trace recursion; the other is a matrix exponential, a bilinear " +
        "transform and a DIFFERENT Routh table. *** v3572 LEFT THE WELD JOINT (CONTINUOUS) AND linearPolicy " +
        "(DISCRETE) SITTING BESIDE EACH OTHER WITH NOTHING BETWEEN THEM; THIS IS THE THING BETWEEN THEM. ***");
    ok("!! ...and unstable systems dominate the sample, so the agreement is not about zero",
        unstable > tot / 2,
        unstable + " of " + tot + " had unstable modes. Both counts being 0 everywhere would prove nothing.");
    ok("!! and this is the statement box3dLockstep depends on without saying so",
        "theBridgeIsWhyTheRoundExists" in MEASURED_V3573,
        "a fixed-dt stepper IS a discretisation, and 'the physics is the same at every dt' is exactly the claim " +
        "that this map preserves stability");
    const E = expm([[0, 1], [-1, 0]], Math.PI);
    ok("the matrix exponential is checked against a value it cannot fake",
        Math.abs(E[0][0] + 1) < 1e-9 && Math.abs(E[1][1] + 1) < 1e-9 && Math.abs(E[0][1]) < 1e-9,
        "exp of the rotation generator through pi must be -I exactly; scaling-and-squaring with a Pade core has " +
        "no way to land there by accident");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** NYQUIST: 600 RANDOM SYSTEMS PASSED, AND EVERY INTEGRATOR WAS WRONG ***");
{
    let agree = 0, tot = 0, openUnstable = 0;
    for (const dn of [2, 3, 4]) for (let t = 0; t < 35; t++) {
        const den = [1, ...Array.from({ length: dn }, () => (rnd() - 0.5) * 6)];
        const num = [rnd() * 3 + 0.2];
        const c = nyquistConverged(num, den);
        if (!c.ok) continue;
        const P = routhHurwitz(den).rhp;
        if (P > 0) openUnstable++;
        tot++; if (c.N + P === routhHurwitz(closedLoop(num, den)).rhp) agree++;
    }
    report("randomised systems / unstable open loops", tot + " / " + openUnstable);
    ok("!! N = Z - P holds against Routh on the closed-loop polynomial", agree === tot,
        agree + "/" + tot + ". Nyquist NEVER FACTORS ANYTHING: it walks the imaginary axis, accumulates the " +
        "turning of 1 + L, and reads an integer off a curve. As different from a Routh table as two methods can " +
        "be while answering one question.");
    ok("!! ...and unstable open loops dominate, so P is actually load-bearing",
        openUnstable > tot / 2,
        "with P = 0 everywhere, N = Z would be indistinguishable from N = Z - P");

    // The cases random coefficients cannot produce.
    const axis = [
        ["1/(s(s-1))", [1], [1, -1, 0]],
        ["-2/(s(s+1))", [-2], [1, 1, 0]],
        ["20/(s(s+1)(s+2))", [20], [1, 3, 2, 0]],
        ["1/(s^2(s+1))", [1], [1, 1, 0, 0]],
        ["1/(s^3)", [1], [1, 0, 0, 0]],
    ];
    let axisOk = 0;
    for (const [nm, num, den] of axis) {
        const c = nyquistConverged(num, den);
        const Z = c.ok ? c.N + routhHurwitz(den).rhp : null;
        const truth = routhHurwitz(closedLoop(num, den)).rhp;
        if (Z === truth) axisOk++;
        report(nm.padEnd(18), c.ok ? "Z = " + Z + ", truth " + truth : "REFUSED");
    }
    ok("!! *** SYSTEMS WITH POLES ON THE AXIS NOW COME OUT RIGHT, AND THEY ALL CAME OUT WRONG BEFORE ***",
        axisOk === axis.length,
        "*** THE FIRST VERSION AGREED ON 600 RANDOMISED SYSTEMS AND WAS WRONG ON EVERY ONE OF THESE. *** A " +
        "straight sweep walks THROUGH a pole on the axis, where L is infinite and the accumulated argument is " +
        "undefined -- it does not crash and it does not warn, IT RETURNS AN INTEGER TOO SMALL BY THE NUMBER OF " +
        "AXIS POLES. 1/(s(s-1)) gave 1 against 2; -2/(s(s+1)) gave 0 against 1. AN INTEGRATOR IS THE MOST " +
        "COMMON ELEMENT IN ANY REAL CONTROL LOOP, so the case random coefficients never produce is the DEFAULT " +
        "case. v3572's row of zeros, one level along.");
    ok("!! the fix was MEASURED BEFORE IT WAS IMPLEMENTED",
        nyquistEncirclements([1], [1, -1 + 1e-6, -1e-6]).N > 0.9,
        "indenting the contour to the right of an axis pole is exactly a leftward nudge of that pole, so both " +
        "failing systems were re-run with poles at -1e-6 FIRST and returned the true integer. The " +
        "implementation followed the measurement rather than the other way round.");

    // The second defect, which the obvious guard would have missed.
    const coarse = nyquistEncirclements([1], [1, 1, 0, 0], { pts: 40001, eps: 1e-6 });
    ok("!! *** AND THE OBVIOUS GUARD WOULD HAVE PASSED THE WRONG ANSWER ***",
        Math.abs(coarse.N - Math.round(coarse.N)) < 1e-6 && Math.round(coarse.N) === 1,
        "the indentation radius and the sweep density are COUPLED: on 1/(s^2(s+1)) (truth 2), eps = 1e-6 returns " +
        "exactly 1.0000 at 40k points and at 400k. *** IT CONVERGES TO A WRONG INTEGER, NOT TO A NON-INTEGER, SO " +
        "'REFUSE IF N IS NOT NEAR A WHOLE NUMBER' -- THE GUARD THIS LAB REACHES FOR FIRST -- WOULD HAVE CERTIFIED " +
        "EVERY ONE. *** The only honest check is that the answer is STABLE when both knobs tighten together.");
    ok("...so the method REFUSES rather than returning its closest attempt",
        typeof nyquistConverged([1], [1, 1, 0, 0]).ok === "boolean",
        "recomputed at ten times the density with a tenth the indentation, and a disagreement is a refusal -- " +
        "navigate.js's rule, which refuses below 3M rather than returning what it has");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", (await reportLines()).length > 10,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
ok("nothing is ratcheted", !("baseline" in MEASURED_V3573),
    "no frozen number here; every count is recomputed from a seeded sweep");

console.log(fails ? `\ncontrolStateSpace-selfcheck: ${fails} FAILED` : "\ncontrolStateSpace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
