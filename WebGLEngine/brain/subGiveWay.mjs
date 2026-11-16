// WebGLEngine/brain/subGiveWay.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 6" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subGiveWay-selfcheck.mjs)
//
// GIVE WAY, AND A WAY OUT OF THE EDGE BAND. A copy of brain/subHardNav.mjs's flyHard (which is not edited) that, with both options off, flies `any+predict+edge+yield` bit for bit,
// and two options registered before this file existed:
//   +free     -- a rebuilt plan frees the cells within OWN_CLEAR of the vessel of the EDGE as well as of shapes (so a route starts where the vessel is), and while the vessel stands in
//                the edge band of the plan in force (by geometry: nearer the region's boundary than half-hull + the plan's margin + EDGE_EXTRA) its speed target is YIELD_SPEED.
//   +giveway  -- on a ship conflict (subHardNav.shipConflict, the test +yield uses), the vessel takes the first heading within +-90 deg of the plan's target, in 5 deg steps, nearest
//                first and the smaller heading on a tie, whose straight run at its present speed for HORIZON_S keeps every ship farther than r + half-hull + YIELD_CLEAR and every
//                point half-hull + 3 m inside the region; when none does, the plan's heading at YIELD_SPEED, as +yield.
// Each flight also says what it hit (`hit`: the obstacle type at the collision, null otherwise), so ship collisions can be counted. Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

export const BASE_ARM = "any+predict+edge+yield", ARMS = Object.freeze(["ref", "ref+free", "ref+giveway", "ref+free+giveway"]), DESIGNATED = "ref+free+giveway";
export const STEP_DEG = 5, SPAN_DEG = 90, INSIDE = 3;
export const HELD78 = Object.freeze(N.range(7501, 7560)), DEV = Object.freeze(N.range(1, 30));
const optsOf = (arm) => { if (!ARMS.includes(arm)) throw new Error(`subGiveWay: unknown arm "${arm}" (${ARMS.join(", ")})`); return { free: arm.includes("+free"), giveway: arm.includes("+giveway") }; };

/** buildHardField with `ownEdge`: the cells within OWN_CLEAR of `own` are freed of the edge band too (only when `ownEdge`; otherwise buildHardField's field exactly). */
export function buildFreeField(shapes, goal, { margin = H.MARGIN_HARD, own = null, grid = H.DEFAULT_GRID, edgeExtra = 0, ownEdge = false } = {}) {
    const inflate = N.HULL_HALF + margin, band = inflate + edgeExtra, { x0, y0, w, h } = grid, x1 = x0 + w * N.CELL, y1 = y0 + h * N.CELL, heights = new Float32Array(w * h).fill(N.FREE_H), blocked = new Uint8Array(w * h);
    for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
        const cx = x0 + (gx + 0.5) * N.CELL, cy = y0 + (gy + 0.5) * N.CELL, near = own && Math.hypot(cx - own.x, cy - own.y) <= H.OWN_CLEAR;
        const edge = (cx - x0 < band || x1 - cx < band || cy - y0 < band || y1 - cy < band) && !(ownEdge && near);
        const shape = shapes.some((s) => N.segmentDistance(cx, cy, s.ax, s.ay, s.bx, s.by) <= s.r + inflate) && !near;
        if (edge || shape) { heights[gy * w + gx] = N.BLOCKED_H; blocked[gy * w + gx] = 1; }
    }
    const field = { w, h, cell: N.CELL, x0, y0, margin, blocked };
    const g = N.cellOf(field, goal.x, goal.y), solver = new FlowFieldSolverCPU(null, w, h, { cell: N.CELL, impassDh: N.IMPASS_DH });
    const out = solver.solveSync(heights, [{ gx: g.gx, gy: g.gy }], { wantFlow: true, wantDist: true });
    return { ...field, fx: out.fx, fz: out.fz, dist: out.dist, goalCell: { gx: g.gx, gy: g.gy } };
}
export function buildFreeLadder(shapes, goal, from, { ladder = H.MARGIN_LADDER, own = null, edgeExtra = 0, ownEdge = false } = {}) {
    let f = null;
    for (const m of ladder) { f = buildFreeField(shapes, goal, { margin: m, own, edgeExtra, ownEdge }); const c = N.cellOf(f, from.x, from.y); if (c && f.dist[c.i] < N.BIG) return f; }
    return f;
}
/** Is (x, y) in the edge band of `field` (nearer the region's boundary than half-hull + its margin + edgeExtra)? */
export const inBand = (field, x, y, edgeExtra) => { const b = N.HULL_HALF + field.margin + edgeExtra, R = N.REGION; return x - R.x0 < b || R.x1 - x < b || y - R.y0 < b || R.y1 - y < b; };
/** Does a straight run from the state on heading h at speed v keep every ship clear and stay inside the region for the horizon? */
export function runClear(x, y, h, v, t, obstacles, minDepth, { horizon = H.HORIZON_S, clear = H.YIELD_CLEAR } = {}) {
    const vx = v * Math.cos(h), vy = -v * Math.sin(h), R = N.REGION, m = N.HULL_HALF + INSIDE;
    for (let k = 0; k <= horizon; k++) {
        const px = x + vx * k, py = y + vy * k;
        if (px < R.x0 + m || px > R.x1 - m || py < R.y0 + m || py > R.y1 - m) return false;
        for (const o of obstacles) { if (o.type !== "ship" || !(o.keel + H.VMARGIN > minDepth)) continue; const [ox, oy] = H.posAt(o, t + k); if (Math.hypot(px - ox, py - oy) < o.r + N.HULL_HALF + clear) return false; }
    }
    return true;
}
/** The candidate offsets in degrees, nearest first, the smaller heading first on a tie: 0, -5, +5, -10, +10, ... -90, +90. */
export const OFFSETS = Object.freeze([0, ...Array.from({ length: SPAN_DEG / STEP_DEG }, (_, i) => (i + 1) * STEP_DEG).flatMap((d) => [-d, d])]);
/** The give-way heading for a target, or null when no candidate is clear. */
export function giveWayHeading(state, target, t, obstacles, minDepth) {
    const a = S.attitude(state), x = state.pos[0], y = state.pos[1];
    for (const d of OFFSETS) { const h = target.heading + (d * Math.PI) / 180; if (runClear(x, y, h, a.speed, t, obstacles, minDepth)) return h; }
    return null;
}
export const hitOf = (obstacles, x, y, depth, t) => { let best = null, m = Infinity; for (const o of obstacles) { const g = H.gapTo(o, x, y, depth, t); if (g < m) { m = g; best = o; } } return best ? best.type : null; };
const clearAt = (obstacles, x, y, depth, t) => obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, t)), Infinity);
/** +free's speed rule: in the band of the plan in force, no faster than the yield speed. */
export const freeTarget = (field, x, y, edgeExtra, target, yieldSpeed) => (inBand(field, x, y, edgeExtra) && target.speed > yieldSpeed ? { ...target, speed: yieldSpeed } : target);
/** +giveway's target: the plan's depth and speed on the give-way heading. */
export const giveWayTarget = (plan, heading) => ({ ...plan, heading });
/** A rebuilt plan at time t from the vessel's position (the replanning step of flyHard, with +free's ownEdge). */
export const replanAt = (sc, t, pos, { free = false, edgeExtra = H.EDGE_EXTRA, ladder = H.MARGIN_LADDER, horizon = H.HORIZON_S } = {}) =>
    buildFreeLadder(H.planShapes(sc, t, { mode: "predict", horizon }), sc.goal, pos, { ladder, own: pos, edgeExtra, ownEdge: free });
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/** flyHard for `any+predict+edge+yield`, with the arm's options. Returns flyHard's record plus { hit, freeTicks, giveTicks }. */
export function flyGiveWay(pilot, sc, armName, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, yieldSpeed = H.YIELD_SPEED, horizon = H.HORIZON_S } = {}) {
    const o = optsOf(armName), spec = H.ARM_SPEC[BASE_ARM], total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(H.REPLAN_S / dt));
    let field = buildFreeLadder(H.planShapes(sc, 0, { mode: "predict", horizon }), sc.goal, st, { ladder, edgeExtra: spec.edge }), replans = 0, freeTicks = 0, giveTicks = 0;
    const field0 = field, sc0 = N.cellOf(field, st.x, st.y), noRoute = !(sc0 && field.dist[sc0.i] < N.BIG);
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    let status = "timeout", path = 0, minClear = clearAt(sc.obstacles, st.x, st.y, st.depth, 0), ticks = 0, t = null, hit = null;
    for (let i = 0; i < total; i++) {
        if (i > 0 && i % every === 0) { field = replanAt(sc, i * dt, { x: s.pos[0], y: s.pos[1] }, { free: o.free, edgeExtra: spec.edge, ladder, horizon }); replans++; }
        const ctx = { obstacles: sc.obstacles, t: i * dt, at: H.posAt, minDepth: sc.minDepth, yieldSpeed };
        let target = H.hardTarget(BASE_ARM, s, field, sc.goal, ctx);
        if (o.giveway && H.shipConflict(s, i * dt, sc.obstacles, { at: H.posAt, minDepth: sc.minDepth })) {
            const plan = H.hardTarget(BASE_ARM, s, field, sc.goal, null), hg = giveWayHeading(s, plan, i * dt, sc.obstacles, sc.minDepth);
            if (hg !== null) { target = giveWayTarget(plan, hg); giveTicks++; }
        }
        if (o.free) { const ft = freeTarget(field, s.pos[0], s.pos[1], spec.edge, target, yieldSpeed); if (ft !== target) { target = ft; freeTicks++; } }
        const cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearAt(sc.obstacles, x, y, -s.pos[2], now);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; hit = hitOf(sc.obstacles, x, y, -s.pos[2], now); break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    return { arm: armName, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, shipSpeed: sc.shipSpeed, currentMean: sc.currentMean, blocked: sc.blocked, status, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y),
        minClearance: minClear, ticks, margin: field0 ? field0.margin : null, marginLast: field ? field.margin : null, noRoute, replans, hit, freeTicks, giveTicks };
}
