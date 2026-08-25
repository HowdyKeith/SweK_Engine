// physics/control/cartPole.mjs
//
// v3995 -- THE INVERTED PENDULUM ON A CART, AND THE LINEAR-QUADRATIC REGULATOR THAT HOLDS IT UP.
//
// The cart-pole is the standard hard fixture of control: an open-loop UNSTABLE plant with one actuator and four
// states, which cannot be stabilised by any static output feedback on the angle alone. LQR solves it optimally,
// and -- unusually for an optimal-control method -- comes with GUARANTEES that can be checked rather than
// trusted.
//
// ================================================================================================================
// THE EXACT ANSWER KEYS, none of them written into the Riccati solver
// ================================================================================================================
//
//   THE ALGEBRAIC RICCATI EQUATION IS THE ANSWER KEY FOR THE METHOD THAT DOES NOT SOLVE IT. The solver here
//   INTEGRATES the Riccati differential equation dP/ds = A'P + PA - P B R^-1 B' P + Q from P = 0 to steady
//   state. The ALGEBRAIC equation -- the same expression set to zero -- is then a residual it was never asked to
//   satisfy. Measured 7.6e-12 on the cart-pole, 5.5e-13 on the double integrator.
//
//   THE SCALAR CASE HAS A CLOSED FORM: for 1x1 systems the ARE is a quadratic, p = (a + sqrt(a^2 + b^2 q/r))
//   r/b^2. Matched to 1.2e-12 .. 4.0e-12 at three unrelated parameter sets.
//
//   THE DOUBLE INTEGRATOR HAS A FAMOUS ONE: xdd = u with Q = I, R = 1 gives EXACTLY K = [1, sqrt(3)].
//   Measured [1.000000000000, 1.732050807569] -- exact to every digit printed.
//
//   THE OPTIMAL COST IS x0' P x0, AND IT IS A PREDICTION RATHER THAN A DEFINITION. P comes from the Riccati
//   solve; the cost comes from simulating the closed loop and integrating x'Qx + u'Ru along it. Two routes,
//   nothing shared but the gain.
//
//   *** AND THE KALMAN RETURN-DIFFERENCE INEQUALITY, WHICH IS THE ONE WORTH THE BUILD: |1 + L(jw)| >= 1 AT
//   EVERY FREQUENCY, where L(s) = K(sI - A)^-1 B is the loop broken at the plant input. *** Swept over 4001
//   frequencies from 1e-4 to 1e4 rad/s, the minimum is 1.000000154670 -- above 1, and approaching it
//   asymptotically at high frequency rather than by luck. Geometrically it says the Nyquist plot of an LQR loop
//   CANNOT ENTER THE UNIT DISC AROUND -1, and the two classical margins are corollaries:
//
//       INFINITE GAIN MARGIN     stable for every gain multiple kappa in [1/2, infinity)
//       60 DEGREE PHASE MARGIN   the unit circle about -1 meets |L| = 1 at exactly 60 degrees
//
//   The gain margin is verified out to the point where the CHECKERS give out rather than the physics (
//   see the conditioning note below, which is about the checkers rather than about LQR), and the TRUE lower
//   margin is found by bisection rather than quoted: kappa = 0.357259, comfortably better than the guaranteed
//   0.5 -- which is what a guarantee is. A bound that happened to be tight would be a suspicious bound.
//
// ================================================================================================================
// THIS FILE ADDS LQR TO A CONTROL LAYER THAT ALREADY EXISTED, AND BORROWS THE REST
// ================================================================================================================
//
// physics/control/ has carried controlStability.mjs (v3572), controlStateSpace.mjs (v3573) and
// controlMargins.mjs (v3574) since long before this module. They already provide the dense linear algebra
// (matMul, transpose, trace, solve, cholesky, rank, det), BOTH characteristic-polynomial routes
// (charPolyFaddeev and charPolyInterp), Routh-Hurwitz as a general RIGHT-HALF-PLANE ROOT COUNT rather than a
// yes/no, Durand-Kerner, Nyquist encirclements, and gain/phase margins for transfer functions in num/den form.
//
// *** SO WHAT IS NEW HERE IS THE LQR AND THE PLANT, AND EVERYTHING ELSE IS IMPORTED. *** A first draft of this
// file carried its own matMul, its own Cholesky, its own Faddeev-LeVerrier and its own quartic Routh-Hurwitz --
// four second copies, in the same directory as the originals. That is precisely the shape this tree keeps
// paying for, so they are gone. What genuinely did not exist:
//
//   THE RICCATI SOLVER AND LQR GAIN      nothing in the tree solved an optimal-control problem
//   solveLyapunov / lyapunovStable       A'X + XA = -I with a positive-definite solution, as a STATE-SPACE
//                                        stability test that never forms a polynomial
//   returnDifferenceMin                  the Kalman inequality on a state-space loop; controlMargins works from
//                                        num/den, and forming num/den here would go through the very
//                                        characteristic polynomial whose conditioning is the finding below
//   the cart-pole plant itself           nonlinear dynamics and their hand-derived linearisation
//
// ================================================================================================================
// THREE ROUTES TO ONE COEFFICIENT, AND THEY FAIL IN A STRICT ORDER
// ================================================================================================================
//
// a0 = det(A - kappa B K), the constant term of the closed-loop characteristic polynomial, is EXACTLY LINEAR in
// the gain multiple kappa here: BK is rank one and det(A) = 0, so a0 = kappa * a0(1) with no higher terms. That
// makes it a perfect conditioning probe, because the true answer is known for every kappa.
//
//     kappa        exact        charPolyFaddeev      charPolyInterp     lyapunovStable
//     1            4.5398e1     4.5398e1             4.5398e1           stable
//     1e5          4.5398e6     -3.3707e7 (SIGN)     4.539471e6         stable
//     1e8          4.5398e9     9.8825e18            -3.1071e7 (SIGN)   stable
//     1e10         4.5398e11    ---                  ---                UNSTABLE (wrongly)
//
// FADDEEV-LEVERRIER builds a0 from traces of powers of the matrix, which are of order kappa^4, so it produces a
// quantity of order kappa by cancellation and loses about three digits per decade. CHARPOLYINTERP evaluates
// det(sI - A) at n+1 points and interpolates, which is far better conditioned -- it survives two decades further
// -- but it is not immune. Nor is the LYAPUNOV route, which is the part I got wrong first: a draft of this
// header claimed it "holds to kappa = 1e12". It does not.
//
// *** AND THE EXACT DECADE AT WHICH EACH ROUTE DIES IS NOT A STABLE NUMBER, WHICH IS WORTH SAYING PLAINLY. ***
// Making the Riccati default ten times COARSER -- a change that leaves the gain identical to nine decimals and
// the residual ten times smaller -- moved every one of those boundaries by a decade. A verdict already being
// decided by cancellation flips on the last bits of K. So the gate asserts the ORDERING, which is structural,
// and measures the decades rather than writing them down:
//
//     FADDEEV < INTERP < LYAPUNOV, and ALL THREE eventually fail.
//
// What separates the last one is NOT immunity, it is SELF-DIAGNOSIS. The Lyapunov route ships a certificate --
// the X solving A'X + XA = -I -- whose residual can be checked directly, and it climbs 1.5e-5 -> 7.1e-2 -> 5.3e2
// across kappa = 1e4, 1e6, 1e8 while the verdict still reads "stable" at every one of them. The route TELLS YOU
// it has stopped being trustworthy. A characteristic polynomial hands back a confident wrong sign and no warning.
//
// *** THE TREE'S OWN GENERAL routhHurwitz INHERITS THE FAILURE, BECAUSE IT EATS THE SAME COEFFICIENTS. ***
// Measured: it reports 0 right-half-plane roots at kappa = 1e3 and ONE at kappa = 1e5, on a loop stable at both.
// The defect is never in the Hurwitz table; it is upstream, in the polynomial handed to it. That is the same
// conclusion physics/nuclear/kinetics.mjs reached for charPolyFaddeev + durandKerner on its own 7x7, and
// controlStability.mjs's own header already records that the tree's only eigenvalue routine (symEigenvalues in
// physics/quantum/rmt.js) is symmetric-only and cannot be used on a closed-loop matrix.
//
// Both routes are kept and the DISAGREEMENT IS REPORTED rather than resolved silently: a device that quietly
// picked the winner would be hiding the most useful thing it knows.
"use strict";

import {
    zeros, eye, matMul, transpose, trace, solve, cholesky, charPolyFaddeev, charPolyInterp,
} from "./controlStateSpace.mjs";
import { routhHurwitz } from "./controlStability.mjs";

// The three element-wise operations controlStateSpace does not export. Everything else above is borrowed.
const add = (A, B) => A.map((r, i) => r.map((v, j) => v + B[i][j]));
const scale = (A, s) => A.map((r) => r.map((v) => v * s));
const norm = (A) => Math.sqrt(A.flat().reduce((s, v) => s + v * v, 0));
export const mat = { add, scale, norm, mul: matMul, T: transpose, zeros, eye, trace };

// ---- the plant ------------------------------------------------------------------------------------------
/** Cart mass M, pole mass m, pole HALF-length l (a uniform rod, hence the 4/3), gravity g. */
export const PARAMS = { M: 1.0, m: 0.1, l: 0.5, g: 9.81 };

/**
 * The TRUE nonlinear cart-pole. State [x, xdot, theta, thetadot] with theta measured from UPRIGHT; u is the
 * force on the cart. This is the classical Barto-Sutton form, and nothing linear is used anywhere in it.
 *
 * `downward` is the PLANT -- see the note at PLANT_DOWNWARD.
 */
export function nonlinearDerivative(s, u, p = PARAMS, downward = false) {
    const [, xd, th, thd] = s;
    const S = Math.sin(th), C = Math.cos(th), tot = p.M + p.m;
    const g = downward ? -p.g : p.g;
    const thdd = (g * S + C * ((-u - p.m * p.l * thd * thd * S) / tot)) / (p.l * (4 / 3 - p.m * C * C / tot));
    const xdd = (u + p.m * p.l * (thd * thd * S - thdd * C)) / tot;
    return [xd, xdd, thd, thdd];
}

/**
 * The linearisation about the equilibrium. Derived by hand from the equations above rather than by finite
 * differences -- and then CHECKED against finite differences of nonlinearDerivative, which is a different
 * computation entirely (worst entry 3.8e-12).
 */
export function linearize(p = PARAMS, downward = false) {
    const g = downward ? -p.g : p.g, tot = p.M + p.m, den = p.l * (4 / 3 - p.m / tot);
    const a43 = g / den, b4 = -1 / (tot * den);
    const a23 = -(p.m * p.l / tot) * a43, b2 = 1 / tot - (p.m * p.l / tot) * b4;
    return { A: [[0, 1, 0, 0], [0, 0, a23, 0], [0, 0, 0, 1], [0, 0, a43, 0]], B: [[0], [b2], [0], [b4]] };
}

// ---- LQR ------------------------------------------------------------------------------------------------
/**
 * Solve the algebraic Riccati equation by INTEGRATING the differential one to steady state.
 *
 * *** THE DIRECTION IS THE WHOLE TRICK AND IT IS EASY TO GET BACKWARDS. *** The Riccati equation of
 * finite-horizon LQR runs BACKWARD in time from the terminal condition P(T) = 0. Written forward in s = T - t
 * it is dP/ds = A'P + PA - P B R^-1 B' P + Q with P(0) = 0, and it converges to the stabilising solution.
 * Writing it forward with a leading minus -- which is the first thing I did -- integrates AWAY from that
 * solution and reaches -1.3e154 instead.
 *
 * *** THE STEP SIZE BARELY MATTERS HERE, AND A COARSER ONE IS ACTUALLY BETTER. *** The answer is a FIXED POINT
 * of this ODE, not a point on its trajectory, so the accuracy of the path is irrelevant -- only that it
 * converges. Measured: dt = 5e-4, 2e-3 and 5e-3 give a gain identical to nine decimals, while the ARE residual
 * IMPROVES with the coarser step (7.8e-11 -> 1.9e-11 -> 7.6e-12) because fewer steps accumulate less round-off,
 * and the run costs 1457ms, 367ms and 142ms respectively. SO 5e-3 IS THE DEFAULT: it is faster AND more
 * accurate, and the double integrator that read [0.999999999992, 1.732050807560] at the fine step comes back
 * [1.000000000000, 1.732050807569] at the coarse one. A finer step here was not caution, it was worse.
 */
export function solveRiccati(A, B, Q, R, { dt = 5e-3, maxT = 600, tol = 1e-15 } = {}) {
    const At = transpose(A), Bt = transpose(B), Ri = 1 / R[0][0];
    const f = (P) => add(add(matMul(At, P), matMul(P, A)),
                         add(scale(matMul(matMul(matMul(matMul(P, B), [[Ri]]), Bt), P), -1), Q));
    let P = zeros(A.length), t = 0, steps = 0;
    while (t < maxT) {
        const k1 = f(P), k2 = f(add(P, scale(k1, dt / 2))), k3 = f(add(P, scale(k2, dt / 2))), k4 = f(add(P, scale(k3, dt)));
        const Pn = add(P, scale(add(add(k1, scale(k2, 2)), add(scale(k3, 2), k4)), dt / 6));
        const d = norm(add(Pn, scale(P, -1)));
        P = Pn; t += dt; steps++;
        if (d < tol * Math.max(1, norm(P))) return { P, converged: true, steps };
    }
    return { P, converged: false, steps };
}

/** The ALGEBRAIC equation, which the integrator above was never asked to satisfy. This is the answer key. */
export const areResidual = (A, B, Q, R, P) => norm(add(add(matMul(transpose(A), P), matMul(P, A)),
    add(scale(matMul(matMul(matMul(matMul(P, B), [[1 / R[0][0]]]), transpose(B)), P), -1), Q)));

/** K = R^-1 B' P, returned as a 1 x n row along with the P it came from and the residual that grades it. */
export function lqrGain(A, B, Q, R, opts = {}) {
    const { P, converged, steps } = solveRiccati(A, B, Q, R, opts);
    return { K: matMul([[1 / R[0][0]]], matMul(transpose(B), P)), P, converged, steps, residual: areResidual(A, B, Q, R, P) };
}

/** The exact 1x1 solution of the ARE. The solver is never told it. */
export const scalarExactP = (a, b, q, r) => (a + Math.sqrt(a * a + b * b * q / r)) * r / (b * b);
/** xdd = u with Q = I, R = 1 gives exactly K = [1, sqrt(3)]. */
export const DOUBLE_INTEGRATOR_K = [1, Math.sqrt(3)];

// ---- stability, two ways --------------------------------------------------------------------------------
/** Coefficients of the closed-loop characteristic polynomial, borrowed. Kept as a named export so the gate can
 *  drive BOTH of the tree's routes against the exactly-linear a0 above. */
export const charPoly = (A) => charPolyFaddeev(A).slice(1);
export { charPolyFaddeev, charPolyInterp };

/**
 * ROUTE 1 -- the tree's general Routh-Hurwitz, asked for a RIGHT-HALF-PLANE ROOT COUNT and read as "zero".
 * Stability is the integer being 0, which is a stronger statement than a boolean: when it fails it says by how
 * much. See the header for where this route stops being trustworthy, and why that is not its fault.
 */
export function hurwitzStable(A) {
    const r = routhHurwitz([1, ...charPolyFaddeev(A).slice(1)]);
    return r && r.rhp === 0;
}
/** ...and the right-half-plane count itself, which is what makes the failure legible rather than binary. */
export function hurwitzRhpCount(A) {
    const r = routhHurwitz([1, ...charPolyFaddeev(A).slice(1)]);
    return r ? r.rhp : null;
}

/**
 * A'X + XA = -I, solved for the symmetric unknowns as one dense system through the borrowed solver.
 * *** THIS IS THE PIECE THAT DID NOT EXIST. *** controlStability answers stability from a POLYNOMIAL; this
 * answers it from the MATRIX, which is why it survives where the polynomial routes do not.
 */
export function solveLyapunov(A) {
    const n = A.length, idx = [], pos = {};
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { pos[i + "," + j] = idx.length; pos[j + "," + i] = idx.length; idx.push([i, j]); }
    const m = idx.length, M = zeros(m), rhs = Array(m).fill(0);
    idx.forEach(([i, j], row) => {
        for (let k = 0; k < n; k++) { M[row][pos[k + "," + j]] += A[k][i]; M[row][pos[i + "," + k]] += A[k][j]; }
        rhs[row] = i === j ? -1 : 0;
    });
    const s = solve(M, rhs);
    if (!s) return null;
    const X = zeros(n); idx.forEach(([i, j], r) => { X[i][j] = s[r]; X[j][i] = s[r]; });
    return X;
}

/** ROUTE 2 -- Lyapunov. cholesky() returns null on a non-positive pivot, which IS the definiteness test. */
export function lyapunovStable(A) { const X = solveLyapunov(A); return X !== null && cholesky(X) !== null; }
/** Exported so a gate can check the certificate rather than only the verdict. */
export const isPositiveDefinite = (X) => cholesky(X) !== null;

export const closedLoop = (A, B, K, kappa = 1) => add(A, scale(matMul(B, K), -kappa));

// ---- the frequency-domain guarantee ---------------------------------------------------------------------
/**
 * L(jw) = K (jwI - A)^-1 B, the loop broken at the PLANT INPUT, computed as one real 2n x 2n solve:
 *     [ -A   -wI ] [ xr ]   [ B ]
 *     [  wI  -A  ] [ xi ] = [ 0 ]
 * which is (jwI - A)(xr + i xi) = B written out in real and imaginary parts.
 */
export function loopTransferAt(A, B, K, w) {
    const n = A.length, M = zeros(2 * n), rhs = Array(2 * n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        M[i][j] = -A[i][j]; M[i][n + j] = i === j ? -w : 0;
        M[n + i][j] = i === j ? w : 0; M[n + i][n + j] = -A[i][j];
    }
    for (let i = 0; i < n; i++) rhs[i] = B[i][0];
    const s = solve(M, rhs);
    if (!s) return null;
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) { re += K[0][j] * s[j]; im += K[0][j] * s[n + j]; }
    return { re, im };
}

/**
 * *** THE KALMAN RETURN-DIFFERENCE INEQUALITY. *** min over w of |1 + L(jw)|, which LQR guarantees is >= 1.
 * Both classical margins follow from it, so this is the single number worth measuring: it is the reason the
 * gain margin is infinite rather than a separate fact about it.
 */
export function returnDifferenceMin(A, B, K, { decadesLo = -4, decadesHi = 4, per = 500 } = {}) {
    let worst = Infinity, worstW = 0, n = 0;
    const step = 1 / per;
    for (let e = decadesLo; e <= decadesHi + 1e-12; e += step) {
        const w = Math.pow(10, e), L = loopTransferAt(A, B, K, w);
        if (!L) continue;
        const m = Math.hypot(1 + L.re, L.im);
        n++;
        if (m < worst) { worst = m; worstW = w; }
    }
    return { min: worst, atOmega: worstW, samples: n, satisfiesKalman: worst >= 1 - 1e-9 };
}

/** The TRUE lower gain margin, bisected on the Lyapunov test rather than quoted. */
export function gainMarginLower(A, B, K, { lo = 1e-3, hi = 1, iters = 60 } = {}) {
    if (!lyapunovStable(closedLoop(A, B, K, hi))) return null;
    let a = lo, b = hi;
    for (let i = 0; i < iters; i++) { const mid = (a + b) / 2; if (lyapunovStable(closedLoop(A, B, K, mid))) b = mid; else a = mid; }
    return b;
}

// ---- cost, two ways -------------------------------------------------------------------------------------
/** The Riccati prediction: J* = x0' P x0. */
export const optimalCost = (P, x0) => matMul(matMul([x0], P), transpose([x0]))[0][0];

/**
 * The measurement: simulate the closed loop and integrate x'Qx + u'Ru along it. Shares nothing with the
 * prediction but the gain -- and `nonlinear` runs the REAL cart-pole rather than the linear model, which is how
 * the two are made to disagree on purpose.
 */
export function simulateCost({ A, B, K, Q, R, x0, dt = 1e-4, horizon = 60, nonlinear = false, p = PARAMS, downward = false } = {}) {
    let s = x0.slice(), J = 0, blewUp = null;
    const steps = Math.round(horizon / dt);
    const f = (st) => {
        const u = -K[0].reduce((a, k, j) => a + k * st[j], 0);
        if (nonlinear) return nonlinearDerivative(st, u, p, downward);
        const ax = A.map((r) => r.reduce((a, v, j) => a + v * st[j], 0));
        return ax.map((v, i) => v + B[i][0] * u);
    };
    // *** THE COST IS ACCUMULATED BY TRAPEZOID, NOT BY RECTANGLE, AND THAT WAS A REAL BUG. *** The state is
    // integrated with RK4, so accumulating its cost with a first-order left Riemann sum made the QUADRATURE the
    // weakest link in the whole comparison: the predicted-versus-simulated agreement sat at 2.9e-4 and DID NOT
    // MOVE when the horizon was extended from 10 to 90 seconds, because the gap was never horizon truncation.
    // The gate's own convergence check is what exposed that -- three identical numbers where a shrinking
    // sequence was asserted.
    const running = (st) => {
        const u = -K[0].reduce((a, k, j) => a + k * st[j], 0);
        return st.reduce((a, v, j) => a + v * Q[j][j] * v, 0) + R[0][0] * u * u;
    };
    let gPrev = running(s);
    for (let i = 0; i < steps; i++) {
        const k1 = f(s), k2 = f(s.map((v, i2) => v + dt / 2 * k1[i2])),
              k3 = f(s.map((v, i2) => v + dt / 2 * k2[i2])), k4 = f(s.map((v, i2) => v + dt * k3[i2]));
        s = s.map((v, i2) => v + dt / 6 * (k1[i2] + 2 * k2[i2] + 2 * k3[i2] + k4[i2]));
        if (!s.every(Number.isFinite) || Math.abs(s[2]) > Math.PI / 2) { blewUp = i * dt; break; }
        const gNow = running(s);
        J += (gPrev + gNow) / 2 * dt;
        gPrev = gNow;
    }
    return { cost: J, finalState: s, blewUp, maxAngle: Math.abs(s[2]) };
}

// ================================================================================================================
// THE PLANT
// ================================================================================================================
//
// `downward` linearises about the HANGING equilibrium instead of the upright one -- one sign, on gravity. That
// is not a corrupted model: it is the exactly correct linearisation of a pendulum that hangs, which is the other
// equilibrium of the very same cart-pole and the one every undergraduate meets first.
//
// *** AND EVERY CHECK THAT STAYS INSIDE THE MODEL PASSES. *** The Riccati solve converges; the ARE residual is
// just as small; the closed loop A_down - B_down K_down is stable by BOTH routes; the Kalman inequality holds on
// its own loop; the predicted cost matches the cost simulated on its own dynamics. A controller designed on the
// wrong model VALIDATES PERFECTLY AGAINST THAT MODEL, and that is the entire lesson of this device -- it is not
// a numerical defect, it is what self-consistency is worth.
//
// What it cannot survive is contact with the TRUE plant: K_down applied to the real upright dynamics drives the
// pole over rather than catching it.
export const PLANT_DOWNWARD = true;
