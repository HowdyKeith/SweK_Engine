// WebGLEngine/physics/control/cartPole-selfcheck.mjs
//
// Run: node physics/control/cartPole-selfcheck.mjs
// RUNTIME 10.1s MEASURED (median of 3 -- 10361/10127/10034 -- with date(1) around the run). Dominated by the
// Riccati solves: sections 2, 6 and 9 design about fifteen regulators between them. It was 26.8s until the
// module's default step was made ten times coarser, which is faster AND more accurate -- see solveRiccati.
//
// GATES physics/control/cartPole.mjs -- the inverted pendulum and its LQR.
//
// *** THE PLANT IS THE POINT OF THIS GATE AND IT PASSES EVERY SELF-CONSISTENT CHECK. *** Linearising about the
// HANGING equilibrium instead of the upright one is one sign on gravity, and it is the exactly correct
// linearisation of the other equilibrium of the same cart-pole. The Riccati solve converges, the ARE residual is
// just as small, the closed loop is stable by BOTH stability routes, and the Kalman inequality holds on its own
// loop. Section 9 checks all of that PASSING, and then checks the one thing it cannot survive: contact with the
// real plant, where it drives the pole over in 1.36 seconds. A controller designed on the wrong model validates
// perfectly against that model, and that is what self-consistency is worth.
"use strict";
import {
    PARAMS, nonlinearDerivative, linearize, solveRiccati, areResidual, lqrGain, scalarExactP,
    DOUBLE_INTEGRATOR_K, charPoly, charPolyFaddeev, charPolyInterp, hurwitzStable, hurwitzRhpCount,
    solveLyapunov, isPositiveDefinite, lyapunovStable,
    closedLoop, loopTransferAt, returnDifferenceMin, gainMarginLower, optimalCost, simulateCost, mat,
} from "./cartPole.mjs";
import { routhHurwitz } from "./controlStability.mjs";
import fs from "node:fs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
const Q = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 10, 0], [0, 0, 0, 1]], R = [[0.1]];
const { A, B } = linearize();
const NOM = lqrGain(A, B, Q, R);

console.log("cartPole-selfcheck -- does the regulator hold the pole up, and can it prove it is allowed to?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE LINEARISATION IS DERIVED BY HAND AND CHECKED AGAINST THE NONLINEAR PLANT ***");
{
    const h = 1e-6;
    let worstA = 0, worstB = 0;
    for (let j = 0; j < 4; j++) {
        const sp = [0, 0, 0, 0], sm = [0, 0, 0, 0]; sp[j] = h; sm[j] = -h;
        const dp = nonlinearDerivative(sp, 0), dm = nonlinearDerivative(sm, 0);
        for (let i = 0; i < 4; i++) worstA = Math.max(worstA, Math.abs((dp[i] - dm[i]) / (2 * h) - A[i][j]));
    }
    const bp = nonlinearDerivative([0, 0, 0, 0], h), bm = nonlinearDerivative([0, 0, 0, 0], -h);
    for (let i = 0; i < 4; i++) worstB = Math.max(worstB, Math.abs((bp[i] - bm[i]) / (2 * h) - B[i][0]));
    ok("!! every entry of A matches dF/dx of the nonlinear dynamics", worstA < 1e-8, `worst ${worstA.toExponential(2)}`);
    ok("!! ...and every entry of B matches dF/du", worstB < 1e-12, `worst ${worstB.toExponential(2)}`);
    report("the matrices are written out algebraically in linearize(); the derivatives here are a different " +
           "computation on a different function, so agreement is evidence rather than a tautology");
    ok("the upright equilibrium really is an equilibrium", nonlinearDerivative([0, 0, 0, 0], 0).every((v) => Math.abs(v) < 1e-15));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE RICCATI SOLVER, AGAINST TWO CLOSED FORMS IT IS NEVER TOLD ***");
{
    for (const [a, b, q, r] of [[1, 1, 1, 1], [-2, 3, 5, 0.5], [0.3, 1.7, 2, 4]]) {
        const { P } = solveRiccati([[a]], [[b]], [[q]], [[r]]);
        const exact = scalarExactP(a, b, q, r);
        ok(`!! scalar a=${a} b=${b} q=${q} r=${r} matches the quadratic root`,
            Math.abs(P[0][0] - exact) / exact < 1e-9, `${P[0][0].toFixed(12)} vs ${exact.toFixed(12)}`);
    }
    // *** THE DOUBLE INTEGRATOR IS THE FAMOUS ONE. ***
    const di = lqrGain([[0, 1], [0, 0]], [[0], [1]], mat.eye(2), [[1]]);
    ok("!! xdd = u with Q = I, R = 1 gives EXACTLY K = [1, sqrt(3)]",
        Math.abs(di.K[0][0] - DOUBLE_INTEGRATOR_K[0]) < 1e-8 && Math.abs(di.K[0][1] - DOUBLE_INTEGRATOR_K[1]) < 1e-8,
        `[${di.K[0][0].toFixed(12)}, ${di.K[0][1].toFixed(12)}] vs [1, ${Math.sqrt(3).toFixed(12)}]`);

    // *** THE DIRECTION IS THE TRICK, AND GETTING IT BACKWARDS DOES NOT FAIL QUIETLY. ***
    ok("the solver converged rather than running out its horizon", NOM.converged, NOM.steps + " steps");
    report("the Riccati equation of finite-horizon LQR runs BACKWARD in time; written forward with a leading " +
           "minus -- the first thing I wrote -- it integrates AWAY from the stabilising solution and reaches -1.3e154");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE ALGEBRAIC EQUATION IS THE ANSWER KEY FOR A METHOD THAT ONLY SOLVES THE DIFFERENTIAL ONE ***");
{
    ok("!! the ARE residual is at solver precision on the cart-pole", NOM.residual < 1e-8, NOM.residual.toExponential(3));
    const di = lqrGain([[0, 1], [0, 0]], [[0], [1]], mat.eye(2), [[1]]);
    ok("!! ...and on the double integrator", di.residual < 1e-8, di.residual.toExponential(3));
    // A residual that could not grow would be decoration: perturb P and it must.
    const bad = mat.add(NOM.P, mat.scale(mat.eye(4), 1e-3));
    ok("!! SABOTAGE: nudging P by 1e-3 moves the residual by orders", areResidual(A, B, Q, R, bad) > 1e4 * NOM.residual,
        `${NOM.residual.toExponential(2)} -> ${areResidual(A, B, Q, R, bad).toExponential(2)}`);
}

// ---------------------------------------------------------------------------
console.log("\n4. *** OPEN LOOP UNSTABLE, CLOSED LOOP STABLE -- BY TWO ROUTES THAT SHARE NO ARITHMETIC ***");
{
    ok("!! the OPEN loop is unstable, which is what makes this fixture hard",
        !hurwitzStable(A) && !lyapunovStable(A),
        "char poly " + charPoly(A).map((v) => v.toFixed(4)).join(", "));
    const Acl = closedLoop(A, B, NOM.K);
    ok("!! the CLOSED loop is stable by Routh-Hurwitz", hurwitzStable(Acl),
        charPoly(Acl).map((v) => v.toFixed(4)).join(", "));
    ok("!! ...and by Lyapunov, which solves a linear system and never forms the polynomial", lyapunovStable(Acl));
    // and the Lyapunov certificate must be a real certificate
    const X = solveLyapunov(Acl);
    const resid = mat.norm(mat.add(mat.add(mat.mul(mat.T(Acl), X), mat.mul(X, Acl)), mat.eye(4)));
    ok("!! the Lyapunov solution really satisfies A'X + XA = -I", resid < 1e-9, `residual ${resid.toExponential(2)}`);
    ok("...and it is positive definite, which is the whole test", isPositiveDefinite(X));
    ok("SABOTAGE: the OPEN loop's Lyapunov solve does NOT come back positive definite",
        !(solveLyapunov(A) && isPositiveDefinite(solveLyapunov(A))));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE KALMAN RETURN-DIFFERENCE INEQUALITY: |1 + L(jw)| >= 1 AT EVERY FREQUENCY ***");
{
    const rd = returnDifferenceMin(A, B, NOM.K);
    ok("!! swept across eight decades, the minimum is at or above 1", rd.satisfiesKalman,
        `min ${rd.min.toFixed(12)} at w = ${rd.atOmega.toFixed(3)}, over ${rd.samples} frequencies`);
    ok("...and it is APPROACHED asymptotically rather than cleared by a wide margin, which is what an equality-" +
       "derived bound looks like", rd.min - 1 < 1e-3, `excess ${(rd.min - 1).toExponential(3)}`);
    report("both classical margins are corollaries of this one inequality: the Nyquist plot of an LQR loop " +
           "cannot enter the unit disc around -1, so gain can be raised without limit and phase has 60 degrees");
    // the loop transfer must be a real transfer function, not a stub
    const L1 = loopTransferAt(A, B, NOM.K, 1);
    ok("the loop transfer is finite and complex at a representative frequency",
        Number.isFinite(L1.re) && Number.isFinite(L1.im) && Math.abs(L1.im) > 1e-12,
        `L(j1) = ${L1.re.toFixed(6)} + ${L1.im.toFixed(6)}i`);
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE POSITION GAIN IS EXACTLY sqrt(Q11/R), AND THAT IS THE SAME IDENTITY ***");
{
    // The return-difference EQUALITY is (1+L(-s))R(1+L(s)) = R + G(-s)'QG(s) with G = (sI-A)^-1 B. The cart
    // position is an integrator, so G1 ~ c/s as s -> 0 and both sides are dominated by their 1/s^2 terms:
    // K1^2 c^2 R / s^2 = Q11 c^2 / s^2, hence |K1| = sqrt(Q11/R). The inequality of section 5 is this equality
    // with the right-hand side dropped, so the two keys are one result read at two frequencies.
    let worst = 0;
    for (const [q11, r] of [[1, 0.1], [1, 1], [4, 1], [1, 0.01], [9, 0.25], [2.5, 3]]) {
        const Qq = [[q11, 0, 0, 0], [0, 1, 0, 0], [0, 0, 10, 0], [0, 0, 0, 1]];
        const K = lqrGain(A, B, Qq, [[r]]).K[0];
        worst = Math.max(worst, Math.abs(Math.abs(K[0]) - Math.sqrt(q11 / r)) / Math.sqrt(q11 / r));
    }
    ok("!! |K1| = sqrt(Q11/R) across six unrelated (Q11, R) pairs, including non-round ones", worst < 1e-9,
        `worst relative error ${worst.toExponential(2)}`);
    report("nothing in the solver is told this; it falls out of the same return-difference identity that " +
           "section 5 measures, read in the s -> 0 limit where the cart's integrator dominates both sides");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** THE INFINITE GAIN MARGIN -- AND THE ROUTE THAT CANNOT SEE IT ***");
{
    // *** THE EXACT DECADE AT WHICH EACH ROUTE DIES IS NOT A STABLE NUMBER, AND ASSERTING ONE WAS A MISTAKE. ***
    // A first version pinned them: Faddeev at 1e5, interpolation at 1e8, Lyapunov past 1e10. Then the module's
    // Riccati default was made ten times COARSER -- which leaves the gain identical to nine decimals and the ARE
    // residual ten times SMALLER -- and the boundaries moved a decade anyway, because a last-bits change in K is
    // enough to flip a verdict that is already being decided by cancellation. What is stable is the ORDERING,
    // so that is what is asserted, and it is MEASURED on this run rather than written down.
    const kappas = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10];
    const a0Exact = (k) => k * charPoly(closedLoop(A, B, NOM.K, 1))[3];
    const a0Fadd = (k) => charPolyFaddeev(closedLoop(A, B, NOM.K, k))[4];
    const a0Interp = (k) => { const p2 = charPolyInterp(closedLoop(A, B, NOM.K, k)); return p2[p2.length - 1] / p2[0]; };
    // "wrong" = out by more than a factor of ten in MAGNITUDE, which survives the sign flips both routes make.
    const badFrom = (f) => { for (const k of kappas) { const r = Math.abs(f(k) / a0Exact(k)); if (!(r > 0.1 && r < 10)) return k; } return Infinity; };
    const kFadd = badFrom(a0Fadd), kInterp = badFrom(a0Interp);
    let kLyap = Infinity;
    for (const k of kappas) if (!lyapunovStable(closedLoop(A, B, NOM.K, k))) { kLyap = k; break; }

    ok("!! the closed loop is stable at every gain multiple the checkers can still see",
        kLyap > 1e6, `Lyapunov first calls it unstable at kappa = ${kLyap}`);
    ok("...and unstable well below the guaranteed 1/2, so the sweep can distinguish the two",
        !lyapunovStable(closedLoop(A, B, NOM.K, 0.2)));
    const margin = gainMarginLower(A, B, NOM.K);
    ok("!! the TRUE lower margin, bisected rather than quoted, beats the 0.5 guarantee",
        margin > 0.2 && margin < 0.5, `kappa = ${margin.toFixed(9)} against a guaranteed 0.5`);
    report("a guarantee is a LOWER BOUND. A bound that came out exactly tight would be a suspicious bound");

    ok("!! at kappa = 1 all three routes agree with the exact answer",
        Math.abs(a0Fadd(1) / a0Exact(1) - 1) < 1e-9 && Math.abs(a0Interp(1) / a0Exact(1) - 1) < 1e-9);
    ok("!! *** AND THEY FAIL IN A STRICT ORDER: Faddeev first, then interpolation, then Lyapunov ***",
        kFadd < kInterp && kInterp <= kLyap,
        `first wrong at kappa -- Faddeev ${kFadd}, Interp ${kInterp}, Lyapunov ${kLyap}. ` +
        `The ORDER is the claim; the decades move with the last bits of K`);
    ok("...and all three DO eventually fail, so none of them is being trusted for free",
        Number.isFinite(kFadd) && Number.isFinite(kInterp) && Number.isFinite(kLyap));

    // *** WHAT SEPARATES THE ROUTES IS SELF-DIAGNOSIS, NOT IMMUNITY. ***
    const certResidual = (k) => {
        const M = closedLoop(A, B, NOM.K, k), X = solveLyapunov(M);
        if (!X) return Infinity;
        return mat.norm(mat.add(mat.add(mat.mul(mat.T(M), X), mat.mul(X, M)), mat.eye(4)));
    };
    const probe = [1e4, 1e6, 1e8];
    const ladder = probe.map(certResidual);
    let growing = true;
    for (let i = 1; i < ladder.length; i++) if (!(ladder[i] > ladder[i - 1])) growing = false;
    ok("!! the Lyapunov route's own certificate residual GROWS long before its verdict flips",
        growing && ladder[0] < 1e-3 && ladder[2] > 1,
        probe.map((k, i) => `${k}: ${ladder[i].toExponential(1)}`).join("  ") +
        `  -- while the verdict is still 'stable' at every one of these`);
    report("Faddeev < Interp < Lyapunov, and ALL THREE eventually fail. What the Lyapunov route has is not " +
           "immunity but a CERTIFICATE you can check: it says when it has stopped being trustworthy, where a " +
           "characteristic polynomial returns a confident wrong sign and no warning at all");

    // *** AND THE TREE'S OWN GENERAL ROUTH-HURWITZ INHERITS THE FAILURE, WHICH IS NOT ITS FAULT. ***
    const rhpAt = (k) => { const r = routhHurwitz([1, ...charPolyFaddeev(closedLoop(A, B, NOM.K, k)).slice(1)]); return r ? r.rhp : null; };
    ok("!! routhHurwitz reports 0 unstable roots at kappa = 1e3 and ONE at kappa = 1e5, on a loop stable at both",
        rhpAt(1e3) === 0 && rhpAt(1e5) === 1 && lyapunovStable(closedLoop(A, B, NOM.K, 1e5)),
        `rhp 1e3 -> ${rhpAt(1e3)}, 1e5 -> ${rhpAt(1e5)}`);
    report("the Hurwitz table is innocent: it is handed a polynomial whose constant term has already lost its " +
           "sign. Same conclusion physics/nuclear/kinetics.mjs reached for this technique on its own 7x7");
}

// ---------------------------------------------------------------------------
console.log("\n7b. *** THIS FILE ADDS LQR TO A CONTROL LAYER THAT ALREADY EXISTED, AND KEEPS NO SECOND COPIES ***");
{
    // A first draft carried its own matMul, Cholesky, Faddeev-LeVerrier and quartic Routh-Hurwitz -- four
    // second copies, in the same directory as the originals. This is the check that they stay gone.
    const src = fs.readFileSync(new URL("./cartPole.mjs", import.meta.url), "utf8");
    ok("!! it imports the existing linear algebra rather than redefining it",
        /from "\.\/controlStateSpace\.mjs"/.test(src) && /from "\.\/controlStability\.mjs"/.test(src));
    for (const [what, re2] of [["a Cholesky", /function cholesky/], ["a Faddeev-LeVerrier", /function charPolyFaddeev/],
                               ["a Routh table", /function routhHurwitz/], ["a matrix multiply", /function matMul/],
                               ["a dense solver", /function solveLinear|function solve\b/]])
        ok(`does NOT carry ${what} of its own`, !re2.test(src));
    ok("...and what it DOES define is the part that did not exist",
        /function solveRiccati/.test(src) && /function solveLyapunov/.test(src) && /function returnDifferenceMin/.test(src));
    report("controlStability v3572, controlStateSpace v3573 and controlMargins v3574 predate this module by " +
           "four hundred versions; the only reason to write any of it again would be not having looked");
}

// ---------------------------------------------------------------------------
console.log("\n8. *** THE OPTIMAL COST IS A PREDICTION, AND THE SIMULATION IS THE MEASUREMENT ***");
{
    for (const x0 of [[0.2, 0, 0.1, 0], [1, 0, 0, 0], [0, 0, 0.3, 0.5]]) {
        const pred = optimalCost(NOM.P, x0);
        const sim = simulateCost({ A, B, K: NOM.K, Q, R, x0, dt: 1e-4, horizon: 60 });
        ok(`!! x0 = [${x0}] -- Riccati predicts the cost the simulation then spends`,
            Math.abs(sim.cost - pred) / pred < 1e-6,
            `predicted ${pred.toFixed(9)} simulated ${sim.cost.toFixed(9)} (${(Math.abs(sim.cost - pred) / pred).toExponential(2)})`);
    }
    // *** I CALLED THE REMAINING GAP HORIZON TRUNCATION AND IT WAS NOT. *** This check first asserted that the
    // error shrinks as the horizon grows, and got THREE IDENTICAL NUMBERS at T = 10, 30 and 90 -- the closed
    // loop has fully settled by T = 10, so the tail contributes nothing and the horizon was never the limit.
    // The gap was the COST QUADRATURE: the state was integrated with RK4 while its cost was accumulated with a
    // first-order left Riemann sum, which made the sum the weakest link in the comparison. Trapezoid now, and
    // the property asserted here is the one that is actually true -- SECOND-ORDER CONVERGENCE IN dt.
    const x0 = [0.2, 0, 0.1, 0], pred = optimalCost(NOM.P, x0);
    const dts = [4e-3, 2e-3, 1e-3, 5e-4];
    const errs = dts.map((dt) => Math.abs(simulateCost({ A, B, K: NOM.K, Q, R, x0, dt, horizon: 60 }).cost - pred) / pred);
    const ratios = errs.slice(1).map((e, i) => errs[i] / e);
    ok("!! the gap is QUADRATURE and it converges at second order -- each halving of dt divides it by 4",
        ratios.every((r) => Math.abs(r - 4) < 0.2),
        dts.map((d, i) => `${d}: ${errs[i].toExponential(2)}`).join("  ") + `  ratios ${ratios.map((r) => r.toFixed(2)).join(", ")}`);
    const flat = [10, 30, 90].map((H) => Math.abs(simulateCost({ A, B, K: NOM.K, Q, R, x0, dt: 1e-4, horizon: H }).cost - pred) / pred);
    ok("!! ...and it is FLAT in the horizon, which is how the wrong diagnosis was caught",
        Math.abs(flat[2] - flat[1]) / flat[1] < 1e-3,
        flat.map((e, i) => `T=${[10, 30, 90][i]} ${e.toExponential(3)}`).join(" -> ") + " -- settled by T=10, so the tail is empty");
}

// ---------------------------------------------------------------------------
console.log("\n9. *** THE PLANT: A CONTROLLER DESIGNED ON THE WRONG MODEL VALIDATES PERFECTLY AGAINST IT ***");
{
    const d = linearize(PARAMS, true);          // linearised about the HANGING equilibrium: one sign on gravity
    const PLA = lqrGain(d.A, d.B, Q, R);

    // ---- everything self-consistent PASSES, and each of these is a check somebody would actually run
    ok("!! the planted design's own ARE residual is just as small", PLA.residual < 1e-8, PLA.residual.toExponential(3));
    ok("!! ...its closed loop is stable ON ITS OWN MODEL, by both routes",
        lyapunovStable(closedLoop(d.A, d.B, PLA.K)) && hurwitzStable(closedLoop(d.A, d.B, PLA.K)));
    const rdP = returnDifferenceMin(d.A, d.B, PLA.K);
    ok("!! ...and the KALMAN INEQUALITY HOLDS on its own loop", rdP.satisfiesKalman, `min ${rdP.min.toFixed(9)}`);
    ok("!! ...and its predicted cost matches the cost simulated on its own dynamics", (() => {
        const x0 = [0.2, 0, 0.1, 0];
        const s = simulateCost({ A: d.A, B: d.B, K: PLA.K, Q, R, x0, dt: 1e-4, horizon: 60 });
        return Math.abs(s.cost - optimalCost(PLA.P, x0)) / optimalCost(PLA.P, x0) < 1e-6;
    })());
    report("four checks, all green, on a controller that will drop the pole. THAT is the finding: " +
           "self-consistency grades the model you brought, not the one you are standing in front of");

    // ---- and the one thing it cannot survive
    ok("!! *** APPLIED TO THE TRUE UPRIGHT PLANT, IT IS UNSTABLE ***",
        !lyapunovStable(closedLoop(A, B, PLA.K)) && !hurwitzStable(closedLoop(A, B, PLA.K)),
        "both routes agree, which they need not have");
    const nom = simulateCost({ A, B, K: NOM.K, Q, R, x0: [0, 0, 0.1, 0], nonlinear: true, horizon: 20 });
    const pla = simulateCost({ A, B, K: PLA.K, Q, R, x0: [0, 0, 0.1, 0], nonlinear: true, horizon: 20 });
    ok("!! on the REAL nonlinear cart-pole the honest gain catches the pole and holds it",
        nom.blewUp === null && Math.abs(nom.finalState[2]) < 1e-6,
        `final angle ${nom.finalState[2].toExponential(2)} rad after 20 s`);
    ok("!! ...and the planted gain drives it over", pla.blewUp !== null,
        `pole passed 90 degrees at t = ${pla.blewUp === null ? "never" : pla.blewUp.toFixed(3)} s`);
}

// ---------------------------------------------------------------------------
console.log("\n10. *** SABOTAGE ***");
{
    // the gain must be load-bearing: zero it and the pole falls
    const zero = [[0, 0, 0, 0]];
    ok("!! SABOTAGE: with no feedback at all the pole falls over", simulateCost({ A, B, K: zero, Q, R, x0: [0, 0, 0.1, 0], nonlinear: true, horizon: 20 }).blewUp !== null);
    // the sign matters: flip the gain and it should destabilise
    ok("!! SABOTAGE: reversing the sign of K destabilises the closed loop",
        !lyapunovStable(closedLoop(A, B, [NOM.K[0].map((v) => -v)])));
    // Q must be live
    const heavy = lqrGain(A, B, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1000, 0], [0, 0, 0, 1]], R);
    ok("!! SABOTAGE: weighting the angle 100x harder really moves the gain",
        Math.abs(heavy.K[0][2]) > 1.5 * Math.abs(NOM.K[0][2]),
        `angle gain ${NOM.K[0][2].toFixed(3)} -> ${heavy.K[0][2].toFixed(3)}`);
    ok("...and the heavier design is still stable", lyapunovStable(closedLoop(A, B, heavy.K)));
}

// ---------------------------------------------------------------------------
console.log("\n11. *** BROWSER-SAFE ***");
{
    // *** THIS ASSERTED "IMPORTS NOTHING", WHICH WAS TRUE OF THE FIRST DRAFT AND IS THE WRONG PROPERTY. ***
    // The module now imports its linear algebra from controlStateSpace/controlStability, which is the whole
    // point of the rewrite. What matters for a browser is not WHETHER it imports but WHAT: a bare specifier
    // like "node:url" is resolved before a line of the module runs, so a page importing it dies on a CORS
    // error rather than a caught failure. physics/stabilityMeter.mjs records exactly that, at v3951, as the
    // only module in the tree with a top-level node: import reachable from a page.
    const src = fs.readFileSync(new URL("./cartPole.mjs", import.meta.url), "utf8");
    const specs = [...src.matchAll(/^\s*(?:import|export)[^"']*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    ok("!! every import is a RELATIVE path -- no bare specifier a browser cannot resolve",
        specs.length > 0 && specs.every((x) => x.startsWith("./") || x.startsWith("../")), specs.join(", "));
    ok("!! ...and none of them is a node: builtin", !specs.some((x) => x.startsWith("node:")));
    ok("...and it touches no DOM", !/\bwindow\.|\bdocument\./.test(src));
    ok("...and its own dependencies are browser-safe too, since a page loads them as well", (() => {
        for (const dep of specs) {
            const d = fs.readFileSync(new URL(dep, import.meta.url), "utf8");
            const ds = [...d.matchAll(/^\s*(?:import|export)[^"']*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
            if (ds.some((x) => x.startsWith("node:"))) return false;
        }
        return true;
    })(), specs.join(", "));
}

console.log("\ncartPole-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
