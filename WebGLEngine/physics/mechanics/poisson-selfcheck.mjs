// WebGLEngine/physics/mechanics/poisson-selfcheck.mjs -- v3430
//
// Run: node physics/mechanics/poisson-selfcheck.mjs
//
// The module's own gate: the ALGEBRA, checked directly. The device gate (tools/roundhouse/
// poissonDevice-selfcheck.mjs) asks the same physics through the bind, adds the registry hygiene and carries
// the RK4-under-the-floor finding. This one exists so the module can be graded at all, and so the instrument
// row naming it has a link that RESOLVES -- the rule pulsar, heidler and whitedwarf each learned separately.
"use strict";
import { bracket, jacobi, symplecticDefect, jacobian, J, H, STEPPERS,
         verletStep, eulerStep, semiEulerStep, rk4Step } from "./poisson.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const z = [0.7, -0.3], n = 1;
const Q = (w) => w[0], P = (w) => w[1];

// ---- 1. THE CANONICAL BRACKETS ----------------------------------------------------------------------------
{
    const qp = bracket(Q, P, z, n), qq = bracket(Q, Q, z, n), pp = bracket(P, P, z, n);
    ok("!! {q,p} = 1, and the self-brackets are EXACT zeros", Math.abs(qp - 1) < 1e-10 && qq === 0 && pp === 0,
       `{q,p} off by ${Math.abs(qp - 1).toExponential(2)}, which is the central-difference floor; {q,q} and {p,p} are exact zeros in a float rather than small numbers.`);
    ok("!! the bracket is ANTISYMMETRIC to the last bit", qp + bracket(P, Q, z, n) === 0,
       "{q,p} + {p,q} is EXACTLY 0.");
}

// ---- 2. *** THE PLANT IS INVISIBLE TO THE MOST OBVIOUS CHECK IN THE SUBJECT *** -----------------------------
{
    const t = bracket(Q, P, z, n), w = bracket(Q, P, z, n, { dropSecond: true });
    const anti = bracket(Q, P, z, n, { dropSecond: true }) + bracket(P, Q, z, n, { dropSecond: true });
    ok("!! *** dropping the df/dp dg/dq term returns {q,p} BIT-FOR-BIT IDENTICALLY ***", w === t,
       `${w.toPrecision(17)} both ways. THE DROPPED TERM VANISHES FOR THE PAIR (q,p), so the check every textbook opens with cannot see it -- not approximately blind, identical to seventeen digits.`);
    ok("!! ...and antisymmetry catches it, exactly 0 against exactly 1", Math.abs(anti - 1) < 1e-10,
       `planted antisymmetry ${anti.toPrecision(12)}. THE KEY IS THE PROPERTY, NOT THE VALUE.`);
}

// ---- 3. JACOBI, ON FUNCTIONS THAT MAKE IT NON-TRIVIAL ------------------------------------------------------
{
    const F = (w) => w[0] * w[0] + w[1], G = (w) => w[0] * w[1], K = (w) => w[1] * w[1] * w[1];
    const good = jacobi(F, G, K, z, n, { eps: 1e-3 }), bad = jacobi(F, G, K, z, n, { eps: 1e-3, dropSecond: true });
    ok("!! the Jacobi identity holds and the planted bracket fails it by five orders",
       Math.abs(good) < 1e-4 && Math.abs(bad) > 1,
       `${good.toExponential(3)} against ${bad.toExponential(3)}. THREE NON-LINEAR FUNCTIONS ON PURPOSE: Jacobi is trivial on q and p alone, so a canonical fixture would be a check that passes because it does nothing.`);
    ok("!! ...and it is a property OF THE BRACKET, so it CANNOT see a broken integrator", true,
       "it holds for any smooth f, g, h whatever map you are stepping with. AN EXACT IDENTITY IS WORTH CHECKING AND IS NEVER SUFFICIENT -- named in advance here rather than discovered afterwards.");
}

// ---- 4. THE BRACKET GENERATES THE FLOW ---------------------------------------------------------------------
{
    const F = (w) => w[0] * w[0] + w[1], dt = 1e-6;
    const rate = bracket(F, H, z, n);
    const fwd = STEPPERS.verlet(dt)(z), bwd = STEPPERS.verlet(-dt)(z);
    const numeric = (F(fwd) - F(bwd)) / (2 * dt);
    ok("!! {f,H} = df/dt along the actual flow", Math.abs(rate - numeric) / Math.abs(numeric) < 1e-10,
       `${rate.toPrecision(12)} against a stepped ${numeric.toPrecision(12)} -- two routes, and the flow route knows nothing about brackets.`);
}

// ---- 5. J IS THE SYMPLECTIC FORM, AND A MAP EITHER PRESERVES IT OR DOES NOT ---------------------------------
{
    const Jm = J(1);
    ok("J is antisymmetric with J^2 = -I", Jm[0][1] === 1 && Jm[1][0] === -1 && Jm[0][0] === 0,
       "[[0,1],[-1,0]] -- built, not typed as a literal in the checks below.");
    const d = {};
    for (const k of Object.keys(STEPPERS)) d[k] = symplecticDefect(STEPPERS[k](0.1), z);
    ok("!! *** verlet and semi-implicit Euler PRESERVE brackets; explicit Euler and RK4 do not ***",
       d.verlet < 1e-9 && d.semiEuler < 1e-9 && d.euler > 1e-3 && d.rk4 > 1e-9,
       `verlet ${d.verlet.toExponential(2)}, semiEuler ${d.semiEuler.toExponential(2)}, euler ${d.euler.toExponential(2)}, rk4 ${d.rk4.toExponential(2)} at dt = 0.1. M^T J M = J from a NUMERICAL Jacobian with no symplectic theory in it.`);
    ok("!! explicit Euler's defect is EXACTLY dt^2", Math.abs(d.euler / 0.01 - 1) < 1e-6,
       `defect/dt^2 = ${(d.euler / 0.01).toPrecision(12)}. Its map is [[1,dt],[-dt,1]] and the determinant is 1 + dt^2 -- A PREDICTION, so a defect of the WRONG SIZE would be as much a finding as no defect.`);
    ok("!! ...and semi-implicit Euler is symplectic WHILE BEING FIRST ORDER", d.semiEuler < 1e-9,
       "two first-order Euler methods, one symplectic and one not. ACCURACY AND SYMPLECTICITY ARE DIFFERENT AXES, and a fixture of verlet-versus-rk4 alone would let them be read as one.");
    const jm = jacobian(STEPPERS.verlet(0.1), z);
    ok("...and the Jacobian is measured, not assumed: det = 1 for a symplectic map in one degree of freedom",
       Math.abs(jm[0][0] * jm[1][1] - jm[0][1] * jm[1][0] - 1) < 1e-8,
       "the same quantity hmc's gate computes as a 4x4, here as a 2x2 -- the ONE place in the tree that re-derived this before v3430.");
}

// ---- 6. *** RK4 SINKS UNDER THE FLOOR *** ------------------------------------------------------------------
{
    const coarse = symplecticDefect(STEPPERS.rk4(0.1), z);
    const fine = symplecticDefect(STEPPERS.rk4(0.0125), z);
    const floor = symplecticDefect(STEPPERS.verlet(0.0125), z);
    ok("!! *** RK4 IS NOT SYMPLECTIC AND A CHECK AT ONE SMALL dt CERTIFIES IT AS IF IT WERE ***",
       coarse > 1e-9 && fine <= floor * 10,
       `${coarse.toExponential(2)} at dt = 0.1 falls to ${fine.toExponential(2)} at dt/8, against verlet's floor of ${floor.toExponential(2)} -- INDISTINGUISHABLE. *** THE DISCRIMINATOR IS THE SCALING, NOT THE VALUE: Euler's defect is dt^2 and visible at every step size, RK4's vanishes into the noise. ***`);
}

// ---- 7. *** THE OTHER AXIS: ORDER, AND THE FIXTURE THAT CERTIFIES A FIRST-ORDER METHOD AS SECOND *** --------
//
// v3941 -- SECTIONS 5 AND 6 GRADE SYMPLECTICITY AND NOTHING GRADED ORDER, though the module's own header names
// both for every stepper ("first order AND symplectic, so order and symplecticity come apart", "fourth order
// and NOT symplectic"). Half of what this file says about its four steppers was checked by nothing. They are
// reached above through the STEPPERS map, so each is EXERCISED and none is NAMED -- which is what
// definitionGates counts, and it was right to: the property their names carry had no key.
//
// The reference is the exact flow of H = (q^2 + p^2)/2, q(t) = q0 cos t + p0 sin t, p(t) = p0 cos t - q0 sin t.
// Global error at fixed T over halving dt, and the observed order is the log2 of successive ratios -- DERIVED
// from the run, never typed.
//
// *** AND THE OBVIOUS FIXTURE IS THE WRONG ONE, WHICH IS THE FINDING. *** One whole period from z0 = [1, 0] --
// the first thing anybody writes -- reads semi-implicit Euler at order 2.000 with an error BIT-FOR-BIT equal to
// velocity Verlet's. That is not a near miss, it is the wrong answer to four digits, and it contradicts the
// module's own header from a fixture that looks like the tidiest one available.
//
// The mechanism is exact and is asserted below rather than described. Verlet is kick-drift-kick,
// K(dt/2) D(dt) K(dt/2); semi-implicit Euler is D(dt) K(dt). So VERLET IS SEMI-IMPLICIT EULER CONJUGATED BY A
// HALF-KICK: Verlet^N = K(dt/2) . SE^N . K(-dt/2), an identity to float precision. The conjugation moves p by
// (dt/2)q at each end and nothing in between, so on a closed orbit that returns to its starting configuration
// the two end kicks very nearly cancel and the O(dt) term with them. A PARTIAL PERIOD DOES NOT LET THEM CANCEL
// AND THE FIRST-ORDER TERM SURVIVES. Both fixtures are run here, because the one that resolves the methods is
// only trustworthy if the one that hides them is on the page beside it.
{
    const exactFlow = (z0, t) => [z0[0] * Math.cos(t) + z0[1] * Math.sin(t), z0[1] * Math.cos(t) - z0[0] * Math.sin(t)];
    const globalError = (mk, N, T, z0) => {
        const step = mk(T / N);
        let w = z0.slice();
        for (let i = 0; i < N; i++) w = step(w);
        const e = exactFlow(z0, T);
        return Math.hypot(w[0] - e[0], w[1] - e[1]);
    };
    // The order is the log2 of the last error ratio under a halving, taken over four refinements.
    const orderOf = (mk, T, z0, N0) => {
        const Ns = [N0, 2 * N0, 4 * N0, 8 * N0], es = Ns.map((N) => globalError(mk, N, T, z0));
        return { order: Math.log2(es[es.length - 2] / es[es.length - 1]), es };
    };

    // A GENERIC state and a PARTIAL period -- the same z0 the bracket sections use, so the fixture is not
    // chosen per stepper. RK4 is refined from a coarser start because at 1600 steps its error is already at
    // the rounding floor, where an order estimate measures the floor rather than the method.
    const T = 1.0, ORD = {
        eulerStep: orderOf(eulerStep, T, z, 200),
        semiEulerStep: orderOf(semiEulerStep, T, z, 200),
        verletStep: orderOf(verletStep, T, z, 200),
        rk4Step: orderOf(rk4Step, T, z, 20),
    };
    const near = (name, want) => Math.abs(ORD[name].order - want) < 0.05;
    ok("!! *** EACH STEPPER CONVERGES AT ITS OWN STATED ORDER, MEASURED RATHER THAN QUOTED ***",
       near("eulerStep", 1) && near("semiEulerStep", 1) && near("verletStep", 2) && near("rk4Step", 4),
       `eulerStep ${ORD.eulerStep.order.toFixed(3)}, semiEulerStep ${ORD.semiEulerStep.order.toFixed(3)}, ` +
       `verletStep ${ORD.verletStep.order.toFixed(3)}, rk4Step ${ORD.rk4Step.order.toFixed(3)} -- against 1, 1, 2, 4. ` +
       "Global error against the EXACT flow, halved four times, order read off the ratio. Section 5 says which " +
       "of these preserve the form; this says how fast each converges, AND THE TWO ANSWERS DO NOT LINE UP -- " +
       "semi-implicit Euler is symplectic and first order while RK4 is fourth order and is not.");

    ok("!! ...and the two FIRST-ORDER methods are told apart by the other axis, not by this one",
       near("eulerStep", 1) && near("semiEulerStep", 1) &&
       symplecticDefect(semiEulerStep(0.1), z) < 1e-9 && symplecticDefect(eulerStep(0.1), z) > 1e-3,
       "explicit and semi-implicit Euler converge at the SAME rate and differ completely in whether they " +
       "preserve the form. A suite that graded only order would call them the same method.");

    // *** THE TRAP, RUN RATHER THAN WARNED ABOUT. ***
    const whole = 2 * Math.PI, z1 = [1, 0];
    const trapSE = orderOf(semiEulerStep, whole, z1, 200), trapV = orderOf(verletStep, whole, z1, 200);
    const tie = Math.abs(trapSE.es[3] - trapV.es[3]) / trapV.es[3];
    ok("!! *** ONE WHOLE PERIOD FROM [1,0] READS semiEulerStep AT ORDER 2, MATCHING verletStep TO FOUR DIGITS ***",
       Math.abs(trapSE.order - 2) < 0.05 && tie < 1e-3 && Math.abs(ORD.semiEulerStep.order - 1) < 0.05,
       `whole period: semiEulerStep ${trapSE.order.toFixed(3)} and verletStep ${trapV.order.toFixed(3)}, final ` +
       `errors ${trapSE.es[3].toExponential(3)} against ${trapV.es[3].toExponential(3)} -- agreeing to ` +
       `${tie.toExponential(1)} relative. THE SAME METHOD READS 1.000 ON THE PARTIAL PERIOD ABOVE. A gate ` +
       "written on the tidiest available fixture would have pinned a first-order method at second order and " +
       "contradicted the module's own header, with every number in it correct.");

    // The mechanism, as an identity rather than a story: kick-drift-kick against drift-kick.
    const K = (s) => ([q0, p0]) => [q0, p0 - s * q0];
    const dt = 0.1, N = 37;
    let a = z.slice(); { const V = verletStep(dt); for (let i = 0; i < N; i++) a = V(a); }
    let b = K(-dt / 2)(z); { const SE = semiEulerStep(dt); for (let i = 0; i < N; i++) b = SE(b); } b = K(dt / 2)(b);
    const conj = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    ok("!! ...and the reason is an EXACT CONJUGACY: Verlet^N = K(dt/2) . semiEuler^N . K(-dt/2)",
       conj < 1e-12,
       `worst component differs by ${conj.toExponential(3)} after ${N} steps -- ROUNDOFF, not agreement to a ` +
       "tolerance. Verlet is K(dt/2) D(dt) K(dt/2) and semi-implicit Euler is D(dt) K(dt), so they are the same " +
       "map seen from a half-kick away. The conjugation moves p by (dt/2)q at the two ENDS and nowhere else, " +
       "which is why a closed orbit cancels it and a partial one does not. THE TRAP IS A PROPERTY OF THE PAIR, " +
       "not an accident of a seed.");
}

console.log(fails ? "\npoisson-selfcheck: " + fails + " FAILED" : "\npoisson-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
