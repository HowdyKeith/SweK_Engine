// WebGLEngine/brain/subFleetNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 12" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subFleetNav-selfcheck.mjs)
//
// A FLEET OF COURIERS IN THE TANK'S SEA, headless. brain/subTankNav.mjs's couriers sail alone: the other subs are not in the plan. Here N couriers are flown together (the studies' autopilot, one navigator each) and two arms are compared: `any+predict` (the tank's own navigator, the other subs invisible to it) and `fleet`
// (the same plan and goal logic, written out here, with every OTHER sub a moving full-depth disc of the half-hull's radius in the plan at each replan). subTankNav, subHardNav and the autopilot are CALLED, not edited. OPTIMISTIC, said plainly: every sub sees every other's exact position and velocity, there is no
// negotiation (all couriers run one rule), a sub is a full-depth column in the plan, and this is a model of the tank page and not the page.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as TN from "./subTankNav.mjs";

export const FLEET_ARMS = Object.freeze(["any+predict", "fleet"]), REFERENCE = "any+predict", DESIGNATED = "fleet", SIZES = Object.freeze([4, 8]);
export const SECONDS_FLEET = 240, SUB_RADIUS = N.HULL_HALF, CONTACT_XY = 2 * N.HULL_HALF, CONTACT_Z = 5, START = Object.freeze({ xLo: 60, xHi: 440, yLo: 60, yHi: 240, clear: 20, apart: 50, speed: 2.5 });
export const HELD12 = Object.freeze(N.range(1201, 1230)), SETS = Object.freeze({ dev: N.range(1, 10), held12: HELD12 });
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/** A moving disc for the plan from a sub's observed state { x, y, vx, vy }: { type "ship", sub true, x, y, vx, vy, t0, r (SUB_RADIUS), keel Infinity (a full-depth column), group }. */
export const subObstacle = (o, t0, group) => ({ type: "ship", sub: true, group, x: o.x, y: o.y, vx: o.vx, vy: o.vy, t0, r: SUB_RADIUS, keel: Infinity });
/** An obstacle's centre at tank time t: a sub is where it was seen plus its velocity times the time since; the sea's obstacles are subTankNav.sceneAt's. */
export const atFor = (o, t) => (o.sub ? [o.x + o.vx * (t - o.t0), o.y + o.vy * (t - o.t0)] : TN.sceneAt(o, t));

/**
 * A navigator for one sub: subTankNav.createNavigator's goal logic and plan, with the plan's obstacle list extended by `others()` (the other subs as { x, y, vx, vy }) at each replan. `others()` returning [] gives the tank navigator's target tick for tick.
 * step(state, t, dt) -> { depth, heading, speed }; snapshot() is { goal, arrivals, hits (the sea's obstacles only), replans, noRoutePlans, travel }.
 */
export function createFleetNavigator(scene, { seed = 1, others = () => [] } = {}) {
    const rng = mulberry(((seed >>> 0) + 977) >>> 0), u = (lo, hi) => lo + (hi - lo) * rng(), spec = H.ARM_SPEC["any+predict"];
    let goal = null, field = null, planT = -Infinity, clearFor = 0, last = null, arrivals = 0, hits = 0, replans = 0, noRoutePlans = 0, travel = 0, contact = false;
    const clearOf = (o, g) => (o.lane ? N.segmentDistance(g.x, g.y, ...TN.laneSegment(o)) : Math.hypot(g.x - o.x, g.y - o.y)) >= o.r + TN.GOAL_CLEAR;
    const routeFrom = (g, state, t) => {
        const f = H.buildLadderField(H.planShapes({ obstacles: scene.obstacles, minDepth: Math.min(-state.pos[2], g.depth) }, t, { mode: "now", at: TN.sceneAt }), g, { x: state.pos[0], y: state.pos[1] }, { grid: TN.TANK_GRID }), c = N.cellOf(f, state.pos[0], state.pos[1]);
        return !!c && f.dist[c.i] < N.BIG;
    };
    function drawGoal(state, t) {
        let pick = null;
        for (let i = 0; i < TN.GOAL_TRIES; i++) {
            const g = { x: u(TN.GOAL_MARGIN, scene.length - TN.GOAL_MARGIN), y: u(TN.GOAL_MARGIN, scene.width - TN.GOAL_MARGIN), depth: u(TN.DEPTH_MIN + TN.GOAL_DEPTH_INSET, TN.DEPTH_MAX - TN.GOAL_DEPTH_INSET) };
            if (Math.hypot(g.x - state.pos[0], g.y - state.pos[1]) < TN.GOAL_MIN_DIST || !scene.obstacles.every((o) => clearOf(o, g))) continue;
            pick = g;
            if (routeFrom(g, state, t)) break;
        }
        goal = pick || { x: scene.length - TN.GOAL_MARGIN, y: scene.width / 2, depth: (TN.DEPTH_MIN + TN.DEPTH_MAX) / 2 };
        field = null;
    }
    function plan(state, t) {
        const at = { x: state.pos[0], y: state.pos[1] }, obstacles = [...scene.obstacles, ...others().map((o, k) => subObstacle(o, t, 3000 + k))];
        field = H.buildLadderField(H.planShapes({ obstacles, minDepth: Math.min(-state.pos[2], goal.depth) }, t, { mode: "predict", at: atFor }), goal, at, { own: at, grid: TN.TANK_GRID });
        planT = t; replans++;
        const c = N.cellOf(field, at.x, at.y); if (!(c && field.dist[c.i] < N.BIG)) noRoutePlans++;
    }
    return {
        step(state, t, dt) {
            const x = state.pos[0], y = state.pos[1], depth = -state.pos[2];
            if (last) travel += Math.hypot(x - last[0], y - last[1]);
            last = [x, y];
            if (!goal) drawGoal(state, t);
            const gap = scene.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, t, TN.sceneAt)), Infinity);
            if (gap < 0) { if (!contact) { hits++; contact = true; } clearFor = 0; } else if (contact) { clearFor += dt; if (clearFor >= TN.HIT_CLEAR_S) contact = false; }
            if (MT.reached(state, goal)) { arrivals++; drawGoal(state, t); }
            if (field === null || t - planT >= H.REPLAN_S) plan(state, t);
            if (x < 0 || x > scene.length || y < 0 || y > scene.width) return { depth: goal.depth, heading: Math.atan2(-(scene.width / 2 - y), scene.length / 2 - x), speed: 2 };
            return H.hardTarget("any+predict", state, field, goal);
        },
        snapshot() { return { goal: goal ? { ...goal } : null, arrivals, hits, replans, noRoutePlans, travel }; },
    };
}

/** The N start states for a sea and a fleet size: { x, y, depth, heading } each, drawn from a seeded generator, START.clear + r from every static disc and START.apart from each other. Fewer than n when 2000 draws fail (the caller sees it). */
export function fleetStarts(scene, n) {
    const r = mulberry((scene.seed * 40503 + n * 977 + 31) >>> 0), u = (lo, hi) => lo + (hi - lo) * r(), out = [], B = START;
    for (let tries = 0; tries < 2000 && out.length < n; tries++) {
        const p = { x: u(B.xLo, B.xHi), y: u(B.yLo, B.yHi), depth: u(TN.DEPTH_MIN, TN.DEPTH_MAX), heading: u(-Math.PI, Math.PI) };
        if (scene.obstacles.some((o) => (o.lane ? N.segmentDistance(p.x, p.y, ...TN.laneSegment(o)) : Math.hypot(p.x - o.x, p.y - o.y)) < o.r + B.clear)) continue;
        if (out.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < B.apart)) continue;
        out.push(p);
    }
    return out;
}

/**
 * Fly a fleet of n couriers in the sea tankScene(seed) under an arm of FLEET_ARMS for `seconds`. Returns { arm, seed, n, subs (flown), subContacts, seaHits, arrivals, travel (m, summed), plans (summed), noRoutePlans (`fleet` only: summed), lost (subs whose vessel ended: crushed, broached ...) }.
 * `starts` (the gate gives its own: sub contacts at known distances) replaces the drawn starts. A sub contact is two live subs under CONTACT_XY m apart in plan view and CONTACT_Z m apart in depth; a new one for the pair only after TN.HIT_CLEAR_S s clear.
 */
export function flyFleet(pilot, seed, n, armName, { seconds = SECONDS_FLEET, dt = S.DT, model = navModel(), starts: startsGiven = null } = {}) {
    if (!FLEET_ARMS.includes(armName)) throw new Error(`subFleetNav.flyFleet: unknown arm "${armName}" (${FLEET_ARMS.join(", ")})`);
    const scene = TN.tankScene(seed), starts = startsGiven || fleetStarts(scene, n), total = Math.round(seconds / dt), k = starts.length;
    let states = starts.map((p) => S.createState({ pos: [p.x, p.y, -p.depth], speed: START.speed, heading: p.heading, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model }));
    const alive = starts.map(() => true), liveOthers = (me) => states.map((s, j) => (j !== me && alive[j] ? { x: s.pos[0], y: s.pos[1], vx: s.vel[0], vy: s.vel[1] } : null)).filter(Boolean);
    const navs = starts.map((_, j) => (armName === "fleet" ? createFleetNavigator(scene, { seed: (seed * 131 + j) >>> 0, others: () => liveOthers(j) }) : TN.createNavigator(scene, { arm: "any+predict", seed: (seed * 131 + j) >>> 0 })));
    const pair = new Map();
    let subContacts = 0, lost = 0;
    for (let i = 0; i < total; i++) {
        const t = i * dt, next = states.slice();
        for (let j = 0; j < k; j++) {
            if (!alive[j]) continue;
            const target = navs[j].step(states[j], t, dt), cv = ST.currentAt(null, t), cmd = pilot(states[j], target, cv), res = S.stepSub(model, states[j], cmd, dt, cv, 0);
            if (res.status !== "submerged") { alive[j] = false; lost++; continue; }
            next[j] = res.state;
        }
        states = next;
        for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
            if (!alive[a] || !alive[b]) continue;
            const key = a * 1000 + b, st = pair.get(key) || { active: false, clearFor: 0 }, near = Math.hypot(states[a].pos[0] - states[b].pos[0], states[a].pos[1] - states[b].pos[1]) < CONTACT_XY && Math.abs(states[a].pos[2] - states[b].pos[2]) < CONTACT_Z;
            if (near) { if (!st.active) { subContacts++; st.active = true; } st.clearFor = 0; } else if (st.active) { st.clearFor += dt; if (st.clearFor >= TN.HIT_CLEAR_S) st.active = false; }
            pair.set(key, st);
        }
    }
    const snaps = navs.map((nv) => nv.snapshot());
    return { arm: armName, seed, n, subs: k, subContacts, seaHits: snaps.reduce((m, s) => m + s.hits, 0), arrivals: snaps.reduce((m, s) => m + s.arrivals, 0), travel: snaps.reduce((m, s) => m + s.travel, 0), plans: snaps.reduce((m, s) => m + s.replans, 0), noRoutePlans: snaps.reduce((m, s) => m + (s.noRoutePlans || 0), 0), lost };
}
