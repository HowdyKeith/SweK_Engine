// WebGLEngine/brain/subMissionNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 10" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subMissionNav-selfcheck.mjs)
//
// MISSIONS AND WHAT A METRE COSTS. A mission is a hard-traffic scenario (brain/subHardNav.mjs: ships hold course, the planner is told their velocity) with TWO intermediate waypoints, start -> W1 -> W2 -> goal, flown on the submarine's BATTERY (physics/mechanics/subNeeds.mjs: 3 MJ, 200 W hotel load,
// |thrust x speed| / 0.5; a dead screw at 0 J). The plan, the field, the yield test and the vessel are subHardNav's, the energy is subNeeds', both CALLED not copied. OPTIMISTIC, said plainly: the vessel knows where it is, the map is exact, the ships' velocity is told exactly,
// the battery is tank-scale, the waypoints have no task and the order is fixed.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as NS from "../physics/mechanics/subNeeds.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const MISSION_ARMS = Object.freeze(["any+replan", "any+predict+edge", "any+predict+edge+yield", "any+predict+edge+yield@2.5"]), REFERENCE = "any+predict+edge+yield", DESIGNATED = "any+predict+edge+yield@2.5";
export const ECO_SPEED = 2.5, SECONDS_MISSION = 450, CLASS = "battery";
export const WAYPOINT = Object.freeze({ xLo: 40, xHi: 360, yLo: -100, yHi: 100, depthLo: 20, depthHi: 35, staticClear: 40, minLeg: 120, chordLo: 600, chordHi: 850, draws: 500 });
export const HELD10 = Object.freeze(N.range(1001, 1060)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held10: HELD10 });
// the arm's name in subHardNav's table and the speed cap
const BASE = Object.freeze({ "any+replan": ["any+replan", Infinity], "any+predict+edge": ["any+predict+edge", Infinity], "any+predict+edge+yield": ["any+predict+edge+yield", Infinity], "any+predict+edge+yield@2.5": ["any+predict+edge+yield", ECO_SPEED] });
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));
/** Joules per metre at a steady speed by the model's own trim: (hotel + |thrust x speed| / efficiency) / speed. */
export function joulesPerMetre(speed, model = navModel()) { const t = S.trim(model, speed), thrustN = model.spec.thrustMax * t.thrust; return NS.power(thrustN, speed) / speed; }

/**
 * The mission for a seed: { seed, scenario (hardScenario(seed, "hard-traffic") with minDepth the shallowest of the start and all waypoint depths), points [W1, W2, goal] ({ x, y, depth }), chords [3], chord (their sum), draws, dropped (no acceptable draw in WAYPOINT.draws: points then []) }.
 * `W` is the acceptance rule (default WAYPOINT; the gate passes an impossible one to reach the dropped branch). Draws come from a mulberry generator seeded from the seed (not the scenario's own). A draw is accepted when each waypoint is at least r + half-hull + staticClear from every STATIC obstacle, each leg is at least minLeg and the chord sum is within [chordLo, chordHi].
 */
export function missionFor(seed, W = WAYPOINT) {
    const sc = H.hardScenario(seed, "hard-traffic"), r = mulberry((seed * 15485863 + 7001) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const statics = sc.obstacles.filter((o) => o.type !== "ship"), free = (p) => statics.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= o.r + N.HULL_HALF + W.staticClear);
    for (let d = 1; d <= W.draws; d++) {
        const p1 = { x: u(W.xLo, W.xHi), y: u(W.yLo, W.yHi), depth: u(W.depthLo, W.depthHi) }, p2 = { x: u(W.xLo, W.xHi), y: u(W.yLo, W.yHi), depth: u(W.depthLo, W.depthHi) };
        if (!free(p1) || !free(p2)) continue;
        const pts = [sc.start, p1, p2, sc.goal], chords = [0, 1, 2].map((i) => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)), sum = chords[0] + chords[1] + chords[2];
        if (chords.some((c) => c < W.minLeg) || sum < W.chordLo || sum > W.chordHi) continue;
        const md = Math.min(sc.start.depth, p1.depth, p2.depth, sc.goal.depth);
        return { seed, scenario: Object.freeze({ ...sc, minDepth: md }), points: [p1, p2, { x: sc.goal.x, y: sc.goal.y, depth: sc.goal.depth }], chords, chord: sum, draws: d, dropped: false };
    }
    return { seed, scenario: sc, points: [], chords: [], chord: NaN, draws: W.draws, dropped: true };
}

/**
 * Fly a mission under an arm of MISSION_ARMS. Returns { arm, seed, status ("complete" | "energy-out" | "collided" | "left" | "timeout" | the vessel's own), complete, legs (waypoints reached, 0 to 3), t, path, chord, energyUsed (J), energyLeft (J), jPerM (energyUsed / path),
 * minClearance, ticks, hit, shipSpeed }. The battery starts full (or at `energy` J) and is integrated by the needs layer each tick; the mission ends the tick the charge reaches 0 before the goal.
 */
export function flyMission(pilot, mission, armName, { seconds = SECONDS_MISSION, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, yieldSpeed = H.YIELD_SPEED, horizon = H.HORIZON_S, energy = NS.CLASSES[CLASS].capacityJ } = {}) {
    if (!BASE[armName]) throw new Error(`subMissionNav.flyMission: unknown arm "${armName}" (${MISSION_ARMS.join(", ")})`);
    if (mission.dropped) throw new Error("subMissionNav.flyMission: the mission was dropped (no waypoints)");
    const [arm, cap] = BASE[armName], spec = H.ARM_SPEC[arm], sc = mission.scenario, st = sc.start, total = Math.round(seconds / dt), every = Math.max(1, Math.round(H.REPLAN_S / dt)), mode = spec.replan === "predict" ? "predict" : "now";
    const wps = mission.points;
    let leg = 0, needs = { ...NS.initialNeeds(CLASS), energy }, energyUsed = 0;   // `energy` (J) starts the battery part full by default; the gate starts it nearly empty to reach the energy-out branch
    const build = (t, from, withOwn) => H.buildLadderField(H.planShapes(sc, t, { mode, blind: spec.blind, horizon }), wps[leg], from, withOwn ? { ladder, own: from, edgeExtra: spec.edge } : { ladder, edgeExtra: spec.edge });
    let field = build(0, st, false);
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt)), Infinity);
    let status = "timeout", path = 0, minClear = clearAt(st.x, st.y, st.depth, 0), ticks = 0, t = null, hit = null;
    for (let i = 0; i < total; i++) {
        if (spec.replan !== "none" && i > 0 && i % every === 0) field = build(i * dt, { x: s.pos[0], y: s.pos[1] }, true);
        let target = H.hardTarget(arm, s, field, wps[leg], { obstacles: sc.obstacles, t: i * dt, at: H.posAt, minDepth: sc.minDepth, yieldSpeed });
        if (target.speed > cap) target = { ...target, speed: cap };
        const cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = NS.stepNeeds(model, s, needs, cmd, dt, cv, sc.weightError), px = s.pos[0], py = s.pos[1];
        energyUsed += res.watts * dt; needs = res.needs; s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearAt(x, y, -s.pos[2], now);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; hit = (sc.obstacles.find((o) => H.gapTo(o, x, y, -s.pos[2], now) < 0) || {}).type || null; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, wps[leg])) {
            leg++;
            if (leg === wps.length) { status = "complete"; t = now; break; }
            field = build(now, { x, y }, true);
        }
        if (needs.energy <= 0) { status = "energy-out"; break; }
    }
    return { arm: armName, seed: mission.seed, status, complete: status === "complete", legs: leg, t, path, chord: mission.chord, energyUsed, energyLeft: needs.energy, jPerM: path > 0 ? energyUsed / path : NaN, minClearance: minClear, ticks, hit, shipSpeed: sc.shipSpeed };
}
