// WebGLEngine/brain/missionTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SUBMARINE'S HARDER JOBS: brain/subTask.mjs asks a pilot to hold a depth, a heading and a speed that never move. A mission moves them. Two missions, each flown through THE SAME PILOT CONTRACT
// ((state, target, current) -> { pitch, yaw, thrust, ballast }) by a GUIDANCE layer that turns the mission and the vessel's SENSORS into the target every tick -- so the PD autopilot (brain/autopilotSub.mjs) and the
// connectome-wired network (brain/pilotSubPolicy.mjs) fly these without a change, and a pilot trained on depth-hold is asked, here, what it learned.
//
//   terrain     hold ALTITUDE (10 m) above a rolling seabed along a track. The seabed is a deterministic function of (x, y): a 45 m base, a 3..5 m swell of 100..160 m wavelength along the track, a 1..2 m ripple of
//               50..80 m, and a 2..3 m cross-track swell -- so it lies 35..55 m down and its slope stays under ~0.55 (the pilot can climb 22 degrees). The vessel is told the seabed by TWO NOISY SENSORS and nothing else:
//               an ALTIMETER (the range from the hull's underside straight down, noise sd 0.15 m) and a FORWARD SOUNDER (the seabed's depth 20 m ahead along the heading, noise sd 0.3 m). Guidance asks for the depth
//               that keeps 10 m above the SHALLOWER of the two (it sees a ridge coming), clamped to 12..60 m. Obstacles are NOT modelled: the only thing in the water is the floor.
//   waypoint    visit three waypoints (x, y, depth) in order, 150 s. A waypoint is REACHED within 10 m horizontally and 4 m in depth. Guidance points the heading at the active waypoint (bearing atan2(-dy, dx), the
//               engine's heading: 0 = +x, a right turn increases it), asks for its depth, and a 3 m/s cruise. THE VESSEL KNOWS WHERE IT IS (a perfect position fix: no dead-reckoning drift, which a real boat has and a
//               current would cause) -- said plainly, because it is the optimistic half of this task.
//   Each mission comes in still water and in a current (a steady 0.5 m/s with eddies, and a weight error of up to 0.6%): KINDS = terrain, terrain-current, waypoint, waypoint-current.
//
// THE SCORE is minus the mean per-tick error, 30 ticks a second. terrain: min(3, |altitude - 10| / 5 m); waypoint: min(3, distance to the active waypoint / 25 m) until the third is reached, then 0 -- so finishing
// early is rewarded and a missed waypoint is charged every tick. A dive that ENDS (broaching, the crush depth, the SEABED -- the hull's underside meets the terrain) is charged 3, the worst tick, for every tick it did not fly.
// Pure: no DOM, no clock, no Math.random (the sensor noise is a hash of the scenario seed, the tick and the channel).
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import { createActuators } from "../physics/mechanics/subActuators.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = S.DT, ALTITUDE = 10, SONAR_RANGE = 20, ALT_NOISE = 0.15, SONAR_NOISE = 0.3, WORST_TICK = 3;
export const SECONDS = Object.freeze({ terrain: 90, waypoint: 150 });
export const KINDS = Object.freeze(["terrain", "terrain-current", "waypoint", "waypoint-current"]);
export const REACH = Object.freeze({ horizontal: 10, depth: 4 });
export const CRUISE = 3.0;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The seabed's depth (m, positive down) at (x, y) for a terrain { base, a1, l1, p1, a2, l2, p2, b, ly, py }. */
export const seabedAt = (t, x, y) => t.base + t.a1 * Math.sin(2 * Math.PI * x / t.l1 + t.p1) + t.a2 * Math.sin(2 * Math.PI * x / t.l2 + t.p2) + t.b * Math.sin(2 * Math.PI * y / t.ly + t.py);
/** The steepest the seabed can be along x: the two along-track terms' slopes added (an upper bound; the cross-track term has none along x). */
export const maxSlope = (t) => 2 * Math.PI * (t.a1 / t.l1 + t.a2 / t.l2);

/** Deterministic, roughly gaussian noise (the sum of four uniforms, scaled to unit sd) from a seed, a tick and a channel. */
export function noise(seed, tick, channel) {
    const r = mulberry((Math.imul(seed + 7, 0x9E3779B1) ^ Math.imul(tick + 1, 0x85EBCA6B) ^ Math.imul(channel + 3, 0xC2B2AE35)) >>> 0);
    return (r() + r() + r() + r() - 2) * Math.sqrt(3);   // each uniform has variance 1/12; four of them 1/3; times sqrt(3) is unit
}

/** A scenario: { seed, kind, mission ("terrain" | "waypoint"), start, terrain (terrain only), waypoints (waypoint only), current, weightError }. */
export function scenario(seed, kind = "terrain") {
    if (!KINDS.includes(kind)) throw new Error(`missionTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 53) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const mission = kind.startsWith("terrain") ? "terrain" : "waypoint", withCurrent = kind.endsWith("-current");
    let terrain = null, waypoints = null, start;
    if (mission === "terrain") {
        terrain = Object.freeze({ base: 45, a1: u(3, 5), l1: u(100, 160), p1: u(0, 6.28), a2: u(1, 2), l2: u(50, 80), p2: u(0, 6.28), b: u(2, 3), ly: u(120, 200), py: u(0, 6.28) });
        const d0 = seabedAt(terrain, 0, 0) - ALTITUDE;
        start = { depth: d0, speed: u(2, 3), pitch: u(-0.05, 0.05), bank: u(-0.08, 0.08), heading: 0, gamma: 0, w: [0, 0, 0] };
    } else {
        start = { depth: u(20, 30), speed: u(2, 3), pitch: u(-0.05, 0.05), bank: u(-0.08, 0.08), heading: 0, gamma: 0, w: [0, 0, 0] };
        let x = 0, y = 0, hd = 0; const wps = [];
        for (let i = 0; i < 3; i++) {
            hd += i === 0 ? u(-0.8, 0.8) : u(-1.0, 1.0); const d = i === 0 ? u(60, 110) : u(60, 100);
            x += d * Math.cos(hd); y -= d * Math.sin(hd); wps.push(Object.freeze({ x, y, depth: u(15, 40) }));
        }
        waypoints = Object.freeze(wps);
    }
    let current = null;
    if (withCurrent) {
        const mean = [u(-0.4, 0.4), u(-0.4, 0.4), u(-0.05, 0.05)], amp = [u(0.05, 0.15), u(0.05, 0.15), u(0.02, 0.06)];
        current = Object.freeze({ mean, amp, freq: [[u(0.1, 0.25), u(0.5, 0.9)], [u(0.1, 0.25), u(0.5, 0.9)], [u(0.15, 0.3), u(0.6, 1.0)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] });
    }
    return Object.freeze({ seed, kind, mission, start: Object.freeze(start), terrain, waypoints, current, weightError: withCurrent ? u(-0.006, 0.006) : 0 });
}

/** The vessel's sensors for a terrain scenario at a tick: { altimeter (m from the hull's underside to the floor), sonar (the floor's depth 20 m ahead) }, both noisy. */
export function sense(sc, state, tick, model) {
    const a = S.attitude(state), t = sc.terrain, R = model.spec.radius, x = state.pos[0], y = state.pos[1];
    const ahead = [x + SONAR_RANGE * Math.cos(a.heading), y - SONAR_RANGE * Math.sin(a.heading)];
    return { altimeter: seabedAt(t, x, y) - a.depth - R + ALT_NOISE * noise(sc.seed, tick, 0), sonar: seabedAt(t, ahead[0], ahead[1]) + SONAR_NOISE * noise(sc.seed, tick, 1) };
}

/** The target for a terrain mission from the sensors alone: 10 m above the shallower of the floor under the hull and the floor ahead, clamped to 12..60 m. The heading and speed hold. */
export function terrainTarget(state, sensors, model, cruise = CRUISE) {
    const a = S.attitude(state), under = a.depth + model.spec.radius + sensors.altimeter;
    return { depth: clamp(Math.min(under, sensors.sonar) - ALTITUDE, 12, 60), heading: 0, speed: cruise };
}

/** The target for a waypoint mission: the active waypoint's depth, the bearing to it, the cruise. */
export function waypointTarget(state, wp, cruise = CRUISE) {
    const dx = wp.x - state.pos[0], dy = wp.y - state.pos[1];
    return { depth: wp.depth, heading: Math.atan2(-dy, dx), speed: cruise };
}

/** Has the vessel reached the waypoint? Within REACH.horizontal of it on the plane and REACH.depth in depth. */
export const reached = (state, wp) => Math.hypot(wp.x - state.pos[0], wp.y - state.pos[1]) <= REACH.horizontal && Math.abs(-state.pos[2] - wp.depth) <= REACH.depth;

let MODEL = null;
const missionModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));   // the floor is the terrain, not a flat plane

/**
 * Fly one scenario with `pilot` ((state, target, current) -> controls). Returns { score, status ("submerged" | "broached" | "grounded" | "crushed" | "lost"), ticks, meanErr, reachedCount (waypoint), meanAltErr
 * (terrain), minClearance (the least hull-to-floor gap, m), final, fingerprint }. `actuators` puts the slew limits between the pilot and the vessel. Deterministic.
 */
export function fly(pilot, sc, { seconds = SECONDS[sc.mission], dt = DT, model = missionModel(), actuators = null } = {}) {
    const act = actuators ? createActuators(actuators) : null, total = Math.round(seconds / dt), R = model.spec.radius, L = model.spec.length;
    let s = S.createState({ ...sc.start, model }), status = "submerged", flown = 0, errSum = 0, idx = 0, minClear = Infinity, h = 0x811c9dc5;
    const done = () => sc.mission === "waypoint" && idx >= sc.waypoints.length;
    for (let i = 0; i < total; i++) {
        let target;
        if (sc.mission === "terrain") target = terrainTarget(s, sense(sc, s, i, model), model);
        else target = done() ? waypointTarget(s, sc.waypoints[sc.waypoints.length - 1]) : waypointTarget(s, sc.waypoints[idx]);
        const cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, act ? act.step(cmd, dt) : cmd, dt, cv, sc.weightError);
        s = res.state;
        let st = res.status;
        const a = S.attitude(s, cv), clear = sc.mission === "terrain" ? seabedAt(sc.terrain, s.pos[0], s.pos[1]) - a.depth - (R * Math.cos(a.pitch) + 0.5 * L * Math.abs(Math.sin(a.pitch))) : Infinity;
        if (st === "submerged" && clear <= 0) st = "grounded";
        if (st !== "submerged") { status = st; break; }
        if (clear < minClear) minClear = clear;
        let e;
        if (sc.mission === "terrain") e = Math.min(3, Math.abs(seabedAt(sc.terrain, s.pos[0], s.pos[1]) - a.depth - R - ALTITUDE) / 5);
        else { if (!done() && reached(s, sc.waypoints[idx])) idx++; const w = done() ? null : sc.waypoints[idx]; e = w ? Math.min(3, Math.hypot(w.x - s.pos[0], w.y - s.pos[1], w.depth - a.depth) / 25) : 0; }
        errSum += e; flown++;
        if (i % 30 === 0) for (const c of [s.pos[0], s.pos[1], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const score = -(errSum + WORST_TICK * (total - flown)) / total, f = S.attitude(s);
    return { score, status, ticks: flown, meanErr: errSum / Math.max(1, flown), reachedCount: sc.mission === "waypoint" ? idx : null, minClearance: Number.isFinite(minClear) ? minClear : null, final: { depth: f.depth, x: s.pos[0], y: s.pos[1] }, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16) };
}

// ---- the sets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mk = (seeds) => Object.freeze(KINDS.flatMap((k) => seeds.map((s) => scenario(s, k))));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const TRAIN_SET = mk(range(1, 8)), HELD_OUT_SET = mk(range(11, 18)), BASELINE_SET = mk(range(501, 506));

/** `pilot` over a set: { score, runs, crashed, byKind }. */
export function evaluate(pilot, set, opts = {}) {
    const runs = set.map((sc) => fly(pilot, sc, opts)), byKind = {};
    for (const k of KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
    return { score: runs.reduce((a, r) => a + r.score, 0) / runs.length, runs, crashed: runs.filter((r) => r.status !== "submerged").length, byKind };
}
export const describeEval = (r) => `${r.score.toFixed(4)} (${KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.crashed} ended early)`;
