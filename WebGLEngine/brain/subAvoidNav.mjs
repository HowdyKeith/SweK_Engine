// WebGLEngine/brain/subAvoidNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 8" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subAvoidNav-selfcheck.mjs)
//
// A VESSEL THAT TURNS AWAY FROM A SHIP. brain/subHardNav.mjs's best traffic arm only SLOWS for a ship. Here, every tick, if holding the plan's heading would bring the vessel within r + half-hull + SHIP_CLEAR of a ship in the next SHIP_LOOK_S seconds, the heading is the nearest of h0 +-15, +-30 .. +-90 degrees
// that clears every ship AND every static obstacle (by STATIC_CLEAR) over the same look. The plan, the field and the vessel are subHardNav's, CALLED not copied. OPTIMISTIC, said plainly: the turn is tested as if it were instant, the ships hold course and the planner is told their velocity exactly.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const AVOID_ARMS = Object.freeze(["any+predict+edge+yield", "any+predict+edge+avoid", "any+predict+edge+yield+avoid"]), REFERENCE = "any+predict+edge+yield", DESIGNATED = "any+predict+edge+avoid";
export const SHIP_CLEAR = 30, SHIP_LOOK_S = 25, AVOID_STEP = Math.PI / 12, AVOID_MAX = Math.PI / 2, STATIC_CLEAR = 12;
export const HELD8 = Object.freeze(N.range(801, 860)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held8: HELD8 });
// the arm's name in subHardNav's table, and whether the turn is on
const BASE = Object.freeze({ "any+predict+edge+yield": ["any+predict+edge+yield", false], "any+predict+edge+avoid": ["any+predict+edge", true], "any+predict+edge+yield+avoid": ["any+predict+edge+yield", true],
    "any+predict+edge+avoid-arc": ["any+predict+edge", true, "arc"], "any+predict+edge+avoid-arc-edge": ["any+predict+edge", true, "arc-edge"] });   // FOLLOW-UP 10: candidates also kept off the region's edge   // FOLLOW-UP 9: FOLLOW-UP 8's designated rule, every heading tested along the turning arc
/** FOLLOW-UP 9 (registered first): the arc arm, its reference, the turning radius (subCurrentNav's R_TURN, 35 m) and HELD9. */
export const ARC_ARMS = Object.freeze(["any+predict+edge+avoid", "any+predict+edge+avoid-arc"]), ARC_REFERENCE = "any+predict+edge+avoid", ARC_DESIGNATED = "any+predict+edge+avoid-arc";
export const R_TURN = 35, HELD9 = Object.freeze(N.range(8801, 8860));
/** FOLLOW-UP 10 (registered first): the edge arm, its reference, and HELD10. The edge band is subHardNav's EDGE_EXTRA (20 m). */
export const EDGE_ARMS = Object.freeze(["any+predict+edge+avoid-arc", "any+predict+edge+avoid-arc-edge"]), EDGE_REFERENCE = "any+predict+edge+avoid-arc", EDGE_DESIGNATED = "any+predict+edge+avoid-arc-edge";
export const HELD10 = Object.freeze(N.range(8901, 8960));
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/** The offsets tried, in order: +15, -15, +30, -30 ... +90, -90 degrees (starboard, the plan's positive heading, first). */
export const OFFSETS = Object.freeze((() => { const o = []; for (let k = 1; k * AVOID_STEP <= AVOID_MAX + 1e-12; k++) o.push(k * AVOID_STEP, -k * AVOID_STEP); return o; })());

/** Does holding heading h at speed V from (x, y) at time t come within r + half-hull + SHIP_CLEAR of a ship (or, for a static obstacle, + STATIC_CLEAR) at any whole second 0..SHIP_LOOK_S? Obstacles the vessel passes beneath (keel + VMARGIN not above minDepth) are skipped. */
export function conflictHeading(x, y, t, h, obstacles, minDepth, { V = N.CRUISE, ships = true, statics = false } = {}) {
    const vx = V * Math.cos(h), vy = -V * Math.sin(h);
    for (const o of obstacles) {
        if (!(o.keel + H.VMARGIN > minDepth)) continue;
        const isShip = o.type === "ship";
        if (isShip ? !ships : !statics) continue;
        const clear = o.r + N.HULL_HALF + (isShip ? SHIP_CLEAR : STATIC_CLEAR);
        for (let k = 0; k <= SHIP_LOOK_S; k++) { const [ox, oy] = H.posAt(o, t + k); if (Math.hypot(x + vx * k - ox, y + vy * k - oy) < clear) return true; }
    }
    return false;
}
/** FOLLOW-UP 9: where the vessel is `k` s on, turning from heading `hc` the shorter way to `h` on a circle of radius R_TURN at speed V, then straight on h. */
export function arcPos(x, y, hc, h, k, V = N.CRUISE) {
    let d = h - hc; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (d === 0) return [x + V * k * Math.cos(h), y - V * k * Math.sin(h)];
    const sg = Math.sign(d), w = V / R_TURN, T = Math.abs(d) / w, r = V / (sg * w), at = (tt) => { const psi = hc + sg * w * tt; return [x + r * (Math.sin(psi) - Math.sin(hc)), y + r * (Math.cos(psi) - Math.cos(hc))]; };
    if (k <= T) return at(k);
    const [ex, ey] = at(T), rest = k - T; return [ex + V * rest * Math.cos(h), ey - V * rest * Math.sin(h)];
}
/** FOLLOW-UP 9: conflictHeading's test along the arc from the current heading `hc` (the same obstacles, clearances, depth rule and whole seconds 0..SHIP_LOOK_S). */
export function conflictArc(x, y, t, hc, h, obstacles, minDepth, { V = N.CRUISE, ships = true, statics = false, edge = false } = {}) {
    if (edge) { const R = N.REGION, E = H.EDGE_EXTRA; for (let k = 0; k <= SHIP_LOOK_S; k++) { const [px, py] = arcPos(x, y, hc, h, k, V); if (px < R.x0 + E || px > R.x1 - E || py < R.y0 + E || py > R.y1 - E) return true; } }   // FOLLOW-UP 10
    for (const o of obstacles) {
        if (!(o.keel + H.VMARGIN > minDepth)) continue;
        const isShip = o.type === "ship";
        if (isShip ? !ships : !statics) continue;
        const clear = o.r + N.HULL_HALF + (isShip ? SHIP_CLEAR : STATIC_CLEAR);
        for (let k = 0; k <= SHIP_LOOK_S; k++) { const [ox, oy] = H.posAt(o, t + k), [px, py] = arcPos(x, y, hc, h, k, V); if (Math.hypot(px - ox, py - oy) < clear) return true; }
    }
    return false;
}
/** FOLLOW-UP 9: avoidHeading with every test along the arc from the current heading hc; the same offsets, order and stuck rule. */
export function avoidHeadingArc(x, y, t, hc, h0, obstacles, minDepth, { edge = false } = {}) {   // edge: FOLLOW-UP 10 -- candidates (not the trigger) also refused within EDGE_EXTRA of the region's edge
    if (!conflictArc(x, y, t, hc, h0, obstacles, minDepth)) return { heading: h0, fired: false, turned: false, stuck: false };
    for (const d of OFFSETS) {
        const h = h0 + d;
        if (!conflictArc(x, y, t, hc, h, obstacles, minDepth, { ships: true, statics: true, edge })) return { heading: h, fired: true, turned: true, stuck: false };
    }
    return { heading: h0, fired: true, turned: false, stuck: true };
}
/** The heading to fly: { heading, fired (h0 conflicts with a ship), turned (a candidate was taken), stuck (fired and none qualified) }. */
export function avoidHeading(x, y, t, h0, obstacles, minDepth) {
    if (!conflictHeading(x, y, t, h0, obstacles, minDepth)) return { heading: h0, fired: false, turned: false, stuck: false };
    for (const d of OFFSETS) {
        const h = h0 + d;
        if (!conflictHeading(x, y, t, h, obstacles, minDepth, { ships: true, statics: true })) return { heading: h, fired: true, turned: true, stuck: false };
    }
    return { heading: h0, fired: true, turned: false, stuck: true };
}

/** Fly one hard-traffic scenario under an arm of AVOID_ARMS; the record of flyHard plus { fires, turns, stuck, hit }. */
export function flyAvoid(pilot, sc, armName, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, yieldSpeed = H.YIELD_SPEED, horizon = H.HORIZON_S } = {}) {
    if (!BASE[armName]) throw new Error(`subAvoidNav.flyAvoid: unknown arm "${armName}" (${[...AVOID_ARMS, ARC_DESIGNATED, EDGE_DESIGNATED].join(", ")})`);
    const [arm, turn, how] = BASE[armName], spec = H.ARM_SPEC[arm], total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(H.REPLAN_S / dt)), mode = "predict";
    let field = H.buildLadderField(H.planShapes(sc, 0, { mode, blind: false, horizon }), sc.goal, st, { ladder, edgeExtra: spec.edge }), replans = 0;
    const field0 = field, sc0 = N.cellOf(field, st.x, st.y), noRoute = !(sc0 && field.dist[sc0.i] < N.BIG);
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt)), Infinity);
    let status = "timeout", path = 0, minClear = clearAt(st.x, st.y, st.depth, 0), ticks = 0, t = null, hit = null, fires = 0, turns = 0, stuck = 0;
    for (let i = 0; i < total; i++) {
        if (i > 0 && i % every === 0) { field = H.buildLadderField(H.planShapes(sc, i * dt, { mode, blind: false, horizon }), sc.goal, { x: s.pos[0], y: s.pos[1] }, { ladder, own: { x: s.pos[0], y: s.pos[1] }, edgeExtra: spec.edge }); replans++; }
        let target = H.hardTarget(arm, s, field, sc.goal, { obstacles: sc.obstacles, t: i * dt, at: H.posAt, minDepth: sc.minDepth, yieldSpeed });
        if (turn) {
            const a = how === "arc" || how === "arc-edge" ? avoidHeadingArc(s.pos[0], s.pos[1], i * dt, S.attitude(s).heading, target.heading, sc.obstacles, sc.minDepth, { edge: how === "arc-edge" }) : avoidHeading(s.pos[0], s.pos[1], i * dt, target.heading, sc.obstacles, sc.minDepth);
            if (a.fired) fires++; if (a.turned) turns++; if (a.stuck) stuck++;
            target = { ...target, heading: a.heading };
        }
        const cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError), px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearAt(x, y, -s.pos[2], now);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; hit = (sc.obstacles.find((o) => H.gapTo(o, x, y, -s.pos[2], now) < 0) || {}).type || null; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    return { arm: armName, kind: sc.kind, seed: sc.seed, shipSpeed: sc.shipSpeed, status, hit, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, ticks, margin: field0.margin, noRoute, replans, fires, turns, stuck };
}
