// WebGLEngine/brain/autopilotSub.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HAND-WRITTEN PILOT FOR THE SUBMARINE: hold a depth, a speed and a heading, in the pilot's senses (physics/mechanics/subModel6dof.mjs), from four numbers out -- pitch, yaw, thrust, ballast. It is brain/autopilotFlight.mjs
// for the water: the baseline the learned pilot (brain/pilotSubPolicy.mjs) is graded against and, written through that network, the START it is trained from. A CASCADE OF PD LOOPS WITH NO MEMORY (no integrator, no state),
// so it is exactly the thing a feed-forward network can be made to equal:
//   DEPTH -> CLIMB     vzCmd = -clamp(kDepth * depth error, +-vzMax)               a climb RATE is asked for, never a pitch attitude (positive error = the target is deeper)
//   CLIMB -> PITCH     pitchCmd = clamp(vzCmd / V, +-maxPitch)                     the planes steer the vessel along its own axis, so a climb rate is a pitch at the speed it has
//   PITCH -> PLANES    pitch = sched (kTheta (pitchCmd - pitch) - kQ pitchRate)    sched = (2.5 / V)^2, clamped: a plane's force goes as V^2, so a slow vessel gets more stick, a fast one less
//   DEPTH -> BALLAST   ballast = clamp(kBalD depth error + kBalV climb)            the planes are useless at rest; the tank is the vessel's vertical channel there, and it trims out a leak (a steady weight error)
//   HEADING -> YAW     yaw = sched (kHdg heading error - kR yawRate) - kBeta beta  a rate-damped turn, and the sideslip driven to zero
//   SPEED -> THRUST    thrust = trimThrust(target speed) + kSpd (V_target - V)
//
// WHAT IT CANNOT DO, said plainly and measured in brain/autopilotSub-selfcheck.mjs: with no integrator a steady weight error is held off by a steady depth error (the tank's gain sets how large: kBalD per metre against a 3% range),
// it has no idea of the seabed or the surface (a target outside the water is a broach or a grounding), and the planes' gain schedule bottoms out near 0.8 m/s -- below it the pilot is the tank alone.
//
// Pure: no DOM, no clock, no random. `current` is the water's velocity (default still); speed, alpha and beta are READ RELATIVE TO THE WATER.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";

export const AUTOPILOT_SUB = Object.freeze({
    kDepth: 0.2, vzMax: 1.0, maxPitch: 0.3, kTheta: 15, kQ: 12, kBalD: 0.03, kBalV: 0.3, kHdg: 3, kR: 10, kBeta: 2, kSpd: 0.5, vRef: 2.5, vMin: 0.8, schedMax: 4, schedMin: 0.4,
});
export const TARGET_DEFAULT = Object.freeze({ depth: 30, heading: 0, speed: 2.5 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let DEFAULT_MODEL = null;
/** The default vessel's model (the TRAINER), built once. */
export const defaultModel = () => DEFAULT_MODEL || (DEFAULT_MODEL = S.createSubModel());

/**
 * Everything the laws use, computed once: the pilot's senses and the intermediate commands. A learned pilot's features are these (brain/pilotSubPolicy.mjs), so the hand weights and the hand controller read one set
 * of numbers. `target` is { depth, heading, speed }; heading is wrapped, so +-3.5 rad means what it means.
 */
export function guidance(state, target = TARGET_DEFAULT, current = [0, 0, 0], opts = {}) {
    const g = { ...AUTOPILOT_SUB, ...opts }, model = opts.model || defaultModel();
    const a = S.attitude(state, current), r = S.rates(state), V = a.speed, climb = state.vel[2];
    const depthErr = fin(target.depth) - a.depth, headingErr = wrapAngle(fin(target.heading) - a.heading), speedErr = fin(target.speed) - V;
    const vzCmd = -clamp(g.kDepth * depthErr, -g.vzMax, g.vzMax), pitchCmd = clamp(vzCmd / Math.max(V, g.vMin), -g.maxPitch, g.maxPitch);
    const sched = clamp((g.vRef / Math.max(V, g.vMin)) ** 2, g.schedMin, g.schedMax);
    return { att: a, rates: r, V, climb, depthErr, headingErr, speedErr, vzCmd, pitchCmd, pitchErr: pitchCmd - a.pitch, sched, thrTrim: S.trim(model, fin(target.speed)).thrust };
}

/** (state, target, current) -> { pitch, yaw, thrust, ballast }: the six laws in the header. */
export function decide(state, target = TARGET_DEFAULT, current = [0, 0, 0], opts = {}) {
    const g = { ...AUTOPILOT_SUB, ...opts }, d = guidance(state, target, current, opts), a = d.att, r = d.rates;
    return S.sanitize({
        pitch: d.sched * (g.kTheta * d.pitchErr - g.kQ * r.pitch),
        yaw: d.sched * (g.kHdg * d.headingErr - g.kR * r.yaw) - g.kBeta * a.beta,
        thrust: d.thrTrim + g.kSpd * d.speedErr,
        ballast: g.kBalD * d.depthErr + g.kBalV * d.climb,
    });
}

/** The autopilot as a pilot function: the contract brain/subTask.mjs flies. */
export const pilot = (opts = {}) => (state, target, current = [0, 0, 0]) => decide(state, target, current, opts);
