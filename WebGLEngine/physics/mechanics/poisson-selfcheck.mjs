// WebGLEngine/physics/mechanics/poisson-selfcheck.mjs -- v3430
//
// Run: node physics/mechanics/poisson-selfcheck.mjs
//
// The module's own gate: the ALGEBRA, checked directly. The device gate (tools/roundhouse/
// poissonDevice-selfcheck.mjs) asks the same physics through the bind, adds the registry hygiene and carries
// the RK4-under-the-floor finding. This one exists so the module can be graded at all, and so the instrument
// row naming it has a link that RESOLVES -- the rule pulsar, heidler and whitedwarf each learned separately.
"use strict";
import { bracket, jacobi, symplecticDefect, jacobian, J, H, STEPPERS } from "./poisson.mjs";

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

console.log(fails ? "\npoisson-selfcheck: " + fails + " FAILED" : "\npoisson-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
