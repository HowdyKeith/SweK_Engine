// WebGLEngine/brain/subHardNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 3" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subHardNav-selfcheck.mjs)
//
// THE HARDER NAVIGATION TEST FOR THE SUBMARINE: islands (blobs of overlapping discs), icebergs (a disc with a KEEL: the vessel passes beneath one that is shallower than it flies), a wall with one narrow GAP, TRAFFIC (other
// vessels moving at constant velocity on courses that cross the vessel's track) and a strong current the field does not know -- on top of brain/subFieldNav.mjs's region, vessel, autopilot, field solver and any-angle aim points, none of
// which is edited. Four kinds: hard-islands, hard-gaps, hard-traffic, hard-current. Six arms: straight; smooth+approach (the incumbent); any (a plan built once at t = 0); any-blind (every iceberg blocks); any+replan (the plan rebuilt every REPLAN_S
// with the ships where they are); any+predict (rebuilt with each ship as the capsule it will sweep in the next HORIZON_S). The REGION'S EDGE IS BLOCKED in every field here (follow-up 2 left that open).
// OPTIMISTIC, said plainly: THE VESSEL KNOWS WHERE IT IS, THE MAP IS EXACT, THE SHIPS' VELOCITIES ARE KNOWN AND CONSTANT, AND THE SHIPS DO NOT REACT TO THE VESSEL. The current is not in the field.
// Pure: no DOM, no clock, no Math.random (a scenario is a function of its seed and kind).
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

export const HARD_KINDS = Object.freeze(["hard-islands", "hard-gaps", "hard-traffic", "hard-current"]);
export const HARD_ARMS = Object.freeze(["straight", "smooth+approach", "any", "any-blind", "any+replan", "any+predict"]);
/** The arms flown in each kind. Where there are no ships `any+replan` and `any+predict` are the same flights as `any`, so they are not flown; where there are no icebergs `any-blind` is the same flight as `any`. */
export const ARMS_OF = Object.freeze({
    "hard-islands": Object.freeze(["straight", "smooth+approach", "any", "any-blind"]), "hard-gaps": Object.freeze(["straight", "smooth+approach", "any"]),
    "hard-traffic": Object.freeze(["straight", "smooth+approach", "any", "any+replan", "any+predict"]), "hard-current": Object.freeze(["straight", "smooth+approach", "any", "any-blind"]),
});
export const DESIGNATED = Object.freeze({ "hard-islands": "any", "hard-gaps": "any", "hard-traffic": "any+predict", "hard-current": "any" });
export const BARS = Object.freeze({ "hard-islands": 0.9, "hard-gaps": 0.8, "hard-traffic": 0.8, "hard-current": 0.8 }), ISLAND_MAX_COLLISIONS = 3;
export const VMARGIN = 5, VRADIUS = 0.6;   // the planner blocks an iceberg when keel + VMARGIN exceeds the shallower of the start depth and the waypoint depth; the vessel's top is VRADIUS above its depth
export const REPLAN_S = 3, HORIZON_S = 30, OWN_CLEAR = 15, SECONDS_HARD = 260, TRACK_S = SECONDS_HARD + HORIZON_S;
export const GAP_WIDTHS = Object.freeze([24, 32, 40]), SHIP_FAST = 2, CURRENT_STRONG = 1.0, MARGIN_HARD = 12;
// THE MARGIN LADDER (Amendment 1 of FOLLOW-UP 3, made on DEV before HELD4 was read): a field arm builds its plan at the first margin of the ladder that leaves a route from the vessel's cell, 12 m first (the amended margin of follow-up 1) and smaller when the wide one closes the way
export const MARGIN_LADDER = Object.freeze([12, 8, 6, 3]);
export const HARD_SETS = Object.freeze({ dev: N.range(1, 30), held4: N.range(401, 460) });

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const segD = N.segmentDistance;

/** An obstacle's centre at time t (seconds): static ones do not move. */
export const posAt = (o, t) => [o.x + o.vx * t, o.y + o.vy * t];

/**
 * A scenario: { seed, kind, start, goal, minDepth, obstacles [{ type ("island" | "berg" | "wall" | "ship"), group (the members of one island share it, as do the discs of the wall), x, y, r, keel (Infinity: full depth), vx, vy }], gapWidth (hard-gaps; else null), shipSpeed (the fastest ship; 0 without ships), currentMean (the
 * horizontal mean current, m/s; 0 without), blocked (the straight line to the waypoint passes within r + 14 m of a STATIC obstacle's centre), current, weightError }.
 */
export function hardScenario(seed, kind) {
    if (!HARD_KINDS.includes(kind)) throw new Error(`subHardNav.hardScenario: unknown kind "${kind}" (${HARD_KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + HARD_KINDS.indexOf(kind) * 104729 + 5011) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const start = { x: u(0, 20), y: u(-40, 40), depth: u(20, 30), speed: u(2, 3), pitch: u(-0.05, 0.05), bank: u(-0.08, 0.08), heading: 0 };
    const goal = { x: u(360, 400), y: u(-80, 80), depth: u(15, 40) };
    const minDepth = Math.min(start.depth, goal.depth), obstacles = [];
    const stat = (type, x, y, rad, keel, group) => ({ type, group, x, y, r: rad, keel, vx: 0, vy: 0 });
    // a member disc may stand if it is r + 40 from the start and the waypoint and 24 m of water from every disc of ANOTHER group
    const fits = (d, group, placed) => Math.hypot(d.x - goal.x, d.y - goal.y) >= d.r + 40 && Math.hypot(d.x - start.x, d.y - start.y) >= d.r + 40 && placed.every((p) => p.group === group || Math.hypot(d.x - p.x, d.y - p.y) >= d.r + p.r + 24);
    const place = (nIsland, nBerg) => {
        const placed = [];
        let g = 0;
        for (let tries = 0; tries < 3000 && g < nIsland; tries++) {
            const r1 = u(14, 24), main = { x: u(90, 310), y: u(-110, 110), r: r1 }, members = [main], nSat = 1 + Math.floor(r() * 2);
            for (let k = 0; k < nSat; k++) { const r2 = u(8, 16), ang = u(0, 2 * Math.PI), dist = (r1 + r2) * u(0.6, 0.9); members.push({ x: main.x + dist * Math.cos(ang), y: main.y + dist * Math.sin(ang), r: r2 }); }
            if (members.every((d) => fits(d, g, placed))) { for (const d of members) placed.push({ ...d, group: g, type: "island", keel: Infinity }); g++; }
        }
        for (let tries = 0, b = 0; tries < 3000 && b < nBerg; tries++) {
            const d = { x: u(90, 310), y: u(-110, 110), r: u(14, 28) }, keel = u(6, 36);
            if (fits(d, 1000 + b, placed)) { placed.push({ ...d, group: 1000 + b, type: "berg", keel }); b++; }
        }
        return placed.map((p) => stat(p.type, p.x, p.y, p.r, p.keel, p.group));
    };
    let current = null, weightError = 0, gapWidth = null;
    if (kind === "hard-islands" || kind === "hard-current") {
        const nI = 2 + Math.floor(r() * 3), nB = 2 + Math.floor(r() * 3);
        obstacles.push(...place(nI, nB));
        if (kind === "hard-current") {
            const mean = [u(-1.2, 1.2), u(-1.2, 1.2), u(-0.05, 0.05)], amp = [u(0.2, 0.5), u(0.2, 0.5), u(0.02, 0.06)];
            current = Object.freeze({ mean, amp, freq: [[u(0.1, 0.25), u(0.5, 0.9)], [u(0.1, 0.25), u(0.5, 0.9)], [u(0.15, 0.3), u(0.6, 1.0)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] });
            weightError = u(-0.006, 0.006);
        }
    } else if (kind === "hard-gaps") {
        gapWidth = GAP_WIDTHS[seed % GAP_WIDTHS.length];
        const wx = u(150, 250), gy = u(-55, 55);
        for (const sign of [1, -1]) {
            let rad = u(20, 26), y = gy + sign * (gapWidth / 2 + rad);
            for (;;) {
                obstacles.push(stat("wall", wx, y, rad, Infinity, 3000));
                if (Math.abs(y) >= 140) break;
                const next = u(20, 26); y += sign * 0.8 * (rad + next); rad = next;
            }
        }
    } else {   // hard-traffic
        obstacles.push(...place(0, 2 + Math.floor(r() * 2)));
        const L = Math.hypot(goal.x - start.x, goal.y - start.y), dir = [(goal.x - start.x) / L, (goal.y - start.y) / L], nrm = [-dir[1], dir[0]], nShips = 2 + Math.floor(r() * 3), statics = obstacles.slice();
        for (let tries = 0, made = 0; tries < 400 && made < nShips; tries++) {
            const rad = u(8, 14), speed = u(0.8, 3.0), tm = u(20, 110), side = r() < 0.5 ? -1 : 1, th = u(-1, 1) * Math.PI / 3, keel = u(18, 60);
            const along = Math.min(tm * MT.CRUISE, L), ex = start.x + dir[0] * along + dir[0] * u(-30, 30) + nrm[0] * u(-30, 30), ey = start.y + dir[1] * along + dir[1] * u(-30, 30) + nrm[1] * u(-30, 30);
            const hx = side * (nrm[0] * Math.cos(th) - nrm[1] * Math.sin(th)), hy = side * (nrm[0] * Math.sin(th) + nrm[1] * Math.cos(th)), vx = hx * speed, vy = hy * speed, x0 = ex - vx * tm, y0 = ey - vy * tm;
            if (x0 < -200 || x0 > 600 || Math.abs(y0) > 400) continue;
            if (Math.hypot(x0 - start.x, y0 - start.y) < rad + 50) continue;
            if (segD(goal.x, goal.y, x0, y0, x0 + vx * TRACK_S, y0 + vy * TRACK_S) < rad + 40) continue;
            if (statics.some((s) => segD(s.x, s.y, x0, y0, x0 + vx * TRACK_S, y0 + vy * TRACK_S) < rad + s.r + 6)) continue;
            obstacles.push({ type: "ship", group: 2000 + made, x: x0, y: y0, r: rad, keel, vx, vy }); made++;
        }
    }
    const frozen = obstacles.map((o) => Object.freeze(o));
    const staticDiscs = frozen.filter((o) => o.vx === 0 && o.vy === 0);
    return Object.freeze({
        seed, kind, start: Object.freeze(start), goal: Object.freeze(goal), minDepth, obstacles: Object.freeze(frozen), gapWidth,
        shipSpeed: frozen.reduce((m, o) => (o.type === "ship" ? Math.max(m, Math.hypot(o.vx, o.vy)) : m), 0), currentMean: current ? Math.hypot(current.mean[0], current.mean[1]) : 0,
        blocked: N.isBlocked(start, goal, staticDiscs), current, weightError,
    });
}

/** The obstacle shapes a plan blocks, as capsules { ax, ay, bx, by, r } (a disc is a capsule of zero length). `mode` "now": each obstacle where it is at time t; "predict": a moving one as the capsule it sweeps in the next HORIZON_S at its velocity. `blind`: every iceberg blocks. */
export function planShapes(sc, t, { mode = "now", blind = false } = {}) {
    if (mode !== "now" && mode !== "predict") throw new Error(`subHardNav.planShapes: unknown mode "${mode}" (now, predict)`);
    const out = [];
    for (const o of sc.obstacles) {
        if (!((blind && o.type === "berg") || o.keel + VMARGIN > sc.minDepth)) continue;   // (a full-depth obstacle has keel Infinity: it always blocks)
        const [x, y] = posAt(o, t), p = mode === "predict" ? posAt(o, t + HORIZON_S) : [x, y];
        out.push({ ax: x, ay: y, bx: p[0], by: p[1], r: o.r });
    }
    return out;
}

/**
 * The field for a set of shapes and the waypoint at `margin` m beyond the half-hull: the same object brain/subFieldNav.mjs's buildField returns (so its aim points and headings read it), with the REGION'S EDGE BLOCKED -- a cell whose centre is within
 * half-hull + margin of the boundary -- and, when `own` ({ x, y }) is given, no cell within OWN_CLEAR of that point blocked by a SHAPE (the edge stays blocked).
 */
export function buildHardField(shapes, goal, { margin = MARGIN_HARD, own = null } = {}) {
    const inflate = N.HULL_HALF + margin, w = N.GRID_W, h = N.GRID_H, R = N.REGION, heights = new Float32Array(w * h).fill(N.FREE_H), blocked = new Uint8Array(w * h);
    for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
        const cx = R.x0 + (gx + 0.5) * N.CELL, cy = R.y0 + (gy + 0.5) * N.CELL;
        const edge = cx - R.x0 < inflate || R.x1 - cx < inflate || cy - R.y0 < inflate || R.y1 - cy < inflate;
        const shape = shapes.some((s) => segD(cx, cy, s.ax, s.ay, s.bx, s.by) <= s.r + inflate) && !(own && Math.hypot(cx - own.x, cy - own.y) <= OWN_CLEAR);
        if (edge || shape) { heights[gy * w + gx] = N.BLOCKED_H; blocked[gy * w + gx] = 1; }
    }
    const field = { w, h, cell: N.CELL, x0: R.x0, y0: R.y0, margin, blocked };
    const g = N.cellOf(field, goal.x, goal.y), solver = new FlowFieldSolverCPU(null, w, h, { cell: N.CELL, impassDh: N.IMPASS_DH });
    const out = solver.solveSync(heights, [{ gx: g.gx, gy: g.gy }], { wantFlow: true, wantDist: true });
    return { ...field, fx: out.fx, fz: out.fz, dist: out.dist, goalCell: { gx: g.gx, gy: g.gy } };
}

/** The plan at the first margin of the ladder that leaves a route from `from` ({ x, y }): the field and the margin it was built at; the last margin's field (with no route) when none does. */
export function buildLadderField(shapes, goal, from, { ladder = MARGIN_LADDER, own = null } = {}) {
    let f = null;
    for (const m of ladder) {
        f = buildHardField(shapes, goal, { margin: m, own });
        const c = N.cellOf(f, from.x, from.y);
        if (c && f.dist[c.i] < N.BIG) return f;
    }
    return f;
}

/** What each arm is: { field (is a plan built), head ("smooth" | "any"), approach, blind, replan ("none" | "now" | "predict") }. */
export const ARM_SPEC = Object.freeze({
    straight: Object.freeze({ field: false, head: null, approach: false, blind: false, replan: "none" }), "smooth+approach": Object.freeze({ field: true, head: "smooth", approach: true, blind: false, replan: "none" }),
    any: Object.freeze({ field: true, head: "any", approach: false, blind: false, replan: "none" }), "any-blind": Object.freeze({ field: true, head: "any", approach: false, blind: true, replan: "none" }),
    "any+replan": Object.freeze({ field: true, head: "any", approach: false, blind: false, replan: "now" }), "any+predict": Object.freeze({ field: true, head: "any", approach: false, blind: false, replan: "predict" }),
});
const specOf = (arm, who) => { if (!HARD_ARMS.includes(arm)) throw new Error(`${who}: unknown arm "${arm}" (${HARD_ARMS.join(", ")})`); return ARM_SPEC[arm]; };

/** The target (depth, heading, speed) an arm gives the autopilot at a state: the waypoint's depth and the cruise speed always; the heading by the arm (the aim point's bearing, or the smooth field's with the 30 m straight approach; the straight bearing when the plan gives none). */
export function hardTarget(arm, state, field, goal) {
    const spec = specOf(arm, "subHardNav.hardTarget"), straight = MT.waypointTarget(state, goal, N.CRUISE);
    if (!spec.field) return straight;
    const x = state.pos[0], y = state.pos[1];
    let h;
    if (spec.head === "any") { h = N.aimHeading(field, N.aimOf(field, goal), x, y); if (h === null) h = N.fieldHeading(field, x, y, "cell"); }
    else { if (spec.approach && Math.hypot(goal.x - x, goal.y - y) <= N.ARRIVAL_RADIUS) return straight; h = N.fieldHeading(field, x, y, "smooth"); }
    return h === null ? straight : { ...straight, heading: h };
}

/** The gap from the vessel (x, y, depth) to an obstacle at time t, less the obstacle's radius and the half-hull; Infinity when the vessel is BELOW its keel (top of the vessel at or under the keel). */
export function gapTo(o, x, y, depth, t) {
    if (depth - VRADIUS >= o.keel) return Infinity;
    const [ox, oy] = posAt(o, t);
    return Math.hypot(x - ox, y - oy) - o.r - N.HULL_HALF;
}
const clearAt = (obstacles, x, y, depth, t) => obstacles.reduce((m, o) => Math.min(m, gapTo(o, x, y, depth, t)), Infinity);

let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));

/**
 * Fly one hard scenario with `pilot` under `arm`. Returns { arm, kind, seed, gap, shipSpeed, currentMean, blocked, status ("reached" | "collided" | "left" | "timeout" | the vessel's own), reached, t, path, chord, minClearance, ticks, margin, noRoute, replans }.
 * A plan is built at t = 0 (ships at their t = 0 positions); the replanning arms rebuild it every REPLAN_S seconds, from the tick REPLAN_S after the start, for the shapes at that time (and, for predict, their next HORIZON_S) with the vessel's own surroundings free.
 */
export function flyHard(pilot, sc, arm, { seconds = SECONDS_HARD, dt = S.DT, model = navModel(), ladder = MARGIN_LADDER } = {}) {
    const spec = specOf(arm, "subHardNav.flyHard"), total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(REPLAN_S / dt));
    const mode = spec.replan === "predict" ? "predict" : "now";
    let field = spec.field ? buildLadderField(planShapes(sc, 0, { mode, blind: spec.blind }), sc.goal, st, { ladder }) : null, replans = 0;
    const field0 = field, sc0 = field ? N.cellOf(field, st.x, st.y) : null, noRoute = field ? !(sc0 && field.dist[sc0.i] < N.BIG) : false;
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    let status = "timeout", path = 0, minClear = clearAt(sc.obstacles, st.x, st.y, st.depth, 0), ticks = 0, t = null;
    for (let i = 0; i < total; i++) {
        if (spec.replan !== "none" && i > 0 && i % every === 0) { field = buildLadderField(planShapes(sc, i * dt, { mode, blind: spec.blind }), sc.goal, { x: s.pos[0], y: s.pos[1] }, { ladder, own: { x: s.pos[0], y: s.pos[1] } }); replans++; }
        const target = hardTarget(arm, s, field, sc.goal), cv = ST.currentAt(sc.current, i * dt), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1];
        s = res.state; ticks++;
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], now = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        const clear = clearAt(sc.obstacles, x, y, -s.pos[2], now);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = now; break; }
    }
    return { arm, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, shipSpeed: sc.shipSpeed, currentMean: sc.currentMean, blocked: sc.blocked, status, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y), minClearance: minClear, ticks, margin: field0 ? field0.margin : null, noRoute, replans };
}

/** The scenarios of a set: its seeds of each kind (HARD_KINDS order), frozen. */
export const hardSetOf = (name) => { if (!HARD_SETS[name]) throw new Error(`subHardNav.hardSetOf: unknown set "${name}" (${Object.keys(HARD_SETS).join(", ")})`); return Object.freeze(HARD_KINDS.flatMap((k) => HARD_SETS[name].map((s) => hardScenario(s, k)))); };

/** Every scenario's arms (ARMS_OF its kind), scenario-major: the list of flyHard results. */
export function evaluateHard(pilot, scenarios, opts = {}) {
    const runs = [];
    for (const sc of scenarios) for (const arm of ARMS_OF[sc.kind]) runs.push(flyHard(pilot, sc, arm, opts));
    return runs;
}
