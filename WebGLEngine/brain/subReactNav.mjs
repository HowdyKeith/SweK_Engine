// WebGLEngine/brain/subReactNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 6" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subReactNav-selfcheck.mjs)
//
// REACTING TRAFFIC FOR THE SUBMARINE'S NAVIGATION TEST. brain/subHardNav.mjs's ships hold course and speed and the planner is TOLD their velocity exactly. Here (1) a ship REACTS to the vessel by a fixed rule -- `react-turn` (a give-way turn to starboard) or `react-stop` (it waits for
// the vessel to pass) -- and (2) the planner can ESTIMATE a ship's velocity from where it has been seen (a two-point finite difference over EST_S) instead of keeping to the ship's original schedule. The scenario is `hardScenario(seed, "hard-traffic")` unchanged; the plan, the field, the yield test,
// the margin ladder and the vessel are subHardNav's, CALLED, not copied, and subHardNav.mjs is not edited. Only the flight loop is written out here, because the ships are no longer a function of the clock alone. With the behaviour `react-none` a flight is the SAME flight as subHardNav.flyHard's (the gate shows the identity).
// OPTIMISTIC, said plainly: the vessel knows where it is, the map is exact, the ships' positions are observed exactly, a ship knows the vessel's exact position and velocity, and the rules are mine. Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const BEHAVIOURS = Object.freeze(["react-none", "react-turn", "react-stop"]);
/** The arms: any+replan (the plan rebuilt with every ship where it is, no prediction), the nominal-belief arm (subHardNav's own any+predict+edge+yield: the ships keep their ORIGINAL schedule) and the estimated-belief arm (the designated one). */
export const REACT_ARMS = Object.freeze(["any+replan", "any+predict+edge+yield", "est+predict+edge+yield"]), DESIGNATED = "est+predict+edge+yield", NOMINAL_ARM = "any+predict+edge+yield";
// the ships' rules and the estimator's window, registered before DEV and not tuned
export const SHIP_CLEAR = 30, SHIP_LOOK_S = 25, TURN_RATE = 0.07, MAX_TURN = 1.05, STOP_ACCEL = 0.5, EST_S = 3;
export const HELD6 = Object.freeze(N.range(601, 660)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held6: HELD6 });
// the arm's name in subHardNav's table: the estimated arm is the nominal one with another belief
const hardArm = (a) => (a === DESIGNATED ? NOMINAL_ARM : a);
const specOf = (a, who) => { if (!REACT_ARMS.includes(a)) throw new Error(`${who}: unknown arm "${a}" (${REACT_ARMS.join(", ")})`); return H.ARM_SPEC[hardArm(a)]; };
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/** The vessel's velocity in the plan (x, y) from its state: speed along the heading, the plan's convention (vx = speed cos h, vy = -speed sin h). */
export function vesselVel(state) { const a = S.attitude(state); return [a.speed * Math.cos(a.heading), -a.speed * Math.sin(a.heading)]; }

/**
 * Do a ship at (sx, sy) moving (svx, svy) and the vessel at (vx, vy) moving (wx, wy), each holding its velocity, come within `r` + half-hull + `clear` of each other at any whole second of the next `look`? (the same sampling as subHardNav.shipConflict, with explicit velocities)
 */
export function conflictBetween(sx, sy, svx, svy, r, vx, vy, wx, wy, { clear = SHIP_CLEAR, look = SHIP_LOOK_S } = {}) {
    for (let k = 0; k <= look; k++) if (Math.hypot(vx + wx * k - (sx + svx * k), vy + wy * k - (sy + svy * k)) < r + N.HULL_HALF + clear) return true;
    return false;
}
/** A ship's state at the start: { x, y, vx, vy (its velocity now), nvx, nvy (its nominal velocity), turned (radians of give-way turn so far) } from a scenario obstacle. */
export const shipStart = (o) => ({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, nvx: o.vx, nvy: o.vy, turned: 0 });
/**
 * One tick of a ship's reaction: the new state after `dt` seconds for the behaviour, given the ship's radius `r` and the vessel's position and velocity. react-none: the ship does not change velocity. react-turn: if the conflict test (at the ship's CURRENT velocity) says yes and the turn so far is under
 * MAX_TURN, the velocity vector rotates clockwise by TURN_RATE * dt (never past MAX_TURN); otherwise the velocity is held. react-stop: the desired velocity is zero when the conflict test at the NOMINAL velocity says yes and the nominal velocity otherwise; the velocity moves toward it by STOP_ACCEL * dt (never past it).
 * The position then advances by the new velocity over dt.
 */
export function stepShip(ship, behaviour, r, vessel, dt) {
    if (!BEHAVIOURS.includes(behaviour)) throw new Error(`subReactNav.stepShip: unknown behaviour "${behaviour}" (${BEHAVIOURS.join(", ")})`);
    let { vx, vy, turned } = ship;
    if (behaviour === "react-turn") {
        if (turned < MAX_TURN && conflictBetween(ship.x, ship.y, vx, vy, r, vessel.x, vessel.y, vessel.vx, vessel.vy)) {
            const th = Math.min(TURN_RATE * dt, MAX_TURN - turned), c = Math.cos(th), s = Math.sin(th);
            [vx, vy] = [vx * c + vy * s, -vx * s + vy * c]; turned += th;
        }
    } else if (behaviour === "react-stop") {
        const stop = conflictBetween(ship.x, ship.y, ship.nvx, ship.nvy, r, vessel.x, vessel.y, vessel.vx, vessel.vy), want = stop ? [0, 0] : [ship.nvx, ship.nvy];
        const dx = want[0] - vx, dy = want[1] - vy, d = Math.hypot(dx, dy), step = STOP_ACCEL * dt;
        if (d <= step) { vx = want[0]; vy = want[1]; } else { vx += dx / d * step; vy += dy / d * step; }
    }
    return { ...ship, vx, vy, turned, x: ship.x + vx * dt, y: ship.y + vy * dt };
}
/** The velocity a planner estimates for a ship from its observed positions: the displacement over the last EST_S seconds divided by EST_S once EST_S seconds have been seen, the nominal velocity before. `history` is the ship's [x, y] at every tick from 0, `i` the current tick, `dt` the tick. */
export function estimateVel(history, i, dt, nominal) {
    const n = Math.round(EST_S / dt);
    if (i < n) return [nominal[0], nominal[1]];
    const a = history[i - n], b = history[i];
    return [(b[0] - a[0]) / EST_S, (b[1] - a[1]) / EST_S];
}

/**
 * Fly one hard-traffic scenario with `pilot` under `armName` (REACT_ARMS) and a ship `behaviour`. Returns subHardNav.flyHard's record with { behaviour, hit (the type of the obstacle a collided flight struck, else null) } added and `arm` the name asked for. A plan is built at t = 0 (the ships where the scenario puts them: identical for every arm and behaviour); it is rebuilt
 * every REPLAN_S from the tick REPLAN_S after the start. The planner's belief about a ship: any+replan the ship where it IS (observed), no velocity; the nominal arm the ship's ORIGINAL schedule (subHardNav.posAt); the estimated arm the observed position moving at the estimated velocity (estimateVel).
 */
export function flyReact(pilot, sc, armName, behaviour, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, yieldSpeed = H.YIELD_SPEED, horizon = H.HORIZON_S } = {}) {
    if (!BEHAVIOURS.includes(behaviour)) throw new Error(`subReactNav.flyReact: unknown behaviour "${behaviour}" (${BEHAVIOURS.join(", ")})`);
    const spec = specOf(armName, "subReactNav.flyReact"), arm = hardArm(armName), est = armName === DESIGNATED, total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(H.REPLAN_S / dt));
    const mode = spec.replan === "predict" ? "predict" : "now", ships = sc.obstacles.map((o) => (o.type === "ship" ? shipStart(o) : null)), hist = sc.obstacles.map((o, k) => (ships[k] ? [[o.x, o.y]] : null));
    const closed = behaviour === "react-none";   // the clock's own positions: the same arithmetic as subHardNav, so the same flights
    let now = 0, tick = 0;
    const idx = new Map(sc.obstacles.map((o, k) => [o, k]));
    const actualAt = (o, tt) => (ships[idx.get(o)] && !closed ? (tt === now ? [ships[idx.get(o)].x, ships[idx.get(o)].y] : H.posAt(o, tt)) : H.posAt(o, tt));
    const beliefAt = (o, tt) => {
        const k = idx.get(o);
        if (!ships[k]) return H.posAt(o, tt);
        if (armName === "any+replan") return actualAt(o, tt);
        if (!est) return H.posAt(o, tt);
        const sh = ships[k], v = estimateVel(hist[k], tick, dt, [sh.nvx, sh.nvy]);
        return [sh.x + v[0] * (tt - now), sh.y + v[1] * (tt - now)];
    };
    const planAt = armName === "any+replan" ? actualAt : beliefAt;
    let field = spec.field ? H.buildLadderField(H.planShapes(sc, 0, { mode, blind: spec.blind, horizon }), sc.goal, st, { ladder, edgeExtra: spec.edge }) : null, replans = 0;
    const field0 = field, sc0 = field ? N.cellOf(field, st.x, st.y) : null, noRoute = field ? !(sc0 && field.dist[sc0.i] < N.BIG) : false;
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt, actualAt)), Infinity);
    let status = "timeout", path = 0, minClear = clearAt(st.x, st.y, st.depth, 0), ticks = 0, t = null, hit = null;
    for (let i = 0; i < total; i++) {
        now = i * dt; tick = i;
        if (spec.replan !== "none" && i > 0 && i % every === 0) { field = H.buildLadderField(H.planShapes(sc, now, { mode, blind: spec.blind, horizon, at: planAt }), sc.goal, { x: s.pos[0], y: s.pos[1] }, { ladder, own: { x: s.pos[0], y: s.pos[1] }, edgeExtra: spec.edge }); replans++; }
        const target = H.hardTarget(arm, s, field, sc.goal, { obstacles: sc.obstacles, t: now, at: planAt, minDepth: sc.minDepth, yieldSpeed }), cv = ST.currentAt(sc.current, now), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1], vel = vesselVel(s), vessel = { x: px, y: py, vx: vel[0], vy: vel[1] };
        s = res.state; ticks++;
        if (!closed) sc.obstacles.forEach((o, k) => { if (ships[k]) { ships[k] = stepShip(ships[k], behaviour, o.r, vessel, dt); hist[k].push([ships[k].x, ships[k].y]); } });
        else sc.obstacles.forEach((o, k) => { if (ships[k]) { const q = H.posAt(o, (i + 1) * dt); ships[k] = { ...ships[k], x: q[0], y: q[1] }; hist[k].push(q); } });
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], nowT = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        now = nowT;
        const clear = clearAt(x, y, -s.pos[2], nowT);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; hit = (sc.obstacles.find((o) => H.gapTo(o, x, y, -s.pos[2], nowT, actualAt) < 0) || {}).type || null; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = nowT; break; }
    }
    return { arm: armName, behaviour, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, shipSpeed: sc.shipSpeed, currentMean: sc.currentMean, blocked: sc.blocked, status, hit, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, ticks, margin: field0 ? field0.margin : null, marginLast: field ? field.margin : null, noRoute, replans };
}
