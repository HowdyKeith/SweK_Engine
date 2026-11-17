// WebGLEngine/brain/navMission.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART 2 of brain/NAV_MISSIONS_WIP.md, written before this file; the study is
// tools/ship/navMissionStudy.mjs; the gate is brain/navMission-selfcheck.mjs)
//
// THREE-LEG MISSIONS ON ONE BATTERY. A hard-traffic sea (brain/subHardNav.mjs, unchanged), three waypoints, one clock (the ships sail on across legs) and one 3 MJ battery metered by the
// needs model's own power (brain/navEnergy.mjs) with no recharge: the mission ends FLAT when it is spent. Each leg is flyHard's flight for its waypoint -- the loop below is flyHard's
// own, with the waypoint switched on arrival and the plan rebuilt for the next one on the next tick; the gate holds a one-waypoint mission equal to flyHard. No clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as E from "./navEnergy.mjs";
import * as AP from "./autopilotSub.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const LEGS = 3, LEG_S = H.SECONDS_HARD, ECO_SPEED = 2.0, WAYPOINT_TRIES = 200, CLEAR_M = 40;
export const KIND = "hard-traffic", BASE_ARM = "any+predict+edge+yield";
export const ARMS = Object.freeze({ "any+predict+edge+yield": Object.freeze({ arm: "any+predict+edge+yield", eco: false }), "any+predict": Object.freeze({ arm: "any+predict", eco: false }), eco: Object.freeze({ arm: "any+predict+edge+yield", eco: true }) });
export const ARM_NAMES = Object.freeze(Object.keys(ARMS)), DESIGNATED = "eco", REFERENCE = "any+predict+edge+yield";
export const HELD83 = Object.freeze(N.range(7941, 8000)), DEV = Object.freeze(N.range(1, 30));

/** A waypoint stands if it is r + CLEAR_M from every static obstacle and CLEAR_M from the previous waypoint (the scenario generator's rule for its goal). */
const stands = (sc, p, prev) => sc.obstacles.every((o) => (o.vx || o.vy ? true : Math.hypot(p.x - o.x, p.y - o.y) >= o.r + CLEAR_M)) && Math.hypot(p.x - prev.x, p.y - prev.y) >= CLEAR_M;
/** The mission of a seed: { seed, sc, waypoints [W1 (the scenario's goal), W2 (x 40-120), W3 (x 280-400, y on the side opposite W1's)] } or null when a waypoint cannot be placed. */
export function missionOf(seed) {
    const sc = H.hardScenario(seed, KIND), r = mulberry(((seed * 2654435761) ^ 0x5eed) >>> 0), u = (lo, hi) => lo + (hi - lo) * r(), w1 = { ...sc.goal };
    const draw = (xlo, xhi, ylo, yhi, prev) => { for (let k = 0; k < WAYPOINT_TRIES; k++) { const p = { x: u(xlo, xhi), y: u(ylo, yhi), depth: u(15, 40) }; if (stands(sc, p, prev)) return p; } return null; };
    const w2 = draw(40, 120, -80, 80, w1); if (!w2) return null;
    const w3 = w1.y >= 0 ? draw(280, 400, -80, 0, w2) : draw(280, 400, 0, 80, w2); if (!w3) return null;
    return Object.freeze({ seed, sc, waypoints: Object.freeze([w1, w2, w3].map((p) => Object.freeze(p))) });
}
/** AMENDMENT 1 (brain/NAV_MISSIONS_WIP.md): an arm's leg cap is LEG_S x CRUISE / its cruise -- the same distance budget a leg; eco's is 390 s. */
export const legSecondsOf = (armName) => (ARMS[armName] && ARMS[armName].eco ? (LEG_S * MT.CRUISE) / ECO_SPEED : LEG_S);
/** The eco pilot: the commanded speed capped at ECO_SPEED (only down), then `base`. */
export const ecoPilot = (base) => (s, target, cv) => base(s, target.speed > ECO_SPEED ? { ...target, speed: ECO_SPEED } : target, cv);
/**
 * Fly a mission (waypoints in order) under an arm of ARMS. Returns { arm, seed, status ("completed" | "flat" | "collided" | "left" | "timeout" | the vessel's own), completed, legs (reached),
 * legTimes, t, path, energy (J), battery (left, as a share of one), ticks }. `o` is { waypoints (override, the gate's one-waypoint mission), legSeconds, battery, base }.
 */
export function flyMission(mission, armName, o = {}) {
    const A = ARMS[armName]; if (!A) throw new Error(`navMission.flyMission: unknown arm "${armName}" (${ARM_NAMES.join(", ")})`);
    const sc = mission.sc, wps = o.waypoints || mission.waypoints, arm = A.arm, spec = H.ARM_SPEC[arm], dt = S.DT, model = E.navModel(), legTicks = Math.round((o.legSeconds ?? legSecondsOf(armName)) / dt), every = Math.max(1, Math.round(H.REPLAN_S / dt));
    const mode = spec.replan === "predict" ? "predict" : "now", capacity = o.battery ?? E.BATTERY_J, base = o.base || ((s, t, c) => AP.decide(s, t, c));
    const meter = E.meteredPilot(A.eco ? ecoPilot(base) : base, { model, dt });
    const st = sc.start; let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    // a leg's minDepth is flyHard's rule for it: the shallower of the depth the leg starts at and its waypoint's (the first leg: the scenario's own minDepth)
    let legMin = Math.min(st.depth, wps[0].depth);
    const plan = (goal, i, at) => H.buildLadderField(H.planShapes({ ...sc, minDepth: legMin }, i * dt, { mode, blind: spec.blind, horizon: H.HORIZON_S }), goal, at, i === 0 ? { ladder: H.MARGIN_LADDER, edgeExtra: spec.edge } : { ladder: H.MARGIN_LADDER, own: at, edgeExtra: spec.edge });
    let leg = 0, legStart = 0, field = spec.field ? plan(wps[0], 0, st) : null, status = "timeout", path = 0, ticks = 0, t = null; const legTimes = [];
    for (let i = 0; ; i++) {
        if (i - legStart >= legTicks) { status = "timeout"; break; }
        if (spec.field && spec.replan !== "none" && i > legStart && (i - legStart) % every === 0) field = plan(wps[leg], i, { x: s.pos[0], y: s.pos[1] });
        const target = H.hardTarget(arm, s, field, wps[leg], { obstacles: sc.obstacles, t: i * dt, at: H.posAt, minDepth: legMin, yieldSpeed: H.YIELD_SPEED });
        const cv = ST.currentAt(sc.current, i * dt), cmd = meter.pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1]; s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        if (sc.obstacles.some((ob) => H.gapTo(ob, x, y, -s.pos[2], now) < 0)) { status = "collided"; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (meter.meter.joules >= capacity) { status = "flat"; break; }
        if (MT.reached(s, wps[leg])) {
            legTimes.push(now - legStart * dt); leg++;
            if (leg === wps.length) { status = "completed"; t = now; break; }
            legStart = i + 1; legMin = Math.min(-s.pos[2], wps[leg].depth); if (spec.field) field = plan(wps[leg], i + 1, { x: s.pos[0], y: s.pos[1] });
        }
    }
    return { arm: armName, seed: mission.seed, kind: KIND, status, completed: status === "completed", legs: leg, legTimes, t, path, energy: meter.meter.joules, battery: Math.max(0, 1 - meter.meter.joules / capacity), ticks };
}
