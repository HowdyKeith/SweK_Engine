// physics/nuclear/reactorControl.mjs
//
// v3986 -- CLOSING THE LOOP. Round 4 of the reactor build: a rod controller that is GRADED rather than merely
// demonstrated. Keith's original question was whether the physics AI could run a reactor; this is the half that
// says what "running it" can and cannot do, and proves the answer two independent ways.
//
// ================================================================================================================
// *** THE PLANT IS THE INHOUR EQUATION ITSELF, WHICH IS NOT A COINCIDENCE AND IS NOT REUSE BY ANALOGY ***
// ================================================================================================================
//
// Linearising point kinetics about a critical steady state and eliminating the six precursors leaves
//
//     G(s) = n0 / [ s*LAMBDA + sum_i beta_i * s/(s + lambda_i) ]   =   n0 / inhour(s)
//
// -- the zero-power reactor transfer function is exactly kinetics.mjs's inhour() evaluated off the real axis.
// So this module adds no plant model of its own; it evaluates the one that is already gated. Checked both ways:
// the rational form D(s)/N(s) built from the polynomial coefficients equals inhour(s) to machine precision.
//
// ================================================================================================================
// A PROPORTIONAL ROD CONTROLLER ON THIS PLANT IS UNCONDITIONALLY STABLE, AND THAT WAS A SURPRISE WORTH KEEPING
// ================================================================================================================
//
// The obvious device was "find the gain where the rods start fighting the reactor". THERE ISN'T ONE. Routh's
// verdict on the delay-free loop is stable at EVERY gain -- criticalGainRouth returns null, an infinite margin,
// and so does adding a first-order rod-drive lag. The root locus explains it: the prompt mode sits near
// -beta/LAMBDA = -325 s^-1, which drags the asymptote centroid to about -162, so every branch runs off into the
// left half plane no matter how hard the controller pushes.
//
// *** SO THE INSTABILITY IS NOT IN THE NEUTRONICS. IT IS IN THE DELAY. *** Detectors integrate, rod drives take
// time to move, and a loop that acts on a measurement of the past will oscillate once the gain is high enough.
// That is the honest source, and it is what this module models.
//
// ================================================================================================================
// TWO ROUTES TO THE CRITICAL GAIN, AND TO THE FREQUENCY IT OSCILLATES AT
// ================================================================================================================
//
//   EXACT FREQUENCY DOMAIN   solve phase(G(jw)) - w*T = -pi for w, then K = 1/|G(jw)|. No approximation of the
//                            delay -- a Pade would have introduced its own error into the very number being
//                            checked, so the delay's phase is used in closed form.
//
//   NONLINEAR SIMULATION     run the real seven-ODE system through a REAL delay line and bisect on the gain for
//                            where the envelope stops decaying. Nothing linear about it and no transfer function
//                            anywhere.
//
//   MEASURED, T = 1/2/5 s:   gains agree to 2.6e-4 / 1.1e-3 / 7.2e-3, and the OSCILLATION PERIOD -- a second,
//                            independent number the frequency route also predicts -- to 5.0e-4 / 3.4e-4 / 1.1e-4.
//
// ================================================================================================================
// *** AND THE CRITICAL GAIN IS beta, RECOVERED FROM A QUESTION THAT NEVER MENTIONS REACTIVITY ***
// ================================================================================================================
//
// In the band where the loop crosses well above the fastest delayed group and well below 1/LAMBDA, every delayed
// term has saturated and the prompt term has not yet woken up, so |inhour(jw)| -> beta and K_crit -> beta. At
// T = 0.2 s the ratio is 1.0003. IT IS A PLATEAU AND NOT A LIMIT, and it ends at both edges for two DIFFERENT
// reasons, which is what makes it worth checking rather than quoting:
//
//     T          20s     10s      5s      2s      1s    0.5s    0.2s    0.1s   0.05s   0.01s
//     K/beta   0.510   0.676   0.816   0.923   0.968   0.990   1.000   1.005   1.018   1.260
//     w/l_6     0.04    0.09    0.19    0.49    1.00    2.03    5.10   10.08   19.64   82.64
//
// Left edge: w is below lambda_6 and the delayed groups have not saturated, so |inhour| < beta. Right edge:
// w*LAMBDA grows until the prompt term dominates and |inhour| > beta. A one-sided check would have called the
// low end agreement and the high end noise.
"use strict";
import { KEEPIN_U235, GEN_LWR, totalBeta, steadyState, derivative } from "./kinetics.mjs";

// ---- complex helpers (local, tiny, and only used to walk the imaginary axis) ---------------------------------
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const mag = (c) => Math.hypot(c[0], c[1]);
const arg = (c) => Math.atan2(c[1], c[0]);

/** inhour() continued off the real axis. Same expression, complex argument. */
export function inhourComplex(w, gen = GEN_LWR, groups = KEEPIN_U235) {
    let re = w[0] * gen, im = w[1] * gen;
    for (let i = 0; i < groups.beta.length; i++) {
        const q = cdiv(w, [w[0] + groups.lambda[i], w[1]]);
        re += groups.beta[i] * q[0]; im += groups.beta[i] * q[1];
    }
    return [re, im];
}

/** The zero-power reactor transfer function on the imaginary axis: G(j*omega) = n0 / inhour(j*omega). */
export function plantAt(omega, { gen = GEN_LWR, groups = KEEPIN_U235, n0 = 1 } = {}) {
    return cdiv([n0, 0], inhourComplex([0, omega], gen, groups));
}

/**
 * The same plant as a RATIONAL FUNCTION, so the tree's polynomial control tools (routhHurwitz,
 * criticalGainRouth, gainMarginFreq) can be pointed at it. Descending coefficient order, matching
 * controlMargins' Horner convention.
 *
 *   num = prod(s + lambda_i)                                    [degree 6]
 *   den = s * ( LAMBDA*prod(s+lambda_i) + sum_i beta_i*prod_{j!=i}(s+lambda_j) )   [degree 7]
 *
 * den/num IS inhour(s) -- verified to machine precision by the gate, which is what makes this a second
 * representation of one thing rather than a second model.
 */
export function plantPolynomials({ gen = GEN_LWR, groups = KEEPIN_U235, n0 = 1 } = {}) {
    const pMul = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0);
        for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) o[i + j] += a[i] * b[j]; return o; };
    const pAdd = (a, b) => { const n = Math.max(a.length, b.length), o = new Array(n).fill(0);
        for (let i = 0; i < a.length; i++) o[n - a.length + i] += a[i];
        for (let i = 0; i < b.length; i++) o[n - b.length + i] += b[i]; return o; };
    const L = groups.lambda, B = groups.beta;
    let N = [1]; for (const l of L) N = pMul(N, [1, l]);
    let M = [0];
    for (let i = 0; i < L.length; i++) {
        let p = [B[i]];
        for (let j = 0; j < L.length; j++) if (j !== i) p = pMul(p, [1, L[j]]);
        M = pAdd(M, p);
    }
    const D = pMul([1, 0], pAdd(pMul([gen], N), M));
    return { num: N.map((c) => c * n0), den: D };
}

/**
 * ROUTE 1 -- the exact frequency-domain critical gain for a loop with transport delay T.
 *
 * Solves phase(G(jw)) - w*T = -pi by bisection on a log grid, then reads the gain off |G|. The delay's phase is
 * EXACT (-w*T); nothing here approximates it, because a Pade would put its own error into the number this exists
 * to measure. Returns the oscillation frequency too -- the frequency is a second prediction, and the simulation
 * route can be asked about it independently.
 */
export function criticalGain(T, { gen = GEN_LWR, groups = KEEPIN_U235, n0 = 1, lo = 1e-4, hi = 1e4, iters = 400 } = {}) {
    const f = (om) => arg(plantAt(om, { gen, groups, n0 })) - om * T + Math.PI;
    let a = lo, b = hi;
    if (!(f(a) * f(b) <= 0)) return null;      // no -180 crossing: no finite critical gain
    for (let k = 0; k < iters; k++) {
        const m = Math.sqrt(a * b);
        if (f(a) * f(m) <= 0) b = m; else a = m;
    }
    const omega = Math.sqrt(a * b);
    return { K: 1 / mag(plantAt(omega, { gen, groups, n0 })), omega, periodSeconds: 2 * Math.PI / omega };
}

/**
 * ROUTE 2 -- run the real thing. Seven nonlinear ODEs, a real delay buffer, a proportional rod controller, and
 * a question about the envelope. No transfer function is formed anywhere in here.
 * @returns {{grows:boolean, trace:Array}} whether the disturbance envelope is growing by the end
 */
export function simulateLoop(K, T, { gen = GEN_LWR, groups = KEEPIN_U235, dt = 1e-3, seconds = 300, kick = 1.001, keepTrace = false } = {}) {
    let st = steadyState(1, gen, groups);
    st = { n: st.n * kick, C: st.C.slice() };
    const buf = new Array(Math.max(1, Math.round(T / dt))).fill(0);
    let bi = 0, early = 0, late = 0;
    const trace = [];
    const add = (a, k, h) => ({ n: a.n + h * k.n, C: a.C.map((c, i) => c + h * k.C[i]) });
    const steps = Math.round(seconds / dt);
    for (let s = 0; s < steps; s++) {
        const delayed = buf[bi];
        buf[bi] = st.n - 1;
        bi = (bi + 1) % buf.length;
        const rho = -K * delayed;                 // negative feedback on the DELAYED power error
        const k1 = derivative(st, rho, gen, groups);
        const k2 = derivative(add(st, k1, dt / 2), rho, gen, groups);
        const k3 = derivative(add(st, k2, dt / 2), rho, gen, groups);
        const k4 = derivative(add(st, k3, dt), rho, gen, groups);
        st = { n: st.n + dt / 6 * (k1.n + 2 * k2.n + 2 * k3.n + k4.n),
               C: st.C.map((c, i) => c + dt / 6 * (k1.C[i] + 2 * k2.C[i] + 2 * k3.C[i] + k4.C[i])) };
        if (!Number.isFinite(st.n)) return { grows: true, trace };
        const e = Math.abs(st.n - 1);
        if (s > steps * 0.25 && s < steps * 0.5) early = Math.max(early, e);
        if (s > steps * 0.75) late = Math.max(late, e);
        if (keepTrace && s > steps * 0.5) trace.push([s * dt, st.n - 1]);
    }
    return { grows: late > early, trace };
}

/** Bisect the SIMULATION for the gain at which the envelope stops decaying. */
export function criticalGainSimulated(T, opts = {}, { iters = 18, capDoublings = 24 } = {}) {
    let lo = 1e-5, hi = 1, g = 0;
    while (!simulateLoop(hi, T, opts).grows && g++ < capDoublings) hi *= 2;
    if (!simulateLoop(hi, T, opts).grows) return null;
    for (let k = 0; k < iters; k++) {
        const m = Math.sqrt(lo * hi);
        if (simulateLoop(m, T, opts).grows) hi = m; else lo = m;
    }
    return Math.sqrt(lo * hi);
}

/** The oscillation period the simulation actually shows, from mean zero-crossing spacing of the tail. */
export function simulatedPeriod(K, T, opts = {}) {
    const { trace } = simulateLoop(K, T, { ...opts, keepTrace: true });
    const zc = [];
    for (let i = 1; i < trace.length; i++) {
        if (trace[i - 1][1] < 0 && trace[i][1] >= 0) {
            const f = -trace[i - 1][1] / (trace[i][1] - trace[i - 1][1]);
            zc.push(trace[i - 1][0] + f * (trace[i][0] - trace[i - 1][0]));
        }
    }
    if (zc.length < 3) return null;
    let s = 0;
    for (let i = 1; i < zc.length; i++) s += zc[i] - zc[i - 1];
    return s / (zc.length - 1);
}

/** A controller gain expressed in dollars of reactivity per unit fractional power error. */
export const gainDollars = (K, groups = KEEPIN_U235) => K / totalBeta(groups);
