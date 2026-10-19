// WebGLEngine/tools/subDisturb.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE SUBMARINE PILOTS HAVE NEVER BEEN ASKED TO DO: fly on imperfect senses. Every task so far hands the pilot the exact state of the hull, the instant it is asked, and a current that is a gentle sum of two sines.
// This module takes those three kindnesses away, one knob each, around ANY pilot ((state, target, current) -> controls) and any scenario of brain/subTask.mjs:
//   SENSORS   the pilot is shown a copy of the state with noise on the depth (m), the attitude (rad, a small rotation of the hull), the velocity (m/s) and the body rates (rad/s). The noise is white, gaussian, drawn per tick from a
//             generator seeded from the dive, so a dive is exactly repeatable.
//   DELAY     the controls the pilot answers with reach the actuators `delayTicks` ticks late (1 tick = 1/30 s); until the first has aged, the hull is flown with zero controls.
//   GUSTS     the water's velocity is the scenario's current with its mean and amplitude multiplied by `gust` and a current ADDED to scenarios that have none (taken from the 'current' scenario of the same seed), so every dive
//             flies in moving water, harder as `gust` grows.
// LEVELS (named, so a table can say "level 2"): 0 clean | 1 a good INS and a short link (depth 0.1 m, attitude 0.3 deg, velocity 0.03 m/s, rates 0.003 rad/s, 0.1 s delay, gust x1) | 2 a rough one (x3 the noise, 0.2 s, gust x2) |
// 3 a bad day (x5 the noise, 0.3 s, gust x3). The pilot is NOT told: a pilot that holds its depth in level 3 holds it because it is robust, not because it was warned.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "../brain/subTask.mjs";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];

const BASE = Object.freeze({ depth: 0.1, attitude: 0.3 * Math.PI / 180, velocity: 0.03, rates: 0.003 });
export const LEVELS = Object.freeze([
    Object.freeze({ name: "clean", noise: 0, delayTicks: 0, gust: 0 }),
    Object.freeze({ name: "good INS, short link", noise: 1, delayTicks: 3, gust: 1 }),
    Object.freeze({ name: "rough", noise: 3, delayTicks: 6, gust: 2 }),
    Object.freeze({ name: "bad day", noise: 5, delayTicks: 9, gust: 3 }),
]);

/** A copy of `state` as the sensors report it: the same record with noisy pos[2] (depth), q (a small body-frame rotation), vel and w. noise 0 returns the state itself. */
export function sense(state, noise, r) {
    if (!(noise > 0)) return state;
    const a = BASE.attitude * noise, d = [gauss(r) * a * 0.5, gauss(r) * a * 0.5, gauss(r) * a * 0.5];   // half-angles: the quaternion of a small rotation (ex, ey, ez)
    const dq = [1, d[0], d[1], d[2]], n = Math.hypot(...dq), q = qmul(state.q, dq.map((v) => v / n));
    const pos = [...state.pos]; pos[2] += gauss(r) * BASE.depth * noise;
    return { ...state, q, pos, vel: state.vel.map((v) => v + gauss(r) * BASE.velocity * noise), w: state.w.map((v) => v + gauss(r) * BASE.rates * noise) };
}

/**
 * `pilot` wrapped: sensor noise and a control delay, fresh for every dive (a dive is recognised by its target object, which brain/subTask.mjs shares between the ticks of one scenario). `seed` makes the whole set repeatable.
 * Level is an index into LEVELS or a { noise, delayTicks } record.
 */
export function disturbed(pilot, level, seed = 1) {
    const L = typeof level === "number" ? LEVELS[level] : level;
    let target = null, r = null, buf = [], dive = 0;
    return (state, tgt, current) => {
        if (tgt !== target) { target = tgt; r = mulberry((seed * 2654435761 + ++dive * 40503) >>> 0); buf = []; }
        const c = pilot(sense(state, L.noise, r), tgt, current);
        if (!(L.delayTicks > 0)) return c;
        buf.push(c);
        return buf.length > L.delayTicks ? buf.shift() : { pitch: 0, yaw: 0, thrust: 0, ballast: 0 };
    };
}

/** A scenario with its water made harder: the current multiplied by `gust` (mean and amplitude), and a current added from the 'current' scenario of the same seed when there is none. gust 0 returns the scenario itself. */
export function gusty(sc, gust) {
    if (!(gust > 0)) return sc;
    const base = sc.current || T.scenario(sc.seed, "current").current;
    return Object.freeze({ ...sc, current: Object.freeze({ ...base, mean: base.mean.map((v) => v * gust), amp: base.amp.map((v) => v * gust) }) });
}
export const gustySet = (set, gust) => set.map((sc) => gusty(sc, gust));
