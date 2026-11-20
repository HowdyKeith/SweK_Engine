// WebGLEngine/brain/flyGfLoomModel.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/flyGfLoomModel-selfcheck.mjs; the data note is brain/FLY_RETINOTOPY_RF_WIP.md)
//
// THE FLY'S GIANT FIBER LOOMING INPUT AS PUBLISHED: the membrane-potential model of Ache et al. 2019, "Neural basis for looming size and velocity encoding in the Drosophila giant fiber escape pathway", Current Biology 29:1073-1081,
// doi 10.1016/j.cub.2019.01.079, STAR Methods "GF Model" (equations 1 to 7) and Figures 2, 3, 4, S3, S4. The Giant Fiber's depolarisation during a looming dark disk is the weighted sum of four components of the disk's angular size theta (degrees) and expansion velocity:
//   LC4  (rho, velocity)        V_LC4   = C1 * dtheta/dt (t - d1)                                               linear in the angular velocity (degrees/second), through the origin
//   LPLC2 (eta, size)           V_LPLC2 = C2 * exp( -(ln theta(t - d2) - ln C3)^2 / (2 C4^2) )                  a Gaussian in the LOGARITHM of the size, peak at theta = C3 = 42 degrees
//   inhibition 1 (tonic, size)  V_i1    = C5 + C6 / (1 + exp(-(theta(t - d3) - C7) / C8))                       a sigmoid of size: +0.06 mV at small sizes, about -0.47 mV at 90 degrees (the tonic hyperpolarisation of a large disk); source cells not identified
//   inhibition 2 (LC4-dependent) V_i2   = C9 * exp( -(theta(t - d4) - C10)^2 / (2 C11^2) )                      a small Gaussian of size, peak -0.52 mV at 26 degrees
//   V_GF = W_LPLC2 V_LPLC2 + W_LC4 V_LC4 + W_i1 V_i1 + W_i2 V_i2, smoothed over 2.5 ms (a moving average).
// A looming disk is the 2D retinal projection of an object of radius r approaching at constant speed v: theta(t) = 2 atan(r / (v |t|)), t < 0 before the virtual contact at t = 0; r/v (the half size to speed ratio) was 10, 20, 40 and 80 ms in the paper, the disk
// expanding from 10 to 90 degrees (5 to 90 in the wild-type controls) and then held. The time of the stimulus is the time of the DISK; each component is a function of the disk's state d seconds EARLIER (the sensory delays d1 to d4), so a component is 0 until its delay has passed.
// WHAT THIS IS AND IS NOT, SAID PLAINLY: a fitted description of the Giant Fiber's SUB-THRESHOLD potential in the paper's regime (one dark looming disk, centred at 11 degrees elevation and 50 degrees azimuth, 90 degrees of range, a fly recorded in a patch-clamp rig). It has NO spatial term: where the
// loom is centred is not an input, and a loom off the paper's position is not covered. It does not make the Giant Fiber spike or the fly jump (a spike near the peak depolarisation drives the escape; the threshold is not in the model). The two inhibitory components do not come from
// identified cells. R^2 against the paper's own control responses: 0.78 to 0.86 over r/v (Figure 4C); the component weights were fitted by least squares (Figure S4). The paper deposits the original MATLAB in ModelDB (Yale SenseLab model 230400); this file was written from the equations in the paper, not from that code, and has NOT been compared with it.
// *** A KNOWN TENSION IN THE PUBLISHED NUMBERS, NOT RESOLVED HERE ***: the constants are implemented as printed. The tonic inhibition V_i1 is -0.47 mV at 90 degrees, in line with the measured tonic hyperpolarisation of a 90 degree disk (about -0.55 mV, Figure S3C); but the printed weight W_i1 = 2.27 multiplies it,
// which makes the modelled tonic hyperpolarisation about -1.07 mV, twice the measurement. Either the weight belongs to a differently scaled V_i1 in the original code, or the printed value is not the one used. The original MATLAB (ModelDB, Yale SenseLab 230400) would settle it; it was not compared.
// Pure: no DOM, no clock, no Math.random, no file.
"use strict";

/** The constants of Ache et al. 2019, equations 3 to 7 (the STAR Methods "GF Model"). Units: delays in seconds, angles in degrees, potentials in millivolts. */
export const CONSTANTS = Object.freeze({
    C1: 0.0002567, d1: 0.019,                                   // eq. 3: mV per (degree/second), the sensory delay measured in LPLC2-silenced flies
    C2: 1.7, C3: 42, C4: 0.52, d2: 0.019,                       // eq. 4
    C5: -0.53, C6: 0.59, C7: 66, C8: -11, d3: 0.0375,           // eq. 5
    C9: -0.52, C10: 26, C11: 7.8, d4: 0.011,                    // eq. 6
    W_LPLC2: 1.45, W_LC4: 1.62, W_i1: 2.27, W_i2: 1,           // eq. 7: the final weights (the first two-parameter fit of the main text gave 1.1 for LPLC2 and 1.5 for LC4)
    smoothSeconds: 0.0025,
});

const DEG = 180 / Math.PI;
const fin = (v) => typeof v === "number" && Number.isFinite(v);

/** Angular size (degrees) of the looming disk at time t (seconds, t < 0 before contact) for half-size-to-speed ratio `rv` (seconds): 2 atan(rv / |t|). t = 0 and later is the full 180. */
export function loomTheta(rv, t) { return t >= 0 ? 180 : 2 * Math.atan(rv / -t) * DEG; }

/** Angular velocity (degrees/second) of that looming disk: d/dt of 2 atan(rv / (-t)) = 2 rv / (t^2 + rv^2) radians/second. */
export function loomThetaDot(rv, t) { return (2 * rv / (t * t + rv * rv)) * DEG; }

/**
 * The stimulus: a dark disk looming with r/v = `rv` seconds from `theta0` to `theta1` degrees (default 10 and 90), then held at theta1. Returns the function of time { theta(t), thetaDot(t), start, stop } (seconds; t = 0 is the virtual contact),
 * with theta and thetaDot 0 before `start` (the disk is not there) and thetaDot 0 after `stop` (held). `start` is when the disk is theta0, `stop` when it reaches theta1.
 */
export function loomStimulus(rv, { theta0 = 10, theta1 = 90 } = {}) {
    if (!(fin(rv) && rv > 0)) throw new Error(`flyGfLoomModel.loomStimulus: r/v is a positive number of seconds, got ${rv}`);
    if (!(fin(theta0) && fin(theta1) && theta0 > 0 && theta1 > theta0 && theta1 < 180)) throw new Error(`flyGfLoomModel.loomStimulus: 0 < theta0 < theta1 < 180 degrees, got ${theta0}, ${theta1}`);
    const start = -rv / Math.tan((theta0 / 2) / DEG), stop = -rv / Math.tan((theta1 / 2) / DEG);
    return { start, stop, theta: (t) => (t < start ? 0 : t >= stop ? theta1 : loomTheta(rv, t)), thetaDot: (t) => (t < start || t >= stop ? 0 : loomThetaDot(rv, t)) };
}

/** A disk expanding at a constant angular velocity `va` degrees/second from 0 to `theta1` (eq. 2, theta = va t), then held. Same shape as loomStimulus (t = 0 is the start; stop is theta1 / va). */
export function constantVelocityStimulus(va, { theta1 = 90 } = {}) {
    if (!(fin(va) && va > 0)) throw new Error(`flyGfLoomModel.constantVelocityStimulus: the angular velocity is a positive number, got ${va}`);
    const stop = theta1 / va;
    return { start: 0, stop, theta: (t) => (t < 0 ? 0 : t >= stop ? theta1 : va * t), thetaDot: (t) => (t < 0 || t >= stop ? 0 : va) };
}

/** The four components of the paper's model at time t for a stimulus (from loomStimulus or constantVelocityStimulus), in millivolts, each BEFORE its weight: { lc4, lplc2, i1, i2 }. A component is 0 until the stimulus has been on for its delay. */
export function components(stim, t, K = CONSTANTS) {
    const at = (d) => t - d, th = (d) => stim.theta(at(d)), on = (d) => at(d) >= stim.start;
    const th2 = th(K.d2), th3 = th(K.d3), th4 = th(K.d4);
    return {
        lc4: on(K.d1) ? K.C1 * stim.thetaDot(at(K.d1)) : 0,
        lplc2: on(K.d2) && th2 > 0 ? K.C2 * Math.exp(-((Math.log(th2) - Math.log(K.C3)) ** 2) / (2 * K.C4 * K.C4)) : 0,
        i1: on(K.d3) ? K.C5 + K.C6 / (1 + Math.exp(-(th3 - K.C7) / K.C8)) : 0,
        i2: on(K.d4) ? K.C9 * Math.exp(-((th4 - K.C10) ** 2) / (2 * K.C11 * K.C11)) : 0,
    };
}

/** The Giant Fiber's modelled potential at one instant (millivolts, no smoothing): the weighted sum of the four components. `weights` overrides CONSTANTS' W_* (a silenced input is weight 0). */
export function gfPotential(stim, t, { weights = null, K = CONSTANTS } = {}) {
    const W = { W_LPLC2: K.W_LPLC2, W_LC4: K.W_LC4, W_i1: K.W_i1, W_i2: K.W_i2, ...(weights || {}) }, c = components(stim, t, K);
    return W.W_LPLC2 * c.lplc2 + W.W_LC4 * c.lc4 + W.W_i1 * c.i1 + W.W_i2 * c.i2;
}

/**
 * The modelled response over a time grid: { t, v, parts: { lc4, lplc2, i1, i2 } (weighted) } from `t0` to `t1` seconds in steps of `dt` (default 0.5 ms), smoothed over K.smoothSeconds (a centred moving average). `weights` as in gfPotential.
 */
export function gfResponse(stim, { t0 = null, t1 = 0.1, dt = 0.0005, weights = null, K = CONSTANTS } = {}) {
    const a = t0 === null ? stim.start - 0.05 : t0, n = Math.floor((t1 - a) / dt) + 1, t = new Array(n), raw = new Array(n);
    const W = { W_LPLC2: K.W_LPLC2, W_LC4: K.W_LC4, W_i1: K.W_i1, W_i2: K.W_i2, ...(weights || {}) }, parts = { lc4: new Array(n), lplc2: new Array(n), i1: new Array(n), i2: new Array(n) };
    for (let i = 0; i < n; i++) {
        t[i] = a + i * dt; const c = components(stim, t[i], K);
        parts.lc4[i] = W.W_LC4 * c.lc4; parts.lplc2[i] = W.W_LPLC2 * c.lplc2; parts.i1[i] = W.W_i1 * c.i1; parts.i2[i] = W.W_i2 * c.i2;
        raw[i] = parts.lc4[i] + parts.lplc2[i] + parts.i1[i] + parts.i2[i];
    }
    const half = Math.max(0, Math.round(K.smoothSeconds / dt / 2)), v = raw.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { s += raw[j]; c++; } return s / c; });
    return { t, v, parts };
}

/** The time of the response's peak (seconds, t = 0 the virtual contact; so before contact it is negative) and its height (millivolts), or null for an empty response. */
export function peak(resp) {
    if (!resp || !resp.v.length) return null;
    let k = 0; for (let i = 1; i < resp.v.length; i++) if (resp.v[i] > resp.v[k]) k = i;
    return { t: resp.t[k], v: resp.v[k] };
}

/** The peak time of the model for each half-size-to-speed ratio in `rvs` (seconds), with the given `weights` (null = the paper's): [{ rv, t, v }]. The paper's Figure 4B is this against r/v (time relative to the virtual contact). */
export function peakTimes(rvs, { weights = null, K = CONSTANTS, theta0 = 10, theta1 = 90, dt = 0.0002 } = {}) {
    return rvs.map((rv) => { const s = loomStimulus(rv, { theta0, theta1 }), r = gfResponse(s, { t1: 0.2, dt, weights, K }), p = peak(r); return { rv, t: p.t, v: p.v }; });
}

export function reportLines() {
    const p = peakTimes([0.01, 0.02, 0.04, 0.08]);
    return ["[flyGfLoomModel] the Giant Fiber looming input (Ache et al. 2019, Curr Biol 29:1073): V_GF = " + CONSTANTS.W_LPLC2 + " V_LPLC2(size, Gaussian in ln theta, peak " + CONSTANTS.C3 + " deg) + " + CONSTANTS.W_LC4 + " V_LC4(" + CONSTANTS.C1 + " x angular velocity) + " + CONSTANTS.W_i1 + " V_i1 + " + CONSTANTS.W_i2 + " V_i2",
        "  peak time relative to contact for r/v 10, 20, 40, 80 ms: " + p.map((x) => (x.t * 1000).toFixed(0) + " ms").join(", ")];
}
