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

// ---- 7. v3906 -- THE FOUR STEPPERS, NAMED, AND THE AXIS THIS FILE ONLY EVER DESCRIBED --------------------------
//
// *** verletStep, eulerStep, semiEulerStep AND rk4Step ARE EXPORTED AND NOT ONE OF THE FOUR NAMES APPEARED IN
// THIS GATE. *** Every check above reaches them through the STEPPERS table, which is a real front door and is
// also the whole problem: a registry hides WHICH FUNCTION IS BEHIND WHICH KEY. Measured rather than argued --
// all six transpositions of the table were driven against the file as it stood at v3430:
//
//     verlet <-> euler       CAUGHT        semiEuler <-> euler    CAUGHT
//     verlet <-> rk4         CAUGHT        semiEuler <-> rk4      CAUGHT
//     euler  <-> rk4         CAUGHT        *** verlet <-> semiEuler   PASSES EVERY CHECK IN THE FILE ***
//
// ONE OF SIX IS INVISIBLE, AND IT IS INVISIBLE FOR A REASON THAT NAMES THE MISSING CHECK: the two are
// indistinguishable on the SYMPLECTIC axis, which is the only axis this file measures. Section 5 says in prose
// "ACCURACY AND SYMPLECTICITY ARE DIFFERENT AXES, and a fixture of verlet-versus-rk4 alone would let them be
// read as one" -- and then measures one of the two axes. The claim and the gap are the same sentence.
//
// *** AND A SECOND PLANT SURVIVED v3430 FOR THE SAME REASON, THIS ONE INSIDE A STEPPER RATHER THAN IN THE
// TABLE: flip the sign of explicit Euler's momentum kick, [q + dt p, p + dt q], and every check passes. *** Its
// Jacobian is [[1,dt],[dt,1]] with determinant 1 - dt^2, so `symplecticDefect` reads dt^2 -- THE SAME NUMBER AS
// THE CORRECT MAP -- and section 5's "EXACTLY dt^2" prediction is satisfied by a completely different dynamics.
// A DETERMINANT IS NOT A MAP. That is what 7b is for, and it catches this at 2.0e-1 rather than at a floor.
{
    console.log("  ----  7. THE ORDER AXIS, WHICH SECTION 5 CLAIMS IN PROSE AND NOTHING MEASURED");

    // ---- 7a. THE REGISTRY IS NOT THE DEFINITION -------------------------------------------------------------
    ok("!! the STEPPERS table is the four exported steppers themselves, by identity",
       STEPPERS.verlet === verletStep && STEPPERS.semiEuler === semiEulerStep &&
       STEPPERS.euler === eulerStep && STEPPERS.rk4 === rk4Step,
       "a registry is a front door and a registry is also a place a wire can be crossed. Identity is the cheap " +
       "half of closing that; 7b is the half that would still catch it if this line were deleted");

    // ---- 7b. EACH MAP AGAINST ITS CLOSED FORM, WHICH IS WHERE THE FOUR STOP BEING INTERCHANGEABLE ------------
    //
    // On H = (q^2 + p^2)/2 every one of these is a 2x2 MATRIX and each is exactly derivable by hand. This is
    // the strongest available statement about a stepper -- not "it has the right property" but "it is the right
    // map" -- and it is what the symplectic checks above cannot say, because two different maps can share a
    // determinant.
    const dtJ = 0.1;
    const a4 = 1 - dtJ * dtJ / 2 + Math.pow(dtJ, 4) / 24, b4 = dtJ - Math.pow(dtJ, 3) / 6;
    const CLOSED_FORM = {
        euler:     [[1, dtJ], [-dtJ, 1]],
        semiEuler: [[1 - dtJ * dtJ, dtJ], [-dtJ, 1]],
        verlet:    [[1 - dtJ * dtJ / 2, dtJ], [-dtJ + Math.pow(dtJ, 3) / 4, 1 - dtJ * dtJ / 2]],
        rk4:       [[a4, b4], [-b4, a4]],
    };
    // *** MEASURED TWICE ON PURPOSE: once through the NAMED export, which is what this section exists to grade,
    // and once through STEPPERS[k], which is what makes a crossed wire fail on the PHYSICS rather than only on
    // the identity check above. My first version compared the named exports only, and then claimed in its own
    // detail string that "a swapped registry entry fails here" -- WHICH IT DID NOT, because nothing in the
    // comparison read the registry. Driving the six transpositions is what found that; the sentence was written
    // from the armchair and the plant disagreed. ***
    const worstAgainstClosed = (get) => {
        let w = 0;
        for (const k of ["euler", "semiEuler", "verlet", "rk4"]) {
            const M = jacobian(get(k)(dtJ), z), C = CLOSED_FORM[k];
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) w = Math.max(w, Math.abs(M[i][j] - C[i][j]));
        }
        return w;
    };
    const NAMED = { euler: eulerStep, semiEuler: semiEulerStep, verlet: verletStep, rk4: rk4Step };
    const worstJ = worstAgainstClosed((k) => NAMED[k]), worstT = worstAgainstClosed((k) => STEPPERS[k]);
    ok("!! *** EACH STEPPER IS THE MATRIX IT IS SUPPOSED TO BE, NAMED ONE AT A TIME ***",
       worstJ < 1e-9,
       `worst element ${worstJ.toExponential(3)} across all sixteen entries of four matrices, against the central-` +
       `difference floor. Explicit Euler is [[1,dt],[-dt,1]], semi-implicit is [[1-dt^2,dt],[-dt,1]], velocity ` +
       `Verlet is [[1-dt^2/2, dt],[-dt+dt^3/4, 1-dt^2/2]] and RK4 is [[a,b],[-b,a]] with a and b the truncated ` +
       `cosine and sine series. THIS IS THE STRONGEST STATEMENT AVAILABLE ABOUT A STEPPER -- not "it has the ` +
       `right property" but "it is the right map", which the symplectic checks cannot say because two different ` +
       `maps can share a determinant.`);
    ok("!! ...and the SAME comparison through the registry, so a crossed wire fails on the physics",
       worstT < 1e-9,
       `worst element ${worstT.toExponential(3)} reading each map out of STEPPERS instead of by name. A ` +
       `transposition of the table moves an entire matrix, so it fails here whether or not the two entries ` +
       `share a symplectic defect`);

    // ---- 7c. THE ORDER OF EACH, BY REFINEMENT ---------------------------------------------------------------
    //
    // *** THIS IS THE MISSING AXIS AND IT IS WHAT MAKES THE 2x2 TABLE THE FILE DESCRIBES REAL. *** Both Euler
    // methods are first order and one of them is symplectic; Verlet is second order and symplectic; RK4 is
    // fourth order and is not. ALL FOUR CORNERS ARE OCCUPIED, which is the only way to show the two axes are
    // independent rather than correlated -- and it is the check the verlet/semiEuler transposition needs.
    const exactAt = (t) => [Math.cos(t), -Math.sin(t)];         // q(0)=1, p(0)=0 on the unit oscillator
    const errAt = (step, dt, T = 1) => {
        let w = [1, 0];
        const n = Math.round(T / dt);
        for (let i = 0; i < n; i++) w = step(dt)(w);
        const e = exactAt(T);
        return Math.hypot(w[0] - e[0], w[1] - e[1]);
    };
    const DTS = [0.1, 0.05, 0.025, 0.0125, 0.00625];
    const orderOf = (step) => {
        const es = DTS.map((dt) => errAt(step, dt));
        return { es, p: Math.log2(es[es.length - 2] / es[es.length - 1]) };
    };
    const ORD = { euler: orderOf(eulerStep), semiEuler: orderOf(semiEulerStep), verlet: orderOf(verletStep), rk4: orderOf(rk4Step) };
    for (const k of Object.keys(ORD))
        console.log(`  ----  ${k.padEnd(10)} error at T = 1: ${ORD[k].es.map((e) => e.toExponential(2)).join(" -> ")}   order ${ORD[k].p.toFixed(3)}`);
    ok("!! *** THE ORDERS ARE 1, 1, 2 AND 4, MEASURED BY HALVING dt AND NOT TOLD TO THE LOOP ***",
       Math.abs(ORD.euler.p - 1) < 0.02 && Math.abs(ORD.semiEuler.p - 1) < 0.02 &&
       Math.abs(ORD.verlet.p - 2) < 0.02 && Math.abs(ORD.rk4.p - 4) < 0.02,
       `euler ${ORD.euler.p.toFixed(3)}, semiEuler ${ORD.semiEuler.p.toFixed(3)}, verlet ${ORD.verlet.p.toFixed(3)}, ` +
       `rk4 ${ORD.rk4.p.toFixed(3)}. THE 2x2 IS COMPLETE: first-order-not-symplectic (euler), first-order-symplectic ` +
       `(semiEuler), second-order-symplectic (verlet), fourth-order-not-symplectic (rk4). No pair of these can be ` +
       `read as the same axis, which is exactly what section 5 asserted in prose and could not show.`);
    // and the discriminator is asserted THROUGH THE TABLE, because that is where the invisible swap lives.
    const pTable = { verlet: orderOf(STEPPERS.verlet).p, semiEuler: orderOf(STEPPERS.semiEuler).p };
    ok("!! ...and THIS is what the one invisible transposition needed",
       ORD.verlet.p - ORD.semiEuler.p > 0.9 && Math.abs(pTable.verlet - 2) < 0.02 && Math.abs(pTable.semiEuler - 1) < 0.02,
       `verlet is order ${ORD.verlet.p.toFixed(3)} against semiEuler's ${ORD.semiEuler.p.toFixed(3)} -- a whole order ` +
       `apart, while their symplectic defects are ${symplecticDefect(verletStep(0.1), z).toExponential(2)} and ` +
       `${symplecticDefect(semiEulerStep(0.1), z).toExponential(2)}, both at the floor. THE REGISTRY SWAP THAT ` +
       `PASSED EVERY CHECK IN THIS FILE MOVES THESE TWO NUMBERS, so it cannot pass any more.`);

    // ---- 7d. WHY RK4 SINKS UNDER THE FLOOR, WITH A NUMBER INSTEAD OF "VANISHES INTO THE NOISE" ---------------
    //
    // *** SECTION 6 IS RIGHT AND IT IS QUALITATIVE. THE DEFECT IS NOT MERELY SMALL, IT IS EXACTLY dt^6/72. ***
    // RK4 on this Hamiltonian advances z by the TRUNCATED SERIES of exp(i dt), so its determinant is
    // a^2 + b^2 with a = 1 - dt^2/2 + dt^4/24 and b = dt - dt^3/6, and that expands EXACTLY:
    //
    //         det = 1 - dt^6/72 + dt^8/576
    //
    // No truncation, no fitting -- it is a polynomial identity, and the dt^8 term is why the ratio below
    // approaches 1 from underneath as 1 - dt^2/8 rather than sitting on it.
    const detOf = (M) => M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const rk4Det = (dt) => { const a = 1 - dt * dt / 2 + Math.pow(dt, 4) / 24, b = dt - Math.pow(dt, 3) / 6; return a * a + b * b; };
    const RD = [0.4, 0.2, 0.1, 0.05].map((dt) => ({
        dt,
        ratio: (rk4Det(dt) - 1) / (-(Math.pow(dt, 6)) / 72),
        shortfall: (1 - (rk4Det(dt) - 1) / (-(Math.pow(dt, 6)) / 72)) / (dt * dt),
        numeric: detOf(jacobian(rk4Step(dt), z)) - 1,
    }));
    console.log("  ----  rk4 det - 1 against -dt^6/72:   " + RD.map((r) => `dt ${r.dt}: ${r.ratio.toFixed(8)}`).join(",  "));
    ok("!! *** RK4 CONTRACTS PHASE-SPACE VOLUME BY EXACTLY dt^6/72 PER STEP ***",
       RD.every((r) => Math.abs(r.shortfall - 0.125) < 1e-3) && rk4Det(0.1) - 1 < 0,
       `the ratio is ${RD.map((r) => r.ratio.toFixed(5)).join(", ")} and the SHORTFALL FROM 1 IS dt^2/8 EVERY TIME ` +
       `(${RD.map((r) => r.shortfall.toFixed(6)).join(", ")}), which is the dt^8/576 term and nothing else. ` +
       `*** SECTION 6 SAYS RK4'S DEFECT "VANISHES INTO THE NOISE"; THIS SAYS WHERE. It crosses verlet's ` +
       `central-difference floor of ~1e-11 at dt near 0.03, so a check at any smaller step certifies RK4 as ` +
       `symplectic -- and now the reason is a power law rather than an observation about one run. ***`);
    ok("...and the numerical Jacobian agrees with that polynomial at a step where it can still be seen",
       Math.abs(RD[2].numeric - (rk4Det(0.1) - 1)) < 1e-10,
       `at dt = 0.1 the measured defect is ${RD[2].numeric.toExponential(3)} against the polynomial's ` +
       `${(rk4Det(0.1) - 1).toExponential(3)}. Below that the central difference is the larger of the two errors, ` +
       "which is section 6's point arriving from the other side");

    // ---- 7e. THE CONSEQUENCE ELEVEN FILES ACTUALLY RELY ON ---------------------------------------------------
    //
    // *** NONE OF THE ABOVE IS WHY ANYBODY CARES. *** A one-step determinant is a proxy; what a simulation
    // depends on is that the energy does not walk away over a long run. So: 20,000 steps at dt = 0.05 -- about
    // 159 periods -- and the two determinants become two PREDICTIONS with no free parameter, because both the
    // Euler and the RK4 maps are a rotation times a scalar, so H scales by the determinant every step.
    const LONG = 20000, dtL = 0.05;
    const band = (step) => {
        let w = [1, 0], lo = Infinity, hi = -Infinity;
        for (let i = 0; i < LONG; i++) { w = step(dtL)(w); const h = H(w); if (h < lo) lo = h; if (h > hi) hi = h; }
        return { lo, hi, end: H(w) };
    };
    const B = { euler: band(eulerStep), semiEuler: band(semiEulerStep), verlet: band(verletStep), rk4: band(rk4Step) };
    const predEuler = 0.5 * Math.pow(1 + dtL * dtL, LONG), predRk4 = 0.5 * Math.pow(rk4Det(dtL), LONG);
    for (const k of Object.keys(B))
        console.log(`  ----  ${k.padEnd(10)} H after ${LONG} steps: ${B[k].end.toExponential(6)}   band [${B[k].lo.toExponential(4)}, ${B[k].hi.toExponential(4)}]`);
    ok("!! *** EXPLICIT EULER'S ENERGY IS H0 (1 + dt^2)^N EXACTLY -- 21 ORDERS OF MAGNITUDE IN 159 PERIODS ***",
       Math.abs(B.euler.end / predEuler - 1) < 1e-9,
       `${B.euler.end.toExponential(6)} against a predicted ${predEuler.toExponential(6)}, agreeing to ` +
       `${Math.abs(B.euler.end / predEuler - 1).toExponential(2)}. The dt^2 defect section 5 measures ONCE is ` +
       `compounded ${LONG} times here, and that compounding is the actual reason a solver cannot use this method.`);
    // *** AND THE TWO PREDICTIONS SEPARATE HERE, WHICH IS THE dt^8 TERM BECOMING VISIBLE. *** The exact
    // determinant compounded 20,000 times agrees to 1e-12; the dt^6/72 term ALONE is 1.4e-9 out -- small, and
    // exactly N * dt^8/576. A leading-order prediction is not the same claim as an exact one, and over a long
    // enough run the difference is measurable rather than philosophical.
    const predRk4Leading = 0.5 * Math.pow(1 - Math.pow(dtL, 6) / 72, LONG);
    ok("!! *** AND RK4 IS DISSIPATIVE, BY THE SAME ARITHMETIC WITH THE OTHER SIGN: H0 det^N, det < 1 ***",
       Math.abs(B.rk4.end / predRk4 - 1) < 1e-9 && B.rk4.end < 0.5 &&
       Math.abs(B.rk4.end / predRk4Leading - 1) > 1e-10,
       `${B.rk4.end.toExponential(8)} against a predicted ${predRk4.toExponential(8)}, agreeing to ` +
       `${Math.abs(B.rk4.end / predRk4 - 1).toExponential(2)} -- while the LEADING TERM alone (1 - dt^6/72)^N is ` +
       `${Math.abs(B.rk4.end / predRk4Leading - 1).toExponential(2)} out, which is the dt^8/576 term compounded ` +
       `${LONG} times and is why the exact polynomial was worth deriving. ` +
       `*** RK4 DOES NOT MERELY FAIL TO PRESERVE ENERGY, IT REMOVES IT, MONOTONICALLY AND FOREVER. ` +
       `A fourth-order method that loses energy slower than a second-order one preserves it is the trade the ` +
       `eleven files saying "symplectic" are making, and this is the first place in the tree it is a number. ***`);
    ok("!! ...while BOTH symplectic steppers stay in a BOUNDED BAND, which is the whole property",
       B.verlet.hi - B.verlet.lo < 0.01 && B.semiEuler.hi - B.semiEuler.lo < 0.05 &&
       B.verlet.lo > 0.49 && B.semiEuler.lo > 0.48,
       `verlet oscillates inside ${((B.verlet.hi - B.verlet.lo) * 200).toFixed(2)}% of H0 and semi-implicit Euler ` +
       `inside ${((B.semiEuler.hi - B.semiEuler.lo) * 200).toFixed(2)}%, NEITHER DRIFTING, over the same 159 ` +
       `periods that take explicit Euler to 1e21. The band is wider for the first-order method and it is still a ` +
       `BAND -- bounded-versus-growing is the symplectic property, and it is a different statement from accuracy.`);
}

console.log(fails ? "\npoisson-selfcheck: " + fails + " FAILED" : "\npoisson-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
