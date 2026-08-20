// WebGLEngine/physics/sync/kuramoto.js — v3283
// ---------------------------------------------------------------------------------------------------------------
// THE KURAMOTO MODEL — a new area for the lab: SYNCHRONIZATION. N oscillators, each with its own natural
// frequency, each nudged toward the crowd's average phase:
//     dtheta_i/dt = omega_i + K r sin(psi - theta_i)
// where r e^{i psi} = (1/N) sum e^{i theta_j} is the order parameter the crowd itself generates. Fireflies,
// pacemaker cells, power grids, bridges full of pedestrians — same equation.
//
// THE ANSWER KEY IS A WHOLE CURVE, not a point. For Lorentzian-distributed frequencies (half-width gamma) the
// infinite-N solution is closed form (Kuramoto 1975; Ott-Antonsen 2008 made it exact dynamics):
//     K_c = 2 * gamma            — below this coupling the crowd NEVER organizes, above it it must
//     r(K) = sqrt(1 - K_c / K)   — the exact branch above threshold
// Neither number appears in the update rule; the simulation knows only "nudge toward the average". The
// transition and its entire shape must EMERGE — the Onsager-m(T) idiom in a second field of physics.
//
// Lorentzian sampling is exact: omega = gamma * tan(pi (u - 1/2)) inverts the CDF, no rejection, seeded.
//
// couplingWRONG is EXPORTED FOR MEASUREMENT: it nudges with strength K r^2 instead of K r (a plausible-looking
// mean-field slip — "the coupling should scale with how coherent the crowd already is"). Every oscillator's
// motion stays locally sensible and the recovered r(K) sits on the WRONG curve. Deterministic throughout.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

function makeRng(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

function makeKuramoto({ N = 4096, gamma = 0.5, seed = 11 } = {}) {
    const rng = makeRng(seed);
    const omega = new Float64Array(N), theta = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        omega[i] = gamma * Math.tan(Math.PI * (rng() - 0.5));   // exact Lorentzian inverse-CDF
        theta[i] = 2 * Math.PI * rng();
    }
    return { N, gamma, omega, theta };
}

// one RK2 (midpoint) step of the mean-field dynamics. couplingFn(K, r) -> effective nudge strength; the correct
// physics is K*r, and the named-wrong variant below is what the gate measures against.
function orderParameter(theta, N) {
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) { cx += Math.cos(theta[i]); cy += Math.sin(theta[i]); }
    cx /= N; cy /= N;
    return { r: Math.hypot(cx, cy), psi: Math.atan2(cy, cx) };
}
function step(sys, K, dt, couplingFn) {
    const { N, omega, theta } = sys;
    const o1 = orderParameter(theta, N);
    const g1 = couplingFn(K, o1.r);
    // midpoint: advance half, recompute field, full step with midpoint field
    const half = new Float64Array(N);
    for (let i = 0; i < N; i++) half[i] = theta[i] + 0.5 * dt * (omega[i] + g1 * Math.sin(o1.psi - theta[i]));
    const o2 = orderParameter(half, N);
    const g2 = couplingFn(K, o2.r);
    for (let i = 0; i < N; i++) theta[i] += dt * (omega[i] + g2 * Math.sin(o2.psi - half[i]));
    return o2.r;
}

const couplingMeanField = (K, r) => K * r;
const couplingWRONG = (K, r) => K * r * r;   // plausible-looking slip; wrong curve. DO NOT SIMULATE WITH THIS.

// measure the stationary order parameter at coupling K: transient, then average r.
function measureR({ K, N = 4096, gamma = 0.5, seed = 11, dt = 0.05, transient = 1200, samples = 1200, coupling = couplingMeanField } = {}) {
    const sys = makeKuramoto({ N, gamma, seed });
    for (let i = 0; i < transient; i++) step(sys, K, dt, coupling);
    let acc = 0;
    for (let i = 0; i < samples; i++) acc += step(sys, K, dt, coupling);
    return acc / samples;
}

// the exact infinite-N branch for the Lorentzian: 0 below K_c = 2 gamma, sqrt(1 - Kc/K) above.
function exactR(K, gamma) { const Kc = 2 * gamma; return K <= Kc ? 0 : Math.sqrt(1 - Kc / K); }

// sweep K and return the measured curve beside the exact one.
function rCurve({ Ks = [0.6, 0.9, 1.2, 1.5, 2.0, 2.5], gamma = 0.5, N = 4096, seed = 11, coupling = couplingMeanField } = {}) {
    return Ks.map((K) => ({ K, r: measureR({ K, N, gamma, seed: seed + Math.round(K * 100), coupling }), exact: exactR(K, gamma) }));
}

export { makeRng, makeKuramoto, orderParameter, step, couplingMeanField, couplingWRONG, measureR, exactR, rCurve };
if (typeof module !== "undefined" && module.exports) module.exports = { makeRng, makeKuramoto, orderParameter, step, couplingMeanField, couplingWRONG, measureR, exactR, rCurve };
